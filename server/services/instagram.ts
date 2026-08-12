/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Instagram orgânico — credencial própria e diagnóstico por etapas
 * ─────────────────────────────────────────────────────────────────────────────
 *  Separado de Meta Ads por decisão de produto: campanhas caindo não podem
 *  derrubar o orgânico, e vice-versa. O token vem de `social_credentials`, uma
 *  linha só — NUNCA de `accounts[0].accessToken`, que era o que o código
 *  anterior fazia.
 *
 *  Esse `accounts[0]` era uma bomba: o token de mídia de uma conta ARBITRÁRIA
 *  (a primeira da lista) servindo de credencial para todo o Instagram. Se
 *  aquela conta trocasse de token, o orgânico de todos os clientes cairia junto
 *  — e o erro não diria isso.
 *
 *  ── O diagnóstico é o produto desta fase ───────────────────────────────────
 *  Seis perguntas SEPARADAS, porque cada uma tem correção diferente. Uma
 *  resposta única — "não funcionou" — mandaria procurar no lugar errado, que é
 *  o que já custou três rodadas nesta base.
 *
 *  ── Conta pessoal NÃO é falha ──────────────────────────────────────────────
 *  Perfil pessoal é estado válido com limitação conhecida. O diagnóstico
 *  registra o tipo e segue; quem decide como isso aparece é `shared/instagram`.
 *  Tratá-lo como erro faria alguém tentar consertar o que está como o cliente
 *  quer.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { logger } from "../logger";
import { tipoDaResposta, type StatusInsight, type TipoConta } from "@shared/instagram";

const GRAPH = "https://graph.facebook.com/v21.0";

/** Portfólio Empresarial da SELVA — mesma constante usada pelo Meta Ads. */
export const BUSINESS_ID_PADRAO = "803399908519541";

/**
 * Sanitiza qualquer texto que venha da Meta antes de virar diagnóstico.
 *
 * Mesma regra do erro da Wix, e pelo mesmo motivo: a mensagem é útil (a Meta
 * diz QUAL permissão falta), e resposta de terceiro é como credencial vaza para
 * log. O token conhecido sai primeiro porque pode ser curto demais para o corte
 * genérico pegar.
 */
