import { logger } from "./logger";
import { canManageContent } from "../shared/permissions";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { execSync } from "node:child_process";
import { COOKIE_NAME } from "@shared/const";
import { getPageIdsForAdAccount } from "@shared/pageMapping";
import { sendEmail, DAILY_REPORT_RECIPIENTS, isEmailConfigured } from "./emailService";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, adminProcedure, authedProcedure, contentProcedure, router } from "./_core/trpc";
import { isStorageConfigured, getReadUrl, deleteObject } from "./storage/storageService";
import { hashPassword, verifyPassword, generateTempPassword } from "./_core/oauth";
import { encryptSecret, decryptSecret } from "./_core/integrationsCrypto";
import { isAccessCryptoConfigured, encryptAccessSecret, decryptAccessSecret } from "./_core/accessCrypto";
import {
  getActiveAccessClients,
  getAccessClientById,
  getAccessClientBySlug,
  createAccessClient,
  updateAccessClient,
  getAllActiveAccessItems,
  getActiveAccessItemsByClient,
  getAccessItemById,
  createAccessItem,
  updateAccessItem,
  deactivateAccessItemsByClient,
  createAccessAudit,
  getAppSetting,
  setAppSetting,
  getPollVotesWithUsers,
  upsertPollVote,
  clearPollVotes,
} from "./db";
import {
  GOOGLE_CALENDAR_PROVIDER,
  isGoogleCalendarConfigured,
  refreshAccessToken,
  revokeToken,
  listDayEvents,
  resolveAgendaYmd,
} from "./googleCalendarService";
import {
  TRELLO_PROVIDER,
  TRELLO_SCOPE,
  TrelloAuthError,
  isTrelloConfigured,
  getMember as getTrelloMember,
  listMyCards as listTrelloCards,
  revokeToken as revokeTrelloToken,
} from "./trelloService";
import { verifyIntegrationState } from "./_core/integrationsState";
import {
  getAllUsers,
  getUserById,
  getUserByOpenId,
  countActiveAdmins,
  createUserAudit,
  createEmployee,
  updateUserFields,
  setUserPassword,
  getUserIntegration,
  upsertUserIntegration,
  updateIntegrationTokens,
  deactivateUserIntegration,
  listActiveNews,
  listAllNews,
  createNewsItem,
  updateNewsItem,
  deleteNewsItem,
  setNewsOrder,
  nextNewsSortOrder,
  listActiveSelvatv,
  listAllSelvatv,
  getSelvatvById,
  createSelvatvItem,
  updateSelvatvItem,
  deleteSelvatvItem,
  setSelvatvOrder,
  nextSelvatvSortOrder,
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
import { resolverTipoDaConta } from "./alertProfiles";
import { generateAiSuggestions, generateAgencyReport, detectAnomalies } from "./analysisService";
import { assembleReportData, generateReportNarrative } from "./reportService";
import { nanoid } from "nanoid";
import { invokeLLM, extractTextContent } from "./_core/llm";
import {
  getGoogleAdsConfig,
  isGoogleAdsConfigured,
  googleAdsEnvFaltando,
  listarContasAcessiveis,
  listarContasDoMcc,
  nomeDaConta,
  diagnosticarCampanhas,
  formatarCustomerId,
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
  getConexaoGoogleAdsAgencia,
  listarTodasContasGoogle,
  contaGoogleDoCliente,
  vincularContaGoogle,
  ignorarContaGoogle,
  renomearContaGoogle,
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
  financeMonths,
  listFinancePnl,
  financePnlResumo,
  createFinancePnl,
  updateFinancePnl,
  deleteFinancePnl,
  listFinanceReembolsos,
  createFinanceReembolso,
  updateFinanceReembolso,
  deleteFinanceReembolso,
  listFinanceRetiradas,
  createFinanceRetirada,
  updateFinanceRetirada,
  deleteFinanceRetirada,
  financeReconciliacao,
  listFinanceClientes,
  createFinanceCliente,
  financePnlTrend,
  financeReceitaPorCliente,
  financeReconciliacaoAcumulado,
  financePeriodoResumo,
  financeMrr,
  financeChurn,
  financeQualidadeClientes,
  financeAReceber,
  financeDespesaCategoria,
  listFinanceRecorrencia,
  financeProximoMesRecorrente,
  gerarMesRecorrente,
  recorrenciaStatusMes,
  createDespesaRecorrencia,
  createReceitaRecorrencia,
  marcarSaidaRecorrencia,
  reativarRecorrencia,
  ajustarValorRecorrencia,
  listFinanceProjetos,
  createFinanceProjeto,
  deleteFinanceProjeto,
  remarcarFinancePnl,
  remarcarOficialFinancePnl,
  financePeriodoResumoRP,
  financePnlTrendRP,
  financeAReceberVenc,
  financeAPagarVenc,
  financeOverviewResumo,
  financeContratosAtivos,
  financeDespesasAtivos,
  financeDespesaPorFornecedor,
  financeDespesaPontualPorSub,
  financeSerieHistorica,
  listMesesFechados,
  fecharMes,
  reabrirMes,
  listarTodasContasGA4, vincularGA4, ga4DoCliente, tokenDaContaGA4, ga4SnapshotsDoCliente,
  getConexaoGA4Agencia, gravarPropriedadesGA4,
} from "./db";
import type { CampaignReportData } from "./analysisService";
import { notifyOwner } from "./_core/notification";
import { startAutoSync, syncAccount, syncAlertsForUser, syncAllForUser } from "./autoSync";
import { clientesComNotificacao, excluirUsuarioPermanente, getDigestSettings, updateDigestSettings, getDigestOverride, setDigestOverride, getUnreadCountByDominio, getNotificationPrefs, upsertNotificationPref, listarComunicados, recibosComunicado, resolverPublico, criarComunicado, setComunicadoEnviados, setComunicadoFixado, setCoordinatorAccounts, clearCoordinatorAccounts, listCoordinatorLinks, getClaritySettings, upsertClaritySettings, ultimoClaritySnapshot, serieClaritySnapshots, upsertPerfSettings, ultimoSiteSnapshot, serieSiteSnapshots, ultimoSnapshotPorProvider, serieSnapshotsPorProvider, contasComSite, getClientContext, upsertClientContext, listClientNotes, criarClientNote, apagarClientNote, salvarSiteReport, listarSiteReports, getSiteReport, listChatMessages, salvarChatMessage, limparChat, resumoEnviosEmail, ultimosEnviosEmail, objetivosDasCampanhas } from "./db";
import { sincronizarClarity, sincronizarPerformance, checarSegurancaCliente, checarUptimeCliente } from "./clarityJobs";
import { validarUrlPublica } from "./services/urlGuard";
import { isPageSpeedConfigured } from "./services/sitePerformanceService";
import { gerarSiteReport, siteReportMarkdown } from "./services/siteReportService";
import { obterBriefingDoDia } from "./services/briefingService";
import { dispararResumoManual, previewResumoManual, hojeAgencia } from "./notificationJobs";
import { emailMode, destinatariosDeTeste, transporteAtivo } from "./emailService";
import { runDailyDigestJob, enviarDigestDeTeste, previewDigest, buildDailyDigestForRole, BLOCOS_POR_PAPEL } from "./services/dailyDigestService";
import { fontesDoCliente, fontesDeTodasAsContas } from "./services/fontesDoCliente";
import { sincronizarGA4 } from "./services/ga4Sync";
import { perguntarSobreCliente, sugestoesPara, montarFontesChat, type FontesChat } from "./services/clientChatService";
import { buildClientIntelligenceContext, contextoParaTexto, fontesDe, MODULOS, MODULOS_SITE } from "./services/clientIntelligence";
import { gerarRelatorioModular, PRESETS, tierDe } from "./services/reportBuilder";
import { resumoSitesPortfolio } from "./services/sitePortfolio";
import { resolverWidgets, widgetPorKey, widgetServeRole } from "@shared/widgets";
import type { Role } from "@shared/permissions";
import { getWidgetPrefs, upsertWidgetPref, limparWidgetPrefs, listarSociaisDaConta, salvarSocial, apagarSocial, registrarPresenca, listarPresenca } from "./db";

/**
 * O @ chega colado de tudo quanto é jeito: "@selva", "selva",
 * "instagram.com/selva/", "https://www.instagram.com/selva?igsh=x". Guardar
 * isso cru faria o cadastro virar lixo e o vínculo com a Graph API falhar.
 */
function normalizarHandle(bruto: string): string {
  let h = (bruto ?? "").trim();
  if (!h) return "";
  const m = h.match(/^(?:https?:\/\/)?(?:www\.)?(?:instagram|linkedin|youtube)\.com\/(?:in\/|@)?([^/?#]+)/i);
  if (m) h = m[1];
  return h.replace(/^@+/, "").replace(/\/+$/, "").trim();
}

function urlPadraoDoPerfil(provider: string, handle: string): string {
  if (provider === "linkedin") return `https://www.linkedin.com/in/${handle}`;
  if (provider === "youtube") return `https://www.youtube.com/@${handle}`;
  return `https://www.instagram.com/${handle}/`;
}

/** Conectar integração de anúncios é ação sensível — admin ou developer. */
function podeConectarGoogleAds(role: string | undefined): boolean {
  return role === "admin" || role === "developer";
}

/** Diz QUEM pode, não só que você não pode — evita a caça ao tesouro. */
const MSG_SEM_PERMISSAO_GADS =
  "Apenas administradores e desenvolvedores podem descobrir e vincular contas do Google Ads.";

/**
 * Token de refresh de uma conta Google Ads, decriptado. As contas novas guardam
 * o token CRIPTOGRAFADO; um valor legado (texto plano, ou o global antigo) que
 * não decripta é devolvido como veio — o try/catch cobre a transição sem
 * derrubar quem já tinha conta conectada.
 */
function tokenDaConta(refreshTokenGuardado: string): string {
  try {
    return decryptSecret(refreshTokenGuardado);
  } catch {
    return refreshTokenGuardado;
  }
}
import { entregarComunicado } from "./notificationJobs";
import { notifTiposFor, notifTipoDef, tipoEditavelPor, type EmailModo } from "../shared/notifications";

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

      const conta = await getMetaAdAccountById(input.accountId);
      const [accountCtx, agencyCtx, metrics, suggestions, site] = await Promise.all([
        getAccountContext(input.accountId),
        getAgencyContext((ctx.user as any).id),
        getCampaignPerformanceSummary(input.accountId, toLocal(startDate), toLocal(endDate)),
        getSuggestionsByAccountId(input.accountId),
        // Site vem do MESMO builder que alimenta o robô e o relatório. Só os
        // módulos técnicos: mídia e contexto este chat já tem, dos próprios
        // blocos abaixo (benchmarks, regras, aprendizados) — que o robô não tem.
        buildClientIntelligenceContext(
          input.accountId,
          conta?.accountName ?? String(input.accountId),
          { inicio: toLocal(startDate), fim: toLocal(endDate) },
          MODULOS_SITE,
        ),
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
        // O que acontece DEPOIS do clique. Sem isto, este chat recomendava mexer
        // na campanha sem saber que a página demora 14s para abrir.
        `SITE E COMPORTAMENTO (fonte única, mesma do robô e dos relatórios):\n${contextoParaTexto(site, false)}`,
      ].filter(Boolean).join("\n\n");

      const systemPrompt = `Você é um estrategista sênior de Meta Ads da SELVA Agency, operando dentro do BIT — Brand Intelligence Tracker, um dashboard interno de gestão de Meta Ads. Você tem acesso aos dados desta conta através do sistema: métricas de campanhas, conjuntos, criativos, sugestões geradas, ações em monitoramento, contexto da conta, aprendizados históricos e dados do site do cliente. O sistema sincroniza dados diariamente às 9h automaticamente via Meta Graph API. Seja direto, preciso e acionável.

USE SOMENTE O CONTEXTO ABAIXO. Não invente número, campanha ou métrica. Quando um bloco disser "SEM DADOS", isso significa que ninguém mediu aquilo — NÃO que está tudo bem. Diga que falta o dado e qual seria necessário; não preencha com suposição apresentada como fato. Você enxerga a jornada inteira: mídia paga → site → comportamento → conversão. Se o site pode explicar o resultado da mídia, diga.

FORMATAÇÃO: Responda em parágrafos separados por quebra de linha. Sem asteriscos, sem hashtags, sem traços. Se houver decisões estratégicas rastreáveis a sugerir (pausar algo, realocar orçamento, criar algo), coloque-as no final sob o marcador exato "AÇÕES:" — uma por linha numerada. Inclua APENAS decisões de negócio monitoráveis, não passos de execução como "acessar o gerenciador" ou "registrar horário". Exemplo: AÇÕES:\n1. Pausar conjunto X\n2. Realocar R$500 de Y para Z

${contextBlocks}`;

      const response = await invokeLLM({
        messages: [{ role: "system", content: systemPrompt }, ...input.messages],
        maxTokens: 1200,
      });

      return { reply: extractTextContent(response) };
    }),
});

// Chave da config do slide "Você prefere?" (app_settings).
const VOCE_PREFERE_KEY = "selvatv_voce_prefere";
// Config dos slides fixos institucionais da SELVA TV (ligar/desligar sem excluir).
// Default: ambos DESLIGADOS (só "Você prefere?" ativo por padrão nesta etapa).
const SELVATV_FIXED_KEY = "selvatv_fixed_slides";
type FixedSlidesCfg = { gravity: boolean; dvd: boolean };

// ─── Helpers do cofre de Acessos ──────────────────────────────────────────────
function slugify(name: string): string {
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "")    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 200) || "cliente";
}
async function uniqueClientSlug(name: string): Promise<string> {
  const base = slugify(name);
  let slug = base;
  let n = 1;
  while (await getAccessClientBySlug(slug)) slug = `${base}-${++n}`;
  return slug;
}
/** Sanitiza tags: trim, remove vazias/duplicadas (case-insensitive), máx 40 chars, máx 10. */
function sanitizeTags(tags?: string[]): string[] {
  if (!Array.isArray(tags)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tags) {
    const clean = String(t).replace(/\s+/g, " ").trim().slice(0, 40);
    if (!clean) continue;
    const k = clean.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(clean);
    if (out.length >= 10) break;
  }
  return out;
}
function parseTags(json: unknown): string[] {
  if (Array.isArray(json)) return json.filter((t): t is string => typeof t === "string");
  return [];
}
/** Garante o cliente interno SELVA Agency (vazio) — idempotente. */
async function ensureSelvaInternalClient(userId: number): Promise<void> {
  const existing = await getAccessClientBySlug("selva-agency");
  if (existing) return;
  await createAccessClient({
    name: "SELVA Agency", slug: "selva-agency", isInternal: true, active: true,
    sortOrder: -1, createdByUserId: userId, updatedByUserId: userId,
  });
}

