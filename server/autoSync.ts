/**
 * autoSync.ts — Cron job para sincronização automática diária de todas as contas Meta Ads.
 *
 * Roda todo dia às 06:00 (horário de Brasília, UTC-3 = 09:00 UTC).
 * Busca sempre os últimos 30 dias para garantir que o banco tenha dados
 * completos para qualquer filtro do dashboard (7/14/30 dias).
 *
 * ANOMALIAS vs ALERTAS TÉCNICOS:
 * - Anomalias: desvios estatísticos de métricas validados em 3 janelas (7/14/30 dias).
 *   Uma anomalia SÓ é confirmada se detectada em pelo menos 2/3 janelas.
 * - Alertas técnicos: erros operacionais (campanha parada, saldo baixo, pagamento,
 *   anúncio rejeitado, página desvinculada, Instagram desvinculado, pixel com erro,
 *   adset sem entrega) — verificados em tempo real a cada hora.
 */

import cron from "node-cron";
import { sendEmail, DAILY_REPORT_RECIPIENTS, isEmailConfigured } from "./emailService";
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
  createAnomalyIfNotExists,
  createAlert,
  createAlertIfNotExists,
  purgeDuplicateAlerts,
  purgeDuplicateAnomalies,
  markAnomalyEmailSent,
  markAlertEmailSent,
  getMetaAdAccountsByUserId,
  getMetaAdAccountById,
  getDueScheduledReports,
  updateScheduledReport,
  purgeOldReadAnomalies,
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
  extractProfileVisits,
  extractFollowers,
  calculateCpa,
  getResultLabel,
  checkRealTimeAlerts,
  validateToken,
} from "./metaAdsService";
import { generateAgencyReport } from "./analysisService";
import type { CampaignReportData } from "./analysisService";

const SYNC_DAYS = 30; // Always sync 30 days to ensure complete data for all dashboard filters

