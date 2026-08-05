/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Avaliador de conteúdo — sem rede, sem WordPress no ar
 * ─────────────────────────────────────────────────────────────────────────────
 *  O cenário que este robô existe para pegar (blog invadido publicando cassino)
 *  não pode ser agendado. Por isso a leitura entra fabricada e a decisão é
 *  exercitada inteira em milissegundos.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, expect, it } from "vitest";
import {
  avaliarConteudo, proximoBaseline, classificarTodos,
  type BaselineConteudo, type EntradaConteudo,
} from "./avaliadorConteudo";
import type { LeituraConteudo, PostBlog } from "./conteudoCheck";
import { termosDoCliente } from "./termosSuspeitos";

const T = termosDoCliente();

const post = (over: Partial<PostBlog> = {}): PostBlog => ({
  id: "1", url: "https://ultramalhasloja.com.br/blog/tricot/", titulo: "Tricô para o inverno",
  data: "2026-08-04T10:00:00Z", autor: "Redação", categorias: ["Moda"], resumo: "Peças em lã.",
  ...over,
});

const SPAM = post({
  id: "999", url: "https://ultramalhasloja.com.br/melhores-cassinos/",
  titulo: "Melhores cassinos online de 2026", autor: "admin2", categorias: ["Sem categoria"],
  resumo: "Ganhe bônus no jackpot.",
});

const leitura = (posts: PostBlog[], over: Partial<LeituraConteudo> = {}): LeituraConteudo => ({
  fonte: "rest", ok: true, posts, tentativas: [], erro: null, emMs: 120,
  lidoEm: "2026-08-05T10:00:00.000Z", ...over,
});

const BASE: BaselineConteudo = { ids: ["1"], autores: ["Redação"], categorias: ["Moda"] };

const ent = (over: Partial<EntradaConteudo> = {}): EntradaConteudo => ({
  conteudo: leitura([post()]), baseline: BASE, termos: T, ...over,
});

const chaves = (e: EntradaConteudo) => avaliarConteudo(e).map((a) => a.chave);
const achar = (e: EntradaConteudo, chave: string) => avaliarConteudo(e).find((a) => a.chave === chave);

describe("não conseguir ler NUNCA é 'está tudo bem'", () => {
  it("nenhuma fonte respondeu → WARNING explícito", () => {
    const a = achar(ent({
      conteudo: leitura([], {
        ok: false, fonte: "nenhuma", erro: "Nenhuma das fontes respondeu.",
        tentativas: [
          { fonte: "rest", url: "…/wp-json/…", resultado: "HTTP 403" },
          { fonte: "rss", url: "…/feed", resultado: "HTTP 404" },
        ],
      }),
    }), "conteudo_nao_verificado");
    expect(a?.sev).toBe("WARNING");
    expect(a?.detalhe).toContain("não é o mesmo que estar limpo");
    expect(a?.evidencia.tentativas).toEqual(["rest: HTTP 403", "rss: HTTP 404"]);
  });

  /** Zero posts lidos e zero posts suspeitos são estados diferentes. */
  it("falha não produz nenhum achado de 'ok'", () => {
    expect(chaves(ent({ conteudo: leitura([], { ok: false, fonte: "nenhuma" }) })))
      .toEqual(["conteudo_nao_verificado"]);
  });

  it("blog vazio, mas LIDO, não é falha", () => {
    expect(chaves(ent({ conteudo: leitura([]) }))).not.toContain("conteudo_nao_verificado");
  });
});

describe("spam de cassino", () => {
  it("post com termo no título é CRITICAL e exige confirmação", () => {
    const a = achar(ent({ conteudo: leitura([post(), SPAM]) }), "conteudo_spam");
    expect(a?.sev).toBe("CRITICAL");
    expect(a?.exigeConfirmacao).toBe(true);
  });

  it("a evidência traz URL, título, data, termo e trecho", () => {
    const a = achar(ent({ conteudo: leitura([SPAM]) }), "conteudo_spam");
    expect(a?.evidencia.url).toBe("https://ultramalhasloja.com.br/melhores-cassinos/");
    expect(a?.evidencia.titulo).toBe("Melhores cassinos online de 2026");
    expect(a?.evidencia.data).toBe("2026-08-04T10:00:00Z");
    expect(a?.evidencia.termos).toContain("cassinos");
    expect(String(a?.evidencia.trecho)).toContain("cassinos");
  });

  it("vários posts spam viram um achado que conta quantos", () => {
    const a = achar(ent({
      conteudo: leitura([SPAM, post({ id: "998", titulo: "Bônus de roleta grátis" })]),
    }), "conteudo_spam");
    expect(a?.titulo).toContain("2 publicações");
    expect(a?.evidencia.totalSuspeitos).toBe(2);
  });

  /**
   * O spam provavelmente já estava lá antes de o robô ser ligado. Classificar
   * só os novos deixaria passar exatamente o caso mais provável.
   */
  it("post spam ANTIGO (já no baseline) também é pego", () => {
    const base = { ...BASE, ids: ["1", "999"] };
    expect(chaves(ent({ conteudo: leitura([post(), SPAM]), baseline: base }))).toContain("conteudo_spam");
  });

  it("sinal fraco é WARNING, sem confirmação", () => {
    const a = achar(ent({
      conteudo: leitura([post({ resumo: "O evento foi perto de um casino." })]),
    }), "conteudo_suspeito");
    expect(a?.sev).toBe("WARNING");
    expect(a?.exigeConfirmacao).toBe(false);
  });

  it("blog normal não gera achado de conteúdo", () => {
    expect(chaves(ent())).toEqual([]);
  });
});

