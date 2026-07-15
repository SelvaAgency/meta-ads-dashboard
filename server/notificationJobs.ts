/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Gatilhos de notificação — Performance + Financeiro
 * ─────────────────────────────────────────────────────────────────────────────
 *  Rodam no cron diário (autoSync), depois do sync. Todos idempotentes: o dedup
 *  é por (tipo, referência, dia), então reprocessar o mesmo dia é no-op — tanto
 *  para o in-app quanto para o email (emailSentAt).
 *
 *  Cada gatilho: (1) apura, (2) cria a notificação in-app para quem optou,
 *  (3) envia email para quem optou. Sem SMTP, o passo 3 é pulado em silêncio e
 *  o in-app continua funcionando.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { logger } from "./logger";
import { isEmailConfigured, sendEmail } from "./emailService";
import {
  createNotification, destinatariosEmail, emailJaEnviado, marcarEmailEnviado,
  financeAtrasos, getDailyBriefing, saveDailyBriefing,
  usuariosComTrello, aniversariantesDe, pendentesDoDigest, marcarEmailEnviadoIds,
  usuariosAtivosComEmail, emailModoDe,
} from "./db";
import { decryptSecret } from "./_core/integrationsCrypto";
import { isTrelloConfigured, listMyCards, TrelloAuthError } from "./trelloService";
import { type NotifTipo, notifTipoDoAlerta, dominioLabel } from "../shared/notifications";

const BRL = (c: number) => "R$ " + ((c ?? 0) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 });

