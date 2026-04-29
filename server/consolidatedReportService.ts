/**
 * consolidatedReportService.ts — Gera relatório consolidado com todos os clientes em um único email
 *
 * Combina dados de todos os clientes em um único relatório diário
 */

import { CLIENT_REPORT_CONFIGS, ClientReportConfig } from "./clientReportConfig";
import { generateClientReport, formatCurrency, formatNumber } from "./clientReportService";

export interface ConsolidatedReportData {
  date: string;
  clientReports: Array<{
    clientName: string;
    metrics: Record<string, any>;
    comparison: Record<string, any>;
  }>;
}

/**
 * Gera relatório consolidado com todos os clientes
 */
export async function generateConsolidatedReport(date?: string): Promise<ConsolidatedReportData> {
  const reportDate = date || new Date().toISOString().split("T")[0];
  const clientReports = [];

  for (const config of Object.values(CLIENT_REPORT_CONFIGS)) {
    try {
      const report = await generateClientReport(config, reportDate);
      clientReports.push({
        clientName: config.clientName,
        metrics: report.metrics,
        comparison: report.comparison
      });
    } catch (err) {
      console.error(`[consolidatedReport] Error generating report for ${config.clientName}:`, err);
    }
  }

  return {
    date: reportDate,
    clientReports
  };
}

/**
 * Formata o relatório consolidado em HTML
 */
