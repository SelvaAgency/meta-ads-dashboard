/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Coleta do LinkedIn — executa o plano, conta o que gastou, grava o que veio
 * ─────────────────────────────────────────────────────────────────────────────
 *  Nenhuma decisão de escopo mora aqui: o que pedir vem de
 *  `shared/linkedinPlanoDeColeta`, o que a resposta significa vem de
 *  `shared/linkedinLab`. Este arquivo executa e persiste.
 *
 *  ── Três regras que a Fase 0 comprou com erro ──────────────────────────────
 *  1. Ausência NUNCA vira zero. Coluna numérica sem medida fica NULL, e o
 *     motivo (quando existe) vai para `indisponiveisJson`.
 *  2. A chave do endpoint de post sai do URN de CADA publicação, e o lote só
 *     leva URNs do mesmo tipo.
 *  3. A resposta do lote é casada pelo `ugcPost` DEVOLVIDO — o endpoint omite
 *     publicação sem estatística, e casar por posição atribuiria a métrica de
 *     um post a outro, em silêncio.
 *
 *  ── E uma que vale para toda a Fase 1 ──────────────────────────────────────
 *  Zero IA. Nenhum caminho daqui chama `invokeLLM`.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { getDb } from "../db";
import {
  linkedinColetaExecucoes, linkedinPageDaily, linkedinPageLifetime,
  linkedinPages, linkedinPostMetrics, linkedinPosts,
} from "../../drizzle/schema";
import { logger } from "../logger";
import * as api from "./linkedinApi";
import { novoContador, type Contador, type Ctx } from "./linkedinApi";
import {
  classificarResposta, statusDoVinculo,
  type CapacidadeLinkedIn, type MapaDeCapacidades,
} from "@shared/linkedinLab";
import {
  JANELA_POSTS_ATIVOS_DIAS, LOTE_DE_METRICAS, SOBREPOSICAO_DIAS,
  TETO_REACOES_CARGA, janelasDaCarga, planoDeCargaInicial, planoIncremental,
} from "@shared/linkedinPlanoDeColeta";

const dia = (d: Date) => d.toISOString().slice(0, 10);

/** Um passo da coleta, para a tela poder mostrar progresso de verdade. */
export interface PassoExecutado {
  passo: string;
  estado: "ok" | "vazio" | "recusado" | "erro";
  detalhe: string;
  chamadas: number;
}

export interface ResultadoDaColeta {
  pageId: number;
  modo: "carga" | "incremental" | "semanal";
  chamadasEstimadas: number;
  chamadas: number;
  chamadasComErro: number;
  registros: number;
  capacidades: MapaDeCapacidades;
  status: ReturnType<typeof statusDoVinculo>;
  passos: PassoExecutado[];
  duracaoMs: number;
}

/** Anota uma capacidade a partir da resposta crua. */
function anotar(
  mapa: MapaDeCapacidades, cap: CapacidadeLinkedIn,
  r: { ok: boolean; status: number | null; erro: string | null },
  vazio = false, agora = new Date(),
) {
  mapa[cap] = {
    estado: classificarResposta(r, vazio),
    status: r.status,
    motivo: r.erro,
    medidaEm: agora.toISOString(),
  };
}

/**
 * Achata um objeto aninhado em `caminho → número`.
 *
 * É como os ~30 recortes de `pageViews` cabem numa coluna só sem perder
 * nenhum. Guardar só os que hoje parecem úteis obrigaria a recoletar 395 dias
 * no dia em que o Gui quisesse o 31º.
 */
function numeros(o: unknown, prefixo = "", nivel = 0): Record<string, number> {
  const saida: Record<string, number> = {};
  if (!o || typeof o !== "object" || nivel > 4) return saida;
  for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
    const caminho = prefixo ? `${prefixo}.${k}` : k;
    if (typeof v === "number") saida[caminho] = v;
    else if (v && typeof v === "object" && !Array.isArray(v)) {
      Object.assign(saida, numeros(v, caminho, nivel + 1));
    }
  }
  return saida;
}

