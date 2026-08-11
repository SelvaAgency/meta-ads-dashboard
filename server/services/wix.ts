/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Wix Stores — leitura de pedidos
 * ─────────────────────────────────────────────────────────────────────────────
 *  Escrito CONTRA a resposta real da loja da Aiká, não contra a documentação.
 *  O passo 1 existiu só para produzir essa resposta: cada campo mapeado abaixo
 *  foi visto num pedido de verdade.
 *
 *  ── O que a estrutura real ensinou ─────────────────────────────────────────
 *  · Todo dinheiro é STRING (`priceSummary.total.amount = "249.90"`), nunca
 *    número. Somar sem converter concatenaria.
 *  · Existem DOIS estados: `status` (APPROVED/CANCELED, o pedido) e
 *    `paymentStatus` (PAID/NOT_PAID/…, o dinheiro). Receita depende do
 *    segundo; cancelamento, do primeiro.
 *  · `balanceSummary.refunded.amount` diz o valor REEMBOLSADO — é fato, não
 *    inferência a partir de status.
 *  · O nome do produto vem em `productName.original` (há `translated` ao lado).
 *  · Desconto por cupom nem sempre traz código: quando é regra automática, só
 *    `discountRule.name`. Os dois casos são tratados.
 *
 *  ── A diferença em relação a Woo e VNDA ────────────────────────────────────
 *  Nas duas, a API mora no domínio da própria loja. Na Wix não: a loja é
 *  identificada por um SITE ID e a API é central (`www.wixapis.com`). Por isso
 *  a URL da loja aqui serve para conferência humana e para o resto do sistema —
 *  não é o endereço que se chama.
 *
 *  ── Segredo nunca vaza ─────────────────────────────────────────────────────
 *  A chave vai só no header, e o corpo da resposta NUNCA sai cru: quando ele é
 *  útil (o 400 da Wix diz qual campo foi recusado), passa antes por
 *  `sanitizarErroWix`. Descartá-lo por completo parecia mais seguro e custou uma
 *  rodada inteira de diagnóstico — "A Wix respondeu 400" é verdadeiro e inútil.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { fetchSeguro, UrlBloqueadaError } from "./urlGuard";
import { logger } from "../logger";
import { agregarPedidosNeutro, numSeguro, type BlocoLoja, type PedidoNeutro } from "./lojaAgregacao";

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

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Sanitização do erro da Wix
 * ─────────────────────────────────────────────────────────────────────────────
 *  Quando a Wix recusa um payload, ela costuma dizer QUAL campo recusou — e é
 *  exatamente essa frase que falta para corrigir o filtro e a ordenação sem
 *  chutar de novo. Descartar o corpo inteiro por precaução custou uma rodada
 *  inteira de diagnóstico.
 *
 *  Mas o corpo é resposta de terceiro, e ecoar resposta de terceiro é como
 *  credencial vaza para log. Então ele passa por três cortes:
 *
 *   1. a PRÓPRIA chave é substituída, caso a API a devolva no eco da requisição;
 *   2. qualquer sequência longa parecida com token some — chave de OUTRO
 *      serviço que apareça ali também não pode passar;
 *   3. cabeçalhos de autorização são apagados por nome.
 *
 *  A ordem importa: a chave conhecida sai primeiro, porque ela pode ser curta
 *  demais para o corte genérico pegar.
 * ─────────────────────────────────────────────────────────────────────────────
 */
const MAX_ERRO = 600;

