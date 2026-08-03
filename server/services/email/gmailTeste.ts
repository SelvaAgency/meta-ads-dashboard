/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Teste controlado do Gmail — o ÚNICO caminho que não passa pela trava mestre
 * ─────────────────────────────────────────────────────────────────────────────
 *  Por que ele existe: `EMAIL_AUTOMATION_ENABLED` bloqueia TUDO dentro de
 *  sendEmail, inclusive os testes. Isso é correto — foi assim que os ~10
 *  e-mails acidentais das 06:30/07:30 pararam. Mas significa que, com a trava
 *  desligada, não há como provar que o Gmail funciona antes de religá-la, e
 *  religar para descobrir é exatamente a ordem errada.
 *
 *  Então este caminho existe para quebrar esse impasse — e SÓ ele. As travas
 *  aqui não são as mesmas do envio automático; são mais apertadas:
 *
 *    1. UM destinatário. Não é lista, não é array, não aceita vírgula. Um
 *       laço aqui viraria disparo em massa por um caminho que não tem trava
 *       mestre.
 *    2. Digitado pelo admin na hora E validado contra admin/dev. Não lê
 *       DAILY_REPORT_RECIPIENTS, não lê EMAIL_TEST_RECIPIENT, não cai em
 *       contato@. Nenhuma lista real é alcançável daqui, e nenhum endereço
 *       arbitrário passa: na fase restrita, este era o último campo que ainda
 *       aceitava qualquer e-mail.
 *    3. Conteúdo fixo. O corpo não vem do chamador: é sempre o mesmo texto de
 *       teste. Sem isso, este vira um endpoint de envio arbitrário sem trava.
 *    4. Só Gmail. Não toca no Resend nem no SMTP em nenhuma hipótese.
 *    5. Fora dos crons. Nada agendado chama esta função — só a ação manual.
 *
 *  NÃO altera EMAIL_AUTOMATION_ENABLED, e o envio automático continua pausado
 *  depois de rodar isto quantas vezes for.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { logger } from "../../logger";
import { getConexaoGmailAgencia, registrarEnvioEmail, registrarVerificacaoIntegracao } from "../../db";
import { decryptSecret, isEncryptionConfigured } from "../../_core/integrationsCrypto";
import { enviarPeloGmail, sanitizarErroGmail } from "./gmailProvider";
import { resolverDestinatariosAdminDev, validarDestinatarios, normalizarEmail, MODO_ADMIN_DEV } from "./destinatarios";

/** Rótulo próprio na auditoria: separa teste de envio de verdade num filtro. */
export const TIPO_TESTE_GMAIL = "GMAIL_TEST";

export const ASSUNTO_TESTE = "Teste Gmail API — SELVA Spaces";

/**
 * Validação de e-mail deliberadamente restritiva: recusa vírgula, ponto-e-vírgula
 * e espaço. Um "a@x.com, b@y.com" que passasse viraria dois destinatários num
 * caminho que não tem trava mestre — a regra "um só" precisa ser verificada,
 * não presumida.
 */
export function ehDestinatarioUnicoValido(email: string): boolean {
  const e = email.trim();
  if (!e || /[,;\s]/.test(e)) return false;
  return /^[^@]+@[^@]+\.[^@]+$/.test(e);
}

export interface PreviaTesteGmail {
  remetente: string;
  destinatario: string;
  assunto: string;
  conectado: boolean;
  /** Motivo de não dar para enviar. `null` quando está tudo pronto. */
  impedimento: string | null;
}

function corpoTeste(quando: string, quem: string) {
  const html = `<div style="font:14px/1.6 Arial,sans-serif;color:#222">
  <p><strong>Teste controlado da Gmail API — SELVA Spaces.</strong></p>
  <p>Se você está lendo isto, o envio pela conta remetente do Google Workspace funcionou.</p>
  <p style="color:#666;font-size:12px">
    Disparado manualmente por ${quem} em ${quando}.<br>
    Este é um teste pontual: o envio automático (Jornalzinho e alertas) continua <strong>pausado</strong>.
  </p>
</div>`;
  const texto = `Teste controlado da Gmail API — SELVA Spaces.

Se você está lendo isto, o envio pela conta remetente do Google Workspace funcionou.

Disparado manualmente por ${quem} em ${quando}.
Este é um teste pontual: o envio automático (Jornalzinho e alertas) continua pausado.`;
  return { html, texto };
}

async function credenciais() {
  const conexao = await getConexaoGmailAgencia();
  if (!conexao?.refreshTokenEncrypted) throw new Error("Gmail não conectado.");
  if (!isEncryptionConfigured()) throw new Error("INTEGRATIONS_ENCRYPTION_KEY ausente.");
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID || "";
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET || "";
  if (!clientId || !clientSecret) throw new Error("GOOGLE_ADS_CLIENT_ID/SECRET ausentes.");
  if (!conexao.providerAccountEmail) throw new Error("A conexão não registrou o e-mail da conta — reconecte.");
  return {
    conexao,
    cred: { clientId, clientSecret, refreshToken: decryptSecret(conexao.refreshTokenEncrypted) },
    remetente: conexao.providerAccountEmail,
  };
}

/**
 * O que VAI acontecer, antes de acontecer. A tela mostra remetente, destinatário
 * e assunto e só então habilita o botão — confirmar às cegas é como se manda
 * e-mail para a pessoa errada.
 */
