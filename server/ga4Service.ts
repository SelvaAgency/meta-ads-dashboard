/**
 * Google Analytics 4 (GA4) Data API Service
 *
 * Integrates with GA4 Data API v1beta to fetch website analytics:
 * sessions, users, pageviews, conversions, traffic sources, etc.
 *
 * Uses same OAuth2 credentials as Google Ads (shared Google Cloud project).
 *
 * Required ENV vars:
 *   GOOGLE_ADS_CLIENT_ID       - OAuth2 client ID (shared)
 *   GOOGLE_ADS_CLIENT_SECRET   - OAuth2 client secret (shared)
 *   (per-account refresh tokens stored in DB)
 */

const GA4_BASE = "https://analyticsdata.googleapis.com/v1beta";
const GA4_ADMIN_BASE = "https://analyticsadmin.googleapis.com/v1beta";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

// ─────────────────────────────────────────────────────────────────────────────
//  INCIDENTE — credencial exposta (2026-07-16)
// ─────────────────────────────────────────────────────────────────────────────
//  Aqui existiam FALLBACK_GOOGLE_CLIENT_ID e FALLBACK_GOOGLE_CLIENT_SECRET com
//  as credenciais reais do app Google, hardcoded e commitadas — a MESMA dupla
//  que estava em googleOAuthCallback.ts. O repositório é público: considere o
//  secret comprometido. Apagar daqui não o revoga; só a rotação no Google Cloud
//  Console resolve.
//
//  As credenciais agora vêm só do ambiente, e falta de env falha alto. O
//  fallback silencioso é justamente o que manteve esse segredo vivo no código
//  sem ninguém notar — e o que faria a rotação parecer não ter efeito.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Duas responsabilidades separadas de propósito:
 *  · temCredenciaisGoogle() — PERGUNTA. Devolve boolean, nunca lança. É o que
 *    isGA4Configured() usa; um "está configurado?" que explode não responde
 *    nada, e ainda derruba quem só queria mostrar a tela de "não configurado".
 *  · credencialGoogle()     — EXIGE. Lança quando a credencial vai ser usada
 *    de verdade, com a mensagem dizendo o que configurar.
 */
function temCredenciaisGoogle(): boolean {
  return !!(process.env.GOOGLE_ADS_CLIENT_ID && process.env.GOOGLE_ADS_CLIENT_SECRET);
}

function credencialGoogle(nome: "GOOGLE_ADS_CLIENT_ID" | "GOOGLE_ADS_CLIENT_SECRET"): string {
  const v = process.env[nome];
  if (!v) throw new Error(`${nome} não configurada. Defina no ambiente (Railway) para usar o GA4.`);
  return v;
}

function getGoogleClientId(): string {
  return credencialGoogle("GOOGLE_ADS_CLIENT_ID");
}

