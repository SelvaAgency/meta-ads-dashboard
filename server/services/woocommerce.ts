/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  WooCommerce — teste de conexão (F5-B)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  Esta etapa SÓ valida credencial. Nenhum pedido é importado ou salvo — a
 *  resposta da loja é descartada depois de olhar o status HTTP.
 *
 *  Regras de segurança que este arquivo carrega:
 *   · HTTPS obrigatório — Basic auth em http:// seria credencial em claro;
 *   · maxRedirects: 0 — seguir redirect com Authorization entrega a credencial
 *     ao destino do redirect. Se a loja redireciona (www, barra final), o erro
 *     instrui a usar a URL final;
 *   · a URL passa pelo urlGuard (anti-SSRF: IP privado, localhost, metadata);
 *   · NENHUM log ou erro contém consumer_key/secret — as mensagens são nossas,
 *     não o corpo cru da resposta.
 *
 *  Sobre "validar que é read-only": não há como provar que a chave não escreve
 *  sem TENTAR uma escrita — e escrever na loja do cliente para testar é
 *  exatamente o que não fazemos. Validamos a leitura; a UI instrui a gerar a
 *  chave com permissão Read.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { logger } from "../logger";
import { fetchSeguro, validarUrlPublica, UrlBloqueadaError } from "./urlGuard";
import { credenciaisDaConexao, registrarSyncEcommerce, salvarSiteSnapshot, conexoesAtivasParaSync } from "../db";

export class LojaUrlInvalidaError extends Error {}

/**
 * Normaliza e valida a URL da loja. HTTPS obrigatório, sem query/fragmento,
 * sem barra final — para o join com /wp-json ser previsível.
 */
export async function validarUrlDaLoja(bruta: string): Promise<string> {
  const { url } = await validarUrlPublica(bruta); // anti-SSRF + resolve DNS
  const u = new URL(url);
  if (u.protocol !== "https:") {
    throw new LojaUrlInvalidaError("A URL da loja precisa ser https:// — a credencial trafega em Basic auth.");
  }
  if (u.search || u.hash) {
    throw new LojaUrlInvalidaError("Informe só o endereço da loja, sem parâmetros (?) ou âncora (#).");
  }
  return `${u.origin}${u.pathname}`.replace(/\/+$/, "");
}

export type ResultadoTesteWoo =
  | { ok: true; detalhe: string }
  | { ok: false; erro: string };

/**
 * Testa a credencial contra a Woo REST API com a chamada mais leve que existe:
 * um pedido, campo id só. 200 prova leitura; 401 é chave errada; 404 é URL sem
 * WooCommerce. O corpo é descartado.
 */
export async function testarConexaoWoo(
  storeUrl: string,
  consumerKey: string,
  consumerSecret: string,
): Promise<ResultadoTesteWoo> {
  let base: string;
  try {
    base = await validarUrlDaLoja(storeUrl);
  } catch (e) {
    if (e instanceof LojaUrlInvalidaError || e instanceof UrlBloqueadaError) {
      return { ok: false, erro: e.message };
    }
    return { ok: false, erro: "Não foi possível validar a URL da loja." };
  }

  const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64");
  let resp: Response;
  try {
    ({ resp } = await fetchSeguro(`${base}/wp-json/wc/v3/orders?per_page=1&_fields=id`, {
      timeoutMs: 20_000,
      maxRedirects: 0, // credencial nunca segue redirect
      headers: { Authorization: `Basic ${auth}` },
    }));
  } catch (e) {
    // Com maxRedirects: 0, qualquer redirect faz o fetchSeguro LANÇAR — e a
    // mensagem genérica ("redirecionamentos demais") confundiria: aqui o
    // redirect é quase sempre www ou barra final. Traduzimos para a instrução.
    if (/redirecionamento/i.test((e as Error).message ?? "")) {
      return {
        ok: false,
        erro: "A URL redireciona (www? https final?). Use o endereço FINAL da loja — com credencial, redirect não é seguido.",
      };
    }
    if (e instanceof UrlBloqueadaError) return { ok: false, erro: e.message };
    // Mensagem nossa: a original poderia ecoar a URL com credencial embutida.
    return { ok: false, erro: "A loja não respondeu (tempo esgotado ou falha de rede)." };
  }
  if (resp.status === 401 || resp.status === 403) {
    return { ok: false, erro: "A loja recusou a credencial. Confira consumer_key e consumer_secret — e se a chave tem permissão de Leitura." };
  }
  if (resp.status === 404) {
    return { ok: false, erro: "WooCommerce REST não encontrado nessa URL. Confira se é a raiz da loja (a API fica em /wp-json/wc/v3)." };
  }
  if (!resp.ok) {
    return { ok: false, erro: `A loja respondeu ${resp.status}. Tente de novo; se persistir, verifique um plugin de segurança/WAF.` };
  }

  // 200: leitura confirmada. O corpo é descartado — nada de pedido nesta etapa.
  logger.info(`[Woo] teste ok para ${base} (credencial válida para leitura)`);
  return { ok: true, detalhe: "Conexão válida — a chave lê a API da loja." };
}

