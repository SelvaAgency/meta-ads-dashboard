/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Selva Spaces — verificação rápida de usuários/roles (pós-deploy)
 * ─────────────────────────────────────────────────────────────────────────────
 *  Lista contagens e roles atuais para conferir que nada foi alterado após um
 *  deploy. NÃO mostra passwordHash, tokens nem segredos.
 *
 *  Uso: npm run users:audit
 * ─────────────────────────────────────────────────────────────────────────────
 */
import "dotenv/config";
import { drizzle } from "drizzle-orm/mysql2";
import { users } from "../drizzle/schema";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL não configurada.");
    process.exit(1);
  }
  const db = drizzle(process.env.DATABASE_URL);
  const rows = await db
    .select({ name: users.name, email: users.email, role: users.role, active: users.active })
    .from(users)
    .orderBy(users.role, users.name);

  const activeBy = (r: string) => rows.filter((u) => u.role === r && u.active).length;
  const inactive = rows.filter((u) => !u.active).length;

  console.log(`\nUsuários — total: ${rows.length}`);
  console.log(`Ativos → admin: ${activeBy("admin")} · developer: ${activeBy("developer")} · user: ${activeBy("user")}`);
  if (inactive) console.log(`Inativos: ${inactive}`);
  console.log("");

  const head = ["Nome", "E-mail", "Role", "Status"];
  const table = rows.map((u) => [u.name ?? "?", u.email ?? "?", u.role, u.active ? "ativo" : "inativo"]);
  const widths = head.map((_, c) => Math.max(head[c].length, ...table.map((r) => r[c].length)));
  const line = (r: string[]) => r.map((cell, c) => cell.padEnd(widths[c])).join(" | ");
  console.log(line(head));
  console.log(widths.map((w) => "-".repeat(w)).join("-+-"));
  for (const r of table) console.log(line(r));
  console.log("\n(Não exibe passwordHash, tokens ou segredos.)\n");
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
