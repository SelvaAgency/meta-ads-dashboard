import nodemailer from "nodemailer";
import cron from "node-cron";
import { getDb } from "./db";
import { metaAdAccounts, campaignMetrics } from "../drizzle/schema";
import { eq, and, gte, lte, sql } from "drizzle-orm";

// ─── Configuration ────────────────────────────────────────────────────────────

const REPORT_RECIPIENTS = [
  "felberg@selva.agency",
  "natalia@selva.agency",
  "gustavo@selva.agency",
  "beth@selva.agency",
  "victor@selva.agency",
];

const ACCOUNT_CONFIG = [
  { metaId: "893765498172498", name: "PHBR MEDICAL", goal: "OFFSITE_CONVERSIONS", resultLabel: "Compras", valueLabel: "Receita" },
  { metaId: "1349445652498498", name: "UMA COMÉRCIO", goal: "OFFSITE_CONVERSIONS", resultLabel: "Compras", valueLabel: "Receita" },
  { metaId: "584498793498265", name: "GRINGA", goal: "CONVERSATIONS", resultLabel: "Mensagens iniciadas", valueLabel: "Mensagens" },
  { metaId: "1043706090397498", name: "MAIS ENERGIA", goal: "CONVERSATIONS", resultLabel: "Mensagens iniciadas", valueLabel: "Mensagens" },
  { metaId: "1295137741498878", name: "CLINICA FLÁVIA PINTO", goal: "CONVERSATIONS", resultLabel: "Mensagens iniciadas", valueLabel: "Mensagens" },
  { metaId: "939782497498218", name: "UMA INCORPORAÇÕES", goal: "LINK_CLICKS", resultLabel: "Cliques no link", valueLabel: "Cliques" },
  { metaId: "669968171498696", name: "BAESH", goal: "OFFSITE_CONVERSIONS", resultLabel: "Compras", valueLabel: "Receita" },
  { metaId: "1055949498489655", name: "DR. SHAPE", goal: "OFFSITE_CONVERSIONS", resultLabel: "Compras", valueLabel: "Receita" },
  { metaId: "357294497498064", name: "SPIM GAMING", goal: "CONVERSATIONS", resultLabel: "Mensagens iniciadas", valueLabel: "Mensagens" },
  { metaId: "1285983498919702", name: "KAIRÓS INCORPORAÇÕES", goal: "LINK_CLICKS", resultLabel: "Cliques no link", valueLabel: "Cliques" },
  { metaId: "954041856498380", name: "WK ACABAMENTOS", goal: "CONVERSATIONS", resultLabel: "Mensagens iniciadas", valueLabel: "Mensagens" },
  { metaId: "1098938498181813", name: "DG VIDROS", goal: "OFFSITE_CONVERSIONS", resultLabel: "Compras", valueLabel: "Receita" },
];

// ─── Email Configuration ──────────────────────────────────────────────────────

async function getEmailTransporter() {
  // Use Gmail SMTP with app password (configured via environment variables)
  // Default: dashboardselva@gmail.com with app password
  const smtpHost = process.env.SMTP_HOST || "smtp.gmail.com";
  const smtpPort = parseInt(process.env.SMTP_PORT || "587");
  const smtpUser = process.env.SMTP_USER || "dashboardselva@gmail.com";
  const smtpPass = process.env.SMTP_PASS || "";

  if (!smtpPass) {
    console.warn("[DailyReport] SMTP_PASS not configured. Email sending may fail.");
  }

  return nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  });
}

// ─── Data Collection ─────────────────────────────────────────────────────────

interface AccountMetrics {
  accountId: string;
  accountName: string;
  goal: string;
  resultLabel: string;
  valueLabel: string;
  totalSpend: number;
  totalResults: number;
  totalValue: number;
  totalClicks: number;
  totalImpressions: number;
  ctr: number;
  error?: string;
}

