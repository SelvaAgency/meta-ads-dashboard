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
    // "Podem distorcer", e não "não é justa": a distorção depende de quanto a
    // métrica acumula naquelas horas, e afirmar mais do que se sabe gasta a
    // credibilidade do aviso.
    motivo:
      "Algumas coletas foram feitas em horários diferentes. Como essa métrica acumula durante o dia, " +
      `períodos com horários diferentes podem distorcer a comparação. (${faixa})`,
  };
}

export interface RotuloDeJanela {
  /** O nome do card. Nunca diz "hoje" nem "no dia" para métrica de fluxo. */
  titulo: string;
  /** A ressalva, sempre visível. `null` quando não há o que ressalvar. */
  ressalva: string | null;
  /**
   * A versão curta — só o que o card precisa: "Soma de 3 dias".
   *
   * A explicação sobre horários e comparabilidade mora no aviso da faixa, e
   * repeti-la dentro de cada card faz o leitor pular as duas: texto que se
   * repete vira ruído, e o aviso perde o efeito justamente onde ele importa.
   */
  resumo: string | null;
  /**
   * O que UM ponto do gráfico representa.
   *
   * Separado da ressalva porque responde outra pergunta: aquela fala do total
   * do período, esta fala da barra que a pessoa está olhando. Quem passa o olho
   * num gráfico de barras lê cada barra como "o dia", e é essa leitura que
   * precisa ser corrigida no lugar onde ela acontece.
   */
  porPonto: string;
}

/**
 * Como nomear uma métrica de fluxo sem prometer o dia inteiro.
 *
 * `faixa` é o horário em que as coletas acontecem, quando conhecido — dizer
 * "até a coleta" sem dizer que horas é ela deixa a ressalva sem conteúdo.
 */
export function rotuloDeFluxo(
  nome: string, faixa: string | null, dias: number, oQue = "o acumulado",
): RotuloDeJanela {
  const janela = faixa ? `00:00 até ${faixa}` : "00:00 até a coleta";
  return {
    titulo: dias <= 1 ? `${nome} (parcial do dia)` : `${nome} (soma de dias parciais)`,
    ressalva: dias <= 1
      ? `Mede ${janela}, e não o dia inteiro.`
      : `Soma de ${dias} dias, cada um medido de ${janela}. Serve para comparar dias entre si, não como total do período.`,
    resumo: dias <= 1 ? "Parcial do dia" : `Soma de ${dias} dias`,
    // "Horário da coleta", e não a hora fixa: ela varia, e é justamente essa
    // variação que o aviso de comparabilidade existe para pegar.
    porPonto: `Cada ponto representa ${oQue} desde 00:00 até o horário da coleta.`,
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
    resumo: de && ate ? `${de} → ${ate}` : null,
    // Estoque não acumula dentro do dia: cada ponto é a fotografia do momento,
    // e o horário da coleta não muda o que ele significa.
    porPonto: "Cada ponto é o total no momento da coleta daquele dia.",
  };
}
