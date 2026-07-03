/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Cofre de Acessos — criptografia de credenciais (AES-256-GCM)
 * ─────────────────────────────────────────────────────────────────────────────
 *  Senhas de acessos NUNCA são guardadas em texto puro. Usa uma chave PRÓPRIA
 *  (ACCESS_SECRETS_ENCRYPTION_KEY), separada da usada para tokens de integração.
 *  Só descriptografa no servidor, sob demanda (revelar/copiar). Sem chave →
 *  o cofre fica indisponível para gravar/ler senhas (o app não quebra).
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";
import { ENV } from "./env";

export function isAccessCryptoConfigured(): boolean {
  return ENV.accessSecretsEncryptionKey.length >= 16;
}

function key(): Buffer {
  return createHash("sha256").update(ENV.accessSecretsEncryptionKey).digest();
}

/** Retorna "ivB64.tagB64.cipherB64". */
export function encryptAccessSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${enc.toString("base64")}`;
}

export function decryptAccessSecret(payload: string): string {
  const [ivB64, tagB64, cipherB64] = payload.split(".");
  if (!ivB64 || !tagB64 || !cipherB64) throw new Error("Payload cifrado inválido");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(cipherB64, "base64")), decipher.final()]).toString("utf8");
}
