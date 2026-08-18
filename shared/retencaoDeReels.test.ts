/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Os sete cenários, e a regra que não pode cair
 * ─────────────────────────────────────────────────────────────────────────────
 *  A regra: nenhum número desta frente sai de `total_views`. A sondagem provou
 *  que o denominador de `ig_reels_avg_watch_time` não é nenhuma métrica de views
 *  que a API entrega — 7.957 espectadores implícitos contra 54.977 medidos.
 *
 *  O jeito de essa regra cair não é alguém escrevendo `tempo / views` de
 *  propósito: é alguém "melhorando" a média do topo ponderando-a por views, que
 *  parece mais preciso e usa o denominador proibido. Por isso o teste da
 *  ponderação existe.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, expect, it } from "vitest";
import {
  estadoDaMetrica, formatarSegundos, formatarTaxa, rankingDeAbandono,
  resumoDaRetencao, segundosDe, type ReelMedido,
} from "./retencaoDeReels";

const reel = (p: Partial<ReelMedido> & { mediaId: string }): ReelMedido => ({
  publicadoEm: "2026-08-14T12:00:00+0000", thumbnailUrl: null, permalink: null,
  skipRate: null, avgWatchTimeMs: null, views: null, recusadas: {}, ...p,
});

/** Os quatro Reels da execução real de 17/08/2026. */
const REAIS = [
  reel({ mediaId: "18064400852242964", skipRate: 57.6, avgWatchTimeMs: 7601, views: 54_977 }),
  reel({ mediaId: "18076551991961795", skipRate: 52.9, avgWatchTimeMs: 6495, views: null }),
  reel({ mediaId: "18052524151921256", skipRate: 61.4, avgWatchTimeMs: 5718, views: null }),
  reel({ mediaId: "18051067261856304", skipRate: 65.3, avgWatchTimeMs: 5964, views: null }),
];

describe("os sete cenários do pedido", () => {
  it("1 · Reel com skip_rate e avg_watch_time", () => {
    const r = reel({ mediaId: "a", skipRate: 57.6, avgWatchTimeMs: 7601 });
    expect(estadoDaMetrica(r, "skipRate")).toBe("medido");
    expect(estadoDaMetrica(r, "avgWatchTimeMs")).toBe("medido");
    expect(formatarTaxa(r.skipRate)).toBe("57,6%");
    expect(formatarSegundos(r.avgWatchTimeMs)).toBe("7,60s");
  });

  it("2 · Reel sem skip_rate: fica FORA do ranking, e não entra como zero", () => {
    const semTaxa = reel({ mediaId: "a", avgWatchTimeMs: 7601 });
    const r = rankingDeAbandono([...REAIS, semTaxa]);
    expect(r.ordenados.map((x) => x.mediaId)).not.toContain("a");
    expect(r.semTaxa.map((x) => x.reel.mediaId)).toEqual(["a"]);
    // Se entrasse como 0%, seria o primeiro em "menor abandono".
    expect(r.menorAbandono[0].mediaId).not.toBe("a");
  });

  it("3 · Reel sem avg_watch_time continua no ranking — o critério é a taxa", () => {
    const soTaxa = reel({ mediaId: "a", skipRate: 99 });
    const r = rankingDeAbandono([...REAIS, soTaxa]);
    expect(r.maiorAbandono[0].mediaId).toBe("a");
    expect(formatarSegundos(soTaxa.avgWatchTimeMs)).toBe("–");
  });

  it("4 · Reel sem nenhuma das duas some do ranking e é contado à parte", () => {
    const vazio = reel({ mediaId: "a" });
    const r = rankingDeAbandono([vazio]);
    expect(r.ordenados).toEqual([]);
    expect(r.semTaxa).toHaveLength(1);
    expect(resumoDaRetencao([vazio])).toMatchObject({
      taxaMedia: null, tempoMedioMs: null, views: null, total: 1,
    });
  });

  /**
   * Zero MEDIDO é dado: ninguém abandonou. Ele tem de aparecer, e é justamente
   * onde um `|| null` distraído o transformaria em ausência.
   */
  it("5 · skip_rate = 0 é medido, entra no ranking e vira '0,0%'", () => {
    const zero = reel({ mediaId: "a", skipRate: 0 });
    expect(estadoDaMetrica(zero, "skipRate")).toBe("medido");
    expect(formatarTaxa(0)).toBe("0,0%");
    const r = rankingDeAbandono([...REAIS, zero]);
    expect(r.menorAbandono[0].mediaId).toBe("a");
    expect(r.ordenados).toHaveLength(5);
  });

  it("6 · skip_rate = 100 lidera o maior abandono", () => {
    const cem = reel({ mediaId: "a", skipRate: 100 });
    const r = rankingDeAbandono([...REAIS, cem]);
    expect(r.maiorAbandono[0].mediaId).toBe("a");
    expect(formatarTaxa(100)).toBe("100,0%");
  });

  it("7 · decimais sobrevivem à formatação e à média", () => {
    const s = resumoDaRetencao(REAIS);
    // (57,6 + 52,9 + 61,4 + 65,3) / 4 = 59,3
    expect(s.taxaMedia).toBeCloseTo(59.3, 5);
    expect(formatarTaxa(s.taxaMedia)).toBe("59,3%");
    expect(segundosDe(7601)).toBe(7.601);
    expect(formatarSegundos(6495)).toBe("6,50s");
  });
});

