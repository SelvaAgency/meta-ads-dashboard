/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  O que é uma prioridade da semana — e o que ela NÃO é
 * ─────────────────────────────────────────────────────────────────────────────
 *  Puro, compartilhado. Este arquivo carrega a decisão de produto que mais
 *  facilmente se perde na implementação: isto não é um segundo Trello.
 *
 *  ── A regra que impede a volta do Trello ───────────────────────────────────
 *  Um painel de direcionamento e uma lista de tarefas parecem a mesma coisa na
 *  tela e são opostos no uso: a lista quer ser COMPLETA, o direcionamento quer
 *  ser CURTO. Quando ele fica completo, ninguém lê — e o módulo perde a única
 *  função que tinha.
 *
 *  `agruparPorTipo` protege isso de duas formas: tipo sem item não aparece (não
 *  há "campo vazio para preencher", que é o convite silencioso a preencher), e
 *  o corte inicial existe para a Home não crescer sem limite.
 *
 *  ── A ordem dos tipos é a hierarquia da leitura ────────────────────────────
 *  PRIORIDADE vem primeiro porque é o que a pergunta "qual o foco da semana"
 *  quer saber. ATENÇÃO vem por último não por ser menos importante, mas porque
 *  é o que se lê DEPOIS de saber o foco — é ressalva, e ressalva antes do fato
 *  não tem em que se apoiar.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const TIPOS = ["PRIORIDADE", "ENTREGA", "ATENCAO"] as const;
export type TipoPrioridade = (typeof TIPOS)[number];

export const ROTULO_TIPO: Record<TipoPrioridade, string> = {
  PRIORIDADE: "Prioridade",
  ENTREGA: "Entrega",
  ATENCAO: "Atenção",
};

/** O título da seção, no plural — é assim que ele aparece na lista. */
export const TITULO_TIPO: Record<TipoPrioridade, string> = {
  PRIORIDADE: "Prioridades",
  ENTREGA: "Entregas",
  ATENCAO: "Atenção",
};

export const STATUS = ["PLANEJADO", "EM_ANDAMENTO", "CONCLUIDO"] as const;
export type StatusPrioridade = (typeof STATUS)[number];

export const ROTULO_STATUS: Record<StatusPrioridade, string> = {
  PLANEJADO: "Planejado",
  EM_ANDAMENTO: "Em andamento",
  CONCLUIDO: "Concluído",
};

export const ehTipo = (v: string): v is TipoPrioridade => (TIPOS as readonly string[]).includes(v);
export const ehStatus = (v: string): v is StatusPrioridade => (STATUS as readonly string[]).includes(v);

export interface ItemPrioridade {
  id: number;
  grupo: string;
  semana: string;
  tipo: TipoPrioridade;
  titulo: string;
  descricao: string | null;
  responsavel: string | null;
  /** `AAAA-MM-DD` ou `null`. Nunca a string "sem prazo". */
  prazo: string | null;
  status: StatusPrioridade;
  ordem: number;
}

/**
 * Quantos itens aparecem antes do "ver todas".
 *
 * Seis é o que cabe sem a Home crescer, e é mais do que uma semana saudável
 * costuma ter. Se um grupo passar disso com frequência, o problema não é o
 * corte — é o painel virando lista de tarefas.
 */
export const ITENS_VISIVEIS = 6;

export interface SecaoDeTipo {
  tipo: TipoPrioridade;
  itens: ItemPrioridade[];
}

/**
 * Agrupa por tipo, na ordem da hierarquia, DESCARTANDO tipo sem item.
 *
 * O descarte é a regra, não uma otimização: renderizar "ENTREGAS — nenhuma"
 * transformaria o painel num formulário a preencher, e o pedido é explícito de
 * que uma semana com duas prioridades mostre duas prioridades.
 */
export function agruparPorTipo(itens: ItemPrioridade[]): SecaoDeTipo[] {
  return TIPOS
    .map((tipo) => ({
      tipo,
      itens: itens
        .filter((i) => i.tipo === tipo)
        .sort((a, b) => a.ordem - b.ordem || a.id - b.id),
    }))
    .filter((s) => s.itens.length > 0);
}

/**
 * Corta a lista respeitando as seções.
 *
 * O corte é sobre o TOTAL do grupo, e não por tipo: seis prioridades mais seis
 * entregas seriam doze itens na Home, que é exatamente o que o limite existe
 * para evitar. E ele nunca deixa uma seção só com o título — uma seção que
 * ficaria vazia depois do corte some inteira.
 */
export function cortar(secoes: SecaoDeTipo[], limite: number): {
  visiveis: SecaoDeTipo[]; ocultos: number;
} {
  const total = secoes.reduce((n, s) => n + s.itens.length, 0);
  if (total <= limite) return { visiveis: secoes, ocultos: 0 };

  let resta = limite;
  const visiveis: SecaoDeTipo[] = [];
  for (const s of secoes) {
    if (resta <= 0) break;
    const itens = s.itens.slice(0, resta);
    resta -= itens.length;
    visiveis.push({ tipo: s.tipo, itens });
  }
  return { visiveis, ocultos: total - limite };
}

/**
 * A posição de destino ao mover um item.
 *
 * Devolve `null` quando o movimento não existe (primeiro subindo, último
 * descendo) para quem chama não gravar uma troca consigo mesmo — que gera
 * escrita, entrada de "atualizado por" e nenhuma mudança visível.
 */
export function vizinhoNaOrdem(
  itens: ItemPrioridade[], id: number, direcao: -1 | 1,
): ItemPrioridade | null {
  const ordenados = [...itens].sort((a, b) => a.ordem - b.ordem || a.id - b.id);
  const i = ordenados.findIndex((x) => x.id === id);
  if (i < 0) return null;
  return ordenados[i + direcao] ?? null;
}
