/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  A sondagem só vale se ela mesma não mentir
 * ─────────────────────────────────────────────────────────────────────────────
 *  Ela é a base do modelo de dados: cada coluna de snapshot vai existir porque
 *  uma linha daqui disse "SIM". Um falso positivo cria coluna que nunca recebe
 *  valor; um falso negativo apaga uma métrica que funcionava.
 *
 *  E há um risco próprio de um diagnóstico tão amplo: ele toca legenda,
 *  biografia e todos os campos de texto da conta. Nenhum deles pode sair no
 *  relatório — a pergunta é "este campo responde?", e respondê-la com o conteúdo
 *  transformaria diagnóstico em vazamento.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, expect, it, vi } from "vitest";
import { sondarInstagram, type Consultar } from "./instagramSondagem";

const BIO = "Somos a SELVA. Estratégia, mídia e conteúdo para marcas que crescem.";
const LEGENDA = "Bastidores do último ensaio — vem ver como foi 💛";

/** Responde como a Graph API, com um roteiro do que existe e do que não. */
function consultor(opts: {
  camposAusentes?: string[];
  metricasRecusadas?: string[];
  semMidias?: boolean;
  storiesErro?: boolean;
} = {}): Consultar {
  const ausentes = new Set(opts.camposAusentes ?? []);
  const recusadas = new Set(opts.metricasRecusadas ?? []);

  return vi.fn(async (caminho: string, params: Record<string, string>) => {
    if (caminho.includes("/insights")) {
      const m = params.metric;
      if (recusadas.has(m)) throw new Error(`Meta (100): (#100) métrica ${m} não suportada`);
      return { data: [{ name: m, total_value: { value: 42 } }] } as never;
    }
    if (caminho.includes("/stories")) {
      if (opts.storiesErro) throw new Error("Meta (10): sem permissão para stories");
      return { data: [{ id: "s1" }, { id: "s2" }] } as never;
    }
    if (caminho.includes("/media")) {
      if (opts.semMidias) return { data: [] } as never;
      const campo = params.fields;
      if (ausentes.has(campo)) throw new Error(`Meta (100): campo ${campo} inválido`);
      const valores: Record<string, unknown> = {
        id: "18001", caption: LEGENDA, media_type: "IMAGE", media_product_type: "FEED",
        timestamp: "2026-08-10T12:00:00+0000", permalink: "https://instagram.com/p/x",
        media_url: "https://cdn/x.jpg", thumbnail_url: "https://cdn/t.jpg",
        like_count: 312, comments_count: 27,
      };
      // `id` sempre volta — é ele que permite sondar insights de mídia depois.
      return { data: [{ id: "18001", [campo]: valores[campo] }] } as never;
    }
    // Perfil
    const campo = params.fields;
    if (ausentes.has(campo)) throw new Error(`Meta (100): campo ${campo} inválido`);
    const perfil: Record<string, unknown> = {
      username: "selva.agency", name: "SELVA Agency", biography: BIO,
      website: "https://selva.agency", profile_picture_url: "https://cdn/p.jpg",
      followers_count: 4210, follows_count: 318, media_count: 512,
    };
    return { [campo]: perfil[campo] } as never;
  }) as Consultar;
}

const acha = (s: Awaited<ReturnType<typeof sondarInstagram>>, item: string) =>
  s.linhas.find((l) => l.item === item);

describe("a matriz responde item a item", () => {
  it("conta disponíveis e indisponíveis, e cobre os cinco grupos", async () => {
    const s = await sondarInstagram(consultor(), "17841400000000000");
    expect(s.disponiveis + s.indisponiveis).toBe(s.linhas.length);
    expect(new Set(s.linhas.map((l) => l.grupo))).toEqual(
      new Set(["perfil", "insights_perfil", "midias", "insights_midia", "stories"]));
  });

  /**
   * O motivo de uma chamada por item: em lote, um campo inválido derruba os
   * outros nove e o culpado fica escondido.
   */
  it("campo inválido acusa a si mesmo, sem derrubar os vizinhos", async () => {
    const s = await sondarInstagram(consultor({ camposAusentes: ["website"] }), "123");
    expect(acha(s, "website")?.disponivel).toBe(false);
    expect(acha(s, "website")?.detalhe).toContain("website");
    expect(acha(s, "username")?.disponivel).toBe(true);
    expect(acha(s, "followers_count")?.disponivel).toBe(true);
  });

  it("métrica recusada é nomeada com o erro da Meta", async () => {
    const s = await sondarInstagram(consultor({ metricasRecusadas: ["impressions"] }), "123");
    expect(acha(s, "impressions")?.disponivel).toBe(false);
    expect(acha(s, "impressions")?.detalhe).toContain("100");
    expect(acha(s, "reach")?.disponivel).toBe(true);
  });

  it("número aparece com o valor — 0 e 4210 levam a conclusões diferentes", async () => {
    const s = await sondarInstagram(consultor(), "123");
    expect(acha(s, "followers_count")?.detalhe).toBe("4210");
    expect(acha(s, "like_count")?.detalhe).toBe("312");
  });
});

