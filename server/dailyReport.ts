/**
 * dailyReport.ts — Report diário automático de performance Meta Ads.
 *
 * Envia email às 6h BRT (09:00 UTC) com métricas do dia anterior
 * para a equipe SELVA.
 *
 * Formato: enxuto, direto, com métricas-chave por conta e resumo analítico.
 */

import cron from "node-cron";
import nodemailer from "nodemailer";
import {
  getAllActiveMetaAdAccounts,
  getCampaignsByAccountId,
} from "./db";
import {
  getCampaignInsights,
  extractResultsByGoal,
  extractConversions,
  extractConversionValue,
  extractPurchaseRoas,
  buildCampaignGoalMap,
  getResultLabel,
  validateToken,
} from "./metaAdsService";

// ── Config ──────────────────────────────────────────────────────────────────

const RECIPIENTS = [
  "felberg@selva.agency",
  "natalia@selva.agency",
  "gustavo@selva.agency",
  "beth@selva.agency",
  "victor@selva.agency",
];

const SMTP_HOST = process.env.SMTP_HOST || "smtp.gmail.com";
const SMTP_PORT = parseInt(process.env.SMTP_PORT || "587");
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";
const SMTP_FROM = process.env.SMTP_FROM || "dashboard@selva.agency";

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
    // Validate token first
    const valid = await validateToken(account.accessToken);
    if (!valid) {
      console.warn(`[DailyReport] Token inválido para ${account.accountName}`);
      return null;
    }

    const campaigns = await getCampaignsByAccountId(account.id);
    const activeCampaigns = campaigns.filter((c) => c.status === "ACTIVE");

    if (activeCampaigns.length === 0) {
      return null; // Skip accounts with no active campaigns
    }

    const goalMap = await buildCampaignGoalMap(account.accountId, account.accessToken);

    let totalSpend = 0;
    let totalImpressions = 0;
    let totalClicks = 0;
    let totalConversions = 0;
    let totalConversionValue = 0;
    let totalReach = 0;

    for (const campaign of activeCampaigns) {
      try {
        const insights = await getCampaignInsights(
          account.accountId,
          account.accessToken,
          campaign.metaCampaignId,
          startDate,
          endDate
        );

        if (insights && insights.length > 0) {
          for (const row of insights) {
            totalSpend += parseFloat(row.spend || "0");
            totalImpressions += parseInt(row.impressions || "0");
            totalClicks += parseInt(row.clicks || "0");
            totalReach += parseInt(row.reach || "0");

            const goal = goalMap.get(campaign.metaCampaignId) || "OUTCOME_SALES";
            const conv = extractConversions(row, goal);
            const convValue = extractConversionValue(row);
            totalConversions += conv;
            totalConversionValue += convValue;
          }
        }
      } catch (err) {
        console.warn(`[DailyReport] Error fetching campaign ${campaign.name}:`, err);
      }
    }

    if (totalSpend === 0 && totalImpressions === 0) {
      return null; // Skip if no data yesterday
    }

    return {
      accountName: account.accountName || account.accountId,
      accountId: account.accountId,
      spend: totalSpend,
      impressions: totalImpressions,
      clicks: totalClicks,
      ctr: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0,
      cpc: totalClicks > 0 ? totalSpend / totalClicks : 0,
      cpm: totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000 : 0,
      conversions: totalConversions,
      conversionValue: totalConversionValue,
      roas: totalSpend > 0 ? totalConversionValue / totalSpend : 0,
      cpa: totalConversions > 0 ? totalSpend / totalConversions : 0,
      reach: totalReach,
      activeCampaigns: activeCampaigns.length,
    };
  } catch (err) {
    console.error(`[DailyReport] Error for account ${account.accountName}:`, err);
    return null;
  }
}

// ── Email builder ───────────────────────────────────────────────────────────

