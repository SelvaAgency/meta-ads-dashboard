import { describe, it, expect } from "vitest";
import { validarUrlDaLoja, LojaUrlInvalidaError } from "./woocommerce";
import { mascararChave } from "../db";

/**
 * F5-B: a conexão WooCommerce carrega credencial em Basic auth. Estes testes
 * travam as regras que protegem a credencial — HTTPS obrigatório, URL limpa,
 * anti-SSRF — e a máscara que impede a key de voltar inteira ao frontend.
 */
describe("URL da loja", () => {
  it("aceita https com caminho limpo e remove barra final", async () => {
    expect(await validarUrlDaLoja("https://scaffoldplay.com.br/")).toBe("https://scaffoldplay.com.br");
    expect(await validarUrlDaLoja("https://baesh.com.br")).toBe("https://baesh.com.br");
  });

  it("recusa http — credencial em Basic auth não trafega em claro", async () => {
    await expect(validarUrlDaLoja("http://loja.com.br")).rejects.toThrow(LojaUrlInvalidaError);
    await expect(validarUrlDaLoja("http://loja.com.br")).rejects.toThrow(/https/);
  });

  it("recusa query e âncora — o join com /wp-json precisa ser previsível", async () => {
    await expect(validarUrlDaLoja("https://loja.com.br/?utm=x")).rejects.toThrow(/parâmetros/);
    await expect(validarUrlDaLoja("https://loja.com.br/#topo")).rejects.toThrow(LojaUrlInvalidaError);
  });

  it("anti-SSRF: localhost, IP privado e metadata são bloqueados pelo urlGuard", async () => {
    for (const alvo of ["https://localhost/wp", "https://127.0.0.1", "https://192.168.1.10", "https://169.254.169.254"]) {
      await expect(validarUrlDaLoja(alvo)).rejects.toThrow();
    }
  });

  it("esquema não-http(s) é recusado", async () => {
    await expect(validarUrlDaLoja("ftp://loja.com.br")).rejects.toThrow();
  });
});

describe("máscara da consumer_key", () => {
  it("mostra só o começo e os últimos 4 — reconhecível, inutilizável", () => {
    expect(mascararChave("ck_1234567890abcdefagh")).toBe("ck_…fagh");
  });

  it("chave curta vira máscara total, sem vazar nada", () => {
    expect(mascararChave("ck_12")).toBe("····");
    expect(mascararChave("")).toBe("····");
  });

  it("a máscara nunca contém o miolo da chave", () => {
    const chave = "ck_SEGREDO_QUE_NAO_PODE_APARECER_9999";
    const m = mascararChave(chave);
    expect(m).not.toContain("SEGREDO");
    expect(m.length).toBeLessThan(12);
  });
});
