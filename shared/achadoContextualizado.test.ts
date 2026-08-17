/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Se a equipe explica "isso não é problema", os NÚMEROS têm que concordar
 * ─────────────────────────────────────────────────────────────────────────────
 *  A inconsistência que este arquivo fecha: o contexto já mudava a PROSA da IA e
 *  não mudava a CONTAGEM. O alerta explicado continuava inflando "Achados
 *  abertos", mantinha o cliente em "Precisam atenção" e aparecia em "Atenção
 *  primeiro" — enquanto o texto ao lado dizia que estava resolvido.
 *
 *  Uma IA que escreve melhor sobre os mesmos alertas não resolve nada. O
 *  contexto tem que mudar a priorização, e priorização é número.
 *
 *  Os casos aqui são os reais: o pedido de R$ 0 do Scaffold Play e os 28,7% de
 *  carrinho→checkout da UMA. E o dado nunca muda — 28,7% continua 28,7%, o
 *  achado continua na lista com o texto original. Muda a CLASSIFICAÇÃO.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, expect, it } from "vitest";
import {
  avaliarCliente, resumoPortfolio, type ClientePanorama, type EcomGA4,
} from "./panoramaLogic";

const ecom = (over: Partial<EcomGA4>): EcomGA4 => ({
  status: "detectado", receita: null, transacoes: null, ticketMedio: null,
  addToCart: null, beginCheckout: null, purchases: null,
  taxaCarrinhoCheckout: null, taxaCheckoutPurchase: null, ...over,
});

const cliente = (accountId: number, nome: string, e: EcomGA4): ClientePanorama => ({
  accountId, nome, fontes: [], loja: null,
  uptime: null, seguranca: null, pagespeed: null,
  ga4_7d: { dia: "2026-08-14", metricsJson: { sessions: 900, ecommerce: e } },
  ga4_30d: null, loja_7d: null, loja_30d: null,
});

/** Scaffold Play: 1 compra registrada com receita zerada. */
const SCAFFOLD = cliente(1, "Scaffold Play", ecom({ purchases: 1, receita: 0, transacoes: 1 }));
/** UMA: 28,7% do carrinho chegam ao checkout, com base real. */
const UMA = cliente(2, "UMA", ecom({ addToCart: 400, beginCheckout: 115, taxaCarrinhoCheckout: 28.7 }));

const chaves = (c: ClientePanorama, ctx: Array<{ chave: string; texto: string }> = []) =>
  avaliarCliente(c, ctx).achados.map((a) => `${a.chave}:${a.status}`);

describe("1. compra teste — Scaffold Play", () => {
  it("SEM contexto, aparece como possível problema", () => {
    const av = avaliarCliente(SCAFFOLD);
    const achado = av.achados.find((a) => a.chave === "purchase_sem_valor");
    expect(achado, "o achado da compra sem valor deixou de ser gerado").toBeTruthy();
    expect(achado!.status).toBe("aberto");
    expect(av.nivel).toBe("atencao");
  });

  it("COM contexto, deixa de ser achado aberto", () => {
    const av = avaliarCliente(SCAFFOLD, [{
      chave: "purchase_sem_valor",
      texto: "Esse pedido foi uma compra teste feita pela equipe e deve ser desconsiderado.",
    }]);
    const achado = av.achados.find((a) => a.chave === "purchase_sem_valor")!;
    // O DADO não muda: o achado continua na lista, com o texto original.
    expect(achado.status).toBe("contextualizado");
    expect(achado.texto).toContain("receita zerada");
    // O que muda é o nível do cliente — ele sai de "precisam atenção".
    expect(av.nivel).not.toBe("atencao");
  });
});

describe("2. os 28,7% da UMA", () => {
  it("SEM contexto, gera atenção", () => {
    const av = avaliarCliente(UMA);
    expect(av.achados.find((a) => a.chave === "vazamento_carrinho")?.status).toBe("aberto");
    expect(av.nivel).toBe("atencao");
  });

  /**
   * O contexto explica que o comportamento é esperado pelo alto ticket. O número
   * continua sendo 28,7% — ele só para de ser tratado como anomalia.
   */
  it("COM contexto do alto ticket, deixa de ser problema prioritário", () => {
    const av = avaliarCliente(UMA, [{
      chave: "vazamento_carrinho",
      texto: "Ticket muito alto; a conversão final é boa e esse comportamento é esperado.",
    }]);
    const achado = av.achados.find((a) => a.chave === "vazamento_carrinho")!;
    expect(achado.status).toBe("contextualizado");
    expect(achado.texto).toContain("28,7%");
    expect(av.nivel).not.toBe("atencao");
  });
});

