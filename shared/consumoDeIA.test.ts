/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Os limiares, e a tela que não pode ficar amarela para sempre
 * ─────────────────────────────────────────────────────────────────────────────
 *  O risco desta página não é errar um total: é alertar demais. Uma tela sempre
 *  amarela é uma tela que ninguém lê — e aí nem o alerta certo é visto.
 *
 *  Por isso os testes cobrem os dois lados de cada limiar: o caso que DEVE
 *  disparar e o caso normal que NÃO pode disparar. Um limiar só testado por
 *  cima passa a existir sem ninguém perceber que ele nunca cala.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, expect, it } from "vitest";
import {
  LIMIARES, NOME_SEM_CLIENTE, alertasDeConsumo, analisarClientes, analisarOrigens,
  leituraDoHistorico, totaisDoPeriodo, type DadosDeConsumo,
} from "./consumoDeIA";

const origem = (
  origem: string, chamadas: number, entrada: number, saida: number, falhas = 0, ms = 2000,
) => ({ origem, chamadas, falhas, tokensEntrada: entrada, tokensSaida: saida, duracaoMediaMs: ms });

const dia = (dia: string, chamadas: number, entrada: number, saida: number, falhas = 0) =>
  ({ dia, chamadas, falhas, tokensEntrada: entrada, tokensSaida: saida });

const dados = (p: Partial<DadosDeConsumo> = {}): DadosDeConsumo => ({
  porOrigem: [], porDia: [], porCliente: [], medindoDesde: "2026-08-18", ...p,
});

/**
 * Uma semana de rotina, com a distribuição que o sistema realmente tem: o cron
 * diário lidera, e as outras funcionalidades aparecem. Nada aqui é notícia — e
 * este é o teste mais importante do arquivo, porque é ele que impede a tela de
 * ficar amarela para sempre.
 */
const ROTINA = dados({
  porOrigem: [
    origem("status_ia", 70, 150_000, 15_000),   // 2.357/chamada
    origem("briefing", 7, 14_000, 2_000),       // 2.286/chamada
    origem("relatorio", 5, 11_000, 1_500),      // 2.500/chamada
    origem("relatorio_site", 4, 8_000, 1_200),  // 2.300/chamada
  ],
  porDia: Array.from({ length: 7 }, (_, i) => dia(`2026-08-${18 + i}`, 12, 36_000, 5_000)),
});

describe("os totais dizem o que medem", () => {
  it("soma entrada, saída e chamadas", () => {
    const t = totaisDoPeriodo(ROTINA.porOrigem);
    expect(t.chamadas).toBe(86);
    expect(t.tokensEntrada).toBe(183_000);
    expect(t.tokensSaida).toBe(19_700);
    expect(t.tokensTotais).toBe(202_700);
    expect(t.tokensPorChamada).toBeCloseTo(202_700 / 86, 3);
  });

  /** Sem chamada, "0% de falha" seria afirmação sobre o nada. */
  it("período vazio devolve null, e não zero", () => {
    const t = totaisDoPeriodo([]);
    expect(t.taxaDeFalha).toBeNull();
    expect(t.tokensPorChamada).toBeNull();
    expect(t.fracaoDeEntrada).toBeNull();
  });

  /**
   * A duração média é PONDERADA pelas chamadas. A simples daria peso igual a
   * uma origem de 200 chamadas e a uma de 2, e o número deixaria de descrever
   * o sistema.
   */
  it("a duração média é ponderada pelas chamadas", () => {
    const t = totaisDoPeriodo([origem("a", 100, 1, 1, 0, 1000), origem("b", 1, 1, 1, 0, 60_000)]);
    expect(t.duracaoMediaMs).toBeCloseTo((100 * 1000 + 1 * 60_000) / 101, 3);
    expect(t.duracaoMediaMs!).toBeLessThan(2000); // a simples daria 30.500
  });
});

