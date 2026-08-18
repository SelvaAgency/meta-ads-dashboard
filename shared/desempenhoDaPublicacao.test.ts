/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  A etiqueta é uma AFIRMAÇÃO sobre o conteúdo do cliente
 * ─────────────────────────────────────────────────────────────────────────────
 *  "Desempenho muito abaixo" numa publicação faz alguém parar de produzir aquele
 *  formato. Então o risco não é o rótulo feio: é o rótulo errado por um motivo
 *  invisível — e o mais provável de todos é a taxa alta de um post que quase
 *  ninguém viu.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, expect, it } from "vitest";
import {
  PUBLICACOES_MINIMAS_PARA_ETIQUETA, etiquetarDesempenho,
  type PublicacaoClassificavel,
} from "./desempenhoDaPublicacao";

const p = (id: string, taxa: number | null, alcance: number | null): PublicacaoClassificavel =>
  ({ id, taxa, alcance });

/** Cinco publicações medianas: taxa 2%, alcance 1000. */
const BASE = Array.from({ length: 5 }, (_, i) => p(`m${i}`, 2, 1000));

describe("o índice pesa taxa E alcance", () => {
  /**
   * O caso do pedido: pouco alcance e muitas curtidas. A taxa dispara, e sem
   * peso de alcance essa publicação lideraria tendo sido vista por quase
   * ninguém.
   */
  it("taxa altíssima com alcance mínimo NÃO vira o melhor", () => {
    const e = etiquetarDesempenho([...BASE, p("viral_falso", 12, 80)]);
    expect(e.get("viral_falso")?.extremo).not.toBe("melhor");
    // 80/1000 = 0,08 — o alcance é o lado fraco, e é ele que manda.
    expect(e.get("viral_falso")?.indice).toBeCloseTo(0.08, 5);
    expect(e.get("viral_falso")?.nivel).toBe("muito_abaixo");
  });

  /** E o motivo diz as DUAS coisas, para não convidar a repetir a fórmula. */
  it("o motivo mostra taxa e alcance juntos", () => {
    const e = etiquetarDesempenho([...BASE, p("viral_falso", 12, 80)]);
    const m = e.get("viral_falso")!.motivo;
    expect(m).toContain("taxa");
    expect(m).toContain("acima da mediana");
    expect(m).toContain("alcance");
    expect(m).toContain("abaixo da mediana");
  });

  it("alcance enorme com taxa péssima também não vira o melhor", () => {
    const e = etiquetarDesempenho([...BASE, p("so_alcance", 0.3, 9000)]);
    expect(e.get("so_alcance")?.extremo).not.toBe("melhor");
    expect(e.get("so_alcance")?.indice).toBeCloseTo(0.15, 5);
  });

  /** Destaque exige as duas pontas boas — é o que "o mais fraco" garante. */
  it("o melhor é quem foi bem nas duas", () => {
    const e = etiquetarDesempenho([
      ...BASE,
      p("so_taxa", 10, 100),
      p("so_alcance", 0.4, 8000),
      p("equilibrado", 3.4, 1800),
    ]);
    expect(e.get("equilibrado")?.extremo).toBe("melhor");
    expect(e.get("equilibrado")?.nivel).toBe("muito_acima");
  });

  /**
   * A prova de que o índice NÃO é multiplicativo: `taxa × alcance` é o número
   * de interações, e qualquer índice monótono nele voltaria a ranquear por
   * volume. Estes dois têm o MESMO produto e índices muito diferentes.
   */
  it("mesmo produto taxa×alcance, índices diferentes", () => {
    const e = etiquetarDesempenho([
      ...BASE,
      p("torto", 20, 200),      // produto 4000
      p("parelho", 2, 2000),    // produto 4000
    ]);
    expect(e.get("torto")!.indice).toBeCloseTo(0.2, 5);
    expect(e.get("parelho")!.indice).toBeCloseTo(1, 5);
    expect(e.get("parelho")!.indice).toBeGreaterThan(e.get("torto")!.indice);
  });
});

describe("as duas pontas do período", () => {
  it("existe melhor E pior, e nunca são a mesma", () => {
    const e = etiquetarDesempenho([
      ...BASE, p("otimo", 4, 2600), p("pessimo", 0.4, 300),
    ]);
    expect(e.get("otimo")?.extremo).toBe("melhor");
    expect(e.get("pessimo")?.extremo).toBe("pior");
    const extremos = Array.from(e.values()).filter((x) => x.extremo);
    expect(extremos).toHaveLength(2);
  });

  it("o pior também explica o porquê", () => {
    const e = etiquetarDesempenho([...BASE, p("pessimo", 0.4, 300)]);
    expect(e.get("pessimo")?.motivo).toContain("taxa");
    expect(e.get("pessimo")?.motivo).toContain("alcance");
  });
});

describe("sem amostra, sem etiqueta", () => {
  it("abaixo do piso ninguém é rotulado — nem o melhor", () => {
    // Uma a menos que o piso, contando a que entraria como melhor.
    const poucas = BASE.slice(0, PUBLICACOES_MINIMAS_PARA_ETIQUETA - 2);
    const amostra = [...poucas, p("otimo", 9, 5000)];
    expect(amostra).toHaveLength(PUBLICACOES_MINIMAS_PARA_ETIQUETA - 1);
    expect(etiquetarDesempenho(amostra).size).toBe(0);
  });

  /** Publicação sem alcance não entra: não há como pesar as duas. */
  it("sem alcance ou sem taxa fica de fora, e não vira zero", () => {
    const e = etiquetarDesempenho([...BASE, p("sem_alcance", 5, null), p("sem_taxa", null, 900)]);
    expect(e.has("sem_alcance")).toBe(false);
    expect(e.has("sem_taxa")).toBe(false);
    // E as medianas continuam sendo as das cinco medidas.
    expect(e.get("m0")?.indice).toBeCloseTo(1, 5);
  });

  it("alcance zero não vira divisor", () => {
    const e = etiquetarDesempenho([...BASE, p("zerado", 5, 0)]);
    expect(e.has("zerado")).toBe(false);
    expect(Number.isFinite(e.get("m0")!.indice)).toBe(true);
  });

  it("todas iguais ⇒ todas na média, e ainda assim há duas pontas", () => {
    const e = etiquetarDesempenho(BASE);
    for (const x of e.values()) expect(x.nivel).toBe("na_media");
    expect(Array.from(e.values()).filter((x) => x.extremo)).toHaveLength(2);
  });
});
