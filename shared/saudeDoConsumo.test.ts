import { describe, it, expect } from "vitest";
import {
  saudeDoConsumo, estatisticasDeChamada, razaoEntradaSaida, oportunidadesDeOtimizacao,
  mediana, compararFontes, custoPorMilhao, alertasComparativos, LIMIARES_DE_SAUDE,
  type SerieDiaria,
} from "./saudeDoConsumo";

/** Histórico plano: n dias iguais, para a régua ser previsível. */
const historico = (dias: number, entrada = 1000, saida = 200): SerieDiaria[] =>
  Array.from({ length: dias }, (_, i) => ({
    dia: `2026-08-${String(i + 1).padStart(2, "0")}`, entrada, saida, chamadas: 10,
  }));

const semEstatistica = estatisticasDeChamada([]);

describe("mediana", () => {
  it("ímpar pega o do meio, par a média dos dois", () => {
    expect(mediana([3, 1, 2])).toBe(2);
    expect(mediana([1, 2, 3, 4])).toBe(2.5);
  });
  it("lista vazia é null, e não zero", () => {
    // Zero afirmaria "as chamadas gastam nada"; null diz "não há chamadas".
    expect(mediana([])).toBeNull();
  });
});

describe("estatisticasDeChamada", () => {
  it("não acusa distorção com poucas chamadas, mesmo com extremo", () => {
    // Uma chamada gigante entre 5 pode ser só o dia que teve um relatório.
    const e = estatisticasDeChamada([100, 100, 100, 100, 100_000]);
    expect(e.chamadas).toBe(5);
    expect(e.mediaDistorcida).toBe(false);
  });
  it("acusa distorção quando média ≥ 2× mediana com amostra suficiente", () => {
    const v = [...Array(24).fill(100), 100_000, 100_000];
    const e = estatisticasDeChamada(v);
    expect(e.mediana).toBe(100);
    expect(e.media! / e.mediana!).toBeGreaterThanOrEqual(LIMIARES_DE_SAUDE.mediaSobreMediana);
    expect(e.mediaDistorcida).toBe(true);
    expect(e.maior).toBe(100_000);
    expect(e.menor).toBe(100);
  });
  it("não acusa distorção quando a média está colada na mediana", () => {
    const e = estatisticasDeChamada(Array(30).fill(1000));
    expect(e.mediaDistorcida).toBe(false);
  });
  it("descarta zeros e não-finitos, para não afundar a mediana", () => {
    expect(estatisticasDeChamada([0, NaN, 500]).chamadas).toBe(1);
  });
});

describe("razaoEntradaSaida", () => {
  it("saída zero não vira razão infinita", () => {
    expect(razaoEntradaSaida(1000, 0, historico(30)).razao).toBeNull();
  });
  it("a razão histórica vem dos totais, não da média das razões diárias", () => {
    // Um dia minúsculo com razão 100× não pode pesar igual a um dia inteiro.
    const h: SerieDiaria[] = [
      ...Array.from({ length: 7 }, (_, i) => ({ dia: `d${i}`, entrada: 1000, saida: 500, chamadas: 5 })),
      { dia: "d8", entrada: 100, saida: 1, chamadas: 1 },
    ];
    const r = razaoEntradaSaida(2000, 1000, h);
    // Totais: 7100/3501 ≈ 2,03. Média das razões seria ≈ 14.
    expect(r.razaoHistorica!).toBeGreaterThan(1.9);
    expect(r.razaoHistorica!).toBeLessThan(2.2);
  });
  it("sem dias suficientes não inventa histórico", () => {
    expect(razaoEntradaSaida(1000, 100, historico(6)).razaoHistorica).toBeNull();
  });
});

describe("saudeDoConsumo — histórico", () => {
  it(`abaixo de ${LIMIARES_DE_SAUDE.diasParaPadrao} dias diz que falta histórico`, () => {
    const d = saudeDoConsumo({
      periodo: { entrada: 999_999, saida: 1, dias: 6 },
      historico: historico(6), estatisticas: semEstatistica,
    });
    expect(d.estado).toBe("sem_historico");
    expect(d.titulo).toContain("insuficiente");
    // Sem régua, nenhum outro veredito pode ser emitido — nem mesmo o ruim.
    expect(d.base).toBeNull();
  });
  it("exatamente no piso já produz veredito", () => {
    const d = saudeDoConsumo({
      periodo: { entrada: 1000, saida: 200, dias: 1 },
      historico: historico(LIMIARES_DE_SAUDE.diasParaPadrao), estatisticas: semEstatistica,
    });
    expect(d.estado).not.toBe("sem_historico");
  });
  it("dias sem consumo não contam como medidos", () => {
    const h = [...historico(4), ...historico(5, 0, 0)];
    expect(saudeDoConsumo({
      periodo: { entrada: 100, saida: 20, dias: 1 }, historico: h, estatisticas: semEstatistica,
    }).estado).toBe("sem_historico");
  });
});

