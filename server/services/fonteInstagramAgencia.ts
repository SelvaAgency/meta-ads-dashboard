/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Fonte: token da agência (System User)
 * ─────────────────────────────────────────────────────────────────────────────
 *  Primeira implementação de `FonteInstagram`, e por ora a única. Não traz
 *  comportamento novo: embrulha o que `instagram.ts` já fazia, para que a
 *  segunda fonte (login da conta) entre por baixo sem que nada acima mude.
 *
 *  ── Por que ela busca o próprio token ──────────────────────────────────────
 *  Quem chama pede perfil, insights ou diagnóstico — nunca recebe o token, nem
 *  para repassar adiante. Um token que circula por parâmetro acaba guardado
 *  "só um pouquinho" em algum lugar; foi assim que `accounts[0].accessToken`
 *  virou credencial de Instagram inteiro.
 *
 *  ── Por que o token entra por injeção ──────────────────────────────────────
 *  `obterToken` tem padrão de produção (a credencial cifrada em
 *  social_credentials) e pode ser trocado no teste. Sem isso, testar a fonte
 *  exigiria banco — e um teste que precisa de banco é um teste que não roda.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import {
  descobrirPaginas, diagnosticar, insightsDe, midiasDe, perfilDe,
  type DiagnosticoInstagram, type PaginaDescoberta,
} from "./instagram";
import { sondarInstagram, type Sondagem } from "./instagramSondagem";
import { coletarDeInstagram, listarMidiasAte, type ColetaSocial } from "./coletaSocial";
import { sondarInstagramDireto as sondarDireto, type SondagemDireta } from "./sondagemInstagramDireto";
import { sondarHorarios as sondarHrs, type SondagemDeHorarios } from "./sondagemHorarios";
import { sondarJanela as sondarJan, type SondagemDeJanela } from "./sondagemJanela";
import { sondarInsightsAninhados as sondarAnin, type SondagemAninhada } from "./sondagemAninhada";
import { sondarImpulsionado as sondarImp, type SondagemImpulsionado } from "./sondagemImpulsionado";
import {
  FonteSemCredencial,
  type AlvoInstagram, type FonteInstagram, type MidiaInstagram,
  type PerfilInstagram, type ResultadoInsights,
} from "./fonteInstagram";

/** Import tardio: mantém `server/db` fora do grafo de quem só usa a fonte. */
const tokenGuardado = async (): Promise<string | null> => (await import("../db")).tokenSocial();

