/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Redes Sociais é liberação controlada: admin e developer, mais ninguém
 * ─────────────────────────────────────────────────────────────────────────────
 *  A tela esconder não basta. Procedure de tRPC é endereçável pelo console do
 *  navegador com a sessão do próprio colaborador — se a proteção morar só no
 *  React, ela protege o botão, não o dado.
 *
 *  Este arquivo nasce de um buraco real: `social.daConta` estava como
 *  `protectedProcedure` (qualquer sessão) enquanto todas as outras já eram
 *  `contentProcedure`. A tela nunca a mostrou para colaborador, então nada
 *  denunciava — e é exatamente esse tipo de exceção silenciosa que uma varredura
 *  automática pega e a revisão manual não.
 *
 *  A varredura é sobre o CÓDIGO-FONTE de propósito: ela reprova uma procedure
 *  nova mal protegida no dia em que for escrita, sem depender de alguém lembrar
 *  de escrever um teste para ela.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { canManageContent } from "@shared/permissions";

/** O router `social` inteiro, sem comentários — a documentação de uma regra
 *  não pode passar por cumprimento dela. */
function routerSocial(): string {
  const fonte = readFileSync(new URL("./routers.ts", import.meta.url), "utf-8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  const ini = fonte.indexOf("social: router({");
  expect(ini, "router `social` não encontrado").toBeGreaterThan(-1);
  // Até o próximo router de primeiro nível.
  const resto = fonte.slice(ini + 16);
  const fim = resto.search(/\n {2}[a-zA-Z]+: router\(\{/);
  return resto.slice(0, fim === -1 ? undefined : fim);
}

describe("toda procedure de Redes Sociais exige admin/dev", () => {
  const social = routerSocial();
  const procedures = Array.from(
    social.matchAll(/^ {4}([a-zA-Z][a-zA-Z0-9]*): (\w+Procedure)/gm),
    (m) => ({ nome: m[1], guarda: m[2] }),
  );

  it("a varredura encontrou o router e as procedures", () => {
    expect(procedures.length).toBeGreaterThanOrEqual(12);
  });

  /**
   * `painel` é a ÚNICA exceção, e ela é explícita.
   *
   * A página analítica saiu do teste interno: quem tem acesso ao Tracker vê os
   * números. O que NÃO abriu junto é o diagnóstico — mensagem da Meta, métrica
   * recusada e validação interna continuam atrás de `canManageContent`, dentro
   * da própria procedure.
   *
   * A lista de exceções é nominal de propósito: uma procedure nova que nasça
   * `protectedProcedure` reprova aqui, em vez de entrar de carona numa regra
   * afrouxada.
   */
  const ABERTAS_AO_COLABORADOR = ["painel", "ultimasColetas"];

  it("nenhuma usa guarda mais fraca que contentProcedure, fora a exceção nominal", () => {
    const fracas = procedures.filter((p) =>
      p.guarda !== "contentProcedure" && p.guarda !== "adminProcedure"
      && !ABERTAS_AO_COLABORADOR.includes(p.nome));
    expect(fracas.map((p) => `${p.nome} → ${p.guarda}`)).toEqual([]);
  });

  it("as exceções são leituras, e nenhuma delas escreve", () => {
    expect(ABERTAS_AO_COLABORADOR).toEqual(["painel", "ultimasColetas"]);
    for (const nome of ABERTAS_AO_COLABORADOR) {
      expect(procedures.find((p) => p.nome === nome)?.guarda, nome).toBe("protectedProcedure");
    }
  });

  /** Saber que o robô rodou é de todos; o detalhe por conta não é. */
  it("`ultimasColetas` retira o detalhe de quem não é admin/dev", () => {
    const s2 = routerSocial();
    const i = s2.indexOf("ultimasColetas: protectedProcedure");
    expect(i).toBeGreaterThan(-1);
    const corpo = s2.slice(i, i + 700);
    expect(corpo).toContain("canManageContent(ctx.user.role)");
    expect(corpo).toContain("detalheJson");
  });

  /** Abrir a leitura não pode ter aberto o diagnóstico junto. */
  it("`painel` esconde o detalhe técnico de quem não é admin/dev", () => {
    const s2 = routerSocial();
    const i = s2.indexOf("painel: protectedProcedure");
    const corpo = s2.slice(i, s2.indexOf("fontes: contentProcedure", i));
    expect(corpo).toContain("canManageContent(ctx.user.role)");
    expect(corpo).toContain("podeVerDiagnostico");
    // E continua conferindo dono do cliente.
    expect(corpo).toContain("getVerifiedAccount");
  });

  /** As que o pedido nomeou, uma a uma — para a lista não encolher em silêncio. */
  it.each([
    "credencial", "salvarCredencial", "diagnosticar", "paginasDisponiveis",
    "vinculos", "vincular", "desvincular", "fontes", "desconectarConta",
    "sondar", "coletarAgora", "sondarInstagramDireto", "sondarHorarios",
    "sondarJanela", "rodarColetaAgora", "sondarInsightsAninhados",
    "daConta", "salvar", "apagar",
  ])("`%s` existe e é admin/dev", (nome) => {
    const p = procedures.find((x) => x.nome === nome);
    expect(p, `procedure \`${nome}\` sumiu do router social`).toBeDefined();
    expect(p!.guarda).toBe("contentProcedure");
  });

  it("nenhuma é pública", () => {
    expect(social).not.toContain("publicProcedure");
  });
});

describe("contentProcedure é exatamente admin + developer", () => {
  /**
   * A guarda do servidor e o predicado da tela decidem a MESMA coisa em
   * processos diferentes. Se um passar a aceitar `user` e o outro não, a
   * divergência aparece como tela vazia ou como dado exposto — nunca como erro.
   *
   * Este teste exigia a forma ESCRITA À MÃO (`role !== "admin" && role !==
   * "developer"`). A regra não mudou; a duplicação foi removida — a middleware
   * passou a chamar `canManageContent`, que é o mesmo predicado que a tela usa.
   * Agora o teste exige exatamente isso: não pode voltar a existir uma segunda
   * cópia da regra, porque é a segunda cópia que diverge.
   */
  it("a middleware do servidor usa o MESMO predicado da tela", () => {
    const trpc = readFileSync(new URL("./_core/trpc.ts", import.meta.url), "utf-8")
      .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    const ini = trpc.indexOf("export const contentProcedure");
    const bloco = trpc.slice(ini, ini + 700);
    expect(bloco).toContain("canManageContent(ctx.user.role)");
    expect(bloco).toContain("FORBIDDEN");
    expect(bloco, "a regra voltou a ser escrita à mão").not.toContain('ctx.user.role !== "developer"');
  });

  it("o predicado da tela concorda com ela", () => {
    expect(canManageContent("admin")).toBe(true);
    expect(canManageContent("developer")).toBe(true);
    expect(canManageContent("user")).toBe(false);
    expect(canManageContent(undefined)).toBe(false);
    expect(canManageContent("qualquer-coisa")).toBe(false);
  });
});

describe("as rotas HTTP de OAuth também barram", () => {
  const rotas = readFileSync(new URL("./socialOAuthRoutes.ts", import.meta.url), "utf-8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

  /** Redirect não passa por tRPC: sem esta conferência seria porta lateral. */
  it("start exige sessão E permissão antes de redirecionar para a Meta", () => {
    const start = rotas.slice(rotas.indexOf('"/api/social/instagram/start"'), rotas.indexOf('"/api/social/instagram/callback"'));
    expect(start).toContain("authenticateRequest");
    expect(start).toContain("canManageContent");
    expect(start.indexOf("canManageContent")).toBeLessThan(start.indexOf("urlDeAutorizacao"));
  });

  /**
   * O papel pode ter mudado entre iniciar e voltar — o fluxo leva minutos e
   * passa por outro site. Reconferir na volta é o que impede um token de ser
   * gravado por quem perdeu o acesso no meio do caminho.
   */
  it("callback reconfere permissão na volta, e não só o state", () => {
    const cb = rotas.slice(rotas.indexOf('"/api/social/instagram/callback"'));
    expect(cb).toContain("lerState");
    expect(cb).toContain("canManageContent");
    expect(cb.indexOf("canManageContent")).toBeLessThan(cb.indexOf("trocarCodePorToken"));
    // E o usuário da volta é o mesmo da ida.
    expect(cb).toContain("sessao.id !== dados.uid");
  });
});

describe("a tela não oferece o que o servidor recusaria", () => {
  /**
   * O menu abriu de propósito: a página analítica saiu do teste interno. O que
   * NÃO abriu é onde se configura — e é isso que este teste agora protege.
   */
  it("o item de menu de Social aponta para a PÁGINA, não para as Conexões", () => {
    const layout = readFileSync(new URL("../client/src/components/MetaDashboardLayout.tsx", import.meta.url), "utf-8")
      .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    // Busca a partir do LINK, e não do rótulo: o href fica algumas linhas
    // acima do texto, e uma janela curta para trás não o alcança.
    const i = layout.indexOf('href="/social-networks"');
    expect(i, "o item de menu não aponta mais para a página").toBeGreaterThan(-1);
    const bloco = layout.slice(i, i + 600);
    expect(bloco).toContain("Social");
    // Levar o colaborador para o hub de Conexões seria oferecer uma tela que o
    // servidor recusa — ele cairia no SemAcessoTracker.
    expect(bloco).not.toContain("painel=conexoes");
  });

  it("a página analítica não exige admin/dev para ver, mas exige para diagnosticar", () => {
    const pagina = readFileSync(new URL("../client/src/pages/RedesSociais.tsx", import.meta.url), "utf-8")
      .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\/[^\n]*/g, "");
    expect(pagina).toContain("podeDiagnosticar");
    expect(pagina).toContain("canManageContent");
    // O gate de entrada deixou de ser o papel.
    expect(pagina).not.toMatch(/const podeVer = canManageContent/);
  });

  it("Configurações inteira já é restrita — é onde Redes Sociais vive", () => {
    const settings = readFileSync(new URL("../client/src/pages/Settings.tsx", import.meta.url), "utf-8")
      .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    expect(settings).toContain("canManageContent");
    expect(settings).toContain("SemAcessoTracker");
  });
});


/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  As duas ferramentas internas: admin e dev, nunca colaborador
 * ─────────────────────────────────────────────────────────────────────────────
 *              Rascunho   Consumo IA
 *    Admin        ✅          ✅
 *    Dev          ✅          ✅
 *    Colaborador  ❌          ❌
 *
 *  A regra precisa valer nos DOIS lados. Um guard só no cliente é decoração —
 *  a rota é adivinhável. Um guard só no servidor deixa link e item de menu
 *  levando a "sem acesso", o que ensina a ignorar links.
 * ─────────────────────────────────────────────────────────────────────────────
 */
describe("ferramentas internas: admin e dev, e ninguém mais", () => {
  const fonte = (p: string) =>
    readFileSync(new URL(p, import.meta.url), "utf-8")
      .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
      .replace(/\/\/[^\n]*/g, "");

  it("a tabela de permissões é o que `canManageContent` diz", () => {
    expect(canManageContent("admin")).toBe(true);
    expect(canManageContent("developer")).toBe(true);
    expect(canManageContent("coordinator")).toBe(false);
    expect(canManageContent("user")).toBe(false);
  });

  /** Rascunho: a rota bloqueia de verdade, e pelo mesmo predicado. */
  it("a página Rascunho usa canManageContent", () => {
    const s = fonte("../client/src/pages/Rascunho.tsx");
    expect(s).toContain("canManageContent(");
    expect(s).toContain("<SemAcessoTracker");
    expect(s, "a checagem virou forma negativa").not.toMatch(/role\s*!==\s*"user"/);
  });

  /**
   * As duas ferramentas ocupam lugares DIFERENTES, e isso é decisão:
   *
   *   Consumo de IA  → navegação, no grupo restrito. É ferramenta do produto.
   *   Rascunho       → fora da navegação. É bancada de peças fora de produção,
   *                    e um item de menu a faria parecer tela oficial.
   *
   * O item de Consumo mora num grupo só-admin, então carrega `liberadoPara` com
   * a MESMA função da rota: sem isso o dev levaria cadeado numa página que pode
   * abrir; com `livre`, o colaborador veria um link que a rota recusa.
   */
  it("Consumo de IA está na navegação, com o predicado da rota", () => {
    const s = fonte("../client/src/pages/hub/HubSidebar.tsx");
    expect(s).toMatch(/label: "Consumo de IA"[^}]*liberadoPara: canManageContent/);
    expect(s, "virou livre e abriu para o colaborador")
      .not.toMatch(/label: "Consumo de IA"[^}]*livre: true/);
    expect(s).toContain("item.livre || item.liberadoPara?.(papel)");
  });

  it("o Rascunho NÃO está na navegação, e continua alcançável", () => {
    expect(fonte("../client/src/pages/hub/HubSidebar.tsx")).not.toContain('label: "Rascunho"');
    // O acesso sobrevive pelo atalho de Configurações, que já é admin/dev.
    expect(fonte("../client/src/pages/hub/HubSettings.tsx")).toContain("/rascunho");
  });

  /** Página, procedure e rota interna pela mesma allowlist. */
  it("o consumo de IA é contentProcedure e página própria", () => {
    const rotas = fonte("./routers.ts");
    const de = rotas.indexOf("consumoIA:");
    const bloco = rotas.slice(de, rotas.indexOf("refreshAllStatus:", de));
    expect(bloco).toContain("contentProcedure");
    expect(bloco, "voltou a ser só-admin").not.toContain("adminProcedure");

    const pagina = fonte("../client/src/pages/ConsumoIA.tsx");
    expect(pagina).toContain("canManageContent(");
    expect(pagina).toContain("<SemAcessoTracker");

    // A rota crua precisa estar na allowlist do shell, senão cai no Tracker
    // genérico sem erro nenhum — a quebra silenciosa de sempre.
    expect(fonte("../client/src/pages/hub/trackerRoutes.ts")).toContain('"/consumo-ia"');
  });

  /** A página Administrativo não carrega mais o painel — ele tem casa própria. */
  it("o painel antigo saiu de Configurações e da página Administrativo", () => {
    expect(fonte("../client/src/pages/Admin.tsx")).not.toContain("ConsumoDeIA");
    expect(fonte("../client/src/pages/hub/HubSettings.tsx")).not.toContain("<ConsumoDeIA />");
  });

  /** A página Administrativo continua só-admin — nada ali foi afrouxado. */
  it("a permissão da página Administrativo não mudou", () => {
    const s = fonte("../client/src/pages/Admin.tsx");
    expect(s).toContain("canAccessAdmin(");
    expect(s).not.toContain("canManageContent(");
  });
});
