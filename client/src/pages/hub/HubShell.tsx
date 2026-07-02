/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Selva Spaces — SHELL (layout global)
 * ─────────────────────────────────────────────────────────────────────────────
 *  Casca de layout compartilhada por todas as páginas do Selva Spaces (Home,
 *  apps integrados, Configurações, Acessos). Mantém a sidebar global + menu de
 *  usuário consistentes e os estados ativos funcionando entre rotas.
 *
 *  Como o Selva Spaces é a raiz da aplicação, a shell reaplica o mesmo gate de
 *  autenticação que o dashboard já usava na raiz (redireciona para /login se
 *  não autenticado). Reutiliza o hook useAuth — não altera a auth global.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import type { ReactNode } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { HubSidebar } from "./HubSidebar";

export function HubShell({ children }: { children: ReactNode }) {
  const { loading, isAuthenticated } = useAuth({ redirectOnUnauthenticated: true });

  if (loading || !isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      <HubSidebar />
      <div className="flex-1 flex flex-col min-w-0">{children}</div>
    </div>
  );
}
