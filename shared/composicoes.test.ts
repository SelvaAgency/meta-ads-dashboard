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
      { likes: 312, comments: 24, shares: 18, saves: 35, replies: 0 }, 389);
    expect(c.partes.map((p) => `${p.total} ${p.rotulo}`)).toEqual(
      ["312 curtidas", "24 comentários", "18 compartilhamentos", "35 salvamentos",
       "0 respostas aos stories"]);
    expect(c.completa).toBe(true);
    expect(c.fecha).toBe(true);
    expect(c.ressalva).toBeNull();
  });

  /** Zero MEDIDO aparece: a Meta contou e não houve compartilhamento. */
  it("zero medido entra na lista", () => {
    const c = composicaoDoEngajamento({ likes: 10, comments: 0, shares: 0, saves: 0, replies: 0 }, 10);
    expect(c.partes).toHaveLength(5);
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
      { likes: 100, comments: 10, shares: 5, saves: 5, replies: 0 }, 200);
    expect(c.fecha).toBe(false);
    expect(c.ressalva).toContain("120");
  });

  /** Sem o total não há o que conferir — e isso não é divergência. */
  it("sem total, a conferência fica indeterminada e não falsa", () => {
    const c = composicaoDoEngajamento({ likes: 10, comments: 1, shares: 1, saves: 1, replies: 0 }, null);
    expect(c.fecha).toBeNull();
    expect(c.ressalva).toBeNull();
    expect(c.totalApresentado).toBeNull();
  });

  it("nenhuma parcela medida não produz linha nenhuma", () => {
    expect(composicaoDoEngajamento({}, 389).partes).toEqual([]);
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Respostas a story: dentro do total da Meta, ou fora dele?
 * ─────────────────────────────────────────────────────────────────────────────
 *  A Meta nunca documentou se `total_interactions` inclui resposta a story, e a
 *  resposta muda o número grande do cartão. Chutar para qualquer lado erra por
 *  omissão ou por contagem dupla — então a composição DEDUZ, e só quando dá.
 * ─────────────────────────────────────────────────────────────────────────────
 */
describe("as respostas aos stories e o total da Meta", () => {
  const QUATRO = { likes: 300, comments: 20, shares: 10, saves: 5 }; // soma 335

  it("quatro batem com o total ⇒ as respostas estão FORA, e entram", () => {
    const c = composicaoDoEngajamento({ ...QUATRO, replies: 12 }, 335);
    expect(c.respostasNoTotal).toBe(false);
    expect(c.totalApresentado).toBe(347);
    expect(c.ressalva).toContain("somadas ao total");
  });

  it("quatro + respostas batem com o total ⇒ já estavam DENTRO", () => {
    const c = composicaoDoEngajamento({ ...QUATRO, replies: 12 }, 347);
    expect(c.respostasNoTotal).toBe(true);
    expect(c.totalApresentado).toBe(347);
    // Somá-las de novo daria 359 — o mesmo engajamento contado duas vezes.
    expect(c.ressalva).toBeNull();
  });

  it("nenhuma resposta no período ⇒ indeterminado, e o total não se mexe", () => {
    const c = composicaoDoEngajamento({ ...QUATRO, replies: 0 }, 335);
    expect(c.respostasNoTotal).toBeNull();
    expect(c.totalApresentado).toBe(335);
  });

  it("nem uma hipótese nem outra fecha ⇒ divergência dita, total intocado", () => {
    const c = composicaoDoEngajamento({ ...QUATRO, replies: 12 }, 500);
    expect(c.respostasNoTotal).toBeNull();
    expect(c.totalApresentado).toBe(500);
    expect(c.ressalva).toContain("335");
  });

  /** Quatro estados: "ninguém respondeu" e "não perguntamos" não são a mesma tela. */
  it("respostas não medidas é dito, e não vira zero", () => {
    const c = composicaoDoEngajamento(QUATRO, 335);
    expect(c.partes.some((p) => p.chave === "replies")).toBe(false);
    expect(c.respostasNoTotal).toBeNull();
    expect(c.ressalva).toContain("não medidas");
  });

  /** Sem as quatro não há de onde deduzir — e a dedução não é chutada. */
  it("parcela faltando impede a dedução", () => {
    const c = composicaoDoEngajamento({ likes: 300, comments: 20, saves: 5, replies: 12 }, 335);
    expect(c.respostasNoTotal).toBeNull();
    expect(c.totalApresentado).toBe(335);
    expect(c.ressalva).toContain("compartilhamentos");
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
