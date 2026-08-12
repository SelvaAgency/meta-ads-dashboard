/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Fonte: login da própria conta (OAuth)
 * ─────────────────────────────────────────────────────────────────────────────
 *  Segunda implementação de `FonteInstagram`. Mesma porta, API diferente: entra
 *  direto na conta autorizada, sem Página, sem Portfólio, sem ativo atribuído no
 *  Business Manager.
 *
 *  ── O diagnóstico daqui pergunta outras coisas ─────────────────────────────
 *  Não há "alcança o portfólio?" nem "a Página foi encontrada?": não existe
 *  portfólio nem Página neste caminho. Em compensação existem perguntas que a
 *  fonte da agência não tem — quanto tempo o token ainda vive, e se ele ainda é
 *  renovável. Repetir as seis perguntas da outra fonte responderia "n/a" para
 *  metade delas e esconderia as duas que importam aqui.
 *
 *  ── Renovação preguiçosa, e a cegueira que ela deixa ───────────────────────
 *  O token vale 60 dias e se renova ao ser usado, quando faltam menos de
 *  DIAS_PARA_RENOVAR. Isso cobre conta que é lida com alguma frequência. Uma
 *  conta esquecida por 60 dias perde o token em silêncio — não há cron nesta
 *  fatia, por decisão. A tela mostra "expira em X dias" justamente porque a
 *  renovação automática, sozinha, não é garantia.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { DIAS_PARA_RENOVAR } from "@shared/fontesSociais";
import { tipoDaResposta, type StatusInsight, type TipoConta } from "@shared/instagram";
import { logger } from "../logger";
import { CAMPOS_MIDIA, impressaoDe, mapearMidia, type DiagnosticoInstagram, type EtapaDiagnostico } from "./instagram";
import {
  ESCOPOS_INSTAGRAM, graphIg, perfilDaConta, renovarTokenLongo,
} from "./instagramOAuth";
import {
  FonteSemCredencial,
  type AlvoInstagram, type FonteInstagram, type MidiaInstagram,
  type PerfilInstagram, type ResultadoInsights,
} from "./fonteInstagram";

/** Mesmos grupos da outra fonte, e pelo mesmo motivo: uma métrica morta não pode derrubar o resto. */
const GRUPOS_METRICAS: string[][] = [["reach"], ["accounts_engaged"], ["profile_views"], ["total_interactions"]];

export interface CredencialDaConta {
  token: string;
  instagramUserId: string | null;
  instagramUsername: string | null;
  escopos: string[];
  expiresAt: Date | null;
}

export const diasAte = (quando: Date | null, agora: Date): number | null =>
  quando ? Math.floor((quando.getTime() - agora.getTime()) / 86_400_000) : null;

/**
 * A fonte de UM cliente. Recebe como ler e como gravar a credencial, para o
 * teste não precisar de banco e para a renovação ter onde persistir o token
 * novo — renovar sem gravar renovaria de novo na chamada seguinte.
 */
