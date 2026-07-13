/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Selva Spaces — export/backup seguro de usuários
 * ─────────────────────────────────────────────────────────────────────────────
 *  Exporta os colaboradores para backups/users-YYYY-MM-DD-HH-mm.json ANTES de
 *  qualquer operação de risco (ex.: seed --force-profile). NUNCA exporta
 *  passwordHash, tokens ou segredos — apenas dados de perfil/administrativos.
 *
 *  Uso: npm run users:export
 *  Reutilizado pelo seed (import { exportUsers }).
 * ─────────────────────────────────────────────────────────────────────────────
 */
import "dotenv/config";
import { drizzle } from "drizzle-orm/mysql2";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { users } from "../drizzle/schema";

type DB = ReturnType<typeof drizzle>;

/** Exporta usuários (whitelist) para um JSON e devolve o caminho do arquivo. */
export async function exportUsers(db: DB, outDir = "backups"): Promise<string> {
  // Whitelist explícita — passwordHash/loginMethod/openId de segredo NÃO entram.
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      jobTitle: users.jobTitle,
      birthdayDay: users.birthdayDay,
      birthdayMonth: users.birthdayMonth,
      active: users.active,
      mustChangePassword: users.mustChangePassword,
      avatarKey: users.avatarKey,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    })
    .from(users)
    .orderBy(users.id);

  const now = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}-${p(now.getHours())}-${p(now.getMinutes())}`;
  mkdirSync(outDir, { recursive: true });
  const file = resolve(outDir, `users-${stamp}.json`);
  writeFileSync(file, JSON.stringify({ exportedAt: now.toISOString(), count: rows.length, users: rows }, null, 2), "utf8");
  return file;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL não configurada.");
    process.exit(1);
  }
  const db = drizzle(process.env.DATABASE_URL);
  const file = await exportUsers(db);
  console.log(`Backup de usuários salvo em: ${file} (sem passwordHash/tokens/segredos).`);
  process.exit(0);
}

// Só executa como CLI direto — não quando importado pelo seed.
if (process.argv[1] && process.argv[1].endsWith("export-users.ts")) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
