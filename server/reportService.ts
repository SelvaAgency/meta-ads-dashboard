import { getMetaAdAccountById, getCampaignPerformanceSummary, getCampaignsByAccountId, getAccountMetricsSummary } from "./db";
import { getAdSets, getAdSetsWithInsights, getAdsWithInsights, rankTopAdsetsByCost, rankTopAdsByCost } from "./metaAdsService";
import { invokeLLM, extractTextContent } from "./_core/llm";

function classifyStatus<T extends { costPerResult: number | null; conversions: number; spend: number }>(
  items: T[]
): Array<T & { status: "good" | "neutral" | "warn" }> {
  const valid = items.filter((i): i is T & { costPerResult: number } => i.costPerResult !== null);
  const avg = valid.length > 0 ? valid.reduce((s, i) => s + i.costPerResult, 0) / valid.length : 0;
  return items.map((item) => {
    let status: "good" | "neutral" | "warn" = "neutral";
    if (item.spend > 0 && item.conversions === 0) status = "warn";
    else if (item.costPerResult !== null && avg > 0) {
      if (item.costPerResult <= avg * 0.8) status = "good";
      else if (item.costPerResult >= avg * 1.3) status = "warn";
    }
    return { ...item, status };
  });
}

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
  const audiences = classifyStatus(rankTopAdsetsByCost(adsetsWithInsights, dbCampaigns, 5));

  const ads = await getAdsWithInsights(account.accountId, account.accessToken, periodStart, periodEnd, adsetGoalMap);
  const creatives = classifyStatus(rankTopAdsByCost(ads, dbCampaigns, 5));

  return {
    account: { id: account.id, name: account.accountName },
    period: { start: periodStart, end: periodEnd },
    metrics,
    weeklyTrend,
    creatives,
    audiences,
  };
}

export async function generateReportNarrative(
  data: Awaited<ReturnType<typeof assembleReportData>>,
  contextNotes?: string
) {
  const fmtBRL = (n: number | null) => (n === null ? "N/D" : `R$${n.toFixed(2)}`);
  const pctChange = (curr: number, prev: number) => (prev > 0 ? (((curr - prev) / prev) * 100).toFixed(0) : "N/D");

  const creativesLines = data.creatives
    .map((c) => `- ${c.adName} (${c.status}): custo/resultado ${fmtBRL(c.costPerResult)}, ${c.conversions} resultados`)
    .join("\n");
  const audiencesLines = data.audiences
    .map((a) => `- ${a.adsetName} (${a.status}): custo/resultado ${fmtBRL(a.costPerResult)}, ${a.conversions} resultados`)
    .join("\n");

  const prompt = `Você é um analista sênior de mídia paga da agência SELVA, escrevendo um relatório quinzenal para o cliente "${data.account.name}" (período ${data.period.start} a ${data.period.end}).

Retorne um JSON com exatamente 5 campos:
- "headline": frase de efeito resumindo o achado principal do período, no estilo "Duas semanas, um padrão claro: X converte mais que Y" — máx 110 caracteres
- "resumo": 1-2 frases conectando investimento e resultado, tom direto e específico (cite números)
- "positivo": 1-2 frases sobre o que funcionou bem, citando o criativo/público específico
- "atencao": 1-2 frases sobre o que precisa de atenção, citando o criativo/público específico — pode ser null se nada precisar de atenção
- "proximosPassos": array de até 3 strings, ações concretas e específicas (citar nome de criativo/conjunto quando aplicável)

REGRAS:
- Português brasileiro, tom direto e profissional, sem floreio
- NÃO use markdown
- Cite números reais dos dados abaixo, nunca invente
- "positivo" e "atencao" devem se basear no status (good/warn) dos itens abaixo, não reclassifique por conta própria

DADOS DO PERÍODO:
- Investimento: ${fmtBRL(data.metrics.investment.current)} (anterior: ${fmtBRL(data.metrics.investment.previous)}, variação ${pctChange(data.metrics.investment.current!, data.metrics.investment.previous!)}%)
- Alcance: ${data.metrics.reach.current} (anterior: ${data.metrics.reach.previous})
- Conversões: ${data.metrics.conversions.current} (anterior: ${data.metrics.conversions.previous})
- Custo por conversão: ${fmtBRL(data.metrics.costPerConversion.current)} (anterior: ${fmtBRL(data.metrics.costPerConversion.previous)})

CRIATIVOS (ordenados por custo/resultado; "good" = performando bem, "warn" = precisa atenção):
${creativesLines}

PÚBLICOS (mesma lógica):
${audiencesLines}
${contextNotes ? `\nCONTEXTO ADICIONAL FORNECIDO PELA EQUIPE (use para interpretar os números, não invente além disso):\n${contextNotes}` : ""}`;

  try {
    const response = await invokeLLM({
      messages: [{ role: "user", content: prompt }],
      maxTokens: 700,
      responseFormat: { type: "json_object" },
    });
    const raw = extractTextContent(response);
    const parsed = JSON.parse(raw);
    return {
      headline: parsed.headline ?? null,
      resumo: parsed.resumo ?? null,
      positivo: parsed.positivo ?? null,
      atencao: parsed.atencao ?? null,
      proximosPassos: Array.isArray(parsed.proximosPassos) ? parsed.proximosPassos : [],
    };
  } catch (err) {
    console.error("[generateReportNarrative] Failed:", err);
    return { headline: null, resumo: null, positivo: null, atencao: null, proximosPassos: [] as string[] };
  }
}
