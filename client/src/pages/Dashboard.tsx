import { MetaDashboardLayout } from "@/components/MetaDashboardLayout";
import { useSelectedAccount } from "@/hooks/useSelectedAccount";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  AlertTriangle,
  CreditCard,
  Link2,
  Loader2,
  TrendingDown,
  TrendingUp,
  Wallet,
  Zap,
  ExternalLink,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { useLocation } from "wouter";
import { Input } from "@/components/ui/input";
import { ActiveOptimizations } from "@/components/ActiveOptimizations";
import { AccountHeader } from "@/components/AccountHeader";
import {
  type GoalType, type KpiDef,
  KPI_CONFIGS, GOAL_LABELS, mapGoalToType,
  fmtCurrency, fmtNumber, fmtPercent, fmtMultiplier,
} from "@/lib/kpiConfig";


// ─── MetricCard component ─────────────────────────────────────────────────────

function MetricCard({
  title, value, subtitle, icon: Icon, trendPercent, trendPrevValue, color = "blue",
}: {
  title: string; value: string; subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  trendPercent?: string; trendPrevValue?: string;
  color?: "blue" | "green" | "red" | "purple" | "orange";
}) {
  const colorMap = {
    blue: "text-primary bg-gradient-to-br from-primary/20 to-primary/10",
    green: "text-emerald-400 bg-gradient-to-br from-emerald-400/20 to-emerald-400/10",
    red: "text-red-400 bg-gradient-to-br from-red-400/20 to-red-400/10",
    purple: "text-purple-400 bg-gradient-to-br from-purple-400/20 to-purple-400/10",
    orange: "text-orange-400 bg-gradient-to-br from-orange-400/20 to-orange-400/10",
  };
  const displayTitle = subtitle ? `${title} (${subtitle})` : title;
  return (
    <Card className="border-border bg-card hover:border-primary/40 hover:shadow-md transition-all duration-200 h-full">
      <CardContent className="p-3 flex flex-col h-full min-h-[95px]">
        <div className="flex items-center justify-between mb-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shadow-sm ${colorMap[color]}`}>
            <Icon className="w-4 h-4 font-bold" />
          </div>
          {trendPercent && (
            <div className="relative group">
              <span className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-md cursor-default ${trendPercent.startsWith("-") ? "text-red-500 bg-red-50" : "text-emerald-600 bg-emerald-50"}`}>
                {trendPercent.startsWith("-") ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
                {trendPercent}
              </span>
              {trendPrevValue && (
                <div className="absolute right-0 top-full mt-1 z-50 hidden group-hover:block bg-popover border border-border rounded-lg px-3 py-2 shadow-xl whitespace-nowrap">
                  <p className="text-xs text-muted-foreground">Período anterior</p>
                  <p className="text-sm font-bold text-foreground">{trendPrevValue}</p>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="mt-auto">
          <p className="text-2xl font-bold text-foreground mb-0.5">{value}</p>
          <p className="text-xs font-semibold text-foreground/80">{displayTitle}</p>
        </div>
      </CardContent>
    </Card>
  );
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover border border-border rounded-lg p-3 shadow-xl text-xs">
      <p className="text-muted-foreground mb-2">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }} className="font-medium">
          {p.name}: {typeof p.value === "number" ? (p.name === "Receita" || p.name === "Gasto" ? fmtCurrency(p.value) : p.value.toFixed(2)) : p.value}
        </p>
      ))}
    </div>
  );
};

// ─── Period presets ──────────────────────────────────────────────────────────

type PeriodPreset = "today" | "yesterday" | "today_yesterday" | "7d" | "14d" | "30d" | "custom";

interface PeriodState {
  preset: PeriodPreset;
  customStart: string; // YYYY-MM-DD
  customEnd: string;   // YYYY-MM-DD
}

const PERIOD_LABELS: Record<PeriodPreset, string> = {
  today: "Hoje",
  yesterday: "Ontem",
  today_yesterday: "Hoje e Ontem",
  "7d": "Últimos 7 dias",
  "14d": "Últimos 14 dias",
  "30d": "Últimos 30 dias",
  custom: "Personalizado",
};

function toIsoLocal(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getPresetRange(preset: PeriodPreset): { startDate: string; endDate: string } | { days: number } {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const daysAgo = (n: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() - n);
    return toIsoLocal(d);
  };

  switch (preset) {
    case "today":
      return { startDate: toIsoLocal(today), endDate: toIsoLocal(today) };
    case "yesterday":
      return { startDate: toIsoLocal(yesterday), endDate: toIsoLocal(yesterday) };
    case "today_yesterday":
      return { startDate: toIsoLocal(yesterday), endDate: toIsoLocal(today) };
    case "7d":
      return { startDate: daysAgo(6), endDate: toIsoLocal(today) };
    case "14d":
      return { startDate: daysAgo(13), endDate: toIsoLocal(today) };
    case "30d":
      return { startDate: daysAgo(29), endDate: toIsoLocal(today) };
    default:
      return { startDate: daysAgo(6), endDate: toIsoLocal(today) };
  }
}

function applyDateMaskDash(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
}

function CustomDateInput({
  label, value, onChange, disabled,
}: { label: string; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const [local, setLocal] = useState(value);
  useEffect(() => { setLocal(value); }, [value]);
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Input
        value={local}
        onChange={(e) => {
          const v = applyDateMaskDash(e.target.value);
          setLocal(v);
          if (v.length === 10) onChange(v);
        }}
        onBlur={() => onChange(local)}
        placeholder="aaaa-mm-dd"
        disabled={disabled}
        maxLength={10}
        className="h-7 text-xs font-mono w-32"
        autoComplete="off"
      />
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function Dashboard() {
  const [period, setPeriod] = useState<PeriodState>({
    preset: "7d",
    customStart: "",
    customEnd: "",
  });
  const [creativeTab, setCreativeTab] = useState<"creatives" | "audiences">("creatives");
  const [cardsExpanded, setCardsExpanded] = useState(false);
  const [, navigate] = useLocation();
  const { selectedAccountId, accounts } = useSelectedAccount();

  // Reset period to default when account changes
  const prevAccountRef = useMemo(() => ({ current: selectedAccountId }), []);
  useEffect(() => {
    if (prevAccountRef.current !== selectedAccountId) {
      prevAccountRef.current = selectedAccountId;
      setPeriod({ preset: "7d", customStart: "", customEnd: "" });
    }
  }, [selectedAccountId]);

  // Build query params from period state
  const queryParams = useMemo(() => {
    if (period.preset === "custom") {
      if (period.customStart && period.customEnd) {
        return { startDate: period.customStart, endDate: period.customEnd };
      }
      // Fallback: explicit dates so server never defaults endDate to yesterday
      const d = new Date();
      const s = new Date(d); s.setDate(s.getDate() - 6);
      return { startDate: toIsoLocal(s), endDate: toIsoLocal(d) };
    }
    return getPresetRange(period.preset);
  }, [period]);

  const { data, isLoading, isError, error, refetch } = trpc.dashboard.overview.useQuery(
    { accountId: selectedAccountId!, ...queryParams },
    { enabled: !!selectedAccountId, refetchInterval: 60000 }
  );

  const { data: topAds, isLoading: adsLoading } = trpc.campaigns.adTopByCtr.useQuery(
    { accountId: selectedAccountId!, ...queryParams },
    { enabled: !!selectedAccountId && creativeTab === "creatives", staleTime: 120_000 }
  );
  const { data: topAdsets, isLoading: adsetsLoading } = trpc.campaigns.adsetTopByCtr.useQuery(
    { accountId: selectedAccountId!, ...queryParams },
    { enabled: !!selectedAccountId && creativeTab === "audiences", staleTime: 120_000 }
  );

  // Use goalProfile from backend (based on optimization_goal, NOT campaign.objective)
  // If account has a manual goalTypeOverride, use that instead
  const activeAccount = useMemo(
    () => accounts?.find((a: any) => a.id === selectedAccountId),
    [accounts, selectedAccountId]
  );
  const goalType = useMemo<GoalType>(() => {
    const override = (activeAccount as any)?.goalTypeOverride;
    if (override) return override as GoalType;
    return mapGoalToType(data?.dominantGoal);
  }, [data?.dominantGoal, activeAccount]);

  // Use label/emoji from backend goalProfile when available, fallback to local map
  const goalLabelFromBackend = data?.goalProfile?.label;
  const goalEmojiFromBackend = data?.goalProfile?.emoji;
  const kpiDefs = KPI_CONFIGS[goalType];
  const objInfo = {
    label: goalLabelFromBackend ?? GOAL_LABELS[goalType]?.label ?? "Campanhas",
    emoji: goalEmojiFromBackend ?? GOAL_LABELS[goalType]?.emoji ?? "📊",
  };

  // Build extended totals including cpc, cpm, frequency, reach
  const totals = useMemo(() => {
    if (!data?.totals) return null;
    const t = data.totals;
    const cpc = t.clicks > 0 ? t.spend / t.clicks : 0;
    const cpm = t.impressions > 0 ? (t.spend / t.impressions) * 1000 : 0;
    // frequency: average from timeSeries
    const freqSum = data.timeSeries?.reduce((s: number, m: any) => s + parseFloat(String(m.avgFrequency ?? 0)), 0) ?? 0;
    const frequency = data.timeSeries?.length ? freqSum / data.timeSeries.length : 0;
    // reach: sum from backend totals (already aggregated)
    const reach = Number(t.reach ?? 0);
    return { ...t, cpc, cpm, frequency, reach };
  }, [data]);

  const prevTotals = useMemo(() => {
    const p = (data as any)?.previousTotals;
    if (!p) return null;
    const cpc = p.clicks > 0 ? p.spend / p.clicks : 0;
    const cpm = p.impressions > 0 ? (p.spend / p.impressions) * 1000 : 0;
    const ctr = p.impressions > 0 ? (p.clicks / p.impressions) * 100 : 0;
    const cpa = p.conversions > 0 ? p.spend / p.conversions : 0;
    const roas = p.spend > 0 ? p.conversionValue / p.spend : 0;
    return { ...p, cpc, cpm, ctr, cpa, roas };
  }, [data]);

  // Helper to calculate percent change between current and previous period
  const pctChange = (curr: number, prev: number): string | undefined => {
    if (!prev) return undefined;
    const pct = ((curr - prev) / prev) * 100;
    return (pct >= 0 ? "+" : "") + pct.toFixed(1) + "%";
  };

  // Chart: use primary metric based on goalType
  // ROAS only for SALES/VALUE; for everything else use Resultados (conversions)
  const chartMetricKey = ["SALES", "VALUE"].includes(goalType) ? "ROAS" : "Resultado";
  const chartMetricLabel = ["SALES", "VALUE"].includes(goalType)
    ? "ROAS"
    : (data?.goalProfile?.resultLabel ?? objInfo.label);

  const chartData = useMemo(() => {
    if (!data?.timeSeries) return [];
    return data.timeSeries.map((d) => ({
      date: new Date(d.date).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
      Gasto: parseFloat(String(d.totalSpend ?? 0)),
      Resultado: parseFloat(String(d.totalConversions ?? 0)),
      ROAS: parseFloat(String(d.avgRoas ?? 0)),
      Receita: parseFloat(String(d.totalConversionValue ?? 0)),
    }));
  }, [data]);

  // Top/Underperformers:
  // 1. Filter ONLY campaigns with status ACTIVE
  // 2. Sort by totalConversions (results) — the actual performance metric, not ROAS
  //    Exception: SALES/VALUE accounts also consider ROAS as secondary signal
  // 3. If ≤2 active campaigns: all go to Top Performers, none to Underperformers
  //    If >2 active campaigns: top N-1 in Top, worst 1 in Underperformers
  const activeCampaignsWithData = useMemo(() => {
    if (!data?.campaigns) return [];
    return [...data.campaigns].filter(
      (c) => String((c as any).campaignStatus ?? "").toUpperCase() === "ACTIVE"
    );
  }, [data]);

  // Label for the result metric in campaigns list
  const resultLabel = data?.goalProfile?.resultLabel ?? "Resultados";

  if (!accounts || accounts.length === 0) {
    return (
      <MetaDashboardLayout title="Dashboard">
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
            <Link2 className="w-7 h-7 text-primary" />
          </div>
          <h2 className="text-xl font-semibold text-foreground mb-2">Nenhuma conta conectada</h2>
          <p className="text-muted-foreground mb-6 max-w-sm">
            Conecte sua conta Meta Ads para começar a visualizar dados e análises.
          </p>
          <Button onClick={() => navigate("/connect")} className="gap-2">
            <Zap className="w-4 h-4" />
            Conectar conta
          </Button>
        </div>
      </MetaDashboardLayout>
    );
  }

  return (
    <MetaDashboardLayout title="Dashboard">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-foreground">Visão Geral</h1>
              {goalType !== "DEFAULT" && (
                <Badge variant="outline" className="text-xs border-primary/30 text-primary">
                  {objInfo.emoji} {objInfo.label}
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">Performance das suas campanhas</p>
            {(() => {
              const acct = accounts?.find((a: any) => a.id === selectedAccountId);
              return acct?.accountName ? (
                <p className="text-xs text-primary font-medium mt-0.5">Conta: {acct.accountName}</p>
              ) : null;
            })()}
          </div>
<div className="flex flex-col items-end gap-2">
            {/* Quick period buttons */}
            <div className="flex items-center gap-1 flex-wrap justify-end">
              {(["today", "yesterday", "today_yesterday", "7d", "14d", "30d", "custom"] as PeriodPreset[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod((prev) => ({ ...prev, preset: p }))}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${
                    period.preset === p
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  {PERIOD_LABELS[p]}
                </button>
              ))}
            </div>
            {/* Custom date inputs */}
            {period.preset === "custom" && (
              <div className="flex items-end gap-2">
                <CustomDateInput
                  label="De"
                  value={period.customStart}
                  onChange={(v) => setPeriod((prev) => ({ ...prev, customStart: v }))}
                />
                <CustomDateInput
                  label="Até"
                  value={period.customEnd}
                  onChange={(v) => setPeriod((prev) => ({ ...prev, customEnd: v }))}
                />
              </div>
            )}
          </div>
        </div>

        {/* Account summary header — identity, integrations, daily snapshot, AI status */}
        <AccountHeader goalLabel={objInfo.label} goalEmoji={objInfo.emoji} goalType={goalType} />

        {/* Em andamento — sugestões aplicadas em monitoramento */}
        <ActiveOptimizations />

        {/* Error state */}
        {isError && (
          <Card className="border-red-500/30 bg-red-500/10">
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <AlertTriangle className="w-6 h-6 text-red-400 mt-0.5 shrink-0" />
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-red-400 mb-1">Erro ao carregar dados</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    {error?.message ?? "Ocorreu um erro ao buscar os dados do dashboard."}
                  </p>
                  <div className="flex gap-3">
                    <Button size="sm" variant="outline" onClick={() => refetch()} className="border-red-500/30 text-red-400 hover:bg-red-500/10">
                      Tentar Novamente
                    </Button>
                    {error?.message?.toLowerCase().includes("token") && (
                      <Button size="sm" variant="outline" onClick={() => navigate("/connect")} className="border-amber-500/30 text-amber-400 hover:bg-amber-500/10">
                        Reconectar Token
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ─── Campanhas + Top Criativos/Públicos ───────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Card esquerdo — lista unificada de campanhas com badges relativos */}
          {(() => {
            const sorted = [...activeCampaignsWithData]
              .filter((c) => Number(c.totalSpend ?? 0) > 0)
              .sort((a, b) => Number(b.totalConversions ?? 0) - Number(a.totalConversions ?? 0));
            const N = sorted.length;
            const tier = (i: number) => {
              if (N <= 1) return { emoji: "🟢", label: "Top", color: "text-emerald-400" };
              if (i < Math.ceil(N / 3)) return { emoji: "🟢", label: "Top",   color: "text-emerald-400" };
              if (i < Math.ceil(2 * N / 3)) return { emoji: "🟡", label: "Média", color: "text-amber-400" };
              return { emoji: "🔴", label: "Under", color: "text-red-400" };
            };
            return (
              <Card>
                <div className="flex items-center justify-between px-6 pt-4 pb-3 cursor-pointer select-none" onClick={() => setCardsExpanded(v => !v)}>
                  <div className="text-sm font-semibold flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-primary" />
                    Campanhas Ativas
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs text-muted-foreground">{sorted.length} ativas</Badge>
                    {cardsExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                  </div>
                </div>
                <CardContent className="space-y-1.5">
                  {isLoading ? (
                    <div className="space-y-2">{[...Array(cardsExpanded ? 4 : 1)].map((_, i) => <div key={i} className="h-11 bg-muted rounded-lg animate-pulse" />)}</div>
                  ) : sorted.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">Nenhuma campanha ativa com dados no período.</p>
                  ) : (
                    (cardsExpanded ? sorted : sorted.slice(0, 1)).map((c, i) => {
                      const t = tier(i);
                      const roas = Number((c as any).avgRoas ?? 0);
                      return (
                        <div key={c.campaignId} className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-accent/30 transition-colors">
                          <span className="text-base flex-shrink-0">{t.emoji}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-foreground truncate">{c.campaignName}</p>
                            <p className="text-xs text-muted-foreground">
                              R$ {Number(c.totalSpend ?? 0).toFixed(0)} gasto
                              {roas > 0 && ` · ${roas.toFixed(2)}x ROAS`}
                            </p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className={`text-xs font-bold ${t.color}`}>{fmtNumber(Number(c.totalConversions ?? 0))}</p>
                            <p className="text-xs text-muted-foreground">{resultLabel}</p>
                          </div>
                        </div>
                      );
                    })
                  )}
                </CardContent>
              </Card>
            );
          })()}

          {/* Card direito — Destaques do Período */}
          <Card>
            <div className="flex items-center justify-between px-6 pt-4 pb-2 cursor-pointer select-none" onClick={() => setCardsExpanded(v => !v)}>
              <span className="text-sm font-semibold text-foreground">Destaques do Período</span>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 bg-muted/40 rounded-lg p-0.5" onClick={e => e.stopPropagation()}>
                  {(["creatives", "audiences"] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setCreativeTab(tab)}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                        creativeTab === tab
                          ? "bg-[#E85BA8] text-white shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {tab === "creatives" ? "Criativos" : "Públicos"}
                    </button>
                  ))}
                </div>
                {cardsExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
              </div>
            </div>
            <CardContent className="space-y-1.5">
              {creativeTab === "creatives" ? (
                adsLoading ? (
                  <div className="space-y-2">{[...Array(cardsExpanded ? 4 : 1)].map((_, i) => <div key={i} className="h-11 bg-muted rounded-lg animate-pulse" />)}</div>
                ) : !topAds?.length ? (
                  <p className="text-sm text-muted-foreground text-center py-4">Sem dados de anúncios no período.</p>
                ) : (
                  (cardsExpanded ? topAds : topAds.slice(0, 1)).map((ad, i) => (
                    <div key={ad.adId} className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-accent/30 transition-colors">
                      <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-bold flex-shrink-0">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-xs font-medium text-foreground truncate flex-1">{ad.adName}</p>
                          <a href={ad.managerUrl} target="_blank" rel="noopener noreferrer" title="Abrir no Gerenciador" className="flex-shrink-0">
                            <ExternalLink className="w-3 h-3 text-muted-foreground/40 hover:text-primary transition-colors" />
                          </a>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {fmtNumber(ad.conversions)} {resultLabel.toLowerCase()} · {fmtCurrency(ad.spend)} · {ad.ctr.toFixed(2)}% CTR · {ad.costPerResult != null ? `${fmtCurrency(ad.costPerResult)} por resultado` : "—"}
                        </p>
                      </div>
                    </div>
                  ))
                )
              ) : (
                adsetsLoading ? (
                  <div className="space-y-2">{[...Array(cardsExpanded ? 4 : 1)].map((_, i) => <div key={i} className="h-11 bg-muted rounded-lg animate-pulse" />)}</div>
                ) : !topAdsets?.length ? (
                  <p className="text-sm text-muted-foreground text-center py-4">Sem dados de públicos no período.</p>
                ) : (
                  (cardsExpanded ? topAdsets : topAdsets.slice(0, 1)).map((as, i) => (
                    <div key={as.adsetId} className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-accent/30 transition-colors">
                      <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-bold flex-shrink-0">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">{as.adsetName}</p>
                        <p className="text-xs text-muted-foreground">
                          {fmtNumber(as.conversions)} {resultLabel.toLowerCase()} · {fmtCurrency(as.spend)} · {as.ctr.toFixed(2)}% CTR · {as.costPerResult != null ? `${fmtCurrency(as.costPerResult)} por resultado` : "—"}
                        </p>
                      </div>
                    </div>
                  ))
                )
              )}
            </CardContent>
          </Card>

        </div>

        {/* Adaptive KPI Cards — 4 per row */}
        {isLoading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(8)].map((_, i) => (
              <Card key={i} className="border-border bg-card">
                <CardContent className="p-5">
                  <div className="h-4 bg-muted rounded animate-pulse mb-3 w-8" />
                  <div className="h-7 bg-muted rounded animate-pulse mb-1 w-24" />
                  <div className="h-3 bg-muted rounded animate-pulse w-20" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 animate-in fade-in-50 duration-500">
              {kpiDefs.slice(0, 4).map((kpi, idx) => (
                <div key={kpi.key} style={{ animationDelay: `${idx * 50}ms` }}>
                  <MetricCard
                    title={kpi.label}
                    subtitle={kpi.subtitle}
                    value={totals ? kpi.format(totals) : "—"}
                    icon={kpi.icon}
                    color={kpi.color}
                    trendPercent={totals && prevTotals ? pctChange((totals as any)[kpi.key] ?? 0, prevTotals[kpi.key] ?? 0) : undefined}
                    trendPrevValue={prevTotals ? kpi.format(prevTotals) : undefined}
                  />
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 animate-in fade-in-50 duration-500" style={{ animationDelay: "200ms" }}>
              {kpiDefs.slice(4, 8).map((kpi, idx) => (
                <div key={kpi.key} style={{ animationDelay: `${idx * 50}ms` }}>
                  <MetricCard
                    title={kpi.label}
                    subtitle={kpi.subtitle}
                    value={totals ? kpi.format(totals) : "—"}
                    icon={kpi.icon}
                    color={kpi.color}
                    trendPercent={totals && prevTotals ? pctChange((totals as any)[kpi.key] ?? 0, prevTotals[kpi.key] ?? 0) : undefined}
                    trendPrevValue={prevTotals ? kpi.format(prevTotals) : undefined}
                  />
                </div>
              ))}
            </div>
          </>
        )}

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="border-border bg-card">
            <CardHeader className="pb-2 border-b border-border/30">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-bold text-foreground">Investimento Diário (R$)</CardTitle>
                <div className="flex items-center gap-2 text-right">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">Total no período</span>
                    <span className="text-sm font-bold text-foreground">{fmtCurrency(data?.totals?.spend ?? 0)}</span>
                  </div>
                  {(() => {
                    const curr = data?.totals?.spend ?? 0;
                    const prev = (data as any)?.previousTotals?.spend ?? 0;
                    if (!prev) return null;
                    const pct = ((curr - prev) / prev) * 100;
                    const isUp = pct >= 0;
                    return (
                      <div className="relative group">
                        <span className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-md cursor-default ${isUp ? "text-emerald-600 bg-emerald-50" : "text-red-500 bg-red-50"}`}>
                          {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                          {Math.abs(pct).toFixed(1)}%
                        </span>
                        <div className="absolute right-0 top-full mt-1 z-50 hidden group-hover:block bg-popover border border-border rounded-lg px-3 py-2 shadow-xl whitespace-nowrap">
                          <p className="text-xs text-muted-foreground">Período anterior</p>
                          <p className="text-sm font-bold text-foreground">{fmtCurrency(prev)}</p>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#E85BA8" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#E85BA8" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E8D5E0" opacity={0.5} />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#666666" }} />
                  <YAxis tick={{ fontSize: 10, fill: "#666666" }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="Gasto" stroke="#E85BA8" fill="url(#spendGrad)" strokeWidth={2.5} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="border-border bg-card">
            <CardHeader className="pb-2 border-b border-border/30">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-bold text-foreground">
                  {chartMetricKey === "ROAS" ? "Receita Gerada (R$)" : `${chartMetricLabel} Diários`}
                </CardTitle>
                <div className="flex items-center gap-2 text-right">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">Total no período</span>
                    <span className="text-sm font-bold text-foreground">
                      {chartMetricKey === "ROAS"
                        ? fmtCurrency(data?.totals?.conversionValue ?? 0)
                        : String((data?.totals as any)?.[chartMetricKey.toLowerCase()] ?? chartData.reduce((s: number, d: any) => s + (d[chartMetricKey] ?? 0), 0).toFixed(chartMetricKey === "Resultado" ? 0 : 2))}
                    </span>
                  </div>
                  {(() => {
                    const curr = chartMetricKey === "ROAS"
                      ? (data?.totals?.conversionValue ?? 0)
                      : (data?.totals?.conversions ?? 0);
                    const prev = chartMetricKey === "ROAS"
                      ? ((data as any)?.previousTotals?.conversionValue ?? 0)
                      : ((data as any)?.previousTotals?.conversions ?? 0);
                    if (!prev) return null;
                    const pct = ((curr - prev) / prev) * 100;
                    const isUp = pct >= 0;
                    const prevLabel = chartMetricKey === "ROAS" ? fmtCurrency(prev) : fmtNumber(prev);
                    return (
                      <div className="relative group">
                        <span className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-md cursor-default ${isUp ? "text-emerald-600 bg-emerald-50" : "text-red-500 bg-red-50"}`}>
                          {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                          {Math.abs(pct).toFixed(1)}%
                        </span>
                        <div className="absolute right-0 top-full mt-1 z-50 hidden group-hover:block bg-popover border border-border rounded-lg px-3 py-2 shadow-xl whitespace-nowrap">
                          <p className="text-xs text-muted-foreground">Período anterior</p>
                          <p className="text-sm font-bold text-foreground">{prevLabel}</p>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="resultGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#F5B8D8" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#F5B8D8" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E8D5E0" opacity={0.5} />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#666666" }} />
                  <YAxis tick={{ fontSize: 10, fill: "#666666" }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area
                    type="monotone"
                    dataKey={chartMetricKey === "ROAS" ? "Receita" : chartMetricKey}
                    stroke="#F5B8D8"
                    fill="url(#resultGrad)"
                    strokeWidth={2.5}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Ver sugestões da IA */}
        <div style={{ textAlign: "center", paddingTop: 4 }}>
          <a
            href="/suggestions"
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              fontSize: 13, fontWeight: 500, color: "#E85BA8",
              textDecoration: "none", padding: "8px 20px",
              border: "1px solid rgba(232,91,168,0.3)", borderRadius: 99,
              transition: "all 0.15s",
            }}
            onMouseEnter={(e: any) => { e.currentTarget.style.background = "rgba(232,91,168,0.06)"; }}
            onMouseLeave={(e: any) => { e.currentTarget.style.background = "transparent"; }}
          >
            Ver sugestões da IA →
          </a>
        </div>
      </div>
    </MetaDashboardLayout>
  );
}

// ─── Balance Card (top of dashboard) ─────────────────────────────────────────
function BalanceCard({ accountId }: { accountId: number }) {
  const { data: billing, isLoading } = trpc.accounts.billing.useQuery({ accountId });

  if (isLoading) {
    return (
      <Card className="border-border">
        <CardContent className="p-4 flex items-center gap-3">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Carregando saldo da conta...</span>
        </CardContent>
      </Card>
    );
  }
  if (!billing) return null;

  const remaining = billing.remainingBalance;
  const fundingLabel = (() => {
    const map: Record<number, string> = {
      0: "Não configurado", 1: "Cartão de crédito", 2: "Saldo Meta (pré-pago)",
      3: "Crédito pago Meta", 4: "Crédito estendido Meta", 5: "Ordem", 6: "Fatura",
      12: "PayPal", 13: "PayPal (recorrente)", 15: "Depósito externo (PIX / Boleto)",
      17: "Débito direto", 19: "Pagamento alternativo", 20: "Saldo armazenado (pré-pago)",
    };
    return billing.fundingSourceDisplay ?? (billing.fundingSourceType !== null ? (map[billing.fundingSourceType] ?? `Tipo ${billing.fundingSourceType}`) : "Não configurado");
  })();

  // Dynamic color based on balance thresholds
  const getBalanceStyle = (balance: number | null) => {
    if (balance === null) return { bg: "bg-card", text: "text-foreground", border: "border-border", label: "—", icon: "bg-purple-400/10", iconColor: "text-purple-400" };
    if (balance > 200) return { bg: "bg-emerald-500/5", text: "text-emerald-400", border: "border-emerald-500/30", label: "Saudável", icon: "bg-emerald-400/10", iconColor: "text-emerald-400" };
    if (balance >= 100) return { bg: "bg-amber-500/5", text: "text-amber-400", border: "border-amber-500/30", label: "Atenção", icon: "bg-amber-400/10", iconColor: "text-amber-400" };
    return { bg: "bg-red-500/5", text: "text-red-400", border: "border-red-500/30", label: "Crítico", icon: "bg-red-400/10", iconColor: "text-red-400" };
  };

  const colors = getBalanceStyle(remaining);

  // For post-paid accounts without remaining balance, show a simpler card
  if (!billing.isPrePaid || remaining === null) {
    return (
      <Card className="border-border">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-purple-400/10 flex items-center justify-center flex-shrink-0">
                <CreditCard className="w-4 h-4 text-purple-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Forma de Pagamento</p>
                <p className="text-sm font-semibold text-foreground">{fundingLabel}</p>
              </div>
            </div>
            {billing.spendCap && (
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Limite de gasto</p>
                <p className="text-sm font-semibold text-foreground">
                  {billing.currency} {(parseFloat(billing.spendCap) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Pre-paid account with balance
  return (
    <Card className={`${colors.border} border ${colors.bg}`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${colors.icon}`}>
              <Wallet className={`w-5 h-5 ${colors.iconColor}`} />
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Saldo da Conta</p>
              <p className={`text-2xl font-bold ${colors.text}`}>
                {billing.currency} {remaining.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className={`${colors.text} border-current/30`}>
              {colors.label}
            </Badge>
          </div>
        </div>
        <div className="flex items-center gap-4 mt-2 pt-2 border-t border-border/30">
          <p className="text-xs text-muted-foreground">
            Forma de pagamento: <span className="text-foreground font-medium">{fundingLabel}</span>
          </p>
          {remaining < 200 && (
            <div className={`flex items-center gap-1.5 text-xs font-medium ${colors.text}`}>
              <AlertTriangle className="w-3.5 h-3.5" />
              {remaining < 100 ? "Saldo crítico! Recarregue imediatamente." : "Saldo baixo — Recarregue em breve."}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
