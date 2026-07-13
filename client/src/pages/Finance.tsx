/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Controle Financeiro v2 (admin) — P&L (mês a mês, tags de cliente) · Gui & SELVA
 * ─────────────────────────────────────────────────────────────────────────────
 *  Restrito a admin (guard no front + finance.* = adminProcedure no backend).
 *  Dinheiro em centavos (int) → BRL. `mes` = 'YYYY-MM' tratado como string
 *  (aritmética inteira, sem Date/toISOString).
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useMemo, useState } from "react";
import { MetaDashboardLayout } from "@/components/MetaDashboardLayout";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Wallet, Plus, Pencil, Trash2, Loader2, ChevronLeft, ChevronRight, ArrowLeftRight, Users } from "lucide-react";
import {
  ResponsiveContainer, ComposedChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid,
} from "recharts";
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
function formatMes(mes: string): string {
  const [y, m] = (mes ?? "").split("-");
  return `${MES_ABBR[Number(m) - 1] ?? m}/${y}`;
}
// Aritmética de mês em string pura (sem Date/toISOString).
function addMonths(ymd: string, delta: number): string {
  const [y, m] = ymd.split("-").map(Number);
  const idx = y * 12 + (m - 1) + delta;
  const ny = Math.floor(idx / 12), nm = (idx % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}
function parseMoneyToCents(input: string): number | null {
  let s = (input ?? "").trim().replace(/R\$|\s/g, "");
  if (!s) return null;
  const hasComma = s.includes(","), hasDot = s.includes(".");
  if (hasComma && hasDot) s = s.replace(/\./g, "").replace(",", ".");
  else if (hasComma) s = s.replace(",", ".");
  const n = Number(s);
  if (!isFinite(n)) return null; // sinal permitido (estorno)
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

// Texto legível (preto/branco) sobre uma cor hex.
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

// ── Seletor de mês navegável ─────────────────────────────────────────────────
function MonthNav({ mes, onChange, months }: { mes: string; onChange: (m: string) => void; months: string[] }) {
  const min = months.length ? months[months.length - 1] : mes;
  const max = months.length ? months[0] : mes;
  const years = Array.from(new Set(months.map((m) => m.split("-")[0]))).sort().reverse();
  const go = (delta: number) => { const n = addMonths(mes, delta); if (n >= min && n <= max) onChange(n); };
  return (
    <div className="flex items-center gap-2">
      <button onClick={() => go(-1)} disabled={mes <= min} className="p-1.5 rounded-md hover:bg-accent/30 disabled:opacity-30 disabled:pointer-events-none" title="Mês anterior"><ChevronLeft className="w-4 h-4" /></button>
      <span className="text-base font-semibold min-w-[92px] text-center tabular-nums">{formatMes(mes)}</span>
      <button onClick={() => go(1)} disabled={mes >= max} className="p-1.5 rounded-md hover:bg-accent/30 disabled:opacity-30 disabled:pointer-events-none" title="Próximo mês"><ChevronRight className="w-4 h-4" /></button>
      <Select value={mes.split("-")[0]} onValueChange={(y) => { const inYear = months.filter((m) => m.startsWith(y)); if (inYear.length) onChange(inYear[0]); }}>
        <SelectTrigger className="h-8 w-[84px] ml-1"><SelectValue /></SelectTrigger>
        <SelectContent>{years.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
}

// ── Charts ───────────────────────────────────────────────────────────────────
type TrendPoint = { mes: string; receitaCents: number; despesaCents: number; resultadoCents: number; receitaRecorrenteCents: number; receitaPontualCents: number };
const axisFmt = (v: number) => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : `${v}`);
const tipTxt = (v: number) => centsToBRL(v * 100);

function TrendChart({ data }: { data: TrendPoint[] }) {
  const d = data.map((t) => ({ mes: formatMes(t.mes), Receita: t.receitaCents / 100, Despesa: t.despesaCents / 100, Resultado: t.resultadoCents / 100 }));
  return (
    <ResponsiveContainer width="100%" height={220}>
      <ComposedChart data={d} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
        <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
        <YAxis tickFormatter={axisFmt} tick={{ fontSize: 11 }} width={40} />
        <Tooltip formatter={(v: number) => tipTxt(v)} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line type="monotone" dataKey="Receita" stroke="#16A34A" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="Despesa" stroke="#DC2626" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="Resultado" stroke="#2563EB" strokeWidth={2} dot={false} />
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
        <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
        <YAxis tickFormatter={axisFmt} tick={{ fontSize: 11 }} width={40} />
        <Tooltip formatter={(v: number) => tipTxt(v)} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="Recorrente" stackId="r" fill="#3B54E6" />
        <Bar dataKey="Pontual" stackId="r" fill="#EF701B" />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Autocomplete de cliente (com criar na hora) ──────────────────────────────
function ClienteSelect({ value, onChange, clientes }: { value: number | null; onChange: (id: number | null) => void; clientes: Cliente[] }) {
  const utils = trpc.useUtils();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const create = trpc.finance.clientes.create.useMutation({
    onSuccess: (c) => { utils.finance.clientes.list.invalidate(); onChange(c.id); setOpen(false); setQ(""); toast.success("Cliente criado."); },
  });
  const sel = clientes.find((c) => c.id === value);
  const filtered = clientes.filter((c) => !q || c.nome.toLowerCase().includes(q.toLowerCase()));
  const exact = clientes.some((c) => c.nome.toLowerCase() === q.trim().toLowerCase());
  return (
    <div className="relative">
      <Input
        value={open ? q : (sel?.nome ?? "")}
        placeholder="Buscar ou criar cliente…"
        onFocus={() => { setOpen(true); setQ(""); }}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-56 overflow-y-auto rounded-md border border-border bg-popover shadow-md py-1">
          {value != null && <button className="w-full text-left px-3 py-1.5 text-xs text-muted-foreground hover:bg-primary/10" onMouseDown={() => { onChange(null); setOpen(false); }}>— sem cliente —</button>}
          {filtered.slice(0, 40).map((c) => (
            <button key={c.id} className="w-full text-left px-3 py-1.5 text-sm hover:bg-primary/10 flex items-center gap-2" onMouseDown={() => { onChange(c.id); setOpen(false); }}>
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: c.cor ?? "#64748b" }} /> {c.nome}
            </button>
          ))}
          {q.trim() && !exact && (
            <button className="w-full text-left px-3 py-1.5 text-sm text-accent hover:bg-primary/10" disabled={create.isPending} onMouseDown={() => create.mutate({ nome: q.trim() })}>
              {create.isPending ? "Criando…" : `+ Criar "${q.trim()}"`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Pequenos componentes ─────────────────────────────────────────────────────
function Stat({ label, value, tone }: { label: string; value: string; tone?: "pos" | "neg" | "warn" }) {
  const color = tone === "pos" ? "text-emerald-600" : tone === "neg" ? "text-red-600" : tone === "warn" ? "text-amber-600" : "text-foreground";
  return <Card><CardContent className="p-3"><p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p><p className={`text-lg font-bold ${color}`}>{value}</p></CardContent></Card>;
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
      {confirm ? (
        <span className="inline-flex items-center gap-1">
          <button onClick={() => { onDelete(); setConfirm(false); }} className="text-xs text-red-600 font-medium">Confirmar</button>
          <button onClick={() => setConfirm(false)} className="text-xs text-muted-foreground">cancelar</button>
        </span>
      ) : <button onClick={() => setConfirm(true)} className="p-1.5 text-muted-foreground hover:text-destructive" title="Excluir"><Trash2 className="w-4 h-4" /></button>}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  Aba P&L
// ═════════════════════════════════════════════════════════════════════════════
type PnlRow = { id: number; mes: string; tipo: string; descricao: string; valorCents: number; status: "pago" | "pendente"; clienteId: number | null };
type PnlForm = { id?: number; mes: string; tipo: PnlTipo; descricao: string; valor: string; status: "pago" | "pendente"; clienteId: number | null };

function PnlTab({ months, clientes, clienteById }: { months: string[]; clientes: Cliente[]; clienteById: Map<number, Cliente> }) {
  const utils = trpc.useUtils();
  const [mes, setMes] = useState<string>(months[0] ?? "");
  const [tipo, setTipo] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [clienteFilter, setClienteFilter] = useState<number | "">("");
  const [form, setForm] = useState<PnlForm | null>(null);
  const [showRanking, setShowRanking] = useState(false);

  const resumoQ = trpc.finance.pnl.resumo.useQuery({ mes }, { enabled: MES_RE.test(mes) });
  const listQ = trpc.finance.pnl.list.useQuery({
    mesFrom: mes, mesTo: mes,
    ...(tipo ? { tipo: tipo as PnlTipo } : {}),
    ...(status ? { status: status as "pago" | "pendente" } : {}),
    ...(clienteFilter ? { clienteId: clienteFilter } : {}),
  }, { enabled: MES_RE.test(mes) });
  const trendQ = trpc.finance.pnl.trend.useQuery({ limitMonths: 12 });
  const rankingQ = trpc.finance.pnl.receitaPorCliente.useQuery(undefined, { enabled: showRanking });

  const rows = (listQ.data ?? []) as PnlRow[];
  const resumo = resumoQ.data;

  const invalidate = () => { utils.finance.pnl.list.invalidate(); utils.finance.pnl.resumo.invalidate(); utils.finance.pnl.trend.invalidate(); utils.finance.pnl.receitaPorCliente.invalidate(); utils.finance.months.invalidate(); };
  const create = trpc.finance.pnl.create.useMutation({ onSuccess: () => { invalidate(); setForm(null); toast.success("Lançamento criado."); } });
  const update = trpc.finance.pnl.update.useMutation({ onSuccess: () => { invalidate(); setForm(null); toast.success("Lançamento atualizado."); } });
  const del = trpc.finance.pnl.delete.useMutation({ onSuccess: () => { invalidate(); toast.success("Lançamento excluído."); } });
  const setStatusM = trpc.finance.pnl.setStatus.useMutation({ onSuccess: () => { utils.finance.pnl.list.invalidate(); utils.finance.pnl.resumo.invalidate(); } });

  // Detalhamento do mês (a partir das linhas filtradas).
  const detalhe = useMemo(() => {
    const recorrentePorCliente = new Map<number | string, { nome: string; cliente?: Cliente; cents: number }>();
    const pontual: PnlRow[] = [];
    let despRec = 0, despImp = 0, despPon = 0, aporte = 0;
    for (const r of rows) {
      if (r.tipo === "RECEITA_RECORRENTE") {
        const key = r.clienteId ?? "sem";
        const c = r.clienteId ? clienteById.get(r.clienteId) : undefined;
        if (!recorrentePorCliente.has(key)) recorrentePorCliente.set(key, { nome: c?.nome ?? "Sem cliente", cliente: c, cents: 0 });
        recorrentePorCliente.get(key)!.cents += r.valorCents;
      } else if (r.tipo === "RECEITA_PONTUAL") pontual.push(r);
      else if (r.tipo === "DESPESA_RECORRENTE") despRec += r.valorCents;
      else if (r.tipo === "DESPESA_IMPOSTO") despImp += r.valorCents;
      else if (r.tipo === "DESPESA_PONTUAL") despPon += r.valorCents;
      else if (r.tipo === "APORTE") aporte += r.valorCents;
    }
    const recArr = Array.from(recorrentePorCliente.values()).sort((a, b) => b.cents - a.cents);
    return { recArr, pontual, despRec, despImp, despPon, aporte };
  }, [rows, clienteById]);

  const submit = () => {
    if (!form) return;
    if (!MES_RE.test(form.mes)) return toast.error("Mês inválido (YYYY-MM).");
    if (!form.descricao.trim()) return toast.error("Informe a descrição.");
    const valorCents = parseMoneyToCents(form.valor);
    if (valorCents == null) return toast.error("Valor inválido.");
    const isReceita = tipoKind(form.tipo) === "receita";
    const payload = { mes: form.mes, tipo: form.tipo, descricao: form.descricao.trim(), valorCents, status: form.status, clienteId: isReceita ? form.clienteId : null };
    if (form.id) update.mutate({ id: form.id, ...payload });
    else create.mutate(payload);
  };

  const newForm = (): PnlForm => ({ mes, tipo: "DESPESA_PONTUAL", descricao: "", valor: "", status: "pendente", clienteId: null });
  const isReceitaForm = form ? tipoKind(form.tipo) === "receita" : false;

  return (
    <div className="space-y-5">
      {/* Nav de mês + ações */}
      <div className="flex flex-wrap items-center gap-3">
        <MonthNav mes={mes} onChange={setMes} months={months} />
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowRanking((v) => !v)}><Users className="w-4 h-4 mr-1" /> Receita por cliente</Button>
          <Button size="sm" onClick={() => setForm(newForm())}><Plus className="w-4 h-4 mr-1" /> Lançamento</Button>
        </div>
      </div>

      {/* Cards do mês */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Receita" value={centsToBRL(resumo?.receitaTotalCents ?? 0)} tone="pos" />
        <Stat label="Despesa" value={centsToBRL(resumo?.despesaTotalCents ?? 0)} tone="neg" />
        <Stat label="Resultado" value={centsToBRL(resumo?.resultadoFinalCents ?? 0)} tone={(resumo?.resultadoFinalCents ?? 0) >= 0 ? "pos" : "neg"} />
        <Stat label="Pendente" value={centsToBRL(resumo?.totalPendenteCents ?? 0)} tone="warn" />
      </div>
      {(resumo?.aporteCents ?? 0) > 0 && <div className="grid grid-cols-2 md:grid-cols-4 gap-3"><Stat label="Aporte" value={centsToBRL(resumo!.aporteCents)} /></div>}

      {/* Ranking receita por cliente (painel) */}
      {showRanking && (
        <Card><CardContent className="p-4">
          <p className="text-sm font-semibold mb-2 flex items-center gap-2"><Users className="w-4 h-4" /> Receita por cliente (acumulado)</p>
          {rankingQ.isLoading ? <p className="text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin inline" /> Carregando…</p> : (
            <div className="max-h-72 overflow-y-auto">
              <Table><TableBody>
                {(rankingQ.data ?? []).map((r) => (
                  <TableRow key={r.clienteId ?? "sem"}>
                    <TableCell className="py-1.5"><span className="inline-flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ background: r.cor ?? "#64748b" }} />{r.nome}</span></TableCell>
                    <TableCell className="py-1.5 text-right text-muted-foreground text-xs">{r.count} lanç.</TableCell>
                    <TableCell className="py-1.5 text-right font-medium whitespace-nowrap">{centsToBRL(r.totalCents)}</TableCell>
                  </TableRow>
                ))}
              </TableBody></Table>
            </div>
          )}
        </CardContent></Card>
      )}

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card><CardContent className="p-3"><p className="text-xs font-semibold mb-1 text-muted-foreground">Tendência (12 meses)</p>{trendQ.data ? <TrendChart data={trendQ.data} /> : <div className="h-[220px]" />}</CardContent></Card>
        <Card><CardContent className="p-3"><p className="text-xs font-semibold mb-1 text-muted-foreground">Receita: recorrente × pontual</p>{trendQ.data ? <MixChart data={trendQ.data} /> : <div className="h-[220px]" />}</CardContent></Card>
      </div>

      {/* Detalhamento do mês */}
      <Card><CardContent className="p-4 space-y-3">
        <p className="text-sm font-semibold">Detalhamento — {formatMes(mes)}</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-xs uppercase tracking-wide text-emerald-600 font-semibold mb-1">Receita recorrente · {centsToBRL(detalhe.recArr.reduce((s, r) => s + r.cents, 0))}</p>
            {detalhe.recArr.length === 0 && <p className="text-xs text-muted-foreground">—</p>}
            {detalhe.recArr.map((r, i) => (
              <div key={i} className="flex items-center justify-between py-0.5"><span className="flex items-center gap-1.5">{r.cliente ? <ClientTag cliente={r.cliente} /> : <span className="text-muted-foreground">{r.nome}</span>}</span><span className="tabular-nums">{centsToBRL(r.cents)}</span></div>
            ))}
            <p className="text-xs uppercase tracking-wide text-emerald-600 font-semibold mt-3 mb-1">Receita pontual · {centsToBRL(detalhe.pontual.reduce((s, r) => s + r.valorCents, 0))}</p>
            {detalhe.pontual.length === 0 && <p className="text-xs text-muted-foreground">—</p>}
            {detalhe.pontual.map((r) => (<div key={r.id} className="flex items-center justify-between py-0.5"><span className="truncate mr-2">{r.descricao}</span><span className="tabular-nums whitespace-nowrap">{centsToBRL(r.valorCents)}</span></div>))}
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-red-600 font-semibold mb-1">Despesas</p>
            <div className="flex items-center justify-between py-0.5"><span>Recorrente</span><span className="tabular-nums">{centsToBRL(detalhe.despRec)}</span></div>
            <div className="flex items-center justify-between py-0.5"><span>Imposto</span><span className="tabular-nums">{centsToBRL(detalhe.despImp)}</span></div>
            <div className="flex items-center justify-between py-0.5"><span>Pontual</span><span className="tabular-nums">{centsToBRL(detalhe.despPon)}</span></div>
            <div className="flex items-center justify-between py-0.5 font-semibold border-t border-border mt-1 pt-1"><span>Total despesa</span><span className="tabular-nums">{centsToBRL(detalhe.despRec + detalhe.despImp + detalhe.despPon)}</span></div>
            {detalhe.aporte > 0 && <div className="flex items-center justify-between py-0.5 mt-2"><span>Aporte</span><span className="tabular-nums">{centsToBRL(detalhe.aporte)}</span></div>}
          </div>
        </div>
      </CardContent></Card>

      {/* Filtros + lista editável */}
      <div className="flex flex-wrap items-end gap-2">
        <FilterSelect label="Tipo" value={tipo} onChange={setTipo} options={PNL_TIPOS.map((t) => t.v)} format={tipoLabel} allLabel="Todos" />
        <FilterSelect label="Status" value={status} onChange={setStatus} options={["pago", "pendente"]} format={(s) => (s === "pago" ? "Pago" : "Pendente")} allLabel="Todos" />
        <div className="flex flex-col gap-1">
          <Label className="text-[11px] text-muted-foreground">Cliente</Label>
          <Select value={clienteFilter ? String(clienteFilter) : "__all__"} onValueChange={(v) => setClienteFilter(v === "__all__" ? "" : Number(v))}>
            <SelectTrigger className="h-9 w-[170px]"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="__all__">Todos</SelectItem>{clientes.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.nome}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      <div className="rounded-lg border border-border overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Tipo</TableHead><TableHead>Descrição</TableHead><TableHead>Cliente</TableHead><TableHead className="text-right">Valor</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader>
          <TableBody>
            {listQ.isLoading && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6"><Loader2 className="w-4 h-4 animate-spin inline" /> Carregando…</TableCell></TableRow>}
            {!listQ.isLoading && rows.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">Nenhum lançamento neste mês/filtro.</TableCell></TableRow>}
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell><Badge variant="secondary" className="font-normal whitespace-nowrap">{tipoLabel(r.tipo)}</Badge></TableCell>
                <TableCell className="max-w-[240px] truncate">{r.descricao}</TableCell>
                <TableCell>{r.clienteId ? <ClientTag cliente={clienteById.get(r.clienteId)} /> : <span className="text-muted-foreground text-xs">—</span>}</TableCell>
                <TableCell className={`text-right whitespace-nowrap font-medium ${tipoKind(r.tipo) === "despesa" ? "text-red-600" : tipoKind(r.tipo) === "receita" ? "text-emerald-600" : ""}`}>{tipoKind(r.tipo) === "despesa" ? "-" : ""}{centsToBRL(r.valorCents)}</TableCell>
                <TableCell>
                  <button onClick={() => setStatusM.mutate({ id: r.id, status: r.status === "pago" ? "pendente" : "pago" })} title="Alternar pago/pendente">
                    <Badge className={r.status === "pago" ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/30" : "bg-amber-500/15 text-amber-600 border-amber-500/30"}>{r.status === "pago" ? "Pago" : "Pendente"}</Badge>
                  </button>
                </TableCell>
                <TableCell className="text-right whitespace-nowrap"><RowActions onEdit={() => setForm({ id: r.id, mes: r.mes, tipo: r.tipo as PnlTipo, descricao: r.descricao, valor: centsToInput(r.valorCents), status: r.status, clienteId: r.clienteId })} onDelete={() => del.mutate({ id: r.id })} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Dialog criar/editar */}
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
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)}>Cancelar</Button>
            <Button onClick={submit} disabled={create.isPending || update.isPending}>{(create.isPending || update.isPending) && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  Aba Gui & SELVA (reembolsos + retiradas unificados)
// ═════════════════════════════════════════════════════════════════════════════
type ReembRow = { id: number; mes: string; categoria: string; descricao: string; valorCents: number; quemPagou: string | null; reembolsado: boolean };
type RetiradaRow = { id: number; mes: string; descricao: string; valorCents: number };
type GsForm =
  | { kind: "gasto"; id?: number; mes: string; categoria: ReembCat; descricao: string; valor: string; quemPagou: string; reembolsado: boolean }
  | { kind: "retirada"; id?: number; mes: string; descricao: string; valor: string };

function GuiSelvaTab({ months }: { months: string[] }) {
  const utils = trpc.useUtils();
  const [mes, setMes] = useState<string>(months[0] ?? "");
  const [form, setForm] = useState<GsForm | null>(null);
  const [choosing, setChoosing] = useState(false);

  const recQ = trpc.finance.reconciliacao.get.useQuery({ mes }, { enabled: MES_RE.test(mes) });
  const acumQ = trpc.finance.reconciliacao.acumulado.useQuery();
  const reembQ = trpc.finance.reembolsos.list.useQuery({ mes }, { enabled: MES_RE.test(mes) });
  const retirQ = trpc.finance.retiradas.list.useQuery({ mes }, { enabled: MES_RE.test(mes) });

  const reemb = (reembQ.data ?? []) as ReembRow[];
  const retir = (retirQ.data ?? []) as RetiradaRow[];
  const rec = recQ.data;

  const invalidate = () => {
    utils.finance.reembolsos.list.invalidate(); utils.finance.retiradas.list.invalidate();
    utils.finance.reconciliacao.invalidate(); utils.finance.months.invalidate();
  };
  const createReemb = trpc.finance.reembolsos.create.useMutation({ onSuccess: () => { invalidate(); setForm(null); toast.success("Gasto adicionado."); } });
  const updateReemb = trpc.finance.reembolsos.update.useMutation({ onSuccess: () => { invalidate(); setForm(null); toast.success("Gasto atualizado."); } });
  const delReemb = trpc.finance.reembolsos.delete.useMutation({ onSuccess: () => { invalidate(); toast.success("Gasto excluído."); } });
  const setReembFlag = trpc.finance.reembolsos.setReembolsado.useMutation({ onSuccess: () => utils.finance.reembolsos.list.invalidate() });
  const createRetir = trpc.finance.retiradas.create.useMutation({ onSuccess: () => { invalidate(); setForm(null); toast.success("Retirada adicionada."); } });
  const updateRetir = trpc.finance.retiradas.update.useMutation({ onSuccess: () => { invalidate(); setForm(null); toast.success("Retirada atualizada."); } });
  const delRetir = trpc.finance.retiradas.delete.useMutation({ onSuccess: () => { invalidate(); toast.success("Retirada excluída."); } });

  const submit = () => {
    if (!form) return;
    if (!MES_RE.test(form.mes)) return toast.error("Mês inválido (YYYY-MM).");
    if (!form.descricao.trim()) return toast.error("Informe a descrição.");
    const valorCents = parseMoneyToCents(form.valor);
    if (valorCents == null) return toast.error("Valor inválido.");
    if (form.kind === "gasto") {
      const payload = { mes: form.mes, categoria: form.categoria, descricao: form.descricao.trim(), valorCents, quemPagou: form.quemPagou.trim() || undefined, reembolsado: form.reembolsado };
      if (form.id) updateReemb.mutate({ id: form.id, ...payload }); else createReemb.mutate(payload);
    } else {
      const payload = { mes: form.mes, descricao: form.descricao.trim(), valorCents };
      if (form.id) updateRetir.mutate({ id: form.id, ...payload }); else createRetir.mutate(payload);
    }
  };
  const saving = createReemb.isPending || updateReemb.isPending || createRetir.isPending || updateRetir.isPending;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <MonthNav mes={mes} onChange={setMes} months={months} />
        <div className="ml-auto"><Button size="sm" onClick={() => setChoosing(true)}><Plus className="w-4 h-4 mr-1" /> Adicionar</Button></div>
      </div>

      {/* Reconciliação do mês + acumulado */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Total Despesas (reembolsos)" value={centsToBRL(rec?.totalDespesasCents ?? 0)} tone="neg" />
        <Stat label="Total Retiradas" value={centsToBRL(rec?.totalRetiradasCents ?? 0)} />
        <Stat label={`Diferença ${formatMes(mes)} · desp − retir (+ = falta receber)`} value={centsToBRL(rec?.diferencaCents ?? 0)} tone={(rec?.diferencaCents ?? 0) > 0 ? "warn" : (rec?.diferencaCents ?? 0) < 0 ? "pos" : undefined} />
        <Stat label="Falta receber acumulado" value={centsToBRL(acumQ.data?.diferencaCents ?? 0)} tone={(acumQ.data?.diferencaCents ?? 0) > 0 ? "warn" : "pos"} />
      </div>

      {/* Lista unificada do mês */}
      <div className="rounded-lg border border-border overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Tipo</TableHead><TableHead>Descrição</TableHead><TableHead>Detalhe</TableHead><TableHead className="text-right">Valor</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader>
          <TableBody>
            {(reembQ.isLoading || retirQ.isLoading) && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6"><Loader2 className="w-4 h-4 animate-spin inline" /> Carregando…</TableCell></TableRow>}
            {!reembQ.isLoading && !retirQ.isLoading && reemb.length === 0 && retir.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Nada neste mês.</TableCell></TableRow>}
            {reemb.map((r) => (
              <TableRow key={`g${r.id}`}>
                <TableCell><Badge className="bg-red-500/15 text-red-600 border-red-500/30">Gasto</Badge></TableCell>
                <TableCell className="max-w-[220px] truncate">{r.descricao}</TableCell>
                <TableCell className="text-xs text-muted-foreground whitespace-nowrap"><Badge variant="secondary" className="font-normal mr-1">{catLabel(r.categoria)}</Badge>{r.quemPagou ?? ""}<span className="ml-2 inline-flex items-center gap-1">reemb. <Switch checked={r.reembolsado} onCheckedChange={(v) => setReembFlag.mutate({ id: r.id, reembolsado: !!v })} /></span></TableCell>
                <TableCell className="text-right whitespace-nowrap font-medium">{centsToBRL(r.valorCents)}</TableCell>
                <TableCell className="text-right whitespace-nowrap"><RowActions onEdit={() => setForm({ kind: "gasto", id: r.id, mes: r.mes, categoria: r.categoria as ReembCat, descricao: r.descricao, valor: centsToInput(r.valorCents), quemPagou: r.quemPagou ?? "", reembolsado: r.reembolsado })} onDelete={() => delReemb.mutate({ id: r.id })} /></TableCell>
              </TableRow>
            ))}
            {retir.map((r) => (
              <TableRow key={`r${r.id}`}>
                <TableCell><Badge className="bg-blue-500/15 text-blue-600 border-blue-500/30">Retirada</Badge></TableCell>
                <TableCell className="max-w-[220px] truncate">{r.descricao}</TableCell>
                <TableCell className="text-xs text-muted-foreground">—</TableCell>
                <TableCell className="text-right whitespace-nowrap font-medium">{centsToBRL(r.valorCents)}</TableCell>
                <TableCell className="text-right whitespace-nowrap"><RowActions onEdit={() => setForm({ kind: "retirada", id: r.id, mes: r.mes, descricao: r.descricao, valor: centsToInput(r.valorCents) })} onDelete={() => delRetir.mutate({ id: r.id })} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Chooser: Gasto ou Retirada */}
      <Dialog open={choosing} onOpenChange={setChoosing}>
        <DialogContent>
          <DialogHeader><DialogTitle>Adicionar</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <button className="rounded-lg border border-border p-4 hover:border-primary/50 hover:bg-muted/30 text-left" onClick={() => { setChoosing(false); setForm({ kind: "gasto", mes, categoria: "PLATAFORMA_ANUNCIOS", descricao: "", valor: "", quemPagou: "", reembolsado: false }); }}>
              <p className="text-sm font-medium">Gasto (reembolso)</p><p className="text-xs text-muted-foreground">Despesa a reembolsar</p>
            </button>
            <button className="rounded-lg border border-border p-4 hover:border-primary/50 hover:bg-muted/30 text-left" onClick={() => { setChoosing(false); setForm({ kind: "retirada", mes, descricao: "", valor: "" }); }}>
              <p className="text-sm font-medium">Retirada</p><p className="text-xs text-muted-foreground">Retirada Gui & SELVA</p>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Form gasto/retirada */}
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
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)}>Cancelar</Button>
            <Button onClick={submit} disabled={saving}>{saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Salvar</Button>
          </DialogFooter>
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
          <p className="text-sm text-muted-foreground mt-1">P&amp;L mês a mês com tags de cliente · reconciliação Gui &amp; SELVA.</p>
        </div>
        {months.length === 0 ? (
          <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Carregando…</p>
        ) : (
          <Tabs defaultValue="pnl">
            <TabsList>
              <TabsTrigger value="pnl">P&amp;L</TabsTrigger>
              <TabsTrigger value="guiselva"><ArrowLeftRight className="w-3.5 h-3.5 mr-1" /> Gui &amp; SELVA</TabsTrigger>
            </TabsList>
            <TabsContent value="pnl" className="mt-4"><PnlTab months={months} clientes={clientes} clienteById={clienteById} /></TabsContent>
            <TabsContent value="guiselva" className="mt-4"><GuiSelvaTab months={months} /></TabsContent>
          </Tabs>
        )}
      </div>
    </MetaDashboardLayout>
  );
}
