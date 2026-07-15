import { logger } from "./logger";
import { and, desc, eq, gt, gte, inArray, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser,
  userIntegrations,
  type InsertUserIntegration,
  newsItems,
  type InsertNewsItem,
  selvatvItems,
  type InsertSelvatvItem,
  accessClients,
  type InsertAccessClient,
  accessItems,
  type InsertAccessItem,
  accessAuditLogs,
  type InsertAccessAuditLog,
  userAuditLogs,
  type InsertUserAuditLog,
  financePnlEntries,
  type InsertFinancePnlEntry,
  financeReembolsos,
  type InsertFinanceReembolso,
  financeRetiradas,
  financeMesesFechados,
  type InsertFinanceRetirada,
  financeClientes,
  financeRecorrencia,
  type InsertFinanceRecorrencia,
  financeProjetos,
  appSettings,
  selvatvPollVotes,
  aiSuggestions,
  alerts,
  anomalies,
  campaignMetrics,
  campaigns,
  metaAdAccounts,
  scheduledReports,
  users,
  googleAdAccounts,
  ga4Accounts,
  experiments,
  experimentKpis,
  experimentCheckpoints,
  experimentDecisions,
  dailyBriefings,
  type InsertAiSuggestion,
  type InsertAlert,
  type InsertAnomaly,
  type InsertCampaign,
  type InsertCampaignMetrics,
  type InsertMetaAdAccount,
  type InsertScheduledReport,
  type InsertGoogleAdAccount,
  type InsertGA4Account,
  type InsertExperiment,
  type InsertExperimentKpi,
  type InsertExperimentCheckpoint,
  type InsertExperimentDecision,
  accountContext,
  agencyContext,
  actionOutcomes,
  reportSnapshots,
  type InsertAccountContext,
  type InsertAgencyContext,
  type InsertReportSnapshot,
} from "../drizzle/schema";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── Users ────────────────────────────────────────────────────────────────────

// ⚠️ NÃO reintroduzir um upsert genérico de usuários. Login/seed/migração NUNCA
// podem sobrescrever role/perfil de usuário existente — a tabela `users` é a
// fonte da verdade. Use createUserFromOAuth (criar) e touchExistingUserLogin
// (login de existente = só lastSignedIn). Alteração de perfil só via people.update.

/** PRIMEIRO acesso (OAuth/login): cria com campos MÍNIMOS + role inicial seguro. */
export async function createUserFromOAuth(data: {
  openId: string; email?: string | null; name?: string | null;
  role?: "user" | "admin" | "developer"; loginMethod?: string;
}): Promise<void> {
  if (!data.openId) throw new Error("openId é obrigatório");
  const db = await getDb();
  if (!db) return;
  await db.insert(users).values({
    openId: data.openId,
    email: data.email ?? null,
    name: data.name ?? null,
    role: data.role ?? "user",
    loginMethod: data.loginMethod ?? "email",
    lastSignedIn: new Date(),
  });
}

/**
 * Login de usuário JÁ existente. Não sobrescrever role ou perfil de usuário
 * existente no login. A tabela users é a fonte da verdade — só toca lastSignedIn.
 */
export async function touchExistingUserLogin(openId: string): Promise<void> {
  if (!openId) return;
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ lastSignedIn: new Date() }).where(eq(users.openId, openId));
}

/** Nº de admins ATIVOS — usado para proteger o último administrador. */
export async function countActiveAdmins(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const rows = await db.select({ id: users.id }).from(users).where(and(eq(users.role, "admin"), eq(users.active, true)));
  return rows.length;
}

/** Auditoria de usuário (role/status/perfil). Nunca guarda senha/segredos. */
export async function createUserAudit(data: InsertUserAuditLog): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(userAuditLogs).values(data);
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ─── Colaboradores (People management) ────────────────────────────────────────

/** Todos os colaboradores (sem passwordHash exposto pelo caller). */
export async function getAllUsers() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(users).orderBy(users.name);
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createEmployee(data: InsertUser) {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  await db.insert(users).values(data);
  return getUserByOpenId(data.openId);
}

/** Atualiza campos de perfil/role/status. Nunca toca em passwordHash. */
export async function updateUserFields(
  id: number,
  patch: Partial<Pick<
    typeof users.$inferInsert,
    "name" | "email" | "role" | "jobTitle" | "birthdayDay" | "birthdayMonth" | "active"
  >>,
) {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  await db.update(users).set(patch).where(eq(users.id, id));
  return getUserById(id);
}

/** Define nova senha (hash) e marca mustChangePassword conforme necessário. */
export async function setUserPassword(id: number, passwordHash: string, mustChangePassword: boolean) {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  await db.update(users).set({ passwordHash, mustChangePassword }).where(eq(users.id, id));
}

export async function updateUserAvatar(id: number, avatarKey: string | null) {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  await db.update(users).set({ avatarKey }).where(eq(users.id, id));
}

// ─── News bar (persistente) ───────────────────────────────────────────────────

export async function listActiveNews() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(newsItems).where(eq(newsItems.active, true))
    .orderBy(newsItems.sortOrder, newsItems.id);
}
export async function listAllNews() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(newsItems).orderBy(newsItems.sortOrder, newsItems.id);
}
export async function createNewsItem(data: InsertNewsItem) {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  await db.insert(newsItems).values(data);
}
export async function updateNewsItem(id: number, patch: Partial<InsertNewsItem>) {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  await db.update(newsItems).set(patch).where(eq(newsItems.id, id));
}
export async function deleteNewsItem(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  await db.delete(newsItems).where(eq(newsItems.id, id));
}
export async function setNewsOrder(orderedIds: number[]) {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  await Promise.all(orderedIds.map((id, i) => db.update(newsItems).set({ sortOrder: i }).where(eq(newsItems.id, id))));
}
export async function nextNewsSortOrder(): Promise<number> {
  const rows = await listAllNews();
  return rows.length ? Math.max(...rows.map((r) => r.sortOrder)) + 1 : 0;
}

// ─── SelvaTV (persistente) ────────────────────────────────────────────────────

export async function listActiveSelvatv() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(selvatvItems).where(eq(selvatvItems.active, true))
    .orderBy(selvatvItems.sortOrder, selvatvItems.id);
}
export async function listAllSelvatv() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(selvatvItems).orderBy(selvatvItems.sortOrder, selvatvItems.id);
}
export async function getSelvatvById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(selvatvItems).where(eq(selvatvItems.id, id)).limit(1);
  return rows[0];
}
export async function createSelvatvItem(data: InsertSelvatvItem) {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  await db.insert(selvatvItems).values(data);
}
export async function updateSelvatvItem(id: number, patch: Partial<InsertSelvatvItem>) {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  await db.update(selvatvItems).set(patch).where(eq(selvatvItems.id, id));
}
export async function deleteSelvatvItem(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  await db.delete(selvatvItems).where(eq(selvatvItems.id, id));
}
export async function setSelvatvOrder(orderedIds: number[]) {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  await Promise.all(orderedIds.map((id, i) => db.update(selvatvItems).set({ sortOrder: i }).where(eq(selvatvItems.id, id))));
}
export async function nextSelvatvSortOrder(): Promise<number> {
  const rows = await listAllSelvatv();
  return rows.length ? Math.max(...rows.map((r) => r.sortOrder)) + 1 : 0;
}

// ─── Acessos (cofre de credenciais) ───────────────────────────────────────────

export async function getActiveAccessClients() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(accessClients).where(eq(accessClients.active, true))
    .orderBy(desc(accessClients.isInternal), accessClients.sortOrder, accessClients.name);
}
export async function getAccessClientById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(accessClients).where(eq(accessClients.id, id)).limit(1);
  return rows[0];
}
export async function getAccessClientBySlug(slug: string) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(accessClients).where(eq(accessClients.slug, slug)).limit(1);
  return rows[0];
}
export async function createAccessClient(data: InsertAccessClient): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  const [row] = await db.insert(accessClients).values(data).$returningId();
  return row.id;
}
export async function updateAccessClient(id: number, patch: Partial<InsertAccessClient>) {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  await db.update(accessClients).set(patch).where(eq(accessClients.id, id));
}

export async function getAllActiveAccessItems() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(accessItems).where(eq(accessItems.active, true));
}
export async function getActiveAccessItemsByClient(clientId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(accessItems)
    .where(and(eq(accessItems.clientId, clientId), eq(accessItems.active, true)))
    .orderBy(desc(accessItems.updatedAt));
}
export async function getAccessItemById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(accessItems).where(eq(accessItems.id, id)).limit(1);
  return rows[0];
}
export async function createAccessItem(data: InsertAccessItem): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  const [row] = await db.insert(accessItems).values(data).$returningId();
  return row.id;
}
export async function updateAccessItem(id: number, patch: Partial<InsertAccessItem>) {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  await db.update(accessItems).set(patch).where(eq(accessItems.id, id));
}
/** Soft delete: desativa todos os itens de um cliente. Retorna a contagem. */
export async function deactivateAccessItemsByClient(clientId: number, userId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const items = await getActiveAccessItemsByClient(clientId);
  if (items.length) {
    await db.update(accessItems).set({ active: false, updatedByUserId: userId })
      .where(and(eq(accessItems.clientId, clientId), eq(accessItems.active, true)));
  }
  return items.length;
}

export async function createAccessAudit(data: InsertAccessAuditLog) {
  const db = await getDb();
  if (!db) return;
  await db.insert(accessAuditLogs).values(data);
}

// ─── Configurações key-value ──────────────────────────────────────────────────
export async function getAppSetting<T = unknown>(key: string): Promise<T | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(appSettings).where(eq(appSettings.settingKey, key)).limit(1);
  return rows.length ? (rows[0].valueJson as T) : null;
}
export async function setAppSetting(key: string, value: unknown, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  await db.insert(appSettings)
    .values({ settingKey: key, valueJson: value as any, updatedByUserId: userId })
    .onDuplicateKeyUpdate({ set: { valueJson: value as any, updatedByUserId: userId } });
}

// ─── Votos do slide "Você prefere?" ───────────────────────────────────────────
export async function getPollVotesWithUsers() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({ userId: selvatvPollVotes.userId, optionKey: selvatvPollVotes.optionKey, name: users.name, avatarKey: users.avatarKey })
    .from(selvatvPollVotes)
    .innerJoin(users, eq(selvatvPollVotes.userId, users.id));
}
export async function upsertPollVote(userId: number, optionKey: "left" | "right") {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  await db.insert(selvatvPollVotes)
    .values({ userId, optionKey })
    .onDuplicateKeyUpdate({ set: { optionKey } });
}
/** Zera todos os votos da enquete (usado quando a pergunta/opções mudam). */
export async function clearPollVotes() {
  const db = await getDb();
  if (!db) return;
  await db.delete(selvatvPollVotes);
}

// ─── Integrações por usuário (OAuth) ──────────────────────────────────────────

export async function getUserIntegration(userId: number, provider: string) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(userIntegrations)
    .where(and(eq(userIntegrations.userId, userId), eq(userIntegrations.provider, provider)))
    .limit(1);
  return rows.length > 0 ? rows[0] : undefined;
}

/** Cria ou atualiza a integração do usuário (upsert por userId+provider). */
export async function upsertUserIntegration(data: InsertUserIntegration) {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  const existing = await getUserIntegration(data.userId, data.provider);
  if (existing) {
    await db.update(userIntegrations).set({ ...data, disconnectedAt: null }).where(eq(userIntegrations.id, existing.id));
    return;
  }
  await db.insert(userIntegrations).values(data);
}

/** Atualiza apenas os tokens/expiração (após refresh). */
export async function updateIntegrationTokens(id: number, fields: Partial<InsertUserIntegration>) {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  await db.update(userIntegrations).set(fields).where(eq(userIntegrations.id, id));
}

/** Desativa a integração e apaga os tokens do banco. */
export async function deactivateUserIntegration(userId: number, provider: string) {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  await db.update(userIntegrations)
    .set({ active: false, accessTokenEncrypted: null, refreshTokenEncrypted: null, disconnectedAt: new Date() })
    .where(and(eq(userIntegrations.userId, userId), eq(userIntegrations.provider, provider)));
}

// ─── Meta Ad Accounts ─────────────────────────────────────────────────────────

export async function getAllActiveMetaAdAccounts() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(metaAdAccounts).where(eq(metaAdAccounts.isActive, true));
}

/**
 * Lista GLOBAL de contas ativas (deduplicadas por accountId, mantendo a mais
 * recente). Clientes/contas são globais no Selva Spaces: qualquer usuário
 * logado vê todos. Não filtra por userId (roles limitam funcionalidades, não
 * clientes). Ações sensíveis continuam protegidas por role no backend.
 */
export async function getAllActiveMetaAdAccountsForListing() {
  const db = await getDb();
  if (!db) return [];
  const accounts = await db
    .select()
    .from(metaAdAccounts)
    .where(eq(metaAdAccounts.isActive, true))
    .orderBy(desc(metaAdAccounts.createdAt));

  const seen = new Set<string>();
  return accounts.filter((acc) => {
    if (seen.has(acc.accountId)) return false;
    seen.add(acc.accountId);
    return true;
  });
}
export async function getMetaAdAccountsByUserId(userId: number) {
  const db = await getDb();
  if (!db) return [];
  const accounts = await db
    .select()
    .from(metaAdAccounts)
    .where(and(eq(metaAdAccounts.userId, userId), eq(metaAdAccounts.isActive, true)))
    .orderBy(desc(metaAdAccounts.createdAt));
  
  // Deduplicate by accountId (keep most recent)
  const seen = new Set<string>();
  const deduped = accounts.filter((acc) => {
    if (seen.has(acc.accountId)) {
      logger.info(`[DB] Duplicate account detected: ${acc.accountId} (id: ${acc.id}), filtering out`);
      return false;
    }
    seen.add(acc.accountId);
    return true;
  });
  
  if (deduped.length < accounts.length) {
    logger.info(`[DB] Deduplication: ${accounts.length} accounts -> ${deduped.length} unique accounts`);
  }
  
  return deduped;
}

export async function getMetaAdAccountById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(metaAdAccounts).where(eq(metaAdAccounts.id, id)).limit(1);
  return result[0];
}

export async function createMetaAdAccount(data: InsertMetaAdAccount) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  
  // Check if account already exists by accountId (match ANY user to avoid duplicates)
  const existing = await db
    .select()
    .from(metaAdAccounts)
    .where(eq(metaAdAccounts.accountId, data.accountId))
    .limit(1);
  
  if (existing.length > 0) {
    // Update accessToken, reactivate, and update other fields if account already exists
    logger.info(`[DB] Account ${data.accountId} already exists (id=${existing[0].id}), updating accessToken and reactivating`);
    await db
      .update(metaAdAccounts)
      .set({
        accessToken: data.accessToken,
        accountName: data.accountName ?? existing[0].accountName,
        currency: data.currency ?? existing[0].currency,
        timezone: data.timezone ?? existing[0].timezone,
        isActive: true,
        ...(data.pictureUrl !== undefined ? { pictureUrl: data.pictureUrl } : {}),
      })
      .where(eq(metaAdAccounts.id, existing[0].id));
    return { ...existing[0], accessToken: data.accessToken, isActive: true };
  }
  
  logger.info(`[DB] Creating new account ${data.accountId} for user ${data.userId}`);
  const result = await db.insert(metaAdAccounts).values(data);
  return result;
}

export async function updateMetaAdAccountSync(id: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(metaAdAccounts)
    .set({ lastSyncAt: new Date() })
    .where(eq(metaAdAccounts.id, id));
}

export async function updateAccountNote(id: number, note: string) {
  const db = await getDb();
  if (!db) return;
  await db.update(metaAdAccounts).set({ accountNote: note }).where(eq(metaAdAccounts.id, id));
}

export async function updateAccountGoalType(id: number, goalTypeOverride: string | null) {
  const db = await getDb();
  if (!db) return;
  await db.update(metaAdAccounts).set({ goalTypeOverride }).where(eq(metaAdAccounts.id, id));
}

export async function updateAccountAiStatus(id: number, color: "green" | "yellow" | "red", summary: string) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(metaAdAccounts)
    .set({ aiStatusColor: color, aiStatusSummary: summary.slice(0, 500) })
    .where(eq(metaAdAccounts.id, id));
}

export async function updateAccountPicture(id: number, pictureUrl: string | null) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(metaAdAccounts)
    .set({ pictureUrl })
    .where(eq(metaAdAccounts.id, id));
}

export async function deleteMetaAdAccount(id: number, userId: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(metaAdAccounts)
    .set({ isActive: false })
    .where(and(eq(metaAdAccounts.id, id), eq(metaAdAccounts.userId, userId)));
}

// ─── Campaigns ────────────────────────────────────────────────────────────────

// Retorna o conjunto de metaCampaignId que estao ATIVAS e tiveram gasto
// nos ultimos `days` dias (default 3) — usado para filtrar falsos positivos
// de alertas tecnicos (criativo rejeitado / erro em anuncio) em campanhas
// antigas ou pausadas que nao estao mais consumindo orcamento.
export async function getActiveCampaignMetaIdsWithRecentSpend(accountId: number, days: number = 3): Promise<Set<string>> {
  const db = await getDb();
  if (!db) return new Set();

  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

  const rows = await db
    .select({
      metaCampaignId: campaigns.metaCampaignId,
      totalSpend: sql<number>`SUM(${campaignMetrics.spend})`,
    })
    .from(campaigns)
    .innerJoin(campaignMetrics, eq(campaignMetrics.campaignId, campaigns.id))
    .where(and(
      eq(campaigns.accountId, accountId),
      eq(campaigns.status, "ACTIVE"),
      gte(campaignMetrics.date, fmt(start)),
      lte(campaignMetrics.date, fmt(end)),
    ))
    .groupBy(campaigns.metaCampaignId);

  const result = new Set<string>();
  for (const row of rows) {
    if (Number(row.totalSpend ?? 0) > 0) result.add(row.metaCampaignId);
  }
  return result;
}

export async function getCampaignsByAccountId(accountId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(campaigns)
    .where(eq(campaigns.accountId, accountId))
    .orderBy(desc(campaigns.updatedAt));
}

export async function getCampaignById(campaignId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Get campaigns for the Campaigns page:
 * - ONLY ACTIVE campaigns (no paused, deleted, or archived)
 */
export async function getActiveCampaignsForDisplay(accountId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(campaigns)
    .where(
      and(
        eq(campaigns.accountId, accountId),
        eq(campaigns.status, "ACTIVE")
      )
    )
    .orderBy(desc(campaigns.updatedAt));
}

export async function upsertCampaign(data: InsertCampaign) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  
  try {
    logger.info(`[upsertCampaign] Upserting campaign ${data.metaCampaignId} for account ${data.accountId}`);
    await db
      .insert(campaigns)
      .values(data)
      .onDuplicateKeyUpdate({
        set: {
          name: data.name,
          status: data.status,
          objective: data.objective,
          optimizationGoal: data.optimizationGoal,
          resultLabel: data.resultLabel,
          dailyBudget: data.dailyBudget,
          lifetimeBudget: data.lifetimeBudget,
          stopTime: data.stopTime,
          updatedAt: new Date(),
        },
      });
    logger.info(`[upsertCampaign] Success: ${data.metaCampaignId}`);
  } catch (error) {
    console.error(`[upsertCampaign] Error upserting campaign ${data.metaCampaignId} for account ${data.accountId}:`, error);
    throw error;
  }
}

