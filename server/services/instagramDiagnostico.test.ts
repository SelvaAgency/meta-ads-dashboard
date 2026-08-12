/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  O diagnóstico não pode afirmar nada sobre um cliente que ele não recebeu
 * ─────────────────────────────────────────────────────────────────────────────
 *  Este arquivo nasce de um erro concreto. O diagnóstico GERAL — o botão do topo,
 *  que não tem cliente nenhum em foco — respondia a etapa da Página com "Nenhuma
 *  Página vinculada a este cliente ainda". Os vínculos estavam salvos; a frase
 *  falava de um cliente que a chamada nunca teve. Resultado: uma investigação
 *  inteira de falha de persistência que não existia.
 *
 *  A lição não é sobre texto. É que um diagnóstico que responde MAIS do que lhe
 *  foi perguntado é pior que um que responde menos: ele manda procurar no lugar
 *  errado com a autoridade de quem mediu.
 *
 *  A Graph API é simulada aqui de propósito. O que está sendo travado é o que o
 *  diagnóstico DIZ para cada forma de entrada — e isso não depende da rede.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { diagnosticar, sanitizar } from "./instagram";

const TOKEN = "EAA-token-de-teste-que-nao-sai-daqui-0123456789";
const PAGE = "111222333";
const IG = "17841400000000000";

const TODOS_ESCOPOS = ["pages_show_list", "instagram_basic", "instagram_manage_insights", "pages_read_engagement"];

/**
 * Responde como a Graph API responderia, por caminho. Cada opção existe para
 * isolar UMA etapa: insights, escopos do token e ativos alcançados variam sem o
 * vínculo mudar, e é aí que os vereditos se separam.
 */
function simularGraph(opts: {
  insights?: "ok" | "recusa";
  comInstagram?: boolean;
  escopos?: string[];
  granular?: Array<{ scope: string; target_ids?: string[] }>;
  tipoToken?: string;
  semDebug?: boolean;
} = {}) {
  const comIg = opts.comInstagram !== false;
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const caminho = new URL(String(url)).pathname;
    const json = (corpo: unknown) => new Response(JSON.stringify(corpo), { status: 200 });

    if (caminho.endsWith("/me")) return json({ id: "1", name: "Guilherme T. Felberg" });
    if (caminho.includes("debug_token")) {
      return opts.semDebug
        ? json({ error: { message: "sem acesso ao debug", code: 190 } })
        : json({ data: {
            type: opts.tipoToken ?? "SYSTEM_USER", app_id: "999", expires_at: 0, is_valid: true,
            scopes: opts.escopos ?? TODOS_ESCOPOS,
            ...(opts.granular ? { granular_scopes: opts.granular } : {}),
          } });
    }
    if (caminho.includes("/client_pages")) {
      return json({ data: [{
        id: PAGE, name: "UltraMalhas", category: "Loja",
        ...(comIg ? { instagram_business_account: { id: IG, username: "ultramalhasloja" } } : {}),
      }] });
    }
    if (caminho.includes("/owned_pages")) return json({ data: [] });
    if (caminho.includes("/insights")) {
      return opts.insights === "recusa"
        ? json({ error: { message: "(#100) metric não suportada", code: 100 } })
        : json({ data: [{ name: "reach", total_value: { value: 42 } }] });
    }
    if (caminho.includes(IG)) return json({ id: IG, username: "ultramalhasloja", media_count: 10 });
    return json({ error: { message: `caminho não simulado: ${caminho}`, code: 1 } });
  }));
}

const etapa = (d: Awaited<ReturnType<typeof diagnosticar>>, trecho: string) =>
  d.etapas.find((e) => e.pergunta.includes(trecho));

afterEach(() => vi.unstubAllGlobals());

