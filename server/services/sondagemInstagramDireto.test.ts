/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Encontrar não é o suficiente
 * ─────────────────────────────────────────────────────────────────────────────
 *  As arestas de Instagram do Business Manager podem devolver o id da "conta do
 *  Instagram" do Portfólio, que NÃO é o IG User (17841…) que os insights exigem.
 *  Os dois são números e nenhum erro os distingue.
 *
 *  Uma sondagem que respondesse "achei a Musa" com um id que não mede nada seria
 *  pior que uma que não achasse nada: pareceria sucesso, o vínculo seria criado,
 *  e a página apareceria vazia sem ninguém saber por quê. Por isso todo ativo
 *  passa por uma segunda pergunta — este id responde COMO IG User?
 *
 *  E a resposta que importa não é a lista inteira: é quem SÓ existe por esta
 *  via. Conta que já vem pela Página não muda nada.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, expect, it, vi } from "vitest";
import { sondarInstagramDireto } from "./sondagemInstagramDireto";
import type { Consultar } from "./instagramSondagem";

const BUSINESS = "803399908519541";
const MUSA = "17841400000000009";
const JA_TEM_PAGINA = "17841400000000001";

/**
 * Simula o Portfólio. `mensuraveis` são os ids que respondem como IG User —
 * a distinção que a sondagem existe para fazer.
 */
function portfolio(opts: {
  owned?: Array<Record<string, unknown>>;
  client?: Array<Record<string, unknown>>;
  arestasQueFalham?: string[];
  mensuraveis?: string[];
  semInsights?: string[];
  recusaUsernameNaAresta?: boolean;
} = {}): Consultar {
  const falham = new Set(opts.arestasQueFalham ?? ["instagram_accounts"]);
  const mede = new Set(opts.mensuraveis ?? []);
  const semIns = new Set(opts.semInsights ?? []);

  return vi.fn(async (caminho: string, params: Record<string, string>) => {
    for (const aresta of ["owned_instagram_accounts", "client_instagram_accounts", "instagram_accounts"]) {
      if (!caminho.endsWith(`/${aresta}`)) continue;
      if (falham.has(aresta)) throw new Error(`Meta (100): aresta ${aresta} indisponível`);
      // O nó de conta do Business Manager pode não ter `username`.
      if (opts.recusaUsernameNaAresta && params.fields?.includes("username")) {
        throw new Error("Meta (100): (#100) campo username inválido neste nó");
      }
      const lista = aresta === "owned_instagram_accounts" ? opts.owned : aresta === "client_instagram_accounts" ? opts.client : [];
      return { data: lista ?? [] } as never;
    }
    if (caminho.includes("/insights")) {
      const id = caminho.split("/")[0];
      if (semIns.has(id)) throw new Error("Meta (10): sem permissão de insights");
      return { data: [{ total_value: { value: 42 } }] } as never;
    }
    // Perfil pelo id
    if (!mede.has(caminho)) throw new Error("Meta (100): (#100) objeto não existe ou não é IG User");
    return { username: `conta_${caminho.slice(-2)}`, followers_count: 1200, media_count: 88 } as never;
  }) as Consultar;
}

describe("achar a Musa", () => {
  it("encontra pela aresta de propriedade e marca como mensurável", async () => {
    const r = await sondarInstagramDireto(portfolio({
      owned: [{ id: MUSA, username: "musa.oficial" }],
      mensuraveis: [MUSA],
    }), BUSINESS);

    expect(r.ativos).toHaveLength(1);
    expect(r.ativos[0].id).toBe(MUSA);
    expect(r.ativos[0].mensuravel).toBe(true);
    expect(r.ativos[0].followersCount).toBe(1200);
    expect(r.ativos[0].insightsRespondem).toBe(true);
  });

  /** A resposta que importa: quem SÓ existe por esta via. */
  it("separa quem já vinha pela Página de quem só existe aqui", async () => {
    const r = await sondarInstagramDireto(portfolio({
      owned: [{ id: JA_TEM_PAGINA }, { id: MUSA }],
      mensuraveis: [JA_TEM_PAGINA, MUSA],
    }), BUSINESS, [JA_TEM_PAGINA]);

    expect(r.ativos).toHaveLength(2);
    expect(r.somenteDiretos.map((a) => a.id)).toEqual([MUSA]);
    expect(r.texto).toContain("1 só alcançável");
  });

  it("o mesmo id em duas arestas não vira dois ativos", async () => {
    const r = await sondarInstagramDireto(portfolio({
      owned: [{ id: MUSA }], client: [{ id: MUSA }], mensuraveis: [MUSA],
    }), BUSINESS);
    expect(r.ativos).toHaveLength(1);
  });
});

