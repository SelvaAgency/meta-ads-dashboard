/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Separação por coletor — o contador de anomalias tem que ser honesto
 * ─────────────────────────────────────────────────────────────────────────────
 *  O ciclo grava DOIS snapshots por cliente (DNS e redirect), cada um com o
 *  próprio contador de anomalias do dia. Se a divisão dos achados errar, uma
 *  falha de DNS conta como anomalia também no snapshot de redirect — e a tela
 *  mostra dois problemas onde existe um.
 *
 *  O teste de deriva no fim é o que importa mais: ele varre os achados que o
 *  AVALIADOR realmente produz hoje e cobra que cada um tenha coletor declarado.
 *  Sem ele, um achado novo no passo 7 cairia num lado por acidente, em silêncio.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, expect, it } from "vitest";
import { achadosDe } from "./cicloMonitoramento";
import { avaliar, type Achado, type EntradaAvaliacao } from "./avaliador";
import type { LeituraDns } from "./dnsCheck";
import type { LeituraRedirect } from "./redirectCheck";

const ach = (chave: string): Achado =>
  ({ chave, sev: "WARNING", titulo: chave, detalhe: "", exigeConfirmacao: false, evidencia: {} });

describe("divisão dos achados entre os coletores", () => {
  it("achado de DNS não entra no snapshot de redirect", () => {
    const todos = [ach("dns_nao_resolve"), ach("ns_mudou")];
    expect(achadosDe("dns", todos).map((a) => a.chave)).toEqual(["dns_nao_resolve", "ns_mudou"]);
    expect(achadosDe("redirect", todos)).toEqual([]);
  });

  it("achado de redirect não entra no snapshot de DNS", () => {
    const todos = [ach("dominio_divergente"), ach("canonical_externo")];
    expect(achadosDe("redirect", todos)).toHaveLength(2);
    expect(achadosDe("dns", todos)).toEqual([]);
  });

  /** "ok" e "sem_dominio_esperado" não são de coletor nenhum: valem para os dois. */
  it.each(["ok", "sem_dominio_esperado"])("'%s' aparece nos dois lados", (chave) => {
    const todos = [ach(chave)];
    expect(achadosDe("dns", todos)).toHaveLength(1);
    expect(achadosDe("redirect", todos)).toHaveLength(1);
  });

  it("um incidente misto separa cada achado no seu lado", () => {
    const todos = [ach("ns_mudou"), ach("dominio_divergente")];
    expect(achadosDe("dns", todos).map((a) => a.chave)).toEqual(["ns_mudou"]);
    expect(achadosDe("redirect", todos).map((a) => a.chave)).toEqual(["dominio_divergente"]);
  });
});

/**
 * Guarda de deriva: exercita o avaliador em todos os cenários que ele cobre
 * hoje, junta as chaves que saem e cobra que cada uma esteja atribuída a um
 * coletor. Um achado novo sem coletor cai para um lado por acidente — e o
 * contador do dia passa a mentir sem nenhum sintoma visível.
 */
describe("nenhum achado fica sem coletor", () => {
  const DNS_OK: LeituraDns = {
    dominio: "x.com", resolveu: true, ns: ["a.ns"], a: ["203.0.113.1"],
    falha: null, erroCodigo: null, emMs: 10, lidoEm: "2026-08-05T09:00:00.000Z",
  };
  const RED_OK: LeituraRedirect = {
    urlInicial: "https://x.com", ok: true, statusCode: 200, finalUrl: "https://x.com/",
    saltos: 0, cadeia: ["https://x.com/"], canonical: "https://x.com/", tituloTrecho: "X",
    erro: null, emMs: 100, lidoEm: "2026-08-05T09:00:00.000Z",
  };
  const cenario = (over: Partial<EntradaAvaliacao>): EntradaAvaliacao =>
    ({ dominioEsperado: "x.com", dns: DNS_OK, redirect: RED_OK, nsBaseline: DNS_OK.ns, ...over });

  const TODOS_OS_CENARIOS: EntradaAvaliacao[] = [
    cenario({}),
    cenario({ dominioEsperado: "" }),
    cenario({ nsBaseline: null }),
    cenario({ nsBaseline: ["outro.ns"] }),
    cenario({ dns: { ...DNS_OK, resolveu: false, ns: [], a: [], falha: "nao_existe", erroCodigo: "ENOTFOUND" } }),
    cenario({ dns: { ...DNS_OK, resolveu: false, ns: [], a: [], falha: "instavel", erroCodigo: "ETIMEOUT" } }),
    cenario({ redirect: { ...RED_OK, ok: false, statusCode: null, finalUrl: null, erro: "timeout" } }),
    cenario({ redirect: { ...RED_OK, statusCode: 403 } }),
    cenario({ redirect: { ...RED_OK, finalUrl: "https://outro.net/" } }),
    cenario({ redirect: { ...RED_OK, saltos: 9 } }),
    cenario({ redirect: { ...RED_OK, canonical: "https://spam.xyz/" } }),
  ];

  it("todo achado produzido pelo avaliador cai em exatamente um lado (ou nos dois, se for geral)", () => {
    const chaves = new Set(TODOS_OS_CENARIOS.flatMap(avaliar).map((a) => a.chave));
    expect(chaves.size).toBeGreaterThanOrEqual(10); // os cenários realmente cobrem

    const GERAIS = new Set(["ok", "sem_dominio_esperado"]);
    for (const chave of chaves) {
      const noDns = achadosDe("dns", [ach(chave)]).length;
      const noRedirect = achadosDe("redirect", [ach(chave)]).length;
      if (GERAIS.has(chave)) {
        expect(noDns + noRedirect, `${chave} deveria valer para os dois`).toBe(2);
      } else {
        expect(noDns + noRedirect, `${chave} não tem coletor declarado em ORIGEM`).toBe(1);
      }
    }
  });
});
