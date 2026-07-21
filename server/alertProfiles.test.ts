import { describe, it, expect } from "vitest";
import {
  PERFIL_DE_ALERTA, REGRAS_ALERTA, perfilDe, regraVale, ajustarSeveridade,
  resolverTipoDaConta, perfisCompletos, type RegraAlerta,
} from "./alertProfiles";
import { GOAL_TYPES, type GoalType } from "../shared/goalTypes";
import { detectAnomalies } from "./analysisService";

describe("perfis de alerta por tipo de conta", () => {
  it("todo tipo tem perfil, e todo perfil cobre as seis regras", () => {
    expect(perfisCompletos()).toBe(true);
    for (const t of GOAL_TYPES) {
      for (const r of REGRAS_ALERTA) expect(PERFIL_DE_ALERTA[t][r]).toBeTruthy();
    }
  });

  describe("ROAS só é cobrado de quem tem receita", () => {
    it("NÃO é avaliado em MESSAGES, AWARENESS, TRAFFIC", () => {
      for (const t of ["MESSAGES", "AWARENESS", "TRAFFIC"] as GoalType[]) {
        expect(regraVale("ROAS_DROP", t)).toBe(false);
        expect(ajustarSeveridade("CRITICAL", "ROAS_DROP", t)).toBeNull();
      }
    });

    it("é avaliado em SALES e VALUE", () => {
      for (const t of ["SALES", "VALUE"] as GoalType[]) {
        expect(regraVale("ROAS_DROP", t)).toBe(true);
      }
    });

    it("também não vale em LEADS, ENGAGEMENT, VIDEO, FOLLOWERS e APP", () => {
      for (const t of ["LEADS", "ENGAGEMENT", "VIDEO", "FOLLOWERS", "APP"] as GoalType[]) {
        expect(regraVale("ROAS_DROP", t)).toBe(false);
      }
    });
  });

  it("AWARENESS não é cobrada por CPA — não há conversão a cobrar", () => {
    expect(regraVale("CPA_SPIKE", "AWARENESS")).toBe(false);
  });

  describe("frequência pesa diferente conforme o tipo", () => {
    it("é mais grave em AWARENESS do que a gravidade calculada", () => {
      expect(ajustarSeveridade("MEDIUM", "FREQUENCY_HIGH", "AWARENESS")).toBe("HIGH");
      expect(ajustarSeveridade("HIGH", "FREQUENCY_HIGH", "AWARENESS")).toBe("CRITICAL");
    });

    it("é menos grave em SALES", () => {
      expect(ajustarSeveridade("MEDIUM", "FREQUENCY_HIGH", "SALES")).toBe("LOW");
      expect(ajustarSeveridade("HIGH", "FREQUENCY_HIGH", "SALES")).toBe("MEDIUM");
    });
  });

  it("CTR em MESSAGES existe, mas rebaixado", () => {
    expect(regraVale("CTR_DROP", "MESSAGES")).toBe(true);
    expect(ajustarSeveridade("HIGH", "CTR_DROP", "MESSAGES")).toBe("MEDIUM");
  });

  it("resultado é crítico em todo tipo que tem resultado", () => {
    for (const t of ["SALES", "VALUE", "LEADS", "MESSAGES", "ENGAGEMENT", "VIDEO", "FOLLOWERS", "APP"] as GoalType[]) {
      expect(PERFIL_DE_ALERTA[t].RESULTS_DROP).toBe("critica");
    }
  });

  describe("ajuste de gravidade não estoura a escala", () => {
    it("crítica não passa de CRITICAL", () => {
      expect(ajustarSeveridade("CRITICAL", "PERFORMANCE_DROP", "AWARENESS")).toBe("CRITICAL");
    });
    it("secundária não desce abaixo de LOW", () => {
      expect(ajustarSeveridade("LOW", "CTR_DROP", "SALES")).toBe("LOW");
    });
  });

  describe("DEFAULT e tipos desconhecidos", () => {
    it("DEFAULT é tudo primária — o comportamento de antes da F3", () => {
      for (const r of REGRAS_ALERTA) {
        expect(PERFIL_DE_ALERTA.DEFAULT[r]).toBe("primaria");
        expect(ajustarSeveridade("HIGH", r, "DEFAULT")).toBe("HIGH");
      }
    });

    it("tipo desconhecido cai em DEFAULT, não em vazio", () => {
      expect(perfilDe("TIPO_QUE_NAO_EXISTE")).toEqual(PERFIL_DE_ALERTA.DEFAULT);
      expect(perfilDe(null)).toEqual(PERFIL_DE_ALERTA.DEFAULT);
      expect(perfilDe(undefined)).toEqual(PERFIL_DE_ALERTA.DEFAULT);
      expect(regraVale("ROAS_DROP", "TIPO_QUE_NAO_EXISTE")).toBe(true);
    });
  });
});

