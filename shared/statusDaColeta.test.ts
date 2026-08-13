/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Um clique não responde "o robô rodou?"
 * ─────────────────────────────────────────────────────────────────────────────
 *  A armadilha deste módulo: se coleta automática e manual virassem um "última
 *  coleta" só, alguém clicando em Coletar agora às 10h apagaria da tela o
 *  silêncio das 06:20. O sinal ficaria verde justamente no dia em que o cron
 *  parou — e o cron parado é a única coisa que essa linha existe para mostrar.
 *
 *  A segunda armadilha é a graduação. Uma conta com token vencido no meio de
 *  doze não é uma coleta falha; pintar de vermelho todo dia ensina a ignorar o
 *  vermelho, e aí o dia em que ele importa passa batido.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, expect, it } from "vitest";
import {
  HORAS_ATE_SILENCIO, lerColetaAutomatica, quando, type ExecucaoDeColeta,
} from "./statusDaColeta";

const AGORA = new Date("2026-08-13T14:00:00");
const emHoras = (h: number) => new Date(AGORA.getTime() - h * 3_600_000);

const exec = (over: Partial<ExecucaoDeColeta> = {}): ExecucaoDeColeta => ({
  origem: "cron", escopo: "geral", dia: "2026-08-13",
  tentados: 12, ok: 12, parciais: 0, erros: 0, pulados: 0,
  executadaEm: new Date("2026-08-13T06:20:00"),
  ...over,
});

describe("quando a coleta rodou, em português", () => {
  it("hoje, ontem e antes disso", () => {
    expect(quando(new Date("2026-08-13T06:20:00"), AGORA)).toBe("hoje às 06:20");
    expect(quando(new Date("2026-08-12T18:20:00"), AGORA)).toBe("ontem às 18:20");
    expect(quando(new Date("2026-08-09T06:20:00"), AGORA)).toBe("09/08 às 06:20");
  });

  it("aceita string, que é como chega do servidor", () => {
    expect(quando("2026-08-13T06:20:00", AGORA)).toBe("hoje às 06:20");
  });
});

describe("o sinal da coleta automática", () => {
  it("tudo certo é verde, com a contagem", () => {
    const r = lerColetaAutomatica(exec(), AGORA);
    expect(r.nivel).toBe("ok");
    expect(r.titulo).toBe("Última coleta automática: hoje às 06:20");
    expect(r.detalhe).toBe("12 de 12 conta(s)");
  });

  /** Uma conta com problema não faz a coleta ser um fracasso. */
  it("erro em algumas contas é atenção, e não erro", () => {
    const r = lerColetaAutomatica(exec({ ok: 10, erros: 1, pulados: 1 }), AGORA);
    expect(r.nivel).toBe("atencao");
    expect(r.detalhe).toContain("1 com erro");
    expect(r.detalhe).toContain("1 pulada");
  });

  it("nenhuma conta coletada é erro de verdade", () => {
    const r = lerColetaAutomatica(exec({ ok: 0, parciais: 0, erros: 12 }), AGORA);
    expect(r.nivel).toBe("erro");
    expect(r.detalhe).toContain("Nenhuma conta foi coletada");
  });

  it("parcial conta como coletada — o dia tem dado", () => {
    expect(lerColetaAutomatica(exec({ ok: 0, parciais: 12, erros: 0 }), AGORA).nivel).toBe("atencao");
  });

  /**
   * Silêncio vem ANTES do resultado: uma coleta impecável há três dias é um
   * problema maior que uma que falhou hoje, e o verde antigo esconderia isso.
   */
  it("coleta antiga vira silêncio mesmo tendo dado tudo certo", () => {
    const r = lerColetaAutomatica(exec({ executadaEm: emHoras(50) }), AGORA);
    expect(r.nivel).toBe("silencio");
    expect(r.detalhe).toContain("sem rodar");
    expect(r.detalhe).toContain("serviço está no ar");
  });

  it("dentro da janela, ainda é o resultado que manda", () => {
    expect(lerColetaAutomatica(exec({ executadaEm: emHoras(HORAS_ATE_SILENCIO - 2) }), AGORA).nivel).toBe("ok");
  });

  /** Instalação nova não é falha, e vermelho aqui ensina a ignorar vermelho. */
  it("nunca ter rodado não é erro", () => {
    const r = lerColetaAutomatica(null, AGORA);
    expect(r.nivel).toBe("nunca");
    expect(r.titulo).toContain("ainda não rodou");
    expect(r.detalhe).toContain("06:20");
  });
});

describe("um clique não mascara o silêncio do robô", () => {
  /**
   * A separação continua valendo, e é `lerColetaAutomatica` que a garante: ela
   * lê SÓ execuções do cron. Coleta manual entra por outro caminho — junto do
   * número que produziu, em `statusDoCliente`.
   */
  it("coleta manual recente não altera o sinal do robô", () => {
    const semRobo = lerColetaAutomatica(null, AGORA);
    expect(semRobo.nivel).toBe("nunca");
    expect(semRobo.titulo).toContain("ainda não rodou");
  });

  it("robô calado há dias continua calado", () => {
    expect(lerColetaAutomatica(exec({ executadaEm: emHoras(72) }), AGORA).nivel).toBe("silencio");
  });
});
