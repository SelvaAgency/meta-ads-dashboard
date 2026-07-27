import { describe, it, expect } from "vitest";
import { montarSecoesExecutivas, renderExecutivoTexto } from "./jornalExecutivo";
import type { ClientePanorama, EcomGA4 } from "@shared/panoramaLogic";

/**
 * O Jornalzinho executivo reusa a lógica pura do Panorama — estes testes travam
 * as regras que não podem escorregar: receita real só soma Woo+VNDA (nunca GA4/
 * Meta), UMA aparece como VNDA, cliente sem loja não vira problema, ARKA entra
 * como pendência manual de reconnect Meta.
 */
const ecom = (o: Partial<EcomGA4> = {}): EcomGA4 => ({
  status: "detectado", receita: null, transacoes: null, ticketMedio: null,
  addToCart: null, beginCheckout: null, purchases: null, taxaCarrinhoCheckout: null, taxaCheckoutPurchase: null, ...o,
});
const base = (o: Partial<ClientePanorama> = {}): ClientePanorama => ({
  accountId: 1, nome: "Cliente", fontes: [], loja: null, plataformaLoja: null,
  uptime: null, seguranca: null, pagespeed: null, ga4_7d: null, ga4_30d: null, loja_7d: null, loja_30d: null, ...o,
});

const baesh = base({ nome: "BAESH", plataformaLoja: "woocommerce",
  loja_30d: { dia: "2026-07-27", metricsJson: { status: "ok", receita: 2000, pedidos: 4, ticketMedio: 500 } },
  ga4_30d: { dia: "2026-07-27", metricsJson: { sessions: 900, ecommerce: ecom({ addToCart: 62, beginCheckout: 60, purchases: 4, taxaCheckoutPurchase: 6.7 }) } } });
const uma = base({ nome: "UMA", plataformaLoja: "vnda",
  loja_30d: { dia: "2026-07-27", metricsJson: { status: "ok", receita: 77258.5, pedidos: 91, ticketMedio: 848.99,
    produtos: [{ nome: "Vestido", quantidade: 4, receita: 8137 }] } },
  ga4_7d: { dia: "2026-07-27", metricsJson: { sessions: 8000, ecommerce: ecom({ receita: 24000, transacoes: 40, purchases: 40 }) } } });
const ultra = base({ nome: "Ultra Malhas", ga4_7d: { dia: "2026-07-27", metricsJson: { sessions: 200, ecommerce: ecom({ status: "sem_dados" }) } } });
// ARKA real: Meta em "atenção" (precisa de ação), NÃO "erro" — o token venceu
// em 03/06 e o classificador marca atenção. Tem de aparecer mesmo assim.
const arka = base({ nome: "ARKA", fontes: [{ chave: "meta", rotulo: "Meta Ads", status: "atencao", porque: "Último sync 03/06. A conexão precisa de ação." }] });

describe("destaques — receita real só soma Woo + VNDA", () => {
  it("soma BAESH(Woo 2000) + UMA(VNDA 77258.5); GA4 NÃO entra", () => {
    const s = montarSecoesExecutivas([baesh, uma, ultra, arka], "2026-07-27");
    expect(s.destaques.receitaRealLojas).toBe(79258.5);   // 2000 + 77258.5, sem os R$24k do GA4 da UMA
    expect(s.destaques.lojasComReceita).toBe(2);
    expect(s.destaques.totalClientes).toBe(4);
    // tráfego GA4 é métrica à parte, nunca somada à receita
    expect(s.destaques.trafegoGA4).toBe(8200); // 900 + 8000 + 200 + 0
  });
});

describe("vendas reais — fonte por plataforma", () => {
  it("BAESH via Woo, UMA via VNDA; nenhum cliente sem loja aparece", () => {
    const s = montarSecoesExecutivas([baesh, uma, ultra, arka], "2026-07-27");
    const nomes = s.vendasReais.map((v) => `${v.nome}:${v.fonte}`);
    expect(nomes).toContain("BAESH:Woo");
    expect(nomes).toContain("UMA:VNDA");
    expect(s.vendasReais.find((v) => v.nome === "Ultra Malhas")).toBeUndefined(); // sem loja → fora
    expect(s.vendasReais.find((v) => v.nome === "ARKA")).toBeUndefined();
  });
});

describe("atenção primeiro / cliente sem e-commerce", () => {
  it("BAESH entra por vazamento de checkout; Ultra (sem e-commerce) não vira problema", () => {
    const s = montarSecoesExecutivas([baesh, uma, ultra, arka], "2026-07-27");
    expect(s.atencaoPrimeiro.find((a) => a.nome === "BAESH")?.motivo).toMatch(/checkout|6,7/);
    expect(s.atencaoPrimeiro.find((a) => a.nome === "Ultra Malhas")).toBeUndefined();
  });
});

describe("fontes com erro e pendências manuais — ARKA", () => {
  it("ARKA (Meta em atenção) aparece em Fontes com erro E em Pendências manuais", () => {
    const s = montarSecoesExecutivas([baesh, uma, ultra, arka], "2026-07-27");
    expect(s.fontesComErro.find((f) => f.nome === "ARKA" && /Meta/.test(f.fonte))).toBeTruthy();
    expect(s.pendenciasManuais.find((p) => p.nome === "ARKA" && /reconectar Meta/i.test(p.texto))).toBeTruthy();
  });

  it("fonte AUSENTE nunca vira problema nem pendência", () => {
    const semGoogle = base({ nome: "X", fontes: [{ chave: "google_ads", rotulo: "Google Ads", status: "ausente" }] });
    const s = montarSecoesExecutivas([semGoogle], "2026-07-27");
    expect(s.fontesComErro).toEqual([]);
    expect(s.pendenciasManuais).toEqual([]);
  });
});

describe("oportunidades — só com dado medido", () => {
  it("produto em alta da UMA (receita real) entra; sem receita não inventa nada", () => {
    const s = montarSecoesExecutivas([baesh, uma, ultra, arka], "2026-07-27");
    expect(s.oportunidades.find((o) => o.nome === "UMA")?.texto).toMatch(/Vestido/);
    expect(s.oportunidades.find((o) => o.nome === "Ultra Malhas")).toBeUndefined();
  });
});

describe("rodapé + render", () => {
  it("rodapé sempre avisa que o e-mail está pausado", () => {
    const s = montarSecoesExecutivas([baesh], "2026-07-27", { lojas: { ok: 3, total: 3 }, ga4: { ok: 7, total: 8 } });
    expect(s.rodape.find((r) => r.fonte === "E-mail")?.info).toMatch(/PAUSADO/);
    const txt = renderExecutivoTexto(s);
    expect(txt).toContain("JORNALZINHO EXECUTIVO");
    expect(txt).toContain("Receita real de lojas (Woo+VNDA)");
  });

  it("portfólio vazio marca vazio=true sem quebrar", () => {
    const s = montarSecoesExecutivas([], "2026-07-27");
    expect(s.vazio).toBe(true);
    expect(s.destaques.receitaRealLojas).toBe(0);
  });
});
