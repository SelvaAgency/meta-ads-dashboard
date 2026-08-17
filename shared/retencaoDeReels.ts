/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Retenção de Reels — o que a sondagem autorizou, e só isso
 * ─────────────────────────────────────────────────────────────────────────────
 *  Puro: sem rede, sem banco, sem relógio. Existe para que a regra mais
 *  importante desta frente possa ser PROVADA em vez de prometida.
 *
 *  ── A regra ────────────────────────────────────────────────────────────────
 *  Nenhum número desta tela é derivado de `total_views`.
 *
 *  A sondagem de 17/08/2026 mediu isso: `total ÷ médio` devolveu 7.957
 *  espectadores implícitos, e `total_views` marcava 54.977. Nenhuma métrica de
 *  views que a API entrega é o denominador de `ig_reels_avg_watch_time` — o
 *  tempo médio fica sem população conhecida. Dividir uma pela outra produziria
 *  um número com aparência de taxa e sem significado.
 *
 *  Por isso as três grandezas viajam SEPARADAS até a tela:
 *
 *    reels_skip_rate           medida, já em %, sem denominador nosso
 *    ig_reels_avg_watch_time   medida, em milissegundos
 *    total_views               medida, contagem
 *
 *  ── A média do topo é média DE REELS, não taxa da conta ────────────────────
 *  A taxa geral do bloco é a média simples das taxas medidas. Ponderá-la por
 *  views daria "a taxa da conta" — e usaria `total_views` como peso, que é
 *  exatamente o que a sondagem proibiu. A média simples é honesta desde que a
 *  tela diga que é média de N Reels, e é por isso que `quantidade` viaja junto
 *  com o número.
 *
 *  ── Ausência não é zero ────────────────────────────────────────────────────
 *  Um Reel sem `reels_skip_rate` fica FORA do ranking. Entrar com 0% o
 *  colocaria em primeiro lugar em "menor abandono" — o Reel que ninguém mediu
 *  virando o melhor da conta.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** O estado de cada métrica, igual ao resto da Social. */
export type EstadoDoDado = "medido" | "recusado" | "nao_perguntado" | "sem_coleta";

export interface ReelMedido {
  mediaId: string;
  publicadoEm: string | null;
  thumbnailUrl: string | null;
  permalink: string | null;
  /** `reels_skip_rate` como a Meta devolveu: percentual, 0–100. */
  skipRate: number | null;
  /** `ig_reels_avg_watch_time` em MILISSEGUNDOS, como a Meta devolveu. */
  avgWatchTimeMs: number | null;
  /** `total_views`. Independente — não entra em nenhum cálculo das outras. */
  views: number | null;
  /** O que a Meta recusou, por nome de métrica. */
  recusadas: Record<string, string>;
}

/**
 * De onde a ausência veio.
 *
 * Os quatro estados existem porque cada um pede uma frase diferente na tela, e
 * colapsá-los faria "a conta não publica Reels" e "a Meta negou a métrica"
 * virarem o mesmo traço cinza.
 */
export function estadoDaMetrica(
  reel: Pick<ReelMedido, "skipRate" | "avgWatchTimeMs" | "recusadas">,
  qual: "skipRate" | "avgWatchTimeMs",
  /** `false` quando a conta ainda não teve coleta nenhuma no período. */
  houveColeta = true,
): EstadoDoDado {
  if (!houveColeta) return "sem_coleta";
  if (reel[qual] != null) return "medido";
  const nome = qual === "skipRate" ? "reels_skip_rate" : "ig_reels_avg_watch_time";
  return reel.recusadas?.[nome] ? "recusado" : "nao_perguntado";
}

export const FRASE_DO_ESTADO: Record<EstadoDoDado, string | null> = {
  medido: null,
  recusado: "a Meta recusou esta métrica para este Reel",
  nao_perguntado: "não medida nesta coleta",
  sem_coleta: "sem coleta no período",
};

export interface ResumoDaRetencao {
  /** Média simples das taxas MEDIDAS. `null` quando nenhuma foi medida. */
  taxaMedia: number | null;
  /** Quantos Reels entraram na média — a tela precisa dizer. */
  reelsComTaxa: number;
  /** Média simples dos tempos medidos, em milissegundos. */
  tempoMedioMs: number | null;
  reelsComTempo: number;
  /** SOMA das visualizações medidas. Contagem, e não taxa. */
  views: number | null;
  reelsComViews: number;
  /** Total de Reels no período, medidos ou não. */
  total: number;
  /** Abaixo disto, ranking é anedota. */
  amostraPequena: boolean;
}

