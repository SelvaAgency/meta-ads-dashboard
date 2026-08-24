/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Segurança do portfólio, e a distinção entre falhar e não medir
 * ─────────────────────────────────────────────────────────────────────────────
 *  O caso que criou a severidade `medicao`: o PageSpeed dá timeout na coleta da
 *  manhã e volta na remedição manual. Pela regra antiga isso pintava de vermelho
 *  um site no ar, com SSL válido e recebendo tráfego.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, expect, it } from "vitest";
import {
  FONTES_DE_MEDICAO, SSL_AVISO_DIAS, SSL_CRITICO_DIAS,
  achadosDe, avaliarCliente, coberturaComparavel, indicadorDoSite, resumoPortfolio,
  segurancaDoPortfolio, segurancaDoSite,
  type ClientePanorama,
} from "./panoramaLogic";

const conta = (over: Partial<ClientePanorama> = {}): ClientePanorama => ({
  accountId: 1, nome: "UMA", fontes: [], loja: null,
  uptime: null, seguranca: null, pagespeed: null,
  ga4_7d: null, ga4_30d: null, loja_7d: null, loja_30d: null,
  ...over,
});
const fonte = (chave: string, status: "ok" | "erro" | "ausente" | "atencao") =>
  ({ chave, rotulo: chave === "pagespeed" ? "PageSpeed" : chave, status });
const seg = (m: Record<string, unknown>) => ({ dia: "2026-08-19", metricsJson: m });
const noAr = { dia: "2026-08-19", metricsJson: { status: "no_ar" } };

describe("falha de medição ≠ falha do site", () => {
  it("PageSpeed com erro NÃO deixa o cliente crítico", () => {
    // O caso real: timeout de manhã num site que está no ar e com SSL válido.
    const c = conta({
      fontes: [fonte("pagespeed", "erro")],
      uptime: noAr,
      seguranca: seg({ https: true, sslValido: true, daysToSslExpiry: 200 }),
    });
    const a = avaliarCliente(c);
    expect(a.nivel).toBe("ok");
  });

  it("o achado CONTINUA existindo — a equipe precisa saber que falhou", () => {
    const c = conta({ fontes: [fonte("pagespeed", "erro")], uptime: noAr });
    const achado = achadosDe(c).find((x) => x.chave === "fonte_pagespeed");
    expect(achado).toBeDefined();
    expect(achado!.severidade).toBe("medicao");
    expect(achado!.texto).toContain("medição não concluída");
    // E leva à aba onde a remedição acontece.
    expect(achado!.aba).toBe("tecnico");
  });

  it("o texto NÃO se confunde com site fora do ar", () => {
    const c = conta({ fontes: [fonte("pagespeed", "erro")] });
    const achado = achadosDe(c).find((x) => x.chave === "fonte_pagespeed")!;
    expect(achado.texto).not.toContain("fora do ar");
    expect(achado.texto).not.toContain("com erro");
  });

  it("uptime fora do ar CONTINUA crítico, mesmo com PageSpeed falhando", () => {
    // A precedência que o pedido descreve: "o site está no ar?" é a pergunta
    // mais importante, e ela não é apagada por uma medição que falhou.
    const c = conta({
      fontes: [fonte("pagespeed", "erro")],
      uptime: { dia: "2026-08-19", metricsJson: { status: "fora_do_ar" } },
    });
    expect(avaliarCliente(c).nivel).toBe("critico");
  });

  it("erro de OUTRA fonte continua crítico", () => {
    // Só PageSpeed é falha de medição. GA4 sem dado é problema operacional.
    const c = conta({ fontes: [fonte("ga4", "erro")], uptime: noAr });
    expect(avaliarCliente(c).nivel).toBe("critico");
    expect(FONTES_DE_MEDICAO.has("ga4")).toBe(false);
    expect(FONTES_DE_MEDICAO.has("pagespeed")).toBe(true);
  });

  it("falha de medição não entra nos contadores de achado", () => {
    const c = conta({ fontes: [fonte("pagespeed", "erro")], uptime: noAr });
    const r = resumoPortfolio([avaliarCliente(c)].map((a) => ({ nivel: a.nivel, achados: a.achados })), [c]);
    expect(r.achadosCriticos).toBe(0);
    expect(r.achadosAtencao).toBe(0);
    // Conta separado: somar "remedir" com "agir" daria um número que sobe por
    // dois motivos incomparáveis.
    expect(r.falhasDeMedicao).toBe(1);
    expect(r.precisamAtencao).toBe(0);
  });

  it("um PageSpeed BAIXO continua sendo atenção — é medida, não falha", () => {
    const c = conta({ uptime: noAr, pagespeed: { dia: "2026-08-19", metricsJson: { performanceScore: 22 } } });
    expect(avaliarCliente(c).nivel).toBe("atencao");
  });
});

