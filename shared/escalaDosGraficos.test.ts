/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Os oito cenários que o gráfico tem que representar sem mentir
 * ─────────────────────────────────────────────────────────────────────────────
 *  O bug que originou este arquivo passou pelo desenho e só apareceu num caso
 *  real: entradas +2, saídas −2, saldo 0 — e a tela mostrava crescimento. A
 *  causa não era estética. A linha chamada "Saldo" plotava o ESTOQUE de
 *  seguidores num eixo próprio, auto escalado, o que amplifica ruído numa série
 *  quase plana. Duas grandezas sob um rótulo só.
 *
 *  A geometria saiu do componente e virou função pura justamente para estes
 *  cenários poderem ser afirmados, em vez de conferidos no olho.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, expect, it } from "vitest";
import {
  intervaloDeRotulos, pilhaDoDia,
} from "./escalaDosGraficos";

/*
 * ── Os quatro cenários do movimento saíram daqui ───────────────────────────
 * Eles exercitavam `escalaDoMovimento`, que sustentava o gráfico de entradas ×
 * saídas × saldo. Esse gráfico foi substituído em 18/08/2026 pelo movimento
 * diário — uma série só, a variação líquida — depois que o diagnóstico refutou a
 * hipótese de que FOLLOWER/NON_FOLLOWER fossem os dois fluxos.
 *
 * Os cenários equivalentes da série nova (zero no meio, só alta, só queda, tudo
 * parado) vivem em `shared/movimentoDiario.test.ts`, ao lado da função que eles
 * testam.
 */

describe("ativações — os quatro cenários", () => {
  const ORDEM = ["STORY", "FEED", "REELS"] as const;

  it("3 posts / 32 stories / 2 reels → três segmentos, total 37", () => {
    const { segmentos, total } = pilhaDoDia({ FEED: 3, STORY: 32, REELS: 2 }, ORDEM);
    expect(total).toBe(37);
    expect(segmentos.map((s) => s.tipo)).toEqual(["STORY", "FEED", "REELS"]);
    expect(segmentos.map((s) => s.valor)).toEqual([32, 3, 2]);
  });

  /** Tipo com zero não vira retângulo invisível — nem promessa na legenda. */
  it("0 posts / 5 stories / 0 reels → um segmento só", () => {
    const { segmentos, total } = pilhaDoDia({ FEED: 0, STORY: 5, REELS: 0 }, ORDEM);
    expect(total).toBe(5);
    expect(segmentos).toHaveLength(1);
    expect(segmentos[0].tipo).toBe("STORY");
  });

  it("5 posts / 0 stories / 3 reels → pula o do meio sem deixar buraco", () => {
    const { segmentos } = pilhaDoDia({ FEED: 5, STORY: 0, REELS: 3 }, ORDEM);
    expect(segmentos.map((s) => s.tipo)).toEqual(["FEED", "REELS"]);
    // O primeiro começa na base e o último termina no topo — sem fresta.
    expect(segmentos[0].de).toBe(0);
    expect(segmentos[segmentos.length - 1].ate).toBe(1);
  });

  /** Dia zerado não some do eixo — ele só não desenha barra. */
  it("0 / 0 / 0 → nenhum segmento, e total zero", () => {
    const { segmentos, total } = pilhaDoDia({ FEED: 0, STORY: 0, REELS: 0 }, ORDEM);
    expect(segmentos).toEqual([]);
    expect(total).toBe(0);
  });
});

describe("a pilha soma exatamente a barra", () => {
  /**
   * Somar frações uma a uma deixa fresta no topo com valores grandes, e a barra
   * passa a parecer menor que o valor dela. O último segmento termina em 1 por
   * construção.
   */
  it("o topo fecha em 1, sem sobra de arredondamento", () => {
    const { segmentos } = pilhaDoDia({ FEED: 7, STORY: 11, REELS: 13 }, ["STORY", "FEED", "REELS"] as const);
    expect(segmentos[segmentos.length - 1].ate).toBe(1);
    // E não há vão entre um segmento e o próximo.
    for (let i = 1; i < segmentos.length; i++) {
      expect(segmentos[i].de).toBeCloseTo(segmentos[i - 1].ate, 10);
    }
  });

  it("só o de cima arredonda", () => {
    const { segmentos } = pilhaDoDia({ FEED: 2, STORY: 3 }, ["STORY", "FEED"] as const);
    expect(segmentos.filter((s) => s.topo)).toHaveLength(1);
    expect(segmentos[segmentos.length - 1].topo).toBe(true);
  });
});

describe("os rótulos de data cabem", () => {
  /** Trinta datas lado a lado viram mancha. */
  it("série longa em espaço curto pula rótulos", () => {
    expect(intervaloDeRotulos(30, 700)).toBeGreaterThan(1);
  });

  /** Com sete dias todas cabem — forçar "de cinco em cinco" esconderia quatro. */
  it("série curta mostra todas", () => {
    expect(intervaloDeRotulos(7, 700)).toBe(1);
  });

  it("um ponto só não quebra", () => {
    expect(intervaloDeRotulos(1, 700)).toBe(1);
  });
});
