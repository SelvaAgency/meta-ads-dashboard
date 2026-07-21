/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Primeira leitura do GA4 — vínculo vira dado
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  Até aqui as propriedades estavam descobertas e vinculadas, mas nunca lidas:
 *  o chip do cliente ficava âmbar dizendo "vinculada, mas nenhuma leitura foi
 *  feita ainda". Este serviço fecha esse ciclo.
 *
 *  Duas regras que atravessam o arquivo:
 *
 *   · Só sincroniza propriedade COM vínculo. Havia 46 descobertas para 8
 *     vinculadas — ler as 38 restantes seria gastar cota da API com dado que
 *     ninguém vê.
 *
 *   · Falha de UMA propriedade não derruba as outras. Descobrir pela Admin API
 *     e ler pela Data API são permissões diferentes: uma propriedade pode
 *     aparecer na lista e recusar a leitura. Isso é status daquela propriedade,
 *     não bug do sync.
 *
 *  E-commerce fica de fora: só registramos o booleano `ecommerceDetectado`.
 *  Receita, itens e funil são etapa própria.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { logger } from "../logger";
import {
  getGA4Config, getGA4Overview, getGA4TrafficSources, getGA4TopPages,
  getGA4Conversions, getGA4Channels, getGA4LandingPages, ga4TemEcommerce,
} from "../ga4Service";
import {
  listarTodasContasGA4, tokenDaContaGA4, registrarSyncGA4, salvarSiteSnapshot,
} from "../db";

/** Janelas lidas a cada sync. Viram `estrategia` na chave do snapshot. */
export const JANELAS = [7, 30] as const;
export type Janela = (typeof JANELAS)[number];

/** Data local da agência — nunca toISOString sobre "agora". */
const dia = (dias = 0): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" })
    .format(new Date(Date.now() - dias * 86400000));

export type ResultadoPropriedade = {
  ga4Id: number;
  propertyId: string;
  propriedade: string | null;
  accountId: number;
  status: "ok" | "sem_dados" | "erro";
  sessoes?: number;
  erro?: string;
  aviso?: string;
};

/**
 * Lê uma propriedade nas duas janelas e grava um snapshot por janela.
 *
 * Devolve `sem_dados` quando a propriedade responde mas não houve tráfego — é
 * diferente de erro, e confundir os dois faria alguém reconectar uma
 * integração saudável.
 */
