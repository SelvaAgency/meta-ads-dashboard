/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Selva Spaces — TRACKER (app integrado) · rota /hub/tracker
 * ─────────────────────────────────────────────────────────────────────────────
 *  Abre o Tracker DENTRO da área principal do Selva Spaces (iframe), com a
 *  sidebar do Spaces colapsada automaticamente (ver HubSidebar → appMode).
 *
 *  Robustez:
 *   · Sem dangerouslySetInnerHTML, sem tokens/credenciais na URL.
 *   · Spinner enquanto carrega; se não carregar (bloqueio/erro), cai num
 *     fallback elegante com botão "Abrir em nova aba".
 *   · O Tracker externo NÃO é alterado — só é embutido via iframe.
 *
 *  `?client=<slug>` seleciona qual Tracker abrir. Hoje todos resolvem para a
 *  URL geral (ver trackerConfig → TODO url-por-cliente).
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "wouter";
import { ExternalLink, Loader2, MonitorX } from "lucide-react";
import { HubShell } from "./HubShell";
import {
  TRACKER_GENERAL_URL,
  trackerUrlForClient,
  trackerClientBySlug,
} from "./trackerConfig";

type Status = "loading" | "loaded" | "fallback";

// Se o iframe não sinalizar carregamento nesse tempo, assumimos bloqueio/erro
// e mostramos o fallback. (Bloqueio cross-origin não é detectável de forma
// confiável pelo pai; o botão "Abrir em nova aba" cobre os demais casos.)
const LOAD_TIMEOUT_MS = 12000;

export default function HubTracker() {
  const [searchParams] = useSearchParams();
  const clientSlug = searchParams.get("client");
  const client = trackerClientBySlug(clientSlug);
  const src = trackerUrlForClient(clientSlug);

  const [status, setStatus] = useState<Status>("loading");
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reinicia o estado quando a URL/cliente muda.
  useEffect(() => {
    setStatus("loading");
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setStatus((s) => (s === "loaded" ? s : "fallback"));
    }, LOAD_TIMEOUT_MS);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [src, clientSlug]);

  const title = client ? `Tracker · ${client.name}` : "Tracker";

  return (
    <HubShell>
      <div className="flex-1 flex flex-col min-h-0">
        {/* Barra fina do app integrado */}
        <div className="flex items-center justify-between gap-3 border-b border-border bg-background px-4 py-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-semibold truncate">{title}</span>
            <span className="text-[11px] text-muted-foreground truncate hidden sm:inline">
              app integrado
            </span>
          </div>
          <a
            href={src}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Abrir em nova aba
          </a>
        </div>

        {/* Área do app */}
        <div className="relative flex-1 min-h-0 bg-secondary/40">
          {status !== "fallback" && (
            <iframe
              key={src + (clientSlug ?? "")}
              src={src}
              title={title}
              className="absolute inset-0 w-full h-full border-0"
              onLoad={() => setStatus("loaded")}
              referrerPolicy="no-referrer"
            />
          )}

          {/* Spinner enquanto carrega */}
          {status === "loading" && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                Carregando Tracker…
              </div>
            </div>
          )}

          {/* Fallback elegante */}
          {status === "fallback" && (
            <div className="absolute inset-0 flex items-center justify-center p-6">
              <div className="max-w-md w-full rounded-xl border border-border bg-card p-8 text-center shadow-sm">
                <span className="w-12 h-12 rounded-xl bg-muted mx-auto mb-4 flex items-center justify-center">
                  <MonitorX className="w-6 h-6 text-muted-foreground" />
                </span>
                <h2 className="text-lg font-bold mb-1">Tracker</h2>
                <p className="text-sm text-muted-foreground mb-5">
                  Não foi possível carregar o Tracker aqui dentro do Selva Spaces. Você pode abri-lo
                  em uma nova aba.
                </p>
                <a
                  href={TRACKER_GENERAL_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium px-4 py-2 hover:opacity-90 transition-opacity"
                >
                  <ExternalLink className="w-4 h-4" />
                  Abrir Tracker em nova aba
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </HubShell>
  );
}
