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
} from "./db";
import type { NotifTipo } from "../shared/notifications";

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
async function enviarEmails(tipo: NotifTipo, dedupKey: string, subject: string, html: string, text: string): Promise<number> {
  if (!isEmailConfigured()) {
    logger.info(`[Notif] SMTP não configurado — email de ${tipo} pulado (in-app segue normal)`);
    return 0;
  }
  const destinos = await destinatariosEmail(tipo);
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
