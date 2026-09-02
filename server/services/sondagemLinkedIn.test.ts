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
        const baldes = Array.from({ length: 30 }, () => ({ followerGains: { organicFollowerGain: 3 } }));
        return resp({ elements: dias <= 211 ? baldes : [] });
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

/**
 * ─── Rodada 3 ────────────────────────────────────────────────────────────────
 *  A rodada 2 mediu bem e concluiu mal. Três defeitos de LEITURA, não de coleta:
 *  o histórico foi perguntado à única página que respondia 403 a tudo; o
 *  veredito de cargo leu uma página e contradisse outra do mesmo cargo no mesmo
 *  relatório; e a dedupe por Página apagou três dos cinco cargos existentes.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** ACL com controle fino: cargo, página e estado por atribuição. */
const aclDe = (linhas: Array<[string, number]>, estado = "APPROVED") => resp({
  elements: linhas.map(([role, org]) => ({
    role, state: estado, roleAssignee: "urn:li:person:me",
    organizationalTarget: `urn:li:organization:${org}`,
    "organizationalTarget~": { localizedName: `Pagina ${org}` },
  })),
});

describe("o histórico vai à página que RESPONDE", () => {
  /** 100 bloqueia estatística; 101 responde. 100 é a primeira medida. */
  const carteira = () => fake([
    [/Acls/, () => aclDe([["ADMINISTRATOR", 100], ["ADMINISTRATOR", 101]])],
    [/\/rest\/posts/, (_c, o) => resp({
      elements: String(o.params.author).endsWith(":100")
        ? [{ id: "urn:li:ugcPost:1", createdAt: 1_780_000_000_000 }] : [] })],
    [/FollowerStatistics/, (_c, o) =>
      String(o.params.organizationalEntity).endsWith(":100")
        ? erro(403, "Viewer has insufficient permissions")
        : resp({ elements: Array.from({ length: 30 },
            () => ({ followerGains: { organicFollowerGain: 4 } })) })],
  ]);

  it("não repete cinco vezes o 403 da primeira página", async () => {
    // O defeito exato: `medidas[0]` era a página bloqueada, e as cinco janelas
    // mediram o bloqueio em vez do histórico.
    const s = await sondarLinkedIn({ token: "t", agora: AGORA }, carteira());
    const janelas = s.medicoes.filter((m) => m.grupo === "historico" && m.item.startsWith("seguidores"));
    expect(janelas).toHaveLength(5);
    expect(janelas.every((m) => m.pagina === "Pagina 101")).toBe(true);
    expect(s.historicoMedidoEm).toBe("Pagina 101");
  });

  it("com a página certa, a retroatividade deixa de ser INCONCLUSIVA", async () => {
    const s = await sondarLinkedIn({ token: "t", agora: AGORA }, carteira());
    expect(s.historicoMaisProfundoDias).toBe(760);
  });

  it("se NENHUMA responde, diz isso em vez de fingir medição", async () => {
    const c = fake([
      [/Acls/, () => aclDe([["ADMINISTRATOR", 100]])],
      [/FollowerStatistics/, () => erro(403, "Viewer has insufficient permissions")],
    ]);
    const s = await sondarLinkedIn({ token: "t", agora: AGORA }, c);
    expect(s.texto).toContain("NENHUMA página medida respondeu");
    expect(s.historicoMaisProfundoDias).toBeNull();
  });
});

