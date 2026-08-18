/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Um resumo que afirma o que os dados não sustentam é pior que resumo nenhum
 * ─────────────────────────────────────────────────────────────────────────────
 *  Quem lê o cabeçalho não vai conferir a série antes de acreditar. É por isso
 *  que os dois riscos daqui são de AFIRMAÇÃO, não de cálculo:
 *
 *   FALAR CEDO   com dois dias de coleta não existe tendência, existe uma foto.
 *                Uma frase fluente sobre ruído tem exatamente a mesma aparência
 *                de uma frase sobre movimento real
 *
 *   MÉDIA DE     seguidores é estoque. Tirar média de estoque produz um número
 *   ESTOQUE      sem significado, e ele sairia com cara de saldo
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, expect, it } from "vitest";
import { DIAS_MINIMOS_PARA_LER, lerUltimosDias, resumoExecutivo, type DiaDaLeitura } from "./leituraSocial";

const dia = (d: string, over: Partial<DiaDaLeitura> = {}): DiaDaLeitura => ({
  dia: d, seguidores: null, visitas: null, interacoes: null, ativacoes: null, ...over,
});

describe("saber calar", () => {
  it("sem coleta nenhuma, não há texto — e o motivo é dito", () => {
    const r = lerUltimosDias([]);
    expect(r.texto).toBeNull();
    expect(r.dadosInsuficientes).toBe(true);
    expect(r.motivo).toContain("Ainda não há coleta");
  });

  /** Dois dias é uma foto e um ponto de comparação. Não é tendência. */
  it("abaixo do mínimo de dias, não afirma nada", () => {
    const r = lerUltimosDias([
      dia("2026-08-10", { seguidores: 100 }),
      dia("2026-08-11", { seguidores: 200 }),
    ]);
    expect(r.texto).toBeNull();
    expect(r.motivo).toContain(String(DIAS_MINIMOS_PARA_LER));
    // Mesmo com dobro de seguidores: o dado não sustenta a afirmação.
    expect(r.achados).toEqual([]);
  });

  /**
   * Três dias com coleta, mas cada um com uma métrica diferente: nenhuma tem os
   * dois pontos que uma comparação exige. A coleta funcionou e mesmo assim não
   * há o que afirmar — e a frase precisa dizer isso, não "sem coleta".
   */
  it("dias medidos sem métrica comparável também não viram texto", () => {
    const r = lerUltimosDias([
      dia("2026-08-10", { seguidores: 100 }),
      dia("2026-08-11", { visitas: 50 }),
      dia("2026-08-12", { interacoes: 10 }),
    ]);
    expect(r.texto).toBeNull();
    expect(r.motivo).toContain("nenhuma métrica");
  });
});

describe("estoque e fluxo são lidos de formas diferentes", () => {
  const serie = [
    dia("2026-08-10", { seguidores: 1000, visitas: 100, interacoes: 50 }),
    dia("2026-08-11", { seguidores: 1010, visitas: 90, interacoes: 55 }),
    dia("2026-08-12", { seguidores: 1050, visitas: 200, interacoes: 60 }),
    dia("2026-08-13", { seguidores: 1120, visitas: 220, interacoes: 65 }),
  ];

  /** Saldo entre a primeira e a última fotografia — nunca média. */
  it("seguidores viram saldo entre as pontas", () => {
    const s = lerUltimosDias(serie).achados.find((a) => a.metrica === "seguidores")!;
    expect(s.delta).toBe(120);
    expect(s.direcao).toBe("subiu");
  });

  /**
   * Fluxo compara as METADES. Primeiro-contra-último dia num fluxo compara duas
   * amostras de um dia cada — um domingo fraco contra uma terça forte viraria
   * "queda de 60%".
   */
  it("fluxo compara a média das duas metades", () => {
    const v = lerUltimosDias(serie).achados.find((a) => a.metrica === "visitas ao perfil")!;
    // (100+90)/2 = 95 → (200+220)/2 = 210
    expect(v.delta).toBe(115);
    expect(v.direcao).toBe("subiu");
  });

  it("o saldo de seguidores aparece no texto com sinal", () => {
    expect(lerUltimosDias(serie).texto).toContain("+120");
  });
});

describe("movimento pequeno é estabilidade", () => {
  /** Sem um piso, 1% de variação viraria "subiu" e a frase perderia o sentido. */
  it("variação abaixo do piso não vira tendência", () => {
    const r = lerUltimosDias([
      dia("2026-08-10", { visitas: 100 }),
      dia("2026-08-11", { visitas: 101 }),
      dia("2026-08-12", { visitas: 102 }),
      dia("2026-08-13", { visitas: 101 }),
    ]);
    expect(r.achados.find((a) => a.metrica === "visitas ao perfil")!.direcao).toBe("estavel");
    expect(r.texto).toContain("estáveis");
  });
});

