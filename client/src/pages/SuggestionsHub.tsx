import { MetaDashboardLayout } from "@/components/MetaDashboardLayout";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useActiveAccount } from "@/contexts/ActiveAccountContext";
import { toast } from "sonner";
import { getClientByMetaAccountId } from "@/config/clientConfig";
import { fmtCurrency, fmtNumber, fmtPercent, fmtMultiplier, getDayStatus, type GoalType } from "@/lib/kpiConfig";
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Flame,
  RefreshCw,
  Sparkles,
} from "lucide-react";

// ─── Config ──────────────────────────────────────────────────────────────────

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
  const spend = Number(m?.totalSpend ?? 0);
  const clicks = Number(m?.totalClicks ?? 0);
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

function getPrimaryResult(totals: ReturnType<typeof normalizeTotals>, goalType: string | null | undefined) {
  const gt = goalType ?? "";
  if (gt === "SALES" || gt === "VALUE") return { label: "ROAS",    value: fmtMultiplier(totals.roas) };
  if (gt === "TRAFFIC")                 return { label: "Visitas", value: fmtNumber(totals.clicks) };
  if (gt === "AWARENESS")               return { label: "Alcance", value: fmtNumber(totals.reach) };
  if (gt === "MESSAGES")                return { label: "Msgs",    value: fmtNumber(totals.conversions) };
  if (gt === "FOLLOWERS")               return { label: "Seguid.", value: fmtNumber(totals.conversions) };
  if (gt === "ENGAGEMENT")              return { label: "Engaj.",  value: fmtNumber(totals.conversions) };
  if (gt === "LEADS")                   return { label: "Leads",   value: fmtNumber(totals.conversions) };
  return { label: "Resultados", value: fmtNumber(totals.conversions) };
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
  const date = typeof d === "string" ? new Date(d) : d;
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "agora";
  if (diffMin < 60) return `há ${diffMin}min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `há ${diffH}h`;
  return `há ${Math.floor(diffH / 24)}d`;
}

function statusDateLabel(): string {
  const d = new Date();
  const raw = d.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function quickDayStatus(totals: { spend: number; conversions: number; ctr: number }) {
  return getDayStatus("LEADS" as GoalType, { spend: totals.spend, conversions: totals.conversions, ctr: totals.ctr });
}

// ─── Types ───────────────────────────────────────────────────────────────────

type FogoTab = "URGENT" | "P1" | "P2" | "P3";

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SuggestionsHub() {
  const [fogoTab, setFogoTab] = useState<FogoTab>("URGENT");
  const [syncingAll, setSyncingAll] = useState(false);
  const [syncProgress, setSyncProgress] = useState<{ done: number; total: number } | null>(null);

  const utils = trpc.useUtils();
  const { data, isLoading: suggestionsLoading } = trpc.suggestions.listAll.useQuery(undefined, { refetchOnWindowFocus: false });
  const { data: accounts } = trpc.accounts.list.useQuery(undefined, { refetchOnWindowFocus: false });
  const { data: todayMetrics } = trpc.accounts.todayMetrics.useQuery(undefined, { refetchOnWindowFocus: false });
  const { data: urgentAlerts } = trpc.alerts.listUrgent.useQuery(undefined, { refetchOnWindowFocus: false });
  const { data: briefingData, isLoading: briefingLoading } = trpc.suggestions.getDailyBriefing.useQuery(undefined, { refetchOnWindowFocus: false });
  const syncAccount = trpc.accounts.sync.useMutation();
  const { setActiveAccountId } = useActiveAccount();
  const [, navigate] = useLocation();

  // displayName lookup
  const displayNameMap = useMemo(() => {
    const m = new Map<number, string>();
    for (const a of accounts ?? []) {
      m.set(a.id, getClientByMetaAccountId(a.accountId)?.name ?? a.accountName ?? a.accountId);
    }
    return m;
  }, [accounts]);

  const suggestions = data?.suggestions ?? [];

  // ── Derived data ─────────────────────────────────────────────────────────

  const metricsMap = new Map((todayMetrics ?? []).map((m) => [m.accountId, m]));

  const p1ByAccount = suggestions
    .filter((s) => s.priority === "HIGH")
    .reduce<Record<number, number>>((acc, s) => { acc[s.accountId] = (acc[s.accountId] ?? 0) + 1; return acc; }, {});

  const totalSpendToday = (todayMetrics ?? []).reduce((sum, m) => sum + Number(m.totalSpend ?? 0), 0);
  const lastSyncDate = (accounts ?? []).reduce<Date | null>((latest, a) => {
    if (!a.lastSyncAt) return latest;
    const d = new Date(a.lastSyncAt);
    return !latest || d > latest ? d : latest;
  }, null);

  const p1Count = suggestions.filter((s) => s.priority === "HIGH").length;
  const p2Count = suggestions.filter((s) => s.priority === "MEDIUM").length;
  const p3Count = suggestions.filter((s) => s.priority === "LOW").length;
  const healthyCount = (accounts ?? []).filter((a) => (a as any).aiStatusColor === "green").length;

  // Accounts sorted by today's spend desc (shared by carousel + perf table)
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

  // Suggestions filtered by tab priority
  const tabSuggestions = useMemo(() => {
    if (fogoTab === "URGENT") return [];
    const priority = fogoTab === "P1" ? "HIGH" : fogoTab === "P2" ? "MEDIUM" : "LOW";
    return suggestions.filter((s) => s.priority === priority);
  }, [fogoTab, suggestions]);

  const maxSpend = sortedAccounts.reduce((max, a) => {
    const s = Number(metricsMap.get(a.id)?.totalSpend ?? 0);
    return s > max ? s : max;
  }, 0);

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

  // ── Fogo tab config ───────────────────────────────────────────────────────

  const fogoTabs: { id: FogoTab; label: string; count: number; activeColor: string }[] = [
    { id: "URGENT", label: "Urgente", count: fogoAccounts.length, activeColor: "text-red-400 border-red-400/50 bg-red-400/8" },
    { id: "P1",     label: "P1",      count: p1Count,             activeColor: "text-red-400 border-red-400/50 bg-red-400/8" },
    { id: "P2",     label: "P2",      count: p2Count,             activeColor: "text-amber-400 border-amber-400/50 bg-amber-400/8" },
    { id: "P3",     label: "P3",      count: p3Count,             activeColor: "text-blue-400 border-blue-400/50 bg-blue-400/8" },
  ];

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <MetaDashboardLayout>
      <div className="max-w-4xl mx-auto">

        {/* ══ S1 — HERO ═════════════════════════════════════════════════════ */}
        <div className="px-6 pt-6 pb-0 space-y-4">

          {/* Status line */}
          <div
            className="flex items-center gap-2 text-xs text-muted-foreground"
            style={{ border: "0.5px solid var(--border)", borderRadius: 8, padding: "8px 14px" }}
          >
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

          {/* Stat cards (3 cols) */}
          <div className="grid grid-cols-3 gap-3">

            {/* Contas saudáveis */}
            <div
              className="flex items-center gap-3"
              style={{ border: "0.5px solid var(--border)", borderRadius: 12, padding: "12px 14px" }}
            >
              <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 text-emerald-500 bg-emerald-500/10">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p
                  className="font-medium leading-none"
                  style={{ fontSize: 22, color: healthyCount > 0 ? "#10b981" : "var(--foreground)" }}
                >
                  {healthyCount}
                </p>
                <p className="text-[12px] text-muted-foreground mt-1">Contas saudáveis</p>
                <p className="text-[11px] text-muted-foreground/60">Estado A</p>
              </div>
            </div>

            {/* Sugestões P1 */}
            <div
              className="flex items-center gap-3"
              style={{ border: "0.5px solid var(--border)", borderRadius: 12, padding: "12px 14px" }}
            >
              <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 text-red-500 bg-red-500/10">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p
                  className="font-medium leading-none"
                  style={{ fontSize: 22, color: p1Count > 0 ? "#ef4444" : "var(--foreground)" }}
                >
                  {suggestionsLoading ? "—" : p1Count}
                </p>
                <p className="text-[12px] text-muted-foreground mt-1">Sugestões P1</p>
                <p className="text-[11px] text-muted-foreground/60">alta prioridade</p>
              </div>
            </div>

            {/* Alertas ativos */}
            <div
              className="flex items-center gap-3"
              style={{ border: "0.5px solid var(--border)", borderRadius: 12, padding: "12px 14px" }}
            >
              <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 text-amber-500 bg-amber-500/10">
                <Bell className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p
                  className="font-medium leading-none"
                  style={{ fontSize: 22, color: (urgentAlerts?.length ?? 0) > 0 ? "#f59e0b" : "var(--foreground)" }}
                >
                  {urgentAlerts?.length ?? 0}
                </p>
                <p className="text-[12px] text-muted-foreground mt-1">Alertas ativos</p>
                <p className="text-[11px] text-muted-foreground/60">requerem atenção</p>
              </div>
            </div>

          </div>
        </div>

        {/* Divisor 1 */}
        <div className="border-t border-border/40 mt-5" />

        {/* ══ S2 — BRIEFING DA IA ═══════════════════════════════════════════ */}
        <div className="px-6 pt-5 pb-0">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#E85BA8" }} />
            <span className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: "#E85BA8" }}>
              Briefing do Dia — IA
            </span>
          </div>
          <div
            className="rounded-xl p-4"
            style={{ background: "hsl(var(--muted))", border: "0.5px solid var(--border)" }}
          >
            {briefingLoading ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Sparkles className="w-3.5 h-3.5 animate-pulse" style={{ color: "#E85BA8" }} />
                Gerando briefing do dia…
              </div>
            ) : briefingData?.content ? (
              <p className="text-[13px] text-foreground/85 leading-relaxed">{briefingData.content}</p>
            ) : (
              <p className="text-xs text-muted-foreground">Nenhum dado disponível para gerar o briefing.</p>
            )}
          </div>
        </div>

        {/* ══ S3 — O QUE ESTÁ PEGANDO FOGO ═════════════════════════════════ */}
        <div className="px-6 pt-5 pb-0">

          {/* Section header + tabs */}
          <div className="flex items-center gap-3 mb-3">
            <Flame className="w-3.5 h-3.5 flex-shrink-0 text-red-400" />
            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-red-400">
              O que está pegando fogo
            </span>
            <div className="flex items-center gap-1 ml-1">
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
              <p className="text-xs text-muted-foreground py-3">Nenhuma conta em estado crítico.</p>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                {fogoAccounts.map((account) => {
                  const m = metricsMap.get(account.id);
                  const totals = normalizeTotals(m);
                  const p1 = p1ByAccount[account.id] ?? 0;
                  const summary = (account as any).aiStatusSummary as string | null;
                  const picture = (account as any).pictureUrl as string | null;

                  return (
                    <button
                      key={account.id}
                      onClick={() => handleSelectAccount(account.id)}
                      className="rounded-xl text-left transition-all hover:shadow-md bg-card"
                      style={{ border: "0.5px solid var(--border)", borderLeft: "3px solid #f87171", borderRadius: 12 }}
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
                        <div className="flex items-center justify-between border-t border-border/40 pt-1.5">
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

          {/* Tabs: P1 / P2 / P3 — compact suggestion rows */}
          {fogoTab !== "URGENT" && (
            tabSuggestions.length === 0 ? (
              <p className="text-xs text-muted-foreground py-3">Nenhuma sugestão {fogoTab} pendente.</p>
            ) : (
              <div
                className="rounded-xl overflow-hidden"
                style={{ border: "0.5px solid var(--border)" }}
              >
                {tabSuggestions.map((s, idx) => {
                  const account = accounts?.find((a) => a.id === s.accountId);
                  const picture = (account as any)?.pictureUrl as string | null ?? null;
                  const cat = categoryConfig[s.category] ?? categoryConfig.GENERAL;

                  return (
                    <div
                      key={s.id}
                      className="flex items-center gap-2.5 px-3 py-2 transition-colors hover:bg-muted/40"
                      style={{ borderBottom: idx < tabSuggestions.length - 1 ? "0.5px solid var(--border)" : undefined }}
                    >
                      {/* Account avatar */}
                      <div
                        className="flex-shrink-0 flex items-center justify-center font-bold overflow-hidden text-primary"
                        style={{ width: 24, height: 24, borderRadius: 6, background: "rgba(212,83,126,0.12)", fontSize: 9 }}
                      >
                        {picture
                          ? <img src={picture} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          : (getClientByMetaAccountId(s.metaAccountId)?.shortName ?? initials(s.accountName))}
                      </div>

                      {/* Account name */}
                      <span className="text-[10px] font-medium text-muted-foreground flex-shrink-0 truncate" style={{ maxWidth: 80 }}>
                        {displayNameMap.get(s.accountId) ?? s.accountName}
                      </span>

                      {/* Suggestion title */}
                      <span className="text-xs text-foreground flex-1 min-w-0 truncate">
                        {cleanTitle(s.title)}
                      </span>

                      {/* Category pill */}
                      <Badge variant="outline" className={`text-[10px] flex-shrink-0 ${cat.color}`}>
                        {cat.label}
                      </Badge>

                      {/* Ver ações */}
                      <button
                        onClick={() => handleGoToSuggestions(s.accountId)}
                        className="text-[10px] font-medium flex-shrink-0 transition-colors hover:underline"
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

        {/* Divisor 2 */}
        <div className="border-t border-border/40 mt-5" />

        {/* ══ S4 — CARROSSEL ════════════════════════════════════════════════ */}
        {sortedAccounts.length > 0 && (
          <div className="px-6 pt-5 pb-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground mb-3">
              Clientes
            </p>
            <div className="flex gap-3 pb-2" style={{ overflowX: "auto", scrollbarWidth: "none" }}>
              {sortedAccounts.map((account) => {
                const m = metricsMap.get(account.id);
                const totals = normalizeTotals(m);
                const p1 = p1ByAccount[account.id] ?? 0;
                const estado = estadoConfig[(account as any).aiStatusColor ?? ""] ?? null;
                const goalType: string = (account as any).goalTypeOverride ?? "DEFAULT";
                const dayS = totals.spend > 0
                  ? quickDayStatus({ spend: totals.spend, conversions: totals.conversions, ctr: totals.ctr })
                  : null;
                const secMetrics = secondaryMetrics(goalType);

                return (
                  <button
                    key={account.id}
                    onClick={() => handleSelectAccount(account.id)}
                    className="flex-shrink-0 rounded-xl text-left transition-all hover:shadow-md hover:border-primary/40 relative overflow-hidden bg-card"
                    style={{ width: 200, border: `0.5px solid var(--border)`, borderLeft: `3px solid ${estado?.border ?? "var(--border)"}` }}
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
                      <div className="border-t border-border/50 pt-2">
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
                      <div className="flex items-center justify-between border-t border-border/40 pt-1.5">
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

        {/* ══ S5 — PERFORMANCE TABLE ════════════════════════════════════════ */}
        <div className="px-6 py-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground mb-3">
            Performance hoje
          </p>

          {sortedAccounts.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhum dado disponível.</p>
          ) : (
            <div className="rounded-xl overflow-hidden" style={{ border: "0.5px solid var(--border)" }}>
              <div
                className="grid text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground px-3 py-2"
                style={{ gridTemplateColumns: "1fr 110px 90px 70px 100px 60px", background: "hsl(var(--muted))", borderBottom: "0.5px solid var(--border)" }}
              >
                <span>Conta</span>
                <span>Investido</span>
                <span>Resultado</span>
                <span>CTR</span>
                <span>Custo/result.</span>
                <span>Tendência</span>
              </div>

              {sortedAccounts.map((account, idx) => {
                const m = metricsMap.get(account.id);
                const totals = normalizeTotals(m);
                const goalType = (account as any).goalTypeOverride as string | null;
                const dayS = totals.spend > 0
                  ? quickDayStatus({ spend: totals.spend, conversions: totals.conversions, ctr: totals.ctr })
                  : null;
                const primary = getPrimaryResult(totals, goalType);
                const barWidth = maxSpend > 0 ? Math.round((totals.spend / maxSpend) * 100) : 0;
                const picture = (account as any).pictureUrl as string | null;

                return (
                  <button
                    key={account.id}
                    onClick={() => handleSelectAccount(account.id)}
                    className="w-full grid items-center px-3 py-2.5 text-left transition-colors hover:bg-muted/40"
                    style={{
                      gridTemplateColumns: "1fr 110px 90px 70px 100px 60px",
                      borderBottom: idx < sortedAccounts.length - 1 ? "0.5px solid var(--border)" : undefined,
                    }}
                  >
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

                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold text-foreground">
                        {totals.spend > 0 ? fmtCurrency(totals.spend) : "—"}
                      </span>
                      {dayS && (
                        <span
                          className="text-[9px] font-bold px-1 py-0.5 rounded flex-shrink-0"
                          style={{ background: dayS.bg, color: dayS.color, border: `0.5px solid ${dayS.border}` }}
                        >
                          {dayS.label}
                        </span>
                      )}
                    </div>

                    <div className="text-left">
                      {totals.spend > 0 ? (
                        <>
                          <p className="text-xs font-semibold text-foreground">{primary.value}</p>
                          <p className="text-[10px] text-muted-foreground">{primary.label}</p>
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </div>

                    <span className="text-xs text-foreground">
                      {totals.spend > 0 ? fmtPercent(totals.ctr) : "—"}
                    </span>

                    <span className="text-xs text-foreground">
                      {totals.spend > 0 && totals.cpa > 0 ? fmtCurrency(totals.cpa) : "—"}
                    </span>

                    <div className="flex items-center">
                      <div className="w-full h-2 rounded-full bg-muted overflow-hidden" style={{ maxWidth: 56 }}>
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${barWidth}%`,
                            background: dayS?.color ?? "var(--muted-foreground)",
                            opacity: barWidth > 0 ? 1 : 0,
                          }}
                        />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </MetaDashboardLayout>
  );
}
