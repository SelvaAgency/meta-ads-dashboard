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
  { name: "lastSeenAt",         ddl: "ADD COLUMN `lastSeenAt` TIMESTAMP NULL" },
  { name: "avatarKey",          ddl: "ADD COLUMN `avatarKey` VARCHAR(512) NULL" },
  // Grupo do Jornalzinho (gtm1 | gtm2 | todos | nenhum). NULL = sem recorte.
  { name: "jornalzinhoGrupo",   ddl: "ADD COLUMN `jornalzinhoGrupo` VARCHAR(16) NULL" },
];

async function columnExists(conn, table, column) {
  const [rows] = await conn.query(
    "SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1",
    [table, column],
  );
  return rows.length > 0;
}

async function tableExists(conn, table) {
  const [rows] = await conn.query(
    "SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1",
    [table],
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

    // 3.0.1) Verificação de saúde por integração (Gmail e futuras). "Conectado"
    //        é promessa do dia da autorização — consentimento revogado e refresh
    //        token expirado não avisam ninguém.
    for (const col of [
      { name: "lastCheckAt", ddl: "ADD COLUMN `lastCheckAt` TIMESTAMP NULL" },
      { name: "lastCheckStatus", ddl: "ADD COLUMN `lastCheckStatus` VARCHAR(12) NULL" },
      { name: "lastCheckError", ddl: "ADD COLUMN `lastCheckError` TEXT NULL" },
    ]) {
      if (await columnExists(conn, "user_integrations", col.name)) {
        console.log(`[ensure-schema] ok  · user_integrations.${col.name} já existe`);
        continue;
      }
      await conn.query(`ALTER TABLE \`user_integrations\` ${col.ddl}`);
      console.log(`[ensure-schema] +   · user_integrations.${col.name} adicionada`);
    }

    // 3.0.2) Auditoria de e-mail: com mais de um provider, "quem mandou" e
    //        "quanto demorou" deixam de ser dedutíveis do resto da linha.
    if (await tableExists(conn, "email_send_log")) {
      for (const col of [
        { name: "remetente", ddl: "ADD COLUMN `remetente` VARCHAR(320) NULL" },
        { name: "duracaoMs", ddl: "ADD COLUMN `duracaoMs` INT NULL" },
        // Sob qual regra de destinatários o envio (ou o bloqueio) aconteceu. A
        // regra muda entre fases; sem isto o histórico fica ambíguo.
        { name: "recipientMode", ddl: "ADD COLUMN `recipientMode` VARCHAR(16) NULL" },
      ]) {
        if (await columnExists(conn, "email_send_log", col.name)) {
          console.log(`[ensure-schema] ok  · email_send_log.${col.name} já existe`);
          continue;
        }
        await conn.query(`ALTER TABLE \`email_send_log\` ${col.ddl}`);
        console.log(`[ensure-schema] +   · email_send_log.${col.name} adicionada`);
      }
    }

    // 3.0.3) Foto própria do cliente do COFRE. Não reaproveita a do Tracker:
    //        "Santé" e "Carol Garrafa" são dois clientes aqui e uma conta de
    //        mídia lá, e há cliente com acesso que nunca teve acompanhamento.
    if (await tableExists(conn, "access_clients")) {
      if (await columnExists(conn, "access_clients", "pictureKey")) {
        console.log("[ensure-schema] ok  · access_clients.pictureKey já existe");
      } else {
        await conn.query("ALTER TABLE `access_clients` ADD COLUMN `pictureKey` VARCHAR(512) NULL");
        console.log("[ensure-schema] +   · access_clients.pictureKey adicionada");
      }
    }

    // 3.0.4) Preferência de clientes no Jornalzinho, por pessoa. Tabela própria
    //        (não client_coordinators): aquela significa responsabilidade e
    //        exige operationalRole=coordinator; esta é só filtro de e-mail.
    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`user_email_client_prefs\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`userId\` INT NOT NULL,
        \`accountId\` INT NOT NULL,
        \`enabled\` BOOLEAN NOT NULL DEFAULT 1,
        \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY \`uq_user_email_client\` (\`userId\`, \`accountId\`)
      )
    `);
    console.log("[ensure-schema] ok  · tabela user_email_client_prefs garantida");

    // 3.0.5) Cache do briefing segmentado (um texto por dia + conjunto de
    //        contas). Tabela separada: `daily_briefings` tem única em
    //        (userId, date) e acrescentar o segmento exigiria recriar índice
    //        único em tabela viva.
    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`daily_briefing_segments\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`date\` VARCHAR(10) NOT NULL,
        \`segmentKey\` VARCHAR(64) NOT NULL,
        \`content\` TEXT NOT NULL,
        \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY \`uq_briefing_segment\` (\`date\`, \`segmentKey\`)
      )
    `);
    console.log("[ensure-schema] ok  · tabela daily_briefing_segments garantida");

    // 3.0.6) Conta só de monitoramento de site (sem mídia). Sem esta marca a
    //        conta entraria nos syncs de mídia e geraria "token expirado" diário.
    if (await tableExists(conn, "meta_ad_accounts")) {
      if (await columnExists(conn, "meta_ad_accounts", "somenteMonitoramento")) {
        console.log("[ensure-schema] ok  · meta_ad_accounts.somenteMonitoramento já existe");
      } else {
        await conn.query("ALTER TABLE `meta_ad_accounts` ADD COLUMN `somenteMonitoramento` BOOLEAN NOT NULL DEFAULT 0");
        console.log("[ensure-schema] +   · meta_ad_accounts.somenteMonitoramento adicionada");
      }
    }

    // 3.0.7) Robô de Monitoramento — configuração por cliente. `ativo` default 0:
    //        conta nova nunca entra no robô por acidente.
    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`site_compliance_settings\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`accountId\` INT NOT NULL,
        \`ativo\` BOOLEAN NOT NULL DEFAULT 0,
        \`dominioEsperado\` VARCHAR(255) NULL,
        \`checarDns\` BOOLEAN NOT NULL DEFAULT 1,
        \`checarRedirect\` BOOLEAN NOT NULL DEFAULT 1,
        \`checarConteudo\` BOOLEAN NOT NULL DEFAULT 0,
        \`blogUrl\` VARCHAR(500) NULL,
        \`nsBaselineJson\` JSON NULL,
        \`termosIgnoradosJson\` JSON NULL,
        \`ultimaVerificacaoEm\` TIMESTAMP NULL,
        \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY \`uq_compliance_account\` (\`accountId\`)
      )
    `);
    console.log("[ensure-schema] ok  · tabela site_compliance_settings garantida");

    // 3.1.0) Redes Sociais — credencial PRÓPRIA, separada de Meta Ads. Uma linha
    //        só: o token é da agência, não do cliente. Cifrado, diferente do
    //        token de campanhas (dívida existente que não vale replicar).
    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`social_credentials\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`tokenEncrypted\` TEXT NOT NULL,
        \`impressao\` VARCHAR(16) NOT NULL,
        \`businessId\` VARCHAR(64) NULL,
        \`lastTestAt\` TIMESTAMP NULL,
        \`lastTestStatus\` VARCHAR(8) NULL,
        \`lastTestDetail\` TEXT NULL,
        \`updatedBy\` INT NULL,
        \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    console.log("[ensure-schema] ok  · tabela social_credentials garantida");

    // A tabela nasceu com uma linha e Instagram implícito; as leituras usavam
    // `limit(1)` sem filtro. Com a segunda rede, isso devolveria a credencial
    // errada em silêncio. A coluna torna a suposição explícita.
    if (await tableExists(conn, "social_credentials")) {
      if (await columnExists(conn, "social_credentials", "provider")) {
        console.log("[ensure-schema] ok  · social_credentials.provider já existe");
      } else {
        await conn.query(
          "ALTER TABLE `social_credentials` ADD COLUMN `provider` VARCHAR(20) NOT NULL DEFAULT 'instagram'");
        console.log("[ensure-schema] +   · social_credentials.provider adicionada");
      }
    }

    // Token OAuth por CONTA de cliente — o outro lado do híbrido. Separado de
    // social_credentials porque expira, é renovável e há um por cliente; juntos,
    // metade das colunas ficaria nula em metade das linhas.
    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`social_account_tokens\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`accountId\` INT NOT NULL,
        \`provider\` VARCHAR(20) NOT NULL DEFAULT 'instagram',
        \`flow\` VARCHAR(24) NOT NULL DEFAULT 'oauth_conta',
        \`tokenEncrypted\` TEXT NOT NULL,
        \`impressao\` VARCHAR(16) NOT NULL,
        \`instagramUserId\` VARCHAR(64) NULL,
        \`instagramUsername\` VARCHAR(120) NULL,
        \`escopos\` TEXT NULL,
        \`expiresAt\` TIMESTAMP NULL,
        \`refreshedAt\` TIMESTAMP NULL,
        \`refreshFalhaEm\` TIMESTAMP NULL,
        \`refreshFalhaDetalhe\` TEXT NULL,
        \`createdBy\` INT NULL,
        \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY \`uq_social_token_conta\` (\`accountId\`, \`provider\`)
      )
    `);
    console.log("[ensure-schema] ok  · tabela social_account_tokens garantida");

    // Snapshot diário de Redes Sociais. Tabela própria, e não
    // client_site_snapshots: aquela tem url/estrategia NOT NULL dentro da chave
    // única, e Instagram teria que inventar os dois. Toda coluna numérica é NULL
    // por padrão — 0 significa "mediu e deu zero", e nunca serve de consolo.
    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`social_snapshots\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`accountId\` INT NOT NULL,
        \`provider\` VARCHAR(20) NOT NULL DEFAULT 'instagram',
        \`dia\` VARCHAR(10) NOT NULL,
        \`connectionSource\` VARCHAR(24) NULL,
        \`instagramUserId\` VARCHAR(64) NULL,
        \`followersCount\` INT NULL,
        \`followsCount\` INT NULL,
        \`mediaCount\` INT NULL,
        \`metricasJson\` JSON NULL,
        \`followTypeBreakdownRaw\` JSON NULL,
        \`recusadasJson\` JSON NULL,
        \`storiesVistos\` INT NULL,
        \`statusColeta\` VARCHAR(10) NOT NULL DEFAULT 'ok',
        \`erroDetalhe\` TEXT NULL,
        \`coletadoEm\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`atualizadoEm\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY \`uq_social_snap\` (\`accountId\`, \`provider\`, \`dia\`),
        KEY \`idx_social_snap_conta\` (\`accountId\`, \`dia\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log("[ensure-schema] ok  · tabela social_snapshots garantida");

    // De onde veio a linha. Adivinhar pela proximidade de horário com
    // social_coleta_execucoes erraria no dia em que as duas rodassem perto — e
    // erraria em silêncio.
    if (await tableExists(conn, "social_snapshots")) {
      if (await columnExists(conn, "social_snapshots", "origem")) {
        console.log("[ensure-schema] ok  · social_snapshots.origem já existe");
      } else {
        await conn.query("ALTER TABLE `social_snapshots` ADD COLUMN `origem` VARCHAR(10) NULL");
        console.log("[ensure-schema] +   · social_snapshots.origem adicionada");
      }
    }

    // Uma linha por publicação por dia: likes e alcance mudam com o tempo.
    // Stories entram aqui com produto='STORY' — é a única forma de existirem
    // depois de expirar em 24h.
    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`social_media_snapshots\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`accountId\` INT NOT NULL,
        \`mediaId\` VARCHAR(64) NOT NULL,
        \`dia\` VARCHAR(10) NOT NULL,
        \`publicadoEm\` VARCHAR(32) NULL,
        \`tipo\` VARCHAR(20) NULL,
        \`produto\` VARCHAR(20) NULL,
        \`permalink\` VARCHAR(500) NULL,
        \`legenda\` VARCHAR(500) NULL,
        \`likes\` INT NULL,
        \`comentarios\` INT NULL,
        \`reach\` INT NULL,
        \`views\` INT NULL,
        \`saves\` INT NULL,
        \`shares\` INT NULL,
        \`totalInteractions\` INT NULL,
        \`recusadasJson\` JSON NULL,
        \`coletadoEm\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY \`uq_social_midia_dia\` (\`accountId\`, \`mediaId\`, \`dia\`),
        KEY \`idx_social_midia_conta\` (\`accountId\`, \`dia\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log("[ensure-schema] ok  · tabela social_media_snapshots garantida");

    // Cada execução da coleta. Tabela própria: "quantas contas foram
    // coletadas" é fato da EXECUÇÃO, e social_snapshots é sobrescrita no mesmo
    // dia — a coleta manual apagaria o horário da automática.
    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`social_coleta_execucoes\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`provider\` VARCHAR(20) NOT NULL DEFAULT 'instagram',
        \`origem\` VARCHAR(10) NOT NULL,
        \`escopo\` VARCHAR(10) NOT NULL DEFAULT 'geral',
        \`dia\` VARCHAR(10) NOT NULL,
        \`tentados\` INT NOT NULL DEFAULT 0,
        \`ok\` INT NOT NULL DEFAULT 0,
        \`parciais\` INT NOT NULL DEFAULT 0,
        \`erros\` INT NOT NULL DEFAULT 0,
        \`pulados\` INT NOT NULL DEFAULT 0,
        \`disparadaPor\` INT NULL,
        \`detalheJson\` JSON NULL,
        \`executadaEm\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY \`idx_social_exec\` (\`provider\`, \`origem\`, \`executadaEm\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log("[ensure-schema] ok  · tabela social_coleta_execucoes garantida");

    // Duração e contagem de chamadas: sem elas a execução diz que falhou, e não
    // diz se falhou por volume.
    if (await tableExists(conn, "social_coleta_execucoes")) {
      for (const [col, ddl] of [
        ["duracaoMs", "ADD COLUMN `duracaoMs` INT NULL"],
        ["chamadas", "ADD COLUMN `chamadas` INT NULL"],
        ["chamadasComErro", "ADD COLUMN `chamadasComErro` INT NULL"],
      ]) {
        if (await columnExists(conn, "social_coleta_execucoes", col)) continue;
        await conn.query(`ALTER TABLE \`social_coleta_execucoes\` ${ddl}`);
        console.log(`[ensure-schema] +   · social_coleta_execucoes.${col} adicionada`);
      }
    }

    // 3.0.9) Diagnóstico do teste de conexão de loja. Sem esta coluna o retorno
    //        do teste vive só num toast e some — e é ele que orienta o
    //        adaptador da plataforma.
    if (await tableExists(conn, "ecommerce_connections")) {
      if (await columnExists(conn, "ecommerce_connections", "lastTestDetail")) {
        console.log("[ensure-schema] ok  · ecommerce_connections.lastTestDetail já existe");
      } else {
        await conn.query("ALTER TABLE `ecommerce_connections` ADD COLUMN `lastTestDetail` TEXT NULL");
        console.log("[ensure-schema] +   · ecommerce_connections.lastTestDetail adicionada");
      }
    }

    // 3.0.8) Estado da confirmação dupla. Colunas SEPARADAS do snapshot diário:
    //        uma suspeita das 23h58 confirma às 00h03, e estado guardado por dia
    //        se perderia exatamente na virada.
    for (const [col, ddl] of [
      ["suspeitaJson", "ADD COLUMN `suspeitaJson` JSON NULL"],
      ["confirmacoesNecessarias", "ADD COLUMN `confirmacoesNecessarias` INT NOT NULL DEFAULT 2"],
      // Passo 7 — varredura de conteúdo do blog.
      ["termosExtrasJson", "ADD COLUMN `termosExtrasJson` JSON NULL"],
      ["postsVistosJson", "ADD COLUMN `postsVistosJson` JSON NULL"],
      ["ultimaVerificacaoConteudoEm", "ADD COLUMN `ultimaVerificacaoConteudoEm` TIMESTAMP NULL"],
    ]) {
      if (await columnExists(conn, "site_compliance_settings", col)) {
        console.log(`[ensure-schema] ok  · site_compliance_settings.${col} já existe`);
      } else {
        await conn.query(`ALTER TABLE \`site_compliance_settings\` ${ddl}`);
        console.log(`[ensure-schema] +   · site_compliance_settings.${col} adicionada`);
      }
    }

    // 3.1) Foto do cliente enviada à mão. Coluna PRÓPRIA, separada da
    //      `pictureUrl` que vem da Meta: o import de contas reescreve aquela, e
    //      uma foto escolhida pelo time não pode sumir por causa disso.
    if (await tableExists(conn, "meta_ad_accounts")) {
      if (await columnExists(conn, "meta_ad_accounts", "pictureKey")) {
        console.log("[ensure-schema] ok  · meta_ad_accounts.pictureKey já existe");
      } else {
        await conn.query("ALTER TABLE `meta_ad_accounts` ADD COLUMN `pictureKey` VARCHAR(512) NULL");
        console.log("[ensure-schema] +   · meta_ad_accounts.pictureKey adicionada");
      }
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
    // Reembolsos pedidos por colaboradores. Fica FORA de finance_pnl_entries de
    // propósito: a despesa só entra no balanço quando o admin aprova.
    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`finance_reembolso_solicitacoes\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`userId\` INT NOT NULL,
        \`mes\` VARCHAR(7) NOT NULL,
        \`dataGasto\` DATE NOT NULL,
        \`descricao\` VARCHAR(255) NOT NULL,
        \`valorCents\` INT NOT NULL,
        \`subcategoria\` VARCHAR(24) NOT NULL,
        \`observacao\` TEXT NULL,
        \`comprovanteKey\` VARCHAR(512) NULL,
        \`status\` ENUM('aguardando','aprovado','reembolsado','recusado') NOT NULL DEFAULT 'aguardando',
        \`motivoRecusa\` VARCHAR(500) NULL,
        \`pnlEntryId\` INT NULL,
        \`decididoPorUserId\` INT NULL,
        \`decididoEm\` TIMESTAMP NULL,
        \`reembolsadoEm\` TIMESTAMP NULL,
        \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX \`idx_reemb_sol_user\` (\`userId\`),
        INDEX \`idx_reemb_sol_status\` (\`status\`),
        INDEX \`idx_reemb_sol_mes\` (\`mes\`)
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

    // Performance técnica do site (PageSpeed/GTmetrix) — aditivo.
    for (const col of [
      { name: "performanceEnabled", ddl: "ADD COLUMN `performanceEnabled` BOOLEAN NOT NULL DEFAULT FALSE" },
      { name: "performanceProvider", ddl: "ADD COLUMN `performanceProvider` VARCHAR(20) NULL DEFAULT 'pagespeed'" },
      { name: "performanceUrl", ddl: "ADD COLUMN `performanceUrl` VARCHAR(500) NULL" },
      { name: "perfLastSyncAt", ddl: "ADD COLUMN `perfLastSyncAt` TIMESTAMP NULL" },
      { name: "perfLastSyncStatus", ddl: "ADD COLUMN `perfLastSyncStatus` VARCHAR(16) NULL" },
      { name: "perfLastSyncError", ddl: "ADD COLUMN `perfLastSyncError` VARCHAR(255) NULL" },
    ]) {
      if (!(await columnExists(conn, "client_clarity_settings", col.name))) {
        await conn.query(`ALTER TABLE \`client_clarity_settings\` ${col.ddl}`);
        console.log(`[ensure-schema] ok  · client_clarity_settings.${col.name} adicionada`);
      }
    }

    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`dashboard_widget_prefs\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`userId\` INT NOT NULL,
        \`widgetKey\` VARCHAR(40) NOT NULL,
        \`visivel\` BOOLEAN NOT NULL DEFAULT 1,
        \`ordem\` INT NULL,
        \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_widget_pref_user_key\` (\`userId\`, \`widgetKey\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    console.log("[ensure-schema] ok  · dashboard_widget_prefs garantida");

    // Redes sociais por cliente — substitui o mapa hardcoded de pageMapping.ts.
    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`client_social_accounts\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`accountId\` INT NOT NULL,
        \`provider\` VARCHAR(20) NOT NULL DEFAULT 'instagram',
        \`handle\` VARCHAR(120) NOT NULL,
        \`profileUrl\` VARCHAR(500) NULL,
        \`externalId\` VARCHAR(64) NULL,
        \`enabled\` BOOLEAN NOT NULL DEFAULT 1,
        \`notes\` TEXT NULL,
        \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_social_conta_provider\` (\`accountId\`, \`provider\`, \`handle\`),
        KEY \`idx_social_conta\` (\`accountId\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    console.log("[ensure-schema] ok  · client_social_accounts garantida");

    // Vínculo Página/Instagram por cliente. `tipoConta` e `statusInsight` são
    // eixos SEPARADOS: identidade do perfil não é estado da API.
    //
    // Mora AQUI, logo depois do CREATE acima, e não junto das outras adições de
    // coluna lá em cima: naquele ponto a tabela ainda não existe num banco novo,
    // e um `tableExists` teria pulado as 13 colunas em silêncio — em produção a
    // tabela já existe, então o buraco só apareceria em ambiente novo, na
    // primeira tentativa de vincular uma Página.
    // `tokenSource` virou `connectionSource` (nome da CONEXÃO, não do token).
    // A coluna nasceu ontem e só tinha o default, então a troca é uma adição
    // seguida de descarte — nada a migrar. O DROP fica condicionado para o
    // script continuar idempotente em banco que já rodou a versão nova.
    if (await columnExists(conn, "client_social_accounts", "tokenSource")) {
      await conn.query("ALTER TABLE `client_social_accounts` DROP COLUMN `tokenSource`");
      console.log("[ensure-schema] +   · client_social_accounts.tokenSource removida (virou connectionSource)");
    }

    for (const [col, ddl] of [
      ["pageId", "ADD COLUMN `pageId` VARCHAR(64) NULL"],
      ["pageName", "ADD COLUMN `pageName` VARCHAR(255) NULL"],
      ["instagramUserId", "ADD COLUMN `instagramUserId` VARCHAR(64) NULL"],
      ["instagramUsername", "ADD COLUMN `instagramUsername` VARCHAR(120) NULL"],
      ["tipoConta", "ADD COLUMN `tipoConta` VARCHAR(16) NOT NULL DEFAULT 'DESCONHECIDO'"],
      ["statusInsight", "ADD COLUMN `statusInsight` VARCHAR(16) NOT NULL DEFAULT 'NAO_TESTADO'"],
      ["connectionSource", "ADD COLUMN `connectionSource` VARCHAR(24) NOT NULL DEFAULT 'agencia_system_user'"],
      ["lastTestAt", "ADD COLUMN `lastTestAt` TIMESTAMP NULL"],
      ["lastTestStatus", "ADD COLUMN `lastTestStatus` VARCHAR(8) NULL"],
      ["lastTestDetail", "ADD COLUMN `lastTestDetail` TEXT NULL"],
      ["lastSyncAt", "ADD COLUMN `lastSyncAt` TIMESTAMP NULL"],
      ["lastSyncStatus", "ADD COLUMN `lastSyncStatus` VARCHAR(8) NULL"],
      ["lastSyncError", "ADD COLUMN `lastSyncError` VARCHAR(500) NULL"],
    ]) {
      if (await columnExists(conn, "client_social_accounts", col)) {
        console.log(`[ensure-schema] ok  · client_social_accounts.${col} já existe`);
      } else {
        await conn.query(`ALTER TABLE \`client_social_accounts\` ${ddl}`);
        console.log(`[ensure-schema] +   · client_social_accounts.${col} adicionada`);
      }
    }

    // Google Ads: a tabela existia em prod via db:push, mas sem migration —
    // some em ambiente novo. CREATE IF NOT EXISTS a garante. O refreshToken
    // guarda o token CRIPTOGRAFADO (por conta, obtido via OAuth).
    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`google_ad_accounts\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`userId\` INT NOT NULL,
        \`customerId\` VARCHAR(20) NOT NULL,
        \`accountName\` VARCHAR(255) NULL,
        \`refreshToken\` TEXT NOT NULL,
        \`currency\` VARCHAR(8) NULL DEFAULT 'BRL',
        \`timezone\` VARCHAR(64) NULL DEFAULT 'America/Sao_Paulo',
        \`isActive\` BOOLEAN NOT NULL DEFAULT 1,
        \`lastSyncAt\` TIMESTAMP NULL,
        \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        KEY \`idx_google_ad_user\` (\`userId\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    console.log("[ensure-schema] ok  · google_ad_accounts garantida");

    // Vínculo conta Google ↔ cliente do Tracker + marcar conta velha como
    // ignorada. Aditivo: linhas existentes ficam sem vínculo (invisíveis para
    // usuário comum até um admin vincular).
    for (const col of [
      { name: "linkedAccountId", ddl: "ADD COLUMN `linkedAccountId` INT NULL" },
      { name: "ignored", ddl: "ADD COLUMN `ignored` BOOLEAN NOT NULL DEFAULT 0" },
    ]) {
      if (!(await columnExists(conn, "google_ad_accounts", col.name))) {
        await conn.query(`ALTER TABLE \`google_ad_accounts\` ${col.ddl}`);
        console.log(`[ensure-schema] ok  · google_ad_accounts.${col.name} adicionada`);
      }
    }

    // Relatórios modulares — aditivo. As linhas antigas ficam com estes campos
    // NULL e continuam sendo lidas pelo `tier`; as novas trazem os módulos
    // pedidos e as fontes que existiam de fato no momento da geração.
    for (const col of [
      { name: "modulesJson", ddl: "ADD COLUMN `modulesJson` JSON NULL" },
      { name: "fontesJson", ddl: "ADD COLUMN `fontesJson` JSON NULL" },
      { name: "markdown", ddl: "ADD COLUMN `markdown` TEXT NULL" },
    ]) {
      if (!(await columnExists(conn, "report_snapshots", col.name))) {
        await conn.query(`ALTER TABLE \`report_snapshots\` ${col.ddl}`);
        console.log(`[ensure-schema] ok  · report_snapshots.${col.name} adicionada`);
      }
    }
    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`client_site_snapshots\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`accountId\` INT NOT NULL,
        \`provider\` VARCHAR(20) NOT NULL,
        \`url\` VARCHAR(500) NOT NULL,
        \`estrategia\` VARCHAR(10) NOT NULL DEFAULT 'mobile',
        \`dia\` VARCHAR(10) NOT NULL,
        \`metricsJson\` JSON NULL,
        \`recommendationsJson\` JSON NULL,
        \`issuesJson\` JSON NULL,
        \`externalReportUrl\` VARCHAR(500) NULL,
        \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_site_snap\` (\`accountId\`, \`provider\`, \`url\`, \`estrategia\`, \`dia\`),
        KEY \`idx_site_snap_conta\` (\`accountId\`, \`dia\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    console.log("[ensure-schema] ok  · client_site_snapshots garantida");

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
    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`daily_digest_recipients\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`dedupKey\` VARCHAR(180) NOT NULL,
        \`userId\` INT NOT NULL,
        \`email\` VARCHAR(320) NULL,
        \`status\` VARCHAR(12) NOT NULL DEFAULT 'sent',
        \`sentAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_digest_recipient\` (\`dedupKey\`, \`userId\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    console.log("[ensure-schema] ok  · daily_digest_settings / overrides / recipients garantidas");

    // 21b) Auditoria de envio de email — sem isto a falha do SMTP some com o deploy.
    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`email_send_log\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`tipo\` VARCHAR(40) NOT NULL DEFAULT 'outro',
        \`assunto\` VARCHAR(255) NOT NULL,
        \`destinatarioOriginal\` VARCHAR(320) NOT NULL,
        \`destinatarioFinal\` VARCHAR(320) NOT NULL,
        \`redirecionado\` BOOLEAN NOT NULL DEFAULT FALSE,
        \`status\` VARCHAR(12) NOT NULL,
        \`erro\` TEXT NULL,
        \`userId\` INT NULL,
        \`messageId\` VARCHAR(255) NULL,
        \`criadoEm\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        KEY \`idx_email_log_criado\` (\`criadoEm\`),
        KEY \`idx_email_log_tipo\` (\`tipo\`, \`criadoEm\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    if (!(await columnExists(conn, "email_send_log", "transporte"))) {
      await conn.query("ALTER TABLE `email_send_log` ADD COLUMN `transporte` VARCHAR(12) NOT NULL DEFAULT 'smtp'");
    }
    if (!(await columnExists(conn, "email_send_log", "role"))) {
      await conn.query("ALTER TABLE `email_send_log` ADD COLUMN `role` VARCHAR(20) NULL");
    }
    if (!(await columnExists(conn, "email_send_log", "blocos"))) {
      await conn.query("ALTER TABLE `email_send_log` ADD COLUMN `blocos` VARCHAR(160) NULL");
    }
    console.log("[ensure-schema] ok  · email_send_log garantida");

    // 21e) Conexões de e-commerce (F5-B) — credenciais sempre criptografadas.
    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`ecommerce_connections\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`accountId\` INT NOT NULL,
        \`platform\` VARCHAR(20) NOT NULL DEFAULT 'woocommerce',
        \`storeUrl\` VARCHAR(500) NOT NULL,
        \`consumerKeyEncrypted\` TEXT NOT NULL,
        \`consumerSecretEncrypted\` TEXT NOT NULL,
        \`status\` VARCHAR(12) NOT NULL DEFAULT 'ativa',
        \`lastTestAt\` TIMESTAMP NULL,
        \`lastTestStatus\` VARCHAR(8) NULL,
        \`lastTestError\` VARCHAR(300) NULL,
        \`createdBy\` INT NULL,
        \`updatedBy\` INT NULL,
        \`active\` BOOLEAN NOT NULL DEFAULT TRUE,
        \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_ecom_conta_plataforma\` (\`accountId\`, \`platform\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    console.log("[ensure-schema] ok  · ecommerce_connections garantida");
    for (const [col, ddl] of [["lastSyncAt", "TIMESTAMP NULL"], ["lastSyncStatus", "VARCHAR(8) NULL"], ["lastSyncError", "VARCHAR(300) NULL"]]) {
      if (!(await columnExists(conn, "ecommerce_connections", col))) {
        await conn.query(`ALTER TABLE \`ecommerce_connections\` ADD COLUMN \`${col}\` ${ddl}`);
        console.log(`[ensure-schema] ok  · ecommerce_connections.${col} adicionada`);
      }
    }

    // 21c) Vínculo propriedade GA4 → cliente. Aditivo e nullable: nenhum registro
    // existente muda, e o vínculo continua sendo manual.
    if (await tableExists(conn, "ga4_accounts")) {
      if (!(await columnExists(conn, "ga4_accounts", "linkedAccountId"))) {
        await conn.query("ALTER TABLE `ga4_accounts` ADD COLUMN `linkedAccountId` INT NULL");
        console.log("[ensure-schema] ok  · ga4_accounts.linkedAccountId adicionada");
      }
    }

    // 21d) Refresh token do GA4 criptografado. A coluna antiga vira nullable —
    // token de integração nunca deve ficar em texto puro no banco.
    if (await tableExists(conn, "ga4_accounts")) {
      if (!(await columnExists(conn, "ga4_accounts", "refreshTokenEncrypted"))) {
        await conn.query("ALTER TABLE `ga4_accounts` ADD COLUMN `refreshTokenEncrypted` TEXT NULL");
        console.log("[ensure-schema] ok  · ga4_accounts.refreshTokenEncrypted adicionada");
      }
      await conn.query("ALTER TABLE `ga4_accounts` MODIFY COLUMN `refreshToken` TEXT NULL");
      // Índice único: a mesma propriedade não pode virar duas linhas. Criado
      // agora, com a tabela vazia — depois de conectar já não seria seguro.
      const [ix] = await conn.query(
        "SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ga4_accounts' AND INDEX_NAME='uq_ga4_property' LIMIT 1");
      if (ix.length === 0) {
        await conn.query("ALTER TABLE `ga4_accounts` ADD UNIQUE KEY `uq_ga4_property` (`propertyId`)");
        console.log("[ensure-schema] ok  · ga4_accounts.propertyId único");
      }
      for (const [col, ddl] of [["lastSyncStatus", "VARCHAR(16) NULL"], ["lastSyncError", "VARCHAR(500) NULL"]]) {
        if (!(await columnExists(conn, "ga4_accounts", col))) {
          await conn.query(`ALTER TABLE \`ga4_accounts\` ADD COLUMN \`${col}\` ${ddl}`);
          console.log(`[ensure-schema] ok  · ga4_accounts.${col} adicionada`);
        }
      }
    }

    // 22) Exclusão permanente de usuário (anônima — ver users.deletedAt no schema).
    if (!(await columnExists(conn, "users", "deletedAt"))) {
      await conn.query("ALTER TABLE `users` ADD COLUMN `deletedAt` TIMESTAMP NULL");
      console.log("[ensure-schema] ok  · users.deletedAt adicionada");
    }
    if (!(await columnExists(conn, "user_audit_logs", "targetEmail"))) {
      await conn.query("ALTER TABLE `user_audit_logs` ADD COLUMN `targetEmail` VARCHAR(320) NULL");
      console.log("[ensure-schema] ok  · user_audit_logs.targetEmail adicionada");
    }

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

    // 22) Dicionário da conciliação de fatura → reembolsos SELVA (Fase 2). Só o
    //     mapa de classificação — nunca valores da fatura nem gasto pessoal. O
    //     seed inicial é inserido em código (server/services/fatura/dicionario.ts),
    //     mantendo uma fonte de verdade única com o classificador.
    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`finance_merchant_map\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`padrao\` VARCHAR(200) NOT NULL,
        \`canonical\` VARCHAR(120) NOT NULL,
        \`categoria\` ENUM('SELVA','PESSOAL') NOT NULL,
        \`valorCents\` INT NULL,
        \`origem\` ENUM('SEED','CONFIRMADO') NOT NULL DEFAULT 'SEED',
        \`vezesConfirmado\` INT NOT NULL DEFAULT 0,
        \`ativo\` BOOLEAN NOT NULL DEFAULT 1,
        \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        KEY \`idx_merchant_categoria\` (\`categoria\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    console.log("[ensure-schema] ok  · finance_merchant_map garantida");

    // ── Unificação de contexto: account_context absorve client_context ──────────
    //  Fase 2 da centralização. account_context vira a tabela ÚNICA de contexto
    //  por conta. client_context PERMANECE (backup / rollback). Aditivo + idempotente.
    if (await tableExists(conn, "account_context")) {
      const ctxCols = [
        { name: "objective",            ddl: "ADD COLUMN `objective` TEXT NULL" },
        { name: "offer",                ddl: "ADD COLUMN `offer` TEXT NULL" },
        { name: "audience",             ddl: "ADD COLUMN `audience` TEXT NULL" },
        { name: "importantPagesJson",   ddl: "ADD COLUMN `importantPagesJson` JSON NULL" },
        { name: "conversionEventsJson", ddl: "ADD COLUMN `conversionEventsJson` JSON NULL" },
        { name: "trackingNotes",        ddl: "ADD COLUMN `trackingNotes` TEXT NULL" },
        { name: "currentHypotheses",    ddl: "ADD COLUMN `currentHypotheses` TEXT NULL" },
        { name: "constraints",          ddl: "ADD COLUMN `constraints` TEXT NULL" },
        { name: "previousTests",        ddl: "ADD COLUMN `previousTests` TEXT NULL" },
        { name: "nextSteps",            ddl: "ADD COLUMN `nextSteps` TEXT NULL" },
        { name: "learningsConsolidated", ddl: "ADD COLUMN `learningsConsolidated` TEXT NULL" },
        { name: "quickContext",          ddl: "ADD COLUMN `quickContext` TEXT NULL" },
      ];
      for (const col of ctxCols) {
        if (await columnExists(conn, "account_context", col.name)) {
          console.log(`[ensure-schema] ok  · account_context.${col.name} já existe`);
          continue;
        }
        await conn.query(`ALTER TABLE \`account_context\` ${col.ddl}`);
        console.log(`[ensure-schema] +   · account_context.${col.name} adicionada`);
      }

      // Migração idempotente client_context → account_context. COALESCE nunca
      // sobrescreve o que já existe; nunca apaga. Roda a cada boot sem efeito
      // após a 1ª vez (campos já preenchidos).
      if (await tableExists(conn, "client_context")) {
        // 1) Garante uma linha em account_context para cada conta com client_context.
        await conn.query(`
          INSERT INTO \`account_context\` (accountId)
          SELECT cc.accountId FROM \`client_context\` cc
          LEFT JOIN \`account_context\` ac ON ac.accountId = cc.accountId
          WHERE ac.id IS NULL
        `);
        // 2) Copia os campos onde account_context está vazio.
        await conn.query(`
          UPDATE \`account_context\` ac
          JOIN \`client_context\` cc ON cc.accountId = ac.accountId
          SET
            ac.objective            = COALESCE(NULLIF(ac.objective, ''), cc.objective),
            ac.offer                = COALESCE(NULLIF(ac.offer, ''), cc.offer),
            ac.audience             = COALESCE(NULLIF(ac.audience, ''), cc.audience),
            ac.importantPagesJson   = COALESCE(ac.importantPagesJson, cc.importantPagesJson),
            ac.conversionEventsJson = COALESCE(ac.conversionEventsJson, cc.conversionEventsJson),
            ac.trackingNotes        = COALESCE(NULLIF(ac.trackingNotes, ''), cc.trackingNotes),
            ac.currentHypotheses    = COALESCE(NULLIF(ac.currentHypotheses, ''), cc.currentHypotheses),
            ac.constraints          = COALESCE(NULLIF(ac.constraints, ''), cc.constraints),
            ac.previousTests        = COALESCE(NULLIF(ac.previousTests, ''), cc.previousTests),
            ac.nextSteps            = COALESCE(NULLIF(ac.nextSteps, ''), cc.nextSteps)
        `);
        console.log("[ensure-schema] ok  · contexto unificado (client_context → account_context)");
      }
    }

    // Prioridades da Semana — substitui a box do Trello na Home.
    //
    // `semana` é VARCHAR e não DATE de propósito: ela é a chave (a
    // segunda-feira em AAAA-MM-DD), e DATE viraria instante com fuso — a
    // semana andaria um dia para trás na leitura em São Paulo.
    await conn.query(`CREATE TABLE IF NOT EXISTS \`weekly_priorities\` (
      \`id\` INT NOT NULL AUTO_INCREMENT,
      \`grupo\` VARCHAR(8) NOT NULL,
      \`semana\` VARCHAR(10) NOT NULL,
      \`tipo\` VARCHAR(12) NOT NULL,
      \`titulo\` VARCHAR(200) NOT NULL,
      \`descricao\` TEXT NULL,
      \`responsavel\` VARCHAR(80) NULL,
      \`prazo\` VARCHAR(10) NULL,
      \`status\` VARCHAR(12) NOT NULL DEFAULT 'PLANEJADO',
      \`ordem\` INT NOT NULL DEFAULT 0,
      \`createdBy\` INT NULL,
      \`updatedBy\` INT NULL,
      \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updatedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      KEY \`idx_wp_semana\` (\`semana\`),
      KEY \`idx_wp_semana_grupo\` (\`semana\`, \`grupo\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    console.log("[ensure-schema] ok  · weekly_priorities garantida");

    // Responsável deixou de ser texto livre e passou a apontar para users.id —
    // é o que permite mostrar a foto do perfil sem duplicar cadastro. A coluna
    // antiga fica: ela ainda é lida quando não há responsavelUserId, então
    // nenhum item já criado perde o responsável.
    const [wpCols] = await conn.query(
      "SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'weekly_priorities' AND column_name = 'responsavelUserId'",
    );
    if (wpCols.length === 0) {
      await conn.query("ALTER TABLE `weekly_priorities` ADD COLUMN `responsavelUserId` INT NULL");
      console.log("[ensure-schema] ok  · weekly_priorities.responsavelUserId adicionada");
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
