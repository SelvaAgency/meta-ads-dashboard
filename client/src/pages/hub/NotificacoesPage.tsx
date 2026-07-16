/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  /notificacoes — caixa de entrada pessoal
 * ─────────────────────────────────────────────────────────────────────────────
 *  Tudo que é SEU, de qualquer domínio: comunicados da administração, prazos do
 *  Trello, aniversários, e (para admin) o financeiro. É a visão pessoal do mesmo
 *  backend de notificações — /alerts continua sendo a tela operacional de mídia.
 *
 *  Admin ganha a aba "Enviados", com o compositor de comunicado e o recibo de
 *  leitura (que é literalmente o isRead da linha de cada destinatário).
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useMemo, useState } from "react";
import {
  Activity, AlertTriangle, Bell, CalendarClock, Cake, CheckCheck, DollarSign,
  Loader2, Megaphone, Pin, Send, TrendingUp, Users, X, Mail, Sunrise,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { HubShell } from "./HubShell";
import { NOTIF_DOMINIOS, dominioLabel, type NotifDominio } from "@shared/notifications";

const ICONE: Record<string, typeof Bell> = {
  COMUNICADO: Megaphone,
  BIRTHDAY: Cake,
  TRELLO_DUE: CalendarClock,
  TRELLO_RECONNECT: CalendarClock,
  FINANCE_OVERDUE: DollarSign,
  CLARITY_ISSUE: Activity,
  TRACKING_PROBLEM: AlertTriangle,
  DAILY_BRIEFING: TrendingUp,
  WEEKLY_REPORT: TrendingUp,
  ANOMALY: TrendingUp,
};
const COR_DOMINIO: Record<string, string> = {
  COMUNICADO: "bg-primary/20 text-accent",
  TAREFAS: "bg-blue-500/15 text-blue-600",
  SITE: "bg-violet-500/15 text-violet-600",
  FINANCEIRO: "bg-emerald-500/15 text-emerald-600",
  PERFORMANCE: "bg-amber-500/15 text-amber-600",
};

function quando(d: string | Date): string {
  const t = new Date(d).getTime();
  const min = Math.round((Date.now() - t) / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h}h`;
  const dias = Math.round(h / 24);
  return dias === 1 ? "ontem" : `há ${dias} dias`;
}

export default function NotificacoesPage() {
  const { user } = useAuth();
  const isAdmin = (user as { role?: string } | null)?.role === "admin";
  const utils = trpc.useUtils();

  const [aba, setAba] = useState<"minhas" | "enviados">("minhas");
  const [dominio, setDominio] = useState<NotifDominio | null>(null);
  const [status, setStatus] = useState<"nova" | "lida" | null>("nova");
  const [compor, setCompor] = useState(false);
  const [disparar, setDisparar] = useState(false);

  const listQ = trpc.alerts.listAll.useQuery({
    ...(dominio ? { dominio } : {}),
    ...(status ? { status } : {}),
  });
  const contagemQ = trpc.alerts.unreadByDominio.useQuery();
  const itens = listQ.data ?? [];

  const inval = () => { utils.alerts.listAll.invalidate(); utils.alerts.unreadByDominio.invalidate(); utils.alerts.unreadCount.invalidate(); };
  const markRead = trpc.alerts.markRead.useMutation({ onSuccess: inval });
  const markAll = trpc.alerts.markAllRead.useMutation({
    onSuccess: () => { inval(); toast.success("Tudo marcado como lido."); },
  });

  const total = useMemo(() => {
    const c = contagemQ.data;
    return c ? c.PERFORMANCE + c.FINANCEIRO + c.TAREFAS + c.COMUNICADO + c.SITE : 0;
  }, [contagemQ.data]);

  const dominiosVisiveis = NOTIF_DOMINIOS.filter((d) => d.v !== "FINANCEIRO" || isAdmin);

  return (
    <HubShell>
      <main className="flex-1 overflow-auto p-6 md:p-8">
        <div className="max-w-4xl mx-auto flex flex-col gap-6">
          <header className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-primary/20 text-accent flex items-center justify-center flex-shrink-0">
              <Bell className="w-5 h-5" />
            </span>
            <div className="flex-1">
              <h1 className="text-2xl font-bold">Notificações</h1>
              <p className="text-sm text-muted-foreground">
                {total > 0 ? `${total} não lida(s)` : "Tudo em dia por aqui."}
              </p>
            </div>
            {isAdmin && (
              <button onClick={() => setCompor(true)} className="rounded-lg bg-primary text-primary-foreground text-sm font-medium px-4 py-2 hover:opacity-90 flex items-center gap-2">
                <Megaphone className="w-4 h-4" /> Novo comunicado
              </button>
            )}
          </header>

          {isAdmin && <BannerResumoDiario onDisparar={() => setDisparar(true)} />}

          {isAdmin && (
            <div className="flex gap-1 border-b border-border">
              {([["minhas", "Minhas"], ["enviados", "Enviados"]] as const).map(([v, lbl]) => (
                <button key={v} onClick={() => setAba(v)}
                  className={`px-4 py-2 text-sm transition border-b-2 -mb-px ${aba === v ? "border-accent text-accent font-medium" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                  {lbl}
                </button>
              ))}
            </div>
          )}

          {aba === "enviados" && isAdmin ? (
            <Enviados />
          ) : (
            <>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Chip on={dominio === null} onClick={() => setDominio(null)}>Tudo</Chip>
                  {dominiosVisiveis.map((d) => {
                    const n = contagemQ.data?.[d.v] ?? 0;
                    return (
                      <Chip key={d.v} on={dominio === d.v} onClick={() => setDominio(d.v)}>
                        {d.label}{n > 0 ? ` · ${n}` : ""}
                      </Chip>
                    );
                  })}
                </div>
                <div className="flex items-center gap-1.5 ml-auto">
                  {([["nova", "Novas"], ["lida", "Lidas"], [null, "Todas"]] as const).map(([v, lbl]) => (
                    <Chip key={String(v)} on={status === v} onClick={() => setStatus(v)}>{lbl}</Chip>
                  ))}
                  {total > 0 && (
                    <button onClick={() => markAll.mutate({ ...(dominio ? { dominio } : {}) })} disabled={markAll.isPending}
                      className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 ml-1">
                      <CheckCheck className="w-3.5 h-3.5" /> Marcar todas
                    </button>
                  )}
                </div>
              </div>

              {listQ.isLoading ? (
                <div className="flex items-center gap-2 py-16 justify-center text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
                </div>
              ) : itens.length === 0 ? (
                <div className="rounded-xl border border-border bg-card py-16 text-center">
                  <Bell className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
                  <p className="text-sm text-muted-foreground">
                    {status === "nova" ? "Nenhuma notificação nova." : "Nada por aqui."}
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {itens.map((n) => {
                    const Icon = ICONE[n.type] ?? Bell;
                    const cor = COR_DOMINIO[n.dominio] ?? "bg-muted text-muted-foreground";
                    // Aceita link externo (card do Trello) e rota interna
                    // (/clarity?account=15) — o alerta precisa levar a algum lugar.
                    const acao = n.suggestedAction ?? "";
                    const link = acao.startsWith("http") ? acao : null;
                    const rota = acao.startsWith("/") ? acao : null;
                    return (
                      <div key={n.id} className={`rounded-xl border p-4 flex gap-3 transition ${n.isRead ? "border-border bg-card opacity-60" : "border-accent/30 bg-primary/[0.04]"}`}>
                        <span className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${cor}`}>
                          <Icon className="w-4 h-4" />
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start gap-2">
                            <p className="text-sm font-semibold flex-1">{n.title}</p>
                            <span className="text-[11px] text-muted-foreground flex-shrink-0">{quando(n.createdAt)}</span>
                          </div>
                          <p className="text-xs text-muted-foreground whitespace-pre-line mt-0.5">{n.message}</p>
                          <div className="flex items-center gap-2 mt-2">
                            <Badge variant="outline" className="text-[9px]">{dominioLabel(n.dominio)}</Badge>
                            {link && (
                              <a href={link} target="_blank" rel="noopener noreferrer" className="text-[11px] text-accent hover:underline">Abrir</a>
                            )}
                            {rota && <a href={rota} className="text-[11px] text-accent hover:underline">Ver no Tracker</a>}
                            {!n.isRead && (
                              <button onClick={() => markRead.mutate({ alertId: n.id })} className="text-[11px] text-muted-foreground hover:text-foreground ml-auto">
                                Marcar como lida
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {compor && <ComporComunicado onClose={() => setCompor(false)} />}
      {disparar && <DispararResumo onClose={() => setDisparar(false)} />}
    </HubShell>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`px-2.5 py-1 rounded-full text-[11px] border transition ${on ? "border-accent bg-primary/10 text-accent font-medium" : "border-border text-muted-foreground hover:text-foreground"}`}>
      {children}
    </button>
  );
}

// ─── Aba Enviados (admin) ────────────────────────────────────────────────────

function Enviados() {
  const listQ = trpc.comunicados.list.useQuery();
  const utils = trpc.useUtils();
  const fixar = trpc.comunicados.fixar.useMutation({ onSuccess: () => utils.comunicados.list.invalidate() });
  const [aberto, setAberto] = useState<number | null>(null);

  if (listQ.isLoading) return <div className="flex items-center gap-2 py-16 justify-center text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Carregando…</div>;
  const itens = listQ.data ?? [];
  if (itens.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card py-16 text-center">
        <Megaphone className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
        <p className="text-sm text-muted-foreground">Nenhum comunicado enviado ainda.</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {itens.map((c) => {
        const pct = c.enviados > 0 ? Math.round((c.leram / c.enviados) * 100) : 0;
        return (
          <div key={c.id} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {c.fixado && <Pin className="w-3.5 h-3.5 text-accent flex-shrink-0" />}
                  <p className="text-sm font-semibold">{c.titulo}</p>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {c.autorNome ?? "—"} · {quando(c.createdAt)} · {c.publico === "TODOS" ? "todo mundo" : c.publico === "ROLE" ? `permissão: ${c.alvoRole}` : c.publico === "FUNCAO" ? "por função" : "pessoas específicas"}
                </p>
              </div>
              <button onClick={() => fixar.mutate({ id: c.id, fixado: !c.fixado })} title={c.fixado ? "Desafixar" : "Fixar"}
                className={`p-1.5 rounded-md ${c.fixado ? "text-accent" : "text-muted-foreground hover:text-foreground"}`}>
                <Pin className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground whitespace-pre-line mt-2 line-clamp-3">{c.corpo}</p>
            <div className="flex items-center gap-3 mt-3 pt-3 border-t border-border/60">
              <div className="flex-1">
                <div className="flex items-center justify-between text-[11px] mb-1">
                  <span className="text-muted-foreground flex items-center gap-1"><Users className="w-3 h-3" /> {c.leram} de {c.enviados} leram</span>
                  <span className="text-muted-foreground tabular-nums">{pct}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-accent transition-all" style={{ width: `${pct}%` }} />
                </div>
              </div>
              <button onClick={() => setAberto(aberto === c.id ? null : c.id)} className="text-[11px] text-accent hover:underline flex-shrink-0">
                {aberto === c.id ? "ocultar" : "quem leu"}
              </button>
            </div>
            {aberto === c.id && <Recibos id={c.id} />}
          </div>
        );
      })}
    </div>
  );
}

function Recibos({ id }: { id: number }) {
  const q = trpc.comunicados.recibos.useQuery({ id });
  if (q.isLoading) return <p className="text-[11px] text-muted-foreground mt-2">Carregando…</p>;
  const rows = q.data ?? [];
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {rows.map((r) => (
        <span key={r.userId} className={`text-[10px] px-2 py-0.5 rounded-full border ${r.lido ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600" : "border-border text-muted-foreground"}`}>
          {r.nome ?? `#${r.userId}`}{r.lido ? " ✓" : ""}
        </span>
      ))}
    </div>
  );
}

// ─── Compositor de comunicado ────────────────────────────────────────────────

function ComporComunicado({ onClose }: { onClose: () => void }) {
  const utils = trpc.useUtils();
  const [titulo, setTitulo] = useState("");
  const [corpo, setCorpo] = useState("");
  const [publico, setPublico] = useState<"TODOS" | "ROLE" | "FUNCAO" | "PESSOAS">("TODOS");
  const [alvoFuncao, setAlvoFuncao] = useState<"collaborator" | "coordinator">("coordinator");
  const [alvoRole, setAlvoRole] = useState<"user" | "admin" | "developer">("user");
  const [alvoUserIds, setAlvoUserIds] = useState<number[]>([]);
  const [fixado, setFixado] = useState(false);

  const pessoasQ = trpc.people.list.useQuery(undefined, { enabled: publico === "PESSOAS" });
  const previewQ = trpc.comunicados.previewPublico.useQuery(
    { publico, alvoRole: publico === "ROLE" ? alvoRole : null, alvoFuncao: publico === "FUNCAO" ? alvoFuncao : null, alvoUserIds: publico === "PESSOAS" ? alvoUserIds : null },
    { enabled: publico !== "PESSOAS" || alvoUserIds.length > 0 },
  );
  const enviar = trpc.comunicados.enviar.useMutation({
    onSuccess: (r) => {
      utils.comunicados.list.invalidate(); utils.alerts.listAll.invalidate(); utils.alerts.unreadByDominio.invalidate();
      toast.success(`Comunicado enviado para ${r.entregues} pessoa(s)${r.emails > 0 ? ` · ${r.emails} email(s)` : ""}.`);
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  const alcance = previewQ.data?.total ?? 0;
  const podeEnviar = titulo.trim() && corpo.trim() && alcance > 0 && !enviar.isPending;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl w-full max-w-lg max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 p-4 border-b border-border">
          <Megaphone className="w-4 h-4 text-accent" />
          <p className="text-sm font-semibold flex-1">Novo comunicado</p>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-4 flex flex-col gap-3">
          <div>
            <label className="text-[11px] text-muted-foreground">Título</label>
            <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={180} placeholder="Ex.: Fechamento de julho" />
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground">Mensagem</label>
            <textarea value={corpo} onChange={(e) => setCorpo(e.target.value)} rows={6} maxLength={20000}
              placeholder="Escreva o aviso…"
              className="w-full text-sm border border-border rounded-md px-3 py-2 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-y" />
          </div>

          <div>
            <label className="text-[11px] text-muted-foreground">Para quem</label>
            <div className="flex gap-1.5 mt-1 flex-wrap">
              {([["TODOS", "Todo mundo"], ["ROLE", "Por permissão"], ["FUNCAO", "Por função"], ["PESSOAS", "Pessoas"]] as const).map(([v, lbl]) => (
                <Chip key={v} on={publico === v} onClick={() => setPublico(v)}>{lbl}</Chip>
              ))}
            </div>
          </div>

          {publico === "ROLE" && (
            <div className="flex gap-1.5 flex-wrap">
              {([["user", "Colaborador"], ["admin", "Administrativo"], ["developer", "Desenvolvedor"]] as const).map(([v, lbl]) => (
                <Chip key={v} on={alvoRole === v} onClick={() => setAlvoRole(v)}>{lbl}</Chip>
              ))}
            </div>
          )}

          {publico === "FUNCAO" && (
            <div className="flex gap-1.5 flex-wrap">
              {([["coordinator", "Coordenadores"], ["collaborator", "Colaboradores"]] as const).map(([v, lbl]) => (
                <Chip key={v} on={alvoFuncao === v} onClick={() => setAlvoFuncao(v)}>{lbl}</Chip>
              ))}
            </div>
          )}

          {publico === "PESSOAS" && (
            <div className="rounded-lg border border-border p-2 max-h-40 overflow-auto flex flex-wrap gap-1.5">
              {(pessoasQ.data ?? []).map((p) => {
                const on = alvoUserIds.includes(p.id);
                return (
                  <Chip key={p.id} on={on} onClick={() => setAlvoUserIds((prev) => on ? prev.filter((x) => x !== p.id) : [...prev, p.id])}>
                    {p.name ?? p.email}
                  </Chip>
                );
              })}
            </div>
          )}

          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <input type="checkbox" checked={fixado} onChange={(e) => setFixado(e.target.checked)} />
            Fixar no topo
          </label>

          <p className="text-[11px] text-muted-foreground border-t border-border pt-3">
            Vai para <span className="font-semibold text-foreground">{alcance} pessoa(s)</span>. Todo mundo recebe no app;
            o email sai só para quem escolheu receber comunicado por email.
          </p>
        </div>

        <div className="flex justify-end gap-2 p-4 border-t border-border">
          <button onClick={onClose} className="text-sm px-4 py-2 rounded-lg border border-border text-muted-foreground hover:text-foreground">Cancelar</button>
          <button
            onClick={() => enviar.mutate({ titulo: titulo.trim(), corpo: corpo.trim(), publico, alvoRole: publico === "ROLE" ? alvoRole : null, alvoFuncao: publico === "FUNCAO" ? alvoFuncao : null, alvoUserIds: publico === "PESSOAS" ? alvoUserIds : null, fixado })}
            disabled={!podeEnviar}
            className="text-sm px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-2">
            {enviar.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Enviar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Resumo diário: banner + disparo manual ──────────────────────────────────
// O automático continua sendo a rotina. Isto é o controle excepcional — revisar
// e mandar na mão, tirando quem está de folga.

function BannerResumoDiario({ onDisparar }: { onDisparar: () => void }) {
  const cfgQ = trpc.notifications.digestSettings.useQuery();
  if (cfgQ.isLoading || !cfgQ.data) return null;
  const d = cfgQ.data;
  const hojeOff = !d.hoje.enabled;
  const horario = d.hoje.timeOverride ?? d.defaultTime;

  return (
    <div className="rounded-xl border border-border bg-card p-3 flex items-center gap-3 flex-wrap">
      <span className="w-8 h-8 rounded-lg bg-primary/15 text-accent flex items-center justify-center flex-shrink-0">
        <Sunrise className="w-4 h-4" />
      </span>
      <div className="flex-1 min-w-[200px]">
        <p className="text-sm font-medium">Resumo diário</p>
        <p className="text-[11px] text-muted-foreground">
          {!d.autoEnabled ? "Envio automático desligado."
            : hojeOff ? `Hoje não vai sair (desligado só para hoje). Volta amanhã às ${horario}.`
            : `Próximo envio automático: hoje às ${horario}.`}
          {d.email.dryRun && " · Modo de teste: nenhum email real sai."}
        </p>
      </div>
      <button onClick={onDisparar}
        className="h-8 px-3 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5">
        <Send className="w-3.5 h-3.5" /> Revisar e disparar
      </button>
    </div>
  );
}

function DispararResumo({ onClose }: { onClose: () => void }) {
  const utils = trpc.useUtils();
  const [canal, setCanal] = useState<"inapp" | "email" | "ambos">("ambos");
  const [excluidos, setExcluidos] = useState<number[]>([]);
  const previewQ = trpc.notifications.previewResumo.useQuery({ excluirUserIds: excluidos });
  const pessoasQ = trpc.people.list.useQuery();

  const disparar = trpc.notifications.dispararResumo.useMutation({
    onSuccess: (r) => {
      utils.alerts.listAll.invalidate(); utils.alerts.unreadByDominio.invalidate();
      toast.success(
        r.dryRun
          ? `Modo de teste: ${r.inapp} no app · ${r.emails} email(s) simulado(s).`
          : `Enviado — ${r.inapp} no app · ${r.emails} email(s).`,
      );
      onClose();
    },
    onError: (e) => {
      // CONFLICT = já saiu hoje. Perguntar antes de mandar de novo.
      if (e.data?.code === "CONFLICT") {
        if (confirm("Esse resumo já foi enviado hoje. Deseja reenviar?")) {
          disparar.mutate({ canal, excluirUserIds: excluidos, confirmarReenvio: true });
        }
        return;
      }
      toast.error(e.message);
    },
  });

  const p = previewQ.data;
  const pessoas = (pessoasQ.data ?? []).filter((x) => x.active);
  const nInApp = canal === "email" ? 0 : (p?.inapp.length ?? 0);
  const nEmail = canal === "inapp" ? 0 : (p?.email.length ?? 0);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl w-full max-w-lg max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 p-4 border-b border-border">
          <Sunrise className="w-4 h-4 text-accent" />
          <p className="text-sm font-semibold flex-1">Disparar resumo diário</p>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-4 flex flex-col gap-4">
          <div>
            <label className="text-[11px] text-muted-foreground">Canal</label>
            <div className="flex gap-1.5 mt-1 flex-wrap">
              {([["ambos", "No app + email"], ["inapp", "Somente no app"], ["email", "Somente email"]] as const).map(([v, lbl]) => (
                <Chip key={v} on={canal === v} onClick={() => setCanal(v)}>{lbl}</Chip>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[11px] text-muted-foreground">Não enviar hoje para <span className="opacity-60">(férias, folga)</span></label>
            <div className="flex flex-wrap gap-1.5 mt-1 max-h-32 overflow-auto">
              {pessoas.map((x) => {
                const fora = excluidos.includes(x.id);
                return (
                  <Chip key={x.id} on={fora} onClick={() => setExcluidos((prev) => fora ? prev.filter((i) => i !== x.id) : [...prev, x.id])}>
                    {fora ? "✕ " : ""}{x.name}
                  </Chip>
                );
              })}
            </div>
          </div>

          {/* Prévia: quem recebe, por onde, e se é real ou teste */}
          <div className="rounded-lg border border-border bg-muted/30 p-3 flex flex-col gap-1.5">
            <p className="text-[11px] font-semibold text-muted-foreground">Prévia</p>
            {previewQ.isLoading ? <p className="text-xs text-muted-foreground">Calculando…</p> : (
              <>
                <p className="text-xs"><span className="font-semibold tabular-nums">{nInApp}</span> pessoa(s) recebem no app</p>
                <p className="text-xs flex items-center gap-1.5">
                  <Mail className="w-3 h-3 text-muted-foreground" />
                  <span className="font-semibold tabular-nums">{nEmail}</span> email(s)
                  {p?.dryRun && <span className="text-amber-600">· simulados (modo de teste)</span>}
                  {!p?.emailConfigurado && <span className="text-amber-600">· SMTP não configurado</span>}
                </p>
                {excluidos.length > 0 && <p className="text-xs text-muted-foreground">{excluidos.length} pessoa(s) fora hoje</p>}
                {p?.jaEnviadoHoje && canal !== "inapp" && (
                  <p className="text-[11px] text-amber-700 bg-amber-500/10 rounded p-1.5 mt-1">
                    O resumo de hoje já foi enviado. Disparar de novo vai pedir confirmação.
                  </p>
                )}
                <p className="text-[10px] text-muted-foreground mt-1">
                  {canal === "inapp" ? "Somente no app: nenhum email sai."
                    : canal === "email" ? "Somente email: não aparece no sino."
                    : "Aparece no sino e chega por email."}
                </p>
              </>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 p-4 border-t border-border">
          <button onClick={onClose} className="text-sm px-4 py-2 rounded-lg border border-border text-muted-foreground hover:text-foreground">Cancelar</button>
          <button onClick={() => disparar.mutate({ canal, excluirUserIds: excluidos, confirmarReenvio: false })}
            disabled={disparar.isPending || (nInApp === 0 && nEmail === 0)}
            className="text-sm px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 flex items-center gap-2">
            {disparar.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Enviar agora
          </button>
        </div>
      </div>
    </div>
  );
}
