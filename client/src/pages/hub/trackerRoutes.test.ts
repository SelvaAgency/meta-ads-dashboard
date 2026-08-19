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
import { readFileSync } from "node:fs";
import {
  ROTAS_INTERNAS, destinoDeConexoes, destinoDeInternaAposentada, ehRotaInterna,
  pediuConexoes, rotaInternaSegura,
  urlDoShellPara, urlEmbutidaPara,
} from "./trackerRoutes";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  A allowlist e o App.tsx precisam contar a mesma história
 * ─────────────────────────────────────────────────────────────────────────────
 *  Este teste nasceu de um bug real: `/rascunho` foi registrada em `App.tsx`
 *  dentro de `<Interna>` e esquecida aqui. O efeito é a pior forma de quebra —
 *  SILENCIOSA. `Interna` manda para o shell, o shell chama `rotaInternaSegura`,
 *  não encontra a rota, devolve `null`, e quem digitou o endereço cai no Tracker
 *  genérico. Nenhum erro no console, nenhuma tela de "não encontrado": só a
 *  página errada, como se fosse o comportamento normal.
 *
 *  A duplicação entre os dois arquivos é proposital — a allowlist existe para
 *  impedir que `?rota=` vire `src` de iframe apontando para fora do domínio, e
 *  derivá-la automaticamente das rotas do App a esvaziaria. Então elas ficam
 *  separadas, e é este teste que as mantém em acordo.
 * ─────────────────────────────────────────────────────────────────────────────
 */
describe("toda rota interna do App está na allowlist", () => {
  const app = readFileSync(new URL("../../App.tsx", import.meta.url), "utf-8");

  /** As rotas que renderizam dentro de `<Interna>` — as cruas do Tracker. */
  const internasDoApp = Array.from(
    app.matchAll(/<Route\s+path="([^"]+)"[^>]*?component=\{\(\)\s*=>\s*<Interna>/g),
  ).map((m) => m[1]);

  it("o App tem rotas internas, senão o teste não está lendo nada", () => {
    expect(internasDoApp.length).toBeGreaterThan(3);
  });

  it("nenhuma rota interna ficou de fora da allowlist", () => {
    for (const rota of internasDoApp) {
      expect(ehRotaInterna(rota), `${rota} está em App.tsx e não na allowlist — cai no Tracker genérico, calada`)
        .toBe(true);
    }
  });

  /** O caso que motivou tudo. */
  it("/rascunho é interna", () => {
    expect(ehRotaInterna("/rascunho")).toBe(true);
    expect(rotaInternaSegura("/rascunho")).toBe("/rascunho");
    expect(urlDoShellPara("/rascunho", "")).toBe("/tracker?rota=%2Frascunho");
  });

  /** A allowlist continua fechada: acesso não se resolve abrindo ela. */
  it("a allowlist não virou passe livre", () => {
    expect(rotaInternaSegura("https://exemplo.com")).toBeNull();
    expect(rotaInternaSegura("//exemplo.com")).toBeNull();
    expect(rotaInternaSegura("/rascunho-falso")).toBeNull();
    expect(ROTAS_INTERNAS.length).toBeLessThan(30);
  });
});

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

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  `/consumo-ia` é rota de primeiro nível, e precisa continuar sendo
 * ─────────────────────────────────────────────────────────────────────────────
 *  Ela nasceu interna e herdou a URL `/tracker?rota=%2Fconsumo-ia`. Não é
 *  página do Tracker: não tem conta ativa, não usa seletor de cliente e fala do
 *  gasto do próprio Spaces — é irmã de Colaboradores e Contratos.
 *
 *  A regressão tem duas portas, e as duas são silenciosas:
 *    1. alguém repõe `/consumo-ia` na allowlist  → o redirect volta
 *    2. alguém reveste a rota com `<Interna>`     → idem
 *  Nenhuma das duas dá erro na tela: dá o Tracker genérico.
 * ─────────────────────────────────────────────────────────────────────────────
 */
