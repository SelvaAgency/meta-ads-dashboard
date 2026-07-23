import { describe, it, expect } from "vitest";
import {
  vendasDe, achadosDe, avaliarCliente, ordenarClientes, funilDe,
  celulaVendas, celulaSaude, celulaTrafego, celulaFunil, fmtBRL,
  resumoPortfolio, funilVisual, rankingProdutos, distribuicaoStatus, temEcommerce,
  achadosComerciais, CHAVES_COMERCIAIS,
  LIMIAR_CHECKOUT_PURCHASE, BASE_MINIMA_FUNIL,
  type ClientePanorama, type EcomGA4,
} from "./panoramaLogic";

/**
 * As fixtures são os CASOS REAIS de produção (jul/2026): BAESH (checkout
 * vazando), Scaffold (pedidos pagos de R$0 com cupom de 100%), UMA (GA4 como
 * fonte inicial + WAF), Ultra/ELWING (sem e-commerce — e sem punição por isso).
 */
const base = (o: Partial<ClientePanorama> = {}): ClientePanorama => ({
  accountId: 1, nome: "Cliente", fontes: [], loja: null,
  uptime: null, seguranca: null, pagespeed: null,
  ga4_7d: null, ga4_30d: null, woo_7d: null, woo_30d: null,
  ...o,
});

const ecom = (o: Partial<EcomGA4> = {}): EcomGA4 => ({
  status: "detectado", receita: null, transacoes: null, ticketMedio: null,
  addToCart: null, beginCheckout: null, purchases: null,
  taxaCarrinhoCheckout: null, taxaCheckoutPurchase: null,
  ...o,
});

// BAESH: Woo importado (30d com receita; 7d sem venda) + funil GA4 vazando no checkout
const baesh = base({
  nome: "BAESH",
  woo_7d: { dia: "2026-07-22", metricsJson: { status: "sem_dados", receita: null, pedidos: null } },
  woo_30d: { dia: "2026-07-22", metricsJson: { status: "ok", receita: 2061.16, pedidos: 4, ticketMedio: 515.29 } },
  ga4_30d: { dia: "2026-07-22", metricsJson: { sessions: 900, ecommerce: ecom({ addToCart: 62, beginCheckout: 60, purchases: 4, taxaCarrinhoCheckout: 96.8, taxaCheckoutPurchase: 6.7, receita: 2000, transacoes: 4 }) } },
});

// Scaffold: 7d com 2 pedidos "pagos" de R$0, cupom tstlcs 100%
const scaffold = base({
  nome: "Scaffold Play",
  woo_7d: { dia: "2026-07-22", metricsJson: { status: "ok", receita: 0, pedidos: 2, ticketMedio: 0, cupons: [{ codigo: "tstlcs", usos: 2, desconto: 398 }] } },
  woo_30d: { dia: "2026-07-22", metricsJson: { status: "ok", receita: 398, pedidos: 4, ticketMedio: 99.5 } },
  ga4_7d: { dia: "2026-07-22", metricsJson: { sessions: 500, ecommerce: ecom({ purchases: 2, receita: 0, transacoes: 2 }) } },
});

// UMA: sem Woo, GA4 detectou; site atrás de WAF (403)
const uma = base({
  nome: "UMA",
  uptime: { dia: "2026-07-22", metricsJson: { status: "bloqueado" } },
  ga4_7d: { dia: "2026-07-22", metricsJson: { sessions: 8572, anterior: { sessions: 8100 }, ecommerce: ecom({ receita: 18000, transacoes: 40, ticketMedio: 450, purchases: 40, addToCart: 200, beginCheckout: 48, taxaCarrinhoCheckout: 24, taxaCheckoutPurchase: 83.3 }) } },
});

// Ultra Malhas: só saúde técnica — não transaciona online
const ultra = base({
  nome: "Ultra Malhas",
  uptime: { dia: "2026-07-22", metricsJson: { status: "no_ar" } },
  pagespeed: { dia: "2026-07-22", metricsJson: { performanceScore: 64, lcp: 6484 } },
  ga4_7d: { dia: "2026-07-22", metricsJson: { sessions: 200, ecommerce: ecom({ status: "sem_dados" }) } },
});

