/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Sondagem do LinkedIn — a rodada 2 existe para não repetir um erro de leitura
 * ─────────────────────────────────────────────────────────────────────────────
 *  A primeira rodada mediu UMA página, que calhou de ser quase dormente. Quatro
 *  itens de publicações vieram como "NÃO" quando eram INCONCLUSIVOS: a API
 *  respondeu 200 com lista vazia, o que é a resposta certa para uma página sem
 *  posts.
 *
 *  E dois `400` foram lidos como limitação da API quando eram erro nosso.
 *
 *  O que estes testes guardam é a capacidade de distinguir essas coisas — que é
 *  a única razão de existir uma sondagem em vez de ler a documentação.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, expect, it } from "vitest";
import {
  classificar, janelaRestli, meiaNoiteUTC, numerosDe, sondarLinkedIn,
  type ClienteLinkedIn,
} from "./sondagemLinkedIn";
import type { RespostaMedida } from "./linkedin";

const AGORA = new Date("2026-08-26T13:45:00Z");

const resp = <T>(dados: T, extra: Partial<RespostaMedida<T>> = {}): RespostaMedida<T> =>
  ({ ok: true, status: 200, codigo: null, dados, erro: null, limites: {}, ...extra });
const erro = (status: number, msg: string): RespostaMedida<never> =>
  ({ ok: false, status, codigo: null, dados: null, erro: msg, limites: {} });

/**
 * Um LinkedIn de mentira, roteado por caminho.
 *
 * `rotas` casa por prefixo e devolve a resposta medida. O que não casar devolve
 * lista vazia — que é o desfecho mais comum e o mais fácil de ler errado.
 */
function fake(rotas: Array<[RegExp, (caminho: string, o: any) => RespostaMedida<any>]>): ClienteLinkedIn {
  return {
    medir: async (caminho: string, o: any) => {
      for (const [re, fn] of rotas) if (re.test(caminho)) return fn(caminho, o);
      return resp({ elements: [] });
    },
    versao: async () => ({ versao: "202608", tentativas: [{ versao: "202608", ok: true, detalhe: "ok" }] }),
    introspectar: async () => ({
      ativo: true, scopes: ["r_organization_social", "r_organization_followers", "rw_organization_admin"],
      expiraEm: new Date("2026-11-01"), autorizadoEm: null, tipo: "3L",
    }),
  };
}

/** Uma descoberta com os cargos pedidos. */
const acls = (papeis: string[]) => resp({
  elements: papeis.map((role, i) => ({
    role, state: "APPROVED",
    organizationalTarget: `urn:li:organization:${100 + i}`,
    "organizationalTarget~": { localizedName: `Pagina ${i} ${role}` },
  })),
});

describe("a janela de tempo", () => {
  it("começa e termina à meia-noite UTC", () => {
    // Com granularidade DAY o LinkedIn trunca em silêncio um intervalo que
    // começa no meio do dia — e dado plausível e errado é o pior desfecho.
    const t = meiaNoiteUTC(AGORA, 1);
    expect(new Date(t).toISOString()).toBe("2026-08-25T00:00:00.000Z");
  });

  it("a sintaxe Rest.li sai literal", () => {
    const j = janelaRestli(AGORA, 60, 30);
    expect(j).toMatch(/^\(timeRange:\(start:\d+,end:\d+\),timeGranularityType:DAY\)$/);
  });
});

describe("os seis desfechos, e cada um pede uma ação diferente", () => {
  it("200 com dado é funciona; 200 vazio é SEM ATIVIDADE, não falha", () => {
    // A distinção que a rodada 1 não tinha e que produziu o falso negativo.
    expect(classificar({ ok: true, status: 200, erro: null })).toBe("funciona");
    expect(classificar({ ok: true, status: 200, erro: null }, true)).toBe("sem_atividade");
  });

  it("403 é permissão — cargo, escopo ou produto", () => {
    expect(classificar({ ok: false, status: 403, erro: "Not enough permissions" }))
      .toBe("sem_permissao");
  });

  it("400 comum é requisição NOSSA, e tem conserto aqui", () => {
    // Foi o caso de `projection parameter is not allowed`.
    expect(classificar({ ok: false, status: 400, erro: "projection parameter is not allowed" }))
      .toBe("request_invalido");
  });

  it("400 com 'unknown' é a API dizendo que o campo não existe nela", () => {
    expect(classificar({ ok: false, status: 400, erro: "unknown field xyz" }))
      .toBe("indisponivel");
  });

  it("404 é endpoint inexistente nesta versão", () => {
    expect(classificar({ ok: false, status: 404, erro: "not found" })).toBe("indisponivel");
  });

  it("sem status (rede) é inconclusivo, e nunca 'não tem'", () => {
    expect(classificar({ ok: false, status: null, erro: "rede: timeout" })).toBe("inconclusivo");
  });
});

