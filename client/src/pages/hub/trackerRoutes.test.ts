/**
 * Rotas internas do Tracker.
 *
 * Dois motivos para este teste existir:
 *  1. `?rota=` vira `src` de iframe. Se a allowlist falhar, dá para embutir um
 *     site de terceiro dentro do Spaces, com a sessão do usuário na tela.
 *  2. Os alertas em produção apontam para rotas cruas (/site?account=4&aba=…).
 *     Se o redirect perder a query, todo deep-link de alerta vira "Tracker
 *     genérico" silenciosamente — o alerta continua clicável e não leva a lugar
 *     nenhum, que é o pior tipo de quebra.
 */
import { describe, expect, it } from "vitest";
import { ehRotaInterna, rotaInternaSegura, urlDoShellPara, urlEmbutidaPara } from "./trackerRoutes";

/**
 * O callback do OAuth do Google Analytics volta para /tracker?rota=/ga4. Se a
 * rota não estiver na allowlist, o retorno cai em tela vazia depois do
 * consentimento — e o usuário não tem como saber se conectou ou não.
 */
describe("rota do Google Analytics", () => {
  it("/ga4 é rota interna válida", async () => {
    const { ehRotaInterna, rotaInternaSegura } = await import("./trackerRoutes");
    expect(ehRotaInterna("/ga4")).toBe(true);
    expect(rotaInternaSegura("/ga4")).toBe("/ga4");
  });
});

/** O item da sidebar e o deep-link /tracker?rota=/panorama dependem disto. */
describe("rota do Panorama de Sites", () => {
  it("/panorama é rota interna válida", () => {
    expect(ehRotaInterna("/panorama")).toBe(true);
    expect(rotaInternaSegura("/panorama")).toBe("/panorama");
  });
});

describe("deep-link de alerta", () => {
  it("preserva a query ao mandar para o shell", () => {
    expect(urlDoShellPara("/site", "?account=4&aba=seguranca")).toBe(
      "/tracker?account=4&aba=seguranca&rota=%2Fsite",
    );
  });

  it("devolve a query intacta ao iframe, sem o `rota`", () => {
    expect(urlEmbutidaPara("/site", "?account=4&aba=seguranca&rota=%2Fsite")).toBe(
      "/site?account=4&aba=seguranca",
    );
  });

  it("ida e volta preserva os parâmetros do alerta", () => {
    const shell = urlDoShellPara("/site", "?account=15&aba=uptime");
    const busca = shell.slice(shell.indexOf("?"));
    expect(urlEmbutidaPara(rotaInternaSegura("/site")!, busca)).toBe("/site?account=15&aba=uptime");
  });

  it("reconhece /clarity, para onde apontam os alertas antigos", () => {
    expect(ehRotaInterna("/clarity")).toBe(true);
  });
});

describe("`?rota=` não pode embutir conteúdo hostil", () => {
  it.each([
    ["URL absoluta", "https://exemplo.com"],
    ["protocolo-relativa", "//exemplo.com"],
    ["javascript:", "javascript:alert(1)"],
    ["data:", "data:text/html,<script></script>"],
    ["path traversal", "/../../etc/passwd"],
    ["rota do Spaces fora do Tracker", "/finance"],
    ["rota inexistente", "/nao-existe"],
    ["vazio", ""],
    ["nulo", null],
  ])("bloqueia %s", (_nome, valor) => {
    expect(rotaInternaSegura(valor)).toBeNull();
  });

  it("aceita rota interna legítima", () => {
    expect(rotaInternaSegura("/site")).toBe("/site");
    expect(rotaInternaSegura("/experiments/42")).toBe("/experiments/42");
  });

  it("descarta query embutida no próprio parâmetro", () => {
    expect(rotaInternaSegura("/site?x=1")).toBe("/site");
  });
});

describe("flyout por cliente", () => {
  it("leva o slug até dentro do iframe", () => {
    expect(urlEmbutidaPara("/tracker", "?client=aika")).toBe("/tracker?client=aika");
  });

  it("não pendura '?' quando não há query", () => {
    expect(urlEmbutidaPara("/tracker", "")).toBe("/tracker");
  });

  // Cadeia completa do clique: sidebar → shell → iframe. O destino é /dashboard
  // (a Visão Geral do cliente) e não a raiz do Tracker, que é o seletor de
  // portfólio — abrir lá com cliente escolhido não mostraria o cliente.
  it("clicar num cliente abre o /dashboard dele dentro do iframe", () => {
    const shell = urlDoShellPara("/dashboard", "?client=aika");
    expect(shell).toBe("/tracker?client=aika&rota=%2Fdashboard");

    const busca = shell.slice(shell.indexOf("?"));
    const rota = rotaInternaSegura(new URLSearchParams(busca).get("rota"));
    expect(rota).toBe("/dashboard");
    expect(urlEmbutidaPara(rota!, busca)).toBe("/dashboard?client=aika");
  });
});

describe("fronteira Spaces × Tracker", () => {
  it.each(["/finance", "/contracts", "/people", "/notificacoes", "/access", "/spaces", "/", "/reports"])(
    "%s não é rota interna do Tracker",
    (rota) => {
      expect(ehRotaInterna(rota)).toBe(false);
    },
  );
});
