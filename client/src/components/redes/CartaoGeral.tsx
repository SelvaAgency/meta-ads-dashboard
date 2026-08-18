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

function Selo({ pct, anterior, bom }: {
  pct: number | null; anterior: number | null; bom: "sobe" | "cai";
}) {
  // Sem variação calculável, NÃO há selo. Um "0%" afirmaria estabilidade sobre
  // dias que ninguém mediu — e ninguém desconfia de um zero.
  if (pct == null) return null;

  const plano = Math.abs(pct) <= PISO_PCT;
  const positivo = bom === "sobe" ? pct > 0 : pct < 0;
  const Icone = plano ? Minus : pct > 0 ? ArrowUpRight : ArrowDownRight;
  const tom = plano
    ? "bg-muted text-muted-foreground"
    : positivo
      ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-500"
      : "bg-destructive/12 text-destructive";

  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-bold tabular-nums px-2 py-1 rounded-full ${tom}`}
      title={anterior != null ? `Período anterior: ${anterior.toLocaleString("pt-BR")}` : undefined}>
      <Icone className="w-3 h-3" strokeWidth={2.6} />
      {pct > 0 ? "+" : ""}{pct.toFixed(1)}%
    </span>
  );
}

export function CartaoGeral({
  icone: Icone, cor, rotulo, valor, detalhe, parcelas, ressalva, explicacao,
  variacaoPct, anterior, bom = "sobe", grafico, evolucao, clicavel, acao,
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
   * `true` quando o cartão abre um painel. Muda só a afordância — o cursor e o
   * convite —, nunca o conteúdo: um cartão que parece clicável e não é ensina a
   * não clicar em mais nada.
   */
  clicavel?: boolean;
  /** O convite, quando há painel. */
  acao?: string | null;
}) {
  const [realce, setRealce] = useState<string | null>(null);
  const vazio = valor === "–";
  const total = (parcelas ?? []).reduce((n, p) => n + p.valor, 0);

  return (
    /* O realce é do CARTÃO inteiro, não de um detalhe dele: o que o mouse marca
       é "estou lendo esta métrica". Fundo levíssimo e 160ms — passar o mouse
       pela faixa não pode virar uma sequência de piscadas. */
    /* O cartão clicável reage MAIS que o comum: 4% contra 2%. A diferença
       precisa ser perceptível, senão o realce vira só "o mouse está aqui" e não
       "isto abre". O convite de rodapé sozinho não bastava — ele fica no fim do
       cartão, e ninguém mira ali antes de decidir clicar. */
    <div className={`group flex flex-col flex-1 px-4 py-4 min-w-0 text-left w-full
                     transition-colors duration-150 ${
      clicavel
        ? "cursor-pointer hover:bg-foreground/[0.04]"
        : "hover:bg-foreground/[0.02]"}`}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <span className="w-8 h-8 rounded-[10px] grid place-items-center flex-shrink-0 transition-colors duration-150"
          style={{ background: `${cor}29`, color: cor }}>
          <Icone className="w-4 h-4" strokeWidth={2.2} />
        </span>
        <Selo pct={variacaoPct ?? null} anterior={anterior ?? null} bom={bom} />
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

      {/* O convite fica no fim e é discreto: ele diz que há mais, sem competir
          com o número que é o assunto do cartão. */}
      {acao && (
        <span className="block text-[10px] mt-auto pt-2 text-muted-foreground/55
                         group-hover:text-foreground transition-colors duration-150">
          {acao} →
        </span>
      )}
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
  rotulo, valor, variacaoPct, anterior, ressalva, acao, evolucao,
}: {
  rotulo: string; valor: string;
  variacaoPct?: number | null; anterior?: number | null; ressalva?: string | null;
  /** A mini-linha de tendência — histórico máximo, nunca o período do filtro. */
  evolucao?: React.ReactNode;
  /**
   * O convite, quando a métrica abre algo. Sem ele, um número clicável é
   * indistinguível de um número comum — e ninguém descobre o painel.
   */
  acao?: string | null;
}) {
  const vazio = valor === "–";
  return (
    <div className="group/metrica min-w-0">
      <div className="flex items-baseline justify-between gap-1.5 mb-0.5">
        <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/70 truncate">
          {rotulo}
        </span>
        <Selo pct={variacaoPct ?? null} anterior={anterior ?? null} bom="sobe" />
      </div>
      <span className={`block text-[22px] font-bold tabular-nums leading-none tracking-tight ${
        vazio ? "text-muted-foreground/40" : "text-foreground"}`}>
        {valor}
      </span>
      {evolucao && <div className="mt-2">{evolucao}</div>}
      {ressalva && (
        <span className="block text-[10px] text-muted-foreground/60 leading-snug mt-1.5">{ressalva}</span>
      )}
      {acao && (
        <span className="block text-[10px] mt-1.5 text-muted-foreground/60
                         group-hover/metrica:text-foreground transition-colors duration-150">
          {acao} →
        </span>
      )}
    </div>
  );
}


/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  A mini-linha de tendência do cartão
 * ─────────────────────────────────────────────────────────────────────────────
 *  Discreta de propósito: sem eixo, sem grade, sem rótulo de valor. Ela responde
 *  "está subindo ou caindo", e qualquer número desenhado aqui competiria com o
 *  que está logo acima — que é o número de verdade, do período selecionado.
 *
 *  ── O rótulo diz que ela ignora o filtro ───────────────────────────────────
 *  Sem isso, quem trocasse o período para "Hoje" veria o número mudar e a linha
 *  não, e concluiria que a tela travou. "N dias" ao lado resolve em duas
 *  palavras o que um parágrafo explicaria.
 *
 *  ── A linha QUEBRA no dia sem medição ──────────────────────────────────────
 *  Ligar os dois lados desenharia uma inclinação que ninguém mediu, e a
 *  interpolação é exatamente o que um dia sem coleta não autoriza.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function MiniTendencia({ dias, cor, altura = 30 }: {
  dias: Array<{ dia: string; valor: number | null }>;
  cor: string;
  altura?: number;
}) {
  const [ativo, setAtivo] = useState<number | null>(null);
  const medidos = dias.filter((d) => d.valor != null);
  if (medidos.length < 2) return null;

  const W = 200, mt = 3, mb = 3;
  const ih = altura - mt - mb;
  const valores = medidos.map((d) => d.valor as number);
  const max = Math.max(...valores);
  const min = Math.min(...valores);
  const amplitude = Math.max(1, max - min);

  const passo = W / Math.max(1, dias.length - 1);
  const x = (i: number) => i * passo;
  const y = (v: number) => mt + ih - ((v - min) / amplitude) * ih;

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

  const emFoco = ativo != null ? dias[ativo] : null;

  return (
    <div className="flex flex-col gap-0.5" onMouseLeave={() => setAtivo(null)}>
      <svg viewBox={`0 0 ${W} ${altura}`} width="100%" height={altura} preserveAspectRatio="none"
        role="img" aria-label="Tendência no histórico disponível">
        {partes.map((d, i) => (
          <path key={i} d={d} fill="none" stroke={cor} strokeWidth={1.6}
            vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round"
            opacity={ativo == null ? 0.9 : 0.45} />
        ))}
        {emFoco?.valor != null && ativo != null && (
          <circle cx={x(ativo)} cy={y(emFoco.valor)} r={2.6} fill={cor}
            vectorEffect="non-scaling-stroke" />
        )}
        {/* Captura por último, uma faixa por ponto — inclusive os não medidos,
            que respondem "sem coleta" em vez de silêncio. */}
        {dias.map((d, i) => (
          <rect key={d.dia} x={x(i) - passo / 2} y={0} width={passo} height={altura}
            fill="transparent" style={{ cursor: "pointer" }}
            onMouseEnter={() => setAtivo(i)} />
        ))}
      </svg>
      {/* Altura fixa: aparecer e sumir mexeria na altura do cartão a cada
          movimento do mouse, e os vizinhos pulariam junto. */}
      <span className="block text-[9px] text-muted-foreground/60 tabular-nums min-h-[12px] truncate">
        {emFoco
          ? `${emFoco.dia.slice(8, 10)}/${emFoco.dia.slice(5, 7)} · ${
              emFoco.valor == null ? "sem coleta" : emFoco.valor.toLocaleString("pt-BR")}`
          : `evolução · ${medidos.length} dias de histórico`}
      </span>
    </div>
  );
}
