import { logger } from "./logger";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { execSync } from "node:child_process";
import { COOKIE_NAME } from "@shared/const";
import { getPageIdsForAdAccount } from "@shared/pageMapping";
import { sendEmail, DAILY_REPORT_RECIPIENTS, isEmailConfigured } from "./emailService";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, adminProcedure, authedProcedure, router } from "./_core/trpc";
import { hashPassword, verifyPassword, generateTempPassword } from "./_core/oauth";
import { encryptSecret, decryptSecret } from "./_core/integrationsCrypto";
import {
  GOOGLE_CALENDAR_PROVIDER,
  isGoogleCalendarConfigured,
  refreshAccessToken,
  revokeToken,
  listTodayEvents,
} from "./googleCalendarService";
import {
  getAllUsers,
  getUserById,
  getUserByOpenId,
  createEmployee,
  updateUserFields,
  setUserPassword,
  getUserIntegration,
  updateIntegrationTokens,
  deactivateUserIntegration,
} from "./db";
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
  getAllActiveMetaAdAccountsForListing,
  getScheduledReportsByUserId,
  getAnomaliesByAccountId,
  getSuggestionsByAccountId,
  getTodayMetricsForAllAccounts,
  getUrgentAlertsForUser,
  getAllAlertsForUser,
  clearAllNotifications,
  getAllSuggestionsForUser,
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
  updateAccountAiStatus,
  updateAccountNote,
  updateAccountGoalType,
  updateAccountPicture,
  markStaleCampaignsArchived,
  forceUpdateAllTokens,
  getDailyBriefing,
  saveDailyBriefing,
  getAccountThresholds,
  upsertAccountThresholds,
  getNotificationSettings,
  upsertNotificationSettings,
  getAccountContext,
  upsertAccountContext,
  createAiSuggestion,
  getAgencyContext,
  upsertAgencyContext,
  getActionOutcome,
  updateActionOutcome,
  createReportSnapshot,
  getReportSnapshotByToken,
  getReportSnapshotsByAccountId,
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
  extractMessages,
  extractLinkClicks,
  extractAddToCart,
  extractLandingPageViews,
  getResultLabel,
  calculateRoas,
  calculateCpa,
  getAdSetsWithInsights,
  rankTopAdsetsByCost,
  getAdsWithInsights,
  rankTopAdsByCost,
  getDemographicsInsights,
  getDailyAccountInsights,
  getPortfolioPages,
} from "./metaAdsService";
import { detectDominantGoal, getPerformanceGoalProfile } from "./campaignObjectives";
import { generateAiSuggestions, generateAgencyReport, detectAnomalies } from "./analysisService";
import { assembleReportData, generateReportNarrative } from "./reportService";
import { nanoid } from "nanoid";
import { invokeLLM, extractTextContent } from "./_core/llm";
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
import {
  isGA4Configured,
  getGA4Config,
  listGA4Properties,
  getGA4Overview,
  getGA4DailyMetrics,
  getGA4TrafficSources,
  getGA4TopPages,
  getGA4DeviceBreakdown,
  getGA4GeoBreakdown,
  getGA4Conversions,
} from "./ga4Service";
import {
  getGA4AccountsByUserId,
  getAllActiveGA4Accounts,
  getGA4AccountById,
  createGA4Account,
  deleteGA4Account,
  updateGA4AccountSync,
  getExperimentsByUserId,
  getExperimentById,
  createExperiment,
  updateExperimentStatus,
  updateCheckpointNote,
  deleteExperiment,
  getExperimentCampaignMetrics,
} from "./db";
import type { CampaignReportData } from "./analysisService";
import { notifyOwner } from "./_core/notification";
import { startAutoSync, syncAccount, syncAlertsForUser, syncAllForUser } from "./autoSync";

// ─── Helper: computeNextRun ─────────────────────────────────────────────────
/** Calcula o próximo disparo de um agendamento de relatório. */
function computeNextRun(frequency: "DAILY" | "WEEKLY", h: number, m: number, d: number): Date {
  const now = new Date();
  const next = new Date(now);
  next.setSeconds(0, 0);
  next.setHours(h, m, 0, 0);
  if (frequency === "DAILY") {
    if (next <= now) next.setDate(next.getDate() + 1);
  } else {
    const diff = (d - now.getDay() + 7) % 7;
    next.setDate(now.getDate() + (diff === 0 && next <= now ? 7 : diff));
  }
  return next;
}

// ─── Helper: date range ─────────────────────────────────────────────────────
function toISODate(date: Date): string {
  return date.toISOString().split("T")[0];
}

function getDateRange(days: number, includeToday = false) {
  const today = new Date();
  const todayStr = toISODate(today);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = toISODate(yesterday);

  const end = includeToday ? today : yesterday;
  const endStr = includeToday ? todayStr : yesterdayStr;

  if (days <= 0) {
    return { startDate: todayStr, endDate: todayStr };
  }

  const start = new Date(end);
  start.setDate(start.getDate() - (days - 1));
  return { startDate: toISODate(start), endDate: endStr };
}

/** Resolve date range from input: explicit dates take precedence over days-based. */
function resolveDateRange(input: { startDate?: string; endDate?: string; days: number; includeToday?: boolean }) {
  return (input.startDate && input.endDate)
    ? { startDate: input.startDate, endDate: input.endDate }
    : getDateRange(input.days, input.includeToday ?? false);
}

/**
 * Busca a conta pelo id interno do banco. Clientes/contas são GLOBAIS: qualquer
 * usuário logado acessa qualquer conta (roles limitam funcionalidades, não
 * clientes). Por isso NÃO checamos dono (userId) — só existência real.
 * "Conta não encontrada" só quando o id não existe no banco.
 * (`_userId` mantido na assinatura por compatibilidade com os ~31 callers.)
 */
async function getVerifiedAccount(accountId: number, _userId: number) {
  const account = await getMetaAdAccountById(accountId);
  if (!account) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Conta não encontrada." });
  }
  return account;
}

/** Resolve a possibly-internal campaign ID to a real Meta campaign ID. */
async function resolveMetaCampaignId(accountId: number, inputId: string): Promise<string> {
  let metaCampaignId = inputId;
  if (inputId.length < 12) {
    const localCampaigns = await getCampaignsByAccountId(accountId);
    const inputAsNum = parseInt(inputId, 10);
    if (!isNaN(inputAsNum)) {
      const byDbId = localCampaigns.find(c => c.id === inputAsNum);
      if (byDbId?.metaCampaignId) {
        metaCampaignId = byDbId.metaCampaignId;
      }
    }
  }
  return metaCampaignId;
}

// ─── Meta campaign status type ──────────────────────────────────────────────
type MetaCampaignStatus = "ACTIVE" | "PAUSED" | "ARCHIVED" | "DELETED";

// ─── Routers ──────────────────────────────────────────────────────────────────

