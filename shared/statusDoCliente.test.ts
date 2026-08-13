/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Última TENTATIVA e última coleta VÁLIDA não são a mesma data
 * ─────────────────────────────────────────────────────────────────────────────
 *  É a distinção que este módulo existe para fazer. Uma conta que falha há três
 *  dias tem tentativa de HOJE e dado de TRÊS DIAS ATRÁS:
 *
 *    só a tentativa    o número parece fresco, e não é
 *    só a última boa   esconde que o robô vem tentando e falhando
 *
 *  E a camada é complementar à saúde do robô, não substituta: uma rodada com
 *  "11 de 12 contas" é saudável operacionalmente — e a décima segunda pode ser
 *  exatamente a que alguém está olhando.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, expect, it } from "vitest";
import {
  CAMPOS_DO_STATUS, ROTULO_ORIGEM, lerStatusDoCliente, type SnapshotDoCliente,
} from "./statusDoCliente";

const AGORA = new Date("2026-08-13T14:00:00");

const completo = {
  profile_views: 30, reach: 287, total_interactions: 13, website_clicks: 0,
};

const snap = (over: Partial<SnapshotDoCliente> = {}): SnapshotDoCliente => ({
  dia: "2026-08-13",
  coletadoEm: new Date("2026-08-13T06:20:00"),
  statusColeta: "ok",
  origem: "cron",
  seguidores: 9464,
  storiesVistos: 2,
  metricas: { ...completo },
  midiasIndisponiveis: false,
  ...over,
});

describe("tudo coletado", () => {
  it("é verde, com a fonte e a hora", () => {
    const r = lerStatusDoCliente([snap()], AGORA);
    expect(r.nivel).toBe("ok");
    expect(r.atualizadoEm).toBe("hoje às 06:20");
    expect(r.fonte).toBe("Coleta automática");
    expect(r.faltando).toEqual([]);
    expect(r.atualizados).toContain("seguidores");
    expect(r.atualizados).toContain("visitas ao perfil");
  });

  it("coleta manual se identifica como tal", () => {
    expect(lerStatusDoCliente([snap({ origem: "manual" })], AGORA).fonte).toBe("Atualização manual");
    expect(ROTULO_ORIGEM.cron).toBeTruthy();
    expect(ROTULO_ORIGEM.manual).toBeTruthy();
  });

  /** A última VÁLIDA não aparece quando é a mesma da tentativa — seria ruído. */
  it("sem falha, não repete a data como 'última válida'", () => {
    expect(lerStatusDoCliente([snap()], AGORA).ultimaValidaEm).toBeNull();
  });
});

describe("coleta parcial", () => {
  it("nomeia o que faltou, sem chamar de erro", () => {
    const r = lerStatusDoCliente(
      [snap({ statusColeta: "parcial", metricas: { reach: 287 } })], AGORA, 2);
    expect(r.nivel).toBe("atencao");
    expect(r.faltando).toContain("visitas ao perfil");
    expect(r.atualizados).toContain("alcance");
    // Descreve o estado, e não alarma: seis métricas certas e uma faltando não
    // é o mesmo problema que nenhuma coleta.
    expect(r.principal).toBe("Dados parcialmente atualizados hoje às 06:20");
    // A secundária carrega só a ORIGEM. "1 item(ns) sem dado" ocupava o lugar
    // de dizer qual item, e não dizia.
    expect(r.secundaria).toBe("Coleta automática");
    expect(r.secundaria).not.toContain("item");
    expect(r.faltando).toContain("visitas ao perfil");
  });

  /** Stories nulo é "não medido", e entra em faltando — nunca como zero. */
  it("stories não medido conta como faltando", () => {
    const r = lerStatusDoCliente([snap({ storiesVistos: null })], AGORA);
    expect(r.faltando).toContain("stories");
  });

  it("zero real de cliques NÃO conta como faltando", () => {
    const r = lerStatusDoCliente([snap({ metricas: { ...completo, website_clicks: 0 } })], AGORA);
    expect(r.faltando).not.toContain("cliques no link");
  });

  /**
   * A distinção que faltava: zero publicações LIDAS não é ausência de dado.
   * Confundir as duas transforma "a conta não publicou" — afirmação sobre o
   * cliente, que ninguém mediu — em "não conseguimos ler".
   */
  it("zero publicações lidas com sucesso NÃO conta como faltando", () => {
    const r = lerStatusDoCliente([snap({ midiasIndisponiveis: false })], AGORA);
    expect(r.faltando).not.toContain("publicações");
    expect(r.atualizados).toContain("publicações");
    expect(r.nivel).toBe("ok");
  });

  it("consulta de publicações que falhou é que conta como faltando", () => {
    const r = lerStatusDoCliente([snap({ midiasIndisponiveis: true })], AGORA);
    expect(r.faltando).toEqual(["publicações"]);
    expect(r.nivel).toBe("atencao");
    expect(r.principal).toContain("parcialmente atualizados");
  });
});

