/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Um selo de variação errado é pior que selo nenhum
 * ─────────────────────────────────────────────────────────────────────────────
 *  Ele fica no topo do card, em verde ou vermelho, e ninguém confere a conta.
 *  Três formas de errar, e as três produzem números que parecem certos:
 *
 *   PERÍODO QUE NÃO EXISTE   comparar 30 dias exige 60 de série, e a série tem
 *                            30. Um "0%" ali afirma estabilidade sobre dias que
 *                            ninguém mediu
 *
 *   LADOS DESIGUAIS          se o anterior tem buraco de coleta, ele cobre menos
 *                            dias e soma menos — e o selo diria "caiu" sobre uma
 *                            falha nossa
 *
 *   BASE ZERO                dividir por zero dá Infinity, que sai na tela como
 *                            percentual absurdo em vez de como ausência
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, expect, it } from "vitest";
import { compararComAnterior, variacao, type DiaComMetricas } from "./periodoAnterior";

const dia = (d: string, v: number | null): DiaComMetricas =>
  ({ dia: d, metricas: v == null ? {} : { visitas: v } });
const ler = (d: DiaComMetricas) => (typeof d.metricas.visitas === "number" ? d.metricas.visitas : null);

/** 6 dias seguidos: 01–03 é o anterior, 04–06 é o atual. */
const SERIE = [
  dia("2026-08-01", 10), dia("2026-08-02", 10), dia("2026-08-03", 10),
  dia("2026-08-04", 20), dia("2026-08-05", 20), dia("2026-08-06", 20),
];
const JANELA = { inicio: "2026-08-04", fim: "2026-08-06" };

describe("a comparação que funciona", () => {
  it("soma os mesmos 3 dias imediatamente antes", () => {
    const c = compararComAnterior(SERIE, JANELA, ler);
    expect(c.anterior).toBe(30);
    expect(c.diasAtual).toBe(3);
    expect(c.diasAnterior).toBe(3);
    expect(c.comparavel).toBe(true);
    expect(variacao(60, c)).toBe(100);
  });

  it("queda também é dita, com sinal", () => {
    const c = compararComAnterior(SERIE, { inicio: "2026-08-01", fim: "2026-08-03" }, ler);
    // Não há dias antes de 01 na série.
    expect(c.anterior).toBeNull();
    expect(variacao(30, c)).toBeNull();
  });
});

describe("saber que não dá para comparar", () => {
  /**
   * O caso do filtro de 30 dias: a série tem 30 coletas, e o anterior exigiria
   * outras 30. Sem selo é a resposta certa.
   */
  it("sem período anterior na série, devolve null", () => {
    const c = compararComAnterior(SERIE, { inicio: "2026-07-01", fim: "2026-07-30" }, ler);
    expect(c.anterior).toBeNull();
    expect(c.comparavel).toBe(false);
    expect(variacao(500, c)).toBeNull();
  });

  /**
   * Buraco no anterior: 2 dias medidos contra 3 do atual. A soma menor pode ser
   * falta de coleta, não queda — e o selo diria "caiu".
   */
  it("lados com números de dias diferentes não são comparáveis", () => {
    const comBuraco = [
      dia("2026-08-01", 10), dia("2026-08-02", null), dia("2026-08-03", 10),
      dia("2026-08-04", 20), dia("2026-08-05", 20), dia("2026-08-06", 20),
    ];
    const c = compararComAnterior(comBuraco, JANELA, ler);
    expect(c.diasAnterior).toBe(2);
    expect(c.diasAtual).toBe(3);
    expect(c.comparavel).toBe(false);
    expect(variacao(60, c)).toBeNull();
  });

  /** Infinity na tela é um percentual absurdo, não uma ausência. */
  it("base zero não vira percentual", () => {
    const zerado = [
      dia("2026-08-01", 0), dia("2026-08-02", 0), dia("2026-08-03", 0),
      dia("2026-08-04", 5), dia("2026-08-05", 5), dia("2026-08-06", 5),
    ];
    const c = compararComAnterior(zerado, JANELA, ler);
    expect(c.anterior).toBe(0);
    expect(variacao(15, c)).toBeNull();
  });

  it("valor atual ausente não compara", () => {
    expect(variacao(null, compararComAnterior(SERIE, JANELA, ler))).toBeNull();
  });
});