// Mark campaigns not returned by Meta API as ARCHIVED (they were deleted/removed in Meta)
export async function markStaleCampaignsArchived(accountId: number, activeMetaCampaignIds: string[]) {
  const db = await getDb();
  if (!db) return;

  if (activeMetaCampaignIds.length === 0) {
    console.warn("[markStaleCampaignsArchived] No active campaigns from Meta — skipping to avoid mass archive");
    return;
  }

  try {
    // Get all campaigns for this account that are ACTIVE or PAUSED in our DB
    const localCampaigns = await db
      .select({ id: campaigns.id, metaCampaignId: campaigns.metaCampaignId, status: campaigns.status })
      .from(campaigns)
      .where(
        and(
          eq(campaigns.accountId, accountId),
          or(
            eq(campaigns.status, "ACTIVE"),
            eq(campaigns.status, "PAUSED")
          )
        )
      );

    const metaIdSet = new Set(activeMetaCampaignIds);
    let archivedCount = 0;

    for (const lc of localCampaigns) {
      if (!metaIdSet.has(lc.metaCampaignId)) {
        await db
          .update(campaigns)
          .set({ status: "ARCHIVED", updatedAt: new Date() })
          .where(eq(campaigns.id, lc.id));
        archivedCount++;
        logger.info(`[markStaleCampaignsArchived] Archived stale campaign ${lc.metaCampaignId} (local id ${lc.id})`);
      }
    }

    if (archivedCount > 0) {
      logger.info(`[markStaleCampaignsArchived] Archived ${archivedCount} stale campaigns for account ${accountId}`);
    }
  } catch (error) {
    console.error("[markStaleCampaignsArchived] Error:", error);
  }
}

// ─── Campaign Metrics ─────────────────────────────────────────────────────────

export async function getCampaignMetrics(campaignId: number, startDate: string, endDate: string) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(campaignMetrics)
    .where(
      and(
        eq(campaignMetrics.campaignId, campaignId),
        gte(campaignMetrics.date, startDate),
        lte(campaignMetrics.date, endDate)
      )
    )
    .orderBy(campaignMetrics.date);
}

export async function getAccountMetricsSummary(accountId: number, startDate: string, endDate: string) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      date: campaignMetrics.date,
      totalSpend: sql<number>`SUM(${campaignMetrics.spend})`,
      totalImpressions: sql<number>`SUM(${campaignMetrics.impressions})`,
      totalClicks: sql<number>`SUM(${campaignMetrics.clicks})`,
      totalConversions: sql<number>`SUM(${campaignMetrics.conversions})`,
      totalConversionValue: sql<number>`SUM(${campaignMetrics.conversionValue})`,
      totalReach: sql<number>`SUM(${campaignMetrics.reach})`,
      // Weighted ROAS: total conversion value / total spend (more accurate than AVG of ratios)
      avgRoas: sql<number>`CASE WHEN SUM(${campaignMetrics.spend}) > 0 THEN SUM(${campaignMetrics.conversionValue}) / SUM(${campaignMetrics.spend}) ELSE 0 END`,
      // Weighted CPA: total spend / total conversions
      avgCpa: sql<number>`CASE WHEN SUM(${campaignMetrics.conversions}) > 0 THEN SUM(${campaignMetrics.spend}) / SUM(${campaignMetrics.conversions}) ELSE 0 END`,
      // Weighted CTR: total clicks / total impressions * 100
      avgCtr: sql<number>`CASE WHEN SUM(${campaignMetrics.impressions}) > 0 THEN (SUM(${campaignMetrics.clicks}) / SUM(${campaignMetrics.impressions})) * 100 ELSE 0 END`,
      // Weighted CPC: total spend / total clicks
      avgCpc: sql<number>`CASE WHEN SUM(${campaignMetrics.clicks}) > 0 THEN SUM(${campaignMetrics.spend}) / SUM(${campaignMetrics.clicks}) ELSE 0 END`,
      // Weighted CPM: total spend / total impressions * 1000
      avgCpm: sql<number>`CASE WHEN SUM(${campaignMetrics.impressions}) > 0 THEN (SUM(${campaignMetrics.spend}) / SUM(${campaignMetrics.impressions})) * 1000 ELSE 0 END`,
      avgFrequency: sql<number>`AVG(${campaignMetrics.frequency})`,
      totalProfileVisits: sql<number>`SUM(${campaignMetrics.profileVisits})`,
      totalFollowers: sql<number>`SUM(${campaignMetrics.followers})`,
      totalMessages: sql<number>`SUM(${campaignMetrics.messages})`,
      totalLinkClicks: sql<number>`SUM(${campaignMetrics.linkClicks})`,
      totalAddToCart: sql<number>`SUM(${campaignMetrics.addToCart})`,
      totalLandingPageViews: sql<number>`SUM(${campaignMetrics.landingPageViews})`,
    })
    .from(campaignMetrics)
    .where(
      and(
        eq(campaignMetrics.accountId, accountId),
        gte(campaignMetrics.date, startDate),
        lte(campaignMetrics.date, endDate)
      )
    )
    .groupBy(campaignMetrics.date)
    .orderBy(campaignMetrics.date);
}

export async function getCampaignPerformanceSummary(accountId: number, startDate: string, endDate: string) {
  const db = await getDb();
  if (!db) return [];

  // Use LEFT JOIN so active campaigns always appear even with no metrics in the date range
  return db
    .select({
      campaignId: campaigns.id,
      metaCampaignId: campaigns.metaCampaignId,
      campaignName: campaigns.name,
      campaignStatus: campaigns.status,
      campaignObjective: campaigns.objective,
      campaignOptimizationGoal: campaigns.optimizationGoal,
      campaignResultLabel: campaigns.resultLabel,
      totalSpend: sql<number>`COALESCE(SUM(CASE WHEN ${campaignMetrics.date} >= ${startDate} AND ${campaignMetrics.date} <= ${endDate} THEN ${campaignMetrics.spend} ELSE 0 END), 0)`,
      totalImpressions: sql<number>`COALESCE(SUM(CASE WHEN ${campaignMetrics.date} >= ${startDate} AND ${campaignMetrics.date} <= ${endDate} THEN ${campaignMetrics.impressions} ELSE 0 END), 0)`,
      totalClicks: sql<number>`COALESCE(SUM(CASE WHEN ${campaignMetrics.date} >= ${startDate} AND ${campaignMetrics.date} <= ${endDate} THEN ${campaignMetrics.clicks} ELSE 0 END), 0)`,
      totalConversions: sql<number>`COALESCE(SUM(CASE WHEN ${campaignMetrics.date} >= ${startDate} AND ${campaignMetrics.date} <= ${endDate} THEN ${campaignMetrics.conversions} ELSE 0 END), 0)`,
      totalConversionValue: sql<number>`COALESCE(SUM(CASE WHEN ${campaignMetrics.date} >= ${startDate} AND ${campaignMetrics.date} <= ${endDate} THEN ${campaignMetrics.conversionValue} ELSE 0 END), 0)`,
      totalReach: sql<number>`COALESCE(SUM(CASE WHEN ${campaignMetrics.date} >= ${startDate} AND ${campaignMetrics.date} <= ${endDate} THEN ${campaignMetrics.reach} ELSE 0 END), 0)`,
      avgRoas: sql<number>`CASE WHEN SUM(CASE WHEN ${campaignMetrics.date} >= ${startDate} AND ${campaignMetrics.date} <= ${endDate} THEN ${campaignMetrics.spend} ELSE 0 END) > 0 THEN SUM(CASE WHEN ${campaignMetrics.date} >= ${startDate} AND ${campaignMetrics.date} <= ${endDate} THEN ${campaignMetrics.conversionValue} ELSE 0 END) / SUM(CASE WHEN ${campaignMetrics.date} >= ${startDate} AND ${campaignMetrics.date} <= ${endDate} THEN ${campaignMetrics.spend} ELSE 0 END) ELSE 0 END`,
      avgCpa: sql<number>`CASE WHEN SUM(CASE WHEN ${campaignMetrics.date} >= ${startDate} AND ${campaignMetrics.date} <= ${endDate} THEN ${campaignMetrics.conversions} ELSE 0 END) > 0 THEN SUM(CASE WHEN ${campaignMetrics.date} >= ${startDate} AND ${campaignMetrics.date} <= ${endDate} THEN ${campaignMetrics.spend} ELSE 0 END) / SUM(CASE WHEN ${campaignMetrics.date} >= ${startDate} AND ${campaignMetrics.date} <= ${endDate} THEN ${campaignMetrics.conversions} ELSE 0 END) ELSE 0 END`,
      avgCtr: sql<number>`CASE WHEN SUM(CASE WHEN ${campaignMetrics.date} >= ${startDate} AND ${campaignMetrics.date} <= ${endDate} THEN ${campaignMetrics.impressions} ELSE 0 END) > 0 THEN (SUM(CASE WHEN ${campaignMetrics.date} >= ${startDate} AND ${campaignMetrics.date} <= ${endDate} THEN ${campaignMetrics.clicks} ELSE 0 END) / SUM(CASE WHEN ${campaignMetrics.date} >= ${startDate} AND ${campaignMetrics.date} <= ${endDate} THEN ${campaignMetrics.impressions} ELSE 0 END)) * 100 ELSE 0 END`,
      avgCpc: sql<number>`CASE WHEN SUM(CASE WHEN ${campaignMetrics.date} >= ${startDate} AND ${campaignMetrics.date} <= ${endDate} THEN ${campaignMetrics.clicks} ELSE 0 END) > 0 THEN SUM(CASE WHEN ${campaignMetrics.date} >= ${startDate} AND ${campaignMetrics.date} <= ${endDate} THEN ${campaignMetrics.spend} ELSE 0 END) / SUM(CASE WHEN ${campaignMetrics.date} >= ${startDate} AND ${campaignMetrics.date} <= ${endDate} THEN ${campaignMetrics.clicks} ELSE 0 END) ELSE 0 END`,
      avgCpm: sql<number>`CASE WHEN SUM(CASE WHEN ${campaignMetrics.date} >= ${startDate} AND ${campaignMetrics.date} <= ${endDate} THEN ${campaignMetrics.impressions} ELSE 0 END) > 0 THEN (SUM(CASE WHEN ${campaignMetrics.date} >= ${startDate} AND ${campaignMetrics.date} <= ${endDate} THEN ${campaignMetrics.spend} ELSE 0 END) / SUM(CASE WHEN ${campaignMetrics.date} >= ${startDate} AND ${campaignMetrics.date} <= ${endDate} THEN ${campaignMetrics.impressions} ELSE 0 END)) * 1000 ELSE 0 END`,
      avgFrequency: sql<number>`CASE WHEN SUM(CASE WHEN ${campaignMetrics.date} >= ${startDate} AND ${campaignMetrics.date} <= ${endDate} THEN ${campaignMetrics.reach} ELSE 0 END) > 0 THEN SUM(CASE WHEN ${campaignMetrics.date} >= ${startDate} AND ${campaignMetrics.date} <= ${endDate} THEN ${campaignMetrics.impressions} ELSE 0 END) / SUM(CASE WHEN ${campaignMetrics.date} >= ${startDate} AND ${campaignMetrics.date} <= ${endDate} THEN ${campaignMetrics.reach} ELSE 0 END) ELSE 0 END`,
      totalProfileVisits: sql<number>`COALESCE(SUM(CASE WHEN ${campaignMetrics.date} >= ${startDate} AND ${campaignMetrics.date} <= ${endDate} THEN ${campaignMetrics.profileVisits} ELSE 0 END), 0)`,
      totalFollowers: sql<number>`COALESCE(SUM(CASE WHEN ${campaignMetrics.date} >= ${startDate} AND ${campaignMetrics.date} <= ${endDate} THEN ${campaignMetrics.followers} ELSE 0 END), 0)`,
      totalMessages: sql<number>`COALESCE(SUM(CASE WHEN ${campaignMetrics.date} >= ${startDate} AND ${campaignMetrics.date} <= ${endDate} THEN ${campaignMetrics.messages} ELSE 0 END), 0)`,
      totalLinkClicks: sql<number>`COALESCE(SUM(CASE WHEN ${campaignMetrics.date} >= ${startDate} AND ${campaignMetrics.date} <= ${endDate} THEN ${campaignMetrics.linkClicks} ELSE 0 END), 0)`,
      totalAddToCart: sql<number>`COALESCE(SUM(CASE WHEN ${campaignMetrics.date} >= ${startDate} AND ${campaignMetrics.date} <= ${endDate} THEN ${campaignMetrics.addToCart} ELSE 0 END), 0)`,
      totalLandingPageViews: sql<number>`COALESCE(SUM(CASE WHEN ${campaignMetrics.date} >= ${startDate} AND ${campaignMetrics.date} <= ${endDate} THEN ${campaignMetrics.landingPageViews} ELSE 0 END), 0)`,
    })
    .from(campaigns)
    .leftJoin(campaignMetrics, eq(campaignMetrics.campaignId, campaigns.id))
    .where(
      and(
        eq(campaigns.accountId, accountId),
        eq(campaigns.status, "ACTIVE")
      )
    )
    .groupBy(campaigns.id, campaigns.metaCampaignId, campaigns.name, campaigns.status, campaigns.objective, campaigns.optimizationGoal, campaigns.resultLabel)
    .orderBy(desc(sql`COALESCE(SUM(CASE WHEN ${campaignMetrics.date} >= ${startDate} AND ${campaignMetrics.date} <= ${endDate} THEN ${campaignMetrics.spend} ELSE 0 END), 0)`));
}

export async function upsertCampaignMetrics(data: InsertCampaignMetrics) {
  // Log metrics insertion for debugging
  if (data.spend === "0" && data.impressions === 0) {
    console.warn(`[upsertCampaignMetrics] WARNING: Zero metrics for campaign ${data.campaignId} on ${data.date}`);
  }
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  
  try {
    logger.info(`[upsertCampaignMetrics] Upserting metrics for campaign ${data.campaignId} on ${data.date} (spend: ${data.spend}, impressions: ${data.impressions})`);
    await db
      .insert(campaignMetrics)
      .values(data)
      .onDuplicateKeyUpdate({
        set: {
          impressions: data.impressions,
          clicks: data.clicks,
          spend: data.spend,
          conversions: data.conversions,
          conversionValue: data.conversionValue,
          reach: data.reach,
          frequency: data.frequency,
          ctr: data.ctr,
          cpc: data.cpc,
          cpm: data.cpm,
          cpa: data.cpa,
          roas: data.roas,
          profileVisits: data.profileVisits,
          followers: data.followers,
          messages: data.messages,
          linkClicks: data.linkClicks,
          addToCart: data.addToCart,
          landingPageViews: data.landingPageViews,
        },
      });
    logger.info(`[upsertCampaignMetrics] Success: campaign ${data.campaignId} on ${data.date}`);
  } catch (error) {
    console.error(`[upsertCampaignMetrics] Error upserting metrics for campaign ${data.campaignId} on ${data.date}:`, error);
    throw error;
  }
}

// ─── Anomalies ────────────────────────────────────────────────────────────────

export async function getAnomaliesByAccountId(accountId: number, limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(anomalies)
    .where(eq(anomalies.accountId, accountId))
    .orderBy(desc(anomalies.detectedAt))
    .limit(limit);
}

export async function getUnreadAnomaliesCount(accountId: number) {
  const db = await getDb();
  if (!db) return 0;
  const result = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(anomalies)
    .where(and(eq(anomalies.accountId, accountId), eq(anomalies.isRead, false)));
  return result[0]?.count ?? 0;
}

export async function createAnomaly(data: InsertAnomaly) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(anomalies).values(data);
  return result;
}


/**
 * Creates an anomaly ONLY if no unresolved anomaly with the same
 * accountId + type + metricName exists within the last 24 hours.
 * This prevents the hourly autoSync from creating duplicate entries.
 */
export async function createAnomalyIfNotExists(data: InsertAnomaly): Promise<any | null> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const existing = await db
    .select({ id: anomalies.id })
    .from(anomalies)
    .where(
      and(
        eq(anomalies.accountId, data.accountId),
        eq(anomalies.type, data.type),
        eq(anomalies.metricName, data.metricName ?? ""),
        eq(anomalies.isResolved, false),
        gte(anomalies.detectedAt, twentyFourHoursAgo)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    return null; // Anomalia idêntica já existe, não duplicar
  }

  const result = await db.insert(anomalies).values(data);
  return result;
}

export async function markAnomalyRead(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(anomalies).set({ isRead: true }).where(eq(anomalies.id, id));
}

export async function markAnomalyResolved(id: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(anomalies)
    .set({ isResolved: true, resolvedAt: new Date() })
    .where(eq(anomalies.id, id));
}

/**
 * Deleta anomalias que foram marcadas como lidas (isRead = true)
 * e foram detectadas há mais de 30 dias.
 * Chamada diária pelo cron job de limpeza.
 */
export async function purgeOldReadAnomalies() {
  const db = await getDb();
  if (!db) return 0;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const result = await db
    .delete(anomalies)
    .where(
      and(
        eq(anomalies.isRead, true),
        lt(anomalies.detectedAt, cutoff)
      )
    );
  return (result as any).affectedRows ?? 0;
}

// ─── AI Suggestions ───────────────────────────────────────────────────────────

// Get active suggestions (pending + applied/monitoring)
export async function getSuggestionsByAccountId(accountId: number, limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(aiSuggestions)
    .where(
      and(
        eq(aiSuggestions.accountId, accountId),
        eq(aiSuggestions.isDismissed, false),
        sql`${aiSuggestions.status} IN ('pending', 'applied')`
      )
    )
    .orderBy(desc(aiSuggestions.generatedAt))
    .limit(limit);
}

export async function getTodayMetricsForAllAccounts(userId: number) {
  const db = await getDb();
  if (!db) return [];
  // Buscar a data mais recente disponível no banco (últimas 48h para cobrir fuso UTC)
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
  const yesterday = new Date(now.getTime() - 86400000);
  const yday = `${yesterday.getFullYear()}-${String(yesterday.getMonth()+1).padStart(2,"0")}-${String(yesterday.getDate()).padStart(2,"0")}`;
  return db
    .select({
      accountId:            campaignMetrics.accountId,
      totalSpend:           sql<number>`SUM(${campaignMetrics.spend})`,
      totalConversions:     sql<number>`SUM(${campaignMetrics.conversions})`,
      totalImpressions:     sql<number>`SUM(${campaignMetrics.impressions})`,
      totalClicks:          sql<number>`SUM(${campaignMetrics.clicks})`,
      totalReach:           sql<number>`SUM(${campaignMetrics.reach})`,
      totalConversionValue: sql<number>`SUM(${campaignMetrics.conversionValue})`,
      avgCtr:  sql<number>`CASE WHEN SUM(${campaignMetrics.impressions}) > 0 THEN (SUM(${campaignMetrics.clicks}) / SUM(${campaignMetrics.impressions})) * 100 ELSE 0 END`,
      avgRoas: sql<number>`CASE WHEN SUM(${campaignMetrics.spend}) > 0 THEN SUM(${campaignMetrics.conversionValue}) / SUM(${campaignMetrics.spend}) ELSE 0 END`,
      avgCpa:  sql<number>`CASE WHEN SUM(${campaignMetrics.conversions}) > 0 THEN SUM(${campaignMetrics.spend}) / SUM(${campaignMetrics.conversions}) ELSE 0 END`,
      avgCpc:  sql<number>`CASE WHEN SUM(${campaignMetrics.clicks}) > 0 THEN SUM(${campaignMetrics.spend}) / SUM(${campaignMetrics.clicks}) ELSE 0 END`,
      avgCpm:  sql<number>`CASE WHEN SUM(${campaignMetrics.impressions}) > 0 THEN (SUM(${campaignMetrics.spend}) / SUM(${campaignMetrics.impressions})) * 1000 ELSE 0 END`,
    })
    .from(campaignMetrics)
    .innerJoin(metaAdAccounts, eq(campaignMetrics.accountId, metaAdAccounts.id))
    // Clientes são globais → métricas de TODAS as contas ativas (não por userId).
    .where(and(
      sql`${campaignMetrics.date} IN (${today}, ${yday})`,
      eq(metaAdAccounts.isActive, true)
    ))
    .groupBy(campaignMetrics.accountId);
}

export async function getUrgentAlertsForUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id:          alerts.id,
      title:       alerts.title,
      message:     alerts.message,
      severity:    alerts.severity,
      type:        alerts.type,
      createdAt:   alerts.createdAt,
      accountId:   alerts.accountId,
      accountName: metaAdAccounts.accountName,
    })
    .from(alerts)
    .innerJoin(metaAdAccounts, eq(alerts.accountId, metaAdAccounts.id))
    // Clientes são globais → alertas urgentes de TODAS as contas ativas.
    .where(and(
      eq(metaAdAccounts.isActive, true),
      eq(alerts.isRead, false),
      // Painel de urgentes é só Performance: financeiro é admin-only e nunca
      // pode vazar por este caminho, que é global por design (contas são globais).
      eq(alerts.dominio, "PERFORMANCE"),
      or(eq(alerts.severity, "CRITICAL"), eq(alerts.severity, "WARNING"))
    ))
    .orderBy(desc(alerts.createdAt))
    .limit(3);
}

