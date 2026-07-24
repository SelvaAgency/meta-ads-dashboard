import { describe, it, expect } from "vitest";
import { validarUrlVnda, VndaUrlInvalidaError, resolverShopHost, normalizarPedidoVnda, agregarPedidosVnda, type PedidoVnda } from "./vnda";

/**
 * VNDA carrega token em Bearer. Estes testes travam as regras que protegem a
 * credencial (HTTPS, URL limpa, anti-SSRF) e — o mais delicado — o MAPA DE
 * STATUS PROVISÓRIO: receita só com `paid_at`, `confirmed` sem pago NÃO entra,
 * `received` fora, `canceled` fora. A validação com dados reais da UMA pode
 * mudar essa regra; até lá, o teste garante que ela não vaze receita à toa.
 */
describe("URL / shop-host da VNDA", () => {
  it("aceita https limpo e remove barra final", async () => {
    expect(await validarUrlVnda("https://uma.vnda.com.br/")).toBe("https://uma.vnda.com.br");
  });

  it("recusa http — token em Bearer não trafega em claro", async () => {
    await expect(validarUrlVnda("http://uma.vnda.com.br")).rejects.toThrow(VndaUrlInvalidaError);
  });

  it("recusa query/âncora", async () => {
    await expect(validarUrlVnda("https://uma.vnda.com.br/?x=1")).rejects.toThrow(/parâmetros/);
  });

  it("anti-SSRF: localhost e IP privado bloqueados", async () => {
    for (const alvo of ["https://localhost", "https://192.168.0.1", "https://169.254.169.254"]) {
      await expect(validarUrlVnda(alvo)).rejects.toThrow();
    }
  });

  it("X-Shop-Host deriva do host quando não informado; usa o informado quando há", () => {
    expect(resolverShopHost("https://uma.vnda.com.br")).toBe("uma.vnda.com.br");
    expect(resolverShopHost("https://uma.vnda.com.br", "loja.uma.com.br")).toBe("loja.uma.com.br");
    expect(resolverShopHost("https://uma.vnda.com.br", "https://loja.uma.com.br/")).toBe("loja.uma.com.br");
  });
});

describe("normalização de pedido VNDA (mapa provisório)", () => {
  const p = (o: Partial<PedidoVnda> = {}): PedidoVnda =>
    ({ status: "confirmed", total: 100, created_at: "2026-07-20T10:00:00", ...o });

  it("pago (paid_at) e não cancelado entra na receita", () => {
    const n = normalizarPedidoVnda(p({ status: "confirmed", paid_at: "2026-07-20T11:00:00", total: 150 }));
    expect(n.contaReceita).toBe(true);
    expect(n.total).toBe(150);
    expect(n.dia).toBe("2026-07-20");
  });

  it("confirmed SEM paid_at NÃO entra — regra provisória não confia no nome", () => {
    expect(normalizarPedidoVnda(p({ status: "confirmed", paid_at: null })).contaReceita).toBe(false);
  });

  it("received fica fora da receita", () => {
    expect(normalizarPedidoVnda(p({ status: "received", paid_at: null })).contaReceita).toBe(false);
  });

  it("canceled não entra, mesmo com paid_at, e conta como cancelado", () => {
    const n = normalizarPedidoVnda(p({ status: "canceled", paid_at: "2026-07-20T11:00:00" }));
    expect(n.contaReceita).toBe(false);
    expect(n.cancelado).toBe(true);
  });

  it("itens e cupom são normalizados para o formato neutro", () => {
    const n = normalizarPedidoVnda(p({
      paid_at: "2026-07-20T11:00:00",
      coupon_code: "BEMVINDO", discount_price: 20,
      items: [{ product_name: "Camisa", quantity: 2, total: 120 }],
    }));
    expect(n.itens).toEqual([{ nome: "Camisa", quantidade: 2, total: 120 }]);
    expect(n.cupons).toEqual([{ codigo: "BEMVINDO", desconto: 20 }]);
  });
});

describe("agregação VNDA (via núcleo neutro)", () => {
  const pago = (o: Partial<PedidoVnda>): PedidoVnda =>
    ({ status: "confirmed", paid_at: "2026-07-20T11:00:00", created_at: "2026-07-20T10:00:00", ...o });

  it("receita = só pedidos pagos; recebidos aparecem por status mas fora", () => {
    const b = agregarPedidosVnda([
      pago({ total: 100 }),
      pago({ total: 50 }),
      { status: "received", paid_at: null, total: 999, created_at: "2026-07-20T10:00:00" },
    ], "30d", "2026-06-23", "2026-07-22");
    expect(b.fonte).toBe("vnda");
    expect(b.receita).toBe(150);
    expect(b.pedidos).toBe(2);
    expect(b.ticketMedio).toBe(75);
    expect(b.pedidosPorStatus.find((s) => s.status === "received")?.quantidade).toBe(1);
  });

  it("cancelado conta à parte e não soma receita", () => {
    const b = agregarPedidosVnda([
      pago({ total: 40 }),
      { status: "canceled", paid_at: "2026-07-20T11:00:00", total: 80, created_at: "2026-07-20T10:00:00" },
    ], "30d", "2026-06-23", "2026-07-22");
    expect(b.receita).toBe(40);
    expect(b.cancelamentos).toBe(1);
  });

  it("sem pedido pago mas com pedidos: receita 0, ticket null — nunca R$0 sem base vira null", () => {
    const b = agregarPedidosVnda([{ status: "received", paid_at: null, total: 10, created_at: "2026-07-20T10:00:00" }], "7d", "2026-07-16", "2026-07-22");
    expect(b.receita).toBe(0);
    expect(b.pedidos).toBe(0);
    expect(b.ticketMedio).toBeNull();
  });

  it("janela vazia: sem_dados e null", () => {
    const b = agregarPedidosVnda([], "7d", "2026-07-16", "2026-07-22");
    expect(b.status).toBe("sem_dados");
    expect(b.receita).toBeNull();
  });

  it("carrega as limitações provisórias do mapa de status", () => {
    const b = agregarPedidosVnda([pago({ total: 10 })], "30d", "2026-06-23", "2026-07-22");
    expect(b.limitacoes.join(" ")).toMatch(/provisório/i);
  });
});