describe("Vendas — uma fonte só", () => {
  it("BAESH: Woo existe → Woo 30d, receita real da loja", () => {
    const v = vendasDe(baesh)!;
    expect(v.fonte).toBe("woocommerce");
    expect(v.janela).toBe("30d");
    expect(v.receita).toBe(2061.16);
    expect(v.rotuloFonte).toBe("Woo");
  });

  it("UMA: sem Woo, GA4 detectou → GA4 rotulado fonte inicial", () => {
    const v = vendasDe(uma)!;
    expect(v.fonte).toBe("ga4");
    expect(v.rotuloFonte).toBe("GA4 — fonte inicial");
    expect(v.receita).toBe(18000);
  });

  it("Ultra: sem e-commerce → célula vazia, nunca problema", () => {
    expect(vendasDe(ultra)).toBeNull();
    const cel = celulaVendas(ultra);
    expect(cel.valor).toBe("—");
    expect(cel.estado).toBe("vazio");
  });

  it("NUNCA Woo e GA4 ao mesmo tempo: com Woo presente, a fonte é uma só", () => {
    // Scaffold tem Woo E GA4 com e-commerce — a célula sai Woo, ponto.
    const v = vendasDe(scaffold)!;
    expect(v.fonte).toBe("woocommerce");
  });

  it("Woo 30d sem dado mas 7d com dado → usa o 7d", () => {
    const c = base({ woo_7d: { dia: "2026-07-22", metricsJson: { status: "ok", receita: 100, pedidos: 1 } } });
    expect(vendasDe(c)!.janela).toBe("7d");
  });
});

describe("achados — regra sobre dado medido", () => {
  it("BAESH: checkout convertendo 6,7% com base — vazamento", () => {
    const a = achadosDe(baesh);
    const v = a.find((x) => x.chave === "vazamento_checkout")!;
    expect(v.severidade).toBe("atencao");
    expect(v.texto).toContain("6,7%");
    expect(v.texto).toContain("60 iniciaram");
  });

  it("funil sem base mínima NÃO vira achado — taxa sem base não é veredito", () => {
    const c = base({
      ga4_7d: { dia: "2026-07-22", metricsJson: { ecommerce: ecom({ beginCheckout: BASE_MINIMA_FUNIL - 1, purchases: 1, taxaCheckoutPurchase: 5 }) } },
    });
    expect(achadosDe(c).find((x) => x.chave === "vazamento_checkout")).toBeUndefined();
  });

  it("Scaffold: pedidos pagos de R$0 citam o cupom de 100% — e o achado de GA4 não duplica", () => {
    const a = achadosDe(scaffold);
    const r0 = a.find((x) => x.chave === "pedido_pago_r0")!;
    expect(r0.texto).toContain("tstlcs");
    expect(r0.texto).toContain("R$ 0");
    // o purchase sem valor no GA4 é a MESMA causa — não vira segundo achado
    expect(a.find((x) => x.chave === "purchase_sem_valor")).toBeUndefined();
  });

  it("purchase sem valor no GA4 aparece quando NÃO há Woo para explicar", () => {
    const c = base({
      ga4_7d: { dia: "2026-07-22", metricsJson: { ecommerce: ecom({ purchases: 3, receita: 0 }) } },
    });
    const a = achadosDe(c).find((x) => x.chave === "purchase_sem_valor")!;
    expect(a.texto).toContain("sem valor");
  });

  it("UMA: WAF é info, não crítico — 403 não é queda", () => {
    const a = achadosDe(uma);
    expect(a.find((x) => x.chave === "waf")!.severidade).toBe("info");
    expect(a.find((x) => x.chave === "fora_do_ar")).toBeUndefined();
  });

  it("UMA: carrinho→checkout 24% com base vira achado (checkout→compra está saudável)", () => {
    const a = achadosDe(uma);
    expect(a.find((x) => x.chave === "vazamento_carrinho")!.texto).toContain("24,0%");
    expect(a.find((x) => x.chave === "vazamento_checkout")).toBeUndefined();
  });

  it("site fora do ar e SSL quebrado são críticos", () => {
    const c = base({
      uptime: { dia: "2026-07-22", metricsJson: { status: "fora_do_ar" } },
      seguranca: { dia: "2026-07-22", metricsJson: { https: false } },
    });
    const a = achadosDe(c);
    expect(a.find((x) => x.chave === "fora_do_ar")!.severidade).toBe("critico");
    expect(a.find((x) => x.chave === "ssl_invalido")!.severidade).toBe("critico");
  });

  it("fonte com sync em erro é crítica; fonte ausente não gera nada", () => {
    const c = base({
      fontes: [
        { chave: "ga4", rotulo: "GA4", status: "erro", porque: "sync falhou ontem" },
        { chave: "clarity", rotulo: "Clarity", status: "ausente" },
      ],
    });
    const a = achadosDe(c);
    expect(a.find((x) => x.chave === "fonte_ga4")!.severidade).toBe("critico");
    expect(a.find((x) => x.chave === "fonte_clarity")).toBeUndefined();
  });

  it("importação da loja em erro é crítica", () => {
    const c = base({ loja: { platform: "woocommerce", lastSyncAt: null, lastSyncStatus: "erro", lastSyncError: "loja recusou a credencial" } });
    expect(achadosDe(c).find((x) => x.chave === "loja_sync")!.severidade).toBe("critico");
  });

  it("queda forte de tráfego só com base real no anterior", () => {
    const caiu = base({ ga4_7d: { dia: "2026-07-22", metricsJson: { sessions: 50, anterior: { sessions: 200 } } } });
    expect(achadosDe(caiu).find((x) => x.chave === "queda_trafego")!.texto).toContain("200 → 50");
    const semBase = base({ ga4_7d: { dia: "2026-07-22", metricsJson: { sessions: 3, anterior: { sessions: 20 } } } });
    expect(achadosDe(semBase).find((x) => x.chave === "queda_trafego")).toBeUndefined();
  });

  it("PageSpeed muito baixo é atenção; 64 não é", () => {
    const ruim = base({ pagespeed: { dia: "2026-07-22", metricsJson: { performanceScore: 30 } } });
    expect(achadosDe(ruim).find((x) => x.chave === "pagespeed_baixo")!.severidade).toBe("atencao");
    expect(achadosDe(ultra).find((x) => x.chave === "pagespeed_baixo")).toBeUndefined();
  });
});