describe("3. remover o contexto devolve o achado", () => {
  /** Nada foi apagado, então a avaliação volta a considerar o dado. */
  it("sem a explicação, o achado volta a ser aberto", () => {
    const com = chaves(UMA, [{ chave: "vazamento_carrinho", texto: "esperado" }]);
    const sem = chaves(UMA, []);
    expect(com).toContain("vazamento_carrinho:contextualizado");
    expect(sem).toContain("vazamento_carrinho:aberto");
  });

  it("explicação em branco equivale a não ter explicação", () => {
    expect(chaves(UMA, [{ chave: "vazamento_carrinho", texto: "   " }]))
      .toContain("vazamento_carrinho:aberto");
  });
});

describe("4. contextualizar um cliente não afeta outro", () => {
  /**
   * Os contextos entram POR CLIENTE em `avaliarCliente`. O risco seria uma lista
   * global de chaves: `purchase_sem_valor` explicado no Scaffold silenciaria o
   * mesmo alerta em toda conta que tivesse um pedido sem valor.
   */
  it("a explicação do Scaffold não silencia o mesmo alerta em outro cliente", () => {
    const outro = cliente(3, "Elwing", ecom({ purchases: 1, receita: 0, transacoes: 1 }));
    const ctx = [{ chave: "purchase_sem_valor", texto: "compra teste da equipe" }];

    expect(chaves(SCAFFOLD, ctx)).toContain("purchase_sem_valor:contextualizado");
    // O mesmo contexto NÃO é passado para o outro cliente — e é isso que a
    // assinatura por cliente garante.
    expect(chaves(outro, [])).toContain("purchase_sem_valor:aberto");
    expect(avaliarCliente(outro, []).nivel).toBe("atencao");
  });
});

describe("5. o portfólio não infla com achados contextualizados", () => {
  const clientes = [SCAFFOLD, UMA];

  it("SEM contexto: dois clientes em atenção e dois achados abertos", () => {
    const av = clientes.map((c) => avaliarCliente(c));
    const r = resumoPortfolio(av.map((a) => ({ nivel: a.nivel, achados: a.achados })), clientes);
    expect(r.precisamAtencao).toBe(2);
    expect(r.achadosCriticos + r.achadosAtencao).toBe(2);
  });

  /**
   * O teste que fecha a inconsistência do pedido: depois de explicar os dois,
   * "Precisam atenção" e "Achados abertos" precisam ZERAR.
   */
  it("COM os dois contextualizados: nada em atenção, nenhum achado aberto", () => {
    const av = [
      avaliarCliente(SCAFFOLD, [{ chave: "purchase_sem_valor", texto: "compra teste" }]),
      avaliarCliente(UMA, [{ chave: "vazamento_carrinho", texto: "ticket alto, esperado" }]),
    ];
    const r = resumoPortfolio(av.map((a) => ({ nivel: a.nivel, achados: a.achados })), clientes);
    expect(r.precisamAtencao).toBe(0);
    expect(r.achadosCriticos + r.achadosAtencao).toBe(0);
    // E o fato observado NÃO desapareceu: os achados seguem nas avaliações.
    expect(av.flatMap((a) => a.achados)).toHaveLength(2);
  });

  it("explicar um só baixa a contagem em um", () => {
    const av = [
      avaliarCliente(SCAFFOLD, [{ chave: "purchase_sem_valor", texto: "compra teste" }]),
      avaliarCliente(UMA),
    ];
    const r = resumoPortfolio(av.map((a) => ({ nivel: a.nivel, achados: a.achados })), clientes);
    expect(r.precisamAtencao).toBe(1);
    expect(r.achadosCriticos + r.achadosAtencao).toBe(1);
  });
});
