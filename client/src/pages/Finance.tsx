/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Controle Financeiro v3 (admin) — período · P&L · Clientes (MRR/churn) ·
 *  Despesas · A Receber (aging) · Gui & SELVA
 * ─────────────────────────────────────────────────────────────────────────────
 *  Restrito a admin (front + finance.* = adminProcedure). Centavos int → BRL.
 *  `mes` = 'YYYY-MM' (aritmética inteira em string, sem Date/toISOString).
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useMemo, useState, useEffect, type ReactNode } from "react";
import { HubShell } from "./hub/HubShell";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Wallet, Plus, Pencil, Trash2, Loader2, ChevronLeft, ChevronRight, ArrowLeftRight, Users, TrendingDown, AlertTriangle, CalendarClock, Repeat, Lock, Unlock } from "lucide-react";
import { ResponsiveContainer, ComposedChart, Line, BarChart, Bar, Cell, XAxis, YAxis, Tooltip, Legend, CartesianGrid, ReferenceLine, PieChart, Pie } from "recharts";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";

// ── Utils ────────────────────────────────────────────────────────────────────
const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const centsToBRL = (c: number) => BRL.format((c ?? 0) / 100);
const MES_ABBR = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const pad2 = (n: number) => String(n).padStart(2, "0");
function formatMes(mes: string): string { const [y, m] = (mes ?? "").split("-"); return `${MES_ABBR[Number(m) - 1] ?? m}/${y}`; }
// Vencimento padronizado: DD/MMM (ex.: 05/ago). Formato único em todos os meses.
function fmtVenc(venc: string | null): string { if (!venc) return "—"; const [, m, d] = venc.split("-"); return `${d}/${MES_ABBR[Number(m) - 1] ?? m}`; }
function addMonths(ymd: string, delta: number): string { const [y, m] = ymd.split("-").map(Number); const idx = y * 12 + (m - 1) + delta; return `${Math.floor(idx / 12)}-${pad2((idx % 12) + 1)}`; }
function monthsBetween(a: string, b: string): number { const [ay, am] = a.split("-").map(Number); const [by, bm] = b.split("-").map(Number); return (by * 12 + bm) - (ay * 12 + am); }
// Mês corrente no fuso da agência (sem toISOString).
function agencyCurrentMonthCli(): string { return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).format(new Date()); }
// Data de hoje YYYY-MM-DD no fuso da agência (para "atrasado").
function agencyTodayCli(): string { return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
// Estado de um lançamento: pago · a vencer · atrasado (pendente + vencimento < hoje).
type Estado = "pago" | "aVencer" | "atrasado";
function entryEstado(status: "pago" | "pendente", vencimento: string | null): Estado {
  if (status === "pago") return "pago";
  return vencimento && vencimento < agencyTodayCli() ? "atrasado" : "aVencer";
}
function parseMoneyToCents(input: string): number | null {
  let s = (input ?? "").trim().replace(/R\$|\s/g, "");
  if (!s) return null;
  const hasComma = s.includes(","), hasDot = s.includes(".");
  if (hasComma && hasDot) s = s.replace(/\./g, "").replace(",", ".");
  else if (hasComma) s = s.replace(",", ".");
  const n = Number(s);
  if (!isFinite(n)) return null;
  return Math.round(n * 100);
}
const centsToInput = (c: number) => String((c / 100).toFixed(2)).replace(".", ",");
const MES_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

const PNL_TIPOS = [
  { v: "RECEITA_RECORRENTE", label: "Receita recorrente", kind: "receita" },
  { v: "RECEITA_PONTUAL", label: "Receita pontual", kind: "receita" },
  { v: "DESPESA_RECORRENTE", label: "Despesa recorrente", kind: "despesa" },
  { v: "DESPESA_IMPOSTO", label: "Despesa imposto", kind: "despesa" },
  { v: "DESPESA_PONTUAL", label: "Despesa pontual", kind: "despesa" },
  { v: "APORTE", label: "Aporte", kind: "aporte" },
] as const;
type PnlTipo = (typeof PNL_TIPOS)[number]["v"];
const tipoLabel = (v: string) => PNL_TIPOS.find((t) => t.v === v)?.label ?? v;
const tipoKind = (v: string) => PNL_TIPOS.find((t) => t.v === v)?.kind ?? "despesa";
// Abas (leitura) da seção "Lançamentos do mês" na Visão Geral.
const LANC_TABS: { v: PnlTipo; label: string }[] = [
  { v: "RECEITA_RECORRENTE", label: "Receita recorrente" },
  { v: "RECEITA_PONTUAL", label: "Receita pontual" },
  { v: "DESPESA_RECORRENTE", label: "Folha" },
  { v: "DESPESA_IMPOSTO", label: "Imposto" },
  { v: "DESPESA_PONTUAL", label: "Despesa extra" },
];

const CATEGORIAS = [
  { v: "PLATAFORMA_ANUNCIOS", label: "Plataforma de anúncios" },
  { v: "OFFICE", label: "Office" },
  { v: "EXTRAS", label: "Extras" },
] as const;
type ReembCat = (typeof CATEGORIAS)[number]["v"];
const catLabel = (v: string) => CATEGORIAS.find((c) => c.v === v)?.label ?? v;

type Cliente = { id: number; nome: string; cor: string | null; ativo: boolean };
function textOn(hex: string | null): string {
  if (!hex) return "#111";
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? "#111" : "#fff";
}
function ClientTag({ cliente }: { cliente?: Cliente }) {
  if (!cliente) return null;
  const bg = cliente.cor ?? "#64748b";
  return <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium" style={{ background: bg, color: textOn(bg) }}>{cliente.nome}</span>;
}
function MoneyInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="R$ 0,00" inputMode="decimal" />;
}

// ── Seletor de PERÍODO (Mês/Trimestre/Semestre/Ano/Personalizado) ─────────────
type Gran = "mes" | "trimestre" | "semestre" | "ano" | "custom";
type PeriodState = { gran: Gran; anchor: string; customFrom: string; customTo: string };
function periodRange(p: PeriodState, months: string[]): { from: string; to: string; refMonth: string } {
  const maxM = months[0] ?? p.anchor, minM = months[months.length - 1] ?? p.anchor;
  const [y, m] = p.anchor.split("-").map(Number);
  let from = p.anchor, to = p.anchor;
  if (p.gran === "trimestre") { const fm = Math.floor((m - 1) / 3) * 3 + 1; from = `${y}-${pad2(fm)}`; to = `${y}-${pad2(fm + 2)}`; }
  else if (p.gran === "semestre") { const h = m <= 6 ? 1 : 7; from = `${y}-${pad2(h)}`; to = `${y}-${pad2(h + 5)}`; }
  else if (p.gran === "ano") { from = `${y}-01`; to = `${y}-12`; }
  else if (p.gran === "custom") { from = p.customFrom || minM; to = p.customTo || maxM; if (from > to) [from, to] = [to, from]; }
  const inRange = months.filter((x) => x >= from && x <= to).sort();
  return { from, to, refMonth: inRange.length ? inRange[inRange.length - 1] : to };
}
function periodLabel(p: PeriodState, from: string, to: string): string {
  if (p.gran === "mes") return formatMes(from);
  if (p.gran === "trimestre") return `Q${Math.floor((Number(from.split("-")[1]) - 1) / 3) + 1}/${from.split("-")[0]}`;
  if (p.gran === "semestre") return `S${Number(from.split("-")[1]) <= 6 ? 1 : 2}/${from.split("-")[0]}`;
  if (p.gran === "ano") return from.split("-")[0];
  return `${formatMes(from)} – ${formatMes(to)}`;
}
const GRAN_STEP: Record<Gran, number> = { mes: 1, trimestre: 3, semestre: 6, ano: 12, custom: 0 };

function PeriodBar({ period, setPeriod, months, from, to }: { period: PeriodState; setPeriod: (p: PeriodState) => void; months: string[]; from: string; to: string }) {
  const years = Array.from(new Set(months.map((m) => m.split("-")[0]))).sort().reverse();
  const shift = (dir: number) => {
    if (period.gran === "custom") { const span = Math.max(1, monthsBetween(from, to) + 1); setPeriod({ ...period, customFrom: addMonths(from, dir * span), customTo: addMonths(to, dir * span) }); }
    else setPeriod({ ...period, anchor: addMonths(period.anchor, dir * GRAN_STEP[period.gran]) });
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={period.gran} onValueChange={(g) => setPeriod({ ...period, gran: g as Gran })}>
        <SelectTrigger className="h-8 w-[136px]"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="mes">Mês</SelectItem><SelectItem value="trimestre">Trimestre</SelectItem>
          <SelectItem value="semestre">Semestre</SelectItem><SelectItem value="ano">Ano</SelectItem>
          <SelectItem value="custom">Personalizado</SelectItem>
        </SelectContent>
      </Select>
      {period.gran === "custom" ? (
        <div className="flex items-center gap-1">
          <Input value={period.customFrom} onChange={(e) => setPeriod({ ...period, customFrom: e.target.value })} placeholder="2026-01" className="h-8 w-[92px]" />
          <span className="text-muted-foreground text-xs">até</span>
          <Input value={period.customTo} onChange={(e) => setPeriod({ ...period, customTo: e.target.value })} placeholder="2026-06" className="h-8 w-[92px]" />
        </div>
      ) : (
        <>
          <button onClick={() => shift(-1)} className="p-1.5 rounded-md hover:bg-accent/30" title="Anterior"><ChevronLeft className="w-4 h-4" /></button>
          <span className="text-base font-semibold min-w-[112px] text-center tabular-nums">{periodLabel(period, from, to)}</span>
          <button onClick={() => shift(1)} className="p-1.5 rounded-md hover:bg-accent/30" title="Próximo"><ChevronRight className="w-4 h-4" /></button>
          <Select value={period.anchor.split("-")[0]} onValueChange={(yy) => setPeriod({ ...period, anchor: `${yy}-${period.anchor.split("-")[1]}` })}>
            <SelectTrigger className="h-8 w-[84px] ml-1"><SelectValue /></SelectTrigger>
            <SelectContent>{years.map((yy) => <SelectItem key={yy} value={yy}>{yy}</SelectItem>)}</SelectContent>
          </Select>
        </>
      )}
    </div>
  );
}
// Nav simples de mês (Gui & SELVA).
function MonthNav({ mes, onChange, months }: { mes: string; onChange: (m: string) => void; months: string[] }) {
  const min = months.length ? months[months.length - 1] : mes, max = months.length ? months[0] : mes;
  const go = (d: number) => { const n = addMonths(mes, d); if (n >= min && n <= max) onChange(n); };
  return (
    <div className="flex items-center gap-2">
      <button onClick={() => go(-1)} disabled={mes <= min} className="p-1.5 rounded-md hover:bg-accent/30 disabled:opacity-30 disabled:pointer-events-none"><ChevronLeft className="w-4 h-4" /></button>
      <span className="text-base font-semibold min-w-[92px] text-center tabular-nums">{formatMes(mes)}</span>
      <button onClick={() => go(1)} disabled={mes >= max} className="p-1.5 rounded-md hover:bg-accent/30 disabled:opacity-30 disabled:pointer-events-none"><ChevronRight className="w-4 h-4" /></button>
    </div>
  );
}

// ── Charts (linha RETA ponto-a-ponto — sem spline) ───────────────────────────
type TrendPoint = { mes: string; receitaCents: number; despesaCents: number; resultadoCents: number; receitaRecorrenteCents: number; receitaPontualCents: number; receitaPagoCents: number; despesaPagoCents: number };
const axisFmt = (v: number) => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : `${v}`);
const tipTxt = (v: number) => centsToBRL(v * 100);
// v5 — ponto de série histórica (mensal ou anual).
type SeriePoint = { periodo: string; receitaCents: number; despesaCents: number; resultadoCents: number; mrrCents: number; recorrenteCents: number; pontualCents: number; receitaPagoCents: number; despesaPagoCents: number; parcial: boolean; realizado: boolean };
type Janela = "12m" | "24m" | "vitalicio";
type SerieGran = "mensal" | "anual";
// rótulo do eixo: mês → "jul/26"; ano → "2025" (parcial marca "*").
const fmtPeriodo = (p: string, parcial: boolean) => (p.length === 4 ? (parcial ? `${p}*` : p) : formatMes(p));
// Confirmado × previsto: mês/ano ANTERIOR ao atual = realizado (cheio); atual/futuro = previsto (apagado).
const isPeriodoConfirmado = (periodo: string) => { const cur = agencyCurrentMonthCli(); return periodo.length === 4 ? periodo < cur.slice(0, 4) : periodo < cur; };
const CONF_LEGEND = "linha cheia = confirmado (realizado) · tracejado claro = previsto";
const CONF_LEGEND_BAR = "barras cheias = confirmado · claras = previsto (mês atual/futuro)";

