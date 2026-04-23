/**
 * Runtime fetch interceptor for adsByAdset endpoint.
 * 
 * The server-side fix exists but requires MANUS credits to deploy.
 * This client-side interceptor bypasses the broken server endpoint
 * and calls Meta Graph API directly from the browser.
 * 
 * Can be safely removed once the server-side code is deployed.
 */

interface AccountToken {
  accountId: string;
  token: string;
}

let tokensLoaded = false;
const tokenMap: Record<number, AccountToken> = {};

async function loadTokens(origFetch: typeof fetch): Promise<void> {
  if (tokensLoaded) return;
  try {
    const resp = await origFetch.call(window, '/api/trpc/accounts.list?batch=1&input={}');
    const data = await resp.json();
    const accounts = data[0]?.result?.data?.json || [];
    accounts.forEach((a: any) => {
      tokenMap[a.id] = { accountId: a.accountId, token: a.accessToken };
    });
    tokensLoaded = true;
    console.log(`[SELVA Patch] ${accounts.length} account tokens loaded`);
  } catch (e) {
    console.error('[SELVA Patch] Failed to load tokens:', e);
  }
}

function parseConversionMetric(
  actions: any[],
  actionTypes: string[]
): number {
  const match = actions.find((a: any) => actionTypes.includes(a.action_type));
  return match ? parseFloat(match.value) : 0;
}

async function handleAdsByAdset(
  url: string,
  origFetch: typeof fetch
): Promise<Response> {
  await loadTokens(origFetch);

  const urlObj = new URL(url, location.origin);
  const inputRaw = urlObj.searchParams.get('input') || '{}';
  const inputParsed = JSON.parse(inputRaw);
  const inp = inputParsed['0']?.json || inputParsed;
  const { accountId, adsetId, days, startDate, endDate } = inp;

  const acct = tokenMap[accountId];
  if (!acct) {
    console.warn('[SELVA Patch] No token for account', accountId);
    return new Response(
      JSON.stringify([{ result: { data: { json: [] } } }]),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  }

  const end = endDate || new Date().toISOString().slice(0, 10);
  const start = startDate || new Date(Date.now() - (days || 7) * 86400000).toISOString().slice(0, 10);

  // Fetch ads with creative thumbnails
  const adsUrl = `https://graph.facebook.com/v21.0/${adsetId}/ads?` + new URLSearchParams({
    access_token: acct.token,
    fields: 'id,name,adset_id,campaign_id,status,effective_status,creative{object_type,thumbnail_url,image_url}',
    limit: '100',
    filtering: JSON.stringify([{ field: 'effective_status', operator: 'IN', value: ['ACTIVE'] }]),
  });

  const adsResp = await origFetch.call(window, adsUrl);
  const adsData = await adsResp.json();
  const ads = adsData.data || [];

  if (ads.length === 0) {
    return new Response(
      JSON.stringify([{ result: { data: { json: [] } } }]),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  }

  // Fetch insights per ad
  const insightsUrl = `https://graph.facebook.com/v21.0/${adsetId}/insights?` + new URLSearchParams({
    access_token: acct.token,
    fields: 'ad_id,impressions,clicks,spend,ctr,cpc,cpm,actions,cost_per_action_type,action_values',
    level: 'ad',
    time_range: JSON.stringify({ since: start, until: end }),
    limit: '500',
  });

  const insightsMap: Record<string, any> = {};
  try {
    const insResp = await origFetch.call(window, insightsUrl);
    const insData = await insResp.json();
    (insData.data || []).forEach((row: any) => { insightsMap[row.ad_id] = row; });
  } catch (e) {
    console.warn('[SELVA Patch] Insights fetch failed:', e);
  }

  const conversionTypes = [
    'offsite_conversion.fb_pixel_purchase', 'purchase',
    'complete_registration', 'lead',
  ];

  const results = ads.map((ad: any) => {
    const ins = insightsMap[ad.id] || {};
    const creative = ad.creative || {};
    return {
      id: ad.id,
      name: ad.name || `Ad ${ad.id}`,
      adsetId: ad.adset_id,
      campaignId: ad.campaign_id,
      status: ad.effective_status || ad.status,
      impressions: parseInt(ins.impressions || '0'),
      clicks: parseInt(ins.clicks || '0'),
      spend: parseFloat(ins.spend || '0'),
      ctr: parseFloat(ins.ctr || '0'),
      cpc: parseFloat(ins.cpc || '0'),
      cpm: parseFloat(ins.cpm || '0'),
      conversions: parseConversionMetric(ins.actions || [], conversionTypes),
      costPerConversion: parseConversionMetric(ins.cost_per_action_type || [], conversionTypes),
      conversionValue: parseConversionMetric(ins.action_values || [], ['offsite_conversion.fb_pixel_purchase', 'purchase']),
      thumbnailUrl: creative.thumbnail_url || creative.image_url || null,
      creativeType: creative.object_type || null,
    };
  });

  console.log(`[SELVA Patch] ${results.length} ads for adset ${adsetId}`);
  return new Response(
    JSON.stringify([{ result: { data: { json: results } } }]),
    { status: 200, headers: { 'content-type': 'application/json' } }
  );
}

export function installAdsByAdsetInterceptor(): void {
  if ((window as any).__selva_patched) return;

  const origFetch = (window as any).__origFetch || window.fetch;
  (window as any).__origFetch = origFetch;

  window.fetch = async function (...args: any[]) {
    const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
    if (url.includes('campaigns.adsByAdset')) {
      try {
        return await handleAdsByAdset(url, origFetch);
      } catch (err) {
        console.error('[SELVA Patch] Error:', err);
        return origFetch.apply(this, args);
      }
    }
    return origFetch.apply(this, args);
  } as typeof fetch;

  (window as any).__selva_patched = true;
  console.log('[SELVA Patch] adsByAdset interceptor installed');
}
