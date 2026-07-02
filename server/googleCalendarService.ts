/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Google Calendar — serviço (OAuth + leitura de eventos)  · por usuário
 * ─────────────────────────────────────────────────────────────────────────────
 *  Escopo MÍNIMO de LEITURA (não cria/edita/exclui eventos):
 *    · openid, email                              → saber o e-mail conectado
 *    · calendar.events.readonly                   → ler eventos
 *  Docs: https://developers.google.com/calendar/api/auth
 *
 *  Sem SDK — chamadas via fetch. Nenhum token é logado.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { ENV } from "./_core/env";
import { isEncryptionConfigured } from "./_core/integrationsCrypto";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

export const GOOGLE_CALENDAR_PROVIDER = "google_calendar";
export const GOOGLE_CALENDAR_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.events.readonly",
];

// Fuso da agência (Brasil não tem mais horário de verão desde 2019 → UTC-3 fixo).
const AGENCY_TZ_OFFSET = "-03:00";
const AGENCY_TZ = "America/Sao_Paulo";

export function googleCalendarConfig() {
  const clientId = ENV.googleClientId;
  const clientSecret = ENV.googleClientSecret;
  const redirectUri = ENV.googleRedirectUri || `${ENV.appUrl}/api/integrations/google/callback`;
  return { clientId, clientSecret, redirectUri };
}

/** true se o app pode operar a integração (env + chave de cripto presentes). */
export function isGoogleCalendarConfigured(): boolean {
  const { clientId, clientSecret } = googleCalendarConfig();
  return !!clientId && !!clientSecret && isEncryptionConfigured();
}

export function buildAuthUrl(state: string): string {
  const { clientId, redirectUri } = googleCalendarConfig();
  const url = new URL(AUTH_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_CALENDAR_SCOPES.join(" "));
  url.searchParams.set("access_type", "offline"); // garante refresh_token
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", state);
  return url.toString();
}

export interface GoogleTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt: Date;
  scope?: string;
  email?: string;
}

function emailFromIdToken(idToken?: string): string | undefined {
  if (!idToken) return undefined;
  try {
    const payload = idToken.split(".")[1];
    const json = JSON.parse(Buffer.from(payload, "base64").toString("utf8"));
    return typeof json.email === "string" ? json.email : undefined;
  } catch {
    return undefined;
  }
}

export async function exchangeCodeForTokens(code: string): Promise<GoogleTokens> {
  const { clientId, clientSecret, redirectUri } = googleCalendarConfig();
  const resp = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!resp.ok) throw new Error(`Token exchange falhou (${resp.status})`);
  const data = (await resp.json()) as {
    access_token: string; refresh_token?: string; expires_in: number; scope?: string; id_token?: string;
  };
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + (data.expires_in ?? 3600) * 1000),
    scope: data.scope,
    email: emailFromIdToken(data.id_token),
  };
}

/** Renova o access_token via refresh_token. Lança se falhar (→ reconectar). */
export async function refreshAccessToken(refreshToken: string): Promise<GoogleTokens> {
  const { clientId, clientSecret } = googleCalendarConfig();
  const resp = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }),
  });
  if (!resp.ok) throw new Error(`Refresh falhou (${resp.status})`);
  const data = (await resp.json()) as { access_token: string; expires_in: number; scope?: string };
  return {
    accessToken: data.access_token,
    expiresAt: new Date(Date.now() + (data.expires_in ?? 3600) * 1000),
    scope: data.scope,
  };
}

export async function revokeToken(token: string): Promise<void> {
  try {
    await fetch(`${REVOKE_URL}?token=${encodeURIComponent(token)}`, { method: "POST" });
  } catch {
    /* best-effort */
  }
}

export interface AgendaEvent {
  id: string;
  time: string;      // "HH:mm" ou "Dia todo"
  title: string;
  allDay: boolean;
  status?: string;
}

/** Eventos de HOJE (fuso da agência) do calendário primário do usuário. */
export async function listTodayEvents(accessToken: string): Promise<AgendaEvent[]> {
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: AGENCY_TZ, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date()); // "2026-07-08"

  const params = new URLSearchParams({
    timeMin: `${ymd}T00:00:00${AGENCY_TZ_OFFSET}`,
    timeMax: `${ymd}T23:59:59${AGENCY_TZ_OFFSET}`,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "25",
  });

  const resp = await fetch(`${EVENTS_URL}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) throw new Error(`Calendar API ${resp.status}`);
  const data = (await resp.json()) as { items?: any[] };

  return (data.items ?? [])
    .filter((ev) => ev.status !== "cancelled")
    .map((ev) => {
      const allDay = !!ev.start?.date && !ev.start?.dateTime;
      let time = "Dia todo";
      if (!allDay && ev.start?.dateTime) {
        time = new Intl.DateTimeFormat("pt-BR", {
          timeZone: AGENCY_TZ, hour: "2-digit", minute: "2-digit",
        }).format(new Date(ev.start.dateTime));
      }
      // Evento privado (organizado por outro) → não expõe detalhes indevidos.
      const isPrivate = ev.visibility === "private" || ev.visibility === "confidential";
      const title = isPrivate && !ev.summary ? "Evento privado" : (ev.summary ?? "(sem título)");
      return {
        id: String(ev.id),
        time,
        title,
        allDay,
        status: ev.status as string | undefined,
      };
    });
}