// ─── Controle Financeiro (namespace finance.*) ────────────────────────────────
// TODAS as procedures são adminProcedure → rejeitadas para não-admin mesmo em
// chamada direta (não basta esconder o menu). Dinheiro em centavos (int).
const MES = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "mês deve ser YYYY-MM");
const PNL_TIPO = z.enum(["RECEITA_RECORRENTE", "RECEITA_PONTUAL", "DESPESA_RECORRENTE", "DESPESA_IMPOSTO", "DESPESA_PONTUAL", "APORTE"]);
const PNL_STATUS = z.enum(["pago", "pendente"]);
const REEMB_CAT = z.enum(["PLATAFORMA_ANUNCIOS", "OFFICE", "EXTRAS"]);
const CENTS = z.number().int().min(0); // P&L/reembolsos: positivo; sinal vem do tipo
const CENTS_SIGNED = z.number().int();  // retiradas: pode ser negativo (estorno)
const DATA = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "data deve ser YYYY-MM-DD");

const financeRouter = router({
  // Meses distintos para popular seletores no front.
  months: adminProcedure.query(() => financeMonths()),

  pnl: router({
    list: adminProcedure
      .input(z.object({ mesFrom: MES.optional(), mesTo: MES.optional(), tipo: PNL_TIPO.optional(), status: PNL_STATUS.optional(), clienteId: z.number().int().optional() }).optional())
      .query(({ input }) => listFinancePnl(input ?? {})),
    resumo: adminProcedure.input(z.object({ mes: MES })).query(({ input }) => financePnlResumo(input.mes)),
    trend: adminProcedure.input(z.object({ limitMonths: z.number().int().min(1).max(36).optional() }).optional()).query(({ input }) => financePnlTrendRP(input?.limitMonths ?? 12)),
    receitaPorCliente: adminProcedure.input(z.object({ mesFrom: MES.optional(), mesTo: MES.optional() }).optional()).query(({ input }) => financeReceitaPorCliente(input ?? {})),
    create: adminProcedure
      .input(z.object({ mes: MES, tipo: PNL_TIPO, descricao: z.string().min(1).max(255), valorCents: CENTS, status: PNL_STATUS.default("pendente"), clienteId: z.number().int().nullable().optional(), vencimento: DATA.nullable().optional(), reembolsoPendente: z.boolean().optional(), subcategoria: z.string().max(24).nullable().optional() }))
      .mutation(async ({ input }) => ({ id: await createFinancePnl(input) })),
    update: adminProcedure
      .input(z.object({ id: z.number().int(), mes: MES.optional(), tipo: PNL_TIPO.optional(), descricao: z.string().min(1).max(255).optional(), valorCents: CENTS.optional(), status: PNL_STATUS.optional(), clienteId: z.number().int().nullable().optional(), reembolsoPendente: z.boolean().optional(), subcategoria: z.string().max(24).nullable().optional() }))
      .mutation(async ({ input }) => { const { id, ...patch } = input; await updateFinancePnl(id, patch); return { success: true } as const; }),
    delete: adminProcedure.input(z.object({ id: z.number().int() })).mutation(async ({ input }) => { await deleteFinancePnl(input.id); return { success: true } as const; }),
    setStatus: adminProcedure.input(z.object({ id: z.number().int(), status: PNL_STATUS })).mutation(async ({ input }) => { await updateFinancePnl(input.id, { status: input.status }); return { success: true } as const; }),
    remarcar: adminProcedure.input(z.object({ id: z.number().int(), vencimento: DATA })).mutation(async ({ input }) => { await remarcarFinancePnl(input.id, input.vencimento); return { success: true } as const; }),
    remarcarOficial: adminProcedure.input(z.object({ id: z.number().int(), vencimento: DATA })).mutation(async ({ input }) => { const r = await remarcarOficialFinancePnl(input.id, input.vencimento); return { success: true, ...r } as const; }),
  }),

  recorrencia: router({
    list: adminProcedure.query(() => listFinanceRecorrencia()),
    proximoMes: adminProcedure.query(() => financeProximoMesRecorrente()),
    statusMes: adminProcedure.input(z.object({ mes: MES })).query(({ input }) => recorrenciaStatusMes(input.mes)),
    gerar: adminProcedure.input(z.object({ mes: MES })).mutation(({ input }) => gerarMesRecorrente(input.mes)),
    createDespesa: adminProcedure
      .input(z.object({ descricao: z.string().min(1).max(255), valorCents: CENTS, tipoEntry: z.enum(["DESPESA_RECORRENTE", "DESPESA_IMPOSTO"]), estimativa: z.boolean().default(false), mesInicio: MES, diaVencimento: z.number().int().min(1).max(31).nullable().optional(), vencimentoMesSeguinte: z.boolean().default(false) }))
      .mutation(async ({ input }) => { const id = await createDespesaRecorrencia({ descricao: input.descricao, valorCents: input.valorCents, tipoEntry: input.tipoEntry, estimativa: input.estimativa, mesInicio: input.mesInicio, diaVencimento: input.diaVencimento ?? null, vencimentoMesSeguinte: input.vencimentoMesSeguinte }); return { id } as const; }),
    createReceita: adminProcedure
      .input(z.object({ clienteNome: z.string().min(1).max(120), valorCents: CENTS, diaVencimento: z.number().int().min(1).max(31).nullable().optional(), mesInicio: MES, vencimentoMesSeguinte: z.boolean().default(false) }))
      .mutation(async ({ input }) => { const id = await createReceitaRecorrencia({ clienteNome: input.clienteNome, valorCents: input.valorCents, diaVencimento: input.diaVencimento ?? null, mesInicio: input.mesInicio, vencimentoMesSeguinte: input.vencimentoMesSeguinte }); return { id } as const; }),
    marcarSaida: adminProcedure.input(z.object({ recorrenciaId: z.number().int(), mes: MES })).mutation(({ input }) => marcarSaidaRecorrencia(input.recorrenciaId, input.mes)),
    reativar: adminProcedure.input(z.object({ recorrenciaId: z.number().int() })).mutation(async ({ input }) => { await reativarRecorrencia(input.recorrenciaId); return { success: true } as const; }),
    ajustarValor: adminProcedure.input(z.object({ recorrenciaId: z.number().int(), valorCents: CENTS, aplicarGerados: z.boolean().default(false) })).mutation(async ({ input }) => { await ajustarValorRecorrencia(input.recorrenciaId, input.valorCents, input.aplicarGerados); return { success: true } as const; }),
  }),

  projetos: router({
    list: adminProcedure.query(() => listFinanceProjetos()),
    create: adminProcedure
      .input(z.object({ clienteId: z.number().int().nullable().optional(), nome: z.string().min(1).max(255), parcelas: z.array(z.object({ valorCents: CENTS, vencimento: DATA })).min(1).max(60) }))
      .mutation(({ input }) => createFinanceProjeto({ clienteId: input.clienteId ?? null, nome: input.nome, parcelas: input.parcelas })),
    delete: adminProcedure.input(z.object({ id: z.number().int() })).mutation(({ input }) => deleteFinanceProjeto(input.id)),
  }),

  clientes: router({
    list: adminProcedure.query(() => listFinanceClientes()),
    create: adminProcedure
      .input(z.object({ nome: z.string().min(1).max(120), cor: z.string().max(9).optional() }))
      .mutation(({ input }) => createFinanceCliente(input)),
  }),

  reembolsos: router({
    list: adminProcedure
      .input(z.object({ mes: MES.optional(), categoria: REEMB_CAT.optional() }).optional())
      .query(({ input }) => listFinanceReembolsos(input ?? {})),
    create: adminProcedure
      .input(z.object({ mes: MES, categoria: REEMB_CAT, descricao: z.string().min(1).max(255), valorCents: CENTS, quemPagou: z.string().max(120).optional(), reembolsado: z.boolean().default(false) }))
      .mutation(async ({ input }) => ({ id: await createFinanceReembolso(input) })),
    update: adminProcedure
      .input(z.object({ id: z.number().int(), mes: MES.optional(), categoria: REEMB_CAT.optional(), descricao: z.string().min(1).max(255).optional(), valorCents: CENTS.optional(), quemPagou: z.string().max(120).nullable().optional(), reembolsado: z.boolean().optional() }))
      .mutation(async ({ input }) => { const { id, ...patch } = input; await updateFinanceReembolso(id, patch); return { success: true } as const; }),
    delete: adminProcedure.input(z.object({ id: z.number().int() })).mutation(async ({ input }) => { await deleteFinanceReembolso(input.id); return { success: true } as const; }),
    setReembolsado: adminProcedure.input(z.object({ id: z.number().int(), reembolsado: z.boolean() })).mutation(async ({ input }) => { await updateFinanceReembolso(input.id, { reembolsado: input.reembolsado }); return { success: true } as const; }),
  }),

  retiradas: router({
    list: adminProcedure.input(z.object({ mes: MES.optional() }).optional()).query(({ input }) => listFinanceRetiradas(input ?? {})),
    create: adminProcedure.input(z.object({ mes: MES, descricao: z.string().min(1).max(120), valorCents: CENTS_SIGNED })).mutation(async ({ input }) => ({ id: await createFinanceRetirada(input) })),
    update: adminProcedure.input(z.object({ id: z.number().int(), mes: MES.optional(), descricao: z.string().min(1).max(120).optional(), valorCents: CENTS_SIGNED.optional() })).mutation(async ({ input }) => { const { id, ...patch } = input; await updateFinanceRetirada(id, patch); return { success: true } as const; }),
    delete: adminProcedure.input(z.object({ id: z.number().int() })).mutation(async ({ input }) => { await deleteFinanceRetirada(input.id); return { success: true } as const; }),
  }),

  reconciliacao: router({
    get: adminProcedure.input(z.object({ mes: MES })).query(({ input }) => financeReconciliacao(input.mes)),
    acumulado: adminProcedure.query(() => financeReconciliacaoAcumulado()),
  }),

  // Redesign — leituras da Visão Geral (adminProcedure, sem schema novo).
  overview: router({
    resumo: adminProcedure.input(z.object({ mesFrom: MES, mesTo: MES })).query(({ input }) => financeOverviewResumo(input.mesFrom, input.mesTo)),
  }),
  aPagar: adminProcedure.query(() => financeAPagarVenc()),
  contratosAtivos: adminProcedure.input(z.object({ mes: MES })).query(({ input }) => financeContratosAtivos(input.mes)),
  despesasAtivos: adminProcedure.input(z.object({ mes: MES })).query(({ input }) => financeDespesasAtivos(input.mes)),

  // v6 — fechar/travar mês (idempotente). fechar retorna a contagem de pendências (aviso).
  meses: router({
    list: adminProcedure.query(() => listMesesFechados()),
    fechar: adminProcedure.input(z.object({ mes: MES })).mutation(({ input, ctx }) => fecharMes(input.mes, ctx.user?.id ?? null)),
    reabrir: adminProcedure.input(z.object({ mes: MES })).mutation(({ input }) => reabrirMes(input.mes)),
  }),

  // Analytics v3 (só leitura/cálculo sobre as tabelas existentes).
  analytics: router({
    periodoResumo: adminProcedure.input(z.object({ mesFrom: MES, mesTo: MES })).query(({ input }) => financePeriodoResumoRP(input.mesFrom, input.mesTo)),
    mrr: adminProcedure.input(z.object({ mes: MES })).query(({ input }) => financeMrr(input.mes)),
    churn: adminProcedure.input(z.object({ mesFrom: MES.optional(), mesTo: MES.optional(), limitMonths: z.number().int().min(1).max(36).optional() }).optional()).query(({ input }) => financeChurn(input ?? {})),
    qualidadeClientes: adminProcedure.input(z.object({ mesFrom: MES.optional(), mesTo: MES.optional() }).optional()).query(({ input }) => financeQualidadeClientes(input ?? {})),
    aReceber: adminProcedure.input(z.object({ mesTo: MES.optional() }).optional()).query(({ input }) => financeAReceberVenc(input?.mesTo)),
    despesaPorCategoria: adminProcedure.input(z.object({ mesFrom: MES.optional(), mesTo: MES.optional(), limitMonths: z.number().int().min(1).max(36).optional() }).optional()).query(({ input }) => financeDespesaCategoria(input ?? {})),
    despesaPorFornecedor: adminProcedure.input(z.object({ mesFrom: MES.optional(), mesTo: MES.optional() }).optional()).query(({ input }) => financeDespesaPorFornecedor(input ?? {})),
    despesaPontualPorSub: adminProcedure.input(z.object({ mesFrom: MES.optional(), mesTo: MES.optional() }).optional()).query(({ input }) => financeDespesaPontualPorSub(input ?? {})),
    serieHistorica: adminProcedure
      .input(z.object({ granularidade: z.enum(["mensal", "anual"]).default("mensal"), janela: z.enum(["12m", "24m", "vitalicio"]).default("12m") }))
      .query(({ input }) => financeSerieHistorica(input.granularidade, input.janela)),
  }),
});

