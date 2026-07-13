// READ-ONLY: confirma o banco (mascarado), conta tabelas e mostra se as 3
// finance_* já existem. Não altera NADA. Uso: node scripts/probe-finance.mjs
import mysql from "mysql2/promise";

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL não definida."); process.exit(1); }
console.log("DB:", url.replace(/(mysql:\/\/[^:]+):[^@]+@/, "$1:*@"));

const conn = await mysql.createConnection(url);
try {
  const [rows] = await conn.query(
    "SELECT table_name AS t FROM information_schema.tables WHERE table_schema = DATABASE() ORDER BY table_name"
  );
  const names = rows.map((r) => r.t);
  const finance = names.filter((n) => String(n).startsWith("finance_"));
  console.log(`Total de tabelas no schema: ${names.length}`);
  console.log(`Tabelas finance_* existentes: ${finance.length ? finance.join(", ") : "NENHUMA (serão criadas)"}`);
} finally {
  await conn.end();
}