function getGoogleClientSecret(): string {
  return credencialGoogle("GOOGLE_ADS_CLIENT_SECRET");
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface GA4Config {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

export interface GA4Property {
  propertyId: string;
  displayName: string;
  timeZone: string;
  currencyCode: string;
  websiteUrl?: string;
}

export interface GA4Overview {
  sessions: number;
  totalUsers: number;
  newUsers: number;
  pageviews: number;
  bounceRate: number;
  avgSessionDuration: number;
  engagementRate: number;
  conversions: number;
  eventCount: number;
}

export interface GA4TrafficSource {
  source: string;
  medium: string;
  sessions: number;
  users: number;
  conversions: number;
  bounceRate: number;
  avgSessionDuration: number;
}

export interface GA4PageMetric {
  pagePath: string;
  pageTitle: string;
  pageviews: number;
  uniquePageviews: number;
  avgTimeOnPage: number;
  bounceRate: number;
  entrances: number;
  exits: number;
}

export interface GA4DailyMetric {
  date: string;
  sessions: number;
  users: number;
  pageviews: number;
  conversions: number;
  bounceRate: number;
}

export interface GA4DeviceBreakdown {
  deviceCategory: string;
  sessions: number;
  users: number;
  percentage: number;
}

export interface GA4GeoMetric {
  country: string;
  city: string;
  sessions: number;
  users: number;
  conversions: number;
}

// ─── Token Management ────────────────────────────────────────────────────────

const tokenCache = new Map<string, { token: string; expiresAt: number }>();

async function getAccessToken(config: GA4Config): Promise<string> {
  const cacheKey = config.refreshToken.substring(0, 20);
  const cached = tokenCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt - 60_000) {
    return cached.token;
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
    console.error("[GA4] Token refresh failed:", err);
    throw new Error(`GA4 token refresh failed: ${resp.status}`);
  }

  const data = (await resp.json()) as { access_token: string; expires_in: number };
  tokenCache.set(cacheKey, {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  });
  return data.access_token;
}

// ─── GA4 Data API Executor ───────────────────────────────────────────────────

async function runReport(
  config: GA4Config,
  propertyId: string,
  body: Record<string, any>
): Promise<any> {
  const accessToken = await getAccessToken(config);
  const cleanId = propertyId.replace(/^properties\//, "");
  const url = `${GA4_BASE}/properties/${cleanId}:runReport`;

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errBody = await resp.text();
    console.error(`[GA4] runReport failed (${resp.status}):`, errBody);
    throw new Error(`GA4 API error ${resp.status}: ${errBody.substring(0, 300)}`);
  }

  return resp.json();
}

// ─── Admin API — List Properties ─────────────────────────────────────────────

export async function listGA4Properties(config: GA4Config): Promise<GA4Property[]> {
  const accessToken = await getAccessToken(config);

  // List account summaries to find all properties
  const url = `${GA4_ADMIN_BASE}/accountSummaries?pageSize=100`;
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!resp.ok) {
    const errBody = await resp.text();
    console.error(`[GA4] listAccountSummaries failed:`, errBody);
    throw new Error(`GA4 Admin API error ${resp.status}`);
  }

  const data = (await resp.json()) as {
    accountSummaries?: Array<{
      account: string;
      displayName: string;
      propertySummaries?: Array<{
        property: string;
        displayName: string;
      }>;
    }>;
  };

  const properties: GA4Property[] = [];
  for (const account of data.accountSummaries ?? []) {
    for (const prop of account.propertySummaries ?? []) {
      const propertyId = prop.property.replace("properties/", "");
      properties.push({
        propertyId,
        displayName: prop.displayName,
        timeZone: "America/Sao_Paulo",
        currencyCode: "BRL",
      });
    }
  }

  return properties;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Get overview metrics for a date range.
 */
/**
 * Resumo do período.
 *
 * `conversions` é OPCIONAL de propósito: o Google descontinuou essa métrica em
 * favor de `keyEvents`, e propriedades novas a recusam. Pedi-la junto do resto
 * fazia a chamada inteira falhar — perdendo sessões, usuários e tudo mais por
 * causa de um número. Aqui ela vai numa segunda chamada, e o snapshot sai
 * completo mesmo quando ela não existe.
 */
export async function getGA4Overview(
  config: GA4Config,
  propertyId: string,
  startDate: string,
  endDate: string,
  /**
   * Período anterior para comparação. A Data API aceita dois dateRanges na
   * MESMA chamada — comparar não custa requisição extra. Sem ele, ou se a API
   * devolver só uma linha, `anterior` vem null e a tela segue sem variação.
   */
  anterior?: { startDate: string; endDate: string },
): Promise<GA4Overview & { engagedSessions: number; conversoesIndisponiveis?: string; anterior: GA4Overview & { engagedSessions: number } | null }> {
  const report = await runReport(config, propertyId, {
    dateRanges: anterior
      ? [{ startDate, endDate }, { startDate: anterior.startDate, endDate: anterior.endDate }]
      : [{ startDate, endDate }],
    metrics: [
      { name: "sessions" },
      { name: "totalUsers" },
      { name: "newUsers" },
      { name: "screenPageViews" },
      { name: "bounceRate" },
      { name: "averageSessionDuration" },
      { name: "engagementRate" },
      { name: "eventCount" },
      { name: "engagedSessions" },
    ],
  });

  // Com dois dateRanges a API devolve uma linha por período, na ordem pedida.
  const linha = (i: number) => {
    const v = report.rows?.[i]?.metricValues;
    if (!v) return null;
    return {
      sessions: parseInt(v[0]?.value ?? "0"),
      totalUsers: parseInt(v[1]?.value ?? "0"),
      newUsers: parseInt(v[2]?.value ?? "0"),
      pageviews: parseInt(v[3]?.value ?? "0"),
      bounceRate: parseFloat(v[4]?.value ?? "0") * 100,
      avgSessionDuration: parseFloat(v[5]?.value ?? "0"),
      engagementRate: parseFloat(v[6]?.value ?? "0") * 100,
      eventCount: parseInt(v[7]?.value ?? "0"),
      engagedSessions: parseInt(v[8]?.value ?? "0"),
      conversions: 0,
    };
  };
  const base = linha(0) ?? {
    sessions: 0, totalUsers: 0, newUsers: 0, pageviews: 0, bounceRate: 0,
    avgSessionDuration: 0, engagementRate: 0, eventCount: 0, engagedSessions: 0, conversions: 0,
  };
  const anteriorLido = anterior ? linha(1) : null;

  // keyEvents é o nome novo; conversions, o antigo. Tenta os dois e desiste em
  // silêncio — sem conversão o snapshot ainda vale.
  for (const nome of ["keyEvents", "conversions"]) {
    try {
      const r = await runReport(config, propertyId, { dateRanges: [{ startDate, endDate }], metrics: [{ name: nome }] });
      return { ...base, conversions: parseInt(r.rows?.[0]?.metricValues?.[0]?.value ?? "0"), anterior: anteriorLido };
    } catch { /* tenta o próximo */ }
  }
  return { ...base, conversions: 0, anterior: anteriorLido, conversoesIndisponiveis: "A propriedade não expõe keyEvents nem conversions." };
}

/** Canais de aquisição (Organic Search, Paid Social…). */
export async function getGA4Channels(
  config: GA4Config, propertyId: string, startDate: string, endDate: string, limit = 10,
): Promise<{ nome: string; sessions: number }[]> {
  const r = await runReport(config, propertyId, {
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: "sessionDefaultChannelGroup" }],
    metrics: [{ name: "sessions" }],
    orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
    limit,
  });
  return (r.rows ?? []).map((row: any) => ({
    nome: row.dimensionValues?.[0]?.value ?? "(não definido)",
    sessions: parseInt(row.metricValues?.[0]?.value ?? "0"),
  }));
}

