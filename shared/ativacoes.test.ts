/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Somar post com story sem mostrar a composição cria um indicador enganoso
 * ─────────────────────────────────────────────────────────────────────────────
 *  12 ativações feitas de 12 posts e 12 ativações feitas de 1 post e 11 stories
 *  descrevem contas com comportamentos opostos. Se a tela mostrar só o total, o
 *  número sobe do jeito mais barato e ninguém descobre pela interface.
 *
 *  E há duas ausências que não podem virar zero: story que a coleta não mediu, e
 *  publicação que a coleta não conseguiu ler. Zero é um número — dizer zero
 *  sobre o que ninguém contou é afirmar sobre o cliente o que é falha nossa.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, expect, it } from "vitest";
import { contarAtivacoes, textoDaComposicao } from "./ativacoes";

const JANELA = { inicio: "2026-08-10", fim: "2026-08-16" };
const post = (publicadoEm: string, tipo = "FEED" as const) => ({ publicadoEm, tipo });

describe("o total nunca aparece sem a composição", () => {
  it("soma posts e stories, e diz de que é feito", () => {
    const a = contarAtivacoes(
      [post("2026-08-11"), post("2026-08-12"), post("2026-08-13")],
      [{ storiesVistos: 2 }, { storiesVistos: 3 }],
      JANELA,
    );
    expect(a.total).toBe(8);
    expect(textoDaComposicao(a)).toBe("3 posts · 5 stories");
  });

  /** O caso que o módulo existe para tornar visível. */
  it("mesma soma, composições opostas", () => {
    const soPosts = contarAtivacoes(
      Array.from({ length: 6 }, () => post("2026-08-11")), [{ storiesVistos: 0 }], JANELA);
    const soStories = contarAtivacoes([], [{ storiesVistos: 6 }], JANELA);
    expect(soPosts.total).toBe(soStories.total);
    expect(textoDaComposicao(soPosts)).not.toBe(textoDaComposicao(soStories));
  });
});

describe("o LOTE de 25 não é a produção do período", () => {
  /**
   * A regressão que este arquivo existe para impedir, reproduzida.
   *
   * O coletor pede as 25 mídias mais recentes numa chamada — 25 é o tamanho do
   * lote. Se a contagem usar a lista inteira, toda conta exibe "25 ativações"
   * todo dia: um número plausível, estável e errado, que ninguém reporta como
   * bug porque ele nunca parece quebrado.
   */
  it("25 mídias retornadas com 2 do período contam 2, e não 25", () => {
    const lote = [
      post("2026-08-12"), post("2026-08-13"),
      // As outras 23 são anteriores ao período — vieram no lote por serem as
      // mais recentes da conta, não por terem sido publicadas agora.
      ...Array.from({ length: 23 }, (_, i) => post(`2026-07-${String(i + 1).padStart(2, "0")}`)),
    ];
    expect(lote).toHaveLength(25);
    const a = contarAtivacoes(lote, [], JANELA);
    expect(a.total).toBe(2);
    expect(textoDaComposicao(a)).toBe("2 posts");
  });

  /** O mesmo engano visto por outro ângulo: nenhuma do período. */
  it("lote cheio sem nenhuma publicação do período conta zero", () => {
    const lote = Array.from({ length: 25 }, () => post("2026-07-01"));
    expect(contarAtivacoes(lote, [], JANELA).total).toBe(0);
  });

  /** E o desempenho por tipo herda o mesmo filtro. */
  it("por tipo também conta só o período", () => {
    const a = contarAtivacoes([
      post("2026-08-12", "REELS"),
      ...Array.from({ length: 20 }, () => post("2026-07-01", "REELS")),
    ], [], JANELA);
    expect(a.porTipo).toEqual([{ tipo: "REELS", rotulo: "Reels", total: 1 }]);
  });
});

describe("a janela é respeitada", () => {
  it("publicação fora do período não entra", () => {
    const a = contarAtivacoes(
      [post("2026-08-01"), post("2026-08-12"), post("2026-08-20")], [], JANELA);
    expect(a.total).toBe(1);
  });

  /**
   * A leitura funcionou e a publicação não tem data: ela não conta. O total é
   * um zero MEDIDO — diferente do `null` de quando nada foi lido.
   */
  it("publicação sem data não entra, e o zero resultante é medido", () => {
    const a = contarAtivacoes([{ publicadoEm: null, tipo: "FEED" }], [], JANELA);
    expect(a.total).toBe(0);
    expect(textoDaComposicao(a)).toBe("0 posts");
  });
});

describe("story é sempre um piso", () => {
  /**
   * A coleta lê o que está NO AR. Story publicado às 8h e expirado antes das
   * 18:20 não é visto por ninguém — o total é mínimo, nunca exato.
   */
  it("a parcela de stories vem marcada como incompleta", () => {
    const a = contarAtivacoes([], [{ storiesVistos: 4 }], JANELA);
    expect(a.parcelas.find((p) => p.rotulo === "Stories")!.incompleto).toBe(true);
  });

  it("dias sem medição são contados, e não viram zero", () => {
    const a = contarAtivacoes([], [{ storiesVistos: 2 }, { storiesVistos: null }, { storiesVistos: null }], JANELA);
    expect(a.total).toBe(2);
    expect(a.diasSemMedicaoDeStories).toBe(2);
  });

  it("nenhum dia medido não produz parcela de stories", () => {
    const a = contarAtivacoes([post("2026-08-11")], [{ storiesVistos: null }], JANELA);
    expect(a.parcelas.map((p) => p.rotulo)).toEqual(["Posts"]);
  });
});

describe("não conseguir ler não é 'não publicou'", () => {
  it("com publicações indisponíveis, a parcela de posts some em vez de virar 0", () => {
    const a = contarAtivacoes([], [{ storiesVistos: 3 }], JANELA, { publicacoesIndisponiveis: true });
    expect(a.parcelas.map((p) => p.rotulo)).toEqual(["Stories"]);
    expect(a.publicacoesIndisponiveis).toBe(true);
    expect(a.total).toBe(3);
  });

  it("sem nada medido, o total é null e não zero", () => {
    const a = contarAtivacoes([], [], JANELA, { publicacoesIndisponiveis: true });
    expect(a.total).toBeNull();
    expect(textoDaComposicao(a)).toBeNull();
  });
});

describe("desempenho por tipo", () => {
  it("agrupa e ordena do mais publicado para o menos", () => {
    const a = contarAtivacoes([
      post("2026-08-11", "REELS"), post("2026-08-12", "REELS"), post("2026-08-13", "REELS"),
      post("2026-08-11", "CARROSSEL"),
    ], [], JANELA);
    expect(a.porTipo.map((t) => [t.tipo, t.total])).toEqual([["REELS", 3], ["CARROSSEL", 1]]);
  });
});