function buildEmailHTML(accounts: AccountDayMetrics[], dateLabel: string, dateStr: string): string {
  const totalSpend = accounts.reduce((s, a) => s + a.spend, 0);
  const totalConversions = accounts.reduce((s, a) => s + a.conversions, 0);
  const totalConversionValue = accounts.reduce((s, a) => s + a.conversionValue, 0);
  const totalImpressions = accounts.reduce((s, a) => s + a.impressions, 0);
  const totalClicks = accounts.reduce((s, a) => s + a.clicks, 0);
  const overallRoas = totalSpend > 0 ? totalConversionValue / totalSpend : 0;
  const overallCpa = totalConversions > 0 ? totalSpend / totalConversions : 0;
  const overallCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;

  // Sort by spend desc
  const sorted = [...accounts].sort((a, b) => b.spend - a.spend);

  // Identify highlights
  const bestRoas = sorted.filter(a => a.roas > 0).sort((a, b) => b.roas - a.roas)[0];
  const bestCpa = sorted.filter(a => a.cpa > 0).sort((a, b) => a.cpa - b.cpa)[0];
  const worstCtr = sorted.filter(a => a.ctr > 0).sort((a, b) => a.ctr - b.ctr)[0];

  // Build account rows
  const accountRows = sorted.map(a => `
    <tr style="border-bottom:1px solid #eee;">
      <td style="padding:8px 12px;font-weight:600;color:#1a1a2e;">${a.accountName}</td>
      <td style="padding:8px 12px;text-align:right;">${fmtCurrency(a.spend)}</td>
      <td style="padding:8px 12px;text-align:right;">${fmtInt(a.impressions)}</td>
      <td style="padding:8px 12px;text-align:right;">${fmtInt(a.clicks)}</td>
      <td style="padding:8px 12px;text-align:right;">${fmtPct(a.ctr)}</td>
      <td style="padding:8px 12px;text-align:right;">${fmtInt(a.conversions)}</td>
      <td style="padding:8px 12px;text-align:right;">${fmtCurrency(a.conversionValue)}</td>
      <td style="padding:8px 12px;text-align:right;font-weight:600;color:${a.roas >= 2 ? '#10b981' : a.roas >= 1 ? '#f59e0b' : '#ef4444'};">${a.roas > 0 ? a.roas.toFixed(2) + 'x' : '—'}</td>
      <td style="padding:8px 12px;text-align:right;">${a.cpa > 0 ? fmtCurrency(a.cpa) : '—'}</td>
    </tr>
  `).join('');

  // Build analytical summary
  let summary = `No dia ${dateLabel}, o investimento total em mídia paga foi de ${fmtCurrency(totalSpend)} distribuído em ${accounts.length} contas ativas, gerando ${fmtInt(totalImpressions)} impressões, ${fmtInt(totalClicks)} cliques (CTR ${fmtPct(overallCtr)}) e ${fmtInt(totalConversions)} conversões com retorno de ${fmtCurrency(totalConversionValue)} (ROAS ${overallRoas.toFixed(2)}x).`;

  if (bestRoas) {
    summary += ` A conta com melhor ROAS foi "${bestRoas.accountName}" (${bestRoas.roas.toFixed(2)}x), indicando potencial de escala.`;
  }
  if (bestCpa && bestCpa !== bestRoas) {
    summary += ` O menor CPA foi de "${bestCpa.accountName}" (${fmtCurrency(bestCpa.cpa)}), mostrando eficiência na conversão.`;
  }
  if (worstCtr && worstCtr.ctr < 1) {
    summary += ` Atenção à conta "${worstCtr.accountName}" com CTR de ${fmtPct(worstCtr.ctr)} — considerar revisão de criativos e segmentação.`;
  }

  // Recommendations
  const recs: string[] = [];
  sorted.forEach(a => {
    if (a.roas > 3) recs.push(`<b>${a.accountName}</b>: ROAS de ${a.roas.toFixed(2)}x — avaliar aumento de orçamento para escalar.`);
    if (a.roas > 0 && a.roas < 1) recs.push(`<b>${a.accountName}</b>: ROAS abaixo de 1x (${a.roas.toFixed(2)}x) — revisar audiência e criativos urgentemente.`);
    if (a.ctr < 0.8 && a.impressions > 1000) recs.push(`<b>${a.accountName}</b>: CTR baixo (${fmtPct(a.ctr)}) — testar novos criativos ou ângulos de copy.`);
    if (a.spend > 500 && a.conversions === 0) recs.push(`<b>${a.accountName}</b>: ${fmtCurrency(a.spend)} investidos sem conversão — verificar pixel e página de destino.`);
  });

  const recsHtml = recs.length > 0
    ? recs.map(r => `<li style="margin-bottom:6px;">${r}</li>`).join('')
    : '<li>Todas as contas performando dentro dos parâmetros normais.</li>';

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:900px;margin:20px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    
    <!-- Header -->
    <div style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%);padding:24px 32px;color:white;">
      <h1 style="margin:0;font-size:20px;font-weight:700;">📊 SELVA — Report Diário de Mídia Paga</h1>
      <p style="margin:6px 0 0;opacity:0.85;font-size:14px;">${dateLabel} | Meta Ads</p>
    </div>

    <!-- KPI Cards -->
    <div style="display:flex;padding:20px 32px;gap:16px;flex-wrap:wrap;border-bottom:1px solid #eee;">
      <div style="flex:1;min-width:120px;text-align:center;">
        <div style="font-size:12px;color:#888;text-transform:uppercase;">Investimento</div>
        <div style="font-size:22px;font-weight:700;color:#1a1a2e;">${fmtCurrency(totalSpend)}</div>
      </div>
      <div style="flex:1;min-width:120px;text-align:center;">
        <div style="font-size:12px;color:#888;text-transform:uppercase;">Conversões</div>
        <div style="font-size:22px;font-weight:700;color:#1a1a2e;">${fmtInt(totalConversions)}</div>
      </div>
      <div style="flex:1;min-width:120px;text-align:center;">
        <div style="font-size:12px;color:#888;text-transform:uppercase;">Receita</div>
        <div style="font-size:22px;font-weight:700;color:#10b981;">${fmtCurrency(totalConversionValue)}</div>
      </div>
      <div style="flex:1;min-width:120px;text-align:center;">
        <div style="font-size:12px;color:#888;text-transform:uppercase;">ROAS</div>
        <div style="font-size:22px;font-weight:700;color:${overallRoas >= 2 ? '#10b981' : overallRoas >= 1 ? '#f59e0b' : '#ef4444'};">${overallRoas.toFixed(2)}x</div>
      </div>
      <div style="flex:1;min-width:120px;text-align:center;">
        <div style="font-size:12px;color:#888;text-transform:uppercase;">CPA Médio</div>
        <div style="font-size:22px;font-weight:700;color:#1a1a2e;">${overallCpa > 0 ? fmtCurrency(overallCpa) : '—'}</div>
      </div>
    </div>

    <!-- Table -->
    <div style="padding:20px 32px;">
      <h2 style="font-size:16px;margin:0 0 12px;color:#1a1a2e;">Performance por Conta</h2>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="background:#f8f9fa;border-bottom:2px solid #dee2e6;">
            <th style="padding:8px 12px;text-align:left;">Conta</th>
            <th style="padding:8px 12px;text-align:right;">Invest.</th>
            <th style="padding:8px 12px;text-align:right;">Impr.</th>
            <th style="padding:8px 12px;text-align:right;">Cliques</th>
            <th style="padding:8px 12px;text-align:right;">CTR</th>
            <th style="padding:8px 12px;text-align:right;">Conv.</th>
            <th style="padding:8px 12px;text-align:right;">Receita</th>
            <th style="padding:8px 12px;text-align:right;">ROAS</th>
            <th style="padding:8px 12px;text-align:right;">CPA</th>
          </tr>
        </thead>
        <tbody>
          ${accountRows}
          <tr style="background:#f0f4f8;font-weight:700;">
            <td style="padding:8px 12px;">TOTAL</td>
            <td style="padding:8px 12px;text-align:right;">${fmtCurrency(totalSpend)}</td>
            <td style="padding:8px 12px;text-align:right;">${fmtInt(totalImpressions)}</td>
            <td style="padding:8px 12px;text-align:right;">${fmtInt(totalClicks)}</td>
            <td style="padding:8px 12px;text-align:right;">${fmtPct(overallCtr)}</td>
            <td style="padding:8px 12px;text-align:right;">${fmtInt(totalConversions)}</td>
            <td style="padding:8px 12px;text-align:right;">${fmtCurrency(totalConversionValue)}</td>
            <td style="padding:8px 12px;text-align:right;">${overallRoas.toFixed(2)}x</td>
            <td style="padding:8px 12px;text-align:right;">${overallCpa > 0 ? fmtCurrency(overallCpa) : '—'}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Summary -->
    <div style="padding:16px 32px;border-top:1px solid #eee;">
      <h2 style="font-size:16px;margin:0 0 8px;color:#1a1a2e;">📌 Resumo Analítico</h2>
      <p style="font-size:14px;line-height:1.6;color:#333;margin:0;">${summary}</p>
    </div>

    <!-- Recommendations -->
    ${recs.length > 0 ? `
    <div style="padding:16px 32px;border-top:1px solid #eee;">
      <h2 style="font-size:16px;margin:0 0 8px;color:#1a1a2e;">🧭 Recomendações</h2>
      <ul style="font-size:14px;line-height:1.6;color:#333;margin:0;padding-left:20px;">${recsHtml}</ul>
    </div>` : ''}

    <!-- Footer -->
    <div style="padding:16px 32px;background:#f8f9fa;text-align:center;font-size:12px;color:#888;">
      SELVA Agency — Dashboard de Mídia Paga | 
      <a href="https://dashboardselva.manus.space" style="color:#6366f1;">Abrir Dashboard</a>
    </div>
  </div>
