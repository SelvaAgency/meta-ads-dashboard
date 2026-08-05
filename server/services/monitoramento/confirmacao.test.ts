/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Confirmação dupla — ciclos consecutivos exercitados sem esperar 5 minutos
 * ─────────────────────────────────────────────────────────────────────────────
 *  O valor destes testes está na SEQUÊNCIA: um ciclo isolado não prova nada
 *  sobre uma trava que existe justamente para relacionar leituras vizinhas.
 *  Por isso o helper `rodar` abaixo encadeia estados, como o cron faria.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, expect, it } from "vitest";
import { decidir, descreverSuspeita, normalizarConfirmacoes, type Suspeita } from "./confirmacao";
import type { Achado } from "./avaliador";

const CRITICO: Achado = {
  chave: "dominio_divergente", sev: "CRITICAL",
  titulo: "Site redireciona para outro domínio",
  detalhe: "Esperado aikabodysoul.com, chegou em registro-suspenso.net.",
  exigeConfirmacao: true, evidencia: {},
};
const OUTRO_CRITICO: Achado = { ...CRITICO, chave: "dns_nao_resolve", titulo: "Domínio não resolve" };
const AVISO: Achado = { ...CRITICO, chave: "ns_mudou", sev: "WARNING", exigeConfirmacao: false };
const OK: Achado = { ...CRITICO, chave: "ok", sev: "INFO", exigeConfirmacao: false };

/**
 * Encadeia ciclos como o cron faria: a suspeita de um vira a entrada do
 * próximo. Devolve a ação de cada ciclo, na ordem.
 */
function rodar(sequencia: Achado[][], necessarias = 2) {
  let anterior: Suspeita | null = null;
  const acoes: string[] = [];
  sequencia.forEach((achados, i) => {
    const d = decidir({
      achados, anterior, confirmacoesNecessarias: necessarias,
      agoraIso: `2026-08-05T10:${String(i * 5).padStart(2, "0")}:00.000Z`,
    });
    acoes.push(d.acao);
    anterior = d.acao === "normalizou" || d.acao === "seguir" ? null : d.suspeita;
  });
  return acoes;
}

describe("a trava que impede alerta na primeira leitura", () => {
  it("primeira leitura crítica AGUARDA — nunca alerta", () => {
    const d = decidir({ achados: [CRITICO], anterior: null, confirmacoesNecessarias: 2, agoraIso: "2026-08-05T10:00:00.000Z" });
    expect(d.acao).toBe("aguardar");
    if (d.acao === "aguardar") {
      expect(d.faltam).toBe(1);
      expect(d.suspeita.confirmada).toBe(false);
      expect(d.suspeita.ciclos).toBe(1);
    }
  });

  it("segunda leitura com o MESMO problema confirma e alerta", () => {
    expect(rodar([[CRITICO], [CRITICO]])).toEqual(["aguardar", "alertar"]);
  });

  /** O caso que a trava existe para engolir: a rede piscou. */
  it("normalizar na segunda leitura NÃO alerta — é instabilidade momentânea", () => {
    const d = decidir({
      achados: [OK],
      anterior: { chave: "dominio_divergente", desde: "2026-08-05T10:00:00.000Z", ciclos: 1, confirmada: false, titulo: "x", detalhe: "y", sev: "CRITICAL" },
      confirmacoesNecessarias: 2, agoraIso: "2026-08-05T10:05:00.000Z",
    });
    expect(d.acao).toBe("normalizou");
    if (d.acao === "normalizou") expect(d.instabilidadeMomentanea).toBe(true);
  });

  it("piscada isolada no meio de um dia normal não gera alerta nenhum", () => {
    expect(rodar([[OK], [CRITICO], [OK], [OK]])).toEqual(["seguir", "aguardar", "normalizou", "seguir"]);
  });

  /**
   * Problema DIFERENTE recomeça a contagem. Herdar os ciclos do anterior faria
   * um achado novo nascer já confirmado — furando a trava por um caminho que
   * ninguém procuraria.
   */
  it("trocar de problema não aproveita a contagem do anterior", () => {
    expect(rodar([[CRITICO], [OUTRO_CRITICO]])).toEqual(["aguardar", "aguardar"]);
    expect(rodar([[CRITICO], [OUTRO_CRITICO], [OUTRO_CRITICO]])).toEqual(["aguardar", "aguardar", "alertar"]);
  });
});

