/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  SELVA Spaces — Modal de Acessos de um cliente (lista)
 * ─────────────────────────────────────────────────────────────────────────────
 *  Lista os acessos do cliente (SEM senha), com busca interna, filtros por
 *  plataforma/tag e ações por acesso (revelar/copiar senha — auditadas —, editar,
 *  excluir com confirmação). O formulário de criar/editar acesso NÃO vive aqui:
 *  ele abre em um segundo modal (AccessFormModal) por cima, então a lista nunca é
 *  sobreposta por formulário.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useMemo, useState } from "react";
import {
  X, Search, Plus, Eye, EyeOff, Copy, Pencil, Trash2, Check, ExternalLink, ShieldAlert, Loader2,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AccessFormModal, type AccessItem } from "./AccessFormModal";

export function AccessClientModal({
  clientId, clientName, isInternal, encryptionReady, canEdit, onClose,
}: {
  clientId: number; clientName: string; isInternal: boolean; encryptionReady: boolean; canEdit: boolean; onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const itemsQ = trpc.access.itemsByClient.useQuery({ clientId });
  const invalidate = () => { utils.access.itemsByClient.invalidate({ clientId }); utils.access.clientsList.invalidate(); };

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
  const [revealed, setRevealed] = useState<Record<number, string>>({});
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [confirm, setConfirm] = useState<{ text: string; label: string; onOk: () => void } | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(clientName);
  // Formulário criar/editar em um SEGUNDO modal. null = fechado; { item:null } =
  // criar; { item } = editar.
  const [formOpen, setFormOpen] = useState<{ item: AccessItem | null } | null>(null);

  const items = (itemsQ.data ?? []) as AccessItem[];
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

  const askDelete = (i: AccessItem) =>
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

        {/* Toolbar (busca + filtros + "+ Acesso", fixa) */}
        <div className="flex-shrink-0 px-5 py-3 border-b border-border flex flex-col gap-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar acesso, login, URL, tag…" className="pl-9 h-9" />
            </div>
            {canEdit && (
              <button
                onClick={() => setFormOpen({ item: null })}
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

        {/* Lista de acessos (corpo rolável — sem formulário embutido) */}
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 flex flex-col gap-3">
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
                  {canEdit && <button onClick={() => setFormOpen({ item: i })} className="p-1.5 text-muted-foreground hover:text-foreground" title="Editar"><Pencil className="w-4 h-4" /></button>}
                  {canEdit && <button onClick={() => askDelete(i)} className="p-1.5 text-muted-foreground hover:text-destructive" title="Excluir"><Trash2 className="w-4 h-4" /></button>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Segundo modal: formulário de criar/editar acesso (por cima da lista) */}
      {formOpen && (
        <AccessFormModal
          clientId={clientId}
          item={formOpen.item}
          encryptionReady={encryptionReady}
          onClose={() => setFormOpen(null)}
        />
      )}

      {/* Confirmação (exclusão de acesso / de cliente) */}
      {confirm && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.55)" }} onClick={(e) => { e.stopPropagation(); setConfirm(null); }}>
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
