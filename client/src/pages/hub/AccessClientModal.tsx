/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  SELVA Spaces — Modal de Acessos de um cliente
 * ─────────────────────────────────────────────────────────────────────────────
 *  Lista os acessos do cliente (SEM senha), com busca interna, filtros por
 *  plataforma/tag, formulário de adicionar/editar e ações por acesso
 *  (revelar/copiar senha — auditadas —, editar, excluir com confirmação).
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  X, Search, Plus, Eye, EyeOff, Copy, Pencil, Trash2, Loader2, Check, ExternalLink, ShieldAlert,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";

const PLATFORMS = ["WordPress", "Wix", "Meta", "Google", "Registro.br", "GoDaddy", "Cloudflare", "Supabase", "Railway", "Trello", "Outros"];
const CODE_TYPES = ["E-mail", "SMS", "App autenticador", "WhatsApp", "Outro"];
const TAG_SUGGESTIONS = ["Ads", "Analytics", "Tag Manager", "Search Console", "Instagram", "Business Manager", "Pixel", "Catálogo", "Domínio", "Hospedagem", "Financeiro", "Nota Fiscal", "Banco de imagens", "E-mail", "Admin", "Produção"];

type Item = {
  id: number; platform: string; label: string; loginEmail: string; url: string;
  requiresCode: boolean; codeType: string; notes: string; tags: string[];
};

type FormState = {
  id?: number; platform: string; label: string; loginEmail: string; password: string;
  url: string; requiresCode: boolean; codeType: string; notes: string; tags: string[];
};

const emptyForm: FormState = { platform: "", label: "", loginEmail: "", password: "", url: "", requiresCode: false, codeType: "", notes: "", tags: [] };

// Estilo compartilhado dos dropdowns custom (Plataforma, Tags, Tipo de código).
// ABSOLUTO (top-full) → flutua por cima do formulário sem alterar a altura da
// caixa nem empurrar/reflow os campos. z alto para ficar acima do form.
const DROPDOWN_CLS = "absolute left-0 right-0 top-full z-30 mt-1 rounded-md border border-border bg-popover shadow-md max-h-[200px] overflow-y-auto py-1";
const OPTION_CLS = "w-full text-left px-3 py-1.5 text-sm text-foreground hover:bg-primary/10 hover:text-accent transition-colors";

/** Input com dropdown custom de sugestões (permite valor livre). Em fluxo, não cobre nada. */
function ComboInput({ value, onChange, options, placeholder }: {
  value: string; onChange: (v: string) => void; options: string[]; placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  const q = value.trim().toLowerCase();
  const filtered = options.filter((o) => !q || o.toLowerCase().includes(q));
  return (
    <div ref={ref} className="relative">
      <Input
        value={value}
        placeholder={placeholder}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); setOpen(false); } else if (e.key === "Escape") setOpen(false); }}
      />
      {open && filtered.length > 0 && (
        <div className={DROPDOWN_CLS}>
          {filtered.map((o) => (
            <button key={o} type="button" onClick={() => { onChange(o); setOpen(false); }} className={OPTION_CLS}>{o}</button>
          ))}
        </div>
      )}
    </div>
  );
}

