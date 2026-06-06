import { MetaDashboardLayout } from "@/components/MetaDashboardLayout";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useState } from "react";
import { useLocation } from "wouter";
import { useActiveAccount } from "@/contexts/ActiveAccountContext";
import { toast } from "sonner";
import {
  AlertTriangle,
  Brain,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
  XCircle,
  Zap,
  DollarSign,
  Target,
  Users,
  Clock,
} from "lucide-react";

// ─── Config (mirrors Suggestions.tsx) ─────────────────────────────────────────

const categoryConfig: Record<string, { label: string; color: string }> = {
  BUDGET:    { label: "Orçamento",  color: "text-yellow-400" },
  TARGETING: { label: "Público",    color: "text-blue-400" },
  CREATIVE:  { label: "Criativo",   color: "text-purple-400" },
  BIDDING:   { label: "Lance",      color: "text-orange-400" },
  SCHEDULE:  { label: "Programação",color: "text-teal-400" },
  AUDIENCE:  { label: "Audiência",  color: "text-cyan-400" },
  GENERAL:   { label: "Geral",      color: "text-muted-foreground" },
};

const priorityConfig: Record<string, { badge: string; color: string; bg: string }> = {
  HIGH:   { badge: "P1", color: "text-red-400 border-red-400/40",    bg: "bg-red-400/8 border border-red-400/20" },
  MEDIUM: { badge: "P2", color: "text-amber-400 border-amber-400/40", bg: "bg-amber-400/8 border border-amber-400/20" },
  LOW:    { badge: "P3", color: "text-blue-400 border-blue-400/40",   bg: "bg-blue-400/8 border border-blue-400/20" },
};

const statusColor: Record<string, { badge: string; cls: string }> = {
  green:  { badge: "A", cls: "text-emerald-400 border-emerald-400/30 bg-emerald-400/10" },
  yellow: { badge: "B", cls: "text-amber-400 border-amber-400/30 bg-amber-400/10" },
  red:    { badge: "C", cls: "text-red-400 border-red-400/30 bg-red-400/10" },
};