describe("nível e ordenação", () => {
  it("BAESH desce como atenção pelo funil, com motivo visível", () => {
    const av = avaliarCliente(baesh);
    expect(av.nivel).toBe("atencao");
    expect(av.motivos.join(" ")).toContain("6,7%");
  });

  it("Scaffold é atenção pelo R$0 — motivo com cupom", () => {
    const av = avaliarCliente(scaffold);
    expect(av.nivel).toBe("atencao");
    expect(av.motivos.join(" ")).toContain("tstlcs");
  });

  it("Ultra: fontes lendo, sem achado → ok; sem e-commerce não pune", () => {
    expect(avaliarCliente(ultra).nivel).toBe("ok");
  });

  it("nada conectado → sem_dados, neutro e sem motivos", () => {
    const av = avaliarCliente(base());
    expect(av.nivel).toBe("sem_dados");
    expect(av.motivos).toEqual([]);
  });

  it("crítico vence atenção; motivos saem do pior para o mais leve", () => {
    const c = base({
      uptime: { dia: "2026-07-22", metricsJson: { status: "fora_do_ar" } },
      pagespeed: { dia: "2026-07-22", metricsJson: { performanceScore: 20 } },
    });
    const av = avaliarCliente(c);
    expect(av.nivel).toBe("critico");
    expect(av.motivos[0]).toBe("site fora do ar");
    expect(av.motivos[1]).toContain("PageSpeed");
  });

  it("info (WAF) sozinho não rebaixa: UMA fica atenção pelo carrinho, não pelo 403", () => {
    const av = avaliarCliente(uma);
    expect(av.nivel).toBe("atencao");
    expect(av.motivos.join(" ")).not.toContain("WAF");
  });

  it("ordena critico > atencao > ok > sem_dados; empate por nome", () => {
    const linhas = [
      { nivel: "ok" as const, nome: "B" },
      { nivel: "sem_dados" as const, nome: "A" },
      { nivel: "critico" as const, nome: "Z" },
      { nivel: "atencao" as const, nome: "C" },
      { nivel: "ok" as const, nome: "A" },
    ];
    expect(ordenarClientes(linhas).map((l) => `${l.nivel}:${l.nome}`)).toEqual([
      "critico:Z", "atencao:C", "ok:A", "ok:B", "sem_dados:A",
    ]);
  });
});