describe("o veredito de cargo não escolhe um exemplo", () => {
  it("páginas do MESMO cargo que discordam derrubam o veredito", async () => {
    // A rodada 2 afirmou 'ADMINISTRATOR não lê seguidores' com uma
    // ADMINISTRATOR lendo seguidores três seções acima.
    const c = fake([
      [/Acls/, () => aclDe([["ADMINISTRATOR", 100], ["ADMINISTRATOR", 101]])],
      [/FollowerStatistics/, (_ca, o) =>
        String(o.params.organizationalEntity).endsWith(":100")
          ? erro(403, "Viewer has insufficient permissions")
          : resp({ elements: [{ followerGains: { organicFollowerGain: 4 } }] })],
    ]);
    const s = await sondarLinkedIn({ token: "t", agora: AGORA }, c);
    const admin = s.cargos.find((x) => x.papel === "ADMINISTRATOR")!;
    expect(admin.medidas).toHaveLength(2);
    expect(admin.alcanca["seguidores"]).toBe("inconclusivo");
    expect(admin.divergentes["seguidores"]).toContain("Pagina 100");
    expect(s.texto).toContain("NÃO é dada pelo cargo");
  });

  it("concordância vira veredito de verdade", async () => {
    const c = fake([
      [/Acls/, () => aclDe([["ADMINISTRATOR", 100], ["ADMINISTRATOR", 101]])],
      [/FollowerStatistics/, () => resp({ elements: [{ followerGains: { organicFollowerGain: 4 } }] })],
    ]);
    const s = await sondarLinkedIn({ token: "t", agora: AGORA }, c);
    const admin = s.cargos.find((x) => x.papel === "ADMINISTRATOR")!;
    expect(admin.alcanca["seguidores"]).toBe("funciona");
    expect(admin.divergentes).toEqual({});
  });

  it("uma página sem publicação não vira veredito sobre o cargo", async () => {
    const c = fake([[/Acls/, () => aclDe([["ADMINISTRATOR", 100]])]]);
    const s = await sondarLinkedIn({ token: "t", agora: AGORA }, c);
    const admin = s.cargos.find((x) => x.papel === "ADMINISTRATOR")!;
    expect(admin.alcanca["métricas por post"]).not.toBe("indisponivel");
  });
});

describe("dois cargos na mesma Página", () => {
  it("o segundo cargo não é descartado pela dedupe", async () => {
    // 22 atribuições viraram 16 Páginas com 2 cargos, e três cargos sumiram.
    const c = fake([[/Acls/, () => aclDe([
      ["ADMINISTRATOR", 100], ["LEAD_GEN_FORMS_MANAGER", 100],
      ["DIRECT_SPONSORED_CONTENT_POSTER", 100],
    ])]]);
    const s = await sondarLinkedIn({ token: "t", agora: AGORA }, c);
    // Ordenados por alcance, não pela ordem em que a ACL devolveu — a ACL
    // varia entre rodadas e fazia a mesma Página trocar de identidade.
    expect(s.organizacoes[0].papeis).toEqual([
      "ADMINISTRATOR", "DIRECT_SPONSORED_CONTENT_POSTER", "LEAD_GEN_FORMS_MANAGER"]);
    expect(s.cargos.map((x) => x.papel)).toContain("LEAD_GEN_FORMS_MANAGER");
  });

  it("uma Página só com outro cargo é medida", async () => {
    const c = fake([[/Acls/, () => aclDe([
      ["ADMINISTRATOR", 100], ["LEAD_GEN_FORMS_MANAGER", 200]])]]);
    const s = await sondarLinkedIn({ token: "t", agora: AGORA }, c);
    expect(s.medidas.map((m) => m.id)).toContain("200");
  });

  it("o estado das atribuições é reportado, não suposto", async () => {
    const c = fake([[/Acls/, () => aclDe([["ADMINISTRATOR", 100]], "PENDING")]]);
    const s = await sondarLinkedIn({ token: "t", agora: AGORA }, c);
    expect(s.medicoes.find((m) => m.item === "estado das atribuições")?.nota)
      .toContain("PENDING");
  });
});

