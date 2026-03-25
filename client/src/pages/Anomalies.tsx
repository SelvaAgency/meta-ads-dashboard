import { MetaDashboardLayout, useSelectedAccount } from "@/components/MetaDashboardLayout";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  Link2,
  RefreshCw,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";

const severityConfig: Record<string, { label: string; color: string; bg: string }> = {
  CRITICAL: { label: "Crítico", color: "text-red-400", bg: "bg-red-400/10 border-red-400/30" },
  HIGH: { label: "Alto", color: "text-orange-400", bg: "bg-orange-400/10 border-orange-400/30" },
  MEDIUM: { label: "Médio", color: "text-yellow-400", bg: "bg-yellow-400/10 border-yellow-400/30" },
  LOW: { label: "Baixo", color: "text-blue-400", bg: "bg-blue-400/10 border-blue-400/30" },
};

const typeLabels: Record<string, string> = {
  ROAS_DROP: "Queda de ROAS",
  CPA_SPIKE: "Pico de CPA",
  CTR_DROP: "Queda de CTR",
  SPEND_SPIKE: "Pico de Gasto",
  DELIVERY_CHANGE: "Mudança de Entrega",
  FREQUENCY_HIGH: "Frequência Alta",
  CONVERSION_DROP: "Queda de Conversões",
  BUDGET_EXHAUSTED: "Orçamento Esgotado",
};

export default function Anomalies() {
  const [, navigate] = useLocation();
  const { selectedAccountId, accounts } = useSelectedAccount();
  const utils = trpc.useUtils();

  const { data: anomalies, isLoading } = trpc.anomalies.list.useQuery(
    { accountId: selectedAccountId! },
    { enabled: !!selectedAccountId }
  );

  const runDetection = trpc.anomalies.runDetection.useMutation({
    onSuccess: (data) => {
      utils.anomalies.list.invalidate();
      utils.alerts.unreadCount.invalidate();
      toast.success(`Detecção concluída: ${data.detected} anomalia(s) encontrada(s).`);
    },
    onError: () => toast.error("Erro ao executar detecção."),
  });

  const markRead = trpc.anomalies.markRead.useMutation({
    onSuccess: () => utils.anomalies.list.invalidate(),
  });

  const resolve = trpc.anomalies.resolve.useMutation({
    onSuccess: () => {
      utils.anomalies.list.invalidate();
      toast.success("Anomalia marcada como resolvida.");
    },
  });

  if (!accounts || accounts.length === 0) {
    return (
      <MetaDashboardLayout title="Anomalias">
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
            <Link2 className="w-7 h-7 text-primary" />
          </div>
          <h2 className="text-xl font-semibold text-foreground mb-2">Nenhuma conta conectada</h2>
          <Button onClick={() => navigate("/connect")} className="gap-2 mt-2">
            <Zap className="w-4 h-4" />
            Conectar conta
          </Button>
        </div>
      </MetaDashboardLayout>
    );
  }

  const active = anomalies?.filter((a) => !a.isResolved) ?? [];
  const resolved = anomalies?.filter((a) => a.isResolved) ?? [];

  return (
    <MetaDashboardLayout title="Anomalias">
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">Detecção de Anomalias</h1>
            <p className="text-sm text-muted-foreground">
              Monitoramento automático de quedas de ROAS, picos de CPA e mudanças de entrega
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="gap-2"
            onClick={() => selectedAccountId && runDetection.mutate({ accountId: selectedAccountId })}
            disabled={runDetection.isPending || !selectedAccountId}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${runDetection.isPending ? "animate-spin" : ""}`} />
            {runDetection.isPending ? "Analisando..." : "Executar Detecção"}
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Anomalias Ativas", value: active.length, color: "text-red-400" },
            { label: "Críticas", value: active.filter((a) => a.severity === "CRITICAL").length, color: "text-red-400" },
            { label: "Resolvidas", value: resolved.length, color: "text-emerald-400" },
          ].map((stat) => (
            <Card key={stat.label}>
              <CardContent className="p-4">
                <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Active anomalies */}
        <div>
          <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400" />
            Anomalias Ativas ({active.length})
          </h2>
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-20 bg-muted rounded-xl animate-pulse" />
              ))}
            </div>
          ) : active.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
                <p className="text-sm font-medium text-foreground">Nenhuma anomalia ativa</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Execute a detecção para verificar anomalias nas últimas 24h.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {active.map((anomaly) => {
                const sev = severityConfig[anomaly.severity] ?? severityConfig.LOW;
                return (
                  <Card
                    key={anomaly.id}
                    className={`border ${!anomaly.isRead ? "border-primary/30" : "border-border"}`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${sev.bg}`}>
                          <AlertTriangle className={`w-4 h-4 ${sev.color}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="text-sm font-semibold text-foreground">{anomaly.title}</p>
                            <Badge variant="outline" className={`text-xs ${sev.color} ${sev.bg}`}>
                              {sev.label}
                            </Badge>
                            <Badge variant="outline" className="text-xs text-muted-foreground">
                              {typeLabels[anomaly.type] ?? anomaly.type}
                            </Badge>
                            {!anomaly.isRead && (
                              <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground leading-relaxed">{anomaly.description}</p>
                          <p className="text-xs text-muted-foreground/60 mt-1.5">
                            {new Date(anomaly.detectedAt).toLocaleString("pt-BR")}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {!anomaly.isRead && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={() => markRead.mutate({ anomalyId: anomaly.id })}
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 gap-1 text-xs text-emerald-400 hover:text-emerald-400 hover:bg-emerald-400/10"
                            onClick={() => resolve.mutate({ anomalyId: anomaly.id })}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Resolver
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        {/* Resolved */}
        {resolved.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              Resolvidas ({resolved.length})
            </h2>
            <div className="space-y-2">
              {resolved.slice(0, 5).map((anomaly) => (
                <Card key={anomaly.id} className="opacity-60">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">{anomaly.title}</p>
                        <p className="text-xs text-muted-foreground">
                          Resolvida em {anomaly.resolvedAt ? new Date(anomaly.resolvedAt).toLocaleDateString("pt-BR") : "—"}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </MetaDashboardLayout>
  );
}