describe("encontrado ≠ utilizável", () => {
  /**
   * O caso que a sondagem existe para pegar: o Portfólio devolve um id, e ele
   * não é IG User. Marcar isso como sucesso criaria um vínculo que nunca mede.
   */
  it("id que não responde como IG User é 'não mensurável', e não sucesso", async () => {
    const r = await sondarInstagramDireto(portfolio({
      owned: [{ id: "999888777", username: "musa.oficial" }],
      mensuraveis: [],
    }), BUSINESS);

    const a = r.ativos[0];
    expect(a.mensuravel).toBe(false);
    expect(a.followersCount).toBeNull();
    expect(a.detalhe).toContain("NÃO mensurável");
    expect(r.texto).toContain("[NÃO ]");
  });

  /** Perfil responde mas insights não: útil pela metade, e dito assim. */
  it("perfil ok e insights recusados fica como parcial", async () => {
    const r = await sondarInstagramDireto(portfolio({
      owned: [{ id: MUSA }], mensuraveis: [MUSA], semInsights: [MUSA],
    }), BUSINESS);

    expect(r.ativos[0].mensuravel).toBe(true);
    expect(r.ativos[0].insightsRespondem).toBe(false);
    expect(r.ativos[0].detalhe).toContain("insights recusados");
    expect(r.texto).toContain("[PARC]");
  });

  it("a legenda explica os três estados", async () => {
    const r = await sondarInstagramDireto(portfolio({ owned: [{ id: MUSA }], mensuraveis: [MUSA] }), BUSINESS);
    expect(r.texto).toContain("MEDE");
    expect(r.texto).toContain("PARC");
    expect(r.texto).toContain("não mensurável");
  });
});

describe("as arestas falham por conta própria", () => {
  /**
   * O nó de conta do Business Manager tem campos diferentes do nó de IG User.
   * Um `username` inválido derrubaria a chamada inteira, e a aresta pareceria
   * não existir por causa do nome de um campo.
   */
  it("aresta que recusa `username` é relida só com `id`", async () => {
    const r = await sondarInstagramDireto(portfolio({
      owned: [{ id: MUSA }], mensuraveis: [MUSA], recusaUsernameNaAresta: true,
    }), BUSINESS);
    expect(r.ativos).toHaveLength(1);
    expect(r.ativos[0].usernameDoPortfolio).toBeNull();
    // O username de verdade vem da segunda pergunta, no nó de IG User.
    expect(r.ativos[0].username).toBeTruthy();
  });

  it("uma aresta que falha não impede as outras", async () => {
    const r = await sondarInstagramDireto(portfolio({
      arestasQueFalham: ["owned_instagram_accounts", "instagram_accounts"],
      client: [{ id: MUSA }], mensuraveis: [MUSA],
    }), BUSINESS);
    expect(r.ativos).toHaveLength(1);
    expect(r.avisos.join(" ")).toContain("owned_instagram_accounts");
  });

  /** Nenhum ativo é uma resposta, e ela decide o caminho da Musa. */
  it("portfólio sem Instagram atribuído diz o que isso significa", async () => {
    const r = await sondarInstagramDireto(portfolio({ owned: [], client: [] }), BUSINESS);
    expect(r.ativos).toEqual([]);
    expect(r.somenteDiretos).toEqual([]);
    expect(r.texto).toContain("Nenhuma conta de Instagram atribuída");
    expect(r.texto).toContain("Instagram Login");
  });
});

describe("a sondagem só lê", () => {
  it("nenhuma chamada de escrita", async () => {
    const c = portfolio({ owned: [{ id: MUSA }], mensuraveis: [MUSA] });
    await sondarInstagramDireto(c, BUSINESS);
    const chamadas = (c as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    expect(chamadas.length).toBeGreaterThan(0);
    // `Consultar` é GET por construção — o teste trava a ausência de qualquer
    // caminho de vínculo ou gravação nesta sondagem.
    const texto = JSON.stringify(chamadas);
    expect(texto).not.toContain("vincular");
    expect(texto).not.toContain("subscribed_apps");
  });
});