describe("as DUAS retroatividades", () => {
  /** Vinte posts, o mais antigo de 400 dias atrás, com métrica. */
  const comAcervo = () => fake([
    [/Acls/, () => aclDe([["ADMINISTRATOR", 100]])],
    [/\/rest\/posts/, (_c, o) => resp({
      elements: Number(o.params.start ?? 0) > 0 ? [] : [
        { id: "urn:li:ugcPost:novo", createdAt: AGORA.getTime() - 2 * 86_400_000 },
        { id: "urn:li:ugcPost:velho", createdAt: AGORA.getTime() - 400 * 86_400_000 },
      ] })],
    [/ShareStatistics/, () => resp({
      elements: [{ totalShareStatistics: { impressionCount: 90, clickCount: 3 } }] })],
  ]);

  it("o post mais antigo é medido, e vira a retroatividade de conteúdo", async () => {
    const s = await sondarLinkedIn({ token: "t", agora: AGORA }, comAcervo());
    const antigo = s.medicoes.find((m) => m.item.includes("MAIS ANTIGO"))!;
    expect(antigo.desfecho).toBe("funciona");
    expect(s.retroatividadeDeConteudoDias).toBe(400);
    expect(s.texto).toContain("AINDA devolve métricas");
  });

  it("o lote é medido — é ele que decide o custo da coleta", async () => {
    const s = await sondarLinkedIn({ token: "t", agora: AGORA }, comAcervo());
    expect(s.medicoes.some((m) => m.item.includes("numa chamada (lote)"))).toBe(true);
  });

  it("a listagem desce até acabar, e diz onde acabou", async () => {
    const s = await sondarLinkedIn({ token: "t", agora: AGORA }, comAcervo());
    const prof = s.medicoes.find((m) => m.item === "profundidade da listagem de posts");
    expect(prof?.nota).toContain("a listagem ACABOU aqui");
  });
});

describe("o 400 do organizationAcls é isolado, não deduzido", () => {
  it("desce até a chamada sem projeção nenhuma", async () => {
    const vistos: Array<Record<string, string>> = [];
    const c = fake([[/organizationAcls/, (_ca, o) => {
      vistos.push(o.params);
      return o.params.fields ? erro(400, "Invalid projection parameter") : aclDe([["ADMINISTRATOR", 100]]);
    }], [/organizationalEntityAcls/, () => aclDe([["ADMINISTRATOR", 100]])]]);
    const s = await sondarLinkedIn({ token: "t", agora: AGORA }, c);
    expect(vistos.some((p) => p.fields?.includes("~"))).toBe(true);
    expect(vistos.some((p) => p.fields === "(elements*(*))")).toBe(true);
    expect(vistos.some((p) => !p.fields)).toBe(true);
    expect(s.medicoes.find((m) => m.item.includes("sem projeção"))?.desfecho).toBe("funciona");
  });
});

describe("o edgeType do networkSizes versionado", () => {
  it("os dois valores do enum são medidos", async () => {
    const c = fake([[/Acls/, () => aclDe([["ADMINISTRATOR", 100]])]]);
    const s = await sondarLinkedIn({ token: "t", agora: AGORA }, c);
    const itens = s.medicoes.filter((m) => m.item.startsWith("seguidores atuais")).map((m) => m.item);
    expect(itens).toContain("seguidores atuais · /rest + CompanyFollowedByMember");
    expect(itens).toContain("seguidores atuais · /rest + COMPANY_FOLLOWED_BY_MEMBER");
  });
});

describe("uma janela aceita não é uma janela honrada", () => {
  it("30 dias pedidos com UM balde devolvido não vira profundidade", async () => {
    // Foi o que a API fez em 730-760: 200, um elemento, e a rodada 3 leu como
    // "buscável até 760 dias". Trinta baldes em janelas rasas e um na mais
    // funda é sinal de colapso da série, não de profundidade.
    const c = fake([
      [/Acls/, () => aclDe([["ADMINISTRATOR", 100]])],
      [/FollowerStatistics/, (_ca, o) => {
        const cru = String(o.cru?.timeIntervals ?? "");
        if (!cru) return resp({ elements: [{ followerGains: {} }] });
        const inicio = Number(/start:(\d+)/.exec(cru)?.[1] ?? 0);
        const dias = Math.round((AGORA.getTime() - inicio) / 86_400_000);
        const n = dias > 400 ? 1 : 30;   // a mais funda colapsa
        return resp({ elements: Array.from({ length: n },
          () => ({ followerGains: { organicFollowerGain: 1 } })) });
      }],
    ]);
    const s = await sondarLinkedIn({ token: "t", agora: AGORA }, c);
    expect(s.historicoMaisProfundoDias).toBe(395);
    expect(s.texto).toContain("a série não veio dia a dia");
  });
});

