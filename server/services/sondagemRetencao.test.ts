/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  A sondagem de retenção, sem rede
 * ─────────────────────────────────────────────────────────────────────────────
 *  O que estes testes protegem não é o texto do relatório: é o VEREDITO. Uma
 *  sondagem que conclui "PARCIAL" quando a API não entregou nada seria pior que
 *  não sondar — ela autorizaria implementar uma métrica que não existe.
 *
 *  O transporte é falso e responde por caminho, então cada cenário descreve uma
 *  API inteira: uma que só tem tempo médio, uma que tem a curva, uma que não
 *  tem nada. É a única forma de provar que o veredito sai do DADO e não de uma
 *  frase escrita à mão.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, expect, it } from "vitest";
import {
  sondarRetencao, vereditoDe, vocabularioDaMensagem,
  type ConsultarCru, type LinhaDaSondagem,
} from "./sondagemRetencao";

const MENSAGEM_REAL =
  "(#100) metric[0] must be one of the following values: "
  + "comments, follows, likes, reach, saved, shares, total_interactions, views, "
  + "ig_reels_avg_watch_time, ig_reels_video_view_total_time, clips_replays_count";

/** Uma API de mentira que responde pelo caminho e pelos params. */
function apiFalsa(regras: {
  midias?: Array<{ id: string; media_product_type: string }>;
  vocabulario?: string;
  duracao?: Record<string, unknown>;
  insights?: Record<string, unknown>;
  recorteResponde?: boolean;
}): { consultar: ConsultarCru; chamadas: () => number } {
  let n = 0;
  const consultar: ConsultarCru = async (caminho, params) => {
    n += 1;
    if (caminho.endsWith("/media")) {
      return { status: 200, corpo: { data: regras.midias ?? [] }, erro: null };
    }
    if (caminho.endsWith("/insights")) {
      const m = params.metric;
      if (params.breakdown) {
        return regras.recorteResponde
          ? { status: 200, corpo: { data: [{ total_value: { breakdowns: [{ results: [{ dimension_values: ["0"], value: 100 }] }] } }] }, erro: null }
          : { status: 400, corpo: null, erro: { mensagem: `breakdown ${params.breakdown} não suportado`, codigo: 100, subcodigo: null } };
      }
      if (m === "selva_metrica_que_nao_existe") {
        return {
          status: 400, corpo: null,
          erro: { mensagem: regras.vocabulario ?? MENSAGEM_REAL, codigo: 100, subcodigo: 2108006 },
        };
      }
      const v = regras.insights?.[m];
      if (v === undefined) {
        return { status: 400, corpo: null, erro: { mensagem: `metric ${m} inválida`, codigo: 100, subcodigo: null } };
      }
      if (v === null) return { status: 200, corpo: { data: [] }, erro: null };
      return { status: 200, corpo: { data: [{ total_value: { value: v } }] }, erro: null };
    }
    // Campo na mídia (duração).
    const campo = params.fields;
    const tem = regras.duracao ?? {};
    if (!(campo in tem)) {
      return { status: 400, corpo: null, erro: { mensagem: `campo ${campo} não existe`, codigo: 100, subcodigo: 33 } };
    }
    return { status: 200, corpo: { [campo]: tem[campo] }, erro: null };
  };
  return { consultar, chamadas: () => n };
}

const CINCO_REELS = Array.from({ length: 5 }, (_, i) => ({
  id: `reel${i}`, media_product_type: "REELS",
}));

describe("o vocabulário sai da mensagem da Meta", () => {
  /**
   * A extração não pode depender da frase. A Meta já reescreveu esse texto
   * antes, e uma regex ancorada em "must be one of the following" quebraria
   * calada — o relatório diria "vocabulário vazio" como se fosse um fato sobre
   * a API, e não sobre o nosso parser.
   */
  it("colhe os nomes em snake_case, seja qual for a frase", () => {
    const v = vocabularioDaMensagem(MENSAGEM_REAL);
    expect(v).toContain("ig_reels_avg_watch_time");
    expect(v).toContain("ig_reels_video_view_total_time");
    expect(v).toContain("clips_replays_count");
    expect(v).toContain("total_interactions");
  });

  it("descarta o nome falso que provocou o erro", () => {
    const v = vocabularioDaMensagem("metric selva_metrica_que_nao_existe is invalid, use ig_reels_avg_watch_time");
    expect(v).not.toContain("selva_metrica_que_nao_existe");
    expect(v).toContain("ig_reels_avg_watch_time");
  });

  /** Palavra simples não é nome de métrica — sem o `_` viraria lixo na lista. */
  it("não confunde palavras comuns com métricas", () => {
    expect(vocabularioDaMensagem("metric must be one of the following values")).toEqual([]);
  });
});

