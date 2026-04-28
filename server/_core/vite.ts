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
        "../../client",
        "index.html"
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      
      // CRITICAL: Force correct bundle hash to prevent CDN serving old JS
      // Replace any index-*.js reference with the correct hash
      template = template.replace(/index-[A-Za-z0-9]+\.js/g, 'index-BlSX4MWa.js');
      
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      
      // CRITICAL: Force no-cache headers to prevent CDN caching stale HTML
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader('Surrogate-Control', 'no-store');
      res.setHeader('ETag', `"${Date.now()}"`);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  // Use process.cwd() to get the project root directory
  const distPath = path.resolve(process.cwd(), "dist", "client");
  if (!fs.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }

  // CRITICAL: Force filesystem read for ALL HTML requests
  // This bypasses express.static caching and forces fresh read from disk
  // MUST be before express.static middleware
  app.use((req, res, next) => {
    const isHtmlRoute = req.path === "/" || 
                       req.path === "/index.html" || 
                       req.path.startsWith("/dashboard") ||
                       req.path.startsWith("/campaigns") ||
                       req.path.startsWith("/anomalies") ||
                       req.path.startsWith("/alerts") ||
                       req.path.startsWith("/suggestions") ||
                       req.path.startsWith("/reports") ||
                       req.path.startsWith("/google-ads");
    
    if (isHtmlRoute) {
      try {
        const indexPath = path.resolve(distPath, "index.html");
        // FORCE read from filesystem every time - no caching
        let html = fs.readFileSync(indexPath, "utf-8");
        
        // CRITICAL: Replace old JS hash with new one to force CDN fetch
        // This makes browser request the new JS that CDN hasn't cached yet
        html = html.replace(/index-[a-zA-Z0-9]+\.js/g, 'index-BlSX4MWa.js');
        
        // Set AGGRESSIVE no-cache headers
        // These tell CDN/proxies to NOT cache this response
        res.set({
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
          "Pragma": "no-cache",
          "Expires": "0",
          "Surrogate-Control": "no-store",
          "ETag": `"${Date.now()}"`,
          "Last-Modified": new Date().toUTCString(),
        });
        
        res.set("Content-Type", "text/html; charset=utf-8");
        res.send(html);
        return;
      } catch (err) {
        console.error("Error reading index.html:", err);
        next();
      }
    }
    next();
  });

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req, res) => {
    try {
      const indexPath = path.resolve(distPath, "index.html");
      // FORCE read from filesystem every time
      let html = fs.readFileSync(indexPath, "utf-8");
      
      // CRITICAL: Replace old JS hash with new one to force CDN fetch
      // This makes browser request the new JS that CDN hasn't cached yet
      html = html.replace(/index-[a-zA-Z0-9]+\.js/g, 'index-BlSX4MWa.js');
      
      res.set({
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
        "Pragma": "no-cache",
        "Expires": "0",
        "Surrogate-Control": "no-store",
        "ETag": `"${Date.now()}"`,
        "Last-Modified": new Date().toUTCString(),
      });
      
      res.set("Content-Type", "text/html; charset=utf-8");
      res.send(html);
    } catch (err) {
      console.error("Error reading index.html:", err);
      res.status(500).send("Internal Server Error");
    }
  });
}