describe("o texto agrupa por direção", () => {
  /**
   * "seguidores subiram e visitas caíram" é leitura. Listar cada métrica numa
   * oração é a tabela escrita por extenso — e quem quer a tabela olha a tabela.
   */
  it("junta o que subiu numa oração e o que caiu noutra", () => {
    const r = lerUltimosDias([
      dia("2026-08-10", { seguidores: 1000, visitas: 300, interacoes: 20 }),
      dia("2026-08-11", { seguidores: 1050, visitas: 280, interacoes: 30 }),
      dia("2026-08-12", { seguidores: 1100, visitas: 100, interacoes: 40 }),
      dia("2026-08-13", { seguidores: 1200, visitas: 90, interacoes: 50 }),
    ]);
    expect(r.texto).toMatch(/subiram/);
    expect(r.texto).toMatch(/caíram/);
    // Uma oração por direção, não uma por métrica.
    expect(r.texto!.split(";")).toHaveLength(2);
  });

  it("diz sobre quantos dias está falando", () => {
    const r = lerUltimosDias([
      dia("2026-08-10", { seguidores: 100 }),
      dia("2026-08-11", { seguidores: 120 }),
      dia("2026-08-12", { seguidores: 140 }),
    ]);
    expect(r.texto).toContain("3 dias");
    expect(r.diasMedidos).toBe(3);
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  O veredito do cabeçalho
 * ─────────────────────────────────────────────────────────────────────────────
 *  Ele é a primeira frase que alguém lê na página, e por isso o risco não é
 *  errar o número: é acertar o número e errar o TOM. Um "alta" sobre três
 *  quedas e uma alta faria a tela mentir com dados corretos.
 * ─────────────────────────────────────────────────────────────────────────────
 */
describe("o resumo executivo do cabeçalho", () => {
  const leitura = (achados: Array<[string, "subiu" | "caiu" | "estavel", number]>) => ({
    texto: "…", motivo: null, dadosInsuficientes: false, diasMedidos: 7,
    achados: achados.map(([metrica, direcao, delta]) => ({
      metrica, direcao, delta, percentual: null,
    })),
  });

  it("tudo subindo ⇒ positivo", () => {
    const r = resumoExecutivo(leitura([
      ["seguidores", "subiu", 120], ["visitas ao perfil", "subiu", 30],
    ]));
    expect(r.tom).toBe("positivo");
    expect(r.titulo).toBe("Alta em 2 de 2 métricas");
    expect(r.detalhe).toContain("+120");
  });

  it("tudo caindo ⇒ negativo", () => {
    const r = resumoExecutivo(leitura([
      ["ativações", "caiu", -2], ["visitas ao perfil", "caiu", -40],
    ]));
    expect(r.tom).toBe("negativo");
    expect(r.titulo).toBe("Queda em 2 de 2 métricas");
  });

  /**
   * O caso que protege o tom: uma alta entre três quedas NÃO é semana positiva,
   * e três quedas com uma alta NÃO é negativa. Decidir que seguidores pesam mais
   * seria embutir regra de negócio num rótulo de cor.
   */
  it("uma alta e três quedas ⇒ misto, e não negativo", () => {
    const r = resumoExecutivo(leitura([
      ["seguidores", "subiu", 5], ["ativações", "caiu", -1],
      ["interações", "caiu", -10], ["visitas ao perfil", "caiu", -20],
    ]));
    expect(r.tom).toBe("misto");
    expect(r.titulo).toBe("1 em alta, 3 em queda");
  });

  it("nada se movendo ⇒ estável", () => {
    const r = resumoExecutivo(leitura([
      ["seguidores", "estavel", 0], ["visitas ao perfil", "estavel", 0],
    ]));
    expect(r.tom).toBe("estavel");
    expect(r.titulo).toBe("Estabilidade nas 2 métricas");
  });

  /** Sem achado, o motivo do módulo vira o título — e não um "0%" qualquer. */
  it("sem achados, o tom é sem_dado e o motivo aparece", () => {
    const r = resumoExecutivo({
      texto: null, motivo: "Ainda não há coleta neste período.",
      dadosInsuficientes: true, diasMedidos: 0, achados: [],
    });
    expect(r.tom).toBe("sem_dado");
    expect(r.titulo).toContain("Ainda não há coleta");
    expect(r.detalhe).toBeNull();
  });

  /** Saldo zero não gera detalhe: "estável" duas vezes na mesma caixa. */
  it("seguidores parados não geram linha de detalhe", () => {
    expect(resumoExecutivo(leitura([["seguidores", "estavel", 0]])).detalhe).toBeNull();
  });

  /**
   * Seguidores caindo enquanto o resto sobe: o tom é misto E o detalhe mostra a
   * perda. É o caso em que só o título esconderia a única perda irreversível.
   */
  it("saldo negativo aparece com sinal, mesmo em semana mista", () => {
    const r = resumoExecutivo(leitura([
      ["seguidores", "caiu", -37], ["visitas ao perfil", "subiu", 100],
    ]));
    expect(r.tom).toBe("misto");
    expect(r.detalhe).toContain("−37");
  });

  it("o título nunca vira a enumeração da tabela", () => {
    const r = resumoExecutivo(leitura([
      ["seguidores", "caiu", -1], ["ativações", "caiu", -2],
      ["interações", "caiu", -3], ["visitas ao perfil", "caiu", -4],
    ]));
    for (const nome of ["ativações", "interações", "visitas"]) {
      expect(r.titulo, nome).not.toContain(nome);
    }
    expect(r.titulo.length).toBeLessThan(40);
  });
});
