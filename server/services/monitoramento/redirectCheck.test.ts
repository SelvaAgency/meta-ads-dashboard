/**
 * Extração de `<head>` — as partes puras do coletor de redirect.
 *
 * O coletor em si depende de rede e não é testado aqui; o que é testável sem
 * rede são os extratores, e é neles que mora o risco de silêncio: um regex que
 * não casa devolve `null`, que é indistinguível de "a página não tem canonical".
 */
import { describe, expect, it } from "vitest";
import { extrairCanonical, extrairTitulo } from "./redirectCheck";

describe("canonical", () => {
  it.each([
    ['aspas duplas', '<link rel="canonical" href="https://x.com/a">'],
    ['aspas simples', "<link rel='canonical' href='https://x.com/a'>"],
    ['sem aspas no rel', '<link rel=canonical href="https://x.com/a">'],
    ['href antes do rel', '<link href="https://x.com/a" rel="canonical">'],
    ['maiúsculas', '<LINK REL="CANONICAL" HREF="https://x.com/a">'],
    ['auto-fechada', '<link rel="canonical" href="https://x.com/a" />'],
  ])("extrai de %s", (_n, html) => {
    expect(extrairCanonical(`<head>${html}</head>`)).toBe("https://x.com/a");
  });

  it("página sem canonical devolve null", () => {
    expect(extrairCanonical("<head><title>x</title></head>")).toBeNull();
  });

  /** Conteúdo externo é hostil por definição: nunca entra inteiro. */
  it("trunca href absurdamente longo", () => {
    const gigante = `<link rel="canonical" href="https://x.com/${"a".repeat(5000)}">`;
    expect(extrairCanonical(gigante)!.length).toBeLessThanOrEqual(500);
  });
});

describe("título", () => {
  it("extrai e normaliza espaços", () => {
    expect(extrairTitulo("<title>\n  Aiká   Body\n</title>")).toBe("Aiká Body");
  });

  it("com atributos na tag", () => {
    expect(extrairTitulo('<title data-x="1">Loja</title>')).toBe("Loja");
  });

  it("sem título devolve null", () => {
    expect(extrairTitulo("<head></head>")).toBeNull();
  });

  /**
   * Título gigante precisa ser TRUNCADO, nunca virar `null`: título inflado é
   * sintoma de injeção de SEO, então perdê-lo é perder justamente o sinal que
   * o robô procura — e perdê-lo como "página sem título", indistinguível de
   * uma página que de fato não tem.
   */
  it("título gigante é truncado, não vira null", () => {
    const t = extrairTitulo(`<title>${"T".repeat(5000)}</title>`);
    expect(t).not.toBeNull();
    expect(t!.length).toBeLessThanOrEqual(200);
  });

  it("título sem tag de fechamento ainda é lido", () => {
    expect(extrairTitulo("<head><title>Loja aberta")).toBe("Loja aberta");
  });
});

/**
 * Registro do achado que motivou o teto de leitura: no site real da Aiká (Wix),
 * o `<title>` está em 123 KB e o canonical em 123,3 KB, porque a plataforma
 * injeta ~120 KB de script antes deles. Com o teto antigo de 64 KB, os dois
 * voltavam `null` PARA SEMPRE — sem erro, sem log, sem sintoma.
 */
describe("cabeça pesada", () => {
  it("head de 120 KB antes do title ainda é extraível", () => {
    const enchimento = `<script>${"/*x*/".repeat(24_000)}</script>`; // ~120 KB
    const html = `<head>${enchimento}<title>Aiká</title><link rel="canonical" href="https://a.com/"></head>`;
    expect(html.length).toBeGreaterThan(100_000);
    expect(extrairTitulo(html)).toBe("Aiká");
    expect(extrairCanonical(html)).toBe("https://a.com/");
  });
});