describe("saudeDoConsumo — vereditos", () => {
  const base = historico(30); // razão histórica 5×, 1200 tokens/dia

  it("dentro do padrão é saudável", () => {
    const d = saudeDoConsumo({
      periodo: { entrada: 1000, saida: 200, dias: 1 }, historico: base, estatisticas: semEstatistica,
    });
    expect(d.estado).toBe("saudavel");
    expect(d.base).toContain("30 dias");
  });

  it("crescimento acima do limiar vira atenção, e a frase traz o número", () => {
    const d = saudeDoConsumo({
      periodo: { entrada: 1600, saida: 320, dias: 1 }, historico: base, estatisticas: semEstatistica,
    });
    expect(d.estado).toBe("atencao");
    expect(d.detalhe).toContain("1.920"); // tokens/dia do período
    expect(d.detalhe).toContain("60%");
  });

  it("logo abaixo do limiar de crescimento continua saudável", () => {
    const d = saudeDoConsumo({
      periodo: { entrada: 1200, saida: 240, dias: 1 }, historico: base, estatisticas: semEstatistica,
    });
    expect(d.estado).toBe("saudavel");
  });

  it("razão de entrada acima do histórico vira otimizar", () => {
    // Histórico 5×; período em 9× → desvio 1,8 ≥ 1,6.
    const d = saudeDoConsumo({
      periodo: { entrada: 900, saida: 100, dias: 1 }, historico: base, estatisticas: semEstatistica,
    });
    expect(d.estado).toBe("otimizar");
    expect(d.detalhe).toContain("9,0×");
    expect(d.detalhe).toContain("5,0×");
  });

  it("otimizar tem precedência sobre atenção", () => {
    // Cresce E fica ineficiente: o acionável ganha, porque crescer pode ser legítimo.
    const d = saudeDoConsumo({
      periodo: { entrada: 9000, saida: 1000, dias: 1 }, historico: base, estatisticas: semEstatistica,
    });
    expect(d.estado).toBe("otimizar");
  });

  it("média distorcida sozinha já pede otimização", () => {
    const d = saudeDoConsumo({
      periodo: { entrada: 1000, saida: 200, dias: 1 }, historico: base,
      estatisticas: estatisticasDeChamada([...Array(24).fill(100), 100_000, 100_000]),
    });
    expect(d.estado).toBe("otimizar");
    expect(d.detalhe).toContain("mediana");
  });

  it("nunca devolve capacidade sem limite conhecido", () => {
    // Não há limite conectado ao painel; o estado existe no tipo, não no cálculo.
    const casos = [
      { entrada: 1, saida: 1 }, { entrada: 1e9, saida: 1 }, { entrada: 1e9, saida: 1e9 },
    ];
    for (const c of casos) {
      expect(saudeDoConsumo({
        periodo: { ...c, dias: 1 }, historico: base, estatisticas: semEstatistica,
      }).estado).not.toBe("capacidade");
    }
  });
});