// ─── Importação de pedidos (F5-B mínima) ─────────────────────────────────────

/** O que usamos de cada pedido do Woo. O resto da resposta é descartado. */
export type PedidoWoo = {
  id: number;
  status: string;
  total: string;                       // o Woo manda valores como string
  date_created: string;                // hora local da loja
  line_items?: { name: string; quantity: number; total: string }[];
  coupon_lines?: { code: string; discount: string }[];
};

/** completed + processing = pago. É a definição padrão de receita no Woo. */
const STATUS_RECEITA = new Set(["completed", "processing"]);

export type BlocoWoo = {
  fonte: "woocommerce";
  status: "ok" | "sem_dados" | "erro";
  periodo: "7d" | "30d";
  receita: number | null;
  pedidos: number | null;
  ticketMedio: number | null;
  pedidosPorStatus: { status: string; quantidade: number }[];
  produtos: { nome: string; quantidade: number; receita: number }[];
  cupons: { codigo: string; usos: number; desconto: number }[];
  reembolsos: number | null;
  cancelamentos: number | null;
  limitacoes: string[];
};

const num = (v: unknown): number => {
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : 0;
};

/**
 * Agrega os pedidos de UMA janela. Puro e testado — é aqui que mora a regra de
 * negócio: o que conta como receita, o que conta como vendido.
 *
 * Produto de pedido cancelado/reembolsado NÃO conta como vendido; os status
 * não pagos aparecem em pedidosPorStatus mas ficam fora da receita.
 */
export function agregarPedidos(
  pedidos: PedidoWoo[],
  janela: "7d" | "30d",
  inicio: string,   // YYYY-MM-DD inclusivo
  fim: string,
): BlocoWoo {
  const noPeriodo = pedidos.filter((p) => {
    const dia = (p.date_created ?? "").slice(0, 10);
    return dia >= inicio && dia <= fim;
  });

  const porStatus = new Map<string, number>();
  for (const p of noPeriodo) porStatus.set(p.status, (porStatus.get(p.status) ?? 0) + 1);

  const pagos = noPeriodo.filter((p) => STATUS_RECEITA.has(p.status));
  const receita = pagos.reduce((a, p) => a + num(p.total), 0);

  const produtosMap = new Map<string, { quantidade: number; receita: number }>();
  const cuponsMap = new Map<string, { usos: number; desconto: number }>();
  for (const p of pagos) {
    for (const li of p.line_items ?? []) {
      const atual = produtosMap.get(li.name) ?? { quantidade: 0, receita: 0 };
      atual.quantidade += num(li.quantity);
      atual.receita += num(li.total);
      produtosMap.set(li.name, atual);
    }
    for (const c of p.coupon_lines ?? []) {
      const atual = cuponsMap.get(c.code) ?? { usos: 0, desconto: 0 };
      atual.usos += 1;
      atual.desconto += num(c.discount);
      cuponsMap.set(c.code, atual);
    }
  }

  return {
    fonte: "woocommerce",
    status: noPeriodo.length > 0 ? "ok" : "sem_dados",
    periodo: janela,
    receita: pagos.length > 0 ? receita : noPeriodo.length > 0 ? 0 : null,
    pedidos: pagos.length > 0 || noPeriodo.length > 0 ? pagos.length : null,
    ticketMedio: pagos.length > 0 ? receita / pagos.length : null,
    pedidosPorStatus: Array.from(porStatus.entries())
      .map(([status, quantidade]) => ({ status, quantidade }))
      .sort((a, b) => b.quantidade - a.quantidade),
    produtos: Array.from(produtosMap.entries())
      .map(([nome, v]) => ({ nome, ...v }))
      .sort((a, b) => b.receita - a.receita)
      .slice(0, 10),
    cupons: Array.from(cuponsMap.entries())
      .map(([codigo, v]) => ({ codigo, ...v }))
      .sort((a, b) => b.usos - a.usos)
      .slice(0, 10),
    reembolsos: porStatus.get("refunded") ?? 0,
    cancelamentos: porStatus.get("cancelled") ?? 0,
    // Reembolso PARCIAL (pedido completed com refund de parte do valor) não é
    // abatido nesta versão — o número é bruto de pedidos pagos, não líquido.
    limitacoes: ["Reembolsos parciais não são abatidos da receita nesta versão."],
  };
}