describe("a primeira leitura aprende, não julga", () => {
  it("sem baseline, registra e não acusa rajada nem autor novo", () => {
    const muitos = Array.from({ length: 20 }, (_, i) => post({ id: `p${i}`, autor: `Autor ${i}` }));
    const c = chaves(ent({ conteudo: leitura(muitos), baseline: null }));
    expect(c).toContain("conteudo_baseline_aprendido");
    expect(c).not.toContain("muitos_posts_novos");
    expect(c).not.toContain("autor_novo");
  });

  /** Mas spam na primeira leitura é pego — ele não depende de comparação. */
  it("sem baseline, spam AINDA é detectado", () => {
    expect(chaves(ent({ conteudo: leitura([SPAM]), baseline: null }))).toContain("conteudo_spam");
  });
});

describe("sinais que dependem do baseline", () => {
  it("rajada de posts novos é WARNING", () => {
    const novos = Array.from({ length: 9 }, (_, i) => post({ id: `n${i}` }));
    const a = achar(ent({ conteudo: leitura(novos) }), "muitos_posts_novos");
    expect(a?.sev).toBe("WARNING");
    expect(a?.evidencia.quantidade).toBe(9);
  });

  it("poucos posts novos não acusam rajada", () => {
    const novos = Array.from({ length: 3 }, (_, i) => post({ id: `n${i}` }));
    expect(chaves(ent({ conteudo: leitura(novos) }))).not.toContain("muitos_posts_novos");
  });

  it("autor inédito é WARNING", () => {
    const a = achar(ent({ conteudo: leitura([post({ id: "novo", autor: "admin2" })]) }), "autor_novo");
    expect(a?.sev).toBe("WARNING");
    expect(a?.evidencia.autores).toEqual(["admin2"]);
  });

  it("autor conhecido publicando de novo não alerta", () => {
    expect(chaves(ent({ conteudo: leitura([post({ id: "novo", autor: "Redação" })]) })))
      .not.toContain("autor_novo");
  });

  it("categoria nova é WARNING", () => {
    const a = achar(ent({ conteudo: leitura([post({ id: "novo", categorias: ["Apostas"] })]) }), "categoria_nova");
    expect(a?.evidencia.categorias).toEqual(["Apostas"]);
  });

  /** Autor novo só conta em post NOVO — senão o baseline nunca convergiria. */
  it("autor desconhecido em post já conhecido não alerta", () => {
    expect(chaves(ent({ conteudo: leitura([post({ id: "1", autor: "outro" })]) })))
      .not.toContain("autor_novo");
  });
});

describe("termos ignorados pelo cliente", () => {
  it("silenciar o termo silencia o achado", () => {
    const t = termosDoCliente(null, ["cassinos", "cassino", "bonus", "jackpot"]);
    expect(chaves(ent({ conteudo: leitura([SPAM]), termos: t }))).not.toContain("conteudo_spam");
  });

  it("termo extra do cliente gera achado", () => {
    const t = termosDoCliente(["rifa"]);
    const p = post({ id: "x", titulo: "Rifa premiada" });
    expect(chaves(ent({ conteudo: leitura([p]), termos: t }))).toContain("conteudo_spam");
  });
});

describe("baseline", () => {
  it("acumula ids, autores e categorias", () => {
    const b = proximoBaseline(BASE, [post({ id: "2", autor: "Ana", categorias: ["Dicas"] })]);
    expect(b.ids).toContain("1");
    expect(b.ids).toContain("2");
    expect(b.autores.sort()).toEqual(["Ana", "Redação"]);
    expect(b.categorias.sort()).toEqual(["Dicas", "Moda"]);
  });

  it("não duplica o que já conhecia", () => {
    const b = proximoBaseline(BASE, [post({ id: "1" })]);
    expect(b.ids).toEqual(["1"]);
    expect(b.autores).toEqual(["Redação"]);
  });

  /** Blog antigo tem milhares de URLs; a linha do banco não pode crescer sem fim. */
  it("tem teto e mantém os mais recentes", () => {
    const anterior = { ids: Array.from({ length: 400 }, (_, i) => `velho${i}`), autores: [], categorias: [] };
    const b = proximoBaseline(anterior, [post({ id: "recentissimo" })]);
    expect(b.ids.length).toBeLessThanOrEqual(400);
    expect(b.ids[0]).toBe("recentissimo");
  });

  it("primeira vez parte do zero", () => {
    expect(proximoBaseline(null, [post({ id: "a" })]).ids).toEqual(["a"]);
  });
});

describe("classificarTodos", () => {
  it("sem baseline, ninguém é 'novo' — é o que evita a rajada falsa", () => {
    expect(classificarTodos(ent({ conteudo: leitura([post({ id: "z" })]), baseline: null }))[0].novo).toBe(false);
  });

  it("com baseline, id desconhecido é novo", () => {
    expect(classificarTodos(ent({ conteudo: leitura([post({ id: "z" })]) }))[0].novo).toBe(true);
  });

  it.each([[null]])("sem leitura (%s) devolve lista vazia", (v) => {
    expect(classificarTodos(ent({ conteudo: v }))).toEqual([]);
    expect(avaliarConteudo(ent({ conteudo: v }))).toEqual([]);
  });
});