describe("segurança do site", () => {
  it("sem snapshot é 'sem medição', e não 'inseguro'", () => {
    // Pintar de vermelho quem não foi medido faria a equipe caçar um problema
    // que é nosso.
    expect(segurancaDoSite(conta()).estado).toBe("sem_medicao");
  });

  it("HTTPS falso é quebrado", () => {
    expect(segurancaDoSite(conta({ seguranca: seg({ https: false }) })).estado).toBe("quebrado");
  });

  it("SSL inválido é quebrado", () => {
    expect(segurancaDoSite(conta({ seguranca: seg({ https: true, sslValido: false }) })).estado).toBe("quebrado");
  });

  it("certificado já vencido é quebrado, e não 'expirando'", () => {
    const s = segurancaDoSite(conta({ seguranca: seg({ https: true, sslValido: true, daysToSslExpiry: 0 }) }));
    expect(s.estado).toBe("quebrado");
  });

  it(`dentro de ${SSL_AVISO_DIAS} dias é expirando`, () => {
    expect(segurancaDoSite(conta({ seguranca: seg({ https: true, sslValido: true, daysToSslExpiry: SSL_AVISO_DIAS }) })).estado)
      .toBe("expirando");
  });

  it("um dia além do aviso é ok", () => {
    expect(segurancaDoSite(conta({ seguranca: seg({ https: true, sslValido: true, daysToSslExpiry: SSL_AVISO_DIAS + 1 }) })).estado)
      .toBe("ok");
  });

  it("o corte crítico é mais apertado que o de aviso", () => {
    expect(SSL_CRITICO_DIAS).toBeLessThan(SSL_AVISO_DIAS);
  });

  it("o score NÃO é usado — a composição dele não está documentada", () => {
    // Um 0–100 sem régua conhecida ao lado de HTTPS e SSL, que são fatos,
    // emprestaria a credibilidade dos dois ao terceiro.
    const s = segurancaDoSite(conta({ seguranca: seg({ https: true, sslValido: true, score: 12, daysToSslExpiry: 90 }) }));
    expect(s.estado).toBe("ok");
    expect(Object.keys(s)).not.toContain("score");
  });
});

describe("segurança do portfólio", () => {
  const carteira = [
    conta({ accountId: 1, nome: "A", seguranca: seg({ https: true, sslValido: true, daysToSslExpiry: 200 }) }),
    conta({ accountId: 2, nome: "B", seguranca: seg({ https: true, sslValido: true, daysToSslExpiry: 12 }) }),
    conta({ accountId: 3, nome: "C", seguranca: seg({ https: false }) }),
    conta({ accountId: 4, nome: "D" }),
  ];

  it("conta os quatro estados sem sobreposição", () => {
    const r = segurancaDoPortfolio(carteira);
    expect([r.ok, r.expirando, r.quebrado, r.semMedicao]).toEqual([1, 1, 1, 1]);
    expect(r.ok + r.expirando + r.quebrado + r.semMedicao).toBe(carteira.length);
  });

  it("urgentes vêm do mais grave para o menos, e não incluem quem está ok", () => {
    const r = segurancaDoPortfolio(carteira);
    expect(r.urgentes.map((s) => s.nome)).toEqual(["C", "B"]);
  });

  it("o próximo vencimento sai só dos MEDIDOS", () => {
    // Um site sem medição não tem vencimento; tratá-lo como 0 dias inventaria
    // uma urgência que ninguém observou.
    const r = segurancaDoPortfolio(carteira);
    expect(r.proximoVencimento!.nome).toBe("B");
    expect(r.proximoVencimento!.diasParaVencer).toBe(12);
  });

  it("carteira sem medição nenhuma não inventa próximo vencimento", () => {
    expect(segurancaDoPortfolio([conta()]).proximoVencimento).toBeNull();
  });

  it("portfólio inteiro saudável devolve urgentes vazio", () => {
    const r = segurancaDoPortfolio([carteira[0]]);
    expect(r.urgentes).toHaveLength(0);
  });
});

