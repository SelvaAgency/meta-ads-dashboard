/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Catálogo de plataformas — o que "preparado" não pode virar
 * ─────────────────────────────────────────────────────────────────────────────
 *  Wix e Shopify existem no catálogo para o modelo saber onde a loja do cliente
 *  está. O risco é o oposto do de sempre: aqui o perigo não é bloquear demais, é
 *  uma plataforma SEM adaptador ser tratada como conectada.
 *
 *  Uma loja Wix marcada como ativa, sem nada por trás, faria o Panorama dizer
 *  "sem vendas hoje" para uma loja que vende — e ninguém desconfiaria, porque
 *  zero é um número plausível.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, expect, it } from "vitest";
import {
  PLATAFORMAS_INTEGRADAS, PLATAFORMAS_LOJA, ehPlataformaValida, estadoDaLoja,
  plataformaPorId, temIntegracao,
} from "./plataformasLoja";

describe("o catálogo cobre as quatro", () => {
  it.each(["woocommerce", "vnda", "wix", "shopify"])("%s está no catálogo", (id) => {
    expect(plataformaPorId(id)).toBeTruthy();
  });

  it("cada uma tem rótulo, ajuda e nomes de campo próprios", () => {
    for (const p of PLATAFORMAS_LOJA) {
      expect(p.label, p.id).toBeTruthy();
      expect(p.ajuda, p.id).toBeTruthy();
      expect(p.campos.chave, p.id).toBeTruthy();
      expect(p.campos.segredo, p.id).toBeTruthy();
    }
  });

  /** Rótulo genérico para todas seria pedir "Consumer Key" a quem usa Shopify. */
  it("os campos NÃO são os mesmos em todas", () => {
    const chaves = new Set(PLATAFORMAS_LOJA.map((p) => p.campos.chave));
    expect(chaves.size).toBe(PLATAFORMAS_LOJA.length);
  });
});

describe("integrada é o que separa promessa de entrega", () => {
  it.each([["woocommerce", true], ["vnda", true], ["wix", true], ["shopify", false]] as const)(
    "%s → integrada=%s", (id, esperado) => {
      expect(temIntegracao(id)).toBe(esperado);
    });

  it("a lista do sync sai do catálogo, não de um Set à mão", () => {
    expect(PLATAFORMAS_INTEGRADAS.sort()).toEqual(["vnda", "wix", "woocommerce"]);
  });

  /** Se alguém marcar `integrada: true` sem escrever o adaptador, isto avisa. */
  it("toda plataforma integrada precisa existir no dispatch do sync", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const fonte = fs.readFileSync(
      path.join(__dirname, "..", "server", "services", "lojaSync.ts"), "utf8");
    for (const id of PLATAFORMAS_INTEGRADAS) {
      expect(fonte, `${id} está marcada como integrada mas não aparece no dispatch`)
        .toContain(`"${id}"`);
    }
  });
});

describe("estado da loja na tela", () => {
  /** O caso que motivou tudo: Aiká no Wix. */
  it("plataforma sem adaptador é PENDENTE, nunca ativa", () => {
    const r = estadoDaLoja({ platform: "shopify", status: "ativa", lastTestStatus: "ok" });
    expect(r.estado).toBe("pendente");
    expect(r.texto).toContain("ainda não disponível");
  });

  /** Wix virou integrada com adaptador — agora pode ser ativa de verdade. */
  it("Wix com credencial ok é ativa", () => {
    expect(estadoDaLoja({ platform: "wix", status: "ativa", lastTestStatus: "ok" }).estado).toBe("ativa");
  });

  it("nem mesmo um teste 'ok' promove plataforma sem adaptador", () => {
    expect(estadoDaLoja({ platform: "shopify", status: "ativa", lastTestStatus: "ok" }).estado)
      .toBe("pendente");
  });

  it("plataforma integrada e saudável é ativa", () => {
    expect(estadoDaLoja({ platform: "woocommerce", status: "ativa", lastTestStatus: "ok" }).estado)
      .toBe("ativa");
  });

  it("credencial falhando é erro, não pendente", () => {
    expect(estadoDaLoja({ platform: "woocommerce", status: "ativa", lastTestStatus: "erro" }).estado)
      .toBe("erro");
  });

  /** Pendente por falta de adaptador não é o mesmo que pausada pela pessoa. */
  it("pausada é pendente com outro texto", () => {
    const r = estadoDaLoja({ platform: "vnda", status: "pausada" });
    expect(r.estado).toBe("pendente");
    expect(r.texto).toContain("pausada");
  });
});

describe("validação de entrada", () => {
  it.each(["woocommerce", "vnda", "wix", "shopify"])("aceita %s", (v) => {
    expect(ehPlataformaValida(v)).toBe(true);
  });

  it.each([["magento"], [""], [null], [undefined], [42]])("recusa %s", (v) => {
    expect(ehPlataformaValida(v)).toBe(false);
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Nenhum label de plataforma pode ser fixo
 * ─────────────────────────────────────────────────────────────────────────────
 *  A loja Wix da Aiká apareceu como "WooCommerce" em Conexões → Lojas. O dado
 *  estava certo: o que havia era um ternário `platform === "vnda" ? … : "Woo"`,
 *  que devolvia WooCommerce para tudo que não fosse VNDA.
 *
 *  Esse defeito é pior do que parece porque parece OUTRA coisa — quem vê pensa
 *  que cadastrou errado, e vai procurar o erro no cadastro. Havia duas cópias
 *  do mesmo ternário: a tabela de Lojas e o rótulo do Panorama.
 * ─────────────────────────────────────────────────────────────────────────────
 */
describe("labels vêm do catálogo, nunca de um ternário", () => {
  const fonte = async (caminho: string) => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    return fs.readFileSync(path.join(__dirname, "..", caminho), "utf8");
  };

  it.each([
    ["client/src/components/conexoes/LojasVinculos.tsx", "tabela de Lojas"],
    ["shared/panoramaLogic.ts", "rótulo do Panorama"],
  ])("%s não decide label por plataforma no ternário", async (caminho) => {
    const codigo = (await fonte(caminho))
      .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    // O padrão exato que causou o bug, nas duas formas em que ele apareceu.
    expect(codigo).not.toMatch(/=== *"vnda" *\? *"[^"]*" *: *"WooCommerce"/);
    expect(codigo).not.toMatch(/=== *"vnda" *\? *"VNDA" *: *"Woo"/);
  });

  /** Fallback que INVENTA plataforma faz a origem do número mentir. */
  it("o Panorama não assume woocommerce quando a plataforma é desconhecida", async () => {
    const codigo = (await fonte("shared/panoramaLogic.ts"))
      .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(codigo).not.toContain('?? "woocommerce"');
  });

  it("toda plataforma do catálogo tem rótulo curto no Panorama", async () => {
    const { rotuloPlataforma } = await import("./panoramaLogic");
    for (const p of PLATAFORMAS_LOJA) {
      const r = rotuloPlataforma(p.id);
      expect(r, `${p.id} sem rótulo`).toBeTruthy();
      // Nenhuma pode cair no rótulo de outra.
      if (p.id !== "woocommerce") expect(r, `${p.id} virou Woo`).not.toBe("Woo");
    }
  });

  it("plataforma desconhecida não vira Woo", async () => {
    const { rotuloPlataforma } = await import("./panoramaLogic");
    expect(rotuloPlataforma("magento")).not.toBe("Woo");
  });
});
