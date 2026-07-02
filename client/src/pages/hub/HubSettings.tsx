/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Selva Spaces — Configurações / Perfil
 * ─────────────────────────────────────────────────────────────────────────────
 *  Área de perfil do usuário + administração de News e SelvaTV (só admin).
 *
 *  Persistência: enquanto não há backend para perfil/news/SelvaTV, os dados
 *  ficam num store local isolado (hubStore) — fase intermediária, com
 *  TODO(backend) claro. Campos que vêm da autenticação (e-mail, role) são
 *  somente leitura. Usuário comum NÃO pode alterar a própria role.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useState } from "react";
import { nanoid } from "nanoid";
import {
  User as UserIcon,
  ShieldCheck,
  Newspaper,
  Image as ImageIcon,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Check,
} from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { HubShell } from "./HubShell";
import {
  useProfilePrefs,
  useNewsStore,
  useSelvaTVStore,
  type StoredNews,
  type StoredTVImage,
} from "./hubStore";

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

// ─── Perfil ──────────────────────────────────────────────────────────────────
function ProfileSection() {
  const { user } = useAuth();
  const [prefs, setPrefs] = useProfilePrefs();
  const [draft, setDraft] = useState(prefs);
  const [saved, setSaved] = useState(false);

  const name = (user as any)?.name ?? "";
  const email = (user as any)?.email ?? "";
  const role = (user as any)?.role ?? "user";
  const initial = (name?.[0] ?? "U").toUpperCase();

  const save = () => {
    setPrefs(draft);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <SectionCard icon={UserIcon} title="Perfil" description="Seus dados dentro do Selva Spaces.">
      {/* Foto de perfil — por iniciais. Upload real depende de storage. */}
      <div className="flex items-center gap-4 mb-5">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold flex-shrink-0"
          style={{ background: "rgba(212,83,126,0.18)", color: "#D4537E" }}
        >
          {initial}
        </div>
        <div className="text-xs text-muted-foreground">
          <p className="font-medium text-foreground">Foto de perfil</p>
          {/* TODO(storage): habilitar upload de foto quando houver bucket/endpoint
              seguro (S3/volume). Até lá, avatar por iniciais. */}
          <p className="mt-0.5">O envio de foto será ativado quando o storage estiver configurado.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Nome — vem da autenticação (somente leitura) */}
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Nome</Label>
          <Input value={name} readOnly disabled />
        </div>
        {/* E-mail — somente leitura */}
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">E-mail</Label>
          <Input value={email} readOnly disabled />
        </div>
        {/* Cargo/função — editável; ainda não persistido no backend */}
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Cargo / função</Label>
          <Input
            value={draft.jobTitle ?? ""}
            placeholder="Ex.: Gestor de Tráfego"
            onChange={(e) => setDraft({ ...draft, jobTitle: e.target.value })}
          />
        </div>
        {/* Aniversário — dia/mês (usado no aviso da news bar) */}
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Aniversário (dia/mês)</Label>
          <Input
            type="date"
            value={draft.birthDate ? `2000-${draft.birthDate}` : ""}
            onChange={(e) => {
              const v = e.target.value; // YYYY-MM-DD
              setDraft({ ...draft, birthDate: v ? v.slice(5) : undefined }); // guarda só MM-DD
            }}
          />
        </div>
        {/* Role — somente leitura (usuário comum não altera a própria permissão) */}
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Permissão</Label>
          <div>
            <Badge variant={role === "admin" ? "default" : "secondary"}>{role}</Badge>
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          onClick={save}
          className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium px-4 py-2 hover:opacity-90 transition-opacity"
        >
          {saved ? <Check className="w-4 h-4" /> : null}
          {saved ? "Salvo" : "Salvar perfil"}
        </button>
        <span className="text-[11px] text-muted-foreground">
          {/* TODO(backend): persistir Cargo e Aniversário via tRPC (users.update)
              + colunas na tabela users. Hoje ficam só neste navegador. */}
          Cargo e aniversário ficam salvos apenas neste navegador até a integração com o backend.
        </span>
      </div>
    </SectionCard>
  );
}

