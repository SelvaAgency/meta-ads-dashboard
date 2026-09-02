/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  A rodada do LinkedIn — todas as Páginas vinculadas, uma por vez
 * ─────────────────────────────────────────────────────────────────────────────
 *  ── Por que nasce DESLIGADA ────────────────────────────────────────────────
 *  `LINKEDIN_COLETA_ENABLED` precisa valer "true" para o cron rodar. É a mesma
 *  trava fail-safe do envio de e-mail, e pelo mesmo motivo: a cota do LinkedIn é
 *  diária, por app, e INVISÍVEL — nenhuma resposta traz cabeçalho de limite.
 *
 *  Um cron que nasce ligado começaria a gastar essa cota antes de alguém ter
 *  olhado o primeiro resultado, e o estouro apareceria como silêncio da API, não
 *  como erro. Ligar é uma decisão de uma variável; desligar depois de um estouro
 *  é esperar o dia virar.
 *
 *  ── Falhar numa Página não derruba as outras ───────────────────────────────
 *  Cada Página é um try próprio. Acesso revogado num cliente não pode custar o
 *  dia dos demais.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { linkedinColetaExecucoes, linkedinPages } from "../../drizzle/schema";
import { logger } from "../logger";
import { coletarPaginaLinkedIn } from "./coletaLinkedIn";
import { tokenSocial } from "../db";
import { TETO_DE_CHAMADAS_POR_RODADA } from "@shared/linkedinPlanoDeColeta";

export const coletaDoLinkedInLigada = (): boolean =>
  String(process.env.LINKEDIN_COLETA_ENABLED ?? "").toLowerCase() === "true";

/** Uma rodada em andamento recusa a segunda — nunca duas em paralelo. */
let emAndamento: string | null = null;
export const rodadaLinkedInEmAndamento = () => emAndamento;

export interface ResultadoDaRodadaLinkedIn {
  dia: string;
  tentados: number; ok: number; parciais: number; erros: number;
  chamadas: number; pulados: number;
  motivo?: string;
}

export async function rodarColetaLinkedIn(o: {
  modo?: "incremental" | "semanal"; origem?: "cron" | "manual"; agora?: Date;
} = {}): Promise<ResultadoDaRodadaLinkedIn> {
  const agora = o.agora ?? new Date();
  const dia = agora.toISOString().slice(0, 10);
  const base: ResultadoDaRodadaLinkedIn = {
    dia, tentados: 0, ok: 0, parciais: 0, erros: 0, chamadas: 0, pulados: 0,
  };

  if (emAndamento) return { ...base, motivo: `rodada em andamento desde ${emAndamento}` };
  if (o.origem !== "manual" && !coletaDoLinkedInLigada()) {
    return { ...base, motivo: "LINKEDIN_COLETA_ENABLED não está ligado" };
  }

  const token = await tokenSocial("linkedin");
  if (!token) return { ...base, motivo: "sem credencial de LinkedIn" };

  const db = await getDb();
  if (!db) return { ...base, motivo: "banco indisponível" };

  const paginas = await db.select().from(linkedinPages).where(eq(linkedinPages.ativo, true));
  if (!paginas.length) return { ...base, motivo: "nenhuma Página vinculada" };

  emAndamento = agora.toISOString();
  const t0 = Date.now();
  const modo = o.modo ?? (agora.getUTCDay() === 0 ? "semanal" : "incremental");
  const detalhe: Array<Record<string, unknown>> = [];

  try {
    for (const p of paginas) {
      // Teto da rodada: sem cabeçalho de cota, é a única proteção. O que fica
      // de fora é REGISTRADO, e não simplesmente omitido.
      if (base.chamadas >= TETO_DE_CHAMADAS_POR_RODADA) {
        base.pulados++;
        detalhe.push({ pagina: p.nome ?? p.organizationId, pulada: "teto de chamadas da rodada" });
        continue;
      }
      base.tentados++;
      try {
        const r = await coletarPaginaLinkedIn({
          token, modo,
          alvo: { id: p.id, organizationId: p.organizationId, organizationUrn: p.organizationUrn },
          agora,
        });
        base.chamadas += r.chamadas;
        if (r.status === "completo") base.ok++;
        else if (r.status === "parcial") base.parciais++;
        else base.erros++;
        detalhe.push({
          pagina: p.nome ?? p.organizationId, status: r.status,
          chamadas: r.chamadas, registros: r.registros,
        });
      } catch (e) {
        base.erros++;
        const msg = e instanceof Error ? e.message : String(e);
        detalhe.push({ pagina: p.nome ?? p.organizationId, erro: msg.slice(0, 300) });
        logger.warn("[linkedin] falha numa Página", { pageId: p.id, erro: msg.slice(0, 300) });
      }
    }

    await db.insert(linkedinColetaExecucoes).values({
      origem: o.origem ?? "cron", escopo: modo, dia,
      tentados: base.tentados, ok: base.ok, parciais: base.parciais, erros: base.erros,
      chamadas: base.chamadas, registrosGravados: 0,
      duracaoMs: Date.now() - t0,
      detalheJson: { paginas: detalhe, pulados: base.pulados } as never,
    });
    logger.info("[linkedin] rodada concluída", { ...base, modo });
    return base;
  } finally {
    emAndamento = null;
  }
}
