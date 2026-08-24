/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Contexto de UM ponto técnico — mais específico que o da conta
 * ─────────────────────────────────────────────────────────────────────────────
 *  Puro, compartilhado. O contexto da conta responde "como esta operação
 *  funciona"; este responde "o que aconteceu NESTE alerta". São perguntas
 *  diferentes, e misturá-las produz um dos dois erros:
 *
 *    "esse pedido foi teste" no contexto da CONTA vira regra permanente, e todo
 *    pedido futuro passa a ser suspeito de ser teste
 *
 *    "o cliente é B2B" no contexto do PONTO se perde quando o alerta sai da
 *    lista, e a informação — que é durável — desaparece com ele
 *
 *  ── A chave é a do achado, e ela existe por sorte nenhuma ───────────────────
 *  O texto do alerta carrega números que mudam todo dia ("1 pedido pago somando
 *  R$ 0 em 7d"). Ancorar o contexto no texto o desprenderia amanhã, quando
 *  virasse "2 pedidos". `achado.chave` é slug estável — `purchase_sem_valor` — e
 *  é nela que o contexto se prende.
 *
 *  ── O específico ganha do geral ────────────────────────────────────────────
 *  Quando os dois falam do mesmo fato, vence o do ponto: ele foi escrito olhando
 *  aquele alerta. Isso aparece na ORDEM do bloco enviado à IA — o último a ser
 *  lido é o que prevalece — e não numa regra que descarta o outro.
 *
 *  ── Reavaliar não é apagar ─────────────────────────────────────────────────
 *  Um achado contextualizado continua na lista. A regra mediu algo real, e
 *  apagá-lo destruiria a rastreabilidade: ninguém descobriria depois que a
 *  qualificação estava errada. O que muda é a POSIÇÃO — ele deixa de liderar a
 *  lista de prioridades enquanto houver alerta sem explicação. Essa parte é
 *  determinística e testável; a releitura em prosa é da IA.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface ContextoDoAchado {
  /** `achado.chave` — o slug estável, nunca o texto. */
  chave: string;
  texto: string;
}

export interface AchadoBase {
  chave: string;
  /**
   * `medicao` entrou em 19/08/2026, com o PageSpeed: falha de MEDIÇÃO nossa, e
   * não afirmação sobre o cliente. Ver `SeveridadeDoAchado` em `panoramaLogic`.
   */
  severidade: "critico" | "atencao" | "info" | "medicao";
  texto: string;
}

export interface AchadoContextualizado<T extends AchadoBase = AchadoBase> {
  achado: T;
  /** O que a equipe explicou sobre ESTE alerta. `null` quando ninguém explicou. */
  contexto: string | null;
}

/**
 * `medicao` fica DEPOIS de `info`, no fim da lista.
 *
 * Não é o menos importante — é o menos urgente para quem lê "o que está errado
 * com este cliente": a resposta ali é "nada que saibamos; o que falhou foi a
 * nossa medição". Colocá-lo acima de um vazamento de checkout mandaria refazer
 * um teste antes de olhar o dinheiro saindo.
 */
const PESO: Record<AchadoBase["severidade"], number> = { critico: 0, atencao: 1, info: 2, medicao: 3 };

/**
 * Casa cada achado com o contexto dele e reordena.
 *
 * A ordem é severidade primeiro, e DENTRO dela o não-contextualizado vem antes.
 * O motivo é o que a lista existe para responder: "o que eu ainda não sei?".
 * Um alerta já explicado ocupando o topo faz a pessoa reler todo dia a
 * explicação que ela mesma escreveu — e o alerta novo, que é o que importa,
 * fica embaixo dele.
 *
 * A ordenação é ESTÁVEL entre iguais: sem isso, dois achados de mesma
 * severidade e mesmo estado trocariam de lugar entre renderizações, e a lista
 * pareceria mudar sozinha.
 */
export function aplicarContextoAosAchados<T extends AchadoBase>(
  achados: T[], contextos: ContextoDoAchado[],
): Array<AchadoContextualizado<T>> {
  // Só entram os contextos com texto: string vazia guardada tornaria o alerta
  // "contextualizado" sem ter explicação nenhuma.
  const porChave = new Map<string, string>();
  for (const c of contextos) {
    const t = c.texto.trim();
    if (t) porChave.set(c.chave, t);
  }

  return achados
    .map((achado, i) => ({ achado, contexto: porChave.get(achado.chave) ?? null, i }))
    .sort((a, b) => {
      const s = PESO[a.achado.severidade] - PESO[b.achado.severidade];
      if (s !== 0) return s;
      const c = Number(!!a.contexto) - Number(!!b.contexto);
      if (c !== 0) return c;
      return a.i - b.i;
    })
    .map(({ achado, contexto }) => ({ achado, contexto }));
}

/**
 * O achado que lidera — o "ponto técnico" que a tela destaca.
 *
 * Devolve `null` quando não há achado nenhum. NÃO devolve `null` quando todos
 * estão contextualizados: o alerta continua existindo, e esconder o único que
 * há faria a tela parecer sem problema numa conta que tem um explicado.
 */
export function achadoQueLidera<T extends AchadoBase>(
  ordenados: Array<AchadoContextualizado<T>>,
): AchadoContextualizado<T> | null {
  // `info` não é problema — nunca lidera como ponto técnico.
  return ordenados.find((x) => x.achado.severidade !== "info") ?? null;
}

/**
 * O bloco dos contextos de ponto, para o prompt.
 *
 * Só entram os achados que estão na lista ATUAL. Um contexto guardado para um
 * alerta que já saiu descreve uma situação que não existe mais, e mandá-lo faria
 * a IA explicar um problema que ninguém está vendo.
 *
 * Vazio quando não há nenhum — pelo mesmo motivo do bloco da conta: instrução
 * sobre contexto inexistente faz o modelo procurar qualificação que ninguém
 * escreveu.
 */
export function blocoDosContextosDePonto<T extends AchadoBase>(
  ordenados: Array<AchadoContextualizado<T>>,
): string {
  const comContexto = ordenados.filter((x) => x.contexto);
  if (!comContexto.length) return "";

  return [
    "",
    "════ CONTEXTO DE PONTOS TÉCNICOS ESPECÍFICOS ════",
    "A equipe explicou os alertas abaixo, um por um. Estas explicações são MAIS "
    + "específicas que o contexto geral da conta: quando as duas tratarem do "
    + "mesmo fato, vale esta.",
    "Reavalie a RELEVÂNCIA de cada alerta explicado — não basta repetir a frase "
    + "da equipe ao lado dele. Se a explicação resolve o alerta, diga que ele "
    + "está resolvido e pare de tratá-lo como problema. Se não resolve, diga o "
    + "que continua em aberto.",
    "",
    ...comContexto.map((x) =>
      `- Alerta: "${x.achado.texto}"\n  Explicação da equipe: ${x.contexto}`),
    "════ FIM DOS CONTEXTOS DE PONTO ════",
  ].join("\n");
}