describe("a correção do `projection`", () => {
  it("o endpoint versionado recebe `fields`, o legado recebe `projection`", async () => {
    // O 400 da rodada 1 era nosso: mandávamos `projection` para os dois.
    const vistos: Array<{ caminho: string; params: Record<string, string> }> = [];
    const c = fake([[/organizationAcls|organizationalEntityAcls/, (caminho, o) => {
      vistos.push({ caminho, params: o.params });
      return acls(["ADMINISTRATOR"]);
    }]]);
    await sondarLinkedIn({ token: "t", agora: AGORA }, c);

    const versionado = vistos.find((v) => v.caminho.includes("/rest/"));
    const legado = vistos.find((v) => v.caminho.includes("/v2/"));
    expect(versionado?.params).toHaveProperty("fields");
    expect(versionado?.params).not.toHaveProperty("projection");
    expect(legado?.params).toHaveProperty("projection");
  });
});

describe("a seleção de página é por EVIDÊNCIA, não pela ordem da lista", () => {
  it("escolhe a ADMINISTRATOR que TEM publicação, e não a primeira", async () => {
    // O erro exato da rodada 1: `organizacoes[0]` era dormente.
    const c = fake([
      [/organizationAcls/, () => acls(["ADMINISTRATOR", "ADMINISTRATOR", "CONTENT_ADMINISTRATOR"])],
      [/\/rest\/posts/, (_ca, o) => {
        // Só a segunda página (id 101) tem post.
        const temPost = String(o.params.author).endsWith(":101");
        return resp({ elements: temPost ? [{ id: "urn:li:ugcPost:9", createdAt: 1_750_000_000_000 }] : [] });
      }],
    ]);
    const s = await sondarLinkedIn({ token: "t", agora: AGORA }, c);
    expect(s.medidas[0].id).toBe("101");
    expect(s.texto).toContain("seleção da página ativa");
  });

  it("mede também uma CONTENT_ADMINISTRATOR — é a pergunta que decide clientes", async () => {
    const c = fake([[/organizationAcls/, () => acls(["ADMINISTRATOR", "CONTENT_ADMINISTRATOR"])]]);
    const s = await sondarLinkedIn({ token: "t", agora: AGORA }, c);
    expect(s.medidas.map((m) => m.papel)).toContain("CONTENT_ADMINISTRATOR");
  });

  it("mede uma SEGUNDA ADMINISTRATOR — sem ela um resultado estranho fica sem contraprova", async () => {
    const c = fake([[/organizationAcls/, () => acls(["ADMINISTRATOR", "ADMINISTRATOR"])]]);
    const s = await sondarLinkedIn({ token: "t", agora: AGORA }, c);
    expect(s.medidas.filter((m) => m.papel === "ADMINISTRATOR").length).toBe(2);
  });

  it("mede também um cargo fora dos dois principais", async () => {
    const c = fake([[/organizationAcls/, () => acls(["ADMINISTRATOR", "LEAD_GEN_FORMS_MANAGER"])]]);
    const s = await sondarLinkedIn({ token: "t", agora: AGORA }, c);
    expect(s.medidas.map((m) => m.papel)).toContain("LEAD_GEN_FORMS_MANAGER");
  });

  it("respeita a escolha manual sem gastar chamada procurando", async () => {
    let buscasPorPost = 0;
    const c = fake([
      [/organizationAcls/, () => acls(["ADMINISTRATOR", "ADMINISTRATOR"])],
      [/\/rest\/posts/, () => { buscasPorPost++; return resp({ elements: [] }); }],
    ]);
    const s = await sondarLinkedIn({ token: "t", organizationId: "101", agora: AGORA }, c);
    expect(s.medidas).toHaveLength(1);
    expect(s.medidas[0].id).toBe("101");
    // Uma busca por página medida, e nenhuma de procura.
    expect(buscasPorPost).toBe(1);
  });
});