export function formatConsolidatedReportHTML(data: ConsolidatedReportData): string {
  const dateObj = new Date(data.date);
  const formattedDate = dateObj.toLocaleDateString("pt-BR", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  });

  const clientSections = data.clientReports
    .map(clientReport => {
      const { clientName, metrics, comparison } = clientReport;

      // Extrair métricas principais
      const investment = metrics.investment?.value || 0;
      const primaryResult = metrics.primaryResult?.value || 0;
      const costPerResult = metrics.costPerResult?.value || 0;
      const ctr = metrics.ctr?.value || 0;
      const profileVisits = metrics.profileVisits?.value || 0;
      const followers = metrics.followers?.value || 0;
      const revenue = metrics.revenue?.value || 0;
      const roas = metrics.roas?.value || 0;

      // Comparativos
      const investmentTrend = metrics.investment?.trend || "stable";
      const investmentChange = metrics.investment?.change || 0;
      const primaryResultTrend = metrics.primaryResult?.trend || "stable";
      const primaryResultChange = metrics.primaryResult?.change || 0;

      const trendIcon = (trend: string) =>
        trend === "up" ? "📈" : trend === "down" ? "📉" : "➡️";

      return `
        <div style="margin-bottom: 40px; border: 1px solid #ddd; border-radius: 8px; overflow: hidden;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px;">
            <h2 style="margin: 0; font-size: 22px;">${clientName}</h2>
          </div>
          
          <div style="padding: 20px;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr style="background-color: #f5f5f5;">
                <th style="text-align: left; padding: 12px; border-bottom: 2px solid #ddd; font-weight: bold;">Métrica</th>
                <th style="text-align: right; padding: 12px; border-bottom: 2px solid #ddd; font-weight: bold;">Valor</th>
                <th style="text-align: center; padding: 12px; border-bottom: 2px solid #ddd; font-weight: bold;">vs. Dia Anterior</th>
              </tr>
              <tr>
                <td style="padding: 12px; border-bottom: 1px solid #eee;">💰 Investimento</td>
                <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: right; font-weight: bold;">${formatCurrency(investment)}</td>
                <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: center;">${trendIcon(investmentTrend)} ${investmentChange > 0 ? "+" : ""}${investmentChange}%</td>
              </tr>
              <tr>
                <td style="padding: 12px; border-bottom: 1px solid #eee;">🎯 Resultado Principal</td>
                <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: right; font-weight: bold;">${formatNumber(primaryResult, 0)}</td>
                <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: center;">${trendIcon(primaryResultTrend)} ${primaryResultChange > 0 ? "+" : ""}${primaryResultChange}%</td>
              </tr>
              <tr>
                <td style="padding: 12px; border-bottom: 1px solid #eee;">💵 Custo por Resultado</td>
                <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: right; font-weight: bold;">${formatCurrency(costPerResult)}</td>
                <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: center;">-</td>
              </tr>
              <tr>
                <td style="padding: 12px; border-bottom: 1px solid #eee;">📊 CTR (%)</td>
                <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: right; font-weight: bold;">${formatNumber(ctr, 2)}</td>
                <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: center;">-</td>
              </tr>
              <tr>
                <td style="padding: 12px; border-bottom: 1px solid #eee;">👁️ Visitas ao Perfil</td>
                <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: right; font-weight: bold;">${formatNumber(profileVisits, 0)}</td>
                <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: center;">-</td>
              </tr>
              <tr>
                <td style="padding: 12px; border-bottom: 1px solid #eee;">👥 Seguidores IG</td>
                <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: right; font-weight: bold;">${formatNumber(followers, 0)}</td>
                <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: center;">-</td>
              </tr>
              ${revenue > 0 ? `
              <tr>
                <td style="padding: 12px; border-bottom: 1px solid #eee;">💸 Receita</td>
                <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: right; font-weight: bold;">${formatCurrency(revenue)}</td>
                <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: center;">-</td>
              </tr>
              ` : ""}
              ${roas > 0 ? `
              <tr>
                <td style="padding: 12px; border-bottom: 1px solid #eee;">📈 ROAS</td>
                <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: right; font-weight: bold;">${formatNumber(roas, 2)}</td>
                <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: center;">-</td>
              </tr>
              ` : ""}
            </table>
          </div>
        </div>
      `;
    })
    .join("");

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #333; line-height: 1.6; background-color: #f9f9f9; }
        .container { max-width: 900px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 40px; border-radius: 8px; text-align: center; margin-bottom: 30px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        .header h1 { margin: 0; font-size: 32px; font-weight: bold; }
        .header p { margin: 10px 0 0 0; opacity: 0.95; font-size: 16px; }
        .summary { background: white; padding: 20px; border-radius: 8px; margin-bottom: 30px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
        .summary-title { font-size: 18px; font-weight: bold; color: #667eea; margin-bottom: 15px; }
        .summary-content { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; }
        .summary-item { padding: 15px; background: #f5f5f5; border-radius: 6px; border-left: 4px solid #667eea; }
        .summary-item-label { font-size: 12px; color: #999; text-transform: uppercase; margin-bottom: 5px; }
        .summary-item-value { font-size: 20px; font-weight: bold; color: #333; }
        .footer { text-align: center; color: #999; font-size: 12px; margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>📊 Relatório Diário SELVA</h1>
          <p>Performance Consolidada de Todas as Contas</p>
          <p>${formattedDate}</p>
        </div>

        <div class="summary">
          <div class="summary-title">📈 Resumo Executivo</div>
          <div class="summary-content">
            <div class="summary-item">
              <div class="summary-item-label">Total de Clientes</div>
              <div class="summary-item-value">${data.clientReports.length}</div>
            </div>
            <div class="summary-item">
              <div class="summary-item-label">Data do Relatório</div>
              <div class="summary-item-value">${formattedDate.split(",")[0]}</div>
            </div>
            <div class="summary-item">
              <div class="summary-item-label">Status</div>
              <div class="summary-item-value">✓ Ativo</div>
            </div>
          </div>
        </div>

        <div>
          ${clientSections}
        </div>

        <div class="footer">
          <p>Relatório gerado automaticamente pelo Dashboard SELVA</p>
          <p>© 2026 SELVA Agency. Todos os direitos reservados.</p>
          <p>Este email foi enviado para: victor@selva.agency</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Gera e envia o relatório consolidado
 */
export async function generateAndSendConsolidatedReport(
  sendEmailFn: (to: string[], subject: string, html: string) => Promise<boolean>,
  recipients: string[],
  date?: string
): Promise<boolean> {
  try {
    const reportDate = date || new Date().toISOString().split("T")[0];
    const data = await generateConsolidatedReport(reportDate);
    const html = formatConsolidatedReportHTML(data);
    const subject = `[SELVA] Relatório Diário Consolidado — ${reportDate}`;

    console.log(`[consolidatedReport] Sending consolidated report to ${recipients.join(", ")}`);
    const success = await sendEmailFn(recipients, subject, html);

    if (success) {
      console.log(`[consolidatedReport] ✓ Consolidated report sent successfully`);
    } else {
      console.error(`[consolidatedReport] ✗ Failed to send consolidated report`);
    }

    return success;
  } catch (err: any) {
    console.error("[consolidatedReport] Error:", err);
    return false;
  }
}
