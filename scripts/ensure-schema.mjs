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

    // 10) Controle Financeiro (área admin). Apenas CRIA as 3 tabelas — nunca
    //     altera/dropa nada. Valores em centavos (int). `mes` = 'YYYY-MM'.
    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`finance_pnl_entries\` (
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
      )
    `);
    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`finance_reembolsos\` (
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
      )
    `);
    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`finance_retiradas\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`mes\` VARCHAR(7) NOT NULL,
        \`descricao\` VARCHAR(120) NOT NULL,
        \`valorCents\` INT NOT NULL,
        \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX \`idx_retir_mes\` (\`mes\`)
      )
    `);
    console.log("[ensure-schema] ok  · tabelas finance_* garantidas");

    // 11) Financeiro v2: clientes (tags de receita) + coluna clienteId no P&L.
    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`finance_clientes\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`nome\` VARCHAR(120) NOT NULL UNIQUE,
        \`cor\` VARCHAR(9) NULL,
        \`ativo\` BOOLEAN NOT NULL DEFAULT TRUE,
        \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    // CREATE TABLE IF NOT EXISTS não adiciona coluna → checa e faz ALTER se faltar.
    if (!(await columnExists(conn, "finance_pnl_entries", "clienteId"))) {
      await conn.query(
        "ALTER TABLE `finance_pnl_entries` ADD COLUMN `clienteId` INT NULL, ADD INDEX `idx_pnl_cliente` (`clienteId`)",
      );
      console.log("[ensure-schema] ok  · finance_pnl_entries.clienteId adicionada");
    } else {
      console.log("[ensure-schema] ok  · finance_pnl_entries.clienteId já existe");
    }
    console.log("[ensure-schema] ok  · finance_clientes garantida");

    // 12) Financeiro v4: recorrência + projetos + colunas de ledger no P&L.
    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`finance_recorrencia\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`clienteId\` INT NOT NULL,
        \`valorCents\` INT NOT NULL,
        \`diaVencimento\` INT NULL,
        \`mesInicio\` VARCHAR(7) NOT NULL,
        \`ativo\` BOOLEAN NOT NULL DEFAULT TRUE,
        \`churnMes\` VARCHAR(7) NULL,
        \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX \`idx_rec_cliente\` (\`clienteId\`), INDEX \`idx_rec_ativo\` (\`ativo\`)
      )
    `);
    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`finance_projetos\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`clienteId\` INT NULL,
        \`nome\` VARCHAR(255) NOT NULL,
        \`valorTotalCents\` INT NOT NULL,
        \`numParcelas\` INT NOT NULL,
        \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    // Colunas de ledger no P&L (idempotente — só adiciona se faltar).
    const pnlCols = [
      { name: "vencimento", ddl: "ADD COLUMN `vencimento` DATE NULL" },
      { name: "vencimentoOriginal", ddl: "ADD COLUMN `vencimentoOriginal` DATE NULL" },
      { name: "origem", ddl: "ADD COLUMN `origem` ENUM('MANUAL','RECORRENCIA','PROJETO') NOT NULL DEFAULT 'MANUAL'" },
      { name: "recorrenciaId", ddl: "ADD COLUMN `recorrenciaId` INT NULL" },
      { name: "projetoId", ddl: "ADD COLUMN `projetoId` INT NULL" },
      { name: "parcelaNum", ddl: "ADD COLUMN `parcelaNum` INT NULL" },
      { name: "parcelaTotal", ddl: "ADD COLUMN `parcelaTotal` INT NULL" },
      { name: "reembolsoPendente", ddl: "ADD COLUMN `reembolsoPendente` BOOLEAN NOT NULL DEFAULT FALSE" },
      { name: "subcategoria", ddl: "ADD COLUMN `subcategoria` VARCHAR(24) NULL" },
    ];
    for (const c of pnlCols) {
      if (!(await columnExists(conn, "finance_pnl_entries", c.name))) {
        await conn.query(`ALTER TABLE \`finance_pnl_entries\` ${c.ddl}`);
        console.log(`[ensure-schema] ok  · finance_pnl_entries.${c.name} adicionada`);
      }
    }
    // Ajustes 4 — retirada conciliada (espelha finance_reembolsos.reembolsado).
    if (!(await columnExists(conn, "finance_retiradas", "realizado"))) {
      await conn.query("ALTER TABLE `finance_retiradas` ADD COLUMN `realizado` BOOLEAN NOT NULL DEFAULT FALSE");
      console.log("[ensure-schema] ok  · finance_retiradas.realizado adicionada");
    }
    // Índices de ledger (idempotente via checagem em information_schema.statistics).
    for (const idx of [{ name: "idx_pnl_vencimento", col: "vencimento" }, { name: "idx_pnl_origem", col: "origem" }]) {
      const [ix] = await conn.query(
        "SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'finance_pnl_entries' AND index_name = ? LIMIT 1",
        [idx.name],
      );
      if (ix.length === 0) await conn.query(`ALTER TABLE \`finance_pnl_entries\` ADD INDEX \`${idx.name}\` (\`${idx.col}\`)`);
    }
    console.log("[ensure-schema] ok  · finance_recorrencia / finance_projetos / colunas de ledger garantidas");

    // 13) Financeiro v4.1: recorrência de despesa (colunas + clienteId nullable).
    const recCols = [
      { name: "natureza", ddl: "ADD COLUMN `natureza` ENUM('RECEITA','DESPESA') NOT NULL DEFAULT 'RECEITA'" },
      { name: "descricao", ddl: "ADD COLUMN `descricao` VARCHAR(255) NULL" },
      { name: "tipoEntry", ddl: "ADD COLUMN `tipoEntry` VARCHAR(30) NULL" },
      { name: "estimativa", ddl: "ADD COLUMN `estimativa` BOOLEAN NOT NULL DEFAULT FALSE" },
      { name: "vencimentoMesSeguinte", ddl: "ADD COLUMN `vencimentoMesSeguinte` BOOLEAN NOT NULL DEFAULT FALSE" },
    ];
    for (const c of recCols) {
      if (!(await columnExists(conn, "finance_recorrencia", c.name))) {
        await conn.query(`ALTER TABLE \`finance_recorrencia\` ${c.ddl}`);
        console.log(`[ensure-schema] ok  · finance_recorrencia.${c.name} adicionada`);
      }
    }
    // clienteId → NULLABLE (só altera se ainda for NOT NULL).
    const [nn] = await conn.query(
      "SELECT IS_NULLABLE FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'finance_recorrencia' AND column_name = 'clienteId'",
    );
    if (nn.length && nn[0].IS_NULLABLE === "NO") {
      await conn.query("ALTER TABLE `finance_recorrencia` MODIFY COLUMN `clienteId` INT NULL");
      console.log("[ensure-schema] ok  · finance_recorrencia.clienteId agora nullable");
    }
    const [nix] = await conn.query(
      "SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'finance_recorrencia' AND index_name = 'idx_rec_natureza' LIMIT 1",
    );
    if (nix.length === 0) await conn.query("ALTER TABLE `finance_recorrencia` ADD INDEX `idx_rec_natureza` (`natureza`)");
    console.log("[ensure-schema] ok  · finance_recorrencia (despesa) garantida");

    // 14) Financeiro v6: meses fechados (trava de edição).
    await conn.query(`CREATE TABLE IF NOT EXISTS \`finance_meses_fechados\` (
      \`id\` INT NOT NULL AUTO_INCREMENT,
      \`mes\` VARCHAR(7) NOT NULL,
      \`fechadoEm\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`fechadoPor\` INT NULL,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`uq_mes_fechado\` (\`mes\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    console.log("[ensure-schema] ok  · finance_meses_fechados garantida");

    // 15) Sistema de notificações (Performance + Financeiro) — tudo aditivo.
    // alerts.accountId precisa aceitar NULL: notificação financeira não tem conta de mídia.
    const [accNull] = await conn.query(
      "SELECT IS_NULLABLE FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'alerts' AND column_name = 'accountId'",
    );
    if (accNull.length && accNull[0].IS_NULLABLE === "NO") {
      await conn.query("ALTER TABLE `alerts` MODIFY COLUMN `accountId` INT NULL");
      console.log("[ensure-schema] ok  · alerts.accountId agora nullable");
    }
    const alertCols = [
      { name: "dominio", ddl: "ADD COLUMN `dominio` ENUM('PERFORMANCE','FINANCEIRO') NOT NULL DEFAULT 'PERFORMANCE'" },
      { name: "dedupKey", ddl: "ADD COLUMN `dedupKey` VARCHAR(180) NULL" },
    ];
    for (const c of alertCols) {
      if (!(await columnExists(conn, "alerts", c.name))) {
        await conn.query(`ALTER TABLE \`alerts\` ${c.ddl}`);
        console.log(`[ensure-schema] ok  · alerts.${c.name} adicionada`);
      }
    }
    // Novos valores do enum alerts.type (MODIFY é idempotente: reescreve a lista completa).
    const [typeCol] = await conn.query(
      "SELECT COLUMN_TYPE FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'alerts' AND column_name = 'type'",
    );
    if (typeCol.length && !String(typeCol[0].COLUMN_TYPE).includes("FINANCE_OVERDUE")) {
      await conn.query(
        "ALTER TABLE `alerts` MODIFY COLUMN `type` ENUM('ANOMALY','REPORT','SYNC_ERROR','BUDGET_WARNING','CAMPAIGN_PAUSED','PAYMENT_FAILED','AD_REJECTED','AD_ERROR','PAGE_UNLINKED','INSTAGRAM_UNLINKED','PIXEL_ERROR','ADSET_NO_DELIVERY','SUGGESTION_APPLIED','EXPERIMENT_UPDATE','SYNC_COMPLETE','DAILY_BRIEFING','WEEKLY_REPORT','FINANCE_OVERDUE') NOT NULL",
      );
      console.log("[ensure-schema] ok  · alerts.type expandido (DAILY_BRIEFING/WEEKLY_REPORT/FINANCE_OVERDUE)");
    }
    // Índices de leitura do sino/AlertsPage (a tabela não tinha nenhum além da PK).
    for (const idx of [
      { name: "idx_alerts_user_read", cols: "`userId`, `isRead`" },
      { name: "idx_alerts_dominio", cols: "`dominio`" },
      { name: "idx_alerts_dedup", cols: "`dedupKey`" },
      { name: "idx_alerts_created", cols: "`createdAt`" },
    ]) {
      const [ix] = await conn.query(
        "SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'alerts' AND index_name = ? LIMIT 1",
        [idx.name],
      );
      if (ix.length === 0) {
        await conn.query(`ALTER TABLE \`alerts\` ADD INDEX \`${idx.name}\` (${idx.cols})`);
        console.log(`[ensure-schema] ok  · alerts.${idx.name} criado`);
      }
    }
    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`notification_prefs\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`userId\` INT NOT NULL,
        \`tipo\` VARCHAR(40) NOT NULL,
        \`inApp\` BOOLEAN NOT NULL DEFAULT TRUE,
        \`email\` BOOLEAN NOT NULL DEFAULT FALSE,
        \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_notif_pref_user_tipo\` (\`userId\`, \`tipo\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    console.log("[ensure-schema] ok  · notification_prefs garantida");

    // 16) Hub de notificações pessoais: tarefas (Trello), comunicados, aniversários.
    const [domCol] = await conn.query(
      "SELECT COLUMN_TYPE FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'alerts' AND column_name = 'dominio'",
    );
    if (domCol.length && !String(domCol[0].COLUMN_TYPE).includes("COMUNICADO")) {
      await conn.query("ALTER TABLE `alerts` MODIFY COLUMN `dominio` ENUM('PERFORMANCE','FINANCEIRO','TAREFAS','COMUNICADO') NOT NULL DEFAULT 'PERFORMANCE'");
      console.log("[ensure-schema] ok  · alerts.dominio expandido (TAREFAS/COMUNICADO)");
    }
    const [typeCol2] = await conn.query(
      "SELECT COLUMN_TYPE FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'alerts' AND column_name = 'type'",
    );
    if (typeCol2.length && !String(typeCol2[0].COLUMN_TYPE).includes("TRELLO_DUE")) {
      await conn.query(
        "ALTER TABLE `alerts` MODIFY COLUMN `type` ENUM('ANOMALY','REPORT','SYNC_ERROR','BUDGET_WARNING','CAMPAIGN_PAUSED','PAYMENT_FAILED','AD_REJECTED','AD_ERROR','PAGE_UNLINKED','INSTAGRAM_UNLINKED','PIXEL_ERROR','ADSET_NO_DELIVERY','SUGGESTION_APPLIED','EXPERIMENT_UPDATE','SYNC_COMPLETE','DAILY_BRIEFING','WEEKLY_REPORT','FINANCE_OVERDUE','TRELLO_DUE','TRELLO_RECONNECT','COMUNICADO','BIRTHDAY') NOT NULL",
      );
      console.log("[ensure-schema] ok  · alerts.type expandido (TRELLO_DUE/TRELLO_RECONNECT/COMUNICADO/BIRTHDAY)");
    }
    if (!(await columnExists(conn, "notification_prefs", "emailModo"))) {
      await conn.query("ALTER TABLE `notification_prefs` ADD COLUMN `emailModo` VARCHAR(10) NOT NULL DEFAULT 'off'");
      // Quem já tinha email=1 gravado continua recebendo na hora.
      await conn.query("UPDATE `notification_prefs` SET `emailModo` = 'hora' WHERE `email` = 1");
      console.log("[ensure-schema] ok  · notification_prefs.emailModo adicionada");
    }
    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`comunicados\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`autorUserId\` INT NOT NULL,
        \`titulo\` VARCHAR(180) NOT NULL,
        \`corpo\` TEXT NOT NULL,
        \`publico\` ENUM('TODOS','ROLE','PESSOAS') NOT NULL DEFAULT 'TODOS',
        \`alvoRole\` VARCHAR(20) NULL,
        \`alvoUserIds\` JSON NULL,
        \`fixado\` BOOLEAN NOT NULL DEFAULT FALSE,
        \`enviados\` INT NOT NULL DEFAULT 0,
        \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        KEY \`idx_comunicado_criado\` (\`createdAt\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    console.log("[ensure-schema] ok  · comunicados garantida");

    // 17) Coordenadores de cliente. `role` (permissão) fica intacta; operationalRole
    // é responsabilidade operacional e nasce como collaborator para todo mundo.
    if (!(await columnExists(conn, "users", "operationalRole"))) {
      await conn.query("ALTER TABLE `users` ADD COLUMN `operationalRole` ENUM('collaborator','coordinator') NOT NULL DEFAULT 'collaborator'");
      console.log("[ensure-schema] ok  · users.operationalRole adicionada (default collaborator)");
    }
    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`client_coordinators\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`accountId\` INT NOT NULL,
        \`userId\` INT NOT NULL,
        \`createdByUserId\` INT NULL,
        \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_client_coord\` (\`accountId\`, \`userId\`),
        KEY \`idx_client_coord_user\` (\`userId\`),
        KEY \`idx_client_coord_account\` (\`accountId\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    console.log("[ensure-schema] ok  · client_coordinators garantida");

    // Público de comunicado por função operacional (coordenadores/colaboradores).
    const [pubCol] = await conn.query(
      "SELECT COLUMN_TYPE FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'comunicados' AND column_name = 'publico'",
    );
    if (pubCol.length && !String(pubCol[0].COLUMN_TYPE).includes("FUNCAO")) {
      await conn.query("ALTER TABLE `comunicados` MODIFY COLUMN `publico` ENUM('TODOS','ROLE','FUNCAO','PESSOAS') NOT NULL DEFAULT 'TODOS'");
      console.log("[ensure-schema] ok  · comunicados.publico expandido (FUNCAO)");
    }
    if (!(await columnExists(conn, "comunicados", "alvoFuncao"))) {
      await conn.query("ALTER TABLE `comunicados` ADD COLUMN `alvoFuncao` VARCHAR(20) NULL");
      console.log("[ensure-schema] ok  · comunicados.alvoFuncao adicionada");
    }

    // 18) Microsoft Clarity por cliente. Token cifrado (AES-256-GCM), nunca em claro.
    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`client_clarity_settings\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`accountId\` INT NOT NULL,
        \`enabled\` BOOLEAN NOT NULL DEFAULT FALSE,
        \`projectId\` VARCHAR(64) NULL,
        \`encryptedApiToken\` TEXT NULL,
        \`domain\` VARCHAR(255) NULL,
        \`importantUrlsJson\` JSON NULL,
        \`notes\` TEXT NULL,
        \`apiCallsDate\` VARCHAR(10) NULL,
        \`apiCallsCount\` INT NOT NULL DEFAULT 0,
        \`lastSyncAt\` TIMESTAMP NULL,
        \`lastSyncStatus\` VARCHAR(16) NULL,
        \`lastSyncError\` VARCHAR(255) NULL,
        \`updatedByUserId\` INT NULL,
        \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_clarity_account\` (\`accountId\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`client_clarity_snapshots\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`accountId\` INT NOT NULL,
        \`dia\` VARCHAR(10) NOT NULL,
        \`dias\` INT NOT NULL DEFAULT 1,
        \`rangeStart\` TIMESTAMP NULL,
        \`rangeEnd\` TIMESTAMP NULL,
        \`metricsJson\` JSON NULL,
        \`topPagesJson\` JSON NULL,
        \`sourcesJson\` JSON NULL,
        \`issuesJson\` JSON NULL,
        \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_clarity_snapshot\` (\`accountId\`, \`dia\`, \`dias\`),
        KEY \`idx_clarity_snap_conta_dia\` (\`accountId\`, \`dia\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    console.log("[ensure-schema] ok  · client_clarity_settings / client_clarity_snapshots garantidas");

    // 19) Contexto manual, notas e relatórios de site por cliente.
    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`client_context\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`accountId\` INT NOT NULL,
        \`objective\` TEXT NULL, \`offer\` TEXT NULL, \`audience\` TEXT NULL,
        \`importantPagesJson\` JSON NULL, \`conversionEventsJson\` JSON NULL,
        \`trackingNotes\` TEXT NULL, \`currentHypotheses\` TEXT NULL,
        \`constraints\` TEXT NULL, \`previousTests\` TEXT NULL, \`nextSteps\` TEXT NULL,
        \`updatedByUserId\` INT NULL,
        \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_client_context\` (\`accountId\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`client_notes\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`accountId\` INT NOT NULL,
        \`authorUserId\` INT NOT NULL,
        \`body\` TEXT NOT NULL,
        \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        KEY \`idx_client_notes_conta\` (\`accountId\`, \`createdAt\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`client_site_reports\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`accountId\` INT NOT NULL,
        \`rangeStart\` VARCHAR(10) NOT NULL,
        \`rangeEnd\` VARCHAR(10) NOT NULL,
        \`generatedByUserId\` INT NULL,
        \`reportJson\` JSON NULL,
        \`markdown\` TEXT NULL,
        \`fontesJson\` JSON NULL,
        \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        KEY \`idx_site_reports_conta\` (\`accountId\`, \`createdAt\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    console.log("[ensure-schema] ok  · client_context / client_notes / client_site_reports garantidas");
    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`client_chat_messages\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`accountId\` INT NOT NULL,
        \`userId\` INT NOT NULL,
        \`role\` ENUM('user','assistant') NOT NULL,
        \`content\` TEXT NOT NULL,
        \`fontesJson\` JSON NULL,
        \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        KEY \`idx_chat_conta\` (\`accountId\`, \`createdAt\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    console.log("[ensure-schema] ok  · client_chat_messages garantida");

    // 21) Configuração do resumo diário (horário/ativo sai do código e vai p/ o banco).
    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`daily_digest_settings\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`autoEnabled\` BOOLEAN NOT NULL DEFAULT TRUE,
        \`defaultTime\` VARCHAR(5) NOT NULL DEFAULT '09:25',
        \`timezone\` VARCHAR(40) NOT NULL DEFAULT 'America/Sao_Paulo',
        \`updatedByUserId\` INT NULL,
        \`updatedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await conn.query("INSERT IGNORE INTO `daily_digest_settings` (`id`) VALUES (1)");
    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`daily_digest_overrides\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`dia\` VARCHAR(10) NOT NULL,
        \`enabled\` BOOLEAN NOT NULL DEFAULT TRUE,
        \`timeOverride\` VARCHAR(5) NULL,
        \`excludedUserIdsJson\` JSON NULL,
        \`excludedClientIdsJson\` JSON NULL,
        \`createdByUserId\` INT NULL,
        \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_digest_override_dia\` (\`dia\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    console.log("[ensure-schema] ok  · daily_digest_settings / daily_digest_overrides garantidas");

    // 20) Alertas de site (Clarity): domínio SITE + tipos novos.
    const [domCol2] = await conn.query(
      "SELECT COLUMN_TYPE FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'alerts' AND column_name = 'dominio'",
    );
    if (domCol2.length && !String(domCol2[0].COLUMN_TYPE).includes("'SITE'")) {
      await conn.query("ALTER TABLE `alerts` MODIFY COLUMN `dominio` ENUM('PERFORMANCE','FINANCEIRO','TAREFAS','COMUNICADO','SITE') NOT NULL DEFAULT 'PERFORMANCE'");
      console.log("[ensure-schema] ok  · alerts.dominio expandido (SITE)");
    }
    const [typeCol3] = await conn.query(
      "SELECT COLUMN_TYPE FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'alerts' AND column_name = 'type'",
    );
    if (typeCol3.length && !String(typeCol3[0].COLUMN_TYPE).includes("CLARITY_ISSUE")) {
      await conn.query(
        "ALTER TABLE `alerts` MODIFY COLUMN `type` ENUM('ANOMALY','REPORT','SYNC_ERROR','BUDGET_WARNING','CAMPAIGN_PAUSED','PAYMENT_FAILED','AD_REJECTED','AD_ERROR','PAGE_UNLINKED','INSTAGRAM_UNLINKED','PIXEL_ERROR','ADSET_NO_DELIVERY','SUGGESTION_APPLIED','EXPERIMENT_UPDATE','SYNC_COMPLETE','DAILY_BRIEFING','WEEKLY_REPORT','FINANCE_OVERDUE','TRELLO_DUE','TRELLO_RECONNECT','COMUNICADO','BIRTHDAY','CLARITY_ISSUE','TRACKING_PROBLEM') NOT NULL",
      );
      console.log("[ensure-schema] ok  · alerts.type expandido (CLARITY_ISSUE/TRACKING_PROBLEM)");
    }

    console.log("[ensure-schema] concluído com sucesso.");
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error("[ensure-schema] FALHOU:", err?.message ?? err);
  process.exit(1);
});
