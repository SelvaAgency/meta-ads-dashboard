/**
 * AI Analysis Service
 * Handles anomaly detection, campaign diagnostics, and AI-powered improvement suggestions.
 *
 * ANOMALY DETECTION — métricas de campanha fora do padrão (janela de 7 dias):
 * - Queda de ROAS ≥ 10%
 * - Queda de resultados ≥ 20%
 * - Queda de performance geral (impressões + CTR)
 * - Pico de CPA ≥ 30%
 * - Queda de CTR ≥ 25%
 * - Pico de gasto ≥ 50%
 * - Frequência elevada ≥ 4x
 *
 * NÃO são anomalias: erros técnicos (campanha parada, saldo baixo, pixel, Instagram, etc.)
 * Esses são tratados como Alertas Técnicos em metaAdsService.ts > checkRealTimeAlerts().
 */

import { invokeLLM } from "./_core/llm";
import {
  createAiSuggestion,
  getAccountMetricsSummary,
  getCampaignPerformanceSummary,
} from "./db";
import type { CampaignMetrics } from "../drizzle/schema";
import { getObjectiveProfile, detectDominantObjective } from "./campaignObjectives";

// ─── Anomaly Detection ────────────────────────────────────────────────────────

interface AnomalyThresholds {
  roasDropPercent: number;
  cpaSpikePercent: number;
  ctrDropPercent: number;
  spendSpikePercent: number;
  frequencyHighValue: number;
}

const DEFAULT_THRESHOLDS: AnomalyThresholds = {
  roasDropPercent: 10,   // Alerta a partir de -10% de queda no ROAS (conforme especificado)
  cpaSpikePercent: 30,   // Alerta a partir de +30% de aumento no CPA
  ctrDropPercent: 25,    // Alerta a partir de -25% de queda no CTR
  spendSpikePercent: 50, // Alerta a partir de +50% de aumento no gasto
  frequencyHighValue: 4.0,
};

