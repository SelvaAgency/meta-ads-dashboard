import { defineConfig } from "vitest/config";
import path from "path";

const templateRoot = path.resolve(import.meta.dirname);

export default defineConfig({
  root: templateRoot,
  resolve: {
    alias: {
      "@": path.resolve(templateRoot, "client", "src"),
      "@shared": path.resolve(templateRoot, "shared"),
      "@assets": path.resolve(templateRoot, "attached_assets"),
    },
  },
  test: {
    environment: "node",
    // client/ entra aqui para a lógica pura (rotas, formatação) ser testável.
    // Componentes precisariam de jsdom — quando houver, criar um projeto à parte.
    // `shared/` também: é onde vivem as regras que servidor e cliente compartilham
    // (matriz de papéis, classificação de fontes). Ficavam fora da suíte.
    include: ["server/**/*.test.ts", "server/**/*.spec.ts", "client/**/*.test.ts", "shared/**/*.test.ts"],
  },
});
