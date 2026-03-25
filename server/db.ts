import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
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
  type InsertAiSuggestion,
  type InsertAlert,
  type InsertAnomaly,
  type InsertCampaign,
  type InsertCampaignMetrics,
  type InsertMetaAdAccount,
  type InsertScheduledReport,
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

export async function getMetaAdAccountsByUserId(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(metaAdAccounts)
    .where(and(eq(metaAdAccounts.userId, userId), eq(metaAdAccounts.isActive, true)))
    .orderBy(desc(metaAdAccounts.createdAt));
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

export async function upsertCampaign(data: InsertCampaign) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db
    .insert(campaigns)
    .values(data)
    .onDuplicateKeyUpdate({
      set: {
        name: data.name,
        status: data.status,
        objective: data.objective,
        dailyBudget: data.dailyBudget,
        lifetimeBudget: data.lifetimeBudget,
        stopTime: data.stopTime,
        updatedAt: new Date(),
      },
    });
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
      avgRoas: sql<number>`AVG(${campaignMetrics.roas})`,
      avgCpa: sql<number>`AVG(${campaignMetrics.cpa})`,
      avgCtr: sql<number>`AVG(${campaignMetrics.ctr})`,
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
  return db
    .select({
      campaignId: campaignMetrics.campaignId,
      campaignName: campaigns.name,
      campaignStatus: campaigns.status,
      totalSpend: sql<number>`SUM(${campaignMetrics.spend})`,
      totalImpressions: sql<number>`SUM(${campaignMetrics.impressions})`,
      totalClicks: sql<number>`SUM(${campaignMetrics.clicks})`,
      totalConversions: sql<number>`SUM(${campaignMetrics.conversions})`,
      totalConversionValue: sql<number>`SUM(${campaignMetrics.conversionValue})`,
      avgRoas: sql<number>`AVG(${campaignMetrics.roas})`,
      avgCpa: sql<number>`AVG(${campaignMetrics.cpa})`,
      avgCtr: sql<number>`AVG(${campaignMetrics.ctr})`,
    })
    .from(campaignMetrics)
    .innerJoin(campaigns, eq(campaignMetrics.campaignId, campaigns.id))
    .where(
      and(
        eq(campaignMetrics.accountId, accountId),
        gte(campaignMetrics.date, startDate),
        lte(campaignMetrics.date, endDate)
      )
    )
    .groupBy(campaignMetrics.campaignId, campaigns.name, campaigns.status)
    .orderBy(desc(sql`SUM(${campaignMetrics.spend})`));
}

export async function upsertCampaignMetrics(data: InsertCampaignMetrics) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
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
      },
    });
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

// ─── AI Suggestions ───────────────────────────────────────────────────────────

export async function getSuggestionsByAccountId(accountId: number, limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(aiSuggestions)
    .where(and(eq(aiSuggestions.accountId, accountId), eq(aiSuggestions.isDismissed, false)))
    .orderBy(desc(aiSuggestions.generatedAt))
    .limit(limit);
}

export async function createAiSuggestion(data: InsertAiSuggestion) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(aiSuggestions).values(data);
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
  return db
    .select()
    .from(alerts)
    .where(eq(alerts.userId, userId))
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

export async function createAlert(data: InsertAlert) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(alerts).values(data);
}

export async function markAlertRead(id: number, userId: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(alerts)
    .set({ isRead: true })
    .where(and(eq(alerts.id, id), eq(alerts.userId, userId)));
}

export async function markAllAlertsRead(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(alerts).set({ isRead: true }).where(eq(alerts.userId, userId));
}
