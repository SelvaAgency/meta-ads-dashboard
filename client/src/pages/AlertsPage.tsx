import { MetaDashboardLayout } from "@/components/MetaDashboardLayout";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
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
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";

// ─── Alertas técnicos operacionais ────────────────────────────────────────────
// Erros de infraestrutura que exigem atenção do gestor.
// Apenas INFORMAM — sem hierarquia de prioridade.
// Ações sugeridas e priorização ficam exclusivamente na aba Sugestões IA.
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

  const renderAlert = (alert: (typeof alerts)[number]) => {
    const tc = typeConfig[alert.type] ?? typeConfig.SYSTEM;
    const AlertIcon = tc.icon;

    return (
      <Card key={alert.id} className="border border-border/50">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            {/* Type icon */}
            <div className={`w-9 h-9 rounded-lg ${tc.bg} flex items-center justify-center flex-shrink-0`}>
              <AlertIcon className={`w-4 h-4 ${tc.color}`} />
            </div>

            <div className="flex-1 min-w-0">
              {/* Conta afetada + tipo */}
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <p className="text-sm font-semibold text-foreground">{alert.title}</p>
                <Badge variant="outline" className="text-xs text-muted-foreground border-border/50">
                  {tc.label}
                </Badge>
              </div>
              {/* O que aconteceu */}
              <p className="text-xs text-muted-foreground leading-relaxed">{alert.message}</p>
              {/* Dados: métrica atual vs referência (quando disponível) */}
              {(() => {
                const cur = (alert as Record<string, unknown>).metricCurrent as string | undefined;
                const ref = (alert as Record<string, unknown>).metricReference as string | undefined;
                if (!cur && !ref) return null;
                return (
                  <p className="text-xs text-muted-foreground/70 mt-1">
                    {cur}{ref ? ` · Referência: ${ref}` : ""}
                  </p>
                );
              })()}
              {/* Timestamp */}
              <p className="text-xs text-muted-foreground/50 mt-1.5">
                Detectado em {new Date(alert.createdAt).toLocaleString("pt-BR")}
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
              Erros operacionais detectados automaticamente — campanha parada, pagamento, criativos rejeitados, vínculos quebrados
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

        {/* Contador simples */}
        <div className="grid grid-cols-2 gap-3">
          <Card>
            <CardContent className="p-4">
              <p className={`text-2xl font-bold ${alerts.length > 0 ? "text-yellow-400" : "text-muted-foreground"}`}>
                {alerts.length}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">Alertas pendentes</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-2xl font-bold text-muted-foreground">
                {(allAlerts ?? []).filter((a) => !TECHNICAL_ALERT_TYPES.has(a.type)).length}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">Outros (relatórios, sync)</p>
            </CardContent>
          </Card>
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
          <div className="space-y-2">
            {alerts.map(renderAlert)}
          </div>
        )}

        {/* Info box */}
        <Card className="border-border/30 bg-muted/20">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Info className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs font-medium text-foreground mb-1">Como funcionam os alertas</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Alertas técnicos informam sobre erros operacionais detectados automaticamente a cada hora.
                  Eles apenas <strong className="text-foreground">informam</strong> — não sugerem ação.
                  Para sugestões de otimização e priorização, acesse a aba <strong className="text-foreground">Sugestões IA</strong>.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </MetaDashboardLayout>
  );
}
