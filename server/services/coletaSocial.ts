/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Coleta diária de Redes Sociais
 * ─────────────────────────────────────────────────────────────────────────────
 *  Lê o que a sondagem PROVOU que existe — nada aqui é aposta. Cada métrica é
 *  pedida na forma que respondeu na medição de 12/08:
 *
 *    total_value          reach, profile_views, website_clicks,
 *                         profile_links_taps, total_interactions, views
 *    período (legado)     follower_count
 *    total_value+breakdown follows_and_unfollows
 *
 *  ── Nenhum zero de consolo ─────────────────────────────────────────────────
 *  Métrica que falhou entra em `recusadas` com o motivo e fica FORA de
 *  `metricas`. Assim `null` continua querendo dizer "não temos", e 0 continua
 *  querendo dizer "a Meta mediu e deu zero". Um `?? 0` aqui apagaria a diferença
 *  para sempre, porque o snapshot é o único registro daquele dia.
 *
 *  ── O breakdown vai cru ────────────────────────────────────────────────────
 *  `follows_and_unfollows` devolve FOLLOWER / NON_FOLLOWER, e ainda não se sabe
 *  se isso é direção da ação ou segmentação de audiência. Guardar interpretado
 *  seria decidir a questão gravando — e uma leitura invertida ficaria impossível
 *  de corrigir depois, porque o dado original não existiria mais.
 *
 *  ── Uma falha não derruba a coleta ─────────────────────────────────────────
 *  Perfil, insights, mídias e stories falham cada um por conta própria. Perder
 *  os posts do dia porque uma métrica de perfil caiu seria transformar um
 *  problema pequeno num buraco permanente.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { diaDe, tipoDeConteudo } from "@shared/tipoDeMidia";
import { sanitizar } from "./instagram";
import type { Consultar } from "./instagramSondagem";

/** Forma de chamada de cada métrica de perfil, medida na Fase 0. */
const METRICAS_PERFIL: Array<{ nome: string; params: Record<string, string> }> = [
  { nome: "reach", params: { period: "day", metric_type: "total_value" } },
  { nome: "profile_views", params: { period: "day", metric_type: "total_value" } },
  { nome: "website_clicks", params: { period: "day", metric_type: "total_value" } },
  { nome: "profile_links_taps", params: { period: "day", metric_type: "total_value" } },
  { nome: "total_interactions", params: { period: "day", metric_type: "total_value" } },
  { nome: "views", params: { period: "day", metric_type: "total_value" } },
  // Novos seguidores do dia. Recusa `metric_type` — ver Fase 0.
  { nome: "follower_count", params: { period: "day" } },
];

const CAMPOS_MIDIA =
  "id,caption,media_type,media_product_type,timestamp,permalink,like_count,comments_count";

/** Métricas por publicação, todas confirmadas na sondagem. */
const METRICAS_MIDIA = ["reach", "views", "likes", "saved", "shares", "comments", "total_interactions"];

export interface MidiaColetada {
  mediaId: string;
  publicadoEm: string | null;
  tipo: string | null;
  produto: string | null;
  permalink: string | null;
  legenda: string | null;
  likes: number | null;
  comentarios: number | null;
  reach: number | null;
  views: number | null;
  saves: number | null;
  shares: number | null;
  totalInteractions: number | null;
  recusadas: Record<string, string>;
}

export interface ColetaSocial {
  followersCount: number | null;
  followsCount: number | null;
  mediaCount: number | null;
  /** Só o que a Meta entregou. O que falhou está em `recusadas`. */
  metricas: Record<string, number>;
  recusadas: Record<string, string>;
  /** O breakdown `follow_type` como veio, sem interpretação. */
  followTypeBreakdownRaw: unknown | null;
  midias: MidiaColetada[];
  storiesVistos: number | null;
  status: "ok" | "parcial" | "erro";
  erro: string | null;
}

const numero = (v: unknown): number | null => (typeof v === "number" ? v : null);

/**
 * Coleta tudo de uma conta.
 *
 * `base` é o id do Instagram (fonte da agência) ou `"me"` (fonte por login) —
 * a mesma parametrização da sondagem, pelo mesmo motivo: é a única diferença
 * entre as duas APIs neste fluxo.
 */
