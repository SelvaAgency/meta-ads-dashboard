/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Os três núcleos puros da página analítica
 * ─────────────────────────────────────────────────────────────────────────────
 *  Nenhum deles toca a rede. São as decisões de produto que a página vai
 *  executar, e cada uma tem um jeito conhecido de dar errado em silêncio:
 *
 *   TIPO       vídeo de feed antigo virando reel, e anúncio virando publicação
 *              orgânica — os dois inflam justo a métrica que a agência mostra
 *   TAXA       divisor trocado sem aviso, e taxa 0% para quem não foi medido
 *   RANKING    post que quase ninguém viu liderando por ter 3 curtidas em 40
 *              alcances, e "pior post" acusando conteúdo por falha de entrega
 *   PERÍODO    "30 dias" devolvendo o número de 3 dias com rótulo de trinta
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, expect, it } from "vitest";
import {
  CONTA_COMO_POST, ROTULO_CONTEUDO, contarPublicacoes, diaDe, tipoDeConteudo,
  type TipoConteudo,
} from "./tipoDeMidia";
import {
  PISO_DO_RANKING, ROTULO_TAXA, avisoDeExclusao, mediana,
  rankingDePublicacoes, taxaPorAlcance, taxaPorSeguidores,
} from "./engajamento";
import {
  DIAS_PARA_TENDENCIA, diasDeColeta, diasEntre, periodosDisponiveis,
  podeFalarDeTendencia, somarDias, textoDeCobertura,
} from "./periodosSociais";

// ─── Tipo de conteúdo ───────────────────────────────────────────────────────

describe("classificação precisa dos DOIS campos", () => {
  it.each([
    ["reel", "VIDEO", "REELS", "REELS"],
    ["carrossel", "CAROUSEL_ALBUM", "FEED", "CARROSSEL"],
    ["foto de feed", "IMAGE", "FEED", "FEED"],
    ["story", "IMAGE", "STORY", "STORY"],
    ["anúncio", "VIDEO", "AD", "ANUNCIO"],
  ])("%s → %s", (_nome, mediaType, mediaProductType, esperado) => {
    expect(tipoDeConteudo({ mediaType, mediaProductType })).toBe(esperado);
  });

  /**
   * O caso que você pediu para travar. Antes dos reels existirem, todo vídeo de
   * feed vinha como VIDEO — classificar por `media_type` sozinho transformaria
   * o acervo inteiro em reels e inflaria a métrica mais olhada.
   */
  it("vídeo ANTIGO de feed não vira reel", () => {
    expect(tipoDeConteudo({ mediaType: "VIDEO", mediaProductType: "FEED" })).toBe("FEED");
    expect(tipoDeConteudo({ mediaType: "VIDEO", mediaProductType: "FEED" })).not.toBe("REELS");
  });

  it("produto ganha de formato — reel é reel mesmo sendo VIDEO", () => {
    expect(tipoDeConteudo({ mediaType: "VIDEO", mediaProductType: "REELS" })).toBe("REELS");
  });

  it("sem produto declarado, formato ainda resolve o feed antigo", () => {
    expect(tipoDeConteudo({ mediaType: "IMAGE" })).toBe("FEED");
    expect(tipoDeConteudo({ mediaType: "CAROUSEL_ALBUM" })).toBe("CARROSSEL");
  });

  it("sem nada é DESCONHECIDO, e não FEED por otimismo", () => {
    expect(tipoDeConteudo({})).toBe("DESCONHECIDO");
    expect(tipoDeConteudo({ mediaType: null, mediaProductType: null })).toBe("DESCONHECIDO");
  });

  it("caixa e espaços não mudam a resposta", () => {
    expect(tipoDeConteudo({ mediaType: "video", mediaProductType: "reels" })).toBe("REELS");
  });

  it("todo tipo tem rótulo em português", () => {
    for (const t of ["FEED", "REELS", "CARROSSEL", "STORY", "ANUNCIO", "DESCONHECIDO"] as TipoConteudo[]) {
      expect(ROTULO_CONTEUDO[t], t).toBeTruthy();
    }
  });

  /** Anúncio e story fora da contagem: um é verba, o outro é métrica à parte. */
  it("só feed, reels e carrossel contam como post publicado", () => {
    expect(CONTA_COMO_POST).toEqual(["FEED", "REELS", "CARROSSEL"]);
    expect(CONTA_COMO_POST).not.toContain("ANUNCIO");
    expect(CONTA_COMO_POST).not.toContain("STORY");
  });
});

