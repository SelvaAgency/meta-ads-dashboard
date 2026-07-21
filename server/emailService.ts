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
import { registrarEnvioEmail } from "./db";

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
 *   EMAIL_DRY_RUN=true            → nada sai; registra quem receberia.
 *   EMAIL_TEST_RECIPIENT=a@x,b@y  → tudo é desviado para ESTA lista.
 *
 * Fora de produção o dry-run é o DEFAULT: para mandar email de verdade do
 * desenvolvimento é preciso dizer EMAIL_DRY_RUN=false explicitamente. O padrão
 * seguro protege quem não sabe que a trava existe.
 */
const DRY_RUN_EXPLICITO = process.env.EMAIL_DRY_RUN;
const EM_PRODUCAO = process.env.NODE_ENV === "production";

/**
 * Lista, não endereço único: a validação precisa chegar em mais de uma pessoa
 * (admin + dev) sem que ninguém use CC — cada destino é um envio próprio, com
 * seu próprio registro de sucesso ou falha.
 */
const EMAIL_TEST_RECIPIENTS: string[] = (process.env.EMAIL_TEST_RECIPIENT || "")
  .split(",").map((e) => e.trim()).filter(Boolean);

export function isDryRun(): boolean {
  if (DRY_RUN_EXPLICITO === "true") return true;
  if (DRY_RUN_EXPLICITO === "false") return false;
  return !EM_PRODUCAO; // sem declaração: só produção envia de verdade
}

export function destinatariosDeTeste(): string[] {
  return [...EMAIL_TEST_RECIPIENTS];
}

/** Como o envio está configurado agora — a UI mostra isso antes de disparar. */
export function emailMode(): { dryRun: boolean; testRecipients: string[]; configured: boolean } {
  return { dryRun: isDryRun(), testRecipients: destinatariosDeTeste(), configured: isEmailConfigured() };
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

/** Uma tentativa de entrega para UM endereço. */
export interface EntregaEmail {
  para: string;
  /** Para quem o sistema queria mandar (difere de `para` quando houve desvio). */
  destinoOriginal: string;
  ok: boolean;
  erro?: string;
  messageId?: string;
  dryRun: boolean;
  redirecionado: boolean;
}

export interface ResultadoEnvio {
  /** Só true se TODAS as entregas saíram. Uma falha entre duas já derruba isto. */
  ok: boolean;
  dryRun: boolean;
  redirecionado: boolean;
  entregas: EntregaEmail[];
  /** Primeiro erro real do SMTP — o que faltava para diagnosticar. */
  erro?: string;
}

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  /** Rótulo para a auditoria: digest, financeiro, comunicado, teste… */
  tipo?: string;
  /** Quando o envio é dirigido a uma pessoa do sistema. */
  userId?: number;
}

/** Etiqueta discreta no corpo, para ninguém confundir teste com envio real. */
function marcarCorpoDeTeste(html: string, destinoOriginal: string): string {
  return `<div style="background:#FEF3C7;border:1px solid #FCD34D;color:#92400E;padding:8px 12px;border-radius:6px;font:12px Arial,sans-serif;margin:0 0 12px">
  Envio de teste redirecionado &middot; o destinatário real seria <strong>${destinoOriginal}</strong>.
</div>${html}`;
}

/**
 * Envia e DEVOLVE O QUE ACONTECEU.
 *
 * Antes esta função capturava a falha do SMTP e devolvia `false`, sem gravar o
 * motivo em lugar nenhum: o job registrava sucesso, o email não chegava, e o
 * único vestígio era um console.error que o Railway apaga a cada deploy. Foram
 * semanas sem ninguém conseguir dizer por quê.
 *
 * Agora: uma entrega por destinatário (nunca CC/BCC — CC esconde qual endereço
 * falhou), cada uma auditada em `email_send_log` com destino original, destino
 * final, se houve desvio, status e a mensagem real do erro.
 */
export async function sendEmail(opts: SendEmailOptions): Promise<ResultadoEnvio> {
  const destinos = (Array.isArray(opts.to) ? opts.to : [opts.to]).map((e) => e.trim()).filter(Boolean);
  const dryRun = isDryRun();
  const teste = destinatariosDeTeste();
  const redirecionado = teste.length > 0;
  const tipo = opts.tipo ?? "outro";

  // Com desvio ligado, cada destino original vira um envio para CADA endereço de
  // teste — e cada par (original → teste) é registrado separado. Sem desvio,
  // um envio por destinatário real.
  const pares: { destinoOriginal: string; para: string }[] = redirecionado
    ? destinos.flatMap((orig) => teste.map((t) => ({ destinoOriginal: orig, para: t })))
    : destinos.map((d) => ({ destinoOriginal: d, para: d }));

  const assunto = redirecionado ? `[TESTE] ${opts.subject}` : opts.subject;
  const entregas: EntregaEmail[] = [];

  for (const { destinoOriginal, para } of pares) {
    const base = { para, destinoOriginal, dryRun, redirecionado };

    if (dryRun) {
      logger.info(`[EmailService] DRY-RUN · ${tipo} · não enviado para ${para} · "${assunto}"`);
      entregas.push({ ...base, ok: true });
      await registrarEnvioEmail({
        tipo, assunto, destinatarioOriginal: destinoOriginal, destinatarioFinal: para,
        redirecionado, status: "dry_run", userId: opts.userId,
      });
      continue;
    }

    try {
      const info = await getTransporter().sendMail({
        from: SMTP_FROM,
        to: para,
        subject: assunto,
        html: redirecionado ? marcarCorpoDeTeste(opts.html, destinoOriginal) : opts.html,
        text: opts.text,
      });
      logger.info(`[EmailService] ✓ ${tipo} → ${para}${redirecionado ? ` (original: ${destinoOriginal})` : ""} · ${info.messageId}`);
      entregas.push({ ...base, ok: true, messageId: info.messageId });
      await registrarEnvioEmail({
        tipo, assunto, destinatarioOriginal: destinoOriginal, destinatarioFinal: para,
        redirecionado, status: "sent", messageId: info.messageId, userId: opts.userId,
      });
    } catch (err) {
      const msg = (err as Error)?.message ?? String(err);
      logger.error(`[EmailService] ✗ ${tipo} → ${para} FALHOU: ${msg}`);
      entregas.push({ ...base, ok: false, erro: msg });
      await registrarEnvioEmail({
        tipo, assunto, destinatarioOriginal: destinoOriginal, destinatarioFinal: para,
        redirecionado, status: "failed", erro: msg, userId: opts.userId,
      });
    }
  }

  const falhas = entregas.filter((e) => !e.ok);
  return {
    ok: entregas.length > 0 && falhas.length === 0,
    dryRun, redirecionado, entregas,
    erro: falhas[0]?.erro,
  };
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
