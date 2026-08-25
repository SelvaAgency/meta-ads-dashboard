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
import { custoEstaPendente, diaSeguinte, janelaDaConsulta } from "./anthropicAdmin";

const ok = (i: string, f: string) => {
  const j = janelaDaConsulta(i, f);
  if (!j.ok) throw new Error(`esperava janela válida, veio: ${j.erro}`);
  return j;
};

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

describe("os seletores do filtro de período", () => {
  it("HOJE — início e fim no mesmo dia produz janela válida", () => {
    // O caso que quebrava: os dois lados truncavam para o mesmo instante.
    const j = ok("2026-08-19", "2026-08-19");
    expect(j.starting_at).toBe("2026-08-19T00:00:00Z");
    expect(j.ending_at).toBe("2026-08-20T00:00:00Z");
    expect(j.ending_at > j.starting_at).toBe(true);
  });

  it("ONTEM — mesmo dia, um dia atrás", () => {
    const j = ok("2026-08-18", "2026-08-18");
    expect(j.starting_at).toBe("2026-08-18T00:00:00Z");
    expect(j.ending_at).toBe("2026-08-19T00:00:00Z");
  });

  it("7 DIAS — cobre os sete, e não seis", () => {
    // O off-by-one silencioso: 13→19 são 7 dias, e a versão anterior devolvia
    // 6 buckets porque o último ficava fora.
    const j = ok("2026-08-13", "2026-08-19");
    expect(j.starting_at).toBe("2026-08-13T00:00:00Z");
    expect(j.ending_at).toBe("2026-08-20T00:00:00Z");
  });

  it("30 DIAS — o fim continua sendo o dia seguinte ao último", () => {
    const j = ok("2026-07-21", "2026-08-19");
    expect(j.ending_at).toBe("2026-08-20T00:00:00Z");
  });

  it("PERSONALIZADO de 1 dia — igual a Hoje, e válido", () => {
    const j = ok("2026-03-05", "2026-03-05");
    expect(j.ending_at).toBe("2026-03-06T00:00:00Z");
  });

  it("PERSONALIZADO longo, atravessando o mês", () => {
    const j = ok("2026-07-28", "2026-08-03");
    expect(j.starting_at).toBe("2026-07-28T00:00:00Z");
    expect(j.ending_at).toBe("2026-08-04T00:00:00Z");
  });

  /** A invariante que o endpoint exige, sobre todos os casos de uma vez. */
  it("ending_at é SEMPRE maior que starting_at", () => {
    const casos: Array<[string, string]> = [
      ["2026-08-19", "2026-08-19"], ["2026-08-18", "2026-08-18"],
      ["2026-08-13", "2026-08-19"], ["2026-07-21", "2026-08-19"],
      ["2026-12-31", "2026-12-31"], ["2028-02-29", "2028-02-29"],
    ];
    for (const [i, f] of casos) {
      const j = ok(i, f);
      expect(j.ending_at > j.starting_at, `${i} → ${f}`).toBe(true);
    }
  });

  /** Nenhum "+1 dia" indiscriminado: o início é sempre o dia pedido. */
  it("o início é exatamente o dia escolhido, em todo seletor", () => {
    for (const d of ["2026-08-19", "2026-01-01", "2026-12-31"]) {
      expect(ok(d, d).starting_at).toBe(`${d}T00:00:00Z`);
    }
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

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Custo ausente ≠ custo zero ≠ erro
 * ─────────────────────────────────────────────────────────────────────────────
 *  A Cost API entrega buckets de dia FECHADO. Com a janela válida, "Hoje"
 *  devolve 200 e nenhum bucket — e o total fica em zero. Zero na tela seria
 *  lido como "não gastamos nada hoje", que é o oposto de "a Anthropic ainda não
 *  processou o dia".
 * ─────────────────────────────────────────────────────────────────────────────
 */
describe("custoEstaPendente", () => {
  const p = (ultimoComCusto: string | null, ultimoDiaPedido: string, houveErro = false) =>
    custoEstaPendente({ ultimoComCusto, ultimoDiaPedido, houveErro });

  it("HOJE — o dia pedido ainda não tem bucket", () => {
    expect(p("2026-08-18", "2026-08-19")).toBe(true);
  });

  it("ONTEM — o dia já fechou, nada pendente", () => {
    expect(p("2026-08-18", "2026-08-18")).toBe(false);
  });

  it("7 dias terminando ontem — completo", () => {
    expect(p("2026-08-18", "2026-08-18")).toBe(false);
  });

  it("7 dias terminando HOJE — pendente, mesmo com seis dias fechados", () => {
    // A regra não pergunta "o período é hoje?": pergunta se o ÚLTIMO dia
    // pedido tem bucket. Qualquer janela que termine num dia aberto cai aqui.
    expect(p("2026-08-18", "2026-08-19")).toBe(true);
  });

  it("personalizado terminando hoje — mesmo tratamento, sem caso especial", () => {
    expect(p("2026-08-18", "2026-08-19")).toBe(true);
  });

  it("personalizado inteiramente no passado — completo", () => {
    expect(p("2026-07-15", "2026-07-15")).toBe(false);
  });

  it("nenhum bucket em todo o período também é pendência", () => {
    expect(p(null, "2026-08-19")).toBe(true);
  });

  it("com ERRO não se fala em pendência — são estados diferentes", () => {
    // Confundir os dois faria uma falha de integração parecer latência normal.
    expect(p(null, "2026-08-19", true)).toBe(false);
    expect(p("2026-08-18", "2026-08-19", true)).toBe(false);
  });

  it("custo além do pedido não é pendência", () => {
    // Não deveria acontecer, mas um bucket adiante do fim não torna nada
    // pendente — e a comparação por string cobre isso porque as datas são ISO.
    expect(p("2026-08-20", "2026-08-19")).toBe(false);
  });

  it("a comparação atravessa mês e ano corretamente", () => {
    expect(p("2026-08-31", "2026-09-01")).toBe(true);
    expect(p("2026-12-31", "2027-01-01")).toBe(true);
    expect(p("2027-01-01", "2026-12-31")).toBe(false);
  });
});
