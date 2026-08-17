/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  A paleta funcional da Social — uma família, um matiz
 * ─────────────────────────────────────────────────────────────────────────────
 *  Puro, compartilhado. Existe para que o número, a barra e a legenda da MESMA
 *  métrica usem a MESMA cor em toda a página. É isso que dispensa reler legenda
 *  a cada gráfico — e é o que se perde quando cada componente escolhe a sua.
 *
 *  ── Cor tem função, não decoração ──────────────────────────────────────────
 *  Seguidores é base (roxo), visitas é atenção do público (azul), ativações é
 *  produção (o rosa do Spaces), engajamento é reação (âmbar). Entrada e saída
 *  são as únicas cores de julgamento — verde e vermelho —, e por isso nenhuma
 *  outra família as usa.
 *
 *  ── Conteúdo em tons do rosa, de propósito ─────────────────────────────────
 *  Feed, carrossel, reels e story são a mesma coisa vista por formato: produção.
 *  Dar a cada um um matiz próprio no espectro faria quatro famílias onde há uma,
 *  e a leitura passaria a exigir a legenda que a paleta existe para dispensar.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import type { TipoConteudo } from "./tipoDeMidia";

export const COR = {
  seguidores: "#7C5CE0",
  visitas: "#2A9FD6",
  ativacoes: "#E87AB0",
  engajamento: "#E0A030",
  entrada: "#3FA66A",
  saida: "#D65745",
} as const;

/** Os quatro tons do rosa, um por formato. */
export const COR_TIPO: Record<TipoConteudo, string> = {
  FEED: "#E87AB0",
  CARROSSEL: "#F5ADCC",
  REELS: "#C4569A",
  STORY: "#FBD3E4",
  ANUNCIO: "#A16207",
  DESCONHECIDO: "#D6D3D1",
};

/** A ordem do empilhamento, de baixo para cima — story na base, reels no topo. */
export const ORDEM_TIPO: TipoConteudo[] = [
  "STORY", "CARROSSEL", "FEED", "REELS", "ANUNCIO", "DESCONHECIDO",
];

/**
 * Os tons das parcelas do engajamento.
 *
 * Variações do âmbar, e não cores novas: as quatro são a MESMA métrica vista por
 * tipo de interação. Cor distinta para cada uma sugeriria quatro métricas
 * independentes.
 */
export const COR_INTERACAO: Record<string, string> = {
  likes: "#E0A030",
  comments: "#E8B85A",
  saves: "#C4841E",
  shares: "#F0CE8A",
};
