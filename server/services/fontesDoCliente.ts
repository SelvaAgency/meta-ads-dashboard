/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Quais fontes de dados cada cliente tem, lidas do BANCO
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  Substitui `client/src/config/clientConfig.ts` como fonte de verdade sobre
 *  conexões. O arquivo continua existindo — ele responde bem por identidade
 *  visual (nome, cor, avatar) —, mas parou de decidir o que está conectado.
 *
 *  A classificação em si vive em `shared/fontes.ts`, como função pura: aqui só
 *  se lê o banco. Assim a definição de "conectado" é a mesma no servidor e no
 *  cliente, e pode ser testada sem subir banco nenhum.
 *
 *  Em lote de propósito: o seletor de clientes desenha chips para TODOS os
 *  clientes de uma vez. Uma consulta por cliente ali seria N+1 na abertura de
 *  um dropdown.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { and, eq, isNotNull } from "drizzle-orm";
import { getDb } from "../db";
import {
  metaAdAccounts, googleAdAccounts, ga4Accounts, clientClaritySettings, userIntegrations,
} from "../../drizzle/schema";
import { classificarFontes, type Fonte, type ConexaoBruta } from "../../shared/fontes";

export type FontesDaConta = { accountId: number; fontes: Fonte[] };

/**
 * Fontes de todos os clientes ativos. `apenas` restringe a lista sem mudar o
 * número de consultas — são sempre cinco, independentemente da quantidade de
 * clientes.
 */
export async function fontesDeTodasAsContas(apenas?: number[]): Promise<FontesDaConta[]> {
  const db = await getDb();
  if (!db) return [];

  const [contas, gads, ga4s, claritys, oauthGoogle] = await Promise.all([
    db.select({
      id: metaAdAccounts.id,
      isActive: metaAdAccounts.isActive,
      lastSyncAt: metaAdAccounts.lastSyncAt,
      tokenExpiresAt: metaAdAccounts.tokenExpiresAt,
    }).from(metaAdAccounts),
    db.select({ linkedAccountId: googleAdAccounts.linkedAccountId, ignored: googleAdAccounts.ignored })
      .from(googleAdAccounts).where(isNotNull(googleAdAccounts.linkedAccountId)),
    db.select({ linkedAccountId: ga4Accounts.linkedAccountId, isActive: ga4Accounts.isActive })
      .from(ga4Accounts).where(isNotNull(ga4Accounts.linkedAccountId)),
    db.select({
      accountId: clientClaritySettings.accountId,
      enabled: clientClaritySettings.enabled,
      hasToken: clientClaritySettings.encryptedApiToken,
      lastSyncStatus: clientClaritySettings.lastSyncStatus,
      performanceEnabled: clientClaritySettings.performanceEnabled,
      perfLastSyncStatus: clientClaritySettings.perfLastSyncStatus,
      domain: clientClaritySettings.domain,
      performanceUrl: clientClaritySettings.performanceUrl,
    }).from(clientClaritySettings),
    db.select({ id: userIntegrations.id }).from(userIntegrations).where(and(
      eq(userIntegrations.provider, "google_ads"),
      eq(userIntegrations.active, true),
      isNotNull(userIntegrations.refreshTokenEncrypted),
    )).limit(1),
  ]);

  // O OAuth do Google Ads é da AGÊNCIA, não do cliente: uma conexão vale para
  // todos os vínculos. Por isso é um booleano só, fora do laço.
  const googleAdsOauthAtivo = oauthGoogle.length > 0;

  const comGads = new Set(gads.filter((g) => !g.ignored).map((g) => g.linkedAccountId!));
  const comGa4 = new Set(ga4s.filter((g) => g.isActive).map((g) => g.linkedAccountId!));
  const porConta = new Map(claritys.map((c) => [c.accountId, c]));

  const alvo = apenas ? new Set(apenas) : null;
  return contas
    .filter((a) => !alvo || alvo.has(a.id))
    .map((a) => {
      const s = porConta.get(a.id);
      const bruto: ConexaoBruta = {
        accountId: a.id,
        ativa: !!a.isActive,
        ultimoSync: a.lastSyncAt ?? null,
        tokenExpiraEm: a.tokenExpiresAt ?? null,
        googleAdsVinculado: comGads.has(a.id),
        googleAdsOauthAtivo,
        ga4Vinculado: comGa4.has(a.id),
        clarityLigado: !!s?.enabled && !!s?.hasToken,
        claritySyncStatus: s?.lastSyncStatus ?? null,
        pagespeedLigado: !!s?.performanceEnabled,
        pagespeedSyncStatus: s?.perfLastSyncStatus ?? null,
        temDominio: !!(s?.domain || s?.performanceUrl),
      };
      return { accountId: a.id, fontes: classificarFontes(bruto) };
    });
}

/** Fontes de um cliente só. */
export async function fontesDoCliente(accountId: number): Promise<Fonte[]> {
  const r = await fontesDeTodasAsContas([accountId]);
  return r[0]?.fontes ?? [];
}
