import {
  bigint,
  date,
  decimal,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  boolean,
  float,
  uniqueIndex,
  index,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  passwordHash: varchar("passwordHash", { length: 255 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  // Roles: admin (Administrativo) · developer (Desenvolvedor) ·
  //        coordinator (Coordenador) · user (Colaborador)
  // PERMISSÃO do sistema — o que a pessoa pode fazer. Não confundir com operationalRole.
  role: mysqlEnum("role", ["user", "admin", "developer", "coordinator"]).default("user").notNull(),
  // RESPONSABILIDADE operacional — por quais clientes a pessoa responde. Ortogonal a
  // `role`: uma coordenadora normalmente é role=user + operationalRole=coordinator.
  // Só afeta destinatário de alerta; não concede permissão nenhuma — quem
  // autoriza é `role`, que ganhou o valor `coordinator` em 14/08/2026.
  operationalRole: mysqlEnum("operationalRole", ["collaborator", "coordinator"]).default("collaborator").notNull(),
  // Perfil de colaborador
  jobTitle: varchar("jobTitle", { length: 255 }),
  birthdayDay: int("birthdayDay"),     // 1–31
  birthdayMonth: int("birthdayMonth"), // 1–12
  // Foto de perfil (key do objeto no storage; URL resolvida no backend)
  avatarKey: varchar("avatarKey", { length: 512 }),
  /**
   * Grupo do Jornalzinho: gtm1 | gtm2 | todos | nenhum. NULL = sem grupo, que
   * hoje significa sem recorte (recebe tudo), igual ao comportamento anterior.
   *
   * Grupo FIXO em vez de escolha livre de clientes por pessoa: a narrativa da
   * IA é cacheada por conjunto de contas, então combinação individual faria o
   * custo crescer com o time. Com grupo, o teto é o número de grupos.
   *
   * Não é papel nem permissão — só recorte de conteúdo do e-mail.
   */
  jornalzinhoGrupo: varchar("jornalzinhoGrupo", { length: 16 }),
  // Primeiro acesso / segurança
  mustChangePassword: boolean("mustChangePassword").default(false).notNull(),
  active: boolean("active").default(true).notNull(),
  /**
   * Exclusão permanente. A LINHA sobrevive porque 79 colunas apontam para
   * users.id sem FK física — apagar fisicamente deixaria centenas de
   * referências órfãs em silêncio (489 alerts, 218 logs de acesso, auditoria).
   * Excluir = perder acesso, perder dados pessoais, sumir da lista. O id fica
   * para o histórico continuar legível.
   */
  deletedAt: timestamp("deletedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
  /**
   * Última vez que a pessoa deu sinal de vida com a aba aberta. Diferente de
   * lastSignedIn, que só é tocado no login: alguém pode estar trabalhando há
   * seis horas com a mesma sessão e o login continuar sendo de segunda-feira.
   * NULL = nunca pingou (sessão antiga ou conta que nunca abriu o Spaces).
   */
  lastSeenAt: timestamp("lastSeenAt"),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Integrações por usuário (OAuth) — ex.: Google Calendar ───────────────────
// Tokens são SEMPRE guardados criptografados (AES-256-GCM). Nunca em texto.
export const userIntegrations = mysqlTable("user_integrations", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  provider: varchar("provider", { length: 64 }).notNull(), // "google_calendar" | "trello"
  providerAccountId: varchar("providerAccountId", { length: 64 }),   // ex.: Trello member id
  providerUsername: varchar("providerUsername", { length: 255 }),    // ex.: Trello username
  providerAccountEmail: varchar("providerAccountEmail", { length: 320 }),
  accessTokenEncrypted: text("accessTokenEncrypted"),
  refreshTokenEncrypted: text("refreshTokenEncrypted"),
  expiresAt: timestamp("expiresAt"),
  scopes: text("scopes"),
  active: boolean("active").default(true).notNull(),
  connectedAt: timestamp("connectedAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  disconnectedAt: timestamp("disconnectedAt"),
  /**
   * Última vez que a conexão foi EXERCITADA de verdade (não só cadastrada).
   * "Conectado" é uma promessa do dia da autorização; consentimento revogado,
   * senha trocada e refresh token expirado não avisam ninguém. Sem isto a tela
   * mostraria "conectado" para uma integração morta há semanas.
   */
  lastCheckAt: timestamp("lastCheckAt"),
  /** ok | erro — resultado da última verificação. */
  lastCheckStatus: varchar("lastCheckStatus", { length: 12 }),
  /** Motivo da falha, já sanitizado. Nunca guarda token. */
  lastCheckError: text("lastCheckError"),
}, (table) => ({
  uqUserProvider: uniqueIndex("uq_user_provider").on(table.userId, table.provider),
}));

export type UserIntegration = typeof userIntegrations.$inferSelect;
export type InsertUserIntegration = typeof userIntegrations.$inferInsert;

// ─── News bar (persistente) ───────────────────────────────────────────────────
export const newsItems = mysqlTable("news_items", {
  id: int("id").autoincrement().primaryKey(),
  text: varchar("text", { length: 500 }).notNull(),
  active: boolean("active").default(true).notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdByUserId: int("createdByUserId"),
  updatedByUserId: int("updatedByUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type NewsItemRow = typeof newsItems.$inferSelect;
export type InsertNewsItem = typeof newsItems.$inferInsert;

// ─── SelvaTV (persistente + storage de imagem) ────────────────────────────────
export const selvatvItems = mysqlTable("selvatv_items", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 255 }),
  imageKey: varchar("imageKey", { length: 512 }).notNull(), // key no storage
  storageProvider: varchar("storageProvider", { length: 32 }),
  active: boolean("active").default(true).notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdByUserId: int("createdByUserId"),
  updatedByUserId: int("updatedByUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type SelvatvItemRow = typeof selvatvItems.$inferSelect;
export type InsertSelvatvItem = typeof selvatvItems.$inferInsert;

// ─── Acessos (cofre de credenciais por cliente) ───────────────────────────────
export const accessClients = mysqlTable("access_clients", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 255 }).notNull().unique(),
  isInternal: boolean("isInternal").default(false).notNull(),
  active: boolean("active").default(true).notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  /**
   * Foto PRÓPRIA do cliente do cofre (key no storage).
   *
   * Não reaproveita a foto do Tracker porque as duas entidades não são a mesma
   * coisa: "Santé" e "Carol Garrafa" são dois clientes distintos aqui e uma
   * única conta de mídia lá, e há cliente com acesso guardado que nunca teve
   * acompanhamento no Tracker. Amarrar a foto àquela tabela deixaria esses
   * casos permanentemente sem imagem.
   */
  pictureKey: varchar("pictureKey", { length: 512 }),
  createdByUserId: int("createdByUserId"),
  updatedByUserId: int("updatedByUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type AccessClientRow = typeof accessClients.$inferSelect;
export type InsertAccessClient = typeof accessClients.$inferInsert;

export const accessItems = mysqlTable("access_items", {
  id: int("id").autoincrement().primaryKey(),
  clientId: int("clientId").notNull(),
  platform: varchar("platform", { length: 120 }).notNull(),
  label: varchar("label", { length: 255 }),
  loginEmail: varchar("loginEmail", { length: 320 }),
  passwordEncrypted: text("passwordEncrypted").notNull(), // AES-256-GCM (iv.tag.cipher)
  url: varchar("url", { length: 1024 }),
  requiresCode: boolean("requiresCode").default(false).notNull(),
  codeType: varchar("codeType", { length: 32 }),
  notes: text("notes"),
  tagsJson: json("tagsJson"),
  active: boolean("active").default(true).notNull(),
  createdByUserId: int("createdByUserId"),
  updatedByUserId: int("updatedByUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type AccessItemRow = typeof accessItems.$inferSelect;
export type InsertAccessItem = typeof accessItems.$inferInsert;

export const accessAuditLogs = mysqlTable("access_audit_logs", {
  id: int("id").autoincrement().primaryKey(),
  accessItemId: int("accessItemId"),
  clientId: int("clientId"),
  userId: int("userId").notNull(),
  action: varchar("action", { length: 40 }).notNull(),
  metadataJson: json("metadataJson"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type InsertAccessAuditLog = typeof accessAuditLogs.$inferInsert;

// ─── Auditoria de USUÁRIOS (role/status/perfil) ───────────────────────────────
// Fonte de verdade para "quem mudou o quê" em colaboradores. NUNCA guarda senha,
// hash, tokens ou segredos — só nomes de campo e valores não sensíveis.
export const userAuditLogs = mysqlTable("user_audit_logs", {
  id: int("id").autoincrement().primaryKey(),
  actorUserId: int("actorUserId").notNull(),   // quem fez a alteração
  targetUserId: int("targetUserId").notNull(), // usuário afetado
  /** Quem era o alvo — sobrevive à exclusão, quando o nome já foi anonimizado. */
  targetEmail: varchar("targetEmail", { length: 320 }),
  action: varchar("action", { length: 40 }).notNull(), // role_changed | user_deactivated | user_reactivated | profile_updated
  previousValue: varchar("previousValue", { length: 255 }),
  newValue: varchar("newValue", { length: 255 }),
  metadataJson: json("metadataJson"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type InsertUserAuditLog = typeof userAuditLogs.$inferInsert;

/**
 * Vínculo coordenador × cliente. `accountId` aponta para meta_ad_accounts.id —
 * a mesma referência que alerts.accountId usa, então o alerta de uma conta liga
 * direto nos coordenadores dela, sem camada de tradução.
 * N:N — um cliente tem vários coordenadores, um coordenador tem vários clientes.
 * O unique (accountId, userId) é o que impede vínculo duplicado no banco.
 */
/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Clientes que cada pessoa quer no Jornalzinho / alertas por e-mail
 * ─────────────────────────────────────────────────────────────────────────────
 *  Tabela PRÓPRIA, e não `client_coordinators`, apesar de as duas serem
 *  (userId, accountId): a de coordenador significa RESPONSABILIDADE — ela exige
 *  `operationalRole = "coordinator"` e já decide destinatário de alerta in-app.
 *  Juntar as duas faria "quero receber e-mail deste cliente" conceder
 *  responsabilidade operacional, e mexer numa quebraria a outra em silêncio.
 *
 *  `enabled` é explícito de propósito. Presença-de-linha não distinguiria
 *  "nunca configurou" de "configurou e desmarcou tudo" — e são casos opostos:
 *  o primeiro cai no fallback (recebe tudo), o segundo recebe nada, de propósito.
 *
 *  Isto NÃO é papel nem permissão: as pessoas dos grupos seguem `role=user` no
 *  resto do sistema. É filtro de conteúdo do e-mail, e só.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const userEmailClientPrefs = mysqlTable("user_email_client_prefs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  /** meta_ad_accounts.id — nunca nome solto. */
  accountId: int("accountId").notNull(),
  enabled: boolean("enabled").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  uqUsuarioConta: uniqueIndex("uq_user_email_client").on(table.userId, table.accountId),
}));
export type UserEmailClientPref = typeof userEmailClientPrefs.$inferSelect;

export const clientCoordinators = mysqlTable("client_coordinators", {
  id: int("id").autoincrement().primaryKey(),
  accountId: int("accountId").notNull(),   // → meta_ad_accounts.id
  userId: int("userId").notNull(),
  createdByUserId: int("createdByUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  uqAccountUser: uniqueIndex("uq_client_coord").on(table.accountId, table.userId),
  idxUser: index("idx_client_coord_user").on(table.userId),
  idxAccount: index("idx_client_coord_account").on(table.accountId),
}));
export type ClientCoordinator = typeof clientCoordinators.$inferSelect;
export type InsertClientCoordinator = typeof clientCoordinators.$inferInsert;

// ─── Microsoft Clarity por cliente ───────────────────────────────────────────
// A API do Clarity (project-live-insights) tem limites duros que moldam este
// desenho: só devolve os ÚLTIMOS 1–3 DIAS, aceita no máximo 10 requisições por
// projeto por dia, e não recebe projectId — o TOKEN identifica o projeto.
// Por isso: (a) o snapshot diário é a única forma de existir histórico;
// (b) precisamos contar as requisições para não estourar a cota;
// (c) projectId serve só para montar o link do dashboard do Clarity.

export const clientClaritySettings = mysqlTable("client_clarity_settings", {
  id: int("id").autoincrement().primaryKey(),
  accountId: int("accountId").notNull(),          // → meta_ad_accounts.id
  enabled: boolean("enabled").default(false).notNull(),
  projectId: varchar("projectId", { length: 64 }), // só p/ deep-link no Clarity
  // AES-256-GCM (mesmo esquema do Trello). NUNCA volta para o frontend.
  encryptedApiToken: text("encryptedApiToken"),
  domain: varchar("domain", { length: 255 }),
  importantUrlsJson: json("importantUrlsJson"),
  notes: text("notes"),
  // Cota da API: 10 req/projeto/dia. Contamos para não estourar.
  apiCallsDate: varchar("apiCallsDate", { length: 10 }),
  apiCallsCount: int("apiCallsCount").default(0).notNull(),
  // Performance técnica (PageSpeed hoje; GTmetrix pluga depois). Fica aqui e não
  // numa tabela nova porque é config do SITE do mesmo cliente — domínio e URLs
  // importantes são compartilhados, e duplicá-los criaria duas verdades.
  performanceEnabled: boolean("performanceEnabled").default(false).notNull(),
  performanceProvider: varchar("performanceProvider", { length: 20 }).default("pagespeed"),
  /** URL testada. Sem isto, cai no `domain`. */
  performanceUrl: varchar("performanceUrl", { length: 500 }),
  perfLastSyncAt: timestamp("perfLastSyncAt"),
  perfLastSyncStatus: varchar("perfLastSyncStatus", { length: 16 }),
  perfLastSyncError: varchar("perfLastSyncError", { length: 255 }),
  // Diagnóstico do último sync (mensagem nunca contém token).
  lastSyncAt: timestamp("lastSyncAt"),
  lastSyncStatus: varchar("lastSyncStatus", { length: 16 }),
  lastSyncError: varchar("lastSyncError", { length: 255 }),
  updatedByUserId: int("updatedByUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  uqAccount: uniqueIndex("uq_clarity_account").on(table.accountId),
}));
export type ClientClaritySettings = typeof clientClaritySettings.$inferSelect;
export type InsertClientClaritySettings = typeof clientClaritySettings.$inferInsert;

/**
 * Só métricas AGREGADAS. Nunca gravação, nunca dado pessoal — a API não devolve
 * gravação e não queremos esse dado no nosso banco.
 * Dedup por (accountId, dia, dias): re-sincronizar o mesmo dia ATUALIZA a linha
 * em vez de criar outra. A janela da API é rolante (últimas 24h a partir da
 * chamada), então rangeStart/rangeEnd ficam como registro do que foi lido.
 */
export const clientClaritySnapshots = mysqlTable("client_clarity_snapshots", {
  id: int("id").autoincrement().primaryKey(),
  accountId: int("accountId").notNull(),
  dia: varchar("dia", { length: 10 }).notNull(),   // dia local (America/Sao_Paulo)
  dias: int("dias").default(1).notNull(),          // numOfDays usado (1|2|3)
  rangeStart: timestamp("rangeStart"),
  rangeEnd: timestamp("rangeEnd"),
  metricsJson: json("metricsJson"),
  topPagesJson: json("topPagesJson"),
  sourcesJson: json("sourcesJson"),
  issuesJson: json("issuesJson"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  uqSnapshot: uniqueIndex("uq_clarity_snapshot").on(table.accountId, table.dia, table.dias),
  idxAccountDia: index("idx_clarity_snap_conta_dia").on(table.accountId, table.dia),
}));
export type ClientClaritySnapshot = typeof clientClaritySnapshots.$inferSelect;
export type InsertClientClaritySnapshot = typeof clientClaritySnapshots.$inferInsert;

/**
 * Snapshot de performance técnica. Provider-agnóstico: `provider` diz de onde
 * veio, `metricsJson` guarda o formato normalizado (não o bruto do fornecedor).
 * Dedup por (conta, provider, url, estrategia, dia) — re-testar o dia atualiza.
 */
/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Robô de Monitoramento — configuração por cliente
 * ─────────────────────────────────────────────────────────────────────────────
 *  `ativo` nasce FALSE: uma conta nova nunca entra no robô por acidente. Na
 *  Fase 1 existem exatamente duas linhas com true (Aiká e Ultramalhas).
 *
 *  Tabela própria, e não mais colunas em `client_clarity_settings`: aquela já
 *  acumula Clarity + domínio + performance, e somar conformidade a ela criaria
 *  a próxima "tabela que faz tudo". As duas convivem — o domínio de EXIBIÇÃO
 *  continua lá; o domínio ESPERADO (o que o robô compara) mora aqui, porque são
 *  perguntas diferentes: uma é "onde fica o site", a outra é "para onde ele
 *  DEVE apontar".
 *
 *  `nsBaselineJson` é aprendido na primeira leitura, não configurado à mão:
 *  ninguém sabe de cor os nameservers de um cliente, e exigir isso garantiria
 *  configuração errada.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const siteComplianceSettings = mysqlTable("site_compliance_settings", {
  id: int("id").autoincrement().primaryKey(),
  accountId: int("accountId").notNull(),
  ativo: boolean("ativo").default(false).notNull(),
  /** Domínio registrável esperado (ex.: aikabodysoul.com), sem esquema nem www. */
  dominioEsperado: varchar("dominioEsperado", { length: 255 }),
  checarDns: boolean("checarDns").default(true).notNull(),
  checarRedirect: boolean("checarRedirect").default(true).notNull(),
  /** Varredura de blog: cara e específica de WordPress — só quem precisa. */
  checarConteudo: boolean("checarConteudo").default(false).notNull(),
  /** URL do blog. Null = deriva do domínio. */
  blogUrl: varchar("blogUrl", { length: 500 }),
  /** Nameservers/IPs conhecidos, aprendidos na 1ª leitura. */
  nsBaselineJson: json("nsBaselineJson"),
  /** Termos que NÃO devem alertar neste cliente (evita falso positivo por setor). */
  termosIgnoradosJson: json("termosIgnoradosJson"),
  /** Termos EXTRAS deste cliente, além da lista padrão de cassino/apostas. */
  termosExtrasJson: json("termosExtrasJson"),
  /** Posts, autores e categorias já conhecidos — define o que é "novo". */
  postsVistosJson: json("postsVistosJson"),
  /**
   * Conteúdo roda em ritmo próprio, mais lento que DNS/destino. Sem este carimbo
   * a varredura do blog aconteceria a cada 5 minutos junto com o resto — 288
   * leituras diárias de uma listagem inteira, para detectar algo que não muda
   * nessa velocidade.
   */
  ultimaVerificacaoConteudoEm: timestamp("ultimaVerificacaoConteudoEm"),
  /**
   * Achado crítico visto e ainda NÃO confirmado. Mora aqui, e não no snapshot
   * do dia, porque uma suspeita das 23h58 confirma às 00h03 — atravessa a
   * virada do dia, e um estado guardado por dia a perderia justo aí.
   */
  suspeitaJson: json("suspeitaJson"),
  /** Leituras consecutivas para um crítico virar alerta. Piso 2, no código. */
  confirmacoesNecessarias: int("confirmacoesNecessarias").default(2).notNull(),
  ultimaVerificacaoEm: timestamp("ultimaVerificacaoEm"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  uqConta: uniqueIndex("uq_compliance_account").on(table.accountId),
}));
export type SiteComplianceSettings = typeof siteComplianceSettings.$inferSelect;

export const clientSiteSnapshots = mysqlTable("client_site_snapshots", {
  id: int("id").autoincrement().primaryKey(),
  accountId: int("accountId").notNull(),
  provider: varchar("provider", { length: 20 }).notNull(),
  url: varchar("url", { length: 500 }).notNull(),
  estrategia: varchar("estrategia", { length: 10 }).default("mobile").notNull(),
  dia: varchar("dia", { length: 10 }).notNull(),
  metricsJson: json("metricsJson"),
  recommendationsJson: json("recommendationsJson"),
  issuesJson: json("issuesJson"),
  externalReportUrl: varchar("externalReportUrl", { length: 500 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  uqSnap: uniqueIndex("uq_site_snap").on(table.accountId, table.provider, table.url, table.estrategia, table.dia),
  idxConta: index("idx_site_snap_conta").on(table.accountId, table.dia),
}));
export type ClientSiteSnapshot = typeof clientSiteSnapshots.$inferSelect;
export type InsertClientSiteSnapshot = typeof clientSiteSnapshots.$inferInsert;

// ─── Contexto manual, notas e relatórios de site por cliente ─────────────────
// O que a máquina não sabe: objetivo, oferta, público, o que já foi testado.
// É isto que transforma número em diagnóstico — sem contexto, o relatório só
// descreve; com contexto, ele interpreta.

export const clientContext = mysqlTable("client_context", {
  id: int("id").autoincrement().primaryKey(),
  accountId: int("accountId").notNull(),      // → meta_ad_accounts.id
  objective: text("objective"),
  offer: text("offer"),
  audience: text("audience"),
  importantPagesJson: json("importantPagesJson"),
  conversionEventsJson: json("conversionEventsJson"),
  trackingNotes: text("trackingNotes"),
  currentHypotheses: text("currentHypotheses"),
  constraints: text("constraints"),
  previousTests: text("previousTests"),
  nextSteps: text("nextSteps"),
  updatedByUserId: int("updatedByUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  uqAccount: uniqueIndex("uq_client_context").on(table.accountId),
}));
export type ClientContext = typeof clientContext.$inferSelect;
export type InsertClientContext = typeof clientContext.$inferInsert;

export const clientNotes = mysqlTable("client_notes", {
  id: int("id").autoincrement().primaryKey(),
  accountId: int("accountId").notNull(),
  authorUserId: int("authorUserId").notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  idxConta: index("idx_client_notes_conta").on(table.accountId, table.createdAt),
}));
export type ClientNote = typeof clientNotes.$inferSelect;
export type InsertClientNote = typeof clientNotes.$inferInsert;

/** Histórico dos Relatórios de Site & Jornada. */
export const clientSiteReports = mysqlTable("client_site_reports", {
  id: int("id").autoincrement().primaryKey(),
  accountId: int("accountId").notNull(),
  rangeStart: varchar("rangeStart", { length: 10 }).notNull(),
  rangeEnd: varchar("rangeEnd", { length: 10 }).notNull(),
  generatedByUserId: int("generatedByUserId"),
  reportJson: json("reportJson"),
  markdown: text("markdown"),
  /** Quais fontes existiam de fato — o relatório não finge o que não tinha. */
  fontesJson: json("fontesJson"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  idxConta: index("idx_site_reports_conta").on(table.accountId, table.createdAt),
}));
export type ClientSiteReport = typeof clientSiteReports.$inferSelect;
export type InsertClientSiteReport = typeof clientSiteReports.$inferInsert;

/**
 * Chat por cliente. O histórico é do CLIENTE, não da pessoa: o time inteiro vê
 * o que já foi perguntado — pergunta repetida é sinal de que falta documentação.
 * accountId é o muro: o contexto de um cliente nunca entra no chat de outro.
 */
export const clientChatMessages = mysqlTable("client_chat_messages", {
  id: int("id").autoincrement().primaryKey(),
  accountId: int("accountId").notNull(),
  userId: int("userId").notNull(),          // quem perguntou (também nas respostas)
  role: mysqlEnum("role", ["user", "assistant"]).notNull(),
  content: text("content").notNull(),
  /** Fontes que a resposta teve à mão — o que sustenta a citação. */
  fontesJson: json("fontesJson"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  idxConta: index("idx_chat_conta").on(table.accountId, table.createdAt),
}));
export type ClientChatMessage = typeof clientChatMessages.$inferSelect;
export type InsertClientChatMessage = typeof clientChatMessages.$inferInsert;

/**
 * Configuração do resumo diário. Linha única (id=1) — é config da agência, não
 * de pessoa. O automático continua existindo; isto só tira o horário do código
 * e põe na mão do admin.
 */
export const dailyDigestSettings = mysqlTable("daily_digest_settings", {
  id: int("id").autoincrement().primaryKey(),
  autoEnabled: boolean("autoEnabled").default(true).notNull(),
  /** "HH:MM" no fuso abaixo. Default 09:25 — depois do sync, dentro do expediente. */
  defaultTime: varchar("defaultTime", { length: 5 }).default("09:25").notNull(),
  timezone: varchar("timezone", { length: 40 }).default("America/Sao_Paulo").notNull(),
  updatedByUserId: int("updatedByUserId"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type DailyDigestSettings = typeof dailyDigestSettings.$inferSelect;

/**
 * Exceção de um dia: feriado, folga, cliente pausado. Sem linha = segue o padrão.
 * `enabled=false` é o "amanhã não manda" sem desligar a rotina inteira.
 */
export const dailyDigestOverrides = mysqlTable("daily_digest_overrides", {
  id: int("id").autoincrement().primaryKey(),
  dia: varchar("dia", { length: 10 }).notNull(),      // YYYY-MM-DD local
  enabled: boolean("enabled").default(true).notNull(),
  timeOverride: varchar("timeOverride", { length: 5 }),
  excludedUserIdsJson: json("excludedUserIdsJson"),
  excludedClientIdsJson: json("excludedClientIdsJson"),
  createdByUserId: int("createdByUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  uqDia: uniqueIndex("uq_digest_override_dia").on(table.dia),
}));
export type DailyDigestOverride = typeof dailyDigestOverrides.$inferSelect;

/**
 * Recibo de envio do resumo. Existe porque o canal "somente email" não cria
 * alert — e sem alert não havia onde gravar emailSentAt, então o mesmo resumo
 * podia ser reenviado a cada clique. Este registro é independente do alert.
 */
export const dailyDigestRecipients = mysqlTable("daily_digest_recipients", {
  id: int("id").autoincrement().primaryKey(),
  dedupKey: varchar("dedupKey", { length: 180 }).notNull(),
  userId: int("userId").notNull(),
  email: varchar("email", { length: 320 }),
  /**
   * sent | failed | dry_run | paused | blocked | skipped
   * SÓ `sent` consome a trava de duplicata — os outros não entregaram nada.
   * Ver emailDigestJaEnviado.
   */
  status: varchar("status", { length: 12 }).default("sent").notNull(),
  sentAt: timestamp("sentAt").defaultNow().notNull(),
}, (table) => ({
  uqEnvio: uniqueIndex("uq_digest_recipient").on(table.dedupKey, table.userId),
}));
export type DailyDigestRecipient = typeof dailyDigestRecipients.$inferSelect;

/**
 * Auditoria de TODO envio de email — uma linha por destinatário final.
 *
 * Existe porque `sendEmail` engolia a falha num `return false`: o job registrava
 * sucesso, o email não chegava, e o único vestígio era um console.error que o
 * Railway apaga a cada deploy. Sem registro durável, ninguém consegue responder
 * "por que não chegou?".
 *
 * Uma linha POR DESTINATÁRIO (nunca CC/BCC): se um endereço falha e o outro
 * entrega, os dois aparecem, com o motivo de quem falhou.
 */
export const emailSendLog = mysqlTable("email_send_log", {
  id: int("id").autoincrement().primaryKey(),
  /** Rótulo do envio: digest, financeiro, comunicado, teste… — agrupa o diagnóstico. */
  tipo: varchar("tipo", { length: 40 }).default("outro").notNull(),
  assunto: varchar("assunto", { length: 255 }).notNull(),
  /** Para quem o sistema QUIS mandar. */
  destinatarioOriginal: varchar("destinatarioOriginal", { length: 320 }).notNull(),
  /** Para quem realmente foi (difere quando EMAIL_TEST_RECIPIENT desvia). */
  destinatarioFinal: varchar("destinatarioFinal", { length: 320 }).notNull(),
  redirecionado: boolean("redirecionado").default(false).notNull(),
  /**
   * sent | failed | dry_run | paused | blocked | skipped
   *
   * `blocked` e `skipped` são diferentes de propósito: bloqueado é erro de
   * CONFIGURAÇÃO (destinatário fora de admin/dev, provider errado) e pede ação;
   * pulado é ausência de destinatário e é estado normal. Tratar os dois como
   * "falhou" faria o time parar de olhar para os dois.
   */
  status: varchar("status", { length: 12 }).notNull(),
  /**
   * Modo de destinatários em vigor no momento do envio (ex.: admin_dev). Sem
   * isto, um `blocked` no histórico não diz sob qual regra foi bloqueado — e a
   * regra muda entre fases.
   */
  recipientMode: varchar("recipientMode", { length: 16 }),
  /** gmail | resend | smtp | nenhum — por onde a entrega saiu (ou tentou sair). */
  transporte: varchar("transporte", { length: 12 }).default("smtp").notNull(),
  /**
   * Endereço que assinou o envio. Com mais de um provider ativo, "quem mandou"
   * deixa de ser dedutível do tipo: Resend usa EMAIL_FROM, Gmail usa a conta
   * conectada. Sem esta coluna, um envio pelo remetente errado só apareceria na
   * caixa de quem recebeu.
   */
  remetente: varchar("remetente", { length: 320 }),
  /** Quanto a entrega demorou. Diferencia "falhou" de "travou". */
  duracaoMs: int("duracaoMs"),
  /** Digest: papel de quem recebeu e quais blocos entraram — o "por que este conteúdo". */
  role: varchar("role", { length: 20 }),
  blocos: varchar("blocos", { length: 160 }),
  /** Mensagem real do SMTP quando falha — o que faltava para diagnosticar. */
  erro: text("erro"),
  userId: int("userId"),
  messageId: varchar("messageId", { length: 255 }),
  criadoEm: timestamp("criadoEm").defaultNow().notNull(),
}, (table) => ({
  idxCriado: index("idx_email_log_criado").on(table.criadoEm),
  idxTipo: index("idx_email_log_tipo").on(table.tipo, table.criadoEm),
}));
export type EmailSendLogRow = typeof emailSendLog.$inferSelect;

/**
 * ─── Conexões de e-commerce (F5-B) ───────────────────────────────────────────
 *
 * Genérica DE PROPÓSITO: `platform` começa com "woocommerce", mas Shopify,
 * Nuvemshop e Wix entram sem migração. Nenhum cliente é fixo no código — a
 * tela /lojas cadastra qualquer accountId.
 *
 * As DUAS credenciais são criptografadas (AES-256-GCM, integrationsCrypto).
 * A consumer_key volta ao frontend só MASCARADA; o consumer_secret não volta
 * nunca — nem na edição, que mostra "chave cadastrada".
 *
 * A plataforma será a FONTE PRIMÁRIA de pedidos/receita quando a importação
 * abrir; o GA4 fica como fonte inicial/funil. Nunca somar as duas.
 */
export const ecommerceConnections = mysqlTable("ecommerce_connections", {
  id: int("id").autoincrement().primaryKey(),
  /** Cliente do Tracker (meta_ad_accounts.id). Qualquer um — nada fixo. */
  accountId: int("accountId").notNull(),
  platform: varchar("platform", { length: 20 }).default("woocommerce").notNull(),
  /** HTTPS obrigatório; valida no urlGuard na criação E no teste. */
  storeUrl: varchar("storeUrl", { length: 500 }).notNull(),
  consumerKeyEncrypted: text("consumerKeyEncrypted").notNull(),
  consumerSecretEncrypted: text("consumerSecretEncrypted").notNull(),
  status: varchar("status", { length: 12 }).default("ativa").notNull(),
  lastTestAt: timestamp("lastTestAt"),
  /** ok | erro — o erro guardado NUNCA contém credencial. */
  lastTestStatus: varchar("lastTestStatus", { length: 8 }),
  lastTestError: varchar("lastTestError", { length: 300 }),
  /**
   * Diagnóstico do último teste BEM-SUCEDIDO. Existe porque o resultado do
   * teste da Wix ia para um toast e sumia — e era justamente ele que orientava
   * como escrever o adaptador. Guarda ESTRUTURA (campos e tipos), nunca valores
   * de pedido.
   */
  lastTestDetail: text("lastTestDetail"),
  /**
   * Sync ≠ teste: o teste diz se a credencial funciona; o sync, se a última
   * IMPORTAÇÃO funcionou. Vão divergir — por isso são colunas separadas.
   * Falha de sync não apaga o lastSyncAt anterior.
   */
  lastSyncAt: timestamp("lastSyncAt"),
  lastSyncStatus: varchar("lastSyncStatus", { length: 8 }),
  lastSyncError: varchar("lastSyncError", { length: 300 }),
  createdBy: int("createdBy"),
  updatedBy: int("updatedBy"),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  /** Uma loja por plataforma por cliente. Relaxar é fácil; voltar não é. */
  uqContaPlataforma: uniqueIndex("uq_ecom_conta_plataforma").on(table.accountId, table.platform),
}));
export type EcommerceConnection = typeof ecommerceConnections.$inferSelect;
export type InsertEcommerceConnection = typeof ecommerceConnections.$inferInsert;

// ─── Configurações simples (key-value) — ex.: slide "Você prefere?" da SELVA TV ─
export const appSettings = mysqlTable("app_settings", {
  settingKey: varchar("settingKey", { length: 191 }).primaryKey(),
  valueJson: json("valueJson"),
  updatedByUserId: int("updatedByUserId"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type AppSettingRow = typeof appSettings.$inferSelect;

// Meta Ads accounts connected by each user
export const metaAdAccounts = mysqlTable("meta_ad_accounts", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  accountId: varchar("accountId", { length: 64 }).notNull(),
  accountName: varchar("accountName", { length: 255 }),
  accessToken: text("accessToken").notNull(),
  tokenExpiresAt: timestamp("tokenExpiresAt"),
  currency: varchar("currency", { length: 8 }),
  timezone: varchar("timezone", { length: 64 }),
  isActive: boolean("isActive").default(true).notNull(),
  lastSyncAt: timestamp("lastSyncAt"),
  aiStatusSummary: text("aiStatusSummary"),
  aiStatusColor: mysqlEnum("aiStatusColor", ["green", "yellow", "red"]),
  /**
   * Quando a leitura de IA foi gerada.
   *
   * Existe para responder "esta análise já viu o contexto atual?". Sem ela, o
   * Panorama continuava exibindo a leitura anterior depois de alguém salvar
   * contexto — errada por um motivo invisível, e a única forma de perceber era
   * reparar que o texto não mudou. Comparada com `account_context.updatedAt`.
   */
  aiStatusAt: timestamp("aiStatusAt"),
  accountNote: text("accountNote"),
  goalTypeOverride: varchar("goalTypeOverride", { length: 64 }),
  /**
   * Conta que existe SÓ para monitoramento de site — sem mídia.
   *
   * O caso: Aiká não tem campanha, mas precisa de domínio, snapshots e alertas
   * técnicos. Sem esta marca, ela entraria nos 7 enumeradores de sync de mídia
   * e produziria erro de sync e alerta de "token expirado" todo dia — ruído que
   * ensinaria o time a ignorar alerta de verdade.
   *
   * `accessToken` fica vazio de propósito: a coluna é NOT NULL, mas nenhum
   * caminho de mídia alcança esta conta, então o valor nunca é usado.
   *
   * NÃO exclui da listagem: a conta precisa ser selecionável para a área Site
   * dela existir, e o Panorama deve poder citá-la em saúde técnica.
   */
  somenteMonitoramento: boolean("somenteMonitoramento").default(false).notNull(),
  /** Foto vinda da Meta. Pode ser sobrescrita a cada import de contas. */
  pictureUrl: varchar("pictureUrl", { length: 1024 }),
  /**
   * Foto ENVIADA à mão (key no storage), separada da `pictureUrl` de propósito:
   * o import de contas reescreve a da Meta, e uma foto escolhida pelo time não
   * pode sumir porque alguém renovou o token. Quando existe, ganha da Meta.
   */
  pictureKey: varchar("pictureKey", { length: 512 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type MetaAdAccount = typeof metaAdAccounts.$inferSelect;
export type InsertMetaAdAccount = typeof metaAdAccounts.$inferInsert;

// Campaigns fetched from Meta Ads API
export const campaigns = mysqlTable("campaigns", {
  id: int("id").autoincrement().primaryKey(),
  accountId: int("accountId").notNull(),
  metaCampaignId: varchar("metaCampaignId", { length: 64 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  status: mysqlEnum("status", ["ACTIVE", "PAUSED", "DELETED", "ARCHIVED"]).default("ACTIVE"),
  objective: varchar("objective", { length: 64 }),
  // optimization_goal comes from the adsets (performance_goal) — more specific than objective
  // e.g. OFFSITE_CONVERSIONS, LEAD_GENERATION, REPLIES, LINK_CLICKS, etc.
  optimizationGoal: varchar("optimizationGoal", { length: 64 }),
  // Human-readable label for the result type shown in dashboard
  // e.g. "Compras no site", "Mensagens", "Leads"
  resultLabel: varchar("resultLabel", { length: 128 }),
  dailyBudget: decimal("dailyBudget", { precision: 12, scale: 2 }),
  lifetimeBudget: decimal("lifetimeBudget", { precision: 12, scale: 2 }),
  startTime: timestamp("startTime"),
  stopTime: timestamp("stopTime"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  uqMetaCampaign: uniqueIndex("uq_meta_campaign_account").on(table.metaCampaignId, table.accountId),
}));

export type Campaign = typeof campaigns.$inferSelect;
export type InsertCampaign = typeof campaigns.$inferInsert;

// Daily metrics per campaign (historical storage)
export const campaignMetrics = mysqlTable("campaign_metrics", {
  id: int("id").autoincrement().primaryKey(),
  campaignId: int("campaignId").notNull(),
  accountId: int("accountId").notNull(),
  date: varchar("date", { length: 10 }).notNull(), // YYYY-MM-DD
  impressions: bigint("impressions", { mode: "number" }).default(0),
  clicks: bigint("clicks", { mode: "number" }).default(0),
  spend: decimal("spend", { precision: 12, scale: 2 }).default("0"),
  conversions: decimal("conversions", { precision: 12, scale: 4 }).default("0"),
  conversionValue: decimal("conversionValue", { precision: 12, scale: 2 }).default("0"),
  reach: bigint("reach", { mode: "number" }).default(0),
  frequency: decimal("frequency", { precision: 8, scale: 4 }).default("0"),
  ctr: decimal("ctr", { precision: 8, scale: 4 }).default("0"),
  cpc: decimal("cpc", { precision: 10, scale: 4 }).default("0"),
  cpm: decimal("cpm", { precision: 10, scale: 4 }).default("0"),
  cpa: decimal("cpa", { precision: 12, scale: 4 }).default("0"),
   roas: decimal("roas", { precision: 10, scale: 4 }).default("0"),
  profileVisits: bigint("profile_visits", { mode: "number" }).default(0),
  followers: bigint("followers", { mode: "number" }).default(0),
  messages: bigint("messages", { mode: "number" }).default(0),
  linkClicks: bigint("link_clicks", { mode: "number" }).default(0),
  addToCart: bigint("add_to_cart", { mode: "number" }).default(0),
  landingPageViews: bigint("landing_page_views", { mode: "number" }).default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  uqCampaignDate: uniqueIndex("uq_campaign_date").on(table.campaignId, table.date),
}));
export type CampaignMetrics = typeof campaignMetrics.$inferSelect;
export type InsertCampaignMetrics = typeof campaignMetrics.$inferInsert;

// Anomalies detected by the analysis engine
export const anomalies = mysqlTable("anomalies", {
  id: int("id").autoincrement().primaryKey(),
  accountId: int("accountId").notNull(),
  campaignId: int("campaignId"),
  type: mysqlEnum("type", [
    "ROAS_DROP",
    "CPA_SPIKE",
    "CTR_DROP",
    "SPEND_SPIKE",
    "DELIVERY_CHANGE",
    "FREQUENCY_HIGH",
    "CONVERSION_DROP",
    "BUDGET_EXHAUSTED",
    "PERFORMANCE_DROP",
    "RESULTS_DROP",
  ]).notNull(),
  severity: mysqlEnum("severity", ["LOW", "MEDIUM", "HIGH", "CRITICAL"]).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description").notNull(),
  metricName: varchar("metricName", { length: 64 }),
  currentValue: decimal("currentValue", { precision: 12, scale: 4 }),
  previousValue: decimal("previousValue", { precision: 12, scale: 4 }),
  changePercent: decimal("changePercent", { precision: 8, scale: 2 }),
  detectedAt: timestamp("detectedAt").defaultNow().notNull(),
  resolvedAt: timestamp("resolvedAt"),
  isRead: boolean("isRead").default(false).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  isResolved: boolean("isResolved").default(false).notNull(),
  // Controle de envio de email: null = ainda não enviado, data = já enviado (enviar apenas uma vez)
  emailSentAt: timestamp("emailSentAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type Anomaly = typeof anomalies.$inferSelect;
export type InsertAnomaly = typeof anomalies.$inferInsert;

// AI-generated suggestions for campaign improvement
export const aiSuggestions = mysqlTable("ai_suggestions", {
  id: int("id").autoincrement().primaryKey(),
  accountId: int("accountId").notNull(),
  campaignId: int("campaignId"),
  category: mysqlEnum("category", [
    "BUDGET",
    "TARGETING",
    "CREATIVE",
    "BIDDING",
    "SCHEDULE",
    "AUDIENCE",
    "GENERAL",
  ]).notNull(),
  priority: mysqlEnum("priority", ["LOW", "MEDIUM", "HIGH"]).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description").notNull().default(""),
  expectedImpact: text("expectedImpact"),
  actionItems: json("actionItems"),
  // Status: pending = aguardando decisão, applied = marcado como aplicado, rejected = marcado como não aplicado
  status: mysqlEnum("status", ["pending", "applied", "rejected"]).default("pending").notNull(),
  // Justificativa opcional quando marcado como rejected
  rejectionReason: text("rejectionReason"),
  // Quando foi marcado como aplicado
  appliedAt: timestamp("appliedAt"),
  // Monitoramento pós-aplicação: até quando monitorar (appliedAt + 7 dias)
  monitorUntil: timestamp("monitorUntil"),
  // Snapshot das métricas no momento da aplicação (para comparar depois)
  metricsSnapshot: json("metricsSnapshot"),
  // Resultado do monitoramento após 7 dias (gerado automaticamente)
  monitorResult: text("monitorResult"),
  // Data de expiração do histórico (generatedAt + 30 dias)
  expiresAt: timestamp("expiresAt"),
  // Campos legados mantidos para compatibilidade
  isApplied: boolean("isApplied").default(false).notNull(),
  isDismissed: boolean("isDismissed").default(false).notNull(),
  generatedAt: timestamp("generatedAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AiSuggestion = typeof aiSuggestions.$inferSelect;
export type InsertAiSuggestion = typeof aiSuggestions.$inferInsert;

// Scheduled reports configuration
export const scheduledReports = mysqlTable("scheduled_reports", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  accountId: int("accountId").notNull(),
  frequency: mysqlEnum("frequency", ["DAILY", "WEEKLY"]).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  // Horário personalizável (0-23 para hora, 0-59 para minuto)
  scheduleHour: int("scheduleHour").default(8).notNull(),
  scheduleMinute: int("scheduleMinute").default(0).notNull(),
  // Dia da semana para agendamento semanal (0=domingo, 1=segunda, ..., 6=sábado)
  scheduleDay: int("scheduleDay").default(1).notNull(),
  lastRunAt: timestamp("lastRunAt"),
  nextRunAt: timestamp("nextRunAt"),
  lastReportContent: text("lastReportContent"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ScheduledReport = typeof scheduledReports.$inferSelect;
export type InsertScheduledReport = typeof scheduledReports.$inferInsert;

// Alert notifications
export const alerts = mysqlTable("alerts", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  // NULL para notificação sem conta de mídia (ex.: domínio FINANCEIRO).
  accountId: int("accountId"),
  anomalyId: int("anomalyId"),
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message").notNull(),
  type: mysqlEnum("type", [
    "ANOMALY",
    "REPORT",
    "SYNC_ERROR",
    "BUDGET_WARNING",
    "CAMPAIGN_PAUSED",
    "PAYMENT_FAILED",
    "AD_REJECTED",
    "AD_ERROR",
    "PAGE_UNLINKED",
    "INSTAGRAM_UNLINKED",
    "PIXEL_ERROR",
    "ADSET_NO_DELIVERY",
    "SUGGESTION_APPLIED",
    "EXPERIMENT_UPDATE",
    "SYNC_COMPLETE",
    // Sistema de notificações: relatórios e financeiro.
    "DAILY_BRIEFING",
    "WEEKLY_REPORT",
    "FINANCE_OVERDUE",
    // Hub pessoal: tarefas (Trello), comunicados e aniversários.
    "TRELLO_DUE",
    "TRELLO_RECONNECT",
    "COMUNICADO",
    "BIRTHDAY",
    // Site (Clarity): fricção e risco de medição.
    "CLARITY_ISSUE",
    "TRACKING_PROBLEM",
  ]).notNull(),
  severity: mysqlEnum("severity", ["INFO", "WARNING", "CRITICAL"]).notNull(),
  // Prioridade do alerta: CRITICAL=imediato, HIGH=até 30min, MEDIUM=consolidado a cada 2h
  priority: mysqlEnum("priority", ["CRITICAL", "HIGH", "MEDIUM", "LOW"]).default("LOW").notNull(),
  // Ação sugerida para resolver o alerta
  suggestedAction: text("suggestedAction"),
  // Métrica atual vs referência (para alertas de performance)
  metricCurrent: varchar("metricCurrent", { length: 128 }),
  metricReference: varchar("metricReference", { length: 128 }),
   isRead: boolean("isRead").default(false).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  // Controle de envio de email: null = ainda não enviado, data = já enviado (enviar apenas uma vez)
  emailSentAt: timestamp("emailSentAt"),
  // Sistema de notificações: eixo de produto + dedup por (tipo, referência, dia).
  dominio: mysqlEnum("dominio", ["PERFORMANCE", "FINANCEIRO", "TAREFAS", "COMUNICADO", "SITE"]).default("PERFORMANCE").notNull(),
  dedupKey: varchar("dedupKey", { length: 180 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  idxUserRead: index("idx_alerts_user_read").on(table.userId, table.isRead),
  idxDominio: index("idx_alerts_dominio").on(table.dominio),
  idxDedup: index("idx_alerts_dedup").on(table.dedupKey),
  idxCreated: index("idx_alerts_created").on(table.createdAt),
}));
export type Alert = typeof alerts.$inferSelect;
export type InsertAlert = typeof alerts.$inferInsert;

// ─── Dashboard Builder de Tráfego Pago ──────────────────────────────────────
// Módulo independente para geração de dashboards analíticos em PDF.
export const dashboardReports = mysqlTable("dashboard_reports", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  clientName: varchar("clientName", { length: 255 }).notNull(),
  weeklyContext: text("weeklyContext").notNull(),
  mode: mysqlEnum("mode", ["SINGLE", "COMPARATIVE"]).notNull().default("SINGLE"),
  platform: varchar("platform", { length: 100 }),
  // URLs das imagens enviadas (JSON array de strings) — armazenado como JSON string
  imageUrls: text("imageUrls").notNull(),
  // Conteúdo do relatório gerado pelo LLM (JSON estruturado)
  reportJson: text("reportJson"),
  // URL do PDF gerado no S3
  pdfUrl: text("pdfUrl"),
  // Status do processamento
  status: mysqlEnum("status", ["PENDING", "PROCESSING", "DONE", "ERROR"]).notNull().default("PENDING"),
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type DashboardReport = typeof dashboardReports.$inferSelect;
export type InsertDashboardReport = typeof dashboardReports.$inferInsert;

// ─── Google Ads Accounts ──────────────────────────────────────────────────────
/**
 * Conta do Google Ads descoberta no MCC. O MCC tem MUITO mais conta que o
 * Spaces tem cliente (23 × ~10), incluindo contas antigas — por isso a lista
 * crua nunca é mostrada a usuário comum.
 *
 * `linkedAccountId` é o vínculo com o cliente do Tracker (meta_ad_accounts.id).
 * Sem vínculo, a conta existe mas não aparece para ninguém além do admin.
 * `ignored` marca as contas velhas que não queremos nem ver na gestão.
 */
export const googleAdAccounts = mysqlTable("google_ad_accounts", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  customerId: varchar("customerId", { length: 20 }).notNull(), // e.g. "123-456-7890" or "1234567890"
  accountName: varchar("accountName", { length: 255 }),
  refreshToken: text("refreshToken").notNull(),
  currency: varchar("currency", { length: 8 }).default("BRL"),
  timezone: varchar("timezone", { length: 64 }).default("America/Sao_Paulo"),
  /** Cliente do Tracker a que esta conta pertence (meta_ad_accounts.id). */
  linkedAccountId: int("linkedAccountId"),
  /** Conta velha/sem uso: some da gestão sem precisar apagar. */
  ignored: boolean("ignored").default(false).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  lastSyncAt: timestamp("lastSyncAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type GoogleAdAccount = typeof googleAdAccounts.$inferSelect;
export type InsertGoogleAdAccount = typeof googleAdAccounts.$inferInsert;

// ─── GA4 Analytics Accounts ──────────────────────────────────────────────────
export const ga4Accounts = mysqlTable("ga4_accounts", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  propertyId: varchar("propertyId", { length: 20 }).notNull(), // GA4 property ID
  propertyName: varchar("propertyName", { length: 255 }),
  websiteUrl: varchar("websiteUrl", { length: 512 }),
  /**
   * Cliente (meta_ad_accounts.id) dono desta propriedade. NULL = descoberta mas
   * ainda não vinculada — o vínculo é sempre manual, como no google_ad_accounts.
   *
   * Sem esta coluna não há como dizer "esta propriedade é deste cliente", e o
   * GA4 não tem como virar fonte confiável no dashboard.
   */
  linkedAccountId: int("linkedAccountId"),
  /**
   * @deprecated Texto puro. Mantida nullable só para não quebrar registro
   * anterior à criptografia — nada novo escreve aqui.
   */
  refreshToken: text("refreshToken"),
  /** AES-256-GCM, mesmo padrão de user_integrations.refreshTokenEncrypted. */
  refreshTokenEncrypted: text("refreshTokenEncrypted"),
  currency: varchar("currency", { length: 8 }).default("BRL"),
  timezone: varchar("timezone", { length: 64 }).default("America/Sao_Paulo"),
  isActive: boolean("isActive").default(true).notNull(),
  lastSyncAt: timestamp("lastSyncAt"),
  /** success | error — mesmo padrão de client_clarity_settings. */
  lastSyncStatus: varchar("lastSyncStatus", { length: 16 }),
  /** Mensagem real da API quando falha. Falha NÃO apaga o lastSyncAt anterior. */
  lastSyncError: varchar("lastSyncError", { length: 500 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  /** A mesma propriedade não pode virar duas linhas ao redescobrir. */
  uqProperty: uniqueIndex("uq_ga4_property").on(table.propertyId),
}));
export type GA4Account = typeof ga4Accounts.$inferSelect;
export type InsertGA4Account = typeof ga4Accounts.$inferInsert;

// ─── Experiments ─────────────────────────────────────────────────────────────
export const experiments = mysqlTable("experiments", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  accountId: int("accountId").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  centralQuestion: text("centralQuestion"),
  hypothesis: text("hypothesis"),
  startDate: varchar("startDate", { length: 10 }).notNull(),
  endDate: varchar("endDate", { length: 10 }).notNull(),
  status: mysqlEnum("status", ["planned", "active", "completed", "paused"]).notNull().default("planned"),
  dailyBudget: decimal("dailyBudget", { precision: 10, scale: 2 }),
  totalBudget: decimal("totalBudget", { precision: 10, scale: 2 }),
  channels: json("channels").$type<string[]>(),
  campaignIds: json("campaignIds").$type<number[]>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Experiment = typeof experiments.$inferSelect;
export type InsertExperiment = typeof experiments.$inferInsert;

export const experimentKpis = mysqlTable("experiment_kpis", {
  id: int("id").autoincrement().primaryKey(),
  experimentId: int("experimentId").notNull(),
  metric: varchar("metric", { length: 64 }).notNull(),
  unit: varchar("unit", { length: 8 }).notNull().default("#"),
  minSignal: decimal("minSignal", { precision: 10, scale: 4 }),
  goal: decimal("goal", { precision: 10, scale: 4 }).notNull(),
});
export type ExperimentKpi = typeof experimentKpis.$inferSelect;
export type InsertExperimentKpi = typeof experimentKpis.$inferInsert;

export const experimentCheckpoints = mysqlTable("experiment_checkpoints", {
  id: int("id").autoincrement().primaryKey(),
  experimentId: int("experimentId").notNull(),
  date: varchar("date", { length: 10 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  qualitativeNote: text("qualitativeNote"),
  snapshotData: json("snapshotData").$type<Record<string, number>>(),
  status: mysqlEnum("status", ["pending", "active", "done"]).notNull().default("pending"),
});
export type ExperimentCheckpoint = typeof experimentCheckpoints.$inferSelect;
export type InsertExperimentCheckpoint = typeof experimentCheckpoints.$inferInsert;

export const experimentDecisions = mysqlTable("experiment_decisions", {
  id: int("id").autoincrement().primaryKey(),
  experimentId: int("experimentId").notNull(),
  scenario: varchar("scenario", { length: 255 }).notNull(),
  reading: text("reading"),
  nextStep: text("nextStep"),
  isCurrent: boolean("isCurrent").default(false).notNull(),
});
export type ExperimentDecision = typeof experimentDecisions.$inferSelect;
export type InsertExperimentDecision = typeof experimentDecisions.$inferInsert;

export const dailyBriefings = mysqlTable("daily_briefings", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  date: varchar("date", { length: 10 }).notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  uqUserDate: uniqueIndex("uq_user_date_briefing").on(table.userId, table.date),
}));
export type DailyBriefing = typeof dailyBriefings.$inferSelect;

/**
 * Cache do briefing SEGMENTADO — um texto por (dia, conjunto de contas).
 *
 * Tabela separada em vez de uma coluna em `daily_briefings` porque aquela tem
 * única em (userId, date): acrescentar o segmento exigiria derrubar e recriar
 * um índice único numa tabela viva. Aqui é só CREATE TABLE IF NOT EXISTS.
 *
 * `segmentKey` é o hash dos accountIds ordenados. Chave derivada do CONJUNTO,
 * não da pessoa: todo mundo do mesmo grupo lê a mesma linha e o dia gasta uma
 * chamada de LLM por grupo, não uma por destinatário.
 */
export const dailyBriefingSegments = mysqlTable("daily_briefing_segments", {
  id: int("id").autoincrement().primaryKey(),
  date: varchar("date", { length: 10 }).notNull(),
  segmentKey: varchar("segmentKey", { length: 64 }).notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  uqDiaSegmento: uniqueIndex("uq_briefing_segment").on(table.date, table.segmentKey),
}));

// ─── Account Thresholds ───────────────────────────────────────────────────────
export const accountThresholds = mysqlTable("account_thresholds", {
  id: int("id").autoincrement().primaryKey(),
  accountId: int("accountId").notNull().unique(),
  // ROAS
  roasGood: decimal("roasGood", { precision: 8, scale: 2 }),
  roasRegular: decimal("roasRegular", { precision: 8, scale: 2 }),
  // CPA
  cpaGood: decimal("cpaGood", { precision: 10, scale: 2 }),
  cpaRegular: decimal("cpaRegular", { precision: 10, scale: 2 }),
  // CTR
  ctrGood: decimal("ctrGood", { precision: 6, scale: 2 }),
  ctrRegular: decimal("ctrRegular", { precision: 6, scale: 2 }),
  // CPL (leads)
  cplGood: decimal("cplGood", { precision: 10, scale: 2 }),
  cplRegular: decimal("cplRegular", { precision: 10, scale: 2 }),
  // CPM
  cpmGood: decimal("cpmGood", { precision: 10, scale: 2 }),
  cpmRegular: decimal("cpmRegular", { precision: 10, scale: 2 }),
  // Saldo baixo (apenas contas pré-pagas) — valor em R$ abaixo do qual o alerta dispara
  lowBalanceThreshold: decimal("lowBalanceThreshold", { precision: 10, scale: 2 }).default("200.00"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type AccountThreshold = typeof accountThresholds.$inferSelect;
export type InsertAccountThreshold = typeof accountThresholds.$inferInsert;

// ─── Notification Settings ────────────────────────────────────────────────────
export const notificationSettings = mysqlTable("notification_settings", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  emailDestination: varchar("emailDestination", { length: 320 }),
  // Toggles
  alertCpaEnabled: boolean("alertCpaEnabled").default(true).notNull(),
  alertRoasEnabled: boolean("alertRoasEnabled").default(true).notNull(),
  alertTokenExpiredEnabled: boolean("alertTokenExpiredEnabled").default(true).notNull(),
  alertBudgetEnabled: boolean("alertBudgetEnabled").default(false).notNull(),
  // Thresholds de disparo
  alertCpaThreshold: decimal("alertCpaThreshold", { precision: 10, scale: 2 }),
  alertRoasThreshold: decimal("alertRoasThreshold", { precision: 8, scale: 2 }),
  alertBudgetPercent: int("alertBudgetPercent").default(85),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type NotificationSettings = typeof notificationSettings.$inferSelect;
export type InsertNotificationSettings = typeof notificationSettings.$inferInsert;

/**
 * Preferência de notificação por (usuário × tipo × canal). Tipo é o eixo de
 * produto de shared/notifications.ts (NOTIF_TIPOS), não o alerts.type técnico.
 * Ausência de linha = usa o default do catálogo — só gravamos o que foi mexido.
 */
export const notificationPrefs = mysqlTable("notification_prefs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  tipo: varchar("tipo", { length: 40 }).notNull(),
  inApp: boolean("inApp").default(true).notNull(),
  // Mantida por compatibilidade: emailModo != "off" é a fonte de verdade.
  email: boolean("email").default(false).notNull(),
  // "off" | "hora" | "digest" — quem escolhe é a pessoa, por tipo.
  emailModo: varchar("emailModo", { length: 10 }).default("off").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  uqUserTipo: uniqueIndex("uq_notif_pref_user_tipo").on(table.userId, table.tipo),
}));
export type NotificationPref = typeof notificationPrefs.$inferSelect;
export type InsertNotificationPref = typeof notificationPrefs.$inferInsert;

/**
 * Widget da visão geral do Tracker ligado/desligado por pessoa.
 * Mesmo modelo do notification_prefs: ausência de linha = default do catálogo
 * (shared/widgets.ts). Só gravamos o que foi mexido, então mudar o default
 * depois vale para quem nunca personalizou — e não atropela quem personalizou.
 */
export const dashboardWidgetPrefs = mysqlTable("dashboard_widget_prefs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  widgetKey: varchar("widgetKey", { length: 40 }).notNull(),
  visivel: boolean("visivel").default(true).notNull(),
  /** NULL = usa a ordem do catálogo. */
  ordem: int("ordem"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  uqUserWidget: uniqueIndex("uq_widget_pref_user_key").on(table.userId, table.widgetKey),
}));
export type DashboardWidgetPref = typeof dashboardWidgetPrefs.$inferSelect;
export type InsertDashboardWidgetPref = typeof dashboardWidgetPrefs.$inferInsert;

/**
 * Perfil de rede social de um cliente. Substitui o mapa hardcoded em
 * shared/pageMapping.ts ("Last updated: 2026-05-06"), que só era editável por
 * deploy — quem sabe o @ do cliente é a equipe, não o repositório.
 *
 * `provider` já nasce aberto (instagram hoje; linkedin/youtube depois) para
 * não precisar de outra tabela quando chegarem.
 *
 * `externalId` guarda o id da Graph API quando resolvido. Fica separado do
 * handle de propósito: o @ muda, o id não.
 */
export const clientSocialAccounts = mysqlTable("client_social_accounts", {
  id: int("id").autoincrement().primaryKey(),
  accountId: int("accountId").notNull(),
  provider: varchar("provider", { length: 20 }).default("instagram").notNull(),
  handle: varchar("handle", { length: 120 }).notNull(),
  profileUrl: varchar("profileUrl", { length: 500 }),
  externalId: varchar("externalId", { length: 64 }),
  enabled: boolean("enabled").default(true).notNull(),
  notes: text("notes"),

  /** Página do Facebook — é por ela que a Meta expõe o Instagram profissional. */
  pageId: varchar("pageId", { length: 64 }),
  pageName: varchar("pageName", { length: 255 }),
  instagramUserId: varchar("instagramUserId", { length: 64 }),
  instagramUsername: varchar("instagramUsername", { length: 120 }),

  /**
   * DOIS eixos, de propósito (ver shared/instagram.ts):
   *   `tipoConta`     QUEM é o perfil — Business, Creator, pessoal
   *   `statusInsight` o que a API ENTREGA hoje
   * Um campo só obrigaria a inventar um valor por combinação, e o primeiro caso
   * não previsto viraria "desconhecido" — que é como estado legítimo vira erro.
   */
  tipoConta: varchar("tipoConta", { length: 16 }).default("DESCONHECIDO").notNull(),
  statusInsight: varchar("statusInsight", { length: 16 }).default("NAO_TESTADO").notNull(),

  /** De onde veio a credencial. Prepara OAuth por cliente sem migração. */
  /**
   * De onde vêm os dados deste vínculo: `agencia_system_user` ou `oauth_conta`.
   * Nasceu como `tokenSource`/"agencia"; renomeado porque descreve a CONEXÃO,
   * não só o token — e a fonte por conta muda mais que a credencial.
   */
  connectionSource: varchar("connectionSource", { length: 24 }).default("agencia_system_user").notNull(),

  lastTestAt: timestamp("lastTestAt"),
  lastTestStatus: varchar("lastTestStatus", { length: 8 }),
  lastTestDetail: text("lastTestDetail"),
  lastSyncAt: timestamp("lastSyncAt"),
  lastSyncStatus: varchar("lastSyncStatus", { length: 8 }),
  lastSyncError: varchar("lastSyncError", { length: 500 }),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  uqContaProvider: uniqueIndex("uq_social_conta_provider").on(table.accountId, table.provider, table.handle),
  idxConta: index("idx_social_conta").on(table.accountId),
}));
/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Credencial de Redes Sociais — UMA linha, separada de Meta Ads
 * ─────────────────────────────────────────────────────────────────────────────
 *  Tabela própria, e não colunas em `client_social_accounts`, porque o token é
 *  DA AGÊNCIA e não do cliente. Guardá-lo por cliente significaria a mesma
 *  chave copiada em dez linhas — que foi exatamente como o portfólio acabou com
 *  dois tokens diferentes sem ninguém perceber.
 *
 *  Separada de Meta Ads por decisão de produto: campanhas caindo não podem
 *  derrubar o orgânico, e vice-versa. Cada frente com token, diagnóstico e
 *  permissões próprias.
 *
 *  CIFRADA, diferente do token de Meta Ads (que está em claro em
 *  `meta_ad_accounts.accessToken`). Isso é dívida existente que não vale
 *  replicar numa tabela nova.
 * ─────────────────────────────────────────────────────────────────────────────
 */
/**
 * Token OAuth de UMA conta de cliente — o outro lado do híbrido.
 *
 * Separado de `social_credentials` porque as duas coisas têm dono e ciclo de
 * vida diferentes: aquela é UMA credencial da agência, sem prazo; esta é uma
 * por cliente, expira em 60 dias e é renovável. Guardar as duas na mesma tabela
 * obrigaria metade das colunas a ficar nula em metade das linhas — e a primeira
 * consulta que esquecesse o filtro misturaria credencial de agência com a de
 * cliente.
 *
 * O token vai CIFRADO. `impressao` é o SHA-256 curto, que identifica sem
 * revelar — é o que permite responder "é o mesmo token?" no diagnóstico.
 */
/**
 * Snapshot diário de Redes Sociais — uma linha por cliente por dia.
 *
 * Tabela própria, e não `client_site_snapshots`: aquela tem `url` e `estrategia`
 * NOT NULL e DENTRO da chave única, então Instagram teria que inventar uma URL e
 * uma "estratégia mobile" que não existem — e a unicidade passaria a depender de
 * valor fictício.
 *
 * Toda coluna numérica é NULL por padrão e NUNCA recebe 0 de consolo: 0 quer
 * dizer "mediu e deu zero", null quer dizer "não temos", e `recusadasJson` diz
 * quais a Meta negou e por quê. A ausência da própria linha é o quarto estado —
 * naquele dia não estávamos medindo.
 */
export const socialSnapshots = mysqlTable("social_snapshots", {
  id: int("id").autoincrement().primaryKey(),
  accountId: int("accountId").notNull(),
  provider: varchar("provider", { length: 20 }).default("instagram").notNull(),
  dia: varchar("dia", { length: 10 }).notNull(),
  connectionSource: varchar("connectionSource", { length: 24 }),
  instagramUserId: varchar("instagramUserId", { length: 64 }),

  followersCount: int("followersCount"),
  followsCount: int("followsCount"),
  mediaCount: int("mediaCount"),

  /** reach, profile_views, website_clicks, profile_links_taps, total_interactions, views… */
  metricasJson: json("metricasJson"),
  /** O breakdown `follow_type` CRU, sem interpretação — ver shared/socialSnapshot. */
  followTypeBreakdownRaw: json("followTypeBreakdownRaw"),
  /** Métrica → motivo da recusa. É o que separa "deu zero" de "a Meta negou". */
  recusadasJson: json("recusadasJson"),

  /** Quantos stories a coleta VIU. Null quando a coleta do dia falhou. */
  storiesVistos: int("storiesVistos"),

  statusColeta: varchar("statusColeta", { length: 10 }).default("ok").notNull(),
  /**
   * `cron` ou `manual` — de onde veio ESTA linha.
   *
   * Atributo da linha, e não fonte nova: cruzar o horário com
   * `social_coleta_execucoes` para adivinhar a origem daria errado no dia em que
   * as duas rodassem perto, e daria errado em silêncio. A linha se descreve.
   */
  origem: varchar("origem", { length: 10 }),
  erroDetalhe: text("erroDetalhe"),
  coletadoEm: timestamp("coletadoEm").defaultNow().notNull(),
  atualizadoEm: timestamp("atualizadoEm").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  uqDia: uniqueIndex("uq_social_snap").on(table.accountId, table.provider, table.dia),
  idxConta: index("idx_social_snap_conta").on(table.accountId, table.dia),
}));

/**
 * Snapshot de uma publicação num dia — likes e alcance mudam com o tempo, então
 * a mesma mídia tem uma linha por dia de coleta.
 *
 * Stories entram aqui com `produto='STORY'`: é a única forma de existirem depois
 * de expirar em 24h.
 */
export const socialMediaSnapshots = mysqlTable("social_media_snapshots", {
  id: int("id").autoincrement().primaryKey(),
  accountId: int("accountId").notNull(),
  mediaId: varchar("mediaId", { length: 64 }).notNull(),
  dia: varchar("dia", { length: 10 }).notNull(),

  publicadoEm: varchar("publicadoEm", { length: 32 }),
  tipo: varchar("tipo", { length: 20 }),
  produto: varchar("produto", { length: 20 }),
  permalink: varchar("permalink", { length: 500 }),
  /**
   * Miniatura do CDN da Meta. URL ASSINADA — ela expira.
   *
   * Guardada porque vem de graça na listagem que o coletor já faz; buscar a
   * imagem por publicação na renderização traria de volta o volume de chamadas
   * que a otimização 186→6 eliminou. Não é histórico permanente de imagem: a
   * coleta renova a URL das mídias ainda recentes, e as antigas apodrecem.
   */
  thumbnailUrl: varchar("thumbnailUrl", { length: 1000 }),
  legenda: varchar("legenda", { length: 500 }),

  likes: int("likes"),
  comentarios: int("comentarios"),
  reach: int("reach"),
  views: int("views"),
  saves: int("saves"),
  shares: int("shares"),
  totalInteractions: int("totalInteractions"),

  /**
   * `reels_skip_rate` — percentual 0–100, MEDIDO pela Meta. Só Reels o têm.
   *
   * `decimal` e não `int`: a Meta devolve 57.6, e truncar para 57 apagaria a
   * diferença entre dois Reels que a tela ordena lado a lado. `null` aqui é
   * ausência de verdade — nunca zero de conveniência, porque 0% MEDIDO
   * significa que ninguém abandonou.
   */
  skipRate: decimal("skipRate", { precision: 5, scale: 2 }),
  /**
   * `ig_reels_avg_watch_time` em MILISSEGUNDOS, como a API entrega.
   *
   * O nome carrega a unidade porque a conversão para segundos acontece na
   * leitura, e uma coluna chamada `avgWatchTime` acabaria dividida por 1000
   * duas vezes por alguém de boa-fé.
   */
  avgWatchTimeMs: int("avgWatchTimeMs"),

  recusadasJson: json("recusadasJson"),
  coletadoEm: timestamp("coletadoEm").defaultNow().notNull(),
}, (table) => ({
  uqMidiaDia: uniqueIndex("uq_social_midia_dia").on(table.accountId, table.mediaId, table.dia),
  idxConta: index("idx_social_midia_conta").on(table.accountId, table.dia),
}));

/**
 * Cada execução da coleta — o cron e o botão.
 *
 * Tabela própria porque a pergunta é sobre a EXECUÇÃO, não sobre o cliente:
 * "quantas contas foram coletadas" não cabe numa linha por cliente, e
 * `social_snapshots` é sobrescrita no mesmo dia — a coleta manual das 10h
 * apagaria o horário da automática das 06:20, que é justamente o que se quer
 * saber.
 *
 * `origem` separa as duas leituras que o usuário faz: "o robô rodou hoje?" e
 * "alguém mexeu nisso à mão?". Juntas num campo só, a segunda esconderia a
 * primeira.
 */
export const socialColetaExecucoes = mysqlTable("social_coleta_execucoes", {
  id: int("id").autoincrement().primaryKey(),
  provider: varchar("provider", { length: 20 }).default("instagram").notNull(),
  /** `cron` ou `manual`. */
  origem: varchar("origem", { length: 10 }).notNull(),
  /** `geral` (06:20) ou `stories` (18:20). */
  escopo: varchar("escopo", { length: 10 }).default("geral").notNull(),
  dia: varchar("dia", { length: 10 }).notNull(),

  tentados: int("tentados").default(0).notNull(),
  ok: int("ok").default(0).notNull(),
  parciais: int("parciais").default(0).notNull(),
  erros: int("erros").default(0).notNull(),
  pulados: int("pulados").default(0).notNull(),

  /** Duração total, para separar "falhou rápido" de "demorou e caiu". */
  duracaoMs: int("duracaoMs"),
  /** Chamadas à Meta na rodada — o número que confirma ou nega o volume. */
  chamadas: int("chamadas"),
  chamadasComErro: int("chamadasComErro"),
  /** Quem clicou, quando foi manual. Nulo no cron. */
  disparadaPor: int("disparadaPor"),
  /** Resumo por conta, sanitizado. É o detalhe do diagnóstico. */
  detalheJson: json("detalheJson"),
  executadaEm: timestamp("executadaEm").defaultNow().notNull(),
}, (table) => ({
  idxQuando: index("idx_social_exec").on(table.provider, table.origem, table.executadaEm),
}));

export const socialAccountTokens = mysqlTable("social_account_tokens", {
  id: int("id").autoincrement().primaryKey(),
  accountId: int("accountId").notNull(),
  provider: varchar("provider", { length: 20 }).default("instagram").notNull(),
  flow: varchar("flow", { length: 24 }).default("oauth_conta").notNull(),
  tokenEncrypted: text("tokenEncrypted").notNull(),
  impressao: varchar("impressao", { length: 16 }).notNull(),
  instagramUserId: varchar("instagramUserId", { length: 64 }),
  instagramUsername: varchar("instagramUsername", { length: 120 }),
  escopos: text("escopos"),
  expiresAt: timestamp("expiresAt"),
  refreshedAt: timestamp("refreshedAt"),
  refreshFalhaEm: timestamp("refreshFalhaEm"),
  refreshFalhaDetalhe: text("refreshFalhaDetalhe"),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const socialCredentials = mysqlTable("social_credentials", {
  id: int("id").autoincrement().primaryKey(),
  /**
   * De qual rede é esta credencial.
   *
   * A tabela nasceu com UMA linha e Instagram implícito — as leituras faziam
   * `limit(1)` sem filtro. Isso funcionava por acidente de haver uma rede só, e
   * o dia em que a segunda entrasse a primeira consulta devolveria a credencial
   * errada, sem erro nenhum. A coluna existe para essa suposição não ficar
   * escondida no `limit(1)`.
   */
  provider: varchar("provider", { length: 20 }).default("instagram").notNull(),
  /** System User token do Portfólio, cifrado. NUNCA sai daqui em claro. */
  tokenEncrypted: text("tokenEncrypted").notNull(),
  /** Hash curto: compara e diagnostica sem revelar. */
  impressao: varchar("impressao", { length: 16 }).notNull(),
  /** Portfólio Empresarial que o token alcança. */
  businessId: varchar("businessId", { length: 64 }),
  lastTestAt: timestamp("lastTestAt"),
  lastTestStatus: varchar("lastTestStatus", { length: 8 }),
  /** Diagnóstico completo do último teste — copiável, nunca com segredo. */
  lastTestDetail: text("lastTestDetail"),
  updatedBy: int("updatedBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type SocialCredential = typeof socialCredentials.$inferSelect;

export type ClientSocialAccount = typeof clientSocialAccounts.$inferSelect;
export type InsertClientSocialAccount = typeof clientSocialAccounts.$inferInsert;

/**
 * Comunicado interno: o admin escreve uma vez aqui; a ENTREGA e o recibo de
 * leitura vivem em `alerts` (uma linha por destinatário, dedupKey
 * "COMUNICADO:<id>"). Quem leu = alerts.isRead — sem tabela de recibo separada.
 */
export const comunicados = mysqlTable("comunicados", {
  id: int("id").autoincrement().primaryKey(),
  autorUserId: int("autorUserId").notNull(),
  titulo: varchar("titulo", { length: 180 }).notNull(),
  corpo: text("corpo").notNull(),
  publico: mysqlEnum("publico", ["TODOS", "ROLE", "FUNCAO", "PESSOAS"]).default("TODOS").notNull(),
  alvoFuncao: varchar("alvoFuncao", { length: 20 }),  // quando publico = FUNCAO
  alvoRole: varchar("alvoRole", { length: 20 }),   // quando publico = ROLE
  alvoUserIds: json("alvoUserIds"),                 // quando publico = PESSOAS
  fixado: boolean("fixado").default(false).notNull(),
  enviados: int("enviados").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  idxCriado: index("idx_comunicado_criado").on(table.createdAt),
}));
export type Comunicado = typeof comunicados.$inferSelect;
export type InsertComunicado = typeof comunicados.$inferInsert;


// ─── Account Context (memória por conta) ─────────────────────────────────────
export const accountContext = mysqlTable("account_context", {
  id: int("id").autoincrement().primaryKey(),
  accountId: int("accountId").notNull().unique(),
  // Legacy text fields (mantidos para compatibilidade)
  clientProfile: text("clientProfile"),
  operationalRules: text("operationalRules"),
  learnings: text("learnings"),
  // Structured fields
  businessType: varchar("businessType", { length: 50 }),
  ticketRange: varchar("ticketRange", { length: 50 }),
  audienceAge: varchar("audienceAge", { length: 50 }),
  audienceGender: varchar("audienceGender", { length: 50 }),
  audienceGeo: varchar("audienceGeo", { length: 50 }),
  restrictions: json("restrictions").$type<string[]>(),
  events: json("events").$type<Array<{ date: string; type: string; description: string }>>(),
  freeInput: text("freeInput"),
  focusMoment: text("focusMoment"),
  // ── Contexto de site (unificado — migrado de client_context) ──
  objective: text("objective"),
  offer: text("offer"),
  audience: text("audience"),
  importantPagesJson: json("importantPagesJson").$type<string[]>(),
  conversionEventsJson: json("conversionEventsJson").$type<string[]>(),
  trackingNotes: text("trackingNotes"),
  currentHypotheses: text("currentHypotheses"),
  constraints: text("constraints"),
  previousTests: text("previousTests"),
  nextSteps: text("nextSteps"),
  // Consolidação periódica do learnings (append-only → resumo compacto).
  learningsConsolidated: text("learningsConsolidated"),
  // Input pontual da caixa "Leitura de IA" do header — NÃO sobrescreve o perfil.
  quickContext: text("quickContext"),
  /**
   * ─────────────────────────────────────────────────────────────────────────
   *  Quando o contexto foi CONFIRMADO para a IA — diferente de quando foi salvo
   * ─────────────────────────────────────────────────────────────────────────
   *  `updatedAt` marca qualquer gravação, e desde o autosave isso inclui cada
   *  pausa de meio segundo de quem está digitando. Usá-lo para decidir se a
   *  análise envelheceu criava um disparo indireto:
   *
   *    digitação → autosave → updatedAt muda → análise "desatualizada"
   *              → cron das 06:00 → chamada ao modelo
   *
   *  O gasto voltava a ser proporcional ao número de correções de texto, que é
   *  exatamente o que a separação entre rascunho e confirmação existe para
   *  evitar.
   *
   *  Esta coluna só é escrita quando alguém clica em confirmar/atualizar. É ela
   *  que a regra de frescor compara com `aiStatusAt` — `updatedAt` continua
   *  existindo e respondendo "quando o contexto mudou pela última vez", que é
   *  outra pergunta.
   *
   *  `null` = nunca confirmado. A análise NÃO envelhece por conta do contexto
   *  da conta, e nenhum rascunho antigo passa a gerar chamada retroativamente.
   */
  contextoConfirmadoEm: timestamp("contextoConfirmadoEm"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  updatedBy: varchar("updatedBy", { length: 255 }),
});
export type AccountContext = typeof accountContext.$inferSelect;
export type InsertAccountContext = typeof accountContext.$inferInsert;

// ─── Report Snapshots (relatórios gerados para clientes) ─────────────────────
export const reportSnapshots = mysqlTable("report_snapshots", {
  id: int("id").autoincrement().primaryKey(),
  accountId: int("accountId").notNull(),
  // Legado: o relatório era escolhido por "nível". Agora é por módulos
  // (modulesJson). Fica para as linhas antigas continuarem legíveis; nas novas
  // é derivado da quantidade de módulos, só para a listagem ter um resumo.
  tier: mysqlEnum("tier", ["CURTO", "MEDIO", "COMPLETO"]).notNull(),
  publicToken: varchar("publicToken", { length: 64 }).notNull().unique(),
  periodStart: date("periodStart", { mode: "string" }).notNull(),
  periodEnd: date("periodEnd", { mode: "string" }).notNull(),
  contextNotes: text("contextNotes"),
  dataSnapshot: text("dataSnapshot"),
  narrative: text("narrative"),
  /** Módulos pedidos por quem gerou. NULL = relatório antigo, por tier. */
  modulesJson: json("modulesJson"),
  /**
   * Quais fontes existiam de fato no momento da geração, e por que faltaram as
   * que faltaram. Sem isto, um relatório magro é indistinguível de um cliente
   * saudável seis meses depois — é o registro de que ninguém olhou, não de que
   * estava tudo bem.
   */
  fontesJson: json("fontesJson"),
  /** Markdown pronto para colar (WhatsApp/e-mail). */
  markdown: text("markdown"),
  generatedAt: timestamp("generatedAt").defaultNow().notNull(),
  generatedByUserId: int("generatedByUserId"),
  isActive: boolean("isActive").default(true).notNull(),
});
export type ReportSnapshot = typeof reportSnapshots.$inferSelect;
export type InsertReportSnapshot = typeof reportSnapshots.$inferInsert;

// ─── Agency Context (memória da agência) ─────────────────────────────────────
export const agencyContext = mysqlTable("agency_context", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  benchmarks: text("benchmarks"),
  patterns: text("patterns"),
  institutionalKnowledge: text("institutionalKnowledge"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type AgencyContext = typeof agencyContext.$inferSelect;
export type InsertAgencyContext = typeof agencyContext.$inferInsert;

// ─── Action Outcomes (fechamento do loop) ────────────────────────────────────
export const actionOutcomes = mysqlTable("action_outcomes", {
  id: int("id").autoincrement().primaryKey(),
  suggestionId: int("suggestionId").notNull().unique(),
  accountId: int("accountId").notNull(),
  appliedAt: timestamp("appliedAt").notNull(),
  observedAt: timestamp("observedAt"),
  resultSummary: text("resultSummary"),
  metricsSnapshot: json("metricsSnapshot").$type<Record<string, number>>(),
  aiLearningNote: text("aiLearningNote"),
  manualCorrection: text("manualCorrection"),
  closedBy: varchar("closedBy", { length: 255 }),
  closedAt: timestamp("closedAt"),
});
export type ActionOutcome = typeof actionOutcomes.$inferSelect;
export type InsertActionOutcome = typeof actionOutcomes.$inferInsert;

// ─── Controle Financeiro (área admin) ─────────────────────────────────────────
// Dinheiro SEMPRE em centavos (int), nunca float. `mes` = string 'YYYY-MM'.
// O sinal (receita vs. despesa) vem do `tipo`; valorCents é sempre positivo.
export const financePnlEntries = mysqlTable("finance_pnl_entries", {
  id: int("id").autoincrement().primaryKey(),
  mes: varchar("mes", { length: 7 }).notNull(),
  tipo: mysqlEnum("tipo", [
    "RECEITA_RECORRENTE", "RECEITA_PONTUAL",
    "DESPESA_RECORRENTE", "DESPESA_IMPOSTO", "DESPESA_PONTUAL",
    "APORTE",
  ]).notNull(),
  descricao: varchar("descricao", { length: 255 }).notNull(),
  valorCents: int("valorCents").notNull(),
  status: mysqlEnum("status", ["pago", "pendente"]).default("pendente").notNull(),
  // Cliente (FK lógica → finance_clientes.id). Só receita usa; despesa/aporte NULL.
  clienteId: int("clienteId"),
  // v4 — gestão ativa (ledger). Colunas nullable: histórico antigo fica MANUAL/NULL.
  vencimento: date("vencimento", { mode: "string" }),           // data real (YYYY-MM-DD)
  vencimentoOriginal: date("vencimentoOriginal", { mode: "string" }), // p/ badge "Remarcado"
  origem: mysqlEnum("origem", ["MANUAL", "RECORRENCIA", "PROJETO"]).default("MANUAL").notNull(),
  recorrenciaId: int("recorrenciaId"),
  projetoId: int("projetoId"),
  parcelaNum: int("parcelaNum"),
  parcelaTotal: int("parcelaTotal"),
  // Ajustes 3 — despesa paga pelo Gui (reembolso pendente). Só despesa usa.
  reembolsoPendente: boolean("reembolsoPendente").default(false).notNull(),
  // Subcategoria da despesa pontual (só DESPESA_PONTUAL usa).
  subcategoria: varchar("subcategoria", { length: 24 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  idxMes: index("idx_pnl_mes").on(table.mes),
  idxTipo: index("idx_pnl_tipo").on(table.tipo),
  idxStatus: index("idx_pnl_status").on(table.status),
  idxCliente: index("idx_pnl_cliente").on(table.clienteId),
  idxVencimento: index("idx_pnl_vencimento").on(table.vencimento),
  idxOrigem: index("idx_pnl_origem").on(table.origem),
}));

// v4 — definição da assinatura recorrente por cliente (fonte da geração mensal).
export const financeRecorrencia = mysqlTable("finance_recorrencia", {
  id: int("id").autoincrement().primaryKey(),
  clienteId: int("clienteId"),                      // NULL para despesa (v4.1)
  valorCents: int("valorCents").notNull(),          // valor mensal padrão atual
  diaVencimento: int("diaVencimento"),
  mesInicio: varchar("mesInicio", { length: 7 }).notNull(),
  ativo: boolean("ativo").default(true).notNull(),
  churnMes: varchar("churnMes", { length: 7 }),
  // v4.1 — recorrência também de despesa (espelha a receita).
  natureza: mysqlEnum("natureza", ["RECEITA", "DESPESA"]).default("RECEITA").notNull(),
  descricao: varchar("descricao", { length: 255 }), // nome da despesa/pessoa (receita usa clienteId)
  tipoEntry: varchar("tipoEntry", { length: 30 }),  // 'DESPESA_RECORRENTE' | 'DESPESA_IMPOSTO'
  estimativa: boolean("estimativa").default(false).notNull(), // true p/ imposto
  vencimentoMesSeguinte: boolean("vencimentoMesSeguinte").default(false).notNull(), // true = pós-pago (vence no mês seguinte)
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  idxCliente: index("idx_rec_cliente").on(table.clienteId),
  idxAtivo: index("idx_rec_ativo").on(table.ativo),
  idxNatureza: index("idx_rec_natureza").on(table.natureza),
}));
export type FinanceRecorrencia = typeof financeRecorrencia.$inferSelect;
export type InsertFinanceRecorrencia = typeof financeRecorrencia.$inferInsert;

// v4 — projetos parcelados (receita pontual dividida em N parcelas).
export const financeProjetos = mysqlTable("finance_projetos", {
  id: int("id").autoincrement().primaryKey(),
  clienteId: int("clienteId"),
  nome: varchar("nome", { length: 255 }).notNull(),
  valorTotalCents: int("valorTotalCents").notNull(),
  numParcelas: int("numParcelas").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type FinanceProjeto = typeof financeProjetos.$inferSelect;
export type InsertFinanceProjeto = typeof financeProjetos.$inferInsert;

// Clientes do Financeiro (tags de receita). nome único; cor hex para o chip.
export const financeClientes = mysqlTable("finance_clientes", {
  id: int("id").autoincrement().primaryKey(),
  nome: varchar("nome", { length: 120 }).notNull().unique(),
  cor: varchar("cor", { length: 9 }),
  ativo: boolean("ativo").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type FinanceCliente = typeof financeClientes.$inferSelect;
export type InsertFinanceCliente = typeof financeClientes.$inferInsert;
export type FinancePnlEntry = typeof financePnlEntries.$inferSelect;
export type InsertFinancePnlEntry = typeof financePnlEntries.$inferInsert;

export const financeReembolsos = mysqlTable("finance_reembolsos", {
  id: int("id").autoincrement().primaryKey(),
  mes: varchar("mes", { length: 7 }).notNull(),
  categoria: mysqlEnum("categoria", ["PLATAFORMA_ANUNCIOS", "OFFICE", "EXTRAS"]).notNull(),
  descricao: varchar("descricao", { length: 255 }).notNull(),
  valorCents: int("valorCents").notNull(),
  quemPagou: varchar("quemPagou", { length: 120 }),
  reembolsado: boolean("reembolsado").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  idxMes: index("idx_reemb_mes").on(table.mes),
  idxCategoria: index("idx_reemb_categoria").on(table.categoria),
}));
export type FinanceReembolso = typeof financeReembolsos.$inferSelect;
export type InsertFinanceReembolso = typeof financeReembolsos.$inferInsert;

/**
 * Reembolso pedido por um COLABORADOR — a única porta do financeiro aberta a
 * quem não é admin.
 *
 * Tabela separada, e não uma coluna "aprovado" em finance_pnl_entries, porque
 * `financePnlResumo` soma TODAS as linhas do mês sem filtro: uma despesa não
 * aprovada morando lá exigiria um filtro novo em cada consulta do financeiro, e
 * esquecer uma inflaria a despesa do mês em silêncio. Aqui a linha do P&L só
 * nasce na aprovação — "não aprovado ⇒ fora do balanço" é verdade por
 * construção, não por disciplina.
 *
 * `pnlEntryId` amarra a solicitação à despesa criada, para o admin conseguir
 * desfazer uma aprovação sem caçar a linha à mão.
 */
export const financeReembolsoSolicitacoes = mysqlTable("finance_reembolso_solicitacoes", {
  id: int("id").autoincrement().primaryKey(),
  /** Quem pediu. TODA consulta de colaborador filtra por aqui, no servidor. */
  userId: int("userId").notNull(),
  mes: varchar("mes", { length: 7 }).notNull(),
  /** Data real do gasto — o mês de competência sai dela. */
  dataGasto: date("dataGasto", { mode: "string" }).notNull(),
  descricao: varchar("descricao", { length: 255 }).notNull(),
  valorCents: int("valorCents").notNull(),
  /** Mesma taxonomia das despesas pontuais (SUBCATS), para o balanço não
   *  ganhar uma segunda categorização paralela. */
  subcategoria: varchar("subcategoria", { length: 24 }).notNull(),
  observacao: text("observacao"),
  /** Chave no storage S3. Opcional: quem está na rua nem sempre tem a nota. */
  comprovanteKey: varchar("comprovanteKey", { length: 512 }),
  status: mysqlEnum("status", ["aguardando", "aprovado", "reembolsado", "recusado"]).default("aguardando").notNull(),
  /** Preenchido só na recusa — sem ele o colaborador não sabe o que corrigir. */
  motivoRecusa: varchar("motivoRecusa", { length: 500 }),
  /** Despesa criada na aprovação (FK lógica → finance_pnl_entries.id). */
  pnlEntryId: int("pnlEntryId"),
  decididoPorUserId: int("decididoPorUserId"),
  decididoEm: timestamp("decididoEm"),
  reembolsadoEm: timestamp("reembolsadoEm"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  idxUser: index("idx_reemb_sol_user").on(table.userId),
  idxStatus: index("idx_reemb_sol_status").on(table.status),
  idxMes: index("idx_reemb_sol_mes").on(table.mes),
}));
export type FinanceReembolsoSolicitacao = typeof financeReembolsoSolicitacoes.$inferSelect;
export type InsertFinanceReembolsoSolicitacao = typeof financeReembolsoSolicitacoes.$inferInsert;

/**
 * Dicionário aprendido da conciliação de fatura → reembolsos SELVA. Cada linha
 * é uma regra estabelecimento→categoria. Semeada da aba "Reembolsos Gui" e
 * crescida a cada mês conforme o Gui confirma. NUNCA guarda valores da fatura
 * nem gasto pessoal — só o mapa de classificação. `padrao` é fonte de regex
 * case-insensitive; `valorCents` (opcional) casa por valor (Apple ambíguo).
 */
export const financeMerchantMap = mysqlTable("finance_merchant_map", {
  id: int("id").autoincrement().primaryKey(),
  padrao: varchar("padrao", { length: 200 }).notNull(),
  canonical: varchar("canonical", { length: 120 }).notNull(),
  categoria: mysqlEnum("categoria", ["SELVA", "PESSOAL"]).notNull(),
  valorCents: int("valorCents"),
  origem: mysqlEnum("origem", ["SEED", "CONFIRMADO"]).default("SEED").notNull(),
  vezesConfirmado: int("vezesConfirmado").default(0).notNull(),
  ativo: boolean("ativo").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  idxCategoria: index("idx_merchant_categoria").on(table.categoria),
}));
export type FinanceMerchantMap = typeof financeMerchantMap.$inferSelect;
export type InsertFinanceMerchantMap = typeof financeMerchantMap.$inferInsert;

export const financeRetiradas = mysqlTable("finance_retiradas", {
  id: int("id").autoincrement().primaryKey(),
  mes: varchar("mes", { length: 7 }).notNull(),
  descricao: varchar("descricao", { length: 120 }).notNull(),
  valorCents: int("valorCents").notNull(),
  // Ajustes 4 — retirada já conciliada (não entra mais na falta-receber). Espelha
  // finance_reembolsos.reembolsado: item quitado continua visível no histórico do mês.
  realizado: boolean("realizado").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  idxMes: index("idx_retir_mes").on(table.mes),
}));
export type FinanceRetirada = typeof financeRetiradas.$inferSelect;
export type InsertFinanceRetirada = typeof financeRetiradas.$inferInsert;

// v6 — meses fechados (trava de edição). Fechar = inserir linha; reabrir = remover.
export const financeMesesFechados = mysqlTable("finance_meses_fechados", {
  id: int("id").autoincrement().primaryKey(),
  mes: varchar("mes", { length: 7 }).notNull(),
  fechadoEm: timestamp("fechadoEm").defaultNow().notNull(),
  fechadoPor: int("fechadoPor"),
}, (table) => ({
  uqMes: uniqueIndex("uq_mes_fechado").on(table.mes),
}));
export type FinanceMesFechado = typeof financeMesesFechados.$inferSelect;

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Prioridades da Semana — o direcionamento da Home
 * ─────────────────────────────────────────────────────────────────────────────
 *  Substitui a box do Trello. NÃO reaproveita a estrutura dele, e a diferença é
 *  de natureza: card do Trello é objeto externo, somente-leitura, que existe lá
 *  e é espelhado aqui. Isto é conteúdo NOSSO, escrito no Spaces, e some se o
 *  Trello sumir — o módulo não pode depender dele para funcionar.
 *
 *  ── `semana` é uma string, e isso é a chave do desenho ─────────────────────
 *  Guarda a SEGUNDA-FEIRA em `AAAA-MM-DD`. Um `date` ou `timestamp` viraria
 *  instante, e instante tem fuso: `2026-08-10` gravado em UTC é 09/08 às 21h em
 *  São Paulo, e a semana andaria um dia para trás na leitura. Como texto, a
 *  chave é a mesma em qualquer fuso. Ver `shared/semana.ts`.
 *
 *  ── Por que o histórico não precisa de nada ────────────────────────────────
 *  Virar a semana não move, copia nem arquiva linha nenhuma: a semana seguinte
 *  é outro valor de `semana`, e a anterior continua onde sempre esteve. O
 *  histórico é consequência da chave, não uma funcionalidade a manter.
 *
 *  ── `responsavel` é texto, e não FK para users ─────────────────────────────
 *  Uma prioridade pode ser de alguém que não tem login no Spaces — um sócio, um
 *  terceiro, um time. FK transformaria o campo num select que não consegue
 *  expressar isso, e aí o responsável iria para dentro do título.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const weeklyPriorities = mysqlTable("weekly_priorities", {
  id: int("id").autoincrement().primaryKey(),
  /** `cc` | `gtm1` | `gtm2` — ver GRUPOS em shared/semana.ts. */
  grupo: varchar("grupo", { length: 8 }).notNull(),
  /** A segunda-feira, `AAAA-MM-DD`. Texto de propósito: chave, não instante. */
  semana: varchar("semana", { length: 10 }).notNull(),
  /** `PRIORIDADE` | `ENTREGA` | `ATENCAO`. */
  tipo: varchar("tipo", { length: 12 }).notNull(),
  titulo: varchar("titulo", { length: 200 }).notNull(),
  descricao: text("descricao"),
  /**
   * Quem responde — `users.id`.
   *
   * Era texto livre. Virou referência para a foto do perfil poder aparecer no
   * item sem duplicar cadastro de gente. Sem FK física, como o resto da base.
   */
  responsavelUserId: int("responsavelUserId"),
  /** Legado do texto livre. Só é lido quando não há `responsavelUserId`. */
  responsavel: varchar("responsavel", { length: 80 }),
  /** `AAAA-MM-DD` ou nulo. Ausência é ausência — nunca "sem prazo" gravado. */
  prazo: varchar("prazo", { length: 10 }),
  /** `PLANEJADO` | `EM_ANDAMENTO` | `CONCLUIDO`. */
  status: varchar("status", { length: 12 }).default("PLANEJADO").notNull(),
  ordem: int("ordem").default(0).notNull(),
  createdBy: int("createdBy"),
  /** Quem mexeu por último — é o que o rodapé do componente mostra. */
  updatedBy: int("updatedBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  // A consulta da Home é sempre por semana (os três grupos de uma vez, para a
  // troca de aba não ir à rede). O índice acompanha isso.
  idxSemana: index("idx_wp_semana").on(table.semana),
  idxSemanaGrupo: index("idx_wp_semana_grupo").on(table.semana, table.grupo),
}));
export type WeeklyPriority = typeof weeklyPriorities.$inferSelect;
export type InsertWeeklyPriority = typeof weeklyPriorities.$inferInsert;

/**
 * Quem responde por uma prioridade — vários por item.
 *
 * Tabela de relação, e não uma lista de ids em JSON: com JSON, "quais
 * prioridades são minhas?" vira varredura de string, e a integridade fica por
 * conta de quem escreve. Aqui a chave única já impede o duplicado, e a
 * migração trouxe o `responsavelUserId` que existia antes sem perder nada.
 *
 * `weekly_priorities.responsavelUserId` continua na tabela mas não é mais lido:
 * ficou como registro do que foi migrado. Apagar coluna é irreversível, e o
 * ganho seria só estético.
 */
export const weeklyPriorityResponsaveis = mysqlTable("weekly_priority_responsaveis", {
  id: int("id").autoincrement().primaryKey(),
  prioridadeId: int("prioridadeId").notNull(),
  userId: int("userId").notNull(),
  /** A ordem de escolha — o primeiro é quem aparece na linha fechada. */
  ordem: int("ordem").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  uqPrioridadeUser: uniqueIndex("uq_wpr_prioridade_user").on(table.prioridadeId, table.userId),
  idxPrioridade: index("idx_wpr_prioridade").on(table.prioridadeId),
}));
export type WeeklyPriorityResponsavel = typeof weeklyPriorityResponsaveis.$inferSelect;

/**
 * Contexto de UM ponto técnico — mais específico que o da conta.
 *
 * Tabela própria, e não uma coluna em `account_context`, porque a natureza é
 * outra: o contexto da conta é durável ("o cliente é B2B") e o do ponto é sobre
 * um alerta ("aquele pedido foi teste"). Guardados juntos, o segundo viraria
 * regra permanente e todo pedido futuro passaria a ser suspeito de ser teste.
 *
 * A chave é `achado.chave` — o slug estável (`purchase_sem_valor`), nunca o
 * texto do alerta, que carrega números que mudam todo dia. Ancorado no texto, o
 * contexto se desprenderia amanhã, em silêncio.
 */
export const accountFindingContext = mysqlTable("account_finding_context", {
  id: int("id").autoincrement().primaryKey(),
  accountId: int("accountId").notNull(),
  /** `achado.chave` de shared/panoramaLogic. */
  chave: varchar("chave", { length: 60 }).notNull(),
  texto: text("texto").notNull(),
  /** O texto do alerta no momento em que foi explicado — para auditoria. */
  alertaNaEpoca: varchar("alertaNaEpoca", { length: 500 }),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  uqContaChave: uniqueIndex("uq_afc_conta_chave").on(table.accountId, table.chave),
  idxConta: index("idx_afc_conta").on(table.accountId),
}));
export type AccountFindingContext = typeof accountFindingContext.$inferSelect;


/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Cada geração do modelo — a contabilidade do consumo
 * ─────────────────────────────────────────────────────────────────────────────
 *  Uma linha por chamada, gravada no único ponto por onde todas passam. Guarda
 *  ORIGEM, resultado e custo — nunca prompt, resposta ou dado de cliente. Um log
 *  de consumo que guarda conteúdo vira um segundo banco do cliente, com as
 *  mesmas obrigações do primeiro e nenhuma das proteções.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const aiGeracoes = mysqlTable("ai_geracoes", {
  id: int("id").autoincrement().primaryKey(),
  /** `status_ia`, `briefing`, `relatorio`… — ver `OrigemDaGeracao`. */
  origem: varchar("origem", { length: 32 }).notNull(),
  /**
   * A conta que motivou a chamada. `null` é RESPOSTA, não lacuna: o jornalzinho
   * é uma narrativa da agência inteira e a consolidação semanal não tem conta
   * nenhuma em escopo. Atribuí-las a um cliente qualquer inventaria um culpado.
   */
  accountId: int("accountId"),
  /** O modelo que respondeu — vem da própria resposta da Anthropic. */
  modelo: varchar("modelo", { length: 64 }),
  /** `false` quando o modelo recusou ou a rede caiu. Falha também custa. */
  ok: boolean("ok").notNull().default(true),
  duracaoMs: int("duracaoMs"),
  tokensEntrada: int("tokensEntrada"),
  tokensSaida: int("tokensSaida"),

  /*
   * ── O gatilho: quem PEDIU esta chamada ────────────────────────────────────
   * `origem` diz o que a chamada faz; isto diz por que ela aconteceu. Sete
   * caminhos diferentes gravavam `origem: "status_ia"`, e o log não distinguia
   * o cron de um clique de um deploy.
   *
   * Nenhum destes campos toca conteúdo: não há prompt, resposta ou dado de
   * cliente aqui — só causalidade.
   */

  /** `scheduled` · `manual` · `system` · `unknown`. Ver shared/gatilhoDaIA. */
  triggerType: varchar("triggerType", { length: 16 }),
  /** A rotina exata: `runAutoSync`, `refreshAllStatus`, `syncAccount`. */
  triggerSource: varchar("triggerSource", { length: 64 }),
  /** O nome amigável, para a tela não precisar de um mapa próprio. */
  triggerLabel: varchar("triggerLabel", { length: 96 }),
  actorType: varchar("actorType", { length: 8 }),
  actorId: int("actorId"),
  /**
   * O nome de quem disparou, guardado apesar de resolvível pelo id.
   *
   * Colaborador desativado ou renomeado deixaria o histórico com "usuário 7", e
   * o log de causalidade perderia justamente a resposta que existe para dar.
   */
  actorName: varchar("actorName", { length: 120 }),
  actorRole: varchar("actorRole", { length: 24 }),

  criadoEm: timestamp("criadoEm").defaultNow().notNull(),
}, (table) => ({
  idxQuando: index("idx_ai_geracoes_quando").on(table.criadoEm),
  idxOrigem: index("idx_ai_geracoes_origem").on(table.origem, table.criadoEm),
  idxConta: index("idx_ai_geracoes_conta").on(table.accountId, table.criadoEm),
  idxGatilho: index("idx_ai_geracoes_gatilho").on(table.triggerType, table.criadoEm),
}));
