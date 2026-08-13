/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Que pedaço do dia cada número cobre
 * ─────────────────────────────────────────────────────────────────────────────
 *  Puro, compartilhado. Medido em 13/08: `profile_views` é escopada por dia pela
 *  Meta e devolve o acumulado de 00:00 até o instante da consulta — e a API NÃO
 *  aceita buscar dia fechado do passado. A coleta das 06:20 mede, portanto, as
 *  primeiras ~6 horas de um dia de 24.
 *
 *  ── A consequência que não cabe num rótulo de card ─────────────────────────
 *  Se cada ponto da série é um dia parcial, a SOMA de sete pontos não é "sete
 *  dias": são sete janelas de ~6h, cerca de 42 horas de medição com nome de uma
 *  semana. Trocar só o título do card deixaria o total intacto e igualmente
 *  errado.
 *
 *  ── Mas a série continua servindo, e é importante dizer por quê ────────────
 *  Todos os pontos são medidos no mesmo horário, então cobrem o mesmo pedaço do
 *  dia. Comparar terça com quarta é legítimo — é "as primeiras 6h de terça
 *  contra as primeiras 6h de quarta". O que não vale é o valor ABSOLUTO como
 *  total do dia. Tendência confiável, absoluto não.
 *
 *  Isso só se sustenta enquanto as coletas acontecem no mesmo horário. Uma
 *  coleta manual às 14h no meio da série cria um ponto que cobre 14h contra
 *  vizinhos de 6h — e ele pareceria um pico. Por isso `coletasSaoComparaveis`.
 *
 *  ── Estoque é outra história ───────────────────────────────────────────────
 *  `followers_count` é fotografia, não acumulado. A diferença entre duas
 *  coletas cobre o intervalo INTEIRO entre elas, seja qual for o horário. Ali
 *  não há truncamento — só o rótulo precisa dizer entre quando e quando.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type NaturezaDaMetrica = "fluxo" | "estoque";

/**
 * Fluxo acumula dentro do dia e é truncado pela hora da coleta.
 * Estoque é uma fotografia e não tem janela.
 */
export const NATUREZA_DA_METRICA: Record<string, NaturezaDaMetrica> = {
  profile_views: "fluxo",
  website_clicks: "fluxo",
  profile_links_taps: "fluxo",
  reach: "fluxo",
  total_interactions: "fluxo",
  views: "fluxo",
  follower_count: "fluxo",
  followers_count: "estoque",
  follows_count: "estoque",
  media_count: "estoque",
};

export const ehFluxo = (metrica: string): boolean =>
  NATUREZA_DA_METRICA[metrica] === "fluxo";

/** Minutos de diferença que já quebram a comparabilidade entre pontos. */
export const ESPALHAMENTO_TOLERADO_MIN = 90;

export interface ColetaComHorario {
  dia: string;
  coletadoEm: string | Date;
}

const minutosDoDia = (x: string | Date): number => {
  const d = x instanceof Date ? x : new Date(x);
  return d.getHours() * 60 + d.getMinutes();
};

export interface Comparabilidade {
  comparavel: boolean;
  /** "06:18–06:23" — a faixa de horários em que os pontos foram medidos. */
  faixa: string | null;
  espalhamentoMin: number;
  motivo: string | null;
}

/**
 * Os pontos da série cobrem o mesmo pedaço do dia?
 *
 * Só faz sentido para métricas de fluxo. Em estoque, o horário não muda o que o
 * número significa.
 */
export function coletasSaoComparaveis(coletas: ColetaComHorario[]): Comparabilidade {
  const minutos = coletas.map((c) => minutosDoDia(c.coletadoEm)).filter((m) => Number.isFinite(m));
  if (minutos.length < 2) {
    return { comparavel: true, faixa: null, espalhamentoMin: 0, motivo: null };
  }
  const min = Math.min(...minutos);
  const max = Math.max(...minutos);
  const espalhamento = max - min;
  const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  const faixa = espalhamento === 0 ? hhmm(min) : `${hhmm(min)}–${hhmm(max)}`;

  if (espalhamento <= ESPALHAMENTO_TOLERADO_MIN) {
    return { comparavel: true, faixa, espalhamentoMin: espalhamento, motivo: null };
  }
  return {
    comparavel: false, faixa, espalhamentoMin: espalhamento,
    motivo:
      `As coletas aconteceram entre ${faixa}, com ${Math.round(espalhamento / 60)}h de diferença. ` +
      "Como esta métrica acumula ao longo do dia, os pontos cobrem pedaços de tamanhos diferentes — " +
      "a comparação entre eles não é justa.",
  };
}

export interface RotuloDeJanela {
  /** O nome do card. Nunca diz "hoje" nem "no dia" para métrica de fluxo. */
  titulo: string;
  /** A ressalva, sempre visível. `null` quando não há o que ressalvar. */
  ressalva: string | null;
}

/**
 * Como nomear uma métrica de fluxo sem prometer o dia inteiro.
 *
 * `faixa` é o horário em que as coletas acontecem, quando conhecido — dizer
 * "até a coleta" sem dizer que horas é ela deixa a ressalva sem conteúdo.
 */
export function rotuloDeFluxo(nome: string, faixa: string | null, dias: number): RotuloDeJanela {
  const janela = faixa ? `00:00 até ${faixa}` : "00:00 até a coleta";
  return {
    titulo: dias <= 1 ? `${nome} (parcial do dia)` : `${nome} (soma de dias parciais)`,
    ressalva: dias <= 1
      ? `Mede ${janela}, e não o dia inteiro.`
      : `Soma de ${dias} dias, cada um medido de ${janela}. Serve para comparar dias entre si, não como total do período.`,
  };
}

/**
 * Como nomear uma variação de estoque.
 *
 * Não é "ganhou no dia": é a diferença entre duas fotografias, e o que ela
 * cobre é o intervalo entre elas — que pode não ser um dia do calendário.
 */
export function rotuloDeEstoque(nome: string, de: string | null, ate: string | null): RotuloDeJanela {
  return {
    titulo: nome,
    ressalva: de && ate
      ? `Variação entre as coletas de ${de} e ${ate}.`
      : "Variação desde a última coleta.",
  };
}