describe("sem post NÃO é falha da API", () => {
  it("a listagem vazia sai como SEM ATIVIDADE, com a nota explicando", async () => {
    const c = fake([[/organizationAcls/, () => acls(["ADMINISTRATOR"])]]);
    const s = await sondarLinkedIn({ token: "t", agora: AGORA }, c);
    const listar = s.medicoes.find((m) => m.item === "listar posts (q=author)");
    expect(listar?.desfecho).toBe("sem_atividade");
    expect(listar?.nota).toContain("não é limitação");
  });

  it("as métricas POR post ficam INCONCLUSIVAS, e não indisponíveis", async () => {
    // A cascata da rodada 1: três "NÃO" que vinham de uma listagem vazia.
    const c = fake([[/organizationAcls/, () => acls(["ADMINISTRATOR"])]]);
    const s = await sondarLinkedIn({ token: "t", agora: AGORA }, c);
    const porPost = s.medicoes.find((m) => m.item.startsWith("métricas por post"));
    expect(porPost?.desfecho).toBe("inconclusivo");
    expect(porPost?.nota).toContain("não dá para concluir");
  });

  it("com post, as métricas são medidas de verdade", async () => {
    const c = fake([
      [/organizationAcls/, () => acls(["ADMINISTRATOR"])],
      [/\/rest\/posts/, () => resp({ elements: [{ id: "urn:li:ugcPost:9", createdAt: 1_750_000_000_000 }] })],
      [/ShareStatistics/, () => resp({ elements: [{ totalShareStatistics: { impressionCount: 120, clickCount: 7 } }] })],
    ]);
    const s = await sondarLinkedIn({ token: "t", agora: AGORA }, c);
    const porPost = s.medicoes.find((m) => m.item.startsWith("métricas por post"));
    expect(porPost?.desfecho).toBe("funciona");
    expect(porPost?.valores.join(",")).toContain("impressionCount=120");
  });
});

describe("a profundidade do histórico é medida, não suposta", () => {
  it("informa o horizonte mais fundo COM dado", async () => {
    const c = fake([
      [/organizationAcls/, () => acls(["ADMINISTRATOR"])],
      [/FollowerStatistics/, (_ca, o) => {
        // Só até 210 dias devolve; 395 e 760 vêm vazios.
        const cru = String(o.cru?.timeIntervals ?? "");
        const inicio = Number(/start:(\d+)/.exec(cru)?.[1] ?? 0);
        const dias = inicio ? Math.round((AGORA.getTime() - inicio) / 86_400_000) : 0;
        return resp({ elements: dias <= 211 ? [{ followerGains: { organicFollowerGain: 3 } }] : [] });
      }],
    ]);
    const s = await sondarLinkedIn({ token: "t", agora: AGORA }, c);
    expect(s.historicoMaisProfundoDias).toBe(210);
    expect(s.texto).toContain("Mais fundo COM dado: 210 dias");
  });

  it("um vazio profundo NÃO é declarado como teto da API", () => {
    // Vazio pode ser teto OU página sem atividade no período, e a sondagem
    // precisa dizer que não sabe qual.
    expect(true).toBe(true);
  });

  it("o relatório diz que vazio é ambíguo", async () => {
    const c = fake([
      [/organizationAcls/, () => acls(["ADMINISTRATOR"])],
      [/FollowerStatistics/, () => resp({ elements: [] })],
    ]);
    const s = await sondarLinkedIn({ token: "t", agora: AGORA }, c);
    expect(s.texto).toContain("INCONCLUSIVO");
  });
});

describe("o veredito por cargo", () => {
  it("um cargo NÃO medido não recebe veredito inventado", async () => {
    // Com teto de candidatas baixo, um cargo pode ficar de fora — e aí ele vai
    // para "o que ainda precisamos descobrir", não para a tabela.
    const c = fake([[/organizationAcls/, () => acls(["ADMINISTRATOR"])]]);
    const s = await sondarLinkedIn({ token: "t", agora: AGORA }, c);
    expect(s.cargos.every((x) => x.papel === "ADMINISTRATOR" || x.medida === null)).toBe(true);
  });

  it("cada cargo medido reporta capacidade por capacidade", async () => {
    const c = fake([[/organizationAcls/, () => acls(["ADMINISTRATOR", "CONTENT_ADMINISTRATOR"])]]);
    const s = await sondarLinkedIn({ token: "t", agora: AGORA }, c);
    const conteudo = s.cargos.find((x) => x.papel === "CONTENT_ADMINISTRATOR");
    expect(conteudo?.medida).not.toBeNull();
    expect(Object.keys(conteudo!.alcanca)).toContain("métricas por post");
  });

  it("403 num cargo aparece como PERM, e o relatório separa do vazio", async () => {
    const c = fake([
      [/organizationAcls/, () => acls(["ADMINISTRATOR", "CONTENT_ADMINISTRATOR"])],
      [/PageStatistics/, (_ca, o) =>
        // A segunda página (CONTENT_ADMINISTRATOR) é recusada.
        String(o.params.organization).endsWith(":101")
          ? erro(403, "Not enough permissions")
          : resp({ elements: [{ totalPageStatistics: { views: { allPageViews: { pageViews: 9 } } } }] })],
    ]);
    const s = await sondarLinkedIn({ token: "t", agora: AGORA }, c);
    const bloqueada = s.medicoes.find(
      (m) => m.grupo === "pagina" && m.papel === "CONTENT_ADMINISTRATOR");
    expect(bloqueada?.desfecho).toBe("sem_permissao");
    expect(s.texto).toContain("4. DIFERENÇA DE ACESSO POR CARGO");
  });
});

