import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import {
  applySuggestion,
  createAlert,
  createMetaAdAccount,
  createScheduledReport,
  deleteMetaAdAccount,
  deleteScheduledReport,
  dismissSuggestion,
  getAccountMetricsSummary,
  getAnomaliesByAccountId,
  getAlertsByUserId,
  getCampaignPerformanceSummary,
  getCampaignsByAccountId,
  getMetaAdAccountById,
  getMetaAdAccountsByUserId,
  getScheduledReportsByUserId,
  getSuggestionsByAccountId,
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
  getResultLabel,
  calculateRoas,
  calculateCpa,
} from "./metaAdsService";
import { detectDominantGoal, getPerformanceGoalProfile } from "./campaignObjectives";
import { generateAiSuggestions, generateAgencyReport, detectAnomalies } from "./analysisService";
import type { CampaignReportData } from "./analysisService";
import { notifyOwner } from "./_core/notification";

// ─── Helper: date range ───────────────────────────────────────────────────────

function getDateRange(days: number) {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);
  return {
    startDate: start.toISOString().split("T")[0],
    endDate: end.toISOString().split("T")[0],
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
          await createAlert({
            userId: ctx.user.id,
            accountId: input.accountId,
            type: "BUDGET_WARNING",
            severity: billing.remainingBalance < 50 ? "CRITICAL" : "WARNING",
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

        const { startDate, endDate } = getDateRange(input.days);

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
            startTime: mc.start_time ? new Date(mc.start_time) : undefined,
            stopTime: mc.stop_time ? new Date(mc.stop_time) : undefined,
          });
        }

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
        return { success: true, campaignsSynced: metaCampaigns.length, insightsSynced: insights.length };
      }),
  }),

  // ─── Dashboard ─────────────────────────────────────────────────────────────
  dashboard: router({
    overview: protectedProcedure
      .input(z.object({ accountId: z.number(), days: z.number().min(1).max(90).default(30) }))
      .query(async ({ ctx, input }) => {
        const account = await getMetaAdAccountById(input.accountId);
        if (!account || account.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }

        const { startDate, endDate } = getDateRange(input.days);
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
  }),

  // ─── Campaigns ─────────────────────────────────────────────────────────────
  campaigns: router({
    list: protectedProcedure
      .input(z.object({ accountId: z.number() }))
      .query(async ({ ctx, input }) => {
        const account = await getMetaAdAccountById(input.accountId);
        if (!account || account.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
        return getCampaignsByAccountId(input.accountId);
      }),

    performance: protectedProcedure
      .input(
        z.object({
          accountId: z.number(),
          days: z.number().min(1).max(90).default(30),
        })
      )
      .query(async ({ ctx, input }) => {
        const account = await getMetaAdAccountById(input.accountId);
        if (!account || account.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
        const { startDate, endDate } = getDateRange(input.days);
        return getCampaignPerformanceSummary(input.accountId, startDate, endDate);
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
            roas: String(recent.avgRoas),
            cpa: String(recent.avgCpa),
            ctr: String(recent.avgCtr),
            spend: String(recent.totalSpend),
            frequency: "0",
          } as any,
          {
            roas: String(avgPrev.roas),
            cpa: String(avgPrev.cpa),
            ctr: String(avgPrev.ctr),
            spend: String(avgPrev.spend),
            frequency: "0",
          } as any
        );

        for (const anomaly of detected) {
          await createAlert({
            userId: ctx.user.id,
            accountId: input.accountId,
            title: anomaly.title,
            message: anomaly.description,
            type: "ANOMALY",
            severity: anomaly.severity === "CRITICAL" || anomaly.severity === "HIGH" ? "CRITICAL" : "WARNING",
          });

          if (anomaly.severity === "CRITICAL") {
            await notifyOwner({
              title: `🚨 Anomalia Crítica: ${anomaly.title}`,
              content: anomaly.description,
            });
          }
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

    generate: protectedProcedure
      .input(z.object({ accountId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const account = await getMetaAdAccountById(input.accountId);
        if (!account || account.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });

        const { startDate, endDate } = getDateRange(30);
        const campaignData = await getCampaignPerformanceSummary(input.accountId, startDate, endDate);

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
        }));

        await generateAiSuggestions(input.accountId, ctx.user.id, mapped);
        return { success: true };
      }),

    dismiss: protectedProcedure
      .input(z.object({ suggestionId: z.number() }))
      .mutation(async ({ input }) => {
        await dismissSuggestion(input.suggestionId);
        return { success: true };
      }),

    markApplied: protectedProcedure
      .input(z.object({ suggestionId: z.number() }))
      .mutation(async ({ input }) => {
        await applySuggestion(input.suggestionId);
        return { success: true };
      }),
  }),

  // ─── Alerts ────────────────────────────────────────────────────────────────
  alerts: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return getAlertsByUserId(ctx.user.id);
    }),

    unreadCount: protectedProcedure.query(async ({ ctx }) => {
      return getUnreadAlertsCount(ctx.user.id);
    }),

    markRead: protectedProcedure
      .input(z.object({ alertId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await markAlertRead(input.alertId, ctx.user.id);
        return { success: true };
      }),

    markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
      await markAllAlertsRead(ctx.user.id);
      return { success: true };
    }),
  }),

  // ─── Scheduled Reports ─────────────────────────────────────────────────────
  reports: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return getScheduledReportsByUserId(ctx.user.id);
    }),

    create: protectedProcedure
      .input(
        z.object({
          accountId: z.number(),
          frequency: z.enum(["DAILY", "WEEKLY"]),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const account = await getMetaAdAccountById(input.accountId);
        if (!account || account.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });

        const nextRun = new Date();
        if (input.frequency === "DAILY") {
          nextRun.setDate(nextRun.getDate() + 1);
          nextRun.setHours(8, 0, 0, 0);
        } else {
          nextRun.setDate(nextRun.getDate() + (7 - nextRun.getDay()));
          nextRun.setHours(8, 0, 0, 0);
        }

        await createScheduledReport({
          userId: ctx.user.id,
          accountId: input.accountId,
          frequency: input.frequency,
          nextRunAt: nextRun,
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
  }),
});

export type AppRouter = typeof appRouter;
