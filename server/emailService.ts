import { logger } from "./logger";
/**
 * emailService.ts — Envio de email.
 *
 * ─── Por que existem DOIS transportes ───────────────────────────────────────
 * O Railway BLOQUEIA porta SMTP de saída (25/465/587/2525 dão timeout; HTTPS
 * passa normalmente). Comprovado por teste TCP dentro do container em 21/07/26.
 * Foi por isso que o email nunca chegou em produção — um dia sequer — enquanto a
 * mesma credencial funcionava do terminal, que não passa pela rede do Railway.
 *
 * Então:
 *   produção  → Resend, API sobre HTTPS (é o que a plataforma deixa sair)
 *   local/dev → SMTP, que continua útil e não depende de chave nenhuma
 *
 * A escolha é automática: havendo RESEND_API_KEY, usa Resend. É deliberado que
 * SMTP continue como alternativa — se um dia a plataforma mudar, ou o envio
 * rodar fora do Railway, o caminho ainda está aqui.
 *
 * Variáveis:
 *   RESEND_API_KEY   chave da API (produção)
 *   EMAIL_FROM       remetente; default SMTP_FROM. Precisa ser de domínio
 *                    verificado no Resend, senão a API recusa.
 *   SMTP_HOST/PORT/USER/PASS/FROM   caminho SMTP (local)
 */

import nodemailer from "nodemailer";
import { registrarEnvioEmail } from "./db";

const SMTP_HOST = process.env.SMTP_HOST || "smtp.gmail.com";
const SMTP_PORT = Number(process.env.SMTP_PORT || "587");
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER;

const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const EMAIL_FROM = process.env.EMAIL_FROM || SMTP_FROM;

export type Transporte = "resend" | "smtp" | "nenhum";

export function transporteAtivo(): Transporte {
  if (RESEND_API_KEY) return "resend";
  if (SMTP_USER && SMTP_PASS) return "smtp";
  return "nenhum";
}

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
export function emailMode(): { dryRun: boolean; testRecipients: string[]; configured: boolean; transporte: Transporte; remetente: string } {
  return {
    dryRun: isDryRun(), testRecipients: destinatariosDeTeste(),
    configured: isEmailConfigured(), transporte: transporteAtivo(), remetente: EMAIL_FROM,
  };
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
  /** Digest: papel de quem recebe e blocos incluídos — vão para a auditoria. */
  role?: string;
  blocos?: string[];
}

/**
 * Etiqueta discreta no corpo, para ninguém confundir teste com envio real.
 *
 * Quando o remetente ainda é o domínio de sandbox do Resend, a etiqueta diz
 * isso na cara: nesse modo o Resend só entrega para o dono da conta, e quem
 * receber precisa saber por que o remetente está estranho.
 */
function marcarCorpoDeTeste(html: string, destinoOriginal: string): string {
  const sandbox = /resend\.dev/i.test(EMAIL_FROM);
  return `<div style="background:#FEF3C7;border:1px solid #FCD34D;color:#92400E;padding:8px 12px;border-radius:6px;font:12px Arial,sans-serif;margin:0 0 12px">
  Envio de teste redirecionado &middot; o destinatário real seria <strong>${destinoOriginal}</strong>.${
    sandbox ? "<br>Envio de teste via Resend usando domínio não verificado." : ""}
</div>${html}`;
}

/**
 * Entrega para UM endereço e devolve o id da mensagem. LANÇA em caso de falha —
 * quem chama registra o erro. Nunca engolir aqui: era exatamente isso que
 * escondia o bloqueio de SMTP do Railway.
 */
async function entregar(para: string, assunto: string, html: string, text?: string): Promise<string> {
  if (RESEND_API_KEY) {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: EMAIL_FROM, to: [para], subject: assunto, html, ...(text ? { text } : {}) }),
    });
    const corpo = await resp.text();
    if (!resp.ok) {
      // A mensagem do Resend é específica e útil ("domain not verified",
      // "from must be a verified domain") — vale propagar inteira.
      throw new Error(`Resend ${resp.status}: ${corpo.slice(0, 300)}`);
    }
    try { return (JSON.parse(corpo) as { id?: string }).id ?? "sem-id"; } catch { return "sem-id"; }
  }

  const info = await getTransporter().sendMail({ from: EMAIL_FROM, to: para, subject: assunto, html, text });
  return info.messageId;
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
        redirecionado, status: "dry_run", transporte: transporteAtivo(), role: opts.role, blocos: opts.blocos, userId: opts.userId,
      });
      continue;
    }

    try {
      const corpo = redirecionado ? marcarCorpoDeTeste(opts.html, destinoOriginal) : opts.html;
      const messageId = await entregar(para, assunto, corpo, opts.text);
      logger.info(`[EmailService] ✓ ${tipo} → ${para}${redirecionado ? ` (original: ${destinoOriginal})` : ""} · ${transporteAtivo()} · ${messageId}`);
      entregas.push({ ...base, ok: true, messageId });
      await registrarEnvioEmail({
        tipo, assunto, destinatarioOriginal: destinoOriginal, destinatarioFinal: para,
        redirecionado, status: "sent", transporte: transporteAtivo(), role: opts.role, blocos: opts.blocos, messageId, userId: opts.userId,
      });
    } catch (err) {
      const msg = (err as Error)?.message ?? String(err);
      logger.error(`[EmailService] ✗ ${tipo} → ${para} FALHOU: ${msg}`);
      entregas.push({ ...base, ok: false, erro: msg });
      await registrarEnvioEmail({
        tipo, assunto, destinatarioOriginal: destinoOriginal, destinatarioFinal: para,
        redirecionado, status: "failed", transporte: transporteAtivo(), role: opts.role, blocos: opts.blocos, erro: msg, userId: opts.userId,
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
  return transporteAtivo() !== "nenhum";
}

/** Destinatários padrão do report diário SELVA */
export const DAILY_REPORT_RECIPIENTS = [
  "felberg@selva.agency",
  "natalia@selva.agency",
  "gustavo@selva.agency",
  "beth@selva.agency",
  "victor@selva.agency",
];