describe("o veredito vem do dado, não de uma frase", () => {
  const linha = (p: Partial<LinhaDaSondagem>): LinhaDaSondagem => ({
    grupo: "metrica", reel: "r1", item: "x", estado: "RECUSADA", http: 400,
    detalhe: "", formato: null, valor: null, ...p,
  });

  it("nada respondeu ⇒ NÃO", () => {
    const v = vereditoDe([linha({ item: "ig_reels_avg_watch_time" })]);
    expect(v.veredito).toBe("NAO");
    expect(v.temCurva).toBe(false);
  });

  it("tempo médio respondeu ⇒ PARCIAL", () => {
    const v = vereditoDe([
      linha({ item: "ig_reels_avg_watch_time", estado: "ACEITA_COM_DADO" }),
    ]);
    expect(v.veredito).toBe("PARCIAL");
    expect(v.temTempoMedio).toBe(true);
  });

  it("um recorte que devolveu faixas ⇒ SIM", () => {
    const v = vereditoDe([
      linha({ grupo: "recorte", item: "x · breakdown=video_view_percentage", estado: "ACEITA_COM_DADO" }),
    ]);
    expect(v.veredito).toBe("SIM");
    expect(v.temCurva).toBe(true);
  });

  /**
   * "Aceita sem dado" NÃO é disponível. Um Reel novo pode não ter medição
   * ainda, e tratar vazio como sucesso faria a sondagem autorizar uma métrica
   * que nunca devolveu número.
   */
  it("aceita e vazia não promove o veredito", () => {
    const v = vereditoDe([
      linha({ item: "ig_reels_avg_watch_time", estado: "ACEITA_SEM_DADO" }),
      linha({ item: "ig_reels_video_view_total_time", estado: "ACEITA_SEM_DADO" }),
    ]);
    expect(v.veredito).toBe("NAO");
  });

  /** A duração é pré-requisito da PORCENTAGEM, e não da curva. */
  it("duração não muda o veredito, mas é registrada", () => {
    const semDuracao = vereditoDe([linha({ item: "ig_reels_avg_watch_time", estado: "ACEITA_COM_DADO" })]);
    const comDuracao = vereditoDe([
      linha({ item: "ig_reels_avg_watch_time", estado: "ACEITA_COM_DADO" }),
      linha({ grupo: "duracao", item: "video_duration", estado: "ACEITA_COM_DADO" }),
    ]);
    expect(semDuracao.veredito).toBe(comDuracao.veredito);
    expect(semDuracao.temDuracao).toBe(false);
    expect(comDuracao.temDuracao).toBe(true);
  });

  /** `thumbnail_url` está na lista de candidatos como controle, não como duração. */
  it("thumbnail_url não conta como duração", () => {
    const v = vereditoDe([linha({ grupo: "duracao", item: "thumbnail_url", estado: "ACEITA_COM_DADO" })]);
    expect(v.temDuracao).toBe(false);
  });
});

