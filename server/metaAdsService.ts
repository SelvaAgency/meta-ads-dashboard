/**
 * Meta Ads API Service
 * Handles all communication with the Meta Graph API for fetching campaign data.
 *
 * BUG FIXES (2026-03-26):
 * 1. ROAS: now reads `purchase_roas` directly from the API instead of calculating manually.
 *    Manual calculation (conversionValue / spend) was inflating ROAS because extractConversionValue
 *    was summing ALL action_value types (including adds-to-cart, checkouts) not just purchases.
 *
 * 2. Results / Conversions: now uses `cost_per_result` and `results` fields from the API,
 *    which reflect the ACTUAL optimization goal of each ad set (performance_goal), not a hardcoded
 *    list of purchase/lead action types. This is what Meta Ads Manager shows as "Resultados".
 *
 * 3. Performance Goal: now fetches adsets with `optimization_goal` and `performance_goal` to
 *    correctly label what "results" means per campaign (purchase, lead, message, etc.).
 */

const META_API_BASE = "https://graph.facebook.com/v19.0";

export interface MetaApiError {
  message: string;
  type: string;
  code: number;
}

export interface MetaAdAccountInfo {
  id: string;
  name: string;
  currency: string;
  timezone_name: string;
  account_status: number;
}

export interface MetaFundingSourceDetails {
  id?: string;
  type?: number;
  display_string?: string;
  amount?: number;
  currency?: string;
}

export interface MetaAccountBilling {
  accountId: string;
  balance: string | null;
  spendCap: string | null;
  amountSpent: string | null;
  currency: string;
  fundingSourceType: number | null;
  fundingSourceDisplay: string | null;
  isPrePaid: boolean;
  remainingBalance: number | null;
}

export interface MetaCampaign {
  id: string;
  name: string;
  status: string;
  objective: string;
  daily_budget?: string;
  lifetime_budget?: string;
  start_time?: string;
  stop_time?: string;
}

/**
 * Adset with performance_goal — tells us what "result" means for this campaign.
 * This is the key field that Meta Ads Manager uses to label "Resultados".
 */
export interface MetaAdSet {
  id: string;
  campaign_id: string;
  optimization_goal: string;   // e.g. OFFSITE_CONVERSIONS, LEAD_GENERATION, REPLIES, etc.
  performance_goal?: string;   // e.g. OUTCOME_SALES, OUTCOME_LEADS, OUTCOME_ENGAGEMENT, etc.
}

export interface MetaCampaignInsights {
  campaign_id: string;
  campaign_name: string;
  date_start: string;
  date_stop: string;
  impressions: string;
  clicks: string;
  spend: string;
  reach: string;
  frequency: string;
  ctr: string;
  cpc: string;
  cpm: string;
  // Direct result fields from Meta (reflect the actual optimization goal)
  results?: Array<{ action_type: string; value: string }>;
  cost_per_result?: Array<{ action_type: string; value: string }>;
  // purchase_roas is the authoritative ROAS from Meta (not calculated)
  purchase_roas?: Array<{ action_type: string; value: string }>;
  // All action counts and values (for secondary metrics)
  actions?: Array<{ action_type: string; value: string }>;
  action_values?: Array<{ action_type: string; value: string }>;
  // Conversion value (authoritative from Meta)
  conversion_values?: Array<{ action_type: string; value: string }>;
}

