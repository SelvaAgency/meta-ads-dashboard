/**
 * dashboardBuilderRoutes.ts — Rota Express para upload de imagens do Dashboard Builder.
 * Módulo independente — não interfere com nenhuma funcionalidade existente.
 */
import type { Router } from "express";
import { storagePut } from "./storage";
import multer, { type FileFilterCallback } from "multer";
import type { Request } from "express";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 16 * 1024 * 1024 }, // 16MB
  fileFilter: (_req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Apenas imagens são aceitas"));
    }
  },
});

export function registerDashboardBuilderRoutes(app: Router) {
  // POST /api/dashboard-builder/upload
  app.post(
    "/api/dashboard-builder/upload",
    upload.single("file"),
    async (req, res) => {
      try {
        const file = (req as any).file as Express.Multer.File | undefined;
        if (!file) {
          return res.status(400).json({ message: "Nenhum arquivo enviado" });
        }

        const ext = file.originalname.split(".").pop() ?? "jpg";
        const fileKey = `dashboard-builder/uploads/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { url } = await storagePut(fileKey, file.buffer, file.mimetype);

        return res.json({ url });
      } catch (err: any) {
        console.error("[DashboardBuilder] Upload error:", err);
        return res.status(500).json({ message: err?.message ?? "Erro no upload" });
      }
    }
  );
}
