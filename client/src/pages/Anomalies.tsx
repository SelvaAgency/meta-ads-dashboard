import { MetaDashboardLayout } from "@/components/MetaDashboardLayout";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Eye,
  FolderOpen,
  Info,
  Link2,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { useSelectedAccount } from "@/hooks/useSelectedAccount";

// ─── Anomalias de métricas de campanha ────────────────────────────────────────
// Detectadas automaticamente com validação multi-período (7/14/30 dias).
// Uma anomalia é confirmada apenas quando detectada em ≥ 2 das 3 janelas.
// Anomalias não lidas = ativas. Anomalias lidas = histórico (30 dias).
// Alertas apenas INFORMAM — ações sugeridas ficam na aba Sugestões IA.
// ─────────────────────────────────────────────────────────────────────────────

const typeConfig: Record<
  string,
  {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    color: string;
    bg: string;
  }
> = {
  ROAS_DROP:        { icon: TrendingDown, label: "Queda de ROAS",         color: "text-red-400",    bg: "bg-red-400/10" },
  RESULTS_DROP:     { icon: TrendingDown, label: "Queda de Resultados",   color: "text-red-400",    bg: "bg-red-400/10" },
  PERFORMANCE_DROP: { icon: TrendingDown, label: "Queda de Performance",  color: "text-orange-400", bg: "bg-orange-400/10" },
  CPA_SPIKE:        { icon: TrendingUp,   label: "Pico de CPA",           color: "text-orange-400", bg: "bg-orange-400/10" },
  CTR_DROP:         { icon: TrendingDown, label: "Queda de CTR",          color: "text-yellow-400", bg: "bg-yellow-400/10" },
  SPEND_SPIKE:      { icon: TrendingUp,   label: "Pico de Investimento",  color: "text-yellow-400", bg: "bg-yellow-400/10" },
  FREQUENCY_HIGH:   { icon: AlertTriangle,label: "Frequência Elevada",    color: "text-yellow-400", bg: "bg-yellow-400/10" },
  CONVERSION_DROP:  { icon: TrendingDown, label: "Queda de Conversões",   color: "text-red-400",    bg: "bg-red-400/10" },
  DELIVERY_CHANGE:  { icon: AlertTriangle,label: "Mudança de Entrega",    color: "text-orange-400", bg: "bg-orange-400/10" },
  BUDGET_EXHAUSTED: { icon: AlertTriangle,label: "Orçamento Esgotado",    color: "text-yellow-400", bg: "bg-yellow-400/10" },
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

export default function Anomalies() {
  const [, navigate] = useLocation();
  const { selectedAccountId, accounts } = useSelectedAccount();
  const utils = trpc.useUtils();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);

  const handleFilterClick = (filterKey: string) => {
    setActiveFilter((prev) => (prev === filterKey ? null : filterKey));
  };

  const { data: anomalies, isLoading } = trpc.anomalies.list.useQuery(
    { accountId: selectedAccountId! },
    {
      enabled: !!selectedAccountId,
      refetchInterval: 5 * 60 * 1000,
      refetchIntervalInBackground: false,
    }
  );

  const markRead = trpc.anomalies.markRead.useMutation({
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

  // Unread = active (shown in main list); Read = history (collapsible section)
  const unread = (anomalies ?? []).filter((a) => !a.isRead && !a.isResolved);
  const history = (anomalies ?? []).filter((a) => a.isRead);

  const statsConfig = [
    { key: "active",  label: "Anomalias Ativas", value: unread.length,   color: unread.length > 0   ? "text-yellow-400"       : "text-muted-foreground" },
    { key: "history", label: "No Histórico",      value: history.length,  color: "text-muted-foreground" },
  ];

  // Lista filtrada (null = sem filtro ativo)
  const filteredAnomalies = (() => {
    if (!activeFilter) return null;
    if (activeFilter === "active")  return unread;
    if (activeFilter === "history") return history;
    return null;
  })();

  return (
    <MetaDashboardLayout title="Anomalias">
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">Anomalias de Métricas</h1>
            <p className="text-sm text-muted-foreground">
              Desvios detectados automaticamente com validação em 3 janelas (7/14/30 dias) — ROAS, resultados, CPA, CTR e frequência
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <RefreshCw className="w-3 h-3" />
            Detecção automática a cada hora
          </div>
        </div>

        {/* Stats clicáveis como filtros */}
        <div className="grid grid-cols-2 gap-3">
          {statsConfig.map((stat) => (
            <Card
              key={stat.key}
              className={`cursor-pointer transition-all duration-150 hover:border-primary/50 ${
                activeFilter === stat.key
                  ? "border-primary ring-1 ring-primary/30 bg-primary/5"
                  : ""
              }`}
              onClick={() => handleFilterClick(stat.key)}
            >
              <CardContent className="p-4">
                <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Active anomalies + History */}
        {filteredAnomalies !== null ? (
          // Modo filtrado — lista plana
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                {activeFilter === "history" ? (
                  <FolderOpen className="w-4 h-4 text-muted-foreground" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-yellow-400" />
                )}
                {statsConfig.find((s) => s.key === activeFilter)?.label} ({filteredAnomalies.length})
              </h2>
              <button
                onClick={() => setActiveFilter(null)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Limpar filtro
              </button>
            </div>
            {filteredAnomalies.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
                  <p className="text-sm font-medium text-foreground">Nenhuma anomalia nesta categoria</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {filteredAnomalies.map((anomaly) =>
                  activeFilter === "history" ? (
                    <HistoryCard key={anomaly.id} anomaly={anomaly} />
                  ) : (
                    <AnomalyCard key={anomaly.id} anomaly={anomaly} markRead={markRead} />
                  )
                )}
              </div>
            )}
          </div>
        ) : (
          // Modo normal (sem filtro) — seções separadas originais
          <>
            {/* Active anomalies */}
            <div>
              <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-yellow-400" />
                Anomalias Ativas ({unread.length})
              </h2>
              {isLoading ? (
                <div className="space-y-2">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="h-20 bg-muted rounded-xl animate-pulse" />
                  ))}
                </div>
              ) : unread.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
                    <p className="text-sm font-medium text-foreground">Nenhuma anomalia ativa</p>
                    <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
                      Anomalias são detectadas automaticamente a cada hora, validadas em 3 janelas de tempo (7, 14 e 30 dias).
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  {unread.map((anomaly) => (
                    <AnomalyCard key={anomaly.id} anomaly={anomaly} markRead={markRead} />
                  ))}
                </div>
              )}
            </div>

            {/* ─── Histórico colapsável ─────────────────────────────────────────── */}
            <div>
              <button
                onClick={() => setHistoryOpen((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-border/50 bg-muted/20 hover:bg-muted/40 transition-colors group"
              >
                <div className="flex items-center gap-2.5">
                  <FolderOpen className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                  <span className="text-sm font-medium text-foreground">Histórico</span>
                  <span className="text-xs text-muted-foreground">
                    ({history.length} {history.length === 1 ? "anomalia vista" : "anomalias vistas"} · ficam por 30 dias)
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="w-3 h-3" />
                  {historyOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </div>
              </button>

              {historyOpen && (
                <div className="mt-2 space-y-2">
                  {history.length === 0 ? (
                    <Card className="border-border/30">
                      <CardContent className="py-8 text-center">
                        <FolderOpen className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                        <p className="text-xs text-muted-foreground">
                          Anomalias marcadas como vistas aparecerão aqui por 30 dias.
                        </p>
                      </CardContent>
                    </Card>
                  ) : (
                    history.map((anomaly) => (
                      <HistoryCard key={anomaly.id} anomaly={anomaly} />
                    ))
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
                  Anomalias apenas <strong className="text-foreground">informam</strong> — para sugestões de otimização, acesse a aba <strong className="text-foreground">Sugestões IA</strong>.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </MetaDashboardLayout>
  );
}

// ─── Card de anomalia ativa (com botão Visto) ─────────────────────────────────
function AnomalyCard({
  anomaly,
  markRead,
}: {
  anomaly: AnomalyItem;
  markRead: { mutate: (args: { anomalyId: number }) => void; isPending?: boolean };
}) {
  const tc = typeConfig[anomaly.type];
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
            </div>
            {/* O que aconteceu */}
            <p className="text-xs text-muted-foreground leading-relaxed">{anomaly.description}</p>
            {/* Timestamp */}
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

// ─── Card do histórico (compacto, sem ação) ───────────────────────────────────
function HistoryCard({ anomaly }: { anomaly: AnomalyItem }) {
  const tc = typeConfig[anomaly.type];

  // Calculate days remaining before auto-deletion (30 days from detectedAt)
  const detectedMs = new Date(anomaly.detectedAt).getTime();
  const expiresMs = detectedMs + 30 * 24 * 60 * 60 * 1000;
  const daysLeft = Math.max(0, Math.ceil((expiresMs - Date.now()) / (24 * 60 * 60 * 1000)));

  return (
    <Card className="border-border/30 opacity-70 hover:opacity-100 transition-opacity">
      <CardContent className="p-3">
        <div className="flex items-center gap-3">
          <div className={`w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 ${tc?.bg ?? "bg-muted/30"}`}>
            {tc ? (
              <tc.icon className={`w-3.5 h-3.5 ${tc.color}`} />
            ) : (
              <AlertTriangle className="w-3.5 h-3.5 text-muted-foreground" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-xs font-medium text-foreground truncate">{anomaly.title}</p>
              {tc && (
                <Badge variant="outline" className="text-xs text-muted-foreground border-border/40 py-0">
                  {tc.label}
                </Badge>
              )}
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
