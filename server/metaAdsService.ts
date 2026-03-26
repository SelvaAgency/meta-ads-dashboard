/**
 * Meta Ads API Service
 * Handles all communication with the Meta Graph API for fetching campaign data.
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
  balance: string | null;           // Bill amount due (cents)
  spendCap: string | null;          // Lifetime spend cap (cents)
  amountSpent: string | null;       // Total spent so far (cents)
  currency: string;
  fundingSourceType: number | null;  // 0=UNSET,1=CREDIT_CARD,2=FB_WALLET,20=STORED_BALANCE,etc.
  fundingSourceDisplay: string | null; // Human-readable payment method
  isPrePaid: boolean;               // true when type is STORED_BALANCE (20) or FB_WALLET (2)
  remainingBalance: number | null;  // Calculated: spendCap - amountSpent (in account currency units)
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
  actions?: Array<{ action_type: string; value: string }>;
  action_values?: Array<{ action_type: string; value: string }>;
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
 * Get billing info: balance, spend cap, amount spent and funding source for an ad account.
 * Returns null on permission error (account may not have MANAGE access).
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
    // Types considered pre-paid: 2=FACEBOOK_WALLET, 20=STORED_BALANCE, 15=EXTERNAL_DEPOSIT
    const isPrePaid = type !== null && [2, 15, 20].includes(type);

    // Remaining balance calculation (values come in cents from Meta)
    let remainingBalance: number | null = null;
    if (data.spend_cap && data.amount_spent) {
      const cap = parseFloat(data.spend_cap) / 100;
      const spent = parseFloat(data.amount_spent) / 100;
      remainingBalance = Math.max(0, cap - spent);
    } else if (isPrePaid && data.balance) {
      // For pre-paid accounts balance field may represent available funds
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
 * Get campaign insights (metrics) for a date range
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
    fields:
      "campaign_id,campaign_name,impressions,clicks,spend,reach,frequency,ctr,cpc,cpm,actions,action_values",
    time_range: JSON.stringify({ since: startDate, until: endDate }),
    time_increment: "1",
    limit: "500",
  });
  return data.data ?? [];
}

/**
 * Extract conversion count from actions array
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
 * Extract conversion value from action_values array
 */
export function extractConversionValue(
  actionValues?: Array<{ action_type: string; value: string }>
): number {
  if (!actionValues) return 0;
  const conversionTypes = [
    "purchase",
    "offsite_conversion.fb_pixel_purchase",
  ];
  let total = 0;
  for (const av of actionValues) {
    if (conversionTypes.some((t) => av.action_type.includes(t))) {
      total += parseFloat(av.value) || 0;
    }
  }
  return total;
}

/**
 * Calculate ROAS from spend and conversion value
 */
export function calculateRoas(spend: number, conversionValue: number): number {
  if (spend <= 0) return 0;
  return conversionValue / spend;
}

/**
 * Calculate CPA from spend and conversions
 */
export function calculateCpa(spend: number, conversions: number): number {
  if (conversions <= 0) return 0;
  return spend / conversions;
}
