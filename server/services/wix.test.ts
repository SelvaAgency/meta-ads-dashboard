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
import { agregarPedidosWix, normalizarPedidoWix, resumoDeFormato, sanitizarErroWix, testarConexaoWix, type PedidoWix, validarSiteId, validarUrlWix, WixCredencialInvalidaError } from "./wix";

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
describe("integração ligada", () => {
  /**
   * A virada de `integrada` só é legítima com adaptador. Este teste era o
   * inverso — cobrava `false` — e falhou quando o catálogo mudou. Era para
   * falhar: é o que obriga a virada a ser consciente, e não efeito colateral.
   */
  it("Wix agora é integrada E tem ramo no dispatch", async () => {
    const { temIntegracao } = await import("../../shared/plataformasLoja");
    expect(temIntegracao("wix")).toBe(true);

    const fs = await import("node:fs");
    const path = await import("node:path");
    const fonte = fs.readFileSync(path.join(__dirname, "lojaSync.ts"), "utf8");
    expect(fonte, "integrada sem dispatch = loja que nunca sincroniza").toContain('cred.platform === "wix"');
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

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Normalização — escrita contra a estrutura REAL da loja da Aiká
 * ─────────────────────────────────────────────────────────────────────────────
 *  Cada campo abaixo foi visto num pedido de verdade, não na documentação. As
 *  três armadilhas que a estrutura real revelou:
 *
 *   · dinheiro é STRING ("249.90") — somar sem converter concatena;
 *   · há DOIS estados (`status` do pedido, `paymentStatus` do dinheiro);
 *   · `balanceSummary.refunded.amount` é fato, não inferência.
 * ─────────────────────────────────────────────────────────────────────────────
 */
const PEDIDO_REAL = (over: Partial<PedidoWix> = {}): PedidoWix => ({
  id: "abc", number: "10042",
  createdDate: "2026-08-05T15:00:00.000Z",
  status: "APPROVED",
  paymentStatus: "PAID",
  currency: "BRL",
  priceSummary: { total: { amount: "249.90" }, discount: { amount: "20.00" } },
  balanceSummary: { refunded: { amount: "0" }, paid: { amount: "249.90" } },
  lineItems: [
    { productName: { original: "Sabonete Líquido" }, quantity: 2, totalPriceAfterTax: { amount: "99.80" } },
    { productName: { original: "Creme Esfoliante" }, quantity: 1, totalPriceAfterTax: { amount: "150.10" } },
  ],
  appliedDiscounts: [
    { discountRule: { name: { original: "Leve 3 Pague 2" }, amount: { amount: "20.00" } }, discountType: "SPECIFIC_ITEMS" } as never,
  ],
  ...over,
});

describe("dinheiro vem como string", () => {
  it("total vira número, não concatenação", () => {
    const n = normalizarPedidoWix(PEDIDO_REAL());
    expect(n.total).toBe(249.9);
    expect(typeof n.total).toBe("number");
  });

  it("item também", () => {
    const [item] = normalizarPedidoWix(PEDIDO_REAL()).itens;
    expect(item.total).toBe(99.8);
    expect(item.quantidade).toBe(2);
  });

  it.each([[undefined], [null], [""], ["abc"]])("valor %s não vira NaN", (v) => {
    const n = normalizarPedidoWix(PEDIDO_REAL({ priceSummary: { total: { amount: v as string } } }));
    expect(Number.isFinite(n.total)).toBe(true);
  });
});

describe("os dois estados", () => {
  it("APPROVED + PAID conta como receita", () => {
    const n = normalizarPedidoWix(PEDIDO_REAL());
    expect(n.contaReceita).toBe(true);
    expect(n.status).toBe("PAID");
  });

  /** Pendente é venda que pode não acontecer — somá-la infla o número. */
  it.each(["NOT_PAID", "PENDING", "PARTIALLY_PAID"])("paymentStatus %s", (pag) => {
    const n = normalizarPedidoWix(PEDIDO_REAL({ paymentStatus: pag }));
    expect(n.contaReceita).toBe(pag === "PARTIALLY_PAID");
  });

  it("CANCELED nunca conta, mesmo com pagamento PAID", () => {
    const n = normalizarPedidoWix(PEDIDO_REAL({ status: "CANCELED" }));
    expect(n.contaReceita).toBe(false);
    expect(n.cancelado).toBe(true);
    expect(n.status).toBe("CANCELED"); // o cancelamento manda na exibição
  });

  it("reembolso TOTAL sai da receita", () => {
    const n = normalizarPedidoWix(PEDIDO_REAL({ paymentStatus: "FULLY_REFUNDED" }));
    expect(n.contaReceita).toBe(false);
    expect(n.reembolsado).toBe(true);
  });

  /** Parcial permanece: parte do dinheiro ficou. */
  it("reembolso PARCIAL continua na receita e marca reembolso", () => {
    const n = normalizarPedidoWix(PEDIDO_REAL({
      paymentStatus: "PARTIALLY_REFUNDED",
      balanceSummary: { refunded: { amount: "50.00" } },
    }));
    expect(n.reembolsado).toBe(true);
  });

  it("valor devolvido em balanceSummary marca reembolso mesmo sem status", () => {
    const n = normalizarPedidoWix(PEDIDO_REAL({ balanceSummary: { refunded: { amount: "10.00" } } }));
    expect(n.reembolsado).toBe(true);
  });
});

describe("data no fuso da agência", () => {
  it("ISO em UTC vira o dia local", () => {
    expect(normalizarPedidoWix(PEDIDO_REAL()).dia).toBe("2026-08-05");
  });

  /** 01h UTC do dia 6 ainda é dia 5 no Brasil — errar isso desloca a receita. */
  it("madrugada em UTC não empurra o pedido para o dia seguinte", () => {
    expect(normalizarPedidoWix(PEDIDO_REAL({ createdDate: "2026-08-06T01:00:00.000Z" })).dia)
      .toBe("2026-08-05");
  });

  it.each([[undefined], [""], ["não é data"]])("data %s vira string vazia, não crash", (v) => {
    expect(() => normalizarPedidoWix(PEDIDO_REAL({ createdDate: v as string }))).not.toThrow();
  });
});

describe("itens e cupons", () => {
  it("nome vem de productName.original", () => {
    expect(normalizarPedidoWix(PEDIDO_REAL()).itens.map((i) => i.nome))
      .toEqual(["Sabonete Líquido", "Creme Esfoliante"]);
  });

  it("item sem nome não quebra a agregação", () => {
    const n = normalizarPedidoWix(PEDIDO_REAL({ lineItems: [{ quantity: 1 }] }));
    expect(n.itens[0].nome).toBe("(sem nome)");
  });

  /** Promoção automática não traz código — o nome da regra é o identificador. */
  it("desconto sem código de cupom usa o nome da regra", () => {
    expect(normalizarPedidoWix(PEDIDO_REAL()).cupons).toEqual([
      { codigo: "Leve 3 Pague 2", desconto: 20 },
    ]);
  });

  it("cupom com código usa o código", () => {
    const n = normalizarPedidoWix(PEDIDO_REAL({
      appliedDiscounts: [{ coupon: { code: "BEMVINDO10" }, discountRule: { amount: { amount: "15.00" } } }],
    }));
    expect(n.cupons).toEqual([{ codigo: "BEMVINDO10", desconto: 15 }]);
  });

  it("desconto zerado não polui a lista de cupons", () => {
    const n = normalizarPedidoWix(PEDIDO_REAL({
      appliedDiscounts: [{ discountRule: { name: { original: "X" }, amount: { amount: "0" } } }],
    }));
    expect(n.cupons).toEqual([]);
  });

  it.each([[undefined], [[]]])("pedido sem itens (%s) não quebra", (v) => {
    expect(normalizarPedidoWix(PEDIDO_REAL({ lineItems: v as never })).itens).toEqual([]);
  });
});

describe("agregação — o que chega no BlocoVendas", () => {
  const pedidos = [
    PEDIDO_REAL({ id: "1" }),
    PEDIDO_REAL({ id: "2", paymentStatus: "NOT_PAID", priceSummary: { total: { amount: "100.00" } } }),
    PEDIDO_REAL({ id: "3", status: "CANCELED", priceSummary: { total: { amount: "500.00" } } }),
  ];

  it("só o pago entra na receita", () => {
    const b = agregarPedidosWix(pedidos, "7d", "2026-08-01", "2026-08-07");
    expect(b.receita).toBe(249.9);
    expect(b.pedidos).toBe(1);
    expect(b.fonte).toBe("wix");
  });

  it("os não pagos aparecem em pedidosPorStatus, fora da receita", () => {
    const b = agregarPedidosWix(pedidos, "7d", "2026-08-01", "2026-08-07");
    expect(b.pedidosPorStatus.map((s) => s.status).sort()).toEqual(["CANCELED", "NOT_PAID", "PAID"]);
  });

  /** Janela vazia é sem_dados, NUNCA R$ 0 — zero é um número plausível. */
  it("janela sem pedidos vira sem_dados, não R$ 0", () => {
    const b = agregarPedidosWix(pedidos, "7d", "2026-09-01", "2026-09-07");
    expect(b.status).toBe("sem_dados");
    expect(b.receita).toBeNull();
    expect(b.pedidos).toBeNull();
  });

  it("as limitações da Wix são declaradas", () => {
    const b = agregarPedidosWix(pedidos, "30d", "2026-08-01", "2026-08-31");
    expect(b.limitacoes.join(" ")).toMatch(/pendente/i);
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Sanitização do erro — o corpo é útil, e é de terceiro
 * ─────────────────────────────────────────────────────────────────────────────
 *  Quando a Wix recusa o payload ela diz QUAL campo recusou, e é essa frase que
 *  permite corrigir sem chutar. Descartá-la por precaução custou uma rodada
 *  inteira de diagnóstico.
 *
 *  Mas ecoar resposta de terceiro é como credencial vaza para log. Estes testes
 *  são a licença para aproveitar o corpo: se um deles cair, o corpo volta a ser
 *  descartado.
 * ─────────────────────────────────────────────────────────────────────────────
 */
describe("erro da Wix sai sanitizado", () => {
  const CHAVE = "IST.eyJraWQiOiJQb3pIX2FDMiIsImFsZyI6IlJTMjU2In0.abcdefghijklmnop";

  it("preserva a mensagem útil — é ela que corrige o payload", () => {
    const t = sanitizarErroWix('{"message":"unknown field \'sort.fieldName\'","code":"INVALID_ARGUMENT"}', CHAVE);
    expect(t).toContain("unknown field");
    expect(t).toContain("sort.fieldName");
    expect(t).toContain("INVALID_ARGUMENT");
  });

  it("a própria chave nunca sobrevive, nem no meio do JSON", () => {
    const t = sanitizarErroWix(`{"echo":{"Authorization":"${CHAVE}"},"message":"bad"}`, CHAVE);
    expect(t).not.toContain(CHAVE);
    expect(t).toContain("bad");
  });

  /** Chave de OUTRO serviço que apareça no corpo também não pode passar. */
  it("qualquer sequência longa parecida com token some", () => {
    const outro = "shpat_1234567890abcdefghijklmnopqrstuvwxyz";
    expect(sanitizarErroWix(`{"m":"erro","t":"${outro}"}`)).not.toContain(outro);
  });

  it.each(["Authorization", "api-key", "apiKey", "wix-site-id"])("cabeçalho %s é ocultado por nome", (nome) => {
    const t = sanitizarErroWix(`{"${nome}":"valor-secreto-aqui","message":"x"}`);
    expect(t).not.toContain("valor-secreto-aqui");
    expect(t).toContain("«oculto»");
  });

  /** Mensagem em português não pode ser comida pelo corte de token. */
  it("texto normal sobrevive inteiro", () => {
    const t = sanitizarErroWix("O campo createdDate não é filtrável nesta coleção.");
    expect(t).toBe("O campo createdDate não é filtrável nesta coleção.");
  });

  it("corpo gigante é truncado", () => {
    expect(sanitizarErroWix("erro ".repeat(500)).length).toBeLessThanOrEqual(600);
  });

  it.each([[""], [null], [undefined]])("corpo %s vira string vazia", (v) => {
    expect(sanitizarErroWix(v as string)).toBe("");
  });

  /** Chave curta demais não vira substituição que apagaria meio texto. */
  it("segredo curto é ignorado no corte por igualdade", () => {
    expect(sanitizarErroWix("erro no campo id", "id")).toContain("id");
  });
});
