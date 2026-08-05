/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  O predicado que decide se uma tela de mídia renderiza
 * ─────────────────────────────────────────────────────────────────────────────
 *  Errar aqui tem duas faces, e a segunda é pior: um falso negativo mostra o
 *  Dashboard zerado da Aiká (ruim); um falso POSITIVO esconde o Dashboard de um
 *  cliente que tem mídia — e ele descobriria isso não vendo os próprios dados.
 *
 *  Por isso a regra é a mesma do lado do servidor (`ehContaDeMidia`): campo
 *  ausente significa CLIENTE COM MÍDIA. Toda conta que existia antes da coluna
 *  tem o campo ausente, e tratá-lo como "sem mídia" apagaria o portfólio
 *  inteiro das telas.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, expect, it } from "vitest";
import { clienteSemMidia } from "./SemMidia";

describe("clienteSemMidia", () => {
  it("cliente atendido só no Site", () => {
    expect(clienteSemMidia({ somenteMonitoramento: true })).toBe(true);
  });

  it.each([
    ["campo false", { somenteMonitoramento: false }],
    ["campo ausente (conta legada)", {}],
    ["campo null", { somenteMonitoramento: null }],
    ["campo undefined", { somenteMonitoramento: undefined }],
  ])("%s → tem mídia, e a tela renderiza normalmente", (_n, conta) => {
    expect(clienteSemMidia(conta)).toBe(false);
  });

  /** Antes de a lista carregar não há conta selecionada. */
  it.each([[null], [undefined]])("sem conta (%s) não esconde nada", (v) => {
    expect(clienteSemMidia(v)).toBe(false);
  });
});
