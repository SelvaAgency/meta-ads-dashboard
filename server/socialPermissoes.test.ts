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

  it("nenhuma usa guarda mais fraca que contentProcedure", () => {
    const fracas = procedures.filter((p) => p.guarda !== "contentProcedure" && p.guarda !== "adminProcedure");
    expect(fracas.map((p) => `${p.nome} → ${p.guarda}`)).toEqual([]);
  });

  /** As que o pedido nomeou, uma a uma — para a lista não encolher em silêncio. */
  it.each([
    "credencial", "salvarCredencial", "diagnosticar", "paginasDisponiveis",
    "vinculos", "vincular", "desvincular", "fontes", "desconectarConta", "painel", "sondar", "coletarAgora",
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
   */
  it("a middleware do servidor recusa quem não for admin nem developer", () => {
    const trpc = readFileSync(new URL("./_core/trpc.ts", import.meta.url), "utf-8")
      .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    const ini = trpc.indexOf("export const contentProcedure");
    const bloco = trpc.slice(ini, ini + 700);
    expect(bloco).toContain('ctx.user.role !== "admin"');
    expect(bloco).toContain('ctx.user.role !== "developer"');
    expect(bloco).toContain("FORBIDDEN");
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
  it("o item de menu de Redes sociais é só para admin/dev", () => {
    const layout = readFileSync(new URL("../client/src/components/MetaDashboardLayout.tsx", import.meta.url), "utf-8")
      .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    const i = layout.indexOf("Redes sociais");
    expect(i).toBeGreaterThan(-1);
    // A condição do bloco que o renderiza precisa exigir isManager.
    const bloco = layout.slice(Math.max(0, i - 600), i);
    expect(bloco).toContain("isManager");
  });

  it("Configurações inteira já é restrita — é onde Redes Sociais vive", () => {
    const settings = readFileSync(new URL("../client/src/pages/Settings.tsx", import.meta.url), "utf-8")
      .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    expect(settings).toContain("canManageContent");
    expect(settings).toContain("SemAcessoTracker");
  });
});
