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
  descobrirPaginas, diagnosticar, insightsDe, perfilDe,
  type DiagnosticoInstagram, type PaginaDescoberta,
} from "./instagram";
import {
  FonteSemCredencial,
  type AlvoInstagram, type FonteInstagram, type PerfilInstagram, type ResultadoInsights,
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

    async diagnosticar(alvo: AlvoInstagram & { escopoDeCliente?: boolean }): Promise<DiagnosticoInstagram> {
      return diagnosticar(await token(), {
        pageId: alvo.pageId,
        instagramUserId: alvo.instagramUserId,
        escopoDeCliente: alvo.escopoDeCliente,
      });
    },

    /** Portfólio é conceito desta fonte — ver o cabeçalho da porta. */
    async descobrirPaginas(): Promise<{ paginas: PaginaDescoberta[]; avisos: string[] }> {
      return descobrirPaginas(await token());
    },
  };
}
