/**
 * emailTemplates.ts — Templates de email para relatórios de clientes
 *
 * Define templates HTML reutilizáveis para diferentes tipos de relatórios
 */

export interface EmailTemplate {
  subject: string;
  html: string;
}

/**
 * Template base para relatórios de clientes
 */
export function createClientReportTemplate(
  clientName: string,
  date: string,
  metricsHtml: string,
  comparisonHtml: string,
  campaignsHtml?: string
): string {
  const dateObj = new Date(date);
  const formattedDate = dateObj.toLocaleDateString("pt-BR", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  });

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          background-color: #f5f7fa;
          color: #333;
          line-height: 1.6;
        }
        .container {
          max-width: 600px;
          margin: 0 auto;
          background-color: #ffffff;
          border-radius: 8px;
          overflow: hidden;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }
        .header {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 40px 30px;
          text-align: center;
        }
        .header h1 {
          font-size: 28px;
          font-weight: 700;
          margin-bottom: 8px;
        }
        .header p {
          font-size: 14px;
          opacity: 0.9;
          margin: 4px 0;
        }
        .content {
          padding: 30px;
        }
        .section {
          margin-bottom: 30px;
        }
        .section-title {
          font-size: 16px;
          font-weight: 700;
          color: #667eea;
          margin-bottom: 15px;
          padding-bottom: 10px;
          border-bottom: 2px solid #667eea;
        }
        .metrics-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 20px;
        }
        .metrics-table thead {
          background-color: #f5f5f5;
        }
        .metrics-table th {
          padding: 12px;
          text-align: left;
          font-weight: 600;
          font-size: 13px;
          color: #666;
          border-bottom: 1px solid #e0e0e0;
        }
        .metrics-table td {
          padding: 12px;
          border-bottom: 1px solid #f0f0f0;
          font-size: 14px;
        }
        .metrics-table tr:hover {
          background-color: #fafafa;
        }
        .metric-label {
          font-weight: 500;
          color: #333;
        }
        .metric-value {
          text-align: right;
          font-weight: 600;
          font-size: 15px;
          color: #667eea;
        }
        .metric-change {
          text-align: center;
          font-size: 13px;
          font-weight: 500;
        }
        .trend-up { color: #10b981; }
        .trend-down { color: #ef4444; }
        .trend-stable { color: #6b7280; }
        .comparison-box {
          background-color: #f0f4ff;
          border-left: 4px solid #667eea;
          padding: 15px;
          border-radius: 4px;
          margin-bottom: 15px;
        }
        .comparison-box p {
          margin: 8px 0;
          font-size: 14px;
        }
        .comparison-box strong {
          color: #667eea;
        }
        .campaigns-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 15px;
        }
        .campaign-card {
          background-color: #f9fafb;
          border: 1px solid #e5e7eb;
          border-radius: 6px;
          padding: 12px;
        }
        .campaign-name {
          font-weight: 600;
          color: #333;
          margin-bottom: 8px;
          font-size: 13px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .campaign-metric {
          font-size: 12px;
          color: #666;
          margin: 4px 0;
        }
        .footer {
          background-color: #f5f5f5;
          padding: 20px 30px;
          text-align: center;
          border-top: 1px solid #e0e0e0;
        }
        .footer p {
          font-size: 12px;
          color: #999;
          margin: 4px 0;
        }
        .footer a {
          color: #667eea;
          text-decoration: none;
        }
        @media (max-width: 600px) {
          .container { border-radius: 0; }
          .header { padding: 30px 20px; }
          .header h1 { font-size: 24px; }
          .content { padding: 20px; }
          .campaigns-grid { grid-template-columns: 1fr; }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>${clientName}</h1>
          <p>📊 Relatório Diário de Performance</p>
          <p>${formattedDate}</p>
        </div>

        <div class="content">
          <div class="section">
            <div class="section-title">📈 Métricas do Dia</div>
            ${metricsHtml}
          </div>

          <div class="section">
            <div class="section-title">📊 Comparativo com Dia Anterior</div>
            ${comparisonHtml}
          </div>

          ${campaignsHtml ? `<div class="section">
            <div class="section-title">🎯 Top Campanhas</div>
            ${campaignsHtml}
          </div>` : ""}

          <div class="section">
            <div class="comparison-box">
              <p><strong>📅 Data:</strong> ${formattedDate}</p>
              <p><strong>🔄 Atualização:</strong> Automática diária às 06:00 BRT</p>
              <p><strong>💡 Dica:</strong> Acesse o dashboard completo para análises mais detalhadas</p>
            </div>
          </div>
        </div>

        <div class="footer">
          <p>Relatório gerado automaticamente pelo Dashboard SELVA</p>
          <p>© 2026 SELVA Agency. Todos os direitos reservados.</p>
          <p><a href="https://selvadash.manus.space">Acessar Dashboard</a></p>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Cria HTML da tabela de métricas
 */
export function createMetricsTableHTML(
  metrics: Record<string, { value: number | string; previous?: number | string; change?: number; trend?: "up" | "down" | "stable" }>,
  metricLabels: Record<string, string>
): string {
  const rows = Object.entries(metrics)
    .map(([key, metric]) => {
      const label = metricLabels[key] || key;
      const trendIcon =
        metric.trend === "up"
          ? "📈"
          : metric.trend === "down"
            ? "📉"
            : "➡️";

      const trendClass =
        metric.trend === "up"
          ? "trend-up"
          : metric.trend === "down"
            ? "trend-down"
            : "trend-stable";

      const changeText =
        metric.change !== undefined
          ? `${metric.change > 0 ? "+" : ""}${metric.change}%`
          : "N/A";

      return `
        <tr>
          <td class="metric-label">${label}</td>
          <td class="metric-value">${metric.value}</td>
          <td class="metric-change"><span class="${trendClass}">${trendIcon} ${changeText}</span></td>
        </tr>
      `;
    })
    .join("");

  return `
    <table class="metrics-table">
      <thead>
        <tr>
          <th>Métrica</th>
          <th style="text-align: right;">Valor</th>
          <th style="text-align: center;">vs. Dia Anterior</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;
}

/**
 * Cria HTML da caixa de comparativo
 */
export function createComparisonBoxHTML(
  comparison: Record<string, { current: number; previous: number; change: number; trend: "up" | "down" | "stable" }>
): string {
  const totalChange = Object.values(comparison).reduce((sum, item) => sum + item.change, 0) / Object.keys(comparison).length;
  const overallTrend = totalChange > 2 ? "up" : totalChange < -2 ? "down" : "stable";
  const overallIcon = overallTrend === "up" ? "📈" : overallTrend === "down" ? "📉" : "➡️";

  const upMetrics = Object.values(comparison).filter(item => item.trend === "up").length;
  const downMetrics = Object.values(comparison).filter(item => item.trend === "down").length;
  const stableMetrics = Object.values(comparison).filter(item => item.trend === "stable").length;

  return `
    <div class="comparison-box">
      <p><strong>Tendência Geral:</strong> ${overallIcon} ${totalChange > 0 ? "+" : ""}${totalChange.toFixed(1)}%</p>
      <p><strong>Métricas em Alta:</strong> ${upMetrics} | <strong>Em Queda:</strong> ${downMetrics} | <strong>Estáveis:</strong> ${stableMetrics}</p>
      <p style="margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(102, 126, 234, 0.2);">
        <strong>Resumo:</strong> ${getTrendSummary(upMetrics, downMetrics, stableMetrics)}
      </p>
    </div>
  `;
}

/**
 * Gera resumo textual da tendência
 */
function getTrendSummary(up: number, down: number, stable: number): string {
  if (up > down && up > stable) {
    return "Excelente! A maioria das métricas está em alta. Continue com a estratégia atual.";
  } else if (down > up && down > stable) {
    return "Atenção! Algumas métricas estão em queda. Recomenda-se revisar a estratégia.";
  } else {
    return "Performance estável. Monitore as mudanças nos próximos dias.";
  }
}

/**
 * Cria HTML da grade de campanhas
 */
export function createCampaignsGridHTML(
  campaigns: Array<{ name: string; metrics: Record<string, any> }>
): string {
  const campaignCards = campaigns
    .slice(0, 6)
    .map(
      campaign => `
    <div class="campaign-card">
      <div class="campaign-name">${campaign.name}</div>
      <div class="campaign-metric">💰 Investimento: R$ ${(campaign.metrics.spend || 0).toFixed(2)}</div>
      <div class="campaign-metric">🎯 Conversões: ${campaign.metrics.conversions || 0}</div>
      <div class="campaign-metric">📊 CTR: ${(campaign.metrics.ctr || 0).toFixed(2)}%</div>
    </div>
  `
    )
    .join("");

  return `<div class="campaigns-grid">${campaignCards}</div>`;
}
