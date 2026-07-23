import { describe, it, expect } from "vitest";
import { validarUrlDaLoja, LojaUrlInvalidaError, agregarPedidos, resumirCicloWoo, type PedidoWoo, type ResultadoLojaCiclo } from "./woocommerce";
import { mascararChave } from "../db";

/**
 * F5-B: a conexão WooCommerce carrega credencial em Basic auth. Estes testes
 * travam as regras que protegem a credencial — HTTPS obrigatório, URL limpa,
 * anti-SSRF — e a máscara que impede a key de voltar inteira ao frontend.
 */
describe("URL da loja", () => {
  it("aceita https com caminho limpo e remove barra final", async () => {
    expect(await validarUrlDaLoja("https://scaffoldplay.com.br/")).toBe("https://scaffoldplay.com.br");
    expect(await validarUrlDaLoja("https://baesh.com.br")).toBe("https://baesh.com.br");
  });

  it("recusa http — credencial em Basic auth não trafega em claro", async () => {
    await expect(validarUrlDaLoja("http://loja.com.br")).rejects.toThrow(LojaUrlInvalidaError);
    await expect(validarUrlDaLoja("http://loja.com.br")).rejects.toThrow(/https/);
  });

  it("recusa query e âncora — o join com /wp-json precisa ser previsível", async () => {
    await expect(validarUrlDaLoja("https://loja.com.br/?utm=x")).rejects.toThrow(/parâmetros/);
    await expect(validarUrlDaLoja("https://loja.com.br/#topo")).rejects.toThrow(LojaUrlInvalidaError);
  });

  it("anti-SSRF: localhost, IP privado e metadata são bloqueados pelo urlGuard", async () => {
    for (const alvo of ["https://localhost/wp", "https://127.0.0.1", "https://192.168.1.10", "https://169.254.169.254"]) {
      await expect(validarUrlDaLoja(alvo)).rejects.toThrow();
    }
  });

  it("esquema não-http(s) é recusado", async () => {
    await expect(validarUrlDaLoja("ftp://loja.com.br")).rejects.toThrow();
  });
});

describe("máscara da consumer_key", () => {
  it("mostra só o começo e os últimos 4 — reconhecível, inutilizável", () => {
    expect(mascararChave("ck_1234567890abcdefagh")).toBe("ck_…fagh");
  });

  it("chave curta vira máscara total, sem vazar nada", () => {
    expect(mascararChave("ck_12")).toBe("····");
    expect(mascararChave("")).toBe("····");
  });

  it("a máscara nunca contém o miolo da chave", () => {
    const chave = "ck_SEGREDO_QUE_NAO_PODE_APARECER_9999";
    const m = mascararChave(chave);
    expect(m).not.toContain("SEGREDO");
    expect(m.length).toBeLessThan(12);
  });
});

/**
 * F5-B mínima: a agregação é onde mora a regra de negócio da importação.
 * completed+processing = receita; pending/on-hold/failed aparecem por status
 * mas ficam FORA da receita; cancelled/refunded são contados à parte e seus
 * produtos não contam como vendidos.
 */