describe("resolução do tipo da conta", () => {
  it("override manual vence a detecção", () => {
    // Caso real: ELWING marcada MESSAGES, campanhas dizendo LEAD_GENERATION.
    expect(resolverTipoDaConta({ goalTypeOverride: "MESSAGES" }, ["LEAD_GENERATION", "LEAD_GENERATION"]))
      .toBe("MESSAGES");
    // Caso real: MNBR marcada MESSAGES, campanhas dizendo VISIT_INSTAGRAM_PROFILE.
    expect(resolverTipoDaConta({ goalTypeOverride: "MESSAGES" }, ["VISIT_INSTAGRAM_PROFILE"]))
      .toBe("MESSAGES");
  });

  it("sem override, usa o objetivo dominante das campanhas", () => {
    expect(resolverTipoDaConta({}, ["OFFSITE_CONVERSIONS", "OFFSITE_CONVERSIONS", "LINK_CLICKS"])).toBe("SALES");
    expect(resolverTipoDaConta({}, ["CONVERSATIONS", "CONVERSATIONS"])).toBe("MESSAGES");
    expect(resolverTipoDaConta({}, ["LANDING_PAGE_VIEWS"])).toBe("TRAFFIC");
  });

  it("sem override e sem campanha cai em DEFAULT", () => {
    // Caroline Garrafa e Musa Resíduos têm zero campanhas em produção.
    expect(resolverTipoDaConta({}, [])).toBe("DEFAULT");
    expect(resolverTipoDaConta(null)).toBe("DEFAULT");
  });

  it("objetivo desconhecido cai em DEFAULT", () => {
    expect(resolverTipoDaConta({}, ["OBJETIVO_NOVO_DA_META"])).toBe("DEFAULT");
  });
});

/**
 * A garantia mais importante da F3: sem `tipo`, o detector precisa se comportar
 * EXATAMENTE como antes. Qualquer divergência aqui significa que uma conta em
 * Automático mudou de comportamento sem ninguém pedir.
 */
describe("compatibilidade — sem tipo, nada muda", () => {
  const atual = { roas: 1, cpa: 100, ctr: 0.5, impressions: 1000, conversions: 5, frequency: 5.5 };
  const antes = { roas: 5, cpa: 20, ctr: 3, impressions: 10000, conversions: 50 };

  it("sem tipo e com DEFAULT produzem a mesma saída", () => {
    const semTipo = detectAnomalies(atual, antes, antes, antes);
    const comDefault = detectAnomalies(atual, antes, antes, antes, { tipo: "DEFAULT" });
    expect(comDefault).toEqual(semTipo);
  });

  it("sem tipo, todas as regras continuam disponíveis", () => {
    const r = detectAnomalies(atual, antes, antes, antes);
    expect(r.length).toBeGreaterThan(0);
    expect(r.map((a) => a.type)).toContain("ROAS_DROP");
  });

  it("campanha em aprendizado continua isenta, com ou sem tipo", () => {
    expect(detectAnomalies(atual, antes, antes, antes, { isLearningPhase: true, tipo: "SALES" })).toEqual([]);
    expect(detectAnomalies(atual, antes, antes, antes, { isLearningPhase: true })).toEqual([]);
  });
});

describe("efeito real no detector", () => {
  const atual = { roas: 1, cpa: 100, ctr: 0.5, impressions: 1000, conversions: 5, frequency: 5.5 };
  const antes = { roas: 5, cpa: 20, ctr: 3, impressions: 10000, conversions: 50 };
  const tipos = (t: GoalType) => detectAnomalies(atual, antes, antes, antes, { tipo: t }).map((a) => a.type as RegraAlerta);

  it("MESSAGES não recebe ROAS_DROP; SALES recebe", () => {
    expect(tipos("MESSAGES")).not.toContain("ROAS_DROP");
    expect(tipos("SALES")).toContain("ROAS_DROP");
  });

  it("AWARENESS não recebe ROAS nem CPA", () => {
    expect(tipos("AWARENESS")).not.toContain("ROAS_DROP");
    expect(tipos("AWARENESS")).not.toContain("CPA_SPIKE");
  });

  it("a mesma frequência é mais grave em AWARENESS do que em SALES", () => {
    const g = (t: GoalType) =>
      detectAnomalies(atual, antes, antes, antes, { tipo: t }).find((a) => a.type === "FREQUENCY_HIGH")?.severity;
    const ordem = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
    expect(ordem.indexOf(g("AWARENESS")!)).toBeGreaterThan(ordem.indexOf(g("SALES")!));
  });

  it("nenhum tipo fica sem alerta nenhum — filtrar não pode virar silenciar", () => {
    for (const t of GOAL_TYPES) expect(tipos(t).length).toBeGreaterThan(0);
  });
});
