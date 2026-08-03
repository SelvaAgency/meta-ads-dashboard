/**
 * Gmail provider — MIME, codificação e vazamento de segredo.
 *
 * Os três riscos que este arquivo tranca:
 *  1. base64 comum no lugar de base64url → a Gmail API devolve 400 genérico e
 *     ninguém descobre por quê.
 *  2. Assunto com acento não codificado → "atenção" chega "atenÃ§Ã£o", e a
 *     primeira impressão do sistema novo é acento quebrado.
 *  3. Token vazando para o log/auditoria pelo texto de erro do Google — que é
 *     lido pela tela do admin e fica gravado no email_send_log.
 */
import { describe, expect, it } from "vitest";
import {
  base64url, codificarAssunto, montarMime, sanitizarErroGmail, GMAIL_SCOPE,
} from "./gmailProvider";

describe("escopo pedido", () => {
  /** gmail.send ENVIA e não lê. Trocar por readonly/modify seria dar acesso a
   *  todo o histórico da agência — a diferença precisa quebrar um teste. */
  it("é gmail.send e nada além disso", () => {
    expect(GMAIL_SCOPE).toBe("https://www.googleapis.com/auth/gmail.send");
    expect(GMAIL_SCOPE).not.toMatch(/readonly|modify|full|compose/);
  });
});

describe("base64url", () => {
  it("troca + e / por - e _ e tira o padding", () => {
    // Bytes escolhidos para produzir '+' e '/' em base64 padrão.
    const buf = Buffer.from([0xfb, 0xff, 0xfe]);
    expect(buf.toString("base64")).toBe("+//+");
    expect(base64url(buf)).toBe("-__-");
  });

  it("não deixa sobrar caractere ilegal para a Gmail API", () => {
    const raw = base64url(Buffer.from("assunto com acento: ação e ç", "utf8"));
    expect(raw).not.toMatch(/[+/=]/);
  });
});

describe("assunto UTF-8", () => {
  it("deixa ASCII legível — log e depuração agradecem", () => {
    expect(codificarAssunto("Teste Gmail API - SELVA Spaces")).toBe("Teste Gmail API - SELVA Spaces");
  });

  it("codifica acento em encoded-word da RFC 2047", () => {
    const s = codificarAssunto("Jornalzinho · atenção");
    expect(s).toMatch(/^=\?UTF-8\?B\?.+\?=$/);
    // e volta ao original quando decodificado
    const b64 = s.replace(/^=\?UTF-8\?B\?/, "").replace(/\?=$/, "");
    expect(Buffer.from(b64, "base64").toString("utf8")).toBe("Jornalzinho · atenção");
  });
});

describe("montagem MIME", () => {
  const base = { de: "spaces@selva.agency", para: "a@selva.agency", assunto: "Oi", html: "<p>oi</p>" };

  it("recusa mensagem sem destinatário — falha alto, não manda para o vazio", () => {
    expect(() => montarMime({ ...base, para: [] })).toThrow(/sem destinat/i);
  });

  it("só-HTML vira parte única", () => {
    const mime = montarMime(base);
    expect(mime).toContain("From: spaces@selva.agency");
    expect(mime).toContain("To: a@selva.agency");
    expect(mime).toContain('Content-Type: text/html; charset="UTF-8"');
    expect(mime).not.toContain("multipart/alternative");
  });

  it("html + texto viram multipart/alternative com as duas partes", () => {
    const mime = montarMime({ ...base, texto: "oi em texto" });
    expect(mime).toContain("multipart/alternative");
    expect(mime).toContain('Content-Type: text/plain; charset="UTF-8"');
    expect(mime).toContain('Content-Type: text/html; charset="UTF-8"');
    expect(mime).toContain("oi em texto");
    expect(mime).toContain("<p>oi</p>");
    // a fronteira precisa fechar, senão o cliente engole o resto da mensagem
    const b = mime.match(/boundary="([^"]+)"/)![1];
    expect(mime).toContain(`--${b}--`);
  });

  it("carrega Cc, Bcc e Reply-To quando existem", () => {
    const mime = montarMime({
      ...base, para: ["a@x.com", "b@x.com"], cc: "c@x.com", bcc: ["d@x.com"], replyTo: "r@x.com",
    });
    expect(mime).toContain("To: a@x.com, b@x.com");
    expect(mime).toContain("Cc: c@x.com");
    expect(mime).toContain("Bcc: d@x.com");
    expect(mime).toContain("Reply-To: r@x.com");
  });

  it("omite Cc/Bcc/Reply-To ausentes em vez de mandar cabeçalho vazio", () => {
    const mime = montarMime(base);
    expect(mime).not.toMatch(/^Cc:/m);
    expect(mime).not.toMatch(/^Bcc:/m);
    expect(mime).not.toMatch(/^Reply-To:/m);
  });

  it("usa CRLF — é o que a especificação de e-mail exige", () => {
    expect(montarMime(base)).toContain("\r\n");
  });
});

/**
 * O texto de erro do Google vai para DOIS lugares que uma pessoa lê: o log do
 * servidor e a coluna `erro` do email_send_log, exibida na tela do admin. Um
 * token de produção em texto puro ali é vazamento, não detalhe de formatação.
 */
describe("sanitização de erro", () => {
  it("redige Bearer token", () => {
    const s = sanitizarErroGmail('falhou com Authorization: Bearer ya29.a0AfH6SMBxxxxxxxxxxxx');
    expect(s).not.toContain("ya29.a0AfH6SMBxxxxxxxxxxxx");
    expect(s).toContain("[REDIGIDO]");
  });

  it("redige access_token e refresh_token em JSON", () => {
    const s = sanitizarErroGmail('{"access_token":"ya29.abcdefghijklmnop","refresh_token":"1//0gabcdefghijklmnop"}');
    expect(s).not.toContain("ya29.abcdefghijklmnop");
    expect(s).not.toContain("1//0gabcdefghijklmnop");
  });

  it("redige client_secret", () => {
    const s = sanitizarErroGmail('client_secret=GOCSPX-abcdef123456');
    expect(s).not.toContain("GOCSPX-abcdef123456");
  });

  it("preserva a parte útil da mensagem — sanitizar não é apagar", () => {
    const s = sanitizarErroGmail("Request had insufficient authentication scopes.");
    expect(s).toContain("insufficient authentication scopes");
  });

  it("limita o tamanho para não estourar a coluna de auditoria", () => {
    expect(sanitizarErroGmail("x".repeat(5000)).length).toBeLessThanOrEqual(500);
  });
});