describe("agregação de pedidos Woo", () => {
  const pedido = (o: Partial<PedidoWoo> = {}): PedidoWoo => ({
    id: 1, status: "completed", total: "100.00", date_created: "2026-07-20T10:00:00", ...o,
  });

  it("receita = completed + processing; ticket é receita/pagos", () => {
    const b = agregarPedidos([
      pedido({ id: 1, status: "completed", total: "100.00" }),
      pedido({ id: 2, status: "processing", total: "50.00" }),
      pedido({ id: 3, status: "pending", total: "999.00" }),
    ], "30d", "2026-06-23", "2026-07-22");
    expect(b.receita).toBe(150);
    expect(b.pedidos).toBe(2);
    expect(b.ticketMedio).toBe(75);
  });

  it("pending/on-hold/failed aparecem por status mas NÃO somam receita", () => {
    const b = agregarPedidos([
      pedido({ id: 1, status: "pending", total: "10" }),
      pedido({ id: 2, status: "on-hold", total: "20" }),
      pedido({ id: 3, status: "failed", total: "30" }),
    ], "30d", "2026-06-23", "2026-07-22");
    expect(b.receita).toBe(0);          // houve pedidos, nenhum pago — 0 é fato
    expect(b.pedidos).toBe(0);
    expect(b.ticketMedio).toBeNull();   // ticket sem pedido pago não existe
    expect(b.pedidosPorStatus.map((s) => s.status).sort()).toEqual(["failed", "on-hold", "pending"]);
  });

  it("cancelados e reembolsados são contados à parte, fora da receita", () => {
    const b = agregarPedidos([
      pedido({ id: 1, status: "cancelled", total: "80" }),
      pedido({ id: 2, status: "refunded", total: "90" }),
      pedido({ id: 3, status: "completed", total: "40" }),
    ], "30d", "2026-06-23", "2026-07-22");
    expect(b.receita).toBe(40);
    expect(b.cancelamentos).toBe(1);
    expect(b.reembolsos).toBe(1);
  });

  it("sem pedido nenhum na janela: sem_dados e null — nunca R$ 0 sem base", () => {
    const b = agregarPedidos([], "7d", "2026-07-16", "2026-07-22");
    expect(b.status).toBe("sem_dados");
    expect(b.receita).toBeNull();
    expect(b.pedidos).toBeNull();
    expect(b.ticketMedio).toBeNull();
  });

  it("o 7d é derivado do MESMO lote 30d — filtro por date_created", () => {
    const lote = [
      pedido({ id: 1, date_created: "2026-07-21T09:00:00", total: "100" }), // dentro do 7d
      pedido({ id: 2, date_created: "2026-07-01T09:00:00", total: "50" }),  // só no 30d
    ];
    const b7 = agregarPedidos(lote, "7d", "2026-07-16", "2026-07-22");
    const b30 = agregarPedidos(lote, "30d", "2026-06-23", "2026-07-22");
    expect(b7.receita).toBe(100);
    expect(b30.receita).toBe(150);
    expect(b7.periodo).toBe("7d");
  });

  it("produtos: só de pedidos com receita, top por receita, máximo 10", () => {
    const pagos = Array.from({ length: 12 }, (_, i) =>
      pedido({ id: i, line_items: [{ name: `P${i}`, quantity: 1, total: String(i * 10) }] }));
    const b = agregarPedidos([
      ...pagos,
      pedido({ id: 99, status: "cancelled", line_items: [{ name: "FANTASMA", quantity: 5, total: "9999" }] }),
    ], "30d", "2026-06-23", "2026-07-22");
    expect(b.produtos).toHaveLength(10);
    expect(b.produtos[0].nome).toBe("P11");
    expect(b.produtos.map((p) => p.nome)).not.toContain("FANTASMA");
  });

  it("mesmo produto em vários pedidos soma quantidade e receita", () => {
    const b = agregarPedidos([
      pedido({ id: 1, line_items: [{ name: "Camisa", quantity: 2, total: "80" }] }),
      pedido({ id: 2, line_items: [{ name: "Camisa", quantity: 1, total: "40" }] }),
    ], "30d", "2026-06-23", "2026-07-22");
    expect(b.produtos).toEqual([{ nome: "Camisa", quantidade: 3, receita: 120 }]);
  });

  it("cupons: usos e desconto somados, só de pedidos pagos", () => {
    const b = agregarPedidos([
      pedido({ id: 1, coupon_lines: [{ code: "BEMVINDO", discount: "10.00" }] }),
      pedido({ id: 2, coupon_lines: [{ code: "BEMVINDO", discount: "10.00" }] }),
      pedido({ id: 3, status: "cancelled", coupon_lines: [{ code: "NAOCONTA", discount: "99" }] }),
    ], "30d", "2026-06-23", "2026-07-22");
    expect(b.cupons).toEqual([{ codigo: "BEMVINDO", usos: 2, desconto: 20 }]);
  });

  it("total ilegível vira 0, não NaN — NaN contaminaria a soma inteira", () => {
    const b = agregarPedidos([
      pedido({ id: 1, total: "abc" }),
      pedido({ id: 2, total: "50" }),
    ], "30d", "2026-06-23", "2026-07-22");
    expect(b.receita).toBe(50);
  });

  it("a limitação de reembolso parcial está sempre declarada", () => {
    const b = agregarPedidos([pedido()], "30d", "2026-06-23", "2026-07-22");
    expect(b.limitacoes.join(" ")).toMatch(/parcia/i);
  });

  it("pedido fora da janela não entra — bordas inclusivas", () => {
    const b = agregarPedidos([
      pedido({ id: 1, date_created: "2026-07-16T00:00:00", total: "10" }), // borda de baixo
      pedido({ id: 2, date_created: "2026-07-22T23:59:59", total: "20" }), // borda de cima
      pedido({ id: 3, date_created: "2026-07-15T23:59:59", total: "999" }), // fora
    ], "7d", "2026-07-16", "2026-07-22");
    expect(b.receita).toBe(30);
  });
});

/**
 * O redutor do ciclo do cron: uma loja OK grava 2 snapshots (7d + 30d); falha
 * não conta snapshot, entra em `erros` e NÃO derruba as outras. É a garantia de
 * isolamento vista no resumo que vai para app_settings.
 */
describe("resumo do ciclo Woo", () => {
  const r = (accountId: number, ok: boolean, erro?: string): ResultadoLojaCiclo =>
    ({ conexaoId: accountId, accountId, ok, erro });

  it("BAESH e Scaffold OK: 2 lojas, 4 snapshots, zero falha", () => {
    const resumo = resumirCicloWoo([r(4, true), r(13, true)]);
    expect(resumo).toMatchObject({ total: 2, ok: 2, falhas: 0, snapshotsAtualizados: 4 });
    expect(resumo.erros).toEqual([]);
  });

  it("falha isolada: uma loja quebra, a outra segue e o erro é registrado", () => {
    const resumo = resumirCicloWoo([r(4, true), r(13, false, "loja recusou a credencial")]);
    expect(resumo).toMatchObject({ total: 2, ok: 1, falhas: 1, snapshotsAtualizados: 2 });
    expect(resumo.erros).toEqual([{ accountId: 13, erro: "loja recusou a credencial" }]);
  });

  it("erro sem mensagem não vira string vazia", () => {
    expect(resumirCicloWoo([r(9, false)]).erros[0].erro).toBe("erro desconhecido");
  });

  it("nenhuma loja ativa: ciclo vazio, tudo zero", () => {
    expect(resumirCicloWoo([])).toEqual({ total: 0, ok: 0, falhas: 0, snapshotsAtualizados: 0, erros: [] });
  });
});
