import express, { type Express } from "express";
import fs from "fs";
import { type Server } from "http";
import { nanoid } from "nanoid";
import path from "path";
import { createServer as createViteServer } from "vite";
import viteConfig from "../../vite.config";

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  // Use process.cwd() to get the project root directory
  const distPath = path.resolve(process.cwd(), "dist", "public");
  if (!fs.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }

  const indexPath = path.resolve(distPath, "index.html");

  // Serve static assets (JS, CSS, images) with long cache (they have content hashes)
  app.use(express.static(distPath, {
    index: false,
    setHeaders: (res, _filePath) => {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    }
  }));

  // Redirecionar rotas protegidas para /login se não autenticado
  app.use((req, res, next) => {
    const publicPaths = ["/login", "/api/", "/assets/", "/favicon", "/r/"];
    const isPublic = publicPaths.some(p => req.path.startsWith(p));
    if (isPublic) return next();
    const cookieHeader = req.headers.cookie || "";
    const hasSession = cookieHeader.includes("app_session_id=");
    if (!hasSession) {
      return res.redirect(302, "/login");
    }
    if (req.path === "/") {
      return res.redirect(302, "/dashboard");
    }
    next();
  });

  // Serve index.html dynamically for all other routes (SPA fallback)
  // Read from disk every time to ensure latest build is served
  app.use("*", (_req, res) => {
    try {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      let html = fs.readFileSync(indexPath, "utf-8");
      html = html.replace("</head>", `<script>if('serviceWorker' in navigator){navigator.serviceWorker.getRegistrations().then(rs=>rs.forEach(r=>r.unregister()));}</script></head>`);
      res.status(200).set({
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        "CDN-Cache-Control": "no-store",
        "Cloudflare-CDN-Cache-Control": "no-store",
        "Surrogate-Control": "no-store",
        "Pragma": "no-cache",
        "Expires": "0",
      }).end(html);
    } catch (e) {
      res.status(500).send("Server error: could not load index.html");
    }
  });
}
