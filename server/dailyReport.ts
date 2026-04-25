/**
 * dailyReport.ts — Report diário automático de performance Meta Ads.
 *
 * Envia email às 8h BRT (11:00 UTC) com métricas do dia anterior
 * para victor@selva.agency via Resend API.
 * Fallback: notificação Manus se Resend falhar.
 */

import cron from "node-cron";
import { Resend } from "resend";
import { notifyOwner } from "./_core/notification";
import { ENV } from "./_core/env";
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

// ── Config ──────────────────────────────────────────────────────────────────

const RECIPIENTS = ["victor@selva.agency"];
const FROM_EMAIL = "dashboard@selva.agency";
const FROM_NAME = "SELVA Agency Reports";

let resend: Resend | null = null;

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
  reach: number;
  activeCampaigns: number;
  objectiveLabel: string;
}

interface ReportPayload {
  subject: string;
  html: string;
  plainText: string;
  date: string;
  accountCount: number;
  totalSpend: number;
}

// ── Initialize Resend ───────────────────────────────────────────────────────

function initializeResend(): Resend | null {
  if (resend) return resend;

  if (!ENV.resendApiKey) {
    console.warn("[DailyReport] ⚠️ RESEND_API_KEY não configurada");
    return null;
  }

  resend = new Resend(ENV.resendApiKey);
  console.log("[DailyReport] ✓ Resend inicializado");
  return resend;
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

    const goalMap = buildCampaignGoalMap(campaigns);
    const objectiveLabel = getResultLabel(Object.values(goalMap)[0] || "LINK_CLICKS");

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
      reach: 0,
      activeCampaigns: campaigns.length,
      objectiveLabel,
    };
  } catch (error) {
    console.error(`[DailyReport] Erro ao buscar métricas para ${account.accountId}:`, error);
    return null;
  }
}

// ── Generate HTML ───────────────────────────────────────────────────────────

function generatePerformanceAnalysis(metrics: AccountDayMetrics): string {
  const roasStatus = metrics.roas >= 3 ? "excelente" : metrics.roas >= 2 ? "boa" : "abaixo do esperado";
  const ctrStatus = metrics.ctr >= 1 ? "forte" : "moderada";
  const recommendation =
    metrics.roas >= 3
      ? "Recomenda-se manter ou aumentar o orçamento."
      : metrics.roas >= 1
        ? "Considere otimizar criativos e públicos."
        : "Análise urgente necessária - revisar segmentação e criativos.";

  return `A conta ${metrics.accountName} teve ROAS de ${metrics.roas.toFixed(2)}x ontem com ${fmtCurrency(metrics.spend)} investidos, gerando ${fmtCurrency(metrics.conversionValue)} em receita. Performance ${roasStatus} com taxa de cliques ${ctrStatus} (${fmtPct(metrics.ctr)}). ${recommendation}`;
}

