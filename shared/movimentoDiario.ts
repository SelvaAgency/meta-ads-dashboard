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

/** A escala simétrica de uma série que cruza o zero. */
export interface EscalaDaVariacao {
  /** Maior alta. Nunca menor que 1, para não dividir por zero. */
  acima: number;
  /** Maior queda, como número POSITIVO. */
  abaixo: number;
  /** Onde o zero cai, de 0 (topo) a 1 (base). */
  fracaoDoZero: number;
}

/**
 * Onde fica o zero, dado o que a série tem de cada lado.
 *
 * Não é simétrica por decreto: uma conta que só cresce teria metade do painel
 * reservada para um lado vazio, e as barras que existem sairiam pela metade da
 * altura. O zero encosta na base quando não há queda nenhuma, e no topo quando
 * não há alta.
 */
export function escalaDaVariacao(dias: DiaDeVariacao[]): EscalaDaVariacao {
  const vs = dias.map((d) => d.variacao).filter((v): v is number => v != null);
  const acima = Math.max(1, ...vs.filter((v) => v > 0));
  const abaixo = Math.max(0, ...vs.filter((v) => v < 0).map((v) => -v));
  const amplitude = acima + abaixo;
  return { acima, abaixo, fracaoDoZero: amplitude > 0 ? acima / amplitude : 1 };
}
