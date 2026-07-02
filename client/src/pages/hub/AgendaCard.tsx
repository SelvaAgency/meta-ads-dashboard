/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Selva Spaces — Card "Agenda de hoje" (Google Calendar real)
 * ─────────────────────────────────────────────────────────────────────────────
 *  Mostra os eventos do dia do usuário logado. O backend trata tokens/refresh e
 *  só devolve status + eventos — nenhum token chega ao frontend. A Home nunca
 *  quebra: todo estado (carregando, sem conexão, reconectar, vazio, erro) tem
 *  um render elegante.
 *
 *  Ações: sincronizar (refetch da mesma query, sem recarregar a página) e
 *  abrir o Google Calendar em nova aba.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { CalendarCheck, ExternalLink, Loader2, Plug, RefreshCw } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Card } from "@/components/ui/card";

// Rota HTTP que inicia o OAuth (valida a sessão no backend e redireciona).
const CONNECT_URL = "/api/integrations/google/start";
// Abrir o Google Calendar do usuário (dia atual) em nova aba.
const CALENDAR_URL = "https://calendar.google.com/calendar/u/0/r/day";

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
  const q = trpc.integrations.googleCalendar.todayEvents.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 60_000,
  });

  const status = q.data?.status;
  // Sincronizar faz sentido quando há conexão (ok) ou quando houve erro (tentar de novo).
  const showSync = !q.isLoading && (q.isError || status === "ok");
  // Abrir o Google Calendar só quando conectado (com ou sem eventos).
  const showOpen = status === "ok";
  const syncing = q.isFetching;

  let body: React.ReactNode;

  if (q.isLoading) {
    body = (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Carregando agenda…
      </div>
    );
  } else if (q.isError || !q.data) {
    body = <p className="text-sm text-muted-foreground">Não foi possível carregar a agenda agora.</p>;
  } else if (q.data.status === "unavailable") {
    body = <p className="text-sm text-muted-foreground">Integração de calendário indisponível.</p>;
  } else if (q.data.status === "disconnected") {
    body = <ConnectCTA />;
  } else if (q.data.status === "needs_reconnect") {
    body = <ConnectCTA reconnect />;
  } else if (q.data.events.length === 0) {
    body = <p className="text-sm text-muted-foreground">Nenhum compromisso para hoje. 🎉</p>;
  } else {
    body = (
      <div className="flex flex-col gap-2.5">
        {q.data.events.map((ev) => (
          <div key={ev.id} className="flex items-center gap-3 text-sm">
            <span className={`min-w-[64px] font-semibold ${ev.allDay ? "text-muted-foreground" : "text-foreground"}`}>
              {ev.time}
            </span>
            <span className="truncate">{ev.title}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <Card className="gap-4 py-5">
      {/* Header: título + sincronizar */}
      <div className="px-5 flex items-center gap-2.5">
        <span className="w-7 h-7 rounded-lg bg-primary/20 text-accent flex items-center justify-center flex-shrink-0">
          <CalendarCheck className="w-4 h-4" />
        </span>
        <h2 className="text-sm font-semibold flex-1">Agenda de hoje</h2>
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

      {/* Corpo */}
      <div className="px-5">{body}</div>

      {/* Rodapé: abrir Google Calendar (ação complementar) */}
      {showOpen && (
        <div className="px-5">
          <a
            href={CALENDAR_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" /> Abrir Google Calendar
          </a>
        </div>
      )}
    </Card>
  );
}
