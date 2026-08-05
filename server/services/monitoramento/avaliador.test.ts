/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Avaliador — a decisão de acordar alguém, exercitada sem rede
 * ─────────────────────────────────────────────────────────────────────────────
 *  Todos os cenários abaixo rodam em milissegundos com leituras fabricadas.
 *  Testar isto contra sites reais exigiria um domínio de verdade caindo, o que
 *  é impossível de agendar — e é justamente por isso que o avaliador é puro.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, expect, it } from "vitest";
import { avaliar, maisGrave, mesmoConjunto, type EntradaAvaliacao } from "./avaliador";
import type { LeituraDns } from "./dnsCheck";
import type { LeituraRedirect } from "./redirectCheck";

const DNS_OK: LeituraDns = {
  dominio: "aikabodysoul.com", resolveu: true,
  ns: ["ns2.wixdns.net", "ns3.wixdns.net"], a: ["203.0.113.10"],
  falha: null, erroCodigo: null, emMs: 22, lidoEm: "2026-08-05T09:00:00.000Z",
};

const REDIRECT_OK: LeituraRedirect = {
  urlInicial: "https://aikabodysoul.com", ok: true, statusCode: 200,
  finalUrl: "https://www.aikabodysoul.com/", saltos: 1,
  cadeia: ["https://aikabodysoul.com", "https://www.aikabodysoul.com/"],
  canonical: "https://www.aikabodysoul.com/", tituloTrecho: "Aiká Body & Soul",
  erro: null, emMs: 410, lidoEm: "2026-08-05T09:00:00.000Z",
};

const base = (over: Partial<EntradaAvaliacao> = {}): EntradaAvaliacao => ({
  dominioEsperado: "aikabodysoul.com",
  dns: DNS_OK,
  redirect: REDIRECT_OK,
  nsBaseline: DNS_OK.ns,
  ...over,
});

const chaves = (e: EntradaAvaliacao) => avaliar(e).map((a) => a.chave);
const acharPor = (e: EntradaAvaliacao, chave: string) => avaliar(e).find((a) => a.chave === chave);

describe("tudo certo", () => {
  it("não inventa problema — devolve um único INFO", () => {
    const a = avaliar(base());
    expect(a).toHaveLength(1);
    expect(a[0].chave).toBe("ok");
    expect(a[0].sev).toBe("INFO");
  });

  /** www ↔ apex e http → https são rotina e não podem alertar. */
  it("www vs apex e http vs https não alertam", () => {
    expect(chaves(base({
      redirect: { ...REDIRECT_OK, urlInicial: "http://aikabodysoul.com", finalUrl: "https://www.aikabodysoul.com/" },
    }))).toEqual(["ok"]);
  });
});

describe("o incidente da Aiká", () => {
  it("redirect para outro domínio é CRITICAL e exige confirmação", () => {
    const a = acharPor(base({
      redirect: { ...REDIRECT_OK, finalUrl: "https://registro-suspenso.net/parking", cadeia: ["https://aikabodysoul.com", "https://registro-suspenso.net/parking"] },
    }), "dominio_divergente");
    expect(a?.sev).toBe("CRITICAL");
    expect(a?.exigeConfirmacao).toBe(true);
  });

  it("a evidência mostra o caminho, não só a conclusão", () => {
    const a = acharPor(base({
      redirect: { ...REDIRECT_OK, finalUrl: "https://registro-suspenso.net/", cadeia: ["https://aikabodysoul.com", "https://registro-suspenso.net/"] },
    }), "dominio_divergente");
    expect(a?.evidencia.esperado).toBe("aikabodysoul.com");
    expect(a?.evidencia.dominioFinal).toBe("registro-suspenso.net");
    expect(a?.evidencia.cadeia).toEqual(["https://aikabodysoul.com", "https://registro-suspenso.net/"]);
  });

  it("domínio sumido do DNS é CRITICAL e exige confirmação", () => {
    const a = acharPor(base({
      dns: { ...DNS_OK, resolveu: false, ns: [], a: [], falha: "nao_existe", erroCodigo: "ENOTFOUND" },
    }), "dns_nao_resolve");
    expect(a?.sev).toBe("CRITICAL");
    expect(a?.exigeConfirmacao).toBe(true);
    expect(a?.evidencia.erroCodigo).toBe("ENOTFOUND");
  });
});

