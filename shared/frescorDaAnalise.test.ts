import { describe, expect, it } from "vitest";
import {
  AI_STATUS_FRESHNESS_MINUTES, decidirGeracaoDaAnalise, frasesDoCiclo,
} from "./frescorDaAnalise";

const agora = new Date("2026-08-19T18:00:00Z");
/** `min` minutos ANTES de `agora`. */
const atras = (min: number) => new Date(agora.getTime() - min * 60_000);

describe("a janela de frescor", () => {
  it("é medida em minutos e fica entre a rajada e o ciclo diário", () => {
    // As duas fronteiras que justificam o número, escritas como teste: menor
    // que o dia do cron, e muito maior que uma rajada de deploys.
    expect(AI_STATUS_FRESHNESS_MINUTES).toBeGreaterThan(30);
    expect(AI_STATUS_FRESHNESS_MINUTES).toBeLessThan(24 * 60);
  });

  it("dentro da janela, reusa", () => {
    const d = decidirGeracaoDaAnalise({
      analiseEm: atras(30), contextoEm: null, agora,
    });
    expect(d.gerar).toBe(false);
    expect(d.motivo).toBe("fresca");
    expect(d.idadeMinutos).toBe(30);
  });

  it("exatamente no limite ainda é fresca", () => {
    const d = decidirGeracaoDaAnalise({
      analiseEm: atras(AI_STATUS_FRESHNESS_MINUTES), contextoEm: null, agora,
    });
    expect(d.gerar).toBe(false);
  });

  it("um minuto além do limite gera", () => {
    const d = decidirGeracaoDaAnalise({
      analiseEm: atras(AI_STATUS_FRESHNESS_MINUTES + 1), contextoEm: null, agora,
    });
    expect(d.gerar).toBe(true);
    expect(d.motivo).toBe("expirada");
  });

  it("o ciclo diário sempre gera — 24h está muito além da janela", () => {
    // Se a janela crescesse até perto de um dia, a rodada das 06:00 se
    // auto-suprimiria e a leitura diária deixaria de ser diária.
    const d = decidirGeracaoDaAnalise({ analiseEm: atras(24 * 60), contextoEm: null, agora });
    expect(d.gerar).toBe(true);
    expect(d.motivo).toBe("expirada");
  });
});

describe("conta nunca analisada", () => {
  it("gera, e não reporta idade", () => {
    const d = decidirGeracaoDaAnalise({ analiseEm: null, contextoEm: null, agora });
    expect(d.gerar).toBe(true);
    expect(d.motivo).toBe("sem_analise");
    expect(d.idadeMinutos).toBeNull();
  });

  it("data inválida conta como nunca analisada", () => {
    const d = decidirGeracaoDaAnalise({ analiseEm: "não é data", contextoEm: null, agora });
    expect(d.gerar).toBe(true);
    expect(d.motivo).toBe("sem_analise");
  });
});

describe("contexto atropela a janela", () => {
  it("contexto salvo DEPOIS da análise gera, mesmo com a análise recém-feita", () => {
    // Quem escreve contexto está dizendo ao sistema algo que os números não
    // mostram. Fazer essa pessoa esperar três horas viraria o campo em enfeite.
    const d = decidirGeracaoDaAnalise({
      analiseEm: atras(5), contextoEm: atras(1), agora,
    });
    expect(d.gerar).toBe(true);
    expect(d.motivo).toBe("contexto_mudou");
  });

  it("contexto ANTERIOR à análise não gera nada", () => {
    const d = decidirGeracaoDaAnalise({
      analiseEm: atras(5), contextoEm: atras(600), agora,
    });
    expect(d.gerar).toBe(false);
    expect(d.motivo).toBe("fresca");
  });

  it("sem contexto nenhum, a janela decide sozinha", () => {
    expect(decidirGeracaoDaAnalise({ analiseEm: atras(5), contextoEm: null, agora }).gerar).toBe(false);
    expect(decidirGeracaoDaAnalise({ analiseEm: atras(500), contextoEm: null, agora }).gerar).toBe(true);
  });
});

describe("o pedido explícito não se discute", () => {
  it("forçar gera mesmo com análise de segundos atrás", () => {
    const d = decidirGeracaoDaAnalise({
      analiseEm: atras(0.2), contextoEm: null, forcar: true, agora,
    });
    expect(d.gerar).toBe(true);
    expect(d.motivo).toBe("forcado");
  });

  it("forçar tem precedência sobre todos os outros motivos", () => {
    for (const caso of [
      { analiseEm: null, contextoEm: null },
      { analiseEm: atras(5), contextoEm: atras(1) },
      { analiseEm: atras(999), contextoEm: null },
    ]) {
      expect(decidirGeracaoDaAnalise({ ...caso, forcar: true, agora }).motivo).toBe("forcado");
    }
  });
});

describe("relógio torto não vira gatilho", () => {
  it("análise no futuro conta como fresca", () => {
    // Idade negativa é erro de relógio ou de fuso. Gerar por causa dela seria
    // agir sobre o defeito em vez de sobre o dado.
    const d = decidirGeracaoDaAnalise({
      analiseEm: new Date(agora.getTime() + 60 * 60_000), contextoEm: null, agora,
    });
    expect(d.gerar).toBe(false);
    expect(d.motivo).toBe("fresca");
  });
});

describe("aceita string e Date sem mudar de resposta", () => {
  it("as duas formas decidem igual", () => {
    const comData = decidirGeracaoDaAnalise({ analiseEm: atras(30), contextoEm: atras(10), agora });
    const comTexto = decidirGeracaoDaAnalise({
      analiseEm: atras(30).toISOString(), contextoEm: atras(10).toISOString(), agora,
    });
    expect(comTexto).toEqual(comData);
  });
});

describe("o resumo do ciclo conta as quatro coisas", () => {
  it("a frase traz os quatro números", () => {
    const f = frasesDoCiclo({ contas: 13, geradas: 4, reusadas: 8, falhas: 1 });
    for (const n of ["13", "4", "8", "1"]) expect(f).toContain(n);
    // "13 contas, 4 análises" sem os outros dois não diz se as 9 restantes
    // foram economia ou falha.
    expect(f).toContain("reusada");
    expect(f).toContain("falha");
  });
});
