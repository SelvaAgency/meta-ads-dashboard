import { MetaDashboardLayout } from "@/components/MetaDashboardLayout";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { useState, useMemo, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useActiveAccount } from "@/contexts/ActiveAccountContext";
import { toast } from "sonner";
import { getClientByMetaAccountId } from "@/config/clientConfig";
import { fmtCurrency, fmtNumber, fmtPercent, fmtMultiplier, getDayStatus, type GoalType } from "@/lib/kpiConfig";
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  ChevronDown,
  Flame,
  RefreshCw,
  Sparkles,
} from "lucide-react";

// ─── CSS variable constants ───────────────────────────────────────────────────

const BG_PRIMARY   = "var(--color-background-primary, var(--card))";
const BG_SECONDARY = "var(--color-background-secondary, hsl(var(--muted)))";
const BORDER_T     = "var(--color-border-tertiary, var(--border))";
const RADIUS_LG    = "var(--border-radius-lg, 12px)";

// ─── Config ───────────────────────────────────────────────────────────────────

const categoryConfig: Record<string, { label: string; color: string }> = {
  BUDGET:    { label: "Orçamento",   color: "text-yellow-400" },
  TARGETING: { label: "Público",     color: "text-blue-400" },
  CREATIVE:  { label: "Criativo",    color: "text-purple-400" },
  BIDDING:   { label: "Lance",       color: "text-orange-400" },
  SCHEDULE:  { label: "Programação", color: "text-teal-400" },
  AUDIENCE:  { label: "Audiência",   color: "text-cyan-400" },
  GENERAL:   { label: "Geral",       color: "text-muted-foreground" },
};

const estadoConfig: Record<string, { badge: string; cls: string; border: string }> = {
  green:  { badge: "A", cls: "text-emerald-400 border-emerald-400/30 bg-emerald-400/10", border: "#34d399" },
  yellow: { badge: "B", cls: "text-amber-400 border-amber-400/30 bg-amber-400/10",       border: "#fbbf24" },
  red:    { badge: "C", cls: "text-red-400 border-red-400/30 bg-red-400/10",             border: "#f87171" },
};

// ─── Secondary metrics per goal type ─────────────────────────────────────────

type MetricDef = { label: string; fmt: (t: any) => string };

const SECONDARY: Record<string, MetricDef[]> = {
  SALES:      [{ label: "ROAS",    fmt: (t) => fmtMultiplier(t.roas) },    { label: "Conv.",   fmt: (t) => fmtNumber(t.conversions) },  { label: "CTR",  fmt: (t) => fmtPercent(t.ctr) }],
  VALUE:      [{ label: "ROAS",    fmt: (t) => fmtMultiplier(t.roas) },    { label: "Conv.",   fmt: (t) => fmtNumber(t.conversions) },  { label: "CTR",  fmt: (t) => fmtPercent(t.ctr) }],
  LEADS:      [{ label: "Leads",   fmt: (t) => fmtNumber(t.conversions) }, { label: "CTR",    fmt: (t) => fmtPercent(t.ctr) },         { label: "CPA",  fmt: (t) => fmtCurrency(t.cpa) }],
  MESSAGES:   [{ label: "Msgs",    fmt: (t) => fmtNumber(t.conversions) }, { label: "CTR",    fmt: (t) => fmtPercent(t.ctr) },         { label: "CPM",  fmt: (t) => fmtCurrency(t.cpm) }],
  TRAFFIC:    [{ label: "Visitas", fmt: (t) => fmtNumber(t.clicks) },      { label: "CTR",    fmt: (t) => fmtPercent(t.ctr) },         { label: "CPM",  fmt: (t) => fmtCurrency(t.cpm) }],
  AWARENESS:  [{ label: "Alcance", fmt: (t) => fmtNumber(t.reach) },       { label: "CTR",    fmt: (t) => fmtPercent(t.ctr) },         { label: "CPM",  fmt: (t) => fmtCurrency(t.cpm) }],
  FOLLOWERS:  [{ label: "Seguid.", fmt: (t) => fmtNumber(t.conversions) }, { label: "CTR",    fmt: (t) => fmtPercent(t.ctr) },         { label: "CPM",  fmt: (t) => fmtCurrency(t.cpm) }],
  ENGAGEMENT: [{ label: "Engaj.",  fmt: (t) => fmtNumber(t.conversions) }, { label: "CTR",    fmt: (t) => fmtPercent(t.ctr) },         { label: "CPM",  fmt: (t) => fmtCurrency(t.cpm) }],
};
const SECONDARY_DEFAULT: MetricDef[] = [
  { label: "Impr.", fmt: (t) => fmtNumber(t.impressions) },
  { label: "CTR",  fmt: (t) => fmtPercent(t.ctr) },
  { label: "CPM",  fmt: (t) => fmtCurrency(t.cpm) },
];

function secondaryMetrics(goalType: string | null | undefined): MetricDef[] {
  return SECONDARY[goalType ?? ""] ?? SECONDARY_DEFAULT;
}

