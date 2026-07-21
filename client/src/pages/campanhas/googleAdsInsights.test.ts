import { describe, it, expect } from "vitest";
import {
  totaisDe, insightsDe, semEntrega, gastouSemConverter, linhaComAtencao,
  rotuloDoCanal, MIN_IMPRESSOES_PARA_CTR, type CampanhaGoogle,
} from "./googleAdsInsights";

const camp = (over: Partial<CampanhaGoogle> = {}): CampanhaGoogle => ({
  id: "1", name: "Campanha", status: "ENABLED", advertisingChannelType: "SEARCH",
  spend: 0, impressions: 0, clicks: 0, conversions: 0, conversionValue: 0,
  ctr: 0, cpc: 0, costPerConversion: 0, roas: 0, ...over,
});

describe("totais do período", () => {
  it("lista vazia não quebra e não inventa taxa", () => {
    const t = totaisDe([]);
    expect(t.investimento).toBe(0);
    expect(t.ctr).toBeNull();
    expect(t.cpc).toBeNull();
    expect(t.cpa).toBeNull();
    expect(t.roas).toBeNull();
    expect(t.temReceita).toBe(false);
  });

  it("CTR é null sem impressão — não é 0%", () => {
    expect(totaisDe([camp({ clicks: 0, impressions: 0 })]).ctr).toBeNull();
  });

  it("CPC é null sem clique; CPA é null sem conversão", () => {
    const t = totaisDe([camp({ spend: 100, impressions: 1000, clicks: 0, conversions: 0 })]);
    expect(t.cpc).toBeNull();
    expect(t.cpa).toBeNull();
  });

  it("ROAS é null sem receita — métrica que não se aplica, não fracasso", () => {
    expect(totaisDe([camp({ spend: 500, conversions: 10, conversionValue: 0 })]).roas).toBeNull();
  });

  it("taxas vêm do total, não da média das médias", () => {
    // 1 clique/1000 impr + 99 cliques/1000 impr → CTR real = 100/2000 = 5%
    const t = totaisDe([
      camp({ clicks: 1, impressions: 1000, ctr: 0.1 }),
      camp({ clicks: 99, impressions: 1000, ctr: 9.9 }),
    ]);
    expect(t.ctr).toBeCloseTo(5, 5);
  });

  it("soma investimento, cliques, conversões e receita", () => {
    const t = totaisDe([
      camp({ spend: 100, clicks: 10, conversions: 2, conversionValue: 300, impressions: 500 }),
      camp({ spend: 300, clicks: 30, conversions: 6, conversionValue: 900, impressions: 1500 }),
    ]);
    expect(t.investimento).toBe(400);
    expect(t.cliques).toBe(40);
    expect(t.conversoes).toBe(8);
    expect(t.valorConversao).toBe(1200);
    expect(t.cpa).toBe(50);
    expect(t.roas).toBe(3);
    expect(t.temReceita).toBe(true);
  });

  it("valores não numéricos viram zero em vez de NaN", () => {
    const t = totaisDe([camp({ spend: NaN as number, clicks: undefined as never, impressions: 100 })]);
    expect(Number.isNaN(t.investimento)).toBe(false);
    expect(t.investimento).toBe(0);
  });
});

