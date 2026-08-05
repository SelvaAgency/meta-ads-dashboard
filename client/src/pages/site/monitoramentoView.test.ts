/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  A frase que a aba mostra — exercitada sem montar React
 * ─────────────────────────────────────────────────────────────────────────────
 *  Esta é a diferença entre "está tudo bem" e "seu domínio está sendo
 *  sequestrado agora". A ordem das perguntas é a parte que precisa de prova: um
 *  estado crítico só é útil se PRECEDE tudo que a tela poderia dizer de calmo.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, expect, it } from "vitest";
import {
  resumoDeEstado, haQuantoTempo, checagensDoDia, anomaliasDoDia, linhasDaLeitura,
  estadoDoConteudo, type Painel,
} from "./monitoramentoView";

const AGORA = Date.parse("2026-08-05T14:00:00.000Z");

const painel = (over: Partial<Painel> = {}): Painel => ({
  configurado: true, ativo: true, dominioEsperado: "aikabodysoul.com",
  ultimaVerificacaoEm: "2026-08-05T13:58:00.000Z",
  suspeita: null, confirmacoesNecessarias: 2,
  hoje: {
    dns: { checagens: 120, anomalias: 0 },
    redirect: { checagens: 120, anomalias: 0 },
  },
  eventos: [],
  ...over,
});

const SUSPEITA = { chave: "dominio_divergente", titulo: "Site redireciona para outro domínio", ciclos: 1, desde: "2026-08-05T13:55:00.000Z", confirmada: false };

describe("a ordem das perguntas", () => {
  it("crítico confirmado vence tudo — mesmo com o dia inteiro limpo", () => {
    const r = resumoDeEstado(painel({ suspeita: { ...SUSPEITA, ciclos: 2, confirmada: true } }), AGORA);
    expect(r.tom).toBe("critico");
    expect(r.frase).toBe("Site redireciona para outro domínio");
    expect(r.detalhe).toContain("Alerta enviado");
  });

  /**
   * O intervalo entre ver e alertar é onde o robô mais pareceria parado — e com
   * varredura 2×/dia isso piorou: quem abrir a tela precisa saber que a
   * releitura vem em minutos, não na passada da tarde.
   *
   * E precisa dizer que nada foi alertado, senão alguém sai procurando um
   * e-mail que não foi enviado.
   */
  it("suspeita pendente aparece como atenção, dizendo que nada foi alertado", () => {
    const r = resumoDeEstado(painel({ suspeita: SUSPEITA }), AGORA);
    expect(r.tom).toBe("atencao");
    expect(r.frase).toContain("aguardando confirmação");
    expect(r.detalhe).toContain("1 de 2");
    expect(r.detalhe?.toLowerCase()).toContain("nada foi alertado ainda");
    expect(r.detalhe?.toLowerCase()).toContain("releitura");
  });

  it("ligado sem nenhuma leitura ainda não finge estar tudo bem", () => {
    const r = resumoDeEstado(painel({ ultimaVerificacaoEm: null }), AGORA);
    expect(r.tom).toBe("atencao");
    expect(r.frase).toContain("aguardando a primeira leitura");
  });

  it("tudo certo diz o domínio e quando foi a última olhada", () => {
    const r = resumoDeEstado(painel(), AGORA);
    expect(r.tom).toBe("ok");
    expect(r.frase).toContain("aikabodysoul.com");
    expect(r.detalhe).toContain("há 2 min");
  });

  it("anomalias do dia sem suspeita ativa mandam para o histórico", () => {
    const r = resumoDeEstado(painel({ hoje: { dns: { checagens: 120, anomalias: 3 }, redirect: null } }), AGORA);
    expect(r.tom).toBe("ok");
    expect(r.detalhe).toContain("3 leitura(s) com atenção hoje");
  });
});

describe("estados de desligado", () => {
  it("sem configuração", () => {
    expect(resumoDeEstado(painel({ configurado: false }), AGORA).tom).toBe("off");
  });

  it("sem domínio esperado diz o que falta, em vez de 'tudo bem'", () => {
    const r = resumoDeEstado(painel({ dominioEsperado: null }), AGORA);
    expect(r.tom).toBe("off");
    expect(r.frase).toContain("não tem contra o que comparar");
  });

  it("desligado mostra o domínio que está guardado", () => {
    const r = resumoDeEstado(painel({ ativo: false }), AGORA);
    expect(r.tom).toBe("off");
    expect(r.detalhe).toContain("aikabodysoul.com");
  });

  /** Desligado não pode herdar o alarme de uma suspeita antiga. */
  it("desligado não mostra crítico mesmo com suspeita guardada", () => {
    expect(resumoDeEstado(painel({ ativo: false, suspeita: { ...SUSPEITA, confirmada: true } }), AGORA).tom).toBe("off");
  });
});

describe("há quanto tempo", () => {
  it.each([
    ["2026-08-05T13:59:30.000Z", "agora há pouco"],
    ["2026-08-05T13:50:00.000Z", "há 10 min"],
    ["2026-08-05T11:00:00.000Z", "há 3h"],
    ["2026-08-03T14:00:00.000Z", "há 2d"],
  ])("%s → %s", (quando, esperado) => {
    expect(haQuantoTempo(quando, AGORA)).toBe(esperado);
  });

  it.each([[null], [undefined], ["não é data"]])("%s vira 'nunca', não NaN", (v) => {
    expect(haQuantoTempo(v as string, AGORA)).toBe("nunca");
  });

  it("aceita Date, que é o que o tRPC devolve para timestamp", () => {
    expect(haQuantoTempo(new Date("2026-08-05T13:50:00.000Z"), AGORA)).toBe("há 10 min");
  });
});