describe("as duas pontas do resumo recolhido", () => {
  it("menor e maior taxa saem das medidas, e batem com o ranking", () => {
    const s = resumoDaRetencao(REAIS);
    const r = rankingDeAbandono(REAIS);
    expect(s.menorTaxa).toBe(52.9);
    expect(s.maiorTaxa).toBe(65.3);
    expect(s.maiorTaxa).toBe(r.ordenados[0].skipRate);
    expect(s.menorTaxa).toBe(r.ordenados[r.ordenados.length - 1].skipRate);
  });

  /** Reel sem taxa não pode virar a ponta de baixo entrando como 0%. */
  it("Reel sem taxa não vira o menor abandono", () => {
    const s = resumoDaRetencao([...REAIS, reel({ mediaId: "x" })]);
    expect(s.menorTaxa).toBe(52.9);
  });

  it("zero MEDIDO é a ponta de baixo, e aparece", () => {
    const s = resumoDaRetencao([...REAIS, reel({ mediaId: "x", skipRate: 0 })]);
    expect(s.menorTaxa).toBe(0);
    expect(formatarTaxa(s.menorTaxa)).toBe("0,0%");
  });

  it("sem nenhuma taxa medida, as duas pontas são nulas", () => {
    expect(resumoDaRetencao([reel({ mediaId: "x" })])).toMatchObject({
      menorTaxa: null, maiorTaxa: null,
    });
  });
});

describe("nada é derivado de total_views", () => {
  /**
   * O teste central. `total_views` muda em 10× e NENHUM número da retenção se
   * mexe — é a prova de que views não é insumo de taxa nem de tempo.
   */
  it("mudar total_views não altera taxa nem tempo médio", () => {
    const magros = REAIS.map((r) => ({ ...r, views: 100 }));
    const gordos = REAIS.map((r) => ({ ...r, views: 1_000_000 }));
    const a = resumoDaRetencao(magros);
    const b = resumoDaRetencao(gordos);
    expect(a.taxaMedia).toBe(b.taxaMedia);
    expect(a.tempoMedioMs).toBe(b.tempoMedioMs);
    expect(a.menorTaxa).toBe(b.menorTaxa);
    expect(a.maiorTaxa).toBe(b.maiorTaxa);
    // E o que MUDA é só a contagem, que é o que views é.
    expect(a.views).not.toBe(b.views);
  });

  /**
   * A média do topo é simples, e não ponderada por views.
   *
   * Ponderar parece mais preciso e é justamente como o denominador proibido
   * voltaria: um Reel com 54.977 views dominaria a média, e o número deixaria
   * de ser "média dos Reels" para virar uma taxa da conta que ninguém mediu.
   */
  it("a média das taxas não é ponderada por views", () => {
    const s = resumoDaRetencao([
      reel({ mediaId: "a", skipRate: 20, views: 1_000_000 }),
      reel({ mediaId: "b", skipRate: 80, views: 1 }),
    ]);
    expect(s.taxaMedia).toBe(50); // ponderada daria ~20
    expect(s.reelsComTaxa).toBe(2);
  });

  it("mudar total_views não altera a ordem do ranking", () => {
    const invertido = REAIS.map((r, i) => ({ ...r, views: (4 - i) * 10_000 }));
    expect(rankingDeAbandono(invertido).ordenados.map((r) => r.mediaId))
      .toEqual(rankingDeAbandono(REAIS).ordenados.map((r) => r.mediaId));
  });

  it("Reel sem views continua no ranking e no resumo das outras duas", () => {
    const s = resumoDaRetencao(REAIS);
    expect(s.reelsComViews).toBe(1);
    expect(s.reelsComTaxa).toBe(4);
    expect(s.views).toBe(54_977);
  });
});

