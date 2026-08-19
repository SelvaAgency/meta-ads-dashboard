import { describe, expect, it } from "vitest";
import {
  ROTINAS, ROTULO_DO_TIPO, alertasDeGatilho, consumoPorGatilho,
  textoDoAtor, textoDoGatilho, LIMIARES_DE_GATILHO, type ChamadaCrua,
} from "./gatilhoDaIA";

describe("o vocabulário do gatilho", () => {
  it("desconhecido é 'Não rastreado', e nunca 'Automático'", () => {
    // Chutar o mais provável transformaria ausência em afirmação — no lugar
    // exato onde alguém decide o que cortar.
    expect(ROTULO_DO_TIPO.unknown).toBe("Não rastreado");
    expect(ROTULO_DO_TIPO.unknown).not.toContain("utomático");
  });

  it("cada rotina nomeada tem tipo coerente com o nome", () => {
    expect(ROTINAS.cronDiario.tipo).toBe("scheduled");
    expect(ROTINAS.analiseManual.tipo).toBe("manual");
    expect(ROTINAS.boot.tipo).toBe("system");
  });
});

describe("textoDoGatilho", () => {
  it("manual mostra a pessoa", () => {
    expect(textoDoGatilho({ tipo: "manual", atorNome: "Gui" })).toBe("Manual · Gui");
  });
  it("manual sem nome não inventa um", () => {
    expect(textoDoGatilho({ tipo: "manual", atorNome: null })).toBe("Manual");
  });
  it("automático mostra a rotina", () => {
    expect(textoDoGatilho({ tipo: "scheduled", rotulo: "Atualização automática diária" }))
      .toBe("Automático · Atualização automática diária");
  });
  it("não rastreado não ganha sufixo nenhum", () => {
    expect(textoDoGatilho({ tipo: "unknown", rotulo: "seja o que for" })).toBe("Não rastreado");
  });
  it("ausência total vira não rastreado", () => {
    expect(textoDoGatilho(null)).toBe("Não rastreado");
    expect(textoDoGatilho({})).toBe("Não rastreado");
  });
});

describe("textoDoAtor", () => {
  it("pessoa aparece pelo nome", () => {
    expect(textoDoAtor({ tipo: "manual", atorTipo: "user", atorNome: "Wictor" })).toBe("Wictor");
  });
  it("pessoa sem nome cai no id, e não em 'Sistema'", () => {
    expect(textoDoAtor({ tipo: "manual", atorTipo: "user", atorId: 7 })).toBe("Usuário 7");
  });
  it("automático é Sistema", () => {
    expect(textoDoAtor({ tipo: "scheduled", atorTipo: "system" })).toBe("Sistema");
  });
  it("não rastreado é traço — não é 'Sistema'", () => {
    // Dizer "Sistema" para um registro sem rastro afirmaria que não houve gente.
    expect(textoDoAtor({ tipo: "unknown" })).toBe("–");
  });
});

describe("consumoPorGatilho", () => {
  const linhas = [
    { tipo: "scheduled", chamadas: 40, tokensEntrada: 80_000, tokensSaida: 20_000, falhas: 0 },
    { tipo: "manual", chamadas: 10, tokensEntrada: 40_000, tokensSaida: 10_000, falhas: 1 },
  ];

  it("soma entrada e saída, e ordena pelo maior consumo", () => {
    const r = consumoPorGatilho(linhas);
    expect(r[0].tipo).toBe("scheduled");
    expect(r[0].tokens).toBe(100_000);
    expect(r[1].tokens).toBe(50_000);
  });

  it("a fatia soma 1", () => {
    expect(consumoPorGatilho(linhas).reduce((n, g) => n + (g.fatia ?? 0), 0)).toBeCloseTo(1, 10);
  });

  it("tokens por chamada distingue volume de custo unitário", () => {
    const r = consumoPorGatilho(linhas);
    // Automático tem 4× as chamadas e só 2× os tokens: cada chamada manual é
    // mais cara, e o total sozinho esconderia isso.
    expect(r[0].tokensPorChamada).toBe(2500);
    expect(r[1].tokensPorChamada).toBe(5000);
  });

  it("tipo fora do vocabulário vira unknown em vez de sumir", () => {
    const r = consumoPorGatilho([{ tipo: "inventado", chamadas: 1, tokensEntrada: 5, tokensSaida: 5, falhas: 0 }]);
    expect(r[0].tipo).toBe("unknown");
  });

  it("período sem token não vira divisão por zero", () => {
    const r = consumoPorGatilho([{ tipo: "manual", chamadas: 3, tokensEntrada: 0, tokensSaida: 0, falhas: 0 }]);
    expect(r[0].fatia).toBeNull();
  });
});

