/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Leitura do laboratório — SÓ banco. Nenhuma chamada ao LinkedIn.
 * ─────────────────────────────────────────────────────────────────────────────
 *  A regra que este arquivo existe para garantir: **abrir a página, trocar de
 *  aba ou mudar um filtro não pode custar uma chamada à API**.
 *
 *  Sem cabeçalho de cota, um `useEffect` distraído gastaria a cota diária da
 *  agência numa tarde de exploração — e ninguém descobriria pelo erro, e sim
 *  pelo silêncio da API no dia seguinte. Por isso a leitura e a coleta moram em
 *  arquivos diferentes: aqui não há import de `linkedinApi`, e um teste guarda
 *  isso.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import { getDb } from "../db";
import {
  linkedinColetaExecucoes, linkedinPageDaily, linkedinPageLifetime,
  linkedinPages, linkedinPostMetrics, linkedinPosts,
} from "../../drizzle/schema";
import { lerConteudo, type EntradaDeMidia } from "@shared/linkedinConteudo";

/**
 * Os vínculos ATIVOS — os que o seletor mostra.
 *
 * O filtro por `ativo` faltava, e sem ele desvincular não desvinculava nada: a
 * Página continuava no seletor, porque desvincular marca `ativo=false` em vez
 * de apagar (o que já foi coletado é o registro de que a API entregava aquilo).
 */
export async function listarVinculos() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(linkedinPages)
    .where(eq(linkedinPages.ativo, true))
    .orderBy(asc(linkedinPages.nome));
}

/** Todos, inclusive os desvinculados — é como um vínculo removido volta. */
export async function listarTodosOsVinculos() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(linkedinPages).orderBy(asc(linkedinPages.nome));
}

export async function vinculo(pageId: number) {
  const db = await getDb();
  if (!db) return null;
  const [p] = await db.select().from(linkedinPages).where(eq(linkedinPages.id, pageId)).limit(1);
  return p ?? null;
}

/** A série diária, no período pedido. Dias sem linha ficam FALTANDO — não zero. */
export async function serieDiaria(pageId: number, de: string, ate: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(linkedinPageDaily)
    .where(and(
      eq(linkedinPageDaily.pageId, pageId),
      gte(linkedinPageDaily.dia, de),
      lte(linkedinPageDaily.dia, ate),
    ))
    .orderBy(asc(linkedinPageDaily.dia));
}

/** O retrato vitalício mais recente. */
export async function ultimoLifetime(pageId: number) {
  const db = await getDb();
  if (!db) return null;
  const [x] = await db.select().from(linkedinPageLifetime)
    .where(eq(linkedinPageLifetime.pageId, pageId))
    .orderBy(desc(linkedinPageLifetime.dia)).limit(1);
  return x ?? null;
}

/**
 * Publicações com a métrica MAIS RECENTE de cada uma.
 *
 * Duas consultas e uma junção em memória, em vez de um `GROUP BY` com
 * subconsulta: o volume é de dezenas por Página, e a versão legível ganha da
 * esperta quando as duas custam o mesmo.
 */
export async function publicacoes(pageId: number) {
  const db = await getDb();
  if (!db) return [];
  const posts = await db.select().from(linkedinPosts)
    .where(eq(linkedinPosts.pageId, pageId))
    .orderBy(desc(linkedinPosts.publicadoEm));
  const metricas = await db.select().from(linkedinPostMetrics)
    .where(eq(linkedinPostMetrics.pageId, pageId))
    .orderBy(asc(linkedinPostMetrics.dia));

  const ultima = new Map<string, typeof metricas[number]>();
  const historico = new Map<string, typeof metricas>();
  for (const m of metricas) {
    ultima.set(m.postUrn, m);
    historico.set(m.postUrn, [...(historico.get(m.postUrn) ?? []), m]);
  }
  return posts.map((p) => ({
    ...p,
    metrica: ultima.get(p.postUrn) ?? null,
    historico: historico.get(p.postUrn) ?? [],
  }));
}

/** As últimas execuções — é o bloco de consumo da API. */
export async function execucoes(pageId: number | null, limite = 20) {
  const db = await getDb();
  if (!db) return [];
  const q = db.select().from(linkedinColetaExecucoes);
  const r = pageId
    ? await q.where(eq(linkedinColetaExecucoes.pageId, pageId))
        .orderBy(desc(linkedinColetaExecucoes.executadaEm)).limit(limite)
    : await q.orderBy(desc(linkedinColetaExecucoes.executadaEm)).limit(limite);
  return r;
}

/**
 * A cobertura real: primeiro dia, último dia, e o que existe de fato.
 *
 * "Histórico disponível: 395 dias" é o que a API PERMITE. O que esta Página
 * TEM é outra coisa, e confundir as duas faria o laboratório prometer um ano de
 * série numa Página conectada ontem.
 */
