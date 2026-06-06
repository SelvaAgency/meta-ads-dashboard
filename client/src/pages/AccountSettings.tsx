import { MetaDashboardLayout } from "@/components/MetaDashboardLayout";
import { useSelectedAccount } from "@/hooks/useSelectedAccount";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Settings, Check, ImageDown } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const GOAL_OPTIONS = [
  { value: null,         label: "Automático (detectado pelo sistema)" },
  { value: "SALES",      label: "🛒 Vendas (SALES)" },
  { value: "VALUE",      label: "💰 Valor de Conversão (VALUE)" },
  { value: "LEADS",      label: "🎯 Leads (LEADS)" },
  { value: "MESSAGES",   label: "💬 Mensagens (MESSAGES)" },
  { value: "TRAFFIC",    label: "🖱️ Tráfego (TRAFFIC)" },
  { value: "ENGAGEMENT", label: "❤️ Engajamento (ENGAGEMENT)" },
  { value: "AWARENESS",  label: "👁️ Reconhecimento (AWARENESS)" },
  { value: "VIDEO",      label: "▶️ Visualizações de Vídeo (VIDEO)" },
  { value: "FOLLOWERS",  label: "👥 Seguidores (FOLLOWERS)" },
  { value: "APP",        label: "📱 Instalações de App (APP)" },
];

export default function AccountSettings() {
  const { accounts } = useSelectedAccount();
  const utils = trpc.useUtils();
  const updateGoalType = trpc.accounts.updateGoalType.useMutation({
    onSuccess: () => {
      utils.accounts.list.invalidate();
      toast.success("Configuração salva");
    },
    onError: () => toast.error("Erro ao salvar"),
  });

  const refreshPictures = trpc.accounts.refreshPictures.useMutation({
    onSuccess: (data) => toast.success(`Fotos atualizadas (${data.updated} conta${data.updated !== 1 ? "s" : ""})`),
    onError: () => toast.error("Erro ao atualizar fotos"),
  });

  const [saving, setSaving] = useState<number | null>(null);

  async function handleChange(accountId: number, value: string | null) {
    setSaving(accountId);
    await updateGoalType.mutateAsync({ accountId, goalTypeOverride: value });
    setSaving(null);
  }

  return (
    <MetaDashboardLayout>
      <div className="max-w-3xl mx-auto p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <Settings className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Configurações de Contas</h1>
            <p className="text-sm text-muted-foreground">Defina o objetivo de cada conta para personalizar as métricas do dashboard</p>
          </div>
        </div>

        <div className="flex justify-end mb-2">
          <button
            onClick={() => refreshPictures.mutate()}
            disabled={refreshPictures.isPending}
            className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground hover:border-border/80 transition-colors disabled:opacity-50"
          >
            <ImageDown className={`w-4 h-4 ${refreshPictures.isPending ? "animate-pulse" : ""}`} />
            {refreshPictures.isPending ? "Atualizando fotos..." : "Atualizar fotos das contas"}
          </button>
        </div>

        <div className="flex flex-col gap-3">
          {(accounts ?? []).map((account: any) => (
            <Card key={account.id} className="border-border bg-card">
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{account.accountName}</p>
                    <p className="text-xs text-muted-foreground">{account.accountId}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <select
                      className="text-sm border border-border rounded-md px-3 py-1.5 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                      value={account.goalTypeOverride ?? ""}
                      onChange={(e) => handleChange(account.id, e.target.value === "" ? null : e.target.value)}
                    >
                      {GOAL_OPTIONS.map((opt) => (
                        <option key={opt.value ?? "auto"} value={opt.value ?? ""}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    {saving === account.id && (
                      <span className="text-xs text-muted-foreground">Salvando...</span>
                    )}
                    {saving !== account.id && account.goalTypeOverride && (
                      <Check className="w-4 h-4 text-emerald-500" />
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </MetaDashboardLayout>
  );
}
