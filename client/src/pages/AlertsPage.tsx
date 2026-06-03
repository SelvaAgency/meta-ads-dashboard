import { MetaDashboardLayout } from "@/components/MetaDashboardLayout";
import { trpc } from "@/lib/trpc";
import { useSelectedAccount } from "@/hooks/useSelectedAccount";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertTriangle,
  Bell,
  BellOff,
  CheckCheck,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  CreditCard,
  Eye,
  FileX,
  FolderOpen,
  Image,
  Info,
  Instagram,
  Link2Off,
  Pause,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { useState } from "react";
import { PeriodFilter, usePeriodFilter } from "@/components/PeriodFilter";
import { toast } from "sonner";

// ─── Alertas técnicos ─────────────────────────────────────────────────────────

const alertTypeConfig: Record<
  string,
  { icon: React.ComponentType<{ className?: string }>; color: string; label: string; bg: string }
> = {
  CAMPAIGN_PAUSED: { icon: Pause,        color: "text-red-400",          label: "Campanha com Erro",         bg: "bg-red-500/10" },
  BUDGET_WARNING:  { icon: Wallet,       color: "text-yellow-400",       label: "Saldo Baixo",               bg: "bg-yellow-500/10" },
  PAYMENT_FAILED:  { icon: CreditCard,   color: "text-red-400",          label: "Falha de Pagamento",        bg: "bg-red-500/10" },
  AD_REJECTED:     { icon: FileX,        color: "text-red-400",          label: "Criativo Rejeitado",        bg: "bg-red-500/10" },
  AD_ERROR:        { icon: AlertTriangle,color: "text-yellow-400",       label: "Erro em Anúncio / Conjunto",bg: "bg-yellow-500/10" },
  PAGE_UNLINKED:   { icon: Link2Off,     color: "text-red-400",          label: "Página Desvinculada da BM", bg: "bg-red-500/10" },
  INSTAGRAM_UNLINKED: { icon: Instagram, color: "text-pink-400",         label: "Instagram Desvinculado",    bg: "bg-pink-500/10" },
  REPORT:          { icon: Bell,         color: "text-blue-400",         label: "Relatório",                 bg: "bg-blue-500/10" },
  SYNC_ERROR:      { icon: Image,        color: "text-muted-foreground", label: "Erro de Sync",              bg: "bg-muted/30" },
  SYSTEM:          { icon: Info,         color: "text-muted-foreground", label: "Sistema",                   bg: "bg-muted/30" },
};

const TECHNICAL_ALERT_TYPES = new Set([
  "CAMPAIGN_PAUSED", "PAYMENT_FAILED", "AD_REJECTED", "AD_ERROR", "BUDGET_WARNING", "PIXEL_ERROR",
]);
const CRITICAL_TYPES = new Set(["CAMPAIGN_PAUSED", "PAYMENT_FAILED", "AD_REJECTED", "PIXEL_ERROR"]);
const WARNING_TYPES  = new Set(["AD_ERROR", "BUDGET_WARNING"]);

// ─── Anomalias de performance ─────────────────────────────────────────────────

const anomalyTypeConfig: Record<
  string,
  { icon: React.ComponentType<{ className?: string }>; label: string; color: string; bg: string }
> = {
  ROAS_DROP:        { icon: TrendingDown, label: "Queda de ROAS",        color: "text-red-400",    bg: "bg-red-400/10" },
  RESULTS_DROP:     { icon: TrendingDown, label: "Queda de Resultados",  color: "text-red-400",    bg: "bg-red-400/10" },
  PERFORMANCE_DROP: { icon: TrendingDown, label: "Queda de Performance", color: "text-orange-400", bg: "bg-orange-400/10" },
  CPA_SPIKE:        { icon: TrendingUp,   label: "Pico de CPA",          color: "text-orange-400", bg: "bg-orange-400/10" },
  CTR_DROP:         { icon: TrendingDown, label: "Queda de CTR",         color: "text-yellow-400", bg: "bg-yellow-400/10" },
  SPEND_SPIKE:      { icon: TrendingUp,   label: "Pico de Investimento", color: "text-yellow-400", bg: "bg-yellow-400/10" },
  FREQUENCY_HIGH:   { icon: AlertTriangle,label: "Frequência Elevada",   color: "text-yellow-400", bg: "bg-yellow-400/10" },
  CONVERSION_DROP:  { icon: TrendingDown, label: "Queda de Conversões",  color: "text-red-400",    bg: "bg-red-400/10" },
  DELIVERY_CHANGE:  { icon: AlertTriangle,label: "Mudança de Entrega",   color: "text-orange-400", bg: "bg-orange-400/10" },
  BUDGET_EXHAUSTED: { icon: AlertTriangle,label: "Orçamento Esgotado",   color: "text-yellow-400", bg: "bg-yellow-400/10" },
};

