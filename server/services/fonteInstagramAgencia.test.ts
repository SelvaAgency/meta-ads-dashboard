/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  A fonte da agência não pode ter mudado nada
 * ─────────────────────────────────────────────────────────────────────────────
 *  Esta fatia é refactor puro: a porta `FonteInstagram` nasce embrulhando o que
 *  já funcionava, para a segunda fonte (login da conta) entrar por baixo depois.
 *  Refactor puro tem uma obrigação — provar que é puro.
 *
 *  A prova mais forte não está aqui: `instagramDiagnostico.test.ts` passa SEM
 *  UMA LINHA ALTERADA, e são 17 testes sobre os textos e vereditos exatos do
 *  diagnóstico. O que este arquivo acrescenta é a igualdade ponta a ponta —
 *  passar pela fonte produz o MESMO objeto que chamar direto — e as regras que
 *  a porta cria e que antes não existiam.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { diagnosticar } from "./instagram";
import { fonteAgencia } from "./fonteInstagramAgencia";
import { FonteSemCredencial, ROTULO_FONTE } from "./fonteInstagram";

const TOKEN = "EAA-token-de-teste-que-nao-sai-daqui-0123456789";
const PAGE = "111222333";
const IG = "17841400000000000";
const ESCOPOS = ["pages_show_list", "instagram_basic", "instagram_manage_insights", "pages_read_engagement"];

function simularGraph(opts: { insights?: "ok" | "recusa" } = {}) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const caminho = new URL(String(url)).pathname;
    const json = (corpo: unknown) => new Response(JSON.stringify(corpo), { status: 200 });

    if (caminho.endsWith("/me")) return json({ id: "1", name: "Guilherme T. Felberg" });
    if (caminho.includes("debug_token")) {
      return json({ data: { type: "SYSTEM_USER", app_id: "999", expires_at: 0, scopes: ESCOPOS } });
    }
    if (caminho.includes("/client_pages")) {
      return json({ data: [{
        id: PAGE, name: "Elwing Incorporadora", category: "Imobiliária",
        instagram_business_account: { id: IG, username: "elwing.incorporadora" },
      }] });
    }
    if (caminho.includes("/owned_pages")) return json({ data: [] });
    if (caminho.includes("/insights")) {
      return opts.insights === "recusa"
        ? json({ error: { message: "(#10) Application does not have permission for this action", code: 10 } })
        : json({ data: [{ name: "reach", total_value: { value: 42 } }] });
    }
    if (caminho.includes(IG)) return json({ id: IG, username: "elwing.incorporadora", media_count: 87 });
    return json({ error: { message: `caminho não simulado: ${caminho}`, code: 1 } });
  }));
}

const comToken = () => fonteAgencia(async () => TOKEN);
const semToken = () => fonteAgencia(async () => null);

afterEach(() => vi.unstubAllGlobals());

describe("o comportamento é o mesmo de antes", () => {
  /** A igualdade que define "refactor puro". */
  it("diagnosticar pela fonte === diagnosticar direto", async () => {
    simularGraph({ insights: "recusa" });
    const pelaFonte = await comToken().diagnosticar({ pageId: PAGE, instagramUserId: IG, escopoDeCliente: true });
    const direto = await diagnosticar(TOKEN, { pageId: PAGE, instagramUserId: IG, escopoDeCliente: true });
    expect(pelaFonte).toEqual(direto);
    expect(pelaFonte.texto).toBe(direto.texto);
  });

  it("o diagnóstico geral continua sem falar de cliente", async () => {
    simularGraph();
    const d = await comToken().diagnosticar({});
    expect(d.etapas.find((e) => e.pergunta.includes("Página do cliente"))?.detalhe)
      .toContain("sem cliente em foco");
  });

  it("descobrirPaginas devolve o mesmo portfólio", async () => {
    simularGraph();
    const r = await comToken().descobrirPaginas!();
    expect(r.paginas).toHaveLength(1);
    expect(r.paginas[0].pageName).toBe("Elwing Incorporadora");
    expect(r.paginas[0].instagram?.username).toBe("elwing.incorporadora");
  });
});