describe("a última tentativa falhou", () => {
  /** O caso central do módulo. */
  it("mostra a tentativa de hoje E o dado de ontem, separados", () => {
    const r = lerStatusDoCliente([
      snap({ dia: "2026-08-11", coletadoEm: new Date("2026-08-11T06:20:00") }),
      snap({
        dia: "2026-08-13", statusColeta: "erro", seguidores: null, metricas: {},
        coletadoEm: new Date("2026-08-13T06:20:00"),
      }),
    ], AGORA);

    expect(r.nivel).toBe("erro");
    expect(r.atualizadoEm).toBe("hoje às 06:20");
    expect(r.ultimaValidaEm).toBe("11/08 às 06:20");
    expect(r.principal).toBe("Dados desatualizados");
    // As DUAS datas na mesma frase — é a distinção que o módulo existe para fazer.
    expect(r.secundaria).toContain("Última coleta válida: 11/08 às 06:20");
    expect(r.secundaria).toContain("Última tentativa: hoje às 06:20");
  });

  /** Snapshot gravado com status ok mas sem número nenhum também não vale. */
  it("linha sem dado nenhum não passa por válida, mesmo com status ok", () => {
    const r = lerStatusDoCliente([snap({ statusColeta: "ok", seguidores: null, metricas: {} })], AGORA);
    expect(r.nivel).toBe("erro");
    expect(r.ultimaValidaEm).toBeNull();
    expect(r.secundaria).toContain("Nenhuma coleta trouxe dado");
  });

  it("busca a última válida por trás de várias falhas seguidas", () => {
    const r = lerStatusDoCliente([
      snap({ dia: "2026-08-09", coletadoEm: new Date("2026-08-09T06:20:00") }),
      snap({ dia: "2026-08-11", statusColeta: "erro", seguidores: null, metricas: {} }),
      snap({ dia: "2026-08-12", statusColeta: "erro", seguidores: null, metricas: {} }),
      snap({ dia: "2026-08-13", statusColeta: "erro", seguidores: null, metricas: {} }),
    ], AGORA);
    expect(r.ultimaValidaEm).toBe("09/08 às 06:20");
  });
});

