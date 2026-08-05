/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Classificação da importação — o que NÃO pode vir marcado
 * ─────────────────────────────────────────────────────────────────────────────
 *  O dano que esta tela evita é assimétrico: deixar de importar uma conta nova
 *  custa um clique; reimportar uma existente sobrescreve o nome que alguém
 *  escolheu à mão, reativa cliente desativado de propósito e mexe em moeda e
 *  fuso — e isso só aparece dias depois, quando o nome errado já vazou para
 *  relatório e e-mail.
 *
 *  Por isso a maior parte destes testes é sobre o que precisa nascer DESMARCADO.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, expect, it } from "vitest";
import {
  classificarContas, contasMarcadasPorPadrao, idLimpo, podeImportarSemForcar,
  ROTULO_STATUS, type ContaDaMeta, type ContaNoTracker,
} from "./importacaoContas";

const daMeta = (over: Partial<ContaDaMeta> = {}): ContaDaMeta =>
  ({ accountId: "111", nome: "CA - ARKA", currency: "BRL", timezone: "America/Sao_Paulo", ...over });

const noTracker = (over: Partial<ContaNoTracker> = {}): ContaNoTracker =>
  ({ accountId: "111", nome: "CA - ARKA", ativa: true, ...over });

const status = (meta: ContaDaMeta[], tracker: ContaNoTracker[]) =>
  classificarContas(meta, tracker).map((c) => c.status);

describe("o que precisa vir DESMARCADO", () => {
  it.each([
    ["já existe, igual", [noTracker()], "ja_existe"],
    ["já existe, desativada", [noTracker({ ativa: false })], "ja_existe_inativa"],
    ["já existe com nome trocado à mão", [noTracker({ nome: "Arka Studio" })], "nome_diferente"],
  ])("%s → %s, desmarcada", (_n, tracker, esperado) => {
    const [c] = classificarContas([daMeta()], tracker as ContaNoTracker[]);
    expect(c.status).toBe(esperado);
    expect(c.marcadaPorPadrao).toBe(false);
  });

  /** Mesmo nome, outro id: provavelmente conta nova do MESMO cliente. */
  it("possível duplicada não vem marcada", () => {
    const [c] = classificarContas([daMeta({ accountId: "999" })], [noTracker({ accountId: "111" })]);
    expect(c.status).toBe("possivel_duplicada");
    expect(c.marcadaPorPadrao).toBe(false);
  });

  it("nenhum status além de 'nova' nasce marcado", () => {
    const contas = classificarContas(
      [daMeta({ accountId: "1" }), daMeta({ accountId: "2", nome: "Novo" }),
       daMeta({ accountId: "3", nome: "Inativa" }), daMeta({ accountId: "9", nome: "CA - ARKA" })],
      [noTracker({ accountId: "1" }), noTracker({ accountId: "3", nome: "Inativa", ativa: false })],
    );
    for (const c of contas) {
      expect(c.marcadaPorPadrao, `${c.nome} (${c.status})`).toBe(c.status === "nova");
    }
    expect(contasMarcadasPorPadrao(contas)).toEqual(["2"]);
  });
});

describe("conta nova", () => {
  it("id desconhecido e nome inédito → nova, marcada", () => {
    const [c] = classificarContas([daMeta({ accountId: "777", nome: "Cliente Novo" })], [noTracker()]);
    expect(c.status).toBe("nova");
    expect(c.marcadaPorPadrao).toBe(true);
  });

  it("Tracker vazio → tudo novo", () => {
    expect(status([daMeta({ accountId: "1" }), daMeta({ accountId: "2", nome: "B" })], []))
      .toEqual(["nova", "nova"]);
  });
});

describe("identidade da conta", () => {
  /** `act_123` e `123` são a mesma conta — errar isso duplicaria o portfólio. */
  it.each([
    ["act_ na Meta", "act_111", "111"],
    ["act_ no Tracker", "111", "act_111"],
    ["act_ nos dois", "act_111", "act_111"],
  ])("%s casa como a mesma conta", (_n, idMeta, idTracker) => {
    expect(status([daMeta({ accountId: idMeta })], [noTracker({ accountId: idTracker })]))
      .toEqual(["ja_existe"]);
  });

  it("o id devolvido sai sempre sem act_", () => {
    expect(classificarContas([daMeta({ accountId: "act_111" })], [])[0].accountId).toBe("111");
    expect(idLimpo("ACT_55")).toBe("55");
  });

  /** Nome distinto de propósito: aqui o que se testa é o ID, não o nome. */
  it("ids diferentes não se confundem", () => {
    expect(status(
      [daMeta({ accountId: "111", nome: "Cliente A" })],
      [noTracker({ accountId: "1110", nome: "Cliente B" })],
    )).toEqual(["nova"]);
  });

  /** `111` não pode casar com `1110` nem por prefixo. */
  it("id que é prefixo de outro não vira duplicata", () => {
    expect(status(
      [daMeta({ accountId: "111", nome: "Cliente A" })],
      [noTracker({ accountId: "1110", nome: "Cliente A" })],
    )).toEqual(["possivel_duplicada"]); // pelo NOME, nunca pelo id parcial
  });
});

