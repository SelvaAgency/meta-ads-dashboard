/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Os cinco eventos do GA4 — e a diferença entre "não registra" e "deu zero"
 * ─────────────────────────────────────────────────────────────────────────────
 *  A distinção decide se a célula mostra "—" ou "0", e as duas dizem coisas
 *  opostas sobre a implantação do tagueamento: uma é lacuna nossa, a outra é
 *  fato sobre o período.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, expect, it } from "vitest";
import {
  GRUPOS_DE_EVENTO, ROTULO_EVENTO, eventosDoPortfolio,
  type ClientePanorama, type EventosGA4,
} from "./panoramaLogic";

const conta = (id: number, eventos: EventosGA4 | null, dia = "2026-08-19"): ClientePanorama => ({
  accountId: id, nome: `C${id}`, fontes: [], loja: null,
  uptime: null, seguranca: null, pagespeed: null,
  ga4_7d: { dia, metricsJson: { sessions: 100, eventos } },
  ga4_30d: null, loja_7d: null, loja_30d: null,
});
const ev = (atual: number | null, anterior: number | null = null) => ({ atual, anterior });

describe("os dois grupos", () => {
  it("Contato e Compra são jornadas separadas", () => {
    // Sem seta entre elas: nada no dado sustenta que quem preenche formulário
    // depois adiciona ao carrinho.
    expect(GRUPOS_DE_EVENTO.map((g) => g.chave)).toEqual(["contato", "compra"]);
    expect(GRUPOS_DE_EVENTO[0].eventos).toEqual(["form_start", "whatsapp_click"]);
    expect(GRUPOS_DE_EVENTO[1].eventos).toEqual(["add_to_cart", "begin_checkout", "purchase"]);
  });

  it("a ordem do funil de compra é a real, e não a do pedido", () => {
    // carrinho → checkout → compra. É a precedência que o GA4 registra.
    expect(GRUPOS_DE_EVENTO[1].eventos).toEqual(["add_to_cart", "begin_checkout", "purchase"]);
  });

  it("todo evento tem rótulo curto, e o técnico não some", () => {
    for (const g of GRUPOS_DE_EVENTO) {
      for (const e of g.eventos) expect(ROTULO_EVENTO[e]).toBeTruthy();
    }
  });
});

describe("a soma do portfólio", () => {
  it("soma entre os clientes que registram, e conta o denominador", () => {
    const r = eventosDoPortfolio([
      conta(1, { form_start: ev(10), purchase: ev(2) }),
      conta(2, { form_start: ev(32), purchase: ev(7) }),
    ]);
    const fs = r.eventos.find((e) => e.evento === "form_start")!;
    expect(fs.total).toBe(42);
    expect(fs.sites).toBe(2);
  });

  it("evento que NINGUÉM registra é null, e não zero", () => {
    // "—" na tela: a propriedade não tem o evento. Diferente de "aconteceu
    // zero vez", que é informação sobre o período.
    const r = eventosDoPortfolio([conta(1, { form_start: ev(10) })]);
    const wa = r.eventos.find((e) => e.evento === "whatsapp_click")!;
    expect(wa.total).toBeNull();
    expect(wa.sites).toBe(0);
  });

  it("zero MEDIDO continua zero", () => {
    const r = eventosDoPortfolio([conta(1, { whatsapp_click: ev(0) })]);
    const wa = r.eventos.find((e) => e.evento === "whatsapp_click")!;
    expect(wa.total).toBe(0);
    expect(wa.sites).toBe(1);
  });

  it("snapshot antigo, sem o campo, não quebra", () => {
    const r = eventosDoPortfolio([conta(1, null)]);
    expect(r.eventos.every((e) => e.total === null)).toBe(true);
    expect(r.sitesComGA4).toBe(1);
  });

  it("cliente sem GA4 não entra na contagem de sites", () => {
    const semGa4 = { ...conta(9, null), ga4_7d: null };
    expect(eventosDoPortfolio([semGa4]).sitesComGA4).toBe(0);
  });
});

describe("a variação", () => {
  it("compara as duas somas quando TODOS têm base anterior", () => {
    const r = eventosDoPortfolio([
      conta(1, { purchase: ev(6, 5) }),
      conta(2, { purchase: ev(6, 5) }),
    ]);
    const p = r.eventos.find((e) => e.evento === "purchase")!;
    expect(p.anterior).toBe(10);
    expect(p.variacao).toBeCloseTo(20, 6);
  });

  it("se UM cliente não tem base anterior, a variação se recusa", () => {
    // Somar um cliente sem base com outro que tem compararia populações
    // diferentes — o total subiria por mudança de amostra.
    const r = eventosDoPortfolio([
      conta(1, { purchase: ev(6, 5) }),
      conta(2, { purchase: ev(6, null) }),
    ]);
    const p = r.eventos.find((e) => e.evento === "purchase")!;
    expect(p.total).toBe(12);
    expect(p.anterior).toBeNull();
    expect(p.variacao).toBeNull();
  });

  it("base anterior ZERO não vira variação infinita", () => {
    const r = eventosDoPortfolio([conta(1, { purchase: ev(5, 0) })]);
    expect(r.eventos.find((e) => e.evento === "purchase")!.variacao).toBeNull();
  });

  it("queda devolve percentual negativo", () => {
    const r = eventosDoPortfolio([conta(1, { form_start: ev(8, 10) })]);
    expect(r.eventos.find((e) => e.evento === "form_start")!.variacao).toBeCloseTo(-20, 6);
  });
});

describe("a janela viaja com o número", () => {
  it("7d é o padrão e vem declarada", () => {
    expect(eventosDoPortfolio([conta(1, { purchase: ev(1) })]).janela).toBe("7d");
  });

  it("30d lê o outro snapshot, e não mistura os dois", () => {
    const c: ClientePanorama = {
      ...conta(1, { purchase: ev(3) }),
      ga4_30d: { dia: "2026-08-19", metricsJson: { eventos: { purchase: ev(40) } } },
    };
    expect(eventosDoPortfolio([c], "30d").eventos.find((e) => e.evento === "purchase")!.total).toBe(40);
    expect(eventosDoPortfolio([c], "7d").eventos.find((e) => e.evento === "purchase")!.total).toBe(3);
  });

  it("a data é a mais recente entre os snapshots — a coleta não é simultânea", () => {
    const r = eventosDoPortfolio([
      conta(1, { purchase: ev(1) }, "2026-08-17"),
      conta(2, { purchase: ev(1) }, "2026-08-19"),
    ]);
    expect(r.dia).toBe("2026-08-19");
  });

  it("sem nenhum snapshot, não inventa data", () => {
    expect(eventosDoPortfolio([]).dia).toBeNull();
  });
});
