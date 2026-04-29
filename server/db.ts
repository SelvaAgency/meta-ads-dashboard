import { and, desc, eq, gte, lt, lte, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser,
  aiSuggestions,
  alerts,
  anomalies,
  campaignMetrics,
  campaigns,
  metaAdAccounts,
  scheduledReports,
  users,
  googleAdAccounts,
  type InsertAiSuggestion,
  type InsertAlert,
  type InsertAnomaly,
  type InsertCampaign,
  type InsertCampaignMetrics,
  type InsertMetaAdAccount,
  type InsertScheduledReport,
  type InsertGoogleAdAccount,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

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
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
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

// ─── Meta Ad Accounts ─────────────────────────────────────────────────────────

export async function getAllActiveMetaAdAccounts() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(metaAdAccounts);
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
      console.log(`[DB] Duplicate account detected: ${acc.accountId} (id: ${acc.id}), filtering out`);
      return false;
    }
    seen.add(acc.accountId);
    return true;
  });
  
  if (deduped.length < accounts.length) {
    console.log(`[DB] Deduplication: ${accounts.length} accounts -> ${deduped.length} unique accounts`);
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
    console.log(`[DB] Account ${data.accountId} already exists (id=${existing[0].id}), updating accessToken and reactivating`);
    await db
      .update(metaAdAccounts)
      .set({
        accessToken: data.accessToken,
        accountName: data.accountName ?? existing[0].accountName,
        currency: data.currency ?? existing[0].currency,
        timezone: data.timezone ?? existing[0].timezone,
        isActive: true,
      })
      .where(eq(metaAdAccounts.id, existing[0].id));
    return { ...existing[0], accessToken: data.accessToken, isActive: true };
  }
  
  console.log(`[DB] Creating new account ${data.accountId} for user ${data.userId}`);
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

export async function deleteMetaAdAccount(id: number, userId: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(metaAdAccounts)
    .set({ isActive: false })
    .where(and(eq(metaAdAccounts.id, id), eq(metaAdAccounts.userId, userId)));
}

// ─── Campaigns ────────────────────────────────────────────────────────────────

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
    console.log(`[upsertCampaign] Upserting campaign ${data.metaCampaignId} for account ${data.accountId}`);
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
    console.log(`[upsertCampaign] Success: ${data.metaCampaignId}`);
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
        console.log(`[markStaleCampaignsArchived] Archived stale campaign ${lc.metaCampaignId} (local id ${lc.id})`);
      }
    }

    if (archivedCount > 0) {
      console.log(`[markStaleCampaignsArchived] Archived ${archivedCount} stale campaigns for account ${accountId}`);
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
    console.log(`[upsertCampaignMetrics] Upserting metrics for campaign ${data.campaignId} on ${data.date} (spend: ${data.spend}, impressions: ${data.impressions})`);
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
    console.log(`[upsertCampaignMetrics] Success: campaign ${data.campaignId} on ${data.date}`);
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

// Get pending suggestions (status = pending, not expired)
export async function getSuggestionsByAccountId(accountId: number, limit = 50) {
  const db = await getDb();
  if (!db) return [];
  const now = new Date();
  return db
    .select()
    .from(aiSuggestions)
    .where(
      and(
        eq(aiSuggestions.accountId, accountId),
        eq(aiSuggestions.status, "pending"),
        eq(aiSuggestions.isDismissed, false)
      )
    )
    .orderBy(desc(aiSuggestions.generatedAt))
    .limit(limit);
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
  await db.insert(aiSuggestions).values({ ...data, expiresAt, status: "pending" });
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
  opts?: { rejectionReason?: string; metricsSnapshot?: Record<string, number> }
) {
  const db = await getDb();
  if (!db) return;
  const now = new Date();
  const monitorUntil = status === "applied" ? new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) : null;
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
  console.log(`[DB] Force-updated accessToken for all active accounts`);
  return result;
}
