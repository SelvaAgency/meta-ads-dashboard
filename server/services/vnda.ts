/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  VNDA / Olist Ecommerce — conexão, teste e importação (v1)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  API: GET https://LOJA.vnda.com.br/api/v2/orders
 *    · Autenticação: header `Authorization: Bearer TOKEN` + header `X-Shop-Host`
 *    · Filtro de data: `start` / `finish` (yyyy-mm-dd)
 *    · Paginação: `page` + `per_page` (default 100, máx 100)
 *    · Status documentados: received, confirmed, canceled (+ `paid_at`, `invoiced`)
 *
 *  MAPA DE STATUS — PROVISÓRIO. A doc enumera received/confirmed/canceled, mas
 *  `confirmed` pode não significar "pago" em todo fluxo. Regra inicial (a
 *  VALIDAR contra os dados reais da UMA no primeiro sync):
 *    · entra na receita: pedido NÃO cancelado COM `paid_at` preenchido;
 *    · `confirmed` só entra se os dados provarem que representa pedido pago —
 *      hoje NÃO entra sozinho (sem paid_at);
 *    · `received` fica fora da receita;
 *    · `canceled` não entra (conta em cancelamentos);
 *    · estorno/reembolso: sem estado dedicado claro na doc → fica em limitações.
 *
 *  Segurança (igual Woo): HTTPS only, maxRedirects:0 com Authorization, urlGuard
 *  anti-SSRF, e NADA de token/Bearer em log, erro ou snapshot.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { logger } from "../logger";
import { fetchSeguro, validarUrlPublica, UrlBloqueadaError } from "./urlGuard";
import { agregarPedidosNeutro, numSeguro, type PedidoNeutro, type BlocoLoja } from "./lojaAgregacao";

export class VndaUrlInvalidaError extends Error {}

/**
 * Normaliza e valida a base da loja VNDA. HTTPS obrigatório, sem query/fragmento,
 * sem barra final — para o join com /api/v2 ser previsível.
 */
export async function validarUrlVnda(bruta: string): Promise<string> {
  const { url } = await validarUrlPublica(bruta); // anti-SSRF + resolve DNS
  const u = new URL(url);
  if (u.protocol !== "https:") {
    throw new VndaUrlInvalidaError("A URL da loja precisa ser https:// — o token trafega em Bearer.");
  }
  if (u.search || u.hash) {
    throw new VndaUrlInvalidaError("Informe só o endereço da loja, sem parâmetros (?) ou âncora (#).");
  }
  return `${u.origin}${u.pathname}`.replace(/\/+$/, "");
}

/** X-Shop-Host: o host da loja. Quando não informado, derivamos da própria URL. */
export function resolverShopHost(base: string, xShopHostInformado?: string | null): string {
  const informado = (xShopHostInformado ?? "").trim();
  if (informado) return informado.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  return new URL(base).host;
}

function headersVnda(token: string, shopHost: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, "X-Shop-Host": shopHost, Accept: "application/json" };
}

export type ResultadoTesteVnda =
  | { ok: true; detalhe: string }
  | { ok: false; erro: string };

/**
 * Testa a credencial com a chamada mais leve: um pedido só. 200 prova leitura;
 * 401/403 é token errado; 404 é URL/host errado. O corpo é descartado — e o
 * erro é mensagem NOSSA, nunca o corpo cru (que poderia ecoar o token).
 */
export async function testarConexaoVnda(
  storeUrl: string,
  token: string,
  xShopHost?: string | null,
): Promise<ResultadoTesteVnda> {
  let base: string;
  try {
    base = await validarUrlVnda(storeUrl);
  } catch (e) {
    if (e instanceof VndaUrlInvalidaError || e instanceof UrlBloqueadaError) return { ok: false, erro: e.message };
    return { ok: false, erro: "Não foi possível validar a URL da loja." };
  }
  const shopHost = resolverShopHost(base, xShopHost);

  let resp: Response;
  try {
    ({ resp } = await fetchSeguro(`${base}/api/v2/orders?per_page=1`, {
      timeoutMs: 20_000,
      maxRedirects: 0, // token nunca segue redirect
      headers: headersVnda(token, shopHost),
    }));
  } catch (e) {
    if (/redirecionamento/i.test((e as Error).message ?? "")) {
      return { ok: false, erro: "A URL redireciona. Use o endereço FINAL da loja — com token, redirect não é seguido." };
    }
    if (e instanceof UrlBloqueadaError) return { ok: false, erro: e.message };
    return { ok: false, erro: "A loja não respondeu (tempo esgotado ou falha de rede)." };
  }
  if (resp.status === 401 || resp.status === 403) {
    return { ok: false, erro: "A loja recusou o token. Confira o token de acesso e o X-Shop-Host." };
  }
  if (resp.status === 404) {
    return { ok: false, erro: "API VNDA não encontrada nessa URL. Confira a base da loja (a API fica em /api/v2)." };
  }
  if (!resp.ok) {
    return { ok: false, erro: `A loja respondeu ${resp.status}. Tente de novo; se persistir, confira o acesso à API.` };
  }
  logger.info(`[VNDA] teste ok para ${base} (token válido para leitura)`);
  return { ok: true, detalhe: "Conexão válida — o token lê a API da loja." };
}

// ─── Importação ──────────────────────────────────────────────────────────────

/**
 * O que usamos de cada pedido VNDA. A VNDA NÃO tem `created_at` — a data do
 * pedido é derivada de received_at/confirmed_at/paid_at/updated_at. Também NÃO
 * tem `invoiced` (o campo não existe na resposta), por isso não é sinal.
 */
