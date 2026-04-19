import { MetaDashboardLayout, useSelectedAccount } from "@/components/MetaDashboardLayout";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { BarChart3, Link2, Search, Zap, Circle, Calendar, ChevronDown, ChevronRight, Film, Image, LayoutGrid, ShoppingBag, Loader2 } from "lucide-react";
import { useState, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

const fmtCurrency = (v: number | null | undefined) => {
  if (v == null || v === 0) return "—";
  return `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const fmtNum = (v: number | null | undefined) => {
  if (v == null || v === 0) return "—";
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return v.toLocaleString("pt-BR");
};

const fmtPct = (v: number | null | undefined) => {
  if (v == null) return "—";
  return `${Number(v).toFixed(2)}%`;
};

const fmtFreq = (v: number | null | undefined) => {
  if (v == null || v === 0) return "—";
  return Number(v).toFixed(2);
};

// Fixed 12-column definition (order is mandatory per spec)
const COLUMNS = [
  { key: "status",       label: "Veiculação",         width: "w-[120px]" },
  { key: "spend",        label: "Investimento",        width: "w-[120px]" },
  { key: "result",       label: "Resultado",           width: "w-[110px]" },
  { key: "costPerResult",label: "Custo/Resultado",     width: "w-[130px]" },
  { key: "profileVisits",label: "Visitas ao Perfil",   width: "w-[120px]" },
  { key: "reach",        label: "Alcance",             width: "w-[100px]" },
  { key: "impressions",  label: "Impressões",          width: "w-[110px]" },
  { key: "cpm",          label: "CPM",                 width: "w-[100px]" },
  { key: "clicks",       label: "Cliques",             width: "w-[90px]" },
  { key: "cpc",          label: "CPC",                 width: "w-[100px]" },
  { key: "ctr",          label: "CTR",                 width: "w-[90px]" },
  { key: "frequency",    label: "Frequência",          width: "w-[100px]" },
  { key: "followers",    label: "Seguidores",          width: "w-[100px]" },
] as const;


// ─── Creative type icon helper ────────────────────────────────────────────────
function CreativeIcon({ type }: { type: string }) {
  switch (type) {
    case "VIDEO": return <Film size={13} className="text-purple-400" />;
    case "CAROUSEL": return <LayoutGrid size={13} className="text-blue-400" />;
    case "CATALOG": return <ShoppingBag size={13} className="text-amber-400" />;
    default: return <Image size={13} className="text-emerald-400" />;
  }
}

// ─── Expandable campaign row with lazy-loaded ads ────────────────────────────
function CampaignRowWithAds({
  campaign: c,
  metaId,
  status,
  statusBg,
  statusLabel,
  resultLabel,
  spend,
  results,
  costPerResult,
  profileVisits,
  reach,
  impressions,
  cpm,
  clicks,
  cpc,
  ctr,
  frequency,
  followers,
  isExpanded,
  onToggle,
  selectedAccountId,
  dateParams,
}: {
  campaign: any;
  metaId: string;
  status: string;
  statusBg: string;
  statusLabel: string;
  resultLabel: string | undefined;
  spend: number;
  results: number;
  costPerResult: number;
  profileVisits: number;
  reach: number;
  impressions: number;
  cpm: number;
  clicks: number;
  cpc: number;
  ctr: number;
  frequency: number;
  followers: number;
  isExpanded: boolean;
  onToggle: () => void;
  selectedAccountId: number;
  dateParams: { days: number; startDate?: string; endDate?: string; includeToday?: boolean };
}) {
  // Only fetch ads when expanded
  const { data: ads, isLoading: adsLoading } = trpc.campaigns.ads.useQuery(
    {
      accountId: selectedAccountId,
      metaCampaignId: metaId,
      days: dateParams.days || 7,
      ...(dateParams.startDate ? { startDate: dateParams.startDate } : {}),
      ...(dateParams.endDate ? { endDate: dateParams.endDate } : {}),
      includeToday: dateParams.includeToday,
    },
    { enabled: isExpanded }
  );

  return (
    <>
      {/* Campaign row */}
      <tr className="border-b border-border/50 hover:bg-secondary/10 transition-all cursor-pointer" onClick={onToggle}>
        {/* Campaign name — sticky left */}
        <td className="px-4 py-3 sticky left-0 bg-card border-r border-border/50" style={{ minWidth: "220px" }}>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground flex-shrink-0">
              {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </span>
            <div className="space-y-1 min-w-0">
              <p className="font-semibold text-foreground truncate">{c.campaignName ?? "—"}</p>
              <p className="text-xs text-muted-foreground">{c.campaignId ?? "—"}</p>
            </div>
          </div>
        </td>

        {/* Status */}
        <td className="px-3 py-3 text-center border-r border-border/50">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs ${statusBg}`}>
            <Circle size={6} className="fill-current" />
            {statusLabel}
          </span>
        </td>

        {/* Investimento */}
        <td className="px-3 py-3 text-right border-r border-border/50">
          <p className="font-bold text-foreground">{fmtCurrency(spend)}</p>
        </td>

        {/* Result */}
        <td className="px-3 py-3 text-right border-r border-border/50">
          <div>
            <p className="font-bold text-foreground">{fmtNum(results)}</p>
            <p className="text-xs text-muted-foreground">{resultLabel ?? "Resultados"}</p>
          </div>
        </td>

        {/* Cost per Result */}
        <td className="px-3 py-3 text-right border-r border-border/50">
          <p className="font-bold text-foreground">{fmtCurrency(costPerResult)}</p>
        </td>

        {/* Profile Visits */}
        <td className="px-3 py-3 text-right border-r border-border/50">
          <p className="font-bold text-foreground">{fmtNum(profileVisits)}</p>
        </td>

        {/* Reach */}
        <td className="px-3 py-3 text-right border-r border-border/50">
          <p className="font-bold text-foreground">{fmtNum(reach)}</p>
        </td>

        {/* Impressions */}
        <td className="px-3 py-3 text-right border-r border-border/50">
          <p className="font-bold text-foreground">{fmtNum(impressions)}</p>
        </td>

        {/* CPM */}
        <td className="px-3 py-3 text-right border-r border-border/50">
          <p className="font-bold text-foreground">{fmtCurrency(cpm)}</p>
        </td>

        {/* Clicks */}
        <td className="px-3 py-3 text-right border-r border-border/50">
          <p className="font-bold text-foreground">{fmtNum(clicks)}</p>
        </td>

        {/* CPC */}
        <td className="px-3 py-3 text-right border-r border-border/50">
          <p className="font-bold text-foreground">{fmtCurrency(cpc)}</p>
        </td>

        {/* CTR */}
        <td className="px-3 py-3 text-right border-r border-border/50">
          <p className="font-bold text-foreground">{fmtPct(ctr)}</p>
        </td>

        {/* Frequency */}
        <td className="px-3 py-3 text-right border-r border-border/50">
          <p className="font-bold text-foreground">{fmtFreq(frequency)}</p>
        </td>

        {/* Followers */}
        <td className="px-3 py-3 text-right">
          <p className="font-bold text-foreground">{fmtNum(followers)}</p>
        </td>
      </tr>

      {/* Expanded ads/creatives sub-rows */}
      {isExpanded && (
        adsLoading ? (
          <tr className="bg-foreground/[0.02]">
            <td colSpan={14} className="px-8 py-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs">
                <Loader2 size={14} className="animate-spin" />
                Carregando criativos...
              </div>
            </td>
          </tr>
        ) : !ads || ads.length === 0 ? (
          <tr className="bg-foreground/[0.02]">
            <td colSpan={14} className="px-8 py-4">
              <p className="text-xs text-muted-foreground">Nenhum criativo ativo encontrado para esta campanha.</p>
            </td>
          </tr>
        ) : (
          ads.map((ad) => (
            <tr key={ad.id} className="bg-foreground/[0.02] border-b border-border/30 hover:bg-foreground/[0.04] transition-all">
              {/* Ad name — sticky left, indented */}
              <td className="px-4 py-2.5 sticky left-0 bg-card border-r border-border/30" style={{ minWidth: "220px" }}>
                <div className="flex items-center gap-2 pl-6">
                  <CreativeIcon type={ad.creative_type} />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-foreground/80 truncate">{ad.name}</p>
                    <p className="text-[10px] text-muted-foreground">{ad.creative_type} · {ad.effective_status === "ACTIVE" ? "Ativo" : "Pausado"}</p>
                  </div>
                </div>
              </td>

              {/* Status */}
              <td className="px-3 py-2.5 text-center border-r border-border/30">
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] ${
                  ad.effective_status === "ACTIVE"
                    ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                    : "bg-amber-500/15 text-amber-400 border-amber-500/30"
                }`}>
                  <Circle size={5} className="fill-current" />
                  {ad.effective_status === "ACTIVE" ? "Ativo" : "Pausado"}
                </span>
              </td>

              {/* Investimento */}
              <td className="px-3 py-2.5 text-right border-r border-border/30">
                <p className="text-xs text-foreground/70">{fmtCurrency(ad.spend)}</p>
              </td>

              {/* Result */}
              <td className="px-3 py-2.5 text-right border-r border-border/30">
                <p className="text-xs text-foreground/70">{fmtNum(ad.conversions)}</p>
              </td>

              {/* Cost per Result */}
              <td className="px-3 py-2.5 text-right border-r border-border/30">
                <p className="text-xs text-foreground/70">{fmtCurrency(ad.costPerResult)}</p>
              </td>

              {/* Profile Visits — N/A at ad level */}
              <td className="px-3 py-2.5 text-right border-r border-border/30">
                <p className="text-xs text-foreground/30">—</p>
              </td>

              {/* Reach — N/A at ad level aggregated */}
              <td className="px-3 py-2.5 text-right border-r border-border/30">
                <p className="text-xs text-foreground/30">—</p>
              </td>

              {/* Impressions */}
              <td className="px-3 py-2.5 text-right border-r border-border/30">
                <p className="text-xs text-foreground/70">{fmtNum(ad.impressions)}</p>
              </td>

              {/* CPM */}
              <td className="px-3 py-2.5 text-right border-r border-border/30">
                <p className="text-xs text-foreground/70">{fmtCurrency(ad.cpm)}</p>
              </td>

              {/* Clicks */}
              <td className="px-3 py-2.5 text-right border-r border-border/30">
                <p className="text-xs text-foreground/70">{fmtNum(ad.clicks)}</p>
              </td>

              {/* CPC */}
              <td className="px-3 py-2.5 text-right border-r border-border/30">
                <p className="text-xs text-foreground/70">{fmtCurrency(ad.cpc)}</p>
              </td>

              {/* CTR */}
              <td className="px-3 py-2.5 text-right border-r border-border/30">
                <p className="text-xs text-foreground/70">{fmtPct(ad.ctr)}</p>
              </td>

              {/* Frequency */}
              <td className="px-3 py-2.5 text-right border-r border-border/30">
                <p className="text-xs text-foreground/70">{fmtFreq(ad.frequency)}</p>
              </td>

              {/* Followers — N/A */}
              <td className="px-3 py-2.5 text-right">
                <p className="text-xs text-foreground/30">—</p>
              </td>
            </tr>
          ))
        )
      )}
    </>
  );
}


export default function Campaigns() {
  const [activePeriod, setActivePeriod] = useState("7d");
  const [search, setSearch] = useState("");
  const [expandedCampaigns, setExpandedCampaigns] = useState<Set<string>>(new Set());
  const [periodMode, setPeriodMode] = useState<"quick" | "custom">("quick");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [, navigate] = useLocation();
  const { selectedAccountId, accounts } = useSelectedAccount();

  // Compute date range based on selected period
  const dateParams = useMemo(() => {
    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split("T")[0];

    if (periodMode === "custom" && customStartDate && customEndDate) {
      return { days: 0, startDate: customStartDate, endDate: customEndDate, includeToday: true };
    }

    switch (activePeriod) {
      case "today":
        return { days: 1, startDate: todayStr, endDate: todayStr, includeToday: true };
      case "yesterday":
        return { days: 1, startDate: yesterdayStr, endDate: yesterdayStr, includeToday: false };
      case "today-yesterday":
        return { days: 2, startDate: yesterdayStr, endDate: todayStr, includeToday: true };
      case "7d":
        return { days: 7, includeToday: true };
      case "14d":
        return { days: 14, includeToday: true };
      case "30d":
        return { days: 30, includeToday: true };
      default:
        return { days: 7, includeToday: true };
    }
  }, [activePeriod, periodMode, customStartDate, customEndDate]);

  const periodLabel = useMemo(() => {
    if (periodMode === "custom") return `${customStartDate} a ${customEndDate}`;
    switch (activePeriod) {
      case "today": return "hoje";
      case "yesterday": return "ontem";
      case "today-yesterday": return "hoje e ontem";
      case "7d": return "nos últimos 7 dias";
      case "14d": return "nos últimos 14 dias";
      case "30d": return "nos últimos 30 dias";
      default: return "nos últimos 7 dias";
    }
  }, [activePeriod, periodMode, customStartDate, customEndDate]);

  const handleQuickPeriod = (mode: string) => {
    setPeriodMode("quick");
    setActivePeriod(mode);
  };

  const toggleCampaign = useCallback((metaId: string) => {
    setExpandedCampaigns((prev) => {
      const next = new Set(prev);
      if (next.has(metaId)) next.delete(metaId);
      else next.add(metaId);
      return next;
    });
  }, []);

  // Use performance query which aggregates from DB (has frequency, cpm, cpc, etc.)
  const { data: campaigns, isLoading } = trpc.campaigns.performance.useQuery(
    { 
      accountId: selectedAccountId!, 
      days: dateParams.days,
      ...(dateParams.startDate ? { startDate: dateParams.startDate } : {}),
      ...(dateParams.endDate ? { endDate: dateParams.endDate } : {}),
      includeToday: dateParams.includeToday,
    },
    { enabled: !!selectedAccountId }
  );

  // Also load active campaigns list for status display (ACTIVE + PAUSED last 7 days)
  const { data: activeCampaigns } = trpc.campaigns.list.useQuery(
    { accountId: selectedAccountId! },
    { enabled: !!selectedAccountId }
  );

  // Build a status map from the active campaigns list
  const statusMap = useMemo(() => {
    const map = new Map<string, string>();
    if (activeCampaigns) {
      for (const c of activeCampaigns) {
        map.set(String(c.metaCampaignId), c.status ?? "ACTIVE");
      }
    }
    return map;
  }, [activeCampaigns]);

  // Build a DB id -> Meta campaign ID map for resolving ad fetches
  const metaIdMap = useMemo(() => {
    const map = new Map<number, string>();
    if (activeCampaigns) {
      for (const c of activeCampaigns) {
        if (c.id && c.metaCampaignId) {
          map.set(c.id, c.metaCampaignId);
        }
      }
    }
    return map;
  }, [activeCampaigns]);

  // Merge campaigns.list (all campaigns) with campaigns.performance (metrics)
  const mergedCampaigns = useMemo(() => {
    if (!activeCampaigns || activeCampaigns.length === 0) return campaigns ?? [];

    const perfMap = new Map<number, any>();
    if (campaigns) {
      for (const c of campaigns) {
        perfMap.set(c.campaignId, c);
      }
    }

    const merged = activeCampaigns.map((ac: any) => {
      const perf = perfMap.get(ac.id);
      if (perf) return perf;
      return {
        campaignId: ac.id,
        metaCampaignId: ac.metaCampaignId,
        campaignName: ac.name,
        campaignStatus: ac.status,
        campaignObjective: ac.objective,
        campaignOptimizationGoal: ac.optimizationGoal,
        campaignResultLabel: ac.resultLabel,
        totalSpend: 0, totalImpressions: 0, totalClicks: 0, totalConversions: 0,
        totalConversionValue: 0, totalReach: 0, avgRoas: 0, avgCpa: 0,
        avgCtr: 0, avgCpc: 0, avgCpm: 0, avgFrequency: 0,
        totalProfileVisits: 0, totalFollowers: 0,
      };
    });

    return merged.sort((a: any, b: any) => Number(b.totalSpend ?? 0) - Number(a.totalSpend ?? 0));
  }, [activeCampaigns, campaigns]);

  const filtered = useMemo(() => {
    if (!mergedCampaigns) return [];
    return mergedCampaigns.filter((c: any) =>
      (c.campaignName ?? "").toLowerCase().includes(search.toLowerCase())
    );
  }, [mergedCampaigns, search]);

  if (!accounts || accounts.length === 0) {
    return (
      <MetaDashboardLayout title="Campanhas">
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

  return (
    <MetaDashboardLayout title="Campanhas">
      <div className="space-y-5">
        {/* Header */}
        <div>
          <h1 className="text-xl font-bold text-foreground">Campanhas</h1>
          <p className="text-sm text-muted-foreground">
            Exibindo campanhas ativas e pausadas {periodLabel}
          </p>
        </div>

        {/* Period selector with quick buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {[
            { key: "today", label: "Hoje" },
            { key: "yesterday", label: "Ontem" },
            { key: "today-yesterday", label: "Hoje e Ontem" },
            { key: "7d", label: "Últimos 7d" },
            { key: "14d", label: "Últimos 14d" },
            { key: "30d", label: "Últimos 30d" },
          ].map((btn) => (
            <Button
              key={btn.key}
              variant={periodMode === "quick" && activePeriod === btn.key ? "default" : "outline"}
              size="sm"
              onClick={() => handleQuickPeriod(btn.key)}
              className="text-xs"
            >
              {btn.label}
            </Button>
          ))}
          <Dialog>
            <DialogTrigger asChild>
              <Button
                variant={periodMode === "custom" ? "default" : "outline"}
                size="sm"
                className="text-xs gap-1.5"
              >
                <Calendar size={14} />
                Personalizado
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Período Personalizado</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label className="text-sm">Data Início (aaaa-mm-dd)</Label>
                  <Input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-sm">Data Fim (aaaa-mm-dd)</Label>
                  <Input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <Button
                  onClick={() => {
                    if (customStartDate && customEndDate) {
                      setPeriodMode("custom");
                      // Period mode already set above
                    }
                  }}
                  className="w-full"
                >
                  Aplicar
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Search */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="Buscar campanha..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-xs"
            />
          </div>
        </div>

        {/* Table — 12 fixed columns with horizontal scroll */}
        <Card className="border-border bg-card">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="text-xs border-collapse" style={{ minWidth: "1520px" }}>
                <thead>
                  <tr className="border-b border-border/50 bg-foreground/5">
                    {/* Campaign name — sticky left */}
                    <th
                      className="text-left px-4 py-3 text-foreground font-bold sticky left-0 bg-foreground/5 z-10 border-r border-border/50"
                      style={{ minWidth: "220px" }}
                    >
                      Campanha
                    </th>
                    {COLUMNS.map((col) => (
                      <th
                        key={col.key}
                        className={`text-right px-3 py-3 text-foreground font-bold whitespace-nowrap ${col.width}`}
                      >
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    [...Array(5)].map((_, i) => (
                      <tr key={i} className="border-b border-border/50 bg-muted/20">
                        <td colSpan={14} className="px-4 py-3">
                          <div className="h-4 bg-muted rounded animate-pulse" />
                        </td>
                      </tr>
                    ))
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={14} className="text-center py-12 text-muted-foreground">
                        <BarChart3 className="w-8 h-8 mx-auto mb-2 opacity-30" />
                        <p>Nenhuma campanha encontrada. Sincronize sua conta.</p>
                      </td>
                    </tr>
                  ) : (
                    filtered.map((c) => {
                      const metaId = String((c as any).metaCampaignId ?? metaIdMap.get(c.campaignId) ?? c.campaignId ?? "");
                      const status = statusMap.get(metaId) ?? c.campaignStatus ?? "ACTIVE";

                      // Extract 12 metrics
                      const spend = Number(c.totalSpend ?? 0);
                      const results = Math.round(Number(c.totalConversions ?? 0));
                      const costPerResult = Number(c.avgCpa ?? 0);
                      const profileVisits = Number((c as any).totalProfileVisits ?? 0);
                      const reach = Number((c as any).totalReach ?? 0);
                      const impressions = Number(c.totalImpressions ?? 0);
                      const cpm = Number(c.avgCpm ?? 0);
                      const clicks = Number(c.totalClicks ?? 0);
                      const cpc = Number(c.avgCpc ?? 0);
                      const ctr = Number(c.avgCtr ?? 0);
                      const frequency = Number((c as any).avgFrequency ?? 0);
                      const followers = Number((c as any).totalFollowers ?? 0);

                      const resultLabel = (c as any).campaignResultLabel as string | undefined;

                      // Status badge
                      const statusBg =
                        status === "ACTIVE"
                          ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40 font-semibold"
                          : status === "PAUSED"
                          ? "bg-amber-500/20 text-amber-400 border-amber-500/40 font-semibold"
                          : "bg-slate-500/20 text-slate-400 border-slate-500/40 font-semibold";
                      const statusLabel =
                        status === "ACTIVE"
                          ? "Ativa"
                          : status === "PAUSED"
                          ? "Pausada"
                          : "Inativa";

                      const isExpanded = expandedCampaigns.has(metaId);

                      return (
                        <CampaignRowWithAds
                          key={metaId}
                          campaign={c}
                          metaId={metaId}
                          status={status}
                          statusBg={statusBg}
                          statusLabel={statusLabel}
                          resultLabel={resultLabel}
                          spend={spend}
                          results={results}
                          costPerResult={costPerResult}
                          profileVisits={profileVisits}
                          reach={reach}
                          impressions={impressions}
                          cpm={cpm}
                          clicks={clicks}
                          cpc={cpc}
                          ctr={ctr}
                          frequency={frequency}
                          followers={followers}
                          isExpanded={isExpanded}
                          onToggle={() => toggleCampaign(metaId)}
                          selectedAccountId={selectedAccountId!}
                          dateParams={dateParams}
                        />
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </MetaDashboardLayout>
  );
}
