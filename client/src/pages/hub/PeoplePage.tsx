/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Selva Spaces — Gerenciamento de Colaboradores (admin)
 * ─────────────────────────────────────────────────────────────────────────────
 *  NOMENCLATURA: no banco o campo é `operationalRole: coordinator`, mas isso
 *  NÃO é um cargo — é roteamento de alerta. A UI fala "Ativar alertas por
 *  cliente" porque é o que a coisa faz. O nome interno fica como dívida técnica
 *  registrada: renomear coluna e enum em produção é risco sem retorno agora.
 *  Lista/cria/edita colaboradores, altera role, ativa/desativa e reseta a senha
 *  temporária. Toda ação é validada no backend (people.* = adminProcedure).
 *  A senha temporária aparece UMA vez ao criar/resetar — nunca é armazenada em
 *  texto nem consultável depois.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useMemo, useState } from "react";
import { Users, Plus, KeyRound, Pencil, Check, X, Loader2, Copy, Search, Briefcase, Trash2, AlertTriangle, Cake } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { HubShell } from "./HubShell";
import { canManagePeople, ROLE_LABELS, ROLES, type Role } from "@shared/permissions";

type Person = {
  id: number;
  name: string | null;
  email: string | null;
  role: Role;
  operationalRole: "collaborator" | "coordinator";
  jobTitle: string | null;
  birthdayDay: number | null;
  birthdayMonth: number | null;
  mustChangePassword: boolean;
  active: boolean;
};

function statusBadge(p: Person) {
  if (!p.active) return <Badge variant="secondary">Desativado</Badge>;
  if (p.mustChangePassword) return <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30">1º acesso pendente</Badge>;
  return <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30">Ativo</Badge>;
}

function TempPasswordBanner({ email, password, onClose }: { email: string; password: string; onClose: () => void }) {
  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold">Senha temporária gerada para {email}</p>
          <p className="text-muted-foreground mt-0.5">Copie agora — ela não será exibida novamente. O banco guarda apenas o hash.</p>
          <div className="mt-2 flex items-center gap-2">
            <code className="rounded bg-background px-2 py-1 font-mono text-sm border border-border">{password}</code>
            <button onClick={() => navigator.clipboard?.writeText(password)} className="text-muted-foreground hover:text-foreground" title="Copiar">
              <Copy className="w-4 h-4" />
            </button>
          </div>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
      </div>
    </div>
  );
}

