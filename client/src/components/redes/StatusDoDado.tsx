/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  "Posso confiar neste número?" — respondido antes de o número ser lido
 * ─────────────────────────────────────────────────────────────────────────────
 *  Componente de rede NENHUMA: recebe um `StatusDoCliente` já resolvido e
 *  desenha. Quem calcula é `shared/statusDoCliente`, que por sua vez só olha
 *  snapshots — então LinkedIn e qualquer rede futura usam os dois sem mudar uma
 *  linha aqui.
 *
 *  ── Discreto, e sempre presente ────────────────────────────────────────────
 *  Uma linha no cabeçalho, do tamanho de um rótulo. A tentação seria dar a ele
 *  o peso do problema que representa — mas um bloco grande no topo de toda
 *  conta saudável ensina a pular a região onde o aviso vai aparecer no dia em
 *  que houver um.
 *
 *  Por isso a lista de métricas atualizadas vive num `<details>`: ela responde
 *  "o que exatamente veio", que é a terceira pergunta de quem já desconfiou —
 *  não a primeira de quem só quer olhar um gráfico.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import type { StatusDoCliente } from "@shared/statusDoCliente";

const CORES: Record<StatusDoCliente["nivel"], string> = {
  ok: "text-emerald-600 dark:text-emerald-500",
  atencao: "text-amber-600 dark:text-amber-500",
  erro: "text-destructive",
  nunca: "text-muted-foreground",
};

const MARCAS: Record<StatusDoCliente["nivel"], string> = {
  ok: "✓", atencao: "⚠", erro: "⚠", nunca: "—",
};

export function StatusDoDado({ status }: { status: StatusDoCliente }) {
  const temDetalhe = status.atualizados.length > 0 || status.faltando.length > 0;

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className={`text-[11px] font-medium ${CORES[status.nivel]}`}>
          {MARCAS[status.nivel]} {status.principal}
        </span>
        {status.secundaria && (
          <span className="text-[11px] text-muted-foreground">· {status.secundaria}</span>
        )}
      </div>

      {temDetalhe && (
        <details className="text-[10px] text-muted-foreground">
          <summary className="cursor-pointer select-none hover:text-foreground w-fit">
            o que foi atualizado
          </summary>
          <div className="mt-1 flex flex-col gap-0.5 pl-3">
            {status.atualizados.length > 0 && (
              <p><span className="text-emerald-600 dark:text-emerald-500">✓</span> {status.atualizados.join(", ")}</p>
            )}
            {status.faltando.length > 0 && (
              <p><span className="text-amber-600 dark:text-amber-500">—</span> sem dado: {status.faltando.join(", ")}</p>
            )}
          </div>
        </details>
      )}
    </div>
  );
}
