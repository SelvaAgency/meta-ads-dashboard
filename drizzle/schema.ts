import {
  bigint,
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
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

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
  description: text("description").notNull(),
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
