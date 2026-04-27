import { TRPCError } from "@trpc/server";
import { z } from "zod";

/** Calcula o próximo disparo de um agendamento de relatório.
 * @param frequency DAILY ou WEEKLY
 * @param h hora (0-23)
 * @param m minuto (0-59)
 * @param d dia da semana (0=dom, 1=seg, ..., 6=sáb) — usado apenas no modo WEEKLY
 */
function computeNextRun(frequency: "DAILY" | "WEEKLY", h: number, m: number, d: number): Date {
  const now = new Date();
  const next = new Date(now);
  next.setSeconds(0, 0);
  next.setHours(h, m, 0, 0);
  if (frequency === "DAILY") {
    if (next <= now) next.setDate(next.getDate() + 1);
  } else {
    // Avança até o próximo dia da semana desejado
    const diff = (d - now.getDay() + 7) % 7;
    next.setDate(now.getDate() + (diff === 0 && next <= now ? 7 : diff));
  }
  return next;
}
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import {
  applySuggestion,
  createAlert,
  createAlertIfNotExists,
  createMetaAdAccount,
  createScheduledReport,
  deleteMetaAdAccount,
  deleteScheduledReport,
  dismissSuggestion,
  getAccountMetricsSummary,
  getAlertsByUserId,
  getAlertsByAccountId,
  getUnreadAlertsCountByAccount,
  markAllAlertsReadByAccount,
  getCampaignPerformanceSummary,
  getCampaignsByAccountId,
  getCampaignById,
  getActiveCampaignsForDisplay,
  getMetaAdAccountById,
  getMetaAdAccountsByUserId,
  getScheduledReportsByUserId,
  getAnomaliesByAccountId,
  getSuggestionsByAccountId,
  getSuggestionsHistory,
  updateSuggestionStatus,
  saveSuggestionMonitorResult,
  getSuggestionsUnderMonitoring,
  getUnreadAlertsCount,
  getUnreadAnomaliesCount,
  markAlertRead,
  markAllAlertsRead,
  markAnomalyRead,
  markAnomalyResolved,
  updateScheduledReport,
  upsertCampaign,
  upsertCampaignMetrics,
  updateMetaAdAccountSync,
  markStaleCampaignsArchived,
  forceUpdateAllTokens,
} from "./db";
import {
  validateToken,
  getAdAccounts,
  getAccountBilling,
  getCampaigns,
  getAdSets,
  buildCampaignGoalMap,
  getCampaignInsights,
  extractConversions,
  extractConversionValue,
  extractPurchaseRoas,
  extractResultsByGoal,
  extractProfileVisits,
  extractFollowers,
  getResultLabel,
  calculateRoas,
  calculateCpa,
  getAdSetsWithInsights,
  getAdsWithInsights,
  getDemographicsInsights,
  getDailyAccountInsights,
} from "./metaAdsService";
import { detectDominantGoal, getPerformanceGoalProfile } from "./campaignObjectives";
import { generateAiSuggestions, generateAgencyReport, detectAnomalies } from "./analysisService";
import {
  getGoogleAdsConfig,
  isGoogleAdsConfigured,
  getGoogleAdsCampaigns,
  getGoogleAdsAdGroups,
  getGoogleAdsAds,
  getGoogleAdsAccountSummary,
} from "./googleAdsService";
import {
  getGoogleAdAccountsByUserId,
  getAllActiveGoogleAdAccounts,
  getGoogleAdAccountById,
  createGoogleAdAccount,
  deleteGoogleAdAccount,
  updateGoogleAdAccountSync,
} from "./db";
import type { CampaignReportData } from "./analysisService";
import { notifyOwner } from "./_core/notification";
import { startAutoSync, syncAccount } from "./autoSync";
import {
  createDashboardReport,
  getDashboardReportsByUserId,
  getDashboardReportById,
  updateDashboardReport,
  deleteDashboardReport,
} from "./dashboardBuilderDb";
import {
  analyzeCampaignData,
  generateReportHtml,
  generateAndUploadPdf,
} from "./dashboardBuilderService";
// ─── Helper: date range ────────────────────────────────────────────────────────

function getDateRange(days: number, includeToday = false) {
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split("T")[0];

  // includeToday: range extends to today instead of stopping at yesterday
  const end = includeToday ? today : yesterday;
  const endStr = includeToday ? todayStr : yesterdayStr;

  if (days <= 0) {
    // days=0 means "today only"
    return { startDate: todayStr, endDate: todayStr };
  }

  const start = new Date(end);
  start.setDate(start.getDate() - (days - 1));
  return {
    startDate: start.toISOString().split("T")[0],
    endDate: endStr,
  };
}

// ─── Routers ──────────────────────────────────────────────────────────────────

