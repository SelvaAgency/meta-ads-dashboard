/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  check-schema — diagnóstico do banco (somente leitura)
 * ─────────────────────────────────────────────────────────────────────────────
 *  Mostra QUAL banco o DATABASE_URL aponta e o estado real da tabela `users`
 *  (colunas + tipo do enum role). Rode com o MESMO DATABASE_URL do app para
 *  confirmar que migration e aplicação usam o mesmo banco:
 *    npm run db:check-schema
 *  (ou, no Railway, garantindo o env do serviço: `railway run npm run db:check-schema`)
 * ─────────────────────────────────────────────────────────────────────────────
 */
import mysql from "mysql2/promise";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("[check-schema] DATABASE_URL não definida.");
  process.exit(1);
}

const conn = await mysql.createConnection(url);
try {
  const [info] = await conn.query("SELECT DATABASE() AS db, @@hostname AS host, VERSION() AS version");
  console.log("Conexão:", info[0]);

  const [cols] = await conn.query(
    "SELECT COLUMN_NAME AS column_name, COLUMN_TYPE AS type, IS_NULLABLE AS nullable, COLUMN_DEFAULT AS `default` " +
    "FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' ORDER BY ORDINAL_POSITION",
  );
  console.log("\nColunas de `users`:");
  console.table(cols);

  const expected = ["jobTitle", "birthdayDay", "birthdayMonth", "mustChangePassword", "active"];
  const present = new Set(cols.map((c) => c.column_name));
  const missing = expected.filter((c) => !present.has(c));
  const roleType = cols.find((c) => c.column_name === "role")?.type ?? "";

  console.log("\nResumo:");
  console.log("  colunas novas faltando:", missing.length ? missing.join(", ") : "nenhuma ✅");
  console.log("  role aceita developer :", /'developer'/.test(roleType) ? "sim ✅" : "NÃO ❌");
} finally {
  await conn.end();
}
