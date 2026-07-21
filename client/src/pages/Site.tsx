/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Site — tudo sobre o site do cliente
 * ─────────────────────────────────────────────────────────────────────────────
 *  Aba do Tracker (irmã de Dashboard/Campanhas/Relatórios), lendo o cliente
 *  ativo do ActiveAccountContext. Clarity é UMA das partes, não o todo:
 *  comportamento (Clarity) + performance técnica (PageSpeed) + relatórios +
 *  contexto + chat.
 *
 *  A API do Clarity só devolve os últimos 1–3 dias — por isso o que aparece aqui
 *  vem dos SNAPSHOTS que tiramos todo dia, e não de uma consulta ao vivo. Dia
 *  não capturado é dia perdido: é o motivo de o job diário existir.
 *
 *  O token nunca chega neste arquivo: o backend manda só `hasToken`.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useEffect, useState } from "react";
import {
  Activity, AlertTriangle, ExternalLink, Eye, Loader2, MousePointerClick,
  RefreshCw, Settings2, TrendingUp, Users, X, Clock, ArrowDownWideNarrow,
  FileText, NotebookPen, Sparkles, Copy, Trash2, Check, MessageSquare, Send,
  Globe, Gauge, LayoutDashboard, Zap, ArrowRight, ShieldCheck, Wifi, Lock, ShieldAlert,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { MetaDashboardLayout } from "@/components/MetaDashboardLayout";
import { trpc } from "@/lib/trpc";
import { Secao, FonteAusente } from "@/components/Secao";
import { destinoDaAba, type AbaSite, type SecaoSite } from "./site/abasSite";
import { acoesDoResumo, positivosDoResumo, type AcaoResumo } from "./site/resumoSite";
import {
  cardsDeTrafego, listasDe, contexto30d, amostraPequena, semTrafego,
  type MetricasGA4, type ListasGA4, type CardGA4, type Lista as ListaGA4,
} from "./site/ga4Performance";
import { type Fonte, type StatusFonte } from "@shared/fontes";
import { useAuth } from "@/_core/hooks/useAuth";
import { useActiveAccount } from "@/contexts/ActiveAccountContext";
import { canManageContent } from "@shared/permissions";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Formatadores da seção Site — nenhum assume que o número existe
 * ─────────────────────────────────────────────────────────────────────────────
 *  Toda métrica daqui sai de `metricsJson`: um blob de JSON que o TypeScript
 *  não valida. O `as Metricas` abaixo é uma promessa que o banco não fez — a
 *  chave pode simplesmente não estar lá (snapshot antigo, provider que não
 *  mede aquilo, API que devolveu vazio). Ou seja: `undefined` é valor
 *  ESPERADO, não bug.
 *
 *  Por isso o guarda tem que ser `Number.isFinite`, nunca `!== null`:
 *  `undefined !== null` é true e leva direto ao `undefined.toFixed()`.
 *  Number.isFinite ainda barra NaN e Infinity, que JSON também produz.
 * ─────────────────────────────────────────────────────────────────────────────
 */
type Talvez = number | null | undefined;

const ehNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

const fmtNum = (n: Talvez, vazio = "—") =>
  ehNum(n) ? n.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) : vazio;
