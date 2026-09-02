/**
 * O `content` de 355 publicações estava parado no banco. Este arquivo é o que
 * permite lê-lo sem inventar — e o "não identificado" é uma categoria de
 * primeira classe, não uma falha.
 */
import { describe, expect, it } from "vitest";
import {
  distribuicaoDeConteudo, estadoDaMetrica, estadoDaMidia, lerConteudo,
} from "./linkedinConteudo";

describe("o formato sai do JSON, nunca da suposição", () => {
  it("sem content e com texto é publicação de TEXTO — isso é identificação", () => {
    expect(lerConteudo(null, true).tipo).toBe("texto");
  });

  it("sem content e sem texto não é nada — e a tela precisa dizer isso", () => {
    expect(lerConteudo(null, false).tipo).toBe("nao_identificado");
  });

  it("`media` sozinho não diz o que é; o URN diz", () => {
    expect(lerConteudo({ media: { id: "urn:li:image:C1" } }).tipo).toBe("imagem");
    expect(lerConteudo({ media: { id: "urn:li:video:C2" } }).tipo).toBe("video");
    expect(lerConteudo({ media: { id: "urn:li:document:C3" } }).tipo).toBe("documento");
  });

  it("`media` com URN desconhecido NÃO vira imagem por conveniência", () => {
    const l = lerConteudo({ media: { id: "urn:li:coisaNova:9" } });
    expect(l.tipo).toBe("nao_identificado");
    expect(l.evidencia).toContain("desconhecido");
  });

  it("carrossel vence imagem — é a distinção que interessa a quem escolhe formato", () => {
    const l = lerConteudo({ multiImage: { images: [{ id: "urn:li:image:A" }, { id: "urn:li:image:B" }] } });
    expect(l.tipo).toBe("carrossel");
    expect(l.midias).toHaveLength(2);
  });

  it("enquete, evento e artigo têm chave própria", () => {
    expect(lerConteudo({ poll: {} }).tipo).toBe("enquete");
    expect(lerConteudo({ event: {} }).tipo).toBe("evento");
    expect(lerConteudo({ article: { source: "x" } }).tipo).toBe("artigo");
  });

  it("chave nova aparece como não identificada, com as chaves à vista", () => {
    const l = lerConteudo({ formatoQueNaoConhecemos: {} });
    expect(l.tipo).toBe("nao_identificado");
    expect(l.chaves).toEqual(["formatoQueNaoConhecemos"]);
  });

  it("a distribuição conta e ordena, e guarda o porquê de cada tipo", () => {
    const d = distribuicaoDeConteudo([
      lerConteudo({ media: { id: "urn:li:image:A" } }),
      lerConteudo({ media: { id: "urn:li:image:B" } }),
      lerConteudo(null, true),
    ]);
    expect(d[0].tipo).toBe("imagem");
    expect(d[0].quantidade).toBe(2);
    expect(d[0].fatia).toBeCloseTo(2 / 3);
    expect(d[0].evidencias[0]).toContain("urn:li:image");
  });
});

describe("mídia: quatro estados, e nenhum é 'indisponível' por padrão", () => {
  it("resolvida quando há URL", () => {
    const e = estadoDaMidia({ midias: [{ urn: "u", dados: { downloadUrl: "https://x/y.png" }, consultada: true }] });
    expect(e.estado).toBe("resolvida");
    expect(e.url).toBe("https://x/y.png");
  });

  it("consultada e sem retorno é DIFERENTE de não consultada", () => {
    expect(estadoDaMidia({ midias: [{ urn: "u", dados: null, consultada: true }] }).estado)
      .toBe("consultada_sem_retorno");
    expect(estadoDaMidia({ midias: [{ urn: "u", dados: null, consultada: false }] }).estado)
      .toBe("nao_consultada");
  });

  it("coleta antiga fica INDETERMINADA em vez de virar afirmação", () => {
    // 225 publicações da Musa foram marcadas "a API não devolveu URL" quando só
    // 20 URNs chegaram a ser perguntados.
    const e = estadoDaMidia({ midias: [{ urn: "u", dados: null }] });
    expect(e.estado).toBe("nao_consultada");
    expect(e.indeterminado).toBe(true);
    expect(e.motivo).toContain("não registrava");
  });

  it("sem mídia não é falha", () => {
    expect(estadoDaMidia({ midias: [] }).estado).toBe("sem_midia");
  });
});

describe("métrica: 'sem retorno' não é 'não coletada', e nunca é zero", () => {
  it("pedida e omitida pelo endpoint", () => {
    // 230 das 390 publicações da Musa. O lote foi pedido; o endpoint omite
    // publicação sem estatística.
    const e = estadoDaMetrica({ temLinha: false, temValor: false, foiPedida: true });
    expect(e.estado).toBe("sem_retorno");
    expect(e.motivo).toContain("não significa desempenho zero");
  });

  it("nunca solicitada é outra coisa", () => {
    expect(estadoDaMetrica({ temLinha: false, temValor: false, foiPedida: false }).estado)
      .toBe("nao_solicitada");
  });

  it("zero MEDIDO continua sendo coleta boa", () => {
    expect(estadoDaMetrica({ temLinha: true, temValor: true, foiPedida: true }).estado)
      .toBe("coletada");
  });

  it("erro vence tudo", () => {
    expect(estadoDaMetrica({ temLinha: true, temValor: true, statusColeta: "erro", foiPedida: true }).estado)
      .toBe("erro");
  });
});