export async function getAllSuggestionsForUser(userId: number) {
  const db = await getDb();
  if (!db) return { suggestions: [], appliedToday: 0 };

  const suggestions = await db
    .select({
      id: aiSuggestions.id,
      accountId: aiSuggestions.accountId,
      category: aiSuggestions.category,
      priority: aiSuggestions.priority,
      title: aiSuggestions.title,
      description: aiSuggestions.description,
      expectedImpact: aiSuggestions.expectedImpact,
      actionItems: aiSuggestions.actionItems,
      status: aiSuggestions.status,
      generatedAt: aiSuggestions.generatedAt,
      expiresAt: aiSuggestions.expiresAt,
      accountName: metaAdAccounts.accountName,
      metaAccountId: metaAdAccounts.accountId,
      aiStatusColor: metaAdAccounts.aiStatusColor,
    })
    .from(aiSuggestions)
    .innerJoin(metaAdAccounts, eq(aiSuggestions.accountId, metaAdAccounts.id))
    // Clientes são globais → sugestões de TODAS as contas ativas (não por userId).
    .where(
      and(
        eq(metaAdAccounts.isActive, true),
        eq(aiSuggestions.status, "pending"),
        eq(aiSuggestions.isDismissed, false)
      )
    )
    .orderBy(desc(aiSuggestions.generatedAt))
    .limit(200);

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const appliedRows = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(aiSuggestions)
    .innerJoin(metaAdAccounts, eq(aiSuggestions.accountId, metaAdAccounts.id))
    // Clientes são globais → contagem de aplicadas hoje em TODAS as contas ativas.
    .where(
      and(
        eq(metaAdAccounts.isActive, true),
        eq(aiSuggestions.status, "applied"),
        gte(aiSuggestions.appliedAt, todayStart)
      )
    );

  return { suggestions, appliedToday: Number(appliedRows[0]?.count ?? 0) };
}

// Get history (applied or rejected, within 30 days)
export async function getSuggestionsHistory(accountId: number, limit = 100) {
  const db = await getDb();
  if (!db) return [];
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  return db
    .select()
    .from(aiSuggestions)
    .where(
      and(
        eq(aiSuggestions.accountId, accountId),
        sql`${aiSuggestions.status} IN ('applied', 'rejected')`,
        sql`${aiSuggestions.generatedAt} >= ${thirtyDaysAgo}`
      )
    )
    .orderBy(desc(aiSuggestions.generatedAt))
    .limit(limit);
}

// Get suggestions being monitored (applied, monitorUntil in the future)
export async function getSuggestionsUnderMonitoring(accountId: number) {
  const db = await getDb();
  if (!db) return [];
  const now = new Date();
  return db
    .select()
    .from(aiSuggestions)
    .where(
      and(
        eq(aiSuggestions.accountId, accountId),
        eq(aiSuggestions.status, "applied"),
        sql`${aiSuggestions.monitorUntil} IS NOT NULL`,
        sql`${aiSuggestions.monitorUntil} > ${now}`,
        sql`${aiSuggestions.monitorResult} IS NULL`
      )
    );
}

export async function createAiSuggestion(data: InsertAiSuggestion) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  // Set expiry to 30 days from now
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);
  await db.insert(aiSuggestions).values({ ...data, expiresAt, status: data.status ?? "pending" });
}

export async function dismissSuggestion(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(aiSuggestions).set({ isDismissed: true }).where(eq(aiSuggestions.id, id));
}

export async function applySuggestion(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(aiSuggestions).set({ isApplied: true }).where(eq(aiSuggestions.id, id));
}

// Update suggestion status (applied or rejected) with optional rejection reason
export async function updateSuggestionStatus(
  id: number,
  status: "applied" | "rejected" | "pending",
  opts?: { rejectionReason?: string; metricsSnapshot?: Record<string, number>; monitorDays?: number }
) {
  const db = await getDb();
  if (!db) return;
  const now = new Date();
  const monitorDays = opts?.monitorDays ?? 7;
  const monitorUntil = status === "applied" ? new Date(now.getTime() + monitorDays * 24 * 60 * 60 * 1000) : null;
  await db
    .update(aiSuggestions)
    .set({
      status,
      appliedAt: status === "applied" ? now : null,
      monitorUntil: monitorUntil ?? undefined,
      rejectionReason: opts?.rejectionReason ?? null,
      metricsSnapshot: opts?.metricsSnapshot ?? null,
      isApplied: status === "applied",
      isDismissed: status === "rejected",
    })
    .where(eq(aiSuggestions.id, id));
  // Create informational notification when applied
  if (status === "applied") {
    try {
      const rows2 = await db.select({ accountId: aiSuggestions.accountId, title: aiSuggestions.title, description: aiSuggestions.description }).from(aiSuggestions).where(eq(aiSuggestions.id, id)).limit(1);
      const s2 = rows2[0];
      if (s2) {
        const acctRows = await db.select({ userId: metaAdAccounts.userId }).from(metaAdAccounts).where(eq(metaAdAccounts.id, s2.accountId)).limit(1);
        const userId = acctRows[0]?.userId;
        if (userId) {
          await createAlertIfNotExists({
            userId,
            accountId: s2.accountId,
            title: `Ação aplicada: ${s2.title}`,
            message: s2.description ?? "Sugestão marcada como aplicada.",
            type: "SUGGESTION_APPLIED" as any,
            severity: "INFO" as any,
          });
        }
      }
    } catch (err) {
      console.error("[updateSuggestionStatus] Failed to create notification:", err);
    }
  }

  // Quando rejeitada com motivo: salvar como aprendizado permanente da conta
  if (status === "rejected" && opts?.rejectionReason?.trim()) {
    try {
      const rows = await db.select({ accountId: aiSuggestions.accountId, category: aiSuggestions.category, title: aiSuggestions.title }).from(aiSuggestions).where(eq(aiSuggestions.id, id)).limit(1);
      const s = rows[0];
      if (s?.accountId) {
        const note = `Sugestão rejeitada [${s.category ?? "?"}]: "${s.title?.slice(0, 80)}" — Motivo: ${opts.rejectionReason.trim()}`;
        await appendAccountLearning(s.accountId, note, "rejection");
      }
    } catch (err) {
      console.warn("[updateSuggestionStatus] Failed to save rejection learning:", err);
    }
  }

  // Quando aplicada: criar action_outcome para fechar o loop de aprendizado
  if (status === "applied") {
    try {
      // Buscar accountId da sugestão
      const rows = await db.select({ accountId: aiSuggestions.accountId }).from(aiSuggestions).where(eq(aiSuggestions.id, id)).limit(1);
      const accountId = rows[0]?.accountId;
      if (accountId) {
        await createActionOutcome({
          suggestionId: id,
          accountId,
          appliedAt: now,
        });
      }
    } catch (err) {
      // Não bloquear o fluxo principal se falhar
      console.warn("[updateSuggestionStatus] Failed to create action outcome:", err);
    }
  }
}

// Save monitoring result after 7 days
export async function saveSuggestionMonitorResult(id: number, result: string) {
  const db = await getDb();
  if (!db) return;
  await db.update(aiSuggestions).set({ monitorResult: result }).where(eq(aiSuggestions.id, id));
}

// ─── Scheduled Reports ────────────────────────────────────────────────────────

export async function getScheduledReportsByUserId(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(scheduledReports)
    .where(eq(scheduledReports.userId, userId))
    .orderBy(desc(scheduledReports.createdAt));
}

export async function createScheduledReport(data: InsertScheduledReport) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(scheduledReports).values(data);
}

export async function createReportSnapshot(data: InsertReportSnapshot) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(reportSnapshots).values(data);
}

export async function getReportSnapshotByToken(token: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(reportSnapshots).where(eq(reportSnapshots.publicToken, token)).limit(1);
  return result[0];
}

export async function getReportSnapshotsByAccountId(accountId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(reportSnapshots)
    .where(eq(reportSnapshots.accountId, accountId))
    .orderBy(desc(reportSnapshots.generatedAt))
    .limit(20);
}


export async function updateScheduledReport(
  id: number,
  data: Partial<{ isActive: boolean; frequency: "DAILY" | "WEEKLY"; lastRunAt: Date; nextRunAt: Date; lastReportContent: string }>
) {
  const db = await getDb();
  if (!db) return;
  await db.update(scheduledReports).set(data).where(eq(scheduledReports.id, id));
}

export async function deleteScheduledReport(id: number, userId: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .delete(scheduledReports)
    .where(and(eq(scheduledReports.id, id), eq(scheduledReports.userId, userId)));
}

export async function getDueScheduledReports() {
  const db = await getDb();
  if (!db) return [];
  const now = new Date();
  return db
    .select()
    .from(scheduledReports)
    .where(and(eq(scheduledReports.isActive, true), lte(scheduledReports.nextRunAt, now)));
}

// ─── Alerts ───────────────────────────────────────────────────────────────────

export async function getAlertsByUserId(userId: number, limit = 50) {
  const db = await getDb();
  if (!db) return [];
  // Only return unread alerts — read alerts are deleted on markRead
  return db
    .select()
    .from(alerts)
    .where(and(eq(alerts.userId, userId), eq(alerts.isRead, false)))
    .orderBy(desc(alerts.createdAt))
    .limit(limit);
}

/**
 * Lista para o sino e a AlertsPage. leftJoin (não inner): notificação de domínio
 * FINANCEIRO não tem conta de mídia e sumiria num inner join.
 */
export async function getAllAlertsForUser(
  userId: number,
  limit = 200,
  filtro?: { dominio?: "PERFORMANCE" | "FINANCEIRO"; status?: "nova" | "lida" },
) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id:          alerts.id,
      title:       alerts.title,
      message:     alerts.message,
      severity:    alerts.severity,
      type:        alerts.type,
      dominio:     alerts.dominio,
      priority:    alerts.priority,
      suggestedAction: alerts.suggestedAction,
      isRead:      alerts.isRead,
      createdAt:   alerts.createdAt,
      accountId:   alerts.accountId,
      accountName: metaAdAccounts.accountName,
      metaAccountId: metaAdAccounts.accountId,
    })
    .from(alerts)
    .leftJoin(metaAdAccounts, eq(alerts.accountId, metaAdAccounts.id))
    .where(and(
      eq(alerts.userId, userId),
      ...(filtro?.dominio ? [eq(alerts.dominio, filtro.dominio)] : []),
      ...(filtro?.status ? [eq(alerts.isRead, filtro.status === "lida")] : []),
    ))
    .orderBy(desc(alerts.createdAt))
    .limit(limit);
}
export async function getAlertsByAccountId(userId: number, accountId: number, limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(alerts)
    .where(and(eq(alerts.userId, userId), eq(alerts.accountId, accountId), eq(alerts.isRead, false)))
    .orderBy(desc(alerts.createdAt))
    .limit(limit);
}

export async function getUnreadAlertsCount(userId: number) {
  const db = await getDb();
  if (!db) return 0;
  const result = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(alerts)
    .where(and(eq(alerts.userId, userId), eq(alerts.isRead, false)));
  return result[0]?.count ?? 0;
}

export async function getUnreadAlertsCountByAccount(userId: number, accountId: number) {
  const db = await getDb();
  if (!db) return 0;
  const result = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(alerts)
    .where(and(eq(alerts.userId, userId), eq(alerts.accountId, accountId), eq(alerts.isRead, false)));
  return result[0]?.count ?? 0;
}

export async function createAlert(data: InsertAlert) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(alerts).values(data);
  return result;
}

/**
 * Cria alerta APENAS se não existir um alerta ativo (não lido) com o mesmo
 * tipo + conta + título nas últimas 24h. Evita duplicação de alertas técnicos.
 * Retorna o resultado do INSERT ou null se já existia.
 */
export async function createAlertIfNotExists(data: InsertAlert): Promise<any | null> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // Sem filtro de isRead de propósito: com soft-read, o alerta dispensado
  // continua na tabela (isRead=true) e é justamente ele que precisa segurar o
  // dedup — senão o próximo ciclo do cron recria o que a pessoa acabou de fechar.
  const existing = await db
    .select({ id: alerts.id })
    .from(alerts)
    .where(
      and(
        data.accountId == null ? isNull(alerts.accountId) : eq(alerts.accountId, data.accountId),
        eq(alerts.type, data.type),
        eq(alerts.title, data.title),
        gte(alerts.createdAt, twentyFourHoursAgo)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    return null; // Alerta já existe, não duplicar
  }

  const result = await db.insert(alerts).values(data);
  return result;
}

/**
 * Remove alertas duplicados, mantendo apenas o mais recente de cada combinação
 * tipo + conta + título. Usar uma vez para limpar o backlog.
 */
export async function purgeDuplicateAlerts(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const result = await db.execute(sql`
    DELETE a1 FROM alerts a1
    INNER JOIN alerts a2
      ON a1.accountId = a2.accountId
      AND a1.type = a2.type
      AND a1.title = a2.title
      AND a1.isRead = false
      AND a2.isRead = false
      AND a1.id < a2.id
  `);

  return (result as any)?.[0]?.affectedRows ?? (result as any)?.affectedRows ?? 0;
}

export async function markAlertEmailSent(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(alerts).set({ emailSentAt: new Date() }).where(eq(alerts.id, id));
}

export async function markAnomalyEmailSent(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(anomalies).set({ emailSentAt: new Date() }).where(eq(anomalies.id, id));
}

/**
 * Marcar como lida é UPDATE, não DELETE. Além de o histórico sobreviver (e o
 * filtro lida/nova existir), é o que faz o dedup funcionar: createNotification
 * procura a linha por dedupKey — se dispensar apagasse a linha, o próximo ciclo
 * do cron recriaria a mesma notificação.
 */
export async function markAlertRead(id: number, userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(alerts).set({ isRead: true }).where(and(eq(alerts.id, id), eq(alerts.userId, userId)));
}

export async function markAllAlertsRead(userId: number, dominio?: "PERFORMANCE" | "FINANCEIRO") {
  const db = await getDb();
  if (!db) return;
  await db.update(alerts).set({ isRead: true }).where(and(
    eq(alerts.userId, userId),
    eq(alerts.isRead, false),
    ...(dominio ? [eq(alerts.dominio, dominio)] : []),
  ));
}

export async function markAllAlertsReadByAccount(userId: number, accountId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(alerts).set({ isRead: true }).where(and(eq(alerts.userId, userId), eq(alerts.accountId, accountId)));
}

// Limpa apenas as notificacoes informativas (sugestao aplicada, sync, experimento, relatorio)
// — nao afeta alertas criticos/tecnicos
export async function clearAllNotifications(userId: number) {
  const db = await getDb();
  if (!db) return;
  const notificationTypes = ["SUGGESTION_APPLIED", "EXPERIMENT_UPDATE", "REPORT", "SYNC_COMPLETE"] as const;
  await db.delete(alerts).where(and(
    eq(alerts.userId, userId),
    inArray(alerts.type, notificationTypes as any)
  ));
}

/**
 * Remove anomalias duplicadas não resolvidas, mantendo apenas a mais recente
 * de cada combinação accountId + type + metricName.
 */
export async function purgeDuplicateAnomalies(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const result = await db.execute(sql`
    DELETE a1 FROM anomalies a1
    INNER JOIN anomalies a2
      ON a1.accountId = a2.accountId
      AND a1.type = a2.type
      AND COALESCE(a1.metricName, '') = COALESCE(a2.metricName, '')
      AND a1.isResolved = false
      AND a2.isResolved = false
      AND a1.id < a2.id
  `);
  return (result as any)[0]?.affectedRows ?? 0;
}

// ─── Google Ad Accounts ─────────────────────────────────────────────────────

export async function getGoogleAdAccountsByUserId(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(googleAdAccounts)
    .where(and(eq(googleAdAccounts.userId, userId), eq(googleAdAccounts.isActive, true)))
    .orderBy(desc(googleAdAccounts.createdAt));
}

export async function getAllActiveGoogleAdAccounts() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(googleAdAccounts)
    .where(eq(googleAdAccounts.isActive, true));
}

export async function getGoogleAdAccountById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(googleAdAccounts)
    .where(eq(googleAdAccounts.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function createGoogleAdAccount(data: InsertGoogleAdAccount) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(googleAdAccounts).values(data);
  return (result as any)[0]?.insertId;
}

export async function updateGoogleAdAccountSync(id: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(googleAdAccounts)
    .set({ lastSyncAt: new Date() })
    .where(eq(googleAdAccounts.id, id));
}

export async function deleteGoogleAdAccount(id: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(googleAdAccounts)
    .set({ isActive: false })
    .where(eq(googleAdAccounts.id, id));
}


// Force-update accessToken for ALL active accounts (admin use)
export async function forceUpdateAllTokens(newToken: string) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db
    .update(metaAdAccounts)
    .set({ accessToken: newToken })
    .where(eq(metaAdAccounts.isActive, true));
  logger.info(`[DB] Force-updated accessToken for all active accounts`);
  return result;
}

// ─── GA4 Accounts ───────────────────────────────────────────────────────────


export async function getGA4AccountsByUserId(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(ga4Accounts)
    .where(and(eq(ga4Accounts.userId, userId), eq(ga4Accounts.isActive, true)))
    .orderBy(desc(ga4Accounts.createdAt));
}

export async function getAllActiveGA4Accounts() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(ga4Accounts)
    .where(eq(ga4Accounts.isActive, true));
}

