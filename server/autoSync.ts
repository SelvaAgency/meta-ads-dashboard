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
 *
 * ANOMALIAS vs ALERTAS TÉCNICOS:
 * - Anomalias: desvios estatísticos de métricas (ROAS, CPA, CTR, resultados)
 *   detectados comparando a média dos últimos 7 dias com os 7 dias anteriores.
 * - Alertas técnicos: erros operacionais (campanha parada, saldo baixo, pagamento,
 *   anúncio rejeitado, página desvinculada, Instagram desvinculado, pixel com erro,
 *   adset sem entrega) — verificados em tempo real a cada hora.
 */

import cron from "node-cron";
import { detectAnomalies } from "./analysisService";
import { notifyOwner } from "./_core/notification";
import {
  getAllActiveMetaAdAccounts,
  getCampaignsByAccountId,
  updateMetaAdAccountSync,
  upsertCampaign,
  upsertCampaignMetrics,
  getAccountMetricsSummary,
  getCampaignPerformanceSummary,
  createAnomaly,
  createAlert,
  markAnomalyEmailSent,
  markAlertEmailSent,
  getMetaAdAccountsByUserId,
} from "./db";
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
  checkRealTimeAlerts,
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

// ─── Auto Anomaly Detection ────────────────────────────────────────────────────

/**
 * Aggregate weighted metrics from per-campaign performance rows.
 * Uses weighted averages (total / total) instead of simple AVG of ratios.
 */
function aggregateCampaignRows(rows: Awaited<ReturnType<typeof getCampaignPerformanceSummary>>) {
  const totals = rows.reduce(
    (acc, r) => ({
      spend: acc.spend + Number(r.totalSpend ?? 0),
      impressions: acc.impressions + Number(r.totalImpressions ?? 0),
      clicks: acc.clicks + Number(r.totalClicks ?? 0),
      conversions: acc.conversions + Number(r.totalConversions ?? 0),
      conversionValue: acc.conversionValue + Number(r.totalConversionValue ?? 0),
    }),
    { spend: 0, impressions: 0, clicks: 0, conversions: 0, conversionValue: 0 }
  );
  return {
    roas: totals.spend > 0 ? totals.conversionValue / totals.spend : 0,
    cpa: totals.conversions > 0 ? totals.spend / totals.conversions : 0,
    ctr: totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0,
    spend: totals.spend,
    conversions: totals.conversions,
    impressions: totals.impressions,
    frequency: 0,
  };
}

