import { MetaDashboardLayout } from "@/components/MetaDashboardLayout";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useState, useMemo } from "react";
import { useLocation, Link } from "wouter";
import { useActiveAccount } from "@/contexts/ActiveAccountContext";
import { toast } from "sonner";
import { getClientByMetaAccountId } from "@/config/clientConfig";
import { fmtCurrency, getDayStatus, type GoalType } from "@/lib/kpiConfig";
import {
  AlertTriangle,
  Bell,
  Brain,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  ExternalLink,
  ShieldCheck,
  TrendingUp,
  XCircle,
  Zap,
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

const priorityConfig: Record<string, { badge: string; color: string; bg: string }> = {
  HIGH:   { badge: "P1", color: "text-red-400 border-red-400/40",    bg: "bg-red-400/8 border border-red-400/20" },
  MEDIUM: { badge: "P2", color: "text-amber-400 border-amber-400/40", bg: "bg-amber-400/8 border border-amber-400/20" },
  LOW:    { badge: "P3", color: "text-blue-400 border-blue-400/40",   bg: "bg-blue-400/8 border border-blue-400/20" },
};

const estadoConfig: Record<string, { badge: string; cls: string; border: string }> = {
  green:  { badge: "A", cls: "text-emerald-400 border-emerald-400/30 bg-emerald-400/10", border: "#34d399" },
  yellow: { badge: "B", cls: "text-amber-400 border-amber-400/30 bg-amber-400/10",       border: "#fbbf24" },
  red:    { badge: "C", cls: "text-red-400 border-red-400/30 bg-red-400/10",             border: "#f87171" },
};

const severityConfig: Record<string, { border: string; icon: string }> = {
  CRITICAL: { border: "rgba(248,113,113,0.6)",  icon: "text-red-400" },
  WARNING:  { border: "rgba(251,191,36,0.6)",   icon: "text-amber-400" },
  INFO:     { border: "rgba(148,163,184,0.4)",  icon: "text-slate-400" },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function cleanTitle(title: string) {
  return title.replace(/\s*\[[^\]]*\]/g, "").replace(/\s+/g, " ").trim() || title;
}

function initials(name: string | null) {
  if (!name) return "?";
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
}

function formatDateShort(d: Date | string | null) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
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
  const diffD = Math.floor(diffH / 24);
  return `há ${diffD}d`;
}

function todayLabel(): string {
  return new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
}

// Universal day status using LEADS-style logic (any conversion = bom, CTR-based otherwise)
function quickDayStatus(totals: { spend: number; conversions: number; ctr: number }) {
  return getDayStatus("LEADS" as GoalType, {
    spend: totals.spend,
    conversions: totals.conversions,
    ctr: totals.ctr,
  });
}

// ─── Hub Suggestion Card ──────────────────────────────────────────────────────

