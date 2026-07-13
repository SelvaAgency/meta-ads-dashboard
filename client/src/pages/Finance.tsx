/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Controle Financeiro v3 (admin) — período · P&L · Clientes (MRR/churn) ·
 *  Despesas · A Receber (aging) · Gui & SELVA
 * ─────────────────────────────────────────────────────────────────────────────
 *  Restrito a admin (front + finance.* = adminProcedure). Centavos int → BRL.
 *  `mes` = 'YYYY-MM' (aritmética inteira em string, sem Date/toISOString).
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useMemo, useState } from "react";
import { MetaDashboardLayout } from "@/components/MetaDashboardLayout";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Wallet, Plus, Pencil, Trash2, Loader2, ChevronLeft, ChevronRight, ArrowLeftRight, Users, TrendingDown, AlertTriangle, CalendarClock, Repeat } from "lucide-react";
import { ResponsiveContainer, ComposedChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from "recharts";
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

// ── Utils ────────────────────────────────────────────────────────────────────
const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const centsToBRL = (c: number) => BRL.format((c ?? 0) / 100);
const MES_ABBR = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const pad2 = (n: number) => String(n).padStart(2, "0");
function formatMes(mes: string): string { const [y, m] = (mes ?? "").split("-"); return `${MES_ABBR[Number(m) - 1] ?? m}/${y}`; }
function addMonths(ymd: string, delta: number): string { const [y, m] = ymd.split("-").map(Number); const idx = y * 12 + (m - 1) + delta; return `${Math.floor(idx / 12)}-${pad2((idx % 12) + 1)}`; }
function monthsBetween(a: string, b: string): number { const [ay, am] = a.split("-").map(Number); const [by, bm] = b.split("-").map(Number); return (by * 12 + bm) - (ay * 12 + am); }
// Mês corrente no fuso da agência (sem toISOString).
function agencyCurrentMonthCli(): string { return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).format(new Date()); }
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
function TrendChart({ data }: { data: TrendPoint[] }) {
  // Resultado sólido até o último mês realizado; projeção (futuro) tracejada.
  let lastReal = -1;
  data.forEach((t, i) => { if (t.receitaPagoCents > 0 || t.despesaPagoCents > 0) lastReal = i; });
  const d = data.map((t, i) => ({
    mes: formatMes(t.mes), Receita: t.receitaCents / 100, Despesa: t.despesaCents / 100,
    Resultado: i <= lastReal ? t.resultadoCents / 100 : null,
    "Resultado projetado": i >= lastReal ? t.resultadoCents / 100 : null,
  }));
  return (
    <ResponsiveContainer width="100%" height={220}>
      <ComposedChart data={d} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
        <XAxis dataKey="mes" tick={{ fontSize: 11 }} /><YAxis tickFormatter={axisFmt} tick={{ fontSize: 11 }} width={40} />
        <Tooltip formatter={(v: number) => tipTxt(v)} /><Legend wrapperStyle={{ fontSize: 12 }} />
        <Line type="linear" dataKey="Receita" stroke="#16A34A" strokeWidth={2} dot={{ r: 2 }} />
        <Line type="linear" dataKey="Despesa" stroke="#DC2626" strokeWidth={2} dot={{ r: 2 }} />
        <Line type="linear" dataKey="Resultado" stroke="#2563EB" strokeWidth={2} dot={{ r: 2 }} connectNulls={false} />
        <Line type="linear" dataKey="Resultado projetado" stroke="#2563EB" strokeWidth={2} strokeDasharray="5 4" dot={false} connectNulls={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
function MixChart({ data }: { data: TrendPoint[] }) {
  const d = data.map((t) => ({ mes: formatMes(t.mes), Recorrente: t.receitaRecorrenteCents / 100, Pontual: t.receitaPontualCents / 100 }));
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={d} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
        <XAxis dataKey="mes" tick={{ fontSize: 11 }} /><YAxis tickFormatter={axisFmt} tick={{ fontSize: 11 }} width={40} />
        <Tooltip formatter={(v: number) => tipTxt(v)} /><Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="Recorrente" stackId="r" fill="#3B54E6" /><Bar dataKey="Pontual" stackId="r" fill="#EF701B" />
      </BarChart>
    </ResponsiveContainer>
  );
}
function MrrChart({ serie }: { serie: { mes: string; mrrCents: number }[] }) {
  const d = serie.map((s) => ({ mes: formatMes(s.mes), MRR: s.mrrCents / 100 }));
  return (
    <ResponsiveContainer width="100%" height={200}>
      <ComposedChart data={d} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
        <XAxis dataKey="mes" tick={{ fontSize: 11 }} /><YAxis tickFormatter={axisFmt} tick={{ fontSize: 11 }} width={40} />
        <Tooltip formatter={(v: number) => tipTxt(v)} />
        <Line type="linear" dataKey="MRR" stroke="#3B54E6" strokeWidth={2} dot={{ r: 2 }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
function DespesaStackChart({ serie }: { serie: { mes: string; recorrenteCents: number; impostoCents: number; pontualCents: number }[] }) {
  const d = serie.map((s) => ({ mes: formatMes(s.mes), Recorrente: s.recorrenteCents / 100, Imposto: s.impostoCents / 100, Pontual: s.pontualCents / 100 }));
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={d} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
        <XAxis dataKey="mes" tick={{ fontSize: 11 }} /><YAxis tickFormatter={axisFmt} tick={{ fontSize: 11 }} width={40} />
        <Tooltip formatter={(v: number) => tipTxt(v)} /><Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="Recorrente" stackId="d" fill="#DC2626" /><Bar dataKey="Imposto" stackId="d" fill="#D97706" /><Bar dataKey="Pontual" stackId="d" fill="#9333EA" />
      </BarChart>
    </ResponsiveContainer>
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
//  Aba P&L
// ═════════════════════════════════════════════════════════════════════════════
type PnlRow = { id: number; mes: string; tipo: string; descricao: string; valorCents: number; status: "pago" | "pendente"; clienteId: number | null; vencimento: string | null; vencimentoOriginal: string | null; origem: "MANUAL" | "RECORRENCIA" | "PROJETO"; parcelaNum: number | null; parcelaTotal: number | null };
type PnlForm = { id?: number; mes: string; tipo: PnlTipo; descricao: string; valor: string; status: "pago" | "pendente"; clienteId: number | null; vencimento: string };
type ProjParcela = { valor: string; vencimento: string };
type ProjForm = { clienteId: number | null; nome: string; parcelas: ProjParcela[] };

function PnlTab({ months, clientes, clienteById }: { months: string[]; clientes: Cliente[]; clienteById: Map<number, Cliente> }) {
  const utils = trpc.useUtils();
  const [period, setPeriod] = useState<PeriodState>(defaultPeriod(months[0] ?? ""));
  const { from, to, refMonth } = periodRange(period, months);
  const [tipo, setTipo] = useState(""); const [status, setStatus] = useState(""); const [clienteFilter, setClienteFilter] = useState<number | "">("");
  const [form, setForm] = useState<PnlForm | null>(null);
  const [projForm, setProjForm] = useState<ProjForm | null>(null);
  const [remarcar, setRemarcar] = useState<{ id: number; venc: string } | null>(null);

  const resumoQ = trpc.finance.analytics.periodoResumo.useQuery({ mesFrom: from, mesTo: to }, { enabled: MES_RE.test(from) && MES_RE.test(to) });
  const mrrQ = trpc.finance.analytics.mrr.useQuery({ mes: refMonth }, { enabled: MES_RE.test(refMonth) });
  const listQ = trpc.finance.pnl.list.useQuery({ mesFrom: from, mesTo: to, ...(tipo ? { tipo: tipo as PnlTipo } : {}), ...(status ? { status: status as "pago" | "pendente" } : {}), ...(clienteFilter ? { clienteId: clienteFilter } : {}) }, { enabled: MES_RE.test(from) });
  const trendQ = trpc.finance.pnl.trend.useQuery({ limitMonths: 12 });
  const proximoMesQ = trpc.finance.recorrencia.proximoMes.useQuery();
  const rows = (listQ.data ?? []) as PnlRow[];
  const r = resumoQ.data;
  const margem = r && r.receitaTotalCents > 0 ? `${Math.round((r.resultadoFinalCents / r.receitaTotalCents) * 100)}%` : "—";
  const rpHint = (real: number, prev: number) => `Real ${centsToBRL(real)} · Prev ${centsToBRL(prev)}`;

  const invalidate = () => { utils.finance.pnl.list.invalidate(); utils.finance.analytics.invalidate(); utils.finance.pnl.trend.invalidate(); utils.finance.months.invalidate(); utils.finance.recorrencia.invalidate(); };
  const create = trpc.finance.pnl.create.useMutation({ onSuccess: () => { invalidate(); setForm(null); toast.success("Lançamento criado."); } });
  const update = trpc.finance.pnl.update.useMutation({ onSuccess: () => { invalidate(); setForm(null); toast.success("Lançamento atualizado."); } });
  const del = trpc.finance.pnl.delete.useMutation({ onSuccess: () => { invalidate(); toast.success("Excluído."); } });
  const setStatusM = trpc.finance.pnl.setStatus.useMutation({ onSuccess: () => { utils.finance.pnl.list.invalidate(); utils.finance.analytics.invalidate(); utils.finance.pnl.trend.invalidate(); } });
  const remarcarM = trpc.finance.pnl.remarcar.useMutation({ onSuccess: () => { invalidate(); setRemarcar(null); toast.success("Vencimento remarcado."); } });
  const gerar = trpc.finance.recorrencia.gerar.useMutation({ onSuccess: (res) => { invalidate(); toast.success(res.criadas > 0 ? `${res.criadas} recorrentes gerados em ${res.mes}.` : `Nada a gerar em ${res.mes} (já existem).`); } });
  const projCreate = trpc.finance.projetos.create.useMutation({ onSuccess: (res) => { invalidate(); utils.finance.projetos.list.invalidate(); setProjForm(null); toast.success(`Projeto criado (${res.criadas} parcelas).`); } });

  const detalhe = useMemo(() => {
    const recPorCliente = new Map<number | string, { nome: string; cliente?: Cliente; cents: number }>();
    const pontual: PnlRow[] = []; let despRec = 0, despImp = 0, despPon = 0, aporte = 0;
    for (const row of rows) {
      if (row.tipo === "RECEITA_RECORRENTE") { const k = row.clienteId ?? "sem"; const c = row.clienteId ? clienteById.get(row.clienteId) : undefined; if (!recPorCliente.has(k)) recPorCliente.set(k, { nome: c?.nome ?? "Sem cliente", cliente: c, cents: 0 }); recPorCliente.get(k)!.cents += row.valorCents; }
      else if (row.tipo === "RECEITA_PONTUAL") pontual.push(row);
      else if (row.tipo === "DESPESA_RECORRENTE") despRec += row.valorCents;
      else if (row.tipo === "DESPESA_IMPOSTO") despImp += row.valorCents;
      else if (row.tipo === "DESPESA_PONTUAL") despPon += row.valorCents;
      else if (row.tipo === "APORTE") aporte += row.valorCents;
    }
    return { recArr: Array.from(recPorCliente.values()).sort((a, b) => b.cents - a.cents), pontual, despRec, despImp, despPon, aporte };
  }, [rows, clienteById]);

  const submit = () => {
    if (!form) return;
    if (!MES_RE.test(form.mes)) return toast.error("Mês inválido (YYYY-MM).");
    if (!form.descricao.trim()) return toast.error("Informe a descrição.");
    const valorCents = parseMoneyToCents(form.valor);
    if (valorCents == null) return toast.error("Valor inválido.");
    const payload = { mes: form.mes, tipo: form.tipo, descricao: form.descricao.trim(), valorCents, status: form.status, clienteId: tipoKind(form.tipo) === "receita" ? form.clienteId : null };
    if (form.id) update.mutate({ id: form.id, ...payload });
    else create.mutate({ ...payload, ...(form.vencimento ? { vencimento: form.vencimento } : {}) });
  };
  const isReceitaForm = form ? tipoKind(form.tipo) === "receita" : false;

  const projTotal = projForm ? projForm.parcelas.reduce((s, p) => s + (parseMoneyToCents(p.valor) ?? 0), 0) : 0;
  const submitProj = () => {
    if (!projForm) return;
    if (!projForm.nome.trim()) return toast.error("Informe o nome do projeto.");
    const parcelas = projForm.parcelas.map((p) => ({ valorCents: parseMoneyToCents(p.valor), vencimento: p.vencimento }));
    if (parcelas.some((p) => p.valorCents == null || p.valorCents <= 0)) return toast.error("Valor de parcela inválido.");
    if (parcelas.some((p) => !/^\d{4}-\d{2}-\d{2}$/.test(p.vencimento))) return toast.error("Data de parcela inválida (YYYY-MM-DD).");
    projCreate.mutate({ clienteId: projForm.clienteId, nome: projForm.nome.trim(), parcelas: parcelas as { valorCents: number; vencimento: string }[] });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <PeriodBar period={period} setPeriod={setPeriod} months={months} from={from} to={to} />
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => proximoMesQ.data && gerar.mutate({ mes: proximoMesQ.data })} disabled={gerar.isPending || !proximoMesQ.data}>
            {gerar.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />} Gerar {proximoMesQ.data ? formatMes(proximoMesQ.data) : "próximo mês"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setProjForm({ clienteId: null, nome: "", parcelas: [{ valor: "", vencimento: "" }, { valor: "", vencimento: "" }] })}>Projeto</Button>
          <Button size="sm" onClick={() => setForm({ mes: refMonth, tipo: "DESPESA_PONTUAL", descricao: "", valor: "", status: "pendente", clienteId: null, vencimento: "" })}><Plus className="w-4 h-4 mr-1" /> Lançamento</Button>
        </div>
      </div>

      {/* Cards: Realizado × Previsto */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <Stat label="Receita" value={centsToBRL(r?.receitaTotalCents ?? 0)} tone="pos" hint={r ? rpHint(r.receitaRealizadaCents, r.receitaPrevistaCents) : ""} />
        <Stat label="Despesa" value={centsToBRL(r?.despesaTotalCents ?? 0)} tone="neg" hint={r ? rpHint(r.despesaRealizadaCents, r.despesaPrevistaCents) : ""} />
        <Stat label="Resultado" value={centsToBRL(r?.resultadoFinalCents ?? 0)} tone={(r?.resultadoFinalCents ?? 0) >= 0 ? "pos" : "neg"} hint={r ? rpHint(r.resultadoRealizadoCents, r.resultadoPrevistoCents) : ""} />
        <Stat label="Margem" value={margem} tone={(r?.resultadoFinalCents ?? 0) >= 0 ? "pos" : "neg"} />
        <Stat label={`MRR (${formatMes(refMonth)})`} value={centsToBRL(mrrQ.data?.mrrCents ?? 0)} hint="métrica de 1 mês" />
        <Stat label="A receber (previsto)" value={centsToBRL(r?.totalPendenteCents ?? 0)} tone="warn" />
      </div>
      {(r?.aporteCents ?? 0) > 0 && <div className="grid grid-cols-2 md:grid-cols-4 gap-3"><Stat label="Aporte" value={centsToBRL(r!.aporteCents)} /></div>}
      {from > (months[0] ?? "") && <p className="text-[11px] text-amber-600">Período no futuro — os valores são 100% previstos (pendentes).</p>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card><CardContent className="p-3"><p className="text-xs font-semibold mb-1 text-muted-foreground">Tendência (12m) — realizado sólido, projeção tracejada</p>{trendQ.data ? <TrendChart data={trendQ.data} /> : <div className="h-[220px]" />}</CardContent></Card>
        <Card><CardContent className="p-3"><p className="text-xs font-semibold mb-1 text-muted-foreground">Receita: recorrente × pontual</p>{trendQ.data ? <MixChart data={trendQ.data} /> : <div className="h-[220px]" />}</CardContent></Card>
      </div>

      <Card><CardContent className="p-4 space-y-3">
        <p className="text-sm font-semibold">Detalhamento — {periodLabel(period, from, to)}</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-xs uppercase tracking-wide text-emerald-600 font-semibold mb-1">Receita recorrente · {centsToBRL(detalhe.recArr.reduce((s, x) => s + x.cents, 0))}</p>
            {detalhe.recArr.length === 0 && <p className="text-xs text-muted-foreground">—</p>}
            {detalhe.recArr.map((x, i) => <div key={i} className="flex items-center justify-between py-0.5"><span>{x.cliente ? <ClientTag cliente={x.cliente} /> : <span className="text-muted-foreground">{x.nome}</span>}</span><span className="tabular-nums">{centsToBRL(x.cents)}</span></div>)}
            <p className="text-xs uppercase tracking-wide text-emerald-600 font-semibold mt-3 mb-1">Receita pontual · {centsToBRL(detalhe.pontual.reduce((s, x) => s + x.valorCents, 0))}</p>
            {detalhe.pontual.length === 0 && <p className="text-xs text-muted-foreground">—</p>}
            {detalhe.pontual.slice(0, 40).map((x) => <div key={x.id} className="flex items-center justify-between py-0.5"><span className="truncate mr-2">{x.descricao}</span><span className="tabular-nums whitespace-nowrap">{centsToBRL(x.valorCents)}</span></div>)}
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-red-600 font-semibold mb-1">Despesas</p>
            <div className="flex items-center justify-between py-0.5"><span>Recorrente <span className="text-[10px] text-muted-foreground">(inclui folha)</span></span><span className="tabular-nums">{centsToBRL(detalhe.despRec)}</span></div>
            <div className="flex items-center justify-between py-0.5"><span>Imposto</span><span className="tabular-nums">{centsToBRL(detalhe.despImp)}</span></div>
            <div className="flex items-center justify-between py-0.5"><span>Pontual</span><span className="tabular-nums">{centsToBRL(detalhe.despPon)}</span></div>
            <div className="flex items-center justify-between py-0.5 font-semibold border-t border-border mt-1 pt-1"><span>Total despesa</span><span className="tabular-nums">{centsToBRL(detalhe.despRec + detalhe.despImp + detalhe.despPon)}</span></div>
            {detalhe.aporte > 0 && <div className="flex items-center justify-between py-0.5 mt-2"><span>Aporte</span><span className="tabular-nums">{centsToBRL(detalhe.aporte)}</span></div>}
          </div>
        </div>
      </CardContent></Card>

      <div className="flex flex-wrap items-end gap-2">
        <FilterSelect label="Tipo" value={tipo} onChange={setTipo} options={PNL_TIPOS.map((t) => t.v)} format={tipoLabel} allLabel="Todos" />
        <FilterSelect label="Status" value={status} onChange={setStatus} options={["pago", "pendente"]} format={(s) => (s === "pago" ? "Pago" : "Pendente")} allLabel="Todos" />
        <div className="flex flex-col gap-1"><Label className="text-[11px] text-muted-foreground">Cliente</Label>
          <Select value={clienteFilter ? String(clienteFilter) : "__all__"} onValueChange={(v) => setClienteFilter(v === "__all__" ? "" : Number(v))}>
            <SelectTrigger className="h-9 w-[170px]"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="__all__">Todos</SelectItem>{clientes.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.nome}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      <div className="rounded-lg border border-border overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Mês</TableHead><TableHead>Tipo</TableHead><TableHead>Descrição</TableHead><TableHead>Cliente</TableHead><TableHead>Vencimento</TableHead><TableHead className="text-right">Valor</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader>
          <TableBody>
            {listQ.isLoading && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6"><Loader2 className="w-4 h-4 animate-spin inline" /> Carregando…</TableCell></TableRow>}
            {!listQ.isLoading && rows.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">Nenhum lançamento no período/filtro.</TableCell></TableRow>}
            {rows.slice(0, 300).map((row) => {
              const remarcado = row.vencimento && row.vencimentoOriginal && row.vencimento !== row.vencimentoOriginal;
              return (
                <TableRow key={row.id}>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatMes(row.mes)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 flex-wrap">
                      <Badge variant="secondary" className="font-normal whitespace-nowrap">{tipoLabel(row.tipo)}</Badge>
                      {row.origem === "RECORRENCIA" && <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/20 text-[9px] px-1">rec</Badge>}
                      {row.origem === "PROJETO" && <Badge className="bg-purple-500/10 text-purple-600 border-purple-500/20 text-[9px] px-1">proj {row.parcelaNum}/{row.parcelaTotal}</Badge>}
                    </div>
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate">{row.descricao}</TableCell>
                  <TableCell>{row.clienteId ? <ClientTag cliente={clienteById.get(row.clienteId)} /> : <span className="text-muted-foreground text-xs">—</span>}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs">
                    {row.vencimento ? row.vencimento : <span className="text-muted-foreground">—</span>}
                    {remarcado && <Badge className="ml-1 bg-amber-500/15 text-amber-600 border-amber-500/30 text-[9px] px-1">Remarcado</Badge>}
                  </TableCell>
                  <TableCell className={`text-right whitespace-nowrap font-medium ${tipoKind(row.tipo) === "despesa" ? "text-red-600" : tipoKind(row.tipo) === "receita" ? "text-emerald-600" : ""}`}>{tipoKind(row.tipo) === "despesa" ? "-" : ""}{centsToBRL(row.valorCents)}</TableCell>
                  <TableCell><button onClick={() => setStatusM.mutate({ id: row.id, status: row.status === "pago" ? "pendente" : "pago" })}><Badge className={row.status === "pago" ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/30" : "bg-amber-500/15 text-amber-600 border-amber-500/30"}>{row.status === "pago" ? "Pago" : "Pendente"}</Badge></button></TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-1">
                      <button onClick={() => setRemarcar({ id: row.id, venc: row.vencimento ?? "" })} className="p-1.5 text-muted-foreground hover:text-foreground" title="Remarcar vencimento"><CalendarClock className="w-4 h-4" /></button>
                      <RowActions onEdit={() => setForm({ id: row.id, mes: row.mes, tipo: row.tipo as PnlTipo, descricao: row.descricao, valor: centsToInput(row.valorCents), status: row.status, clienteId: row.clienteId, vencimento: row.vencimento ?? "" })} onDelete={() => del.mutate({ id: row.id })} />
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Dialog lançamento */}
      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{form?.id ? "Editar lançamento" : "Novo lançamento"}</DialogTitle></DialogHeader>
          {form && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Mês (YYYY-MM)"><Input value={form.mes} onChange={(e) => setForm({ ...form, mes: e.target.value })} placeholder="2026-07" /></Field>
              <Field label="Tipo"><Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v as PnlTipo })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{PNL_TIPOS.map((t) => <SelectItem key={t.v} value={t.v}>{t.label}</SelectItem>)}</SelectContent></Select></Field>
              <Field label="Descrição" full><Input value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} /></Field>
              {isReceitaForm && <Field label="Cliente" full><ClienteSelect value={form.clienteId} onChange={(id) => setForm({ ...form, clienteId: id })} clientes={clientes} /></Field>}
              <Field label="Valor"><MoneyInput value={form.valor} onChange={(v) => setForm({ ...form, valor: v })} /></Field>
              <Field label="Status"><Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as "pago" | "pendente" })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="pendente">Pendente</SelectItem><SelectItem value="pago">Pago</SelectItem></SelectContent></Select></Field>
              {!form.id && <Field label="Vencimento (opcional)" full><Input type="date" value={form.vencimento} onChange={(e) => setForm({ ...form, vencimento: e.target.value })} /></Field>}
            </div>
          )}
          <DialogFooter><Button variant="outline" onClick={() => setForm(null)}>Cancelar</Button><Button onClick={submit} disabled={create.isPending || update.isPending}>{(create.isPending || update.isPending) && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Salvar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog remarcar */}
      <Dialog open={!!remarcar} onOpenChange={(o) => !o && setRemarcar(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Remarcar vencimento</DialogTitle></DialogHeader>
          {remarcar && <Field label="Nova data de vencimento"><Input type="date" value={remarcar.venc} onChange={(e) => setRemarcar({ ...remarcar, venc: e.target.value })} /></Field>}
          <DialogFooter><Button variant="outline" onClick={() => setRemarcar(null)}>Cancelar</Button><Button onClick={() => { if (remarcar && /^\d{4}-\d{2}-\d{2}$/.test(remarcar.venc)) remarcarM.mutate({ id: remarcar.id, vencimento: remarcar.venc }); else toast.error("Data inválida."); }} disabled={remarcarM.isPending}>Salvar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog projeto parcelado */}
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
                <div className="flex items-center justify-between mb-1"><Label className="text-xs">Parcelas (valor + vencimento)</Label><span className="text-xs text-muted-foreground">Total: {centsToBRL(projTotal)}</span></div>
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
          <DialogFooter><Button variant="outline" onClick={() => setProjForm(null)}>Cancelar</Button><Button onClick={submitProj} disabled={projCreate.isPending}>{projCreate.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Criar projeto</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  Aba Clientes (MRR + movimento + churn + receita por cliente)
// ═════════════════════════════════════════════════════════════════════════════
type QualRow = { clienteId: number | null; nome: string; cor: string | null; mesesAtivos: number; totalCents: number; mediaCents: number; primeiroMes: string; ultimoMes: string; status: "ativo" | "churned" | "pontual" };

function ClientesTab({ months }: { months: string[] }) {
  const [period, setPeriod] = useState<PeriodState>(defaultPeriod(months[0] ?? ""));
  const { from, to, refMonth } = periodRange(period, months);
  const [escopo, setEscopo] = useState<"vitalicio" | "periodo">("vitalicio");
  const [sortKey, setSortKey] = useState<keyof QualRow>("mediaCents");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const utils = trpc.useUtils();
  const [ajuste, setAjuste] = useState<{ recorrenciaId: number; nome: string; valor: string; aplicarGerados: boolean } | null>(null);
  const mrrQ = trpc.finance.analytics.mrr.useQuery({ mes: refMonth }, { enabled: MES_RE.test(refMonth) });
  const churnQ = trpc.finance.analytics.churn.useQuery({ mesFrom: from, mesTo: to, limitMonths: 12 }, { enabled: MES_RE.test(from) });
  const qualQ = trpc.finance.analytics.qualidadeClientes.useQuery(escopo === "periodo" ? { mesFrom: from, mesTo: to } : {}, { enabled: escopo === "vitalicio" || MES_RE.test(from) });
  const recQ = trpc.finance.recorrencia.list.useQuery();
  const m = mrrQ.data;
  const ch = churnQ.data;
  const summary = qualQ.data?.summary;

  const invRec = () => { utils.finance.recorrencia.invalidate(); utils.finance.pnl.list.invalidate(); utils.finance.analytics.invalidate(); utils.finance.pnl.trend.invalidate(); };
  const marcarSaida = trpc.finance.recorrencia.marcarSaida.useMutation({ onSuccess: (res) => { invRec(); toast.success(`Saída marcada. ${res.removidas} linha(s) futura(s) pendente(s) removida(s).`); } });
  const reativar = trpc.finance.recorrencia.reativar.useMutation({ onSuccess: () => { invRec(); toast.success("Recorrência reativada."); } });
  const ajustarValor = trpc.finance.recorrencia.ajustarValor.useMutation({ onSuccess: () => { invRec(); setAjuste(null); toast.success("Valor recorrente ajustado."); } });

  const qualRows = useMemo(() => {
    const rows = ((qualQ.data?.rows ?? []) as QualRow[]).slice();
    rows.sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [qualQ.data, sortKey, sortDir]);

  const sortHead = (key: keyof QualRow, label: string, align?: string) => (
    <TableHead className={`cursor-pointer select-none ${align ?? ""}`} onClick={() => { if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc")); else { setSortKey(key); setSortDir("desc"); } }}>
      {label}{sortKey === key ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
    </TableHead>
  );
  const statusBadge = (s: string) => s === "ativo" ? <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30">Ativo</Badge> : s === "churned" ? <Badge className="bg-red-500/15 text-red-600 border-red-500/30">Churned</Badge> : <Badge variant="secondary" className="font-normal">Pontual</Badge>;

  const cur = agencyCurrentMonthCli();

  return (
    <div className="space-y-5">
      <PeriodBar period={period} setPeriod={setPeriod} months={months} from={from} to={to} />

      {/* Recorrências (assinaturas) — ajustar valor · marcar saída · reativar */}
      <Card><CardContent className="p-4">
        <p className="text-sm font-semibold mb-2 flex items-center gap-2"><Repeat className="w-4 h-4" /> Recorrências (assinaturas)</p>
        <div className="max-h-72 overflow-y-auto rounded-md border border-border">
          <Table>
            <TableHeader><TableRow><TableHead>Cliente</TableHead><TableHead className="text-right">Valor mensal</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader>
            <TableBody>
              {recQ.isLoading && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6"><Loader2 className="w-4 h-4 animate-spin inline" /> Carregando…</TableCell></TableRow>}
              {(recQ.data ?? []).map((rec) => (
                <TableRow key={rec.id}>
                  <TableCell><span className="inline-flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ background: rec.cor ?? "#64748b" }} />{rec.clienteNome}</span></TableCell>
                  <TableCell className="text-right whitespace-nowrap font-medium">{centsToBRL(rec.valorCents)}</TableCell>
                  <TableCell>{rec.ativo ? <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30">Ativa</Badge> : <Badge className="bg-red-500/15 text-red-600 border-red-500/30">Saiu {rec.churnMes ? formatMes(rec.churnMes) : ""}</Badge>}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-1">
                      <button onClick={() => setAjuste({ recorrenciaId: rec.id, nome: rec.clienteNome, valor: centsToInput(rec.valorCents), aplicarGerados: false })} className="p-1.5 text-muted-foreground hover:text-foreground" title="Ajustar valor recorrente"><Pencil className="w-4 h-4" /></button>
                      {rec.ativo
                        ? <button onClick={() => { if (confirm(`Marcar saída de ${rec.clienteNome}? Remove os meses futuros pendentes (não mexe nos pagos).`)) marcarSaida.mutate({ recorrenciaId: rec.id, mes: cur }); }} className="p-1.5 text-muted-foreground hover:text-destructive" title="Marcar saída (churn)"><TrendingDown className="w-4 h-4" /></button>
                        : <button onClick={() => reativar.mutate({ recorrenciaId: rec.id })} className="text-xs text-accent px-1" title="Reativar">reativar</button>}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {!recQ.isLoading && (recQ.data?.length ?? 0) === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">Nenhuma recorrência. Rode o setup:recorrencia.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
      </CardContent></Card>

      {/* MRR + movimento */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Stat label={`MRR (${formatMes(refMonth)})`} value={centsToBRL(m?.mrrCents ?? 0)} />
        <Stat label="Δ vs mês anterior" value={centsToBRL(m?.deltaCents ?? 0)} tone={(m?.deltaCents ?? 0) >= 0 ? "pos" : "neg"} />
        <Stat label="Novos" value={centsToBRL(m?.novosCents ?? 0)} tone="pos" />
        <Stat label="Expansão" value={centsToBRL(m?.expansaoCents ?? 0)} tone="pos" />
        <Stat label="Contração" value={`-${centsToBRL(m?.contracaoCents ?? 0)}`} tone="neg" />
        <Stat label="Churn (mês)" value={`-${centsToBRL(m?.churnCents ?? 0)}`} tone="neg" />
      </div>
      <Card><CardContent className="p-3"><p className="text-xs font-semibold mb-1 text-muted-foreground">MRR — últimos 12 meses</p>{m ? <MrrChart serie={m.serie} /> : <div className="h-[200px]" />}</CardContent></Card>

      {/* Churn — headline do PERÍODO + timeline */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label={`MRR perdido · ${periodLabel(period, from, to)}`} value={centsToBRL(ch?.periodoPerdidoCents ?? 0)} tone="neg" />
        <Stat label="Clientes ativos" value={String(ch?.ativos ?? 0)} tone="pos" hint={ch ? `recorrente em ${formatMes(ch.mesReferencia)}` : ""} />
        <Stat label="Churned (histórico)" value={String(ch?.churnedCount ?? 0)} tone="neg" />
        <Stat label="Churn rate" value={ch ? `${Math.round(ch.taxa * 100)}%` : "—"} tone="warn" />
      </div>
      <Card><CardContent className="p-3"><p className="text-xs font-semibold mb-1 text-muted-foreground">MRR perdido por mês (últimos 12 meses)</p>{ch ? <ChurnBarChart serie={ch.serie} /> : <div className="h-[180px]" />}</CardContent></Card>
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
                  <TableCell className="text-right whitespace-nowrap font-medium tabular-nums">{centsToBRL(r.mediaCents)}</TableCell>
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
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  Aba Despesas (por categoria)
// ═════════════════════════════════════════════════════════════════════════════
function DespesasTab({ months }: { months: string[] }) {
  const [period, setPeriod] = useState<PeriodState>(defaultPeriod(months[0] ?? ""));
  const { from, to } = periodRange(period, months);
  const q = trpc.finance.analytics.despesaPorCategoria.useQuery({ mesFrom: from, mesTo: to, limitMonths: 12 }, { enabled: MES_RE.test(from) });
  const p = q.data?.periodo;
  const total = p?.totalCents ?? 0;
  const pct = (c: number) => (total > 0 ? `${Math.round((c / total) * 100)}%` : "—");
  return (
    <div className="space-y-5">
      <PeriodBar period={period} setPeriod={setPeriod} months={months} from={from} to={to} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Recorrente" value={centsToBRL(p?.recorrenteCents ?? 0)} hint={`${pct(p?.recorrenteCents ?? 0)} · inclui folha`} tone="neg" />
        <Stat label="Imposto" value={centsToBRL(p?.impostoCents ?? 0)} hint={pct(p?.impostoCents ?? 0)} tone="neg" />
        <Stat label="Pontual" value={centsToBRL(p?.pontualCents ?? 0)} hint={pct(p?.pontualCents ?? 0)} tone="neg" />
        <Stat label="Total despesa" value={centsToBRL(total)} tone="neg" />
      </div>
      <Card><CardContent className="p-3">
        <p className="text-xs font-semibold mb-1 text-muted-foreground">Despesa por categoria — últimos 12 meses (recorrente inclui folha da equipe)</p>
        {q.data ? <DespesaStackChart serie={q.data.serie} /> : <div className="h-[240px]" />}
      </CardContent></Card>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  Aba A Receber (aging)
// ═════════════════════════════════════════════════════════════════════════════
function AReceberTab() {
  const q = trpc.finance.analytics.aReceber.useQuery();
  const d = q.data;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Stat label="Total a receber" value={centsToBRL(d?.totalPendenteCents ?? 0)} tone="warn" hint={d ? `hoje ${d.hoje}` : ""} />
        <Stat label="Vencido (≥ 1 mês)" value={centsToBRL(d?.totalVencidoCents ?? 0)} tone="neg" />
        <Stat label="A vencer / corrente" value={centsToBRL(d?.buckets.corrente ?? 0)} />
        <Stat label="1 mês" value={centsToBRL(d?.buckets.m1 ?? 0)} tone="warn" />
        <Stat label="2 · 3+ meses" value={`${centsToBRL(d?.buckets.m2 ?? 0)} · ${centsToBRL(d?.buckets.m3plus ?? 0)}`} tone="neg" />
        <Stat label="Sem data" value={centsToBRL(d?.buckets.semData ?? 0)} />
      </div>
      {d && d.itens.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground text-sm">Nenhuma conta pendente. Marque uma receita como <span className="font-medium">pendente</span> no P&amp;L (ou gere o próximo mês recorrente) para acompanhar o aging por vencimento.</CardContent></Card>
      ) : (
        <div className="rounded-lg border border-border overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Cliente / descrição</TableHead><TableHead>Vencimento</TableHead><TableHead className="text-right">Valor</TableHead><TableHead className="text-right">Idade</TableHead></TableRow></TableHeader>
            <TableBody>
              {q.isLoading && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6"><Loader2 className="w-4 h-4 animate-spin inline" /> Carregando…</TableCell></TableRow>}
              {(d?.itens ?? []).map((it, i) => (
                <TableRow key={i}>
                  <TableCell><span className="inline-flex items-center gap-2">{it.cor && <span className="w-2.5 h-2.5 rounded-full" style={{ background: it.cor }} />}{it.clienteNome !== "—" ? it.clienteNome : it.descricao}</span></TableCell>
                  <TableCell className="whitespace-nowrap text-xs">{it.vencimento ?? <span className="text-muted-foreground">sem data</span>}</TableCell>
                  <TableCell className="text-right whitespace-nowrap font-medium">{centsToBRL(it.valorCents)}</TableCell>
                  <TableCell className={`text-right ${it.idade == null ? "text-muted-foreground" : it.idade >= 3 ? "text-red-600 font-medium" : it.idade >= 1 ? "text-amber-600" : ""}`}>{it.idade == null ? "—" : it.idade <= 0 ? "corrente" : `${it.idade} m`}</TableCell>
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
type GsForm = { kind: "gasto"; id?: number; mes: string; categoria: ReembCat; descricao: string; valor: string; quemPagou: string; reembolsado: boolean } | { kind: "retirada"; id?: number; mes: string; descricao: string; valor: string };

function GuiSelvaTab({ months }: { months: string[] }) {
  const utils = trpc.useUtils();
  const [mes, setMes] = useState<string>(months[0] ?? "");
  const [form, setForm] = useState<GsForm | null>(null);
  const [choosing, setChoosing] = useState(false);
  const recQ = trpc.finance.reconciliacao.get.useQuery({ mes }, { enabled: MES_RE.test(mes) });
  const acumQ = trpc.finance.reconciliacao.acumulado.useQuery();
  const reembQ = trpc.finance.reembolsos.list.useQuery({ mes }, { enabled: MES_RE.test(mes) });
  const retirQ = trpc.finance.retiradas.list.useQuery({ mes }, { enabled: MES_RE.test(mes) });
  const reemb = (reembQ.data ?? []) as ReembRow[]; const retir = (retirQ.data ?? []) as RetiradaRow[]; const rec = recQ.data;

  const invalidate = () => { utils.finance.reembolsos.list.invalidate(); utils.finance.retiradas.list.invalidate(); utils.finance.reconciliacao.invalidate(); utils.finance.months.invalidate(); };
  const createReemb = trpc.finance.reembolsos.create.useMutation({ onSuccess: () => { invalidate(); setForm(null); toast.success("Gasto adicionado."); } });
  const updateReemb = trpc.finance.reembolsos.update.useMutation({ onSuccess: () => { invalidate(); setForm(null); toast.success("Gasto atualizado."); } });
  const delReemb = trpc.finance.reembolsos.delete.useMutation({ onSuccess: () => { invalidate(); toast.success("Excluído."); } });
  const setReembFlag = trpc.finance.reembolsos.setReembolsado.useMutation({ onSuccess: () => utils.finance.reembolsos.list.invalidate() });
  const createRetir = trpc.finance.retiradas.create.useMutation({ onSuccess: () => { invalidate(); setForm(null); toast.success("Retirada adicionada."); } });
  const updateRetir = trpc.finance.retiradas.update.useMutation({ onSuccess: () => { invalidate(); setForm(null); toast.success("Retirada atualizada."); } });
  const delRetir = trpc.finance.retiradas.delete.useMutation({ onSuccess: () => { invalidate(); toast.success("Excluída."); } });

  const submit = () => {
    if (!form) return;
    if (!MES_RE.test(form.mes)) return toast.error("Mês inválido (YYYY-MM).");
    if (!form.descricao.trim()) return toast.error("Informe a descrição.");
    const valorCents = parseMoneyToCents(form.valor);
    if (valorCents == null) return toast.error("Valor inválido.");
    if (form.kind === "gasto") { const p = { mes: form.mes, categoria: form.categoria, descricao: form.descricao.trim(), valorCents, quemPagou: form.quemPagou.trim() || undefined, reembolsado: form.reembolsado }; if (form.id) updateReemb.mutate({ id: form.id, ...p }); else createReemb.mutate(p); }
    else { const p = { mes: form.mes, descricao: form.descricao.trim(), valorCents }; if (form.id) updateRetir.mutate({ id: form.id, ...p }); else createRetir.mutate(p); }
  };
  const saving = createReemb.isPending || updateReemb.isPending || createRetir.isPending || updateRetir.isPending;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3"><MonthNav mes={mes} onChange={setMes} months={months} /><div className="ml-auto"><Button size="sm" onClick={() => setChoosing(true)}><Plus className="w-4 h-4 mr-1" /> Adicionar</Button></div></div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Total Despesas (reembolsos)" value={centsToBRL(rec?.totalDespesasCents ?? 0)} tone="neg" />
        <Stat label="Total Retiradas" value={centsToBRL(rec?.totalRetiradasCents ?? 0)} />
        <Stat label={`Diferença ${formatMes(mes)} · desp − retir (+ = falta receber)`} value={centsToBRL(rec?.diferencaCents ?? 0)} tone={(rec?.diferencaCents ?? 0) > 0 ? "warn" : (rec?.diferencaCents ?? 0) < 0 ? "pos" : undefined} />
        <Stat label="Falta receber acumulado" value={centsToBRL(acumQ.data?.diferencaCents ?? 0)} tone={(acumQ.data?.diferencaCents ?? 0) > 0 ? "warn" : "pos"} />
      </div>
      <div className="rounded-lg border border-border overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Tipo</TableHead><TableHead>Descrição</TableHead><TableHead>Detalhe</TableHead><TableHead className="text-right">Valor</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader>
          <TableBody>
            {(reembQ.isLoading || retirQ.isLoading) && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6"><Loader2 className="w-4 h-4 animate-spin inline" /> Carregando…</TableCell></TableRow>}
            {!reembQ.isLoading && !retirQ.isLoading && reemb.length === 0 && retir.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Nada neste mês.</TableCell></TableRow>}
            {reemb.map((row) => (
              <TableRow key={`g${row.id}`}>
                <TableCell><Badge className="bg-red-500/15 text-red-600 border-red-500/30">Gasto</Badge></TableCell>
                <TableCell className="max-w-[220px] truncate">{row.descricao}</TableCell>
                <TableCell className="text-xs text-muted-foreground whitespace-nowrap"><Badge variant="secondary" className="font-normal mr-1">{catLabel(row.categoria)}</Badge>{row.quemPagou ?? ""}<span className="ml-2 inline-flex items-center gap-1">reemb. <Switch checked={row.reembolsado} onCheckedChange={(v) => setReembFlag.mutate({ id: row.id, reembolsado: !!v })} /></span></TableCell>
                <TableCell className="text-right whitespace-nowrap font-medium">{centsToBRL(row.valorCents)}</TableCell>
                <TableCell className="text-right whitespace-nowrap"><RowActions onEdit={() => setForm({ kind: "gasto", id: row.id, mes: row.mes, categoria: row.categoria as ReembCat, descricao: row.descricao, valor: centsToInput(row.valorCents), quemPagou: row.quemPagou ?? "", reembolsado: row.reembolsado })} onDelete={() => delReemb.mutate({ id: row.id })} /></TableCell>
              </TableRow>
            ))}
            {retir.map((row) => (
              <TableRow key={`r${row.id}`}>
                <TableCell><Badge className="bg-blue-500/15 text-blue-600 border-blue-500/30">Retirada</Badge></TableCell>
                <TableCell className="max-w-[220px] truncate">{row.descricao}</TableCell>
                <TableCell className="text-xs text-muted-foreground">—</TableCell>
                <TableCell className="text-right whitespace-nowrap font-medium">{centsToBRL(row.valorCents)}</TableCell>
                <TableCell className="text-right whitespace-nowrap"><RowActions onEdit={() => setForm({ kind: "retirada", id: row.id, mes: row.mes, descricao: row.descricao, valor: centsToInput(row.valorCents) })} onDelete={() => delRetir.mutate({ id: row.id })} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Dialog open={choosing} onOpenChange={setChoosing}>
        <DialogContent>
          <DialogHeader><DialogTitle>Adicionar</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <button className="rounded-lg border border-border p-4 hover:border-primary/50 hover:bg-muted/30 text-left" onClick={() => { setChoosing(false); setForm({ kind: "gasto", mes, categoria: "PLATAFORMA_ANUNCIOS", descricao: "", valor: "", quemPagou: "", reembolsado: false }); }}><p className="text-sm font-medium">Gasto (reembolso)</p><p className="text-xs text-muted-foreground">Despesa a reembolsar</p></button>
            <button className="rounded-lg border border-border p-4 hover:border-primary/50 hover:bg-muted/30 text-left" onClick={() => { setChoosing(false); setForm({ kind: "retirada", mes, descricao: "", valor: "" }); }}><p className="text-sm font-medium">Retirada</p><p className="text-xs text-muted-foreground">Retirada Gui & SELVA</p></button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{form?.id ? "Editar" : "Novo"} {form?.kind === "gasto" ? "gasto" : "retirada"}</DialogTitle></DialogHeader>
          {form && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Mês (YYYY-MM)"><Input value={form.mes} onChange={(e) => setForm({ ...form, mes: e.target.value })} placeholder="2026-07" /></Field>
              <Field label="Valor"><MoneyInput value={form.valor} onChange={(v) => setForm({ ...form, valor: v })} /></Field>
              <Field label="Descrição" full><Input value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} /></Field>
              {form.kind === "gasto" && <>
                <Field label="Categoria"><Select value={form.categoria} onValueChange={(v) => setForm({ ...form, categoria: v as ReembCat })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CATEGORIAS.map((c) => <SelectItem key={c.v} value={c.v}>{c.label}</SelectItem>)}</SelectContent></Select></Field>
                <Field label="Quem pagou"><Input value={form.quemPagou} onChange={(e) => setForm({ ...form, quemPagou: e.target.value })} placeholder="Gui / SELVA…" /></Field>
                <Field label="Reembolsado" full><div className="flex items-center gap-2 h-9"><Switch checked={form.reembolsado} onCheckedChange={(v) => setForm({ ...form, reembolsado: !!v })} /><span className="text-sm text-muted-foreground">{form.reembolsado ? "Sim" : "Não"}</span></div></Field>
              </>}
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

  if (!isAdmin) return null;

  return (
    <MetaDashboardLayout>
      <div className="max-w-6xl mx-auto py-6 space-y-6">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2"><Wallet className="w-5 h-5" /> Controle Financeiro</h1>
          <p className="text-sm text-muted-foreground mt-1">Período · P&amp;L · clientes (MRR/churn) · despesas · a receber · Gui &amp; SELVA.</p>
        </div>
        {months.length === 0 ? (
          <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Carregando…</p>
        ) : (
          <Tabs defaultValue="pnl">
            <TabsList className="flex-wrap h-auto">
              <TabsTrigger value="pnl">P&amp;L</TabsTrigger>
              <TabsTrigger value="clientes"><Users className="w-3.5 h-3.5 mr-1" /> Clientes</TabsTrigger>
              <TabsTrigger value="despesas">Despesas</TabsTrigger>
              <TabsTrigger value="areceber">A Receber</TabsTrigger>
              <TabsTrigger value="guiselva"><ArrowLeftRight className="w-3.5 h-3.5 mr-1" /> Gui &amp; SELVA</TabsTrigger>
            </TabsList>
            <TabsContent value="pnl" className="mt-4"><PnlTab months={months} clientes={clientes} clienteById={clienteById} /></TabsContent>
            <TabsContent value="clientes" className="mt-4"><ClientesTab months={months} /></TabsContent>
            <TabsContent value="despesas" className="mt-4"><DespesasTab months={months} /></TabsContent>
            <TabsContent value="areceber" className="mt-4"><AReceberTab /></TabsContent>
            <TabsContent value="guiselva" className="mt-4"><GuiSelvaTab months={months} /></TabsContent>
          </Tabs>
        )}
      </div>
    </MetaDashboardLayout>
  );
}
