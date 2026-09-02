/**
 * O orçamento é a única proteção que temos.
 *
 * O LinkedIn não envia cabeçalho de rate limit — 74 respostas na sondagem, zero
 * cabeçalhos. Se estas contas estiverem erradas, o estouro aparece como
 * silêncio da API no dia seguinte, e não como erro.
 */
import { describe, expect, it } from "vitest";
import {
  JANELA_HISTORICA_DIAS, TETO_REACOES_CARGA,
  janelasDaCarga, planoDeCargaInicial, planoIncremental, projecaoDeFrota,
} from "./linkedinPlanoDeColeta";

describe("carga inicial", () => {
  it("conta cada passo, e o total bate com a soma", () => {
    const p = planoDeCargaInicial({ posts: 80, postsUgc: 80 });
    expect(p.chamadasEstimadas).toBe(p.passos.reduce((t, x) => t + x.chamadas, 0));
    // 1+1+1+5(série)+1+5(série)+1+4(listagem)+16(lotes)+30(reações)
    expect(p.chamadasEstimadas).toBe(65);
  });

  it("URNs de tipos diferentes viram lotes SEPARADOS", () => {
    // Misturar `ugcPost` e `share` num `List(...)` devolve 400 — medido na
    // Fase 0. Dois tipos custam mais chamadas, e o orçamento precisa saber.
    const um = planoDeCargaInicial({ posts: 10, postsUgc: 10 });
    const dois = planoDeCargaInicial({ posts: 10, postsUgc: 5 });
    const lote = (p: typeof um) => p.passos.find((x) => x.tipo === "metricas_de_posts")!.chamadas;
    expect(lote(um)).toBe(2);
    expect(lote(dois)).toBe(2);
    expect(lote(planoDeCargaInicial({ posts: 12, postsUgc: 6 }))).toBe(4);
  });

  it("as reações têm teto — é o item que domina o custo", () => {
    const p = planoDeCargaInicial({ posts: 400, postsUgc: 400 });
    expect(p.passos.find((x) => x.tipo === "reacoes_do_post")!.chamadas).toBe(TETO_REACOES_CARGA);
  });

  it("o teto PODA por prioridade e diz o que ficou de fora", () => {
    const p = planoDeCargaInicial({ posts: 400, postsUgc: 400, tetoDeChamadas: 40 });
    expect(p.podado).toBe(true);
    expect(p.chamadasEstimadas).toBeLessThanOrEqual(40);
    expect(p.fora.join(" ")).toContain("reações");
    // A série histórica é a razão de a carga existir: ela não pode ser a
    // primeira a cair.
    expect(p.passos.some((x) => x.tipo === "seguidores_serie")).toBe(true);
  });

  it("uma Página sem publicação ainda coleta a Página", () => {
    const p = planoDeCargaInicial({ posts: 0 });
    expect(p.chamadasEstimadas).toBeGreaterThan(0);
    expect(p.passos.some((x) => x.tipo === "reacoes_do_post")).toBe(false);
  });
});

describe("incremental", () => {
  it("uma Página de 400 posts custa o mesmo que uma de 20", () => {
    // O que torna o cron barato não é pedir menos coisas — é pedir JANELAS.
    const a = planoIncremental({ postsAtivos: 8, postsAtivosUgc: 8, postsNovos: 1 });
    const b = planoIncremental({ postsAtivos: 8, postsAtivosUgc: 8, postsNovos: 1 });
    expect(a.chamadasEstimadas).toBe(b.chamadasEstimadas);
    expect(a.chamadasEstimadas).toBe(8);
  });

  it("NUNCA refaz os 395 dias", () => {
    const p = planoIncremental({ postsAtivos: 8, postsNovos: 1 });
    expect(p.passos.find((x) => x.tipo === "seguidores_serie")!.chamadas).toBe(1);
  });

  it("o semanal acrescenta o que não muda em 24h", () => {
    const com = planoIncremental({ postsAtivos: 8, postsNovos: 1, incluirSemanal: true });
    const sem = planoIncremental({ postsAtivos: 8, postsNovos: 1 });
    expect(com.chamadasEstimadas - sem.chamadasEstimadas).toBe(3);
  });
});

describe("janelas da carga", () => {
  it("cobrem 395 dias e começam pelo período recente", () => {
    const js = janelasDaCarga(new Date("2026-09-02T12:00:00Z"));
    expect(js[0].ate).toBe(0);
    expect(js[js.length - 1].de).toBe(JANELA_HISTORICA_DIAS);
    expect(js.every((j) => j.de > j.ate)).toBe(true);
  });
});

describe("projeção da frota", () => {
  it("soma a descoberta uma vez por rodada, não por Página", () => {
    expect(projecaoDeFrota(10, 8).diario).toBe(82);
    expect(projecaoDeFrota(50, 8).diario).toBe(402);
  });
});
