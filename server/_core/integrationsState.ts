/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  State CSRF para fluxos de integração (JWT curto assinado)
 * ─────────────────────────────────────────────────────────────────────────────
 *  Vincula o início da autorização ao usuário logado. O callback valida o state
 *  E confere que a sessão é do mesmo usuário. Usado pelo Trello (a rota do
 *  Google Calendar mantém seu próprio helper local — sem alteração lá).
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { SignJWT, jwtVerify } from "jose";
import { randomBytes } from "node:crypto";
import { ENV } from "./env";

const secret = () => new TextEncoder().encode(ENV.cookieSecret || "selva-spaces-state");

export async function signIntegrationState(userId: number): Promise<string> {
  return new SignJWT({ uid: userId, n: randomBytes(8).toString("hex") })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("10m")
    .sign(secret());
}

export async function verifyIntegrationState(state: string): Promise<number | null> {
  try {
    const { payload } = await jwtVerify(state, secret());
    return typeof payload.uid === "number" ? payload.uid : null;
  } catch {
    return null;
  }
}
