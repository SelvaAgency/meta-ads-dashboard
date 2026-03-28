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

  // Optimistic update: remove alert from list immediately on markRead
  const markRead = trpc.alerts.markRead.useMutation({
    onMutate: async ({ alertId }) => {
      await utils.alerts.list.cancel();
      const prev = utils.alerts.list.getData();
      utils.alerts.list.setData(undefined, (old) =>
        old ? old.filter((a) => a.id !== alertId) : []
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) utils.alerts.list.setData(undefined, ctx.prev);
    },
    onSettled: () => {
      utils.alerts.list.invalidate();
      utils.alerts.unreadCount.invalidate();
    },
  });

  // Optimistic update: remove all alerts immediately
  const markAllRead = trpc.alerts.markAllRead.useMutation({
    onMutate: async () => {
      await utils.alerts.list.cancel();
      const prev = utils.alerts.list.getData();
      utils.alerts.list.setData(undefined, []);
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) utils.alerts.list.setData(undefined, ctx.prev);
    },
    onSettled: () => {
      utils.alerts.list.invalidate();
      utils.alerts.unreadCount.invalidate();
      toast.success("Todos os alertas removidos.");
    },
  });

  // All returned alerts are unread (read ones are deleted server-side)
  const unread = alerts ?? [];
  const criticalCount = unread.filter((a) => a.severity === "CRITICAL").length;

  return (
    <MetaDashboardLayout title="Alertas">
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">Central de Alertas</h1>
            <p className="text-sm text-muted-foreground">
              Notificações de anomalias, performance e relatórios — alertas desaparecem ao marcar como lido
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
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "Alertas pendentes", value: unread.length, color: "text-primary" },
            { label: "Críticos", value: criticalCount, color: criticalCount > 0 ? "text-red-400" : "text-muted-foreground" },
          ].map((stat) => (
            <Card key={stat.label}>
              <CardContent className="p-4">
                <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Alert list */}
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-20 bg-muted rounded-xl animate-pulse" />
            ))}
          </div>
        ) : unread.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <BellOff className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
              <p className="text-sm font-medium text-foreground mb-2">Nenhum alerta pendente</p>
              <p className="text-xs text-muted-foreground">
                Novos alertas aparecerão aqui quando anomalias forem detectadas automaticamente.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div>
            <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <Bell className="w-4 h-4 text-primary" />
              Alertas Pendentes ({unread.length})
            </h2>
            <div className="space-y-2">
              {unread.map((alert) => {
                const tc = typeConfig[alert.type] ?? typeConfig.SYSTEM;
                const sc = severityConfig[alert.severity] ?? severityConfig.INFO;
                const AlertIcon = tc.icon;
                return (
                  <Card
                    key={alert.id}
                    className={`border-primary/20 bg-primary/5 ${
                      alert.severity === "CRITICAL" ? "border-red-400/30 bg-red-400/5" : ""
                    }`}
                  >
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
                          className="h-7 text-xs flex-shrink-0 text-muted-foreground hover:text-foreground"
                          onClick={() => markRead.mutate({ alertId: alert.id })}
                          disabled={markRead.isPending}
                        >
                          <CheckCheck className="w-3.5 h-3.5 mr-1" />
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
      </div>
    </MetaDashboardLayout>
  );
}
