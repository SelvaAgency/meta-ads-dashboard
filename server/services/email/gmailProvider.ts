/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Gmail API — provider de envio isolado
 * ─────────────────────────────────────────────────────────────────────────────
 *  Envia por `users.messages.send` usando OAuth 2.0 server-side de uma conta
 *  Workspace dedicada da SELVA. Existe porque o Railway BLOQUEIA porta SMTP de
 *  saída (25/465/587/2525 dão timeout) — foi por isso que o e-mail nunca chegou
 *  em produção. Gmail API é HTTPS, que a plataforma deixa passar.
 *
 *  ── Isolamento ─────────────────────────────────────────────────────────────
 *  Este arquivo NÃO conhece a trava mestre, nem destinatários reais, nem o
 *  Jornalzinho. Ele monta um MIME e entrega. Quem decide SE pode enviar é o
 *  emailService; quem decide PARA QUEM é o chamador. Misturar as três decisões
 *  aqui é como o envio automático escapa de uma trava que parecia estar no
 *  lugar.
 *
 *  ── Segredos ───────────────────────────────────────────────────────────────
 *  Nenhuma função deste arquivo loga, devolve ou serializa access token ou
 *  refresh token. O erro da API do Google é sanitizado antes de sair
 *  (`sanitizarErroGmail`) porque ele ecoa cabeçalhos em alguns casos, e esse
 *  texto vai parar no email_send_log e na tela do admin.
 *
 *  ── Escopo ─────────────────────────────────────────────────────────────────
 *  Só `gmail.send`: permite enviar, NÃO permite ler a caixa. É a diferença
 *  entre um vazamento que manda e-mail e um que lê todo o histórico da agência.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { logger } from "../../logger";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

/** O único escopo que pedimos. Enviar, nunca ler. */
export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.send";

export interface GmailCredenciais {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

export interface MensagemGmail {
  /** Remetente. Precisa ser a conta conectada — o Gmail recusa outro. */
  de: string;
  para: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string;
  assunto: string;
  html: string;
  texto?: string;
}

export interface EnvioGmailOk {
  messageId: string;
  threadId: string | null;
}

// ─── Sanitização ─────────────────────────────────────────────────────────────

/**
 * Tira qualquer coisa com cara de credencial do texto de erro ANTES de ele
 * virar log ou linha de auditoria. A resposta de erro do Google às vezes ecoa o
 * cabeçalho da requisição; um `Authorization: Bearer ya29…` gravado no
 * email_send_log seria um token de produção em texto puro numa tabela que o
 * admin lê pela tela.
 */
export function sanitizarErroGmail(texto: string): string {
  return texto
    .replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, "Bearer [REDIGIDO]")
    .replace(/"?(access_token|refresh_token|id_token|client_secret)"?\s*[:=]\s*"?[A-Za-z0-9._\-/+]+"?/gi, "$1=[REDIGIDO]")
    .replace(/\b(ya29|1\/\/)[A-Za-z0-9._\-/+]{10,}/g, "[REDIGIDO]")
    .slice(0, 500);
}

// ─── MIME ────────────────────────────────────────────────────────────────────

/**
 * Assunto em UTF-8 pelo encoded-word da RFC 2047.
 *
 * Cabeçalho MIME é ASCII. "Jornalzinho · atenção" sem codificar chega como
 * "JornalzinhoÂ Â· atenÃ§Ã£o" — e a primeira coisa que o time veria do sistema
 * novo seria acento quebrado. `=?UTF-8?B?<base64>?=` resolve para qualquer
 * caractere. Só codifica quando precisa: assunto ASCII fica legível no log.
 */
export function codificarAssunto(assunto: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x20-\x7E]*$/.test(assunto)) return assunto;
  return `=?UTF-8?B?${Buffer.from(assunto, "utf8").toString("base64")}?=`;
}

const listaDe = (v: string | string[] | undefined): string[] =>
  (Array.isArray(v) ? v : v ? [v] : []).map((e) => e.trim()).filter(Boolean);

/**
 * base64url — o que a Gmail API espera no campo `raw`.
 *
 * NÃO é base64 comum: `+` e `/` precisam virar `-` e `_`, e o padding some.
 * Mandar base64 padrão devolve um 400 genérico que não diz o que está errado.
 */
export function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Monta a mensagem MIME.
 *
 * `multipart/alternative` quando há texto E html: o cliente escolhe o que sabe
 * renderizar. Só-HTML vira uma parte única — mandar HTML puro sem alternativa
 * de texto piora a entregabilidade e quebra em leitor de tela.
 *
 * Bcc entra como cabeçalho: a Gmail API o usa para entregar e NÃO o repassa aos
 * outros destinatários (é o comportamento do próprio Gmail).
 */
