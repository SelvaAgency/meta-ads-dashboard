/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Página nunca foi o requisito — Instagram sempre foi
 * ─────────────────────────────────────────────────────────────────────────────
 *  A sondagem de 12/08 achou `@musa_residuos` no Portfólio, com id de IG User e
 *  insights respondendo, sem Página nenhuma. O sistema inteiro já suportava isso
 *  — banco, coletor e painel só pedem `instagramUserId`. O que barrava era a
 *  validação de entrada, e uma frase de tela que dizia "sem Página vinculada".
 *
 *  Os riscos deste módulo são de duplicidade e de rótulo:
 *
 *   DUPLICATA  uma conta que vem por Página aparecendo TAMBÉM como direta seria
 *              duas opções gravando o mesmo Instagram com vínculos diferentes
 *   RÓTULO     dizer "sem Página" para a Musa é acusá-la de não ter algo que ela
 *              nunca vai ter, e que não faz falta
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, expect, it } from "vitest";
import {
  ROTULO_VIA, faltaParaLer, opcoesDeVinculo, viaDoVinculo, type ViaDoVinculo,
} from "./vinculoInstagram";

const pagina = (pageId: string, igId: string | null, username: string | null = null) => ({
  pageId, pageName: `Página ${pageId}`,
  instagram: igId ? { id: igId, username, tipoConta: "BUSINESS" as const } : null,
});

describe("por onde chegamos ao Instagram", () => {
  it.each([
    ["por Página", { connectionSource: "agencia_system_user", pageId: "10", instagramUserId: "178414" }, "pagina"],
    ["direto do portfólio", { connectionSource: "agencia_system_user", pageId: null, instagramUserId: "178414" }, "instagram_direto"],
    ["login da conta", { connectionSource: "oauth_conta", pageId: null, instagramUserId: "178414" }, "login_da_conta"],
    ["sem Instagram", { connectionSource: "agencia_system_user", pageId: "10", instagramUserId: null }, "sem_vinculo"],
  ])("%s → %s", (_n, v, esperado) => {
    expect(viaDoVinculo(v)).toBe(esperado);
  });

  /** Sem Instagram não há leitura, tenha Página ou não. */
  it("Página sem Instagram continua sendo 'sem vínculo'", () => {
    expect(viaDoVinculo({ pageId: "10", instagramUserId: null })).toBe("sem_vinculo");
    expect(viaDoVinculo(null)).toBe("sem_vinculo");
  });

  it("toda via tem rótulo legível", () => {
    for (const v of ["pagina", "instagram_direto", "login_da_conta", "sem_vinculo"] as ViaDoVinculo[]) {
      expect(ROTULO_VIA[v], v).toBeTruthy();
    }
  });

  /** Nenhuma coluna nova: os três casos saem do que já existe. */
  it("as três vias se distinguem só por connectionSource e pageId", () => {
    const vistos = new Set([
      viaDoVinculo({ connectionSource: "agencia_system_user", pageId: "1", instagramUserId: "x" }),
      viaDoVinculo({ connectionSource: "agencia_system_user", pageId: null, instagramUserId: "x" }),
      viaDoVinculo({ connectionSource: "oauth_conta", pageId: null, instagramUserId: "x" }),
    ]);
    expect(vistos.size).toBe(3);
  });
});

describe("as duas vias numa lista só", () => {
  it("Páginas e Instagram direto viram opções com chaves distintas", () => {
    const o = opcoesDeVinculo(
      [pagina("10", "178401", "elwing.incorporadora")],
      [{ id: "178409", username: "musa_residuos" }],
    );
    expect(o).toHaveLength(2);
    expect(o.map((x) => x.chave).sort()).toEqual(["direto:178409", "pagina:10"]);
  });

  /**
   * O risco central: a mesma conta em duas opções gravaria o mesmo Instagram
   * com vínculos diferentes, e qual delas valeria dependeria do clique.
   */
  it("Instagram que já vem por Página NÃO vira opção direta", () => {
    const o = opcoesDeVinculo(
      [pagina("10", "178401", "aikabodysoul")],
      [{ id: "178401", username: "aikabodysoul" }, { id: "178409", username: "musa_residuos" }],
    );
    expect(o).toHaveLength(2);
    expect(o.filter((x) => x.instagramUserId === "178401")).toHaveLength(1);
    expect(o.find((x) => x.instagramUserId === "178401")!.via).toBe("pagina");
  });

  it("opção direta não inventa Página", () => {
    const o = opcoesDeVinculo([], [{ id: "178409", username: "musa_residuos" }]);
    expect(o[0].pageId).toBeNull();
    expect(o[0].pageName).toBeNull();
    expect(o[0].rotulo).toContain("@musa_residuos");
    expect(o[0].rotulo).toContain("sem Página");
  });

  /** Portfólio não atribui conta pessoal — quem está lá é profissional. */
  it("conta direta entra como BUSINESS, e não DESCONHECIDO", () => {
    expect(opcoesDeVinculo([], [{ id: "1", username: "x" }])[0].tipoConta).toBe("BUSINESS");
  });

  it("Página sem Instagram continua selecionável, e diz que está sem", () => {
    const o = opcoesDeVinculo([pagina("10", null)], []);
    expect(o[0].instagramUserId).toBeNull();
    expect(o[0].rotulo).toContain("sem Instagram");
  });

  it("sem nada, lista vazia e nenhum erro", () => {
    expect(opcoesDeVinculo([], [])).toEqual([]);
  });

  it("a lista vem ordenada, para a posição não depender da ordem da Meta", () => {
    const o = opcoesDeVinculo(
      [pagina("2", "b", "zeca"), pagina("1", "a", "ana")],
      [{ id: "c", username: "musa" }],
    );
    expect(o.map((x) => x.rotulo)).toEqual([...o.map((x) => x.rotulo)].sort((a, b) => a.localeCompare(b, "pt-BR")));
  });
});

describe("a frase diz a condição real", () => {
  /** "Sem Página vinculada" acusa a Musa de não ter o que ela não precisa. */
  it("sem Instagram e sem Página não fala em Página como requisito", () => {
    const t = faltaParaLer({ pageId: null, instagramUserId: null }, "agencia_system_user")!;
    expect(t).toContain("Instagram vinculado");
    expect(t).toContain("direto pelo Portfólio");
    expect(t).not.toMatch(/ainda não tem Página/);
  });

  it("Página presente sem Instagram aponta os dois caminhos", () => {
    const t = faltaParaLer({ pageId: "10", instagramUserId: null }, "agencia_system_user")!;
    expect(t).toContain("não tem conta do Instagram");
    expect(t).toContain("via direta");
  });

  it("com Instagram, não falta nada", () => {
    expect(faltaParaLer({ pageId: null, instagramUserId: "178409" }, "agencia_system_user")).toBeNull();
    expect(faltaParaLer({ pageId: "10", instagramUserId: "178401" }, "agencia_system_user")).toBeNull();
  });

  it("na fonte por login, a frase é sobre o login", () => {
    expect(faltaParaLer({ instagramUserId: null }, "oauth_conta")).toContain("login desta conta");
  });
});
