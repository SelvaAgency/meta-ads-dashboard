/**
 * dashboardBuilderDb.ts — Query helpers para o módulo Dashboard Builder de Tráfego Pago.
 * Módulo independente — não interfere com nenhuma funcionalidade existente.
 */
import { desc, eq, and } from "drizzle-orm";
import { getDb } from "./db";
import { dashboardReports, type InsertDashboardReport } from "../drizzle/schema";

export async function createDashboardReport(data: InsertDashboardReport) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(dashboardReports).values(data);
  return result;
}

export async function getDashboardReportsByUserId(userId: number, limit = 20) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(dashboardReports)
    .where(eq(dashboardReports.userId, userId))
    .orderBy(desc(dashboardReports.createdAt))
    .limit(limit);
}

export async function getDashboardReportById(id: number, userId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(dashboardReports)
    .where(and(eq(dashboardReports.id, id), eq(dashboardReports.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function updateDashboardReport(
  id: number,
  data: Partial<{
    platform: string;
    reportJson: string;
    pdfUrl: string;
    status: "PENDING" | "PROCESSING" | "DONE" | "ERROR";
    errorMessage: string;
  }>
) {
  const db = await getDb();
  if (!db) return;
  await db.update(dashboardReports).set(data).where(eq(dashboardReports.id, id));
}

export async function deleteDashboardReport(id: number, userId: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .delete(dashboardReports)
    .where(and(eq(dashboardReports.id, id), eq(dashboardReports.userId, userId)));
}