async function collectDailyMetrics(yesterdayDate: string): Promise<AccountMetrics[]> {
  const db = await getDb();
  if (!db) {
    console.error("[DailyReport] Database not available");
    return [];
  }

  const results: AccountMetrics[] = [];

  for (const config of ACCOUNT_CONFIG) {
    try {
      // Find account in DB by accountId (Meta ID)
      const account = await db
        .select()
        .from(metaAdAccounts)
        .where(eq(metaAdAccounts.accountId, config.metaId))
        .limit(1);

      if (!account || account.length === 0) {
        console.warn(`[DailyReport] Account ${config.metaId} (${config.name}) not found in DB`);
        results.push({
          accountId: config.metaId,
          accountName: config.name,
          goal: config.goal,
          resultLabel: config.resultLabel,
          valueLabel: config.valueLabel,
          totalSpend: 0,
          totalResults: 0,
          totalValue: 0,
          totalClicks: 0,
          totalImpressions: 0,
          ctr: 0,
          error: "Conta não encontrada",
        });
        continue;
      }

      const accountId = account[0].id;

      // Query metrics for yesterday
      const metrics = await db
        .select({
          totalSpend: sql<number>`SUM(${campaignMetrics.spend})`,
          totalResults: sql<number>`SUM(${campaignMetrics.conversions})`,
          totalValue: sql<number>`SUM(${campaignMetrics.conversionValue})`,
          totalClicks: sql<number>`SUM(${campaignMetrics.clicks})`,
          totalImpressions: sql<number>`SUM(${campaignMetrics.impressions})`,
        })
        .from(campaignMetrics)
        .where(
          and(
            eq(campaignMetrics.accountId, accountId),
            eq(campaignMetrics.date, yesterdayDate)
          )
        );

      if (metrics.length === 0) {
        results.push({
          accountId: config.metaId,
          accountName: config.name,
          goal: config.goal,
          resultLabel: config.resultLabel,
          valueLabel: config.valueLabel,
          totalSpend: 0,
          totalResults: 0,
          totalValue: 0,
          totalClicks: 0,
          totalImpressions: 0,
          ctr: 0,
        });
        continue;
      }

      const m = metrics[0];
      const spend = Number(m.totalSpend ?? 0);
      const results_count = Number(m.totalResults ?? 0);
      const value = Number(m.totalValue ?? 0);
      const clicks = Number(m.totalClicks ?? 0);
      const impressions = Number(m.totalImpressions ?? 0);
      const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;

      results.push({
        accountId: config.metaId,
        accountName: config.name,
        goal: config.goal,
        resultLabel: config.resultLabel,
        valueLabel: config.valueLabel,
        totalSpend: spend,
        totalResults: results_count,
        totalValue: value,
        totalClicks: clicks,
        totalImpressions: impressions,
        ctr: ctr,
      });
    } catch (error) {
      console.error(`[DailyReport] Error collecting metrics for ${config.name}:`, error);
      results.push({
        accountId: config.metaId,
        accountName: config.name,
        goal: config.goal,
        resultLabel: config.resultLabel,
        valueLabel: config.valueLabel,
        totalSpend: 0,
        totalResults: 0,
        totalValue: 0,
        totalClicks: 0,
        totalImpressions: 0,
        ctr: 0,
        error: "Erro na coleta",
      });
    }
  }

  return results;
}

// ─── Email Template Generation ────────────────────────────────────────────────

