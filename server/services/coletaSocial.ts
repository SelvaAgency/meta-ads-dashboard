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
const METRICAS_PERFIL: Array<{
  nome: string;
  params: Record<string, string>;
  /**
   * Pede sozinha, mesmo compartilhando a forma com o lote.
   *
   * Existe por causa de um risco assimétrico: se uma métrica do lote for
   * inválida, a Meta recusa a chamada INTEIRA e a cascata pede as sete
   * individualmente — 1 chamada vira 8, em toda conta, todo dia, para sempre.
   *
   * Métrica ainda não confirmada em produção não pode carregar esse risco pelas
   * outras seis. Isolada, uma recusa custa exatamente uma chamada falha e entra
   * em `recusadas` — os quatro estados fazem o resto.
   */
  isolada?: boolean;
}> = [
  { nome: "reach", params: { period: "day", metric_type: "total_value" } },
  { nome: "profile_views", params: { period: "day", metric_type: "total_value" } },
  { nome: "website_clicks", params: { period: "day", metric_type: "total_value" } },
  { nome: "profile_links_taps", params: { period: "day", metric_type: "total_value" } },
  { nome: "total_interactions", params: { period: "day", metric_type: "total_value" } },
  { nome: "views", params: { period: "day", metric_type: "total_value" } },
  // Novos seguidores do dia. Recusa `metric_type` — ver Fase 0.
  { nome: "follower_count", params: { period: "day" } },
  /**
   * Respostas recebidas nos stories.
   *
   * A Meta revelou esta métrica ao recusar `impressions` na Fase 0, e a
   * sondagem a testou. Ela entra ISOLADA porque nunca rodou em produção: se
   * for recusada dentro do lote, derruba as outras seis junto.
   *
   * É resposta a STORY, e não mensagem de Direct — as duas chegam na mesma
   * caixa de entrada e são coisas diferentes. Direct exige
   * `instagram_manage_messages` e a Conversations API, que não temos.
   */
  { nome: "replies", params: { period: "day", metric_type: "total_value" }, isolada: true },
];

/**
 * Agrupa as métricas de perfil pela FORMA da chamada.
 *
 * Métricas com os mesmos parâmetros cabem numa chamada só. As que pedem
 * parâmetros diferentes — `follower_count` recusa `metric_type` — ficam em
 * grupos próprios. Agrupar por conveniência, e não pela forma medida, faria
 * uma métrica exigente derrubar o lote inteiro.
 */
function gruposDePerfil(): Array<{
  params: Record<string, string>;
  metricas: typeof METRICAS_PERFIL;
}> {
  const porForma = new Map<string, { params: Record<string, string>; metricas: typeof METRICAS_PERFIL }>();
  for (const m of METRICAS_PERFIL) {
    // `isolada` ganha uma chave própria: mesmo compartilhando os parâmetros com
    // o lote, ela não pode arrastá-lo numa recusa.
    const chave = m.isolada
      ? `isolada:${m.nome}`
      : JSON.stringify(Object.entries(m.params).sort());
    const grupo = porForma.get(chave) ?? { params: m.params, metricas: [] };
    grupo.metricas.push(m);
    porForma.set(chave, grupo);
  }
  return Array.from(porForma.values());
}

/**
 * Lê uma resposta em lote, casando cada item pelo `name`.
 *
 * O que foi PEDIDO e não voltou entra em `recusadas`. Em lote a Meta responde
 * só com o que aceitou, então a ausência é silenciosa: sem esta regra, a
 * métrica sumida viraria `undefined` e depois `null` — indistinguível de "não
 * perguntamos". Os quatro estados morreriam aqui, sem ninguém notar.
 */
function lerLoteDeInsights(
  dados: Array<Record<string, unknown>>, pedidas: string[],
  rotulo = "não veio na resposta do lote",
): { valores: Record<string, number>; recusadas: Record<string, string> } {
  const valores: Record<string, number> = {};
  const recusadas: Record<string, string> = {};
  for (const nome of pedidas) {
    const item = dados.find((d) => String(d.name ?? "") === nome);
    if (!item) {
      recusadas[nome] = rotulo;
      continue;
    }
    // As duas formas medidas: perfil responde em `total_value`, mídia em
    // `values[]`. Aceitar as duas evita um leitor por endpoint.
    const v = (item.total_value as { value?: unknown } | undefined)?.value
      ?? (item.values as Array<{ value?: unknown }> | undefined)?.[0]?.value;
    if (typeof v === "number") valores[nome] = v;
    else recusadas[nome] = "respondeu sem valor";
  }
  return { valores, recusadas };
}

