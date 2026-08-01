import { trpc } from "@/lib/trpc";
import { Loader2 } from "lucide-react";
import { fmtCurrency, fmtNumber, fmtPercent, fmtMultiplier } from "@/lib/kpiConfig";

/**
 * Aba "Google Ads" dos Detalhes por plataforma do Resumo. Resolve a conta Google
 * vinculada (Meta accountId → conta Google) e mostra KPIs + campanhas ativas. Ao
 * vivo (Google Ads não tem persistência); admin/dev pela natureza do dado.
 */
export function GoogleAdsPane({ metaAccountId, days }: { metaAccountId: number; days: number }) {
  const contaQ = trpc.googleAds.contaDoCliente.useQuery(
    { accountId: metaAccountId }, { enabled: !!metaAccountId, staleTime: 60_000 },
  );
  const gId = contaQ.data?.id;
  const sumQ = trpc.googleAds.summary.useQuery(
    { accountId: gId!, days }, { enabled: !!gId, staleTime: 5 * 60_000, refetchOnWindowFocus: false },
  );
  const campQ = trpc.googleAds.campaigns.useQuery(
    { accountId: gId!, days }, { enabled: !!gId, staleTime: 5 * 60_000, refetchOnWindowFocus: false },
  );

  if (contaQ.isLoading) {
    return <div className="flex items-center gap-2 text-xs text-muted-foreground py-6 px-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Carregando Google Ads…</div>;
  }
  if (!gId) {
    return <p className="text-xs text-muted-foreground py-6 px-2">Google Ads não conectado para este cliente.</p>;
  }

  const s = sumQ.data;
  const kpis: { l: string; v: string; good?: boolean }[] = [
    { l: "Investimento", v: s ? fmtCurrency(s.spend) : "—" },
    { l: "ROAS",         v: s ? fmtMultiplier(s.roas) : "—", good: (s?.roas ?? 0) >= 1 },
    { l: "Conversões",   v: s ? fmtNumber(s.conversions) : "—" },
    { l: "Valor conv.",  v: s ? fmtCurrency(s.conversionValue) : "—" },
    { l: "Impressões",   v: s ? fmtNumber(s.impressions) : "—" },
    { l: "Cliques",      v: s ? fmtNumber(s.clicks) : "—" },
    { l: "CTR",          v: s ? fmtPercent(s.ctr) : "—" },
    { l: "CPC",          v: s ? fmtCurrency(s.cpc) : "—" },
  ];

  const camps = [...(campQ.data ?? [])]
    .filter((c: any) => Number(c.spend ?? 0) > 0)
    .sort((a: any, b: any) => Number(b.conversions ?? 0) - Number(a.conversions ?? 0));

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map((k) => (
          <div key={k.l} className="rounded-xl border border-border bg-card p-3">
            <p className="text-[9.5px] uppercase tracking-wide text-muted-foreground font-semibold">{k.l}</p>
            <p className={`text-lg font-extrabold mt-0.5 ${k.good ? "text-emerald-600 dark:text-emerald-400" : "text-foreground"}`}>
              {sumQ.isLoading ? "…" : k.v}
            </p>
          </div>
        ))}
      </div>

      {/* Campanhas ativas */}
      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center gap-2 px-5 pt-4 pb-2 text-sm font-semibold">
          <span className="w-2 h-2 rounded-full" style={{ background: "#EA4335" }} />
          Campanhas ativas · Google
          <span className="ml-auto text-xs font-normal text-muted-foreground">{camps.length}</span>
        </div>
        <div className="px-4 pb-3 space-y-1">
          {campQ.isLoading ? (
            <div className="space-y-2">{[0, 1].map((i) => <div key={i} className="h-10 bg-muted rounded-lg animate-pulse" />)}</div>
          ) : camps.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhuma campanha ativa com gasto no período.</p>
          ) : (
            camps.map((c: any) => {
              const spend = Number(c.spend ?? 0);
              const conv = Number(c.conversions ?? 0);
              const val = Number(c.conversionValue ?? c.convValue ?? 0);
              const roas = spend > 0 ? val / spend : 0;
              return (
                <div key={c.id} className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-accent/30 transition-colors">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: "#EA4335" }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">{c.name}</p>
                    <p className="text-xs text-muted-foreground">{fmtCurrency(spend)} · {fmtNumber(conv)} conv</p>
                  </div>
                  {roas > 0 && <span className="text-xs font-bold text-foreground flex-shrink-0">{fmtMultiplier(roas)}</span>}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
