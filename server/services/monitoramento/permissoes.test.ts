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

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Criar cliente é ação de admin E developer
 * ─────────────────────────────────────────────────────────────────────────────
 *  Existem DUAS portas para criar cliente no Spaces, em routers diferentes:
 *
 *    access.createClient                  cliente no cofre de acessos
 *    monitoramento.adicionarClienteSemMidia   cliente atendido só no Site (Aiká)
 *
 *  Estar em arquivos e routers separados é exatamente o que faz uma delas voltar
 *  a ser admin-only sem ninguém perceber — foi o que já aconteceu uma vez, e o
 *  sintoma foi o developer levando "You do not have required permission (10002)"
 *  num botão que a própria tela mostrava para ele.
 *
 *  A regra é uma: quem pode gerenciar conteúdo operacional (admin + developer)
 *  pode criar cliente. Usuário comum não.
 * ─────────────────────────────────────────────────────────────────────────────
 */
describe("as duas portas de criar cliente aceitam developer", () => {
  const fonte = () => readFileSync(join(RAIZ, "server", "routers.ts"), "utf8");

  /**
   * ── O que este teste guarda (e o que ele DEIXOU de guardar) ──────────────
   * O 10002 nasceu de tela e servidor discordarem, e não de um valor específico
   * de procedure. Em 25/08/2026 a porta de Acessos passou a aceitar coordenador
   * (`accessProcedure` + `canManageAccesses`), enquanto a do Site seguiu em
   * admin/dev — as duas continuam CASADAS, cada uma com a sua régua.
   *
   * Travar o nome `contextProcedure` guardaria a régua de ontem; o que importa
   * é o par bater, e é isso que a tabela abaixo declara.
   */
  it.each([
    ["access.createClient", "createClient", "accessProcedure"],
    ["monitoramento.adicionarClienteSemMidia", "adicionarClienteSemMidia", "contentProcedure"],
  ])("%s usa a procedure declarada", (_rotulo, nome, esperada) => {
    const m = new RegExp(`^\\s+${nome}: (\\w+Procedure)`, "m").exec(fonte());
    expect(m, `procedure ${nome} não encontrada — foi renomeada?`).not.toBeNull();
    expect(m![1], `${nome} mudou de régua sem o teste saber`).toBe(esperada);
  });

  /** Nenhuma das duas pode voltar a ser admin-only — foi o bug original. */
  it.each([["createClient"], ["adicionarClienteSemMidia"]])(
    "%s nunca é adminProcedure", (nome) => {
      const m = new RegExp(`^\\s+${nome}: (\\w+Procedure)`, "m").exec(fonte());
      expect(m![1]).not.toBe("adminProcedure");
    });

  /**
   * O outro lado: a TELA precisa oferecer o botão para as mesmas pessoas. Foi a
   * divergência entre os dois lados que produziu o 10002 — cada um estava certo
   * isoladamente, e nada no compilador relaciona os dois.
   */
  it.each([
    ["client/src/pages/Site.tsx", "podeConfigurar", "canManageContent"],
    ["client/src/pages/hub/HubAccess.tsx", "canEdit", "canManageAccesses"],
  ])("a tela %s decide pelo predicado da sua porta", (caminho, variavel, predicado) => {
    const tela = readFileSync(join(RAIZ, caminho), "utf8");
    const m = new RegExp(`const ${variavel} = (\\w+)\\(`).exec(tela);
    expect(m, `${variavel} não encontrada em ${caminho}`).not.toBeNull();
    expect(m![1], "a tela precisa usar o mesmo critério do servidor").toBe(predicado);
  });

  it("o predicado das telas e o guarda do servidor concordam", () => {
    // contentProcedure deixa passar admin e developer; canManageContent também.
    expect(canManageContent("admin")).toBe(true);
    expect(canManageContent("developer")).toBe(true);
    expect(canManageContent("user")).toBe(false);
  });
});
