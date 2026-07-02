/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Selva Spaces — detecção de "embedded"
 * ─────────────────────────────────────────────────────────────────────────────
 *  Rotas como /tracker, /reports, /contracts, /settings e / são compartilhadas:
 *   · No TOPO (janela principal) → renderizam a experiência Selva Spaces.
 *   · Dentro do iframe do Spaces  → renderizam a página crua do dashboard.
 *
 *  A decisão usa detecção de iframe same-origin (persiste na navegação interna
 *  do app embutido) + um override explícito `?embedded=1`. Sem postMessage,
 *  sem DOM cross-origin.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function isEmbedded(): boolean {
  try {
    if (window.self !== window.top) return true;
  } catch {
    return true; // acesso a window.top bloqueado → estamos embutidos
  }
  try {
    return new URLSearchParams(window.location.search).get("embedded") === "1";
  } catch {
    return false;
  }
}
