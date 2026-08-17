/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Taxa de engajamento e ranking de publicações
 * ─────────────────────────────────────────────────────────────────────────────
 *  Puro, compartilhado. Duas decisões de produto moram aqui, e as duas mudam o
 *  número que o cliente vê.
 *
 *  ── O divisor ──────────────────────────────────────────────────────────────
 *  "Taxa de engajamento" não tem definição única. Dividir por ALCANCE mede o
 *  conteúdo entre quem viu (costuma dar 3–8%); dividir por SEGUIDORES é o
 *  benchmark clássico de agência (1–3%). São números diferentes para a mesma
 *  publicação, e trocar de divisor sem avisar faz a taxa cair pela metade e
 *  parecer queda de desempenho.
 *
 *  Decidido: alcance é o principal, seguidores é o apoio, e o rótulo SEMPRE
 *  acompanha o número — por isso `ROTULO_TAXA` mora aqui junto da conta, e não
 *  na tela.
 *
 *  ── A base mínima do ranking ───────────────────────────────────────────────
 *  Sem piso, um post com 40 alcances e 3 interações marca 7,5% e vence um com
 *  10 mil alcances e 600 interações (6%). E chamar de "pior post" algo que quase
 *  ninguém viu culpa o conteúdo por um problema de distribuição.
 *
 *  Decidido: entra no ranking quem tiver alcance ≥ 20% da MEDIANA do período.
 *  Mediana, e não média, porque um viral único puxaria a média e excluiria a
 *  operação normal do cliente do próprio ranking.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Fração da mediana de alcance abaixo da qual a publicação não é ranqueada. */
export const PISO_DO_RANKING = 0.2;

export const ROTULO_TAXA = {
  alcance: "Taxa de engajamento por alcance",
  seguidores: "Taxa por seguidores",
} as const;

/**
 * `null` quando não dá para calcular — e nunca 0.
 *
 * Divisor ausente significa "não medimos"; divisor zero significa "ninguém viu",
 * e nos dois casos uma taxa de 0% afirmaria que o conteúdo não engajou, que é
 * uma frase sobre o conteúdo e não sobre a medição.
 */
export function taxaPorAlcance(interacoes: number | null, alcance: number | null): number | null {
  if (interacoes == null || alcance == null || alcance <= 0) return null;
  return (interacoes / alcance) * 100;
}

export function taxaPorSeguidores(interacoes: number | null, seguidores: number | null): number | null {
  if (interacoes == null || seguidores == null || seguidores <= 0) return null;
  return (interacoes / seguidores) * 100;
}

export interface PublicacaoRanqueavel {
  id: string;
  interacoes: number | null;
  alcance: number | null;
  /**
   * Seguidores no dia em que a publicação foi medida.
   *
   * Necessário para o alcance relativo, e é ele que faz a comparação sobreviver
   * ao crescimento da conta: 500 de alcance numa base de 1.000 é o dobro de 500
   * numa base de 2.000, e o número bruto diria que empataram.
   */
  seguidoresNaEpoca?: number | null;
}

/** Por qual eixo ordenar. Os dois usam o MESMO piso de alcance. */
export type CriterioDeRanking = "engajamento" | "alcanceRelativo";

export const ROTULO_CRITERIO: Record<CriterioDeRanking, string> = {
  engajamento: "Taxa de engajamento",
  alcanceRelativo: "Alcance relativo",
};

/**
 * Quanto da base a publicação alcançou.
 *
 * `null` sem seguidores — dividir por uma base que não se conhece produziria um
 * número com aparência de percentual e sem denominador.
 */
export function alcanceRelativo(alcance: number | null, seguidores: number | null): number | null {
  if (alcance == null || seguidores == null || seguidores <= 0) return null;
  return (alcance / seguidores) * 100;
}

export interface PublicacaoRanqueada<T extends PublicacaoRanqueavel> {
  publicacao: T;
  taxa: number;
}

export interface Ranking<T extends PublicacaoRanqueavel> {
  melhores: PublicacaoRanqueada<T>[];
  piores: PublicacaoRanqueada<T>[];
  /** Piso aplicado. `null` quando não houve alcance para calcular mediana. */
  alcanceMinimo: number | null;
  medianaAlcance: number | null;
  /** Quantas ficaram de fora por alcance baixo — a tela avisa, não esconde. */
  excluidasPorAlcance: number;
  /** Quantas não puderam ser avaliadas por falta de dado. */
  semDados: number;
  elegiveis: number;
  criterio: CriterioDeRanking;
  /** A base da afirmação — "analisados X posts". Sempre visível na tela. */
  analisadas: number;
}

/** Mediana de verdade: com par de elementos, a média dos dois centrais. */
export function mediana(valores: number[]): number | null {
  const v = valores.filter((n) => Number.isFinite(n)).slice().sort((a, b) => a - b);
  if (v.length === 0) return null;
  const meio = Math.floor(v.length / 2);
  return v.length % 2 === 1 ? v[meio] : (v[meio - 1] + v[meio]) / 2;
}

