import { MetaDashboardLayout, useSelectedAccount } from "@/components/MetaDashboardLayout";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { ArrowDown, ArrowUp, BarChart3, Link2, Search, Zap } from "lucide-react";
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

export default function Campaigns() {
  const [days, setDays] = useState("30");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"roas" | "spend" | "cpa" | "ctr">("roas");
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
      const av = Number(a[sortBy === "roas" ? "avgRoas" : sortBy === "spend" ? "totalSpend" : sortBy === "cpa" ? "avgCpa" : "avgCtr"] ?? 0);
      const bv = Number(b[sortBy === "roas" ? "avgRoas" : sortBy === "spend" ? "totalSpend" : sortBy === "cpa" ? "avgCpa" : "avgCtr"] ?? 0);
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
            <SelectTrigger className="w-32 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="roas">Por ROAS</SelectItem>
              <SelectItem value="spend">Por Gasto</SelectItem>
              <SelectItem value="cpa">Por CPA</SelectItem>
              <SelectItem value="ctr">Por CTR</SelectItem>
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
                    <th className="text-right px-4 py-3 text-muted-foreground font-medium">Status</th>
                    <th className="text-right px-4 py-3 text-muted-foreground font-medium">Gasto</th>
                    <th className="text-right px-4 py-3 text-muted-foreground font-medium">ROAS</th>
                    <th className="text-right px-4 py-3 text-muted-foreground font-medium">CPA</th>
                    <th className="text-right px-4 py-3 text-muted-foreground font-medium">CTR</th>
                    <th className="text-right px-4 py-3 text-muted-foreground font-medium">Conversões</th>
                    <th className="text-right px-4 py-3 text-muted-foreground font-medium">Impressões</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    [...Array(5)].map((_, i) => (
                      <tr key={i} className="border-b border-border/50">
                        <td colSpan={8} className="px-4 py-3">
                          <div className="h-4 bg-muted rounded animate-pulse" />
                        </td>
                      </tr>
                    ))
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center py-12 text-muted-foreground">
                        <BarChart3 className="w-8 h-8 mx-auto mb-2 opacity-30" />
                        <p>Nenhuma campanha encontrada. Sincronize sua conta.</p>
                      </td>
                    </tr>
                  ) : (
                    filtered.map((c) => {
                      const roas = Number(c.avgRoas ?? 0);
                      const roasColor = roas >= 3 ? "text-emerald-400" : roas >= 1.5 ? "text-yellow-400" : "text-red-400";
                      return (
                        <tr key={c.campaignId} className="border-b border-border/50 hover:bg-accent/30 transition-colors">
                          <td className="px-4 py-3">
                            <p className="font-medium text-foreground truncate max-w-[200px]">{c.campaignName}</p>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Badge variant="outline" className={`text-xs ${statusColor[c.campaignStatus ?? "ACTIVE"]}`}>
                              {c.campaignStatus}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-right text-foreground font-medium">
                            R$ {Number(c.totalSpend ?? 0).toFixed(2)}
                          </td>
                          <td className={`px-4 py-3 text-right font-bold ${roasColor}`}>
                            {roas.toFixed(2)}x
                          </td>
                          <td className="px-4 py-3 text-right text-foreground">
                            R$ {Number(c.avgCpa ?? 0).toFixed(2)}
                          </td>
                          <td className="px-4 py-3 text-right text-foreground">
                            {Number(c.avgCtr ?? 0).toFixed(2)}%
                          </td>
                          <td className="px-4 py-3 text-right text-foreground">
                            {Math.round(Number(c.totalConversions ?? 0))}
                          </td>
                          <td className="px-4 py-3 text-right text-muted-foreground">
                            {Number(c.totalImpressions ?? 0).toLocaleString("pt-BR")}
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
