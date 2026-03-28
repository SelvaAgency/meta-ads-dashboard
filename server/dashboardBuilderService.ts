/**
 * dashboardBuilderService.ts — Lógica de análise LLM para o Dashboard Builder de Tráfego Pago.
 * Módulo independente — não interfere com nenhuma funcionalidade existente.
 */
import { invokeLLM } from "./_core/llm";
import { storagePut } from "./storage";

// ─── Tipos do relatório estruturado ───────────────────────────────────────────

export interface CampaignMetric {
  name: string;
  currentValue: string;
  previousValue?: string;
  changePercent?: number;
  // positive = aumento é bom; negative = diminuição é bom; neutral = neutro
  polarity: "positive" | "negative" | "neutral";
  // Cor do indicador: green, red, gray
  indicatorColor: "green" | "red" | "gray";
}

export interface CampaignAnalysis {
  name: string;
  objective: string;
  metrics: CampaignMetric[];
  analysis: string;
  hasDataQualityWarning: boolean;
}

export interface DashboardReportData {
  platform: string;
  clientName: string;
  period: string;
  mode: "SINGLE" | "COMPARATIVE";
  objectives: string[];
  campaigns: CampaignAnalysis[];
  urgentAlerts?: string[];
  strategicSummary: {
    totalInvested: string;
    totalResults: string;
    avgCostPerResult: string;
    highlights: string[];
    attentionPoints: string[];
    contextNotes: string;
  };
  recommendations: string[];
  contextWarning?: string;
}

// ─── Prompt especializado ─────────────────────────────────────────────────────

function buildPrompt(
  clientName: string,
  weeklyContext: string,
  mode: "SINGLE" | "COMPARATIVE",
  imageCount: number
): string {
  const contextWordCount = weeklyContext.trim().split(/\s+/).length;
  const contextWarning =
    contextWordCount < 20
      ? "ATENÇÃO: O contexto semanal tem menos de 20 palavras. Mencione isso no campo contextWarning do JSON."
      : "";

  return `Você é um especialista em tráfego pago e análise de performance de campanhas digitais.

CLIENTE: ${clientName}
MODO: ${mode === "SINGLE" ? "PERÍODO ÚNICO (1 print)" : "COMPARATIVO (2 prints: atual + anterior)"}
CONTEXTO SEMANAL DO GESTOR: "${weeklyContext}"
${contextWarning}

${
  imageCount > 0
    ? `Analise as ${imageCount} imagem(ns) fornecidas com os dados de campanhas.`
    : "Analise os dados de campanhas fornecidos."
}

REGRAS ABSOLUTAS:
1. NÃO invente dados que não estejam no print/dados fornecidos
2. NÃO inclua gráficos ou seção de "melhores campanhas"
3. Identifique automaticamente a plataforma (Meta Ads, Google Ads, TikTok Ads, etc.)
4. Analise TODAS as campanhas visíveis — não ignore nenhuma
5. Cada análise deve referenciar números específicos — NUNCA seja genérico
6. Use o contexto semanal para enriquecer análise e recomendações
7. NUNCA sugira novos criativos ou remarketing a menos que o contexto indique necessidade
8. Alerte sobre frequência acima de 2.5 como ponto de atenção

POLARIDADE DAS MÉTRICAS (para definir cor do indicador):
- AUMENTO É POSITIVO (polarity: "positive"): Resultados, Conversões, Compras, Leads, Alcance, Impressões, CTR, ROAS, Taxa de conversão, Valor de conversão, Cliques, Engajamento, ThruPlays
- DIMINUIÇÃO É POSITIVA (polarity: "negative"): CPC, CPM, CPL, Custo por resultado, CPA, Custo por conversão, Frequência
- NEUTRO (polarity: "neutral"): Valor gasto / Investimento

LÓGICA DE COR:
- Se polarity="positive" e variação > 0: indicatorColor="green"; se < 0: indicatorColor="red"
- Se polarity="negative" e variação < 0: indicatorColor="green"; se > 0: indicatorColor="red"
- Se polarity="neutral": indicatorColor="gray"

${
  mode === "COMPARATIVE"
    ? `MODO COMPARATIVO:
- Para cada métrica: exibir valor atual (currentValue), valor anterior (previousValue) e variação percentual (changePercent como número, ex: 15.3 ou -8.2)
- Associar campanhas pelo NOME entre os dois períodos
- Se campanha existe no atual mas não no anterior: incluir sem previousValue/changePercent`
    : `MODO PERÍODO ÚNICO:
- Para cada métrica: exibir apenas currentValue, sem previousValue ou changePercent`
}

Responda EXCLUSIVAMENTE com um JSON válido no seguinte formato (sem markdown, sem explicações):

{
  "platform": "Meta Ads",
  "clientName": "${clientName}",
  "period": "período extraído do print ou 'Período analisado'",
  "mode": "${mode}",
  "objectives": ["Vendas", "Tráfego"],
  "campaigns": [
    {
      "name": "Nome exato da campanha",
      "objective": "Vendas",
      "metrics": [
        {
          "name": "Resultados",
          "currentValue": "142",
          "previousValue": "118",
          "changePercent": 20.3,
          "polarity": "positive",
          "indicatorColor": "green"
        }
      ],
      "analysis": "Análise específica e acionável desta campanha, referenciando números. Considerar o contexto semanal quando relevante.",
      "hasDataQualityWarning": false
    }
  ],
  "urgentAlerts": [],
  "strategicSummary": {
    "totalInvested": "R$ 4.250,00",
    "totalResults": "312 leads",
    "avgCostPerResult": "R$ 13,62",
    "highlights": ["Destaque positivo específico com número"],
    "attentionPoints": ["Ponto de atenção específico com número"],
    "contextNotes": "Observações sobre o contexto semanal integradas à análise"
  },
  "recommendations": [
    "Recomendação concreta e priorizada baseada nos dados"
  ],
  "contextWarning": null
}

IMPORTANTE: urgentAlerts só deve ter itens se o contexto semanal mencionar algo urgente (erro de pagamento, conta bloqueada, queda brusca, reprovação, etc.). Se não houver urgência, deixe como array vazio [].`;
}

