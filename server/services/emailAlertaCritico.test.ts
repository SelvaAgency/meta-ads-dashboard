/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  E-mail de incidente — o escape, provado sem enviar nada
 * ─────────────────────────────────────────────────────────────────────────────
 *  A evidência deste e-mail vem de FORA: domínio de destino, título da página,
 *  cadeia de redirects. No cenário que o robô existe para pegar, esse conteúdo
 *  é controlado por quem sequestrou o site — hostil por definição.
 *
 *  Provar isso mandando e-mail seria a forma errada; por isso o montador é
 *  separado do envio.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, expect, it } from "vitest";
import { esc, montarEmailCritico } from "./emailAlertaCritico";

const base = {
  nome: "Aiká", titulo: "Site redireciona para outro domínio",
  detalhe: "Esperado aikabodysoul.com, chegou em registro-suspenso.net.",
  link: "/site?account=4&aba=monitoramento",
};

describe("escape", () => {
  it.each([
    ["<script>alert(1)</script>", "&lt;script&gt;"],
    ['"aspas"', "&quot;"],
    ["a & b", "&amp;"],
    ["it's", "&#39;"],
  ])("neutraliza %s", (entrada, esperado) => {
    expect(esc(entrada)).toContain(esperado);
  });

  it("título hostil da página não vira tag no HTML", () => {
    const { html } = montarEmailCritico({
      ...base,
      evidencia: [{ rotulo: "Título da página", valor: '<img src=x onerror="alert(1)">' }],
    });
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });

  it("nome do cliente também é escapado — nada entra cru", () => {
    const { html } = montarEmailCritico({ ...base, nome: "<b>X</b>" });
    expect(html).not.toContain("<b>X</b>");
  });
});

describe("corpo", () => {
  it("o link vira URL absoluta do Spaces", () => {
    const { html, text } = montarEmailCritico(base);
    expect(html).toContain("https://spaces.selva.agency/site?account=4&amp;aba=monitoramento");
    expect(text).toContain("https://spaces.selva.agency/site?account=4&aba=monitoramento");
  });

  it("a evidência aparece como linhas legíveis, não como JSON", () => {
    const { html, text } = montarEmailCritico({
      ...base,
      evidencia: [
        { rotulo: "Domínio esperado", valor: "aikabodysoul.com" },
        { rotulo: "Chegou em", valor: "registro-suspenso.net" },
      ],
    });
    expect(html).toContain("Chegou em");
    expect(html).toContain("registro-suspenso.net");
    expect(text).toContain("Chegou em: registro-suspenso.net");
    expect(html).not.toContain("{");
  });

  it("evidência vazia não deixa tabela órfã", () => {
    const { html } = montarEmailCritico({ ...base, evidencia: [{ rotulo: "Caminho", valor: "" }] });
    expect(html).not.toContain("<table");
  });

  /** Quebra de linha existe no texto; no HTML precisa virar <br> ou some. */
  it("quebra de linha sobrevive nos dois formatos", () => {
    const { html, text } = montarEmailCritico({ ...base, detalhe: "linha 1\nlinha 2" });
    expect(html).toContain("linha 1<br>linha 2");
    expect(text).toContain("linha 1\nlinha 2");
  });

  /** Gmail descarta <style> e não entende flex/grid — só tabela e inline. */
  it("não usa <style>, flex nem grid", () => {
    const { html } = montarEmailCritico({ ...base, evidencia: [{ rotulo: "a", valor: "b" }] });
    expect(html).not.toContain("<style");
    expect(html).not.toMatch(/display:\s*(flex|grid)/);
  });
});