describe("o indicador de cada site", () => {
  const ps = (v: number) => ({ dia: "2026-08-19", metricsJson: { performanceScore: v } });
  const ga4 = (sessions: number, anterior: number) =>
    ({ dia: "2026-08-19", metricsJson: { sessions, anterior: { sessions: anterior } } });

  it("PageSpeed vem primeiro, com escala e fonte", () => {
    const i = indicadorDoSite(conta({ pagespeed: ps(88), uptime: noAr }));
    expect(i.chave).toBe("pagespeed");
    expect(i.valor).toBe("88");
    expect(i.unidade).toBe("de 100");
    // A estratégia entra na fonte: comparar mobile com desktop seria comparar
    // estratégias, não sites.
    expect(i.fonte).toContain("mobile");
    expect(i.comparavel).toBe(true);
  });

  it("sem PageSpeed, cai para disponibilidade", () => {
    const i = indicadorDoSite(conta({ uptime: noAr }));
    expect(i.chave).toBe("uptime");
    expect(i.valor).toBe("No ar");
    // "No ar" e "No ar" não se ordenam — não é escala.
    expect(i.comparavel).toBe(false);
  });

  it("fora do ar aparece como crítico no próprio indicador", () => {
    const i = indicadorDoSite(conta({ uptime: { dia: "2026-08-19", metricsJson: { status: "fora_do_ar" } } }));
    expect(i.estado).toBe("critico");
  });

  it("sem PageSpeed e sem uptime, usa a VARIAÇÃO de tráfego", () => {
    const i = indicadorDoSite(conta({ ga4_7d: ga4(120, 100) }));
    expect(i.chave).toBe("trafego");
    expect(i.valor).toBe("+20%");
    expect(i.unidade).toContain("anterior");
  });

  it("sessões absolutas NUNCA viram o indicador", () => {
    // 2.000 sessões de um cliente e 200 de outro medem tamanho, não saúde.
    const i = indicadorDoSite(conta({ ga4_7d: { dia: "2026-08-19", metricsJson: { sessions: 2000 } } }));
    expect(i.chave).toBe("nenhum");
    expect(i.valor).toBe("—");
  });

  it("variação de tráfego não entra no ranking", () => {
    // Ela é cada site contra si mesmo; ordenar por ela compararia velocidades
    // de mudança, e não estados.
    expect(indicadorDoSite(conta({ ga4_7d: ga4(50, 100) })).comparavel).toBe(false);
  });

  it("sem nada, diz que não há medição — e não mostra zero", () => {
    const i = indicadorDoSite(conta());
    expect(i.valor).toBe("—");
    expect(i.valor).not.toBe("0");
    expect(i.rotulo).toContain("Sem medição");
  });

  it("a cobertura comparável conta só quem tem a mesma régua", () => {
    const carteira = [
      conta({ accountId: 1, pagespeed: ps(90) }),
      conta({ accountId: 2, pagespeed: ps(40) }),
      conta({ accountId: 3, uptime: noAr }),
      conta({ accountId: 4 }),
    ];
    expect(coberturaComparavel(carteira)).toEqual({ com: 2, total: 4 });
  });
});
