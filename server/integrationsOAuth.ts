/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Integrações OAuth — rotas HTTP (Google Calendar) · por usuário
 * ─────────────────────────────────────────────────────────────────────────────
 *  Fluxo de redirect (não cabe em tRPC):
 *    GET /api/integrations/google/start     → valida sessão, gera state (CSRF),
 *                                             redireciona para o consentimento.
 *    GET /api/integrations/google/callback  → valida state + sessão, troca code
 *                                             por tokens, cifra e salva, redireciona.
 *
 *  Segurança: state é um JWT curto assinado (userId + nonce); o callback valida
 *  o state E confere que a sessão é do MESMO usuário. Tokens são cifrados antes
 *  de salvar e nunca aparecem em URL/log/frontend.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import type { Express, Request, Response } from "express";
import { SignJWT, jwtVerify } from "jose";
import { randomBytes } from "node:crypto";
import { ENV } from "./_core/env";
import { sdk } from "./_core/sdk";
import { encryptSecret } from "./_core/integrationsCrypto";
import {
  GOOGLE_CALENDAR_PROVIDER,
  GOOGLE_CALENDAR_SCOPES,
  buildAuthUrl,
  exchangeCodeForTokens,
  isGoogleCalendarConfigured,
} from "./googleCalendarService";
import { getUserIntegration, upsertUserIntegration } from "./db";

const stateSecret = () => new TextEncoder().encode(ENV.cookieSecret || "selva-spaces-state");
const SETTINGS = "/settings";

async function signState(userId: number): Promise<string> {
  return new SignJWT({ uid: userId, n: randomBytes(8).toString("hex") })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("10m")
    .sign(stateSecret());
}

async function verifyState(state: string): Promise<number | null> {
  try {
    const { payload } = await jwtVerify(state, stateSecret());
    return typeof payload.uid === "number" ? payload.uid : null;
  } catch {
    return null;
  }
}

export function registerIntegrationsRoutes(app: Express) {
  // ── Iniciar conexão ────────────────────────────────────────────────────────
  app.get("/api/integrations/google/start", async (req: Request, res: Response) => {
    let user;
    try {
      user = await sdk.authenticateRequest(req);
    } catch {
      return res.redirect(302, "/login");
    }
    if (!isGoogleCalendarConfigured()) {
      return res.redirect(302, `${SETTINGS}?calendar=unavailable`);
    }
    const state = await signState(user.id);
    return res.redirect(302, buildAuthUrl(state));
  });

  // ── Callback ───────────────────────────────────────────────────────────────
  app.get("/api/integrations/google/callback", async (req: Request, res: Response) => {
    if (req.query.error) {
      return res.redirect(302, `${SETTINGS}?calendar=error`);
    }
    const code = typeof req.query.code === "string" ? req.query.code : "";
    const state = typeof req.query.state === "string" ? req.query.state : "";
    if (!code || !state) {
      return res.redirect(302, `${SETTINGS}?calendar=error`);
    }

    // Valida o state (CSRF) e a sessão — precisam ser o MESMO usuário.
    const stateUserId = await verifyState(state);
    let sessionUser;
    try {
      sessionUser = await sdk.authenticateRequest(req);
    } catch {
      return res.redirect(302, "/login");
    }
    if (stateUserId === null || stateUserId !== sessionUser.id) {
      return res.redirect(302, `${SETTINGS}?calendar=error`);
    }

    try {
      const tokens = await exchangeCodeForTokens(code);

      // refresh_token pode não vir em reconexões → preserva o existente.
      let refreshTokenEncrypted: string | undefined;
      if (tokens.refreshToken) {
        refreshTokenEncrypted = encryptSecret(tokens.refreshToken);
      } else {
        const existing = await getUserIntegration(sessionUser.id, GOOGLE_CALENDAR_PROVIDER);
        refreshTokenEncrypted = existing?.refreshTokenEncrypted ?? undefined;
      }

      await upsertUserIntegration({
        userId: sessionUser.id,
        provider: GOOGLE_CALENDAR_PROVIDER,
        providerAccountEmail: tokens.email ?? null,
        accessTokenEncrypted: encryptSecret(tokens.accessToken),
        refreshTokenEncrypted: refreshTokenEncrypted ?? null,
        expiresAt: tokens.expiresAt,
        scopes: tokens.scope ?? GOOGLE_CALENDAR_SCOPES.join(" "),
        active: true,
      });

      return res.redirect(302, `${SETTINGS}?calendar=connected`);
    } catch {
      return res.redirect(302, `${SETTINGS}?calendar=error`);
    }
  });
}