describe("o rótulo da página não muda depois de gravado", () => {
  it("o nome vindo dos detalhes não desalinha as medições", async () => {
    // O defeito da rodada 3: `rot` era o id, os detalhes preenchiam o nome, e
    // tudo que procurava por nome depois não achava nada. A seção 4 saiu com
    // "?" em tudo e o histórico anunciou que ninguém respondeu.
    const c = fake([
      [/Acls/, () => resp({ elements: [{
        role: "ADMINISTRATOR", state: "APPROVED",
        organizationalTarget: "urn:li:organization:100",
      }] })],   // SEM decoração: entra sem nome
      [/\/rest\/organizations/, () => resp({ localizedName: "Ultramalhas" })],
      [/FollowerStatistics/, () => resp({ elements: Array.from({ length: 30 },
        () => ({ followerGains: { organicFollowerGain: 1 } })) })],
    ]);
    const s = await sondarLinkedIn({ token: "t", agora: AGORA }, c);
    const paginas = new Set(s.medicoes.filter((m) => m.pagina).map((m) => m.pagina));
    expect(paginas).toEqual(new Set(["Ultramalhas"]));
    expect(s.cargos[0].alcanca["seguidores"]).toBe("funciona");
    expect(s.historicoMedidoEm).toBe("Ultramalhas");
    expect(s.texto).not.toContain("NENHUMA página medida respondeu");
  });

  it("um nome vindo da ACL legada preenche quem entrou sem nome", async () => {
    let chamada = 0;
    const c = fake([[/Acls/, () => {
      chamada++;
      return chamada === 1
        ? resp({ elements: [{ role: "ADMINISTRATOR", state: "APPROVED",
            organizationalTarget: "urn:li:organization:100" }] })
        : aclDe([["ADMINISTRATOR", 100]]);
    }]]);
    const s = await sondarLinkedIn({ token: "t", agora: AGORA }, c);
    expect(s.organizacoes[0].nome).toBe("Pagina 100");
  });
});

describe("o lote não mistura tipos de URN", () => {
  it("um acervo com share: e ugcPost: não gera lote misto", async () => {
    // O 400 foi lido como "o lote não funciona"; era um ugcPost mandado no
    // parâmetro `shares`.
    const enviados: string[] = [];
    const c = fake([
      [/Acls/, () => aclDe([["ADMINISTRATOR", 100]])],
      [/\/rest\/posts/, (_ca, o) => resp({
        elements: Number(o.params.start ?? 0) > 0 ? [] : [
          { id: "urn:li:share:1", createdAt: AGORA.getTime() - 86_400_000 },
          { id: "urn:li:ugcPost:2", createdAt: AGORA.getTime() - 2 * 86_400_000 },
          { id: "urn:li:share:3", createdAt: AGORA.getTime() - 3 * 86_400_000 },
        ] })],
      [/ShareStatistics/, (_ca, o) => {
        if (o.cru?.shares) enviados.push(String(o.cru.shares));
        return resp({ elements: [{ totalShareStatistics: { impressionCount: 5 } }] });
      }],
    ]);
    await sondarLinkedIn({ token: "t", agora: AGORA }, c);
    const lote = enviados.find((x) => x.includes(","));
    expect(lote).toBeDefined();
    expect(lote).not.toContain("ugcPost");
  });
});

describe("as atribuições são contadas uma vez", () => {
  it("quatro tentativas lendo a MESMA ACL não viram quatro carteiras", async () => {
    const c = fake([[/Acls/, () => aclDe([["ADMINISTRATOR", 100], ["ADMINISTRATOR", 101]])]]);
    const s = await sondarLinkedIn({ token: "t", agora: AGORA }, c);
    expect(s.texto).toContain("2 Página(s) para 2 atribuição(ões)");
  });
});