describe("oportunidadesDeOtimizacao", () => {
  const base = historico(30);
  const semNada = { estatisticas: semEstatistica, cacheRead: 0, cacheCreation: 0, origens: [] };

  it("estado normal não produz conselho genérico", () => {
    expect(oportunidadesDeOtimizacao({
      ...semNada, razao: razaoEntradaSaida(1000, 200, base),
    })).toHaveLength(0);
  });

  it("cache zerado só vira sinal com entrada que justifique", () => {
    const pouco = oportunidadesDeOtimizacao({ ...semNada, razao: razaoEntradaSaida(500_000, 100_000, base) });
    expect(pouco.find((o) => o.chave === "cache")).toBeUndefined();
    const muito = oportunidadesDeOtimizacao({ ...semNada, razao: razaoEntradaSaida(2_000_000, 400_000, base) });
    expect(muito.find((o) => o.chave === "cache")).toBeDefined();
  });

  it("cache em uso nunca vira sinal, por maior que seja a entrada", () => {
    const o = oportunidadesDeOtimizacao({
      ...semNada, cacheRead: 10, razao: razaoEntradaSaida(9_000_000, 1_000_000, base),
    });
    expect(o.find((x) => x.chave === "cache")).toBeUndefined();
  });

  it("chamadas miúdas: exige volume E baixo consumo por chamada", () => {
    const r = razaoEntradaSaida(1000, 200, base);
    const so = (origens: any[]) => oportunidadesDeOtimizacao({ ...semNada, razao: r, origens })
      .find((o) => o.chave === "miudas");
    expect(so([{ origem: "cron", chamadas: 49, tokensPorChamada: 100 }])).toBeUndefined();
    expect(so([{ origem: "cron", chamadas: 500, tokensPorChamada: 9000 }])).toBeUndefined();
    expect(so([{ origem: "cron", chamadas: 500, tokensPorChamada: 100 }])?.detalhe).toContain("cron");
  });

  it("origem sem média de tokens não entra no sinal", () => {
    expect(oportunidadesDeOtimizacao({
      ...semNada, razao: razaoEntradaSaida(1000, 200, base),
      origens: [{ origem: "x", chamadas: 999, tokensPorChamada: null }],
    })).toHaveLength(0);
  });
});

describe("compararFontes", () => {
  it("sem leitura da Anthropic não inventa diferença", () => {
    const c = compararFontes(1000, null);
    expect(c.diferenca).toBeNull();
    expect(c.desalinhado).toBe(false);
    expect(c.explicacao).toContain("mesma chave");
  });
  it("dentro da folga não é desalinhamento", () => {
    expect(compararFontes(900, 1000).desalinhado).toBe(false); // 10%
  });
  it("acima da folga é desalinhamento", () => {
    expect(compararFontes(700, 1000).desalinhado).toBe(true); // 30%
  });
  it("desalinha também quando o Spaces conta MAIS", () => {
    // Não deveria acontecer, e é justamente por isso que precisa aparecer.
    const c = compararFontes(1500, 1000);
    expect(c.desalinhado).toBe(true);
    expect(c.diferenca).toBe(-500);
  });
  it("anthropic zerada não vira divisão por zero", () => {
    expect(compararFontes(100, 0).percentual).toBeNull();
  });
});

describe("custoPorMilhao", () => {
  it("converte centavos e escala por milhão", () => {
    // 253,3836 centavos = US$ 2,5338 por 574.772 tokens ≈ US$ 4,41/milhão.
    expect(custoPorMilhao(253.3836, 574_772)!).toBeCloseTo(4.408, 2);
  });
  it("sem tokens ou sem custo é null, e não zero", () => {
    expect(custoPorMilhao(100, 0)).toBeNull();
    expect(custoPorMilhao(0, 1000)).toBeNull();
  });
});

