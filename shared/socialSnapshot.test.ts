/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Quatro estados, e a direção que ainda não está provada
 * ─────────────────────────────────────────────────────────────────────────────
 *  Dois riscos moram aqui, e os dois produzem números plausíveis:
 *
 *   ZERO       um zero de consolo é indistinguível de um zero real. Some dentro
 *              de qualquer média, e ninguém consegue apontar o dia em que a
 *              coleta falhou.
 *
 *   DIREÇÃO    `follows_and_unfollows` veio com FOLLOWER / NON_FOLLOWER, e não
 *              FOLLOW / UNFOLLOW. Se as dimensões forem segmentação de audiência
 *              e não direção da ação, ler uma como "novos" e a outra como
 *              "saídas" INVERTE a tendência que o cliente vê — e o gráfico
 *              continua bonito.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, expect, it } from "vitest";
import {
  DIAS_PARA_CONFIRMAR_DIRECAO, ROTULO_ESTADO, lerMetrica, podeMostrarEntradasESaidas,
  saldoDeSeguidores, somarNoPeriodo, valorOuNulo, validarDirecaoDeSeguidores,
  type AmostraDeSeguidores,
} from "./socialSnapshot";

// ─── Os quatro estados ──────────────────────────────────────────────────────

describe("uma métrica tem quatro estados, e nenhum deles é 'quase zero'", () => {
  const snap = {
    metricas: { reach: 287, website_clicks: 0, profile_views: null },
    recusadas: { impressions: "Meta (100): métrica descontinuada" },
  };

  it("medido com valor real", () => {
    expect(lerMetrica("reach", snap)).toEqual({ estado: "medido", valor: 287 });
  });

  /** O zero que É zero: a Meta mediu e não houve clique. */
  it("zero medido continua sendo zero, e não vira ausência", () => {
    expect(lerMetrica("website_clicks", snap)).toEqual({ estado: "medido", valor: 0 });
  });

  it("recusado carrega o motivo, em vez de sumir", () => {
    const e = lerMetrica("impressions", snap);
    expect(e.estado).toBe("recusado");
    expect(e.estado === "recusado" && e.motivo).toContain("descontinuada");
  });

  it("null sem recusa é 'não perguntamos'", () => {
    expect(lerMetrica("profile_views", snap)).toEqual({ estado: "nao_perguntado" });
    expect(lerMetrica("nunca_pedida", snap)).toEqual({ estado: "nao_perguntado" });
  });

  /** O quarto estado, que não é sobre o cliente: é sobre nós. */
  it("dia sem snapshot é 'sem coleta', e não zero", () => {
    expect(lerMetrica("reach", null)).toEqual({ estado: "sem_coleta" });
    expect(lerMetrica("reach", undefined)).toEqual({ estado: "sem_coleta" });
  });

  it("os quatro estados são distintos entre si", () => {
    const estados = [
      lerMetrica("reach", snap).estado,
      lerMetrica("impressions", snap).estado,
      lerMetrica("profile_views", snap).estado,
      lerMetrica("reach", null).estado,
    ];
    expect(new Set(estados).size).toBe(4);
  });

  it("só 'medido' vira número; o resto vira null e nunca 0", () => {
    expect(valorOuNulo(lerMetrica("website_clicks", snap))).toBe(0);
    expect(valorOuNulo(lerMetrica("impressions", snap))).toBeNull();
    expect(valorOuNulo(lerMetrica("profile_views", snap))).toBeNull();
    expect(valorOuNulo(lerMetrica("reach", null))).toBeNull();
  });

  it("todo estado tem rótulo legível", () => {
    for (const e of ["medido", "recusado", "nao_perguntado", "sem_coleta"] as const) {
      expect(ROTULO_ESTADO[e], e).toBeTruthy();
    }
  });
});

describe("soma no período declara quantos dias entraram", () => {
  const dia = (d: string, v: number | null) => ({ dia: d, metricas: { stories: v } });

  /**
   * Sem os dias declarados, 12 stories em 18 dias medidos fica idêntico a 12 em
   * 30 — e a média por dia sai errada sem nada denunciar.
   */
  it("soma só os dias medidos, e informa os que faltaram", () => {
    const r = somarNoPeriodo("stories", [dia("2026-08-01", 4), null, dia("2026-08-03", 8), dia("2026-08-04", null)]);
    expect(r.total).toBe(12);
    expect(r.diasMedidos).toBe(2);
    expect(r.diasSemDado).toBe(2);
  });

  /** Zero medido conta como dia medido — é informação, não ausência. */
  it("dia com zero real entra na contagem de medidos", () => {
    const r = somarNoPeriodo("stories", [dia("2026-08-01", 0), dia("2026-08-02", 0)]);
    expect(r.total).toBe(0);
    expect(r.diasMedidos).toBe(2);
  });

  it("nenhum dia medido devolve null, e não 0", () => {
    const r = somarNoPeriodo("stories", [null, null]);
    expect(r.total).toBeNull();
    expect(r.diasSemDado).toBe(2);
  });
});

// ─── Saldo ──────────────────────────────────────────────────────────────────

const a = (dia: string, total: number | null, follower: number | null = null, naoSeguidor: number | null = null): AmostraDeSeguidores =>
  ({ dia, total, follower, naoSeguidor });