export function sanitizar(texto: string, segredo?: string): string {
  let t = String(texto ?? "");
  if (segredo && segredo.length >= 8) t = t.split(segredo).join("«token»");
  return t
    .replace(/(access_token=)[^&\s"]+/gi, "$1«oculto»")
    .replace(/[A-Za-z0-9_\-]{32,}/g, "«oculto»")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

export const impressaoDe = async (token: string): Promise<string> => {
  const { createHash } = await import("node:crypto");
  return token ? createHash("sha256").update(token).digest("hex").slice(0, 8) : "—";
};

async function graph<T>(caminho: string, params: Record<string, string>, token: string): Promise<T> {
  const qs = new URLSearchParams({ ...params, access_token: token });
  const resp = await fetch(`${GRAPH}/${caminho}?${qs}`, { signal: AbortSignal.timeout(20_000) });
  const texto = await resp.text();
  let dados: Record<string, unknown>;
  try {
    dados = JSON.parse(texto) as Record<string, unknown>;
  } catch {
    throw new Error(`Resposta da Meta não é JSON (HTTP ${resp.status}).`);
  }
  if (dados.error) {
    const e = dados.error as { message?: string; code?: number; error_subcode?: number };
    // Código e subcódigo entram na mensagem: são eles que dizem se falta
    // permissão, se o token morreu ou se o recurso não existe.
    throw new Error(
      `Meta (${e.code ?? "?"}${e.error_subcode ? `/${e.error_subcode}` : ""}): ${sanitizar(e.message ?? "erro sem mensagem", token)}`,
    );
  }
  return dados as T;
}

// ─── Descoberta ──────────────────────────────────────────────────────────────

export interface PaginaDescoberta {
  pageId: string;
  pageName: string;
  categoria: string | null;
  seguidoresPagina: number | null;
  /** `null` quando a Página não tem Instagram profissional vinculado. */
  instagram: {
    id: string;
    username: string | null;
    seguidores: number | null;
    posts: number | null;
    tipoConta: TipoConta;
  } | null;
}

const CAMPOS_PAGINA =
  "id,name,category,followers_count,fan_count," +
  "instagram_business_account{id,username,followers_count,media_count}";

/**
 * Páginas do Portfólio, com o Instagram vinculado quando existir.
 *
 * Lê `client_pages` e `owned_pages`: numa carteira de agência a maioria das
 * Páginas é do cliente, mas algumas são da própria casa. Ler só uma das duas
 * deixaria metade do portfólio invisível.
 *
 * Cada uma falha por conta própria: uma aresta sem permissão não pode zerar a
 * outra — isso transformaria acesso parcial em "nenhuma Página encontrada".
 */
export async function descobrirPaginas(token: string, businessId = BUSINESS_ID_PADRAO): Promise<{
  paginas: PaginaDescoberta[];
  avisos: string[];
}> {
  const avisos: string[] = [];
  const brutas: Record<string, unknown>[] = [];

  for (const aresta of ["client_pages", "owned_pages"]) {
    try {
      const r = await graph<{ data: Record<string, unknown>[] }>(
        `${businessId}/${aresta}`, { fields: CAMPOS_PAGINA, limit: "100" }, token);
      brutas.push(...(r.data ?? []));
    } catch (e) {
      avisos.push(`${aresta}: ${(e as Error).message}`);
    }
  }

  const vistas = new Set<string>();
  const paginas: PaginaDescoberta[] = [];
  for (const p of brutas) {
    const id = String(p.id ?? "");
    if (!id || vistas.has(id)) continue;
    vistas.add(id);
    const ig = p.instagram_business_account as Record<string, unknown> | undefined;
    paginas.push({
      pageId: id,
      pageName: String(p.name ?? `Página ${id}`),
      categoria: p.category ? String(p.category) : null,
      seguidoresPagina: Number(p.followers_count ?? p.fan_count) || null,
      instagram: ig?.id
        ? {
            id: String(ig.id),
            username: ig.username ? String(ig.username) : null,
            seguidores: Number(ig.followers_count) || null,
            posts: Number(ig.media_count) || null,
            // Vinculado à Página = profissional. Ver tipoDaResposta.
            tipoConta: tipoDaResposta({ vinculadoAPagina: true }),
          }
        : null,
    });
  }
  paginas.sort((a, b) => a.pageName.localeCompare(b.pageName, "pt-BR"));
  return { paginas, avisos };
}

// ─── Diagnóstico ─────────────────────────────────────────────────────────────

export interface EtapaDiagnostico {
  pergunta: string;
  resposta: "sim" | "não" | "n/a";
  detalhe: string;
}

export interface DiagnosticoInstagram {
  ok: boolean;
  impressao: string;
  etapas: EtapaDiagnostico[];
  /** Métricas que responderam e que a Meta recusou — ver comentário abaixo. */
  metricasOk: string[];
  metricasRecusadas: string[];
  tipoConta: TipoConta;
  statusInsight: StatusInsight;
  /** Texto pronto para copiar. Nunca contém token. */
  texto: string;
}

/**
 * Métricas pedidas em GRUPOS, não numa chamada só.
 *
 * O código anterior pedia sete de uma vez. A Meta deprecia nomes de métrica com
 * frequência — `page_impressions` já foi —, e uma métrica morta derruba a
 * chamada INTEIRA: some tudo por causa de uma. Em grupos, o que morreu é
 * nomeado e o resto continua respondendo.
 */
const GRUPOS_METRICAS: string[][] = [
  ["reach"],
  ["accounts_engaged"],
  ["profile_views"],
  ["total_interactions"],
];

/**
 * Responde as seis perguntas, uma por vez.
 *
 * Separadas porque cada uma tem correção diferente: token morto se troca,
 * permissão faltando se libera no Business Manager, Página sem Instagram se
 * vincula no app, conta pessoal não se conserta — é uma escolha do cliente.
 */
export async function diagnosticar(token: string, opts: {
  businessId?: string;
  pageId?: string | null;
  instagramUserId?: string | null;
} = {}): Promise<DiagnosticoInstagram> {
  const etapas: EtapaDiagnostico[] = [];
  const impressao = await impressaoDe(token);
  const businessId = opts.businessId ?? BUSINESS_ID_PADRAO;
  let tipoConta: TipoConta = "DESCONHECIDO";
  let statusInsight: StatusInsight = "NAO_TESTADO";
  const metricasOk: string[] = [];
  const metricasRecusadas: string[] = [];

  const registrar = (pergunta: string, resposta: EtapaDiagnostico["resposta"], detalhe: string) =>
    etapas.push({ pergunta, resposta, detalhe });

  // 1 — o token vive?
  try {
    const me = await graph<{ name?: string; id?: string }>("me", { fields: "id,name" }, token);
    registrar("O token vive?", "sim", `Autenticado como ${me.name ?? me.id ?? "usuário"}.`);
  } catch (e) {
    registrar("O token vive?", "não", (e as Error).message);
    return montar(false);
  }

  // 2 — alcança o portfólio?
  let paginas: PaginaDescoberta[] = [];
  try {
    const r = await descobrirPaginas(token, businessId);
    paginas = r.paginas;
    registrar("Alcança o portfólio?", paginas.length > 0 ? "sim" : "não",
      paginas.length > 0
        ? `${paginas.length} Página(s) encontradas.${r.avisos.length ? ` Avisos: ${r.avisos.join(" · ")}` : ""}`
        : `Nenhuma Página encontrada no portfólio ${businessId}.${r.avisos.length ? ` ${r.avisos.join(" · ")}` : " Confira se o token tem pages_show_list e business_management."}`);
  } catch (e) {
    registrar("Alcança o portfólio?", "não", (e as Error).message);
    return montar(false);
  }

  // 3 — a Página do cliente foi encontrada?
  if (!opts.pageId) {
    registrar("A Página do cliente foi encontrada?", "n/a", "Nenhuma Página vinculada a este cliente ainda.");
    return montar(true);
  }
  const pagina = paginas.find((p) => p.pageId === opts.pageId);
  if (!pagina) {
    registrar("A Página do cliente foi encontrada?", "não",
      `A Página ${opts.pageId} não aparece no portfólio com este token.`);
    return montar(false);
  }
  registrar("A Página do cliente foi encontrada?", "sim", `"${pagina.pageName}".`);

  // 4 — tem Instagram vinculado?
  const igId = opts.instagramUserId ?? pagina.instagram?.id ?? null;
  if (!igId) {
    // Estado PRÓPRIO, não erro: o vínculo é feito no Instagram, não aqui.
    registrar("A Página tem Instagram vinculado?", "não",
      "Página conectada, Instagram não vinculado. O vínculo é feito no app do Instagram ou nas configurações da Página.");
    return montar(true);
  }
  registrar("A Página tem Instagram vinculado?", "sim",
    pagina.instagram?.username ? `@${pagina.instagram.username}` : igId);

  // 5 — que tipo de conta é?
  try {
    const perfil = await graph<{ username?: string; account_type?: string; media_count?: number }>(
      igId, { fields: "username,media_count" }, token);
    tipoConta = tipoDaResposta({ account_type: perfil.account_type, vinculadoAPagina: true });
    registrar("Que tipo de conta é?", "sim",
      `${tipoConta}${perfil.username ? ` (@${perfil.username})` : ""}.`);
  } catch (e) {
    tipoConta = "DESCONHECIDO";
    registrar("Que tipo de conta é?", "não", (e as Error).message);
  }

  // 6 — insights respondem? E QUAIS.
  for (const grupo of GRUPOS_METRICAS) {
    try {
      await graph<{ data: unknown[] }>(`${igId}/insights`,
        { metric: grupo.join(","), period: "day", metric_type: "total_value" }, token);
      metricasOk.push(...grupo);
    } catch (e) {
      // Nomeia a métrica recusada com o motivo — é o que permite corrigir a
      // lista sem adivinhar qual das sete morreu.
      metricasRecusadas.push(`${grupo.join(",")} → ${(e as Error).message}`);
    }
  }
  statusInsight = metricasOk.length > 0 ? "DISPONIVEL"
    : metricasRecusadas.length > 0 ? "INDISPONIVEL" : "NAO_TESTADO";

  registrar("Insights respondem?", metricasOk.length > 0 ? "sim" : "não",
    metricasOk.length > 0
      ? `Responderam: ${metricasOk.join(", ")}.`
      : "Nenhuma métrica respondeu. Para conta pessoal isto é esperado; para comercial, confira instagram_manage_insights no token.");

  return montar(true);

  function montar(ok: boolean): DiagnosticoInstagram {
    const linhas = [
      `impressão do token: ${impressao}`,
      ...etapas.map((e) => `[${e.resposta.toUpperCase().padEnd(3)}] ${e.pergunta} — ${e.detalhe}`),
    ];
    if (metricasRecusadas.length) linhas.push("", "Métricas recusadas:", ...metricasRecusadas.map((m) => `  · ${m}`));
    logger.info(`[Instagram] diagnóstico (${impressao}): ${etapas.length} etapa(s), ok=${ok}`);
    return {
      ok, impressao, etapas, metricasOk, metricasRecusadas, tipoConta, statusInsight,
      texto: linhas.join("\n"),
    };
  }
}
