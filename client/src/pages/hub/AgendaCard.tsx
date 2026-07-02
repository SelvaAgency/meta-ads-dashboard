/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Selva Spaces — Card "Agenda de hoje" (Google Calendar real)
 * ─────────────────────────────────────────────────────────────────────────────
 *  Mostra os eventos do dia do usuário logado. O backend trata tokens/refresh e
 *  só devolve status + eventos — nenhum token chega ao frontend. A Home nunca
 *  quebra: todo estado (carregando, sem conexão, reconectar, vazio, erro) tem
 *  um render elegante.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { CalendarCheck, Loader2, Plug, RefreshCw } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Card } from "@/components/ui/card";

// Rota HTTP que inicia o OAuth (valida a sessão no backend e redireciona).
const CONNECT_URL = "/api/integrations/google/start";

function Header() {
  return (
    <div className="px-5 flex items-center gap-2.5">
      <span className="w-7 h-7 rounded-lg bg-primary/20 text-accent flex items-center justify-center flex-shrink-0">
        <CalendarCheck className="w-4 h-4" />
      </span>
      <h2 className="text-sm font-semibold">Agenda de hoje</h2>
    </div>
  );
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
  const q = trpc.integrations.googleCalendar.todayEvents.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 60_000,
  });

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
      <Header />
      <div className="px-5">{body}</div>
    </Card>
  );
}