describe("contadores do dia", () => {
  it("somam os dois coletores", () => {
    expect(checagensDoDia(painel())).toBe(240);
    expect(anomaliasDoDia(painel({ hoje: { dns: { anomalias: 2 }, redirect: { anomalias: 1 } } }))).toBe(3);
  });

  it("coletor desligado não vira zero enganoso nem NaN", () => {
    expect(checagensDoDia(painel({ hoje: { dns: { checagens: 50 }, redirect: null } }))).toBe(50);
    expect(anomaliasDoDia(painel({ hoje: { dns: null, redirect: null } }))).toBe(0);
  });
});

describe("evidência da última leitura", () => {
  it("vira linhas legíveis, com rótulo em português", () => {
    const l = linhasDaLeitura({ ns: ["ns2.wixdns.net", "ns3.wixdns.net"], statusCode: 200, emMs: 129 });
    expect(l).toEqual([
      { rotulo: "Nameservers", valor: "ns2.wixdns.net → ns3.wixdns.net" },
      { rotulo: "Resposta HTTP", valor: "200" },
      { rotulo: "Tempo de resposta", valor: "129 ms" },
    ]);
  });

  it("campo sem rótulo declarado não aparece", () => {
    expect(linhasDaLeitura({ lidoEm: "2026-08-05T14:00:00.000Z", campoNovo: "x" })).toEqual([]);
  });

  it.each([[null], [undefined], [{}]])("leitura %s não quebra", (v) => {
    expect(linhasDaLeitura(v as Record<string, unknown>)).toEqual([]);
  });

  it("vazio, nulo e lista vazia são omitidos — não viram linha em branco", () => {
    expect(linhasDaLeitura({ ns: [], erro: "", canonical: null, statusCode: 200 }))
      .toEqual([{ rotulo: "Resposta HTTP", valor: "200" }]);
  });

  /** Conteúdo externo entra truncado, sempre. */
  it("valor gigante é truncado", () => {
    const l = linhasDaLeitura({ tituloTrecho: "T".repeat(5000) });
    expect(l[0].valor.length).toBeLessThanOrEqual(300);
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Bloco de conteúdo — "não verificado" não pode virar "ok"
 * ─────────────────────────────────────────────────────────────────────────────
 *  Zero posts lidos e zero posts suspeitos viram a mesma tela se ninguém
 *  perguntar primeiro se a leitura funcionou. É o erro que faria a aba dizer
 *  "tudo certo" todo dia com o blog cheio de spam — e sem nenhum sintoma.
 */
describe("estado do conteúdo", () => {
  const comConteudo = (m: unknown, over: Partial<Painel> = {}) =>
    painel({ checarConteudo: true, hoje: { dns: null, redirect: null, conteudo: m as never }, ...over });

  it("coletor desligado não mostra bloco nenhum", () => {
    expect(estadoDoConteudo(painel())).toBeNull();
  });

  it("ligado, mas sem leitura hoje, diz que ainda não leu", () => {
    const e = estadoDoConteudo(comConteudo(null));
    expect(e?.tom).toBe("off");
    expect(e?.frase).toContain("Ainda não houve leitura");
  });

  it("nenhuma fonte respondeu → ATENÇÃO, e diz que não é o mesmo que limpo", () => {
    const e = estadoDoConteudo(comConteudo({
      checagens: 4, anomalias: 4, ultima: { fonte: "nenhuma", posts: 0 },
      achados: [{ chave: "conteudo_nao_verificado", sev: "WARNING", titulo: "x" }],
    }));
    expect(e?.tom).not.toBe("ok");
    expect(e?.tom).toBe("atencao");
    expect(e?.fonte).toBe("não verificado");
    expect(e?.frase).toContain("não é o mesmo que estar limpo");
  });

  it("leitura boa e blog limpo → ok, dizendo a fonte usada", () => {
    const e = estadoDoConteudo(comConteudo({
      checagens: 12, anomalias: 0, ultima: { fonte: "rest", posts: 20, novos: 1 }, achados: [],
    }));
    expect(e?.tom).toBe("ok");
    expect(e?.fonte).toBe("REST API do WordPress");
    expect(e?.posts).toBe(20);
    expect(e?.novos).toBe(1);
  });

  it.each([
    ["rss", "Feed RSS"], ["sitemap", "Sitemap"], ["html", "HTML da página"],
  ])("fallback %s aparece com nome legível", (fonte, rotulo) => {
    const e = estadoDoConteudo(comConteudo({ ultima: { fonte, posts: 5 }, achados: [] }));
    expect(e?.fonte).toBe(rotulo);
  });

  it("spam → crítico e conta os suspeitos", () => {
    const e = estadoDoConteudo(comConteudo({
      ultima: { fonte: "rest", posts: 20 },
      achados: [{ chave: "conteudo_spam", sev: "CRITICAL", titulo: "x" }],
    }));
    expect(e?.tom).toBe("critico");
    expect(e?.suspeitos).toBe(1);
  });

  it("sinal fraco → atenção, não crítico", () => {
    const e = estadoDoConteudo(comConteudo({
      ultima: { fonte: "rest", posts: 20 },
      achados: [{ chave: "conteudo_suspeito", sev: "WARNING", titulo: "x" }],
    }));
    expect(e?.tom).toBe("atencao");
  });

  it("contadores do dia somam os três coletores", () => {
    const p = painel({ hoje: {
      dns: { checagens: 100, anomalias: 1 },
      redirect: { checagens: 100, anomalias: 0 },
      conteudo: { checagens: 16, anomalias: 2 },
    } });
    expect(checagensDoDia(p)).toBe(216);
    expect(anomaliasDoDia(p)).toBe(3);
  });
});
