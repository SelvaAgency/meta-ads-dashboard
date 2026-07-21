import { useState, useEffect, useRef, type ReactNode } from "react";
import { ChevronDown, ChevronRight, AlertTriangle } from "lucide-react";

/**
 * Seção recolhível das abas Performance e Técnico.
 *
 * Existe para trocar "cinco abas com um painel cada" por "duas abas com
 * seções": o conteúdo continua todo lá, mas quem abre a tela vê a estrutura
 * inteira de uma vez em vez de precisar caçar em qual aba estava a informação.
 *
 * O cabeçalho carrega uma frase de estado — o que está acontecendo — para a
 * seção fechada ainda informar. Seção recolhida que não diz nada obriga a
 * abrir todas, e aí recolher não serviu para nada.
 */
export function Secao({
  id, titulo, icone, estado, alerta, aberta: abertaInicial = false, destaque = false, children,
}: {
  id: string;
  titulo: string;
  icone?: ReactNode;
  /** Uma linha de resumo, visível mesmo fechada. */
  estado?: string;
  /** Aviso âmbar discreto — fonte com erro, por exemplo. Nunca banner vermelho. */
  alerta?: string;
  aberta?: boolean;
  /** Chamou a atenção via deep-link: pisca a borda para localizar. */
  destaque?: boolean;
  children: ReactNode;
}) {
  const [aberta, setAberta] = useState(abertaInicial);
  const ref = useRef<HTMLDivElement>(null);

  // Deep-link: quando esta é a seção do alerta, abre e rola até ela.
  useEffect(() => {
    if (!destaque) return;
    setAberta(true);
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [destaque]);

  return (
    <div
      ref={ref}
      id={`secao-${id}`}
      className={`rounded-lg border transition-colors ${destaque ? "border-accent/60" : "border-border"} bg-card`}
    >
      <button
        onClick={() => setAberta((v) => !v)}
        className="w-full flex items-start gap-2.5 px-4 py-3 text-left hover:bg-muted/30 transition rounded-lg"
        aria-expanded={aberta}
      >
        <span className="mt-0.5 text-muted-foreground shrink-0">
          {aberta ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </span>
        {icone && <span className="mt-0.5 text-muted-foreground shrink-0">{icone}</span>}
        <span className="flex-1 min-w-0">
          <span className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-foreground">{titulo}</span>
            {alerta && (
              <span className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded bg-amber-500/12 text-amber-600 dark:text-amber-400">
                <AlertTriangle className="w-3 h-3" /> {alerta}
              </span>
            )}
          </span>
          {estado && <span className="block text-xs text-muted-foreground mt-0.5">{estado}</span>}
        </span>
      </button>
      {aberta && <div className="px-4 pb-4 pt-1">{children}</div>}
    </div>
  );
}

/**
 * Fonte não conectada. Uma linha, nunca um card.
 *
 * A regra da F1 aplicada à tela: dado ausente não pode ocupar espaço útil nem
 * parecer um painel quebrado — mas também não pode sumir sem explicação, senão
 * o time acha que a integração existe e está zerada.
 */
export function FonteAusente({ texto }: { texto: string }) {
  return <p className="text-xs text-muted-foreground/70 px-1 py-2">{texto}</p>;
}