describe("saldo de seguidores sai do total, e de mais nada", () => {
  it("é a diferença entre a primeira e a última medição", () => {
    const r = saldoDeSeguidores([a("2026-08-01", 9400), a("2026-08-05", 9464), a("2026-08-03", 9430)]);
    expect(r.saldo).toBe(64);
    expect(r.inicio).toBe(9400);
    expect(r.fim).toBe(9464);
    expect(r.diasCobertos).toBe(3);
  });

  it("saldo negativo é saldo", () => {
    expect(saldoDeSeguidores([a("2026-08-01", 9464), a("2026-08-02", 9460)]).saldo).toBe(-4);
  });

  /** Um ponto só não é variação — é uma foto. */
  it("com uma medição só, não há saldo", () => {
    const r = saldoDeSeguidores([a("2026-08-01", 9464)]);
    expect(r.saldo).toBeNull();
    expect(r.fim).toBe(9464);
  });

  it("dias sem total são ignorados em vez de contarem como zero seguidores", () => {
    const r = saldoDeSeguidores([a("2026-08-01", 9400), a("2026-08-02", null), a("2026-08-03", 9410)]);
    expect(r.saldo).toBe(10);
    expect(r.diasCobertos).toBe(2);
  });

  it("sem nenhuma medição, tudo null e nada explode", () => {
    expect(saldoDeSeguidores([]).saldo).toBeNull();
  });
});

// ─── A direção ──────────────────────────────────────────────────────────────

describe("a direção do breakdown se prova por aritmética, não por dedução", () => {
  /** Leitura A: o delta do total fecha com FOLLOWER − NON_FOLLOWER todo dia. */
  const serieQueFecha: AmostraDeSeguidores[] = [
    a("2026-08-01", 9000),
    a("2026-08-02", 9010, 15, 5),
    a("2026-08-03", 9008, 4, 6),
    a("2026-08-04", 9020, 20, 8),
    a("2026-08-05", 9025, 10, 5),
    a("2026-08-06", 9030, 7, 2),
  ];

  it("cinco dias consecutivos fechando confirmam a leitura", () => {
    const v = validarDirecaoDeSeguidores(serieQueFecha);
    expect(v.veredito).toBe("confirmado");
    expect(v.diasConferidos).toBe(5);
    expect(v.diasQueBateram).toBe(5);
    expect(v.explicacao).toContain("entradas");
    expect(podeMostrarEntradasESaidas(v)).toBe(true);
  });

  /**
   * Uma divergência basta: se a leitura A valesse, a identidade seria exata
   * todo dia. Não fechar uma vez já diz que a dimensão é outra coisa.
   */
  it("uma única divergência refuta, e nomeia o dia", () => {
    const comFuro = serieQueFecha.slice();
    comFuro[3] = a("2026-08-04", 9020, 3, 1); // delta 12, breakdown 2
    const v = validarDirecaoDeSeguidores(comFuro);
    expect(v.veredito).toBe("refutado");
    expect(v.divergencias).toHaveLength(1);
    expect(v.divergencias[0].dia).toBe("2026-08-04");
    expect(v.divergencias[0].deltaTotal).toBe(12);
    expect(v.divergencias[0].diferencaDoBreakdown).toBe(2);
    expect(v.explicacao).toContain("segmentação de audiência");
    expect(podeMostrarEntradasESaidas(v)).toBe(false);
  });

  it("poucos dias ainda não decidem nada", () => {
    const v = validarDirecaoDeSeguidores(serieQueFecha.slice(0, 3));
    expect(v.veredito).toBe("indeterminado");
    expect(v.explicacao).toContain(`de ${DIAS_PARA_CONFIRMAR_DIRECAO}`);
    expect(podeMostrarEntradasESaidas(v)).toBe(false);
  });

  /**
   * Com um buraco, o delta do total abrange dois dias enquanto o breakdown fala
   * de um — a conta não fecharia por um motivo que nada tem a ver com semântica,
   * e a leitura seria refutada por engano.
   */
  it("dias não consecutivos são pulados em vez de refutarem por engano", () => {
    const v = validarDirecaoDeSeguidores([
      a("2026-08-01", 9000),
      a("2026-08-05", 9100, 10, 2), // salto de 4 dias: delta 100, breakdown 8
    ]);
    expect(v.veredito).toBe("indeterminado");
    expect(v.diasConferidos).toBe(0);
    expect(v.divergencias).toEqual([]);
  });

  it("dia sem breakdown não conta como conferido", () => {
    const v = validarDirecaoDeSeguidores([a("2026-08-01", 9000), a("2026-08-02", 9010)]);
    expect(v.diasConferidos).toBe(0);
    expect(v.veredito).toBe("indeterminado");
  });

  it("dia sem total também não conta", () => {
    const v = validarDirecaoDeSeguidores([a("2026-08-01", null), a("2026-08-02", 9010, 5, 1)]);
    expect(v.diasConferidos).toBe(0);
  });

  it("a ordem de entrada não importa", () => {
    const embaralhada = [serieQueFecha[3], serieQueFecha[0], serieQueFecha[5], serieQueFecha[1], serieQueFecha[4], serieQueFecha[2]];
    expect(validarDirecaoDeSeguidores(embaralhada).veredito).toBe("confirmado");
  });

  /** A trava que o pedido pede: nada de "novos" e "saídas" antes da prova. */
  it("só o veredito confirmado libera entradas e saídas na tela", () => {
    for (const s of [serieQueFecha.slice(0, 2), serieQueFecha.slice(0, 4)]) {
      expect(podeMostrarEntradasESaidas(validarDirecaoDeSeguidores(s))).toBe(false);
    }
  });

  it("lista vazia não decide nada e não explode", () => {
    const v = validarDirecaoDeSeguidores([]);
    expect(v.veredito).toBe("indeterminado");
    expect(v.explicacao).toContain("dois dias consecutivos");
  });
});