/**
 * Busca os pedidos dos últimos 30 dias, paginado. UMA busca — o 7d é derivado
 * localmente, então as duas janelas nunca divergem por timing de requisição.
 *
 * Teto de 10 páginas (1.000 pedidos/30d): acima disso registramos o corte em
 * vez de fingir cobertura completa.
 */
export async function buscarPedidos30d(
  storeUrl: string,
  consumerKey: string,
  consumerSecret: string,
  inicio30d: string,
): Promise<{ pedidos: PedidoWoo[]; truncado: boolean }> {
  const base = await validarUrlDaLoja(storeUrl);
  const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64");
  const pedidos: PedidoWoo[] = [];
  const MAX_PAGINAS = 10;

  for (let pagina = 1; pagina <= MAX_PAGINAS; pagina++) {
    const url = `${base}/wp-json/wc/v3/orders?per_page=100&page=${pagina}&after=${inicio30d}T00:00:00&orderby=date&order=desc`;
    const { resp } = await fetchSeguro(url, {
      timeoutMs: 25_000,
      maxRedirects: 0,
      headers: { Authorization: `Basic ${auth}` },
    });
    if (resp.status === 401 || resp.status === 403) throw new Error("A loja recusou a credencial durante a importação.");
    if (!resp.ok) throw new Error(`A loja respondeu ${resp.status} ao listar pedidos.`);
    const lote = (await resp.json()) as PedidoWoo[];
    if (!Array.isArray(lote)) throw new Error("Resposta da loja em formato inesperado.");
    pedidos.push(...lote.map((p) => ({
      id: p.id, status: p.status, total: p.total, date_created: p.date_created,
      line_items: (p.line_items ?? []).map((li) => ({ name: li.name, quantity: li.quantity, total: li.total })),
      coupon_lines: (p.coupon_lines ?? []).map((c) => ({ code: c.code, discount: c.discount })),
    })));
    if (lote.length < 100) return { pedidos, truncado: false };
  }
  logger.info(`[Woo] importação atingiu o teto de ${MAX_PAGINAS} páginas — resultado truncado`);
  return { pedidos, truncado: true };
}

// ─── Orquestração do sync (manual, sem cron) ─────────────────────────────────

/** Data local da agência — nunca toISOString sobre "agora". */
const diaLocal = (diasAtras = 0): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" })
    .format(new Date(Date.now() - diasAtras * 86400000));

export type ResultadoSyncLoja =
  | { ok: true; detalhe: string; pedidos30d: number }
  | { ok: false; erro: string };

/**
 * Importa UMA loja: busca 30d uma vez, deriva o 7d localmente e grava um
 * snapshot por janela em client_site_snapshots (provider=woocommerce, janela
 * em `estrategia`). Rodar duas vezes no dia atualiza o mesmo registro — a
 * chave única (conta, provider, url, estrategia, dia) faz o dedup.
 *
 * A credencial é decriptada em credenciaisDaConexao, usada na chamada e
 * descartada — nunca entra em log, erro ou snapshot.
 */