export function rankingDePublicacoes<T extends PublicacaoRanqueavel>(
  publicacoes: T[],
  quantidade = 3,
  criterio: CriterioDeRanking = "engajamento",
): Ranking<T> {
  // Sem alcance ou sem interações não há taxa — e um post sem dado não pode ser
  // chamado de pior. Ele é contado à parte, para a tela poder dizer por quê.
  const comDados = publicacoes.filter((p) => p.alcance != null && p.alcance > 0 && p.interacoes != null);
  const semDados = publicacoes.length - comDados.length;

  const med = mediana(comDados.map((p) => p.alcance as number));
  const alcanceMinimo = med == null ? null : med * PISO_DO_RANKING;

  const elegiveis = alcanceMinimo == null
    ? []
    : comDados.filter((p) => (p.alcance as number) >= alcanceMinimo);
  const excluidasPorAlcance = comDados.length - elegiveis.length;

  // O PISO continua sendo o alcance nos dois critérios: uma publicação que
  // quase ninguém viu não pode liderar nem por engajamento nem por alcance
  // relativo — no segundo caso ela seria descartada pelo próprio valor, mas o
  // piso mantém a base do ranking idêntica entre os eixos, e é isso que torna
  // as duas listas comparáveis.
  const valorDe = (p: T): number | null => criterio === "alcanceRelativo"
    ? alcanceRelativo(p.alcance, p.seguidoresNaEpoca ?? null)
    : taxaPorAlcance(p.interacoes, p.alcance);

  const ordenadas = elegiveis
    .map((p) => ({ publicacao: p, taxa: valorDe(p) }))
    .filter((x): x is { publicacao: T; taxa: number } => x.taxa !== null)
    // Empate na taxa desempata por interações absolutas: entre dois posts com a
    // mesma taxa, o que engajou mais gente é o melhor.
    .sort((a, b) => b.taxa - a.taxa || (b.publicacao.interacoes ?? 0) - (a.publicacao.interacoes ?? 0));

  // Com poucas publicações, melhores e piores apontariam para as mesmas — o que
  // faria o mesmo post ser elogiado e criticado lado a lado. Precisa haver o
  // dobro para as duas listas existirem sem se cruzar.
  const cabem = ordenadas.length >= quantidade * 2 ? quantidade : Math.floor(ordenadas.length / 2);

  return {
    melhores: ordenadas.slice(0, cabem),
    piores: cabem === 0 ? [] : ordenadas.slice(-cabem).reverse(),
    alcanceMinimo,
    medianaAlcance: med,
    excluidasPorAlcance,
    semDados,
    elegiveis: ordenadas.length,
    criterio,
    /** Quantas publicações o período trouxe, antes de qualquer corte. */
    analisadas: publicacoes.length,
  };
}

/**
 * A frase sobre o que ficou de fora.
 *
 * Existe porque publicação excluída em silêncio some sem explicação, e quem olha
 * conta os posts da grade, conta os do ranking, e não fecha.
 */
export function avisoDeExclusao(r: Ranking<PublicacaoRanqueavel>): string | null {
  const partes: string[] = [];
  if (r.excluidasPorAlcance > 0) {
    partes.push(`${r.excluidasPorAlcance} fora do ranking por alcance baixo`);
  }
  if (r.semDados > 0) {
    partes.push(`${r.semDados} sem dados de alcance ou interações`);
  }
  return partes.length ? `${partes.join(" · ")}.` : null;
}

// ─── A composição do engajamento ─────────────────────────────────────────────

export interface ParteDoEngajamento {
  /**
   * `replies` entrou aqui, e não como métrica separada: resposta a story É
   * engajamento — alguém reagiu ao conteúdo. Fora do card, ela aparecia como se
   * fosse outra coisa, e o total de engajamento parecia menor do que é.
   */
  chave: "likes" | "comments" | "shares" | "saves" | "replies";
  rotulo: string;
  total: number;
}

export interface ComposicaoDoEngajamento {
  partes: ParteDoEngajamento[];
  /** As quatro responderam? */
  completa: boolean;
  /**
   * O número grande do cartão — o total que a composição abaixo explica.
   *
   * Quase sempre é `total_interactions` puro. Só difere quando dá para PROVAR
   * que a Meta não contou as respostas aos stories ali dentro (ver
   * `respostasNoTotal`): nesse caso elas entram, porque a alternativa é uma
   * lista de parcelas que soma mais que o número que ela deveria explicar.
   */
  totalApresentado: number | null;
  /**
   * A Meta já conta respostas a story em `total_interactions`?
   *
   * `true` provado · `false` provado · `null` não dá para saber (faltou parcela,
   * faltou total, ou não houve resposta nenhuma no período).
   */
  respostasNoTotal: boolean | null;
  /**
   * As partes somam o total apresentado?
   *
   * `null` quando não dá para verificar — falta o total ou falta parte. Só
   * `false` significa divergência de verdade.
   */
  fecha: boolean | null;
  /** A ressalva para a tela, quando há. */
  ressalva: string | null;
}

