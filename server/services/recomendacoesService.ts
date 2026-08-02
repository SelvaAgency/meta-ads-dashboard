/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Geração de recomendações — fonte ÚNICA da montagem + chamada da IA
 * ─────────────────────────────────────────────────────────────────────────────
 *  Monta os insumos (campanhas 30d + insights 3 níveis + feedback de rejeições)
 *  e chama generateAiSuggestions. Usado pela mutation manual "gerar" e pelo ciclo
 *  noturno (geração automática híbrida) — sem duplicar a montagem nos dois.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { getCampaignPerformanceSummary, getSuggestionsHistory } from "../db";
import { getAdSetsWithInsights, getAdsWithInsights } from "../metaAdsService";
import { generateAiSuggestions } from "../analysisService";

const AGENCY_TZ = "America/Sao_Paulo";
function ultimos30(): { startDate: string; endDate: string } {
  const iso = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: AGENCY_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 29);
  return { startDate: iso(start), endDate: iso(end) };
}

const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> =>
  Promise.race([promise, new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))]);

export type ContaParaRecomendacao = { id: number; accountId: string; accessToken: string; goalTypeOverride?: string | null };

export async function gerarRecomendacoesDaConta(account: ContaParaRecomendacao, userId: number) {
  const { startDate, endDate } = ultimos30();
  const campaignData = await getCampaignPerformanceSummary(account.id, startDate, endDate);

  const historyRaw = await getSuggestionsHistory(account.id);
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

  // Insights 3 níveis (conjunto/anúncio) enriquecem a análise; se estourar 15s,
  // cai para campanha-só sem travar.
  let adsetInsights: Awaited<ReturnType<typeof getAdSetsWithInsights>> = [];
  let adInsights: Awaited<ReturnType<typeof getAdsWithInsights>> = [];
  try {
    adsetInsights = await withTimeout(getAdSetsWithInsights(account.accountId, account.accessToken, startDate, endDate), 15000);
    const adsetGoalMap = new Map(adsetInsights.map((a) => [a.id, a.optimization_goal]));
    adInsights = await withTimeout(getAdsWithInsights(account.accountId, account.accessToken, startDate, endDate, adsetGoalMap), 15000);
  } catch (e: any) {
    console.warn(`[recomendacoes] insights 3 níveis indisponíveis (${e?.message ?? e}) — campanha-só p/ conta ${account.id}`);
  }

  return generateAiSuggestions(account.id, userId, account.goalTypeOverride ?? null, mapped, rejectedFeedback, adsetInsights, adInsights);
}
