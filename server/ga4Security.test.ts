import { describe, it, expect, beforeAll } from "vitest";

/**
 * Invariantes de segurança do GA4, travadas antes de qualquer propriedade real
 * ser conectada.
 *
 * As três falhas que existiam (todas encontradas com a tabela ainda vazia):
 *  1. refresh token gravado em TEXTO PURO;
 *  2. leitura por id da conexão, conferindo só existência e nunca dono — um
 *     inteiro chutado abria a propriedade de outro cliente;
 *  3. `isConfigured` público, respondendo sem login.
 *
 * O que estes testes protegem é a 1 e a forma da 2. A 2 em si foi eliminada
 * por desenho: a leitura passou a ser por CLIENTE, então não existe mais id de
 * conexão para chutar.
 */
describe("segurança do GA4", () => {
  beforeAll(() => {
    // 32 bytes em base64 — chave de teste, não sai daqui.
    process.env.INTEGRATIONS_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  });

  it("o token vai e volta pela criptografia sem se parecer com o original", async () => {
    const { encryptSecret, decryptSecret } = await import("./_core/integrationsCrypto");
    const token = "1//0gTOKEN-de-refresh-do-google-ga4";
    const cifrado = encryptSecret(token);

    expect(cifrado).not.toContain(token);
    expect(cifrado).not.toContain("1//0g");
    expect(decryptSecret(cifrado)).toBe(token);
  });

  it("tokenDaContaGA4 prefere o campo criptografado", async () => {
    const { encryptSecret } = await import("./_core/integrationsCrypto");
    const { tokenDaContaGA4 } = await import("./db");
    const token = "token-verdadeiro";
    expect(tokenDaContaGA4({
      refreshTokenEncrypted: encryptSecret(token),
      refreshToken: "texto-puro-antigo",
    })).toBe(token);
  });

  it("aceita o formato antigo em texto puro — registro anterior não quebra", async () => {
    const { tokenDaContaGA4 } = await import("./db");
    expect(tokenDaContaGA4({ refreshToken: "texto-puro-antigo" })).toBe("texto-puro-antigo");
  });

  it("sem credencial nenhuma devolve null em vez de string vazia", async () => {
    const { tokenDaContaGA4 } = await import("./db");
    expect(tokenDaContaGA4({})).toBeNull();
    expect(tokenDaContaGA4({ refreshToken: null, refreshTokenEncrypted: null })).toBeNull();
  });

  it("payload cifrado corrompido devolve null, não derruba a leitura", async () => {
    const { tokenDaContaGA4 } = await import("./db");
    expect(tokenDaContaGA4({ refreshTokenEncrypted: "lixo-que-nao-e-payload" })).toBeNull();
  });
});
