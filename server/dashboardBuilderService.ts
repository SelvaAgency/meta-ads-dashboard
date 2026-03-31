/**
 * dashboardBuilderService.ts — Lógica de análise LLM para o Dashboard Builder de Tráfego Pago.
 * Módulo independente — não interfere com nenhuma funcionalidade existente.
 */
import { invokeLLM, extractTextContent } from "./_core/llm";
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
  highlights: string[];
  attentionPoints: string[];
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
    costPerResult: string;
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
  "period": "período extraído do print ou do contexto",
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
        }
      ],
      "analysis": "Análise técnica desta campanha específica com números.",
      "highlights": ["Destaque positivo específico DESTA campanha com número"],
      "attentionPoints": ["Ponto de atenção específico DESTA campanha com número"],
      "hasDataQualityWarning": false
    }
  ],
  "urgentAlerts": [],
  "strategicSummary": {
    "totalInvested": "R$ 4.250,00",
    "totalResults": "312 leads",
    "costPerResult": "R$ 13,62",
    "contextNotes": "Observações gerais sobre o contexto semanal"
  },
  "recommendations": [
    "Recomendação concreta e priorizada baseada nos dados"
  ],
  "contextWarning": null
}

REGRAS DE ESTRUTURA:
- Cada campanha DEVE ter seus próprios "highlights" e "attentionPoints" — arrays com insights específicos daquela campanha
- NÃO consolide highlights/attentionPoints num bloco geral — eles devem estar DENTRO de cada campanha
- O "strategicSummary" deve conter APENAS totais gerais (investimento total, resultado total somado, custo por resultado geral) e o contextNotes
- NÃO use média ponderada — some resultados e investimentos separadamente e divida para obter custo por resultado
- A "analysis" de cada campanha é um parágrafo de análise técnica
- Os "highlights" são os pontos positivos daquela campanha específica
- Os "attentionPoints" são os pontos de atenção/negativos daquela campanha específica
- urgentAlerts só deve ter itens se o contexto mencionar algo urgente. Se não, array vazio [].
- Inclua TODAS as campanhas visíveis, mesmo inativas.`;
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
        // Disable thinking: json_object mode conflicts with thinking in Gemini
        thinking: false,
        // Force JSON output to avoid markdown-wrapped responses
        responseFormat: { type: "json_object" },
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

  // Use extractTextContent to safely handle both string and array content
  // (Gemini with thinking enabled returns content as array of {type:"thinking"} + {type:"text"} parts)
  const rawContent = extractTextContent(response);

  if (!rawContent) {
    throw new Error("LLM não retornou conteúdo. Tente novamente.");
  }

  // Clean possible markdown wrappers (```json ... ``` or ``` ... ```)
  let cleanContent = rawContent.trim();
  if (cleanContent.startsWith("```")) {
    cleanContent = cleanContent.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  }

  // Try direct parse first (most reliable with json_object mode)
  let parsed: DashboardReportData;
  try {
    parsed = JSON.parse(cleanContent) as DashboardReportData;
  } catch {
    // Fallback: extract JSON via regex (handles extra text before/after JSON)
    const jsonMatch = cleanContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("[DashboardBuilder] LLM raw response:", rawContent.slice(0, 1000));
      throw new Error("LLM não retornou JSON válido. Tente novamente com um print mais nítido.");
    }
    try {
      parsed = JSON.parse(jsonMatch[0]) as DashboardReportData;
    } catch (e) {
      console.error("[DashboardBuilder] JSON parse error:", e, "Raw:", jsonMatch[0].slice(0, 500));
      throw new Error("Erro ao interpretar resposta da IA. Tente novamente.");
    }
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
  const colorMap = { green: "#4ade80", red: "#f87171", gray: "#94a3b8" };
  const arrowMap = { green: "↑", red: "↓", gray: "→" };

  const deliveryBadge = (status: string) => {
    if (status === "active") {
      return '<span style="display:inline-block;padding:2px 10px;border-radius:12px;font-size:11px;font-weight:600;background:rgba(74,222,128,0.15);color:#4ade80;">● Ativa</span>';
    }
    if (status === "inactive") {
      return '<span style="display:inline-block;padding:2px 10px;border-radius:12px;font-size:11px;font-weight:600;background:rgba(148,163,184,0.15);color:#94a3b8;">○ Inativa</span>';
    }
    return "";
  };

  const formatChangePercent = (metric: CampaignMetric) => {
    if (metric.changePercent === undefined || metric.changePercent === null) return "";
    const sign = metric.changePercent >= 0 ? "+" : "";
    const color = colorMap[metric.indicatorColor];
    const arrow = arrowMap[metric.indicatorColor];
    return `<span style="color:${color};font-weight:600;font-size:13px;">${arrow} ${sign}${metric.changePercent.toFixed(1)}%</span>`;
  };

  const campaignsHtml = report.campaigns
    .map(
      (camp) => `
    <div style="margin-bottom:32px;padding:24px;background:#1e293b;border:1px solid #334155;border-radius:12px;page-break-inside:avoid;">
      <!-- Header da campanha -->
      <div style="border-bottom:1px solid #334155;padding-bottom:12px;margin-bottom:20px;">
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:6px;">
          <h2 style="font-size:16px;font-weight:700;color:#f1f5f9;margin:0;">${camp.name}</h2>
          ${deliveryBadge(camp.deliveryStatus ?? "unknown")}
        </div>
        <span style="font-size:11px;color:#94a3b8;background:#0f172a;padding:3px 10px;border-radius:6px;">${camp.objective}</span>
        ${camp.hasDataQualityWarning ? '<div style="margin-top:8px;padding:8px 12px;background:rgba(250,204,21,0.1);border:1px solid rgba(250,204,21,0.3);border-radius:6px;font-size:12px;color:#fbbf24;">⚠️ Algumas métricas podem estar imprecisas.</div>' : ""}
      </div>

      <!-- Tabela de métricas -->
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
        <thead>
          <tr>
            <th style="text-align:left;padding:8px 12px;font-size:11px;color:#64748b;font-weight:600;border-bottom:1px solid #334155;text-transform:uppercase;letter-spacing:0.05em;">Métrica</th>
            <th style="text-align:right;padding:8px 12px;font-size:11px;color:#64748b;font-weight:600;border-bottom:1px solid #334155;text-transform:uppercase;letter-spacing:0.05em;">${report.mode === "COMPARATIVE" ? "Atual" : "Valor"}</th>
            ${report.mode === "COMPARATIVE" ? '<th style="text-align:right;padding:8px 12px;font-size:11px;color:#64748b;font-weight:600;border-bottom:1px solid #334155;text-transform:uppercase;letter-spacing:0.05em;">Anterior</th><th style="text-align:right;padding:8px 12px;font-size:11px;color:#64748b;font-weight:600;border-bottom:1px solid #334155;text-transform:uppercase;letter-spacing:0.05em;">Variação</th>' : ""}
          </tr>
        </thead>
        <tbody>
          ${camp.metrics
            .map(
              (m: CampaignMetric, i: number) => `
            <tr style="background:${i % 2 === 0 ? "transparent" : "rgba(15,23,42,0.5)"}">
              <td style="padding:8px 12px;font-size:13px;color:#cbd5e1;border-bottom:1px solid #1e293b;">${m.name}</td>
              <td style="padding:8px 12px;font-size:13px;font-weight:600;color:#f1f5f9;text-align:right;border-bottom:1px solid #1e293b;">${m.currentValue}</td>
              ${
                report.mode === "COMPARATIVE"
                  ? `<td style="padding:8px 12px;font-size:13px;color:#64748b;text-align:right;border-bottom:1px solid #1e293b;">${m.previousValue ?? "—"}</td>
                     <td style="padding:8px 12px;text-align:right;border-bottom:1px solid #1e293b;">${formatChangePercent(m)}</td>`
                  : ""
              }
            </tr>`
            )
            .join("")}
        </tbody>
      </table>

      <!-- Análise da campanha -->
      <div style="background:#0f172a;border-left:3px solid #3b82f6;padding:14px 16px;border-radius:0 8px 8px 0;margin-bottom:16px;">
        <p style="font-size:11px;font-weight:700;color:#60a5fa;margin:0 0 6px 0;text-transform:uppercase;letter-spacing:0.05em;">Análise</p>
        <p style="font-size:13px;color:#cbd5e1;line-height:1.6;margin:0;">${camp.analysis}</p>
      </div>

      <!-- Destaques e Atenção POR CAMPANHA -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        ${(camp.highlights && camp.highlights.length > 0) ? `
        <div style="padding:12px 14px;background:rgba(74,222,128,0.08);border:1px solid rgba(74,222,128,0.2);border-radius:8px;">
          <p style="font-size:11px;font-weight:700;color:#4ade80;margin:0 0 8px 0;text-transform:uppercase;letter-spacing:0.05em;">✅ Destaques</p>
          <ul style="margin:0;padding-left:16px;">
            ${camp.highlights.map((h: string) => `<li style="font-size:12px;color:#cbd5e1;margin-bottom:4px;line-height:1.5;">${h}</li>`).join("")}
          </ul>
        </div>` : ""}
        ${(camp.attentionPoints && camp.attentionPoints.length > 0) ? `
        <div style="padding:12px 14px;background:rgba(248,113,113,0.08);border:1px solid rgba(248,113,113,0.2);border-radius:8px;">
          <p style="font-size:11px;font-weight:700;color:#f87171;margin:0 0 8px 0;text-transform:uppercase;letter-spacing:0.05em;">⚠️ Atenção</p>
          <ul style="margin:0;padding-left:16px;">
            ${camp.attentionPoints.map((a: string) => `<li style="font-size:12px;color:#cbd5e1;margin-bottom:4px;line-height:1.5;">${a}</li>`).join("")}
          </ul>
        </div>` : ""}
      </div>
    </div>`
    )
    .join("");

  const urgentAlertsHtml =
    report.urgentAlerts && report.urgentAlerts.length > 0
      ? `<div style="margin-bottom:32px;padding:20px;background:rgba(248,113,113,0.1);border:1px solid rgba(248,113,113,0.3);border-radius:12px;page-break-inside:avoid;">
          <h2 style="font-size:15px;font-weight:700;color:#fca5a5;margin:0 0 12px 0;">⚠️ Alertas e Ações Urgentes</h2>
          <ul style="margin:0;padding-left:20px;">
            ${report.urgentAlerts.map((a) => `<li style="font-size:13px;color:#fca5a5;margin-bottom:6px;line-height:1.5;">${a}</li>`).join("")}
          </ul>
        </div>`
      : "";

  const recommendationsHtml = report.recommendations.length > 0
    ? `<div style="margin-bottom:32px;padding:24px;background:#1e293b;border:1px solid #334155;border-radius:12px;page-break-inside:avoid;">
        <h2 style="font-size:15px;font-weight:700;color:#f1f5f9;margin:0 0 16px 0;">Recomendações e Próximos Passos</h2>
        <ol style="margin:0;padding-left:20px;">
          ${report.recommendations.map((r) => `<li style="font-size:13px;color:#cbd5e1;margin-bottom:8px;line-height:1.6;">${r}</li>`).join("")}
        </ol>
      </div>`
    : "";

  const contextWarningHtml = report.contextWarning
    ? `<div style="margin-bottom:24px;padding:12px 16px;background:rgba(250,204,21,0.1);border:1px solid rgba(250,204,21,0.3);border-radius:8px;">
        <p style="font-size:12px;color:#fbbf24;margin:0;">⚠️ ${report.contextWarning}</p>
      </div>`
    : "";

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dashboard — ${report.clientName}</title>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; }
    html, body { 
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; 
      margin: 0; 
      padding: 0; 
      background: #0f172a; 
      color: #e2e8f0;
      line-height: 1.5;
    }
    @media print {
      html, body { 
        -webkit-print-color-adjust: exact; 
        print-color-adjust: exact; 
        background: #0f172a;
      }
      .no-print { display: none !important; }
      .campaign-card { page-break-inside: avoid; }
      .summary-card { page-break-inside: avoid; }
      .recommendations-section { page-break-inside: avoid; }
      table { page-break-inside: avoid; }
      .kpi-card { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
      .badge { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
      .variation-badge { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div style="max-width:900px;margin:0 auto;padding:40px 32px;">
    <!-- Cabeçalho Premium -->
    <div style="border-bottom:2px solid #334155;padding-bottom:24px;margin-bottom:32px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px;">
        <div>
          <h1 style="font-size:28px;font-weight:800;color:#f1f5f9;margin:0 0 8px 0;letter-spacing:-0.02em;">Dashboard de Performance</h1>
          <p style="font-size:16px;color:#64748b;margin:0;font-weight:500;">${report.clientName}</p>
        </div>
        <div style="text-align:right;">
          <p style="font-size:13px;color:#64748b;margin:0 0 4px 0;">${report.platform}</p>
          <p style="font-size:14px;font-weight:700;color:#f1f5f9;margin:0;">${report.period}</p>
          <p style="font-size:12px;color:#475569;margin:4px 0 0 0;">${report.mode === "COMPARATIVE" ? "Modo Comparativo" : "Período Único"}</p>
        </div>
      </div>
    </div>

    ${contextWarningHtml}
    ${urgentAlertsHtml}

    <!-- Visão Geral com KPI Cards Coloridos -->
    <div class="summary-card" style="margin-bottom:32px;">
      <h2 style="font-size:16px;font-weight:700;color:#f1f5f9;margin:0 0 20px 0;letter-spacing:-0.01em;">Visão Geral</h2>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:${report.strategicSummary.contextNotes ? "20px" : "0"};">
        <!-- Investimento (Roxo) -->
        <div class="kpi-card" style="padding:20px;background:linear-gradient(135deg,rgba(139,92,246,0.1),rgba(109,40,217,0.05));border:1px solid rgba(139,92,246,0.3);border-radius:12px;">
          <p style="font-size:11px;color:#c4b5fd;margin:0 0 8px 0;text-transform:uppercase;letter-spacing:0.05em;font-weight:600;">💰 Investimento Total</p>
          <p style="font-size:24px;font-weight:800;color:#e9d5ff;margin:0;letter-spacing:-0.02em;">${report.strategicSummary.totalInvested}</p>
        </div>
        <!-- Resultados (Verde) -->
        <div class="kpi-card" style="padding:20px;background:linear-gradient(135deg,rgba(34,197,94,0.1),rgba(22,163,74,0.05));border:1px solid rgba(34,197,94,0.3);border-radius:12px;">
          <p style="font-size:11px;color:#86efac;margin:0 0 8px 0;text-transform:uppercase;letter-spacing:0.05em;font-weight:600;">📊 Total de Resultados</p>
          <p style="font-size:24px;font-weight:800;color:#dcfce7;margin:0;letter-spacing:-0.02em;">${report.strategicSummary.totalResults}</p>
        </div>
        <!-- Custo (Âmbar) -->
        <div class="kpi-card" style="padding:20px;background:linear-gradient(135deg,rgba(217,119,6,0.1),rgba(180,83,9,0.05));border:1px solid rgba(217,119,6,0.3);border-radius:12px;">
          <p style="font-size:11px;color:#fcd34d;margin:0 0 8px 0;text-transform:uppercase;letter-spacing:0.05em;font-weight:600;">💵 Custo por Resultado</p>
          <p style="font-size:24px;font-weight:800;color:#fef3c7;margin:0;letter-spacing:-0.02em;">${report.strategicSummary.costPerResult}</p>
        </div>
      </div>
      ${report.strategicSummary.contextNotes ? `<div style="padding:14px 16px;background:rgba(59,130,246,0.1);border-left:3px solid #3b82f6;border-radius:0 8px 8px 0;print-color-adjust:exact;-webkit-print-color-adjust:exact;"><p style="font-size:13px;color:#93c5fd;margin:0;line-height:1.6;">${report.strategicSummary.contextNotes}</p></div>` : ""}
    </div>

    <!-- Campanhas com Numeração Visual -->
    ${report.campaigns
      .map(
        (camp, idx) => `
    <div class="campaign-card" style="margin-bottom:32px;padding:24px;background:#1e293b;border:1px solid #334155;border-radius:12px;">
      <!-- Header com Numeração -->
      <div style="display:flex;align-items:flex-start;gap:16px;margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid #334155;">
        <div class="kpi-card" style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#8b5cf6,#6d28d9);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          <span style="font-size:18px;font-weight:800;color:#f1f5f9;">${idx + 1}</span>
        </div>
        <div style="flex:1;">
          <h2 style="font-size:18px;font-weight:700;color:#f1f5f9;margin:0 0 6px 0;">${camp.name}</h2>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
            <span class="badge" style="display:inline-block;padding:4px 12px;border-radius:12px;font-size:11px;font-weight:600;background:${camp.deliveryStatus === "active" ? "rgba(74,222,128,0.15)" : "rgba(148,163,184,0.15)"};color:${camp.deliveryStatus === "active" ? "#4ade80" : "#94a3b8"};">${camp.deliveryStatus === "active" ? "● Ativa" : "○ Inativa"}</span>
            <span style="font-size:11px;color:#94a3b8;background:#0f172a;padding:4px 10px;border-radius:6px;">${camp.objective}</span>
          </div>
          ${camp.hasDataQualityWarning ? '<div style="margin-top:8px;padding:8px 12px;background:rgba(250,204,21,0.1);border:1px solid rgba(250,204,21,0.3);border-radius:6px;font-size:12px;color:#fbbf24;print-color-adjust:exact;-webkit-print-color-adjust:exact;">⚠️ Algumas métricas podem estar imprecisas.</div>' : ""}
        </div>
      </div>

      <!-- Tabela com Zebra Stripes -->
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px;border-radius:8px;overflow:hidden;">
        <thead>
          <tr style="background:#0f172a;">
            <th style="text-align:left;padding:12px 14px;font-size:11px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid #334155;">Métrica</th>
            <th style="text-align:right;padding:12px 14px;font-size:11px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid #334155;">${report.mode === "COMPARATIVE" ? "Atual" : "Valor"}</th>
            ${report.mode === "COMPARATIVE" ? '<th style="text-align:right;padding:12px 14px;font-size:11px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid #334155;">Anterior</th><th style="text-align:right;padding:12px 14px;font-size:11px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid #334155;">Variação</th>' : ""}
          </tr>
        </thead>
        <tbody>
          ${camp.metrics
            .map(
              (m: CampaignMetric, i: number) => {
                const isEven = i % 2 === 0;
                const changeColor = m.indicatorColor === "green" ? "#4ade80" : m.indicatorColor === "red" ? "#f87171" : "#94a3b8";
                const changeBg = m.indicatorColor === "green" ? "rgba(74,222,128,0.1)" : m.indicatorColor === "red" ? "rgba(248,113,113,0.1)" : "rgba(148,163,184,0.1)";
                const changeArrow = m.indicatorColor === "green" ? "↑" : m.indicatorColor === "red" ? "↓" : "→";
                const changeSign = m.changePercent !== undefined && m.changePercent !== null && m.changePercent >= 0 ? "+" : "";
                return `
            <tr style="background:${isEven ? "#1e293b" : "rgba(15,23,42,0.5)"};print-color-adjust:exact;-webkit-print-color-adjust:exact;">
              <td style="padding:12px 14px;font-size:13px;color:#cbd5e1;border-bottom:1px solid #334155;font-weight:500;">${m.name}</td>
              <td style="padding:12px 14px;font-size:13px;font-weight:700;color:#f1f5f9;text-align:right;border-bottom:1px solid #334155;">${m.currentValue}</td>
              ${report.mode === "COMPARATIVE" ? `
              <td style="padding:12px 14px;font-size:13px;color:#64748b;text-align:right;border-bottom:1px solid #334155;">${m.previousValue ?? "—"}</td>
              <td style="padding:12px 14px;text-align:right;border-bottom:1px solid #334155;">
                ${m.changePercent !== undefined && m.changePercent !== null ? `<span class="variation-badge" style="display:inline-block;padding:4px 8px;border-radius:6px;background:${changeBg};color:${changeColor};font-weight:600;font-size:12px;border:1px solid ${changeColor}33;">${changeArrow} ${changeSign}${m.changePercent.toFixed(1)}%</span>` : "—"}
              </td>` : ""}
            </tr>`;
              }
            )
            .join("")}
        </tbody>
      </table>

      <!-- Análise -->
      <div style="background:#0f172a;border-left:3px solid #3b82f6;padding:14px 16px;border-radius:0 8px 8px 0;margin-bottom:16px;">
        <p style="font-size:11px;font-weight:700;color:#60a5fa;margin:0 0 6px 0;text-transform:uppercase;letter-spacing:0.05em;">📋 Análise</p>
        <p style="font-size:13px;color:#cbd5e1;line-height:1.6;margin:0;">${camp.analysis}</p>
      </div>

      <!-- Destaques e Atenção -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        ${camp.highlights && camp.highlights.length > 0 ? `
        <div style="padding:14px 16px;background:rgba(74,222,128,0.08);border:1px solid rgba(74,222,128,0.3);border-radius:8px;print-color-adjust:exact;-webkit-print-color-adjust:exact;">
          <p style="font-size:11px;font-weight:700;color:#4ade80;margin:0 0 10px 0;text-transform:uppercase;letter-spacing:0.05em;">✅ Destaques</p>
          <ul style="margin:0;padding-left:18px;">
            ${camp.highlights.map((h: string) => `<li style="font-size:12px;color:#cbd5e1;margin-bottom:5px;line-height:1.5;">${h}</li>`).join("")}
          </ul>
        </div>` : ""}
        ${camp.attentionPoints && camp.attentionPoints.length > 0 ? `
        <div style="padding:14px 16px;background:rgba(248,113,113,0.08);border:1px solid rgba(248,113,113,0.3);border-radius:8px;print-color-adjust:exact;-webkit-print-color-adjust:exact;">
          <p style="font-size:11px;font-weight:700;color:#f87171;margin:0 0 10px 0;text-transform:uppercase;letter-spacing:0.05em;">⚠️ Atenção</p>
          <ul style="margin:0;padding-left:18px;">
            ${camp.attentionPoints.map((a: string) => `<li style="font-size:12px;color:#cbd5e1;margin-bottom:5px;line-height:1.5;">${a}</li>`).join("")}
          </ul>
        </div>` : ""}
      </div>
    </div>`
      )
      .join("")}

    <!-- Recomendações em Fundo Dark -->
    ${report.recommendations.length > 0 ? `
    <div class="recommendations-section" style="margin-bottom:32px;padding:28px;background:#0f172a;border:1px solid #334155;border-radius:12px;">
      <h2 style="font-size:16px;font-weight:700;color:#f1f5f9;margin:0 0 18px 0;letter-spacing:-0.01em;">💡 Recomendações e Próximos Passos</h2>
      <ol style="margin:0;padding-left:24px;">
        ${report.recommendations.map((r) => `<li style="font-size:13px;color:#cbd5e1;margin-bottom:10px;line-height:1.6;">${r}</li>`).join("")}
      </ol>
    </div>` : ""}

    <!-- Rodapé -->
    <div style="border-top:1px solid #334155;padding-top:16px;margin-top:32px;">
      <p style="font-size:11px;color:#475569;margin:0;text-align:center;">
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
