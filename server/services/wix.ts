/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Wix Stores — PASSO 1: só o teste de credencial
 * ─────────────────────────────────────────────────────────────────────────────
 *  Este arquivo NÃO importa pedidos. De propósito.
 *
 *  Escrever o normalizador agora significaria mapear campos que eu presumo que
 *  a API tem. Foi assim que o robô de monitoramento errou duas vezes seguidas
 *  contra sites reais — um teto de leitura calculado sobre uma suposição, e um
 *  regex que exigia uma forma que a página não tinha. Nos dois casos o código
 *  compilava, passava nos testes e falhava em silêncio.
 *
 *  Então a ordem é: uma chamada autenticada de verdade primeiro. O que ela
 *  responder — modelo de autenticação, formato do pedido, nomes de campo,
 *  limites de paginação — é o que vai guiar `buscarPedidosWix` e
 *  `normalizarPedidoWix`, que ainda não existem.
 *
 *  Enquanto isso, `integrada: false` no catálogo. Passar no teste de credencial
 *  NÃO é ter integração: nenhum pedido é lido, nenhum snapshot é gravado, a
 *  loja não entra no cron e não conta vendas em lugar nenhum.
 *
 *  ── A diferença em relação a Woo e VNDA ────────────────────────────────────
 *  Nas duas, a API mora no domínio da própria loja. Na Wix não: a loja é
 *  identificada por um SITE ID e a API é central (`www.wixapis.com`). Por isso
 *  a URL da loja aqui serve para conferência humana e para o resto do sistema —
 *  não é o endereço que se chama.
 *
 *  ── Segredo nunca vaza ─────────────────────────────────────────────────────
 *  A chave vai só no header. Nenhuma mensagem de erro devolve corpo cru da
 *  resposta, que poderia ecoar credencial. Todo texto de erro é NOSSO.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { fetchSeguro, UrlBloqueadaError } from "./urlGuard";
import { logger } from "../logger";

/** API da Wix — central, não no domínio da loja. Ver cabeçalho. */
const BASE_WIX = "https://www.wixapis.com";

/**
 * Endpoint de busca de pedidos do Wix eCommerce.
 *
 * É POST com corpo de busca. Usado aqui com o menor pedido possível (1 item):
 * o objetivo é provar que a chave lê pedidos, não trazer dados.
 */
const ROTA_PEDIDOS = "/ecom/v1/orders/search";

export class WixCredencialInvalidaError extends Error {}

/**
 * Site ID da Wix: um GUID.
 *
 * Validar o formato aqui evita a classe de erro mais chata de diagnosticar —
 * alguém colar o nome do site, ou a URL, e receber um 403 genérico que parece
 * problema de permissão da chave.
 */
const FORMATO_SITE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validarSiteId(bruto: string): string {
  const v = String(bruto ?? "").trim();
  if (!FORMATO_SITE_ID.test(v)) {
    throw new WixCredencialInvalidaError(
      "O Site ID da Wix é um código no formato 8-4-4-4-12 (ex.: fa19d2c0-7e17-4bc7-a3a8-eeeaf7c509b1). Confira em Configurações do site na Wix.",
    );
  }
  return v.toLowerCase();
}

/**
 * URL da loja: guardada para conferência e para o resto do sistema, NÃO usada
 * para chamar a API. Exige https pela mesma guarda das outras plataformas.
 */
export async function validarUrlWix(bruta: string): Promise<string> {
  const v = String(bruta ?? "").trim().replace(/\/+$/, "");
  if (!/^https:\/\//i.test(v)) {
    throw new WixCredencialInvalidaError("O endereço da loja precisa começar com https://.");
  }
  return v;
}

export type ResultadoTesteWix =
  | { ok: true; detalhe: string }
  | { ok: false; erro: string; comoResolver?: string };

const headersWix = (apiKey: string, siteId: string): Record<string, string> => ({
  Authorization: apiKey,
  "wix-site-id": siteId,
  "Content-Type": "application/json",
  Accept: "application/json",
});

/**
 * Testa a credencial com a chamada mais leve possível: busca UM pedido.
 *
 * O que cada resposta significa está mapeado em mensagem nossa, porque o
 * diagnóstico é o produto deste passo — é dele que sai a decisão de como
 * escrever o adaptador de verdade.
 */
