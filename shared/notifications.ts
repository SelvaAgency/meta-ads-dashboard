/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Catálogo de notificações — fonte única (client + server)
 * ─────────────────────────────────────────────────────────────────────────────
 *  Uma notificação tem DOMÍNIO e TIPO. O tipo é a unidade de preferência: cada
 *  usuário escolhe, por tipo, se aparece no app e como o email sai.
 *
 *  Canais:
 *    inApp    → aparece em /notificacoes e no sino.
 *    emailModo→ "off" (não manda) · "hora" (na hora) · "digest" (junta no
 *               email único do dia). O digest é o que protege a caixa de
 *               entrada: sem ele, cada prazo de card viraria um email.
 *
 *  A tabela `alerts` guarda o eixo técnico (alerts.type, granular); aqui está o
 *  eixo de produto — o que a pessoa entende e configura. ALERT_TYPE_TO_NOTIF
 *  faz a ponte.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type NotifDominio = "PERFORMANCE" | "FINANCEIRO" | "TAREFAS" | "COMUNICADO" | "SITE";
export type NotifTipo =
  | "RELATORIO_DIARIO" | "RELATORIO_SEMANAL" | "ANOMALIA" | "OPERACIONAL"
  | "FINANCE_ATRASO"
  | "TRELLO_PRAZO" | "TRELLO_RECONEXAO"
  | "COMUNICADO" | "ANIVERSARIO"
  | "SITE_CLARITY_ISSUE" | "SITE_TRACKING_PROBLEM";

export type EmailModo = "off" | "hora" | "digest";

export type Papel = "admin" | "developer" | "user";

export type NotifTipoDef = {
  v: NotifTipo;
  dominio: NotifDominio;
  label: string;
  desc: string;
  /** Defaults de quem nunca configurou. */
  inApp: boolean;
  emailModo: EmailModo;
  /** Financeiro só existe para admin. */
  adminOnly?: boolean;
  /** Mensagem dirigida a você: o in-app não é opcional (só o email é). */
  inAppObrigatorio?: boolean;
  /**
   * Quem este tipo serve. Sem isto, todo tipo sem conta espalhava para TODO
   * MUNDO — foi assim que o developer passou a receber relatório de mídia paga
   * de todos os clientes. Ausente = todos os papéis.
   */
  papeis?: Papel[];
};

export const NOTIF_TIPOS: NotifTipoDef[] = [
  // Performance = MÍDIA PAGA. Developer não entra: ROAS/CPA/CTR não são
  // responsabilidade dele, e receber isso de 11 clientes era puro ruído.
  { v: "RELATORIO_DIARIO", dominio: "PERFORMANCE", label: "Relatório diário", desc: "Resumo curto das contas, 1× por dia.", inApp: true, emailModo: "hora", papeis: ["admin", "user"] },
  { v: "RELATORIO_SEMANAL", dominio: "PERFORMANCE", label: "Relatório semanal", desc: "Consolidado por conta, 1× por semana.", inApp: true, emailModo: "hora", papeis: ["admin", "user"] },
  { v: "ANOMALIA", dominio: "PERFORMANCE", label: "Alertas de mídia", desc: "Queda de ROAS, spike de CPA, orçamento estourando.", inApp: true, emailModo: "off", papeis: ["admin", "user"] },
  // Operacional é técnico (token, sync): developer entra.
  { v: "OPERACIONAL", dominio: "PERFORMANCE", label: "Operacionais", desc: "Token expirado, conta sem campanha ativa, erros de sync.", inApp: true, emailModo: "off" },
  // Financeiro (admin)
  { v: "FINANCE_ATRASO", dominio: "FINANCEIRO", label: "Contas em atraso", desc: "A receber e a pagar vencidos. Só dispara quando há atraso.", inApp: true, emailModo: "hora", adminOnly: true },
  // Tarefas (Trello) — prazo é do seu dia de trabalho: no app, sem interromper.
  { v: "TRELLO_PRAZO", dominio: "TAREFAS", label: "Prazos do Trello", desc: "Cards seus que venceram, vencem hoje ou amanhã.", inApp: true, emailModo: "off" },
  { v: "TRELLO_RECONEXAO", dominio: "TAREFAS", label: "Trello desconectado", desc: "O acesso ao Trello expira a cada 30 dias e precisa ser reconectado.", inApp: true, emailModo: "hora", inAppObrigatorio: true },
  // Comunicados — mensagem dirigida: sempre chega no app.
  { v: "COMUNICADO", dominio: "COMUNICADO", label: "Comunicados", desc: "Avisos enviados pela administração.", inApp: true, emailModo: "hora", inAppObrigatorio: true },
  { v: "ANIVERSARIO", dominio: "COMUNICADO", label: "Aniversários", desc: "Aniversário de alguém do time.", inApp: true, emailModo: "off" },
  // Site — comportamento no site do cliente (Clarity). Separado de Performance
  // porque é outra pergunta: mídia trouxe gente, o site segurou?
  { v: "SITE_CLARITY_ISSUE", dominio: "SITE", label: "Fricção no site", desc: "Cliques mortos, rage clicks, scroll baixo, tráfego de bot, queda de sessões.", inApp: true, emailModo: "off" },
  { v: "SITE_TRACKING_PROBLEM", dominio: "SITE", label: "Risco de medição", desc: "Erros de JS que podem quebrar o disparo de conversão.", inApp: true, emailModo: "hora" },
];

