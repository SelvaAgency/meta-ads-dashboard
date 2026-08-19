/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  O painel contextual de uma métrica — o que o cartão NÃO cabe
 * ─────────────────────────────────────────────────────────────────────────────
 *  Ele já foi "a evolução". Deixou de ser em 18/08/2026, quando a mini-linha
 *  passou a viver dentro do próprio cartão, sempre visível. Um painel que
 *  ampliasse o mesmo gráfico cobraria um clique para não acrescentar nada.
 *
 *  O que sobrou aqui é o que não cabe no cartão: a comparação com o período
 *  anterior, a proporção da base, a composição e a procedência do número. É
 *  detalhamento complementar, e não uma segunda versão do que já está na tela.
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
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { taxaPorSeguidores } from "@shared/engajamento";
import { COR } from "@shared/coresSociais";

const fmt = (v: number | null) => (v == null ? "–" : Math.round(v).toLocaleString("pt-BR"));

export interface DiaDaMetrica {
  dia: string;
  /** `null` = dia sem medição. A linha QUEBRA ali, e não interpola. */
  valor: number | null;
}

/*
 * ── O que morava aqui ──────────────────────────────────────────────────────
 * `MiniSerie`. Ela desenhava a evolução DO PERÍODO dentro do painel, e foi
 * substituída pela `MiniTendencia` do cartão — que é sempre visível e usa o
 * histórico máximo, não o recorte. Duas linhas da mesma métrica, uma atrás de
 * um clique e cada uma com um recorte diferente, seriam duas respostas para a
 * mesma pergunta.
 */

export function PainelDaMetrica({
  rotulo, cor, dias, total, formato = "numero", variacaoPct, anterior,
  seguidores, procedencia, extra, children,
}: {
  rotulo: string;
  /** O matiz da família — o mesmo do cartão que abriu o painel. */
  cor: string;
  dias: DiaDaMetrica[];
  total: number | null;
  formato?: "numero" | "percentual";
  variacaoPct: number | null;
  anterior: number | null;
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
  /**
   * O gatilho — o SELO DE VARIAÇÃO do cartão, e não o cartão inteiro.
   *
   * Ele chega cru; o botão que o Radix precisa é montado aqui embaixo. Deixar
   * isso a cargo de quem chama daria quatro chances de esquecer o elemento DOM,
   * e o sintoma disso é mudo: o painel simplesmente não abre.
   */
  children: React.ReactNode;
}) {
  const porSeguidores = seguidores === undefined ? null : taxaPorSeguidores(total, seguidores);
  // `dias` ficou só pela CONTAGEM: quantos dias do período têm medição é
  // ressalva do número grande, e não sobrevive no cartão.
  const medidos = dias.filter((d) => d.valor != null).length;
  const grande = total == null ? "–"
    : formato === "percentual" ? `${total.toFixed(1).replace(".", ",")}%`
    : fmt(total);

  return (
    /*
     * ── Hover, e não clique ──────────────────────────────────────────────────
     * O alvo é um selo de ~56px: exigir clique nele seria pedir pontaria para
     * uma leitura de apoio. `openDelay` de 120ms impede que atravessar a faixa
     * de cartões acenda quatro painéis em sequência; `closeDelay` de 100ms dá
     * tempo de o mouse chegar ao conteúdo sem ele fugir no caminho.
     *
     * O clique continua funcionando: o gatilho é um `<button>`, então teclado e
     * toque — onde não existe hover — chegam ao mesmo painel.
     */
    <HoverCard openDelay={120} closeDelay={100}>
      <HoverCardTrigger asChild>
        <button type="button"
          className="inline-flex rounded-full focus-visible:outline-none
                     focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1">
          {children}
        </button>
      </HoverCardTrigger>
      <HoverCardContent align="end" sideOffset={8} className="w-[292px] p-4 rounded-[14px]">
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

        {extra && <div className="mt-3">{extra}</div>}

        <dl className={`grid gap-x-3 gap-y-2.5 mt-3 pt-3 border-t border-border ${
          porSeguidores == null && seguidores === undefined ? "grid-cols-1" : "grid-cols-2"}`}>
          <div>
            <dt className="text-[9.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/70">
              Período anterior
            </dt>
            {/*
                Este slot diz UMA coisa: se há período anterior para comparar.

                Ele recebia o aviso de horários de coleta desencontrados, que é
                outro assunto — e o resultado era a mesma explicação longa
                repetida nos quatro painéis, ocupando o lugar de um número. Pior:
                mentia por omissão, porque "coletas em horários diferentes" NÃO
                é a razão de `anterior` ser nulo. As duas coisas se confundiam
                num slot só.

                O aviso de horários continua na página, uma vez, abaixo da faixa
                de dados gerais — que é onde ele vale para todas as métricas de
                uma vez, em vez de quatro vezes.
            */}
            <dd className="text-[13px] font-bold tabular-nums mt-0.5">
              {anterior == null ? (
                <span className="text-muted-foreground/50 font-normal text-[11px]">
                  sem período anterior medido
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
      </HoverCardContent>
    </HoverCard>
  );
}