/** Data local da agência (nunca toISOString — o corte do dia é São Paulo). */
export function hojeAgencia(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
const fmtData = (ymd: string) => { const [y, m, d] = ymd.split("-"); return `${d}/${m}/${y}`; };

function layout(titulo: string, corpoHtml: string): string {
  return `
<div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;background:#f9f9f9;padding:24px">
  <div style="background:#1a1a1a;padding:16px 24px;border-radius:8px 8px 0 0">
    <h2 style="color:#E85BA8;margin:0;font-size:16px;letter-spacing:1px">SELVA AGENCY</h2>
  </div>
  <div style="background:#fff;padding:24px;border:1px solid #e5e5e5;border-top:none;border-radius:0 0 8px 8px">
    <h3 style="margin:0 0 16px;color:#1a1a1a;font-size:15px">${titulo}</h3>
    ${corpoHtml}
  </div>
</div>`;
}

/**
 * Envia para quem optou por email naquele tipo, pulando quem já recebeu este
 * dedupKey. Devolve quantos e-mails saíram (0 se SMTP não estiver configurado).
 */
async function enviarEmails(tipo: NotifTipo, dedupKey: string, subject: string, html: string, text: string, apenas?: number[]): Promise<number> {
  if (!isEmailConfigured()) {
    logger.info(`[Notif] SMTP não configurado — email de ${tipo} pulado (in-app segue normal)`);
    return 0;
  }
  // Só quem escolheu "na hora": quem escolheu "digest" recebe no resumo do dia.
  const destinos = await destinatariosEmail(tipo, "hora", apenas);
  let enviados = 0;
  for (const d of destinos) {
    if (!d.email) continue;
    if (await emailJaEnviado(d.id, dedupKey)) continue;
    const ok = await sendEmail({ to: d.email, subject, html, text });
    if (ok) { await marcarEmailEnviado(d.id, dedupKey); enviados++; }
  }
  return enviados;
}

// ─── FINANCEIRO: contas em atraso ────────────────────────────────────────────

/**
 * Só dispara quando HÁ atraso (vencimento < hoje e status pendente). A
 * notificação carrega a lista completa, separando a receber / a pagar.
 */
export async function runFinanceAtrasos(): Promise<{ total: number; notificados: number; emails: number }> {
  const a = await financeAtrasos();
  if (a.total === 0) {
    logger.info("[Notif] Financeiro: nenhum atraso hoje — nada a notificar.");
    return { total: 0, notificados: 0, emails: 0 };
  }
  const dia = a.hoje;
  const dedupKey = `FINANCE_ATRASO:global:${dia}`;
  const totalCents = a.totalReceberCents + a.totalPagarCents;
  const titulo = `${a.total} conta(s) em atraso · ${BRL(totalCents)}`;

  const linhaTxt = (x: { nome: string; descricao: string; vencimento: string; valorCents: number; dias: number }, comDesc: boolean) =>
    `• ${x.nome}${comDesc && x.descricao !== x.nome ? ` (${x.descricao})` : ""} — ${BRL(x.valorCents)} · venceu ${fmtData(x.vencimento)} · ${x.dias} dia(s)`;
  const partes: string[] = [];
  if (a.aReceber.length) partes.push(`A RECEBER vencidas (${a.aReceber.length} · ${BRL(a.totalReceberCents)}):\n` + a.aReceber.map((x) => linhaTxt(x, true)).join("\n"));
  if (a.aPagar.length) partes.push(`A PAGAR vencidas (${a.aPagar.length} · ${BRL(a.totalPagarCents)}):\n` + a.aPagar.map((x) => linhaTxt(x, false)).join("\n"));
  const texto = partes.join("\n\n");

  const notificados = await createNotification({
    tipo: "FINANCE_ATRASO", alertType: "FINANCE_OVERDUE", severity: "WARNING",
    title: titulo, message: texto, referencia: "global", dia,
    suggestedAction: "Abrir o Financeiro e conciliar os vencidos.",
  });

  const tabela = (itens: typeof a.aReceber, titulo2: string, cor: string, comDesc: boolean) => itens.length === 0 ? "" : `
    <p style="margin:16px 0 6px;font-size:13px;font-weight:bold;color:${cor}">${titulo2}</p>
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <tr style="text-align:left;color:#666"><th style="padding:4px 0">Quem</th><th>Venceu</th><th>Atraso</th><th style="text-align:right">Valor</th></tr>
      ${itens.map((x) => `<tr style="border-top:1px solid #eee">
        <td style="padding:6px 0;color:#333">${x.nome}${comDesc && x.descricao !== x.nome ? `<br><span style="color:#888;font-size:11px">${x.descricao}</span>` : ""}</td>
        <td style="color:#333">${fmtData(x.vencimento)}</td>
        <td style="color:${x.dias >= 30 ? "#DC2626" : "#D97706"}">${x.dias}d</td>
        <td style="text-align:right;color:#333;font-weight:bold">${BRL(x.valorCents)}</td></tr>`).join("")}
    </table>`;
  const html = layout(titulo, `
    <p style="margin:0;font-size:14px;color:#333">Levantamento de ${fmtData(dia)}.</p>
    ${tabela(a.aReceber, `A receber vencidas — ${BRL(a.totalReceberCents)}`, "#16A34A", true)}
    ${tabela(a.aPagar, `A pagar vencidas — ${BRL(a.totalPagarCents)}`, "#DC2626", false)}`);

  const emails = await enviarEmails("FINANCE_ATRASO", dedupKey, `[SELVA] ${titulo}`, html, texto);
  logger.info(`[Notif] Financeiro: ${a.total} atraso(s) · ${notificados.length} notificado(s) in-app · ${emails} email(s)`);
  return { total: a.total, notificados: notificados.length, emails };
}

// ─── PERFORMANCE: relatório diário (briefing) ────────────────────────────────

/**
 * Reusa o briefing diário que já existe (daily_briefings). Se ninguém abriu o
 * app ainda, o conteúdo não existe — este job apenas notifica o que já foi
 * gerado, e o gerador de verdade continua sendo a rota de sugestões.
 */
export async function runBriefingDiario(gerar: (userId: number, dia: string) => Promise<string | null>): Promise<{ notificados: number; emails: number }> {
  const dia = hojeAgencia();
  const dedupKey = `RELATORIO_DIARIO:global:${dia}`;
  const destinos = await destinatariosEmail("RELATORIO_DIARIO");
  const semente = destinos[0]?.id ?? 1;

  let conteudo = await getDailyBriefing(semente, dia);
  if (!conteudo) {
    conteudo = await gerar(semente, dia).catch((e) => { logger.error(`[Notif] briefing falhou: ${e?.message}`); return null; });
    if (conteudo) await saveDailyBriefing(semente, dia, conteudo);
  }
  if (!conteudo) return { notificados: 0, emails: 0 };

  const { resumo, positivo, atencao, critico } = parseBriefing(conteudo);
  const titulo = `Relatório diário · ${fmtData(dia)}`;
  const texto = [resumo, positivo && `✅ ${positivo}`, atencao && `⚠️ ${atencao}`, critico && `🚨 ${critico}`].filter(Boolean).join("\n");

  const notificados = await createNotification({
    tipo: "RELATORIO_DIARIO", alertType: "DAILY_BRIEFING", severity: "INFO",
    title: titulo, message: texto, referencia: "global", dia,
  });
  const bloco = (emoji: string, txt: string, cor: string) => txt ? `<p style="margin:8px 0;font-size:14px;color:${cor}">${emoji} ${txt}</p>` : "";
  const html = layout(titulo, `
    <p style="margin:0 0 8px;font-size:14px;color:#333">${resumo}</p>
    ${bloco("✅", positivo, "#16A34A")}${bloco("⚠️", atencao, "#D97706")}${bloco("🚨", critico, "#DC2626")}`);
  const emails = await enviarEmails("RELATORIO_DIARIO", dedupKey, `[SELVA] ${titulo}`, html, texto);
  logger.info(`[Notif] Briefing diário: ${notificados.length} in-app · ${emails} email(s)`);
  return { notificados: notificados.length, emails };
}

function parseBriefing(raw: string): { resumo: string; positivo: string; atencao: string; critico: string } {
  try {
    const j = JSON.parse(raw);
    return { resumo: j.resumo ?? "", positivo: j.positivo ?? "", atencao: j.atencao ?? "", critico: j.critico ?? "" };
  } catch {
    return { resumo: raw.slice(0, 1000), positivo: "", atencao: "", critico: "" };
  }
}

// ─── PERFORMANCE: relatório semanal ──────────────────────────────────────────

/** 1× por semana (segunda). O dedup por dia já impede repetir no mesmo dia. */
export async function runRelatorioSemanal(conteudo: string): Promise<{ notificados: number; emails: number }> {
  const dia = hojeAgencia();
  const dedupKey = `RELATORIO_SEMANAL:global:${dia}`;
  const titulo = `Relatório semanal · ${fmtData(dia)}`;
  const notificados = await createNotification({
    tipo: "RELATORIO_SEMANAL", alertType: "WEEKLY_REPORT", severity: "INFO",
    title: titulo, message: conteudo, referencia: "global", dia,
  });
  const html = layout(titulo, conteudo.split("\n").map((l) => `<p style="margin:4px 0;font-size:14px;color:#333">${l}</p>`).join(""));
  const emails = await enviarEmails("RELATORIO_SEMANAL", dedupKey, `[SELVA] ${titulo}`, html, conteudo);
  logger.info(`[Notif] Relatório semanal: ${notificados.length} in-app · ${emails} email(s)`);
  return { notificados: notificados.length, emails };
}

// ─── PERFORMANCE: anomalias de mídia ─────────────────────────────────────────

export type AnomaliaNotif = { accountId: number; accountName: string; type: string; severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"; title: string; description: string };

/** Uma notificação por anomalia, deduplicada por (conta, tipo, dia). */
export async function runAnomaliasNotif(anomalias: AnomaliaNotif[]): Promise<number> {
  const dia = hojeAgencia();
  let criadas = 0;
  for (const a of anomalias) {
    const sev = a.severity === "CRITICAL" ? "CRITICAL" : a.severity === "HIGH" ? "WARNING" : "INFO";
    const users = await createNotification({
      tipo: "ANOMALIA", alertType: "ANOMALY", severity: sev,
      title: `${a.accountName}: ${a.title}`.slice(0, 255), message: a.description,
      referencia: `${a.accountId}:${a.type}`, dia, accountId: a.accountId,
    });
    if (users.length) criadas++;
    if (sev === "CRITICAL") {
      const dedupKey = `ANOMALIA:${a.accountId}:${a.type}:${dia}`;
      await enviarEmails("ANOMALIA", dedupKey, `[SELVA] ${a.accountName}: ${a.title}`,
        layout(`${a.accountName}: ${a.title}`, `<p style="margin:0;font-size:14px;color:#333">${a.description}</p>`), a.description);
    }
  }
  logger.info(`[Notif] Anomalias: ${criadas} nova(s) de ${anomalias.length} detectada(s)`);
  return criadas;
}

// ─── TAREFAS: prazos do Trello ───────────────────────────────────────────────

/**
 * Prazo é por pessoa: cada card pertence a quem está atribuído, então o fan-out
 * é restrito ao dono (`apenas: [userId]`). O token do Trello expira em 30 dias e
 * não tem refresh — quando isso acontece, avisamos para reconectar em vez de
 * falhar em silêncio (hoje a pessoa só descobre quando abre a Home).
 */
export async function runTrelloPrazos(): Promise<{ prazos: number; reconexoes: number }> {
  if (!isTrelloConfigured()) {
    logger.info("[Notif] Trello não configurado — prazos pulados.");
    return { prazos: 0, reconexoes: 0 };
  }
  const dia = hojeAgencia();
  const contas = await usuariosComTrello();
  let prazos = 0, reconexoes = 0;

  for (const conta of contas) {
    let cards;
    try {
      cards = await listMyCards(decryptSecret(conta.tokenEnc));
    } catch (e) {
      if (e instanceof TrelloAuthError) {
        const criados = await createNotification({
          tipo: "TRELLO_RECONEXAO", alertType: "TRELLO_RECONNECT", severity: "WARNING",
          title: "Reconecte seu Trello",
          message: "O acesso ao Trello expirou (ele vale 30 dias). Reconecte em Configurações para voltar a ver seus cards e prazos.",
          referencia: "reconexao", dia, apenas: [conta.userId],
        });
        if (criados.length) reconexoes++;
      } else {
        logger.error(`[Notif] Trello falhou para user ${conta.userId}: ${(e as Error)?.message}`);
      }
      continue;
    }

    for (const card of cards) {
      if (!card.due) continue;
      const venc = card.due.slice(0, 10);
      const d = diasEntre(dia, venc); // >0 vencido · 0 hoje · -1 amanhã
      if (d < 0 && d !== -1) continue; // só interessa vencido, hoje e amanhã
      const quando = d > 0 ? `venceu há ${d} dia(s)` : d === 0 ? "vence hoje" : "vence amanhã";
      const sev = d > 0 ? "CRITICAL" : d === 0 ? "WARNING" : "INFO";
      const onde = card.boardName ? ` · ${card.boardName}` : "";
      const criados = await createNotification({
        tipo: "TRELLO_PRAZO", alertType: "TRELLO_DUE", severity: sev,
        title: `${card.name} — ${quando}`, message: `Card do Trello${onde}. Prazo: ${fmtData(venc)}.\n${card.url}`,
        // Dedup por card+dia: o mesmo card reavisa amanhã, não duas vezes hoje.
        referencia: card.id, dia, apenas: [conta.userId],
        suggestedAction: card.url,
      });
      if (criados.length) prazos++;
    }
  }
  logger.info(`[Notif] Trello: ${prazos} prazo(s) · ${reconexoes} reconexão(ões) · ${contas.length} conta(s)`);
  return { prazos, reconexoes };
}

/** Dias entre duas datas YYYY-MM-DD (positivo = `venc` no passado). */
function diasEntre(hoje: string, venc: string): number {
  return Math.round((Date.parse(`${hoje}T00:00:00Z`) - Date.parse(`${venc}T00:00:00Z`)) / 86400000);
}

// ─── COMUNICADO: aniversários ────────────────────────────────────────────────

export async function runAniversarios(): Promise<number> {
  const dia = hojeAgencia();
  const [, m, d] = dia.split("-").map(Number);
  const lista = await aniversariantesDe(d, m);
  let criados = 0;
  for (const p of lista) {
    const nome = p.name ?? "Alguém do time";
    const users = await createNotification({
      tipo: "ANIVERSARIO", alertType: "BIRTHDAY", severity: "INFO",
      title: `Hoje é aniversário de ${nome} 🎉`,
      message: `${nome}${p.jobTitle ? ` · ${p.jobTitle}` : ""} faz aniversário hoje. Passa lá dar os parabéns.`,
      referencia: String(p.id), dia,
    });
    if (users.length) criados++;
  }
  if (lista.length) logger.info(`[Notif] Aniversários: ${criados} avisado(s) de ${lista.length} aniversariante(s)`);
  return criados;
}

// ─── COMUNICADO: aviso do admin ──────────────────────────────────────────────

/**
 * Entrega um comunicado: cria a notificação para cada destinatário (o in-app é
 * obrigatório — é mensagem dirigida) e manda email para quem escolheu "na hora".
 * Quem escolheu "digest" recebe no resumo do dia. dedupKey fixo por comunicado:
 * o recibo de leitura é o próprio alerts.isRead de cada linha.
 */
export async function entregarComunicado(c: {
  id: number; titulo: string; corpo: string; autorNome: string; destinatarios: number[];
}): Promise<{ entregues: number; emails: number }> {
  const dedupKey = `COMUNICADO:${c.id}`;
  const entregues = await createNotification({
    tipo: "COMUNICADO", alertType: "COMUNICADO", severity: "INFO",
    title: c.titulo, message: c.corpo, referencia: String(c.id), dia: hojeAgencia(),
    dedupKey, apenas: c.destinatarios,
  });
  const html = layout(c.titulo, `
    ${c.corpo.split("\n").map((l) => `<p style="margin:6px 0;font-size:14px;color:#333">${escapar(l)}</p>`).join("")}
    <p style="margin:20px 0 0;font-size:12px;color:#888;border-top:1px solid #eee;padding-top:12px">Enviado por ${escapar(c.autorNome)} · SELVA</p>`);
  const texto = `${c.corpo}\n\n— ${c.autorNome}`;
  const emails = await enviarEmails("COMUNICADO", dedupKey, `[SELVA] ${c.titulo}`, html, texto, c.destinatarios);
  logger.info(`[Notif] Comunicado ${c.id}: ${entregues.length} entregue(s) · ${emails} email(s) na hora`);
  return { entregues: entregues.length, emails };
}

/** Escapa HTML — o corpo do comunicado é texto livre digitado por uma pessoa. */
function escapar(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

// ─── Digest diário ───────────────────────────────────────────────────────────

/**
 * Um email por pessoa com tudo que ela marcou como "no resumo do dia" e ainda
 * não recebeu. Roda por último, depois de todos os gatilhos terem criado suas
 * notificações. Marca emailSentAt — reexecutar não reenvia.
 */
export async function runDigestDiario(): Promise<{ enviados: number }> {
  if (!isEmailConfigured()) {
    logger.info("[Notif] SMTP não configurado — digest pulado.");
    return { enviados: 0 };
  }
  const dia = hojeAgencia();
  const inicioDoDia = new Date(`${dia}T00:00:00-03:00`);
  const pessoas = await usuariosAtivosComEmail();
  let enviados = 0;

  for (const p of pessoas) {
    const pendentes = await pendentesDoDigest(p.id, inicioDoDia);
    if (pendentes.length === 0) continue;
    // Só o que ESTA pessoa marcou como digest.
    const doDigest = [];
    for (const n of pendentes) {
      if ((await emailModoDe(p.id, notifTipoDoAlerta(n.type))) === "digest") doDigest.push(n);
    }
    if (doDigest.length === 0) continue;

    const porDominio = new Map<string, typeof doDigest>();
    for (const n of doDigest) {
      const k = n.dominio as string;
      if (!porDominio.has(k)) porDominio.set(k, []);
      porDominio.get(k)!.push(n);
    }
    const secoes = Array.from(porDominio.entries()).map(([dom, itens]) => `
      <p style="margin:16px 0 6px;font-size:12px;font-weight:bold;color:#E85BA8;text-transform:uppercase;letter-spacing:1px">${dominioLabel(dom)}</p>
      ${itens.map((i) => `<div style="border-left:2px solid #eee;padding:4px 0 4px 10px;margin:6px 0">
        <p style="margin:0;font-size:14px;color:#1a1a1a;font-weight:bold">${escapar(i.title)}</p>
        <p style="margin:2px 0 0;font-size:13px;color:#555">${escapar(String(i.message ?? "").slice(0, 240))}</p>
      </div>`).join("")}`).join("");

    const titulo = `Seu resumo do dia · ${fmtData(dia)}`;
    const html = layout(titulo, `<p style="margin:0;font-size:14px;color:#333">${doDigest.length} novidade(s) desde ontem.</p>${secoes}`);
    const texto = doDigest.map((i) => `• ${i.title}`).join("\n");
    const ok = await sendEmail({ to: p.email, subject: `[SELVA] ${titulo}`, html, text: texto });
    if (ok) { await marcarEmailEnviadoIds(doDigest.map((i) => i.id)); enviados++; }
  }
  logger.info(`[Notif] Digest diário: ${enviados} email(s)`);
  return { enviados };
}