describe("a sondagem inteira, contra APIs de mentira", () => {
  it("sem Reels, ela não mede nada e diz por quê", async () => {
    const { consultar, chamadas } = apiFalsa({
      midias: [{ id: "p1", media_product_type: "FEED" }],
    });
    const r = await sondarRetencao(consultar, "17841400000000000");
    expect(r.ok).toBe(false);
    expect(r.texto).toContain("Nenhum Reel");
    expect(chamadas()).toBe(1); // não insiste sobre uma conta sem Reels
  });

  /** O cenário que esperamos encontrar: os dois tempos existem, a curva não. */
  it("tempo médio e total, sem curva ⇒ PARCIAL e conclusão B", async () => {
    const { consultar } = apiFalsa({
      midias: CINCO_REELS,
      insights: { ig_reels_avg_watch_time: 8200, ig_reels_video_view_total_time: 412_000, views: 1240, reach: 980 },
      duracao: {},
    });
    const r = await sondarRetencao(consultar, "17841400000000000");
    expect(r.veredito).toBe("PARCIAL");
    expect(r.temCurva).toBe(false);
    expect(r.temTempoMedio).toBe(true);
    expect(r.temDuracao).toBe(false);
    expect(r.texto).toContain("CONCLUSÃO B");
    expect(r.texto).toContain("RETENÇÃO DOS REELS: [PARCIAL]");
    // Sem duração, a porcentagem é proibida no relatório.
    expect(r.texto).toContain("falta a duração");
  });

  it("os dois nomes do pedido são medidos em TODOS os Reels", async () => {
    const { consultar } = apiFalsa({
      midias: CINCO_REELS,
      insights: { ig_reels_avg_watch_time: 8200, ig_reels_video_view_total_time: 412_000 },
    });
    const r = await sondarRetencao(consultar, "17841400000000000");
    for (const nome of ["ig_reels_avg_watch_time", "ig_reels_video_view_total_time"]) {
      const medidas = r.linhas.filter((l) => l.item === nome && l.grupo === "metrica");
      expect(medidas, nome).toHaveLength(5);
    }
  });

  /**
   * "Funciona em alguns Reels e falha em outros" era um pedido explícito, e o
   * relatório precisa separar isso em vez de dizer só "disponível".
   */
  it("métrica que responde em alguns Reels e não em outros aparece separada", async () => {
    let i = 0;
    const base = apiFalsa({
      midias: CINCO_REELS,
      insights: { ig_reels_avg_watch_time: 8200 },
    });
    const consultar: ConsultarCru = async (caminho, params) => {
      if (params.metric === "ig_reels_avg_watch_time") {
        i += 1;
        return i <= 2
          ? { status: 200, corpo: { data: [{ total_value: { value: 8200 } }] }, erro: null }
          : { status: 200, corpo: { data: [] }, erro: null };
      }
      return base.consultar(caminho, params);
    };
    const r = await sondarRetencao(consultar, "17841400000000000");
    expect(r.texto).toContain("aceita mas SEM dado em 3 Reel(s)");
    expect(r.veredito).toBe("PARCIAL"); // respondeu em algum, então existe
  });

  it("com duração, a porcentagem é liberada", async () => {
    const { consultar } = apiFalsa({
      midias: CINCO_REELS,
      insights: { ig_reels_avg_watch_time: 8200 },
      duracao: { video_duration: 21.4 },
    });
    const r = await sondarRetencao(consultar, "17841400000000000");
    expect(r.temDuracao).toBe(true);
    expect(r.texto).toContain("retenção média em %");
    expect(r.reels[0].duracaoSegundos).toBe(21.4);
  });

  it("recorte que devolve faixas ⇒ SIM e conclusão A", async () => {
    const { consultar } = apiFalsa({
      midias: CINCO_REELS,
      insights: { ig_reels_avg_watch_time: 8200 },
      recorteResponde: true,
    });
    const r = await sondarRetencao(consultar, "17841400000000000");
    expect(r.veredito).toBe("SIM");
    expect(r.texto).toContain("CONCLUSÃO A");
  });

  it("nada responde ⇒ NÃO e conclusão C, sem sugerir implementação", async () => {
    const { consultar } = apiFalsa({ midias: CINCO_REELS, insights: {} });
    const r = await sondarRetencao(consultar, "17841400000000000");
    expect(r.veredito).toBe("NAO");
    expect(r.texto).toContain("CONCLUSÃO C");
    expect(r.texto).toContain("Manter o estado de 'dado futuro'");
  });

  /**
   * Se a Meta ACEITAR um nome inventado, nenhuma recusa desta sondagem prova
   * nada — e o relatório precisa dizer isso em vez de apresentar as recusas
   * como evidência.
   */
  it("nome falso aceito invalida as recusas, e isso é dito", async () => {
    const consultar: ConsultarCru = async (caminho, params) => {
      if (caminho.endsWith("/media")) return { status: 200, corpo: { data: CINCO_REELS }, erro: null };
      if (caminho.endsWith("/insights")) return { status: 200, corpo: { data: [] }, erro: null };
      return { status: 200, corpo: {}, erro: null };
    };
    const r = await sondarRetencao(consultar, "17841400000000000");
    expect(r.texto).toContain("ACEITOU um nome inventado");
    expect(r.vocabulario).toEqual([]);
    expect(r.texto).toContain("NÃO prova que ela não existe");
  });

  /** O pedido foi explícito: não começar com um lote gigante. */
  it("o custo fica na casa das dezenas, não das centenas", async () => {
    const { consultar, chamadas } = apiFalsa({
      midias: CINCO_REELS,
      vocabulario: MENSAGEM_REAL,
      insights: { ig_reels_avg_watch_time: 8200, ig_reels_video_view_total_time: 412_000, views: 1240, reach: 980 },
    });
    await sondarRetencao(consultar, "17841400000000000");
    expect(chamadas()).toBeLessThanOrEqual(30);
  });

  /**
   * Fora do vocabulário colhido = NÃO PERGUNTADA, e não "não existe". Gastar
   * cinco chamadas para ouvir a mesma recusa não é rigor, é desperdício — mas
   * apresentar isso como inexistência seria uma afirmação que não medimos.
   */
  it("nome fora do vocabulário fica como não perguntada, com o motivo", async () => {
    const { consultar } = apiFalsa({
      midias: CINCO_REELS,
      vocabulario: MENSAGEM_REAL,
      insights: { ig_reels_avg_watch_time: 8200 },
    });
    const r = await sondarRetencao(consultar, "17841400000000000");
    const naoPerguntadas = r.linhas.filter((l) => l.estado === "NAO_PERGUNTADA");
    expect(naoPerguntadas.length).toBeGreaterThan(0);
    expect(naoPerguntadas.some((l) => l.item === "video_retention_graph")).toBe(true);
    expect(naoPerguntadas[0].detalhe).toContain("fora do vocabulário");
    expect(r.texto).toContain("── NÃO PERGUNTADAS ──");
  });
});
