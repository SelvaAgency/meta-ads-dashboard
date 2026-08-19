/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Social — o cartão de métrica da faixa de dados gerais
 * ─────────────────────────────────────────────────────────────────────────────
 *  Quatro camadas, e a ordem delas é a hierarquia da leitura:
 *
 *    1. TOPO       ícone no matiz da família + selo de variação
 *    2. NÚMERO     o dado, grande. Nunca substituído por gráfico
 *    3. PROPORÇÃO  a composição, ABAIXO do número — barra + legenda
 *    4. RESSALVA   o que o número não diz
 *
 *  ── A barra não substitui o número, e isso é regra ─────────────────────────
 *  Trocar "1.284" por uma barra faria a tela ficar mais bonita e responder
 *  menos: ninguém lê valor em barra. As duas convivem porque respondem
 *  perguntas diferentes — quanto, e de que é feito.
 *
 *  ── O selo é colorido pela DIREÇÃO BOA, não pelo sinal ─────────────────────
 *  Hoje todas as métricas da Social sobem para melhor. Deixar `bom` explícito é
 *  o que impede que uma métrica de custo, no dia em que entrar aqui, apareça em
 *  verde por ter subido.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

export interface Parcela {
  rotulo: string;
  valor: number;
  cor: string;
}

/** Abaixo disto é ruído com cara de tendência. */
const PISO_PCT = 0.5;

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  O selo de variação — e, desde 19/08/2026, o gatilho do detalhamento
 * ─────────────────────────────────────────────────────────────────────────────
 *  Ele deixou de ser só um adorno do canto: passar o mouse sobre "↗ 12%" abre o
 *  painel que antes se alcançava pelo convite "o que compõe →" no rodapé.
 *
 *  ── Por que o convite saiu ─────────────────────────────────────────────────
 *  Ele ocupava uma linha no fim de todo cartão para dizer, em texto, algo que a
 *  interação já dizia. E ficava longe do número: ninguém mira o rodapé antes de
 *  decidir investigar — mira o dado que chamou a atenção, que é justamente a
 *  variação.
 *
 *  ── O caso que a regra nova cria: métrica sem variação ─────────────────────
 *  `pct == null` NÃO pode virar "0%" — isso afirmaria estabilidade sobre dias
 *  que ninguém mediu, e ninguém desconfia de um zero. Mas se o selo simplesmente
 *  desaparecer, o cartão perde o único caminho para o painel: a métrica com
 *  menos histórico seria a única impossível de investigar, que é o contrário do
 *  necessário.
 *
 *  A saída é um selo NEUTRO com traço — ele não afirma número nenhum, diz "sem
 *  comparação" ao passar o mouse, e mantém o painel alcançável.
 * ─────────────────────────────────────────────────────────────────────────────
 */
