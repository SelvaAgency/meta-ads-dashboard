import { getMetaAdAccountById, getCampaignPerformanceSummary, getCampaignsByAccountId, getAccountMetricsSummary } from "./db";
import { getAdSets, getAdSetsWithInsights, getAdsWithInsights, rankTopAdsetsByCost, rankTopAdsByCost } from "./metaAdsService";

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function shiftPeriod(startDate: string, endDate: string) {
  const start = new Date(startDate + "T12:00:00");
  const end = new Date(endDate + "T12:00:00");
  const days = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
  const prevEnd = new Date(start);
  prevEnd.setDate(prevEnd.getDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevStart.getDate() - (days - 1));
  return { prevStart: fmtDate(prevStart), prevEnd: fmtDate(prevEnd) };
}

function round2(n: number | null): number | null {
  if (n === null) return null;
  return Math.round(n * 100) / 100;
}

function sumPeriod(rows: Array<{ totalSpend?: any; totalReach?: any; totalConversions?: any }>) {
  return rows.reduce(
    (acc, c) => {
      acc.spend += Number(c.totalSpend ?? 0);
      acc.reach += Number(c.totalReach ?? 0);
      acc.conversions += Number(c.totalConversions ?? 0);
      return acc;
    },
    { spend: 0, reach: 0, conversions: 0 }
  );
}

function withComparison(
  current: { spend: number; reach: number; conversions: number },
  previous: { spend: number; reach: number; conversions: number }
) {
  const cpc = (t: typeof current) => (t.conversions > 0 ? t.spend / t.conversions : null);
  return {
    investment: { current: round2(current.spend), previous: round2(previous.spend) },
    reach: { current: current.reach, previous: previous.reach },
    conversions: { current: current.conversions, previous: previous.conversions },
    costPerConversion: { current: round2(cpc(current)), previous: round2(cpc(previous)) },
  };
}

function bucketWeeklyTrend(
  dailyRows: Array<{ date: string; totalSpend?: any; totalReach?: any; totalConversions?: any }>,
  weeks = 8
) {
  const buckets: Record<string, { spend: number; reach: number; conversions: number; days: number }> = {};
  for (const row of dailyRows) {
    if (!row.date) continue;
    const d = new Date(row.date + "T12:00:00");
    const weekStart = new Date(d);
    weekStart.setDate(d.getDate() - d.getDay());
    const key = fmtDate(weekStart);
    if (!buckets[key]) buckets[key] = { spend: 0, reach: 0, conversions: 0, days: 0 };
    buckets[key].spend += Number(row.totalSpend ?? 0);
    buckets[key].reach += Number(row.totalReach ?? 0);
    buckets[key].conversions += Number(row.totalConversions ?? 0);
    buckets[key].days += 1;
  }
  // Descarta a última semana se ela não tiver os 7 dias completos —
  // evita o gráfico mostrar uma "queda" que é só a semana ainda não ter terminado.
  const allKeysSorted = Object.keys(buckets).sort();
  const lastKey = allKeysSorted[allKeysSorted.length - 1];
  if (lastKey && buckets[lastKey].days < 7) delete buckets[lastKey];
  const sortedKeys = Object.keys(buckets).sort().slice(-weeks);
  return {
    investment: sortedKeys.map((k) => ({ week: k, value: round2(buckets[k].spend) })),
    reach: sortedKeys.map((k) => ({ week: k, value: buckets[k].reach })),
    conversions: sortedKeys.map((k) => ({ week: k, value: buckets[k].conversions })),
    costPerConversion: sortedKeys.map((k) => ({
      week: k,
      value: round2(buckets[k].conversions > 0 ? buckets[k].spend / buckets[k].conversions : null),
    })),
  };
}

export async function assembleReportData(accountId: number, periodStart: string, periodEnd: string) {
  const account = await getMetaAdAccountById(accountId);
  if (!account) throw new Error(`Conta ${accountId} não encontrada`);

  const { prevStart, prevEnd } = shiftPeriod(periodStart, periodEnd);

  const [currentCampaigns, previousCampaigns, dbCampaigns] = await Promise.all([
    getCampaignPerformanceSummary(accountId, periodStart, periodEnd),
    getCampaignPerformanceSummary(accountId, prevStart, prevEnd),
    getCampaignsByAccountId(accountId),
  ]);

  const metrics = withComparison(sumPeriod(currentCampaigns), sumPeriod(previousCampaigns));

  const endDateObj = new Date(periodEnd + "T12:00:00");
  const trendStartObj = new Date(endDateObj);
  trendStartObj.setDate(trendStartObj.getDate() - 55);
  const dailyRows = await getAccountMetricsSummary(accountId, fmtDate(trendStartObj), periodEnd);
  const weeklyTrend = bucketWeeklyTrend(dailyRows, 8);

  const rawAdsets = await getAdSets(account.accountId, account.accessToken);
  const adsetGoalMap = new Map<string, string>();
  for (const as of rawAdsets) {
    if (as.optimization_goal) adsetGoalMap.set(as.id, as.optimization_goal);
  }

  const adsetsWithInsights = await getAdSetsWithInsights(account.accountId, account.accessToken, periodStart, periodEnd);
  const audiences = rankTopAdsetsByCost(adsetsWithInsights, dbCampaigns, 5);

  const ads = await getAdsWithInsights(account.accountId, account.accessToken, periodStart, periodEnd, adsetGoalMap);
  const creatives = rankTopAdsByCost(ads, dbCampaigns, 5);

  return {
    account: { id: account.id, name: account.accountName },
    period: { start: periodStart, end: periodEnd },
    metrics,
    weeklyTrend,
    creatives,
    audiences,
  };
}
