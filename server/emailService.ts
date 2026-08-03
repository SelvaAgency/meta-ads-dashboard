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
 * Por isso todo transporte daqui é HTTPS ou fica de fora de produção.
 *
 * ─── Três transportes, escolha EXPLÍCITA ────────────────────────────────────
 *   gmail   → Gmail API (users.messages.send) com a conta Workspace da SELVA.
 *   resend  → API do Resend. Legado/fallback MANUAL — nunca automático.
 *   smtp    → nodemailer. Só faz sentido fora do Railway (local/dev).
 *
 * `EMAIL_PROVIDER` diz qual é. Ausente ou inválida → NÃO envia. Antes a escolha
 * era deduzida da presença de RESEND_API_KEY; com dois providers isso vira uma
 * decisão de produção que ninguém revisa porque não está escrita.
 *
 * NÃO existe fallback automático entre providers. Gmail falhou = envio falhou,
 * registrado como falha. Cair no Resend em silêncio faria o e-mail sair pelo
 * remetente errado sem ninguém saber por quê.
 *
 * Variáveis:
 *   EMAIL_PROVIDER   gmail | resend | smtp  (obrigatória para enviar)
 *   RESEND_API_KEY   chave da API (quando provider=resend)
 *   EMAIL_FROM       remetente do Resend/SMTP; domínio verificado. No Gmail o
 *                    remetente é a conta conectada, não esta variável.
 *   SMTP_HOST/PORT/USER/PASS/FROM   caminho SMTP (local)
 *
 * A conexão do Gmail (refresh token cifrado) vive no banco, em
 * user_integrations — ver services/email/gmailProvider.ts.
 */

import nodemailer from "nodemailer";
import { registrarEnvioEmail, getConexaoGmailAgencia } from "./db";
import { decryptSecret, isEncryptionConfigured } from "./_core/integrationsCrypto";
import { enviarPeloGmail, sanitizarErroGmail, type GmailCredenciais } from "./services/email/gmailProvider";

const SMTP_HOST = process.env.SMTP_HOST || "smtp.gmail.com";
const SMTP_PORT = Number(process.env.SMTP_PORT || "587");
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER;

/**
 * Lidas na CHAMADA, não no import.
 *
 * `envioAutomaticoHabilitado()` sempre leu assim, mas o dry-run e o desvio de
 * teste eram capturados no topo do módulo. Duas travas do mesmo assunto com
 * comportamentos diferentes é como alguém conclui "mudei a variável e não
 * mudou nada" — e a conclusão errada, num interruptor de envio, é cara. Em
 * produção o env não muda depois do boot, então o resultado é idêntico; o que
 * muda é que agora dá para testar a trava.
 */
const RESEND_API_KEY = () => process.env.RESEND_API_KEY || "";
const EMAIL_FROM = () =>
  process.env.EMAIL_FROM || process.env.SMTP_FROM || process.env.SMTP_USER || "";

export type Transporte = "gmail" | "resend" | "smtp" | "nenhum";

const PROVIDERS_VALIDOS = ["gmail", "resend", "smtp"] as const;
export type ProviderEmail = (typeof PROVIDERS_VALIDOS)[number];

/**
 * ─── Escolha do provider: EXPLÍCITA ─────────────────────────────────────────
 * Antes era por dedução: "tem RESEND_API_KEY? então Resend; senão SMTP". Com um
 * provider só isso passava, mas com Gmail entrando a dedução vira uma decisão
 * de produção tomada por presença de variável — e ninguém revisa uma decisão
 * que não está escrita em lugar nenhum.
 *
 * Agora `EMAIL_PROVIDER` diz qual é, e:
 *   - ausente ou inválido → "nenhum". NÃO envia. Não adivinha.
 *   - nomeado mas sem credencial → "nenhum", com o motivo em `porqueNaoEnvia()`.
 *
 * NÃO existe fallback automático. Se o Gmail falhar, o envio falha e é
 * registrado como falha — cair no Resend em silêncio produziria e-mail saindo
 * pelo remetente errado sem ninguém saber por quê.
 */
export function providerConfigurado(): ProviderEmail | null {
  const v = (process.env.EMAIL_PROVIDER || "").trim().toLowerCase();
  return (PROVIDERS_VALIDOS as readonly string[]).includes(v) ? (v as ProviderEmail) : null;
}

/** Credenciais presentes para o provider escolhido? */
function temCredencial(p: ProviderEmail): boolean {
  if (p === "resend") return !!RESEND_API_KEY();
  if (p === "smtp") return !!(SMTP_USER && SMTP_PASS);
  return true; // gmail: a credencial vive no banco (OAuth) — checada no envio
}

