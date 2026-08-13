/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  "Posso confiar neste número?" — respondido antes de o número ser lido
 * ─────────────────────────────────────────────────────────────────────────────
 *  Componente de rede NENHUMA: recebe um `StatusDoCliente` já resolvido e
 *  desenha. Quem calcula é `shared/statusDoCliente`, que por sua vez só olha
 *  snapshots — então LinkedIn e qualquer rede futura usam os dois sem mudar uma
 *  linha aqui.
 *
 *  ── A hierarquia, e por que a origem é secundária ──────────────────────────
 *  Quem analisa uma conta pergunta "quando isso foi atualizado?" — e não "foi o
 *  robô ou foi alguém?". A hora vem primeiro e sozinha; a origem entra depois
 *  do separador, para auditoria.
 *
 *    1. Dados atualizados hoje às 12:57
 *    2. · Coleta manual
 *    3. o que foi atualizado          (detalhe)
 *    4. saúde do robô                 (detalhe, admin/dev)
 *
 *  A saúde do cron desceu para o quarto nível de propósito. Ela já ocupou o topo
 *  da página, e ali dizia "coleta automática ainda não rodou" em contas com dado
 *  fresco — alarme sobre um problema que não existia para quem estava lendo. Ela
 *  importa (cron morto com coletas manuais diárias é dado fresco e operação
 *  quebrada), mas é pergunta de quem cuida do robô, não de quem lê o número.
 *
 *  ── Discreto, e sempre presente ────────────────────────────────────────────
 *  Uma linha no cabeçalho, do tamanho de um rótulo. Um bloco grande em toda
 *  conta saudável ensina a pular a região onde o aviso vai aparecer no dia em
 *  que houver um.
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

export function StatusDoDado({ status, saudeDoRobo }: {
  status: StatusDoCliente;
  /** Saúde do cron, para admin/dev. Fica no detalhe — ver cabeçalho. */
  saudeDoRobo?: { titulo: string; detalhe: string; nivel: string } | null;
}) {
  const temDetalhe = status.atualizados.length > 0 || status.faltando.length > 0 || !!saudeDoRobo;

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
            {saudeDoRobo && (
              <p className="pt-1 border-t border-border/50 mt-1">
                <span className="font-medium">Robô:</span> {saudeDoRobo.titulo} · {saudeDoRobo.detalhe}
              </p>
            )}
          </div>
        </details>
      )}
    </div>
  );
}
