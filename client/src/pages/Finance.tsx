/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Controle Financeiro (área Administrativa) — P&L · Reembolsos · Gui & SELVA
 * ─────────────────────────────────────────────────────────────────────────────
 *  Restrito ao role admin (guard no front + TODAS as procedures finance.* são
 *  adminProcedure no backend). Dinheiro em centavos (int) → formatado em BRL.
 *  `mes` = 'YYYY-MM' tratado como string (sem Date/toISOString, sem timezone).
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useMemo, useState } from "react";
import { MetaDashboardLayout } from "@/components/MetaDashboardLayout";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Wallet, Plus, Pencil, Trash2, Loader2, ArrowLeftRight } from "lucide-react";
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

// ── Utils (centavos ⇄ BRL; mês legível sem Date) ─────────────────────────────
const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const centsToBRL = (c: number) => BRL.format((c ?? 0) / 100);
const MES_ABBR = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
function formatMes(mes: string): string {
  const [y, m] = (mes ?? "").split("-");
  const i = Number(m) - 1;
  return `${MES_ABBR[i] ?? m}/${y}`;
}
function parseMoneyToCents(input: string): number | null {
  let s = (input ?? "").trim().replace(/R\$|\s/g, "");
  if (!s) return null;
  const hasComma = s.includes(","), hasDot = s.includes(".");
  if (hasComma && hasDot) s = s.replace(/\./g, "").replace(",", "."); // 1.234,56
  else if (hasComma) s = s.replace(",", "."); // 1234,56
  const n = Number(s);
  if (!isFinite(n)) return null; // sinal permitido (ex.: estorno de retirada negativo)
  return Math.round(n * 100);
}
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

// Campo de valor (BRL) reutilizável.
function MoneyInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder ?? "R$ 0,00"} inputMode="decimal" />;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Aba P&L
// ─────────────────────────────────────────────────────────────────────────────
type PnlRow = { id: number; mes: string; tipo: string; descricao: string; valorCents: number; status: "pago" | "pendente" };

