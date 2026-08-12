/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Qual linha É a conexão de um cliente
 * ─────────────────────────────────────────────────────────────────────────────
 *  A chave única de `client_social_accounts` é (accountId, provider, handle) —
 *  ela permite mais de um @ de Instagram por cliente, herança de quando a
 *  tabela guardava só o @ digitado à mão. A CONEXÃO, porém, é uma só.
 *
 *  Três lugares perguntam "qual linha é a conexão deste cliente?": vincular,
 *  registrar o teste e a leitura que a tela desenha. Se cada um responder do
 *  seu jeito, vincular grava numa linha, o teste atualiza outra e a tela lê uma
 *  terceira — e o vínculo aparece como se nunca tivesse sido salvo. Este teste
 *  existe para os três continuarem respondendo igual.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, expect, it } from "vitest";
import { linhaDaConexao } from "./db";

const l = (id: number, pageId: string | null = null) => ({ id, pageId });

describe("linhaDaConexao", () => {
  it("prefere a linha que já tem Página — é ela que foi conectada", () => {
    expect(linhaDaConexao([l(1), l(2, "pg_9"), l(3)])?.id).toBe(2);
  });

  /** Sem Página em nenhuma, a mais antiga: escolha estável entre chamadas. */
  it("sem Página, escolhe a mais antiga", () => {
    expect(linhaDaConexao([l(7), l(3), l(5)])?.id).toBe(3);
  });

  it("a ordem em que o banco devolve não muda a resposta", () => {
    const linhas = [l(7), l(3, "pg_1"), l(5)];
    const escolhido = linhaDaConexao(linhas)?.id;
    expect(linhaDaConexao(linhas.slice().reverse())?.id).toBe(escolhido);
    expect(escolhido).toBe(3);
  });

  it("não reordena a lista que recebeu", () => {
    const linhas = [l(7), l(3), l(5)];
    linhaDaConexao(linhas);
    expect(linhas.map((x) => x.id)).toEqual([7, 3, 5]);
  });

  it("cliente sem nenhuma linha não tem conexão", () => {
    expect(linhaDaConexao([])).toBeUndefined();
  });
});
