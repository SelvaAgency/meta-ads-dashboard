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
import {
  destinoDeConexoes, ehRotaInterna, pediuConexoes, rotaInternaSegura, urlDoShellPara,
  urlEmbutidaPara,
} from "./trackerRoutes";

/**
 * O callback do OAuth do Google volta para /tracker?rota=… . Se a rota não
 * estiver na allowlist, o retorno cai em tela vazia depois do consentimento —
 * e o usuário não tem como saber se conectou ou não.
 *
 * Hoje o callback aponta para /settings (onde o hub de Conexões vive), mas
 * /ga4 e /google-ads continuam na allowlist: há links salvos apontando para
 * elas, e quem chega lá é levado a Conexões em vez de tomar 404.
 */
describe("rotas de conexão", () => {
  it.each(["/settings", "/conexoes", "/ga4", "/google-ads", "/lojas"])(
    "%s é rota interna válida",
    (rota) => {
      expect(ehRotaInterna(rota)).toBe(true);
      expect(rotaInternaSegura(rota)).toBe(rota);
    },
  );
});

/** O item da sidebar e o deep-link /tracker?rota=/panorama dependem disto. */
describe("rota do Panorama de Sites", () => {
  it("/panorama é rota interna válida", () => {
    expect(ehRotaInterna("/panorama")).toBe(true);
    expect(rotaInternaSegura("/panorama")).toBe("/panorama");
  });
});

/**
 * Google Ads, Google Analytics e Lojas saíram do menu — o que elas faziam vive
 * no hub de Conexões. As rotas continuam existindo só para redirecionar.
 *
 * O caso que este bloco protege é o do TOPO: /settings no topo renderiza as
 * configurações do PORTAL, não as do Tracker. Um redirect ingênuo para
 * /settings entregaria a tela errada com ar de acerto — o pior tipo de quebra,
 * porque parece ter funcionado. Por isso, fora do iframe, o destino tem que
 * passar pelo shell.
 */
describe("rotas aposentadas de conexão → hub de Conexões", () => {
  it("dentro do iframe navega direto para o painel", () => {
    expect(destinoDeConexoes("", true)).toBe("/settings?painel=conexoes");
  });

  it("no topo passa pelo shell — /settings solto seria o portal, não o Tracker", () => {
    expect(destinoDeConexoes("", false)).toBe("/tracker?painel=conexoes&rota=%2Fsettings");
  });

  it("preserva a query do link antigo (?account=) nos dois casos", () => {
    expect(destinoDeConexoes("?account=4", true)).toBe("/settings?account=4&painel=conexoes");
    expect(destinoDeConexoes("?account=4", false)).toBe(
      "/tracker?account=4&painel=conexoes&rota=%2Fsettings",
    );
  });

  /** O `?conectado=1` do retorno do OAuth do Google não pode se perder. */
  it("preserva o ?conectado=1 do retorno do OAuth", () => {
    expect(destinoDeConexoes("?conectado=1", true)).toBe("/settings?conectado=1&painel=conexoes");
  });

  /** `rota=` é instrução do shell; repassá-la ao app de dentro é lixo na URL. */
  it("descarta o `rota=` ao entrar no iframe", () => {
    expect(destinoDeConexoes("?rota=%2Fga4&conectado=1", true)).toBe(
      "/settings?conectado=1&painel=conexoes",
    );
  });

  /**
   * Cadeia COMPLETA do topo até o que o iframe carrega — é o percurso real de
   * quem digita /ga4 na barra de endereço ou volta do consentimento do Google.
   */
  it("do topo até o iframe, a tela final é Conexões expandido", () => {
    const noTopo = destinoDeConexoes("?conectado=1", false);
    expect(noTopo).toBe("/tracker?conectado=1&painel=conexoes&rota=%2Fsettings");

    const busca = noTopo.slice(noTopo.indexOf("?"));
    const rota = rotaInternaSegura(new URLSearchParams(busca).get("rota"));
    expect(rota).toBe("/settings"); // fora da allowlist, o iframe cairia no Tracker genérico

    const src = urlEmbutidaPara(rota!, busca);
    expect(src).toBe("/settings?conectado=1&painel=conexoes");
    // …e a tela que carrega nessa URL abre o hub expandido. Fechar a cadeia
    // aqui é o que impede o par escrever/ler de divergir em silêncio.
    expect(pediuConexoes(src.slice(src.indexOf("?")))).toBe(true);
  });

  it("Configurações aberta por conta própria NÃO abre o hub sozinha", () => {
    expect(pediuConexoes("")).toBe(false);
    expect(pediuConexoes("?account=4")).toBe(false);
    expect(pediuConexoes("?painel=outro")).toBe(false);
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
