/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  O período anterior — quando ele existe, e quando não dá para afirmar
 * ─────────────────────────────────────────────────────────────────────────────
 *  Puro, compartilhado. O selo de variação nos cards ("+27%") precisa do mesmo
 *  número de dias imediatamente antes do período selecionado. E a única fonte
 *  que alcança fora do filtro são as ÚLTIMAS 30 COLETAS, que já vêm no painel.
 *
 *  ── A janela tem teto, e o teto é honesto ──────────────────────────────────
 *  Comparar 7 dias exige 14 de série; 30 exigiria 60, e a série tem 30. Nesse
 *  caso a resposta é `null` — não há período anterior medido — e o card
 *  simplesmente não mostra selo.
 *
 *  Um "0%" ali seria o pior desfecho: ele afirma estabilidade sobre dias que
 *  ninguém mediu, e ninguém desconfia de um zero.
 *
 *  ── Só dias COMPLETOS entram ───────────────────────────────────────────────
 *  A comparação exige o mesmo número de dias nos dois lados. Se o anterior tiver
 *  buracos de coleta, ele cobre menos dias que o atual e a soma sairia menor por
 *  falta de medição — uma queda inventada. Por isso a contagem de dias medidos
 *  volta junto, e quem chama decide se ainda vale comparar.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface DiaComMetricas {
  dia: string;
  metricas: Record<string, number>;
  seguidores?: number | null;
  storiesVistos?: number | null;
}

export interface Comparacao {
  /** Soma do período anterior. `null` = não há período anterior medido. */
  anterior: number | null;
  /** Dias com medição em cada lado — a comparação só é justa se coincidirem. */
  diasAtual: number;
  diasAnterior: number;
  /** `false` quando os lados cobrem números de dias diferentes. */
  comparavel: boolean;
}

/**
 * Soma uma métrica no período ANTERIOR ao intervalo dado.
 *
 * `ler` recebe o dia e devolve o valor — assim serve para métrica de `metricas`,
 * para stories e para qualquer derivação, sem esta função precisar conhecer
 * nenhuma delas.
 */
export function compararComAnterior(
  serie: DiaComMetricas[],
  janela: { inicio: string; fim: string },
  ler: (d: DiaComMetricas) => number | null,
): Comparacao {
  const ordenada = serie.slice().sort((a, b) => a.dia.localeCompare(b.dia));
  const atual = ordenada.filter((d) => d.dia >= janela.inicio && d.dia <= janela.fim);
  const diasAtual = atual.filter((d) => ler(d) != null).length;

  // O anterior é a MESMA quantidade de dias de calendário, terminando um dia
  // antes do início — e não "os N registros anteriores": com buracos de coleta,
  // contar registros esticaria a janela para trás sem ninguém notar.
  const dias = diasDeCalendario(janela.inicio, janela.fim);
  const fimAnt = somarDias(janela.inicio, -1);
  const iniAnt = somarDias(fimAnt, -(dias - 1));

  const anteriores = ordenada.filter((d) => d.dia >= iniAnt && d.dia <= fimAnt);
  const medidos = anteriores.map(ler).filter((v): v is number => v != null);

  if (!medidos.length) {
    return { anterior: null, diasAtual, diasAnterior: 0, comparavel: false };
  }
  return {
    anterior: medidos.reduce((a, b) => a + b, 0),
    diasAtual,
    diasAnterior: medidos.length,
    // Mesmo número de dias medidos nos dois lados. Diferente, a soma menor pode
    // ser falta de coleta em vez de queda — e o selo diria "caiu".
    comparavel: medidos.length === diasAtual && diasAtual > 0,
  };
}

const DIA_MS = 86_400_000;
const paraUTC = (iso: string) => {
  const [a, m, d] = iso.split("-").map(Number);
  return Date.UTC(a, (m ?? 1) - 1, d ?? 1);
};
const somarDias = (iso: string, n: number) =>
  new Date(paraUTC(iso) + n * DIA_MS).toISOString().slice(0, 10);
const diasDeCalendario = (ini: string, fim: string) =>
  Math.round((paraUTC(fim) - paraUTC(ini)) / DIA_MS) + 1;

/**
 * A variação percentual, ou `null` quando não há o que afirmar.
 *
 * `null` em três casos, e os três importam: sem período anterior, com bases
 * incomparáveis, e com base ZERO — dividir por zero produziria `Infinity`, que
 * apareceria na tela como um percentual absurdo em vez de como ausência.
 */
export function variacao(atual: number | null, c: Comparacao): number | null {
  if (atual == null || c.anterior == null || !c.comparavel || c.anterior === 0) return null;
  return ((atual - c.anterior) / Math.abs(c.anterior)) * 100;
}
