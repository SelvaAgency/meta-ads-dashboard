/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  SELVA Spaces — Configurações / Perfil
 * ─────────────────────────────────────────────────────────────────────────────
 *  Perfil do usuário (com upload de avatar), Integrações e — para admin/
 *  developer — gestão de News e SelvaTV. Tudo persistido no backend (nada de
 *  localStorage). Uploads vão para o storage S3-compatible.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useEffect, useRef, useState } from "react";
import {
  User as UserIcon,
  ShieldCheck,
  Newspaper,
  Bell,
  Image as ImageIcon,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Loader2,
  Plug,
  Calendar,
  Trello,
  Camera,
  SplitSquareHorizontal,
} from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { HubShell } from "./HubShell";
import { VocePrefereSlide } from "./VocePrefereSlide";
import { canManageContent, canAccessAdmin, ROLE_LABELS, type Role } from "@shared/permissions";
import { NotifPrefsSection, ResumoDiarioSection } from "@/components/NotificacoesPrefs";

function SectionCard({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof UserIcon;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="gap-5 py-6">
      <div className="px-6 flex items-start gap-3">
        <span className="w-9 h-9 rounded-lg bg-primary/20 text-accent flex items-center justify-center flex-shrink-0">
          <Icon className="w-4 h-4" />
        </span>
        <div>
          <h2 className="text-sm font-semibold leading-tight">{title}</h2>
          {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
        </div>
      </div>
      <div className="px-6">{children}</div>
    </Card>
  );
}

// ── reorder helper: novos ids após mover um item ──────────────────────────────
function reordered(ids: number[], index: number, dir: -1 | 1): number[] {
  const next = [...ids];
  const t = index + dir;
  if (t < 0 || t >= next.length) return next;
  [next[index], next[t]] = [next[t], next[index]];
  return next;
}

// ─── Perfil (com upload de avatar) ────────────────────────────────────────────
function ProfileSection() {
  const { user, refresh } = useAuth();
  const u = user as {
    name?: string; email?: string; role?: string; jobTitle?: string | null;
    birthdayDay?: number | null; birthdayMonth?: number | null; avatarUrl?: string;
  } | null;
  const utils = trpc.useUtils();
  const fileRef = useRef<HTMLInputElement>(null);
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    jobTitle: u?.jobTitle ?? "",
    day: u?.birthdayDay?.toString() ?? "",
    month: u?.birthdayMonth?.toString() ?? "",
  });

  const name = u?.name ?? "";
  const email = u?.email ?? "";
  const role = u?.role ?? "user";
  const initial = (name?.[0] ?? "U").toUpperCase();

  const mutation = trpc.auth.updateOwnProfile.useMutation({
    onSuccess: async () => {
      await utils.auth.me.invalidate();
      await refresh();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  const save = () =>
    mutation.mutate({
      jobTitle: draft.jobTitle.trim() || null,
      birthdayDay: draft.day ? Number(draft.day) : null,
      birthdayMonth: draft.month ? Number(draft.month) : null,
    });

  const onPickFile = async (file: File) => {
    setUploadError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const resp = await fetch("/api/uploads/avatar", { method: "POST", body: fd, credentials: "include" });
      if (!resp.ok) {
        const j = await resp.json().catch(() => ({}));
        throw new Error(j.error ?? "Falha no upload.");
      }
      await utils.auth.me.invalidate();
      await refresh();
    } catch (e: any) {
      setUploadError(e?.message ?? "Falha no upload.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <SectionCard icon={UserIcon} title="Perfil" description="Seus dados dentro do SELVA Spaces.">
      {/* Foto de perfil (upload real; fallback por iniciais) */}
      <div className="flex items-center gap-4 mb-5">
        <div className="w-16 h-16 rounded-full overflow-hidden flex items-center justify-center text-xl font-bold flex-shrink-0"
          style={{ background: "rgba(212,83,126,0.18)", color: "#D4537E" }}>
          {u?.avatarUrl ? <img src={u.avatarUrl} alt="" className="w-full h-full object-cover" /> : initial}
        </div>
        <div className="text-xs">
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onPickFile(f); e.target.value = ""; }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-secondary/60 disabled:opacity-60"
          >
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
            {uploading ? "Enviando…" : "Alterar foto"}
          </button>
          <p className="text-muted-foreground mt-1">JPG, PNG ou WEBP · até 5 MB</p>
          {uploadError && <p className="text-destructive mt-1">{uploadError}</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Nome</Label>
          <Input value={name} readOnly disabled />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">E-mail</Label>
          <Input value={email} readOnly disabled />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Cargo / função</Label>
          <Input value={draft.jobTitle} placeholder="Ex.: Gestor de Tráfego" onChange={(e) => setDraft({ ...draft, jobTitle: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Aniversário — dia</Label>
            <Input type="number" min={1} max={31} value={draft.day} onChange={(e) => setDraft({ ...draft, day: e.target.value })} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Mês</Label>
            <Input type="number" min={1} max={12} value={draft.month} onChange={(e) => setDraft({ ...draft, month: e.target.value })} />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Permissão</Label>
          <div><Badge variant={role === "admin" ? "default" : "secondary"}>{ROLE_LABELS[role as Role] ?? role}</Badge></div>
        </div>
      </div>

      <div className="mt-5">
        <button
          onClick={save}
          disabled={mutation.isPending}
          className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium px-4 py-2 hover:opacity-90 disabled:opacity-60"
        >
          {saved ? "Salvo" : "Salvar perfil"}
        </button>
      </div>
    </SectionCard>
  );
}

// ─── Admin: News (backend) ────────────────────────────────────────────────────
function NewsRow({ item, index, ids }: { item: { id: number; text: string; active: boolean }; index: number; ids: number[] }) {
  const utils = trpc.useUtils();
  const invalidate = () => utils.news.adminList.invalidate();
  const update = trpc.news.update.useMutation({ onSuccess: invalidate });
  const del = trpc.news.delete.useMutation({ onSuccess: invalidate });
  const reorder = trpc.news.reorder.useMutation({ onSuccess: invalidate });
  const [text, setText] = useState(item.text);

  return (
    <div className="flex items-center gap-2 rounded-lg border border-border p-2">
      <div className="flex flex-col">
        <button className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30" disabled={index === 0}
          onClick={() => reorder.mutate({ orderedIds: reordered(ids, index, -1) })} aria-label="Subir"><ChevronUp className="w-3.5 h-3.5" /></button>
        <button className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30" disabled={index === ids.length - 1}
          onClick={() => reorder.mutate({ orderedIds: reordered(ids, index, 1) })} aria-label="Descer"><ChevronDown className="w-3.5 h-3.5" /></button>
      </div>
      <Input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => { if (text.trim() && text !== item.text) update.mutate({ id: item.id, text: text.trim() }); }}
        className="flex-1"
      />
      <Switch checked={item.active} onCheckedChange={(v) => update.mutate({ id: item.id, active: v })} />
      <button className="p-1.5 text-muted-foreground hover:text-destructive" onClick={() => del.mutate({ id: item.id })} aria-label="Remover"><Trash2 className="w-4 h-4" /></button>
    </div>
  );
}

function NewsAdminSection() {
  const utils = trpc.useUtils();
  const list = trpc.news.adminList.useQuery();
  const create = trpc.news.create.useMutation({ onSuccess: () => utils.news.adminList.invalidate() });
  const [text, setText] = useState("");
  const ids = (list.data ?? []).map((n) => n.id);

  return (
    <SectionCard icon={Newspaper} title="Jornalzinho" description="Mensagens que passam na faixa da Home (visíveis a todos).">
      <div className="flex items-center gap-2 mb-3">
        <Input value={text} placeholder="Nova notícia" onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && text.trim()) { create.mutate({ text: text.trim() }); setText(""); } }} />
        <button
          onClick={() => { if (text.trim()) { create.mutate({ text: text.trim() }); setText(""); } }}
          disabled={create.isPending || !text.trim()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium px-3 py-2 hover:opacity-90 disabled:opacity-60"
        >
          <Plus className="w-4 h-4" /> Adicionar
        </button>
      </div>
      <div className="flex flex-col gap-2">
        {list.isLoading && <p className="text-xs text-muted-foreground">Carregando…</p>}
        {list.data?.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma notícia cadastrada.</p>}
        {list.data?.map((n, i) => (
          <NewsRow key={n.id} item={n} index={i} ids={ids} />
        ))}
      </div>
    </SectionCard>
  );
}

// ─── Admin: SelvaTV (backend + storage) ───────────────────────────────────────
function TVRow({ item, index, ids }: { item: { id: number; title: string; active: boolean; imageUrl: string }; index: number; ids: number[] }) {
  const utils = trpc.useUtils();
  const invalidate = () => utils.selvaTV.adminList.invalidate();
  const update = trpc.selvaTV.update.useMutation({ onSuccess: invalidate });
  const del = trpc.selvaTV.delete.useMutation({ onSuccess: invalidate });
  const reorder = trpc.selvaTV.reorder.useMutation({ onSuccess: invalidate });
  const [title, setTitle] = useState(item.title);

  return (
    <div className="flex items-center gap-2 rounded-lg border border-border p-2">
      <div className="flex flex-col">
        <button className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30" disabled={index === 0}
          onClick={() => reorder.mutate({ orderedIds: reordered(ids, index, -1) })} aria-label="Subir"><ChevronUp className="w-3.5 h-3.5" /></button>
        <button className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30" disabled={index === ids.length - 1}
          onClick={() => reorder.mutate({ orderedIds: reordered(ids, index, 1) })} aria-label="Descer"><ChevronDown className="w-3.5 h-3.5" /></button>
      </div>
      <img src={item.imageUrl} alt="" className="w-14 h-9 object-cover rounded border border-border flex-shrink-0" />
      <Input value={title} placeholder="Título (opcional)" onChange={(e) => setTitle(e.target.value)}
        onBlur={() => { if (title !== item.title) update.mutate({ id: item.id, title: title.trim() || null }); }} className="flex-1" />
      <Switch checked={item.active} onCheckedChange={(v) => update.mutate({ id: item.id, active: v })} />
      <button className="p-1.5 text-muted-foreground hover:text-destructive" onClick={() => del.mutate({ id: item.id })} aria-label="Remover"><Trash2 className="w-4 h-4" /></button>
    </div>
  );
}

function SelvaTVAdminSection({ storageConfigured }: { storageConfigured: boolean }) {
  const utils = trpc.useUtils();
  const list = trpc.selvaTV.adminList.useQuery();
  const create = trpc.selvaTV.create.useMutation({ onSuccess: () => utils.selvaTV.adminList.invalidate() });
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ids = (list.data ?? []).map((i) => i.id);

  const onPickFile = async (file: File) => {
    setError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const resp = await fetch("/api/uploads/selvatv", { method: "POST", body: fd, credentials: "include" });
      if (!resp.ok) {
        const j = await resp.json().catch(() => ({}));
        throw new Error(j.error ?? "Falha no upload.");
      }
      const { imageKey } = await resp.json();
      await create.mutateAsync({ imageKey });
    } catch (e: any) {
      setError(e?.message ?? "Falha no upload.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <SectionCard icon={ImageIcon} title="SELVA TV" description="Imagens do banner da Home (0 esconde · 1 estático · 2+ carrossel).">
      {!storageConfigured && (
        <p className="mb-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-700">
          Upload indisponível: storage não configurado.
        </p>
      )}
      <div className="mb-3">
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onPickFile(f); e.target.value = ""; }} />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={!storageConfigured || uploading}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium px-3 py-2 hover:opacity-90 disabled:opacity-60"
        >
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          {uploading ? "Enviando…" : "Adicionar imagem"}
        </button>
        {/* Orientação discreta de formato (não bloqueia upload). */}
        <p className="text-[11px] text-muted-foreground mt-2">
          Dimensão recomendada: 1600 × 600 px (proporção 8:3) · JPG, PNG, WEBP ou GIF · até 5 MB
        </p>
        <p className="text-[11px] text-muted-foreground">
          Nessa proporção a imagem aparece inteira. Em outras proporções, mantenha o conteúdo importante no centro.
        </p>
        {error && <p className="text-xs text-destructive mt-1">{error}</p>}
      </div>
      <div className="flex flex-col gap-2">
        {list.isLoading && <p className="text-xs text-muted-foreground">Carregando…</p>}
        {list.data?.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma imagem. A seção SelvaTV fica oculta na Home.</p>}
        {list.data?.map((im, i) => (
          <TVRow key={im.id} item={im} index={i} ids={ids} />
        ))}
      </div>
    </SectionCard>
  );
}

// ─── Integrações (Google Calendar + Trello) ──────────────────────────────────
const GOOGLE_CONNECT_URL = "/api/integrations/google/start";
const TRELLO_CONNECT_URL = "/api/integrations/trello/start";

function IntegrationRow({
  icon: Icon, name, connectUrl, loading, available, connected, identity, onDisconnect, disconnecting,
}: {
  icon: typeof Calendar; name: string; connectUrl: string; loading: boolean; available: boolean;
  connected: boolean; identity?: string; onDisconnect: () => void; disconnecting: boolean;
}) {
  return (
    <div className="rounded-lg border border-border p-4 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <span className="w-9 h-9 rounded-lg bg-primary/15 text-accent flex items-center justify-center flex-shrink-0">
          <Icon className="w-4 h-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium">{name}</p>
          <p className="text-xs text-muted-foreground truncate">
            {loading ? "Verificando…" : !available ? "Indisponível (não configurado no servidor)"
              : connected ? `Conectado${identity ? ` · ${identity}` : ""}` : "Não conectado"}
          </p>
        </div>
      </div>
      <div className="flex-shrink-0">
        {loading ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          : !available ? null
          : connected ? (
            <button onClick={onDisconnect} disabled={disconnecting} className="text-xs font-medium text-muted-foreground hover:text-destructive disabled:opacity-60">
              {disconnecting ? "Desconectando…" : "Desconectar"}
            </button>
          ) : (
            <a href={connectUrl} className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium px-3 py-1.5 hover:opacity-90">
              <Plug className="w-3.5 h-3.5" /> Conectar
            </a>
          )}
      </div>
    </div>
  );
}

function IntegrationsSection() {
  const utils = trpc.useUtils();
  const gcal = trpc.integrations.googleCalendar.status.useQuery(undefined, { retry: false });
  const gcalDisconnect = trpc.integrations.googleCalendar.disconnect.useMutation({ onSuccess: () => utils.integrations.googleCalendar.status.invalidate() });
  const trello = trpc.integrations.trello.status.useQuery(undefined, { retry: false });
  const trelloDisconnect = trpc.integrations.trello.disconnect.useMutation({ onSuccess: () => utils.integrations.trello.status.invalidate() });

  const params = new URLSearchParams(window.location.search);
  const calResult = params.get("calendar");
  const trelloResult = params.get("trello");

  return (
    <SectionCard icon={Plug} title="Integrações" description="Conecte suas contas para trazer dados reais à Home.">
      {calResult === "connected" && <p className="mb-3 text-xs text-emerald-600">Google Calendar conectado com sucesso.</p>}
      {calResult === "error" && <p className="mb-3 text-xs text-destructive">Não foi possível conectar o Google Calendar. Tente novamente.</p>}
      {trelloResult === "connected" && <p className="mb-3 text-xs text-emerald-600">Trello conectado com sucesso.</p>}
      {trelloResult === "error" && <p className="mb-3 text-xs text-destructive">Não foi possível conectar o Trello. Tente novamente.</p>}

      <div className="flex flex-col gap-3">
        <IntegrationRow icon={Calendar} name="Google Calendar" connectUrl={GOOGLE_CONNECT_URL}
          loading={gcal.isLoading} available={gcal.data?.available ?? false} connected={gcal.data?.connected ?? false}
          identity={gcal.data?.email ?? undefined} onDisconnect={() => gcalDisconnect.mutate()} disconnecting={gcalDisconnect.isPending} />
        <IntegrationRow icon={Trello} name="Trello" connectUrl={TRELLO_CONNECT_URL}
          loading={trello.isLoading} available={trello.data?.available ?? false} connected={trello.data?.connected ?? false}
          identity={trello.data?.username ?? undefined} onDisconnect={() => trelloDisconnect.mutate()} disconnecting={trelloDisconnect.isPending} />
      </div>
    </SectionCard>
  );
}

// ─── Admin: slide "Você prefere?" (SELVA TV) ─────────────────────────────────
function VocePrefereAdminSection() {
  const utils = trpc.useUtils();
  const cfgQ = trpc.selvaTV.vocePrefereGet.useQuery();
  const votesQ = trpc.selvaTV.vocePrefereVotes.useQuery();
  const [form, setForm] = useState<{ active: boolean; leftText: string; rightText: string } | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => { if (cfgQ.data && !form) setForm(cfgQ.data); }, [cfgQ.data, form]);
  const update = trpc.selvaTV.vocePrefereUpdate.useMutation({
    onSuccess: () => {
      utils.selvaTV.vocePrefereGet.invalidate();
      utils.selvaTV.vocePrefereVotes.invalidate(); // votos podem ter sido resetados
      setSaved(true); setTimeout(() => setSaved(false), 1500);
    },
  });

  return (
    <SectionCard icon={SplitSquareHorizontal} title='Slide "Você prefere?"' description="Slide nativo da SELVA TV — entra no carrossel quando ativo.">
      {!form ? (
        <p className="text-xs text-muted-foreground">Carregando…</p>
      ) : (
        <>
          <div className="flex items-center gap-2 mb-4">
            <Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} id="vp-active" />
            <Label htmlFor="vp-active" className="text-sm cursor-pointer">Ativo no carrossel</Label>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5"><Label className="text-xs">Opção esquerda (rosa)</Label><Input value={form.leftText} onChange={(e) => setForm({ ...form, leftText: e.target.value })} /></div>
            <div className="flex flex-col gap-1.5"><Label className="text-xs">Opção direita (azul)</Label><Input value={form.rightText} onChange={(e) => setForm({ ...form, rightText: e.target.value })} /></div>
          </div>

          {/* Contagem de votos (secundário) */}
          <p className="mt-4 text-xs text-muted-foreground">
            Votos — esquerda: <strong className="text-foreground">{votesQ.data?.left.count ?? 0}</strong> · direita:{" "}
            <strong className="text-foreground">{votesQ.data?.right.count ?? 0}</strong>
          </p>

          {/* Mini preview (não interativo) */}
          <div className="mt-3">
            <p className="text-[11px] text-muted-foreground mb-1.5">Prévia</p>
            <div className="rounded-lg overflow-hidden border border-border aspect-[8/3] max-w-md">
              <VocePrefereSlide leftText={form.leftText || "Opção esquerda"} rightText={form.rightText || "Opção direita"} preview />
            </div>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={() => update.mutate(form)}
              disabled={update.isPending}
              className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium px-4 py-2 hover:opacity-90 disabled:opacity-60"
            >
              {update.isPending && <Loader2 className="w-4 h-4 animate-spin" />} {saved ? "Salvo" : "Salvar"}
            </button>
          </div>
        </>
      )}
    </SectionCard>
  );
}