</body>
</html>`;
}

function buildPlainText(accounts: AccountDayMetrics[], dateLabel: string): string {
  const totalSpend = accounts.reduce((s, a) => s + a.spend, 0);
  const totalConversions = accounts.reduce((s, a) => s + a.conversions, 0);
  const totalConversionValue = accounts.reduce((s, a) => s + a.conversionValue, 0);
  const overallRoas = totalSpend > 0 ? totalConversionValue / totalSpend : 0;

  let text = `📊 SELVA — Report Diário de Mídia Paga\n${dateLabel}\n\n`;
  text += `TOTAIS: Invest. ${fmtCurrency(totalSpend)} | Conv. ${fmtInt(totalConversions)} | Receita ${fmtCurrency(totalConversionValue)} | ROAS ${overallRoas.toFixed(2)}x\n\n`;

  const sorted = [...accounts].sort((a, b) => b.spend - a.spend);
  for (const a of sorted) {
    text += `• ${a.accountName}: ${fmtCurrency(a.spend)} invest. | ${fmtInt(a.clicks)} cliques | CTR ${fmtPct(a.ctr)} | ${fmtInt(a.conversions)} conv. | ROAS ${a.roas > 0 ? a.roas.toFixed(2) + 'x' : '—'}\n`;
  }

  text += `\nDashboard: https://dashboardselva.manus.space\n`;
  return text;
}