export async function coletarDeInstagram(
  consultar: Consultar,
  base: string,
  opts: { limiteMidias?: number; apenasStories?: boolean } = {},
): Promise<ColetaSocial> {
  const metricas: Record<string, number> = {};
  const recusadas: Record<string, string> = {};
  const erroDe = (e: unknown) => sanitizar((e as Error).message ?? "erro sem mensagem");

  const r: ColetaSocial = {
    followersCount: null, followsCount: null, mediaCount: null,
    metricas, recusadas, followTypeBreakdownRaw: null,
    midias: [], storiesVistos: null, status: "ok", erro: null,
  };

  // ── Stories primeiro: é a leitura que não espera ─────────────────────────
  // Story vive 24h, e uma falha nas etapas anteriores atrasaria a única chamada
  // que não pode ser refeita mais tarde.
  try {
    const s = await consultar<{ data?: unknown[] }>(`${base}/stories`, { fields: "id,media_type,timestamp" });
    r.storiesVistos = s.data?.length ?? 0;
  } catch (e) {
    // Fica null, e NÃO zero: a coleta não sabe quantos havia.
    recusadas["stories"] = erroDe(e);
  }

  if (opts.apenasStories) {
    r.status = r.storiesVistos === null ? "erro" : "ok";
    r.erro = recusadas["stories"] ?? null;
    return r;
  }

  // ── Perfil ────────────────────────────────────────────────────────────────
  try {
    const p = await consultar<Record<string, unknown>>(base, {
      fields: "followers_count,follows_count,media_count",
    });
    r.followersCount = numero(p.followers_count);
    r.followsCount = numero(p.follows_count);
    r.mediaCount = numero(p.media_count);
  } catch (e) {
    recusadas["perfil"] = erroDe(e);
  }

  // ── Insights de perfil ────────────────────────────────────────────────────
  for (const { nome, params } of METRICAS_PERFIL) {
    try {
      const resp = await consultar<{ data?: Array<Record<string, unknown>> }>(
        `${base}/insights`, { metric: nome, ...params });
      const item = resp.data?.[0];
      const v = (item?.total_value as { value?: unknown } | undefined)?.value
        ?? (item?.values as Array<{ value?: unknown }> | undefined)?.[0]?.value;
      if (typeof v === "number") metricas[nome] = v;
      else recusadas[nome] = "respondeu sem valor";
    } catch (e) {
      recusadas[nome] = erroDe(e);
    }
  }

  // ── O breakdown, cru ──────────────────────────────────────────────────────
  try {
    const resp = await consultar<{ data?: Array<Record<string, unknown>> }>(
      `${base}/insights`,
      { metric: "follows_and_unfollows", period: "day", metric_type: "total_value", breakdown: "follow_type" });
    const quebras = (resp.data?.[0]?.total_value as { breakdowns?: unknown } | undefined)?.breakdowns;
    r.followTypeBreakdownRaw = quebras ?? null;
    if (!quebras) recusadas["follows_and_unfollows"] = "respondeu sem breakdown";
  } catch (e) {
    recusadas["follows_and_unfollows"] = erroDe(e);
  }

  // ── Mídias ────────────────────────────────────────────────────────────────
  let lista: Array<Record<string, unknown>> = [];
  try {
    const resp = await consultar<{ data?: Array<Record<string, unknown>> }>(
      `${base}/media`, { fields: CAMPOS_MIDIA, limit: String(opts.limiteMidias ?? 25) });
    lista = resp.data ?? [];
  } catch (e) {
    recusadas["midias"] = erroDe(e);
  }

  for (const m of lista) {
    const mediaId = String(m.id ?? "");
    if (!mediaId) continue;
    const recusasDaMidia: Record<string, string> = {};
    const valores: Record<string, number> = {};

    for (const metrica of METRICAS_MIDIA) {
      try {
        const resp = await consultar<{ data?: Array<Record<string, unknown>> }>(
          `${mediaId}/insights`, { metric: metrica });
        const item = resp.data?.[0];
        const v = (item?.values as Array<{ value?: unknown }> | undefined)?.[0]?.value
          ?? (item?.total_value as { value?: unknown } | undefined)?.value;
        if (typeof v === "number") valores[metrica] = v;
        else recusasDaMidia[metrica] = "respondeu sem valor";
      } catch (e) {
        recusasDaMidia[metrica] = erroDe(e);
      }
    }

    const legenda = m.caption ? String(m.caption) : null;
    r.midias.push({
      mediaId,
      publicadoEm: m.timestamp ? String(m.timestamp) : null,
      tipo: tipoDeConteudo({
        mediaType: m.media_type as string | undefined,
        mediaProductType: m.media_product_type as string | undefined,
      }),
      produto: m.media_product_type ? String(m.media_product_type) : null,
      permalink: m.permalink ? String(m.permalink) : null,
      // Truncada: a legenda serve para reconhecer o post numa lista, não para
      // guardar o conteúdo do cliente.
      legenda: legenda ? legenda.slice(0, 300) : null,
      likes: numero(m.like_count),
      comentarios: numero(m.comments_count),
      reach: valores.reach ?? null,
      views: valores.views ?? null,
      saves: valores.saved ?? null,
      shares: valores.shares ?? null,
      totalInteractions: valores.total_interactions ?? null,
      recusadas: recusasDaMidia,
    });
  }

  // ── Veredito da coleta ────────────────────────────────────────────────────
  // "erro" só quando NADA veio. Uma métrica recusada é `parcial`: o dia tem
  // dado, e marcá-lo como erro faria a série descartar uma leitura boa.
  const nadaVeio = r.followersCount === null && Object.keys(metricas).length === 0 && r.midias.length === 0;
  r.status = nadaVeio ? "erro" : Object.keys(recusadas).length > 0 ? "parcial" : "ok";
  r.erro = nadaVeio ? Object.values(recusadas)[0] ?? "nenhum dado retornado" : null;
  return r;
}

