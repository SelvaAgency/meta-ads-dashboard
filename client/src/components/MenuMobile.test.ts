/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  A promessa de "desktop 100% intacto", verificada
 * ─────────────────────────────────────────────────────────────────────────────
 *  As duas sidebars ganharam `classesDaGaveta(...)` concatenado às classes que
 *  já tinham. A promessa de que o desktop não muda depende inteiramente de UMA
 *  coisa: nenhuma classe emitida por aqui pode valer acima de 768px.
 *
 *  Uma classe sem o prefixo `max-md:` passaria despercebida na revisão — o
 *  código continuaria compilando, os testes passariam, e o desktop mudaria em
 *  produção. Este teste é a única barreira contra isso.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, expect, it } from "vitest";
import { classesDaGaveta } from "./MenuMobile";

const classes = (aberto: boolean) => classesDaGaveta(aberto).split(/\s+/).filter(Boolean);

describe("classesDaGaveta só afeta mobile", () => {
  it.each([[true], [false]])("aberto=%s: TODA classe é max-md:", (aberto) => {
    const semPrefixo = classes(aberto).filter((c) => !c.startsWith("max-md:"));
    expect(semPrefixo, `estas classes valeriam no desktop: ${semPrefixo.join(", ")}`).toEqual([]);
  });

  it("nunca emite variante que suba de breakpoint", () => {
    const proibidos = /^(md:|lg:|xl:|2xl:|sm:)/;
    for (const aberto of [true, false]) {
      expect(classes(aberto).filter((c) => proibidos.test(c))).toEqual([]);
    }
  });
});

describe("o estado abre e fecha de verdade", () => {
  /**
   * O deslocamento é o que esconde a gaveta. Se os dois estados emitissem a
   * mesma translação, o menu ficaria permanentemente aberto por cima do
   * conteúdo — ou permanentemente invisível, com o hambúrguer sem efeito.
   */
  it("fechada desloca para fora, aberta volta para a tela", () => {
    expect(classes(false)).toContain("max-md:-translate-x-full");
    expect(classes(true)).toContain("max-md:translate-x-0");
    expect(classes(true)).not.toContain("max-md:-translate-x-full");
  });

  it("o resto das classes é igual nos dois estados", () => {
    const semTranslate = (a: boolean) => classes(a).filter((c) => !c.includes("translate"));
    expect(semTranslate(true)).toEqual(semTranslate(false));
  });
});

describe("a gaveta não pode causar scroll horizontal", () => {
  /** Largura maior que a tela empurraria a página para os lados. */
  it("tem teto relativo à viewport", () => {
    expect(classes(true).some((c) => c.startsWith("max-md:max-w-["))).toBe(true);
  });

  it("sai do fluxo — não empurra o conteúdo principal", () => {
    expect(classes(true)).toContain("max-md:fixed");
  });

  it("fica acima do conteúdo e do fundo escurecido", () => {
    expect(classes(true)).toContain("max-md:z-50");
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Hover no toque — a regra que some numa refatoração distraída
 * ─────────────────────────────────────────────────────────────────────────────
 *  As duas sidebars e o flyout de clientes decidem o que mostrar por
 *  `onMouseEnter`. No celular o toque DISPARA mouseenter e o `mouseleave`
 *  muitas vezes nunca vem: o estado fica preso, a sidebar abre sozinha e não
 *  fecha, e o flyout aparece posicionado fora da tela.
 *
 *  A proteção é passar `undefined` no handler quando não há ponteiro fino.
 *  Trocar isso por um `if` dentro do handler pareceria equivalente e não seria:
 *  o React ainda registraria o listener, e o `active:`/`:hover` do CSS
 *  continuaria colando. Este teste fixa a consulta que decide.
 * ─────────────────────────────────────────────────────────────────────────────
 */
describe("a pergunta que decide se hover vale", () => {
  const CONSULTA = "(hover: hover) and (pointer: fine)";

  it("é a consulta usada no código", async () => {
    const fonte = await import("node:fs").then((fs) =>
      fs.readFileSync(new URL("./MenuMobile.tsx", import.meta.url), "utf8"));
    expect(fonte).toContain(CONSULTA);
  });

  /**
   * `(hover: hover)` sozinho deixaria passar tablet com caneta e alguns
   * Androids que se declaram capazes de hover. `pointer: fine` é o que separa
   * dedo de mouse.
   */
  it("exige as DUAS condições — só hover não basta", async () => {
    const fonte = await import("node:fs").then((fs) =>
      fs.readFileSync(new URL("./MenuMobile.tsx", import.meta.url), "utf8"));
    const consultas = fonte.match(/matchMedia\("([^"]+)"\)/g) ?? [];
    expect(consultas.length).toBeGreaterThan(0);
    for (const c of consultas) {
      expect(c).toContain("hover: hover");
      expect(c).toContain("pointer: fine");
    }
  });

  /** Os handlers precisam ser CONDICIONAIS, não conter um if por dentro. */
  it.each([
    ["client/src/pages/hub/HubSidebar.tsx", "HubSidebar"],
    ["client/src/components/MetaDashboardLayout.tsx", "MetaDashboardLayout"],
  ])("%s passa undefined quando não há ponteiro fino", async (caminho) => {
    const fs = await import("node:fs");
    const fonte = fs.readFileSync(new URL(`../../../${caminho}`, import.meta.url), "utf8");
    const handlers = fonte.match(/onMouse(Enter|Leave)=\{[^}]*/g) ?? [];
    expect(handlers.length).toBeGreaterThan(0);
    for (const h of handlers) {
      expect(h, `handler sem guarda de ponteiro: ${h.slice(0, 60)}`).toContain("hoverVale");
    }
  });
});
