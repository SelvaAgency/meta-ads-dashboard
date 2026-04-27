/**
 * emailService.ts — Serviço de envio de email via SMTP (nodemailer).
 *
 * Usa variáveis de ambiente:
 *   SMTP_HOST     (default: smtp.gmail.com)
 *   SMTP_PORT     (default: 587)
 *   SMTP_USER     (ex: dashboard@selva.agency)
 *   SMTP_PASS     (app password do Google Workspace)
 *   SMTP_FROM     (default: SMTP_USER)
 */

import nodemailer from "nodemailer";

const SMTP_HOST = process.env.SMTP_HOST || "smtp.gmail.com";
const SMTP_PORT = Number(process.env.SMTP_PORT || "587");
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER;

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (!transporter) {
    if (!SMTP_USER || !SMTP_PASS) {
      throw new Error("[EmailService] SMTP_USER and SMTP_PASS must be configured");
    }
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
  }
  return transporter;
}

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail(opts: SendEmailOptions): Promise<boolean> {
  try {
    const t = getTransporter();
    const recipients = Array.isArray(opts.to) ? opts.to.join(", ") : opts.to;
    const info = await t.sendMail({
      from: SMTP_FROM,
      to: recipients,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    });
    console.log(`[EmailService] ✓ Email sent: ${info.messageId} → ${recipients}`);
    return true;
  } catch (err) {
    console.error("[EmailService] ✗ Failed to send email:", err);
    return false;
  }
}

export function isEmailConfigured(): boolean {
  return !!(SMTP_USER && SMTP_PASS);
}

/** Destinatários padrão do report diário SELVA */
export const DAILY_REPORT_RECIPIENTS = [
  "felberg@selva.agency",
  "natalia@selva.agency",
  "gustavo@selva.agency",
  "beth@selva.agency",
  "victor@selva.agency",
];