/** Landing pages — por onde as pessoas entram no site. */
export async function getGA4LandingPages(
  config: GA4Config, propertyId: string, startDate: string, endDate: string, limit = 10,
): Promise<{ url: string; sessions: number }[]> {
  const r = await runReport(config, propertyId, {
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: "landingPage" }],
    metrics: [{ name: "sessions" }],
    orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
    limit,
  });
  return (r.rows ?? []).map((row: any) => ({
    url: row.dimensionValues?.[0]?.value ?? "(não definido)",
    sessions: parseInt(row.metricValues?.[0]?.value ?? "0"),
  }));
}

/**
 * ─── E-commerce (F5-A) — GA4 como FONTE INICIAL ─────────────────────────────
 * Não é fonte contábil: o GA4 perde compra por adblock, consentimento e
 * atribuição. Quando a plataforma da loja estiver conectada, ela vira a fonte
 * primária — estes números ficam como indício e funil.
 */

/**
 * Totais de receita. Cascata de nomes porque a Data API renomeia métricas:
 * `transactions` → `ecommercePurchases` → null (indisponível). Nenhuma recusa
 * pode derrubar o sync — quem chama trata null.
 */
export async function getGA4EcommerceTotais(
  config: GA4Config, propertyId: string, startDate: string, endDate: string,
): Promise<{ receita: number; transacoes: number } | null> {
  for (const metricaTransacao of ["transactions", "ecommercePurchases"]) {
    try {
      const r = await runReport(config, propertyId, {
        dateRanges: [{ startDate, endDate }],
        metrics: [{ name: "purchaseRevenue" }, { name: metricaTransacao }],
      });
      const v = r.rows?.[0]?.metricValues ?? [];
      return {
        receita: parseFloat(v[0]?.value ?? "0"),
        transacoes: parseInt(v[1]?.value ?? "0"),
      };
    } catch { /* tenta o próximo nome */ }
  }
  return null;
}

/**
 * Funil de compra: add_to_cart → begin_checkout → purchase, numa chamada só.
 * Substitui o antigo ga4TemEcommerce — "tem compra?" agora deriva de
 * purchases > 0, com uma chamada a menos.
 */