describe("alertasDeGatilho", () => {
  const base = new Date("2026-08-19T12:00:00Z");
  const emMinutos = (m: number) => new Date(base.getTime() + m * 60_000);
  const chamada = (o: Partial<ChamadaCrua> & { min: number }): ChamadaCrua => ({
    origem: o.origem ?? "status_ia",
    accountId: o.accountId ?? 1,
    nomeDaConta: o.nomeDaConta ?? "UMA",
    triggerType: o.triggerType ?? "scheduled",
    actorName: o.actorName ?? null,
    criadoEm: emMinutos(o.min),
  });
  /** Ruído longe de tudo, só para passar do piso de chamadas. */
  const ruido = (n: number) =>
    Array.from({ length: n }, (_, i) => chamada({ min: 10_000 + i * 600, accountId: 90 + i }));

  it("amostra pequena não gera alerta nenhum", () => {
    expect(alertasDeGatilho({ chamadas: [chamada({ min: 0 })], porGatilho: [] })).toHaveLength(0);
  });

  it("mesmo cliente muitas vezes na janela vira alerta com o número", () => {
    const r = alertasDeGatilho({
      chamadas: [
        ...Array.from({ length: LIMIARES_DE_GATILHO.repeticoesPorCliente },
          (_, i) => chamada({ min: i * 20 })),
        ...ruido(10),
      ],
      porGatilho: [],
    });
    const a = r.find((x) => x.chave.startsWith("repeticao-"));
    expect(a).toBeDefined();
    expect(a!.detalhe).toContain("UMA");
    expect(a!.detalhe).toContain(String(LIMIARES_DE_GATILHO.repeticoesPorCliente));
    // Investigativo, e nunca veredito: o painel não sabe se foi desperdício.
    expect(a!.detalhe).not.toContain("desperdício");
    expect(a!.detalhe).toContain("legítimo");
  });

  it("as mesmas chamadas espalhadas fora da janela NÃO alertam", () => {
    // 4 chamadas em 30 dias não são 4 em 3 horas, e a janela deslizante é o que
    // separa as duas.
    const r = alertasDeGatilho({
      chamadas: [
        ...Array.from({ length: 6 }, (_, i) => chamada({ min: i * 24 * 60 })),
        ...ruido(10),
      ],
      porGatilho: [],
    });
    expect(r.find((x) => x.chave.startsWith("repeticao-"))).toBeUndefined();
  });

  it("intervalo curto entre mesma origem e cliente é contado", () => {
    const r = alertasDeGatilho({
      chamadas: [chamada({ min: 0 }), chamada({ min: 3 }), ...ruido(10)],
      porGatilho: [],
    });
    const a = r.find((x) => x.chave === "intervalo-curto");
    expect(a).toBeDefined();
    expect(a!.detalhe).toContain("1 par");
  });

  it("origens diferentes no mesmo minuto não são repetição", () => {
    const r = alertasDeGatilho({
      chamadas: [
        chamada({ min: 0, origem: "status_ia" }),
        chamada({ min: 1, origem: "relatorio" }),
        ...ruido(10),
      ],
      porGatilho: [],
    });
    expect(r.find((x) => x.chave === "intervalo-curto")).toBeUndefined();
  });

  it("manual acima da metade dos tokens vira sinal, sem virar acusação", () => {
    const r = alertasDeGatilho({
      chamadas: ruido(12),
      porGatilho: consumoPorGatilho([
        { tipo: "manual", chamadas: 10, tokensEntrada: 60_000, tokensSaida: 0, falhas: 0 },
        { tipo: "scheduled", chamadas: 40, tokensEntrada: 40_000, tokensSaida: 0, falhas: 0 },
      ]),
    });
    const a = r.find((x) => x.chave === "fatia-manual");
    expect(a!.detalhe).toContain("60%");
    expect(a!.detalhe).toContain("Não é erro");
  });

  it("manual abaixo do limiar não alerta", () => {
    const r = alertasDeGatilho({
      chamadas: ruido(12),
      porGatilho: consumoPorGatilho([
        { tipo: "manual", chamadas: 10, tokensEntrada: 30_000, tokensSaida: 0, falhas: 0 },
        { tipo: "scheduled", chamadas: 40, tokensEntrada: 70_000, tokensSaida: 0, falhas: 0 },
      ]),
    });
    expect(r.find((x) => x.chave === "fatia-manual")).toBeUndefined();
  });

  it("chamadas sem gatilho viram alerta de auditoria", () => {
    const r = alertasDeGatilho({
      chamadas: ruido(12),
      porGatilho: consumoPorGatilho([
        { tipo: "unknown", chamadas: 7, tokensEntrada: 100, tokensSaida: 10, falhas: 0 },
      ]),
    });
    const a = r.find((x) => x.chave === "nao-rastreado");
    expect(a!.detalhe).toContain("7 chamada");
  });
});
