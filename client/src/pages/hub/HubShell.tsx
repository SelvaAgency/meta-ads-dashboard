/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Selva Spaces — SHELL  (experimental · rota /hub · descartável)
 * ─────────────────────────────────────────────────────────────────────────────
 *  Casca de layout compartilhada pelas páginas internas do Selva Spaces
 *  (Home, Acessos...). Mantém a sidebar consistente e os estados ativos
 *  funcionando entre rotas. Isolada em /hub — não toca no dashboard atual.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import type { ReactNode } from "react";
import { HubSidebar } from "./HubSidebar";

export function HubShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex bg-background text-foreground">
      <HubSidebar />
      <div className="flex-1 flex flex-col min-w-0">{children}</div>
    </div>
  );
}
