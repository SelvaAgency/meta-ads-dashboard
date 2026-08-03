/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Selva Spaces — Card "Agenda" (Google Calendar real)
 * ─────────────────────────────────────────────────────────────────────────────
 *  Mostra os eventos do dia selecionado do usuário logado. O backend trata
 *  tokens/refresh e só devolve status + eventos — nenhum token chega ao frontend.
 *  A Home nunca quebra: todo estado (carregando, sem conexão, reconectar, vazio,
 *  erro) tem um render elegante.
 *
 *  Navegação de dia: setas ± 1 dia ao lado do sync (hoje é o padrão). O backend
 *  valida e limita a data a hoje ± 1. "Última atualização" e o link do Google
 *  Calendar seguem o dia selecionado.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useEffect, useState } from "react";
import { CalendarCheck, ChevronLeft, ChevronRight, ExternalLink, Loader2, Plug, RefreshCw, Video } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Card } from "@/components/ui/card";

// Rota HTTP que inicia o OAuth (valida a sessão no backend e redireciona).
const CONNECT_URL = "/api/integrations/google/start";
const AGENCY_TZ = "America/Sao_Paulo";

function ymdInTz(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: AGENCY_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const base = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  base.setUTCDate(base.getUTCDate() + days);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${base.getUTCFullYear()}-${p(base.getUTCMonth() + 1)}-${p(base.getUTCDate())}`;
}
// Rótulo discreto do dia: Ontem / Hoje / Amanhã (fallback DD/MM).
function dayLabel(offset: number, ymd: string): string {
  if (offset === 0) return "Hoje";
  if (offset === 1) return "Amanhã";
  if (offset === -1) return "Ontem";
  const [, m, d] = ymd.split("-");
  return `${d}/${m}`;
}
// Link do Google Calendar já no dia selecionado.
function calendarUrlFor(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return `https://calendar.google.com/calendar/u/0/r/day/${y}/${m}/${d}`;
}

function formatUpdated(ts: number): string {
  const diffMin = Math.floor((Date.now() - ts) / 60000);
  if (diffMin < 1) return "Atualizado agora";
  if (diffMin < 60) return `Atualizado há ${diffMin} min`;
  const hhmm = new Date(ts).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return `Atualizado às ${hhmm}`;
}

/** Quanto antes do início o evento já fica em destaque âmbar. */
const JANELA_EM_BREVE_MIN = 60;

/** "em 5 min" · "em 45 min" · "em 1h". Arredonda para cima no limite para não
 *  mostrar "em 60 min", que soa mais longe do que "em 1h". */
function faltaLabel(min: number): string {
  if (min >= 60) return "em 1h";
  return `em ${min} min`;
}


function ConnectCTA({ reconnect = false }: { reconnect?: boolean }) {
  return (
    <div className="flex flex-col items-start gap-2">
      <p className="text-sm text-muted-foreground">
        {reconnect
          ? "Sua conexão com o Google Calendar expirou."
          : "Conecte seu Google Calendar para ver sua agenda aqui."}
      </p>
      <a
        href={CONNECT_URL}
        className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium px-3 py-1.5 hover:opacity-90 transition-opacity"
      >
        {reconnect ? <RefreshCw className="w-3.5 h-3.5" /> : <Plug className="w-3.5 h-3.5" />}
        {reconnect ? "Reconectar Google Calendar" : "Conectar Google Calendar"}
      </a>
    </div>
  );
}