// ── Send email ──────────────────────────────────────────────────────────────

async function sendReportEmail(html: string, plainText: string, dateStr: string): Promise<boolean> {
  if (!SMTP_USER || !SMTP_PASS) {
    console.error("[DailyReport] SMTP credentials not configured. Set SMTP_USER and SMTP_PASS env vars.");
    return false;
  }

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });

  try {
    await transporter.sendMail({
      from: `"SELVA Dashboard" <${SMTP_FROM}>`,
      to: RECIPIENTS.join(", "),
      subject: `📊 Report Diário Meta Ads — ${dateStr}`,
      text: plainText,
      html: html,
    });

    console.log(`[DailyReport] ✓ Email enviado para ${RECIPIENTS.length} destinatários`);
    return true;
  } catch (err) {
    console.error("[DailyReport] Falha ao enviar email:", err);
    return false;
  }
}

// ── Main runner ─────────────────────────────────────────────────────────────


/**
 * Generates the daily report payload (HTML + plain text) without sending email.
 * Used by external callers (e.g., API endpoint) to get the report content.
 */
export async function generateReportPayload(): Promise<{
  html: string;
  plainText: string;
  subject: string;
  date: string;
  accountCount: number;
  totalSpend: number;
} | null> {
  try {
    const accounts = await getAllActiveMetaAdAccounts();
    if (!accounts || accounts.length === 0) {
      console.log("[DailyReport] No active accounts found.");
      return null;
    }

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().split("T")[0];
    const dayNames = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
    const dayName = dayNames[yesterday.getDay()];
    const formattedDate = `${yesterday.getDate().toString().padStart(2, "0")}/${(yesterday.getMonth() + 1).toString().padStart(2, "0")}/${yesterday.getFullYear()}`;

    const startDate = dateStr;
    const endDate = dateStr;

    const accountMetrics: AccountDayMetrics[] = [];

    for (const account of accounts) {
      const metrics = await fetchAccountMetrics(account, startDate, endDate);
      if (metrics) accountMetrics.push(metrics);
    }

    if (accountMetrics.length === 0) {
      console.log("[DailyReport] No accounts had data for " + dateStr);
      return null;
    }

    accountMetrics.sort((a, b) => b.spend - a.spend);

    const totalSpend = accountMetrics.reduce((s, m) => s + m.spend, 0);
    const totalImpressions = accountMetrics.reduce((s, m) => s + m.impressions, 0);
    const totalClicks = accountMetrics.reduce((s, m) => s + m.clicks, 0);
    const totalConversions = accountMetrics.reduce((s, m) => s + m.conversions, 0);
    const totalConversionValue = accountMetrics.reduce((s, m) => s + m.conversionValue, 0);
    const overallCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
    const overallRoas = totalSpend > 0 ? totalConversionValue / totalSpend : 0;
    const overallCpa = totalConversions > 0 ? totalSpend / totalConversions : 0;

    const html = buildEmailHTML(
      accountMetrics, dayName, formattedDate,
      totalSpend, totalImpressions, totalClicks, totalConversions,
      totalConversionValue, overallCtr, overallRoas, overallCpa
    );
    const plain = buildPlainText(
      accountMetrics, dayName, formattedDate,
      totalSpend, totalImpressions, totalClicks, totalConversions,
      totalConversionValue, overallCtr, overallRoas, overallCpa
    );

    const subject = `📊 Report Diário Meta Ads — ${formattedDate}`;

    return { html, plainText: plain, subject, date: dateStr, accountCount: accountMetrics.length, totalSpend };
  } catch (err) {
    console.error("[DailyReport] Error generating report payload:", err);
    return null;
  }
}


