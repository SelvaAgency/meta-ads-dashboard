/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  A janela da consulta à Anthropic — dois bugs no mesmo `T23:59:59Z`
 * ─────────────────────────────────────────────────────────────────────────────
 *  Com `bucket_width=1d` a API alinha os limites ao início do dia UTC. Um
 *  `ending_at` às 23:59:59 do dia 19 era truncado para 19T00:00:00Z, e daí:
 *
 *    1. o bucket do último dia ficava de fora — 13→19 devolvia 6 buckets
 *       para um intervalo de 7 dias;
 *    2. um período de UM dia truncava os dois lados para o mesmo instante, e a
 *       API respondia "ending date must be after starting date".
 *
 *  O segundo é o que quebrava Hoje, Ontem e o personalizado de um dia.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, expect, it } from "vitest";
import { diaSeguinte, janelaDaConsulta } from "./anthropicAdmin";

describe("diaSeguinte", () => {
  it("avança um dia", () => {
    expect(diaSeguinte("2026-08-19")).toBe("2026-08-20");
  });
  it("atravessa a virada de mês", () => {
    expect(diaSeguinte("2026-08-31")).toBe("2026-09-01");
  });
  it("atravessa a virada de ano", () => {
    expect(diaSeguinte("2026-12-31")).toBe("2027-01-01");
  });
  it("acerta 29 de fevereiro em ano bissexto", () => {
    expect(diaSeguinte("2028-02-28")).toBe("2028-02-29");
    expect(diaSeguinte("2028-02-29")).toBe("2028-03-01");
  });
  it("acerta fevereiro em ano comum", () => {
    expect(diaSeguinte("2026-02-28")).toBe("2026-03-01");
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  O request FINAL, com "hoje" fixado — não a função intermediária
 * ─────────────────────────────────────────────────────────────────────────────
 *  A causa de "só Hoje quebra" viveu duas rodadas porque cada camada estava
 *  certa isoladamente. A API não valida o intervalo que recebe: ela ALINHA
 *  primeiro — recuando um `ending_at` futuro até a última fronteira de bucket
 *  fechada — e valida depois. Para um período de um dia só, que começa
 *  exatamente nessa fronteira, os dois lados colapsam.
 *
 *  Por isso estes testes fixam `hoje` e conferem o par que sai da função, e não
 *  o que entra nela.
 * ─────────────────────────────────────────────────────────────────────────────
 */
const HOJE = "2026-08-25";

const janela = (i: string, f: string, hoje = HOJE) => janelaDaConsulta(i, f, hoje);
const valida = (i: string, f: string, hoje = HOJE) => {
  const j = janela(i, f, hoje);
  if (!j.ok) throw new Error(`esperava janela válida, veio: ${j.motivo} — ${j.erro}`);
  return j;
};

describe("o caso reportado: período HOJE", () => {
  it("não produz janela — o dia ainda não fechou", () => {
    // E isto NÃO é erro: é ausência de dado. A chamada nem sai.
    const j = janela(HOJE, HOJE);
    expect(j.ok).toBe(false);
    if (!j.ok) {
      expect(j.motivo).toBe("dia_aberto");
      expect(j.erro).toContain("não fechado");
    }
  });

  it("dia aberto é distinto de intervalo inválido", () => {
    // Os dois estados viram telas diferentes: pendência versus erro.
    const aberto = janela(HOJE, HOJE);
    const torto = janela("2026-08-25", "2026-08-13");
    if (!aberto.ok && !torto.ok) {
      expect(aberto.motivo).toBe("dia_aberto");
      expect(torto.motivo).toBe("invalido");
    }
  });

  it("ONTEM continua funcionando — o dia fechou", () => {
    const j = valida("2026-08-24", "2026-08-24");
    expect(j.starting_at).toBe("2026-08-24T00:00:00Z");
    expect(j.ending_at).toBe("2026-08-25T00:00:00Z");
    expect(j.recuado).toBe(false);
  });

  it("7d terminando hoje: consulta até ontem, e AVISA que recuou", () => {
    // O silêncio anterior era este: o dia corrente saía da conta sem ninguém
    // saber. Agora `recuado` sobe até a tela como "não inclui hoje".
    const j = valida("2026-08-19", HOJE);
    expect(j.starting_at).toBe("2026-08-19T00:00:00Z");
    expect(j.ending_at).toBe("2026-08-25T00:00:00Z");
    expect(j.recuado).toBe(true);
  });

  it("30d terminando hoje: mesma regra", () => {
    const j = valida("2026-07-27", HOJE);
    expect(j.ending_at).toBe("2026-08-25T00:00:00Z");
    expect(j.recuado).toBe(true);
  });

  it("personalizado 25/08 → 25/08 é o mesmo caso de Hoje", () => {
    const j = janela("2026-08-25", "2026-08-25");
    expect(j.ok).toBe(false);
    if (!j.ok) expect(j.motivo).toBe("dia_aberto");
  });

  it("período inteiramente no passado não é recuado", () => {
    const j = valida("2026-08-10", "2026-08-16");
    expect(j.ending_at).toBe("2026-08-17T00:00:00Z");
    expect(j.recuado).toBe(false);
  });

  it("período que termina exatamente ontem cobre ontem inteiro", () => {
    const j = valida("2026-08-20", "2026-08-24");
    expect(j.ending_at).toBe("2026-08-25T00:00:00Z");
  });

  /** A invariante do endpoint, sobre toda janela que a função aceita emitir. */
  it("quando há janela, ending_at é SEMPRE maior que starting_at", () => {
    const casos: Array<[string, string]> = [
      ["2026-08-24", "2026-08-24"], ["2026-08-19", "2026-08-25"],
      ["2026-07-27", "2026-08-25"], ["2026-08-10", "2026-08-16"],
      ["2026-01-01", "2026-08-25"],
    ];
    for (const [i, f] of casos) {
      const j = valida(i, f);
      expect(j.ending_at > j.starting_at, `${i} → ${f}`).toBe(true);
    }
  });

  it("a virada de mês respeita o teto de hoje", () => {
    const j = valida("2026-08-28", "2026-09-02", "2026-09-01");
    expect(j.ending_at).toBe("2026-09-01T00:00:00Z");
    expect(j.recuado).toBe(true);
  });
});

describe("a proteção antes da chamada", () => {
  it("intervalo invertido é recusado sem ir à rede", () => {
    const j = janelaDaConsulta("2026-08-19", "2026-08-13");
    expect(j.ok).toBe(false);
    if (!j.ok) expect(j.erro).toContain("invertido");
  });

  it("data mal formada é recusada com a forma esperada na mensagem", () => {
    for (const [i, f] of [["19/08/2026", "2026-08-19"], ["2026-08-19", ""], ["", ""]]) {
      const j = janelaDaConsulta(i, f);
      expect(j.ok, `${i} → ${f}`).toBe(false);
      if (!j.ok) expect(j.erro).toContain("AAAA-MM-DD");
    }
  });

  it("o erro é legível, e nunca vira custo zero", () => {
    // Um zero ali afirmaria que não se gastou nada — que é o oposto de "não
    // conseguimos perguntar".
    const j = janelaDaConsulta("2026-08-19", "2026-08-13");
    if (!j.ok) {
      expect(j.erro).toContain("2026-08-13");
      expect(j.erro).toContain("2026-08-19");
    }
  });
});