describe("as leituras extraídas de dentro do diagnóstico", () => {
  it("perfil traz @ e tipo, sem pedir account_type", async () => {
    simularGraph();
    const p = await comToken().perfil({ instagramUserId: IG });
    expect(p).toEqual({ instagramUserId: IG, username: "elwing.incorporadora", tipoConta: "BUSINESS", posts: 87 });
    const chamadas = (globalThis.fetch as unknown as { mock: { calls: string[][] } }).mock.calls;
    expect(chamadas.some(([u]) => String(u).includes("account_type"))).toBe(false);
  });

  it("insights nomeiam o que passou e o que foi recusado", async () => {
    simularGraph({ insights: "recusa" });
    const r = await comToken().insights({ instagramUserId: IG });
    expect(r.statusInsight).toBe("INDISPONIVEL");
    expect(r.ok).toEqual([]);
    expect(r.recusadas).toHaveLength(4);
    expect(r.recusadas.join(" ")).toContain("reach");
  });

  it("insights respondendo dão DISPONIVEL", async () => {
    simularGraph({ insights: "ok" });
    expect((await comToken().insights({ instagramUserId: IG })).statusInsight).toBe("DISPONIVEL");
  });
});

describe("regras que a porta cria", () => {
  it("a fonte se identifica, e o rótulo é legível", () => {
    expect(comToken().nome).toBe("agencia_system_user");
    expect(ROTULO_FONTE.agencia_system_user).toBe("Token da agência");
    expect(ROTULO_FONTE.oauth_conta).toBeTruthy();
  });

  it("sem credencial, a fonte se declara indisponível em vez de falhar na rede", async () => {
    expect(await semToken().disponivel()).toBe(false);
    expect(await comToken().disponivel()).toBe(true);
  });

  /** Erro PRÓPRIO: "não configurado" não se confunde com "falhou ao usar". */
  it("usar sem credencial levanta FonteSemCredencial, não Error genérico", async () => {
    simularGraph();
    await expect(semToken().perfil({ instagramUserId: IG })).rejects.toBeInstanceOf(FonteSemCredencial);
    await expect(semToken().diagnosticar({})).rejects.toBeInstanceOf(FonteSemCredencial);
  });

  /**
   * Ler sem alvo devolveria o perfil de qualquer conta que a Meta escolhesse —
   * pior que falhar, porque o número apareceria no cliente errado.
   */
  it("ler sem Instagram informado falha, em vez de ler outra conta", async () => {
    simularGraph();
    await expect(comToken().perfil({})).rejects.toThrow(/Nenhum Instagram informado/);
    await expect(comToken().perfil({ pageId: PAGE })).rejects.toThrow(/não tem Instagram vinculado/);
  });

  it("o portfólio é capacidade só desta fonte, e ela a declara", () => {
    expect(typeof comToken().descobrirPaginas).toBe("function");
  });
});

describe("o token não sai da fonte", () => {
  it("nada do que a fonte devolve contém o token", async () => {
    simularGraph({ insights: "recusa" });
    const fonte = comToken();
    const tudo = JSON.stringify([
      await fonte.diagnosticar({ pageId: PAGE, instagramUserId: IG }),
      await fonte.perfil({ instagramUserId: IG }),
      await fonte.insights({ instagramUserId: IG }),
      await fonte.descobrirPaginas!(),
    ]);
    expect(tudo).not.toContain(TOKEN);
  });

  /** A porta não tem método que devolva credencial — nem pode ganhar um. */
  it("a fonte não expõe nenhum acessor de token", () => {
    const chaves = Object.keys(comToken());
    expect(chaves.some((k) => /token|credencial|secret/i.test(k))).toBe(false);
  });
});