export const NOTIF_DOMINIOS: { v: NotifDominio; label: string }[] = [
  { v: "COMUNICADO", label: "Comunicados" },
  { v: "TAREFAS", label: "Tarefas" },
  { v: "PERFORMANCE", label: "Performance" },
  { v: "SITE", label: "Site" },
  { v: "FINANCEIRO", label: "Financeiro" },
];

export const EMAIL_MODOS: { v: EmailModo; label: string; desc: string }[] = [
  { v: "off", label: "Não enviar", desc: "Só no app." },
  { v: "hora", label: "Na hora", desc: "Um email assim que acontecer." },
  { v: "digest", label: "No resumo do dia", desc: "Junta no email único diário." },
];

export const notifTipoDef = (v: string): NotifTipoDef | undefined => NOTIF_TIPOS.find((t) => t.v === v);
export const notifTipoLabel = (v: string): string => notifTipoDef(v)?.label ?? v;
export const dominioLabel = (v: string): string => NOTIF_DOMINIOS.find((d) => d.v === v)?.label ?? v;

/** Este tipo serve a este papel? Base do fan-out e da tela de preferências. */
export const tipoServeRole = (t: NotifTipoDef, role: string | undefined): boolean => {
  if (t.adminOnly && role !== "admin") return false;
  if (t.papeis && !t.papeis.includes((role ?? "user") as Papel)) return false;
  return true;
};

/** Tipos visíveis para o usuário: financeiro só admin; mídia paga não vai p/ dev. */
export const notifTiposFor = (role: string | undefined): NotifTipoDef[] =>
  NOTIF_TIPOS.filter((t) => tipoServeRole(t, role));

/**
 * Ponte alerts.type (técnico) → NotifTipo (produto). O que não estiver mapeado
 * cai em OPERACIONAL — um tipo técnico novo nasce configurável, não órfão.
 */
export const ALERT_TYPE_TO_NOTIF: Record<string, NotifTipo> = {
  DAILY_BRIEFING: "RELATORIO_DIARIO",
  WEEKLY_REPORT: "RELATORIO_SEMANAL",
  REPORT: "RELATORIO_SEMANAL",
  ANOMALY: "ANOMALIA",
  BUDGET_WARNING: "ANOMALIA",
  FINANCE_OVERDUE: "FINANCE_ATRASO",
  TRELLO_DUE: "TRELLO_PRAZO",
  TRELLO_RECONNECT: "TRELLO_RECONEXAO",
  COMUNICADO: "COMUNICADO",
  BIRTHDAY: "ANIVERSARIO",
  CLARITY_ISSUE: "SITE_CLARITY_ISSUE",
  TRACKING_PROBLEM: "SITE_TRACKING_PROBLEM",
};

export const notifTipoDoAlerta = (alertType: string): NotifTipo => ALERT_TYPE_TO_NOTIF[alertType] ?? "OPERACIONAL";
export const dominioDoAlerta = (alertType: string): NotifDominio =>
  notifTipoDef(notifTipoDoAlerta(alertType))?.dominio ?? "PERFORMANCE";

/** Público de um comunicado. */
export type ComunicadoPublico = "TODOS" | "ROLE" | "FUNCAO" | "PESSOAS";
export const COMUNICADO_PUBLICOS: { v: ComunicadoPublico; label: string }[] = [
  { v: "TODOS", label: "Todo mundo" },
  { v: "ROLE", label: "Por permissão" },
  { v: "FUNCAO", label: "Por função" },
  { v: "PESSOAS", label: "Pessoas específicas" },
];