export type PedidoVnda = {
  code?: string | number;
  status?: string;
  total?: string | number;
  received_at?: string | null;
  confirmed_at?: string | null;
  paid_at?: string | null;
  canceled_at?: string | null;
  updated_at?: string | null;
  coupon_code?: string | null;
  discount_price?: string | number;
  items?: { product_name?: string; name?: string; quantity?: number | string; total?: number | string; price?: number | string }[];
};

const CANCELADOS_VNDA = new Set(["canceled", "cancelled", "cancelado"]);

/**
 * Data do pedido para bucketar 7d/30d. A VNDA não expõe created_at; a API já
 * filtra por start/finish no servidor, então `received_at` (pedido recebido) é
 * o mais próximo da criação. canceled_at NÃO entra aqui — é só informação de
 * cancelamento, não a data principal de venda.
 */
export function diaDoPedidoVnda(p: PedidoVnda): string {
  return String(p.received_at ?? p.confirmed_at ?? p.paid_at ?? p.updated_at ?? "").slice(0, 10);
}

/**
 * Normaliza um pedido VNDA para o formato neutro. MAPA VALIDADO (24/07/2026 com
 * os dados reais da UMA): receita = pedido NÃO cancelado COM `paid_at`.
 * `confirmed` sem `paid_at` NÃO entra; `received` fora; `canceled` fora.
 */
export function normalizarPedidoVnda(p: PedidoVnda): PedidoNeutro {
  const status = String(p.status ?? "desconhecido");
  const cancelado = CANCELADOS_VNDA.has(status.toLowerCase());
  const pago = !!p.paid_at; // sinal confiável — o nome do status não basta
  return {
    status,
    total: numSeguro(p.total),
    dia: diaDoPedidoVnda(p),
    contaReceita: pago && !cancelado,
    cancelado,
    reembolsado: false, // sem estado de estorno claro na doc — fica em limitações
    itens: (p.items ?? []).map((it) => ({
      nome: String(it.product_name ?? it.name ?? "produto"),
      quantidade: numSeguro(it.quantity),
      total: numSeguro(it.total ?? it.price),
    })),
    cupons: p.coupon_code ? [{ codigo: String(p.coupon_code), desconto: numSeguro(p.discount_price) }] : [],
  };
}

/** Limitações que sempre acompanham o bloco VNDA na v1. */
export const LIMITACOES_VNDA = [
  "Receita = pedidos com pagamento confirmado (paid_at). O mapa de status é provisório até validação com os dados reais da loja.",
  "Estornos/reembolsos parciais não são abatidos nesta versão.",
  "Frete e descontos não são somados nem subtraídos da receita de produtos.",
];

/**
 * Agrega os pedidos VNDA de UMA janela — normaliza e delega ao núcleo neutro.
 */
export function agregarPedidosVnda(
  pedidos: PedidoVnda[],
  janela: "7d" | "30d",
  inicio: string,
  fim: string,
): BlocoLoja {
  const neutros = pedidos.map(normalizarPedidoVnda);
  return agregarPedidosNeutro(neutros, "vnda", janela, inicio, fim, [...LIMITACOES_VNDA]);
}

/**
 * Busca os pedidos dos últimos 30 dias, paginado (start/finish, per_page=100).
 * UMA busca — o 7d é derivado localmente. Teto de 10 páginas (1.000 pedidos).
 */
export async function buscarPedidosVnda(
  storeUrl: string, token: string, xShopHost: string | null,
  inicio30d: string, fim: string,
): Promise<{ pedidos: PedidoVnda[]; truncado: boolean }> {
  const base = await validarUrlVnda(storeUrl);
  const shopHost = resolverShopHost(base, xShopHost);
  const pedidos: PedidoVnda[] = [];
  const MAX_PAGINAS = 10;

  for (let pagina = 1; pagina <= MAX_PAGINAS; pagina++) {
    const url = `${base}/api/v2/orders?per_page=100&page=${pagina}&start=${inicio30d}&finish=${fim}`;
    const { resp } = await fetchSeguro(url, {
      timeoutMs: 25_000, maxRedirects: 0, headers: headersVnda(token, shopHost),
    });
    if (resp.status === 401 || resp.status === 403) throw new Error("A loja recusou o token durante a importação.");
    if (!resp.ok) throw new Error(`A loja respondeu ${resp.status} ao listar pedidos.`);
    const corpo = (await resp.json()) as unknown;
    // A VNDA pode devolver { orders: [...] } ou um array direto — aceitamos ambos.
    const lote: PedidoVnda[] = Array.isArray(corpo)
      ? (corpo as PedidoVnda[])
      : Array.isArray((corpo as { orders?: PedidoVnda[] })?.orders)
        ? (corpo as { orders: PedidoVnda[] }).orders
        : [];
    if (!Array.isArray(lote)) throw new Error("Resposta da loja em formato inesperado.");
    pedidos.push(...lote.map((p) => ({
      code: p.code, status: p.status, total: p.total,
      received_at: p.received_at ?? null, confirmed_at: p.confirmed_at ?? null,
      paid_at: p.paid_at ?? null, canceled_at: p.canceled_at ?? null, updated_at: p.updated_at ?? null,
      coupon_code: p.coupon_code ?? null, discount_price: p.discount_price,
      items: (p.items ?? []).map((it) => ({ product_name: it.product_name, name: it.name, quantity: it.quantity, total: it.total, price: it.price })),
    })));
    if (lote.length < 100) return { pedidos, truncado: false };
  }
  logger.info(`[VNDA] importação atingiu o teto de ${MAX_PAGINAS} páginas — resultado truncado`);
  return { pedidos, truncado: true };
}