describe("etapa 4 — a Página do cliente", () => {
  /** O bug, travado: sem cliente em foco, não se afirma nada sobre cliente. */
  it("diagnóstico GERAL não fala de 'este cliente'", async () => {
    simularGraph();
    const d = await diagnosticar(TOKEN);
    const e = etapa(d, "Página do cliente");
    expect(e?.resposta).toBe("n/a");
    expect(e?.detalhe).toContain("sem cliente em foco");
    expect(e?.detalhe).not.toContain("este cliente ainda não tem");
    // E manda para onde a pergunta EXISTE, em vez de deixar sem saída.
    expect(e?.detalhe).toContain("Testar");
  });

  /** Com cliente em foco e sem Página salva, aí sim a frase é sobre ele. */
  it("teste DE UM CLIENTE sem Página salva diz o próximo passo", async () => {
    simularGraph();
    const d = await diagnosticar(TOKEN, { escopoDeCliente: true });
    const e = etapa(d, "Página do cliente");
    expect(e?.resposta).toBe("n/a");
    expect(e?.detalhe).toContain("Vincular");
    expect(e?.detalhe).not.toContain("sem cliente em foco");
  });

  /** Com Página salva, o diagnóstico AVANÇA — não para na etapa 4. */
  it("com Página salva, chega até os insights", async () => {
    simularGraph();
    const d = await diagnosticar(TOKEN, { pageId: PAGE, instagramUserId: IG, escopoDeCliente: true });
    expect(etapa(d, "Página do cliente")?.resposta).toBe("sim");
    expect(etapa(d, "Instagram vinculado")?.resposta).toBe("sim");
    expect(etapa(d, "tipo de conta")?.resposta).toBe("sim");
    expect(etapa(d, "Insights")?.resposta).toBe("sim");
    expect(d.statusInsight).toBe("DISPONIVEL");
    expect(d.tipoConta).toBe("BUSINESS");
  });
});

describe("etapa 6 — tipo da conta", () => {
  /**
   * `account_type` não existe no nó instagram_business_account. Pedi-lo faria a
   * Meta recusar a chamada inteira e o tipo viraria DESCONHECIDO exatamente onde
   * ele é conhecido: quem chega por esta aresta é profissional por construção.
   */
  it("não pede account_type à Meta", async () => {
    simularGraph();
    await diagnosticar(TOKEN, { pageId: PAGE, instagramUserId: IG });
    const chamadas = (globalThis.fetch as unknown as { mock: { calls: string[][] } }).mock.calls;
    expect(chamadas.some(([u]) => String(u).includes("account_type"))).toBe(false);
  });
});

describe("etapa 7 — insights", () => {
  it("métrica recusada é NOMEADA, e não vira 'não funcionou'", async () => {
    simularGraph({ insights: "recusa" });
    const d = await diagnosticar(TOKEN, { pageId: PAGE, instagramUserId: IG });
    expect(d.statusInsight).toBe("INDISPONIVEL");
    expect(d.metricasRecusadas.length).toBe(4);
    expect(d.metricasRecusadas.join(" ")).toContain("reach");
    expect(d.texto).toContain("Métricas recusadas");
  });
});

describe("Página sem Instagram é estado próprio", () => {
  it("para na etapa 5 sem chamar de erro", async () => {
    simularGraph({ comInstagram: false });
    const d = await diagnosticar(TOKEN, { pageId: PAGE, escopoDeCliente: true });
    expect(d.ok).toBe(true);
    expect(etapa(d, "Instagram vinculado")?.resposta).toBe("não");
    expect(etapa(d, "tipo de conta")).toBeUndefined();
  });
});