export function transporteAtivo(): Transporte {
  const p = providerConfigurado();
  if (!p) return "nenhum";
  return temCredencial(p) ? p : "nenhum";
}

/** Frase única explicando por que nada sai — a UI mostra isto em vez de "erro". */
export function porqueNaoEnvia(): string | null {
  const bruto = (process.env.EMAIL_PROVIDER || "").trim();
  if (!bruto) return "EMAIL_PROVIDER não definida. Escolha explicitamente: gmail, resend ou smtp.";
  const p = providerConfigurado();
  if (!p) return `EMAIL_PROVIDER="${bruto}" é inválida. Use gmail, resend ou smtp.`;
  if (!temCredencial(p)) {
    return p === "resend"
      ? "EMAIL_PROVIDER=resend, mas RESEND_API_KEY não está definida."
      : "EMAIL_PROVIDER=smtp, mas SMTP_USER/SMTP_PASS não estão definidos.";
  }
  return null;
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

/**
 * Lista, não endereço único: a validação precisa chegar em mais de uma pessoa
 * (admin + dev) sem que ninguém use CC — cada destino é um envio próprio, com
 * seu próprio registro de sucesso ou falha.
 */
const EMAIL_TEST_RECIPIENTS = (): string[] =>
  (process.env.EMAIL_TEST_RECIPIENT || "").split(",").map((e) => e.trim()).filter(Boolean);

export function isDryRun(): boolean {
  const explicito = process.env.EMAIL_DRY_RUN;
  if (explicito === "true") return true;
  if (explicito === "false") return false;
  return process.env.NODE_ENV !== "production"; // sem declaração: só produção envia de verdade
}

/**
 * ─── Interruptor MESTRE de envio automático ─────────────────────────────────
 * Fail-safe: só envia quando EMAIL_AUTOMATION_ENABLED === "true". Qualquer
 * outro valor — inclusive ausência — deixa TUDO pausado. A trava fica antes de
 * qualquer coisa em sendEmail, então nenhum caminho (cron, digest, alerta,
 * financeiro, owner, teste manual) escapa, e nada é desviado para
 * EMAIL_TEST_RECIPIENT.
 *
 * Por que existe: mesmo com a lógica correta e sem duplicar, em produção
 * chegaram ~10 emails numa caixa ÚNICA de teste às 06:30/07:30 — porque
 * EMAIL_TEST_RECIPIENT desviava todo o envio real. Enquanto Gmail API e
 * destinatários finais não estiverem definidos, o certo é NÃO enviar nada:
 * gerar conteúdo, logar, preview e dry-run seguem; envio real, não. Para
 * religar, defina EMAIL_AUTOMATION_ENABLED=true (e os destinatários corretos).
 */
export function envioAutomaticoHabilitado(): boolean {
  return process.env.EMAIL_AUTOMATION_ENABLED === "true";
}

export function destinatariosDeTeste(): string[] {
  return EMAIL_TEST_RECIPIENTS();
}

/** Como o envio está configurado agora — a UI mostra isso antes de disparar. */
export function emailMode(): { dryRun: boolean; testRecipients: string[]; configured: boolean; transporte: Transporte; remetente: string; automacaoHabilitada: boolean } {
  return {
    dryRun: isDryRun(), testRecipients: destinatariosDeTeste(),
    configured: isEmailConfigured(), transporte: transporteAtivo(), remetente: EMAIL_FROM(),
    automacaoHabilitada: envioAutomaticoHabilitado(),
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
  /** true quando o interruptor mestre está desligado: nada foi enviado. */
  pausado?: boolean;
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
 * Cabeçalho de auditoria do modo teste.
 *
 * Com o desvio ligado, várias versões do MESMO e-mail caem na mesma caixa — uma
 * por destinatário original. Isso é o comportamento correto, não um bug: cada
 * pessoa tem um conteúdo diferente e todas precisam ser conferidas. Mas sem
 * dizer de quem é cada versão, a caixa vira um monte de e-mails iguais.
 *
 * Por isso o cabeçalho declara, em vez de deixar adivinhar, para quem aquele
 * conteúdo foi montado e por quê.
 */
function marcarCorpoDeTeste(html: string, destinoOriginal: string, destinoFinal: string, role?: string): string {
  const sandbox = /resend\.dev/i.test(EMAIL_FROM());
  const linha = (k: string, v: string) =>
    `<tr><td style="padding:1px 10px 1px 0;color:#A16207;white-space:nowrap">${k}</td><td style="padding:1px 0;color:#78350F"><strong>${v}</strong></td></tr>`;
  return `<div style="background:#FEF3C7;border:1px solid #FCD34D;border-radius:6px;padding:10px 12px;font:12px Arial,sans-serif;margin:0 0 12px">
  <p style="margin:0 0 6px;font-weight:bold;color:#92400E">Envio de teste redirecionado</p>
  <table style="border-collapse:collapse;font:12px Arial,sans-serif">
    ${linha("Destinatário original:", destinoOriginal)}
    ${linha("Destinatário final:", destinoFinal)}
    ${role ? linha("Role:", role) : ""}
    ${linha("Redirecionado por EMAIL_TEST_RECIPIENT:", "sim")}
  </table>
  ${sandbox ? `<p style="margin:6px 0 0;color:#A16207">Envio de teste via Resend usando domínio não verificado.</p>` : ""}
</div>${html}`;
}

/**
 * Assunto do modo teste: diz de quem é a versão logo na lista da caixa de
 * entrada, sem precisar abrir cada uma para descobrir.
 */
function assuntoDeTeste(assunto: string, destinoOriginal: string, role?: string): string {
  return `[TESTE] ${assunto}${role ? ` — visão ${role}` : ""} — original: ${destinoOriginal}`;
}

/**
 * Entrega para UM endereço e devolve o id da mensagem. LANÇA em caso de falha —
 * quem chama registra o erro. Nunca engolir aqui: era exatamente isso que
 * escondia o bloqueio de SMTP do Railway.
 */
async function entregar(para: string, assunto: string, html: string, text?: string): Promise<{ messageId: string; remetente: string }> {
  const provider = providerConfigurado();

  // Sem provider nomeado, nada sai. Fail-closed: adivinhar aqui seria escolher
  // por quem o e-mail da agência sai sem ninguém ter decidido isso.
  if (!provider || transporteAtivo() === "nenhum") {
    throw new Error(porqueNaoEnvia() ?? "Nenhum provider de e-mail configurado.");
  }

  if (provider === "gmail") {
    // A credencial do Gmail vive no banco (OAuth), não no env. Falha aqui é
    // falha do envio — NUNCA cai no Resend por conta própria.
    const cred = await credenciaisGmail();
    const { messageId } = await enviarPeloGmail(cred, {
      de: cred.remetente, para, assunto, html, texto: text,
    });
    return { messageId, remetente: cred.remetente };
  }

  if (provider === "resend") {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: EMAIL_FROM(), to: [para], subject: assunto, html, ...(text ? { text } : {}) }),
    });
    const corpo = await resp.text();
    if (!resp.ok) {
      // A mensagem do Resend é específica e útil ("domain not verified",
      // "from must be a verified domain") — vale propagar inteira.
      throw new Error(`Resend ${resp.status}: ${corpo.slice(0, 300)}`);
    }
    try {
      return { messageId: (JSON.parse(corpo) as { id?: string }).id ?? "sem-id", remetente: EMAIL_FROM() };
    } catch { return { messageId: "sem-id", remetente: EMAIL_FROM() }; }
  }

  const info = await getTransporter().sendMail({ from: EMAIL_FROM(), to: para, subject: assunto, html, text });
  return { messageId: info.messageId, remetente: EMAIL_FROM() };
}

