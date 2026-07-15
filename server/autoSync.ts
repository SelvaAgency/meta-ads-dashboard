import { logger } from "./logger";
import { runFinanceAtrasos, runBriefingDiario, runRelatorioSemanal, runAnomaliasNotif, runTrelloPrazos, runAniversarios, runDigestDiario, criarAlertaDeConta, type AnomaliaNotif } from "./notificationJobs";
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
import { notifyOwner } from "./_core/notification";
import {
  getAllActiveMetaAdAccounts,
  getCampaignsByAccountId,
  updateMetaAdAccountSync,
  updateAccountAiStatus,
  upsertCampaign,
  upsertCampaignMetrics,
  getAccountMetricsSummary,
  getCampaignPerformanceSummary,
  createAnomalyIfNotExists,
  createAlert,
  createAlertIfNotExists,
  getAccountThresholds,
  getActiveCampaignMetaIdsWithRecentSpend,
  getExperimentBasicInfo,
  purgeDuplicateAlerts,
  purgeDuplicateAnomalies,
  markAnomalyEmailSent,
  markAlertEmailSent,
  getMetaAdAccountsByUserId,
  getMetaAdAccountById,
  getDueScheduledReports,
  updateScheduledReport,
  purgeOldReadAnomalies,
  getPendingCheckpointsForDate,
  getExperimentCampaignMetrics,
  markCheckpointDone,
  markSyncErrorAlertsRead,
  getPendingOutcomeClosures,
  updateActionOutcome,
  appendAccountLearning,
  getAccountContext,
} from "./db";
import { invokeLLM, extractTextContent } from "./_core/llm";
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
  extractMessages,
  extractLinkClicks,
  extractAddToCart,
  extractLandingPageViews,
  calculateCpa,
  getResultLabel,
  checkRealTimeAlerts,
  validateToken,
} from "./metaAdsService";
import { detectAnomalies, generateAgencyReport } from "./analysisService";
import type { CampaignReportData } from "./analysisService";

const SYNC_DAYS = 30; // Always sync 30 days to ensure complete data for all dashboard filters

