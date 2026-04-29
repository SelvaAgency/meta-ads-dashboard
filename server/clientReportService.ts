/**
 * clientReportService.ts — Geração de relatórios diários customizados por cliente
 *
 * Gera relatórios com métricas específicas para cada cliente
 * Inclui comparativo com dia anterior e formatação HTML
 */

import {
  getCampaignsByAccountId,
  getAccountMetricsSummary,
  getCampaignPerformanceSummary
} from "./db";
import { ClientReportConfig, MetricType } from "./clientReportConfig";
import type { Campaign, CampaignMetrics } from "./db";

export interface ClientReportData {
  clientName: string;
  date: string;
  metrics: Record<string, any>;
  comparison: Record<string, any>;
  campaigns: Array<{
    name: string;
    metrics: Record<string, any>;
  }>;
}

export interface MetricValue {
  value: number | string;
  previous?: number | string;
  change?: number; // Percentual de mudança
  trend?: "up" | "down" | "stable";
}

/**
 * Calcula a mudança percentual entre dois valores
 */
function calculateChange(current: number, previous: number): { change: number; trend: "up" | "down" | "stable" } {
  if (previous === 0) {
    return { change: current > 0 ? 100 : 0, trend: current > 0 ? "up" : "stable" };
  }

  const change = ((current - previous) / previous) * 100;
  const trend = change > 2 ? "up" : change < -2 ? "down" : "stable";

  return { change: Math.round(change * 100) / 100, trend };
}

/**
 * Calcula comparativo completo entre dia atual e anterior
 */
export function calculateDayComparison(
  currentMetrics: Record<string, number>,
  previousMetrics: Record<string, number>
): Record<string, { current: number; previous: number; change: number; trend: "up" | "down" | "stable" }> {
  const comparison: Record<string, any> = {};

  for (const [key, currentValue] of Object.entries(currentMetrics)) {
    const previousValue = previousMetrics[key] || 0;
    const { change, trend } = calculateChange(currentValue, previousValue);

    comparison[key] = {
      current: currentValue,
      previous: previousValue,
      change,
      trend
    };
  }

  return comparison;
}

/**
 * Formata um valor monetário
 */
function formatCurrency(value: number | string): string {
  const num = typeof value === "string" ? parseFloat(value) : value;
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(num);
}

/**
 * Formata um número com 2 casas decimais
 */
function formatNumber(value: number | string, decimals = 2): string {
  const num = typeof value === "string" ? parseFloat(value) : value;
  return num.toFixed(decimals);
}

/**
 * Extrai uma métrica específica dos dados da campanha
 */
async function extractMetric(
  accountId: number,
  metricType: MetricType,
  date: string
): Promise<{ current: number; previous: number }> {
  try {
    // Buscar dados do dia atual
    const summary = await getAccountMetricsSummary(accountId, date, date);
    const current = summary[0] || {};

    // Buscar dados do dia anterior
    const prevDate = new Date(date);
    prevDate.setDate(prevDate.getDate() - 1);
    const prevDateStr = prevDate.toISOString().split("T")[0];
    const prevSummary = await getAccountMetricsSummary(accountId, prevDateStr, prevDateStr);
    const previous = prevSummary[0] || {};

    // Mapear métrica para campo no banco
    const fieldMap: Record<MetricType, string> = {
      investment: "spend",
      primaryResult: "conversions",
      costPerResult: "cpa",
      ctr: "ctr",
      profileVisits: "profileVisits",
      followers: "followers",
      revenue: "conversionValue",
      roas: "roas",
      cartAdditions: "conversions", // Placeholder
      pageAccess: "conversions" // Placeholder
    };

    const field = fieldMap[metricType];
    const currentValue = parseFloat(current[field] || "0");
    const previousValue = parseFloat(previous[field] || "0");

    return { current: currentValue, previous: previousValue };
  } catch (error) {
    console.error(`[ClientReport] Error extracting metric ${metricType}:`, error);
    return { current: 0, previous: 0 };
  }
}

/**
 * Gera um relatório para um cliente específico
 */
export async function generateClientReport(
  config: ClientReportConfig,
  date: string = new Date().toISOString().split("T")[0]
): Promise<ClientReportData> {
  console.log(`[ClientReport] Generating report for ${config.clientName} (${date})`);

  const metrics: Record<string, MetricValue> = {};
  const comparison: Record<string, any> = {};

  // Processar cada métrica configurada
  for (const metricType of config.metrics) {
    for (const accountId of config.accountIds) {
      // Converter accountId de string para número
      const accountNum = parseInt(accountId);

      const { current, previous } = await extractMetric(accountNum, metricType, date);
      const { change, trend } = calculateChange(current, previous);

      metrics[metricType] = {
        value: current,
        previous,
        change,
        trend
      };

      comparison[metricType] = {
        current,
        previous,
        change,
        trend
      };
    }
  }

  // Buscar campanhas para o período
  const campaigns = [];
  for (const accountId of config.accountIds) {
    const accountNum = parseInt(accountId);
    const accountCampaigns = await getCampaignsByAccountId(accountNum);

    for (const campaign of accountCampaigns.slice(0, 5)) {
      // Top 5 campanhas
      const summary = await getAccountMetricsSummary(accountNum, date, date);
      const campaignMetrics = summary[0] || {};

      campaigns.push({
        name: campaign.name,
        metrics: {
          spend: campaignMetrics.spend || 0,
          conversions: campaignMetrics.conversions || 0,
          ctr: campaignMetrics.ctr || 0
        }
      });
    }
  }

  return {
    clientName: config.clientName,
    date,
    metrics,
    comparison,
    campaigns
  };
}