describe("origem: total e por chamada contam histórias diferentes", () => {
  it("separa 'usada muito' de 'cara por vez'", () => {
    const d = dados({
      porOrigem: [
        origem("usada_muito", 100, 100_000, 10_000),   // 1.100/chamada
        origem("cara_por_vez", 4, 80_000, 8_000),      // 22.000/chamada
      ],
    });
    const [maior, menor] = analisarOrigens(d);
    expect(maior.origem).toBe("usada_muito");          // lidera em tokens
    expect(menor.tokensPorChamada!).toBeGreaterThan(maior.tokensPorChamada!);
  });

  it("origem sem chamada não divide por zero", () => {
    const [o] = analisarOrigens(dados({ porOrigem: [origem("x", 0, 0, 0)] }));
    expect(o.tokensPorChamada).toBeNull();
    expect(o.vezesAMedia).toBeNull();
  });
});

describe("cliente: null é resposta, não lacuna", () => {
  it("sem conta vira Global, e não some", () => {
    const c = analisarClientes(dados({
      porCliente: [
        { accountId: null, nome: null, chamadas: 7, tokensEntrada: 90_000, tokensSaida: 9_000 },
        { accountId: 4, nome: "Scaffold Play", chamadas: 12, tokensEntrada: 30_000, tokensSaida: 3_000 },
      ],
    }));
    expect(c[0].rotulo).toBe(NOME_SEM_CLIENTE);
    expect(c[0].global).toBe(true);
    expect(c[1].rotulo).toBe("Scaffold Play");
  });

  it("conta sem nome cai no id, e não em branco", () => {
    const [c] = analisarClientes(dados({
      porCliente: [{ accountId: 9, nome: null, chamadas: 1, tokensEntrada: 1, tokensSaida: 1 }],
    }));
    expect(c.rotulo).toBe("Conta 9");
    expect(c.global).toBe(false);
  });
});

describe("os alertas calam quando não há notícia", () => {
  /** O teste que mais importa: rotina não gera alerta nenhum. */
  it("uma semana de rotina não dispara nada", () => {
    expect(alertasDeConsumo(ROTINA)).toEqual([]);
  });

  it("período vazio não inventa alerta", () => {
    expect(alertasDeConsumo(dados())).toEqual([]);
  });

  /** Sem histórico suficiente, não há "o normal" para comparar contra. */
  it("poucos dias não produzem anomalia", () => {
    const d = dados({
      porOrigem: [origem("status_ia", 200, 900_000, 90_000)],
      porDia: [dia("2026-08-18", 10, 30_000, 3_000), dia("2026-08-19", 190, 870_000, 87_000)],
    });
    expect(alertasDeConsumo(d).filter((a) => a.tipo === "anomalia")).toEqual([]);
  });
});