// ─── Admin: slides fixos institucionais da SELVA TV (ligar/desligar) ─────────
function FixedSlidesAdminSection() {
  const utils = trpc.useUtils();
  const cfgQ = trpc.selvaTV.fixedSlidesGet.useQuery();
  const update = trpc.selvaTV.fixedSlidesUpdate.useMutation({
    onSuccess: () => utils.selvaTV.fixedSlidesGet.invalidate(),
  });
  const cfg = cfgQ.data;
  const save = (patch: { gravity?: boolean; dvd?: boolean }) => {
    if (!cfg) return;
    update.mutate({ gravity: cfg.gravity, dvd: cfg.dvd, ...patch });
  };

  return (
    <SectionCard icon={ImageIcon} title="Slides fixos da SELVA TV" description="Liga/desliga os slides institucionais no carrossel. Desligados continuam no código, só não aparecem.">
      {!cfg ? (
        <p className="text-xs text-muted-foreground">Carregando…</p>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Slide institucional (piscina)</p>
              <p className="text-xs text-muted-foreground">Campo gravitacional com a logo SELVA.SPACES.</p>
            </div>
            <Switch checked={cfg.gravity} onCheckedChange={(v) => save({ gravity: v })} disabled={update.isPending} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Slide SELVA Spaces (DVD)</p>
              <p className="text-xs text-muted-foreground">Protetor de tela com os atalhos do Spaces.</p>
            </div>
            <Switch checked={cfg.dvd} onCheckedChange={(v) => save({ dvd: v })} disabled={update.isPending} />
          </div>
          <p className="text-[11px] text-muted-foreground">Com ambos desligados, a SELVA TV mostra só os uploads e o “Você prefere?”.</p>
        </div>
      )}
    </SectionCard>
  );
}

