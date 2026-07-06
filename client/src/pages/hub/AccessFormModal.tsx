/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  SELVA Spaces — Modal de formulário de Acesso (criar / editar)
 * ─────────────────────────────────────────────────────────────────────────────
 *  Segundo modal, EMPILHADO acima do modal do cliente (z-[60]). Contém só o
 *  formulário (create/edit) — nada de lista, então não há sobreposição possível.
 *  A senha nunca é revelada aqui: no modo edição o campo começa vazio (placeholder
 *  "inalterada") e só é enviada se preenchida. Criptografia/reveal ficam no backend.
 *
 *  Dropdowns custom (Plataforma/Tags/Tipo de código) ficam EM FLUXO dentro do
 *  corpo rolável do modal → nunca são cortados nem ficam atrás do backdrop.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useEffect, useRef, useState } from "react";
import { X, Loader2, ShieldAlert } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";

const PLATFORMS = ["WordPress", "Wix", "Meta", "Google", "Registro.br", "GoDaddy", "Cloudflare", "Supabase", "Railway", "Trello", "Outros"];
const CODE_TYPES = ["E-mail", "SMS", "App autenticador", "WhatsApp", "Outro"];
const TAG_SUGGESTIONS = ["Ads", "Analytics", "Tag Manager", "Search Console", "Instagram", "Business Manager", "Pixel", "Catálogo", "Domínio", "Hospedagem", "Financeiro", "Nota Fiscal", "Banco de imagens", "E-mail", "Admin", "Produção"];

// Dropdowns EM FLUXO (não absolutos): dentro do corpo rolável do modal eles nunca
// são cortados nem ficam atrás do backdrop; empurram os campos abaixo (ok, rola).
const DROPDOWN_CLS = "mt-1 rounded-md border border-border bg-popover shadow-md max-h-[200px] overflow-y-auto py-1";
const OPTION_CLS = "w-full text-left px-3 py-1.5 text-sm text-foreground hover:bg-primary/10 hover:text-accent transition-colors";

export type AccessItem = {
  id: number; platform: string; label: string; loginEmail: string; url: string;
  requiresCode: boolean; codeType: string; notes: string; tags: string[];
};

type FormState = {
  platform: string; label: string; loginEmail: string; password: string;
  url: string; requiresCode: boolean; codeType: string; notes: string; tags: string[];
};

/** Input com dropdown custom de sugestões (permite valor livre). */
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
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); setOpen(false); }
          else if (e.key === "Escape" && open) { setOpen(false); e.stopPropagation(); } // fecha só o dropdown
        }}
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
              else if (e.key === "Escape" && open) { setOpen(false); e.stopPropagation(); } // fecha só o dropdown
              else if (e.key === "Backspace" && !draft && tags.length) onChange(tags.slice(0, -1));
            }}
            placeholder={tags.length ? "" : "Digite e Enter, ou escolha abaixo"}
            className="flex-1 min-w-[140px] bg-transparent outline-none text-sm py-0.5"
          />
        )}
      </div>

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