type AnomalyItem = {
  id: number;
  type: string;
  severity: string;
  title: string;
  description: string;
  detectedAt: Date;
  isRead: boolean;
  resolvedAt: Date | null;
  metricName: string | null;
  currentValue: string | null;
  previousValue: string | null;
  changePercent: string | null;
};

// ─── Anomaly sub-components ───────────────────────────────────────────────────

function AnomalyCard({
  anomaly,
  markRead,
  accounts,
}: {
  anomaly: AnomalyItem;
  markRead: { mutate: (args: { anomalyId: number }) => void; isPending?: boolean };
  accounts?: { id: number; accountName?: string | null }[];
}) {
  const tc = anomalyTypeConfig[anomaly.type];
  const AnomalyIcon = tc?.icon ?? AlertTriangle;
  return (
    <Card className="border border-border/50">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${tc?.bg ?? "bg-muted/30"}`}>
            <AnomalyIcon className={`w-4 h-4 ${tc?.color ?? "text-muted-foreground"}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <p className="text-sm font-semibold text-foreground">{anomaly.title}</p>
              {tc && (
                <Badge variant="outline" className="text-xs text-muted-foreground border-border/50">
                  {tc.label}
                </Badge>
              )}
              {(() => {
                const acct = accounts?.find((a) => a.id === (anomaly as any).accountId);
                return acct?.accountName ? (
                  <Badge variant="secondary" className="text-xs bg-primary/10 text-primary border-0">
                    {acct.accountName}
                  </Badge>
                ) : null;
              })()}
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">{anomaly.description}</p>
            <p className="text-xs text-muted-foreground/60 mt-1.5">
              Detectada em {new Date(anomaly.detectedAt).toLocaleString("pt-BR")}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs text-muted-foreground hover:text-foreground flex-shrink-0"
            onClick={() => markRead.mutate({ anomalyId: anomaly.id })}
            disabled={markRead.isPending}
            title="Marcar como visto — move para o histórico"
          >
            <Eye className="w-3.5 h-3.5" />
            Visto
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function HistoryCard({ anomaly, accounts }: { anomaly: AnomalyItem; accounts?: { id: number; accountName?: string | null }[] }) {
  const tc = anomalyTypeConfig[anomaly.type];
  const detectedMs = new Date(anomaly.detectedAt).getTime();
  const daysLeft = Math.max(0, Math.ceil((detectedMs + 30 * 24 * 60 * 60 * 1000 - Date.now()) / (24 * 60 * 60 * 1000)));
  return (
    <Card className="border-border/30 opacity-70 hover:opacity-100 transition-opacity">
      <CardContent className="p-3">
        <div className="flex items-center gap-3">
          <div className={`w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 ${tc?.bg ?? "bg-muted/30"}`}>
            {tc ? <tc.icon className={`w-3.5 h-3.5 ${tc.color}`} /> : <AlertTriangle className="w-3.5 h-3.5 text-muted-foreground" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-xs font-medium text-foreground truncate">{anomaly.title}</p>
              {tc && (
                <Badge variant="outline" className="text-xs text-muted-foreground border-border/40 py-0">
                  {tc.label}
                </Badge>
              )}
              {(() => {
                const acct = accounts?.find((a) => a.id === (anomaly as any).accountId);
                return acct?.accountName ? (
                  <Badge variant="secondary" className="text-xs bg-primary/10 text-primary border-0 py-0">
                    {acct.accountName}
                  </Badge>
                ) : null;
              })()}
            </div>
            <p className="text-xs text-muted-foreground/70 mt-0.5">
              {new Date(anomaly.detectedAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}
              {" · "}
              <span className="text-muted-foreground/50">expira em {daysLeft}d</span>
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AlertsPage() {
  const utils = trpc.useUtils();
  const { selectedAccountId, accounts } = useSelectedAccount();
  const { period, setPeriod, isInRange } = usePeriodFilter("30d");

  // ── Alerts state ──
  const [alertFilter, setAlertFilter] = useState<string | null>(null);

  const queryKey = { accountId: selectedAccountId! };
  const { data: allAlerts, isLoading: alertsLoading } = trpc.alerts.list.useQuery(queryKey, {
    enabled: !!selectedAccountId,
    refetchInterval: 30_000,
  });

  const alerts = (allAlerts ?? []).filter((a) => TECHNICAL_ALERT_TYPES.has(a.type) && isInRange(a.createdAt));
  const criticalAlerts = alerts.filter((a) => CRITICAL_TYPES.has(a.type));
  const warningAlerts  = alerts.filter((a) => WARNING_TYPES.has(a.type));

  const markRead = trpc.alerts.markRead.useMutation({
    onMutate: async ({ alertId }) => {
      await utils.alerts.list.cancel(queryKey);
      const prev = utils.alerts.list.getData(queryKey);
      utils.alerts.list.setData(queryKey, (old) => old ? old.filter((a: { id: number }) => a.id !== alertId) : []);
      return { prev };
    },
    onError: (_err, _vars, ctx) => { if (ctx?.prev) utils.alerts.list.setData(queryKey, ctx.prev); },
    onSettled: () => { utils.alerts.list.invalidate(queryKey); utils.alerts.unreadCount.invalidate(); },
  });

  const markAllRead = trpc.alerts.markAllRead.useMutation({
    onMutate: async () => {
      await utils.alerts.list.cancel(queryKey);
      const prev = utils.alerts.list.getData(queryKey);
      utils.alerts.list.setData(queryKey, []);
      return { prev };
    },
    onError: (_err, _vars, ctx) => { if (ctx?.prev) utils.alerts.list.setData(queryKey, ctx.prev); },
    onSettled: () => {
      utils.alerts.list.invalidate(queryKey);
      utils.alerts.unreadCount.invalidate();
      toast.success("Todos os alertas removidos.");
    },
  });

  const alertStatsConfig = [
    { key: "critical", label: "Críticos / Erros", value: criticalAlerts.length, color: criticalAlerts.length > 0 ? "text-red-400" : "text-muted-foreground" },
    { key: "warning",  label: "Avisos",            value: warningAlerts.length,  color: warningAlerts.length > 0  ? "text-yellow-400" : "text-muted-foreground" },
  ];

  const filteredAlerts = (() => {
    if (!alertFilter) return null;
    if (alertFilter === "critical") return criticalAlerts;
    if (alertFilter === "warning")  return warningAlerts;
    return null;
  })();

  const renderAlert = (alert: (typeof alerts)[number]) => {
    const tc = alertTypeConfig[alert.type] ?? alertTypeConfig.SYSTEM;
    const AlertIcon = tc.icon;
    return (
      <Card key={alert.id} className="border border-border/50">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className={`w-9 h-9 rounded-lg ${tc.bg} flex items-center justify-center flex-shrink-0`}>
              <AlertIcon className={`w-4 h-4 ${tc.color}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <p className="text-sm font-semibold text-foreground">{alert.title}</p>
                <Badge variant="outline" className="text-xs text-muted-foreground border-border/50">{tc.label}</Badge>
                {(() => {
                  const acct = accounts?.find((a: { id: number }) => a.id === alert.accountId);
                  return acct?.accountName ? (
                    <Badge variant="secondary" className="text-xs bg-primary/10 text-primary border-0">{acct.accountName}</Badge>
                  ) : null;
                })()}
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{alert.message}</p>
              {(() => {
                const cur = (alert as Record<string, unknown>).metricCurrent as string | undefined;
                const ref = (alert as Record<string, unknown>).metricReference as string | undefined;
                if (!cur && !ref) return null;
                return <p className="text-xs text-muted-foreground/70 mt-1">{cur}{ref ? ` · Referência: ${ref}` : ""}</p>;
              })()}
              <p className="text-xs text-muted-foreground/50 mt-1.5">
                Detectado em {new Date(alert.createdAt).toLocaleString("pt-BR")}
              </p>
            </div>
            <Button
              variant="ghost" size="sm"
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

  // ── Anomalies state ──
  const [anomalyFilter, setAnomalyFilter] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const { data: anomalies, isLoading: anomaliesLoading } = trpc.anomalies.list.useQuery(
    { accountId: selectedAccountId! },
    { enabled: !!selectedAccountId, refetchInterval: 5 * 60 * 1000, refetchIntervalInBackground: false }
  );

  const markAnomalyRead = trpc.anomalies.markRead.useMutation({
    onMutate: async ({ anomalyId }) => {
      await utils.anomalies.list.cancel({ accountId: selectedAccountId! });
      const prev = utils.anomalies.list.getData({ accountId: selectedAccountId! });
      utils.anomalies.list.setData({ accountId: selectedAccountId! }, (old) =>
        old ? old.map((a) => a.id === anomalyId ? { ...a, isRead: true } : a) : []
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) utils.anomalies.list.setData({ accountId: selectedAccountId! }, ctx.prev);
    },
    onSettled: () => utils.anomalies.list.invalidate({ accountId: selectedAccountId! }),
  });

  const dateFiltered = (anomalies ?? []).filter((a) => isInRange(a.detectedAt));
  const unreadAnomalies = dateFiltered.filter((a) => !a.isRead && !a.isResolved);
  const historyAnomalies = dateFiltered.filter((a) => a.isRead);

  const anomalyStatsConfig = [
    { key: "active",  label: "Anomalias Ativas", value: unreadAnomalies.length,  color: unreadAnomalies.length > 0 ? "text-yellow-400" : "text-muted-foreground" },
    { key: "history", label: "No Histórico",      value: historyAnomalies.length, color: "text-muted-foreground" },
  ];

  const filteredAnomalies = (() => {
    if (!anomalyFilter) return null;
    if (anomalyFilter === "active")  return unreadAnomalies;
    if (anomalyFilter === "history") return historyAnomalies;
    return null;
  })();

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <MetaDashboardLayout title="Alertas">
      <div className="space-y-8">

        {/* ── Shared period filter ────────────────────────────────────────── */}
        <PeriodFilter period={period} onChange={setPeriod} compact />

        {/* ══════════════════════════════════════════════════════════════════
            SEÇÃO 1 — Alertas Técnicos
        ══════════════════════════════════════════════════════════════════ */}
        <div className="space-y-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-xl font-bold text-foreground">Alertas Técnicos</h1>
              <p className="text-sm text-muted-foreground">
                Erros operacionais detectados automaticamente — campanha parada, pagamento, criativos rejeitados, vínculos quebrados
              </p>
              {(() => {
                const acct = accounts?.find((a: { id: number }) => a.id === selectedAccountId);
                return acct?.accountName ? (
                  <p className="text-xs text-primary font-medium mt-1">Conta: {acct.accountName}</p>
                ) : null;
              })()}
            </div>
            {alerts.length > 0 && (
              <Button
                variant="outline" size="sm" className="gap-2"
                onClick={() => markAllRead.mutate({ accountId: selectedAccountId ?? undefined })}
                disabled={markAllRead.isPending}
              >
                <CheckCheck className="w-3.5 h-3.5" />
                Marcar todos como lidos
              </Button>
            )}
          </div>

          {/* Alert filter cards */}
          <div className="grid grid-cols-2 gap-3">
            {alertStatsConfig.map((stat) => (
              <Card
                key={stat.key}
                className={`cursor-pointer transition-all duration-150 hover:border-primary/50 ${
                  alertFilter === stat.key ? "border-primary ring-1 ring-primary/30 bg-primary/5" : ""
                }`}
                onClick={() => setAlertFilter((p) => p === stat.key ? null : stat.key)}
              >
                <CardContent className="p-4">
                  <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Alert list */}
          {alertsLoading ? (
            <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-20 bg-muted rounded-xl animate-pulse" />)}</div>
          ) : filteredAlerts !== null ? (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full inline-block ${alertFilter === "critical" ? "bg-red-400" : "bg-yellow-400"}`} />
                  {alertStatsConfig.find((s) => s.key === alertFilter)?.label} ({filteredAlerts.length})
                </h2>
                <button onClick={() => setAlertFilter(null)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                  Limpar filtro
                </button>
              </div>
              {filteredAlerts.length === 0 ? (
                <Card><CardContent className="py-12 text-center">
                  <BellOff className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-sm font-medium text-foreground">Nenhum alerta nesta categoria</p>
                </CardContent></Card>
              ) : (
                <div className="space-y-2">{filteredAlerts.map(renderAlert)}</div>
              )}
            </div>
          ) : alerts.length === 0 ? (
            <Card><CardContent className="py-16 text-center">
              <BellOff className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
              <p className="text-sm font-medium text-foreground mb-2">Nenhum alerta técnico pendente</p>
              <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                Alertas aparecem automaticamente quando há campanhas paradas, saldo baixo, falha de pagamento, criativos rejeitados ou vínculos quebrados.
              </p>
            </CardContent></Card>
          ) : (
            <div className="space-y-2">{alerts.map(renderAlert)}</div>
          )}
        </div>

        {/* Divisor visual */}
        <div className="border-t border-border/40" />

        {/* ══════════════════════════════════════════════════════════════════
            SEÇÃO 2 — Anomalias de Performance
        ══════════════════════════════════════════════════════════════════ */}
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-foreground">Anomalias de Performance</h2>
              <p className="text-sm text-muted-foreground">
                Desvios detectados automaticamente com validação em 3 janelas (7/14/30 dias) — ROAS, resultados, CPA, CTR e frequência
              </p>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <RefreshCw className="w-3 h-3" />
              Detecção automática a cada hora
            </div>
          </div>

          {/* Anomaly filter cards */}
          <div className="grid grid-cols-2 gap-3">
            {anomalyStatsConfig.map((stat) => (
              <Card
                key={stat.key}
                className={`cursor-pointer transition-all duration-150 hover:border-primary/50 ${
                  anomalyFilter === stat.key ? "border-primary ring-1 ring-primary/30 bg-primary/5" : ""
                }`}
                onClick={() => setAnomalyFilter((p) => p === stat.key ? null : stat.key)}
              >
                <CardContent className="p-4">
                  <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Anomaly list */}
          {filteredAnomalies !== null ? (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  {anomalyFilter === "history"
                    ? <FolderOpen className="w-4 h-4 text-muted-foreground" />
                    : <AlertTriangle className="w-4 h-4 text-yellow-400" />}
                  {anomalyStatsConfig.find((s) => s.key === anomalyFilter)?.label} ({filteredAnomalies.length})
                </h3>
                <button onClick={() => setAnomalyFilter(null)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                  Limpar filtro
                </button>
              </div>
              {filteredAnomalies.length === 0 ? (
                <Card><CardContent className="py-12 text-center">
                  <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
                  <p className="text-sm font-medium text-foreground">Nenhuma anomalia nesta categoria</p>
                </CardContent></Card>
              ) : (
                <div className="space-y-2">
                  {filteredAnomalies.map((anomaly) =>
                    anomalyFilter === "history"
                      ? <HistoryCard key={anomaly.id} anomaly={anomaly} accounts={accounts} />
                      : <AnomalyCard key={anomaly.id} anomaly={anomaly} markRead={markAnomalyRead} accounts={accounts} />
                  )}
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Active anomalies */}
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-yellow-400" />
                  Anomalias Ativas ({unreadAnomalies.length})
                </h3>
                {anomaliesLoading ? (
                  <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-20 bg-muted rounded-xl animate-pulse" />)}</div>
                ) : unreadAnomalies.length === 0 ? (
                  <Card><CardContent className="py-12 text-center">
                    <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
                    <p className="text-sm font-medium text-foreground">Nenhuma anomalia ativa</p>
                    <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
                      Anomalias são detectadas automaticamente a cada hora, validadas em 3 janelas de tempo (7, 14 e 30 dias).
                    </p>
                  </CardContent></Card>
                ) : (
                  <div className="space-y-2">
                    {unreadAnomalies.map((anomaly) => <AnomalyCard key={anomaly.id} anomaly={anomaly} markRead={markAnomalyRead} accounts={accounts} />)}
                  </div>
                )}
              </div>

              {/* Histórico colapsável */}
              <div>
                <button
                  onClick={() => setHistoryOpen((v) => !v)}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-border/50 bg-muted/20 hover:bg-muted/40 transition-colors group"
                >
                  <div className="flex items-center gap-2.5">
                    <FolderOpen className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                    <span className="text-sm font-medium text-foreground">Histórico</span>
                    <span className="text-xs text-muted-foreground">
                      ({historyAnomalies.length} {historyAnomalies.length === 1 ? "anomalia vista" : "anomalias vistas"} · ficam por 30 dias)
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock className="w-3 h-3" />
                    {historyOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </div>
                </button>
                {historyOpen && (
                  <div className="mt-2 space-y-2">
                    {historyAnomalies.length === 0 ? (
                      <Card className="border-border/30"><CardContent className="py-8 text-center">
                        <FolderOpen className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                        <p className="text-xs text-muted-foreground">Anomalias marcadas como vistas aparecerão aqui por 30 dias.</p>
                      </CardContent></Card>
                    ) : (
                      historyAnomalies.map((anomaly) => <HistoryCard key={anomaly.id} anomaly={anomaly} accounts={accounts} />)
                    )}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Info box */}
          <Card className="border-border/30 bg-muted/20">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <Info className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs font-medium text-foreground mb-1">Como funciona a detecção</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    A cada hora, o sistema compara métricas atuais com as médias de <strong className="text-foreground">7, 14 e 30 dias</strong> anteriores.
                    Uma anomalia é confirmada apenas quando detectada em <strong className="text-foreground">pelo menos 2 das 3 janelas</strong>, evitando falsos positivos.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

      </div>
    </MetaDashboardLayout>
  );
}
