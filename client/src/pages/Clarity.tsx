/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Clarity — comportamento no site, por cliente
 * ─────────────────────────────────────────────────────────────────────────────
 *  Aba do Tracker (irmã de Dashboard/Campanhas/Relatórios), lendo o cliente
 *  ativo do ActiveAccountContext.
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
} from "lucide-react";
import { toast } from "sonner";
import { MetaDashboardLayout } from "@/components/MetaDashboardLayout";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useActiveAccount } from "@/contexts/ActiveAccountContext";
import { canManageContent } from "@shared/permissions";

const fmtNum = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const fmtSeg = (s: number | null | undefined) => {
  if (s === null || s === undefined) return "—";
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${Math.round(s % 60)}s` : `${Math.round(s)}s`;
};
const fmtPct = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `${Math.round(n)}%`);

type Metricas = {
  sessions: number | null; botSessions: number | null; users: number | null;
  pagesPerSession: number | null; averageScrollDepth: number | null;
  averageSessionDuration: number | null; deadClicks: number | null;
  rageClicks: number | null; quickBacks: number | null;
  javascriptErrors: number | null; errorClicks: number | null;
  excessiveScroll: number | null;
};

export default function Clarity() {
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
  const [aba, setAba] = useState<"site" | "contexto" | "relatorios" | "chat">("site");

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
      <MetaDashboardLayout title="Clarity">
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
    <MetaDashboardLayout title="Clarity">
      <div className="p-6 md:p-8 flex flex-col gap-5 max-w-6xl">
        <header className="flex items-start gap-3 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <h1 className="text-xl font-semibold flex items-center gap-2">
              <Activity className="w-5 h-5 text-accent" /> Site & Jornada
            </h1>
            <p className="text-sm text-muted-foreground">
              {activeAccount?.accountName ?? "Cliente"} · Microsoft Clarity
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
          {([["site", "Comportamento", Activity], ["contexto", "Contexto", NotebookPen], ["relatorios", "Relatórios", FileText], ["chat", "Perguntar", MessageSquare]] as const).map(([v, lbl, Ic]) => (
            <button key={v} onClick={() => setAba(v)}
              className={`px-4 py-2 text-sm transition border-b-2 -mb-px flex items-center gap-1.5 ${aba === v ? "border-accent text-accent font-medium" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
              <Ic className="w-3.5 h-3.5" /> {lbl}
            </button>
          ))}
        </div>

        {aba === "contexto" && <AbaContexto accountId={activeAccountId} podeEditar={podeConfigurar} />}
        {aba === "relatorios" && <AbaRelatorios accountId={activeAccountId} podeGerar={podeConfigurar} />}
        {aba === "chat" && <AbaChat accountId={activeAccountId} nome={activeAccount?.accountName ?? "este cliente"} podeLimpar={podeConfigurar} />}

        {aba === "site" && <>
        {/* ESTADO 1 — sem Clarity configurado */}
        {!cfgQ.isLoading && !configurado && (
          <Vazio icone={<Activity className="w-8 h-8" />} titulo="Clarity ainda não configurado para este cliente"
            texto={podeConfigurar
              ? "Configure o token do projeto para começar a acompanhar o comportamento no site."
              : "Peça a um administrador para configurar o Clarity deste cliente."}
            acao={podeConfigurar ? <button onClick={() => setConfig(true)} className="text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-medium">Configurar Clarity</button> : undefined} />
        )}

        {/* ESTADO 4 — erro de conexão/token */}
        {configurado && erroSync && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 flex gap-3">
            <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-red-700">Falha no último sync</p>
              <p className="text-xs text-muted-foreground mt-0.5">{cfg?.lastSyncError}</p>
            </div>
          </div>
        )}

        {configurado && (
          <>
            <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
              <span className={`inline-flex items-center gap-1.5 ${erroSync ? "text-red-600" : "text-emerald-600"}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${erroSync ? "bg-red-500" : "bg-emerald-500"}`} />
                {erroSync ? "Com erro" : "Conectado"}
              </span>
              {cfg?.lastSyncAt && <span>Último sync: {new Date(cfg.lastSyncAt).toLocaleString("pt-BR")}</span>}
              {snap && <span>Período: últimas {snap.dias * 24}h (até {new Date(snap.rangeEnd ?? snap.createdAt).toLocaleString("pt-BR")})</span>}
              <span className="ml-auto">Cota hoje: {cfg?.apiCallsCount ?? 0}/10</span>
            </div>

            {/* ESTADO 2 — configurado, sem dados ainda */}
            {!snapQ.isLoading && !snap && (
              <Vazio icone={<RefreshCw className="w-8 h-8" />} titulo="Sem dados ainda"
                texto="Nenhum snapshot foi tirado deste cliente. O primeiro sai automaticamente amanhã de manhã — ou clique em Sincronizar."
              />
            )}

            {/* ESTADO 5 — snapshot existe, mas o período veio vazio */}
            {snap && (m?.sessions ?? 0) === 0 && (
              <Vazio icone={<Eye className="w-8 h-8" />} titulo="Nenhuma sessão no período"
                texto="O Clarity respondeu, mas não houve tráfego registrado nas últimas horas. Se isso não era esperado, vale conferir se o script está instalado no site." />
            )}

            {/* ESTADO 3 — dados */}
            {snap && (m?.sessions ?? 0) > 0 && m && (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Card icone={<Users className="w-3.5 h-3.5" />} label="Sessões" valor={fmtNum(m.sessions)}
                    hint={m.botSessions !== null ? `${fmtNum(m.botSessions)} de bots` : undefined} />
                  <Card icone={<Eye className="w-3.5 h-3.5" />} label="Usuários" valor={fmtNum(m.users)} />
                  <Card icone={<Clock className="w-3.5 h-3.5" />} label="Tempo médio" valor={fmtSeg(m.averageSessionDuration)} />
                  <Card icone={<TrendingUp className="w-3.5 h-3.5" />} label="Páginas por sessão" valor={fmtNum(m.pagesPerSession)} />
                  <Card icone={<ArrowDownWideNarrow className="w-3.5 h-3.5" />} label="Scroll médio" valor={fmtPct(m.averageScrollDepth)} />
                  <Card icone={<MousePointerClick className="w-3.5 h-3.5" />} label="Cliques mortos" valor={fmtNum(m.deadClicks)} tom={(m.deadClicks ?? 0) > 0 ? "alerta" : undefined} />
                  <Card icone={<MousePointerClick className="w-3.5 h-3.5" />} label="Rage clicks" valor={fmtNum(m.rageClicks)} tom={(m.rageClicks ?? 0) > 0 ? "alerta" : undefined} />
                  <Card icone={<AlertTriangle className="w-3.5 h-3.5" />} label="Erros de JS" valor={fmtNum(m.javascriptErrors)} tom={(m.javascriptErrors ?? 0) > 0 ? "critico" : undefined} />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <Lista titulo="Páginas mais vistas" itens={((snap.topPagesJson ?? []) as { url: string; sessions: number | null }[]).map((p) => ({ rotulo: p.url, valor: fmtNum(p.sessions) }))}
                    vazio="A API não retornou páginas neste período." />
                  <Lista titulo="Origens do tráfego" itens={((snap.sourcesJson ?? []) as { fonte: string; sessions: number | null }[]).map((s) => ({ rotulo: s.fonte, valor: fmtNum(s.sessions) }))}
                    vazio="A API não retornou origens neste período." />
                </div>

                <p className="text-[11px] text-muted-foreground">
                  Gravações e mapas de calor não aparecem aqui: a API de exportação do Clarity não os disponibiliza —
                  só o painel do próprio Clarity mostra.
                </p>
              </>
            )}
          </>
        )}

        </>}

        {aba === "site" && (cfgQ.isLoading || snapQ.isLoading) && (
          <div className="flex items-center gap-2 py-12 justify-center text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
          </div>
        )}
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