export async function sincronizarPropriedade(conta: {
  id: number; propertyId: string; propertyName: string | null;
  linkedAccountId: number | null; refreshToken?: string | null; refreshTokenEncrypted?: string | null;
}): Promise<ResultadoPropriedade> {
  const base = {
    ga4Id: conta.id, propertyId: conta.propertyId,
    propriedade: conta.propertyName, accountId: conta.linkedAccountId!,
  };

  const token = tokenDaContaGA4(conta);
  if (!token) {
    const erro = "Credencial da propriedade não pôde ser lida. Reconecte o Google Analytics.";
    await registrarSyncGA4(conta.id, "error", erro);
    return { ...base, status: "erro", erro };
  }

  const config = getGA4Config(token);
  let sessoesTotais = 0;
  let aviso: string | undefined;

  try {
    for (const janela of JANELAS) {
      const inicio = dia(janela), fim = dia(0);

      // Em paralelo: são chamadas independentes da mesma propriedade.
      const [resumo, canais, origens, landing, paginas, eventos, temEcom] = await Promise.all([
        getGA4Overview(config, conta.propertyId, inicio, fim),
        getGA4Channels(config, conta.propertyId, inicio, fim).catch(() => []),
        getGA4TrafficSources(config, conta.propertyId, inicio, fim, 10).catch(() => []),
        getGA4LandingPages(config, conta.propertyId, inicio, fim).catch(() => []),
        getGA4TopPages(config, conta.propertyId, inicio, fim, 10).catch(() => []),
        getGA4Conversions(config, conta.propertyId, inicio, fim).catch(() => []),
        ga4TemEcommerce(config, conta.propertyId, inicio, fim),
      ]);

      if (resumo.conversoesIndisponiveis) aviso = resumo.conversoesIndisponiveis;
      if (janela === 7) sessoesTotais = resumo.sessions;

      await salvarSiteSnapshot({
        accountId: conta.linkedAccountId!,
        provider: "ga4",
        url: `properties/${conta.propertyId}`,
        estrategia: `${janela}d`,
        dia: fim,
        metricsJson: {
          periodo: `${janela}d`, inicio, fim,
          sessions: resumo.sessions,
          users: resumo.totalUsers,
          newUsers: resumo.newUsers,
          pageviews: resumo.pageviews,
          engagedSessions: resumo.engagedSessions,
          engagementRate: resumo.engagementRate,
          avgEngagementDuration: resumo.avgSessionDuration,
          bounceRate: resumo.bounceRate,
          conversions: resumo.conversions,
          eventCount: resumo.eventCount,
          // Só o booleano. Receita e funil são etapa própria.
          ecommerceDetectado: temEcom,
        },
        issuesJson: {
          canais,
          origens: origens.map((o) => ({ fonte: `${o.source} / ${o.medium}`, sessions: o.sessions })),
          landingPages: landing,
          paginas: paginas.map((p) => ({ url: p.pagePath, titulo: p.pageTitle, views: p.pageviews })),
          eventos: eventos.map((e) => ({ nome: e.eventName, contagem: e.conversions })),
          ...(aviso ? { limitacoes: [aviso] } : {}),
        },
      });
    }

    await registrarSyncGA4(conta.id, "success", null);
    return {
      ...base,
      status: sessoesTotais > 0 ? "ok" : "sem_dados",
      sessoes: sessoesTotais,
      ...(aviso ? { aviso } : {}),
    };
  } catch (e) {
    // A mensagem da API vai inteira: "permission denied" e "property not found"
    // pedem ações diferentes, e resumir os dois em "erro" apaga a diferença.
    const erro = (e as Error)?.message ?? String(e);
    await registrarSyncGA4(conta.id, "error", erro);
    logger.error(`[GA4Sync] ${conta.propertyId} (${conta.propertyName ?? "sem nome"}): ${erro}`);
    return { ...base, status: "erro", erro };
  }
}

export type ResultadoSync = {
  total: number; ok: number; semDados: number; falhas: number;
  detalhes: ResultadoPropriedade[];
};

/**
 * Sincroniza as propriedades vinculadas. `apenas` restringe a uma delas — é
 * como a primeira validação roda, numa propriedade só, antes de soltar nas oito.
 */
export async function sincronizarGA4(apenas?: number[]): Promise<ResultadoSync> {
  const todas = await listarTodasContasGA4();
  const alvo = todas.filter((c) =>
    c.linkedAccountId != null && (!apenas || apenas.includes(c.id)));

  logger.info(`[GA4Sync] início · ${alvo.length} propriedade(s) vinculada(s) de ${todas.length} descoberta(s)`);

  const detalhes: ResultadoPropriedade[] = [];
  for (const c of alvo) {
    detalhes.push(await sincronizarPropriedade(c));
    // Respiro entre propriedades: a Data API tem cota por projeto.
    await new Promise((r) => setTimeout(r, 400));
  }

  const r: ResultadoSync = {
    total: alvo.length,
    ok: detalhes.filter((d) => d.status === "ok").length,
    semDados: detalhes.filter((d) => d.status === "sem_dados").length,
    falhas: detalhes.filter((d) => d.status === "erro").length,
    detalhes,
  };
  logger.info(`[GA4Sync] fim · ${r.ok} com dados · ${r.semDados} sem dados · ${r.falhas} falha(s)`);
  for (const d of detalhes.filter((x) => x.status === "erro")) {
    logger.error(`[GA4Sync] ${d.propertyId}: ${d.erro}`);
  }
  return r;
}