function TagsInput({ tags, onChange }: { tags: string[]; onChange: (t: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Fecha ao clicar fora.
  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const add = (raw: string) => {
    const clean = raw.replace(/\s+/g, " ").trim().slice(0, 40);
    if (!clean || tags.length >= 10) return;
    if (tags.some((t) => t.toLowerCase() === clean.toLowerCase())) return;
    onChange([...tags, clean]);
  };

  const q = draft.trim().toLowerCase();
  const suggestions = TAG_SUGGESTIONS.filter(
    (s) => !tags.some((t) => t.toLowerCase() === s.toLowerCase()) && (!q || s.toLowerCase().includes(q)),
  );
  const atLimit = tags.length >= 10;

  return (
    <div ref={ref} className="relative">
      {/* Caixa de chips + input */}
      <div
        className="rounded-md border border-border bg-input px-2 py-1.5 flex flex-wrap gap-1.5 items-center cursor-text"
        onClick={() => !atLimit && setOpen(true)}
      >
        {tags.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 rounded bg-primary/15 text-accent text-[11px] px-1.5 py-0.5">
            {t}
            <button type="button" onClick={() => onChange(tags.filter((x) => x !== t))} className="hover:opacity-70"><X className="w-3 h-3" /></button>
          </span>
        ))}
        {!atLimit && (
          <input
            value={draft}
            onChange={(e) => { setDraft(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if ((e.key === "Enter" || e.key === ",") && draft.trim()) { e.preventDefault(); add(draft); setDraft(""); }
              else if (e.key === "Escape") setOpen(false);
              else if (e.key === "Backspace" && !draft && tags.length) onChange(tags.slice(0, -1));
            }}
            placeholder={tags.length ? "" : "Digite e Enter, ou escolha abaixo"}
            className="flex-1 min-w-[140px] bg-transparent outline-none text-sm py-0.5"
          />
        )}
      </div>

      {/* Dropdown customizado (em fluxo — empurra o conteúdo, não cobre nada) */}
      {open && !atLimit && suggestions.length > 0 && (
        <div className={DROPDOWN_CLS}>
          {suggestions.map((s) => (
            <button key={s} type="button" onClick={() => { add(s); setDraft(""); setOpen(false); }} className={OPTION_CLS}>
              {s}
            </button>
          ))}
        </div>
      )}
      {atLimit && <p className="mt-1 text-[10px] text-muted-foreground">Máximo de 10 tags.</p>}
    </div>
  );
}

export function AccessClientModal({
  clientId, clientName, isInternal, encryptionReady, canEdit, onClose,
}: {
  clientId: number; clientName: string; isInternal: boolean; encryptionReady: boolean; canEdit: boolean; onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const itemsQ = trpc.access.itemsByClient.useQuery({ clientId });
  const invalidate = () => { utils.access.itemsByClient.invalidate({ clientId }); utils.access.clientsList.invalidate(); };

  const createItem = trpc.access.createItem.useMutation({ onSuccess: () => { invalidate(); setForm(null); } });
  const updateItem = trpc.access.updateItem.useMutation({ onSuccess: () => { invalidate(); setForm(null); } });
  const deactivateItem = trpc.access.deactivateItem.useMutation({ onSuccess: invalidate });
  const reveal = trpc.access.revealPassword.useMutation();
  const updateClient = trpc.access.updateClient.useMutation({ onSuccess: () => utils.access.clientsList.invalidate() });
  // Soft delete do cliente (admin/dev). Desativa junto os acessos vinculados.
  const deactivateClient = trpc.access.deactivateClient.useMutation({
    onSuccess: () => { utils.access.clientsList.invalidate(); onClose(); },
  });

  const [search, setSearch] = useState("");
  const [platformFilter, setPlatformFilter] = useState<string | null>(null);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [revealed, setRevealed] = useState<Record<number, string>>({});
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [confirm, setConfirm] = useState<{ text: string; label: string; onOk: () => void } | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(clientName);
  const [formError, setFormError] = useState<string | null>(null);

  const items = (itemsQ.data ?? []) as Item[];
  const allPlatforms = useMemo(() => Array.from(new Set(items.map((i) => i.platform).filter(Boolean))), [items]);
  const allTags = useMemo(() => Array.from(new Set(items.flatMap((i) => i.tags))), [items]);

  const q = search.trim().toLowerCase();
  const filtered = items.filter((i) => {
    if (platformFilter && i.platform !== platformFilter) return false;
    if (tagFilter && !i.tags.includes(tagFilter)) return false;
    if (!q) return true;
    // Busca: nome/plataforma/login/URL/notas/tags — nunca a senha.
    const blob = [i.label, i.platform, i.loginEmail, i.url, i.notes, ...i.tags].join(" ").toLowerCase();
    return blob.includes(q);
  });

  const doReveal = async (id: number) => {
    if (revealed[id] != null) { setRevealed((r) => { const n = { ...r }; delete n[id]; return n; }); return; }
    const res = await reveal.mutateAsync({ itemId: id, action: "reveal" });
    setRevealed((r) => ({ ...r, [id]: res.password }));
  };
  const doCopy = async (id: number) => {
    const res = await reveal.mutateAsync({ itemId: id, action: "copy" });
    try { await navigator.clipboard?.writeText(res.password); } catch { /* clipboard indisponível */ }
    setCopiedId(id);
    setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1500);
  };

  const openEdit = (i: Item) => {
    setFormError(null);
    setForm({ id: i.id, platform: i.platform, label: i.label, loginEmail: i.loginEmail, password: "", url: i.url, requiresCode: i.requiresCode, codeType: i.codeType, notes: i.notes, tags: i.tags });
  };

  const submitForm = () => {
    if (!form) return;
    setFormError(null);
    if (!form.platform.trim()) return setFormError("Informe a plataforma.");
    if (!form.id && !form.password) return setFormError("Informe a senha.");
    const payload = {
      platform: form.platform, label: form.label || undefined, loginEmail: form.loginEmail || undefined,
      url: form.url || undefined, requiresCode: form.requiresCode, codeType: form.codeType || undefined,
      notes: form.notes || undefined, tags: form.tags,
    };
    if (form.id) {
      const run = () => updateItem.mutate({ id: form.id!, ...payload, password: form.password || undefined });
      if (form.password) {
        setConfirm({ text: "Você está alterando a senha deste acesso. Confirma a alteração?", label: "Confirmar alteração", onOk: () => { run(); setConfirm(null); } });
      } else run();
    } else {
      createItem.mutate({ clientId, ...payload, password: form.password });
    }
  };

  const askDelete = (i: Item) =>
    setConfirm({
      text: "Tem certeza que deseja excluir este acesso? Esta ação pode afetar a equipe.",
      label: "Excluir acesso",
      onOk: () => { deactivateItem.mutate({ id: i.id }); setConfirm(null); },
    });

  const askDeleteClient = () =>
    setConfirm({
      text: items.length > 0
        ? `Este cliente possui ${items.length} acesso${items.length === 1 ? "" : "s"} cadastrado${items.length === 1 ? "" : "s"}. Ao confirmar, o cliente e seus acessos serão desativados.`
        : "Tem certeza que deseja excluir este cliente? Os acessos vinculados a ele deixarão de aparecer para a equipe.",
      label: "Excluir cliente",
      onOk: () => { deactivateClient.mutate({ id: clientId }); setConfirm(null); },
    });

  const saving = createItem.isPending || updateItem.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(3px)" }} onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-xl border border-border bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
        {/* Header (fixo) */}
        <div className="flex-shrink-0 flex items-center justify-between gap-3 px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2 min-w-0">
            {renaming && !isInternal ? (
              <>
                <Input value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} className="h-8 w-56" autoFocus />
                <button onClick={() => { if (nameDraft.trim()) updateClient.mutate({ id: clientId, name: nameDraft.trim() }); setRenaming(false); }} className="text-xs text-accent">Salvar</button>
              </>
            ) : (
              <>
                <h2 className="text-lg font-bold truncate">{nameDraft}</h2>
                {isInternal && <Badge className="bg-primary/20 text-accent border-0">Interno</Badge>}
                {canEdit && !isInternal && <button onClick={() => setRenaming(true)} className="text-muted-foreground hover:text-foreground" title="Editar cliente"><Pencil className="w-3.5 h-3.5" /></button>}
              </>
            )}
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {/* Excluir/desativar cliente — só admin/dev, nunca o cliente interno. */}
            {canEdit && !isInternal && (
              <button onClick={askDeleteClient} className="p-1 text-muted-foreground hover:text-destructive" title="Excluir cliente" aria-label="Excluir cliente">
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
          </div>
        </div>

        {/* Toolbar (busca + filtros, fixa) */}
        <div className="flex-shrink-0 px-5 py-3 border-b border-border flex flex-col gap-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar acesso, login, URL, tag…" className="pl-9 h-9" />
            </div>
            {canEdit && (
              <button
                onClick={() => { setFormError(null); setForm({ ...emptyForm }); }}
                disabled={!encryptionReady}
                title={encryptionReady ? "" : "Criptografia não configurada"}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium px-3 py-2 hover:opacity-90 disabled:opacity-60 flex-shrink-0"
              >
                <Plus className="w-4 h-4" /> Acesso
              </button>
            )}
          </div>
          {(allPlatforms.length > 0 || allTags.length > 0) && (
            <div className="flex flex-wrap gap-1.5">
              {allPlatforms.map((p) => (
                <button key={p} onClick={() => setPlatformFilter(platformFilter === p ? null : p)}
                  className={`text-[11px] rounded-full px-2 py-0.5 border ${platformFilter === p ? "bg-accent text-accent-foreground border-accent" : "border-border text-muted-foreground hover:text-foreground"}`}>{p}</button>
              ))}
              {allTags.map((t) => (
                <button key={t} onClick={() => setTagFilter(tagFilter === t ? null : t)}
                  className={`text-[11px] rounded-full px-2 py-0.5 border ${tagFilter === t ? "bg-primary/20 text-accent border-accent/40" : "border-dashed border-border text-muted-foreground hover:text-foreground"}`}>#{t}</button>
              ))}
              {(platformFilter || tagFilter) && (
                <button onClick={() => { setPlatformFilter(null); setTagFilter(null); }} className="text-[11px] text-muted-foreground underline">limpar</button>
              )}
            </div>
          )}
        </div>

        {/* Body — ÚNICO elemento com scroll (min-h-0 garante que o overflow
            funcione dentro do flex; sem isso o conteúdo vaza do modal). */}
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 flex flex-col gap-3">
          {/* Formulário add/edit — caixa própria em fluxo normal: empurra a lista
              para baixo (mb-6) e nunca a sobrepõe. z-10 mantém seus dropdowns
              acima dos cards de acesso. */}
          {form && (
            <div className="relative z-10 w-full rounded-lg border border-accent/40 bg-primary/[0.05] p-5 flex flex-col gap-4 mb-6 shadow-sm">
              <p className="text-sm font-semibold">{form.id ? "Editar acesso" : "Novo acesso"}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <Label className="text-xs">Plataforma *</Label>
                  <ComboInput value={form.platform} onChange={(v) => setForm({ ...form, platform: v })} options={PLATFORMS} placeholder="Ex.: Wix" />
                </div>
                <div className="flex flex-col gap-1"><Label className="text-xs">Nome do acesso</Label><Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Opcional" /></div>
                <div className="flex flex-col gap-1"><Label className="text-xs">E-mail / login</Label><Input value={form.loginEmail} onChange={(e) => setForm({ ...form, loginEmail: e.target.value })} /></div>
                <div className="flex flex-col gap-1">
                  <Label className="text-xs">Senha {form.id && <span className="text-muted-foreground">(deixe vazio p/ manter)</span>}</Label>
                  <Input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder={form.id ? "•••••• (inalterada)" : ""} />
                </div>
                <div className="flex flex-col gap-1 sm:col-span-2"><Label className="text-xs">Link / URL</Label><Input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://…" /></div>
                <div className="flex items-center gap-2 pt-1">
                  <Checkbox checked={form.requiresCode} onCheckedChange={(v) => setForm({ ...form, requiresCode: !!v })} id="reqcode" />
                  <Label htmlFor="reqcode" className="text-xs cursor-pointer">Requer código (2FA)</Label>
                </div>
                {form.requiresCode && (
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs">Tipo de código</Label>
                    <ComboInput value={form.codeType} onChange={(v) => setForm({ ...form, codeType: v })} options={CODE_TYPES} placeholder="Selecione ou digite" />
                  </div>
                )}
                <div className="flex flex-col gap-1 sm:col-span-2"><Label className="text-xs">Tags</Label><TagsInput tags={form.tags} onChange={(t) => setForm({ ...form, tags: t })} /></div>
                <div className="flex flex-col gap-1 sm:col-span-2"><Label className="text-xs">Observações</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} /></div>
              </div>
              {formError && <p className="text-xs text-destructive">{formError}</p>}
              <div className="flex items-center gap-3">
                <button onClick={submitForm} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium px-4 py-2 hover:opacity-90 disabled:opacity-60">
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />} Salvar
                </button>
                <button onClick={() => setForm(null)} className="text-sm text-muted-foreground hover:text-foreground">Cancelar</button>
              </div>
            </div>
          )}

          {/* Lista de acessos */}
          {itemsQ.isLoading && <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Carregando…</p>}
          {!itemsQ.isLoading && filtered.length === 0 && <p className="text-sm text-muted-foreground">Nenhum acesso {items.length ? "com esse filtro" : "cadastrado"}.</p>}
          {filtered.map((i) => (
            <div key={i.id} className="rounded-lg border border-border p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold">{i.label || i.platform}</span>
                    <Badge variant="secondary" className="text-[10px] font-normal">{i.platform}</Badge>
                    {i.requiresCode && <Badge className="text-[10px] font-normal bg-amber-500/15 text-amber-600 border-amber-500/30">2FA{i.codeType ? `: ${i.codeType}` : ""}</Badge>}
                  </div>
                  {i.loginEmail && <p className="text-xs text-muted-foreground mt-0.5">{i.loginEmail}</p>}
                  {i.url && <a href={i.url} target="_blank" rel="noreferrer" className="text-xs text-accent inline-flex items-center gap-1 mt-0.5 hover:underline"><ExternalLink className="w-3 h-3" /> {i.url.replace(/^https?:\/\//, "").slice(0, 40)}</a>}
                  {i.notes && <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{i.notes}</p>}
                  {i.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {i.tags.slice(0, 4).map((t) => <span key={t} className="text-[10px] rounded bg-primary/10 text-accent px-1.5 py-0.5">{t}</span>)}
                      {i.tags.length > 4 && <span className="text-[10px] text-muted-foreground px-1">+{i.tags.length - 4}</span>}
                    </div>
                  )}
                  {revealed[i.id] != null && (
                    <p className="mt-2 font-mono text-sm rounded bg-secondary/60 px-2 py-1 inline-block break-all">{revealed[i.id]}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => doReveal(i.id)} disabled={!encryptionReady} className="p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-40" title="Revelar senha">
                    {revealed[i.id] != null ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                  <button onClick={() => doCopy(i.id)} disabled={!encryptionReady} className="p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-40" title="Copiar senha">
                    {copiedId === i.id ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                  </button>
                  {canEdit && <button onClick={() => openEdit(i)} className="p-1.5 text-muted-foreground hover:text-foreground" title="Editar"><Pencil className="w-4 h-4" /></button>}
                  {canEdit && <button onClick={() => askDelete(i)} className="p-1.5 text-muted-foreground hover:text-destructive" title="Excluir"><Trash2 className="w-4 h-4" /></button>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Confirmação (exclusão / troca de senha) */}
      {confirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.55)" }} onClick={(e) => { e.stopPropagation(); setConfirm(null); }}>
          <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-2"><ShieldAlert className="w-5 h-5 text-amber-500" /><p className="text-sm font-semibold">Confirmação</p></div>
            <p className="text-sm text-muted-foreground mb-5">{confirm.text}</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirm(null)} className="text-sm px-3 py-2 rounded-lg border border-border hover:bg-secondary/60">Cancelar</button>
              <button onClick={confirm.onOk} className="text-sm px-3 py-2 rounded-lg bg-destructive text-destructive-foreground hover:opacity-90">{confirm.label}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
