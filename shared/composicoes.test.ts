/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Uma linha de apoio embaixo de um número grande é lida como explicação DELE
 * ─────────────────────────────────────────────────────────────────────────────
 *  E é aí que ela fica perigosa: ninguém confere quatro parcelas contra um total
 *  de cabeça. Se as partes não somarem o número de cima, a tela estará
 *  afirmando uma decomposição falsa — com toda a aparência de uma verdadeira.
 *
 *  Dois riscos, e os dois são de AFIRMAÇÃO:
 *
 *   NÃO FECHA    somar 312+24+18+35 e dar diferente do total apresentado. Tem
 *                que ser dito, não escondido: a Meta pode contar no total algo
 *                que não devolve como parcela
 *
 *   ZERO FALSO   categoria que a coleta não trouxe virar "0 salvamentos".
 *                Isso afirma que ninguém salvou, quando o que houve foi não
 *                termos recebido resposta
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, expect, it } from "vitest";
import { composicaoDoEngajamento } from "./engajamento";
import { composicaoDeAtivacoes, contarAtivacoes } from "./ativacoes";

describe("a composição do engajamento", () => {
  it("as quatro parcelas, na ordem, quando todas respondem", () => {
    const c = composicaoDoEngajamento(
      { likes: 312, comments: 24, shares: 18, saves: 35 }, 389);
    expect(c.partes.map((p) => `${p.total} ${p.rotulo}`)).toEqual(
      ["312 curtidas", "24 comentários", "18 compartilhamentos", "35 salvamentos"]);
    expect(c.completa).toBe(true);
    expect(c.fecha).toBe(true);
    expect(c.ressalva).toBeNull();
  });

  /** Zero MEDIDO aparece: a Meta contou e não houve compartilhamento. */
  it("zero medido entra na lista", () => {
    const c = composicaoDoEngajamento({ likes: 10, comments: 0, shares: 0, saves: 0 }, 10);
    expect(c.partes).toHaveLength(4);
    expect(c.fecha).toBe(true);
  });

  /** Ausente NÃO vira zero — some da linha, e a ressalva diz qual faltou. */
  it("parcela ausente sai da lista e é dita na ressalva", () => {
    const c = composicaoDoEngajamento({ likes: 300, comments: 20, shares: null }, 389);
    expect(c.partes.map((p) => p.chave)).toEqual(["likes", "comments"]);
    expect(c.completa).toBe(false);
    expect(c.ressalva).toContain("compartilhamentos");
    expect(c.ressalva).toContain("salvamentos");
  });

  /**
   * A conferência que justifica a função existir. A Meta pode contar no total
   * algo que não devolve como parcela — e apresentar a soma como se fosse o
   * total transformaria uma diferença conhecida num erro invisível.
   */
  it("divergência entre a soma e o total é dita", () => {
    const c = composicaoDoEngajamento(
      { likes: 100, comments: 10, shares: 5, saves: 5 }, 200);
    expect(c.fecha).toBe(false);
    expect(c.ressalva).toContain("120");
  });

  /** Sem o total não há o que conferir — e isso não é divergência. */
  it("sem total, a conferência fica indeterminada e não falsa", () => {
    const c = composicaoDoEngajamento({ likes: 10, comments: 1, shares: 1, saves: 1 }, null);
    expect(c.fecha).toBeNull();
    expect(c.ressalva).toBeNull();
  });

  it("nenhuma parcela medida não produz linha nenhuma", () => {
    expect(composicaoDoEngajamento({}, 389).partes).toEqual([]);
  });
});

describe("a composição das ativações", () => {
  const JANELA = { inicio: "2026-08-10", fim: "2026-08-16" };
  const post = (publicadoEm: string, tipo: "FEED" | "REELS" | "CARROSSEL") => ({ publicadoEm, tipo });

  it("posts junta feed e carrossel; reels aparece à parte", () => {
    const a = contarAtivacoes([
      post("2026-08-11", "FEED"), post("2026-08-12", "FEED"),
      post("2026-08-12", "CARROSSEL"),
      post("2026-08-13", "REELS"), post("2026-08-14", "REELS"),
    ], [{ storiesVistos: 32 }], JANELA);

    expect(composicaoDeAtivacoes(a).map((p) => `${p.total} ${p.rotulo}`))
      .toEqual(["3 posts", "32 stories", "2 reels"]);
  });

  /** As três somam o total, sem sobreposição — reel conta uma vez só. */
  it("as três partes somam o total do card", () => {
    const a = contarAtivacoes([
      post("2026-08-11", "FEED"), post("2026-08-12", "REELS"),
    ], [{ storiesVistos: 4 }], JANELA);
    const soma = composicaoDeAtivacoes(a).reduce((n, p) => n + (p.total ?? 0), 0);
    expect(soma).toBe(a.total);
  });

  /** "0 reels" é informação: a conta não publicou reel nenhum. */
  it("categoria sem ocorrência aparece com zero medido", () => {
    const a = contarAtivacoes([post("2026-08-11", "FEED")], [{ storiesVistos: 2 }], JANELA);
    expect(composicaoDeAtivacoes(a).find((p) => p.rotulo === "reels")?.total).toBe(0);
  });

  /** Já stories não medido some: escrever "0 stories" afirmaria sobre o cliente. */
  it("stories não medido some da linha em vez de virar zero", () => {
    const a = contarAtivacoes([post("2026-08-11", "FEED")], [{ storiesVistos: null }], JANELA);
    expect(composicaoDeAtivacoes(a).map((p) => p.rotulo)).toEqual(["posts", "reels"]);
  });

  it("publicações indisponíveis tiram posts e reels, e mantêm stories", () => {
    const a = contarAtivacoes([], [{ storiesVistos: 5 }], JANELA, { publicacoesIndisponiveis: true });
    expect(composicaoDeAtivacoes(a).map((p) => p.rotulo)).toEqual(["stories"]);
  });
});