/**
 * Formata o relatório em HTML para envio por email
 */
export function formatClientReportHTML(
  report: ClientReportData,
  config: ClientReportConfig
): string {
  const { clientName, date, metrics, comparison } = report;

  // Formatar data
  const dateObj = new Date(date);
  const formattedDate = dateObj.toLocaleDateString("pt-BR", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  });

  // Construir linhas de métricas
  const metricRows = config.metrics
    .map(metricType => {
      const metric = metrics[metricType];
      if (!metric) return "";

      let value = "";
      let label = metricType;

      // Formatar valor baseado no tipo
      if (metricType === "investment" || metricType === "revenue") {
        value = formatCurrency(metric.value);
        label = metricType === "investment" ? "Investimento" : "Receita";
      } else if (metricType === "roas" || metricType === "ctr") {
        value = formatNumber(metric.value, 2);
        label = metricType === "roas" ? "ROAS" : "CTR (%)";
      } else if (metricType === "costPerResult") {
        value = formatCurrency(metric.value);
        label = config.costPerResultLabel;
      } else if (metricType === "primaryResult") {
        value = formatNumber(metric.value, 0);
        label = config.primaryResultLabel;
      } else {
        value = formatNumber(metric.value, 0);
      }

      const trendIcon =
        metric.trend === "up"
          ? "📈"
          : metric.trend === "down"
            ? "📉"
            : "➡️";

      const changeText =
        metric.change !== undefined
          ? `${metric.change > 0 ? "+" : ""}${metric.change}%`
          : "N/A";

      return `
        <tr>
          <td style="padding: 12px; border-bottom: 1px solid #eee; font-weight: 500;">${label}</td>
          <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: right; font-weight: bold;">${value}</td>
          <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: center;">${trendIcon} ${changeText}</td>
        </tr>
      `;
    })
    .join("");

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: Arial, sans-serif; color: #333; line-height: 1.6; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 8px; text-align: center; margin-bottom: 30px; }
        .header h1 { margin: 0; font-size: 28px; }
        .header p { margin: 5px 0 0 0; opacity: 0.9; }
        .section { margin-bottom: 30px; }
        .section-title { font-size: 18px; font-weight: bold; color: #667eea; margin-bottom: 15px; border-bottom: 2px solid #667eea; padding-bottom: 10px; }
        table { width: 100%; border-collapse: collapse; }
        td { padding: 12px; border-bottom: 1px solid #eee; }
        .metric-label { font-weight: 500; }
        .metric-value { text-align: right; font-weight: bold; font-size: 16px; }
        .metric-change { text-align: center; font-size: 14px; }
        .footer { text-align: center; color: #999; font-size: 12px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>${clientName}</h1>
          <p>Relatório Diário de Performance</p>
          <p>${formattedDate}</p>
        </div>

        <div class="section">
          <div class="section-title">📊 Métricas do Dia</div>
          <table>
            <thead>
              <tr style="background-color: #f5f5f5;">
                <th style="text-align: left; padding: 12px; font-weight: bold;">Métrica</th>
                <th style="text-align: right; padding: 12px; font-weight: bold;">Valor</th>
                <th style="text-align: center; padding: 12px; font-weight: bold;">vs. Dia Anterior</th>
              </tr>
            </thead>
            <tbody>
              ${metricRows}
            </tbody>
          </table>
        </div>

        <div class="section">
          <div class="section-title">📈 Resumo Comparativo</div>
          <p>
            <strong>Data:</strong> ${formattedDate}<br>
            <strong>Contas Monitoradas:</strong> ${config.accountIds.length}<br>
            <strong>Timezone:</strong> ${config.timezone}
          </p>
        </div>

        <div class="footer">
          <p>Relatório gerado automaticamente pelo Dashboard SELVA</p>
          <p>© 2026 SELVA Agency. Todos os direitos reservados.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Gera e envia o relatório para um cliente
 */
export async function generateAndSendClientReport(
  config: ClientReportConfig,
  sendEmailFn: (to: string[], subject: string, html: string) => Promise<boolean>,
  date?: string
): Promise<boolean> {
  try {
    const reportDate = date || new Date().toISOString().split("T")[0];
    const report = await generateClientReport(config, reportDate);
    const html = formatClientReportHTML(report, config);

    const subject = `[SELVA] Relatório Diário ${config.clientName} — ${reportDate}`;

    const success = await sendEmailFn(config.recipients, subject, html);

    if (success) {
      console.log(`[ClientReport] ✓ Report sent for ${config.clientName}`);
    } else {
      console.log(`[ClientReport] ✗ Failed to send report for ${config.clientName}`);
    }

    return success;
  } catch (error) {
    console.error(`[ClientReport] Error generating report for ${config.clientName}:`, error);
    return false;
  }
}