function HubCard({
  s,
  onApply,
  onReject,
  onViewAccount,
}: {
  s: any;
  onApply: () => void;
  onReject: () => void;
  onViewAccount: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const pri = priorityConfig[s.priority] ?? priorityConfig.LOW;
  const cat = categoryConfig[s.category] ?? categoryConfig.GENERAL;

  const parsedActionItems: string[] = (() => {
    if (Array.isArray(s.actionItems)) return s.actionItems.map((a: any) => (typeof a === "string" ? a : JSON.stringify(a)));
    if (typeof s.actionItems === "string" && s.actionItems.trim().startsWith("[")) {
      try { return JSON.parse(s.actionItems); } catch { return []; }
    }
    return [];
  })();
  const expectedImpact = typeof s.expectedImpact === "string" ? s.expectedImpact.trim() : "";

  return (
    <div className={`rounded-lg border p-3 ${pri.bg} transition-all`}>
      <div className="flex items-start gap-2 flex-wrap">
        <Badge variant="outline" className={`text-xs font-bold flex-shrink-0 mt-0.5 ${pri.color}`}>
          {pri.badge}
        </Badge>
        <p className="text-xs font-medium text-foreground flex-1 min-w-0 leading-snug">
          {expanded ? s.title : cleanTitle(s.title)}
        </p>
        <Badge variant="outline" className={`text-xs flex-shrink-0 ${cat.color}`}>
          {cat.label}
        </Badge>
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
        >
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          {expanded ? "Menos" : "Ver ações"}
        </button>
      </div>

      {expanded && (
        <div className="mt-3 space-y-3">
          {s.description && (
            <p className="text-xs text-muted-foreground leading-relaxed">{s.description}</p>
          )}
          {expectedImpact && (
            <div className="p-2.5 rounded-lg bg-emerald-400/5 border border-emerald-400/20">
              <p className="text-xs font-medium text-emerald-400 mb-0.5">Impacto Esperado</p>
              <p className="text-xs text-muted-foreground">{expectedImpact}</p>
            </div>
          )}
          {parsedActionItems.length > 0 && (
            <div>
              <p className="text-xs font-medium text-foreground mb-1.5">Ações para Aplicar</p>
              <ul className="space-y-1">
                {parsedActionItems.map((action, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <span className="w-4 h-4 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center flex-shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    {action}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {!expectedImpact && parsedActionItems.length === 0 && (
            <p className="text-xs text-muted-foreground italic">Nenhuma ação detalhada disponível.</p>
          )}
          <div className="flex items-center gap-2 pt-2 border-t border-border/30 flex-wrap">
            <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs text-emerald-400 border-emerald-400/30 hover:bg-emerald-400/10" onClick={onApply}>
              <CheckCircle2 className="w-3.5 h-3.5" /> Aplicado
            </Button>
            <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs text-red-400 border-red-400/30 hover:bg-red-400/10" onClick={onReject}>
              <XCircle className="w-3.5 h-3.5" /> Não aplicar
            </Button>
            <Button size="sm" variant="ghost" className="h-7 gap-1.5 text-xs text-muted-foreground ml-auto" onClick={onViewAccount}>
              <ExternalLink className="w-3.5 h-3.5" /> Ver conta
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type PriorityFilter = "ALL" | "HIGH" | "MEDIUM" | "LOW";

export default function SuggestionsHub() {
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("ALL");
  const [analyzingAll, setAnalyzingAll] = useState(false);
  const [analyzeProgress, setAnalyzeProgress] = useState<{ done: number; total: number } | null>(null);

  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.suggestions.listAll.useQuery(undefined, { refetchOnWindowFocus: false });
  const { data: accounts } = trpc.accounts.list.useQuery(undefined, { refetchOnWindowFocus: false });
  const { data: todayMetrics } = trpc.accounts.todayMetrics.useQuery(undefined, { refetchOnWindowFocus: false });
  const { data: urgentAlerts } = trpc.alerts.listUrgent.useQuery(undefined, { refetchOnWindowFocus: false });
  const generate = trpc.suggestions.generate.useMutation();
  const updateStatus = trpc.suggestions.updateStatus.useMutation({
    onSuccess: () => { utils.suggestions.listAll.invalidate(); },
  });
  const { setActiveAccountId } = useActiveAccount();
  const [, navigate] = useLocation();

  // displayName lookup: internal accountId → display name from clientConfig
  const displayNameMap = useMemo(() => {
    const m = new Map<number, string>();
    for (const a of accounts ?? []) {
      m.set(a.id, getClientByMetaAccountId(a.accountId)?.name ?? a.accountName ?? a.accountId);
    }
    return m;
  }, [accounts]);

  const suggestions = data?.suggestions ?? [];
  const appliedToday = data?.appliedToday ?? 0;

  // ── Derived data ─────────────────────────────────────────────────────────

  // Today metrics map: accountId → metrics
  const metricsMap = new Map((todayMetrics ?? []).map((m) => [m.accountId, m]));

  // P1 count per account
  const p1ByAccount = suggestions
    .filter((s) => s.priority === "HIGH")
    .reduce<Record<number, number>>((acc, s) => { acc[s.accountId] = (acc[s.accountId] ?? 0) + 1; return acc; }, {});

  // Status bar
  const totalSpendToday = (todayMetrics ?? []).reduce((sum, m) => sum + Number(m.totalSpend ?? 0), 0);
  const lastSyncDate = (accounts ?? []).reduce<Date | null>((latest, a) => {
    if (!a.lastSyncAt) return latest;
    const d = new Date(a.lastSyncAt);
    return !latest || d > latest ? d : latest;
  }, null);

  // Carousel: accounts sorted by today's spend desc
  const carouselAccounts = [...(accounts ?? [])].sort((a, b) => {
    const sa = Number(metricsMap.get(a.id)?.totalSpend ?? 0);
    const sb = Number(metricsMap.get(b.id)?.totalSpend ?? 0);
    return sb - sa;
  });

  // Suggestion groups
  const filtered = priorityFilter === "ALL" ? suggestions : suggestions.filter((s) => s.priority === priorityFilter);

  type Group = {
    accountId: number;
    accountName: string | null;
    metaAccountId: string;
    aiStatusColor: string | null;
    items: typeof suggestions;
  };
  const groups = filtered.reduce<Record<string, Group>>((acc, s) => {
    const key = String(s.accountId);
    if (!acc[key]) acc[key] = { accountId: s.accountId, accountName: s.accountName, metaAccountId: s.metaAccountId, aiStatusColor: s.aiStatusColor, items: [] };
    acc[key].items.push(s);
    return acc;
  }, {});

  const p1Count = suggestions.filter((s) => s.priority === "HIGH").length;
  const p2Count = suggestions.filter((s) => s.priority === "MEDIUM").length;
  const criticalCount = Object.values(groups).filter((g) => g.aiStatusColor === "red").length;

  const lastAnalysisDate = suggestions.reduce<Date | null>((latest, s) => {
    if (!s.generatedAt) return latest;
    const d = new Date(s.generatedAt);
    return !latest || d > latest ? d : latest;
  }, null);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleAnalyzeAll = async () => {
    if (!accounts || accounts.length === 0) { toast.warning("Nenhuma conta conectada."); return; }
    setAnalyzingAll(true);
    let done = 0;
    for (const account of accounts) {
      setAnalyzeProgress({ done, total: accounts.length });
      try { await generate.mutateAsync({ accountId: account.id }); } catch { /* continue */ }
      done++;
      await new Promise((r) => setTimeout(r, 1000));
    }
    setAnalyzeProgress(null);
    setAnalyzingAll(false);
    utils.suggestions.listAll.invalidate();
    toast.success(`Análise concluída para ${done} conta(s).`);
  };

  const handleViewAccount = (s: (typeof suggestions)[0]) => {
    setActiveAccountId(s.accountId);
    navigate("/suggestions");
  };

  const handleSelectAccount = (accountId: number) => {
    setActiveAccountId(accountId);
    navigate("/dashboard");
  };

  const summaryCards = [
    { label: "P1 Pendentes",   value: p1Count,       color: "text-red-400",     bg: "bg-red-400/5 border-red-400/20",     icon: AlertTriangle },
    { label: "P2 Pendentes",   value: p2Count,       color: "text-amber-400",   bg: "bg-amber-400/5 border-amber-400/20", icon: TrendingUp },
    { label: "Contas Críticas",value: criticalCount, color: "text-orange-400",  bg: "bg-orange-400/5 border-orange-400/20",icon: Zap },
    { label: "Aplicadas Hoje", value: appliedToday,  color: "text-emerald-400", bg: "bg-emerald-400/5 border-emerald-400/20", icon: CheckCircle2 },
  ];

  const filterPills: { label: string; value: PriorityFilter; color: string }[] = [
    { label: "Todas", value: "ALL",    color: "" },
    { label: "P1",    value: "HIGH",   color: "text-red-400" },
    { label: "P2",    value: "MEDIUM", color: "text-amber-400" },
    { label: "P3",    value: "LOW",    color: "text-blue-400" },
  ];

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <MetaDashboardLayout>
      <div className="max-w-4xl mx-auto">

        {/* ══ HERO ══════════════════════════════════════════════════════════ */}
        <div className="px-6 pt-6 pb-0 space-y-4">

          {/* 1 — Status bar */}
          <div
            className="flex items-center gap-3 flex-wrap px-3 py-2 rounded-lg text-xs"
            style={{ background: "rgba(255,255,255,0.04)", border: "0.5px solid rgba(255,255,255,0.08)" }}
          >
            <span className="flex items-center gap-1.5">
              <Circle className="w-2 h-2 fill-emerald-400 text-emerald-400" />
              <span className="text-muted-foreground capitalize">{todayLabel()}</span>
            </span>
            <span className="text-border/50">·</span>
            <span className="text-muted-foreground">
              <span className="text-foreground/70 font-medium">{accounts?.length ?? 0}</span> contas ativas
            </span>
            <span className="text-border/50">·</span>
            <span className="text-muted-foreground">
              Investido hoje:{" "}
              <span className="text-foreground/70 font-medium">{fmtCurrency(totalSpendToday)}</span>
            </span>
            {lastSyncDate && (
              <>
                <span className="text-border/50">·</span>
                <span className="text-muted-foreground">Última sync {relativeTime(lastSyncDate)}</span>
              </>
            )}
          </div>

          {/* 2 — Client carousel */}
          {carouselAccounts.length > 0 && (
            <div
              className="flex gap-3 pb-2"
              style={{ overflowX: "auto", scrollbarWidth: "none" }}
            >
              {carouselAccounts.map((account) => {
                const m = metricsMap.get(account.id);
                const spend = Number(m?.totalSpend ?? 0);
                const p1 = p1ByAccount[account.id] ?? 0;
                const estado = estadoConfig[account.aiStatusColor ?? ""] ?? null;
                const dayS = m
                  ? quickDayStatus({ spend, conversions: Number(m.totalConversions ?? 0), ctr: Number(m.avgCtr ?? 0) })
                  : null;

                return (
                  <button
                    key={account.id}
                    onClick={() => handleSelectAccount(account.id)}
                    className="flex-shrink-0 rounded-xl text-left transition-all hover:brightness-110 relative overflow-hidden"
                    style={{
                      width: 160,
                      background: "rgba(255,255,255,0.04)",
                      border: "0.5px solid rgba(255,255,255,0.10)",
                      borderLeft: `3px solid ${estado?.border ?? "rgba(255,255,255,0.15)"}`,
                    }}
                  >
                    {/* P1 badge */}
                    {p1 > 0 && (
                      <span
                        className="absolute top-2 right-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                        style={{ background: "rgba(239,68,68,0.9)", color: "#fff" }}
                      >
                        {p1} P1
                      </span>
                    )}

                    <div className="p-3 space-y-2.5">
                      {/* Avatar + name */}
                      <div className="flex items-center gap-2">
                        <div
                          className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0"
                          style={{ background: "rgba(212,83,126,0.2)", color: "#D4537E" }}
                        >
                          {getClientByMetaAccountId(account.accountId)?.shortName ?? initials(account.accountName)}
                        </div>
                        <p className="text-xs font-semibold text-foreground/80 truncate leading-snug" style={{ maxWidth: 90 }}>
                          {displayNameMap.get(account.id) ?? account.accountName ?? account.accountId}
                        </p>
                      </div>

                      {/* Estado badge */}
                      {estado ? (
                        <Badge variant="outline" className={`text-[10px] font-bold ${estado.cls}`}>
                          Estado {estado.badge}
                        </Badge>
                      ) : (
                        <span className="text-[10px] text-muted-foreground/40">Sem análise</span>
                      )}

                      {/* Investido hoje */}
                      <div style={{ borderTop: "0.5px solid rgba(255,255,255,0.08)" }} className="pt-2">
                        <p className="text-[10px] text-muted-foreground mb-0.5">Investido hoje</p>
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-bold text-foreground/90">{fmtCurrency(spend)}</span>
                          {dayS && (
                            <span
                              className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                              style={{ background: dayS.bg, color: dayS.color, border: `0.5px solid ${dayS.border}` }}
                            >
                              {dayS.label}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Divider */}
        <div style={{ borderTop: "0.5px solid rgba(255,255,255,0.07)", margin: "16px 0 0" }} />

        {/* ══ MAIN CONTENT ═════════════════════════════════════════════════ */}
        <div className="px-6 py-6 space-y-6">

          {/* Header */}
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-xl font-bold text-foreground">Central de Sugestões</h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                {lastAnalysisDate
                  ? `Última análise: ${formatDateShort(lastAnalysisDate)}`
                  : "Nenhuma análise ainda — clique em Analisar todas para começar."}
              </p>
            </div>
            <Button size="sm" onClick={handleAnalyzeAll} disabled={analyzingAll} className="gap-2">
              <Brain className={`w-4 h-4 ${analyzingAll ? "animate-pulse" : ""}`} />
              {analyzeProgress ? `Analisando ${analyzeProgress.done + 1}/${analyzeProgress.total}…` : "Analisar todas"}
            </Button>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {summaryCards.map((c) => {
              const Icon = c.icon;
              return (
                <div key={c.label} className={`rounded-xl border p-3 ${c.bg}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className={`w-3.5 h-3.5 ${c.color}`} />
                    <span className="text-xs text-muted-foreground">{c.label}</span>
                  </div>
                  <p className={`text-2xl font-bold ${c.color}`}>{isLoading ? "—" : c.value}</p>
                </div>
              );
            })}
          </div>

          {/* ── Urgent alerts ────────────────────────────────────────────── */}
          {urgentAlerts && urgentAlerts.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                  Alertas urgentes
                </p>
                <Link href="/alerts">
                  <span className="text-xs text-primary hover:underline cursor-pointer">Ver todos</span>
                </Link>
              </div>
              <div className="space-y-2">
                {urgentAlerts.map((alert) => {
                  const sev = severityConfig[alert.severity] ?? severityConfig.INFO;
                  return (
                    <div
                      key={alert.id}
                      className="flex items-start gap-3 px-3 py-2.5 rounded-lg"
                      style={{
                        background: "rgba(255,255,255,0.03)",
                        borderLeft: `3px solid ${sev.border}`,
                        border: "0.5px solid rgba(255,255,255,0.07)",
                        borderLeftWidth: 3,
                        borderLeftColor: sev.border,
                      }}
                    >
                      <Bell className={`w-3.5 h-3.5 flex-shrink-0 mt-0.5 ${sev.icon}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground/80 truncate">{alert.title}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {displayNameMap.get(alert.accountId) ?? alert.accountName ?? "—"} · {relativeTime(alert.createdAt)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Priority filter pills */}
          <div className="flex gap-2 flex-wrap">
            {filterPills.map((p) => (
              <button
                key={p.value}
                onClick={() => setPriorityFilter(p.value)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
                  priorityFilter === p.value
                    ? "bg-primary text-primary-foreground border-primary"
                    : `border-border/50 text-muted-foreground hover:border-border hover:text-foreground ${p.color}`
                }`}
              >
                {p.label}
              </button>
            ))}
            <span className="ml-auto text-xs text-muted-foreground self-center">
              {filtered.length} sugestão(ões)
            </span>
          </div>

          {/* Account groups */}
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2].map((i) => (
                <div key={i} className="rounded-xl border border-border/50 p-4 animate-pulse space-y-3">
                  <div className="h-4 w-40 rounded bg-muted" />
                  <div className="h-10 w-full rounded bg-muted" />
                </div>
              ))}
            </div>
          ) : Object.keys(groups).length === 0 ? (
            <div className="rounded-xl border border-border/50 p-8 text-center">
              <ShieldCheck className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
              <p className="text-sm font-medium text-foreground">Nenhuma sugestão pendente</p>
              <p className="text-xs text-muted-foreground mt-1">
                {priorityFilter !== "ALL"
                  ? "Tente remover o filtro de prioridade."
                  : `Clique em "Analisar todas" para gerar novas sugestões.`}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {Object.values(groups).map((group) => {
                const estado = estadoConfig[group.aiStatusColor ?? ""] ?? null;
                return (
                  <div key={group.accountId} className="rounded-xl border border-border/50 overflow-hidden">
                    <div className="flex items-center gap-3 px-4 py-3 bg-muted/30 border-b border-border/50">
                      <div className="w-8 h-8 rounded-full bg-primary/20 text-primary text-xs font-bold flex items-center justify-center flex-shrink-0">
                        {getClientByMetaAccountId(group.metaAccountId)?.shortName ?? initials(group.accountName)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">
                          {displayNameMap.get(group.accountId) ?? getClientByMetaAccountId(group.metaAccountId)?.name ?? group.accountName ?? group.metaAccountId}
                        </p>
                      </div>
                      {estado && (
                        <Badge variant="outline" className={`text-xs font-bold ${estado.cls}`}>
                          Estado {estado.badge}
                        </Badge>
                      )}
                      <Badge variant="secondary" className="text-xs">{group.items.length}</Badge>
                    </div>
                    <div className="p-3 space-y-2">
                      {group.items.map((s) => (
                        <HubCard
                          key={s.id}
                          s={s}
                          onApply={() => updateStatus.mutate({ suggestionId: s.id, status: "applied" })}
                          onReject={() => updateStatus.mutate({ suggestionId: s.id, status: "rejected" })}
                          onViewAccount={() => handleViewAccount(s)}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </MetaDashboardLayout>
  );
}
