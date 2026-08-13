/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Uma sondagem que erra é pior que sondagem nenhuma
 * ─────────────────────────────────────────────────────────────────────────────
 *  Ela existe para decidir arquitetura e schema. Se ela mentir, a mentira vira
 *  tabela, cron e tela — e o erro só aparece meses depois, quando o dado que
 *  deveria existir não existe.
 *
 *  Os três enganos que este arquivo reprova são todos enganos de LEITURA da
 *  resposta, não de rede:
 *
 *   LISTA VAZIA    parâmetro aceito e `elements: []` NÃO é disponibilidade. Foi
 *                  exatamente o `online_followers` da Meta, que respondia `{}`
 *                  numa conta de 24 mil e teria entrado no modelo como métrica
 *
 *   403 IGUAL      escopo ausente e produto não aprovado devolvem o mesmo
 *                  status. Um se resolve reautorizando em minutos, o outro
 *                  depende de aprovação do LinkedIn — semanas pelo motivo errado
 *
 *   FALHA ≠ NÃO    uma janela que falhou por permissão não prova que não existe
 *                  retroatividade. Marcar isso como "não tem" copiaria o modelo
 *                  de snapshot do Instagram sem necessidade nenhuma
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, expect, it } from "vitest";
import {
  causaDe, janelaRestli, meiaNoiteUTC, sondarLinkedIn, type ClienteLinkedIn,
} from "./sondagemLinkedIn";
import { montarQuery, type ErroLinkedIn } from "./linkedin";

const AGORA = new Date("2026-08-13T14:00:00Z");

const erro = (msg: string, http: number | null, code: number | null = null): ErroLinkedIn => {
  const e = new Error(msg) as ErroLinkedIn;
  e.httpStatus = http;
  e.serviceErrorCode = code;
  return e;
};

/** Uma organização válida, como o `organizationAcls` a devolve. */
const ACL = {
  elements: [{
    role: "ADMINISTRATOR", state: "APPROVED",
    organizationalTarget: "urn:li:organization:5566",
    "organizationalTarget~": { id: 5566, localizedName: "SELVA Agency", vanityName: "selva" },
  }],
};

/**
 * Um LinkedIn de mentira, dirigido por rotas.
 *
 * A chave é um trecho do caminho; o valor é o que responder, ou um erro para
 * lançar. O que não estiver no mapa devolve lista vazia — o padrão pessimista,
 * porque um fake que responde bem a tudo aprova qualquer regra.
 */
function fake(rotas: Record<string, unknown>, opts: { scopes?: string[] } = {}): ClienteLinkedIn {
  return {
    versao: async () => ({ versao: "202608", tentativas: [{ versao: "202608", ok: true, detalhe: "aceita" }] }),
    introspectar: async () => ({
      ativo: true, scopes: opts.scopes ?? [], expiraEm: null, autorizadoEm: null, tipo: "3L",
    }),
    chamar: async <T,>(caminho: string, o: { cru?: Record<string, string> }) => {
      // A chave pode incluir a janela, para distinguir vitalício de retroativo.
      const janela = o.cru?.timeIntervals ?? "";
      for (const [chave, resposta] of Object.entries(rotas)) {
        const [rota, marca] = chave.split("#");
        if (!caminho.includes(rota)) continue;
        if (marca && !janela.includes(marca)) continue;
        if (!marca && janela && Object.keys(rotas).some((k) => k.startsWith(`${rota}#`))) continue;
        if (resposta instanceof Error) throw resposta;
        return resposta as T;
      }
      return { elements: [] } as T;
    },
  };
}

