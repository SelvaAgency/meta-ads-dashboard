/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Permissão do Monitoramento — o guarda do servidor e o da tela, comparados
 * ─────────────────────────────────────────────────────────────────────────────
 *  Este teste existe por causa de um bug real: `rodarAgora` nasceu como
 *  `adminProcedure` enquanto a tela já mostrava o botão para quem podia
 *  CONFIGURAR — que inclui developer. O developer via o botão, clicava, e
 *  levava "You do not have required permission (10002)".
 *
 *  A divergência era invisível para o compilador: os dois lados estavam certos
 *  isoladamente, e nada relaciona um `adminProcedure` no servidor com um
 *  `canManageContent` no cliente. O único jeito de descobrir era clicando.
 *
 *  Então a regra vira teste. A regra é: TUDO no router de monitoramento é
 *  `contentProcedure` — quem pode configurar pode executar. Configurar e não
 *  poder verificar não é uma permissão menor, é uma permissão incoerente.
 *
 *  Ler o fonte é grosseiro, e é de propósito: é a única forma de comparar duas
 *  decisões que moram em processos diferentes.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { canManageContent, canAccessAdmin } from "../../../shared/permissions";

const RAIZ = join(__dirname, "..", "..", "..");

/** Recorta o bloco `monitoramento: router({ ... })` de routers.ts. */
function blocoDoRouter(): string {
  const fonte = readFileSync(join(RAIZ, "server", "routers.ts"), "utf8");
  const inicio = fonte.indexOf("  monitoramento: router({");
  expect(inicio, "router de monitoramento não encontrado — o teste precisa ser atualizado").toBeGreaterThan(-1);
  const fim = fonte.indexOf("\n  }),", inicio);
  expect(fim).toBeGreaterThan(inicio);
  return fonte.slice(inicio, fim);
}

describe("guardas do router de monitoramento", () => {
  it("nenhuma procedure é adminProcedure — dev configura e verifica", () => {
    const bloco = blocoDoRouter();
    // Descarta comentários: eles CITAM "adminProcedure" ao explicar a escolha,
    // e um teste que casasse com a explicação falharia por causa da própria
    // documentação da regra.
    const codigo = bloco.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(codigo).not.toContain("adminProcedure");
  });

  it("toda procedure declarada usa contentProcedure", () => {
    const codigo = blocoDoRouter().replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    // `nome: xxxProcedure` — pega query, mutation e as encadeadas com .input()
    const guardas = [...codigo.matchAll(/^\s{4}(\w+):\s*(\w+Procedure)/gm)];
    expect(guardas.length, "nenhuma procedure encontrada — o recorte quebrou").toBeGreaterThanOrEqual(6);
    for (const [, nome, guarda] of guardas) {
      expect(guarda, `${nome} deveria ser contentProcedure`).toBe("contentProcedure");
    }
  });
});

describe("o predicado que a tela usa bate com o do servidor", () => {
  /**
   * `contentProcedure` deixa passar admin e developer. `canManageContent` é o
   * que a aba consulta para mostrar os controles. Se um dia os dois divergirem,
   * volta o botão que aparece e não funciona.
   */
  it("developer passa nos dois lados", () => {
    expect(canManageContent("developer")).toBe(true);
    expect(canAccessAdmin("developer")).toBe(false); // era ISTO que barrava
  });

  it("admin passa nos dois lados", () => {
    expect(canManageContent("admin")).toBe(true);
  });

  it("usuário comum não passa em nenhum", () => {
    expect(canManageContent("user")).toBe(false);
    expect(canAccessAdmin("user")).toBe(false);
  });
});
