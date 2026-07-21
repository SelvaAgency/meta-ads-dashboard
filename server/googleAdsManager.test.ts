import { describe, it, expect, beforeEach, afterEach } from "vitest";

/**
 * Conta gerenciadora (MCC) não tem métricas próprias.
 *
 * Histórico real: o MCC 9284868244 ficou vinculado ao cliente "SELVA Agency"
 * numa descoberta antiga, anterior ao filtro que exclui gerenciadoras. Depois
 * que o Developer Token foi aprovado, a consulta parou de dar PERMISSION_DENIED
 * e passou a dar INVALID_ARGUMENT / REQUESTED_METRICS_FOR_MANAGER — mensagem
 * correta do Google, mas que chega na tela como "erro na consulta" e manda
 * procurar no lugar errado.
 *
 * O MCC é o `login-customer-id` do cabeçalho; o `customerId` da query tem que
 * ser sempre a conta do cliente. Estes testes travam essa distinção.
 */
const MCC = "9284868244";
const CLIENTE = "8184107035"; // Scaffold Play

describe("métricas nunca são pedidas à gerenciadora", () => {
  const antes = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID;
  beforeEach(() => { process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID = MCC; });
  afterEach(() => { process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID = antes; });

  const cfg = (login?: string) => ({
    developerToken: "x", clientId: "x", clientSecret: "x", refreshToken: "x",
    loginCustomerId: login,
  });

  it("recusa quando o customerId é o próprio MCC", async () => {
    const { getGoogleAdsCampaigns } = await import("./googleAdsService");
    await expect(getGoogleAdsCampaigns(cfg(MCC), MCC, "2026-07-01", "2026-07-21"))
      .rejects.toThrow(/gerenciadora/i);
  });

  it("a mensagem diz o que fazer, não só o que falhou", async () => {
    const { getGoogleAdsCampaigns } = await import("./googleAdsService");
    await expect(getGoogleAdsCampaigns(cfg(MCC), MCC, "2026-07-01", "2026-07-21"))
      .rejects.toThrow(/Vincule este cliente a uma conta de anúncios real/);
  });

  it("recusa mesmo com o id formatado com traços", async () => {
    const { getGoogleAdsCampaigns } = await import("./googleAdsService");
    await expect(getGoogleAdsCampaigns(cfg(MCC), "928-486-8244", "2026-07-01", "2026-07-21"))
      .rejects.toThrow(/gerenciadora/i);
  });

  it("as quatro consultas de métrica recusam, não só a de campanhas", async () => {
    const svc = await import("./googleAdsService");
    await expect(svc.getGoogleAdsCampaigns(cfg(MCC), MCC, "2026-07-01", "2026-07-21")).rejects.toThrow(/gerenciadora/i);
    await expect(svc.getGoogleAdsAdGroups(cfg(MCC), MCC, "1", "2026-07-01", "2026-07-21")).rejects.toThrow(/gerenciadora/i);
    await expect(svc.getGoogleAdsAds(cfg(MCC), MCC, "1", "2026-07-01", "2026-07-21")).rejects.toThrow(/gerenciadora/i);
    await expect(svc.getGoogleAdsAccountSummary(cfg(MCC), MCC, "2026-07-01", "2026-07-21")).rejects.toThrow(/gerenciadora/i);
  });

  it("conta de cliente NÃO é recusada pela guarda", async () => {
    const { getGoogleAdsCampaigns } = await import("./googleAdsService");
    // Passa da guarda e falha adiante, na rede/credencial — que é o esperado
    // num teste sem API. O que importa é não morrer com "gerenciadora".
    await expect(getGoogleAdsCampaigns(cfg(MCC), CLIENTE, "2026-07-01", "2026-07-21"))
      .rejects.not.toThrow(/gerenciadora/i);
  });

  it("sem loginCustomerId declarado, a guarda não bloqueia nada", async () => {
    const { getGoogleAdsCampaigns } = await import("./googleAdsService");
    await expect(getGoogleAdsCampaigns(cfg(undefined), MCC, "2026-07-01", "2026-07-21"))
      .rejects.not.toThrow(/gerenciadora/i);
  });
});