export const appRouter = router({
  system: systemRouter,

  auth: router({
    me: publicProcedure.query(async (opts) => {
      if (!opts.ctx.user) return null;
      // Nunca expõe o hash da senha ao cliente.
      const { passwordHash: _omit, ...safe } = opts.ctx.user;
      // Resolve a URL do avatar (key → URL pública/assinada).
      let avatarUrl: string | undefined;
      if (opts.ctx.user.avatarKey) {
        try { avatarUrl = await getReadUrl(opts.ctx.user.avatarKey); } catch { /* storage off */ }
      }
      return { ...safe, avatarUrl };
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
    /** Contas ativas para o seletor de clientes do coordenador. */
    clientesDisponiveis: adminProcedure.query(async () => {
      const contas = await getAllActiveMetaAdAccountsForListing();
      return contas.map((c) => ({ id: c.id, nome: c.accountName ?? c.accountId })).sort((a, b) => a.nome.localeCompare(b.nome));
    }),

    /** Todos os vínculos coordenador × cliente (a lista desenha os chips com isso). */
    vinculos: adminProcedure.query(() => listCoordinatorLinks()),

    /**
     * Substitui os clientes de um coordenador. Toda validação é no backend:
     * o front não é segurança.
     */
    setClientes: adminProcedure
      .input(z.object({ userId: z.number().int(), accountIds: z.array(z.number().int()) }))
      .mutation(async ({ ctx, input }) => {
        try {
          const { antes, depois } = await setCoordinatorAccounts(input.userId, input.accountIds, ctx.user.id);
          const mudou = antes.length !== depois.length || antes.some((a) => !depois.includes(a));
          if (mudou) {
            await createUserAudit({
              actorUserId: ctx.user.id, targetUserId: input.userId,
              action: "coordinator_clients_updated",
              previousValue: String(antes.length), newValue: String(depois.length),
              metadataJson: { antes, depois },
            });
          }
          return { success: true, total: depois.length } as const;
        } catch (e) {
          throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message });
        }
      }),

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
        // Responsabilidade operacional — ortogonal a `role`, não dá permissão.
        operationalRole: z.enum(["collaborator", "coordinator"]).optional(),
        jobTitle: z.string().nullable().optional(),
        birthdayDay: z.number().int().min(1).max(31).nullable().optional(),
        birthdayMonth: z.number().int().min(1).max(12).nullable().optional(),
        active: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { id, ...patch } = input;

        // Fonte da verdade + base para guardas e auditoria.
        const before = await getUserById(id);
        if (!before) throw new TRPCError({ code: "NOT_FOUND" });

        // Um admin não pode se auto-rebaixar nem se desativar (evita lockout).
        if (id === ctx.user.id && ((patch.role && patch.role !== "admin") || patch.active === false)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Você não pode alterar a própria permissão/status." });
        }

        // Proteção do ÚLTIMO admin: não permitir rebaixar ou desativar o último
        // administrador ativo do sistema.
        const removesAdmin =
          before.role === "admin" && before.active !== false &&
          ((patch.role !== undefined && patch.role !== "admin") || patch.active === false);
        if (removesAdmin && (await countActiveAdmins()) <= 1) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Não é possível remover o último administrador ativo." });
        }

        if (patch.email) {
          const existingEmail = await getUserByOpenId(patch.email.toLowerCase());
          if (existingEmail && existingEmail.id !== id) {
            throw new TRPCError({ code: "CONFLICT", message: "E-mail já usado por outro colaborador." });
          }
        }

        const updated = await updateUserFields(id, patch);
        if (!updated) throw new TRPCError({ code: "NOT_FOUND" });

        // Auditoria PERSISTENTE (user_audit_logs) — nunca senha/hash/segredos.
        const audit = (action: string, previousValue?: string | null, newValue?: string | null, metadataJson?: unknown) =>
          createUserAudit({ actorUserId: ctx.user.id, targetUserId: id, action, previousValue: previousValue ?? null, newValue: newValue ?? null, metadataJson: metadataJson ?? null });
        if (patch.role && before.role !== patch.role) await audit("role_changed", before.role, patch.role);
        // Deixar de ser coordenador remove os vínculos: manter vínculo órfão faria
        // a pessoa voltar a receber tudo se fosse repromovida sem revisão.
        if (patch.operationalRole && before.operationalRole !== patch.operationalRole) {
          if (patch.operationalRole === "coordinator") {
            await audit("coordinator_role_enabled", before.operationalRole, patch.operationalRole);
          } else {
            const removidos = await clearCoordinatorAccounts(id);
            await audit("coordinator_role_disabled", before.operationalRole, patch.operationalRole, { vinculosRemovidos: removidos });
          }
        }
        if (patch.active === false && before.active !== false) await audit("user_deactivated", "active", "inactive");
        else if (patch.active === true && before.active === false) await audit("user_reactivated", "inactive", "active");
        const profileFields = (["name", "email", "jobTitle", "birthdayDay", "birthdayMonth"] as const).filter((f) => patch[f] !== undefined);
        if (profileFields.length > 0) await audit("profile_updated", null, null, { fields: profileFields });

        const { passwordHash: _omit, ...safe } = updated;
        return safe;
      }),

    /**
     * Exclusão PERMANENTE (anônima). Ver excluirUsuarioPermanente em db.ts para
     * o porquê de não ser DELETE físico. Exige o email digitado: é irreversível
     * e não pode acontecer por clique errado.
     */
    excluir: adminProcedure
      .input(z.object({ id: z.number().int(), confirmarEmail: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const alvo = await getUserById(input.id);
        if (!alvo) throw new TRPCError({ code: "NOT_FOUND" });
        // Confere no BACKEND: o front não é segurança.
        if ((alvo.email ?? "").toLowerCase() !== input.confirmarEmail.trim().toLowerCase()) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "O e-mail digitado não confere com o do usuário." });
        }
        try {
          const r = await excluirUsuarioPermanente(input.id, ctx.user.id);
          return { success: true, ...r } as const;
        } catch (e) {
          throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message });
        }
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

      // Eventos de um dia (hoje por padrão; date limitada a hoje ± 1 no backend).
      // A Home nunca quebra: sempre retorna um status tratável.
      todayEvents: protectedProcedure
        .input(z.object({ date: z.string().optional() }).optional())
        .query(async ({ ctx, input }) => {
        const ymd = resolveAgendaYmd(input?.date); // valida/limita a hoje ± 1
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
          return { status: "ok" as const, events: await listDayEvents(accessToken, ymd) };
        } catch {
          // Access token pode ter sido revogado → tenta refresh uma vez.
          try {
            const token = await doRefresh();
            return { status: "ok" as const, events: await listDayEvents(token, ymd) };
          } catch {
            return { status: "needs_reconnect" as const, events: [] };
          }
        }
      }),
    }),

    // ── Trello (cards atribuídos ao usuário logado) ──────────────────────────
    trello: router({
      status: protectedProcedure.query(async ({ ctx }) => {
        if (!isTrelloConfigured()) return { available: false, connected: false };
        const integ = await getUserIntegration(ctx.user.id, TRELLO_PROVIDER);
        const connected = !!integ && integ.active && !!integ.accessTokenEncrypted;
        return {
          available: true,
          connected,
          username: connected ? integ?.providerUsername ?? undefined : undefined,
        };
      }),

      // Recebe o token capturado pela página /trello/callback (fragmento da URL).
      // Valida o state (CSRF) e confere que a sessão é do mesmo usuário.
      completeToken: protectedProcedure
        .input(z.object({ state: z.string().min(1), token: z.string().min(10) }))
        .mutation(async ({ ctx, input }) => {
          const uid = await verifyIntegrationState(input.state);
          if (uid === null || uid !== ctx.user.id) {
            throw new TRPCError({ code: "FORBIDDEN", message: "Autorização inválida." });
          }
          let member;
          try {
            member = await getTrelloMember(input.token);
          } catch {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Token do Trello inválido." });
          }
          await upsertUserIntegration({
            userId: ctx.user.id,
            provider: TRELLO_PROVIDER,
            providerAccountId: member.id,
            providerUsername: member.username,
            providerAccountEmail: member.email ?? null,
            accessTokenEncrypted: encryptSecret(input.token),
            scopes: TRELLO_SCOPE,
            active: true,
          });
          return { success: true } as const;
        }),

      disconnect: protectedProcedure.mutation(async ({ ctx }) => {
        const integ = await getUserIntegration(ctx.user.id, TRELLO_PROVIDER);
        if (integ?.accessTokenEncrypted) {
          try { await revokeTrelloToken(decryptSecret(integ.accessTokenEncrypted)); } catch { /* best-effort */ }
        }
        await deactivateUserIntegration(ctx.user.id, TRELLO_PROVIDER);
        return { success: true } as const;
      }),

      // Cards de hoje/abertos atribuídos ao usuário. Home nunca quebra.
      myCards: protectedProcedure.query(async ({ ctx }) => {
        if (!isTrelloConfigured()) return { status: "unavailable" as const, cards: [] };
        const integ = await getUserIntegration(ctx.user.id, TRELLO_PROVIDER);
        if (!integ || !integ.active || !integ.accessTokenEncrypted) {
          return { status: "disconnected" as const, cards: [] };
        }
        let token = "";
        try { token = decryptSecret(integ.accessTokenEncrypted); } catch { token = ""; }
        if (!token) return { status: "needs_reconnect" as const, cards: [] };
        try {
          return { status: "ok" as const, cards: await listTrelloCards(token) };
        } catch (e) {
          if (e instanceof TrelloAuthError) return { status: "needs_reconnect" as const, cards: [] };
          return { status: "error" as const, cards: [] };
        }
      }),
    }),
  }),

  // ─── Storage ────────────────────────────────────────────────────────────────
  storage: router({
    status: protectedProcedure.query(() => ({ configured: isStorageConfigured() })),
  }),

  // ─── News bar (persistente) ─────────────────────────────────────────────────
  news: router({
    // Qualquer usuário logado vê as notícias ATIVAS (globais).
    listActive: protectedProcedure.query(async () => {
      const rows = await listActiveNews();
      return rows.map((r) => ({ id: r.id, text: r.text }));
    }),
    // Gestão: admin + developer.
    adminList: contentProcedure.query(() => listAllNews()),
    create: contentProcedure
      .input(z.object({ text: z.string().min(1).max(500) }))
      .mutation(async ({ ctx, input }) => {
        await createNewsItem({
          text: input.text.trim(),
          active: true,
          sortOrder: await nextNewsSortOrder(),
          createdByUserId: ctx.user.id,
          updatedByUserId: ctx.user.id,
        });
        return { success: true } as const;
      }),
    update: contentProcedure
      .input(z.object({ id: z.number().int(), text: z.string().max(500).optional(), active: z.boolean().optional() }))
      .mutation(async ({ ctx, input }) => {
        const { id, ...patch } = input;
        await updateNewsItem(id, { ...patch, updatedByUserId: ctx.user.id });
        return { success: true } as const;
      }),
    delete: contentProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ input }) => {
        await deleteNewsItem(input.id);
        return { success: true } as const;
      }),
    reorder: contentProcedure
      .input(z.object({ orderedIds: z.array(z.number().int()) }))
      .mutation(async ({ input }) => {
        await setNewsOrder(input.orderedIds);
        return { success: true } as const;
      }),
  }),

  // ─── SelvaTV (persistente + storage) ────────────────────────────────────────
  selvaTV: router({
    // Imagens ATIVAS (globais), com URL resolvida do storage.
    listActive: protectedProcedure.query(async () => {
      const rows = await listActiveSelvatv();
      return Promise.all(rows.map(async (r) => ({
        id: r.id,
        title: r.title ?? undefined,
        imageUrl: await getReadUrl(r.imageKey),
      })));
    }),
    adminList: contentProcedure.query(async () => {
      const rows = await listAllSelvatv();
      return Promise.all(rows.map(async (r) => ({
        id: r.id,
        title: r.title ?? "",
        active: r.active,
        imageUrl: await getReadUrl(r.imageKey),
      })));
    }),
    // A imagem é enviada por POST /api/uploads/selvatv (retorna imageKey);
    // aqui só persistimos o metadado.
    create: contentProcedure
      .input(z.object({ imageKey: z.string().min(1), title: z.string().max(255).optional() }))
      .mutation(async ({ ctx, input }) => {
        await createSelvatvItem({
          imageKey: input.imageKey,
          title: input.title?.trim() || null,
          storageProvider: "s3",
          active: true,
          sortOrder: await nextSelvatvSortOrder(),
          createdByUserId: ctx.user.id,
          updatedByUserId: ctx.user.id,
        });
        return { success: true } as const;
      }),
    update: contentProcedure
      .input(z.object({ id: z.number().int(), title: z.string().max(255).nullable().optional(), active: z.boolean().optional() }))
      .mutation(async ({ ctx, input }) => {
        const { id, ...patch } = input;
        await updateSelvatvItem(id, { ...patch, updatedByUserId: ctx.user.id });
        return { success: true } as const;
      }),
    delete: contentProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ input }) => {
        const item = await getSelvatvById(input.id);
        await deleteSelvatvItem(input.id);
        if (item?.imageKey) deleteObject(item.imageKey); // limpeza best-effort no storage
        return { success: true } as const;
      }),
    reorder: contentProcedure
      .input(z.object({ orderedIds: z.array(z.number().int()) }))
      .mutation(async ({ input }) => {
        await setSelvatvOrder(input.orderedIds);
        return { success: true } as const;
      }),

    // Slide nativo "Você prefere?" — config única (ativo + textos das opções).
    vocePrefereGet: protectedProcedure.query(async () => {
      const cfg = await getAppSetting<{ active: boolean; leftText: string; rightText: string }>(VOCE_PREFERE_KEY);
      return {
        active: cfg?.active ?? false,
        leftText: cfg?.leftText ?? "Falar com animais",
        rightText: cfg?.rightText ?? "Falar todas as línguas do mundo",
      };
    }),
    vocePrefereUpdate: contentProcedure
      .input(z.object({ active: z.boolean(), leftText: z.string().max(120), rightText: z.string().max(120) }))
      .mutation(async ({ ctx, input }) => {
        const prev = await getAppSetting<{ leftText: string; rightText: string }>(VOCE_PREFERE_KEY);
        const leftText = input.leftText.trim();
        const rightText = input.rightText.trim();
        // Se qualquer opção mudou, os votos antigos perdem sentido → resetar.
        const optionsChanged = !prev || prev.leftText !== leftText || prev.rightText !== rightText;
        await setAppSetting(VOCE_PREFERE_KEY, { active: input.active, leftText, rightText }, ctx.user.id);
        if (optionsChanged) await clearPollVotes();
        return { success: true, votesReset: optionsChanged } as const;
      }),

    // Votos do slide "Você prefere?" — qualquer usuário logado vota (1 voto).
    vocePrefereVotes: protectedProcedure.query(async ({ ctx }) => {
      const rows = await getPollVotesWithUsers();
      const build = async (opt: "left" | "right") => {
        const voters = rows.filter((r) => r.optionKey === opt);
        const shown = await Promise.all(voters.slice(0, 8).map(async (v) => {
          let avatarUrl: string | undefined;
          if (v.avatarKey) { try { avatarUrl = await getReadUrl(v.avatarKey); } catch { /* storage off */ } }
          return { name: v.name ?? "", avatarUrl };
        }));
        return { count: voters.length, voters: shown };
      };
      return {
        left: await build("left"),
        right: await build("right"),
        myVote: (rows.find((r) => r.userId === ctx.user.id)?.optionKey ?? null) as "left" | "right" | null,
      };
    }),
    vocePrefereVote: protectedProcedure
      .input(z.object({ option: z.enum(["left", "right"]) }))
      .mutation(async ({ ctx, input }) => {
        await upsertPollVote(ctx.user.id, input.option);
        return { success: true } as const;
      }),

    // Slides fixos institucionais (piscina "GravityField" e slide DVD SELVA
    // Spaces): ligáveis/desligáveis sem excluir do código. Default: ambos OFF.
    fixedSlidesGet: protectedProcedure.query(async () => {
      const cfg = await getAppSetting<FixedSlidesCfg>(SELVATV_FIXED_KEY);
      return { gravity: cfg?.gravity ?? false, dvd: cfg?.dvd ?? false };
    }),
    fixedSlidesUpdate: contentProcedure
      .input(z.object({ gravity: z.boolean(), dvd: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        await setAppSetting(SELVATV_FIXED_KEY, { gravity: input.gravity, dvd: input.dvd }, ctx.user.id);
        return { success: true } as const;
      }),
  }),

  // ─── Acessos (cofre de credenciais) — todos os usuários logados ─────────────
  // Senhas: cifradas (AES-256-GCM), NUNCA retornadas em listagens; só via
  // reveal (com auditoria). Sessão validada; nunca aceita userId do frontend.
  access: router({
    status: protectedProcedure.query(() => ({ encryptionReady: isAccessCryptoConfigured() })),

    clientsList: protectedProcedure.query(async ({ ctx }) => {
      await ensureSelvaInternalClient(ctx.user.id);
      const clients = await getActiveAccessClients();
      const items = await getAllActiveAccessItems();
      return clients.map((c) => {
        const its = items.filter((i) => i.clientId === c.id);
        const platforms = Array.from(new Set(its.map((i) => i.platform).filter(Boolean)));
        const tags = its.flatMap((i) => parseTags(i.tagsJson));
        // Blob de busca: NÃO inclui senha (nem cifrada).
        const searchBlob = [
          c.name,
          ...platforms,
          ...its.map((i) => i.label ?? ""),
          ...its.map((i) => i.loginEmail ?? ""),
          ...its.map((i) => i.url ?? ""),
          ...its.map((i) => i.notes ?? ""),
          ...tags,
        ].filter(Boolean).join(" ").toLowerCase();
        const lastUpdated = its.reduce<Date>((acc, i) => (i.updatedAt > acc ? i.updatedAt : acc), c.updatedAt);
        return {
          id: c.id, name: c.name, slug: c.slug, isInternal: c.isInternal,
          itemCount: its.length, platforms: platforms.slice(0, 4), lastUpdated, searchBlob,
        };
      });
    }),

    createClient: contentProcedure
      .input(z.object({ name: z.string().min(1).max(255) }))
      .mutation(async ({ ctx, input }) => {
        const name = input.name.trim();
        const slug = await uniqueClientSlug(name);
        const id = await createAccessClient({
          name, slug, isInternal: false, active: true,
          createdByUserId: ctx.user.id, updatedByUserId: ctx.user.id,
        });
        await createAccessAudit({ clientId: id, userId: ctx.user.id, action: "create_client", metadataJson: { name } });
        return { id };
      }),

    updateClient: contentProcedure
      .input(z.object({ id: z.number().int(), name: z.string().min(1).max(255) }))
      .mutation(async ({ ctx, input }) => {
        await updateAccessClient(input.id, { name: input.name.trim(), updatedByUserId: ctx.user.id });
        await createAccessAudit({ clientId: input.id, userId: ctx.user.id, action: "update_client" });
        return { success: true } as const;
      }),

    deactivateClient: contentProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        const client = await getAccessClientById(input.id);
        if (!client) throw new TRPCError({ code: "NOT_FOUND" });
        if (client.isInternal) throw new TRPCError({ code: "BAD_REQUEST", message: "O cliente interno não pode ser removido." });
        const count = await deactivateAccessItemsByClient(input.id, ctx.user.id);
        await updateAccessClient(input.id, { active: false, updatedByUserId: ctx.user.id });
        await createAccessAudit({ clientId: input.id, userId: ctx.user.id, action: "delete_client", metadataJson: { deactivatedItems: count } });
        return { deactivatedItems: count };
      }),

    // Itens de um cliente — SEM senha (só metadados).
    itemsByClient: protectedProcedure
      .input(z.object({ clientId: z.number().int() }))
      .query(async ({ input }) => {
        const rows = await getActiveAccessItemsByClient(input.clientId);
        return rows.map((r) => ({
          id: r.id, clientId: r.clientId, platform: r.platform, label: r.label ?? "",
          loginEmail: r.loginEmail ?? "", url: r.url ?? "", requiresCode: r.requiresCode,
          codeType: r.codeType ?? "", notes: r.notes ?? "", tags: parseTags(r.tagsJson),
          updatedAt: r.updatedAt,
        }));
      }),

    createItem: contentProcedure
      .input(z.object({
        clientId: z.number().int(),
        platform: z.string().min(1).max(120),
        label: z.string().max(255).optional(),
        loginEmail: z.string().max(320).optional(),
        password: z.string().min(1),
        url: z.string().max(1024).optional(),
        requiresCode: z.boolean().optional(),
        codeType: z.string().max(32).optional(),
        notes: z.string().max(5000).optional(),
        tags: z.array(z.string()).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!isAccessCryptoConfigured()) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Criptografia de acessos não configurada." });
        const id = await createAccessItem({
          clientId: input.clientId,
          platform: input.platform.trim(),
          label: input.label?.trim() || null,
          loginEmail: input.loginEmail?.trim() || null,
          passwordEncrypted: encryptAccessSecret(input.password),
          url: input.url?.trim() || null,
          requiresCode: !!input.requiresCode,
          codeType: input.requiresCode ? (input.codeType?.trim() || null) : null,
          notes: input.notes?.trim() || null,
          tagsJson: sanitizeTags(input.tags),
          active: true,
          createdByUserId: ctx.user.id,
          updatedByUserId: ctx.user.id,
        });
        await createAccessAudit({ accessItemId: id, clientId: input.clientId, userId: ctx.user.id, action: "create_access", metadataJson: { platform: input.platform } });
        return { id };
      }),

    updateItem: contentProcedure
      .input(z.object({
        id: z.number().int(),
        platform: z.string().min(1).max(120),
        label: z.string().max(255).optional(),
        loginEmail: z.string().max(320).optional(),
        password: z.string().min(1).optional(), // só quando alterada (com confirmação no front)
        url: z.string().max(1024).optional(),
        requiresCode: z.boolean().optional(),
        codeType: z.string().max(32).optional(),
        notes: z.string().max(5000).optional(),
        tags: z.array(z.string()).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const item = await getAccessItemById(input.id);
        if (!item) throw new TRPCError({ code: "NOT_FOUND" });
        const patch: Record<string, unknown> = {
          platform: input.platform.trim(),
          label: input.label?.trim() || null,
          loginEmail: input.loginEmail?.trim() || null,
          url: input.url?.trim() || null,
          requiresCode: !!input.requiresCode,
          codeType: input.requiresCode ? (input.codeType?.trim() || null) : null,
          notes: input.notes?.trim() || null,
          tagsJson: sanitizeTags(input.tags),
          updatedByUserId: ctx.user.id,
        };
        if (input.password) {
          if (!isAccessCryptoConfigured()) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Criptografia de acessos não configurada." });
          patch.passwordEncrypted = encryptAccessSecret(input.password);
        }
        await updateAccessItem(input.id, patch);
        await createAccessAudit({ accessItemId: input.id, clientId: item.clientId, userId: ctx.user.id, action: "update_access", metadataJson: { passwordChanged: !!input.password } });
        return { success: true } as const;
      }),

    deactivateItem: contentProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        const item = await getAccessItemById(input.id);
        if (!item) throw new TRPCError({ code: "NOT_FOUND" });
        await updateAccessItem(input.id, { active: false, updatedByUserId: ctx.user.id });
        await createAccessAudit({ accessItemId: input.id, clientId: item.clientId, userId: ctx.user.id, action: "delete_access" });
        return { success: true } as const;
      }),

    // Revela/copia a senha (descriptografa no servidor) + AUDITORIA.
    revealPassword: protectedProcedure
      .input(z.object({ itemId: z.number().int(), action: z.enum(["reveal", "copy"]) }))
      .mutation(async ({ ctx, input }) => {
        if (!isAccessCryptoConfigured()) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Criptografia de acessos não configurada." });
        const item = await getAccessItemById(input.itemId);
        if (!item || !item.active) throw new TRPCError({ code: "NOT_FOUND" });
        let password: string;
        try {
          password = decryptAccessSecret(item.passwordEncrypted);
        } catch {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível descriptografar." });
        }
        await createAccessAudit({
          accessItemId: item.id, clientId: item.clientId, userId: ctx.user.id,
          action: input.action === "copy" ? "copy_password" : "reveal_password",
        });
        return { password };
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

  // ─── Comunicados (avisos internos do admin) ─────────────────────────────────
  comunicados: router({
    /** Lista com recibo agregado — quem envia precisa ver quem leu. */
    list: adminProcedure.query(() => listarComunicados()),
    recibos: adminProcedure.input(z.object({ id: z.number().int() })).query(({ input }) => recibosComunicado(input.id)),

    /** Prévia do alcance antes de enviar — evita disparar para o público errado. */
    previewPublico: adminProcedure
      .input(z.object({ publico: z.enum(["TODOS", "ROLE", "FUNCAO", "PESSOAS"]), alvoRole: z.string().max(20).nullable().optional(), alvoFuncao: z.string().max(20).nullable().optional(), alvoUserIds: z.array(z.number().int()).nullable().optional() }))
      .query(async ({ input }) => {
        const ids = await resolverPublico(input.publico, input.alvoRole ?? null, input.alvoUserIds ?? null, input.alvoFuncao ?? null);
        return { total: ids.length };
      }),

    enviar: adminProcedure
      .input(z.object({
        titulo: z.string().min(1).max(180),
        corpo: z.string().min(1).max(20000),
        publico: z.enum(["TODOS", "ROLE", "FUNCAO", "PESSOAS"]).default("TODOS"),
        alvoRole: z.enum(["user", "admin", "developer"]).nullable().optional(),
        alvoFuncao: z.enum(["collaborator", "coordinator"]).nullable().optional(),
        alvoUserIds: z.array(z.number().int()).nullable().optional(),
        fixado: z.boolean().default(false),
      }))
      .mutation(async ({ ctx, input }) => {
        if (input.publico === "ROLE" && !input.alvoRole) throw new TRPCError({ code: "BAD_REQUEST", message: "Escolha a permissão." });
        if (input.publico === "FUNCAO" && !input.alvoFuncao) throw new TRPCError({ code: "BAD_REQUEST", message: "Escolha a função operacional." });
        if (input.publico === "PESSOAS" && !(input.alvoUserIds?.length)) throw new TRPCError({ code: "BAD_REQUEST", message: "Escolha ao menos uma pessoa." });
        const destinatarios = await resolverPublico(input.publico, input.alvoRole ?? null, input.alvoUserIds ?? null, input.alvoFuncao ?? null);
        if (destinatarios.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum destinatário para este público." });

        const id = await criarComunicado({
          autorUserId: ctx.user.id, titulo: input.titulo, corpo: input.corpo,
          publico: input.publico, alvoRole: input.alvoRole ?? null, alvoFuncao: input.alvoFuncao ?? null,
          alvoUserIds: input.alvoUserIds ?? null, fixado: input.fixado,
        });
        const r = await entregarComunicado({
          id, titulo: input.titulo, corpo: input.corpo,
          autorNome: ctx.user.name ?? "Administração", destinatarios,
        });
        await setComunicadoEnviados(id, r.entregues);
        return { success: true, id, ...r } as const;
      }),

    fixar: adminProcedure
      .input(z.object({ id: z.number().int(), fixado: z.boolean() }))
      .mutation(async ({ input }) => { await setComunicadoFixado(input.id, input.fixado); return { success: true } as const; }),
  }),

  notifications: router({
    /** Configuração do resumo diário automático (horário/ativo). */
    digestSettings: adminProcedure.query(async () => {
      const cfg = await getDigestSettings();
      const dia = new Intl.DateTimeFormat("en-CA", { timeZone: cfg.timezone }).format(new Date());
      const excecao = await getDigestOverride(dia);
      // O modo de email vem junto: o admin precisa saber se vai sair de verdade.
      return { ...cfg, hoje: { dia, enabled: excecao?.enabled ?? true, timeOverride: excecao?.timeOverride ?? null }, email: emailMode() };
    }),

    setDigestSettings: adminProcedure
      .input(z.object({
        autoEnabled: z.boolean().optional(),
        defaultTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Horário inválido (use HH:MM).").optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await updateDigestSettings(input, ctx.user.id);
        return { success: true } as const;
      }),

    /**
     * Diagnóstico de email para admin/dev.
     *
     * Existe porque o sintoma "não chegou" não tinha onde ser investigado: o erro
     * do SMTP morria num console.error que o Railway apaga a cada deploy. Agora a
     * verdade fica no banco e aparece aqui.
     */
    diagnosticoEmail: adminProcedure
      .input(z.object({ dias: z.number().int().min(1).max(30).default(7), limite: z.number().int().min(1).max(200).default(30) }).default({ dias: 7, limite: 30 }))
      .query(async ({ input }) => {
        const [resumo, ultimos, cfg] = await Promise.all([
          resumoEnviosEmail(input.dias),
          ultimosEnviosEmail(input.limite),
          getDigestSettings(),
        ]);
        return {
          modo: emailMode(),
          resumo,
          ultimos,
          proximoEnvio: cfg.autoEnabled ? `${cfg.defaultTime} ${cfg.timezone}` : null,
          autoLigado: cfg.autoEnabled,
        };
      }),

    /**
     * Teste de envio — SEMPRE restrito. Manda só para EMAIL_TEST_RECIPIENT; sem
     * essa variável definida, recusa em vez de cair na lista real. Uma regra de
     * produto ("teste não vai para colaborador") que só vive no front é uma regra
     * que alguém contorna sem querer.
     */
    testarEnvioEmail: adminProcedure.mutation(async ({ ctx }) => {
      const destinos = destinatariosDeTeste();
      if (destinos.length === 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Defina EMAIL_TEST_RECIPIENT antes de testar — sem ela o teste iria para os destinatários reais.",
        });
      }
      const quando = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date());
      const envio = await sendEmail({
        to: destinos,
        subject: `Teste de envio · ${quando}`,
        html: `<div style="font:14px Arial,sans-serif;color:#333">
          <p>Teste de envio do SELVA Spaces.</p>
          <p style="color:#666;font-size:12px">Transporte: <strong>${transporteAtivo()}</strong> · disparado por ${ctx.user.name ?? ctx.user.id} em ${quando}.</p>
        </div>`,
        text: `Teste de envio do SELVA Spaces. Transporte: ${transporteAtivo()}. Disparado por ${ctx.user.name ?? ctx.user.id} em ${quando}.`,
        tipo: "teste",
        userId: ctx.user.id,
      });
      return { ...envio, transporte: transporteAtivo(), destinos };
    }),

    // ─── Jornalzinho diário ──────────────────────────────────────────────
    // Quem recebe o quê é decidido pelo PAPEL. Ninguém configura nada, e o
    // financeiro não sai do círculo de admin nem por engano de configuração.

    /** Quem receberia o quê hoje — sem mandar nada. */
    previewDigest: adminProcedure
      .input(z.object({ dia: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }).default({}))
      .query(({ input }) => previewDigest(input.dia ?? hojeAgencia())),

    /** Matriz papel → blocos, para a tela explicar a regra em vez de esconder. */
    matrizDigest: protectedProcedure.query(() => BLOCOS_POR_PAPEL),

    /** O HTML que a pessoa receberia — a prévia visual antes de qualquer envio. */
    previewDigestHtml: adminProcedure
      .input(z.object({
        papel: z.enum(["admin", "developer", "user"]).default("admin"),
        dia: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      }).default({ papel: "admin" }))
      .query(({ input }) => buildDailyDigestForRole(input.papel, input.dia ?? hojeAgencia())),

    /**
     * "Enviar digest de teste agora". Recusa sem EMAIL_TEST_RECIPIENT — a trava
     * mora no serviço, não aqui, para nenhum caminho novo escapar dela.
     */
    enviarDigestTeste: adminProcedure
      .input(z.object({ dia: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }).default({}))
      .mutation(async ({ ctx, input }) => {
        try {
          return await enviarDigestDeTeste(
            { id: ctx.user.id, name: ctx.user.name ?? null, role: ctx.user.role ?? null },
            input.dia ?? hojeAgencia(),
          );
        } catch (e) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: (e as Error).message });
        }
      }),

    /**
     * Disparo real para todos, conforme papel. Exige confirmação explícita: um
     * clique a mais é barato perto de um envio indevido para a empresa toda.
     */
    dispararDigestReal: adminProcedure
      .input(z.object({
        confirmar: z.literal(true),
        forcarReenvio: z.boolean().default(false),
        dia: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      }))
      .mutation(({ input }) => runDailyDigestJob(input.dia ?? hojeAgencia(), { forcarReenvio: input.forcarReenvio })),

    /** Prévia do disparo manual: alcance e avisos antes de mandar. */
    previewResumo: adminProcedure
      .input(z.object({ excluirUserIds: z.array(z.number().int()).default([]) }))
      .query(({ input }) => previewResumoManual(input.excluirUserIds)),

    /**
     * Disparo manual assistido. Reenvio no mesmo dia exige `confirmarReenvio`
     * — o front pergunta antes; o backend não confia nisso e checa também.
     */
    dispararResumo: adminProcedure
      .input(z.object({
        canal: z.enum(["inapp", "email", "ambos"]),
        excluirUserIds: z.array(z.number().int()).default([]),
        confirmarReenvio: z.boolean().default(false),
      }))
      .mutation(async ({ ctx, input }) => {
        const prev = await previewResumoManual(input.excluirUserIds);
        if (prev.jaEnviadoHoje && !input.confirmarReenvio && input.canal !== "inapp") {
          throw new TRPCError({ code: "CONFLICT", message: "Esse resumo já foi enviado hoje. Confirme o reenvio." });
        }
        const r = await dispararResumoManual({ canal: input.canal, excluirUserIds: input.excluirUserIds, atorId: ctx.user.id });
        if (!r.conteudo) throw new TRPCError({ code: "BAD_REQUEST", message: "Não há resumo para hoje — não foi possível gerar o briefing." });
        return r;
      }),

    /** Exceção de um dia: feriado, folga geral. Não desliga a rotina. */
    setDigestHoje: adminProcedure
      .input(z.object({
        dia: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        enabled: z.boolean().optional(),
        timeOverride: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { dia, ...v } = input;
        await setDigestOverride(dia, v, ctx.user.id);
        return { success: true } as const;
      }),

    // Preferências por (tipo × canal). Retorna o catálogo já resolvido com o que
    // o usuário gravou — o front não precisa saber dos defaults.
    prefs: protectedProcedure.query(async ({ ctx }) => {
      const salvos = await getNotificationPrefs(ctx.user.id);
      const pmap = new Map(salvos.map((p) => [p.tipo, p]));
      return notifTiposFor(ctx.user.role).map((t) => {
        const p = pmap.get(t.v);
        return {
          tipo: t.v, dominio: t.dominio, label: t.label, desc: t.desc,
          inApp: p?.inApp ?? t.inApp,
          emailModo: (p?.emailModo as EmailModo) ?? t.emailModo,
          inAppObrigatorio: !!t.inAppObrigatorio,
          // Travado para este usuário? (institucional e não-admin) — a UI
          // mostra "sempre ativo" sem toggle.
          editavel: tipoEditavelPor(t, ctx.user.role),
          institucional: !!t.institucional,
        };
      });
    }),
    setPref: protectedProcedure
      .input(z.object({ tipo: z.string().max(40), inApp: z.boolean().optional(), emailModo: z.enum(["off", "hora", "digest"]).optional() }))
      .mutation(async ({ ctx, input }) => {
        const def = notifTipoDef(input.tipo);
        if (!def) throw new TRPCError({ code: "BAD_REQUEST", message: "Tipo de notificação desconhecido." });
        if (def.adminOnly && ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a notificações financeiras." });
        // Institucional (aniversário/comunicado) não é preferência pessoal do
        // usuário comum — a UI não oferece o toggle, e o backend recusa também,
        // porque esconder no cliente não é permissão.
        if (!tipoEditavelPor(def, ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN", message: "Este aviso é institucional e não pode ser desativado." });
        await upsertNotificationPref(ctx.user.id, input.tipo, { inApp: input.inApp, emailModo: input.emailModo });
        return { success: true } as const;
      }),
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
          },
          // Mesmo tipo de conta que o cron usa — os dois caminhos não podem
          // divergir sobre o que é alerta relevante para este cliente.
          { tipo: resolverTipoDaConta(account, account.goalTypeOverride ? [] : await objetivosDasCampanhas(input.accountId).catch(() => [])) }
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

    getDailyBriefing: protectedProcedure.query(async () => {
      // Briefing é GLOBAL: mesma linha para todo mundo, gerada uma vez por dia.
      // A lógica vive no briefingService porque o cron também precisa dela —
      // antes estava presa aqui dentro e o job nunca conseguia gerar nada.
      const content = await obterBriefingDoDia();
      return { content };
    }),
  }),

  // ─── Microsoft Clarity por cliente ──────────────────────────────────────────
  clarity: router({
    /**
     * Config do cliente. Qualquer usuário logado LÊ (clientes são globais aqui),
     * mas o token nunca sai do servidor — vai só `hasToken`.
     */
    settings: protectedProcedure
      .input(z.object({ accountId: z.number().int() }))
      .query(({ input }) => getClaritySettings(input.accountId)),

    /** Configurar é de admin e developer (contentProcedure). */
    upsert: contentProcedure
      .input(z.object({
        accountId: z.number().int(),
        enabled: z.boolean().optional(),
        projectId: z.string().max(64).nullable().optional(),
        // undefined = não mexe no token; "" = apaga. O front nunca reenvia o atual.
        // O token do Clarity é um JWT e passa fácil de 1KB — o limite antigo de
        // 500 recusava tokens legítimos. A coluna é TEXT; 8k é folga com sobra.
        apiToken: z.string().max(8000, "Token muito longo — confira se colou só o token.").nullable().optional(),
        domain: z.string().max(255).nullable().optional(),
        importantUrls: z.array(z.string().max(500)).nullable().optional(),
        notes: z.string().max(5000).nullable().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { accountId, ...v } = input;
        try {
          await upsertClaritySettings(accountId, v, ctx.user.id);
          return { success: true } as const;
        } catch (e) {
          throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message });
        }
      }),

    /** Último snapshot + série (o histórico que a API do Clarity não dá). */
    ultimo: protectedProcedure
      .input(z.object({ accountId: z.number().int() }))
      .query(({ input }) => ultimoClaritySnapshot(input.accountId)),

    serie: protectedProcedure
      .input(z.object({ accountId: z.number().int(), limite: z.number().int().min(1).max(90).default(30) }))
      .query(({ input }) => serieClaritySnapshots(input.accountId, input.limite)),

    // ── Performance técnica ───────────────────────────────────────────────────
    perfSettings: protectedProcedure
      .input(z.object({ accountId: z.number().int() }))
      .query(async ({ input }) => {
        const cfg = await getClaritySettings(input.accountId);
        return { cfg, providerPronto: isPageSpeedConfigured() };
      }),

    setPerf: contentProcedure
      .input(z.object({
        accountId: z.number().int(),
        performanceEnabled: z.boolean().optional(),
        performanceProvider: z.enum(["pagespeed", "gtmetrix", "manual"]).optional(),
        performanceUrl: z.string().max(500).nullable().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { accountId, ...v } = input;
        try { await upsertPerfSettings(accountId, v, ctx.user.id); return { success: true } as const; }
        catch (e) { throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message }); }
      }),

    perfUltimo: protectedProcedure
      .input(z.object({ accountId: z.number().int() }))
      .query(({ input }) => ultimoSiteSnapshot(input.accountId)),

    perfSerie: protectedProcedure
      .input(z.object({ accountId: z.number().int(), limite: z.number().int().min(1).max(90).default(30) }))
      .query(({ input }) => serieSiteSnapshots(input.accountId, input.limite)),

    /** Teste real de carregamento: 10–30s. */
    perfSync: contentProcedure
      .input(z.object({ accountId: z.number().int() }))
      .mutation(({ input }) => sincronizarPerformance(input.accountId)),

    // ── Saúde do site: segurança e uptime ─────────────────────────────────────
    saude: protectedProcedure
      .input(z.object({ accountId: z.number().int() }))
      .query(async ({ input }) => {
        const [seguranca, uptime] = await Promise.all([
          ultimoSnapshotPorProvider(input.accountId, "security_check"),
          ultimoSnapshotPorProvider(input.accountId, "uptime_check"),
        ]);
        return { seguranca, uptime };
      }),

    uptimeSerie: protectedProcedure
      .input(z.object({ accountId: z.number().int(), limite: z.number().int().min(1).max(90).default(14) }))
      .query(({ input }) => serieSnapshotsPorProvider(input.accountId, "uptime_check", input.limite)),

    /** Roda os dois checks agora. São leves — sem cota, sem custo. */
    checarSite: contentProcedure
      .input(z.object({ accountId: z.number().int() }))
      .mutation(async ({ input }) => {
        const contas = await contasComSite();
        const alvo = contas.find((c) => c.accountId === input.accountId);
        if (!alvo) throw new TRPCError({ code: "BAD_REQUEST", message: "Configure o domínio principal do site antes de checar." });
        // Valida ANTES de disparar qualquer requisição: URL interna nem chega a
        // ser tentada, e o erro sobe em vez de virar "ok" silencioso.
        try {
          await validarUrlPublica(alvo.url);
        } catch (e) {
          throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message });
        }
        const [seg, up] = await Promise.all([
          checarSegurancaCliente(input.accountId, alvo.url),
          checarUptimeCliente(input.accountId, alvo.url),
        ]);
        // Se QUALQUER um recusou, o usuário precisa saber — antes o "ok" de um
        // escondia o bloqueio do outro.
        if (!seg.ok || !up.ok) {
          const motivo = seg.motivo ?? up.motivo;
          if (motivo) throw new TRPCError({ code: "BAD_REQUEST", message: motivo });
        }
        return { seguranca: seg, uptime: up };
      }),

    /** Sync manual — gasta até 3 das 10 requisições do dia. */
    sync: contentProcedure
      .input(z.object({ accountId: z.number().int(), dias: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(1) }))
      .mutation(({ input }) => sincronizarClarity(input.accountId, input.dias)),
  }),

  // ─── Contexto, notas e Relatório de Site & Jornada ──────────────────────────
  siteDiag: router({
    /** Contexto manual do cliente. Todo mundo lê; admin/dev escrevem. */
    /** Snapshots do GA4 já gravados — a tela não chama a API do Google. */
    ga4Snapshot: protectedProcedure
      .input(z.object({ accountId: z.number().int() }))
      .query(({ input }) => ga4SnapshotsDoCliente(input.accountId)),

    contexto: protectedProcedure
      .input(z.object({ accountId: z.number().int() }))
      .query(({ input }) => getClientContext(input.accountId)),

    salvarContexto: contentProcedure
      .input(z.object({
        accountId: z.number().int(),
        objective: z.string().max(2000).nullable().optional(),
        offer: z.string().max(2000).nullable().optional(),
        audience: z.string().max(2000).nullable().optional(),
        importantPages: z.array(z.string().max(500)).nullable().optional(),
        conversionEvents: z.array(z.string().max(200)).nullable().optional(),
        trackingNotes: z.string().max(4000).nullable().optional(),
        currentHypotheses: z.string().max(4000).nullable().optional(),
        constraints: z.string().max(4000).nullable().optional(),
        previousTests: z.string().max(4000).nullable().optional(),
        nextSteps: z.string().max(4000).nullable().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { accountId, importantPages, conversionEvents, ...resto } = input;
        try {
          await upsertClientContext(accountId, {
            ...resto,
            ...(importantPages !== undefined ? { importantPagesJson: importantPages } : {}),
            ...(conversionEvents !== undefined ? { conversionEventsJson: conversionEvents } : {}),
          }, ctx.user.id);
          return { success: true } as const;
        } catch (e) {
          throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message });
        }
      }),

    /** Notas do cliente — qualquer pessoa da equipe registra o que observou. */
    notas: protectedProcedure
      .input(z.object({ accountId: z.number().int(), limite: z.number().int().min(1).max(50).default(20) }))
      .query(({ input }) => listClientNotes(input.accountId, input.limite)),

    criarNota: protectedProcedure
      .input(z.object({ accountId: z.number().int(), body: z.string().min(1).max(4000) }))
      .mutation(async ({ ctx, input }) => {
        await criarClientNote(input.accountId, ctx.user.id, input.body.trim());
        return { success: true } as const;
      }),

    apagarNota: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        await apagarClientNote(input.id, ctx.user.id, ctx.user.role === "admin");
        return { success: true } as const;
      }),

    /** Gera e salva o relatório. Custa uma chamada de LLM — por isso é admin/dev. */
    gerarRelatorio: contentProcedure
      .input(z.object({
        accountId: z.number().int(),
        rangeStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        rangeEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      }))
      .mutation(async ({ ctx, input }) => {
        const conta = await getMetaAdAccountById(input.accountId);
        if (!conta) throw new TRPCError({ code: "NOT_FOUND", message: "Cliente não encontrado." });
        const nome = conta.accountName ?? conta.accountId;
        const r = await gerarSiteReport(input.accountId, nome, input.rangeStart, input.rangeEnd);
        const md = siteReportMarkdown(r, nome, input.rangeStart, input.rangeEnd);
        const id = await salvarSiteReport({
          accountId: input.accountId, rangeStart: input.rangeStart, rangeEnd: input.rangeEnd,
          generatedByUserId: ctx.user.id, reportJson: r, markdown: md, fontesJson: r.fontes,
        });
        return { id, relatorio: r, markdown: md };
      }),

    relatorios: protectedProcedure
      .input(z.object({ accountId: z.number().int() }))
      .query(({ input }) => listarSiteReports(input.accountId)),

    relatorio: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .query(({ input }) => getSiteReport(input.id)),

    // ── Chat por cliente ──────────────────────────────────────────────────────
    /** Histórico é do cliente: o time todo lê o que já foi perguntado. */
    chat: protectedProcedure
      .input(z.object({ accountId: z.number().int() }))
      .query(async ({ input }) => {
        const conta = await getMetaAdAccountById(input.accountId);
        const msgs = await listChatMessages(input.accountId, 50);
        const { fontes } = await montarFontesChat(input.accountId, conta?.accountName ?? "");
        return { mensagens: msgs, sugestoes: sugestoesPara(fontes), fontes };
      }),

    perguntar: protectedProcedure
      .input(z.object({ accountId: z.number().int(), pergunta: z.string().min(1).max(2000) }))
      .mutation(async ({ ctx, input }) => {
        const conta = await getMetaAdAccountById(input.accountId);
        if (!conta) throw new TRPCError({ code: "NOT_FOUND", message: "Cliente não encontrado." });

        // Histórico só deste cliente — nunca cruza contexto entre clientes.
        const anteriores = await listChatMessages(input.accountId, 12);
        const historico = anteriores.map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

        let r: { resposta: string; fontes: FontesChat };
        try {
          r = await perguntarSobreCliente(input.accountId, conta.accountName ?? conta.accountId, input.pergunta, historico);
        } catch (e) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: (e as Error).message });
        }
        // Só grava se respondeu: pergunta órfã sujaria o histórico.
        await salvarChatMessage({ accountId: input.accountId, userId: ctx.user.id, role: "user", content: input.pergunta });
        await salvarChatMessage({ accountId: input.accountId, userId: ctx.user.id, role: "assistant", content: r.resposta, fontesJson: r.fontes });
        return r;
      }),

    limparChat: contentProcedure
      .input(z.object({ accountId: z.number().int() }))
      .mutation(async ({ input }) => { await limparChat(input.accountId); return { success: true } as const; }),
  }),

  // ─── Visão geral do Tracker: widgets, sites e redes sociais ──────────────────
  visao: router({
    /** Catálogo + preferência da pessoa, já resolvidos. */
    widgets: protectedProcedure.query(async ({ ctx }) => {
      const prefs = await getWidgetPrefs(ctx.user.id);
      return resolverWidgets((ctx.user.role ?? "user") as Role, prefs);
    }),

    /**
     * Grava só o que foi mexido. O backend revalida o papel: esconder no
     * cliente não é permissão — é decoração.
     */
    salvarWidget: protectedProcedure
      .input(z.object({ key: z.string(), visivel: z.boolean(), ordem: z.number().int().nullable().optional() }))
      .mutation(async ({ ctx, input }) => {
        const w = widgetPorKey(input.key);
        if (!w) throw new TRPCError({ code: "BAD_REQUEST", message: "Widget desconhecido." });
        if (!widgetServeRole(w, (ctx.user.role ?? "user") as Role)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Este widget não está disponível para o seu perfil." });
        }
        await upsertWidgetPref(ctx.user.id, input.key, input.visivel, input.ordem ?? null);
        return { success: true } as const;
      }),

    /** Voltar ao padrão: apaga as linhas para voltar a seguir o catálogo. */
    resetarWidgets: protectedProcedure.mutation(async ({ ctx }) => {
      await limparWidgetPrefs(ctx.user.id);
      return { success: true } as const;
    }),

    /** Resumo dos sites do portfólio — "algum site está com problema agora?". */
    sites: protectedProcedure.query(() => resumoSitesPortfolio()),
  }),

  // ─── Redes sociais por cliente (cadastro) ────────────────────────────────────
  social: router({
    daConta: protectedProcedure
      .input(z.object({ accountId: z.number().int() }))
      .query(({ input }) => listarSociaisDaConta(input.accountId)),

    salvar: contentProcedure
      .input(z.object({
        accountId: z.number().int(),
        provider: z.enum(["instagram", "linkedin", "youtube"]).default("instagram"),
        // O @ vem colado de tudo quanto é jeito: com @, com URL inteira, com
        // espaço. Normalizamos aqui para o cadastro não virar lixo.
        handle: z.string().min(1).max(120),
        profileUrl: z.string().max(500).optional(),
        notes: z.string().max(1000).optional(),
        enabled: z.boolean().default(true),
      }))
      .mutation(async ({ input }) => {
        const handle = normalizarHandle(input.handle);
        if (!handle) throw new TRPCError({ code: "BAD_REQUEST", message: "Informe o @ do perfil." });
        await salvarSocial({
          accountId: input.accountId,
          provider: input.provider,
          handle,
          profileUrl: input.profileUrl || urlPadraoDoPerfil(input.provider, handle),
          notes: input.notes ?? null,
          enabled: input.enabled,
        });
        return { success: true, handle } as const;
      }),

    apagar: contentProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ input }) => { await apagarSocial(input.id); return { success: true } as const; }),
  }),

  // ─── Presença ────────────────────────────────────────────────────────────────
  presenca: router({
    /** A aba aberta bate aqui de tempos em tempos. Barato de propósito. */
    ping: protectedProcedure.mutation(async ({ ctx }) => {
      await registrarPresenca(ctx.user.id);
      return { ok: true } as const;
    }),

    /** Só id e nome — presença não é lugar de expor e-mail nem papel. */
    lista: protectedProcedure.query(() => listarPresenca()),
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

    listAll: protectedProcedure
      .input(z.object({
        dominio: z.enum(["PERFORMANCE", "FINANCEIRO", "TAREFAS", "COMUNICADO", "SITE"]).optional(),
        status: z.enum(["nova", "lida"]).optional(),
        accountId: z.number().int().optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        // Financeiro é admin-only: um não-admin pedindo esse domínio recebe vazio,
        // e sem filtro ele nunca vê financeiro (não há linha dele — o fan-out do
        // cron só cria para admin). O guard aqui é a segunda barreira.
        if (input?.dominio === "FINANCEIRO" && ctx.user.role !== "admin") return [];
        return getAllAlertsForUser(ctx.user.id, 200, input ?? undefined);
      }),

    /** Clientes presentes nas notificações desta pessoa (para o filtro). */
    clientesDisponiveis: protectedProcedure
      .input(z.object({
        dominio: z.enum(["PERFORMANCE", "FINANCEIRO", "TAREFAS", "COMUNICADO", "SITE"]).optional(),
        status: z.enum(["nova", "lida"]).optional(),
      }).optional())
      .query(({ ctx, input }) => clientesComNotificacao(ctx.user.id, input ?? undefined)),

    unreadByDominio: protectedProcedure.query(async ({ ctx }) => {
      const c = await getUnreadCountByDominio(ctx.user.id);
      return ctx.user.role === "admin" ? c : { ...c, FINANCEIRO: 0 };
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
      .input(z.object({ accountId: z.number().optional(), dominio: z.enum(["PERFORMANCE", "FINANCEIRO", "TAREFAS", "COMUNICADO", "SITE"]).optional() }))
      .mutation(async ({ ctx, input }) => {
        if (input.accountId) {
          await markAllAlertsReadByAccount(ctx.user.id, input.accountId);
        } else {
          await markAllAlertsRead(ctx.user.id, input.dominio);
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
        // `modulos` distingue os dois formatos: relatório modular tem outra
        // forma de narrative (fatos/hipóteses/pendências) e não tem
        // dataSnapshot. Sem esta marca, a página renderizaria o modular como
        // se fosse legado — e sairia quase em branco no link do cliente.
        return {
          tier: snapshot.tier,
          period: { start: snapshot.periodStart, end: snapshot.periodEnd },
          data: JSON.parse(snapshot.dataSnapshot ?? "{}"),
          narrative: JSON.parse(snapshot.narrative ?? "null"),
          modulos: (snapshot.modulesJson ?? null) as string[] | null,
          fontes: (snapshot.fontesJson ?? null) as { rotulo: string; presente: boolean; porque?: string }[] | null,
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
          // NULL nos relatórios antigos (eram por tier). A tela cai no tier.
          modulos: (r.modulesJson ?? null) as string[] | null,
          fontes: (r.fontesJson ?? null) as { rotulo: string; presente: boolean }[] | null,
          geradoPor: r.generatedByUserId,
          temMarkdown: !!r.markdown,
        }));
      }),

    /** Catálogo de módulos + o que ESTE cliente tem de fato. Sem LLM. */
    opcoes: protectedProcedure
      .input(z.object({ accountId: z.number(), inicio: z.string(), fim: z.string() }))
      .query(async ({ ctx, input }) => {
        const conta = await getVerifiedAccount(input.accountId, ctx.user.id);
        const ctxCliente = await buildClientIntelligenceContext(
          input.accountId,
          conta.accountName ?? conta.accountId,
          { inicio: input.inicio, fim: input.fim },
        );
        return { presets: PRESETS, fontes: fontesDe(ctxCliente) };
      }),

    /**
     * Geração modular. Marcar um módulo que o cliente não tem NÃO é erro: a
     * seção é omitida e a ausência vira pendência declarada no relatório.
     */
    gerarModular: protectedProcedure
      .input(z.object({
        accountId: z.number(),
        inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        fim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        modulos: z.array(z.enum(MODULOS)).min(1),
        notas: z.string().max(2000).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const conta = await getVerifiedAccount(input.accountId, ctx.user.id);
        const nome = conta.accountName ?? conta.accountId;
        const periodo = { inicio: input.inicio, fim: input.fim };

        const { relatorio, fontes, markdown, dadosSite } = await gerarRelatorioModular(
          input.accountId, nome, periodo, input.modulos, input.notas,
        );

        // Visual de mídia (KPIs com comparação, gráfico de 8 semanas, criativos
        // com thumbnail) só quando o módulo de mídia entra — reusa o
        // assembleReportData do relatório legado. Um relatório Técnico não paga
        // esse fetch nem mostra cards de investimento vazios.
        const querMidia = input.modulos.includes("midia") || input.modulos.includes("campanhas");
        let dadosMidia: Awaited<ReturnType<typeof assembleReportData>> | null = null;
        if (querMidia) {
          try {
            dadosMidia = await assembleReportData(input.accountId, input.inicio, input.fim);
          } catch (e) {
            // Sem mídia o relatório continua — vira pendência, não erro.
            logger.warn?.(`[Relatório] Sem dados visuais de mídia (conta ${input.accountId}): ${(e as Error).message}`);
          }
        }

        // dataSnapshot passa a existir (era o bug): estruturado, para a vista
        // pública montar cards e gráfico em vez de só texto.
        const dataSnapshot = JSON.stringify({ midia: dadosMidia, site: dadosSite });

        const publicToken = nanoid(24);
        await createReportSnapshot({
          accountId: input.accountId,
          tier: tierDe(input.modulos),
          publicToken,
          periodStart: input.inicio,
          periodEnd: input.fim,
          contextNotes: input.notas ?? null,
          dataSnapshot,
          narrative: JSON.stringify(relatorio),
          modulesJson: input.modulos,
          fontesJson: fontes,
          markdown,
          generatedByUserId: ctx.user.id,
        });

        return { publicToken, relatorio, fontes, markdown };
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

    /**
     * Dispara o relatório diário por email.
     *
     * Era `publicProcedure`: qualquer pessoa na internet, sem login, disparava
     * email para cinco colaboradores. Agora exige admin — o cron chama a função
     * interna direto, não passa por aqui.
     */
    sendDailyReport: adminProcedure.query(async () => {
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
        const envio = await sendEmail({
          to: DAILY_REPORT_RECIPIENTS,
          subject: data.subject,
          html: data.html,
          text: data.plainText,
        });
        return { success: envio.ok, erro: envio.erro, dryRun: envio.dryRun, redirecionado: envio.redirecionado,
          subject: data.subject, recipients: DAILY_REPORT_RECIPIENTS, entregas: envio.entregas,
          accountCount: data.accountCount, accountsWithData: data.accountsWithData };
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
    sendDailyProgress: adminProcedure.query(async () => {
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
        const envio = await sendEmail({
          to: DAILY_REPORT_RECIPIENTS,
          subject: data.subject,
          html: data.html,
          text: data.plainText,
        });
        return { success: envio.ok, erro: envio.erro, dryRun: envio.dryRun, redirecionado: envio.redirecionado,
          subject: data.subject, recipients: DAILY_REPORT_RECIPIENTS, entregas: envio.entregas,
          commitCount: data.commitCount };
      } catch (err: any) {
        return { success: false, error: err.message ?? String(err) };
      }
    }),
  }),
  /**
   * Fontes de dados por cliente — o que está conectado, lido do BANCO.
   *
   * Os chips liam um arquivo hardcoded no frontend: "Meta Ads" era verde fixo
   * (mesmo em conta sem sincronizar há sete semanas) e Google Ads estava
   * apagado para todos (mesmo com quatro contas vinculadas de verdade).
   */
  fontes: router({
    /** Do cliente selecionado. */
    doCliente: protectedProcedure
      .input(z.object({ accountId: z.number() }))
      .query(({ input }) => fontesDoCliente(input.accountId)),

    /** De todos — o seletor de clientes desenha chips de uma vez só. */
    todas: protectedProcedure.query(() => fontesDeTodasAsContas()),
  }),

  // ─── Google Ads ──────────────────────────────────────────────────────────
  googleAds: router({
    // Check if Google Ads is configured
    /**
     * Configurado = credenciais do APP presentes. Devolve também o que falta
     * (para a tela dizer exatamente qual env preencher) e se o usuário já
     * conectou o OAuth do Google Ads. O refresh token NÃO é mais requisito.
     */
    isConfigured: protectedProcedure.query(async ({ ctx }) => {
      const oauth = await getConexaoGoogleAdsAgencia();
      return {
        configured: isGoogleAdsConfigured(),
        faltando: googleAdsEnvFaltando(),
        oauthConectado: !!(oauth?.active && oauth.refreshTokenEncrypted),
        contaConectada: oauth?.providerAccountEmail ?? null,
        // A UI esconde conectar/descobrir/vincular de quem não pode. O backend
        // recusa de qualquer forma — isto é só para não oferecer o que não vale.
        podeGerenciar: podeConectarGoogleAds(ctx.user.role),
      };
    }),

    /**
     * GESTÃO: todas as contas descobertas no MCC, com o vínculo. Só admin/dev —
     * o MCC tem ~23 contas (muitas velhas) para ~10 clientes ativos, e essa
     * lista crua não é para usuário comum.
     */
    contasParaGerenciar: protectedProcedure.query(async ({ ctx }) => {
      if (!podeConectarGoogleAds(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN", message: MSG_SEM_PERMISSAO_GADS });
      return listarTodasContasGoogle();
    }),

    /**
     * A conta Google DO CLIENTE selecionado — é o que usuário comum enxerga.
     * Sem vínculo devolve null, e a tela diz "ainda não vinculado" em vez de
     * mostrar conta de outro cliente.
     */
    /**
     * A conta vinculada a este cliente — SEM o refresh token.
     *
     * `contaGoogleDoCliente` faz select de tudo, e devolver a linha inteira
     * mandava a credencial para o navegador. Nenhuma tela precisa dela: as duas
     * consumidoras usam só id, customerId e accountName.
     */
    contaDoCliente: protectedProcedure
      .input(z.object({ accountId: z.number().int() }))
      .query(async ({ input }) => {
        const c = await contaGoogleDoCliente(input.accountId);
        if (!c) return null;
        return {
          id: c.id, customerId: c.customerId, accountName: c.accountName,
          linkedAccountId: c.linkedAccountId, lastSyncAt: c.lastSyncAt,
        };
      }),

    /** Vincula/desvincula uma conta Google a um cliente do Tracker. Admin/dev. */
    vincularConta: protectedProcedure
      .input(z.object({ id: z.number().int(), linkedAccountId: z.number().int().nullable() }))
      .mutation(async ({ ctx, input }) => {
        if (!podeConectarGoogleAds(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN", message: MSG_SEM_PERMISSAO_GADS });
        // Gerenciadora não tem métricas próprias: vinculá-la a um cliente faz a
        // tela pedir métricas do MCC e receber REQUESTED_METRICS_FOR_MANAGER.
        // Recusar aqui é mais barato que descobrir depois pelo erro da API.
        if (input.linkedAccountId != null) {
          const conta = await getGoogleAdAccountById(input.id);
          const mcc = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID?.replace(/-/g, "");
          if (conta && mcc && conta.customerId.replace(/-/g, "") === mcc) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Esta é a conta gerenciadora (MCC) e não tem métricas próprias. Vincule uma conta de anúncios real.",
            });
          }
        }
        await vincularContaGoogle(input.id, input.linkedAccountId);
        return { success: true } as const;
      }),

    /**
     * Diagnóstico da consulta de campanhas — admin/dev. Roda a MESMA query da
     * tela e devolve o que aconteceu: customerId, loginCustomerId, período,
     * query, linhas, status HTTP, erro e requestId.
     *
     * Existe porque erro da API e "sem campanhas" eram indistinguíveis: a
     * query falhava e a tela dizia "nenhuma campanha encontrada".
     */
    diagnosticoCampanhas: protectedProcedure
      .input(z.object({ accountId: z.number().int(), days: z.number().min(1).max(90).default(7) }))
      .query(async ({ ctx, input }) => {
        if (!podeConectarGoogleAds(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN", message: MSG_SEM_PERMISSAO_GADS });
        const conta = await getGoogleAdAccountById(input.accountId);
        if (!conta) throw new TRPCError({ code: "NOT_FOUND", message: "Conta Google Ads não encontrada." });
        const config = getGoogleAdsConfig();
        if (!config) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Google Ads não configurado." });

        // Período no FUSO DA CONTA quando conhecido: o Google Ads reporta no
        // fuso dela, e calcular em São Paulo pode pedir um dia a mais/menos.
        const { startDate, endDate } = getDateRange(input.days);
        const d = await diagnosticarCampanhas(
          { ...config, refreshToken: tokenDaConta(conta.refreshToken) },
          conta.customerId, startDate, endDate,
        );
        return {
          ...d,
          contaNome: conta.accountName,
          fusoDaConta: conta.timezone ?? null,
          clienteVinculado: conta.linkedAccountId,
        };
      }),

    /** Marca conta velha como ignorada (some da gestão, sem apagar). Admin/dev. */
    ignorarConta: protectedProcedure
      .input(z.object({ id: z.number().int(), ignored: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        if (!podeConectarGoogleAds(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN", message: MSG_SEM_PERMISSAO_GADS });
        await ignorarContaGoogle(input.id, input.ignored);
        return { success: true } as const;
      }),

    // Compat: lista as contas do usuário (usada por telas antigas).
    accounts: protectedProcedure.query(async ({ ctx }) => {
      return getGoogleAdAccountsByUserId(ctx.user.id);
    }),

    /**
     * Desconecta o OAuth: apaga o token do MCC. As contas já conectadas seguem
     * com o token próprio (cada uma guarda o seu), mas novas conexões exigem
     * reconectar. Admin/developer.
     */
    desconectarOAuth: protectedProcedure.mutation(async ({ ctx }) => {
      if (!podeConectarGoogleAds(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN", message: MSG_SEM_PERMISSAO_GADS });
      await deactivateUserIntegration(ctx.user.id, "google_ads");
      return { success: true } as const;
    }),

    /**
     * Descobre as contas acessíveis pelo login conectado (listAccessibleCustomers)
     * e cria/atualiza um registro por conta, cada um com o refresh token
     * criptografado. Precisa do developer token — se ele faltar, explica.
     */
    descobrirContas: protectedProcedure.mutation(async ({ ctx }) => {
      if (!podeConectarGoogleAds(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN", message: MSG_SEM_PERMISSAO_GADS });
      const oauth = await getConexaoGoogleAdsAgencia();
      if (!oauth?.refreshTokenEncrypted) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Conecte o Google Ads primeiro." });
      const refreshToken = decryptSecret(oauth.refreshTokenEncrypted);

      let contas: Awaited<ReturnType<typeof listarContasDoMcc>>;
      try {
        // listarContasDoMcc (não listarContasAcessiveis): traz o NOME real da
        // conta. O endpoint de IDs só devolve números, e as contas apareciam
        // como "Google Ads 8184107035" em vez de "Play by Scaffold".
        contas = await listarContasDoMcc(refreshToken);
      } catch (e) {
        // A mensagem do service já diz a causa certa (versão da API, token
        // ausente, acesso recusado) — repassar cegamente "confira o token"
        // mandava procurar no lugar errado.
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: `Não consegui listar as contas: ${(e as Error).message}` });
      }
      if (contas.length === 0) return { criadas: 0, renomeadas: 0, contas: [] as string[] };

      // Guarda o token criptografado em CADA conta — o read path decripta.
      const tokenCripto = encryptSecret(refreshToken);
      // Dedup por customerId GLOBAL, não por usuário: a conta do MCC é a mesma
      // independentemente de qual admin rodou a descoberta — senão cada admin
      // criaria uma cópia da mesma conta.
      const jaExistem = await listarTodasContasGoogle();
      const porCustomerId = new Map(jaExistem.map((a) => [a.customerId, a]));
      let criadas = 0, renomeadas = 0;

      for (const c of contas) {
        const existente = porCustomerId.get(c.customerId);

        // Fallback: quando a listagem do MCC não traz descriptive_name (conta
        // sob sub-gerenciadora, ou permissão que não expõe o nome na listagem),
        // pergunta à PRÓPRIA conta. Só assim para de aparecer "Google Ads <id>".
        let nomeReal = c.nome;
        let moeda = c.moeda;
        let fuso = c.fusoHorario;
        if (!nomeReal) {
          const proprio = await nomeDaConta(refreshToken, c.customerId);
          nomeReal = proprio.nome;
          moeda = moeda ?? proprio.moeda;
          fuso = fuso ?? proprio.fusoHorario;
        }
        const nome = nomeReal ?? `Google Ads ${c.customerId}`;

        if (existente) {
          // Já descoberta antes (com nome genérico): atualiza o nome real sem
          // tocar no vínculo nem no "ignorada" que o admin já configurou.
          if (nomeReal && existente.accountName !== nomeReal) {
            await renomearContaGoogle(existente.id, nomeReal);
            renomeadas++;
          }
          continue;
        }
        await createGoogleAdAccount({
          userId: ctx.user.id,
          customerId: c.customerId,
          accountName: nome,
          refreshToken: tokenCripto,
          currency: moeda ?? undefined,
          timezone: fuso ?? undefined,
        });
        criadas++;
      }
      return { criadas, renomeadas, contas: contas.map((c) => c.customerId) };
    }),

    // Conecta uma conta manualmente por customerId (usa o token OAuth salvo).
    connectAccount: protectedProcedure
      .input(z.object({
        customerId: z.string().min(3),
        accountName: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!podeConectarGoogleAds(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN", message: MSG_SEM_PERMISSAO_GADS });
        if (!isGoogleAdsConfigured()) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Google Ads não configurado (faltam credenciais do app)." });
        const oauth = await getConexaoGoogleAdsAgencia();
        if (!oauth?.refreshTokenEncrypted) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Conecte o Google Ads primeiro (OAuth)." });

        // O token da conta é o mesmo do OAuth, guardado criptografado por conta.
        const id = await createGoogleAdAccount({
          userId: ctx.user.id,
          customerId: input.customerId.replace(/-/g, ""),
          accountName: input.accountName ?? `Google Ads ${input.customerId}`,
          refreshToken: oauth.refreshTokenEncrypted, // já criptografado
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
        const accountConfig = { ...config, refreshToken: tokenDaConta(account.refreshToken) };
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
        const accountConfig = { ...config, refreshToken: tokenDaConta(account.refreshToken) };
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
        const accountConfig = { ...config, refreshToken: tokenDaConta(account.refreshToken) };
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
        const accountConfig = { ...config, refreshToken: tokenDaConta(account.refreshToken) };
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
            // tokenDaConta: os tokens agora são criptografados — usar o valor
            // cru aqui fazia o diagnose falhar em toda conta.
            const accountConfig = { ...config, refreshToken: tokenDaConta(acct.refreshToken) };
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
  /**
   * ─── GA4 Analytics ───────────────────────────────────────────────────────
   *
   * Reescrito na F4 por três falhas de segurança, todas encontradas antes de
   * qualquer propriedade ser conectada:
   *
   *  1. `isConfigured` era publicProcedure — respondia sem login.
   *  2. As leituras recebiam o id da linha de ga4_accounts e só conferiam
   *     EXISTÊNCIA, nunca dono. Enquanto `accounts` listava por usuário, um
   *     inteiro chutado abria a propriedade de qualquer outro.
   *  3. `properties` recebia o refresh token COMO INPUT — o segredo trafegava
   *     do navegador para o servidor a cada chamada.
   *
   * O desenho novo elimina a classe do problema em vez de remendar: a leitura
   * é sempre por CLIENTE (meta_ad_accounts.id) e a conexão é resolvida no
   * servidor. Não existe id de conexão para chutar, e o token nunca sai do
   * banco — nem para o cliente, nem de volta.
   *
   * Gestão (conectar, vincular, desconectar) é admin/dev. Leitura segue o
   * mesmo nível do resto dos dados de cliente no Tracker.
   */
  ga4: router({
    isConfigured: protectedProcedure.query(() => ({ configured: isGA4Configured() })),

    /** Resumo do último ciclo automático — o cabeçalho da /ga4 mostra sem log. */
    ultimoCiclo: protectedProcedure.query(() =>
      getAppSetting<{ em: string; total: number; ok: number; semDados: number; falhas: number }>("ga4:ultimoCiclo")),

    /** Estado da conexão da agência — espelha googleAds.isConfigured. */
    statusConexao: protectedProcedure.query(async ({ ctx }) => {
      const conexao = await getConexaoGA4Agencia();
      const contas = canManageContent(ctx.user.role) ? await listarTodasContasGA4() : [];
      return {
        configured: isGA4Configured(),
        faltando: isGA4Configured() ? [] : ["GOOGLE_ADS_CLIENT_ID", "GOOGLE_ADS_CLIENT_SECRET"].filter((v) => !process.env[v]),
        oauthConectado: !!conexao,
        conectadoComo: conexao?.providerAccountEmail ?? null,
        propriedades: contas.length,
        vinculadas: contas.filter((c) => c.linkedAccountId != null).length,
        podeGerenciar: canManageContent(ctx.user.role),
      };
    }),

    /**
     * Descobre as propriedades da conexão da agência e grava as novas SEM
     * vínculo. Redescobrir atualiza nome/URL e preserva o vínculo existente.
     */
    descobrirPropriedades: contentProcedure.mutation(async ({ ctx }) => {
      const conexao = await getConexaoGA4Agencia();
      if (!conexao?.refreshTokenEncrypted) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Conecte o Google Analytics antes de descobrir propriedades." });
      }
      let token: string;
      try { token = decryptSecret(conexao.refreshTokenEncrypted); }
      catch { throw new TRPCError({ code: "PRECONDITION_FAILED", message: "A credencial guardada não pôde ser lida. Reconecte o Google Analytics." }); }

      const props = await listGA4Properties(getGA4Config(token));
      const r = await gravarPropriedadesGA4(ctx.user.id, conexao.refreshTokenEncrypted, props.map((p) => ({
        propertyId: p.propertyId, propertyName: p.displayName ?? null,
        websiteUrl: p.websiteUrl ?? null, currency: p.currencyCode ?? null, timezone: p.timeZone ?? null,
      })));
      return { ...r, total: props.length };
    }),

    /**
     * Lê as propriedades VINCULADAS pela Data API e grava snapshot. `apenas`
     * restringe a uma propriedade — é como a validação começa, numa só.
     */
    sincronizar: contentProcedure
      .input(z.object({ apenas: z.array(z.number().int()).optional() }).default({}))
      .mutation(({ input }) => sincronizarGA4(input.apenas)),

    /** Desconecta o OAuth da agência. As propriedades e vínculos permanecem. */
    desconectarOAuth: contentProcedure.mutation(async () => {
      const conexao = await getConexaoGA4Agencia();
      if (conexao) await deactivateUserIntegration(conexao.userId, "ga4");
      return { success: true } as const;
    }),

    /** Conexões e seus vínculos — tela de gestão. */
    contasParaGerenciar: contentProcedure.query(() => listarTodasContasGA4()),

    /** Vincula (ou desvincula, com null) uma propriedade a um cliente. */
    vincularConta: contentProcedure
      .input(z.object({ id: z.number(), linkedAccountId: z.number().nullable() }))
      .mutation(async ({ input }) => {
        await vincularGA4(input.id, input.linkedAccountId);
        return { success: true } as const;
      }),

    /** A conexão do cliente selecionado — sem token, nunca. */
    contaDoCliente: protectedProcedure
      .input(z.object({ accountId: z.number() }))
      .query(async ({ input }) => {
        const c = await ga4DoCliente(input.accountId);
        if (!c) return null;
        return { id: c.id, propertyId: c.propertyId, propertyName: c.propertyName, websiteUrl: c.websiteUrl, lastSyncAt: c.lastSyncAt };
      }),

    connectAccount: contentProcedure
      .input(z.object({
        propertyId: z.string().min(1),
        propertyName: z.string().optional(),
        websiteUrl: z.string().optional(),
        refreshToken: z.string().min(1),
        linkedAccountId: z.number().nullable().optional(),
        currency: z.string().optional(),
        timezone: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // O token é criptografado dentro de createGA4Account e nunca volta.
        const id = await createGA4Account({
          userId: ctx.user.id,
          propertyId: input.propertyId,
          propertyName: input.propertyName ?? null,
          websiteUrl: input.websiteUrl ?? null,
          refreshToken: input.refreshToken,
          linkedAccountId: input.linkedAccountId ?? null,
          currency: input.currency ?? "BRL",
          timezone: input.timezone ?? "America/Sao_Paulo",
        });
        return { success: true, id };
      }),

    disconnectAccount: contentProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteGA4Account(input.id);
        return { success: true } as const;
      }),

    /**
     * Lista as propriedades de um refresh token. Continua recebendo o token
     * porque o OAuth próprio do GA4 ainda não existe (o callback com
     * `state=ga4` só exibe o token numa textarea). Restrito a admin/dev até
     * lá — quando o OAuth entrar, o parâmetro sai.
     */
    properties: contentProcedure
      .input(z.object({ refreshToken: z.string().min(1) }))
      .query(({ input }) => listGA4Properties(getGA4Config(input.refreshToken))),

    /** Métricas do cliente. Devolve null quando não há GA4 vinculado. */
    dados: protectedProcedure
      .input(z.object({
        accountId: z.number(),
        bloco: z.enum(["overview", "daily", "sources", "pages", "devices", "geo", "conversions"]),
        days: z.number().min(1).max(365).default(30),
        limit: z.number().min(1).max(50).default(10),
      }))
      .query(async ({ input }) => {
        const acct = await ga4DoCliente(input.accountId);
        if (!acct) return null;                       // sem GA4 = sem card, não erro
        const token = tokenDaContaGA4(acct);
        if (!token) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Conexão do GA4 sem credencial utilizável. Reconecte a propriedade." });

        const config = getGA4Config(token);
        // Datas no fuso da agência — nunca toISOString sobre "agora".
        const dia = (d: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(Date.now() - d * 86400000));
        const inicio = dia(input.days), fim = dia(0);

        const r = await (async () => {
          switch (input.bloco) {
            case "overview": return getGA4Overview(config, acct.propertyId, inicio, fim);
            case "daily": return getGA4DailyMetrics(config, acct.propertyId, inicio, fim);
            case "sources": return getGA4TrafficSources(config, acct.propertyId, inicio, fim, input.limit);
            case "pages": return getGA4TopPages(config, acct.propertyId, inicio, fim, input.limit);
            case "devices": return getGA4DeviceBreakdown(config, acct.propertyId, inicio, fim);
            case "geo": return getGA4GeoBreakdown(config, acct.propertyId, inicio, fim, input.limit);
            case "conversions": return getGA4Conversions(config, acct.propertyId, inicio, fim);
          }
        })();
        await updateGA4AccountSync(acct.id);
        return r;
      }),

    /** Diagnóstico das conexões — admin/dev. */
    diagnose: contentProcedure.query(async () => {
      const contas = await listarTodasContasGA4();
      const saida: unknown[] = [];
      for (const acct of contas) {
        const base = { id: acct.id, propertyId: acct.propertyId, name: acct.propertyName, vinculadaA: acct.linkedAccountId };
        const token = tokenDaContaGA4(acct);
        if (!token) { saida.push({ ...base, status: "ERROR", error: "Sem credencial utilizável." }); continue; }
        try {
          const dia = (d: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(Date.now() - d * 86400000));
          const o = await getGA4Overview(getGA4Config(token), acct.propertyId, dia(7), dia(0));
          saida.push({ ...base, status: "OK", sessions: o.sessions, users: o.totalUsers });
        } catch (err) {
          saida.push({ ...base, status: "ERROR", error: (err as Error)?.message ?? String(err) });
        }
      }
      return saida;
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
  finance: financeRouter,
  context: contextRouter,
});
export type AppRouter = typeof appRouter;

