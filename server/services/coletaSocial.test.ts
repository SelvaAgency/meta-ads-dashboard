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
import { coletarDeInstagram, diaDeHoje, METRICAS_MIDIA } from "./coletaSocial";
import type { Consultar } from "./instagramSondagem";

const BREAKDOWN = [{
  dimension_keys: ["follow_type"],
  results: [
    { dimension_values: ["FOLLOWER"], value: 1 },
    { dimension_values: ["NON_FOLLOWER"], value: 2 },
  ],
}];

const VALORES: Record<string, number> = {
  reach: 287, profile_views: 30, website_clicks: 0, profile_links_taps: 0,
  total_interactions: 13, views: 487,
  saved: 0, shares: 1, likes: 6, comments: 0,
};

const MIDIA_PADRAO = {
  id: "18001", caption: "Bastidores do ensaio", media_type: "VIDEO",
  media_product_type: "FEED", timestamp: "2026-08-10T21:00:00-0300",
  permalink: "https://instagram.com/p/x", like_count: 6, comments_count: 0,
};

/**
 * Responde como a Graph API respondeu nas sondagens reais de 12 e 13/08.
 *
 * Duas assimetrias medidas, e elas são o que este fake existe para reproduzir:
 *
 *   PERFIL EM LOTE   uma métrica inválida derruba a chamada INTEIRA — é por
 *                    isso que existe a queda para pedidos individuais
 *   MÍDIA ANINHADA   a métrica que não vale para aquele tipo simplesmente NÃO
 *                    VEM, em silêncio, e a listagem continua de pé
 *
 * A segunda é a perigosa: sem a regra do "pedida e não devolvida", a ausência
 * silenciosa viraria `null` e ficaria indistinguível de "não perguntamos".
 */
function api(opts: {
  metricasRecusadas?: string[];
  semStories?: boolean;
  storiesErro?: boolean;
  perfilErro?: boolean;
  midiasErro?: boolean;
  /** A listagem com `insights.metric(...)` é recusada; a listagem pura passa. */
  semAninhamento?: boolean;
  /** Qualquer chamada com mais de uma métrica é recusada. */
  loteRecusado?: boolean;
  midias?: Array<Record<string, unknown>>;
} = {}): Consultar {
  const recusadas = new Set(opts.metricasRecusadas ?? []);
  return vi.fn(async (caminho: string, params: Record<string, string>) => {
    if (caminho.includes("/stories")) {
      if (opts.storiesErro) throw new Error("Meta (10): sem permissão");
      return { data: opts.semStories ? [] : [{ id: "s1" }, { id: "s2" }, { id: "s3" }] } as never;
    }
    if (caminho.includes("/insights")) {
      const pedidas = (params.metric ?? "").split(",").filter(Boolean);
      if (pedidas.length > 1 && opts.loteRecusado) {
        throw new Error("Meta (100): (#100) lote recusado");
      }
      // A recusa derruba a chamada inteira, e não só a métrica ruim.
      const ruim = pedidas.find((m) => recusadas.has(m));
      if (ruim) throw new Error(`Meta (100): (#100) métrica ${ruim} indisponível`);
      if (pedidas[0] === "follows_and_unfollows") {
        return { data: [{ total_value: { breakdowns: BREAKDOWN } }] } as never;
      }
      if (pedidas[0] === "follower_count") return { data: [{ values: [{ value: 1 }] }] } as never;
      return { data: pedidas.map((m) => ({ name: m, total_value: { value: VALORES[m] ?? 0 } })) } as never;
    }
    if (caminho.includes("/media")) {
      if (opts.midiasErro) throw new Error("Meta (100): mídias indisponíveis");
      const aninhado = (params.fields ?? "").includes("insights.metric(");
      if (aninhado && opts.semAninhamento) {
        throw new Error("Meta (100): (#100) campo insights inválido");
      }
      const lista = opts.midias ?? [MIDIA_PADRAO];
      if (!aninhado) return { data: lista } as never;
      // Aninhado: a métrica que não vale para o tipo some da resposta, calada.
      return {
        data: lista.map((m) => ({
          ...m,
          insights: {
            data: METRICAS_MIDIA.filter((n) => !recusadas.has(n))
              .map((n) => ({ name: n, values: [{ value: VALORES[n] ?? 0 }] })),
          },
        })),
      } as never;
    }
    if (opts.perfilErro) throw new Error("Meta (190): token inválido");
    return { followers_count: 9464, follows_count: 1383, media_count: 587 } as never;
  }) as Consultar;
}

/** Os caminhos consultados, na ordem — o fake é um mock do vitest. */
const caminhosDe = (c: Consultar) =>
  (c as unknown as { mock: { calls: Array<[string, Record<string, string>]> } }).mock.calls;

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
    const fc = caminhosDe(c).find(([, p]) => p.metric === "follower_count");
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

  /**
   * O risco novo do caminho aninhado: a métrica ausente vem CALADA, sem erro. Se
   * o coletor mapeasse só o que chegou, ela viraria `null` — e `null` sem motivo
   * quer dizer "não perguntamos". Os dois primeiros estados colapsariam num só.
   */
  it("métrica de publicação ausente no aninhado é recusa, e não null mudo", async () => {
    const r = await coletarDeInstagram(api({ metricasRecusadas: ["saved"] }), "123");
    expect(r.midias[0].saves).toBeNull();
    expect(r.midias[0].recusadas.saved).toContain("não veio");
    expect(r.midias[0].reach).toBe(287);
  });

  /** O mesmo silêncio existe no lote de perfil, e a regra ali é a mesma. */
  it("métrica de perfil ausente no lote entra em recusadas", async () => {
    const c: Consultar = vi.fn(async (caminho: string, params: Record<string, string>) => {
      if (caminho.includes("/stories")) return { data: [] } as never;
      if (caminho.includes("/media")) return { data: [] } as never;
      if (caminho.includes("/insights")) {
        // Devolve tudo menos `views` — sem erro nenhum, como a Meta faz.
        const pedidas = (params.metric ?? "").split(",").filter((m) => m !== "views");
        return { data: pedidas.map((m) => ({ name: m, total_value: { value: VALORES[m] ?? 0 } })) } as never;
      }
      return { followers_count: 10 } as never;
    }) as Consultar;
    const r = await coletarDeInstagram(c, "123");
    expect(r.metricas.views).toBeUndefined();
    expect(r.recusadas.views).toContain("não veio");
    expect(r.metricas.reach).toBe(287);
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
    const caminhos = caminhosDe(c).map((x) => x[0]);
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
    const caminhos = caminhosDe(c).map((x) => x[0]);
    expect(caminhos[0]).toBe("123/stories");
  });
});

