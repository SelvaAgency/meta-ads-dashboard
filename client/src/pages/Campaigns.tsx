import { MetaDashboardLayout, useSelectedAccount } from "@/components/MetaDashboardLayout";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { ArrowDown, ArrowUp, BarChart3, Link2, Search, Zap } from "lucide-react";
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

const fmtCurrency = (v: number) =>
  `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtNum = (v: number) => {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return v.toLocaleString("pt-BR");
};

export default function Campaigns() {
  const [days, setDays] = useState("30");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"roas" | "spend" | "cpa" | "ctr" | "results">("spend");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [, navigate] = useLocation();
  const { selectedAccountId, accounts } = useSelectedAccount();

  const { data: campaigns, isLoading } = trpc.campaigns.performance.useQuery(
    { accountId: selectedAccountId!, days: parseInt(days) },
    { enabled: !!selectedAccountId }
  );

  const filtered = useMemo(() => {
    if (!campaigns) return [];
    let list = campaigns.filter((c) =>
      (c.campaignName ?? "").toLowerCase().includes(search.toLowerCase())
    );
    list = list.sort((a, b) => {
      let av = 0, bv = 0;
      if (sortBy === "roas") { av = Number(a.avgRoas ?? 0); bv = Number(b.avgRoas ?? 0); }
      else if (sortBy === "spend") { av = Number(a.totalSpend ?? 0); bv = Number(b.totalSpend ?? 0); }
      else if (sortBy === "cpa") { av = Number(a.avgCpa ?? 0); bv = Number(b.avgCpa ?? 0); }
      else if (sortBy === "ctr") { av = Number(a.avgCtr ?? 0); bv = Number(b.avgCtr ?? 0); }
      else if (sortBy === "results") { av = Number(a.totalConversions ?? 0); bv = Number(b.totalConversions ?? 0); }
      return sortDir === "desc" ? bv - av : av - bv;
    });
    return list;
  }, [campaigns, search, sortBy, sortDir]);

  const statusColor: Record<string, string> = {
    ACTIVE: "text-emerald-400 border-emerald-400/30",
    PAUSED: "text-yellow-400 border-yellow-400/30",
    DELETED: "text-red-400 border-red-400/30",
    ARCHIVED: "text-muted-foreground border-border",
  };

  // Determine the dominant result label across all campaigns for the table header
  const dominantResultLabel = useMemo(() => {
    if (!campaigns || campaigns.length === 0) return "Resultados";
    const labels = campaigns
      .map((c) => (c as any).campaignResultLabel as string | undefined)
      .filter(Boolean);
    if (labels.length === 0) return "Resultados";
    // Most common label
    const counts: Record<string, number> = {};
    for (const l of labels) { counts[l!] = (counts[l!] ?? 0) + 1; }
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  }, [campaigns]);

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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">Campanhas</h1>
            <p className="text-sm text-muted-foreground">Comparação de performance por campanha</p>
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

        {/* Filters */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="Buscar campanha..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-xs"
            />
          </div>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
            <SelectTrigger className="w-36 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="spend">Por Gasto</SelectItem>
              <SelectItem value="roas">Por ROAS</SelectItem>
              <SelectItem value="cpa">Por Custo/Resultado</SelectItem>
              <SelectItem value="ctr">Por CTR</SelectItem>
              <SelectItem value="results">Por Resultados</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => setSortDir(sortDir === "desc" ? "asc" : "desc")}
          >
            {sortDir === "desc" ? <ArrowDown className="w-3.5 h-3.5" /> : <ArrowUp className="w-3.5 h-3.5" />}
          </Button>
        </div>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left px-4 py-3 text-muted-foreground font-medium">Campanha</th>
                    <th className="text-right px-3 py-3 text-muted-foreground font-medium">Status</th>
                    <th className="text-right px-3 py-3 text-muted-foreground font-medium">Gasto</th>
                    <th className="text-right px-3 py-3 text-muted-foreground font-medium">{dominantResultLabel}</th>
                    <th className="text-right px-3 py-3 text-muted-foreground font-medium">Custo/Resultado</th>
                    <th className="text-right px-3 py-3 text-muted-foreground font-medium">ROAS</th>
                    <th className="text-right px-3 py-3 text-muted-foreground font-medium">CTR</th>
                    <th className="text-right px-3 py-3 text-muted-foreground font-medium">Alcance</th>
                    <th className="text-right px-3 py-3 text-muted-foreground font-medium">Impressões</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    [...Array(5)].map((_, i) => (
                      <tr key={i} className="border-b border-border/50">
                        <td colSpan={9} className="px-4 py-3">
                          <div className="h-4 bg-muted rounded animate-pulse" />
                        </td>
                      </tr>
                    ))
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="text-center py-12 text-muted-foreground">
                        <BarChart3 className="w-8 h-8 mx-auto mb-2 opacity-30" />
                        <p>Nenhuma campanha encontrada. Sincronize sua conta.</p>
                      </td>
                    </tr>
                  ) : (
                    filtered.map((c) => {
                      const roas = Number(c.avgRoas ?? 0);
                      const spend = Number(c.totalSpend ?? 0);
                      const results = Math.round(Number(c.totalConversions ?? 0));
                      const cpa = Number(c.avgCpa ?? 0);
                      const ctr = Number(c.avgCtr ?? 0);
                      const reach = Number((c as any).totalReach ?? 0);
                      const impressions = Number(c.totalImpressions ?? 0);
                      const resultLabel = (c as any).campaignResultLabel as string | undefined;

                      const roasColor = roas >= 3 ? "text-emerald-400" : roas >= 1.5 ? "text-yellow-400" : roas > 0 ? "text-red-400" : "text-muted-foreground";
                      const cpaColor = cpa === 0 ? "text-muted-foreground" : cpa < 50 ? "text-emerald-400" : cpa < 150 ? "text-yellow-400" : "text-red-400";

                      return (
                        <tr key={c.campaignId} className="border-b border-border/50 hover:bg-accent/30 transition-colors">
                          <td className="px-4 py-3">
                            <p className="font-medium text-foreground truncate max-w-[180px]" title={c.campaignName ?? ""}>
                              {c.campaignName}
                            </p>
                            {resultLabel && (
                              <p className="text-[10px] text-muted-foreground mt-0.5">{resultLabel}</p>
                            )}
                          </td>
                          <td className="px-3 py-3 text-right">
                            <Badge variant="outline" className={`text-[10px] ${statusColor[c.campaignStatus ?? "ACTIVE"]}`}>
                              {c.campaignStatus === "ACTIVE" ? "Ativo" : c.campaignStatus === "PAUSED" ? "Pausado" : c.campaignStatus}
                            </Badge>
                          </td>
                          <td className="px-3 py-3 text-right text-foreground font-medium">
                            {fmtCurrency(spend)}
                          </td>
                          <td className="px-3 py-3 text-right text-foreground font-semibold">
                            {results > 0 ? fmtNum(results) : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className={`px-3 py-3 text-right font-medium ${cpaColor}`}>
                            {cpa > 0 ? fmtCurrency(cpa) : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className={`px-3 py-3 text-right font-bold ${roasColor}`}>
                            {roas > 0 ? `${roas.toFixed(2)}x` : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="px-3 py-3 text-right text-foreground">
                            {ctr.toFixed(2)}%
                          </td>
                          <td className="px-3 py-3 text-right text-muted-foreground">
                            {reach > 0 ? fmtNum(reach) : <span>—</span>}
                          </td>
                          <td className="px-3 py-3 text-right text-muted-foreground">
                            {fmtNum(impressions)}
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
          <p className="text-[10px] text-muted-foreground">
            * "Resultados" e "Custo/Resultado" refletem a meta de desempenho real de cada campanha (ex: Compras no site, Mensagens, Leads).
            Sincronize para atualizar os dados.
          </p>
        )}
      </div>
    </MetaDashboardLayout>
  );
}