const ROTULO_PARTE: Record<ParteDoEngajamento["chave"], string> = {
  likes: "curtidas",
  comments: "comentários",
  shares: "compartilhamentos",
  saves: "salvamentos",
  replies: "respostas aos stories",
};

/**
 * De que é feito o engajamento do período.
 *
 * ── A conferência é o produto, não o enfeite ───────────────────────────────
 * Uma linha de apoio embaixo de um número grande é lida como explicação DELE.
 * Se as partes não somarem o total, a tela estará afirmando uma decomposição
 * falsa — e ninguém confere de cabeça quatro parcelas contra um total.
 *
 * Por isso `fecha` existe e é ternário: `true` quando bate, `false` quando
 * diverge de verdade, e `null` quando falta peça para verificar. Só o `false`
 * é problema; o `null` é honestidade sobre o que não se sabe.
 *
 * ── Parcela ausente não vira zero ──────────────────────────────────────────
 * Uma categoria que a Meta não devolveu fica FORA da lista. Escrevê-la como
 * "0 salvamentos" afirmaria que ninguém salvou, quando o que houve foi não
 * termos perguntado ou não termos recebido resposta.
 */
export function composicaoDoEngajamento(
  valores: Partial<Record<ParteDoEngajamento["chave"], number | null>>,
  total: number | null,
): ComposicaoDoEngajamento {
  const chaves: Array<ParteDoEngajamento["chave"]> = ["likes", "comments", "shares", "saves", "replies"];
  const partes = chaves
    .filter((c) => typeof valores[c] === "number")
    .map((c) => ({ chave: c, rotulo: ROTULO_PARTE[c], total: valores[c] as number }));

  /**
   * "Completa" continua sendo as QUATRO originais.
   *
   * `replies` não entra na conta de completude porque não se sabe se a Meta a
   * inclui em `total_interactions`. Exigi-la faria toda conta sem respostas
   * aparecer como incompleta, e o aviso perderia o sentido.
   */
  const completa = ["likes", "comments", "shares", "saves"]
    .every((c) => partes.some((p) => p.chave === c));
  if (!partes.length) {
    return {
      partes: [], completa: false, totalApresentado: total,
      respostasNoTotal: null, fecha: null, ressalva: null,
    };
  }

  /**
   * A conferência é feita sobre AS QUATRO, não sobre as cinco.
   *
   * Curtidas, comentários, compartilhamentos e salvamentos são parcelas
   * conhecidas de `total_interactions`. Resposta a story não é: a Meta a devolve
   * por outra métrica, e nunca documentou se a soma dela já está no total.
   * Jogá-la na mesma conta faria a conferência acusar divergência toda vez que
   * alguém respondesse um story — um alarme que diria mais sobre a nossa
   * suposição do que sobre o dado.
   */
  const quatro = partes.filter((p) => p.chave !== "replies");
  const soma = quatro.reduce((n, p) => n + p.total, 0);
  const respostas = valores.replies;
  const fecha = total == null || !completa ? null : soma === total;

  /**
   * A pergunta se responde sozinha, e o período que tem resposta é quem responde.
   *
   * Se as quatro já batem com o total, sobrou a resposta de story de fora dele.
   * Se batem só depois de somá-la, ela estava dentro. Sem resposta nenhuma no
   * período, as duas hipóteses são indistinguíveis — e aí a saída é `null`, não
   * um chute que fica gravado como fato na próxima leitura.
   */
  let respostasNoTotal: boolean | null = null;
  if (completa && total != null && typeof respostas === "number" && respostas > 0) {
    if (soma === total) respostasNoTotal = false;
    else if (soma + respostas === total) respostasNoTotal = true;
  }

  // O total só cresce quando está PROVADO que as respostas ficaram de fora.
  // Somá-las na dúvida inflaria o engajamento de toda conta com stories ativos.
  const totalApresentado = respostasNoTotal === false && typeof respostas === "number"
    ? total! + respostas
    : total;

  let ressalva: string | null = null;
  if (!completa) {
    const faltando = (["likes", "comments", "shares", "saves"] as const)
      .filter((c) => typeof valores[c] !== "number").map((c) => ROTULO_PARTE[c]);
    ressalva = `sem ${faltando.join(" e ")} nesta coleta`;
  } else if (respostasNoTotal === false) {
    ressalva = "as respostas aos stories vêm de outra métrica e foram somadas ao total";
  } else if (fecha === false && respostasNoTotal !== true) {
    // Divergência dita, e não escondida: a Meta pode contar no total algo que
    // não devolve como parcela, e apresentar a soma como se fosse o total
    // transformaria uma diferença conhecida num erro invisível.
    ressalva = `as parcelas somam ${soma.toLocaleString("pt-BR")}, e o total é outro`;
  } else if (typeof respostas !== "number") {
    // Quatro estados: aqui a distinção é entre "ninguém respondeu" e "não
    // perguntamos". Sem esta linha, as duas viram a mesma tela silenciosa.
    ressalva = "respostas aos stories não medidas nesta coleta";
  }

  return { partes, completa, totalApresentado, respostasNoTotal, fecha, ressalva };
}
