/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Agregação NEUTRA de pedidos de loja — núcleo compartilhado
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  É aqui que mora a regra de negócio da importação: o que conta como receita,
 *  o que conta como vendido. Puro e testado, SEM saber de plataforma nenhuma.
 *
 *  Cada plataforma (WooCommerce, VNDA/Olist, …) tem seu próprio mapa de status —
 *  "completed" no Woo, "confirmed"/`paid_at` na VNDA. Por isso o pedido chega
 *  aqui JÁ NORMALIZADO, com a semântica resolvida em flags:
 *
 *    contaReceita  → este pedido entra na receita (pago/aprovado, não cancelado)
 *    cancelado     → conta em `cancelamentos`, produtos NÃO contam como vendidos
 *    reembolsado   → conta em `reembolsos`, idem
 *
 *  O `status` cru continua vindo, só para `pedidosPorStatus` (o retrato honesto
 *  de "o que a loja tem"). Assim uma plataforma nova entra só escrevendo o
 *  mapeador dela — a matemática de receita/ticket/produtos/cupons é uma só.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Pedido já normalizado por uma plataforma. `total` em número (não string). */
export type PedidoNeutro = {
  status: string;           // status CRU da plataforma — só para exibição
  total: number;
  dia: string;              // YYYY-MM-DD (data local da loja)
  contaReceita: boolean;    // decidido pelo mapeador da plataforma
  cancelado: boolean;
  reembolsado: boolean;
  itens: { nome: string; quantidade: number; total: number }[];
  cupons: { codigo: string; desconto: number }[];
};

export type BlocoLoja = {
  fonte: string;            // "woocommerce" | "vnda" | …
  status: "ok" | "sem_dados" | "erro";
  periodo: "7d" | "30d";
  receita: number | null;
  pedidos: number | null;
  ticketMedio: number | null;
  pedidosPorStatus: { status: string; quantidade: number }[];
  produtos: { nome: string; quantidade: number; receita: number }[];
  cupons: { codigo: string; usos: number; desconto: number }[];
  reembolsos: number | null;
  cancelamentos: number | null;
  limitacoes: string[];
};

export const numSeguro = (v: unknown): number => {
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : 0;
};

/**
 * Agrega os pedidos JÁ NORMALIZADOS de UMA janela. Produto de pedido
 * cancelado/reembolsado não conta como vendido; status não-pagos aparecem em
 * pedidosPorStatus mas ficam fora da receita.
 */
export function agregarPedidosNeutro(
  pedidos: PedidoNeutro[],
  fonte: string,
  janela: "7d" | "30d",
  inicio: string,   // YYYY-MM-DD inclusivo
  fim: string,
  limitacoesBase: string[] = [],
): BlocoLoja {
  const noPeriodo = pedidos.filter((p) => p.dia >= inicio && p.dia <= fim);

  const porStatus = new Map<string, number>();
  for (const p of noPeriodo) porStatus.set(p.status, (porStatus.get(p.status) ?? 0) + 1);

  const pagos = noPeriodo.filter((p) => p.contaReceita);
  const receita = pagos.reduce((a, p) => a + numSeguro(p.total), 0);

  const produtosMap = new Map<string, { quantidade: number; receita: number }>();
  const cuponsMap = new Map<string, { usos: number; desconto: number }>();
  for (const p of pagos) {
    for (const li of p.itens ?? []) {
      const atual = produtosMap.get(li.nome) ?? { quantidade: 0, receita: 0 };
      atual.quantidade += numSeguro(li.quantidade);
      atual.receita += numSeguro(li.total);
      produtosMap.set(li.nome, atual);
    }
    for (const c of p.cupons ?? []) {
      const atual = cuponsMap.get(c.codigo) ?? { usos: 0, desconto: 0 };
      atual.usos += 1;
      atual.desconto += numSeguro(c.desconto);
      cuponsMap.set(c.codigo, atual);
    }
  }

  return {
    fonte,
    status: noPeriodo.length > 0 ? "ok" : "sem_dados",
    periodo: janela,
    receita: pagos.length > 0 ? receita : noPeriodo.length > 0 ? 0 : null,
    pedidos: pagos.length > 0 || noPeriodo.length > 0 ? pagos.length : null,
    ticketMedio: pagos.length > 0 ? receita / pagos.length : null,
    pedidosPorStatus: Array.from(porStatus.entries())
      .map(([status, quantidade]) => ({ status, quantidade }))
      .sort((a, b) => b.quantidade - a.quantidade),
    produtos: Array.from(produtosMap.entries())
      .map(([nome, v]) => ({ nome, ...v }))
      .sort((a, b) => b.receita - a.receita)
      .slice(0, 10),
    cupons: Array.from(cuponsMap.entries())
      .map(([codigo, v]) => ({ codigo, ...v }))
      .sort((a, b) => b.usos - a.usos)
      .slice(0, 10),
    reembolsos: noPeriodo.filter((p) => p.reembolsado).length,
    cancelamentos: noPeriodo.filter((p) => p.cancelado).length,
    limitacoes: limitacoesBase,
  };
}
