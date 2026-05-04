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

// ─── Fallback config (used when env vars not available in production) ────────
const FALLBACK_GOOGLE_CLIENT_ID = "393310096196-9t1hvoredv2ta0jb1080ng14bs61ekir.apps.googleusercontent.com";
const FALLBACK_GOOGLE_CLIENT_SECRET = "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";

function getGoogleClientId(): string {
  return process.env.GOOGLE_ADS_CLIENT_ID || FALLBACK_GOOGLE_CLIENT_ID;
}

function getGoogleClientSecret(): string {
  return process.env.GOOGLE_ADS_CLIENT_SECRET || FALLBACK_GOOGLE_CLIENT_SECRET;
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
export async function getGA4Overview(
  config: GA4Config,
  propertyId: string,
  startDate: string,
  endDate: string
): Promise<GA4Overview> {
  const report = await runReport(config, propertyId, {
    dateRanges: [{ startDate, endDate }],
    metrics: [
      { name: "sessions" },
      { name: "totalUsers" },
      { name: "newUsers" },
      { name: "screenPageViews" },
      { name: "bounceRate" },
      { name: "averageSessionDuration" },
      { name: "engagementRate" },
      { name: "conversions" },
      { name: "eventCount" },
    ],
  });

  const row = report.rows?.[0];
  const vals = row?.metricValues ?? [];

  return {
    sessions: parseInt(vals[0]?.value ?? "0"),
    totalUsers: parseInt(vals[1]?.value ?? "0"),
    newUsers: parseInt(vals[2]?.value ?? "0"),
    pageviews: parseInt(vals[3]?.value ?? "0"),
    bounceRate: parseFloat(vals[4]?.value ?? "0") * 100,
    avgSessionDuration: parseFloat(vals[5]?.value ?? "0"),
    engagementRate: parseFloat(vals[6]?.value ?? "0") * 100,
    conversions: parseInt(vals[7]?.value ?? "0"),
    eventCount: parseInt(vals[8]?.value ?? "0"),
  };
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
      { name: "entrances" },
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
      entrances: parseInt(vals[4]?.value ?? "0"),
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
export async function getGA4Conversions(
  config: GA4Config,
  propertyId: string,
  startDate: string,
  endDate: string
): Promise<Array<{ eventName: string; conversions: number; totalUsers: number }>> {
  const report = await runReport(config, propertyId, {
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: "eventName" }],
    metrics: [{ name: "conversions" }, { name: "totalUsers" }],
    dimensionFilter: {
      filter: {
        fieldName: "eventName",
        stringFilter: {
          matchType: "EXACT",
          value: "purchase",
        },
      },
    },
    orderBys: [{ metric: { metricName: "conversions" }, desc: true }],
  });

  // If no purchase events, try getting all conversion events
  if (!report.rows?.length) {
    const allReport = await runReport(config, propertyId, {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: "eventName" }],
      metrics: [{ name: "eventCount" }, { name: "totalUsers" }],
      orderBys: [{ metric: { metricName: "eventCount" }, desc: true }],
      limit: 10,
    });

    return (allReport.rows ?? []).map((row: any) => ({
      eventName: row.dimensionValues[0]?.value ?? "unknown",
      conversions: parseInt(row.metricValues[0]?.value ?? "0"),
      totalUsers: parseInt(row.metricValues[1]?.value ?? "0"),
    }));
  }

  return (report.rows ?? []).map((row: any) => ({
    eventName: row.dimensionValues[0]?.value ?? "unknown",
    conversions: parseInt(row.metricValues[0]?.value ?? "0"),
    totalUsers: parseInt(row.metricValues[1]?.value ?? "0"),
  }));
}

/**
 * Check if GA4 is configured (OAuth credentials present).
 */
export function isGA4Configured(): boolean {
  return !!(getGoogleClientId() && getGoogleClientSecret());
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
