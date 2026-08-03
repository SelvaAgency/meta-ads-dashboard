/**
 * Teste controlado do Gmail — a trava do "UM destinatário".
 *
 * Este é o ÚNICO caminho de envio que não passa pela trava mestre
 * (EMAIL_AUTOMATION_ENABLED), porque só assim dá para provar que o Gmail
 * funciona ANTES de religar a automação. O preço disso é que a regra "um
 * endereço, digitado na hora" precisa ser verificada, não presumida: um
 * "a@x.com, b@x.com" que passasse viraria disparo em lista por um caminho sem
 * trava mestre.
 */
import { describe, expect, it } from "vitest";
import { ehDestinatarioUnicoValido, ASSUNTO_TESTE, TIPO_TESTE_GMAIL } from "./gmailTeste";

describe("destinatário único do teste Gmail", () => {
  it("aceita um endereço simples", () => {
    expect(ehDestinatarioUnicoValido("felberg@selva.agency")).toBe(true);
    expect(ehDestinatarioUnicoValido("  felberg@selva.agency  ")).toBe(true); // espaço nas pontas é do teclado
  });

  it.each([
    ["vírgula", "a@x.com,b@y.com"],
    ["vírgula com espaço", "a@x.com, b@y.com"],
    ["ponto-e-vírgula", "a@x.com;b@y.com"],
    ["espaço no meio", "a@x.com b@y.com"],
  ])("RECUSA lista por %s — sem trava mestre, um laço aqui seria disparo em massa", (_n, valor) => {
    expect(ehDestinatarioUnicoValido(valor)).toBe(false);
  });

  it.each([
    ["vazio", ""],
    ["só espaços", "   "],
    ["sem @", "felberg.selva.agency"],
    ["sem domínio", "felberg@"],
    ["sem ponto no domínio", "felberg@selva"],
    ["dois @", "a@b@c.com"],
  ])("recusa entrada inválida: %s", (_n, valor) => {
    expect(ehDestinatarioUnicoValido(valor)).toBe(false);
  });
});

describe("identidade do teste", () => {
  it("tem rótulo próprio na auditoria, separado do envio real", () => {
    expect(TIPO_TESTE_GMAIL).toBe("GMAIL_TEST");
  });

  it("usa o assunto combinado", () => {
    expect(ASSUNTO_TESTE).toBe("Teste Gmail API — SELVA Spaces");
  });
});
