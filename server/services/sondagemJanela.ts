/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Que JANELA cada número cobre
 * ─────────────────────────────────────────────────────────────────────────────
 *  Sondagem. A observação que a motivou: 136 visitas no dia 12 medidas às 17h,
 *  contra 34 no dia 13 medidas às 12h. O padrão é de acumulado do dia corrente
 *  — e se for isso, a coleta das 06:20 captura ~6h de um dia de 24h e chama
 *  isso de "o dia".
 *
 *  ── Duas métricas com problemas DIFERENTES ─────────────────────────────────
 *  A distinção importa porque muda o que precisa de conserto:
 *
 *    FLUXO (profile_views, clicks, interações)
 *      A Meta escopa por dia. Às 06:20 o número é 00:00→06:20, e é genuinamente
 *      truncado. Chamar de "resultado do dia" é falso.
 *
 *    ESTOQUE (followers_count)
 *      É uma fotografia. A diferença entre 06:20 de ontem e 06:20 de hoje cobre
 *      24 horas INTEIRAS — só não são as do calendário. O número está certo; o
 *      rótulo "ganhou no dia 12" é que está errado.
 *
 *    Ou seja: um é erro de medição, o outro é erro de nome. Só o primeiro exige
 *    mudar quando a coleta acontece.
 *
 *  ── A pergunta que pode dispensar a coleta noturna ─────────────────────────
 *  Se a API aceitar `since`/`until` e devolver dias FECHADOS, a coleta da manhã
 *  passa a buscar o dia ANTERIOR — completo — e não é preciso rodar às 23:50.
 *  Isso seria melhor que a coleta de fechamento: sem janela para perder, e com
 *  buraco preenchível depois. É a hipótese que esta sondagem testa primeiro.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { sanitizar } from "./instagram";
import type { Consultar } from "./instagramSondagem";

export interface LeituraDeJanela {
  forma: string;
  respondeu: boolean;
  /** Quantos pontos vieram — mais de um significa série por dia. */
  pontos: number;
  /** O `end_time` de cada ponto: é ele que revela a janela coberta. */
  fins: string[];
  valores: Array<number | null>;
  detalhe: string;
}

export interface SondagemDeJanela {
  metrica: string;
  leituras: LeituraDeJanela[];
  /** Alguma forma devolveu dia fechado do passado? */
  aceitaDiasFechados: boolean;
  /**
   * O fuso em que o DIA da métrica vira, deduzido do `end_time`.
   *
   * Nenhum horário de coleta pode ser escolhido antes disto: "meia-noite" não
   * quer dizer nada sem saber de quem. Se as janelas fecham às 03:00 UTC, o dia
   * da conta vira às 00:00 de UTC−3 — e uma coleta às 23:50 de Brasília cairia
   * DEZ MINUTOS antes da virada, o que funciona por acidente e quebra no dia em
   * que a conta mudar de fuso.
   */
  fusoDoDia: string | null;
  texto: string;
}

/**
 * De que fuso é a meia-noite que fecha estas janelas.
 *
 * `end_time` chega em UTC. Se ele marca sempre a mesma hora — digamos 03:00 —
 * então a meia-noite da conta é 03:00 UTC, ou seja, UTC−3.
 */
function deduzirFuso(fins: string[]): string | null {
  const horas = new Set<number>();
  for (const f of fins) {
    const d = new Date(f);
    if (Number.isNaN(d.getTime())) continue;
    horas.add(d.getUTCHours());
  }
  if (horas.size !== 1) return null;
  const h = Array.from(horas)[0];
  // 03:00 UTC fechando o dia ⇒ meia-noite em UTC−3.
  const desloc = h === 0 ? 0 : 24 - h;
  return `UTC${desloc === 0 ? "±0" : `−${desloc}`} (janelas fecham às ${String(h).padStart(2, "0")}:00 UTC)`;
}

const dia = (d: Date) => d.toISOString().slice(0, 10);
const unix = (d: Date) => String(Math.floor(d.getTime() / 1000));

