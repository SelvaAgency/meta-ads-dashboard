import { describe, it, expect } from "vitest";
import { BLOCOS_POR_PAPEL, type Papel, type BlocoDigest } from "./dailyDigestService";

/**
 * A matriz papel → blocos É a regra de privacidade do Jornalzinho. Um `push`
 * distraído em BLOCOS_POR_PAPEL.user manda contas a pagar da agência para o time
 * inteiro — e nada quebraria, o e-mail só sairia com um bloco a mais.
 *
 * Estes testes existem para essa mudança falhar em vermelho antes de sair.
 */
describe("matriz de blocos por papel", () => {
  const papeis: Papel[] = ["admin", "developer", "user"];

  it("financeiro é exclusivo de admin", () => {
    expect(BLOCOS_POR_PAPEL.admin).toContain("financeiro");
    expect(BLOCOS_POR_PAPEL.developer).not.toContain("financeiro");
    expect(BLOCOS_POR_PAPEL.user).not.toContain("financeiro");
  });

  it("nenhum papel além de admin vê financeiro", () => {
    const comFinanceiro = papeis.filter((p) => BLOCOS_POR_PAPEL[p].includes("financeiro"));
    expect(comFinanceiro).toEqual(["admin"]);
  });

  it("aniversários e comunicados são institucionais — vão para todos", () => {
    for (const p of papeis) {
      expect(BLOCOS_POR_PAPEL[p]).toContain("aniversarios");
      expect(BLOCOS_POR_PAPEL[p]).toContain("comunicados");
    }
  });

  it("performance de cliente é de admin e user — developer não cuida disso", () => {
    expect(BLOCOS_POR_PAPEL.admin).toContain("performance");
    expect(BLOCOS_POR_PAPEL.user).toContain("performance");
    expect(BLOCOS_POR_PAPEL.developer).not.toContain("performance");
  });

  it("site técnico é de admin e developer — user não recebe", () => {
    expect(BLOCOS_POR_PAPEL.admin).toContain("site");
    expect(BLOCOS_POR_PAPEL.developer).toContain("site");
    expect(BLOCOS_POR_PAPEL.user).not.toContain("site");
  });

  it("developer e user não se sobrepõem fora do institucional", () => {
    const institucional = new Set(["aniversarios", "comunicados"]);
    const dev = BLOCOS_POR_PAPEL.developer.filter((b) => !institucional.has(b));
    const usr = BLOCOS_POR_PAPEL.user.filter((b) => !institucional.has(b));
    expect(dev.filter((b) => usr.includes(b))).toEqual([]);
  });

  it("admin recebe tudo que existe", () => {
    const todos = new Set<BlocoDigest>(papeis.flatMap((p) => BLOCOS_POR_PAPEL[p]));
    expect(new Set(BLOCOS_POR_PAPEL.admin)).toEqual(todos);
  });

  it("Trello e Calendar ficam de fora — eles já notificam sozinhos", () => {
    for (const p of papeis) {
      const blocos = BLOCOS_POR_PAPEL[p] as string[];
      expect(blocos).not.toContain("tarefas");
      expect(blocos).not.toContain("trello");
      expect(blocos).not.toContain("reunioes");
      expect(blocos).not.toContain("calendar");
    }
  });

  it("nenhum papel tem bloco repetido", () => {
    for (const p of papeis) {
      expect(BLOCOS_POR_PAPEL[p].length).toBe(new Set(BLOCOS_POR_PAPEL[p]).size);
    }
  });
});
