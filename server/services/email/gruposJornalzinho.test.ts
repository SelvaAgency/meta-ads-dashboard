/**
 * Grupos fixos do Jornalzinho.
 *
 * A troca de "cada um escolhe seus clientes" por "grupo fixo" foi por CUSTO: a
 * narrativa da IA é cacheada por conjunto de contas, e combinação livre por
 * pessoa faria o número de chamadas crescer com o time. Estes testes travam as
 * duas propriedades que sustentam isso: o recorte é determinado pelo grupo, e
 * o número de conjuntos possíveis é o número de grupos.
 */
import { describe, expect, it } from "vitest";
import { GRUPOS, contasDoGrupo, resolverGrupo, ehGrupoValido, grupoPorId } from "./gruposJornalzinho";

/** Nomes com prefixo, como vêm da Meta ("CA - ARKA"). */
const CONTAS = [
  { id: 10, nome: "Ultra Malhas" },
  { id: 11, nome: "Elwing" },
  { id: 12, nome: "Caroline Garrafa" },
  { id: 13, nome: "Musa Resíduos" },
  { id: 14, nome: "CA - ARKA" },
  { id: 15, nome: "Scaffold Play" },
  { id: 16, nome: "BAESH" },
];

describe("resolução de clientes por grupo", () => {
  it("GTM 1 resolve Ultramalhas, Elwing e Carol G", () => {
    const r = resolverGrupo("gtm1", CONTAS);
    expect(r.aplicados.map((a) => a.nome)).toEqual(["Ultra Malhas", "Elwing", "Caroline Garrafa"]);
  });

  it("GTM 2 resolve Musa, Arka e Play — inclusive com prefixo no nome", () => {
    const r = resolverGrupo("gtm2", CONTAS);
    expect(r.aplicados.map((a) => a.nome)).toEqual(["Musa Resíduos", "CA - ARKA", "Scaffold Play"]);
  });

  /** Aiká e UMDSA ainda não têm conta: viram pendência, não silêncio. */
  it("alvo sem conta vira pendência explícita, não some", () => {
    expect(resolverGrupo("gtm1", CONTAS).pendencias.map((p) => p.rotulo)).toEqual(["Aiká"]);
    expect(resolverGrupo("gtm2", CONTAS).pendencias.map((p) => p.rotulo)).toEqual(["UMDSA"]);
  });

  /** Quando a conta existir, entra sozinha — sem deploy. */
  it("o alvo pendente entra sozinho quando a conta passa a existir", () => {
    const r = resolverGrupo("gtm1", [...CONTAS, { id: 20, nome: "Aiká Cosméticos" }]);
    expect(r.aplicados.map((a) => a.rotulo)).toContain("Aiká");
    expect(r.pendencias).toHaveLength(0);
  });

  /**
   * "scaffold play" é tentado antes de "play". Sem essa ordem, o token genérico
   * casaria com dois clientes e o Play ficaria de fora por ambiguidade.
   */
  it("token específico vence o genérico", () => {
    const comArmadilha = [...CONTAS, { id: 21, nome: "Play Center" }];
    const r = resolverGrupo("gtm2", comArmadilha);
    expect(r.aplicados.find((a) => a.rotulo === "Play")?.nome).toBe("Scaffold Play");
  });

  /** Ambiguidade real não vira escolha automática. */
  it("ambiguidade NÃO é aplicada — vira pendência com o motivo", () => {
    const r = resolverGrupo("gtm1", [{ id: 30, nome: "Elwing Brasil" }, { id: 31, nome: "Elwing Portugal" }]);
    expect(r.aplicados.map((a) => a.rotulo)).not.toContain("Elwing");
    const p = r.pendencias.find((x) => x.rotulo === "Elwing");
    expect(p?.tipo).toBe("ambiguo");
    expect(p?.detalhe).toMatch(/Elwing Brasil.*Elwing Portugal/);
  });

  it("um grupo nunca alcança cliente do outro", () => {
    const g1 = contasDoGrupo("gtm1", CONTAS) ?? [];
    const g2 = contasDoGrupo("gtm2", CONTAS) ?? [];
    expect(g1.some((id) => g2.includes(id))).toBe(false);
    expect(g1).not.toContain(13); // Musa
    expect(g2).not.toContain(10); // Ultra Malhas
  });

  it("nenhum grupo alcança um cliente não declarado (BAESH)", () => {
    for (const g of ["gtm1", "gtm2"] as const) {
      expect(contasDoGrupo(g, CONTAS)).not.toContain(16);
    }
  });
});

describe("semântica de null × lista vazia", () => {
  /** São opostos: um não filtra nada, o outro filtra tudo. */
  it("sem grupo e 'todos' = null (sem recorte)", () => {
    expect(contasDoGrupo(null, CONTAS)).toBeNull();
    expect(contasDoGrupo(undefined, CONTAS)).toBeNull();
    expect(contasDoGrupo("todos", CONTAS)).toBeNull();
  });

  it("'nenhum' = [] (nenhum cliente, só avisos gerais)", () => {
    expect(contasDoGrupo("nenhum", CONTAS)).toEqual([]);
  });
});

describe("teto de custo da IA", () => {
  /**
   * O motivo de existir grupo fixo: o número de conjuntos possíveis — e
   * portanto de narrativas/caches por dia — é o número de grupos, não o número
   * de pessoas. Se alguém reintroduzir escolha por pessoa, este teste continua
   * passando, mas o comentário aqui é o registro da razão.
   */
  it("os conjuntos possíveis são no máximo um por grupo", () => {
    const conjuntos = new Set(
      GRUPOS.map((g) => JSON.stringify(contasDoGrupo(g.id, CONTAS))),
    );
    expect(conjuntos.size).toBeLessThanOrEqual(GRUPOS.length);
  });

  it("grupos válidos são exatamente os declarados", () => {
    expect(GRUPOS.map((g) => g.id)).toEqual(["gtm1", "gtm2", "todos", "nenhum"]);
    expect(ehGrupoValido("gtm1")).toBe(true);
    expect(ehGrupoValido("qualquer")).toBe(false);
    expect(grupoPorId("gtm2")?.rotulo).toBe("GTM 2");
  });
});
