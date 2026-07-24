/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Sincronização de lojas — orquestrador NEUTRO (dispatch por plataforma)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  O fluxo genérico vive aqui: decripta credencial → busca 30d → deriva 7d →
 *  grava 1 snapshot por janela (dedup pela chave única) → registra o sync. O
 *  que muda por plataforma é SÓ o "buscar + normalizar", que cada serviço
 *  (woocommerce.ts, vnda.ts) fornece. Assim nenhuma plataforma conhece a outra.
 *
 *  A credencial é decriptada em `credenciaisDaConexao`, usada na chamada e
 *  descartada — nunca entra em log, erro ou snapshot.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { logger } from "../logger";
import { credenciaisDaConexao, registrarSyncEcommerce, salvarSiteSnapshot, conexoesAtivasParaSync } from "../db";
import { buscarPedidos30d, agregarPedidos } from "./woocommerce";
import { buscarPedidosVnda, agregarPedidosVnda } from "./vnda";
import type { BlocoLoja } from "./lojaAgregacao";

/** Data local da agência — nunca toISOString sobre "agora". */
const diaLocal = (diasAtras = 0): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" })
    .format(new Date(Date.now() - diasAtras * 86400000));

export type ResultadoSyncLoja =
  | { ok: true; detalhe: string; pedidos30d: number }
  | { ok: false; erro: string };

type Credencial = NonNullable<Awaited<ReturnType<typeof credenciaisDaConexao>>>;

/** Bloco por janela, específico da plataforma. Recebe (janela, inicio, fim). */
type MontarBlocos = (janela: "7d" | "30d", inicio: string, fim: string) => BlocoLoja;

/**
 * Busca os pedidos da plataforma UMA vez e devolve um montador de bloco por
 * janela + o total 30d + se truncou. É o único ponto que conhece a plataforma.
 */
async function buscarPorPlataforma(
  cred: Credencial, inicio30: string, fim: string,
): Promise<{ montar: MontarBlocos; total30d: number; truncado: boolean }> {
  if (cred.platform === "woocommerce") {
    // consumerKey = ck_, consumerSecret = cs_
    const { pedidos, truncado } = await buscarPedidos30d(cred.storeUrl, cred.consumerKey, cred.consumerSecret, inicio30);
    return { montar: (j, i, f) => agregarPedidos(pedidos, j, i, f), total30d: pedidos.length, truncado };
  }
  if (cred.platform === "vnda") {
    // consumerSecret = token (Bearer), consumerKey = X-Shop-Host (não-segredo)
    const { pedidos, truncado } = await buscarPedidosVnda(cred.storeUrl, cred.consumerSecret, cred.consumerKey || null, inicio30, fim);
    return { montar: (j, i, f) => agregarPedidosVnda(pedidos, j, i, f), total30d: pedidos.length, truncado };
  }
  throw new Error(`Importação ainda não implementada para ${cred.platform}.`);
}

/**
 * Importa UMA loja (qualquer plataforma suportada). Grava provider = plataforma
 * da conexão. Rodar 2× no dia atualiza o mesmo registro (chave única).
 */
export async function sincronizarLoja(conexaoId: number): Promise<ResultadoSyncLoja> {
  const cred = await credenciaisDaConexao(conexaoId);
  if (!cred) {
    return { ok: false, erro: "Conexão não encontrada ou credencial ilegível — recadastre as chaves." };
  }

  const hoje = diaLocal(0);
  const inicio30 = diaLocal(29); // 30 dias INCLUSIVE o de hoje
  const inicio7 = diaLocal(6);

  let montar: MontarBlocos, total30d: number, truncado: boolean;
  try {
    ({ montar, total30d, truncado } = await buscarPorPlataforma(cred, inicio30, hoje));
  } catch (e) {
    // Mensagem NOSSA — nunca o corpo cru da loja (poderia ecoar credencial).
    const erro = e instanceof Error && e.message ? e.message : "A loja não respondeu durante a importação.";
    await registrarSyncEcommerce(conexaoId, false, erro);
    logger.warn(`[LojaSync] sync falhou para conexão #${conexaoId} (${cred.platform}): ${erro}`);
    return { ok: false, erro };
  }

  for (const [janela, inicio] of [["7d", inicio7], ["30d", inicio30]] as const) {
    const bloco = montar(janela, inicio, hoje);
    if (truncado) bloco.limitacoes.push("Importação truncada em 1.000 pedidos — números do período são um piso, não o total.");
    await salvarSiteSnapshot({
      accountId: cred.accountId,
      provider: cred.platform,          // "woocommerce" | "vnda"
      url: cred.storeUrl,
      estrategia: janela,
      dia: hoje,
      metricsJson: { ...bloco, inicio, fim: hoje },
    });
  }

  await registrarSyncEcommerce(conexaoId, true, null);
  logger.info(`[LojaSync] sync ok para conexão #${conexaoId} (${cred.platform}): ${total30d} pedidos em 30d`);
  return { ok: true, detalhe: `Importados ${total30d} pedidos dos últimos 30 dias.`, pedidos30d: total30d };
}

// ─── Orquestração do cron (06:45) ────────────────────────────────────────────

export type ResultadoLojaCiclo = { conexaoId: number; accountId: number; ok: boolean; erro?: string };

export type ResumoCicloLojas = {
  total: number;
  ok: number;
  falhas: number;
  /** Uma loja OK grava 2 snapshots (7d + 30d). */
  snapshotsAtualizados: number;
  erros: { accountId: number; erro: string }[];
};

/**
 * Redutor PURO do ciclo — testável sem banco. Cada loja OK atualiza 2 snapshots.
 * Falha não conta snapshot e entra em `erros`.
 */
export function resumirCicloLojas(resultados: ResultadoLojaCiclo[]): ResumoCicloLojas {
  const ok = resultados.filter((r) => r.ok);
  const falhas = resultados.filter((r) => !r.ok);
  return {
    total: resultados.length,
    ok: ok.length,
    falhas: falhas.length,
    snapshotsAtualizados: ok.length * 2,
    erros: falhas.map((r) => ({ accountId: r.accountId, erro: r.erro ?? "erro desconhecido" })),
  };
}

/**
 * Sincroniza as lojas do CRON, isoladas. Nesta etapa o cron processa APENAS
 * WooCommerce — a VNDA entra por sync MANUAL até o mapa de status ser validado
 * com os dados reais da UMA; só então avaliamos incluí-la aqui.
 */
export async function sincronizarLojas(): Promise<ResultadoLojaCiclo[]> {
  const conexoes = (await conexoesAtivasParaSync()).filter((c) => c.platform === "woocommerce");
  const resultados: ResultadoLojaCiclo[] = [];
  for (const c of conexoes) {
    try {
      const r = await sincronizarLoja(c.id);
      resultados.push({ conexaoId: c.id, accountId: c.accountId, ok: r.ok, erro: r.ok ? undefined : r.erro });
    } catch (e) {
      // sincronizarLoja já não lança; cinto-e-suspensório para nada contaminar as seguintes.
      const erro = e instanceof Error && e.message ? e.message : "falha inesperada no sync da loja";
      logger.error(`[LojaSync] exceção inesperada na conexão #${c.id}: ${erro}`);
      resultados.push({ conexaoId: c.id, accountId: c.accountId, ok: false, erro });
    }
  }
  return resultados;
}
