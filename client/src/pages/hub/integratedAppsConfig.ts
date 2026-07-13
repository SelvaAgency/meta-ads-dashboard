/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Selva Spaces — APPS INTEGRADOS · config central  · rota /hub
 * ─────────────────────────────────────────────────────────────────────────────
 *  Fonte única dos apps que abrem DENTRO do Selva Spaces via iframe
 *  (Tracker, Relatórios, Contratos). Evita duplicar URLs e lógica: a
 *  sidebar, o roteador de apps (HubApp) e o modo colapsado (appMode) leem daqui.
 *
 *  Apps ainda EXTERNOS (ex.: Clipper) NÃO entram aqui — continuam como link
 *  externo (nova aba) na sidebar. Para promover um app a integrado, basta
 *  adicioná-lo nesta lista e apontar o item da sidebar para a `route`.
 *
 *  ⚠️  Não colocar tokens/credenciais nas URLs. São apenas URLs públicas de app.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export interface IntegratedApp {
  id: string;
  label: string;
  /** Rota interna do Selva Spaces (ex.: /hub/reports). */
  route: string;
  /** URL embutida no iframe e usada no "Abrir em nova aba". */
  externalUrl: string;
  /** Só o Tracker suporta flyout de clientes por enquanto. */
  supportsClientFlyout?: boolean;
}

// Rotas diretas (sem prefixo /hub). São páginas DESTE mesmo deploy: a rota é
// compartilhada e resolvida por contexto — no topo renderiza o Selva Spaces,
// dentro do iframe (`?embedded=1`) renderiza a página crua do dashboard
// (ver embed.ts). URLs relativas: funcionam igual em qualquer domínio.
export const INTEGRATED_APPS: IntegratedApp[] = [
  { id: "tracker", label: "Tracker", route: "/tracker", externalUrl: "/tracker?embedded=1", supportsClientFlyout: true },
  { id: "reports", label: "Relatórios", route: "/reports", externalUrl: "/reports?embedded=1" },
  { id: "contracts", label: "Contratos", route: "/contracts", externalUrl: "/contracts?embedded=1" },
  { id: "finance", label: "Financeiro", route: "/finance", externalUrl: "/finance?embedded=1" },
];

/** Rota interna → app integrado (query string já vem removida pelo wouter). */
export function integratedAppByRoute(pathname: string): IntegratedApp | undefined {
  return INTEGRATED_APPS.find((a) => pathname === a.route);
}

/** true quando a rota atual é de um app integrado (usado no auto-colapso). */
export function isIntegratedAppRoute(pathname: string): boolean {
  return INTEGRATED_APPS.some((a) => pathname === a.route);
}