const num = (v: unknown): number | null => (typeof v === "number" ? v : null);

/** `timeRange.start` em ms → `AAAA-MM-DD`. */
const diaDoBalde = (el: Record<string, unknown>): string | null => {
  const tr = el.timeRange as { start?: unknown } | undefined;
  const s = typeof tr?.start === "number" ? tr.start : null;
  return s ? new Date(s).toISOString().slice(0, 10) : null;
};

interface Alvo {
  id: number;
  organizationId: string;
  organizationUrn: string;
}

/* ═══ Séries ══════════════════════════════════════════════════════════════ */

/** Acumula `dia → { campo: valor }` sem nunca inventar zero. */
type Acumulado = Map<string, Record<string, unknown>>;

function juntar(acc: Acumulado, d: string, campos: Record<string, unknown>) {
  acc.set(d, { ...(acc.get(d) ?? {}), ...campos });
}

async function coletarSerieDeSeguidores(
  ctx: Ctx, alvo: Alvo, janelas: Array<{ de: number; ate: number }>,
  acc: Acumulado, mapa: MapaDeCapacidades, passos: PassoExecutado[],
) {
  for (const j of janelas) {
    const antes = ctx.contador.chamadas;
    const r = await api.seguidoresSerie(ctx, alvo.organizationUrn, j.de, j.ate);
    const els = r.dados?.elements ?? [];
    for (const el of els) {
      const d = diaDoBalde(el);
      if (!d) continue;
      const g = (el.followerGains ?? {}) as Record<string, unknown>;
      juntar(acc, d, {
        ganhoOrganico: num(g.organicFollowerGain),
        ganhoPago: num(g.paidFollowerGain),
      });
    }
    anotar(mapa, "seguidores_serie", r, r.ok && els.length === 0, ctx.agora);
    passos.push({
      passo: `seguidores · ${j.de}–${j.ate}d`,
      estado: r.ok ? (els.length ? "ok" : "vazio") : (r.status === 403 ? "recusado" : "erro"),
      detalhe: r.ok ? `${els.length} dia(s)` : (r.erro ?? "falhou"),
      chamadas: ctx.contador.chamadas - antes,
    });
  }
}

async function coletarSerieDaPagina(
  ctx: Ctx, alvo: Alvo, janelas: Array<{ de: number; ate: number }>,
  acc: Acumulado, mapa: MapaDeCapacidades, passos: PassoExecutado[],
) {
  for (const j of janelas) {
    const antes = ctx.contador.chamadas;
    const r = await api.paginaSerie(ctx, alvo.organizationUrn, j.de, j.ate);
    const els = r.dados?.elements ?? [];
    for (const el of els) {
      const d = diaDoBalde(el);
      if (!d) continue;
      juntar(acc, d, { views: numeros(el.totalPageStatistics) });
    }
    anotar(mapa, "pagina_serie", r, r.ok && els.length === 0, ctx.agora);
    passos.push({
      passo: `visualizações · ${j.de}–${j.ate}d`,
      estado: r.ok ? (els.length ? "ok" : "vazio") : (r.status === 403 ? "recusado" : "erro"),
      detalhe: r.ok ? `${els.length} dia(s)` : (r.erro ?? "falhou"),
      chamadas: ctx.contador.chamadas - antes,
    });
  }
}

/* ═══ Publicações ═════════════════════════════════════════════════════════ */

interface PostLido {
  urn: string; tipoUrn: "ugcPost" | "share";
  publicadoEm: Date | null; editadoEm: Date | null;
  lifecycleState: string | null; visibility: string | null;
  commentary: string | null; content: unknown; bruto: unknown;
}

