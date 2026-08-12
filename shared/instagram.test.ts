/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Conta pessoal não é erro
 * ─────────────────────────────────────────────────────────────────────────────
 *  É a regra que esta frente inteira existe para garantir. A maioria dos
 *  clientes é profissional, mas o sistema não pode quebrar — nem acusar — quando
 *  encontrar uma conta pessoal: ela está exatamente como o cliente quer, e
 *  mostrar isso como falha faria alguém tentar consertar o que não está quebrado.
 *
 *  O outro lado da mesma moeda: uma conta BUSINESS sem insights TAMBÉM não é
 *  pessoal. Confundir os dois esconderia uma permissão faltando no token atrás
 *  de "conta limitada".
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, expect, it } from "vitest";
import {
  ROTULO_INSIGHT, ROTULO_TIPO, lerVinculo, tipoDaResposta, tipoPermiteInsights,
  type StatusInsight, type TipoConta,
} from "./instagram";

const v = (over: Partial<Parameters<typeof lerVinculo>[0]> = {}) => lerVinculo({
  estado: "VINCULADO", tipoConta: "BUSINESS", statusInsight: "DISPONIVEL",
  username: "aikabodysoul", pageName: "Aiká", ...over,
});

describe("conta pessoal é estado válido, nunca erro", () => {
  it("pessoal é 'limitado', com a explicação certa", () => {
    const r = v({ tipoConta: "PESSOAL", statusInsight: "INDISPONIVEL" });
    expect(r.nivel).toBe("limitado");
    expect(r.nivel).not.toBe("erro");
    expect(r.explicacao).toContain("Conta pessoal");
    expect(r.explicacao).toContain("não disponíveis");
  });

  /** Perfil, @ e link continuam valendo — a explicação precisa dizer isso. */
  it("pessoal ainda mostra o que funciona", () => {
    const r = v({ tipoConta: "PESSOAL", statusInsight: "INDISPONIVEL" });
    expect(r.titulo).toContain("@aikabodysoul");
    expect(r.explicacao.toLowerCase()).toContain("continuam funcionando");
  });

  /** Nem mesmo com statusInsight ERRO: pessoal nunca pediu insights. */
  it.each(["INDISPONIVEL", "ERRO", "NAO_TESTADO"] as StatusInsight[])(
    "pessoal com statusInsight %s continua limitado", (s) => {
      expect(v({ tipoConta: "PESSOAL", statusInsight: s }).nivel).toBe("limitado");
    });
});

describe("os dois eixos não se confundem", () => {
  /**
   * Business SEM insights ≠ pessoal sem insights. Aqui a conta PERMITE e a API
   * não entregou — quase sempre permissão faltando no token. Tratar como
   * "limitado por natureza" esconderia um problema que tem conserto.
   */
  it("Business sem métricas manda rodar o diagnóstico", () => {
    const r = v({ tipoConta: "BUSINESS", statusInsight: "INDISPONIVEL" });
    expect(r.nivel).toBe("limitado");
    expect(r.explicacao).toContain("diagnóstico");
    expect(r.explicacao).not.toContain("Conta pessoal");
  });

  it("Business com métricas é 'ok'", () => {
    const r = v();
    expect(r.nivel).toBe("ok");
    expect(r.titulo).toContain("com métricas");
  });

  it("Business com métricas falhando é ERRO — isso tem conserto", () => {
    expect(v({ statusInsight: "ERRO" }).nivel).toBe("erro");
  });

  it("Creator tem insights como Business", () => {
    expect(tipoPermiteInsights("CREATOR")).toBe(true);
    expect(v({ tipoConta: "CREATOR" }).nivel).toBe("ok");
  });

  it.each([["PESSOAL", false], ["DESCONHECIDO", false], ["BUSINESS", true], ["CREATOR", true]] as const)(
    "%s permite insights: %s", (t, esperado) => {
      expect(tipoPermiteInsights(t)).toBe(esperado);
    });
});