export async function getGA4Funil(
  config: GA4Config, propertyId: string, startDate: string, endDate: string,
): Promise<{ addToCart: number; beginCheckout: number; purchases: number } | null> {
  try {
    const r = await runReport(config, propertyId, {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: "eventName" }],
      metrics: [{ name: "eventCount" }],
      dimensionFilter: {
        filter: { fieldName: "eventName", inListFilter: { values: ["add_to_cart", "begin_checkout", "purchase"] } },
      },
    });
    const contagem = new Map<string, number>(
      (r.rows ?? []).map((row: any) => [row.dimensionValues?.[0]?.value ?? "", parseInt(row.metricValues?.[0]?.value ?? "0")]),
    );
    return {
      addToCart: contagem.get("add_to_cart") ?? 0,
      beginCheckout: contagem.get("begin_checkout") ?? 0,
      purchases: contagem.get("purchase") ?? 0,
    };
  } catch {
    return null;
  }
}

/** Canais das compras. Só é chamada quando o funil achou purchase > 0. */
export async function getGA4OrigemCompras(
  config: GA4Config, propertyId: string, startDate: string, endDate: string, limit = 8,
): Promise<{ nome: string; compras: number }[]> {
  const r = await runReport(config, propertyId, {
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: "sessionDefaultChannelGroup" }],
    metrics: [{ name: "eventCount" }],
    dimensionFilter: { filter: { fieldName: "eventName", stringFilter: { matchType: "EXACT", value: "purchase" } } },
    orderBys: [{ metric: { metricName: "eventCount" }, desc: true }],
    limit,
  });
  return (r.rows ?? []).map((row: any) => ({
    nome: row.dimensionValues?.[0]?.value ?? "(não definido)",
    compras: parseInt(row.metricValues?.[0]?.value ?? "0"),
  }));
}

/**
 * Get daily metrics over a date range.
 */
export async function getGA4DailyMetrics(
  config: GA4Config,
  propertyId: string,
  startDate: string,
  endDate: string
): Promise<GA4DailyMetric[]> {
  const report = await runReport(config, propertyId, {
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: "date" }],
    metrics: [
      { name: "sessions" },
      { name: "totalUsers" },
      { name: "screenPageViews" },
      { name: "conversions" },
      { name: "bounceRate" },
    ],
    orderBys: [{ dimension: { dimensionName: "date" } }],
  });

  return (report.rows ?? []).map((row: any) => {
    const dateStr = row.dimensionValues[0].value; // YYYYMMDD
    const vals = row.metricValues;
    return {
      date: `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`,
      sessions: parseInt(vals[0]?.value ?? "0"),
      users: parseInt(vals[1]?.value ?? "0"),
      pageviews: parseInt(vals[2]?.value ?? "0"),
      conversions: parseInt(vals[3]?.value ?? "0"),
      bounceRate: parseFloat(vals[4]?.value ?? "0") * 100,
    };
  });
}

/**
 * Get traffic sources breakdown.
 */
export async function getGA4TrafficSources(
  config: GA4Config,
  propertyId: string,
  startDate: string,
  endDate: string,
  limit = 20
): Promise<GA4TrafficSource[]> {
  const report = await runReport(config, propertyId, {
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: "sessionSource" }, { name: "sessionMedium" }],
    metrics: [
      { name: "sessions" },
      { name: "totalUsers" },
      { name: "conversions" },
      { name: "bounceRate" },
      { name: "averageSessionDuration" },
    ],
    orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
    limit,
  });

  return (report.rows ?? []).map((row: any) => {
    const dims = row.dimensionValues;
    const vals = row.metricValues;
    return {
      source: dims[0]?.value ?? "(direct)",
      medium: dims[1]?.value ?? "(none)",
      sessions: parseInt(vals[0]?.value ?? "0"),
      users: parseInt(vals[1]?.value ?? "0"),
      conversions: parseInt(vals[2]?.value ?? "0"),
      bounceRate: parseFloat(vals[3]?.value ?? "0") * 100,
      avgSessionDuration: parseFloat(vals[4]?.value ?? "0"),
    };
  });
}

/**
 * Get top pages by pageviews.
 */