describe("a query preserva a sintaxe do Rest.li", () => {
  /**
   * Percent-encodar os parênteses devolve 400 — e um 400 de codificação é
   * indistinguível, no relatório, de "esta métrica não existe".
   */
  it("valores crus saem literais, valores comuns saem encodados", () => {
    const q = montarQuery(
      { organizationalEntity: "urn:li:organization:1" },
      { timeIntervals: "(timeRange:(start:1,end:2),timeGranularityType:DAY)" },
    );
    expect(q).toContain("timeIntervals=(timeRange:(start:1,end:2),timeGranularityType:DAY)");
    expect(q).toContain("organizationalEntity=urn%3Ali%3Aorganization%3A1");
  });
});

describe("a janela de tempo", () => {
  /** Granularidade DAY com início no meio do dia é truncada em silêncio. */
  it("começa e termina à meia-noite UTC", () => {
    const ms = meiaNoiteUTC(AGORA, 0);
    expect(new Date(ms).toISOString()).toBe("2026-08-13T00:00:00.000Z");
  });

  it("a janela antiga cobre de 60 a 30 dias atrás", () => {
    const j = janelaRestli(AGORA, 60, 30);
    const [, start, end] = /start:(\d+),end:(\d+)/.exec(j)!;
    expect(new Date(Number(start)).toISOString().slice(0, 10)).toBe("2026-06-14");
    expect(new Date(Number(end)).toISOString().slice(0, 10)).toBe("2026-07-14");
  });
});

describe("cada falha aponta para um conserto diferente", () => {
  it("401 é token, e manda gerar outro", () => {
    expect(causaDe(erro("LinkedIn (401): expired", 401))).toBe("token");
  });

  /**
   * O par que mais confunde: os dois são 403. Reautorizar um app que nunca teve
   * o produto é o conserto que não conserta.
   */
  it("403 comum é escopo; 403 com 'not enough permissions' é produto", () => {
    expect(causaDe(erro("LinkedIn (403/100): unpermitted scope", 403))).toBe("escopo");
    expect(causaDe(erro("LinkedIn (403/100): Not enough permissions to access this resource", 403))).toBe("produto");
  });

  it("404 é alcance — falta cargo na Página, e não aprovação", () => {
    expect(causaDe(erro("LinkedIn (404): not found", 404))).toBe("alcance");
  });
});

describe("lista vazia não é disponibilidade", () => {
  /**
   * O engano que a Meta já pregou: `online_followers` respondia `{}` numa conta
   * de 24 mil seguidores. Entrou como "responde" na primeira leitura, e só a
   * segunda sondagem mostrou que nunca teve dado.
   */
  it("elements vazio conta como INDISPONÍVEL, e diz que o parâmetro foi aceito", async () => {
    const r = await sondarLinkedIn(
      { token: "t", agora: AGORA },
      fake({ organizationAcls: ACL, organizationalEntityFollowerStatistics: { elements: [] } }),
    );
    const linha = r.linhas.find((l) => l.item === "estatísticas vitalícias")!;
    expect(linha.disponivel).toBe(false);
    expect(linha.detalhe).toContain("VAZIA");
    expect(linha.detalhe).toContain("parâmetro aceito");
  });
});

describe("a retroatividade decide a arquitetura", () => {
  /**
   * SIM muda tudo: dá para buscar o passado de uma vez, e o cron vira
   * conveniência. É o oposto do Instagram, onde o snapshot é o único registro.
   */
  it("janela antiga com dado prova retroatividade", async () => {
    const r = await sondarLinkedIn({ token: "t", agora: AGORA }, fake({
      organizationAcls: ACL,
      organizationalEntityFollowerStatistics: {
        elements: [{ followerGains: { organicFollowerGain: 12, paidFollowerGain: 3 } }],
      },
    }));
    expect(r.retroatividade).toBe(true);
    expect(r.texto).toContain("O histórico é buscável");
  });

  it("janela antiga vazia prova o modelo de snapshot do Instagram", async () => {
    const r = await sondarLinkedIn({ token: "t", agora: AGORA }, fake({
      organizationAcls: ACL,
      "organizationalEntityFollowerStatistics#timeGranularityType": { elements: [] },
      organizationalEntityFollowerStatistics: { elements: [{ followerGains: { organicFollowerGain: 12 } }] },
    }));
    expect(r.retroatividade).toBe(false);
    expect(r.texto).toContain("snapshot diário obrigatório");
  });

  /**
   * A distinção que salva de copiar o modelo errado: a janela FALHOU, e falha
   * de permissão não diz nada sobre retroatividade.
   */
  it("janela que falhou por permissão fica INDETERMINADA, e não 'não tem'", async () => {
    const r = await sondarLinkedIn({ token: "t", agora: AGORA }, fake({
      organizationAcls: ACL,
      organizationalEntityFollowerStatistics: erro("LinkedIn (403/100): Not enough permissions", 403),
    }));
    expect(r.retroatividade).toBeNull();
    expect(r.texto).toContain("INDETERMINADO");
    expect(r.texto).toContain("não diz nada sobre retroatividade");
  });
});

