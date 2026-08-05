/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Domínio registrável — o teste que precisa existir ANTES do robô rodar
 * ─────────────────────────────────────────────────────────────────────────────
 *  A implementação óbvia ("últimos dois rótulos") reduz `ultramalhas.com.br` a
 *  `com.br`. O estrago é dos dois lados:
 *
 *   • FALSO NEGATIVO — `com.br` casa com qualquer site brasileiro, então um
 *     sequestro para outro `.com.br` passaria aprovado, em silêncio. É o pior
 *     defeito possível num robô que existe para detectar sequestro.
 *   • FALSO POSITIVO — comparar `com.br` contra o esperado alertaria todo dia,
 *     em todo cliente brasileiro, até alguém desligar o robô.
 *
 *  Por isso este arquivo vem antes de qualquer coletor.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, expect, it } from "vitest";
import { dominioRegistravel, mesmoDominioRegistravel, normalizarHost } from "./dominioRegistravel";

describe("a armadilha do .com.br", () => {
  it("ultramalhas.com.br NÃO vira com.br", () => {
    expect(dominioRegistravel("ultramalhas.com.br")).toBe("ultramalhas.com.br");
    expect(dominioRegistravel("ultramalhas.com.br")).not.toBe("com.br");
  });

  it("www.ultramalhas.com.br → ultramalhas.com.br", () => {
    expect(dominioRegistravel("www.ultramalhas.com.br")).toBe("ultramalhas.com.br");
  });

  it.each(["com.br", "net.br", "org.br", "adv.br", "blog.br", "co.uk", "com.au", "co.za"])(
    "o sufixo composto %s exige o terceiro nível",
    (sufixo) => {
      expect(dominioRegistravel(`cliente.${sufixo}`)).toBe(`cliente.${sufixo}`);
    },
  );

  /**
   * O cenário que o falso negativo esconderia: dois sites brasileiros
   * DIFERENTES não podem ser considerados o mesmo domínio.
   */
  it("dois .com.br distintos NÃO são o mesmo domínio", () => {
    expect(mesmoDominioRegistravel("ultramalhas.com.br", "sequestrador.com.br")).toBe(false);
  });
});

describe("domínio da Aiká", () => {
  it.each([
    ["já limpo",         "aikabodysoul.com"],
    ["com www",          "www.aikabodysoul.com"],
    ["http",             "http://aikabodysoul.com"],
    ["https + www",      "https://www.aikabodysoul.com"],
    ["com barra final",  "https://www.aikabodysoul.com/"],
    ["com caminho",      "https://www.aikabodysoul.com/loja/produto?x=1"],
    ["maiúsculas",       "HTTPS://WWW.AikaBodySoul.COM"],
    ["com espaços",      "  https://www.aikabodysoul.com/  "],
    ["com porta",        "https://aikabodysoul.com:443/"],
    ["com ponto raiz",   "aikabodysoul.com."],
  ])("%s → aikabodysoul.com", (_n, entrada) => {
    expect(dominioRegistravel(entrada)).toBe("aikabodysoul.com");
  });
});

describe("www × apex × esquema não geram falso positivo", () => {
  it.each([
    ["www vs apex",        "https://www.aikabodysoul.com", "https://aikabodysoul.com"],
    ["http vs https",      "http://aikabodysoul.com",      "https://aikabodysoul.com"],
    ["com vs sem barra",   "https://aikabodysoul.com/",    "https://aikabodysoul.com"],
    ["caixa diferente",    "HTTPS://AikaBodySoul.com",     "aikabodysoul.com"],
    ["caminho diferente",  "https://x.com.br/a",           "https://www.x.com.br/b"],
  ])("%s são o mesmo domínio", (_n, a, b) => {
    expect(mesmoDominioRegistravel(a, b)).toBe(true);
  });
});

describe("subdomínio", () => {
  /**
   * Decisão deliberada: na COMPARAÇÃO o subdomínio some. A ameaça é o site
   * passar a apontar para outro DONO, não para outra pasta do mesmo dono —
   * mover-se entre subdomínios próprios não é incidente.
   */
  it("loja.x.com e www.x.com são o mesmo domínio registrável", () => {
    expect(mesmoDominioRegistravel("loja.aikabodysoul.com", "www.aikabodysoul.com")).toBe(true);
  });

  it("mas o subdomínio sobrevive à normalização de host, que é o que a tela mostra", () => {
    expect(normalizarHost("https://loja.aikabodysoul.com/x")).toBe("loja.aikabodysoul.com");
    expect(normalizarHost("https://www.aikabodysoul.com/x")).toBe("aikabodysoul.com");
  });

  it("subdomínio profundo em .com.br também resolve certo", () => {
    expect(dominioRegistravel("blog.loja.ultramalhas.com.br")).toBe("ultramalhas.com.br");
  });
});

describe("o incidente que motivou o robô", () => {
  it("redirect para domínio estranho é detectado", () => {
    expect(mesmoDominioRegistravel("aikabodysoul.com", "https://registro-suspenso.net/parking")).toBe(false);
  });

  it("domínio parecido não engana", () => {
    expect(mesmoDominioRegistravel("aikabodysoul.com", "aikabodysoul.com.br")).toBe(false);
    expect(mesmoDominioRegistravel("aikabodysoul.com", "aika-bodysoul.com")).toBe(false);
    expect(mesmoDominioRegistravel("aikabodysoul.com", "aikabodysoul.net")).toBe(false);
  });
});

describe("entrada que não é domínio", () => {
  it.each([["vazio", ""], ["espaços", "   "], ["localhost", "http://localhost:3000"], ["lixo", "???"]])(
    "%s devolve null",
    (_n, entrada) => {
      expect(dominioRegistravel(entrada)).toBeNull();
    },
  );

  /** Sem saber comparar, o certo é levantar a mão — nunca aprovar em silêncio. */
  it("comparação com entrada irreconhecível é FALSE, não true", () => {
    expect(mesmoDominioRegistravel("aikabodysoul.com", "")).toBe(false);
    expect(mesmoDominioRegistravel("", "")).toBe(false);
  });

  it("IP volta inteiro — reduzir por rótulos misturaria máquinas da mesma faixa", () => {
    expect(dominioRegistravel("http://203.0.113.10/")).toBe("203.0.113.10");
    expect(mesmoDominioRegistravel("203.0.113.10", "203.0.113.99")).toBe(false);
  });
});

describe("sufixo desconhecido cai no modo estrito", () => {
  /**
   * Encurtar um sufixo que não conhecemos poderia igualar dois sites de donos
   * diferentes — exatamente o que o robô procura. Preferir o hostname inteiro
   * erra para o lado do alerta a mais, que é revisável.
   */
  it("TLD exótico devolve o hostname inteiro", () => {
    expect(dominioRegistravel("cliente.qualquercoisa.zzz")).toBe("cliente.qualquercoisa.zzz");
  });

  it("e ainda distingue dois hosts diferentes nesse sufixo", () => {
    expect(mesmoDominioRegistravel("a.exemplo.zzz", "b.exemplo.zzz")).toBe(false);
  });
});
