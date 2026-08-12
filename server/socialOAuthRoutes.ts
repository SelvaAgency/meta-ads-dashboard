/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Instagram Login — rotas de redirect
 * ─────────────────────────────────────────────────────────────────────────────
 *    GET /api/social/instagram/start?accountId=N  → valida sessão e permissão,
 *                                                   assina o state, redireciona
 *    GET /api/social/instagram/callback           → valida state, troca o code,
 *                                                   cifra, salva, volta ao hub
 *
 *  ── Por que o accountId vai DENTRO do state ────────────────────────────────
 *  Ele decide de qual cliente é o token que está sendo salvo. Se viesse na query
 *  do callback, qualquer pessoa com um link de retorno poderia trocar o número e
 *  gravar a conexão de um cliente sobre a de outro. Assinado junto do userId e
 *  de um nonce, o callback só aceita o par que ele mesmo emitiu — e confere que
 *  a sessão é do MESMO usuário que começou.
 *
 *  ── O token nunca passa pela URL nem volta para a tela ─────────────────────
 *  A troca do `code` acontece servidor-a-servidor; o que volta no redirect é só
 *  um marcador de resultado. Mesmo o erro volta como código curto: mensagem da
 *  Meta em querystring acaba em log de proxy e em histórico de navegador.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import type { Express, Request, Response } from "express";
import { SignJWT, jwtVerify } from "jose";
import { randomBytes } from "node:crypto";
import { ENV } from "./_core/env";
import { sdk } from "./_core/sdk";
import { canManageContent } from "@shared/permissions";
import { logger } from "./logger";
import { impressaoDe } from "./services/instagram";
import {
  oauthConfigurado, trocarCodePorToken, trocarPorTokenLongo, urlDeAutorizacao,
} from "./services/instagramOAuth";
import { salvarTokenDaConta, vincularInstagram } from "./db";

const stateSecret = () => new TextEncoder().encode(ENV.cookieSecret || "selva-spaces-state");
const HUB = "/settings?painel=conexoes";

export async function assinarState(userId: number, accountId: number): Promise<string> {
  return new SignJWT({ uid: userId, aid: accountId, n: randomBytes(8).toString("hex") })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("10m")
    .sign(stateSecret());
}

export async function lerState(state: string): Promise<{ uid: number; aid: number } | null> {
  try {
    const { payload } = await jwtVerify(state, stateSecret());
    return typeof payload.uid === "number" && typeof payload.aid === "number"
      ? { uid: payload.uid, aid: payload.aid }
      : null;
  } catch {
    return null;
  }
}

export function registerSocialOAuthRoutes(app: Express) {
  // ── Início ────────────────────────────────────────────────────────────────
  app.get("/api/social/instagram/start", async (req: Request, res: Response) => {
    let user: { id: number; role?: string };
    try {
      user = (await sdk.authenticateRequest(req)) as { id: number; role?: string };
    } catch {
      return res.redirect(302, "/login");
    }
    // Mesma permissão da tela que oferece o botão. Sem esta conferência, a rota
    // seria uma porta lateral para quem não pode gerenciar conexões.
    if (!canManageContent(user.role)) return res.redirect(302, `${HUB}&instagram=sem_permissao`);
    if (!oauthConfigurado()) return res.redirect(302, `${HUB}&instagram=nao_configurado`);

    const accountId = Number(req.query.accountId);
    if (!Number.isInteger(accountId) || accountId <= 0) {
      return res.redirect(302, `${HUB}&instagram=cliente_invalido`);
    }
    return res.redirect(302, urlDeAutorizacao(await assinarState(user.id, accountId)));
  });

  // ── Retorno ───────────────────────────────────────────────────────────────
  app.get("/api/social/instagram/callback", async (req: Request, res: Response) => {
    const volta = (r: string) => res.redirect(302, `${HUB}&instagram=${r}`);

    // A própria Meta devolve erro aqui quando o usuário cancela — e cancelar não
    // é falha, é uma escolha. Vale um código próprio para a tela não gritar.
    if (req.query.error) {
      return volta(String(req.query.error_reason ?? "") === "user_denied" ? "cancelado" : "negado");
    }
    const code = typeof req.query.code === "string" ? req.query.code : "";
    const state = typeof req.query.state === "string" ? req.query.state : "";
    if (!code || !state) return volta("retorno_incompleto");

    const dados = await lerState(state);
    if (!dados) return volta("state_invalido");

    let sessao: { id: number; role?: string };
    try {
      sessao = (await sdk.authenticateRequest(req)) as { id: number; role?: string };
    } catch {
      return res.redirect(302, "/login");
    }
    // O state prova que ESTE servidor emitiu; a sessão prova que é a mesma
    // pessoa terminando o que começou.
    if (sessao.id !== dados.uid || !canManageContent(sessao.role)) return volta("state_invalido");

    try {
      const curto = await trocarCodePorToken(code);
      // Sem esta troca a conexão morre em ~1h — e morreria depois do usuário
      // já ter visto "conectado", que é a pior hora para descobrir.
      const longo = await trocarPorTokenLongo(curto);
      const expiresAt = longo.expiraEm ? new Date(Date.now() + longo.expiraEm * 1000) : null;

      await salvarTokenDaConta({
        accountId: dados.aid,
        token: longo.token,
        impressao: await impressaoDe(longo.token),
        instagramUserId: longo.instagramUserId,
        instagramUsername: null,
        escopos: longo.escopos,
        expiresAt,
        createdBy: sessao.id,
      });

      // O vínculo passa a apontar para esta fonte. Sem isto, a conexão existiria
      // no cofre e o cartão do cliente continuaria dizendo "token da agência".
      await vincularInstagram({
        accountId: dados.aid,
        pageId: null, pageName: null,
        instagramUserId: longo.instagramUserId,
        instagramUsername: null,
        tipoConta: "DESCONHECIDO",
        connectionSource: "oauth_conta",
      });

      logger.info(`[Social] OAuth concluído para cliente #${dados.aid}`);
      return volta("conectado");
    } catch (e) {
      // Detalhe só no log do servidor: mensagem da Meta em querystring acaba em
      // log de proxy e no histórico do navegador. A tela pede para Testar, e o
      // diagnóstico traz o texto sanitizado e copiável.
      logger.error(`[Social] OAuth falhou para cliente #${dados.aid}: ${(e as Error).message}`);
      return volta("erro_na_troca");
    }
  });
}
