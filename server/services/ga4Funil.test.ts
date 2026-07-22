import { describe, it, expect } from "vitest";
import { montarBlocoEcommerce, taxa } from "./ga4Funil";

describe("taxa", () => {
  it("calcula em porcentagem", () => {
    expect(taxa(5, 100)).toBe(5);
    expect(taxa(60, 63)).toBeCloseTo(95.238, 2);
  });

  it("denominador zero ou ausente é null — nunca 0%", () => {
    expect(taxa(5, 0)).toBeNull();
    expect(taxa(5, null)).toBeNull();
    expect(taxa(5, undefined)).toBeNull();
  });

  it("numerador ausente é null, não NaN", () => {
    expect(taxa(undefined, 100)).toBeNull();
    expect(taxa(NaN, 100)).toBeNull();
  });
});

describe("bloco de e-commerce", () => {
  /** UMA: compra, receita e sessões — o caso completo. */
  it("compra detectada monta o bloco inteiro", () => {
    const b = montarBlocoEcommerce({
      totais: { receita: 5000, transacoes: 20 },
      funil: { addToCart: 200, beginCheckout: 100, purchases: 20 },
      sessions: 8572,
    });
    expect(b.status).toBe("detectado");
    expect(b.fonte).toBe("ga4");
    expect(b.ticketMedio).toBe(250);
    expect(b.taxaSessaoPurchase).toBeCloseTo((20 / 8572) * 100, 5);
    expect(b.taxaCarrinhoCheckout).toBe(50);
    expect(b.taxaCheckoutPurchase).toBe(20);
  });

  /**
   * BAESH na janela de 30d: 63 carrinhos → 60 checkouts → poucas compras.
   * O funil que vaza precisa aparecer com taxas reais, não sumir.
   */
  it("o caso BAESH: funil com vazamento fica visível", () => {
    const b = montarBlocoEcommerce({
      totais: { receita: 300, transacoes: 2 },
      funil: { addToCart: 63, beginCheckout: 60, purchases: 2 },
      sessions: 350,
    });
    expect(b.status).toBe("detectado");
    expect(b.taxaCarrinhoCheckout).toBeCloseTo(95.238, 2);   // quase todos avançam…
    expect(b.taxaCheckoutPurchase).toBeCloseTo(3.333, 2);    // …e quase ninguém fecha
  });

  it("sem compra na janela é sem_dados, não erro", () => {
    const b = montarBlocoEcommerce({
      totais: { receita: 0, transacoes: 0 },
      funil: { addToCart: 5, beginCheckout: 0, purchases: 0 },
      sessions: 100,
    });
    expect(b.status).toBe("sem_dados");
    // 0 compras em 100 sessões é 0% de verdade — base existe, o número é fato.
    expect(b.taxaSessaoPurchase).toBe(0);
    expect(b.taxaCheckoutPurchase).toBeNull();     // 0/0: sem base, sem taxa
    expect(b.ticketMedio).toBeNull();              // sem transação, sem ticket
  });

  it("funil indisponível NÃO vira zero — vira indisponivel", () => {
    const b = montarBlocoEcommerce({ totais: { receita: 100, transacoes: 1 }, funil: null, sessions: 50 });
    expect(b.status).toBe("indisponivel");
    expect(b.purchases).toBeNull();
    expect(b.receita).toBe(100);   // o que veio, fica; o que não veio, null
  });

  it("receita recusada pela API não impede o funil de aparecer", () => {
    const b = montarBlocoEcommerce({
      totais: null,
      funil: { addToCart: 10, beginCheckout: 5, purchases: 2 },
      sessions: 100,
    });
    expect(b.status).toBe("detectado");
    expect(b.receita).toBeNull();
    expect(b.ticketMedio).toBeNull();
    expect(b.taxaCheckoutPurchase).toBe(40);
  });

  it("ticket exige transação — receita sozinha não inventa ticket", () => {
    const b = montarBlocoEcommerce({
      totais: { receita: 500, transacoes: 0 },
      funil: { addToCart: 0, beginCheckout: 0, purchases: 0 },
      sessions: 10,
    });
    expect(b.ticketMedio).toBeNull();
  });

  it("sem sessões, taxa sessão→compra é null mesmo com compra", () => {
    const b = montarBlocoEcommerce({
      totais: { receita: 100, transacoes: 1 },
      funil: { addToCart: 3, beginCheckout: 2, purchases: 1 },
      sessions: null,
    });
    expect(b.status).toBe("detectado");
    expect(b.taxaSessaoPurchase).toBeNull();
  });
});
