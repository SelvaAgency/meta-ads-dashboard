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
