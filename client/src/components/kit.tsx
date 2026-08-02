/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Kit de design do BIT — primitivos visuais compartilhados
 * ─────────────────────────────────────────────────────────────────────────────
 *  Fonte da verdade do "jeito Site" (as telas que o cliente mais gostou):
 *  cards com borda + rounded-xl, rosa da marca, KPIs grandes com micro-label em
 *  maiúsculas, badge de variação ▲/▼, e gráficos recharts (área/barras/donut)
 *  com um mesmo tooltip. Toda página do núcleo (Resumo, Campanhas, Site,
 *  Relatórios) deve montar suas seções com estes blocos — não reinventar estilos.
 *
 *  Extraído de site/PerformanceVisual.tsx (que agora reexporta daqui).
 */
import { type ReactNode } from "react";
import { ResponsiveContainer, BarChart, Bar, PieChart, Pie, XAxis, YAxis, Tooltip, Cell } from "recharts";
import { fmtNumber } from "@/lib/kpiConfig";

// ── Tokens ───────────────────────────────────────────────────────────────────
export const KIT = {
  pink: "#E85BA8",
  pinkSoft: "#F5ADCC",
  grid: "#E8D5E0",
  axis: "#666666",
  // Paleta categórica (donut/distribuições): rosa da marca + apoios distintos.
  paleta: ["#E85BA8", "#F59FC6", "#8B5CF6", "#F59E0B", "#10B981", "#3B82F6", "#94A3B8"],
} as const;

export type Variacao = { sobe: boolean; pct: number } | null | undefined;

// ── Tooltip padrão (inteiros formatados em pt-BR) ─────────────────────────────
export function TooltipInt({ active, payload, label, fmt }: any) {
  if (!active || !payload?.length) return null;
  const f = (fmt ?? fmtNumber) as (v: number) => string;
  return (
    <div className="bg-popover border border-border rounded-lg p-2.5 shadow-xl text-xs">
      {label != null && label !== "" && <p className="text-muted-foreground mb-1">{label}</p>}
      {payload.map((p: any) => (
        <p key={p.name} className="font-medium text-foreground">{p.name}: {f(p.value)}</p>
      ))}
    </div>
  );
}

// ── Badge de variação vs período anterior ─────────────────────────────────────
export function VariacaoBadge({ v }: { v: Variacao }) {
  if (!v) return null;
  const cor = v.sobe ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400";
  return <span className={`text-[11px] font-bold ${cor} flex-shrink-0`}>{v.sobe ? "▲" : "▼"} {Math.abs(v.pct).toFixed(0)}%</span>;
}

// ── Tile de KPI: micro-label em maiúsculas + valor grande + variação ─────────
export function KpiTile({ rotulo, valor, variacao }: { rotulo: string; valor: ReactNode; variacao?: Variacao }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold truncate">{rotulo}</p>
      <div className="flex items-baseline gap-1.5 mt-0.5">
        <span className="text-xl font-extrabold text-foreground leading-tight">{valor}</span>
        <VariacaoBadge v={variacao} />
      </div>
    </div>
  );
}

// ── Painel: card de seção com título + tag de fonte à direita ─────────────────
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

// ── Barras horizontais (rankings) ─────────────────────────────────────────────
export function BarrasTop({ dados, corLabel, fmt }: { dados: { nome: string; valor: number }[]; corLabel?: string; fmt?: (v: number) => string }) {
  if (dados.length === 0) return <p className="text-xs text-muted-foreground py-4 text-center">Sem dados no período.</p>;
  return (
    <ResponsiveContainer width="100%" height={Math.max(120, dados.length * 34)}>
      <BarChart data={dados} layout="vertical" margin={{ left: 4, right: 16, top: 0, bottom: 0 }}>
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="nome" width={140} tick={{ fontSize: 10, fill: KIT.axis }} tickFormatter={(v: string) => v.length > 22 ? `${v.slice(0, 22)}…` : v} />
        <Tooltip content={<TooltipInt fmt={fmt} />} cursor={{ fill: "rgba(232,91,168,0.06)" }} />
        <Bar dataKey="valor" radius={[0, 4, 4, 0]} name={corLabel ?? "valor"}>
          {dados.map((_, i) => <Cell key={i} fill={i === 0 ? KIT.pink : KIT.pinkSoft} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Distribuição (donut) com legenda + % ──────────────────────────────────────
// `cores` opcional para distribuições semânticas (saúde: verde/amarelo/vermelho).
export function PizzaDistribuicao({ dados, cores }: { dados: { nome: string; valor: number }[]; cores?: string[] }) {
  if (dados.length === 0) return <p className="text-xs text-muted-foreground py-4 text-center">Sem dados no período.</p>;
  const total = dados.reduce((s, d) => s + d.valor, 0) || 1;
  const cor = (i: number) => (cores ?? KIT.paleta)[i % (cores ?? KIT.paleta).length];
  return (
    <div className="flex items-center gap-3">
      <div className="w-[46%] flex-shrink-0">
        <ResponsiveContainer width="100%" height={168}>
          <PieChart>
            <Pie data={dados} dataKey="valor" nameKey="nome" innerRadius={40} outerRadius={72} paddingAngle={2} strokeWidth={0}>
              {dados.map((_, i) => <Cell key={i} fill={cor(i)} />)}
            </Pie>
            <Tooltip content={<TooltipInt />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="flex-1 min-w-0 flex flex-col gap-1.5">
        {dados.map((d, i) => (
          <li key={d.nome} className="flex items-center gap-2 text-xs">
            <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: cor(i) }} />
            <span className="text-muted-foreground truncate flex-1" title={d.nome}>{d.nome}</span>
            <span className="text-foreground font-medium flex-shrink-0 tabular-nums">{fmtNumber(d.valor)}</span>
            <span className="text-muted-foreground/60 flex-shrink-0 w-8 text-right tabular-nums">{Math.round((d.valor / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