// Strip [bracket content] from titles for collapsed view
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
      {/* Collapsed row */}
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

      {/* Expanded content */}
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
          {/* Action buttons */}
          <div className="flex items-center gap-2 pt-2 border-t border-border/30 flex-wrap">
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 text-xs text-emerald-400 border-emerald-400/30 hover:bg-emerald-400/10"
              onClick={onApply}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Aplicado
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 text-xs text-red-400 border-red-400/30 hover:bg-red-400/10"
              onClick={onReject}
            >
              <XCircle className="w-3.5 h-3.5" />
              Não aplicar
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1.5 text-xs text-muted-foreground ml-auto"
              onClick={onViewAccount}
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Ver conta
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
  const { data, isLoading, refetch } = trpc.suggestions.listAll.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const { data: accounts } = trpc.accounts.list.useQuery(undefined, { refetchOnWindowFocus: false });
  const generate = trpc.suggestions.generate.useMutation();
  const updateStatus = trpc.suggestions.updateStatus.useMutation({
    onSuccess: () => { utils.suggestions.listAll.invalidate(); },
  });
  const { setActiveAccountId } = useActiveAccount();
  const [, navigate] = useLocation();

  const suggestions = data?.suggestions ?? [];
  const appliedToday = data?.appliedToday ?? 0;

  // Filter by priority
  const filtered = priorityFilter === "ALL"
    ? suggestions
    : suggestions.filter((s) => s.priority === priorityFilter);

  // Group by account
  type Group = {
    accountId: number;
    accountName: string | null;
    metaAccountId: string;
    aiStatusColor: string | null;
    items: typeof suggestions;
  };
  const groups = filtered.reduce<Record<string, Group>>((acc, s) => {
    const key = String(s.accountId);
    if (!acc[key]) {
      acc[key] = {
        accountId: s.accountId,
        accountName: s.accountName,
        metaAccountId: s.metaAccountId,
        aiStatusColor: s.aiStatusColor,
        items: [],
      };
    }
    acc[key].items.push(s);
    return acc;
  }, {});

  // Summary stats
  const p1Count = suggestions.filter((s) => s.priority === "HIGH").length;
  const p2Count = suggestions.filter((s) => s.priority === "MEDIUM").length;
  const criticalCount = Object.values(groups).filter((g) => g.aiStatusColor === "red").length;

  const lastAnalysisDate = suggestions.reduce<Date | null>((latest, s) => {
    if (!s.generatedAt) return latest;
    const d = new Date(s.generatedAt);
    return !latest || d > latest ? d : latest;
  }, null);

  const handleAnalyzeAll = async () => {
    if (!accounts || accounts.length === 0) {
      toast.warning("Nenhuma conta conectada.");
      return;
    }
    setAnalyzingAll(true);
    let done = 0;
    for (const account of accounts) {
      setAnalyzeProgress({ done, total: accounts.length });
      try {
        await generate.mutateAsync({ accountId: account.id });
      } catch {
        // continue to next account
      }
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

  const summaryCards = [
    {
      label: "P1 Pendentes",
      value: p1Count,
      color: "text-red-400",
      bg: "bg-red-400/5 border-red-400/20",
      icon: AlertTriangle,
    },
    {
      label: "P2 Pendentes",
      value: p2Count,
      color: "text-amber-400",
      bg: "bg-amber-400/5 border-amber-400/20",
      icon: TrendingUp,
    },
    {
      label: "Contas Críticas",
      value: criticalCount,
      color: "text-orange-400",
      bg: "bg-orange-400/5 border-orange-400/20",
      icon: Zap,
    },
    {
      label: "Aplicadas Hoje",
      value: appliedToday,
      color: "text-emerald-400",
      bg: "bg-emerald-400/5 border-emerald-400/20",
      icon: CheckCircle2,
    },
  ];

  const filterPills: { label: string; value: PriorityFilter; color: string }[] = [
    { label: "Todas", value: "ALL", color: "" },
    { label: "P1", value: "HIGH", color: "text-red-400" },
    { label: "P2", value: "MEDIUM", color: "text-amber-400" },
    { label: "P3", value: "LOW", color: "text-blue-400" },
  ];

  return (
    <MetaDashboardLayout>
      <div className="space-y-6 p-6 max-w-4xl mx-auto">
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
          <Button
            size="sm"
            onClick={handleAnalyzeAll}
            disabled={analyzingAll}
            className="gap-2"
          >
            <Brain className={`w-4 h-4 ${analyzingAll ? "animate-pulse" : ""}`} />
            {analyzeProgress
              ? `Analisando ${analyzeProgress.done + 1}/${analyzeProgress.total}…`
              : "Analisar todas"}
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
              const estado = statusColor[group.aiStatusColor ?? ""] ?? null;
              return (
                <div key={group.accountId} className="rounded-xl border border-border/50 overflow-hidden">
                  {/* Group header */}
                  <div className="flex items-center gap-3 px-4 py-3 bg-muted/30 border-b border-border/50">
                    <div className="w-8 h-8 rounded-full bg-primary/20 text-primary text-xs font-bold flex items-center justify-center flex-shrink-0">
                      {initials(group.accountName)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">
                        {group.accountName ?? group.metaAccountId}
                      </p>
                    </div>
                    {estado && (
                      <Badge variant="outline" className={`text-xs font-bold ${estado.cls}`}>
                        Estado {estado.badge}
                      </Badge>
                    )}
                    <Badge variant="secondary" className="text-xs">
                      {group.items.length}
                    </Badge>
                  </div>

                  {/* Suggestions */}
                  <div className="p-3 space-y-2">
                    {group.items.map((s) => (
                      <HubCard
                        key={s.id}
                        s={s}
                        onApply={() =>
                          updateStatus.mutate({ suggestionId: s.id, status: "applied" })
                        }
                        onReject={() =>
                          updateStatus.mutate({ suggestionId: s.id, status: "rejected" })
                        }
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
    </MetaDashboardLayout>
  );
}
