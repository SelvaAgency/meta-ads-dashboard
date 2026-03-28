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
  CreditCard,
  FileX,
  Image,
  Info,
  Instagram,
  Link2Off,
  Pause,
  TrendingDown,
  Wallet,
  Wifi,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

// ─── Type config: icon + color + human-readable label for each alert type ─────
const typeConfig: Record<
  string,
  { icon: React.ComponentType<{ className?: string }>; color: string; label: string; bg: string }
> = {
  // Anomalias de métricas (geradas pelo módulo de anomalias)
  ANOMALY: {
    icon: TrendingDown,
    color: "text-orange-400",
    label: "Anomalia de Métrica",
    bg: "bg-orange-500/10",
  },
  // Erros técnicos operacionais
  CAMPAIGN_PAUSED: {
    icon: Pause,
    color: "text-red-400",
    label: "Campanha com Erro",
    bg: "bg-red-500/10",
  },
  BUDGET_WARNING: {
    icon: Wallet,
    color: "text-yellow-400",
    label: "Saldo Baixo",
    bg: "bg-yellow-500/10",
  },
  PAYMENT_FAILED: {
    icon: CreditCard,
    color: "text-red-400",
    label: "Falha de Pagamento",
    bg: "bg-red-500/10",
  },
  AD_REJECTED: {
    icon: FileX,
    color: "text-red-400",
    label: "Anúncio Rejeitado",
    bg: "bg-red-500/10",
  },
  AD_ERROR: {
    icon: AlertTriangle,
    color: "text-yellow-400",
    label: "Erro em Anúncio",
    bg: "bg-yellow-500/10",
  },
  PAGE_UNLINKED: {
    icon: Link2Off,
    color: "text-red-400",
    label: "Página Desvinculada",
    bg: "bg-red-500/10",
  },
  INSTAGRAM_UNLINKED: {
    icon: Instagram,
    color: "text-pink-400",
    label: "Instagram Desvinculado",
    bg: "bg-pink-500/10",
  },
  PIXEL_ERROR: {
    icon: Wifi,
    color: "text-red-400",
    label: "Erro de Pixel",
    bg: "bg-red-500/10",
  },
  ADSET_NO_DELIVERY: {
    icon: Zap,
    color: "text-yellow-400",
    label: "Conjunto sem Entrega",
    bg: "bg-yellow-500/10",
  },
  // Outros
  REPORT: {
    icon: Bell,
    color: "text-blue-400",
    label: "Relatório",
    bg: "bg-blue-500/10",
  },
  SYNC_ERROR: {
    icon: Image,
    color: "text-muted-foreground",
    label: "Erro de Sync",
    bg: "bg-muted/30",
  },
  SYSTEM: {
    icon: Info,
    color: "text-muted-foreground",
    label: "Sistema",
    bg: "bg-muted/30",
  },
};

const severityConfig: Record<string, { label: string; color: string }> = {
  CRITICAL: { label: "Crítico", color: "text-red-400 border-red-400/30" },
  WARNING: { label: "Atenção", color: "text-yellow-400 border-yellow-400/30" },
  INFO: { label: "Info", color: "text-blue-400 border-blue-400/30" },
};

// Group alerts by category for better UX
const TECHNICAL_TYPES = new Set([
  "CAMPAIGN_PAUSED",
  "PAYMENT_FAILED",
  "AD_REJECTED",
  "AD_ERROR",
  "PAGE_UNLINKED",
  "INSTAGRAM_UNLINKED",
  "PIXEL_ERROR",
  "ADSET_NO_DELIVERY",
  "BUDGET_WARNING",
]);

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

  const unread = alerts ?? [];
  const criticalCount = unread.filter((a) => a.severity === "CRITICAL").length;

  // Split into technical errors vs metric anomalies
  const technicalAlerts = unread.filter((a) => TECHNICAL_TYPES.has(a.type));
  const anomalyAlerts = unread.filter((a) => !TECHNICAL_TYPES.has(a.type));

  const renderAlert = (alert: (typeof unread)[number]) => {
    const tc = typeConfig[alert.type] ?? typeConfig.SYSTEM;
    const sc = severityConfig[alert.severity] ?? severityConfig.INFO;
    const AlertIcon = tc.icon;
    return (
      <Card
        key={alert.id}
        className={`border transition-colors ${
          alert.severity === "CRITICAL"
            ? "border-red-400/30 bg-red-400/5"
            : "border-primary/20 bg-primary/5"
        }`}
      >
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className={`w-9 h-9 rounded-lg ${tc.bg} flex items-center justify-center flex-shrink-0`}>
              <AlertIcon className={`w-4 h-4 ${tc.color}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <p className="text-sm font-semibold text-foreground">{alert.title}</p>
                <Badge variant="outline" className={`text-xs ${sc.color}`}>
                  {sc.label}
                </Badge>
                <Badge variant="outline" className="text-xs text-muted-foreground border-border/50">
                  {tc.label}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{alert.message}</p>
              <p className="text-xs text-muted-foreground/50 mt-1.5">
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
  };

  return (
    <MetaDashboardLayout title="Alertas">
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">Central de Alertas</h1>
            <p className="text-sm text-muted-foreground">
              Erros técnicos e anomalias de métricas — alertas desaparecem ao marcar como lido
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
            { label: "Alertas pendentes", value: unread.length, color: "text-primary" },
            { label: "Erros técnicos", value: technicalAlerts.length, color: technicalAlerts.length > 0 ? "text-red-400" : "text-muted-foreground" },
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
                Alertas técnicos e anomalias de métricas aparecerão aqui quando detectados automaticamente.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {/* Technical errors section */}
            {technicalAlerts.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-400" />
                  Erros Técnicos ({technicalAlerts.length})
                </h2>
                <p className="text-xs text-muted-foreground mb-3">
                  Problemas operacionais que requerem ação imediata — campanha parada, pagamento, criativos rejeitados, vínculos quebrados.
                </p>
                <div className="space-y-2">
                  {technicalAlerts.map(renderAlert)}
                </div>
              </div>
            )}

            {/* Metric anomalies section */}
            {anomalyAlerts.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <TrendingDown className="w-4 h-4 text-orange-400" />
                  Anomalias de Métricas ({anomalyAlerts.length})
                </h2>
                <p className="text-xs text-muted-foreground mb-3">
                  Desvios estatísticos detectados com base na análise de 7 dias — ROAS, CPA, CTR, resultados fora do padrão.
                </p>
                <div className="space-y-2">
                  {anomalyAlerts.map(renderAlert)}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </MetaDashboardLayout>
  );
}
