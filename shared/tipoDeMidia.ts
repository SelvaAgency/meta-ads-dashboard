/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Que tipo de conteúdo é esta mídia
 * ─────────────────────────────────────────────────────────────────────────────
 *  Puro, compartilhado. A classificação precisa de DOIS campos da Meta, e é essa
 *  a razão de este arquivo existir:
 *
 *    media_type          IMAGE · VIDEO · CAROUSEL_ALBUM
 *    media_product_type  FEED · REELS · STORY · AD
 *
 *  Sozinho, nenhum dos dois responde. `media_type` não distingue reel de vídeo
 *  de feed — os dois são VIDEO. `media_product_type` não distingue carrossel de
 *  foto única — os dois são FEED. Usar só o primeiro classificaria como reel
 *  todo o acervo de vídeo anterior aos reels existirem, inflando a métrica que
 *  a agência mais olha hoje.
 *
 *  ── Anúncio não é publicação orgânica ──────────────────────────────────────
 *  `AD` ganha balde próprio em vez de cair em FEED. Uma mídia criada como
 *  anúncio somada ao total de "posts publicados" faria o número de publicações
 *  orgânicas subir por causa de verba — que é exatamente a mistura que esta
 *  frente inteira evita.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type TipoConteudo = "FEED" | "REELS" | "CARROSSEL" | "STORY" | "ANUNCIO" | "DESCONHECIDO";

export const ROTULO_CONTEUDO: Record<TipoConteudo, string> = {
  FEED: "Feed",
  REELS: "Reels",
  CARROSSEL: "Carrossel",
  STORY: "Stories",
  ANUNCIO: "Anúncio",
  DESCONHECIDO: "Não identificado",
};

/** O que entra na contagem de "posts publicados". Story e anúncio, não. */
export const CONTA_COMO_POST: TipoConteudo[] = ["FEED", "REELS", "CARROSSEL"];

/**
 * A ordem das perguntas É a regra.
 *
 * `media_product_type` vem primeiro por ser o sinal mais específico — ele diz o
 * PRODUTO, e produto ganha de formato. A exceção é o carrossel, que não existe
 * como produto: ele só se expressa em `media_type`, e por isso é conferido
 * depois de reels e antes do feed genérico.
 */
export function tipoDeConteudo(m: {
  mediaType?: string | null;
  mediaProductType?: string | null;
}): TipoConteudo {
  const produto = String(m.mediaProductType ?? "").toUpperCase();
  const formato = String(m.mediaType ?? "").toUpperCase();

  if (produto === "STORY") return "STORY";
  if (produto === "REELS") return "REELS";
  if (produto === "AD") return "ANUNCIO";
  if (formato === "CAROUSEL_ALBUM") return "CARROSSEL";
  if (produto === "FEED") return "FEED";

  // Sem produto declarado, o formato ainda diz algo: IMAGE ou VIDEO solto é
  // publicação de feed em conta antiga, de quando o campo não vinha.
  if (!produto && (formato === "IMAGE" || formato === "VIDEO")) return "FEED";
  return "DESCONHECIDO";
}

export interface ContagemPorTipo {
  total: number;
  porTipo: Record<TipoConteudo, number>;
}

/**
 * Conta publicações por tipo dentro de um intervalo, pela DATA DE PUBLICAÇÃO.
 *
 * Contar pelo `timestamp` da mídia, e não por um contador gravado a cada dia, é
 * decisão de produto: a lista de mídias alcança o passado e é sempre
 * recalculável, enquanto um contador diário passaria a discordar dela no dia em
 * que alguém apagasse uma publicação — e não haveria como saber qual dos dois
 * números vale.
 *
 * O que este número responde, então, é "quantas publicações daquele período
 * ainda existem", e não "quantas foram publicadas". As duas coincidem, exceto
 * quando algo é apagado.
 *
 * `inicio` e `fim` são dias (YYYY-MM-DD), inclusive nas duas pontas.
 */
export function contarPublicacoes(
  midias: Array<{ timestamp?: string | null; mediaType?: string | null; mediaProductType?: string | null }>,
  intervalo: { inicio: string; fim: string },
): ContagemPorTipo {
  const porTipo: Record<TipoConteudo, number> = {
    FEED: 0, REELS: 0, CARROSSEL: 0, STORY: 0, ANUNCIO: 0, DESCONHECIDO: 0,
  };
  let total = 0;
  for (const m of midias) {
    const dia = diaDe(m.timestamp);
    if (!dia || dia < intervalo.inicio || dia > intervalo.fim) continue;
    const tipo = tipoDeConteudo(m);
    porTipo[tipo] += 1;
    if (CONTA_COMO_POST.includes(tipo)) total += 1;
  }
  return { total, porTipo };
}

/**
 * O dia (YYYY-MM-DD) de um timestamp da Meta.
 *
 * Recorta a string em vez de construir Date: `new Date(...).toISOString()`
 * converteria para UTC e jogaria um post das 21h de São Paulo para o dia
 * seguinte — deslocando a contagem de um dia inteiro na virada do mês.
 */
export function diaDe(timestamp?: string | null): string | null {
  const t = String(timestamp ?? "");
  const m = t.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}