export async function getGA4AccountById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(ga4Accounts)
    .where(eq(ga4Accounts.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function createGA4Account(data: InsertGA4Account) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(ga4Accounts).values(data);
  return (result as any)[0]?.insertId;
}

export async function updateGA4AccountSync(id: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(ga4Accounts)
    .set({ lastSyncAt: new Date() })
    .where(eq(ga4Accounts.id, id));
}

export async function deleteGA4Account(id: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(ga4Accounts)
    .set({ isActive: false })
    .where(eq(ga4Accounts.id, id));
}

// ─── Experiments ─────────────────────────────────────────────────────────────

export async function getExperimentsByUserId(userId: number, accountId?: number) {
  const db = await getDb();
  if (!db) return [];
  const whereClause = accountId != null
    ? and(eq(experiments.userId, userId), eq(experiments.accountId, accountId))
    : eq(experiments.userId, userId);
  return db
    .select({
      id: experiments.id,
      title: experiments.title,
      status: experiments.status,
      startDate: experiments.startDate,
      endDate: experiments.endDate,
      dailyBudget: experiments.dailyBudget,
      totalBudget: experiments.totalBudget,
      channels: experiments.channels,
      accountId: experiments.accountId,
      accountName: metaAdAccounts.accountName,
      createdAt: experiments.createdAt,
    })
    .from(experiments)
    .innerJoin(metaAdAccounts, eq(experiments.accountId, metaAdAccounts.id))
    .where(whereClause)
    .orderBy(desc(experiments.createdAt));
}

// Versao interna sem checagem de userId — uso exclusivo de jobs de sistema (cron)
export async function getExperimentBasicInfo(id: number): Promise<{ id: number; userId: number; accountId: number; title: string } | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select({ id: experiments.id, userId: experiments.userId, accountId: experiments.accountId, title: experiments.title })
    .from(experiments)
    .where(eq(experiments.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function getExperimentById(id: number, userId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(experiments)
    .where(and(eq(experiments.id, id), eq(experiments.userId, userId)))
    .limit(1);
  if (!rows[0]) return null;
  const exp = rows[0];
  const kpis = await db
    .select()
    .from(experimentKpis)
    .where(eq(experimentKpis.experimentId, id));
  const checkpoints = await db
    .select()
    .from(experimentCheckpoints)
    .where(eq(experimentCheckpoints.experimentId, id))
    .orderBy(experimentCheckpoints.date);
  const decisions = await db
    .select()
    .from(experimentDecisions)
    .where(eq(experimentDecisions.experimentId, id));
  const accountRow = await db
    .select({ accountName: metaAdAccounts.accountName })
    .from(metaAdAccounts)
    .where(eq(metaAdAccounts.id, exp.accountId))
    .limit(1);
  return {
    ...exp,
    accountName: accountRow[0]?.accountName ?? null,
    kpis,
    checkpoints,
    decisions,
  };
}

export async function createExperiment(
  data: InsertExperiment,
  kpis: InsertExperimentKpi[],
  checkpointDefs: InsertExperimentCheckpoint[],
  decisionDefs: InsertExperimentDecision[],
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(experiments).values(data);
  const expId = (result as any)[0]?.insertId as number;
  if (kpis.length > 0) {
    await db.insert(experimentKpis).values(kpis.map(k => ({ ...k, experimentId: expId })));
  }
  if (checkpointDefs.length > 0) {
    await db.insert(experimentCheckpoints).values(checkpointDefs.map(c => ({ ...c, experimentId: expId })));
  }
  if (decisionDefs.length > 0) {
    await db.insert(experimentDecisions).values(decisionDefs.map(d => ({ ...d, experimentId: expId })));
  }
  return expId;
}

export async function updateExperimentStatus(id: number, status: "planned" | "active" | "completed" | "paused") {
  const db = await getDb();
  if (!db) return;
  await db.update(experiments).set({ status, updatedAt: new Date() }).where(eq(experiments.id, id));
}

export async function updateCheckpointNote(checkpointId: number, note: string) {
  const db = await getDb();
  if (!db) return;
  await db.update(experimentCheckpoints).set({ qualitativeNote: note }).where(eq(experimentCheckpoints.id, checkpointId));
}

export async function deleteExperiment(id: number, userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(experimentDecisions).where(eq(experimentDecisions.experimentId, id));
  await db.delete(experimentCheckpoints).where(eq(experimentCheckpoints.experimentId, id));
  await db.delete(experimentKpis).where(eq(experimentKpis.experimentId, id));
  await db.delete(experiments).where(and(eq(experiments.id, id), eq(experiments.userId, userId)));
}

export async function getExperimentCampaignMetrics(
  campaignIds: number[],
  startDate: string,
  endDate: string,
) {
  const db = await getDb();
  if (!db || campaignIds.length === 0) return null;
  const conditions = campaignIds.map(id => eq(campaignMetrics.campaignId, id));
  const campaignFilter = conditions.length === 1 ? conditions[0] : or(...conditions);
  const rows = await db
    .select({
      totalSpend:       sql<number>`SUM(${campaignMetrics.spend})`,
      totalConversions: sql<number>`SUM(${campaignMetrics.conversions})`,
      totalImpressions: sql<number>`SUM(${campaignMetrics.impressions})`,
      totalClicks:      sql<number>`SUM(${campaignMetrics.clicks})`,
      totalReach:       sql<number>`SUM(${campaignMetrics.reach})`,
      avgCtr: sql<number>`CASE WHEN SUM(${campaignMetrics.impressions}) > 0 THEN (SUM(${campaignMetrics.clicks}) / SUM(${campaignMetrics.impressions})) * 100 ELSE 0 END`,
      avgCpa: sql<number>`CASE WHEN SUM(${campaignMetrics.conversions}) > 0 THEN SUM(${campaignMetrics.spend}) / SUM(${campaignMetrics.conversions}) ELSE NULL END`,
      avgRoas: sql<number>`CASE WHEN SUM(${campaignMetrics.spend}) > 0 THEN SUM(${campaignMetrics.conversionValue}) / SUM(${campaignMetrics.spend}) ELSE NULL END`,
    })
    .from(campaignMetrics)
    .where(
      and(
        campaignFilter!,
        gte(campaignMetrics.date, startDate),
        lte(campaignMetrics.date, endDate),
      )
    );
  return rows[0] ?? null;
}

export async function getPendingCheckpointsForDate(date: string) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: experimentCheckpoints.id,
      experimentId: experimentCheckpoints.experimentId,
      title: experimentCheckpoints.title,
      campaignIds: experiments.campaignIds,
      startDate: experiments.startDate,
    })
    .from(experimentCheckpoints)
    .innerJoin(experiments, eq(experimentCheckpoints.experimentId, experiments.id))
    .where(
      and(
        eq(experimentCheckpoints.date, date),
        eq(experimentCheckpoints.status, "pending"),
        eq(experiments.status, "active"),
      )
    );
}

export async function markCheckpointDone(
  checkpointId: number,
  snapshotData: Record<string, number>,
) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(experimentCheckpoints)
    .set({ status: "done", snapshotData })
    .where(eq(experimentCheckpoints.id, checkpointId));
}

export async function getDailyBriefing(userId: number, date: string): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(dailyBriefings)
    .where(and(eq(dailyBriefings.userId, userId), eq(dailyBriefings.date, date)))
    .limit(1);
  return rows[0]?.content ?? null;
}

export async function saveDailyBriefing(userId: number, date: string, content: string) {
  const db = await getDb();
  if (!db) return;
  await db
    .insert(dailyBriefings)
    .values({ userId, date, content })
    .onDuplicateKeyUpdate({ set: { content } });
}

// ─── Account Thresholds ───────────────────────────────────────────────────────
import { accountThresholds, notificationSettings, notificationPrefs } from "../drizzle/schema";
import { type NotifTipo, notifTipoDef, dominioDoAlerta } from "../shared/notifications";

export async function getAccountThresholds(accountId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(accountThresholds)
    .where(eq(accountThresholds.accountId, accountId))
    .limit(1);
  return rows[0] ?? null;
}

export async function upsertAccountThresholds(
  accountId: number,
  values: Partial<Omit<typeof accountThresholds.$inferInsert, "id" | "accountId" | "createdAt" | "updatedAt">>,
) {
  const db = await getDb();
  if (!db) return;
  await db
    .insert(accountThresholds)
    .values({ accountId, ...values })
    .onDuplicateKeyUpdate({ set: { ...values } });
}

// ─── Notification Settings ────────────────────────────────────────────────────
export async function getNotificationSettings(userId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(notificationSettings)
    .where(eq(notificationSettings.userId, userId))
    .limit(1);
  return rows[0] ?? null;
}

export async function upsertNotificationSettings(
  userId: number,
  values: Partial<Omit<typeof notificationSettings.$inferInsert, "id" | "userId" | "createdAt" | "updatedAt">>,
) {
  const db = await getDb();
  if (!db) return;
  await db
    .insert(notificationSettings)
    .values({ userId, ...values })
    .onDuplicateKeyUpdate({ set: { ...values } });
}

export async function markSyncErrorAlertsRead(userId: number, accountId: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(alerts)
    .set({ isRead: true })
    .where(
      and(
        eq(alerts.userId, userId),
        eq(alerts.accountId, accountId),
        eq(alerts.type, "SYNC_ERROR" as any),
        eq(alerts.isRead, false)
      )
    );
}

// ─── Account Context ──────────────────────────────────────────────────────────
export async function getAccountContext(accountId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(accountContext)
    .where(eq(accountContext.accountId, accountId))
    .limit(1);
  return rows[0] ?? null;
}

export async function upsertAccountContext(
  accountId: number,
  values: Partial<Omit<typeof accountContext.$inferInsert, "id" | "accountId" | "updatedAt">>,
) {
  const db = await getDb();
  if (!db) return;
  await db
    .insert(accountContext)
    .values({ accountId, ...values })
    .onDuplicateKeyUpdate({ set: { ...values } });
}

export async function appendAccountLearning(accountId: number, note: string, updatedBy: string) {
  const db = await getDb();
  if (!db) return;
  const existing = await getAccountContext(accountId);
  const current = existing?.learnings ?? "";
  const timestamp = new Date().toLocaleDateString("pt-BR");
  const updated = current
    ? `${current}

[${timestamp}] ${note}`
    : `[${timestamp}] ${note}`;
  await upsertAccountContext(accountId, { learnings: updated, updatedBy });
}

// ─── Agency Context ───────────────────────────────────────────────────────────
export async function getAgencyContext(userId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(agencyContext)
    .where(eq(agencyContext.userId, userId))
    .limit(1);
  return rows[0] ?? null;
}

export async function upsertAgencyContext(
  userId: number,
  values: Partial<Omit<typeof agencyContext.$inferInsert, "id" | "userId" | "updatedAt">>,
) {
  const db = await getDb();
  if (!db) return;
  await db
    .insert(agencyContext)
    .values({ userId, ...values })
    .onDuplicateKeyUpdate({ set: { ...values } });
}

// ─── Action Outcomes ──────────────────────────────────────────────────────────
export async function createActionOutcome(
  values: Omit<typeof actionOutcomes.$inferInsert, "id">,
) {
  const db = await getDb();
  if (!db) return;
  await db.insert(actionOutcomes).values(values);
}

export async function getActionOutcome(suggestionId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(actionOutcomes)
    .where(eq(actionOutcomes.suggestionId, suggestionId))
    .limit(1);
  return rows[0] ?? null;
}

export async function updateActionOutcome(
  suggestionId: number,
  values: Partial<Omit<typeof actionOutcomes.$inferInsert, "id" | "suggestionId">>,
) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(actionOutcomes)
    .set(values)
    .where(eq(actionOutcomes.suggestionId, suggestionId));
}

export async function getPendingOutcomeClosures() {
  const db = await getDb();
  if (!db) return [];
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  return await db
    .select()
    .from(actionOutcomes)
    .where(
      and(
        lte(actionOutcomes.appliedAt, sevenDaysAgo),
        sql`${actionOutcomes.observedAt} IS NULL`
      )
    );
}

// ─── Controle Financeiro (área admin) ─────────────────────────────────────────
// Valores sempre em centavos (int). `mes` = 'YYYY-MM'. Diferença/resultado são
// SEMPRE calculados, nunca armazenados.
type PnlTipo = InsertFinancePnlEntry["tipo"];
type PnlStatus = NonNullable<InsertFinancePnlEntry["status"]>;
type ReembCategoria = InsertFinanceReembolso["categoria"];

// P&L
export async function listFinancePnl(f: { mesFrom?: string; mesTo?: string; tipo?: PnlTipo; status?: PnlStatus; clienteId?: number } = {}) {
  const db = await getDb();
  if (!db) return [];
  const conds = [];
  if (f.mesFrom) conds.push(gte(financePnlEntries.mes, f.mesFrom));
  if (f.mesTo) conds.push(lte(financePnlEntries.mes, f.mesTo));
  if (f.tipo) conds.push(eq(financePnlEntries.tipo, f.tipo));
  if (f.status) conds.push(eq(financePnlEntries.status, f.status));
  if (f.clienteId != null) conds.push(eq(financePnlEntries.clienteId, f.clienteId));
  return db.select().from(financePnlEntries)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(financePnlEntries.mes), desc(financePnlEntries.id));
}
export async function createFinancePnl(data: InsertFinancePnlEntry): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  await assertMesAberto(data.mes);
  // Ao criar com vencimento, vencimentoOriginal = vencimento (base do "Remarcado").
  const values = data.vencimento && data.vencimentoOriginal == null ? { ...data, vencimentoOriginal: data.vencimento } : data;
  const [row] = await db.insert(financePnlEntries).values(values).$returningId();
  return row.id;
}
export async function getFinancePnlById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const r = await db.select().from(financePnlEntries).where(eq(financePnlEntries.id, id)).limit(1);
  return r[0];
}
export async function updateFinancePnl(id: number, patch: Partial<InsertFinancePnlEntry>) {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  await assertMesAberto((await getFinancePnlById(id))?.mes); // mês atual da linha
  if (patch.mes) await assertMesAberto(patch.mes);           // e o mês de destino
  await db.update(financePnlEntries).set(patch).where(eq(financePnlEntries.id, id));
}
export async function deleteFinancePnl(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  await assertMesAberto((await getFinancePnlById(id))?.mes);
  await db.delete(financePnlEntries).where(eq(financePnlEntries.id, id));
}
/** Resumo do P&L por mês (tudo calculado). */
export async function financePnlResumo(mes: string) {
  const db = await getDb();
  const empty = { mes, receitaTotalCents: 0, despesaTotalCents: 0, aporteCents: 0, resultadoFinalCents: 0, totalPendenteCents: 0 };
  if (!db) return empty;
  const rows = await db.select().from(financePnlEntries).where(eq(financePnlEntries.mes, mes));
  let receita = 0, despesa = 0, aporte = 0, pendente = 0;
  for (const r of rows) {
    if (r.tipo === "RECEITA_RECORRENTE" || r.tipo === "RECEITA_PONTUAL") receita += r.valorCents;
    else if (r.tipo === "DESPESA_RECORRENTE" || r.tipo === "DESPESA_IMPOSTO" || r.tipo === "DESPESA_PONTUAL") despesa += r.valorCents;
    else if (r.tipo === "APORTE") aporte += r.valorCents;
    if (r.status === "pendente") pendente += r.valorCents;
  }
  return { mes, receitaTotalCents: receita, despesaTotalCents: despesa, aporteCents: aporte, resultadoFinalCents: receita - despesa, totalPendenteCents: pendente };
}

// Reembolsos
export async function listFinanceReembolsos(f: { mes?: string; categoria?: ReembCategoria } = {}) {
  const db = await getDb();
  if (!db) return [];
  const conds = [];
  if (f.mes) conds.push(eq(financeReembolsos.mes, f.mes));
  if (f.categoria) conds.push(eq(financeReembolsos.categoria, f.categoria));
  return db.select().from(financeReembolsos)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(financeReembolsos.mes), desc(financeReembolsos.id));
}
export async function createFinanceReembolso(data: InsertFinanceReembolso): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  await assertMesAberto(data.mes);
  const [row] = await db.insert(financeReembolsos).values(data).$returningId();
  return row.id;
}
export async function updateFinanceReembolso(id: number, patch: Partial<InsertFinanceReembolso>) {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  await assertMesAberto((await getFinanceReembolsoById(id))?.mes);
  if (patch.mes) await assertMesAberto(patch.mes);
  await db.update(financeReembolsos).set(patch).where(eq(financeReembolsos.id, id));
}
export async function deleteFinanceReembolso(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  await assertMesAberto((await getFinanceReembolsoById(id))?.mes);
  await db.delete(financeReembolsos).where(eq(financeReembolsos.id, id));
}

// Retiradas (Gui & SELVA)
export async function listFinanceRetiradas(f: { mes?: string } = {}) {
  const db = await getDb();
  if (!db) return [];
  const conds = [];
  if (f.mes) conds.push(eq(financeRetiradas.mes, f.mes));
  return db.select().from(financeRetiradas)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(financeRetiradas.mes), desc(financeRetiradas.id));
}
export async function createFinanceRetirada(data: InsertFinanceRetirada): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  await assertMesAberto(data.mes);
  const [row] = await db.insert(financeRetiradas).values(data).$returningId();
  return row.id;
}
export async function updateFinanceRetirada(id: number, patch: Partial<InsertFinanceRetirada>) {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  await assertMesAberto((await getFinanceRetiradaById(id))?.mes);
  if (patch.mes) await assertMesAberto(patch.mes);
  await db.update(financeRetiradas).set(patch).where(eq(financeRetiradas.id, id));
}
export async function deleteFinanceRetirada(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  await assertMesAberto((await getFinanceRetiradaById(id))?.mes);
  await db.delete(financeRetiradas).where(eq(financeRetiradas.id, id));
}
export async function getFinanceRetiradaById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const r = await db.select().from(financeRetiradas).where(eq(financeRetiradas.id, id)).limit(1);
  return r[0];
}
export async function getFinanceReembolsoById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const r = await db.select().from(financeReembolsos).where(eq(financeReembolsos.id, id)).limit(1);
  return r[0];
}

// ─── Financeiro v6: meses fechados (trava de edição) ──────────────────────────
/** Conjunto de meses fechados. */
export async function isMesFechado(mes: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const r = await db.select({ mes: financeMesesFechados.mes }).from(financeMesesFechados).where(eq(financeMesesFechados.mes, mes)).limit(1);
  return r.length > 0;
}
/** Barreira usada em TODAS as mutations com `mes`. Mês fechado → rejeita. */
export async function assertMesAberto(mes: string | null | undefined): Promise<void> {
  if (!mes) return;
  if (await isMesFechado(mes)) throw new Error(`Mês ${mes} está fechado — reabra para editar.`);
}
/** Nº de linhas PENDENTES (a receber/a pagar) no P&L do mês — para o aviso ao fechar. */
export async function contarPendenciasMes(mes: string): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const r = await db.select({ id: financePnlEntries.id }).from(financePnlEntries).where(and(eq(financePnlEntries.mes, mes), eq(financePnlEntries.status, "pendente")));
  return r.length;
}
export async function listMesesFechados(): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select({ mes: financeMesesFechados.mes }).from(financeMesesFechados);
  return rows.map((r) => r.mes).sort().reverse();
}
/** Fecha o mês (idempotente). Retorna a contagem de pendências (aviso, não bloqueia). */
export async function fecharMes(mes: string, userId: number | null): Promise<{ mes: string; pendencias: number; jaFechado: boolean }> {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  const pendencias = await contarPendenciasMes(mes);
  if (await isMesFechado(mes)) return { mes, pendencias, jaFechado: true };
  await db.insert(financeMesesFechados).values({ mes, fechadoPor: userId });
  return { mes, pendencias, jaFechado: false };
}
export async function reabrirMes(mes: string): Promise<{ mes: string }> {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  await db.delete(financeMesesFechados).where(eq(financeMesesFechados.mes, mes));
  return { mes };
}
/** Reconciliação Gui & SELVA por mês: despesas (reembolsos) vs. retiradas.
 *  Convenção (igual à planilha): diferenca = despesas − retiradas.
 *  → POSITIVO = falta receber (gastou mais do que retirou). Sempre calculado. */
/**
 * Reconciliação Gui & SELVA (Ajustes 3): falta receber = despesas pagas por você
 * (reembolso pendente) − retiradas. Fontes das "reembolsáveis": reembolsos legados
 * (histórico) + despesas do P&L com reembolsoPendente=true. Salário/imposto ficam
 * fora (nunca são marcados reembolsoPendente). diferenca = despesas − retiradas.
 */
export async function financeReconciliacao(mes: string) {
  const db = await getDb();
  const empty = { mes, totalDespesasCents: 0, totalRetiradasCents: 0, diferencaCents: 0, reembolsaveis: [] as { descricao: string; valorCents: number; quitado: boolean }[], retiradasItens: [] as { descricao: string; valorCents: number; quitado: boolean }[] };
  if (!db) return empty;
  const [reembs, flagged, retirs] = await Promise.all([
    db.select().from(financeReembolsos).where(eq(financeReembolsos.mes, mes)),
    db.select().from(financePnlEntries).where(and(eq(financePnlEntries.mes, mes), eq(financePnlEntries.reembolsoPendente, true))),
    db.select().from(financeRetiradas).where(eq(financeRetiradas.mes, mes)),
  ]);
  // Itens quitados (Ajustes 4) seguem listados como histórico, mas não entram nos totais.
  const reembolsaveis = [
    ...reembs.map((r) => ({ descricao: r.descricao, valorCents: r.valorCents, quitado: !!r.reembolsado })),
    ...flagged.map((r) => ({ descricao: r.descricao, valorCents: r.valorCents, quitado: false })),
  ];
  const retiradasItens = retirs.map((r) => ({ descricao: r.descricao, valorCents: r.valorCents, quitado: !!r.realizado }));
  const totalDespesas = reembolsaveis.reduce((s, r) => s + (r.quitado ? 0 : r.valorCents), 0);
  const totalRetiradas = retiradasItens.reduce((s, r) => s + (r.quitado ? 0 : r.valorCents), 0);
  return { mes, totalDespesasCents: totalDespesas, totalRetiradasCents: totalRetiradas, diferencaCents: totalDespesas - totalRetiradas, reembolsaveis, retiradasItens };
}
/** Meses distintos (union das 3 tabelas) — popula seletores de mês no front. */
export async function financeMonths(): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];
  const [a, b, c] = await Promise.all([
    db.selectDistinct({ mes: financePnlEntries.mes }).from(financePnlEntries),
    db.selectDistinct({ mes: financeReembolsos.mes }).from(financeReembolsos),
    db.selectDistinct({ mes: financeRetiradas.mes }).from(financeRetiradas),
  ]);
  const set = new Set<string>([...a, ...b, ...c].map((r) => r.mes));
  return Array.from(set).sort().reverse();
}

