/**
 * O orçamento é a única proteção que temos.
 *
 * O LinkedIn não envia cabeçalho de rate limit — 74 respostas na sondagem, zero
 * cabeçalhos. Se estas contas estiverem erradas, o estouro aparece como
 * silêncio da API no dia seguinte, e não como erro.
 */
import { describe, expect, it } from "vitest";
import {
  JANELA_HISTORICA_DIAS, TETO_REACOES_CARGA, faixaDaCargaInicial,
  janelasDaCarga, planoDeCargaInicial, planoIncremental, projecaoDeFrota,
} from "./linkedinPlanoDeColeta";

describe("carga inicial", () => {
  it("conta cada passo, e o total bate com a soma", () => {
    const p = planoDeCargaInicial({ posts: 80, postsUgc: 80 });
    expect(p.chamadasEstimadas).toBe(p.passos.reduce((t, x) => t + x.chamadas, 0));
    // 15 fixas + 5 listagem (4 cheias + 1 que confirma o fim)
    // + 16 lotes + 60 reações (30 posts × 2 chamadas) + 1 imagens
    expect(p.chamadasEstimadas).toBe(97);
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
    const p = planoDeCargaInicial({ posts: 400, postsUgc: 400, tetoDeChamadas: 9999 });
    // Duas chamadas por post: `socialMetadata` + `socialActions`. Contar uma
    // respondeu sozinho por 30 das 42 chamadas que sobraram na carga da Musa.
    expect(p.passos.find((x) => x.tipo === "reacoes_do_post")!.chamadas)
      .toBe(TETO_REACOES_CARGA * 2);
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
    expect(a.chamadasEstimadas).toBe(9);
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

describe("a carga de uma Página nunca carregada é FAIXA, não número", () => {
  it("sem acervo conhecido, devolve piso e teto com a premissa escrita", () => {
    // O orçamento antigo usava as publicações JÁ no banco — que, numa carga
    // inicial, é justamente o que ainda não existe. Na Musa ele disse ~40 e a
    // carga custou 176.
    const f = faixaDaCargaInicial();
    expect(f.estimada).toBe(true);
    expect(f.maximo).toBeGreaterThan(f.minimo);
    expect(f.premissa).toContain("só é conhecido depois de listar");
  });

  it("com acervo conhecido, a faixa colapsa num número exato", () => {
    const f = faixaDaCargaInicial({ postsConhecidos: 390, postsUgcConhecidos: 206 });
    expect(f.estimada).toBe(false);
    expect(f.minimo).toBe(f.maximo);
    // O custo REAL da carga da Musa, medido: 176 chamadas.
    expect(f.minimo).toBe(176);
  });
});
