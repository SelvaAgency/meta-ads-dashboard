/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Selva Spaces — HubIntegratedApp (container genérico de app integrado)
 * ─────────────────────────────────────────────────────────────────────────────
 *  Casca reutilizável que abre qualquer app interno DENTRO da área principal do
 *  Selva Spaces (iframe), com a sidebar colapsada automaticamente
 *  (ver HubSidebar → appMode). Usado por Tracker, Relatórios e Contratos.
 *
 *  Robustez:
 *   · Sem dangerouslySetInnerHTML, sem tokens/credenciais na URL.
 *   · Spinner enquanto carrega; se não carregar (bloqueio/erro), cai num
 *     fallback elegante com botão "Abrir em nova aba".
 *   · O app externo NÃO é alterado — só é embutido via iframe.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useEffect, useRef, useState } from "react";
import { ExternalLink, Loader2, MonitorX } from "lucide-react";
import { HubShell } from "./HubShell";

type Status = "loading" | "loaded" | "fallback";

// Se o iframe não sinalizar carregamento nesse tempo, assumimos bloqueio/erro
// e mostramos o fallback. (Bloqueio cross-origin não é detectável de forma
// confiável pelo pai; o botão "Abrir em nova aba" cobre os demais casos.)
const LOAD_TIMEOUT_MS = 12000;

interface HubIntegratedAppProps {
  /** Título principal na barra fina (ex.: "Tracker" ou "Tracker · LACLIMA"). */
  title: string;
  /** URL embutida no iframe. */
  src: string;
  /** URL usada nos botões "Abrir em nova aba" / fallback. */
  externalUrl: string;
}

export function HubIntegratedApp({ title, src, externalUrl }: HubIntegratedAppProps) {
  const [status, setStatus] = useState<Status>("loading");
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reinicia o estado sempre que a URL embutida muda.
  useEffect(() => {
    setStatus("loading");
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setStatus((s) => (s === "loaded" ? s : "fallback"));
    }, LOAD_TIMEOUT_MS);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [src]);

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
            href={externalUrl}
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
              key={src}
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
                Carregando…
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
                <h2 className="text-lg font-bold mb-1">{title}</h2>
                <p className="text-sm text-muted-foreground mb-5">
                  Não foi possível carregar este app aqui dentro do Selva Spaces. Você pode abri-lo
                  em uma nova aba.
                </p>
                <a
                  href={externalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium px-4 py-2 hover:opacity-90 transition-opacity"
                >
                  <ExternalLink className="w-4 h-4" />
                  Abrir em nova aba
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </HubShell>
  );
}
