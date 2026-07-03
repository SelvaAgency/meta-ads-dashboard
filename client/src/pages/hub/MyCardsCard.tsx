/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Selva Spaces — Card "Meus cards" (Trello real)
 * ─────────────────────────────────────────────────────────────────────────────
 *  Cards atribuídos ao usuário logado, de todos os quadros que a conta Trello
 *  dele acessa. O backend trata o token e só devolve status + cards — nenhum
 *  token chega ao frontend. Mesma UX do card de Agenda: header com sincronizar,
 *  conteúdo no meio, rodapé fixo (última atualização + Abrir Trello).
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useEffect, useState } from "react";
import { ClipboardCheck, ExternalLink, Loader2, Plug, RefreshCw, Square } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Card } from "@/components/ui/card";

const CONNECT_URL = "/api/integrations/trello/start";
const TRELLO_URL = "https://trello.com/";

function formatUpdated(ts: number): string {
  const diffMin = Math.floor((Date.now() - ts) / 60000);
  if (diffMin < 1) return "Atualizado agora";
  if (diffMin < 60) return `Atualizado há ${diffMin} min`;
  const hhmm = new Date(ts).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return `Atualizado às ${hhmm}`;
}

function ConnectCTA({ reconnect = false }: { reconnect?: boolean }) {
  return (
    <div className="flex flex-col items-start gap-2">
      <p className="text-sm text-muted-foreground">
        {reconnect
          ? "Sua conexão com o Trello expirou."
          : "Conecte seu Trello para ver seus cards aqui."}
      </p>
      <a
        href={CONNECT_URL}
        className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium px-3 py-1.5 hover:opacity-90 transition-opacity"
      >
        {reconnect ? <RefreshCw className="w-3.5 h-3.5" /> : <Plug className="w-3.5 h-3.5" />}
        {reconnect ? "Reconectar Trello" : "Conectar Trello"}
      </a>
    </div>
  );
}

export function MyCardsCard() {
  const q = trpc.integrations.trello.myCards.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 60_000,
  });

  const status = q.data?.status;
  const connected = status === "ok";
  const showSync = !q.isLoading && (q.isError || connected);
  const syncing = q.isFetching;
  const updatedAt = q.dataUpdatedAt;

  const [expanded, setExpanded] = useState(false);
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
        <Loader2 className="w-4 h-4 animate-spin" /> Carregando cards…
      </div>
    );
  } else if (!q.data) {
    body = <p className="text-sm text-muted-foreground">Não foi possível carregar seus cards agora.</p>;
  } else if (q.data.status === "unavailable") {
    body = <p className="text-sm text-muted-foreground">Integração do Trello indisponível.</p>;
  } else if (q.data.status === "disconnected") {
    body = <ConnectCTA />;
  } else if (q.data.status === "needs_reconnect") {
    body = <ConnectCTA reconnect />;
  } else if (q.data.status === "error") {
    body = <p className="text-sm text-muted-foreground">Não foi possível carregar seus cards agora.</p>;
  } else if (q.data.cards.length === 0) {
    body = <p className="text-sm text-muted-foreground">Nenhum card pendente atribuído a você.</p>;
  } else {
    const cards = q.data.cards;
    const visible = expanded ? cards : cards.slice(0, 5);
    body = (
      <div className="flex flex-col gap-2.5">
        {visible.map((c) => (
          <a
            key={c.id}
            href={c.url}
            target="_blank"
            rel="noreferrer"
            className="group flex items-start gap-2.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <Square className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-muted-foreground/60" />
            <span className="min-w-0">
              <span className="text-foreground">{c.name}</span>
              {c.boardName && <span className="text-muted-foreground"> · {c.boardName}</span>}
            </span>
          </a>
        ))}
        {cards.length > 5 && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="self-start text-xs font-medium text-accent hover:opacity-80 mt-0.5"
          >
            {expanded ? "Mostrar menos" : `Ver todos (${cards.length})`}
          </button>
        )}
      </div>
    );
  }

  const softError = q.isError && connected;

  return (
    <Card className="gap-4 py-5 h-full">
      {/* Header: título + sincronizar */}
      <div className="px-5 flex items-center gap-2.5 flex-shrink-0">
        <span className="w-7 h-7 rounded-lg bg-accent/15 text-accent flex items-center justify-center flex-shrink-0">
          <ClipboardCheck className="w-4 h-4" />
        </span>
        <h2 className="text-sm font-semibold flex-1">Meus cards</h2>
        {showSync && (
          <button
            onClick={() => q.refetch()}
            disabled={syncing}
            title="Sincronizar cards"
            aria-label="Sincronizar cards"
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/30 transition-colors disabled:opacity-60 disabled:pointer-events-none"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
          </button>
        )}
      </div>

      {/* Corpo — ocupa o meio */}
      <div className="px-5 flex-1">
        {body}
        {softError && (
          <p className="mt-2 text-[11px] text-muted-foreground">Não foi possível atualizar agora.</p>
        )}
      </div>

      {/* Rodapé — fixo na base (mt-auto) */}
      {connected && (
        <div className="px-5 mt-auto flex-shrink-0 flex items-center justify-between gap-3">
          <span className="text-[11px] text-muted-foreground">
            {updatedAt ? formatUpdated(updatedAt) : ""}
          </span>
          <a
            href={TRELLO_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
          >
            <ExternalLink className="w-3.5 h-3.5" /> Abrir Trello
          </a>
        </div>
      )}
    </Card>
  );
}
