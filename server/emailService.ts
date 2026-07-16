import { logger } from "./logger";
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

/**
 * ─── Trava de segurança de envio ────────────────────────────────────────────
 * Existe porque já aconteceu: um teste rodado com as credenciais de produção
 * disparou dezenas de emails reais para o time inteiro. A trava fica AQUI, no
 * único ponto por onde todo envio passa — assim nenhum caminho novo escapa dela.
 *
 *   EMAIL_DRY_RUN=true         → nada sai; loga quem receberia.
 *   EMAIL_TEST_RECIPIENT=x@y   → tudo é desviado para este endereço.
 *
 * Fora de produção o dry-run é o DEFAULT: para mandar email de verdade do
 * desenvolvimento é preciso dizer EMAIL_DRY_RUN=false explicitamente. O padrão
 * seguro protege quem não sabe que a trava existe.
 */
const DRY_RUN_EXPLICITO = process.env.EMAIL_DRY_RUN;
const EM_PRODUCAO = process.env.NODE_ENV === "production";
const EMAIL_TEST_RECIPIENT = process.env.EMAIL_TEST_RECIPIENT || "";

export function isDryRun(): boolean {
  if (DRY_RUN_EXPLICITO === "true") return true;
  if (DRY_RUN_EXPLICITO === "false") return false;
  return !EM_PRODUCAO; // sem declaração: só produção envia de verdade
}

/** Como o envio está configurado agora — a UI mostra isso antes de disparar. */
export function emailMode(): { dryRun: boolean; testRecipient: string | null; configured: boolean } {
  return { dryRun: isDryRun(), testRecipient: EMAIL_TEST_RECIPIENT || null, configured: isEmailConfigured() };
}

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
  const destino = Array.isArray(opts.to) ? opts.to.join(", ") : opts.to;

  // Trava: nenhum envio real sem intenção explícita.
  if (isDryRun()) {
    logger.info(`[EmailService] DRY-RUN — NÃO enviado · para: ${destino} · assunto: "${opts.subject}"`);
    return true; // o fluxo segue como se tivesse enviado; quem chama registra o modo
  }

  try {
    const t = getTransporter();
    // Desvio de teste: manda tudo para um endereço só, sem tocar em quem é real.
    const recipients = EMAIL_TEST_RECIPIENT || destino;
    if (EMAIL_TEST_RECIPIENT) {
      logger.info(`[EmailService] DESVIADO para ${EMAIL_TEST_RECIPIENT} (destino real seria: ${destino})`);
    }
    const info = await t.sendMail({
      from: SMTP_FROM,
      to: recipients,
      subject: EMAIL_TEST_RECIPIENT ? `[teste → ${destino}] ${opts.subject}` : opts.subject,
      html: opts.html,
      text: opts.text,
    });
    logger.info(`[EmailService] ✓ Email sent: ${info.messageId} → ${recipients}`);
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