export function sanitizarErroWix(corpo: string, segredo?: string): string {
  let t = String(corpo ?? "");
  if (segredo && segredo.length >= 8) {
    t = t.split(segredo).join("«chave»");
  }
  t = t
    // Cabeçalho de autorização ecoado, em qualquer caixa.
    .replace(/("?(authorization|api[-_]?key|wix-site-id)"?\s*[:=]\s*)("[^"]*"|[^\s,}]+)/gi, '$1"«oculto»"')
    // Sequência longa sem espaço: formato típico de token. 32 é curto o
    // bastante para pegar chave real e longo o bastante para não comer
    // mensagem de erro em português.
    .replace(/[A-Za-z0-9_\-]{32,}/g, "«oculto»")
    .replace(/\s+/g, " ")
    .trim();
  return t.slice(0, MAX_ERRO);
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

// ─── Importação ──────────────────────────────────────────────────────────────

/**
 * O que usamos de cada pedido. Tudo opcional: a resposta é de terceiro e um
 * campo ausente não pode derrubar o ciclo de importação de outra loja.
 */
export type PedidoWix = {
  id?: string;
  number?: string;
  createdDate?: string;
  status?: string;                 // APPROVED | CANCELED | INITIALIZED
  paymentStatus?: string;          // PAID | NOT_PAID | PARTIALLY_PAID | *REFUNDED
  currency?: string;
  priceSummary?: { total?: Dinheiro; discount?: Dinheiro };
  balanceSummary?: { refunded?: Dinheiro; paid?: Dinheiro };
  lineItems?: {
    productName?: { original?: string; translated?: string };
    quantity?: number;
    totalPriceAfterTax?: Dinheiro;
    lineItemPrice?: Dinheiro;
  }[];
  appliedDiscounts?: {
    coupon?: { code?: string; name?: string };
    discountRule?: { name?: { original?: string }; amount?: Dinheiro };
  }[];
};

type Dinheiro = { amount?: string | number; formattedAmount?: string };

/** Dinheiro da Wix é string. Converter é obrigatório — ver cabeçalho. */
const valor = (d: Dinheiro | undefined): number => numSeguro(d?.amount ?? 0);

/**
 * Dia do pedido no fuso da loja.
 *
 * `createdDate` vem em ISO/UTC. A conversão usa o fuso da agência porque é o
 * mesmo critério de "dia" que o resto do sistema aplica — um pedido das 22h de
 * Brasília não pode cair no dia seguinte só porque em UTC já é.
 */
export function diaDoPedidoWix(p: PedidoWix): string {
  const t = Date.parse(p.createdDate ?? "");
  if (!Number.isFinite(t)) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(t));
}

/**
 * Traduz um pedido da Wix para o formato neutro que a agregação consome.
 *
 * ── A regra de receita ─────────────────────────────────────────────────────
 * Conta como receita o pedido NÃO cancelado cujo dinheiro entrou —
 * `paymentStatus` PAID ou PARTIALLY_PAID. Pendente não conta: é venda que pode
 * não acontecer, e somá-la infla o número que o cliente usa para decidir.
 *
 * Reembolsado total sai da receita; parcial permanece, porque parte do dinheiro
 * ficou. O valor devolvido aparece no contador de reembolsos de qualquer forma.
 */
export function normalizarPedidoWix(p: PedidoWix): PedidoNeutro {
  const cancelado = String(p.status ?? "").toUpperCase() === "CANCELED";
  const pag = String(p.paymentStatus ?? "").toUpperCase();
  const reembolsadoTotal = pag === "FULLY_REFUNDED";
  const reembolsado = reembolsadoTotal || pag === "PARTIALLY_REFUNDED" || valor(p.balanceSummary?.refunded) > 0;

  return {
    // Um estado só para a tela: cancelado manda, senão vale o do dinheiro.
    status: cancelado ? "CANCELED" : (pag || "UNKNOWN"),
    total: valor(p.priceSummary?.total),
    dia: diaDoPedidoWix(p),
    contaReceita: !cancelado && !reembolsadoTotal && (pag === "PAID" || pag === "PARTIALLY_PAID"),
    cancelado,
    reembolsado,
    itens: (p.lineItems ?? []).map((li) => ({
      nome: li.productName?.original ?? li.productName?.translated ?? "(sem nome)",
      quantidade: numSeguro(li.quantity ?? 0),
      total: valor(li.totalPriceAfterTax ?? li.lineItemPrice),
    })),
    // Cupom nem sempre tem código: promoção automática só traz o nome da regra.
    cupons: (p.appliedDiscounts ?? []).map((d) => ({
      codigo: d.coupon?.code ?? d.coupon?.name ?? d.discountRule?.name?.original ?? "(desconto)",
      desconto: valor(d.discountRule?.amount),
    })).filter((c) => c.desconto > 0),
  };
}

export const LIMITACOES_WIX = [
  "Pedido pendente de pagamento não entra na receita.",
  "Reembolso parcial permanece na receita; o valor devolvido aparece em reembolsos.",
  "Promoção automática sem código de cupom aparece pelo nome da regra.",
];

/** Teto de páginas. 20 × 100 = 2.000 pedidos por janela — folgado para 30 dias. */
const MAX_PAGINAS = 20;
const POR_PAGINA = 100;

/**
 * Busca os pedidos criados a partir de `inicio30`.
 *
 * ── Por que filtro NO SERVIDOR e também no cliente ─────────────────────────
 * O filtro por data vai no corpo da busca. Se a sintaxe estiver errada, a Wix
 * responde erro — e erro visível é melhor que importação silenciosamente
 * errada. Mas a janela também é aplicada depois, na agregação: se um dia a Wix
 * passar a ignorar o filtro, o número continua certo, só custa mais requisição.
 *
 * ── Paginação defensiva ────────────────────────────────────────────────────
 * O cursor de continuação não apareceu no diagnóstico (ele mapeou o PEDIDO, não
 * o envelope). Então as três formas conhecidas são tentadas, e se nenhuma
 * existir a leitura para — marcando `truncado`, que é o mesmo sinal que Woo e
 * VNDA já usam. Nunca um laço infinito, nunca um silêncio.
 */
export async function buscarPedidosWix(
  apiKey: string, siteId: string, inicio30: string,
): Promise<{ pedidos: PedidoWix[]; truncado: boolean }> {
  const site = validarSiteId(siteId);
  const pedidos: PedidoWix[] = [];
  let cursor: string | null = null;
  let truncado = false;

  for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
    const corpoBusca: Record<string, unknown> = cursor
      // Com cursor, a Wix pede SÓ o cursor — repetir filtro invalida a página.
      ? { search: { cursorPaging: { limit: POR_PAGINA, cursor } } }
      : {
          search: {
            filter: { createdDate: { $gte: `${inicio30}T00:00:00.000Z` } },
            sort: [{ fieldName: "createdDate", order: "DESC" }],
            cursorPaging: { limit: POR_PAGINA },
          },
        };

    const { resp } = await fetchSeguro(`${BASE_WIX}${ROTA_PEDIDOS}`, {
      method: "POST",
      timeoutMs: 30_000,
      maxRedirects: 0,
      headers: headersWix(apiKey.trim(), site),
      body: JSON.stringify(corpoBusca),
    });
    if (!resp.ok) {
      /**
       * O corpo entra SANITIZADO. Antes era descartado, e a mensagem virava
       * "A Wix respondeu 400" — verdadeira e inútil: 400 é justamente o caso em
       * que a API diz qual campo recusou, e é essa frase que permite corrigir o
       * payload sem chutar.
       */
      const detalhe = sanitizarErroWix(await resp.text().catch(() => ""), apiKey);
      throw new Error(
        `A Wix respondeu ${resp.status} ao buscar pedidos${detalhe ? ` — ${detalhe}` : "."}`,
      );
    }
    const dados = JSON.parse(await resp.text()) as Record<string, any>;
    const lote = (dados.orders ?? dados.results ?? []) as PedidoWix[];
    if (!Array.isArray(lote) || lote.length === 0) break;
    pedidos.push(...lote);

    cursor = dados?.metadata?.cursors?.next
      ?? dados?.pagingMetadata?.cursors?.next
      ?? dados?.cursors?.next
      ?? null;
    if (!cursor) {
      // Página cheia sem cursor: pode haver mais e não temos como pedir.
      if (lote.length === POR_PAGINA) truncado = true;
      break;
    }
    if (pagina === MAX_PAGINAS - 1) truncado = true;
  }

  return { pedidos, truncado };
}

/** Envelopa a agregação neutra — mesma forma que Woo e VNDA. */
export function agregarPedidosWix(
  pedidos: PedidoWix[], janela: "7d" | "30d", inicio: string, fim: string,
): BlocoLoja {
  return agregarPedidosNeutro(pedidos.map(normalizarPedidoWix), "wix", janela, inicio, fim, LIMITACOES_WIX);
}
