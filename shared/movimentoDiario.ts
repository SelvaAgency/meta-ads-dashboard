/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Movimento diário — a variação líquida, e só ela
 * ─────────────────────────────────────────────────────────────────────────────
 *  Puro. A única fonte é `followers_count`: a fotografia do total naquele dia.
 *
 *  ── Por que entradas e saídas saíram ───────────────────────────────────────
 *  O diagnóstico de 18/08/2026 REFUTOU a hipótese de que FOLLOWER e
 *  NON_FOLLOWER sejam entradas e saídas — a identidade contábil não fechou. E
 *  `follower_count` sozinho não separa nada: ele conta entradas, e a saída que
 *  saía dele era `entradas − saldo`, uma subtração sem fonte independente que
 *  provasse representar as saídas reais.
 *
 *  Um saldo de +8 pode ser 8 entradas e 0 saídas, ou 100 e 92. As duas
 *  histórias são o mesmo número, e nenhuma subtração as separa. Então a tela
 *  passa a mostrar o que ela realmente mede: quanto a base variou por dia.
 *
 *  ── A soma TEM de fechar, e é isso que este módulo garante ─────────────────
 *  As variações diárias telescopam: (t₂−t₁) + (t₃−t₂) + … = tₙ − t₁. Ou seja, a
 *  soma das barras é exatamente a variação do período que aparece no número
 *  grande — desde que nenhuma medição seja pulada no caminho.
 *
 *  É por isso que `fecha` existe. Ele não é decoração: é a prova de que o
 *  gráfico e o número grande falam da mesma coisa. Se alguém um dia filtrar um
 *  dia "estranho" da série, a identidade quebra e o teste denuncia — em vez de
 *  a tela mostrar barras que não somam o próprio total.
 *
 *  ── Buraco de coleta não vira dia normal ───────────────────────────────────
 *  Sem coleta no dia 11, a diferença entre 10 e 12 cobre DOIS dias. O número
 *  continua correto como variação, mas não é "a variação do dia 12" — e uma
 *  barra igual às outras afirmaria que foi. `diasCobertos` carrega isso até a
 *  tela, que marca a barra em vez de fingir.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface AmostraDoTotal {
  dia: string;
  /** `followers_count` daquele dia. `null` = sem medição. */
  total: number | null;
}

export interface DiaDeVariacao {
  dia: string;
  /** O total medido naquele dia. */
  total: number;
  /**
   * Variação líquida desde a medição anterior. `null` no primeiro dia da série
   * — não há de onde subtrair, e um 0 ali afirmaria estabilidade.
   */
  variacao: number | null;
  /** Quantos dias esta variação cobre. `1` é o normal; `>1` houve buraco. */
  diasCobertos: number;
}

export interface MovimentoDiario {
  dias: DiaDeVariacao[];
  /** Soma das variações desenhadas. `null` quando não há nenhuma. */
  soma: number | null;
  /** Variação do período: último medido − primeiro medido. */
  variacaoDoPeriodo: number | null;
  /**
   * A soma das barras bate com a variação do período?
   *
   * `null` quando não há o que conferir. `false` NUNCA deveria acontecer — se
   * acontecer, o gráfico está mentindo sobre o próprio total.
   */
  fecha: boolean | null;
  primeiroMedido: string | null;
  ultimoMedido: string | null;
  diasMedidos: number;
  /** Barras que cobrem mais de um dia. A tela precisa marcá-las. */
  diasComBuraco: number;
}

const diasEntre = (de: string, ate: string): number => {
  const [a1, m1, d1] = de.split("-").map(Number);
  const [a2, m2, d2] = ate.split("-").map(Number);
  const ms = Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1);
  return Math.round(ms / 86_400_000);
};

/**
 * A variação líquida de cada dia, a partir dos totais medidos.
 *
 * Dias sem medição são PULADOS, não zerados: `total: null` significa que o
 * Spaces não mediu, e inventar zero ali criaria uma queda inteira seguida de
 * uma alta inteira, nenhuma das duas real.
 */
