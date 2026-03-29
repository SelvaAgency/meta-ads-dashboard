/**
 * AI Analysis Service
 * Handles anomaly detection, campaign diagnostics, and AI-powered improvement suggestions.
 *
 * ANOMALY DETECTION — validação multi-período (7/14/30 dias):
 * Uma anomalia SÓ é confirmada quando detectada em pelo menos 2 das 3 janelas de referência.
 *
 * Thresholds por categoria:
 * - Custo (CPC, CPM, CPA): +150% / +120% / +100% nas janelas 7/14/30 dias
 * - Performance (CTR, ROAS): -50% / -40% / -35% nas janelas 7/14/30 dias
 * - Entrega (alcance, impressões): -70% / -60% / -50% nas janelas 7/14/30 dias
 * - Frequência: valor absoluto ≥ 2.5 (média) ou ≥ 4.0 (alta) — sem comparação multi-período
 * - Resultados: queda ≥ 20% confirmada em pelo menos 2/3 janelas
 *
 * Exceções:
 * - Campanhas em aprendizado (<7 dias ou <50 eventos): isentas de alertas de métrica
 * - Dados insuficientes (<7 dias): threshold dobrado, base limitada
 * - Campanhas pausadas/arquivadas: monitoramento parado imediatamente
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

// Thresholds por janela e categoria (conforme especificação multi-período)
const MULTI_PERIOD_THRESHOLDS = {
  cost: { d7: 150, d14: 120, d30: 100 },       // CPC, CPM, CPA: variação positiva
  performance: { d7: -50, d14: -40, d30: -35 }, // CTR, ROAS: variação negativa
  delivery: { d7: -70, d14: -60, d30: -50 },    // Alcance, impressões: variação negativa
  results: { d7: -20, d14: -20, d30: -20 },     // Resultados: queda ≥ 20%
};

// Frequência usa valor absoluto (sem comparação multi-período)
const FREQUENCY_MEDIUM = 2.5;
const FREQUENCY_HIGH = 4.0;

interface PeriodMetrics {
  roas?: number;
  cpa?: number;
  ctr?: number;
  spend?: number;
  impressions?: number;
  conversions?: number;
  frequency?: number;
  reach?: number;
  clicks?: number;
}

/**
 * Validates a metric anomaly against 3 reference windows.
 * Returns true if the anomaly is confirmed in at least 2/3 windows.
 */
function validateMultiPeriod(
  current: number,
  avg7: number,
  avg14: number,
  avg30: number,
  threshold7: number,
  threshold14: number,
  threshold30: number,
  isPositiveAnomaly: boolean // true = spike (cost), false = drop (performance)
): { confirmed: boolean; windows: number; changes: { d7: number; d14: number; d30: number } } {
  const pct = (curr: number, ref: number) => ref === 0 ? 0 : ((curr - ref) / ref) * 100;
  const changes = {
    d7: pct(current, avg7),
    d14: pct(current, avg14),
    d30: pct(current, avg30),
  };

  let windowsConfirmed = 0;
  if (avg7 > 0) {
    const triggered = isPositiveAnomaly ? changes.d7 >= threshold7 : changes.d7 <= threshold7;
    if (triggered) windowsConfirmed++;
  }
  if (avg14 > 0) {
    const triggered = isPositiveAnomaly ? changes.d14 >= threshold14 : changes.d14 <= threshold14;
    if (triggered) windowsConfirmed++;
  }
  if (avg30 > 0) {
    const triggered = isPositiveAnomaly ? changes.d30 >= threshold30 : changes.d30 <= threshold30;
    if (triggered) windowsConfirmed++;
  }

  return { confirmed: windowsConfirmed >= 2, windows: windowsConfirmed, changes };
}