function TrendChart({ pontos, destaque }: { pontos: SeriePoint[]; destaque?: string }) {
  let lastConf = -1;
  pontos.forEach((t, i) => { if (isPeriodoConfirmado(t.periodo)) lastConf = i; });
  const marcador = destaque ? pontos.find((t) => t.periodo === destaque) : undefined;
  const marcadorLbl = marcador ? fmtPeriodo(marcador.periodo, marcador.parcial) : undefined;
  const d = pontos.map((t, i) => {
    const conf = i <= lastConf, prev = i >= lastConf;
    return {
      lbl: fmtPeriodo(t.periodo, t.parcial),
      Receita: conf ? t.receitaCents / 100 : null, "Receita prev": prev ? t.receitaCents / 100 : null,
      Despesa: conf ? t.despesaCents / 100 : null, "Despesa prev": prev ? t.despesaCents / 100 : null,
      Resultado: conf ? t.resultadoCents / 100 : null, "Resultado prev": prev ? t.resultadoCents / 100 : null,
    };
  });
  const legendPayload = [{ value: "Receita", type: "line" as const, color: "#16A34A" }, { value: "Despesa", type: "line" as const, color: "#DC2626" }, { value: "Resultado", type: "line" as const, color: "#2563EB" }];
  return (
    <div>
      <ResponsiveContainer width="100%" height={210}>
        <ComposedChart data={d} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
          <XAxis dataKey="lbl" tick={{ fontSize: 11 }} /><YAxis tickFormatter={axisFmt} tick={{ fontSize: 11 }} width={40} />
          <Tooltip formatter={(v: number, n: string) => [tipTxt(v), String(n).replace(" prev", " (prev)")]} /><Legend wrapperStyle={{ fontSize: 12 }} payload={legendPayload} />
          {marcadorLbl && <ReferenceLine x={marcadorLbl} stroke="#6366F1" strokeDasharray="2 2" label={{ value: marcadorLbl, position: "top", fontSize: 10, fill: "#6366F1" }} />}
          <Line type="linear" dataKey="Receita" stroke="#16A34A" strokeWidth={2} dot={{ r: 2 }} connectNulls={false} />
          <Line type="linear" dataKey="Receita prev" stroke="#16A34A" strokeWidth={2} strokeOpacity={0.4} strokeDasharray="5 4" dot={false} connectNulls={false} legendType="none" />
          <Line type="linear" dataKey="Despesa" stroke="#DC2626" strokeWidth={2} dot={{ r: 2 }} connectNulls={false} />
          <Line type="linear" dataKey="Despesa prev" stroke="#DC2626" strokeWidth={2} strokeOpacity={0.4} strokeDasharray="5 4" dot={false} connectNulls={false} legendType="none" />
          <Line type="linear" dataKey="Resultado" stroke="#2563EB" strokeWidth={2} dot={{ r: 2 }} connectNulls={false} />
          <Line type="linear" dataKey="Resultado prev" stroke="#2563EB" strokeWidth={2} strokeOpacity={0.4} strokeDasharray="5 4" dot={false} connectNulls={false} legendType="none" />
        </ComposedChart>
      </ResponsiveContainer>
      <p className="text-[10px] text-muted-foreground text-center">{CONF_LEGEND}</p>
    </div>
  );
}
function MixChart({ pontos }: { pontos: SeriePoint[] }) {
  const d = pontos.map((t) => ({ lbl: fmtPeriodo(t.periodo, t.parcial), Recorrente: t.recorrenteCents / 100, Pontual: t.pontualCents / 100, conf: isPeriodoConfirmado(t.periodo) }));
  return (
    <div>
      <ResponsiveContainer width="100%" height={210}>
        <BarChart data={d} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
          <XAxis dataKey="lbl" tick={{ fontSize: 11 }} /><YAxis tickFormatter={axisFmt} tick={{ fontSize: 11 }} width={40} />
          <Tooltip formatter={(v: number) => tipTxt(v)} /><Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="Recorrente" stackId="r" fill="#3B54E6">{d.map((e, i) => <Cell key={i} fillOpacity={e.conf ? 1 : 0.4} />)}</Bar>
          <Bar dataKey="Pontual" stackId="r" fill="#EF701B">{d.map((e, i) => <Cell key={i} fillOpacity={e.conf ? 1 : 0.4} />)}</Bar>
        </BarChart>
      </ResponsiveContainer>
      <p className="text-[10px] text-muted-foreground text-center">{CONF_LEGEND_BAR}</p>
    </div>
  );
}
function MrrChart({ pontos, campo = "mrr", destaque }: { pontos: SeriePoint[]; campo?: "mrr" | "pontual"; destaque?: string }) {
  const conf = campo === "pontual"
    ? { key: "Pontual", color: "#EF701B", val: (t: SeriePoint) => t.pontualCents }
    : { key: "MRR", color: "#3B54E6", val: (t: SeriePoint) => t.mrrCents };
  let lastConf = -1;
  pontos.forEach((t, i) => { if (isPeriodoConfirmado(t.periodo)) lastConf = i; });
  const marcador = destaque ? pontos.find((t) => t.periodo === destaque) : undefined;
  const marcadorLbl = marcador ? fmtPeriodo(marcador.periodo, marcador.parcial) : undefined;
  const d = pontos.map((t, i) => ({ lbl: fmtPeriodo(t.periodo, t.parcial), [conf.key]: i <= lastConf ? conf.val(t) / 100 : null, [`${conf.key} prev`]: i >= lastConf ? conf.val(t) / 100 : null }));
  return (
    <div>
      <ResponsiveContainer width="100%" height={190}>
        <ComposedChart data={d} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
          <XAxis dataKey="lbl" tick={{ fontSize: 11 }} /><YAxis tickFormatter={axisFmt} tick={{ fontSize: 11 }} width={40} />
          <Tooltip formatter={(v: number, n: string) => [tipTxt(v), String(n).replace(" prev", " (prev)")]} />
          {marcadorLbl && <ReferenceLine x={marcadorLbl} stroke="#6366F1" strokeDasharray="2 2" label={{ value: marcadorLbl, position: "top", fontSize: 10, fill: "#6366F1" }} />}
          <Line type="linear" dataKey={conf.key} stroke={conf.color} strokeWidth={2} dot={{ r: 2 }} connectNulls={false} />
          <Line type="linear" dataKey={`${conf.key} prev`} stroke={conf.color} strokeWidth={2} strokeOpacity={0.4} strokeDasharray="5 4" dot={false} connectNulls={false} />
        </ComposedChart>
      </ResponsiveContainer>
      <p className="text-[10px] text-muted-foreground text-center">{CONF_LEGEND}</p>
    </div>
  );
}
// Movimento da base: variação líquida do MRR mês a mês (novos+expansão − churn−contração).
function MovimentoChart({ pontos, destaque }: { pontos: SeriePoint[]; destaque?: string }) {
  const marcador = destaque ? pontos.find((t) => t.periodo === destaque) : undefined;
  const marcadorLbl = marcador ? fmtPeriodo(marcador.periodo, marcador.parcial) : undefined;
  const d = pontos.map((t, i) => ({ lbl: fmtPeriodo(t.periodo, t.parcial), delta: i > 0 ? (t.recorrenteCents - pontos[i - 1].recorrenteCents) / 100 : 0 }));
  return (
    <div>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={d} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
          <XAxis dataKey="lbl" tick={{ fontSize: 11 }} /><YAxis tickFormatter={axisFmt} tick={{ fontSize: 11 }} width={40} />
          <Tooltip formatter={(v: number) => tipTxt(v)} />
          {marcadorLbl && <ReferenceLine x={marcadorLbl} stroke="#6366F1" strokeDasharray="2 2" />}
          <ReferenceLine y={0} stroke="#94a3b8" />
          <Bar dataKey="delta" name="Δ MRR">{d.map((e, i) => <Cell key={i} fill={e.delta >= 0 ? "#16A34A" : "#DC2626"} />)}</Bar>
        </BarChart>
      </ResponsiveContainer>
      <p className="text-[10px] text-muted-foreground text-center">variação líquida do MRR (verde = cresceu · vermelho = encolheu)</p>
    </div>
  );
}
// Donut de concentração da receita por cliente (top fatias + "demais").
const DONUT_CORES = ["#3B54E6", "#16A34A", "#EF701B", "#9333EA", "#0EA5E9", "#94a3b8"];
function ConcentracaoDonut({ data }: { data: { nome: string; totalCents: number }[] }) {
  const total = data.reduce((s, x) => s + x.totalCents, 0);
  const top = data.slice(0, 5);
  const demais = data.slice(5).reduce((s, x) => s + x.totalCents, 0);
  const fatias = [...top.map((x, i) => ({ nome: x.nome, v: x.totalCents / 100, cor: DONUT_CORES[i] })), ...(demais > 0 ? [{ nome: "Demais", v: demais / 100, cor: DONUT_CORES[5] }] : [])];
  const top3pct = total > 0 ? Math.round((data.slice(0, 3).reduce((s, x) => s + x.totalCents, 0) / total) * 100) : 0;
  if (total === 0) return <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">Sem receita no período.</div>;
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div className="relative" style={{ width: 160, height: 160 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={fatias} dataKey="v" nameKey="nome" innerRadius={52} outerRadius={76} paddingAngle={1} strokeWidth={0}>
              {fatias.map((f, i) => <Cell key={i} fill={f.cor} />)}
            </Pie>
            <Tooltip
              allowEscapeViewBox={{ x: true, y: true }}
              wrapperStyle={{ zIndex: 60, outline: "none" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as { nome: string; v: number; cor: string };
                const totalV = fatias.reduce((s, x) => s + x.v, 0);
                const pct = totalV ? Math.round((p.v / totalV) * 100) : 0;
                return (
                  <div className="rounded-md border border-border bg-popover px-2.5 py-1.5 shadow-lg text-xs">
                    <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: p.cor }} /><span className="font-medium text-foreground">{p.nome}</span></div>
                    <div className="text-muted-foreground tabular-nums mt-0.5">{centsToBRL(Math.round(p.v * 100))} · {pct}%</div>
                  </div>
                );
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none" style={{ zIndex: 1 }}>
          <span className="text-lg font-bold tabular-nums">{top3pct}%</span>
          <span className="text-[10px] text-muted-foreground">top 3</span>
        </div>
      </div>
      <div className="flex-1 min-w-[140px] space-y-1">
        {fatias.map((f, i) => (
          <div key={i} className="flex items-center justify-between gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 min-w-0"><span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: f.cor }} /><span className="truncate">{f.nome}</span></span>
            <span className="tabular-nums text-muted-foreground">{Math.round((f.v * 100 / (total / 100)))}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
// Mini-barra visual (para Média/mês na tabela de qualidade).
function MiniBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2 justify-end">
      <span className="tabular-nums font-medium">{centsToBRL(value)}</span>
      <span className="h-1.5 w-14 rounded-full bg-muted overflow-hidden hidden sm:inline-block"><span className="block h-full bg-accent" style={{ width: `${pct}%` }} /></span>
    </div>
  );
}
// Controle compartilhado: janela (12m/24m/vitalício) + granularidade (mensal/anual).
function SerieControls({ janela, setJanela, gran, setGran }: { janela: Janela; setJanela: (j: Janela) => void; gran: SerieGran; setGran: (g: SerieGran) => void }) {
  return (
    <div className="flex items-center gap-1">
      <Select value={janela} onValueChange={(v) => setJanela(v as Janela)}>
        <SelectTrigger className="h-7 w-[108px] text-xs"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="12m">12 meses</SelectItem><SelectItem value="24m">24 meses</SelectItem><SelectItem value="vitalicio">Vitalício</SelectItem></SelectContent>
      </Select>
      <Select value={gran} onValueChange={(v) => setGran(v as SerieGran)}>
        <SelectTrigger className="h-7 w-[92px] text-xs"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="mensal">Mensal</SelectItem><SelectItem value="anual">Anual</SelectItem></SelectContent>
      </Select>
    </div>
  );
}
function DespesaStackChart({ serie, destaque }: { serie: { mes: string; recorrenteCents: number; impostoCents: number; pontualCents: number }[]; destaque?: string }) {
  const cur = agencyCurrentMonthCli();
  const d = serie.map((s) => ({ mes: formatMes(s.mes), Recorrente: s.recorrenteCents / 100, Imposto: s.impostoCents / 100, Pontual: s.pontualCents / 100, conf: s.mes < cur }));
  const marcadorLbl = destaque ? serie.find((s) => s.mes === destaque)?.mes : undefined;
  return (
    <div>
      <ResponsiveContainer width="100%" height={230}>
        <BarChart data={d} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
          <XAxis dataKey="mes" tick={{ fontSize: 11 }} /><YAxis tickFormatter={axisFmt} tick={{ fontSize: 11 }} width={40} />
          <Tooltip formatter={(v: number) => tipTxt(v)} /><Legend wrapperStyle={{ fontSize: 12 }} />
          {marcadorLbl && <ReferenceLine x={formatMes(marcadorLbl)} stroke="#6366F1" strokeDasharray="2 2" label={{ value: formatMes(marcadorLbl), position: "top", fontSize: 10, fill: "#6366F1" }} />}
          <Bar dataKey="Recorrente" stackId="d" fill="#DC2626">{d.map((e, i) => <Cell key={i} fillOpacity={e.conf ? 1 : 0.4} />)}</Bar>
          <Bar dataKey="Imposto" stackId="d" fill="#D97706">{d.map((e, i) => <Cell key={i} fillOpacity={e.conf ? 1 : 0.4} />)}</Bar>
          <Bar dataKey="Pontual" stackId="d" fill="#9333EA">{d.map((e, i) => <Cell key={i} fillOpacity={e.conf ? 1 : 0.4} />)}</Bar>
        </BarChart>
      </ResponsiveContainer>
      <p className="text-[10px] text-muted-foreground text-center">{CONF_LEGEND_BAR}</p>
    </div>
  );
}

function ChurnBarChart({ serie }: { serie: { mes: string; mrrPerdidoCents: number }[] }) {
  const d = serie.map((s) => ({ mes: formatMes(s.mes), "MRR perdido": s.mrrPerdidoCents / 100 }));
  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={d} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
        <XAxis dataKey="mes" tick={{ fontSize: 11 }} /><YAxis tickFormatter={axisFmt} tick={{ fontSize: 11 }} width={40} />
        <Tooltip formatter={(v: number) => tipTxt(v)} />
        <Bar dataKey="MRR perdido" fill="#DC2626" />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Autocomplete de cliente ──────────────────────────────────────────────────
function ClienteSelect({ value, onChange, clientes }: { value: number | null; onChange: (id: number | null) => void; clientes: Cliente[] }) {
  const utils = trpc.useUtils();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const create = trpc.finance.clientes.create.useMutation({ onSuccess: (c) => { utils.finance.clientes.list.invalidate(); onChange(c.id); setOpen(false); setQ(""); toast.success("Cliente criado."); } });
  const sel = clientes.find((c) => c.id === value);
  const filtered = clientes.filter((c) => !q || c.nome.toLowerCase().includes(q.toLowerCase()));
  const exact = clientes.some((c) => c.nome.toLowerCase() === q.trim().toLowerCase());
  return (
    <div className="relative">
      <Input value={open ? q : (sel?.nome ?? "")} placeholder="Buscar ou criar cliente…" onFocus={() => { setOpen(true); setQ(""); }} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onBlur={() => setTimeout(() => setOpen(false), 150)} />
      {open && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-56 overflow-y-auto rounded-md border border-border bg-popover shadow-md py-1">
          {value != null && <button className="w-full text-left px-3 py-1.5 text-xs text-muted-foreground hover:bg-primary/10" onMouseDown={() => { onChange(null); setOpen(false); }}>— sem cliente —</button>}
          {filtered.slice(0, 40).map((c) => (
            <button key={c.id} className="w-full text-left px-3 py-1.5 text-sm hover:bg-primary/10 flex items-center gap-2" onMouseDown={() => { onChange(c.id); setOpen(false); }}>
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: c.cor ?? "#64748b" }} /> {c.nome}
            </button>
          ))}
          {q.trim() && !exact && <button className="w-full text-left px-3 py-1.5 text-sm text-accent hover:bg-primary/10" disabled={create.isPending} onMouseDown={() => create.mutate({ nome: q.trim() })}>{create.isPending ? "Criando…" : `+ Criar "${q.trim()}"`}</button>}
        </div>
      )}
    </div>
  );
}

// ── Pequenos componentes ─────────────────────────────────────────────────────
function Stat({ label, value, tone, hint }: { label: string; value: string; tone?: "pos" | "neg" | "warn"; hint?: string }) {
  const color = tone === "pos" ? "text-emerald-600" : tone === "neg" ? "text-red-600" : tone === "warn" ? "text-amber-600" : "text-foreground";
  return <Card><CardContent className="p-3"><p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p><p className={`text-lg font-bold ${color}`}>{value}</p>{hint && <p className="text-[10px] text-muted-foreground mt-0.5">{hint}</p>}</CardContent></Card>;
}
function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return <div className={`flex flex-col gap-1.5 ${full ? "sm:col-span-2" : ""}`}><Label className="text-xs">{label}</Label>{children}</div>;
}
function FilterSelect({ label, value, onChange, options, format, allLabel }: { label: string; value: string; onChange: (v: string) => void; options: string[]; format: (v: string) => string; allLabel: string }) {
  const ALL = "__all__";
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      <Select value={value || ALL} onValueChange={(v) => onChange(v === ALL ? "" : v)}>
        <SelectTrigger className="h-9 w-[150px]"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value={ALL}>{allLabel}</SelectItem>{options.map((o) => <SelectItem key={o} value={o}>{format(o)}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
}
function RowActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="inline-flex items-center gap-1">
      <button onClick={onEdit} className="p-1.5 text-muted-foreground hover:text-foreground" title="Editar"><Pencil className="w-4 h-4" /></button>
      {confirm ? <span className="inline-flex items-center gap-1"><button onClick={() => { onDelete(); setConfirm(false); }} className="text-xs text-red-600 font-medium">Confirmar</button><button onClick={() => setConfirm(false)} className="text-xs text-muted-foreground">cancelar</button></span>
        : <button onClick={() => setConfirm(true)} className="p-1.5 text-muted-foreground hover:text-destructive" title="Excluir"><Trash2 className="w-4 h-4" /></button>}
    </div>
  );
}
const defaultPeriod = (anchor: string): PeriodState => ({ gran: "mes", anchor, customFrom: anchor, customTo: anchor });

