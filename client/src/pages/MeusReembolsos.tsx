/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Meus reembolsos — a única página do financeiro aberta a colaboradores
 * ─────────────────────────────────────────────────────────────────────────────
 *  Faz duas coisas: lançar um gasto que precisa de reembolso e acompanhar o
 *  status de cada lançamento. Nada mais do financeiro aparece aqui.
 *
 *  O recorte por pessoa é do SERVIDOR: `finance.solicitacoes.minhas` não aceita
 *  parâmetro de usuário, deriva de `ctx.user.id`. Esta tela não filtra nada —
 *  ela recebe só o que é dela. Ao mexer aqui, não introduza um `userId` vindo
 *  do front "para facilitar": seria o único jeito de vazar dado de colega.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { HubShell } from "@/pages/hub/HubShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import {
  Wallet, Plus, Loader2, Clock, CheckCircle2, XCircle, Paperclip, Trash2, Pencil, FileText, ExternalLink,
} from "lucide-react";
import { toast } from "sonner";

/** Mesma taxonomia das despesas pontuais do financeiro (SUBCATS em Finance.tsx).
 *  Uma segunda lista aqui criaria duas categorizações para o mesmo balanço. */
const CATEGORIAS = [
  { v: "OFFICE", label: "Office & Estrutura" },
  { v: "EQUIPAMENTOS", label: "Equipamentos" },
  { v: "PLATAFORMAS", label: "Plataformas & Ferramentas" },
  { v: "TELEFONIA", label: "Telefonia" },
  { v: "EQUIPE_EVENTOS", label: "Equipe & Eventos" },
  { v: "FREELAS", label: "Freelas" },
  { v: "TAXAS", label: "Taxas" },
  { v: "OUTROS", label: "Outros" },
];
const catLabel = (v: string) => CATEGORIAS.find((c) => c.v === v)?.label ?? "Outros";

const STATUS_CFG: Record<string, { label: string; cor: string; bg: string; borda: string; Icone: typeof Clock }> = {
  aguardando:  { label: "Aguardando aprovação", cor: "#a06508", bg: "rgba(239,159,39,0.12)", borda: "rgba(239,159,39,0.32)", Icone: Clock },
  aprovado:    { label: "Aprovado",             cor: "#177f5e", bg: "rgba(29,158,117,0.10)", borda: "rgba(29,158,117,0.28)", Icone: CheckCircle2 },
  reembolsado: { label: "Reembolsado",          cor: "#177f5e", bg: "rgba(29,158,117,0.16)", borda: "rgba(29,158,117,0.40)", Icone: CheckCircle2 },
  recusado:    { label: "Recusado",             cor: "#c0403f", bg: "rgba(226,75,74,0.10)",  borda: "rgba(226,75,74,0.28)",  Icone: XCircle },
};