function PnlTab({ months }: { months: string[] }) {
  const utils = trpc.useUtils();
  const [mesFrom, setMesFrom] = useState<string>("");
  const [mesTo, setMesTo] = useState<string>("");
  const [tipo, setTipo] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [form, setForm] = useState<null | { id?: number; mes: string; tipo: PnlTipo; descricao: string; valor: string; status: "pago" | "pendente" }>(null);

  const filters = {
    ...(mesFrom ? { mesFrom } : {}),
    ...(mesTo ? { mesTo } : {}),
    ...(tipo ? { tipo: tipo as PnlTipo } : {}),
    ...(status ? { status: status as "pago" | "pendente" } : {}),
  };
  const listQ = trpc.finance.pnl.list.useQuery(filters);
  const rows = (listQ.data ?? []) as PnlRow[];

  const invalidate = () => { utils.finance.pnl.list.invalidate(); utils.finance.months.invalidate(); };
  const create = trpc.finance.pnl.create.useMutation({ onSuccess: () => { invalidate(); setForm(null); toast.success("Lançamento criado."); } });
  const update = trpc.finance.pnl.update.useMutation({ onSuccess: () => { invalidate(); setForm(null); toast.success("Lançamento atualizado."); } });
  const del = trpc.finance.pnl.delete.useMutation({ onSuccess: () => { invalidate(); toast.success("Lançamento excluído."); } });
  const setStatusM = trpc.finance.pnl.setStatus.useMutation({ onSuccess: () => utils.finance.pnl.list.invalidate() });

  const totals = useMemo(() => {
    let receita = 0, despesa = 0, aporte = 0, pendente = 0;
    for (const r of rows) {
      const k = tipoKind(r.tipo);
      if (k === "receita") receita += r.valorCents;
      else if (k === "despesa") despesa += r.valorCents;
      else if (k === "aporte") aporte += r.valorCents;
      if (r.status === "pendente") pendente += r.valorCents;
    }
    return { receita, despesa, aporte, resultado: receita - despesa, pendente };
  }, [rows]);

  const submit = () => {
    if (!form) return;
    if (!MES_RE.test(form.mes)) return toast.error("Mês inválido (use YYYY-MM).");
    if (!form.descricao.trim()) return toast.error("Informe a descrição.");
    const valorCents = parseMoneyToCents(form.valor);
    if (valorCents == null) return toast.error("Valor inválido.");
    const payload = { mes: form.mes, tipo: form.tipo, descricao: form.descricao.trim(), valorCents, status: form.status };
    if (form.id) update.mutate({ id: form.id, ...payload });
    else create.mutate(payload);
  };

  return (
    <div className="space-y-4">
      {/* Totais */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Receita" value={centsToBRL(totals.receita)} tone="pos" />
        <Stat label="Despesa" value={centsToBRL(totals.despesa)} tone="neg" />
        <Stat label="Resultado" value={centsToBRL(totals.resultado)} tone={totals.resultado >= 0 ? "pos" : "neg"} />
        <Stat label="Pendente" value={centsToBRL(totals.pendente)} tone="warn" />
      </div>

      {/* Filtros + adicionar */}
      <div className="flex flex-wrap items-end gap-2">
        <FilterSelect label="De" value={mesFrom} onChange={setMesFrom} options={months} format={formatMes} allLabel="Início" />
        <FilterSelect label="Até" value={mesTo} onChange={setMesTo} options={months} format={formatMes} allLabel="Fim" />
        <FilterSelect label="Tipo" value={tipo} onChange={setTipo} options={PNL_TIPOS.map((t) => t.v)} format={tipoLabel} allLabel="Todos" />
        <FilterSelect label="Status" value={status} onChange={setStatus} options={["pago", "pendente"]} format={(s) => (s === "pago" ? "Pago" : "Pendente")} allLabel="Todos" />
        <div className="ml-auto">
          <Button size="sm" onClick={() => setForm({ mes: mesTo || mesFrom || months[0] || "", tipo: "DESPESA_PONTUAL", descricao: "", valor: "", status: "pendente" })}>
            <Plus className="w-4 h-4 mr-1" /> Lançamento
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Mês</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {listQ.isLoading && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6"><Loader2 className="w-4 h-4 animate-spin inline" /> Carregando…</TableCell></TableRow>}
            {!listQ.isLoading && rows.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">Nenhum lançamento.</TableCell></TableRow>}
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="whitespace-nowrap">{formatMes(r.mes)}</TableCell>
                <TableCell><Badge variant="secondary" className="font-normal">{tipoLabel(r.tipo)}</Badge></TableCell>
                <TableCell className="max-w-[280px] truncate">{r.descricao}</TableCell>
                <TableCell className={`text-right whitespace-nowrap font-medium ${tipoKind(r.tipo) === "despesa" ? "text-red-600" : tipoKind(r.tipo) === "receita" ? "text-emerald-600" : ""}`}>
                  {tipoKind(r.tipo) === "despesa" ? "-" : ""}{centsToBRL(r.valorCents)}
                </TableCell>
                <TableCell>
                  <button
                    onClick={() => setStatusM.mutate({ id: r.id, status: r.status === "pago" ? "pendente" : "pago" })}
                    className="inline-flex"
                    title="Alternar pago/pendente"
                  >
                    <Badge className={r.status === "pago" ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/30" : "bg-amber-500/15 text-amber-600 border-amber-500/30"}>
                      {r.status === "pago" ? "Pago" : "Pendente"}
                    </Badge>
                  </button>
                </TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  <RowActions
                    onEdit={() => setForm({ id: r.id, mes: r.mes, tipo: r.tipo as PnlTipo, descricao: r.descricao, valor: String((r.valorCents / 100).toFixed(2)).replace(".", ","), status: r.status })}
                    onDelete={() => del.mutate({ id: r.id })}
                  />
                </TableCell>
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
              <Field label="Tipo">
                <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v as PnlTipo })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PNL_TIPOS.map((t) => <SelectItem key={t.v} value={t.v}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Descrição" full><Input value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} /></Field>
              <Field label="Valor"><MoneyInput value={form.valor} onChange={(v) => setForm({ ...form, valor: v })} /></Field>
              <Field label="Status">
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as "pago" | "pendente" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="pendente">Pendente</SelectItem><SelectItem value="pago">Pago</SelectItem></SelectContent>
                </Select>
              </Field>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)}>Cancelar</Button>
            <Button onClick={submit} disabled={create.isPending || update.isPending}>
              {(create.isPending || update.isPending) && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Aba Reembolsos
// ─────────────────────────────────────────────────────────────────────────────
type ReembRow = { id: number; mes: string; categoria: string; descricao: string; valorCents: number; quemPagou: string | null; reembolsado: boolean };

function ReembolsosTab({ months }: { months: string[] }) {
  const utils = trpc.useUtils();
  const [mes, setMes] = useState<string>(months[0] ?? "");
  const [cat, setCat] = useState<string>("");
  const [form, setForm] = useState<null | { id?: number; mes: string; categoria: ReembCat; descricao: string; valor: string; quemPagou: string; reembolsado: boolean }>(null);

  const filters = { ...(mes ? { mes } : {}), ...(cat ? { categoria: cat as ReembCat } : {}) };
  const listQ = trpc.finance.reembolsos.list.useQuery(filters);
  const rows = (listQ.data ?? []) as ReembRow[];

  const invalidate = () => { utils.finance.reembolsos.list.invalidate(); utils.finance.months.invalidate(); };
  const create = trpc.finance.reembolsos.create.useMutation({ onSuccess: () => { invalidate(); setForm(null); toast.success("Gasto adicionado."); } });
  const update = trpc.finance.reembolsos.update.useMutation({ onSuccess: () => { invalidate(); setForm(null); toast.success("Gasto atualizado."); } });
  const del = trpc.finance.reembolsos.delete.useMutation({ onSuccess: () => { invalidate(); toast.success("Gasto excluído."); } });
  const setReemb = trpc.finance.reembolsos.setReembolsado.useMutation({ onSuccess: () => utils.finance.reembolsos.list.invalidate() });

  const totals = useMemo(() => {
    const porCat: Record<string, number> = {};
    let total = 0;
    for (const r of rows) { porCat[r.categoria] = (porCat[r.categoria] ?? 0) + r.valorCents; total += r.valorCents; }
    return { porCat, total };
  }, [rows]);

  const submit = () => {
    if (!form) return;
    if (!MES_RE.test(form.mes)) return toast.error("Mês inválido (use YYYY-MM).");
    if (!form.descricao.trim()) return toast.error("Informe a descrição.");
    const valorCents = parseMoneyToCents(form.valor);
    if (valorCents == null) return toast.error("Valor inválido.");
    const payload = { mes: form.mes, categoria: form.categoria, descricao: form.descricao.trim(), valorCents, quemPagou: form.quemPagou.trim() || undefined, reembolsado: form.reembolsado };
    if (form.id) update.mutate({ id: form.id, ...payload });
    else create.mutate(payload);
  };

  return (
    <div className="space-y-4">
      {/* Totais: por categoria + total do mês (= reembolso devido) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {CATEGORIAS.map((c) => <Stat key={c.v} label={c.label} value={centsToBRL(totals.porCat[c.v] ?? 0)} />)}
        <Stat label={mes ? `Reembolso ${formatMes(mes)}` : "Total"} value={centsToBRL(totals.total)} tone="pos" />
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <FilterSelect label="Mês" value={mes} onChange={setMes} options={months} format={formatMes} allLabel="Todos" />
        <FilterSelect label="Categoria" value={cat} onChange={setCat} options={CATEGORIAS.map((c) => c.v)} format={catLabel} allLabel="Todas" />
        <div className="ml-auto">
          <Button size="sm" onClick={() => setForm({ mes: mes || months[0] || "", categoria: "PLATAFORMA_ANUNCIOS", descricao: "", valor: "", quemPagou: "", reembolsado: false })}>
            <Plus className="w-4 h-4 mr-1" /> Gasto
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Mês</TableHead><TableHead>Categoria</TableHead><TableHead>Descrição</TableHead>
              <TableHead>Quem pagou</TableHead><TableHead className="text-right">Valor</TableHead>
              <TableHead>Reembolsado</TableHead><TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {listQ.isLoading && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6"><Loader2 className="w-4 h-4 animate-spin inline" /> Carregando…</TableCell></TableRow>}
            {!listQ.isLoading && rows.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">Nenhum gasto.</TableCell></TableRow>}
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="whitespace-nowrap">{formatMes(r.mes)}</TableCell>
                <TableCell><Badge variant="secondary" className="font-normal">{catLabel(r.categoria)}</Badge></TableCell>
                <TableCell className="max-w-[240px] truncate">{r.descricao}</TableCell>
                <TableCell className="whitespace-nowrap">{r.quemPagou ?? "—"}</TableCell>
                <TableCell className="text-right whitespace-nowrap font-medium">{centsToBRL(r.valorCents)}</TableCell>
                <TableCell><Switch checked={r.reembolsado} onCheckedChange={(v) => setReemb.mutate({ id: r.id, reembolsado: !!v })} /></TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  <RowActions
                    onEdit={() => setForm({ id: r.id, mes: r.mes, categoria: r.categoria as ReembCat, descricao: r.descricao, valor: String((r.valorCents / 100).toFixed(2)).replace(".", ","), quemPagou: r.quemPagou ?? "", reembolsado: r.reembolsado })}
                    onDelete={() => del.mutate({ id: r.id })}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{form?.id ? "Editar gasto" : "Novo gasto"}</DialogTitle></DialogHeader>
          {form && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Mês (YYYY-MM)"><Input value={form.mes} onChange={(e) => setForm({ ...form, mes: e.target.value })} placeholder="2026-07" /></Field>
              <Field label="Categoria">
                <Select value={form.categoria} onValueChange={(v) => setForm({ ...form, categoria: v as ReembCat })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CATEGORIAS.map((c) => <SelectItem key={c.v} value={c.v}>{c.label}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Descrição" full><Input value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} /></Field>
              <Field label="Valor"><MoneyInput value={form.valor} onChange={(v) => setForm({ ...form, valor: v })} /></Field>
              <Field label="Quem pagou"><Input value={form.quemPagou} onChange={(e) => setForm({ ...form, quemPagou: e.target.value })} placeholder="Gui / SELVA…" /></Field>
              <Field label="Reembolsado" full>
                <div className="flex items-center gap-2 h-9"><Switch checked={form.reembolsado} onCheckedChange={(v) => setForm({ ...form, reembolsado: !!v })} /><span className="text-sm text-muted-foreground">{form.reembolsado ? "Sim" : "Não"}</span></div>
              </Field>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)}>Cancelar</Button>
            <Button onClick={submit} disabled={create.isPending || update.isPending}>
              {(create.isPending || update.isPending) && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Aba Gui & SELVA (reconciliação + retiradas)
// ─────────────────────────────────────────────────────────────────────────────
type RetiradaRow = { id: number; mes: string; descricao: string; valorCents: number };

function RetiradasTab({ months }: { months: string[] }) {
  const utils = trpc.useUtils();
  const [mes, setMes] = useState<string>(months[0] ?? "");
  const [form, setForm] = useState<null | { id?: number; mes: string; descricao: string; valor: string }>(null);

  const listQ = trpc.finance.retiradas.list.useQuery(mes ? { mes } : {});
  const rows = (listQ.data ?? []) as RetiradaRow[];
  const recQ = trpc.finance.reconciliacao.get.useQuery({ mes: mes || "2026-01" }, { enabled: MES_RE.test(mes) });
  const rec = recQ.data;

  const invalidate = () => { utils.finance.retiradas.list.invalidate(); utils.finance.reconciliacao.invalidate(); utils.finance.months.invalidate(); };
  const create = trpc.finance.retiradas.create.useMutation({ onSuccess: () => { invalidate(); setForm(null); toast.success("Retirada adicionada."); } });
  const update = trpc.finance.retiradas.update.useMutation({ onSuccess: () => { invalidate(); setForm(null); toast.success("Retirada atualizada."); } });
  const del = trpc.finance.retiradas.delete.useMutation({ onSuccess: () => { invalidate(); toast.success("Retirada excluída."); } });

  const submit = () => {
    if (!form) return;
    if (!MES_RE.test(form.mes)) return toast.error("Mês inválido (use YYYY-MM).");
    if (!form.descricao.trim()) return toast.error("Informe a descrição.");
    const valorCents = parseMoneyToCents(form.valor);
    if (valorCents == null) return toast.error("Valor inválido.");
    const payload = { mes: form.mes, descricao: form.descricao.trim(), valorCents };
    if (form.id) update.mutate({ id: form.id, ...payload });
    else create.mutate(payload);
  };

  return (
    <div className="space-y-4">
      {/* Reconciliação do mês selecionado */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Stat label="Total Despesas (reembolsos)" value={centsToBRL(rec?.totalDespesasCents ?? 0)} tone="neg" />
        <Stat label="Total Retiradas" value={centsToBRL(rec?.totalRetiradasCents ?? 0)} />
        <Stat label="Diferença · despesas − retiradas (+ = falta receber)" value={centsToBRL(rec?.diferencaCents ?? 0)} tone={(rec?.diferencaCents ?? 0) > 0 ? "warn" : (rec?.diferencaCents ?? 0) < 0 ? "pos" : undefined} />
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <FilterSelect label="Mês" value={mes} onChange={setMes} options={months} format={formatMes} allLabel="Todos" />
        <div className="ml-auto">
          <Button size="sm" onClick={() => setForm({ mes: mes || months[0] || "", descricao: "", valor: "" })}>
            <Plus className="w-4 h-4 mr-1" /> Retirada
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow><TableHead>Mês</TableHead><TableHead>Descrição</TableHead><TableHead className="text-right">Valor</TableHead><TableHead className="text-right">Ações</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {listQ.isLoading && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6"><Loader2 className="w-4 h-4 animate-spin inline" /> Carregando…</TableCell></TableRow>}
            {!listQ.isLoading && rows.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">Nenhuma retirada.</TableCell></TableRow>}
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="whitespace-nowrap">{formatMes(r.mes)}</TableCell>
                <TableCell className="max-w-[320px] truncate">{r.descricao}</TableCell>
                <TableCell className="text-right whitespace-nowrap font-medium">{centsToBRL(r.valorCents)}</TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  <RowActions
                    onEdit={() => setForm({ id: r.id, mes: r.mes, descricao: r.descricao, valor: String((r.valorCents / 100).toFixed(2)).replace(".", ",") })}
                    onDelete={() => del.mutate({ id: r.id })}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{form?.id ? "Editar retirada" : "Nova retirada"}</DialogTitle></DialogHeader>
          {form && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Mês (YYYY-MM)"><Input value={form.mes} onChange={(e) => setForm({ ...form, mes: e.target.value })} placeholder="2026-07" /></Field>
              <Field label="Valor"><MoneyInput value={form.valor} onChange={(v) => setForm({ ...form, valor: v })} /></Field>
              <Field label="Descrição" full><Input value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} placeholder="Retirada 1" /></Field>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)}>Cancelar</Button>
            <Button onClick={submit} disabled={create.isPending || update.isPending}>
              {(create.isPending || update.isPending) && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Pequenos componentes de UI ────────────────────────────────────────────────
function Stat({ label, value, tone }: { label: string; value: string; tone?: "pos" | "neg" | "warn" }) {
  const color = tone === "pos" ? "text-emerald-600" : tone === "neg" ? "text-red-600" : tone === "warn" ? "text-amber-600" : "text-foreground";
  return (
    <Card><CardContent className="p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`text-lg font-bold ${color}`}>{value}</p>
    </CardContent></Card>
  );
}
function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return <div className={`flex flex-col gap-1.5 ${full ? "col-span-2" : ""}`}><Label className="text-xs">{label}</Label>{children}</div>;
}
function FilterSelect({ label, value, onChange, options, format, allLabel }: { label: string; value: string; onChange: (v: string) => void; options: string[]; format: (v: string) => string; allLabel: string }) {
  const ALL = "__all__";
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      <Select value={value || ALL} onValueChange={(v) => onChange(v === ALL ? "" : v)}>
        <SelectTrigger className="h-9 w-[160px]"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{allLabel}</SelectItem>
          {options.map((o) => <SelectItem key={o} value={o}>{format(o)}</SelectItem>)}
        </SelectContent>
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
      ) : (
        <button onClick={() => setConfirm(true)} className="p-1.5 text-muted-foreground hover:text-destructive" title="Excluir"><Trash2 className="w-4 h-4" /></button>
      )}
    </div>
  );
}

// ── Página ────────────────────────────────────────────────────────────────────
export default function Finance() {
  const { user } = useAuth();
  // Guard no front (o backend também exige admin em todas as procedures).
  if ((user as { role?: string } | null)?.role !== "admin") return null;

  const monthsQ = trpc.finance.months.useQuery();
  const months = monthsQ.data ?? [];

  return (
    <MetaDashboardLayout>
      <div className="max-w-5xl mx-auto py-6 space-y-6">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2"><Wallet className="w-5 h-5" /> Controle Financeiro</h1>
          <p className="text-sm text-muted-foreground mt-1">P&amp;L, reembolsos e reconciliação Gui &amp; SELVA. Valores em BRL.</p>
        </div>
        <Tabs defaultValue="pnl">
          <TabsList>
            <TabsTrigger value="pnl">P&amp;L</TabsTrigger>
            <TabsTrigger value="reembolsos">Reembolsos</TabsTrigger>
            <TabsTrigger value="retiradas"><ArrowLeftRight className="w-3.5 h-3.5 mr-1" /> Gui &amp; SELVA</TabsTrigger>
          </TabsList>
          <TabsContent value="pnl" className="mt-4"><PnlTab months={months} /></TabsContent>
          <TabsContent value="reembolsos" className="mt-4"><ReembolsosTab months={months} /></TabsContent>
          <TabsContent value="retiradas" className="mt-4"><RetiradasTab months={months} /></TabsContent>
        </Tabs>
      </div>
    </MetaDashboardLayout>
  );
}