describe("comparação de nome", () => {
  it.each([
    ["CA - ARKA", "ca arka"],
    ["Aiká", "AIKA"],
    ["Scaffold  Play", "scaffold-play"],
  ])("'%s' e '%s' são o mesmo nome", (a, b) => {
    expect(status([daMeta({ accountId: "1", nome: a })], [noTracker({ accountId: "1", nome: b })]))
      .toEqual(["ja_existe"]);
  });

  it("nome de verdade diferente vira nome_diferente", () => {
    expect(status([daMeta({ accountId: "1", nome: "ARKA" })], [noTracker({ accountId: "1", nome: "Elwing" })]))
      .toEqual(["nome_diferente"]);
  });

  /** Conta sem nome no Tracker não pode virar "duplicada de todo mundo". */
  it("nome nulo no Tracker não gera duplicata falsa", () => {
    expect(status([daMeta({ accountId: "9", nome: "Novo" })], [noTracker({ accountId: "1", nome: null })]))
      .toEqual(["nova"]);
  });
});

describe("o que o servidor aceita sem forçar", () => {
  it.each([["nova", true], ["possivel_duplicada", true],
           ["ja_existe", false], ["ja_existe_inativa", false], ["nome_diferente", false]] as const)(
    "%s → %s", (s, esperado) => {
      expect(podeImportarSemForcar(s)).toBe(esperado);
    });

  /**
   * Duplicada PODE ser importada porque é uma conta genuinamente nova — o aviso
   * é para a pessoa não criar um cliente irmão sem querer, não para impedir.
   * Existente não pode: importar sobrescreveria.
   */
  it("a permissão do servidor acompanha o risco, não a marcação", () => {
    expect(podeImportarSemForcar("possivel_duplicada")).toBe(true);
    const [c] = classificarContas([daMeta({ accountId: "999" })], [noTracker({ accountId: "111" })]);
    expect(c.marcadaPorPadrao).toBe(false); // marcada não, permitida sim
  });
});

describe("rótulos", () => {
  it("todo status tem rótulo em português", () => {
    for (const s of ["nova", "ja_existe", "ja_existe_inativa", "nome_diferente", "possivel_duplicada"] as const) {
      expect(ROTULO_STATUS[s]).toBeTruthy();
    }
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  A importação usa o criador que NÃO atualiza
 * ─────────────────────────────────────────────────────────────────────────────
 *  Existem duas funções de criação no db, e a diferença entre elas é o dano:
 *
 *    createMetaAdAccount    upsert — reescreve nome, moeda, fuso; reativa
 *    criarContaMetaSeNova   cria ou devolve "ja_existia"; nunca escreve por cima
 *
 *  Trocar uma pela outra numa refatoração compila, passa em revisão e só
 *  aparece quando um cliente perde o nome que alguém escolheu à mão — dias
 *  depois, com o nome errado já em relatório e e-mail.
 * ─────────────────────────────────────────────────────────────────────────────
 */
describe("o caminho de importação não pode sobrescrever", () => {
  const routers = () => {
    const fs = require("node:fs") as typeof import("node:fs");
    const path = require("node:path") as typeof import("node:path");
    return fs.readFileSync(path.join(__dirname, "..", "server", "routers.ts"), "utf8");
  };

  /** Recorta o corpo da procedure de importação. */
  const corpoDaImportacao = () => {
    const fonte = routers();
    const i = fonte.indexOf("importarSelecionadas: contentProcedure");
    expect(i, "procedure de importação não encontrada — foi renomeada?").toBeGreaterThan(-1);
    return fonte.slice(i, fonte.indexOf("\n    }),", i));
  };

  it("chama criarContaMetaSeNova", () => {
    expect(corpoDaImportacao()).toContain("criarContaMetaSeNova");
  });

  it("NÃO chama o upsert", () => {
    expect(corpoDaImportacao()).not.toContain("createMetaAdAccount");
  });

  /** O servidor decide de novo: a lista que chega é entrada do cliente. */
  it("reclassifica no servidor em vez de confiar na tela", () => {
    const corpo = corpoDaImportacao();
    expect(corpo).toContain("classificarContas");
    expect(corpo).toContain("podeImportarSemForcar");
  });

  it("aceita developer, não só admin", () => {
    expect(routers()).toContain("importarSelecionadas: contentProcedure");
    expect(routers()).toContain("previewImportacao: contentProcedure");
  });

  /** O botão de importar tudo, que sobrescrevia, não pode voltar. */
  it("connectAll não existe mais", () => {
    expect(routers()).not.toContain("connectAll:");
  });
});
