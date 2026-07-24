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
import { agregarPedidosNeutro, numSeguro, type PedidoNeutro, type BlocoLoja } from "./lojaAgregacao";

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

/** Alias de compatibilidade — o bloco de loja é o mesmo shape neutro. */
export type BlocoWoo = BlocoLoja;

/**
 * Agrega os pedidos do Woo de UMA janela. Mapeia o status do Woo para a
 * semântica neutra (completed/processing = receita; cancelled/refunded fora) e
 * delega a matemática ao núcleo compartilhado — comportamento idêntico ao de
 * antes, agora reaproveitável pela VNDA e futuras plataformas.
 */
export function agregarPedidos(
  pedidos: PedidoWoo[],
  janela: "7d" | "30d",
  inicio: string,   // YYYY-MM-DD inclusivo
  fim: string,
): BlocoWoo {
  const neutros: PedidoNeutro[] = pedidos.map((p) => ({
    status: p.status,
    total: numSeguro(p.total),
    dia: (p.date_created ?? "").slice(0, 10),
    contaReceita: STATUS_RECEITA.has(p.status),
    cancelado: p.status === "cancelled",
    reembolsado: p.status === "refunded",
    itens: (p.line_items ?? []).map((li) => ({ nome: li.name, quantidade: numSeguro(li.quantity), total: numSeguro(li.total) })),
    cupons: (p.coupon_lines ?? []).map((c) => ({ codigo: c.code, desconto: numSeguro(c.discount) })),
  }));
  return agregarPedidosNeutro(neutros, "woocommerce", janela, inicio, fim, [
    // Reembolso PARCIAL (pedido completed com refund de parte do valor) não é
    // abatido nesta versão — o número é bruto de pedidos pagos, não líquido.
    "Reembolsos parciais não são abatidos da receita nesta versão.",
  ]);
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
