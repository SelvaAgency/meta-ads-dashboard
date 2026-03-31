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
  /** Status de veiculação no período analisado: ativa ou inativa */
  deliveryStatus: "active" | "inactive" | "unknown";
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
4. Analise TODAS as campanhas visíveis no print — não ignore nenhuma, mesmo que esteja inativa
5. Cada análise deve referenciar números específicos — NUNCA seja genérico
6. Use o contexto semanal para enriquecer análise e recomendações
7. NUNCA sugira novos criativos ou remarketing a menos que o contexto indique necessidade
8. Alerte sobre frequência acima de 2.5 como ponto de atenção
9. Extraia TODAS as métricas visíveis no print para cada campanha — não limite a um conjunto fixo
10. Para cada campanha, identifique o status de veiculação: "active" se estava veiculando no período, "inactive" se estava pausada/desativada, "unknown" se não for possível determinar

EXTRAÇÃO DE MÉTRICAS — ORDEM OBRIGATÓRIA:

A) MÉTRICA PRINCIPAL (primeira da lista, em destaque — baseada no objetivo da campanha):
   - Vendas/Conversão: Compras, ROAS, Valor de conversão, Custo por compra
   - Cadastros/Leads: Leads, Custo por lead
   - Tráfego: Cliques no link, CPC, Visualizações de página de destino
   - Engajamento: Interações, Custo por engajamento
   - Reconhecimento/Alcance: Alcance, CPM, Impressões
   - Visualizações de vídeo: ThruPlays, Custo por ThruPlay
   - Mensagens: Conversas iniciadas, Custo por conversa
   Inclua a métrica principal MESMO QUE não apareça no print (marque como "Não disponível" se ausente)

B) MÉTRICAS FIXAS (sempre presentes em TODA campanha, após a principal):
   1. Seguidores ganhos (se disponível na plataforma)
   2. Cliques
   3. Alcance
   4. CTR
   Se alguma não estiver visível, inclua com currentValue="Não disponível"

C) DEMAIS MÉTRICAS (todas as outras visíveis no print, após as fixas):
   Exemplos: CPM, CPC, Impressões, Frequência, Investimento, ROAS, Valor de conversão, Custo por resultado, etc.
   Se uma métrica está visível no print, DEVE aparecer no JSON

A ordem das métricas no array DEVE ser: [métrica principal] → [4 fixas] → [demais métricas visíveis]

STATUS DE VEICULAÇÃO:
- "active": campanha estava ativa/veiculando durante o período analisado (mesmo que agora esteja pausada)
- "inactive": campanha estava pausada, desativada ou sem entrega no período
- "unknown": não é possível determinar pelo print

POLARIDADE DAS MÉTRICAS (para definir cor do indicador):
- AUMENTO É POSITIVO (polarity: "positive"): Resultados, Conversões, Compras, Leads, Alcance, Impressões, CTR, ROAS, Taxa de conversão, Valor de conversão, Cliques, Engajamento, ThruPlays, Visualizações de vídeo
- DIMINUIÇÃO É POSITIVA (polarity: "negative"): CPC, CPM, CPL, Custo por resultado, CPA, Custo por conversão, Frequência
- NEUTRO (polarity: "neutral"): Valor gasto / Investimento / Verba

LÓGICA DE COR:
- Se polarity="positive" e variação > 0: indicatorColor="green"; se < 0: indicatorColor="red"
- Se polarity="negative" e variação < 0: indicatorColor="green"; se > 0: indicatorColor="red"
- Se polarity="neutral": indicatorColor="gray"
- Se não há variação (modo único): indicatorColor="gray"

${
  mode === "COMPARATIVE"
    ? `MODO COMPARATIVO:
- Para cada métrica: exibir valor atual (currentValue), valor anterior (previousValue) e variação percentual (changePercent como número, ex: 15.3 ou -8.2)
- Associar campanhas pelo NOME entre os dois períodos
- Se campanha existe no atual mas não no anterior: incluir sem previousValue/changePercent
- Se campanha existe no anterior mas não no atual: incluir com currentValue="—" e previousValue preenchido`
    : `MODO PERÍODO ÚNICO:
- Para cada métrica: exibir apenas currentValue, sem previousValue ou changePercent`
}

