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
