import { describe, it, expect } from "vitest";
import {
  variacao, cardsDeTrafego, amostraPequena, semTrafego, contexto30d,
  listaTop, listasDe, duracao, MIN_SESSOES_CONFIAVEL,
  type MetricasGA4,
} from "./ga4Performance";

const m = (o: Partial<MetricasGA4> = {}): MetricasGA4 => ({ sessions: 0, ...o });

describe("variação contra o período anterior", () => {
  it("calcula alta e queda", () => {
    expect(variacao(150, 100)).toEqual({ pct: 50, sobe: true });
    expect(variacao(50, 100)).toEqual({ pct: -50, sobe: false });
  });

  /**
   * Crescer de 0 para 10 é notícia, mas não é porcentagem. Mostrar "+∞%" ou
   * "+1000%" convence o time de que algo explodiu quando só começou a existir.
   */
  it("anterior zero não vira porcentagem", () => {
    expect(variacao(10, 0)).toBeNull();
  });

  it("sem valor anterior, não há variação", () => {
    expect(variacao(10, undefined)).toBeNull();
    expect(variacao(10, null)).toBeNull();
  });

  it("valor atual ausente não inventa variação", () => {
    expect(variacao(undefined, 100)).toBeNull();
    expect(variacao(NaN, 100)).toBeNull();
  });

  it("estável é alta de 0%, não null", () => {
    expect(variacao(100, 100)).toEqual({ pct: 0, sobe: true });
  });
});

describe("cards de tráfego", () => {
  it("sem métricas, nenhum card", () => {
    expect(cardsDeTrafego(null)).toEqual([]);
    expect(cardsDeTrafego(undefined)).toEqual([]);
  });

  it("métrica ausente vira traço, nunca zero", () => {
    const c = cardsDeTrafego(m({ sessions: 100, users: undefined }));
    expect(c.find((x) => x.chave === "sessions")?.valor).toBe("100");
    expect(c.find((x) => x.chave === "users")?.valor).toBe("—");
  });

  it("UMA (8.572 sessões) sai por extenso — ainda é legível", () => {
    expect(cardsDeTrafego(m({ sessions: 8572 }))[0].valor).toBe("8.572");
  });

  it("só a partir de 10 mil abrevia, para a coluna não estourar", () => {
    expect(cardsDeTrafego(m({ sessions: 10000 }))[0].valor).toBe("10,0k");
    expect(cardsDeTrafego(m({ sessions: 145300 }))[0].valor).toBe("145,3k");
  });

  it("volume baixo aparece inteiro — ELWING tem 31", () => {
    expect(cardsDeTrafego(m({ sessions: 31 }))[0].valor).toBe("31");
  });

  it("traz variação quando há período anterior", () => {
    const c = cardsDeTrafego(m({ sessions: 120, anterior: { sessions: 100 } }));
    expect(c[0].variacao).toEqual({ pct: 20, sobe: true });
  });

  it("sem período anterior, os cards saem sem variação e não quebram", () => {
    const c = cardsDeTrafego(m({ sessions: 120, anterior: null }));
    expect(c[0].variacao).toBeNull();
    expect(c).toHaveLength(6);
  });
});

describe("qualidade da amostra", () => {
  it("ELWING (31 sessões) é amostra pequena", () => {
    expect(amostraPequena(m({ sessions: 31 }))).toBe(true);
  });

  it("UMA (8.572) não é", () => {
    expect(amostraPequena(m({ sessions: 8572 }))).toBe(false);
  });

  it("zero sessões é SEM TRÁFEGO, não amostra pequena", () => {
    expect(amostraPequena(m({ sessions: 0 }))).toBe(false);
    expect(semTrafego(m({ sessions: 0 }))).toBe(true);
  });

  it("o limite é inclusivo do lado de baixo", () => {
    expect(amostraPequena(m({ sessions: MIN_SESSOES_CONFIAVEL - 1 }))).toBe(true);
    expect(amostraPequena(m({ sessions: MIN_SESSOES_CONFIAVEL }))).toBe(false);
  });
});

describe("contexto dos 30 dias", () => {
  it("monta a frase com média diária", () => {
    expect(contexto30d(m({ sessions: 421 }), m({ sessions: 1800 })))
      .toBe("421 sessões nos últimos 7 dias · média de 60/dia nos últimos 30.");
  });

  it("singular quando é uma sessão só", () => {
    expect(contexto30d(m({ sessions: 1 }), m({ sessions: 30 }))).toMatch(/1 sessão nos últimos 7/);
  });

  it("sem o snapshot de 30 dias, não há frase", () => {
    expect(contexto30d(m({ sessions: 421 }), null)).toBeNull();
    expect(contexto30d(m({ sessions: 421 }), m({ sessions: 0 }))).toBeNull();
  });
});

describe("listas", () => {
  it("lista vazia ou ausente some — não vira tabela vazia", () => {
    expect(listaTop("X", [])).toBeNull();
    expect(listaTop("X", undefined)).toBeNull();
    expect(listasDe(null)).toEqual([]);
    expect(listasDe({})).toEqual([]);
  });

  it("ordena por valor e corta no limite, contando o resto", () => {
    const itens = Array.from({ length: 12 }, (_, i) => ({ rotulo: `p${i}`, valor: i }));
    const l = listaTop("Páginas", itens, 8)!;
    expect(l.itens).toHaveLength(8);
    expect(l.itens[0].rotulo).toBe("p11");
    expect(l.restantes).toBe(4);
  });

  it("declara a fonte — GA4 e Clarity nunca se confundem na tela", () => {
    expect(listaTop("Canais", [{ rotulo: "Organic", valor: 10 }])!.fonte).toBe("GA4");
  });

  it("item sem rótulo é descartado em vez de virar linha em branco", () => {
    const l = listaTop("X", [{ rotulo: "", valor: 99 }, { rotulo: "ok", valor: 1 }])!;
    expect(l.itens).toEqual([{ rotulo: "ok", valor: "1" }]);
  });

  it("monta as cinco listas quando há dados", () => {
    const l = listasDe({
      canais: [{ nome: "Paid Social", sessions: 402 }],
      origens: [{ fonte: "ig / paid_social", sessions: 343 }],
      landingPages: [{ url: "/ia-aplicada-1", sessions: 597 }],
      paginas: [{ url: "/", titulo: "Home", views: 100 }],
      eventos: [{ nome: "page_view", contagem: 900 }],
    });
    expect(l.map((x) => x.titulo)).toEqual([
      "Canais de aquisição", "Origem / mídia", "Landing pages",
      "Páginas mais vistas", "Eventos principais",
    ]);
  });

  it("página sem título cai na URL", () => {
    const l = listasDe({ paginas: [{ url: "/sem-titulo", views: 5 }] });
    expect(l[0].itens[0].rotulo).toBe("/sem-titulo");
  });
});

describe("duração", () => {
  it("segundos e minutos", () => {
    expect(duracao(48)).toBe("48s");
    expect(duracao(128)).toBe("2min 08s");
  });

  it("ausente ou zero vira traço", () => {
    expect(duracao(0)).toBe("—");
    expect(duracao(null)).toBe("—");
    expect(duracao(undefined)).toBe("—");
  });
});
