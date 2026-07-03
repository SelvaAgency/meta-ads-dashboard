/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Storage — camada isolada S3-compatible (avatares + SelvaTV)
 * ─────────────────────────────────────────────────────────────────────────────
 *  Guarda arquivos em um bucket S3-compatible (AWS S3, Cloudflare R2, MinIO…).
 *  Nunca no filesystem efêmero do container, nunca base64 no banco.
 *
 *  Sem storage configurado → isStorageConfigured() = false e o app segue no ar
 *  (uploads ficam indisponíveis com mensagem segura). Nada de credencial no
 *  código; tudo por env. Nenhum dado sensível é logado.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "node:crypto";
import { ENV } from "../_core/env";

// MIME → extensão. SVG e vídeo NÃO são permitidos. GIF é aceito (banners
// animados na SELVA TV); GIFs muito pesados podem impactar performance, mas o
// limite de 5 MB é mantido.
export const IMAGE_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

export function isStorageConfigured(): boolean {
  return !!(ENV.s3Bucket && ENV.s3AccessKeyId && ENV.s3SecretAccessKey);
}

let _client: S3Client | null = null;
function client(): S3Client {
  if (!_client) {
    _client = new S3Client({
      region: ENV.s3Region || "auto",
      endpoint: ENV.s3Endpoint || undefined,
      forcePathStyle: ENV.s3ForcePathStyle,
      credentials: { accessKeyId: ENV.s3AccessKeyId, secretAccessKey: ENV.s3SecretAccessKey },
    });
  }
  return _client;
}

export function validateImageFile(mime: string, size: number): { ok: boolean; ext?: string; error?: string } {
  const ext = IMAGE_EXT[mime];
  if (!ext) return { ok: false, error: "Formato inválido. Use JPG, PNG ou WEBP." };
  if (size > MAX_IMAGE_BYTES) return { ok: false, error: "Arquivo muito grande (máx. 5 MB)." };
  return { ok: true, ext };
}

/** Sobe a imagem e devolve a KEY do objeto (nome único, sem confiar no original). */
export async function uploadImage(buffer: Buffer, mime: string, prefix: string): Promise<string> {
  const v = validateImageFile(mime, buffer.length);
  if (!v.ok) throw new Error(v.error);
  const key = `${prefix}/${randomUUID()}.${v.ext}`;
  await client().send(
    new PutObjectCommand({
      Bucket: ENV.s3Bucket,
      Key: key,
      Body: buffer,
      ContentType: mime,
      CacheControl: "public, max-age=31536000",
    }),
  );
  return key;
}

/**
 * URL de leitura para uma key. Bucket público (S3_PUBLIC_BASE_URL) → URL direta;
 * caso contrário → URL assinada (privado) válida por 1h.
 */
export async function getReadUrl(key: string): Promise<string> {
  if (!key) return "";
  if (ENV.s3PublicBaseUrl) return `${ENV.s3PublicBaseUrl.replace(/\/+$/, "")}/${key}`;
  return getSignedUrl(client(), new GetObjectCommand({ Bucket: ENV.s3Bucket, Key: key }), { expiresIn: 3600 });
}

export async function deleteObject(key: string): Promise<void> {
  if (!key) return;
  try {
    await client().send(new DeleteObjectCommand({ Bucket: ENV.s3Bucket, Key: key }));
  } catch {
    /* best-effort — limpeza não deve quebrar o fluxo */
  }
}
