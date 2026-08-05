/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Separação por coletor — o contador de anomalias tem que ser honesto
 * ─────────────────────────────────────────────────────────────────────────────
 *  O ciclo grava TRÊS snapshots por cliente (DNS, destino e conteúdo), cada um
 *  com o próprio contador de anomalias do dia. Se a divisão dos achados errar,
 *  uma falha de DNS conta como anomalia também no snapshot de destino — e a
 *  tela mostra dois problemas onde existe um.
 *
 *  O teste de deriva no fim é o que importa mais: ele varre os achados que o
 *  AVALIADOR realmente produz hoje e cobra que cada um tenha coletor declarado.
 *  Ele já provou o valor: os sete achados de conteúdo do passo 7 teriam caído
 *  num lado por acidente, em silêncio, se ninguém os declarasse em ORIGEM.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, expect, it } from "vitest";
import { achadosDe, conteudoJaRodouNoDia } from "./cicloMonitoramento";
import { avaliar, type Achado, type EntradaAvaliacao } from "./avaliador";
import type { LeituraConteudo } from "./conteudoCheck";
import { termosDoCliente } from "./termosSuspeitos";
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
  it.each(["ok", "sem_dominio_esperado"])("'%s' aparece em todos os lados", (chave) => {
    const todos = [ach(chave)];
    expect(achadosDe("dns", todos)).toHaveLength(1);
    expect(achadosDe("redirect", todos)).toHaveLength(1);
    expect(achadosDe("conteudo", todos)).toHaveLength(1);
  });

  it("um incidente misto separa cada achado no seu lado", () => {
    const todos = [ach("ns_mudou"), ach("dominio_divergente"), ach("conteudo_spam")];
    expect(achadosDe("dns", todos).map((a) => a.chave)).toEqual(["ns_mudou"]);
    expect(achadosDe("redirect", todos).map((a) => a.chave)).toEqual(["dominio_divergente"]);
    expect(achadosDe("conteudo", todos).map((a) => a.chave)).toEqual(["conteudo_spam"]);
  });

  it("achado de conteúdo não polui o contador de DNS nem o de destino", () => {
    const todos = [ach("conteudo_spam"), ach("conteudo_nao_verificado")];
    expect(achadosDe("dns", todos)).toEqual([]);
    expect(achadosDe("redirect", todos)).toEqual([]);
    expect(achadosDe("conteudo", todos)).toHaveLength(2);
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
  const TERMOS = termosDoCliente();
  const BASE_CONT = { ids: ["p1"], autores: ["Redação"], categorias: ["Moda"] };
  const postar = (id: string, titulo: string, over: Record<string, unknown> = {}) =>
    ({ id, url: `https://x.com/${id}`, titulo, data: null, autor: "Redação", categorias: ["Moda"], resumo: "", ...over });
  const conteudoBase: LeituraConteudo = {
    fonte: "rest", ok: true, posts: [], tentativas: [], erro: null, emMs: 10, lidoEm: "2026-08-05T09:00:00.000Z",
  };
  const CONT_OK: LeituraConteudo = { ...conteudoBase, posts: [postar("p1", "Tricô")] };
  const CONT_SPAM: LeituraConteudo = { ...conteudoBase, posts: [postar("p9", "Melhores cassinos online", { autor: "admin2", categorias: ["Bets"] })] };
  const CONT_FRACO: LeituraConteudo = { ...conteudoBase, posts: [postar("p1", "Nota", { resumo: "perto de um casino" })] };
  const CONT_RAJADA: LeituraConteudo = { ...conteudoBase, posts: Array.from({ length: 9 }, (_, i) => postar(`n${i}`, "Post")) };
  const CONT_FALHOU: LeituraConteudo = { ...conteudoBase, ok: false, fonte: "nenhuma", erro: "nada respondeu" };

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
    // Conteúdo — os mesmos cenários que o avaliador de blog cobre.
    cenario({ conteudo: { conteudo: CONT_OK, baseline: null, termos: TERMOS } }),
    cenario({ conteudo: { conteudo: CONT_OK, baseline: BASE_CONT, termos: TERMOS } }),
    cenario({ conteudo: { conteudo: CONT_SPAM, baseline: BASE_CONT, termos: TERMOS } }),
    cenario({ conteudo: { conteudo: CONT_FRACO, baseline: BASE_CONT, termos: TERMOS } }),
    cenario({ conteudo: { conteudo: CONT_RAJADA, baseline: BASE_CONT, termos: TERMOS } }),
    cenario({ conteudo: { conteudo: CONT_FALHOU, baseline: BASE_CONT, termos: TERMOS } }),
  ];

  it("todo achado produzido pelo avaliador cai em exatamente um lado (ou nos dois, se for geral)", () => {
    const chaves = new Set(TODOS_OS_CENARIOS.flatMap(avaliar).map((a) => a.chave));
    expect(chaves.size).toBeGreaterThanOrEqual(16); // os cenários realmente cobrem

    const GERAIS = new Set(["ok", "sem_dominio_esperado"]);
    for (const chave of chaves) {
      const total = (["dns", "redirect", "conteudo"] as const)
        .reduce((n, o) => n + achadosDe(o, [ach(chave)]).length, 0);
      if (GERAIS.has(chave)) {
        expect(total, `${chave} deveria valer para todos os coletores`).toBe(3);
      } else {
        expect(total, `${chave} não tem coletor declarado em ORIGEM`).toBe(1);
      }
    }
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Conteúdo 1× por dia — no fuso da AGÊNCIA
 * ─────────────────────────────────────────────────────────────────────────────
 *  Errar o fuso aqui não quebra nada visivelmente: o blog simplesmente não é
 *  lido, e a tela mostra a leitura de ontem como se fosse a de hoje. Uma leitura
 *  das 22h de Brasília é 01h do dia seguinte em UTC — comparando em UTC, a
 *  passada da manhã concluiria que "já rodou hoje" e o blog passaria o dia
 *  inteiro sem verificação.
 * ─────────────────────────────────────────────────────────────────────────────
 */
describe("porta diária do conteúdo", () => {
  it("nunca lido → precisa ler", () => {
    expect(conteudoJaRodouNoDia(null, "2026-08-05")).toBe(false);
    expect(conteudoJaRodouNoDia(undefined, "2026-08-05")).toBe(false);
  });

  it("lido hoje de manhã → a passada da tarde pula", () => {
    // 08:00 BRT = 11:00 UTC
    expect(conteudoJaRodouNoDia("2026-08-05T11:00:00.000Z", "2026-08-05")).toBe(true);
  });

  it("lido ontem → precisa ler de novo", () => {
    expect(conteudoJaRodouNoDia("2026-08-04T11:00:00.000Z", "2026-08-05")).toBe(false);
  });

  /** O caso que o fuso errado esconderia. */
  it("leitura das 22h BRT não bloqueia a manhã seguinte", () => {
    // 22:00 BRT do dia 4 = 01:00 UTC do dia 5. Em UTC pareceria "dia 5".
    const em = "2026-08-05T01:00:00.000Z";
    expect(conteudoJaRodouNoDia(em, "2026-08-04")).toBe(true);  // é o dia 4 no Brasil
    expect(conteudoJaRodouNoDia(em, "2026-08-05")).toBe(false); // logo, dia 5 ainda não leu
  });

  it("aceita Date, que é o que o driver devolve para timestamp", () => {
    expect(conteudoJaRodouNoDia(new Date("2026-08-05T11:00:00.000Z"), "2026-08-05")).toBe(true);
  });

  it("valor inválido não bloqueia a leitura — na dúvida, verifica", () => {
    expect(conteudoJaRodouNoDia("não é data", "2026-08-05")).toBe(false);
  });
});
