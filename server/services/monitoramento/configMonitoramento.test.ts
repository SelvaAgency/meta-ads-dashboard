/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Normalização do domínio esperado
 * ─────────────────────────────────────────────────────────────────────────────
 *  O domínio esperado é o lado ESQUERDO de toda comparação do robô. Guardar
 *  "https://www.aikabodysoul.com/" faria a comparação contra o domínio
 *  registrável ("aikabodysoul.com") falhar SEMPRE — e o resultado não seria um
 *  erro visível, seria um alerta crítico falso a cada 5 minutos, no primeiro
 *  cliente monitorado.
 *
 *  Por isso a normalização acontece na ENTRADA (ao salvar), não na comparação:
 *  o dado errado nunca chega ao banco.
 */
import { describe, expect, it } from "vitest";

/** Espelha a normalização de `monitoramento.salvarConfig` e de `criarContaDeMonitoramento`. */
function normalizarDominio(v: string): string | null {
  // toLowerCase ANTES de tirar o esquema: os regex são case-sensitive, e
  // "HTTPS://WWW.X.COM" sobreviveria ao primeiro replace, viraria "HTTPS:" no
  // segundo e seria gravado como domínio — alerta falso a cada 5 minutos.
  return v.trim().toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/^www\./, "") || null;
}

describe("domínio esperado", () => {
  it("aceita o formato que a pessoa realmente digita", () => {
    // Foi exatamente assim que o domínio da Aiká chegou.
    expect(normalizarDominio("https://www.aikabodysoul.com/")).toBe("aikabodysoul.com");
  });

  it.each([
    ["já limpo",        "aikabodysoul.com"],
    ["com www",         "www.aikabodysoul.com"],
    ["com http",        "http://aikabodysoul.com"],
    ["com https e www", "https://www.aikabodysoul.com"],
    ["com caminho",     "https://aikabodysoul.com/loja/produto"],
    ["com maiúscula",   "HTTPS://WWW.AikaBodySoul.COM"],
    ["com espaços",     "  https://www.aikabodysoul.com/  "],
  ])("normaliza %s para o domínio registrável", (_n, entrada) => {
    expect(normalizarDominio(entrada)).toBe("aikabodysoul.com");
  });

  it("preserva subdomínio real — loja.x.com não é x.com", () => {
    // `www` é convenção e sai; qualquer outro subdomínio é endereço diferente e
    // removê-lo faria o robô aprovar um destino que não é o esperado.
    expect(normalizarDominio("https://loja.aikabodysoul.com")).toBe("loja.aikabodysoul.com");
  });

  it("vazio vira null, não string vazia", () => {
    // String vazia passaria em checagem de "tem valor?" e viraria comparação
    // contra "" — que casa com nada e alerta sempre.
    expect(normalizarDominio("   ")).toBeNull();
    expect(normalizarDominio("https://")).toBeNull();
  });
});
