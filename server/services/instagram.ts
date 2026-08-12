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
import { lerPermissoes, PERMISSOES_INSIGHTS, tipoDaResposta, type StatusInsight, type TipoConta, type VereditoPermissao } from "@shared/instagram";
import type { MidiaInstagram, PerfilInstagram, ResultadoInsights } from "./fonteInstagram";

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

/**
 * A chamada crua, para quem precisa perguntar coisas que este módulo não prevê
 * — hoje, só a sondagem da Fase 0.
 *
 * Continua exigindo o token por parâmetro, e continua sem guardá-lo: quem chama
 * é a FONTE, que já o tem. Nenhum caminho novo para a credencial sair.
 */
export const consultarGraph = <T>(caminho: string, params: Record<string, string>, token: string): Promise<T> =>
  graph<T>(caminho, params, token);

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

// ─── O que o token É ─────────────────────────────────────────────────────────

export interface FichaDoToken {
  tipo: string;
  appId: string | null;
  expira: string;
  escopos: string[];
  granular: Array<{ scope: string; target_ids?: string[] }>;
}

/**
 * Pergunta à Meta o que o token é e o que ele pode — em vez de deduzir do erro.
 *
 * `debug_token` responde tipo (SYSTEM_USER, USER, PAGE), App, validade e a lista
 * de escopos; `granular_scopes` diz ainda PARA QUAIS ativos cada escopo vale. É
 * o que separa "falta a permissão" de "a permissão não alcança esta Página" —
 * dois problemas que a Meta relata com a mesma mensagem (#10) e que têm
 * conserto em lugares diferentes.
 *
 * Nada aqui revela o token: só o que ele autoriza.
 */
export async function fichaDoToken(token: string): Promise<FichaDoToken> {
  const r = await graph<{ data?: Record<string, unknown> }>("debug_token", { input_token: token }, token);
  const d = r.data ?? {};
  const expiraEm = Number(d.expires_at ?? 0);
  return {
    tipo: String(d.type ?? "DESCONHECIDO"),
    appId: d.app_id ? String(d.app_id) : null,
    // 0 é o valor que a Meta usa para "não expira" — típico de System User.
    expira: expiraEm === 0 ? "não expira" : new Date(expiraEm * 1000).toISOString().slice(0, 10),
    escopos: Array.isArray(d.scopes) ? d.scopes.map(String) : [],
    granular: Array.isArray(d.granular_scopes)
      ? (d.granular_scopes as Array<{ scope?: unknown; target_ids?: unknown }>).map((g) => ({
          scope: String(g.scope ?? ""),
          target_ids: Array.isArray(g.target_ids) ? g.target_ids.map(String) : undefined,
        }))
      : [],
  };
}

// ─── Leituras isoladas ───────────────────────────────────────────────────────
//
// Extraídas de dentro do diagnóstico sem mudar uma chamada: ele continua sendo
// quem as encadeia, e agora elas também servem sozinhas — é o que a fonte
// (`fonteInstagram.ts`) precisa expor sem arrastar as seis perguntas junto.

/**
 * Perfil do Instagram alcançado pela Página.
 *
 * `account_type` NÃO é pedido: não existe no nó instagram_business_account (é da
 * API de IG Login), e campo inválido faz a Meta recusar a chamada inteira. Quem
 * é alcançável por esta aresta é profissional por construção — a Meta só cria o
 * objeto para Business/Creator.
 */
export async function perfilDe(token: string, instagramUserId: string): Promise<PerfilInstagram> {
  const p = await graph<{ username?: string; media_count?: number }>(
    instagramUserId, { fields: "username,media_count" }, token);
  return {
    instagramUserId,
    username: p.username ?? null,
    tipoConta: tipoDaResposta({ vinculadoAPagina: true }),
    posts: typeof p.media_count === "number" ? p.media_count : null,
  };
}

/** Métricas em grupos, cada grupo falhando por conta própria. */
export async function insightsDe(token: string, instagramUserId: string): Promise<ResultadoInsights> {
  const ok: string[] = [];
  const recusadas: string[] = [];
  for (const grupo of GRUPOS_METRICAS) {
    try {
      await graph<{ data: unknown[] }>(`${instagramUserId}/insights`,
        { metric: grupo.join(","), period: "day", metric_type: "total_value" }, token);
      ok.push(...grupo);
    } catch (e) {
      // Nomeia a métrica recusada com o motivo — é o que permite corrigir a
      // lista sem adivinhar qual das sete morreu.
      recusadas.push(`${grupo.join(",")} → ${(e as Error).message}`);
    }
  }
  return {
    statusInsight: ok.length > 0 ? "DISPONIVEL" : recusadas.length > 0 ? "INDISPONIVEL" : "NAO_TESTADO",
    ok, recusadas,
  };
}