export function detectAnomalies(
  current: PeriodMetrics,
  avg7: PeriodMetrics,
  avg14: PeriodMetrics,
  avg30: PeriodMetrics,
  options?: { isLearningPhase?: boolean; hasLimitedHistory?: boolean }
): Array<{
  type: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  title: string;
  description: string;
  metricName: string;
  currentValue: number;
  previousValue: number;
  changePercent: number;
  windowsConfirmed?: number;
  windowChanges?: { d7: number; d14: number; d30: number };
}> {
  // Campanhas em aprendizado: isentas de alertas de métrica
  if (options?.isLearningPhase) return [];

  const detected: ReturnType<typeof detectAnomalies> = [];

  // Multiplicador de threshold para histórico limitado (<7 dias)
  const limitedMult = options?.hasLimitedHistory ? 2 : 1;

  // ── ROAS DROP (performance) ──────────────────────────────────────────────
  const currRoas = Number(current.roas ?? 0);
  if (currRoas > 0 || (Number(avg7.roas ?? 0) > 0)) {
    const t = MULTI_PERIOD_THRESHOLDS.performance;
    const v = validateMultiPeriod(
      currRoas,
      Number(avg7.roas ?? 0), Number(avg14.roas ?? 0), Number(avg30.roas ?? 0),
      t.d7 * limitedMult, t.d14 * limitedMult, t.d30 * limitedMult,
      false
    );
    if (v.confirmed) {
      const worstChange = Math.min(v.changes.d7, v.changes.d14, v.changes.d30);
      const severity = worstChange <= -70 ? "CRITICAL" : worstChange <= -50 ? "HIGH" : "MEDIUM";
      const refVal = Number(avg7.roas ?? 0);
      detected.push({
        type: "ROAS_DROP",
        severity,
        title: `Queda de ROAS confirmada em ${v.windows}/3 janelas`,
        description: `ROAS atual: ${currRoas.toFixed(2)}x. Média 7d: ${refVal.toFixed(2)}x (${v.changes.d7.toFixed(1)}%) | Média 14d: ${Number(avg14.roas ?? 0).toFixed(2)}x (${v.changes.d14.toFixed(1)}%) | Média 30d: ${Number(avg30.roas ?? 0).toFixed(2)}x (${v.changes.d30.toFixed(1)}%). Confirmado em ${v.windows}/3 janelas.`,
        metricName: "roas",
        currentValue: currRoas,
        previousValue: refVal,
        changePercent: v.changes.d7,
        windowsConfirmed: v.windows,
        windowChanges: v.changes,
      });
    }
  }

  // ── CPA SPIKE (cost) ─────────────────────────────────────────────────────
  const currCpa = Number(current.cpa ?? 0);
  if (currCpa > 0) {
    const t = MULTI_PERIOD_THRESHOLDS.cost;
    const v = validateMultiPeriod(
      currCpa,
      Number(avg7.cpa ?? 0), Number(avg14.cpa ?? 0), Number(avg30.cpa ?? 0),
      t.d7 * limitedMult, t.d14 * limitedMult, t.d30 * limitedMult,
      true
    );
    if (v.confirmed) {
      const worstChange = Math.max(v.changes.d7, v.changes.d14, v.changes.d30);
      const severity = worstChange >= 200 ? "CRITICAL" : worstChange >= 120 ? "HIGH" : "MEDIUM";
      const refVal = Number(avg7.cpa ?? 0);
      detected.push({
        type: "CPA_SPIKE",
        severity,
        title: `Pico de CPA confirmado em ${v.windows}/3 janelas`,
        description: `CPA atual: R$${currCpa.toFixed(2)}. Média 7d: R$${refVal.toFixed(2)} (${v.changes.d7 > 0 ? "+" : ""}${v.changes.d7.toFixed(1)}%) | Média 14d: R$${Number(avg14.cpa ?? 0).toFixed(2)} (${v.changes.d14 > 0 ? "+" : ""}${v.changes.d14.toFixed(1)}%) | Média 30d: R$${Number(avg30.cpa ?? 0).toFixed(2)} (${v.changes.d30 > 0 ? "+" : ""}${v.changes.d30.toFixed(1)}%). Confirmado em ${v.windows}/3 janelas.`,
        metricName: "cpa",
        currentValue: currCpa,
        previousValue: refVal,
        changePercent: v.changes.d7,
        windowsConfirmed: v.windows,
        windowChanges: v.changes,
      });
    }
  }

  // ── CTR DROP (performance) ───────────────────────────────────────────────
  const currCtr = Number(current.ctr ?? 0);
  if (Number(avg7.ctr ?? 0) > 0) {
    const t = MULTI_PERIOD_THRESHOLDS.performance;
    const v = validateMultiPeriod(
      currCtr,
      Number(avg7.ctr ?? 0), Number(avg14.ctr ?? 0), Number(avg30.ctr ?? 0),
      t.d7 * limitedMult, t.d14 * limitedMult, t.d30 * limitedMult,
      false
    );
    if (v.confirmed) {
      const severity = v.changes.d7 <= -70 ? "HIGH" : "MEDIUM";
      const refVal = Number(avg7.ctr ?? 0);
      detected.push({
        type: "CTR_DROP",
        severity,
        title: `Queda de CTR confirmada em ${v.windows}/3 janelas`,
        description: `CTR atual: ${currCtr.toFixed(2)}%. Média 7d: ${refVal.toFixed(2)}% (${v.changes.d7.toFixed(1)}%) | Média 14d: ${Number(avg14.ctr ?? 0).toFixed(2)}% (${v.changes.d14.toFixed(1)}%) | Média 30d: ${Number(avg30.ctr ?? 0).toFixed(2)}% (${v.changes.d30.toFixed(1)}%). Confirmado em ${v.windows}/3 janelas.`,
        metricName: "ctr",
        currentValue: currCtr,
        previousValue: refVal,
        changePercent: v.changes.d7,
        windowsConfirmed: v.windows,
        windowChanges: v.changes,
      });
    }
  }

  // ── IMPRESSIONS DROP (delivery) ──────────────────────────────────────────
  const currImpressions = Number(current.impressions ?? 0);
  if (Number(avg7.impressions ?? 0) > 0) {
    const t = MULTI_PERIOD_THRESHOLDS.delivery;
    const v = validateMultiPeriod(
      currImpressions,
      Number(avg7.impressions ?? 0), Number(avg14.impressions ?? 0), Number(avg30.impressions ?? 0),
      t.d7 * limitedMult, t.d14 * limitedMult, t.d30 * limitedMult,
      false
    );
    if (v.confirmed) {
      const severity = v.changes.d7 <= -80 ? "CRITICAL" : "HIGH";
      const refVal = Number(avg7.impressions ?? 0);
      detected.push({
        type: "PERFORMANCE_DROP",
        severity,
        title: `Queda de entrega confirmada em ${v.windows}/3 janelas`,
        description: `Impressões atuais: ${currImpressions.toLocaleString()}. Média 7d: ${refVal.toLocaleString()} (${v.changes.d7.toFixed(1)}%) | Média 14d: ${Number(avg14.impressions ?? 0).toLocaleString()} (${v.changes.d14.toFixed(1)}%) | Média 30d: ${Number(avg30.impressions ?? 0).toLocaleString()} (${v.changes.d30.toFixed(1)}%). Confirmado em ${v.windows}/3 janelas.`,
        metricName: "impressions",
        currentValue: currImpressions,
        previousValue: refVal,
        changePercent: v.changes.d7,
        windowsConfirmed: v.windows,
        windowChanges: v.changes,
      });
    }
  }

  // ── RESULTS DROP ─────────────────────────────────────────────────────────
  const currConversions = Number(current.conversions ?? 0);
  if (Number(avg7.conversions ?? 0) > 0) {
    const t = MULTI_PERIOD_THRESHOLDS.results;
    const v = validateMultiPeriod(
      currConversions,
      Number(avg7.conversions ?? 0), Number(avg14.conversions ?? 0), Number(avg30.conversions ?? 0),
      t.d7 * limitedMult, t.d14 * limitedMult, t.d30 * limitedMult,
      false
    );
    if (v.confirmed) {
      const severity = v.changes.d7 <= -60 ? "CRITICAL" : v.changes.d7 <= -40 ? "HIGH" : "MEDIUM";
      const refVal = Number(avg7.conversions ?? 0);
      detected.push({
        type: "RESULTS_DROP",
        severity,
        title: `Queda de resultados confirmada em ${v.windows}/3 janelas`,
        description: `Resultados atuais: ${currConversions.toFixed(0)}. Média 7d: ${refVal.toFixed(0)} (${v.changes.d7.toFixed(1)}%) | Média 14d: ${Number(avg14.conversions ?? 0).toFixed(0)} (${v.changes.d14.toFixed(1)}%) | Média 30d: ${Number(avg30.conversions ?? 0).toFixed(0)} (${v.changes.d30.toFixed(1)}%). Confirmado em ${v.windows}/3 janelas.`,
        metricName: "conversions",
        currentValue: currConversions,
        previousValue: refVal,
        changePercent: v.changes.d7,
        windowsConfirmed: v.windows,
        windowChanges: v.changes,
      });
    }
  }

  // ── FREQUENCY HIGH (valor absoluto — sem multi-período) ──────────────────
  const currFreq = Number(current.frequency ?? 0);
  if (currFreq >= FREQUENCY_MEDIUM) {
    const isHigh = currFreq >= FREQUENCY_HIGH;
    detected.push({
      type: "FREQUENCY_HIGH",
      severity: currFreq >= 6 ? "HIGH" : isHigh ? "MEDIUM" : "LOW",
      title: isHigh ? `Frequência elevada: ${currFreq.toFixed(1)}x (acima de ${FREQUENCY_HIGH}x)` : `Frequência em atenção: ${currFreq.toFixed(1)}x (acima de ${FREQUENCY_MEDIUM}x)`,
      description: isHigh
        ? `Frequência em ${currFreq.toFixed(1)}x — acima do limite de ação (${FREQUENCY_HIGH}x). Renove os criativos ou expanda o público imediatamente.`
        : `Frequência em ${currFreq.toFixed(1)}x — acima do limite de atenção (${FREQUENCY_MEDIUM}x). Monitore a fadiga de criativos.`,
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
