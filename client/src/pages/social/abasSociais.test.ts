/**
 * O destino de um link torto é a Home, e não uma tela vazia.
 *
 * Alertas e relatórios gravam `?aba=` em texto no banco. Quando a Social ganhar
 * uma terceira aba, ou quando alguém renomear esta, os links já gravados
 * continuam apontando para o nome velho — e é aqui que eles são traduzidos.
 */
import { describe, expect, it } from "vitest";
import { ABAS_SOCIAIS, ROTULO_ABA_SOCIAL, abaDaUrl } from "./abasSociais";

describe("as abas da Social", () => {
  it("os nomes próprios são entendidos", () => {
    expect(abaDaUrl("home")).toBe("home");
    expect(abaDaUrl("conteudo")).toBe("conteudo");
  });

  it("maiúsculas e espaços não quebram o link", () => {
    expect(abaDaUrl("  CONTEUDO ")).toBe("conteudo");
  });

  it("sinônimos plausíveis chegam ao lugar certo", () => {
    expect(abaDaUrl("resumo")).toBe("home");
    expect(abaDaUrl("performance")).toBe("conteudo");
    expect(abaDaUrl("conteúdo")).toBe("conteudo");
  });

  /** O caso que justifica o módulo: desconhecido NÃO é tela vazia. */
  it("desconhecido, vazio e ausente caem na Home", () => {
    expect(abaDaUrl("retencao-dos-reels-v2")).toBe("home");
    expect(abaDaUrl("")).toBe("home");
    expect(abaDaUrl(null)).toBe("home");
    expect(abaDaUrl(undefined)).toBe("home");
  });

  it("toda aba tem rótulo", () => {
    for (const a of ABAS_SOCIAIS) expect(ROTULO_ABA_SOCIAL[a]).toBeTruthy();
  });
});