describe("sem organização, nada foi medido — e isso não é 'métrica indisponível'", () => {
  it("diz o bloqueio uma vez, e não repete em vinte linhas", async () => {
    const r = await sondarLinkedIn({ token: "t", agora: AGORA }, fake({}));
    expect(r.organizacoes).toEqual([]);
    expect(r.texto).toContain("BLOQUEADO na descoberta");
    // Uma linha por grupo, e não uma por métrica.
    expect(r.linhas.filter((l) => l.item === "(todas)")).toHaveLength(3);
  });
});

describe("o veredito agrupa pelo que RESOLVE", () => {
  /**
   * Trinta linhas de erro não dizem por onde começar. Agrupar por conserto diz —
   * e mostra quando dez falhas têm uma causa só.
   */
  it("falhas de produto e de escopo aparecem separadas, com a correção", async () => {
    const r = await sondarLinkedIn({ token: "t", agora: AGORA }, fake({
      organizationAcls: ACL,
      organizationalEntityFollowerStatistics: erro("LinkedIn (403/100): Not enough permissions", 403),
      organizationPageStatistics: erro("LinkedIn (403/100): unpermitted scope r_organization_admin", 403),
    }));
    expect(r.texto).toContain("O que falhou, agrupado pelo que RESOLVE");
    expect(r.texto).toContain("produto não aprovado no app");
    expect(r.texto).toContain("escopo ausente");
  });
});

describe("o relatório não vaza", () => {
  it("nenhum token e nenhum conteúdo de publicação", async () => {
    const r = await sondarLinkedIn({ token: "TOKEN-SECRETO-1234567890abcdef", agora: AGORA }, fake({
      organizationAcls: ACL,
      "/rest/posts": {
        elements: [{
          id: "urn:li:share:99", createdAt: 1_750_000_000_000,
          commentary: "texto confidencial do cliente que não pode aparecer",
        }],
      },
    }));
    expect(r.texto).not.toContain("TOKEN-SECRETO");
    expect(r.texto).not.toContain("confidencial");
  });
});

describe("a introspecção é medição, e a ausência dela não é falha", () => {
  it("sem client_id, o item não conta como indisponível", async () => {
    const r = await sondarLinkedIn({ token: "t", agora: AGORA }, fake({ organizationAcls: ACL }));
    const linha = r.linhas.find((l) => l.item === "introspecção do token")!;
    expect(linha.disponivel).toBe(true);
    expect(linha.detalhe).toContain("não solicitada");
  });

  it("com client_id, os escopos vêm medidos e entram no cabeçalho", async () => {
    const r = await sondarLinkedIn(
      { token: "t", clientId: "id", clientSecret: "s", agora: AGORA },
      fake({ organizationAcls: ACL }, { scopes: ["r_organization_social", "rw_organization_admin"] }),
    );
    expect(r.scopes).toEqual(["r_organization_social", "rw_organization_admin"]);
    expect(r.texto).toContain("escopos medidos: r_organization_social, rw_organization_admin");
  });
});
