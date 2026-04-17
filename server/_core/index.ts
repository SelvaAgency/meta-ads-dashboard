import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { startAutoSync } from "../autoSync";
import { registerDashboardBuilderRoutes } from "../dashboardBuilderRoutes";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  // Dashboard Builder — upload de imagens
  registerDashboardBuilderRoutes(app);
  // Debug endpoint - raw Meta API diagnostic
  app.get('/api/debug-ads/:id', async (req, res) => {
    try {
      const { getMetaAdAccountById } = await import('../db');
      const id = parseInt(req.params.id);
      const account = await getMetaAdAccountById(id);
      if (!account) return res.json({ error: 'Account not found', id });
      
      const metaId = account.accountId;
      const token = account.accessToken;
      
      // Raw call to Meta API for ads
      const adsUrl = `https://graph.facebook.com/v21.0/act_${metaId}/ads?access_token=${token}&fields=id,name,campaign_id,status,effective_status&limit=5`;
      const adsResp = await fetch(adsUrl);
      const adsData = await adsResp.json();
      
      // Raw call for campaigns
      const campUrl = `https://graph.facebook.com/v21.0/act_${metaId}/campaigns?access_token=${token}&fields=id,name,status&limit=5`;
      const campResp = await fetch(campUrl);
      const campData = await campResp.json();
      
      res.json({
        internalId: id,
        metaAccountId: metaId,
        tokenPrefix: token?.substring(0, 20) + '...',
        adsApiResponse: adsData,
        campaignsApiResponse: campData,
      });
    } catch (e: any) {
      res.json({ error: e.message });
    }
  });

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
    // Start daily auto-sync cron job (06:00 Brasília time = 09:00 UTC)
    startAutoSync();
  });
}

startServer().catch(console.error);
