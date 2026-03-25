/**
 * AI Analysis Service
 * Handles anomaly detection, campaign diagnostics, and AI-powered improvement suggestions.
 */

import { invokeLLM } from "./_core/llm";
import {
  createAlert,
  createAnomaly,
  createAiSuggestion,
  getAccountMetricsSummary,
  getCampaignPerformanceSummary,
} from "./db";
import type { CampaignMetrics } from "../drizzle/schema";

// ─── Anomaly Detection ────────────────────────────────────────────────────────

interface AnomalyThresholds {
  roasDropPercent: number;   // e.g. 25 = 25% drop triggers anomaly
  cpaSpikePercent: number;   // e.g. 30 = 30% spike triggers anomaly
  ctrDropPercent: number;    // e.g. 30 = 30% drop triggers anomaly
  spendSpikePercent: number; // e.g. 50 = 50% spike triggers anomaly
  frequencyHighValue: number; // e.g. 4.0 = frequency > 4 triggers anomaly
}

const DEFAULT_THRESHOLDS: AnomalyThresholds = {
  roasDropPercent: 25,
  cpaSpikePercent: 30,
  ctrDropPercent: 30,
  spendSpikePercent: 50,
  frequencyHighValue: 4.0,
};

export function detectAnomalies(
  current: Partial<CampaignMetrics>,
  previous: Partial<CampaignMetrics>,
  thresholds: AnomalyThresholds = DEFAULT_THRESHOLDS
): Array<{
  type: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  title: string;
  description: string;
  metricName: string;
  currentValue: number;
  previousValue: number;
  changePercent: number;
}> {
  const detected: ReturnType<typeof detectAnomalies> = [];

  const pctChange = (curr: number, prev: number) =>
    prev === 0 ? 0 : ((curr - prev) / prev) * 100;

  const currRoas = parseFloat(String(current.roas ?? 0));
  const prevRoas = parseFloat(String(previous.roas ?? 0));
  if (prevRoas > 0) {
    const change = pctChange(currRoas, prevRoas);
    if (change <= -thresholds.roasDropPercent) {
      detected.push({
        type: "ROAS_DROP",
        severity: change <= -50 ? "CRITICAL" : change <= -35 ? "HIGH" : "MEDIUM",
        title: "Queda de ROAS detectada",
        description: `O ROAS caiu de ${prevRoas.toFixed(2)}x para ${currRoas.toFixed(2)}x (${Math.abs(change).toFixed(1)}% de queda). Verifique criativos, segmentação e orçamento.`,
        metricName: "roas",
        currentValue: currRoas,
        previousValue: prevRoas,
        changePercent: change,
      });
    }
  }

  const currCpa = parseFloat(String(current.cpa ?? 0));
  const prevCpa = parseFloat(String(previous.cpa ?? 0));
  if (prevCpa > 0 && currCpa > 0) {
    const change = pctChange(currCpa, prevCpa);
    if (change >= thresholds.cpaSpikePercent) {
      detected.push({
        type: "CPA_SPIKE",
        severity: change >= 80 ? "CRITICAL" : change >= 50 ? "HIGH" : "MEDIUM",
        title: "Pico de CPA detectado",
        description: `O CPA aumentou de R$${prevCpa.toFixed(2)} para R$${currCpa.toFixed(2)} (+${change.toFixed(1)}%). Revise a segmentação e os criativos.`,
        metricName: "cpa",
        currentValue: currCpa,
        previousValue: prevCpa,
        changePercent: change,
      });
    }
  }

  const currCtr = parseFloat(String(current.ctr ?? 0));
  const prevCtr = parseFloat(String(previous.ctr ?? 0));
  if (prevCtr > 0) {
    const change = pctChange(currCtr, prevCtr);
    if (change <= -thresholds.ctrDropPercent) {
      detected.push({
        type: "CTR_DROP",
        severity: change <= -50 ? "HIGH" : "MEDIUM",
        title: "Queda de CTR detectada",
        description: `O CTR caiu de ${prevCtr.toFixed(2)}% para ${currCtr.toFixed(2)}% (${Math.abs(change).toFixed(1)}% de queda). Pode indicar fadiga de criativos.`,
        metricName: "ctr",
        currentValue: currCtr,
        previousValue: prevCtr,
        changePercent: change,
      });
    }
  }

  const currSpend = parseFloat(String(current.spend ?? 0));
  const prevSpend = parseFloat(String(previous.spend ?? 0));
  if (prevSpend > 0) {
    const change = pctChange(currSpend, prevSpend);
    if (change >= thresholds.spendSpikePercent) {
      detected.push({
        type: "SPEND_SPIKE",
        severity: change >= 100 ? "HIGH" : "MEDIUM",
        title: "Pico de investimento detectado",
        description: `O gasto aumentou de R$${prevSpend.toFixed(2)} para R$${currSpend.toFixed(2)} (+${change.toFixed(1)}%). Verifique se o orçamento está configurado corretamente.`,
        metricName: "spend",
        currentValue: currSpend,
        previousValue: prevSpend,
        changePercent: change,
      });
    }
  }

  const currFreq = parseFloat(String(current.frequency ?? 0));
  if (currFreq >= thresholds.frequencyHighValue) {
    detected.push({
      type: "FREQUENCY_HIGH",
      severity: currFreq >= 6 ? "HIGH" : "MEDIUM",
      title: "Frequência elevada — possível fadiga de anúncio",
      description: `A frequência está em ${currFreq.toFixed(1)}x, acima do limite recomendado de ${thresholds.frequencyHighValue}x. Renove os criativos ou expanda o público.`,
      metricName: "frequency",
      currentValue: currFreq,
      previousValue: 0,
      changePercent: 0,
    });
  }

  return detected;
}

