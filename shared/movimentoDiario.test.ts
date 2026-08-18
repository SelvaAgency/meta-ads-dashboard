/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  A soma das barras é a variação do período — e isso é provado, não prometido
 * ─────────────────────────────────────────────────────────────────────────────
 *  O gráfico fica ao lado do número grande. Se as barras não somarem esse
 *  número, os dois estão descrevendo coisas diferentes sob o mesmo título — e
 *  ninguém confere sete subtrações de cabeça para descobrir.
 *
 *  O jeito de isso quebrar não é um erro de sinal: é alguém filtrar um dia
 *  "estranho" da série do gráfico e não do total. Por isso `fecha` existe.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, expect, it } from "vitest";
import { escalaDaVariacao, movimentoDiario, type AmostraDoTotal } from "./movimentoDiario";

const d = (dia: string, total: number | null): AmostraDoTotal => ({ dia, total });

/** Uma semana de snapshots, com alta, queda e um dia parado. */
const SEMANA = [
  d("2026-08-12", 1000),
  d("2026-08-13", 1011),
  d("2026-08-14", 1015),
  d("2026-08-15", 1019),
  d("2026-08-16", 1024),
  d("2026-08-17", 1021),
  d("2026-08-18", 1021),
];

describe("a variação diária sai de dois snapshots", () => {
  it("cada dia é a diferença para a medição anterior", () => {
    const m = movimentoDiario(SEMANA);
    expect(m.dias.map((x) => x.variacao)).toEqual([null, 11, 4, 4, 5, -3, 0]);
  });

  /** O primeiro dia não tem de onde subtrair — e 0 ali diria "ficou parado". */
  it("o primeiro dia medido não tem variação", () => {
    expect(movimentoDiario(SEMANA).dias[0].variacao).toBeNull();
  });

  /** Zero MEDIDO é dado: a base não se moveu naquele dia. */
  it("variação zero é medição, e não ausência", () => {
    const ultimo = movimentoDiario(SEMANA).dias.at(-1)!;
    expect(ultimo.variacao).toBe(0);
    expect(ultimo.dia).toBe("2026-08-18");
  });

  it("um snapshot só não produz variação nenhuma", () => {
    const m = movimentoDiario([d("2026-08-12", 1000)]);
    expect(m.dias).toHaveLength(1);
    expect(m.variacaoDoPeriodo).toBeNull();
    expect(m.fecha).toBeNull();
  });

  it("sem nenhuma medição, tudo é nulo e nada quebra", () => {
    expect(movimentoDiario([d("2026-08-12", null)])).toMatchObject({
      dias: [], soma: null, variacaoDoPeriodo: null, fecha: null, diasMedidos: 0,
    });
  });
});

describe("a conferência que liga o gráfico ao número grande", () => {
  it("a soma das variações é a variação do período", () => {
    const m = movimentoDiario(SEMANA);
    expect(m.soma).toBe(21);                 // 11+4+4+5−3+0
    expect(m.variacaoDoPeriodo).toBe(21);    // 1021 − 1000
    expect(m.fecha).toBe(true);
  });

  /** Vale para queda líquida também — não é sorte de série que só cresce. */
  it("fecha quando o período é de queda", () => {
    const m = movimentoDiario([
      d("2026-08-12", 1000), d("2026-08-13", 980), d("2026-08-14", 995),
    ]);
    expect(m.soma).toBe(-5);
    expect(m.variacaoDoPeriodo).toBe(-5);
    expect(m.fecha).toBe(true);
  });

  /**
   * Buraco de coleta NÃO quebra a identidade: a diferença entre 12 e 15 cobre
   * três dias, e telescopa igual. O que muda é o significado da barra, e é isso
   * que `diasCobertos` carrega até a tela.
   */
  it("buraco de coleta continua fechando, mas a barra é marcada", () => {
    const m = movimentoDiario([
      d("2026-08-12", 1000),
      d("2026-08-13", null),
      d("2026-08-14", null),
      d("2026-08-15", 1030),
      d("2026-08-16", 1032),
    ]);
    expect(m.dias.map((x) => x.dia)).toEqual(["2026-08-12", "2026-08-15", "2026-08-16"]);
    expect(m.dias[1]).toMatchObject({ variacao: 30, diasCobertos: 3 });
    expect(m.dias[2]).toMatchObject({ variacao: 2, diasCobertos: 1 });
    expect(m.diasComBuraco).toBe(1);
    expect(m.fecha).toBe(true);
    expect(m.soma).toBe(32);
    expect(m.variacaoDoPeriodo).toBe(32);
  });

  /** Dia sem medição é pulado, e não zerado — zero criaria queda e alta falsas. */
  it("dia não medido não vira zero", () => {
    const m = movimentoDiario([
      d("2026-08-12", 1000), d("2026-08-13", null), d("2026-08-14", 1005),
    ]);
    expect(m.dias.map((x) => x.variacao)).toEqual([null, 5]);
    expect(m.dias.some((x) => x.dia === "2026-08-13")).toBe(false);
  });

  /** A ordem de entrada não importa: a série é ordenada por dia. */
  it("amostras fora de ordem não invertem o sinal", () => {
    const m = movimentoDiario([...SEMANA].reverse());
    expect(m.dias.map((x) => x.variacao)).toEqual([null, 11, 4, 4, 5, -3, 0]);
    expect(m.fecha).toBe(true);
  });
});

describe("o zero fica onde a série manda", () => {
  it("com altas e quedas, o zero divide na proporção real", () => {
    const e = escalaDaVariacao(movimentoDiario(SEMANA).dias);
    expect(e.acima).toBe(11);
    expect(e.abaixo).toBe(3);
    expect(e.fracaoDoZero).toBeCloseTo(11 / 14, 5);
  });

  /** Só crescimento: o zero encosta na base e as barras usam a altura inteira. */
  it("sem quedas, o zero vai para a base", () => {
    const e = escalaDaVariacao(movimentoDiario([
      d("2026-08-12", 100), d("2026-08-13", 110),
    ]).dias);
    expect(e.abaixo).toBe(0);
    expect(e.fracaoDoZero).toBe(1);
  });

  it("só quedas: o zero vai para o topo", () => {
    const e = escalaDaVariacao(movimentoDiario([
      d("2026-08-12", 100), d("2026-08-13", 90),
    ]).dias);
    expect(e.acima).toBe(1);
    expect(e.abaixo).toBe(10);
    expect(e.fracaoDoZero).toBeCloseTo(1 / 11, 5);
  });

  /** Série toda parada não pode dividir por zero. */
  it("tudo zerado dá gráfico plano, sem NaN", () => {
    const e = escalaDaVariacao(movimentoDiario([
      d("2026-08-12", 100), d("2026-08-13", 100),
    ]).dias);
    expect(e.acima).toBe(1);
    expect(e.abaixo).toBe(0);
    expect(Number.isFinite(e.fracaoDoZero)).toBe(true);
  });
});