export async function sondarJanela(
  consultar: Consultar,
  base: string,
  metrica = "profile_views",
  agora = new Date(),
): Promise<SondagemDeJanela> {
  const ontem = new Date(agora.getTime() - 86_400_000);
  const anteontem = new Date(agora.getTime() - 2 * 86_400_000);

  const formas: Array<{ nome: string; params: Record<string, string> }> = [
    // Como o coletor pede hoje.
    { nome: "day + total_value (atual)", params: { period: "day", metric_type: "total_value" } },
    // Legado: costuma trazer série com end_time, que é o que revela a janela.
    { nome: "day (legado)", params: { period: "day" } },
    // A hipótese que dispensaria a coleta noturna.
    {
      nome: "day + since/until (2 dias fechados)",
      params: { period: "day", since: unix(anteontem), until: unix(ontem) },
    },
    {
      nome: "day + total_value + since/until",
      params: { period: "day", metric_type: "total_value", since: unix(anteontem), until: unix(ontem) },
    },
  ];

  const leituras: LeituraDeJanela[] = [];
  let aceitaDiasFechados = false;

  for (const forma of formas) {
    try {
      const r = await consultar<{ data?: Array<Record<string, unknown>> }>(
        `${base}/insights`, { metric: metrica, ...forma.params });
      const item = r.data?.[0];
      const serie = (item?.values as Array<{ value?: unknown; end_time?: unknown }> | undefined) ?? [];
      const total = (item?.total_value as { value?: unknown } | undefined)?.value;

      const fins = serie.map((p) => String(p.end_time ?? "")).filter(Boolean);
      const valores = serie.length
        ? serie.map((p) => (typeof p.value === "number" ? p.value : null))
        : [typeof total === "number" ? total : null];

      const respondeu = valores.some((v) => v !== null) || fins.length > 0;
      // Dia fechado = veio um `end_time` que NÃO é hoje.
      const temPassado = fins.some((f) => f.slice(0, 10) < dia(agora));
      if (respondeu && temPassado && forma.nome.includes("since")) aceitaDiasFechados = true;

      leituras.push({
        forma: forma.nome, respondeu,
        pontos: serie.length || (total !== undefined ? 1 : 0),
        fins, valores,
        detalhe: respondeu
          ? `${serie.length || 1} ponto(s)` +
            (fins.length ? ` · janelas terminando em ${fins.map((f) => f.slice(0, 16)).join(", ")}` : " · sem end_time (não dá para saber a janela)") +
            ` · valores ${valores.join(", ")}`
          : "respondeu sem valor",
      });
    } catch (e) {
      leituras.push({
        forma: forma.nome, respondeu: false, pontos: 0, fins: [], valores: [],
        detalhe: sanitizar((e as Error).message),
      });
    }
  }

  const fusoDoDia = deduzirFuso(leituras.flatMap((l) => l.fins));
  return {
    metrica, leituras, aceitaDiasFechados, fusoDoDia,
    texto: montar(metrica, leituras, aceitaDiasFechados, fusoDoDia, agora),
  };
}

function montar(
  metrica: string, leituras: LeituraDeJanela[], fechados: boolean,
  fuso: string | null, agora: Date,
): string {
  const out = [`sondagem de janela · ${metrica} · consultado em ${agora.toISOString().slice(0, 16)}Z`, ""];
  for (const l of leituras) {
    out.push(`[${l.respondeu ? "SIM" : "NÃO"}] ${l.forma.padEnd(34)} ${l.detalhe}`);
  }

  out.push("", "── QUANDO O DIA VIRA ──");
  out.push(fuso
    ? `As janelas fecham sempre no mesmo horário: ${fuso}.`
    : "Não deu para deduzir o fuso — os `end_time` não fecham sempre na mesma hora,");
  out.push(fuso
    ? "É esse o fuso do DIA da métrica, e é dele que sai qualquer horário de coleta."
    : "ou não vieram. Sem isso, escolher horário de fechamento seria chute.");

  out.push("", "── DIA FECHADO ──");
  out.push(fechados
    ? "A API ACEITA since/until e devolveu dia(s) do passado."
    : "Nenhuma forma devolveu dia fechado do passado.");
  out.push(fechados
    ? "→ A coleta da manhã pode buscar o dia ANTERIOR, já completo. Não é preciso"
    : "→ Sem isso, fechar o dia exige coletar perto da virada revelada acima,");
  out.push(fechados
    ? "  coletar perto da virada, e um buraco fica preenchível depois."
    : "  e um dia perdido não volta.");

  out.push("", "── COMO LER ──");
  out.push("Compare o `end_time` com o horário da consulta. Se a janela termina");
  out.push("AGORA, e não na virada, o número é acumulado parcial do dia — e");
  out.push("chamá-lo de 'resultado do dia' seria falso.");
  out.push("");
  out.push("Seguidores é caso diferente: é ESTOQUE, não fluxo. A diferença entre");
  out.push("duas coletas de 06:20 cobre 24h inteiras — o número está certo, o");
  out.push("rótulo 'ganhou no dia X' é que não está. Erro de nome, não de medida.");
  return out.join("\n");
}