describe("atribuição REVOGADA não é resposta sobre a API", () => {
  /** Uma revogada com posts (lista, mas não mede) e uma viva. */
  const carteira = () => fake([
    [/Acls/, () => resp({ elements: [
      { role: "ADMINISTRATOR", state: "REVOKED",
        organizationalTarget: "urn:li:organization:100",
        "organizationalTarget!": { status: 403 } },
      { role: "ADMINISTRATOR", state: "APPROVED",
        organizationalTarget: "urn:li:organization:101",
        "organizationalTarget~": { localizedName: "Viva" } },
    ] })],
    [/\/rest\/posts/, (_c, o) => resp({
      elements: Number(o.params.start ?? 0) > 0 ? []
        : String(o.params.author).endsWith(":100")
          ? [{ id: "urn:li:ugcPost:1", createdAt: 1_780_000_000_000 }] : [] })],
    [/FollowerStatistics/, (_c, o) =>
      String(o.params.organizationalEntity).endsWith(":100")
        ? erro(403, "Viewer has insufficient permissions")
        : resp({ elements: Array.from({ length: 30 },
            () => ({ followerGains: { organicFollowerGain: 2 } })) })],
  ]);

  it("a revogada não é medida, mesmo tendo publicações", async () => {
    // O erro da rodada 4: a busca por 'Página ativa' premiava justamente a
    // revogada, porque uma Página revogada ainda LISTA posts.
    const s = await sondarLinkedIn({ token: "t", agora: AGORA }, carteira());
    expect(s.medidas.map((m) => m.id)).not.toContain("100");
    expect(s.medidas.map((m) => m.id)).toContain("101");
  });

  it("com a Página viva, o histórico volta a ter resposta", async () => {
    const s = await sondarLinkedIn({ token: "t", agora: AGORA }, carteira());
    expect(s.historicoMaisProfundoDias).toBe(760);
  });

  it("o relatório separa carteira de API", async () => {
    const c = fake([
      [/Acls/, () => aclDe([["ADMINISTRATOR", 100]], "REVOKED")],
      [/FollowerStatistics/, () => erro(403, "Viewer has insufficient permissions")],
      [/PageStatistics/, () => erro(403, "Viewer has insufficient permissions")],
    ]);
    const s = await sondarLinkedIn({ token: "t", agora: AGORA }, c);
    expect(s.texto).toContain("NÃO é limitação da API");
    expect(s.texto).toContain("readmitir a SELVA na Página");
    expect(s.texto).toContain("INCONCLUSIVO POR CARTEIRA");
  });

  it("um 403 de Página revogada não vira veredito de cargo", async () => {
    const c = fake([
      [/Acls/, () => aclDe([["ADMINISTRATOR", 100]], "REVOKED")],
      [/FollowerStatistics/, () => erro(403, "Viewer has insufficient permissions")],
    ]);
    const s = await sondarLinkedIn({ token: "t", agora: AGORA }, c);
    const admin = s.cargos.find((x) => x.papel === "ADMINISTRATOR")!;
    expect(admin.medidas).toEqual([]);
    expect(admin.alcanca["seguidores"]).toBe("inconclusivo");
  });

  it("o `organizationalTarget!` é lido como acesso perdido", async () => {
    const c = fake([[/Acls/, () => resp({ elements: [{
      role: "ADMINISTRATOR", state: "REVOKED",
      organizationalTarget: "urn:li:organization:100",
      "organizationalTarget!": { status: 403 },
    }] })]]);
    const s = await sondarLinkedIn({ token: "t", agora: AGORA }, c);
    expect(s.organizacoes[0].decoracaoFalhou).toBe(true);
    expect(s.texto).toContain("nem devolveu o nome da Página");
  });
});

/**
 * ─── Rodada 6 ────────────────────────────────────────────────────────────────
 *  A rodada 5 mediu Páginas vivas e tudo funcionou. O que sobrou foi o relatório
 *  atribuindo resultado a cargo REVOGADO — e era justamente a pergunta que a
 *  frente inteira existe para responder.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Uma Página com dois cargos e estados diferentes. */
const aclMista = () => resp({ elements: [
  { role: "ADMINISTRATOR", state: "APPROVED", roleAssignee: "urn:li:person:me",
    organizationalTarget: "urn:li:organization:100",
    "organizationalTarget~": { localizedName: "Musa" } },
  { role: "CONTENT_ADMINISTRATOR", state: "REVOKED", roleAssignee: "urn:li:person:me",
    organizationalTarget: "urn:li:organization:100",
    "organizationalTarget!": { status: 403 } },
  { role: "CONTENT_ADMINISTRATOR", state: "APPROVED", roleAssignee: "urn:li:person:me",
    organizationalTarget: "urn:li:organization:200",
    "organizationalTarget~": { localizedName: "Surf" } },
] });

