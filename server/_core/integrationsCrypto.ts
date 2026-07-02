/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Criptografia de tokens de integração (AES-256-GCM)
 * ─────────────────────────────────────────────────────────────────────────────
 *  Tokens OAuth (access/refresh) NUNCA são guardados em texto. Aqui ciframos
 *  antes de salvar e deciframos só no servidor, na hora de chamar a API.
 *  A chave vem de INTEGRATIONS_ENCRYPTION_KEY (env). Sem chave → integrações
 *  ficam indisponíveis (o app não quebra).
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";
import { ENV } from "./env";

export function isEncryptionConfigured(): boolean {
  return ENV.integrationsEncryptionKey.length >= 16;
}

// Deriva uma chave de 32 bytes a partir do segredo do env (determinístico).
function key(): Buffer {
  return createHash("sha256").update(ENV.integrationsEncryptionKey).digest();
}

/** Retorna "ivB64.tagB64.cipherB64". */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${enc.toString("base64")}`;
}

export function decryptSecret(payload: string): string {
  const [ivB64, tagB64, cipherB64] = payload.split(".");
  if (!ivB64 || !tagB64 || !cipherB64) throw new Error("Payload cifrado inválido");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(cipherB64, "base64")), decipher.final()]).toString("utf8");
}