describe("os quatro estados chegam à tela separados", () => {
  it("recusada pela Meta ≠ não perguntada", () => {
    const recusado = reel({ mediaId: "a", recusadas: { reels_skip_rate: "Meta (100): não suportada" } });
    const naoPerguntado = reel({ mediaId: "b" });
    expect(estadoDaMetrica(recusado, "skipRate")).toBe("recusado");
    expect(estadoDaMetrica(naoPerguntado, "skipRate")).toBe("nao_perguntado");
  });

  it("sem coleta no período tem estado próprio", () => {
    expect(estadoDaMetrica(reel({ mediaId: "a" }), "skipRate", false)).toBe("sem_coleta");
  });

  it("o motivo da exclusão do ranking distingue recusa de silêncio", () => {
    const r = rankingDeAbandono([
      reel({ mediaId: "a", recusadas: { reels_skip_rate: "Meta (100): não suportada" } }),
      reel({ mediaId: "b" }),
    ]);
    expect(r.semTaxa.find((x) => x.reel.mediaId === "a")?.motivo).toContain("recusou");
    expect(r.semTaxa.find((x) => x.reel.mediaId === "b")?.motivo).toContain("não medida");
  });
});

describe("o ranking usa só a taxa de abandono", () => {
  it("tempo médio não influencia a ordem", () => {
    const base = [
      reel({ mediaId: "a", skipRate: 60, avgWatchTimeMs: 1000 }),
      reel({ mediaId: "b", skipRate: 50, avgWatchTimeMs: 90_000 }),
    ];
    expect(rankingDeAbandono(base).ordenados.map((r) => r.mediaId)).toEqual(["a", "b"]);
    // Invertendo só os tempos, a ordem não muda.
    const trocado = [
      { ...base[0], avgWatchTimeMs: 90_000 },
      { ...base[1], avgWatchTimeMs: 1000 },
    ];
    expect(rankingDeAbandono(trocado).ordenados.map((r) => r.mediaId)).toEqual(["a", "b"]);
  });

  /** Empate desempata por id — nunca por outra grandeza entrando de lado. */
  it("taxas empatadas desempatam por id, não por tempo", () => {
    const r = rankingDeAbandono([
      reel({ mediaId: "z", skipRate: 50, avgWatchTimeMs: 90_000 }),
      reel({ mediaId: "a", skipRate: 50, avgWatchTimeMs: 1000 }),
    ]);
    expect(r.ordenados.map((x) => x.mediaId)).toEqual(["a", "z"]);
  });

  it("com poucos Reels, a amostra é declarada pequena", () => {
    expect(resumoDaRetencao(REAIS).amostraPequena).toBe(true);
    expect(resumoDaRetencao([...REAIS, reel({ mediaId: "e", skipRate: 1 })]).amostraPequena).toBe(false);
    // Zero Reels não é "amostra pequena": é ausência, e a tela diz outra coisa.
    expect(resumoDaRetencao([]).amostraPequena).toBe(false);
  });

  it("maior e menor não repetem o mesmo Reel quando há de sobra", () => {
    const muitos = Array.from({ length: 8 }, (_, i) =>
      reel({ mediaId: `r${i}`, skipRate: 10 + i * 5 }));
    const r = rankingDeAbandono(muitos);
    const nomes = new Set([...r.maiorAbandono, ...r.menorAbandono].map((x) => x.mediaId));
    expect(nomes.size).toBe(6);
  });
});
