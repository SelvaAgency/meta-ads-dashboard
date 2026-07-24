import { describe, it, expect } from "vitest";
import { resumirCicloLojas, type ResultadoLojaCiclo } from "./lojaSync";

/**
 * O redutor do ciclo do cron: uma loja OK grava 2 snapshots (7d + 30d); falha
 * não conta snapshot, entra em `erros` e NÃO derruba as outras. É a garantia de
 * isolamento vista no resumo que vai para app_settings.
 */
describe("resumo do ciclo de lojas", () => {
  const r = (accountId: number, ok: boolean, erro?: string): ResultadoLojaCiclo =>
    ({ conexaoId: accountId, accountId, ok, erro });

  it("BAESH e Scaffold OK: 2 lojas, 4 snapshots, zero falha", () => {
    const resumo = resumirCicloLojas([r(4, true), r(13, true)]);
    expect(resumo).toMatchObject({ total: 2, ok: 2, falhas: 0, snapshotsAtualizados: 4 });
    expect(resumo.erros).toEqual([]);
  });

  it("falha isolada: uma loja quebra, a outra segue e o erro é registrado", () => {
    const resumo = resumirCicloLojas([r(4, true), r(13, false, "loja recusou a credencial")]);
    expect(resumo).toMatchObject({ total: 2, ok: 1, falhas: 1, snapshotsAtualizados: 2 });
    expect(resumo.erros).toEqual([{ accountId: 13, erro: "loja recusou a credencial" }]);
  });

  it("erro sem mensagem não vira string vazia", () => {
    expect(resumirCicloLojas([r(9, false)]).erros[0].erro).toBe("erro desconhecido");
  });

  it("nenhuma loja ativa: ciclo vazio, tudo zero", () => {
    expect(resumirCicloLojas([])).toEqual({ total: 0, ok: 0, falhas: 0, snapshotsAtualizados: 0, erros: [] });
  });
});