// ─── Financeiro v2: clientes / tendência / receita por cliente / acumulado ────
export async function listFinanceClientes() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(financeClientes).orderBy(financeClientes.nome);
}
export async function createFinanceCliente(data: { nome: string; cor?: string | null }): Promise<{ id: number; nome: string; cor: string | null }> {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  const nome = data.nome.trim();
  const existing = await db.select().from(financeClientes).where(eq(financeClientes.nome, nome)).limit(1);
  if (existing[0]) return { id: existing[0].id, nome: existing[0].nome, cor: existing[0].cor };
  const [row] = await db.insert(financeClientes).values({ nome, cor: data.cor ?? null }).$returningId();
  return { id: row.id, nome, cor: data.cor ?? null };
}

/** Tendência dos últimos N meses: receita/despesa/resultado + recorrente/pontual. */
export async function financePnlTrend(limitMonths = 12) {
  const db = await getDb();
  if (!db) return [];
  const monthsRows = await db.selectDistinct({ mes: financePnlEntries.mes }).from(financePnlEntries);
  const months = monthsRows.map((r) => r.mes).sort().slice(-limitMonths);
  if (!months.length) return [];
  const rows = await db.select().from(financePnlEntries).where(inArray(financePnlEntries.mes, months));
  const byMes = new Map<string, { mes: string; receitaCents: number; despesaCents: number; receitaRecorrenteCents: number; receitaPontualCents: number }>();
  for (const m of months) byMes.set(m, { mes: m, receitaCents: 0, despesaCents: 0, receitaRecorrenteCents: 0, receitaPontualCents: 0 });
  for (const r of rows) {
    const b = byMes.get(r.mes);
    if (!b) continue;
    if (r.tipo === "RECEITA_RECORRENTE") { b.receitaCents += r.valorCents; b.receitaRecorrenteCents += r.valorCents; }
    else if (r.tipo === "RECEITA_PONTUAL") { b.receitaCents += r.valorCents; b.receitaPontualCents += r.valorCents; }
    else if (r.tipo === "DESPESA_RECORRENTE" || r.tipo === "DESPESA_IMPOSTO" || r.tipo === "DESPESA_PONTUAL") b.despesaCents += r.valorCents;
  }
  return months.map((m) => { const b = byMes.get(m)!; return { ...b, resultadoCents: b.receitaCents - b.despesaCents }; });
}

/** Ranking de receita por cliente (filtro de período opcional). */
export async function financeReceitaPorCliente(f: { mesFrom?: string; mesTo?: string } = {}) {
  const db = await getDb();
  if (!db) return [];
  const conds = [or(eq(financePnlEntries.tipo, "RECEITA_RECORRENTE"), eq(financePnlEntries.tipo, "RECEITA_PONTUAL"))];
  if (f.mesFrom) conds.push(gte(financePnlEntries.mes, f.mesFrom));
  if (f.mesTo) conds.push(lte(financePnlEntries.mes, f.mesTo));
  const [rows, clientes] = await Promise.all([
    db.select().from(financePnlEntries).where(and(...conds)),
    db.select().from(financeClientes),
  ]);
  const cmap = new Map(clientes.map((c) => [c.id, c]));
  const agg = new Map<number | string, { clienteId: number | null; nome: string; cor: string | null; totalCents: number; count: number }>();
  for (const r of rows) {
    const key: number | string = r.clienteId ?? "sem";
    if (!agg.has(key)) {
      const c = r.clienteId ? cmap.get(r.clienteId) : null;
      agg.set(key, { clienteId: r.clienteId ?? null, nome: c?.nome ?? "Sem cliente", cor: c?.cor ?? null, totalCents: 0, count: 0 });
    }
    const a = agg.get(key)!;
    a.totalCents += r.valorCents;
    a.count += 1;
  }
  return Array.from(agg.values()).sort((a, b) => b.totalCents - a.totalCents);
}

/** Falta receber ACUMULADO = Σ(despesas reembolsáveis − retiradas) + breakdown por mês. */
export async function financeReconciliacaoAcumulado() {
  const db = await getDb();
  const empty = { totalDespesasCents: 0, totalRetiradasCents: 0, diferencaCents: 0, porMes: [] as { mes: string; despesasCents: number; retiradasCents: number; diferencaCents: number }[] };
  if (!db) return empty;
  // Só o que ainda está em aberto: quitados (Ajustes 4) saem da falta-receber.
  const [reembs, flagged, retirs] = await Promise.all([
    db.select({ mes: financeReembolsos.mes, v: financeReembolsos.valorCents }).from(financeReembolsos).where(eq(financeReembolsos.reembolsado, false)),
    db.select({ mes: financePnlEntries.mes, v: financePnlEntries.valorCents }).from(financePnlEntries).where(eq(financePnlEntries.reembolsoPendente, true)),
    db.select({ mes: financeRetiradas.mes, v: financeRetiradas.valorCents }).from(financeRetiradas).where(eq(financeRetiradas.realizado, false)),
  ]);
  const byMes = new Map<string, { despesas: number; retiradas: number }>();
  const bump = (mes: string, campo: "despesas" | "retiradas", v: number) => { if (!byMes.has(mes)) byMes.set(mes, { despesas: 0, retiradas: 0 }); byMes.get(mes)![campo] += v; };
  reembs.forEach((r) => bump(r.mes, "despesas", r.v));
  flagged.forEach((r) => bump(r.mes, "despesas", r.v));
  retirs.forEach((r) => bump(r.mes, "retiradas", r.v));
  const porMes = Array.from(byMes.entries()).map(([mes, x]) => ({ mes, despesasCents: x.despesas, retiradasCents: x.retiradas, diferencaCents: x.despesas - x.retiradas })).sort((a, b) => b.mes.localeCompare(a.mes));
  const totalDespesas = porMes.reduce((s, r) => s + r.despesasCents, 0);
  const totalRetiradas = porMes.reduce((s, r) => s + r.retiradasCents, 0);
  return { totalDespesasCents: totalDespesas, totalRetiradasCents: totalRetiradas, diferencaCents: totalDespesas - totalRetiradas, porMes };
}

// ─── Financeiro v3: analytics (cálculo/leitura; sem schema novo) ──────────────
function addMonthsSrv(ymd: string, delta: number): string {
  const [y, m] = ymd.split("-").map(Number);
  const idx = y * 12 + (m - 1) + delta;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
}
function monthsBetween(a: string, b: string): number {
  const [ay, am] = a.split("-").map(Number);
  const [by, bm] = b.split("-").map(Number);
  return (by * 12 + bm) - (ay * 12 + am);
}
// Mês corrente no fuso da agência (Brasil) — sem toISOString.
function agencyCurrentMonth(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).format(new Date());
}
const RECEITA_TIPOS = or(eq(financePnlEntries.tipo, "RECEITA_RECORRENTE"), eq(financePnlEntries.tipo, "RECEITA_PONTUAL"));
const DESPESA_TIPOS = or(eq(financePnlEntries.tipo, "DESPESA_RECORRENTE"), eq(financePnlEntries.tipo, "DESPESA_IMPOSTO"), eq(financePnlEntries.tipo, "DESPESA_PONTUAL"));

/** Resumo agregado de um PERÍODO (soma dos meses [from,to]). */
export async function financePeriodoResumo(mesFrom: string, mesTo: string) {
  const db = await getDb();
  const empty = { receitaTotalCents: 0, despesaTotalCents: 0, resultadoFinalCents: 0, aporteCents: 0, totalPendenteCents: 0, receitaRecorrenteCents: 0, receitaPontualCents: 0 };
  if (!db) return empty;
  const rows = await db.select().from(financePnlEntries).where(and(gte(financePnlEntries.mes, mesFrom), lte(financePnlEntries.mes, mesTo)));
  let receita = 0, despesa = 0, aporte = 0, pendente = 0, rec = 0, pon = 0;
  for (const r of rows) {
    if (r.tipo === "RECEITA_RECORRENTE") { receita += r.valorCents; rec += r.valorCents; }
    else if (r.tipo === "RECEITA_PONTUAL") { receita += r.valorCents; pon += r.valorCents; }
    else if (r.tipo === "DESPESA_RECORRENTE" || r.tipo === "DESPESA_IMPOSTO" || r.tipo === "DESPESA_PONTUAL") despesa += r.valorCents;
    else if (r.tipo === "APORTE") aporte += r.valorCents;
    if (r.status === "pendente") pendente += r.valorCents;
  }
  return { receitaTotalCents: receita, despesaTotalCents: despesa, resultadoFinalCents: receita - despesa, aporteCents: aporte, totalPendenteCents: pendente, receitaRecorrenteCents: rec, receitaPontualCents: pon };
}

/** MRR do mês de referência + movimento (novos/expansão/contração/churn) + série 12m. */
export async function financeMrr(mesRef: string) {
  const db = await getDb();
  if (!db) return { mesRef, mrrCents: 0, mrrPrevCents: 0, deltaCents: 0, novosCents: 0, expansaoCents: 0, contracaoCents: 0, churnCents: 0, serie: [] as { mes: string; mrrCents: number }[] };
  const rows = await db.select().from(financePnlEntries).where(eq(financePnlEntries.tipo, "RECEITA_RECORRENTE"));
  const monthTotal = new Map<string, number>();
  const monthCliente = new Map<string, Map<string | number, number>>();
  for (const r of rows) {
    monthTotal.set(r.mes, (monthTotal.get(r.mes) ?? 0) + r.valorCents);
    if (!monthCliente.has(r.mes)) monthCliente.set(r.mes, new Map());
    const key: string | number = r.clienteId ?? "sem";
    const m = monthCliente.get(r.mes)!;
    m.set(key, (m.get(key) ?? 0) + r.valorCents);
  }
  const prev = addMonthsSrv(mesRef, -1);
  const cur = monthCliente.get(mesRef) ?? new Map<string | number, number>();
  const pre = monthCliente.get(prev) ?? new Map<string | number, number>();
  let novos = 0, churn = 0, expansao = 0, contracao = 0;
  const keys = new Set<string | number>();
  cur.forEach((_v, k) => keys.add(k));
  pre.forEach((_v, k) => keys.add(k));
  keys.forEach((k) => {
    const a = pre.get(k) ?? 0, b = cur.get(k) ?? 0;
    if (a === 0 && b > 0) novos += b;
    else if (a > 0 && b === 0) churn += a;
    else if (b > a) expansao += b - a;
    else if (b < a) contracao += a - b;
  });
  const serie: { mes: string; mrrCents: number }[] = [];
  for (let i = 11; i >= 0; i--) { const mm = addMonthsSrv(mesRef, -i); serie.push({ mes: mm, mrrCents: monthTotal.get(mm) ?? 0 }); }
  const mrr = monthTotal.get(mesRef) ?? 0, mrrPrev = monthTotal.get(prev) ?? 0;
  return { mesRef, mrrCents: mrr, mrrPrevCents: mrrPrev, deltaCents: mrr - mrrPrev, novosCents: novos, expansaoCents: expansao, contracaoCents: contracao, churnCents: churn, serie };
}

/** Churn / retenção de clientes (recorrente). Ref = último mês com receita. */
export async function financeChurn(f: { mesFrom?: string; mesTo?: string; limitMonths?: number } = {}) {
  const db = await getDb();
  const empty = { mesReferencia: "", ativos: 0, churnedCount: 0, mrrPerdidoLifetimeCents: 0, periodoPerdidoCents: 0, taxa: 0, mesIncompleto: false, serie: [] as { mes: string; mrrPerdidoCents: number }[], churned: [] as { clienteId: number | null; nome: string; cor: string | null; ultimoMes: string; valorMensalCents: number; mesesDesde: number }[], mrrPerdidoMesCents: 0, mrrPerdidoMedia12mCents: 0, churnRateMesPct: 0, churnRateMedia12mPct: 0 };
  if (!db) return empty;
  const [recRows, clientes, recDefs] = await Promise.all([
    db.select().from(financePnlEntries).where(RECEITA_TIPOS),
    db.select().from(financeClientes),
    db.select().from(financeRecorrencia).where(eq(financeRecorrencia.natureza, "RECEITA")),
  ]);
  if (recRows.length === 0) return empty;
  const cmap = new Map(clientes.map((c) => [c.id, c]));
  // Referência = mês ATUAL (não MAX(mes), que pode estar no futuro por geração/projetos).
  const refMonth = agencyCurrentMonth();
  const activeSet = new Set<number>();
  recDefs.forEach((r) => { if (r.ativo && r.clienteId) activeSet.add(r.clienteId); });
  const recorrente = recRows.filter((r) => r.tipo === "RECEITA_RECORRENTE");
  const recorrentePast = recorrente.filter((r) => r.mes <= refMonth); // só histórico realizado
  const everRec = new Set<string | number>();
  recDefs.forEach((r) => { if (r.clienteId) everRec.add(r.clienteId); });
  recorrente.forEach((r) => everRec.add(r.clienteId ?? "sem"));
  const byCliente = new Map<string | number, { months: Set<string>; valorByMonth: Map<string, number> }>();
  const recCountByMonth = new Map<string, number>();
  const monthClienteValue = new Map<string, Map<string | number, number>>(); // mes -> (cliente -> valor recorrente)
  for (const r of recorrentePast) {
    recCountByMonth.set(r.mes, (recCountByMonth.get(r.mes) ?? 0) + 1);
    const key: string | number = r.clienteId ?? "sem";
    if (!byCliente.has(key)) byCliente.set(key, { months: new Set(), valorByMonth: new Map() });
    const e = byCliente.get(key)!;
    e.months.add(r.mes);
    e.valorByMonth.set(r.mes, (e.valorByMonth.get(r.mes) ?? 0) + r.valorCents);
    if (!monthClienteValue.has(r.mes)) monthClienteValue.set(r.mes, new Map());
    const mv = monthClienteValue.get(r.mes)!;
    mv.set(key, (mv.get(key) ?? 0) + r.valorCents);
  }
  // Ativo = tem recorrência de receita ATIVA. Churned = já foi recorrente e não é ativo.
  const ativos = activeSet.size;
  const churned: typeof empty.churned = [];
  everRec.forEach((key) => {
    if (typeof key === "number" && activeSet.has(key)) return; // ativo, não é churn
    const e = byCliente.get(key);
    const last = e && e.months.size ? Array.from(e.months).sort().pop()! : "";
    const nome = typeof key === "number" ? (cmap.get(key)?.nome ?? `Cliente #${key}`) : "Sem cliente";
    const cor = typeof key === "number" ? (cmap.get(key)?.cor ?? null) : null;
    churned.push({ clienteId: typeof key === "number" ? key : null, nome, cor, ultimoMes: last || refMonth, valorMensalCents: e && last ? (e.valorByMonth.get(last) ?? 0) : 0, mesesDesde: last ? monthsBetween(last, refMonth) : 0 });
  });
  churned.sort((a, b) => b.valorMensalCents - a.valorMensalCents);
  const mrrPerdidoLifetime = churned.reduce((s, c) => s + c.valorMensalCents, 0);
  const total = ativos + churned.length;
  // Churn POR MÊS: cliente presente em (m-1) e ausente em m → perdeu o valor de (m-1) no mês m.
  const churnByMonth = new Map<string, number>();
  monthClienteValue.forEach((baseP, prev) => {
    const m = addMonthsSrv(prev, 1);
    if (m > refMonth) return; // não computa churn em meses ainda não realizados
    const baseM = monthClienteValue.get(m) ?? new Map<string | number, number>();
    let lost = 0;
    baseP.forEach((v, k) => { if (!((baseM.get(k) ?? 0) > 0)) lost += v; });
    if (lost > 0) churnByMonth.set(m, (churnByMonth.get(m) ?? 0) + lost);
  });
  const N = f.limitMonths ?? 12;
  const serie: { mes: string; mrrPerdidoCents: number }[] = [];
  for (let i = N - 1; i >= 0; i--) { const mm = addMonthsSrv(refMonth, -i); serie.push({ mes: mm, mrrPerdidoCents: churnByMonth.get(mm) ?? 0 }); }
  let periodoPerdido = 0;
  if (f.mesFrom && f.mesTo) churnByMonth.forEach((v, m) => { if (m >= f.mesFrom! && m <= f.mesTo!) periodoPerdido += v; });
  else periodoPerdido = serie.reduce((s, x) => s + x.mrrPerdidoCents, 0);
  // Mês possivelmente incompleto: nº de recorrentes no ref < 60% da média dos anteriores.
  const counts = Array.from(recCountByMonth.entries()).filter(([m]) => m < refMonth).map(([, n]) => n);
  const avg = counts.length ? counts.reduce((s, n) => s + n, 0) / counts.length : 0;
  const mesIncompleto = avg > 0 && (recCountByMonth.get(refMonth) ?? 0) < avg * 0.6;
  // KPIs de churn: mês selecionado × média/taxa dos últimos 12 meses.
  const mrrByMonth = new Map<string, number>();
  monthClienteValue.forEach((mv, m) => { let s = 0; mv.forEach((v) => (s += v)); mrrByMonth.set(m, s); });
  const rateAt = (m: string) => { const base = mrrByMonth.get(addMonthsSrv(m, -1)) ?? 0; return base > 0 ? (churnByMonth.get(m) ?? 0) / base : 0; };
  const mesRef = f.mesTo && f.mesTo <= refMonth ? f.mesTo : refMonth;
  const mrrPerdidoMes = churnByMonth.get(mesRef) ?? 0;
  const churnRateMes = rateAt(mesRef);
  const win = serie.map((s) => s.mes);
  const mrrPerdidoMedia12m = win.length ? Math.round(win.reduce((s, m) => s + (churnByMonth.get(m) ?? 0), 0) / win.length) : 0;
  const ratesWin = win.map((m) => rateAt(m)).filter((_, i) => (mrrByMonth.get(addMonthsSrv(win[i], -1)) ?? 0) > 0);
  const churnRateMedia12m = ratesWin.length ? ratesWin.reduce((s, x) => s + x, 0) / ratesWin.length : 0;
  return {
    mesReferencia: refMonth, ativos, churnedCount: churned.length, mrrPerdidoLifetimeCents: mrrPerdidoLifetime,
    periodoPerdidoCents: periodoPerdido, taxa: total > 0 ? churned.length / total : 0, mesIncompleto, serie, churned,
    mrrPerdidoMesCents: mrrPerdidoMes, mrrPerdidoMedia12mCents: mrrPerdidoMedia12m, churnRateMesPct: Math.round(churnRateMes * 100), churnRateMedia12mPct: Math.round(churnRateMedia12m * 100),
  };
}

