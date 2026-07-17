/**
 * Troca manual de cliente preserva a seção atual.
 *
 * A regra mudou no meio do caminho: primeiro era "sempre /dashboard", depois
 * virou "mantém a tela, troca só o cliente". Este teste fixa a regra nova com
 * os exemplos que o próprio produto deu — inclusive o /experiments/:id, que é
 * a exceção fácil de esquecer.
 */
import { describe, expect, it, beforeEach, vi } from "vitest";
import { rotaAoTrocarCliente } from "./ActiveAccountContext";

// A função lê window.location.search para a query. Controlamos isso no teste.
function comBusca(search: string) {
  vi.stubGlobal("window", { location: { search } });
}

beforeEach(() => vi.unstubAllGlobals());

describe("mantém a seção, troca o cliente", () => {
  it("Site com aba: preserva a aba e atualiza o account (exemplo do produto)", () => {
    comBusca("?account=15&aba=seguranca");
    expect(rotaAoTrocarCliente("/site?account=15&aba=seguranca", 4)).toBe("/site?account=4&aba=seguranca");
  });

  it("Campanhas (lê por estado, sem query): continua em Campanhas", () => {
    comBusca("");
    expect(rotaAoTrocarCliente("/campaigns", 4)).toBe("/campaigns");
  });

  it("Relatórios: continua em Relatórios", () => {
    comBusca("");
    expect(rotaAoTrocarCliente("/reports", 4)).toBe("/reports");
  });

  it("não injeta ?account= numa tela que não usava", () => {
    comBusca("");
    expect(rotaAoTrocarCliente("/dashboard", 4)).toBe("/dashboard");
  });
});

describe("cai para /dashboard quando a rota não serve ao cliente novo", () => {
  it("landing de portfólio (/overview)", () => {
    comBusca("");
    expect(rotaAoTrocarCliente("/overview", 4)).toBe("/dashboard");
  });

  it("experimento específico do cliente antigo (/experiments/42)", () => {
    comBusca("");
    expect(rotaAoTrocarCliente("/experiments/42", 4)).toBe("/dashboard");
  });

  it("mas a LISTA de experimentos (/experiments) é mantida", () => {
    comBusca("");
    expect(rotaAoTrocarCliente("/experiments", 4)).toBe("/experiments");
  });

  it("rota do Spaces, fora do Tracker", () => {
    comBusca("");
    expect(rotaAoTrocarCliente("/finance", 4)).toBe("/dashboard");
  });
});