export function fonteDaConta(
  accountId: number,
  io: {
    ler: () => Promise<CredencialDaConta | null>;
    gravarRenovado?: (t: { token: string; expiresAt: Date | null }) => Promise<void>;
    registrarFalhaDeRenovacao?: (detalhe: string) => Promise<void>;
    agora?: () => Date;
  },
): FonteInstagram {
  const agora = io.agora ?? (() => new Date());

  /**
   * Lê a credencial e, se estiver perto do fim, renova antes de usar.
   *
   * Falha de renovação NÃO derruba a leitura: o token velho ainda vale até
   * expirar, e perder a leitura de hoje por causa de uma renovação que falhou
   * seria antecipar o prejuízo. A falha fica registrada para a tela mostrar.
   */
  async function credencial(): Promise<CredencialDaConta> {
    const c = await io.ler();
    if (!c) throw new FonteSemCredencial("oauth_conta");

    const dias = diasAte(c.expiresAt, agora());
    if (dias !== null && dias <= DIAS_PARA_RENOVAR && dias > 0) {
      try {
        const novo = await renovarTokenLongo(c.token);
        const expiresAt = novo.expiraEm ? new Date(agora().getTime() + novo.expiraEm * 1000) : null;
        await io.gravarRenovado?.({ token: novo.token, expiresAt });
        return { ...c, token: novo.token, expiresAt };
      } catch (e) {
        logger.warn(`[Social] renovação falhou para cliente #${accountId}: ${(e as Error).message}`);
        await io.registrarFalhaDeRenovacao?.((e as Error).message);
      }
    }
    return c;
  }

  async function lerInsights(token: string): Promise<ResultadoInsights> {
    const ok: string[] = [];
    const recusadas: string[] = [];
    for (const grupo of GRUPOS_METRICAS) {
      try {
        await graphIg<{ data: unknown[] }>("me/insights",
          { metric: grupo.join(","), period: "day", metric_type: "total_value" }, token);
        ok.push(...grupo);
      } catch (e) {
        recusadas.push(`${grupo.join(",")} → ${(e as Error).message}`);
      }
    }
    return {
      statusInsight: ok.length > 0 ? "DISPONIVEL" : recusadas.length > 0 ? "INDISPONIVEL" : "NAO_TESTADO",
      ok, recusadas,
    };
  }

  return {
    nome: "oauth_conta",

    async disponivel(): Promise<boolean> {
      return !!(await io.ler());
    },

    // `alvo` é ignorado de propósito: o token JÁ é de uma conta só. Aceitar um
    // instagramUserId aqui sugeriria que dá para ler outra conta com ele.
    async perfil(_alvo: AlvoInstagram): Promise<PerfilInstagram> {
      const c = await credencial();
      const p = await perfilDaConta(c.token);
      return {
        instagramUserId: p.id || (c.instagramUserId ?? ""),
        username: p.username ?? c.instagramUsername,
        tipoConta: tipoDaResposta({ account_type: p.accountType }),
        posts: p.posts,
      };
    },

    async insights(_alvo: AlvoInstagram): Promise<ResultadoInsights> {
      return lerInsights((await credencial()).token);
    },

    async midias(_alvo: AlvoInstagram, limite = 12): Promise<MidiaInstagram[]> {
      const r = await graphIg<{ data?: Record<string, unknown>[] }>(
        "me/media", { fields: CAMPOS_MIDIA, limit: String(limite) }, (await credencial()).token);
      return (r.data ?? []).map(mapearMidia);
    },

    async diagnosticar(): Promise<DiagnosticoInstagram> {
      const c = await credencial();
      const etapas: EtapaDiagnostico[] = [];
      const registrar = (pergunta: string, resposta: EtapaDiagnostico["resposta"], detalhe: string) =>
        etapas.push({ pergunta, resposta, detalhe });
      const impressao = await impressaoDe(c.token);
      let tipoConta: TipoConta = "DESCONHECIDO";
      let statusInsight: StatusInsight = "NAO_TESTADO";
      let metricasOk: string[] = [];
      let metricasRecusadas: string[] = [];

      const montar = (ok: boolean): DiagnosticoInstagram => {
        const linhas = [
          "fonte: login da conta (OAuth)",
          `impressão do token: ${impressao}`,
          ...etapas.map((e) => `[${e.resposta.toUpperCase().padEnd(3)}] ${e.pergunta} — ${e.detalhe}`),
        ];
        if (metricasRecusadas.length) {
          linhas.push("", "Métricas recusadas:", ...metricasRecusadas.map((m) => `  · ${m}`));
        }
        return {
          ok, impressao, etapas, metricasOk, metricasRecusadas, tipoConta, statusInsight,
          ficha: null, veredito: null, texto: linhas.join("\n"),
        };
      };

      // 1 — o token vive, e por quanto tempo?
      const dias = diasAte(c.expiresAt, agora());
      registrar("Quanto tempo o token ainda vive?",
        dias === null ? "n/a" : dias > 0 ? "sim" : "não",
        dias === null ? "A Meta não informou prazo para este token."
          : dias > 0 ? `Expira em ${dias} dia(s)${dias <= DIAS_PARA_RENOVAR ? " — renovação automática já está ativa ao usar." : "."}`
          : "Token EXPIRADO. Token expirado não se renova: é preciso reconectar a conta.");

      // 2 — o que a conta autorizou de verdade?
      const faltam = ESCOPOS_INSTAGRAM.filter((e) => !c.escopos.includes(e));
      registrar("Quais permissões a conta concedeu?", c.escopos.length === 0 ? "n/a" : faltam.length ? "não" : "sim",
        c.escopos.length === 0
          ? "A Meta não devolveu a lista de permissões nesta conexão."
          : `${c.escopos.join(", ")}${faltam.length ? ` · FALTAM: ${faltam.join(", ")}` : " · tem tudo que insights exigem"}`);

      // 3 — o perfil responde?
      let perfil: Awaited<ReturnType<typeof perfilDaConta>>;
      try {
        perfil = await perfilDaConta(c.token);
        tipoConta = tipoDaResposta({ account_type: perfil.accountType });
        registrar("O perfil responde?", "sim",
          `${perfil.username ? `@${perfil.username}` : perfil.id}${perfil.seguidores !== null ? ` · ${perfil.seguidores} seguidores` : ""}.`);
      } catch (e) {
        registrar("O perfil responde?", "não", (e as Error).message);
        return montar(false);
      }

      // 4 — que tipo de conta é?
      registrar("Que tipo de conta é?", tipoConta === "DESCONHECIDO" ? "n/a" : "sim",
        tipoConta === "DESCONHECIDO"
          ? "A Meta não declarou o tipo nesta resposta."
          : `${tipoConta}${tipoConta === "PESSOAL" ? " — conta pessoal não tem insights, e isso não é falha." : "."}`);

      // 5 — insights. Para conta pessoal, nem se pergunta: a resposta é conhecida.
      if (tipoConta === "PESSOAL") {
        statusInsight = "INDISPONIVEL";
        registrar("Insights respondem?", "n/a",
          "Conta pessoal: insights não disponíveis. Perfil, @ e link continuam funcionando. Para ter métricas, a conta precisa virar Business ou Creator no próprio Instagram — é gratuito e reversível.");
        return montar(true);
      }
      const r = await lerInsights(c.token);
      metricasOk = r.ok;
      metricasRecusadas = r.recusadas;
      statusInsight = r.statusInsight;
      registrar("Insights respondem?", r.ok.length ? "sim" : "não",
        r.ok.length
          ? `Responderam: ${r.ok.join(", ")}.`
          : faltam.length
            ? `Nenhuma métrica respondeu, e a conta não concedeu ${faltam.join(", ")}. Reconecte autorizando essa permissão.`
            : "Nenhuma métrica respondeu, mesmo com as permissões concedidas. Veja as recusas abaixo — a mensagem da Meta diz o motivo.");

      return montar(true);
    },
  };
}