/**
 * Credenciais do Gmail da agência, decifradas na hora do envio. Falha alto e
 * com motivo legível — "não conectado" e "chave de criptografia ausente" são
 * problemas diferentes e levam a ações diferentes.
 */
async function credenciaisGmail(): Promise<GmailCredenciais & { remetente: string }> {
  const conexao = await getConexaoGmailAgencia();
  if (!conexao?.refreshTokenEncrypted) {
    throw new Error("Gmail não conectado. Conecte a conta remetente em Configurações → Conexões.");
  }
  if (!isEncryptionConfigured()) {
    throw new Error("INTEGRATIONS_ENCRYPTION_KEY ausente — não dá para ler o token guardado.");
  }
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID || "";
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET || "";
  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_ADS_CLIENT_ID/SECRET ausentes — sem elas não dá para renovar o token do Gmail.");
  }
  const remetente = conexao.providerAccountEmail;
  if (!remetente) {
    throw new Error("A conexão do Gmail não registrou o e-mail da conta. Reconecte para o remetente ser identificado.");
  }
  return {
    clientId, clientSecret,
    refreshToken: decryptSecret(conexao.refreshTokenEncrypted),
    remetente,
  };
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
  const tipo = opts.tipo ?? "outro";

  // ── PAUSA MESTRE ──────────────────────────────────────────────────────────
  // Antes de TUDO: se a automação de email está desligada, nada sai — nem para
  // o destinatário real, nem desviado para EMAIL_TEST_RECIPIENT. Só registra
  // quem TERIA recebido, para a auditoria não perder o rastro. Fail-safe: esta
  // é a primeira coisa que roda, então nenhum caminho novo fura a pausa.
  if (!envioAutomaticoHabilitado()) {
    const entregas: EntregaEmail[] = [];
    for (const destinoOriginal of destinos) {
      logger.warn(`[EmailService] email automático pausado — envio não realizado · ${tipo} · destinatário ${destinoOriginal} · "${opts.subject}"`);
      entregas.push({ para: destinoOriginal, destinoOriginal, ok: true, dryRun: true, redirecionado: false });
      await registrarEnvioEmail({
        tipo, assunto: opts.subject, destinatarioOriginal: destinoOriginal, destinatarioFinal: destinoOriginal,
        redirecionado: false, status: "paused", transporte: transporteAtivo(),
        role: opts.role, blocos: opts.blocos, userId: opts.userId,
      });
    }
    return { ok: true, dryRun: true, redirecionado: false, pausado: true, entregas };
  }

  const dryRun = isDryRun();
  const teste = destinatariosDeTeste();
  const redirecionado = teste.length > 0;

  // Com desvio ligado, cada destino original vira um envio para CADA endereço de
  // teste — e cada par (original → teste) é registrado separado. Sem desvio,
  // um envio por destinatário real.
  const pares: { destinoOriginal: string; para: string }[] = redirecionado
    ? destinos.flatMap((orig) => teste.map((t) => ({ destinoOriginal: orig, para: t })))
    : destinos.map((d) => ({ destinoOriginal: d, para: d }));

  const entregas: EntregaEmail[] = [];

  for (const { destinoOriginal, para } of pares) {
    const base = { para, destinoOriginal, dryRun, redirecionado };
    // Por par: com desvio, cada versão precisa se identificar no assunto.
    const assunto = redirecionado ? assuntoDeTeste(opts.subject, destinoOriginal, opts.role) : opts.subject;

    if (dryRun) {
      logger.info(`[EmailService] DRY-RUN · ${tipo} · não enviado para ${para} · "${assunto}"`);
      entregas.push({ ...base, ok: true });
      await registrarEnvioEmail({
        tipo, assunto, destinatarioOriginal: destinoOriginal, destinatarioFinal: para,
        redirecionado, status: "dry_run", transporte: transporteAtivo(), role: opts.role, blocos: opts.blocos, userId: opts.userId,
      });
      continue;
    }

    const inicio = Date.now();
    try {
      const corpo = redirecionado ? marcarCorpoDeTeste(opts.html, destinoOriginal, para, opts.role) : opts.html;
      const { messageId, remetente } = await entregar(para, assunto, corpo, opts.text);
      const duracaoMs = Date.now() - inicio;
      logger.info(`[EmailService] ✓ ${tipo} → ${para}${redirecionado ? ` (original: ${destinoOriginal})` : ""} · ${transporteAtivo()} · ${messageId} · ${duracaoMs}ms`);
      entregas.push({ ...base, ok: true, messageId });
      await registrarEnvioEmail({
        tipo, assunto, destinatarioOriginal: destinoOriginal, destinatarioFinal: para,
        redirecionado, status: "sent", transporte: transporteAtivo(), role: opts.role, blocos: opts.blocos,
        messageId, userId: opts.userId, remetente, duracaoMs,
      });
    } catch (err) {
      // Sanitiza SEMPRE: o erro vai para o log e para a auditoria, e a resposta
      // de erro do Google às vezes ecoa o cabeçalho Authorization.
      const msg = sanitizarErroGmail((err as Error)?.message ?? String(err));
      const duracaoMs = Date.now() - inicio;
      logger.error(`[EmailService] ✗ ${tipo} → ${para} FALHOU (${duracaoMs}ms): ${msg}`);
      entregas.push({ ...base, ok: false, erro: msg });
      await registrarEnvioEmail({
        tipo, assunto, destinatarioOriginal: destinoOriginal, destinatarioFinal: para,
        redirecionado, status: "failed", transporte: transporteAtivo(), role: opts.role, blocos: opts.blocos,
        erro: msg, userId: opts.userId, duracaoMs,
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