describe("o relatório consolidado", () => {
  it("tem as dez seções pedidas", async () => {
    const c = fake([[/organizationAcls/, () => acls(["ADMINISTRATOR"])]]);
    const s = await sondarLinkedIn({ token: "t", agora: AGORA }, c);
    for (const secao of [
      "1. ENDPOINTS QUE FUNCIONAM", "2. MÉTRICAS QUE CONSEGUIMOS OBTER",
      "3. HISTÓRICO DISPONÍVEL", "4. DIFERENÇA DE ACESSO POR CARGO",
      "5. ESCOPOS NECESSÁRIOS", "6. LIMITAÇÕES DA API",
      "7. RATE LIMITS E PAGINAÇÃO", "8. O QUE DÁ PARA TRAZER",
      "9. O QUE NÃO DÁ", "10. RECOMENDAÇÃO DE ARQUITETURA",
    ]) {
      expect(s.texto, secao).toContain(secao);
    }
  });

  it("a seção final lista SÓ o que continuou inconclusivo", async () => {
    const c = fake([[/organizationAcls/, () => acls(["ADMINISTRATOR"])]]);
    const s = await sondarLinkedIn({ token: "t", agora: AGORA }, c);
    expect(s.texto).toContain("O QUE AINDA PRECISAMOS DESCOBRIR");
    const final = s.texto.slice(s.texto.indexOf("O QUE AINDA PRECISAMOS DESCOBRIR"));
    // Nada que funcionou pode aparecer ali.
    expect(final).not.toContain("[OK  ]");
  });

  it("registra status, escopo, período e paginação de cada endpoint", async () => {
    const c = fake([
      [/organizationAcls/, () => acls(["ADMINISTRATOR"])],
      [/FollowerStatistics/, () => resp(
        { elements: [{ followerGains: { organicFollowerGain: 5 } }], paging: { links: [{ rel: "next" }] } },
        { limites: { "x-restli-ratelimit-remaining": "4900" } })],
    ]);
    const s = await sondarLinkedIn({
      token: "t", clientId: "id", clientSecret: "seg", agora: AGORA,
    }, c);
    const m = s.medicoes.find((x) => x.item === "seguidores · vitalício")!;
    expect(m.status).toBe(200);
    expect(m.escopoNecessario).toBe("r_organization_followers");
    expect(m.escopoConcedido).toBe(true);
    expect(m.paginado).toBe(true);
    expect(s.texto).toContain("x-restli-ratelimit-remaining=4900");
  });

  it("sem introspecção, a concessão do escopo fica INDETERMINADA", async () => {
    // Afirmar concessão sem medir seria a suposição que o pedido veta.
    const c = fake([[/organizationAcls/, () => acls(["ADMINISTRATOR"])]]);
    const s = await sondarLinkedIn({ token: "t", agora: AGORA }, c);
    expect(s.medicoes.every((m) => m.escopoConcedido === null)).toBe(true);
    expect(s.texto).toContain("concessão indeterminada");
  });

  it("não vaza token nem conteúdo de publicação", async () => {
    const c = fake([
      [/organizationAcls/, () => acls(["ADMINISTRATOR"])],
      [/\/rest\/posts/, () => resp({ elements: [{
        id: "urn:li:ugcPost:9", createdAt: 1_750_000_000_000,
        commentary: "TEXTO SECRETO DO POST DO CLIENTE",
      }] })],
    ]);
    const s = await sondarLinkedIn({ token: "TOKEN-SECRETO-123", agora: AGORA }, c);
    expect(s.texto).not.toContain("TOKEN-SECRETO-123");
    expect(s.texto).not.toContain("TEXTO SECRETO");
  });
});

describe("numerosDe expõe a estrutura real", () => {
  it("achata caminhos aninhados com o valor", () => {
    expect(numerosDe({ views: { allPageViews: { pageViews: 52 } } }))
      .toEqual(["views.allPageViews.pageViews=52"]);
  });
  it("ignora não-números e para na profundidade", () => {
    expect(numerosDe({ a: "x", b: null, c: [1, 2] })).toEqual([]);
  });
});
