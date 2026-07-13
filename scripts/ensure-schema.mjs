/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  ensure-schema — migration IDEMPOTENTE e segura (MySQL)
 * ─────────────────────────────────────────────────────────────────────────────
 *  Alinha a tabela `users` com o schema novo SEM recriar tabela e SEM apagar
 *  dados. Só adiciona colunas que faltam e amplia o enum de role se preciso.
 *  Pode rodar quantas vezes quiser.
 *
 *  Usa mysql2 (dependency de produção) e o MESMO DATABASE_URL do app — então
 *  roda exatamente no banco que a aplicação usa. Não depende de drizzle-kit
 *  (que é devDependency e some no build de produção).
 *
 *  Roda automaticamente antes do start (npm start) e também manualmente:
 *    npm run migrate:prod        (ou)  npm run db:ensure-schema
 * ─────────────────────────────────────────────────────────────────────────────
 */
import mysql from "mysql2/promise";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("[ensure-schema] DATABASE_URL não definida — abortando.");
  process.exit(1);
}

const COLUMNS = [
  { name: "jobTitle",           ddl: "ADD COLUMN `jobTitle` VARCHAR(255) NULL" },
  { name: "birthdayDay",        ddl: "ADD COLUMN `birthdayDay` INT NULL" },
  { name: "birthdayMonth",      ddl: "ADD COLUMN `birthdayMonth` INT NULL" },
  { name: "mustChangePassword", ddl: "ADD COLUMN `mustChangePassword` BOOLEAN NOT NULL DEFAULT 0" },
  { name: "active",             ddl: "ADD COLUMN `active` BOOLEAN NOT NULL DEFAULT 1" },
  { name: "avatarKey",          ddl: "ADD COLUMN `avatarKey` VARCHAR(512) NULL" },
];

async function columnExists(conn, table, column) {
  const [rows] = await conn.query(
    "SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1",
    [table, column],
  );
  return rows.length > 0;
}