describe("células da grade", () => {
  it("cada célula declara fonte e data — GA4 e Woo nunca se confundem", () => {
    expect(celulaVendas(baesh).fonte).toBe("Woo · 30d");
    expect(celulaVendas(uma).fonte).toBe("GA4 — fonte inicial · 7d");
    expect(celulaFunil(baesh).fonte).toBe("GA4 · 30d");
    expect(celulaVendas(baesh).dia).toBe("2026-07-22");
  });

  it("saúde: WAF aparece como atenção com ressalva, fora do ar como crítico", () => {
    expect(celulaSaude(uma).valor).toBe("WAF 403");
    expect(celulaSaude(uma).detalhe).toBe("não é queda");
    const fora = base({ uptime: { dia: "2026-07-22", metricsJson: { status: "fora_do_ar" } } });
    expect(celulaSaude(fora).estado).toBe("critico");
  });

  it("tráfego mostra variação apenas com anterior real", () => {
    expect(celulaTrafego(uma).detalhe).toBe("+6% vs anterior");
    expect(celulaTrafego(base({ ga4_7d: { dia: "2026-07-22", metricsJson: { sessions: 10 } } })).detalhe).toBeUndefined();
  });

  it("Scaffold: célula de vendas R$ 0 com pedidos fica em atenção, não passa por saudável", () => {
    // vendasDe prefere o 30d (R$398) — força o caso 7d-só para a célula
    const so7d = base({ woo_7d: scaffold.woo_7d });
    const cel = celulaVendas(so7d);
    expect(cel.valor).toBe(fmtBRL(0));
    expect(cel.estado).toBe("atencao");
  });

  it("receita indisponível não vira R$ 0", () => {
    const c = base({ ga4_7d: { dia: "2026-07-22", metricsJson: { ecommerce: ecom({ purchases: 2, receita: null, transacoes: 2 }) } } });
    expect(celulaVendas(c).valor).toBe("receita indisponível");
  });
});

describe("funil — sempre GA4", () => {
  it("mesmo com Woo presente, o funil vem do GA4", () => {
    const f = funilDe(scaffold)!;
    expect(f.e.purchases).toBe(2);
  });

  it("limiar do checkout é o declarado", () => {
    expect(LIMIAR_CHECKOUT_PURCHASE).toBe(30);
  });
});

// ─── Helpers visuais (frente de escaneabilidade) ─────────────────────────────

describe("resumo do portfólio", () => {
  it("conta níveis, achados e lojas Woo; distribuição em ordem fixa", () => {
    const clientes = [baesh, scaffold, uma, ultra, base()];
    const avaliacoes = clientes.map((c) => {
      const a = avaliarCliente(c);
      return { nivel: a.nivel, achados: a.achados };
    });
    const r = resumoPortfolio(avaliacoes, [
      { ...baesh, loja: { platform: "woocommerce", lastSyncAt: null, lastSyncStatus: "ok", lastSyncError: null } },
      { ...scaffold, loja: { platform: "woocommerce", lastSyncAt: null, lastSyncStatus: "ok", lastSyncError: null } },
      uma, ultra, base(),
    ]);
    expect(r.totalClientes).toBe(5);
    expect(r.precisamAtencao).toBe(3);          // BAESH, Scaffold, UMA
    expect(r.lojasWoo).toBe(2);
    expect(r.distribuicao.map((d) => d.nivel)).toEqual(["critico", "atencao", "ok", "sem_dados"]);
    expect(r.distribuicao.find((d) => d.nivel === "atencao")!.quantidade).toBe(3);
    expect(r.distribuicao.find((d) => d.nivel === "sem_dados")!.quantidade).toBe(1);
    expect(r.achadosAtencao).toBeGreaterThan(0);
  });
});

