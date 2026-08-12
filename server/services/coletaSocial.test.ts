/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  O coletor é a única testemunha daquele dia
 * ─────────────────────────────────────────────────────────────────────────────
 *  O que ele não gravar não volta: stories expiram em 24h, e alcance e curtidas
 *  do dia mudam depois. Por isso os dois riscos daqui são permanentes, não
 *  temporários:
 *
 *   ZERO FALSO   um `?? 0` transformaria "a Meta recusou" em "deu zero", e o
 *                snapshot é o único registro — a diferença some para sempre
 *
 *   INTERPRETAR  gravar FOLLOWER/NON_FOLLOWER já traduzido decidiria por
 *                aritmética futura uma questão ainda aberta, e uma leitura
 *                invertida ficaria impossível de corrigir sem o dado original
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, expect, it, vi } from "vitest";
import { coletarDeInstagram, diaDeHoje } from "./coletaSocial";
import type { Consultar } from "./instagramSondagem";

const BREAKDOWN = [{
  dimension_keys: ["follow_type"],
  results: [
    { dimension_values: ["FOLLOWER"], value: 1 },
    { dimension_values: ["NON_FOLLOWER"], value: 2 },
  ],
}];

/** Responde como a Graph API respondeu na sondagem real de 12/08. */
function api(opts: {
  metricasRecusadas?: string[];
  semStories?: boolean;
  storiesErro?: boolean;
  perfilErro?: boolean;
  midiasErro?: boolean;
  midias?: Array<Record<string, unknown>>;
} = {}): Consultar {
  const recusadas = new Set(opts.metricasRecusadas ?? []);
  return vi.fn(async (caminho: string, params: Record<string, string>) => {
    if (caminho.includes("/stories")) {
      if (opts.storiesErro) throw new Error("Meta (10): sem permissão");
      return { data: opts.semStories ? [] : [{ id: "s1" }, { id: "s2" }, { id: "s3" }] } as never;
    }
    if (caminho.includes("/insights")) {
      const m = params.metric;
      if (recusadas.has(m)) throw new Error(`Meta (100): (#100) métrica ${m} indisponível`);
      if (m === "follows_and_unfollows") {
        return { data: [{ total_value: { breakdowns: BREAKDOWN } }] } as never;
      }
      if (m === "follower_count") return { data: [{ values: [{ value: 1 }] }] } as never;
      const valores: Record<string, number> = {
        reach: 287, profile_views: 30, website_clicks: 0, profile_links_taps: 0,
        total_interactions: 13, views: 487,
        saved: 0, shares: 1, likes: 6, comments: 0,
      };
      return { data: [{ total_value: { value: valores[m] ?? 0 } }] } as never;
    }
    if (caminho.includes("/media")) {
      if (opts.midiasErro) throw new Error("Meta (100): mídias indisponíveis");
      return { data: opts.midias ?? [{
        id: "18001", caption: "Bastidores do ensaio", media_type: "VIDEO",
        media_product_type: "FEED", timestamp: "2026-08-10T21:00:00-0300",
        permalink: "https://instagram.com/p/x", like_count: 6, comments_count: 0,
      }] } as never;
    }
    if (opts.perfilErro) throw new Error("Meta (190): token inválido");
    return { followers_count: 9464, follows_count: 1383, media_count: 587 } as never;
  }) as Consultar;
}

describe("a coleta traz o que a sondagem provou existir", () => {
  it("perfil, métricas e publicação", async () => {
    const r = await coletarDeInstagram(api(), "17841400000000000");
    expect(r.followersCount).toBe(9464);
    expect(r.followsCount).toBe(1383);
    expect(r.mediaCount).toBe(587);
    expect(r.metricas.reach).toBe(287);
    expect(r.metricas.follower_count).toBe(1);
    expect(r.midias).toHaveLength(1);
    expect(r.status).toBe("ok");
  });

  /** `follower_count` recusa metric_type — foi o erro da primeira sondagem. */
  it("follower_count é pedido SEM metric_type", async () => {
    const c = api();
    await coletarDeInstagram(c, "123");
    const chamadas = (c as unknown as { mock: { calls: Array<[string, Record<string, string>]> } }).mock.calls;
    const fc = chamadas.find(([, p]) => p.metric === "follower_count");
    expect(fc?.[1].metric_type).toBeUndefined();
    expect(fc?.[1].period).toBe("day");
  });

  it("o tipo do conteúdo é classificado pelos dois campos", async () => {
    // VIDEO + FEED é publicação de feed antiga, e não reel.
    const r = await coletarDeInstagram(api(), "123");
    expect(r.midias[0].tipo).toBe("FEED");
  });

  it("a legenda é truncada — serve para reconhecer o post, não para guardá-lo", async () => {
    const longa = "x".repeat(900);
    const r = await coletarDeInstagram(api({ midias: [{ id: "1", caption: longa, timestamp: "2026-08-10T10:00:00+0000" }] }), "123");
    expect(r.midias[0].legenda).toHaveLength(300);
  });
});

