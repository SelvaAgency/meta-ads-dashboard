/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Bloco de e-commerce do snapshot GA4 — montagem pura (F5-A)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  GA4 é FONTE INICIAL de e-commerce, não fonte contábil: perde compra por
 *  adblock, consentimento e atribuição. Quando a plataforma da loja (Woo)
 *  estiver conectada, ela vira a fonte primária de pedidos/receita — e a
 *  divergência entre as duas será mostrada como divergência de medição, não
 *  como erro. O campo `fonte: "ga4"` existe para a UI nunca esquecer o rótulo.
 *
 *  As taxas vivem aqui, puras e testadas, porque é onde mora o erro clássico:
 *  denominador zero. Taxa sem base é null — a UI mostra "—", nunca "0%",
 *  porque 0% de conversão com zero sessões é mentira com cara de dado.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type StatusEcommerce = "detectado" | "sem_dados" | "indisponivel";

export type BlocoEcommerce = {
  fonte: "ga4";
  status: StatusEcommerce;
  receita: number | null;
  transacoes: number | null;
  ticketMedio: number | null;
  addToCart: number | null;
  beginCheckout: number | null;
  purchases: number | null;
  taxaSessaoPurchase: number | null;
  taxaCarrinhoCheckout: number | null;
  taxaCheckoutPurchase: number | null;
};

const n = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** a/b em %, null sem base — nunca 0% de denominador zero. */
export function taxa(numerador: unknown, denominador: unknown): number | null {
  const a = n(numerador), b = n(denominador);
  if (a === null || b === null || b <= 0) return null;
  return (a / b) * 100;
}

export function montarBlocoEcommerce(entrada: {
  /** null quando a Data API recusou as métricas de receita (cascata esgotada). */
  totais: { receita: number; transacoes: number } | null;
  /** null quando a chamada do funil falhou. */
  funil: { addToCart: number; beginCheckout: number; purchases: number } | null;
  sessions: number | null | undefined;
}): BlocoEcommerce {
  const { totais, funil } = entrada;
  const sessions = n(entrada.sessions);

  // Sem funil não há como saber se existe compra — indisponível, não "zero".
  if (!funil) {
    return {
      fonte: "ga4", status: "indisponivel",
      receita: totais?.receita ?? null, transacoes: totais?.transacoes ?? null,
      ticketMedio: null, addToCart: null, beginCheckout: null, purchases: null,
      taxaSessaoPurchase: null, taxaCarrinhoCheckout: null, taxaCheckoutPurchase: null,
    };
  }

  const purchases = n(funil.purchases) ?? 0;
  const addToCart = n(funil.addToCart) ?? 0;
  const beginCheckout = n(funil.beginCheckout) ?? 0;
  const receita = totais ? n(totais.receita) : null;
  const transacoes = totais ? n(totais.transacoes) : null;

  return {
    fonte: "ga4",
    status: purchases > 0 ? "detectado" : "sem_dados",
    receita,
    transacoes,
    // Ticket = receita / transações. Exige os dois com base real.
    ticketMedio: receita !== null && transacoes !== null && transacoes > 0 ? receita / transacoes : null,
    addToCart, beginCheckout, purchases,
    taxaSessaoPurchase: taxa(purchases, sessions),
    taxaCarrinhoCheckout: taxa(beginCheckout, addToCart),
    taxaCheckoutPurchase: taxa(purchases, beginCheckout),
  };
}
