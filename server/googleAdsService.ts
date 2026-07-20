/**
 * Google Ads API Service
 *
 * Integrates with the Google Ads API (REST) to fetch campaigns, ad groups, ads and metrics.
 * A versão é configurável — ver GOOGLE_ADS_API_VERSION abaixo.
 * Uses OAuth2 refresh tokens for authentication.
 *
 * Required ENV vars:
 *   GOOGLE_ADS_DEVELOPER_TOKEN - from Google Ads API Center
 *   GOOGLE_ADS_CLIENT_ID       - OAuth2 client ID
 *   GOOGLE_ADS_CLIENT_SECRET   - OAuth2 client secret
 *   GOOGLE_ADS_REFRESH_TOKEN   - OAuth2 refresh token (obtained via consent flow)
 *   GOOGLE_ADS_LOGIN_CUSTOMER_ID - MCC account ID (if using MCC, no dashes)
 */

/**
 * Versão da API. O Google aposenta cada versão em ~12 meses e devolve 404 nas
 * mortas — a v17 daqui ficou morta por muito tempo sem ninguém notar, e o
 * sintoma (404) parecia erro de credencial. Sondagem em jul/2026: v17–v19
 * mortas, v20–v25 vivas.
 *
 * Configurável por env para poder subir a versão sem deploy quando esta
 * aposentar. Confira as datas em:
 * https://developers.google.com/google-ads/api/docs/sunset-dates
 */