function generateHTMLReport(accounts: AccountDayMetrics[], date: string): string {
  const totalSpend = accounts.reduce((s, a) => s + a.spend, 0);
  const totalConversions = accounts.reduce((s, a) => s + a.conversions, 0);
  const totalConversionValue = accounts.reduce((s, a) => s + a.conversionValue, 0);
  const avgRoas = totalSpend > 0 ? totalConversionValue / totalSpend : 0;

  const accountRows = accounts
    .map(
      (a) => `
    <tr style="border-bottom: 1px solid #eeeeee;">
      <td style="padding: 12px; color: #1a1a2e; font-weight: 500;">${a.accountName}</td>
      <td style="padding: 12px; color: #1a1a2e; text-align: right;">${fmtCurrency(a.spend)}</td>
      <td style="padding: 12px; color: #1a1a2e; text-align: right;">${fmtInt(a.conversions)}</td>
      <td style="padding: 12px; color: #1a1a2e; text-align: right;">${fmtCurrency(a.conversionValue)}</td>
      <td style="padding: 12px; color: #1a1a2e; text-align: right;">${a.roas.toFixed(2)}x</td>
      <td style="padding: 12px; color: #1a1a2e; text-align: right;">${fmtPct(a.ctr)}</td>
      <td style="padding: 12px; color: #1a1a2e; text-align: right;">${fmtInt(a.impressions)}</td>
    </tr>
  `
    )
    .join("");

  const analysisRows = accounts
    .map(
      (a) => `
    <div style="margin-bottom: 16px; padding: 12px; background: #ffffff; border-left: 4px solid #c9a96e; border-radius: 4px;">
      <p style="margin: 0; color: #1a1a2e; font-size: 14px; line-height: 1.6;">
        ${generatePerformanceAnalysis(a)}
      </p>
    </div>
  `
    )
    .join("");

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Report Diário Meta Ads</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f0e8;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
    <div style="background-color: #1a1a2e; padding: 24px; text-align: center; border-bottom: 4px solid #c9a96e;">
      <h1 style="margin: 0; color: #e8d5b7; font-size: 24px; font-weight: 700;">SELVA AGENCY</h1>
      <p style="margin: 8px 0 0 0; color: #c9a96e; font-size: 14px; font-weight: 500;">📊 Report Diário Meta Ads</p>
      <p style="margin: 4px 0 0 0; color: #888888; font-size: 12px;">${date}</p>
    </div>

    <div style="padding: 24px; background-color: #fdf0f0;">
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
        <div style="background: #ffffff; padding: 12px; border-radius: 4px; border-left: 4px solid #c9a96e;">
          <p style="margin: 0; color: #888888; font-size: 12px; font-weight: 500; text-transform: uppercase;">Investimento Total</p>
          <p style="margin: 4px 0 0 0; color: #1a1a2e; font-size: 18px; font-weight: 700;">${fmtCurrency(totalSpend)}</p>
        </div>
        <div style="background: #ffffff; padding: 12px; border-radius: 4px; border-left: 4px solid #c9a96e;">
          <p style="margin: 0; color: #888888; font-size: 12px; font-weight: 500; text-transform: uppercase;">ROAS Médio</p>
          <p style="margin: 4px 0 0 0; color: #1a1a2e; font-size: 18px; font-weight: 700;">${avgRoas.toFixed(2)}x</p>
        </div>
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
        <div style="background: #ffffff; padding: 12px; border-radius: 4px; border-left: 4px solid #c9a96e;">
          <p style="margin: 0; color: #888888; font-size: 12px; font-weight: 500; text-transform: uppercase;">Conversões</p>
          <p style="margin: 4px 0 0 0; color: #1a1a2e; font-size: 18px; font-weight: 700;">${fmtInt(totalConversions)}</p>
        </div>
        <div style="background: #ffffff; padding: 12px; border-radius: 4px; border-left: 4px solid #c9a96e;">
          <p style="margin: 0; color: #888888; font-size: 12px; font-weight: 500; text-transform: uppercase;">Receita</p>
          <p style="margin: 4px 0 0 0; color: #1a1a2e; font-size: 18px; font-weight: 700;">${fmtCurrency(totalConversionValue)}</p>
        </div>
      </div>
    </div>

    <div style="padding: 24px;">
      <h2 style="margin: 0 0 16px 0; color: #1a1a2e; font-size: 16px; font-weight: 700;">Performance por Conta</h2>
      <table style="width: 100%; border-collapse: collapse; background: #ffffff; border: 1px solid #eeeeee; border-radius: 4px; overflow: hidden;">
        <thead>
          <tr style="background-color: #f5f0e8; border-bottom: 2px solid #c9a96e;">
            <th style="padding: 12px; text-align: left; color: #1a1a2e; font-weight: 600; font-size: 12px; text-transform: uppercase;">Conta</th>
            <th style="padding: 12px; text-align: right; color: #1a1a2e; font-weight: 600; font-size: 12px; text-transform: uppercase;">Invest.</th>
            <th style="padding: 12px; text-align: right; color: #1a1a2e; font-weight: 600; font-size: 12px; text-transform: uppercase;">Conversões</th>
            <th style="padding: 12px; text-align: right; color: #1a1a2e; font-weight: 600; font-size: 12px; text-transform: uppercase;">Receita</th>
            <th style="padding: 12px; text-align: right; color: #1a1a2e; font-weight: 600; font-size: 12px; text-transform: uppercase;">ROAS</th>
            <th style="padding: 12px; text-align: right; color: #1a1a2e; font-weight: 600; font-size: 12px; text-transform: uppercase;">CTR</th>
            <th style="padding: 12px; text-align: right; color: #1a1a2e; font-weight: 600; font-size: 12px; text-transform: uppercase;">Impr.</th>
          </tr>
        </thead>
        <tbody>
          ${accountRows}
        </tbody>
      </table>
    </div>

    <div style="padding: 24px;">
      <h2 style="margin: 0 0 16px 0; color: #1a1a2e; font-size: 16px; font-weight: 700;">Análise de Performance</h2>
      ${analysisRows}
    </div>

    <div style="background-color: #f5f0e8; padding: 24px; text-align: center; border-top: 1px solid #eeeeee;">
      <p style="margin: 0; color: #888888; font-size: 12px;">
        Report gerado automaticamente às 8h BRT • SELVA Agency
      </p>
      <p style="margin: 8px 0 0 0; color: #888888; font-size: 11px;">
        Dados referentes ao dia anterior (ontem)
      </p>
    </div>
  </div>
</body>
</html>
  `;
}

function generatePlainTextReport(accounts: AccountDayMetrics[], date: string): string {
  const totalSpend = accounts.reduce((s, a) => s + a.spend, 0);
  const totalConversions = accounts.reduce((s, a) => s + a.conversions, 0);
  const totalConversionValue = accounts.reduce((s, a) => s + a.conversionValue, 0);
  const avgRoas = totalSpend > 0 ? totalConversionValue / totalSpend : 0;

  let text = `SELVA AGENCY - Report Diário Meta Ads\n${date}\n\n`;
  text += `=== RESUMO ===\n`;
  text += `Investimento Total: ${fmtCurrency(totalSpend)}\n`;
  text += `ROAS Médio: ${avgRoas.toFixed(2)}x\n`;
  text += `Conversões: ${fmtInt(totalConversions)}\n`;
  text += `Receita: ${fmtCurrency(totalConversionValue)}\n\n`;

  text += `=== PERFORMANCE POR CONTA ===\n`;
  for (const a of accounts) {
    text += `\n${a.accountName}\n`;
    text += `  Investimento: ${fmtCurrency(a.spend)}\n`;
    text += `  Conversões: ${fmtInt(a.conversions)}\n`;
    text += `  Receita: ${fmtCurrency(a.conversionValue)}\n`;
    text += `  ROAS: ${a.roas.toFixed(2)}x\n`;
    text += `  CTR: ${fmtPct(a.ctr)}\n`;
    text += `  Impressões: ${fmtInt(a.impressions)}\n`;
  }

  text += `\n=== ANÁLISE ===\n`;
  for (const a of accounts) {
    text += `\n${generatePerformanceAnalysis(a)}\n`;
  }

  return text;
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
      html: generateHTMLReport(metrics, label),
      plainText: generatePlainTextReport(metrics, label),
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

    console.log(`[DailyReport] Enviando report para ${RECIPIENTS.length} destinatário(s)...`);

    // Tentar enviar via Resend
    const resendClient = initializeResend();
    if (resendClient) {
      try {
        for (const recipient of RECIPIENTS) {
          const response = await resendClient.emails.send({
            from: `${FROM_NAME} <${FROM_EMAIL}>`,
            to: recipient,
            subject: payload.subject,
            html: payload.html,
            text: payload.plainText,
          });

          if (response.error) {
            console.error(`[DailyReport] ✗ Erro ao enviar via Resend para ${recipient}:`, response.error);
            throw response.error;
          }

          console.log(`[DailyReport] ✓ Email enviado para ${recipient} (ID: ${response.data?.id})`);
        }
        return true;
      } catch (error) {
        console.error(`[DailyReport] ✗ Erro ao enviar via Resend:`, error);
        console.log("[DailyReport] Tentando fallback: notifyOwner...");
      }
    }

    // Fallback: notifyOwner (Manus Notification API)
    const notifySuccess = await notifyOwner({
      title: payload.subject,
      content: `${payload.plainText}\n\n---\nFallback: Notificação enviada via Manus (Resend indisponível)`,
    });

    if (notifySuccess) {
      console.log(`[DailyReport] ✓ Notificação enviada via Manus (fallback)`);
    } else {
      console.error(`[DailyReport] ✗ Falha em ambos os métodos (Resend e Manus)`);
    }

    return notifySuccess;
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