describe("depois de confirmado", () => {
  it("problema que persiste não realerta a cada ciclo", () => {
    expect(rodar([[CRITICO], [CRITICO], [CRITICO], [CRITICO]]))
      .toEqual(["aguardar", "alertar", "manter", "manter"]);
  });

  it("recuperar depois de alertado não é instabilidade momentânea", () => {
    const d = decidir({
      achados: [OK],
      anterior: { chave: "dominio_divergente", desde: "2026-08-05T10:00:00.000Z", ciclos: 4, confirmada: true, titulo: "x", detalhe: "y", sev: "CRITICAL" },
      confirmacoesNecessarias: 2, agoraIso: "2026-08-05T10:20:00.000Z",
    });
    expect(d.acao).toBe("normalizou");
    if (d.acao === "normalizou") expect(d.instabilidadeMomentanea).toBe(false);
  });

  it("o 'desde' é preservado ao longo do incidente — é o há-quanto-tempo", () => {
    let anterior: Suspeita | null = null;
    for (let i = 0; i < 4; i++) {
      const d = decidir({ achados: [CRITICO], anterior, confirmacoesNecessarias: 2, agoraIso: `2026-08-05T10:${i * 5}0:00.000Z` });
      anterior = d.acao === "seguir" || d.acao === "normalizou" ? null : d.suspeita;
    }
    expect(anterior!.desde).toBe("2026-08-05T10:00:00.000Z");
    expect(anterior!.ciclos).toBe(4);
  });
});

describe("o que nunca entra na trava", () => {
  it("WARNING e INFO não viram suspeita — não acordam ninguém", () => {
    expect(rodar([[AVISO, OK], [AVISO], [AVISO]])).toEqual(["seguir", "seguir", "seguir"]);
  });
});

describe("configuração", () => {
  it("três confirmações atrasam o alerta em um ciclo", () => {
    expect(rodar([[CRITICO], [CRITICO], [CRITICO]], 3)).toEqual(["aguardar", "aguardar", "alertar"]);
  });

  /**
   * O piso de 2 não é detalhe: 1 devolveria exatamente o alerta-na-primeira-
   * leitura que a trava existe para impedir, por um campo que alguém mexeria
   * sem lembrar do porquê.
   */
  it.each([[0], [1], [-5], [null], [undefined], [NaN]])("valor %s é elevado ao piso de 2", (v) => {
    expect(normalizarConfirmacoes(v as number)).toBe(2);
  });

  it("valor absurdo é limitado — configurar 999 seria 'nunca alerta'", () => {
    expect(normalizarConfirmacoes(999)).toBe(10);
  });

  it("mesmo configurado em 1, a primeira leitura ainda AGUARDA", () => {
    expect(rodar([[CRITICO]], 1)).toEqual(["aguardar"]);
  });
});

describe("descrição para a tela", () => {
  it("aguardando mostra o progresso, não só 'pendente'", () => {
    const s: Suspeita = { chave: "k", desde: "x", ciclos: 1, confirmada: false, titulo: "Domínio não resolve", detalhe: "d", sev: "CRITICAL" };
    expect(descreverSuspeita(s, 2)).toBe("Domínio não resolve — aguardando confirmação (1/2 leituras).");
    expect(descreverSuspeita({ ...s, confirmada: true }, 2)).toBe("Domínio não resolve — confirmado, alerta emitido.");
  });
});
