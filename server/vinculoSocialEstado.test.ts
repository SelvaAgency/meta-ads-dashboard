/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Revincular não pode deixar o teste antigo no ar
 * ─────────────────────────────────────────────────────────────────────────────
 *  Trocar a Página de um cliente mantinha `lastTestAt`, `lastTestStatus` e
 *  `lastTestDetail` da Página ANTERIOR. O cartão seguia exibindo
 *  "testado 12/08 (ok)" logo abaixo de uma Página que acabara de mudar — um
 *  resultado verdadeiro respondendo a uma pergunta que não existe mais.
 *
 *  É a pior forma de dado errado: não parece errado. Um "ok" antigo sobre um
 *  vínculo novo faz o próximo passo (Testar) parecer desnecessário justamente
 *  quando ele é obrigatório.
 *
 *  Estado de teste pertence ao vínculo testado. Trocado o vínculo, ele zera.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, expect, it } from "vitest";
import { camposDoVinculo, linhaDaConexao } from "./db";

const novo = (over: Partial<Parameters<typeof camposDoVinculo>[0]> = {}) => camposDoVinculo({
  handle: "elwing.incorporadora",
  pageId: "222", pageName: "Elwing Incorporadora",
  instagramUserId: "17841400000000001", instagramUsername: "elwing.incorporadora",
  tipoConta: "BUSINESS",
  ...over,
});

describe("o que um vínculo novo apaga", () => {
  it("zera TODO o estado do teste anterior", () => {
    const r = novo();
    expect(r.statusInsight).toBe("NAO_TESTADO");
    expect(r.lastTestAt).toBeNull();
    expect(r.lastTestStatus).toBeNull();
    expect(r.lastTestDetail).toBeNull();
  });

  /** Se algum campo de teste escapar da limpeza, este teste cai. */
  it("nenhum campo lastTest* sobrevive a um vínculo novo", () => {
    const r = novo() as Record<string, unknown>;
    const sujos = Object.keys(r).filter((k) => k.startsWith("lastTest") && r[k] !== null);
    expect(sujos).toEqual([]);
  });

  it("grava o que foi escolhido", () => {
    const r = novo();
    expect(r.pageId).toBe("222");
    expect(r.pageName).toBe("Elwing Incorporadora");
    expect(r.instagramUserId).toBe("17841400000000001");
    expect(r.profileUrl).toBe("https://instagram.com/elwing.incorporadora");
    expect(r.enabled).toBe(true);
  });

  /** OAuth fecha sem Página e, no primeiro momento, sem @ conhecido. */
  it("vínculo por OAuth não inventa Página nem link", () => {
    const r = novo({
      pageId: null, pageName: null, instagramUsername: null,
      tipoConta: "DESCONHECIDO", connectionSource: "oauth_conta",
    });
    expect(r.pageId).toBeNull();
    expect(r.profileUrl).toBeNull();
    expect(r.connectionSource).toBe("oauth_conta");
  });

  /** Sem fonte declarada, não sobrescreve a que já estava gravada. */
  it("fonte ausente não vira campo", () => {
    expect("connectionSource" in novo()).toBe(false);
  });
});

describe("desvincular escolhe a MESMA linha que vincular", () => {
  /**
   * Desvincular e vincular precisam concordar sobre qual linha é a conexão —
   * senão desvincular limparia uma linha e a tela continuaria lendo a outra,
   * exatamente o bug que `linhaDaConexao` já existe para evitar.
   */
  it("a regra de escolha é uma só", () => {
    const linhas = [{ id: 9, pageId: null }, { id: 3, pageId: "222" }, { id: 5, pageId: null }];
    expect(linhaDaConexao(linhas)?.id).toBe(3);
  });
});
