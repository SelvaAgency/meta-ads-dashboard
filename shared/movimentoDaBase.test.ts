/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Entradas e saídas sem o breakdown que ainda não foi provado
 * ─────────────────────────────────────────────────────────────────────────────
 *  A tela mostrava "–" nos dois campos porque a semântica de
 *  FOLLOWER/NON_FOLLOWER segue em validação. Mas existe um caminho que não passa
 *  por ela: `follower_count` é métrica documentada da Meta — novos seguidores do
 *  dia, contagem BRUTA de entradas — e o saldo é a diferença entre duas
 *  fotografias. Com os dois, as saídas caem por identidade.
 *
 *  O risco desse atalho é publicar uma derivação que a aritmética não sustenta.
 *  Se as entradas somadas forem MENORES que o crescimento da base, a premissa
 *  está errada — e o resultado seria um "saíram: -12", que parece dado e não é.
 *  É esse caso que a metade de baixo deste arquivo reprova.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, expect, it } from "vitest";
import { movimentoDaBase, movimentoPorDia } from "./socialSnapshot";

const amostra = (dia: string, total: number | null) => ({ dia, total, follower: null, naoSeguidor: null });

describe("a derivação que funciona", () => {
  it("entradas somam follower_count; saídas caem por identidade", () => {
    const m = movimentoDaBase(
      [amostra("2026-08-10", 1000), amostra("2026-08-13", 1082)],
      [30, 25, 27],
    );
    expect(m.entradas).toBe(82 + 0); // 30+25+27
    expect(m.saldo).toBe(82);
    // saídas = 82 entradas − 82 de saldo = 0: cresceu exatamente o que entrou.
    expect(m.saidas).toBe(0);
    expect(m.origem).toBe("follower_count");
  });

  it("base que perde gente mostra as saídas", () => {
    const m = movimentoDaBase(
      [amostra("2026-08-10", 1000), amostra("2026-08-13", 1044)],
      [40, 22],
    );
    expect(m.entradas).toBe(62);
    expect(m.saldo).toBe(44);
    expect(m.saidas).toBe(18);
  });

  it("o saldo atual é a última fotografia, não a soma", () => {
    const m = movimentoDaBase(
      [amostra("2026-08-10", 9000), amostra("2026-08-13", 9464)], [200, 300]);
    expect(m.saldoAtual).toBe(9464);
  });
});

describe("saber quando a derivação não se sustenta", () => {
  /**
   * A base cresceu 100 e só 40 entraram: impossível se `follower_count` é
   * entrada bruta. A premissa está errada, e o número derivado seria -60.
   */
  it("saldo maior que as entradas devolve null, e não um negativo", () => {
    const m = movimentoDaBase(
      [amostra("2026-08-10", 1000), amostra("2026-08-13", 1100)], [20, 20]);
    expect(m.saidas).toBeNull();
    expect(m.entradas).toBe(40);
    expect(m.motivo).toContain("não podem ser derivadas");
    // O saldo continua confiável — ele não depende da premissa.
    expect(m.saldo).toBe(100);
  });

  it("sem follower_count medido, só o saldo aparece", () => {
    const m = movimentoDaBase(
      [amostra("2026-08-10", 1000), amostra("2026-08-13", 1080)], [null, null]);
    expect(m.entradas).toBeNull();
    expect(m.saidas).toBeNull();
    expect(m.saldo).toBe(80);
    expect(m.origem).toBe("apenas_saldo");
  });

  /** Uma fotografia só dá o total atual, mas não dá variação nenhuma. */
  it("uma coleta só dá saldo atual sem saldo do período", () => {
    const m = movimentoDaBase([amostra("2026-08-13", 1000)], [30]);
    expect(m.saldoAtual).toBe(1000);
    expect(m.saldo).toBeNull();
    expect(m.saidas).toBeNull();
    expect(m.motivo).toContain("duas coletas");
  });

  it("sem coleta nenhuma, nada é afirmado", () => {
    const m = movimentoDaBase([], []);
    expect(m.saldoAtual).toBeNull();
    expect(m.origem).toBe("sem_dados");
  });

  /** Dia sem coleta subestima as entradas — a tela precisa poder dizer isso. */
  it("conta quantos dias entraram na soma", () => {
    const m = movimentoDaBase(
      [amostra("2026-08-10", 1000), amostra("2026-08-13", 1050)], [30, null, 25]);
    expect(m.diasMedidos).toBe(2);
  });
});

describe("o movimento dia a dia, para o gráfico", () => {
  const dia = (d: string, total: number | null, novos: number | null) => ({ dia: d, total, novos });

  it("as saídas de cada dia caem pela mesma identidade", () => {
    const r = movimentoPorDia([
      dia("2026-08-10", 1000, 20),
      dia("2026-08-11", 1015, 20), // cresceu 15, entraram 20 → saíram 5
      dia("2026-08-12", 1005, 10), // caiu 10, entraram 10 → saíram 20
    ]);
    expect(r.map((x) => x.saidas)).toEqual([null, 5, 20]);
    expect(r.map((x) => x.entradas)).toEqual([20, 20, 10]);
  });

  /** Sem dia anterior não há variação, e sem variação não há o que subtrair. */
  it("o primeiro dia entra sem saída, e não com zero", () => {
    const r = movimentoPorDia([dia("2026-08-10", 1000, 30), dia("2026-08-11", 1020, 25)]);
    expect(r[0].saidas).toBeNull();
    expect(r[0].entradas).toBe(30);
  });

  /**
   * O motivo de a checagem ser por dia: no agregado, um dia impossível é
   * anulado por outro folgado e o total fecha, escondendo os dois.
   */
  it("dia em que a base cresceu mais do que entrou vira buraco, não barra negativa", () => {
    const r = movimentoPorDia([
      dia("2026-08-10", 1000, 10),
      dia("2026-08-11", 1100, 10), // cresceu 100, entraram 10 → impossível
      dia("2026-08-12", 1090, 10),
    ]);
    expect(r[1].saidas).toBeNull();
    // O dia seguinte continua sendo calculado normalmente.
    expect(r[2].saidas).toBe(20);
  });

  it("dia sem follower_count medido não inventa saída", () => {
    const r = movimentoPorDia([dia("2026-08-10", 1000, 20), dia("2026-08-11", 1010, null)]);
    expect(r[1].entradas).toBeNull();
    expect(r[1].saidas).toBeNull();
  });

  /** Buraco de coleta não pode virar variação gigante no dia seguinte. */
  it("dia sem total usa o último total conhecido como referência", () => {
    const r = movimentoPorDia([
      dia("2026-08-10", 1000, 10),
      dia("2026-08-11", null, 10),
      dia("2026-08-12", 1015, 10),
    ]);
    expect(r[1].saidas).toBeNull();
    // 1015 − 1000 = 15 de variação; entraram 10 → conta não fecha, vira buraco.
    expect(r[2].saidas).toBeNull();
  });
});