describe("o caminho aninhado, e a cascata que protege contra ele", () => {
  const tresMidias = [
    { ...MIDIA_PADRAO, id: "1" },
    { ...MIDIA_PADRAO, id: "2", media_type: "CAROUSEL_ALBUM" },
    { ...MIDIA_PADRAO, id: "3", media_type: "VIDEO", media_product_type: "REELS" },
  ];

  /**
   * A conta que motivou a mudança: eram 186 chamadas por cliente, e a Meta
   * respondia com código de volume nas últimas contas da fila.
   */
  it("a coleta inteira cabe em 8 chamadas, com quantas publicações forem", async () => {
    const cAninhado = api({ midias: tresMidias });
    const r3 = await coletarDeInstagram(cAninhado, "123");

    // stories · perfil · lote de 6 · follower_count · replies ·
    // lote de engajamento (4) · follows_and_unfollows · listagem = 8
    //
    // As duas últimas custam um lote cada de propósito: nenhuma delas rodou em
    // produção, e uma recusa dentro do lote principal derrubaria as seis que já
    // funcionam — 1 chamada viraria 10, em toda conta, todo dia. Em lote
    // próprio, a recusa custa aquele lote e nada mais.
    expect(r3.chamadas).toBe(8);
    expect(r3.caminhoDasMidias).toBe("aninhado");
    expect(r3.midias).toHaveLength(3);
    // O número NÃO cresce com a quantidade de publicações — era isso que
    // custava 175 chamadas antes. São 5 de insights: o lote de 6,
    // `follower_count`, `replies`, o lote de engajamento e
    // `follows_and_unfollows`.
    expect(caminhosDe(cAninhado).filter(([p]) => p.includes("/insights"))).toHaveLength(5);
  });

  it("nenhuma métrica se perde no aninhamento", async () => {
    const r = await coletarDeInstagram(api({ midias: tresMidias }), "123");
    for (const m of r.midias) {
      expect(m.reach).toBe(287);
      expect(m.views).toBe(487);
      expect(m.shares).toBe(1);
      expect(m.saves).toBe(0);
      expect(m.totalInteractions).toBe(13);
      expect(m.recusadas).toEqual({});
    }
  });

  /**
   * O risco que a cascata existe para cobrir: um campo inválido derruba a
   * listagem INTEIRA. Sem o degrau 2, o cliente ficaria sem publicação nenhuma
   * — pior que o desenho antigo, onde uma métrica morta custava uma métrica.
   */
  it("listagem aninhada recusada não custa as publicações", async () => {
    const c = api({ semAninhamento: true, midias: tresMidias });
    const r = await coletarDeInstagram(c, "123");
    expect(r.midias).toHaveLength(3);
    expect(r.midias[0].reach).toBe(287);
    expect(r.caminhoDasMidias).toBe("lote");
    expect(r.recusadas.midias_aninhadas).toBeTruthy();
    // A listagem foi refeita sem insights, e cada mídia pediu seu lote.
    expect(r.chamadas).toBe(12);
  });

  /** Degrau 3: o desenho antigo, agora só quando os dois de cima falham. */
  it("lote recusado cai para métrica por métrica, sem perder nada", async () => {
    const r = await coletarDeInstagram(
      api({ semAninhamento: true, loteRecusado: true, midias: tresMidias }), "123");
    expect(r.caminhoDasMidias).toBe("individual");
    expect(r.midias[0].reach).toBe(287);
    // O perfil também caiu para individual, e as métricas continuam lá.
    expect(r.metricas.reach).toBe(287);
    expect(r.metricas.profile_views).toBe(30);
  });

  /** Perder cinco métricas boas por causa de uma ruim seria o pior desfecho. */
  it("uma métrica de perfil inválida não leva as outras junto", async () => {
    const r = await coletarDeInstagram(api({ metricasRecusadas: ["profile_views"] }), "123");
    expect(r.metricas.reach).toBe(287);
    expect(r.metricas.views).toBe(487);
    expect(r.metricas.total_interactions).toBe(13);
    expect(r.metricas.profile_views).toBeUndefined();
  });
});

describe("o dia da coleta", () => {
  /** Fuso de São Paulo: 21h aqui ainda é hoje, e em UTC já seria amanhã. */
  it("usa o fuso de São Paulo, e não UTC", () => {
    expect(diaDeHoje(new Date("2026-08-31T23:30:00-03:00"))).toBe("2026-08-31");
    expect(diaDeHoje(new Date("2026-09-01T02:30:00Z"))).toBe("2026-08-31");
  });
});
