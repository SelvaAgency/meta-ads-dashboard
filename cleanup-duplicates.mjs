import { drizzle } from "drizzle-orm/mysql2";
import { sql } from "drizzle-orm";
import dotenv from "dotenv";

dotenv.config();

const db = drizzle(process.env.DATABASE_URL);

async function cleanupDuplicates() {
  console.log("🧹 Iniciando limpeza de duplicatas...\n");

  try {
    // Limpar anomalias duplicadas
    console.log("🔍 Limpando anomalias duplicadas...");
    const anomaliesResult = await db.execute(sql`
      DELETE a1 FROM anomalies a1
      INNER JOIN anomalies a2
        ON a1.accountId = a2.accountId
        AND COALESCE(a1.campaignId, 0) = COALESCE(a2.campaignId, 0)
        AND a1.type = a2.type
        AND COALESCE(a1.metricName, '') = COALESCE(a2.metricName, '')
        AND a1.isResolved = false
        AND a2.isResolved = false
        AND a1.id < a2.id
    `);
    
    const anomaliesDeleted = anomaliesResult?.[0]?.affectedRows ?? 0;
    console.log(`✅ ${anomaliesDeleted} anomalias duplicadas removidas\n`);

    // Limpar alertas duplicados
    console.log("🔍 Limpando alertas duplicados...");
    const alertsResult = await db.execute(sql`
      DELETE a1 FROM alerts a1
      INNER JOIN alerts a2
        ON a1.accountId = a2.accountId
        AND a1.type = a2.type
        AND a1.title = a2.title
        AND a1.isRead = false
        AND a2.isRead = false
        AND a1.id < a2.id
    `);
    
    const alertsDeleted = alertsResult?.[0]?.affectedRows ?? 0;
    console.log(`✅ ${alertsDeleted} alertas duplicados removidos\n`);

    console.log("🎉 Limpeza concluída com sucesso!");
    console.log(`Total de registros removidos: ${anomaliesDeleted + alertsDeleted}`);
    
    process.exit(0);
  } catch (error) {
    console.error("❌ Erro durante limpeza:", error);
    process.exit(1);
  }
}

cleanupDuplicates();
