// Aplica SOMENTE a criação das 3 tabelas finance_* (CREATE TABLE IF NOT EXISTS).
// Não faz ALTER/DROP/RENAME e não toca em nenhuma outra tabela.
// Uso: DATABASE_URL=<url> node scripts/apply-finance-tables.mjs
import mysql from "mysql2/promise";

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL não definida."); process.exit(1); }
console.log("DB:", url.replace(/(mysql:\/\/[^:]+):[^@]+@/, "$1:*@"));

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS \`finance_pnl_entries\` (
    \`id\` INT AUTO_INCREMENT PRIMARY KEY,
    \`mes\` VARCHAR(7) NOT NULL,
    \`tipo\` ENUM('RECEITA_RECORRENTE','RECEITA_PONTUAL','DESPESA_RECORRENTE','DESPESA_IMPOSTO','DESPESA_PONTUAL','APORTE') NOT NULL,
    \`descricao\` VARCHAR(255) NOT NULL,
    \`valorCents\` INT NOT NULL,
    \`status\` ENUM('pago','pendente') NOT NULL DEFAULT 'pendente',
    \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    \`updatedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX \`idx_pnl_mes\` (\`mes\`),
    INDEX \`idx_pnl_tipo\` (\`tipo\`),
    INDEX \`idx_pnl_status\` (\`status\`)
  )`,
  `CREATE TABLE IF NOT EXISTS \`finance_reembolsos\` (
    \`id\` INT AUTO_INCREMENT PRIMARY KEY,
    \`mes\` VARCHAR(7) NOT NULL,
    \`categoria\` ENUM('PLATAFORMA_ANUNCIOS','OFFICE','EXTRAS') NOT NULL,
    \`descricao\` VARCHAR(255) NOT NULL,
    \`valorCents\` INT NOT NULL,
    \`quemPagou\` VARCHAR(120) NULL,
    \`reembolsado\` BOOLEAN NOT NULL DEFAULT FALSE,
    \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    \`updatedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX \`idx_reemb_mes\` (\`mes\`),
    INDEX \`idx_reemb_categoria\` (\`categoria\`)
  )`,
  `CREATE TABLE IF NOT EXISTS \`finance_retiradas\` (
    \`id\` INT AUTO_INCREMENT PRIMARY KEY,
    \`mes\` VARCHAR(7) NOT NULL,
    \`descricao\` VARCHAR(120) NOT NULL,
    \`valorCents\` INT NOT NULL,
    \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    \`updatedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX \`idx_retir_mes\` (\`mes\`)
  )`,
];

const conn = await mysql.createConnection(url);
try {
  for (const s of STATEMENTS) {
    await conn.query(s);
    console.log("[apply] ok ·", s.match(/finance_[a-z]+/)[0]);
  }
  console.log("[apply] concluído — 3 tabelas finance_* garantidas (nada mais tocado).");
} finally {
  await conn.end();
}
