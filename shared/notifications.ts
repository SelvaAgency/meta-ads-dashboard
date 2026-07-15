/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Catálogo de notificações — fonte única (client + server)
 * ─────────────────────────────────────────────────────────────────────────────
 *  Uma notificação tem DOMÍNIO (Performance | Financeiro) e TIPO. O tipo é a
 *  unidade de preferência: cada usuário liga/desliga in-app e email por tipo.
 *
 *  A tabela `alerts` guarda o eixo técnico (alerts.type, 18 valores, granular);
 *  aqui está o eixo de produto (5 tipos, o que o usuário entende e configura).
 *  ALERT_TYPE_TO_NOTIF faz a ponte entre os dois.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type NotifDominio = "PERFORMANCE" | "FINANCEIRO";
export type NotifTipo = "RELATORIO_DIARIO" | "RELATORIO_SEMANAL" | "ANOMALIA" | "OPERACIONAL" | "FINANCE_ATRASO";

export type NotifTipoDef = {
  v: NotifTipo;
  dominio: NotifDominio;
  label: string;
  desc: string;
  /** Default do canal quando o usuário nunca configurou. */
  inApp: boolean;
  email: boolean;
  /** Financeiro só existe para admin. */
  adminOnly?: boolean;
};

export const NOTIF_TIPOS: NotifTipoDef[] = [
  { v: "RELATORIO_DIARIO", dominio: "PERFORMANCE", label: "Relatório diário", desc: "Resumo curto das contas, 1× por dia.", inApp: true, email: true },
  { v: "RELATORIO_SEMANAL", dominio: "PERFORMANCE", label: "Relatório semanal", desc: "Consolidado por conta, 1× por semana.", inApp: true, email: true },
  { v: "ANOMALIA", dominio: "PERFORMANCE", label: "Alertas de mídia", desc: "Queda de ROAS, spike de CPA, orçamento estourando, gasto acelerado.", inApp: true, email: false },
  { v: "OPERACIONAL", dominio: "PERFORMANCE", label: "Operacionais", desc: "Token expirado, conta sem campanha ativa, erros de sincronização.", inApp: true, email: false },
  { v: "FINANCE_ATRASO", dominio: "FINANCEIRO", label: "Contas em atraso", desc: "A receber e a pagar vencidos. Só dispara quando há atraso.", inApp: true, email: true, adminOnly: true },
];

export const NOTIF_DOMINIOS: { v: NotifDominio; label: string }[] = [
  { v: "PERFORMANCE", label: "Performance" },
  { v: "FINANCEIRO", label: "Financeiro" },
];

export const notifTipoDef = (v: string): NotifTipoDef | undefined => NOTIF_TIPOS.find((t) => t.v === v);
export const notifTipoLabel = (v: string): string => notifTipoDef(v)?.label ?? v;
export const dominioLabel = (v: string): string => NOTIF_DOMINIOS.find((d) => d.v === v)?.label ?? v;

/** Tipos visíveis para o usuário: Financeiro só para admin. */
export const notifTiposFor = (role: string | undefined): NotifTipoDef[] =>
  NOTIF_TIPOS.filter((t) => !t.adminOnly || role === "admin");

/**
 * Ponte alerts.type (técnico) → NotifTipo (produto). O que não estiver mapeado
 * cai em OPERACIONAL — assim um tipo técnico novo nasce configurável, não órfão.
 */
export const ALERT_TYPE_TO_NOTIF: Record<string, NotifTipo> = {
  DAILY_BRIEFING: "RELATORIO_DIARIO",
  WEEKLY_REPORT: "RELATORIO_SEMANAL",
  REPORT: "RELATORIO_SEMANAL",
  ANOMALY: "ANOMALIA",
  BUDGET_WARNING: "ANOMALIA",
  FINANCE_OVERDUE: "FINANCE_ATRASO",
};

export const notifTipoDoAlerta = (alertType: string): NotifTipo => ALERT_TYPE_TO_NOTIF[alertType] ?? "OPERACIONAL";
export const dominioDoAlerta = (alertType: string): NotifDominio =>
  notifTipoDef(notifTipoDoAlerta(alertType))?.dominio ?? "PERFORMANCE";
