/**
 * autoSync.ts — Cron job para sincronização automática diária de todas as contas Meta Ads.
 *
 * Roda todo dia às 06:00 (horário de Brasília, UTC-3 = 09:00 UTC).
 * Busca sempre os últimos 30 dias para garantir que o banco tenha dados
 * completos para qualquer filtro do dashboard (7/14/30 dias).
 *
 * Por que 30 dias? A janela de atribuição do Meta é de 7 dias após clique.
 * Isso significa que dados de ontem ainda podem mudar hoje (conversões atribuídas
 * com atraso). Ao ressincronizar os últimos 30 dias diariamente, garantimos que
 * todas as conversões atribuídas com atraso sejam capturadas.
 */

import cron from "node-cron";
import { getAllActiveMetaAdAccounts, getCampaignsByAccountId, updateMetaAdAccountSync, upsertCampaign, upsertCampaignMetrics } from "./db";
import {
  getCampaigns,
  getAdSets,
  buildCampaignGoalMap,
  getCampaignInsights,
  extractResultsByGoal,
  extractConversions,
  extractConversionValue,
  extractPurchaseRoas,
  calculateCpa,
  getResultLabel,
} from "./metaAdsService";

const SYNC_DAYS = 30; // Always sync 30 days to ensure complete data for all dashboard filters

function getDateRange(days: number) {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);
  return {
    startDate: start.toISOString().split("T")[0],
    endDate: end.toISOString().split("T")[0],
  };
}

const objectiveToGoalFallback: Record<string, string> = {
  OUTCOME_SALES: "OFFSITE_CONVERSIONS",
  CONVERSIONS: "OFFSITE_CONVERSIONS",
  OUTCOME_LEADS: "LEAD_GENERATION",
  LEAD_GENERATION: "LEAD_GENERATION",
  MESSAGES: "CONVERSATIONS",
  OUTCOME_ENGAGEMENT: "POST_ENGAGEMENT",
  POST_ENGAGEMENT: "POST_ENGAGEMENT",
  PAGE_LIKES: "PAGE_LIKES",
  OUTCOME_AWARENESS: "REACH",
  REACH: "REACH",
  BRAND_AWARENESS: "REACH",
  OUTCOME_TRAFFIC: "LINK_CLICKS",
  LINK_CLICKS: "LINK_CLICKS",
  VIDEO_VIEWS: "VIDEO_VIEWS",
  OUTCOME_APP_PROMOTION: "APP_INSTALLS",
};

async function syncAccount(account: { id: number; accountId: string; accessToken: string; accountName: string | null }) {
  const { startDate, endDate } = getDateRange(SYNC_DAYS);
  const label = account.accountName ?? account.accountId;
  console.log(`[AutoSync] Syncing account "${label}" (${account.accountId}) — ${startDate} to ${endDate}`);

  try {
    // 1. Fetch campaigns + adsets to get optimization_goal
    const [metaCampaigns, adsets] = await Promise.all([
      getCampaigns(account.accountId, account.accessToken),
      getAdSets(account.accountId, account.accessToken),
    ]);
    const campaignGoalMap = buildCampaignGoalMap(adsets);

    // 2. Upsert campaigns with optimization_goal
    for (const mc of metaCampaigns) {
      const optimizationGoal = campaignGoalMap.get(mc.id) ?? objectiveToGoalFallback[mc.objective ?? ""];
      const resultLabel = optimizationGoal ? getResultLabel(optimizationGoal) : undefined;
      await upsertCampaign({
        accountId: account.id,
        metaCampaignId: mc.id,
        name: mc.name,
        status: mc.status as any,
        objective: mc.objective,
        optimizationGoal,
        resultLabel,
        dailyBudget: mc.daily_budget ?? undefined,
        lifetimeBudget: mc.lifetime_budget ?? undefined,
        startTime: mc.start_time ? new Date(mc.start_time) : undefined,
        stopTime: mc.stop_time ? new Date(mc.stop_time) : undefined,
      });
    }

    // 3. Fetch insights for the last 30 days
    const insights = await getCampaignInsights(account.accountId, account.accessToken, startDate, endDate);
    const localCampaigns = await getCampaignsByAccountId(account.id);
    const campaignMap = new Map(localCampaigns.map((c) => [c.metaCampaignId, c.id]));

    // 4. Upsert metrics — onDuplicateKeyUpdate ensures no duplicates (requires uq_campaign_date index)
    for (const insight of insights) {
      const localId = campaignMap.get(insight.campaign_id);
      if (!localId) continue;

      const spend = parseFloat(insight.spend ?? "0");
      const optimizationGoal = campaignGoalMap.get(insight.campaign_id) ?? "";
      const conversions = optimizationGoal
        ? extractResultsByGoal(insight.actions, optimizationGoal)
        : extractConversions(insight.actions);
      const conversionValue = extractConversionValue(insight.action_values);
      const roas = extractPurchaseRoas(insight.purchase_roas, spend, conversionValue);
      const cpa = calculateCpa(spend, conversions);

      await upsertCampaignMetrics({
        campaignId: localId,
        accountId: account.id,
        date: insight.date_start,
        impressions: parseInt(insight.impressions ?? "0"),
        clicks: parseInt(insight.clicks ?? "0"),
        spend: String(spend),
        conversions: String(conversions),
        conversionValue: String(conversionValue),
        reach: parseInt(insight.reach ?? "0"),
        frequency: insight.frequency ?? "0",
        ctr: insight.ctr ?? "0",
        cpc: insight.cpc ?? "0",
        cpm: insight.cpm ?? "0",
        cpa: String(cpa),
        roas: String(roas),
      });
    }

    await updateMetaAdAccountSync(account.id);
    console.log(`[AutoSync] ✓ Account "${label}" synced — ${metaCampaigns.length} campaigns, ${insights.length} insight rows`);
  } catch (err) {
    console.error(`[AutoSync] ✗ Failed to sync account "${label}":`, err);
  }
}

async function runAutoSync() {
  console.log("[AutoSync] Starting daily auto-sync for all accounts...");
  const accounts = await getAllActiveMetaAdAccounts();
  if (accounts.length === 0) {
    console.log("[AutoSync] No accounts found, skipping.");
    return;
  }
  // Sync accounts sequentially to avoid rate limits
  for (const account of accounts) {
    await syncAccount(account);
    // Small delay between accounts to respect Meta API rate limits
    await new Promise((r) => setTimeout(r, 2000));
  }
  console.log(`[AutoSync] Daily sync complete — ${accounts.length} account(s) processed.`);
}

/**
 * Start the auto-sync cron job.
 * Runs every day at 06:00 Brasília time (UTC-3 = 09:00 UTC).
 * Cron format: second minute hour day month weekday
 */
export function startAutoSync() {
  // Run at 09:00 UTC = 06:00 Brasília (UTC-3)
  cron.schedule("0 9 * * *", () => {
    runAutoSync().catch(console.error);
  }, {
    timezone: "UTC",
  });
  console.log("[AutoSync] Daily sync scheduled at 06:00 Brasília time (09:00 UTC)");
}
