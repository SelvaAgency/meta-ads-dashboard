/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Selva Spaces — seed de colaboradores iniciais
 * ─────────────────────────────────────────────────────────────────────────────
 *  Cria/atualiza os colaboradores pelo e-mail e gera senhas temporárias fortes
 *  (fruta + número + especial + "Perene"). O banco guarda SOMENTE o hash.
 *  As senhas em texto aparecem UMA vez no terminal — nunca são persistidas.
 *
 *  Uso:
 *    npm run seed:employees
 *        Cria quem não existe; imprime senha só dos novos. NÃO reseta senhas.
 *    npm run seed:employees -- --reset-passwords
 *        Reseta a senha temporária de TODOS e imprime a tabela nova.
 *    npm run seed:employees -- --reset-password=email@selva.agency
 *        Reseta apenas um colaborador.
 *
 *  Regras: não commitar senhas, não salvar output em arquivo, sem endpoint de
 *  consulta de senha. Se perder uma senha, use --reset-password.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import "dotenv/config";
import { drizzle } from "drizzle-orm/mysql2";
import { eq } from "drizzle-orm";
import { scryptSync, randomBytes, randomInt } from "node:crypto";
import { users } from "../drizzle/schema";

type Role = "user" | "admin" | "developer";

const EMPLOYEES: { name: string; email: string; role: Role; day: number; month: number }[] = [
  { name: "Gihany Aiub",       email: "gihany@selva.agency",  role: "user",      day: 3,  month: 1 },
  { name: "Bruna Orsi",        email: "bruna@selva.agency",   role: "user",      day: 25, month: 1 },
  { name: "Felipe Machado",    email: "felipe@selva.agency",  role: "user",      day: 26, month: 1 },
  { name: "Guilherme Felberg", email: "felberg@selva.agency", role: "admin",     day: 6,  month: 4 },
  { name: "Nathan Yoles",      email: "nathan@selva.agency",  role: "admin",     day: 14, month: 5 },
  { name: "Wictor Melo",       email: "dev@selva.agency",     role: "developer", day: 3,  month: 6 },
  { name: "Matheus Bernoldi",  email: "bad@selva.agency",     role: "user",      day: 6,  month: 7 },
  { name: "Giulia Motta",      email: "giulia@selva.agency",  role: "user",      day: 8,  month: 8 },
  { name: "Elizabeth",         email: "beth@selva.agency",    role: "user",      day: 23, month: 8 },
  { name: "Rafael Affonso",    email: "rafael@selva.agency",  role: "user",      day: 21, month: 9 },
  { name: "Natalia Ritzmann",  email: "natalia@selva.agency", role: "user",      day: 30, month: 11 },
];

// ── senha temporária (idêntica ao server/_core/oauth.ts) ─────────────────────
const FRUITS = ["Manga","Kiwi","Caju","Pitaya","Cedro","Amora","Goiaba","Lichia","Jabuti","Pequi","Umbu","Graviola","Physalis","Nespera","Carambola","Bacuri"];
const SPECIALS = ["@","#","!","&"];
function generateTempPassword(): string {
  return `${FRUITS[randomInt(FRUITS.length)]}${randomInt(10, 100)}${SPECIALS[randomInt(SPECIALS.length)]}Perene`;
}
function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL não configurada.");
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const resetAll = args.includes("--reset-passwords");
  const resetOne = args.find((a) => a.startsWith("--reset-password="))?.split("=")[1]?.toLowerCase();
  // Por padrão o seed NÃO sobrescreve role/nome/aniversário de usuários já
  // existentes (a tabela users é a fonte da verdade; roles são geridos no admin).
  // Só reaplica o perfil da lista com a flag explícita --force-profile.
  const forceProfile = args.includes("--force-profile") || process.env.FORCE_EMPLOYEE_SEED === "true";

  const db = drizzle(process.env.DATABASE_URL);
  const printed: { name: string; email: string; role: Role; senha: string }[] = [];
  let created = 0, updated = 0, skipped = 0;

  for (const emp of EMPLOYEES) {
    const openId = emp.email.toLowerCase();
    const existing = (await db.select().from(users).where(eq(users.openId, openId)).limit(1))[0];

    if (!existing) {
      const temp = generateTempPassword();
      await db.insert(users).values({
        openId,
        email: emp.email,
        name: emp.name,
        role: emp.role,
        birthdayDay: emp.day,
        birthdayMonth: emp.month,
        passwordHash: hashPassword(temp),
        mustChangePassword: true,
        active: true,
        loginMethod: "email",
      });
      created++;
      printed.push({ name: emp.name, email: emp.email, role: emp.role, senha: temp });
      continue;
    }

    // Já existe → por PADRÃO não sobrescreve role/nome/aniversário (não reverte
    // mudanças feitas no admin). Só reaplica o perfil com --force-profile.
    if (forceProfile) {
      await db.update(users).set({
        name: emp.name,
        role: emp.role,
        birthdayDay: emp.day,
        birthdayMonth: emp.month,
      }).where(eq(users.id, existing.id));
      updated++;
    }

    const shouldReset = resetAll || resetOne === openId;
    if (shouldReset) {
      const temp = generateTempPassword();
      await db.update(users).set({ passwordHash: hashPassword(temp), mustChangePassword: true }).where(eq(users.id, existing.id));
      printed.push({ name: emp.name, email: emp.email, role: emp.role, senha: temp });
    } else {
      skipped++;
    }
  }

  // ── Saída ──────────────────────────────────────────────────────────────────
  console.log(`\nColaboradores — criados: ${created} · atualizados: ${updated} · senha inalterada: ${skipped}\n`);
  if (printed.length > 0) {
    const rows = [["Nome", "E-mail", "Role", "Senha temporária"], ...printed.map((p) => [p.name, p.email, p.role, p.senha])];
    const widths = rows[0].map((_, c) => Math.max(...rows.map((r) => r[c].length)));
    for (const [i, r] of rows.entries()) {
      console.log(r.map((cell, c) => cell.padEnd(widths[c])).join(" | "));
      if (i === 0) console.log(widths.map((w) => "-".repeat(w)).join("-+-"));
    }
    console.log("\n⚠️  Copie estas senhas agora. Elas não serão exibidas novamente.");
    console.log("⚠️  O banco armazena apenas o hash.");
    console.log("⚠️  Se perder uma senha, use: npm run seed:employees -- --reset-password=email@selva.agency");
  } else {
    console.log("Nenhuma senha nova gerada. Use --reset-passwords ou --reset-password=<email> para resetar.");
  }
  console.log("");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
