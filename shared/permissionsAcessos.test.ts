/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Acessos liberado ao coordenador — e só essa página
 * ─────────────────────────────────────────────────────────────────────────────
 *  O risco não está no que a liberação abre; está no que abre SEM QUERER.
 *  `canManageContent` governa Consumo de IA, Rascunho, Panorama, a barra de
 *  News e a SelvaTV. Ampliá-la para liberar Acessos abriria as cinco de uma vez
 *  — e ninguém perceberia, porque a tela do coordenador ganharia mais botões e
 *  isso pareceria a mudança funcionando.
 *
 *  Por isso metade deste arquivo testa as OUTRAS funções.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  canAccessAdmin, canAccessTrackerSettings, canManageAccesses, canManageContent,
  canManagePeople, canManagePriorities, ROLES,
} from "./permissions";

const fonte = (p: string) =>
  readFileSync(new URL(p, import.meta.url), "utf-8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\/[^\n]*/g, "");

describe("quem cria e edita em Acessos", () => {
  it("admin, desenvolvedor e coordenador", () => {
    expect(canManageAccesses("admin")).toBe(true);
    expect(canManageAccesses("developer")).toBe(true);
    expect(canManageAccesses("coordinator")).toBe(true);
  });

  it("colaborador continua sem criar nem editar", () => {
    expect(canManageAccesses("user")).toBe(false);
  });

  it("valor desconhecido cai fora — a forma é allowlist", () => {
    // Um role novo cai FORA por construção, e não por alguém ter lembrado de
    // excluí-lo caso a caso.
    for (const v of [undefined, null, "", "root", "gestor", 9, {}, []]) {
      expect(canManageAccesses(v), String(v)).toBe(false);
    }
  });

  it("exatamente três dos quatro roles", () => {
    expect(ROLES.filter(canManageAccesses)).toEqual(["admin", "developer", "coordinator"]);
  });
});

describe("nenhuma permissão administrativa foi aberta", () => {
  it("o coordenador continua fora do administrativo", () => {
    expect(canAccessAdmin("coordinator")).toBe(false);
  });

  it("continua fora do conteúdo — Consumo de IA, Rascunho, Panorama, News, SelvaTV", () => {
    // Se esta linha virar `true`, a liberação de Acessos vazou para cinco áreas.
    expect(canManageContent("coordinator")).toBe(false);
  });

  it("continua fora do cadastro de colaboradores", () => {
    // `canManagePeople` é o CRUD de PESSOAS do Spaces — outra coisa que
    // "gerenciar credenciais de cliente".
    expect(canManagePeople("coordinator")).toBe(false);
  });

  it("mantém apenas o que já tinha: prioridades e Configurações do Tracker", () => {
    expect(canManagePriorities("coordinator")).toBe(true);
    expect(canAccessTrackerSettings("coordinator")).toBe(true);
  });

  it("admin segue sendo o único no administrativo", () => {
    expect(ROLES.filter(canAccessAdmin)).toEqual(["admin"]);
    expect(ROLES.filter(canManagePeople)).toEqual(["admin"]);
  });

  it("colaborador segue sem nenhuma permissão", () => {
    for (const fn of [canAccessAdmin, canManageContent, canManagePriorities,
      canManagePeople, canAccessTrackerSettings, canManageAccesses]) {
      expect(fn("user")).toBe(false);
    }
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  As travas do backend — o ponto onde uma liberação de interface falha calada
 * ─────────────────────────────────────────────────────────────────────────────
 *  Liberar o botão sem liberar a procedure produz o pior resultado possível: o
 *  coordenador clica, a tela pisca, e o servidor recusa com uma mensagem
 *  genérica.
 * ─────────────────────────────────────────────────────────────────────────────
 */
describe("as sete procedures de escrita migraram", () => {
  const routers = () => fonte("../server/routers.ts");

  it("todas as ações de criar, editar e desativar aceitam coordenador", () => {
    for (const m of ["removerFotoCliente", "createClient", "updateClient",
      "deactivateClient", "createItem", "updateItem", "deactivateItem"]) {
      expect(routers(), m).toContain(`${m}: accessProcedure`);
    }
  });

  it("nenhuma delas ficou para trás em contentProcedure", () => {
    for (const m of ["createClient", "updateClient", "createItem", "updateItem"]) {
      expect(routers(), m).not.toContain(`${m}: contentProcedure`);
    }
  });

  it("as leituras seguem em protectedProcedure — não foram mexidas", () => {
    // Visualizar já era de todo mundo logado; a rodada é sobre criar e editar.
    for (const m of ["clientsList", "itemsByClient", "revealPassword"]) {
      expect(routers(), m).toContain(`${m}: protectedProcedure`);
    }
  });

  it("a procedure usa o predicado, e não uma cópia da regra", () => {
    const s = fonte("../server/_core/trpc.ts");
    const bloco = s.slice(s.indexOf("export const accessProcedure"),
      s.indexOf("export const trackerSettingsProcedure"));
    expect(bloco).toContain("canManageAccesses(ctx.user.role)");
    // `role === "coordinator"` escrito à mão divergiria da tela no dia em que
    // um dos dois mudasse.
    expect(bloco).not.toContain('=== "coordinator"');
  });

  it("a tela usa o MESMO predicado do servidor", () => {
    const s = fonte("../client/src/pages/hub/HubAccess.tsx");
    expect(s).toContain("canManageAccesses((user as { role?: string } | null)?.role)");
    expect(s).not.toContain("canManageContent");
  });

  it("o mesmo `canEdit` governa os botões dos modais", () => {
    // Criar cliente fica na página; editar cliente, editar credencial e
    // desativar ficam nos modais. Uma segunda régua lá dentro daria ao
    // coordenador acesso com menos capacidade que admin/dev.
    const s = fonte("../client/src/pages/hub/HubAccess.tsx");
    expect(s).toContain("canEdit={canEdit}");
    const modal = fonte("../client/src/pages/hub/AccessClientModal.tsx");
    expect(modal).toContain("canEdit");
    expect(modal).not.toContain("canManageContent");
  });

  it("outras áreas seguem em contentProcedure", () => {
    // A prova de que a liberação não vazou pela procedure compartilhada.
    const s = routers();
    expect(s).toContain("consumoIA: contentProcedure");
    expect(s).not.toContain("consumoIA: accessProcedure");
  });
});