const GOOGLE_ADS_API_VERSION = process.env.GOOGLE_ADS_API_VERSION || "v24";
const GOOGLE_ADS_BASE = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}`;
const TOKEN_URL = "https://oauth2.googleapis.com/token";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface GoogleAdsConfig {
  developerToken: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  loginCustomerId?: string; // MCC ID (no dashes)
}

export interface GoogleAdsCampaign {
  id: string;
  name: string;
  status: "ENABLED" | "PAUSED" | "REMOVED";
  advertisingChannelType: string; // SEARCH, DISPLAY, SHOPPING, PERFORMANCE_MAX, VIDEO, etc.
  biddingStrategy: string;
  budget: number;
  budgetType: string;
  // Metrics
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  conversionValue: number;
  ctr: number;
  cpc: number;
  cpm: number;
  costPerConversion: number;
  roas: number;
  // Search-specific
  searchImpressionShare?: number;
  qualityScore?: number;
}

export interface GoogleAdsAdGroup {
  id: string;
  name: string;
  campaignId: string;
  campaignName: string;
  status: "ENABLED" | "PAUSED" | "REMOVED";
  type: string;
  // Metrics
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  conversionValue: number;
  ctr: number;
  cpc: number;
  cpm: number;
  costPerConversion: number;
  roas: number;
}

export interface GoogleAdsAd {
  id: string;
  name: string;
  adGroupId: string;
  adGroupName: string;
  campaignId: string;
  campaignName: string;
  status: "ENABLED" | "PAUSED" | "REMOVED";
  type: string; // RESPONSIVE_SEARCH_AD, RESPONSIVE_DISPLAY_AD, etc.
  headlines?: string[];
  descriptions?: string[];
  finalUrls?: string[];
  // Metrics
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  conversionValue: number;
  ctr: number;
  cpc: number;
  costPerConversion: number;
  roas: number;
}

// ─── Token Management ────────────────────────────────────────────────────────

let cachedAccessToken: string | null = null;
let tokenExpiresAt = 0;

async function getAccessToken(config: GoogleAdsConfig): Promise<string> {
  if (cachedAccessToken && Date.now() < tokenExpiresAt - 60_000) {
    return cachedAccessToken;
  }

  const resp = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    console.error("[GoogleAds] Token refresh failed:", err);
    throw new Error(`Google Ads token refresh failed: ${resp.status}`);
  }

  const data = await resp.json() as { access_token: string; expires_in: number };
  cachedAccessToken = data.access_token;
  tokenExpiresAt = Date.now() + data.expires_in * 1000;
  return cachedAccessToken;
}

// ─── GAQL Query Executor ─────────────────────────────────────────────────────

async function executeGaql(
  config: GoogleAdsConfig,
  customerId: string,
  query: string
): Promise<any[]> {
  const accessToken = await getAccessToken(config);
  const cleanCustomerId = customerId.replace(/-/g, "");

  const url = `${GOOGLE_ADS_BASE}/customers/${cleanCustomerId}/googleAds:searchStream`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "developer-token": config.developerToken,
    "Content-Type": "application/json",
  };

  if (config.loginCustomerId) {
    headers["login-customer-id"] = config.loginCustomerId.replace(/-/g, "");
  }

  const resp = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ query }),
  });

  if (!resp.ok) {
    const errBody = await resp.text();
    console.error(`[GoogleAds] GAQL query failed (${resp.status}):`, errBody);
    throw new Error(`Google Ads API error ${resp.status}: ${errBody.substring(0, 300)}`);
  }

  const results = await resp.json() as Array<{ results: any[] }>;
  // searchStream returns array of batches
  return results.flatMap((batch) => batch.results ?? []);
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Fetch active campaigns with performance metrics for a date range.
 */
export async function getGoogleAdsCampaigns(
  config: GoogleAdsConfig,
  customerId: string,
  startDate: string,
  endDate: string,
  incluirRemovidas = false
): Promise<GoogleAdsCampaign[]> {
  /**
   * Tudo menos REMOVED — é o padrão do próprio Google Ads, que mostra ativas e
   * pausadas juntas. Antes filtrava status='ENABLED' E serving_status='SERVING':
   * campanha pausada não está "serving", então o segundo filtro a matava mesmo
   * quando o primeiro deixava passar. Resultado: conta com gasto real aparecia
   * como "nenhuma campanha".
   */
  const statusFilter = incluirRemovidas ? "" : `AND campaign.status != 'REMOVED'`;

  const query = `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      campaign.advertising_channel_type,
      campaign.bidding_strategy_type,
      campaign_budget.amount_micros,
      campaign_budget.type,
      metrics.cost_micros,
      metrics.impressions,
      metrics.clicks,
      metrics.conversions,
      metrics.conversions_value,
      metrics.ctr,
      metrics.average_cpc,
      metrics.average_cpm,
      metrics.cost_per_conversion,
      metrics.search_impression_share
    FROM campaign
    WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
      ${statusFilter}
    ORDER BY metrics.cost_micros DESC
  `;

  const rows = await executeGaql(config, customerId, query);

  return rows.map((row) => {
    const c = row.campaign;
    const m = row.metrics;
    const b = row.campaignBudget;
    const spend = (m.costMicros ?? 0) / 1_000_000;
    const convValue = parseFloat(m.conversionsValue ?? "0");
    return {
      id: c.id,
      name: c.name,
      status: c.status,
      advertisingChannelType: c.advertisingChannelType,
      biddingStrategy: c.biddingStrategyType ?? "",
      budget: (b?.amountMicros ?? 0) / 1_000_000,
      budgetType: b?.type ?? "DAILY",
      spend,
      impressions: parseInt(m.impressions ?? "0"),
      clicks: parseInt(m.clicks ?? "0"),
      conversions: parseFloat(m.conversions ?? "0"),
      conversionValue: convValue,
      ctr: parseFloat(m.ctr ?? "0") * 100,
      cpc: (m.averageCpc ?? 0) / 1_000_000,
      cpm: (m.averageCpm ?? 0) / 1_000_000,
      costPerConversion: (m.costPerConversion ?? 0) / 1_000_000,
      roas: spend > 0 ? convValue / spend : 0,
      searchImpressionShare: m.searchImpressionShare
        ? parseFloat(m.searchImpressionShare)
        : undefined,
    };
  });
}

/**
 * Fetch ad groups with performance metrics.
 */
export async function getGoogleAdsAdGroups(
  config: GoogleAdsConfig,
  customerId: string,
  campaignId: string,
  startDate: string,
  endDate: string
): Promise<GoogleAdsAdGroup[]> {
  const query = `
    SELECT
      ad_group.id,
      ad_group.name,
      ad_group.campaign,
      ad_group.status,
      ad_group.type,
      campaign.id,
      campaign.name,
      metrics.cost_micros,
      metrics.impressions,
      metrics.clicks,
      metrics.conversions,
      metrics.conversions_value,
      metrics.ctr,
      metrics.average_cpc,
      metrics.average_cpm,
      metrics.cost_per_conversion
    FROM ad_group
    WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
      AND campaign.id = ${campaignId}
      AND ad_group.status != 'REMOVED'
    ORDER BY metrics.cost_micros DESC
  `;

  const rows = await executeGaql(config, customerId, query);

  return rows.map((row) => {
    const ag = row.adGroup;
    const m = row.metrics;
    const c = row.campaign;
    const spend = (m.costMicros ?? 0) / 1_000_000;
    const convValue = parseFloat(m.conversionsValue ?? "0");
    return {
      id: ag.id,
      name: ag.name,
      campaignId: c.id,
      campaignName: c.name,
      status: ag.status,
      type: ag.type ?? "",
      spend,
      impressions: parseInt(m.impressions ?? "0"),
      clicks: parseInt(m.clicks ?? "0"),
      conversions: parseFloat(m.conversions ?? "0"),
      conversionValue: convValue,
      ctr: parseFloat(m.ctr ?? "0") * 100,
      cpc: (m.averageCpc ?? 0) / 1_000_000,
      cpm: (m.averageCpm ?? 0) / 1_000_000,
      costPerConversion: (m.costPerConversion ?? 0) / 1_000_000,
      roas: spend > 0 ? convValue / spend : 0,
    };
  });
}

/**
 * Fetch ads with performance metrics.
 */
export async function getGoogleAdsAds(
  config: GoogleAdsConfig,
  customerId: string,
  campaignId: string,
  startDate: string,
  endDate: string
): Promise<GoogleAdsAd[]> {
  const query = `
    SELECT
      ad_group_ad.ad.id,
      ad_group_ad.ad.name,
      ad_group_ad.ad.type,
      ad_group_ad.ad.final_urls,
      ad_group_ad.ad.responsive_search_ad.headlines,
      ad_group_ad.ad.responsive_search_ad.descriptions,
      ad_group_ad.status,
      ad_group.id,
      ad_group.name,
      campaign.id,
      campaign.name,
      metrics.cost_micros,
      metrics.impressions,
      metrics.clicks,
      metrics.conversions,
      metrics.conversions_value,
      metrics.ctr,
      metrics.average_cpc,
      metrics.cost_per_conversion
    FROM ad_group_ad
    WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
      AND campaign.id = ${campaignId}
      AND ad_group_ad.status != 'REMOVED'
    ORDER BY metrics.cost_micros DESC
  `;

  const rows = await executeGaql(config, customerId, query);

  return rows.map((row) => {
    const ad = row.adGroupAd?.ad ?? {};
    const adStatus = row.adGroupAd?.status ?? "ENABLED";
    const ag = row.adGroup;
    const c = row.campaign;
    const m = row.metrics;
    const spend = (m.costMicros ?? 0) / 1_000_000;
    const convValue = parseFloat(m.conversionsValue ?? "0");
    return {
      id: ad.id,
      name: ad.name || `Ad ${ad.id}`,
      adGroupId: ag.id,
      adGroupName: ag.name,
      campaignId: c.id,
      campaignName: c.name,
      status: adStatus,
      type: ad.type ?? "UNKNOWN",
      headlines: ad.responsiveSearchAd?.headlines?.map((h: any) => h.text) ?? [],
      descriptions: ad.responsiveSearchAd?.descriptions?.map((d: any) => d.text) ?? [],
      finalUrls: ad.finalUrls ?? [],
      spend,
      impressions: parseInt(m.impressions ?? "0"),
      clicks: parseInt(m.clicks ?? "0"),
      conversions: parseFloat(m.conversions ?? "0"),
      conversionValue: convValue,
      ctr: parseFloat(m.ctr ?? "0") * 100,
      cpc: (m.averageCpc ?? 0) / 1_000_000,
      costPerConversion: (m.costPerConversion ?? 0) / 1_000_000,
      roas: spend > 0 ? convValue / spend : 0,
    };
  });
}

/**
 * Get account-level summary metrics.
 */
export async function getGoogleAdsAccountSummary(
  config: GoogleAdsConfig,
  customerId: string,
  startDate: string,
  endDate: string
): Promise<{
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  conversionValue: number;
  ctr: number;
  cpc: number;
  roas: number;
  activeCampaigns: number;
}> {
  const query = `
    SELECT
      metrics.cost_micros,
      metrics.impressions,
      metrics.clicks,
      metrics.conversions,
      metrics.conversions_value,
      metrics.ctr,
      metrics.average_cpc
    FROM customer
    WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
  `;

  const rows = await executeGaql(config, customerId, query);

  let totalSpend = 0, totalImpressions = 0, totalClicks = 0;
  let totalConversions = 0, totalConvValue = 0;

  for (const row of rows) {
    const m = row.metrics;
    totalSpend += (m.costMicros ?? 0) / 1_000_000;
    totalImpressions += parseInt(m.impressions ?? "0");
    totalClicks += parseInt(m.clicks ?? "0");
    totalConversions += parseFloat(m.conversions ?? "0");
    totalConvValue += parseFloat(m.conversionsValue ?? "0");
  }

  // Count active campaigns
  const campQuery = `
    SELECT campaign.id FROM campaign
    WHERE campaign.status != 'REMOVED'
  `;
  const campRows = await executeGaql(config, customerId, campQuery);

  return {
    spend: totalSpend,
    impressions: totalImpressions,
    clicks: totalClicks,
    conversions: totalConversions,
    conversionValue: totalConvValue,
    ctr: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0,
    cpc: totalClicks > 0 ? totalSpend / totalClicks : 0,
    roas: totalSpend > 0 ? totalConvValue / totalSpend : 0,
    activeCampaigns: campRows.length,
  };
}

/**
 * "Configurado" = as credenciais do APP da agência existem (developer token,
 * client id, client secret). O refresh token NÃO entra aqui: ele é por conta de
 * cliente, obtido via OAuth e salvo criptografado no banco — não uma env global.
 *
 * Antes exigia GOOGLE_ADS_REFRESH_TOKEN global, o que forçava um único token
 * para todos os clientes (ruim) e travava a tela em "não configurado" mesmo com
 * o app pronto para conectar.
 */
export function isGoogleAdsConfigured(): boolean {
  return !!(
    process.env.GOOGLE_ADS_DEVELOPER_TOKEN &&
    process.env.GOOGLE_ADS_CLIENT_ID &&
    process.env.GOOGLE_ADS_CLIENT_SECRET
  );
}

/** Quais credenciais de app faltam — para a tela dizer exatamente o quê. */
export function googleAdsEnvFaltando(): string[] {
  const faltam: string[] = [];
  if (!process.env.GOOGLE_ADS_DEVELOPER_TOKEN) faltam.push("GOOGLE_ADS_DEVELOPER_TOKEN");
  if (!process.env.GOOGLE_ADS_CLIENT_ID) faltam.push("GOOGLE_ADS_CLIENT_ID");
  if (!process.env.GOOGLE_ADS_CLIENT_SECRET) faltam.push("GOOGLE_ADS_CLIENT_SECRET");
  return faltam;
}

/**
 * Config do app. O refreshToken aqui é só o fallback global legado (pode ser
 * vazio) — o token real vem por conta, injetado pelo router (accountConfig).
 */
export function getGoogleAdsConfig(): GoogleAdsConfig | null {
  if (!isGoogleAdsConfigured()) return null;
  return {
    developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN!,
    clientId: process.env.GOOGLE_ADS_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_ADS_CLIENT_SECRET!,
    refreshToken: process.env.GOOGLE_ADS_REFRESH_TOKEN ?? "",
    loginCustomerId: process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID,
  };
}

/**
 * Contas acessíveis pelo refresh token (do login do MCC). GET simples ao
 * listAccessibleCustomers. Precisa do developer token — se ele faltar, a
 * chamada falha e o fluxo cai no cadastro manual do customer ID.
 */
export async function listarContasAcessiveis(refreshToken: string): Promise<string[]> {
  const cfg = getGoogleAdsConfig();
  if (!cfg) throw new Error("Google Ads não configurado (faltam credenciais do app).");
  const accessToken = await getAccessToken({ ...cfg, refreshToken });
  // GOOGLE_ADS_BASE (não hardcoded): senão a versão diverge do resto do serviço.
  const resp = await fetch(`${GOOGLE_ADS_BASE}/customers:listAccessibleCustomers`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "developer-token": cfg.developerToken,
    },
  });
  if (!resp.ok) {
    // A causa muda conforme o status — dizer "confira o developer token" para
    // um 404 manda a pessoa procurar no lugar errado.
    if (resp.status === 404) {
      throw new Error(`a versão ${GOOGLE_ADS_API_VERSION} da API do Google Ads não existe mais (404). Atualize GOOGLE_ADS_API_VERSION.`);
    }
    if (resp.status === 401 || resp.status === 403) {
      const corpo = await resp.text().catch(() => "");
      const semToken = !cfg.developerToken;
      throw new Error(semToken
        ? "o developer token não está preenchido no Railway (GOOGLE_ADS_DEVELOPER_TOKEN)."
        : `o Google recusou o acesso (${resp.status}). Confira se o developer token é válido e se as contas estão sob o MCC. ${corpo.slice(0, 160)}`);
    }
    throw new Error(`listAccessibleCustomers falhou (${resp.status})`);
  }
  const json = (await resp.json()) as { resourceNames?: string[] };
  // "customers/1234567890" → "1234567890"
  return (json.resourceNames ?? []).map((r) => r.split("/").pop() ?? "").filter(Boolean);
}

/** Conta do MCC com o nome real que aparece no Google Ads. */
export type ContaMcc = {
  customerId: string;
  nome: string | null;
  gerenciadora: boolean;
  status: string | null;
  moeda: string | null;
  fusoHorario: string | null;
};

/**
 * Contas sob o MCC COM NOME. O listAccessibleCustomers só devolve IDs — daí as
 * contas apareciam como "Google Ads 8184107035" em vez de "Play by Scaffold".
 * O nome real está em customer_client.descriptive_name, que exige uma consulta
 * GAQL na conta gerenciadora.
 *
 * Só contas-filhas (level > 0) e não-gerenciadoras entram: o próprio MCC não é
 * uma conta de anúncios para vincular a cliente.
 */
export async function listarContasDoMcc(refreshToken: string): Promise<ContaMcc[]> {
  const cfg = getGoogleAdsConfig();
  if (!cfg) throw new Error("Google Ads não configurado (faltam credenciais do app).");

  // Sem MCC declarado, cai nas contas diretamente acessíveis pelo login.
  const mcc = cfg.loginCustomerId?.replace(/-/g, "");
  if (!mcc) {
    const ids = await listarContasAcessiveis(refreshToken);
    return ids.map((customerId) => ({ customerId, nome: null, gerenciadora: false, status: null, moeda: null, fusoHorario: null }));
  }

  const query = `
    SELECT
      customer_client.id,
      customer_client.descriptive_name,
      customer_client.manager,
      customer_client.status,
      customer_client.currency_code,
      customer_client.time_zone,
      customer_client.level
    FROM customer_client
    WHERE customer_client.status != 'CLOSED'
  `;
  const rows = await executeGaql({ ...cfg, refreshToken }, mcc, query);

  return rows
    .map((r) => r.customerClient ?? {})
    .filter((c) => String(c.id ?? "") !== mcc) // o próprio MCC não é conta de cliente
    .map((c) => ({
      customerId: String(c.id ?? ""),
      nome: c.descriptiveName ?? null,
      gerenciadora: !!c.manager,
      status: c.status ?? null,
      moeda: c.currencyCode ?? null,
      fusoHorario: c.timeZone ?? null,
    }))
    .filter((c) => c.customerId && !c.gerenciadora); // sub-MCCs não viram cliente
}

/** "8184107035" → "818-410-7035" (como o Google Ads mostra). */
export function formatarCustomerId(id: string): string {
  const n = (id ?? "").replace(/\D/g, "");
  return n.length === 10 ? `${n.slice(0, 3)}-${n.slice(3, 6)}-${n.slice(6)}` : id;
}