/**
 * Campos da listagem de mídia.
 *
 * `media_url` e `thumbnail_url` entraram em 14/08 e custaram ZERO chamadas: são
 * campos da MESMA requisição de listagem que já acontecia. A alternativa —
 * buscar a imagem por publicação na hora de renderizar — reintroduziria
 * exatamente o volume que a otimização 186→6 acabou de eliminar.
 *
 * As URLs do CDN da Meta são assinadas e EXPIRAM. Guardá-las não dá histórico
 * permanente de imagem: a coleta diária renova a URL das mídias que ainda estão
 * nas 25 mais recentes, e as mais antigas apodrecem. A tela trata isso com
 * fallback, e é uma limitação da origem, não do desenho.
 */
const CAMPOS_MIDIA =
  "id,caption,media_type,media_product_type,timestamp,permalink,like_count,comments_count,media_url,thumbnail_url";

/** Métricas por publicação, todas confirmadas na sondagem. */
export const METRICAS_MIDIA = ["reach", "views", "likes", "saved", "shares", "comments", "total_interactions"];

/**
 * A listagem com os insights ANINHADOS — o caminho que derruba 175 chamadas
 * para zero extras.
 *
 * Medido em 13/08: 25 de 25 mídias vieram com insights, em carrossel, reel e
 * imagem, com as sete métricas e no formato que o normalizador já lê.
 *
 * O risco conhecido é que um campo inválido derrube a listagem INTEIRA — e aí o
 * cliente ficaria sem publicação nenhuma, que é pior do que o desenho antigo.
 * Por isso existe a queda em cascata logo abaixo.
 */
const CAMPOS_MIDIA_COM_INSIGHTS =
  `${CAMPOS_MIDIA},insights.metric(${METRICAS_MIDIA.join(",")})`;

/** Por onde as métricas de mídia vieram — entra no diagnóstico da rodada. */
export type CaminhoDasMidias = "aninhado" | "lote" | "individual" | "nenhum";

/**
 * Lê os insights que vieram grudados na mídia.
 *
 * A métrica PEDIDA e não devolvida entra em `recusadas`, e não some: em lote a
 * Meta responde só com o que aceitou, e mapear apenas o que chegou faria a
 * ausente virar `undefined` e depois `null` — indistinguível de "não
 * perguntamos". Os quatro estados morreriam aqui, em silêncio.
 */
function lerInsightsAninhados(ins: unknown, rotulo = "não veio na resposta aninhada"): {
  valores: Record<string, number>; recusadas: Record<string, string>;
} {
  const dados = Array.isArray((ins as { data?: unknown })?.data)
    ? ((ins as { data: Array<Record<string, unknown>> }).data)
    : [];
  return lerLoteDeInsights(dados, METRICAS_MIDIA, rotulo);
}