/**
 * Lista publicações até ultrapassar o início do período, paginando.
 *
 * Existe porque "posts publicados no período" precisa alcançar o passado, e uma
 * página só não alcança: a coleta diária pega as 25 mais recentes, o que basta
 * para um snapshot mas trunca a contagem de trinta dias de uma conta que publica
 * todo dia. O número truncado apareceria plausível, arredondado e errado.
 *
 * Para no primeiro post ANTERIOR ao início — a lista vem em ordem decrescente de
 * data, então dali para trás não há mais nada do período. `maxPaginas` é
 * salvaguarda contra conta com histórico enorme e período muito antigo.
 */
export async function listarMidiasAte(
  consultar: Consultar,
  base: string,
  inicio: string,
  opts: { porPagina?: number; maxPaginas?: number } = {},
): Promise<{ midias: Array<Record<string, unknown>>; completo: boolean; paginas: number }> {
  const porPagina = opts.porPagina ?? 50;
  const maxPaginas = opts.maxPaginas ?? 12;
  const midias: Array<Record<string, unknown>> = [];
  let depois: string | undefined;
  let paginas = 0;

  while (paginas < maxPaginas) {
    const params: Record<string, string> = { fields: CAMPOS_MIDIA, limit: String(porPagina) };
    if (depois) params.after = depois;
    const r = await consultar<{ data?: Array<Record<string, unknown>>; paging?: { cursors?: { after?: string } } }>(
      `${base}/media`, params);
    paginas += 1;
    const pagina = r.data ?? [];
    midias.push(...pagina);

    // Alcançou o período inteiro: o mais antigo desta página já é anterior.
    const maisAntigo = pagina[pagina.length - 1]?.timestamp;
    if (!pagina.length || (maisAntigo && diaDe(String(maisAntigo))! < inicio)) {
      return { midias, completo: true, paginas };
    }
    depois = r.paging?.cursors?.after;
    if (!depois) return { midias, completo: true, paginas };
  }
  // Bateu o teto: a contagem pode estar incompleta, e quem chama precisa saber
  // para não apresentar um número truncado como se fosse total.
  return { midias, completo: false, paginas };
}

/** O dia da coleta, no fuso de São Paulo — o mesmo que o resto do Spaces usa. */
export function diaDeHoje(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(agora);
}

export { diaDe };
