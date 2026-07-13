import {
  bigint,
  date,
  decimal,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  boolean,
  float,
  uniqueIndex,
  index,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  passwordHash: varchar("passwordHash", { length: 255 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  // Roles: admin (Administrativo) · developer (Desenvolvedor) · user (Colaborador)
  role: mysqlEnum("role", ["user", "admin", "developer"]).default("user").notNull(),
  // Perfil de colaborador
  jobTitle: varchar("jobTitle", { length: 255 }),
  birthdayDay: int("birthdayDay"),     // 1–31
  birthdayMonth: int("birthdayMonth"), // 1–12
  // Foto de perfil (key do objeto no storage; URL resolvida no backend)
  avatarKey: varchar("avatarKey", { length: 512 }),
  // Primeiro acesso / segurança
  mustChangePassword: boolean("mustChangePassword").default(false).notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Integrações por usuário (OAuth) — ex.: Google Calendar ───────────────────
// Tokens são SEMPRE guardados criptografados (AES-256-GCM). Nunca em texto.
export const userIntegrations = mysqlTable("user_integrations", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  provider: varchar("provider", { length: 64 }).notNull(), // "google_calendar" | "trello"
  providerAccountId: varchar("providerAccountId", { length: 64 }),   // ex.: Trello member id
  providerUsername: varchar("providerUsername", { length: 255 }),    // ex.: Trello username
  providerAccountEmail: varchar("providerAccountEmail", { length: 320 }),
  accessTokenEncrypted: text("accessTokenEncrypted"),
  refreshTokenEncrypted: text("refreshTokenEncrypted"),
  expiresAt: timestamp("expiresAt"),
  scopes: text("scopes"),
  active: boolean("active").default(true).notNull(),
  connectedAt: timestamp("connectedAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  disconnectedAt: timestamp("disconnectedAt"),
}, (table) => ({
  uqUserProvider: uniqueIndex("uq_user_provider").on(table.userId, table.provider),
}));

export type UserIntegration = typeof userIntegrations.$inferSelect;
export type InsertUserIntegration = typeof userIntegrations.$inferInsert;

// ─── News bar (persistente) ───────────────────────────────────────────────────
export const newsItems = mysqlTable("news_items", {
  id: int("id").autoincrement().primaryKey(),
  text: varchar("text", { length: 500 }).notNull(),
  active: boolean("active").default(true).notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdByUserId: int("createdByUserId"),
  updatedByUserId: int("updatedByUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type NewsItemRow = typeof newsItems.$inferSelect;
export type InsertNewsItem = typeof newsItems.$inferInsert;

// ─── SelvaTV (persistente + storage de imagem) ────────────────────────────────
export const selvatvItems = mysqlTable("selvatv_items", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 255 }),
  imageKey: varchar("imageKey", { length: 512 }).notNull(), // key no storage
  storageProvider: varchar("storageProvider", { length: 32 }),
  active: boolean("active").default(true).notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdByUserId: int("createdByUserId"),
  updatedByUserId: int("updatedByUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type SelvatvItemRow = typeof selvatvItems.$inferSelect;
export type InsertSelvatvItem = typeof selvatvItems.$inferInsert;

// ─── Acessos (cofre de credenciais por cliente) ───────────────────────────────
export const accessClients = mysqlTable("access_clients", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 255 }).notNull().unique(),
  isInternal: boolean("isInternal").default(false).notNull(),
  active: boolean("active").default(true).notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdByUserId: int("createdByUserId"),
  updatedByUserId: int("updatedByUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type AccessClientRow = typeof accessClients.$inferSelect;
export type InsertAccessClient = typeof accessClients.$inferInsert;

export const accessItems = mysqlTable("access_items", {
  id: int("id").autoincrement().primaryKey(),
  clientId: int("clientId").notNull(),
  platform: varchar("platform", { length: 120 }).notNull(),
  label: varchar("label", { length: 255 }),
  loginEmail: varchar("loginEmail", { length: 320 }),
  passwordEncrypted: text("passwordEncrypted").notNull(), // AES-256-GCM (iv.tag.cipher)
  url: varchar("url", { length: 1024 }),
  requiresCode: boolean("requiresCode").default(false).notNull(),
  codeType: varchar("codeType", { length: 32 }),
  notes: text("notes"),
  tagsJson: json("tagsJson"),
  active: boolean("active").default(true).notNull(),
  createdByUserId: int("createdByUserId"),
  updatedByUserId: int("updatedByUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type AccessItemRow = typeof accessItems.$inferSelect;
export type InsertAccessItem = typeof accessItems.$inferInsert;

export const accessAuditLogs = mysqlTable("access_audit_logs", {
  id: int("id").autoincrement().primaryKey(),
  accessItemId: int("accessItemId"),
  clientId: int("clientId"),
  userId: int("userId").notNull(),
  action: varchar("action", { length: 40 }).notNull(),
  metadataJson: json("metadataJson"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type InsertAccessAuditLog = typeof accessAuditLogs.$inferInsert;

// ─── Auditoria de USUÁRIOS (role/status/perfil) ───────────────────────────────
// Fonte de verdade para "quem mudou o quê" em colaboradores. NUNCA guarda senha,
// hash, tokens ou segredos — só nomes de campo e valores não sensíveis.
export const userAuditLogs = mysqlTable("user_audit_logs", {
  id: int("id").autoincrement().primaryKey(),
  actorUserId: int("actorUserId").notNull(),   // quem fez a alteração
  targetUserId: int("targetUserId").notNull(), // usuário afetado
  action: varchar("action", { length: 40 }).notNull(), // role_changed | user_deactivated | user_reactivated | profile_updated
  previousValue: varchar("previousValue", { length: 255 }),
  newValue: varchar("newValue", { length: 255 }),
  metadataJson: json("metadataJson"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type InsertUserAuditLog = typeof userAuditLogs.$inferInsert;

// ─── Configurações simples (key-value) — ex.: slide "Você prefere?" da SELVA TV ─
export const appSettings = mysqlTable("app_settings", {
  settingKey: varchar("settingKey", { length: 191 }).primaryKey(),
  valueJson: json("valueJson"),
  updatedByUserId: int("updatedByUserId"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type AppSettingRow = typeof appSettings.$inferSelect;

// ─── Votos do slide "Você prefere?" (SELVA TV) — 1 voto por usuário ───────────
export const selvatvPollVotes = mysqlTable("selvatv_poll_votes", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  optionKey: mysqlEnum("optionKey", ["left", "right"]).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// Meta Ads accounts connected by each user
export const metaAdAccounts = mysqlTable("meta_ad_accounts", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  accountId: varchar("accountId", { length: 64 }).notNull(),
  accountName: varchar("accountName", { length: 255 }),
  accessToken: text("accessToken").notNull(),
  tokenExpiresAt: timestamp("tokenExpiresAt"),
  currency: varchar("currency", { length: 8 }),
  timezone: varchar("timezone", { length: 64 }),
  isActive: boolean("isActive").default(true).notNull(),
  lastSyncAt: timestamp("lastSyncAt"),
  aiStatusSummary: text("aiStatusSummary"),
  aiStatusColor: mysqlEnum("aiStatusColor", ["green", "yellow", "red"]),
  accountNote: text("accountNote"),
  goalTypeOverride: varchar("goalTypeOverride", { length: 64 }),
  pictureUrl: varchar("pictureUrl", { length: 1024 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type MetaAdAccount = typeof metaAdAccounts.$inferSelect;
export type InsertMetaAdAccount = typeof metaAdAccounts.$inferInsert;

// Campaigns fetched from Meta Ads API
export const campaigns = mysqlTable("campaigns", {
  id: int("id").autoincrement().primaryKey(),
  accountId: int("accountId").notNull(),
  metaCampaignId: varchar("metaCampaignId", { length: 64 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  status: mysqlEnum("status", ["ACTIVE", "PAUSED", "DELETED", "ARCHIVED"]).default("ACTIVE"),
  objective: varchar("objective", { length: 64 }),
  // optimization_goal comes from the adsets (performance_goal) — more specific than objective
  // e.g. OFFSITE_CONVERSIONS, LEAD_GENERATION, REPLIES, LINK_CLICKS, etc.
  optimizationGoal: varchar("optimizationGoal", { length: 64 }),
  // Human-readable label for the result type shown in dashboard
  // e.g. "Compras no site", "Mensagens", "Leads"
  resultLabel: varchar("resultLabel", { length: 128 }),
  dailyBudget: decimal("dailyBudget", { precision: 12, scale: 2 }),
  lifetimeBudget: decimal("lifetimeBudget", { precision: 12, scale: 2 }),
  startTime: timestamp("startTime"),
  stopTime: timestamp("stopTime"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  uqMetaCampaign: uniqueIndex("uq_meta_campaign_account").on(table.metaCampaignId, table.accountId),
}));

export type Campaign = typeof campaigns.$inferSelect;
export type InsertCampaign = typeof campaigns.$inferInsert;

// Daily metrics per campaign (historical storage)
export const campaignMetrics = mysqlTable("campaign_metrics", {
  id: int("id").autoincrement().primaryKey(),
  campaignId: int("campaignId").notNull(),
  accountId: int("accountId").notNull(),
  date: varchar("date", { length: 10 }).notNull(), // YYYY-MM-DD
  impressions: bigint("impressions", { mode: "number" }).default(0),
  clicks: bigint("clicks", { mode: "number" }).default(0),
  spend: decimal("spend", { precision: 12, scale: 2 }).default("0"),
  conversions: decimal("conversions", { precision: 12, scale: 4 }).default("0"),
  conversionValue: decimal("conversionValue", { precision: 12, scale: 2 }).default("0"),
  reach: bigint("reach", { mode: "number" }).default(0),
  frequency: decimal("frequency", { precision: 8, scale: 4 }).default("0"),
  ctr: decimal("ctr", { precision: 8, scale: 4 }).default("0"),
  cpc: decimal("cpc", { precision: 10, scale: 4 }).default("0"),
  cpm: decimal("cpm", { precision: 10, scale: 4 }).default("0"),
  cpa: decimal("cpa", { precision: 12, scale: 4 }).default("0"),
   roas: decimal("roas", { precision: 10, scale: 4 }).default("0"),
  profileVisits: bigint("profile_visits", { mode: "number" }).default(0),
  followers: bigint("followers", { mode: "number" }).default(0),
  messages: bigint("messages", { mode: "number" }).default(0),
  linkClicks: bigint("link_clicks", { mode: "number" }).default(0),
  addToCart: bigint("add_to_cart", { mode: "number" }).default(0),
  landingPageViews: bigint("landing_page_views", { mode: "number" }).default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  uqCampaignDate: uniqueIndex("uq_campaign_date").on(table.campaignId, table.date),
}));
export type CampaignMetrics = typeof campaignMetrics.$inferSelect;
export type InsertCampaignMetrics = typeof campaignMetrics.$inferInsert;

// Anomalies detected by the analysis engine
export const anomalies = mysqlTable("anomalies", {
  id: int("id").autoincrement().primaryKey(),
  accountId: int("accountId").notNull(),
  campaignId: int("campaignId"),
  type: mysqlEnum("type", [
    "ROAS_DROP",
    "CPA_SPIKE",
    "CTR_DROP",
    "SPEND_SPIKE",
    "DELIVERY_CHANGE",
    "FREQUENCY_HIGH",
    "CONVERSION_DROP",
    "BUDGET_EXHAUSTED",
    "PERFORMANCE_DROP",
    "RESULTS_DROP",
  ]).notNull(),
  severity: mysqlEnum("severity", ["LOW", "MEDIUM", "HIGH", "CRITICAL"]).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description").notNull(),
  metricName: varchar("metricName", { length: 64 }),
  currentValue: decimal("currentValue", { precision: 12, scale: 4 }),
  previousValue: decimal("previousValue", { precision: 12, scale: 4 }),
  changePercent: decimal("changePercent", { precision: 8, scale: 2 }),
  detectedAt: timestamp("detectedAt").defaultNow().notNull(),
  resolvedAt: timestamp("resolvedAt"),
  isRead: boolean("isRead").default(false).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  isResolved: boolean("isResolved").default(false).notNull(),
  // Controle de envio de email: null = ainda não enviado, data = já enviado (enviar apenas uma vez)
  emailSentAt: timestamp("emailSentAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type Anomaly = typeof anomalies.$inferSelect;
export type InsertAnomaly = typeof anomalies.$inferInsert;

// AI-generated suggestions for campaign improvement
export const aiSuggestions = mysqlTable("ai_suggestions", {
  id: int("id").autoincrement().primaryKey(),
  accountId: int("accountId").notNull(),
  campaignId: int("campaignId"),
  category: mysqlEnum("category", [
    "BUDGET",
    "TARGETING",
    "CREATIVE",
    "BIDDING",
    "SCHEDULE",
    "AUDIENCE",
    "GENERAL",
  ]).notNull(),
  priority: mysqlEnum("priority", ["LOW", "MEDIUM", "HIGH"]).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description").notNull().default(""),
  expectedImpact: text("expectedImpact"),
  actionItems: json("actionItems"),
  // Status: pending = aguardando decisão, applied = marcado como aplicado, rejected = marcado como não aplicado
  status: mysqlEnum("status", ["pending", "applied", "rejected"]).default("pending").notNull(),
  // Justificativa opcional quando marcado como rejected
  rejectionReason: text("rejectionReason"),
  // Quando foi marcado como aplicado
  appliedAt: timestamp("appliedAt"),
  // Monitoramento pós-aplicação: até quando monitorar (appliedAt + 7 dias)
  monitorUntil: timestamp("monitorUntil"),
  // Snapshot das métricas no momento da aplicação (para comparar depois)
  metricsSnapshot: json("metricsSnapshot"),
  // Resultado do monitoramento após 7 dias (gerado automaticamente)
  monitorResult: text("monitorResult"),
  // Data de expiração do histórico (generatedAt + 30 dias)
  expiresAt: timestamp("expiresAt"),
  // Campos legados mantidos para compatibilidade
  isApplied: boolean("isApplied").default(false).notNull(),
  isDismissed: boolean("isDismissed").default(false).notNull(),
  generatedAt: timestamp("generatedAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AiSuggestion = typeof aiSuggestions.$inferSelect;
export type InsertAiSuggestion = typeof aiSuggestions.$inferInsert;

// Scheduled reports configuration
export const scheduledReports = mysqlTable("scheduled_reports", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  accountId: int("accountId").notNull(),
  frequency: mysqlEnum("frequency", ["DAILY", "WEEKLY"]).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  // Horário personalizável (0-23 para hora, 0-59 para minuto)
  scheduleHour: int("scheduleHour").default(8).notNull(),
  scheduleMinute: int("scheduleMinute").default(0).notNull(),
  // Dia da semana para agendamento semanal (0=domingo, 1=segunda, ..., 6=sábado)
  scheduleDay: int("scheduleDay").default(1).notNull(),
  lastRunAt: timestamp("lastRunAt"),
  nextRunAt: timestamp("nextRunAt"),
  lastReportContent: text("lastReportContent"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ScheduledReport = typeof scheduledReports.$inferSelect;
export type InsertScheduledReport = typeof scheduledReports.$inferInsert;

// Alert notifications
export const alerts = mysqlTable("alerts", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  accountId: int("accountId").notNull(),
  anomalyId: int("anomalyId"),
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message").notNull(),
  type: mysqlEnum("type", [
    "ANOMALY",
    "REPORT",
    "SYNC_ERROR",
    "BUDGET_WARNING",
    "CAMPAIGN_PAUSED",
    "PAYMENT_FAILED",
    "AD_REJECTED",
    "AD_ERROR",
    "PAGE_UNLINKED",
    "INSTAGRAM_UNLINKED",
    "PIXEL_ERROR",
    "ADSET_NO_DELIVERY",
    "SUGGESTION_APPLIED",
    "EXPERIMENT_UPDATE",
    "SYNC_COMPLETE",
  ]).notNull(),
  severity: mysqlEnum("severity", ["INFO", "WARNING", "CRITICAL"]).notNull(),
  // Prioridade do alerta: CRITICAL=imediato, HIGH=até 30min, MEDIUM=consolidado a cada 2h
  priority: mysqlEnum("priority", ["CRITICAL", "HIGH", "MEDIUM", "LOW"]).default("LOW").notNull(),
  // Ação sugerida para resolver o alerta
  suggestedAction: text("suggestedAction"),
  // Métrica atual vs referência (para alertas de performance)
  metricCurrent: varchar("metricCurrent", { length: 128 }),
  metricReference: varchar("metricReference", { length: 128 }),
   isRead: boolean("isRead").default(false).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  // Controle de envio de email: null = ainda não enviado, data = já enviado (enviar apenas uma vez)
  emailSentAt: timestamp("emailSentAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type Alert = typeof alerts.$inferSelect;
export type InsertAlert = typeof alerts.$inferInsert;

// ─── Dashboard Builder de Tráfego Pago ──────────────────────────────────────
// Módulo independente para geração de dashboards analíticos em PDF.
export const dashboardReports = mysqlTable("dashboard_reports", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  clientName: varchar("clientName", { length: 255 }).notNull(),
  weeklyContext: text("weeklyContext").notNull(),
  mode: mysqlEnum("mode", ["SINGLE", "COMPARATIVE"]).notNull().default("SINGLE"),
  platform: varchar("platform", { length: 100 }),
  // URLs das imagens enviadas (JSON array de strings) — armazenado como JSON string
  imageUrls: text("imageUrls").notNull(),
  // Conteúdo do relatório gerado pelo LLM (JSON estruturado)
  reportJson: text("reportJson"),
  // URL do PDF gerado no S3
  pdfUrl: text("pdfUrl"),
  // Status do processamento
  status: mysqlEnum("status", ["PENDING", "PROCESSING", "DONE", "ERROR"]).notNull().default("PENDING"),
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type DashboardReport = typeof dashboardReports.$inferSelect;
export type InsertDashboardReport = typeof dashboardReports.$inferInsert;

// ─── Google Ads Accounts ──────────────────────────────────────────────────────
export const googleAdAccounts = mysqlTable("google_ad_accounts", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  customerId: varchar("customerId", { length: 20 }).notNull(), // e.g. "123-456-7890" or "1234567890"
  accountName: varchar("accountName", { length: 255 }),
  refreshToken: text("refreshToken").notNull(),
  currency: varchar("currency", { length: 8 }).default("BRL"),
  timezone: varchar("timezone", { length: 64 }).default("America/Sao_Paulo"),
  isActive: boolean("isActive").default(true).notNull(),
  lastSyncAt: timestamp("lastSyncAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type GoogleAdAccount = typeof googleAdAccounts.$inferSelect;
export type InsertGoogleAdAccount = typeof googleAdAccounts.$inferInsert;

// ─── GA4 Analytics Accounts ──────────────────────────────────────────────────
export const ga4Accounts = mysqlTable("ga4_accounts", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  propertyId: varchar("propertyId", { length: 20 }).notNull(), // GA4 property ID
  propertyName: varchar("propertyName", { length: 255 }),
  websiteUrl: varchar("websiteUrl", { length: 512 }),
  refreshToken: text("refreshToken").notNull(),
  currency: varchar("currency", { length: 8 }).default("BRL"),
  timezone: varchar("timezone", { length: 64 }).default("America/Sao_Paulo"),
  isActive: boolean("isActive").default(true).notNull(),
  lastSyncAt: timestamp("lastSyncAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type GA4Account = typeof ga4Accounts.$inferSelect;
export type InsertGA4Account = typeof ga4Accounts.$inferInsert;

// ─── Experiments ─────────────────────────────────────────────────────────────
export const experiments = mysqlTable("experiments", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  accountId: int("accountId").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  centralQuestion: text("centralQuestion"),
  hypothesis: text("hypothesis"),
  startDate: varchar("startDate", { length: 10 }).notNull(),
  endDate: varchar("endDate", { length: 10 }).notNull(),
  status: mysqlEnum("status", ["planned", "active", "completed", "paused"]).notNull().default("planned"),
  dailyBudget: decimal("dailyBudget", { precision: 10, scale: 2 }),
  totalBudget: decimal("totalBudget", { precision: 10, scale: 2 }),
  channels: json("channels").$type<string[]>(),
  campaignIds: json("campaignIds").$type<number[]>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Experiment = typeof experiments.$inferSelect;
export type InsertExperiment = typeof experiments.$inferInsert;

export const experimentKpis = mysqlTable("experiment_kpis", {
  id: int("id").autoincrement().primaryKey(),
  experimentId: int("experimentId").notNull(),
  metric: varchar("metric", { length: 64 }).notNull(),
  unit: varchar("unit", { length: 8 }).notNull().default("#"),
  minSignal: decimal("minSignal", { precision: 10, scale: 4 }),
  goal: decimal("goal", { precision: 10, scale: 4 }).notNull(),
});
export type ExperimentKpi = typeof experimentKpis.$inferSelect;
export type InsertExperimentKpi = typeof experimentKpis.$inferInsert;

export const experimentCheckpoints = mysqlTable("experiment_checkpoints", {
  id: int("id").autoincrement().primaryKey(),
  experimentId: int("experimentId").notNull(),
  date: varchar("date", { length: 10 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  qualitativeNote: text("qualitativeNote"),
  snapshotData: json("snapshotData").$type<Record<string, number>>(),
  status: mysqlEnum("status", ["pending", "active", "done"]).notNull().default("pending"),
});
export type ExperimentCheckpoint = typeof experimentCheckpoints.$inferSelect;
export type InsertExperimentCheckpoint = typeof experimentCheckpoints.$inferInsert;

export const experimentDecisions = mysqlTable("experiment_decisions", {
  id: int("id").autoincrement().primaryKey(),
  experimentId: int("experimentId").notNull(),
  scenario: varchar("scenario", { length: 255 }).notNull(),
  reading: text("reading"),
  nextStep: text("nextStep"),
  isCurrent: boolean("isCurrent").default(false).notNull(),
});
export type ExperimentDecision = typeof experimentDecisions.$inferSelect;
export type InsertExperimentDecision = typeof experimentDecisions.$inferInsert;

export const dailyBriefings = mysqlTable("daily_briefings", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  date: varchar("date", { length: 10 }).notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  uqUserDate: uniqueIndex("uq_user_date_briefing").on(table.userId, table.date),
}));
export type DailyBriefing = typeof dailyBriefings.$inferSelect;

// ─── Account Thresholds ───────────────────────────────────────────────────────
export const accountThresholds = mysqlTable("account_thresholds", {
  id: int("id").autoincrement().primaryKey(),
  accountId: int("accountId").notNull().unique(),
  // ROAS
  roasGood: decimal("roasGood", { precision: 8, scale: 2 }),
  roasRegular: decimal("roasRegular", { precision: 8, scale: 2 }),
  // CPA
  cpaGood: decimal("cpaGood", { precision: 10, scale: 2 }),
  cpaRegular: decimal("cpaRegular", { precision: 10, scale: 2 }),
  // CTR
  ctrGood: decimal("ctrGood", { precision: 6, scale: 2 }),
  ctrRegular: decimal("ctrRegular", { precision: 6, scale: 2 }),
  // CPL (leads)
  cplGood: decimal("cplGood", { precision: 10, scale: 2 }),
  cplRegular: decimal("cplRegular", { precision: 10, scale: 2 }),
  // CPM
  cpmGood: decimal("cpmGood", { precision: 10, scale: 2 }),
  cpmRegular: decimal("cpmRegular", { precision: 10, scale: 2 }),
  // Saldo baixo (apenas contas pré-pagas) — valor em R$ abaixo do qual o alerta dispara
  lowBalanceThreshold: decimal("lowBalanceThreshold", { precision: 10, scale: 2 }).default("200.00"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type AccountThreshold = typeof accountThresholds.$inferSelect;
export type InsertAccountThreshold = typeof accountThresholds.$inferInsert;

// ─── Notification Settings ────────────────────────────────────────────────────
export const notificationSettings = mysqlTable("notification_settings", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  emailDestination: varchar("emailDestination", { length: 320 }),
  // Toggles
  alertCpaEnabled: boolean("alertCpaEnabled").default(true).notNull(),
  alertRoasEnabled: boolean("alertRoasEnabled").default(true).notNull(),
  alertTokenExpiredEnabled: boolean("alertTokenExpiredEnabled").default(true).notNull(),
  alertBudgetEnabled: boolean("alertBudgetEnabled").default(false).notNull(),
  // Thresholds de disparo
  alertCpaThreshold: decimal("alertCpaThreshold", { precision: 10, scale: 2 }),
  alertRoasThreshold: decimal("alertRoasThreshold", { precision: 8, scale: 2 }),
  alertBudgetPercent: int("alertBudgetPercent").default(85),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type NotificationSettings = typeof notificationSettings.$inferSelect;
export type InsertNotificationSettings = typeof notificationSettings.$inferInsert;


// ─── Account Context (memória por conta) ─────────────────────────────────────
export const accountContext = mysqlTable("account_context", {
  id: int("id").autoincrement().primaryKey(),
  accountId: int("accountId").notNull().unique(),
  // Legacy text fields (mantidos para compatibilidade)
  clientProfile: text("clientProfile"),
  operationalRules: text("operationalRules"),
  learnings: text("learnings"),
  // Structured fields
  businessType: varchar("businessType", { length: 50 }),
  ticketRange: varchar("ticketRange", { length: 50 }),
  audienceAge: varchar("audienceAge", { length: 50 }),
  audienceGender: varchar("audienceGender", { length: 50 }),
  audienceGeo: varchar("audienceGeo", { length: 50 }),
  restrictions: json("restrictions").$type<string[]>(),
  events: json("events").$type<Array<{ date: string; type: string; description: string }>>(),
  freeInput: text("freeInput"),
  focusMoment: text("focusMoment"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  updatedBy: varchar("updatedBy", { length: 255 }),
});
export type AccountContext = typeof accountContext.$inferSelect;
export type InsertAccountContext = typeof accountContext.$inferInsert;

// ─── Report Snapshots (relatórios gerados para clientes) ─────────────────────
export const reportSnapshots = mysqlTable("report_snapshots", {
  id: int("id").autoincrement().primaryKey(),
  accountId: int("accountId").notNull(),
  tier: mysqlEnum("tier", ["CURTO", "MEDIO", "COMPLETO"]).notNull(),
  publicToken: varchar("publicToken", { length: 64 }).notNull().unique(),
  periodStart: date("periodStart", { mode: "string" }).notNull(),
  periodEnd: date("periodEnd", { mode: "string" }).notNull(),
  contextNotes: text("contextNotes"),
  dataSnapshot: text("dataSnapshot"),
  narrative: text("narrative"),
  generatedAt: timestamp("generatedAt").defaultNow().notNull(),
  generatedByUserId: int("generatedByUserId"),
  isActive: boolean("isActive").default(true).notNull(),
});
export type ReportSnapshot = typeof reportSnapshots.$inferSelect;
export type InsertReportSnapshot = typeof reportSnapshots.$inferInsert;

// ─── Agency Context (memória da agência) ─────────────────────────────────────
export const agencyContext = mysqlTable("agency_context", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  benchmarks: text("benchmarks"),
  patterns: text("patterns"),
  institutionalKnowledge: text("institutionalKnowledge"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type AgencyContext = typeof agencyContext.$inferSelect;
export type InsertAgencyContext = typeof agencyContext.$inferInsert;

// ─── Action Outcomes (fechamento do loop) ────────────────────────────────────
export const actionOutcomes = mysqlTable("action_outcomes", {
  id: int("id").autoincrement().primaryKey(),
  suggestionId: int("suggestionId").notNull().unique(),
  accountId: int("accountId").notNull(),
  appliedAt: timestamp("appliedAt").notNull(),
  observedAt: timestamp("observedAt"),
  resultSummary: text("resultSummary"),
  metricsSnapshot: json("metricsSnapshot").$type<Record<string, number>>(),
  aiLearningNote: text("aiLearningNote"),
  manualCorrection: text("manualCorrection"),
  closedBy: varchar("closedBy", { length: 255 }),
  closedAt: timestamp("closedAt"),
});
export type ActionOutcome = typeof actionOutcomes.$inferSelect;
export type InsertActionOutcome = typeof actionOutcomes.$inferInsert;

// ─── Controle Financeiro (área admin) ─────────────────────────────────────────
// Dinheiro SEMPRE em centavos (int), nunca float. `mes` = string 'YYYY-MM'.
// O sinal (receita vs. despesa) vem do `tipo`; valorCents é sempre positivo.
export const financePnlEntries = mysqlTable("finance_pnl_entries", {
  id: int("id").autoincrement().primaryKey(),
  mes: varchar("mes", { length: 7 }).notNull(),
  tipo: mysqlEnum("tipo", [
    "RECEITA_RECORRENTE", "RECEITA_PONTUAL",
    "DESPESA_RECORRENTE", "DESPESA_IMPOSTO", "DESPESA_PONTUAL",
    "APORTE",
  ]).notNull(),
  descricao: varchar("descricao", { length: 255 }).notNull(),
  valorCents: int("valorCents").notNull(),
  status: mysqlEnum("status", ["pago", "pendente"]).default("pendente").notNull(),
  // Cliente (FK lógica → finance_clientes.id). Só receita usa; despesa/aporte NULL.
  clienteId: int("clienteId"),
  // v4 — gestão ativa (ledger). Colunas nullable: histórico antigo fica MANUAL/NULL.
  vencimento: date("vencimento", { mode: "string" }),           // data real (YYYY-MM-DD)
  vencimentoOriginal: date("vencimentoOriginal", { mode: "string" }), // p/ badge "Remarcado"
  origem: mysqlEnum("origem", ["MANUAL", "RECORRENCIA", "PROJETO"]).default("MANUAL").notNull(),
  recorrenciaId: int("recorrenciaId"),
  projetoId: int("projetoId"),
  parcelaNum: int("parcelaNum"),
  parcelaTotal: int("parcelaTotal"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  idxMes: index("idx_pnl_mes").on(table.mes),
  idxTipo: index("idx_pnl_tipo").on(table.tipo),
  idxStatus: index("idx_pnl_status").on(table.status),
  idxCliente: index("idx_pnl_cliente").on(table.clienteId),
  idxVencimento: index("idx_pnl_vencimento").on(table.vencimento),
  idxOrigem: index("idx_pnl_origem").on(table.origem),
}));

// v4 — definição da assinatura recorrente por cliente (fonte da geração mensal).
export const financeRecorrencia = mysqlTable("finance_recorrencia", {
  id: int("id").autoincrement().primaryKey(),
  clienteId: int("clienteId"),                      // NULL para despesa (v4.1)
  valorCents: int("valorCents").notNull(),          // valor mensal padrão atual
  diaVencimento: int("diaVencimento"),
  mesInicio: varchar("mesInicio", { length: 7 }).notNull(),
  ativo: boolean("ativo").default(true).notNull(),
  churnMes: varchar("churnMes", { length: 7 }),
  // v4.1 — recorrência também de despesa (espelha a receita).
  natureza: mysqlEnum("natureza", ["RECEITA", "DESPESA"]).default("RECEITA").notNull(),
  descricao: varchar("descricao", { length: 255 }), // nome da despesa/pessoa (receita usa clienteId)
  tipoEntry: varchar("tipoEntry", { length: 30 }),  // 'DESPESA_RECORRENTE' | 'DESPESA_IMPOSTO'
  estimativa: boolean("estimativa").default(false).notNull(), // true p/ imposto
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  idxCliente: index("idx_rec_cliente").on(table.clienteId),
  idxAtivo: index("idx_rec_ativo").on(table.ativo),
  idxNatureza: index("idx_rec_natureza").on(table.natureza),
}));
export type FinanceRecorrencia = typeof financeRecorrencia.$inferSelect;
export type InsertFinanceRecorrencia = typeof financeRecorrencia.$inferInsert;

// v4 — projetos parcelados (receita pontual dividida em N parcelas).
export const financeProjetos = mysqlTable("finance_projetos", {
  id: int("id").autoincrement().primaryKey(),
  clienteId: int("clienteId"),
  nome: varchar("nome", { length: 255 }).notNull(),
  valorTotalCents: int("valorTotalCents").notNull(),
  numParcelas: int("numParcelas").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type FinanceProjeto = typeof financeProjetos.$inferSelect;
export type InsertFinanceProjeto = typeof financeProjetos.$inferInsert;

// Clientes do Financeiro (tags de receita). nome único; cor hex para o chip.
export const financeClientes = mysqlTable("finance_clientes", {
  id: int("id").autoincrement().primaryKey(),
  nome: varchar("nome", { length: 120 }).notNull().unique(),
  cor: varchar("cor", { length: 9 }),
  ativo: boolean("ativo").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type FinanceCliente = typeof financeClientes.$inferSelect;
export type InsertFinanceCliente = typeof financeClientes.$inferInsert;
export type FinancePnlEntry = typeof financePnlEntries.$inferSelect;
export type InsertFinancePnlEntry = typeof financePnlEntries.$inferInsert;

export const financeReembolsos = mysqlTable("finance_reembolsos", {
  id: int("id").autoincrement().primaryKey(),
  mes: varchar("mes", { length: 7 }).notNull(),
  categoria: mysqlEnum("categoria", ["PLATAFORMA_ANUNCIOS", "OFFICE", "EXTRAS"]).notNull(),
  descricao: varchar("descricao", { length: 255 }).notNull(),
  valorCents: int("valorCents").notNull(),
  quemPagou: varchar("quemPagou", { length: 120 }),
  reembolsado: boolean("reembolsado").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  idxMes: index("idx_reemb_mes").on(table.mes),
  idxCategoria: index("idx_reemb_categoria").on(table.categoria),
}));
export type FinanceReembolso = typeof financeReembolsos.$inferSelect;
export type InsertFinanceReembolso = typeof financeReembolsos.$inferInsert;

export const financeRetiradas = mysqlTable("finance_retiradas", {
  id: int("id").autoincrement().primaryKey(),
  mes: varchar("mes", { length: 7 }).notNull(),
  descricao: varchar("descricao", { length: 120 }).notNull(),
  valorCents: int("valorCents").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  idxMes: index("idx_retir_mes").on(table.mes),
}));
export type FinanceRetirada = typeof financeRetiradas.$inferSelect;
export type InsertFinanceRetirada = typeof financeRetiradas.$inferInsert;
