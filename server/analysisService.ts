/**
 * AI Analysis Service
 * Handles anomaly detection, campaign diagnostics, and AI-powered improvement suggestions.
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
  roasDropPercent: 10,   // Alerta a partir de -10% de queda no ROAS
  cpaSpikePercent: 30,   // Alerta a partir de +30% de aumento no CPA
  ctrDropPercent: 30,    // Alerta a partir de -30% de queda no CTR
  spendSpikePercent: 50, // Alerta a partir de +50% de aumento no gasto
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

  // RESULTS_DROP: queda de resultados ≥ 20% após análise de 7 dias
  const currConversions = parseFloat(String(current.conversions ?? 0));
  const prevConversions = parseFloat(String(previous.conversions ?? 0));
  if (prevConversions > 0) {
    const change = pctChange(currConversions, prevConversions);
    if (change <= -20) {
      detected.push({
        type: "RESULTS_DROP",
        severity: change <= -50 ? "CRITICAL" : change <= -35 ? "HIGH" : "MEDIUM",
        title: "Queda de resultados detectada",
        description: `Os resultados caíram de ${prevConversions.toFixed(0)} para ${currConversions.toFixed(0)} (${Math.abs(change).toFixed(1)}% de queda). Revise os criativos, segmentação e página de destino.`,
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
  rejectedFeedback?: Array<{ title: string; rejectionReason: string | null }>
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

  const prompt = `Você é um especialista sênior em Meta Ads com mais de 10 anos de experiência em otimização de campanhas de performance.

Analise os dados REAIS de performance abaixo e gere sugestões PRÁTICAS e ESPECÍFICAS baseadas exclusivamente nesses dados.

REGRAS IMPORTANTES:
- Só gere sugestões que sejam justificadas pelos dados fornecidos
- Não invente problemas que não aparecem nos dados
- Se os dados mostrarem boa performance, diga isso e sugira escalar ou testar variações
- Cada sugestão deve ter um actionItem concreto e manual (o gestor vai aplicar manualmente)
- Meta de desempenho principal da conta: ${dominantGoal} (${resultLabel})

## Dados das Campanhas (últimos 30 dias)

### Campanhas com melhor resultado (${resultLabel}):
${topPerformers.map((c) => `- ${c.campaignName}: ${resultLabel} ${c.totalConversions}, Gasto R$${c.totalSpend.toFixed(2)}, CPA R$${c.avgCpa.toFixed(2)}, CTR ${c.avgCtr.toFixed(2)}%, CPM R$${(c.totalSpend > 0 && c.totalImpressions > 0 ? (c.totalSpend / c.totalImpressions) * 1000 : 0).toFixed(2)}`).join("\n")}

### Campanhas com pior resultado:
${underPerformers.map((c) => `- ${c.campaignName}: ${resultLabel} ${c.totalConversions}, Gasto R$${c.totalSpend.toFixed(2)}, CPA R$${c.avgCpa.toFixed(2)}, CTR ${c.avgCtr.toFixed(2)}%, Impressões ${c.totalImpressions}`).join("\n")}

### Resumo Geral:
- Total de campanhas analisadas: ${campaignsWithData.length}
- Total investido: R$${totalSpend.toFixed(2)}
- Total de ${resultLabel}: ${campaignsWithData.reduce((s, c) => s + c.totalConversions, 0)}
- CPA médio: R$${(totalSpend / Math.max(1, campaignsWithData.reduce((s, c) => s + c.totalConversions, 0))).toFixed(2)}${feedbackBlock}

Gere entre 3 e 5 sugestões de melhoria em formato JSON. Cada sugestão deve ser específica, acionável e baseada nos dados fornecidos. Se não houver problemas evidentes, gere sugestões de escala e testes.`;

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