async function runAnomalyDetection() {
  console.log("[AutoAnomalies] Running hourly anomaly detection...");
  const accounts = await getAllActiveMetaAdAccounts();
  if (accounts.length === 0) return;

  for (const account of accounts) {
    try {
      // ── Janela deslizante de 7 dias ─────────────────────────────────────────
      // Período atual:    últimos 7 dias (D-7 até D-1 inclusive)
      // Período anterior: 7 dias antes disso (D-14 até D-8 inclusive)
      // Comparar a média ponderada dos dois períodos detecta desvios estatísticos reais.
      const daysAgo = (n: number) =>
        new Date(Date.now() - n * 86400000).toISOString().split("T")[0]!;

      const currentStart = daysAgo(7);  // D-7
      const currentEnd   = daysAgo(1);  // D-1 (inclusive)
      const prevStart    = daysAgo(14); // D-14
      const prevEnd      = daysAgo(8);  // D-8 (inclusive)

      const [currentRows, prevRows] = await Promise.all([
        getCampaignPerformanceSummary(account.id, currentStart, currentEnd),
        getCampaignPerformanceSummary(account.id, prevStart, prevEnd),
      ]);

      // Only consider campaigns that had spend in both windows (active campaigns)
      const activeCampaignIds = new Set(
        currentRows
          .filter((r) => Number(r.totalSpend ?? 0) > 0)
          .map((r) => r.campaignId)
      );
      const currentActive = currentRows.filter((r) => activeCampaignIds.has(r.campaignId));
      const prevActive = prevRows.filter((r) => activeCampaignIds.has(r.campaignId));

      let currentAgg: ReturnType<typeof aggregateCampaignRows>;
      let prevAgg: ReturnType<typeof aggregateCampaignRows>;

      if (currentActive.length > 0 && prevActive.length > 0) {
        // Primary path: use per-campaign data with proper weighting
        currentAgg = aggregateCampaignRows(currentActive);
        prevAgg = aggregateCampaignRows(prevActive);
      } else {
        // Fallback: account-level daily summary (less accurate but better than nothing)
        const [recentMetrics, prevMetrics] = await Promise.all([
          getAccountMetricsSummary(account.id, currentStart, currentEnd),
          getAccountMetricsSummary(account.id, prevStart, prevEnd),
        ]);
        if (recentMetrics.length === 0 || prevMetrics.length === 0) {
          // No data at all — skip anomaly detection for this account
          console.log(`[AutoAnomalies] No data for account "${account.accountName ?? account.accountId}", skipping.`);
          // Still run real-time alerts below
          await runRealTimeAlerts(account);
          continue;
        }
        // Aggregate daily rows into a single weighted summary
        const sumMetrics = (rows: typeof recentMetrics) => {
          const totals = rows.reduce(
            (acc, m) => ({
              spend: acc.spend + Number(m.totalSpend ?? 0),
              impressions: acc.impressions + Number(m.totalImpressions ?? 0),
              clicks: acc.clicks + Number(m.totalClicks ?? 0),
              conversions: acc.conversions + Number(m.totalConversions ?? 0),
              conversionValue: acc.conversionValue + Number(m.totalConversionValue ?? 0),
            }),
            { spend: 0, impressions: 0, clicks: 0, conversions: 0, conversionValue: 0 }
          );
          return {
            roas: totals.spend > 0 ? totals.conversionValue / totals.spend : 0,
            cpa: totals.conversions > 0 ? totals.spend / totals.conversions : 0,
            ctr: totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0,
            spend: totals.spend,
            conversions: totals.conversions,
            impressions: totals.impressions,
            frequency: 0,
          };
        };
        currentAgg = sumMetrics(recentMetrics);
        prevAgg = sumMetrics(prevMetrics);
      }

      // ── Detect metric anomalies (statistical deviations only) ──────────────
      const detected = detectAnomalies(
        {
          roas: String(currentAgg.roas),
          cpa: String(currentAgg.cpa),
          ctr: String(currentAgg.ctr),
          spend: String(currentAgg.spend),
          conversions: String(currentAgg.conversions),
          impressions: String(currentAgg.impressions),
          frequency: "0",
        } as any,
        {
          roas: String(prevAgg.roas),
          cpa: String(prevAgg.cpa),
          ctr: String(prevAgg.ctr),
          spend: String(prevAgg.spend),
          conversions: String(prevAgg.conversions),
          impressions: String(prevAgg.impressions),
          frequency: "0",
        } as any
      );

      for (const anomaly of detected) {
        // Save anomaly to DB
        const result = await createAnomaly({
          accountId: account.id,
          type: anomaly.type as any,
          severity: anomaly.severity,
          title: anomaly.title,
          description: anomaly.description,
          metricName: anomaly.metricName,
          currentValue: String(anomaly.currentValue),
          previousValue: String(anomaly.previousValue),
          changePercent: String(anomaly.changePercent),
        });

        // Get the inserted anomaly ID
        const insertId = (result as any).insertId as number | undefined;

        // Create alert for account owner — only once (emailSentAt guards against duplicates)
        const alertResult = await createAlert({
          userId: account.userId,
          accountId: account.id,
          title: anomaly.title,
          message: anomaly.description,
          type: "ANOMALY",
          severity: anomaly.severity === "CRITICAL" || anomaly.severity === "HIGH" ? "CRITICAL" : "WARNING",
        });
        const alertId = (alertResult as any).insertId as number | undefined;

        // Send email notification only once per anomaly (HIGH or CRITICAL)
        if ((anomaly.severity === "CRITICAL" || anomaly.severity === "HIGH") && insertId) {
          const sent = await notifyOwner({
            title: `🚨 ${anomaly.severity === "CRITICAL" ? "Anomalia Crítica" : "Anomalia Alta"}: ${anomaly.title}`,
            content: `Conta: ${account.accountName ?? account.accountId}\n\nPeríodo: ${currentStart} a ${currentEnd} vs ${prevStart} a ${prevEnd}\n\n${anomaly.description}`,
          });
          if (sent && insertId) await markAnomalyEmailSent(insertId);
          if (sent && alertId) await markAlertEmailSent(alertId);
        }
      }

      if (detected.length > 0) {
        console.log(`[AutoAnomalies] ✓ ${detected.length} anomalia(s) detectada(s) na conta "${account.accountName ?? account.accountId}"`);
      }

      // ── Real-time technical alerts ─────────────────────────────────────────
      await runRealTimeAlerts(account);

    } catch (err) {
      console.error(`[AutoAnomalies] Erro ao detectar anomalias na conta ${account.accountId}:`, err);
    }

    await new Promise((r) => setTimeout(r, 1000));
  }
  console.log("[AutoAnomalies] Hourly detection complete.");
}

