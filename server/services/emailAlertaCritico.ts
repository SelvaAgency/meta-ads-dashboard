/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  E-mail de alerta crítico de site — um caminho só
 * ─────────────────────────────────────────────────────────────────────────────
 *  Extraído de `siteHealthAlerts`, que já mandava e-mail imediato para CRÍTICO
 *  de site (fora do ar, SSL inválido) desde a política de 22/07. O robô de
 *  monitoramento precisava do mesmo comportamento, e duplicar o template criaria
 *  dois e-mails de incidente com formatos que divergiriam na primeira mudança.
 *
 *  ── O que este arquivo NÃO decide ──────────────────────────────────────────
 *  Quem recebe já vem resolvido: é exatamente o conjunto que o `createNotification`
 *  acabou de notificar in-app. Isso importa — significa que o dedup diário
 *  (tipo, referência, dia) já filtrou, e um incidente que dura horas manda
 *  e-mail 1× por dia, não 1× a cada ciclo.
 *
 *  Também não decide se pode enviar: as travas do `sendEmail` (automação
 *  pausada, provider, modo de destinatário) continuam valendo e são avaliadas
 *  lá, uma por uma. Este arquivo só monta e entrega.
 *
 *  ── Escape ─────────────────────────────────────────────────────────────────
 *  A evidência vem de FORA: domínio de destino, título da página, cadeia de
 *  redirects. É conteúdo controlado por quem eventualmente sequestrou o site —
 *  ou seja, hostil por definição. Tudo passa por `esc` antes de virar HTML.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { logger } from "../logger";
import { usuariosAtivosComEmail } from "../db";
import { sendEmail } from "../emailService";

const BASE = "https://spaces.selva.agency";

/** Escapa conteúdo externo. Um `<script>` num título não vira tag no e-mail. */
export const esc = (v: unknown): string =>
  String(v ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export interface EvidenciaLinha {
  rotulo: string;
  valor: string;
}

/**
 * Monta o corpo. Separado do envio para ser testável sem tocar em e-mail —
 * o escape é a parte que precisa de prova, e provar isso mandando e-mail seria
 * a forma errada.
 */
export function montarEmailCritico(a: {
  nome: string;
  titulo: string;
  detalhe: string;
  link: string;
  evidencia?: EvidenciaLinha[];
}): { html: string; text: string } {
  const linhas = (a.evidencia ?? []).filter((e) => e.valor);
  const url = `${BASE}${a.link}`;

  const tabela = linhas.length
    ? `<table cellpadding="0" cellspacing="0" border="0" style="margin:0 0 14px;font-size:13px;color:#555">
        ${linhas.map((e) => `<tr>
          <td style="padding:2px 10px 2px 0;color:#888;white-space:nowrap;vertical-align:top">${esc(e.rotulo)}</td>
          <td style="padding:2px 0;word-break:break-all">${esc(e.valor)}</td>
        </tr>`).join("")}
      </table>`
    : "";

  // Tabelas e estilo inline: o Gmail descarta <style> e não entende flex/grid.
  const html = `<div style="font:14px Arial,sans-serif;color:#333;max-width:560px">
    <p style="margin:0 0 8px"><strong>${esc(a.nome)}</strong> — ${esc(a.titulo)}</p>
    <p style="margin:0 0 12px;color:#555">${esc(a.detalhe).replace(/\n/g, "<br>")}</p>
    ${tabela}
    <p style="margin:0"><a href="${esc(url)}" style="color:#E85BA8">Abrir no Spaces</a></p>
  </div>`;

  const text = [
    `${a.nome} — ${a.titulo}`,
    a.detalhe,
    ...linhas.map((e) => `${e.rotulo}: ${e.valor}`),
    url,
  ].join("\n");

  return { html, text };
}

/**
 * Envia para os usuários indicados. Devolve quantos receberam.
 *
 * Um envio por pessoa, e não um `to` com todo mundo: a validação de
 * destinatário do `sendEmail` reprova a lista inteira quando um endereço não
 * passa. Separado, quem pode receber recebe, e quem não pode fica registrado
 * como bloqueado na auditoria — em vez de derrubar o alerta para todos.
 */
export async function enviarEmailCriticoSite(a: {
  userIds: number[];
  nome: string;
  titulo: string;
  detalhe: string;
  link: string;
  evidencia?: EvidenciaLinha[];
  tipo: string;
  assuntoPrefixo?: string;
}): Promise<number> {
  if (a.userIds.length === 0) return 0;
  const pessoas = (await usuariosAtivosComEmail()).filter((u) => a.userIds.includes(u.id));
  if (pessoas.length === 0) return 0;

  const { html, text } = montarEmailCritico(a);
  const subject = `${a.assuntoPrefixo ?? "🚨"} ${a.nome}: ${a.titulo}`;

  for (const pessoa of pessoas) {
    await sendEmail({ to: pessoa.email, subject, html, text, tipo: a.tipo, userId: pessoa.id });
  }
  logger.info(`[AlertaCrítico] "${a.titulo}" (${a.nome}) → e-mail para ${pessoas.length} pessoa(s)`);
  return pessoas.length;
}