export function fonteAgencia(obterToken: () => Promise<string | null> = tokenGuardado): FonteInstagram {
  /** Um ponto só de leitura da credencial — e um só lugar para ela faltar. */
  async function token(): Promise<string> {
    const t = await obterToken();
    if (!t) throw new FonteSemCredencial("agencia_system_user");
    return t;
  }

  /**
   * O Instagram que esta fonte vai ler.
   *
   * Aceita o id direto, mas a fonte da agência também sabe chegar nele pela
   * Página — é o caminho dela. Sem alvo nenhum não há o que ler, e dizer isso
   * é melhor que devolver o perfil de outra conta qualquer.
   */
  function exigirInstagram(alvo: AlvoInstagram): string {
    if (alvo.instagramUserId) return alvo.instagramUserId;
    throw new Error(
      alvo.pageId
        ? "A Página não tem Instagram vinculado — rode o diagnóstico para o detalhe."
        : "Nenhum Instagram informado para leitura.",
    );
  }

  return {
    nome: "agencia_system_user",

    async disponivel(): Promise<boolean> {
      return !!(await obterToken());
    },

    async perfil(alvo: AlvoInstagram): Promise<PerfilInstagram> {
      return perfilDe(await token(), exigirInstagram(alvo));
    },

    async insights(alvo: AlvoInstagram): Promise<ResultadoInsights> {
      return insightsDe(await token(), exigirInstagram(alvo));
    },

    async midias(alvo: AlvoInstagram, limite = 12): Promise<MidiaInstagram[]> {
      return midiasDe(await token(), exigirInstagram(alvo), limite);
    },

    async diagnosticar(alvo: AlvoInstagram & { escopoDeCliente?: boolean }): Promise<DiagnosticoInstagram> {
      return diagnosticar(await token(), {
        pageId: alvo.pageId,
        instagramUserId: alvo.instagramUserId,
        escopoDeCliente: alvo.escopoDeCliente,
      });
    },

    async sondar(alvo: AlvoInstagram): Promise<Sondagem> {
      const t = await token();
      const igId = exigirInstagram(alvo);
      // A sondagem recebe COMO consultar, não o token. Assim ela serve às duas
      // fontes sem saber qual está usando — e sem a credencial passar por ela.
      const { consultarGraph } = await import("./instagram");
      return sondarInstagram((caminho, params) => consultarGraph(caminho, params, t), igId);
    },

    async coletar(alvo: AlvoInstagram, opts?: { apenasStories?: boolean }): Promise<ColetaSocial> {
      const t = await token();
      const igId = exigirInstagram(alvo);
      const { consultarGraph } = await import("./instagram");
      return coletarDeInstagram((caminho, params) => consultarGraph(caminho, params, t), igId, opts);
    },

    async midiasDesde(alvo: AlvoInstagram, inicio: string) {
      const t = await token();
      const igId = exigirInstagram(alvo);
      const { consultarGraph } = await import("./instagram");
      const r = await listarMidiasAte((c, p2) => consultarGraph(c, p2, t), igId, inicio);
      return { midias: r.midias, completo: r.completo };
    },

    async sondarInstagramDireto(): Promise<SondagemDireta> {
      const t = await token();
      const { consultarGraph, descobrirPaginas: descobrir, BUSINESS_ID_PADRAO } = await import("./instagram");
      // Os que JÁ vêm pela Página entram como referência: o que interessa na
      // resposta não é a lista inteira, é quem só existe pela via direta.
      const { paginas } = await descobrir(t);
      const pelaPagina = paginas.map((p2) => p2.instagram?.id).filter((x): x is string => !!x);
      return sondarDireto((c, p2) => consultarGraph(c, p2, t), BUSINESS_ID_PADRAO, pelaPagina);
    },

    async sondarInsightsAninhados(alvo: AlvoInstagram): Promise<SondagemAninhada> {
      const t = await token();
      const igId = exigirInstagram(alvo);
      const { consultarGraph } = await import("./instagram");
      return sondarAnin((c, p2) => consultarGraph(c, p2, t), igId);
    },

    async sondarImpulsionado(alvo: AlvoInstagram, mediaId?: string): Promise<SondagemImpulsionado> {
      const t = await token();
      const igId = exigirInstagram(alvo);
      const { consultarGraph } = await import("./instagram");
      return sondarImp((c, p2) => consultarGraph(c, p2, t), igId, mediaId);
    },

    async sondarJanela(alvo: AlvoInstagram, metrica?: string): Promise<SondagemDeJanela> {
      const t = await token();
      const igId = exigirInstagram(alvo);
      const { consultarGraph } = await import("./instagram");
      return sondarJan((c, p2) => consultarGraph(c, p2, t), igId, metrica);
    },

    async sondarHorarios(alvo: AlvoInstagram): Promise<SondagemDeHorarios> {
      const t = await token();
      const igId = exigirInstagram(alvo);
      const { consultarGraph } = await import("./instagram");
      return sondarHrs((c, p2) => consultarGraph(c, p2, t), igId);
    },

    async descobrirInstagramDireto() {
      const t = await token();
      const { descobrirInstagramDireto: descobrir } = await import("./instagram");
      return descobrir(t);
    },

    /** Portfólio é conceito desta fonte — ver o cabeçalho da porta. */
    async descobrirPaginas(): Promise<{ paginas: PaginaDescoberta[]; avisos: string[] }> {
      return descobrirPaginas(await token());
    },
  };
}
