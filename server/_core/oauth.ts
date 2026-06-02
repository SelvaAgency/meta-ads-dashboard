import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import { scryptSync, timingSafeEqual, randomBytes } from "node:crypto";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";
import { ENV } from "./env";

// ─── Password utilities ───────────────────────────────────────────────────────

/**
 * Hash a password. Returns "<salt_hex>:<hash_hex>".
 * Use this once to generate ADMIN_PASSWORD_HASH for your .env file:
 *   node -e "const {scryptSync,randomBytes}=require('crypto'); const s=randomBytes(16).toString('hex'); console.log(s+':'+scryptSync('YOUR_PASSWORD',s,64).toString('hex'))"
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  try {
    const [salt, hash] = stored.split(":");
    if (!salt || !hash) return false;
    const hashBuf = Buffer.from(hash, "hex");
    const supplied = scryptSync(password, salt, 64);
    return timingSafeEqual(hashBuf, supplied);
  } catch {
    return false;
  }
}

// ─── Login page HTML ──────────────────────────────────────────────────────────

const LOGIN_HTML = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>SELVA Agency — Login</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { min-height: 100vh; display: flex; align-items: center; justify-content: center;
           background: #0a0a0a; font-family: system-ui, sans-serif; }
    .card { background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 12px;
             padding: 40px; width: 100%; max-width: 360px; }
    h1 { color: #E85BA8; font-size: 20px; letter-spacing: 2px; text-transform: uppercase;
          margin-bottom: 8px; }
    p { color: #666; font-size: 13px; margin-bottom: 28px; }
    label { display: block; color: #aaa; font-size: 12px; margin-bottom: 6px; }
    input { width: 100%; padding: 10px 12px; background: #0d0d0d; border: 1px solid #333;
             border-radius: 8px; color: #fff; font-size: 14px; margin-bottom: 16px;
             outline: none; transition: border-color .15s; }
    input:focus { border-color: #E85BA8; }
    button { width: 100%; padding: 11px; background: #E85BA8; border: none;
              border-radius: 8px; color: #fff; font-size: 14px; font-weight: 600;
              cursor: pointer; transition: opacity .15s; }
    button:hover { opacity: .9; }
    .error { color: #f87171; font-size: 13px; margin-bottom: 16px; display: none; }
    .error.show { display: block; }
  </style>
</head>
<body>
  <div class="card">
    <h1>SELVA</h1>
    <p>Meta Ads Intelligence Dashboard</p>
    <div class="error" id="err">{{ERROR}}</div>
    <form method="POST" action="/api/auth/login">
      <label for="email">E-mail</label>
      <input id="email" name="email" type="email" autocomplete="email" required autofocus />
      <label for="password">Senha</label>
      <input id="password" name="password" type="password" autocomplete="current-password" required />
      <button type="submit">Entrar</button>
    </form>
  </div>
  <script>
    const err = document.getElementById('err');
    if (err && err.textContent.trim()) err.classList.add('show');
  </script>
</body>
</html>`;

// ─── Routes ───────────────────────────────────────────────────────────────────

export function registerOAuthRoutes(app: Express) {
  // GET /login — redirect alias for the React SPA; serve login HTML
  app.get("/login", (_req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(LOGIN_HTML.replace("{{ERROR}}", ""));
  });

  // GET /api/auth/login — same login page (used by getLoginUrl())
  app.get("/api/auth/login", (_req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(LOGIN_HTML.replace("{{ERROR}}", ""));
  });

  // POST /api/auth/login — validate credentials, create session
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    const { email, password } = req.body as { email?: string; password?: string };

    const fail = (msg: string) => {
      res.status(401).setHeader("Content-Type", "text/html; charset=utf-8").send(
        LOGIN_HTML.replace("{{ERROR}}", msg)
      );
    };

    if (!email || !password) return fail("E-mail e senha são obrigatórios.");

    console.log('[DEBUG LOGIN] email recebido:', email);
    console.log('[DEBUG LOGIN] ADMIN_EMAIL:', ENV.adminEmail);
    console.log('[DEBUG LOGIN] emails batem:', email.toLowerCase() === ENV.adminEmail?.toLowerCase());
    console.log('[DEBUG LOGIN] hash length:', ENV.adminPasswordHash?.length);

    // Primary: check ENV admin credentials
    const isEnvAdmin =
      ENV.adminEmail &&
      ENV.adminPasswordHash &&
      email.toLowerCase() === ENV.adminEmail.toLowerCase() &&
      verifyPassword(password, ENV.adminPasswordHash);

    let openId = email.toLowerCase();
    let name = email.split("@")[0] ?? email;
    let role: "admin" | "user" = "user";

    if (isEnvAdmin) {
      role = "admin";
    } else {
      // Fallback: check users table for other registered users
      const dbUser = await db.getUserByOpenId(openId);
      if (!dbUser || !dbUser.passwordHash || !verifyPassword(password, dbUser.passwordHash)) {
        return fail("E-mail ou senha incorretos.");
      }
      role = (dbUser.role as "admin" | "user") ?? "user";
      name = dbUser.name ?? name;
    }

    // Upsert user in DB (creates on first login, updates lastSignedIn)
    await db.upsertUser({
      openId,
      email,
      name,
      loginMethod: "email",
      role,
      lastSignedIn: new Date(),
    });

    const sessionToken = await sdk.createSessionToken(openId, {
      name,
      expiresInMs: ONE_YEAR_MS,
    });

    const cookieOptions = getSessionCookieOptions(req);
    res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
    res.redirect(302, "/dashboard");
  });
}
