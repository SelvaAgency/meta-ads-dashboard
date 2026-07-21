/**
 * Google OAuth 2.0 callback handler
 * Exchanges authorization code for refresh_token (GA4 + Google Ads)
 */
import type { Express, Request, Response } from "express";
import { canManageContent } from "../shared/permissions";
import { ENV } from "./_core/env";
import { sdk } from "./_core/sdk";
import { upsertUserIntegration } from "./db";
import { encryptSecret, isEncryptionConfigured } from "./_core/integrationsCrypto";

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

    /**
     * O `state` decide o fluxo — e agora é EXPLÍCITO. O default era "ga4", então
     * uma chamada sem parâmetro caía no fluxo do Analytics por acidente.
     */
    const state = req.query.state === "googleads" ? "googleads" : req.query.state === "ga4" ? "ga4" : null;
    if (!state) {
      return res.status(400).json({ error: "Informe state=ga4 ou state=googleads." });
    }

    /**
     * Escopo por fluxo, o mínimo de cada um. Antes os dois pediam a mesma lista,
     * que incluía `analytics` de ESCRITA — permissão de alterar a conta de
     * Analytics do cliente, que nunca usamos. Pedir o que não se usa é dívida:
     * aumenta o estrago de um vazamento e é mais difícil de justificar ao
     * cliente na tela de consentimento.
     *
     * `openid` + `userinfo.email` ficam nos dois: é o "conectado como <email>".
     */
    const escopoDoFluxo = state === "googleads"
      ? ["https://www.googleapis.com/auth/adwords"]
      : ["https://www.googleapis.com/auth/analytics.readonly"];
    const scope = [...escopoDoFluxo, "openid", "https://www.googleapis.com/auth/userinfo.email"].join(" ");

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
    const state = req.query.state as string || "googleads";

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

      // Google Ads: salva o refresh token CRIPTOGRAFADO na integração do
      // usuário, em vez de mostrar num textarea para copiar à mão. É o token do
      // login do MCC — as contas de cliente vão carregá-lo (também criptografado)
      // quando forem conectadas. Nunca vira env global.
      if (state === "googleads") {
        try {
          const user = await sdk.authenticateRequest(req);
          if (!isEncryptionConfigured()) throw new Error("INTEGRATIONS_ENCRYPTION_KEY ausente — não dá para guardar o token com segurança.");
          // Email da conta Google que autorizou — vem no id_token (JWT) quando
          // o escopo openid é pedido. Só o payload, sem verificar assinatura:
          // é rótulo de UI, não decisão de segurança.
          let email: string | null = null;
          try {
            const idToken = (tokenData as { id_token?: string }).id_token;
            if (idToken) {
              const payload = JSON.parse(Buffer.from(idToken.split(".")[1], "base64").toString("utf8"));
              email = payload.email ?? null;
            }
          } catch { /* sem email; a tela mostra "conectado" genérico */ }

          await upsertUserIntegration({
            userId: user.id,
            provider: "google_ads",
            providerAccountEmail: email,
            refreshTokenEncrypted: encryptSecret(refreshToken),
            accessTokenEncrypted: accessToken ? encryptSecret(accessToken) : null,
            scopes: "https://www.googleapis.com/auth/adwords",
            active: true,
          });
        } catch (e) {
          return res.status(400).send(`
            <html><body style="font-family:sans-serif;padding:40px;text-align:center;">
              <h2 style="color:#dc2626;">Não foi possível salvar a conexão</h2>
              <p>${(e as Error).message}</p>
              <p><a href="/google-ads" style="color:#2563eb;">← Voltar ao Google Ads</a></p>
            </body></html>
          `);
        }
        // Sucesso → volta para o SHELL do Spaces com o Google Ads embutido.
        // O OAuth rodou no top-level (target="_top"), então voltamos para a
        // rota do shell, não para /google-ads cru — que ficaria fora do iframe.
        return res.redirect("/tracker?rota=/google-ads&conectado=1");
      }

      /**
       * GA4: mesmo tratamento do Google Ads. Antes este ramo exibia o refresh
       * token cru numa <textarea> para copiar à mão — o segredo aparecia na
       * tela, ia para o histórico do navegador e dependia de alguém colar no
       * lugar certo. Agora é gravado criptografado e ninguém vê.
       */
      if (state === "ga4") {
        try {
          const user = await sdk.authenticateRequest(req);
          if (!canManageContent(user.role)) {
            throw new Error("Apenas administradores e desenvolvedores podem conectar o Google Analytics.");
          }
          if (!isEncryptionConfigured()) throw new Error("INTEGRATIONS_ENCRYPTION_KEY ausente — não dá para guardar o token com segurança.");

          let email: string | null = null;
          try {
            const idToken = (tokenData as { id_token?: string }).id_token;
            if (idToken) {
              const payload = JSON.parse(Buffer.from(idToken.split(".")[1], "base64").toString("utf8"));
              email = payload.email ?? null;
            }
          } catch { /* sem email; a tela mostra "conectado" genérico */ }

          await upsertUserIntegration({
            userId: user.id,
            provider: "ga4",
            providerAccountEmail: email,
            refreshTokenEncrypted: encryptSecret(refreshToken),
            accessTokenEncrypted: accessToken ? encryptSecret(accessToken) : null,
            scopes: "https://www.googleapis.com/auth/analytics.readonly",
            active: true,
          });
        } catch (e) {
          return res.status(400).send(`
            <html><body style="font-family:sans-serif;padding:40px;text-align:center;">
              <h2 style="color:#dc2626;">Não foi possível salvar a conexão</h2>
              <p>${(e as Error).message}</p>
              <p><a href="/tracker?rota=/ga4" style="color:#2563eb;">← Voltar ao Google Analytics</a></p>
            </body></html>
          `);
        }
        // Volta para o SHELL, não para a rota crua: o OAuth roda em top-level
        // (target="_top") e /ga4 sozinho ficaria fora do Spaces.
        return res.redirect("/tracker?rota=/ga4&conectado=1");
      }

      return res.status(400).send(`
        <html><body style="font-family:sans-serif;padding:40px;text-align:center;">
          <h2 style="color:#dc2626;">Fluxo desconhecido</h2>
          <p>Nenhuma integração corresponde a "${state}".</p>
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