export function movimentoDiario(amostras: AmostraDoTotal[]): MovimentoDiario {
  const medidas = amostras
    .filter((a): a is { dia: string; total: number } => typeof a.total === "number")
    .slice()
    .sort((x, y) => x.dia.localeCompare(y.dia));

  if (!medidas.length) {
    return {
      dias: [], soma: null, variacaoDoPeriodo: null, fecha: null,
      primeiroMedido: null, ultimoMedido: null, diasMedidos: 0, diasComBuraco: 0,
    };
  }

  const dias: DiaDeVariacao[] = medidas.map((m, i) => {
    const anterior = i > 0 ? medidas[i - 1] : null;
    return {
      dia: m.dia,
      total: m.total,
      variacao: anterior ? m.total - anterior.total : null,
      diasCobertos: anterior ? diasEntre(anterior.dia, m.dia) : 1,
    };
  });

  const comVariacao = dias.filter((d) => d.variacao != null);
  const soma = comVariacao.length
    ? comVariacao.reduce((n, d) => n + (d.variacao as number), 0)
    : null;
  const variacaoDoPeriodo = medidas.length >= 2
    ? medidas[medidas.length - 1].total - medidas[0].total
    : null;

  return {
    dias,
    soma,
    variacaoDoPeriodo,
    // A identidade telescópica. Se ela quebrar, alguma medição foi pulada entre
    // o cálculo das barras e o do total — e a tela estaria somando errado.
    fecha: soma == null || variacaoDoPeriodo == null ? null : soma === variacaoDoPeriodo,
    primeiroMedido: medidas[0].dia,
    ultimoMedido: medidas[medidas.length - 1].dia,
    diasMedidos: medidas.length,
    diasComBuraco: dias.filter((d) => d.variacao != null && d.diasCobertos > 1).length,
  };
}

/*
 * ── O que morava aqui ──────────────────────────────────────────────────────
 * `escalaDaVariacao` e `EscalaDaVariacao`: a escala simétrica em torno do zero,
 * que servia às barras divergentes do movimento diário. O gráfico saiu em
 * 18/08/2026 e nada mais desenha em torno do zero neste bloco.
 *
 * `movimentoDiario` continua inteiro: ele alimenta a evolução da base (os
 * totais e os vãos sem coleta), os destaques do rodapé e a conferência `fecha`,
 * que prova que a soma das variações é a variação do período mostrada no topo.
 */

// ─── Os destaques do rodapé ──────────────────────────────────────────────────

export interface DestaqueDoDia {
  dia: string;
  variacao: number;
}

export interface DestaquesDoMovimento {
  /** Maior variação positiva de UM dia. `null` quando não há. */
  maiorAlta: DestaqueDoDia | null;
  /** Maior variação negativa de UM dia. `null` quando não há. */
  maiorQueda: DestaqueDoDia | null;
  /**
   * Variação líquida média por dia decorrido. `null` quando a amostra é curta
   * demais para a média dizer algo.
   */
  mediaDiaria: number | null;
  /** Dias decorridos entre a primeira e a última medição — o denominador. */
  diasDecorridos: number | null;
}

/**
 * Medições necessárias para a média diária significar alguma coisa.
 *
 * Com duas, a "média" é a única variação que existe, vestida de média — e um
 * número assim convida a extrapolar de uma amostra de um.
 */
export const MEDICOES_MINIMAS_PARA_MEDIA = 3;

/**
 * Os três destaques, todos derivados das MESMAS variações que o gráfico desenha.
 *
 * ── Extremos só de barras de um dia ────────────────────────────────────────
 * Uma barra que cobre três dias sem coleta pode ser a maior do gráfico e não
 * ser a maior alta de um dia. "MAIOR ALTA +30 em 15/08" seria falso — foram
 * 30 em três dias, e o rótulo promete um. Barras com buraco ficam de fora dos
 * extremos; elas continuam no gráfico, marcadas.
 *
 * ── A média divide por DIAS, não por barras ────────────────────────────────
 * Com um buraco, o número de barras é menor que o de dias decorridos. Dividir
 * pelas barras inflaria a média — cada barra passaria a valer um dia, inclusive
 * a que vale três. O denominador certo é o tempo, e a variação do período já
 * cobre os dias não medidos por telescopagem.
 */
export function destaquesDoMovimento(m: MovimentoDiario): DestaquesDoMovimento {
  const deUmDia = m.dias.filter(
    (d): d is DiaDeVariacao & { variacao: number } => d.variacao != null && d.diasCobertos === 1);

  const altas = deUmDia.filter((d) => d.variacao > 0);
  const quedas = deUmDia.filter((d) => d.variacao < 0);

  const extremo = (xs: typeof deUmDia, melhor: (a: number, b: number) => boolean) =>
    xs.length
      ? xs.reduce((r, d) => (melhor(d.variacao, r.variacao) ? d : r))
      : null;

  const maiorAlta = extremo(altas, (a, b) => a > b);
  const maiorQueda = extremo(quedas, (a, b) => a < b);

  const diasDecorridos = m.primeiroMedido && m.ultimoMedido
    ? diasEntre(m.primeiroMedido, m.ultimoMedido)
    : null;

  const podeMediar = m.diasMedidos >= MEDICOES_MINIMAS_PARA_MEDIA
    && m.variacaoDoPeriodo != null
    && diasDecorridos != null && diasDecorridos > 0;

  return {
    maiorAlta: maiorAlta && { dia: maiorAlta.dia, variacao: maiorAlta.variacao },
    maiorQueda: maiorQueda && { dia: maiorQueda.dia, variacao: maiorQueda.variacao },
    mediaDiaria: podeMediar ? (m.variacaoDoPeriodo as number) / (diasDecorridos as number) : null,
    diasDecorridos,
  };
}