describe("ordem e ausência", () => {
  it("a ordem de entrada não importa — a função ordena", () => {
    const antigo = snap({ dia: "2026-08-10", coletadoEm: new Date("2026-08-10T06:20:00") });
    const novo = snap({ dia: "2026-08-13" });
    expect(lerStatusDoCliente([antigo, novo], AGORA).atualizadoEm)
      .toBe(lerStatusDoCliente([novo, antigo], AGORA).atualizadoEm);
  });

  /** Cliente novo não é falha — e o texto explica de onde vêm os números. */
  it("sem snapshot nenhum é estado próprio, e não erro", () => {
    const r = lerStatusDoCliente([], AGORA);
    expect(r.nivel).toBe("nunca");
    expect(r.atualizadoEm).toBeNull();
    expect(r.principal).toBe("Dados ainda não coletados");
    expect(r.secundaria).toContain("leitura ao vivo");
    expect(r.faltando).toHaveLength(CAMPOS_DO_STATUS.length);
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  A linha principal responde sozinha
 * ─────────────────────────────────────────────────────────────────────────────
 *  Ela mora no cabeçalho, antes de qualquer número. Se precisar da secundária
 *  para significar alguma coisa, quem só bate o olho sai com a impressão errada
 *  — e a impressão errada aqui é "este dado está fresco".
 * ─────────────────────────────────────────────────────────────────────────────
 */
describe("a linha do cabeçalho se basta", () => {
  const casos = [
    ["em dia", [snap()], "Dados atualizados hoje às 06:20"],
    ["parcial", [snap({ metricas: { reach: 1 } })], "Dados parcialmente atualizados hoje às 06:20"],
    ["nunca coletado", [], "Dados ainda não coletados"],
    ["última falhou", [snap({ statusColeta: "erro", seguidores: null, metricas: {} })], "Dados desatualizados"],
  ] as const;

  it.each(casos)("%s → %s", (_n, snaps, esperado) => {
    expect(lerStatusDoCliente(snaps as SnapshotDoCliente[], AGORA).principal).toBe(esperado);
  });

  /** Nenhum estado pode sair com a linha vazia. */
  it("toda combinação produz linha principal", () => {
    for (const snaps of [[], [snap()], [snap({ statusColeta: "parcial", metricas: { reach: 1 } })],
      [snap({ statusColeta: "erro", seguidores: null, metricas: {} })]]) {
      const r = lerStatusDoCliente(snaps as SnapshotDoCliente[], AGORA);
      expect(r.principal, r.nivel).toBeTruthy();
    }
  });

  /** "Desatualizado" nunca aparece junto de uma data que sugira frescor. */
  it("estado desatualizado não anuncia a data da tentativa como se fosse o dado", () => {
    const r = lerStatusDoCliente([
      snap({ dia: "2026-08-11", coletadoEm: new Date("2026-08-11T06:20:00") }),
      snap({ dia: "2026-08-13", statusColeta: "erro", seguidores: null, metricas: {} }),
    ], AGORA);
    expect(r.principal).not.toContain("hoje");
    // `not.toContain("atualizados")` seria ingênuo: "desatualizados" o contém.
    // O que não pode é a frase AFIRMAR que os dados estão atualizados.
    expect(r.principal).not.toMatch(/^Dados atualizados/);
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  A hora é a da MEDIÇÃO, não a da criação da linha
 * ─────────────────────────────────────────────────────────────────────────────
 *  Bug real: o snapshot do dia é ATUALIZADO a cada coleta, e `coletadoEm` tinha
 *  só `defaultNow()` — que só vale na criação. Uma coleta manual às 12:57
 *  gravava dado novo e trocava a origem para "manual", mas o cabeçalho seguia
 *  dizendo 06:20. Origem nova com hora velha: as duas metades da frase vinham de
 *  coletas diferentes.
 * ─────────────────────────────────────────────────────────────────────────────
 */
describe("hora e origem vêm da MESMA coleta", () => {
  it("a hora exibida é a do `coletadoEm` da linha, seja qual for", () => {
    const r = lerStatusDoCliente([snap({
      origem: "manual", coletadoEm: new Date("2026-08-13T12:57:00"),
    })], AGORA);
    expect(r.atualizadoEm).toBe("hoje às 12:57");
    expect(r.fonte).toBe("Atualização manual");
    expect(r.principal).toContain("12:57");
  });

  /** O sintoma que o usuário viu, invertido: não pode voltar. */
  it("origem manual nunca aparece com a hora do cron", () => {
    const r = lerStatusDoCliente([snap({
      origem: "manual", coletadoEm: new Date("2026-08-13T12:57:00"),
    })], AGORA);
    expect(r.principal).not.toContain("06:20");
  });
});