export async function sincronizarLoja(conexaoId: number): Promise<ResultadoSyncLoja> {
  const cred = await credenciaisDaConexao(conexaoId);
  if (!cred) {
    return { ok: false, erro: "Conexão não encontrada ou credencial ilegível — recadastre as chaves." };
  }
  if (cred.platform !== "woocommerce") {
    return { ok: false, erro: `Importação ainda não implementada para ${cred.platform}.` };
  }

  const hoje = diaLocal(0);
  const inicio30 = diaLocal(29); // 30 dias INCLUSIVE o de hoje
  const inicio7 = diaLocal(6);

  let pedidos: PedidoWoo[];
  let truncado: boolean;
  try {
    ({ pedidos, truncado } = await buscarPedidos30d(cred.storeUrl, cred.consumerKey, cred.consumerSecret, inicio30));
  } catch (e) {
    // Mensagem NOSSA (as de buscarPedidos30d já são) — nunca o corpo cru da loja.
    const erro = e instanceof Error && e.message ? e.message : "A loja não respondeu durante a importação.";
    await registrarSyncEcommerce(conexaoId, false, erro);
    logger.warn(`[Woo] sync falhou para conexão #${conexaoId}: ${erro}`);
    return { ok: false, erro };
  }

  for (const [janela, inicio] of [["7d", inicio7], ["30d", inicio30]] as const) {
    const bloco = agregarPedidos(pedidos, janela, inicio, hoje);
    if (truncado) bloco.limitacoes.push("Importação truncada em 1.000 pedidos — números do período são um piso, não o total.");
    await salvarSiteSnapshot({
      accountId: cred.accountId,
      provider: "woocommerce",
      url: cred.storeUrl,
      estrategia: janela,
      dia: hoje,
      metricsJson: { ...bloco, inicio, fim: hoje },
    });
  }

  await registrarSyncEcommerce(conexaoId, true, null);
  logger.info(`[Woo] sync ok para conexão #${conexaoId}: ${pedidos.length} pedidos em 30d`);
  return { ok: true, detalhe: `Importados ${pedidos.length} pedidos dos últimos 30 dias.`, pedidos30d: pedidos.length };
}

// ─── Orquestração de TODAS as lojas (cron 06:45) ─────────────────────────────

export type ResultadoLojaCiclo = { conexaoId: number; accountId: number; ok: boolean; erro?: string };

export type ResumoCicloWoo = {
  total: number;
  ok: number;
  falhas: number;
  /** Uma loja OK grava 2 snapshots (7d + 30d). */
  snapshotsAtualizados: number;
  erros: { accountId: number; erro: string }[];
};

/**
 * Redutor PURO do ciclo — testável sem banco. Transforma os resultados por loja
 * no resumo que vai para app_settings. Cada loja OK atualiza 2 snapshots (as
 * duas janelas). Falha não conta snapshot e entra em `erros`.
 */
export function resumirCicloWoo(resultados: ResultadoLojaCiclo[]): ResumoCicloWoo {
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
 * Sincroniza TODAS as lojas ativas, uma por vez, ISOLADA. Reaproveita
 * `sincronizarLoja` inteiro — nenhuma lógica de Woo reimplementada. Uma loja
 * que falha (credencial inválida, loja fora do ar) NÃO derruba as outras: o
 * erro é capturado, registrado, e o ciclo segue.
 */
export async function sincronizarLojas(): Promise<ResultadoLojaCiclo[]> {
  const conexoes = await conexoesAtivasParaSync();
  const resultados: ResultadoLojaCiclo[] = [];
  for (const c of conexoes) {
    try {
      const r = await sincronizarLoja(c.id);
      resultados.push({ conexaoId: c.id, accountId: c.accountId, ok: r.ok, erro: r.ok ? undefined : r.erro });
    } catch (e) {
      // sincronizarLoja já não lança, mas o cinto-e-suspensório garante que
      // NADA — nem um bug inesperado — contamine as lojas seguintes.
      const erro = e instanceof Error && e.message ? e.message : "falha inesperada no sync da loja";
      logger.error(`[Woo] exceção inesperada na conexão #${c.id}: ${erro}`);
      resultados.push({ conexaoId: c.id, accountId: c.accountId, ok: false, erro });
    }
  }
  return resultados;
}

