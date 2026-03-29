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
  Wallet,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

// ─── Alertas técnicos operacionais ────────────────────────────────────────────
// Apenas erros que exigem ação imediata do gestor:
// - Campanha parada por erro (P1 — Crítica)
// - Saldo abaixo de R$200 (P1 — Crítica)
// - Falha de pagamento (P1 — Crítica)
// - Criativo rejeitado (P1 — Crítica)
// - Erros em conjuntos ou anúncios (P2 — Alta)
// - Página desvinculada da BM (P1 — Crítica)
// - Instagram desvinculado da página (P2 — Alta)
//
// NÃO aparecem aqui: anomalias de métricas (ROAS, CPA, CTR, resultados).
// Essas ficam na aba Anomalias.
// ─────────────────────────────────────────────────────────────────────────────

const typeConfig: Record<
  string,
  { icon: React.ComponentType<{ className?: string }>; color: string; label: string; bg: string }
> = {
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
    label: "Criativo Rejeitado",
    bg: "bg-red-500/10",
  },
  AD_ERROR: {
    icon: AlertTriangle,
    color: "text-yellow-400",
    label: "Erro em Anúncio / Conjunto",
    bg: "bg-yellow-500/10",
  },
  PAGE_UNLINKED: {
    icon: Link2Off,
    color: "text-red-400",
    label: "Página Desvinculada da BM",
    bg: "bg-red-500/10",
  },
  INSTAGRAM_UNLINKED: {
    icon: Instagram,
    color: "text-pink-400",
    label: "Instagram Desvinculado",
    bg: "bg-pink-500/10",
  },
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

// Prioridade P1 = Crítica (ação imediata), P2 = Alta (resolver em breve), P3 = Média (monitorar)
const priorityConfig: Record<
  string,
  { label: string; badge: string; border: string; bg: string; dot: string }
> = {
  CRITICAL: {
    label: "P1 — Crítica",
    badge: "text-red-400 border-red-400/40 bg-red-400/10",
    border: "border-red-400/30",
    bg: "bg-red-400/5",
    dot: "bg-red-400",
  },
  WARNING: {
    label: "P2 — Alta",
    badge: "text-orange-400 border-orange-400/40 bg-orange-400/10",
    border: "border-orange-400/20",
    bg: "bg-orange-400/5",
    dot: "bg-orange-400",
  },
  INFO: {
    label: "P3 — Média",
    badge: "text-blue-400 border-blue-400/40 bg-blue-400/10",
    border: "border-blue-400/20",
    bg: "bg-blue-400/5",
    dot: "bg-blue-400",
  },
};

// Tipos que são alertas técnicos operacionais (exibidos nesta aba)
const TECHNICAL_ALERT_TYPES = new Set([
  "CAMPAIGN_PAUSED",
  "PAYMENT_FAILED",
  "AD_REJECTED",
  "AD_ERROR",
  "PAGE_UNLINKED",
  "INSTAGRAM_UNLINKED",
  "BUDGET_WARNING",
]);

export default function AlertsPage() {
  const utils = trpc.useUtils();

  const { data: allAlerts, isLoading } = trpc.alerts.list.useQuery();

  // Filtrar apenas alertas técnicos operacionais
  const alerts = (allAlerts ?? []).filter((a) => TECHNICAL_ALERT_TYPES.has(a.type));

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

  const criticalAlerts = alerts.filter((a) => a.severity === "CRITICAL");
  const warningAlerts = alerts.filter((a) => a.severity === "WARNING");
  const infoAlerts = alerts.filter((a) => a.severity === "INFO");

  const renderAlert = (alert: (typeof alerts)[number]) => {
    const tc = typeConfig[alert.type] ?? typeConfig.SYSTEM;
    const pc = priorityConfig[alert.severity] ?? priorityConfig.INFO;
    const AlertIcon = tc.icon;
    // suggestedAction may exist on the alert object if the backend sends it
    const suggestedAction = (alert as Record<string, unknown>).suggestedAction as string | undefined;

    return (
      <Card
        key={alert.id}
        className={`border transition-colors ${pc.border} ${pc.bg}`}
      >
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            {/* Priority dot */}
            <div className="relative flex-shrink-0">
              <div className={`w-9 h-9 rounded-lg ${tc.bg} flex items-center justify-center`}>
                <AlertIcon className={`w-4 h-4 ${tc.color}`} />
              </div>
              <div className={`absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full ${pc.dot} ring-2 ring-background`} />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <p className="text-sm font-semibold text-foreground">{alert.title}</p>
                <Badge variant="outline" className={`text-xs ${pc.badge}`}>
                  {pc.label}
                </Badge>
                <Badge variant="outline" className="text-xs text-muted-foreground border-border/50">
                  {tc.label}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{alert.message}</p>
              {suggestedAction && (
                <div className="mt-2 flex items-start gap-1.5">
                  <Zap className="w-3 h-3 text-primary flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-primary/80 leading-relaxed">{suggestedAction}</p>
                </div>
              )}
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
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-foreground">Alertas Técnicos</h1>
            <p className="text-sm text-muted-foreground">
              Erros operacionais que requerem ação — campanha parada, pagamento, criativos rejeitados, vínculos quebrados
            </p>
          </div>
          {alerts.length > 0 && (
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
            {
              label: "P1 — Críticos",
              value: criticalAlerts.length,
              color: criticalAlerts.length > 0 ? "text-red-400" : "text-muted-foreground",
            },
            {
              label: "P2 — Alta",
              value: warningAlerts.length,
              color: warningAlerts.length > 0 ? "text-orange-400" : "text-muted-foreground",
            },
            {
              label: "P3 — Média",
              value: infoAlerts.length,
              color: infoAlerts.length > 0 ? "text-blue-400" : "text-muted-foreground",
            },
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
        ) : alerts.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <BellOff className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
              <p className="text-sm font-medium text-foreground mb-2">Nenhum alerta técnico pendente</p>
              <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                Alertas aparecem automaticamente quando há campanhas paradas, saldo baixo, falha de pagamento, criativos rejeitados, erros em conjuntos ou vínculos quebrados.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {/* P1 — Críticos */}
            {criticalAlerts.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />
                  P1 — Críticos · Ação Imediata ({criticalAlerts.length})
                </h2>
                <div className="space-y-2">
                  {criticalAlerts.map(renderAlert)}
                </div>
              </div>
            )}

            {/* P2 — Alta */}
            {warningAlerts.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-orange-400 inline-block" />
                  P2 — Alta · Resolver em Breve ({warningAlerts.length})
                </h2>
                <div className="space-y-2">
                  {warningAlerts.map(renderAlert)}
                </div>
              </div>
            )}

            {/* P3 — Média */}
            {infoAlerts.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />
                  P3 — Média · Monitorar ({infoAlerts.length})
                </h2>
                <div className="space-y-2">
                  {infoAlerts.map(renderAlert)}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Info box */}
        <Card className="border-border/30 bg-muted/20">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Info className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs font-medium text-foreground mb-1">O que é monitorado aqui</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Campanha pausada por erro · Saldo abaixo de R$200 · Falha de pagamento · Criativo rejeitado · Erros em conjuntos ou anúncios · Página desvinculada da BM · Instagram desvinculado da página.
                  <br />
                  <span className="text-muted-foreground/70">
                    Quedas de ROAS, CPA, CTR e resultados são monitoradas na aba{" "}
                    <strong className="text-foreground">Anomalias</strong>.
                  </span>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </MetaDashboardLayout>
  );
}