// ─── Reorder helper ──────────────────────────────────────────────────────────
function move<T>(list: T[], index: number, dir: -1 | 1): T[] {
  const next = [...list];
  const target = index + dir;
  if (target < 0 || target >= next.length) return next;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

// ─── Admin: News ─────────────────────────────────────────────────────────────
function NewsAdminSection() {
  const [news, setNews] = useNewsStore();

  const update = (id: string, patch: Partial<StoredNews>) =>
    setNews(news.map((n) => (n.id === id ? { ...n, ...patch } : n)));
  const remove = (id: string) => setNews(news.filter((n) => n.id !== id));
  const add = () => setNews([...news, { id: nanoid(6), text: "", enabled: true }]);

  return (
    <SectionCard
      icon={Newspaper}
      title="News bar"
      description="Gerencie as mensagens que passam na faixa da Home."
    >
      <div className="flex flex-col gap-2">
        {news.length === 0 && (
          <p className="text-xs text-muted-foreground">Nenhuma notícia. Adicione a primeira.</p>
        )}
        {news.map((n, i) => (
          <div key={n.id} className="flex items-center gap-2 rounded-lg border border-border p-2">
            <div className="flex flex-col">
              <button
                className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
                onClick={() => setNews(move(news, i, -1))}
                disabled={i === 0}
                aria-label="Mover para cima"
              >
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
              <button
                className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
                onClick={() => setNews(move(news, i, 1))}
                disabled={i === news.length - 1}
                aria-label="Mover para baixo"
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            </div>
            <Input
              value={n.text}
              placeholder="Texto da notícia"
              onChange={(e) => update(n.id, { text: e.target.value })}
              className="flex-1"
            />
            <Switch checked={n.enabled} onCheckedChange={(v) => update(n.id, { enabled: v })} />
            <button
              className="p-1.5 text-muted-foreground hover:text-destructive"
              onClick={() => remove(n.id)}
              aria-label="Remover"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
      <button
        onClick={add}
        className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:opacity-80"
      >
        <Plus className="w-4 h-4" /> Adicionar notícia
      </button>
      <p className="mt-2 text-[11px] text-muted-foreground">
        {/* TODO(backend): persistir via tRPC (news.list/upsert/delete). */}
        Solução intermediária: as notícias ficam salvas apenas neste navegador até a integração com o backend.
      </p>
    </SectionCard>
  );
}

// ─── Admin: SelvaTV ──────────────────────────────────────────────────────────
function SelvaTVAdminSection() {
  const [images, setImages] = useSelvaTVStore();

  const update = (id: string, patch: Partial<StoredTVImage>) =>
    setImages(images.map((im) => (im.id === id ? { ...im, ...patch } : im)));
  const remove = (id: string) => setImages(images.filter((im) => im.id !== id));
  const add = () =>
    setImages([...images, { id: nanoid(6), src: "", alt: "", title: "", enabled: true }]);

  return (
    <SectionCard
      icon={ImageIcon}
      title="SelvaTV"
      description="Imagens do banner da Home (0 esconde a seção · 1 estático · 2+ carrossel)."
    >
      <div className="flex flex-col gap-3">
        {images.length === 0 && (
          <p className="text-xs text-muted-foreground">Nenhuma imagem. A seção SelvaTV fica oculta na Home.</p>
        )}
        {images.map((im, i) => (
          <div key={im.id} className="flex items-start gap-2 rounded-lg border border-border p-2">
            <div className="flex flex-col pt-1">
              <button
                className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
                onClick={() => setImages(move(images, i, -1))}
                disabled={i === 0}
                aria-label="Mover para cima"
              >
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
              <button
                className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
                onClick={() => setImages(move(images, i, 1))}
                disabled={i === images.length - 1}
                aria-label="Mover para baixo"
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Input value={im.src} placeholder="URL da imagem (https://…)" onChange={(e) => update(im.id, { src: e.target.value })} />
              <Input value={im.title ?? ""} placeholder="Título (opcional)" onChange={(e) => update(im.id, { title: e.target.value })} />
              <Input value={im.alt} placeholder="Descrição / alt" onChange={(e) => update(im.id, { alt: e.target.value })} className="sm:col-span-2" />
            </div>
            <div className="flex flex-col items-center gap-2 pt-1">
              <Switch checked={im.enabled} onCheckedChange={(v) => update(im.id, { enabled: v })} />
              <button className="p-1 text-muted-foreground hover:text-destructive" onClick={() => remove(im.id)} aria-label="Remover">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-4">
        <button onClick={add} className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:opacity-80">
          <Plus className="w-4 h-4" /> Adicionar imagem por URL
        </button>
        {/* Estado preparado para quando houver storage — sem upload fake. */}
        <button
          type="button"
          disabled
          title="Requer storage configurado"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground/60 cursor-not-allowed"
        >
          <ImageIcon className="w-4 h-4" /> Enviar arquivo (em breve)
        </button>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        {/* TODO(storage): habilitar upload de arquivo quando houver bucket/endpoint
            seguro (S3/Railway volume). Por ora, apenas URL de imagem já hospedada. */}
        Solução intermediária: as imagens são referenciadas por URL e ficam salvas apenas neste
        navegador. O upload de arquivo será ativado quando o storage estiver configurado.
      </p>
    </SectionCard>
  );
}

export default function HubSettings() {
  const { user } = useAuth();
  const isAdmin = (user as any)?.role === "admin";

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
              <p className="text-sm text-muted-foreground">Perfil{isAdmin ? " e administração" : ""}</p>
            </div>
          </header>

          <ProfileSection />

          {isAdmin && (
            <>
              <div className="flex items-center gap-2 pt-2">
                <ShieldCheck className="w-4 h-4 text-accent" />
                <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Administração
                </span>
              </div>
              <NewsAdminSection />
              <SelvaTVAdminSection />
            </>
          )}
        </div>
      </main>
    </HubShell>
  );
}
