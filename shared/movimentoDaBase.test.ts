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
import { movimentoDaBase } from "./socialSnapshot";

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