Responda EXCLUSIVAMENTE com um JSON válido no seguinte formato (sem markdown, sem explicações, sem blocos de código):

{
  "platform": "Meta Ads",
  "clientName": "${clientName}",
  "period": "período extraído do print, das datas informadas no contexto, ou 'Período analisado'",
  "mode": "${mode}",
  "objectives": ["Vendas", "Tráfego"],
  "campaigns": [
    {
      "name": "Nome exato da campanha conforme aparece no print",
      "objective": "Vendas",
      "deliveryStatus": "active",
      "metrics": [
        {
          "name": "Resultados",
          "currentValue": "142",
          "previousValue": "118",
          "changePercent": 20.3,
          "polarity": "positive",
          "indicatorColor": "green"
        },
        {
          "name": "Investimento",
          "currentValue": "R$ 1.250,00",
          "previousValue": "R$ 980,00",
          "changePercent": 27.6,
          "polarity": "neutral",
          "indicatorColor": "gray"
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

IMPORTANTE:
- urgentAlerts só deve ter itens se o contexto semanal mencionar algo urgente (erro de pagamento, conta bloqueada, queda brusca, reprovação, etc.). Se não houver urgência, deixe como array vazio [].
- O campo "period" deve usar as datas informadas no contexto (se houver) ou extrair do print.
- Inclua TODAS as campanhas visíveis, mesmo as inativas — elas podem ter tido dados no período.`;
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
  type ContentPart =
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string; detail: string } };

  const textInstruction = `Analise os dados de campanhas ${imageUrls.length > 0 ? "nas imagens acima" : "fornecidos"} e gere o relatório JSON conforme as instruções do sistema. Lembre-se: extraia TODAS as métricas visíveis e identifique o status de veiculação de cada campanha.`;

  // Convert image URLs to base64 data URIs to avoid URL access issues in the LLM gateway
  const toBase64DataUri = async (url: string): Promise<string> => {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const contentType = res.headers.get("content-type") ?? "image/jpeg";
      const buffer = await res.arrayBuffer();
      const base64 = Buffer.from(buffer).toString("base64");
      return `data:${contentType};base64,${base64}`;
    } catch (err) {
      console.warn(`[DashboardBuilder] Failed to fetch image as base64, using URL directly: ${url}`, err);
      return url; // Fallback to URL if fetch fails
    }
  };

  // Build user content: images (as base64) + text instruction
  const userContent: any[] = [];
  if (imageUrls.length > 0) {
    const base64Urls = await Promise.all(imageUrls.map(toBase64DataUri));
    for (const dataUri of base64Urls) {
      // Use "high" detail — campaign screenshots contain small tabular numbers that require high resolution
      userContent.push({ type: "image_url", image_url: { url: dataUri, detail: "high" } });
    }
    userContent.push({ type: "text", text: textInstruction });
  }

  // Retry logic: up to 2 attempts with a 5s delay between them
  const invokeWithRetry = async (attempt = 1): Promise<Awaited<ReturnType<typeof invokeLLM>>> => {
    try {
      return await invokeLLM({
        // Use gemini-2.5-pro for Dashboard Builder — higher precision for tabular data extraction from images
        model: "gemini-2.5-pro",
        messages: [
          { role: "system", content: prompt },
          {
            role: "user",
            content: imageUrls.length > 0 ? userContent : textInstruction,
          },
        ],
      });
    } catch (err: any) {
      const isRetryable = err?.message?.includes("gateway") || err?.message?.includes("HTML") || err?.message?.includes("502") || err?.message?.includes("503");
      if (attempt < 2 && isRetryable) {
        console.warn(`[DashboardBuilder] Attempt ${attempt} failed (${err.message}), retrying in 5s...`);
        await new Promise(r => setTimeout(r, 5_000));
        return invokeWithRetry(attempt + 1);
      }
      throw err;
    }
  };

  const response = await invokeWithRetry();

  const rawContent = String(response?.choices?.[0]?.message?.content ?? "");

  if (!rawContent) {
    throw new Error("LLM não retornou conteúdo. Tente novamente.");
  }

  // Extract JSON from response (handle cases where LLM wraps in markdown)
  const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.error("[DashboardBuilder] LLM raw response:", rawContent.slice(0, 500));
    throw new Error("LLM não retornou JSON válido. Tente novamente com um print mais nítido.");
  }

  let parsed: DashboardReportData;
  try {
    parsed = JSON.parse(jsonMatch[0]) as DashboardReportData;
  } catch (e) {
    console.error("[DashboardBuilder] JSON parse error:", e, "Raw:", jsonMatch[0].slice(0, 500));
    throw new Error("Erro ao interpretar resposta da IA. Tente novamente.");
  }

  // Garantir que deliveryStatus existe em todas as campanhas
  if (parsed.campaigns) {
    parsed.campaigns = parsed.campaigns.map((c) => ({
      ...c,
      deliveryStatus: c.deliveryStatus ?? "unknown",
    }));
  }

  return parsed;
}

// ─── Geração de HTML para PDF ─────────────────────────────────────────────────

export function generateReportHtml(report: DashboardReportData): string {
  const colorMap = { green: "#16a34a", red: "#dc2626", gray: "#6b7280" };
  const arrowMap = { green: "↑", red: "↓", gray: "→" };

  const deliveryBadge = (status: string) => {
    if (status === "active") {
      return `<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;background:#dcfce7;color:#166534;">● Ativa no período</span>`;
    }
    if (status === "inactive") {
      return `<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;background:#f1f5f9;color:#64748b;">○ Inativa no período</span>`;
    }
    return "";
  };

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
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:6px;">
          <h2 style="font-size:16px;font-weight:700;color:#1e293b;margin:0;">${camp.name}</h2>
          ${deliveryBadge(camp.deliveryStatus ?? "unknown")}
        </div>
        <span style="font-size:12px;color:#64748b;background:#f1f5f9;padding:2px 8px;border-radius:4px;">${camp.objective}</span>
        ${camp.hasDataQualityWarning ? `<div style="margin-top:8px;padding:8px 12px;background:#fef9c3;border:1px solid #fde047;border-radius:4px;font-size:12px;color:#854d0e;">⚠️ Algumas métricas podem estar imprecisas devido à qualidade da imagem.</div>` : ""}
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

  const highlightsHtml = report.strategicSummary.highlights.length > 0
    ? `<div style="margin-bottom:16px;">
        <p style="font-size:12px;font-weight:700;color:#166534;margin:0 0 8px 0;text-transform:uppercase;letter-spacing:0.05em;">✅ Destaques Positivos</p>
        <ul style="margin:0;padding-left:20px;">
          ${report.strategicSummary.highlights.map((h) => `<li style="font-size:13px;color:#374151;margin-bottom:4px;line-height:1.5;">${h}</li>`).join("")}
        </ul>
      </div>`
    : "";

  const attentionHtml = report.strategicSummary.attentionPoints.length > 0
    ? `<div style="margin-bottom:16px;">
        <p style="font-size:12px;font-weight:700;color:#92400e;margin:0 0 8px 0;text-transform:uppercase;letter-spacing:0.05em;">⚠️ Pontos de Atenção</p>
        <ul style="margin:0;padding-left:20px;">
          ${report.strategicSummary.attentionPoints.map((a) => `<li style="font-size:13px;color:#374151;margin-bottom:4px;line-height:1.5;">${a}</li>`).join("")}
        </ul>
      </div>`
    : "";

  const recommendationsHtml = report.recommendations.length > 0
    ? `<div style="margin-bottom:32px;padding:24px;border:1px solid #e5e7eb;border-radius:8px;page-break-inside:avoid;">
        <h2 style="font-size:15px;font-weight:700;color:#1e293b;margin:0 0 16px 0;">Recomendações</h2>
        <ol style="margin:0;padding-left:20px;">
          ${report.recommendations.map((r, i) => `<li style="font-size:13px;color:#374151;margin-bottom:8px;line-height:1.6;">${r}</li>`).join("")}
        </ol>
      </div>`
    : "";

  const contextWarningHtml = report.contextWarning
    ? `<div style="margin-bottom:24px;padding:12px 16px;background:#fef9c3;border:1px solid #fde047;border-radius:6px;">
        <p style="font-size:12px;color:#854d0e;margin:0;">⚠️ ${report.contextWarning}</p>
      </div>`
    : "";

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dashboard — ${report.clientName}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 0; background: #fff; color: #1e293b; }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <div style="max-width:900px;margin:0 auto;padding:40px 32px;">
    <!-- Cabeçalho -->
    <div style="border-bottom:3px solid #1e293b;padding-bottom:24px;margin-bottom:32px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px;">
        <div>
          <h1 style="font-size:24px;font-weight:800;color:#1e293b;margin:0 0 4px 0;">Dashboard de Performance</h1>
          <p style="font-size:16px;color:#64748b;margin:0;">${report.clientName}</p>
        </div>
        <div style="text-align:right;">
          <p style="font-size:13px;color:#64748b;margin:0 0 4px 0;">${report.platform}</p>
          <p style="font-size:13px;font-weight:600;color:#1e293b;margin:0;">${report.period}</p>
          <p style="font-size:12px;color:#94a3b8;margin:4px 0 0 0;">${report.mode === "COMPARATIVE" ? "Modo Comparativo" : "Período Único"}</p>
        </div>
      </div>
    </div>

    ${contextWarningHtml}
    ${urgentAlertsHtml}

    <!-- Resumo Estratégico -->
    <div style="margin-bottom:32px;padding:24px;background:#f8fafc;border-radius:8px;page-break-inside:avoid;">
      <h2 style="font-size:15px;font-weight:700;color:#1e293b;margin:0 0 20px 0;">Resumo Estratégico</h2>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:20px;">
        <div style="text-align:center;padding:16px;background:#fff;border-radius:6px;border:1px solid #e2e8f0;">
          <p style="font-size:11px;color:#64748b;margin:0 0 6px 0;text-transform:uppercase;letter-spacing:0.05em;">Investimento Total</p>
          <p style="font-size:20px;font-weight:700;color:#1e293b;margin:0;">${report.strategicSummary.totalInvested}</p>
        </div>
        <div style="text-align:center;padding:16px;background:#fff;border-radius:6px;border:1px solid #e2e8f0;">
          <p style="font-size:11px;color:#64748b;margin:0 0 6px 0;text-transform:uppercase;letter-spacing:0.05em;">Total de Resultados</p>
          <p style="font-size:20px;font-weight:700;color:#1e293b;margin:0;">${report.strategicSummary.totalResults}</p>
        </div>
        <div style="text-align:center;padding:16px;background:#fff;border-radius:6px;border:1px solid #e2e8f0;">
          <p style="font-size:11px;color:#64748b;margin:0 0 6px 0;text-transform:uppercase;letter-spacing:0.05em;">Custo por Resultado</p>
          <p style="font-size:20px;font-weight:700;color:#1e293b;margin:0;">${report.strategicSummary.avgCostPerResult}</p>
        </div>
      </div>
      ${highlightsHtml}
      ${attentionHtml}
      ${report.strategicSummary.contextNotes ? `<div style="padding:12px 16px;background:#eff6ff;border-left:3px solid #3b82f6;border-radius:0 6px 6px 0;"><p style="font-size:13px;color:#1e40af;margin:0;line-height:1.6;">${report.strategicSummary.contextNotes}</p></div>` : ""}
    </div>

    <!-- Análise por Campanha -->
    <div style="margin-bottom:32px;">
      <h2 style="font-size:15px;font-weight:700;color:#1e293b;margin:0 0 20px 0;">Análise por Campanha</h2>
      ${campaignsHtml}
    </div>

    ${recommendationsHtml}

    <!-- Rodapé -->
    <div style="border-top:1px solid #e2e8f0;padding-top:16px;margin-top:32px;">
      <p style="font-size:11px;color:#94a3b8;margin:0;text-align:center;">
        Relatório gerado automaticamente · ${report.clientName} · ${report.period}
      </p>
    </div>
  </div>
</body>
</html>`;
}

// ─── Upload do HTML como "PDF" para o S3 ─────────────────────────────────────

export async function generateAndUploadPdf(
  reportId: number,
  userId: string,
  html: string
): Promise<string> {
  const fileKey = `dashboard-builder/reports/${userId}/${reportId}-${Date.now()}.html`;
  const { url } = await storagePut(fileKey, Buffer.from(html, "utf-8"), "text/html");
  return url;
}
