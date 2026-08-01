import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Loader2, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { MetricCard, CustomTooltip } from "@/pages/dashboard/atoms";
import { KPI_CONFIGS, fmtCurrency, fmtNumber, type GoalType } from "@/lib/kpiConfig";

/**
 * Aba "Google Ads" dos Detalhes por plataforma. Espelha EXATAMENTE o layout do
 * Meta (Campanhas Ativas + Destaques, KPIs adaptativos e os 2 gráficos ao final)
 * — só muda o dado. Resolve a conta Google vinculada; ao vivo (sem persistência),
 * admin/dev. Google não expõe anúncios/públicos por conta, então os Destaques
 * usam as campanhas por dois recortes (conversões / ROAS).
 */
export function GoogleAdsPane({ metaAccountId, days, goalType }: { metaAccountId: number; days: number; goalType: GoalType }) {
  const contaQ = trpc.googleAds.contaDoCliente.useQuery({ accountId: metaAccountId }, { enabled: !!metaAccountId, staleTime: 60_000 });
  const gId = contaQ.data?.id;
  const opts = { enabled: !!gId, staleTime: 5 * 60_000, refetchOnWindowFocus: false } as const;
  const sumQ = trpc.googleAds.summary.useQuery({ accountId: gId!, days }, opts);
  const campQ = trpc.googleAds.campaigns.useQuery({ accountId: gId!, days }, opts);
  const serieQ = trpc.googleAds.serieDiaria.useQuery({ accountId: gId!, days }, opts);
  const [destTab, setDestTab] = useState<"conv" | "roas">("conv");

  if (contaQ.isLoading) {
    return <div className="flex items-center gap-2 text-xs text-muted-foreground py-6 px-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Carregando Google Ads…</div>;
  }
  if (!gId) {
    return <p className="text-xs text-muted-foreground py-6 px-2">Google Ads não conectado para este cliente.</p>;
  }

  const s = sumQ.data;
  const totals = s ? {
    spend: s.spend, impressions: s.impressions, clicks: s.clicks, conversions: s.conversions,
    conversionValue: s.conversionValue, roas: s.roas, ctr: s.ctr, cpc: s.cpc,
    cpa: s.conversions > 0 ? s.spend / s.conversions : 0,
    cpm: s.impressions > 0 ? (s.spend / s.impressions) * 1000 : 0,
    reach: 0, frequency: 0,
  } : null;

  const kpiDefs = KPI_CONFIGS[goalType] ?? KPI_CONFIGS.DEFAULT;

  const camps = [...(campQ.data ?? [])].filter((c: any) => Number(c.spend ?? 0) > 0).map((c: any) => {
    const spend = Number(c.spend ?? 0);
    const val = Number(c.conversionValue ?? c.convValue ?? 0);
    return { ...c, _spend: spend, _conv: Number(c.conversions ?? 0), _val: val, _roas: spend > 0 ? val / spend : 0 };
  });
  const byConv = [...camps].sort((a, b) => b._conv - a._conv);
  const byRoas = [...camps].sort((a, b) => b._roas - a._roas);
  const dest = destTab === "conv" ? byConv : byRoas;

  const N = byConv.length;
  const tier = (i: number) => {
    if (N <= 1) return { emoji: "🟢", color: "text-emerald-400" };
    if (i < Math.ceil(N / 3)) return { emoji: "🟢", color: "text-emerald-400" };
    if (i < Math.ceil(2 * N / 3)) return { emoji: "🟡", color: "text-amber-400" };
    return { emoji: "🔴", color: "text-red-400" };
  };

  const chartMetricKey = ["SALES", "VALUE"].includes(goalType) ? "ROAS" : "Resultado";
  const fmtDia = (d: string) => { const p = d.split("-"); return p.length === 3 ? `${p[2]}/${p[1]}` : d; };
  const chartData = (serieQ.data?.dias ?? []).map((d: any) => ({
    date: fmtDia(d.dia), Gasto: d.custo, Receita: d.valorConversao, Resultado: Math.round(d.conversoes),
  }));

  return (
    <div className="space-y-6">
      {/* ─── Campanhas + Destaques ─── (mesmo layout do Meta) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Campanhas ativas */}
        <Card>
          <div className="flex items-center justify-between px-6 pt-4 pb-3">
            <div className="text-sm font-semibold flex items-center gap-2"><TrendingUp className="w-4 h-4 text-primary" />Campanhas Ativas</div>
            <Badge variant="outline" className="text-xs text-muted-foreground">{byConv.length} ativas</Badge>
          </div>
          <CardContent className="space-y-1.5">
            {campQ.isLoading ? (
              <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-11 bg-muted rounded-lg animate-pulse" />)}</div>
            ) : byConv.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhuma campanha ativa com dados no período.</p>
            ) : (
              byConv.map((c, i) => {
                const t = tier(i);
                return (
                  <div key={c.id} className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-accent/30 transition-colors">
                    <span className="text-base flex-shrink-0">{t.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{c.name}</p>
                      <p className="text-xs text-muted-foreground">{fmtCurrency(c._spend)} gasto{c._roas > 0 ? ` · ${c._roas.toFixed(2)}x ROAS` : ""}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className={`text-xs font-bold ${t.color}`}>{fmtNumber(c._conv)}</p>
                      <p className="text-xs text-muted-foreground">conv.</p>
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* Destaques do período */}
        <Card>
          <div className="flex items-center justify-between px-6 pt-4 pb-2">
            <span className="text-sm font-semibold text-foreground">Destaques do Período</span>
            <div className="flex items-center gap-1 bg-muted/40 rounded-lg p-0.5">
              {(["conv", "roas"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setDestTab(tab)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${destTab === tab ? "bg-[#E85BA8] text-white shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {tab === "conv" ? "Conversões" : "ROAS"}
                </button>
              ))}
            </div>
          </div>
          <CardContent className="space-y-1.5">
            {campQ.isLoading ? (
              <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-11 bg-muted rounded-lg animate-pulse" />)}</div>
            ) : dest.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Sem campanhas no período.</p>
            ) : (
              dest.slice(0, 5).map((c, i) => (
                <div key={c.id} className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-accent/30 transition-colors">
                  <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-bold flex-shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">{c.name}</p>
                    <p className="text-xs text-muted-foreground">{fmtNumber(c._conv)} conv. · {fmtCurrency(c._spend)} · {c._roas > 0 ? `${c._roas.toFixed(2)}x ROAS` : "—"}</p>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* ─── KPI cards adaptativos (mesmos do Meta) ─── */}
      {[kpiDefs.slice(0, 4), kpiDefs.slice(4, 8)].map((linha, li) => (
        linha.length > 0 && (
          <div key={li} className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {linha.map((kpi) => (
              <div key={kpi.key}>
                <MetricCard title={kpi.label} subtitle={kpi.subtitle} value={totals ? kpi.format(totals) : "—"} icon={kpi.icon} color={kpi.color} />
              </div>
            ))}
          </div>
        )
      ))}

      {/* ─── Os 2 gráficos ao final (iguais ao Meta) ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-border bg-card">
          <CardHeader className="pb-2 border-b border-border/30">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-bold text-foreground">Investimento Diário (R$)</CardTitle>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">Total no período</span>
                <span className="text-sm font-bold text-foreground">{fmtCurrency(totals?.spend ?? 0)}</span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={chartData}>
                <defs><linearGradient id="gadsSpendGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#E85BA8" stopOpacity={0.25} /><stop offset="95%" stopColor="#E85BA8" stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E8D5E0" opacity={0.5} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#666666" }} />
                <YAxis tick={{ fontSize: 10, fill: "#666666" }} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="Gasto" stroke="#E85BA8" fill="url(#gadsSpendGrad)" strokeWidth={2.5} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader className="pb-2 border-b border-border/30">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-bold text-foreground">{chartMetricKey === "ROAS" ? "Receita Gerada (R$)" : "Resultado Diário"}</CardTitle>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">Total no período</span>
                <span className="text-sm font-bold text-foreground">
                  {chartMetricKey === "ROAS" ? fmtCurrency(totals?.conversionValue ?? 0) : fmtNumber(totals?.conversions ?? 0)}
                </span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={chartData}>
                <defs><linearGradient id="gadsResGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#F5B8D8" stopOpacity={0.25} /><stop offset="95%" stopColor="#F5B8D8" stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E8D5E0" opacity={0.5} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#666666" }} />
                <YAxis tick={{ fontSize: 10, fill: "#666666" }} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey={chartMetricKey === "ROAS" ? "Receita" : "Resultado"} stroke="#F5B8D8" fill="url(#gadsResGrad)" strokeWidth={2.5} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