// ─── AI Suggestions Generator ─────────────────────────────────────────────────

export async function generateAiSuggestions(
  accountId: number,
  userId: number,
  campaignData: Array<{
    campaignId: number;
    campaignName: string;
    campaignStatus: string;
    totalSpend: number;
    totalImpressions: number;
    totalClicks: number;
    totalConversions: number;
    totalConversionValue: number;
    avgRoas: number;
    avgCpa: number;
    avgCtr: number;
  }>
): Promise<void> {
  if (campaignData.length === 0) return;

  const topPerformers = [...campaignData]
    .sort((a, b) => b.avgRoas - a.avgRoas)
    .slice(0, 3);

  const underPerformers = [...campaignData]
    .filter((c) => c.totalSpend > 0)
    .sort((a, b) => a.avgRoas - b.avgRoas)
    .slice(0, 3);

  const prompt = `Você é um especialista em Meta Ads com mais de 10 anos de experiência em otimização de campanhas de performance.

Analise os dados de performance das campanhas abaixo e gere sugestões práticas e específicas de melhoria.

## Dados das Campanhas (últimos 30 dias)

### Top Performers:
${topPerformers.map((c) => `- ${c.campaignName}: ROAS ${c.avgRoas.toFixed(2)}x, CPA R$${c.avgCpa.toFixed(2)}, CTR ${c.avgCtr.toFixed(2)}%, Gasto R$${c.totalSpend.toFixed(2)}, Conversões ${c.totalConversions}`).join("\n")}

### Underperformers:
${underPerformers.map((c) => `- ${c.campaignName}: ROAS ${c.avgRoas.toFixed(2)}x, CPA R$${c.avgCpa.toFixed(2)}, CTR ${c.avgCtr.toFixed(2)}%, Gasto R$${c.totalSpend.toFixed(2)}, Conversões ${c.totalConversions}`).join("\n")}

### Resumo Geral:
- Total de campanhas: ${campaignData.length}
- Total investido: R$${campaignData.reduce((s, c) => s + c.totalSpend, 0).toFixed(2)}
- ROAS médio: ${(campaignData.reduce((s, c) => s + c.avgRoas, 0) / campaignData.length).toFixed(2)}x
- CPA médio: R$${(campaignData.reduce((s, c) => s + c.avgCpa, 0) / campaignData.length).toFixed(2)}

Gere exatamente 5 sugestões de melhoria em formato JSON. Cada sugestão deve ser específica, acionável e baseada nos dados fornecidos.

Responda APENAS com JSON válido no seguinte formato:
{
  "suggestions": [
    {
      "category": "BUDGET|TARGETING|CREATIVE|BIDDING|SCHEDULE|AUDIENCE|GENERAL",
      "priority": "HIGH|MEDIUM|LOW",
      "title": "Título curto e direto (máx 80 chars)",
      "description": "Descrição detalhada explicando o problema e a solução recomendada (2-3 frases)",
      "expectedImpact": "Impacto esperado em métricas específicas (ex: aumento de 15-20% no ROAS)",
      "actionItems": ["Ação 1", "Ação 2", "Ação 3"]
    }
  ]
}`;

  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content:
            "Você é um especialista em Meta Ads. Responda sempre em português brasileiro com JSON válido.",
        },
        { role: "user", content: prompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "suggestions_response",
          strict: true,
          schema: {
            type: "object",
            properties: {
              suggestions: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    category: { type: "string" },
                    priority: { type: "string" },
                    title: { type: "string" },
                    description: { type: "string" },
                    expectedImpact: { type: "string" },
                    actionItems: { type: "array", items: { type: "string" } },
                  },
                  required: ["category", "priority", "title", "description", "expectedImpact", "actionItems"],
                  additionalProperties: false,
                },
              },
            },
            required: ["suggestions"],
            additionalProperties: false,
          },
        },
      },
    });

    const rawContent = response.choices[0]?.message?.content;
    const content = typeof rawContent === 'string' ? rawContent : null;
    if (!content) return;

    const parsed = JSON.parse(content) as {
      suggestions: Array<{
        category: string;
        priority: string;
        title: string;
        description: string;
        expectedImpact: string;
        actionItems: string[];
      }>;
    };

    for (const s of parsed.suggestions) {
      await createAiSuggestion({
        accountId,
        category: s.category as any,
        priority: s.priority as any,
        title: s.title,
        description: s.description,
        expectedImpact: s.expectedImpact,
        actionItems: s.actionItems,
      });
    }
  } catch (err) {
    console.error("[AI Suggestions] Failed to generate:", err);
  }
}