describe("cada alerta traz o número que o causou", () => {
  it("VOLUME: dia com muito mais chamadas que a média", () => {
    const d = dados({
      porOrigem: [origem("status_ia", 100, 300_000, 30_000)],
      porDia: [
        dia("2026-08-18", 10, 30_000, 3_000), dia("2026-08-19", 10, 30_000, 3_000),
        dia("2026-08-20", 10, 30_000, 3_000), dia("2026-08-21", 10, 30_000, 3_000),
        dia("2026-08-22", 40, 30_000, 3_000),
      ],
    });
    const a = alertasDeConsumo(d).find((x) => x.tipo === "volume" && x.titulo.includes("chamadas"));
    expect(a).toBeTruthy();
    expect(a!.detalhe).toContain("40 chamadas");
    expect(a!.detalhe).toContain("média de 10");
  });

  it("ANOMALIA: dia com muito mais tokens que a média", () => {
    const d = dados({
      porOrigem: [origem("status_ia", 50, 300_000, 30_000)],
      porDia: [
        dia("2026-08-18", 10, 10_000, 1_000), dia("2026-08-19", 10, 10_000, 1_000),
        dia("2026-08-20", 10, 10_000, 1_000), dia("2026-08-21", 10, 10_000, 1_000),
        dia("2026-08-22", 10, 60_000, 6_000),
      ],
    });
    const a = alertasDeConsumo(d).find((x) => x.tipo === "anomalia");
    expect(a!.detalhe).toContain("66.000 tokens");
    expect(a!.detalhe).toMatch(/\d+% acima/);
  });

  /**
   * EFICIÊNCIA é sobre tokens POR CHAMADA. Uma origem com poucas chamadas e
   * prompt gigante é exatamente o que o total esconde.
   */
  it("EFICIÊNCIA: origem cara por chamada, mesmo sem liderar o total", () => {
    const d = dados({
      porOrigem: [
        origem("status_ia", 200, 200_000, 20_000),  // 1.100/chamada
        origem("relatorio", 10, 120_000, 12_000),   // 13.200/chamada
      ],
    });
    const a = alertasDeConsumo(d).find((x) => x.tipo === "eficiencia");
    expect(a!.origem).toBe("relatorio");
    expect(a!.detalhe).toContain("13.200 tokens por chamada");
    expect(a!.detalhe).toContain("×");
  });

  /** Amostra minúscula não julga eficiência — duas chamadas não são padrão. */
  it("origem com poucas chamadas não é acusada de ineficiente", () => {
    const d = dados({
      porOrigem: [origem("status_ia", 200, 200_000, 20_000), origem("raro", 2, 90_000, 9_000)],
    });
    expect(alertasDeConsumo(d).filter((x) => x.tipo === "eficiencia")).toEqual([]);
  });

  it("FALHA: taxa acima do limiar, com o número", () => {
    const d = dados({ porOrigem: [origem("status_ia", 100, 100_000, 10_000, 9)] });
    const a = alertasDeConsumo(d).find((x) => x.tipo === "falha");
    expect(a!.detalhe).toContain("9 de 100");
    expect(a!.detalhe).toContain("9,0%");
  });

  /** Poucas chamadas: 1 falha em 5 é 20% e não significa nada. */
  it("falha em amostra pequena não vira alerta", () => {
    const d = dados({ porOrigem: [origem("status_ia", 5, 5_000, 500, 1)] });
    expect(alertasDeConsumo(d).filter((x) => x.tipo === "falha")).toEqual([]);
  });

  it("CLIENTE fora do padrão, comparado com a média das contas", () => {
    const d = dados({
      porOrigem: [origem("status_ia", 60, 600_000, 60_000)],
      porCliente: [
        { accountId: 1, nome: "Scaffold Play", chamadas: 20, tokensEntrada: 900_000, tokensSaida: 90_000 },
        { accountId: 2, nome: "UMA", chamadas: 20, tokensEntrada: 40_000, tokensSaida: 4_000 },
        { accountId: 3, nome: "Aiká", chamadas: 20, tokensEntrada: 40_000, tokensSaida: 4_000 },
      ],
    });
    const a = alertasDeConsumo(d).find((x) => x.tipo === "anomalia" && x.accountId != null);
    expect(a!.accountId).toBe(1);
    expect(a!.detalhe).toContain("Scaffold Play");
    expect(a!.detalhe).toContain("mediana");
  });

  /**
   * A régua é a MEDIANA, e não a média. Com a média, um cliente entra no
   * próprio denominador: ser "3× a média" com 3 contas exigiria que as outras
   * duas somassem zero — o alerta seria inalcançável, e ninguém notaria, porque
   * um alerta que nunca dispara parece um sistema calmo.
   */
  it("o outlier não infla a própria régua", () => {
    const d = dados({
      porOrigem: [origem("status_ia", 60, 600_000, 60_000)],
      porCliente: [
        { accountId: 1, nome: "Grande", chamadas: 20, tokensEntrada: 300_000, tokensSaida: 30_000 },
        { accountId: 2, nome: "B", chamadas: 20, tokensEntrada: 40_000, tokensSaida: 4_000 },
        { accountId: 3, nome: "C", chamadas: 20, tokensEntrada: 40_000, tokensSaida: 4_000 },
      ],
    });
    // 330k contra mediana 44k = 7,5×. Pela média (139k) daria 2,4× e calaria.
    const a = alertasDeConsumo(d).find((x) => x.accountId === 1);
    expect(a, "a régua voltou a ser a média").toBeTruthy();
  });

  /**
   * O global costuma ser o maior por natureza — ele apareceria toda vez,
   * dizendo apenas que existe.
   */
  it("o Global nunca é apontado como cliente fora do padrão", () => {
    const d = dados({
      porOrigem: [origem("briefing", 30, 900_000, 90_000)],
      porCliente: [
        { accountId: null, nome: null, chamadas: 10, tokensEntrada: 800_000, tokensSaida: 80_000 },
        { accountId: 1, nome: "A", chamadas: 10, tokensEntrada: 50_000, tokensSaida: 5_000 },
        { accountId: 2, nome: "B", chamadas: 10, tokensEntrada: 50_000, tokensSaida: 5_000 },
        { accountId: 3, nome: "C", chamadas: 10, tokensEntrada: 50_000, tokensSaida: 5_000 },
      ],
    });
    for (const a of alertasDeConsumo(d)) expect(a.accountId).not.toBeNull();
  });

  /** Concentração é notícia só quando há com o que comparar. */
  /**
   * Concentração NÃO é alerta.
   *
   * Ela disparava na semana de rotina — o cron diário domina os tokens por
   * desenho. Um aviso permanente sobre um fato conhecido gasta a atenção que o
   * alerta real vai precisar. A informação vive no bloco "por origem", que
   * mostra a fatia de cada uma ordenada.
   */
  it("origem dominante não vira aviso permanente", () => {
    const d = dados({
      porOrigem: [
        origem("status_ia", 200, 400_000, 40_000),   // 2.200/chamada, 90% dos tokens
        origem("briefing", 7, 14_000, 2_000),        // 2.286/chamada
        origem("relatorio", 5, 11_000, 1_500),       // 2.500/chamada
      ],
    });
    expect(alertasDeConsumo(d)).toEqual([]);
    // E a fatia continua legível onde ela pertence.
    expect(analisarOrigens(d)[0].fatia!).toBeGreaterThan(0.85);
  });
});

