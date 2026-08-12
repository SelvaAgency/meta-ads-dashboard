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
  PERMISSOES_INSIGHTS, ROTULO_INSIGHT, ROTULO_TIPO, lerPermissoes, lerVinculo, selecaoPendente,
  tipoDaResposta, tipoPermiteInsights,
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
    expect(r.titulo).toBe("Conectado, dados limitados");
    expect(r.explicacao).toContain("@aikabodysoul");
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
    expect(r.titulo).toBe("Conectado com métricas");
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
    expect(r.titulo).toBe("Nenhuma Página vinculada");
    expect(r.explicacao).toContain("Escolha a Página");
    // O passo que faltava ser dito: escolher no seletor não salva.
    expect(r.explicacao).toContain("Vincular");
  });

  /** O estado que você pediu com nome próprio. */
  it("Página sem Instagram tem estado PRÓPRIO, não erro genérico", () => {
    const r = v({ estado: "PAGINA_SEM_INSTAGRAM" });
    expect(r.nivel).toBe("pendente");
    expect(r.titulo).toBe("Sem Instagram vinculado");
    expect(r.explicacao).toContain("Aiká");
    expect(r.nivel).not.toBe("erro");
  });

  it("tipo desconhecido é pendente — falta descobrir, não está quebrado", () => {
    const r = v({ tipoConta: "DESCONHECIDO" });
    expect(r.nivel).toBe("pendente");
    expect(r.explicacao).toContain("Testar");
  });

  /**
   * O estado que fez um painel de vínculos SALVOS ser investigado como falha de
   * persistência: "conectado" sem qualificação, num vínculo que nunca foi
   * testado. Salvo e testado são coisas diferentes, e o título tem que separá-las
   * — senão o próximo passo parece opcional.
   */
  it("vínculo salvo e não testado não se chama 'conectado'", () => {
    const r = v({ statusInsight: "NAO_TESTADO" });
    expect(r.nivel).toBe("pendente");
    expect(r.titulo).toBe("Instagram vinculado");
    expect(r.titulo.toLowerCase()).not.toContain("conectado");
    // E precisa dizer o que ESTÁ salvo, senão a dúvida continua.
    expect(r.explicacao).toContain("Aiká");
    expect(r.explicacao).toContain("@aikabodysoul");
    expect(r.explicacao).toContain("Testar");
  });

  /** "Conectado" só depois de a API ter respondido por esta conta. */
  it("só estados já testados usam a palavra 'conectado'", () => {
    for (const s of ["DISPONIVEL", "INDISPONIVEL", "ERRO"] as StatusInsight[]) {
      expect(v({ statusInsight: s }).titulo.toLowerCase(), s).toContain("conectado");
    }
    expect(v({ statusInsight: "NAO_TESTADO" }).titulo.toLowerCase()).not.toContain("conectado");
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

/**
 * Escolher no seletor não é vincular. Sem esta distinção a tela mostra a Página
 * escolhida como se fosse a salva, e o cliente aparece com um vínculo que o
 * banco não tem — a leitura fica boa justamente onde ela deveria alertar.
 */
describe("selecaoPendente", () => {
  it("escolheu algo diferente do salvo: pendente", () => {
    expect(selecaoPendente({ escolhido: "pg_2", salvo: "pg_1" })).toBe(true);
  });

  it("escolheu com nada salvo: pendente", () => {
    expect(selecaoPendente({ escolhido: "pg_1", salvo: null })).toBe(true);
    expect(selecaoPendente({ escolhido: "pg_1" })).toBe(true);
  });

  it("escolheu o que já está salvo: nada pendente", () => {
    expect(selecaoPendente({ escolhido: "pg_1", salvo: "pg_1" })).toBe(false);
  });

  it("não escolheu nada: nada pendente, mesmo sem vínculo", () => {
    expect(selecaoPendente({ escolhido: "", salvo: null })).toBe(false);
    expect(selecaoPendente({})).toBe(false);
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  (#10) tem três culpados, e mandar regerar o token acerta um em três
 * ─────────────────────────────────────────────────────────────────────────────
 *  A Meta responde "Application does not have permission for this action" tanto
 *  para escopo ausente quanto para escopo que não alcança o ativo quanto para
 *  App sem Acesso Avançado. O conselho antigo — "confira instagram_manage_insights"
 *  — mandava gerar token de novo nos três, e nos outros dois o token novo volta
 *  com o mesmo erro, porque nunca foi ele o problema.
 * ─────────────────────────────────────────────────────────────────────────────
 */
describe("de quem é a falta de permissão", () => {
  const TODOS = ["pages_show_list", "instagram_basic", "instagram_manage_insights", "pages_read_engagement"];
  const IG = "17841400000000000";
  const PG = "111222333";

  it("escopo ausente é culpa do TOKEN, e manda gerar de novo", () => {
    const r = lerPermissoes({ escopos: TODOS.filter((e) => e !== "instagram_manage_insights") });
    expect(r.culpado).toBe("token");
    expect(r.faltandoNoToken).toEqual(["instagram_manage_insights"]);
    expect(r.orientacao).toContain("gerado de novo");
  });

  /** O caso que o conselho antigo errava: o escopo ESTÁ lá. */
  it("escopo restrito a outros ativos é culpa do ATIVO, e gerar token não resolve", () => {
    const r = lerPermissoes({
      escopos: TODOS,
      granular: [{ scope: "instagram_manage_insights", target_ids: ["outro_ig"] }],
      instagramUserId: IG, pageId: PG,
    });
    expect(r.culpado).toBe("ativo");
    expect(r.faltandoNoToken).toEqual([]);
    expect(r.semAcessoAoAtivo).toEqual(["instagram_manage_insights"]);
    expect(r.orientacao).toContain("Gerar outro token não resolve");
    expect(r.orientacao).toContain("Business Manager");
  });

  it("ativo presente na lista não é restrição", () => {
    const r = lerPermissoes({
      escopos: TODOS,
      granular: [{ scope: "instagram_manage_insights", target_ids: [IG] }],
      instagramUserId: IG, pageId: PG,
    });
    expect(r.culpado).toBe("app");
    expect(r.semAcessoAoAtivo).toEqual([]);
  });

  /** `granular_scopes` sem target_ids significa "vale para todos". */
  it("escopo sem lista de ativos não é restrição", () => {
    const semLista = lerPermissoes({
      escopos: TODOS, granular: [{ scope: "instagram_manage_insights" }],
      instagramUserId: IG, pageId: PG,
    });
    const listaVazia = lerPermissoes({
      escopos: TODOS, granular: [{ scope: "instagram_manage_insights", target_ids: [] }],
      instagramUserId: IG, pageId: PG,
    });
    expect(semLista.culpado).toBe("app");
    expect(listaVazia.culpado).toBe("app");
  });

  it("tudo em ordem e a Meta ainda recusa: é o APP, não o token", () => {
    const r = lerPermissoes({ escopos: TODOS, instagramUserId: IG, pageId: PG });
    expect(r.culpado).toBe("app");
    expect(r.orientacao).toContain("Acesso Avançado");
    expect(r.orientacao).toContain("Regerar o token não muda nada");
  });

  /** Escopo de Página é conferido contra a PÁGINA, não contra o Instagram. */
  it("cada escopo é conferido contra o ativo que lhe corresponde", () => {
    const r = lerPermissoes({
      escopos: TODOS,
      granular: [
        { scope: "pages_read_engagement", target_ids: [PG] },
        { scope: "instagram_manage_insights", target_ids: [PG] },
      ],
      instagramUserId: IG, pageId: PG,
    });
    // pages_* alcança a Página; instagram_* foi restrito ao id da Página, que
    // não é o do Instagram — logo, não alcança o ativo certo.
    expect(r.semAcessoAoAtivo).toEqual(["instagram_manage_insights"]);
  });

  it("sem saber o ativo, não acusa restrição que não pode conferir", () => {
    const r = lerPermissoes({
      escopos: TODOS,
      granular: [{ scope: "instagram_manage_insights", target_ids: ["outro"] }],
    });
    expect(r.semAcessoAoAtivo).toEqual([]);
    expect(r.culpado).toBe("app");
  });

  it("toda permissão exigida diz para que serve", () => {
    for (const p of PERMISSOES_INSIGHTS) {
      expect(p.escopo, p.escopo).toBeTruthy();
      expect(p.para, p.escopo).toBeTruthy();
    }
    expect(PERMISSOES_INSIGHTS.map((p) => p.escopo)).toContain("instagram_manage_insights");
  });
});