/** Qualidade por cliente: tempo de casa + rendimento + status (ativo/churned/pontual). */
export async function financeQualidadeClientes(f: { mesFrom?: string; mesTo?: string } = {}) {
  const db = await getDb();
  const empty = { refMonth: "", summary: { ativos: 0, churned: 0, pontual: 0 }, rows: [] as { clienteId: number | null; nome: string; cor: string | null; mesesAtivos: number; totalCents: number; mediaCents: number; primeiroMes: string; ultimoMes: string; status: "ativo" | "churned" | "pontual" }[] };
  if (!db) return empty;
  const [receita, clientes, recDefs] = await Promise.all([
    db.select().from(financePnlEntries).where(RECEITA_TIPOS),
    db.select().from(financeClientes),
    db.select().from(financeRecorrencia).where(eq(financeRecorrencia.natureza, "RECEITA")),
  ]);
  if (receita.length === 0) return empty;
  const cmap = new Map(clientes.map((c) => [c.id, c]));
  const cur = agencyCurrentMonth();
  const refMonth = receita.reduce((mx, r) => (r.mes > mx ? r.mes : mx), "0000-00");
  // Status pela FONTE DA VERDADE (finance_recorrencia), não por MAX(mes) das entries.
  const activeSet = new Set<number>();
  recDefs.forEach((r) => { if (r.ativo && r.clienteId) activeSet.add(r.clienteId); });
  const everRec = new Set<string | number>();          // já foi recorrente algum dia
  recDefs.forEach((r) => { if (r.clienteId) everRec.add(r.clienteId); });
  for (const r of receita) if (r.tipo === "RECEITA_RECORRENTE") everRec.add(r.clienteId ?? "sem");
  const statusOf = (k: string | number): "ativo" | "churned" | "pontual" => {
    if (typeof k === "number" && activeSet.has(k)) return "ativo";
    if (everRec.has(k)) return "churned";
    return "pontual";
  };
  // Métricas (respeitam o filtro de período, se houver).
  const inRange = (m: string) => (!f.mesFrom || m >= f.mesFrom) && (!f.mesTo || m <= f.mesTo);
  const metrics = new Map<string | number, { months: Set<string>; total: number; primeiro: string; ultimo: string }>();
  for (const r of receita) {
    if (!inRange(r.mes)) continue;
    const k: string | number = r.clienteId ?? "sem";
    if (!metrics.has(k)) metrics.set(k, { months: new Set(), total: 0, primeiro: r.mes, ultimo: r.mes });
    const e = metrics.get(k)!;
    e.months.add(r.mes); e.total += r.valorCents;
    if (r.mes < e.primeiro) e.primeiro = r.mes;
    if (r.mes > e.ultimo) e.ultimo = r.mes;
  }
  const rows = Array.from(metrics.entries()).map(([k, e]) => {
    const c = typeof k === "number" ? cmap.get(k) : undefined;
    const meses = e.months.size;
    const status = statusOf(k);
    // "Último" capado no mês atual p/ ativos (meses futuros são geração, não histórico).
    const ultimo = status === "ativo" && e.ultimo > cur ? cur : e.ultimo;
    return { clienteId: typeof k === "number" ? k : null, nome: c?.nome ?? "Sem cliente", cor: c?.cor ?? null, mesesAtivos: meses, totalCents: e.total, mediaCents: Math.round(e.total / Math.max(1, meses)), primeiroMes: e.primeiro, ultimoMes: ultimo, status };
  }).sort((a, b) => b.mediaCents - a.mediaCents);
  return { refMonth, summary: { ativos: rows.filter((r) => r.status === "ativo").length, churned: rows.filter((r) => r.status === "churned").length, pontual: rows.filter((r) => r.status === "pontual").length }, rows };
}

/** Contas a receber / aging: RECEITA pendente por idade (vs mês corrente real). */
export async function financeAReceber() {
  const db = await getDb();
  const mesCorrente = agencyCurrentMonth();
  const empty = { mesCorrente, totalPendenteCents: 0, totalVencidoCents: 0, buckets: { corrente: 0, m1: 0, m2: 0, m3plus: 0 }, itens: [] as { clienteNome: string; cor: string | null; descricao: string; mes: string; valorCents: number; idade: number }[] };
  if (!db) return empty;
  const [rows, clientes] = await Promise.all([
    db.select().from(financePnlEntries).where(and(RECEITA_TIPOS, eq(financePnlEntries.status, "pendente"))),
    db.select().from(financeClientes),
  ]);
  const cmap = new Map(clientes.map((c) => [c.id, c]));
  const buckets = { corrente: 0, m1: 0, m2: 0, m3plus: 0 };
  const itens = rows.map((r) => {
    const idade = monthsBetween(r.mes, mesCorrente);
    if (idade <= 0) buckets.corrente += r.valorCents;
    else if (idade === 1) buckets.m1 += r.valorCents;
    else if (idade === 2) buckets.m2 += r.valorCents;
    else buckets.m3plus += r.valorCents;
    const c = r.clienteId ? cmap.get(r.clienteId) : undefined;
    return { clienteNome: c?.nome ?? "—", cor: c?.cor ?? null, descricao: r.descricao, mes: r.mes, valorCents: r.valorCents, idade };
  }).sort((a, b) => b.idade - a.idade || b.valorCents - a.valorCents);
  const totalPendente = rows.reduce((s, r) => s + r.valorCents, 0);
  return { mesCorrente, totalPendenteCents: totalPendente, totalVencidoCents: buckets.m1 + buckets.m2 + buckets.m3plus, buckets, itens };
}

/** Despesa por categoria: série (últimos N meses) + totais do período. */
export async function financeDespesaCategoria(f: { mesFrom?: string; mesTo?: string; limitMonths?: number } = {}) {
  const db = await getDb();
  if (!db) return { serie: [] as { mes: string; recorrenteCents: number; impostoCents: number; pontualCents: number }[], periodo: null as null | { recorrenteCents: number; impostoCents: number; pontualCents: number; totalCents: number } };
  const rows = await db.select().from(financePnlEntries).where(DESPESA_TIPOS);
  const months = Array.from(new Set(rows.map((r) => r.mes))).sort().slice(-(f.limitMonths ?? 12));
  const byMes = new Map<string, { mes: string; recorrenteCents: number; impostoCents: number; pontualCents: number }>();
  for (const m of months) byMes.set(m, { mes: m, recorrenteCents: 0, impostoCents: 0, pontualCents: 0 });
  for (const r of rows) {
    const b = byMes.get(r.mes);
    if (!b) continue;
    if (r.tipo === "DESPESA_RECORRENTE") b.recorrenteCents += r.valorCents;
    else if (r.tipo === "DESPESA_IMPOSTO") b.impostoCents += r.valorCents;
    else b.pontualCents += r.valorCents;
  }
  let periodo = null as null | { recorrenteCents: number; impostoCents: number; pontualCents: number; totalCents: number };
  if (f.mesFrom && f.mesTo) {
    let rec = 0, imp = 0, pon = 0;
    for (const r of rows) {
      if (r.mes < f.mesFrom || r.mes > f.mesTo) continue;
      if (r.tipo === "DESPESA_RECORRENTE") rec += r.valorCents;
      else if (r.tipo === "DESPESA_IMPOSTO") imp += r.valorCents;
      else pon += r.valorCents;
    }
    periodo = { recorrenteCents: rec, impostoCents: imp, pontualCents: pon, totalCents: rec + imp + pon };
  }
  return { serie: months.map((m) => byMes.get(m)!), periodo };
}

// ─── Financeiro v4: ledger ativo (recorrência, geração, projetos, vencimento) ─
function agencyTodayStr(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
function clampDay(mesAlvo: string, dia: number): number {
  const [y, m] = mesAlvo.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate(); // último dia do mês m (1-based)
  return Math.max(1, Math.min(dia, lastDay));
}
function monthsLate(venc: string, hoje: string): number {
  const [vy, vm, vd] = venc.split("-").map(Number);
  const [hy, hm, hd] = hoje.split("-").map(Number);
  let mm = (hy - vy) * 12 + (hm - vm);
  if (hd < vd) mm -= 1;
  return mm;
}
const pad2s = (n: number) => String(n).padStart(2, "0");

/** Recorrências (assinaturas) + nome/cor do cliente. */
export async function listFinanceRecorrencia() {
  const db = await getDb();
  if (!db) return [];
  const [recs, clientes] = await Promise.all([
    db.select().from(financeRecorrencia).orderBy(desc(financeRecorrencia.ativo), financeRecorrencia.clienteId),
    db.select().from(financeClientes),
  ]);
  const cmap = new Map(clientes.map((c) => [c.id, c]));
  return recs.map((r) => {
    const c = r.clienteId ? cmap.get(r.clienteId) : undefined;
    const clienteNome = r.natureza === "DESPESA" ? (r.descricao ?? "Despesa") : (c?.nome ?? `Cliente #${r.clienteId}`);
    return { ...r, clienteNome, cor: c?.cor ?? null };
  });
}

/** Próximo mês a gerar = max(mês corrente, últimoMêsRecorrente + 1). */
export async function financeProximoMesRecorrente(): Promise<string> {
  const db = await getDb();
  const cur = agencyCurrentMonth();
  if (!db) return cur;
  const rows = await db.selectDistinct({ mes: financePnlEntries.mes }).from(financePnlEntries).where(eq(financePnlEntries.tipo, "RECEITA_RECORRENTE"));
  const maxRec = rows.map((r) => r.mes).sort().slice(-1)[0];
  const candidate = maxRec ? addMonthsSrv(maxRec, 1) : cur;
  return candidate < cur ? cur : candidate;
}

/** Motor: gera as linhas recorrentes PENDENTES do mês (idempotente; nunca passado). */
export async function gerarMesRecorrente(mesAlvo: string): Promise<{ criadas: number; mes: string; skipped: boolean }> {
  const db = await getDb();
  if (!db) return { criadas: 0, mes: mesAlvo, skipped: true };
  if (mesAlvo < agencyCurrentMonth()) return { criadas: 0, mes: mesAlvo, skipped: true };
  if (mesAlvo > addMonthsSrv(agencyCurrentMonth(), 1)) return { criadas: 0, mes: mesAlvo, skipped: true }; // no máx. próximo mês
  if (await isMesFechado(mesAlvo)) return { criadas: 0, mes: mesAlvo, skipped: true }; // mês travado
  const recs = await db.select().from(financeRecorrencia).where(eq(financeRecorrencia.ativo, true));
  if (!recs.length) return { criadas: 0, mes: mesAlvo, skipped: false };
  const existing = await db.select({ recorrenciaId: financePnlEntries.recorrenciaId }).from(financePnlEntries)
    .where(and(eq(financePnlEntries.mes, mesAlvo), eq(financePnlEntries.origem, "RECORRENCIA")));
  const has = new Set(existing.map((e) => e.recorrenciaId));
  const clientes = await db.select().from(financeClientes);
  const cmap = new Map(clientes.map((c) => [c.id, c]));
  let criadas = 0;
  for (const r of recs) {
    if (has.has(r.id)) continue;
    if (mesAlvo < r.mesInicio) continue;
    // Vencimento: dia diaVencimento do mês da competência (ou do mês seguinte se pós-pago).
    const vencMes = r.vencimentoMesSeguinte ? addMonthsSrv(mesAlvo, 1) : mesAlvo;
    const venc = r.diaVencimento ? `${vencMes}-${pad2s(clampDay(vencMes, r.diaVencimento))}` : null;
    if (r.natureza === "DESPESA") {
      await db.insert(financePnlEntries).values({
        mes: mesAlvo, tipo: r.tipoEntry === "DESPESA_IMPOSTO" ? "DESPESA_IMPOSTO" : "DESPESA_RECORRENTE",
        descricao: r.descricao ?? "Despesa recorrente", valorCents: r.valorCents, status: "pendente",
        clienteId: null, origem: "RECORRENCIA", recorrenciaId: r.id, vencimento: venc, vencimentoOriginal: venc,
      });
    } else {
      await db.insert(financePnlEntries).values({
        mes: mesAlvo, tipo: "RECEITA_RECORRENTE",
        descricao: r.clienteId ? (cmap.get(r.clienteId)?.nome ?? `Cliente #${r.clienteId}`) : (r.descricao ?? "Receita recorrente"),
        valorCents: r.valorCents, status: "pendente", clienteId: r.clienteId, origem: "RECORRENCIA",
        recorrenciaId: r.id, vencimento: venc, vencimentoOriginal: venc,
      });
    }
    criadas++;
  }
  return { criadas, mes: mesAlvo, skipped: false };
}

/** Quantas recorrências ATIVAS aplicáveis ao mês ainda não foram geradas. */
export async function recorrenciaStatusMes(mes: string): Promise<{ faltam: number; aplicaveis: number }> {
  const db = await getDb();
  if (!db) return { faltam: 0, aplicaveis: 0 };
  const recs = await db.select({ id: financeRecorrencia.id }).from(financeRecorrencia).where(and(eq(financeRecorrencia.ativo, true), lte(financeRecorrencia.mesInicio, mes)));
  const existing = await db.select({ recorrenciaId: financePnlEntries.recorrenciaId }).from(financePnlEntries).where(and(eq(financePnlEntries.mes, mes), eq(financePnlEntries.origem, "RECORRENCIA")));
  const has = new Set(existing.map((e) => e.recorrenciaId));
  return { faltam: recs.filter((r) => !has.has(r.id)).length, aplicaveis: recs.length };
}

/** Cria uma recorrência de DESPESA (colaborador/imposto). */
export async function createDespesaRecorrencia(data: { descricao: string; valorCents: number; tipoEntry: "DESPESA_RECORRENTE" | "DESPESA_IMPOSTO"; estimativa: boolean; mesInicio: string; diaVencimento?: number | null; vencimentoMesSeguinte?: boolean }): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  const [row] = await db.insert(financeRecorrencia).values({
    natureza: "DESPESA", clienteId: null, descricao: data.descricao.trim(), valorCents: data.valorCents,
    tipoEntry: data.tipoEntry, estimativa: data.estimativa, mesInicio: data.mesInicio, diaVencimento: data.diaVencimento ?? null,
    vencimentoMesSeguinte: !!data.vencimentoMesSeguinte, ativo: true,
  }).$returningId();
  return row.id;
}

/** Cria uma recorrência de RECEITA (contrato/assinatura). Cria o cliente se preciso. */
export async function createReceitaRecorrencia(data: { clienteNome: string; valorCents: number; diaVencimento?: number | null; mesInicio: string; vencimentoMesSeguinte?: boolean }): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  const cli = await createFinanceCliente({ nome: data.clienteNome });
  const [row] = await db.insert(financeRecorrencia).values({
    natureza: "RECEITA", clienteId: cli.id, valorCents: data.valorCents, diaVencimento: data.diaVencimento ?? null,
    mesInicio: data.mesInicio, vencimentoMesSeguinte: !!data.vencimentoMesSeguinte, ativo: true,
  }).$returningId();
  return row.id;
}

/** Churn: desativa a recorrência e remove SÓ as linhas futuras pendentes dela. */
/**
 * Churn de recorrência. `churnMes` = ÚLTIMO mês ativo (o cliente ainda deve/paga
 * neste mês). Remove só as pendentes de meses POSTERIORES (mes > churnMes) — nunca
 * o próprio churnMes. Assim Baesh (churn com jul pago) mantém a linha de julho.
 */
export async function marcarSaidaRecorrencia(recorrenciaId: number, churnMes: string): Promise<{ removidas: number }> {
  const db = await getDb();
  if (!db) return { removidas: 0 };
  await db.update(financeRecorrencia).set({ ativo: false, churnMes }).where(eq(financeRecorrencia.id, recorrenciaId));
  const cond = and(eq(financePnlEntries.recorrenciaId, recorrenciaId), eq(financePnlEntries.origem, "RECORRENCIA"), eq(financePnlEntries.status, "pendente"), gt(financePnlEntries.mes, churnMes));
  const futuras = await db.select({ id: financePnlEntries.id }).from(financePnlEntries).where(cond);
  if (futuras.length) await db.delete(financePnlEntries).where(cond);
  return { removidas: futuras.length };
}
export async function reativarRecorrencia(recorrenciaId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  await db.update(financeRecorrencia).set({ ativo: true, churnMes: null }).where(eq(financeRecorrencia.id, recorrenciaId));
}
export async function ajustarValorRecorrencia(recorrenciaId: number, valorCents: number, aplicarGerados: boolean) {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  await db.update(financeRecorrencia).set({ valorCents }).where(eq(financeRecorrencia.id, recorrenciaId));
  if (aplicarGerados) {
    const cur = agencyCurrentMonth();
    await db.update(financePnlEntries).set({ valorCents })
      .where(and(eq(financePnlEntries.recorrenciaId, recorrenciaId), eq(financePnlEntries.origem, "RECORRENCIA"), eq(financePnlEntries.status, "pendente"), gte(financePnlEntries.mes, cur)));
  }
}

/** Projetos parcelados. */
export async function listFinanceProjetos() {
  const db = await getDb();
  if (!db) return [];
  const [projs, clientes] = await Promise.all([
    db.select().from(financeProjetos).orderBy(desc(financeProjetos.id)),
    db.select().from(financeClientes),
  ]);
  const cmap = new Map(clientes.map((c) => [c.id, c]));
  return projs.map((p) => ({ ...p, clienteNome: p.clienteId ? (cmap.get(p.clienteId)?.nome ?? null) : null }));
}
export async function createFinanceProjeto(data: { clienteId: number | null; nome: string; parcelas: { valorCents: number; vencimento: string }[] }): Promise<{ id: number; criadas: number }> {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  const nome = data.nome.trim();
  const num = data.parcelas.length;
  const total = data.parcelas.reduce((s, p) => s + p.valorCents, 0);
  // Nenhuma parcela pode cair em mês fechado.
  for (const mes of Array.from(new Set(data.parcelas.map((p) => p.vencimento.slice(0, 7))))) await assertMesAberto(mes);
  const [proj] = await db.insert(financeProjetos).values({ clienteId: data.clienteId, nome, valorTotalCents: total, numParcelas: num }).$returningId();
  const sorted = data.parcelas.slice().sort((a, b) => a.vencimento.localeCompare(b.vencimento));
  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i];
    await db.insert(financePnlEntries).values({
      mes: p.vencimento.slice(0, 7), tipo: "RECEITA_PONTUAL", descricao: `${nome} (${i + 1}/${num})`, valorCents: p.valorCents,
      status: "pendente", clienteId: data.clienteId, origem: "PROJETO", projetoId: proj.id, parcelaNum: i + 1, parcelaTotal: num,
      vencimento: p.vencimento, vencimentoOriginal: p.vencimento,
    });
  }
  return { id: proj.id, criadas: num };
}
/** Exclui projeto: remove só as parcelas PENDENTES (pagas ficam como receita realizada). */
export async function deleteFinanceProjeto(id: number): Promise<{ removidas: number }> {
  const db = await getDb();
  if (!db) return { removidas: 0 };
  const pend = await db.select({ id: financePnlEntries.id }).from(financePnlEntries)
    .where(and(eq(financePnlEntries.projetoId, id), eq(financePnlEntries.status, "pendente")));
  if (pend.length) await db.delete(financePnlEntries).where(and(eq(financePnlEntries.projetoId, id), eq(financePnlEntries.status, "pendente")));
  await db.delete(financeProjetos).where(eq(financeProjetos.id, id));
  return { removidas: pend.length };
}

/** Remarcar: muda o vencimento. 1ª atribuição não vira "Remarcado". */
export async function remarcarFinancePnl(id: number, vencimento: string) {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  const before = await getFinancePnlById(id);
  await assertMesAberto(before?.mes);
  const patch: Partial<InsertFinancePnlEntry> = { vencimento };
  if (!before?.vencimentoOriginal) patch.vencimentoOriginal = vencimento;
  await db.update(financePnlEntries).set(patch).where(eq(financePnlEntries.id, id));
}

/**
 * Remarcar OFICIAL (Ajustes 4): além de mover a entry do mês, grava a nova data na
 * definição da recorrência (diaVencimento + pós-pago), valendo para os meses gerados
 * dali pra frente. Também realinha os meses futuros já gerados que estejam abertos e
 * pendentes — nunca toca em mês passado, fechado ou lançamento já pago.
 */
export async function remarcarOficialFinancePnl(id: number, vencimento: string) {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  const before = await getFinancePnlById(id);
  if (!before) throw new Error("Lançamento não encontrado");
  if (!before.recorrenciaId) throw new Error("Este lançamento não vem de uma recorrência — use “Só este mês”.");
  await remarcarFinancePnl(id, vencimento);

  const dia = Number(vencimento.split("-")[2]);
  const posPago = vencimento.slice(0, 7) > before.mes;
  await db.update(financeRecorrencia)
    .set({ diaVencimento: dia, vencimentoMesSeguinte: posPago })
    .where(eq(financeRecorrencia.id, before.recorrenciaId));

  // Futuros já gerados: só os abertos e pendentes.
  const futuras = await db.select().from(financePnlEntries).where(and(
    eq(financePnlEntries.recorrenciaId, before.recorrenciaId),
    gt(financePnlEntries.mes, before.mes),
    eq(financePnlEntries.status, "pendente"),
  ));
  const fechados = new Set(await listMesesFechados());
  let realinhadas = 0;
  for (const f of futuras) {
    if (fechados.has(f.mes)) continue;
    const vencMes = posPago ? addMonthsSrv(f.mes, 1) : f.mes;
    const venc = `${vencMes}-${pad2s(clampDay(vencMes, dia))}`;
    if (venc === f.vencimento) continue;
    await db.update(financePnlEntries).set({ vencimento: venc }).where(eq(financePnlEntries.id, f.id));
    realinhadas++;
  }
  return { realinhadas };
}