describe("contagem por data de publicação", () => {
  const midias = [
    { timestamp: "2026-08-01T10:00:00+0000", mediaType: "IMAGE", mediaProductType: "FEED" },
    { timestamp: "2026-08-05T10:00:00+0000", mediaType: "VIDEO", mediaProductType: "REELS" },
    { timestamp: "2026-08-05T18:00:00+0000", mediaType: "CAROUSEL_ALBUM", mediaProductType: "FEED" },
    { timestamp: "2026-08-31T23:00:00+0000", mediaType: "IMAGE", mediaProductType: "FEED" },
    { timestamp: "2026-07-31T10:00:00+0000", mediaType: "IMAGE", mediaProductType: "FEED" },
    { timestamp: "2026-09-01T10:00:00+0000", mediaType: "IMAGE", mediaProductType: "FEED" },
  ];

  it("conta só o que está dentro do intervalo, com as pontas incluídas", () => {
    const r = contarPublicacoes(midias, { inicio: "2026-08-01", fim: "2026-08-31" });
    expect(r.total).toBe(4);
    expect(r.porTipo.FEED).toBe(2);
    expect(r.porTipo.REELS).toBe(1);
    expect(r.porTipo.CARROSSEL).toBe(1);
  });

  it("anúncio e story não entram no total, mas aparecem na quebra", () => {
    const r = contarPublicacoes([
      ...midias,
      { timestamp: "2026-08-10T10:00:00+0000", mediaType: "VIDEO", mediaProductType: "AD" },
      { timestamp: "2026-08-10T11:00:00+0000", mediaType: "IMAGE", mediaProductType: "STORY" },
    ], { inicio: "2026-08-01", fim: "2026-08-31" });
    expect(r.total).toBe(4);
    expect(r.porTipo.ANUNCIO).toBe(1);
    expect(r.porTipo.STORY).toBe(1);
  });

  it("mídia sem timestamp é ignorada em vez de cair no dia errado", () => {
    const r = contarPublicacoes([{ mediaType: "IMAGE", mediaProductType: "FEED" }], { inicio: "2026-08-01", fim: "2026-08-31" });
    expect(r.total).toBe(0);
  });

  /**
   * `new Date(...).toISOString()` jogaria um post das 21h de São Paulo para o
   * dia seguinte em UTC — deslocando a contagem inteira na virada do mês.
   */
  it("o dia sai do texto, sem conversão de fuso", () => {
    expect(diaDe("2026-08-31T23:30:00-0300")).toBe("2026-08-31");
    expect(diaDe("2026-08-31T21:00:00+0000")).toBe("2026-08-31");
    expect(diaDe(null)).toBeNull();
    expect(diaDe("lixo")).toBeNull();
  });

  it("intervalo vazio não explode", () => {
    expect(contarPublicacoes([], { inicio: "2026-08-01", fim: "2026-08-31" }).total).toBe(0);
  });
});

// ─── Taxa de engajamento ────────────────────────────────────────────────────

describe("taxa de engajamento", () => {
  it("por alcance é a principal, e a conta é interações ÷ alcance", () => {
    expect(taxaPorAlcance(60, 1000)).toBeCloseTo(6);
  });

  it("por seguidores existe como apoio, com outra conta", () => {
    expect(taxaPorSeguidores(60, 4000)).toBeCloseTo(1.5);
  });

  /** Os dois números convivem, e por isso o rótulo precisa dizer qual é qual. */
  it("cada divisor tem rótulo próprio, e eles não se confundem", () => {
    expect(ROTULO_TAXA.alcance).toContain("por alcance");
    expect(ROTULO_TAXA.seguidores).toContain("por seguidores");
    expect(ROTULO_TAXA.alcance).not.toBe(ROTULO_TAXA.seguidores);
  });

  /** 0% afirmaria que o conteúdo não engajou. Não medido não é não engajou. */
  it.each([
    ["sem interações", null, 1000],
    ["sem alcance", 60, null],
    ["alcance zero", 60, 0],
  ])("%s devolve null, e nunca 0", (_n, i, a) => {
    expect(taxaPorAlcance(i as number | null, a as number | null)).toBeNull();
  });

  it("interações zero com alcance real é 0% de verdade", () => {
    expect(taxaPorAlcance(0, 500)).toBe(0);
  });
});

describe("mediana", () => {
  it("ímpar pega o do meio; par faz a média dos dois centrais", () => {
    expect(mediana([10, 100, 20])).toBe(20);
    expect(mediana([10, 20, 30, 40])).toBe(25);
  });

  /** Média seria puxada por um viral e excluiria a operação normal. */
  it("um viral não desloca a mediana", () => {
    expect(mediana([100, 110, 120, 130, 50_000])).toBe(120);
  });

  it("vazio é null", () => {
    expect(mediana([])).toBeNull();
  });
});

