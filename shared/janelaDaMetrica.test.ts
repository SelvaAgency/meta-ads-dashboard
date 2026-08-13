/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  A soma de dias parciais não é o período
 * ─────────────────────────────────────────────────────────────────────────────
 *  Medido em 13/08: `profile_views` acumula de 00:00 até o instante da consulta,
 *  e a API não devolve dia fechado do passado. Às 06:20 o número cobre ~6h de
 *  um dia de 24.
 *
 *  O erro que este módulo impede é o de segunda ordem: trocar o título do card
 *  e deixar a SOMA intacta. Sete pontos de ~6h somados dão ~42 horas com nome
 *  de uma semana — e o total continuaria errado com um rótulo honesto em cima.
 *
 *  E o que ele preserva: a série continua comparável entre si, porque todos os
 *  pontos cobrem o mesmo pedaço do dia. Isso deixa de valer no instante em que
 *  uma coleta acontece noutro horário.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, expect, it } from "vitest";
import {
  ESPALHAMENTO_TOLERADO_MIN, NATUREZA_DA_METRICA, coletasSaoComparaveis, ehFluxo,
  rotuloDeEstoque, rotuloDeFluxo,
} from "./janelaDaMetrica";

const em = (dia: string, hhmm: string) => ({ dia, coletadoEm: new Date(`${dia}T${hhmm}:00`) });

describe("fluxo e estoque não são a mesma coisa", () => {
  it.each(["profile_views", "website_clicks", "total_interactions", "reach"])(
    "%s é fluxo — acumula dentro do dia", (m) => {
      expect(ehFluxo(m)).toBe(true);
    });

  /** Fotografia não tem janela: a diferença entre duas cobre o intervalo todo. */
  it.each(["followers_count", "follows_count", "media_count"])(
    "%s é estoque", (m) => {
      expect(ehFluxo(m)).toBe(false);
      expect(NATUREZA_DA_METRICA[m]).toBe("estoque");
    });

  it("métrica desconhecida não é tratada como fluxo por otimismo", () => {
    expect(ehFluxo("metrica_que_nao_existe")).toBe(false);
  });
});

describe("o rótulo de fluxo nunca promete o dia inteiro", () => {
  it("um dia é parcial, e diz a janela", () => {
    const r = rotuloDeFluxo("Visitas ao perfil", "06:20", 1);
    expect(r.titulo).toContain("parcial do dia");
    expect(r.titulo).not.toContain("hoje");
    expect(r.ressalva).toContain("00:00 até 06:20");
    expect(r.ressalva).toContain("não o dia inteiro");
  });

  /** O erro de segunda ordem: o título honesto sobre um total desonesto. */
  it("vários dias se anunciam como SOMA DE PARCIAIS, e não como total", () => {
    const r = rotuloDeFluxo("Visitas ao perfil", "06:20", 7);
    expect(r.titulo).toContain("soma de dias parciais");
    expect(r.ressalva).toContain("7 dias");
    expect(r.ressalva).toContain("não como total do período");
  });

  /** Dizer "até a coleta" sem dizer que horas deixa a ressalva sem conteúdo. */
  it("sem horário conhecido, ainda diz que é parcial", () => {
    const r = rotuloDeFluxo("Cliques", null, 1);
    expect(r.ressalva).toContain("00:00 até a coleta");
  });

  /** O que a série AINDA serve para — não pode sumir junto com a ressalva. */
  it("o texto preserva que dias são comparáveis entre si", () => {
    expect(rotuloDeFluxo("Visitas", "06:20", 7).ressalva).toContain("comparar dias entre si");
  });
});

describe("o rótulo de estoque diz entre quando e quando", () => {
  it("com as duas pontas, nomeia as duas", () => {
    const r = rotuloDeEstoque("Crescimento", "06/08", "13/08");
    expect(r.ressalva).toContain("entre as coletas de 06/08 e 13/08");
    expect(r.ressalva).not.toContain("no dia");
  });

  it("sem as pontas, ainda evita 'ganhou no dia'", () => {
    expect(rotuloDeEstoque("Crescimento", null, null).ressalva).toBe("Variação desde a última coleta.");
  });
});

describe("comparabilidade da série", () => {
  it("coletas no mesmo horário são comparáveis", () => {
    const r = coletasSaoComparaveis([
      em("2026-08-11", "06:20"), em("2026-08-12", "06:21"), em("2026-08-13", "06:19"),
    ]);
    expect(r.comparavel).toBe(true);
    expect(r.faixa).toBe("06:19–06:21");
    expect(r.motivo).toBeNull();
  });

  /**
   * O caso real: uma coleta manual no meio da tarde cria um ponto que cobre 14h
   * contra vizinhos de 6h — e ele pareceria um pico de audiência.
   */
  it("uma coleta manual à tarde quebra a comparação, e o motivo é dito", () => {
    const r = coletasSaoComparaveis([
      em("2026-08-11", "06:20"), em("2026-08-12", "06:20"), em("2026-08-13", "14:05"),
    ]);
    expect(r.comparavel).toBe(false);
    expect(r.espalhamentoMin).toBe(465);
    expect(r.motivo).toContain("pedaços de tamanhos diferentes");
    expect(r.faixa).toBe("06:20–14:05");
  });

  it("pequenos atrasos do cron não invalidam a série", () => {
    const r = coletasSaoComparaveis([em("2026-08-12", "06:20"), em("2026-08-13", "07:40")]);
    expect(r.espalhamentoMin).toBe(80);
    expect(r.espalhamentoMin).toBeLessThanOrEqual(ESPALHAMENTO_TOLERADO_MIN);
    expect(r.comparavel).toBe(true);
  });

  /** Um ponto só não tem com o que ser comparado — e isso não é problema. */
  it("menos de dois pontos é comparável por vacuidade", () => {
    expect(coletasSaoComparaveis([]).comparavel).toBe(true);
    expect(coletasSaoComparaveis([em("2026-08-13", "06:20")]).comparavel).toBe(true);
  });
});
