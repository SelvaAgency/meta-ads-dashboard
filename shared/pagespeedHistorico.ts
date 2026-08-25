/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  PageSpeed histórico — a mediana manda, a última medição fica ao lado
 * ─────────────────────────────────────────────────────────────────────────────
 *  Puro: sem rede, sem banco, sem relógio.
 *
 *  ── O problema que isto resolve ────────────────────────────────────────────
 *  Caso real: a UMA marcou ~90 num dia, ~41 no seguinte, e voltou ao topo na
 *  remedição manual. O ranking do Panorama, que lia só a última medição, virou
 *  de ponta-cabeça por causa de um teste sintético instável — e pintou de
 *  vermelho um site que costuma ser bom.
 *
 *  São duas perguntas diferentes, e elas estavam misturadas num número só:
 *
 *    "como o site está AGORA?"        → última medição
 *    "como este site COSTUMA ir?"     → mediana das medições disponíveis
 *
 *  ── Mediana, e não média ───────────────────────────────────────────────────
 *  Com seis pontos — cinco em ~90 e um em 41 — a média dá 82 e a mediana dá 90.
 *  A média ainda é arrastada 8 pontos pelo valor esquisito; a mediana não se
 *  move. Como o ranking existe justamente para responder "quem costuma ir pior",
 *  ele não pode oscilar com um outlier.
 *
 *  A média continua calculada e aparece no detalhe do Site: a distância entre
 *  ela e a mediana É a medida da volatilidade.
 *
 *  ── "mediana de 6 medições", e não "média dos últimos 7 dias" ──────────────
 *  A segunda frase promete uma cobertura que o dado não tem. A coleta falha (o
 *  PageSpeed dá timeout e nenhum snapshot é gravado), então sete dias podem
 *  render quatro pontos. E a remedição manual SOBRESCREVE o dia — a série
 *  guarda o último valor medido em cada dia, não todas as tentativas.
 *
 *  Contar as medições é tecnicamente fiel; contar os dias, não.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** A janela de leitura. Recente o bastante para representar o estado de hoje. */
export const JANELA_PAGESPEED_DIAS = 7;

/**
 * Abaixo disto não há leitura histórica.
 *
 * Com duas medições, mediana e média são o mesmo número e nenhum dos dois é
 * tendência — é um par de pontos. Apresentá-los como "o típico do site" daria
 * ares de consolidado a uma amostra que não é.
 */
export const PISO_MEDICOES = 3;

/**
 * Distância entre a última medição e a mediana que merece um sinal.
 *
 * 15 pontos porque as faixas do Lighthouse são 0–49, 50–89 e 90–100: um desvio
 * desse tamanho é capaz de atravessar uma faixa inteira, e aí a leitura de
 * "como está agora" realmente difere da de "como costuma ir".
 *
 * O sinal é INFORMATIVO. Ele não muda o nível do cliente — isso continua vindo
 * de `avaliarCliente`, e uma anomalia de medição não é problema estrutural.
 */
export const DESVIO_NOTAVEL = 15;

export interface MedicaoPagespeed {
  dia: string;
  score: number;
}

export interface HistoricoPagespeed {
  /** As medições da janela, do mais antigo para o mais recente. */
  medicoes: MedicaoPagespeed[];
  /** Quantas medições entraram. É o denominador que a tela mostra. */
  quantidade: number;
  /** A leitura de ranking. `null` abaixo do piso — não se inventa típico. */
  mediana: number | null;
  /** Para o detalhe: a distância dela até a mediana é a volatilidade. */
  media: number | null;
  melhor: number | null;
  pior: number | null;
  /** A medição mais recente. Existe mesmo com uma só. */
  ultima: number | null;
  ultimoDia: string | null;
  /** `true` quando há mediana — ou seja, quando o piso foi atingido. */
  temBase: boolean;
  /**
   * Última menos mediana. `null` sem base.
   *
   * Positivo = está melhor que o costume; negativo = pior.
   */
  desvio: number | null;
  /** `true` quando o desvio passa de `DESVIO_NOTAVEL`. Sinal, não veredito. */
  desvioNotavel: boolean;
}

export function mediana(valores: number[]): number | null {
  const v = valores.filter((n) => Number.isFinite(n)).slice().sort((a, b) => a - b);
  if (!v.length) return null;
  const meio = Math.floor(v.length / 2);
  return v.length % 2 === 1 ? v[meio] : (v[meio - 1] + v[meio]) / 2;
}

/**
 * A leitura histórica de um site.
 *
 * `medicoes` deve chegar JÁ filtrada por `provider = 'pagespeed'` e
 * `estrategia = 'mobile'` — misturar um teste desktop manual numa série mobile
 * faria a linha subir ou cair por causa da estratégia, e a diferença entre as
 * duas no mesmo site passa rotineiramente de 30 pontos.
 */
export function historicoPagespeed(medicoes: MedicaoPagespeed[]): HistoricoPagespeed {
  const ordenadas = [...medicoes]
    .filter((m) => Number.isFinite(m.score))
    .sort((a, b) => a.dia.localeCompare(b.dia));
  const scores = ordenadas.map((m) => m.score);
  const ultima = ordenadas.length ? ordenadas[ordenadas.length - 1] : null;

  const temBase = ordenadas.length >= PISO_MEDICOES;
  const med = temBase ? mediana(scores) : null;
  const desvio = med != null && ultima ? ultima.score - med : null;

  return {
    medicoes: ordenadas,
    quantidade: ordenadas.length,
    mediana: med,
    // Média, melhor e pior só com base: soltos, um único ponto viraria
    // "melhor 41 · pior 41", que descreve nada.
    media: temBase ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
    melhor: temBase ? Math.max(...scores) : null,
    pior: temBase ? Math.min(...scores) : null,
    ultima: ultima?.score ?? null,
    ultimoDia: ultima?.dia ?? null,
    temBase,
    desvio,
    desvioNotavel: desvio != null && Math.abs(desvio) >= DESVIO_NOTAVEL,
  };
}

/**
 * O valor pelo qual o ranking ordena.
 *
 * A mediana quando ela existe; a última medição quando não. Um site com duas
 * medições precisa aparecer no ranking — deixá-lo fora o esconderia justamente
 * enquanto ninguém sabe como ele vai. A tela diz qual dos dois está usando.
 */
export function valorDeRanking(h: HistoricoPagespeed): number | null {
  return h.mediana ?? h.ultima;
}

/** A frase do denominador: "6 medições · 7 dias" ou "1 medição · sem base". */
export function textoDaBase(h: HistoricoPagespeed): string {
  if (!h.quantidade) return "sem medição";
  const plural = h.quantidade === 1 ? "medição" : "medições";
  return h.temBase
    ? `mediana de ${h.quantidade} ${plural} · ${JANELA_PAGESPEED_DIAS}d`
    : `${h.quantidade} ${plural} · sem base histórica`;
}

/** A faixa do Lighthouse. É dela que sai a cor — e não de um corte nosso. */
export function faixaDoLighthouse(score: number | null): "bom" | "medio" | "ruim" | "vazio" {
  if (score == null) return "vazio";
  if (score >= 90) return "bom";
  if (score >= 50) return "medio";
  return "ruim";
}
