/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Configurações do Tracker liberadas ao coordenador — e só elas
 * ─────────────────────────────────────────────────────────────────────────────
 *  O risco de uma liberação dessas não está no que ela abre; está no que abre
 *  SEM QUERER. `canManageContent` governa Consumo de IA, Rascunho, Panorama, a
 *  barra de News e a SelvaTV. Ampliá-la para liberar Configurações abriria as
 *  cinco de uma vez — e ninguém perceberia, porque a tela do coordenador
 *  passaria a ter mais botões e isso pareceria a mudança funcionando.
 *
 *  Por isso metade deste arquivo testa as OUTRAS funções: elas têm que
 *  continuar cegas ao coordenador.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  canAccessAdmin, canAccessTrackerSettings, canManageContent, canManagePeople,
  canManagePriorities, ROLES,
} from "./permissions";

const fonte = (p: string) =>
  readFileSync(new URL(p, import.meta.url), "utf-8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

describe("quem entra em Configurações do Tracker", () => {
  it("admin, desenvolvedor e coordenador", () => {
    expect(canAccessTrackerSettings("admin")).toBe(true);
    expect(canAccessTrackerSettings("developer")).toBe(true);
    expect(canAccessTrackerSettings("coordinator")).toBe(true);
  });

  it("colaborador continua fora", () => {
    expect(canAccessTrackerSettings("user")).toBe(false);
  });

  it("valor desconhecido cai em colaborador, e não em acesso", () => {
    // A forma é allowlist: um role novo cai FORA por construção, e não por
    // alguém ter lembrado de excluí-lo.
    for (const v of [undefined, null, "", "root", "gerente", 7, {}, []]) {
      expect(canAccessTrackerSettings(v), String(v)).toBe(false);
    }
  });

  it("exatamente três dos quatro roles têm acesso", () => {
    expect(ROLES.filter(canAccessTrackerSettings)).toEqual(["admin", "developer", "coordinator"]);
  });
});

describe("o coordenador NÃO ganhou mais nada", () => {
  it("continua fora do administrativo", () => {
    expect(canAccessAdmin("coordinator")).toBe(false);
  });

  it("continua fora do conteúdo — Consumo de IA, Rascunho, Panorama, News, SelvaTV", () => {
    // Se esta linha virar `true`, a liberação de Configurações vazou para
    // cinco áreas que ninguém pediu.
    expect(canManageContent("coordinator")).toBe(false);
  });

  it("continua fora do cadastro de colaboradores", () => {
    expect(canManagePeople("coordinator")).toBe(false);
  });

  it("mantém a permissão que já tinha — prioridades da semana", () => {
    expect(canManagePriorities("coordinator")).toBe(true);
  });
});

describe("os outros roles não se moveram", () => {
  it("admin e dev seguem com tudo que tinham", () => {
    for (const fn of [canManageContent, canManagePriorities, canAccessTrackerSettings]) {
      expect(fn("admin")).toBe(true);
      expect(fn("developer")).toBe(true);
    }
    expect(canAccessAdmin("admin")).toBe(true);
    expect(canAccessAdmin("developer")).toBe(false);
  });

  it("colaborador segue sem nenhuma permissão", () => {
    for (const fn of [canAccessAdmin, canManageContent, canManagePriorities,
      canManagePeople, canAccessTrackerSettings]) {
      expect(fn("user")).toBe(false);
    }
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  A tela e o servidor precisam usar o MESMO critério
 * ─────────────────────────────────────────────────────────────────────────────
 *  Dois critérios escritos separados divergem, e a divergência aparece como um
 *  menu que existe e uma página que recusa — ou pior, o contrário.
 * ─────────────────────────────────────────────────────────────────────────────
 */
describe("a fiação usa o predicado, e não uma cópia da regra", () => {
  it("a página de Configurações decide pelo predicado", () => {
    const s = fonte("../client/src/pages/Settings.tsx");
    expect(s).toContain("canAccessTrackerSettings(user?.role)");
    // A antiga régua não pode ter sobrado em lugar nenhum da página.
    expect(s).not.toContain("canManageContent");
  });

  it("o mesmo predicado decide o acesso E o que se pode editar dentro", () => {
    // Uma segunda régua para o coordenador dentro da página daria a ele acesso
    // com menos capacidade que admin/dev — que não é o que foi pedido.
    const s = fonte("../client/src/pages/Settings.tsx");
    expect(s).toContain("const podeEditar = canAccessTrackerSettings(user?.role)");
  });

  it("o item de menu usa o predicado próprio, e não o de conteúdo", () => {
    const s = fonte("../client/src/components/MetaDashboardLayout.tsx");
    const menu = s.slice(s.indexOf("podeConfigurar &&"), s.indexOf("podeConfigurar &&") + 200);
    expect(menu).toContain('location === "/settings"');
    expect(s).toContain("canAccessTrackerSettings(user?.role)");
  });

  it("Panorama e Alertas continuam escondidos por isManager", () => {
    // O bloco que esconde as áreas de gestão cross-client não pode ter sido
    // arrastado junto: ele segue admin/dev.
    const s = fonte("../client/src/components/MetaDashboardLayout.tsx");
    expect(s).toContain("const isManager = canManageContent(user?.role)");
    expect(s).toContain("{isManager && (");
  });

  it("a procedure do servidor usa o mesmo predicado", () => {
    const s = fonte("../server/_core/trpc.ts");
    const bloco = s.slice(s.indexOf("export const trackerSettingsProcedure"),
      s.indexOf("export const contentProcedure"));
    expect(bloco).toContain("canAccessTrackerSettings(ctx.user.role)");
    // Nada de regra escrita à mão: `role === "coordinator"` aqui divergiria da
    // tela no dia em que um dos dois mudasse.
    expect(bloco).not.toContain('=== "coordinator"');
  });

  it("as procedures da página migraram, e nenhuma outra", () => {
    const s = fonte("../server/routers.ts");
    // As nove que a página de Configurações consome — todas exclusivas dela.
    for (const m of ["aplicarToken", "diagnosticoTokens", "duplicatas",
      "importarSelecionadas", "mesclar", "previaDeToken", "previewImportacao",
      "renomear"]) {
      expect(s, m).toContain(`${m}: trackerSettingsProcedure`);
    }
    // E o resto do sistema segue em contentProcedure.
    expect(s).toContain("consumoIA: contentProcedure");
    expect(s).toContain("refreshAllStatus: adminProcedure");
  });

  it("o Consumo de IA continua em contentProcedure — admin e dev", () => {
    // A prova de que a liberação não vazou pela procedure compartilhada.
    const s = fonte("../server/routers.ts");
    expect(s).not.toContain("consumoIA: trackerSettingsProcedure");
  });
});