describe("insights", () => {
  it("lista vazia não gera insight nenhum", () => {
    expect(insightsDe([])).toEqual([]);
  });

  it("campanhas todas zeradas não geram insight inventado", () => {
    expect(insightsDe([camp(), camp({ id: "2" })]).filter((i) => i.chave === "maior_investimento")).toEqual([]);
  });

  describe("melhor CTR exige amostra que sustente", () => {
    it("campanha com 3 impressões e 1 clique NÃO vira melhor CTR", () => {
      const r = insightsDe([camp({ impressions: 3, clicks: 1, ctr: 33.3 })]);
      expect(r.find((i) => i.chave === "melhor_ctr")).toBeUndefined();
    });

    it("com impressões suficientes, entra", () => {
      const r = insightsDe([camp({ impressions: MIN_IMPRESSOES_PARA_CTR, clicks: 5, ctr: 5 })]);
      expect(r.find((i) => i.chave === "melhor_ctr")?.valor).toBe("5.00%");
    });

    it("escolhe a de maior CTR entre as que têm base", () => {
      const r = insightsDe([
        camp({ id: "a", name: "A", impressions: 1000, ctr: 2 }),
        camp({ id: "b", name: "B", impressions: 1000, ctr: 8 }),
        camp({ id: "c", name: "C", impressions: 10, ctr: 50 }),  // sem base
      ]);
      expect(r.find((i) => i.chave === "melhor_ctr")?.detalhe).toMatch(/^B/);
    });
  });

  it("maior gasto sem conversão é marcado como alerta", () => {
    const r = insightsDe([camp({ name: "Desperdício", spend: 900, conversions: 0 })]);
    const i = r.find((x) => x.chave === "gasto_sem_conversao");
    expect(i?.alerta).toBe(true);
    expect(i?.detalhe).toBe("Desperdício");
  });

  it("campanha que converteu não entra em gasto sem conversão", () => {
    const r = insightsDe([camp({ spend: 900, conversions: 3 })]);
    expect(r.find((x) => x.chave === "gasto_sem_conversao")).toBeUndefined();
  });

  it("conta as ativas sem entrega; pausada sem entrega não conta", () => {
    const r = insightsDe([
      camp({ id: "a", name: "A", status: "ENABLED", impressions: 0 }),
      camp({ id: "b", name: "B", status: "ENABLED", impressions: 0 }),
      camp({ id: "c", name: "C", status: "PAUSED", impressions: 0 }),
    ]);
    expect(r.find((i) => i.chave === "sem_entrega")?.valor).toBe("2");
  });

  describe("ROAS só quando há receita", () => {
    it("sem valor de conversão, não existe insight de ROAS", () => {
      expect(insightsDe([camp({ spend: 500, conversions: 10, conversionValue: 0 })])
        .find((i) => i.chave === "melhor_roas")).toBeUndefined();
    });

    it("com receita, aparece", () => {
      const r = insightsDe([camp({ name: "Vende", spend: 100, conversionValue: 400, roas: 4 })]);
      expect(r.find((i) => i.chave === "melhor_roas")?.valor).toBe("4.00x");
    });
  });
});

describe("marcações de atenção na tabela", () => {
  it("gastou e não converteu", () => {
    expect(gastouSemConverter(camp({ spend: 50, conversions: 0 }))).toBe(true);
    expect(gastouSemConverter(camp({ spend: 50, conversions: 1 }))).toBe(false);
    expect(gastouSemConverter(camp({ spend: 0, conversions: 0 }))).toBe(false);
  });

  it("sem entrega é zero impressão", () => {
    expect(semEntrega(camp({ impressions: 0 }))).toBe(true);
    expect(semEntrega(camp({ impressions: 1 }))).toBe(false);
  });

  it("pausada e sem entrega NÃO é atenção — é o esperado", () => {
    expect(linhaComAtencao(camp({ status: "PAUSED", impressions: 0, spend: 0 }))).toBe(false);
  });

  it("ativa e sem entrega é atenção", () => {
    expect(linhaComAtencao(camp({ status: "ENABLED", impressions: 0, spend: 0 }))).toBe(true);
  });

  it("campanha saudável não é marcada", () => {
    expect(linhaComAtencao(camp({ status: "ENABLED", impressions: 900, spend: 80, conversions: 4 }))).toBe(false);
  });
});

describe("rótulo do canal", () => {
  it("traduz os tipos conhecidos", () => {
    expect(rotuloDoCanal("SEARCH")).toBe("Busca");
    expect(rotuloDoCanal("PERFORMANCE_MAX")).toBe("Performance Max");
  });

  it("tipo desconhecido não vira erro nem inventa nome", () => {
    expect(rotuloDoCanal("TIPO_NOVO_DO_GOOGLE")).toBe("tipo novo do google");
    expect(rotuloDoCanal(null)).toBe("—");
    expect(rotuloDoCanal(undefined)).toBe("—");
  });
});
