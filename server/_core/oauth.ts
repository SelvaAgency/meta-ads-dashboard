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
  <title>Selva Spaces</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400&display=swap" rel="stylesheet"/>
  <style>
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    body{min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:"Inter",system-ui,sans-serif;background:radial-gradient(ellipse 60% 55% at 50% 40%,rgba(45,100,45,0.28) 0%,rgba(25,70,30,0.1) 45%,transparent 70%),radial-gradient(ellipse 90% 70% at 50% 50%,rgba(12,28,70,0.55) 0%,transparent 85%),#060810;overflow:hidden;position:relative;}
    .star{position:fixed;background:#fff;border-radius:50%;}
    .card{position:relative;z-index:10;display:flex;flex-direction:column;align-items:center;gap:24px;width:100%;max-width:400px;padding:48px 40px;}
    .s-mark{position:relative;width:90px;height:90px;display:flex;align-items:center;justify-content:center;animation:spulse 4s ease-in-out infinite;}
    @keyframes spulse{0%,100%{transform:scale(1)}50%{transform:scale(1.04)}}
    .s-halo{position:absolute;inset:-16px;border-radius:50%;background:radial-gradient(circle,rgba(253,255,237,.07) 0%,transparent 70%);animation:halopulse 4s ease-in-out infinite;}
    @keyframes halopulse{0%,100%{opacity:.4}50%{opacity:1}}
    .s-ring1{position:absolute;top:50%;left:50%;width:78px;height:27px;margin-left:-39px;margin-top:-13.5px;border-radius:50%;border:.8px solid rgba(253,255,237,.25);animation:sr1 10s linear infinite;}
    @keyframes sr1{from{transform:rotateX(70deg) rotateZ(0deg)}to{transform:rotateX(70deg) rotateZ(360deg)}}
    .s-ring2{position:absolute;top:50%;left:50%;width:88px;height:23px;margin-left:-44px;margin-top:-11.5px;border-radius:50%;border:.5px solid rgba(239,112,27,.3);animation:sr2 16s linear infinite reverse;}
    @keyframes sr2{from{transform:rotateX(75deg) rotateZ(60deg)}to{transform:rotateX(75deg) rotateZ(420deg)}}
    .s-dot1{position:absolute;top:50%;left:50%;width:7px;height:7px;margin-left:-3.5px;margin-top:-3.5px;border-radius:50%;background:#FDFFED;box-shadow:0 0 6px rgba(253,255,237,.9);animation:sd1 10s linear infinite;}
    @keyframes sd1{0%{transform:rotateX(70deg) rotateZ(0deg) translateX(39px) rotateX(-70deg) rotateZ(0deg)}100%{transform:rotateX(70deg) rotateZ(360deg) translateX(39px) rotateX(-70deg) rotateZ(-360deg)}}
    .s-dot2{position:absolute;top:50%;left:50%;width:5px;height:5px;margin-left:-2.5px;margin-top:-2.5px;border-radius:50%;background:#EF701B;box-shadow:0 0 6px rgba(239,112,27,.9);animation:sd2 16s linear infinite reverse;}
    @keyframes sd2{0%{transform:rotateX(75deg) rotateZ(60deg) translateX(44px) rotateX(-75deg) rotateZ(-60deg)}100%{transform:rotateX(75deg) rotateZ(420deg) translateX(44px) rotateX(-75deg) rotateZ(-420deg)}}
    .brand-name{font-size:18px;font-weight:400;color:#FDFFED;letter-spacing:.06em;}
    .brand-sub{font-size:9px;font-weight:200;letter-spacing:.28em;text-transform:uppercase;color:rgba(253,255,237,.3);}
    .brand-sub a{color:rgba(253,255,237,.45);text-decoration:none;border-bottom:.5px solid rgba(253,255,237,.2);}
    hr{width:100%;border:none;border-top:.5px solid rgba(253,255,237,.08);}
    .copy-title{font-size:14px;font-weight:400;color:rgba(253,255,237,.8);text-align:center;}
    .copy-sub{font-size:12px;font-weight:200;color:rgba(253,255,237,.32);text-align:center;line-height:1.7;}
    .fields{width:100%;display:flex;flex-direction:column;gap:10px;}
    label{font-size:10px;font-weight:300;letter-spacing:.12em;text-transform:uppercase;color:rgba(253,255,237,.35);}
    input{width:100%;padding:11px 14px;background:rgba(253,255,237,.04);border:.5px solid rgba(253,255,237,.12);border-radius:4px;color:#FDFFED;font-family:"Inter",sans-serif;font-size:13px;outline:none;transition:border-color .2s;}
    input:focus{border-color:rgba(239,112,27,.6);}
    button{width:100%;padding:13px 24px;background:rgba(239,112,27,.1);border:1px solid rgba(239,112,27,.45);border-radius:4px;color:#EF701B;font-family:"Inter",sans-serif;font-size:11px;font-weight:400;letter-spacing:.2em;text-transform:uppercase;cursor:pointer;transition:all .3s;}
    button:hover{background:rgba(239,112,27,.18);border-color:#EF701B;box-shadow:0 0 20px rgba(239,112,27,.18);}
    .error{color:#f87171;font-size:12px;text-align:center;display:none;}
    .error.show{display:block;}
    .footer-link{font-size:9px;letter-spacing:.2em;text-transform:uppercase;color:rgba(253,255,237,.18);text-decoration:none;}
  </style>
</head>
<body>
  <div class="card">
    <div class="s-mark">
      <div class="s-halo"></div>
      <div class="s-ring1"></div>
      <div class="s-ring2"></div>
      <div class="s-dot1"></div>
      <div class="s-dot2"></div>
      <svg width="65" height="65" viewBox="0 0 523 523" fill="none">
        <circle cx="261.5" cy="261.5" r="256" stroke="rgba(253,255,237,.08)" stroke-width="1"/>
        <path d="M257.4 141.2C238.2 151.1 219 162.9 200.3 176.3C170.7 197.6 144.4 221.4 123.2 245.9C114.3 235.9 109.7 223.5 111.5 208.1C114.9 177.4 133.7 156.8 167.3 146.9C190.3 140.1 219.9 138.2 257.4 141.2Z" fill="#FDFFED"/>
        <path d="M410.6 317.3C404.7 369.7 356.7 391.6 263.9 384.1C283.8 373.9 303.8 361.7 323.3 347.7C352.3 326.9 378.1 303.6 399 279.6C407.8 289.7 412.3 302 410.6 317.3Z" fill="#FDFFED"/>
        <path d="M210.4 219.2C210.9 222 223.7 225.4 234.3 228.4C249.8 230.8 266.7 233.5 311.4 240.8C367.6 249.9 394.8 275.3 374.1 299.1C348.6 322.1 319.7 342.8 297.3 358.9C274.6 372.3 252.4 383 178.1 374.6C103.8 359.9 103.1 283.8 103.1 282.2C103.8 281.1 105.4 278.8 200.6 289.4L201.7 291.8C207.8 305.7 224.7 313.7 255 317.1C288.2 320.8 311.6 306.4 298.3 300C274.3 294.8 210.8 284.6 127.4 250.3C148 226.5 173.8 202.8 203.8 181.2C225.4 165.8 247.3 152.7 268.7 142.2C347.2 151.4 418.9 244 417 246.7L321.3 236.1L320.3 233.6C314.3 219.6 297.8 211.8 267 208.4C232.7 204.6 211.6 208.6 210.4 219.2Z" fill="#FDFFED"/>
        <path d="M263.9 384.1C205.8 405.5 129.1 412.2 84.1 389.5C66.3 364.7 75 324.8 103.1 282.2C119.2 259.8 127.4 250.3 161.8 415.8Z" fill="#FDFFED" fill-opacity=".6"/>
        <path d="M434 231C399 279.6 403 265.9 417 246.7C422.5 238.6 451 189 439.5 134.6C414.6 99.8 268.7 142.2 257.4 141.2C299.1 121.4 346.4 108.8 392.9 99.9C444.4 131 461.1 154.3 434 231Z" fill="#FDFFED" fill-opacity=".6"/>
        <ellipse cx="261.5" cy="261.5" rx="245" ry="88" stroke="rgba(253,255,237,.1)" stroke-width="1" fill="none" transform="rotate(-20 261.5 261.5)"/>
      </svg>
    </div>
    <div style="display:flex;flex-direction:column;align-items:center;gap:4px;">
      <div class="brand-name">Selva Spaces</div>
      <div class="brand-sub">Powered by <a href="https://www.selva.agency" target="_blank">SELVA Agency</a></div>
    </div>
    <hr/>
    <div style="display:flex;flex-direction:column;gap:6px;">
      <div class="copy-title">Acesse o ambiente interno da Selva.</div>
      <div class="copy-sub">Espaço único da equipe.</div>
    </div>
    <div class="error" id="err">{{ERROR}}</div>
    <form method="POST" action="/api/auth/login" style="width:100%;display:flex;flex-direction:column;gap:16px;">
      <div class="fields">
        <div>
          <label for="email">E-mail</label>
          <input id="email" name="email" type="email" autocomplete="email" required autofocus />
        </div>
        <div>
          <label for="password">Senha</label>
          <input id="password" name="password" type="password" autocomplete="current-password" required />
        </div>
      </div>
      <button type="submit">Entrar</button>
    </form>
    <a href="https://www.selva.agency" class="footer-link">← SELVA Agency</a>
  </div>
  <script>
    const err = document.getElementById('err');
    if (err && err.textContent.trim()) err.classList.add('show');
    for(var i=0;i<100;i++){var s=document.createElement('div');s.className='star';var sz=Math.random()*1.6+0.3;s.style.cssText='width:'+sz+'px;height:'+sz+'px;top:'+(Math.random()*100)+'%;left:'+(Math.random()*100)+'%;opacity:'+(Math.random()*0.4+0.05);document.body.appendChild(s);}
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
    // Pós-login → Home do Selva Spaces (raiz).
    res.redirect(302, "/");
  });
}