// ─── Função principal de análise ──────────────────────────────────────────────

export async function analyzeCampaignData(
  clientName: string,
  weeklyContext: string,
  mode: "SINGLE" | "COMPARATIVE",
  imageUrls: string[]
): Promise<DashboardReportData> {
  const prompt = buildPrompt(clientName, weeklyContext, mode, imageUrls.length);

  // Build messages with images if provided
  const userContent: Array<{ type: string; text?: string; image_url?: { url: string; detail: string } }> = [];

  if (imageUrls.length > 0) {
    for (const url of imageUrls) {
      userContent.push({
        type: "image_url",
        image_url: { url, detail: "high" },
      });
    }
  }

  userContent.push({
    type: "text",
    text: `Analise os dados de campanhas ${imageUrls.length > 0 ? "nas imagens acima" : "fornecidos"} e gere o relatório JSON conforme as instruções do sistema.`,
  });

  const response = await invokeLLM({
    messages: [
      { role: "system", content: prompt },
      {
        role: "user",
        content: imageUrls.length > 0 ? (userContent as any) : userContent[userContent.length - 1].text!,
      },
    ],
  });

  const rawContent = String(response.choices?.[0]?.message?.content ?? "");

  // Extract JSON from response (handle cases where LLM wraps in markdown)
  const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("LLM não retornou JSON válido");
  }

  const parsed = JSON.parse(jsonMatch[0]) as DashboardReportData;
  return parsed;
}

// ─── Geração de HTML para PDF ─────────────────────────────────────────────────

