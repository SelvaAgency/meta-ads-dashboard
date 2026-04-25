/**
 * dailyReport.ts — Report diário automático de performance Meta Ads.
 * Usa APENAS notifyOwner() do Manus para enviar relatórios.
 */

import cron from "node-cron";
import { notifyOwner } from "./_core/notification";
import {
  getAllActiveMetaAdAccounts,
  getCampaignsByAccountId,
} from "./db";
import {
  getCampaignInsights,
  extractConversions,
  extractConversionValue,
  buildCampaignGoalMap,
  getResultLabel,
  validateToken,
} from "./metaAdsService";

// ── Types ───────────────────────────────────────────────────────────────────

interface AccountDayMetrics {
  accountName: string;
  accountId: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
  conversions: number;
  conversionValue: number;
  roas: number;
  cpa: number;
  activeCampaigns: number;
}

interface ReportPayload {
  subject: string;
  content: string;
  date: string;
  accountCount: number;
  totalSpend: number;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function yesterday(): { start: string; end: string; label: string } {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const iso = d.toISOString().slice(0, 10);
  const label = d.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  });
  return { start: iso, end: iso, label };
}

function fmt(n: number): string {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtInt(n: number): string {
  return Math.round(n).toLocaleString("pt-BR");
}

function fmtPct(n: number): string {
  return n.toFixed(2) + "%";
}

function fmtCurrency(n: number): string {
  return "R$ " + fmt(n);
}

// ── Fetch data ──────────────────────────────────────────────────────────────

async function fetchAccountMetrics(
  account: { id: number; accountId: string; accessToken: string; accountName: string | null },
  startDate: string,
  endDate: string
): Promise<AccountDayMetrics | null> {
  try {
    const token = account.accessToken;
    if (!token) return null;

    const isValid = await validateToken(token);
    if (!isValid) return null;

    const campaigns = await getCampaignsByAccountId(account.accountId, token);
    if (!campaigns || campaigns.length === 0) return null;

    const insights = [];
    for (let i = 0; i < campaigns.length; i += 3) {
      const batch = campaigns.slice(i, i + 3);
      const batchInsights = await Promise.all(
        batch.map((c) =>
          getCampaignInsights(account.accountId, c.id, token, startDate, endDate).catch(
            () => null
          )
        )
      );
      insights.push(...batchInsights.filter((i) => i !== null));
      if (i + 3 < campaigns.length) await new Promise((r) => setTimeout(r, 100));
    }

    if (insights.length === 0) return null;

    let totalSpend = 0,
      totalImpressions = 0,
      totalClicks = 0,
      totalConversions = 0,
      totalConversionValue = 0;

    for (const insight of insights) {
      totalSpend += insight.spend || 0;
      totalImpressions += insight.impressions || 0;
      totalClicks += insight.clicks || 0;
      totalConversions += extractConversions(insight) || 0;
      totalConversionValue += extractConversionValue(insight) || 0;
    }

    const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
    const cpc = totalClicks > 0 ? totalSpend / totalClicks : 0;
    const cpm = totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000 : 0;
    const roas = totalSpend > 0 ? totalConversionValue / totalSpend : 0;
    const cpa = totalConversions > 0 ? totalSpend / totalConversions : 0;

    return {
      accountName: account.accountName || account.accountId,
      accountId: account.accountId,
      spend: totalSpend,
      impressions: totalImpressions,
      clicks: totalClicks,
      ctr,
      cpc,
      cpm,
      conversions: totalConversions,
      conversionValue: totalConversionValue,
      roas,
      cpa,
      activeCampaigns: campaigns.length,
    };
  } catch (error) {
    console.error(`[DailyReport] Erro ao buscar métricas para ${account.accountId}:`, error);
    return null;
  }
}

// ── Generate Report Content ──────────────────────────────────────────────────

function generatePerformanceAnalysis(metrics: AccountDayMetrics): string {
  const roasStatus = metrics.roas >= 3 ? "excelente" : metrics.roas >= 2 ? "boa" : "abaixo do esperado";
  const ctrStatus = metrics.ctr >= 1 ? "forte" : "moderada";
  const recommendation =
    metrics.roas >= 3
      ? "Recomenda-se manter ou aumentar o orçamento."
      : metrics.roas >= 1
        ? "Considere otimizar criativos e públicos."
        : "Análise urgente necessária - revisar segmentação e criativos.";

  return `${metrics.accountName}: ROAS ${metrics.roas.toFixed(2)}x | Invest. ${fmtCurrency(metrics.spend)} | Receita ${fmtCurrency(metrics.conversionValue)} | CTR ${fmtPct(metrics.ctr)} (${ctrStatus}) | ${recommendation}`;
}

function generateReportContent(accounts: AccountDayMetrics[], date: string): string {
  const totalSpend = accounts.reduce((s, a) => s + a.spend, 0);
  const totalConversions = accounts.reduce((s, a) => s + a.conversions, 0);
  const totalConversionValue = accounts.reduce((s, a) => s + a.conversionValue, 0);
  const avgRoas = totalSpend > 0 ? totalConversionValue / totalSpend : 0;

  let content = `
╔════════════════════════════════════════════════════════════════╗
║           SELVA AGENCY - REPORT DIÁRIO META ADS                ║
║                                                                ║
║                        ${date}                         ║
╚════════════════════════════════════════════════════════════════╝

📊 RESUMO EXECUTIVO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💰 Investimento Total:     ${fmtCurrency(totalSpend)}
📈 ROAS Médio:             ${avgRoas.toFixed(2)}x
✅ Conversões:             ${fmtInt(totalConversions)}
💵 Receita Gerada:         ${fmtCurrency(totalConversionValue)}
📊 Contas Ativas:          ${accounts.length}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📌 PERFORMANCE POR CONTA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

`;

  for (const a of accounts) {
    content += `
${a.accountName}
├─ Investimento:    ${fmtCurrency(a.spend)}
├─ Conversões:      ${fmtInt(a.conversions)}
├─ Receita:         ${fmtCurrency(a.conversionValue)}
├─ ROAS:            ${a.roas.toFixed(2)}x
├─ CTR:             ${fmtPct(a.ctr)}
├─ CPC:             ${fmtCurrency(a.cpc)}
├─ CPM:             ${fmtCurrency(a.cpm)}
├─ Impressões:      ${fmtInt(a.impressions)}
└─ Cliques:         ${fmtInt(a.clicks)}

`;
  }

  content += `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔍 ANÁLISE DE PERFORMANCE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

`;

  for (const a of accounts) {
    content += `\n${generatePerformanceAnalysis(a)}\n`;
  }

  content += `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Report gerado automaticamente às 8h BRT (11:00 UTC)
SELVA Agency - Dashboard Meta Ads
Dados referentes ao dia anterior (ontem)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;

  return content;
}

// ── Main functions ──────────────────────────────────────────────────────────

export async function generateReportPayload(): Promise<ReportPayload | null> {
  try {
    const { start, end, label } = yesterday();
    const accounts = await getAllActiveMetaAdAccounts();

    if (!accounts || accounts.length === 0) {
      console.log("[DailyReport] Nenhuma conta ativa encontrada");
      return null;
    }

    const metrics: AccountDayMetrics[] = [];
    for (const account of accounts) {
      const m = await fetchAccountMetrics(account, start, end);
      if (m) metrics.push(m);
    }

    if (metrics.length === 0) {
      console.log("[DailyReport] Nenhuma métrica disponível para ontem");
      return null;
    }

    metrics.sort((a, b) => b.spend - a.spend);

    const totalSpend = metrics.reduce((s, a) => s + a.spend, 0);
    const dateStr = new Date().toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: "America/Sao_Paulo",
    });

    return {
      subject: `[SELVA] Report Diário Meta Ads — ${dateStr}`,
      content: generateReportContent(metrics, label),
      date: start,
      accountCount: metrics.length,
      totalSpend,
    };
  } catch (error) {
    console.error("[DailyReport] Erro ao gerar payload:", error);
    return null;
  }
}

export async function runDailyReport(): Promise<boolean> {
  try {
    const payload = await generateReportPayload();
    if (!payload) {
      console.log("[DailyReport] Nenhum dado disponível para enviar");
      return false;
    }

    console.log(`[DailyReport] Enviando notificação para owner...`);

    const success = await notifyOwner({
      title: payload.subject,
      content: payload.content,
    });

    if (success) {
      console.log(`[DailyReport] ✓ Notificação enviada com sucesso`);
    } else {
      console.warn(`[DailyReport] ⚠️ Falha ao enviar notificação (serviço indisponível)`);
    }

    return success;
  } catch (error) {
    console.error("[DailyReport] Erro ao executar report:", error);
    return false;
  }
}

// ── Cron job ────────────────────────────────────────────────────────────────

export function initializeDailyReportSchedule(): void {
  const schedule = "0 11 * * *";

  cron.schedule(schedule, async () => {
    console.log("[DailyReport] ⏰ Executando report diário agendado...");
    await runDailyReport();
  });

  console.log("[DailyReport] ✓ Agendado para 8h BRT (11:00 UTC) diariamente");
}
