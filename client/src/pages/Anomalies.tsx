import { MetaDashboardLayout, useSelectedAccount } from "@/components/MetaDashboardLayout";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  Info,
  Link2,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Zap,
} from "lucide-react";
import { useLocation } from "wouter";

// ─── Anomalias de métricas de campanha ────────────────────────────────────────
// Detectadas automaticamente com base em janela deslizante de 7 dias:
// - ROAS_DROP: queda de ROAS ≥ 10%
// - RESULTS_DROP: queda de resultados ≥ 20%
// - PERFORMANCE_DROP: queda abrupta de impressões + CTR juntos
// - CPA_SPIKE: pico de CPA ≥ 30%
// - CTR_DROP: queda de CTR ≥ 25%
// - SPEND_SPIKE: pico de gasto ≥ 50%
// - FREQUENCY_HIGH: frequência ≥ 4x
//
// NÃO aparecem aqui: erros técnicos (campanha parada, saldo, pixel, etc.)
// Esses ficam na aba Alertas.
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
    description: string;
    color: string;
  }
> = {
  ROAS_DROP: {
    icon: TrendingDown,
    label: "Queda de ROAS",
    description: "Retorno sobre investimento caiu ≥ 10% em relação aos 7 dias anteriores",
    color: "text-red-400",
  },
  RESULTS_DROP: {
    icon: TrendingDown,
    label: "Queda de Resultados",
    description: "Número de resultados (conversões, leads, mensagens) caiu ≥ 20%",
    color: "text-red-400",
  },
  PERFORMANCE_DROP: {
    icon: TrendingDown,
    label: "Queda de Performance",
    description: "Queda abrupta em impressões e CTR simultaneamente — possível problema de entrega",
    color: "text-orange-400",
  },
  CPA_SPIKE: {
    icon: TrendingUp,
    label: "Pico de CPA",
    description: "Custo por resultado aumentou ≥ 30% em relação aos 7 dias anteriores",
    color: "text-orange-400",
  },
  CTR_DROP: {
    icon: TrendingDown,
    label: "Queda de CTR",
    description: "Taxa de cliques caiu ≥ 25% — possível fadiga de criativos",
    color: "text-yellow-400",
  },
  SPEND_SPIKE: {
    icon: TrendingUp,
    label: "Pico de Investimento",
    description: "Gasto aumentou ≥ 50% em relação ao período anterior",
    color: "text-yellow-400",
  },
  FREQUENCY_HIGH: {
    icon: AlertTriangle,
    label: "Frequência Elevada",
    description: "Frequência acima de 4x — audiência pode estar saturada",
    color: "text-yellow-400",
  },
  // Legados (mantidos para compatibilidade com dados antigos)
  CONVERSION_DROP: {
    icon: TrendingDown,
    label: "Queda de Conversões",
    description: "Queda no volume de conversões detectada",
    color: "text-red-400",
  },
  DELIVERY_CHANGE: {
    icon: AlertTriangle,
    label: "Mudança de Entrega",
    description: "Alteração significativa na entrega das campanhas",
    color: "text-orange-400",
  },
  BUDGET_EXHAUSTED: {
    icon: AlertTriangle,
    label: "Orçamento Esgotado",
    description: "Orçamento da campanha foi consumido",
    color: "text-yellow-400",
  },
};

export default function Anomalies() {
  const [, navigate] = useLocation();
  const { selectedAccountId, accounts } = useSelectedAccount();
  const utils = trpc.useUtils();

  const { data: anomalies, isLoading } = trpc.anomalies.list.useQuery(
    { accountId: selectedAccountId! },
    {
      enabled: !!selectedAccountId,
      // Auto-refresh every 5 minutes so new anomalies appear automatically
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

  const active = anomalies?.filter((a) => !a.isResolved) ?? [];
  const criticalOrHigh = active.filter((a) => a.severity === "CRITICAL" || a.severity === "HIGH");
  const medium = active.filter((a) => a.severity === "MEDIUM" || a.severity === "LOW");

  return (
    <MetaDashboardLayout title="Anomalias">
      <div className="space-y-5">
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
            { label: "Anomalias Ativas", value: active.length, color: active.length > 0 ? "text-red-400" : "text-muted-foreground" },
            { label: "Alta / Crítica", value: criticalOrHigh.length, color: criticalOrHigh.length > 0 ? "text-red-400" : "text-muted-foreground" },
            { label: "Resolvidas", value: (anomalies ?? []).filter((a) => a.isResolved).length, color: "text-emerald-400" },
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
                <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
                  Anomalias são detectadas automaticamente a cada hora comparando os últimos 7 dias com os 7 dias anteriores.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {/* Critical / High */}
              {criticalOrHigh.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wide">Alta prioridade</p>
                  <div className="space-y-2">
                    {criticalOrHigh.map((anomaly) => renderAnomalyCard(anomaly, markRead))}
                  </div>
                </div>
              )}
              {/* Medium / Low */}
              {medium.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wide">Média prioridade</p>
                  <div className="space-y-2">
                    {medium.map((anomaly) => renderAnomalyCard(anomaly, markRead))}
                  </div>
                </div>
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
                  A cada hora, o sistema compara a média ponderada dos <strong className="text-foreground">últimos 7 dias</strong> com os <strong className="text-foreground">7 dias anteriores</strong> para cada campanha ativa.
                  Anomalias são geradas quando: ROAS cai ≥ 10% · Resultados caem ≥ 20% · CPA sobe ≥ 30% · CTR cai ≥ 25% · Gasto sobe ≥ 50% · Frequência ≥ 4x.
                  <br />
                  <span className="text-muted-foreground/70">Erros técnicos (campanha parada, saldo baixo, etc.) ficam na aba <strong className="text-foreground">Alertas</strong>.</span>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </MetaDashboardLayout>
  );
}

// ─── Extracted render function to keep JSX clean ──────────────────────────────
function renderAnomalyCard(
  anomaly: {
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
  },
  markRead: { mutate: (args: { anomalyId: number }) => void; isPending?: boolean }
) {
  const sev = severityConfig[anomaly.severity] ?? severityConfig.LOW;
  const tc = typeConfig[anomaly.type];
  const AnomalyIcon = tc?.icon ?? AlertTriangle;

  return (
    <Card
      key={anomaly.id}
      className={`border ${!anomaly.isRead ? "border-primary/30" : "border-border"}`}
    >
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
              {!anomaly.isRead && (
                <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
              )}
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">{anomaly.description}</p>
            <p className="text-xs text-muted-foreground/60 mt-1.5">
              Detectada em {new Date(anomaly.detectedAt).toLocaleString("pt-BR")}
            </p>
          </div>
          {!anomaly.isRead && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs text-muted-foreground hover:text-foreground flex-shrink-0"
              onClick={() => markRead.mutate({ anomalyId: anomaly.id })}
              disabled={markRead.isPending}
              title="Marcar como visto"
            >
              <Eye className="w-3.5 h-3.5" />
              Visto
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