/** Campos de mídia. Iguais nas duas fontes — a Meta usa os mesmos nomes. */
export const CAMPOS_MIDIA =
  "id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count";

export function mapearMidia(m: Record<string, unknown>): MidiaInstagram {
  return {
    id: String(m.id ?? ""),
    caption: m.caption ? String(m.caption) : null,
    mediaType: m.media_type ? String(m.media_type) : null,
    mediaProductType: m.media_product_type ? String(m.media_product_type) : null,
    mediaUrl: m.media_url ? String(m.media_url) : null,
    thumbnailUrl: m.thumbnail_url ? String(m.thumbnail_url) : null,
    permalink: m.permalink ? String(m.permalink) : null,
    timestamp: m.timestamp ? String(m.timestamp) : null,
    // `like_count` some quando a conta esconde curtidas — ausência não é zero.
    curtidas: typeof m.like_count === "number" ? m.like_count : null,
    comentarios: typeof m.comments_count === "number" ? m.comments_count : null,
  };
}

export async function midiasDe(token: string, instagramUserId: string, limite = 12): Promise<MidiaInstagram[]> {
  const r = await graph<{ data?: Record<string, unknown>[] }>(
    `${instagramUserId}/media`, { fields: CAMPOS_MIDIA, limit: String(limite) }, token);
  return (r.data ?? []).map(mapearMidia);
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
  /** O que o token é e o que autoriza — sem revelá-lo. */
  ficha: FichaDoToken | null;
  /** De quem é a falta, quando insights não respondem. */
  veredito: VereditoPermissao | null;
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
  /** true quando a chamada é o teste de UM cliente — muda o texto da etapa 4. */
  escopoDeCliente?: boolean;
} = {}): Promise<DiagnosticoInstagram> {
  const etapas: EtapaDiagnostico[] = [];
  const impressao = await impressaoDe(token);
  const businessId = opts.businessId ?? BUSINESS_ID_PADRAO;
  let tipoConta: TipoConta = "DESCONHECIDO";
  let statusInsight: StatusInsight = "NAO_TESTADO";
  const metricasOk: string[] = [];
  const metricasRecusadas: string[] = [];
  let ficha: FichaDoToken | null = null;
  let veredito: VereditoPermissao | null = null;

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

  // 2 — que token é este, e o que ele autoriza?
  //
  // Antes do portfólio de propósito: quando insights falham, a resposta já está
  // medida aqui, e não deduzida do erro lá embaixo.
  try {
    ficha = await fichaDoToken(token);
    const exigidos = PERMISSOES_INSIGHTS.map((p) => p.escopo);
    const faltam = exigidos.filter((e) => !ficha!.escopos.includes(e));
    registrar("Que token é este?", faltam.length ? "não" : "sim",
      `${ficha.tipo}${ficha.appId ? ` · App ${ficha.appId}` : ""} · ${ficha.expira} · ` +
      `escopos: ${ficha.escopos.length ? ficha.escopos.join(", ") : "nenhum declarado"}` +
      (faltam.length ? ` · FALTAM para insights: ${faltam.join(", ")}` : " · tem tudo que insights exigem"));
  } catch (e) {
    // Não é fatal: sem a ficha o diagnóstico continua, só perde a precisão de
    // dizer de quem é a falta.
    registrar("Que token é este?", "n/a", `Não foi possível inspecionar o token: ${(e as Error).message}`);
  }

  // 3 — alcança o portfólio?
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

  // 4 — a Página do cliente foi encontrada?
  //
  // O diagnóstico GERAL (o botão do topo) não tem cliente nenhum em foco, e
  // dizer "nenhuma Página vinculada a este cliente" ali afirma algo sobre um
  // cliente que a pergunta nunca teve — foi exatamente o que fez um painel de
  // vínculos salvos ser investigado como falha de persistência. Sem cliente, a
  // resposta é que a pergunta não se aplica, e o texto diz por quê.
  if (!opts.pageId) {
    registrar(
      "A Página do cliente foi encontrada?", "n/a",
      opts.escopoDeCliente
        ? "Este cliente ainda não tem Página salva. Escolha a Página no seletor e clique em Vincular."
        : "Diagnóstico geral, sem cliente em foco — esta etapa só existe no teste de um cliente. Use Testar no cartão do cliente.",
    );
    return montar(true);
  }
  const pagina = paginas.find((p) => p.pageId === opts.pageId);
  if (!pagina) {
    registrar("A Página do cliente foi encontrada?", "não",
      `A Página ${opts.pageId} não aparece no portfólio com este token.`);
    return montar(false);
  }
  registrar("A Página do cliente foi encontrada?", "sim", `"${pagina.pageName}".`);

  // 5 — tem Instagram vinculado?
  const igId = opts.instagramUserId ?? pagina.instagram?.id ?? null;
  if (!igId) {
    // Estado PRÓPRIO, não erro: o vínculo é feito no Instagram, não aqui.
    registrar("A Página tem Instagram vinculado?", "não",
      "Página conectada, Instagram não vinculado. O vínculo é feito no app do Instagram ou nas configurações da Página.");
    return montar(true);
  }
  registrar("A Página tem Instagram vinculado?", "sim",
    pagina.instagram?.username ? `@${pagina.instagram.username}` : igId);

  // 6 — que tipo de conta é?
  //
  // `account_type` NÃO é pedido de propósito: ele não existe no nó
  // instagram_business_account (é da API de IG Login), e pedir campo inválido
  // faz a Meta recusar a chamada inteira — a etapa cairia no catch e o tipo
  // viraria DESCONHECIDO justamente onde ele é conhecido. Uma conta alcançável
  // por esta aresta é profissional por construção: a Meta só cria o objeto para
  // Business/Creator. O que a chamada confirma é que o perfil RESPONDE.
  try {
    const perfil = await perfilDe(token, igId);
    tipoConta = perfil.tipoConta;
    registrar("Que tipo de conta é?", "sim",
      `${tipoConta}${perfil.username ? ` (@${perfil.username})` : ""} — profissional, por estar vinculada à Página.`);
  } catch (e) {
    tipoConta = "DESCONHECIDO";
    registrar("Que tipo de conta é?", "não", (e as Error).message);
  }

  // 7 — insights respondem? E QUAIS.
  const r = await insightsDe(token, igId);
  metricasOk.push(...r.ok);
  metricasRecusadas.push(...r.recusadas);
  statusInsight = r.statusInsight;

  if (metricasOk.length > 0) {
    registrar("Insights respondem?", "sim", `Responderam: ${metricasOk.join(", ")}.`);
    return montar(true);
  }

  // Nenhuma métrica respondeu. "Confira instagram_manage_insights" era o
  // conselho antigo, e ele acerta um caso em três: o escopo pode estar lá e não
  // alcançar este ativo, ou estar tudo certo e o bloqueio ser do App. O veredito
  // lê a ficha medida na etapa 2 e diz QUAL dos três é — e onde consertar.
  veredito = ficha
    ? lerPermissoes({
        escopos: ficha.escopos, granular: ficha.granular,
        instagramUserId: igId, pageId: opts.pageId,
      })
    : null;
  registrar("Insights respondem?", "não",
    veredito
      ? `Nenhuma métrica respondeu. ${veredito.titulo}.`
      : "Nenhuma métrica respondeu, e o token não pôde ser inspecionado para dizer o motivo.");

  return montar(true);

  function montar(ok: boolean): DiagnosticoInstagram {
    const linhas = [
      `impressão do token: ${impressao}`,
      ...etapas.map((e) => `[${e.resposta.toUpperCase().padEnd(3)}] ${e.pergunta} — ${e.detalhe}`),
    ];
    if (metricasRecusadas.length) linhas.push("", "Métricas recusadas:", ...metricasRecusadas.map((m) => `  · ${m}`));
    if (veredito) {
      linhas.push("", `O que fazer (${veredito.culpado}): ${veredito.orientacao}`);
      if (veredito.faltandoNoToken.length) linhas.push(`  falta no token: ${veredito.faltandoNoToken.join(", ")}`);
      if (veredito.semAcessoAoAtivo.length) linhas.push(`  não alcança este ativo: ${veredito.semAcessoAoAtivo.join(", ")}`);
    }
    logger.info(`[Instagram] diagnóstico (${impressao}): ${etapas.length} etapa(s), ok=${ok}`);
    return {
      ok, impressao, etapas, metricasOk, metricasRecusadas, tipoConta, statusInsight,
      ficha, veredito,
      texto: linhas.join("\n"),
    };
  }
}
