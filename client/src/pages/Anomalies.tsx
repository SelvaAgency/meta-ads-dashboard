import { MetaDashboardLayout, useSelectedAccount } from "@/components/MetaDashboardLayout";
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

// ─── Anomalias de métricas de campanha ────────────────────────────────────────
// Detectadas automaticamente com base em janela deslizante de 7 dias.
// Anomalias não lidas = ativas (aparecem na lista principal).
// Anomalias lidas = histórico (seção colapsável, ficam por 30 dias).
// ─────────────────────────────────────────────────────────────────────────────

const severityConfig: Record<string, { label: string; color: string; bg: string }> = {
  CRITICAL: { label: "Crítico", color: "text-red-400", bg: "bg-red-400/10 border-red-400/30" },
  HIGH: { label: "Alto", color: "text-orange-400", bg: "bg-orange-400/10 border-orange-400/30" },
  MEDIUM: { label: "Médio", color: "text-yellow-400", bg: "bg-yellow-400/10 border-yellow-400/30" },
  LOW: { label: "Baixo", color: "text-blue-400", bg: "bg-blue-400/10 border-blue-400/30" },
};

const typeConfig: Record<
  string,
  {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    color: string;
  }
> = {
  ROAS_DROP: { icon: TrendingDown, label: "Queda de ROAS", color: "text-red-400" },
  RESULTS_DROP: { icon: TrendingDown, label: "Queda de Resultados", color: "text-red-400" },
  PERFORMANCE_DROP: { icon: TrendingDown, label: "Queda de Performance", color: "text-orange-400" },
  CPA_SPIKE: { icon: TrendingUp, label: "Pico de CPA", color: "text-orange-400" },
  CTR_DROP: { icon: TrendingDown, label: "Queda de CTR", color: "text-yellow-400" },
  SPEND_SPIKE: { icon: TrendingUp, label: "Pico de Investimento", color: "text-yellow-400" },
  FREQUENCY_HIGH: { icon: AlertTriangle, label: "Frequência Elevada", color: "text-yellow-400" },
  CONVERSION_DROP: { icon: TrendingDown, label: "Queda de Conversões", color: "text-red-400" },
  DELIVERY_CHANGE: { icon: AlertTriangle, label: "Mudança de Entrega", color: "text-orange-400" },
  BUDGET_EXHAUSTED: { icon: AlertTriangle, label: "Orçamento Esgotado", color: "text-yellow-400" },
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

  const criticalOrHigh = unread.filter((a) => a.severity === "CRITICAL" || a.severity === "HIGH");
  const medium = unread.filter((a) => a.severity === "MEDIUM" || a.severity === "LOW");

  return (
    <MetaDashboardLayout title="Anomalias">
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">Anomalias de Métricas</h1>
            <p className="text-sm text-muted-foreground">
              Desvios detectados com base em análise de 7 dias — ROAS, resultados, CPA, CTR e performance fora do padrão
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <RefreshCw className="w-3 h-3" />
            Detecção automática a cada hora
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Anomalias Ativas", value: unread.length, color: unread.length > 0 ? "text-red-400" : "text-muted-foreground" },
            { label: "Alta / Crítica", value: criticalOrHigh.length, color: criticalOrHigh.length > 0 ? "text-red-400" : "text-muted-foreground" },
            { label: "No Histórico", value: history.length, color: history.length > 0 ? "text-muted-foreground" : "text-muted-foreground" },
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
                  Anomalias são detectadas automaticamente a cada hora comparando os últimos 7 dias com os 7 dias anteriores.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {criticalOrHigh.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wide">Alta prioridade</p>
                  <div className="space-y-2">
                    {criticalOrHigh.map((anomaly) => (
                      <AnomalyCard key={anomaly.id} anomaly={anomaly} markRead={markRead} />
                    ))}
                  </div>
                </div>
              )}
              {medium.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wide">Média prioridade</p>
                  <div className="space-y-2">
                    {medium.map((anomaly) => (
                      <AnomalyCard key={anomaly.id} anomaly={anomaly} markRead={markRead} />
                    ))}
                  </div>
                </div>
              )}
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
              <span className="text-sm font-medium text-foreground">
                Histórico
              </span>
              <span className="text-xs text-muted-foreground">
                ({history.length} {history.length === 1 ? "anomalia vista" : "anomalias vistas"} · ficam por 30 dias)
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="w-3 h-3" />
              {historyOpen ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
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

        {/* Info box */}
        <Card className="border-border/30 bg-muted/20">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Info className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs font-medium text-foreground mb-1">Como funciona a detecção</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  A cada hora, o sistema compara a média dos <strong className="text-foreground">últimos 7 dias</strong> com os <strong className="text-foreground">7 dias anteriores</strong> por campanha.
                  Anomalias: ROAS cai ≥ 10% · Resultados caem ≥ 20% · CPA sobe ≥ 30% · CTR cai ≥ 25% · Gasto sobe ≥ 50% · Frequência ≥ 4x.
                  Anomalias vistas ficam no histórico por 30 dias e são removidas automaticamente.
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
  const sev = severityConfig[anomaly.severity] ?? severityConfig.LOW;
  const tc = typeConfig[anomaly.type];
  const AnomalyIcon = tc?.icon ?? AlertTriangle;

  return (
    <Card className="border border-primary/20 bg-primary/5">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${sev.bg}`}>
            <AnomalyIcon className={`w-4 h-4 ${tc?.color ?? sev.color}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <p className="text-sm font-semibold text-foreground">{anomaly.title}</p>
              <Badge variant="outline" className={`text-xs ${sev.color} ${sev.bg}`}>
                {sev.label}
              </Badge>
              {tc && (
                <Badge variant="outline" className="text-xs text-muted-foreground border-border/50">
                  {tc.label}
                </Badge>
              )}
              <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
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

// ─── Card do histórico (compacto, sem ação) ───────────────────────────────────
function HistoryCard({ anomaly }: { anomaly: AnomalyItem }) {
  const sev = severityConfig[anomaly.severity] ?? severityConfig.LOW;
  const tc = typeConfig[anomaly.type];

  // Calculate days remaining before auto-deletion (30 days from detectedAt)
  const detectedMs = new Date(anomaly.detectedAt).getTime();
  const expiresMs = detectedMs + 30 * 24 * 60 * 60 * 1000;
  const daysLeft = Math.max(0, Math.ceil((expiresMs - Date.now()) / (24 * 60 * 60 * 1000)));

  return (
    <Card className="border-border/30 opacity-70 hover:opacity-100 transition-opacity">
      <CardContent className="p-3">
        <div className="flex items-center gap-3">
          <div className={`w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 ${sev.bg}`}>
            {tc ? (
              <tc.icon className={`w-3.5 h-3.5 ${tc.color}`} />
            ) : (
              <AlertTriangle className={`w-3.5 h-3.5 ${sev.color}`} />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-xs font-medium text-foreground truncate">{anomaly.title}</p>
              <Badge variant="outline" className={`text-xs ${sev.color} border-border/40 py-0`}>
                {sev.label}
              </Badge>
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
