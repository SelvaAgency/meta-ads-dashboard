/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Rotas internas do Tracker — fonte única
 * ─────────────────────────────────────────────────────────────────────────────
 *  Estas rotas renderizam a página CRUA do Tracker (MetaDashboardLayout, sem o
 *  shell do Spaces). Elas existem para serem navegadas DENTRO do iframe.
 *
 *  No topo (janela principal) elas não podem abrir sozinhas: a regra do produto
 *  é que nada interno funciona como app solto. Quem chega numa delas pela barra
 *  de endereço — ou por um deep-link de alerta — é levado para o shell do
 *  Spaces, que então carrega a MESMA rota dentro do iframe.
 *
 *      topo:  /site?account=4&aba=seguranca
 *        ↓    (redireciona, preservando a query)
 *      topo:  /tracker?rota=/site&account=4&aba=seguranca
 *        ↓    (HubApp monta o shell)
 *      iframe: /site?account=4&aba=seguranca   → aqui renderiza cru
 *
 *  Os ~500 alertas em produção apontam para as rotas cruas (/site?account=…).
 *  É por isso que o redirect PRESERVA a query: sem isso, todo deep-link de
 *  alerta viraria "Tracker genérico" e o alerta perderia o destino.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Rotas cruas do Tracker. Ver App.tsx — devem bater com as rotas registradas. */
export const ROTAS_INTERNAS = [
  "/overview",
  "/dashboard",
  "/campaigns",
  "/alerts",
  "/site",
  "/clarity",
  "/suggestions",
  "/admin",
  "/google-ads",
  "/ga4",
  "/lojas",
  "/social-networks",
  "/experiments",
] as const;

/** /experiments/42 é interna também — é a única rota interna com parâmetro. */
const COM_PARAMETRO = /^\/experiments\/[^/]+$/;

export function ehRotaInterna(pathname: string): boolean {
  return (ROTAS_INTERNAS as readonly string[]).includes(pathname) || COM_PARAMETRO.test(pathname);
}

/** Para onde mandar quem abriu uma rota crua no topo. Preserva a query. */
export function urlDoShellPara(pathname: string, busca: string): string {
  const p = new URLSearchParams(busca);
  p.set("rota", pathname);
  return `/tracker?${p.toString()}`;
}

/**
 * `?rota=` vira `src` de iframe, então é entrada não confiável: um valor como
 * `https://exemplo.com` ou `//exemplo.com` embutiria um site de terceiro dentro
 * do Spaces, com a sessão do usuário na tela. Só caminho da allowlist passa —
 * qualquer outra coisa vira null e cai no Tracker geral.
 */
export function rotaInternaSegura(bruta: string | null | undefined): string | null {
  if (!bruta) return null;
  if (!bruta.startsWith("/") || bruta.startsWith("//")) return null; // absoluta ou protocolo-relativa
  const [caminho] = bruta.split("?"); // ignora query embutida no próprio param
  return ehRotaInterna(caminho) ? caminho : null;
}

/**
 * URL que o iframe carrega: a rota interna + a query original, menos o `rota`
 * (que é instrução para o shell, não para o app de dentro). O resto passa
 * inteiro — é assim que `account`/`aba` dos alertas, e o `client` do flyout,
 * atravessam a fronteira do iframe. Nada mais atravessa: o iframe é outro
 * documento, e o estado do React do Spaces não chega lá.
 */
export function urlEmbutidaPara(rota: string, busca: string): string {
  const p = new URLSearchParams(busca);
  p.delete("rota");
  const qs = p.toString();
  return qs ? `${rota}?${qs}` : rota;
}
