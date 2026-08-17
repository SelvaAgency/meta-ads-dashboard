/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Provar que o contexto do PONTO reavalia o alerta, e não o decora
 * ─────────────────────────────────────────────────────────────────────────────
 *  O mesmo limite honesto do contexto da conta: estes testes NÃO verificam a
 *  saída do modelo. Verificam as duas coisas determinísticas — a instrução que
 *  acompanha a explicação, e a POSIÇÃO do alerta na lista de prioridades.
 *
 *  A segunda é a que mais importa e a que ninguém esperaria de um teste: um
 *  alerta explicado deixa de liderar enquanto houver alerta sem explicação. É
 *  disso que "reavaliar a relevância" é feito na camada de regra — a releitura em
 *  prosa é da IA, e essa não se testa aqui.
 *
 *  E a âncora: o contexto se prende a `achado.chave`, nunca ao texto. O texto
 *  carrega números que mudam todo dia ("1 pedido" → "2 pedidos"), e o contexto
 *  ancorado nele se desprenderia amanhã, em silêncio.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, expect, it } from "vitest";
import {
  achadoQueLidera, aplicarContextoAosAchados, blocoDosContextosDePonto,
  type AchadoBase,
} from "./contextoDoAchado";

const achado = (chave: string, severidade: AchadoBase["severidade"], texto: string): AchadoBase =>
  ({ chave, severidade, texto });

/** O caso do pedido, literal. */
const CUPOM = achado(
  "purchase_sem_valor", "atencao",
  `1 pedido pago somando R$ 0 em 7d — cupom "tstles" descontou 100% — teste interno ou cupom indevido?`,
);
const CTX_TESTE = "Compra teste interna. Desconsiderar.";

describe("o contexto se ancora na CHAVE, não no texto", () => {
  /**
   * O texto muda de "1 pedido" para "2 pedidos" amanhã. Se a âncora fosse ele, o
   * contexto se desprenderia sem ninguém notar — o alerta voltaria a aparecer
   * como novo, e a explicação ficaria órfã no banco.
   */
  it("o mesmo alerta com texto diferente continua contextualizado", () => {
    const amanha = achado("purchase_sem_valor", "atencao", "2 pedidos pagos somando R$ 0 em 7d — cupom…");
    const r = aplicarContextoAosAchados([amanha], [{ chave: "purchase_sem_valor", texto: CTX_TESTE }]);
    expect(r[0].contexto).toBe(CTX_TESTE);
  });

  it("contexto de outra chave não cola no alerta errado", () => {
    const r = aplicarContextoAosAchados([CUPOM], [{ chave: "ssl_invalido", texto: "trocamos o certificado" }]);
    expect(r[0].contexto).toBeNull();
  });

  it("contexto em branco não conta como contextualizado", () => {
    const r = aplicarContextoAosAchados([CUPOM], [{ chave: "purchase_sem_valor", texto: "   " }]);
    expect(r[0].contexto).toBeNull();
  });
});