export async function runDailyReport(): Promise<void> {
  console.log("[DailyReport] Gerando report diário...");

  const { start, end, label } = yesterday();
  const dateStr = start; // YYYY-MM-DD

  try {
    const allAccounts = await getAllActiveMetaAdAccounts();
    console.log(`[DailyReport] ${allAccounts.length} contas ativas encontradas`);

    const results: AccountDayMetrics[] = [];

    for (const account of allAccounts) {
      const metrics = await fetchAccountMetrics(account, start, end);
      if (metrics) {
        results.push(metrics);
      }
    }

    if (results.length === 0) {
      console.log("[DailyReport] Nenhuma conta com dados ontem. Pulando envio.");
      return;
    }

    console.log(`[DailyReport] ${results.length} contas com dados`);

    const html = buildEmailHTML(results, label, dateStr);
    const plain = buildPlainText(results, label);

    const sent = await sendReportEmail(html, plain, dateStr);

    if (sent) {
      // Also notify via MANUS
      try {
        const { notifyOwner } = await import("./_core/notification");
        await notifyOwner({
          title: `📊 Report Diário enviado — ${dateStr}`,
          content: `Report enviado para ${RECIPIENTS.length} destinatários com dados de ${results.length} contas.`,
        });
      } catch (e) {
        // Non-critical
      }
    }
  } catch (err) {
    console.error("[DailyReport] Erro ao gerar report:", err);
  }
}

// ── Cron scheduling ─────────────────────────────────────────────────────────

export function scheduleDailyReport(): void {
  // 6h BRT = 9h UTC
  cron.schedule("0 0 9 * * *", async () => {
    console.log("[DailyReport] Cron triggered — 6h BRT");
    await runDailyReport();
  });

  console.log("[DailyReport] ✓ Agendado para 6h BRT (09:00 UTC) diariamente");
}