function normalizeTotals(m: any) {
  const spend       = Number(m?.totalSpend ?? 0);
  const clicks      = Number(m?.totalClicks ?? 0);
  const impressions = Number(m?.totalImpressions ?? 0);
  return {
    spend,
    clicks,
    impressions,
    conversions:     Number(m?.totalConversions ?? 0),
    conversionValue: Number(m?.totalConversionValue ?? 0),
    reach:           Number(m?.totalReach ?? 0),
    roas:            Number(m?.avgRoas ?? 0),
    cpa:             Number(m?.avgCpa ?? (m?.totalConversions > 0 ? spend / m.totalConversions : 0)),
    ctr:             Number(m?.avgCtr ?? 0),
    cpc:             Number(m?.avgCpc ?? (clicks > 0 ? spend / clicks : 0)),
    cpm:             Number(m?.avgCpm ?? (impressions > 0 ? (spend / impressions) * 1000 : 0)),
    frequency:       0,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function cleanTitle(title: string) {
  return title.replace(/\s*\[[^\]]*\]/g, "").replace(/\s+/g, " ").trim() || title;
}

function initials(name: string | null | undefined) {
  if (!name) return "?";
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
}

function relativeTime(d: Date | string | null): string {
  if (!d) return "";
  const date    = typeof d === "string" ? new Date(d) : d;
  const diffMs  = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "agora";
  if (diffMin < 60) return `há ${diffMin}min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `há ${diffH}h`;
  return `há ${Math.floor(diffH / 24)}d`;
}

function statusDateLabel(): string {
  const d   = new Date();
  const raw = d.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function quickDayStatus(totals: { spend: number; conversions: number; ctr: number }) {
  return getDayStatus("LEADS" as GoalType, { spend: totals.spend, conversions: totals.conversions, ctr: totals.ctr });
}

// Split briefing text: first sentence vs remainder
function splitBriefing(text: string): { first: string; rest: string } {
  const idx = text.indexOf(".");
  if (idx === -1 || idx === text.length - 1) return { first: text, rest: "" };
  return { first: text.slice(0, idx + 1), rest: text.slice(idx + 1) };
}

// Goal-aware primary result label
function getPrimaryResult(goalType: string | null | undefined, t: ReturnType<typeof normalizeTotals>): string {
  if (t.spend === 0) return "—";
  switch (goalType) {
    case "SALES":
    case "VALUE":      return fmtMultiplier(t.roas) + "x ROAS";
    case "LEADS":      return fmtNumber(t.conversions) + " leads";
    case "MESSAGES":   return fmtNumber(t.conversions) + " msgs";
    case "TRAFFIC":    return fmtNumber(t.clicks) + " cliques";
    case "AWARENESS":  return fmtNumber(t.reach) + " alcance";
    case "FOLLOWERS":  return fmtNumber(t.conversions) + " seguid.";
    case "ENGAGEMENT": return fmtNumber(t.conversions) + " engaj.";
    default:           return fmtNumber(t.impressions) + " impr.";
  }
}

// Goal-aware cost per result
function getCostPerResult(goalType: string | null | undefined, t: ReturnType<typeof normalizeTotals>): string {
  if (t.spend === 0) return "—";
  switch (goalType) {
    case "SALES":
    case "VALUE":
    case "LEADS":
    case "MESSAGES":
    case "FOLLOWERS":
    case "ENGAGEMENT": return t.conversions > 0 ? fmtCurrency(t.cpa) + "/res." : "—";
    case "AWARENESS":  return t.impressions > 0 ? fmtCurrency(t.cpm) + "/mil" : "—";
    default:           return t.clicks > 0 ? fmtCurrency(t.cpc) + "/clique" : "—";
  }
}

// Trend bar from AI status color
function getTrendBar(aiStatusColor: string | null | undefined): { width: string; color: string; label: string } {
  if (aiStatusColor === "green")  return { width: "75%", color: "#10b981", label: "A" };
  if (aiStatusColor === "yellow") return { width: "50%", color: "#f59e0b", label: "B" };
  if (aiStatusColor === "red")    return { width: "25%", color: "#ef4444", label: "C" };
  return { width: "30%", color: "hsl(var(--muted-foreground))", label: "—" };
}

// ─── Types ───────────────────────────────────────────────────────────────────

type FogoTab = "URGENT" | "P1" | "P2" | "P3";

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SuggestionsHub() {
  const [fogoTab, setFogoTab]                     = useState<FogoTab>("URGENT");
  const [syncingAll, setSyncingAll]               = useState(false);
  const [syncProgress, setSyncProgress]           = useState<{ done: number; total: number } | null>(null);
  const [briefingExpanded, setBriefingExpanded]   = useState(false);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [briefingOverflows, setBriefingOverflows] = useState(false);
  const [panoramaOpen, setPanoramaOpen]           = useState(false);
  const briefingRef = useRef<HTMLParagraphElement>(null);

  const utils = trpc.useUtils();
  const { data, isLoading: suggestionsLoading } = trpc.suggestions.listAll.useQuery(undefined, { refetchOnWindowFocus: false });
  const { data: accounts }      = trpc.accounts.list.useQuery(undefined, { refetchOnWindowFocus: false });
  const { data: todayMetrics }  = trpc.accounts.todayMetrics.useQuery(undefined, { refetchOnWindowFocus: false });
  const { data: urgentAlerts }  = trpc.alerts.listUrgent.useQuery(undefined, { refetchOnWindowFocus: false });
  const { data: briefingData, isLoading: briefingLoading } = trpc.suggestions.getDailyBriefing.useQuery(undefined, { refetchOnWindowFocus: false });
  const syncAccount = trpc.accounts.sync.useMutation();
  const { setActiveAccountId } = useActiveAccount();
  const [, navigate]           = useLocation();

  // ── Measure briefing overflow once content arrives ────────────────────────

  useEffect(() => {
    if (!briefingData?.content) return;
    setBriefingExpanded(false);
    setBriefingOverflows(false);
    let raf1 = requestAnimationFrame(() => {
      const raf2 = requestAnimationFrame(() => {
        const el = briefingRef.current;
        if (el) setBriefingOverflows(el.scrollHeight > el.clientHeight + 1);
      });
      return () => cancelAnimationFrame(raf2);
    });
    return () => cancelAnimationFrame(raf1);
  }, [briefingData?.content]);

  // ── Display name lookup ───────────────────────────────────────────────────

  const displayNameMap = useMemo(() => {
    const m = new Map<number, string>();
    for (const a of accounts ?? []) {
      m.set(a.id, getClientByMetaAccountId(a.accountId)?.name ?? a.accountName ?? a.accountId);
    }
    return m;
  }, [accounts]);

  const suggestions = data?.suggestions ?? [];

  // ── Derived data ──────────────────────────────────────────────────────────

  const metricsMap = new Map((todayMetrics ?? []).map((m) => [m.accountId, m]));

  const p1ByAccount = suggestions
    .filter((s) => s.priority === "HIGH")
    .reduce<Record<number, number>>((acc, s) => {
      acc[s.accountId] = (acc[s.accountId] ?? 0) + 1;
      return acc;
    }, {});

  const totalSpendToday = (todayMetrics ?? []).reduce((sum, m) => sum + Number(m.totalSpend ?? 0), 0);
  const lastSyncDate    = (accounts ?? []).reduce<Date | null>((latest, a) => {
    if (!a.lastSyncAt) return latest;
    const d = new Date(a.lastSyncAt);
    return !latest || d > latest ? d : latest;
  }, null);

  const p1Count      = suggestions.filter((s) => s.priority === "HIGH").length;
  const p2Count      = suggestions.filter((s) => s.priority === "MEDIUM").length;
  const p3Count      = suggestions.filter((s) => s.priority === "LOW").length;
  const healthyCount = (accounts ?? []).filter((a) => (a as any).aiStatusColor === "green").length;
  const urgencyCount = (accounts ?? []).filter((a) => (a as any).aiStatusColor === "red").length;

  // Sorted by today's spend desc (used by carousel)
  const sortedAccounts = useMemo(() => [...(accounts ?? [])].sort((a, b) => {
    const sa = Number(metricsMap.get(a.id)?.totalSpend ?? 0);
    const sb = Number(metricsMap.get(b.id)?.totalSpend ?? 0);
    return sb - sa;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [accounts, todayMetrics]);

  // "O que está pegando fogo": Estado C + accounts with critical alerts
  const fogoAccounts = useMemo(() => {
    const ids = new Set<number>();
    for (const a of accounts ?? []) {
      if ((a as any).aiStatusColor === "red") ids.add(a.id);
    }
    for (const alert of urgentAlerts ?? []) {
      if (alert.severity === "CRITICAL") ids.add(alert.accountId);
    }
    return (accounts ?? []).filter((a) => ids.has(a.id));
  }, [accounts, urgentAlerts]);

  // Suggestions filtered for active tab
  const tabSuggestions = useMemo(() => {
    if (fogoTab === "URGENT") return [];
    const priority = fogoTab === "P1" ? "HIGH" : fogoTab === "P2" ? "MEDIUM" : "LOW";
    return suggestions.filter((s) => s.priority === priority);
  }, [fogoTab, suggestions]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleSelectAccount = (accountId: number) => {
    setActiveAccountId(accountId);
    navigate("/dashboard");
  };

  const handleGoToSuggestions = (accountId: number) => {
    setActiveAccountId(accountId);
    navigate("/suggestions");
  };

  const handleSyncAll = async () => {
    if (!accounts || accounts.length === 0) { toast.warning("Nenhuma conta conectada."); return; }
    setSyncingAll(true);
    let done = 0;
    for (const account of accounts) {
      setSyncProgress({ done, total: accounts.length });
      try { await syncAccount.mutateAsync({ accountId: account.id, days: 30 }); } catch { /* continue */ }
      done++;
      await new Promise((r) => setTimeout(r, 1000));
    }
    setSyncProgress(null);
    setSyncingAll(false);
    utils.accounts.list.invalidate();
    utils.accounts.todayMetrics.invalidate();
    toast.success(`Sync concluído para ${done} conta(s).`);
  };

  // ── Tab config ────────────────────────────────────────────────────────────

  const fogoTabs: { id: FogoTab; label: string; count: number; activeColor: string }[] = [
    { id: "URGENT", label: "Urgente", count: fogoAccounts.length, activeColor: "text-red-400 border-red-400/50 bg-red-400/8" },
    { id: "P1",     label: "P1",      count: p1Count,             activeColor: "text-red-400 border-red-400/50 bg-red-400/8" },
    { id: "P2",     label: "P2",      count: p2Count,             activeColor: "text-amber-400 border-amber-400/50 bg-amber-400/8" },
    { id: "P3",     label: "P3",      count: p3Count,             activeColor: "text-blue-400 border-blue-400/50 bg-blue-400/8" },
  ];

  // ── Stat cards ────────────────────────────────────────────────────────────

  const statCards = [
    { label: "Contas saudáveis", value: healthyCount,                        color: "#10b981", icon: CheckCircle2, subtitle: "Estado A" },
    { label: "Sugestões P1",     value: suggestionsLoading ? null : p1Count, color: p1Count > 0 ? "#ef4444" : "var(--foreground)", icon: AlertTriangle, subtitle: "alta prioridade" },
    { label: "Urgências",        value: urgencyCount,                         color: urgencyCount > 0 ? "#f59e0b" : "var(--foreground)", icon: Flame,         subtitle: "Estado C" },
    { label: "Alertas ativos",   value: urgentAlerts?.length ?? 0,           color: (urgentAlerts?.length ?? 0) > 0 ? "#3b82f6" : "var(--foreground)", icon: Bell, subtitle: "requerem atenção" },
  ];

  // ── Briefing split ────────────────────────────────────────────────────────

  const briefingSplit = briefingData?.content ? splitBriefing(briefingData.content) : null;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <MetaDashboardLayout>
      <div className="max-w-4xl mx-auto pb-8">

        {/* ══ 1 — Caixa unificada: top bar + briefing + status cards ══════ */}
        <div className="px-6 pt-6">
          <div style={{ background: BG_PRIMARY, border: `0.5px solid ${BORDER_T}`, borderRadius: RADIUS_LG, overflow: "hidden" }}>

            {/* Top bar */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground" style={{ padding: "10px 16px", borderBottom: `0.5px solid ${BORDER_T}` }}>
              <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
              <span className="text-foreground/80 font-medium">{statusDateLabel()}</span>
              <span className="text-border/60 select-none">·</span>
              <span>{accounts?.length ?? 0} contas ativas</span>
              {lastSyncDate && (
                <>
                  <span className="text-border/60 select-none">·</span>
                  <span>Última sync {relativeTime(lastSyncDate)}</span>
                </>
              )}
              <span className="text-border/60 select-none">·</span>
              <span className="font-medium text-foreground/70">{fmtCurrency(totalSpendToday)} investido hoje</span>
              <div className="ml-auto flex-shrink-0">
                <button
                  onClick={handleSyncAll}
                  disabled={syncingAll}
                  className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-md transition-colors disabled:opacity-50"
                  style={{ border: "0.5px solid rgba(232,91,168,0.5)", color: "#E85BA8", background: "rgba(232,91,168,0.06)" }}
                >
                  <RefreshCw className={`w-3 h-3 ${syncingAll ? "animate-spin" : ""}`} />
                  {syncProgress ? `Sincronizando ${syncProgress.done + 1}/${syncProgress.total}…` : "Sincronizar todas"}
                </button>
              </div>
            </div>

            {/* Briefing da IA */}
            <div style={{ padding: "14px 16px", borderBottom: `0.5px solid ${BORDER_T}` }}>
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#E85BA8" }} />
                <span className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: "#E85BA8" }}>Briefing do Dia — IA</span>
              </div>
              {briefingLoading ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Sparkles className="w-3 h-3 animate-pulse" style={{ color: "#E85BA8" }} />
                  Gerando briefing do dia…
                </div>
              ) : briefingSplit ? (
                <div>
                  <p ref={briefingRef} className="text-[13px] leading-relaxed"
                    style={briefingExpanded ? {} : { overflow: "hidden", display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: 2 } as React.CSSProperties}>
                    <strong style={{ fontWeight: 500, color: "var(--color-text-primary, var(--foreground))" }}>{briefingSplit.first}</strong>
                    {briefingSplit.rest && <span style={{ color: "var(--color-text-secondary, var(--muted-foreground))" }}>{briefingSplit.rest}</span>}
                  </p>
                  {briefingOverflows && (
                    <button onClick={() => setBriefingExpanded(v => !v)} className="text-[11px] font-medium mt-1 hover:opacity-70" style={{ color: "#E85BA8" }}>
                      {briefingExpanded ? "ver menos" : "ver mais"}
                    </button>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Nenhum dado disponível para gerar o briefing.</p>
              )}
            </div>

            {/* Status cards clicáveis */}
            {(() => {
              const statusCounts = {
                green:  (accounts ?? []).filter((a: any) => a.aiStatusColor === "green").length,
                yellow: (accounts ?? []).filter((a: any) => a.aiStatusColor === "yellow").length,
                red:    (accounts ?? []).filter((a: any) => a.aiStatusColor === "red").length,
                none:   (accounts ?? []).filter((a: any) => !a.aiStatusColor || (a as any).hasTokenError).length,
              };
              const statusDefs = [
                { key: "green",  label: "Saudável",  sublabel: "Estado A · sem intervenção", color: "#1D9E75", bg: "rgba(29,158,117,0.06)",  activeBg: "rgba(29,158,117,0.12)",  count: statusCounts.green },
                { key: "yellow", label: "Atenção",   sublabel: "Estado B · monitorar",       color: "#EF9F27", bg: "rgba(239,159,39,0.06)",  activeBg: "rgba(239,159,39,0.12)",  count: statusCounts.yellow },
                { key: "red",    label: "Crítico",   sublabel: "Estado C · agir agora",      color: "#E24B4A", bg: "rgba(226,75,74,0.06)",   activeBg: "rgba(226,75,74,0.12)",   count: statusCounts.red },
                { key: "none",   label: "Sem dados", sublabel: "token expirado",             color: "rgba(0,0,0,0.35)", bg: "rgba(0,0,0,0.02)", activeBg: "rgba(0,0,0,0.06)", count: statusCounts.none },
              ];
              return (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 0 }}>
                  {statusDefs.map(({ key, label, sublabel, color, bg, activeBg, count }, i) => (
                    <button
                      key={key}
                      onClick={() => setStatusFilter(statusFilter === key ? null : key)}
                      style={{
                        padding: "14px 16px",
                        background: statusFilter === key ? activeBg : bg,
                        borderTop: `0.5px solid ${BORDER_T}`,
                        borderRight: i < 3 ? `0.5px solid ${BORDER_T}` : "none",
                        borderBottom: statusFilter === key ? `2px solid ${color}` : "none",
                        borderLeft: "none",
                        cursor: "pointer",
                        textAlign: "left",
                        transition: "all 0.15s",
                      }}
                    >
                      <p style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color, marginBottom: 6 }}>
                        {label} · 7d
                      </p>
                      <p style={{ fontSize: 26, fontWeight: 500, color, lineHeight: 1, marginBottom: 4 }}>{count}</p>
                      <p style={{ fontSize: 10, color, opacity: 0.6 }}>{sublabel}</p>
                    </button>
                  ))}
                </div>
              );
            })()}

          </div>
        </div>

        {/* ══ 2 — Carrossel de clientes ═════════════════════════════════════ */}
        {sortedAccounts.length > 0 && (
          <div className="px-6 pt-4">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                {statusFilter ? `Contas — ${statusFilter === "green" ? "Saudável" : statusFilter === "yellow" ? "Atenção" : statusFilter === "red" ? "Crítico" : "Sem dados"}` : "Clientes"}
              </p>
              {statusFilter && (
                <button onClick={() => setStatusFilter(null)} style={{ fontSize: 10, color: "#E85BA8", background: "none", border: "none", cursor: "pointer" }}>
                  Limpar filtro ×
                </button>
              )}
            </div>
            <div className="flex gap-3 pb-1" style={{ overflowX: "auto", scrollbarWidth: "none" }}>
              {sortedAccounts.filter((account: any) => {
                if (!statusFilter) return true;
                if (statusFilter === "none") return !account.aiStatusColor || account.hasTokenError;
                return account.aiStatusColor === statusFilter && !account.hasTokenError;
              }).map((account) => {
                const m          = metricsMap.get(account.id);
                const totals     = normalizeTotals(m);
                const p1         = p1ByAccount[account.id] ?? 0;
                const estado     = estadoConfig[(account as any).aiStatusColor ?? ""] ?? null;
                const goalType   = ((account as any).goalTypeOverride as string | null) ?? "DEFAULT";
                const dayS       = totals.spend > 0
                  ? quickDayStatus({ spend: totals.spend, conversions: totals.conversions, ctr: totals.ctr })
                  : null;
                const secMetrics = secondaryMetrics(goalType);

                return (
                  <button
                    key={account.id}
                    onClick={() => handleSelectAccount(account.id)}
                    className="flex-shrink-0 rounded-xl text-left transition-all hover:shadow-md relative overflow-hidden"
                    style={{
                      width: 200,
                      background: BG_PRIMARY,
                      border: `0.5px solid ${BORDER_T}`,
                      borderLeft: `3px solid ${estado?.border ?? BORDER_T}`,
                      borderRadius: RADIUS_LG,
                    }}
                  >
                    {p1 > 0 && (
                      <span
                        className="absolute top-2 right-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full z-10 text-white"
                        style={{ background: "#ef4444" }}
                      >
                        {p1} P1
                      </span>
                    )}
                    <div className="p-3 space-y-2">
                      <div className="flex items-center gap-2 pr-8">
                        <div
                          className="flex-shrink-0 flex items-center justify-center font-bold overflow-hidden text-primary"
                          style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(212,83,126,0.12)", fontSize: 11 }}
                        >
                          {account.pictureUrl
                            ? <img src={account.pictureUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                            : (getClientByMetaAccountId(account.accountId)?.shortName ?? initials(account.accountName))}
                        </div>
                        <p className="text-xs font-semibold text-foreground truncate leading-snug">
                          {displayNameMap.get(account.id) ?? account.accountName ?? account.accountId}
                        </p>
                      </div>

                      {estado ? (
                        <Badge variant="outline" className={`text-[10px] font-bold ${estado.cls}`}>
                          Estado {estado.badge}
                        </Badge>
                      ) : (
                        <span className="text-[10px] text-muted-foreground/50">Sem análise</span>
                      )}

                      <div className="border-t pt-2" style={{ borderColor: BORDER_T }}>
                        <p className="text-[10px] text-muted-foreground mb-1">Investido hoje</p>
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-lg font-medium text-foreground leading-none">
                            {fmtCurrency(totals.spend)}
                          </span>
                          {dayS && (
                            <span
                              className="text-[9px] font-bold px-1.5 py-0.5 rounded flex-shrink-0"
                              style={{ background: dayS.bg, color: dayS.color, border: `0.5px solid ${dayS.border}` }}
                            >
                              {dayS.label}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between border-t pt-1.5" style={{ borderColor: BORDER_T }}>
                        {secMetrics.map((sm) => (
                          <div key={sm.label} className="flex flex-col items-start gap-0.5">
                            <span className="text-[9px] text-muted-foreground uppercase tracking-wide">{sm.label}</span>
                            <span className="text-[11px] font-semibold text-foreground">
                              {totals.spend > 0 ? sm.fmt(totals) : "—"}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ══ 3 — Caixa unificada (stats + briefing + fogo) ════════════════ */}
        <div className="px-6 pt-4">
          <div
            style={{
              background: BG_PRIMARY,
              border: `0.5px solid ${BORDER_T}`,
              borderRadius: RADIUS_LG,
              padding: 16,
            }}
          >

            {/* Briefing da IA */}
            <div>
              <div className="flex items-center gap-2 mb-2.5">
                <Sparkles className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#E85BA8" }} />
                <span
                  className="text-[10px] font-bold uppercase tracking-[0.12em]"
                  style={{ color: "#E85BA8" }}
                >
                  Briefing do Dia — IA
                </span>
              </div>

              {briefingLoading ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Sparkles className="w-3 h-3 animate-pulse" style={{ color: "#E85BA8" }} />
                  Gerando briefing do dia…
                </div>
              ) : briefingSplit ? (
                <div>
                  <p
                    ref={briefingRef}
                    className="text-[13px] leading-relaxed"
                    style={briefingExpanded ? {} : {
                      overflow: "hidden",
                      display: "-webkit-box",
                      WebkitBoxOrient: "vertical",
                      WebkitLineClamp: 3,
                    } as React.CSSProperties}
                  >
                    <strong style={{ fontWeight: 500, color: "var(--color-text-primary, var(--foreground))" }}>
                      {briefingSplit.first}
                    </strong>
                    {briefingSplit.rest && (
                      <span style={{ color: "var(--color-text-secondary, var(--muted-foreground))" }}>
                        {briefingSplit.rest}
                      </span>
                    )}
                  </p>
                  {briefingOverflows && (
                    <button
                      onClick={() => setBriefingExpanded((v) => !v)}
                      className="text-[11px] font-medium mt-1.5 hover:opacity-70 transition-opacity"
                      style={{ color: "#E85BA8" }}
                    >
                      {briefingExpanded ? "ver menos" : "ver mais"}
                    </button>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Nenhum dado disponível para gerar o briefing.</p>
              )}
            </div>

            {/* Divider */}
            <div style={{ borderTop: `0.5px solid ${BORDER_T}`, margin: "16px 0" }} />

            {/* Stats — 4 cards compactos */}
            <div className="grid grid-cols-4 gap-2">
              {statCards.map(({ label, value, color, icon: Icon, subtitle }) => (
                <div
                  key={label}
                  style={{
                    background: "var(--color-background-secondary, rgba(0,0,0,0.04))",
                    border: `0.5px solid ${BORDER_T}`,
                    borderRadius: 8,
                    padding: "10px 12px",
                  }}
                >
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Icon className="w-3 h-3 flex-shrink-0" style={{ color }} />
                    <span className="text-[10px] text-muted-foreground leading-none truncate">{label}</span>
                  </div>
                  <p className="text-[18px] font-bold leading-none" style={{ color }}>
                    {value ?? "—"}
                  </p>
                  <p className="text-[10px] text-muted-foreground/60 mt-0.5">{subtitle}</p>
                </div>
              ))}
            </div>

            {/* Divider */}
            <div style={{ borderTop: `0.5px solid ${BORDER_T}`, margin: "16px 0" }} />

            {/* O que está pegando fogo — com tabs */}
            <div>
              <div className="flex items-center gap-3 mb-3">
                <Flame className="w-3.5 h-3.5 flex-shrink-0 text-red-400" />
                <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-red-400">
                  O que está pegando fogo
                </span>
                <div className="flex items-center gap-1">
                  {fogoTabs.map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setFogoTab(tab.id)}
                      className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border transition-all ${
                        fogoTab === tab.id
                          ? tab.activeColor
                          : "text-muted-foreground border-border/40 hover:border-border hover:text-foreground"
                      }`}
                    >
                      {tab.label}
                      {tab.count > 0 && (
                        <span className="text-[9px] font-bold opacity-70">{tab.count}</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tab: Urgente */}
              {fogoTab === "URGENT" && (
                fogoAccounts.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhuma conta em estado crítico.</p>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {fogoAccounts.map((account) => {
                      const m       = metricsMap.get(account.id);
                      const totals  = normalizeTotals(m);
                      const p1      = p1ByAccount[account.id] ?? 0;
                      const summary = (account as any).aiStatusSummary as string | null;
                      const picture = (account as any).pictureUrl as string | null;

                      return (
                        <button
                          key={account.id}
                          onClick={() => handleSelectAccount(account.id)}
                          className="rounded-xl text-left transition-all hover:shadow-sm"
                          style={{
                            background: "var(--color-background-secondary)",
                            border: `0.5px solid ${BORDER_T}`,
                            borderLeft: "3px solid #f87171",
                            borderRadius: RADIUS_LG,
                          }}
                        >
                          <div className="p-3 space-y-2">
                            <div className="flex items-center gap-2">
                              <div
                                className="flex-shrink-0 flex items-center justify-center font-bold overflow-hidden text-red-400"
                                style={{ width: 28, height: 28, borderRadius: 7, background: "rgba(248,113,113,0.12)", fontSize: 10 }}
                              >
                                {picture
                                  ? <img src={picture} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                  : (getClientByMetaAccountId(account.accountId)?.shortName ?? initials(account.accountName))}
                              </div>
                              <p className="text-xs font-semibold text-foreground truncate leading-snug flex-1 min-w-0">
                                {displayNameMap.get(account.id) ?? account.accountName}
                              </p>
                            </div>
                            <Badge variant="outline" className="text-[10px] font-bold text-red-400 border-red-400/30 bg-red-400/10">
                              Estado C
                            </Badge>
                            {summary && (
                              <p className="text-[11px] text-muted-foreground leading-snug line-clamp-2">{summary}</p>
                            )}
                            <div className="flex items-center justify-between border-t pt-1.5" style={{ borderColor: BORDER_T }}>
                              <span className="text-[11px] font-medium text-foreground">{fmtCurrency(totals.spend)}</span>
                              {p1 > 0 && (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full text-white" style={{ background: "#ef4444" }}>
                                  {p1} P1
                                </span>
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )
              )}

              {/* Tabs: P1 / P2 / P3 */}
              {fogoTab !== "URGENT" && (
                tabSuggestions.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhuma sugestão {fogoTab} pendente.</p>
                ) : (
                  <div className="rounded-xl overflow-hidden" style={{ border: `0.5px solid ${BORDER_T}` }}>
                    {tabSuggestions.map((s, idx) => {
                      const account = accounts?.find((a) => a.id === s.accountId);
                      const picture = ((account as any)?.pictureUrl as string | null) ?? null;
                      const cat     = categoryConfig[s.category] ?? categoryConfig.GENERAL;

                      return (
                        <div
                          key={s.id}
                          className="flex items-center gap-2.5 px-3 py-2 transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                          style={{ borderBottom: idx < tabSuggestions.length - 1 ? `0.5px solid ${BORDER_T}` : undefined }}
                        >
                          <div
                            className="flex-shrink-0 flex items-center justify-center font-bold overflow-hidden text-primary"
                            style={{ width: 24, height: 24, borderRadius: 6, background: "rgba(212,83,126,0.12)", fontSize: 9 }}
                          >
                            {picture
                              ? <img src={picture} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                              : (getClientByMetaAccountId(s.metaAccountId)?.shortName ?? initials(s.accountName))}
                          </div>
                          <span className="text-[10px] font-medium text-muted-foreground flex-shrink-0 truncate" style={{ maxWidth: 80 }}>
                            {displayNameMap.get(s.accountId) ?? s.accountName}
                          </span>
                          <span className="text-xs text-foreground flex-1 min-w-0 truncate">
                            {cleanTitle(s.title)}
                          </span>
                          <Badge variant="outline" className={`text-[10px] flex-shrink-0 ${cat.color}`}>
                            {cat.label}
                          </Badge>
                          <button
                            onClick={() => handleGoToSuggestions(s.accountId)}
                            className="text-[10px] font-medium flex-shrink-0 hover:underline"
                            style={{ color: "#E85BA8" }}
                          >
                            Ver ações
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )
              )}
            </div>

          </div>
        </div>

        {/* ══ 4 — Separador "Panorama geral" (toggle) ════════════════════ */}
        <button
          onClick={() => setPanoramaOpen((v) => !v)}
          className="w-full"
          style={{ display: "flex", alignItems: "center", gap: 12, padding: "20px 24px", cursor: "pointer" }}
        >
          <div style={{ flex: 1, height: "0.5px", background: BORDER_T }} />
          <span
            className="flex items-center gap-1.5 text-muted-foreground flex-shrink-0 hover:opacity-70 transition-opacity"
            style={{
              fontSize: 11,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.12em",
              padding: "4px 12px",
              border: `0.5px solid ${BORDER_T}`,
              borderRadius: 20,
            }}
          >
            {panoramaOpen ? "Fechar panorama" : "Panorama geral"}
            <ChevronDown
              className="w-3 h-3 transition-transform duration-200"
              style={{ transform: panoramaOpen ? "rotate(180deg)" : "rotate(0deg)" }}
            />
          </span>
          <div style={{ flex: 1, height: "0.5px", background: BORDER_T }} />
        </button>

        {/* ══ 5 — Tabela de performance (expansível) ════════════════════════ */}
        <div
          style={{
            maxHeight: panoramaOpen ? "3000px" : "0px",
            opacity: panoramaOpen ? 1 : 0,
            overflow: "hidden",
            transition: "max-height 0.4s ease, opacity 0.25s ease",
          }}
        >
          <div className="px-6 pb-8">
            <div
              style={{
                background: BG_PRIMARY,
                border: `0.5px solid ${BORDER_T}`,
                borderRadius: RADIUS_LG,
                overflow: "hidden",
              }}
            >
              {/* Header */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "2fr 1.4fr 1.4fr 0.7fr 1.3fr 1.2fr",
                  gap: 8,
                  padding: "8px 16px",
                  background: "var(--color-background-secondary, rgba(0,0,0,0.04))",
                  borderBottom: `0.5px solid ${BORDER_T}`,
                }}
              >
                {["Conta", "Investido hoje", "Resultado", "CTR", "Custo/resultado", "Tendência"].map((col) => (
                  <span key={col} className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                    {col}
                  </span>
                ))}
              </div>

              {/* Rows */}
              {sortedAccounts.map((account, idx) => {
                const m         = metricsMap.get(account.id);
                const totals    = normalizeTotals(m);
                const goalType  = ((account as any).goalTypeOverride as string | null) ?? null;
                const dayS      = totals.spend > 0
                  ? quickDayStatus({ spend: totals.spend, conversions: totals.conversions, ctr: totals.ctr })
                  : null;
                const trend     = getTrendBar((account as any).aiStatusColor);
                const picture   = (account as any).pictureUrl as string | null;
                const primary   = getPrimaryResult(goalType, totals);
                const costRes   = getCostPerResult(goalType, totals);

                return (
                  <button
                    key={account.id}
                    onClick={() => handleSelectAccount(account.id)}
                    className="w-full text-left transition-colors hover:bg-black/[0.025] dark:hover:bg-white/[0.025]"
                    style={{
                      display: "grid",
                      gridTemplateColumns: "2fr 1.4fr 1.4fr 0.7fr 1.3fr 1.2fr",
                      gap: 8,
                      padding: "10px 16px",
                      borderTop: idx > 0 ? `0.5px solid ${BORDER_T}` : undefined,
                      alignItems: "center",
                    }}
                  >
                    {/* Conta */}
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className="flex-shrink-0 flex items-center justify-center font-bold overflow-hidden text-primary"
                        style={{ width: 24, height: 24, borderRadius: 6, background: "rgba(212,83,126,0.12)", fontSize: 9 }}
                      >
                        {picture
                          ? <img src={picture} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          : (getClientByMetaAccountId(account.accountId)?.shortName ?? initials(account.accountName))}
                      </div>
                      <span className="text-xs font-medium text-foreground truncate">
                        {displayNameMap.get(account.id) ?? account.accountName}
                      </span>
                    </div>

                    {/* Investido hoje */}
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-xs font-semibold text-foreground">{fmtCurrency(totals.spend)}</span>
                      {dayS && (
                        <span
                          className="text-[9px] font-bold px-1.5 py-0.5 rounded flex-shrink-0"
                          style={{ background: dayS.bg, color: dayS.color, border: `0.5px solid ${dayS.border}` }}
                        >
                          {dayS.label}
                        </span>
                      )}
                    </div>

                    {/* Resultado principal */}
                    <span className="text-xs text-foreground/80">{primary}</span>

                    {/* CTR */}
                    <span className="text-xs text-foreground/80">{totals.spend > 0 ? fmtPercent(totals.ctr) : "—"}</span>

                    {/* Custo/resultado */}
                    <span className="text-xs text-foreground/80">{costRes}</span>

                    {/* Tendência */}
                    <div className="flex items-center gap-2">
                      <div
                        style={{
                          flex: 1,
                          height: 4,
                          background: "rgba(0,0,0,0.08)",
                          borderRadius: 2,
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            height: "100%",
                            width: trend.width,
                            background: trend.color,
                            borderRadius: 2,
                          }}
                        />
                      </div>
                      <span
                        className="text-[10px] font-bold flex-shrink-0"
                        style={{ color: trend.color, minWidth: 12 }}
                      >
                        {trend.label}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

      </div>
    </MetaDashboardLayout>
  );
}
