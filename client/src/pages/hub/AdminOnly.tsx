/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Selva Spaces — guard de rota admin-only (camada de UI)
 * ─────────────────────────────────────────────────────────────────────────────
 *  Bloqueia o acesso por link direto a rotas administrativas para quem não é
 *  admin. A proteção REAL é no backend (adminProcedure); isto é só a camada de
 *  UI para não renderizar a área e mostrar um aviso.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import type { ReactNode } from "react";
import { Lock } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { canAccessAdmin } from "@shared/permissions";
import { Card } from "@/components/ui/card";
import { HubShell } from "./HubShell";

export function AdminOnly({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const allowed = canAccessAdmin((user as { role?: string } | null)?.role);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!allowed) {
    return (
      <HubShell>
        <main className="flex-1 flex items-center justify-center p-6">
          <Card className="max-w-sm w-full py-6">
            <div className="px-6 flex items-center gap-3">
              <span className="w-9 h-9 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                <Lock className="w-4 h-4 text-muted-foreground" />
              </span>
              <div>
                <p className="text-sm font-semibold">Acesso restrito</p>
                <p className="text-xs text-muted-foreground">Esta área é exclusiva para administradores.</p>
              </div>
            </div>
          </Card>
        </main>
      </HubShell>
    );
  }

  return <>{children}</>;
}
