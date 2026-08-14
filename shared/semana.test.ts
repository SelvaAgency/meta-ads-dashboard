/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  A semana errada não parece um erro — parece que os dados sumiram
 * ─────────────────────────────────────────────────────────────────────────────
 *  Dois enganos clássicos, e os dois são silenciosos:
 *
 *   FUSO      `new Date("2026-08-11").getDay()` devolve DOMINGO em São Paulo,
 *             porque a string é meia-noite UTC e o Brasil está três horas
 *             atrás. A semana inteira andaria um dia, e a tela mostraria uma
 *             semana vazia em vez de um erro
 *
 *   VIRADA    "28–3 AGO" está errado e parece certo. É o formato curto aplicado
 *             à semana que atravessa o mês, e ninguém reporta porque ninguém
 *             desconfia de um rótulo bem formatado
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, expect, it } from "vitest";
import {
  deslocarSemana, fimDaSemana, hojeISO, inicioDaSemana, posicaoDaSemana,
  rotuloDaSemana, rotuloDeDia, situacaoDaSemana,
} from "./semana";

describe("a segunda-feira da semana", () => {
  it("segunda devolve ela mesma", () => {
    expect(inicioDaSemana("2026-08-10")).toBe("2026-08-10");
  });

  it("qualquer dia da semana devolve a mesma segunda", () => {
    for (const d of ["2026-08-10", "2026-08-11", "2026-08-13", "2026-08-16"]) {
      expect(inicioDaSemana(d)).toBe("2026-08-10");
    }
  });

  /**
   * O engano do fuso, reprovado no lugar exato onde ele acontece: domingo é o
   * ÚLTIMO dia da semana aqui, e recua seis dias. Se a aritmética escorregasse
   * para o fuso local, este dia cairia na semana seguinte.
   */
  it("domingo pertence à semana que acabou, e não à que começa", () => {
    expect(inicioDaSemana("2026-08-16")).toBe("2026-08-10");
    expect(inicioDaSemana("2026-08-17")).toBe("2026-08-17");
  });

  it("atravessa a virada do mês e do ano sem tropeçar", () => {
    expect(inicioDaSemana("2026-08-01")).toBe("2026-07-27");
    expect(inicioDaSemana("2027-01-01")).toBe("2026-12-28");
  });

  it("o fim da semana é o domingo", () => {
    expect(fimDaSemana("2026-08-10")).toBe("2026-08-16");
  });
});

describe("navegar entre semanas", () => {
  it("anda para trás e para frente sem perder a segunda-feira", () => {
    expect(deslocarSemana("2026-08-10", -1)).toBe("2026-08-03");
    expect(deslocarSemana("2026-08-10", 1)).toBe("2026-08-17");
    expect(deslocarSemana("2026-08-10", -6)).toBe("2026-06-29");
  });

  /** Ir e voltar tem que cair no mesmo lugar, inclusive por cima do horário de verão. */
  it("ida e volta é identidade", () => {
    for (const s of ["2026-02-23", "2026-10-12", "2026-11-02"]) {
      expect(deslocarSemana(deslocarSemana(s, 1), -1)).toBe(s);
    }
  });
});

describe("o rótulo muda de forma quando o mês vira", () => {
  it("mesmo mês usa o formato curto", () => {
    expect(rotuloDaSemana("2026-08-10")).toBe("10–16 AGO");
  });

  /** "28–3 AGO" seria o resultado do formato curto aqui. Errado, e convincente. */
  it("meses diferentes repetem o mês nos dois lados", () => {
    expect(rotuloDaSemana("2026-07-27")).toBe("27 JUL – 2 AGO");
    expect(rotuloDaSemana("2026-12-28")).toBe("28 DEZ – 3 JAN");
  });

  it("o prazo é dia e mês, nunca 'sem prazo'", () => {
    expect(rotuloDeDia("2026-08-24")).toBe("24 AGO");
  });
});

describe("onde a semana está em relação a hoje", () => {
  const HOJE = "2026-08-13"; // quinta da semana de 10/08

  it("classifica atual, passada e futura", () => {
    expect(posicaoDaSemana("2026-08-10", HOJE)).toBe("atual");
    expect(posicaoDaSemana("2026-08-03", HOJE)).toBe("passada");
    expect(posicaoDaSemana("2026-08-17", HOJE)).toBe("futura");
  });

  /**
   * `null` na semana atual é a decisão: "esta semana" ao lado do intervalo da
   * semana atual é redundância. O rótulo só ganha função quando alguém navegou
   * para longe — que é quando dá para se perder.
   */
  it("a semana atual não ganha rótulo de situação", () => {
    expect(situacaoDaSemana("2026-08-10", HOJE)).toBeNull();
  });

  it("longe de hoje, o rótulo diz a distância", () => {
    expect(situacaoDaSemana("2026-08-03", HOJE)).toBe("semana passada");
    expect(situacaoDaSemana("2026-07-27", HOJE)).toBe("2 semanas atrás");
    expect(situacaoDaSemana("2026-08-17", HOJE)).toBe("próxima semana");
    expect(situacaoDaSemana("2026-08-31", HOJE)).toBe("daqui a 3 semanas");
  });
});

describe("hoje é o único ponto que olha o fuso", () => {
  /** 21h em São Paulo ainda é hoje; em UTC já é amanhã. */
  it("usa São Paulo, e não UTC", () => {
    expect(hojeISO(new Date("2026-08-31T23:30:00-03:00"))).toBe("2026-08-31");
    expect(hojeISO(new Date("2026-09-01T02:30:00Z"))).toBe("2026-08-31");
  });
});