export default function HubSettings() {
  const { user } = useAuth();
  const canContent = canManageContent((user as { role?: string } | null)?.role);
  const isAdmin = canAccessAdmin((user as { role?: string } | null)?.role);
  const storage = trpc.storage.status.useQuery(undefined, { enabled: canContent, retry: false });

  return (
    <HubShell>
      <main className="flex-1 overflow-auto p-6 md:p-8">
        <div className="max-w-3xl mx-auto flex flex-col gap-6">
          <header className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-primary/20 text-accent flex items-center justify-center flex-shrink-0">
              <UserIcon className="w-5 h-5" />
            </span>
            <div>
              <h1 className="text-2xl font-bold">Configurações</h1>
              <p className="text-sm text-muted-foreground">Perfil{canContent ? " e conteúdo" : ""}</p>
            </div>
          </header>

          <ProfileSection />

          {/* Notificações — moradia certa: é da vida da pessoa no Spaces, não
              de uma conta de mídia. Veio do Settings do Tracker (D1.4). */}
          <SectionCard icon={Bell} title="Notificações" description="O que você recebe e por onde. Avisos institucionais (aniversário, comunicado) são sempre ativos.">
            <NotifPrefsSection />
            {/* Resumo diário: a rotina de envio é global, e o backend a trava em
                adminProcedure. Só mostro para admin — senão o developer veria um
                controle que o servidor recusaria. */}
            {isAdmin && (
              <>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mt-2 mb-2">Resumo diário</p>
                <ResumoDiarioSection />
              </>
            )}
          </SectionCard>

          <IntegrationsSection />

          {canContent && (
            <>
              <div className="flex items-center gap-2 pt-2">
                <ShieldCheck className="w-4 h-4 text-accent" />
                <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Conteúdo</span>
              </div>
              <NewsAdminSection />
              <SelvaTVAdminSection storageConfigured={storage.data?.configured ?? false} />
              <VocePrefereAdminSection />
              <FixedSlidesAdminSection />
            </>
          )}
        </div>
      </main>
    </HubShell>
  );
}