export function AccessFormModal({
  clientId, item, encryptionReady, onClose,
}: {
  clientId: number; item: AccessItem | null; encryptionReady: boolean; onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const invalidate = () => { utils.access.itemsByClient.invalidate({ clientId }); utils.access.clientsList.invalidate(); };
  const createItem = trpc.access.createItem.useMutation({ onSuccess: () => { invalidate(); onClose(); } });
  const updateItem = trpc.access.updateItem.useMutation({ onSuccess: () => { invalidate(); onClose(); } });

  const isEdit = !!item;
  const [form, setForm] = useState<FormState>(() =>
    item
      ? { platform: item.platform, label: item.label, loginEmail: item.loginEmail, password: "", url: item.url, requiresCode: item.requiresCode, codeType: item.codeType, notes: item.notes, tags: item.tags }
      : { platform: "", label: "", loginEmail: "", password: "", url: "", requiresCode: false, codeType: "", notes: "", tags: [] },
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [askPwd, setAskPwd] = useState(false); // confirmação de troca de senha (edição)

  // ESC fecha ESTE modal (não o do cliente). Dropdowns dão stopPropagation quando
  // consomem o ESC, então aqui só chega quando nenhum dropdown está aberto.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const payload = () => ({
    platform: form.platform, label: form.label || undefined, loginEmail: form.loginEmail || undefined,
    url: form.url || undefined, requiresCode: form.requiresCode, codeType: form.codeType || undefined,
    notes: form.notes || undefined, tags: form.tags,
  });

  const submit = () => {
    setFormError(null);
    if (!form.platform.trim()) return setFormError("Informe a plataforma.");
    if (!isEdit && !form.password) return setFormError("Informe a senha.");
    if (isEdit) {
      if (form.password) { setAskPwd(true); return; } // confirma antes de trocar a senha
      updateItem.mutate({ id: item!.id, ...payload() });
    } else {
      createItem.mutate({ clientId, ...payload(), password: form.password });
    }
  };

  const saving = createItem.isPending || updateItem.isPending;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(3px)" }} onClick={onClose}>
      <div className="w-full max-w-lg max-h-[90vh] flex flex-col rounded-xl border border-border bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between gap-3 px-5 py-4 border-b border-border">
          <h2 className="text-base font-bold">{isEdit ? "Editar acesso" : "Novo acesso"}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="Fechar"><X className="w-5 h-5" /></button>
        </div>

        {/* Corpo (ÚNICO com scroll) */}
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Plataforma *</Label>
              <ComboInput value={form.platform} onChange={(v) => setForm({ ...form, platform: v })} options={PLATFORMS} placeholder="Ex.: Wix" />
            </div>
            <div className="flex flex-col gap-1"><Label className="text-xs">Nome do acesso</Label><Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Opcional" /></div>
            <div className="flex flex-col gap-1"><Label className="text-xs">E-mail / login</Label><Input value={form.loginEmail} onChange={(e) => setForm({ ...form, loginEmail: e.target.value })} /></div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Senha {isEdit && <span className="text-muted-foreground">(deixe vazio p/ manter)</span>}</Label>
              <Input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder={isEdit ? "•••••• (inalterada)" : ""} />
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
          {!encryptionReady && <p className="text-xs text-amber-600 mt-3">Criptografia não configurada — não é possível salvar senhas.</p>}
          {formError && <p className="text-xs text-destructive mt-3">{formError}</p>}
        </div>

        {/* Rodapé fixo com os botões */}
        <div className="flex-shrink-0 flex items-center justify-end gap-3 px-5 py-4 border-t border-border">
          <button onClick={onClose} className="text-sm px-3 py-2 rounded-lg border border-border hover:bg-secondary/60">Cancelar</button>
          <button
            onClick={submit}
            disabled={saving || !encryptionReady}
            className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium px-4 py-2 hover:opacity-90 disabled:opacity-60"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} {isEdit ? "Salvar alterações" : "Salvar acesso"}
          </button>
        </div>
      </div>

      {/* Confirmação de troca de senha (acima deste modal) */}
      {askPwd && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.55)" }} onClick={(e) => { e.stopPropagation(); setAskPwd(false); }}>
          <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-2"><ShieldAlert className="w-5 h-5 text-amber-500" /><p className="text-sm font-semibold">Confirmação</p></div>
            <p className="text-sm text-muted-foreground mb-5">Você está alterando a senha deste acesso. Confirma a alteração?</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setAskPwd(false)} className="text-sm px-3 py-2 rounded-lg border border-border hover:bg-secondary/60">Cancelar</button>
              <button onClick={() => { updateItem.mutate({ id: item!.id, ...payload(), password: form.password }); setAskPwd(false); }} className="text-sm px-3 py-2 rounded-lg bg-destructive text-destructive-foreground hover:opacity-90">Confirmar alteração</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