describe("explicado deixa de liderar a lista de prioridades", () => {
  const semExplicacao = achado("ga4_sem_evento", "atencao", "GA4 sem evento de conversão");

  /**
   * A pergunta que a lista responde é "o que eu ainda NÃO sei?". Um alerta já
   * explicado no topo faz a pessoa reler todo dia a explicação que ela mesma
   * escreveu, e o alerta novo fica embaixo dele.
   */
  it("com dois de mesma severidade, o sem contexto lidera", () => {
    const r = aplicarContextoAosAchados(
      [CUPOM, semExplicacao], [{ chave: "purchase_sem_valor", texto: CTX_TESTE }]);
    expect(achadoQueLidera(r)?.achado.chave).toBe("ga4_sem_evento");
  });

  /** Severidade ainda manda: crítico explicado vem antes de atenção nova. */
  it("severidade continua acima do estado de contexto", () => {
    const critico = achado("fora_do_ar", "critico", "site fora do ar");
    const r = aplicarContextoAosAchados(
      [semExplicacao, critico], [{ chave: "fora_do_ar", texto: "manutenção programada" }]);
    expect(achadoQueLidera(r)?.achado.chave).toBe("fora_do_ar");
  });

  /**
   * Esconder o único alerta que existe faria a tela parecer sem problema numa
   * conta que tem um explicado. Ele continua aparecendo — marcado.
   */
  it("alerta único contextualizado continua aparecendo", () => {
    const r = aplicarContextoAosAchados([CUPOM], [{ chave: "purchase_sem_valor", texto: CTX_TESTE }]);
    expect(achadoQueLidera(r)?.achado.chave).toBe("purchase_sem_valor");
    expect(achadoQueLidera(r)?.contexto).toBe(CTX_TESTE);
  });

  it("`info` nunca lidera como ponto técnico", () => {
    const r = aplicarContextoAosAchados([achado("nota", "info", "observação")], []);
    expect(achadoQueLidera(r)).toBeNull();
  });

  /** Lista que muda de ordem entre renderizações parece mudar sozinha. */
  it("a ordem é estável entre iguais", () => {
    const a = achado("a", "atencao", "A");
    const b = achado("b", "atencao", "B");
    expect(aplicarContextoAosAchados([a, b], []).map((x) => x.achado.chave)).toEqual(["a", "b"]);
    expect(aplicarContextoAosAchados([a, b], []).map((x) => x.achado.chave)).toEqual(["a", "b"]);
  });

  it("sem achado nenhum, não há quem lidere", () => {
    expect(achadoQueLidera(aplicarContextoAosAchados([], []))).toBeNull();
  });
});

describe("O TESTE OBRIGATÓRIO: o pedido de R$ 0 com contexto de teste", () => {
  /**
   * O caso do pedido. A instrução tem que mandar a IA REAVALIAR a relevância —
   * "não basta repetir a frase da equipe ao lado do alerta". Sem essa frase, o
   * modelo cita a explicação e mantém o alerta como evidência de problema
   * comercial, que é exatamente o que aconteceu com o contexto da conta.
   */
  it("com contexto de teste, o bloco manda reavaliar e resolver", () => {
    const r = aplicarContextoAosAchados([CUPOM], [{ chave: "purchase_sem_valor", texto: CTX_TESTE }]);
    const bloco = blocoDosContextosDePonto(r);

    expect(bloco).toContain(CTX_TESTE);
    expect(bloco).toContain("Reavalie a RELEVÂNCIA");
    expect(bloco).toContain("não basta repetir a frase");
    expect(bloco).toMatch(/pare de tratá-lo como problema/);
    // E o específico vence o geral quando os dois falam do mesmo fato.
    expect(bloco).toContain("MAIS específicas que o contexto geral");
  });

  /**
   * O teste inverso que o pedido exige. "Esse pedido foi de um cliente real" NÃO
   * resolve o alerta — e a instrução tem que deixar a IA dizer isso, em vez de
   * tratar toda explicação como absolvição.
   */
  it("contexto que NÃO resolve deixa espaço para o alerta continuar valendo", () => {
    const r = aplicarContextoAosAchados(
      [CUPOM], [{ chave: "purchase_sem_valor", texto: "Esse pedido foi de um cliente real." }]);
    const bloco = blocoDosContextosDePonto(r);
    expect(bloco).toContain("Esse pedido foi de um cliente real.");
    // A instrução é condicional nas DUAS direções, e é isso que permite manter.
    expect(bloco).toContain("Se não resolve, diga o que continua em aberto");
  });
});

describe("sem contexto de ponto, nada muda", () => {
  /** Sem explicação nenhuma, a compra continua sendo evidência normalmente. */
  it("bloco vazio quando ninguém explicou nada", () => {
    expect(blocoDosContextosDePonto(aplicarContextoAosAchados([CUPOM], []))).toBe("");
  });

  /**
   * Contexto guardado para alerta que já saiu da lista descreve situação que não
   * existe mais — mandá-lo faria a IA explicar um problema que ninguém vê.
   */
  it("contexto de alerta ausente não entra no bloco", () => {
    const r = aplicarContextoAosAchados([], [{ chave: "purchase_sem_valor", texto: CTX_TESTE }]);
    expect(blocoDosContextosDePonto(r)).toBe("");
  });
});
