/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  A credencial administrativa não pode escapar
 * ─────────────────────────────────────────────────────────────────────────────
 *  `ANTHROPIC_ADMIN_KEY` lê uso e custo da organização inteira. Ela é mais
 *  poderosa que a chave de mensagens, e por isso três coisas precisam ser
 *  verdade e continuar verdade:
 *
 *    1. só o servidor a lê
 *    2. ela nunca é confundida com `ANTHROPIC_API_KEY`
 *    3. ela nunca aparece em erro, log ou retorno
 *
 *  Nenhuma das três é visível para o compilador — por isso o teste lê a fonte.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const fonte = (p: string) =>
  readFileSync(new URL(p, import.meta.url), "utf-8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

const cliente = () => fonte("./services/anthropicAdmin.ts");
const sondagem = () => fonte("./services/sondagemAnthropic.ts");

describe("a chave administrativa fica no servidor", () => {
  it("nenhum arquivo do cliente menciona ANTHROPIC_ADMIN_KEY", () => {
    for (const p of [
      "../client/src/pages/ConsumoIA.tsx",
      "../client/src/pages/Admin.tsx",
      "../client/src/pages/hub/HubSettings.tsx",
    ]) {
      expect(fonte(p), p).not.toContain("ANTHROPIC_ADMIN_KEY");
      expect(fonte(p), p).not.toContain("sk-ant-admin");
    }
  });

  /**
   * As duas chaves têm poderes diferentes. Reaproveitar uma pela outra daria à
   * geração de texto acesso administrativo — ou faria o relatório falhar com
   * 401 sem ninguém entender por quê.
   */
  it("o cliente da Admin API NÃO usa a chave de mensagens", () => {
    const s = cliente();
    expect(s).toContain("ENV.anthropicAdminKey");
    expect(s, "a chave de mensagens vazou para os endpoints administrativos")
      .not.toContain("anthropicApiKey");
  });

  it("o gerador de texto NÃO usa a chave administrativa", () => {
    const s = fonte("./_core/llm.ts");
    expect(s).toContain("ENV.anthropicApiKey");
    expect(s, "a chave administrativa vazou para a geração de texto")
      .not.toContain("anthropicAdminKey");
  });

  /** Texto de erro de API é como credencial chega à tela. */
  it("toda mensagem de erro passa por sanitizar", () => {
    const s = cliente();
    expect(s).toContain("sanitizar(");
    // E a chave entra como segredo, para ser cortada mesmo se aparecer inteira.
    expect(s).toContain("ENV.anthropicAdminKey)");
    expect(s, "a chave foi para um console.log").not.toMatch(/console\.\w+\([^)]*[Aa]dminKey/);
  });

  it("a sondagem não imprime a chave, só se ela existe", () => {
    const s = sondagem();
    expect(s).toContain("temChaveAdmin()");
    expect(s, "a sondagem passou a exibir a credencial").not.toContain("ENV.anthropicAdminKey");
  });
});

describe("a paginação e os tetos vêm da API, não de otimismo", () => {
  it("os tetos de bucket são os que a API documenta", async () => {
    const { TETO_DE_BUCKETS } = await import("./services/anthropicAdmin");
    expect(TETO_DE_BUCKETS).toEqual({ "1d": 31, "1h": 168, "1m": 1440 });
  });

  /** Cursor que não avança viraria laço infinito segurando a requisição. */
  it("a paginação tem teto de páginas", () => {
    const s = cliente();
    expect(s).toContain("MAX_PAGINAS");
    expect(s).toMatch(/paginas < MAX_PAGINAS/);
    expect(s).toContain("has_more");
    expect(s).toContain("next_page");
  });

  /** Sem chave, a integração se declara desligada em vez de tentar e falhar. */
  it("sem chave, nem tenta a chamada", async () => {
    const { temChaveAdmin } = await import("./services/anthropicAdmin");
    expect(typeof temChaveAdmin()).toBe("boolean");
    expect(cliente()).toMatch(/if \(!ENV\.anthropicAdminKey\)[\s\S]{0,200}não configurada/);
  });
});

describe("a Anthropic não conta chamadas, e o código não finge que conta", () => {
  /**
   * A API não devolve contagem de requisições — nem no uso, nem no custo. O
   * número de chamadas continua vindo só de `ai_geracoes`, e inventar um do
   * lado da Anthropic destruiria justamente o que a comparação revela.
   */
  it("nenhum campo de contagem de CHAMADAS é lido do retorno da Anthropic", () => {
    // `web_search_requests` é campo real da API e conta buscas na web, não
    // chamadas ao modelo — ele fica de fora da varredura de propósito.
    const s = cliente().replace(/web_search_requests/g, "");
    for (const inventado of ["request_count", "num_calls", "call_count", "total_requests"]) {
      expect(s, inventado).not.toContain(inventado);
    }
  });

  it("a sondagem afirma a ausência em vez de omiti-la", () => {
    expect(sondagem()).toContain("CONTAGEM DE CHAMADAS");
  });
});