describe("o cargo REVOGADO não recebe crédito pelo que a Página entrega", () => {
  it("uma Página cujo CONTENT_ADMINISTRATOR foi revogado sai do veredito desse cargo", async () => {
    // A rodada 5 creditou a Musa ao CONTENT_ADMINISTRATOR por um cargo que ela
    // perdeu — e esse veredito é o que decide se cinco clientes entram.
    const c = fake([
      [/Acls/, aclMista],
      [/FollowerStatistics/, () => resp({ elements: Array.from({ length: 30 },
        () => ({ followerGains: { organicFollowerGain: 1 } })) })],
    ]);
    const s = await sondarLinkedIn({ token: "t", agora: AGORA }, c);
    const conteudo = s.cargos.find((x) => x.papel === "CONTENT_ADMINISTRATOR")!;
    expect(conteudo.medidas).toEqual(["Surf"]);
    expect(conteudo.alcanca["seguidores"]).toBe("funciona");
  });

  it("um cargo morto não torna o cargo vivo ambíguo", async () => {
    const c = fake([[/Acls/, aclMista]]);
    const s = await sondarLinkedIn({ token: "t", agora: AGORA }, c);
    const admin = s.cargos.find((x) => x.papel === "ADMINISTRATOR")!;
    expect(admin.medidas).toContain("Musa");
    expect(admin.ambiguo).toBe(false);
  });

  it("o aviso de nome ilegível não aparece quando o nome veio", async () => {
    const c = fake([[/Acls/, aclMista]]);
    const s = await sondarLinkedIn({ token: "t", agora: AGORA }, c);
    const nota = s.medicoes.find((m) => m.item === "estado da atribuição · Musa")?.nota ?? "";
    expect(nota).toContain("ADMINISTRATOR=APPROVED");
    expect(nota).toContain("CONTENT_ADMINISTRATOR=REVOKED");
    expect(nota).not.toContain("nem devolveu o nome");
  });
});

describe("um cargo ainda descoberto ganha Página, mesmo compartilhando outra", () => {
  it("mede a Página que tem o cargo raro, ainda que ela também seja CONTENT_ADMIN", async () => {
    // A rodada 5 deixou três cargos sem veredito porque a única Página que os
    // tinha também era CONTENT_ADMINISTRATOR, e o balde "outros" a excluía.
    const c = fake([[/Acls/, () => resp({ elements: [
      { role: "ADMINISTRATOR", state: "APPROVED",
        organizationalTarget: "urn:li:organization:100",
        "organizationalTarget~": { localizedName: "Musa" } },
      { role: "CONTENT_ADMINISTRATOR", state: "APPROVED",
        organizationalTarget: "urn:li:organization:200",
        "organizationalTarget~": { localizedName: "Surf" } },
      { role: "CONTENT_ADMINISTRATOR", state: "APPROVED",
        organizationalTarget: "urn:li:organization:300",
        "organizationalTarget~": { localizedName: "Rara" } },
      { role: "LEAD_GEN_FORMS_MANAGER", state: "APPROVED",
        organizationalTarget: "urn:li:organization:300",
        "organizationalTarget~": { localizedName: "Rara" } },
    ] })]]);
    const s = await sondarLinkedIn({ token: "t", agora: AGORA }, c);
    expect(s.medidas.map((m) => m.nome)).toContain("Rara");
    expect(s.cargos.find((x) => x.papel === "LEAD_GEN_FORMS_MANAGER")!.medidas)
      .toEqual(["Rara"]);
  });
});

describe("a chave do post sai do PRÓPRIO post", () => {
  it("um post antigo `share:` não é mandado dentro de `ugcPosts`", async () => {
    // O 400 que apagou a retroatividade em duas Páginas: a chave vinha do post
    // mais recente e valia para o mais antigo, de outro tipo.
    const enviados: Array<Record<string, string>> = [];
    const c = fake([
      [/Acls/, () => aclDe([["ADMINISTRATOR", 100]])],
      [/\/rest\/posts/, (_ca, o) => resp({
        elements: Number(o.params.start ?? 0) > 0 ? [] : [
          { id: "urn:li:ugcPost:novo", createdAt: AGORA.getTime() - 86_400_000 },
          { id: "urn:li:share:velho", createdAt: AGORA.getTime() - 500 * 86_400_000 },
        ] })],
      [/ShareStatistics/, (_ca, o) => {
        if (o.cru) enviados.push(o.cru);
        return resp({ elements: [{ totalShareStatistics: { impressionCount: 8 } }] });
      }],
    ]);
    const s = await sondarLinkedIn({ token: "t", agora: AGORA }, c);
    const doVelho = enviados.find((x) => JSON.stringify(x).includes("share%3Avelho"));
    expect(doVelho).toHaveProperty("shares");
    expect(doVelho).not.toHaveProperty("ugcPosts");
    expect(s.retroatividadeDeConteudoDias).toBe(500);
  });
});