export async function testarConexaoWix(apiKey: string, siteId: string): Promise<ResultadoTesteWix> {
  let site: string;
  try {
    site = validarSiteId(siteId);
  } catch (e) {
    return { ok: false, erro: (e as Error).message };
  }
  if (!apiKey || apiKey.trim().length < 20) {
    return { ok: false, erro: "Cole a API Key gerada no painel da Wix (Settings → API Keys)." };
  }

  let resp: Response;
  let corpo = "";
  try {
    ({ resp } = await fetchSeguro(`${BASE_WIX}${ROTA_PEDIDOS}`, {
      method: "POST",
      timeoutMs: 20_000,
      maxRedirects: 0, // credencial nunca segue redirect
      headers: headersWix(apiKey.trim(), site),
      body: JSON.stringify({ search: { cursorPaging: { limit: 1 } } }),
    }));
    // Lido só para CLASSIFICAR o erro. Nunca é devolvido cru — ver cabeçalho.
    corpo = (await resp.text()).slice(0, 400);
  } catch (e) {
    if (e instanceof UrlBloqueadaError) return { ok: false, erro: e.message };
    return { ok: false, erro: "A API da Wix não respondeu (tempo esgotado ou falha de rede)." };
  }

  if (resp.status === 401) {
    return {
      ok: false,
      erro: "A Wix recusou a API Key.",
      comoResolver: "Confira se a chave foi copiada inteira e se ainda está ativa em Settings → API Keys.",
    };
  }
  if (resp.status === 403) {
    return {
      ok: false,
      erro: "A API Key foi aceita, mas não tem permissão para ler pedidos.",
      // É o erro mais provável na primeira tentativa, e o que mais parece outra
      // coisa: a chave é válida, só não alcança este recurso.
      comoResolver: "Na Wix, edite a chave e marque a permissão de leitura de Wix Stores / eCommerce (Orders). Confira também se o Site ID é o do site certo.",
    };
  }
  if (resp.status === 404) {
    return {
      ok: false,
      erro: "A Wix não encontrou este site ou este recurso.",
      comoResolver: "Confira o Site ID e se a loja usa Wix Stores.",
    };
  }
  if (!resp.ok) {
    return { ok: false, erro: `A API da Wix respondeu ${resp.status}. Tente de novo; se persistir, confira a chave e o Site ID.` };
  }

  /**
   * 200. Contar o que veio é a informação que este passo existe para produzir:
   * uma chave que lê mas devolve zero pedidos é indistinguível de uma que lê
   * uma loja vazia — e essa diferença muda como o adaptador será escrito.
   */
  let quantos: number | null = null;
  let chaves: string[] = [];
  try {
    const dados = JSON.parse(corpo) as Record<string, unknown>;
    const lista = (dados.orders ?? dados.results ?? []) as unknown[];
    if (Array.isArray(lista)) {
      quantos = lista.length;
      if (lista[0] && typeof lista[0] === "object") chaves = Object.keys(lista[0] as object).slice(0, 12);
    }
  } catch {
    // 200 com corpo que não é o JSON esperado ainda é sinal útil: a credencial
    // passou, o formato é que precisa ser olhado antes de escrever o adaptador.
    return { ok: true, detalhe: "A chave foi aceita, mas a resposta veio num formato inesperado. Me avise — é isso que define como o adaptador será escrito." };
  }

  logger.info(`[Wix] teste ok para site ${site} — ${quantos ?? "?"} pedido(s) na amostra`);
  return {
    ok: true,
    detalhe: quantos === 0
      ? "Chave válida e com permissão de leitura. A amostra veio vazia — pode ser loja sem pedidos no período."
      : `Chave válida e com permissão de leitura. Amostra devolveu ${quantos} pedido(s)${chaves.length ? ` com os campos: ${chaves.join(", ")}` : ""}.`,
  };
}

/**
 * O que ainda NÃO existe. Fica declarado para a tela poder dizer a verdade
 * sobre o que o teste significa — e para ninguém confundir credencial válida
 * com integração pronta.
 */
export const PENDENCIAS_WIX = [
  "Leitura de pedidos (buscarPedidosWix) ainda não implementada.",
  "Nenhum snapshot de vendas é gravado.",
  "A loja não entra no sync automático nem aparece em BlocoVendas, Panorama ou Jornalzinho.",
];