describe("Consumo de IA tem URL própria", () => {
  const app = () => readFileSync(new URL("../../App.tsx", import.meta.url), "utf-8");

  it("não está na allowlist — é ela que dispara o redirect para o shell", () => {
    expect(ehRotaInterna("/consumo-ia")).toBe(false);
    expect(rotaInternaSegura("/consumo-ia")).toBeNull();
  });

  it("a rota existe em App.tsx e NÃO está dentro de <Interna>", () => {
    const s = app();
    expect(s).toContain('<Route path="/consumo-ia"');
    expect(s).not.toMatch(/<Route\s+path="\/consumo-ia"[^>]*?component=\{\(\)\s*=>\s*<Interna>/);
  });

  /** A guarda mudou de lugar; ela não pode ter afrouxado. */
  it("continua restrita a admin e developer", () => {
    const s = app();
    const rota = s.slice(s.indexOf('<Route path="/consumo-ia"'));
    expect(rota.slice(0, 200)).toContain("<AdminOuDevOnly>");
  });

  it("a sidebar aponta para a rota real, sem query", () => {
    const sidebar = readFileSync(new URL("./HubSidebar.tsx", import.meta.url), "utf-8");
    expect(sidebar).toContain('href: "/consumo-ia"');
    expect(sidebar).not.toContain("rota=%2Fconsumo-ia");
    expect(sidebar).not.toContain("rota=/consumo-ia");
  });

  it("a página usa a casca do Spaces, e não a do Tracker", () => {
    // `MetaDashboardLayout` traz seletor de cliente e navegação do Tracker —
    // cromo de um produto que esta página não usa. É ele que a obrigava a
    // viver dentro do iframe.
    const pagina = readFileSync(new URL("../ConsumoIA.tsx", import.meta.url), "utf-8");
    expect(pagina).toContain("<HubShell>");
    // A TAG, e não a palavra: o comentário que registra a troca cita o nome do
    // layout antigo, e ele deve continuar podendo citar.
    expect(pagina).not.toContain("<MetaDashboardLayout");
    expect(pagina).not.toContain('from "@/components/MetaDashboardLayout"');
  });

  describe("o link antigo não morre calado", () => {
    it("/tracker?rota=/consumo-ia manda para /consumo-ia", () => {
      const busca = "?rota=%2Fconsumo-ia";
      const rota = new URLSearchParams(busca).get("rota");
      // A allowlist recusa — é isso que levaria ao Tracker genérico.
      expect(rotaInternaSegura(rota)).toBeNull();
      // E é isto que impede a página errada com ar de acerto.
      expect(destinoDeInternaAposentada(rota)).toBe("/consumo-ia");
    });

    it("query embutida no próprio parâmetro não engana o mapa", () => {
      expect(destinoDeInternaAposentada("/consumo-ia?x=1")).toBe("/consumo-ia");
    });

    it("rota viva ou ausente não é desviada", () => {
      expect(destinoDeInternaAposentada("/site")).toBeNull();
      expect(destinoDeInternaAposentada(null)).toBeNull();
      expect(destinoDeInternaAposentada("")).toBeNull();
    });

    /** O desvio não pode virar porta para fora do domínio. */
    it("só devolve caminho do próprio mapa", () => {
      for (const bruta of ["https://exemplo.com", "//exemplo.com", "/consumo-ia-falso"]) {
        expect(destinoDeInternaAposentada(bruta), bruta).toBeNull();
      }
    });
  });
});

/**
 * As outras rotas de primeiro nível não podem ter sido arrastadas junto.
 *
 * Tirar uma rota da allowlist é uma linha, e apagar a vizinha errada também.
 */
describe("o padrão das demais rotas continua de pé", () => {
  it("as páginas do Tracker seguem internas", () => {
    for (const rota of ["/site", "/campaigns", "/social-networks", "/dashboard", "/admin", "/rascunho"]) {
      expect(ehRotaInterna(rota), rota).toBe(true);
      expect(rotaInternaSegura(rota), rota).toBe(rota);
    }
  });

  it("as páginas do portal nunca foram internas, e continuam fora", () => {
    for (const rota of ["/people", "/contracts", "/finance", "/notificacoes", "/jornalzinho", "/access"]) {
      expect(ehRotaInterna(rota), rota).toBe(false);
    }
  });
});