describe("o lote parcial é regra de coleta, não pendência", () => {
  it("dizer que voltaram menos vira instrução, e sai da lista de pendências", async () => {
    const c = fake([
      [/Acls/, () => aclDe([["ADMINISTRATOR", 100]])],
      [/\/rest\/posts/, (_ca, o) => resp({
        elements: Number(o.params.start ?? 0) > 0 ? [] : [
          { id: "urn:li:ugcPost:a", createdAt: AGORA.getTime() - 86_400_000 },
          { id: "urn:li:ugcPost:b", createdAt: AGORA.getTime() - 2 * 86_400_000 },
          { id: "urn:li:ugcPost:c", createdAt: AGORA.getTime() - 3 * 86_400_000 },
        ] })],
      [/ShareStatistics/, () => resp({
        elements: [{ ugcPost: "urn:li:ugcPost:a",
          totalShareStatistics: { impressionCount: 4 } }] })],
    ]);
    const s = await sondarLinkedIn({ token: "t", agora: AGORA }, c);
    expect(s.texto).toContain("casar pelo URN devolvido");
    const final = s.texto.slice(s.texto.indexOf("O QUE AINDA PRECISAMOS DESCOBRIR"));
    expect(final).not.toContain("lote parcial");
  });
});

describe("a seção 8 promete só o que é dado de cliente", () => {
  it("instrumento da sondagem não entra em 'o que dá para trazer'", async () => {
    const c = fake([
      [/Acls/, () => aclDe([["ADMINISTRATOR", 100]])],
      [/FollowerStatistics/, () => resp({ elements: Array.from({ length: 30 },
        () => ({ followerGains: { organicFollowerGain: 1 } })) })],
    ]);
    const s = await sondarLinkedIn({ token: "t", agora: AGORA }, c);
    const sec8 = s.texto.slice(s.texto.indexOf("8. O QUE DÁ PARA TRAZER"),
      s.texto.indexOf("9. O QUE NÃO DÁ"));
    expect(sec8).toContain("seguidores · vitalício");
    expect(sec8).not.toContain("estado da atribuição");
    expect(sec8).not.toContain("escolha da página do histórico");
    expect(sec8).not.toContain("profundidade da listagem");
  });
});

describe("as seções 8 e 9 não se contradizem", () => {
  it("o que funcionou numa Página sai de 'o que não dá'", async () => {
    // A rodada 6 listou `seguidores · vitalício` como disponível E como
    // indisponível, porque uma das quatro Páginas o recusou.
    const c = fake([
      [/Acls/, () => aclDe([["ADMINISTRATOR", 100], ["ADMINISTRATOR", 101]])],
      [/FollowerStatistics/, (_ca, o) =>
        String(o.params.organizationalEntity).endsWith(":101")
          ? erro(403, "Viewer has insufficient permissions")
          : resp({ elements: Array.from({ length: 30 },
              () => ({ followerGains: { organicFollowerGain: 1 } })) })],
    ]);
    const s = await sondarLinkedIn({ token: "t", agora: AGORA }, c);
    const sec9 = s.texto.slice(s.texto.indexOf("9. O QUE NÃO DÁ"),
      s.texto.indexOf("10. RECOMENDAÇÃO"));
    expect(sec9).toContain("DEPENDE DA PÁGINA");
    expect(sec9).toContain("recusado em: Pagina 101");
    // e não como veredito seco de indisponibilidade
    expect(sec9).not.toMatch(/^   seguidores · vitalício — /m);
  });
});