function toIsoLocal(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getDateRange(days: number) {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - (days - 1));
  return {
    startDate: toIsoLocal(start),
    endDate: toIsoLocal(end), // hoje inclusive
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

export async function syncAccount(account: { id: number; accountId: string; accessToken: string; accountName: string | null; userId: number }, opts: { isManual?: boolean } = {}) {
  const { startDate, endDate } = getDateRange(SYNC_DAYS);
  const label = account.accountName ?? account.accountId;
  logger.info(`[AutoSync] Syncing account "${label}" (${account.accountId}) — ${startDate} to ${endDate}`);

  try {
    // Validate token before any API call
    const tokenValid = await validateToken(account.accessToken);
    if (!tokenValid) {
      console.error(`[AutoSync] ✗ Token expirado para conta "${label}" (${account.accountId}). Criando alerta SYNC_ERROR.`);
      await criarAlertaDeConta({
        accountId: account.id, accountName: label, alertType: "SYNC_ERROR", severity: "CRITICAL",
        title: `Token expirado: ${label}`,
        message: `O token de acesso da conta "${label}" expirou ou foi invalidado. Reconecte a conta em Gerenciar Contas para restaurar a sincronização automática.`,
        referencia: `${account.id}:token`,
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
    logger.info(`[AutoSync] About to fetch insights for account ${account.accountId} (${startDate} to ${endDate})`);
    const insights = await getCampaignInsights(account.accountId, account.accessToken, startDate, endDate);
    logger.info(`[AutoSync] Received ${insights.length} insight rows for account ${account.accountId}`);
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
      if (conversions === 0 && spend > 0) {
        logger.info(`[SYNC_GOAL] account=${account.accountId} campaign=${insight.campaign_id} goal="${optimizationGoal}" conversions=0 actions=${JSON.stringify((insight.actions ?? []).map(a => a.action_type))}`);
      }
      const conversionValue = extractConversionValue(insight.action_values);
      const roas = extractPurchaseRoas(insight.purchase_roas, spend, conversionValue);
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
    // Mark SYNC_ERROR alerts as read when sync succeeds
    try {
      await markSyncErrorAlertsRead(account.userId, account.id);
    } catch (_) { /* non-blocking */ }

    // Notificacao informativa de sync concluido.
    // Cron automatico: titulo so com data, garante dedup (1x/dia por conta) via createAlertIfNotExists.
    // Sync manual: titulo com data+hora, sempre cria nova notificacao para dar feedback imediato ao usuario.
    try {
      const now = new Date();
      const todayStr = now.toISOString().split("T")[0];
      const title = opts.isManual
        ? `Sincronização concluída — ${todayStr} ${now.toTimeString().slice(0, 5)}`
        : `Sincronização concluída — ${todayStr}`;
      await createAlertIfNotExists({
        userId: account.userId,
        accountId: account.id,
        type: "SYNC_COMPLETE" as any,
        severity: "INFO" as any,
        title,
        message: `${label}: ${metaCampaigns.length} campanhas e ${insights.length} registros de métricas sincronizados com sucesso.`,
      });
    } catch (_) { /* non-blocking */ }

    logger.info(`[AutoSync] ✓ Account "${label}" synced — ${metaCampaigns.length} campaigns, ${insights.length} insight rows`);

    // Refresh AI status summary (non-blocking — failure must not abort sync)
    try {
      const { startDate: s7, endDate: e7 } = getDateRange(7);
      const metrics7 = await getAccountMetricsSummary(account.id, s7, e7);
      const t = metrics7.reduce(
        (acc, m) => ({
          spend: acc.spend + Number(m.totalSpend ?? 0),
          conversions: acc.conversions + Number(m.totalConversions ?? 0),
          conversionValue: acc.conversionValue + Number(m.totalConversionValue ?? 0),
          impressions: acc.impressions + Number(m.totalImpressions ?? 0),
          clicks: acc.clicks + Number(m.totalClicks ?? 0),
        }),
        { spend: 0, conversions: 0, conversionValue: 0, impressions: 0, clicks: 0 }
      );
      const roas = t.spend > 0 ? (t.conversionValue / t.spend).toFixed(2) : "0";
      const cpa  = t.conversions > 0 ? (t.spend / t.conversions).toFixed(2) : "0";
      const ctr  = t.impressions > 0 ? ((t.clicks / t.impressions) * 100).toFixed(2) : "0";

      const aiResult = await invokeLLM({
        messages: [{
          role: "user",
          content: `Analise os dados de performance dos últimos 7 dias e retorne um JSON com dois campos: "color" (green/yellow/red) e "summary" (máx 300 caracteres em português, sem emoji). O summary deve conter: (1) status geral da conta, (2) principal métrica positiva ou problemática com valor, (3) uma ação sugerida objetiva. Verde = conta saudável, Amarelo = atenção necessária, Vermelho = problema crítico.\n\nDados:\n${JSON.stringify({ ...t, roas, cpa, ctr })}`,
        }],
        responseFormat: { type: "json_object" },
        thinking: false,
      });

      let color: "green" | "yellow" | "red" = "yellow";
      let summary = "Análise pendente";
      try {
        const parsed = JSON.parse(extractTextContent(aiResult));
        if (["green", "yellow", "red"].includes(parsed.color)) color = parsed.color;
        if (typeof parsed.summary === "string") summary = parsed.summary.slice(0, 300);
      } catch { /* keep defaults */ }

      await updateAccountAiStatus(account.id, color, summary);
      logger.info(`[AutoSync] ✓ AI status refreshed for "${label}": ${color}`);
      // Throttle AI calls — 2s gap between accounts to avoid Claude rate limit (429)
      await new Promise((r) => setTimeout(r, 2000));
    } catch (aiErr) {
      console.warn(`[AutoSync] AI status refresh failed for "${label}":`, aiErr);
    }
  } catch (err: any) {
    const errMsg = err?.message ?? String(err);
    const metaCodeMatch = errMsg.match(/Meta API Error \((\d+)\)/);
    const metaCode = metaCodeMatch ? metaCodeMatch[1] : null;
    console.error(`[AutoSync] ✗ Failed to sync account "${label}" (Meta error code: ${metaCode ?? 'N/A'}):`, errMsg);

    // If token expired or permission denied, create SYNC_ERROR alert
    if (errMsg.includes('META_TOKEN_EXPIRED') || metaCode === '190') {
      try {
        await criarAlertaDeConta({
          accountId: account.id, accountName: label, alertType: "SYNC_ERROR", severity: "CRITICAL",
          title: `Token expirado: ${label}`,
          message: `Sincronização falhou por token expirado. Reconecte a conta em Gerenciar Contas.`,
          referencia: `${account.id}:token`,
        });
      } catch (_) { /* ignore alert creation errors */ }
    } else if (metaCode === '200' || errMsg.includes('ads_management') || errMsg.includes('ads_read')) {
      try {
        await criarAlertaDeConta({
          accountId: account.id, accountName: label, alertType: "SYNC_ERROR", severity: "CRITICAL",
          title: `Permissão negada: ${label}`,
          message: `A conta "${label}" não concedeu permissão ads_management/ads_read. O dono da conta precisa autorizar o acesso via Facebook Business.`,
          referencia: `${account.id}:permissao`,
        });
      } catch (_) { /* ignore alert creation errors */ }
    } else {
      try {
        await criarAlertaDeConta({
          accountId: account.id, accountName: label, alertType: "SYNC_ERROR", severity: "CRITICAL",
          title: `Sync falhou: ${label}`,
          message: `Erro ao sincronizar: ${errMsg.substring(0, 200)}`,
          referencia: `${account.id}:sync`,
        });
      } catch (_) { /* ignore alert creation errors */ }
    }
  }
}

export async function syncAllAccounts() {
  return runAutoSync();
}

async function runAutoSync() {
  logger.info("[AutoSync] Starting daily auto-sync for all accounts...");

  // Financeiro v4: gera (idempotente) as linhas recorrentes pendentes do mês
  // corrente. No-op se já geradas. Nunca gera mês passado. Falha aqui não
  // interrompe o sync de Meta Ads.
  try {
    const { gerarMesRecorrente } = await import("./db");
    const mesCorrente = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).format(new Date());
    const res = await gerarMesRecorrente(mesCorrente);
    if (res.criadas > 0) logger.info(`[AutoSync] Financeiro: ${res.criadas} recorrentes geradas para ${res.mes}.`);
  } catch (e) {
    logger.warn(`[AutoSync] Financeiro: geração recorrente falhou (ignorado): ${String(e)}`);
  }

  const accounts = await getAllActiveMetaAdAccounts();
  if (accounts.length === 0) {
    logger.info("[AutoSync] No accounts found, skipping.");
    return;
  }
  // Sync accounts sequentially to avoid rate limits
  for (const account of accounts) {
    await syncAccount(account);
    // Small delay between accounts to respect Meta API rate limits
    await new Promise((r) => setTimeout(r, 15000));
  }
  logger.info(`[AutoSync] Daily sync complete — ${accounts.length} account(s) processed.`);
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

/**
 * Anomalias de mídia (Ajustes: notificações). Antes, detectAnomalies só rodava
 * quando alguém apertava o botão no front — o caminho automático nunca a usava.
 * Aqui ela roda no ciclo diário, com as três janelas calculadas de verdade
 * (7/14/30): a validação multi-período do detector exige 2 de 3 confirmando, e
 * passar a mesma média nas três (como faz o caller do front) desliga esse filtro.
 */
async function runAnomaliasDeMidia() {
  const accounts = await getAllActiveMetaAdAccounts();
  if (accounts.length === 0) return;
  const dia = (d: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(Date.now() - d * 86400000));
  const hoje = dia(0), ontem = dia(1);
  const achadas: AnomaliaNotif[] = [];

  for (const account of accounts) {
    try {
      const janela = async (dias: number) => {
        const rows = await getAccountMetricsSummary(account.id, dia(dias), ontem);
        if (rows.length === 0) return null;
        const n = rows.length;
        const somaR = rows.reduce((a, m) => ({
          roas: a.roas + Number(m.avgRoas ?? 0), cpa: a.cpa + Number(m.avgCpa ?? 0), ctr: a.ctr + Number(m.avgCtr ?? 0),
          spend: a.spend + Number(m.totalSpend ?? 0), impressions: a.impressions + Number(m.totalImpressions ?? 0),
          conversions: a.conversions + Number(m.totalConversions ?? 0),
        }), { roas: 0, cpa: 0, ctr: 0, spend: 0, impressions: 0, conversions: 0 });
        return { roas: somaR.roas / n, cpa: somaR.cpa / n, ctr: somaR.ctr / n, spend: somaR.spend / n, impressions: somaR.impressions / n, conversions: somaR.conversions / n };
      };
      const atualRows = await getAccountMetricsSummary(account.id, ontem, hoje);
      if (atualRows.length === 0) continue;
      const r = atualRows[atualRows.length - 1];
      const atual = {
        roas: Number(r.avgRoas ?? 0), cpa: Number(r.avgCpa ?? 0), ctr: Number(r.avgCtr ?? 0),
        spend: Number(r.totalSpend ?? 0), impressions: Number(r.totalImpressions ?? 0), conversions: Number(r.totalConversions ?? 0), frequency: 0,
      };
      const [a7, a14, a30] = await Promise.all([janela(7), janela(14), janela(30)]);
      if (!a7 || !a14 || !a30) continue;
      // Menos de 30 dias de série = thresholds dobrados no detector.
      const hist = await getAccountMetricsSummary(account.id, dia(30), hoje);
      const anomalias = detectAnomalies(atual, a7, a14, a30, { hasLimitedHistory: hist.length < 14 });
      for (const an of anomalias) {
        achadas.push({
          accountId: account.id, accountName: account.accountName ?? account.accountId,
          type: an.type, severity: an.severity, title: an.title, description: an.description,
        });
      }
    } catch (err) {
      logger.error(`[Anomalias] Falha na conta ${account.accountId}: ${(err as Error)?.message}`);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  if (achadas.length > 0) await runAnomaliasNotif(achadas);
  logger.info(`[Anomalias] Ciclo completo — ${achadas.length} anomalia(s) em ${accounts.length} conta(s).`);
}

/**
 * Notificações do dia: financeiro (atrasos) + briefing + semanal (segunda).
 * Idempotente por dedup — reexecutar não duplica.
 */
async function runNotificacoesDiarias() {
  // Cada gatilho é isolado: um falhando não derruba os outros nem o digest.
  const passo = async (nome: string, fn: () => Promise<unknown>) => {
    try { await fn(); } catch (err) { logger.error(`[Notif] ${nome} falhou: ${(err as Error)?.message}`); }
  };
  await passo("Financeiro", runFinanceAtrasos);
  await passo("Trello", runTrelloPrazos);
  await passo("Aniversários", runAniversarios);
  await passo("Briefing", () => runBriefingDiario(async () => null));
  await passo("Semanal", async () => {
    const hoje = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", weekday: "short" }).format(new Date());
    if (hoje === "Mon") await runRelatorioSemanalDeContas();
  });
  // Por último: o digest junta tudo que os gatilhos acabaram de criar.
  await passo("Digest", runDigestDiario);
}

/** Relatório semanal consolidado por conta — com métricas reais (não zeros). */
async function runRelatorioSemanalDeContas() {
  const accounts = await getAllActiveMetaAdAccounts();
  if (accounts.length === 0) return;
  const fmt = (d: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(Date.now() - d * 86400000));
  const inicio = fmt(7), fim = fmt(0);
  const blocos: string[] = [];
  for (const account of accounts) {
    // Métricas REAIS (getCampaignPerformanceSummary) — o cron antigo montava
    // CampaignReportData com spend/impressions/conversions zerados e mandava
    // isso pro LLM, gerando relatório agendado falso.
    const dados = await getCampaignPerformanceSummary(account.id, inicio, fim).catch(() => []);
    if (dados.length === 0) continue;
    const campaigns: CampaignReportData[] = dados.map((c) => ({
      campaignId: c.campaignId, campaignName: c.campaignName ?? "Campanha",
      campaignObjective: c.campaignObjective ?? "OUTCOME_SALES", campaignStatus: c.campaignStatus ?? "ACTIVE",
      totalSpend: Number(c.totalSpend ?? 0), totalImpressions: Number(c.totalImpressions ?? 0),
      totalClicks: Number(c.totalClicks ?? 0), totalConversions: Number(c.totalConversions ?? 0),
      totalConversionValue: Number(c.totalConversionValue ?? 0), totalReach: Number(c.totalReach ?? 0),
      avgRoas: Number(c.avgRoas ?? 0), avgCpa: Number(c.avgCpa ?? 0), avgCtr: Number(c.avgCtr ?? 0),
      avgCpc: Number(c.avgCpc ?? 0), avgCpm: Number(c.avgCpm ?? 0), avgFrequency: Number(c.avgFrequency ?? 0),
    }));
    const txt = await generateAgencyReport(account.accountName ?? account.accountId, "WEEKLY", campaigns, inicio, fim).catch(() => "");
    if (txt) blocos.push(txt);
  }
  if (blocos.length > 0) await runRelatorioSemanal(blocos.join("\n\n———\n\n"));
}

async function runAnomalyDetection() {
  logger.info("[TechnicalAlerts] Running hourly technical alerts check...");
  const accounts = await getAllActiveMetaAdAccounts();
  if (accounts.length === 0) return;

  for (const account of accounts) {
    try {
      await runRealTimeAlerts(account);

    } catch (err) {
      console.error(`[AutoAnomalies] Erro ao detectar anomalias na conta ${account.accountId}:`, err);
    }

    await new Promise((r) => setTimeout(r, 1000));
  }

  logger.info("[AutoAnomalies] Anomaly detection cycle complete.");
}

// ─── Real-time Technical Alerts ───────────────────────────────────────────────

async function runRealTimeAlerts(account: { id: number; accountId: string; accessToken: string; accountName: string | null; userId: number }) {
  try {
    const tokenValid = await validateToken(account.accessToken);
    if (!tokenValid) {
      logger.info(`[RealTimeAlerts] Skipping ${account.accountName ?? account.accountId} - token expirado`);
      return;
    }
    const thresholds = await getAccountThresholds(account.id);
    const lowBalanceThreshold = thresholds?.lowBalanceThreshold ? Number(thresholds.lowBalanceThreshold) : 200;
    const activeCampaignIds = await getActiveCampaignMetaIdsWithRecentSpend(account.id, 3);
    const alerts = await checkRealTimeAlerts(account.accountId, account.accessToken, lowBalanceThreshold, activeCampaignIds);
    const nome = account.accountName ?? account.accountId;
    for (const alert of alerts) {
      // Destinatário sai do resolver central (admins + devs + coordenadores da
      // conta). Antes ia para account.userId — a conta de sistema que conectou o
      // cliente —, então nenhum humano via esses alertas em /alerts.
      const criados = await criarAlertaDeConta({
        accountId: account.id,
        accountName: nome,
        alertType: (alert.type === "BUDGET_WARNING" ? "BUDGET_WARNING" : "SYNC_ERROR"),
        title: `${nome}: ${alert.title}`,
        message: alert.message,
        severity: (alert.severity as "INFO" | "WARNING" | "CRITICAL") ?? "WARNING",
        referencia: `${account.id}:${alert.type}`,
      });
      if (criados.length === 0) continue; // já avisado hoje (dedup) ou sem destinatário

      await notifyOwner({
        title: `⚠️ Alerta técnico: ${alert.title}`,
        content: `Conta: ${nome}\n\n${alert.message}`,
      });
    }
    if (alerts.length > 0) {
      logger.info(`[RealTimeAlerts] ✓ ${alerts.length} alerta(s) técnico(s) para "${account.accountName ?? account.accountId}"`);
    }
  } catch (err) {
    console.error(`[RealTimeAlerts] Erro ao verificar alertas para ${account.accountId}:`, err);
  }
}

// Permite disparo manual (botão "Sincronizar" na aba de Avisos) além da checagem diária automática.
export async function syncAlertsForUser(userId: number) {
  const accounts = await getMetaAdAccountsByUserId(userId);
  for (const account of accounts) {
    await runRealTimeAlerts(account);
  }
}

// Sincronizacao completa manual: dados (campanhas/metricas) + alertas tecnicos,
// para todas as contas do usuario. Usado pelo botao "Sincronizar" da pagina de Alertas,
// que precisa cobrir tanto a aba Critico quanto a aba Notificacoes (sync gera a
// notificacao SYNC_COMPLETE; runRealTimeAlerts gera os alertas criticos).
export async function syncAllForUser(userId: number) {
  const accounts = await getMetaAdAccountsByUserId(userId);
  for (const account of accounts) {
    try {
      await syncAccount(account, { isManual: true });
    } catch (err) {
      console.error(`[ManualSync] Erro ao sincronizar dados da conta ${account.accountId}:`, err);
    }
    try {
      await runRealTimeAlerts(account);
    } catch (err) {
      console.error(`[ManualSync] Erro ao checar alertas da conta ${account.accountId}:`, err);
    }
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
    logger.info(`[ScheduledReports] Running scheduled report for account "${account.accountName ?? account.accountId}"`);
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

      logger.info(`[ScheduledReports] ✓ Report generated for "${account.accountName ?? account.accountId}"`);
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

    logger.info(`[ScheduledReports] ${due.length} report(s) due for generation`);
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

        logger.info(`[ScheduledReports] ✓ Report generated for account ${account.accountId}`);

        // Notificacao informativa de relatorio agendado enviado
        try {
          const todayStr = new Date().toISOString().split("T")[0];
          await createAlertIfNotExists({
            userId: account.userId,
            accountId: account.id,
            type: "REPORT" as any,
            severity: "INFO" as any,
            title: `Relatório ${report.frequency === "WEEKLY" ? "semanal" : "diário"} enviado — ${todayStr}`,
            message: `O relatório agendado de ${account.accountName ?? account.accountId} foi gerado e enviado com sucesso.`,
          });
        } catch (_) { /* non-blocking */ }
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
    // Wait for sync to finish — retry up to 5 min if data is stale
    const maxRetries = 10;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const accounts = await getAllActiveMetaAdAccounts();
        const today = new Date().toISOString().split("T")[0];
        const allSynced = accounts.every(a => {
          const syncDate = (a as any).lastSyncAt;
          return syncDate && new Date(syncDate).toISOString().split("T")[0] === today;
        });
        if (allSynced || attempt === maxRetries) {
          if (!allSynced) {
            console.warn(`[DailyReport] Not all accounts synced today after ${maxRetries} retries — proceeding anyway`);
          }
          break;
        }
        console.log(`[DailyReport] Waiting for sync to finish (attempt ${attempt}/${maxRetries})...`);
        await new Promise(r => setTimeout(r, 30000)); // wait 30s
      } catch { break; } // DB error → proceed anyway
    }

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

// ─── Daily Progress Report (20h BRT = 23h UTC) ────────────────────────────

async function runDailyProgress() {
  console.log("[DailyProgress] Starting daily progress report generation...");
  if (!isEmailConfigured()) {
    console.warn("[DailyProgress] SMTP not configured — skipping.");
    return;
  }
  try {
    const res = await fetch("http://localhost:3000/api/trpc/reports.generateDailyProgress");
    const json = await res.json();
    const data = json?.result?.data?.json ?? json?.result?.data;
    if (!data?.html || !data?.subject) {
      console.error("[DailyProgress] No report data returned:", JSON.stringify(json).slice(0, 500));
      return;
    }
    console.log(`[DailyProgress] Generated report: ${data.commitCount ?? 0} commits, dataSourceFailed=${data.dataSourceFailed ?? false}`);
    const sent = await sendEmail({
      to: DAILY_REPORT_RECIPIENTS,
      subject: data.subject,
      html: data.html,
      text: data.plainText,
    });
    if (sent) {
      console.log(`[DailyProgress] ✓ Progress report sent: ${data.subject} → ${DAILY_REPORT_RECIPIENTS.length} recipients`);
    } else {
      console.error("[DailyProgress] ✗ Failed to send progress report email");
    }
  } catch (err) {
    console.error("[DailyProgress] Error:", err);
  }
}

async function runExperimentCheckpoints() {
  const today = new Date().toISOString().split("T")[0];
  try {
    const pending = await getPendingCheckpointsForDate(today);
    if (pending.length === 0) return;
    for (const cp of pending) {
      try {
        const campaignIds: number[] = Array.isArray(cp.campaignIds) ? cp.campaignIds : [];
        const metrics = campaignIds.length > 0
          ? await getExperimentCampaignMetrics(campaignIds, (cp as any).startDate, today)
          : null;
        const snapshot: Record<string, number> = {};
        if (metrics) {
          if (metrics.totalSpend != null)       snapshot.spend       = Number(metrics.totalSpend);
          if (metrics.totalConversions != null) snapshot.conversions = Number(metrics.totalConversions);
          if (metrics.totalImpressions != null) snapshot.impressions = Number(metrics.totalImpressions);
          if (metrics.totalClicks != null)      snapshot.clicks      = Number(metrics.totalClicks);
          if (metrics.avgCtr != null)           snapshot.ctr         = Number(metrics.avgCtr);
          if (metrics.avgCpa != null)           snapshot.cpa         = Number(metrics.avgCpa);
          if (metrics.avgRoas != null)          snapshot.roas        = Number(metrics.avgRoas);
        }
        await markCheckpointDone(cp.id, snapshot);
        logger.info(`[Experiments] Checkpoint ${cp.id} (${cp.title}) snapshot done`);

        // Notificacao informativa de mudanca de fase do experimento
        try {
          const exp = await getExperimentBasicInfo((cp as any).experimentId);
          if (exp) {
            await createAlertIfNotExists({
              userId: exp.userId,
              accountId: exp.accountId,
              type: "EXPERIMENT_UPDATE" as any,
              severity: "INFO" as any,
              title: `Experimento avançou: ${exp.title} — ${cp.title}`,
              message: `O checkpoint "${cp.title}" do experimento "${exp.title}" foi concluído.`,
            });
          }
        } catch (_) { /* non-blocking */ }
      } catch (err) {
        console.error(`[Experiments] Error snapshotting checkpoint ${cp.id}:`, err);
      }
    }
  } catch (err) {
    console.error("[Experiments] Error running checkpoints:", err);
  }
}


// ─── Action Outcome Closures (fechamento do loop de aprendizado) ──────────────

async function runActionOutcomeClosures() {
  logger.info("[OutcomeClosures] Checking for pending action outcome closures...");
  try {
    const pending = await getPendingOutcomeClosures();
    if (pending.length === 0) return;

    logger.info(`[OutcomeClosures] ${pending.length} outcome(s) to close`);

    for (const outcome of pending) {
      try {
        // Snapshot de métricas atuais da conta
        const { startDate, endDate } = getDateRange(7);
        const metricsRows = await getCampaignPerformanceSummary(outcome.accountId, startDate, endDate);
        const agg = aggregateCampaignRows(metricsRows);
        const snapshot = {
          roas: parseFloat(agg.roas.toFixed(2)),
          cpa: parseFloat(agg.cpa.toFixed(2)),
          ctr: parseFloat(agg.ctr.toFixed(2)),
          spend: parseFloat(agg.spend.toFixed(2)),
          conversions: agg.conversions,
        };

        // Buscar sugestão original para contexto
        const { getDb } = await import("./db");
        const { aiSuggestions } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        const db = await getDb();
        const suggRows = db ? await db.select().from(aiSuggestions).where(eq(aiSuggestions.id, outcome.suggestionId)).limit(1) : [];
        const suggestion = suggRows[0];

        if (!suggestion) continue;

        // Gerar aprendizado via IA
        const learningPrompt = `Você é um analista de performance de Meta Ads. Uma ação foi aplicada e seu período de monitoramento encerrou.

AÇÃO APLICADA:
Título: ${suggestion.title}
Descrição: ${suggestion.description}
Tipo: ${suggestion.category}
Prioridade: ${suggestion.priority}
Impacto esperado: ${suggestion.expectedImpact ?? "não especificado"}
Aplicada em: ${outcome.appliedAt.toLocaleDateString("pt-BR")}

SNAPSHOT DE MÉTRICAS (7 dias pós-aplicação):
- ROAS: ${snapshot.roas}x
- CPA: R$${snapshot.cpa}
- CTR: ${snapshot.ctr}%
- Investimento: R$${snapshot.spend}
- Conversões: ${snapshot.conversions}

${outcome.manualCorrection ? `CORREÇÃO MANUAL DA EQUIPE: ${outcome.manualCorrection}` : ""}

Gere um aprendizado conciso (máx 3 linhas) no formato:
"[Tipo de ação]: O que foi feito → resultado observado → o que isso indica para futuras decisões nesta conta."

Seja objetivo. Não invente dados. Se os resultados são inconclusivos, diga isso.`;

        const aiResponse = await invokeLLM({
          messages: [{ role: "user", content: learningPrompt }],
          thinking: false,
        });

        const learningNote = extractTextContent(aiResponse).trim();

        // Salvar resultado e marcar como fechado
        const now = new Date();
        await updateActionOutcome(outcome.suggestionId, {
          observedAt: now,
          metricsSnapshot: snapshot,
          aiLearningNote: learningNote,
          closedAt: now,
          closedBy: "auto",
        });

        // Append no contexto da conta
        await appendAccountLearning(outcome.accountId, learningNote, "auto");

        logger.info(`[OutcomeClosures] ✓ Outcome closed for suggestion ${outcome.suggestionId}`);

        // Throttle para não sobrecarregar a API
        await new Promise(r => setTimeout(r, 3000));
      } catch (err) {
        console.error(`[OutcomeClosures] Error closing outcome for suggestion ${outcome.suggestionId}:`, err);
      }
    }
  } catch (err) {
    console.error("[OutcomeClosures] Error running outcome closures:", err);
  }
}

export async function startAutoSync() {
  logger.info("[AutoSync] Initializing auto-sync service...");

  // Daily sync at 09:00 UTC (06:00 Brasília)
  cron.schedule("0 0 9 * * *", runAutoSync);

  // Daily Meta Ads report email at 09:03 UTC (06:03 BRT) — offset from sync to avoid overlap
  cron.schedule("0 3 9 * * *", runDailyReport);

  // Daily development progress report at 23:00 UTC (20:00 BRT)
  cron.schedule("0 0 23 * * *", runDailyProgress);

  // Daily technical alerts check at 08:55 UTC (05:55 BRT) — runs 5min before the main sync
  cron.schedule("0 55 8 * * *", runAnomalyDetection);

  // Anomalias de mídia (09:20 UTC) — depois do sync das 09:00.
  cron.schedule("0 20 9 * * *", runAnomaliasDeMidia);

  // Notificações do dia: financeiro + briefing + semanal (09:25 UTC).
  cron.schedule("0 25 9 * * *", runNotificacoesDiarias);

  // Daily cleanup of old read anomalies (09:05 UTC)
  cron.schedule("0 5 9 * * *", async () => {
    try {
      const deleted = await purgeOldReadAnomalies();
      if (deleted > 0) {
        logger.info(`[AutoSync] Purged ${deleted} old read anomalies (>30 days)`);
      }
    } catch (err) {
      console.error("[AutoSync] Error purging old anomalies:", err);
    }
  });

  // Polling fallback for scheduled reports (every 5 minutes)
  cron.schedule("0 */5 * * * *", runScheduledReports);

  // Daily experiment checkpoint snapshots at 09:10 UTC
  cron.schedule("0 10 9 * * *", runExperimentCheckpoints);

  // Daily action outcome closures at 09:15 UTC (06:15 BRT)
  cron.schedule("0 15 9 * * *", runActionOutcomeClosures);

  // Run initial sync after a short delay to let the server warm up
  setTimeout(async () => {
    // Purge duplicate alerts from backlog on startup
    try {
      const purged = await purgeDuplicateAlerts();
      if (purged > 0) {
        logger.info(`[AutoSync] Purged ${purged} duplicate alerts on startup`);
      }
    } catch (err) {
      console.error("[AutoSync] Error purging duplicate alerts:", err);
    }

    // Purge duplicate anomalies from backlog on startup
    try {
      const purgedAnomalies = await purgeDuplicateAnomalies();
      if (purgedAnomalies > 0) {
        logger.info(`[AutoSync] Purged ${purgedAnomalies} duplicate anomalies on startup`);
      }
    } catch (err) {
      console.error("[AutoSync] Error purging duplicate anomalies:", err);
    }

    await runAutoSync();
    await runAnomalyDetection();
    await rebuildScheduledReportJobs();
  }, 15000);

  logger.info("[AutoSync] Auto-sync service initialized.");
}
