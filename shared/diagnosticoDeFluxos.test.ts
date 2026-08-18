/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  O diagnóstico não pode autorizar o que não mediu
 * ─────────────────────────────────────────────────────────────────────────────
 *  O risco aqui é assimétrico. Um "indeterminado" a mais custa alguns dias de
 *  espera; um "confirmado" a mais coloca na tela do cliente uma contagem de
 *  quem deixou de seguir que pode estar invertida — e ninguém confere.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, expect, it } from "vitest";
import { diagnosticarFluxos } from "./diagnosticoDeFluxos";

const dia = (
  d: string, total: number | null,
  follower: number | null = null, naoSeguidor: number | null = null,
  followerCount: number | null = null,
) => ({ dia: d, total, follower, naoSeguidor, followerCount });

/** Cinco dias em que a identidade fecha exatamente — a leitura A. */
const FECHA = [
  dia("2026-08-10", 1000, null, null, null),
  dia("2026-08-11", 1008, 11, 3, 11),
  dia("2026-08-12", 1005, 7, 10, 7),
  dia("2026-08-13", 1012, 9, 2, 9),
  dia("2026-08-14", 1012, 4, 4, 4),
  dia("2026-08-15", 1020, 12, 4, 12),
];

describe("a decisão sai da aritmética", () => {
  it("cinco dias fechando ⇒ confirmado, e os fluxos são liberados", () => {
    const r = diagnosticarFluxos(FECHA);
    expect(r.veredito).toBe("confirmado");
    expect(r.podePublicarFluxos).toBe(true);
    expect(r.diasConferidos).toBe(5);
    expect(r.texto).toContain("ENTRADAS = FOLLOWER");
  });

  /**
   * Uma divergência REFUTA. A identidade é contábil, não estatística — não há
   * "quase fecha", e tratar como ruído é o caminho para publicar o inverso.
   */
  it("um único dia que não fecha refuta tudo", () => {
    const comFuro = [...FECHA];
    comFuro[3] = dia("2026-08-13", 1012, 9, 5, 9); // 9−5=4, mas o saldo foi +7
    const r = diagnosticarFluxos(comFuro);
    expect(r.veredito).toBe("refutado");
    expect(r.podePublicarFluxos).toBe(false);
    expect(r.texto).toContain("segmentação de audiência");
    expect(r.texto).toContain("INDISPONÍVEIS");
  });

  it("poucos dias ⇒ indeterminado, e nada é liberado", () => {
    const r = diagnosticarFluxos(FECHA.slice(0, 3));
    expect(r.veredito).toBe("indeterminado");
    expect(r.podePublicarFluxos).toBe(false);
    expect(r.texto).toContain("único número seguro é o");
  });

  it("sem breakdown nenhum, não há o que conferir", () => {
    const r = diagnosticarFluxos([
      dia("2026-08-10", 1000, null, null, 5),
      dia("2026-08-11", 1008, null, null, 11),
    ]);
    expect(r.diasComBreakdown).toBe(0);
    expect(r.veredito).toBe("indeterminado");
    expect(r.dias[0].fecha).toBeNull();
  });

  /**
   * Buraco de coleta não pode acusar a métrica: com um dia faltando, o delta do
   * total abrange dois dias e o breakdown fala de um. A conta não fecharia por
   * um motivo que nada tem a ver com a semântica.
   */
  it("dia não consecutivo fica fora da conferência", () => {
    const r = diagnosticarFluxos([
      dia("2026-08-10", 1000, 5, 1, 5),
      dia("2026-08-12", 1030, 5, 1, 5), // pulou o 11
    ]);
    expect(r.dias).toHaveLength(0);
    expect(r.diasConferidos).toBe(0);
    expect(r.veredito).toBe("indeterminado");
  });
});

describe("o relatório mostra a regra atual ao lado da alternativa", () => {
  /** É a comparação lado a lado que torna a divergência visível. */
  it("cada dia traz saldo real, previsão do breakdown e a saída de hoje", () => {
    const r = diagnosticarFluxos(FECHA);
    const d = r.dias.find((x) => x.dia === "2026-08-12")!;
    expect(d.saldo).toBe(-3);                 // 1005 − 1008
    expect(d.previstoPelaLeituraA).toBe(-3);  // 7 − 10
    expect(d.fecha).toBe(true);
    expect(d.followerCount).toBe(7);
    expect(d.saidasPelaRegraAtual).toBe(10);  // 7 − (−3)
  });

  /**
   * A trava de negativo da regra atual aparece como "anulada" — é o que a tela
   * mostra hoje, e o relatório não pode escondê-la.
   */
  it("saída derivada negativa aparece como anulada, e não como zero", () => {
    const r = diagnosticarFluxos([
      dia("2026-08-10", 1000, null, null, null),
      dia("2026-08-11", 1020, null, null, 5), // saldo +20, entradas 5 ⇒ −15
    ]);
    expect(r.dias[0].saidasPelaRegraAtual).toBeNull();
    expect(r.texto).toContain("anulada");
  });

  it("o relatório nomeia os endpoints exatos", () => {
    const t = diagnosticarFluxos(FECHA).texto;
    expect(t).toContain("metric=follower_count&period=day");
    expect(t).toContain("metric=follows_and_unfollows");
    expect(t).toContain("breakdown=follow_type");
  });
});