export function montarMime(m: MensagemGmail): string {
  const para = listaDe(m.para);
  const cc = listaDe(m.cc);
  const bcc = listaDe(m.bcc);
  if (para.length === 0) throw new Error("Gmail: mensagem sem destinatário.");

  const cabecalhos: string[] = [
    `From: ${m.de}`,
    `To: ${para.join(", ")}`,
    ...(cc.length ? [`Cc: ${cc.join(", ")}`] : []),
    ...(bcc.length ? [`Bcc: ${bcc.join(", ")}`] : []),
    ...(m.replyTo ? [`Reply-To: ${m.replyTo}`] : []),
    `Subject: ${codificarAssunto(m.assunto)}`,
    "MIME-Version: 1.0",
  ];

  if (!m.texto) {
    return [...cabecalhos, 'Content-Type: text/html; charset="UTF-8"', "", m.html].join("\r\n");
  }

  // Fronteira sem depender de aleatoriedade criptográfica: só precisa não
  // aparecer no corpo, e o prefixo fixo + timestamp já garante isso na prática.
  const b = `=_selva_${Date.now().toString(36)}`;
  return [
    ...cabecalhos,
    `Content-Type: multipart/alternative; boundary="${b}"`,
    "",
    `--${b}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "",
    m.texto,
    "",
    `--${b}`,
    'Content-Type: text/html; charset="UTF-8"',
    "",
    m.html,
    "",
    `--${b}--`,
    "",
  ].join("\r\n");
}

// ─── Token ───────────────────────────────────────────────────────────────────

/**
 * Cache do access token em memória, chaveado por um HASH do refresh token —
 * nunca pelo token em si, para ele não virar chave de Map inspecionável num
 * heap dump. O access token vale ~1h; renovar a cada envio seria uma chamada
 * extra por e-mail e um jeito rápido de bater no rate limit do Google.
 */
const cacheToken = new Map<string, { token: string; expiraEm: number }>();

async function chaveDeCache(refreshToken: string): Promise<string> {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(refreshToken).digest("hex").slice(0, 32);
}

/** Troca refresh token por access token. LANÇA com mensagem já sanitizada. */
export async function obterAccessToken(cred: GmailCredenciais): Promise<string> {
  const chave = await chaveDeCache(cred.refreshToken);
  const emCache = cacheToken.get(chave);
  if (emCache && Date.now() < emCache.expiraEm - 60_000) return emCache.token;

  const resp = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: cred.clientId,
      client_secret: cred.clientSecret,
      refresh_token: cred.refreshToken,
      grant_type: "refresh_token",
    }),
  });

  const corpo = await resp.text();
  if (!resp.ok) {
    // `invalid_grant` é o caso real de campo: consentimento revogado, senha da
    // conta trocada ou refresh token expirado por desuso. Merece nome próprio,
    // senão vira "erro 400" e alguém vai procurar bug no código.
    const sanitizado = sanitizarErroGmail(corpo);
    if (/invalid_grant/i.test(corpo)) {
      throw new Error("Gmail: autorização expirada ou revogada — é preciso reconectar a conta.");
    }
    throw new Error(`Gmail: falha ao renovar o token (${resp.status}) · ${sanitizado}`);
  }

  let data: { access_token?: string; expires_in?: number };
  try { data = JSON.parse(corpo); } catch { throw new Error("Gmail: resposta inesperada ao renovar o token."); }
  if (!data.access_token) throw new Error("Gmail: resposta sem access_token.");

  cacheToken.set(chave, {
    token: data.access_token,
    expiraEm: Date.now() + (data.expires_in ?? 3600) * 1000,
  });
  return data.access_token;
}

/** Esquece o token em cache — usado ao desconectar, para não sobrar sessão viva. */
export async function limparCacheToken(refreshToken?: string): Promise<void> {
  if (!refreshToken) { cacheToken.clear(); return; }
  cacheToken.delete(await chaveDeCache(refreshToken));
}

// ─── Envio ───────────────────────────────────────────────────────────────────

/**
 * Entrega UMA mensagem. LANÇA em caso de falha — nunca devolve `false` mudo.
 *
 * Engolir a falha aqui é exatamente o que escondeu o bloqueio de SMTP do
 * Railway por semanas: o job registrava sucesso, o e-mail não chegava, e o
 * único vestígio era um console.error que o deploy apagava.
 */
export async function enviarPeloGmail(cred: GmailCredenciais, m: MensagemGmail): Promise<EnvioGmailOk> {
  const accessToken = await obterAccessToken(cred);
  const raw = base64url(Buffer.from(montarMime(m), "utf8"));

  const resp = await fetch(GMAIL_SEND_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw }),
  });

  const corpo = await resp.text();
  if (!resp.ok) {
    const sanitizado = sanitizarErroGmail(corpo);
    // Log sem o token: o Authorization não é ecoado aqui de propósito.
    logger.error(`[Gmail] envio falhou (${resp.status}): ${sanitizado}`);
    if (resp.status === 403 && /insufficient|scope/i.test(corpo)) {
      throw new Error("Gmail: a conta conectada não concedeu o escopo gmail.send — reconecte autorizando o envio.");
    }
    throw new Error(`Gmail ${resp.status}: ${sanitizado}`);
  }

  try {
    const data = JSON.parse(corpo) as { id?: string; threadId?: string };
    return { messageId: data.id ?? "sem-id", threadId: data.threadId ?? null };
  } catch {
    return { messageId: "sem-id", threadId: null };
  }
}

/**
 * Verifica se a conexão ainda está viva SEM enviar nada: só renova o token.
 * "Conectado" é promessa do dia da autorização — isto transforma em fato.
 */
export async function verificarConexaoGmail(cred: GmailCredenciais): Promise<void> {
  await obterAccessToken(cred);
}
