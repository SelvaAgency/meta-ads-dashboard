/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Trello — serviço (autorização por usuário + leitura de cards)
 * ─────────────────────────────────────────────────────────────────────────────
 *  A API REST do Trello usa API key (do app) + token autorizado pelo usuário
 *  (fluxo client-side "1/authorize", token retornado no fragmento da URL).
 *  NÃO é OAuth2. Escopo SOMENTE LEITURA (scope=read) — sem criar/editar/mover.
 *  Docs: https://developer.atlassian.com/cloud/trello/guides/rest-api/authorization/
 *
 *  Sem SDK — chamadas via fetch. Nenhum token é logado.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { ENV } from "./_core/env";
import { isEncryptionConfigured } from "./_core/integrationsCrypto";

const API = "https://api.trello.com/1";

export const TRELLO_PROVIDER = "trello";
export const TRELLO_SCOPE = "read";        // apenas leitura
export const TRELLO_EXPIRATION = "30days"; // expiração razoável (revogável no disconnect)

/** Erro específico de token inválido/expirado → estado "reconectar". */
export class TrelloAuthError extends Error {}

export function isTrelloConfigured(): boolean {
  return !!ENV.trelloApiKey && isEncryptionConfigured();
}

export function trelloReturnUrl(state: string): string {
  const base = ENV.appUrl || "";
  return `${base}/trello/callback?state=${encodeURIComponent(state)}`;
}

/** URL de autorização do Trello (token flow, leitura, retorno no fragmento). */
export function buildAuthorizeUrl(returnUrl: string): string {
  const u = new URL("https://trello.com/1/authorize");
  u.searchParams.set("key", ENV.trelloApiKey);
  u.searchParams.set("name", "Selva Spaces");
  u.searchParams.set("scope", TRELLO_SCOPE);
  u.searchParams.set("expiration", TRELLO_EXPIRATION);
  u.searchParams.set("response_type", "token");
  u.searchParams.set("callback_method", "fragment");
  u.searchParams.set("return_url", returnUrl);
  return u.toString();
}

export interface TrelloMember {
  id: string;
  username: string;
  fullName?: string;
  email?: string;
}

export async function getMember(token: string): Promise<TrelloMember> {
  const url = `${API}/members/me?key=${ENV.trelloApiKey}&token=${token}&fields=id,username,fullName,email`;
  const resp = await fetch(url);
  if (resp.status === 401) throw new TrelloAuthError("Token inválido");
  if (!resp.ok) throw new Error(`Trello members/me ${resp.status}`);
  const d = (await resp.json()) as { id: string; username: string; fullName?: string; email?: string };
  return { id: d.id, username: d.username, fullName: d.fullName, email: d.email };
}

export interface TrelloCardOut {
  id: string;
  name: string;
  boardName?: string;
  due?: string;
  dueComplete: boolean;
  url: string;
  labels: { name: string; color: string | null }[];
  idBoard: string;
  idList: string;
}

/**
 * Cards ABERTOS atribuídos ao membro autenticado, de TODOS os quadros que ele
 * acessa. 2 chamadas no total (cards + mapa de nomes de board), evitando N
 * chamadas por card.
 */
export async function listMyCards(token: string): Promise<TrelloCardOut[]> {
  const key = ENV.trelloApiKey;
  const cardsUrl =
    `${API}/members/me/cards?key=${key}&token=${token}` +
    `&filter=open&fields=name,due,dueComplete,url,shortUrl,idBoard,idList,labels`;
  const resp = await fetch(cardsUrl);
  if (resp.status === 401) throw new TrelloAuthError("Token inválido");
  if (!resp.ok) throw new Error(`Trello cards ${resp.status}`);
  const cards = (await resp.json()) as any[];

  // Mapa idBoard → nome (1 chamada). Best-effort: se falhar, segue sem boardName.
  const boardMap = new Map<string, string>();
  try {
    const bResp = await fetch(`${API}/members/me/boards?key=${key}&token=${token}&filter=open&fields=name`);
    if (bResp.ok) {
      for (const b of (await bResp.json()) as any[]) boardMap.set(b.id, b.name);
    }
  } catch {
    /* boardName é opcional */
  }

  return cards.map((c) => ({
    id: String(c.id),
    name: c.name ?? "(sem título)",
    boardName: boardMap.get(c.idBoard),
    due: c.due ?? undefined,
    dueComplete: !!c.dueComplete,
    url: c.shortUrl || c.url,
    labels: Array.isArray(c.labels)
      ? c.labels.map((l: any) => ({ name: l.name ?? "", color: l.color ?? null }))
      : [],
    idBoard: String(c.idBoard),
    idList: String(c.idList),
  }));
}

/** Revoga o token no Trello (best-effort). */
export async function revokeToken(token: string): Promise<void> {
  try {
    await fetch(`${API}/tokens/${token}?key=${ENV.trelloApiKey}&token=${token}`, { method: "DELETE" });
  } catch {
    /* best-effort */
  }
}
