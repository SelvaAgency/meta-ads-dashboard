import { describe, it, expect } from "vitest";
import { comRetry5xx } from "./clarityService";

/**
 * O caso real de 22/07/2026: a API do Clarity respondeu 500 transitório às
 * 06:40 para dois projetos e 200 minutos depois, com os MESMOS tokens. Como o
 * cron roda uma vez por dia, o soluço custava o dia inteiro de dados.
 *
 * A regra: 5xx tenta de novo; 4xx nunca — token inválido não melhora esperando,
 * e insistir queimaria a cota de 10 chamadas/dia.
 */
const resposta = (status: number) => ({ status } as Response);

/** Devolve os status na ordem e conta quantas chamadas foram feitas. */
const sequencia = (...status: number[]) => {
  let i = 0;
  const fazer = async () => resposta(status[Math.min(i++, status.length - 1)]);
  return { fazer, chamadas: () => i };
};

const SEM_ESPERA = [0, 0] as const;

describe("retry do Clarity em 5xx", () => {
  it("o caso de 22/07: 500 transitório recupera na segunda tentativa", async () => {
    const s = sequencia(500, 200);
    const r = await comRetry5xx(s.fazer, SEM_ESPERA);
    expect(r.status).toBe(200);
    expect(s.chamadas()).toBe(2);
  });

  it("dois 500 seguidos ainda recuperam na terceira", async () => {
    const s = sequencia(500, 503, 200);
    const r = await comRetry5xx(s.fazer, SEM_ESPERA);
    expect(r.status).toBe(200);
    expect(s.chamadas()).toBe(3);
  });

  it("5xx persistente devolve o erro depois de esgotar — não fica em loop", async () => {
    const s = sequencia(500, 500, 500, 500);
    const r = await comRetry5xx(s.fazer, SEM_ESPERA);
    expect(r.status).toBe(500);
    expect(s.chamadas()).toBe(3); // 1 original + 2 tentativas, nunca mais
  });

  it("401 NÃO tenta de novo — token inválido não melhora esperando", async () => {
    const s = sequencia(401, 200);
    const r = await comRetry5xx(s.fazer, SEM_ESPERA);
    expect(r.status).toBe(401);
    expect(s.chamadas()).toBe(1);
  });

  it("403 e 429 também falham direto — 4xx nunca gasta cota com repetição", async () => {
    for (const st of [400, 403, 429]) {
      const s = sequencia(st, 200);
      expect((await comRetry5xx(s.fazer, SEM_ESPERA)).status).toBe(st);
      expect(s.chamadas()).toBe(1);
    }
  });

  it("200 de primeira não repete nada", async () => {
    const s = sequencia(200);
    expect((await comRetry5xx(s.fazer, SEM_ESPERA)).status).toBe(200);
    expect(s.chamadas()).toBe(1);
  });

  it("as esperas padrão são 2s e 6s — duas tentativas extras, não mais", async () => {
    // Garante que ninguém aumenta a lista sem pensar na cota de 10/dia.
    const { comRetry5xx: fn } = await import("./clarityService");
    const s = sequencia(200);
    await fn(s.fazer); // com esperas padrão, mas sem 5xx não dorme
    expect(s.chamadas()).toBe(1);
  });
});
