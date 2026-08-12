/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Por onde chegamos ao Instagram de um cliente
 * ─────────────────────────────────────────────────────────────────────────────
 *  Puro, compartilhado. Três caminhos, e a sondagem de 12/08 provou que o
 *  segundo existe:
 *
 *    PÁGINA            Página do Facebook → instagram_business_account
 *    INSTAGRAM DIRETO  o Portfólio expõe a conta como ativo próprio, sem Página
 *    LOGIN DA CONTA    o dono autoriza por OAuth
 *
 *  ── Nenhuma coluna nova ────────────────────────────────────────────────────
 *  Os três já se distinguem pelo que existe: `connectionSource` diz de QUEM é a
 *  credencial, e `pageId` diz se houve Página no caminho. Uma coluna a mais
 *  teria que ser preenchida corretamente em três lugares e conferida em todos
 *  os outros; uma função derivando dos campos que já existem não tem como ficar
 *  dessincronizada deles — não há o que dessincronizar.
 *
 *  ── Por que isso importa na tela ───────────────────────────────────────────
 *  "Este cliente ainda não tem Página vinculada" é falso para a Musa: ela nunca
 *  vai ter Página, e nem precisa. A condição real sempre foi não ter Instagram.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import type { FonteNome, TipoConta } from "./instagram";

export type ViaDoVinculo = "pagina" | "instagram_direto" | "login_da_conta" | "sem_vinculo";

export const ROTULO_VIA: Record<ViaDoVinculo, string> = {
  pagina: "Página do Facebook",
  instagram_direto: "Instagram direto",
  login_da_conta: "Login da conta",
  sem_vinculo: "Sem vínculo",
};

export function viaDoVinculo(v: {
  connectionSource?: string | null;
  pageId?: string | null;
  instagramUserId?: string | null;
} | null | undefined): ViaDoVinculo {
  if (!v?.instagramUserId) return "sem_vinculo";
  if (v.connectionSource === "oauth_conta") return "login_da_conta";
  return v.pageId ? "pagina" : "instagram_direto";
}

// ─── O que dá para escolher ao vincular ──────────────────────────────────────

/** Uma opção do seletor. O servidor a monta; a tela só desenha. */
export interface OpcaoDeVinculo {
  /** Valor do `<option>`. Prefixado pela via para os dois espaços não colidirem. */
  chave: string;
  via: "pagina" | "instagram_direto";
  pageId: string | null;
  pageName: string | null;
  instagramUserId: string | null;
  instagramUsername: string | null;
  tipoConta: TipoConta;
  rotulo: string;
}

/**
 * Junta Páginas e Instagram direto numa lista só.
 *
 * Um seletor, e não dois: dois competiriam pela mesma decisão, e escolher no
 * segundo sem limpar o primeiro deixaria dois destinos marcados ao mesmo tempo.
 *
 * Instagram que JÁ vem por Página não vira opção direta — apareceria duas vezes
 * na mesma lista, e as duas gravariam a mesma conta com vínculos diferentes.
 */
export function opcoesDeVinculo(
  paginas: Array<{
    pageId: string; pageName: string;
    instagram: { id: string; username: string | null; tipoConta: TipoConta } | null;
  }>,
  diretos: Array<{ id: string; username: string | null }> = [],
): OpcaoDeVinculo[] {
  const jaTemPagina = new Set(paginas.map((p) => p.instagram?.id).filter(Boolean) as string[]);

  const daPagina: OpcaoDeVinculo[] = paginas.map((p) => ({
    chave: `pagina:${p.pageId}`,
    via: "pagina",
    pageId: p.pageId,
    pageName: p.pageName,
    instagramUserId: p.instagram?.id ?? null,
    instagramUsername: p.instagram?.username ?? null,
    tipoConta: p.instagram?.tipoConta ?? "DESCONHECIDO",
    rotulo: `${p.pageName}${p.instagram?.username ? ` · @${p.instagram.username}` : " · sem Instagram"}`,
  }));

  const soDiretos: OpcaoDeVinculo[] = diretos
    .filter((d) => !jaTemPagina.has(d.id))
    .map((d) => ({
      chave: `direto:${d.id}`,
      via: "instagram_direto",
      pageId: null,
      pageName: null,
      instagramUserId: d.id,
      instagramUsername: d.username,
      // Quem o Portfólio expõe como ativo de Instagram é profissional por
      // construção — a Meta não atribui conta pessoal a Portfólio.
      tipoConta: "BUSINESS" as TipoConta,
      rotulo: `${d.username ? `@${d.username}` : d.id} · sem Página`,
    }));

  return [...daPagina, ...soDiretos].sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR"));
}

/**
 * O que falta para este cliente ser lido — dito pela condição REAL.
 *
 * A frase antiga citava Página, e Página nunca foi o requisito: sem Instagram
 * não há leitura, com Instagram há, tenha vindo por onde tiver vindo.
 */
export function faltaParaLer(v: {
  connectionSource?: string | null; pageId?: string | null; instagramUserId?: string | null;
} | null | undefined, fonte: FonteNome | null): string | null {
  if (v?.instagramUserId) return null;
  if (fonte === "oauth_conta") return "O login desta conta ainda não devolveu o Instagram. Rode Testar.";
  return v?.pageId
    ? "A Página vinculada não tem conta do Instagram. O vínculo é feito no próprio Instagram, ou escolha a conta pela via direta."
    : "Este cliente ainda não tem Instagram vinculado. Escolha em Conexões → Redes sociais — por Página, ou direto pelo Portfólio.";
}
