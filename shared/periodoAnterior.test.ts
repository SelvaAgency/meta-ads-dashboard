/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Um selo de variação errado é pior que selo nenhum
 * ─────────────────────────────────────────────────────────────────────────────
 *  Ele fica no topo do card, em verde ou vermelho, e ninguém confere a conta.
 *  Três formas de errar, e as três produzem números que parecem certos:
 *
 *   PERÍODO QUE NÃO EXISTE   comparar 30 dias exige 60 de série, e a série tem
 *                            30. Um "0%" ali afirma estabilidade sobre dias que
 *                            ninguém mediu
 *
 *   LADOS DESIGUAIS          se o anterior tem buraco de coleta, ele cobre menos
 *                            dias e soma menos — e o selo diria "caiu" sobre uma
 *                            falha nossa
 *
 *   BASE ZERO                dividir por zero dá Infinity, que sai na tela como
 *                            percentual absurdo em vez de como ausência
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, expect, it } from "vitest";
import { compararComAnterior, variacao, type DiaComMetricas } from "./periodoAnterior";

const dia = (d: string, v: number | null): DiaComMetricas =>
  ({ dia: d, metricas: v == null ? {} : { visitas: v } });
const ler = (d: DiaComMetricas) => (typeof d.metricas.visitas === "number" ? d.metricas.visitas : null);

/** 6 dias seguidos: 01–03 é o anterior, 04–06 é o atual. */
const SERIE = [
  dia("2026-08-01", 10), dia("2026-08-02", 10), dia("2026-08-03", 10),
  dia("2026-08-04", 20), dia("2026-08-05", 20), dia("2026-08-06", 20),
];
const JANELA = { inicio: "2026-08-04", fim: "2026-08-06" };

describe("a comparação que funciona", () => {
  it("soma os mesmos 3 dias imediatamente antes", () => {
    const c = compararComAnterior(SERIE, JANELA, ler);
    expect(c.anterior).toBe(30);
    expect(c.diasAtual).toBe(3);
    expect(c.diasAnterior).toBe(3);
    expect(c.comparavel).toBe(true);
    expect(variacao(60, c)).toBe(100);
  });

  it("queda também é dita, com sinal", () => {
    const c = compararComAnterior(SERIE, { inicio: "2026-08-01", fim: "2026-08-03" }, ler);
    // Não há dias antes de 01 na série.
    expect(c.anterior).toBeNull();
    expect(variacao(30, c)).toBeNull();
  });
});

describe("saber que não dá para comparar", () => {
  /**
   * O caso do filtro de 30 dias: a série tem 30 coletas, e o anterior exigiria
   * outras 30. Sem selo é a resposta certa.
   */
  it("sem período anterior na série, devolve null", () => {
    const c = compararComAnterior(SERIE, { inicio: "2026-07-01", fim: "2026-07-30" }, ler);
    expect(c.anterior).toBeNull();
    expect(c.comparavel).toBe(false);
    expect(variacao(500, c)).toBeNull();
  });

  /**
   * Buraco no anterior: 2 dias medidos contra 3 do atual. A soma menor pode ser
   * falta de coleta, não queda — e o selo diria "caiu".
   */
  it("lados com números de dias diferentes não são comparáveis", () => {
    const comBuraco = [
      dia("2026-08-01", 10), dia("2026-08-02", null), dia("2026-08-03", 10),
      dia("2026-08-04", 20), dia("2026-08-05", 20), dia("2026-08-06", 20),
    ];
    const c = compararComAnterior(comBuraco, JANELA, ler);
    expect(c.diasAnterior).toBe(2);
    expect(c.diasAtual).toBe(3);
    expect(c.comparavel).toBe(false);
    expect(variacao(60, c)).toBeNull();
  });

  /** Infinity na tela é um percentual absurdo, não uma ausência. */
  it("base zero não vira percentual", () => {
    const zerado = [
      dia("2026-08-01", 0), dia("2026-08-02", 0), dia("2026-08-03", 0),
      dia("2026-08-04", 5), dia("2026-08-05", 5), dia("2026-08-06", 5),
    ];
    const c = compararComAnterior(zerado, JANELA, ler);
    expect(c.anterior).toBe(0);
    expect(variacao(15, c)).toBeNull();
  });

  it("valor atual ausente não compara", () => {
    expect(variacao(null, compararComAnterior(SERIE, JANELA, ler))).toBeNull();
  });
});

describe("a janela anterior é de CALENDÁRIO, não de registros", () => {
  /**
   * Contar "os N registros anteriores" esticaria a janela para trás quando
   * houvesse buraco — comparando 3 dias atuais com 3 dias espalhados por uma
   * semana, sem ninguém notar.
   */
  it("dias faltando não esticam a janela para trás", () => {
    const esparsa = [
      dia("2026-07-20", 99), // muito antes — não pode entrar
      dia("2026-08-02", 10), dia("2026-08-03", 10),
      dia("2026-08-04", 20), dia("2026-08-05", 20), dia("2026-08-06", 20),
    ];
    const c = compararComAnterior(esparsa, JANELA, ler);
    // Só 02 e 03 caem em 01–03. O 20/07 fica fora.
    expect(c.anterior).toBe(20);
    expect(c.diasAnterior).toBe(2);
  });
});
