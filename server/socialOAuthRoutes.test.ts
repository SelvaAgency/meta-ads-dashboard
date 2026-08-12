/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  O accountId não pode vir pela URL
 * ─────────────────────────────────────────────────────────────────────────────
 *  É ele que decide de QUAL cliente é o token sendo gravado. Solto na query do
 *  callback, qualquer pessoa com um link de retorno trocaria o número e gravaria
 *  a conexão de um cliente por cima da de outro — sem erro nenhum aparecer, já
 *  que o token seria válido; só estaria no cliente errado.
 *
 *  Por isso ele viaja assinado dentro do `state`, junto do userId e de um nonce.
 *  O primeiro teste prova que a assinatura segura; o último prova que o código
 *  não voltou a ler o atalho.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

beforeAll(() => { process.env.JWT_SECRET = "segredo-de-teste-nao-usado-em-producao"; });

describe("state assinado", () => {
  it("leva userId e accountId, e volta com os dois", async () => {
    const { assinarState, lerState } = await import("./socialOAuthRoutes");
    const dados = await lerState(await assinarState(42, 7));
    expect(dados).toEqual({ uid: 42, aid: 7 });
  });

  /** Sem isto, o state seria só um campo de texto que o atacante escreve. */
  it("state adulterado é recusado", async () => {
    const { assinarState, lerState } = await import("./socialOAuthRoutes");
    const bom = await assinarState(42, 7);
    const [cabecalho, corpo, assinatura] = bom.split(".");
    const alterado = Buffer.from(JSON.stringify({ uid: 42, aid: 999, n: "x" })).toString("base64url");
    expect(await lerState(`${cabecalho}.${alterado}.${assinatura}`)).toBeNull();
    expect(await lerState(`${cabecalho}.${corpo}.assinatura-inventada`)).toBeNull();
  });

  it("lixo e vazio não passam", async () => {
    const { lerState } = await import("./socialOAuthRoutes");
    expect(await lerState("")).toBeNull();
    expect(await lerState("nem-parece-um-jwt")).toBeNull();
  });

  /** Dois states do mesmo par não colidem: o nonce os separa. */
  it("cada state é único", async () => {
    const { assinarState } = await import("./socialOAuthRoutes");
    expect(await assinarState(42, 7)).not.toBe(await assinarState(42, 7));
  });
});

describe("o código não lê o atalho", () => {
  const fonte = () => readFileSync(new URL("./socialOAuthRoutes.ts", import.meta.url), "utf-8")
    // Sem comentários: a documentação da regra não pode ser confundida com a regra.
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

  it("o callback tira o accountId do state, nunca da query", () => {
    const s = fonte();
    const callback = s.slice(s.indexOf('"/api/social/instagram/callback"'));
    expect(callback).toContain("dados.aid");
    expect(callback).not.toMatch(/req\.query\.accountId/);
  });

  /** No /start pode: ali quem escolhe o cliente é a sessão autenticada. */
  it("o start lê a query, mas só depois de autenticar e conferir permissão", () => {
    const s = fonte();
    const start = s.slice(s.indexOf('"/api/social/instagram/start"'), s.indexOf('"/api/social/instagram/callback"'));
    expect(start.indexOf("authenticateRequest")).toBeLessThan(start.indexOf("req.query.accountId"));
    expect(start.indexOf("canManageContent")).toBeLessThan(start.indexOf("req.query.accountId"));
  });

  it("o token nunca volta pela URL do redirect", () => {
    const s = fonte();
    expect(s).not.toMatch(/redirect\([^)]*token/i);
    // Erro também não: mensagem da Meta em querystring vira log de proxy.
    expect(s).not.toMatch(/instagram=\$\{[^}]*message/);
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Os códigos de retorno vivem em dois processos
 * ─────────────────────────────────────────────────────────────────────────────
 *  O servidor escreve `?instagram=<código>` no redirect; a tela traduz esse
 *  código em uma frase. São arquivos diferentes, em processos diferentes, e
 *  nada os obriga a concordar — um código novo no servidor sem par na tela vira
 *  "Retorno não reconhecido" na cara do usuário, no fim de um fluxo que saiu do
 *  app e voltou. Este teste é o que obriga.
 * ─────────────────────────────────────────────────────────────────────────────
 */
describe("servidor e tela falam os mesmos códigos", () => {
  const semComentarios = (t: string) =>
    t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

  it("todo código emitido tem tradução na tela", () => {
    const rotas = semComentarios(readFileSync(new URL("./socialOAuthRoutes.ts", import.meta.url), "utf-8"));
    const tela = semComentarios(readFileSync(
      new URL("../client/src/components/conexoes/InstagramConexao.tsx", import.meta.url), "utf-8"));

    // Varre a LINHA inteira, e não `volta(...)`: o ramo de cancelamento é um
    // ternário com parênteses aninhados, e um casamento até o primeiro ")"
    // pararia no meio — perdendo justo os dois códigos que ele decide.
    const emitidos = new Set<string>();
    for (const linha of rotas.split("\n")) {
      if (!linha.includes("volta(")) continue;
      for (const m of linha.matchAll(/"([a-z_]+)"/g)) {
        if (m[1] !== "user_denied") emitidos.add(m[1]);
      }
    }
    for (const m of rotas.matchAll(/instagram=([a-z_]+)`/g)) emitidos.add(m[1]);

    const traduzidos = new Set(Array.from(tela.matchAll(/^ {2}([a-z_]+): \{ tom:/gm), (m) => m[1]));

    expect(emitidos.size).toBeGreaterThan(5);
    expect(Array.from(emitidos).filter((c) => !traduzidos.has(c))).toEqual([]);
    expect(Array.from(traduzidos).filter((c) => !emitidos.has(c))).toEqual([]);
  });
});
