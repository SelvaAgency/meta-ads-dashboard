import { trpc } from "@/lib/trpc";
import { useSelectedAccount } from "@/hooks/useSelectedAccount";
import { getClientByMetaAccountId, getIntegrationStatus } from "@/config/clientConfig";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
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

const ACCOUNT_COLORS: Record<string, { bg: string; color: string }> = {
  blue:    { bg: "rgba(59,130,246,0.15)",   color: "#60a5fa" },
  violet:  { bg: "rgba(139,92,246,0.15)",   color: "#a78bfa" },
  emerald: { bg: "rgba(16,185,129,0.15)",   color: "#34d399" },
  amber:   { bg: "rgba(245,158,11,0.15)",   color: "#fbbf24" },
  cyan:    { bg: "rgba(6,182,212,0.15)",    color: "#22d3ee" },
  rose:    { bg: "rgba(244,63,94,0.15)",    color: "#fb7185" },
  lime:    { bg: "rgba(132,204,22,0.15)",   color: "#a3e635" },
  orange:  { bg: "rgba(249,115,22,0.15)",   color: "#fb923c" },
  pink:    { bg: "rgba(232,91,168,0.15)",   color: "#E85BA8" },
  teal:    { bg: "rgba(20,184,166,0.15)",   color: "#2dd4bf" },
  indigo:  { bg: "rgba(99,102,241,0.15)",   color: "#818cf8" },
  fuchsia: { bg: "rgba(232,91,168,0.15)",   color: "#E85BA8" },
};

const STATUS_CFG = {
  green:  { color: "#1D9E75", label: "Saudável" },
  yellow: { color: "#EF9F27", label: "Atenção"  },
  red:    { color: "#E24B4A", label: "Crítico"  },
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

  const todaySpend = Number(todayData?.totals?.spend ?? 0);
  const todayConv  = Number(todayData?.totals?.conversions ?? 0);
  const todayRoas  = Number(todayData?.totals?.roas ?? 0);
  const yestSpend  = Number(yestData?.totals?.spend ?? 0);
  const yestConv   = Number(yestData?.totals?.conversions ?? 0);
  const yestRoas   = Number(yestData?.totals?.roas ?? 0);

  const aiColor   = (activeAccount as any).aiStatusColor as "green" | "yellow" | "red" | null ?? null;
  const aiSummary = (activeAccount as any).aiStatusSummary as string | null;
  const statusCfg = aiColor ? STATUS_CFG[aiColor] : null;

  const sep = <span style={{ opacity: 0.3, margin: "0 4px" }}>·</span>;
  const pipe = <span style={{ opacity: 0.25, margin: "0 8px" }}>|</span>;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "12px 16px",
        background: "hsl(var(--card))",
        border: "1px solid hsl(var(--border) / 0.6)",
        borderRadius: 12,
      }}
    >
      {/* ── Bloco esquerdo ──────────────────────────────────────────── */}
      <div style={{ flex: 1, minWidth: 0 }}>

        {/* Linha 1 — identidade + integrações */}
        <div style={{ display: "flex", alignItems: "center", gap: 7, whiteSpace: "nowrap", overflow: "hidden" }}>

          {/* Círculo iniciais */}
          <div style={{
            width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
            background: palette.bg, color: palette.color,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
          }}>
            {initials}
          </div>

          {/* Nome */}
          <span style={{
            fontSize: 13, fontWeight: 500,
            color: "hsl(var(--foreground))",
            overflow: "hidden", textOverflow: "ellipsis",
            maxWidth: 180,
          }}>
            {accountName}
          </span>

          {/* Badge objetivo */}
          {goalLabel && (
            <span style={{
              fontSize: 10, fontWeight: 500, flexShrink: 0,
              padding: "2px 8px", borderRadius: 99,
              background: "hsl(var(--primary) / 0.12)",
              color: "hsl(var(--primary))",
              border: "1px solid hsl(var(--primary) / 0.25)",
            }}>
              {goalEmoji} {goalLabel}
            </span>
          )}

          {/* Integrações */}
          <span style={{ opacity: 0.25, margin: "0 2px" }}>•</span>

          <span style={{ fontSize: 10, fontWeight: 500, color: "#1D9E75", opacity: 0.85, flexShrink: 0 }}>
            ● Meta Ads
          </span>
          <span style={{
            fontSize: 10, fontWeight: 500, flexShrink: 0,
            color: integrations?.ga4 ? "#60a5fa" : "hsl(var(--muted-foreground))",
            opacity: integrations?.ga4 ? 0.85 : 0.45,
          }}>
            {integrations?.ga4 ? "●" : "○"} GA4
          </span>
          <span style={{
            fontSize: 10, fontWeight: 500, flexShrink: 0,
            color: integrations?.googleAds ? "#fbbf24" : "hsl(var(--muted-foreground))",
            opacity: integrations?.googleAds ? 0.85 : 0.45,
          }}>
            {integrations?.googleAds ? "●" : "○"} Google Ads
          </span>
        </div>

        {/* Linha 2 — resumo diário */}
        <div style={{
          display: "flex", alignItems: "center",
          marginTop: 4, whiteSpace: "nowrap",
          overflow: "hidden", textOverflow: "ellipsis",
          fontSize: 12, color: "hsl(var(--muted-foreground))",
        }}>
          <span style={{ color: "#E85BA8", fontWeight: 500 }}>Hoje</span>
          {sep}{fmt(todaySpend)}{sep}{fmtN(todayConv)} result.
          {todayRoas > 0 && <>{sep}{todayRoas.toFixed(2)}x ROAS</>}
          {pipe}
          <span style={{ fontWeight: 500, color: "hsl(var(--muted-foreground))" }}>Ontem</span>
          {sep}{fmt(yestSpend)}{sep}{fmtN(yestConv)} result.
          {yestRoas > 0 && <>{sep}{yestRoas.toFixed(2)}x ROAS</>}
        </div>

      </div>

      {/* ── Divisor vertical ────────────────────────────────────────── */}
      <div style={{ width: "0.5px", alignSelf: "stretch", background: "hsl(var(--border))", opacity: 0.5, flexShrink: 0 }} />

      {/* ── Bloco direito — Status IA ────────────────────────────────── */}
      <div style={{ width: 190, flexShrink: 0 }}>

        {/* Linha 1 — dot + label + refresh */}
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <div style={{
            width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
            background: statusCfg?.color ?? "hsl(var(--muted-foreground) / 0.4)",
          }} />
          <span style={{
            fontSize: 11, fontWeight: 500,
            color: statusCfg?.color ?? "hsl(var(--muted-foreground))",
            flex: 1,
          }}>
            {statusCfg?.label ?? "Status IA"} — 7 dias
          </span>
          <Button
            variant="ghost"
            size="icon"
            style={{ width: 18, height: 18, flexShrink: 0, marginLeft: "auto" }}
            title="Atualizar análise IA"
            disabled={refreshStatus.isPending}
            onClick={() => refreshStatus.mutate({ accountId: selectedAccountId })}
          >
            <RefreshCw style={{
              width: 11, height: 11,
              color: "hsl(var(--muted-foreground))",
              animation: refreshStatus.isPending ? "spin 1s linear infinite" : undefined,
            }} />
          </Button>
        </div>

        {/* Linha 2 — summary */}
        <p style={{
          fontSize: 11, lineHeight: 1.4, marginTop: 2,
          color: "hsl(var(--muted-foreground))",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}>
          {aiSummary ?? "Análise pendente — execute um sync"}
        </p>

      </div>
    </div>
  );
}
