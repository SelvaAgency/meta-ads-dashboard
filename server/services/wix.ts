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

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Mapa de FORMATO — a saída que o passo 2 consome
 * ─────────────────────────────────────────────────────────────────────────────
 *  Devolve a ESTRUTURA de um pedido — nomes de campo e tipos — sem os valores.
 *
 *  Sem valores por dois motivos, e o segundo é o que importa: pedido de
 *  e-commerce carrega nome, e-mail e endereço de cliente final, e nada disso
 *  precisa sair da Wix para eu escrever um normalizador. O que preciso é saber
 *  que existe `priceSummary.total.amount`, não quanto alguém pagou.
 *
 *  A exceção são campos de STATUS e MOEDA: aí o valor é a informação (é
 *  "APPROVED" ou "PAID"? "BRL" ou "R$"?), é curto, e não identifica ninguém.
 * ─────────────────────────────────────────────────────────────────────────────
 */
const CAMPOS_COM_VALOR = /status|state|currency|moeda|type$/i;
const PROFUNDIDADE_MAX = 4;

export function resumoDeFormato(v: unknown, nome = "", nivel = 0): string[] {
  const linhas: string[] = [];
  const recuo = "  ".repeat(nivel);
  if (nivel > PROFUNDIDADE_MAX) return [`${recuo}${nome}: …`];

  if (Array.isArray(v)) {
    linhas.push(`${recuo}${nome}: [${v.length}]`);
    // Só o PRIMEIRO item: a estrutura se repete, e listar 20 iguais só ocupa
    // espaço no campo que vai guardar isto.
    if (v.length > 0) linhas.push(...resumoDeFormato(v[0], "└ item", nivel + 1));
    return linhas;
  }
  if (v && typeof v === "object") {
    if (nome) linhas.push(`${recuo}${nome}:`);
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      linhas.push(...resumoDeFormato(val, k, nivel + (nome ? 1 : 0)));
    }
    return linhas;
  }
  const tipo = v === null ? "null" : typeof v;
  // Valor só quando é seguro E informativo — ver cabeçalho.
  const mostrarValor = CAMPOS_COM_VALOR.test(nome) && tipo === "string" && String(v).length <= 40;
  linhas.push(`${recuo}${nome}: ${tipo}${mostrarValor ? ` = "${v}"` : ""}`);
  return linhas;
}

export type ResultadoTesteWix =
  | { ok: true; detalhe: string; formato?: string }
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
    /**
     * 200 KB, não 400 bytes.
     *
     * O corte de 400 estava dimensionado para "classificar um erro", e teria
     * quebrado o caso que mais importa: um pedido da Wix não cabe em 400
     * caracteres, o JSON truncado não faz parse, e o teste responderia "não é
     * JSON" para uma resposta perfeitamente válida. É a mesma armadilha do teto
     * de leitura do robô de monitoramento — número escolhido para um uso e
     * herdado por outro.
     *
     * O corpo continua sendo usado só internamente: nada dele é devolvido cru.
     */
    corpo = (await resp.text()).slice(0, 200_000);
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
  let formato = "";
  try {
    const dados = JSON.parse(corpo) as Record<string, unknown>;
    const lista = (dados.orders ?? dados.results ?? []) as unknown[];
    if (Array.isArray(lista)) {
      quantos = lista.length;
      if (lista[0]) formato = resumoDeFormato(lista[0]).join("\n");
    }
    // Nem `orders` nem `results`: o corpo é JSON, mas de outra forma. As chaves
    // de topo já dizem por onde procurar.
    if (!Array.isArray(lista) || (quantos === 0 && Object.keys(dados).length > 0)) {
      formato = formato || `chaves no topo da resposta: ${Object.keys(dados).slice(0, 15).join(", ")}`;
    }
  } catch {
    return { ok: true, detalhe: "A chave foi aceita, mas a resposta não é JSON. Me avise — é isso que define como o adaptador será escrito." };
  }

  logger.info(`[Wix] teste ok para site ${site} — ${quantos ?? "?"} pedido(s) na amostra`);
  return {
    ok: true,
    detalhe: quantos === 0
      ? "Chave válida e com permissão de leitura. A amostra veio vazia — pode ser loja sem pedidos ou filtro de janela."
      : `Chave válida e com permissão de leitura. Amostra devolveu ${quantos} pedido(s).`,
    formato: formato || undefined,
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