export function generateReportHtml(report: DashboardReportData): string {
  const colorMap = { green: "#16a34a", red: "#dc2626", gray: "#6b7280" };
  const arrowMap = { green: "↑", red: "↓", gray: "→" };

  const formatChangePercent = (metric: CampaignMetric) => {
    if (metric.changePercent === undefined || metric.changePercent === null) return "";
    const sign = metric.changePercent >= 0 ? "+" : "";
    const color = colorMap[metric.indicatorColor];
    const arrow = arrowMap[metric.indicatorColor];
    return `<span style="color:${color};font-weight:600;font-size:13px;margin-left:8px;">${arrow} ${sign}${metric.changePercent.toFixed(1)}%</span>`;
  };

  const campaignsHtml = report.campaigns
    .map(
      (camp) => `
    <div style="margin-bottom:32px;padding:24px;border:1px solid #e5e7eb;border-radius:8px;page-break-inside:avoid;">
      <div style="border-bottom:2px solid #1e293b;padding-bottom:12px;margin-bottom:20px;">
        <h2 style="font-size:16px;font-weight:700;color:#1e293b;margin:0 0 4px 0;">${camp.name}</h2>
        <span style="font-size:12px;color:#64748b;background:#f1f5f9;padding:2px 8px;border-radius:4px;">${camp.objective}</span>
        ${camp.hasDataQualityWarning ? `<div style="margin-top:8px;padding:8px 12px;background:#fef9c3;border:1px solid #fde047;border-radius:4px;font-size:12px;color:#854d0e;">⚠️ Algumas métricas podem estar imprecisas devido à qualidade da imagem. Recomendamos conferir os valores.</div>` : ""}
      </div>

      <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
        <thead>
          <tr style="background:#f8fafc;">
            <th style="text-align:left;padding:8px 12px;font-size:12px;color:#64748b;font-weight:600;border-bottom:1px solid #e2e8f0;">MÉTRICA</th>
            <th style="text-align:right;padding:8px 12px;font-size:12px;color:#64748b;font-weight:600;border-bottom:1px solid #e2e8f0;">${report.mode === "COMPARATIVE" ? "PERÍODO ATUAL" : "VALOR"}</th>
            ${report.mode === "COMPARATIVE" ? `<th style="text-align:right;padding:8px 12px;font-size:12px;color:#64748b;font-weight:600;border-bottom:1px solid #e2e8f0;">PERÍODO ANTERIOR</th><th style="text-align:right;padding:8px 12px;font-size:12px;color:#64748b;font-weight:600;border-bottom:1px solid #e2e8f0;">VARIAÇÃO</th>` : ""}
          </tr>
        </thead>
        <tbody>
          ${camp.metrics
            .map(
              (m, i) => `
            <tr style="background:${i % 2 === 0 ? "#ffffff" : "#f8fafc"};">
              <td style="padding:8px 12px;font-size:13px;color:#374151;border-bottom:1px solid #f1f5f9;">${m.name}</td>
              <td style="padding:8px 12px;font-size:13px;font-weight:600;color:#1e293b;text-align:right;border-bottom:1px solid #f1f5f9;">${m.currentValue}</td>
              ${
                report.mode === "COMPARATIVE"
                  ? `<td style="padding:8px 12px;font-size:13px;color:#6b7280;text-align:right;border-bottom:1px solid #f1f5f9;">${m.previousValue ?? "—"}</td>
                     <td style="padding:8px 12px;text-align:right;border-bottom:1px solid #f1f5f9;">${formatChangePercent(m)}</td>`
                  : ""
              }
            </tr>`
            )
            .join("")}
        </tbody>
      </table>

      <div style="background:#f8fafc;border-left:3px solid #3b82f6;padding:14px 16px;border-radius:0 6px 6px 0;">
        <p style="font-size:12px;font-weight:700;color:#1e40af;margin:0 0 6px 0;text-transform:uppercase;letter-spacing:0.05em;">Análise</p>
        <p style="font-size:13px;color:#374151;line-height:1.6;margin:0;">${camp.analysis}</p>
      </div>
    </div>`
    )
    .join("");

  const urgentAlertsHtml =
    report.urgentAlerts && report.urgentAlerts.length > 0
      ? `<div style="margin-bottom:32px;padding:20px;background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;page-break-inside:avoid;">
          <h2 style="font-size:15px;font-weight:700;color:#991b1b;margin:0 0 12px 0;">⚠️ Alertas e Ações Urgentes</h2>
          <ul style="margin:0;padding-left:20px;">
            ${report.urgentAlerts.map((a) => `<li style="font-size:13px;color:#7f1d1d;margin-bottom:6px;line-height:1.5;">${a}</li>`).join("")}
          </ul>
        </div>`
      : "";

  const contextWarningHtml = report.contextWarning
    ? `<div style="margin-bottom:24px;padding:12px 16px;background:#fef9c3;border:1px solid #fde047;border-radius:6px;font-size:12px;color:#854d0e;">⚠️ ${report.contextWarning}</div>`
    : "";

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dashboard de Performance — ${report.clientName}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; color: #1e293b; background: #ffffff; }
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  </style>
</head>
<body style="padding:40px;max-width:900px;margin:0 auto;">

  <!-- CABEÇALHO -->
  <div style="border-bottom:3px solid #1e293b;padding-bottom:24px;margin-bottom:32px;">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;">
      <div>
        <p style="font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:6px;">${report.platform}</p>
        <h1 style="font-size:28px;font-weight:800;color:#1e293b;margin-bottom:4px;">${report.clientName}</h1>
        <p style="font-size:14px;color:#64748b;">${report.period}</p>
      </div>
      <div style="text-align:right;">
        <span style="display:inline-block;padding:4px 12px;background:${report.mode === "COMPARATIVE" ? "#dbeafe" : "#f0fdf4"};color:${report.mode === "COMPARATIVE" ? "#1e40af" : "#166534"};border-radius:20px;font-size:12px;font-weight:600;">
          ${report.mode === "COMPARATIVE" ? "Modo Comparativo" : "Período Único"}
        </span>
        <p style="font-size:12px;color:#94a3b8;margin-top:6px;">Objetivos: ${report.objectives.join(", ")}</p>
      </div>
    </div>
  </div>

  ${contextWarningHtml}

  <!-- CAMPANHAS -->
  <div style="margin-bottom:8px;">
    <h2 style="font-size:18px;font-weight:700;color:#1e293b;margin-bottom:20px;padding-bottom:8px;border-bottom:1px solid #e2e8f0;">
      Análise por Campanha
    </h2>
    ${campaignsHtml}
  </div>

  ${urgentAlertsHtml}

  <!-- RESUMO ESTRATÉGICO -->
  <div style="margin-bottom:32px;padding:24px;background:#f8fafc;border-radius:8px;page-break-inside:avoid;">
    <h2 style="font-size:18px;font-weight:700;color:#1e293b;margin-bottom:20px;padding-bottom:8px;border-bottom:1px solid #e2e8f0;">
      Resumo Estratégico
    </h2>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:20px;">
      <div style="background:#ffffff;padding:16px;border-radius:6px;border:1px solid #e2e8f0;text-align:center;">
        <p style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;">Total Investido</p>
        <p style="font-size:20px;font-weight:700;color:#1e293b;">${report.strategicSummary.totalInvested}</p>
      </div>
      <div style="background:#ffffff;padding:16px;border-radius:6px;border:1px solid #e2e8f0;text-align:center;">
        <p style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;">Total de Resultados</p>
        <p style="font-size:20px;font-weight:700;color:#1e293b;">${report.strategicSummary.totalResults}</p>
      </div>
      <div style="background:#ffffff;padding:16px;border-radius:6px;border:1px solid #e2e8f0;text-align:center;">
        <p style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;">Custo Médio / Resultado</p>
        <p style="font-size:20px;font-weight:700;color:#1e293b;">${report.strategicSummary.avgCostPerResult}</p>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:16px;">
      <div>
        <p style="font-size:12px;font-weight:700;color:#16a34a;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;">✓ Destaques Positivos</p>
        <ul style="padding-left:16px;">
          ${report.strategicSummary.highlights.map((h) => `<li style="font-size:13px;color:#374151;margin-bottom:4px;line-height:1.5;">${h}</li>`).join("")}
        </ul>
      </div>
      <div>
        <p style="font-size:12px;font-weight:700;color:#dc2626;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;">⚠ Pontos de Atenção</p>
        <ul style="padding-left:16px;">
          ${report.strategicSummary.attentionPoints.map((a) => `<li style="font-size:13px;color:#374151;margin-bottom:4px;line-height:1.5;">${a}</li>`).join("")}
        </ul>
      </div>
    </div>

    ${
      report.strategicSummary.contextNotes
        ? `<div style="padding:12px 16px;background:#eff6ff;border-left:3px solid #3b82f6;border-radius:0 4px 4px 0;">
            <p style="font-size:12px;font-weight:700;color:#1e40af;margin-bottom:4px;">Contexto da Semana</p>
            <p style="font-size:13px;color:#374151;line-height:1.5;">${report.strategicSummary.contextNotes}</p>
          </div>`
        : ""
    }
  </div>

  <!-- RECOMENDAÇÕES -->
  <div style="padding:24px;background:#1e293b;border-radius:8px;page-break-inside:avoid;">
    <h2 style="font-size:18px;font-weight:700;color:#f8fafc;margin-bottom:16px;">
      Recomendações e Próximos Passos
    </h2>
    <ol style="padding-left:20px;">
      ${report.recommendations.map((r, i) => `<li style="font-size:13px;color:#cbd5e1;margin-bottom:10px;line-height:1.6;"><span style="color:#60a5fa;font-weight:600;">${i + 1}.</span> ${r}</li>`).join("")}
    </ol>
  </div>

  <!-- RODAPÉ -->
  <div style="margin-top:32px;padding-top:16px;border-top:1px solid #e2e8f0;text-align:center;">
    <p style="font-size:11px;color:#94a3b8;">Relatório gerado automaticamente · ${new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}</p>
  </div>

</body>
</html>`;
}

// ─── Geração e upload do PDF ──────────────────────────────────────────────────

export async function generateAndUploadPdf(
  reportId: number,
  userId: number,
  html: string
): Promise<string> {
  // Use html-pdf-node or puppeteer if available; fallback to storing HTML as PDF placeholder
  // Since puppeteer may not be installed, we'll use the html content directly
  // and store it as an HTML file that can be printed to PDF from the browser
  const htmlBuffer = Buffer.from(html, "utf-8");
  const fileKey = `dashboard-reports/${userId}/${reportId}-${Date.now()}.html`;
  const { url } = await storagePut(fileKey, htmlBuffer, "text/html");
  return url;
}
