import { MetaDashboardLayout } from "@/components/MetaDashboardLayout";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertTriangle,
  Bell,
  BellOff,
  CheckCheck,
  Info,
  TrendingDown,
  Wallet,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

const typeConfig: Record<string, { icon: React.ComponentType<{ className?: string }>; color: string }> = {
  ANOMALY: { icon: AlertTriangle, color: "text-red-400" },
  PERFORMANCE: { icon: TrendingDown, color: "text-yellow-400" },
  REPORT: { icon: Bell, color: "text-blue-400" },
  BUDGET_WARNING: { icon: Wallet, color: "text-yellow-400" },
  SYSTEM: { icon: Info, color: "text-muted-foreground" },
};

const severityConfig: Record<string, { label: string; color: string }> = {
  CRITICAL: { label: "Crítico", color: "text-red-400 border-red-400/30" },
  WARNING: { label: "Atenção", color: "text-yellow-400 border-yellow-400/30" },
  INFO: { label: "Info", color: "text-blue-400 border-blue-400/30" },
};

export default function AlertsPage() {
  const utils = trpc.useUtils();

  const { data: alerts, isLoading } = trpc.alerts.list.useQuery();

  const markRead = trpc.alerts.markRead.useMutation({
    onSuccess: () => {
      utils.alerts.list.invalidate();
      utils.alerts.unreadCount.invalidate();
    },
  });

  const markAllRead = trpc.alerts.markAllRead.useMutation({
    onSuccess: () => {
      utils.alerts.list.invalidate();
      utils.alerts.unreadCount.invalidate();
      toast.success("Todos os alertas marcados como lidos.");
    },
  });

  const unread = alerts?.filter((a) => !a.isRead) ?? [];
  const read = alerts?.filter((a) => a.isRead) ?? [];

  return (
    <MetaDashboardLayout title="Alertas">
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">Central de Alertas</h1>
            <p className="text-sm text-muted-foreground">
              Notificações de anomalias, performance e relatórios
            </p>
          </div>
          {unread.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
            >
              <CheckCheck className="w-3.5 h-3.5" />
              Marcar todos como lidos
            </Button>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Não lidos", value: unread.length, color: "text-primary" },
            { label: "Críticos", value: unread.filter((a) => a.severity === "CRITICAL").length, color: "text-red-400" },
            { label: "Total", value: alerts?.length ?? 0, color: "text-muted-foreground" },
          ].map((stat) => (
            <Card key={stat.label}>
              <CardContent className="p-4">
                <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Unread */}
        {unread.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <Bell className="w-4 h-4 text-primary" />
              Não Lidos ({unread.length})
            </h2>
            <div className="space-y-2">
              {unread.map((alert) => {
                const tc = typeConfig[alert.type] ?? typeConfig.SYSTEM;
                const sc = severityConfig[alert.severity] ?? severityConfig.INFO;
                const AlertIcon = tc.icon;
                return (
                  <Card key={alert.id} className="border-primary/20 bg-primary/5">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center flex-shrink-0">
                          <AlertIcon className={`w-4 h-4 ${tc.color}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <p className="text-sm font-semibold text-foreground">{alert.title}</p>
                            <Badge variant="outline" className={`text-xs ${sc.color}`}>
                              {sc.label}
                            </Badge>
                            <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
                          </div>
                          <p className="text-xs text-muted-foreground leading-relaxed">{alert.message}</p>
                          <p className="text-xs text-muted-foreground/60 mt-1.5">
                            {new Date(alert.createdAt).toLocaleString("pt-BR")}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs flex-shrink-0"
                          onClick={() => markRead.mutate({ alertId: alert.id })}
                        >
                          Lido
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* Read */}
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-16 bg-muted rounded-xl animate-pulse" />
            ))}
          </div>
        ) : alerts?.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <BellOff className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
              <p className="text-sm font-medium text-foreground mb-2">Nenhum alerta</p>
              <p className="text-xs text-muted-foreground">
                Os alertas aparecerão aqui quando anomalias forem detectadas.
              </p>
            </CardContent>
          </Card>
        ) : read.length > 0 ? (
          <div>
            <h2 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
              <CheckCheck className="w-4 h-4" />
              Lidos ({read.length})
            </h2>
            <div className="space-y-2">
              {read.slice(0, 20).map((alert) => {
                const tc = typeConfig[alert.type] ?? typeConfig.SYSTEM;
                const AlertIcon = tc.icon;
                return (
                  <Card key={alert.id} className="opacity-60">
                    <CardContent className="p-3">
                      <div className="flex items-center gap-3">
                        <AlertIcon className={`w-4 h-4 flex-shrink-0 ${tc.color}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-foreground truncate">{alert.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(alert.createdAt).toLocaleString("pt-BR")}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    </MetaDashboardLayout>
  );
}