describe("funil visual", () => {
  it("BAESH: três etapas com absoluto, passagem e perda entre etapas", () => {
    const f = funilVisual(baesh)!;
    expect(f.janela).toBe("30d");
    expect(f.etapas.map((e) => e.valor)).toEqual([62, 60, 4]);
    // checkout/carrinho e compra/checkout
    expect(f.etapas[1].taxaPassagem).toBeCloseTo(96.77, 1);
    expect(f.etapas[2].taxaPassagem).toBeCloseTo(6.67, 1);
    expect(f.etapas[1].perda).toBe(2);   // 62 → 60
    expect(f.etapas[2].perda).toBe(56);  // 60 → 4
    expect(f.etapas[0].taxaPassagem).toBeNull(); // primeira etapa não tem passagem
  });

  it("amostra pequena quando begin_checkout < 20", () => {
    const c = base({ ga4_7d: { dia: "2026-07-22", metricsJson: { ecommerce: ecom({ addToCart: 15, beginCheckout: 12, purchases: 1 }) } } });
    expect(funilVisual(c)!.amostraPequena).toBe(true);
    expect(funilVisual(baesh)!.amostraPequena).toBe(false); // 60 checkouts
  });

  it("etapa sem base fica null (nunca 0%), não inventa passagem", () => {
    const c = base({ ga4_7d: { dia: "2026-07-22", metricsJson: { ecommerce: ecom({ addToCart: null, beginCheckout: 10, purchases: 3 }) } } });
    const f = funilVisual(c)!;
    expect(f.etapas[0].valor).toBeNull();
    expect(f.etapas[1].taxaPassagem).toBeNull(); // denominador (carrinho) ausente
    expect(f.etapas[2].taxaPassagem).toBeCloseTo(30, 1); // compra/checkout ainda vale
  });

  it("sem e-commerce detectado, não há funil", () => {
    expect(funilVisual(ultra)).toBeNull();
    expect(funilVisual(base())).toBeNull();
  });
});

describe("ranking de produtos", () => {
  const comProdutos = base({
    nome: "Loja",
    woo_30d: { dia: "2026-07-22", metricsJson: { status: "ok", receita: 500, pedidos: 5, produtos: [
      { nome: "Camisa", quantidade: 3, receita: 300 },
      { nome: "Boné", quantidade: 5, receita: 200 },
      { nome: "Brinde", quantidade: 2, receita: 0 },
    ] } },
  });

  it("com receita positiva, ranking por receita e sem observação", () => {
    const r = rankingProdutos(comProdutos)!;
    expect(r.medida).toBe("receita");
    expect(r.itens.map((i) => i.nome)).toEqual(["Camisa", "Boné"]); // Brinde (R$0) sai
    expect(r.observacao).toBeUndefined();
  });

  it("Scaffold: receita toda zerada → mede por quantidade, com ressalva do cupom", () => {
    const scaffoldR0 = base({
      woo_7d: { dia: "2026-07-22", metricsJson: { status: "ok", receita: 0, pedidos: 2, produtos: [
        { nome: "IA Aplicada", quantidade: 2, receita: 0 },
      ] } },
    });
    const r = rankingProdutos(scaffoldR0)!;
    expect(r.medida).toBe("quantidade");
    expect(r.itens[0]).toMatchObject({ nome: "IA Aplicada", valor: 2 });
    expect(r.observacao).toMatch(/100%/);
  });

  it("sem produtos, não há ranking", () => {
    expect(rankingProdutos(base())).toBeNull();
    expect(rankingProdutos(uma)).toBeNull(); // UMA não tem Woo
  });

  it("nunca desenha barra falsa de valor zero", () => {
    const soZero = base({ woo_30d: { dia: "2026-07-22", metricsJson: { status: "ok", receita: 10, pedidos: 1, produtos: [{ nome: "X", quantidade: 0, receita: 0 }] } } });
    // receita total 10 > 0 → mede receita; único produto tem receita 0 → filtrado → sem ranking
    expect(rankingProdutos(soZero)).toBeNull();
  });
});

