/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Wix — o que dá para provar sem a chave
 * ─────────────────────────────────────────────────────────────────────────────
 *  A chamada autenticada só existe com a API Key, que ainda não temos. O que
 *  este arquivo cobre é a validação de entrada: o Site ID é a fonte mais
 *  provável de erro na primeira tentativa, e um Site ID errado devolve 403 —
 *  indistinguível de "a chave não tem permissão".
 *
 *  Diagnosticar isso ANTES da chamada é o que evita a pessoa passar meia hora
 *  ajustando permissão de uma chave que está certa.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, expect, it } from "vitest";
import { PENDENCIAS_WIX, testarConexaoWix, validarSiteId, validarUrlWix, WixCredencialInvalidaError } from "./wix";

describe("Site ID", () => {
  it("aceita o GUID do site da Aiká", () => {
    expect(validarSiteId("fa19d2c0-7e17-4bc7-a3a8-eeeaf7c509b1"))
      .toBe("fa19d2c0-7e17-4bc7-a3a8-eeeaf7c509b1");
  });

  it("normaliza caixa e espaços", () => {
    expect(validarSiteId("  FA19D2C0-7E17-4BC7-A3A8-EEEAF7C509B1 "))
      .toBe("fa19d2c0-7e17-4bc7-a3a8-eeeaf7c509b1");
  });

  /** Cada um destes devolveria 403 na Wix — erro que parece falta de permissão. */
  it.each([
    ["o nome do site", "aikabodysoul"],
    ["a URL", "https://www.aikabodysoul.com"],
    ["GUID truncado", "fa19d2c0-7e17-4bc7-a3a8"],
    ["vazio", ""],
    ["texto qualquer", "minha loja"],
  ])("recusa %s antes de chamar a API", (_n, v) => {
    expect(() => validarSiteId(v)).toThrow(WixCredencialInvalidaError);
  });

  it("a mensagem mostra o formato esperado", () => {
    expect(() => validarSiteId("x")).toThrow(/8-4-4-4-12/);
  });
});

describe("URL da loja", () => {
  it("aceita https e tira a barra final", async () => {
    expect(await validarUrlWix("https://aikabodysoul.com/")).toBe("https://aikabodysoul.com");
  });

  it.each([["http://loja.com"], ["loja.com"], [""]])("recusa %s", async (v) => {
    await expect(validarUrlWix(v)).rejects.toThrow(WixCredencialInvalidaError);
  });
});

describe("teste de conexão — o que é barrado sem rede", () => {
  it("Site ID inválido nem chega a chamar a API", async () => {
    const r = await testarConexaoWix("uma-chave-longa-o-suficiente-aqui", "não é guid");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toContain("8-4-4-4-12");
  });

  it("chave vazia ou curta demais é barrada com instrução", async () => {
    const r = await testarConexaoWix("abc", "fa19d2c0-7e17-4bc7-a3a8-eeeaf7c509b1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toContain("API Key");
  });
});

/**
 * O ponto do passo 1: credencial válida NÃO é integração. Se estas pendências
 * sumirem sem o adaptador existir, a tela passa a mentir.
 */
describe("o que ainda não existe fica declarado", () => {
  it("as pendências dizem o que não acontece", () => {
    expect(PENDENCIAS_WIX.join(" ")).toMatch(/pedidos/i);
    expect(PENDENCIAS_WIX.join(" ")).toMatch(/snapshot/i);
    expect(PENDENCIAS_WIX.join(" ")).toMatch(/Panorama|Jornalzinho|BlocoVendas/i);
  });

  it("Wix continua NÃO integrada no catálogo", async () => {
    const { temIntegracao } = await import("../../shared/plataformasLoja");
    expect(temIntegracao("wix")).toBe(false);
  });

  /** Sem adaptador de pedidos, o dispatch do sync não pode ter ramo de Wix. */
  it("o sync não tem ramo de Wix ainda", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const fonte = fs.readFileSync(path.join(__dirname, "lojaSync.ts"), "utf8");
    expect(fonte).not.toContain('cred.platform === "wix"');
  });
});
