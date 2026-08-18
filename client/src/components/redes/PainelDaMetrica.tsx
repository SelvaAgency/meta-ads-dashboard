/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  O painel contextual de uma métrica — "como isso evoluiu no período?"
 * ─────────────────────────────────────────────────────────────────────────────
 *  Nasceu para cliques no link, onde um cartão permanente seria desproporcional:
 *  é o número menor da faixa e ocuparia a mesma área que engajamento. A pergunta
 *  "está subindo?" é legítima e não cabe num número só.
 *
 *  Virou genérico porque a pergunta vale para TODAS as métricas da faixa, e
 *  quatro painéis diferentes com a mesma forma seriam quatro lugares para a
 *  mesma decisão escorregar — quatro jeitos de quebrar a linha num dia sem
 *  coleta, quatro jeitos de recusar a comparação.
 *
 *  A saída é abrir a leitura A PARTIR do dado, e não ao lado dele. Enquanto
 *  ninguém pergunta, o painel não existe na página.
 *
 *  ── Por que popover em portal, e não uma caixa dentro da caixa ─────────────
 *  A caixa executiva tem `overflow-hidden` para arredondar os cantos, e um
 *  absolute lá dentro seria recortado pela borda. O Popover do Radix desenha no
 *  fim do body, então ele se posiciona pelo gatilho e ignora o recorte — e
 *  fecha por Esc e por clique fora, que é o que se espera de algo contextual.
 *
 *  ── A relação com a base é OPCIONAL, e por métrica ────────────────────────
 *  `taxaPorSeguidores` recusa divisor ausente ou zero — um "0,0%" ali afirmaria
 *  que os seguidores não clicam, quando o que houve foi não sabermos quantos
 *  são. Mas a proporção só faz sentido onde a métrica conta AÇÕES DE PESSOAS:
 *  cliques e visitas, sim; ativações, não — publicar 35 vezes não é "0,4% dos
 *  seguidores". Por isso quem chama decide, e o padrão é não mostrar.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { taxaPorSeguidores } from "@shared/engajamento";
import { COR } from "@shared/coresSociais";

const fmt = (v: number | null) => (v == null ? "–" : Math.round(v).toLocaleString("pt-BR"));

export interface DiaDaMetrica {
  dia: string;
  /** `null` = dia sem medição. A linha QUEBRA ali, e não interpola. */
  valor: number | null;
}

/**
 * A mini-série: linha só, sem eixo nem grade.
 *
 * O painel responde "está subindo ou caindo", e para isso a forma basta. Eixos
 * numa caixa de 260px roubariam metade da largura para repetir números que
 * estão escritos logo acima em tamanho legível.
 *
 * A linha QUEBRA no dia sem medição. Ligar os dois lados desenharia uma
 * inclinação que ninguém mediu, e a interpolação é exatamente o que um dia sem
 * coleta não autoriza.
 */
export function MiniSerie({ dias, cor, altura = 46 }: {
  dias: DiaDaMetrica[]; cor: string; altura?: number;
}) {
  const medidos = dias.filter((d) => d.valor != null);
  if (medidos.length < 2) {
    return (
      <p className="text-[10.5px] text-muted-foreground/70 py-2">
        A evolução aparece a partir de dois dias medidos.
      </p>
    );
  }

  const W = 260, mt = 4, mb = 4;
  const ih = altura - mt - mb;
  const max = Math.max(1, ...medidos.map((d) => d.valor as number));
  const passo = W / Math.max(1, dias.length);
  const x = (i: number) => (i + 0.5) * passo;
  const y = (v: number) => mt + ih - (v / max) * ih;

  const partes: string[] = [];
  let atual: string[] = [];
  dias.forEach((d, i) => {
    if (d.valor == null) {
      if (atual.length > 1) partes.push(atual.join(" "));
      atual = [];
      return;
    }
    atual.push(`${atual.length ? "L" : "M"}${x(i).toFixed(1)},${y(d.valor).toFixed(1)}`);
  });
  if (atual.length > 1) partes.push(atual.join(" "));

  const ultimo = dias.reduce((achado, d, i) => (d.valor != null ? i : achado), -1);

  return (
    <svg viewBox={`0 0 ${W} ${altura}`} width="100%" height={altura} role="img"
      aria-label="Evolução da métrica no período">
      <line x1={0} x2={W} y1={mt + ih} y2={mt + ih}
        className="stroke-border" strokeWidth={1} />
      {partes.map((d, i) => (
        <path key={i} d={d} fill="none" stroke={cor} strokeWidth={1.8}
          strokeLinecap="round" strokeLinejoin="round" />
      ))}
      {/* O último dia medido ganha ponto: é o valor que a pessoa quer conferir
          contra o total, e num traço fino de 260px a ponta se perde. */}
      {ultimo >= 0 && (
        <circle cx={x(ultimo)} cy={y(dias[ultimo].valor as number)} r={2.6} fill={cor} />
      )}
    </svg>
  );
}

