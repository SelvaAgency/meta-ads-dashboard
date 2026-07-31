/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Tracker — tela "Sem acesso" (camada de UI)
 * ─────────────────────────────────────────────────────────────────────────────
 *  Card padrão para páginas do Tracker restritas a admin/dev. Espelha o mesmo
 *  visual já usado em GA4/Lojas/Panorama (canManageContent → "Sem acesso"), mas
 *  em um só lugar, para não repetir o bloco em cada página bloqueada.
 *
 *  Bloqueio de visibilidade é temporário e de UI. Nas páginas que usam isto, as
 *  queries de dados ficam com `enabled: podeVer` — quem cai aqui não dispara
 *  nenhuma chamada. A guarda real continua sendo do backend nas procedures.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { Lock } from "lucide-react";
import { MetaDashboardLayout } from "@/components/MetaDashboardLayout";

export function SemAcessoTracker({ title, message }: { title: string; message?: string }) {
  return (
    <MetaDashboardLayout title={title}>
      <div className="p-6">
        <div className="bg-card border border-border rounded-xl p-8 text-center">
          <span className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
            <Lock className="w-4 h-4 text-muted-foreground" />
          </span>
          <h2 className="text-sm font-bold text-foreground">Sem acesso a esta tela</h2>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
            {message ?? "Esta área é restrita a administradores e desenvolvedores."}
          </p>
        </div>
      </div>
    </MetaDashboardLayout>
  );
}