/** Resumo do período separando Realizado (pago) × Previsto (pendente). */
export async function financePeriodoResumoRP(mesFrom: string, mesTo: string) {
  const db = await getDb();
  const empty = { receitaRealizadaCents: 0, receitaPrevistaCents: 0, despesaRealizadaCents: 0, despesaPrevistaCents: 0, aporteCents: 0, receitaRecorrenteCents: 0, receitaPontualCents: 0, despesaFolhaCents: 0, despesaImpostoCents: 0, despesaExtraCents: 0 };
  if (!db) return { ...empty, receitaTotalCents: 0, despesaTotalCents: 0, resultadoFinalCents: 0, resultadoRealizadoCents: 0, resultadoPrevistoCents: 0, totalPendenteCents: 0 };
  const rows = await db.select().from(financePnlEntries).where(and(gte(financePnlEntries.mes, mesFrom), lte(financePnlEntries.mes, mesTo)));
  let rRec = 0, rPend = 0, dRec = 0, dPend = 0, aporte = 0, rec = 0, pon = 0, dFolha = 0, dImposto = 0, dExtra = 0;
  for (const r of rows) {
    const receita = r.tipo === "RECEITA_RECORRENTE" || r.tipo === "RECEITA_PONTUAL";
    const despesa = r.tipo === "DESPESA_RECORRENTE" || r.tipo === "DESPESA_IMPOSTO" || r.tipo === "DESPESA_PONTUAL";
    if (receita) { if (r.status === "pago") rRec += r.valorCents; else rPend += r.valorCents; if (r.tipo === "RECEITA_RECORRENTE") rec += r.valorCents; else pon += r.valorCents; }
    else if (despesa) {
      if (r.status === "pago") dRec += r.valorCents; else dPend += r.valorCents;
      if (r.tipo === "DESPESA_RECORRENTE") dFolha += r.valorCents;
      else if (r.tipo === "DESPESA_IMPOSTO") dImposto += r.valorCents;
      else dExtra += r.valorCents;
    }
    else if (r.tipo === "APORTE") aporte += r.valorCents;
  }
  const receitaTotal = rRec + rPend, despesaTotal = dRec + dPend;
  return {
    receitaRealizadaCents: rRec, receitaPrevistaCents: rPend, despesaRealizadaCents: dRec, despesaPrevistaCents: dPend,
    receitaTotalCents: receitaTotal, despesaTotalCents: despesaTotal, resultadoFinalCents: receitaTotal - despesaTotal,
    resultadoRealizadoCents: rRec - dRec, resultadoPrevistoCents: rPend - dPend,
    aporteCents: aporte, receitaRecorrenteCents: rec, receitaPontualCents: pon, totalPendenteCents: rPend + dPend,
    despesaFolhaCents: dFolha, despesaImpostoCents: dImposto, despesaExtraCents: dExtra,
  };
}

/** Tendência 12m com split realizado (pago) para desenhar projeção tracejada. */
export async function financePnlTrendRP(limitMonths = 12) {
  const db = await getDb();
  if (!db) return [] as { mes: string; receitaCents: number; despesaCents: number; resultadoCents: number; receitaRecorrenteCents: number; receitaPontualCents: number; receitaPagoCents: number; despesaPagoCents: number }[];
  const monthsRows = await db.selectDistinct({ mes: financePnlEntries.mes }).from(financePnlEntries);
  const months = monthsRows.map((r) => r.mes).sort().slice(-limitMonths);
  if (!months.length) return [];
  const rows = await db.select().from(financePnlEntries).where(inArray(financePnlEntries.mes, months));
  const byMes = new Map<string, { mes: string; receitaCents: number; despesaCents: number; receitaRecorrenteCents: number; receitaPontualCents: number; receitaPagoCents: number; despesaPagoCents: number }>();
  for (const m of months) byMes.set(m, { mes: m, receitaCents: 0, despesaCents: 0, receitaRecorrenteCents: 0, receitaPontualCents: 0, receitaPagoCents: 0, despesaPagoCents: 0 });
  for (const r of rows) {
    const b = byMes.get(r.mes); if (!b) continue;
    if (r.tipo === "RECEITA_RECORRENTE" || r.tipo === "RECEITA_PONTUAL") { b.receitaCents += r.valorCents; if (r.status === "pago") b.receitaPagoCents += r.valorCents; if (r.tipo === "RECEITA_RECORRENTE") b.receitaRecorrenteCents += r.valorCents; else b.receitaPontualCents += r.valorCents; }
    else if (r.tipo === "DESPESA_RECORRENTE" || r.tipo === "DESPESA_IMPOSTO" || r.tipo === "DESPESA_PONTUAL") { b.despesaCents += r.valorCents; if (r.status === "pago") b.despesaPagoCents += r.valorCents; }
  }
  return months.map((m) => { const b = byMes.get(m)!; return { ...b, resultadoCents: b.receitaCents - b.despesaCents }; });
}

export type SeriePonto = {
  periodo: string; receitaCents: number; despesaCents: number; resultadoCents: number;
  mrrCents: number; recorrenteCents: number; pontualCents: number;
  receitaPagoCents: number; despesaPagoCents: number; parcial: boolean; realizado: boolean;
};

/**
 * v5 — Série histórica (Tendência · MRR · mix Recorrente×Pontual).
 * Fluxo (receita/despesa/resultado/recorrente/pontual) = SOMA no período.
 * Estoque/taxa (MRR) anual = MÉDIA mensal (Σ MRR mensal ÷ nº meses com dado).
 * Reflete realizado + previsto (despesa replicada inclusa). `realizado` marca
 * onde termina o realizado e começa a projeção. `parcial` marca anos incompletos.
 */
export async function financeSerieHistorica(
  granularidade: "mensal" | "anual",
  janela: "12m" | "24m" | "vitalicio",
) {
  const db = await getDb();
  const meta = { granularidade, janela, realizadoAte: null as string | null };
  if (!db) return { ...meta, pontos: [] as SeriePonto[] };
  const rows = await db.select().from(financePnlEntries);
  type Acc = { receita: number; despesa: number; recorrente: number; pontual: number; receitaPago: number; despesaPago: number };
  const zero = (): Acc => ({ receita: 0, despesa: 0, recorrente: 0, pontual: 0, receitaPago: 0, despesaPago: 0 });
  const byMonth = new Map<string, Acc>();
  for (const r of rows) {
    if (!byMonth.has(r.mes)) byMonth.set(r.mes, zero());
    const b = byMonth.get(r.mes)!;
    if (r.tipo === "RECEITA_RECORRENTE" || r.tipo === "RECEITA_PONTUAL") {
      b.receita += r.valorCents; if (r.status === "pago") b.receitaPago += r.valorCents;
      if (r.tipo === "RECEITA_RECORRENTE") b.recorrente += r.valorCents; else b.pontual += r.valorCents;
    } else if (r.tipo === "DESPESA_RECORRENTE" || r.tipo === "DESPESA_IMPOSTO" || r.tipo === "DESPESA_PONTUAL") {
      b.despesa += r.valorCents; if (r.status === "pago") b.despesaPago += r.valorCents;
    }
  }
  const allMonths = Array.from(byMonth.keys()).sort();
  if (!allMonths.length) return { ...meta, pontos: [] as SeriePonto[] };

  // fronteira realizado × projeção = último mês com algo pago.
  let realizadoAte: string | null = null;
  for (const m of allMonths) { const b = byMonth.get(m)!; if (b.receitaPago > 0 || b.despesaPago > 0) realizadoAte = m; }
  meta.realizadoAte = realizadoAte;

  // meses por ano na base COMPLETA (para marcar parcial).
  const mesesPorAnoFull = new Map<string, number>();
  for (const m of allMonths) { const y = m.slice(0, 4); mesesPorAnoFull.set(y, (mesesPorAnoFull.get(y) ?? 0) + 1); }
  const anoCorrente = agencyCurrentMonth().slice(0, 4);

  let months = allMonths;
  if (janela === "12m") months = allMonths.slice(-12);
  else if (janela === "24m") months = allMonths.slice(-24);

  if (granularidade === "mensal") {
    const pontos: SeriePonto[] = months.map((m) => {
      const b = byMonth.get(m)!;
      return {
        periodo: m, receitaCents: b.receita, despesaCents: b.despesa, resultadoCents: b.receita - b.despesa,
        mrrCents: b.recorrente, recorrenteCents: b.recorrente, pontualCents: b.pontual,
        receitaPagoCents: b.receitaPago, despesaPagoCents: b.despesaPago,
        parcial: false, realizado: realizadoAte != null && m <= realizadoAte,
      };
    });
    return { ...meta, pontos };
  }

  // anual — agrega os meses da janela por ano.
  const anos = Array.from(new Set(months.map((m) => m.slice(0, 4)))).sort();
  const byYear = new Map<string, Acc & { mrrSum: number; nMeses: number }>();
  for (const m of months) {
    const y = m.slice(0, 4); const b = byMonth.get(m)!;
    if (!byYear.has(y)) byYear.set(y, { ...zero(), mrrSum: 0, nMeses: 0 });
    const a = byYear.get(y)!;
    a.receita += b.receita; a.despesa += b.despesa; a.recorrente += b.recorrente; a.pontual += b.pontual;
    a.receitaPago += b.receitaPago; a.despesaPago += b.despesaPago; a.mrrSum += b.recorrente; a.nMeses += 1;
  }
  const pontos: SeriePonto[] = anos.map((y) => {
    const a = byYear.get(y)!;
    return {
      periodo: y, receitaCents: a.receita, despesaCents: a.despesa, resultadoCents: a.receita - a.despesa,
      mrrCents: a.nMeses ? Math.round(a.mrrSum / a.nMeses) : 0, // MRR anual = média mensal
      recorrenteCents: a.recorrente, pontualCents: a.pontual,
      receitaPagoCents: a.receitaPago, despesaPagoCents: a.despesaPago,
      parcial: (mesesPorAnoFull.get(y) ?? 0) < 12 || y >= anoCorrente,
      realizado: realizadoAte != null && `${y}-12` <= realizadoAte,
    };
  });
  return { ...meta, pontos };
}

/** A Receber / aging por VENCIMENTO (data real). Linhas sem vencimento → "sem data". */
/**
 * Aging A Receber ESCOPADO (Ajustes 3): vencidos (venc < hoje, pendentes) + a vencer
 * DENTRO do mês selecionado. Nada de meses posteriores ao selecionado (`mesTo`).
 * Item entra se seu mês efetivo (vencimento ou competência) ≤ mesTo.
 */
export async function financeAReceberVenc(mesTo?: string) {
  const db = await getDb();
  const hoje = agencyTodayStr();
  const mesCorrente = agencyCurrentMonth();
  const limite = mesTo ?? mesCorrente;
  const empty = { mesCorrente, hoje, mesTo: limite, totalPendenteCents: 0, totalVencidoCents: 0, buckets: { corrente: 0, m1: 0, m2: 0, m3plus: 0, semData: 0 }, itens: [] as { clienteNome: string; cor: string | null; descricao: string; mes: string; vencimento: string | null; valorCents: number; idade: number | null }[] };
  if (!db) return empty;
  const [allRows, clientes] = await Promise.all([
    db.select().from(financePnlEntries).where(and(RECEITA_TIPOS, eq(financePnlEntries.status, "pendente"))),
    db.select().from(financeClientes),
  ]);
  const cmap = new Map(clientes.map((c) => [c.id, c]));
  // Mês efetivo do item; corta o que vence depois do mês selecionado.
  const rows = allRows.filter((r) => (r.vencimento ? r.vencimento.slice(0, 7) : r.mes) <= limite);
  const buckets = { corrente: 0, m1: 0, m2: 0, m3plus: 0, semData: 0 };
  const itens = rows.map((r) => {
    const idade = r.vencimento ? monthsLate(r.vencimento, hoje) : null;
    if (idade == null) buckets.semData += r.valorCents;
    else if (idade <= 0) buckets.corrente += r.valorCents;
    else if (idade === 1) buckets.m1 += r.valorCents;
    else if (idade === 2) buckets.m2 += r.valorCents;
    else buckets.m3plus += r.valorCents;
    const c = r.clienteId ? cmap.get(r.clienteId) : undefined;
    return { clienteNome: c?.nome ?? "—", cor: c?.cor ?? null, descricao: r.descricao, mes: r.mes, vencimento: r.vencimento, valorCents: r.valorCents, idade };
  }).sort((a, b) => (b.idade ?? -99) - (a.idade ?? -99) || b.valorCents - a.valorCents);
  const totalPendente = rows.reduce((s, r) => s + r.valorCents, 0);
  return { mesCorrente, hoje, mesTo: limite, totalPendenteCents: totalPendente, totalVencidoCents: buckets.m1 + buckets.m2 + buckets.m3plus, buckets, itens };
}

/** A Pagar / aging por VENCIMENTO — espelho de aReceber para DESPESA pendente. */
export async function financeAPagarVenc() {
  const db = await getDb();
  const hoje = agencyTodayStr();
  const mesCorrente = agencyCurrentMonth();
  const empty = { mesCorrente, hoje, totalPendenteCents: 0, totalVencidoCents: 0, buckets: { corrente: 0, m1: 0, m2: 0, m3plus: 0, semData: 0 }, itens: [] as { descricao: string; tipo: string; mes: string; vencimento: string | null; valorCents: number; idade: number | null }[] };
  if (!db) return empty;
  const rows = await db.select().from(financePnlEntries).where(and(DESPESA_TIPOS, eq(financePnlEntries.status, "pendente")));
  const buckets = { corrente: 0, m1: 0, m2: 0, m3plus: 0, semData: 0 };
  const itens = rows.map((r) => {
    const idade = r.vencimento ? monthsLate(r.vencimento, hoje) : null;
    if (idade == null) buckets.semData += r.valorCents;
    else if (idade <= 0) buckets.corrente += r.valorCents;
    else if (idade === 1) buckets.m1 += r.valorCents;
    else if (idade === 2) buckets.m2 += r.valorCents;
    else buckets.m3plus += r.valorCents;
    return { descricao: r.descricao, tipo: r.tipo, mes: r.mes, vencimento: r.vencimento, valorCents: r.valorCents, idade };
  }).sort((a, b) => (b.idade ?? -99) - (a.idade ?? -99) || b.valorCents - a.valorCents);
  const totalPendente = rows.reduce((s, r) => s + r.valorCents, 0);
  return { mesCorrente, hoje, totalPendenteCents: totalPendente, totalVencidoCents: buckets.m1 + buckets.m2 + buckets.m3plus, buckets, itens };
}

/**
 * Hub de receita — contratos/projetos ativos no mês (topo do hub Clientes&Projetos).
 * Recorrente = finance_recorrencia (natureza RECEITA, ativa) + o entry gerado do mês.
 * Pontual = todos os RECEITA_PONTUAL do mês (parcelas de projeto + avulsas).
 */
export async function financeContratosAtivos(mes: string) {
  const db = await getDb();
  const empty = { recorrentes: [] as ContratoRec[], pontuais: [] as ContratoPon[], novosCents: 0 };
  if (!db) return empty;
  const [recs, clientes, entries, allReceita] = await Promise.all([
    db.select().from(financeRecorrencia).where(eq(financeRecorrencia.natureza, "RECEITA")),
    db.select().from(financeClientes),
    db.select().from(financePnlEntries).where(eq(financePnlEntries.mes, mes)),
    db.select({ mes: financePnlEntries.mes, clienteId: financePnlEntries.clienteId, projetoId: financePnlEntries.projetoId, descricao: financePnlEntries.descricao, v: financePnlEntries.valorCents }).from(financePnlEntries).where(RECEITA_TIPOS),
  ]);
  const cmap = new Map(clientes.map((c) => [c.id, c]));
  // Recorrência ATIVA por cliente (fonte para ações + projeção de meses futuros).
  const activeRecByCliente = new Map<number, typeof recs[number]>();
  for (const r of recs) if (r.ativo && r.clienteId) activeRecByCliente.set(r.clienteId, r);

  // Recorrentes REAIS do mês: casa por cliente+mês+tipo (NÃO por recorrenciaId).
  const clientesComRec = new Set<number | string>();
  const recorrentes: ContratoRec[] = [];
  for (const e of entries) {
    if (e.tipo !== "RECEITA_RECORRENTE") continue;
    const key = e.clienteId ?? `d:${e.descricao}`;
    clientesComRec.add(key);
    const rec = e.clienteId ? activeRecByCliente.get(e.clienteId) : undefined;
    const c = e.clienteId ? cmap.get(e.clienteId) : undefined;
    recorrentes.push({
      recorrenciaId: rec?.id ?? null, clienteId: e.clienteId ?? null, clienteNome: c?.nome ?? e.descricao, cor: c?.cor ?? null,
      valorCents: e.valorCents, diaVencimento: rec?.diaVencimento ?? null, entryId: e.id, status: e.status,
      vencimento: e.vencimento ?? null, vencimentoOriginal: e.vencimentoOriginal ?? null, projetado: false,
    });
  }
  // Projeção: recorrência ativa cujo período cobre o mês (mesInicio ≤ mes) e o
  // cliente ainda não tem entry real no mês → "Previsto" com vencimento calculado.
  for (const r of recs) {
    if (!r.ativo || !r.clienteId || r.mesInicio > mes || clientesComRec.has(r.clienteId)) continue;
    const vencMes = r.vencimentoMesSeguinte ? addMonthsSrv(mes, 1) : mes;
    const venc = r.diaVencimento ? `${vencMes}-${pad2s(clampDay(vencMes, r.diaVencimento))}` : null;
    const c = cmap.get(r.clienteId);
    recorrentes.push({
      recorrenciaId: r.id, clienteId: r.clienteId, clienteNome: c?.nome ?? r.descricao ?? `Cliente #${r.clienteId}`, cor: c?.cor ?? null,
      valorCents: r.valorCents, diaVencimento: r.diaVencimento ?? null, entryId: null, status: null,
      vencimento: venc, vencimentoOriginal: venc, projetado: true,
    });
  }
  recorrentes.sort((a, b) => b.valorCents - a.valorCents);

  const pontuais: ContratoPon[] = entries
    .filter((e) => e.tipo === "RECEITA_PONTUAL")
    .map((e) => {
      const c = e.clienteId ? cmap.get(e.clienteId) : undefined;
      return {
        entryId: e.id, projetoId: e.projetoId ?? null, parcelaNum: e.parcelaNum ?? null, parcelaTotal: e.parcelaTotal ?? null,
        clienteId: e.clienteId ?? null, clienteNome: c?.nome ?? "—", cor: c?.cor ?? null, descricao: e.descricao,
        valorCents: e.valorCents, vencimento: e.vencimento ?? null, vencimentoOriginal: e.vencimentoOriginal ?? null, status: e.status,
      };
    })
    .sort((a, b) => b.valorCents - a.valorCents);

  // Novos = receita (recorrente OU pontual) de cliente/projeto que não existia antes.
  const identOf = (x: { clienteId: number | null; projetoId: number | null; descricao: string }) => x.clienteId != null ? `c${x.clienteId}` : x.projetoId != null ? `p${x.projetoId}` : `d${x.descricao}`;
  const firstMonth = new Map<string, string>();
  for (const x of allReceita) { const k = identOf(x); const f = firstMonth.get(k); if (!f || x.mes < f) firstMonth.set(k, x.mes); }
  let novosCents = 0;
  for (const x of allReceita) if (x.mes === mes && firstMonth.get(identOf(x)) === mes) novosCents += x.v;

  return { recorrentes, pontuais, novosCents };
}
/**
 * Hub de custo — despesas ativas no mês (espelho de contratosAtivos).
 * recorrentes = finance_recorrencia natureza DESPESA (recorrente + imposto) + entry do mês.
 * pontuais = DESPESA_PONTUAL do mês (avulsas).
 */
