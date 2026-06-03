import { trpc } from "@/lib/trpc";
import { useSelectedAccount } from "@/hooks/useSelectedAccount";
import { getClientByMetaAccountId, getIntegrationStatus } from "@/config/clientConfig";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, RefreshCw, CircleDot } from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toIso(d: Date) {
  return d.toISOString().split("T")[0]!;
}

function fmt(n: number, currency = "R$") {
  if (n >= 1_000_000) return `${currency} ${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${currency} ${(n / 1_000).toFixed(1)}k`;
  return `${currency} ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtN(n: number) {
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString("pt-BR");
}

const ACCOUNT_COLORS: Record<string, { bg: string; text: string }> = {
  blue:    { bg: "bg-blue-500/20",    text: "text-blue-400" },
  violet:  { bg: "bg-violet-500/20",  text: "text-violet-400" },
  emerald: { bg: "bg-emerald-500/20", text: "text-emerald-400" },
  amber:   { bg: "bg-amber-500/20",   text: "text-amber-400" },
  cyan:    { bg: "bg-cyan-500/20",    text: "text-cyan-400" },
  rose:    { bg: "bg-rose-500/20",    text: "text-rose-400" },
  lime:    { bg: "bg-lime-500/20",    text: "text-lime-400" },
  orange:  { bg: "bg-orange-500/20",  text: "text-orange-400" },
  pink:    { bg: "bg-pink-500/20",    text: "text-pink-400" },
  teal:    { bg: "bg-teal-500/20",    text: "text-teal-400" },
  indigo:  { bg: "bg-indigo-500/20",  text: "text-indigo-400" },
  fuchsia: { bg: "bg-fuchsia-500/20", text: "text-fuchsia-400" },
};

const STATUS_COLORS = {
  green:  { dot: "bg-emerald-400", text: "text-emerald-400", label: "Saudável" },
  yellow: { dot: "bg-amber-400",   text: "text-amber-400",   label: "Atenção" },
  red:    { dot: "bg-red-400",     text: "text-red-400",     label: "Crítico" },
};

// ─── Component ────────────────────────────────────────────────────────────────

export function AccountHeader({ goalLabel, goalEmoji }: { goalLabel?: string; goalEmoji?: string }) {
  const { selectedAccountId, accounts } = useSelectedAccount();
  const utils = trpc.useUtils();

  const activeAccount = useMemo(
    () => accounts?.find((a: any) => a.id === selectedAccountId),
    [accounts, selectedAccountId]
  );

  const activeClient = useMemo(
    () => activeAccount ? getClientByMetaAccountId(activeAccount.accountId) : null,
    [activeAccount]
  );
  const integrations = useMemo(
    () => activeClient ? getIntegrationStatus(activeClient) : null,
    [activeClient]
  );

  // Today and yesterday date ranges
  const today = toIso(new Date());
  const yesterday = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return toIso(d); })();

  const { data: todayData } = trpc.dashboard.overview.useQuery(
    { accountId: selectedAccountId!, startDate: today, endDate: today },
    { enabled: !!selectedAccountId, staleTime: 60_000 }
  );
  const { data: yestData } = trpc.dashboard.overview.useQuery(
    { accountId: selectedAccountId!, startDate: yesterday, endDate: yesterday },
    { enabled: !!selectedAccountId, staleTime: 60_000 }
  );

  const refreshStatus = trpc.accounts.refreshStatus.useMutation({
    onSuccess: () => {
      utils.accounts.list.invalidate();
      toast.success("Status IA atualizado");
    },
    onError: () => toast.error("Erro ao atualizar status IA"),
  });

  if (!selectedAccountId || !activeAccount) return null;

  const accountName: string = activeAccount.accountName ?? activeAccount.accountId;
  const initials = accountName.slice(0, 2).toUpperCase();
  const colorKey = activeClient?.color ?? "fuchsia";
  const palette = ACCOUNT_COLORS[colorKey] ?? ACCOUNT_COLORS.fuchsia!;

  // Today totals
  const todayT = todayData?.totals;
  const todaySpend = Number(todayT?.spend ?? 0);
  const todayConv  = Number(todayT?.conversions ?? 0);
  const todayRoas  = Number(todayT?.roas ?? 0);

  // Yesterday totals
  const yestT = yestData?.totals;
  const yestSpend = Number(yestT?.spend ?? 0);
  const yestConv  = Number(yestT?.conversions ?? 0);
  const yestRoas  = Number(yestT?.roas ?? 0);

  // AI status
  const aiColor = (activeAccount as any).aiStatusColor as "green" | "yellow" | "red" | null ?? null;
  const aiSummary = (activeAccount as any).aiStatusSummary as string | null;
  const statusCfg = aiColor ? STATUS_COLORS[aiColor] : null;

  return (
    <Card className="border-border/60 bg-card/80">
      <CardContent className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 md:divide-x md:divide-border/40">

          {/* Bloco 1 — Identidade */}
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${palette.bg} ${palette.text}`}>
              {initials}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-foreground truncate">{accountName}</p>
              {goalLabel && (
                <Badge variant="outline" className="text-xs border-primary/30 text-primary mt-0.5">
                  {goalEmoji} {goalLabel}
                </Badge>
              )}
            </div>
          </div>

          {/* Bloco 2 — Integrações */}
          <div className="md:pl-4 flex flex-col justify-center gap-1.5">
            <p className="text-xs text-muted-foreground font-medium mb-0.5">Integrações</p>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                <span className="text-xs text-emerald-600 font-medium">Meta Ads</span>
              </div>
              <div className="flex items-center gap-1">
                {integrations?.ga4
                  ? <CheckCircle2 className="w-3.5 h-3.5 text-blue-500" />
                  : <XCircle className="w-3.5 h-3.5 text-muted-foreground/40" />}
                <span className={`text-xs font-medium ${integrations?.ga4 ? "text-blue-600" : "text-muted-foreground/40"}`}>GA4</span>
              </div>
              <div className="flex items-center gap-1">
                {integrations?.googleAds
                  ? <CheckCircle2 className="w-3.5 h-3.5 text-amber-500" />
                  : <XCircle className="w-3.5 h-3.5 text-muted-foreground/40" />}
                <span className={`text-xs font-medium ${integrations?.googleAds ? "text-amber-600" : "text-muted-foreground/40"}`}>Google Ads</span>
              </div>
            </div>
          </div>

          {/* Bloco 3 — Hoje e Ontem */}
          <div className="md:pl-4 flex flex-col justify-center gap-1">
            <p className="text-xs text-muted-foreground font-medium mb-0.5">Resumo diário</p>
            <p className="text-xs text-foreground">
              <span className="font-semibold text-primary">Hoje</span>
              {" "}· {fmt(todaySpend)} gasto · {fmtN(todayConv)} result.
              {todayRoas > 0 && ` · ${todayRoas.toFixed(2)}x ROAS`}
            </p>
            <p className="text-xs text-muted-foreground">
              <span className="font-semibold">Ontem</span>
              {" "}· {fmt(yestSpend)} gasto · {fmtN(yestConv)} result.
              {yestRoas > 0 && ` · ${yestRoas.toFixed(2)}x ROAS`}
            </p>
          </div>

          {/* Bloco 4 — Status IA */}
          <div className="md:pl-4 flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-1">
                {statusCfg
                  ? <CircleDot className={`w-3.5 h-3.5 ${statusCfg.text}`} />
                  : <CircleDot className="w-3.5 h-3.5 text-muted-foreground/40" />}
                <p className={`text-xs font-semibold ${statusCfg?.text ?? "text-muted-foreground"}`}>
                  {statusCfg?.label ?? "Status IA"} — 7 dias
                </p>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                {aiSummary ?? "Análise pendente — execute um sync para gerar"}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 flex-shrink-0 text-muted-foreground hover:text-foreground"
              title="Atualizar análise IA"
              disabled={refreshStatus.isPending}
              onClick={() => refreshStatus.mutate({ accountId: selectedAccountId })}
            >
              <RefreshCw className={`w-3 h-3 ${refreshStatus.isPending ? "animate-spin" : ""}`} />
            </Button>
          </div>

        </div>
      </CardContent>
    </Card>
  );
}
