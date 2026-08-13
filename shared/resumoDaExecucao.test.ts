/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Limite e conta específica levam a consertos opostos
 * ─────────────────────────────────────────────────────────────────────────────
 *  Numa lista de doze linhas, "as últimas falharam" e "algumas falharam"
 *  parecem a mesma coisa para quem lê rápido — e a primeira pede otimizar
 *  chamadas, a segunda pede olhar um token. Por isso o padrão é CALCULADO.
 *
 *  E a posição sozinha engana: se a última conta da fila é justamente a do token
 *  vencido, o esgotamento parece confirmado. O código da Meta desempata.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, expect, it } from "vitest";
import {
  CODIGOS_DE_LIMITE, codigoDaMeta, resumirExecucao, type ExecucaoCompleta,
} from "./resumoDaExecucao";

const conta = (id: number, status: string, nota = "9464 seguidores · 25 publicações · 0 recusa(s)") =>
  ({ accountId: id, status, nota, ms: 40_000, chamadas: 186, chamadasComErro: status === "erro" ? 39 : 0 });

const exec = (contas: ReturnType<typeof conta>[], over: Partial<ExecucaoCompleta> = {}): ExecucaoCompleta => ({
  origem: "manual",
  executadaEm: new Date("2026-08-13T13:50:00"),
  tentados: contas.length,
  ok: contas.filter((c) => c.status === "ok").length,
  parciais: contas.filter((c) => c.status === "parcial").length,
  erros: contas.filter((c) => c.status === "erro").length,
  pulados: 0,
  duracaoMs: 480_000,
  chamadas: contas.reduce((s, c) => s + (c.chamadas ?? 0), 0),
  chamadasComErro: contas.reduce((s, c) => s + (c.chamadasComErro ?? 0), 0),
  detalheJson: contas,
  ...over,
});

describe("o código da Meta é a testemunha mais forte", () => {
  it.each(CODIGOS_DE_LIMITE)("código %s aponta VOLUME", (codigo) => {
    const r = resumirExecucao(exec([
      conta(1, "ok"), conta(2, "ok"),
      conta(3, "erro", `Meta (${codigo}): limite atingido`),
    ]));
    expect(r.padrao).toBe("limite");
    expect(r.veredito).toContain("VOLUME");
    expect(r.veredito).toContain("otimizar o coletor");
  });

  /** Otimizar chamadas não conserta token vencido. */
  it.each([190, 10, 200])("código %s aponta ACESSO, não volume", (codigo) => {
    const r = resumirExecucao(exec([
      conta(1, "ok"), conta(2, "ok"),
      conta(3, "erro", `Meta (${codigo}): sem acesso`),
    ]));
    expect(r.padrao).toBe("conta_especifica");
    expect(r.veredito).toContain("não mudaria nada");
  });

  /**
   * A armadilha: a última da fila é a do token vencido, e a posição diria
   * esgotamento. O código desempata.
   */
  it("falha no fim da fila COM código de acesso não vira 'limite'", () => {
    const r = resumirExecucao(exec([
      conta(1, "ok"), conta(2, "ok"), conta(3, "ok"), conta(4, "ok"),
      conta(5, "erro", "Meta (190): token expirado"),
      conta(6, "erro", "Meta (190): token expirado"),
    ]));
    expect(r.padrao).toBe("conta_especifica");
  });

  it("extrai o código de formatos com e sem subcódigo", () => {
    expect(codigoDaMeta("Meta (4): limite")).toBe(4);
    expect(codigoDaMeta("Meta (190/463): expirou")).toBe(190);
    expect(codigoDaMeta("erro sem código")).toBeNull();
  });
});

describe("a posição na fila, quando não há código", () => {
  it("falhas concentradas no FIM sugerem esgotamento", () => {
    const r = resumirExecucao(exec([
      conta(1, "ok"), conta(2, "ok"), conta(3, "ok"), conta(4, "ok"),
      conta(5, "erro", "falhou sem código"), conta(6, "erro", "falhou sem código"),
    ]));
    expect(r.padrao).toBe("limite");
    expect(r.veredito).toContain("sem código de limite");
    expect(r.texto).toContain("posição média das falhas");
  });

  it("falhas espalhadas apontam contas específicas", () => {
    const r = resumirExecucao(exec([
      conta(1, "erro", "falhou sem código"), conta(2, "ok"), conta(3, "ok"),
      conta(4, "erro", "falhou sem código"), conta(5, "ok"), conta(6, "ok"),
    ]));
    expect(r.padrao).toBe("conta_especifica");
    expect(r.veredito).toContain("espalhadas");
  });

  /** Uma falha só não é padrão — é uma falha. */
  it("uma única falha no fim não basta para acusar volume", () => {
    const r = resumirExecucao(exec([
      conta(1, "ok"), conta(2, "ok"), conta(3, "erro", "falhou sem código"),
    ]));
    expect(r.padrao).toBe("conta_especifica");
  });
});

describe("rodada limpa", () => {
  /** A conclusão que importa: se nada falhou, o volume não é a explicação. */
  it("sem falhas, o veredito manda comparar com a rodada que falhou", () => {
    const r = resumirExecucao(exec([conta(1, "ok"), conta(2, "ok"), conta(3, "ok")]));
    expect(r.padrao).toBe("sem_falhas");
    expect(r.veredito).toContain("a causa não é o volume");
    expect(r.veredito).toContain("558 chamadas");
  });
});

describe("o relatório", () => {
  it("traz início, fim, duração e média por conta", () => {
    const t = resumirExecucao(exec([conta(1, "ok"), conta(2, "ok")])).texto;
    expect(t).toContain("início:");
    expect(t).toContain("fim:");
    expect(t).toContain("duração: 480s");
    expect(t).toContain("240s por conta, em média");
    expect(t).toContain("186 por conta");
  });

  /** A ordem da fila é a informação — sem ela não há padrão para ver. */
  it("lista as contas numeradas na ordem da fila", () => {
    const t = resumirExecucao(exec([conta(7, "ok"), conta(3, "ok")])).texto;
    expect(t).toContain("ORDEM DA FILA");
    expect(t).toContain(" 1. #7");
    expect(t).toContain(" 2. #3");
  });

  /** Rodada antiga não tem os contadores — e dizer isso evita ler zero. */
  it("execução sem instrumentação diz que os números não existem", () => {
    const t = resumirExecucao(exec([], { chamadas: null, detalheJson: null })).texto;
    expect(t).toContain("não registradas");
    expect(t).toContain("anterior à instrumentação");
  });

  it("sem execução nenhuma, diz o que fazer", () => {
    const r = resumirExecucao(null);
    expect(r.padrao).toBe("indeterminado");
    expect(r.texto).toContain("Rode a coleta completa");
  });
});
