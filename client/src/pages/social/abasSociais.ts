/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Abas da Social — e os links antigos que continuam funcionando
 * ─────────────────────────────────────────────────────────────────────────────
 *  A Social virou duas abas porque a página respondia duas perguntas e as
 *  empilhava numa rolagem só:
 *
 *    HOME      o que aconteceu com esta conta no período?
 *    CONTEÚDO  qual conteúdo explica isso?
 *
 *  ── Por que um módulo, para duas abas ──────────────────────────────────────
 *  Pelo mesmo motivo de `abasSite.ts`: alertas, relatórios e e-mails gravam
 *  destino em TEXTO, no banco. Um `?aba=` desconhecido tem de abrir a Home em
 *  vez de uma tela vazia — um link que abre nada ensina a ignorar o link.
 *
 *  Aqui ainda não há legado a traduzir: a Social nunca teve aba. O módulo nasce
 *  agora justamente para que o primeiro nome antigo tenha lugar onde morar, em
 *  vez de virar um `if` solto na página.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type AbaSocial = "home" | "conteudo";

export const ABAS_SOCIAIS: AbaSocial[] = ["home", "conteudo"];

/**
 * O rótulo é "Resumo", e a CHAVE continua `home`.
 *
 * Trocar a chave junto renomearia o `?aba=home` que já pode estar gravado num
 * link — e `abaDaUrl` traduz nome desconhecido para `home` de qualquer jeito,
 * então nada quebraria de imediato. O que quebraria em silêncio é o contrário:
 * um `?aba=resumo` de amanhã caindo no sinônimo em vez de na chave própria.
 * `resumo` já está mapeado logo abaixo, e continua chegando aqui.
 */
export const ROTULO_ABA_SOCIAL: Record<AbaSocial, string> = {
  home: "Resumo",
  conteudo: "Conteúdo",
};

/**
 * Traduz o `?aba=` da URL.
 *
 * Desconhecido, vazio ou ausente cai na Home. Ela é a aba que responde a
 * pergunta mais geral, e por isso é o destino seguro de um link torto.
 */
export function abaDaUrl(valor: string | null | undefined): AbaSocial {
  if (!valor) return "home";
  const v = valor.trim().toLowerCase();
  if ((ABAS_SOCIAIS as string[]).includes(v)) return v as AbaSocial;
  // Sinônimos plausíveis de quem escreve o link à mão ou vem de outro módulo.
  const sinonimos: Record<string, AbaSocial> = {
    resumo: "home",
    geral: "home",
    content: "conteudo",
    conteúdo: "conteudo",
    performance: "conteudo",
  };
  return sinonimos[v] ?? "home";
}