/** Casas decimais fixas — o único lugar que pode chamar toFixed. */
const fmtDec = (n: Talvez, casas = 2, vazio = "—") => (ehNum(n) ? n.toFixed(casas) : vazio);
const fmtInt = (n: Talvez, vazio = "—") => (ehNum(n) ? String(Math.round(n)) : vazio);
/** Score 0–100 do Lighthouse ou da segurança. */
const fmtScore = (n: Talvez, vazio = "—") => (ehNum(n) ? String(Math.round(n)) : vazio);
const fmtSeg = (s: Talvez, vazio = "—") => {
  if (!ehNum(s)) return vazio;
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${Math.round(s % 60)}s` : `${Math.round(s)}s`;
};
const fmtPct = (n: Talvez, vazio = "—") => (ehNum(n) ? `${Math.round(n)}%` : vazio);
const fmtDias = (n: Talvez, vazio = "—") => (ehNum(n) ? `${Math.round(n)}d` : vazio);

/**
 * Os campos são opcionais de propósito: é o que o banco realmente garante.
 * Declarar `sessions: number | null` mentiria para o compilador e esconderia
 * exatamente a classe de bug que derrubou esta tela.
 */
type Metricas = {
  sessions?: Talvez; botSessions?: Talvez; users?: Talvez;
  pagesPerSession?: Talvez; averageScrollDepth?: Talvez;
  averageSessionDuration?: Talvez; deadClicks?: Talvez;
  rageClicks?: Talvez; quickBacks?: Talvez;
  javascriptErrors?: Talvez; errorClicks?: Talvez;
  excessiveScroll?: Talvez;
};

export default function Site() {
  const { user } = useAuth();
  const podeConfigurar = canManageContent((user as { role?: string } | null)?.role);
  const { activeAccountId, activeAccount, setActiveAccountId } = useActiveAccount();
  const utils = trpc.useUtils();
  const [config, setConfig] = useState(false);

  // Deep-link de notificação: /clarity?account=15 abre já no cliente certo.
  // Sem isto, o alerta levaria para a tela do cliente que estivesse selecionado.
  useEffect(() => {
    const alvo = Number(new URLSearchParams(window.location.search).get("account"));
    if (alvo && alvo !== activeAccountId) setActiveAccountId(alvo);
  }, [activeAccountId, setActiveAccountId]);
  /**
   * O `?aba=` do deep-link passa pelo mapa de aliases: os alertas gravados no
   * banco ainda dizem "clarity" e "seguranca", nomes de abas que não existem
   * mais. O mapa leva ao lugar novo com a seção certa já aberta.
   */
  const destino = destinoDaAba(new URLSearchParams(window.location.search).get("aba"));
  const [aba, setAba] = useState<AbaSite>(destino.aba);
  const [secaoDestaque, setSecaoDestaque] = useState<SecaoSite | undefined>(destino.secao);

  const enabled = !!activeAccountId;
  const cfgQ = trpc.clarity.settings.useQuery({ accountId: activeAccountId! }, { enabled });
  const snapQ = trpc.clarity.ultimo.useQuery({ accountId: activeAccountId! }, { enabled });

  const sync = trpc.clarity.sync.useMutation({
    onSuccess: (r) => {
      utils.clarity.ultimo.invalidate(); utils.clarity.settings.invalidate();
      if (r.ok) toast.success(`Clarity sincronizado — ${r.sessions ?? 0} sessão(ões).`);
      else toast.error(r.mensagem);
    },
    onError: (e) => toast.error(e.message),
  });

  if (!activeAccountId) {
    return (
      <MetaDashboardLayout title="Site">
        <Vazio icone={<Activity className="w-8 h-8" />} titulo="Selecione um cliente"
          texto="Escolha um cliente na barra lateral para ver o comportamento no site." />
      </MetaDashboardLayout>
    );
  }

  const cfg = cfgQ.data;
  const snap = snapQ.data;
  const m = (snap?.metricsJson ?? null) as Metricas | null;
  const configurado = !!cfg?.enabled && !!cfg?.hasToken;
  const erroSync = cfg?.lastSyncStatus === "erro";

  return (
    <MetaDashboardLayout title="Site">
      <div className="p-6 md:p-8 flex flex-col gap-5 max-w-6xl">
        <header className="flex items-start gap-3 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <h1 className="text-xl font-semibold flex items-center gap-2">
              <Globe className="w-5 h-5 text-accent" /> Site
            </h1>
            <p className="text-sm text-muted-foreground">
              {activeAccount?.accountName ?? "Cliente"}
            </p>
          </div>
          {cfg?.projectId && (
            <a href={`https://clarity.microsoft.com/projects/view/${cfg.projectId}/dashboard`}
              target="_blank" rel="noopener noreferrer"
              className="h-9 px-3 rounded-lg border border-border text-xs flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
              Abrir no Clarity <ExternalLink className="w-3 h-3" />
            </a>
          )}
          {configurado && podeConfigurar && (
            <button onClick={() => sync.mutate({ accountId: activeAccountId, dias: 1 })} disabled={sync.isPending}
              className="h-9 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-medium flex items-center gap-1.5 disabled:opacity-60">
              {sync.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Sincronizar
            </button>
          )}
          {podeConfigurar && (
            <button onClick={() => setConfig(true)}
              className="h-9 px-3 rounded-lg border border-border text-xs flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
              <Settings2 className="w-3.5 h-3.5" /> Configurar
            </button>
          )}
        </header>

        <div className="flex gap-1 border-b border-border">
          {([["resumo", "Resumo", LayoutDashboard], ["performance", "Performance", Activity], ["tecnico", "Técnico", Gauge], ["relatorios", "Relatórios", FileText], ["contexto", "Contexto", NotebookPen], ["chat", "Perguntar", MessageSquare]] as const).map(([v, lbl, Ic]) => (
            <button key={v} onClick={() => { setAba(v); setSecaoDestaque(undefined); }}
              className={`px-4 py-2 text-sm transition border-b-2 -mb-px flex items-center gap-1.5 ${aba === v ? "border-accent text-accent font-medium" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
              <Ic className="w-3.5 h-3.5" /> {lbl}
            </button>
          ))}
        </div>

        {aba === "resumo" && <AbaResumo accountId={activeAccountId} onIr={setAba} />}
        {aba === "performance" && <AbaPerformanceSite accountId={activeAccountId} podeConfigurar={podeConfigurar} onConfigurar={() => setConfig(true)} destaque={secaoDestaque} />}
        {aba === "tecnico" && <AbaTecnico accountId={activeAccountId} podeConfigurar={podeConfigurar} destaque={secaoDestaque} />}
        {aba === "contexto" && <AbaContexto accountId={activeAccountId} podeEditar={podeConfigurar} />}
        {aba === "relatorios" && <AbaRelatorios accountId={activeAccountId} podeGerar={podeConfigurar} />}
        {aba === "chat" && <AbaChat accountId={activeAccountId} nome={activeAccount?.accountName ?? "este cliente"} podeLimpar={podeConfigurar} />}

      </div>

      {config && activeAccountId && (
        <DialogConfig accountId={activeAccountId} atual={cfg ?? null} onClose={() => setConfig(false)} />
      )}
    </MetaDashboardLayout>
  );
}

function Vazio({ icone, titulo, texto, acao }: { icone: React.ReactNode; titulo: string; texto: string; acao?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card py-14 px-6 text-center flex flex-col items-center gap-2">
      <span className="text-muted-foreground/40">{icone}</span>
      <p className="text-sm font-medium">{titulo}</p>
      <p className="text-xs text-muted-foreground max-w-md">{texto}</p>
      {acao && <div className="mt-2">{acao}</div>}
    </div>
  );
}

function Card({ icone, label, valor, hint, tom }: { icone: React.ReactNode; label: string; valor: string; hint?: string; tom?: "alerta" | "critico" }) {
  const cor = tom === "critico" ? "text-red-600" : tom === "alerta" ? "text-amber-600" : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">{icone}{label}</p>
      <p className={`text-xl font-semibold tabular-nums mt-1 ${cor}`}>{valor}</p>
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Lista({ titulo, itens, vazio }: { titulo: string; itens: { rotulo: string; valor: string }[]; vazio: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs font-semibold text-muted-foreground mb-2">{titulo}</p>
      {itens.length === 0 ? <p className="text-xs text-muted-foreground py-3">{vazio}</p> : (
        <div className="flex flex-col gap-1.5">
          {itens.map((i, idx) => (
            <div key={idx} className="flex items-center gap-2 text-xs">
              <span className="flex-1 truncate text-foreground" title={i.rotulo}>{i.rotulo}</span>
              <span className="tabular-nums text-muted-foreground flex-shrink-0">{i.valor}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Configuração (admin/dev) ────────────────────────────────────────────────

type Cfg = { enabled: boolean; projectId: string | null; hasToken: boolean; domain: string | null; importantUrlsJson: unknown; notes: string | null };

function DialogConfig({ accountId, atual, onClose }: { accountId: number; atual: Cfg | null; onClose: () => void }) {
  const utils = trpc.useUtils();
  const [enabled, setEnabled] = useState(atual?.enabled ?? false);
  const [projectId, setProjectId] = useState(atual?.projectId ?? "");
  const [apiToken, setApiToken] = useState("");
  const [domain, setDomain] = useState(atual?.domain ?? "");
  const [urls, setUrls] = useState(((atual?.importantUrlsJson as string[] | null) ?? []).join("\n"));
  const [notes, setNotes] = useState(atual?.notes ?? "");

  const salvar = trpc.clarity.upsert.useMutation({
    onSuccess: () => { utils.clarity.settings.invalidate(); toast.success("Clarity configurado."); onClose(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl w-full max-w-lg max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 p-4 border-b border-border">
          <Settings2 className="w-4 h-4 text-accent" />
          <p className="text-sm font-semibold flex-1">Configurar Clarity</p>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-4 flex flex-col gap-3">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            Clarity habilitado para este cliente
          </label>

          <Campo label="Token da API" hint={atual?.hasToken ? "Já existe um token salvo. Preencha só para substituir." : "Clarity → Settings → Data Export → Generate new API token."}>
            <input type="password" value={apiToken} onChange={(e) => setApiToken(e.target.value)}
              placeholder={atual?.hasToken ? "•••••••• (mantém o atual)" : "Cole o token aqui"}
              className="w-full text-sm border border-border rounded-md px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-primary" />
          </Campo>

          <Campo label="Project ID" hint="Só para o link do painel. A API não usa — quem identifica o projeto é o token.">
            <input value={projectId} onChange={(e) => setProjectId(e.target.value)} placeholder="ex.: 3t0wlogvdz"
              className="w-full text-sm border border-border rounded-md px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-primary" />
          </Campo>

          <Campo label="Domínio principal">
            <input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="exemplo.com.br"
              className="w-full text-sm border border-border rounded-md px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-primary" />
          </Campo>

          <Campo label="URLs importantes" hint="Uma por linha — as páginas que mais importam para este cliente.">
            <textarea value={urls} onChange={(e) => setUrls(e.target.value)} rows={3}
              placeholder={"https://exemplo.com.br/\nhttps://exemplo.com.br/orcamento"}
              className="w-full text-sm border border-border rounded-md px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-primary resize-y" />
          </Campo>

          <Campo label="Observações de tracking">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
              placeholder="Ex.: o pixel dispara só após aceitar cookies."
              className="w-full text-sm border border-border rounded-md px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-primary resize-y" />
          </Campo>

          <p className="text-[11px] text-muted-foreground border-t border-border pt-3">
            O token é gravado criptografado e nunca volta para o navegador. A API do Clarity só entrega os
            últimos 3 dias e aceita 10 consultas por dia — por isso guardamos um retrato diário para formar o histórico.
          </p>
        </div>

        <div className="flex justify-end gap-2 p-4 border-t border-border">
          <button onClick={onClose} className="text-sm px-4 py-2 rounded-lg border border-border text-muted-foreground hover:text-foreground">Cancelar</button>
          <button
            onClick={() => salvar.mutate({
              accountId, enabled,
              projectId: projectId.trim() || null,
              ...(apiToken ? { apiToken } : {}),
              domain: domain.trim() || null,
              importantUrls: urls.split("\n").map((u) => u.trim()).filter(Boolean),
              notes: notes.trim() || null,
            })}
            disabled={salvar.isPending}
            className="text-sm px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50">
            {salvar.isPending ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Campo({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] text-muted-foreground">{label}</label>
      {children}
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

// ─── Aba Contexto ────────────────────────────────────────────────────────────
// O que a máquina não tem como saber. É isto que faz o relatório interpretar
// em vez de só descrever.

const CAMPOS = [
  { k: "objective", label: "Objetivo atual", ph: "Ex.: gerar orçamentos qualificados para a linha industrial." },
  { k: "offer", label: "Oferta / produto principal", ph: "O que está sendo vendido e a que preço/condição." },
  { k: "audience", label: "Público-alvo", ph: "Quem precisa ver o anúncio." },
  { k: "currentHypotheses", label: "Hipóteses em andamento", ph: "O que suspeitamos hoje e queremos provar." },
  { k: "previousTests", label: "O que já foi testado", ph: "Para não repetir teste que já deu resposta." },
  { k: "constraints", label: "Restrições / importante saber", ph: "Ex.: não pode falar preço; site só edita via agência." },
  { k: "trackingNotes", label: "Observações de tracking", ph: "Ex.: o pixel só dispara após aceitar cookies." },
  { k: "nextSteps", label: "Próximos passos combinados", ph: "O combinado com o cliente." },
] as const;

function AbaContexto({ accountId, podeEditar }: { accountId: number; podeEditar: boolean }) {
  const utils = trpc.useUtils();
  const ctxQ = trpc.siteDiag.contexto.useQuery({ accountId });
  const notasQ = trpc.siteDiag.notas.useQuery({ accountId, limite: 20 });
  const { user } = useAuth();
  const meuId = (user as { id?: number } | null)?.id;
  const isAdmin = (user as { role?: string } | null)?.role === "admin";

  const [draft, setDraft] = useState<Record<string, string> | null>(null);
  const [pages, setPages] = useState<string | null>(null);
  const [eventos, setEventos] = useState<string | null>(null);
  const [nota, setNota] = useState("");

  const salvar = trpc.siteDiag.salvarContexto.useMutation({
    onSuccess: () => { utils.siteDiag.contexto.invalidate(); setDraft(null); setPages(null); setEventos(null); toast.success("Contexto salvo."); },
    onError: (e) => toast.error(e.message),
  });
  const criarNota = trpc.siteDiag.criarNota.useMutation({
    onSuccess: () => { utils.siteDiag.notas.invalidate(); setNota(""); },
    onError: (e) => toast.error(e.message),
  });
  const apagarNota = trpc.siteDiag.apagarNota.useMutation({ onSuccess: () => utils.siteDiag.notas.invalidate() });

  if (ctxQ.isLoading) return <Carregando />;
  const c = ctxQ.data;
  const val = (k: string) => draft?.[k] ?? ((c as Record<string, unknown> | null)?.[k] as string | null) ?? "";
  const set = (k: string, v: string) => setDraft({ ...(draft ?? {}), [k]: v });
  const pagesVal = pages ?? (((c?.importantPagesJson as string[] | null) ?? []).join("\n"));
  const eventosVal = eventos ?? (((c?.conversionEventsJson as string[] | null) ?? []).join("\n"));
  const mudou = draft !== null || pages !== null || eventos !== null;

  return (
    <div className="flex flex-col gap-4">
      {!podeEditar && (
        <p className="text-xs text-muted-foreground">Você pode ler o contexto; editar é de administradores.</p>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {CAMPOS.map((f) => (
          <div key={f.k} className="flex flex-col gap-1">
            <label className="text-[11px] text-muted-foreground">{f.label}</label>
            <textarea value={val(f.k)} onChange={(e) => set(f.k, e.target.value)} rows={3} placeholder={f.ph} disabled={!podeEditar}
              className="text-sm border border-border rounded-md px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-primary resize-y disabled:opacity-70" />
          </div>
        ))}
        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-muted-foreground">Páginas importantes <span className="opacity-60">(uma por linha)</span></label>
          <textarea value={pagesVal} onChange={(e) => setPages(e.target.value)} rows={3} disabled={!podeEditar}
            placeholder={"https://site.com.br/\nhttps://site.com.br/orcamento"}
            className="text-sm border border-border rounded-md px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-primary resize-y disabled:opacity-70" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-muted-foreground">Eventos de conversão esperados <span className="opacity-60">(um por linha)</span></label>
          <textarea value={eventosVal} onChange={(e) => setEventos(e.target.value)} rows={3} disabled={!podeEditar}
            placeholder={"Lead\nAdicionar ao carrinho"}
            className="text-sm border border-border rounded-md px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-primary resize-y disabled:opacity-70" />
        </div>
      </div>

      {podeEditar && (
        <div className="flex items-center gap-3">
          <button
            onClick={() => salvar.mutate({
              accountId,
              ...Object.fromEntries(CAMPOS.map((f) => [f.k, val(f.k).trim() || null])),
              importantPages: pagesVal.split("\n").map((x) => x.trim()).filter(Boolean),
              conversionEvents: eventosVal.split("\n").map((x) => x.trim()).filter(Boolean),
            } as never)}
            disabled={!mudou || salvar.isPending}
            className="text-sm px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50">
            {salvar.isPending ? "Salvando…" : "Salvar contexto"}
          </button>
          {c?.updatedAt && <span className="text-[11px] text-muted-foreground">Atualizado em {new Date(c.updatedAt).toLocaleString("pt-BR")}</span>}
        </div>
      )}

      {/* Notas — histórico curto do que a equipe observou */}
      <div className="rounded-xl border border-border bg-card p-4 mt-2">
        <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5"><NotebookPen className="w-3.5 h-3.5" /> Notas do cliente</p>
        <div className="flex gap-2">
          <input value={nota} onChange={(e) => setNota(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && nota.trim()) criarNota.mutate({ accountId, body: nota.trim() }); }}
            placeholder="Registre o que observou hoje…"
            className="flex-1 text-sm border border-border rounded-md px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-primary" />
          <button onClick={() => nota.trim() && criarNota.mutate({ accountId, body: nota.trim() })} disabled={!nota.trim() || criarNota.isPending}
            className="text-sm px-3 py-2 rounded-md border border-border text-muted-foreground hover:text-foreground disabled:opacity-50">Adicionar</button>
        </div>
        <div className="flex flex-col gap-2 mt-3">
          {(notasQ.data ?? []).map((n) => (
            <div key={n.id} className="flex items-start gap-2 text-xs border-b border-border/50 pb-2 last:border-b-0">
              <div className="flex-1">
                <p className="text-foreground whitespace-pre-line">{n.body}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{n.autorNome ?? "—"} · {new Date(n.createdAt).toLocaleString("pt-BR")}</p>
              </div>
              {(isAdmin || n.authorUserId === meuId) && (
                <button onClick={() => apagarNota.mutate({ id: n.id })} className="text-muted-foreground hover:text-destructive p-1" title="Apagar">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
          {(notasQ.data ?? []).length === 0 && <p className="text-xs text-muted-foreground py-2">Nenhuma nota ainda.</p>}
        </div>
      </div>
    </div>
  );
}

// ─── Aba Relatórios ──────────────────────────────────────────────────────────

const hojeStr = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const diasAtras = (n: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(Date.now() - n * 86400000));

const ORIGEM_LABEL: Record<string, string> = {
  midia: "Mídia", site: "Site/página", oferta: "Oferta", tracking: "Tracking",
  tecnico: "Técnico", indeterminado: "Indeterminado",
};
const ORIGEM_COR: Record<string, string> = {
  midia: "bg-amber-500/15 text-amber-600", site: "bg-blue-500/15 text-blue-600",
  oferta: "bg-purple-500/15 text-purple-600", tracking: "bg-orange-500/15 text-orange-600",
  tecnico: "bg-red-500/15 text-red-600", indeterminado: "bg-muted text-muted-foreground",
};

type Fontes = { midia: boolean; clarity: boolean; contexto: boolean; notas: boolean; diasClarity: number; diasPeriodo: number };
type Relatorio = {
  resumoExecutivo: string; diagnostico: string; origemProvavel: string;
  problemas: string[]; hipoteses: string[]; proximasAcoes: string[]; observacoesTracking: string[];
  midia: Record<string, number | null>; site: Record<string, number | null>; fontes: Fontes;
};

function AbaRelatorios({ accountId, podeGerar }: { accountId: number; podeGerar: boolean }) {
  const utils = trpc.useUtils();
  const [inicio, setInicio] = useState(diasAtras(6));
  const [fim, setFim] = useState(hojeStr());
  const [aberto, setAberto] = useState<number | null>(null);
  const [copiado, setCopiado] = useState(false);

  const listaQ = trpc.siteDiag.relatorios.useQuery({ accountId });
  const detalheQ = trpc.siteDiag.relatorio.useQuery({ id: aberto! }, { enabled: !!aberto });

  const gerar = trpc.siteDiag.gerarRelatorio.useMutation({
    onSuccess: (r) => { utils.siteDiag.relatorios.invalidate(); setAberto(r.id); toast.success("Relatório gerado."); },
    onError: (e) => toast.error(e.message),
  });

  const r = (detalheQ.data?.reportJson ?? null) as Relatorio | null;
  const md = detalheQ.data?.markdown ?? "";

  return (
    <div className="flex flex-col gap-4">
      {podeGerar && (
        <div className="rounded-xl border border-border bg-card p-4 flex items-end gap-3 flex-wrap">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-muted-foreground">De</label>
            <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)}
              className="text-sm border border-border rounded-md px-2 py-1.5 bg-background" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-muted-foreground">Até</label>
            <input type="date" value={fim} onChange={(e) => setFim(e.target.value)}
              className="text-sm border border-border rounded-md px-2 py-1.5 bg-background" />
          </div>
          <button onClick={() => gerar.mutate({ accountId, rangeStart: inicio, rangeEnd: fim })} disabled={gerar.isPending}
            className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium flex items-center gap-1.5 disabled:opacity-60">
            {gerar.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {gerar.isPending ? "Analisando…" : "Gerar relatório"}
          </button>
          <p className="text-[11px] text-muted-foreground flex-1 min-w-[200px]">
            Cruza a mídia do período com o comportamento no site e o contexto. Só usa o que existe — o que faltar, ele diz.
          </p>
        </div>
      )}

      {/* O gerador modular mora em Relatórios; aqui só pré-configuramos os
          módulos de Site. Uma segunda cópia do gerador seria uma segunda
          verdade sobre o mesmo cliente. */}
      {podeGerar && (
        <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-3 flex-wrap">
          <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <p className="text-xs text-muted-foreground flex-1 min-w-[220px]">
            Precisa de um relatório para o cliente, escolhendo o que entra (mídia, Clarity, performance,
            segurança)? O gerador completo fica em Relatórios.
          </p>
          <a
            href={`/reports?modulos=site,clarity,pagespeed,seguranca,uptime&account=${accountId}`}
            className="h-8 px-3 rounded-lg border border-border text-xs flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
          >
            Gerar relatório com dados de Site
          </a>
        </div>
      )}

      {aberto && detalheQ.isLoading && <Carregando />}

      {aberto && r && (
        <div className="rounded-xl border border-border bg-card p-5 flex flex-col gap-4">
          <div className="flex items-start gap-2 flex-wrap">
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${ORIGEM_COR[r.origemProvavel] ?? ORIGEM_COR.indeterminado}`}>
              Origem provável: {ORIGEM_LABEL[r.origemProvavel] ?? r.origemProvavel}
            </span>
            <div className="ml-auto flex gap-2">
              <button onClick={() => { navigator.clipboard.writeText(md); setCopiado(true); setTimeout(() => setCopiado(false), 1500); }}
                className="text-[11px] px-2 py-1 rounded-md border border-border text-muted-foreground hover:text-foreground flex items-center gap-1">
                {copiado ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />} {copiado ? "Copiado" : "Copiar resumo"}
              </button>
              <button onClick={() => setAberto(null)} className="text-[11px] px-2 py-1 rounded-md border border-border text-muted-foreground hover:text-foreground">Fechar</button>
            </div>
          </div>

          <FontesBadges f={r.fontes} />
          <p className="text-sm text-foreground">{r.resumoExecutivo}</p>
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-1">Diagnóstico</p>
            <p className="text-sm text-muted-foreground whitespace-pre-line">{r.diagnostico}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <BlocoLista titulo="Problemas encontrados" itens={r.problemas} />
            <BlocoLista titulo="Hipóteses a testar" itens={r.hipoteses} />
            <BlocoLista titulo="Próximas ações" itens={r.proximasAcoes} />
            <BlocoLista titulo="Observações de tracking" itens={r.observacoesTracking} />
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-xs font-semibold text-muted-foreground mb-2">Histórico</p>
        {listaQ.isLoading ? <p className="text-xs text-muted-foreground py-2">Carregando…</p>
          : (listaQ.data ?? []).length === 0 ? <p className="text-xs text-muted-foreground py-2">Nenhum relatório gerado ainda.</p> : (
          <div className="flex flex-col gap-1.5">
            {(listaQ.data ?? []).map((x) => {
              const rj = x.reportJson as Relatorio | null;
              return (
                <button key={x.id} onClick={() => setAberto(x.id)}
                  className={`flex items-center gap-2 text-xs p-2 rounded-md border transition text-left ${aberto === x.id ? "border-accent bg-primary/5" : "border-border hover:border-accent/40"}`}>
                  <span className="font-medium">{x.rangeStart} → {x.rangeEnd}</span>
                  {rj?.origemProvavel && (
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${ORIGEM_COR[rj.origemProvavel] ?? ORIGEM_COR.indeterminado}`}>
                      {ORIGEM_LABEL[rj.origemProvavel] ?? rj.origemProvavel}
                    </span>
                  )}
                  <span className="ml-auto text-muted-foreground">{x.autorNome ?? "—"} · {new Date(x.createdAt).toLocaleDateString("pt-BR")}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/** Diz na cara quais fontes o relatório teve — é o que separa diagnóstico de chute. */
function FontesBadges({ f }: { f: Fontes }) {
  const item = (ok: boolean, label: string, detalhe?: string) => (
    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${ok ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600" : "border-border text-muted-foreground"}`}>
      {ok ? "✓" : "✕"} {label}{detalhe ? ` · ${detalhe}` : ""}
    </span>
  );
  return (
    <div className="flex flex-wrap gap-1.5">
      {item(f.midia, "Mídia paga")}
      {item(f.clarity, "Clarity", f.clarity ? `${f.diasClarity} de ${f.diasPeriodo} dias` : undefined)}
      {item(f.contexto, "Contexto")}
      {item(f.notas, "Notas")}
    </div>
  );
}

function BlocoLista({ titulo, itens }: { titulo: string; itens: string[] }) {
  if (!itens.length) return null;
  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground mb-1">{titulo}</p>
      <ul className="flex flex-col gap-1">
        {itens.map((x, i) => (
          <li key={i} className="text-xs text-muted-foreground flex gap-1.5">
            <span className="text-accent flex-shrink-0">·</span><span>{x}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Carregando() {
  return (
    <div className="flex items-center gap-2 py-12 justify-center text-sm text-muted-foreground">
      <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
    </div>
  );
}

// ─── Aba Perguntar ───────────────────────────────────────────────────────────
// Responde só com o que o Spaces tem deste cliente. Quando falta dado, diz que
// falta — é isso que separa a ferramenta de um chute bem escrito.

// O rótulo de cada fonte vem do servidor (clientIntelligence → ROTULO): a lista
// de fontes muda conforme o cliente, e duplicá-la aqui garantiria divergência.

function AbaChat({ accountId, nome, podeLimpar }: { accountId: number; nome: string; podeLimpar: boolean }) {
  const utils = trpc.useUtils();
  const chatQ = trpc.siteDiag.chat.useQuery({ accountId });
  const [pergunta, setPergunta] = useState("");

  const perguntar = trpc.siteDiag.perguntar.useMutation({
    onSuccess: () => { utils.siteDiag.chat.invalidate(); setPergunta(""); },
    onError: (e) => toast.error(e.message),
  });
  const limpar = trpc.siteDiag.limparChat.useMutation({
    onSuccess: () => { utils.siteDiag.chat.invalidate(); toast.success("Conversa limpa."); },
  });

  const enviar = (q: string) => { if (q.trim() && !perguntar.isPending) perguntar.mutate({ accountId, pergunta: q.trim() }); };

  if (chatQ.isLoading) return <Carregando />;
  const msgs = chatQ.data?.mensagens ?? [];
  const f = chatQ.data?.fontes;

  return (
    <div className="flex flex-col gap-4">
      {/* O que ele sabe deste cliente — expectativa alinhada ANTES da pergunta.
          A lista vem do servidor: fonte que falta aparece apagada, com o motivo
          no tooltip. É pendência, não erro. */}
      {f && f.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap text-[11px]">
          <span className="text-muted-foreground">Responde com base em:</span>
          {f.map((x) => (
            <span
              key={x.chave}
              title={x.presente ? `${x.rotulo}: disponível` : x.porque}
              className={`px-2 py-0.5 rounded-full border cursor-help ${
                x.presente
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
                  : "border-border text-muted-foreground line-through opacity-60"
              }`}
            >
              {x.rotulo}
            </span>
          ))}
          {podeLimpar && msgs.length > 0 && (
            <button onClick={() => { if (confirm("Limpar toda a conversa deste cliente?")) limpar.mutate({ accountId }); }}
              className="ml-auto text-muted-foreground hover:text-destructive flex items-center gap-1">
              <Trash2 className="w-3 h-3" /> Limpar conversa
            </button>
          )}
        </div>
      )}
      {/* O que falta, por extenso — o tooltip some no toque, e no celular a
          pastilha apagada sozinha não explica nada. */}
      {f && f.some((x) => !x.presente) && (
        <p className="text-[11px] text-muted-foreground -mt-2">
          Não usa: {f.filter((x) => !x.presente).map((x) => x.rotulo).join(", ")} — passe o mouse para ver por quê.
        </p>
      )}

      <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3 min-h-[280px]">
        {msgs.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 py-8 text-center">
            <MessageSquare className="w-7 h-7 text-muted-foreground/40" />
            <p className="text-sm font-medium">Pergunte sobre {nome}</p>
            <p className="text-xs text-muted-foreground max-w-sm">
              Responde só com o que temos aqui — mídia, Clarity, contexto e relatórios. Quando falta dado, ele diz que falta.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {msgs.map((m) => (
              <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-xl px-3 py-2 ${m.role === "user" ? "bg-primary/15 text-foreground" : "bg-muted/50 text-foreground"}`}>
                  {m.role === "user" && <p className="text-[10px] text-muted-foreground mb-0.5">{m.autorNome ?? "—"}</p>}
                  <p className="text-sm whitespace-pre-line">{m.content}</p>
                </div>
              </div>
            ))}
            {perguntar.isPending && (
              <div className="flex justify-start">
                <div className="bg-muted/50 rounded-xl px-3 py-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Consultando os dados do cliente…
                </div>
              </div>
            )}
          </div>
        )}

        {/* Sugestões ancoradas no que ESTE cliente consegue responder */}
        {msgs.length === 0 && (chatQ.data?.sugestoes ?? []).length > 0 && (
          <div className="flex flex-wrap gap-1.5 justify-center">
            {(chatQ.data?.sugestoes ?? []).map((s, i) => (
              <button key={i} onClick={() => enviar(s)}
                className="text-[11px] px-2.5 py-1 rounded-full border border-border text-muted-foreground hover:border-accent/40 hover:text-foreground transition">
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <input value={pergunta} onChange={(e) => setPergunta(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") enviar(pergunta); }}
          placeholder={`Pergunte sobre ${nome}…`} disabled={perguntar.isPending}
          className="flex-1 text-sm border border-border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60" />
        <button onClick={() => enviar(pergunta)} disabled={!pergunta.trim() || perguntar.isPending}
          className="px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium flex items-center gap-1.5 disabled:opacity-50">
          {perguntar.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </div>
      <p className="text-[10px] text-muted-foreground">
        Sugere, não executa. Nenhuma resposta altera dado — as ações continuam sendo suas.
      </p>
    </div>
  );
}

// ─── Visão geral ─────────────────────────────────────────────────────────────
// Responde "como está o site deste cliente?" numa olhada, e manda para o detalhe.

/**
 * Resumo do CLIENTE SELECIONADO — não confundir com a Visão geral do Tracker,
 * que é o painel cross-client e não é tocada aqui.
 *
 * Responde, nesta ordem: como estão as fontes, o que precisa de ação, o que
 * está bem, qual o próximo passo. Os quatro cards de sempre continuam, mas
 * depois disso — um resumo que começa por métrica obriga quem lê a deduzir se
 * precisa fazer algo.
 */
function AbaResumo({ accountId, onIr }: { accountId: number; onIr: (a: AbaSite) => void }) {
  const cfgQ = trpc.clarity.settings.useQuery({ accountId });
  const clarityQ = trpc.clarity.ultimo.useQuery({ accountId });
  const perfQ = trpc.clarity.perfUltimo.useQuery({ accountId });
  const saudeQ = trpc.clarity.saude.useQuery({ accountId });
  const ctxQ = trpc.siteDiag.contexto.useQuery({ accountId });
  const repQ = trpc.siteDiag.relatorios.useQuery({ accountId });
  const fontesQ = trpc.fontes.doCliente.useQuery({ accountId });

  if (cfgQ.isLoading) return <Carregando />;
  const cfg = cfgQ.data;
  const clarityOn = !!cfg?.enabled && !!cfg?.hasToken;
  const perfOn = !!cfg?.performanceEnabled;
  const m = (clarityQ.data?.metricsJson ?? null) as Metricas | null;
  const pm = (perfQ.data?.metricsJson ?? null) as PerfMetricas | null;
  const ctx = ctxQ.data;
  const temCtx = !!(ctx?.objective || ctx?.offer || ctx?.audience);
  const seg = (saudeQ.data?.seguranca?.metricsJson ?? null) as MetSeg | null;
  const up = (saudeQ.data?.uptime?.metricsJson ?? null) as MetUp | null;
  const temDominio = !!(cfg?.domain || cfg?.performanceUrl);

  // Site não configurado = nem domínio, nem Clarity, nem performance. Com
  // domínio já dá para checar segurança e uptime — não precisa de mais nada.
  if (!clarityOn && !perfOn && !temDominio) {
    return (
      <Vazio icone={<Globe className="w-8 h-8" />} titulo="Site ainda não configurado para este cliente"
        texto="Informe o domínio principal para verificar segurança e disponibilidade. Conecte o Clarity para ver o comportamento das pessoas, e ative a performance técnica para medir o carregamento." />
    );
  }

  const fontes = fontesQ.data ?? [];
  const acoes = acoesDoResumo({ fontes, m, pm, seg, up, temCtx });
  const positivos = positivosDoResumo({ fontes, m, pm, seg, up });

  return (
    <div className="flex flex-col gap-4">
      {/* 1 — Estado das fontes deste cliente (resolvedor da F1) */}
      {fontes.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2">Fontes deste cliente</p>
          <div className="flex flex-wrap gap-1.5">
            {fontes.map((f) => <PastilhaFonte key={f.chave} fonte={f} />)}
          </div>
        </div>
      )}

      {/* 2 — O que precisa de ação. Só existe quando há o que fazer. */}
      {acoes.length > 0 && (
        <div className="rounded-lg border border-amber-500/25 bg-amber-500/[0.04] p-3">
          <p className="text-[11px] font-medium text-amber-700 dark:text-amber-400 uppercase tracking-wide mb-2">Precisa de ação</p>
          <ul className="flex flex-col gap-1.5">
            {acoes.map((a: AcaoResumo, i: number) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${a.grave ? "bg-red-500" : "bg-amber-500"}`} />
                <span className="flex-1 text-foreground">{a.texto}</span>
                {a.ir && (
                  <button onClick={() => onIr(a.ir!)} className="text-xs text-accent hover:underline flex-shrink-0">
                    abrir
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 3 — O que está bem. Omitido quando não há nada de bom a dizer. */}
      {positivos.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2">Está bem</p>
          <ul className="flex flex-col gap-1">
            {positivos.map((t: string, i: number) => (
              <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 mt-0.5 flex-shrink-0" />{t}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 4 — Próximo passo: uma frase, a mais urgente. */}
      <p className="text-sm text-muted-foreground px-1">
        <span className="font-medium text-foreground">Próximo passo: </span>
        {acoes[0]?.proximoPasso ?? "Nada urgente por aqui. Vale registrar o contexto do cliente para o robô ficar mais preciso."}
      </p>

      {/* 5 — Os quatro cards de sempre */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Comportamento */}
        <CardResumo
          titulo="Comportamento" icone={<Activity className="w-4 h-4" />}
          ligado={clarityOn} semDados={clarityOn && !clarityQ.data}
          textoOff="Clarity não conectado." textoSemDados="Sem snapshot ainda — o primeiro sai amanhã de manhã."
          onIr={() => onIr("performance")}
        >
          {m && (
            <div className="grid grid-cols-2 gap-2">
              <Mini label="Sessões" valor={fmtNum(m.sessions)} />
              <Mini label="Scroll médio" valor={fmtPct(m.averageScrollDepth)} />
              <Mini label="Erros de JS" valor={fmtNum(m.javascriptErrors)} alerta={(m.javascriptErrors ?? 0) > 0} />
              <Mini label="Cliques mortos" valor={fmtNum(m.deadClicks)} alerta={(m.deadClicks ?? 0) > 0} />
            </div>
          )}
        </CardResumo>

        {/* Performance técnica */}
        <CardResumo
          titulo="Performance técnica" icone={<Gauge className="w-4 h-4" />}
          ligado={perfOn} semDados={perfOn && !perfQ.data}
          textoOff="Performance técnica não configurada." textoSemDados="Nenhum teste rodado ainda."
          onIr={() => onIr("tecnico")}
        >
          {pm && (
            <div className="grid grid-cols-2 gap-2">
              <Mini label="Score" valor={fmtScore(pm.performanceScore)} alerta={(pm.performanceScore ?? 100) < 50} />
              <Mini label="LCP" valor={fmtMs(pm.lcp)} alerta={(pm.lcp ?? 0) > 2500} />
              <Mini label="CLS" valor={fmtDec(pm.cls, 2)} alerta={(pm.cls ?? 0) > 0.1} />
              <Mini label="TBT" valor={fmtMs(pm.tbt)} alerta={(pm.tbt ?? 0) > 200} />
            </div>
          )}
        </CardResumo>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <CardResumo
          titulo="Segurança básica" icone={<ShieldCheck className="w-4 h-4" />}
          ligado={temDominio} semDados={temDominio && !seg}
          textoOff="Domínio não informado." textoSemDados="Ainda não verificado — roda amanhã de manhã."
          onIr={() => onIr("tecnico")}
        >
          {seg && (
            <div className="grid grid-cols-2 gap-2">
              <Mini label="Nota" valor={ehNum(seg.score) ? `${fmtScore(seg.score)}/100` : "—"} alerta={!!seg.status && seg.status !== "bom"} />
              <Mini label="HTTPS" valor={seg.https === undefined ? "—" : seg.https ? "Ativo" : "Ausente"} alerta={seg.https === false} />
              <Mini label="Certificado" valor={seg.sslValido === null || seg.sslValido === undefined ? "—" : seg.sslValido ? "Válido" : "Inválido"} alerta={seg.sslValido === false} />
              <Mini label="Expira em" valor={fmtDias(seg.daysToSslExpiry)} alerta={(seg.daysToSslExpiry ?? 999) <= 30} />
            </div>
          )}
        </CardResumo>

        <CardResumo
          titulo="Disponibilidade" icone={<Wifi className="w-4 h-4" />}
          ligado={temDominio} semDados={temDominio && !up}
          textoOff="Domínio não informado." textoSemDados="Ainda não verificado — roda amanhã de manhã."
          onIr={() => onIr("tecnico")}
        >
          {up && (
            <div className="grid grid-cols-2 gap-2">
              <Mini label="Status" valor={(up.status && UP_LABEL[up.status]) ?? "—"} alerta={up.status === "fora_do_ar" || up.status === "erro"} />
              <Mini label="Resposta" valor={fmtMs(up.responseTimeMs)} alerta={(up.responseTimeMs ?? 0) > 3000} />
            </div>
          )}
        </CardResumo>
      </div>

      {/* O que falta para o diagnóstico ficar bom */}
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-xs font-semibold text-muted-foreground mb-2">Fontes deste diagnóstico</p>
        <div className="flex flex-wrap gap-1.5">
          <Pastilha ok={!!seg} label="Segurança" onClick={() => onIr("tecnico")} />
          <Pastilha ok={!!up} label="Disponibilidade" onClick={() => onIr("tecnico")} />
          <Pastilha ok={!!perfQ.data} label="Performance" onClick={() => onIr("tecnico")} />
          <Pastilha ok={!!clarityQ.data} label="Clarity" onClick={() => onIr("performance")} />
          <Pastilha ok={temCtx} label="Contexto" onClick={() => onIr("contexto")} />
          <Pastilha ok={(repQ.data ?? []).length > 0} label={`${(repQ.data ?? []).length} relatório(s)`} onClick={() => onIr("relatorios")} />
        </div>
        {/* Nenhuma fonte é obrigatória — mas dizer o que falta é o que separa
            "diagnóstico parcial" de "diagnóstico errado". */}
        <p className="text-[11px] text-muted-foreground mt-2">{nivelDiagnostico({ seg: !!seg, up: !!up, perf: !!perfQ.data, clarity: !!clarityQ.data, ctx: temCtx })}</p>
        {!clarityOn && (
          <p className="text-[11px] text-muted-foreground mt-1">
            O Clarity não está conectado, então não avaliamos o comportamento real de quem visita o site.
          </p>
        )}
        {!temCtx && (
          <p className="text-[11px] text-muted-foreground mt-1">
            Sem o contexto, o relatório descreve números mas não interpreta —
            <button onClick={() => onIr("contexto")} className="text-accent hover:underline ml-1">preencher agora</button>.
          </p>
        )}
      </div>
    </div>
  );
}

function CardResumo({ titulo, icone, ligado, semDados, textoOff, textoSemDados, onIr, children }: {
  titulo: string; icone: React.ReactNode; ligado: boolean; semDados: boolean;
  textoOff: string; textoSemDados: string; onIr: () => void; children?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="text-accent">{icone}</span>
        <p className="text-sm font-semibold flex-1">{titulo}</p>
        <span className={`text-[10px] px-2 py-0.5 rounded-full ${ligado ? "bg-emerald-500/15 text-emerald-600" : "bg-muted text-muted-foreground"}`}>
          {ligado ? "conectado" : "não configurado"}
        </span>
      </div>
      {!ligado ? <p className="text-xs text-muted-foreground py-2">{textoOff}</p>
        : semDados ? <p className="text-xs text-muted-foreground py-2">{textoSemDados}</p>
        : children}
      <button onClick={onIr} className="text-[11px] text-accent hover:underline self-start flex items-center gap-1 mt-1">
        Ver detalhes <ArrowRight className="w-3 h-3" />
      </button>
    </div>
  );
}

function Mini({ label, valor, alerta }: { label: string; valor: string; alerta?: boolean }) {
  return (
    <div>
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className={`text-base font-semibold tabular-nums ${alerta ? "text-amber-600" : ""}`}>{valor}</p>
    </div>
  );
}

function Pastilha({ ok, label, onClick }: { ok: boolean; label: string; onClick?: () => void }) {
  const cls = `text-[10px] px-2 py-0.5 rounded-full border ${ok ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600" : "border-border text-muted-foreground"}`;
  return onClick ? <button onClick={onClick} className={`${cls} hover:border-accent/40`}>{ok ? "✓" : "○"} {label}</button>
    : <span className={cls}>{ok ? "✓" : "○"} {label}</span>;
}

// ─── Performance técnica ─────────────────────────────────────────────────────

type PerfMetricas = {
  performanceScore?: Talvez; lcp?: Talvez; cls?: Talvez;
  tbt?: Talvez; speedIndex?: Talvez; fcp?: Talvez; tti?: Talvez;
  fullyLoaded?: Talvez; pageSizeBytes?: Talvez; requests?: Talvez;
  accessibilityScore?: Talvez; bestPracticesScore?: Talvez; seoScore?: Talvez;
  structureScore?: null;
};

const fmtMs = (ms: Talvez, vazio = "—") => {
  if (!ehNum(ms)) return vazio;
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`;
};
const fmtKb = (b: Talvez, vazio = "—") => {
  if (!ehNum(b)) return vazio;
  return b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`;
};
/** Faixas do próprio Lighthouse — não invento limiar. */
const corScore = (s: Talvez) => !ehNum(s) ? "text-muted-foreground" : s >= 90 ? "text-emerald-600" : s >= 50 ? "text-amber-600" : "text-red-600";

function AbaPerformance({ accountId, podeConfigurar }: { accountId: number; podeConfigurar: boolean }) {
  const utils = trpc.useUtils();
  const q = trpc.clarity.perfSettings.useQuery({ accountId });
  const snapQ = trpc.clarity.perfUltimo.useQuery({ accountId });
  const [url, setUrl] = useState<string | null>(null);

  const set = trpc.clarity.setPerf.useMutation({
    onSuccess: () => { utils.clarity.perfSettings.invalidate(); utils.clarity.settings.invalidate(); setUrl(null); toast.success("Performance técnica configurada."); },
    onError: (e) => toast.error(e.message),
  });
  const sync = trpc.clarity.perfSync.useMutation({
    onSuccess: (r) => {
      utils.clarity.perfUltimo.invalidate(); utils.clarity.perfSettings.invalidate();
      if (r.ok) toast.success(`Teste concluído — score ${r.score ?? "?"}.`);
      else toast.error(r.mensagem);
    },
    onError: (e) => toast.error(e.message),
  });

  if (q.isLoading) return <Carregando />;
  const cfg = q.data?.cfg;
  const providerPronto = q.data?.providerPronto ?? false;
  const ligado = !!cfg?.performanceEnabled;
  const urlVal = url ?? cfg?.performanceUrl ?? (cfg?.domain ? `https://${cfg.domain.replace(/^https?:\/\//, "")}` : "");
  const snap = snapQ.data;
  const m = (snap?.metricsJson ?? null) as PerfMetricas | null;
  const recs = (Array.isArray(snap?.recommendationsJson) ? snap.recommendationsJson : []) as { titulo: string; descricao: string; economiaMs?: Talvez }[];
  const erro = cfg?.perfLastSyncStatus === "erro";

  return (
    <div className="flex flex-col gap-4">
      {/* A key é de ambiente: dizer isso evita o "por que não funciona?" */}
      {!providerPronto && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 flex gap-2">
          <Zap className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-amber-700">
            <p className="font-medium">PageSpeed sem chave de API</p>
            <p className="text-muted-foreground mt-0.5">
              A medição usa a API do Google, que exige uma chave gratuita (<span className="font-mono">PAGESPEED_API_KEY</span>).
              Sem ela o Google recusa por cota. Dá para configurar a URL agora — os testes passam a rodar assim que a chave existir.
            </p>
          </div>
        </div>
      )}

      {podeConfigurar && (
        <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={ligado} onChange={(e) => set.mutate({ accountId, performanceEnabled: e.target.checked })} />
            Medir a performance técnica deste site
          </label>
          {ligado && (
            <div className="flex items-end gap-2 flex-wrap">
              <div className="flex flex-col gap-1 flex-1 min-w-[240px]">
                <label className="text-[11px] text-muted-foreground">URL testada</label>
                <input value={urlVal} onChange={(e) => setUrl(e.target.value)} placeholder="https://exemplo.com.br/"
                  className="text-sm border border-border rounded-md px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-primary" />
              </div>
              {url !== null && url !== (cfg?.performanceUrl ?? "") && (
                <button onClick={() => set.mutate({ accountId, performanceUrl: url.trim() || null })}
                  className="h-9 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-medium">Salvar URL</button>
              )}
              <button onClick={() => sync.mutate({ accountId })} disabled={sync.isPending || !providerPronto}
                title={!providerPronto ? "Precisa da PAGESPEED_API_KEY" : "Roda um teste real (10–30s)"}
                className="h-9 px-3 rounded-lg border border-border text-xs flex items-center gap-1.5 text-muted-foreground hover:text-foreground disabled:opacity-50">
                {sync.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                {sync.isPending ? "Testando…" : "Testar agora"}
              </button>
            </div>
          )}
        </div>
      )}

      {!ligado && <Vazio icone={<Gauge className="w-8 h-8" />} titulo="Performance técnica não configurada"
        texto={podeConfigurar ? "Ative acima e informe a URL principal do site." : "Peça a um administrador para ativar."} />}

      {ligado && erro && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 flex gap-3">
          <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
          <div><p className="text-sm font-medium text-red-700">Falha no último teste</p>
            <p className="text-xs text-muted-foreground mt-0.5">{cfg?.perfLastSyncError}</p></div>
        </div>
      )}

      {ligado && !snap && !erro && (
        <Vazio icone={<Gauge className="w-8 h-8" />} titulo="Nenhum teste rodado ainda"
          texto="O teste diário roda de manhã — ou clique em Testar agora." />
      )}

      {ligado && snap && m && (
        <>
          <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
            <span className="truncate">{snap.url}</span>
            <span>· {snap.estrategia === "mobile" ? "celular" : "desktop"}</span>
            {cfg?.perfLastSyncAt && <span>· testado em {new Date(cfg.perfLastSyncAt).toLocaleString("pt-BR")}</span>}
            {snap.externalReportUrl && (
              <a href={snap.externalReportUrl} target="_blank" rel="noopener noreferrer" className="ml-auto text-accent hover:underline flex items-center gap-1">
                Ver no PageSpeed <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>

          <div className="rounded-xl border border-border bg-card p-5 flex items-center gap-5 flex-wrap">
            <div className="text-center">
              <p className={`text-5xl font-bold tabular-nums ${corScore(m.performanceScore)}`}>{fmtScore(m.performanceScore)}</p>
              <p className="text-[11px] text-muted-foreground mt-1">Performance</p>
            </div>
            <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-3 min-w-[280px]">
              <Card icone={<Zap className="w-3.5 h-3.5" />} label="LCP" valor={fmtMs(m.lcp)} tom={(m.lcp ?? 0) > 4000 ? "critico" : (m.lcp ?? 0) > 2500 ? "alerta" : undefined} hint="carregamento" />
              <Card icone={<Activity className="w-3.5 h-3.5" />} label="CLS" valor={fmtDec(m.cls, 3)} tom={(m.cls ?? 0) > 0.25 ? "critico" : (m.cls ?? 0) > 0.1 ? "alerta" : undefined} hint="estabilidade" />
              <Card icone={<Clock className="w-3.5 h-3.5" />} label="TBT" valor={fmtMs(m.tbt)} tom={(m.tbt ?? 0) > 600 ? "critico" : (m.tbt ?? 0) > 200 ? "alerta" : undefined} hint="travamento" />
              <Card icone={<Gauge className="w-3.5 h-3.5" />} label="Speed Index" valor={fmtMs(m.speedIndex)} />
              <Card icone={<Clock className="w-3.5 h-3.5" />} label="FCP" valor={fmtMs(m.fcp)} />
              <Card icone={<Clock className="w-3.5 h-3.5" />} label="Carregado" valor={fmtMs(m.fullyLoaded)} />
              <Card icone={<FileText className="w-3.5 h-3.5" />} label="Peso" valor={fmtKb(m.pageSizeBytes)} />
              <Card icone={<FileText className="w-3.5 h-3.5" />} label="Requisições" valor={fmtInt(m.requests)} />
            </div>
          </div>

          {recs.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs font-semibold text-muted-foreground mb-2">Recomendações (maior ganho primeiro)</p>
              <div className="flex flex-col gap-2">
                {recs.map((r, i) => (
                  <div key={i} className="border-b border-border/50 last:border-b-0 pb-2 last:pb-0">
                    <div className="flex items-start gap-2">
                      <p className="text-xs font-medium flex-1">{r.titulo}</p>
                      {ehNum(r.economiaMs) && r.economiaMs > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 flex-shrink-0">
                          −{fmtMs(r.economiaMs)}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{r.descricao}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="text-[11px] text-muted-foreground">
            Medição do PageSpeed Insights (Lighthouse), em conexão de celular simulada.
            Structure score e waterfall não aparecem aqui — são do GTmetrix, que pode ser plugado depois.
          </p>
        </>
      )}
    </div>
  );
}

// ─── Segurança básica ────────────────────────────────────────────────────────
// Checagem própria (sem fornecedor, sem cota): o que dá para saber olhando o
// site de fora. NÃO é auditoria de segurança — a tela diz isso.

type MetSeg = {
  status?: "bom" | "atencao" | "critico"; score?: Talvez; https?: boolean;
  redirecionaParaHttps?: boolean | null; sslValido?: boolean | null;
  certificateExpiresAt?: string | null; daysToSslExpiry?: Talvez; emissor?: string | null;
  headers?: HeaderCheck[]; achados?: string[]; recomendacoes?: string[];
};
type HeaderCheck = { nome: string; presente: boolean; valor: string | null; peso: number; recomendacao: string };

const CorStatus: Record<string, string> = {
  bom: "text-emerald-600", atencao: "text-amber-600", critico: "text-red-600",
};
const LabelStatus: Record<string, string> = { bom: "Bom", atencao: "Atenção", critico: "Crítico" };

function AbaSeguranca({ accountId, podeConfigurar }: { accountId: number; podeConfigurar: boolean }) {
  const utils = trpc.useUtils();
  const q = trpc.clarity.saude.useQuery({ accountId });
  const cfgQ = trpc.clarity.settings.useQuery({ accountId });
  const checar = trpc.clarity.checarSite.useMutation({
    onSuccess: () => { utils.clarity.saude.invalidate(); toast.success("Site verificado."); },
    onError: (e) => toast.error(e.message),
  });

  if (q.isLoading) return <Carregando />;
  const snap = q.data?.seguranca;
  const m = (snap?.metricsJson ?? null) as MetSeg | null;
  // Mesmo cuidado das métricas: o JSON pode não trazer as listas.
  const issues = (snap?.issuesJson ?? null) as { achados?: string[]; headers?: HeaderCheck[] } | null;
  const recs = (Array.isArray(snap?.recommendationsJson) ? snap.recommendationsJson : []) as string[];
  const temDominio = !!(cfgQ.data?.domain || cfgQ.data?.performanceUrl);

  if (!temDominio) {
    return <Vazio icone={<ShieldCheck className="w-8 h-8" />} titulo="Domínio do site não configurado"
      texto="Informe o domínio principal em Performance técnica ou na configuração do Clarity para verificar a segurança." />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 flex-wrap">
        <p className="text-xs text-muted-foreground flex-1">
          {snap ? `Verificado em ${new Date(snap.updatedAt ?? snap.createdAt).toLocaleString("pt-BR")} · ${snap.url}` : "Ainda não verificado."}
        </p>
        {podeConfigurar && (
          <button onClick={() => checar.mutate({ accountId })} disabled={checar.isPending}
            className="h-8 px-3 rounded-lg border border-border text-xs flex items-center gap-1.5 text-muted-foreground hover:text-foreground disabled:opacity-60">
            {checar.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Verificar agora
          </button>
        )}
      </div>

      {!snap ? (
        <Vazio icone={<ShieldCheck className="w-8 h-8" />} titulo="Nenhuma verificação ainda"
          texto="A verificação roda todo dia de manhã — ou clique em Verificar agora." />
      ) : m && (
        <>
          <div className="rounded-xl border border-border bg-card p-5 flex items-center gap-5 flex-wrap">
            <div className="text-center">
              <p className={`text-5xl font-bold tabular-nums ${(m.status && CorStatus[m.status]) || "text-muted-foreground"}`}>{fmtScore(m.score)}</p>
              <p className={`text-[11px] mt-1 font-medium ${(m.status && CorStatus[m.status]) || "text-muted-foreground"}`}>{(m.status && LabelStatus[m.status]) || "Não verificado"}</p>
            </div>
            <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 gap-3 min-w-[260px]">
              <Card icone={<Lock className="w-3.5 h-3.5" />} label="HTTPS" valor={m.https ? "Ativo" : "Ausente"} tom={m.https ? undefined : "critico"} />
              <Card icone={<ShieldCheck className="w-3.5 h-3.5" />} label="Certificado" valor={m.sslValido === null ? "—" : m.sslValido ? "Válido" : "Inválido"} tom={m.sslValido === false ? "critico" : undefined} />
              <Card icone={<Clock className="w-3.5 h-3.5" />} label="Expira em"
                valor={ehNum(m.daysToSslExpiry) ? `${fmtInt(m.daysToSslExpiry)} dias` : "—"}
                tom={(m.daysToSslExpiry ?? 999) <= 7 ? "critico" : (m.daysToSslExpiry ?? 999) <= 30 ? "alerta" : undefined}
                hint={m.emissor ?? undefined} />
              <Card icone={<ArrowRight className="w-3.5 h-3.5" />} label="http → https"
                valor={m.redirecionaParaHttps === null ? "—" : m.redirecionaParaHttps ? "Sim" : "Não"}
                tom={m.redirecionaParaHttps === false ? "alerta" : undefined} />
            </div>
          </div>

          {issues?.headers && (
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs font-semibold text-muted-foreground mb-2">Headers de segurança</p>
              <div className="flex flex-col gap-1.5">
                {issues.headers.map((h) => (
                  <div key={h.nome} className="flex items-start gap-2 text-xs border-b border-border/40 last:border-b-0 pb-1.5 last:pb-0">
                    <span className={`mt-0.5 flex-shrink-0 ${h.presente ? "text-emerald-600" : "text-muted-foreground/50"}`}>
                      {h.presente ? "✓" : "✕"}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className={h.presente ? "text-foreground" : "text-muted-foreground"}>{h.nome}</p>
                      {h.presente ? (
                        <p className="text-[10px] text-muted-foreground font-mono break-words">{h.valor}</p>
                      ) : (
                        <p className="text-[10px] text-muted-foreground">{h.recomendacao}</p>
                      )}
                    </div>
                    {!h.presente && <span className="text-[10px] text-muted-foreground flex-shrink-0">−{h.peso}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {recs.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs font-semibold text-muted-foreground mb-2">O que fazer</p>
              <ul className="flex flex-col gap-1.5">
                {recs.map((r, i) => (
                  <li key={i} className="text-xs text-muted-foreground flex gap-1.5">
                    <span className="text-accent flex-shrink-0">·</span><span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Escopo honesto: dizer o que isto NÃO é evita falsa sensação de segurança. */}
          <p className="text-[11px] text-muted-foreground">
            Esta análise verifica configurações públicas básicas, como HTTPS, certificado e headers de segurança.
            Não substitui auditoria de segurança completa.
          </p>
        </>
      )}
    </div>
  );
}

// ─── Uptime ──────────────────────────────────────────────────────────────────

type MetUp = {
  status?: "no_ar" | "lento" | "bloqueado" | "erro" | "fora_do_ar";
  statusCode?: Talvez; responseTimeMs?: Talvez; finalUrl?: string | null;
  redirects?: Talvez; errorMessage?: string | null; checkedAt?: string;
};

const UP_LABEL: Record<string, string> = {
  no_ar: "No ar", lento: "No ar, mas lento", bloqueado: "Acesso bloqueado",
  erro: "Respondeu com erro", fora_do_ar: "Fora do ar",
};
const UP_COR: Record<string, string> = {
  no_ar: "text-emerald-600", lento: "text-amber-600", bloqueado: "text-muted-foreground",
  erro: "text-amber-600", fora_do_ar: "text-red-600",
};

function AbaUptime({ accountId, podeConfigurar }: { accountId: number; podeConfigurar: boolean }) {
  const utils = trpc.useUtils();
  const q = trpc.clarity.saude.useQuery({ accountId });
  const serieQ = trpc.clarity.uptimeSerie.useQuery({ accountId, limite: 14 });
  const cfgQ = trpc.clarity.settings.useQuery({ accountId });
  const checar = trpc.clarity.checarSite.useMutation({
    onSuccess: () => { utils.clarity.saude.invalidate(); utils.clarity.uptimeSerie.invalidate(); toast.success("Site verificado."); },
    onError: (e) => toast.error(e.message),
  });

  if (q.isLoading) return <Carregando />;
  const snap = q.data?.uptime;
  const m = (snap?.metricsJson ?? null) as MetUp | null;
  const temDominio = !!(cfgQ.data?.domain || cfgQ.data?.performanceUrl);
  const serie = (serieQ.data ?? []).map((s) => ({ dia: s.dia, m: s.metricsJson as MetUp }));

  if (!temDominio) {
    return <Vazio icone={<Wifi className="w-8 h-8" />} titulo="Domínio do site não configurado"
      texto="Informe o domínio principal para monitorar se o site está no ar." />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 flex-wrap">
        <p className="text-xs text-muted-foreground flex-1">
          {snap ? `Verificado em ${new Date(snap.updatedAt ?? snap.createdAt).toLocaleString("pt-BR")}` : "Ainda não verificado."}
        </p>
        {podeConfigurar && (
          <button onClick={() => checar.mutate({ accountId })} disabled={checar.isPending}
            className="h-8 px-3 rounded-lg border border-border text-xs flex items-center gap-1.5 text-muted-foreground hover:text-foreground disabled:opacity-60">
            {checar.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Verificar agora
          </button>
        )}
      </div>

      {!snap ? (
        <Vazio icone={<Wifi className="w-8 h-8" />} titulo="Nenhuma verificação ainda"
          texto="A verificação roda todo dia de manhã — ou clique em Verificar agora." />
      ) : m && (
        <>
          <div className="rounded-xl border border-border bg-card p-5 flex items-center gap-6 flex-wrap">
            <div>
              <p className={`text-2xl font-bold ${(m.status && UP_COR[m.status]) || "text-muted-foreground"}`}>{(m.status && UP_LABEL[m.status]) || "Não verificado"}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {m.statusCode ? `HTTP ${m.statusCode}` : m.errorMessage ?? "sem resposta"}
              </p>
            </div>
            <div className="flex-1 grid grid-cols-3 gap-3 min-w-[240px]">
              <Card icone={<Zap className="w-3.5 h-3.5" />} label="Tempo de resposta"
                valor={fmtMs(m.responseTimeMs)}
                tom={(m.responseTimeMs ?? 0) > 3000 ? "alerta" : undefined} />
              <Card icone={<ArrowRight className="w-3.5 h-3.5" />} label="Redirects" valor={String(m.redirects)} />
              <Card icone={<Globe className="w-3.5 h-3.5" />} label="Destino final" valor={m.finalUrl ? new URL(m.finalUrl).hostname : "—"} />
            </div>
          </div>

          {/* 403/401 é WAF, não queda: dizer isso evita caça a fantasma. */}
          {m.status === "bloqueado" && (
            <div className="rounded-xl border border-border bg-muted/30 p-3 flex gap-2">
              <ShieldAlert className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground">
                O site respondeu <span className="font-medium text-foreground">HTTP {m.statusCode}</span> à nossa verificação.
                Normalmente é proteção contra robôs (WAF) ou área restrita — não significa que o site esteja fora do ar
                para quem visita. Não geramos alerta neste caso.
              </p>
            </div>
          )}

          {serie.length > 1 && (
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs font-semibold text-muted-foreground mb-2">Últimos {serie.length} dias</p>
              <div className="flex gap-1 flex-wrap">
                {serie.slice().reverse().map((s) => (
                  <div key={s.dia} title={`${s.dia} · ${(s.m?.status && UP_LABEL[s.m.status]) || "?"} · ${fmtMs(s.m?.responseTimeMs, "?")}`}
                    className={`h-8 flex-1 min-w-[10px] rounded ${
                      s.m?.status === "no_ar" ? "bg-emerald-500/70"
                        : s.m?.status === "lento" ? "bg-amber-500/70"
                        : s.m?.status === "bloqueado" ? "bg-muted-foreground/30"
                        : "bg-red-500/70"}`} />
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground mt-1.5">
                Cada barra é um dia. Verde = no ar · âmbar = lento · vermelho = fora do ar · cinza = bloqueado.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Diz o que dá para concluir com o que existe. Nenhuma fonte é obrigatória —
 * a frase muda conforme o que está conectado, em vez de exigir tudo.
 */
function nivelDiagnostico(f: { seg: boolean; up: boolean; perf: boolean; clarity: boolean; ctx: boolean }): string {
  const tem: string[] = [];
  if (f.perf) tem.push("performance");
  if (f.seg) tem.push("segurança básica");
  if (f.up) tem.push("disponibilidade");
  if (f.clarity) tem.push("comportamento no site");
  if (!tem.length) return "Nenhuma verificação rodou ainda — informe o domínio para começar.";

  const lista = tem.length > 1 ? `${tem.slice(0, -1).join(", ")} e ${tem[tem.length - 1]}` : tem[0];
  const base = f.clarity && f.perf ? "Diagnóstico de jornada disponível"
    : f.clarity ? "Diagnóstico de comportamento disponível"
    : f.perf || f.seg || f.up ? "Diagnóstico técnico disponível"
    : "Diagnóstico parcial";
  return `${base} com ${lista}.${f.ctx ? "" : " O contexto do cliente melhora a interpretação, mas não é obrigatório."}`;
}

/**
 * Pastilha de fonte no Resumo. Cinza quando ausente, âmbar quando precisa de
 * ação — nunca banner vermelho: o objetivo é informar sem dominar a página.
 * O motivo vai no title, não em card próprio.
 */
const TOM_PASTILHA: Record<StatusFonte, string> = {
  ok:      "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400",
  atencao: "bg-amber-500/12 text-amber-700 dark:text-amber-400",
  erro:    "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  ausente: "bg-muted text-muted-foreground/60",
};

function PastilhaFonte({ fonte }: { fonte: Fonte }) {
  const marca = fonte.status === "ok" ? "●" : fonte.status === "ausente" ? "○" : "▲";
  return (
    <span title={fonte.porque ?? fonte.rotulo}
      className={`text-[11px] px-2 py-0.5 rounded-full ${TOM_PASTILHA[fonte.status]}`}
      style={{ cursor: fonte.porque ? "help" : "default" }}>
      {marca} {fonte.rotulo}
    </span>
  );
}

// ─── Aba Performance ─────────────────────────────────────────────────────────

/**
 * Comportamento e acesso do site. Hoje só Clarity; o slot de GA4 fica pronto e
 * OCULTO — fonte não conectada não vira card vazio (regra da F1).
 */
function AbaPerformanceSite({ accountId, podeConfigurar, onConfigurar, destaque }: {
  accountId: number; podeConfigurar: boolean; onConfigurar: () => void; destaque?: SecaoSite;
}) {
  const cfgQ = trpc.clarity.settings.useQuery({ accountId });
  const snapQ = trpc.clarity.ultimo.useQuery({ accountId });
  const fontesQ = trpc.fontes.doCliente.useQuery({ accountId });
  const ga4Q = trpc.siteDiag.ga4Snapshot.useQuery({ accountId });

  if (cfgQ.isLoading || ga4Q.isLoading) return <Carregando />;
  const cfg = cfgQ.data;
  const configurado = !!cfg?.enabled && !!cfg?.hasToken;
  const snap = snapQ.data;
  const m = (snap?.metricsJson ?? null) as Metricas | null;
  const fonteClarity = fontesQ.data?.find((f) => f.chave === "clarity");
  const fonteGa4 = fontesQ.data?.find((f) => f.chave === "ga4");
  const erroSync = fonteClarity?.status === "erro";
  const sessoes = m?.sessions ?? 0;

  const g7 = (ga4Q.data?.d7?.metricsJson ?? null) as MetricasGA4 | null;
  const g30 = (ga4Q.data?.d30?.metricsJson ?? null) as MetricasGA4 | null;
  const gListas = (ga4Q.data?.d7?.issuesJson ?? null) as ListasGA4 | null;
  const temGa4 = !!g7;

  /**
   * A porta é "Clarity OU GA4". Antes era só Clarity — e quatro clientes com
   * GA4 lido com sucesso (Ultra Malhas, BAESH, MNBR, ELWING) viam "Clarity não
   * configurado" e nada mais. Fonte nova não pode ficar refém da antiga.
   */
  if (!configurado && !temGa4) {
    return (
      <Vazio icone={<Activity className="w-8 h-8" />} titulo="Nenhuma fonte de performance conectada"
        texto={podeConfigurar
          ? "Conecte o Microsoft Clarity para ver comportamento, ou vincule uma propriedade do Google Analytics para ver tráfego e aquisição."
          : "Peça a um administrador para conectar o Clarity ou o Google Analytics deste cliente."}
        acao={podeConfigurar ? <button onClick={onConfigurar} className="text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-medium">Configurar Clarity</button> : undefined} />
    );
  }

  const estadoComportamento = !snap ? "Sem snapshot ainda — o primeiro sai amanhã de manhã."
    : sessoes === 0 ? "Nenhuma sessão registrada no período."
    : `${fmtNum(m?.sessions)} sessões · ${fmtNum(m?.users)} usuários · ${fmtPct(m?.averageScrollDepth)} de scroll médio.`;

  return (
    <div className="flex flex-col gap-3">
      {/* Erro não esconde o histórico: avisa em âmbar e mantém os dados abaixo. */}
      {configurado && erroSync && (
        <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5" /> {fonteClarity?.porque} Os números abaixo são do último snapshot que deu certo.
        </p>
      )}

      {temGa4 && <BlocosGA4 m7={g7} m30={g30} listas={gListas} fonteErro={fonteGa4?.status === "erro" ? fonteGa4.porque : undefined} />}

      {configurado && <Secao id="comportamento" titulo="Comportamento" icone={<Activity className="w-4 h-4" />}
        estado={estadoComportamento} aberta destaque={destaque === "comportamento"}>
        {!snap ? (
          <FonteAusente texto="Nenhum snapshot foi tirado deste cliente ainda." />
        ) : sessoes === 0 ? (
          <FonteAusente texto="O Clarity respondeu, mas não houve tráfego no período. Se não era esperado, vale conferir se o script está instalado." />
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card icone={<Users className="w-3.5 h-3.5" />} label="Sessões" valor={fmtNum(m?.sessions)}
              hint={ehNum(m?.botSessions) ? `${fmtNum(m?.botSessions)} de bots` : undefined} />
            <Card icone={<Eye className="w-3.5 h-3.5" />} label="Usuários" valor={fmtNum(m?.users)} />
            <Card icone={<Clock className="w-3.5 h-3.5" />} label="Tempo médio" valor={fmtSeg(m?.averageSessionDuration)} />
            <Card icone={<TrendingUp className="w-3.5 h-3.5" />} label="Páginas por sessão" valor={fmtNum(m?.pagesPerSession)} />
            <Card icone={<ArrowDownWideNarrow className="w-3.5 h-3.5" />} label="Scroll médio" valor={fmtPct(m?.averageScrollDepth)} />
            <Card icone={<MousePointerClick className="w-3.5 h-3.5" />} label="Cliques mortos" valor={fmtNum(m?.deadClicks)} tom={(m?.deadClicks ?? 0) > 0 ? "alerta" : undefined} />
            <Card icone={<MousePointerClick className="w-3.5 h-3.5" />} label="Rage clicks" valor={fmtNum(m?.rageClicks)} tom={(m?.rageClicks ?? 0) > 0 ? "alerta" : undefined} />
            <Card icone={<AlertTriangle className="w-3.5 h-3.5" />} label="Erros de JS" valor={fmtNum(m?.javascriptErrors)} tom={(m?.javascriptErrors ?? 0) > 0 ? "critico" : undefined} />
          </div>
        )}
      </Secao>}

      {configurado && snap && sessoes > 0 && (
        <Secao id="paginas" titulo="Páginas e origens" icone={<Globe className="w-4 h-4" />}
          estado="De onde vem o tráfego e onde ele para." destaque={destaque === "paginas"}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Lista titulo="Páginas mais vistas" itens={((snap.topPagesJson ?? []) as { url: string; sessions: number | null }[]).map((p) => ({ rotulo: p.url, valor: fmtNum(p.sessions) }))}
              vazio="A API não retornou páginas neste período." />
            <Lista titulo="Origens do tráfego" itens={((snap.sourcesJson ?? []) as { fonte: string; sessions: number | null }[]).map((x) => ({ rotulo: x.fonte, valor: fmtNum(x.sessions) }))}
              vazio="A API não retornou origens neste período." />
          </div>
        </Secao>
      )}

      <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap pt-1">
        {configurado && cfg?.lastSyncAt && <span>Clarity · último sync: {new Date(cfg.lastSyncAt).toLocaleString("pt-BR")}</span>}
        {snap && <span>Período: últimas {snap.dias * 24}h</span>}
        <span className="ml-auto">Cota hoje: {cfg?.apiCallsCount ?? 0}/10</span>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Gravações e mapas de calor não aparecem aqui: a API de exportação do Clarity não os disponibiliza.
      </p>
    </div>
  );
}

/**
 * Blocos do Google Analytics na aba Performance.
 *
 * GA4 responde "quantos, de onde vieram, para onde foram" — volume e aquisição.
 * O Clarity, logo abaixo, responde "como se comportaram". São perguntas
 * diferentes e por isso ficam em blocos separados, cada um dizendo sua fonte.
 *
 * NUNCA lado a lado como se medissem a mesma coisa: na UMA o GA4 marca 8.572
 * sessões em 7 dias e o Clarity 649 em ~24h, com amostragem própria. Números
 * juntos fariam o time discutir qual está certo em vez de usar os dois.
 */
function BlocosGA4({ m7, m30, listas, fonteErro }: {
  m7: MetricasGA4 | null; m30: MetricasGA4 | null; listas: ListasGA4 | null; fonteErro?: string;
}) {
  const cards = cardsDeTrafego(m7);
  const blocos = listasDe(listas);
  const contexto = contexto30d(m7, m30);
  const vazio = semTrafego(m7);
  const pouco = amostraPequena(m7);

  const Variacao = ({ v }: { v: CardGA4["variacao"] }) => {
    if (!v) return null;
    const cor = v.sobe ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400";
    return <span className={`text-[11px] ${cor}`}>{v.sobe ? "▲" : "▼"} {Math.abs(v.pct).toFixed(0)}%</span>;
  };

  return (
    <Secao id="ga4" titulo="Tráfego e aquisição" icone={<Globe className="w-4 h-4" />}
      estado={vazio ? "Google Analytics conectado, sem tráfego no período." : (contexto ?? "Dados do Google Analytics.")}
      alerta={fonteErro ? "última leitura falhou" : undefined} aberta>
      {/* Erro não esconde o histórico: avisa e mantém o que foi lido antes. */}
      {fonteErro && (
        <p className="text-xs text-amber-600 dark:text-amber-400 mb-3">{fonteErro} Os números abaixo são da última leitura que deu certo.</p>
      )}

      {vazio ? (
        <FonteAusente texto="A propriedade respondeu, mas não houve sessões no período. Se não era esperado, vale conferir se a tag do Analytics está no site." />
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {cards.map((c) => (
              <div key={c.chave} className="rounded-lg border border-border bg-background px-3 py-2.5">
                <p className="text-[11px] text-muted-foreground">{c.rotulo}</p>
                <div className="flex items-baseline gap-1.5 mt-0.5">
                  <span className="text-lg font-medium text-foreground">{c.valor}</span>
                  <Variacao v={c.variacao} />
                </div>
              </div>
            ))}
          </div>

          {/* Amostra pequena avisa em vez de deixar alguém concluir de 31 sessões. */}
          {pouco && (
            <p className="text-[11px] text-muted-foreground mt-2.5">
              Volume baixo no período — percentuais oscilam bastante com poucas sessões. Leia como indício, não como tendência.
            </p>
          )}

          {blocos.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
              {blocos.map((b: ListaGA4) => (
                <div key={b.titulo} className="rounded-lg border border-border overflow-hidden">
                  <div className="px-3 py-2 border-b border-border flex items-center justify-between">
                    <p className="text-xs font-medium text-foreground">{b.titulo}</p>
                    <span className="text-[10px] text-muted-foreground/70">{b.fonte}</span>
                  </div>
                  <ul>
                    {b.itens.map((i) => (
                      <li key={i.rotulo} className="flex items-center justify-between gap-3 px-3 py-1.5 text-xs border-b border-border/40 last:border-0">
                        <span className="text-muted-foreground truncate" title={i.rotulo}>{i.rotulo}</span>
                        <span className="text-foreground flex-shrink-0">{i.valor}</span>
                      </li>
                    ))}
                  </ul>
                  {b.restantes > 0 && (
                    <p className="px-3 py-1.5 text-[11px] text-muted-foreground/70">e mais {b.restantes}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {(listas?.limitacoes ?? []).map((l) => (
        <p key={l} className="text-[11px] text-muted-foreground/70 mt-3">{l}</p>
      ))}
    </Secao>
  );
}

// ─── Aba Técnico ─────────────────────────────────────────────────────────────

/**
 * Junta as três abas técnicas antigas em seções. Os painéis internos NÃO foram
 * reescritos — são os mesmos componentes de antes, agora recolhíveis. Reescrever
 * painel que funciona é o retrabalho que esta frente existe para evitar.
 */
function AbaTecnico({ accountId, podeConfigurar, destaque }: {
  accountId: number; podeConfigurar: boolean; destaque?: SecaoSite;
}) {
  const cfgQ = trpc.clarity.settings.useQuery({ accountId });
  const perfQ = trpc.clarity.perfUltimo.useQuery({ accountId });
  const saudeQ = trpc.clarity.saude.useQuery({ accountId });
  const fontesQ = trpc.fontes.doCliente.useQuery({ accountId });

  if (cfgQ.isLoading) return <Carregando />;
  const cfg = cfgQ.data;
  const temDominio = !!(cfg?.domain || cfg?.performanceUrl);
  const perfOn = !!cfg?.performanceEnabled;

  if (!temDominio && !perfOn) {
    return (
      <Vazio icone={<Globe className="w-8 h-8" />} titulo="Site ainda não configurado para este cliente"
        texto="Informe o domínio principal para verificar segurança e disponibilidade, e ative a performance técnica para medir o carregamento." />
    );
  }

  const pm = (perfQ.data?.metricsJson ?? null) as PerfMetricas | null;
  const seg = (saudeQ.data?.seguranca?.metricsJson ?? null) as MetSeg | null;
  const up = (saudeQ.data?.uptime?.metricsJson ?? null) as MetUp | null;
  const fonte = (c: string) => fontesQ.data?.find((f) => f.chave === c);
  const erroPageSpeed = fonte("pagespeed")?.status === "erro" ? fonte("pagespeed")?.porque : undefined;

  return (
    <div className="flex flex-col gap-3">
      <Secao id="carregamento" titulo="Carregamento" icone={<Gauge className="w-4 h-4" />}
        estado={ehNum(pm?.performanceScore) ? `Nota ${fmtScore(pm?.performanceScore)} · LCP ${fmtMs(pm?.lcp)} · CLS ${fmtDec(pm?.cls)}` : "Nenhum teste de performance rodado ainda."}
        alerta={erroPageSpeed ? "última medição falhou" : undefined}
        aberta={destaque !== "seguranca" && destaque !== "disponibilidade"} destaque={destaque === "carregamento"}>
        <AbaPerformance accountId={accountId} podeConfigurar={podeConfigurar} />
      </Secao>

      <Secao id="seguranca" titulo="Segurança" icone={<ShieldCheck className="w-4 h-4" />}
        estado={ehNum(seg?.score) ? `Nota ${fmtScore(seg?.score)} · ${seg?.https ? "HTTPS ativo" : "sem HTTPS"}${ehNum(seg?.daysToSslExpiry) ? ` · certificado expira em ${seg?.daysToSslExpiry}d` : ""}` : "Nenhuma verificação de segurança ainda."}
        destaque={destaque === "seguranca"}>
        <AbaSeguranca accountId={accountId} podeConfigurar={podeConfigurar} />
      </Secao>

      <Secao id="disponibilidade" titulo="Disponibilidade" icone={<Wifi className="w-4 h-4" />}
        estado={up?.status ? `${UP_LABEL[up.status] ?? up.status}${ehNum(up?.responseTimeMs) ? ` · resposta em ${fmtMs(up?.responseTimeMs)}` : ""}` : "Nenhuma verificação de disponibilidade ainda."}
        destaque={destaque === "disponibilidade"}>
        <AbaUptime accountId={accountId} podeConfigurar={podeConfigurar} />
      </Secao>

      <p className="text-[11px] text-muted-foreground">
        Core Web Vitals disponíveis: LCP e CLS (TBT entra como referência de laboratório).
        INP depende de dados de campo do CrUX, que ainda não coletamos.
      </p>
    </div>
  );
}