// ─── Ranking ────────────────────────────────────────────────────────────────

describe("ranking com base mínima", () => {
  const p = (id: string, interacoes: number | null, alcance: number | null) => ({ id, interacoes, alcance });

  /** O caso que motivou o piso. */
  it("post de alcance ínfimo não lidera por ter taxa alta", () => {
    const r = rankingDePublicacoes([
      p("minusculo", 3, 40),      // 7,5% — mas quase ninguém viu
      p("bom", 600, 10_000),      // 6,0%
      p("medio", 400, 10_000),
      p("fraco", 200, 10_000),
      p("ok", 500, 10_000),
      p("regular", 300, 10_000),
    ]);
    expect(r.melhores.map((x) => x.publicacao.id)).not.toContain("minusculo");
    expect(r.melhores[0].publicacao.id).toBe("bom");
    expect(r.excluidasPorAlcance).toBe(1);
  });

  it("o piso é 20% da mediana do período", () => {
    const r = rankingDePublicacoes([p("a", 10, 100), p("b", 10, 200), p("c", 10, 300)]);
    expect(r.medianaAlcance).toBe(200);
    expect(r.alcanceMinimo).toBe(200 * PISO_DO_RANKING);
    expect(PISO_DO_RANKING).toBe(0.2);
  });

  it("publicação sem dados fica fora e é contada à parte", () => {
    const r = rankingDePublicacoes([p("a", 10, 100), p("b", null, 100), p("c", 10, null)]);
    expect(r.semDados).toBe(2);
    expect(r.elegiveis).toBe(1);
  });

  /**
   * Com poucas publicações, melhores e piores apontariam para as mesmas — o
   * mesmo post elogiado e criticado lado a lado.
   */
  it("melhores e piores nunca se cruzam", () => {
    const r = rankingDePublicacoes([p("a", 90, 1000), p("b", 50, 1000), p("c", 10, 1000)], 3);
    const ids = [...r.melhores, ...r.piores].map((x) => x.publicacao.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("com seis publicações, três de cada ponta", () => {
    const r = rankingDePublicacoes(
      ["a", "b", "c", "d", "e", "f"].map((id, i) => p(id, (i + 1) * 100, 1000)), 3);
    expect(r.melhores).toHaveLength(3);
    expect(r.piores).toHaveLength(3);
    expect(r.melhores[0].publicacao.id).toBe("f");
    expect(r.piores[0].publicacao.id).toBe("a");
  });

  it("empate na taxa desempata por interações absolutas", () => {
    const r = rankingDePublicacoes([p("grande", 200, 2000), p("pequeno", 100, 1000),
      p("x", 50, 1000), p("y", 40, 1000)], 1);
    expect(r.melhores[0].publicacao.id).toBe("grande");
  });

  it("lista vazia devolve ranking vazio, sem explodir", () => {
    const r = rankingDePublicacoes([]);
    expect(r.melhores).toEqual([]);
    expect(r.piores).toEqual([]);
    expect(r.alcanceMinimo).toBeNull();
  });

  /** Exclusão silenciosa faz a conta da grade não fechar com a do ranking. */
  it("o aviso nomeia o que ficou de fora, e some quando não há nada a dizer", () => {
    const comExcluidos = rankingDePublicacoes([
      { id: "minusculo", interacoes: 3, alcance: 40 },
      { id: "a", interacoes: 100, alcance: 10_000 },
      { id: "b", interacoes: 200, alcance: 10_000 },
      { id: "sem", interacoes: null, alcance: null },
    ]);
    const aviso = avisoDeExclusao(comExcluidos);
    expect(aviso).toContain("alcance baixo");
    expect(aviso).toContain("sem dados");

    const limpo = rankingDePublicacoes([
      { id: "a", interacoes: 100, alcance: 1000 },
      { id: "b", interacoes: 200, alcance: 1000 },
    ]);
    expect(avisoDeExclusao(limpo)).toBeNull();
  });
});

// ─── Períodos ───────────────────────────────────────────────────────────────

describe("aritmética de dia sem fuso", () => {
  it("soma e subtrai atravessando mês e ano", () => {
    expect(somarDias("2026-08-31", 1)).toBe("2026-09-01");
    expect(somarDias("2026-01-01", -1)).toBe("2025-12-31");
    expect(diasEntre("2026-08-01", "2026-08-31")).toBe(30);
  });

  it("dias de coleta contam as duas pontas", () => {
    expect(diasDeColeta("2026-08-12", "2026-08-12")).toBe(1);
    expect(diasDeColeta("2026-08-01", "2026-08-07")).toBe(7);
  });

  /** Nunca coletado ≠ coletado e deu zero. */
  it("sem coleta é null, e não zero", () => {
    expect(diasDeColeta(null, "2026-08-12")).toBeNull();
  });
});

describe("o seletor só oferece o que consegue servir", () => {
  const em = (coletaDesde: string | null, hoje: string) =>
    Object.fromEntries(periodosDisponiveis({ coletaDesde, hoje }).map((p) => [p.preset, p]));

  it("sem coleta, só 'hoje' — e os outros dizem por quê", () => {
    const p = em(null, "2026-08-12");
    expect(p.hoje.disponivel).toBe(true);
    expect(p["7d"].disponivel).toBe(false);
    expect(p["30d"].disponivel).toBe(false);
    expect(p["7d"].motivo).toContain("ainda não começou");
  });

  /** O bug que o módulo existe para impedir. */
  it("com 3 dias de coleta, '30 dias' NÃO é oferecido", () => {
    const p = em("2026-08-10", "2026-08-12");
    expect(p["30d"].disponivel).toBe(false);
    expect(p["7d"].disponivel).toBe(false);
    expect(p["7d"].motivo).toContain("Faltam 4 dia(s)");
    expect(p["7d"].liberaEm).toBe("2026-08-16");
  });

  it("com 7 dias, libera 7d mas ainda não 30d", () => {
    const p = em("2026-08-06", "2026-08-12");
    expect(p["7d"].disponivel).toBe(true);
    expect(p["30d"].disponivel).toBe(false);
  });

  it("com 30 dias, libera tudo que é janela móvel", () => {
    const p = em("2026-07-14", "2026-08-12");
    expect(p["7d"].disponivel).toBe(true);
    expect(p["30d"].disponivel).toBe(true);
  });

  /** Mês pela metade pareceria um mês fraco. */
  it("mês atual só vale se a coleta começou antes do dia 1º", () => {
    expect(em("2026-08-05", "2026-08-12").mesAtual.disponivel).toBe(false);
    expect(em("2026-07-20", "2026-08-12").mesAtual.disponivel).toBe(true);
  });

  it("mês anterior só vale se a coleta cobriu ele inteiro", () => {
    expect(em("2026-07-20", "2026-08-12").mesAnterior.disponivel).toBe(false);
    expect(em("2026-07-01", "2026-08-12").mesAnterior.disponivel).toBe(true);
    expect(em("2026-06-15", "2026-08-12").mesAnterior.disponivel).toBe(true);
  });

  it("preset indisponível continua na lista, para poder ser mostrado apagado", () => {
    expect(periodosDisponiveis({ coletaDesde: null, hoje: "2026-08-12" })).toHaveLength(5);
  });

  it("todo indisponível tem motivo escrito", () => {
    for (const p of periodosDisponiveis({ coletaDesde: "2026-08-10", hoje: "2026-08-12" })) {
      if (!p.disponivel) expect(p.motivo, p.preset).toBeTruthy();
    }
  });
});

describe("texto de cobertura e tendência", () => {
  it("sem coleta, avisa que a medição começa agora", () => {
    expect(textoDeCobertura({ coletaDesde: null, hoje: "2026-08-12" })).toContain("começa hoje");
  });

  it("com histórico, diz desde quando e quantos dias", () => {
    const t = textoDeCobertura({ coletaDesde: "2026-08-01", hoje: "2026-08-12" });
    expect(t).toContain("01/08/2026");
    expect(t).toContain("12 dias");
  });

  it("singular no primeiro dia", () => {
    expect(textoDeCobertura({ coletaDesde: "2026-08-12", hoje: "2026-08-12" })).toContain("1 dia de histórico");
  });

  /** Antes de duas semanas, variação é a única variação que existe. */
  it("tendência só depois de 14 dias de série", () => {
    expect(podeFalarDeTendencia({ coletaDesde: "2026-08-01", hoje: "2026-08-12" }).pode).toBe(false);
    expect(podeFalarDeTendencia({ coletaDesde: "2026-08-01", hoje: "2026-08-14" }).pode).toBe(true);
    expect(DIAS_PARA_TENDENCIA).toBe(14);
  });

  it("e diz a partir de quando vai poder", () => {
    const r = podeFalarDeTendencia({ coletaDesde: "2026-08-01", hoje: "2026-08-05" });
    expect(r.liberaEm).toBe("2026-08-14");
    expect(r.motivo).toContain("14/08/2026");
  });
});
