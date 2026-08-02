import { trpc } from "@/lib/trpc";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { cardsDeTrafego, type MetricasGA4, type ListasGA4 } from "./ga4Performance";
import { fmtNumber, fmtCurrency } from "@/lib/kpiConfig";
import { KIT, KpiTile, Painel, BarrasTop, PizzaDistribuicao, TooltipInt } from "@/components/kit";

/**
 * Performance do site — versão VISUAL (mesma linha das outras páginas: recharts).
 * KPIs limpos + gráfico de tráfego diário (área) + top páginas / canais em barras
 * + bloco de e-commerce quando detectado. Substitui as listas do Resumo do Site.
 *
 * Os primitivos (Painel, BarrasTop, PizzaDistribuicao, KpiTile, VariacaoBadge)
 * vivem no kit compartilhado — aqui só o que é específico do GA4 (série diária).
 */
const PINK = KIT.pink;
// Reexporta pro Site.tsx, que ainda importa daqui.
export { Painel, BarrasTop, PizzaDistribuicao } from "@/components/kit";

export function PerformanceVisual({ accountId, periodo, m, listas }: { accountId: number; periodo: number; m: MetricasGA4 | null; listas: ListasGA4 | null }) {
  const dailyQ = trpc.ga4.dados.useQuery(
    { accountId, bloco: "daily", days: periodo }, { enabled: !!accountId, staleTime: 10 * 60_000, refetchOnWindowFocus: false },
  );
  const daily = (dailyQ.data as any[] | null) ?? [];
  const serie = daily.map((d: any) => ({ dia: (d.date ?? "").slice(5).replace("-", "/"), Sessões: Number(d.sessions ?? 0) }));
  const jan = `GA4 · ${periodo}d`;

  const cards = cardsDeTrafego(m);
  const paginas = (listas?.paginas ?? []).slice(0, 6).map((p: any) => ({ nome: p.titulo || p.url || "—", valor: Number(p.views ?? 0) }));
  const canais = (listas?.canais ?? []).slice(0, 6).map((c: any) => ({ nome: c.nome ?? "—", valor: Number(c.sessions ?? 0) }));
  const ecom = m?.ecommerce;
  const temEcom = !!m?.ecommerceDetectado && !!ecom;

  return (
    <div className="flex flex-col gap-4">
      {/* KPIs de tráfego */}
      {cards.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {cards.map((c) => <KpiTile key={c.chave} rotulo={c.rotulo} valor={c.valor} variacao={c.variacao} prevValor={c.anterior} />)}
        </div>
      )}

      {/* Gráfico de tráfego diário */}
      <Painel titulo="Sessões por dia" extra={jan}>
        {dailyQ.isLoading ? (
          <p className="text-xs text-muted-foreground py-8 text-center">Carregando…</p>
        ) : serie.length === 0 ? (
          <p className="text-xs text-muted-foreground py-8 text-center">Sem série diária do GA4 no período.</p>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={serie}>
              <defs><linearGradient id="siteSess" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={PINK} stopOpacity={0.25} /><stop offset="95%" stopColor={PINK} stopOpacity={0} /></linearGradient></defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#E8D5E0" opacity={0.5} />
              <XAxis dataKey="dia" tick={{ fontSize: 10, fill: "#666666" }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10, fill: "#666666" }} />
              <Tooltip content={<TooltipInt />} />
              <Area type="monotone" dataKey="Sessões" stroke={PINK} fill="url(#siteSess)" strokeWidth={2.5} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </Painel>

      {/* Top páginas + Canais em barras */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Painel titulo="Páginas mais vistas" extra={jan}><BarrasTop dados={paginas} /></Painel>
        <Painel titulo="Canais de aquisição" extra={jan}><BarrasTop dados={canais} /></Painel>
      </div>

      {/* E-commerce (quando detectado) */}
      {temEcom && (
        <Painel titulo="E-commerce" extra={jan}>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div><p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Receita</p><p className="text-lg font-extrabold text-emerald-600 dark:text-emerald-400">{ecom!.receita != null ? fmtCurrency(ecom!.receita) : "—"}</p></div>
            <div><p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Transações</p><p className="text-lg font-extrabold text-foreground">{fmtNumber(ecom!.transacoes ?? 0)}</p></div>
            <div><p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Ticket médio</p><p className="text-lg font-extrabold text-foreground">{ecom!.ticketMedio != null ? fmtCurrency(ecom!.ticketMedio) : "—"}</p></div>
          </div>
          <BarrasTop dados={[
            { nome: "Carrinho", valor: Number(ecom!.addToCart ?? 0) },
            { nome: "Checkout", valor: Number(ecom!.beginCheckout ?? 0) },
            { nome: "Compra", valor: Number(ecom!.purchases ?? 0) },
          ]} />
        </Painel>
      )}
    </div>
  );
}