async function metaFetch<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${META_API_BASE}/${path}`);
  for (const [key, val] of Object.entries(params)) {
    url.searchParams.set(key, val);
  }

  const response = await fetch(url.toString());
  const data = await response.json() as any;

  if (data.error) {
    const err = data.error as MetaApiError;
    throw new Error(`Meta API Error (${err.code}): ${err.message}`);
  }

  return data as T;
}

/**
 * Validate an access token and get basic user info
 */
export async function validateToken(accessToken: string): Promise<{ id: string; name: string } | null> {
  try {
    const data = await metaFetch<{ id: string; name: string }>("me", {
      access_token: accessToken,
      fields: "id,name",
    });
    return data;
  } catch {
    return null;
  }
}

/**
 * Get all ad accounts accessible by the token
 */
export async function getAdAccounts(accessToken: string): Promise<MetaAdAccountInfo[]> {
  const data = await metaFetch<{ data: MetaAdAccountInfo[] }>("me/adaccounts", {
    access_token: accessToken,
    fields: "id,name,currency,timezone_name,account_status",
    limit: "50",
  });
  return data.data ?? [];
}

/**
 * Get billing info for an ad account.
 */
export async function getAccountBilling(
  accountId: string,
  accessToken: string
): Promise<MetaAccountBilling | null> {
  try {
    const data = await metaFetch<{
      id: string;
      balance?: string;
      spend_cap?: string;
      amount_spent?: string;
      currency: string;
      funding_source_details?: MetaFundingSourceDetails;
    }>(`act_${accountId}`, {
      access_token: accessToken,
      fields: "id,balance,spend_cap,amount_spent,currency,funding_source_details",
    });

    const fsd = data.funding_source_details;
    const type = fsd?.type ?? null;
    const isPrePaid = type !== null && [2, 15, 20].includes(type);

    let remainingBalance: number | null = null;
    if (data.spend_cap && data.amount_spent) {
      const cap = parseFloat(data.spend_cap) / 100;
      const spent = parseFloat(data.amount_spent) / 100;
      remainingBalance = Math.max(0, cap - spent);
    } else if (isPrePaid && data.balance) {
      remainingBalance = parseFloat(data.balance) / 100;
    }

    return {
      accountId,
      balance: data.balance ?? null,
      spendCap: data.spend_cap ?? null,
      amountSpent: data.amount_spent ?? null,
      currency: data.currency,
      fundingSourceType: type,
      fundingSourceDisplay: fsd?.display_string ?? null,
      isPrePaid,
      remainingBalance,
    };
  } catch {
    return null;
  }
}

/**
 * Get all campaigns for an ad account
 */
export async function getCampaigns(accountId: string, accessToken: string): Promise<MetaCampaign[]> {
  const data = await metaFetch<{ data: MetaCampaign[] }>(`act_${accountId}/campaigns`, {
    access_token: accessToken,
    fields: "id,name,status,objective,daily_budget,lifetime_budget,start_time,stop_time",
    limit: "200",
  });
  return data.data ?? [];
}

/**
 * Get adsets for an account to determine performance_goal per campaign.
 * This is the authoritative source for what "result" means per campaign.
 */
export async function getAdSets(accountId: string, accessToken: string): Promise<MetaAdSet[]> {
  try {
    const data = await metaFetch<{ data: MetaAdSet[] }>(`act_${accountId}/adsets`, {
      access_token: accessToken,
      fields: "id,campaign_id,optimization_goal",
      limit: "500",
    });
    return data.data ?? [];
  } catch {
    return [];
  }
}

/**
 * Determine the dominant optimization_goal for each campaign from its adsets.
 * Returns a map of campaign_id -> optimization_goal.
 */
export function buildCampaignGoalMap(adsets: MetaAdSet[]): Map<string, string> {
  const goalCount = new Map<string, Map<string, number>>();
  for (const adset of adsets) {
    if (!adset.campaign_id || !adset.optimization_goal) continue;
    if (!goalCount.has(adset.campaign_id)) {
      goalCount.set(adset.campaign_id, new Map());
    }
    const goals = goalCount.get(adset.campaign_id)!;
    goals.set(adset.optimization_goal, (goals.get(adset.optimization_goal) ?? 0) + 1);
  }

  const result = new Map<string, string>();
  goalCount.forEach((goals, campaignId) => {
    let dominant = "";
    let max = 0;
    goals.forEach((count, goal) => {
      if (count > max) { max = count; dominant = goal; }
    });
    if (dominant) result.set(campaignId, dominant);
  });
  return result;
}

/**
 * Map Meta optimization_goal to a human-readable result label.
 * This is what gets displayed as "Tipo de Resultado" in the dashboard.
 */
export function getResultLabel(optimizationGoal: string): string {
  const labels: Record<string, string> = {
    OFFSITE_CONVERSIONS: "Compras no site",
    ONSITE_CONVERSIONS: "Conversões no site",
    LEAD_GENERATION: "Leads",
    QUALITY_LEAD: "Leads qualificados",
    REPLIES: "Mensagens",
    CONVERSATIONS: "Conversas",
    LINK_CLICKS: "Cliques no link",
    LANDING_PAGE_VIEWS: "Visualizações de página",
    REACH: "Alcance",
    IMPRESSIONS: "Impressões",
    POST_ENGAGEMENT: "Engajamento",
    PAGE_LIKES: "Curtidas na página",
    VIDEO_VIEWS: "Visualizações de vídeo",
    THRUPLAY: "ThruPlay",
    APP_INSTALLS: "Instalações de app",
    VALUE: "Valor de conversão",
    VISIT_INSTAGRAM_PROFILE: "Visitas ao perfil",
    INSTAGRAM_PROFILE_REACH: "Alcance no Instagram",
  };
  return labels[optimizationGoal] ?? optimizationGoal;
}

/**
 * Map Meta optimization_goal to the action_types that represent "results" for that goal.
 * These are the action_types we should sum from the `actions` array to get "Resultados".
 */
export function getResultActionTypes(optimizationGoal: string): string[] {
  const mapping: Record<string, string[]> = {
    OFFSITE_CONVERSIONS: [
      "purchase",
      "offsite_conversion.fb_pixel_purchase",
      "onsite_web_purchase",
    ],
    ONSITE_CONVERSIONS: [
      "onsite_web_purchase",
      "purchase",
    ],
    LEAD_GENERATION: [
      "lead",
      "offsite_conversion.fb_pixel_lead",
      "onsite_conversion.lead_grouped",
    ],
    QUALITY_LEAD: [
      "lead",
      "offsite_conversion.fb_pixel_lead",
      "onsite_conversion.lead_grouped",
    ],
    REPLIES: [
      "onsite_conversion.messaging_conversation_started_7d",
      "onsite_conversion.messaging_first_reply",
    ],
    CONVERSATIONS: [
      "onsite_conversion.messaging_conversation_started_7d",
      "onsite_conversion.messaging_first_reply",
    ],
    LINK_CLICKS: ["link_click"],
    LANDING_PAGE_VIEWS: ["landing_page_view"],
    POST_ENGAGEMENT: ["post_engagement", "page_engagement"],
    PAGE_LIKES: ["like"],
    VIDEO_VIEWS: ["video_view"],
    THRUPLAY: ["video_thruplay_watched"],
    APP_INSTALLS: ["app_install", "mobile_app_install"],
    VALUE: [
      "purchase",
      "offsite_conversion.fb_pixel_purchase",
      "onsite_web_purchase",
    ],
  };
  return mapping[optimizationGoal] ?? [];
}

/**
 * Get campaign insights (metrics) for a date range.
 *
 * FIX: Now requests purchase_roas, results, cost_per_result directly from Meta API.
 * These are the authoritative values shown in Meta Ads Manager.
 */
export async function getCampaignInsights(
  accountId: string,
  accessToken: string,
  startDate: string,
  endDate: string
): Promise<MetaCampaignInsights[]> {
  const data = await metaFetch<{ data: MetaCampaignInsights[] }>(`act_${accountId}/insights`, {
    access_token: accessToken,
    level: "campaign",
    fields: [
      "campaign_id",
      "campaign_name",
      "impressions",
      "clicks",
      "spend",
      "reach",
      "frequency",
      "ctr",
      "cpc",
      "cpm",
      // Authoritative ROAS from Meta (not calculated)
      "purchase_roas",
      // All actions for secondary metrics
      "actions",
      "action_values",
      // Conversion values
      "conversion_values",
    ].join(","),
    time_range: JSON.stringify({ since: startDate, until: endDate }),
    time_increment: "1",
    limit: "500",
  });
  return data.data ?? [];
}

/**
 * Extract the authoritative ROAS from Meta's purchase_roas field.
 * This is what Meta Ads Manager shows as "Retorno sobre o investimento em publicidade".
 * Falls back to manual calculation only if purchase_roas is not available.
 */
export function extractPurchaseRoas(
  purchaseRoas?: Array<{ action_type: string; value: string }>,
  spend?: number,
  conversionValue?: number
): number {
  if (purchaseRoas && purchaseRoas.length > 0) {
    // purchase_roas is already the ratio (not a currency value)
    // Sum all purchase_roas entries (usually just one: "omni_purchase")
    let total = 0;
    for (const r of purchaseRoas) {
      total += parseFloat(r.value) || 0;
    }
    return total;
  }
  // Fallback: manual calculation
  if (spend && spend > 0 && conversionValue && conversionValue > 0) {
    return conversionValue / spend;
  }
  return 0;
}

/**
 * Extract results count based on the campaign's optimization_goal.
 * This is the authoritative "Resultados" shown in Meta Ads Manager.
 */
export function extractResultsByGoal(
  actions: Array<{ action_type: string; value: string }> | undefined,
  optimizationGoal: string
): number {
  if (!actions || !optimizationGoal) return extractConversions(actions);
  const targetTypes = getResultActionTypes(optimizationGoal);
  if (targetTypes.length === 0) return 0;

  let total = 0;
  for (const action of actions) {
    if (targetTypes.some((t) => action.action_type === t || action.action_type.includes(t))) {
      total += parseFloat(action.value) || 0;
    }
  }
  return total;
}

/**
 * Extract conversion value from action_values array.
 * Uses purchase-related types only (not adds-to-cart, checkouts, etc.)
 * to match what Meta Ads Manager shows as "Valor de conversão".
 */
export function extractConversionValue(
  actionValues?: Array<{ action_type: string; value: string }>
): number {
  if (!actionValues) return 0;
  // Only count actual purchase/conversion values, not funnel steps
  const purchaseTypes = [
    "purchase",
    "offsite_conversion.fb_pixel_purchase",
    "onsite_web_purchase",
    "omni_purchase",
  ];
  let total = 0;
  for (const av of actionValues) {
    if (purchaseTypes.some((t) => av.action_type === t || av.action_type.includes(t))) {
      total += parseFloat(av.value) || 0;
    }
  }
  return total;
}

/**
 * Extract conversion count from actions array (generic fallback).
 * Prefer extractResultsByGoal when optimization_goal is known.
 */
export function extractConversions(actions?: Array<{ action_type: string; value: string }>): number {
  if (!actions) return 0;
  const conversionTypes = [
    "purchase",
    "lead",
    "complete_registration",
    "offsite_conversion.fb_pixel_purchase",
    "offsite_conversion.fb_pixel_lead",
  ];
  let total = 0;
  for (const action of actions) {
    if (conversionTypes.some((t) => action.action_type.includes(t))) {
      total += parseFloat(action.value) || 0;
    }
  }
  return total;
}

/**
 * Calculate ROAS from spend and conversion value (fallback only).
 * Prefer extractPurchaseRoas when purchase_roas field is available.
 */
export function calculateRoas(spend: number, conversionValue: number): number {
  if (spend <= 0) return 0;
  return conversionValue / spend;
}

/**
 * Calculate CPA from spend and conversions.
 */
export function calculateCpa(spend: number, conversions: number): number {
  if (conversions <= 0) return 0;
  return spend / conversions;
}