export async function financeDespesasAtivos(mes: string) {
  const db = await getDb();
  const empty = { recorrentes: [] as DespesaRec[], pontuais: [] as DespesaPon[] };
  if (!db) return empty;
  const [recs, entries] = await Promise.all([
    db.select().from(financeRecorrencia).where(eq(financeRecorrencia.natureza, "DESPESA")),
    db.select().from(financePnlEntries).where(eq(financePnlEntries.mes, mes)),
  ]);
  // Recorrência ativa por descrição (casa entry↔recorrência por descrição+mês, não por recorrenciaId).
  const activeRecByDesc = new Map<string, typeof recs[number]>();
  for (const r of recs) if (r.ativo && r.descricao) activeRecByDesc.set(r.descricao, r);
  const descComRec = new Set<string>();
  const recorrentes: DespesaRec[] = [];
  for (const e of entries) {
    if (e.tipo !== "DESPESA_RECORRENTE" && e.tipo !== "DESPESA_IMPOSTO") continue;
    descComRec.add(e.descricao);
    const rec = activeRecByDesc.get(e.descricao);
    recorrentes.push({
      recorrenciaId: rec?.id ?? null, descricao: e.descricao, valorCents: e.valorCents,
      tipoEntry: e.tipo === "DESPESA_IMPOSTO" ? "DESPESA_IMPOSTO" : "DESPESA_RECORRENTE",
      estimativa: rec ? !!rec.estimativa : e.tipo === "DESPESA_IMPOSTO", diaVencimento: rec?.diaVencimento ?? null,
      entryId: e.id, status: e.status, vencimento: e.vencimento ?? null, vencimentoOriginal: e.vencimentoOriginal ?? null, projetado: false,
    });
  }
  // Projeção: recorrência ativa cobrindo o mês sem entry desta descrição → "Previsto".
  for (const r of recs) {
    if (!r.ativo || r.mesInicio > mes || (r.descricao && descComRec.has(r.descricao))) continue;
    const vencMes = r.vencimentoMesSeguinte ? addMonthsSrv(mes, 1) : mes;
    const venc = r.diaVencimento ? `${vencMes}-${pad2s(clampDay(vencMes, r.diaVencimento))}` : null;
    recorrentes.push({
      recorrenciaId: r.id, descricao: r.descricao ?? "Despesa", valorCents: r.valorCents,
      tipoEntry: r.tipoEntry === "DESPESA_IMPOSTO" ? "DESPESA_IMPOSTO" : "DESPESA_RECORRENTE",
      estimativa: !!r.estimativa, diaVencimento: r.diaVencimento ?? null, entryId: null, status: null,
      vencimento: venc, vencimentoOriginal: venc, projetado: true,
    });
  }
  recorrentes.sort((a, b) => b.valorCents - a.valorCents);
  const pontuais: DespesaPon[] = entries
    .filter((e) => e.tipo === "DESPESA_PONTUAL")
    .map((e) => ({ entryId: e.id, descricao: e.descricao, valorCents: e.valorCents, vencimento: e.vencimento ?? null, vencimentoOriginal: e.vencimentoOriginal ?? null, status: e.status, reembolsoPendente: !!e.reembolsoPendente, subcategoria: e.subcategoria ?? null }))
    .sort((a, b) => b.valorCents - a.valorCents);
  return { recorrentes, pontuais };
}
/** Composição da despesa PONTUAL por subcategoria no período (para o donut). */
export async function financeDespesaPontualPorSub(f: { mesFrom?: string; mesTo?: string } = {}) {
  const db = await getDb();
  if (!db) return [] as { sub: string; totalCents: number }[];
  const conds = [eq(financePnlEntries.tipo, "DESPESA_PONTUAL")];
  if (f.mesFrom) conds.push(gte(financePnlEntries.mes, f.mesFrom));
  if (f.mesTo) conds.push(lte(financePnlEntries.mes, f.mesTo));
  const rows = await db.select({ sub: financePnlEntries.subcategoria, v: financePnlEntries.valorCents }).from(financePnlEntries).where(and(...conds));
  const agg = new Map<string, number>();
  for (const r of rows) { const k = r.sub ?? "OUTROS"; agg.set(k, (agg.get(k) ?? 0) + r.v); }
  return Array.from(agg.entries()).map(([sub, totalCents]) => ({ sub, totalCents })).sort((a, b) => b.totalCents - a.totalCents);
}

/** Despesa por fornecedor/descrição no período (para o donut de concentração de custo). */
export async function financeDespesaPorFornecedor(f: { mesFrom?: string; mesTo?: string } = {}) {
  const db = await getDb();
  if (!db) return [] as { nome: string; totalCents: number }[];
  const conds = [DESPESA_TIPOS];
  if (f.mesFrom) conds.push(gte(financePnlEntries.mes, f.mesFrom));
  if (f.mesTo) conds.push(lte(financePnlEntries.mes, f.mesTo));
  const rows = await db.select({ descricao: financePnlEntries.descricao, v: financePnlEntries.valorCents }).from(financePnlEntries).where(and(...conds));
  const agg = new Map<string, number>();
  for (const r of rows) agg.set(r.descricao, (agg.get(r.descricao) ?? 0) + r.v);
  return Array.from(agg.entries()).map(([nome, totalCents]) => ({ nome, totalCents })).sort((a, b) => b.totalCents - a.totalCents);
}
type DespesaRec = { recorrenciaId: number | null; descricao: string; valorCents: number; tipoEntry: "DESPESA_RECORRENTE" | "DESPESA_IMPOSTO"; estimativa: boolean; diaVencimento: number | null; entryId: number | null; status: "pago" | "pendente" | null; vencimento: string | null; vencimentoOriginal: string | null; projetado: boolean };
type DespesaPon = { entryId: number; descricao: string; valorCents: number; vencimento: string | null; vencimentoOriginal: string | null; status: "pago" | "pendente"; reembolsoPendente: boolean; subcategoria: string | null };

type ContratoRec = { recorrenciaId: number | null; clienteId: number | null; clienteNome: string; cor: string | null; valorCents: number; diaVencimento: number | null; entryId: number | null; status: "pago" | "pendente" | null; vencimento: string | null; vencimentoOriginal: string | null; projetado: boolean };
type ContratoPon = { entryId: number; projetoId: number | null; parcelaNum: number | null; parcelaTotal: number | null; clienteId: number | null; clienteNome: string; cor: string | null; descricao: string; valorCents: number; vencimento: string | null; vencimentoOriginal: string | null; status: "pago" | "pendente" };

/**
 * Visão Geral — resumo do período (reusa periodoResumoRP) + posição de caixa.
 * Caixa = TODA receita pendente (a receber) × TODA despesa pendente (a pagar),
 * não escopado ao período — é a posição projetada de caixa. Saldo = receber − pagar.
 */
export async function financeOverviewResumo(mesFrom: string, mesTo: string) {
  const db = await getDb();
  const periodo = await financePeriodoResumoRP(mesFrom, mesTo);
  const margemPct = periodo.receitaTotalCents > 0 ? Math.round((periodo.resultadoFinalCents / periodo.receitaTotalCents) * 100) : null;
  const zStatus = { pagoCents: 0, aVencerCents: 0, atrasadoCents: 0 };
  const empty = { ...periodo, margemPct, aReceberCents: 0, aPagarCents: 0, saldoProjetadoCents: 0, receitaStatus: { ...zStatus }, despesaStatus: { ...zStatus }, aReceberVencidoCents: 0, aPagarVencidoCents: 0, receitaMedia6Cents: 0, despesaMedia6Cents: 0, resultadoMedia6Cents: 0 };
  if (!db) return empty;
  const hoje = agencyTodayStr();
  const cur = agencyCurrentMonth();
  const meses6: string[] = []; for (let i = 6; i >= 1; i--) meses6.push(addMonthsSrv(cur, -i));
  const [recPend, despPend, periodRows, rows6] = await Promise.all([
    db.select({ v: financePnlEntries.valorCents, venc: financePnlEntries.vencimento, mes: financePnlEntries.mes }).from(financePnlEntries).where(and(RECEITA_TIPOS, eq(financePnlEntries.status, "pendente"))),
    db.select({ v: financePnlEntries.valorCents, venc: financePnlEntries.vencimento, mes: financePnlEntries.mes }).from(financePnlEntries).where(and(DESPESA_TIPOS, eq(financePnlEntries.status, "pendente"))),
    db.select({ tipo: financePnlEntries.tipo, status: financePnlEntries.status, venc: financePnlEntries.vencimento, v: financePnlEntries.valorCents }).from(financePnlEntries).where(and(gte(financePnlEntries.mes, mesFrom), lte(financePnlEntries.mes, mesTo))),
    db.select({ mes: financePnlEntries.mes, tipo: financePnlEntries.tipo, v: financePnlEntries.valorCents }).from(financePnlEntries).where(inArray(financePnlEntries.mes, meses6)),
  ]);
  // Caixa ESCOPADA ao período (por vencimento).
  const noPeriodo = (venc: string | null, mes: string) => { const m = venc ? venc.slice(0, 7) : mes; return m >= mesFrom && m <= mesTo; };
  const aReceber = recPend.filter((r) => noPeriodo(r.venc, r.mes)).reduce((s, r) => s + r.v, 0);
  const aPagar = despPend.filter((r) => noPeriodo(r.venc, r.mes)).reduce((s, r) => s + r.v, 0);
  // Status pago × a vencer × atrasado (pendente com vencimento < hoje) no período.
  const receitaStatus = { ...zStatus }, despesaStatus = { ...zStatus };
  const RECEITA = new Set(["RECEITA_RECORRENTE", "RECEITA_PONTUAL"]);
  const DESPESA = new Set(["DESPESA_RECORRENTE", "DESPESA_IMPOSTO", "DESPESA_PONTUAL"]);
  for (const r of periodRows) {
    const bucket = RECEITA.has(r.tipo) ? receitaStatus : DESPESA.has(r.tipo) ? despesaStatus : null;
    if (!bucket) continue;
    if (r.status === "pago") bucket.pagoCents += r.v;
    else if (r.venc && r.venc < hoje) bucket.atrasadoCents += r.v;
    else bucket.aVencerCents += r.v;
  }
  // Média móvel dos 6 meses fechados (anteriores ao atual).
  const perMes = new Map<string, { rec: number; desp: number }>();
  for (const m of meses6) perMes.set(m, { rec: 0, desp: 0 });
  for (const r of rows6) {
    const b = perMes.get(r.mes); if (!b) continue;
    if (RECEITA.has(r.tipo)) b.rec += r.v; else if (DESPESA.has(r.tipo)) b.desp += r.v;
  }
  const comDados = Array.from(perMes.values()).filter((x) => x.rec > 0 || x.desp > 0);
  const n = Math.max(1, comDados.length);
  const receitaMedia6 = Math.round(comDados.reduce((s, x) => s + x.rec, 0) / n);
  const despesaMedia6 = Math.round(comDados.reduce((s, x) => s + x.desp, 0) / n);
  return {
    ...periodo, margemPct, aReceberCents: aReceber, aPagarCents: aPagar, saldoProjetadoCents: aReceber - aPagar,
    receitaStatus, despesaStatus, aReceberVencidoCents: receitaStatus.atrasadoCents, aPagarVencidoCents: despesaStatus.atrasadoCents,
    receitaMedia6Cents: receitaMedia6, despesaMedia6Cents: despesaMedia6, resultadoMedia6Cents: receitaMedia6 - despesaMedia6,
  };
}

// ─── Sistema de notificações (Performance + Financeiro) ──────────────────────
// Modelo: uma linha por DESTINATÁRIO. O cron resolve quem opta por receber cada
// tipo e cria uma notificação por pessoa — assim cada um lê/dispensa a sua, e o
// filtro por userId é sempre correto. Dedup por (userId, dedupKey).

/** Usuários que devem receber `tipo` no canal in-app. Financeiro: só admin. */
export async function destinatariosInApp(tipo: NotifTipo): Promise<{ id: number; email: string | null; name: string | null }[]> {
  return destinatariosPara(tipo, "inApp");
}
/** Usuários que devem receber `tipo` por email. Financeiro: só admin. */
export async function destinatariosEmail(tipo: NotifTipo): Promise<{ id: number; email: string | null; name: string | null }[]> {
  return destinatariosPara(tipo, "email");
}

async function destinatariosPara(tipo: NotifTipo, canal: "inApp" | "email") {
  const db = await getDb();
  if (!db) return [];
  const def = notifTipoDef(tipo);
  if (!def) return [];
  const ativos = await db.select({ id: users.id, email: users.email, name: users.name, role: users.role })
    .from(users).where(eq(users.active, true));
  const elegiveis = ativos.filter((u) => (def.adminOnly ? u.role === "admin" : true));
  if (elegiveis.length === 0) return [];
  const prefs = await db.select().from(notificationPrefs).where(and(
    eq(notificationPrefs.tipo, tipo),
    inArray(notificationPrefs.userId, elegiveis.map((u) => u.id)),
  ));
  const pmap = new Map(prefs.map((p) => [p.userId, p]));
  // Sem linha de preferência = default do catálogo (só gravamos o que foi mexido).
  const padrao = canal === "inApp" ? def.inApp : def.email;
  return elegiveis
    .filter((u) => { const p = pmap.get(u.id); return p ? (canal === "inApp" ? p.inApp : p.email) : padrao; })
    .map((u) => ({ id: u.id, email: u.email, name: u.name }));
}

export type NovaNotificacao = {
  tipo: NotifTipo;
  alertType: "ANOMALY" | "SYNC_ERROR" | "BUDGET_WARNING" | "DAILY_BRIEFING" | "WEEKLY_REPORT" | "FINANCE_OVERDUE" | "REPORT";
  title: string;
  message: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
  /** Componente estável da chave de dedup (ex.: id da conta, "global"). */
  referencia: string;
  /** Dia da competência (YYYY-MM-DD) — fecha o dedup "1× por dia". */
  dia: string;
  accountId?: number | null;
  suggestedAction?: string | null;
};

/**
 * Cria a notificação para todos que optaram pelo in-app, pulando quem já tem a
 * mesma dedupKey (independente de lida) — reprocessar o dia é no-op.
 * Retorna os userIds que receberam agora.
 */
export async function createNotification(n: NovaNotificacao): Promise<number[]> {
  const db = await getDb();
  if (!db) return [];
  const dominio = dominioDoAlerta(n.alertType);
  const dedupKey = `${n.tipo}:${n.referencia}:${n.dia}`.slice(0, 180);
  const destinos = await destinatariosInApp(n.tipo);
  if (destinos.length === 0) return [];

  const jaTem = await db.select({ userId: alerts.userId }).from(alerts).where(and(
    eq(alerts.dedupKey, dedupKey),
    inArray(alerts.userId, destinos.map((d) => d.id)),
  ));
  const tem = new Set(jaTem.map((r) => r.userId));
  const novos = destinos.filter((d) => !tem.has(d.id));
  if (novos.length === 0) return [];

  await db.insert(alerts).values(novos.map((d) => ({
    userId: d.id,
    accountId: n.accountId ?? null,
    title: n.title.slice(0, 255),
    message: n.message,
    type: n.alertType,
    severity: n.severity,
    dominio,
    dedupKey,
    suggestedAction: n.suggestedAction ?? null,
    isRead: false,
  })) as InsertAlert[]);
  return novos.map((d) => d.id);
}

/** Marca o email como enviado para a notificação de um dedupKey/usuário. */
export async function marcarEmailEnviado(userId: number, dedupKey: string) {
  const db = await getDb();
  if (!db) return;
  await db.update(alerts).set({ emailSentAt: new Date() })
    .where(and(eq(alerts.userId, userId), eq(alerts.dedupKey, dedupKey)));
}

/** Já enviamos email deste dedupKey para este usuário? (idempotência do cron) */
export async function emailJaEnviado(userId: number, dedupKey: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const r = await db.select({ id: alerts.id }).from(alerts).where(and(
    eq(alerts.userId, userId), eq(alerts.dedupKey, dedupKey), isNotNull(alerts.emailSentAt),
  )).limit(1);
  return r.length > 0;
}

export async function getNotificationPrefs(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(notificationPrefs).where(eq(notificationPrefs.userId, userId));
}

export async function upsertNotificationPref(userId: number, tipo: string, values: { inApp?: boolean; email?: boolean }) {
  const db = await getDb();
  if (!db) return;
  const def = notifTipoDef(tipo);
  if (!def) throw new Error(`Tipo de notificação desconhecido: ${tipo}`);
  await db.insert(notificationPrefs)
    .values({ userId, tipo, inApp: values.inApp ?? def.inApp, email: values.email ?? def.email })
    .onDuplicateKeyUpdate({ set: { ...(values.inApp !== undefined ? { inApp: values.inApp } : {}), ...(values.email !== undefined ? { email: values.email } : {}) } });
}

export async function getUnreadCountByDominio(userId: number): Promise<{ PERFORMANCE: number; FINANCEIRO: number }> {
  const db = await getDb();
  const zero = { PERFORMANCE: 0, FINANCEIRO: 0 };
  if (!db) return zero;
  const rows = await db.select({ dominio: alerts.dominio, n: sql<number>`count(*)` }).from(alerts)
    .where(and(eq(alerts.userId, userId), eq(alerts.isRead, false)))
    .groupBy(alerts.dominio);
  const out = { ...zero };
  for (const r of rows) out[r.dominio as "PERFORMANCE" | "FINANCEIRO"] = Number(r.n);
  return out;
}

/**
 * Atrasos financeiros: pendências com vencimento ESTRITAMENTE anterior a hoje
 * (data local da agência). Só isso — nada de aviso antecipado. Dias de atraso,
 * não meses, porque é o que a notificação precisa mostrar.
 */
export async function financeAtrasos() {
  const db = await getDb();
  const hoje = agencyTodayStr();
  const vazio = {
    hoje,
    aReceber: [] as { nome: string; descricao: string; mes: string; vencimento: string; valorCents: number; dias: number }[],
    aPagar: [] as { nome: string; descricao: string; mes: string; vencimento: string; valorCents: number; dias: number }[],
    totalReceberCents: 0, totalPagarCents: 0, total: 0,
  };
  if (!db) return vazio;
  const [receitas, despesas, clientes] = await Promise.all([
    db.select().from(financePnlEntries).where(and(RECEITA_TIPOS, eq(financePnlEntries.status, "pendente"), isNotNull(financePnlEntries.vencimento), lt(financePnlEntries.vencimento, hoje))),
    db.select().from(financePnlEntries).where(and(DESPESA_TIPOS, eq(financePnlEntries.status, "pendente"), isNotNull(financePnlEntries.vencimento), lt(financePnlEntries.vencimento, hoje))),
    db.select().from(financeClientes),
  ]);
  const cmap = new Map(clientes.map((c) => [c.id, c]));
  const dias = (venc: string) => Math.round((Date.parse(`${hoje}T00:00:00Z`) - Date.parse(`${venc}T00:00:00Z`)) / 86400000);
  const mapear = (rows: typeof receitas, nomeDe: (r: (typeof receitas)[number]) => string) => rows
    .map((r) => ({ nome: nomeDe(r), descricao: r.descricao, mes: r.mes, vencimento: r.vencimento as string, valorCents: r.valorCents, dias: dias(r.vencimento as string) }))
    .sort((a, b) => b.dias - a.dias || b.valorCents - a.valorCents);

  const aReceber = mapear(receitas, (r) => (r.clienteId ? cmap.get(r.clienteId)?.nome ?? "—" : r.descricao));
  const aPagar = mapear(despesas, (r) => r.descricao);
  const totalReceber = aReceber.reduce((s, x) => s + x.valorCents, 0);
  const totalPagar = aPagar.reduce((s, x) => s + x.valorCents, 0);
  return { hoje, aReceber, aPagar, totalReceberCents: totalReceber, totalPagarCents: totalPagar, total: aReceber.length + aPagar.length };
}