describe("o histórico não finge existir", () => {
  it("sem registro, diz que não há", () => {
    const h = leituraDoHistorico(null, "2026-08-22");
    expect(h.dias).toBe(0);
    expect(h.suficienteParaTendencia).toBe(false);
    expect(h.frase).toContain("Nenhuma geração");
  });

  it("conta os dias reais e mostra a data de início", () => {
    const h = leituraDoHistorico("2026-08-18", "2026-08-22");
    expect(h.dias).toBe(5);
    expect(h.frase).toContain("18/08/2026");
    expect(h.frase).toContain("5 dias de histórico");
    expect(h.suficienteParaTendencia).toBe(false);
  });

  it("uma semana já sustenta leitura de tendência", () => {
    expect(leituraDoHistorico("2026-08-18", "2026-08-24").suficienteParaTendencia).toBe(true);
  });

  it("o primeiro dia é 1, e não 0", () => {
    expect(leituraDoHistorico("2026-08-22", "2026-08-22")).toMatchObject({ dias: 1 });
  });
});

describe("os limiares são ajustáveis sem tocar na página", () => {
  it("todos moram em LIMIARES", () => {
    for (const chave of [
      "anomaliaDoDia", "diasParaComparar", "ineficienciaDaOrigem",
      "chamadasParaJulgarEficiencia", "falhas", "chamadasParaJulgarFalhas",
      "clienteForaDoPadrao", "clientesParaComparar",
    ]) {
      expect(LIMIARES, chave).toHaveProperty(chave);
    }
  });

  /** Deliberadamente altos: o custo de alertar demais é a tela perder crédito. */
  it("os limiares não são gatilhos de qualquer variação", () => {
    expect(LIMIARES.anomaliaDoDia).toBeGreaterThanOrEqual(1.5);
    expect(LIMIARES.falhas).toBeGreaterThanOrEqual(0.03);
    expect(LIMIARES.ineficienciaDaOrigem).toBeGreaterThanOrEqual(1.5);
  });
});
