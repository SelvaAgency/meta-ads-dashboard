/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Os eventos de conversão de UM cliente
 * ─────────────────────────────────────────────────────────────────────────────
 *  A distinção central: "—" e "0" dizem coisas opostas. Traço é lacuna de
 *  tagueamento (conversa com quem implantou o GA4); zero é fato sobre o período
 *  (conversa sobre a campanha).
 *
 *  Esta suíte substituiu uma que somava os eventos entre TODOS os clientes. A
 *  soma media a composição da carteira, não performance: `whatsapp_click` é a
 *  conversão central de um institucional e irrelevante numa loja.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, expect, it } from "vitest";
import {
  GRUPOS_DE_EVENTO, ROTULO_EVENTO, eventosDoCliente, participacaoNasSessoes,
  type EventosGA4,
} from "./eventosDoCliente";

const snap = (eventos: EventosGA4 | null, dia = "2026-08-19") =>
  ({ dia, metricsJson: { eventos } });
const ev = (atual: number | null, anterior: number | null = null) => ({ atual, anterior });

describe("os dois grupos", () => {
  it("Contato e Compra são jornadas separadas", () => {
    // Sem seta entre elas: quem preenche formulário não "avança" para o
    // carrinho, e uma sequência única afirmaria isso.
    expect(GRUPOS_DE_EVENTO.map((g) => g.chave)).toEqual(["contato", "compra"]);
    expect(GRUPOS_DE_EVENTO[0].eventos).toEqual(["form_start", "whatsapp_click"]);
  });

  it("a ordem do funil de compra é a real da precedência do GA4", () => {
    expect(GRUPOS_DE_EVENTO[1].eventos).toEqual(["add_to_cart", "begin_checkout", "purchase"]);
  });

  it("todo evento tem rótulo curto", () => {
    for (const g of GRUPOS_DE_EVENTO) {
      for (const e of g.eventos) expect(ROTULO_EVENTO[e]).toBeTruthy();
    }
  });
});

describe("ausente e zero", () => {
  it("evento que a propriedade NÃO registra é null e não entra em registrados", () => {
    const r = eventosDoCliente(snap({ form_start: ev(10) }));
    const wa = r.leituras.find((l) => l.evento === "whatsapp_click")!;
    expect(wa.total).toBeNull();
    expect(wa.registrado).toBe(false);
    expect(r.registrados.map((l) => l.evento)).toEqual(["form_start"]);
  });

  it("zero MEDIDO é registrado, e aparece na faixa", () => {
    const r = eventosDoCliente(snap({ whatsapp_click: ev(0) }));
    const wa = r.leituras.find((l) => l.evento === "whatsapp_click")!;
    expect(wa.total).toBe(0);
    expect(wa.registrado).toBe(true);
    expect(r.registrados).toHaveLength(1);
  });

  it("propriedade sem nenhum dos acompanhados é dita, e não confundida com sem coleta", () => {
    const r = eventosDoCliente(snap({}));
    expect(r.nenhumRegistrado).toBe(true);
    expect(r.semColeta).toBe(false);
  });

  it("snapshot anterior à coleta de eventos é 'sem coleta'", () => {
    // Diferente de uma propriedade que simplesmente não registra nenhum deles.
    const r = eventosDoCliente(snap(null));
    expect(r.semColeta).toBe(true);
    expect(r.nenhumRegistrado).toBe(true);
  });

  it("sem snapshot nenhum não quebra", () => {
    const r = eventosDoCliente(null);
    expect(r.semColeta).toBe(true);
    expect(r.leituras).toHaveLength(5);
    expect(r.dia).toBeNull();
  });
});

describe("a variação", () => {
  it("compara com o período anterior quando ele existe", () => {
    const r = eventosDoCliente(snap({ purchase: ev(12, 10) }));
    expect(r.leituras.find((l) => l.evento === "purchase")!.variacao).toBeCloseTo(20, 6);
  });

  it("queda devolve percentual negativo", () => {
    const r = eventosDoCliente(snap({ form_start: ev(8, 10) }));
    expect(r.leituras.find((l) => l.evento === "form_start")!.variacao).toBeCloseTo(-20, 6);
  });

  it("base anterior ZERO não vira variação infinita", () => {
    const r = eventosDoCliente(snap({ purchase: ev(5, 0) }));
    expect(r.leituras.find((l) => l.evento === "purchase")!.variacao).toBeNull();
  });

  it("sem base anterior, o número aparece sem variação", () => {
    const r = eventosDoCliente(snap({ purchase: ev(5) }));
    const p = r.leituras.find((l) => l.evento === "purchase")!;
    expect(p.total).toBe(5);
    expect(p.variacao).toBeNull();
  });
});

describe("a janela e a data", () => {
  it("a janela vem declarada — 7d é o padrão", () => {
    expect(eventosDoCliente(snap({})).janela).toBe("7d");
    expect(eventosDoCliente(snap({}), "30d").janela).toBe("30d");
  });

  it("a data da coleta viaja junto", () => {
    expect(eventosDoCliente(snap({}, "2026-08-17")).dia).toBe("2026-08-17");
  });
});

describe("participação nas sessões", () => {
  it("calcula sobre o denominador medido", () => {
    expect(participacaoNasSessoes(50, 1000)).toBeCloseTo(5, 6);
  });

  it("sem sessões medidas devolve null — e não zero", () => {
    // Uma taxa sobre denominador ausente pareceria medida e não seria.
    expect(participacaoNasSessoes(50, null)).toBeNull();
    expect(participacaoNasSessoes(50, undefined)).toBeNull();
    expect(participacaoNasSessoes(50, 0)).toBeNull();
  });

  it("evento não registrado não vira participação zero", () => {
    expect(participacaoNasSessoes(null, 1000)).toBeNull();
  });

  it("zero medido sobre base real é zero por cento", () => {
    expect(participacaoNasSessoes(0, 1000)).toBe(0);
  });
});
