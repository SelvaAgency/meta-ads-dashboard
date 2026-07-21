/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Fontes de dados de um cliente — o que está conectado, de verdade
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  Antes, os chips de conexão liam `client/src/config/clientConfig.ts`, um
 *  arquivo hardcoded no frontend. Consequências reais medidas em 21/07/2026:
 *
 *   · o chip "Meta Ads" era a string fixa "● Meta Ads" — verde sempre, mesmo na
 *     ARKA, que estava havia sete semanas sem sincronizar e com token expirado;
 *   · nenhum dos 11 clientes preenchia `ga4PropertyId` nem
 *     `googleAdsCustomerId`, então o chip do Google Ads estava apagado para
 *     todos — enquanto QUATRO contas estavam vinculadas de verdade no banco.
 *
 *  Um indicador que está sempre verde não informa nada; um que está sempre
 *  apagado esconde trabalho já feito. A fonte de verdade passa a ser o banco.
 *
 *  Este arquivo é compartilhado (servidor classifica, cliente desenha) para que
 *  os dois lados não possam divergir sobre o que "conectado" significa.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type ChaveFonte = "meta" | "google_ads" | "ga4" | "clarity" | "pagespeed" | "site";

/**
 *  ok      → conectado e saudável
 *  atencao → conectado, mas precisa de ação (token expirado, sync antigo)
 *  erro    → o próprio sistema registrou falha na última tentativa
 *  ausente → não conectado (o chip fica cinza; nenhum card é criado)
 */
export type StatusFonte = "ok" | "atencao" | "erro" | "ausente";

export type Fonte = {
  chave: ChaveFonte;
  rotulo: string;
  status: StatusFonte;
  /** Por que não está ok. Vira o texto discreto do tooltip — nunca um card. */
  porque?: string;
};

export const ROTULO_FONTE: Record<ChaveFonte, string> = {
  meta: "Meta Ads",
  google_ads: "Google Ads",
  ga4: "GA4",
  clarity: "Clarity",
  pagespeed: "PageSpeed",
  site: "Site",
};

/** Ordem de exibição — as fontes de mídia primeiro, as técnicas depois. */
export const ORDEM_FONTES: ChaveFonte[] = ["meta", "google_ads", "ga4", "clarity", "pagespeed", "site"];

export const conectada = (f: Fonte): boolean => f.status !== "ausente";
export const precisaAcao = (f: Fonte): boolean => f.status === "atencao" || f.status === "erro";

/** Dados crus de conexão de UMA conta — o que o banco sabe, sem interpretação. */
export type ConexaoBruta = {
  accountId: number;
  /** Meta */
  ativa: boolean;
  ultimoSync: Date | null;
  tokenExpiraEm: Date | null;
  /** Google Ads */
  googleAdsVinculado: boolean;
  googleAdsOauthAtivo: boolean;
  /** GA4 */
  ga4Vinculado: boolean;
  ga4UltimoSync?: Date | null;
  /** OAuth da agência ativo? Vinculada sem OAuth não consegue ler nada. */
  ga4OauthAtivo?: boolean;
  /** Clarity */
  clarityLigado: boolean;
  claritySyncStatus: string | null;
  /** PageSpeed */
  pagespeedLigado: boolean;
  pagespeedSyncStatus: string | null;
  /** Site (SSL/uptime) */
  temDominio: boolean;
  /** Fallback legado do clientConfig — só entra quando o banco não sabe de nada. */
  legado?: { ga4?: boolean; googleAds?: boolean };
};

/**
 * O sync roda todo dia às 06:00. Duas rodadas perdidas já é sintoma, não ruído
 * — dá margem para uma falha isolada sem deixar passar conta abandonada.
 */
export const HORAS_ATE_SYNC_VELHO = 48;

/**
 * Classifica as fontes de uma conta. Função PURA: recebe os dados crus e
 * devolve o status. Fica separada da consulta para poder ser testada sem banco
 * — e é aqui que mora a definição de "conectado".
 */
