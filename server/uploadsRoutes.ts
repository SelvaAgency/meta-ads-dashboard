/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Uploads — rotas HTTP multipart (avatar + SelvaTV + foto do cliente)
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
import { isStorageConfigured, uploadImage, uploadComprovante, getReadUrl, deleteObject, MAX_IMAGE_BYTES } from "./storage/storageService";
import {
  getUserById, updateUserAvatar, getMetaAdAccountById, updateAccountPictureKey,
  getAccessClientById, updateAccessClient,
} from "./db";

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

  // ── Comprovante de reembolso (qualquer colaborador autenticado) ─────────────
  // Aceita PDF além de imagem: nota fiscal chega por e-mail em PDF. O arquivo
  // vai para uma pasta por usuário, e a KEY volta para a tela — quem amarra a
  // key à solicitação é o tRPC, que confere o dono.
  app.post("/api/uploads/comprovante", (req: Request, res: Response) => {
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
        const key = await uploadComprovante(req.file.buffer, req.file.mimetype, `comprovantes/${user.id}`);
        return res.json({ key, url: await getReadUrl(key) });
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

  // ── Foto do cliente (conta do Tracker) — admin + developer ──────────────────
  // Grava em `pictureKey`, não em `pictureUrl`: a segunda vem da Meta e é
  // reescrita a cada import de contas. A foto escolhida pelo time tem que
  // sobreviver a isso, então mora em coluna própria e ganha na hora de exibir.
  app.post("/api/uploads/account-picture", (req: Request, res: Response) => {
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

      const accountId = Number(req.body?.accountId);
      if (!Number.isInteger(accountId) || accountId <= 0) {
        return res.status(400).json({ error: "Cliente inválido." });
      }
      // Confere que a conta existe ANTES de subir o arquivo: sem isto, um id
      // torto deixaria um objeto órfão no bucket que ninguém viria limpar.
      const conta = await getMetaAdAccountById(accountId);
      if (!conta) return res.status(404).json({ error: "Cliente não encontrado." });

      try {
        const key = await uploadImage(req.file.buffer, req.file.mimetype, `clientes/${accountId}`);
        const anterior = conta.pictureKey ?? null;
        await updateAccountPictureKey(accountId, key);
        if (anterior && anterior !== key) deleteObject(anterior); // remove a foto antiga
        return res.json({ pictureUrl: await getReadUrl(key) });
      } catch (e: any) {
        return res.status(400).json({ error: e?.message ?? "Falha no upload." });
      }
    });
  });

  // ── Foto do cliente do COFRE de acessos — admin + developer ─────────────────
  // Entidade diferente da conta do Tracker, e por isso foto própria: "Santé" e
  // "Carol Garrafa" são dois clientes aqui e uma única conta de mídia lá, e há
  // cliente com acesso guardado que nunca teve acompanhamento no Tracker.
  app.post("/api/uploads/access-client-picture", (req: Request, res: Response) => {
    upload.single("file")(req, res, async (err: unknown) => {
      if (err) return res.status(400).json({ error: "Falha no upload (arquivo muito grande?)." });
      let user;
      try {
        user = await sdk.authenticateRequest(req);
      } catch {
        return res.status(401).json({ error: "Não autenticado." });
      }
      // Mesmo nível de quem cria/edita cliente no cofre (contentProcedure).
      if (!canManageContent(user.role)) return res.status(403).json({ error: "Sem permissão." });
      if (!isStorageConfigured()) return res.status(503).json({ error: "Upload indisponível: storage não configurado." });
      if (!req.file) return res.status(400).json({ error: "Arquivo ausente." });

      const accessClientId = Number(req.body?.accessClientId);
      if (!Number.isInteger(accessClientId) || accessClientId <= 0) {
        return res.status(400).json({ error: "Cliente inválido." });
      }
      // Confere que o cliente existe ANTES de subir: id torto deixaria um objeto
      // órfão no bucket que ninguém viria limpar.
      const cliente = await getAccessClientById(accessClientId);
      if (!cliente) return res.status(404).json({ error: "Cliente não encontrado." });

      try {
        const key = await uploadImage(req.file.buffer, req.file.mimetype, `acessos/${accessClientId}`);
        const anterior = cliente.pictureKey ?? null;
        await updateAccessClient(accessClientId, { pictureKey: key, updatedByUserId: user.id });
        if (anterior && anterior !== key) deleteObject(anterior);
        return res.json({ pictureUrl: await getReadUrl(key) });
      } catch (e: any) {
        return res.status(400).json({ error: e?.message ?? "Falha no upload." });
      }
    });
  });
}
