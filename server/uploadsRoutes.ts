/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Uploads — rotas HTTP multipart (avatar + SelvaTV)
 * ─────────────────────────────────────────────────────────────────────────────
 *  tRPC não lida bem com multipart, então o BINÁRIO sobe por estas rotas
 *  Express. Autenticação pela sessão (nunca por userId do frontend); validação
 *  de tipo/tamanho; arquivo guardado no storage S3-compatible (nunca no
 *  filesystem efêmero). Sem storage configurado → 503 com mensagem segura.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import type { Express, Request, Response } from "express";
import multer from "multer";
import { sdk } from "./_core/sdk";
import { canManageContent } from "@shared/permissions";
import { isStorageConfigured, uploadImage, getReadUrl, deleteObject, MAX_IMAGE_BYTES } from "./storage/storageService";
import { getUserById, updateUserAvatar } from "./db";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_IMAGE_BYTES } });

export function registerUploadRoutes(app: Express) {
  // ── Avatar do próprio usuário ────────────────────────────────────────────────
  app.post("/api/uploads/avatar", (req: Request, res: Response) => {
    upload.single("file")(req, res, async (err: unknown) => {
      if (err) return res.status(400).json({ error: "Falha no upload (arquivo muito grande?)." });
      let user;
      try {
        user = await sdk.authenticateRequest(req);
      } catch {
        return res.status(401).json({ error: "Não autenticado." });
      }
      if (!isStorageConfigured()) return res.status(503).json({ error: "Upload indisponível: storage não configurado." });
      if (!req.file) return res.status(400).json({ error: "Arquivo ausente." });
      try {
        const key = await uploadImage(req.file.buffer, req.file.mimetype, `avatars/${user.id}`);
        const previous = (await getUserById(user.id))?.avatarKey ?? null;
        await updateUserAvatar(user.id, key);
        if (previous && previous !== key) deleteObject(previous); // remove foto antiga
        return res.json({ avatarUrl: await getReadUrl(key) });
      } catch (e: any) {
        return res.status(400).json({ error: e?.message ?? "Falha no upload." });
      }
    });
  });

  // ── Imagem da SelvaTV (admin + developer) ────────────────────────────────────
  app.post("/api/uploads/selvatv", (req: Request, res: Response) => {
    upload.single("file")(req, res, async (err: unknown) => {
      if (err) return res.status(400).json({ error: "Falha no upload (arquivo muito grande?)." });
      let user;
      try {
        user = await sdk.authenticateRequest(req);
      } catch {
        return res.status(401).json({ error: "Não autenticado." });
      }
      if (!canManageContent(user.role)) return res.status(403).json({ error: "Sem permissão." });
      if (!isStorageConfigured()) return res.status(503).json({ error: "Upload indisponível: storage não configurado." });
      if (!req.file) return res.status(400).json({ error: "Arquivo ausente." });
      try {
        const key = await uploadImage(req.file.buffer, req.file.mimetype, "selvatv");
        return res.json({ imageKey: key, url: await getReadUrl(key) });
      } catch (e: any) {
        return res.status(400).json({ error: e?.message ?? "Falha no upload." });
      }
    });
  });
}
