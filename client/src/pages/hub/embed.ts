/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Selva Spaces — detecção de "embedded"
 * ─────────────────────────────────────────────────────────────────────────────
 *  Rotas como /tracker, /reports, /settings e / são compartilhadas:
 *   · No TOPO (janela principal) → renderizam a experiência Selva Spaces.
 *   · Dentro do iframe do Spaces  → renderizam a página crua do dashboard.
 *
 *  A decisão é SÓ a detecção de iframe. Antes existia também um override
 *  `?embedded=1` na URL — ele foi removido de propósito: era justamente a porta
 *  de fuga que permitia abrir o Tracker cru numa aba de topo, fora do shell.
 *  Como estar dentro do iframe já é detectável de forma confiável (same-origin,
 *  e persiste na navegação interna, onde a query some), o parâmetro só servia
 *  para burlar a regra.
 *
 *  O `catch` devolve `true` — "assuma embutido" — porque esse é o lado seguro
 *  do erro: um falso `true` no topo mostra o Tracker sem o shell (degradado,
 *  visível); um falso `false` dentro do iframe faria o shell montar outro
 *  iframe, e outro, e outro. Errar para o lado do degradado.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function isEmbedded(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true; // acesso a window.top bloqueado → estamos embutidos
  }
}