function AddForm({ onCreated }: { onCreated: (email: string, pwd: string) => void }) {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", role: "user" as Role, jobTitle: "", day: "", month: "" });
  const [error, setError] = useState<string | null>(null);

  const create = trpc.people.create.useMutation({
    onSuccess: (res) => {
      onCreated(form.email, res.tempPassword);
      utils.people.list.invalidate();
      setForm({ name: "", email: "", role: "user", jobTitle: "", day: "", month: "" });
      setOpen(false);
    },
    onError: (e) => setError(e.message),
  });

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:opacity-80">
        <Plus className="w-4 h-4" /> Adicionar colaborador
      </button>
    );
  }

  return (
    <Card className="gap-4 py-5">
      <div className="px-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5"><Label className="text-xs">Nome</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        <div className="flex flex-col gap-1.5"><Label className="text-xs">E-mail</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Role</Label>
          <select className="h-9 rounded-md border border-border bg-input px-3 text-sm" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
            {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1.5"><Label className="text-xs">Cargo (opcional)</Label><Input value={form.jobTitle} onChange={(e) => setForm({ ...form, jobTitle: e.target.value })} /></div>
        <div className="flex flex-col gap-1.5"><Label className="text-xs">Aniversário — dia</Label><Input type="number" min={1} max={31} value={form.day} onChange={(e) => setForm({ ...form, day: e.target.value })} /></div>
        <div className="flex flex-col gap-1.5"><Label className="text-xs">Aniversário — mês</Label><Input type="number" min={1} max={12} value={form.month} onChange={(e) => setForm({ ...form, month: e.target.value })} /></div>
      </div>
      {error && <p className="px-5 text-xs text-destructive">{error}</p>}
      <div className="px-5 flex items-center gap-3">
        <button
          onClick={() => {
            setError(null);
            create.mutate({
              name: form.name.trim(),
              email: form.email.trim(),
              role: form.role,
              jobTitle: form.jobTitle.trim() || undefined,
              birthdayDay: form.day ? Number(form.day) : undefined,
              birthdayMonth: form.month ? Number(form.month) : undefined,
            });
          }}
          disabled={create.isPending || !form.name.trim() || !form.email.trim()}
          className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium px-4 py-2 hover:opacity-90 disabled:opacity-60"
        >
          {create.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Criar colaborador
        </button>
        <button onClick={() => { setOpen(false); setError(null); }} className="text-sm text-muted-foreground hover:text-foreground">Cancelar</button>
      </div>
    </Card>
  );
}

/** Clientes que a pessoa acompanha: busca + seleção múltipla + salvar. */
function ClientesAcompanhados({ userId, onClose }: { userId: number; onClose: () => void }) {
  const utils = trpc.useUtils();
  const clientesQ = trpc.people.clientesDisponiveis.useQuery();
  const vinculosQ = trpc.people.vinculos.useQuery();
  const [busca, setBusca] = useState("");
  const [sel, setSel] = useState<number[] | null>(null);

  // Estado inicial vem do servidor; só passa a ser local depois do 1º clique.
  const atuais = useMemo(
    () => (vinculosQ.data ?? []).filter((v) => v.userId === userId).map((v) => v.accountId),
    [vinculosQ.data, userId],
  );
  const marcados = sel ?? atuais;

  const salvar = trpc.people.setClientes.useMutation({
    onSuccess: (r) => {
      utils.people.vinculos.invalidate();
      toast.success(r.total === 0 ? "Nenhum cliente selecionado." : `Recebe alertas de ${r.total} cliente(s).`);
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  const lista = (clientesQ.data ?? []).filter((c) => c.nome.toLowerCase().includes(busca.toLowerCase()));
  const mudou = marcados.length !== atuais.length || marcados.some((m) => !atuais.includes(m));

  return (
    <div className="mt-3 rounded-lg border border-accent/30 bg-primary/[0.03] p-3">
      <p className="text-[11px] text-muted-foreground mb-2">Escolha quais clientes esta pessoa deve acompanhar e receber alertas.</p>
      <div className="flex items-center gap-2 mb-2">
        <Search className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
        <input
          value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar cliente…"
          className="flex-1 bg-transparent text-xs focus:outline-none"
        />
        <span className="text-[11px] text-muted-foreground">{marcados.length} selecionado(s)</span>
      </div>
      {clientesQ.isLoading ? (
        <p className="text-xs text-muted-foreground py-2">Carregando clientes…</p>
      ) : (
        <div className="flex flex-wrap gap-1.5 max-h-44 overflow-auto">
          {lista.map((c) => {
            const on = marcados.includes(c.id);
            return (
              <button key={c.id}
                onClick={() => setSel(on ? marcados.filter((x) => x !== c.id) : [...marcados, c.id])}
                className={`px-2 py-1 rounded-full text-[11px] border transition ${on ? "border-accent bg-primary/15 text-accent font-medium" : "border-border text-muted-foreground hover:text-foreground"}`}>
                {c.nome}
              </button>
            );
          })}
          {lista.length === 0 && <p className="text-xs text-muted-foreground py-2">Nenhum cliente encontrado.</p>}
        </div>
      )}
      <div className="flex justify-end gap-2 mt-3">
        <button onClick={onClose} className="text-xs px-3 py-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground">Fechar</button>
        <button
          onClick={() => salvar.mutate({ userId, accountIds: marcados })}
          disabled={!mudou || salvar.isPending}
          className="text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground font-medium disabled:opacity-50">
          {salvar.isPending ? "Salvando…" : "Salvar clientes"}
        </button>
      </div>
    </div>
  );
}

function PersonRow({ p, onTempPassword }: { p: Person; onTempPassword: (email: string, pwd: string) => void }) {
  const utils = trpc.useUtils();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    name: p.name ?? "", email: p.email ?? "", jobTitle: p.jobTitle ?? "",
    day: p.birthdayDay?.toString() ?? "", month: p.birthdayMonth?.toString() ?? "",
  });

  const [verClientes, setVerClientes] = useState(false);
  const [excluir, setExcluir] = useState(false);
  // `coordinator` é o valor legado no banco; na UI isto significa "recebe
  // alertas dos clientes selecionados".
  const recebeAlertas = p.operationalRole === "coordinator";
  const vinculosQ = trpc.people.vinculos.useQuery();
  const meusClientes = (vinculosQ.data ?? []).filter((v) => v.userId === p.id);

  const update = trpc.people.update.useMutation({
    onSuccess: () => { utils.people.list.invalidate(); utils.people.vinculos.invalidate(); setEditing(false); },
    onError: (e) => toast.error(e.message),
  });

  /**
   * Desativar é soft delete: a pessoa perde acesso e para de receber alertas,
   * mas auditoria, histórico e vínculos ficam. O backend recusa auto-desativação
   * e o último admin — isto aqui é só o aviso do que vai acontecer.
   */
  const alternarAtivo = (v: boolean) => {
    if (!v) {
      const temClientes = meusClientes.length > 0;
      const msg = `Tem certeza que deseja desativar ${p.name}? A pessoa perderá acesso ao SELVA Spaces e deixará de receber notificações.`
        + (temClientes ? `\n\nEsta pessoa recebe alertas de ${meusClientes.length} cliente(s). A seleção será preservada, mas ela não receberá alertas enquanto estiver inativa.` : "");
      if (!confirm(msg)) return;
    }
    update.mutate({ id: p.id, active: v });
  };

  /** Desligar apaga os vínculos no backend — avisar antes do efeito real. */
  const mudarAlertas = (ligar: boolean) => {
    if (!ligar && meusClientes.length > 0) {
      const ok = confirm(`${p.name} deixará de receber alertas dos ${meusClientes.length} cliente(s) selecionados. Deseja continuar?`);
      if (!ok) return;
    }
    update.mutate({ id: p.id, operationalRole: ligar ? "coordinator" : "collaborator" });
    if (!ligar) setVerClientes(false);
  };
  const reset = trpc.people.resetPassword.useMutation({ onSuccess: (res) => onTempPassword(p.email ?? "", res.tempPassword) });

  const bday = p.birthdayDay && p.birthdayMonth ? `${String(p.birthdayDay).padStart(2, "0")}/${String(p.birthdayMonth).padStart(2, "0")}` : "—";

  if (editing) {
    return (
      <div className="rounded-lg border border-border p-3 grid grid-cols-1 sm:grid-cols-5 gap-2 items-end">
        <div className="flex flex-col gap-1"><Label className="text-[10px]">Nome</Label><Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></div>
        <div className="flex flex-col gap-1"><Label className="text-[10px]">E-mail</Label><Input value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} /></div>
        <div className="flex flex-col gap-1"><Label className="text-[10px]">Cargo</Label><Input value={draft.jobTitle} onChange={(e) => setDraft({ ...draft, jobTitle: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-1">
          <div className="flex flex-col gap-1"><Label className="text-[10px]">Dia</Label><Input type="number" value={draft.day} onChange={(e) => setDraft({ ...draft, day: e.target.value })} /></div>
          <div className="flex flex-col gap-1"><Label className="text-[10px]">Mês</Label><Input type="number" value={draft.month} onChange={(e) => setDraft({ ...draft, month: e.target.value })} /></div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => update.mutate({
              id: p.id, name: draft.name.trim(), email: draft.email.trim(),
              jobTitle: draft.jobTitle.trim() || null,
              birthdayDay: draft.day ? Number(draft.day) : null,
              birthdayMonth: draft.month ? Number(draft.month) : null,
            })}
            className="p-2 rounded-md bg-primary text-primary-foreground" title="Salvar"><Check className="w-4 h-4" /></button>
          <button onClick={() => setEditing(false)} className="p-2 rounded-md border border-border" title="Cancelar"><X className="w-4 h-4" /></button>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-lg border p-3 ${p.active ? "border-border" : "border-border/60 bg-muted/30"}`}>
    <div className={`flex flex-wrap items-center gap-3 ${p.active ? "" : "opacity-60"}`}>
      <div className="flex-1 min-w-[160px]">
        <p className="text-sm font-medium">{p.name}</p>
        <p className="text-xs text-muted-foreground">{p.email}</p>
      </div>
      <select
        className="h-8 rounded-md border border-border bg-input px-2 text-xs"
        value={p.role}
        onChange={(e) => update.mutate({ id: p.id, role: e.target.value as Role })}
        title="Permissão no sistema — o que a pessoa pode fazer"
      >
        {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
      </select>
      {/* Não é cargo: é configuração de quais alertas a pessoa recebe. */}
      <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none" title="Escolha quais clientes esta pessoa deve acompanhar e receber alertas.">
        <input
          type="checkbox"
          checked={recebeAlertas}
          onChange={(e) => mudarAlertas(e.target.checked)}
        />
        <span className={recebeAlertas ? "text-foreground font-medium" : "text-muted-foreground"}>Alertas por cliente</span>
      </label>
      {recebeAlertas && (
        <button
          onClick={() => setVerClientes((v) => !v)}
          className={`h-8 px-2 rounded-md border text-xs flex items-center gap-1.5 transition ${verClientes ? "border-accent text-accent bg-primary/10" : "border-border text-muted-foreground hover:text-foreground"}`}
          title="Clientes acompanhados">
          <Briefcase className="w-3.5 h-3.5" />
          {meusClientes.length} cliente{meusClientes.length === 1 ? "" : "s"}
        </button>
      )}
      {/* Bolinho só quando há data: com "—", ele viraria enfeite anunciando
          um campo vazio. A largura fixa é a mesma, para a coluna não dançar. */}
      <span className="text-xs text-muted-foreground w-14 flex items-center justify-center gap-1" title="Aniversário">
        {bday !== "—" && <Cake className="w-3 h-3 flex-shrink-0 opacity-70" />}
        {bday}
      </span>
      {statusBadge(p)}
      <div className="flex items-center gap-1" title={p.active ? "Desativar usuário" : "Reativar usuário"}>
        <Switch checked={p.active} onCheckedChange={(v) => alternarAtivo(v)} />
      </div>
      <button onClick={() => setEditing(true)} className="p-2 text-muted-foreground hover:text-foreground" title="Editar"><Pencil className="w-4 h-4" /></button>
      <button
        onClick={() => { if (confirm(`Resetar a senha de ${p.name}? Uma nova senha temporária será gerada.`)) reset.mutate({ id: p.id }); }}
        className="p-2 text-muted-foreground hover:text-foreground" title="Resetar senha temporária"
      >
        {reset.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
      </button>
      {/* Zona de perigo: separada por divisória para não ficar colada no editar. */}
      <span className="w-px h-5 bg-border mx-0.5" />
      <button onClick={() => setExcluir(true)}
        className="p-2 text-muted-foreground hover:text-destructive" title="Excluir permanentemente">
        <Trash2 className="w-4 h-4" />
      </button>
    </div>

    {recebeAlertas && meusClientes.length > 0 && !verClientes && (
      <div className="flex flex-wrap gap-1 mt-2">
        {meusClientes.map((v) => (
          <span key={v.accountId} className="text-[10px] px-2 py-0.5 rounded-full border border-border text-muted-foreground">
            {v.accountName ?? `#${v.accountId}`}
          </span>
        ))}
      </div>
    )}
    {verClientes && <ClientesAcompanhados userId={p.id} onClose={() => setVerClientes(false)} />}
    {excluir && <DialogExcluir p={p} clientes={meusClientes.length} onClose={() => setExcluir(false)} />}
    </div>
  );
}