/**
 * Check and save real-time technical alerts for an account.
 * These are operational errors (campaign stopped, low balance, payment failure,
 * rejected creatives, page unlinked, Instagram unlinked, pixel errors, adset no delivery).
 * Separated from metric anomaly detection to keep concerns clear.
 */
async function runRealTimeAlerts(account: {
  id: number;
  userId: number;
  accountId: string;
  accessToken: string;
  accountName: string | null;
}) {
  try {
    const realTimeAlerts = await checkRealTimeAlerts(account.accountId, account.accessToken);
    for (const rta of realTimeAlerts) {
      const alertResult = await createAlert({
        userId: account.userId,
        accountId: account.id,
        title: rta.title,
        message: rta.message,
        type: rta.type as any,
        severity: rta.severity === "CRITICAL" ? "CRITICAL" : "WARNING",
      });
      const alertId = (alertResult as any).insertId as number | undefined;

      // Send email only once per alert (emailSentAt guards against duplicates)
      if (rta.severity === "CRITICAL" && alertId) {
        const sent = await notifyOwner({
          title: `🚨 ${rta.title}`,
          content: `Conta: ${account.accountName ?? account.accountId}\n\n${rta.message}`,
        });
        if (sent) await markAlertEmailSent(alertId);
      }
    }
    if (realTimeAlerts.length > 0) {
      console.log(`[AutoAnomalies] ✓ ${realTimeAlerts.length} alerta(s) técnico(s) na conta "${account.accountName ?? account.accountId}"`);
    }
  } catch (err) {
    console.error(`[AutoAnomalies] Erro ao verificar alertas técnicos na conta ${account.accountId}:`, err);
  }
}

/**
 * Start the auto-sync cron job.
 * Runs every day at 06:00 Brasília time (UTC-3 = 09:00 UTC).
 * Anomaly detection runs every hour.
 * Cron format: second minute hour day month weekday
 */
export function startAutoSync() {
  // Daily sync at 09:00 UTC = 06:00 Brasília (UTC-3)
  cron.schedule("0 9 * * *", () => {
    runAutoSync().catch(console.error);
  }, { timezone: "UTC" });
  console.log("[AutoSync] Daily sync scheduled at 06:00 Brasília time (09:00 UTC)");

  // Hourly anomaly detection (runs at minute 0 of every hour)
  cron.schedule("0 * * * *", () => {
    runAnomalyDetection().catch(console.error);
  }, { timezone: "UTC" });
  console.log("[AutoAnomalies] Hourly anomaly detection scheduled (every hour at :00)");
}
