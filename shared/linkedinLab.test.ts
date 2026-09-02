/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  O que a Fase 0 custou para descobrir, e que não pode ser desfeito por
 *  refatoração
 * ─────────────────────────────────────────────────────────────────────────────
 *  Oito rodadas de sondagem produziram três conclusões que um simplificador
 *  bem-intencionado desfaria em cinco minutos:
 *
 *    · lista vazia NÃO é bloqueio
 *    · o cargo NÃO decide o que a Página entrega
 *    · ausência NÃO é zero
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, expect, it } from "vitest";
import {
  capacidadesFaltantes, cargoPrincipal, cargosVivos, classificarResposta,
  estadoDoDado, statusDoVinculo, temAtribuicaoViva,
  type MapaDeCapacidades,
} from "./linkedinLab";

const r = (ok: boolean, status: number | null, erro: string | null = null) => ({ ok, status, erro });

describe("200 com lista vazia não é bloqueio", () => {
  it("distingue 'sem dados' de 'sem permissão'", () => {
    // O falso negativo da rodada 1: uma Página sem publicação responde 200 com
    // lista vazia, e ler isso como limitação da API produziu quatro "NÃO" que
    // eram inconclusivos.
    expect(classificarResposta(r(true, 200), true)).toBe("sem_dados");
    expect(classificarResposta(r(false, 403, "insufficient permissions"))).toBe("sem_permissao");
  });

  it("400 comum é erro NOSSO, e tem conserto aqui", () => {
    expect(classificarResposta(r(false, 400, "Invalid projection parameter"))).toBe("erro");
  });

  it("400 dizendo 'unknown' é a API dizendo que aquilo não existe nela", () => {
    expect(classificarResposta(r(false, 400, "unknown field"))).toBe("nao_disponivel");
    expect(classificarResposta(r(false, 404, "not found"))).toBe("nao_disponivel");
  });
});

describe("o veredito do vínculo", () => {
  const mapa = (over: Partial<Record<string, string>> = {}): MapaDeCapacidades => {
    const base = {
      pagina: "ok", seguidores_atuais: "ok", seguidores_serie: "ok",
      pagina_lifetime: "ok", pagina_serie: "ok", publicacoes: "ok",
      metricas_por_post: "ok", ...over,
    };
    return Object.fromEntries(Object.entries(base).map(([k, v]) => [
      k, { estado: v, status: 200, motivo: null, medidaEm: "2026-09-02T00:00:00Z" },
    ])) as MapaDeCapacidades;
  };

  it("tudo respondendo é completo", () => {
    expect(statusDoVinculo(mapa())).toBe("completo");
  });

  it("uma recusa vira parcial, e o relatório sabe QUAL", () => {
    const m = mapa({ seguidores_serie: "sem_permissao" });
    expect(statusDoVinculo(m)).toBe("parcial");
    expect(capacidadesFaltantes(m).map((x) => x.capacidade)).toEqual(["seguidores_serie"]);
  });

  it("Página sem publicação continua COMPLETA", () => {
    // `sem_dados` é sobre a carteira, não sobre a API. Contá-lo como
    // incompletude culparia o LinkedIn por um cliente que não publica — e
    // "parcial" que nunca vira "completo" deixa de ser diagnóstico.
    expect(statusDoVinculo(mapa({ publicacoes: "sem_dados", metricas_por_post: "sem_dados" })))
      .toBe("completo");
  });

  it("tudo bloqueado é SEM ACESSO, não erro — o conserto é outro", () => {
    const todas = mapa(Object.fromEntries(
      ["pagina", "seguidores_atuais", "seguidores_serie", "pagina_lifetime",
       "pagina_serie", "publicacoes", "metricas_por_post"].map((k) => [k, "sem_permissao"])));
    expect(statusDoVinculo(todas)).toBe("sem_acesso");
  });

  it("sem vínculo não é falha", () => {
    expect(statusDoVinculo({}, false)).toBe("nao_vinculada");
  });
});

describe("ausência nunca é zero", () => {
  it("os quatro estados são distintos", () => {
    expect(estadoDoDado(0)).toBe("medido");
    expect(estadoDoDado(null, { seguidores: "403" }, "seguidores")).toBe("indisponivel");
    expect(estadoDoDado(null)).toBe("nao_coletado");
    expect(estadoDoDado(null, null, undefined, true)).toBe("erro");
  });

  it("zero MEDIDO não se confunde com ausência", () => {
    expect(estadoDoDado(0, { x: "403" }, "x")).toBe("medido");
  });
});

describe("cargo", () => {
  const papeis = [
    { papel: "CONTENT_ADMINISTRATOR", estado: "REVOKED" },
    { papel: "ADMINISTRATOR", estado: "APPROVED" },
  ];

  it("o principal é um cargo VIVO, mesmo que o morto tenha mais alcance", () => {
    // A rodada 8 da sondagem: o cabeçalho rotulava a Página por um cargo
    // revogado, desmentindo o achado três seções abaixo.
    expect(cargoPrincipal(papeis)).toBe("ADMINISTRATOR");
  });

  it("cargos vivos e mortos não se misturam", () => {
    expect(cargosVivos(papeis)).toEqual(["ADMINISTRATOR"]);
    expect(temAtribuicaoViva(papeis)).toBe(true);
    expect(temAtribuicaoViva([{ papel: "ADMINISTRATOR", estado: "REVOKED" }])).toBe(false);
  });
});