describe("alertasComparativos", () => {
  const base = historico(30); // 1200 tokens/dia, razão 5×
  const periodo = { entrada: 1000, saida: 200, dias: 1, rotulo: "13/08 a 19/08" };
  const alinhado = compararFontes(1000, 1000);
  const custo = (dias: number, centavosPorDia: number, tokensPorDia: number) =>
    Array.from({ length: dias }, (_, i) => ({
      dia: `2026-08-${String(i + 1).padStart(2, "0")}`,
      centavos: centavosPorDia, tokens: tokensPorDia,
    }));

  it("estado normal não produz alerta nenhum", () => {
    expect(alertasComparativos({
      periodo, historico: base, custoPorDia: custo(10, 100, 1_000_000), comparacao: alinhado,
    })).toHaveLength(0);
  });

  it("todo alerta carrega métrica, valor, referência, período e motivo", () => {
    const a = alertasComparativos({
      periodo: { ...periodo, entrada: 9000, saida: 1800 },
      historico: base, custoPorDia: [], comparacao: alinhado,
    });
    expect(a.length).toBeGreaterThan(0);
    for (const x of a) {
      // Sem estes cinco campos o alerta é uma opinião com cara de dado: quem lê
      // não consegue discordar porque não sabe do que se discorda.
      for (const campo of ["metrica", "valorAtual", "referencia", "periodo", "motivo"] as const) {
        expect(x[campo], `${x.tipo}.${campo}`).toBeTruthy();
      }
      expect(["atencao", "critico"]).toContain(x.severidade);
    }
  });

  describe("crescimento", () => {
    it("dispara acima do limiar e diz que crescer pode ser legítimo", () => {
      const a = alertasComparativos({
        periodo: { ...periodo, entrada: 1600, saida: 320 },
        historico: base, custoPorDia: [], comparacao: alinhado,
      }).find((x) => x.tipo === "crescimento");
      expect(a).toBeDefined();
      expect(a!.motivo).toContain("legítimo");
      expect(a!.periodo).toBe("13/08 a 19/08");
    });
    it("não dispara logo abaixo do limiar", () => {
      expect(alertasComparativos({
        periodo: { ...periodo, entrada: 1200, saida: 240 },
        historico: base, custoPorDia: [], comparacao: alinhado,
      }).find((x) => x.tipo === "crescimento")).toBeUndefined();
    });
    it("sem histórico suficiente não inventa crescimento", () => {
      expect(alertasComparativos({
        periodo: { ...periodo, entrada: 9_999_999, saida: 1 },
        historico: historico(6), custoPorDia: [], comparacao: alinhado,
      }).find((x) => x.tipo === "crescimento")).toBeUndefined();
    });
  });

  describe("custo", () => {
    /** 5 dias baratos + 1 caro, para o último ter com o que se comparar. */
    const serie = (ultimoCentavos: number) => [
      ...custo(5, 100, 1_000_000),
      { dia: "2026-08-06", centavos: ultimoCentavos, tokens: 1_000_000 },
    ];

    it("dispara quando o preço efetivo do último dia sobe", () => {
      const a = alertasComparativos({
        periodo, historico: base, custoPorDia: serie(150), comparacao: alinhado,
      }).find((x) => x.tipo === "custo");
      expect(a).toBeDefined();
      expect(a!.detalhe).toContain("mix");
    });
    it("não dispara logo abaixo do limiar", () => {
      expect(alertasComparativos({
        periodo, historico: base, custoPorDia: serie(125), comparacao: alinhado,
      }).find((x) => x.tipo === "custo")).toBeUndefined();
    });
    it("gastar MAIS no mesmo preço não é alerta de custo", () => {
      // O total sobe porque se usou mais — isso não é notícia. O que vira
      // alerta é o preço POR TOKEN mudar.
      const dobro = [...custo(5, 100, 1_000_000), { dia: "d6", centavos: 400, tokens: 4_000_000 }];
      expect(alertasComparativos({
        periodo, historico: base, custoPorDia: dobro, comparacao: alinhado,
      }).find((x) => x.tipo === "custo")).toBeUndefined();
    });
    it("sem dias de custo bastantes não compara", () => {
      expect(alertasComparativos({
        periodo, historico: base,
        custoPorDia: [...custo(2, 100, 1_000_000), { dia: "d3", centavos: 9999, tokens: 1000 }],
        comparacao: alinhado,
      }).find((x) => x.tipo === "custo")).toBeUndefined();
    });
  });

  describe("desalinhamento", () => {
    it("Anthropic vendo mais é atenção, e a frase fala de consumo fora do painel", () => {
      const a = alertasComparativos({
        periodo, historico: base, custoPorDia: [], comparacao: compararFontes(700, 1000),
      }).find((x) => x.tipo === "desalinhamento");
      expect(a!.severidade).toBe("atencao");
      expect(a!.titulo).toContain("fora do painel");
    });
    it("Spaces contando mais é crítico — a explicação usual não cobre esse sentido", () => {
      const a = alertasComparativos({
        periodo, historico: base, custoPorDia: [], comparacao: compararFontes(1500, 1000),
      }).find((x) => x.tipo === "desalinhamento");
      expect(a!.severidade).toBe("critico");
    });
    it("dentro da folga não vira alerta", () => {
      expect(alertasComparativos({
        periodo, historico: base, custoPorDia: [], comparacao: compararFontes(900, 1000),
      }).find((x) => x.tipo === "desalinhamento")).toBeUndefined();
    });
    it("sem leitura da Anthropic não há desalinhamento a declarar", () => {
      expect(alertasComparativos({
        periodo, historico: base, custoPorDia: [], comparacao: compararFontes(1000, null),
      }).find((x) => x.tipo === "desalinhamento")).toBeUndefined();
    });
  });

  it("nunca emite alerta de capacidade — não há teto conectado", () => {
    const extremo = alertasComparativos({
      periodo: { ...periodo, entrada: 1e9, saida: 1e8 }, historico: base,
      custoPorDia: custo(10, 99999, 1000), comparacao: compararFontes(1, 1e9),
    });
    expect(extremo.find((x) => x.tipo === "capacidade" as string)).toBeUndefined();
  });
});
