/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Os eventos de conversão de UM cliente — leitura, não soma
 * ─────────────────────────────────────────────────────────────────────────────
 *  Puro: sem rede, sem banco, sem relógio. Lê `metricsJson.eventos` do snapshot
 *  de GA4 que o coletor já grava.
 *
 *  ── Por que isto não é do portfólio ────────────────────────────────────────
 *  Uma versão anterior somava estes eventos entre todos os clientes no Panorama.
 *  O número resultante não era de ninguém: `whatsapp_click` é a conversão
 *  central de um site institucional e irrelevante numa loja, e `add_to_cart` é o
 *  contrário. Somá-los mede a composição da carteira, não a performance.
 *
 *  A leitura pertence à página do cliente, onde existe o contexto que decide se
 *  9 compras é bom.
 *
 *  ── A lista ainda é fixa, e a tela diz isso ────────────────────────────────
 *  Não existe configuração de eventos por conta no Spaces hoje — conferido:
 *  `clientClaritySettings` guarda URL e provider de performance, e
 *  `accountContext` é texto livre. Inventar uma escolha automática agora
 *  produziria uma régua que ninguém pediu.
 *
 *  Então o que se mostra é o que o coletor busca, dito como tal, e o evento que
 *  a propriedade não registra aparece como ausente em vez de zero. Quando a
 *  configuração por cliente existir, ela troca esta lista sem mexer no resto.
 *
 *  ── Ausente e zero não são a mesma coisa ───────────────────────────────────
 *    `null`  a propriedade não registra o evento — lacuna de tagueamento
 *    `0`     registra e ninguém disparou — fato sobre o período
 *
 *  As duas pedem ações diferentes: a primeira é conversa com quem implantou o
 *  GA4; a segunda é conversa sobre a campanha.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type EventoAcompanhado =
  "form_start" | "whatsapp_click" | "add_to_cart" | "begin_checkout" | "purchase";

export type GrupoDeEvento = "contato" | "compra";

/**
 * Os grupos. Contato e Compra são jornadas diferentes, e por isso nenhuma taxa
 * é calculada ENTRE elas — quem preenche formulário não "avança" para o
 * carrinho, e uma seta ligando os cinco afirmaria isso.
 */
export const GRUPOS_DE_EVENTO: Array<{
  chave: GrupoDeEvento; rotulo: string; eventos: EventoAcompanhado[];
}> = [
  { chave: "contato", rotulo: "Contato", eventos: ["form_start", "whatsapp_click"] },
  { chave: "compra", rotulo: "Compra", eventos: ["add_to_cart", "begin_checkout", "purchase"] },
];

/** O rótulo curto. O nome técnico continua visível no hover — é o que se
 *  procura no GA4 quando o número parece estranho. */
export const ROTULO_EVENTO: Record<EventoAcompanhado, string> = {
  form_start: "Formulário",
  whatsapp_click: "WhatsApp",
  add_to_cart: "Carrinho",
  begin_checkout: "Checkout",
  purchase: "Compra",
};

export type ContagemDeEvento = { atual: number | null; anterior: number | null };
export type EventosGA4 = Partial<Record<EventoAcompanhado, ContagemDeEvento>>;

export interface LeituraDeEvento {
  evento: EventoAcompanhado;
  nome: string;
  grupo: GrupoDeEvento;
  /** `null` = a propriedade não registra o evento. Zero é zero medido. */
  total: number | null;
  anterior: number | null;
  /** Variação percentual. `null` sem base anterior ou com base zero. */
  variacao: number | null;
  /** `true` quando o evento existe na propriedade — o que separa "—" de "0". */
  registrado: boolean;
}

export interface EventosDoCliente {
  leituras: LeituraDeEvento[];
  /** Só os que a propriedade registra — é o que a faixa do Resumo mostra. */
  registrados: LeituraDeEvento[];
  janela: "7d" | "30d";
  dia: string | null;
  /** `true` quando NENHUM dos acompanhados existe nesta propriedade. */
  nenhumRegistrado: boolean;
  /** `true` quando o snapshot é anterior à coleta de eventos. */
  semColeta: boolean;
}

export function eventosDoCliente(
  snapshot: { dia: string; metricsJson?: { eventos?: EventosGA4 | null } | null } | null | undefined,
  janela: "7d" | "30d" = "7d",
): EventosDoCliente {
  const brutos = snapshot?.metricsJson?.eventos ?? null;

  const leituras: LeituraDeEvento[] = GRUPOS_DE_EVENTO.flatMap((g) =>
    g.eventos.map((evento) => {
      const c = brutos?.[evento];
      const total = c?.atual ?? null;
      const anterior = c?.anterior ?? null;
      return {
        evento, nome: ROTULO_EVENTO[evento], grupo: g.chave,
        total, anterior,
        // Base zero não vira variação infinita, e sem base não se inventa uma.
        variacao: total != null && anterior != null && anterior > 0
          ? ((total - anterior) / anterior) * 100
          : null,
        registrado: total != null,
      };
    }));

  const registrados = leituras.filter((l) => l.registrado);
  return {
    leituras, registrados, janela,
    dia: snapshot?.dia ?? null,
    nenhumRegistrado: registrados.length === 0,
    // Snapshot sem o campo é anterior à coleta de eventos — diferente de uma
    // propriedade que simplesmente não registra nenhum deles.
    semColeta: !brutos,
  };
}

/**
 * A participação do evento nas sessões do período.
 *
 * Só existe com denominador confiável: sessões medidas e maiores que zero, e o
 * evento registrado. Sem isso devolve `null` — uma taxa sobre denominador
 * ausente pareceria medida e não seria.
 *
 * NÃO é taxa de conversão do funil: `begin_checkout / sessions` não diz quantos
 * dos que entraram no carrinho chegaram ao checkout. É participação sobre a
 * mesma base para todos os eventos, que é o que a torna comparável entre eles.
 */
export function participacaoNasSessoes(
  total: number | null, sessions: number | null | undefined,
): number | null {
  if (total == null || typeof sessions !== "number" || sessions <= 0) return null;
  return (total / sessions) * 100;
}