/**
 * Exclusão permanente. Mais pesado que desativar de propósito: é irreversível,
 * então exige digitar o email — clique errado não basta.
 */
function DialogExcluir({ p, clientes, onClose }: { p: Person; clientes: number; onClose: () => void }) {
  const utils = trpc.useUtils();
  const [texto, setTexto] = useState("");
  const excluir = trpc.people.excluir.useMutation({
    onSuccess: (r) => {
      utils.people.list.invalidate(); utils.people.vinculos.invalidate();
      toast.success(`${r.nome} foi excluído permanentemente.`);
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });
  const confere = texto.trim().toLowerCase() === (p.email ?? "").toLowerCase();

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-destructive/40 rounded-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 p-4 border-b border-border">
          <AlertTriangle className="w-4 h-4 text-destructive" />
          <p className="text-sm font-semibold flex-1">Excluir usuário permanentemente?</p>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-4 flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Esta ação remove <span className="text-foreground font-medium">{p.name}</span> do sistema e
            <span className="text-foreground font-medium"> não pode ser desfeita</span>. O histórico essencial de
            auditoria e registros antigos será preservado.
          </p>
          {clientes > 0 && (
            <p className="text-xs text-amber-700 bg-amber-500/10 rounded-lg p-2.5">
              Esta pessoa recebe alertas de {clientes} cliente(s). Esses vínculos serão removidos.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            O histórico antigo pode continuar aparecendo como registro histórico, sem acesso ativo do usuário.
          </p>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-muted-foreground">
              Digite <span className="font-mono text-foreground">{p.email}</span> para confirmar
            </label>
            <input value={texto} onChange={(e) => setTexto(e.target.value)} autoFocus
              placeholder={p.email ?? ""}
              className="text-sm border border-border rounded-md px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-destructive" />
          </div>
        </div>

        <div className="flex justify-end gap-2 p-4 border-t border-border">
          <button onClick={onClose} className="text-sm px-4 py-2 rounded-lg border border-border text-muted-foreground hover:text-foreground">Cancelar</button>
          <button
            onClick={() => excluir.mutate({ id: p.id, confirmarEmail: texto.trim() })}
            disabled={!confere || excluir.isPending}
            className="text-sm px-4 py-2 rounded-lg bg-destructive text-white font-medium disabled:opacity-40">
            {excluir.isPending ? "Excluindo…" : "Excluir permanentemente"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PeoplePage() {
  const { user } = useAuth();
  const isAdmin = canManagePeople((user as { role?: string } | null)?.role);
  const list = trpc.people.list.useQuery(undefined, { enabled: isAdmin });
  const [temp, setTemp] = useState<{ email: string; password: string } | null>(null);
  // Inativo some por padrão: quem saiu da empresa não deve poluir a lista de
  // quem está. Mas continua acessível — soft delete, nada é apagado.
  const [verInativos, setVerInativos] = useState(false);
  const todos = list.data ?? [];
  const inativos = todos.filter((p) => !p.active).length;
  const visiveis = verInativos ? todos : todos.filter((p) => p.active);

  return (
    <HubShell>
      <main className="flex-1 overflow-auto p-6 md:p-8">
        <div className="max-w-4xl mx-auto flex flex-col gap-6">
          <header className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-primary/20 text-accent flex items-center justify-center flex-shrink-0">
              <Users className="w-5 h-5" />
            </span>
            <div>
              <h1 className="text-2xl font-bold">Colaboradores</h1>
              <p className="text-sm text-muted-foreground">Gerencie a equipe, roles e acessos.</p>
            </div>
          </header>

          {!isAdmin ? (
            <Card className="py-6"><div className="px-6 text-sm text-muted-foreground">Acesso restrito a administradores.</div></Card>
          ) : (
            <>
              {temp && <TempPasswordBanner email={temp.email} password={temp.password} onClose={() => setTemp(null)} />}
              <AddForm onCreated={(email, password) => setTemp({ email, password })} />

              <Card className="gap-3 py-5">
                <div className="px-5 flex flex-col gap-2">
                  {list.isLoading && <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Carregando…</p>}
                  {inativos > 0 && (
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer self-end">
                      <input type="checkbox" checked={verInativos} onChange={(e) => setVerInativos(e.target.checked)} />
                      Mostrar {inativos} desativado(s)
                    </label>
                  )}
                  {visiveis.map((p) => (
                    <PersonRow key={p.id} p={p as Person} onTempPassword={(email, password) => setTemp({ email, password })} />
                  ))}
                  {todos.length === 0 && <p className="text-sm text-muted-foreground">Nenhum colaborador ainda.</p>}
                </div>
              </Card>
            </>
          )}
        </div>
      </main>
    </HubShell>
  );
}