export interface MidiaColetada {
  mediaId: string;
  publicadoEm: string | null;
  /** URL do CDN da Meta. ASSINADA e temporária — ver CAMPOS_MIDIA. */
  thumbnailUrl: string | null;
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
  /** Por onde as métricas de mídia vieram nesta coleta. */
  caminhoDasMidias: CaminhoDasMidias;
  /** Quantas chamadas a Meta recebeu por esta conta — a conta que faltava. */
  chamadas: number;
  /** Quantas delas falharam. Separa "poucas chamadas ruins" de "tudo caiu". */
  chamadasComErro: number;
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
  consultarCru: Consultar,
  base: string,
  opts: { limiteMidias?: number; apenasStories?: boolean } = {},
): Promise<ColetaSocial> {
  const metricas: Record<string, number> = {};
  const recusadas: Record<string, string> = {};
  const erroDe = (e: unknown) => sanitizar((e as Error).message ?? "erro sem mensagem");

  // Contador em volta do consultor: é ele que transforma "acho que são muitas
  // chamadas" em número. A hipótese de volume não se confirma por estimativa —
  // minha estimativa no plano errou por duas ordens de grandeza.
  let chamadas = 0;
  let chamadasComErro = 0;
  const consultarContado: Consultar = async (caminho, params) => {
    chamadas += 1;
    try {
      return await consultarCru(caminho, params);
    } catch (e) {
      chamadasComErro += 1;
      throw e;
    }
  };
  const consultar = consultarContado;

  const r: ColetaSocial = {
    caminhoDasMidias: "nenhum", chamadas: 0, chamadasComErro: 0,
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
    r.chamadas = chamadas;
    r.chamadasComErro = chamadasComErro;
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

  // ── Insights de perfil, em lotes por forma de chamada ─────────────────────
  //
  // As sete métricas viravam sete chamadas. Seis delas pedem exatamente os
  // mesmos parâmetros (`period=day&metric_type=total_value`) e cabem numa só;
  // `follower_count` recusa `metric_type` e continua sozinha, porque agrupar
  // por conveniência derrubaria o lote inteiro por causa dela.
  //
  // Se o lote cair, cada métrica é pedida individualmente — uma métrica ruim
  // não pode levar as outras cinco junto.
  for (const grupo of gruposDePerfil()) {
    const nomes = grupo.metricas.map((m) => m.nome);
    if (nomes.length > 1) {
      try {
        const resp = await consultar<{ data?: Array<Record<string, unknown>> }>(
          `${base}/insights`, { metric: nomes.join(","), ...grupo.params });
        const lido = lerLoteDeInsights(resp.data ?? [], nomes);
        Object.assign(metricas, lido.valores);
        Object.assign(recusadas, lido.recusadas);
        continue;
      } catch (e) {
        recusadas["insights_perfil_lote"] = erroDe(e);
      }
    }
    // Um a um: o caminho antigo, agora só quando o lote falha ou o grupo tem
    // uma métrica só.
    for (const { nome, params } of grupo.metricas) {
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

  // ── Mídias, com os insights grudados ──────────────────────────────────────
  //
  // Cascata de três degraus, e ela existe por causa de um risco conhecido: um
  // campo inválido derruba a listagem INTEIRA, e aí o cliente ficaria sem
  // publicação nenhuma — pior que o desenho antigo, onde uma métrica morta
  // custava uma métrica.
  //
  //   1. listagem + insights aninhados      1 chamada     (o caminho medido)
  //   2. listagem pura + lote por mídia     1 + N
  //   3. listagem pura + métrica por métrica 1 + 7N       (o desenho antigo)
  //
  // Cada degrau só é tentado se o anterior falhar, então o custo normal é 1.
  const limite = String(opts.limiteMidias ?? 25);
  let lista: Array<Record<string, unknown>> = [];
  let aninhado = false;
  try {
    const resp = await consultar<{ data?: Array<Record<string, unknown>> }>(
      `${base}/media`, { fields: CAMPOS_MIDIA_COM_INSIGHTS, limit: limite });
    lista = resp.data ?? [];
    aninhado = true;
    r.caminhoDasMidias = "aninhado";
  } catch (e) {
    // Degrau 2: a listagem sem insights quase sempre passa, e é ela que salva
    // as publicações mesmo quando os números não vêm.
    recusadas["midias_aninhadas"] = erroDe(e);
    try {
      const resp = await consultar<{ data?: Array<Record<string, unknown>> }>(
        `${base}/media`, { fields: CAMPOS_MIDIA, limit: limite });
      lista = resp.data ?? [];
      r.caminhoDasMidias = "lote";
    } catch (e2) {
      recusadas["midias"] = erroDe(e2);
    }
  }

  for (const m of lista) {
    const mediaId = String(m.id ?? "");
    if (!mediaId) continue;
    let recusasDaMidia: Record<string, string> = {};
    let valores: Record<string, number> = {};

    if (aninhado) {
      // Zero chamadas: os números vieram junto da própria mídia.
      const lido = lerInsightsAninhados(m.insights);
      valores = lido.valores;
      recusasDaMidia = lido.recusadas;
    } else {
      // Degrau 2: as sete métricas numa chamada. Se a Meta recusar o lote por
      // causa de uma delas, o degrau 3 descobre QUAL — pedindo uma a uma.
      try {
        const resp = await consultar<{ data?: Array<Record<string, unknown>> }>(
          `${mediaId}/insights`, { metric: METRICAS_MIDIA.join(",") });
        const lido = lerInsightsAninhados({ data: resp.data ?? [] }, "não veio na resposta do lote");
        valores = lido.valores;
        recusasDaMidia = lido.recusadas;
      } catch {
        r.caminhoDasMidias = "individual";
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
      // `thumbnail_url` só existe em vídeo; imagem e carrossel usam `media_url`.
      // Sem o fallback, todo post de imagem ficaria sem miniatura.
      thumbnailUrl: m.thumbnail_url ? String(m.thumbnail_url)
        : m.media_url ? String(m.media_url) : null,
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
  r.chamadas = chamadas;
  r.chamadasComErro = chamadasComErro;
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
