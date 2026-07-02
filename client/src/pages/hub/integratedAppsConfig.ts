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

// O Tracker/Relatórios/Contratos são páginas DESTE mesmo deploy (mesma origem
// que o Selva Spaces). Por isso usamos URLs RELATIVAS: funcionam igual em
// spaces.selva.agency e no domínio do Railway, sem hardcode de domínio.
// A raiz "/" agora é o Selva Spaces; a Visão Geral do Tracker mora em /overview.
export const INTEGRATED_APPS: IntegratedApp[] = [
  { id: "tracker", label: "Tracker", route: "/hub/tracker", externalUrl: "/overview", supportsClientFlyout: true },
  { id: "reports", label: "Relatórios", route: "/hub/reports", externalUrl: "/reports" },
  { id: "contracts", label: "Contratos", route: "/hub/contracts", externalUrl: "/contracts" },
];

/** Rota interna → app integrado (query string já vem removida pelo wouter). */
export function integratedAppByRoute(pathname: string): IntegratedApp | undefined {
  return INTEGRATED_APPS.find((a) => pathname === a.route);
}

/** true quando a rota atual é de um app integrado (usado no auto-colapso). */
export function isIntegratedAppRoute(pathname: string): boolean {
  return INTEGRATED_APPS.some((a) => pathname === a.route);
}
