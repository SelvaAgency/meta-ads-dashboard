/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Instagram Login — OAuth da própria conta
 * ─────────────────────────────────────────────────────────────────────────────
 *  A segunda fonte do híbrido. O dono da conta autoriza; a agência não precisa
 *  de Página, nem de Portfólio, nem de ativo atribuído no Business Manager.
 *
 *  ── Por que ESTE fluxo, e não Facebook Login ───────────────────────────────
 *  Facebook Login usa a MESMA família de permissões que hoje falha na fonte da
 *  agência (`instagram_manage_insights`). Se o bloqueio for Acesso Avançado do
 *  App, ele entregaria o mesmo (#10) depois de todo o trabalho. Instagram Login
 *  usa outra família (`instagram_business_*`) e tem gating independente — é o
 *  único caminho que não herda o problema atual.
 *
 *  ── Uma API diferente, não um token diferente ──────────────────────────────
 *  Host, endpoints e renovação são outros: `graph.instagram.com`, `/me` no lugar
 *  do id da Página, e um token que expira em 60 dias e se renova sozinho. Por
 *  isso a fonte OAuth é um adaptador próprio, e não a fonte da agência com outro
 *  token dentro.
 *
 *  ── Os nomes vêm do App, não da minha memória ──────────────────────────────
 *  Escopos e host de autorização são configuráveis por env porque a tela
 *  "API setup with Instagram login" do próprio App é a autoridade sobre eles, e
 *  a Meta os renomeia. Um nome errado aqui produz um erro de autorização vago,
 *  longe da causa — trocar por env evita um deploy para descobrir isso.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { ENV } from "../_core/env";
import { logger } from "../logger";
import { sanitizar } from "./instagram";

/** Base da API do Instagram Login — outra do `graph.facebook.com` da agência. */
const GRAPH_IG = "https://graph.instagram.com";

const AUTORIZAR = process.env.INSTAGRAM_OAUTH_AUTHORIZE_URL
  ?? "https://www.instagram.com/oauth/authorize";

/**
 * `instagram_business_basic` dá perfil e mídia; `..._manage_insights` dá as
 * métricas. Os outros escopos do produto (mensagens, comentários, publicação)
 * ficam de fora: pedir permissão que não se usa faz o cliente ver uma tela de
 * consentimento mais assustadora do que o que a agência realmente vai ler.
 */
export const ESCOPOS_INSTAGRAM = (
  process.env.INSTAGRAM_OAUTH_SCOPES ?? "instagram_business_basic,instagram_business_manage_insights"
).split(",").map((s) => s.trim()).filter(Boolean);

export const appId = () => process.env.INSTAGRAM_APP_ID ?? "";
const appSecret = () => process.env.INSTAGRAM_APP_SECRET ?? "";

/** Precisa bater EXATAMENTE com a cadastrada no App. Instagram não aceita http. */
export const redirectUri = () =>
  process.env.INSTAGRAM_OAUTH_REDIRECT_URI ?? `${ENV.appUrl}/api/social/instagram/callback`;

export const oauthConfigurado = (): boolean => !!appId() && !!appSecret();

export function urlDeAutorizacao(state: string): string {
  const u = new URL(AUTORIZAR);
  u.searchParams.set("client_id", appId());
  u.searchParams.set("redirect_uri", redirectUri());
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", ESCOPOS_INSTAGRAM.join(","));
  u.searchParams.set("state", state);
  return u.toString();
}

// ─── Troca e renovação ───────────────────────────────────────────────────────

export interface TokenDeConta {
  token: string;
  instagramUserId: string | null;
  /** Segundos até expirar, quando a Meta informa. */
  expiraEm: number | null;
  escopos: string[];
}

async function ler(resp: Response, oque: string): Promise<Record<string, unknown>> {
  const texto = await resp.text();
  let dados: Record<string, unknown>;
  try {
    dados = JSON.parse(texto) as Record<string, unknown>;
  } catch {
    throw new Error(`${oque}: resposta não é JSON (HTTP ${resp.status}).`);
  }
  if (dados.error || dados.error_message) {
    const e = (dados.error ?? {}) as { message?: string; code?: number; type?: string };
    const msg = e.message ?? String(dados.error_message ?? "erro sem mensagem");
    throw new Error(`${oque} — Meta (${e.code ?? e.type ?? "?"}): ${sanitizar(msg)}`);
  }
  return dados;
}

/**
 * Troca o `code` por um token curto (≈1h).
 *
 * A resposta traz `permissions` — os escopos que o usuário REALMENTE concedeu,
 * que podem ser menos do que os pedidos. Guardar o pedido no lugar do concedido
 * faria o diagnóstico afirmar uma permissão que a conta negou.
 */
export async function trocarCodePorToken(code: string): Promise<TokenDeConta> {
  const corpo = new URLSearchParams({
    client_id: appId(),
    client_secret: appSecret(),
    grant_type: "authorization_code",
    redirect_uri: redirectUri(),
    code,
  });
  const resp = await fetch("https://api.instagram.com/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: corpo,
    signal: AbortSignal.timeout(20_000),
  });
  const d = await ler(resp, "Troca do code por token");
  const token = String(d.access_token ?? "");
  if (!token) throw new Error("Troca do code por token: a Meta não devolveu access_token.");
  const permissoes = d.permissions;
  return {
    token,
    instagramUserId: d.user_id != null ? String(d.user_id) : null,
    expiraEm: null,
    escopos: Array.isArray(permissoes) ? permissoes.map(String)
      : typeof permissoes === "string" ? permissoes.split(",").map((s) => s.trim()).filter(Boolean)
      : [],
  };
}