export function classificarFontes(c: ConexaoBruta, agora: Date = new Date()): Fonte[] {
  const f = (chave: ChaveFonte, status: StatusFonte, porque?: string): Fonte =>
    ({ chave, rotulo: ROTULO_FONTE[chave], status, ...(porque ? { porque } : {}) });

  // ── Meta ──────────────────────────────────────────────────────────────────
  const meta = ((): Fonte => {
    if (!c.ativa) return f("meta", "ausente", "Conta inativa no Spaces.");
    const motivos: string[] = [];
    if (c.tokenExpiraEm && c.tokenExpiraEm.getTime() <= agora.getTime()) {
      motivos.push("Token expirado");
    }
    if (!c.ultimoSync) {
      motivos.push("Nunca sincronizou");
    } else {
      const horas = (agora.getTime() - c.ultimoSync.getTime()) / 3_600_000;
      if (horas > HORAS_ATE_SYNC_VELHO) motivos.push(`Último sync ${formatarData(c.ultimoSync)}`);
    }
    // Conectado com problema é AMARELO, nunca cinza: a conta continua listada e
    // o histórico continua legível — o que mudou é que ela para de mentir verde.
    return motivos.length
      ? f("meta", "atencao", `${motivos.join(" · ")}. A conexão precisa de ação.`)
      : f("meta", "ok");
  })();

  // ── Google Ads ────────────────────────────────────────────────────────────
  const googleAds = ((): Fonte => {
    if (!c.googleAdsVinculado) {
      return c.legado?.googleAds
        ? f("google_ads", "atencao", "Configurado no cadastro antigo, sem vínculo no banco.")
        : f("google_ads", "ausente", "Nenhuma conta do Google Ads vinculada a este cliente.");
    }
    return c.googleAdsOauthAtivo
      ? f("google_ads", "ok")
      : f("google_ads", "atencao", "Conta vinculada, mas a agência não está conectada ao Google.");
  })();

  // ── GA4 ───────────────────────────────────────────────────────────────────
  const ga4 = ((): Fonte => {
    if (c.ga4Vinculado) {
      if (c.ga4OauthAtivo === false) {
        return f("ga4", "erro", "Propriedade vinculada, mas a agência não está conectada ao Google Analytics.");
      }
      // A data da última leitura entra no rótulo: propriedade vinculada que
      // nunca sincronizou parece conectada e não é.
      return c.ga4UltimoSync
        ? f("ga4", "ok", `Última leitura em ${formatarData(c.ga4UltimoSync)}.`)
        : f("ga4", "atencao", "Propriedade vinculada, mas nenhuma leitura foi feita ainda.");
    }
    return c.legado?.ga4
      ? f("ga4", "atencao", "Propriedade no cadastro antigo, sem vínculo no banco.")
      : f("ga4", "ausente", "Google Analytics ainda não conectado.");
  })();

  // ── Clarity ───────────────────────────────────────────────────────────────
  const clarity = c.clarityLigado
    ? (c.claritySyncStatus === "erro"
        ? f("clarity", "erro", "A última sincronização do Clarity falhou.")
        : f("clarity", "ok"))
    : f("clarity", "ausente", "Microsoft Clarity ainda não conectado.");

  // ── PageSpeed ─────────────────────────────────────────────────────────────
  const pagespeed = c.pagespeedLigado
    ? (c.pagespeedSyncStatus === "erro"
        ? f("pagespeed", "erro", "O último teste de performance falhou.")
        : f("pagespeed", "ok"))
    : f("pagespeed", "ausente", "Teste de performance ainda não configurado.");

  // ── Site (SSL, headers, uptime) ───────────────────────────────────────────
  const site = c.temDominio
    ? f("site", "ok")
    : f("site", "ausente", "Domínio do site ainda não informado.");

  const todas = { meta, google_ads: googleAds, ga4, clarity, pagespeed, site };
  return ORDEM_FONTES.map((k) => todas[k]);
}

function formatarData(d: Date): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" }).format(d);
}
