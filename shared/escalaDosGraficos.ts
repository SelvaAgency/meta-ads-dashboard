/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  A geometria dos dois gráficos — separada do desenho, para poder ser provada
 * ─────────────────────────────────────────────────────────────────────────────
 *  Puro, compartilhado. Existe por causa de um erro que passou despercebido no
 *  desenho e só apareceu num caso real:
 *
 *    entradas +2 · saídas −2 · saldo 0
 *
 *  O gráfico mostrava uma barra verde subindo e uma faixa roxa larga atrás — e
 *  quem olhava lia crescimento. A causa não era estética: a linha chamada
 *  "Saldo" plotava o ESTOQUE de seguidores (9.464) num eixo próprio, auto
 *  escalado. Duas grandezas sob um rótulo só, e a de baixo com escala que
 *  amplifica ruído.
 *
 *  ── Um eixo, um zero ───────────────────────────────────────────────────────
 *  Agora entradas, saídas e saldo dividem A MESMA escala e o MESMO zero.
 *  Entrada sobe, saída desce como número negativo, saldo é a linha que cruza o
 *  zero. Com +2 e −2, o saldo fica em cima do eixo — não há como a tela sugerir
 *  crescimento onde a aritmética diz zero.
 *
 *  ── O saldo é a variação MEDIDA ────────────────────────────────────────────
 *  E não `entradas − saídas` recalculado aqui. As saídas já são derivadas dessa
 *  identidade, então recalcular seria circular — e no dia em que a saída não for
 *  derivável, a subtração daria um número onde deveria haver buraco.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface DiaDoMovimento {
  dia: string;
  /** Novos seguidores medidos. `null` = não medido. */
  entradas: number | null;
  /** Derivadas. `null` = a conta não fechou naquele dia. */
  saidas: number | null;
  /** Variação medida do total — o SALDO do dia. `null` sem dia anterior. */
  saldo: number | null;
}

export interface EscalaSimetrica {
  /** Maior valor acima do zero. Nunca menor que 1, para não dividir por zero. */
  acima: number;
  /** Maior magnitude abaixo do zero, como número POSITIVO. */
  abaixo: number;
  /** Onde o zero cai, de 0 (topo) a 1 (base). */
  fracaoDoZero: number;
  /** Os três rótulos do eixo, do topo para a base — negativo com sinal. */
  rotulos: [number, number, number];
}

/**
 * A escala do movimento: um zero só, para os três.
 *
 * Quando não há nada abaixo do zero, ele desce para a base e o gráfico usa a
 * altura inteira para o positivo — reservar metade do painel para um lado vazio
 * achataria as barras que existem pela metade.
 *
 * O piso de 1 evita divisão por zero num dia todo zerado, e o resultado é um
 * gráfico plano na linha do zero, que é exatamente o que aquele dia foi.
 */
export function escalaDoMovimento(dias: DiaDoMovimento[]): EscalaSimetrica {
  const positivos = dias.flatMap((d) => [d.entradas ?? 0, Math.max(0, d.saldo ?? 0)]);
  const negativos = dias.flatMap((d) => [d.saidas ?? 0, Math.max(0, -(d.saldo ?? 0))]);

  const acima = Math.max(1, ...positivos);
  const abaixo = Math.max(0, ...negativos);
  const amplitude = acima + abaixo;

  return {
    acima,
    abaixo,
    fracaoDoZero: amplitude > 0 ? acima / amplitude : 1,
    // O rótulo do meio é sempre o ZERO: é a referência que dá sentido aos
    // outros dois, e escondê-lo faria a barra vermelha parecer só "mais baixa".
    rotulos: [acima, 0, -abaixo],
  };
}

// ─── Ativações empilhadas ────────────────────────────────────────────────────

export interface SegmentoDaPilha<T extends string = string> {
  tipo: T;
  valor: number;
  /** Fração da altura total da barra em que o segmento COMEÇA (0 = base). */
  de: number;
  /** Fração em que ele termina. */
  ate: number;
  /** `true` só no de cima — é o único que arredonda. */
  topo: boolean;
}

/**
 * Fatia um dia em segmentos empilhados.
 *
 * ── Tipo com zero não vira segmento ────────────────────────────────────────
 * Um retângulo de altura zero é invisível mas existe no DOM, e a legenda
 * prometeria uma cor que não aparece em barra nenhuma. Quem procura o azul e não
 * acha conclui que a leitura falhou.
 *
 * ── As frações somam exatamente 1 ──────────────────────────────────────────
 * O último segmento termina em 1 por construção, e não por soma de
 * arredondamentos: com valores grandes, somar frações uma a uma deixa uma fresta
 * no topo da barra — e a barra passa a parecer menor que o valor dela.
 */
export function pilhaDoDia<T extends string>(
  porTipo: Partial<Record<T, number>>, ordem: readonly T[],
): { segmentos: Array<SegmentoDaPilha<T>>; total: number } {
  const presentes = ordem.filter((t) => (porTipo[t] ?? 0) > 0);
  const total = presentes.reduce((n, t) => n + (porTipo[t] ?? 0), 0);
  if (!total) return { segmentos: [], total: 0 };

  let acumulado = 0;
  const segmentos = presentes.map((tipo, i) => {
    const valor = porTipo[tipo] ?? 0;
    const de = acumulado / total;
    acumulado += valor;
    const ultimo = i === presentes.length - 1;
    return { tipo, valor, de, ate: ultimo ? 1 : acumulado / total, topo: ultimo };
  });
  return { segmentos, total };
}

/**
 * De quantos em quantos pontos um rótulo de data cabe.
 *
 * Trinta datas lado a lado viram uma mancha. O intervalo sai da largura
 * disponível, e não de um número fixo: com sete dias todas cabem, e forçar "de
 * cinco em cinco" esconderia quatro delas sem motivo.
 */
export function intervaloDeRotulos(pontos: number, larguraDisponivel: number, larguraDoRotulo = 34): number {
  if (pontos <= 1) return 1;
  const cabem = Math.max(1, Math.floor(larguraDisponivel / larguraDoRotulo));
  return Math.max(1, Math.ceil(pontos / cabem));
}
