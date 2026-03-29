import { MetaDashboardLayout, useSelectedAccount } from "@/components/MetaDashboardLayout";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { BarChart3, Link2, Search, Zap, Circle } from "lucide-react";
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

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
  const [days, setDays] = useState("30");
  const [search, setSearch] = useState("");
  const [, navigate] = useLocation();
  const { selectedAccountId, accounts } = useSelectedAccount();

  // Use performance query which aggregates from DB (has frequency, cpm, cpc, etc.)
  const { data: campaigns, isLoading } = trpc.campaigns.performance.useQuery(
    { accountId: selectedAccountId!, days: parseInt(days) },
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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">Campanhas</h1>
            <p className="text-sm text-muted-foreground">
              Exibindo campanhas ativas e pausadas nos últimos 7 dias
            </p>
          </div>
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="w-36 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Últimos 7 dias</SelectItem>
              <SelectItem value="14">Últimos 14 dias</SelectItem>
              <SelectItem value="30">Últimos 30 dias</SelectItem>
              <SelectItem value="60">Últimos 60 dias</SelectItem>
            </SelectContent>
          </Select>
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
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="text-xs border-collapse" style={{ minWidth: "1400px" }}>
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    {/* Campaign name — sticky left */}
                    <th
                      className="text-left px-4 py-3 text-muted-foreground font-medium sticky left-0 bg-card z-10 border-r border-border"
                      style={{ minWidth: "220px" }}
                    >
                      Campanha
                    </th>
                    {COLUMNS.map((col) => (
                      <th
                        key={col.key}
                        className={`text-right px-3 py-3 text-muted-foreground font-medium whitespace-nowrap ${col.width}`}
                      >
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    [...Array(5)].map((_, i) => (
                      <tr key={i} className="border-b border-border/50">
                        <td colSpan={13} className="px-4 py-3">
                          <div className="h-4 bg-muted rounded animate-pulse" />
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
                      const isActive = status === "ACTIVE";
                      const statusLabel = isActive ? "Ativo" : status === "PAUSED" ? "Pausado" : status;
                      const statusDot = isActive ? "text-emerald-400" : "text-yellow-400";
                      const statusBadge = isActive
                        ? "text-emerald-400 border-emerald-400/30 bg-emerald-400/5"
                        : "text-yellow-400 border-yellow-400/30 bg-yellow-400/5";

                      // Frequency color
                      const freqColor =
                        frequency >= 4 ? "text-red-400 font-bold" :
                        frequency >= 2.5 ? "text-yellow-400 font-medium" :
                        "text-foreground";

                      return (
                        <tr
                          key={c.campaignId}
                          className="border-b border-border/50 hover:bg-accent/20 transition-colors"
                        >
                          {/* Campaign name — sticky left */}
                          <td
                            className="px-4 py-3 sticky left-0 bg-card z-10 border-r border-border/50"
                            style={{ minWidth: "220px" }}
                          >
                            <p className="font-medium text-foreground truncate max-w-[200px]" title={c.campaignName ?? ""}>
                              {c.campaignName}
                            </p>
                            {resultLabel && (
                              <p className="text-[10px] text-muted-foreground mt-0.5">{resultLabel}</p>
                            )}
                          </td>

                          {/* 1. Veiculação */}
                          <td className="px-3 py-3 text-right">
                            <Badge variant="outline" className={`text-[10px] gap-1 ${statusBadge}`}>
                              <Circle className={`w-1.5 h-1.5 fill-current ${statusDot}`} />
                              {statusLabel}
                            </Badge>
                          </td>

                          {/* 2. Resultado */}
                          <td className="px-3 py-3 text-right font-semibold text-foreground">
                            {results > 0 ? fmtNum(results) : <span className="text-muted-foreground">—</span>}
                          </td>

                          {/* 3. Custo por Resultado */}
                          <td className="px-3 py-3 text-right">
                            <span className={costPerResult > 0 ? "text-foreground" : "text-muted-foreground"}>
                              {fmtCurrency(costPerResult)}
                            </span>
                          </td>

                          {/* 4. Visitas ao Perfil */}
                          <td className="px-3 py-3 text-right text-muted-foreground">
                            {fmtNum(profileVisits)}
                          </td>

                          {/* 5. Alcance */}
                          <td className="px-3 py-3 text-right text-muted-foreground">
                            {fmtNum(reach)}
                          </td>

                          {/* 6. Impressões */}
                          <td className="px-3 py-3 text-right text-muted-foreground">
                            {fmtNum(impressions)}
                          </td>

                          {/* 7. CPM */}
                          <td className="px-3 py-3 text-right text-muted-foreground">
                            {fmtCurrency(cpm)}
                          </td>

                          {/* 8. Cliques */}
                          <td className="px-3 py-3 text-right text-muted-foreground">
                            {fmtNum(clicks)}
                          </td>

                          {/* 9. CPC */}
                          <td className="px-3 py-3 text-right text-muted-foreground">
                            {fmtCurrency(cpc)}
                          </td>

                          {/* 10. CTR */}
                          <td className="px-3 py-3 text-right text-muted-foreground">
                            {fmtPct(ctr)}
                          </td>

                          {/* 11. Frequência */}
                          <td className={`px-3 py-3 text-right ${freqColor}`}>
                            {fmtFreq(frequency)}
                          </td>

                          {/* 12. Seguidores no Instagram */}
                          <td className="px-3 py-3 text-right text-muted-foreground">
                            {fmtNum(followers)}
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

        {/* Legend */}
        {campaigns && campaigns.length > 0 && (
          <div className="flex items-start gap-4 text-[10px] text-muted-foreground">
            <p>* Colunas fixas conforme especificação. Scroll horizontal para ver todas as métricas.</p>
            <p>* Frequência em amarelo ≥ 2.5 | vermelho ≥ 4.0</p>
          </div>
        )}
      </div>
    </MetaDashboardLayout>
  );
}