export const appRouter = router({
  system: systemRouter,

  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ─── Meta Ad Accounts ──────────────────────────────────────────────────────
  accounts: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return getMetaAdAccountsByUserId(ctx.user.id);
    }),

    validateToken: protectedProcedure
      .input(z.object({ accessToken: z.string().min(10) }))
      .mutation(async ({ input }) => {
        const user = await validateToken(input.accessToken);
        if (!user) throw new TRPCError({ code: "BAD_REQUEST", message: "Token inválido ou expirado." });

        const adAccounts = await getAdAccounts(input.accessToken);
        return { user, adAccounts };
      }),

    connect: protectedProcedure
      .input(
        z.object({
          accessToken: z.string().min(10),
          accountId: z.string().min(1),
          accountName: z.string().optional(),
          currency: z.string().optional(),
          timezone: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        // Validate token first
        const user = await validateToken(input.accessToken);
        if (!user) throw new TRPCError({ code: "BAD_REQUEST", message: "Token inválido ou expirado." });

        await createMetaAdAccount({
          userId: ctx.user.id,
          accountId: input.accountId,
          accountName: input.accountName ?? `Conta ${input.accountId}`,
          accessToken: input.accessToken,
          currency: input.currency ?? "BRL",
          timezone: input.timezone ?? "America/Sao_Paulo",
        });

        return { success: true };
      }),

    // Connect ALL accounts from a portfolio token at once
    connectAll: protectedProcedure
      .input(z.object({ accessToken: z.string().min(10) }))
      .mutation(async ({ ctx, input }) => {
        const user = await validateToken(input.accessToken);
        if (!user) throw new TRPCError({ code: "BAD_REQUEST", message: "Token inválido ou expirado." });

        const adAccounts = await getAdAccounts(input.accessToken);
        let connected = 0;
        for (const acc of adAccounts) {
          const rawId = acc.id.replace("act_", "");
          await createMetaAdAccount({
            userId: ctx.user.id,
            accountId: rawId,
            accountName: acc.name ?? `Conta ${rawId}`,
            accessToken: input.accessToken,
            currency: acc.currency ?? "BRL",
            timezone: acc.timezone_name ?? "America/Sao_Paulo",
          });
          connected++;
        }
        return { connected, total: adAccounts.length };
      }),

    // Force-renew token for ALL active accounts (bypasses userId matching)
    forceRenewToken: protectedProcedure
      .input(z.object({ accessToken: z.string().min(10) }))
      .mutation(async ({ input }) => {
        // First validate the token is real
        const user = await validateToken(input.accessToken);
        if (!user) throw new TRPCError({ code: "BAD_REQUEST", message: "Token inválido." });
        // Force-update all active accounts
        await forceUpdateAllTokens(input.accessToken);
        return { success: true, message: "Token atualizado para todas as contas ativas." };
      }),

    disconnect: protectedProcedure
      .input(z.object({ accountId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await deleteMetaAdAccount(input.accountId, ctx.user.id);
        return { success: true };
      }),

    // Get billing info (balance, payment method) for the active account
    billing: protectedProcedure
      .input(z.object({ accountId: z.number() }))
      .query(async ({ ctx, input }) => {
        const account = await getMetaAdAccountById(input.accountId);
        if (!account || account.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Conta não encontrada." });
        }
        const billing = await getAccountBilling(account.accountId, account.accessToken);

        // Fire low-balance alert if pre-paid and remaining < R$200
        if (billing?.isPrePaid && billing.remainingBalance !== null && billing.remainingBalance < 200) {
          // Create an alert in the DB
          await createAlertIfNotExists({
            userId: ctx.user.id,
            accountId: input.accountId,
            type: "BUDGET_WARNING",
            severity: "WARNING",
            title: "Saldo baixo na conta de anúncios",
            message: `Saldo remanescente: ${billing.currency} ${billing.remainingBalance.toFixed(2)}. Recomendamos recarregar antes que as campanhas sejam pausadas automaticamente.`,
          });
          // Notify owner
          await notifyOwner({
            title: `⚠️ Saldo baixo — ${account.accountName ?? account.accountId}`,
            content: `Saldo remanescente: ${billing.currency} ${billing.remainingBalance.toFixed(2)}. Recarregue para evitar interrupção das campanhas.`,
          });
        }

        return billing;
      }),

    sync: protectedProcedure
      .input(z.object({ accountId: z.number(), days: z.number().min(1).max(90).default(30) }))
      .mutation(async ({ ctx, input }) => {
        const account = await getMetaAdAccountById(input.accountId);
        if (!account || account.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Conta não encontrada." });
        }

        // Validate token before any API call
        const tokenValid = await validateToken(account.accessToken);
        if (!tokenValid) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Token expirado ou inválido. Reconecte sua conta em Gerenciar Contas.",
          });
        }

        // Include today in sync so "Hoje" filter works with fresh data
        const { startDate, endDate } = getDateRange(input.days, true);

        // Fetch campaigns and adsets together to get performance_goal
        const metaCampaigns = await getCampaigns(account.accountId, account.accessToken);

        // Fetch adsets to determine performance_goal per campaign
        const adsets = await getAdSets(account.accountId, account.accessToken);
        const campaignGoalMap = buildCampaignGoalMap(adsets);

        // Upsert campaigns with optimization_goal and result_label
        // If no adsets found for a campaign (e.g., all paused), fall back to objective mapping
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
        for (const mc of metaCampaigns) {
          const optimizationGoal = campaignGoalMap.get(mc.id)
            ?? objectiveToGoalFallback[mc.objective ?? ""];
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
            optimizationGoal: optimizationGoal,
            resultLabel: resultLabel,
            dailyBudget: mc.daily_budget ? mc.daily_budget : undefined,
            lifetimeBudget: mc.lifetime_budget ? mc.lifetime_budget : undefined,
            startTime: validStartTime,
            stopTime: validStopTime,
          });
        }

        // Mark campaigns that no longer exist in Meta API as ARCHIVED
        const activeMetaIds = metaCampaigns.map((mc) => mc.id);
        await markStaleCampaignsArchived(account.id, activeMetaIds);

        // Fetch insights with purchase_roas and all action fields
        const insights = await getCampaignInsights(account.accountId, account.accessToken, startDate, endDate);

        // Get local campaigns to map metaCampaignId -> id
        const localCampaigns = await getCampaignsByAccountId(account.id);
        const campaignMap = new Map(localCampaigns.map((c) => [c.metaCampaignId, c.id]));

        for (const insight of insights) {
          const localId = campaignMap.get(insight.campaign_id);
          if (!localId) continue;

          const spend = parseFloat(insight.spend ?? "0");

          // Use performance_goal (from adsets) to extract the correct "results" count
          const optimizationGoal = campaignGoalMap.get(insight.campaign_id) ?? "";
          const conversions = optimizationGoal
            ? extractResultsByGoal(insight.actions, optimizationGoal)
            : extractConversions(insight.actions);

          // Conversion value: only purchase-related action_values
          const conversionValue = extractConversionValue(insight.action_values);

          // ROAS: use purchase_roas from Meta API directly (authoritative)
          // Falls back to manual calculation only if not available
          const roas = extractPurchaseRoas(insight.purchase_roas, spend, conversionValue);

          // CPA = spend / results (using the correct result type for the goal)
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
        return { success: true, campaignsSynced: metaCampaigns.length, insightsSynced: insights.length };
      }),
  }),

  // ─── Dashboard ─────────────────────────────────────────────────────────────
  dashboard: router({
    overview: protectedProcedure
      .input(z.object({
        accountId: z.number(),
        days: z.number().min(1).max(90).default(7),
        startDate: z.string().optional(), // ISO date string YYYY-MM-DD, overrides days when provided
        endDate: z.string().optional(),   // ISO date string YYYY-MM-DD
      }))
      .query(async ({ ctx, input }) => {
        const account = await getMetaAdAccountById(input.accountId);
        if (!account || account.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }

        // If explicit startDate/endDate provided, use them; otherwise fall back to days-based range
        const { startDate, endDate } = (input.startDate && input.endDate)
          ? { startDate: input.startDate, endDate: input.endDate }
          : getDateRange(input.days);
        const [metrics, campaigns, unreadAlerts, unreadAnomalies] = await Promise.all([
          getAccountMetricsSummary(input.accountId, startDate, endDate),
          getCampaignPerformanceSummary(input.accountId, startDate, endDate),
          getUnreadAlertsCount(ctx.user.id),
          getUnreadAnomaliesCount(input.accountId),
        ]);

        const totals = metrics.reduce(
          (acc, m) => ({
            spend: acc.spend + Number(m.totalSpend ?? 0),
            impressions: acc.impressions + Number(m.totalImpressions ?? 0),
            clicks: acc.clicks + Number(m.totalClicks ?? 0),
            conversions: acc.conversions + Number(m.totalConversions ?? 0),
            conversionValue: acc.conversionValue + Number(m.totalConversionValue ?? 0),
            reach: acc.reach + Number(m.totalReach ?? 0),
          }),
          { spend: 0, impressions: 0, clicks: 0, conversions: 0, conversionValue: 0, reach: 0 }
        );

        const overallRoas = totals.spend > 0 ? totals.conversionValue / totals.spend : 0;
        const overallCpa = totals.conversions > 0 ? totals.spend / totals.conversions : 0;
        const overallCtr = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;

        // Detect dominant optimization_goal from campaigns (NOT campaign objective)
        // IMPORTANT: Only use campaigns that actually had spend in the selected period
        // so inactive campaigns with old optimization_goal don't pollute the badge
        const activeCampaigns = campaigns.filter((c) => Number((c as any).totalSpend ?? 0) > 0);
        const optimizationGoals = (activeCampaigns.length > 0 ? activeCampaigns : campaigns)
          .map((c) => (c as any).campaignOptimizationGoal as string | undefined)
          .filter((g): g is string => !!g);
        const dominantGoal = detectDominantGoal(optimizationGoals);
        const goalProfile = getPerformanceGoalProfile(dominantGoal);

        return {
          totals: { ...totals, roas: overallRoas, cpa: overallCpa, ctr: overallCtr },
          timeSeries: metrics,
          campaigns,
          unreadAlerts,
          unreadAnomalies,
          dominantGoal,
          goalProfile: {
            label: goalProfile.label,
            emoji: goalProfile.emoji,
            resultLabel: goalProfile.resultLabel,
            primaryMetrics: goalProfile.primaryMetrics,
          },
        };
      }),

    // ─── Demographics (age/gender) ──────────────────────────────────────────
    demographics: protectedProcedure
      .input(z.object({
        accountId: z.number(),
        days: z.number().min(1).max(90).default(30),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      }))
      .query(async ({ ctx, input }) => {
        const account = await getMetaAdAccountById(input.accountId);
        if (!account || account.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
        const { startDate, endDate } = (input.startDate && input.endDate)
          ? { startDate: input.startDate, endDate: input.endDate }
          : getDateRange(input.days);
        const rows = await getDemographicsInsights(account.accountId, account.accessToken, startDate, endDate);
        // Aggregate by age
        const byAge: Record<string, { spend: number; impressions: number; clicks: number; conversions: number; reach: number }> = {};
        for (const r of rows) {
          if (!byAge[r.age]) byAge[r.age] = { spend: 0, impressions: 0, clicks: 0, conversions: 0, reach: 0 };
          byAge[r.age].spend += r.spend;
          byAge[r.age].impressions += r.impressions;
          byAge[r.age].clicks += r.clicks;
          byAge[r.age].conversions += r.conversions;
          byAge[r.age].reach += r.reach;
        }
        // Aggregate by gender
        const byGender: Record<string, { spend: number; impressions: number; clicks: number; conversions: number; reach: number }> = {};
        for (const r of rows) {
          const g = r.gender === "male" ? "Masculino" : r.gender === "female" ? "Feminino" : "Desconhecido";
          if (!byGender[g]) byGender[g] = { spend: 0, impressions: 0, clicks: 0, conversions: 0, reach: 0 };
          byGender[g].spend += r.spend;
          byGender[g].impressions += r.impressions;
          byGender[g].clicks += r.clicks;
          byGender[g].conversions += r.conversions;
          byGender[g].reach += r.reach;
        }
        // Age order
        const ageOrder = ["13-17", "18-24", "25-34", "35-44", "45-54", "55-64", "65+"];
        const ageData = ageOrder
          .filter((a) => byAge[a])
          .map((a) => ({ age: a, ...byAge[a] }));
        const genderData = Object.entries(byGender).map(([gender, data]) => ({ gender, ...data }));
        return { ageData, genderData, raw: rows };
      }),

    // ─── Daily insights (conversions per day) ───────────────────────────────
    dailyInsights: protectedProcedure
      .input(z.object({
        accountId: z.number(),
        days: z.number().min(1).max(90).default(30),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      }))
      .query(async ({ ctx, input }) => {
        const account = await getMetaAdAccountById(input.accountId);
        if (!account || account.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
        const { startDate, endDate } = (input.startDate && input.endDate)
          ? { startDate: input.startDate, endDate: input.endDate }
          : getDateRange(input.days);
        const rows = await getDailyAccountInsights(account.accountId, account.accessToken, startDate, endDate);
        // Also compute weekend vs weekday aggregates
        let weekdayTotals = { days: 0, spend: 0, conversions: 0, conversionValue: 0, impressions: 0, clicks: 0, reach: 0 };
        let weekendTotals = { days: 0, spend: 0, conversions: 0, conversionValue: 0, impressions: 0, clicks: 0, reach: 0 };
        for (const r of rows) {
          const dayOfWeek = new Date(r.date).getDay();
          const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
          const target = isWeekend ? weekendTotals : weekdayTotals;
          target.days++;
          target.spend += r.spend;
          target.conversions += r.conversions;
          target.conversionValue += r.conversionValue;
          target.impressions += r.impressions;
          target.clicks += r.clicks;
          target.reach += r.reach;
        }
        // Compute averages
        const weekdayAvg = weekdayTotals.days > 0 ? {
          spend: weekdayTotals.spend / weekdayTotals.days,
          conversions: weekdayTotals.conversions / weekdayTotals.days,
          conversionValue: weekdayTotals.conversionValue / weekdayTotals.days,
          impressions: weekdayTotals.impressions / weekdayTotals.days,
          clicks: weekdayTotals.clicks / weekdayTotals.days,
          ctr: weekdayTotals.impressions > 0 ? (weekdayTotals.clicks / weekdayTotals.impressions) * 100 : 0,
          cpa: weekdayTotals.conversions > 0 ? weekdayTotals.spend / weekdayTotals.conversions : 0,
        } : null;
        const weekendAvg = weekendTotals.days > 0 ? {
          spend: weekendTotals.spend / weekendTotals.days,
          conversions: weekendTotals.conversions / weekendTotals.days,
          conversionValue: weekendTotals.conversionValue / weekendTotals.days,
          impressions: weekendTotals.impressions / weekendTotals.days,
          clicks: weekendTotals.clicks / weekendTotals.days,
          ctr: weekendTotals.impressions > 0 ? (weekendTotals.clicks / weekendTotals.impressions) * 100 : 0,
          cpa: weekendTotals.conversions > 0 ? weekendTotals.spend / weekendTotals.conversions : 0,
        } : null;
        return {
          daily: rows,
          weekdayTotals,
          weekendTotals,
          weekdayAvg,
          weekendAvg,
        };
      }),
  }),

  // ─── Campaigns ─────────────────────────────────────────────────────────────
  campaigns: router({
    list: protectedProcedure
      .input(z.object({ accountId: z.number() }))
      .query(async ({ ctx, input }) => {
        const account = await getMetaAdAccountById(input.accountId);
        if (!account || account.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });

        // Fetch ACTIVE campaigns directly from Meta API (source of truth)
        try {
          const metaCampaigns = await getCampaigns(account.accountId, account.accessToken);
          const activeMeta = metaCampaigns.filter((c: any) => c.status === "ACTIVE");
          console.log(`[campaigns.list] Meta API returned ${activeMeta.length} ACTIVE campaigns (of ${metaCampaigns.length} total)`);

          // Also get DB campaigns for enrichment (optimizationGoal, resultLabel)
          const dbCampaigns = await getActiveCampaignsForDisplay(input.accountId);
          const dbMap = new Map<string, any>();
          for (const dc of dbCampaigns) {
            if (dc.metaCampaignId) dbMap.set(dc.metaCampaignId, dc);
          }

          // Merge: Meta API is the source of truth for the list, DB enriches with extra fields
          return activeMeta.map((mc: any) => {
            const db = dbMap.get(mc.id);
            return {
              id: db?.id ?? 0,
              metaCampaignId: mc.id,
              name: mc.name,
              status: mc.status,
              objective: mc.objective ?? db?.objective ?? null,
              optimizationGoal: db?.optimizationGoal ?? null,
              resultLabel: db?.resultLabel ?? null,
              dailyBudget: mc.daily_budget ?? db?.dailyBudget ?? null,
              lifetimeBudget: mc.lifetime_budget ?? db?.lifetimeBudget ?? null,
              updatedAt: db?.updatedAt ?? new Date(),
            };
          });
        } catch (metaErr) {
          console.error("[campaigns.list] Meta API failed, falling back to DB:", metaErr);
          const dbFallback = await getActiveCampaignsForDisplay(input.accountId);
          // CRITICAL: Filter ACTIVE only even in DB fallback
          return dbFallback.filter((c: any) => (c.status ?? "").toUpperCase() === "ACTIVE");
        }
      }),

    performance: protectedProcedure
      .input(
        z.object({
          accountId: z.number(),
          days: z.number().min(0).max(90).default(30),
          startDate: z.string().optional(),
          endDate: z.string().optional(),
          includeToday: z.boolean().optional(),
        })
      )
      .query(async ({ ctx, input }) => {
        const account = await getMetaAdAccountById(input.accountId);
        if (!account || account.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
        const { startDate, endDate } = (input.startDate && input.endDate)
          ? { startDate: input.startDate, endDate: input.endDate }
          : getDateRange(input.days, input.includeToday ?? false);
        const perfRows = await getCampaignPerformanceSummary(input.accountId, startDate, endDate);

        // Get DB campaigns for metaId lookup and enrichment
        const allDbCampaigns = await getCampaignsByAccountId(input.accountId);
        const metaIdLookup: Record<number, string> = {};
        const dbByMetaId = new Map<string, any>();
        for (const c of allDbCampaigns) {
          if (c.id && c.metaCampaignId) {
            metaIdLookup[c.id] = c.metaCampaignId;
            dbByMetaId.set(c.metaCampaignId, c);
          }
        }

        // Build map of campaigns that have performance data (keyed by DB id)
        const perfMap = new Map<number, any>();
        const perfByMetaId = new Map<string, any>();
        for (const r of perfRows) {
          const metaCampaignId = (r as any).metaCampaignId || metaIdLookup[r.campaignId] || null;
          const entry = { ...r, metaCampaignId };
          perfMap.set(r.campaignId, entry);
          if (metaCampaignId) perfByMetaId.set(metaCampaignId, entry);
        }

        // Fetch ACTIVE campaigns directly from Meta API (source of truth)
        let metaActiveCampaigns: Array<{ id: string; name: string; status: string; objective?: string }> = [];
        try {
          const allMeta = await getCampaigns(account.accountId, account.accessToken);
          metaActiveCampaigns = allMeta.filter((c: any) => c.status === "ACTIVE");
          console.log(`[campaigns.performance] Meta API: ${metaActiveCampaigns.length} ACTIVE campaigns`);
        } catch (metaErr) {
          console.warn("[campaigns.performance] Meta API fetch failed, using DB only:", metaErr);
        }

        // Build result: start from Meta API active campaigns (source of truth),
        // then add any DB-only campaigns that are ACTIVE but Meta API missed
        const result: any[] = [];
        const seenMetaIds = new Set<string>();

        // First pass: Meta API campaigns (source of truth)
        for (const mc of metaActiveCampaigns) {
          seenMetaIds.add(mc.id);
          const perf = perfByMetaId.get(mc.id);
          const db = dbByMetaId.get(mc.id);
          if (perf) {
            // Has performance data — use it, ensure metaCampaignId is set
            result.push({ ...perf, metaCampaignId: mc.id, campaignName: perf.campaignName || mc.name, campaignStatus: mc.status });
          } else {
            // No performance data yet — zero-metric entry
            result.push({
              campaignId: db?.id ?? 0,
              metaCampaignId: mc.id,
              campaignName: mc.name,
              campaignStatus: mc.status,
              campaignObjective: mc.objective ?? db?.objective ?? null,
              campaignOptimizationGoal: db?.optimizationGoal ?? null,
              campaignResultLabel: db?.resultLabel ?? null,
              totalSpend: 0, totalImpressions: 0, totalClicks: 0, totalConversions: 0,
              totalConversionValue: 0, totalReach: 0, avgRoas: 0, avgCpa: 0,
              avgCtr: 0, avgCpc: 0, avgCpm: 0, avgFrequency: 0,
              totalProfileVisits: 0, totalFollowers: 0,
            });
          }
        }

        // Only show ACTIVE campaigns from Meta API — no paused/archived from DB

        result.sort((a: any, b: any) => Number(b.totalSpend ?? 0) - Number(a.totalSpend ?? 0));
        console.log(`[campaigns.performance] Returning ${result.length} campaigns (${metaActiveCampaigns.length} from Meta API, ${perfRows.length} with metrics)`);
        return result;
      }),
    // Fetch active ads/creatives for a specific campaign (expandable row)
    ads: protectedProcedure
      .input(
        z.object({
          accountId: z.number(),
          metaCampaignId: z.string(),
          days: z.number().min(1).max(90).default(7),
          startDate: z.string().optional(),
          endDate: z.string().optional(),
          includeToday: z.boolean().optional(),
        })
      )
      .query(async ({ ctx, input }) => {
        const account = await getMetaAdAccountById(input.accountId);
        if (!account || account.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });

        const { startDate, endDate } = (input.startDate && input.endDate)
          ? { startDate: input.startDate, endDate: input.endDate }
          : getDateRange(input.days, input.includeToday ?? false);

        // === STEP 1: Resolve the real Meta campaign ID ===
        // Frontend now sends real Meta campaign IDs from the API-based list.
        // Fallback: resolve DB id → Meta id if a short id is received.
        let realMetaCampaignId = input.metaCampaignId;

        if (input.metaCampaignId.length < 12) {
          // Looks like a DB id — resolve to Meta campaign id
          try {
            const localCampaigns = await getCampaignsByAccountId(input.accountId);
            const inputAsNum = parseInt(input.metaCampaignId, 10);
            if (!isNaN(inputAsNum)) {
              const byDbId = localCampaigns.find(c => c.id === inputAsNum);
              if (byDbId?.metaCampaignId) {
                realMetaCampaignId = byDbId.metaCampaignId;
                console.log(`[campaigns.ads] Resolved DB id ${input.metaCampaignId} -> ${realMetaCampaignId}`);
              }
            }
          } catch (resolveErr) {
            console.error(`[campaigns.ads] Resolution error:`, resolveErr);
          }
        }
        console.log(`[campaigns.ads] Using metaCampaignId: ${realMetaCampaignId}`);

        // === STEP 2: Get ads with insights ===
        // Get adsets for goal mapping
        const adsets = await getAdSets(account.accountId, account.accessToken);
        const adsetGoalMap = new Map<string, string>();
        for (const as of adsets) {
          if (as.optimization_goal) {
            adsetGoalMap.set(as.id, as.optimization_goal);
          }
        }

        let allAds: Awaited<ReturnType<typeof getAdsWithInsights>> = [];
        let fetchError: string | null = null;
        try {
          allAds = await getAdsWithInsights(
            account.accountId,
            account.accessToken,
            startDate,
            endDate,
            adsetGoalMap
          );
        } catch (err: any) {
          fetchError = err?.message || String(err);
          console.error(`[campaigns.ads] getAdsWithInsights threw: ${fetchError}`);
        }

        // Filter to only ads belonging to this campaign
        const filtered = allAds.filter((ad) => ad.campaign_id === realMetaCampaignId);
        console.log(`[campaigns.ads] Filtered ${filtered.length} ads for campaign ${realMetaCampaignId} (total active: ${allAds.length})`);

        // If no ads found via account-wide fetch, try campaign-specific endpoint as fallback
        if (filtered.length === 0 && !fetchError) {
          try {
            const campAdsUrl = `https://graph.facebook.com/v21.0/${realMetaCampaignId}/ads?access_token=${account.accessToken}&fields=id,name,adset_id,campaign_id,status,effective_status,creative{id,object_type,thumbnail_url,image_url}&filtering=${encodeURIComponent(JSON.stringify([{field:"effective_status",operator:"IN",value:["ACTIVE"]}]))}&limit=100`;
            const campResp = await fetch(campAdsUrl);
            const campData = await campResp.json() as any;
            if (campData.data?.length > 0) {
              console.log(`[campaigns.ads] Campaign-specific fallback: ${campData.data.length} ads`);
              return campData.data.map((ad: any) => ({
                id: ad.id, name: ad.name,
                adset_id: ad.adset_id || "", adset_name: "",
                campaign_id: ad.campaign_id || realMetaCampaignId, campaign_name: "",
                status: ad.status, effective_status: ad.effective_status || ad.status,
                creative_type: ad.creative?.object_type || "IMAGE",
                creative_id: ad.creative?.id || "",
                thumbnail_url: ad.creative?.image_url || ad.creative?.thumbnail_url || "",
                spend: 0, impressions: 0, clicks: 0, frequency: 0,
                ctr: 0, cpc: 0, cpm: 0, conversions: 0, costPerResult: 0, roas: 0,
              }));
            }
          } catch (campErr) {
            console.error(`[campaigns.ads] Campaign-specific fallback failed:`, campErr);
          }
        }

        return filtered;
      }),

    // ── Ad Sets for a campaign (3-level hierarchy) ───────────────────────
    adsets: protectedProcedure
      .input(
        z.object({
          accountId: z.number(),
          metaCampaignId: z.string(),
          days: z.number().min(1).max(90).default(7),
          startDate: z.string().optional(),
          endDate: z.string().optional(),
          includeToday: z.boolean().optional(),
        })
      )
      .query(async ({ ctx, input }) => {
        const account = await getMetaAdAccountById(input.accountId);
        if (!account || account.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });

        const { startDate, endDate } = (input.startDate && input.endDate)
          ? { startDate: input.startDate, endDate: input.endDate }
          : getDateRange(input.days, input.includeToday ?? false);

        // Resolve Meta campaign ID (same logic as campaigns.ads)
        let realMetaCampaignId = input.metaCampaignId;
        if (input.metaCampaignId.length < 12) {
          try {
            const localCampaigns = await getCampaignsByAccountId(input.accountId);
            const inputAsNum = parseInt(input.metaCampaignId, 10);
            if (!isNaN(inputAsNum)) {
              const byDbId = localCampaigns.find(c => c.id === inputAsNum);
              if (byDbId?.metaCampaignId) realMetaCampaignId = byDbId.metaCampaignId;
            }
          } catch (e) { /* keep original */ }
        }

        // Fetch all adsets with insights for this account
        const allAdsets = await getAdSetsWithInsights(
          account.accountId, account.accessToken, startDate, endDate
        );

        // Filter to only adsets belonging to this campaign
        const filtered = allAdsets.filter(as => as.campaign_id === realMetaCampaignId);
        console.log(`[campaigns.adsets] Filtered ${filtered.length} adsets for campaign ${realMetaCampaignId} (total active: ${allAdsets.length})`);

        // Fallback: fetch campaign-specific adsets if account-wide returned nothing for this campaign
        if (filtered.length === 0 && allAdsets.length > 0) {
          try {
            const campAdsetsUrl = `https://graph.facebook.com/v21.0/${realMetaCampaignId}/adsets?access_token=${account.accessToken}&fields=id,name,campaign_id,status,effective_status,optimization_goal,daily_budget,lifetime_budget,targeting&filtering=${encodeURIComponent(JSON.stringify([{field:"effective_status",operator:"IN",value:["ACTIVE"]}]))}&limit=100`;
            const resp = await fetch(campAdsetsUrl);
            const data = await resp.json() as any;
            if (data.data?.length > 0) {
              console.log(`[campaigns.adsets] Campaign-specific fallback: ${data.data.length} adsets`);
              return data.data.map((as: any) => ({
                ...as, campaign_name: "", spend: 0, impressions: 0, clicks: 0,
                reach: 0, frequency: 0, ctr: 0, cpc: 0, cpm: 0,
                conversions: 0, costPerResult: 0, roas: 0,
              }));
            }
          } catch (e) {
            console.error("[campaigns.adsets] Campaign-specific fallback failed:", e);
          }
        }

        return filtered;
      }),

    // Diagnostic: raw Meta API call without error swallowing
    adsDebug: protectedProcedure
      .input(z.object({ accountId: z.number() }))
      .query(async ({ ctx, input }) => {
        const account = await getMetaAdAccountById(input.accountId);
        if (!account || account.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
        
        // Raw fetch to Meta API - no try/catch so we see actual errors
        const metaAccountId = account.accountId;
        const url = `https://graph.facebook.com/v21.0/act_${metaAccountId}/ads?access_token=${account.accessToken}&fields=id,name,campaign_id,status,effective_status&limit=10`;
        const response = await fetch(url);
        const rawData = await response.json();
        
        // Also test campaigns endpoint
        const campUrl = `https://graph.facebook.com/v21.0/act_${metaAccountId}/campaigns?access_token=${account.accessToken}&fields=id,name,status&limit=5`;
        const campResponse = await fetch(campUrl);
        const campData = await campResponse.json();
        
        return {
          metaAccountId,
          adsResponse: rawData,
          campaignsResponse: campData,
          tokenPrefix: account.accessToken?.substring(0, 20) + "...",
        };
      }),
  }),

  // ─── Anomalies ─────────────────────────────────────────────────────────────
  anomalies: router({
    list: protectedProcedure
      .input(z.object({ accountId: z.number() }))
      .query(async ({ ctx, input }) => {
        const account = await getMetaAdAccountById(input.accountId);
        if (!account || account.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
        return getAnomaliesByAccountId(input.accountId);
      }),

    markRead: protectedProcedure
      .input(z.object({ anomalyId: z.number() }))
      .mutation(async ({ input }) => {
        await markAnomalyRead(input.anomalyId);
        return { success: true };
      }),

    resolve: protectedProcedure
      .input(z.object({ anomalyId: z.number() }))
      .mutation(async ({ input }) => {
        await markAnomalyResolved(input.anomalyId);
        return { success: true };
      }),

    runDetection: protectedProcedure
      .input(z.object({ accountId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const account = await getMetaAdAccountById(input.accountId);
        if (!account || account.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });

        const today = new Date().toISOString().split("T")[0];
        const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
        const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];

        const [recentMetrics, prevMetrics] = await Promise.all([
          getAccountMetricsSummary(input.accountId, yesterday, today),
          getAccountMetricsSummary(input.accountId, sevenDaysAgo, yesterday),
        ]);

        if (recentMetrics.length === 0 || prevMetrics.length === 0) {
          return { detected: 0 };
        }

        const recent = recentMetrics[recentMetrics.length - 1];
        const prev = prevMetrics.reduce(
          (acc, m) => ({
            roas: acc.roas + Number(m.avgRoas ?? 0),
            cpa: acc.cpa + Number(m.avgCpa ?? 0),
            ctr: acc.ctr + Number(m.avgCtr ?? 0),
            spend: acc.spend + Number(m.totalSpend ?? 0),
            frequency: acc.frequency + 0,
          }),
          { roas: 0, cpa: 0, ctr: 0, spend: 0, frequency: 0 }
        );
        const n = prevMetrics.length;
        const avgPrev = {
          roas: prev.roas / n,
          cpa: prev.cpa / n,
          ctr: prev.ctr / n,
          spend: prev.spend / n,
          frequency: 0,
        };

        const detected = detectAnomalies(
          {
            roas: Number(recent.avgRoas),
            cpa: Number(recent.avgCpa),
            ctr: Number(recent.avgCtr),
            spend: Number(recent.totalSpend),
            frequency: 0,
          },
          {
            roas: Number(avgPrev.roas),
            cpa: Number(avgPrev.cpa),
            ctr: Number(avgPrev.ctr),
            spend: Number(avgPrev.spend),
          },
          {
            roas: Number(avgPrev.roas),
            cpa: Number(avgPrev.cpa),
            ctr: Number(avgPrev.ctr),
            spend: Number(avgPrev.spend),
          },
          {
            roas: Number(avgPrev.roas),
            cpa: Number(avgPrev.cpa),
            ctr: Number(avgPrev.ctr),
            spend: Number(avgPrev.spend),
          }
        );

        for (const anomaly of detected) {
          await createAlertIfNotExists({
            userId: ctx.user.id,
            accountId: input.accountId,
            title: anomaly.title,
            message: anomaly.description,
            type: "ANOMALY",
            severity: "WARNING",
          });
          // Notificar o dono da conta para toda anomalia detectada (sem filtro por prioridade)
          await notifyOwner({
            title: `⚠️ Anomalia detectada: ${anomaly.title}`,
            content: anomaly.description,
          });
        }

        return { detected: detected.length };
      }),
  }),

  // ─── AI Suggestions ────────────────────────────────────────────────────────
  suggestions: router({
    list: protectedProcedure
      .input(z.object({ accountId: z.number() }))
      .query(async ({ ctx, input }) => {
        const account = await getMetaAdAccountById(input.accountId);
        if (!account || account.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
        return getSuggestionsByAccountId(input.accountId);
      }),
    history: protectedProcedure
      .input(z.object({ accountId: z.number() }))
      .query(async ({ ctx, input }) => {
        const account = await getMetaAdAccountById(input.accountId);
        if (!account || account.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
        return getSuggestionsHistory(input.accountId);
      }),
    generate: protectedProcedure
      .input(z.object({ accountId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const account = await getMetaAdAccountById(input.accountId);
        if (!account || account.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
        const { startDate, endDate } = getDateRange(30);
        const campaignData = await getCampaignPerformanceSummary(input.accountId, startDate, endDate);
        const historyRaw = await getSuggestionsHistory(input.accountId);
        const rejectedFeedback = historyRaw
          .filter((s) => s.status === "rejected" && s.rejectionReason)
          .slice(0, 10)
          .map((s) => ({ title: s.title, rejectionReason: s.rejectionReason }));
        const mapped = campaignData.map((c) => ({
          campaignId: c.campaignId,
          campaignName: c.campaignName ?? "Campanha",
          campaignStatus: c.campaignStatus ?? "ACTIVE",
          totalSpend: Number(c.totalSpend ?? 0),
          totalImpressions: Number(c.totalImpressions ?? 0),
          totalClicks: Number(c.totalClicks ?? 0),
          totalConversions: Number(c.totalConversions ?? 0),
          totalConversionValue: Number(c.totalConversionValue ?? 0),
          avgRoas: Number(c.avgRoas ?? 0),
          avgCpa: Number(c.avgCpa ?? 0),
          avgCtr: Number(c.avgCtr ?? 0),
          optimizationGoal: c.campaignOptimizationGoal ?? undefined,
          resultLabel: c.campaignResultLabel ?? undefined,
        }));
        // Fetch 3-level data for richer AI analysis
        let adsetInsights: Awaited<ReturnType<typeof getAdSetsWithInsights>> = [];
        let adInsights: Awaited<ReturnType<typeof getAdsWithInsights>> = [];
        try {
          adsetInsights = await getAdSetsWithInsights(account.accountId, account.accessToken, startDate, endDate);
          // Build adset->goal map for correct result extraction at ad level
          const adsetGoalMap = new Map(adsetInsights.map(a => [a.id, a.optimization_goal]));
          adInsights = await getAdsWithInsights(account.accountId, account.accessToken, startDate, endDate, adsetGoalMap);
        } catch (e) {
          console.error("[suggestions.generate] 3-level fetch failed, falling back to campaign-only:", e);
        }
        const result = await generateAiSuggestions(input.accountId, ctx.user.id, mapped, rejectedFeedback, adsetInsights, adInsights);
        return result;
      }),
    updateStatus: protectedProcedure
      .input(z.object({
        suggestionId: z.number(),
        status: z.enum(["applied", "rejected", "pending"]),
        rejectionReason: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const metricsSnapshot = input.status === "applied" ? { snapshotAt: Date.now() } : undefined;
        await updateSuggestionStatus(input.suggestionId, input.status, {
          rejectionReason: input.rejectionReason,
          metricsSnapshot,
        });
        return { success: true };
      }),
    dismiss: protectedProcedure
      .input(z.object({ suggestionId: z.number() }))
      .mutation(async ({ input }) => {
        await updateSuggestionStatus(input.suggestionId, "rejected");
        return { success: true };
      }),
    markApplied: protectedProcedure
      .input(z.object({ suggestionId: z.number() }))
      .mutation(async ({ input }) => {
        await updateSuggestionStatus(input.suggestionId, "applied");
        return { success: true };
      }),
  }),

  // ─── Alerts ───────────────────────────────────────────────────────────────────────────
  alerts: router({
    // Filter by accountId so each account only sees its own alerts
    list: protectedProcedure
      .input(z.object({ accountId: z.number() }))
      .query(async ({ ctx, input }) => {
        const account = await getMetaAdAccountById(input.accountId);
        if (!account || account.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
        return getAlertsByAccountId(ctx.user.id, input.accountId);
      }),

    // unreadCount filtered by account for sidebar badge
    unreadCount: protectedProcedure
      .input(z.object({ accountId: z.number().optional() }))
      .query(async ({ ctx, input }) => {
        if (input.accountId) {
          return getUnreadAlertsCountByAccount(ctx.user.id, input.accountId);
        }
        return getUnreadAlertsCount(ctx.user.id);
      }),

    markRead: protectedProcedure
      .input(z.object({ alertId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await markAlertRead(input.alertId, ctx.user.id);
        return { success: true };
      }),

    markAllRead: protectedProcedure
      .input(z.object({ accountId: z.number().optional() }))
      .mutation(async ({ ctx, input }) => {
        if (input.accountId) {
          // Only delete alerts for this specific account
          await markAllAlertsReadByAccount(ctx.user.id, input.accountId);
        } else {
          await markAllAlertsRead(ctx.user.id);
        }
        return { success: true };
      }),
  }),// ─── Scheduled Reports ─────────────────────────────────────────────────────
  reports: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return getScheduledReportsByUserId(ctx.user.id);
    }),

     create: protectedProcedure
      .input(
        z.object({
          accountId: z.number(),
          frequency: z.enum(["DAILY", "WEEKLY"]),
          scheduleHour: z.number().min(0).max(23).default(8),
          scheduleMinute: z.number().min(0).max(59).default(0),
          scheduleDay: z.number().min(0).max(6).default(1), // 0=dom, 1=seg, ..., 6=sab
        })
      )
      .mutation(async ({ ctx, input }) => {
        const account = await getMetaAdAccountById(input.accountId);
        if (!account || account.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
        const h = input.scheduleHour;
        const m = input.scheduleMinute;
        const d = input.scheduleDay ?? 1;
        const nextRun = computeNextRun(input.frequency, h, m, d);
        await createScheduledReport({
          userId: ctx.user.id,
          accountId: input.accountId,
          frequency: input.frequency,
          nextRunAt: nextRun,
          scheduleHour: h,
          scheduleMinute: m,
          scheduleDay: d,
        });
        return { success: true };
      }),

    toggle: protectedProcedure
      .input(z.object({ reportId: z.number(), isActive: z.boolean() }))
      .mutation(async ({ input }) => {
        await updateScheduledReport(input.reportId, { isActive: input.isActive });
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ reportId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await deleteScheduledReport(input.reportId, ctx.user.id);
        return { success: true };
      }),

    runNow: protectedProcedure
      .input(z.object({ accountId: z.number(), frequency: z.enum(["DAILY", "WEEKLY"]) }))
      .mutation(async ({ ctx, input }) => {
        const account = await getMetaAdAccountById(input.accountId);
        if (!account || account.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });

        // Date range: DAILY = yesterday, WEEKLY = last 7 days ending yesterday
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const endDate = yesterday.toISOString().split("T")[0]!;

        const startDateObj = new Date(yesterday);
        if (input.frequency === "WEEKLY") {
          startDateObj.setDate(startDateObj.getDate() - 6);
        }
        const startDate = startDateObj.toISOString().split("T")[0]!;

        // Get campaign-level data for the period
        const campaignData = await getCampaignPerformanceSummary(input.accountId, startDate, endDate);

        const campaigns: CampaignReportData[] = campaignData.map((c) => ({
          campaignId: c.campaignId,
          campaignName: c.campaignName ?? "Campanha",
          campaignObjective: c.campaignObjective ?? "OUTCOME_SALES",
          campaignStatus: c.campaignStatus ?? "ACTIVE",
          totalSpend: Number(c.totalSpend ?? 0),
          totalImpressions: Number(c.totalImpressions ?? 0),
          totalClicks: Number(c.totalClicks ?? 0),
          totalConversions: Number(c.totalConversions ?? 0),
          totalConversionValue: Number(c.totalConversionValue ?? 0),
          totalReach: Number(c.totalReach ?? 0),
          avgRoas: Number(c.avgRoas ?? 0),
          avgCpa: Number(c.avgCpa ?? 0),
          avgCtr: Number(c.avgCtr ?? 0),
          avgCpc: Number(c.avgCpc ?? 0),
          avgCpm: Number(c.avgCpm ?? 0),
          avgFrequency: Number(c.avgFrequency ?? 0),
        }));

        // Format dates for display
        const fmt = (d: string) => {
          const [y, m, day] = d.split("-");
          return `${day}/${m}/${y}`;
        };

        const report = await generateAgencyReport(
          account.accountName ?? "Conta",
          input.frequency,
          campaigns,
          fmt(startDate),
          fmt(endDate)
        );

        await notifyOwner({
          title: `📊 Relatório ${input.frequency === "DAILY" ? "Diário" : "Semanal"} — ${account.accountName}`,
          content: report.substring(0, 500) + (report.length > 500 ? "..." : ""),
        });

        return { success: true, report };
      }),

    // ─── Public endpoint for scheduled daily report ─────────────────────────
    generateDaily: publicProcedure.query(async () => {
      const accounts = await getMetaAdAccountsByUserId(1);
      const activeAccounts = accounts.filter((a: any) => a.isActive);

      if (activeAccounts.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "No active accounts found" });
      }

      const now = new Date();
      const spNow = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
      const yesterday = new Date(spNow);
      yesterday.setDate(yesterday.getDate() - 1);
      const dateStr = yesterday.toISOString().split("T")[0];
      const fmtDate = dateStr.split("-").reverse().join("/");

      const accountResults: any[] = [];
      let totalSpend = 0, totalConversions = 0, totalConversionValue = 0;
      let totalImpressions = 0, totalClicks = 0, totalReach = 0;

      for (const acct of activeAccounts) {
        try {
          const metrics = await getAccountMetricsSummary(acct.id, dateStr, dateStr);
          const dayMetrics = metrics[0] || null;
          const spend = Number(dayMetrics?.totalSpend ?? 0);
          const conversions = Number(dayMetrics?.totalConversions ?? 0);
          const conversionValue = Number(dayMetrics?.totalConversionValue ?? 0);
          const impressions = Number(dayMetrics?.totalImpressions ?? 0);
          const clicks = Number(dayMetrics?.totalClicks ?? 0);
          const reach = Number(dayMetrics?.totalReach ?? 0);
          const roas = spend > 0 ? conversionValue / spend : 0;
          const cpa = conversions > 0 ? spend / conversions : 0;
          const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
          const cpc = clicks > 0 ? spend / clicks : 0;

          totalSpend += spend;
          totalConversions += conversions;
          totalConversionValue += conversionValue;
          totalImpressions += impressions;
          totalClicks += clicks;
          totalReach += reach;

          accountResults.push({
            name: acct.accountName ?? acct.accountId,
            spend, conversions, conversionValue, impressions, clicks, reach,
            roas, cpa, ctr, cpc, hasData: spend > 0,
          });
        } catch {
          accountResults.push({
            name: acct.accountName ?? acct.accountId,
            spend: 0, conversions: 0, conversionValue: 0, impressions: 0,
            clicks: 0, reach: 0, roas: 0, cpa: 0, ctr: 0, cpc: 0,
            hasData: false, error: true,
          });
        }
      }

      const accountsWithData = accountResults.filter((a: any) => a.hasData);
      if (accountsWithData.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "No data available for yesterday" });
      }

      const totalRoas = totalSpend > 0 ? totalConversionValue / totalSpend : 0;
      const totalCpa = totalConversions > 0 ? totalSpend / totalConversions : 0;
      const totalCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
      const totalCpc = totalClicks > 0 ? totalSpend / totalClicks : 0;

      const fmt = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const fmtInt = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });

      const subject = `[SELVA] Report Diário Meta Ads — ${fmtDate}`;

      const accountRows = accountsWithData.map((a: any) =>
        `<tr>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;font-weight:500;">${a.name}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;">R$ ${fmt(a.spend)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;">${fmtInt(a.conversions)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;">R$ ${fmt(a.conversionValue)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;">${a.roas.toFixed(2)}x</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;">R$ ${fmt(a.cpa)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;">${a.ctr.toFixed(2)}%</td>
        </tr>`
      ).join("");

      const html = `<div style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto;background:#fff;">
        <div style="background:#1a1a1a;padding:20px 30px;text-align:center;">
          <h1 style="color:#f5c6d0;margin:0;font-size:24px;">SELVA AGENCY</h1>
          <p style="color:#888;margin:5px 0 0;font-size:14px;">Report Diário Meta Ads — ${fmtDate}</p>
        </div>
        <div style="padding:30px;">
          <h2 style="color:#333;margin-top:0;">KPIs Consolidados</h2>
          <table style="width:100%;border-collapse:collapse;margin:15px 0;">
            <tr>
              <td style="padding:15px;background:#f8f8f8;text-align:center;border-radius:8px;">
                <div style="font-size:24px;font-weight:bold;color:#333;">R$ ${fmt(totalSpend)}</div>
                <div style="font-size:12px;color:#888;margin-top:4px;">Investimento</div>
              </td>
              <td style="padding:15px;background:#f8f8f8;text-align:center;border-radius:8px;">
                <div style="font-size:24px;font-weight:bold;color:#333;">${fmtInt(totalConversions)}</div>
                <div style="font-size:12px;color:#888;margin-top:4px;">Conversões</div>
              </td>
              <td style="padding:15px;background:#f8f8f8;text-align:center;border-radius:8px;">
                <div style="font-size:24px;font-weight:bold;color:#333;">R$ ${fmt(totalConversionValue)}</div>
                <div style="font-size:12px;color:#888;margin-top:4px;">Receita</div>
              </td>
              <td style="padding:15px;background:#f8f8f8;text-align:center;border-radius:8px;">
                <div style="font-size:24px;font-weight:bold;color:${totalRoas >= 1 ? '#22c55e' : '#ef4444'};">${totalRoas.toFixed(2)}x</div>
                <div style="font-size:12px;color:#888;margin-top:4px;">ROAS</div>
              </td>
            </tr>
          </table>
          <h2 style="color:#333;">Performance por Conta</h2>
          <table style="width:100%;border-collapse:collapse;font-size:13px;">
            <thead><tr style="background:#f5c6d0;">
              <th style="padding:10px 12px;text-align:left;">Conta</th>
              <th style="padding:10px 12px;text-align:right;">Investimento</th>
              <th style="padding:10px 12px;text-align:right;">Conversões</th>
              <th style="padding:10px 12px;text-align:right;">Receita</th>
              <th style="padding:10px 12px;text-align:right;">ROAS</th>
              <th style="padding:10px 12px;text-align:right;">CPA</th>
              <th style="padding:10px 12px;text-align:right;">CTR</th>
            </tr></thead>
            <tbody>${accountRows}</tbody>
          </table>
          <p style="color:#999;font-size:11px;margin-top:30px;border-top:1px solid #eee;padding-top:15px;">
            Report automático — SELVA Agency Dashboard<br>
            <a href="https://dashboardselva.manus.space" style="color:#f5c6d0;">Acessar Dashboard</a> |
            ${accountsWithData.length} de ${activeAccounts.length} contas com dados
          </p>
        </div>
      </div>`;

      const plainText = "SELVA AGENCY - Report Diário Meta Ads - " + fmtDate + "\n\n" +
        "Investimento: R$ " + fmt(totalSpend) + " | Conversões: " + fmtInt(totalConversions) +
        " | Receita: R$ " + fmt(totalConversionValue) + " | ROAS: " + totalRoas.toFixed(2) + "x\n\n" +
        "Por Conta:\n" + accountsWithData.map((a: any) =>
          a.name + ": R$ " + fmt(a.spend) + " invest | " + fmtInt(a.conversions) + " conv | ROAS " + a.roas.toFixed(2) + "x"
        ).join("\n");

      return { subject, html, plainText, date: dateStr, accountCount: activeAccounts.length, accountsWithData: accountsWithData.length };
    }),
  }),
  dashboardBuilder: router({
    // Listar relatórios do usuário
    list: protectedProcedure.query(async ({ ctx }) => {
      return getDashboardReportsByUserId(ctx.user.id);
    }),

    // Buscar relatório por ID
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const report = await getDashboardReportById(input.id, ctx.user.id);
        if (!report) throw new TRPCError({ code: "NOT_FOUND", message: "Relatório não encontrado" });
        return report;
      }),

    // Gerar novo relatório (recebe URLs de imagens já enviadas ao S3)
    generate: protectedProcedure
      .input(
        z.object({
          clientName: z.string().min(1).max(255),
          weeklyContext: z.string().min(1),
          mode: z.enum(["SINGLE", "COMPARATIVE"]),
          imageUrls: z.array(z.string().url()).min(0).max(2),
        })
      )
      .mutation(async ({ ctx, input }) => {
        // Criar registro inicial
        const insertResult = await createDashboardReport({
          userId: ctx.user.id,
          clientName: input.clientName,
          weeklyContext: input.weeklyContext,
          mode: input.mode,
          imageUrls: JSON.stringify(input.imageUrls),
          status: "PROCESSING",
        });
        // mysql2 + drizzle retorna [ResultSetHeader, FieldPacket[]] — insertId está no primeiro elemento
        const reportId = ((insertResult as any)[0]?.insertId ?? (insertResult as any).insertId) as number;
        if (!reportId) {
          throw new Error("Falha ao criar registro no banco de dados");
        }

        try {
          // Analisar via LLM
          const reportData = await analyzeCampaignData(
            input.clientName,
            input.weeklyContext,
            input.mode,
            input.imageUrls
          );

          // Gerar HTML e fazer upload
          const html = generateReportHtml(reportData);
          const pdfUrl = await generateAndUploadPdf(reportId, String(ctx.user.id), html);

          // Salvar resultado
          await updateDashboardReport(reportId, {
            platform: reportData.platform,
            reportJson: JSON.stringify(reportData),
            pdfUrl,
            status: "DONE",
          });

          return { id: reportId, status: "DONE", pdfUrl, reportData };
        } catch (err: any) {
          await updateDashboardReport(reportId, {
            status: "ERROR",
            errorMessage: err?.message ?? "Erro desconhecido",
          });
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: err?.message ?? "Erro ao gerar relatório",
          });
        }
      }),

    // Deletar relatório
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await deleteDashboardReport(input.id, ctx.user.id);
        return { success: true };
      }),
  }),

  // ─── Google Ads ──────────────────────────────────────────────────────────
  googleAds: router({
    // Check if Google Ads is configured
    isConfigured: publicProcedure.query(() => {
      return { configured: isGoogleAdsConfigured() };
    }),

    // List Google Ads accounts for current user
    accounts: protectedProcedure.query(async ({ ctx }) => {
      return getGoogleAdAccountsByUserId(ctx.user.id);
    }),

    // Connect a new Google Ads account
    connectAccount: protectedProcedure
      .input(z.object({
        customerId: z.string().min(3),
        accountName: z.string().optional(),
        refreshToken: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const config = getGoogleAdsConfig();
        if (!config) throw new Error("Google Ads API not configured. Set environment variables.");
        // Use per-account refreshToken if provided, otherwise fall back to global
        const token = input.refreshToken || config.refreshToken;
        if (!token) throw new Error("No refresh token available");

        const id = await createGoogleAdAccount({
          userId: ctx.user.id,
          customerId: input.customerId.replace(/-/g, ""),
          accountName: input.accountName ?? `Google Ads ${input.customerId}`,
          refreshToken: token,
        });
        return { success: true, id };
      }),

    // Disconnect (soft-delete) a Google Ads account
    disconnectAccount: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteGoogleAdAccount(input.id);
        return { success: true };
      }),

    // Account-level summary
    summary: protectedProcedure
      .input(z.object({
        accountId: z.number(),
        days: z.number().min(1).max(90).default(7),
      }))
      .query(async ({ input }) => {
        const account = await getGoogleAdAccountById(input.accountId);
        if (!account) throw new Error("Google Ads account not found");
        const config = getGoogleAdsConfig();
        if (!config) throw new Error("Google Ads API not configured");
        // Override with per-account token
        const accountConfig = { ...config, refreshToken: account.refreshToken };
        const { startDate, endDate } = getDateRange(input.days);
        return getGoogleAdsAccountSummary(accountConfig, account.customerId, startDate, endDate);
      }),

    // Campaigns with metrics
    campaigns: protectedProcedure
      .input(z.object({
        accountId: z.number(),
        days: z.number().min(1).max(90).default(7),
        activeOnly: z.boolean().default(true),
      }))
      .query(async ({ input }) => {
        const account = await getGoogleAdAccountById(input.accountId);
        if (!account) throw new Error("Google Ads account not found");
        const config = getGoogleAdsConfig();
        if (!config) throw new Error("Google Ads API not configured");
        const accountConfig = { ...config, refreshToken: account.refreshToken };
        const { startDate, endDate } = getDateRange(input.days);
        return getGoogleAdsCampaigns(accountConfig, account.customerId, startDate, endDate, input.activeOnly);
      }),

    // Ad Groups for a campaign
    adGroups: protectedProcedure
      .input(z.object({
        accountId: z.number(),
        campaignId: z.string(),
        days: z.number().min(1).max(90).default(7),
      }))
      .query(async ({ input }) => {
        const account = await getGoogleAdAccountById(input.accountId);
        if (!account) throw new Error("Google Ads account not found");
        const config = getGoogleAdsConfig();
        if (!config) throw new Error("Google Ads API not configured");
        const accountConfig = { ...config, refreshToken: account.refreshToken };
        const { startDate, endDate } = getDateRange(input.days);
        return getGoogleAdsAdGroups(accountConfig, account.customerId, input.campaignId, startDate, endDate);
      }),

    // Ads for a campaign
    ads: protectedProcedure
      .input(z.object({
        accountId: z.number(),
        campaignId: z.string(),
        days: z.number().min(1).max(90).default(7),
      }))
      .query(async ({ input }) => {
        const account = await getGoogleAdAccountById(input.accountId);
        if (!account) throw new Error("Google Ads account not found");
        const config = getGoogleAdsConfig();
        if (!config) throw new Error("Google Ads API not configured");
        const accountConfig = { ...config, refreshToken: account.refreshToken };
        const { startDate, endDate } = getDateRange(input.days);
        return getGoogleAdsAds(accountConfig, account.customerId, input.campaignId, startDate, endDate);
      }),

    // Diagnostic: check Google Ads API connectivity
    diagnose: protectedProcedure
      .query(async () => {
        const config = getGoogleAdsConfig();
        if (!config) return { status: "NOT_CONFIGURED", message: "Google Ads API env vars missing" };
        const accounts = await getAllActiveGoogleAdAccounts();
        if (accounts.length === 0) return { status: "NO_ACCOUNTS", message: "No Google Ads accounts connected" };
        const results = [];
        for (const acct of accounts) {
          try {
            const accountConfig = { ...config, refreshToken: acct.refreshToken };
            const { startDate, endDate } = getDateRange(1);
            const summary = await getGoogleAdsAccountSummary(accountConfig, acct.customerId, startDate, endDate);
            results.push({
              id: acct.id,
              customerId: acct.customerId,
              name: acct.accountName,
              status: "OK",
              activeCampaigns: summary.activeCampaigns,
              spend: summary.spend,
            });
          } catch (err: any) {
            results.push({
              id: acct.id,
              customerId: acct.customerId,
              name: acct.accountName,
              status: "ERROR",
              error: err?.message ?? String(err),
            });
          }
        }
        return { status: "OK", accounts: results };
      }),
  }),

  // ─── Sync Management ─────────────────────────────────────────────────────
  sync: router({
    // Manual sync for a single account
    triggerSync: protectedProcedure
      .input(z.object({ accountId: z.number() }))
      .mutation(async ({ input }) => {
        const account = await getMetaAdAccountById(input.accountId);
        if (!account) throw new Error("Account not found");
        console.log(`[ManualSync] Triggered for account ${account.accountName} (${account.accountId})`);
        try {
          await syncAccount({
            id: account.id,
            accountId: account.accountId,
            accessToken: account.accessToken,
            accountName: account.accountName,
            userId: account.userId,
          });
          return { success: true, message: `Sync completed for ${account.accountName}` };
        } catch (err: any) {
          return { success: false, message: err?.message ?? String(err) };
        }
      }),

    // Diagnostic: check Meta API health for all accounts
    diagnose: protectedProcedure
      .query(async () => {
        const { getAllActiveMetaAdAccounts } = await import("./db");
        const accounts = await getAllActiveMetaAdAccounts();
        const results = [];
        for (const acct of accounts) {
          try {
            const res = await fetch(
              `https://graph.facebook.com/v21.0/act_${acct.accountId}?fields=name,account_status&access_token=${acct.accessToken}`
            );
            const data = await res.json() as any;
            if (data.error) {
              results.push({
                id: acct.id,
                name: acct.accountName,
                accountId: acct.accountId,
                status: "ERROR",
                error: data.error.message,
                errorCode: data.error.code,
              });
            } else {
              results.push({
                id: acct.id,
                name: acct.accountName ?? data.name,
                accountId: acct.accountId,
                status: "OK",
                accountStatus: data.account_status,
              });
            }
          } catch (err: any) {
            results.push({
              id: acct.id,
              name: acct.accountName,
              accountId: acct.accountId,
              status: "FETCH_ERROR",
              error: err?.message ?? String(err),
            });
          }
        }
        return results;
      }),
  }),

});
export type AppRouter = typeof appRouter;