describe("nada de texto sai da sondagem", () => {
  /** A regra que separa diagnóstico de vazamento. */
  it("biografia e legenda são reportadas pelo tamanho, nunca pelo conteúdo", async () => {
    const s = await sondarInstagram(consultor(), "123");
    expect(acha(s, "biography")?.disponivel).toBe(true);
    expect(acha(s, "biography")?.detalhe).toBe(`texto (${BIO.length} caracteres)`);
    expect(acha(s, "caption")?.detalhe).toBe(`texto (${LEGENDA.length} caracteres)`);
  });

  it("o texto copiável inteiro não contém nenhum conteúdo de texto da conta", async () => {
    const s = await sondarInstagram(consultor(), "123");
    expect(s.texto).not.toContain(BIO);
    expect(s.texto).not.toContain(LEGENDA);
    expect(s.texto).not.toContain("SELVA. Estratégia");
    // Nem em nenhuma linha da estrutura, não só no texto montado.
    expect(JSON.stringify(s.linhas)).not.toContain(BIO);
    expect(JSON.stringify(s.linhas)).not.toContain(LEGENDA);
  });

  it("e o relatório declara essa regra para quem lê", async () => {
    const s = await sondarInstagram(consultor(), "123");
    expect(s.texto).toContain("reportados só pelo tamanho");
  });
});

describe("stories: lista vazia não é falta de permissão", () => {
  it("endpoint que responde sem stories no ar conta como DISPONÍVEL", async () => {
    const consultarVazio: Consultar = vi.fn(async (caminho: string) => {
      if (caminho.includes("/stories")) return { data: [] } as never;
      if (caminho.includes("/insights")) return { data: [{ total_value: { value: 1 } }] } as never;
      if (caminho.includes("/media")) return { data: [{ id: "1" }] } as never;
      return { username: "x" } as never;
    }) as Consultar;
    const s = await sondarInstagram(consultarVazio, "123");
    const st = acha(s, "listar stories ativos");
    expect(st?.disponivel).toBe(true);
    expect(st?.detalhe).toContain("endpoint funciona");
  });

  it("erro no endpoint é indisponível, com o motivo", async () => {
    const s = await sondarInstagram(consultor({ storiesErro: true }), "123");
    const st = acha(s, "listar stories ativos");
    expect(st?.disponivel).toBe(false);
    expect(st?.detalhe).toContain("10");
  });
});

describe("conta sem publicações", () => {
  /** Sem mídia não há o que medir — e dizer isso é melhor que oito recusas. */
  it("declara que não havia publicação, em vez de reprovar oito métricas", async () => {
    const s = await sondarInstagram(consultor({ semMidias: true }), "123");
    const linha = s.linhas.filter((l) => l.grupo === "insights_midia");
    expect(linha).toHaveLength(1);
    expect(linha[0].detalhe).toContain("sem publicação para medir");
  });
});

describe("a sondagem serve às duas fontes", () => {
  /**
   * A única diferença entre a API da agência e a do login é o prefixo do
   * caminho. Recebendo `base`, a mesma sondagem atende as duas sem saber qual é.
   */
  it("usa o `base` recebido em todos os caminhos de conta", async () => {
    const c = consultor();
    await sondarInstagram(c, "me");
    const caminhos = (c as unknown as { mock: { calls: string[][] } }).mock.calls.map((x) => x[0]);
    expect(caminhos).toContain("me");
    expect(caminhos).toContain("me/insights");
    expect(caminhos).toContain("me/media");
    expect(caminhos).toContain("me/stories");
    // Insight de mídia usa o id da própria mídia, não o base.
    expect(caminhos).toContain("18001/insights");
  });
});
