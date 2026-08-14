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
  /** Quem responde, resolvido no servidor. `null` = sem responsável. */
  responsavelUserId: number | null;
  responsavelNome: string | null;
  responsavelAvatarUrl: string | null;
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
 * A ordem, e ela é do PRAZO — não há ordenação manual.
 *
 * ── Por que a seta saiu ────────────────────────────────────────────────────
 * Ordem manual e prazo competem: a pessoa arrasta o item para o topo porque ele
 * é urgente, e no dia seguinte outro item venceu antes e o topo está errado.
 * Aí a ordem passa a ser mantida à mão para continuar significando o que o
 * prazo já dizia sozinho. Derivar do prazo elimina o trabalho e a divergência.
 *
 * ── Vencido vem primeiro, e isso é intencional ─────────────────────────────
 * A ordenação é crescente pela data, então prazo que JÁ PASSOU aparece antes de
 * qualquer outro. É o que se quer: um prazo estourado é a coisa mais urgente da
 * lista, e escondê-lo no fim seria o oposto da função do painel.
 *
 * Sem prazo vai para o fim — não por ser menos importante, mas porque não
 * compete no eixo que ordena. Entre eles, a ordem de criação (o `id`), que é
 * estável: sem critério estável a lista se reembaralharia a cada leitura.
 */
export function ordenarPorPrazo(itens: ItemPrioridade[]): ItemPrioridade[] {
  return [...itens].sort((a, b) => {
    if (a.prazo && b.prazo) {
      // Comparação de string funciona porque AAAA-MM-DD é ordenável como texto.
      if (a.prazo !== b.prazo) return a.prazo < b.prazo ? -1 : 1;
      return a.id - b.id;
    }
    if (a.prazo) return -1;
    if (b.prazo) return 1;
    return a.id - b.id;
  });
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
    .map((tipo) => ({ tipo, itens: ordenarPorPrazo(itens.filter((i) => i.tipo === tipo)) }))
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