function Selo({ pct, anterior, bom, interativo }: {
  pct: number | null; anterior: number | null; bom: "sobe" | "cai";
  /** `true` quando o selo abre painel: ganha afordância, nunca outro conteúdo. */
  interativo?: boolean;
}) {
  const realce = interativo
    ? " cursor-pointer ring-1 ring-inset ring-transparent hover:ring-current/25"
      + " transition-[box-shadow,background-color] duration-150"
    : "";

  if (pct == null) {
    /*
     * ── Ausência não pode PARECER um valor medido ──────────────────────────
     * Esta caixa já usou o mesmo ícone do estado "estável" — um `Minus` dos
     * dois lados —, e aí "0,0% de variação" e "não há com o que comparar"
     * ficavam indistinguíveis no canto do cartão. Um deles é um fato sobre a
     * conta; o outro é um limite nosso, e trocá-los é pior que não mostrar
     * nada, porque um selo cinza com traço se lê como "não mudou".
     *
     * Sem ícone, sem fundo, e com o contorno tracejado que a página inteira usa
     * para dizer "aqui falta dado". O alvo de mouse continua, porque é por ele
     * que o painel abre — e é lá que a frase completa está.
     */
    return (
      <span className={`inline-flex items-center text-[11px] font-bold tabular-nums
                        px-2 py-1 rounded-full border border-dashed border-border
                        text-muted-foreground/60${realce}`}
        title="Sem período anterior comparável — a variação não é calculável, e não é zero">
        –
      </span>
    );
  }

  const plano = Math.abs(pct) <= PISO_PCT;
  const positivo = bom === "sobe" ? pct > 0 : pct < 0;
  const Icone = plano ? Minus : pct > 0 ? ArrowUpRight : ArrowDownRight;
  const tom = plano
    ? "bg-muted text-muted-foreground"
    : positivo
      ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-500"
      : "bg-destructive/12 text-destructive";

  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-bold tabular-nums
                      px-2 py-1 rounded-full ${tom}${realce}`}
      title={anterior != null ? `Período anterior: ${anterior.toLocaleString("pt-BR")}` : undefined}>
      <Icone className="w-3 h-3" strokeWidth={2.6} />
      {pct > 0 ? "+" : ""}{pct.toFixed(1)}%
    </span>
  );
}

export function CartaoGeral({
  icone: Icone, cor, rotulo, valor, detalhe, parcelas, ressalva, explicacao,
  variacaoPct, anterior, bom = "sobe", grafico, evolucao, envolverSelo,
}: {
  icone: LucideIcon;
  /** O matiz da família — o mesmo do gráfico e da legenda desta métrica. */
  cor: string;
  rotulo: string;
  valor: string;
  detalhe?: string | null;
  parcelas?: Parcela[];
  ressalva?: string | null;
  variacaoPct?: number | null;
  anterior?: number | null;
  bom?: "sobe" | "cai";
  /** O que a métrica mede, no tooltip. Só o que a ressalva não já disser. */
  explicacao?: string | null;
  /**
   * O mini-gráfico dentro do cartão.
   *
   * Existe porque "Ativações por dia" era uma seção de largura cheia para
   * responder uma pergunta que pertence a este cartão. Aqui ele fica abaixo do
   * número e acima da composição: o número diz quanto, o gráfico diz quando, a
   * barra diz de quê.
   */
  grafico?: React.ReactNode;
  /**
   * A mini-linha de tendência — sempre visível, e sempre do histórico máximo.
   *
   * Ela NÃO segue o filtro de período, e isso é a decisão inteira: com "Hoje"
   * selecionado, uma linha de um ponto repetiria o número em forma de desenho.
   * Tendência só existe olhando mais longe que o recorte.
   *
   * Fica DEPOIS da composição e antes da ressalva: é leitura de apoio, e subiria
   * acima do número se dividisse espaço com ele.
   */
  evolucao?: React.ReactNode;
  /**
   * Envolve o SELO DE VARIAÇÃO com o que abrir o detalhamento.
   *
   * A função recebe o selo pronto e devolve ele embrulhado — normalmente num
   * `PainelDaMetrica`. É assim, e não com um `onClick`, porque quem abre o
   * painel precisa ser o gatilho do Radix: ele cola ref e handlers no elemento,
   * e o cartão não tem como saber quais.
   *
   * Sem ela o selo continua aparecendo, apenas inerte — nenhum cartão fica
   * dependente de um painel para mostrar a variação.
   */
  envolverSelo?: (selo: React.ReactNode) => React.ReactNode;
}) {
  const [realce, setRealce] = useState<string | null>(null);
  const vazio = valor === "–";
  const total = (parcelas ?? []).reduce((n, p) => n + p.valor, 0);

  return (
    /* O realce é do CARTÃO inteiro, não de um detalhe dele: o que o mouse marca
       é "estou lendo esta métrica". Fundo levíssimo e 160ms — passar o mouse
       pela faixa não pode virar uma sequência de piscadas.

       O realce mais forte de "isto abre" saiu daqui junto com o clique no
       cartão: agora quem abre é o selo, e destacar a área inteira prometeria um
       alvo que não existe mais. */
    <div className="group flex flex-col flex-1 px-4 py-4 min-w-0 text-left w-full
                    transition-colors duration-150 hover:bg-foreground/[0.02]">
      <div className="flex items-start justify-between gap-2 mb-3">
        <span className="w-8 h-8 rounded-[10px] grid place-items-center flex-shrink-0 transition-colors duration-150"
          style={{ background: `${cor}29`, color: cor }}>
          <Icone className="w-4 h-4" strokeWidth={2.2} />
        </span>
        {(() => {
          const selo = (
            <Selo pct={variacaoPct ?? null} anterior={anterior ?? null} bom={bom}
              interativo={!!envolverSelo} />
          );
          return envolverSelo ? envolverSelo(selo) : selo;
        })()}
      </div>

      <span className="text-[10px] font-semibold uppercase tracking-[0.13em] text-muted-foreground mb-1"
        title={explicacao ?? undefined}>
        {rotulo}
      </span>
      <span className={`text-[28px] font-bold tabular-nums leading-none tracking-tight ${
        vazio ? "text-muted-foreground/40" : "text-foreground"}`}>
        {valor}
      </span>
      {detalhe && <span className="text-[11px] text-muted-foreground mt-1.5">{detalhe}</span>}

      {/* O mini-gráfico logo abaixo do número: mesma métrica, mesma pergunta em
          duas dimensões. Antes da barra de composição, porque tempo vem antes
          de "de que é feito". */}
      {grafico && <div className="mt-3 -mx-1">{grafico}</div>}

      {/* A barra de proporção: cada faixa cresce pelo próprio valor. Só aparece
          quando há mais de uma parcela — com uma só, ela seria uma barra cheia
          dizendo "100% de si mesma". */}
      {parcelas && parcelas.length > 1 && total > 0 && (
        <>
          {/* Legenda e barra são a MESMA informação em dois lugares. O mouse
              sobre uma delas apaga as outras parcelas, e aí não é preciso
              adivinhar qual faixa é "salvamentos" — a correspondência aparece
              em vez de ser deduzida por ordem. */}
          <span className="flex h-[7px] rounded-full overflow-hidden mt-3 bg-muted">
            {parcelas.filter((p) => p.valor > 0).map((p) => (
              <span key={p.rotulo}
                style={{
                  flexGrow: p.valor, background: p.cor,
                  opacity: realce && realce !== p.rotulo ? 0.28 : 1,
                  transition: "opacity 140ms ease",
                }}
                onMouseEnter={() => setRealce(p.rotulo)}
                onMouseLeave={() => setRealce(null)}
                title={`${p.rotulo}: ${p.valor.toLocaleString("pt-BR")} (${Math.round(p.valor / total * 100)}%)`} />
            ))}
          </span>
          <span className="flex flex-wrap gap-x-2.5 gap-y-1 mt-2">
            {parcelas.map((p) => (
              <span key={p.rotulo}
                className={`inline-flex items-center gap-1.5 text-[10.5px] transition-colors duration-150 ${
                  realce === p.rotulo ? "text-foreground font-semibold" : "text-muted-foreground"}`}
                onMouseEnter={() => setRealce(p.rotulo)}
                onMouseLeave={() => setRealce(null)}
                title={`${Math.round(p.valor / total * 100)}% do total`}>
                <i className="w-2 h-2 rounded-[3px] flex-shrink-0" style={{ background: p.cor }} />
                {p.valor.toLocaleString("pt-BR")} {p.rotulo}
              </span>
            ))}
          </span>
        </>
      )}

      {evolucao && <div className="mt-2.5">{evolucao}</div>}

      {ressalva && (
        <span className="text-[10px] text-muted-foreground/60 leading-snug mt-2">{ressalva}</span>
      )}

      {/*
       * ── O que morava aqui ─────────────────────────────────────────────────
       * O convite "o que compõe →". Ele gastava uma linha no fim de todo cartão
       * para anunciar em texto o que a interação já faz, e ficava longe do
       * número: ninguém mira o rodapé antes de decidir investigar. O gatilho é
       * o selo de variação, no topo — o próprio dado que chama a atenção.
       */}
    </div>
  );
}


/**
 * Uma métrica dentro de um card agrupado.
 *
 * Existe para "Interações com o perfil", onde visitas e cliques dividem um card
 * mas continuam sendo dois números. Somá-los criaria uma métrica que ninguém
 * mede — a agrupação é só visual, porque são duas ações sobre o mesmo objeto.
 */
export function MetricaDoPerfil({
  rotulo, valor, variacaoPct, anterior, ressalva, evolucao, envolverSelo,
}: {
  rotulo: string; valor: string;
  variacaoPct?: number | null; anterior?: number | null; ressalva?: string | null;
  /** A mini-linha de tendência — histórico máximo, nunca o período do filtro. */
  evolucao?: React.ReactNode;
  /** Mesmo contrato do cartão: o selo é o gatilho do detalhamento. */
  envolverSelo?: (selo: React.ReactNode) => React.ReactNode;
}) {
  const vazio = valor === "–";
  return (
    <div className="group/metrica min-w-0">
      <div className="flex items-baseline justify-between gap-1.5 mb-0.5">
        <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/70 truncate">
          {rotulo}
        </span>
        {(() => {
          const selo = (
            <Selo pct={variacaoPct ?? null} anterior={anterior ?? null} bom="sobe"
              interativo={!!envolverSelo} />
          );
          return envolverSelo ? envolverSelo(selo) : selo;
        })()}
      </div>
      <span className={`block text-[22px] font-bold tabular-nums leading-none tracking-tight ${
        vazio ? "text-muted-foreground/40" : "text-foreground"}`}>
        {valor}
      </span>
      {evolucao && <div className="mt-2">{evolucao}</div>}
      {ressalva && (
        <span className="block text-[10px] text-muted-foreground/60 leading-snug mt-1.5">{ressalva}</span>
      )}
    </div>
  );
}

/*
 * ── O que morava aqui ──────────────────────────────────────────────────────
 * `MiniTendencia`: uma linha fina, sem eixo e sem área. Ela parecia decoração,
 * e decoração ninguém lê como dado. Foi substituída por `MiniEvolucao`, em
 * `GraficosSociais.tsx`, que é a MESMA `CurvaHistorica` da Evolução da Base —
 * só menor. Imitar o gráfico grande criaria dois desenhos que divergem no
 * primeiro ajuste feito só num deles; reusá-lo garante que continuem iguais.
 */
