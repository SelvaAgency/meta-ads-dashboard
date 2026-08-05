/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Todo destino interno tem rota registrada
 * ─────────────────────────────────────────────────────────────────────────────
 *  Este teste existe por causa de um bug real: três botões escritos "Conectar
 *  conta" (Dashboard ×2, Campanhas ×1) chamavam `navigate("/connect")`, e
 *  `/connect` nunca foi registrada em App.tsx. Clicar caía no 404.
 *
 *  O que torna esse bug caro é como ele se DISFARÇA. O sintoma — "não consigo
 *  adicionar uma conta nova" — parece permissão, e foi assim que chegou. Passei
 *  por 90 procedures admin-only, dois routers e quatro telas atrás de um gate
 *  que não existia, porque o caminho estava quebrado para todo mundo, admin
 *  inclusive.
 *
 *  O compilador não vê isso: `navigate("/connect")` é uma string válida, e o
 *  wouter simplesmente não casa nenhuma rota e cai no fallback. Só clicando.
 *
 *  Ler o fonte é grosseiro e é de propósito: é a única forma de cruzar o que a
 *  aplicação OFERECE com o que ela REGISTRA.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const RAIZ = join(__dirname, "..", "..");
const APP = join(RAIZ, "client", "src", "App.tsx");

/** Rotas declaradas em App.tsx, com `:param` virando curinga de um segmento. */
function rotasRegistradas(): RegExp[] {
  const fonte = readFileSync(APP, "utf8");
  const paths = Array.from(fonte.matchAll(/path="([^"]+)"/g)).map((m) => m[1]);
  expect(paths.length, "nenhuma rota lida — o formato de App.tsx mudou").toBeGreaterThan(10);
  return paths.map((p) => new RegExp(`^${p.replace(/:[^/]+/g, "[^/]+")}$`));
}

function arquivosTsx(dir: string, acc: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) arquivosTsx(caminho, acc);
    else if (nome.endsWith(".tsx")) acc.push(caminho);
  }
  return acc;
}

/**
 * Destinos internos escritos como LITERAL. Template literal com `${}` fica de
 * fora: o valor só existe em tempo de execução, e um teste que chutasse o
 * resultado daria falso negativo — pior que não testar.
 */
function destinosInternos(): { arquivo: string; destino: string }[] {
  const out: { arquivo: string; destino: string }[] = [];
  for (const arquivo of arquivosTsx(join(RAIZ, "client", "src"))) {
    const fonte = readFileSync(arquivo, "utf8");
    const achados = [
      ...fonte.matchAll(/navigate\(\s*"(\/[^"?#]*)[^"]*"/g),
      ...fonte.matchAll(/(?:href|to)=\{?\s*"(\/[^"?#]*)[^"]*"/g),
    ];
    for (const m of achados) {
      const destino = m[1];
      // `/api/...` é do servidor Express, não do roteador do cliente.
      if (destino.startsWith("/api/")) continue;
      out.push({ arquivo: arquivo.slice(RAIZ.length + 1), destino });
    }
  }
  return out;
}

describe("navegação interna", () => {
  it("encontra destinos suficientes para o teste valer", () => {
    expect(destinosInternos().length).toBeGreaterThan(15);
  });

  it("todo destino literal corresponde a uma rota registrada", () => {
    const rotas = rotasRegistradas();
    const orfaos = destinosInternos()
      .filter(({ destino }) => destino !== "/" && !rotas.some((r) => r.test(destino)))
      .map(({ arquivo, destino }) => `${destino}  ← ${arquivo}`);

    expect(
      Array.from(new Set(orfaos)),
      "estes destinos caem no 404 — a tela oferece um caminho que não existe",
    ).toEqual([]);
  });

  /** A rota que originou o teste: some de novo e os três botões voltam a morrer. */
  it("/connect continua registrada — três botões dependem dela", () => {
    expect(rotasRegistradas().some((r) => r.test("/connect"))).toBe(true);
  });
});
