import { trpc } from "@/lib/trpc";
import { useSelectedAccount } from "@/hooks/useSelectedAccount";
import { getClientByMetaAccountId, getIntegrationStatus } from "@/config/clientConfig";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, RefreshCw } from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toIsoLocal(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fmt(n: number) {
  if (n >= 1_000_000) return `R$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `R$${(n / 1_000).toFixed(1)}k`;
  return `R$${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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

const STATUS_CFG = {
  green:  { indicator: "🟢", text: "text-emerald-400", label: "Saudável" },
  yellow: { indicator: "🟡", text: "text-amber-400",   label: "Atenção"  },
  red:    { indicator: "🔴", text: "text-red-400",     label: "Crítico"  },
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

  const today     = toIsoLocal(new Date());
  const yesterday = toIsoLocal(new Date(Date.now() - 86_400_000));

  const { data: todayData } = trpc.dashboard.overview.useQuery(
    { accountId: selectedAccountId!, startDate: today, endDate: today },
    { enabled: !!selectedAccountId, staleTime: 60_000 }
  );
  const { data: yestData } = trpc.dashboard.overview.useQuery(
    { accountId: selectedAccountId!, startDate: yesterday, endDate: yesterday },
    { enabled: !!selectedAccountId, staleTime: 60_000 }
  );

  const refreshStatus = trpc.accounts.refreshStatus.useMutation({
    onSuccess: () => { utils.accounts.list.invalidate(); toast.success("Status IA atualizado"); },
    onError:   () => toast.error("Erro ao atualizar status IA"),
  });

  if (!selectedAccountId || !activeAccount) return null;

  const accountName: string = activeAccount.accountName ?? activeAccount.accountId;
  const initials  = accountName.slice(0, 2).toUpperCase();
  const palette   = ACCOUNT_COLORS[activeClient?.color ?? "fuchsia"] ?? ACCOUNT_COLORS.fuchsia!;

  const todayT     = todayData?.totals;
  const todaySpend = Number(todayT?.spend ?? 0);
  const todayConv  = Number(todayT?.conversions ?? 0);
  const todayRoas  = Number(todayT?.roas ?? 0);

  const yestT     = yestData?.totals;
  const yestSpend = Number(yestT?.spend ?? 0);
  const yestConv  = Number(yestT?.conversions ?? 0);
  const yestRoas  = Number(yestT?.roas ?? 0);

  const aiColor   = (activeAccount as any).aiStatusColor as "green" | "yellow" | "red" | null ?? null;
  const aiSummary = (activeAccount as any).aiStatusSummary as string | null;
  const statusCfg = aiColor ? STATUS_CFG[aiColor] : null;

  return (
    <Card className="border-border/60 bg-card/80">
      <CardContent className="px-4 py-3 space-y-2.5">

        {/* ── Linha 1: Identidade + Integrações ─────────────────────────── */}
        <div className="flex items-center justify-between gap-3">

          {/* Identidade */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0 ${palette.bg} ${palette.text}`}>
              {initials}
            </div>
            <span className="text-sm font-bold text-foreground truncate">{accountName}</span>
            {goalLabel && (
              <Badge variant="outline" className="text-xs border-primary/30 text-primary flex-shrink-0">
                {goalEmoji} {goalLabel}
              </Badge>
            )}
          </div>

          {/* Integrações */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-emerald-500" />
              <span className="text-xs font-medium text-emerald-600">Meta Ads</span>
            </div>
            <div className="flex items-center gap-1">
              {integrations?.ga4
                ? <CheckCircle2 className="w-3 h-3 text-blue-500" />
                : <XCircle className="w-3 h-3 text-muted-foreground/35" />}
              <span className={`text-xs font-medium ${integrations?.ga4 ? "text-blue-500" : "text-muted-foreground/35"}`}>
                GA4
              </span>
            </div>
            <div className="flex items-center gap-1">
              {integrations?.googleAds
                ? <CheckCircle2 className="w-3 h-3 text-amber-500" />
                : <XCircle className="w-3 h-3 text-muted-foreground/35" />}
              <span className={`text-xs font-medium ${integrations?.googleAds ? "text-amber-500" : "text-muted-foreground/35"}`}>
                Google Ads
              </span>
            </div>
          </div>

        </div>

        {/* ── Linha 2: Resumo diário + Status IA ───────────────────────── */}
        <div className="flex items-stretch gap-0 rounded-lg border border-border/40 overflow-hidden">

          {/* Bloco esquerdo — Hoje e Ontem */}
          <div className="flex-1 px-3 py-2 space-y-0.5">
            <p className="text-xs text-foreground leading-snug">
              <span className="font-semibold text-[#E85BA8]">Hoje</span>
              <span className="text-muted-foreground"> · </span>
              {fmt(todaySpend)}
              <span className="text-muted-foreground"> · </span>
              {fmtN(todayConv)} result.
              {todayRoas > 0 && (
                <span className="text-muted-foreground"> · {todayRoas.toFixed(2)}x ROAS</span>
              )}
            </p>
            <p className="text-xs text-muted-foreground leading-snug">
              <span className="font-medium text-muted-foreground">Ontem</span>
              <span> · </span>
              {fmt(yestSpend)}
              <span> · </span>
              {fmtN(yestConv)} result.
              {yestRoas > 0 && ` · ${yestRoas.toFixed(2)}x ROAS`}
            </p>
          </div>

          {/* Divisor */}
          <div className="w-px bg-border/40" />

          {/* Bloco direito — Status IA */}
          <div className="flex items-center gap-2 px-3 py-2 min-w-0" style={{ flex: "0 0 auto", maxWidth: "55%" }}>
            <span className="text-sm flex-shrink-0" aria-hidden>
              {statusCfg?.indicator ?? "⚪"}
            </span>
            <div className="flex-1 min-w-0">
              <p className={`text-xs font-semibold leading-none mb-0.5 ${statusCfg?.text ?? "text-muted-foreground"}`}>
                {statusCfg?.label ?? "Status IA"} — 7 dias
              </p>
              <p className="text-xs text-muted-foreground leading-snug line-clamp-1">
                {aiSummary ?? "Análise pendente — execute um sync"}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 flex-shrink-0 text-muted-foreground/50 hover:text-foreground"
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
