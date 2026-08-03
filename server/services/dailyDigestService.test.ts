import { describe, it, expect } from "vitest";
import { BLOCOS_POR_PAPEL, statusDoRecibo, type Papel, type BlocoDigest } from "./dailyDigestService";
import { consomeDedupDeDigest, type StatusDigest } from "../db";

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

/**
 * ─── Recibo do digest × trava de duplicata ──────────────────────────────────
 * A trava existe para impedir DUPLICATA, não para registrar tentativa. Só
 * `sent` pode consumi-la.
 *
 * O caso real que motivou isto: rodar a simulação em dry-run de manhã queimava
 * a vaga do dia. Ao remover EMAIL_DRY_RUN à tarde, ninguém recebia e a tela
 * dizia "já enviado" — parecendo sucesso enquanto o e-mail nunca saiu.
 */
describe("status do recibo do digest", () => {
  it("pausado é 'paused', NÃO 'dry_run'", () => {
    // Pegadinha: a pausa mestre também devolve dryRun=true. Se a ordem das
    // checagens inverter, toda pausa vira ensaio no histórico.
    expect(statusDoRecibo({ ok: true, dryRun: true, pausado: true })).toBe("paused");
  });

  it("bloqueado é 'blocked', não se esconde entre os 'failed'", () => {
    expect(statusDoRecibo({ ok: false, dryRun: false, bloqueado: true })).toBe("blocked");
  });

  it("pulado é 'skipped'", () => {
    expect(statusDoRecibo({ ok: false, dryRun: false, pulado: true })).toBe("skipped");
  });

  it("ensaio é 'dry_run'", () => {
    expect(statusDoRecibo({ ok: true, dryRun: true })).toBe("dry_run");
  });

  it("entrega é 'sent' e falha de transporte é 'failed'", () => {
    expect(statusDoRecibo({ ok: true, dryRun: false })).toBe("sent");
    expect(statusDoRecibo({ ok: false, dryRun: false })).toBe("failed");
  });

  /**
   * O contrato inteiro em uma asserção: de todos os desfechos possíveis, só um
   * representa entrega — e só ele pode impedir um envio real no mesmo dia.
   */
  it("APENAS 'sent' representa entrega confirmada", () => {
    const desfechos = [
      { ok: true,  dryRun: true,  pausado: true },
      { ok: false, dryRun: false, bloqueado: true },
      { ok: false, dryRun: false, pulado: true },
      { ok: true,  dryRun: true },
      { ok: false, dryRun: false },
      { ok: true,  dryRun: false },
    ];
    const entregues = desfechos.map(statusDoRecibo).filter((s) => s === "sent");
    expect(entregues).toHaveLength(1);
  });
});

/**
 * A outra metade da regra: a consulta de duplicata só conta `sent`.
 *
 * `consomeDedupDeDigest` e a cláusula WHERE de `emailDigestJaEnviado` usam a
 * MESMA constante (STATUS_DIGEST_ENTREGUE), então este teste não verifica uma
 * cópia da regra — verifica a regra.
 */
describe("o que consome a trava de duplicata", () => {
  const TODOS: StatusDigest[] = ["sent", "failed", "dry_run", "paused", "blocked", "skipped"];

  it("só 'sent' consome", () => {
    expect(TODOS.filter(consomeDedupDeDigest)).toEqual(["sent"]);
  });

  it.each(["dry_run", "paused", "blocked", "skipped", "failed"])(
    "%s NÃO impede um envio real no mesmo dia",
    (s) => expect(consomeDedupDeDigest(s)).toBe(false),
  );

  /** O caso que motivou a correção, escrito por extenso. */
  it("ensaio de manhã não impede o envio real da tarde", () => {
    expect(consomeDedupDeDigest(statusDoRecibo({ ok: true, dryRun: true }))).toBe(false);
    expect(consomeDedupDeDigest(statusDoRecibo({ ok: true, dryRun: false }))).toBe(true);
  });
});