describe("a janela anterior é de CALENDÁRIO, não de registros", () => {
  /**
   * Contar "os N registros anteriores" esticaria a janela para trás quando
   * houvesse buraco — comparando 3 dias atuais com 3 dias espalhados por uma
   * semana, sem ninguém notar.
   */
  it("dias faltando não esticam a janela para trás", () => {
    const esparsa = [
      dia("2026-07-20", 99), // muito antes — não pode entrar
      dia("2026-08-02", 10), dia("2026-08-03", 10),
      dia("2026-08-04", 20), dia("2026-08-05", 20), dia("2026-08-06", 20),
    ];
    const c = compararComAnterior(esparsa, JANELA, ler);
    // Só 02 e 03 caem em 01–03. O 20/07 fica fora.
    expect(c.anterior).toBe(20);
    expect(c.diasAnterior).toBe(2);
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  O alcance da série decide se o selo de variação existe
 * ─────────────────────────────────────────────────────────────────────────────
 *  Esta suíte nasceu de um sintoma real: as quatro métricas da Social perderam o
 *  indicador ao mesmo tempo, e a causa não estava na comparação — estava em
 *  quantos dias chegavam até ela. A página recebia 30 dias, e um período de 30
 *  dias precisa alcançar o dia −60 para ter com o que se comparar.
 *
 *  O sintoma é traiçoeiro porque parece problema de dado do cliente: nenhum erro,
 *  nenhum log, só um canto de cartão vazio.
 * ─────────────────────────────────────────────────────────────────────────────
 */
describe("o alcance da série é o que decide se há comparação", () => {
  const DIA_MS = 86_400_000;
  const hoje = Date.UTC(2026, 7, 19);
  const dia = (atras: number) => new Date(hoje - atras * DIA_MS).toISOString().slice(0, 10);

  /** `n` dias de coleta completa, terminando hoje. */
  const serie = (n: number, valor = (i: number) => 100 + i) =>
    Array.from({ length: n }, (_, i) => ({
      dia: dia(n - 1 - i), metricas: { profile_views: valor(i) },
    }));
  const ler = (d: { metricas: Record<string, number> }) => d.metricas.profile_views ?? null;
  const janela = (dias: number) => ({ inicio: dia(dias - 1), fim: dia(0) });
  const soma = (s: ReturnType<typeof serie>, j: { inicio: string; fim: string }) =>
    s.filter((d) => d.dia >= j.inicio && d.dia <= j.fim).reduce((n, d) => n + (ler(d) ?? 0), 0);

  it("com 30 dias de alcance, um período de 30 dias NÃO tem o que comparar", () => {
    // O sintoma exato, reproduzido: nada de errado com o cliente, só com o
    // recorte que chegou até aqui.
    const c = compararComAnterior(serie(30), janela(30), ler);
    expect(c.diasAnterior).toBe(0);
    expect(c.comparavel).toBe(false);
    expect(variacao(1000, c)).toBeNull();
  });

  it("com 70 dias de alcance, o mesmo período de 30 dias compara", () => {
    const s = serie(70);
    const j = janela(30);
    const c = compararComAnterior(s, j, ler);
    expect(c.diasAtual).toBe(30);
    expect(c.diasAnterior).toBe(30);
    expect(c.comparavel).toBe(true);
    expect(variacao(soma(s, j), c)).not.toBeNull();
  });

  it("7 e 14 dias já comparavam com 30 de alcance — o conserto não os muda", () => {
    for (const dias of [1, 7, 14]) {
      const s = serie(30);
      const c = compararComAnterior(s, janela(dias), ler);
      expect(c.comparavel, `${dias}d`).toBe(true);
      expect(variacao(soma(s, janela(dias)), c), `${dias}d`).not.toBeNull();
    }
  });

  /**
   * Alargar o alcance NÃO afrouxa a régua.
   *
   * `comparavel` continua exigindo o mesmo número de dias medidos dos dois
   * lados. O conserto deixa de esconder dias que existem; ele não passa a
   * inventar os que não existem.
   */
  it("mais alcance não transforma série incompleta em comparável", () => {
    // O buraco precisa cair DENTRO da janela anterior (dias -30 a -59) para
    // significar algo: um dia faltando 64 dias atrás não é lido por ninguém.
    const s = serie(70).filter((d) => d.dia !== dia(45));
    expect(s.some((x) => x.dia === dia(45))).toBe(false);
    const c = compararComAnterior(s, janela(30), ler);
    expect(c.comparavel).toBe(false);
    expect(variacao(1000, c)).toBeNull();
  });

  describe("os três sentidos que o selo precisa distinguir", () => {
    /** Período atual e anterior com totais escolhidos a dedo. */
    const comTotais = (anterior: number, atual: number) => {
      const s = [
        ...Array.from({ length: 7 }, (_, i) => ({
          dia: dia(13 - i), metricas: { profile_views: anterior / 7 },
        })),
        ...Array.from({ length: 7 }, (_, i) => ({
          dia: dia(6 - i), metricas: { profile_views: atual / 7 },
        })),
      ];
      const c = compararComAnterior(s, janela(7), ler);
      return { c, pct: variacao(atual, c) };
    };

    it("aumento devolve percentual positivo", () => {
      const { pct } = comTotais(700, 840);
      expect(pct).toBeCloseTo(20, 6);
    });

    it("queda devolve percentual negativo", () => {
      const { pct } = comTotais(1000, 800);
      expect(pct).toBeCloseTo(-20, 6);
    });

    it("estabilidade devolve ZERO medido, e não ausência", () => {
      // A distinção que o cartão precisa fazer na tela: zero é um fato sobre a
      // conta, `null` é um limite nosso. Confundi-los faz "não mudou" e "não
      // sabemos" virarem o mesmo selo.
      const { pct } = comTotais(700, 700);
      expect(pct).toBe(0);
      expect(pct).not.toBeNull();
    });

    it("base zero não vira variação infinita", () => {
      const { pct } = comTotais(0, 500);
      expect(pct).toBeNull();
    });
  });
});