export function PainelDaMetrica({
  rotulo, cor, dias, total, formato = "numero", variacaoPct, anterior,
  motivoSemComparacao, seguidores, procedencia, extra, children,
}: {
  rotulo: string;
  /** O matiz da família — o mesmo do cartão que abriu o painel. */
  cor: string;
  dias: DiaDaMetrica[];
  total: number | null;
  formato?: "numero" | "percentual";
  variacaoPct: number | null;
  anterior: number | null;
  /** Por que a comparação foi recusada, quando foi. */
  motivoSemComparacao?: string | null;
  /**
   * A base, para a proporção. `undefined` NÃO mostra o bloco.
   *
   * Só passe onde a métrica conta ação de pessoa. "35 ativações = 0,4% dos
   * seguidores" é uma frase sem sentido — publicar não é uma ação deles.
   */
  seguidores?: number | null;
  /** De onde o número vem, em uma linha. Some quando não há o que explicar. */
  procedencia?: React.ReactNode;
  /** Composição, ressalva — o que for específico daquela métrica. */
  extra?: React.ReactNode;
  /** O gatilho — a própria métrica na faixa. */
  children: React.ReactNode;
}) {
  const porSeguidores = seguidores === undefined ? null : taxaPorSeguidores(total, seguidores);
  const medidos = dias.filter((d) => d.valor != null).length;
  const grande = total == null ? "–"
    : formato === "percentual" ? `${total.toFixed(1).replace(".", ",")}%`
    : fmt(total);

  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="start" sideOffset={10} className="w-[292px] p-4 rounded-[14px]">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[10px] font-bold uppercase tracking-[0.13em] text-muted-foreground">
            {rotulo}
          </span>
          <span className="text-[10px] text-muted-foreground/60">{medidos} dia(s) medido(s)</span>
        </div>

        <span className="block text-[26px] font-bold tabular-nums leading-none tracking-tight mt-2"
          style={{ color: cor }}>
          {grande}
        </span>

        <div className="mt-3">
          <MiniSerie dias={dias} cor={cor} />
        </div>

        {extra && <div className="mt-3">{extra}</div>}

        <dl className={`grid gap-x-3 gap-y-2.5 mt-3 pt-3 border-t border-border ${
          porSeguidores == null && seguidores === undefined ? "grid-cols-1" : "grid-cols-2"}`}>
          <div>
            <dt className="text-[9.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/70">
              Período anterior
            </dt>
            {/* A comparação é recusada, e não aproximada: o motivo vem de
                `compararComAnterior`, que se nega a comparar janelas de
                tamanhos diferentes — um buraco de coleta leria como queda. */}
            <dd className="text-[13px] font-bold tabular-nums mt-0.5">
              {anterior == null ? (
                <span className="text-muted-foreground/50 font-normal text-[11px]">
                  {motivoSemComparacao ?? "sem período anterior medido"}
                </span>
              ) : (
                <>
                  {fmt(anterior)}
                  {variacaoPct != null && (
                    <span className={`ml-1.5 text-[11px] ${
                      variacaoPct > 0 ? "text-emerald-600" : variacaoPct < 0 ? "text-destructive"
                        : "text-muted-foreground"}`}>
                      {variacaoPct > 0 ? "+" : ""}{variacaoPct.toFixed(1)}%
                    </span>
                  )}
                </>
              )}
            </dd>
          </div>
          {/* A proporção da base só aparece onde ela significa algo — ver o
              comentário de `seguidores`. */}
          {seguidores !== undefined && (
            <div>
              <dt className="text-[9.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/70">
                Da base
              </dt>
              <dd className="text-[13px] font-bold tabular-nums mt-0.5">
                {porSeguidores == null ? (
                  <span className="text-muted-foreground/50 font-normal text-[11px]">
                    sem total de seguidores
                  </span>
                ) : (
                  <>
                    {porSeguidores.toFixed(2).replace(".", ",")}%
                    <span className="block text-[10px] text-muted-foreground/60 font-normal">
                      de {fmt(seguidores)} seguidores
                    </span>
                  </>
                )}
              </dd>
            </div>
          )}
        </dl>

        {procedencia && (
          <p className="text-[9.5px] text-muted-foreground/55 leading-snug mt-3">{procedencia}</p>
        )}
      </PopoverContent>
    </Popover>
  );
}
