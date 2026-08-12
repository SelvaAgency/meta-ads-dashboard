/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Fallback silencioso é o bug que estes testes existem para impedir
 * ─────────────────────────────────────────────────────────────────────────────
 *  Cair da fonte OAuth para a da agência sem avisar faz um cliente com login
 *  EXPIRADO ficar idêntico a um que nunca conectou por login: os dois aparecem
 *  "conectado via agência", e o aviso de reconectar nunca chega. No dia em que o
 *  token da agência também morrer — que é exatamente o que acabou de acontecer —
 *  os dois quebram juntos, e ninguém sabe qual precisava de qual conserto.
 *
 *  A distinção que sustenta tudo: fonte AUSENTE não é falha (a segunda assume
 *  normalmente); fonte PRESENTE E QUEBRADA é, e aí trocar seria esconder um
 *  problema que tem dono.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, expect, it } from "vitest";
import { DIAS_PARA_RENOVAR, ROTULO_FONTE, escolherFonte, type EstadoDaFonte } from "./fontesSociais";

const oauth = (over: Partial<EstadoDaFonte> = {}): EstadoDaFonte =>
  ({ fonte: "oauth_conta", configurada: true, utilizavel: true, ...over });
const agencia = (over: Partial<EstadoDaFonte> = {}): EstadoDaFonte =>
  ({ fonte: "agencia_system_user", configurada: true, utilizavel: true, ...over });

describe("preferência", () => {
  it("com as duas boas, usa o login da conta", () => {
    const r = escolherFonte([agencia(), oauth()]);
    expect(r.usada).toBe("oauth_conta");
    expect(r.nivel).toBe("ok");
    expect(r.titulo).toContain("login da conta");
  });

  /** A ordem da lista não pode decidir: a preferência é declarada, não posicional. */
  it("a ordem da entrada não muda a escolha", () => {
    expect(escolherFonte([oauth(), agencia()]).usada)
      .toBe(escolherFonte([agencia(), oauth()]).usada);
  });

  it("sem OAuth configurado, a agência assume sem drama", () => {
    const r = escolherFonte([agencia(), oauth({ configurada: false, utilizavel: false })]);
    expect(r.usada).toBe("agencia_system_user");
    expect(r.nivel).toBe("ok");
    // Ausência não é descarte — nada a relatar.
    expect(r.descartadas).toEqual([]);
  });
});

describe("fonte quebrada nunca é substituída em silêncio", () => {
  /** O caso central. */
  it("OAuth expirado NÃO cai para a agência, mesmo com ela boa", () => {
    const r = escolherFonte([
      oauth({ utilizavel: false, problema: "O login desta conta expirou." }),
      agencia(),
    ]);
    expect(r.usada).toBeNull();
    expect(r.nivel).toBe("pendente");
    expect(r.detalhe).toContain("expirou");
    expect(r.detalhe).toContain("NÃO é usada automaticamente");
    expect(r.descartadas).toEqual([
      { fonte: "agencia_system_user", porque: expect.stringContaining("não substitui automaticamente") },
    ]);
  });

  it("e diz quando não há sequer outra fonte para oferecer", () => {
    const r = escolherFonte([
      oauth({ utilizavel: false, problema: "O login desta conta expirou." }),
      agencia({ configurada: false, utilizavel: false }),
    ]);
    expect(r.usada).toBeNull();
    expect(r.detalhe).toContain("Não há outra fonte configurada");
    expect(r.descartadas).toEqual([]);
  });

  /** O estado de HOJE: só a agência, e ela caiu. */
  it("agência quebrada e sem OAuth: pendente, com o motivo dela", () => {
    const r = escolherFonte([
      oauth({ configurada: false, utilizavel: false }),
      agencia({ utilizavel: false, problema: "O token da agência falhou no último teste." }),
    ]);
    expect(r.usada).toBeNull();
    expect(r.titulo).toContain("Token da agência");
    expect(r.detalhe).toContain("falhou no último teste");
  });

  it("nenhuma fonte configurada diz o que fazer", () => {
    const r = escolherFonte([
      oauth({ configurada: false, utilizavel: false }),
      agencia({ configurada: false, utilizavel: false }),
    ]);
    expect(r.usada).toBeNull();
    expect(r.titulo).toBe("Nenhuma fonte conectada");
    expect(r.detalhe).toContain("login da conta");
  });

  it("lista vazia não explode", () => {
    expect(escolherFonte([]).usada).toBeNull();
  });
});

describe("expiração aparece antes de virar problema", () => {
  it("dentro da janela de renovação, conecta mas avisa", () => {
    const r = escolherFonte([oauth({ diasParaExpirar: 3 })]);
    expect(r.usada).toBe("oauth_conta");
    expect(r.nivel).toBe("atencao");
    expect(r.detalhe).toContain("3 dia(s)");
    expect(r.detalhe).toContain("Reconecte");
  });

  it("fora da janela, é só 'ok'", () => {
    const r = escolherFonte([oauth({ diasParaExpirar: DIAS_PARA_RENOVAR + 1 })]);
    expect(r.nivel).toBe("ok");
    expect(r.detalhe).not.toContain("Reconecte");
  });

  it("a janela é a mesma que a renovação preguiçosa usa", () => {
    expect(escolherFonte([oauth({ diasParaExpirar: DIAS_PARA_RENOVAR })]).nivel).toBe("atencao");
  });

  /** Fonte sem prazo (a da agência) não pode inventar um. */
  it("sem prazo declarado, nada de aviso de expiração", () => {
    expect(escolherFonte([agencia()]).nivel).toBe("ok");
  });
});

describe("rótulos", () => {
  it("toda fonte tem nome legível", () => {
    expect(ROTULO_FONTE.oauth_conta).toBe("Login da conta");
    expect(ROTULO_FONTE.agencia_system_user).toBe("Token da agência");
  });
});