export function AgendaCard() {
  // Só ± 1 dia nesta etapa (backend também limita).
  const [dayOffset, setDayOffset] = useState(0);
  const todayYmd = ymdInTz(new Date());
  const targetYmd = addDaysYmd(todayYmd, dayOffset);
  const label = dayLabel(dayOffset, targetYmd);

  const q = trpc.integrations.googleCalendar.todayEvents.useQuery(
    { date: targetYmd },
    { retry: false, refetchOnWindowFocus: false, staleTime: 60_000 },
  );

  const status = q.data?.status;
  const connected = status === "ok"; // conectado + busca ok (com ou sem eventos)
  // Sincronizar faz sentido quando há conexão (ok) ou quando houve erro (tentar de novo).
  const showSync = !q.isLoading && (q.isError || connected);
  const syncing = q.isFetching;
  // dataUpdatedAt só muda em fetch bem-sucedido → não é sobrescrito por erro.
  const updatedAt = q.dataUpdatedAt;

  // Re-render leve a cada 60s só para o texto relativo "há N min" (NÃO busca dados).
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!connected) return;
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, [connected]);

  let body: React.ReactNode;

  if (q.isLoading) {
    body = (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Carregando agenda…
      </div>
    );
  } else if (!q.data) {
    // Nunca carregou com sucesso (erro na primeira carga).
    body = <p className="text-sm text-muted-foreground">Não foi possível carregar a agenda agora.</p>;
  } else if (q.data.status === "unavailable") {
    body = <p className="text-sm text-muted-foreground">Integração de calendário indisponível.</p>;
  } else if (q.data.status === "disconnected") {
    body = <ConnectCTA />;
  } else if (q.data.status === "needs_reconnect") {
    body = <ConnectCTA reconnect />;
  } else if (q.data.events.length === 0) {
    body = <p className="text-sm text-muted-foreground">Nenhum compromisso para {label.toLowerCase()}. 🎉</p>;
  } else {
    // Quatro estados no tempo, não dois. O cartão só acendia no horário exato e
    // ficava branco no resto do dia: às cinco da tarde, a reunião das nove
    // pesava igual à das seis. Agora a lista conta a passagem do dia sozinha —
    // encerrado esmaece, "em breve" (âmbar) cobre a última hora antes de
    // começar, "agora" segue rosa. O tick de 60s re-renderiza, então destaque e
    // contagem acompanham o relógio (± 1 min).
    const now = Date.now();
    body = (
      <div className="flex flex-col gap-1 -mx-2">
        {q.data.events.map((ev) => {
          const isNow = ev.startMs != null && ev.endMs != null && now >= ev.startMs && now < ev.endMs;
          // `ceil` em vez de `round`: faltando 20 segundos ainda é "em 1 min", e
          // o evento não pisca de volta ao branco na virada para o início.
          // Evento de dia inteiro fica de fora — ele "começa" à meia-noite, e
          // sem isso todo compromisso do dia acenderia às 23h da véspera.
          const faltamMin = ev.startMs != null && !isNow && !ev.allDay
            ? Math.ceil((ev.startMs - now) / 60000)
            : null;
          const emBreve = faltamMin != null && faltamMin > 0 && faltamMin <= JANELA_EM_BREVE_MIN;
          // Encerrado: já passou do fim. Só esmaece — nada de tachado, que
          // leria como "cancelada", e a reunião aconteceu. Volta ao normal no
          // hover porque o link ainda serve depois que a reunião acaba.
          // Dia inteiro nunca "encerra" no meio do dia.
          const encerrado = ev.endMs != null && !ev.allDay && now >= ev.endMs;
          const joinable = !!ev.meetingUrl;
          const destaque = isNow
            ? "bg-primary/10 ring-1 ring-primary/25"
            : emBreve
              ? "bg-amber-500/10 ring-1 ring-amber-500/30"
              : "";
          const corHora = isNow
            ? "text-accent"
            : emBreve
              ? "text-amber-600 dark:text-amber-400"
              : ev.allDay ? "text-muted-foreground" : "text-foreground";
          const cls = `group flex items-center gap-3 text-sm rounded-lg px-2 py-1.5 transition-colors ${destaque} ${encerrado ? "opacity-45 hover:opacity-100" : ""} ${joinable ? "cursor-pointer hover:bg-accent/30" : ""}`;
          const inner = (
            <>
              <span className={`min-w-[64px] font-semibold ${corHora}`}>
                {ev.time}
              </span>
              <span className="truncate flex-1">{ev.title}</span>
              {isNow && <span className="text-[10px] font-medium text-accent px-1.5 py-0.5 rounded-full bg-primary/15 flex-shrink-0">agora</span>}
              {/* A cor sozinha diz "é logo"; o texto diz QUANTO falta — que é a
                  informação de quem decide se dá tempo de começar outra coisa. */}
              {emBreve && (
                <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded-full bg-amber-500/15 flex-shrink-0">
                  {faltaLabel(faltamMin!)}
                </span>
              )}
              {joinable && <Video className={`w-3.5 h-3.5 flex-shrink-0 ${isNow ? "text-accent" : emBreve ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground group-hover:text-foreground"}`} />}
            </>
          );
          return joinable ? (
            <a key={ev.id} href={ev.meetingUrl!} target="_blank" rel="noreferrer" title="Entrar na reunião" className={cls}>
              {inner}
            </a>
          ) : (
            <div key={ev.id} className={cls}>{inner}</div>
          );
        })}
      </div>
    );
  }

  // Erro ao atualizar, mas ainda temos dados anteriores → nota discreta (mantém a lista).
  const softError = q.isError && connected;

  return (
    <Card className="gap-4 py-5 h-full">
      {/* Header: título + navegação de dia (± 1) + sincronizar */}
      <div className="px-5 flex items-center gap-2.5 flex-shrink-0">
        <span className="w-7 h-7 rounded-lg bg-primary/20 text-accent flex items-center justify-center flex-shrink-0">
          <CalendarCheck className="w-4 h-4" />
        </span>
        <h2 className="text-sm font-semibold flex-1">Agenda</h2>

        {/* Setas ± 1 dia + rótulo discreto do dia */}
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setDayOffset((o) => Math.max(-1, o - 1))}
            disabled={dayOffset <= -1}
            title="Dia anterior"
            aria-label="Dia anterior"
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/30 transition-colors disabled:opacity-30 disabled:pointer-events-none"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <span className="text-[11px] text-muted-foreground min-w-[48px] text-center tabular-nums">{label}</span>
          <button
            onClick={() => setDayOffset((o) => Math.min(1, o + 1))}
            disabled={dayOffset >= 1}
            title="Próximo dia"
            aria-label="Próximo dia"
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/30 transition-colors disabled:opacity-30 disabled:pointer-events-none"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {showSync && (
          <button
            onClick={() => q.refetch()}
            disabled={syncing}
            title="Sincronizar agenda"
            aria-label="Sincronizar agenda"
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/30 transition-colors disabled:opacity-60 disabled:pointer-events-none"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
          </button>
        )}
      </div>

      {/* Corpo — ocupa o espaço do meio */}
      <div className="px-5 flex-1">
        {body}
        {softError && (
          <p className="mt-2 text-[11px] text-muted-foreground">Não foi possível atualizar agora.</p>
        )}
      </div>

      {/* Rodapé — fixado na base do card (mt-auto) */}
      {connected && (
        <div className="px-5 mt-auto flex-shrink-0 flex items-center justify-between gap-3">
          <span className="text-[11px] text-muted-foreground">
            {updatedAt ? formatUpdated(updatedAt) : ""}
          </span>
          <a
            href={calendarUrlFor(targetYmd)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
          >
            <ExternalLink className="w-3.5 h-3.5" /> Abrir Google Calendar
          </a>
        </div>
      )}
    </Card>
  );
}