// ─── Context Router ───────────────────────────────────────────────────────────
const contextRouter = router({
  getAccount: protectedProcedure
    .input(z.object({ accountId: z.number() }))
    .query(async ({ input }) => {
      return await getAccountContext(input.accountId);
    }),

  upsertAccount: protectedProcedure
    .input(z.object({
      accountId: z.number(),
      clientProfile: z.string().optional(),
      operationalRules: z.string().optional(),
      learnings: z.string().optional(),
      businessType: z.string().optional(),
      ticketRange: z.string().optional(),
      audienceAge: z.string().optional(),
      audienceGender: z.string().optional(),
      audienceGeo: z.string().optional(),
      restrictions: z.array(z.string()).optional(),
      events: z.array(z.object({ date: z.string(), type: z.string(), description: z.string() })).optional(),
      freeInput: z.string().optional(),
      focusMoment: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { accountId, ...values } = input;
      await upsertAccountContext(accountId, {
        ...values,
        updatedBy: (ctx.user as any)?.name ?? "user",
      });
      return { ok: true };
    }),

  getAgency: protectedProcedure
    .query(async ({ ctx }) => {
      return await getAgencyContext((ctx.user as any).id);
    }),

  upsertAgency: protectedProcedure
    .input(z.object({
      benchmarks: z.string().optional(),
      patterns: z.string().optional(),
      institutionalKnowledge: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await upsertAgencyContext((ctx.user as any).id, input);
      return { ok: true };
    }),

  getOutcome: protectedProcedure
    .input(z.object({ suggestionId: z.number() }))
    .query(async ({ input }) => {
      return await getActionOutcome(input.suggestionId);
    }),

  addManualCorrection: protectedProcedure
    .input(z.object({
      suggestionId: z.number(),
      manualCorrection: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      await updateActionOutcome(input.suggestionId, {
        manualCorrection: input.manualCorrection,
        closedBy: (ctx.user as any)?.name ?? "user",
      });
      return { ok: true };
    }),

  createActionFromChat: protectedProcedure
    .input(z.object({
      accountId: z.number(),
      title: z.string(),
      monitorDays: z.number().default(7),
      description: z.string().optional(),
      campaignId: z.number().optional(),
      expectedImpact: z.union([
        z.object({
          metric: z.string(),
          baseline: z.number(),
          target: z.number(),
          direction: z.string(),
          unit: z.string(),
          description: z.string(),
        }),
        z.array(z.object({
          metric: z.string(),
          baseline: z.number(),
          target: z.number(),
          direction: z.string(),
          unit: z.string(),
          description: z.string(),
        })),
      ]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const now = new Date();
      const monitorUntil = new Date(now.getTime() + input.monitorDays * 24 * 60 * 60 * 1000);
      await createAiSuggestion({
        accountId: input.accountId,
        category: "GENERAL",
        priority: "MEDIUM",
        title: input.title,
        description: input.description ?? "Ação registrada manualmente.",
        campaignId: input.campaignId ?? null,
        expectedImpact: input.expectedImpact ? JSON.stringify(input.expectedImpact) : null,
        status: "applied",
        appliedAt: now,
        monitorUntil,
        isApplied: true,
        isDismissed: false,
      });
      return { ok: true };
    }),

  chat: protectedProcedure
    .input(z.object({
      accountId: z.number(),
      messages: z.array(z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      })),
    }))
    .mutation(async ({ ctx, input }) => {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 30);
      const toLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;

      const [accountCtx, agencyCtx, metrics, suggestions] = await Promise.all([
        getAccountContext(input.accountId),
        getAgencyContext((ctx.user as any).id),
        getCampaignPerformanceSummary(input.accountId, toLocal(startDate), toLocal(endDate)),
        getSuggestionsByAccountId(input.accountId),
      ]);

      const perfLines = metrics.map((m: any) => {
        const spend = Number(m.totalSpend ?? 0).toFixed(2);
        const conv = Number(m.totalConversions ?? 0);
        const cpa = Number(m.avgCpa ?? 0).toFixed(2);
        const roas = Number(m.avgRoas ?? 0).toFixed(2);
        const ctr = Number(m.avgCtr ?? 0).toFixed(2);
        return `- ${m.campaignName}: R$${spend} investido, ${conv} conversões, CPA R$${cpa}, ROAS ${roas}x, CTR ${ctr}%`;
      }).join("\n");

      const pendingSuggestions = (suggestions ?? [])
        .filter((s: any) => s.status === "pending")
        .slice(0, 5)
        .map((s: any) => `- [${s.priority}] ${s.title}`)
        .join("\n");

      const contextBlocks = [
        agencyCtx?.benchmarks ? `BENCHMARKS DA AGÊNCIA:\n${agencyCtx.benchmarks}` : "",
        agencyCtx?.institutionalKnowledge ? `CONHECIMENTO INSTITUCIONAL:\n${agencyCtx.institutionalKnowledge}` : "",
        agencyCtx?.patterns ? `PADRÕES DO PORTFÓLIO:\n${agencyCtx.patterns}` : "",
        accountCtx?.clientProfile ? `PERFIL DO CLIENTE:\n${accountCtx.clientProfile}` : "",
        accountCtx?.operationalRules ? `REGRAS OPERACIONAIS:\n${accountCtx.operationalRules}` : "",
        (accountCtx as any)?.focusMoment ? `FOCO DO MOMENTO (prioridade máxima):\n${(accountCtx as any).focusMoment}` : "",
        accountCtx?.learnings ? `APRENDIZADOS HISTÓRICOS:\n${accountCtx.learnings}` : "",
        perfLines ? `PERFORMANCE DOS ÚLTIMOS 30 DIAS:\n${perfLines}` : "",
        pendingSuggestions ? `SUGESTÕES PENDENTES DA IA:\n${pendingSuggestions}` : "",
      ].filter(Boolean).join("\n\n");

      const systemPrompt = `Você é um estrategista sênior de Meta Ads da SELVA Agency, operando dentro do BIT — Brand Intelligence Tracker, um dashboard interno de gestão de Meta Ads. Você tem acesso completo e em tempo real aos dados desta conta através do sistema: métricas de campanhas, conjuntos, criativos, sugestões geradas, ações em monitoramento, contexto da conta e aprendizados históricos. O sistema sincroniza dados diariamente às 9h automaticamente via Meta Graph API. IMPORTANTE: nunca diga que não tem acesso a dados ou APIs — você já tem tudo disponível no contexto abaixo. Seja direto, preciso e acionável.

FORMATAÇÃO: Responda em parágrafos separados por quebra de linha. Sem asteriscos, sem hashtags, sem traços. Se houver decisões estratégicas rastreáveis a sugerir (pausar algo, realocar orçamento, criar algo), coloque-as no final sob o marcador exato "AÇÕES:" — uma por linha numerada. Inclua APENAS decisões de negócio monitoráveis, não passos de execução como "acessar o gerenciador" ou "registrar horário". Exemplo: AÇÕES:\n1. Pausar conjunto X\n2. Realocar R$500 de Y para Z

${contextBlocks}`;

      const response = await invokeLLM({
        messages: [{ role: "system", content: systemPrompt }, ...input.messages],
        maxTokens: 1200,
      });

      return { reply: extractTextContent(response) };
    }),
});

export const appRouter = router({
  system: systemRouter,

  auth: router({
    me: publicProcedure.query((opts) => {
      if (!opts.ctx.user) return null;
      // Nunca expõe o hash da senha ao cliente.
      const { passwordHash: _omit, ...safe } = opts.ctx.user;
      return safe;
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),

    // Troca de senha no primeiro acesso (ou voluntária). Usa authedProcedure
    // porque protectedProcedure bloqueia quem tem mustChangePassword = true.
    changePassword: authedProcedure
      .input(z.object({
        currentPassword: z.string().min(1),
        newPassword: z.string().min(8, "A nova senha deve ter pelo menos 8 caracteres."),
      }))
      .mutation(async ({ ctx, input }) => {
        const dbUser = await getUserById(ctx.user.id);
        if (!dbUser?.passwordHash || !verifyPassword(input.currentPassword, dbUser.passwordHash)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Senha atual incorreta." });
        }
        if (verifyPassword(input.newPassword, dbUser.passwordHash)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "A nova senha deve ser diferente da atual." });
        }
        await setUserPassword(ctx.user.id, hashPassword(input.newPassword), false);
        return { success: true } as const;
      }),

    // Edição do PRÓPRIO perfil (campos permitidos). Nunca role/email.
    updateOwnProfile: protectedProcedure
      .input(z.object({
        jobTitle: z.string().max(255).nullable().optional(),
        birthdayDay: z.number().int().min(1).max(31).nullable().optional(),
        birthdayMonth: z.number().int().min(1).max(12).nullable().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const updated = await updateUserFields(ctx.user.id, input);
        if (!updated) throw new TRPCError({ code: "NOT_FOUND" });
        const { passwordHash: _omit, ...safe } = updated;
        return safe;
      }),
  }),

  // ─── Colaboradores (People management) — admin only ─────────────────────────
  people: router({
    list: adminProcedure.query(async () => {
      const rows = await getAllUsers();
      // Nunca expõe passwordHash.
      return rows.map(({ passwordHash: _omit, ...u }) => u);
    }),

    create: adminProcedure
      .input(z.object({
        name: z.string().min(1),
        email: z.string().email(),
        role: z.enum(["user", "admin", "developer"]),
        jobTitle: z.string().optional(),
        birthdayDay: z.number().int().min(1).max(31).optional(),
        birthdayMonth: z.number().int().min(1).max(12).optional(),
      }))
      .mutation(async ({ input }) => {
        const openId = input.email.toLowerCase();
        if (await getUserByOpenId(openId)) {
          throw new TRPCError({ code: "CONFLICT", message: "Já existe um colaborador com esse e-mail." });
        }
        const tempPassword = generateTempPassword();
        await createEmployee({
          openId,
          email: input.email,
          name: input.name,
          role: input.role,
          jobTitle: input.jobTitle ?? null,
          birthdayDay: input.birthdayDay ?? null,
          birthdayMonth: input.birthdayMonth ?? null,
          passwordHash: hashPassword(tempPassword),
          mustChangePassword: true,
          active: true,
          loginMethod: "email",
        });
        // tempPassword retornado UMA vez ao admin; nunca é armazenado em texto.
        return { tempPassword };
      }),

    update: adminProcedure
      .input(z.object({
        id: z.number().int(),
        name: z.string().min(1).optional(),
        email: z.string().email().optional(),
        role: z.enum(["user", "admin", "developer"]).optional(),
        jobTitle: z.string().nullable().optional(),
        birthdayDay: z.number().int().min(1).max(31).nullable().optional(),
        birthdayMonth: z.number().int().min(1).max(12).nullable().optional(),
        active: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { id, ...patch } = input;
        // Um admin não pode se auto-rebaixar nem se desativar (evita lockout).
        if (id === ctx.user.id && (patch.role && patch.role !== "admin" || patch.active === false)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Você não pode alterar a própria permissão/status." });
        }
        if (patch.email) {
          const existing = await getUserByOpenId(patch.email.toLowerCase());
          if (existing && existing.id !== id) {
            throw new TRPCError({ code: "CONFLICT", message: "E-mail já usado por outro colaborador." });
          }
        }
        const updated = await updateUserFields(id, patch);
        if (!updated) throw new TRPCError({ code: "NOT_FOUND" });
        const { passwordHash: _omit, ...safe } = updated;
        return safe;
      }),

    resetPassword: adminProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ input }) => {
        const target = await getUserById(input.id);
        if (!target) throw new TRPCError({ code: "NOT_FOUND" });
        const tempPassword = generateTempPassword();
        await setUserPassword(input.id, hashPassword(tempPassword), true);
        return { tempPassword };
      }),
  }),

  // ─── Integrações por usuário (OAuth) ────────────────────────────────────────
  // Sempre pela sessão (ctx.user.id). Nenhum token é retornado ao frontend.
  integrations: router({
    googleCalendar: router({
      status: protectedProcedure.query(async ({ ctx }) => {
        if (!isGoogleCalendarConfigured()) return { available: false, connected: false };
        const integ = await getUserIntegration(ctx.user.id, GOOGLE_CALENDAR_PROVIDER);
        const connected = !!integ && integ.active && !!integ.refreshTokenEncrypted;
        return {
          available: true,
          connected,
          email: connected ? integ?.providerAccountEmail ?? undefined : undefined,
        };
      }),

      disconnect: protectedProcedure.mutation(async ({ ctx }) => {
        const integ = await getUserIntegration(ctx.user.id, GOOGLE_CALENDAR_PROVIDER);
        if (integ?.accessTokenEncrypted) {
          try { await revokeToken(decryptSecret(integ.accessTokenEncrypted)); } catch { /* best-effort */ }
        }
        await deactivateUserIntegration(ctx.user.id, GOOGLE_CALENDAR_PROVIDER);
        return { success: true } as const;
      }),

      // Eventos de hoje. A Home nunca quebra: sempre retorna um status tratável.
      todayEvents: protectedProcedure.query(async ({ ctx }) => {
        if (!isGoogleCalendarConfigured()) return { status: "unavailable" as const, events: [] };
        const integ = await getUserIntegration(ctx.user.id, GOOGLE_CALENDAR_PROVIDER);
        if (!integ || !integ.active || !integ.refreshTokenEncrypted) {
          return { status: "disconnected" as const, events: [] };
        }

        let accessToken = "";
        try { accessToken = integ.accessTokenEncrypted ? decryptSecret(integ.accessTokenEncrypted) : ""; } catch { accessToken = ""; }
        const expired = !accessToken || !integ.expiresAt || new Date(integ.expiresAt).getTime() < Date.now() + 60_000;

        const doRefresh = async () => {
          const refreshed = await refreshAccessToken(decryptSecret(integ.refreshTokenEncrypted!));
          await updateIntegrationTokens(integ.id, {
            accessTokenEncrypted: encryptSecret(refreshed.accessToken),
            expiresAt: refreshed.expiresAt,
          });
          return refreshed.accessToken;
        };

        if (expired) {
          try { accessToken = await doRefresh(); }
          catch { return { status: "needs_reconnect" as const, events: [] }; }
        }

        try {
          return { status: "ok" as const, events: await listTodayEvents(accessToken) };
        } catch {
          // Access token pode ter sido revogado → tenta refresh uma vez.
          try {
            const token = await doRefresh();
            return { status: "ok" as const, events: await listTodayEvents(token) };
          } catch {
            return { status: "needs_reconnect" as const, events: [] };
          }
        }
      }),
    }),
  }),

  // ─── Meta Ad Accounts ──────────────────────────────────────────────────────
  accounts: router({
    // Lista GLOBAL de clientes/contas: qualquer usuário logado vê todas as
    // contas ativas (clientes não são filtrados por usuário/role). Não depende
    // mais da conta "owner" (contato@selva.agency).
    list: protectedProcedure.query(async () => {
      const accounts = await getAllActiveMetaAdAccountsForListing();
      // Enrich with token error status from alerts (do dono da conta).
      const accountsWithStatus = await Promise.all(
        accounts.map(async (acc) => {
          const recentAlerts = await getAlertsByAccountId(acc.userId, acc.id);
          const hasTokenError = recentAlerts.some(
            (a) => a.type === "SYNC_ERROR" && !a.isRead && a.title.startsWith("Token expirado")
          );
          return { ...acc, hasTokenError };
        })
      );
      return accountsWithStatus;
    }),

    todayMetrics: protectedProcedure.query(async ({ ctx }) => {
      return getTodayMetricsForAllAccounts(ctx.user.id);
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
            pictureUrl: acc.pictureUrl ?? null,
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

    // Refresh picture URLs for all accounts from Meta API
    refreshPictures: protectedProcedure
      .mutation(async ({ ctx }) => {
        const dbAccounts = await getMetaAdAccountsByUserId(ctx.user.id);
        if (!dbAccounts.length) return { updated: 0 };
        const token = dbAccounts[0].accessToken;
        const metaAccounts = await getAdAccounts(token);
        const pictureMap = new Map<string, string | undefined>();
        for (const acc of metaAccounts) {
          pictureMap.set(acc.id.replace("act_", ""), acc.pictureUrl);
        }
        let updated = 0;
        for (const acc of dbAccounts) {
          const url = pictureMap.get(acc.accountId) ?? null;
          await updateAccountPicture(acc.id, url);
          updated++;
        }
        return { updated };
      }),


    getThresholds: protectedProcedure
      .input(z.object({ accountId: z.number() }))
      .query(async ({ ctx, input }) => {
        await getVerifiedAccount(input.accountId, ctx.user.id);
        return getAccountThresholds(input.accountId);
      }),

    upsertThresholds: protectedProcedure
      .input(z.object({
        accountId: z.number(),
        roasGood:    z.string().optional().nullable(),
        roasRegular: z.string().optional().nullable(),
        cpaGood:     z.string().optional().nullable(),
        cpaRegular:  z.string().optional().nullable(),
        ctrGood:     z.string().optional().nullable(),
        ctrRegular:  z.string().optional().nullable(),
        cplGood:     z.string().optional().nullable(),
        cplRegular:  z.string().optional().nullable(),
        cpmGood:     z.string().optional().nullable(),
        cpmRegular:  z.string().optional().nullable(),
        lowBalanceThreshold: z.string().optional().nullable(),
      }))
      .mutation(async ({ ctx, input }) => {
        await getVerifiedAccount(input.accountId, ctx.user.id);
        const { accountId, ...values } = input;
        await upsertAccountThresholds(accountId, values);
        return { success: true };
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
        const account = await getVerifiedAccount(input.accountId, ctx.user.id);
        const billing = await getAccountBilling(account.accountId, account.accessToken);

        // Fire low-balance alert if pre-paid and below the account's configured threshold
        // Usa o mesmo formato de titulo do cron (checkRealTimeAlerts) para garantir dedup correto
        if (billing?.isPrePaid && billing.remainingBalance !== null) {
          const thresholdRow = await getAccountThresholds(input.accountId);
          const lowBalanceThreshold = thresholdRow?.lowBalanceThreshold ? Number(thresholdRow.lowBalanceThreshold) : 200;
          if (billing.remainingBalance < lowBalanceThreshold) {
            const title = `Saldo abaixo de R$${lowBalanceThreshold.toFixed(2)} — risco de pausa`;
            const result = await createAlertIfNotExists({
              userId: ctx.user.id,
              accountId: input.accountId,
              type: "BUDGET_WARNING",
              severity: "CRITICAL",
              title,
              message: `Saldo disponível: R$${billing.remainingBalance.toFixed(2)}. Recarregue para evitar interrupção das campanhas.`,
            });
            if (result) {
              await notifyOwner({
                title: `⚠️ Saldo baixo — ${account.accountName ?? account.accountId}`,
                content: `Saldo remanescente: ${billing.currency} ${billing.remainingBalance.toFixed(2)}. Recarregue para evitar interrupção das campanhas.`,
              });
            }
          }
        }

        return billing;
      }),
    billingSummary: protectedProcedure
      .input(z.object({ accountId: z.number() }))
      .query(async ({ ctx, input }) => {
        const account = await getVerifiedAccount(input.accountId, ctx.user.id);
        const billing = await getAccountBilling(account.accountId, account.accessToken);
        if (!billing) {
          return { isPrePaid: false as const, fundingSourceDisplay: null, currency: null };
        }
        if (!billing.isPrePaid) {
          return { isPrePaid: false as const, fundingSourceDisplay: billing.fundingSourceDisplay, currency: billing.currency };
        }
        const today = new Date();
        const endDateObj = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
        const startDateObj = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 30);
        const fmt = (d: Date) => String(d.getFullYear()) + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
        const rows = await getAccountMetricsSummary(input.accountId, fmt(startDateObj), fmt(endDateObj));
        const totalSpend = rows.reduce((acc, r) => acc + Number(r.totalSpend ?? 0), 0);
        const avgDailySpend30d = rows.length > 0 ? totalSpend / rows.length : 0;
        const remainingBalance = billing.remainingBalance;
        const daysRemaining = remainingBalance !== null && avgDailySpend30d > 0 ? remainingBalance / avgDailySpend30d : null;
        return { isPrePaid: true as const, fundingSourceDisplay: billing.fundingSourceDisplay, currency: billing.currency, remainingBalance, avgDailySpend30d, daysRemaining };
      }),

    sync: protectedProcedure
      .input(z.object({ accountId: z.number(), days: z.number().min(1).max(90).default(30) }))
      .mutation(async ({ ctx, input }) => {
        const account = await getVerifiedAccount(input.accountId, ctx.user.id);

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
            status: mc.status as MetaCampaignStatus,
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
          const messages = extractMessages(insight.actions);
          const linkClicks = extractLinkClicks(insight.actions);
          const addToCart = extractAddToCart(insight.actions);
          const landingPageViews = extractLandingPageViews(insight.actions);

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
            messages,
            linkClicks,
            addToCart,
            landingPageViews,
          });
        }

        await updateMetaAdAccountSync(account.id);
        return { success: true, campaignsSynced: metaCampaigns.length, insightsSynced: insights.length };
      }),

    // ─── Account Note ─────────────────────────────────────────────────────────
    updateNote: protectedProcedure
      .input(z.object({ accountId: z.number(), note: z.string().max(1000) }))
      .mutation(async ({ ctx, input }) => {
        await getVerifiedAccount(input.accountId, ctx.user.id);
        await updateAccountNote(input.accountId, input.note);
        return { success: true };
      }),

    updateGoalType: protectedProcedure
      .input(z.object({ accountId: z.number(), goalTypeOverride: z.string().nullable() }))
      .mutation(async ({ ctx, input }) => {
        await getVerifiedAccount(input.accountId, ctx.user.id);
        await updateAccountGoalType(input.accountId, input.goalTypeOverride);
        return { success: true };
      }),

    // ─── AI Status Summary ────────────────────────────────────────────────────
    refreshStatus: protectedProcedure
      .input(z.object({ accountId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await getVerifiedAccount(input.accountId, ctx.user.id);
        const accountData = await getMetaAdAccountById(input.accountId);
        const goalType = (accountData as any)?.goalTypeOverride ?? "DEFAULT";
        const roasGoals = ["SALES", "VALUE"];
        const roasApplies = roasGoals.includes(goalType);
        const { startDate, endDate } = getDateRange(7);
        const metrics = await getAccountMetricsSummary(input.accountId, startDate, endDate);

        const totals = metrics.reduce(
          (acc, m) => ({
            spend: acc.spend + Number(m.totalSpend ?? 0),
            impressions: acc.impressions + Number(m.totalImpressions ?? 0),
            clicks: acc.clicks + Number(m.totalClicks ?? 0),
            conversions: acc.conversions + Number(m.totalConversions ?? 0),
            conversionValue: acc.conversionValue + Number(m.totalConversionValue ?? 0),
          }),
          { spend: 0, impressions: 0, clicks: 0, conversions: 0, conversionValue: 0 }
        );
        const roas = totals.spend > 0 ? totals.conversionValue / totals.spend : 0;
        const cpa = totals.conversions > 0 ? totals.spend / totals.conversions : 0;
        const ctr = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;

        const result = await invokeLLM({
          messages: [{
            role: "user",
            content: `Analise os dados de performance dos últimos 7 dias e retorne um JSON com dois campos: "color" (green/yellow/red) e "summary" (máx 300 caracteres em português, sem emoji). O summary deve conter: (1) status geral da conta, (2) principal métrica positiva ou problemática com valor, (3) uma ação sugerida objetiva. Verde = conta saudável, Amarelo = atenção necessária, Vermelho = problema crítico.\n\nObjetivo da conta: ${goalType}${!roasApplies ? " — IMPORTANTE: esta conta é de " + goalType + ", NÃO de e-commerce. NUNCA mencione ROAS, valor de conversão ou rastreamento de receita como problema. Avalie APENAS: volume de resultados (mensagens/cliques/alcance), custo por resultado e CTR." : ""}\n\nDados:\n${JSON.stringify(roasApplies ? { ...totals, roas: roas.toFixed(2), cpa: cpa.toFixed(2), ctr: ctr.toFixed(2) } : { spend: totals.spend, conversions: totals.conversions, clicks: totals.clicks, impressions: totals.impressions, cpa: cpa.toFixed(2), ctr: ctr.toFixed(2) })}`,
          }],
          responseFormat: { type: "json_object" },
          thinking: false,
        });

        let color: "green" | "yellow" | "red" = "yellow";
        let summary = "Análise pendente";
        try {
          const parsed = JSON.parse(extractTextContent(result));
          if (["green", "yellow", "red"].includes(parsed.color)) color = parsed.color;
          if (typeof parsed.summary === "string") summary = parsed.summary.slice(0, 300);
        } catch { /* keep defaults */ }

        await updateAccountAiStatus(input.accountId, color, summary);
        return { color, summary };
      }),
  }),

  // ─── Dashboard ─────────────────────────────────────────────────────────────

  notifications: router({
    get: protectedProcedure
      .query(async ({ ctx }) => {
        return getNotificationSettings(ctx.user.id);
      }),

    upsert: protectedProcedure
      .input(z.object({
        emailDestination:          z.string().email().optional().nullable(),
        alertCpaEnabled:           z.boolean().optional(),
        alertRoasEnabled:          z.boolean().optional(),
        alertTokenExpiredEnabled:  z.boolean().optional(),
        alertBudgetEnabled:        z.boolean().optional(),
        alertCpaThreshold:         z.string().optional().nullable(),
        alertRoasThreshold:        z.string().optional().nullable(),
        alertBudgetPercent:        z.number().min(1).max(100).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await upsertNotificationSettings(ctx.user.id, input);
        return { success: true };
      }),
  }),

  dashboard: router({
    overview: protectedProcedure
      .input(z.object({
        accountId: z.number(),
        days: z.number().min(1).max(90).default(7),
        startDate: z.string().optional(), // ISO date string YYYY-MM-DD, overrides days when provided
        endDate: z.string().optional(),   // ISO date string YYYY-MM-DD
      }))
      .query(async ({ ctx, input }) => {
        const account = await getVerifiedAccount(input.accountId, ctx.user.id);

        // If explicit startDate/endDate provided, use them; otherwise fall back to days-based range
        const { startDate, endDate } = resolveDateRange(input);
        // Calculate previous period (same number of days, immediately before)
        const start = new Date(startDate);
        const end = new Date(endDate);
        const periodDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        const prevEnd = new Date(start);
        prevEnd.setDate(prevEnd.getDate() - 1);
        const prevStart = new Date(prevEnd);
        prevStart.setDate(prevStart.getDate() - (periodDays - 1));
        const prevStartStr = prevStart.toISOString().split("T")[0];
        const prevEndStr = prevEnd.toISOString().split("T")[0];
        const [metrics, campaigns, unreadAlerts, unreadAnomalies, prevMetrics] = await Promise.all([
          getAccountMetricsSummary(input.accountId, startDate, endDate),
          getCampaignPerformanceSummary(input.accountId, startDate, endDate),
          getUnreadAlertsCount(ctx.user.id),
          getUnreadAnomaliesCount(input.accountId),
          getAccountMetricsSummary(input.accountId, prevStartStr, prevEndStr),
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

        const prevTotals = prevMetrics.reduce(
          (acc, m) => ({
            spend: acc.spend + Number(m.totalSpend ?? 0),
            conversionValue: acc.conversionValue + Number(m.totalConversionValue ?? 0),
            conversions: acc.conversions + Number(m.totalConversions ?? 0),
            impressions: acc.impressions + Number(m.totalImpressions ?? 0),
            clicks: acc.clicks + Number(m.totalClicks ?? 0),
            reach: acc.reach + Number(m.totalReach ?? 0),
          }),
          { spend: 0, conversionValue: 0, conversions: 0, impressions: 0, clicks: 0, reach: 0 }
        );
        return {
          totals: { ...totals, roas: overallRoas, cpa: overallCpa, ctr: overallCtr },
          previousTotals: prevTotals,
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
        const account = await getVerifiedAccount(input.accountId, ctx.user.id);
        const { startDate, endDate } = resolveDateRange(input);
        const dbCampaigns = await getCampaignsByAccountId(account.id);
        const allGoals = dbCampaigns.map(c => c.optimizationGoal).filter((g): g is string => !!g);
        const dominantGoal = detectDominantGoal(allGoals);
        console.log(`[GOAL_DB] demographics account=${account.accountId} goals=${JSON.stringify(Array.from(new Set(allGoals)))} dominant=${dominantGoal}`);
        const rows = await getDemographicsInsights(account.accountId, account.accessToken, startDate, endDate, dominantGoal);
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
        const account = await getVerifiedAccount(input.accountId, ctx.user.id);
        const { startDate, endDate } = resolveDateRange(input);
        const dbCampaigns = await getCampaignsByAccountId(account.id);
        const allGoals2 = dbCampaigns.map(c => c.optimizationGoal).filter((g): g is string => !!g);
        const dominantGoal = detectDominantGoal(allGoals2);
        console.log(`[GOAL_DB] dailyInsights account=${account.accountId} goals=${JSON.stringify(Array.from(new Set(allGoals2)))} dominant=${dominantGoal}`);
        const rows = await getDailyAccountInsights(account.accountId, account.accessToken, startDate, endDate, dominantGoal);
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
        const account = await getVerifiedAccount(input.accountId, ctx.user.id);

        // Fetch ACTIVE campaigns directly from Meta API (source of truth)
        try {
          const metaCampaigns = await getCampaigns(account.accountId, account.accessToken);
          const activeMeta = metaCampaigns.filter((c: any) => c.status === "ACTIVE");

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
        const account = await getVerifiedAccount(input.accountId, ctx.user.id);
        const { startDate, endDate } = resolveDateRange(input);
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
        const account = await getVerifiedAccount(input.accountId, ctx.user.id);

        const { startDate, endDate } = resolveDateRange(input);

        // Resolve the real Meta campaign ID (frontend may send DB id or Meta id)
        const realMetaCampaignId = await resolveMetaCampaignId(input.accountId, input.metaCampaignId);

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

        // If no ads found via account-wide fetch, try campaign-specific endpoint as fallback
        if (filtered.length === 0 && !fetchError) {
          try {
            const campAdsUrl = `https://graph.facebook.com/v21.0/${realMetaCampaignId}/ads?access_token=${account.accessToken}&fields=id,name,adset_id,campaign_id,status,effective_status,creative{id,object_type,thumbnail_url,image_url}&filtering=${encodeURIComponent(JSON.stringify([{field:"effective_status",operator:"IN",value:["ACTIVE"]}]))}&limit=100`;
            const campResp = await fetch(campAdsUrl);
            const campData = await campResp.json() as any;
            if (campData.data?.length > 0) {
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
        const account = await getVerifiedAccount(input.accountId, ctx.user.id);

        const { startDate, endDate } = resolveDateRange(input);
        const realMetaCampaignId = await resolveMetaCampaignId(input.accountId, input.metaCampaignId);

        // Fetch all adsets with insights for this account
        const allAdsets = await getAdSetsWithInsights(
          account.accountId, account.accessToken, startDate, endDate
        );

        // Filter to only adsets belonging to this campaign
        const filtered = allAdsets.filter(as => as.campaign_id === realMetaCampaignId);

        // Fallback: fetch campaign-specific adsets if account-wide returned nothing for this campaign
        if (filtered.length === 0 && allAdsets.length > 0) {
          try {
            const campAdsetsUrl = `https://graph.facebook.com/v21.0/${realMetaCampaignId}/adsets?access_token=${account.accessToken}&fields=id,name,campaign_id,status,effective_status,optimization_goal,daily_budget,lifetime_budget,targeting&filtering=${encodeURIComponent(JSON.stringify([{field:"effective_status",operator:"IN",value:["ACTIVE"]}]))}&limit=100`;
            const resp = await fetch(campAdsetsUrl);
            const data = await resp.json() as any;
            if (data.data?.length > 0) {
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

    // ── Top ads by CTR for the account (account-level, period-aware) ─────
    adTopByCtr: protectedProcedure
      .input(z.object({
        accountId: z.number(),
        days: z.number().min(1).max(90).default(7),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      }))
      .query(async ({ ctx, input }) => {
        const account = await getVerifiedAccount(input.accountId, ctx.user.id);
        const { startDate, endDate } = resolveDateRange(input);

        const rawAdsets = await getAdSets(account.accountId, account.accessToken);
        const adsetGoalMap = new Map<string, string>();
        for (const as of rawAdsets) {
          if (as.optimization_goal) adsetGoalMap.set(as.id, as.optimization_goal);
        }

        let ads: Awaited<ReturnType<typeof getAdsWithInsights>> = [];
        try {
          ads = await getAdsWithInsights(account.accountId, account.accessToken, startDate, endDate, adsetGoalMap);
        } catch (err) {
          console.error("[campaigns.adTopByCtr] Failed:", err);
          return [];
        }

        console.log('[adTopByCtr] accountId:', account.accountId, 'start:', startDate, 'end:', endDate, 'total ads:', ads.length, 'with spend:', ads.filter(a => a.spend > 0).length);
        const allDbCampaigns = await getCampaignsByAccountId(input.accountId);

        return rankTopAdsByCost(ads, allDbCampaigns, 5);
      }),

    // ── Top adsets by CTR for the account (account-level, period-aware) ──
    trend30d: protectedProcedure
      .input(z.object({
        accountId: z.number(),
        days: z.number().min(1).max(90).default(30),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      }))
      .query(async ({ ctx, input }) => {
        const account = await getVerifiedAccount(input.accountId, ctx.user.id);
        const { startDate, endDate } = resolveDateRange({ ...input, includeToday: true });
        const rows = await getAccountMetricsSummary(input.accountId, startDate, endDate);
        return rows.map(r => ({
          date: r.date,
          spend: Number(r.totalSpend ?? 0),
          conversions: Number(r.totalConversions ?? 0),
          roas: Number(r.avgRoas ?? 0),
          cpa: Number(r.avgCpa ?? 0),
          ctr: Number(r.avgCtr ?? 0),
          reach: Number(r.totalReach ?? 0),
        }));
      }),

    dayOfWeekStats: protectedProcedure
      .input(z.object({
        accountId: z.number(),
        days: z.number().min(7).max(90).default(30),
        metricKey: z.enum(["conversions", "spend", "clicks", "impressions"]).default("conversions"),
      }))
      .query(async ({ ctx, input }) => {
        const account = await getVerifiedAccount(input.accountId, ctx.user.id);
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - input.days);
        const startStr = `${startDate.getFullYear()}-${String(startDate.getMonth()+1).padStart(2,'0')}-${String(startDate.getDate()).padStart(2,'0')}`;
        const endStr = `${endDate.getFullYear()}-${String(endDate.getMonth()+1).padStart(2,'0')}-${String(endDate.getDate()).padStart(2,'0')}`;
        const rows = await getAccountMetricsSummary(input.accountId, startStr, endStr);
        // Group by day of week (0=Sun..6=Sat)
        const byDow: Record<number, { total: number; count: number; spend: number }> = {};
        for (let i = 0; i < 7; i++) byDow[i] = { total: 0, count: 0, spend: 0 };
        for (const row of rows) {
          if (!row.date) continue;
          const d = new Date(row.date + "T12:00:00");
          const dow = d.getDay();
          const val = Number((row as any)[`total${input.metricKey.charAt(0).toUpperCase()}${input.metricKey.slice(1)}`] ?? row.totalConversions ?? 0);
          byDow[dow].total += val;
          byDow[dow].count += 1;
          byDow[dow].spend += Number(row.totalSpend ?? 0);
        }
        const labels = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
        return labels.map((label, i) => ({
          label,
          dow: i,
          avg: byDow[i].count > 0 ? byDow[i].total / byDow[i].count : 0,
          total: byDow[i].total,
          count: byDow[i].count,
          avgSpend: byDow[i].count > 0 ? byDow[i].spend / byDow[i].count : 0,
        }));
      }),

    adsetTopByCtr: protectedProcedure
      .input(z.object({
        accountId: z.number(),
        days: z.number().min(1).max(90).default(7),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      }))
      .query(async ({ ctx, input }) => {
        const account = await getVerifiedAccount(input.accountId, ctx.user.id);
        const { startDate, endDate } = resolveDateRange(input);

        let adsets: Awaited<ReturnType<typeof getAdSetsWithInsights>> = [];
        try {
          adsets = await getAdSetsWithInsights(account.accountId, account.accessToken, startDate, endDate);
        } catch (err) {
          console.error("[campaigns.adsetTopByCtr] Failed:", err);
          return [];
        }

        const dbCampsForAdsets = await getCampaignsByAccountId(input.accountId);
        return rankTopAdsetsByCost(adsets, dbCampsForAdsets, 5);
      }),

    // Diagnostic: raw Meta API call without error swallowing
    adsDebug: protectedProcedure
      .input(z.object({ accountId: z.number() }))
      .query(async ({ ctx, input }) => {
        const account = await getVerifiedAccount(input.accountId, ctx.user.id);
        
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
        const account = await getVerifiedAccount(input.accountId, ctx.user.id);
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
        const account = await getVerifiedAccount(input.accountId, ctx.user.id);

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
    listAll: protectedProcedure
      .query(async ({ ctx }) => {
        return getAllSuggestionsForUser(ctx.user.id);
      }),
    list: protectedProcedure
      .input(z.object({ accountId: z.number() }))
      .query(async ({ ctx, input }) => {
        const account = await getVerifiedAccount(input.accountId, ctx.user.id);
        return getSuggestionsByAccountId(input.accountId);
      }),
    history: protectedProcedure
      .input(z.object({ accountId: z.number() }))
      .query(async ({ ctx, input }) => {
        const account = await getVerifiedAccount(input.accountId, ctx.user.id);
        return getSuggestionsHistory(input.accountId);
      }),
    generate: protectedProcedure
      .input(z.object({ accountId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const account = await getVerifiedAccount(input.accountId, ctx.user.id);
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
        const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> =>
          Promise.race([promise, new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))]);
        try {
          adsetInsights = await withTimeout(getAdSetsWithInsights(account.accountId, account.accessToken, startDate, endDate), 15000);
          // Build adset->goal map for correct result extraction at ad level
          const adsetGoalMap = new Map(adsetInsights.map(a => [a.id, a.optimization_goal]));
          adInsights = await withTimeout(getAdsWithInsights(account.accountId, account.accessToken, startDate, endDate, adsetGoalMap), 15000);
        } catch (e: any) {
          if (e?.message === "timeout") {
            console.warn("[suggestions.generate] adInsights timeout — falling back to campaign-only");
          } else {
            console.error("[suggestions.generate] 3-level fetch failed, falling back to campaign-only:", e);
          }
        }
        const result = await generateAiSuggestions(input.accountId, ctx.user.id, account.goalTypeOverride ?? null, mapped, rejectedFeedback, adsetInsights, adInsights);
        return result;
      }),
    updateStatus: protectedProcedure
      .input(z.object({
        suggestionId: z.number(),
        accountId: z.number().optional(),
        status: z.enum(["applied", "rejected", "pending"]),
        rejectionReason: z.string().optional(),
        monitorDays: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        let metricsSnapshot: Record<string, any> | undefined = undefined;
        if (input.status === "applied" && input.accountId) {
          try {
            const now = new Date();
            const d7 = new Date(now.getTime() - 7 * 86400000);
            const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
            const metricRows = await getAccountMetricsSummary(input.accountId, fmt(d7), fmt(now));
            const agg = metricRows.reduce((acc: any, r: any) => {
              acc.spend += Number(r.totalSpend ?? 0);
              acc.conversions += Number(r.totalConversions ?? 0);
              acc.conversionValue += Number(r.totalConversionValue ?? 0);
              acc.clicks += Number(r.totalClicks ?? 0);
              acc.impressions += Number(r.totalImpressions ?? 0);
              return acc;
            }, { spend: 0, conversions: 0, conversionValue: 0, clicks: 0, impressions: 0 });
            metricsSnapshot = {
              snapshotAt: Date.now(),
              period: "7d",
              spend: agg.spend,
              conversions: agg.conversions,
              roas: agg.spend > 0 ? agg.conversionValue / agg.spend : 0,
              cpa: agg.conversions > 0 ? agg.spend / agg.conversions : 0,
              ctr: agg.impressions > 0 ? (agg.clicks / agg.impressions) * 100 : 0,
            };
          } catch (e) {
            metricsSnapshot = { snapshotAt: Date.now() };
          }
        }
        await updateSuggestionStatus(input.suggestionId, input.status, {
          rejectionReason: input.rejectionReason,
          metricsSnapshot,
          monitorDays: input.monitorDays,
        });
        return { success: true, monitorDays: input.monitorDays };
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

    getDailyBriefing: protectedProcedure.query(async ({ ctx }) => {
      const today = new Date().toISOString().split("T")[0];
      const cached = await getDailyBriefing(ctx.user.id, today);
      if (cached) return { content: cached };

      // Clientes globais → briefing considera todas as contas ativas.
      const accounts = await getAllActiveMetaAdAccountsForListing();
      if (!accounts.length) return { content: null };

      const now = new Date();
      const d48 = new Date(now.getTime() - 48 * 60 * 60 * 1000);
      const fmt48 = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
      const start48 = fmt48(d48);
      const end48 = fmt48(now);
      const metricsRows48 = await Promise.all(
        accounts.map(a => getAccountMetricsSummary(a.id, start48, end48))
      );
      const ROAS_GOALS = ["SALES", "VALUE"];
      const accountLines = accounts.map((a, idx) => {
        const rows = metricsRows48[idx] ?? [];
        const spend = rows.reduce((s, r) => s + Number(r.totalSpend ?? 0), 0).toFixed(2);
        const conversions = rows.reduce((s, r) => s + Number(r.totalConversions ?? 0), 0).toFixed(0);
        const convValue = rows.reduce((s, r) => s + Number(r.totalConversionValue ?? 0), 0);
        const spendNum = parseFloat(spend);
        const goal = (a as any).goalTypeOverride ?? "DEFAULT";
        const showRoas = ROAS_GOALS.includes(goal);
        const roas = spendNum > 0 ? (convValue / spendNum).toFixed(2) : "0.00";
        const estado = a.aiStatusColor ? { green: "A (saudável)", yellow: "B (atenção)", red: "C (crítico)" }[a.aiStatusColor as "green"|"yellow"|"red"] : "sem análise";
        const summary = showRoas ? (a.aiStatusSummary ?? "Sem análise") : "";
        const roasInfo = showRoas ? `, ROAS ${roas}x` : ` (objetivo: ${goal})`;
        const hasData = spendNum > 0;
        const resultLabel = showRoas ? `Conversões: ${conversions}` : `Resultados (${goal}): ${conversions}`;
        return `- ${a.accountName ?? a.accountId}: Estado ${estado}, Investido R$${spend}${roasInfo}, ${resultLabel}${!hasData ? " [SEM DADOS — pode estar inativa por decisão estratégica]" : ""}${summary ? ". " + summary : ""}`;
      }).join("\n");
      const prompt = `Você é um analista sênior de mídia paga da agência SELVA. Retorne um JSON com exatamente 4 campos: "resumo" (frase executiva fluida descrevendo o estado geral do portfólio — tom direto, termina com ponto final, máx 120 caracteres, NÃO liste apenas contagens), "positivo" (o que está indo bem — contas saudáveis, métricas positivas, 1-2 frases), "atencao" (contas que merecem monitoramento mas não são críticas, 1-2 frases), "critico" (problemas urgentes que precisam de ação imediata, 1-2 frases). Qualquer campo exceto "resumo" pode ser null se não houver nada relevante.
REGRAS CRÍTICAS:
- Contas com objetivo MESSAGES, TRAFFIC, ENGAGEMENT, AWARENESS: NUNCA mencione ROAS como problema — não se aplica a esses objetivos
- Contas marcadas como [SEM DADOS NAS ÚLTIMAS 48H]: não trate como críticas — podem estar inativas por decisão estratégica do cliente
- Foque nos padrões reais de performance, não em ausência de métricas irrelevantes para o objetivo
Dados (últimas 48h — hoje + ontem):
${accountLines}
Escreva em português brasileiro, de forma direta e profissional. Destaque padrões, o que está indo bem e o que precisa de atenção imediata. Não use markdown, listas ou tópicos — escreva em prosa corrida. Se os dados de hoje estiverem zerados, baseie-se nos dados de ontem que estão consolidados.`;

      const response = await invokeLLM({ messages: [{ role: "user", content: prompt }], maxTokens: 600, responseFormat: { type: "json_object" } });
      const rawContent = extractTextContent(response);
      let content = rawContent;
      try {
        const parsed = JSON.parse(rawContent);
        // Store as JSON string for structured rendering
        content = JSON.stringify({ resumo: parsed.resumo ?? null, positivo: parsed.positivo ?? null, atencao: parsed.atencao ?? null, critico: parsed.critico ?? null });
      } catch { /* keep raw text as fallback */ }
      await saveDailyBriefing(ctx.user.id, today, content);
      return { content };
    }),
  }),

  // ─── Alerts ───────────────────────────────────────────────────────────────────────────
  alerts: router({
    // Filter by accountId so each account only sees its own alerts
    list: protectedProcedure
      .input(z.object({ accountId: z.number() }))
      .query(async ({ ctx, input }) => {
        const account = await getVerifiedAccount(input.accountId, ctx.user.id);
        return getAlertsByAccountId(ctx.user.id, input.accountId);
      }),

    listUrgent: protectedProcedure.query(async ({ ctx }) => {
      return getUrgentAlertsForUser(ctx.user.id);
    }),

    listAll: protectedProcedure.query(async ({ ctx }) => {
      return getAllAlertsForUser(ctx.user.id);
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

    // Busca manual de alertas técnicos, além da checagem diária automática
    sync: protectedProcedure.mutation(async ({ ctx }) => {
      await syncAllForUser(ctx.user.id);
      return { success: true };
    }),

    clearNotifications: protectedProcedure.mutation(async ({ ctx }) => {
      await clearAllNotifications(ctx.user.id);
      return { success: true };
    }),
  }),// ─── Scheduled Reports ─────────────────────────────────────────────────────
  reports: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return getScheduledReportsByUserId(ctx.user.id);
    }),

    // TEMPORÁRIO — só pra validar o dado bruto visualmente. Remover quando
    // o fluxo de geração de verdade (reportService -> snapshot -> token público) existir.
    previewData: protectedProcedure
      .input(z.object({
        accountId: z.number(),
        periodStart: z.string(),
        periodEnd: z.string(),
        contextNotes: z.string().optional(),
        withNarrative: z.boolean().optional(),
      }))
      .query(async ({ ctx, input }) => {
        await getVerifiedAccount(input.accountId, ctx.user.id);
        const data = await assembleReportData(input.accountId, input.periodStart, input.periodEnd);
        if (!input.withNarrative) return { data, narrative: null };
        const narrative = await generateReportNarrative(data, input.contextNotes);
        return { data, narrative };
      }),

    generate: protectedProcedure
      .input(z.object({
        accountId: z.number(),
        periodStart: z.string(),
        periodEnd: z.string(),
        tier: z.enum(["CURTO", "MEDIO", "COMPLETO"]).default("CURTO"),
        contextNotes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await getVerifiedAccount(input.accountId, ctx.user.id);
        const data = await assembleReportData(input.accountId, input.periodStart, input.periodEnd);
        const narrative = await generateReportNarrative(data, input.contextNotes);
        const publicToken = nanoid(24);
        await createReportSnapshot({
          accountId: input.accountId,
          tier: input.tier,
          publicToken,
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
          contextNotes: input.contextNotes ?? null,
          dataSnapshot: JSON.stringify(data),
          narrative: JSON.stringify(narrative),
          generatedByUserId: ctx.user.id,
        });
        return { publicToken };
      }),

    getPublic: publicProcedure
      .input(z.object({ token: z.string() }))
      .query(async ({ input }) => {
        const snapshot = await getReportSnapshotByToken(input.token);
        if (!snapshot || !snapshot.isActive) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Relatório não encontrado" });
        }
        return {
          tier: snapshot.tier,
          period: { start: snapshot.periodStart, end: snapshot.periodEnd },
          data: JSON.parse(snapshot.dataSnapshot ?? "{}"),
          narrative: JSON.parse(snapshot.narrative ?? "null"),
        };
      }),

    listSnapshots: protectedProcedure
      .input(z.object({ accountId: z.number() }))
      .query(async ({ ctx, input }) => {
        await getVerifiedAccount(input.accountId, ctx.user.id);
        const rows = await getReportSnapshotsByAccountId(input.accountId);
        return rows.map((r) => ({
          id: r.id,
          tier: r.tier,
          publicToken: r.publicToken,
          periodStart: r.periodStart,
          periodEnd: r.periodEnd,
          generatedAt: r.generatedAt,
          isActive: r.isActive,
        }));
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
        const account = await getVerifiedAccount(input.accountId, ctx.user.id);
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
        const account = await getVerifiedAccount(input.accountId, ctx.user.id);

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

    generateDaily: publicProcedure.query(async () => {
      const EXCLUDED_ACCOUNTS = ["Victor Pereira", "CA - PE2 - BAESH"];
      const accounts = await getMetaAdAccountsByUserId(1);
      const activeAccounts = accounts.filter((a: any) => a.isActive && !EXCLUDED_ACCOUNTS.includes(a.accountName));

      if (activeAccounts.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "No active accounts found" });
      }

      // ── Client metrics configuration ─────────────────────────────
      // Maps account name patterns to their specific metric layout
      type ClientType = "ecommerce" | "messages" | "clicks";
      interface ClientConfig {
        displayName: string;
        type: ClientType;
        resultLabel: string; // Label for the primary result metric
        costLabel: string;   // Label for cost per result
        showRevenue: boolean;
        showRoas: boolean;
        showAddToCart: boolean;
        showLandingPageViews: boolean;
        showProfileVisits: boolean;
        showFollowers: boolean;
      }

      const CLIENT_CONFIG: Record<string, ClientConfig> = {
        "SELVA Agency": {
          displayName: "SELVA AGENCY",
          type: "clicks",
          resultLabel: "Cliques no Link",
          costLabel: "CPC",
          showRevenue: false, showRoas: false,
          showAddToCart: false, showLandingPageViews: false,
          showProfileVisits: true, showFollowers: true,
        },
        "C1-MNBR": {
          displayName: "MNBR",
          type: "messages",
          resultLabel: "Mensagens Iniciadas",
          costLabel: "CPA",
          showRevenue: false, showRoas: false,
          showAddToCart: false, showLandingPageViews: false,
          showProfileVisits: true, showFollowers: true,
        },
        "UMA COMERCIO E INDUSTRIA": {
          displayName: "UMA",
          type: "ecommerce",
          resultLabel: "Compras",
          costLabel: "CPA",
          showRevenue: true, showRoas: true,
          showAddToCart: false, showLandingPageViews: false,
          showProfileVisits: true, showFollowers: true,
        },
        "CA-BAESH": {
          displayName: "BAESH",
          type: "ecommerce",
          resultLabel: "Compras",
          costLabel: "CPA",
          showRevenue: true, showRoas: true,
          showAddToCart: false, showLandingPageViews: false,
          showProfileVisits: true, showFollowers: true,
        },
        "C1-ELWING": {
          displayName: "ELWING",
          type: "messages",
          resultLabel: "Mensagens Iniciadas",
          costLabel: "CPA",
          showRevenue: false, showRoas: false,
          showAddToCart: false, showLandingPageViews: false,
          showProfileVisits: true, showFollowers: true,
        },
        "C1-Ultra Malhas": {
          displayName: "ULTRAMALHAS",
          type: "messages",
          resultLabel: "Mensagens Iniciadas",
          costLabel: "CPA",
          showRevenue: false, showRoas: false,
          showAddToCart: false, showLandingPageViews: false,
          showProfileVisits: true, showFollowers: true,
        },
        "Scaffold Play": {
          displayName: "PLAY",
          type: "ecommerce",
          resultLabel: "Compras",
          costLabel: "CPA",
          showRevenue: true, showRoas: true,
          showAddToCart: true, showLandingPageViews: true,
          showProfileVisits: false, showFollowers: false,
        },
        "CA-Studio Zeca Marques": {
          displayName: "STUDIO ZECA MARQUES",
          type: "messages",
          resultLabel: "Mensagens Iniciadas",
          costLabel: "CPA",
          showRevenue: false, showRoas: false,
          showAddToCart: false, showLandingPageViews: false,
          showProfileVisits: true, showFollowers: true,
        },
      };

      // Default config for accounts not in the mapping
      const DEFAULT_CONFIG: ClientConfig = {
        displayName: "",
        type: "messages",
        resultLabel: "Conversões",
        costLabel: "CPA",
        showRevenue: true, showRoas: true,
        showAddToCart: false, showLandingPageViews: false,
        showProfileVisits: true, showFollowers: true,
      };

      function getClientConfig(accountName: string): ClientConfig {
        const cfg = CLIENT_CONFIG[accountName];
        if (cfg) return cfg;
        return { ...DEFAULT_CONFIG, displayName: accountName };
      }

      // ── Date setup — yesterday + day before yesterday for comparison ──
      const now = new Date();
      const spNow = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
      const yesterday = new Date(spNow);
      yesterday.setDate(yesterday.getDate() - 1);
      const dayBefore = new Date(spNow);
      dayBefore.setDate(dayBefore.getDate() - 2);
      const dateStr = yesterday.toISOString().split("T")[0];
      const prevDateStr = dayBefore.toISOString().split("T")[0];
      const fmtDate = dateStr.split("-").reverse().join("/");

      const accountResults: any[] = [];
      let totalSpend = 0, totalConversions = 0, totalConversionValue = 0;
      let totalImpressions = 0, totalClicks = 0;

      for (const acct of activeAccounts) {
        const cfg = getClientConfig(acct.accountName ?? "");
        try {
          // Fetch yesterday and day-before for comparison
          const [metricsYesterday, metricsPrev] = await Promise.all([
            getAccountMetricsSummary(acct.id, dateStr, dateStr),
            getAccountMetricsSummary(acct.id, prevDateStr, prevDateStr),
          ]);
          const d = metricsYesterday[0] || null;
          const p = metricsPrev[0] || null;

          const spend = Number(d?.totalSpend ?? 0);
          const conversions = Number(d?.totalConversions ?? 0);
          const conversionValue = Number(d?.totalConversionValue ?? 0);
          const impressions = Number(d?.totalImpressions ?? 0);
          const clicks = Number(d?.totalClicks ?? 0);
          const profileVisits = Number(d?.totalProfileVisits ?? 0);
          const followers = Number(d?.totalFollowers ?? 0);
          const messages = Number(d?.totalMessages ?? 0);
          const linkClicks = Number(d?.totalLinkClicks ?? 0);
          const addToCart = Number(d?.totalAddToCart ?? 0);
          const landingPageViews = Number(d?.totalLandingPageViews ?? 0);
          const roas = spend > 0 ? conversionValue / spend : 0;
          const cpa = conversions > 0 ? spend / conversions : 0;
          const cpc = clicks > 0 ? spend / clicks : 0;
          const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;

          // Previous day metrics for comparison
          const prevSpend = Number(p?.totalSpend ?? 0);
          const prevConversions = Number(p?.totalConversions ?? 0);
          const prevConversionValue = Number(p?.totalConversionValue ?? 0);
          const prevImpressions = Number(p?.totalImpressions ?? 0);
          const prevClicks = Number(p?.totalClicks ?? 0);
          const prevMessages = Number(p?.totalMessages ?? 0);
          const prevLinkClicks = Number(p?.totalLinkClicks ?? 0);
          const prevAddToCart = Number(p?.totalAddToCart ?? 0);
          const prevLandingPageViews = Number(p?.totalLandingPageViews ?? 0);
          const prevProfileVisits = Number(p?.totalProfileVisits ?? 0);
          const prevFollowers = Number(p?.totalFollowers ?? 0);
          const prevRoas = prevSpend > 0 ? prevConversionValue / prevSpend : 0;
          const prevCpa = prevConversions > 0 ? prevSpend / prevConversions : 0;
          const prevCpc = prevClicks > 0 ? prevSpend / prevClicks : 0;
          const prevCtr = prevImpressions > 0 ? (prevClicks / prevImpressions) * 100 : 0;

          totalSpend += spend;
          totalConversions += conversions;
          totalConversionValue += conversionValue;
          totalImpressions += impressions;
          totalClicks += clicks;

          // Determine the primary result value based on client type
          let resultValue = conversions;
          let prevResultValue = prevConversions;
          let costPerResult = cpa;
          let prevCostPerResult = prevCpa;
          if (cfg.type === "clicks") {
            // For SELVA: "Cliques no Link" uses linkClicks (from actions link_click)
            resultValue = linkClicks > 0 ? linkClicks : clicks;
            prevResultValue = prevLinkClicks > 0 ? prevLinkClicks : prevClicks;
            costPerResult = resultValue > 0 ? spend / resultValue : 0;
            prevCostPerResult = prevResultValue > 0 ? prevSpend / prevResultValue : 0;
          } else if (cfg.type === "messages") {
            // For message clients: prefer the specific "messages" field over generic conversions
            resultValue = messages > 0 ? messages : conversions;
            prevResultValue = prevMessages > 0 ? prevMessages : prevConversions;
            costPerResult = resultValue > 0 ? spend / resultValue : 0;
            prevCostPerResult = prevResultValue > 0 ? prevSpend / prevResultValue : 0;
          }

          accountResults.push({
            name: acct.accountName ?? acct.accountId,
            displayName: cfg.displayName || (acct.accountName ?? acct.accountId),
            config: cfg,
            spend, conversions, conversionValue, roas, cpa, cpc, ctr, clicks, impressions,
            profileVisits, followers, messages, linkClicks, addToCart, landingPageViews,
            resultValue, costPerResult,
            // Previous day for comparison
            prev: {
              spend: prevSpend, conversions: prevConversions, conversionValue: prevConversionValue,
              roas: prevRoas, cpa: prevCpa, cpc: prevCpc, ctr: prevCtr, clicks: prevClicks,
              messages: prevMessages, linkClicks: prevLinkClicks, addToCart: prevAddToCart,
              landingPageViews: prevLandingPageViews, profileVisits: prevProfileVisits, followers: prevFollowers,
              resultValue: prevResultValue, costPerResult: prevCostPerResult,
            },
            hasData: spend > 0,
          });
        } catch {
          accountResults.push({
            name: acct.accountName ?? acct.accountId,
            displayName: cfg.displayName || (acct.accountName ?? acct.accountId),
            config: cfg,
            spend: 0, conversions: 0, conversionValue: 0, roas: 0, cpa: 0, cpc: 0, ctr: 0, clicks: 0, impressions: 0,
            profileVisits: 0, followers: 0, messages: 0, linkClicks: 0, addToCart: 0, landingPageViews: 0,
            resultValue: 0, costPerResult: 0,
            prev: { spend: 0, conversions: 0, conversionValue: 0, roas: 0, cpa: 0, cpc: 0, ctr: 0, clicks: 0, messages: 0, linkClicks: 0, addToCart: 0, landingPageViews: 0, profileVisits: 0, followers: 0, resultValue: 0, costPerResult: 0 },
            hasData: false, error: true,
          });
        }
      }

      const accountsWithData = accountResults.filter((a: any) => a.hasData);

      const fmt = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const fmtInt = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });

      // ── Comparison helper — returns colored arrow + percentage ──
      function compArrow(current: number, previous: number, invertColor = false): string {
        if (previous === 0 && current === 0) return "";
        if (previous === 0) return `<span style="color:#22c55e;font-size:9px;margin-left:3px">NEW</span>`;
        const pct = ((current - previous) / previous) * 100;
        if (Math.abs(pct) < 0.5) return "";
        const up = pct > 0;
        // For CPA/CPC, going UP is bad (invert colors)
        const goodColor = invertColor ? (up ? "#ef4444" : "#22c55e") : (up ? "#22c55e" : "#ef4444");
        const arrow = up ? "&#9650;" : "&#9660;";
        return `<span style="color:${goodColor};font-size:9px;margin-left:3px">${arrow} ${Math.abs(pct).toFixed(0)}%</span>`;
      }

      // ── Individual AI Analysis per account (adapted) ─────────────
      function analyzeAccount(a: any): string {
        if (!a.hasData) return "Sem investimento no periodo. Verificar se campanhas estao ativas e com orcamento disponivel.";
        const parts: string[] = [];
        const cfg = a.config as ClientConfig;
        const prev = a.prev;

        // Spend comparison
        if (prev.spend > 0) {
          const spendDelta = ((a.spend - prev.spend) / prev.spend) * 100;
          if (Math.abs(spendDelta) > 5) {
            parts.push(`Investimento ${spendDelta > 0 ? "aumentou" : "diminuiu"} ${Math.abs(spendDelta).toFixed(0)}% vs dia anterior.`);
          }
        }

        if (cfg.type === "ecommerce") {
          if (a.roas >= 3) parts.push(`ROAS excelente de ${a.roas.toFixed(2)}x — escalar investimento pode ser viavel.`);
          else if (a.roas >= 1.5) parts.push(`ROAS de ${a.roas.toFixed(2)}x indica retorno positivo.`);
          else if (a.roas >= 1) parts.push(`ROAS de ${a.roas.toFixed(2)}x — proximo ao break-even. Revisar criativos.`);
          else if (a.conversionValue > 0) parts.push(`ROAS de ${a.roas.toFixed(2)}x abaixo do break-even.`);
          else parts.push(`Sem receita rastreada com R$ ${fmt(a.spend)} investidos.`);
        }

        if (cfg.type === "messages" || cfg.type === "clicks") {
          if (a.resultValue > 0 && a.costPerResult > 0) {
            if (a.costPerResult < 5) parts.push(`${cfg.costLabel} de R$ ${fmt(a.costPerResult)} — custo muito competitivo.`);
            else if (a.costPerResult < 15) parts.push(`${cfg.costLabel} de R$ ${fmt(a.costPerResult)} dentro do ideal.`);
            else if (a.costPerResult < 40) parts.push(`${cfg.costLabel} de R$ ${fmt(a.costPerResult)} dentro do aceitavel.`);
            else parts.push(`${cfg.costLabel} de R$ ${fmt(a.costPerResult)} elevado — revisar segmentacao e criativos.`);
          } else if (a.resultValue === 0 && a.spend > 20) {
            parts.push(`Nenhum resultado registrado com R$ ${fmt(a.spend)} investidos.`);
          }
        }

        if (cfg.type === "ecommerce" && a.conversions > 0) {
          if (a.cpa < 30) parts.push(`CPA de R$ ${fmt(a.cpa)} competitivo.`);
          else if (a.cpa < 80) parts.push(`CPA de R$ ${fmt(a.cpa)} aceitavel.`);
          else parts.push(`CPA de R$ ${fmt(a.cpa)} elevado — revisar funil.`);
        }

        if (a.ctr >= 3) parts.push(`CTR de ${a.ctr.toFixed(2)}% — engajamento alto.`);
        else if (a.ctr >= 1) parts.push(`CTR de ${a.ctr.toFixed(2)}% dentro da media.`);
        else if (a.ctr > 0 && a.ctr < 0.8) parts.push(`CTR de ${a.ctr.toFixed(2)}% abaixo do ideal — testar novos criativos.`);

        // Result comparison
        if (prev.resultValue > 0 && a.resultValue > 0) {
          const delta = ((a.resultValue - prev.resultValue) / prev.resultValue) * 100;
          if (Math.abs(delta) > 10) {
            parts.push(`${cfg.resultLabel}: ${delta > 0 ? "+" : ""}${delta.toFixed(0)}% vs dia anterior.`);
          }
        }

        return parts.join(" ");
      }

      // Attach analysis
      for (const a of accountResults) {
        a.analysis = analyzeAccount(a);
      }

      const subject = `[SELVA] Report Diario Meta Ads — ${fmtDate}`;

      // ── HTML — Build metric cell helper ───────────────────────────
      function metricCell(value: string, label: string, comparison: string, isLast = false): string {
        const border = isLast ? "" : "border-right:1px solid #eee;";
        return `<td style="padding:8px 4px;text-align:center;${border}">
          <div style="font-size:14px;font-weight:700;color:#1a1a1a">${value}${comparison}</div>
          <div style="font-size:9px;color:#999;margin-top:2px">${label}</div>
        </td>`;
      }

      // ── HTML — Per-account sections with custom metrics ──────────
      const accountSections = accountResults.map((a: any) => {
        const cfg = a.config as ClientConfig;
        const prev = a.prev;

        // Status color based on performance
        let statusColor = "#999";
        if (a.hasData) {
          if (cfg.type === "ecommerce") {
            statusColor = a.roas >= 1.5 ? "#22c55e" : a.roas >= 1 ? "#f59e0b" : "#ef4444";
          } else {
            statusColor = a.resultValue > 0 ? "#22c55e" : "#f59e0b";
          }
        }
        const statusDot = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${statusColor};margin-right:8px"></span>`;

        if (!a.hasData) {
          return `<div style="margin-bottom:16px;border:1px solid #e5e5e5;border-radius:8px;overflow:hidden">
  <div style="background:#1a1a1a;padding:10px 16px;display:flex;align-items:center">
    ${statusDot}<span style="font-size:14px;font-weight:700;color:#f5c6d0">${a.displayName}</span>
  </div>
  <div style="padding:12px 16px;background:#fff">
    <div style="padding:8px 0;color:#aaa;font-size:12px;font-style:italic">Sem investimento no periodo</div>
  </div>
</div>`;
        }

        // Build metric cells dynamically based on client config
        const cells: string[] = [];
        // 1. Investimento (always)
        cells.push(metricCell(`R$ ${fmt(a.spend)}`, "Investimento", compArrow(a.spend, prev.spend)));
        // 2. Resultado principal
        cells.push(metricCell(`${fmtInt(a.resultValue)}`, cfg.resultLabel, compArrow(a.resultValue, prev.resultValue)));
        // 3. Custo por resultado
        cells.push(metricCell(a.resultValue > 0 ? `R$ ${fmt(a.costPerResult)}` : "—", cfg.costLabel, a.resultValue > 0 ? compArrow(a.costPerResult, prev.costPerResult, true) : ""));
        // 4. Receita (e-commerce only)
        if (cfg.showRevenue) {
          cells.push(metricCell(`R$ ${fmt(a.conversionValue)}`, "Receita", compArrow(a.conversionValue, prev.conversionValue)));
        }
        // 5. ROAS (e-commerce only)
        if (cfg.showRoas) {
          const roasClr = a.roas >= 1 ? "#22c55e" : a.roas > 0 ? "#ef4444" : "#999";
          cells.push(`<td style="padding:8px 4px;text-align:center;border-right:1px solid #eee;">
            <div style="font-size:14px;font-weight:700;color:${roasClr}">${a.roas.toFixed(2)}x${compArrow(a.roas, prev.roas)}</div>
            <div style="font-size:9px;color:#999;margin-top:2px">ROAS</div>
          </td>`);
        }
        // 6. Add to Cart (PLAY only)
        if (cfg.showAddToCart) {
          cells.push(metricCell(a.addToCart > 0 ? fmtInt(a.addToCart) : "—", "Add Carrinho", a.addToCart > 0 ? compArrow(a.addToCart, prev.addToCart) : ""));
        }
        // 7. CTR (always)
        cells.push(metricCell(`${a.ctr.toFixed(2)}%`, "CTR", compArrow(a.ctr, prev.ctr)));
        // 8. Landing page views (PLAY only)
        if (cfg.showLandingPageViews) {
          cells.push(metricCell(a.landingPageViews > 0 ? fmtInt(a.landingPageViews) : "—", "Sessoes Site", a.landingPageViews > 0 ? compArrow(a.landingPageViews, prev.landingPageViews) : ""));
        }
        // 9. Profile visits
        if (cfg.showProfileVisits) {
          cells.push(metricCell(a.profileVisits > 0 ? fmtInt(a.profileVisits) : "—", "Visitas Perfil", a.profileVisits > 0 ? compArrow(a.profileVisits, prev.profileVisits) : ""));
        }
        // 10. Followers
        if (cfg.showFollowers) {
          cells.push(metricCell(a.followers > 0 ? fmtInt(a.followers) : "—", "Seguidores IG", a.followers > 0 ? compArrow(a.followers, prev.followers) : "", true));
        }

        // Ensure last cell has no right border
        if (cells.length > 0) {
          cells[cells.length - 1] = cells[cells.length - 1].replace(/border-right:1px solid #eee;?/g, "");
        }

        const colWidth = `${Math.floor(100 / cells.length)}%`;
        const cellsWithWidth = cells.map(c => c.replace(/<td style="/, `<td style="width:${colWidth};`));

        const metricsHtml = `<table style="width:100%;border-collapse:collapse;margin:10px 0 0"><tr>${cellsWithWidth.join("")}</tr></table>`;

        return `<div style="margin-bottom:16px;border:1px solid #e5e5e5;border-radius:8px;overflow:hidden">
  <div style="background:#1a1a1a;padding:10px 16px;display:flex;align-items:center">
    ${statusDot}<span style="font-size:14px;font-weight:700;color:#f5c6d0">${a.displayName}</span>
  </div>
  <div style="padding:12px 16px;background:#fff">
    ${metricsHtml}
    <div style="margin-top:10px;padding:10px 14px;background:#faf9fb;border-radius:6px;font-size:11px;color:#444;line-height:1.5">
      ${a.analysis}
    </div>
  </div>
</div>`;
      }).join("");

      const html = `<div style="font-family:Arial,sans-serif;max-width:780px;margin:0 auto;background:#f5f5f5">
  <div style="background:#1a1a1a;padding:20px 24px;text-align:center">
    <h1 style="color:#f5c6d0;margin:0;font-size:22px;letter-spacing:2px">SELVA AGENCY</h1>
    <p style="color:#777;margin:6px 0 0;font-size:13px">Report Diario Meta Ads — ${fmtDate}</p>
  </div>
  <div style="padding:20px 24px">
    ${accountSections}
    <p style="color:#aaa;font-size:10px;margin-top:8px;text-align:center">
      ${accountsWithData.length}/${activeAccounts.length} contas com investimento ·
      <a href="${process.env.APP_URL ?? 'http://localhost:3000'}" style="color:#f5c6d0">Abrir Dashboard</a> · SELVA Agency
    </p>
  </div>
</div>`;

      const plainText = `SELVA AGENCY — Report Meta Ads — ${fmtDate}\n\n` +
        accountResults.map((a: any) => {
          const cfg = a.config as ClientConfig;
          return `▸ ${a.displayName}\n  Invest: R$ ${fmt(a.spend)} | ${cfg.resultLabel}: ${fmtInt(a.resultValue)} | ${cfg.costLabel}: ${a.resultValue > 0 ? "R$ " + fmt(a.costPerResult) : "—"}${cfg.showRevenue ? " | Receita: R$ " + fmt(a.conversionValue) : ""}${cfg.showRoas ? " | ROAS: " + a.roas.toFixed(2) + "x" : ""} | CTR: ${a.hasData ? a.ctr.toFixed(2) + "%" : "—"}\n  ${a.analysis}\n`;
        }).join("\n") +
        `\n${accountsWithData.length}/${activeAccounts.length} contas com investimento`;

      return { subject, html, plainText, date: dateStr, accountCount: activeAccounts.length, accountsWithData: accountsWithData.length };
    }),

    // ─── Public endpoint to trigger daily report email (for testing & cron) ───
    sendDailyReport: publicProcedure.query(async () => {
      if (!isEmailConfigured()) {
        return { success: false, error: "SMTP not configured. Set SMTP_USER and SMTP_PASS env vars." };
      }
      try {
        // Fetch report data from the internal endpoint
        const res = await fetch("http://localhost:3000/api/trpc/reports.generateDaily");
        const json = await res.json();
        // tRPC superjson wraps response in result.data.json
        const data = json?.result?.data?.json ?? json?.result?.data;
        if (!data?.html || !data?.subject) {
          return { success: false, error: "Failed to generate report data", debug: JSON.stringify(json).slice(0, 500) };
        }
        const sent = await sendEmail({
          to: DAILY_REPORT_RECIPIENTS,
          subject: data.subject,
          html: data.html,
          text: data.plainText,
        });
        return { success: sent, subject: data.subject, recipients: DAILY_REPORT_RECIPIENTS, accountCount: data.accountCount, accountsWithData: data.accountsWithData };
      } catch (err: any) {
        return { success: false, error: err.message ?? String(err) };
      }
    }),

    // ─── Daily Development Progress Report ────────────────────────────────────
    generateDailyProgress: publicProcedure.query(async () => {
      const now = new Date();
      const spNow = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
      const todayStr = spNow.toISOString().split("T")[0];
      const fmtDate = todayStr.split("-").reverse().join("/");

      // Get today's git commits from GitHub API (source of truth)
      // The MANUS server git log doesn't have development commits — they live on GitHub's main branch
      let commits: { hash: string; time: string; msg: string }[] = [];
      let dataSourceFailed = false;
      const GITHUB_PAT = process.env.GITHUB_PAT || "";
      const GITHUB_REPO = "SelvaAgency/meta-ads-dashboard";

      try {
        if (!GITHUB_PAT) {
          console.warn("[DailyProgress] GITHUB_PAT not configured — falling back to local git");
          dataSourceFailed = true;
          throw new Error("No GITHUB_PAT");
        }
        const since = `${todayStr}T00:00:00-03:00`;
        const until = `${todayStr}T23:59:59-03:00`;
        const apiUrl = `https://api.github.com/repos/${GITHUB_REPO}/commits?since=${encodeURIComponent(since)}&until=${encodeURIComponent(until)}&sha=main&per_page=100`;

        const ghRes = await fetch(apiUrl, {
          headers: {
            "Authorization": `token ${GITHUB_PAT}`,
            "Accept": "application/vnd.github.v3+json",
            "User-Agent": "selva-dashboard",
          },
        });

        if (ghRes.ok) {
          const ghData = await ghRes.json() as any[];
          commits = ghData
            .filter((c: any) => !c.parents || c.parents.length <= 1) // skip merge commits
            .map((c: any) => ({
              hash: (c.sha || "").substring(0, 7),
              time: c.commit?.author?.date || "",
              msg: (c.commit?.message || "").split("\n")[0], // first line only
            }));
          console.log(`[DailyProgress] GitHub API returned ${ghData.length} commits, ${commits.length} after filtering merges`);
        } else {
          console.error(`[DailyProgress] GitHub API error: ${ghRes.status} ${ghRes.statusText}`);
          dataSourceFailed = true;
        }
      } catch (err) {
        console.error("[DailyProgress] GitHub API fetch failed:", err);
        dataSourceFailed = true;
      }

      // Fallback: try local git log if GitHub API failed
      if (dataSourceFailed) {
        try {
          const gitLog = execSync(
            `cd /home/ubuntu/meta-ads-dashboard && git log --all --since="${todayStr}T00:00:00-03:00" --until="${todayStr}T23:59:59-03:00" --pretty=format:"%h|%ai|%s" --no-merges 2>/dev/null || echo ""`,
            { encoding: "utf-8", timeout: 10000 }
          ).trim();
          if (gitLog) {
            commits = gitLog.split("\n").filter(Boolean).map((line: string) => {
              const [hash, time, ...msgParts] = line.split("|");
              return { hash: hash || "", time: time || "", msg: msgParts.join("|") || "" };
            });
            console.log(`[DailyProgress] Local git fallback found ${commits.length} commits`);
          }
        } catch { /* local git also failed */ }
      }

      // Categorize commits into friendly categories
      function categorizeCommit(msg: string): { icon: string; category: string } {
        const m = msg.toLowerCase();
        if (m.includes("fix") || m.includes("corrig") || m.includes("bug")) return { icon: "🔧", category: "Correção" };
        if (m.includes("feat") || m.includes("add") || m.includes("implement") || m.includes("criar") || m.includes("adicionar")) return { icon: "✨", category: "Nova Feature" };
        if (m.includes("refactor") || m.includes("refatora") || m.includes("reestrutur")) return { icon: "♻️", category: "Refatoração" };
        if (m.includes("style") || m.includes("visual") || m.includes("css") || m.includes("theme") || m.includes("layout")) return { icon: "🎨", category: "Visual" };
        if (m.includes("deploy") || m.includes("build") || m.includes("config")) return { icon: "🚀", category: "Deploy/Config" };
        if (m.includes("report") || m.includes("email") || m.includes("notification")) return { icon: "📧", category: "Relatórios" };
        if (m.includes("sync") || m.includes("api") || m.includes("meta") || m.includes("google")) return { icon: "🔄", category: "Integração" };
        if (m.includes("test") || m.includes("audit")) return { icon: "🧪", category: "Teste/Auditoria" };
        return { icon: "📝", category: "Atualização" };
      }

      // Friendly commit message cleanup
      function friendlyMsg(msg: string): string {
        return msg
          .replace(/^(feat|fix|refactor|chore|style|docs|test|ci|perf|build)(\(.+?\))?:\s*/i, "")
          .replace(/^(add|implement|create|update|remove|delete|fix|correct)\s+/i, (m) => m)
          .trim();
      }

      const subject = `[SELVA] Progresso do Dashboard — ${fmtDate}`;

      // Build commit items HTML
      const commitItems = commits.map((c) => {
        const { icon, category } = categorizeCommit(c.msg);
        const friendlyText = friendlyMsg(c.msg);
        const time = c.time ? new Date(c.time).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }) : "";
        return `<tr>
          <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;width:40px;text-align:center;font-size:18px">${icon}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0">
            <div style="font-size:13px;color:#1a1a1a;font-weight:500">${friendlyText}</div>
            <div style="font-size:10px;color:#999;margin-top:2px">${category} · ${time} · <code style="background:#f5f5f5;padding:1px 4px;border-radius:3px;font-size:10px">${c.hash}</code></div>
          </td>
        </tr>`;
      }).join("");

      const noCommitsMsg = dataSourceFailed
        ? `<div style="padding:24px;text-align:center;color:#e57373;font-size:13px;font-style:italic">
            ⚠️ Falha ao consultar o histórico de commits (GitHub API + git local). Verificar token ou conectividade do servidor.
          </div>`
        : `<div style="padding:24px;text-align:center;color:#999;font-size:13px;font-style:italic">
            Nenhuma alteração registrada no código hoje. O time pode estar planejando, revisando ou trabalhando em tarefas fora do repositório.
          </div>`;

      // Summary stats
      const categories = commits.reduce((acc: Record<string, number>, c) => {
        const { category } = categorizeCommit(c.msg);
        acc[category] = (acc[category] || 0) + 1;
        return acc;
      }, {});
      const categoryBadges = Object.entries(categories).map(([cat, count]) =>
        `<span style="display:inline-block;background:#f5f5f5;border-radius:12px;padding:3px 10px;margin:2px 4px;font-size:11px;color:#555">${cat}: ${count}</span>`
      ).join("");

      const html = `<div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;background:#f9f9f9">
  <div style="background:#1a1a1a;padding:20px 24px;text-align:center">
    <h1 style="color:#f5c6d0;margin:0;font-size:20px;letter-spacing:2px">SELVA AGENCY</h1>
    <p style="color:#777;margin:6px 0 0;font-size:12px">Progresso do Dashboard — ${fmtDate}</p>
  </div>
  <div style="padding:20px 24px">
    <div style="background:#fff;border-radius:8px;border:1px solid #e5e5e5;overflow:hidden;margin-bottom:16px">
      <div style="background:#f5c6d0;padding:12px 16px">
        <h2 style="margin:0;font-size:15px;color:#1a1a1a;font-weight:700">Resumo do dia</h2>
      </div>
      <div style="padding:14px 16px">
        <div style="font-size:28px;font-weight:800;color:#1a1a1a;margin-bottom:4px">${commits.length}</div>
        <div style="font-size:12px;color:#777;margin-bottom:10px">${commits.length === 1 ? "alteração realizada" : "alterações realizadas"} hoje no dashboard</div>
        ${categoryBadges ? `<div style="margin-top:8px">${categoryBadges}</div>` : ""}
      </div>
    </div>
    <div style="background:#fff;border-radius:8px;border:1px solid #e5e5e5;overflow:hidden">
      <div style="background:#1a1a1a;padding:10px 16px">
        <h3 style="margin:0;font-size:13px;color:#f5c6d0;font-weight:600">O que foi feito hoje</h3>
      </div>
      ${commits.length > 0 ? `<table style="width:100%;border-collapse:collapse">${commitItems}</table>` : noCommitsMsg}
    </div>
    <p style="color:#aaa;font-size:10px;margin-top:12px;text-align:center">
      <a href="${process.env.APP_URL ?? 'http://localhost:3000'}" style="color:#f5c6d0">Abrir Dashboard</a> · SELVA Agency · Relatório automático de progresso
    </p>
  </div>
</div>`;

      const plainText = `SELVA AGENCY — Progresso do Dashboard — ${fmtDate}\n\n` +
        (commits.length > 0
          ? commits.map((c) => `• ${friendlyMsg(c.msg)} (${c.hash})`).join("\n")
          : "Nenhuma alteração registrada hoje.") +
        `\n\nTotal: ${commits.length} alteração(ões)`;

      return { subject, html, plainText, date: todayStr, commitCount: commits.length, dataSourceFailed };
    }),

    // ─── Public endpoint to trigger progress report email ───
    sendDailyProgress: publicProcedure.query(async () => {
      if (!isEmailConfigured()) {
        return { success: false, error: "SMTP not configured." };
      }
      try {
        const res = await fetch("http://localhost:3000/api/trpc/reports.generateDailyProgress");
        const json = await res.json();
        const data = json?.result?.data?.json ?? json?.result?.data;
        if (!data?.html || !data?.subject) {
          return { success: false, error: "Failed to generate progress report", debug: JSON.stringify(json).slice(0, 500) };
        }
        const sent = await sendEmail({
          to: DAILY_REPORT_RECIPIENTS,
          subject: data.subject,
          html: data.html,
          text: data.plainText,
        });
        return { success: sent, subject: data.subject, recipients: DAILY_REPORT_RECIPIENTS, commitCount: data.commitCount };
      } catch (err: any) {
        return { success: false, error: err.message ?? String(err) };
      }
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

  // ─── Social Networks (Pages + Instagram from SELVA Portfolio) ────────────
  socialNetworks: router({
    list: protectedProcedure.query(async () => {
      const accounts = await getMetaAdAccountsByUserId(1);
      if (!accounts.length) return { pages: [] };
      const token = accounts[0].accessToken;
      const BUSINESS_ID = "803399908519541";

      // Hard global timeout — guarantee response within 10s
      const fetchPages = async (): Promise<{ pages: any[]; error?: string }> => {
        const pageMap = new Map<string, any>();

        // Try owned_pages first (most reliable for System User)
        for (const edge of ["owned_pages", "client_pages"]) {
          try {
            const url = `https://graph.facebook.com/v21.0/${BUSINESS_ID}/${edge}?fields=id,name,category,fan_count,picture{url},instagram_business_account{id,username,followers_count,media_count,profile_picture_url,biography}&limit=100&access_token=${token}`;
            const res = await Promise.race([
              fetch(url),
              new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 8000))
            ]);
            const data = await res.json() as any;
            if (data.data) {
              for (const page of data.data) {
                if (page.id && !pageMap.has(page.id)) {
                  pageMap.set(page.id, page);
                }
              }
            }
            logger.info(`[socialNetworks.list] ${edge}: found ${data.data?.length ?? 0} pages`);
          } catch (e: any) {
            logger.info(`[socialNetworks.list] ${edge} failed: ${e.message}`);
          }
        }

        const pages = Array.from(pageMap.values());
        logger.info(`[socialNetworks.list] Total: ${pages.length} pages`);
        if (pages.length > 0) return { pages };
        return { pages: [], error: "Nenhuma página encontrada. Verifique permissões do token." };
      };

      try {
        return await Promise.race([
          fetchPages(),
          new Promise<{ pages: any[]; error: string }>((resolve) =>
            setTimeout(() => resolve({ pages: [], error: "Timeout ao buscar páginas (10s)" }), 10000)
          )
        ]);
      } catch (e: any) {
        console.error("[socialNetworks.list] Error:", e.message);
        return { pages: [], error: e.message };
      }
    }),

    pageInsights: protectedProcedure
      .input(z.object({ pageId: z.string(), period: z.enum(["day", "week_28", "days_28"]).optional(), since: z.string().optional(), until: z.string().optional() }))
      .query(async ({ input }) => {
        const accounts = await getMetaAdAccountsByUserId(1);
        if (!accounts.length) return null;
        const systemToken = accounts[0].accessToken;
        const period = input.period ?? "days_28";
        const BUSINESS_ID = "803399908519541";
        try {
          // 0. Get page data via Business Portfolio edges (same approach as forAccount)
          //    IMPORTANT: Do NOT include 'access_token' in fields — System User tokens
          //    can list pages but requesting access_token causes silent failures.
          let pageData: any = null;
          const PAGE_FIELDS = "id,name,fan_count,followers_count,new_like_count,talking_about_count,picture{url},instagram_business_account{id,username,followers_count,media_count,profile_picture_url,biography}";

          // Fetch both edges in parallel for speed
          const edgeResults = await Promise.allSettled(
            ["owned_pages", "client_pages"].map(async (edge) => {
              const ctrl = new AbortController();
              const t = setTimeout(() => ctrl.abort(), 12000);
              const url = `https://graph.facebook.com/v21.0/${BUSINESS_ID}/${edge}?fields=${PAGE_FIELDS}&limit=100&access_token=${systemToken}`;
              const res = await fetch(url, { signal: ctrl.signal });
              clearTimeout(t);
              return res.json() as Promise<any>;
            })
          );

          for (const result of edgeResults) {
            if (result.status === "fulfilled" && result.value?.data) {
              const match = result.value.data.find((p: any) => p.id === input.pageId);
              if (match) {
                pageData = { ...match };
                logger.info(`[socialNetworks.pageInsights] Found page ${input.pageId} via portfolio edge`);
                break;
              }
            }
          }

          if (!pageData) {
            logger.info(`[socialNetworks.pageInsights] Page ${input.pageId} not found in portfolio edges`);
            return { id: input.pageId, _fbMetrics: null, _igMetrics: null, _recentPosts: [] };
          }

          // 1. FB Page Insights — best-effort (will likely fail with System User token)
          let fbMetrics: any = null;
          try {
            const ctrl2 = new AbortController();
            const t2 = setTimeout(() => ctrl2.abort(), 8000);
            const metricsUrl = `https://graph.facebook.com/v21.0/${input.pageId}/insights?metric=page_impressions,page_impressions_unique,page_engaged_users,page_post_engagements,page_fan_adds,page_views_total,page_actions_post_reactions_total&period=${period}&access_token=${systemToken}`;
            const mRes = await fetch(metricsUrl, { signal: ctrl2.signal });
            clearTimeout(t2);
            const mData = await mRes.json() as any;
            if (mData.data && !mData.error) {
              fbMetrics = {};
              for (const metric of mData.data) {
                const vals = metric.values ?? [];
                const lastVal = vals[vals.length - 1]?.value ?? 0;
                const numVal = typeof lastVal === "object" ? Object.values(lastVal as Record<string, number>).reduce((a: number, b: number) => a + b, 0) : Number(lastVal) || 0;
                fbMetrics[metric.name] = numVal;
              }
            }
          } catch {}

          // 2. Instagram Insights + Media — best-effort
          let igMetrics: any = null;
          let recentPosts: any[] = [];
          const igId = pageData.instagram_business_account?.id;
          if (igId) {
            // IG insights (will likely fail without page token)
            try {
              const ctrl3 = new AbortController();
              const t3 = setTimeout(() => ctrl3.abort(), 8000);
              const sinceTs = input.since 
                ? Math.floor(new Date(input.since).getTime()/1000)
                : Math.floor(Date.now()/1000) - 28*86400;
              const untilTs = input.until
                ? Math.floor(new Date(input.until + "T23:59:59").getTime()/1000)
                : Math.floor(Date.now()/1000);
              const igUrl = `https://graph.facebook.com/v21.0/${igId}/insights?metric=impressions,reach,accounts_engaged,profile_views&period=day&metric_type=total_value&since=${sinceTs}&until=${untilTs}&access_token=${systemToken}`;
              const igRes = await fetch(igUrl, { signal: ctrl3.signal });
              clearTimeout(t3);
              const igData = await igRes.json() as any;
              if (igData.data && !igData.error) {
                igMetrics = {};
                for (const metric of igData.data) {
                  const totalValue = metric.total_value?.value ?? 0;
                  igMetrics[metric.name] = Number(totalValue) || 0;
                }
              }
            } catch {}

            // IG media (recent posts)
            try {
              const ctrl4 = new AbortController();
              const t4 = setTimeout(() => ctrl4.abort(), 8000);
              const mediaUrl = `https://graph.facebook.com/v21.0/${igId}/media?fields=id,like_count,comments_count,timestamp,media_url,thumbnail_url,media_type,caption,permalink&limit=25&access_token=${systemToken}`;
              const mediaRes = await fetch(mediaUrl, { signal: ctrl4.signal });
              clearTimeout(t4);
              const mediaData = await mediaRes.json() as any;
              if (mediaData.data && !mediaData.error) {
                const posts = mediaData.data;
                recentPosts = posts;
                const totalLikes = posts.reduce((s: number, p: any) => s + (p.like_count ?? 0), 0);
                const totalComments = posts.reduce((s: number, p: any) => s + (p.comments_count ?? 0), 0);
                if (!igMetrics) igMetrics = {};
                igMetrics.recent_posts = posts.length;
                igMetrics.recent_likes = totalLikes;
                igMetrics.recent_comments = totalComments;
                igMetrics.avg_likes = posts.length > 0 ? Math.round(totalLikes / posts.length) : 0;
                igMetrics.avg_comments = posts.length > 0 ? Math.round(totalComments / posts.length) : 0;
              }
            } catch {}
          }

          return { ...pageData, _fbMetrics: fbMetrics, _igMetrics: igMetrics, _recentPosts: recentPosts };
        } catch (e: any) {
          console.error("[socialNetworks.pageInsights] Error:", e.message);
          return null;
        }
      }),

    // ─── Paid metrics for the Social Networks tab ──────────────────────────
    socialPaidMetrics: protectedProcedure
      .input(z.object({ accountId: z.number(), startDate: z.string(), endDate: z.string() }))
      .query(async ({ input }) => {
        try {
          const rows = await getAccountMetricsSummary(input.accountId, input.startDate, input.endDate);
          if (!rows || rows.length === 0) return null;
          // Aggregate all days into a single summary
          let totalSpend = 0, totalImpressions = 0, totalClicks = 0, totalConversions = 0, totalConversionValue = 0, totalReach = 0;
          for (const r of rows) {
            totalSpend += Number(r.totalSpend) || 0;
            totalImpressions += Number(r.totalImpressions) || 0;
            totalClicks += Number(r.totalClicks) || 0;
            totalConversions += Number(r.totalConversions) || 0;
            totalConversionValue += Number(r.totalConversionValue) || 0;
            totalReach += Number(r.totalReach) || 0;
          }
          return {
            spend: totalSpend,
            impressions: totalImpressions,
            clicks: totalClicks,
            conversions: totalConversions,
            conversionValue: totalConversionValue,
            reach: totalReach,
            ctr: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0,
            cpc: totalClicks > 0 ? totalSpend / totalClicks : 0,
            cpm: totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000 : 0,
            roas: totalSpend > 0 ? totalConversionValue / totalSpend : 0,
            cpa: totalConversions > 0 ? totalSpend / totalConversions : 0,
          };
        } catch (e: any) {
          console.error("[socialNetworks.socialPaidMetrics] Error:", e.message);
          return null;
        }
      }),

        // ─── Pages filtered by ad account (for per-client filtering) ─────────
    forAccount: protectedProcedure
      .input(z.object({ accountId: z.number() }))
      .query(async ({ input }) => {
        const account = await getMetaAdAccountById(input.accountId);
        if (!account) return { pages: [], error: "Conta não encontrada" };
        const token = account.accessToken;
        const metaId = account.accountId; // e.g. "2060651151073806"
        const BUSINESS_ID = "803399908519541";

        const PAGE_FIELDS = "id,name,category,fan_count,picture{url},instagram_business_account{id,username,followers_count,media_count,profile_picture_url,biography}";

        // Helper: fetch ALL portfolio pages from business (owned + client)
        // Cached per-request so Strategy 0 and Strategy 3 don't double-fetch
        let _portfolioCache: Map<string, any> | null = null;
        const fetchAllPortfolioPages = async (): Promise<Map<string, any>> => {
          if (_portfolioCache) return _portfolioCache;
          const pageMap = new Map<string, any>();
          // Fetch both edges in parallel for speed
          const results = await Promise.allSettled(
            ["owned_pages", "client_pages"].map(async (edge) => {
              const url = `https://graph.facebook.com/v21.0/${BUSINESS_ID}/${edge}?fields=${PAGE_FIELDS}&limit=100&access_token=${token}`;
              const res = await fetch(url);
              return res.json() as Promise<any>;
            })
          );
          for (const result of results) {
            if (result.status === "fulfilled" && result.value?.data) {
              for (const page of result.value.data) {
                if (page.id && !pageMap.has(page.id)) pageMap.set(page.id, page);
              }
            }
          }
          logger.info(`[socialNetworks.forAccount] Portfolio cache loaded: ${pageMap.size} pages`);
          _portfolioCache = pageMap;
          return pageMap;
        };

        const fetchPagesForAccount = async (): Promise<{ pages: any[]; error?: string; fallback?: boolean }> => {
          // Strategy 0 (primary): Use hardcoded page mapping + portfolio fetch + filter
          // We fetch ALL portfolio pages first, then filter by the known IDs.
          // This is reliable because the System User token can read portfolio edges
          // but NOT individual pages by ID directly.
          const knownPageIds = getPageIdsForAdAccount(metaId);

          if (knownPageIds && knownPageIds.length > 0) {
            logger.info(`[socialNetworks.forAccount] Strategy 0: filtering portfolio by mapping for act_${metaId} → pageIds: [${knownPageIds.join(",")}]`);
            const allPages = await fetchAllPortfolioPages();
            const filtered = knownPageIds
              .map(pid => allPages.get(pid))
              .filter(Boolean);
            if (filtered.length > 0) {
              logger.info(`[socialNetworks.forAccount] Strategy 0 SUCCESS: ${filtered.length} pages matched for act_${metaId}`);
              return { pages: filtered };
            }
            logger.info(`[socialNetworks.forAccount] Strategy 0 FAILED: no matches in ${allPages.size} portfolio pages for IDs [${knownPageIds.join(",")}]`);
          }

          // If mapping exists but is empty (client has no dedicated page), return empty
          if (knownPageIds && knownPageIds.length === 0) {
            logger.info(`[socialNetworks.forAccount] No pages mapped for act_${metaId}`);
            return { pages: [], error: "Esta conta não possui página Facebook vinculada no portfólio" };
          }

          // Strategy 1: promote_pages edge on ad account
          try {
            const url = `https://graph.facebook.com/v21.0/act_${metaId}/promote_pages?fields=${PAGE_FIELDS}&limit=100&access_token=${token}`;
            const res = await Promise.race([
              fetch(url),
              new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 8000))
            ]);
            const data = await res.json() as any;
            if (data.data && data.data.length > 0) {
              logger.info(`[socialNetworks.forAccount] Strategy 1 (promote_pages) for act_${metaId}: ${data.data.length} pages`);
              return { pages: data.data };
            }
          } catch (e: any) {
            logger.info(`[socialNetworks.forAccount] Strategy 1 failed: ${e.message}`);
          }

          // Strategy 2: Find pages from recent ad creatives, then filter from portfolio
          try {
            const url = `https://graph.facebook.com/v21.0/act_${metaId}/ads?fields=creative{effective_object_story_id,object_story_spec}&limit=50&access_token=${token}`;
            const res = await Promise.race([
              fetch(url),
              new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 8000))
            ]);
            const data = await res.json() as any;
            const creativePageIds = new Set<string>();
            if (data.data) {
              for (const ad of data.data) {
                const storyId = ad.creative?.effective_object_story_id;
                if (storyId) {
                  const pageId = storyId.split("_")[0];
                  if (pageId) creativePageIds.add(pageId);
                }
                const specPageId = ad.creative?.object_story_spec?.page_id;
                if (specPageId) creativePageIds.add(specPageId);
              }
            }
            if (creativePageIds.size > 0) {
              logger.info(`[socialNetworks.forAccount] Strategy 2: ${creativePageIds.size} page IDs from creatives for act_${metaId}`);
              const allPages = await fetchAllPortfolioPages();
              const pages = Array.from(creativePageIds)
                .map(pid => allPages.get(pid))
                .filter(Boolean);
              if (pages.length > 0) return { pages };
            }
          } catch (e: any) {
            logger.info(`[socialNetworks.forAccount] Strategy 2 failed: ${e.message}`);
          }

          // Strategy 3: Fallback — return ALL portfolio pages
          logger.info(`[socialNetworks.forAccount] Strategy 3 FALLBACK: all portfolio pages for act_${metaId}`);
          const allPages = await fetchAllPortfolioPages();
          return { pages: Array.from(allPages.values()), fallback: true };
        };

        try {
          return await Promise.race([
            fetchPagesForAccount(),
            new Promise<{ pages: any[]; error: string }>((resolve) =>
              setTimeout(() => resolve({ pages: [], error: "Timeout (25s)" }), 25000)
            )
          ]);
        } catch (e: any) {
          return { pages: [], error: e.message };
        }
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

  // ─── GA4 Analytics ─────────────────────────────────────────────────────────
  ga4: router({
    isConfigured: publicProcedure.query(() => {
      return { configured: isGA4Configured() };
    }),

    accounts: protectedProcedure.query(async ({ ctx }) => {
      return getGA4AccountsByUserId(ctx.user.id);
    }),

    connectAccount: protectedProcedure
      .input(z.object({
        propertyId: z.string().min(1),
        propertyName: z.string().optional(),
        websiteUrl: z.string().optional(),
        refreshToken: z.string().min(1),
        currency: z.string().optional(),
        timezone: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const id = await createGA4Account({
          userId: ctx.user.id,
          propertyId: input.propertyId,
          propertyName: input.propertyName ?? null,
          websiteUrl: input.websiteUrl ?? null,
          refreshToken: input.refreshToken,
          currency: input.currency ?? "BRL",
          timezone: input.timezone ?? "America/Sao_Paulo",
        });
        return { success: true, id };
      }),

    disconnectAccount: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteGA4Account(input.id);
        return { success: true };
      }),

    properties: protectedProcedure
      .input(z.object({ refreshToken: z.string().min(1) }))
      .query(async ({ input }) => {
        const config = getGA4Config(input.refreshToken);
        return listGA4Properties(config);
      }),

    overview: protectedProcedure
      .input(z.object({
        accountId: z.number(),
        days: z.number().min(1).max(365).default(30),
      }))
      .query(async ({ input }) => {
        const acct = await getGA4AccountById(input.accountId);
        if (!acct) throw new TRPCError({ code: "NOT_FOUND", message: "GA4 account not found" });
        const config = getGA4Config(acct.refreshToken);
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - input.days);
        const fmt = (d: Date) => d.toISOString().split("T")[0];
        const data = await getGA4Overview(config, acct.propertyId, fmt(start), fmt(end));
        await updateGA4AccountSync(acct.id);
        return data;
      }),

    dailyMetrics: protectedProcedure
      .input(z.object({
        accountId: z.number(),
        days: z.number().min(1).max(365).default(30),
      }))
      .query(async ({ input }) => {
        const acct = await getGA4AccountById(input.accountId);
        if (!acct) throw new TRPCError({ code: "NOT_FOUND", message: "GA4 account not found" });
        const config = getGA4Config(acct.refreshToken);
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - input.days);
        const fmt = (d: Date) => d.toISOString().split("T")[0];
        return getGA4DailyMetrics(config, acct.propertyId, fmt(start), fmt(end));
      }),

    trafficSources: protectedProcedure
      .input(z.object({
        accountId: z.number(),
        days: z.number().min(1).max(365).default(30),
        limit: z.number().min(1).max(50).default(10),
      }))
      .query(async ({ input }) => {
        const acct = await getGA4AccountById(input.accountId);
        if (!acct) throw new TRPCError({ code: "NOT_FOUND", message: "GA4 account not found" });
        const config = getGA4Config(acct.refreshToken);
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - input.days);
        const fmt = (d: Date) => d.toISOString().split("T")[0];
        return getGA4TrafficSources(config, acct.propertyId, fmt(start), fmt(end), input.limit);
      }),

    topPages: protectedProcedure
      .input(z.object({
        accountId: z.number(),
        days: z.number().min(1).max(365).default(30),
        limit: z.number().min(1).max(50).default(10),
      }))
      .query(async ({ input }) => {
        const acct = await getGA4AccountById(input.accountId);
        if (!acct) throw new TRPCError({ code: "NOT_FOUND", message: "GA4 account not found" });
        const config = getGA4Config(acct.refreshToken);
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - input.days);
        const fmt = (d: Date) => d.toISOString().split("T")[0];
        return getGA4TopPages(config, acct.propertyId, fmt(start), fmt(end), input.limit);
      }),

    devices: protectedProcedure
      .input(z.object({
        accountId: z.number(),
        days: z.number().min(1).max(365).default(30),
      }))
      .query(async ({ input }) => {
        const acct = await getGA4AccountById(input.accountId);
        if (!acct) throw new TRPCError({ code: "NOT_FOUND", message: "GA4 account not found" });
        const config = getGA4Config(acct.refreshToken);
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - input.days);
        const fmt = (d: Date) => d.toISOString().split("T")[0];
        return getGA4DeviceBreakdown(config, acct.propertyId, fmt(start), fmt(end));
      }),

    geo: protectedProcedure
      .input(z.object({
        accountId: z.number(),
        days: z.number().min(1).max(365).default(30),
        limit: z.number().min(1).max(50).default(10),
      }))
      .query(async ({ input }) => {
        const acct = await getGA4AccountById(input.accountId);
        if (!acct) throw new TRPCError({ code: "NOT_FOUND", message: "GA4 account not found" });
        const config = getGA4Config(acct.refreshToken);
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - input.days);
        const fmt = (d: Date) => d.toISOString().split("T")[0];
        return getGA4GeoBreakdown(config, acct.propertyId, fmt(start), fmt(end), input.limit);
      }),

    conversions: protectedProcedure
      .input(z.object({
        accountId: z.number(),
        days: z.number().min(1).max(365).default(30),
      }))
      .query(async ({ input }) => {
        const acct = await getGA4AccountById(input.accountId);
        if (!acct) throw new TRPCError({ code: "NOT_FOUND", message: "GA4 account not found" });
        const config = getGA4Config(acct.refreshToken);
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - input.days);
        const fmt = (d: Date) => d.toISOString().split("T")[0];
        return getGA4Conversions(config, acct.propertyId, fmt(start), fmt(end));
      }),

    diagnose: protectedProcedure.query(async ({ ctx }) => {
      const results: any[] = [];
      const accounts = await getGA4AccountsByUserId(ctx.user.id);
      for (const acct of accounts) {
        try {
          const config = getGA4Config(acct.refreshToken);
          const end = new Date();
          const start = new Date();
          start.setDate(start.getDate() - 7);
          const fmt = (d: Date) => d.toISOString().split("T")[0];
          const overview = await getGA4Overview(config, acct.propertyId, fmt(start), fmt(end));
          results.push({
            id: acct.id,
            propertyId: acct.propertyId,
            name: acct.propertyName,
            status: "OK",
            sessions: overview.sessions,
            users: overview.totalUsers,
          });
        } catch (err: any) {
          results.push({
            id: acct.id,
            propertyId: acct.propertyId,
            name: acct.propertyName,
            status: "ERROR",
            error: err?.message ?? String(err),
          });
        }
      }
      return results;
    }),
  }),

  // ─── Experiments ──────────────────────────────────────────────────────────
  experiments: router({
    list: protectedProcedure
      .input(z.object({ accountId: z.number().optional() }))
      .query(async ({ ctx, input }) => {
        return getExperimentsByUserId(ctx.user.id, input.accountId);
      }),

    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const exp = await getExperimentById(input.id, ctx.user.id);
        if (!exp) throw new TRPCError({ code: "NOT_FOUND", message: "Experimento não encontrado" });
        const metrics = exp.campaignIds && exp.campaignIds.length > 0
          ? await getExperimentCampaignMetrics(exp.campaignIds, exp.startDate, exp.endDate)
          : null;
        const kpisWithValues = exp.kpis.map(kpi => {
          let realValue: number | null = null;
          if (metrics) {
            switch (kpi.metric) {
              case "spend":        realValue = metrics.totalSpend; break;
              case "conversions":  realValue = metrics.totalConversions; break;
              case "impressions":  realValue = metrics.totalImpressions; break;
              case "clicks":       realValue = metrics.totalClicks; break;
              case "reach":        realValue = metrics.totalReach; break;
              case "ctr":          realValue = metrics.avgCtr; break;
              case "cpa":          realValue = metrics.avgCpa; break;
              case "roas":         realValue = metrics.avgRoas; break;
            }
          }
          return { ...kpi, realValue };
        });
        return { ...exp, kpisWithValues };
      }),

    create: protectedProcedure
      .input(z.object({
        accountId: z.number(),
        title: z.string().min(1),
        centralQuestion: z.string().optional(),
        hypothesis: z.string().optional(),
        startDate: z.string(),
        endDate: z.string(),
        status: z.enum(["planned", "active", "completed", "paused"]).default("planned"),
        dailyBudget: z.number().optional(),
        totalBudget: z.number().optional(),
        channels: z.array(z.string()).optional(),
        campaignIds: z.array(z.number()).optional(),
        kpis: z.array(z.object({
          metric: z.string(),
          unit: z.string().default("#"),
          minSignal: z.number().optional(),
          goal: z.number(),
        })),
        checkpoints: z.array(z.object({
          date: z.string(),
          title: z.string(),
        })),
        decisions: z.array(z.object({
          scenario: z.string(),
          reading: z.string().optional(),
          nextStep: z.string().optional(),
          isCurrent: z.boolean().default(false),
        })),
      }))
      .mutation(async ({ ctx, input }) => {
        const { kpis, checkpoints, decisions, ...expData } = input;
        const id = await createExperiment(
          {
            ...expData,
            userId: ctx.user.id,
            dailyBudget: expData.dailyBudget ? String(expData.dailyBudget) : null,
            totalBudget: expData.totalBudget ? String(expData.totalBudget) : null,
          } as any,
          kpis.map(k => ({
            experimentId: 0,
            metric: k.metric,
            unit: k.unit,
            minSignal: k.minSignal != null ? String(k.minSignal) : null,
            goal: String(k.goal),
          })) as any,
          checkpoints.map(c => ({
            experimentId: 0,
            date: c.date,
            title: c.title,
            status: "pending" as const,
          })),
          decisions.map(d => ({
            experimentId: 0,
            scenario: d.scenario,
            reading: d.reading ?? null,
            nextStep: d.nextStep ?? null,
            isCurrent: d.isCurrent,
          })),
        );
        return { id };
      }),

    updateStatus: protectedProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(["planned", "active", "completed", "paused"]),
      }))
      .mutation(async ({ ctx, input }) => {
        const exp = await getExperimentById(input.id, ctx.user.id);
        if (!exp) throw new TRPCError({ code: "NOT_FOUND", message: "Experimento não encontrado" });
        await updateExperimentStatus(input.id, input.status);
        return { ok: true };
      }),

    updateCheckpointNote: protectedProcedure
      .input(z.object({ checkpointId: z.number(), note: z.string() }))
      .mutation(async ({ ctx, input }) => {
        await updateCheckpointNote(input.checkpointId, input.note);
        return { ok: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await deleteExperiment(input.id, ctx.user.id);
        return { ok: true };
      }),

    analyze: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const exp = await getExperimentById(input.id, ctx.user.id);
        if (!exp) throw new TRPCError({ code: "NOT_FOUND", message: "Experimento não encontrado" });
        const metrics = exp.campaignIds && exp.campaignIds.length > 0
          ? await getExperimentCampaignMetrics(exp.campaignIds, exp.startDate, exp.endDate)
          : null;

        const prompt = `Você é um especialista em mídia paga. Analise este experimento de marketing:

Título: ${exp.title}
Pergunta central: ${exp.centralQuestion ?? "N/A"}
Hipótese: ${exp.hypothesis ?? "N/A"}
Período: ${exp.startDate} a ${exp.endDate}
Status: ${exp.status}
Canais: ${(exp.channels ?? []).join(", ") || "N/A"}

KPIs definidos:
${exp.kpis.map(k => `- ${k.metric}: meta=${k.goal}${k.unit}, sinal mínimo=${k.minSignal ?? "N/A"}`).join("\n")}

Métricas reais do período:
${metrics ? `- Investimento: R$ ${metrics.totalSpend?.toFixed(2) ?? "N/A"}
- Conversões: ${metrics.totalConversions ?? "N/A"}
- CTR: ${metrics.avgCtr?.toFixed(2) ?? "N/A"}%
- CPA: R$ ${metrics.avgCpa?.toFixed(2) ?? "N/A"}
- ROAS: ${metrics.avgRoas?.toFixed(2) ?? "N/A"}x` : "Sem dados de métricas ainda"}

Checkpoints:
${exp.checkpoints.map(c => `- ${c.date} (${c.status}): ${c.title}${c.qualitativeNote ? " — " + c.qualitativeNote : ""}`).join("\n")}

Árvore de decisões:
${exp.decisions.map(d => `- ${d.scenario}: ${d.reading ?? ""} → ${d.nextStep ?? ""}`).join("\n")}

Forneça uma análise em 3-4 parágrafos cobrindo: (1) avaliação dos resultados vs hipótese, (2) pontos positivos e negativos, (3) recomendação de próximo passo, (4) aprendizado chave. Seja direto e prático.`;

        const response = await invokeLLM({ messages: [{ role: "user", content: prompt }], maxTokens: 800 });
        const analysis = extractTextContent(response);
        return { analysis };
      }),

    suggestField: protectedProcedure
      .input(z.object({
        field: z.enum(["centralQuestion", "hypothesis", "checkpoints", "decisions"]),
        context: z.object({
          title: z.string(),
          startDate: z.string().optional(),
          endDate: z.string().optional(),
          dailyBudget: z.string().optional(),
          channels: z.array(z.string()).optional(),
          accountName: z.string().optional(),
          centralQuestion: z.string().optional(),
        }),
      }))
      .mutation(async ({ input }) => {
        const { field, context } = input;
        const channelStr = context.channels?.join(", ") || "Meta Ads";
        const budgetStr = context.dailyBudget ? `R$ ${context.dailyBudget}/dia` : "não definida";
        const periodStr = context.startDate && context.endDate ? `${context.startDate} a ${context.endDate}` : "não definido";

        let prompt = "";

        if (field === "centralQuestion") {
          prompt = `Você é especialista em marketing digital. Sugira uma pergunta central clara e objetiva para um experimento de mídia paga.

Título: ${context.title}
Período: ${periodStr}
Verba: ${budgetStr}
Canais: ${channelStr}
Conta: ${context.accountName ?? "—"}

Responda APENAS com a pergunta central — uma única frase interrogativa, direta e mensurável. Nenhuma explicação adicional.`;

        } else if (field === "hypothesis") {
          prompt = `Você é especialista em marketing digital. Elabore uma hipótese no formato "Acreditamos que X terá Y resultado porque Z".

Título: ${context.title}
Pergunta central: ${context.centralQuestion ?? "não informada"}
Canais: ${channelStr}
Verba: ${budgetStr}

Responda APENAS com a hipótese em até 3 linhas. Nenhuma explicação adicional.`;

        } else if (field === "checkpoints") {
          prompt = `Você é especialista em gestão de experimentos de mídia paga. Sugira exatamente 3 checkpoints estratégicos distribuídos uniformemente no período abaixo.

Título: ${context.title}
Período: ${periodStr}

Responda APENAS com JSON válido, sem markdown, no formato exato:
[{"date":"YYYY-MM-DD","title":"string"},{"date":"YYYY-MM-DD","title":"string"},{"date":"YYYY-MM-DD","title":"string"}]`;

        } else {
          prompt = `Você é especialista em estratégia de mídia paga. Sugira exatamente 3 cenários de decisão: sucesso total, sinal positivo parcial, e falha/abaixo do esperado.

Título: ${context.title}
Período: ${periodStr}
Canais: ${channelStr}

Responda APENAS com JSON válido, sem markdown, no formato exato:
[{"scenario":"string","reading":"string","nextStep":"string","isCurrent":false},{"scenario":"string","reading":"string","nextStep":"string","isCurrent":false},{"scenario":"string","reading":"string","nextStep":"string","isCurrent":false}]`;
        }

        const response = await invokeLLM({ messages: [{ role: "user", content: prompt }], maxTokens: 500 });
        return { value: extractTextContent(response) };
      }),
  }),
  contracts: router({
    // Contratos é área Administrativa → admin only (backend + rota/sidebar).
    extractFields: adminProcedure
      .input(z.object({
        text: z.string().optional(),
        fileBase64: z.string().optional(),
        fileMime: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const prompt = 'Extraia os dados contratuais deste colaborador PJ. Retorne SOMENTE um JSON válido sem markdown com os campos: '
          + 'razaoSocial, tipo (MEI/EI/LTDA), cnpj, enderecosede, nomeRepresentante, genero (F para feminino ou M para masculino), '
          + 'estadoCivil, rg, rgOrgao, cpf, enderecoResidencial (string vazia se igual à sede), '
          + 'objeto (texto para cláusula 1.1, ex: "gestão, planejamento e execução do composto de trabalhos relacionados a X"), '
          + 'valor (ex: "R$ 3.200,00"), valorRevisao (string vazia se não mencionado).';

        if (input.fileBase64 && input.fileMime) {
          if (input.fileMime.startsWith('image/')) {
            const dataUrl = `data:${input.fileMime};base64,${input.fileBase64}`;
            const response = await invokeLLM({
              messages: [{ role: 'user' as const, content: [
                { type: 'image_url' as const, image_url: { url: dataUrl } },
                { type: 'text' as const, text: prompt },
              ]}],
              maxTokens: 1000,
            });
            const text = extractTextContent(response);
            return JSON.parse(text.replace(/```json|```/g, '').trim());
          }
          const apiKey = process.env.ANTHROPIC_API_KEY;
          if (!apiKey) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'API key not configured' });
          const resp = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
            body: JSON.stringify({
              model: 'claude-sonnet-4-6', max_tokens: 1000,
              messages: [{ role: 'user', content: [
                { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: input.fileBase64 } },
                { type: 'text', text: prompt },
              ]}],
            }),
          });
          if (!resp.ok) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'PDF extraction failed' });
          const data = await resp.json() as { content: Array<{ type: string; text?: string }> };
          const text = (data.content ?? []).filter((b: { type: string }) => b.type === 'text').map((b: { text?: string }) => b.text ?? '').join('');
          return JSON.parse(text.replace(/```json|```/g, '').trim());
        }

        const response = await invokeLLM({
          messages: [{ role: 'user' as const, content: 'Dados brutos do colaborador:\n' + (input.text ?? '') + '\n\n' + prompt }],
          maxTokens: 1000,
        });
        const text = extractTextContent(response);
        return JSON.parse(text.replace(/```json|```/g, '').trim());
      }),
  }),
  context: contextRouter,
});
export type AppRouter = typeof appRouter;