function lerPost(el: Record<string, unknown>): PostLido | null {
  const urn = String(el.id ?? "");
  if (!urn) return null;
  const ms = (v: unknown) => (typeof v === "number" ? new Date(v) : null);
  return {
    urn,
    tipoUrn: urn.includes(":ugcPost:") ? "ugcPost" : "share",
    publicadoEm: ms(el.publishedAt) ?? ms(el.createdAt),
    editadoEm: ms(el.lastModifiedAt),
    lifecycleState: el.lifecycleState ? String(el.lifecycleState) : null,
    visibility: el.visibility ? String(el.visibility) : null,
    commentary: el.commentary ? String(el.commentary) : null,
    content: el.content ?? null,
    bruto: el,
  };
}

/** Os URNs de imagem que aparecem em `content`, em qualquer profundidade. */
function urnsDeImagem(content: unknown, saida: string[] = [], nivel = 0): string[] {
  if (!content || typeof content !== "object" || nivel > 5) return saida;
  for (const v of Object.values(content as Record<string, unknown>)) {
    if (typeof v === "string" && /^urn:li:(image|video|digitalmediaAsset):/.test(v)) {
      if (!saida.includes(v)) saida.push(v);
    } else if (v && typeof v === "object") urnsDeImagem(v, saida, nivel + 1);
  }
  return saida;
}

/** Lotes homogêneos: `ugcPost` e `share` nunca no mesmo `List(...)`. */
export function lotesPorTipo(urns: string[], tamanho = LOTE_DE_METRICAS): string[][] {
  const ugc = urns.filter((u) => u.includes(":ugcPost:"));
  const share = urns.filter((u) => !u.includes(":ugcPost:"));
  const cortar = (xs: string[]) => {
    const out: string[][] = [];
    for (let i = 0; i < xs.length; i += tamanho) out.push(xs.slice(i, i + tamanho));
    return out;
  };
  return [...cortar(ugc), ...cortar(share)];
}

/**
 * Casa a resposta do lote pelo URN DEVOLVIDO.
 *
 * `ugcPost` (ou `share`) vem em cada elemento. O endpoint omite publicação sem
 * estatística — pedimos 2 e voltou 1, medido. Por posição, a métrica do
 * primeiro cairia no segundo sem erro nenhum.
 */
export function casarPorUrn(
  els: Array<Record<string, unknown>>,
): Map<string, Record<string, unknown>> {
  const m = new Map<string, Record<string, unknown>>();
  for (const el of els) {
    const urn = String(el.ugcPost ?? el.share ?? "");
    if (!urn) continue;
    m.set(urn, (el.totalShareStatistics ?? {}) as Record<string, unknown>);
  }
  return m;
}

/* ═══ A coleta de UMA Página ══════════════════════════════════════════════ */

export interface OpcoesDeColeta {
  token: string;
  alvo: Alvo;
  modo: "carga" | "incremental" | "semanal";
  agora?: Date;
  /** Teto de publicações a resolver imagem por rodada. Protege a cota. */
  tetoDeImagens?: number;
}