// ─── Report Generator ─────────────────────────────────────────────────────────

export async function generatePerformanceReport(
  accountId: number,
  frequency: "DAILY" | "WEEKLY",
  metricsData: Array<{
    date: string;
    totalSpend: number;
    totalImpressions: number;
    totalClicks: number;
    totalConversions: number;
    totalConversionValue: number;
    avgRoas: number;
    avgCpa: number;
    avgCtr: number;
  }>
): Promise<string> {
  if (metricsData.length === 0) {
    return "Sem dados disponíveis para o período selecionado.";
  }

  const totalSpend = metricsData.reduce((s, d) => s + d.totalSpend, 0);
  const totalConversions = metricsData.reduce((s, d) => s + d.totalConversions, 0);
  const totalConversionValue = metricsData.reduce((s, d) => s + d.totalConversionValue, 0);
  const avgRoas = metricsData.reduce((s, d) => s + d.avgRoas, 0) / metricsData.length;
  const avgCpa = totalConversions > 0 ? totalSpend / totalConversions : 0;
  const avgCtr = metricsData.reduce((s, d) => s + d.avgCtr, 0) / metricsData.length;

  const period = frequency === "DAILY" ? "últimas 24 horas" : "última semana";

  const prompt = `Você é um analista de mídia paga especialista em Meta Ads. Gere um relatório executivo conciso e profissional em português brasileiro.

## Dados de Performance — ${period}

- Investimento total: R$${totalSpend.toFixed(2)}
- Conversões: ${totalConversions.toFixed(0)}
- Valor de conversão: R$${totalConversionValue.toFixed(2)}
- ROAS médio: ${avgRoas.toFixed(2)}x
- CPA médio: R$${avgCpa.toFixed(2)}
- CTR médio: ${avgCtr.toFixed(2)}%

## Evolução diária:
${metricsData
  .slice(-7)
  .map(
    (d) =>
      `${d.date}: Gasto R$${d.totalSpend.toFixed(2)}, ROAS ${d.avgRoas.toFixed(2)}x, Conversões ${d.totalConversions.toFixed(0)}`
  )
  .join("\n")}

Gere um relatório executivo com:
1. **Resumo de Performance** (2-3 frases sobre os resultados gerais)
2. **Destaques Positivos** (o que está funcionando bem)
3. **Pontos de Atenção** (o que precisa de ação)
4. **Recomendação Principal** (uma ação prioritária para o próximo período)

Use markdown para formatação. Seja direto, específico e acionável.`;

  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: "Você é um analista especialista em Meta Ads. Escreva em português brasileiro.",
        },
        { role: "user", content: prompt },
      ],
    });
    const raw = response.choices[0]?.message?.content;
    return typeof raw === 'string' ? raw : "Erro ao gerar relatório.";
  } catch (err) {
    console.error("[Report Generator] Failed:", err);
    return "Erro ao gerar relatório de performance.";
  }
}