export async function previaTesteGmail(destinatario: string): Promise<PreviaTesteGmail> {
  const conexao = await getConexaoGmailAgencia();
  const base: PreviaTesteGmail = {
    remetente: conexao?.providerAccountEmail ?? "—",
    destinatario: destinatario.trim(),
    assunto: ASSUNTO_TESTE,
    conectado: !!conexao?.refreshTokenEncrypted,
    impedimento: null,
  };
  if (!conexao?.refreshTokenEncrypted) {
    return { ...base, impedimento: "Gmail não conectado. Conecte a conta remetente antes de testar." };
  }
  if (!conexao.providerAccountEmail) {
    return { ...base, impedimento: "A conexão não registrou o e-mail da conta — reconecte." };
  }
  if (!ehDestinatarioUnicoValido(destinatario)) {
    return { ...base, impedimento: "Informe UM endereço válido (sem vírgulas nem listas)." };
  }
  const fora = await destinatarioForaDaFaseRestrita(destinatario);
  if (fora) return { ...base, impedimento: fora };
  return base;
}

/**
 * Na fase restrita, nem o teste manual aceita endereço arbitrário.
 *
 * Diferente do envio automático, aqui a checagem NÃO depende de
 * `EMAIL_RECIPIENT_MODE`: o teste roda justamente enquanto as variáveis ainda
 * não foram configuradas, e amarrar a trava a uma env não-definida deixaria o
 * campo aberto exatamente na janela em que ele é usado. A lista admin/dev vem
 * do banco e vale sempre.
 *
 * Devolve o motivo do bloqueio, ou `null` se o endereço é permitido.
 */
async function destinatarioForaDaFaseRestrita(destinatario: string): Promise<string | null> {
  const permitidos = await resolverDestinatariosAdminDev();
  if (permitidos.length === 0) {
    return "Nenhum usuário admin/dev ativo com e-mail cadastrado — não há destinatário permitido.";
  }
  const v = validarDestinatarios([destinatario], permitidos.map((p) => p.email));
  if (v.ok) return null;
  return `${normalizarEmail(destinatario)} não é um usuário admin/dev ativo. Nesta fase o teste só pode ir para admin ou developer.`;
}

export interface ResultadoTesteGmail {
  ok: boolean;
  remetente: string;
  destinatario: string;
  assunto: string;
  messageId?: string;
  threadId?: string | null;
  erro?: string;
  duracaoMs: number;
}

/**
 * Envia o teste. Auditado como GMAIL_TEST tanto no sucesso quanto na falha —
 * um teste que não deixa rastro não serve para provar nada depois.
 */
export async function enviarTesteGmail(
  destinatario: string,
  quem: { id: number; nome: string | null },
): Promise<ResultadoTesteGmail> {
  const para = destinatario.trim();

  // Revalidação no SERVIDOR. As regras não podem viver só na tela: quem chama a
  // API direto pularia a validação do formulário inteira.
  if (!ehDestinatarioUnicoValido(para)) {
    throw new Error("Informe UM endereço de e-mail válido (sem vírgulas, ponto-e-vírgula ou espaços).");
  }
  const fora = await destinatarioForaDaFaseRestrita(para);
  if (fora) throw new Error(fora);

  const quando = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short",
  }).format(new Date());
  const autor = quem.nome ?? `usuário ${quem.id}`;
  const { html, texto } = corpoTeste(quando, autor);

  const inicio = Date.now();
  let remetente = "—";
  try {
    const c = await credenciais();
    remetente = c.remetente;
    const r = await enviarPeloGmail(c.cred, {
      de: c.remetente, para, assunto: ASSUNTO_TESTE, html, texto,
    });
    const duracaoMs = Date.now() - inicio;

    logger.info(`[GmailTeste] ✓ ${para} · ${r.messageId} · ${duracaoMs}ms`);
    await registrarVerificacaoIntegracao(c.conexao.id, "ok", null);
    await registrarEnvioEmail({
      tipo: TIPO_TESTE_GMAIL, assunto: ASSUNTO_TESTE,
      destinatarioOriginal: para, destinatarioFinal: para,
      redirecionado: false, status: "sent", transporte: "gmail",
      // A regra aplicada aqui é a da fase restrita, independente da env — é ela
      // que o histórico precisa registrar, não o que estava configurado.
      recipientMode: MODO_ADMIN_DEV,
      messageId: r.messageId, userId: quem.id, remetente: c.remetente, duracaoMs,
    });
    return { ok: true, remetente: c.remetente, destinatario: para, assunto: ASSUNTO_TESTE, messageId: r.messageId, threadId: r.threadId, duracaoMs };
  } catch (e) {
    const erro = sanitizarErroGmail((e as Error)?.message ?? String(e));
    const duracaoMs = Date.now() - inicio;
    logger.error(`[GmailTeste] ✗ ${para} FALHOU (${duracaoMs}ms): ${erro}`);

    const conexao = await getConexaoGmailAgencia();
    if (conexao) await registrarVerificacaoIntegracao(conexao.id, "erro", erro);
    await registrarEnvioEmail({
      tipo: TIPO_TESTE_GMAIL, assunto: ASSUNTO_TESTE,
      destinatarioOriginal: para, destinatarioFinal: para,
      redirecionado: false, status: "failed", transporte: "gmail",
      recipientMode: MODO_ADMIN_DEV,
      erro, userId: quem.id, remetente, duracaoMs,
    });
    return { ok: false, remetente, destinatario: para, assunto: ASSUNTO_TESTE, erro, duracaoMs };
  }
}