export async function coletarPaginaLinkedIn(o: OpcoesDeColeta): Promise<ResultadoDaColeta> {
  const t0 = Date.now();
  const agora = o.agora ?? new Date();
  const contador: Contador = novoContador();
  const ctx: Ctx = { token: o.token, contador, agora };
  const mapa: MapaDeCapacidades = {};
  const passos: PassoExecutado[] = [];
  const db = await getDb();
  const hoje = dia(agora);
  let registros = 0;

  const carga = o.modo === "carga";
  const semanal = carga || o.modo === "semanal";

  const marcar = (
    nome: string, r: { ok: boolean; status: number | null; erro: string | null },
    vazio: boolean, detalhe: string, antes: number,
  ) => passos.push({
    passo: nome,
    estado: r.ok ? (vazio ? "vazio" : "ok") : (r.status === 403 ? "recusado" : "erro"),
    detalhe: r.ok ? detalhe : (r.erro ?? "falhou"),
    chamadas: contador.chamadas - antes,
  });

  /* ── Página ─────────────────────────────────────────────────────────── */
  let organizacaoJson: unknown = null;
  /**
   * O nome vindo dos detalhes.
   *
   * A coleta já buscava `localizedName` e o jogava dentro de
   * `organizacaoJson` — e o vínculo continuava mostrando o número da
   * organização para sempre, mesmo depois de uma sincronização bem-sucedida.
   * Buscar e não gravar é pior que não buscar: paga a chamada e não resolve.
   */
  let nomeDaOrg: string | null = null;
  let vanityDaOrg: string | null = null;
  if (semanal) {
    const antes = contador.chamadas;
    const r = await api.organizacao(ctx, o.alvo.organizationId);
    organizacaoJson = r.dados ?? null;
    if (r.dados?.localizedName) nomeDaOrg = String(r.dados.localizedName);
    if (r.dados?.vanityName) vanityDaOrg = String(r.dados.vanityName);
    anotar(mapa, "pagina", r, false, agora);
    marcar("detalhes da organização", r, false,
      r.dados?.localizedName ? String(r.dados.localizedName) : "ok", antes);
  }

  /* ── Seguidores ─────────────────────────────────────────────────────── */
  const acc: Acumulado = new Map();
  {
    const antes = contador.chamadas;
    const r = await api.seguidoresAtuais(ctx, o.alvo.organizationUrn);
    const total = num(r.dados?.firstDegreeSize);
    anotar(mapa, "seguidores_atuais", r, r.ok && total === null, agora);
    if (total !== null) juntar(acc, hoje, { seguidoresTotal: total });
    marcar("seguidores atuais", r, total === null, `${total ?? "—"} seguidores`, antes);
  }

  let segmentacoesJson: unknown = null;
  if (semanal) {
    const antes = contador.chamadas;
    const r = await api.seguidoresLifetime(ctx, o.alvo.organizationUrn);
    const el = r.dados?.elements?.[0];
    segmentacoesJson = el ?? null;
    anotar(mapa, "seguidores_segmentacoes", r, r.ok && !el, agora);
    marcar("segmentações de seguidores", r, !el,
      `${el ? Object.keys(el).length : 0} recorte(s)`, antes);
  }

  const janelas = carga
    ? janelasDaCarga(agora)
    : [{ de: SOBREPOSICAO_DIAS + 1, ate: 0 }];
  await coletarSerieDeSeguidores(ctx, o.alvo, janelas, acc, mapa, passos);

  /* ── Página · visualizações ─────────────────────────────────────────── */
  let totalPageStatisticsJson: unknown = null;
  if (semanal) {
    const antes = contador.chamadas;
    const r = await api.paginaLifetime(ctx, o.alvo.organizationUrn);
    const el = r.dados?.elements?.[0];
    totalPageStatisticsJson = el ?? null;
    anotar(mapa, "pagina_lifetime", r, r.ok && !el, agora);
    marcar("visualizações vitalício", r, !el, "ok", antes);
  }
  await coletarSerieDaPagina(ctx, o.alvo, janelas, acc, mapa, passos);

  /* ── Agregado ───────────────────────────────────────────────────────── */
  let agregadoDePostsJson: unknown = null;
  {
    const antes = contador.chamadas;
    const r = await api.agregadoDePosts(ctx, o.alvo.organizationUrn);
    const el = r.dados?.elements?.[0];
    agregadoDePostsJson = el ?? null;
    anotar(mapa, "agregado_de_posts", r, r.ok && !el, agora);
    marcar("agregado de publicações", r, !el, "ok", antes);
  }

  /* ── Publicações: descobrir primeiro ────────────────────────────────── */
  const lidos: PostLido[] = [];
  {
    const antes = contador.chamadas;
    let inicio = 0;
    let ultima: Awaited<ReturnType<typeof api.listarPosts>> | null = null;
    // Na carga, desce até acabar. No incremental, só a primeira página: o que
    // muda de um dia para o outro é o topo da lista.
    const maxPaginas = carga ? 40 : 1;
    for (let p = 0; p < maxPaginas; p++) {
      const r = await api.listarPosts(ctx, o.alvo.organizationUrn, inicio);
      ultima = r;
      const els = r.dados?.elements ?? [];
      for (const el of els) {
        const post = lerPost(el);
        if (post && !lidos.some((x) => x.urn === post.urn)) lidos.push(post);
      }
      if (!r.ok || els.length === 0) break;
      inicio += els.length;
    }
    const r = ultima!;
    anotar(mapa, "publicacoes", r, r.ok && lidos.length === 0, agora);
    marcar("listar publicações", r, lidos.length === 0,
      `${lidos.length} publicação(ões)`, antes);
  }

  /* ── Publicações: gravar identidade ─────────────────────────────────── */
  if (db && lidos.length) {
    for (const p of lidos) {
      await db.insert(linkedinPosts).values({
        pageId: o.alvo.id, postUrn: p.urn, tipoUrn: p.tipoUrn,
        publicadoEm: p.publicadoEm, editadoEm: p.editadoEm,
        lifecycleState: p.lifecycleState, visibility: p.visibility,
        commentary: p.commentary,
        contentJson: (p.content ?? null) as never,
        permalink: `https://www.linkedin.com/feed/update/${p.urn}/`,
        bruto: p.bruto as never,
      }).onDuplicateKeyUpdate({
        set: {
          commentary: p.commentary,
          contentJson: (p.content ?? null) as never,
          editadoEm: p.editadoEm,
          lifecycleState: p.lifecycleState,
          bruto: p.bruto as never,
        },
      });
      registros++;
    }
  }

  /* ── Publicações: quais medir ───────────────────────────────────────── */
  const corte = agora.getTime() - JANELA_POSTS_ATIVOS_DIAS * 86_400_000;
  const paraMedir = carga
    ? lidos
    : lidos.filter((p) => !p.publicadoEm || p.publicadoEm.getTime() >= corte);

  const metricasPorUrn = new Map<string, Record<string, unknown>>();
  const brutoDeMetricas: Array<Record<string, unknown>> = [];
  if (paraMedir.length) {
    const antes = contador.chamadas;
    let algumOk = false;
    let ultimoErro: { ok: boolean; status: number | null; erro: string | null } =
      { ok: true, status: 200, erro: null };
    for (const lote of lotesPorTipo(paraMedir.map((p) => p.urn))) {
      const r = await api.metricasDePosts(ctx, o.alvo.organizationUrn, lote);
      ultimoErro = r;
      const els = r.dados?.elements ?? [];
      if (r.ok) algumOk = true;
      brutoDeMetricas.push(...els);
      casarPorUrn(els).forEach((stats, urn) => metricasPorUrn.set(urn, stats));
    }
    anotar(mapa, "metricas_por_post",
      algumOk ? { ok: true, status: 200, erro: null } : ultimoErro,
      algumOk && metricasPorUrn.size === 0, agora);
    marcar("métricas por publicação", algumOk ? { ok: true, status: 200, erro: null } : ultimoErro,
      metricasPorUrn.size === 0,
      `${metricasPorUrn.size} de ${paraMedir.length} pedida(s)`, antes);
  }

  /* ── Reações por tipo: 1 chamada por publicação ─────────────────────── */
  //
  // É o item mais caro da coleta, e por isso tem teto. Na carga, as N mais
  // recentes; no incremental, só as que apareceram hoje. O que fica de fora é
  // `nao_coletado` — nunca zero.
  const reacoesPorUrn = new Map<string, Record<string, number>>();
  const acoesPorUrn = new Map<string, unknown>();
  let jaConhecidos = new Set<string>();
  if (db && !carga) {
    const anteriores = await db.select({ urn: linkedinPosts.postUrn })
      .from(linkedinPosts).where(eq(linkedinPosts.pageId, o.alvo.id));
    jaConhecidos = new Set(anteriores.map((x) => x.urn));
  }
  const paraReacoes = carga
    ? paraMedir.slice(0, TETO_REACOES_CARGA)
    : paraMedir.filter((p) => !jaConhecidos.has(p.urn));

  if (paraReacoes.length) {
    const antes = contador.chamadas;
    let algumOk = false;
    let ultimo: { ok: boolean; status: number | null; erro: string | null } =
      { ok: true, status: 200, erro: null };
    for (const p of paraReacoes) {
      const r = await api.metadadosSociais(ctx, p.urn);
      ultimo = r;
      if (r.ok) {
        algumOk = true;
        const rs = r.dados?.reactionSummaries as Record<string, unknown> | undefined;
        if (rs) reacoesPorUrn.set(p.urn, numeros(rs));
      }
      const a = await api.acoesSociais(ctx, p.urn);
      if (a.ok) acoesPorUrn.set(p.urn, a.dados);
    }
    anotar(mapa, "reacoes_por_tipo",
      algumOk ? { ok: true, status: 200, erro: null } : ultimo,
      algumOk && reacoesPorUrn.size === 0, agora);
    anotar(mapa, "comentarios",
      algumOk ? { ok: true, status: 200, erro: null } : ultimo,
      acoesPorUrn.size === 0, agora);
    marcar("reações por tipo", algumOk ? { ok: true, status: 200, erro: null } : ultimo,
      reacoesPorUrn.size === 0, `${reacoesPorUrn.size} publicação(ões)`, antes);
  }

  /* ── Imagens: tentativa MEDIDA, nunca promessa ──────────────────────── */
  const imagensPorUrn = new Map<string, unknown>();
  let motivoDaImagem: string | null = null;
  {
    const comMidia = lidos
      .map((p) => ({ p, urns: urnsDeImagem(p.content) }))
      .filter((x) => x.urns.length)
      .slice(0, o.tetoDeImagens ?? 40);
    const todas = Array.from(new Set(comMidia.flatMap((x) => x.urns)));
    if (todas.length) {
      const antes = contador.chamadas;
      const r = await api.resolverImagens(ctx, todas.slice(0, 20));
      if (r.ok && r.dados) {
        const res = (r.dados.results ?? r.dados) as Record<string, unknown>;
        for (const [urn, v] of Object.entries(res)) imagensPorUrn.set(urn, v);
      } else {
        motivoDaImagem = r.erro ?? `HTTP ${r.status ?? "?"}`;
      }
      marcar("resolver imagens", r, imagensPorUrn.size === 0,
        `${imagensPorUrn.size} de ${todas.length}`, antes);
    }
  }

  /* ── Gravar ─────────────────────────────────────────────────────────── */
  if (db) {
    // Diária: uma linha por dia, e null onde não houve medida.
    for (const [d, campos] of Array.from(acc.entries())) {
      const indis: Record<string, string> = {};
      for (const cap of ["seguidores_atuais", "seguidores_serie", "pagina_serie"] as const) {
        const l = mapa[cap];
        if (l && (l.estado === "sem_permissao" || l.estado === "nao_disponivel")) {
          indis[cap] = l.motivo ?? l.estado;
        }
      }
      const valores = {
        pageId: o.alvo.id, dia: d,
        seguidoresTotal: (campos.seguidoresTotal as number | undefined) ?? null,
        ganhoOrganico: (campos.ganhoOrganico as number | undefined) ?? null,
        ganhoPago: (campos.ganhoPago as number | undefined) ?? null,
        viewsJson: ((campos.views ?? null) as never),
        indisponiveisJson: (Object.keys(indis).length ? indis : null) as never,
        statusColeta: "ok",
        origem: carga ? "carga" : "cron",
      };
      await db.insert(linkedinPageDaily).values(valores)
        .onDuplicateKeyUpdate({
          set: {
            // COALESCE na aplicação: um incremental que não pediu seguidores
            // não pode apagar o valor que a carga gravou.
            ...(valores.seguidoresTotal !== null ? { seguidoresTotal: valores.seguidoresTotal } : {}),
            ...(valores.ganhoOrganico !== null ? { ganhoOrganico: valores.ganhoOrganico } : {}),
            ...(valores.ganhoPago !== null ? { ganhoPago: valores.ganhoPago } : {}),
            ...(campos.views ? { viewsJson: valores.viewsJson } : {}),
            indisponiveisJson: valores.indisponiveisJson,
            origem: valores.origem,
          },
        });
      registros++;
    }

    if (semanal && (segmentacoesJson || totalPageStatisticsJson || agregadoDePostsJson)) {
      await db.insert(linkedinPageLifetime).values({
        pageId: o.alvo.id, dia: hoje,
        segmentacoesJson: segmentacoesJson as never,
        totalPageStatisticsJson: totalPageStatisticsJson as never,
        agregadoDePostsJson: agregadoDePostsJson as never,
        organizacaoJson: organizacaoJson as never,
      }).onDuplicateKeyUpdate({
        set: {
          segmentacoesJson: segmentacoesJson as never,
          totalPageStatisticsJson: totalPageStatisticsJson as never,
          agregadoDePostsJson: agregadoDePostsJson as never,
          organizacaoJson: organizacaoJson as never,
        },
      });
      registros++;
    }

    // Métricas por publicação — e a mídia resolvida junto do post.
    for (const p of paraMedir) {
      const s = metricasPorUrn.get(p.urn);
      const reacoes = reacoesPorUrn.get(p.urn) ?? null;
      const acoes = acoesPorUrn.get(p.urn) ?? null;
      if (!s && !reacoes && !acoes) continue;
      const indis: Record<string, string> = {};
      if (!s) {
        const l = mapa.metricas_por_post;
        indis.metricas = l?.motivo ?? "a API não devolveu estatística para esta publicação";
      }
      await db.insert(linkedinPostMetrics).values({
        pageId: o.alvo.id, postUrn: p.urn, dia: hoje,
        impressions: num(s?.impressionCount),
        uniqueImpressions: num(s?.uniqueImpressionsCount),
        clicks: num(s?.clickCount),
        likes: num(s?.likeCount),
        comments: num(s?.commentCount),
        shares: num(s?.shareCount),
        engagement: typeof s?.engagement === "number" ? String(s.engagement) : null,
        reacoesPorTipoJson: reacoes as never,
        socialActionsJson: acoes as never,
        indisponiveisJson: (Object.keys(indis).length ? indis : null) as never,
        statusColeta: s ? "ok" : "parcial",
        bruto: (s ?? null) as never,
      }).onDuplicateKeyUpdate({
        set: {
          impressions: num(s?.impressionCount),
          uniqueImpressions: num(s?.uniqueImpressionsCount),
          clicks: num(s?.clickCount),
          likes: num(s?.likeCount),
          comments: num(s?.commentCount),
          shares: num(s?.shareCount),
          engagement: typeof s?.engagement === "number" ? String(s.engagement) : null,
          ...(reacoes ? { reacoesPorTipoJson: reacoes as never } : {}),
          ...(acoes ? { socialActionsJson: acoes as never } : {}),
          indisponiveisJson: (Object.keys(indis).length ? indis : null) as never,
          bruto: (s ?? null) as never,
        },
      });
      registros++;
    }

    // Mídia: URL resolvida, com carimbo. A URL de CDN expira — isto não é
    // histórico permanente de imagem, e o campo diz quando foi obtida.
    for (const p of lidos) {
      const urns = urnsDeImagem(p.content);
      if (!urns.length) continue;
      const resolvidas = urns.map((u) => ({
        urn: u,
        dados: imagensPorUrn.get(u) ?? null,
        obtidaEm: imagensPorUrn.has(u) ? agora.toISOString() : null,
      }));
      await db.update(linkedinPosts).set({
        midiasJson: resolvidas as never,
        midiaIndisponivel: resolvidas.some((x) => x.dados)
          ? null
          : (motivoDaImagem ?? "a API não devolveu URL para esta mídia"),
      }).where(and(
        eq(linkedinPosts.pageId, o.alvo.id),
        eq(linkedinPosts.postUrn, p.urn),
      ));
    }
  }

  /* ── Veredito e registro da execução ────────────────────────────────── */
  const status = statusDoVinculo(mapa);
  const plano = carga
    ? planoDeCargaInicial({
        posts: lidos.length,
        postsUgc: lidos.filter((p) => p.tipoUrn === "ugcPost").length,
      })
    : planoIncremental({
        postsAtivos: paraMedir.length,
        postsAtivosUgc: paraMedir.filter((p) => p.tipoUrn === "ugcPost").length,
        postsNovos: paraReacoes.length,
        incluirSemanal: o.modo === "semanal",
      });

  if (db) {
    await db.update(linkedinPages).set({
      // O nome é informação VISUAL — a identidade continua sendo o URN, e ela
      // não muda aqui. Reescrever a cada coleta é o que faz uma Página
      // renomeada no LinkedIn aparecer renomeada no Spaces.
      ...(nomeDaOrg ? { nome: nomeDaOrg } : {}),
      ...(vanityDaOrg ? { vanityName: vanityDaOrg } : {}),
      capacidade: status,
      capacidadeDetalheJson: mapa as never,
      ultimaColetaEm: agora,
      ultimoErro: status === "erro"
        ? (Object.values(mapa).find((l) => l.estado === "erro")?.motivo ?? "falha na coleta")
        : null,
      ...(carga ? { cargaInicialEm: agora, cargaInicialChamadas: contador.chamadas } : {}),
    }).where(eq(linkedinPages.id, o.alvo.id));

    await db.insert(linkedinColetaExecucoes).values({
      origem: "manual", escopo: carga ? "carga" : o.modo, dia: hoje, pageId: o.alvo.id,
      tentados: 1,
      ok: status === "completo" ? 1 : 0,
      parciais: status === "parcial" ? 1 : 0,
      erros: status === "erro" || status === "sem_acesso" ? 1 : 0,
      chamadasEstimadas: plano.chamadasEstimadas,
      chamadas: contador.chamadas,
      chamadasComErro: contador.comErro,
      registrosGravados: registros,
      duracaoMs: Date.now() - t0,
      detalheJson: { passos, bruto: contador.bruto } as never,
    });
  }

  logger.info("[linkedin] coleta concluída", {
    pageId: o.alvo.id, modo: o.modo, status,
    chamadas: contador.chamadas, estimadas: plano.chamadasEstimadas, registros,
  });

  return {
    pageId: o.alvo.id, modo: o.modo,
    chamadasEstimadas: plano.chamadasEstimadas,
    chamadas: contador.chamadas,
    chamadasComErro: contador.comErro,
    registros, capacidades: mapa, status, passos,
    duracaoMs: Date.now() - t0,
  };
}

/** Publicações da Página que ainda podem mudar — usado pelo orçamento da tela. */
export async function postsAtivos(pageId: number, agora = new Date()): Promise<{
  ativos: number; ativosUgc: number; total: number;
}> {
  const db = await getDb();
  if (!db) return { ativos: 0, ativosUgc: 0, total: 0 };
  const corte = new Date(agora.getTime() - JANELA_POSTS_ATIVOS_DIAS * 86_400_000);
  const todos = await db.select({ urn: linkedinPosts.postUrn, tipo: linkedinPosts.tipoUrn, em: linkedinPosts.publicadoEm })
    .from(linkedinPosts).where(eq(linkedinPosts.pageId, pageId));
  const ativos = todos.filter((p) => !p.em || p.em >= corte);
  return {
    ativos: ativos.length,
    ativosUgc: ativos.filter((p) => p.tipo === "ugcPost").length,
    total: todos.length,
  };
}

export { desc, gte, inArray };
