/**
 * Uma célula em branco pode significar cinco coisas, e cada uma pede uma ação
 * diferente. Colapsá-las em "sem dados" manda a pessoa procurar o problema no
 * lugar errado — foi o que aconteceu com quem rodou só o incremental e viu
 * metade do laboratório vazio.
 */
import { describe, expect, it } from "vitest";
import {
  GRUPOS_DE_DADO, linhasDoSegmento, oQueFalta, rotuloDoUrn,
  segmentosDisponiveis, vereditoDoGrupo,
} from "./linkedinCobertura";

const grupo = (id: string) => GRUPOS_DE_DADO.find((g) => g.id === id)!;
const cap = (estado: string) =>
  ({ estado, status: 200, motivo: null, medidaEm: "2026-09-02" }) as never;

describe("os cinco estados são distintos", () => {
  it("com dado", () => {
    expect(vereditoDoGrupo(grupo("seguidores_total"),
      { temLinha: true, temValor: true, jaFezCarga: false }).estado).toBe("com_dado");
  });

  it("coletado e sem dado — é da carteira, não da API", () => {
    const v = vereditoDoGrupo(grupo("publicacoes"),
      { temLinha: true, temValor: false, jaFezCarga: true });
    expect(v.estado).toBe("sem_dado");
    expect(v.acao).toContain("Nada a corrigir");
  });

  it("recusado vence a ausência", () => {
    // Uma Página bloqueada não tem dado E foi recusada. Dizer "sem dado"
    // mandaria procurar no lugar errado.
    const v = vereditoDoGrupo(grupo("seguidores_serie"),
      { temLinha: false, temValor: false, capacidade: cap("sem_permissao"), jaFezCarga: true });
    expect(v.estado).toBe("recusado");
    expect(v.acao).toContain("acesso");
  });

  it("só na carga vence 'não coletado' — porque diz qual botão apertar", () => {
    const v = vereditoDoGrupo(grupo("segmentacoes"),
      { temLinha: false, temValor: false, jaFezCarga: false });
    expect(v.estado).toBe("so_na_carga");
    expect(v.acao).toContain("Carga histórica");
  });

  it("depois da carga, ausência volta a ser 'não coletado'", () => {
    // Com a carga feita, "só na carga" deixa de explicar coisa alguma.
    expect(vereditoDoGrupo(grupo("segmentacoes"),
      { temLinha: false, temValor: false, jaFezCarga: true }).estado).toBe("nao_coletado");
  });

  it("conjunto do incremental nunca cai em 'só na carga'", () => {
    expect(vereditoDoGrupo(grupo("seguidores_total"),
      { temLinha: false, temValor: false, jaFezCarga: false }).estado).toBe("nao_coletado");
  });
});

describe("o que falta separa por AÇÃO", () => {
  it("agrupa o acionável longe do que não tem conserto aqui", () => {
    const vs = [
      vereditoDoGrupo(grupo("segmentacoes"), { temLinha: false, temValor: false, jaFezCarga: false }),
      vereditoDoGrupo(grupo("seguidores_serie"), {
        temLinha: false, temValor: false, capacidade: cap("sem_permissao"), jaFezCarga: false }),
      vereditoDoGrupo(grupo("reacoes"), { temLinha: false, temValor: false, jaFezCarga: true }),
    ];
    const f = oQueFalta(vs);
    expect(f.soNaCarga.map((x) => x.grupo.id)).toEqual(["segmentacoes"]);
    expect(f.recusados.map((x) => x.grupo.id)).toEqual(["seguidores_serie"]);
    expect(f.naoColetados.map((x) => x.grupo.id)).toEqual(["reacoes"]);
  });
});

describe("segmentações viram tabela, não JSON", () => {
  const itens = [
    { seniority: "urn:li:seniority:9", followerCounts: { organicFollowerCount: 12, paidFollowerCount: 3 } },
    { seniority: "urn:li:seniority:4", followerCounts: { organicFollowerCount: 40, paidFollowerCount: 0 } },
  ];

  it("soma orgânico e pago, e ordena pelo total", () => {
    const l = linhasDoSegmento(itens);
    expect(l.map((x) => x.total)).toEqual([40, 15]);
    expect(l[0].rotulo).toBe("Senioridade 4");
  });

  it("ausência continua ausência — nunca vira zero", () => {
    const l = linhasDoSegmento([{ industry: "urn:li:industry:4", followerCounts: {} }]);
    expect(l[0].organico).toBeNull();
    expect(l[0].pago).toBeNull();
    expect(l[0].total).toBeNull();
  });

  it("aceita contagens de outro nome sem inventar composição", () => {
    const l = linhasDoSegmento(
      [{ industry: "urn:li:industry:4", pageStatistics: { views: 7 } }], "pageStatistics");
    expect(l[0].total).toBe(7);
    expect(l[0].organico).toBeNull();
  });

  it("um valor que não é array não vira linha", () => {
    expect(linhasDoSegmento({ x: 1 })).toEqual([]);
    expect(linhasDoSegmento(null)).toEqual([]);
  });

  it("lista só os recortes que TÊM itens", () => {
    expect(segmentosDisponiveis({ a: [1], b: [], c: "x" })).toEqual([{ campo: "a", itens: 1 }]);
  });

  it("URN vira rótulo legível, e o desconhecido não some", () => {
    expect(rotuloDoUrn("urn:li:industry:96")).toBe("Setor 96");
    expect(rotuloDoUrn("BRASIL")).toBe("BRASIL");
  });
});

describe("cada conjunto diz onde mora e quem o busca", () => {
  it("os quatro do vitalício são os da Carga", () => {
    const carga = GRUPOS_DE_DADO.filter((g) => g.modo === "carga").map((g) => g.id);
    expect(carga.sort()).toEqual(["agregado", "organizacao", "segmentacoes", "views_lifetime"]);
  });

  it("todo conjunto explica o que viria nele", () => {
    for (const g of GRUPOS_DE_DADO) {
      expect(g.oQueTem.length, g.id).toBeGreaterThan(20);
      expect(g.tabela, g.id).toContain("linkedin_");
    }
  });
});
