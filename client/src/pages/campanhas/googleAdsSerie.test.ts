import { describe, it, expect } from "vitest";
import { montarSerie, diasDoPeriodo, taxasDoDia, formatarMetrica, type PontoBruto } from "./googleAdsSerie";

const ponto = (dia: string, over: Partial<PontoBruto> = {}): PontoBruto => ({
  dia, custo: 0, impressoes: 0, cliques: 0, conversoes: 0, valorConversao: 0, ...over,
});

describe("dias do período", () => {
  it("inclusivo nas duas pontas", () => {
    expect(diasDoPeriodo("2026-07-15", "2026-07-17"))
      .toEqual(["2026-07-15", "2026-07-16", "2026-07-17"]);
  });

  it("um dia só", () => {
    expect(diasDoPeriodo("2026-07-15", "2026-07-15")).toEqual(["2026-07-15"]);
  });

  it("período invertido ou inválido devolve vazio, não loop", () => {
    expect(diasDoPeriodo("2026-07-17", "2026-07-15")).toEqual([]);
    expect(diasDoPeriodo("lixo", "2026-07-15")).toEqual([]);
  });

  it("atravessa virada de mês sem pular dia", () => {
    const dias = diasDoPeriodo("2026-06-29", "2026-07-02");
    expect(dias).toEqual(["2026-06-29", "2026-06-30", "2026-07-01", "2026-07-02"]);
  });
});

describe("série contínua", () => {
  it("dia sem linha vira zero nas métricas de volume — não buraco no eixo", () => {
    const s = montarSerie("2026-07-15", "2026-07-17", [
      ponto("2026-07-15", { custo: 10, impressoes: 100, cliques: 5 }),
      // 16 ausente — o Google omite dia sem veiculação
      ponto("2026-07-17", { custo: 20, impressoes: 200, cliques: 8 }),
    ]);
    expect(s).toHaveLength(3);
    expect(s[1].dia).toBe("2026-07-16");
    expect(s[1].custo).toBe(0);
    expect(s[1].impressoes).toBe(0);
  });

  it("taxa de dia sem base é NULL, nunca zero — CTR 0% sem impressão é mentira", () => {
    const s = montarSerie("2026-07-15", "2026-07-16", [
      ponto("2026-07-15", { impressoes: 100, cliques: 2, custo: 10 }),
    ]);
    const vazio = s[1];
    expect(vazio.ctr).toBeNull();
    expect(vazio.cpc).toBeNull();
    expect(vazio.cpa).toBeNull();
    expect(vazio.roas).toBeNull();
  });

  it("taxas derivadas dos números do dia", () => {
    const [p] = montarSerie("2026-07-15", "2026-07-15", [
      ponto("2026-07-15", { custo: 100, impressoes: 2000, cliques: 40, conversoes: 4, valorConversao: 500 }),
    ]);
    expect(p.ctr).toBe(2);        // 40/2000
    expect(p.cpc).toBe(2.5);      // 100/40
    expect(p.cpa).toBe(25);       // 100/4
    expect(p.roas).toBe(5);       // 500/100
  });

  it("ROAS é null sem receita — mesmo com custo", () => {
    const [p] = montarSerie("2026-07-15", "2026-07-15", [
      ponto("2026-07-15", { custo: 100, cliques: 10, impressoes: 500 }),
    ]);
    expect(p.roas).toBeNull();
  });

  /** UMA: conectada, mas R$0 no período — o painel não deve nem aparecer. */
  it("período inteiro sem veiculação devolve [] — sem eixo de zeros fingindo gráfico", () => {
    expect(montarSerie("2026-07-15", "2026-07-17", [])).toEqual([]);
    expect(montarSerie("2026-07-15", "2026-07-17", [ponto("2026-07-16")])).toEqual([]);
  });

  it("conversões sem clique ainda contam (view-through) — CPA existe, CPC não", () => {
    const [p] = montarSerie("2026-07-15", "2026-07-15", [
      ponto("2026-07-15", { custo: 50, impressoes: 1000, conversoes: 2 }),
    ]);
    expect(p.cpa).toBe(25);
    expect(p.cpc).toBeNull();
  });

  it("rótulo do eixo não passa por Date — fuso não desloca o dia", () => {
    const [p] = montarSerie("2026-07-01", "2026-07-01", [ponto("2026-07-01", { custo: 1 })]);
    expect(p.rotulo).toBe("01/07");
  });
});

describe("formatação", () => {
  it("investimento em reais; contagens em inteiro pt-BR", () => {
    expect(formatarMetrica("custo", 1234.5)).toBe("R$ 1.234,50");
    expect(formatarMetrica("cliques", 1234)).toBe("1.234");
  });

  it("tooltip de taxas mostra — onde não há base", () => {
    const [p] = montarSerie("2026-07-15", "2026-07-15", [
      ponto("2026-07-15", { custo: 10, impressoes: 100, cliques: 4 }),
    ]);
    const t = taxasDoDia(p);
    expect(t).toMatch(/CTR 4\.00%/);
    expect(t).toMatch(/CPA —/);
    expect(t).toMatch(/ROAS —/);
  });
});