// ═════════════════════════════════════════════════════════════════════════════
//  Componentes compartilhados do redesign (Fase 1)
// ═════════════════════════════════════════════════════════════════════════════
/** Chip de status pago/pendente (clicável) + selo "Remarcado" + cadeado (mês fechado). */
const ESTADO_CLS: Record<Estado, string> = {
  pago: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  aVencer: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  atrasado: "bg-red-500/15 text-red-600 border-red-500/30",
};
const ESTADO_LABEL: Record<Estado, string> = { pago: "Pago", aVencer: "A vencer", atrasado: "Atrasado" };
function StatusChip({ status, vencimento, remarcado, locked, onToggle }: { status: "pago" | "pendente"; vencimento?: string | null; remarcado?: boolean; locked?: boolean; onToggle?: () => void }) {
  const est = entryEstado(status, vencimento ?? null);
  const chip = <Badge className={ESTADO_CLS[est]}>{ESTADO_LABEL[est]}</Badge>;
  return (
    <span className="inline-flex items-center gap-1">
      {onToggle && !locked ? <button onClick={onToggle} title="Alternar pago/pendente">{chip}</button> : <span title={locked ? "Mês fechado" : undefined} className={locked ? "opacity-80" : ""}>{chip}</span>}
      {remarcado && <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30 text-[9px] px-1">Remarcado</Badge>}
    </span>
  );
}

/** Barra de status empilhada (pago · a vencer · atrasado) + legenda com valores. */
function StatusBar({ pago, aVencer, atrasado }: { pago: number; aVencer: number; atrasado: number }) {
  const total = Math.max(1, pago + aVencer + atrasado);
  const seg = (v: number, cls: string) => v > 0 ? <div className={cls} style={{ width: `${(v / total) * 100}%` }} /> : null;
  const item = (label: string, v: number, dot: string) => <span className="inline-flex items-center gap-1"><span className={`w-2 h-2 rounded-full ${dot}`} />{label} <span className="tabular-nums font-medium">{centsToBRL(v)}</span></span>;
  return (
    <div>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
        {seg(pago, "bg-emerald-500")}{seg(aVencer, "bg-amber-500")}{seg(atrasado, "bg-red-500")}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
        {item("Pago", pago, "bg-emerald-500")}{aVencer > 0 && item("A vencer", aVencer, "bg-amber-500")}{atrasado > 0 && item("Atrasado", atrasado, "bg-red-500")}
      </div>
    </div>
  );
}

/** Delta vs média 6m (seta + %). higherIsBetter=false p/ despesa (subir = ruim). */
function Delta({ value, media, higherIsBetter = true }: { value: number; media: number; higherIsBetter?: boolean }) {
  if (!media) return <span className="text-[11px] text-muted-foreground">vs média 6m: —</span>;
  const pct = Math.round(((value - media) / media) * 100);
  const up = pct >= 0;
  const good = higherIsBetter ? up : !up;
  return <span className={`text-[11px] font-medium ${pct === 0 ? "text-muted-foreground" : good ? "text-emerald-600" : "text-red-600"}`}>{up ? "▲" : "▼"} {Math.abs(pct)}% <span className="font-normal text-muted-foreground">vs média 6m</span></span>;
}

/** Card de categoria colapsável (acordeão nativo). */
function CategoriaCard({ label, count, totalCents, tone, children }: { label: string; count: number; totalCents: number; tone?: "pos" | "neg"; children: ReactNode }) {
  return (
    <details className="rounded-lg border border-border group">
      <summary className="flex items-center justify-between gap-2 px-3 py-2 cursor-pointer list-none select-none hover:bg-accent/5">
        <span className="flex items-center gap-2 text-sm"><ChevronRight className="w-4 h-4 text-muted-foreground transition group-open:rotate-90" /> {label} <Badge variant="secondary" className="font-normal">{count}</Badge></span>
        <span className={`tabular-nums font-semibold ${tone === "neg" ? "text-red-600" : tone === "pos" ? "text-emerald-600" : ""}`}>{centsToBRL(totalCents)}</span>
      </summary>
      <div className="border-t border-border">{children}</div>
    </details>
  );
}

/** Menu único "+ Novo" — Receita avulsa · Despesa avulsa · Projeto parcelado. */
function NovoMenu({ onReceita, onDespesa, onProjeto, disabled, title }: { onReceita: () => void; onDespesa: () => void; onProjeto: () => void; disabled?: boolean; title?: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" disabled={disabled} title={title}><Plus className="w-4 h-4 mr-1" /> Novo</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel>Adicionar lançamento</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onReceita}><span className="w-2 h-2 rounded-full bg-emerald-500 mr-2" /> Receita avulsa</DropdownMenuItem>
        <DropdownMenuItem onClick={onDespesa}><span className="w-2 h-2 rounded-full bg-red-500 mr-2" /> Despesa avulsa</DropdownMenuItem>
        <DropdownMenuItem onClick={onProjeto}><span className="w-2 h-2 rounded-full bg-purple-500 mr-2" /> Projeto parcelado</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Par realizado × previsto compacto (para cards que somam pago vs pendente). */
function BiValue({ real, prev }: { real: number; prev: number }) {
  return <span className="text-[11px] text-muted-foreground">real {centsToBRL(real)} · prev {centsToBRL(prev)}</span>;
}

/** Card secundário clicável (drill). */
function DrillCard({ label, value, hint, tone, onClick }: { label: string; value: string; hint?: ReactNode; tone?: "pos" | "neg" | "warn"; onClick?: () => void }) {
  const toneCls = tone === "pos" ? "text-emerald-600" : tone === "neg" ? "text-red-600" : tone === "warn" ? "text-amber-600" : "";
  return (
    <button onClick={onClick} disabled={!onClick} className={`text-left rounded-xl border border-border bg-card p-3 transition ${onClick ? "hover:border-accent/50 hover:bg-accent/5 cursor-pointer" : "cursor-default"}`}>
      <div className="flex items-center justify-between"><span className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>{onClick && <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}</div>
      <div className={`text-lg font-bold tabular-nums mt-0.5 ${toneCls}`}>{value}</div>
      {hint && <div className="mt-0.5">{hint}</div>}
    </button>
  );
}

/** Linha genérica dos hubs (receita/despesa) — nome, valor, vencimento, status, ações. */
type HubRow = { key: string; nome: ReactNode; sub?: ReactNode; valorCents: number; vencInfo?: ReactNode; vencimento?: string | null; status: "pago" | "pendente" | null; estadoChip?: ReactNode; locked?: boolean; onToggle?: () => void; actions?: ReactNode };
/** Tabela acionável reutilizável pros dois hubs (Clientes&Projetos ↔ Despesas). */
function HubTable({ rows, nomeLabel = "Nome", valorLabel = "Valor", vencLabel = "Vencimento", loading, emptyMsg }: { rows: HubRow[]; nomeLabel?: string; valorLabel?: string; vencLabel?: string; loading?: boolean; emptyMsg?: string }) {
  return (
    <div className="rounded-md border border-border overflow-x-auto">
      <Table>
        <TableHeader><TableRow>
          <TableHead>{nomeLabel}</TableHead>
          <TableHead className="text-right">{valorLabel}</TableHead>
          <TableHead>{vencLabel}</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Ações</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {loading && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6"><Loader2 className="w-4 h-4 animate-spin inline" /> Carregando…</TableCell></TableRow>}
          {!loading && rows.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">{emptyMsg ?? "Nada aqui."}</TableCell></TableRow>}
          {rows.map((r) => (
            <TableRow key={r.key}>
              <TableCell><div className="flex flex-col"><span>{r.nome}</span>{r.sub && <span className="text-[10px] text-muted-foreground">{r.sub}</span>}</div></TableCell>
              <TableCell className="text-right whitespace-nowrap font-medium tabular-nums">{centsToBRL(r.valorCents)}</TableCell>
              <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{r.vencInfo ?? "—"}</TableCell>
              <TableCell>{r.estadoChip ?? (r.status ? <StatusChip status={r.status} vencimento={r.vencimento} locked={r.locked} onToggle={r.onToggle} /> : <span className="text-xs text-muted-foreground">—</span>)}</TableCell>
              <TableCell className="text-right whitespace-nowrap">{r.locked ? <Lock className="w-3.5 h-3.5 text-muted-foreground inline" /> : (r.actions ?? null)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/** Editor reutilizável de lançamento pontual/avulso (descrição · valor · vencimento). */
type EditPon = { id: number; descricao: string; valorCents: number; vencimento: string | null };
function EditPontualDialog({ entry, onClose, onSaved, label = "lançamento" }: { entry: EditPon | null; onClose: () => void; onSaved: () => void; label?: string }) {
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [venc, setVenc] = useState("");
  useEffect(() => { if (entry) { setDescricao(entry.descricao); setValor(centsToInput(entry.valorCents)); setVenc(entry.vencimento ?? ""); } }, [entry]);
  const update = trpc.finance.pnl.update.useMutation();
  const remarcar = trpc.finance.pnl.remarcar.useMutation();
  const save = async () => {
    if (!entry) return;
    if (!descricao.trim()) return toast.error("Informe a descrição.");
    const c = parseMoneyToCents(valor);
    if (c == null || c <= 0) return toast.error("Valor inválido.");
    if (venc && !/^\d{4}-\d{2}-\d{2}$/.test(venc)) return toast.error("Data inválida (YYYY-MM-DD).");
    try {
      await update.mutateAsync({ id: entry.id, descricao: descricao.trim(), valorCents: c });
      if (venc && venc !== (entry.vencimento ?? "")) await remarcar.mutateAsync({ id: entry.id, vencimento: venc });
      onSaved(); onClose(); toast.success("Lançamento atualizado.");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Falha ao salvar."); }
  };
  return (
    <Dialog open={!!entry} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Editar {label}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Field label="Descrição" full><Input value={descricao} onChange={(e) => setDescricao(e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Valor"><MoneyInput value={valor} onChange={setValor} /></Field>
            <Field label="Vencimento"><Input type="date" value={venc} onChange={(e) => setVenc(e.target.value)} /></Field>
          </div>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={save} disabled={update.isPending || remarcar.isPending}>Salvar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Card de bloco de gráfico com título + controles de janela/granularidade. */
function ChartCard({ title, hint, controls, children }: { title: string; hint?: string; controls?: ReactNode; children: ReactNode }) {
  return (
    <Card><CardContent className="p-3">
      <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
        <div><p className="text-xs font-semibold text-muted-foreground">{title}</p>{hint && <p className="text-[10px] text-muted-foreground/80">{hint}</p>}</div>
        {controls}
      </div>
      {children}
    </CardContent></Card>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  Aba P&L
// ═════════════════════════════════════════════════════════════════════════════
type PnlRow = { id: number; mes: string; tipo: string; descricao: string; valorCents: number; status: "pago" | "pendente"; clienteId: number | null; vencimento: string | null; vencimentoOriginal: string | null; origem: "MANUAL" | "RECORRENCIA" | "PROJETO"; parcelaNum: number | null; parcelaTotal: number | null };
type PnlForm = { id?: number; mes: string; tipo: PnlTipo; descricao: string; valor: string; status: "pago" | "pendente"; clienteId: number | null; vencimento: string };
type ProjParcela = { valor: string; vencimento: string };
type ProjForm = { clienteId: number | null; nome: string; parcelas: ProjParcela[] };

function PnlTab({ months, clientes, clienteById, onNavigate }: { months: string[]; clientes: Cliente[]; clienteById: Map<number, Cliente>; onNavigate?: (tab: string, opts?: { period?: PeriodState; sub?: string }) => void }) {
  const utils = trpc.useUtils();
  const [period, setPeriod] = useState<PeriodState>(defaultPeriod(agencyCurrentMonthCli()));
  const { from, to, refMonth } = periodRange(period, months);
  const [status, setStatus] = useState(""); const [clienteFilter, setClienteFilter] = useState<number | "">("");
  const [showAging, setShowAging] = useState(false);

  const resumoQ = trpc.finance.overview.resumo.useQuery({ mesFrom: from, mesTo: to }, { enabled: MES_RE.test(from) && MES_RE.test(to) });
  const mrrQ = trpc.finance.analytics.mrr.useQuery({ mes: refMonth }, { enabled: MES_RE.test(refMonth) });
  const listQ = trpc.finance.pnl.list.useQuery({ mesFrom: from, mesTo: to, ...(status ? { status: status as "pago" | "pendente" } : {}), ...(clienteFilter ? { clienteId: clienteFilter } : {}) }, { enabled: MES_RE.test(from) });
  const [serieJanela, setSerieJanela] = useState<Janela>("12m");
  const [serieGran, setSerieGran] = useState<SerieGran>("mensal");
  const serieQ = trpc.finance.analytics.serieHistorica.useQuery({ granularidade: serieGran, janela: serieJanela });
  const statusMesQ = trpc.finance.recorrencia.statusMes.useQuery({ mes: refMonth }, { enabled: MES_RE.test(refMonth) });
  const mesesFechadosQ = trpc.finance.meses.list.useQuery();
  const closedSet = useMemo(() => new Set(mesesFechadosQ.data ?? []), [mesesFechadosQ.data]);
  const refClosed = closedSet.has(refMonth);
  const monoMes = period.gran === "mes"; // trava é por mês
  const rows = (listQ.data ?? []) as PnlRow[];
  const r = resumoQ.data;
  const futuro = from > (months[0] ?? "");
  const curMes = agencyCurrentMonthCli();
  const destaqueSerie = serieGran === "anual" ? curMes.slice(0, 4) : curMes;
  const vencido = (r?.aReceberVencidoCents ?? 0) + (r?.aPagarVencidoCents ?? 0);
  const lancGroups = useMemo(() => LANC_TABS.map((t) => ({ ...t, linhas: rows.filter((x) => x.tipo === t.v) })), [rows]);
  // Frase comparativa da tendência (receita do período vs média 6m).
  const comparativo = (() => {
    if (!r || !r.receitaMedia6Cents) return "";
    const pct = Math.round(((r.receitaTotalCents - r.receitaMedia6Cents) / r.receitaMedia6Cents) * 100);
    return `${formatMes(refMonth)}: receita ${Math.abs(pct)}% ${pct >= 0 ? "acima" : "abaixo"} da média de 6 meses.`;
  })();

  const invalidate = () => { utils.finance.pnl.list.invalidate(); utils.finance.analytics.invalidate(); utils.finance.pnl.trend.invalidate(); utils.finance.months.invalidate(); utils.finance.recorrencia.invalidate(); };
  const onErr = (e: { message: string }) => toast.error(e.message);
  const gerar = trpc.finance.recorrencia.gerar.useMutation({ onSuccess: (res) => { invalidate(); toast.success(res.criadas > 0 ? `${res.criadas} recorrentes gerados em ${res.mes}.` : `Nada a gerar em ${res.mes} (já existem).`); }, onError: onErr });
  const invMeses = () => { invalidate(); utils.finance.meses.list.invalidate(); };
  const fecharMesM = trpc.finance.meses.fechar.useMutation({ onSuccess: (res) => { invMeses(); toast.success(`Mês ${formatMes(res.mes)} fechado.${res.pendencias > 0 ? ` ${res.pendencias} pendência(s) travada(s).` : ""}`); }, onError: onErr });
  const reabrirMesM = trpc.finance.meses.reabrir.useMutation({ onSuccess: (res) => { invMeses(); toast.success(`Mês ${formatMes(res.mes)} reaberto.`); }, onError: onErr });
  const onFechar = () => {
    const pend = rows.filter((x) => x.status === "pendente").length;
    const msg = pend > 0
      ? `Fechar ${formatMes(refMonth)}? Há ${pend} pendência(s) neste mês — elas NÃO serão pagas, apenas travadas. Ninguém poderá editar até reabrir. Continuar?`
      : `Fechar ${formatMes(refMonth)}? Ninguém poderá criar/editar/excluir neste mês até reabrir.`;
    if (confirm(msg)) fecharMesM.mutate({ mes: refMonth });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <PeriodBar period={period} setPeriod={setPeriod} months={months} from={from} to={to} />
        {monoMes && refClosed && (
          <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30 gap-1"><Lock className="w-3 h-3" /> {formatMes(refMonth)} fechado</Badge>
        )}
        <div className="ml-auto flex items-center gap-2">
          {monoMes && MES_RE.test(refMonth) && (
            refClosed
              ? <Button size="sm" variant="outline" onClick={() => reabrirMesM.mutate({ mes: refMonth })} disabled={reabrirMesM.isPending}><Unlock className="w-4 h-4 mr-1" /> Reabrir mês</Button>
              : <Button size="sm" variant="outline" onClick={onFechar} disabled={fecharMesM.isPending}><Lock className="w-4 h-4 mr-1" /> Fechar mês</Button>
          )}
          {(() => {
            const cur = agencyCurrentMonthCli();
            const faltam = statusMesQ.data?.faltam ?? 0;
            const passado = refMonth < cur;
            const podeGerar = !passado && faltam > 0 && !refClosed;
            const label = refClosed ? `${formatMes(refMonth)} travado` : passado ? `${formatMes(refMonth)} fechado` : faltam > 0 ? `Gerar ${formatMes(refMonth)}` : `${formatMes(refMonth)} já gerado`;
            return (
              <Button size="sm" variant="outline" onClick={() => gerar.mutate({ mes: refMonth })} disabled={gerar.isPending || !podeGerar || !MES_RE.test(refMonth)} title={refClosed ? "Mês fechado — reabra para gerar" : podeGerar ? `${faltam} recorrência(s) a gerar` : undefined}>
                {gerar.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : refClosed ? <Lock className="w-4 h-4 mr-1" /> : <Plus className="w-4 h-4 mr-1" />} {label}
              </Button>
            );
          })()}
          <Button size="sm" variant="outline" onClick={() => setShowAging(true)}><CalendarClock className="w-4 h-4 mr-1" /> A receber</Button>
        </div>
      </div>

      {/* Faixa de atrasado (só quando há vencido) */}
      {vencido > 0 && (
        <button onClick={() => setShowAging(true)} className="w-full flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-left text-sm text-red-700 transition hover:bg-red-500/15">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span><span className="font-semibold">Atrasado:</span> {centsToBRL(r?.aReceberVencidoCents ?? 0)} a receber vencido · {centsToBRL(r?.aPagarVencidoCents ?? 0)} a pagar vencido</span>
          <ChevronRight className="w-4 h-4 ml-auto" />
        </button>
      )}

      {/* Herói — (A) Resultado + status · (B) Posição de caixa do mês */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card><CardContent className="p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Resultado · {periodLabel(period, from, to)}</p>
            {futuro && <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30 text-[10px]">100% previsto</Badge>}
          </div>
          <div className="flex items-end gap-3 mt-1 flex-wrap">
            <span className={`text-3xl font-bold tabular-nums ${(r?.resultadoFinalCents ?? 0) >= 0 ? "text-emerald-600" : "text-red-600"}`}>{centsToBRL(r?.resultadoFinalCents ?? 0)}</span>
            <span className="text-sm font-semibold text-muted-foreground mb-1">margem {r?.margemPct != null ? `${r.margemPct}%` : "—"}</span>
            <span className="mb-1"><Delta value={r?.resultadoFinalCents ?? 0} media={r?.resultadoMedia6Cents ?? 0} /></span>
          </div>
          <BiValue real={r?.resultadoRealizadoCents ?? 0} prev={r?.resultadoPrevistoCents ?? 0} />
          <div className="mt-3 space-y-3">
            <div>
              <div className="flex items-center justify-between text-[11px] mb-1"><span className="uppercase tracking-wide text-emerald-600 font-medium">Receita {centsToBRL(r?.receitaTotalCents ?? 0)}</span><Delta value={r?.receitaTotalCents ?? 0} media={r?.receitaMedia6Cents ?? 0} /></div>
              <StatusBar pago={r?.receitaStatus.pagoCents ?? 0} aVencer={r?.receitaStatus.aVencerCents ?? 0} atrasado={r?.receitaStatus.atrasadoCents ?? 0} />
            </div>
            <div>
              <div className="flex items-center justify-between text-[11px] mb-1"><span className="uppercase tracking-wide text-red-600 font-medium">Despesa {centsToBRL(r?.despesaTotalCents ?? 0)}</span><Delta value={r?.despesaTotalCents ?? 0} media={r?.despesaMedia6Cents ?? 0} higherIsBetter={false} /></div>
              <StatusBar pago={r?.despesaStatus.pagoCents ?? 0} aVencer={r?.despesaStatus.aVencerCents ?? 0} atrasado={r?.despesaStatus.atrasadoCents ?? 0} />
            </div>
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Posição de caixa · {formatMes(refMonth)}</p>
          <div className="flex items-end gap-3 mt-1">
            <span className={`text-3xl font-bold tabular-nums ${(r?.saldoProjetadoCents ?? 0) >= 0 ? "text-emerald-600" : "text-red-600"}`}>{centsToBRL(r?.saldoProjetadoCents ?? 0)}</span>
            <span className="text-sm text-muted-foreground mb-1">saldo projetado do mês</span>
          </div>
          <p className="text-[11px] text-muted-foreground">a receber − a pagar (pendências do mês)</p>
          <div className="grid grid-cols-2 gap-3 mt-3">
            <button onClick={() => setShowAging(true)} className="text-left rounded-lg border border-border p-2 transition hover:border-accent/50 hover:bg-accent/5">
              <p className="text-[11px] uppercase tracking-wide text-emerald-600 flex items-center gap-1">A receber <ChevronRight className="w-3 h-3" /></p>
              <p className="text-base font-semibold tabular-nums">{centsToBRL(r?.aReceberCents ?? 0)}</p>
            </button>
            <button onClick={() => onNavigate?.("despesas", { period })} className="text-left rounded-lg border border-border p-2 transition hover:border-accent/50 hover:bg-accent/5">
              <p className="text-[11px] uppercase tracking-wide text-red-600 flex items-center gap-1">A pagar <ChevronRight className="w-3 h-3" /></p>
              <p className="text-base font-semibold tabular-nums">{centsToBRL(r?.aPagarCents ?? 0)}</p>
            </button>
          </div>
        </CardContent></Card>
      </div>

      {/* Cards secundários (drills) — cada um com delta vs média 6m */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <DrillCard label="Receita recorrente" value={centsToBRL(r?.receitaRecorrenteCents ?? 0)} tone="pos" hint={<span className="text-[11px] text-muted-foreground">MRR {centsToBRL(mrrQ.data?.mrrCents ?? 0)}</span>} onClick={() => onNavigate?.("clientes", { period, sub: "recorrente" })} />
        <DrillCard label="Receita pontual" value={centsToBRL(r?.receitaPontualCents ?? 0)} tone="pos" onClick={() => onNavigate?.("clientes", { period, sub: "pontual" })} />
        <DrillCard label="A receber" value={centsToBRL(r?.aReceberCents ?? 0)} tone="warn" hint={<span className="text-[11px] text-muted-foreground">ver aging →</span>} onClick={() => setShowAging(true)} />
        <DrillCard label="Despesa" value={centsToBRL(r?.despesaTotalCents ?? 0)} tone="neg" hint={<Delta value={r?.despesaTotalCents ?? 0} media={r?.despesaMedia6Cents ?? 0} higherIsBetter={false} />} onClick={() => onNavigate?.("despesas", { period })} />
      </div>
      {(r?.aporteCents ?? 0) > 0 && <p className="text-[11px] text-muted-foreground">Aporte no período: {centsToBRL(r!.aporteCents)}</p>}
      {futuro && <p className="text-[11px] text-amber-600">Período no futuro — os valores são 100% previstos (pendentes).</p>}

      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-xs text-muted-foreground">Séries{serieQ.data?.realizadoAte ? ` · realizado até ${fmtPeriodo(serieGran === "anual" ? serieQ.data.realizadoAte.slice(0, 4) : serieQ.data.realizadoAte, false)}` : ""}</p>
        <SerieControls janela={serieJanela} setJanela={setSerieJanela} gran={serieGran} setGran={setSerieGran} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card><CardContent className="p-3">
          <p className="text-xs font-semibold text-muted-foreground">Tendência — receita × despesa × resultado</p>
          {comparativo && <p className="text-[11px] text-accent mb-1">{comparativo}</p>}
          {serieQ.data ? <TrendChart pontos={serieQ.data.pontos} destaque={destaqueSerie} /> : <div className="h-[220px]" />}
        </CardContent></Card>
        <Card><CardContent className="p-3"><p className="text-xs font-semibold mb-1 text-muted-foreground">Receita: recorrente × pontual</p>{serieQ.data ? <MixChart pontos={serieQ.data.pontos} /> : <div className="h-[220px]" />}</CardContent></Card>
      </div>

      {/* Lançamentos do mês — cards colapsáveis por categoria (leitura) */}
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold">Lançamentos do mês <span className="text-xs font-normal text-muted-foreground">— clique numa categoria para expandir; nas linhas, para editar no hub</span></p>
        <div className="ml-auto flex items-end gap-2">
          <FilterSelect label="Status" value={status} onChange={setStatus} options={["pago", "pendente"]} format={(s) => (s === "pago" ? "Pago" : "Pendente")} allLabel="Todos" />
          <div className="flex flex-col gap-1"><Label className="text-[11px] text-muted-foreground">Cliente</Label>
            <Select value={clienteFilter ? String(clienteFilter) : "__all__"} onValueChange={(v) => setClienteFilter(v === "__all__" ? "" : Number(v))}>
              <SelectTrigger className="h-9 w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="__all__">Todos</SelectItem>{clientes.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.nome}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
      </div>
      {listQ.isLoading ? <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Carregando…</p> : (
        <div className="space-y-2">
          {lancGroups.map((g) => {
            const tone = tipoKind(g.v) === "receita" ? "pos" : "neg";
            const total = g.linhas.reduce((s, x) => s + x.valorCents, 0);
            return (
              <CategoriaCard key={g.v} label={g.label} count={g.linhas.length} totalCents={total} tone={tone}>
                {g.linhas.length === 0 ? <p className="px-3 py-3 text-xs text-muted-foreground">Nenhum lançamento.</p> : (
                  <Table>
                    <TableBody>
                      {g.linhas.slice(0, 200).map((row) => {
                        const remarcado = row.vencimento && row.vencimentoOriginal && row.vencimento !== row.vencimentoOriginal;
                        const drill = () => tipoKind(g.v) === "receita" ? onNavigate?.("clientes", { period, sub: g.v === "RECEITA_RECORRENTE" ? "recorrente" : "pontual" }) : onNavigate?.("despesas", { period });
                        return (
                          <TableRow key={row.id} className="cursor-pointer hover:bg-accent/5" onClick={drill} title="Editar no hub">
                            <TableCell className="max-w-[220px] truncate">{row.clienteId ? <ClientTag cliente={clienteById.get(row.clienteId)} /> : row.descricao}</TableCell>
                            <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{row.vencimento ?? "—"}{remarcado && <Badge className="ml-1 bg-amber-500/15 text-amber-600 border-amber-500/30 text-[9px] px-1">Remarcado</Badge>}</TableCell>
                            <TableCell><StatusChip status={row.status} vencimento={row.vencimento} /></TableCell>
                            <TableCell className={`text-right whitespace-nowrap font-medium tabular-nums ${tone === "neg" ? "text-red-600" : "text-emerald-600"}`}>{centsToBRL(row.valorCents)}</TableCell>
                            <TableCell className="text-right text-muted-foreground w-8"><ChevronRight className="w-4 h-4 inline" /></TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CategoriaCard>
            );
          })}
        </div>
      )}

      {/* Drill: A receber (aging escopado ao mês) — abre a partir da Visão geral */}
      <Dialog open={showAging} onOpenChange={setShowAging}>
        <DialogContent className="max-w-4xl w-[95vw]">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><CalendarClock className="w-4 h-4" /> A receber — aging até {formatMes(refMonth)}</DialogTitle></DialogHeader>
          <div className="max-h-[72vh] overflow-y-auto pr-1"><AReceberTab mesTo={refMonth} /></div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  Aba Clientes (MRR + movimento + churn + receita por cliente)
// ═════════════════════════════════════════════════════════════════════════════
type QualRow = { clienteId: number | null; nome: string; cor: string | null; mesesAtivos: number; totalCents: number; mediaCents: number; primeiroMes: string; ultimoMes: string; status: "ativo" | "churned" | "pontual" };

function ClientesTab({ months, clientes, drill }: { months: string[]; clientes: Cliente[]; drill?: { nonce: number; period?: PeriodState; sub?: string } }) {
  const [period, setPeriod] = useState<PeriodState>(defaultPeriod(agencyCurrentMonthCli()));
  const { from, to, refMonth } = periodRange(period, months);
  const [escopo, setEscopo] = useState<"vitalicio" | "periodo">("vitalicio");
  const [sortKey, setSortKey] = useState<keyof QualRow>("mediaCents");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const utils = trpc.useUtils();
  const [ajuste, setAjuste] = useState<{ recorrenciaId: number; nome: string; valor: string; aplicarGerados: boolean } | null>(null);
  const [remarcar, setRemarcar] = useState<{ id: number; venc: string } | null>(null);
  const [editPon, setEditPon] = useState<EditPon | null>(null);
  const [contratoTab, setContratoTab] = useState<"recorrente" | "pontual">("recorrente");
  const [novoContrato, setNovoContrato] = useState<{ nome: string; valor: string; dia: string; mesInicio: string; mesSeguinte: boolean } | null>(null);
  const [projForm, setProjForm] = useState<ProjForm | null>(null);
  // Drill vindo da Visão Geral: preserva o período e abre a sub-aba certa.
  useEffect(() => {
    if (!drill) return;
    if (drill.period) setPeriod(drill.period);
    if (drill.sub === "recorrente" || drill.sub === "pontual") setContratoTab(drill.sub);
  }, [drill?.nonce]); // eslint-disable-line react-hooks/exhaustive-deps
  const [serieView, setSerieView] = useState<"recorrente" | "pontual">("recorrente");
  const [serieJanela, setSerieJanela] = useState<Janela>("12m");
  const [serieGran, setSerieGran] = useState<SerieGran>("mensal");
  const serieQ = trpc.finance.analytics.serieHistorica.useQuery({ granularidade: serieGran, janela: serieJanela });
  const mrrQ = trpc.finance.analytics.mrr.useQuery({ mes: refMonth }, { enabled: MES_RE.test(refMonth) });
  const churnQ = trpc.finance.analytics.churn.useQuery({ mesFrom: from, mesTo: to, limitMonths: 12 }, { enabled: MES_RE.test(from) });
  const qualQ = trpc.finance.analytics.qualidadeClientes.useQuery(escopo === "periodo" ? { mesFrom: from, mesTo: to } : {}, { enabled: escopo === "vitalicio" || MES_RE.test(from) });
  const recQ = trpc.finance.recorrencia.list.useQuery();
  const contratosQ = trpc.finance.contratosAtivos.useQuery({ mes: refMonth }, { enabled: MES_RE.test(refMonth) });
  const concentracaoQ = trpc.finance.pnl.receitaPorCliente.useQuery({ mesFrom: from, mesTo: to }, { enabled: MES_RE.test(from) });
  const overviewQ = trpc.finance.overview.resumo.useQuery({ mesFrom: refMonth, mesTo: refMonth }, { enabled: MES_RE.test(refMonth) });
  const mesesFechadosQ = trpc.finance.meses.list.useQuery();
  const refClosed = (mesesFechadosQ.data ?? []).includes(refMonth);
  const m = mrrQ.data;
  const ch = churnQ.data;
  const ov = overviewQ.data;
  const curMes = agencyCurrentMonthCli();
  const destaqueSerie = serieGran === "anual" ? curMes.slice(0, 4) : curMes;
  const summary = qualQ.data?.summary;
  const encerradas = (recQ.data ?? []).filter((rec) => rec.natureza !== "DESPESA" && !rec.ativo);

  const onErr = (e: { message: string }) => toast.error(e.message);
  const invRec = () => { utils.finance.recorrencia.invalidate(); utils.finance.pnl.invalidate(); utils.finance.analytics.invalidate(); utils.finance.pnl.trend.invalidate(); utils.finance.contratosAtivos.invalidate(); utils.finance.overview.invalidate(); utils.finance.clientes.list.invalidate(); utils.finance.projetos.list.invalidate(); };
  const createReceita = trpc.finance.recorrencia.createReceita.useMutation({ onSuccess: () => { invRec(); setNovoContrato(null); toast.success("Contrato recorrente criado."); }, onError: onErr });
  const projCreate = trpc.finance.projetos.create.useMutation({ onSuccess: (res) => { invRec(); setProjForm(null); toast.success(`Projeto criado (${res.criadas} parcelas).`); }, onError: onErr });
  const marcarSaida = trpc.finance.recorrencia.marcarSaida.useMutation({ onSuccess: (res) => { invRec(); toast.success(`Saída marcada. ${res.removidas} linha(s) futura(s) pendente(s) removida(s).`); }, onError: onErr });
  const reativar = trpc.finance.recorrencia.reativar.useMutation({ onSuccess: () => { invRec(); toast.success("Recorrência reativada."); }, onError: onErr });
  const ajustarValor = trpc.finance.recorrencia.ajustarValor.useMutation({ onSuccess: () => { invRec(); setAjuste(null); toast.success("Valor recorrente ajustado."); }, onError: onErr });
  const setStatusM = trpc.finance.pnl.setStatus.useMutation({ onSuccess: () => invRec(), onError: onErr });
  const remarcarM = trpc.finance.pnl.remarcar.useMutation({ onSuccess: () => { invRec(); setRemarcar(null); toast.success("Vencimento remarcado."); }, onError: onErr });
  const delM = trpc.finance.pnl.delete.useMutation({ onSuccess: () => { invRec(); toast.success("Excluído."); }, onError: onErr });

  const vencCell = (venc: string | null, orig: string | null, _dia: number | null) => {
    const remarc = venc && orig && venc !== orig;
    return <span>{fmtVenc(venc)}{remarc && <Badge className="ml-1 bg-amber-500/15 text-amber-600 border-amber-500/30 text-[9px] px-1">Remarcado</Badge>}</span>;
  };
  const nomeCell = (clienteId: number | null, nome: string, cor: string | null) =>
    clienteId ? <ClientTag cliente={{ id: clienteId, nome, cor, ativo: true }} /> : <span>{nome}</span>;

  const recorrentesRows: HubRow[] = (contratosQ.data?.recorrentes ?? []).map((c) => ({
    key: c.entryId != null ? `e${c.entryId}` : `r${c.recorrenciaId}`,
    nome: nomeCell(c.clienteId, c.clienteNome, c.cor),
    sub: c.projetado ? "projetado da recorrência" : undefined,
    valorCents: c.valorCents,
    vencInfo: vencCell(c.vencimento, c.vencimentoOriginal, c.diaVencimento), vencimento: c.vencimento,
    status: c.status,
    estadoChip: c.projetado ? <Badge className="bg-blue-500/15 text-blue-600 border-blue-500/30">Previsto</Badge> : undefined,
    locked: refClosed,
    onToggle: c.entryId ? () => setStatusM.mutate({ id: c.entryId!, status: c.status === "pago" ? "pendente" : "pago" }) : undefined,
    actions: (
      <div className="inline-flex items-center gap-1">
        {c.entryId && <button onClick={() => setRemarcar({ id: c.entryId!, venc: c.vencimento ?? "" })} className="p-1.5 text-muted-foreground hover:text-foreground" title="Mudar data de pagamento"><CalendarClock className="w-4 h-4" /></button>}
        {c.recorrenciaId != null && <button onClick={() => setAjuste({ recorrenciaId: c.recorrenciaId!, nome: c.clienteNome, valor: centsToInput(c.valorCents), aplicarGerados: false })} className="p-1.5 text-muted-foreground hover:text-foreground" title="Ajustar valor recorrente"><Pencil className="w-4 h-4" /></button>}
        {c.recorrenciaId != null && <button onClick={() => { if (confirm(`Encerrar contrato de ${c.clienteNome}? Remove os meses futuros pendentes (não mexe nos pagos).`)) marcarSaida.mutate({ recorrenciaId: c.recorrenciaId!, mes: cur }); }} className="p-1.5 text-muted-foreground hover:text-destructive" title="Churn / encerrar contrato"><TrendingDown className="w-4 h-4" /></button>}
      </div>
    ),
  }));
  const pontuaisRows: HubRow[] = (contratosQ.data?.pontuais ?? []).map((c) => ({
    key: `p${c.entryId}`,
    nome: nomeCell(c.clienteId, c.clienteNome !== "—" ? c.clienteNome : c.descricao, c.cor),
    sub: c.projetoId ? `projeto · parcela ${c.parcelaNum}/${c.parcelaTotal} · ${c.descricao}` : "avulsa",
    valorCents: c.valorCents,
    vencInfo: vencCell(c.vencimento, c.vencimentoOriginal, null), vencimento: c.vencimento,
    status: c.status,
    locked: refClosed,
    onToggle: () => setStatusM.mutate({ id: c.entryId, status: c.status === "pago" ? "pendente" : "pago" }),
    actions: (
      <div className="inline-flex items-center gap-1">
        <button onClick={() => setEditPon({ id: c.entryId, descricao: c.descricao, valorCents: c.valorCents, vencimento: c.vencimento })} className="p-1.5 text-muted-foreground hover:text-foreground" title="Editar (descrição, valor, vencimento)"><Pencil className="w-4 h-4" /></button>
        <button onClick={() => setRemarcar({ id: c.entryId, venc: c.vencimento ?? "" })} className="p-1.5 text-muted-foreground hover:text-foreground" title="Mudar data de pagamento"><CalendarClock className="w-4 h-4" /></button>
        <button onClick={() => { if (confirm("Excluir esta parcela/receita pontual?")) delM.mutate({ id: c.entryId }); }} className="p-1.5 text-muted-foreground hover:text-destructive" title="Excluir"><Trash2 className="w-4 h-4" /></button>
      </div>
    ),
  }));

  const qualRows = useMemo(() => {
    const rows = ((qualQ.data?.rows ?? []) as QualRow[]).slice();
    rows.sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [qualQ.data, sortKey, sortDir]);
  const maxMedia = Math.max(1, ...qualRows.map((r) => r.mediaCents));

  const sortHead = (key: keyof QualRow, label: string, align?: string) => (
    <TableHead className={`cursor-pointer select-none ${align ?? ""}`} onClick={() => { if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc")); else { setSortKey(key); setSortDir("desc"); } }}>
      {label}{sortKey === key ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
    </TableHead>
  );
  const statusBadge = (s: string) => s === "ativo" ? <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30">Ativo</Badge> : s === "churned" ? <Badge className="bg-red-500/15 text-red-600 border-red-500/30">Churned</Badge> : <Badge variant="secondary" className="font-normal">Pontual</Badge>;

  const cur = agencyCurrentMonthCli();

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 flex-wrap">
        <PeriodBar period={period} setPeriod={setPeriod} months={months} from={from} to={to} />
        {refClosed && <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30 gap-1"><Lock className="w-3 h-3" /> {formatMes(refMonth)} fechado</Badge>}
        <div className="ml-auto">
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button size="sm"><Plus className="w-4 h-4 mr-1" /> Novo</Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Adicionar receita</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setNovoContrato({ nome: "", valor: "", dia: "", mesInicio: cur, mesSeguinte: false })}><Repeat className="w-3.5 h-3.5 mr-2" /> Contrato recorrente</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setProjForm({ clienteId: null, nome: "", parcelas: [{ valor: "", vencimento: "" }, { valor: "", vencimento: "" }] })}><CalendarClock className="w-3.5 h-3.5 mr-2" /> Projeto pontual (parcelado)</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* TOPO — 2 blocos: (A) contratos ativos em destaque · (B) concentração */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card><CardContent className="p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Contratos ativos · {formatMes(refMonth)}</p>
          <div className="flex items-end gap-4 mt-1">
            <div><span className="text-4xl font-bold tabular-nums text-emerald-600">{recorrentesRows.length}</span><p className="text-[11px] uppercase tracking-wide text-muted-foreground">recorrentes</p></div>
            <span className="text-2xl text-muted-foreground mb-2">·</span>
            <div><span className="text-4xl font-bold tabular-nums text-orange-500">{pontuaisRows.length}</span><p className="text-[11px] uppercase tracking-wide text-muted-foreground">pontuais</p></div>
          </div>
          <div className="grid grid-cols-3 gap-3 mt-3">
            <div><p className="text-[11px] uppercase tracking-wide text-muted-foreground">MRR</p><p className="text-sm font-semibold tabular-nums">{centsToBRL(m?.mrrCents ?? 0)}</p><span className={`text-[11px] font-medium ${(m?.deltaCents ?? 0) >= 0 ? "text-emerald-600" : "text-red-600"}`}>{(m?.deltaCents ?? 0) >= 0 ? "▲" : "▼"} {centsToBRL(Math.abs(m?.deltaCents ?? 0))}</span></div>
            <div><p className="text-[11px] uppercase tracking-wide text-muted-foreground">Novos</p><p className="text-sm font-semibold tabular-nums text-emerald-600">{centsToBRL(contratosQ.data?.novosCents ?? 0)}</p><span className="text-[10px] text-muted-foreground">receita nova</span></div>
            <div><p className="text-[11px] uppercase tracking-wide text-muted-foreground">Churn</p><p className="text-sm font-semibold tabular-nums text-red-600">-{centsToBRL(m?.churnCents ?? 0)}</p></div>
          </div>
          <div className="mt-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Recebimento de {formatMes(refMonth)}</p>
            <StatusBar pago={ov?.receitaStatus.pagoCents ?? 0} aVencer={ov?.receitaStatus.aVencerCents ?? 0} atrasado={ov?.receitaStatus.atrasadoCents ?? 0} />
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Concentração da receita · {periodLabel(period, from, to)}</p>
          <ConcentracaoDonut data={(concentracaoQ.data ?? []).map((x) => ({ nome: x.nome, totalCents: x.totalCents }))} />
        </CardContent></Card>
      </div>

      {/* Contratos ativos no mês (Recorrente | Pontual) */}
      <Card><CardContent className="p-4">
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <p className="text-sm font-semibold flex items-center gap-2"><Repeat className="w-4 h-4" /> Contratos ativos · {formatMes(refMonth)}</p>
          <div className="inline-flex rounded-md border border-border overflow-hidden text-xs">
            <button onClick={() => setContratoTab("recorrente")} className={`px-3 py-1 ${contratoTab === "recorrente" ? "bg-accent/20 font-semibold" : "text-muted-foreground"}`}>Recorrente ({recorrentesRows.length})</button>
            <button onClick={() => setContratoTab("pontual")} className={`px-3 py-1 border-l border-border ${contratoTab === "pontual" ? "bg-accent/20 font-semibold" : "text-muted-foreground"}`}>Pontual ({pontuaisRows.length})</button>
          </div>
        </div>
        {contratoTab === "recorrente"
          ? <HubTable rows={recorrentesRows} nomeLabel="Cliente" valorLabel="Valor/mês" loading={contratosQ.isLoading} emptyMsg="Nenhum contrato recorrente ativo neste mês." />
          : <HubTable rows={pontuaisRows} nomeLabel="Cliente / projeto" valorLabel="Parcela" loading={contratosQ.isLoading} emptyMsg="Nenhuma receita pontual neste mês." />}
        {encerradas.length > 0 && (
          <div className="mt-2 flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
            <span>Encerradas:</span>
            {encerradas.map((rec) => (
              <button key={rec.id} onClick={() => reativar.mutate({ recorrenciaId: rec.id })} className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 hover:border-accent/50 hover:bg-accent/5" title="Reativar">
                {rec.clienteNome} · reativar
              </button>
            ))}
          </div>
        )}
      </CardContent></Card>

      {/* ── Divisor: Análise da base (histórico/vitalício, não do mês) ────────── */}
      <div className="flex items-center gap-3 pt-2">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1"><Users className="w-3.5 h-3.5" /> Análise da base — histórico</span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Clientes ativos" value={String(ch?.ativos ?? 0)} tone="pos" />
        <Stat label={`MRR perdido · ${periodLabel(period, from, to)}`} value={centsToBRL(ch?.periodoPerdidoCents ?? 0)} tone="neg" />
        <Stat label="Churned (histórico)" value={String(ch?.churnedCount ?? 0)} tone="neg" />
        <Stat label="Churn rate" value={ch ? `${Math.round(ch.taxa * 100)}%` : "—"} tone="warn" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card><CardContent className="p-3">
          <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
            <p className="text-xs font-semibold text-muted-foreground">{serieView === "pontual" ? "Receita pontual" : "MRR (recorrente)"} ao longo dos meses</p>
            <div className="flex items-center gap-2">
              <div className="inline-flex rounded-md border border-border overflow-hidden text-xs">
                <button onClick={() => setSerieView("recorrente")} className={`px-3 py-1 ${serieView === "recorrente" ? "bg-accent/20 font-semibold" : "text-muted-foreground"}`}>Recorrente</button>
                <button onClick={() => setSerieView("pontual")} className={`px-3 py-1 border-l border-border ${serieView === "pontual" ? "bg-accent/20 font-semibold" : "text-muted-foreground"}`}>Pontual</button>
              </div>
              <SerieControls janela={serieJanela} setJanela={setSerieJanela} gran={serieGran} setGran={setSerieGran} />
            </div>
          </div>
          {serieView === "recorrente" && (m?.deltaCents != null) && <p className="text-[11px] text-accent mb-1">{formatMes(refMonth)}: MRR {(m.deltaCents >= 0 ? "▲ +" : "▼ -")}{centsToBRL(Math.abs(m.deltaCents))} vs mês anterior.</p>}
          {serieQ.data ? <MrrChart pontos={serieQ.data.pontos} campo={serieView === "pontual" ? "pontual" : "mrr"} destaque={destaqueSerie} /> : <div className="h-[200px]" />}
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <p className="text-xs font-semibold mb-1 text-muted-foreground">Movimento da base — variação líquida do MRR por mês</p>
          {serieQ.data ? <MovimentoChart pontos={serieQ.data.pontos} destaque={destaqueSerie} /> : <div className="h-[180px]" />}
        </CardContent></Card>
      </div>
      {ch?.mesIncompleto && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          O mês de referência ({formatMes(ch.mesReferencia)}) tem bem menos lançamentos que a média — pode estar incompleto. Clientes que "saíram" no mês de referência ou no anterior podem ser saídas recentes, não churn confirmado.
        </div>
      )}

      {/* Qualidade por cliente */}
      <Card><CardContent className="p-4">
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <p className="text-sm font-semibold flex items-center gap-2"><Users className="w-4 h-4" /> Qualidade por cliente</p>
          <div className="flex items-center gap-3">
            {summary && <span className="text-xs text-muted-foreground">Ativos <strong className="text-emerald-600">{summary.ativos}</strong> · Churned <strong className="text-red-600">{summary.churned}</strong> · Pontual <strong>{summary.pontual}</strong></span>}
            <Select value={escopo} onValueChange={(v) => setEscopo(v as "vitalicio" | "periodo")}>
              <SelectTrigger className="h-8 w-[150px]"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="vitalicio">Vitalício</SelectItem><SelectItem value="periodo">No período</SelectItem></SelectContent>
            </Select>
          </div>
        </div>
        <div className="max-h-96 overflow-y-auto rounded-md border border-border">
          <Table>
            <TableHeader><TableRow>
              {sortHead("nome", "Cliente")}
              {sortHead("mesesAtivos", "Meses", "text-right")}
              {sortHead("totalCents", "Total", "text-right")}
              {sortHead("mediaCents", "Média/mês", "text-right")}
              {sortHead("primeiroMes", "Primeiro")}
              {sortHead("ultimoMes", "Último")}
              {sortHead("status", "Status")}
            </TableRow></TableHeader>
            <TableBody>
              {qualQ.isLoading && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6"><Loader2 className="w-4 h-4 animate-spin inline" /> Carregando…</TableCell></TableRow>}
              {!qualQ.isLoading && qualRows.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">Sem clientes no escopo.</TableCell></TableRow>}
              {qualRows.map((r, i) => (
                <TableRow key={i}>
                  <TableCell>{r.clienteId ? <ClientTag cliente={{ id: r.clienteId, nome: r.nome, cor: r.cor, ativo: true }} /> : <span className="text-muted-foreground text-xs">{r.nome}</span>}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.mesesAtivos}</TableCell>
                  <TableCell className="text-right whitespace-nowrap tabular-nums">{centsToBRL(r.totalCents)}</TableCell>
                  <TableCell className="text-right whitespace-nowrap"><MiniBar value={r.mediaCents} max={maxMedia} /></TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatMes(r.primeiroMes)}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatMes(r.ultimoMes)}</TableCell>
                  <TableCell>{statusBadge(r.status)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent></Card>

      {/* Churned — histórico acumulado (referência) */}
      <Card><CardContent className="p-4">
        <p className="text-sm font-semibold mb-1 flex items-center gap-2"><TrendingDown className="w-4 h-4" /> Churned — histórico acumulado (referência)</p>
        <p className="text-[11px] text-muted-foreground mb-2">Todas as saídas de recorrente desde o início, por último valor mensal. É histórico — o número de destaque é o MRR perdido do período acima.</p>
        <div className="max-h-64 overflow-y-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Cliente</TableHead><TableHead>Último mês</TableHead><TableHead className="text-right">Valor mensal</TableHead><TableHead className="text-right">Meses fora</TableHead></TableRow></TableHeader>
            <TableBody>
              {(ch?.churned ?? []).map((c, i) => (
                <TableRow key={i}>
                  <TableCell><span className="inline-flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ background: c.cor ?? "#64748b" }} />{c.nome}</span></TableCell>
                  <TableCell className="whitespace-nowrap">{formatMes(c.ultimoMes)}</TableCell>
                  <TableCell className="text-right whitespace-nowrap font-medium">{centsToBRL(c.valorMensalCents)}</TableCell>
                  <TableCell className="text-right">{c.mesesDesde}</TableCell>
                </TableRow>
              ))}
              {(ch?.churned.length ?? 0) === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">Nenhum churn.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
      </CardContent></Card>

      {/* Dialog ajustar valor recorrente */}
      <Dialog open={!!ajuste} onOpenChange={(o) => !o && setAjuste(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Ajustar valor recorrente{ajuste ? ` — ${ajuste.nome}` : ""}</DialogTitle></DialogHeader>
          {ajuste && (
            <div className="space-y-3">
              <Field label="Novo valor mensal"><MoneyInput value={ajuste.valor} onChange={(v) => setAjuste({ ...ajuste, valor: v })} /></Field>
              <label className="flex items-center gap-2 text-sm"><Switch checked={ajuste.aplicarGerados} onCheckedChange={(v) => setAjuste({ ...ajuste, aplicarGerados: !!v })} /> Aplicar também aos meses futuros já gerados (pendentes)</label>
              <p className="text-[11px] text-muted-foreground">Sem marcar, vale só para os próximos meses a gerar. Não reescreve meses já pagos.</p>
            </div>
          )}
          <DialogFooter><Button variant="outline" onClick={() => setAjuste(null)}>Cancelar</Button><Button onClick={() => { if (!ajuste) return; const c = parseMoneyToCents(ajuste.valor); if (c == null || c < 0) return toast.error("Valor inválido."); ajustarValor.mutate({ recorrenciaId: ajuste.recorrenciaId, valorCents: c, aplicarGerados: ajuste.aplicarGerados }); }} disabled={ajustarValor.isPending}>Salvar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog remarcar (mudar data de pagamento) */}
      <Dialog open={!!remarcar} onOpenChange={(o) => !o && setRemarcar(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Mudar data de pagamento</DialogTitle></DialogHeader>
          {remarcar && <Field label="Nova data de vencimento"><Input type="date" value={remarcar.venc} onChange={(e) => setRemarcar({ ...remarcar, venc: e.target.value })} /></Field>}
          <DialogFooter><Button variant="outline" onClick={() => setRemarcar(null)}>Cancelar</Button><Button onClick={() => { if (remarcar && /^\d{4}-\d{2}-\d{2}$/.test(remarcar.venc)) remarcarM.mutate({ id: remarcar.id, vencimento: remarcar.venc }); else toast.error("Data inválida."); }} disabled={remarcarM.isPending}>Salvar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <EditPontualDialog entry={editPon} onClose={() => setEditPon(null)} onSaved={invRec} label="receita pontual" />

      {/* Dialog novo contrato recorrente (mesmo padrão do colaborador) */}
      <Dialog open={!!novoContrato} onOpenChange={(o) => !o && setNovoContrato(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo contrato recorrente</DialogTitle></DialogHeader>
          {novoContrato && (
            <div className="space-y-3">
              <Field label="Nome do cliente" full><Input value={novoContrato.nome} onChange={(e) => setNovoContrato({ ...novoContrato, nome: e.target.value })} placeholder="Ex.: Acme Ltda" /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Valor mensal"><MoneyInput value={novoContrato.valor} onChange={(v) => setNovoContrato({ ...novoContrato, valor: v })} /></Field>
                <Field label="Dia de vencimento"><Input value={novoContrato.dia} onChange={(e) => setNovoContrato({ ...novoContrato, dia: e.target.value })} placeholder="15" /></Field>
                <Field label="Mês de início"><Input value={novoContrato.mesInicio} onChange={(e) => setNovoContrato({ ...novoContrato, mesInicio: e.target.value })} placeholder="2026-07" /></Field>
                <Field label="Cobrança"><Select value={novoContrato.mesSeguinte ? "pos" : "ant"} onValueChange={(v) => setNovoContrato({ ...novoContrato, mesSeguinte: v === "pos" })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ant">Antecipado (vence no mês)</SelectItem><SelectItem value="pos">Pós-pago (mês seguinte)</SelectItem></SelectContent></Select></Field>
              </div>
            </div>
          )}
          <DialogFooter><Button variant="outline" onClick={() => setNovoContrato(null)}>Cancelar</Button><Button disabled={createReceita.isPending} onClick={() => {
            if (!novoContrato) return;
            if (!novoContrato.nome.trim()) return toast.error("Informe o nome do cliente.");
            const c = parseMoneyToCents(novoContrato.valor);
            if (c == null || c <= 0) return toast.error("Valor inválido.");
            if (!MES_RE.test(novoContrato.mesInicio)) return toast.error("Mês de início inválido (YYYY-MM).");
            const dia = novoContrato.dia.trim() ? Number(novoContrato.dia) : null;
            if (dia != null && (!Number.isInteger(dia) || dia < 1 || dia > 31)) return toast.error("Dia inválido (1–31).");
            createReceita.mutate({ clienteNome: novoContrato.nome.trim(), valorCents: c, diaVencimento: dia, mesInicio: novoContrato.mesInicio, vencimentoMesSeguinte: novoContrato.mesSeguinte });
          }}>Criar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog projeto pontual (parcelado) */}
      <Dialog open={!!projForm} onOpenChange={(o) => !o && setProjForm(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo projeto parcelado</DialogTitle></DialogHeader>
          {projForm && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Nome do projeto" full><Input value={projForm.nome} onChange={(e) => setProjForm({ ...projForm, nome: e.target.value })} placeholder="Ex.: Site institucional" /></Field>
                <Field label="Cliente" full><ClienteSelect value={projForm.clienteId} onChange={(id) => setProjForm({ ...projForm, clienteId: id })} clientes={clientes} /></Field>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1"><Label className="text-xs">Parcelas (valor + vencimento)</Label><span className="text-xs text-muted-foreground">Total: {centsToBRL(projForm.parcelas.reduce((s, p) => s + (parseMoneyToCents(p.valor) ?? 0), 0))}</span></div>
                <div className="space-y-2 max-h-56 overflow-y-auto">
                  {projForm.parcelas.map((p, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-5">{i + 1}</span>
                      <MoneyInput value={p.valor} onChange={(v) => setProjForm({ ...projForm, parcelas: projForm.parcelas.map((x, j) => j === i ? { ...x, valor: v } : x) })} />
                      <Input type="date" value={p.vencimento} onChange={(e) => setProjForm({ ...projForm, parcelas: projForm.parcelas.map((x, j) => j === i ? { ...x, vencimento: e.target.value } : x) })} className="w-[150px]" />
                      <button onClick={() => setProjForm({ ...projForm, parcelas: projForm.parcelas.filter((_, j) => j !== i) })} className="p-1 text-muted-foreground hover:text-destructive" title="Remover"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  ))}
                </div>
                <Button size="sm" variant="ghost" className="mt-1" onClick={() => setProjForm({ ...projForm, parcelas: [...projForm.parcelas, { valor: "", vencimento: "" }] })}><Plus className="w-3.5 h-3.5 mr-1" /> Parcela</Button>
              </div>
            </div>
          )}
          <DialogFooter><Button variant="outline" onClick={() => setProjForm(null)}>Cancelar</Button><Button disabled={projCreate.isPending} onClick={() => {
            if (!projForm) return;
            if (!projForm.nome.trim()) return toast.error("Informe o nome do projeto.");
            const parcelas = projForm.parcelas.map((p) => ({ valorCents: parseMoneyToCents(p.valor), vencimento: p.vencimento }));
            if (parcelas.some((p) => p.valorCents == null || p.valorCents <= 0)) return toast.error("Valor de parcela inválido.");
            if (parcelas.some((p) => !/^\d{4}-\d{2}-\d{2}$/.test(p.vencimento))) return toast.error("Data de parcela inválida (YYYY-MM-DD).");
            projCreate.mutate({ clienteId: projForm.clienteId, nome: projForm.nome.trim(), parcelas: parcelas as { valorCents: number; vencimento: string }[] });
          }}>Criar projeto</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  Aba Despesas (por categoria)
// ═════════════════════════════════════════════════════════════════════════════
function DespesasTab({ months, drill }: { months: string[]; drill?: { nonce: number; period?: PeriodState; sub?: string } }) {
  const utils = trpc.useUtils();
  const [period, setPeriod] = useState<PeriodState>(defaultPeriod(agencyCurrentMonthCli()));
  useEffect(() => { if (drill?.period) setPeriod(drill.period); }, [drill?.nonce]); // eslint-disable-line react-hooks/exhaustive-deps
  const { from, to, refMonth } = periodRange(period, months);
  const q = trpc.finance.analytics.despesaPorCategoria.useQuery({ mesFrom: from, mesTo: to, limitMonths: 12 }, { enabled: MES_RE.test(from) });
  const mesesFechadosQ = trpc.finance.meses.list.useQuery();
  const refClosed = (mesesFechadosQ.data ?? []).includes(refMonth);
  const recQ = trpc.finance.recorrencia.list.useQuery();
  const despesasQ = trpc.finance.despesasAtivos.useQuery({ mes: refMonth }, { enabled: MES_RE.test(refMonth) });
  const overviewQ = trpc.finance.overview.resumo.useQuery({ mesFrom: refMonth, mesTo: refMonth }, { enabled: MES_RE.test(refMonth) });
  const concentracaoQ = trpc.finance.analytics.despesaPorFornecedor.useQuery({ mesFrom: from, mesTo: to }, { enabled: MES_RE.test(from) });
  const encerradas = (recQ.data ?? []).filter((r) => r.natureza === "DESPESA" && !r.ativo);
  const p = q.data?.periodo;
  const ov = overviewQ.data;
  const total = p?.totalCents ?? 0;
  const pct = (c: number) => (total > 0 ? `${Math.round((c / total) * 100)}%` : "—");
  const cur = agencyCurrentMonthCli();

  const [ajuste, setAjuste] = useState<{ recorrenciaId: number; nome: string; valor: string; aplicarGerados: boolean } | null>(null);
  const [novo, setNovo] = useState<{ descricao: string; valor: string; tipoEntry: "DESPESA_RECORRENTE" | "DESPESA_IMPOSTO"; dia: string; mesInicio: string; mesSeguinte: boolean } | null>(null);
  const [novoPontual, setNovoPontual] = useState<{ descricao: string; valor: string; venc: string; reembolso: boolean } | null>(null);
  const [remarcar, setRemarcar] = useState<{ id: number; venc: string } | null>(null);
  const [editPon, setEditPon] = useState<EditPon | null>(null);
  const [custoTab, setCustoTab] = useState<"recorrente" | "imposto" | "pontual">("recorrente");

  const onErr = (e: { message: string }) => toast.error(e.message);
  const invRec = () => { utils.finance.recorrencia.invalidate(); utils.finance.pnl.invalidate(); utils.finance.analytics.invalidate(); utils.finance.pnl.trend.invalidate(); utils.finance.despesasAtivos.invalidate(); utils.finance.overview.invalidate(); utils.finance.reconciliacao.invalidate(); };
  const marcarSaida = trpc.finance.recorrencia.marcarSaida.useMutation({ onSuccess: (res) => { invRec(); toast.success(`Despesa encerrada. ${res.removidas} mês(es) futuro(s) pendente(s) removido(s).`); }, onError: onErr });
  const reativar = trpc.finance.recorrencia.reativar.useMutation({ onSuccess: () => { invRec(); toast.success("Despesa reativada."); }, onError: onErr });
  const ajustarValor = trpc.finance.recorrencia.ajustarValor.useMutation({ onSuccess: () => { invRec(); setAjuste(null); toast.success("Valor ajustado."); }, onError: onErr });
  const createDespesa = trpc.finance.recorrencia.createDespesa.useMutation({ onSuccess: () => { invRec(); setNovo(null); toast.success("Despesa recorrente criada."); }, onError: onErr });
  const createPontual = trpc.finance.pnl.create.useMutation({ onSuccess: () => { invRec(); setNovoPontual(null); toast.success("Despesa pontual criada."); }, onError: onErr });
  const toggleReembolso = trpc.finance.pnl.update.useMutation({ onSuccess: () => invRec(), onError: onErr });
  const setStatusM = trpc.finance.pnl.setStatus.useMutation({ onSuccess: () => invRec(), onError: onErr });
  const remarcarM = trpc.finance.pnl.remarcar.useMutation({ onSuccess: () => { invRec(); setRemarcar(null); toast.success("Vencimento remarcado."); }, onError: onErr });
  const delM = trpc.finance.pnl.delete.useMutation({ onSuccess: () => { invRec(); toast.success("Excluído."); }, onError: onErr });

  const vencCell = (venc: string | null, orig: string | null, _dia: number | null) => {
    const remarc = venc && orig && venc !== orig;
    return <span>{fmtVenc(venc)}{remarc && <Badge className="ml-1 bg-amber-500/15 text-amber-600 border-amber-500/30 text-[9px] px-1">Remarcado</Badge>}</span>;
  };
  const recRow = (d: NonNullable<typeof despesasQ.data>["recorrentes"][number]): HubRow => ({
    key: d.entryId != null ? `e${d.entryId}` : `r${d.recorrenciaId}`,
    nome: d.descricao,
    sub: d.projetado ? "projetado da recorrência" : d.estimativa ? "estimativa" : undefined,
    valorCents: d.valorCents,
    vencInfo: vencCell(d.vencimento, d.vencimentoOriginal, d.diaVencimento), vencimento: d.vencimento,
    status: d.status,
    estadoChip: d.projetado ? <Badge className="bg-blue-500/15 text-blue-600 border-blue-500/30">Previsto</Badge> : undefined,
    locked: refClosed,
    onToggle: d.entryId ? () => setStatusM.mutate({ id: d.entryId!, status: d.status === "pago" ? "pendente" : "pago" }) : undefined,
    actions: (
      <div className="inline-flex items-center gap-1">
        {d.entryId && <button onClick={() => setRemarcar({ id: d.entryId!, venc: d.vencimento ?? "" })} className="p-1.5 text-muted-foreground hover:text-foreground" title="Mudar data de pagamento"><CalendarClock className="w-4 h-4" /></button>}
        {d.recorrenciaId != null && <button onClick={() => setAjuste({ recorrenciaId: d.recorrenciaId!, nome: d.descricao, valor: centsToInput(d.valorCents), aplicarGerados: false })} className="p-1.5 text-muted-foreground hover:text-foreground" title="Ajustar valor"><Pencil className="w-4 h-4" /></button>}
        {d.recorrenciaId != null && <button onClick={() => { if (confirm(`Encerrar "${d.descricao}"? Remove os meses futuros pendentes (não mexe nos pagos).`)) marcarSaida.mutate({ recorrenciaId: d.recorrenciaId!, mes: cur }); }} className="p-1.5 text-muted-foreground hover:text-destructive" title="Encerrar recorrência"><TrendingDown className="w-4 h-4" /></button>}
      </div>
    ),
  });
  const recorrentes = despesasQ.data?.recorrentes ?? [];
  const recorrenteRows = recorrentes.filter((d) => d.tipoEntry === "DESPESA_RECORRENTE").map(recRow);
  const impostoRows = recorrentes.filter((d) => d.tipoEntry === "DESPESA_IMPOSTO").map(recRow);
  const pontualRows: HubRow[] = (despesasQ.data?.pontuais ?? []).map((d) => ({
    key: `p${d.entryId}`,
    nome: d.descricao,
    sub: d.reembolsoPendente ? "pago pelo Gui · reembolso pendente" : undefined,
    valorCents: d.valorCents,
    vencInfo: vencCell(d.vencimento, d.vencimentoOriginal, null), vencimento: d.vencimento,
    status: d.status,
    locked: refClosed,
    onToggle: () => setStatusM.mutate({ id: d.entryId, status: d.status === "pago" ? "pendente" : "pago" }),
    actions: (
      <div className="inline-flex items-center gap-1">
        <button onClick={() => toggleReembolso.mutate({ id: d.entryId, reembolsoPendente: !d.reembolsoPendente })} className={`p-1.5 ${d.reembolsoPendente ? "text-amber-600" : "text-muted-foreground"} hover:text-amber-600`} title={d.reembolsoPendente ? "Pago pelo Gui (reembolso pendente) — clique p/ tirar" : "Marcar como pago pelo Gui (reembolso pendente)"}><ArrowLeftRight className="w-4 h-4" /></button>
        <button onClick={() => setEditPon({ id: d.entryId, descricao: d.descricao, valorCents: d.valorCents, vencimento: d.vencimento })} className="p-1.5 text-muted-foreground hover:text-foreground" title="Editar (descrição, valor, vencimento)"><Pencil className="w-4 h-4" /></button>
        <button onClick={() => { if (confirm("Excluir esta despesa pontual?")) delM.mutate({ id: d.entryId }); }} className="p-1.5 text-muted-foreground hover:text-destructive" title="Excluir"><Trash2 className="w-4 h-4" /></button>
      </div>
    ),
  }));
  const tabRows = custoTab === "recorrente" ? recorrenteRows : custoTab === "imposto" ? impostoRows : pontualRows;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <PeriodBar period={period} setPeriod={setPeriod} months={months} from={from} to={to} />
        {refClosed && <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30 gap-1"><Lock className="w-3 h-3" /> {formatMes(refMonth)} fechado</Badge>}
      </div>
      {/* TOPO — 2 blocos: (A) despesa em destaque · (B) concentração de custo */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card><CardContent className="p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Despesa · {periodLabel(period, from, to)}</p>
          <div className="flex items-end gap-3 mt-1 flex-wrap">
            <span className="text-3xl font-bold tabular-nums text-red-600">{centsToBRL(total)}</span>
            <span className="mb-1"><Delta value={total} media={ov?.despesaMedia6Cents ?? 0} higherIsBetter={false} /></span>
          </div>
          <div className="grid grid-cols-3 gap-3 mt-3">
            <div><p className="text-[11px] uppercase tracking-wide text-muted-foreground">Recorrente</p><p className="text-sm font-semibold tabular-nums">{centsToBRL(p?.recorrenteCents ?? 0)}</p><span className="text-[10px] text-muted-foreground">{pct(p?.recorrenteCents ?? 0)} · folha</span></div>
            <div><p className="text-[11px] uppercase tracking-wide text-muted-foreground">Imposto</p><p className="text-sm font-semibold tabular-nums">{centsToBRL(p?.impostoCents ?? 0)}</p><span className="text-[10px] text-muted-foreground">{pct(p?.impostoCents ?? 0)}</span></div>
            <div><p className="text-[11px] uppercase tracking-wide text-muted-foreground">Pontual</p><p className="text-sm font-semibold tabular-nums">{centsToBRL(p?.pontualCents ?? 0)}</p><span className="text-[10px] text-muted-foreground">{pct(p?.pontualCents ?? 0)}</span></div>
          </div>
          <div className="mt-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Pagamento de {formatMes(refMonth)}</p>
            <StatusBar pago={ov?.despesaStatus.pagoCents ?? 0} aVencer={ov?.despesaStatus.aVencerCents ?? 0} atrasado={ov?.despesaStatus.atrasadoCents ?? 0} />
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Concentração de custo · {periodLabel(period, from, to)}</p>
          <ConcentracaoDonut data={(concentracaoQ.data ?? []).map((x) => ({ nome: x.nome, totalCents: x.totalCents }))} />
        </CardContent></Card>
      </div>

      {/* Despesas do mês (Recorrente | Imposto | Pontual) */}
      <Card><CardContent className="p-4">
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <p className="text-sm font-semibold flex items-center gap-2"><Repeat className="w-4 h-4" /> Despesas · {formatMes(refMonth)}</p>
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-md border border-border overflow-hidden text-xs">
              <button onClick={() => setCustoTab("recorrente")} className={`px-3 py-1 ${custoTab === "recorrente" ? "bg-accent/20 font-semibold" : "text-muted-foreground"}`}>Recorrente ({recorrenteRows.length})</button>
              <button onClick={() => setCustoTab("imposto")} className={`px-3 py-1 border-l border-border ${custoTab === "imposto" ? "bg-accent/20 font-semibold" : "text-muted-foreground"}`}>Imposto ({impostoRows.length})</button>
              <button onClick={() => setCustoTab("pontual")} className={`px-3 py-1 border-l border-border ${custoTab === "pontual" ? "bg-accent/20 font-semibold" : "text-muted-foreground"}`}>Pontual ({pontualRows.length})</button>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button size="sm"><Plus className="w-4 h-4 mr-1" /> Novo</Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel>Adicionar despesa</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setNovo({ descricao: "", valor: "", tipoEntry: "DESPESA_RECORRENTE", dia: "", mesInicio: cur, mesSeguinte: false })}>Folha (colaborador)</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setNovo({ descricao: "", valor: "", tipoEntry: "DESPESA_IMPOSTO", dia: "", mesInicio: cur, mesSeguinte: false })}>Imposto</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setNovoPontual({ descricao: "", valor: "", venc: "", reembolso: true })}>Pontual / extra</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <HubTable rows={tabRows} nomeLabel="Fornecedor / pessoa" valorLabel="Valor" loading={despesasQ.isLoading} emptyMsg={custoTab === "pontual" ? "Nenhuma despesa pontual neste mês." : "Nenhuma despesa recorrente ativa neste mês."} />
        {encerradas.length > 0 && (
          <div className="mt-2 flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
            <span>Encerradas:</span>
            {encerradas.map((rec) => (
              <button key={rec.id} onClick={() => reativar.mutate({ recorrenciaId: rec.id })} className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 hover:border-accent/50 hover:bg-accent/5" title="Reativar">
                {rec.clienteNome} · reativar
              </button>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground mt-2">Impostos replicados são <span className="font-medium">estimativa</span>. Encerrar mantém o histórico pago e limpa apenas os meses futuros pendentes.</p>
      </CardContent></Card>

      {/* ── Divisor: Análise de custo (histórico) ────────────────────────────── */}
      <div className="flex items-center gap-3 pt-2">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1"><TrendingDown className="w-3.5 h-3.5" /> Análise de custo — histórico</span>
        <div className="h-px flex-1 bg-border" />
      </div>
      <Card><CardContent className="p-3">
        <p className="text-xs font-semibold mb-1 text-muted-foreground">Despesa por categoria ao longo dos meses (recorrente inclui folha da equipe)</p>
        {q.data ? <DespesaStackChart serie={q.data.serie} destaque={agencyCurrentMonthCli()} /> : <div className="h-[240px]" />}
      </CardContent></Card>

      {/* Dialog ajustar valor */}
      <Dialog open={!!ajuste} onOpenChange={(o) => !o && setAjuste(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Ajustar valor — {ajuste?.nome}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><label className="text-xs text-muted-foreground">Novo valor mensal</label><Input value={ajuste?.valor ?? ""} onChange={(e) => ajuste && setAjuste({ ...ajuste, valor: e.target.value })} placeholder="0,00" /></div>
            <label className="flex items-center gap-2 text-sm"><Switch checked={ajuste?.aplicarGerados ?? false} onCheckedChange={(v) => ajuste && setAjuste({ ...ajuste, aplicarGerados: !!v })} /> Aplicar também aos meses futuros já gerados (pendentes)</label>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setAjuste(null)}>Cancelar</Button><Button onClick={() => { if (!ajuste) return; const c = parseMoneyToCents(ajuste.valor); if (c == null || c < 0) return toast.error("Valor inválido."); ajustarValor.mutate({ recorrenciaId: ajuste.recorrenciaId, valorCents: c, aplicarGerados: ajuste.aplicarGerados }); }} disabled={ajustarValor.isPending}>Salvar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog nova despesa recorrente (folha/imposto) — mesmo padrão do contrato */}
      <Dialog open={!!novo} onOpenChange={(o) => !o && setNovo(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nova despesa recorrente — {novo?.tipoEntry === "DESPESA_IMPOSTO" ? "imposto" : "folha"}</DialogTitle></DialogHeader>
          {novo && (
            <div className="space-y-3">
              <Field label="Nome / descrição" full><Input value={novo.descricao} onChange={(e) => setNovo({ ...novo, descricao: e.target.value })} placeholder="Ex.: Salário — Fulano / DAS Simples" /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Valor padrão"><MoneyInput value={novo.valor} onChange={(v) => setNovo({ ...novo, valor: v })} /></Field>
                <Field label="Dia de vencimento"><Input value={novo.dia} onChange={(e) => setNovo({ ...novo, dia: e.target.value })} placeholder="5" /></Field>
                <Field label="Mês de início"><Input value={novo.mesInicio} onChange={(e) => setNovo({ ...novo, mesInicio: e.target.value })} placeholder="2026-07" /></Field>
                <Field label="Cobrança"><Select value={novo.mesSeguinte ? "pos" : "ant"} onValueChange={(v) => setNovo({ ...novo, mesSeguinte: v === "pos" })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ant">Antecipado (vence no mês)</SelectItem><SelectItem value="pos">Pós-pago (mês seguinte)</SelectItem></SelectContent></Select></Field>
              </div>
              {novo.tipoEntry === "DESPESA_IMPOSTO" && <p className="text-[11px] text-muted-foreground">Imposto entra como estimativa.</p>}
            </div>
          )}
          <DialogFooter><Button variant="outline" onClick={() => setNovo(null)}>Cancelar</Button><Button onClick={() => { if (!novo) return; if (!novo.descricao.trim()) return toast.error("Informe a descrição."); const c = parseMoneyToCents(novo.valor); if (c == null || c <= 0) return toast.error("Valor inválido."); if (!MES_RE.test(novo.mesInicio)) return toast.error("Mês de início inválido (YYYY-MM)."); const dia = novo.dia.trim() ? Number(novo.dia) : null; if (dia != null && (!Number.isInteger(dia) || dia < 1 || dia > 31)) return toast.error("Dia inválido (1–31)."); createDespesa.mutate({ descricao: novo.descricao.trim(), valorCents: c, tipoEntry: novo.tipoEntry, estimativa: novo.tipoEntry === "DESPESA_IMPOSTO", mesInicio: novo.mesInicio, diaVencimento: dia, vencimentoMesSeguinte: novo.mesSeguinte }); }} disabled={createDespesa.isPending}>Criar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog nova despesa pontual / extra */}
      <Dialog open={!!novoPontual} onOpenChange={(o) => !o && setNovoPontual(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nova despesa pontual / extra</DialogTitle></DialogHeader>
          {novoPontual && (
            <div className="space-y-3">
              <Field label="Descrição" full><Input value={novoPontual.descricao} onChange={(e) => setNovoPontual({ ...novoPontual, descricao: e.target.value })} placeholder="Ex.: Ferramenta X / Freela Y" /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Valor"><MoneyInput value={novoPontual.valor} onChange={(v) => setNovoPontual({ ...novoPontual, valor: v })} /></Field>
                <Field label="Vencimento (opcional)"><Input type="date" value={novoPontual.venc} onChange={(e) => setNovoPontual({ ...novoPontual, venc: e.target.value })} /></Field>
              </div>
              <label className="flex items-center gap-2 text-sm"><Switch checked={novoPontual.reembolso} onCheckedChange={(v) => setNovoPontual({ ...novoPontual, reembolso: !!v })} /> Pago pelo Gui (reembolso pendente)</label>
              <p className="text-[11px] text-muted-foreground">Pontual/extra vem marcado como reembolso por padrão. Conta 1× no P&amp;L; o reembolso alimenta o "falta receber" do Gui &amp; SELVA.</p>
            </div>
          )}
          <DialogFooter><Button variant="outline" onClick={() => setNovoPontual(null)}>Cancelar</Button><Button onClick={() => { if (!novoPontual) return; if (!novoPontual.descricao.trim()) return toast.error("Informe a descrição."); const c = parseMoneyToCents(novoPontual.valor); if (c == null || c <= 0) return toast.error("Valor inválido."); if (novoPontual.venc && !/^\d{4}-\d{2}-\d{2}$/.test(novoPontual.venc)) return toast.error("Data inválida."); createPontual.mutate({ mes: refMonth, tipo: "DESPESA_PONTUAL", descricao: novoPontual.descricao.trim(), valorCents: c, status: "pago", clienteId: null, reembolsoPendente: novoPontual.reembolso, ...(novoPontual.venc ? { vencimento: novoPontual.venc } : {}) }); }} disabled={createPontual.isPending}>Criar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog remarcar (mudar data de pagamento) */}
      <Dialog open={!!remarcar} onOpenChange={(o) => !o && setRemarcar(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Mudar data de pagamento</DialogTitle></DialogHeader>
          {remarcar && <Field label="Nova data de vencimento"><Input type="date" value={remarcar.venc} onChange={(e) => setRemarcar({ ...remarcar, venc: e.target.value })} /></Field>}
          <DialogFooter><Button variant="outline" onClick={() => setRemarcar(null)}>Cancelar</Button><Button onClick={() => { if (remarcar && /^\d{4}-\d{2}-\d{2}$/.test(remarcar.venc)) remarcarM.mutate({ id: remarcar.id, vencimento: remarcar.venc }); else toast.error("Data inválida."); }} disabled={remarcarM.isPending}>Salvar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <EditPontualDialog entry={editPon} onClose={() => setEditPon(null)} onSaved={invRec} label="despesa pontual" />

      {/* Backlog: "Custo por pessoa por período" exige canonicalizar nomes de despesa
          (como foi feito com clientes) — não implementado nesta rodada. */}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  Aba A Receber (aging)
// ═════════════════════════════════════════════════════════════════════════════
function AReceberTab({ mesTo }: { mesTo?: string }) {
  const q = trpc.finance.analytics.aReceber.useQuery(mesTo ? { mesTo } : undefined);
  const d = q.data;
  const bk = d?.buckets;
  const cards: { label: string; value: string; tone?: "neg" | "warn" }[] = [
    { label: "Total a receber", value: centsToBRL(d?.totalPendenteCents ?? 0), tone: "warn" },
    { label: "Vencido (≥ 1 mês)", value: centsToBRL(d?.totalVencidoCents ?? 0), tone: "neg" },
    { label: "A vencer / corrente", value: centsToBRL(bk?.corrente ?? 0) },
    { label: "1 mês", value: centsToBRL(bk?.m1 ?? 0), tone: "warn" },
    { label: "2 meses", value: centsToBRL(bk?.m2 ?? 0), tone: "neg" },
    { label: "3+ meses", value: centsToBRL(bk?.m3plus ?? 0), tone: "neg" },
    { label: "Sem data", value: centsToBRL(bk?.semData ?? 0) },
  ];
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        {cards.map((c, i) => (
          <div key={i} className="rounded-lg border border-border p-2.5 min-w-0">
            <p className="text-[11px] text-muted-foreground leading-tight truncate">{c.label}</p>
            <p className={`text-sm font-semibold tabular-nums mt-0.5 whitespace-nowrap ${c.tone === "neg" ? "text-red-600" : c.tone === "warn" ? "text-amber-600" : ""}`}>{c.value}</p>
          </div>
        ))}
      </div>
      {d && <p className="text-[11px] text-muted-foreground">Aging por vencimento · hoje {d.hoje} · vencidos + a vencer até {formatMes(d.mesTo)} (sem meses posteriores).</p>}
      {d && d.itens.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground text-sm">Nenhuma conta pendente. Marque uma receita como <span className="font-medium">pendente</span> (ou gere o próximo mês recorrente) para acompanhar o aging por vencimento.</CardContent></Card>
      ) : (
        <div className="rounded-lg border border-border overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead className="min-w-[160px]">Cliente / descrição</TableHead><TableHead className="w-[110px]">Vencimento</TableHead><TableHead className="text-right w-[120px]">Valor</TableHead><TableHead className="text-right w-[90px]">Idade</TableHead></TableRow></TableHeader>
            <TableBody>
              {q.isLoading && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6"><Loader2 className="w-4 h-4 animate-spin inline" /> Carregando…</TableCell></TableRow>}
              {(d?.itens ?? []).map((it, i) => (
                <TableRow key={i}>
                  <TableCell className="max-w-[220px]"><span className="inline-flex items-center gap-2 min-w-0">{it.cor && <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: it.cor }} />}<span className="truncate">{it.clienteNome !== "—" ? it.clienteNome : it.descricao}</span></span></TableCell>
                  <TableCell className="whitespace-nowrap text-xs">{it.vencimento ?? <span className="text-muted-foreground">sem data</span>}</TableCell>
                  <TableCell className="text-right whitespace-nowrap font-medium tabular-nums">{centsToBRL(it.valorCents)}</TableCell>
                  <TableCell className={`text-right whitespace-nowrap ${it.idade == null ? "text-muted-foreground" : it.idade >= 3 ? "text-red-600 font-medium" : it.idade >= 1 ? "text-amber-600" : ""}`}>{it.idade == null ? "—" : it.idade <= 0 ? "corrente" : `${it.idade} m`}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  Aba Gui & SELVA (inalterada do v2)
// ═════════════════════════════════════════════════════════════════════════════
type ReembRow = { id: number; mes: string; categoria: string; descricao: string; valorCents: number; quemPagou: string | null; reembolsado: boolean };
type RetiradaRow = { id: number; mes: string; descricao: string; valorCents: number };
type GsForm = { kind: "retirada"; id?: number; mes: string; descricao: string; valor: string } | { kind: "aporte"; id?: number; mes: string; descricao: string; valor: string };
type AporteRow = { id: number; mes: string; descricao: string; valorCents: number; status: "pago" | "pendente" };

function GuiSelvaTab({ months }: { months: string[] }) {
  const utils = trpc.useUtils();
  const [mes, setMes] = useState<string>(agencyCurrentMonthCli());
  const [form, setForm] = useState<GsForm | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [detail, setDetail] = useState<"lista" | "reembolsaveis" | "acumulado">("lista");
  const recQ = trpc.finance.reconciliacao.get.useQuery({ mes }, { enabled: MES_RE.test(mes) });
  const acumQ = trpc.finance.reconciliacao.acumulado.useQuery();
  const retirQ = trpc.finance.retiradas.list.useQuery({ mes }, { enabled: MES_RE.test(mes) });
  const aporteQ = trpc.finance.pnl.list.useQuery({ mesFrom: mes, mesTo: mes, tipo: "APORTE" }, { enabled: MES_RE.test(mes) });
  const retir = (retirQ.data ?? []) as RetiradaRow[]; const aportes = (aporteQ.data ?? []) as AporteRow[]; const rec = recQ.data;
  const mesesFechadosQ = trpc.finance.meses.list.useQuery();
  const mesClosed = (mesesFechadosQ.data ?? []).includes(mes);

  const onErr = (e: { message: string }) => toast.error(e.message);
  const invalidate = () => { utils.finance.retiradas.list.invalidate(); utils.finance.reconciliacao.invalidate(); utils.finance.months.invalidate(); utils.finance.pnl.invalidate(); utils.finance.overview.invalidate(); utils.finance.analytics.invalidate(); };
  const createAporte = trpc.finance.pnl.create.useMutation({ onSuccess: () => { invalidate(); setForm(null); toast.success("Aporte adicionado."); }, onError: onErr });
  const updateAporte = trpc.finance.pnl.update.useMutation({ onSuccess: () => { invalidate(); setForm(null); toast.success("Aporte atualizado."); }, onError: onErr });
  const delAporte = trpc.finance.pnl.delete.useMutation({ onSuccess: () => { invalidate(); toast.success("Aporte excluído."); }, onError: onErr });
  const createRetir = trpc.finance.retiradas.create.useMutation({ onSuccess: () => { invalidate(); setForm(null); toast.success("Retirada adicionada."); }, onError: onErr });
  const updateRetir = trpc.finance.retiradas.update.useMutation({ onSuccess: () => { invalidate(); setForm(null); toast.success("Retirada atualizada."); }, onError: onErr });
  const delRetir = trpc.finance.retiradas.delete.useMutation({ onSuccess: () => { invalidate(); toast.success("Excluída."); }, onError: onErr });
  const fecharMesM = trpc.finance.meses.fechar.useMutation({ onSuccess: (res) => { invalidate(); utils.finance.meses.list.invalidate(); toast.success(`Mês ${formatMes(res.mes)} fechado.${res.pendencias > 0 ? ` ${res.pendencias} pendência(s) travada(s).` : ""}`); }, onError: onErr });
  const reabrirMesM = trpc.finance.meses.reabrir.useMutation({ onSuccess: (res) => { invalidate(); utils.finance.meses.list.invalidate(); toast.success(`Mês ${formatMes(res.mes)} reaberto.`); }, onError: onErr });

  const submit = () => {
    if (!form) return;
    if (!MES_RE.test(form.mes)) return toast.error("Mês inválido (YYYY-MM).");
    if (!form.descricao.trim()) return toast.error("Informe a descrição.");
    const valorCents = parseMoneyToCents(form.valor);
    if (valorCents == null) return toast.error("Valor inválido.");
    if (form.kind === "retirada") { const p = { mes: form.mes, descricao: form.descricao.trim(), valorCents }; if (form.id) updateRetir.mutate({ id: form.id, ...p }); else createRetir.mutate(p); }
    else if (form.kind === "aporte") { if (form.id) updateAporte.mutate({ id: form.id, descricao: form.descricao.trim(), valorCents }); else createAporte.mutate({ mes: form.mes, tipo: "APORTE", descricao: form.descricao.trim(), valorCents, status: "pago", clienteId: null }); }
  };
  const saving = createRetir.isPending || updateRetir.isPending || createAporte.isPending || updateAporte.isPending;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <MonthNav mes={mes} onChange={setMes} months={months} />
        {mesClosed && <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30 gap-1"><Lock className="w-3 h-3" /> fechado</Badge>}
        <div className="ml-auto flex items-center gap-2">
          {MES_RE.test(mes) && (mesClosed
            ? <Button size="sm" variant="outline" onClick={() => reabrirMesM.mutate({ mes })} disabled={reabrirMesM.isPending}><Unlock className="w-4 h-4 mr-1" /> Reabrir mês</Button>
            : <Button size="sm" variant="outline" onClick={() => { if (confirm(`Fechar ${formatMes(mes)}? Ninguém poderá editar gastos/retiradas deste mês até reabrir.`)) fecharMesM.mutate({ mes }); }} disabled={fecharMesM.isPending}><Lock className="w-4 h-4 mr-1" /> Fechar mês</Button>)}
          <Button size="sm" disabled={mesClosed} title={mesClosed ? "Mês fechado — reabra para adicionar" : undefined} onClick={() => setChoosing(true)}><Plus className="w-4 h-4 mr-1" /> Adicionar</Button>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <button onClick={() => setDetail("reembolsaveis")} className={`text-left rounded-xl border p-3 transition hover:border-accent/50 hover:bg-accent/5 ${detail === "reembolsaveis" ? "border-accent/60 bg-accent/5" : "border-border"}`}>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">Despesas reembolsáveis <ChevronRight className="w-3 h-3" /></p>
          <p className="text-lg font-bold tabular-nums text-red-600">{centsToBRL(rec?.totalDespesasCents ?? 0)}</p>
        </button>
        <button onClick={() => setDetail("lista")} className={`text-left rounded-xl border p-3 transition hover:border-accent/50 hover:bg-accent/5 ${detail === "lista" ? "border-accent/60 bg-accent/5" : "border-border"}`}>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">Retiradas <ChevronRight className="w-3 h-3" /></p>
          <p className="text-lg font-bold tabular-nums">{centsToBRL(rec?.totalRetiradasCents ?? 0)}</p>
        </button>
        <div className="rounded-xl border border-border p-3">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Falta receber · {formatMes(mes)}</p>
          <p className={`text-lg font-bold tabular-nums ${(rec?.diferencaCents ?? 0) > 0 ? "text-amber-600" : (rec?.diferencaCents ?? 0) < 0 ? "text-emerald-600" : ""}`}>{centsToBRL(rec?.diferencaCents ?? 0)}</p>
        </div>
        <button onClick={() => setDetail("acumulado")} className={`text-left rounded-xl border p-3 transition hover:border-accent/50 hover:bg-accent/5 ${detail === "acumulado" ? "border-accent/60 bg-accent/5" : "border-border"}`}>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">Falta receber acumulado <ChevronRight className="w-3 h-3" /></p>
          <p className={`text-lg font-bold tabular-nums ${(acumQ.data?.diferencaCents ?? 0) > 0 ? "text-amber-600" : "text-emerald-600"}`}>{centsToBRL(acumQ.data?.diferencaCents ?? 0)}</p>
        </button>
      </div>
      <p className="text-[11px] text-muted-foreground">Falta receber = despesas pagas por você (reembolso pendente) − retiradas. Salários e impostos ficam fora.</p>

      {detail === "reembolsaveis" && (
        <Card><CardContent className="p-4">
          <p className="text-sm font-semibold mb-2 flex items-center gap-2"><ArrowLeftRight className="w-4 h-4" /> Despesas reembolsáveis · {formatMes(mes)} <span className="text-xs font-normal text-muted-foreground">— criadas na aba Despesas</span></p>
          <div className="rounded-md border border-border overflow-x-auto"><Table>
            <TableHeader><TableRow><TableHead>Descrição</TableHead><TableHead className="text-right">Valor</TableHead></TableRow></TableHeader>
            <TableBody>
              {(rec?.reembolsaveis ?? []).map((r, i) => <TableRow key={i}><TableCell>{r.descricao}</TableCell><TableCell className="text-right font-medium tabular-nums">{centsToBRL(r.valorCents)}</TableCell></TableRow>)}
              {(rec?.reembolsaveis.length ?? 0) === 0 && <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground py-6">Nenhuma despesa reembolsável neste mês.</TableCell></TableRow>}
            </TableBody>
          </Table></div>
        </CardContent></Card>
      )}
      {detail === "acumulado" && (
        <Card><CardContent className="p-4">
          <p className="text-sm font-semibold mb-2 flex items-center gap-2"><ArrowLeftRight className="w-4 h-4" /> Falta receber — breakdown por mês</p>
          <div className="rounded-md border border-border overflow-x-auto"><Table>
            <TableHeader><TableRow><TableHead>Mês</TableHead><TableHead className="text-right">Reembolsáveis</TableHead><TableHead className="text-right">Retiradas</TableHead><TableHead className="text-right">Diferença</TableHead></TableRow></TableHeader>
            <TableBody>
              {(acumQ.data?.porMes ?? []).map((r) => <TableRow key={r.mes}><TableCell className="whitespace-nowrap">{formatMes(r.mes)}</TableCell><TableCell className="text-right tabular-nums">{centsToBRL(r.despesasCents)}</TableCell><TableCell className="text-right tabular-nums">{centsToBRL(r.retiradasCents)}</TableCell><TableCell className={`text-right font-medium tabular-nums ${r.diferencaCents > 0 ? "text-amber-600" : "text-emerald-600"}`}>{centsToBRL(r.diferencaCents)}</TableCell></TableRow>)}
            </TableBody>
          </Table></div>
        </CardContent></Card>
      )}

      <Card><CardContent className="p-4">
        <p className="text-sm font-semibold mb-2 flex items-center gap-2"><ArrowLeftRight className="w-4 h-4" /> Retiradas e aportes · {formatMes(mes)}</p>
        <div className="rounded-md border border-border overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Tipo</TableHead><TableHead>Descrição</TableHead><TableHead>Detalhe</TableHead><TableHead className="text-right">Valor</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader>
          <TableBody>
            {(retirQ.isLoading || aporteQ.isLoading) && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6"><Loader2 className="w-4 h-4 animate-spin inline" /> Carregando…</TableCell></TableRow>}
            {!retirQ.isLoading && retir.length === 0 && aportes.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Nada neste mês.</TableCell></TableRow>}
            {retir.map((row) => (
              <TableRow key={`r${row.id}`}>
                <TableCell><Badge className="bg-blue-500/15 text-blue-600 border-blue-500/30">Retirada</Badge></TableCell>
                <TableCell className="max-w-[220px] truncate">{row.descricao}</TableCell>
                <TableCell className="text-xs text-muted-foreground">—</TableCell>
                <TableCell className="text-right whitespace-nowrap font-medium">{centsToBRL(row.valorCents)}</TableCell>
                <TableCell className="text-right whitespace-nowrap">{mesClosed ? <Lock className="w-3.5 h-3.5 text-muted-foreground inline" /> : <RowActions onEdit={() => setForm({ kind: "retirada", id: row.id, mes: row.mes, descricao: row.descricao, valor: centsToInput(row.valorCents) })} onDelete={() => delRetir.mutate({ id: row.id })} />}</TableCell>
              </TableRow>
            ))}
            {aportes.map((row) => (
              <TableRow key={`a${row.id}`}>
                <TableCell><Badge className="bg-violet-500/15 text-violet-600 border-violet-500/30">Aporte</Badge></TableCell>
                <TableCell className="max-w-[220px] truncate">{row.descricao}</TableCell>
                <TableCell className="text-xs text-muted-foreground">capital sócio↔empresa</TableCell>
                <TableCell className="text-right whitespace-nowrap font-medium">{centsToBRL(row.valorCents)}</TableCell>
                <TableCell className="text-right whitespace-nowrap">{mesClosed ? <Lock className="w-3.5 h-3.5 text-muted-foreground inline" /> : <RowActions onEdit={() => setForm({ kind: "aporte", id: row.id, mes: row.mes, descricao: row.descricao, valor: centsToInput(row.valorCents) })} onDelete={() => delAporte.mutate({ id: row.id })} />}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </div>
      </CardContent></Card>
      <Dialog open={choosing} onOpenChange={setChoosing}>
        <DialogContent>
          <DialogHeader><DialogTitle>Adicionar</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <button className="rounded-lg border border-border p-4 hover:border-primary/50 hover:bg-muted/30 text-left" onClick={() => { setChoosing(false); setForm({ kind: "retirada", mes, descricao: "", valor: "" }); }}><p className="text-sm font-medium">Retirada</p><p className="text-xs text-muted-foreground">Retirada Gui & SELVA</p></button>
            <button className="rounded-lg border border-border p-4 hover:border-primary/50 hover:bg-muted/30 text-left" onClick={() => { setChoosing(false); setForm({ kind: "aporte", mes, descricao: "", valor: "" }); }}><p className="text-sm font-medium">Aporte</p><p className="text-xs text-muted-foreground">Capital sócio↔empresa</p></button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{form?.id ? "Editar" : "Novo"} {form?.kind === "aporte" ? "aporte" : "retirada"}</DialogTitle></DialogHeader>
          {form && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Mês (YYYY-MM)"><Input value={form.mes} onChange={(e) => setForm({ ...form, mes: e.target.value })} placeholder="2026-07" /></Field>
              <Field label="Valor"><MoneyInput value={form.valor} onChange={(v) => setForm({ ...form, valor: v })} /></Field>
              <Field label="Descrição" full><Input value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} /></Field>
            </div>
          )}
          <DialogFooter><Button variant="outline" onClick={() => setForm(null)}>Cancelar</Button><Button onClick={submit} disabled={saving}>{saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Salvar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Página ────────────────────────────────────────────────────────────────────
export default function Finance() {
  const { user } = useAuth();
  const isAdmin = (user as { role?: string } | null)?.role === "admin";
  const monthsQ = trpc.finance.months.useQuery(undefined, { enabled: isAdmin });
  const clientesQ = trpc.finance.clientes.list.useQuery(undefined, { enabled: isAdmin });
  const months = monthsQ.data ?? [];
  const clientes = (clientesQ.data ?? []) as Cliente[];
  const clienteById = useMemo(() => new Map(clientes.map((c) => [c.id, c])), [clientes]);
  const [tab, setTab] = useState("visao");
  const [drill, setDrill] = useState<{ nonce: number; period?: PeriodState; sub?: string }>({ nonce: 0 });
  const navigate = (t: string, opts?: { period?: PeriodState; sub?: string }) => { setTab(t); if (opts) setDrill((d) => ({ nonce: d.nonce + 1, period: opts.period, sub: opts.sub })); };

  if (!isAdmin) return null;

  return (
    <HubShell>
      <main className="flex-1 overflow-auto p-6 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2"><Wallet className="w-5 h-5" /> Controle Financeiro</h1>
          <p className="text-sm text-muted-foreground mt-1">Visão geral · Clientes e projetos · Despesas · Gui &amp; SELVA.</p>
        </div>
        {months.length === 0 ? (
          <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Carregando…</p>
        ) : (
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="flex-wrap h-auto">
              <TabsTrigger value="visao">Visão geral</TabsTrigger>
              <TabsTrigger value="clientes"><Users className="w-3.5 h-3.5 mr-1" /> Clientes e projetos</TabsTrigger>
              <TabsTrigger value="despesas"><TrendingDown className="w-3.5 h-3.5 mr-1" /> Despesas</TabsTrigger>
              <TabsTrigger value="guiselva"><ArrowLeftRight className="w-3.5 h-3.5 mr-1" /> Gui &amp; SELVA</TabsTrigger>
            </TabsList>
            <TabsContent value="visao" className="mt-4"><PnlTab months={months} clientes={clientes} clienteById={clienteById} onNavigate={navigate} /></TabsContent>
            <TabsContent value="clientes" className="mt-4"><ClientesTab months={months} clientes={clientes} drill={drill} /></TabsContent>
            <TabsContent value="despesas" className="mt-4"><DespesasTab months={months} drill={drill} /></TabsContent>
            <TabsContent value="guiselva" className="mt-4"><GuiSelvaTab months={months} /></TabsContent>
          </Tabs>
        )}
      </div>
      </main>
    </HubShell>
  );
}