const centsToBRL = (c: number) =>
  (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** "12,50" / "12.50" / "1.234,56" → centavos. */
function parseMoneyToCents(s: string): number | null {
  const limpo = s.trim().replace(/[R$\s]/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(limpo);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

const hojeStr = () => new Date().toISOString().slice(0, 10);
const fmtData = (s: string | null) => (s ? s.split("-").reverse().join("/") : "—");

type Rascunho = {
  id?: number;
  dataGasto: string;
  descricao: string;
  valor: string;
  subcategoria: string;
  observacao: string;
  comprovanteKey: string | null;
};

const VAZIO: Rascunho = {
  dataGasto: hojeStr(), descricao: "", valor: "", subcategoria: "OUTROS", observacao: "", comprovanteKey: null,
};

/** Botão de anexo. Sobe o arquivo na hora e guarda só a KEY no rascunho. */
function AnexoComprovante({ chave, onChange }: { chave: string | null; onChange: (k: string | null) => void }) {
  const [enviando, setEnviando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function enviar(file: File) {
    setEnviando(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/uploads/comprovante", { method: "POST", body: fd, credentials: "include" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? "Falha no upload.");
      onChange(j.key);
      toast.success("Comprovante anexado.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setEnviando(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) enviar(f); }}
      />
      <Button type="button" size="sm" variant="outline" disabled={enviando} onClick={() => inputRef.current?.click()}>
        {enviando
          ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Enviando…</>
          : <><Paperclip className="w-3.5 h-3.5 mr-1.5" /> {chave ? "Trocar comprovante" : "Anexar comprovante"}</>}
      </Button>
      {chave && (
        <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600">
          <FileText className="w-3.5 h-3.5" /> anexado
          <button type="button" onClick={() => onChange(null)} className="text-muted-foreground hover:text-destructive ml-1" title="Remover anexo">
            <Trash2 className="w-3 h-3" />
          </button>
        </span>
      )}
      <span className="text-[11px] text-muted-foreground">Opcional · imagem ou PDF, até 5 MB</span>
    </div>
  );
}

/** Link do comprovante, buscado só quando pedido: a URL é assinada e expira. */
function VerComprovante({ id }: { id: number }) {
  const [pedido, setPedido] = useState(false);
  const q = trpc.finance.solicitacoes.comprovanteUrl.useQuery({ id }, { enabled: pedido });

  if (q.data?.url) {
    return (
      <a href={q.data.url} target="_blank" rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:opacity-70">
        <ExternalLink className="w-3 h-3" /> abrir comprovante
      </a>
    );
  }
  return (
    <button onClick={() => setPedido(true)} disabled={q.isLoading}
      className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground">
      {q.isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Paperclip className="w-3 h-3" />} ver comprovante
    </button>
  );
}

export default function MeusReembolsos() {
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  const lista = trpc.finance.solicitacoes.minhas.useQuery();

  const aoTerminar = () => { lista.refetch(); setRascunho(null); };
  const criar = trpc.finance.solicitacoes.minhaCriar.useMutation({
    onSuccess: () => { toast.success("Lançamento enviado para aprovação."); aoTerminar(); },
    onError: (e) => toast.error(e.message),
  });
  const editar = trpc.finance.solicitacoes.minhaEditar.useMutation({
    onSuccess: () => { toast.success("Lançamento atualizado."); aoTerminar(); },
    onError: (e) => toast.error(e.message),
  });
  const cancelar = trpc.finance.solicitacoes.minhaCancelar.useMutation({
    onSuccess: () => { toast.success("Lançamento cancelado."); lista.refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const itens = lista.data ?? [];
  const totais = {
    aguardando: itens.filter((i) => i.status === "aguardando").reduce((s, i) => s + i.valorCents, 0),
    aprovado: itens.filter((i) => i.status === "aprovado").reduce((s, i) => s + i.valorCents, 0),
    reembolsado: itens.filter((i) => i.status === "reembolsado").reduce((s, i) => s + i.valorCents, 0),
  };

  function salvar() {
    if (!rascunho) return;
    const cents = parseMoneyToCents(rascunho.valor);
    if (!rascunho.descricao.trim()) return toast.error("Descreva o gasto.");
    if (cents == null) return toast.error("Valor inválido.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rascunho.dataGasto)) return toast.error("Data inválida.");
    const base = {
      dataGasto: rascunho.dataGasto,
      descricao: rascunho.descricao.trim(),
      valorCents: cents,
      subcategoria: rascunho.subcategoria,
      observacao: rascunho.observacao.trim() || undefined,
      comprovanteKey: rascunho.comprovanteKey ?? undefined,
    };
    if (rascunho.id) editar.mutate({ id: rascunho.id, ...base });
    else criar.mutate(base);
  }

  const salvando = criar.isPending || editar.isPending;

  return (
    <HubShell>
      <div className="max-w-3xl mx-auto py-6 space-y-6 px-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Wallet className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-xl font-extrabold text-foreground">Meus reembolsos</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Lance um gasto que precisa de reembolso e acompanhe a aprovação.
              </p>
            </div>
          </div>
          <Button onClick={() => setRascunho({ ...VAZIO })}>
            <Plus className="w-4 h-4 mr-1.5" /> Lançar gasto
          </Button>
        </div>

        {/* Três totais — a pergunta prática é "quanto ainda me devem". */}
        <div className="grid grid-cols-3 gap-3">
          {([
            ["aguardando", "Aguardando"],
            ["aprovado", "Aprovado, a receber"],
            ["reembolsado", "Já reembolsado"],
          ] as const).map(([k, rotulo]) => (
            <div key={k} className="rounded-xl border border-border bg-card p-3">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">{rotulo}</p>
              <p className="text-lg font-extrabold tabular-nums mt-0.5" style={{ color: STATUS_CFG[k].cor }}>
                {centsToBRL(totais[k])}
              </p>
            </div>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              Meus lançamentos
              {itens.length > 0 && <span className="text-xs font-medium text-muted-foreground">· {itens.length}</span>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {lista.isLoading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
              </div>
            )}
            {!lista.isLoading && itens.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Você ainda não lançou nenhum gasto. Use “Lançar gasto” quando pagar algo do próprio bolso.
              </p>
            )}
            <div className="grid gap-2.5">
              {itens.map((i) => {
                const cfg = STATUS_CFG[i.status] ?? STATUS_CFG.aguardando;
                const Icone = cfg.Icone;
                const editavel = i.status === "aguardando";
                return (
                  <div key={i.id} className="anim-card p-3.5 border border-border rounded-xl bg-card">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold text-foreground">{i.descricao}</span>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
                            style={{ background: cfg.bg, color: cfg.cor, border: `1px solid ${cfg.borda}` }}>
                            <Icone className="w-3 h-3" /> {cfg.label}
                          </span>
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1.5 flex-wrap">
                          <span>{fmtData(i.dataGasto)}</span>
                          <span className="text-border/70">·</span>
                          <span>{catLabel(i.subcategoria)}</span>
                          {i.comprovanteKey && (<><span className="text-border/70">·</span><VerComprovante id={i.id} /></>)}
                        </div>
                        {i.observacao && <p className="text-xs text-muted-foreground mt-1.5">{i.observacao}</p>}
                        {/* Recusa sem motivo deixa o colaborador sem saber o que
                            corrigir — por isso o motivo é obrigatório no servidor. */}
                        {i.status === "recusado" && i.motivoRecusa && (
                          <div className="mt-2 rounded-lg border border-destructive/30 bg-destructive/[0.05] p-2.5">
                            <p className="text-[10px] font-bold uppercase tracking-wide text-destructive mb-0.5">Motivo</p>
                            <p className="text-xs text-foreground/80">{i.motivoRecusa}</p>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-base font-extrabold tabular-nums">{centsToBRL(i.valorCents)}</span>
                        {editavel && (
                          <>
                            <Button size="sm" variant="ghost" title="Editar"
                              onClick={() => setRascunho({
                                id: i.id, dataGasto: i.dataGasto, descricao: i.descricao,
                                valor: (i.valorCents / 100).toFixed(2).replace(".", ","),
                                subcategoria: i.subcategoria, observacao: i.observacao ?? "",
                                comprovanteKey: i.comprovanteKey,
                              })}>
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button size="sm" variant="ghost" title="Cancelar lançamento"
                              className="text-muted-foreground hover:text-destructive"
                              disabled={cancelar.isPending}
                              onClick={() => cancelar.mutate({ id: i.id })}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!rascunho} onOpenChange={(v) => !v && setRascunho(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{rascunho?.id ? "Editar lançamento" : "Lançar gasto para reembolso"}</DialogTitle>
            <DialogDescription>
              Vai para aprovação do administrativo. Enquanto estiver aguardando, você pode editar ou cancelar.
            </DialogDescription>
          </DialogHeader>

          {rascunho && (
            <div className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Data do gasto</Label>
                  <Input type="date" value={rascunho.dataGasto} max={hojeStr()}
                    onChange={(e) => setRascunho({ ...rascunho, dataGasto: e.target.value })} className="mt-1" />
                  <p className="text-[11px] text-muted-foreground mt-1">Define o mês do lançamento.</p>
                </div>
                <div>
                  <Label>Valor</Label>
                  <Input inputMode="decimal" placeholder="0,00" value={rascunho.valor}
                    onChange={(e) => setRascunho({ ...rascunho, valor: e.target.value })} className="mt-1" />
                </div>
              </div>

              <div>
                <Label>Descrição</Label>
                <Input placeholder="Ex: Uber para reunião no cliente" value={rascunho.descricao}
                  onChange={(e) => setRascunho({ ...rascunho, descricao: e.target.value })} className="mt-1" />
              </div>

              <div>
                <Label>Categoria</Label>
                <Select value={rascunho.subcategoria} onValueChange={(v) => setRascunho({ ...rascunho, subcategoria: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIAS.map((c) => <SelectItem key={c.v} value={c.v}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Observação (opcional)</Label>
                <Textarea placeholder="Contexto que ajude na aprovação" value={rascunho.observacao}
                  onChange={(e) => setRascunho({ ...rascunho, observacao: e.target.value })}
                  className="mt-1 min-h-[60px]" />
              </div>

              <div>
                <Label className="mb-1.5">Comprovante</Label>
                <AnexoComprovante chave={rascunho.comprovanteKey}
                  onChange={(k) => setRascunho({ ...rascunho, comprovanteKey: k })} />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setRascunho(null)}>Cancelar</Button>
            <Button onClick={salvar} disabled={salvando}>
              {salvando ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Enviando…</> : rascunho?.id ? "Salvar" : "Enviar para aprovação"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </HubShell>
  );
}
