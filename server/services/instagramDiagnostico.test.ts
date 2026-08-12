/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  O diagnóstico não pode afirmar nada sobre um cliente que ele não recebeu
 * ─────────────────────────────────────────────────────────────────────────────
 *  Este arquivo nasce de um erro concreto. O diagnóstico GERAL — o botão do topo,
 *  que não tem cliente nenhum em foco — respondia a etapa 3 com "Nenhuma Página
 *  vinculada a este cliente ainda". Os vínculos estavam salvos; a frase falava
 *  de um cliente que a chamada nunca teve. Resultado: uma investigação inteira
 *  de falha de persistência que não existia.
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

/**
 * Responde como a Graph API responderia, por caminho. `insights` é controlável
 * porque é a única etapa que varia sem o vínculo mudar.
 */
function simularGraph(opts: { insights?: "ok" | "recusa"; comInstagram?: boolean } = {}) {
  const comIg = opts.comInstagram !== false;
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const caminho = new URL(String(url)).pathname;
    const json = (corpo: unknown) => new Response(JSON.stringify(corpo), { status: 200 });

    if (caminho.endsWith("/me")) return json({ id: "1", name: "Guilherme T. Felberg" });
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

describe("etapa 3 — a Página do cliente", () => {
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

  /** Com Página salva, o diagnóstico AVANÇA — não para na etapa 3. */
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

describe("etapa 5 — tipo da conta", () => {
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

describe("etapa 6 — insights", () => {
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
  it("para na etapa 4 sem chamar de erro", async () => {
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
