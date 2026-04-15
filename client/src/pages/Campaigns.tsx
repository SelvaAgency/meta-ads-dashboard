import { MetaDashboardLayout, useSelectedAccount } from "@/components/MetaDashboardLayout";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { BarChart3, Link2, Search, Zap, Circle, Calendar } from "lucide-react";
import { useState, useMemo } from "react";
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

export default function Campaigns() {
  const [days, setDays] = useState("7");
  const [search, setSearch] = useState("");
  const [periodMode, setPeriodMode] = useState<"quick" | "custom">("quick");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [, navigate] = useLocation();
  const { selectedAccountId, accounts } = useSelectedAccount();

  const handleQuickPeriod = (mode: string) => {
    setPeriodMode("quick");
    if (mode === "today") setDays("1");
    else if (mode === "yesterday") setDays("1");
    else if (mode === "today-yesterday") setDays("2");
    else setDays(mode.replace("d", ""));
  };

  // Use performance query which aggregates from DB (has frequency, cpm, cpc, etc.)
  // TODO: Backend needs to support startDate/endDate for custom periods
  const { data: campaigns, isLoading } = trpc.campaigns.performance.useQuery(
    { 
      accountId: selectedAccountId!, 
      days: parseInt(days) || 7,
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

  const filtered = useMemo(() => {
    if (!campaigns) return [];
    return campaigns.filter((c) =>
      (c.campaignName ?? "").toLowerCase().includes(search.toLowerCase())
    );
  }, [campaigns, search]);

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
            Exibindo campanhas ativas e pausadas nos últimos 7 dias
          </p>
        </div>

        {/* Period selector with quick buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant={periodMode === "quick" && days === "1" ? "default" : "outline"}
            size="sm"
            onClick={() => handleQuickPeriod("today")}
            className="text-xs"
          >
            Hoje
          </Button>
          <Button
            variant={periodMode === "quick" && days === "1" ? "default" : "outline"}
            size="sm"
            onClick={() => handleQuickPeriod("yesterday")}
            className="text-xs"
          >
            Ontem
          </Button>
          <Button
            variant={periodMode === "quick" && days === "2" ? "default" : "outline"}
            size="sm"
            onClick={() => handleQuickPeriod("today-yesterday")}
            className="text-xs"
          >
            Hoje e Ontem
          </Button>
          <Button
            variant={periodMode === "quick" && days === "7" ? "default" : "outline"}
            size="sm"
            onClick={() => handleQuickPeriod("7d")}
            className="text-xs"
          >
            Últimos 7d
          </Button>
          <Button
            variant={periodMode === "quick" && days === "14" ? "default" : "outline"}
            size="sm"
            onClick={() => handleQuickPeriod("14d")}
            className="text-xs"
          >
            Últimos 14d
          </Button>
          <Button
            variant={periodMode === "quick" && days === "30" ? "default" : "outline"}
            size="sm"
            onClick={() => handleQuickPeriod("30d")}
            className="text-xs"
          >
            Últimos 30d
          </Button>
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
                      setDays("0"); // Trigger refetch
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
        <Card className="border-border/60 bg-gradient-to-br from-card to-card/95">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="text-xs border-collapse" style={{ minWidth: "1400px" }}>
                <thead>
                  <tr className="border-b border-border/50 bg-gradient-to-r from-primary/10 to-secondary/10">
                    {/* Campaign name — sticky left */}
                    <th
                      className="text-left px-4 py-3 text-foreground font-bold sticky left-0 bg-gradient-to-r from-primary/10 to-secondary/10 z-10 border-r border-border/50"
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
                        <td colSpan={13} className="px-4 py-3">
                          <div className="h-4 bg-gradient-to-r from-muted to-muted/50 rounded animate-pulse" />
                        </td>
                      </tr>
                    ))
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={13} className="text-center py-12 text-muted-foreground">
                        <BarChart3 className="w-8 h-8 mx-auto mb-2 opacity-30" />
                        <p>Nenhuma campanha encontrada. Sincronize sua conta.</p>
                      </td>
                    </tr>
                  ) : (
                    filtered.map((c) => {
                      const metaId = String((c as any).metaCampaignId ?? c.campaignId ?? "");
                      const status = statusMap.get(metaId) ?? c.campaignStatus ?? "ACTIVE";

                      // Extract 12 metrics
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

                      return (
                        <tr key={metaId} className="border-b border-border/50 hover:bg-secondary/10 transition-all">
                          {/* Campaign name — sticky left */}
                          <td
                            className="px-4 py-3 sticky left-0 bg-gradient-to-r from-card to-card/95 border-r border-border/50"
                            style={{ minWidth: "220px" }}
                          >
                            <div className="space-y-1">
                              <p className="font-semibold text-foreground truncate">{c.campaignName ?? "—"}</p>
                              <p className="text-xs text-muted-foreground">{c.campaignId ?? "—"}</p>
                            </div>
                          </td>

                          {/* Status */}
                          <td className="px-3 py-3 text-center border-r border-border/50">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs ${statusBg}`}>
                              <Circle size={6} className="fill-current" />
                              {statusLabel}
                            </span>
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