const FONTE_LABEL: Record<string, string> = {
  midia: "Mídia paga", clarity: "Clarity", contexto: "Contexto", notas: "Notas",
};

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
      {/* O que ele sabe deste cliente — expectativa alinhada antes da pergunta */}
      {f && (
        <div className="flex items-center gap-2 flex-wrap text-[11px]">
          <span className="text-muted-foreground">Responde com base em:</span>
          {(["midia", "clarity", "contexto", "notas"] as const).map((k) => (
            <span key={k} className={`px-2 py-0.5 rounded-full border ${f[k] ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600" : "border-border text-muted-foreground line-through opacity-60"}`}>
              {FONTE_LABEL[k]}
            </span>
          ))}
          <span className={`px-2 py-0.5 rounded-full border ${f.relatorios > 0 ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600" : "border-border text-muted-foreground line-through opacity-60"}`}>
            {f.relatorios > 0 ? `${f.relatorios} relatório(s)` : "Relatórios"}
          </span>
          {podeLimpar && msgs.length > 0 && (
            <button onClick={() => { if (confirm("Limpar toda a conversa deste cliente?")) limpar.mutate({ accountId }); }}
              className="ml-auto text-muted-foreground hover:text-destructive flex items-center gap-1">
              <Trash2 className="w-3 h-3" /> Limpar conversa
            </button>
          )}
        </div>
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
