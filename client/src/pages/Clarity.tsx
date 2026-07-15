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
import { useState } from "react";
import {
  Activity, AlertTriangle, ExternalLink, Eye, Loader2, MousePointerClick,
  RefreshCw, Settings2, TrendingUp, Users, X, Clock, ArrowDownWideNarrow,
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
  const { activeAccountId, activeAccount } = useActiveAccount();
  const utils = trpc.useUtils();
  const [config, setConfig] = useState(false);

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
              <Activity className="w-5 h-5 text-accent" /> Comportamento no site
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

        {(cfgQ.isLoading || snapQ.isLoading) && (
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