describe("nenhum token no texto", () => {
  it("o diagnóstico inteiro nunca contém o token", async () => {
    simularGraph({ insights: "recusa" });
    const d = await diagnosticar(TOKEN, { pageId: PAGE, instagramUserId: IG });
    expect(d.texto).not.toContain(TOKEN);
    expect(d.texto).not.toContain("access_token");
    // A impressão identifica o token sem revelá-lo.
    expect(d.impressao).toMatch(/^[0-9a-f]{8}$/);
    expect(TOKEN).not.toContain(d.impressao);
  });

  it("mensagem da Meta com o token dentro sai sanitizada", () => {
    expect(sanitizar(`falhou para access_token=${TOKEN}`, TOKEN)).not.toContain(TOKEN);
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Quando insights não respondem, o diagnóstico diz DE QUEM é a falta
 * ─────────────────────────────────────────────────────────────────────────────
 *  Antes ele mandava conferir instagram_manage_insights sempre — conselho que
 *  acerta um caso em três e, nos outros dois, faz gerar um token novo que volta
 *  com o mesmo erro. Agora ele mede antes de aconselhar.
 * ─────────────────────────────────────────────────────────────────────────────
 */
describe("veredito de permissão", () => {
  it("etapa 2 declara o TIPO do token e os escopos", async () => {
    simularGraph();
    const d = await diagnosticar(TOKEN);
    const e = etapa(d, "Que token é este");
    expect(e?.resposta).toBe("sim");
    expect(e?.detalhe).toContain("SYSTEM_USER");
    expect(e?.detalhe).toContain("não expira");
    expect(e?.detalhe).toContain("instagram_manage_insights");
    expect(d.ficha?.tipo).toBe("SYSTEM_USER");
  });

  it("token de usuário comum aparece como tal, sem ser confundido com System User", async () => {
    simularGraph({ tipoToken: "USER" });
    const d = await diagnosticar(TOKEN);
    expect(d.ficha?.tipo).toBe("USER");
    expect(etapa(d, "Que token é este")?.detalhe).toContain("USER");
  });

  it("escopo faltando é apontado JÁ na etapa 2, antes de os insights falharem", async () => {
    simularGraph({ escopos: TODOS_ESCOPOS.filter((e) => e !== "instagram_manage_insights") });
    const d = await diagnosticar(TOKEN);
    const e = etapa(d, "Que token é este");
    expect(e?.resposta).toBe("não");
    expect(e?.detalhe).toContain("FALTAM para insights: instagram_manage_insights");
  });

  it("escopo ausente + insights recusados: culpa do token, e manda regerar", async () => {
    simularGraph({ insights: "recusa", escopos: TODOS_ESCOPOS.filter((e) => e !== "instagram_manage_insights") });
    const d = await diagnosticar(TOKEN, { pageId: PAGE, instagramUserId: IG, escopoDeCliente: true });
    expect(d.veredito?.culpado).toBe("token");
    expect(d.texto).toContain("O que fazer (token)");
    expect(d.texto).toContain("gerado de novo");
  });

  /** O caso em que regerar o token seria perda de tempo. */
  it("escopo restrito a outro ativo: culpa do ativo, e diz para NÃO regerar", async () => {
    simularGraph({
      insights: "recusa",
      granular: [{ scope: "instagram_manage_insights", target_ids: ["outro_instagram"] }],
    });
    const d = await diagnosticar(TOKEN, { pageId: PAGE, instagramUserId: IG, escopoDeCliente: true });
    expect(d.veredito?.culpado).toBe("ativo");
    expect(d.texto).toContain("Gerar outro token não resolve");
    expect(d.texto).toContain("não alcança este ativo: instagram_manage_insights");
  });

  /** O estado da Elwing: token completo, ativo alcançado, e Meta recusando. */
  it("token completo e ativo alcançado: aponta o App, não o token", async () => {
    simularGraph({ insights: "recusa" });
    const d = await diagnosticar(TOKEN, { pageId: PAGE, instagramUserId: IG, escopoDeCliente: true });
    expect(d.veredito?.culpado).toBe("app");
    expect(d.texto).toContain("Acesso Avançado");
    expect(d.texto).not.toContain("gerado de novo");
  });

  it("insights OK não produz veredito nenhum", async () => {
    simularGraph({ insights: "ok" });
    const d = await diagnosticar(TOKEN, { pageId: PAGE, instagramUserId: IG });
    expect(d.veredito).toBeNull();
    expect(d.texto).not.toContain("O que fazer");
  });

  /** Sem a ficha o diagnóstico continua — só perde a precisão, e diz isso. */
  it("debug_token indisponível não derruba o diagnóstico", async () => {
    simularGraph({ semDebug: true, insights: "recusa" });
    const d = await diagnosticar(TOKEN, { pageId: PAGE, instagramUserId: IG });
    expect(etapa(d, "Que token é este")?.resposta).toBe("n/a");
    expect(etapa(d, "Insights")?.resposta).toBe("não");
    expect(d.veredito).toBeNull();
    expect(etapa(d, "Insights")?.detalhe).toContain("não pôde ser inspecionado");
  });

  it("a ficha do token não revela o token", async () => {
    simularGraph({ insights: "recusa" });
    const d = await diagnosticar(TOKEN, { pageId: PAGE, instagramUserId: IG });
    expect(JSON.stringify(d.ficha)).not.toContain(TOKEN);
    expect(d.texto).not.toContain(TOKEN);
  });
});
