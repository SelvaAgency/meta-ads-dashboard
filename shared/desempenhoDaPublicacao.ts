/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  A etiqueta de desempenho — e o porquê dela
 * ─────────────────────────────────────────────────────────────────────────────
 *  Puro. Classifica cada publicação CONTRA A PRÓPRIA CONTA, e nunca contra um
 *  número de mercado: 2% de taxa é excelente para uma conta e medíocre para
 *  outra, e um limiar universal transformaria o porte do cliente em veredito
 *  sobre o conteúdo dele.
 *
 *  ── Por que a taxa sozinha não pode decidir ────────────────────────────────
 *  Uma publicação com pouco alcance e muitas curtidas tem taxa altíssima — ela
 *  lideraria o "melhor do período" tendo sido vista por quase ninguém. O
 *  destaque precisa das duas coisas: engajou bem E chegou a gente.
 *
 *  ── E por que NÃO se multiplica taxa por alcance ───────────────────────────
 *  Porque `taxa × alcance = interações`. Qualquer índice multiplicativo entre as
 *  duas — inclusive a média geométrica das razões, que parece equilibrada — é
 *  monótono nas interações absolutas: o ranking voltaria a ser "quem teve mais
 *  curtidas", que é justamente o que a taxa existia para corrigir. Somar as
 *  razões também não resolve, porque uma ponta altíssima compra a outra.
 *
 *  ── O índice é o MAIS FRACO dos dois ───────────────────────────────────────
 *  `min(taxa ÷ mediana, alcance ÷ mediana)`.
 *
 *  Ele é conservador de propósito: para ser destaque, a publicação precisa não
 *  ter ponto fraco. Taxa 3× com alcance 0,2× vale 0,2 — e é isso mesmo, porque
 *  quase ninguém viu. Alcance 4× com taxa 0,3× vale 0,3, porque chegou a muita
 *  gente e não engajou. E é auditável numa frase: "o pior dos dois".
 *
 *  ── Amostra pequena não recebe etiqueta ────────────────────────────────────
 *  Com três publicações, "o pior do período" é uma frase sobre o acaso. A
 *  etiqueta afirma algo sobre o CONTEÚDO, e afirmações precisam de amostra —
 *  abaixo do piso ninguém é rotulado, nem o melhor.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { mediana } from "./engajamento";

export type NivelDeDesempenho =
  | "muito_acima" | "acima" | "na_media" | "abaixo" | "muito_abaixo";

export interface EtiquetaDeDesempenho {
  nivel: NivelDeDesempenho;
  rotulo: string;
  /** `melhor` e `pior` do período pelo índice. Recebem destaque próprio. */
  extremo: "melhor" | "pior" | null;
  /** Por que caiu nesse nível — sempre com as DUAS razões. */
  motivo: string;
  /** O índice: o mais fraco entre taxa e alcance, em múltiplos da mediana. */
  indice: number;
  vezesATaxa: number;
  vezesOAlcance: number;
}

/** Abaixo disto, a ordem diz mais sobre o acaso do que sobre o conteúdo. */
export const PUBLICACOES_MINIMAS_PARA_ETIQUETA = 5;

/**
 * Os cortes, em múltiplos da mediana.
 *
 * Assimétricos de propósito. Dobrar a mediana nas DUAS pontas é um evento raro;
 * cair à metade em uma delas é comum. Simetria produziria "muito abaixo" toda
 * semana e "muito acima" quase nunca.
 */
const CORTES = { muitoAcima: 1.6, acima: 1.15, abaixo: 0.75, muitoAbaixo: 0.4 } as const;

export const ROTULO_NIVEL: Record<NivelDeDesempenho, string> = {
  muito_acima: "desempenho muito acima",
  acima: "acima da média",
  na_media: "na média da conta",
  abaixo: "abaixo da média",
  muito_abaixo: "desempenho muito abaixo",
};

export interface PublicacaoClassificavel {
  id: string;
  /** Taxa de engajamento sobre alcance. `null` = não classificável. */
  taxa: number | null;
  alcance: number | null;
}

const quanto = (razao: number) => `${Math.round(Math.abs(razao - 1) * 100)}%`;
const lado = (razao: number, o: string) =>
  razao >= 1 ? `${o} ${quanto(razao)} acima da mediana` : `${o} ${quanto(razao)} abaixo da mediana`;

/**
 * Etiqueta cada publicação contra as medianas da própria conta no período.
 *
 * Publicações sem taxa OU sem alcance ficam fora do cálculo e da etiquetagem:
 * sem as duas não há como pesar as duas, e incluí-las com zero puxaria as
 * medianas para baixo, promovendo todas as outras por um defeito de medição.
 */
export function etiquetarDesempenho(
  publicacoes: PublicacaoClassificavel[],
): Map<string, EtiquetaDeDesempenho> {
  const etiquetas = new Map<string, EtiquetaDeDesempenho>();

  const completas = publicacoes.filter(
    (p): p is { id: string; taxa: number; alcance: number } =>
      p.taxa != null && p.alcance != null && p.alcance > 0);
  if (completas.length < PUBLICACOES_MINIMAS_PARA_ETIQUETA) return etiquetas;

  const medTaxa = mediana(completas.map((p) => p.taxa));
  const medAlcance = mediana(completas.map((p) => p.alcance));
  // Sem uma das duas medianas não dá para pesar as duas — e pesar uma só é
  // exatamente o problema que este módulo existe para evitar.
  if (medTaxa == null || medTaxa <= 0 || medAlcance == null || medAlcance <= 0) return etiquetas;

  const comIndice = completas.map((p) => {
    const vezesATaxa = p.taxa / medTaxa;
    const vezesOAlcance = p.alcance / medAlcance;
    return { p, vezesATaxa, vezesOAlcance, indice: Math.min(vezesATaxa, vezesOAlcance) };
  });

  const ordenadas = [...comIndice].sort((a, b) => b.indice - a.indice);
  const melhor = ordenadas[0];
  const pior = ordenadas[ordenadas.length - 1];

  for (const x of comIndice) {
    const nivel: NivelDeDesempenho =
      x.indice >= CORTES.muitoAcima ? "muito_acima"
      : x.indice >= CORTES.acima ? "acima"
      : x.indice <= CORTES.muitoAbaixo ? "muito_abaixo"
      : x.indice <= CORTES.abaixo ? "abaixo"
      : "na_media";

    /**
     * As duas razões, SEMPRE — e não só a que virou etiqueta.
     *
     * É o que separa "funcionou" de "quase ninguém viu": as duas produzem taxa
     * alta, e contam histórias opostas para quem decide o que repetir.
     */
    const motivo = `${lado(x.vezesATaxa, "taxa")}, ${lado(x.vezesOAlcance, "alcance")}`;

    etiquetas.set(x.p.id, {
      nivel,
      rotulo: ROTULO_NIVEL[nivel],
      extremo: x.p.id === melhor.p.id ? "melhor" : x.p.id === pior.p.id ? "pior" : null,
      motivo,
      indice: x.indice,
      vezesATaxa: x.vezesATaxa,
      vezesOAlcance: x.vezesOAlcance,
    });
  }

  return etiquetas;
}
