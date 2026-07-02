import { logger } from "./logger";
import { and, desc, eq, gte, inArray, lt, lte, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser,
  userIntegrations,
  type InsertUserIntegration,
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

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};

  const textFields = ["name", "email", "loginMethod"] as const;
  for (const field of textFields) {
    const value = user[field];
    if (value === undefined) continue;
    const normalized = value ?? null;
    values[field] = normalized;
    updateSet[field] = normalized;
  }

  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  }

  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
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
    .where(and(
      eq(metaAdAccounts.userId, userId),
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
    .where(and(
      eq(alerts.userId, userId),
      eq(alerts.isRead, false),
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
    .where(
      and(
        eq(metaAdAccounts.userId, userId),
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
    .where(
      and(
        eq(metaAdAccounts.userId, userId),
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

export async function getAllAlertsForUser(userId: number, limit = 200) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id:          alerts.id,
      title:       alerts.title,
      message:     alerts.message,
      severity:    alerts.severity,
      type:        alerts.type,
      priority:    alerts.priority,
      suggestedAction: alerts.suggestedAction,
      isRead:      alerts.isRead,
      createdAt:   alerts.createdAt,
      accountId:   alerts.accountId,
      accountName: metaAdAccounts.accountName,
      metaAccountId: metaAdAccounts.accountId,
    })
    .from(alerts)
    .innerJoin(metaAdAccounts, eq(alerts.accountId, metaAdAccounts.id))
    .where(eq(alerts.userId, userId))
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

  const existing = await db
    .select({ id: alerts.id })
    .from(alerts)
    .where(
      and(
        eq(alerts.accountId, data.accountId),
        eq(alerts.type, data.type),
        eq(alerts.title, data.title),
        eq(alerts.isRead, false),
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

export async function markAlertRead(id: number, userId: number) {
  const db = await getDb();
  if (!db) return;
  // Delete the alert when marked as read — it disappears from the list
  await db
    .delete(alerts)
    .where(and(eq(alerts.id, id), eq(alerts.userId, userId)));
}

export async function markAllAlertsRead(userId: number) {
  const db = await getDb();
  if (!db) return;
  // Delete all alerts when marking all as read
  await db.delete(alerts).where(eq(alerts.userId, userId));
}

export async function markAllAlertsReadByAccount(userId: number, accountId: number) {
  const db = await getDb();
  if (!db) return;
  // Delete only alerts for a specific account
  await db.delete(alerts).where(and(eq(alerts.userId, userId), eq(alerts.accountId, accountId)));
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
import { accountThresholds, notificationSettings } from "../drizzle/schema";

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