/** Curto (1h) → longo (60 dias). Sem isto a conexão morre no mesmo dia. */
export async function trocarPorTokenLongo(curto: TokenDeConta): Promise<TokenDeConta> {
  const u = new URL(`${GRAPH_IG}/access_token`);
  u.searchParams.set("grant_type", "ig_exchange_token");
  u.searchParams.set("client_secret", appSecret());
  u.searchParams.set("access_token", curto.token);
  const d = await ler(await fetch(u, { signal: AbortSignal.timeout(20_000) }), "Troca por token longo");
  return {
    ...curto,
    token: String(d.access_token ?? curto.token),
    expiraEm: typeof d.expires_in === "number" ? d.expires_in : null,
  };
}

/**
 * Renova o token longo por mais 60 dias.
 *
 * A Meta exige que ele tenha pelo menos 24h de vida e ainda não tenha expirado.
 * Um token já expirado NÃO se renova — só reconectando; é por isso que a tela
 * avisa antes, em vez de tentar consertar depois.
 */
export async function renovarTokenLongo(token: string): Promise<{ token: string; expiraEm: number | null }> {
  const u = new URL(`${GRAPH_IG}/refresh_access_token`);
  u.searchParams.set("grant_type", "ig_refresh_token");
  u.searchParams.set("access_token", token);
  const d = await ler(await fetch(u, { signal: AbortSignal.timeout(20_000) }), "Renovação do token");
  logger.info("[InstagramOAuth] token renovado");
  return {
    token: String(d.access_token ?? token),
    expiraEm: typeof d.expires_in === "number" ? d.expires_in : null,
  };
}

// ─── Leitura ─────────────────────────────────────────────────────────────────

export async function graphIg<T>(caminho: string, params: Record<string, string>, token: string): Promise<T> {
  const u = new URL(`${GRAPH_IG}/${caminho}`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  u.searchParams.set("access_token", token);
  const resp = await fetch(u, { signal: AbortSignal.timeout(20_000) });
  const texto = await resp.text();
  let dados: Record<string, unknown>;
  try {
    dados = JSON.parse(texto) as Record<string, unknown>;
  } catch {
    throw new Error(`Resposta do Instagram não é JSON (HTTP ${resp.status}).`);
  }
  if (dados.error) {
    const e = dados.error as { message?: string; code?: number; error_subcode?: number };
    throw new Error(
      `Instagram (${e.code ?? "?"}${e.error_subcode ? `/${e.error_subcode}` : ""}): ${sanitizar(e.message ?? "erro sem mensagem", token)}`,
    );
  }
  return dados as T;
}

/**
 * Perfil da conta autorizada.
 *
 * Pede os campos ricos e, se a Meta recusar algum, repete com o mínimo. O
 * conjunto de campos deste nó já mudou de nome mais de uma vez, e um campo
 * inválido derruba a chamada INTEIRA — perder o @ porque `followers_count`
 * saiu do ar seria trocar tudo por nada.
 */
export async function perfilDaConta(token: string): Promise<{
  id: string; username: string | null; accountType: string | null;
  posts: number | null; seguidores: number | null;
}> {
  const mapear = (d: Record<string, unknown>) => ({
    id: String(d.user_id ?? d.id ?? ""),
    username: d.username ? String(d.username) : null,
    accountType: d.account_type ? String(d.account_type) : null,
    posts: typeof d.media_count === "number" ? d.media_count : null,
    seguidores: typeof d.followers_count === "number" ? d.followers_count : null,
  });
  try {
    return mapear(await graphIg("me", { fields: "user_id,username,account_type,media_count,followers_count" }, token));
  } catch {
    return mapear(await graphIg("me", { fields: "username" }, token));
  }
}