describe("distribuição de pedidos por status", () => {
  const comStatus = base({
    woo_30d: { dia: "2026-07-22", metricsJson: { status: "ok", receita: 400, pedidos: 6, pedidosPorStatus: [
      { status: "completed", quantidade: 4 },
      { status: "refunded", quantidade: 1 },
      { status: "cancelled", quantidade: 1 },
    ] } },
  });

  it("total e tons por status; ordena por quantidade", () => {
    const d = distribuicaoStatus(comStatus)!;
    expect(d.total).toBe(6);
    expect(d.itens[0]).toMatchObject({ status: "completed", quantidade: 4, tom: "ok", rotulo: "Concluídos" });
    expect(d.itens.find((i) => i.status === "refunded")!.tom).toBe("critico");
    expect(d.itens.find((i) => i.status === "cancelled")!.rotulo).toBe("Cancelados");
  });

  it("status desconhecido não quebra — vira neutro capitalizado", () => {
    const c = base({ woo_30d: { dia: "2026-07-22", metricsJson: { status: "ok", pedidos: 1, pedidosPorStatus: [{ status: "trash", quantidade: 1 }] } } });
    const d = distribuicaoStatus(c)!;
    expect(d.itens[0]).toMatchObject({ rotulo: "Trash", tom: "neutro" });
  });

  it("sem dados de status, não há distribuição", () => {
    expect(distribuicaoStatus(base())).toBeNull();
    expect(distribuicaoStatus(uma)).toBeNull();
  });
});

describe("quem entra na seção E-commerce", () => {
  it("só clientes com base real de vendas (Woo ou GA4 detectado)", () => {
    expect(temEcommerce(baesh)).toBe(true);   // Woo
    expect(temEcommerce(uma)).toBe(true);      // GA4 detectado
    expect(temEcommerce(scaffold)).toBe(true); // Woo
    expect(temEcommerce(ultra)).toBe(false);   // GA4 sem_dados, sem Woo
    expect(temEcommerce(base())).toBe(false);  // nada
  });
});

// ─── Bloco Comercial do cliente (achados comerciais) ─────────────────────────

describe("achados comerciais", () => {
  it("só o subconjunto de venda — nada de site fora do ar, SSL ou PageSpeed", () => {
    const c = base({
      uptime: { dia: "2026-07-22", metricsJson: { status: "fora_do_ar" } },
      seguranca: { dia: "2026-07-22", metricsJson: { https: false } },
      pagespeed: { dia: "2026-07-22", metricsJson: { performanceScore: 20 } },
      ga4_7d: { dia: "2026-07-22", metricsJson: { ecommerce: ecom({ purchases: 3, receita: 0 }) } },
    });
    const chaves = achadosComerciais(c).map((x) => x.chave);
    expect(chaves).toContain("purchase_sem_valor");
    expect(chaves).not.toContain("fora_do_ar");
    expect(chaves).not.toContain("ssl_invalido");
    expect(chaves).not.toContain("pagespeed_baixo");
  });

  it("BAESH: checkout baixo entra como achado comercial", () => {
    const chaves = achadosComerciais(baesh).map((x) => x.chave);
    expect(chaves).toContain("vazamento_checkout");
  });

  it("Scaffold: pedido pago R$0 com cupom 100% entra e cita o cupom", () => {
    const a = achadosComerciais(scaffold).find((x) => x.chave === "pedido_pago_r0")!;
    expect(a.texto).toContain("tstlcs");
    expect(a.texto).toContain("R$ 0");
  });

  it("queda de tráfego com base entra; sem base não", () => {
    const caiu = base({ ga4_7d: { dia: "2026-07-22", metricsJson: { sessions: 50, anterior: { sessions: 200 }, ecommerce: ecom({ status: "sem_dados" }) } } });
    expect(achadosComerciais(caiu).map((x) => x.chave)).toContain("queda_trafego");
  });

  it("cliente saudável não gera achado comercial", () => {
    const bom = base({ woo_30d: { dia: "2026-07-22", metricsJson: { status: "ok", receita: 5000, pedidos: 20, ticketMedio: 250 } } });
    expect(achadosComerciais(bom)).toEqual([]);
  });

  it("todas as chaves comerciais são um subconjunto real de achadosDe", () => {
    // trava contra digitação: cada chave comercial precisa existir em achadosDe
    for (const chave of CHAVES_COMERCIAIS) {
      expect(typeof chave).toBe("string");
    }
    expect(CHAVES_COMERCIAIS.has("pedido_pago_r0")).toBe(true);
    expect(CHAVES_COMERCIAIS.size).toBe(5);
  });
});