/**
 * O que existe no banco para esta Página — contado, não estimado.
 *
 * Responde "o que já temos" sem uma única chamada à API. Foi a primeira coisa
 * que faltou quando a exploração começou: a tela mostrava lacunas e não dizia
 * se elas eram da API, da carteira ou de uma coleta que nunca rodou.
 *
 * Conta em memória e não com `COUNT(*)`: são dezenas a centenas de linhas por
 * Página, e a versão legível vale mais que a esperta quando as duas custam o
 * mesmo.
 */
export async function estadoDoBanco(pageId: number) {
  const db = await getDb();
  if (!db) return null;

  const [diario, vitalicios, posts, metricas, execs] = await Promise.all([
    db.select().from(linkedinPageDaily).where(eq(linkedinPageDaily.pageId, pageId))
      .orderBy(asc(linkedinPageDaily.dia)),
    db.select().from(linkedinPageLifetime).where(eq(linkedinPageLifetime.pageId, pageId))
      .orderBy(asc(linkedinPageLifetime.dia)),
    db.select().from(linkedinPosts).where(eq(linkedinPosts.pageId, pageId)),
    db.select().from(linkedinPostMetrics).where(eq(linkedinPostMetrics.pageId, pageId))
      .orderBy(asc(linkedinPostMetrics.dia)),
    db.select().from(linkedinColetaExecucoes).where(eq(linkedinColetaExecucoes.pageId, pageId))
      .orderBy(asc(linkedinColetaExecucoes.executadaEm)),
  ]);

  const ultimoVitalicio = vitalicios[vitalicios.length - 1] ?? null;
  const temChaves = (o: unknown) =>
    !!o && typeof o === "object" && Object.keys(o as object).length > 0;

  return {
    diario: {
      linhas: diario.length,
      primeiro: diario[0]?.dia ?? null,
      ultimo: diario[diario.length - 1]?.dia ?? null,
      comSeguidores: diario.filter((d) => d.seguidoresTotal !== null).length,
      comGanho: diario.filter((d) => d.ganhoOrganico !== null || d.ganhoPago !== null).length,
      comViews: diario.filter((d) => temChaves(d.viewsJson)).length,
      recortesDeView: Array.from(new Set(
        diario.flatMap((d) => Object.keys((d.viewsJson ?? {}) as Record<string, number>)))).length,
      comIndisponiveis: diario.filter((d) => temChaves(d.indisponiveisJson)).length,
    },
    vitalicio: (() => {
      // Contagem real no lugar de "presente": quantas facetas, quantos
      // recortes, quantos campos. "Presente 1" não deixa ninguém conferir nada.
      const contarFacetas = (o: unknown) => {
        if (!o || typeof o !== "object") return { grupos: 0, itens: 0 };
        const arrays = Object.values(o as Record<string, unknown>)
          .filter((v): v is unknown[] => Array.isArray(v) && v.length > 0);
        return { grupos: arrays.length, itens: arrays.reduce((t, a) => t + a.length, 0) };
      };
      const achatar = (o: unknown, n = 0): number => {
        if (!o || typeof o !== "object" || n > 4) return 0;
        return Object.values(o as Record<string, unknown>).reduce<number>((t, v) => {
          if (typeof v === "number") return t + 1;
          if (v && typeof v === "object" && !Array.isArray(v)) return t + achatar(v, n + 1);
          return t;
        }, 0);
      };
      const seg = contarFacetas(ultimoVitalicio?.segmentacoesJson);
      const vis = contarFacetas(ultimoVitalicio?.totalPageStatisticsJson);
      const total = (ultimoVitalicio?.totalPageStatisticsJson as
        { totalPageStatistics?: unknown } | null)?.totalPageStatistics;
      const agreg = (ultimoVitalicio?.agregadoDePostsJson as
        { totalShareStatistics?: unknown } | null)?.totalShareStatistics;
      return {
        linhas: vitalicios.length,
        primeiro: vitalicios[0]?.dia ?? null,
        ultimo: ultimoVitalicio?.dia ?? null,
        temSegmentacoes: temChaves(ultimoVitalicio?.segmentacoesJson),
        temVisualizacoes: temChaves(ultimoVitalicio?.totalPageStatisticsJson),
        temAgregado: temChaves(ultimoVitalicio?.agregadoDePostsJson),
        temOrganizacao: temChaves(ultimoVitalicio?.organizacaoJson),
        segmentacoesGrupos: seg.grupos,
        segmentacoesItens: seg.itens,
        visualizacoesFacetas: vis.grupos,
        visualizacoesItens: vis.itens,
        recortesVitalicios: achatar(total),
        camposDoAgregado: achatar(agreg),
        camposDaOrganizacao: ultimoVitalicio?.organizacaoJson
          ? Object.keys(ultimoVitalicio.organizacaoJson as object).length : 0,
        indisponiveis: (ultimoVitalicio?.indisponiveisJson ?? null) as Record<string, string> | null,
      };
    })(),
    publicacoes: (() => {
      // Mídia: quantas URNs existem, e quantas chegaram a ser PERGUNTADAS.
      // A diferença entre as duas é a informação que faltava.
      let urnsDeMidia = 0, urnsConsultadas = 0, urnsResolvidas = 0, indeterminadas = 0;
      for (const p of posts) {
        const ms = (p.midiasJson ?? []) as EntradaDeMidia[];
        if (!Array.isArray(ms) || !ms.length) continue;
        urnsDeMidia += ms.length;
        urnsConsultadas += ms.filter((m) => m.consultada === true).length;
        urnsResolvidas += ms.filter((m) => !!m.dados).length;
        if (ms.every((m) => typeof m.consultada !== "boolean")) indeterminadas++;
      }
      const porTipo: Record<string, number> = {};
      for (const p of posts) {
        const t = lerConteudo(p.contentJson, !!p.commentary).tipo;
        porTipo[t] = (porTipo[t] ?? 0) + 1;
      }
      return {
        linhas: posts.length,
        urnsDeMidia, urnsConsultadas, urnsResolvidas,
        publicacoesComMidiaIndeterminada: indeterminadas,
        porTipoDeConteudo: porTipo,
      comTexto: posts.filter((p) => !!p.commentary).length,
      comContent: posts.filter((p) => temChaves(p.contentJson)).length,
      comMidiaResolvida: posts.filter((p) =>
        Array.isArray(p.midiasJson)
        && (p.midiasJson as Array<{ dados: unknown }>).some((m) => !!m.dados)).length,
      comMidiaSemUrl: posts.filter((p) => !!p.midiaIndisponivel).length,
      ugcPost: posts.filter((p) => p.tipoUrn === "ugcPost").length,
      share: posts.filter((p) => p.tipoUrn === "share").length,
      maisAntiga: posts.map((p) => p.publicadoEm).filter(Boolean)
        .sort((a, b) => (a as Date).getTime() - (b as Date).getTime())[0] ?? null,
      maisNova: posts.map((p) => p.publicadoEm).filter(Boolean)
        .sort((a, b) => (b as Date).getTime() - (a as Date).getTime())[0] ?? null,
      };
    })(),
    metricas: {
      linhas: metricas.length,
      publicacoesDistintas: new Set(metricas.map((m) => m.postUrn)).size,
      diasDistintos: new Set(metricas.map((m) => m.dia)).size,
      primeiro: metricas[0]?.dia ?? null,
      ultimo: metricas[metricas.length - 1]?.dia ?? null,
      comImpressoes: metricas.filter((m) => m.impressions !== null).length,
      comReacoesPorTipo: metricas.filter((m) => temChaves(m.reacoesPorTipoJson)).length,
      comSocialActions: metricas.filter((m) => temChaves(m.socialActionsJson)).length,
      parciais: metricas.filter((m) => m.statusColeta !== "ok").length,
      // Publicações que existem e NÃO têm nenhuma linha de métrica. Não são
      // "não coletadas": o lote foi pedido e o endpoint omitiu.
      publicacoesSemMetrica: posts.length - new Set(metricas.map((m) => m.postUrn)).size,
    },
    execucoes: {
      linhas: execs.length,
      cargas: execs.filter((e) => e.escopo === "carga").length,
      incrementais: execs.filter((e) => e.escopo === "incremental").length,
      semanais: execs.filter((e) => e.escopo === "semanal").length,
      chamadasTotais: execs.reduce((t, e) => t + e.chamadas, 0),
      primeira: execs[0]?.executadaEm ?? null,
      ultima: execs[execs.length - 1]?.executadaEm ?? null,
    },
  };
}

export async function cobertura(pageId: number) {
  const db = await getDb();
  if (!db) return null;
  const dias = await db.select({ dia: linkedinPageDaily.dia })
    .from(linkedinPageDaily).where(eq(linkedinPageDaily.pageId, pageId))
    .orderBy(asc(linkedinPageDaily.dia));
  const posts = await db.select({ em: linkedinPosts.publicadoEm })
    .from(linkedinPosts).where(eq(linkedinPosts.pageId, pageId))
    .orderBy(asc(linkedinPosts.publicadoEm));
  const comMetrica = await db.select({ urn: linkedinPostMetrics.postUrn })
    .from(linkedinPostMetrics).where(eq(linkedinPostMetrics.pageId, pageId));

  return {
    primeiroDia: dias[0]?.dia ?? null,
    ultimoDia: dias[dias.length - 1]?.dia ?? null,
    diasComDado: dias.length,
    publicacoes: posts.length,
    publicacaoMaisAntiga: posts.find((p) => p.em)?.em ?? null,
    publicacoesComMetrica: new Set(comMetrica.map((x) => x.urn)).size,
  };
}
