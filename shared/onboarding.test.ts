/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Datas da trilha de onboarding
 * ─────────────────────────────────────────────────────────────────────────────
 *  Os checkpoints são derivados do primeiro dia. Derivar parece trivial até a
 *  data cair num mês curto, num fim de semana, ou até alguém usar `new Date`
 *  local e a data andar um dia para trás em São Paulo — que é exatamente o
 *  motivo de `semana` ser VARCHAR nas Prioridades, e de tudo aqui ser UTC.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect } from "vitest";
import { checkpointsDaTrilha, sextaDaSemana, somarDias, somarMeses, progresso } from "./onboarding";

describe("aritmética de dias", () => {
  it("soma sem escorregar no fuso", () => {
    expect(somarDias("2026-08-31", 30)).toBe("2026-09-30");
    expect(somarDias("2026-08-31", 0)).toBe("2026-08-31");
  });

  it("atravessa a virada do ano", () => {
    expect(somarDias("2026-12-30", 5)).toBe("2027-01-04");
  });
});

describe("somarMeses", () => {
  it("cai no mesmo dia do mês quando ele existe", () => {
    expect(somarMeses("2026-08-31", 6)).toBe("2027-02-28");
  });

  /**
   * 31/08 + 6 meses cai em fevereiro, que não tem dia 31. Sem o teto do último
   * dia do mês, a data transbordaria para março — e o checkpoint de ~6 meses
   * apareceria no mês errado, calado.
   */
  it("não transborda para o mês seguinte em mês curto", () => {
    expect(somarMeses("2026-01-31", 1)).toBe("2026-02-28");
    expect(somarMeses("2028-01-31", 1)).toBe("2028-02-29"); // bissexto
  });
});

describe("sextaDaSemana", () => {
  it("de uma segunda, é a sexta da mesma semana", () => {
    expect(sextaDaSemana("2026-08-31")).toBe("2026-09-04"); // segunda → sexta
  });

  it("de uma quarta, continua sendo a sexta da mesma semana", () => {
    expect(sextaDaSemana("2026-09-02")).toBe("2026-09-04");
  });

  /** Quem começa numa sexta fecha a "primeira semana" no mesmo dia — e não sete dias depois. */
  it("de uma sexta, é ela mesma", () => {
    expect(sextaDaSemana("2026-09-04")).toBe("2026-09-04");
  });
});

describe("checkpoints", () => {
  const cps = checkpointsDaTrilha("2026-08-31");

  it("são cinco, na ordem do documento", () => {
    expect(cps.map((c) => c.chave)).toEqual(["dia1", "semana1", "d30", "d60", "m6"]);
  });

  it("o primeiro é o próprio dia de início", () => {
    expect(cps[0].data).toBe("2026-08-31");
  });

  it("nunca andam para trás", () => {
    const datas = cps.map((c) => c.data);
    expect([...datas].sort()).toEqual(datas);
  });
});

describe("progresso", () => {
  it("lista vazia é 0%, e não NaN", () => {
    expect(progresso([])).toEqual({ feitos: 0, total: 0, pct: 0 });
  });

  it("conta só o que está feito", () => {
    expect(progresso([{ feito: true }, { feito: false }, { feito: true }, { feito: false }])).toEqual({ feitos: 2, total: 4, pct: 50 });
  });
});
