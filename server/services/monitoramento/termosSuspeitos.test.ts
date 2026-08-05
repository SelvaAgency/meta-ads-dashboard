/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Termos suspeitos — os falsos positivos importam mais que os verdadeiros
 * ─────────────────────────────────────────────────────────────────────────────
 *  Pegar "melhores cassinos online" é fácil. O que decide se este robô sobrevive
 *  é NÃO alertar em "a marca aposta em fios naturais" — a frase que um blog de
 *  malharia escreve toda semana. Por isso a maior parte destes testes é sobre o
 *  que deve passar batido.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, expect, it } from "vitest";
import {
  TERMOS_PADRAO, classificarPost, encontrarTermos, normalizarTexto, termosDoCliente,
} from "./termosSuspeitos";

const T = termosDoCliente();
const post = (over: Partial<Parameters<typeof classificarPost>[0]> = {}) => ({
  id: "1", url: "https://ultramalhasloja.com.br/blog/post", titulo: "", resumo: "", ...over,
});

describe("o que NÃO pode alertar", () => {
  /**
   * O verbo "apostar" é vocabulário de marketing. Se ele alertasse, o robô
   * geraria incidente sobre o próprio texto comercial do cliente.
   */
  it.each([
    "A Ultramalhas aposta em fios naturais",
    "Apostamos no conforto o ano inteiro",
    "Nossa aposta para o inverno",
    "A marca apostou em cores sóbrias",
  ])("verbo apostar em texto comercial: %s", (texto) => {
    expect(classificarPost(post({ resumo: texto }), T).suspeito).toBe(false);
  });

  /** "bet" como substring casa com meio dicionário. */
  it.each([
    "Conheça o alfabeto das malhas",
    "Dona Betânia costura há 40 anos",
    "Receita com beterraba para tingir tecido",
    "Diabetes e conforto: tecidos que respiram",
  ])("substring não conta: %s", (texto) => {
    expect(classificarPost(post({ resumo: texto }), T).suspeito).toBe(false);
  });

  it("texto de moda comum não dispara nada", () => {
    const c = classificarPost(post({
      titulo: "Tendências de tricô para o inverno",
      resumo: "Peças em lã merino, algodão pima e um toque de seda.",
    }), T);
    expect(c.suspeito).toBe(false);
    expect(c.termos).toEqual([]);
  });
});

describe("o que precisa alertar", () => {
  it("termo no título é sinal FORTE", () => {
    const c = classificarPost(post({ titulo: "Melhores cassinos online de 2026" }), T);
    expect(c.suspeito).toBe(true);
    expect(c.forte).toBe(true);
    expect(c.termos).toContain("cassinos");
  });

  it("dois termos distintos no corpo são sinal FORTE", () => {
    const c = classificarPost(post({ resumo: "Ganhe bonus no jackpot da semana" }), T);
    expect(c.forte).toBe(true);
    expect(c.termos.sort()).toEqual(["bonus", "jackpot"]);
  });

  /** Um termo isolado pode ser citação ou coincidência: atenção, não incêndio. */
  it("um termo isolado no corpo é sinal FRACO", () => {
    const c = classificarPost(post({ resumo: "O evento aconteceu perto de um casino." }), T);
    expect(c.suspeito).toBe(true);
    expect(c.forte).toBe(false);
  });

  /** O sitemap só entrega URL — sem isto, o fallback mais provável seria cego. */
  it("termo só na URL é detectado", () => {
    const c = classificarPost(post({ url: "https://ultramalhasloja.com.br/melhores-slots-online/" }), T);
    expect(c.suspeito).toBe(true);
    expect(c.termos).toContain("slots");
  });

  it("acento não esconde o termo", () => {
    expect(classificarPost(post({ titulo: "BÔNUS especial" }), T).termos).toContain("bonus");
    expect(classificarPost(post({ titulo: "PÔQUER ao vivo" }), T).termos).toContain("poquer");
  });

  it("HTML do resumo não esconde o termo", () => {
    expect(classificarPost(post({ resumo: "<p>Ganhe no <strong>jackpot</strong></p>" }), T).termos)
      .toContain("jackpot");
  });
});

describe("termos por cliente", () => {
  it("extras entram na busca", () => {
    const t = termosDoCliente(["rifa online"]);
    expect(classificarPost(post({ titulo: "Rifa Online da sorte" }), t).suspeito).toBe(true);
    expect(classificarPost(post({ titulo: "Rifa Online da sorte" }), T).suspeito).toBe(false);
  });

  it("ignorados saem — é a saída para falso positivo de setor", () => {
    const t = termosDoCliente(null, ["bet"]);
    expect(t).not.toContain("bet");
    expect(t).toContain("cassino");
  });

  /** Adicionar e ignorar o mesmo termo: silenciar vence. */
  it("ignorar vence adicionar", () => {
    expect(termosDoCliente(["rifa"], ["rifa"])).not.toContain("rifa");
  });

  it("acento e caixa no que o cliente digitou não quebram", () => {
    expect(termosDoCliente(null, ["BÔNUS"])).not.toContain("bonus");
  });

  /** Termo do cliente é entrada livre: um `(` solto não pode derrubar o ciclo. */
  it("caractere de regex no termo do cliente não explode", () => {
    const t = termosDoCliente(["promo(cao"]);
    expect(() => classificarPost(post({ titulo: "qualquer coisa" }), t)).not.toThrow();
  });

  it("lista vazia não encontra nada", () => {
    expect(classificarPost(post({ titulo: "cassino" }), []).suspeito).toBe(false);
  });
});

describe("evidência", () => {
  it("traz o trecho ao redor, truncado", () => {
    const [e] = encontrarTermos(`${"x".repeat(500)} jackpot ${"y".repeat(500)}`, T, "texto");
    expect(e.termo).toBe("jackpot");
    expect(e.trecho).toContain("jackpot");
    expect(e.trecho.length).toBeLessThanOrEqual(140);
  });

  it("normalizarTexto remove tags, acento e caixa", () => {
    expect(normalizarTexto("<p>BÔNUS  de   Verão</p>")).toBe("bonus de verao");
  });

  it.each([[null], [undefined], [""]])("texto %s não quebra", (v) => {
    expect(encontrarTermos(v as string, T, "texto")).toEqual([]);
  });
});

describe("lista padrão", () => {
  it.each(["cassino", "casino", "apostas", "bet", "betting", "slot", "slots", "poker", "bonus", "jackpot", "roleta", "roulette", "gambling"])(
    "cobre o termo pedido: %s", (termo) => {
      expect(termosDoCliente()).toContain(termo);
    });

  it("nenhum termo padrão é vazio ou duplicado", () => {
    const t = termosDoCliente();
    expect(t.every(Boolean)).toBe(true);
    expect(new Set(t).size).toBe(t.length);
    expect(TERMOS_PADRAO.length).toBeGreaterThan(10);
  });
});
