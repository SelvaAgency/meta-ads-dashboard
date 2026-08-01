import { type ReactNode } from "react";
import { trpc } from "@/lib/trpc";
import { ResponsiveContainer, AreaChart, Area, BarChart, Bar, PieChart, Pie, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from "recharts";
import { cardsDeTrafego, type MetricasGA4, type ListasGA4, type CardGA4 } from "./ga4Performance";
import { fmtNumber, fmtCurrency } from "@/lib/kpiConfig";

/**
 * Performance do site — versão VISUAL (mesma linha das outras páginas: recharts).
 * KPIs limpos + gráfico de tráfego diário (área) + top páginas / canais em barras
 * + bloco de e-commerce quando detectado. Substitui as listas do Resumo do Site.
 */
const PINK = "#E85BA8";
const PINK_SOFT = "#F5ADCC";
// Paleta categórica para a pizza de canais — rosa da marca + apoios distintos.
const PALETA = ["#E85BA8", "#F59FC6", "#8B5CF6", "#F59E0B", "#10B981", "#3B82F6", "#94A3B8"];

export function VariacaoBadge({ v }: { v: CardGA4["variacao"] }) {
  if (!v) return null;
  const cor = v.sobe ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400";
  return <span className={`text-[11px] font-bold ${cor} flex-shrink-0`}>{v.sobe ? "▲" : "▼"} {Math.abs(v.pct).toFixed(0)}%</span>;
}

function TooltipInt({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover border border-border rounded-lg p-2.5 shadow-xl text-xs">
      <p className="text-muted-foreground mb-1">{label}</p>
      {payload.map((p: any) => <p key={p.name} className="font-medium text-foreground">{p.name}: {fmtNumber(p.value)}</p>)}
    </div>
  );
}

export function Painel({ titulo, extra, children }: { titulo: string; extra?: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/40">
        <span className="text-sm font-bold text-foreground">{titulo}</span>
        {extra && <span className="text-[11px] text-muted-foreground">{extra}</span>}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

export function PizzaDistribuicao({ dados }: { dados: { nome: string; valor: number }[] }) {
  if (dados.length === 0) return <p className="text-xs text-muted-foreground py-4 text-center">Sem dados no período.</p>;
  const total = dados.reduce((s, d) => s + d.valor, 0) || 1;
  return (
    <div className="flex items-center gap-3">
      <div className="w-[46%] flex-shrink-0">
        <ResponsiveContainer width="100%" height={168}>
          <PieChart>
            <Pie data={dados} dataKey="valor" nameKey="nome" innerRadius={40} outerRadius={72} paddingAngle={2} strokeWidth={0}>
              {dados.map((_, i) => <Cell key={i} fill={PALETA[i % PALETA.length]} />)}
            </Pie>
            <Tooltip content={<TooltipInt />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="flex-1 min-w-0 flex flex-col gap-1.5">
        {dados.map((d, i) => (
          <li key={d.nome} className="flex items-center gap-2 text-xs">
            <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: PALETA[i % PALETA.length] }} />
            <span className="text-muted-foreground truncate flex-1" title={d.nome}>{d.nome}</span>
            <span className="text-foreground font-medium flex-shrink-0 tabular-nums">{fmtNumber(d.valor)}</span>
            <span className="text-muted-foreground/60 flex-shrink-0 w-8 text-right tabular-nums">{Math.round((d.valor / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function BarrasTop({ dados, corLabel }: { dados: { nome: string; valor: number }[]; corLabel?: string }) {
  if (dados.length === 0) return <p className="text-xs text-muted-foreground py-4 text-center">Sem dados no período.</p>;
  return (
    <ResponsiveContainer width="100%" height={Math.max(120, dados.length * 34)}>
      <BarChart data={dados} layout="vertical" margin={{ left: 4, right: 16, top: 0, bottom: 0 }}>
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="nome" width={140} tick={{ fontSize: 10, fill: "#666666" }} tickFormatter={(v: string) => v.length > 22 ? `${v.slice(0, 22)}…` : v} />
        <Tooltip content={<TooltipInt />} cursor={{ fill: "rgba(232,91,168,0.06)" }} />
        <Bar dataKey="valor" radius={[0, 4, 4, 0]} name={corLabel ?? "valor"}>
          {dados.map((_, i) => <Cell key={i} fill={i === 0 ? PINK : PINK_SOFT} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

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
          {cards.map((c) => (
            <div key={c.chave} className="rounded-xl border border-border bg-card p-3">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold truncate">{c.rotulo}</p>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <span className="text-xl font-extrabold text-foreground leading-tight">{c.valor}</span>
                <VariacaoBadge v={c.variacao} />
              </div>
            </div>
          ))}
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