export async function getGA4TopPages(
  config: GA4Config,
  propertyId: string,
  startDate: string,
  endDate: string,
  limit = 20
): Promise<GA4PageMetric[]> {
  const report = await runReport(config, propertyId, {
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: "pagePath" }, { name: "pageTitle" }],
    metrics: [
      { name: "screenPageViews" },
      { name: "sessions" },
      { name: "averageSessionDuration" },
      { name: "bounceRate" },
      // `entrances` NÃO existe na Data API do GA4 — pedi-la fazia a chamada
      // inteira falhar com INVALID_ARGUMENT, e o .catch de quem chamava
      // transformava isso numa lista vazia sem explicação.
    ],
    orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
    limit,
  });

  return (report.rows ?? []).map((row: any) => {
    const dims = row.dimensionValues;
    const vals = row.metricValues;
    return {
      pagePath: dims[0]?.value ?? "/",
      pageTitle: dims[1]?.value ?? "Untitled",
      pageviews: parseInt(vals[0]?.value ?? "0"),
      uniquePageviews: parseInt(vals[1]?.value ?? "0"),
      avgTimeOnPage: parseFloat(vals[2]?.value ?? "0"),
      bounceRate: parseFloat(vals[3]?.value ?? "0") * 100,
      entrances: 0,   // a API não expõe; melhor zero declarado que número falso
      exits: 0,
    };
  });
}

/**
 * Get device category breakdown.
 */
export async function getGA4DeviceBreakdown(
  config: GA4Config,
  propertyId: string,
  startDate: string,
  endDate: string
): Promise<GA4DeviceBreakdown[]> {
  const report = await runReport(config, propertyId, {
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: "deviceCategory" }],
    metrics: [{ name: "sessions" }, { name: "totalUsers" }],
    orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
  });

  const rows = (report.rows ?? []).map((row: any) => ({
    deviceCategory: row.dimensionValues[0]?.value ?? "unknown",
    sessions: parseInt(row.metricValues[0]?.value ?? "0"),
    users: parseInt(row.metricValues[1]?.value ?? "0"),
    percentage: 0,
  }));

  const totalSessions = rows.reduce((sum: number, r: any) => sum + r.sessions, 0);
  for (const row of rows) {
    row.percentage = totalSessions > 0 ? (row.sessions / totalSessions) * 100 : 0;
  }

  return rows;
}

/**
 * Get geographic breakdown (country + city).
 */
export async function getGA4GeoBreakdown(
  config: GA4Config,
  propertyId: string,
  startDate: string,
  endDate: string,
  limit = 15
): Promise<GA4GeoMetric[]> {
  const report = await runReport(config, propertyId, {
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: "country" }, { name: "city" }],
    metrics: [
      { name: "sessions" },
      { name: "totalUsers" },
      { name: "conversions" },
    ],
    orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
    limit,
  });

  return (report.rows ?? []).map((row: any) => {
    const dims = row.dimensionValues;
    const vals = row.metricValues;
    return {
      country: dims[0]?.value ?? "Unknown",
      city: dims[1]?.value ?? "Unknown",
      sessions: parseInt(vals[0]?.value ?? "0"),
      users: parseInt(vals[1]?.value ?? "0"),
      conversions: parseInt(vals[2]?.value ?? "0"),
    };
  });
}

/**
 * Get conversion events breakdown.
 */
/**
 * Eventos principais da propriedade, por frequência.
 *
 * Antes filtrava EXATAMENTE "purchase" e só caía nos demais quando não havia
 * compra nenhuma — então numa loja o resultado era sempre uma linha só. Para
 * "eventos principais" o que interessa é o topo real, compra incluída.
 */
export async function getGA4Conversions(
  config: GA4Config,
  propertyId: string,
  startDate: string,
  endDate: string
): Promise<Array<{ eventName: string; conversions: number; totalUsers: number }>> {
  const report = await runReport(config, propertyId, {
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: "eventName" }],
    metrics: [{ name: "eventCount" }, { name: "totalUsers" }],
    orderBys: [{ metric: { metricName: "eventCount" }, desc: true }],
    limit: 10,
  });
  return (report.rows ?? []).map((row: any) => ({
    eventName: row.dimensionValues?.[0]?.value ?? "(sem nome)",
    conversions: parseInt(row.metricValues?.[0]?.value ?? "0"),
    totalUsers: parseInt(row.metricValues?.[1]?.value ?? "0"),
  }));
}

/**
 * Check if GA4 is configured (OAuth credentials present).
 */
export function isGA4Configured(): boolean {
  return temCredenciaisGoogle();
}

/**
 * Get GA4 config from env vars (uses same OAuth client as Google Ads).
 */
export function getGA4Config(refreshToken: string): GA4Config {
  return {
    clientId: getGoogleClientId(),
    clientSecret: getGoogleClientSecret(),
    refreshToken,
  };
}