describe("nenhum zero de consolo", () => {
  /** O zero que É zero: a Meta mediu e não houve clique. */
  it("zero medido entra em métricas como 0", async () => {
    const r = await coletarDeInstagram(api(), "123");
    expect(r.metricas.website_clicks).toBe(0);
    expect(r.metricas.profile_links_taps).toBe(0);
  });

  /** O zero que NÃO existe: recusada fica fora de métricas, com o motivo. */
  it("métrica recusada não vira 0 — sai de métricas e entra em recusadas", async () => {
    const r = await coletarDeInstagram(api({ metricasRecusadas: ["profile_views"] }), "123");
    expect(r.metricas.profile_views).toBeUndefined();
    expect(r.recusadas.profile_views).toContain("100");
    expect(r.status).toBe("parcial");
  });

  it("stories que falharam ficam null, e não 0", async () => {
    const r = await coletarDeInstagram(api({ storiesErro: true }), "123");
    expect(r.storiesVistos).toBeNull();
    expect(r.recusadas.stories).toBeTruthy();
  });

  /** Nenhum story no ar, com endpoint funcionando, é zero verdadeiro. */
  it("nenhum story com endpoint ok é 0 de verdade", async () => {
    const r = await coletarDeInstagram(api({ semStories: true }), "123");
    expect(r.storiesVistos).toBe(0);
    expect(r.recusadas.stories).toBeUndefined();
  });

  it("métrica de publicação recusada fica null, com o motivo por publicação", async () => {
    const r = await coletarDeInstagram(api({ metricasRecusadas: ["saved"] }), "123");
    expect(r.midias[0].saves).toBeNull();
    expect(r.midias[0].recusadas.saved).toBeTruthy();
    expect(r.midias[0].reach).toBe(287);
  });
});

describe("o breakdown vai cru", () => {
  /**
   * Gravar interpretado decidiria hoje uma questão que só a aritmética de vários
   * dias resolve — e uma leitura invertida não teria como ser corrigida depois.
   */
  it("guarda o breakdown como veio, sem traduzir para entradas e saídas", async () => {
    const r = await coletarDeInstagram(api(), "123");
    expect(r.followTypeBreakdownRaw).toEqual(BREAKDOWN);
    const texto = JSON.stringify(r);
    expect(texto).not.toContain("novosSeguidores");
    expect(texto).not.toContain("entradas");
    expect(texto).not.toContain("saidas");
  });

  it("breakdown ausente é registrado como recusa, e não como zero", async () => {
    const r = await coletarDeInstagram(api({ metricasRecusadas: ["follows_and_unfollows"] }), "123");
    expect(r.followTypeBreakdownRaw).toBeNull();
    expect(r.recusadas.follows_and_unfollows).toBeTruthy();
  });
});

describe("uma falha não derruba a coleta inteira", () => {
  it("perfil que falha ainda deixa métricas e publicações serem gravadas", async () => {
    const r = await coletarDeInstagram(api({ perfilErro: true }), "123");
    expect(r.followersCount).toBeNull();
    expect(r.metricas.reach).toBe(287);
    expect(r.midias).toHaveLength(1);
    expect(r.status).toBe("parcial");
  });

  it("mídias que falham ainda deixam o perfil ser gravado", async () => {
    const r = await coletarDeInstagram(api({ midiasErro: true }), "123");
    expect(r.midias).toEqual([]);
    expect(r.followersCount).toBe(9464);
    expect(r.status).toBe("parcial");
  });

  /** "erro" só quando NADA veio — senão a série descartaria um dia bom. */
  it("só é 'erro' quando nada foi obtido", async () => {
    const tudoFalha: Consultar = vi.fn(async () => { throw new Error("Meta (190): token expirado"); }) as Consultar;
    const r = await coletarDeInstagram(tudoFalha, "123");
    expect(r.status).toBe("erro");
    expect(r.erro).toContain("190");
    expect(r.followersCount).toBeNull();
  });
});

describe("a passada só de stories", () => {
  /**
   * Ela mede uma coisa só. Se lesse o resto, gastaria ~20 chamadas por cliente
   * para gravar de novo o que a manhã já gravou.
   */
  it("não consulta perfil, insights nem mídias", async () => {
    const c = api();
    const r = await coletarDeInstagram(c, "123", { apenasStories: true });
    const caminhos = (c as unknown as { mock: { calls: string[][] } }).mock.calls.map((x) => x[0]);
    expect(caminhos).toEqual(["123/stories"]);
    expect(r.storiesVistos).toBe(3);
    expect(r.status).toBe("ok");
  });

  it("stories que falham na passada da tarde marcam erro, sem zerar nada", async () => {
    const r = await coletarDeInstagram(api({ storiesErro: true }), "123", { apenasStories: true });
    expect(r.status).toBe("erro");
    expect(r.storiesVistos).toBeNull();
  });

  /** Story é a leitura que não espera: vive 24h e não se refaz depois. */
  it("stories são lidos ANTES de qualquer outra coisa", async () => {
    const c = api();
    await coletarDeInstagram(c, "123");
    const caminhos = (c as unknown as { mock: { calls: string[][] } }).mock.calls.map((x) => x[0]);
    expect(caminhos[0]).toBe("123/stories");
  });
});

describe("o dia da coleta", () => {
  /** Fuso de São Paulo: 21h aqui ainda é hoje, e em UTC já seria amanhã. */
  it("usa o fuso de São Paulo, e não UTC", () => {
    expect(diaDeHoje(new Date("2026-08-31T23:30:00-03:00"))).toBe("2026-08-31");
    expect(diaDeHoje(new Date("2026-09-01T02:30:00Z"))).toBe("2026-08-31");
  });
});