function generateEmailHTML(metrics: AccountMetrics[], yesterdayDate: string): string {
  // Parse date for display
  const [year, month, day] = yesterdayDate.split("-");
  const displayDate = `${day}/${month}/${year}`;

  // Separate active and inactive accounts
  const activeAccounts = metrics.filter((m) => m.totalSpend > 0 && !m.error);
  const inactiveAccounts = metrics.filter((m) => m.totalSpend === 0 && !m.error);
  const errorAccounts = metrics.filter((m) => m.error);

  // Sort active by spend (descending)
  activeAccounts.sort((a, b) => b.totalSpend - a.totalSpend);

  // Calculate totals
  const totalSpend = activeAccounts.reduce((sum, m) => sum + m.totalSpend, 0);
  const totalResults = activeAccounts.reduce((sum, m) => sum + m.totalResults, 0);
  const totalValue = activeAccounts.reduce((sum, m) => sum + m.totalValue, 0);
  const totalImpressions = activeAccounts.reduce((sum, m) => sum + m.totalImpressions, 0);
  const totalClicks = activeAccounts.reduce((sum, m) => sum + m.totalClicks, 0);
  const avgCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;

  // Build table rows
  let tableRows = "";
  for (const m of activeAccounts) {
    tableRows += `
      <tr style="border-bottom: 1px solid #eeeeee;">
        <td style="padding: 12px; text-align: left; color: #111111; font-size: 14px;">${m.accountName}</td>
        <td style="padding: 12px; text-align: right; color: #111111; font-size: 14px;">R$ ${m.totalSpend.toFixed(2)}</td>
        <td style="padding: 12px; text-align: right; color: #111111; font-size: 14px;">${m.totalResults.toLocaleString("pt-BR")}</td>
        <td style="padding: 12px; text-align: right; color: #111111; font-size: 14px;">${m.ctr.toFixed(2)}%</td>
      </tr>
    `;
  }

  // Add TOTAL row
  tableRows += `
    <tr style="background-color: #f5f5f5; border-top: 2px solid #111111; border-bottom: 2px solid #111111; font-weight: bold;">
      <td style="padding: 12px; text-align: left; color: #111111; font-size: 14px;">TOTAL</td>
      <td style="padding: 12px; text-align: right; color: #111111; font-size: 14px;">R$ ${totalSpend.toFixed(2)}</td>
      <td style="padding: 12px; text-align: right; color: #111111; font-size: 14px;">${totalResults.toLocaleString("pt-BR")}</td>
      <td style="padding: 12px; text-align: right; color: #111111; font-size: 14px;">${avgCtr.toFixed(2)}%</td>
    </tr>
  `;

  // Build footer with inactive accounts
  let footerText = "";
  if (inactiveAccounts.length > 0) {
    const inactiveNames = inactiveAccounts.map((m) => m.accountName).join(", ");
    footerText = `<p style="color: #666666; font-size: 12px; margin-top: 20px;">
      <strong>Contas inativas ontem:</strong> ${inactiveNames}
    </p>`;
  }

  if (errorAccounts.length > 0) {
    const errorNames = errorAccounts.map((m) => m.accountName).join(", ");
    footerText += `<p style="color: #cc0000; font-size: 12px; margin-top: 10px;">
      <strong>Erros na coleta:</strong> ${errorNames}
    </p>`;
  }

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: Arial, sans-serif; background-color: #ffffff; }
          .container { max-width: 560px; margin: 0 auto; background-color: #ffffff; padding: 20px; }
          .header { text-align: center; border-bottom: 2px solid #111111; padding-bottom: 15px; margin-bottom: 20px; }
          .header h1 { margin: 0; color: #111111; font-size: 18px; font-weight: bold; }
          .header p { margin: 5px 0 0 0; color: #666666; font-size: 12px; }
          table { width: 100%; border-collapse: collapse; margin: 20px 0; }
          th { background-color: #f5f5f5; padding: 12px; text-align: left; color: #111111; font-size: 14px; font-weight: bold; border-bottom: 2px solid #111111; }
          .footer { text-align: center; border-top: 1px solid #eeeeee; padding-top: 15px; margin-top: 20px; }
          .footer p { margin: 5px 0; color: #999999; font-size: 11px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>SELVA AGENCY · META ADS · REPORT</h1>
            <p>Ontem: ${displayDate}</p>
          </div>
          
          <table>
            <thead>
              <tr>
                <th>Conta</th>
                <th style="text-align: right;">Invest.</th>
                <th style="text-align: right;">Resultado</th>
                <th style="text-align: right;">CTR</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>

          ${footerText}

          <div class="footer">
            <p>Relatório gerado automaticamente às 9:00 BRT</p>
            <p>© 2026 SELVA AGENCY</p>
          </div>
        </div>
      </body>
    </html>
  `;
}

// ─── Send Email ───────────────────────────────────────────────────────────────

async function sendDailyReport(yesterdayDate: string): Promise<void> {
  try {
    console.log(`[DailyReport] Starting daily report for ${yesterdayDate}`);

    // Collect metrics
    const metrics = await collectDailyMetrics(yesterdayDate);
    console.log(`[DailyReport] Collected metrics for ${metrics.length} accounts`);

    // Generate HTML
    const htmlContent = generateEmailHTML(metrics, yesterdayDate);

    // Send email
    const transporter = await getEmailTransporter();
    const [year, month, day] = yesterdayDate.split("-");
    const displayDate = `${day}/${month}/${year}`;

    const mailOptions = {
      from: process.env.SMTP_USER || "noreply@selva.agency",
      to: REPORT_RECIPIENTS.join(", "),
      subject: `[SELVA] Report Diário Meta Ads — ${displayDate}`,
      html: htmlContent,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`[DailyReport] Email sent successfully: ${info.messageId}`);
  } catch (error) {
    console.error("[DailyReport] Error sending daily report:", error);
  }
}

// ─── Cron Job Setup ───────────────────────────────────────────────────────────

export function initializeDailyReportSchedule(): void {
  // Schedule: 0 12 * * * (12:00 UTC = 9:00 BRT)
  const schedule = "0 12 * * *";

  console.log(`[DailyReport] Scheduling daily report at ${schedule} (12:00 UTC / 9:00 BRT)`);

  cron.schedule(schedule, async () => {
    // Calculate yesterday's date in America/Sao_Paulo timezone
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const yesterdayDate = yesterday.toISOString().split("T")[0];

    await sendDailyReport(yesterdayDate);
  });

  console.log("[DailyReport] Daily report schedule initialized");
}

// ─── Manual Test Function ────────────────────────────────────────────────────

export async function sendTestReport(): Promise<void> {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const yesterdayDate = yesterday.toISOString().split("T")[0];
  await sendDailyReport(yesterdayDate);
}
