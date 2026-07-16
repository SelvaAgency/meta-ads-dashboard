/**
 * Google OAuth 2.0 callback handler
 * Exchanges authorization code for refresh_token (GA4 + Google Ads)
 */
import type { Express, Request, Response } from "express";
import { ENV } from "./_core/env";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  INCIDENTE — credencial exposta (2026-07-16)
 * ─────────────────────────────────────────────────────────────────────────────
 *  Aqui existiam FALLBACK_CLIENT_ID e FALLBACK_CLIENT_SECRET com o client id e
 *  o CLIENT SECRET reais do app Google, hardcoded e commitados. O repositório é
 *  público, então o secret esteve exposto no histórico do git — considere-o
 *  comprometido: apagar daqui NÃO o revoga, e reescrever histórico de repo
 *  público não é confiável. Só a rotação no Google Cloud Console resolve.
 *
 *  Agora as credenciais vêm exclusivamente do ambiente e a rota falha alto se
 *  faltarem. Falhar alto é proposital: o fallback silencioso é o que permitiu
 *  o segredo viver aqui por tanto tempo sem ninguém perceber que ele existia.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Lê a credencial ou explica exatamente o que configurar. Nunca loga o valor. */
function credencialObrigatoria(nome: "GOOGLE_ADS_CLIENT_ID" | "GOOGLE_ADS_CLIENT_SECRET"): string {
  const v = process.env[nome];
  if (!v) throw new Error(`${nome} não configurada. Defina no ambiente (Railway) antes de usar o OAuth do Google.`);
  return v;
}

export function registerGoogleOAuthRoutes(app: Express) {
  // Step 1: Redirect user to Google consent screen
  app.get("/api/google/auth", (req: Request, res: Response) => {
    let clientId: string;
    try {
      clientId = credencialObrigatoria("GOOGLE_ADS_CLIENT_ID");
    } catch (e) {
      return res.status(500).json({ error: (e as Error).message });
    }

    const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI || `${ENV.appUrl}/api/google/callback`;
    const scope = [
      "https://www.googleapis.com/auth/analytics.readonly",
      "https://www.googleapis.com/auth/analytics",
      "https://www.googleapis.com/auth/adwords",
    ].join(" ");

    const state = (req.query.state as string) || "ga4"; // "ga4" or "googleads"

    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", scope);
    authUrl.searchParams.set("access_type", "offline");
    authUrl.searchParams.set("prompt", "consent");
    authUrl.searchParams.set("state", state);

    res.redirect(authUrl.toString());
  });

  // Step 2: Handle callback — exchange code for tokens
  app.get("/api/google/callback", async (req: Request, res: Response) => {
    const code = req.query.code as string;
    const error = req.query.error as string;
    const state = req.query.state as string || "ga4";

    if (error) {
      return res.status(400).send(`
        <html><body style="font-family:sans-serif;padding:40px;text-align:center;">
          <h2 style="color:#dc2626;">Authorization Failed</h2>
          <p>Error: ${error}</p>
          <p><a href="/api/google/auth?state=${state}">Try again</a></p>
        </body></html>
      `);
    }

    if (!code) {
      return res.status(400).send(`
        <html><body style="font-family:sans-serif;padding:40px;text-align:center;">
          <h2 style="color:#dc2626;">Missing authorization code</h2>
          <p><a href="/api/google/auth?state=${state}">Try again</a></p>
        </body></html>
      `);
    }

    let clientId: string, clientSecret: string;
    try {
      clientId = credencialObrigatoria("GOOGLE_ADS_CLIENT_ID");
      clientSecret = credencialObrigatoria("GOOGLE_ADS_CLIENT_SECRET");
    } catch (e) {
      return res.status(500).json({ error: (e as Error).message });
    }
    const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI || `${ENV.appUrl}/api/google/callback`;

    try {
      const tokenResp = await fetch(GOOGLE_TOKEN_URL, {
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

      const tokenData = await tokenResp.json() as any;

      if (tokenData.error) {
        return res.status(400).send(`
          <html><body style="font-family:sans-serif;padding:40px;text-align:center;">
            <h2 style="color:#dc2626;">Token Exchange Failed</h2>
            <p>${tokenData.error}: ${tokenData.error_description || ""}</p>
            <p><a href="/api/google/auth?state=${state}">Try again</a></p>
          </body></html>
        `);
      }

      const refreshToken = tokenData.refresh_token;
      const accessToken = tokenData.access_token;

      if (!refreshToken) {
        return res.status(400).send(`
          <html><body style="font-family:sans-serif;padding:40px;text-align:center;">
            <h2 style="color:#f59e0b;">No Refresh Token</h2>
            <p>Google did not return a refresh token. This usually means the account was already authorized.</p>
            <p>Try revoking access at <a href="https://myaccount.google.com/permissions" target="_blank">Google permissions</a> and then <a href="/api/google/auth?state=${state}">try again</a>.</p>
          </body></html>
        `);
      }

      // Show success page with token info for manual connection
      // In a production flow, we'd auto-create the account record
      return res.send(`
        <html><body style="font-family:sans-serif;padding:40px;max-width:700px;margin:0 auto;">
          <h2 style="color:#16a34a;">✅ Google Authorization Successful</h2>
          <p>Service: <strong>${state === "googleads" ? "Google Ads" : "GA4 Analytics"}</strong></p>
          <div style="background:#f1f5f9;padding:16px;border-radius:8px;margin:16px 0;">
            <p style="margin:0 0 8px;font-size:14px;color:#64748b;">Refresh Token (save this!):</p>
            <textarea readonly style="width:100%;height:80px;font-family:monospace;font-size:12px;border:1px solid #cbd5e1;border-radius:4px;padding:8px;">${refreshToken}</textarea>
          </div>
          <div style="background:#f1f5f9;padding:16px;border-radius:8px;margin:16px 0;">
            <p style="margin:0 0 8px;font-size:14px;color:#64748b;">Access Token (temporary):</p>
            <textarea readonly style="width:100%;height:80px;font-family:monospace;font-size:12px;border:1px solid #cbd5e1;border-radius:4px;padding:8px;">${accessToken}</textarea>
          </div>
          <p style="color:#64748b;font-size:14px;">You can now use the refresh token to connect this account in the dashboard settings.</p>
          <p><a href="/" style="color:#2563eb;">← Back to Dashboard</a></p>
        </body></html>
      `);
    } catch (err: any) {
      console.error("[Google OAuth] Token exchange error:", err);
      return res.status(500).send(`
        <html><body style="font-family:sans-serif;padding:40px;text-align:center;">
          <h2 style="color:#dc2626;">Server Error</h2>
          <p>${err.message}</p>
        </body></html>
      `);
    }
  });
}
