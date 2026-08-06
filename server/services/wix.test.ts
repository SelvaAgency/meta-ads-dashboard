/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Wix — o que dá para provar sem a chave
 * ─────────────────────────────────────────────────────────────────────────────
 *  A chamada autenticada só existe com a API Key, que ainda não temos. O que
 *  este arquivo cobre é a validação de entrada: o Site ID é a fonte mais
 *  provável de erro na primeira tentativa, e um Site ID errado devolve 403 —
 *  indistinguível de "a chave não tem permissão".
 *
 *  Diagnosticar isso ANTES da chamada é o que evita a pessoa passar meia hora
 *  ajustando permissão de uma chave que está certa.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, expect, it } from "vitest";
import { PENDENCIAS_WIX, resumoDeFormato, testarConexaoWix, validarSiteId, validarUrlWix, WixCredencialInvalidaError } from "./wix";

describe("Site ID", () => {
  it("aceita o GUID do site da Aiká", () => {
    expect(validarSiteId("fa19d2c0-7e17-4bc7-a3a8-eeeaf7c509b1"))
      .toBe("fa19d2c0-7e17-4bc7-a3a8-eeeaf7c509b1");
  });

  it("normaliza caixa e espaços", () => {
    expect(validarSiteId("  FA19D2C0-7E17-4BC7-A3A8-EEEAF7C509B1 "))
      .toBe("fa19d2c0-7e17-4bc7-a3a8-eeeaf7c509b1");
  });

  /** Cada um destes devolveria 403 na Wix — erro que parece falta de permissão. */
  it.each([
    ["o nome do site", "aikabodysoul"],
    ["a URL", "https://www.aikabodysoul.com"],
    ["GUID truncado", "fa19d2c0-7e17-4bc7-a3a8"],
    ["vazio", ""],
    ["texto qualquer", "minha loja"],
  ])("recusa %s antes de chamar a API", (_n, v) => {
    expect(() => validarSiteId(v)).toThrow(WixCredencialInvalidaError);
  });

  it("a mensagem mostra o formato esperado", () => {
    expect(() => validarSiteId("x")).toThrow(/8-4-4-4-12/);
  });
});

describe("URL da loja", () => {
  it("aceita https e tira a barra final", async () => {
    expect(await validarUrlWix("https://aikabodysoul.com/")).toBe("https://aikabodysoul.com");
  });

  it.each([["http://loja.com"], ["loja.com"], [""]])("recusa %s", async (v) => {
    await expect(validarUrlWix(v)).rejects.toThrow(WixCredencialInvalidaError);
  });
});

describe("teste de conexão — o que é barrado sem rede", () => {
  it("Site ID inválido nem chega a chamar a API", async () => {
    const r = await testarConexaoWix("uma-chave-longa-o-suficiente-aqui", "não é guid");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toContain("8-4-4-4-12");
  });

  it("chave vazia ou curta demais é barrada com instrução", async () => {
    const r = await testarConexaoWix("abc", "fa19d2c0-7e17-4bc7-a3a8-eeeaf7c509b1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toContain("API Key");
  });
});

/**
 * O ponto do passo 1: credencial válida NÃO é integração. Se estas pendências
 * sumirem sem o adaptador existir, a tela passa a mentir.
 */
describe("o que ainda não existe fica declarado", () => {
  it("as pendências dizem o que não acontece", () => {
    expect(PENDENCIAS_WIX.join(" ")).toMatch(/pedidos/i);
    expect(PENDENCIAS_WIX.join(" ")).toMatch(/snapshot/i);
    expect(PENDENCIAS_WIX.join(" ")).toMatch(/Panorama|Jornalzinho|BlocoVendas/i);
  });

  it("Wix continua NÃO integrada no catálogo", async () => {
    const { temIntegracao } = await import("../../shared/plataformasLoja");
    expect(temIntegracao("wix")).toBe(false);
  });

  /** Sem adaptador de pedidos, o dispatch do sync não pode ter ramo de Wix. */
  it("o sync não tem ramo de Wix ainda", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const fonte = fs.readFileSync(path.join(__dirname, "lojaSync.ts"), "utf8");
    expect(fonte).not.toContain('cred.platform === "wix"');
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Mapa de formato — estrutura sim, dado de cliente não
 * ─────────────────────────────────────────────────────────────────────────────
 *  Pedido de e-commerce carrega nome, e-mail e endereço de cliente final. Nada
 *  disso precisa sair da Wix para eu escrever um normalizador — o que preciso é
 *  saber que existe `priceSummary.total.amount`, não quanto alguém pagou nem
 *  quem é.
 *
 *  Se este teste falhar, o diagnóstico virou vazamento.
 * ─────────────────────────────────────────────────────────────────────────────
 */
describe("mapa de formato", () => {
  const PEDIDO = {
    id: "abc-123",
    number: 1042,
    createdDate: "2026-08-05T12:00:00Z",
    status: "APPROVED",
    paymentStatus: "PAID",
    priceSummary: { total: { amount: "249.90", currency: "BRL" }, subtotal: { amount: "279.90" } },
    buyerInfo: { email: "cliente@exemplo.com", contactId: "c-1" },
    recipientInfo: { address: { city: "São Paulo", streetAddress: { name: "Rua X", number: "10" } } },
    lineItems: [{ productName: { original: "Sabonete" }, quantity: 2, totalPriceAfterTax: { amount: "99.80" } }],
    appliedDiscounts: [{ coupon: { code: "BEMVINDO10" }, discountType: "GLOBAL" }],
  };
  const mapa = () => resumoDeFormato(PEDIDO).join("\n");

  it("mostra os campos que o normalizador vai precisar", () => {
    const m = mapa();
    for (const campo of ["id", "createdDate", "priceSummary", "total", "amount", "lineItems", "quantity", "appliedDiscounts"]) {
      expect(m, `faltou ${campo}`).toContain(campo);
    }
  });

  it("mostra o VALOR de status e moeda — é neles que o valor é a informação", () => {
    const m = mapa();
    expect(m).toContain('status: string = "APPROVED"');
    expect(m).toContain('paymentStatus: string = "PAID"');
    expect(m).toContain('currency: string = "BRL"');
  });

  /** O que NÃO pode aparecer. */
  it.each([
    ["e-mail do cliente", "cliente@exemplo.com"],
    ["cidade", "São Paulo"],
    ["rua", "Rua X"],
    ["nome do produto", "Sabonete"],
    ["valor pago", "249.90"],
    ["código do cupom", "BEMVINDO10"],
  ])("não vaza %s", (_n, valor) => {
    expect(mapa()).not.toContain(valor);
  });

  it("mostra que os campos de cliente EXISTEM, sem o conteúdo", () => {
    const m = mapa();
    expect(m).toContain("buyerInfo");
    expect(m).toContain("email: string");
    expect(m).not.toContain("@exemplo");
  });

  it("lista só o primeiro item de um array, com a contagem", () => {
    const m = resumoDeFormato({ lineItems: [{ a: 1 }, { a: 2 }, { a: 3 }] }).join("\n");
    expect(m).toContain("lineItems: [3]");
    expect(m.match(/└ item/g)?.length).toBe(1);
  });

  it.each([[null], [undefined], [{}], [[]]])("entrada %s não quebra", (v) => {
    expect(() => resumoDeFormato(v)).not.toThrow();
  });
});