/** Abaixo de cinco Reels, a ordem diz mais sobre o acaso que sobre o conteúdo. */
export const PISO_DA_AMOSTRA = 5;

const media = (ns: number[]): number | null =>
  ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : null;

export function resumoDaRetencao(reels: ReelMedido[]): ResumoDaRetencao {
  const taxas = reels.map((r) => r.skipRate).filter((v): v is number => v != null);
  const tempos = reels.map((r) => r.avgWatchTimeMs).filter((v): v is number => v != null);
  const vistas = reels.map((r) => r.views).filter((v): v is number => v != null);

  return {
    taxaMedia: media(taxas),
    reelsComTaxa: taxas.length,
    tempoMedioMs: media(tempos),
    reelsComTempo: tempos.length,
    // Soma, e não média: visualização é contagem. E `null` sem nenhuma medida —
    // um zero afirmaria que ninguém viu.
    views: vistas.length ? vistas.reduce((a, b) => a + b, 0) : null,
    reelsComViews: vistas.length,
    total: reels.length,
    amostraPequena: reels.length > 0 && reels.length < PISO_DA_AMOSTRA,
  };
}

export interface RankingDeAbandono {
  /** Ordenados por `skipRate` DESC — os que mais perdem gente. */
  maiorAbandono: ReelMedido[];
  /** Ordenados por `skipRate` ASC. */
  menorAbandono: ReelMedido[];
  /** Todos os que têm taxa, em ordem decrescente — a base do gráfico. */
  ordenados: ReelMedido[];
  /** Os que ficaram de fora, e por quê. Ausência dita, não escondida. */
  semTaxa: Array<{ reel: ReelMedido; motivo: string }>;
}

/**
 * O ranking, ordenado EXCLUSIVAMENTE por `reels_skip_rate`.
 *
 * Nem tempo médio nem views entram no critério. Misturar as três daria uma
 * pontuação composta que ninguém consegue conferir de cabeça — e as duas
 * primeiras nem sequer compartilham unidade.
 *
 * O desempate é pelo id, e não pelo tempo médio: com duas taxas iguais,
 * desempatar por outra grandeza faria a segunda influenciar a ordem por uma
 * porta lateral. Id é arbitrário e estável, que é o que um desempate deve ser.
 */
export function rankingDeAbandono(reels: ReelMedido[], quantos = 3): RankingDeAbandono {
  const comTaxa = reels.filter((r) => r.skipRate != null);
  const semTaxa = reels
    .filter((r) => r.skipRate == null)
    .map((reel) => ({
      reel,
      motivo: reel.recusadas?.reels_skip_rate
        ? "a Meta recusou a taxa para este Reel"
        : "taxa não medida nesta coleta",
    }));

  const ordenados = [...comTaxa].sort((a, b) =>
    (b.skipRate as number) - (a.skipRate as number) || a.mediaId.localeCompare(b.mediaId));

  return {
    ordenados,
    maiorAbandono: ordenados.slice(0, quantos),
    // Os piores da lista, relidos de baixo para cima — e nunca os mesmos que os
    // primeiros quando há Reels suficientes.
    menorAbandono: ordenados.slice(-quantos).reverse().slice(0, quantos),
    semTaxa,
  };
}

// ─── Formatação ──────────────────────────────────────────────────────────────

/**
 * O tempo, em segundos, a partir dos milissegundos que a Meta entrega.
 *
 * A conversão fica aqui e não na tela porque ela é uma decisão sobre o DADO:
 * guardamos milissegundos porque é o que a API dá, e exibimos segundos porque é
 * o que se lê. Espalhar `/1000` pelos componentes é como uma unidade errada
 * entra numa tela.
 */
export function segundosDe(ms: number | null): number | null {
  return ms == null ? null : ms / 1000;
}

export function formatarSegundos(ms: number | null): string {
  const s = segundosDe(ms);
  return s == null ? "–" : `${s.toFixed(2).replace(".", ",")}s`;
}

export function formatarTaxa(pct: number | null): string {
  return pct == null ? "–" : `${pct.toFixed(1).replace(".", ",")}%`;
}

/**
 * A nota de rodapé da seção — fixa, e por isso mora aqui.
 *
 * Ela não é decoração: é o que impede a leitura de que o Spaces sabe onde as
 * pessoas saem do vídeo. A sondagem provou que a API não entrega recorte
 * temporal, e a tela precisa dizer isso onde a pergunta nasce.
 */
export const NOTA_DA_RETENCAO =
  "Taxa de abandono e tempo médio assistido são métricas independentes fornecidas pela API. "
  + "O Spaces não estima uma curva de retenção por segundo.";