describe("estados que pedem AÇÃO, e não são erro", () => {
  it("sem Página é pendente, com o próximo passo", () => {
    const r = v({ estado: "SEM_PAGINA" });
    expect(r.nivel).toBe("pendente");
    expect(r.explicacao).toContain("Escolha a Página");
  });

  /** O estado que você pediu com nome próprio. */
  it("Página sem Instagram tem estado PRÓPRIO, não erro genérico", () => {
    const r = v({ estado: "PAGINA_SEM_INSTAGRAM" });
    expect(r.nivel).toBe("pendente");
    expect(r.titulo).toBe("Página conectada, Instagram não vinculado");
    expect(r.explicacao).toContain("Aiká");
    expect(r.nivel).not.toBe("erro");
  });

  it("tipo desconhecido é pendente — falta descobrir, não está quebrado", () => {
    const r = v({ tipoConta: "DESCONHECIDO" });
    expect(r.nivel).toBe("pendente");
    expect(r.explicacao).toContain("Teste a conexão");
  });

  it("métricas não testadas é pendente", () => {
    expect(v({ statusInsight: "NAO_TESTADO" }).nivel).toBe("pendente");
  });
});

describe("nenhum estado normal vira erro", () => {
  /** Varredura: só ERRO de API produz nível "erro". */
  it("erro só aparece quando a API falhou de verdade", () => {
    const tipos: TipoConta[] = ["BUSINESS", "CREATOR", "PESSOAL", "DESCONHECIDO"];
    const status: StatusInsight[] = ["DISPONIVEL", "INDISPONIVEL", "NAO_TESTADO", "ERRO"];
    for (const t of tipos) {
      for (const s of status) {
        const r = lerVinculo({ estado: "VINCULADO", tipoConta: t, statusInsight: s });
        if (r.nivel === "erro") {
          expect(`${t}/${s}`, "só Business/Creator com ERRO pode ser nível erro")
            .toMatch(/^(BUSINESS|CREATOR)\/ERRO$/);
        }
      }
    }
  });

  it("toda combinação produz título e explicação — nunca vazio", () => {
    for (const t of ["BUSINESS", "CREATOR", "PESSOAL", "DESCONHECIDO"] as TipoConta[]) {
      for (const s of ["DISPONIVEL", "INDISPONIVEL", "NAO_TESTADO", "ERRO"] as StatusInsight[]) {
        const r = lerVinculo({ estado: "VINCULADO", tipoConta: t, statusInsight: s });
        expect(r.titulo, `${t}/${s}`).toBeTruthy();
        expect(r.explicacao, `${t}/${s}`).toBeTruthy();
      }
    }
  });
});

describe("tipo derivado da resposta da Meta", () => {
  it.each([
    ["BUSINESS", "BUSINESS"],
    ["business", "BUSINESS"],
    ["CREATOR", "CREATOR"],
    ["MEDIA_CREATOR", "CREATOR"],
    ["PERSONAL", "PESSOAL"],
  ])("account_type %s → %s", (bruto, esperado) => {
    expect(tipoDaResposta({ account_type: bruto })).toBe(esperado);
  });

  /**
   * A Meta só cria `instagram_business_account` para conta profissional. Então
   * ausência de `account_type` num vínculo de Página NÃO significa pessoal —
   * significa que o campo não veio.
   */
  it("vinculado à Página sem account_type é profissional, não pessoal", () => {
    expect(tipoDaResposta({ vinculadoAPagina: true })).toBe("BUSINESS");
  });

  it("sem nada é DESCONHECIDO, não PESSOAL", () => {
    expect(tipoDaResposta({})).toBe("DESCONHECIDO");
    expect(tipoDaResposta({ account_type: null })).toBe("DESCONHECIDO");
  });
});

describe("rótulos", () => {
  it("todo tipo e todo status têm rótulo em português", () => {
    for (const t of ["BUSINESS", "CREATOR", "PESSOAL", "DESCONHECIDO"] as TipoConta[]) {
      expect(ROTULO_TIPO[t]).toBeTruthy();
    }
    for (const s of ["DISPONIVEL", "INDISPONIVEL", "NAO_TESTADO", "ERRO"] as StatusInsight[]) {
      expect(ROTULO_INSIGHT[s]).toBeTruthy();
    }
  });
});
