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
 *   · Spinner enquanto carrega; se não carregar, cai num fallback com
 *     "Tentar de novo" — e não mais com "Abrir em nova aba", que era a porta
 *     de fuga para rodar o app solto fora do shell. Como o iframe é do MESMO
 *     deploy e mesma origem, "não carregou" aqui é lentidão, não bloqueio.
 *   · O app embutido NÃO é alterado — só é embutido via iframe.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useEffect, useRef, useState } from "react";
import { Loader2, MonitorX, RotateCw } from "lucide-react";
import { HubShell } from "./HubShell";

type Status = "loading" | "loaded" | "fallback";

// Se o iframe não sinalizar carregamento nesse tempo, mostramos o fallback.
const LOAD_TIMEOUT_MS = 12000;

interface HubIntegratedAppProps {
  /** Título principal na barra fina (ex.: "Tracker" ou "Tracker · LACLIMA"). */
  title: string;
  /** URL embutida no iframe. */
  src: string;
}

export function HubIntegratedApp({ title, src }: HubIntegratedAppProps) {
  const [status, setStatus] = useState<Status>("loading");
  const [tentativa, setTentativa] = useState(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reinicia o estado sempre que a URL embutida muda (ou ao tentar de novo).
  useEffect(() => {
    setStatus("loading");
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setStatus((s) => (s === "loaded" ? s : "fallback"));
    }, LOAD_TIMEOUT_MS);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [src, tentativa]);

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
        </div>

        {/* Área do app */}
        <div className="relative flex-1 min-h-0 bg-secondary/40">
          {status !== "fallback" && (
            <iframe
              key={`${src}#${tentativa}`}
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
                  Este app demorou mais que o esperado para carregar. Normalmente é lentidão de
                  conexão — tentar de novo costuma resolver.
                </p>
                <button
                  onClick={() => setTentativa((t) => t + 1)}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium px-4 py-2 hover:opacity-90 transition-opacity"
                >
                  <RotateCw className="w-4 h-4" />
                  Tentar de novo
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </HubShell>
  );
}