async function main() {
  const conn = await mysql.createConnection(url);
  try {
    const [dbRows] = await conn.query("SELECT DATABASE() AS db");
    console.log(`[ensure-schema] Banco em uso: ${dbRows[0]?.db}`);

    // 1) Colunas aditivas (nullable / com default) — só adiciona se faltar.
    for (const col of COLUMNS) {
      if (await columnExists(conn, "users", col.name)) {
        console.log(`[ensure-schema] ok  · users.${col.name} já existe`);
        continue;
      }
      await conn.query(`ALTER TABLE \`users\` ${col.ddl}`);
      console.log(`[ensure-schema] +   · users.${col.name} adicionada`);
    }

    // 2) Enum role deve aceitar developer.
    const [roleRows] = await conn.query(
      "SELECT COLUMN_TYPE AS t FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'role' LIMIT 1",
    );
    const roleType = roleRows[0]?.t ?? "";
    if (!/'developer'/.test(roleType)) {
      await conn.query("ALTER TABLE `users` MODIFY COLUMN `role` ENUM('user','admin','developer') NOT NULL DEFAULT 'user'");
      console.log("[ensure-schema] +   · role enum atualizado para incluir 'developer'");
    } else {
      console.log("[ensure-schema] ok  · role enum já aceita 'developer'");
    }

    // 3) Tabela de integrações por usuário (Google Calendar etc.).
    //    CREATE TABLE IF NOT EXISTS é idempotente por natureza.
    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`user_integrations\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`userId\` INT NOT NULL,
        \`provider\` VARCHAR(64) NOT NULL,
        \`providerAccountId\` VARCHAR(64) NULL,
        \`providerUsername\` VARCHAR(255) NULL,
        \`providerAccountEmail\` VARCHAR(320) NULL,
        \`accessTokenEncrypted\` TEXT NULL,
        \`refreshTokenEncrypted\` TEXT NULL,
        \`expiresAt\` TIMESTAMP NULL,
        \`scopes\` TEXT NULL,
        \`active\` BOOLEAN NOT NULL DEFAULT 1,
        \`connectedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        \`disconnectedAt\` TIMESTAMP NULL,
        UNIQUE KEY \`uq_user_provider\` (\`userId\`, \`provider\`)
      )
    `);
    console.log("[ensure-schema] ok  · tabela user_integrations garantida");

    // Colunas novas em user_integrations (Trello) — para bancos que já tinham a
    // tabela criada antes (só do Google Calendar).
    for (const col of [
      { name: "providerAccountId", ddl: "ADD COLUMN `providerAccountId` VARCHAR(64) NULL" },
      { name: "providerUsername", ddl: "ADD COLUMN `providerUsername` VARCHAR(255) NULL" },
    ]) {
      if (await columnExists(conn, "user_integrations", col.name)) {
        console.log(`[ensure-schema] ok  · user_integrations.${col.name} já existe`);
        continue;
      }
      await conn.query(`ALTER TABLE \`user_integrations\` ${col.ddl}`);
      console.log(`[ensure-schema] +   · user_integrations.${col.name} adicionada`);
    }

    // 4) News bar persistente.
    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`news_items\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`text\` VARCHAR(500) NOT NULL,
        \`active\` BOOLEAN NOT NULL DEFAULT 1,
        \`sortOrder\` INT NOT NULL DEFAULT 0,
        \`createdByUserId\` INT NULL,
        \`updatedByUserId\` INT NULL,
        \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    console.log("[ensure-schema] ok  · tabela news_items garantida");

    // 5) SelvaTV persistente (imagens no storage).
    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`selvatv_items\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`title\` VARCHAR(255) NULL,
        \`imageKey\` VARCHAR(512) NOT NULL,
        \`storageProvider\` VARCHAR(32) NULL,
        \`active\` BOOLEAN NOT NULL DEFAULT 1,
        \`sortOrder\` INT NOT NULL DEFAULT 0,
        \`createdByUserId\` INT NULL,
        \`updatedByUserId\` INT NULL,
        \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    console.log("[ensure-schema] ok  · tabela selvatv_items garantida");

    // 6) Cofre de Acessos (clientes + itens + auditoria).
    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`access_clients\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`name\` VARCHAR(255) NOT NULL,
        \`slug\` VARCHAR(255) NOT NULL UNIQUE,
        \`isInternal\` BOOLEAN NOT NULL DEFAULT 0,
        \`active\` BOOLEAN NOT NULL DEFAULT 1,
        \`sortOrder\` INT NOT NULL DEFAULT 0,
        \`createdByUserId\` INT NULL,
        \`updatedByUserId\` INT NULL,
        \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`access_items\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`clientId\` INT NOT NULL,
        \`platform\` VARCHAR(120) NOT NULL,
        \`label\` VARCHAR(255) NULL,
        \`loginEmail\` VARCHAR(320) NULL,
        \`passwordEncrypted\` TEXT NOT NULL,
        \`url\` VARCHAR(1024) NULL,
        \`requiresCode\` BOOLEAN NOT NULL DEFAULT 0,
        \`codeType\` VARCHAR(32) NULL,
        \`notes\` TEXT NULL,
        \`tagsJson\` JSON NULL,
        \`active\` BOOLEAN NOT NULL DEFAULT 1,
        \`createdByUserId\` INT NULL,
        \`updatedByUserId\` INT NULL,
        \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX \`idx_access_items_client\` (\`clientId\`)
      )
    `);
    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`access_audit_logs\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`accessItemId\` INT NULL,
        \`clientId\` INT NULL,
        \`userId\` INT NOT NULL,
        \`action\` VARCHAR(40) NOT NULL,
        \`metadataJson\` JSON NULL,
        \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("[ensure-schema] ok  · tabelas de Acessos garantidas");

    // 7) Configurações simples (key-value) — slide "Você prefere?" etc.
    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`app_settings\` (
        \`settingKey\` VARCHAR(191) PRIMARY KEY,
        \`valueJson\` JSON NULL,
        \`updatedByUserId\` INT NULL,
        \`updatedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    console.log("[ensure-schema] ok  · tabela app_settings garantida");

    // 8) Votos do slide "Você prefere?" (1 voto por usuário).
    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`selvatv_poll_votes\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`userId\` INT NOT NULL UNIQUE,
        \`optionKey\` ENUM('left','right') NOT NULL,
        \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    console.log("[ensure-schema] ok  · tabela selvatv_poll_votes garantida");

    // 9) Auditoria de usuários (role/status/perfil). Só cria a tabela — NUNCA
    //    lê/altera dados de usuários existentes.
    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`user_audit_logs\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`actorUserId\` INT NOT NULL,
        \`targetUserId\` INT NOT NULL,
        \`action\` VARCHAR(40) NOT NULL,
        \`previousValue\` VARCHAR(255) NULL,
        \`newValue\` VARCHAR(255) NULL,
        \`metadataJson\` JSON NULL,
        \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("[ensure-schema] ok  · tabela user_audit_logs garantida");

    console.log("[ensure-schema] concluído com sucesso.");
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error("[ensure-schema] FALHOU:", err?.message ?? err);
  process.exit(1);
});
