export const ENV = {
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  isProduction: process.env.NODE_ENV === "production",
  // Anthropic API (replaces Forge/Manus LLM proxy)
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  // App URL for email links (e.g. https://app.selvadash.com.br)
  appUrl: process.env.APP_URL ?? "http://localhost:3000",
  // Local admin credentials
  adminEmail: process.env.ADMIN_EMAIL ?? "",
  adminPasswordHash: process.env.ADMIN_PASSWORD_HASH ?? "",
  // Google Calendar (integração por usuário — OAuth)
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  googleRedirectUri: process.env.GOOGLE_REDIRECT_URI ?? "",
  integrationsEncryptionKey: process.env.INTEGRATIONS_ENCRYPTION_KEY ?? "",
  // Acessos (cofre de credenciais) — chave SEPARADA das integrações.
  accessSecretsEncryptionKey: process.env.ACCESS_SECRETS_ENCRYPTION_KEY ?? "",
  // Trello (integração por usuário — cards da Home)
  trelloApiKey: process.env.TRELLO_API_KEY ?? "",
  // Storage S3-compatible (avatares + SelvaTV)
  storageProvider: process.env.STORAGE_PROVIDER ?? "",
  s3Endpoint: process.env.S3_ENDPOINT ?? "",
  s3Region: process.env.S3_REGION ?? "auto",
  s3Bucket: process.env.S3_BUCKET ?? "",
  s3AccessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
  s3SecretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
  s3PublicBaseUrl: process.env.S3_PUBLIC_BASE_URL ?? "",
  s3ForcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
  // Google Ads API credentials
  googleAdsDeveloperToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? "",
  googleAdsClientId: process.env.GOOGLE_ADS_CLIENT_ID ?? "",
  googleAdsClientSecret: process.env.GOOGLE_ADS_CLIENT_SECRET ?? "",
  googleAdsRefreshToken: process.env.GOOGLE_ADS_REFRESH_TOKEN ?? "",
  googleAdsLoginCustomerId: process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? "",
  // SMTP for daily report emails
  smtpUser: process.env.SMTP_USER ?? "",
  smtpPass: process.env.SMTP_PASS ?? "",
  smtpHost: process.env.SMTP_HOST ?? "smtp.gmail.com",
  smtpPort: process.env.SMTP_PORT ?? "587",
  smtpFrom: process.env.SMTP_FROM ?? process.env.SMTP_USER ?? "",
};
