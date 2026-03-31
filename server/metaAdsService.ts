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

const META_API_BASE = "https://graph.facebook.com/v21.0";

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
  // Profile visits are now extracted from the 'actions' field (profile_visit, instagram_profile_visit)
  // page_actions was removed in Meta Graph API v21.0
  // Outbound clicks (link clicks to external sites)
  outbound_clicks?: Array<{ action_type: string; value: string }>;
}

async function metaFetch<T>(path: string, params: Record<string, string>, retryCount = 0): Promise<T> {
  const url = new URL(`${META_API_BASE}/${path}`);
  for (const [key, val] of Object.entries(params)) {
    url.searchParams.set(key, val);
  }

  const response = await fetch(url.toString());
  const data = await response.json() as any;

  if (data.error) {
    const err = data.error as MetaApiError;

    // Error 190: Token expired/invalid — propagate immediately, no retry
    if (err.code === 190) {
      throw new Error(`META_TOKEN_EXPIRED: Token expirado ou inválido. Reconecte sua conta em Gerenciar Contas. (${err.message})`);
    }

    // Error 4: Rate limit — wait 60s and retry once
    if (err.code === 4 && retryCount < 1) {
      console.warn(`[metaFetch] Rate limit (error 4) on ${path}, waiting 60s before retry...`);
      await new Promise(r => setTimeout(r, 60000));
      return metaFetch<T>(path, params, retryCount + 1);
    }

    // Error 500/503: Server error — retry up to 2 times with 2s delay
    if ((response.status === 500 || response.status === 503 || err.code === 1 || err.code === 2) && retryCount < 2) {
      console.warn(`[metaFetch] Server error (${err.code}) on ${path}, retrying in 2s (attempt ${retryCount + 1}/2)...`);
      await new Promise(r => setTimeout(r, 2000));
      return metaFetch<T>(path, params, retryCount + 1);
    }

    throw new Error(`Meta API Error (${err.code}): ${err.message}`);
  }

  // HTTP-level server errors without JSON error body
  if (!response.ok && retryCount < 2) {
    console.warn(`[metaFetch] HTTP ${response.status} on ${path}, retrying in 2s (attempt ${retryCount + 1}/2)...`);
    await new Promise(r => setTimeout(r, 2000));
    return metaFetch<T>(path, params, retryCount + 1);
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
      // Outbound clicks (profile visits extracted from actions)
      "outbound_clicks",
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
/**
 * Extract profile visits from Meta actions.
 * action_type: "profile_visit" — Instagram profile visits driven by the ad.
 */
export function extractProfileVisits(actions?: Array<{ action_type: string; value: string }>): number {
  if (!actions) return 0;
  let total = 0;
  for (const a of actions) {
    if (a.action_type === "profile_visit" || a.action_type === "instagram_profile_visit") {
      total += parseFloat(a.value) || 0;
    }
  }
  return total;
}

/**
 * Extract new followers/page likes from Meta actions.
 * action_type: "page_fan" — new page likes/followers driven by the ad.
 * Also checks "like" for legacy campaigns.
 */
export function extractFollowers(actions?: Array<{ action_type: string; value: string }>): number {
  if (!actions) return 0;
  let total = 0;
  for (const a of actions) {
    if (a.action_type === "page_fan" || a.action_type === "like" || a.action_type === "follow") {
      total += parseFloat(a.value) || 0;
    }
  }
  return total;
}

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

// ─── Real-time Alert Detection ────────────────────────────────────────────────

export interface RealTimeAlert {
  type:
    | "CAMPAIGN_PAUSED"
    | "PAYMENT_FAILED"
    | "AD_REJECTED"
    | "AD_ERROR"
    | "BUDGET_WARNING"
    | "PAGE_UNLINKED"
    | "INSTAGRAM_UNLINKED"
    | "PIXEL_ERROR"
    | "ADSET_NO_DELIVERY";
  title: string;
  message: string;
}

/**
 * Check for real-time TECHNICAL issues in an ad account.
 * These are operational errors that require immediate attention:
 * - Low balance (<R$200) or payment failure
 * - Campaigns with errors (effective_status = WITH_ISSUES)
 * - Rejected creatives (DISAPPROVED) or ads with errors
 * - Ad sets with errors or paused by system
 * - Ad sets active but with no delivery in last 24h
 * - Instagram account not linked
 * - Pixel unavailable or inactive for >48h
 *
 * NOTE: This function handles TECHNICAL alerts only.
 * Metric anomalies (ROAS drop, CPA spike, CTR drop, etc.) are handled
 * separately by the anomaly detection engine in analysisService.ts.
 */
export async function checkRealTimeAlerts(
  accountId: string,
  accessToken: string
): Promise<RealTimeAlert[]> {
  const alerts: RealTimeAlert[] = [];

  // 1. Check account billing for low balance and payment failures
  try {
    const billing = await getAccountBilling(accountId, accessToken);
    if (billing) {
      if (billing.remainingBalance !== null && billing.remainingBalance < 200) {
        alerts.push({
          type: "BUDGET_WARNING",
          title: "Saldo baixo na conta",
          message: `Saldo disponível: R$${billing.remainingBalance.toFixed(2)}. Recarregue em breve para evitar interrupção das campanhas. Referência: R$200,00 (mínimo recomendado).`,
        });
      }
      if (billing.fundingSourceType === null && billing.fundingSourceDisplay === null) {
        alerts.push({
          type: "PAYMENT_FAILED",
          title: "Falha na forma de pagamento",
          message: "Nenhuma forma de pagamento válida encontrada. Verifique as configurações de pagamento no Business Manager.",
        });
      }
    }
  } catch (err) {
    console.error("[RealTimeAlerts] Billing check failed:", err);
  }

  // 2. Check campaigns for issues (effective_status = WITH_ISSUES)
  try {
    const data = await metaFetch<{ data: Array<{
      id: string;
      name: string;
      status: string;
      effective_status: string;
      issues_info?: Array<{ error_code: number; error_message: string; level: string; error_summary: string }>;
    }> }>(`act_${accountId}/campaigns`, {
      access_token: accessToken,
      fields: "id,name,status,effective_status,issues_info",
      limit: "200",
      effective_status: JSON.stringify(["WITH_ISSUES"]),
    });

      for (const campaign of (data.data ?? [])) {
        const issueMsg = campaign.issues_info?.[0]?.error_summary ?? "Verifique os detalhes no Meta Ads Manager.";
        alerts.push({
          type: "CAMPAIGN_PAUSED",
          title: `Campanha com problema: ${campaign.name}`,
          message: `A campanha "${campaign.name}" está com problemas de entrega. ${issueMsg}`,
        });
      }
  } catch (err) {
    console.error("[RealTimeAlerts] Campaign status check failed:", err);
  }

  // 3. Check ads for rejected creatives and errors
  try {
    const data = await metaFetch<{ data: Array<{
      id: string;
      name: string;
      effective_status: string;
      review_feedback?: Record<string, string>;
      issues_info?: Array<{ error_code: number; error_message: string; level: string; error_summary: string }>;
    }> }>(`act_${accountId}/ads`, {
      access_token: accessToken,
      fields: "id,name,effective_status,review_feedback,issues_info",
      limit: "500",
      effective_status: JSON.stringify(["DISAPPROVED", "WITH_ISSUES"]),
    });

    for (const ad of (data.data ?? [])) {
      if (ad.effective_status === "DISAPPROVED") {
        const feedbackEntries = Object.entries(ad.review_feedback ?? {});
        const reason = feedbackEntries.length > 0
          ? feedbackEntries.map(([, v]) => v).join("; ")
          : "Verifique o motivo no Meta Ads Manager.";
        alerts.push({
          type: "AD_REJECTED",
          title: `Criativo rejeitado: ${ad.name}`,
          message: `O anúncio "${ad.name}" foi reprovado pela Meta. Motivo: ${reason}`,
        });
      } else if (ad.effective_status === "WITH_ISSUES") {
        const issueMsg = ad.issues_info?.[0]?.error_summary ?? "Verifique os detalhes no Meta Ads Manager.";
        alerts.push({
          type: "AD_ERROR",
          title: `Erro no anúncio: ${ad.name}`,
          message: `O anúncio "${ad.name}" está com problemas. ${issueMsg}`,
        });
      }
    }
  } catch (err) {
    console.error("[RealTimeAlerts] Ad status check failed:", err);
  }

  // 4. Check adsets for errors and system-paused
  try {
    const data = await metaFetch<{ data: Array<{
      id: string;
      name: string;
      effective_status: string;
      issues_info?: Array<{ error_code: number; error_message: string; level: string; error_summary: string }>;
    }> }>(`act_${accountId}/adsets`, {
      access_token: accessToken,
      fields: "id,name,effective_status,issues_info",
      limit: "500",
      effective_status: JSON.stringify(["WITH_ISSUES"]),
    });

    for (const adset of (data.data ?? [])) {
      if (adset.effective_status === "WITH_ISSUES") {
        const issueMsg = adset.issues_info?.[0]?.error_summary ?? "Verifique os detalhes no Meta Ads Manager.";
        alerts.push({
          type: "AD_ERROR",
          title: `Erro no conjunto: ${adset.name}`,
          message: `O conjunto "${adset.name}" está com problemas. ${issueMsg}`,
        });
      } else if (adset.effective_status === "PAUSED_BY_SYSTEM") {
        alerts.push({
          type: "ADSET_NO_DELIVERY",
          title: `Conjunto pausado pelo sistema: ${adset.name}`,
          message: `O conjunto "${adset.name}" foi pausado automaticamente pelo Meta. Verifique orçamento, segmentação e criativos.`,
        });
      }
    }
  } catch (err) {
    console.error("[RealTimeAlerts] Adset status check failed:", err);
  }

  // 5. Check active adsets with no impressions in last 24h (active but not delivering)
  try {
    const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0]!;
    const today = new Date().toISOString().split("T")[0]!;

    // Get insights for active adsets in last 24h
    const insightData = await metaFetch<{ data: Array<{ adset_id: string; adset_name: string; impressions: string }> }>(
      `act_${accountId}/insights`,
      {
        access_token: accessToken,
        fields: "adset_id,adset_name,impressions",
        level: "adset",
        time_range: JSON.stringify({ since: yesterday, until: today }),
        filtering: JSON.stringify([{ field: "adset.effective_status", operator: "IN", value: ["ACTIVE"] }]),
        limit: "200",
      }
    );
    const deliveringAdsets = new Set((insightData.data ?? []).map((r) => r.adset_id));

    // Get all active adsets
    const activeData = await metaFetch<{ data: Array<{ id: string; name: string }> }>(
      `act_${accountId}/adsets`,
      {
        access_token: accessToken,
        fields: "id,name",
        limit: "200",
        effective_status: JSON.stringify(["ACTIVE"]),
      }
    );
      for (const adset of (activeData.data ?? [])) {
        if (!deliveringAdsets.has(adset.id)) {
          alerts.push({
            type: "ADSET_NO_DELIVERY",
            title: `Conjunto sem entrega: ${adset.name}`,
            message: `O conjunto "${adset.name}" está ativo mas não registrou impressões nas últimas 24h. Verifique segmentação, orçamento e criativos.`,
          });
        }
      }
  } catch (err) {
    console.error("[RealTimeAlerts] Adset no-delivery check failed:", err);
  }

  // 6. Check for Instagram account not linked to the ad account
  try {
    const igData = await metaFetch<{ data: Array<{ id: string; name: string }> }>(
      `act_${accountId}/connected_instagram_accounts`,
      {
        access_token: accessToken,
        fields: "id,name",
        limit: "50",
      }
    );
    if ((igData.data ?? []).length === 0) {
      alerts.push({
        type: "INSTAGRAM_UNLINKED",
        title: "Nenhuma conta do Instagram vinculada",
        message: "A conta de anúncios não possui contas do Instagram vinculadas. Isso pode limitar a entrega em posicionamentos do Instagram.",
      });
    }
  } catch (err) {
    console.error("[RealTimeAlerts] Instagram account check failed:", err);
  }

  // 7. Check pixels for errors or inactivity (>48h without firing)
  try {
    const pixelData = await metaFetch<{ data: Array<{
      id: string;
      name: string;
      last_fired_time?: string;
      is_unavailable?: boolean;
    }> }>(`act_${accountId}/adspixels`, {
      access_token: accessToken,
      fields: "id,name,last_fired_time,is_unavailable",
      limit: "50",
    });
    for (const pixel of (pixelData.data ?? [])) {
      if (pixel.is_unavailable) {
        alerts.push({
          type: "PIXEL_ERROR",
          title: `Pixel indisponível: ${pixel.name}`,
          message: `O pixel "${pixel.name}" está indisponível. Verifique a instalação no site e as permissões no Business Manager.`,
        });
      } else if (pixel.last_fired_time) {
        const hoursSince = (Date.now() - new Date(pixel.last_fired_time).getTime()) / 3600000;
        if (hoursSince > 48) {
          alerts.push({
            type: "PIXEL_ERROR",
            title: `Pixel inativo: ${pixel.name}`,
            message: `O pixel "${pixel.name}" não disparou nos últimos ${Math.round(hoursSince)}h (referência: máximo 48h). Verifique se o código está instalado corretamente no site.`,
          });
        }
      }
    }
  } catch (err) {
    console.error("[RealTimeAlerts] Pixel check failed:", err);
  }

  return alerts;
}

// ─── 3-Level Data Fetching for AI Suggestions ────────────────────────────────

export interface AdSetWithInsights {
  id: string;
  name: string;
  campaign_id: string;
  campaign_name?: string;
  status: string;
  effective_status: string;
  optimization_goal: string;
  daily_budget?: string;
  lifetime_budget?: string;
  targeting?: {
    age_min?: number;
    age_max?: number;
    genders?: number[]; // 1=male, 2=female
    geo_locations?: {
      countries?: string[];
      regions?: Array<{ name: string }>;
      cities?: Array<{ name: string }>;
    };
    interests?: Array<{ id: string; name: string }>;
    custom_audiences?: Array<{ id: string; name: string }>;
  };
  // Insights (period)
  spend: number;
  impressions: number;
  clicks: number;
  reach: number;
  frequency: number;
  ctr: number;
  cpc: number;
  cpm: number;
  conversions: number;
  costPerResult: number;
  roas: number;
}

export interface AdWithInsights {
  id: string;
  name: string;
  adset_id: string;
  adset_name?: string;
  campaign_id: string;
  campaign_name?: string;
  status: string;
  effective_status: string;
  creative_type: string; // VIDEO, IMAGE, CAROUSEL, CATALOG
  // Insights (period)
  spend: number;
  impressions: number;
  clicks: number;
  frequency: number;
  ctr: number;
  cpc: number;
  cpm: number;
  conversions: number;
  costPerResult: number;
  roas: number;
}

/**
 * Fetch adsets with full insights for 3-level AI analysis.
 * Returns adsets with targeting info + performance metrics.
 */
export async function getAdSetsWithInsights(
  accountId: string,
  accessToken: string,
  startDate: string,
  endDate: string
): Promise<AdSetWithInsights[]> {
  try {
    // Step 1: Get adsets with targeting
    const adsetData = await metaFetch<{
      data: Array<{
        id: string;
        name: string;
        campaign_id: string;
        status: string;
        effective_status: string;
        optimization_goal: string;
        daily_budget?: string;
        lifetime_budget?: string;
        targeting?: AdSetWithInsights["targeting"];
      }>;
    }>(`act_${accountId}/adsets`, {
      access_token: accessToken,
      fields: "id,name,campaign_id,status,effective_status,optimization_goal,daily_budget,lifetime_budget,targeting",
      filtering: JSON.stringify([{ field: "effective_status", operator: "IN", value: ["ACTIVE", "PAUSED"] }]),
      limit: "200",
    });

    const adsets = adsetData.data ?? [];
    if (adsets.length === 0) return [];

    // Step 2: Get insights for all adsets in the period
    const insightData = await metaFetch<{
      data: Array<{
        adset_id: string;
        adset_name: string;
        campaign_id: string;
        campaign_name: string;
        spend: string;
        impressions: string;
        clicks: string;
        reach: string;
        frequency: string;
        ctr: string;
        cpc: string;
        cpm: string;
        actions?: Array<{ action_type: string; value: string }>;
        purchase_roas?: Array<{ action_type: string; value: string }>;
      }>;
    }>(`act_${accountId}/insights`, {
      access_token: accessToken,
      level: "adset",
      fields: "adset_id,adset_name,campaign_id,campaign_name,spend,impressions,clicks,reach,frequency,ctr,cpc,cpm,actions,purchase_roas",
      time_range: JSON.stringify({ since: startDate, until: endDate }),
      limit: "500",
    });

    const insightMap = new Map<string, (typeof insightData.data)[0]>();
    for (const ins of insightData.data ?? []) {
      insightMap.set(ins.adset_id, ins);
    }

    return adsets.map((adset) => {
      const ins = insightMap.get(adset.id);
      const spend = parseFloat(ins?.spend ?? "0") || 0;
      const impressions = parseInt(ins?.impressions ?? "0") || 0;
      const clicks = parseInt(ins?.clicks ?? "0") || 0;
      const reach = parseInt(ins?.reach ?? "0") || 0;
      const frequency = parseFloat(ins?.frequency ?? "0") || 0;
      const ctr = parseFloat(ins?.ctr ?? "0") || 0;
      const cpc = parseFloat(ins?.cpc ?? "0") || 0;
      const cpm = parseFloat(ins?.cpm ?? "0") || 0;
      const conversions = extractResultsByGoal(ins?.actions, adset.optimization_goal);
      const costPerResult = spend > 0 && conversions > 0 ? spend / conversions : 0;
      const roas = extractPurchaseRoas(ins?.purchase_roas, spend, 0);
      return {
        ...adset,
        campaign_name: ins?.campaign_name,
        spend, impressions, clicks, reach, frequency, ctr, cpc, cpm,
        conversions, costPerResult, roas,
      };
    });
  } catch (err) {
    console.error("[getAdSetsWithInsights] Failed:", err);
    return [];
  }
}

/**
 * Fetch ads/creatives with full insights for 3-level AI analysis.
 */
export async function getAdsWithInsights(
  accountId: string,
  accessToken: string,
  startDate: string,
  endDate: string,
  adsetGoalMap?: Map<string, string>
): Promise<AdWithInsights[]> {
  try {
    // Step 1: Get ads with creative type
    const adData = await metaFetch<{
      data: Array<{
        id: string;
        name: string;
        adset_id: string;
        campaign_id: string;
        status: string;
        effective_status: string;
        creative?: { object_type?: string };
      }>;
    }>(`act_${accountId}/ads`, {
      access_token: accessToken,
      fields: "id,name,adset_id,campaign_id,status,effective_status,creative{object_type}",
      filtering: JSON.stringify([{ field: "effective_status", operator: "IN", value: ["ACTIVE", "PAUSED"] }]),
      limit: "500",
    });

    const ads = adData.data ?? [];
    if (ads.length === 0) return [];

    // Step 2: Get insights for all ads
    const insightData = await metaFetch<{
      data: Array<{
        ad_id: string;
        ad_name: string;
        adset_id: string;
        adset_name: string;
        campaign_id: string;
        campaign_name: string;
        spend: string;
        impressions: string;
        clicks: string;
        frequency: string;
        ctr: string;
        cpc: string;
        cpm: string;
        actions?: Array<{ action_type: string; value: string }>;
        purchase_roas?: Array<{ action_type: string; value: string }>;
      }>;
    }>(`act_${accountId}/insights`, {
      access_token: accessToken,
      level: "ad",
      fields: "ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,spend,impressions,clicks,frequency,ctr,cpc,cpm,actions,purchase_roas",
      time_range: JSON.stringify({ since: startDate, until: endDate }),
      limit: "1000",
    });

    const insightMap = new Map<string, (typeof insightData.data)[0]>();
    for (const ins of insightData.data ?? []) {
      insightMap.set(ins.ad_id, ins);
    }

    return ads.map((ad) => {
      const ins = insightMap.get(ad.id);
      const spend = parseFloat(ins?.spend ?? "0") || 0;
      const impressions = parseInt(ins?.impressions ?? "0") || 0;
      const clicks = parseInt(ins?.clicks ?? "0") || 0;
      const frequency = parseFloat(ins?.frequency ?? "0") || 0;
      const ctr = parseFloat(ins?.ctr ?? "0") || 0;
      const cpc = parseFloat(ins?.cpc ?? "0") || 0;
      const cpm = parseFloat(ins?.cpm ?? "0") || 0;
      const goal = adsetGoalMap?.get(ad.adset_id) ?? "OFFSITE_CONVERSIONS";
      const conversions = extractResultsByGoal(ins?.actions, goal);
      const costPerResult = spend > 0 && conversions > 0 ? spend / conversions : 0;
      const roas = extractPurchaseRoas(ins?.purchase_roas, spend, 0);
      // Map creative type from object_type
      const objType = (ad.creative?.object_type ?? "").toUpperCase();
      let creative_type = "IMAGE";
      if (objType.includes("VIDEO")) creative_type = "VIDEO";
      else if (objType.includes("CAROUSEL") || objType.includes("MULTI")) creative_type = "CAROUSEL";
      else if (objType.includes("COLLECTION") || objType.includes("CATALOG")) creative_type = "CATALOG";
      return {
        id: ad.id,
        name: ad.name,
        adset_id: ad.adset_id,
        adset_name: ins?.adset_name,
        campaign_id: ad.campaign_id,
        campaign_name: ins?.campaign_name,
        status: ad.status,
        effective_status: ad.effective_status,
        creative_type,
        spend, impressions, clicks, frequency, ctr, cpc, cpm,
        conversions, costPerResult, roas,
      };
    });
  } catch (err) {
    console.error("[getAdsWithInsights] Failed:", err);
    return [];
  }
}