describe("o que NÃO pode acordar ninguém", () => {
  /**
   * SERVFAIL/timeout pode ser a NOSSA rede. Tratar igual a NXDOMAIN
   * transformaria soluço de rede em alerta crítico às 3 da manhã.
   */
  it("falha temporária de DNS é WARNING, nunca CRITICAL", () => {
    const a = acharPor(base({
      dns: { ...DNS_OK, resolveu: false, ns: [], a: [], falha: "instavel", erroCodigo: "ETIMEOUT" },
    }), "dns_instavel");
    expect(a?.sev).toBe("WARNING");
    expect(a?.exigeConfirmacao).toBe(false);
  });

  it.each([401, 403])("HTTP %s é INFO — WAF barrando nosso verificador não é incidente", (status) => {
    const a = acharPor(base({ redirect: { ...REDIRECT_OK, statusCode: status } }), "verificacao_bloqueada");
    expect(a?.sev).toBe("INFO");
  });

  it("site sem resposta é WARNING — disponibilidade tem dono próprio", () => {
    const a = acharPor(base({
      redirect: { ...REDIRECT_OK, ok: false, statusCode: null, finalUrl: null, erro: "Sem resposta em 15s." },
    }), "site_sem_resposta");
    expect(a?.sev).toBe("WARNING");
  });

  it("SÓ achado CRITICAL exige confirmação", () => {
    const todos = [
      base({ dns: { ...DNS_OK, resolveu: false, ns: [], a: [], falha: "instavel", erroCodigo: "ETIMEOUT" } }),
      base({ redirect: { ...REDIRECT_OK, statusCode: 403 } }),
      base({ redirect: { ...REDIRECT_OK, saltos: 6 } }),
      base(),
    ].flatMap(avaliar);
    for (const a of todos) {
      expect(a.exigeConfirmacao).toBe(a.sev === "CRITICAL");
    }
  });
});

describe("nameservers", () => {
  it("primeira leitura APRENDE, não julga", () => {
    const a = acharPor(base({ nsBaseline: null }), "ns_baseline_aprendido");
    expect(a?.sev).toBe("INFO");
    expect(chaves(base({ nsBaseline: null }))).not.toContain("ns_mudou");
  });

  /** Trocar de hospedagem é rotina. Queremos alguém OLHANDO, não acordando. */
  it("mudança de NS é WARNING, não CRITICAL", () => {
    const a = acharPor(base({ nsBaseline: ["ns1.hostgator.com", "ns2.hostgator.com"] }), "ns_mudou");
    expect(a?.sev).toBe("WARNING");
    expect(a?.evidencia.antes).toEqual(["ns1.hostgator.com", "ns2.hostgator.com"]);
    expect(a?.evidencia.agora).toEqual(DNS_OK.ns);
  });

  it("ordem e caixa dos NS não geram alerta falso", () => {
    expect(chaves(base({ nsBaseline: ["NS3.WixDNS.net", "ns2.wixdns.net"] }))).toEqual(["ok"]);
    expect(mesmoConjunto(["a", "b"], ["B", "A"])).toBe(true);
    expect(mesmoConjunto(["a"], ["a", "b"])).toBe(false);
  });
});

describe("canonical e cadeia", () => {
  it("canonical apontando para fora é WARNING", () => {
    const a = acharPor(base({ redirect: { ...REDIRECT_OK, canonical: "https://spam-casino.xyz/" } }), "canonical_externo");
    expect(a?.sev).toBe("WARNING");
    expect(a?.evidencia.dominioCanonical).toBe("spam-casino.xyz");
  });

  it("canonical no mesmo domínio não alerta", () => {
    expect(chaves(base({ redirect: { ...REDIRECT_OK, canonical: "https://aikabodysoul.com/home" } }))).toEqual(["ok"]);
  });

  it("cadeia longa é WARNING mesmo chegando no destino certo", () => {
    const a = acharPor(base({ redirect: { ...REDIRECT_OK, saltos: 5 } }), "redirect_incomum");
    expect(a?.sev).toBe("WARNING");
  });
});

describe("configuração faltando", () => {
  it("sem domínio esperado, diz o que falta em vez de ficar mudo", () => {
    const a = avaliar(base({ dominioEsperado: "" }));
    expect(a).toHaveLength(1);
    expect(a[0].chave).toBe("sem_dominio_esperado");
    expect(a[0].sev).toBe("INFO");
  });

  it("sem leitura nenhuma não inventa problema", () => {
    expect(chaves(base({ dns: null, redirect: null }))).toEqual(["ok"]);
  });
});

describe("evidência é segura para exibir", () => {
  /** Conteúdo externo é hostil por definição: entra truncado, sempre. */
  it("título e URL gigantes são truncados", () => {
    const a = acharPor(base({
      redirect: {
        ...REDIRECT_OK,
        finalUrl: "https://mau.com/" + "x".repeat(5000),
        tituloTrecho: "T".repeat(5000),
        cadeia: Array.from({ length: 50 }, (_, i) => `https://salto${i}.com/` + "y".repeat(1000)),
      },
    }), "dominio_divergente");
    expect(String(a?.evidencia.finalUrl).length).toBeLessThanOrEqual(300);
    expect(String(a?.evidencia.titulo).length).toBeLessThanOrEqual(120);
    expect((a?.evidencia.cadeia as string[]).length).toBeLessThanOrEqual(8);
  });
});

describe("maisGrave", () => {
  it("um CRITICAL domina o ciclo", () => {
    expect(maisGrave(avaliar(base({
      dns: { ...DNS_OK, resolveu: false, ns: [], a: [], falha: "nao_existe", erroCodigo: "ENOTFOUND" },
    })))).toBe("CRITICAL");
  });

  it("só INFO devolve INFO", () => {
    expect(maisGrave(avaliar(base()))).toBe("INFO");
  });
});