function getDateRange(days: number) {
  const end = new Date();
  end.setDate(end.getDate() - 1); // ontem = último dia completo
  const start = new Date(end);
  start.setDate(start.getDate() - (days - 1)); // days dias contando ontem
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

export async function syncAccount(account: { id: number; accountId: string; accessToken: string; accountName: string | null; userId: number }) {
  const { startDate, endDate } = getDateRange(SYNC_DAYS);
  const label = account.accountName ?? account.accountId;
  console.log(`[AutoSync] Syncing account "${label}" (${account.accountId}) — ${startDate} to ${endDate}`);

  try {
    // Validate token before any API call
    const tokenValid = await validateToken(account.accessToken);
    if (!tokenValid) {
      console.error(`[AutoSync] ✗ Token expirado para conta "${label}" (${account.accountId}). Criando alerta SYNC_ERROR.`);
      await createAlertIfNotExists({
        userId: account.userId,
        accountId: account.id,
        title: `Token expirado: ${label}`,
        message: `O token de acesso da conta "${label}" expirou ou foi invalidado. Reconecte a conta em Gerenciar Contas para restaurar a sincronização automática.`,
        type: "SYNC_ERROR" as any,
        severity: "CRITICAL",
      });
      return;
    }

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
      
      // Validate and convert timestamps safely
      const startDate = mc.start_time ? new Date(mc.start_time) : undefined;
      const stopDate = mc.stop_time ? new Date(mc.stop_time) : undefined;
      
      // Only use valid dates (not Invalid Date) and in reasonable range (1990-2100)
      const isReasonableDate = (d: Date | undefined) => {
        if (!d || isNaN(d.getTime())) return false;
        const year = d.getFullYear();
        return year >= 1990 && year <= 2100;
      };
      const validStartTime = isReasonableDate(startDate) ? startDate : undefined;
      const validStopTime = isReasonableDate(stopDate) ? stopDate : undefined;
      
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
        startTime: validStartTime,
        stopTime: validStopTime,
      });
    }

    // 3. Fetch insights for the last 30 days
    console.log(`[AutoSync] About to fetch insights for account ${account.accountId} (${startDate} to ${endDate})`);
    const insights = await getCampaignInsights(account.accountId, account.accessToken, startDate, endDate);
    console.log(`[AutoSync] Received ${insights.length} insight rows for account ${account.accountId}`);
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

      const profileVisits = extractProfileVisits(insight.actions);
      const followers = extractFollowers(insight.actions);

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
        profileVisits,
        followers,
      });
    }

    await updateMetaAdAccountSync(account.id);
    console.log(`[AutoSync] ✓ Account "${label}" synced — ${metaCampaigns.length} campaigns, ${insights.length} insight rows`);
  } catch (err: any) {
    const errMsg = err?.message ?? String(err);
    const metaCodeMatch = errMsg.match(/Meta API Error \((\d+)\)/);
    const metaCode = metaCodeMatch ? metaCodeMatch[1] : null;
    console.error(`[AutoSync] ✗ Failed to sync account "${label}" (Meta error code: ${metaCode ?? 'N/A'}):`, errMsg);

    // If token expired or permission denied, create SYNC_ERROR alert
    if (errMsg.includes('META_TOKEN_EXPIRED') || metaCode === '190') {
      try {
        await createAlertIfNotExists({
          userId: account.userId,
          accountId: account.id,
          title: `Token expirado: ${label}`,
          message: `Sincronização falhou por token expirado. Reconecte a conta em Gerenciar Contas.`,
          type: "SYNC_ERROR" as any,
          severity: "CRITICAL",
        });
      } catch (_) { /* ignore alert creation errors */ }
    } else if (metaCode === '200' || errMsg.includes('ads_management') || errMsg.includes('ads_read')) {
      try {
        await createAlertIfNotExists({
          userId: account.userId,
          accountId: account.id,
          title: `Permissão negada: ${label}`,
          message: `A conta "${label}" não concedeu permissão ads_management/ads_read. O dono da conta precisa autorizar o acesso via Facebook Business.`,
          type: "SYNC_ERROR" as any,
          severity: "CRITICAL",
        });
      } catch (_) { /* ignore alert creation errors */ }
    } else {
      try {
        await createAlertIfNotExists({
          userId: account.userId,
          accountId: account.id,
          title: `Sync falhou: ${label}`,
          message: `Erro ao sincronizar: ${errMsg.substring(0, 200)}`,
          type: "SYNC_ERROR" as any,
          severity: "HIGH",
        });
      } catch (_) { /* ignore alert creation errors */ }
    }
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
      // ── Três janelas de referência para validação multi-período ──────────────
      // Anomalia SÓ confirmada se detectada em pelo menos 2/3 janelas.
      const daysAgo = (n: number) =>
        new Date(Date.now() - n * 86400000).toISOString().split("T")[0]!;

      const w7Start  = daysAgo(7);  const w7End  = daysAgo(1);
      const w14Start = daysAgo(14); const w14End = daysAgo(8);
      const w30Start = daysAgo(30); const w30End = daysAgo(15);

      const [rows7, rows14, rows30] = await Promise.all([
        getCampaignPerformanceSummary(account.id, w7Start, w7End),
        getCampaignPerformanceSummary(account.id, w14Start, w14End),
        getCampaignPerformanceSummary(account.id, w30Start, w30End),
      ]);

      // Only consider campaigns that had spend in the current window
      const activeCampaignIds = new Set(
        rows7
          .filter((r) => Number(r.totalSpend ?? 0) > 0)
          .map((r) => r.campaignId)
      );

      if (activeCampaignIds.size === 0) {
        console.log(`[AutoAnomalies] No active campaigns for account "${account.accountName ?? account.accountId}", skipping.`);
        await runRealTimeAlerts(account);
        continue;
      }

      const active7  = rows7.filter((r) => activeCampaignIds.has(r.campaignId));
      const active14 = rows14.filter((r) => activeCampaignIds.has(r.campaignId));
      const active30 = rows30.filter((r) => activeCampaignIds.has(r.campaignId));

      const agg7  = aggregateCampaignRows(active7);
      const agg14 = active14.length > 0 ? aggregateCampaignRows(active14) : agg7;
      const agg30 = active30.length > 0 ? aggregateCampaignRows(active30) : agg14;
      const currentAgg = agg7;
      const currentStart = w7Start;
      const currentEnd   = w7End;

      // ── Detect metric anomalies (multi-period: 2/3 windows required) ──────
      const detected = detectAnomalies(
        { roas: currentAgg.roas, cpa: currentAgg.cpa, ctr: currentAgg.ctr, spend: currentAgg.spend, conversions: currentAgg.conversions, impressions: currentAgg.impressions, frequency: currentAgg.frequency },
        { roas: agg7.roas, cpa: agg7.cpa, ctr: agg7.ctr, spend: agg7.spend, conversions: agg7.conversions, impressions: agg7.impressions },
        { roas: agg14.roas, cpa: agg14.cpa, ctr: agg14.ctr, spend: agg14.spend, conversions: agg14.conversions, impressions: agg14.impressions },
        { roas: agg30.roas, cpa: agg30.cpa, ctr: agg30.ctr, spend: agg30.spend, conversions: agg30.conversions, impressions: agg30.impressions },
        { hasLimitedHistory: active14.length === 0 }
      );

      for (const anomaly of detected) {
        // Save anomaly to DB
        const result = await createAnomalyIfNotExists({
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
        const alertResult = await createAlertIfNotExists({
          userId: account.userId,
          accountId: account.id,
          title: anomaly.title,
          message: anomaly.description,
          type: "ANOMALY",
          severity: "WARNING",
        });
        const alertId = (alertResult as any).insertId as number | undefined;

        // Notificar o dono da conta para toda anomalia detectada (sem filtro por prioridade)
        if (insertId) {
          const sent = await notifyOwner({
            title: `⚠️ Anomalia detectada: ${anomaly.title}`,
            content: `Conta: ${account.accountName ?? account.accountId}\n\nPeríodo: ${currentStart} a ${currentEnd}\n\n${anomaly.description}`,
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

  console.log("[AutoAnomalies] Anomaly detection cycle complete.");
}

// ─── Real-time Technical Alerts ───────────────────────────────────────────────

async function runRealTimeAlerts(account: { id: number; accountId: string; accessToken: string; accountName: string | null; userId: number }) {
  try {
    const alerts = await checkRealTimeAlerts(account.accountId, account.accessToken);
    for (const alert of alerts) {
      const result = await createAlertIfNotExists({
        userId: account.userId,
        accountId: account.id,
        title: alert.title,
        message: alert.message,
        type: alert.type as any,
        severity: (alert.severity as any) ?? "WARNING",
      });
      if (!result) continue; // Alerta já existia, pular notificação
      const alertId = (result as any).insertId as number | undefined;

      // Notificar o dono da conta para todo alerta técnico (sem filtro por prioridade)
      if (alertId) {
        const sent = await notifyOwner({
          title: `⚠️ Alerta técnico: ${alert.title}`,
          content: `Conta: ${account.accountName ?? account.accountId}\n\n${alert.message}`,
        });
        if (sent) await markAlertEmailSent(alertId);
      }
    }
    if (alerts.length > 0) {
      console.log(`[RealTimeAlerts] ✓ ${alerts.length} alerta(s) técnico(s) para "${account.accountName ?? account.accountId}"`);
    }
  } catch (err) {
    console.error(`[RealTimeAlerts] Erro ao verificar alertas para ${account.accountId}:`, err);
  }
}

// ─── Scheduled Reports ────────────────────────────────────────────────────────

// Map of accountId → cron job (for dynamic per-account scheduling)
const scheduledReportJobs = new Map<number, ReturnType<typeof cron.schedule>>();

/**
 * Rebuild cron jobs for all active scheduled reports.
 * Called at startup and whenever a report schedule is created/updated.
 */
export async function rebuildScheduledReportJobs() {
  // Stop all existing jobs
  for (const [, job] of Array.from(scheduledReportJobs)) {
    job.stop();
  }
  scheduledReportJobs.clear();

  const accounts = await getAllActiveMetaAdAccounts();
  for (const account of accounts) {
    try {
      // Get the scheduled report config for this account
      const reports = await getDueScheduledReports();
      const accountReports = reports.filter((r: any) => r.accountId === account.id || !r.accountId);
      for (const report of accountReports) {
        scheduleReportForAccount(account, report);
      }
    } catch (err) {
      console.error(`[ScheduledReports] Error rebuilding jobs for account ${account.accountId}:`, err);
    }
  }
}

function scheduleReportForAccount(
  account: { id: number; accountId: string; accessToken: string; accountName: string | null; userId: number },
  report: { id: number; frequency: string; scheduleHour: number | null; scheduleMinute: number | null; scheduleDay: number | null }
) {
  const hour = report.scheduleHour ?? 8;
  const minute = report.scheduleMinute ?? 0;
  const day = report.scheduleDay ?? 1;

  let cronExpr: string;
  if (report.frequency === "WEEKLY") {
    cronExpr = `0 ${minute} ${hour} * * ${day}`;
  } else {
    // DAILY
    cronExpr = `0 ${minute} ${hour} * * *`;
  }

  const jobKey = report.id;
  const existing = scheduledReportJobs.get(jobKey);
  if (existing) existing.stop();

  const job = cron.schedule(cronExpr, async () => {
    console.log(`[ScheduledReports] Running scheduled report for account "${account.accountName ?? account.accountId}"`);
    try {
      const { startDate, endDate } = getDateRange(30);
      const localCampaigns = await getCampaignsByAccountId(account.id);
      const campaignData: CampaignReportData[] = localCampaigns.map((c) => ({
        campaignId: c.id,
        campaignName: c.name,
        campaignObjective: c.objective ?? "OUTCOME_SALES",
        campaignStatus: c.status ?? "ACTIVE",
        totalSpend: 0,
        totalImpressions: 0,
        totalClicks: 0,
        totalConversions: 0,
        totalConversionValue: 0,
        totalReach: 0,
        avgRoas: 0,
        avgCpa: 0,
        avgCtr: 0,
        avgCpc: 0,
        avgCpm: 0,
        avgFrequency: 0,
      }));

      const reportContent = await generateAgencyReport(
        account.accountName ?? account.accountId,
        report.frequency as "DAILY" | "WEEKLY",
        campaignData,
        startDate,
        endDate
      );

      await updateScheduledReport(report.id, {
        lastRunAt: new Date(),
        nextRunAt: getNextRunDate(report.frequency, hour, minute, day),
        lastReportContent: reportContent,
      });

      console.log(`[ScheduledReports] ✓ Report generated for "${account.accountName ?? account.accountId}"`);
    } catch (err) {
      console.error(`[ScheduledReports] Error generating report for ${account.accountId}:`, err);
    }
  });

  scheduledReportJobs.set(jobKey, job);
}

function getNextRunDate(frequency: string, hour: number, minute: number, day: number): Date {
  const now = new Date();
  const next = new Date(now);
  next.setSeconds(0);
  next.setMilliseconds(0);
  next.setHours(hour);
  next.setMinutes(minute);

  if (frequency === "WEEKLY") {
    const currentDay = now.getDay();
    let daysUntil = (day - currentDay + 7) % 7;
    if (daysUntil === 0 && now.getTime() >= next.getTime()) daysUntil = 7;
    next.setDate(now.getDate() + daysUntil);
  } else {
    // DAILY
    if (now.getTime() >= next.getTime()) {
      next.setDate(next.getDate() + 1);
    }
  }
  return next;
}

// ─── Scheduled Report Runner (legacy polling fallback) ────────────────────────

async function runScheduledReports() {
  try {
    const due = await getDueScheduledReports();
    if (due.length === 0) return;

    console.log(`[ScheduledReports] ${due.length} report(s) due for generation`);
    for (const report of due) {
      try {
        const account = await getMetaAdAccountById(report.accountId ?? 0);
        if (!account) continue;

        const { startDate, endDate } = getDateRange(30);
        const localCampaigns = await getCampaignsByAccountId(account.id);
      const campaignData: CampaignReportData[] = localCampaigns.map((c) => ({
        campaignId: c.id,
        campaignName: c.name,
        campaignObjective: c.objective ?? "OUTCOME_SALES",
        campaignStatus: c.status ?? "ACTIVE",
        totalSpend: 0,
        totalImpressions: 0,
        totalClicks: 0,
        totalConversions: 0,
        totalConversionValue: 0,
        totalReach: 0,
        avgRoas: 0,
        avgCpa: 0,
        avgCtr: 0,
        avgCpc: 0,
        avgCpm: 0,
        avgFrequency: 0,
      }));

        const reportContent = await generateAgencyReport(
          account.accountName ?? account.accountId,
          report.frequency as "DAILY" | "WEEKLY",
          campaignData,
          startDate,
          endDate
        );

        await updateScheduledReport(report.id, {
          lastRunAt: new Date(),
          nextRunAt: getNextRunDate(
            report.frequency,
            report.scheduleHour ?? 8,
            report.scheduleMinute ?? 0,
            report.scheduleDay ?? 1
          ),
          lastReportContent: reportContent,
        });

        console.log(`[ScheduledReports] ✓ Report generated for account ${account.accountId}`);
      } catch (err) {
        console.error(`[ScheduledReports] Error generating report ${report.id}:`, err);
      }
    }
  } catch (err) {
    console.error("[ScheduledReports] Error running scheduled reports:", err);
  }
}

// ─── Startup ──────────────────────────────────────────────────────────────────


// ─── Daily Report Email (6h BRT = 9h UTC) ───────────────────────────────────

async function runDailyReport() {
  console.log("[DailyReport] Starting daily report generation...");
  if (!isEmailConfigured()) {
    console.warn("[DailyReport] SMTP not configured — skipping. Set SMTP_USER and SMTP_PASS.");
    return;
  }
  try {
    const res = await fetch("http://localhost:3000/api/trpc/reports.generateDaily");
    const json = await res.json();
    // tRPC superjson wraps response in result.data.json
    const data = json?.result?.data?.json ?? json?.result?.data;
    if (!data?.html || !data?.subject) {
      console.error("[DailyReport] No report data returned:", JSON.stringify(json).slice(0, 500));
      return;
    }
    const sent = await sendEmail({
      to: DAILY_REPORT_RECIPIENTS,
      subject: data.subject,
      html: data.html,
      text: data.plainText,
    });
    if (sent) {
      console.log(`[DailyReport] ✓ Report sent: ${data.subject} → ${DAILY_REPORT_RECIPIENTS.length} recipients`);
    } else {
      console.error("[DailyReport] ✗ Failed to send report email");
    }
  } catch (err) {
    console.error("[DailyReport] Error:", err);
  }
}

export async function startAutoSync() {
  console.log("[AutoSync] Initializing auto-sync service...");

  // Daily sync at 09:00 UTC (06:00 Brasília)
  cron.schedule("0 0 9 * * *", runAutoSync);

  // Daily Meta Ads report email at 09:05 UTC (06:05 Brasília) — 5min after sync
  cron.schedule("0 10 9 * * *", runDailyReport);

  // Hourly anomaly detection + real-time alerts
  cron.schedule("0 0 * * * *", runAnomalyDetection);

  // Daily cleanup of old read anomalies (09:05 UTC)
  cron.schedule("0 5 9 * * *", async () => {
    try {
      const deleted = await purgeOldReadAnomalies();
      if (deleted > 0) {
        console.log(`[AutoSync] Purged ${deleted} old read anomalies (>30 days)`);
      }
    } catch (err) {
      console.error("[AutoSync] Error purging old anomalies:", err);
    }
  });

  // Polling fallback for scheduled reports (every 5 minutes)
  cron.schedule("0 */5 * * * *", runScheduledReports);

  // Run initial sync after a short delay to let the server warm up
  setTimeout(async () => {
    // Purge duplicate alerts from backlog on startup
    try {
      const purged = await purgeDuplicateAlerts();
      if (purged > 0) {
        console.log(`[AutoSync] Purged ${purged} duplicate alerts on startup`);
      }
    } catch (err) {
      console.error("[AutoSync] Error purging duplicate alerts:", err);
    }

    // Purge duplicate anomalies from backlog on startup
    try {
      const purgedAnomalies = await purgeDuplicateAnomalies();
      if (purgedAnomalies > 0) {
        console.log(`[AutoSync] Purged ${purgedAnomalies} duplicate anomalies on startup`);
      }
    } catch (err) {
      console.error("[AutoSync] Error purging duplicate anomalies:", err);
    }

    await runAutoSync();
    await runAnomalyDetection();
    await rebuildScheduledReportJobs();
  }, 15000);

  console.log("[AutoSync] Auto-sync service initialized.");
}