// Threshold fixo para queda de resultados (não configurável — definido pelo usuário)
const RESULTS_DROP_THRESHOLD = 20; // -20% de queda nos resultados após análise de 7 dias

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
      // Severity: ≥-50% = CRITICAL, ≥-35% = HIGH, ≥-10% = MEDIUM
      const severity = change <= -50 ? "CRITICAL" : change <= -35 ? "HIGH" : "MEDIUM";
      detected.push({
        type: "ROAS_DROP",
        severity,
        title: `Queda de ROAS: ${prevRoas.toFixed(2)}x → ${currRoas.toFixed(2)}x (${Math.abs(change).toFixed(1)}%)`,
        description: `O ROAS caiu ${Math.abs(change).toFixed(1)}% nos últimos 7 dias em relação ao período anterior (${prevRoas.toFixed(2)}x → ${currRoas.toFixed(2)}x). Verifique criativos, segmentação e página de destino.`,
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
      const severity = change >= 80 ? "CRITICAL" : change >= 50 ? "HIGH" : "MEDIUM";
      detected.push({
        type: "CPA_SPIKE",
        severity,
        title: `Pico de CPA: R$${prevCpa.toFixed(2)} → R$${currCpa.toFixed(2)} (+${change.toFixed(1)}%)`,
        description: `O custo por resultado aumentou ${change.toFixed(1)}% nos últimos 7 dias (R$${prevCpa.toFixed(2)} → R$${currCpa.toFixed(2)}). Revise a segmentação, criativos e lances.`,
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
      const severity = change <= -50 ? "HIGH" : "MEDIUM";
      detected.push({
        type: "CTR_DROP",
        severity,
        title: `Queda de CTR: ${prevCtr.toFixed(2)}% → ${currCtr.toFixed(2)}% (${Math.abs(change).toFixed(1)}%)`,
        description: `O CTR caiu ${Math.abs(change).toFixed(1)}% nos últimos 7 dias (${prevCtr.toFixed(2)}% → ${currCtr.toFixed(2)}%). Pode indicar fadiga de criativos ou audiência saturada.`,
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

  // PERFORMANCE_DROP: queda geral de performance (CTR + impressions juntos)
  const currImpressions = parseFloat(String(current.impressions ?? 0));
  const prevImpressions = parseFloat(String(previous.impressions ?? 0));
  if (prevImpressions > 0 && prevCtr > 0) {
    const impressionChange = pctChange(currImpressions, prevImpressions);
    const ctrChange = prevCtr > 0 ? pctChange(currCtr, prevCtr) : 0;
    // Queda abrupta em ambas as métricas indica problema de entrega
    if (impressionChange <= -40 && ctrChange <= -20) {
      detected.push({
        type: "PERFORMANCE_DROP",
        severity: impressionChange <= -60 ? "CRITICAL" : "HIGH",
        title: "Queda abrupta de performance detectada",
        description: `Impressões caíram ${Math.abs(impressionChange).toFixed(1)}% e CTR caiu ${Math.abs(ctrChange).toFixed(1)}% em relação ao período anterior. Verifique a entrega das campanhas, orçamento e aprovação de criativos.`,
        metricName: "impressions",
        currentValue: currImpressions,
        previousValue: prevImpressions,
        changePercent: impressionChange,
      });
    }
  }

  // RESULTS_DROP: queda de resultados ≥ 20% após análise de 7 dias (threshold fixo)
  const currConversions = parseFloat(String(current.conversions ?? 0));
  const prevConversions = parseFloat(String(previous.conversions ?? 0));
  if (prevConversions > 0) {
    const change = pctChange(currConversions, prevConversions);
    if (change <= -RESULTS_DROP_THRESHOLD) {
      const severity = change <= -50 ? "CRITICAL" : change <= -35 ? "HIGH" : "MEDIUM";
      detected.push({
        type: "RESULTS_DROP",
        severity,
        title: `Queda de resultados: ${prevConversions.toFixed(0)} → ${currConversions.toFixed(0)} (${Math.abs(change).toFixed(1)}%)`,
        description: `Os resultados caíram ${Math.abs(change).toFixed(1)}% nos últimos 7 dias (${prevConversions.toFixed(0)} → ${currConversions.toFixed(0)}). Revise criativos, segmentação e página de destino.`,
        metricName: "conversions",
        currentValue: currConversions,
        previousValue: prevConversions,
        changePercent: change,
      });
    }
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
    optimizationGoal?: string;
    resultLabel?: string;
  }>,
  rejectedFeedback?: Array<{ title: string; rejectionReason: string | null }>,
  adsetData?: Array<{
    id: string;
    name: string;
    campaign_id: string;
    campaign_name?: string;
    optimization_goal: string;
    daily_budget?: string;
    spend: number;
    impressions: number;
    clicks: number;
    reach: number;
    frequency: number;
    ctr: number;
    cpc: number;
    conversions: number;
    costPerResult: number;
    targeting?: {
      age_min?: number;
      age_max?: number;
      genders?: number[];
      geo_locations?: { countries?: string[]; regions?: Array<{ name: string }>; cities?: Array<{ name: string }> };
      interests?: Array<{ id: string; name: string }>;
      custom_audiences?: Array<{ id: string; name: string }>;
    };
  }>,
  adData?: Array<{
    id: string;
    name: string;
    adset_id: string;
    adset_name?: string;
    campaign_id: string;
    campaign_name?: string;
    creative_type: string;
    spend: number;
    impressions: number;
    clicks: number;
    frequency: number;
    ctr: number;
    cpc: number;
    conversions: number;
    costPerResult: number;
  }>
): Promise<{ generated: number; skippedReason?: string }> {
  // — Guard: need at least one campaign with real spend data
  const campaignsWithData = campaignData.filter((c) => c.totalSpend > 0 || c.totalImpressions > 0);
  if (campaignsWithData.length === 0) {
    return { generated: 0, skippedReason: "Não há dados de performance suficientes para análise. Sincronize a conta e tente novamente após pelo menos 1 dia de veiculacão." };
  }

  const totalSpend = campaignsWithData.reduce((s, c) => s + c.totalSpend, 0);
  if (totalSpend < 1) {
    return { generated: 0, skippedReason: "O investimento registrado é muito baixo para gerar sugestões confiáveis. Aguarde pelo menos R$ 1,00 em gasto para análise." };
  }

  // Detect dominant goal from campaign data
  const goalCounts: Record<string, number> = {};
  for (const c of campaignsWithData) {
    if (c.optimizationGoal) {
      goalCounts[c.optimizationGoal] = (goalCounts[c.optimizationGoal] ?? 0) + 1;
    }
  }
  const dominantGoal = Object.entries(goalCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "OFFSITE_CONVERSIONS";
  const resultLabel = campaignsWithData.find((c) => c.resultLabel)?.resultLabel ?? "Resultados";

  // Sort by results (conversions) for top/under — not ROAS
  const sorted = [...campaignsWithData].sort((a, b) => b.totalConversions - a.totalConversions);
  const topPerformers = sorted.slice(0, 3);
  const underPerformers = [...campaignsWithData]
    .filter((c) => c.totalSpend > 0)
    .sort((a, b) => a.totalConversions - b.totalConversions)
    .slice(0, 3);

  // Include rejection feedback to improve suggestions
  const feedbackBlock = rejectedFeedback && rejectedFeedback.length > 0
    ? `\n\n### Sugestões anteriores recusadas (não repita esses padrões):\n${rejectedFeedback.map((f) => `- "${f.title}"${f.rejectionReason ? ` — Motivo da recusa: ${f.rejectionReason}` : " (sem justificativa)"}`).join("\n")}`
    : "";

  // ─── Build 3-level context blocks ───────────────────────────────────────────
  const hasEcommerce = campaignsWithData.some(c =>
    ["OUTCOME_SALES", "CONVERSIONS", "OFFSITE_CONVERSIONS", "VALUE"].includes(c.optimizationGoal ?? "")
  );

  let adsetBlock = "";
  if (adsetData && adsetData.length > 0) {
    const adsetsByCampaign = new Map<string, typeof adsetData>();
    for (const a of adsetData) {
      if (!adsetsByCampaign.has(a.campaign_id)) adsetsByCampaign.set(a.campaign_id, []);
      adsetsByCampaign.get(a.campaign_id)!.push(a);
    }
    const lines: string[] = ["\n## NÍVEL 2 — CONJUNTOS DE ANÚNCIOS (últimos 30 dias)"];
    adsetsByCampaign.forEach((sets) => {
      const campName = sets[0]?.campaign_name ?? sets[0]?.campaign_id ?? "";
      lines.push(`\n### Campanha: ${campName}`);
      const campAvgCtr = sets.reduce((s, a) => s + a.ctr, 0) / Math.max(1, sets.length);
      const setsWithConv = sets.filter(a => a.conversions > 0);
      const campAvgCostPerResult = setsWithConv.length > 0
        ? setsWithConv.reduce((s, a) => s + a.costPerResult, 0) / setsWithConv.length
        : 0;
      const campAvgFreq = sets.reduce((s, a) => s + a.frequency, 0) / Math.max(1, sets.length);
      lines.push(`  Médias da campanha: CTR ${campAvgCtr.toFixed(2)}%, Custo/resultado R$${campAvgCostPerResult.toFixed(2)}, Frequência ${campAvgFreq.toFixed(2)}`);
      for (const a of sets) {
        const budget = a.daily_budget ? `R$${(parseFloat(a.daily_budget)/100).toFixed(2)}/dia` : "sem orçamento próprio";
        const targeting = a.targeting ? (() => {
          const parts: string[] = [];
          if (a.targeting.age_min || a.targeting.age_max) parts.push(`${a.targeting.age_min ?? 18}-${a.targeting.age_max ?? 65} anos`);
          if (a.targeting.genders?.length) parts.push(a.targeting.genders.map((g: number) => g === 1 ? "Masculino" : "Feminino").join("/"));
          if (a.targeting.geo_locations?.cities?.length) parts.push(a.targeting.geo_locations.cities.map((c: { name: string }) => c.name).slice(0, 3).join(", "));
          else if (a.targeting.geo_locations?.regions?.length) parts.push(a.targeting.geo_locations.regions.map((r: { name: string }) => r.name).slice(0, 3).join(", "));
          if (a.targeting.interests?.length) parts.push(`Interesses: ${a.targeting.interests.map((i: { name: string }) => i.name).slice(0, 3).join(", ")}`);
          if (a.targeting.custom_audiences?.length) parts.push(`Públicos: ${a.targeting.custom_audiences.map((p: { name: string }) => p.name).slice(0, 2).join(", ")}`);
          return parts.length ? parts.join(" | ") : "Segmentação ampla";
        })() : "Segmentação não disponível";
        lines.push(`  - [${a.name}] Gasto: R$${a.spend.toFixed(2)} | Orçamento: ${budget} | CTR: ${a.ctr.toFixed(2)}% | CPC: R$${a.cpc.toFixed(2)} | Freq: ${a.frequency.toFixed(2)} | Resultados: ${a.conversions} | Custo/resultado: R$${a.costPerResult.toFixed(2)} | Segmentação: ${targeting}`);
      }
    });
    adsetBlock = lines.join("\n");
  }

  let adBlock = "";
  if (adData && adData.length > 0) {
    const adsByAdset = new Map<string, typeof adData>();
    for (const a of adData) {
      if (!adsByAdset.has(a.adset_id)) adsByAdset.set(a.adset_id, []);
      adsByAdset.get(a.adset_id)!.push(a);
    }
    const lines: string[] = ["\n## NÍVEL 3 — CRIATIVOS/ANÚNCIOS (últimos 30 dias)"];
    adsByAdset.forEach((ads) => {
      const adsetName = ads[0]?.adset_name ?? ads[0]?.adset_id ?? "";
      const campName = ads[0]?.campaign_name ?? "";
      lines.push(`\n### Conjunto: ${adsetName} (Campanha: ${campName})`);
      const setAvgCtr = ads.reduce((s, a) => s + a.ctr, 0) / Math.max(1, ads.length);
      const setAvgCpc = ads.reduce((s, a) => s + a.cpc, 0) / Math.max(1, ads.length);
      const adsWithConv = ads.filter(a => a.conversions > 0);
      const setAvgCostPerResult = adsWithConv.length > 0
        ? adsWithConv.reduce((s, a) => s + a.costPerResult, 0) / adsWithConv.length
        : 0;
      lines.push(`  Médias do conjunto: CTR ${setAvgCtr.toFixed(2)}%, CPC R$${setAvgCpc.toFixed(2)}, Custo/resultado R$${setAvgCostPerResult.toFixed(2)}`);
      for (const a of ads) {
        lines.push(`  - [${a.name}] Formato: ${a.creative_type} | Gasto: R$${a.spend.toFixed(2)} | CTR: ${a.ctr.toFixed(2)}% | CPC: R$${a.cpc.toFixed(2)} | Freq: ${a.frequency.toFixed(2)} | Resultados: ${a.conversions} | Custo/resultado: R$${a.costPerResult.toFixed(2)}`);
      }
    });
    adBlock = lines.join("\n");
  }

  const prompt = `Você é um especialista sênior em Meta Ads com mais de 10 anos de experiência em otimização de campanhas de performance.
Analise os dados REAIS de performance abaixo (3 níveis: campanha, conjunto, criativo) e gere sugestões ESPECÍFICAS e ACIONÁVEIS.

## REGRAS ABSOLUTAS:
1. TODA sugestão deve conter: ação específica + nomenclatura EXATA (nome da campanha/conjunto/criativo) + métrica que justifica + resultado esperado
2. NUNCA gerar sugestões genéricas sem referenciar nomes e números específicos da conta
3. NUNCA sugerir aumento do orçamento total — apenas redistribuição dentro do R$${totalSpend.toFixed(2)} já investido
4. NUNCA dar briefing criativo (roteiro, copy, conceito) — apenas o FORMATO (Vídeo, Estático, Carrossel${hasEcommerce ? ", Catálogo" : ""})
5. SEMPRE comparar métricas individuais com a média do nível acima (criativo vs conjunto, conjunto vs campanha)
6. SEMPRE considerar fase de aprendizado (mínimo 50 conversões) antes de sugerir pausas
7. Meta de desempenho principal: ${dominantGoal} (${resultLabel})

## TIPOS DE SUGESTÃO PERMITIDOS (use apenas estes como category):
- PAUSAR_CRIATIVO: criativo com CPC 2x acima da média do conjunto, CTR 50% abaixo, zero conversões com gasto >20% do orçamento, frequência >3.5, ou custo/resultado 2x acima da média
- PAUSAR_CONJUNTO: conjunto com custo/resultado 2.5x acima da média da campanha, zero resultados com gasto >30% do orçamento, frequência >3.0, ou CTR <0.5% em tráfego/conversão
- NOVO_PUBLICO: baseado em dados demográficos (gênero, faixa etária, região) ou oportunidade de lookalike/remarketing identificada nos dados
- REALOCAR_ORCAMENTO: transferência específica de R$X de [campanha/conjunto ruim] para [campanha/conjunto bom], mantendo orçamento total
- NOVO_CRIATIVO: quando conjunto tem poucos criativos, frequência alta ou todos em declínio — indicar formato e conjunto exatos
- NOVO_CONJUNTO: quando há oportunidade de testar novo segmento dentro de campanha existente, com orçamento realocado

## PRIORIZAÇÃO OBRIGATÓRIA (use como priority):
- P1: pausar o que está queimando orçamento sem retorno, corrigir problemas de entrega
- P2: realocar orçamento, pausar criativos/conjuntos abaixo da média, ajustes de segmentação com dados claros
- P3: novos conjuntos, novos criativos, novos públicos para crescimento

## NÍVEL 1 — CAMPANHAS (últimos 30 dias)
### Top performers (${resultLabel}):
${topPerformers.map((c) => `- [${c.campaignName}] ${resultLabel}: ${c.totalConversions} | Gasto: R$${c.totalSpend.toFixed(2)} | Custo/resultado: R$${c.avgCpa.toFixed(2)} | CTR: ${c.avgCtr.toFixed(2)}% | ROAS: ${c.avgRoas.toFixed(2)}x`).join("\n")}
### Underperformers:
${underPerformers.map((c) => `- [${c.campaignName}] ${resultLabel}: ${c.totalConversions} | Gasto: R$${c.totalSpend.toFixed(2)} | Custo/resultado: R$${c.avgCpa.toFixed(2)} | CTR: ${c.avgCtr.toFixed(2)}% | Impressões: ${c.totalImpressions}`).join("\n")}
### Resumo:
- Campanhas: ${campaignsWithData.length} | Total investido: R$${totalSpend.toFixed(2)} | Total ${resultLabel}: ${campaignsWithData.reduce((s, c) => s + c.totalConversions, 0)} | Custo médio/resultado: R$${(totalSpend / Math.max(1, campaignsWithData.reduce((s, c) => s + c.totalConversions, 0))).toFixed(2)}
${adsetBlock}
${adBlock}${feedbackBlock}

Gere entre 4 e 7 sugestões em formato JSON. Se não houver dados suficientes para ser específico em algum tipo, omita esse tipo em vez de generalizar.`;

  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: "Você é um especialista em Meta Ads. Responda sempre em português brasileiro com JSON válido. Seja direto e prático." },
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
    const content = typeof rawContent === "string" ? rawContent : null;
    if (!content) return { generated: 0, skippedReason: "Erro ao processar resposta da IA." };

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

    let count = 0;
    for (const s of parsed.suggestions) {
      const validCategories = ["BUDGET", "TARGETING", "CREATIVE", "BIDDING", "SCHEDULE", "AUDIENCE", "GENERAL"];
      const validPriorities = ["LOW", "MEDIUM", "HIGH"];
      const category = validCategories.includes(s.category.toUpperCase()) ? s.category.toUpperCase() : "GENERAL";
      const priority = validPriorities.includes(s.priority.toUpperCase()) ? s.priority.toUpperCase() : "MEDIUM";
      await createAiSuggestion({
        accountId,
        category: category as any,
        priority: priority as any,
        title: s.title,
        description: s.description,
        expectedImpact: s.expectedImpact,
        actionItems: s.actionItems,
      });
      count++;
    }
    return { generated: count };
  } catch (err) {
    console.error("[AI Suggestions] Failed to generate:", err);
    return { generated: 0, skippedReason: "Erro interno ao gerar sugestões. Tente novamente." };
  }
}

// ─── Agency Report Generator ──────────────────────────────────────────────────

export interface CampaignReportData {
  campaignId: number;
  campaignName: string;
  campaignObjective: string;
  campaignStatus: string;
  totalSpend: number;
  totalImpressions: number;
  totalClicks: number;
  totalConversions: number;
  totalConversionValue: number;
  totalReach: number;
  avgRoas: number;
  avgCpa: number;
  avgCtr: number;
  avgCpc: number;
  avgCpm: number;
  avgFrequency: number;
}

function formatCurrency(value: number, currency = "BRL"): string {
  return `R$ ${value.toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
}

function formatNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toFixed(0);
}

function getObjectiveLabel(objective: string): string {
  const profile = getObjectiveProfile(objective);
  return `${profile.emoji} ${profile.label}`;
}

/**
 * Build the campaign metrics block for the report based on objective.
 */
function buildCampaignBlock(campaign: CampaignReportData): string {
  const profile = getObjectiveProfile(campaign.campaignObjective);
  const lines: string[] = [];

  lines.push(`🔵 ${getObjectiveLabel(campaign.campaignObjective)} - ${campaign.campaignName}`);
  lines.push("");

  // Always show spend
  lines.push(`Valor usado: ${formatCurrency(campaign.totalSpend)}`);

  // Objective-specific metrics
  const obj = campaign.campaignObjective;

  if (["OUTCOME_SALES", "CONVERSIONS"].includes(obj)) {
    lines.push(`Compras no site: ${formatNumber(campaign.totalConversions)}`);
    lines.push(`Valor de conversão: ${formatCurrency(campaign.totalConversionValue)}`);
    lines.push(`ROAS: ${campaign.avgRoas.toFixed(2)}x`);
    lines.push(`Custo por compra: ${formatCurrency(campaign.avgCpa)}`);
    lines.push(`Alcance: ${formatNumber(campaign.totalReach)}`);
    lines.push(`Impressões: ${formatNumber(campaign.totalImpressions)}`);
    lines.push(`Cliques: ${formatNumber(campaign.totalClicks)}`);
    lines.push(`CTR: ${campaign.avgCtr.toFixed(2)}%`);
    lines.push(`CPM: ${formatCurrency(campaign.avgCpm)}`);
  } else if (["OUTCOME_LEADS", "LEAD_GENERATION"].includes(obj)) {
    lines.push(`Leads gerados: ${formatNumber(campaign.totalConversions)}`);
    lines.push(`Custo por lead: ${formatCurrency(campaign.avgCpa)}`);
    lines.push(`Alcance: ${formatNumber(campaign.totalReach)}`);
    lines.push(`Impressões: ${formatNumber(campaign.totalImpressions)}`);
    lines.push(`Cliques: ${formatNumber(campaign.totalClicks)}`);
    lines.push(`CTR: ${campaign.avgCtr.toFixed(2)}%`);
    lines.push(`CPC: ${formatCurrency(campaign.avgCpc)}`);
    lines.push(`CPM: ${formatCurrency(campaign.avgCpm)}`);
  } else if (obj === "MESSAGES") {
    lines.push(`Mensagens iniciadas: ${formatNumber(campaign.totalConversions)}`);
    lines.push(`Custo por mensagem: ${formatCurrency(campaign.avgCpa)}`);
    lines.push(`Alcance: ${formatNumber(campaign.totalReach)}`);
    lines.push(`Impressões: ${formatNumber(campaign.totalImpressions)}`);
    lines.push(`CTR: ${campaign.avgCtr.toFixed(2)}%`);
    lines.push(`CPM: ${formatCurrency(campaign.avgCpm)}`);
    lines.push(`Frequência: ${campaign.avgFrequency.toFixed(2)}`);
  } else if (["OUTCOME_ENGAGEMENT", "POST_ENGAGEMENT"].includes(obj)) {
    lines.push(`Engajamentos: ${formatNumber(campaign.totalConversions)}`);
    lines.push(`Custo por engajamento: ${formatCurrency(campaign.avgCpa)}`);
    lines.push(`Alcance: ${formatNumber(campaign.totalReach)}`);
    lines.push(`Impressões: ${formatNumber(campaign.totalImpressions)}`);
    lines.push(`Frequência: ${campaign.avgFrequency.toFixed(2)}`);
    lines.push(`CPM: ${formatCurrency(campaign.avgCpm)}`);
    lines.push(`CTR: ${campaign.avgCtr.toFixed(2)}%`);
  } else if (obj === "PAGE_LIKES") {
    lines.push(`Novos seguidores: ${formatNumber(campaign.totalConversions)}`);
    lines.push(`Custo por seguidor: ${formatCurrency(campaign.avgCpa)}`);
    lines.push(`Alcance: ${formatNumber(campaign.totalReach)}`);
    lines.push(`Impressões: ${formatNumber(campaign.totalImpressions)}`);
    lines.push(`Frequência: ${campaign.avgFrequency.toFixed(2)}`);
    lines.push(`CPM: ${formatCurrency(campaign.avgCpm)}`);
  } else if (["OUTCOME_AWARENESS", "REACH", "BRAND_AWARENESS"].includes(obj)) {
    lines.push(`Alcance: ${formatNumber(campaign.totalReach)}`);
    lines.push(`Impressões: ${formatNumber(campaign.totalImpressions)}`);
    lines.push(`Frequência: ${campaign.avgFrequency.toFixed(2)}`);
    lines.push(`CPM: ${formatCurrency(campaign.avgCpm)}`);
    lines.push(`CTR: ${campaign.avgCtr.toFixed(2)}%`);
    lines.push(`Cliques: ${formatNumber(campaign.totalClicks)}`);
  } else if (["OUTCOME_TRAFFIC", "LINK_CLICKS"].includes(obj)) {
    lines.push(`Cliques: ${formatNumber(campaign.totalClicks)}`);
    lines.push(`CTR: ${campaign.avgCtr.toFixed(2)}%`);
    lines.push(`CPC: ${formatCurrency(campaign.avgCpc)}`);
    lines.push(`Alcance: ${formatNumber(campaign.totalReach)}`);
    lines.push(`Impressões: ${formatNumber(campaign.totalImpressions)}`);
    lines.push(`CPM: ${formatCurrency(campaign.avgCpm)}`);
  } else if (obj === "VIDEO_VIEWS") {
    lines.push(`Visualizações: ${formatNumber(campaign.totalConversions)}`);
    lines.push(`Custo por visualização: ${formatCurrency(campaign.avgCpa)}`);
    lines.push(`Alcance: ${formatNumber(campaign.totalReach)}`);
    lines.push(`Impressões: ${formatNumber(campaign.totalImpressions)}`);
    lines.push(`Frequência: ${campaign.avgFrequency.toFixed(2)}`);
    lines.push(`CPM: ${formatCurrency(campaign.avgCpm)}`);
  } else {
    // Default: show all main metrics
    lines.push(`Alcance: ${formatNumber(campaign.totalReach)}`);
    lines.push(`Impressões: ${formatNumber(campaign.totalImpressions)}`);
    lines.push(`Cliques: ${formatNumber(campaign.totalClicks)}`);
    lines.push(`CTR: ${campaign.avgCtr.toFixed(2)}%`);
    lines.push(`CPM: ${formatCurrency(campaign.avgCpm)}`);
    if (campaign.totalConversions > 0) {
      lines.push(`Resultados: ${formatNumber(campaign.totalConversions)}`);
      lines.push(`Custo por resultado: ${formatCurrency(campaign.avgCpa)}`);
    }
  }

  return lines.join("\n");
}

/**
 * Generate agency-formatted report using AI analysis.
 * Output is plain text with emojis — ready for copy-paste on mobile.
 */
export async function generateAgencyReport(
  accountName: string,
  frequency: "DAILY" | "WEEKLY",
  campaigns: CampaignReportData[],
  dateStart: string,
  dateEnd: string
): Promise<string> {
  if (campaigns.length === 0) {
    return "Sem dados de campanhas disponíveis para o período selecionado.";
  }

  const activeCampaigns = campaigns.filter(
    (c) => c.campaignStatus === "ACTIVE" || c.totalSpend > 0
  );

  const objectives = activeCampaigns.map((c) => c.campaignObjective).filter(Boolean);
  const dominantObjective = detectDominantObjective(objectives);
  const objectiveLabel = getObjectiveProfile(dominantObjective).label;

  const totalSpend = activeCampaigns.reduce((s, c) => s + c.totalSpend, 0);
  const totalConversions = activeCampaigns.reduce((s, c) => s + c.totalConversions, 0);
  const totalConversionValue = activeCampaigns.reduce((s, c) => s + c.totalConversionValue, 0);
  const totalReach = activeCampaigns.reduce((s, c) => s + c.totalReach, 0);
  const totalImpressions = activeCampaigns.reduce((s, c) => s + c.totalImpressions, 0);
  const overallRoas = totalSpend > 0 ? totalConversionValue / totalSpend : 0;
  const overallCpa = totalConversions > 0 ? totalSpend / totalConversions : 0;

  // Build campaign blocks for the prompt
  const campaignBlocksText = activeCampaigns
    .map((c) => buildCampaignBlock(c))
    .join("\n\n");

  const reportType = frequency === "DAILY" ? "Diário" : "Semanal";

  const prompt = `Você é um analista especialista em Meta Ads de uma agência de marketing digital. 
Gere um relatório profissional em português brasileiro seguindo EXATAMENTE o formato abaixo.

DADOS DO RELATÓRIO:
- Cliente: ${accountName}
- Tipo: ${reportType}
- Período: ${dateStart} a ${dateEnd}
- Objetivo principal: ${objectiveLabel}
- Total investido: ${formatCurrency(totalSpend)}
- Total de resultados: ${formatNumber(totalConversions)}
- Valor de conversão total: ${formatCurrency(totalConversionValue)}
- ROAS geral: ${overallRoas.toFixed(2)}x
- Custo por resultado geral: ${formatCurrency(overallCpa)}
- Alcance total: ${formatNumber(totalReach)}
- Impressões totais: ${formatNumber(totalImpressions)}

DADOS POR CAMPANHA:
${campaignBlocksText}

INSTRUÇÕES DE FORMATO:
Gere o relatório EXATAMENTE neste formato (sem markdown, sem bold, sem asteriscos):

📊 ${accountName} – Relatório ${reportType}
📆 ${dateStart} a ${dateEnd}
📍 Meta Ads | 🎯 [liste os objetivos das campanhas ativas]

——————————

[Para cada campanha ativa, repita este bloco:]
🔵 [Tipo da Campanha] - [Nome da Campanha]
[Métrica 1]: [valor]
[Métrica 2]: [valor]
[Métrica 3]: [valor]
[todas as métricas relevantes para o objetivo]

📌 Análise

- [insight sobre a métrica principal]
- [insight sobre outra métrica relevante]
- [insight sobre eficiência/custo]
- [insight sobre frequência/saturação se aplicável]
- [insight sobre tendência ou comparativo]

——————————

[Repetir bloco para cada campanha]

——————————

🎯 Resumo Estratégico

- [dado consolidado 1]
- [dado consolidado 2]
- [dado consolidado 3]
- [contexto ou observação relevante]

——————————

🧭 Recomendações e Próximos Passos

- [recomendação 1 baseada nos dados — específica sobre conjuntos de anúncios ou criativos]
- [recomendação 2 — específica sobre orçamento ou segmentação]
- [recomendação 3 — específica sobre criativos ou testes A/B]
- [recomendação 4 — próxima ação prioritária]

REGRAS OBRIGATÓRIAS:
- NÃO use markdown (sem **, sem __, sem #)
- Use apenas emojis como separadores visuais
- Use —————————— como separador entre seções
- Bullets sempre no formato "- texto"
- Uma linha em branco entre cada bullet da análise
- Texto legível e bem espaçado para leitura no celular
- Análise deve ser específica e baseada nos dados reais fornecidos`;

  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: "Você é um analista especialista em Meta Ads de agência. Escreva relatórios profissionais em português brasileiro sem formatação markdown.",
        },
        { role: "user", content: prompt },
      ],
    });
    const raw = response.choices[0]?.message?.content;
    return typeof raw === "string" ? raw : "Erro ao gerar relatório.";
  } catch (err) {
    console.error("[Agency Report] Failed:", err);
    return "Erro ao gerar relatório de performance.";
  }
}

// Keep legacy function for backward compatibility
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
  if (metricsData.length === 0) return "Sem dados disponíveis para o período selecionado.";

  const totalSpend = metricsData.reduce((s, d) => s + d.totalSpend, 0);
  const totalConversions = metricsData.reduce((s, d) => s + d.totalConversions, 0);
  const totalConversionValue = metricsData.reduce((s, d) => s + d.totalConversionValue, 0);
  const avgRoas = metricsData.reduce((s, d) => s + d.avgRoas, 0) / metricsData.length;
  const avgCpa = totalConversions > 0 ? totalSpend / totalConversions : 0;
  const avgCtr = metricsData.reduce((s, d) => s + d.avgCtr, 0) / metricsData.length;

  const period = frequency === "DAILY" ? "últimas 24 horas" : "última semana";
  const prompt = `Você é um analista de mídia paga especialista em Meta Ads. Gere um relatório executivo conciso em português brasileiro.

Dados de Performance — ${period}:
- Investimento total: R$${totalSpend.toFixed(2)}
- Conversões: ${totalConversions.toFixed(0)}
- Valor de conversão: R$${totalConversionValue.toFixed(2)}
- ROAS médio: ${avgRoas.toFixed(2)}x
- CPA médio: R$${avgCpa.toFixed(2)}
- CTR médio: ${avgCtr.toFixed(2)}%

Gere um relatório executivo com Resumo, Destaques Positivos, Pontos de Atenção e Recomendação Principal.`;

  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: "Você é um analista especialista em Meta Ads. Escreva em português brasileiro." },
        { role: "user", content: prompt },
      ],
    });
    const raw = response.choices[0]?.message?.content;
    return typeof raw === "string" ? raw : "Erro ao gerar relatório.";
  } catch (err) {
    console.error("[Report Generator] Failed:", err);
    return "Erro ao gerar relatório de performance.";
  }
}
