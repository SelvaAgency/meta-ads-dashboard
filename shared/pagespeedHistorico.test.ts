/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  A mediana existe para o ranking não virar de ponta-cabeça
 * ─────────────────────────────────────────────────────────────────────────────
 *  Caso real: a UMA marcou ~90, ~41 no dia seguinte, e voltou ao topo na
 *  remedição. Com a última medição mandando no ranking, um teste sintético
 *  instável pintava de vermelho um site que costuma ser bom.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, expect, it } from "vitest";
import {
  DESVIO_NOTAVEL, JANELA_PAGESPEED_DIAS, PISO_MEDICOES,
  faixaDoLighthouse, historicoPagespeed, mediana, textoDaBase, valorDeRanking,
} from "./pagespeedHistorico";

/** Série em ordem cronológica, um ponto por dia. */
const serie = (...scores: number[]) =>
  scores.map((score, i) => ({ dia: `2026-08-${String(13 + i).padStart(2, "0")}`, score }));

describe("mediana", () => {
  it("ímpar pega o do meio, par a média dos dois", () => {
    expect(mediana([3, 1, 2])).toBe(2);
    expect(mediana([1, 2, 3, 4])).toBe(2.5);
  });
  it("lista vazia é null, e não zero", () => {
    expect(mediana([])).toBeNull();
  });
});

describe("o caso que motivou a mudança", () => {
  const uma = serie(91, 89, 92, 90, 41, 90);

  it("a mediana ignora a medição anômala", () => {
    const h = historicoPagespeed(uma);
    expect(h.mediana).toBe(90);
    // A média seria arrastada 8 pontos pelo mesmo valor — é a diferença entre
    // as duas que justifica ter escolhido a mediana para o ranking.
    expect(h.media!).toBeCloseTo(82.17, 1);
  });

  it("o ranking usa a mediana, não a última", () => {
    const h = historicoPagespeed(serie(91, 89, 92, 90, 90, 41));
    expect(h.ultima).toBe(41);
    expect(valorDeRanking(h)).toBe(90);
  });

  it("a última medição continua visível — degradação recente importa", () => {
    const h = historicoPagespeed(serie(91, 89, 92, 90, 90, 41));
    expect(h.ultima).toBe(41);
    expect(h.ultimoDia).toBe("2026-08-18");
  });

  it("o desvio aponta a anomalia sem transformá-la em problema estrutural", () => {
    const h = historicoPagespeed(serie(91, 89, 92, 90, 90, 41));
    expect(h.desvio).toBe(-49);
    expect(h.desvioNotavel).toBe(true);
  });

  it("um site que COSTUMA ir mal não tem desvio notável", () => {
    // A distinção inteira: aqui a evidência é de problema recorrente.
    const h = historicoPagespeed(serie(45, 47, 44, 48, 41));
    expect(h.mediana).toBe(45);
    expect(h.desvioNotavel).toBe(false);
  });

  it("oscilação abaixo do limiar não vira sinal", () => {
    const h = historicoPagespeed(serie(90, 88, 92, 90, 90 - (DESVIO_NOTAVEL - 1)));
    expect(h.desvioNotavel).toBe(false);
  });
});

describe("o piso de medições", () => {
  it(`abaixo de ${PISO_MEDICOES} não há mediana`, () => {
    // Com duas, mediana e média são o mesmo número e nenhum é tendência.
    const h = historicoPagespeed(serie(90, 41));
    expect(h.mediana).toBeNull();
    expect(h.temBase).toBe(false);
    expect(h.media).toBeNull();
    expect(h.melhor).toBeNull();
  });

  it("exatamente no piso já produz leitura", () => {
    const h = historicoPagespeed(serie(90, 41, 88));
    expect(h.temBase).toBe(true);
    expect(h.mediana).toBe(88);
  });

  it("sem base, o ranking cai na última — o site não some da lista", () => {
    // Escondê-lo o tiraria da vista justamente enquanto ninguém sabe como vai.
    const h = historicoPagespeed(serie(90, 41));
    expect(valorDeRanking(h)).toBe(41);
    expect(textoDaBase(h)).toContain("sem base histórica");
  });

  it("uma medição só não vira 'melhor 41 · pior 41'", () => {
    const h = historicoPagespeed(serie(41));
    expect(h.melhor).toBeNull();
    expect(h.pior).toBeNull();
    expect(h.ultima).toBe(41);
  });

  it("série vazia não inventa nada", () => {
    const h = historicoPagespeed([]);
    expect(valorDeRanking(h)).toBeNull();
    expect(h.quantidade).toBe(0);
    expect(textoDaBase(h)).toBe("sem medição");
  });
});

describe("a frase da base é fiel ao dado", () => {
  it("conta MEDIÇÕES, e não dias", () => {
    // "média dos últimos 7 dias" prometeria uma cobertura que o dado não tem:
    // a coleta falha e a remedição manual sobrescreve o dia.
    const t = textoDaBase(historicoPagespeed(serie(90, 88, 91, 92, 89, 90)));
    expect(t).toContain("6 medições");
    expect(t).toContain(`${JANELA_PAGESPEED_DIAS}d`);
    expect(t).not.toContain("média");
  });

  it("singular quando é uma só", () => {
    expect(textoDaBase(historicoPagespeed(serie(41)))).toContain("1 medição");
  });
});

describe("ordem e limpeza da série", () => {
  it("ordena por dia, mesmo recebendo fora de ordem", () => {
    const h = historicoPagespeed([
      { dia: "2026-08-19", score: 41 },
      { dia: "2026-08-13", score: 91 },
      { dia: "2026-08-16", score: 90 },
    ]);
    expect(h.medicoes.map((m) => m.score)).toEqual([91, 90, 41]);
    expect(h.ultima).toBe(41);
  });

  it("score não-finito é descartado, e não vira zero", () => {
    const h = historicoPagespeed([
      { dia: "2026-08-13", score: 90 },
      { dia: "2026-08-14", score: NaN },
      { dia: "2026-08-15", score: 88 },
    ]);
    expect(h.quantidade).toBe(2);
  });
});

describe("a faixa vem do Lighthouse, e não de um corte nosso", () => {
  it("os três cortes são os do próprio Lighthouse", () => {
    expect(faixaDoLighthouse(90)).toBe("bom");
    expect(faixaDoLighthouse(89)).toBe("medio");
    expect(faixaDoLighthouse(50)).toBe("medio");
    expect(faixaDoLighthouse(49)).toBe("ruim");
  });
  it("sem valor não é 'ruim'", () => {
    expect(faixaDoLighthouse(null)).toBe("vazio");
  });
});
