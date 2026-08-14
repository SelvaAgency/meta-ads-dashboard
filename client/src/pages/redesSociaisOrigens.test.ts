describe("nenhum dado de mídia paga entra na página", () => {
  /**
   * O objeto `pago` continua vindo do servidor — outras telas o usam, e mexer
   * no `painel` por causa desta página seria pagar caro por uma limpeza visual.
   * O que não pode é a página LER dele.
   */
  it("a página não lê `pago` em lugar nenhum", () => {
    const linhas = semComentarios(pagina()).split("\n").filter((l) => /\bpago\b/.test(l));
    expect(linhas, `a página voltou a ler mídia paga:\n${linhas.join("\n")}`).toEqual([]);
  });

  /** Os termos que só existem em campanha. Nenhum deles pertence a esta tela. */
  it("nenhum vocabulário de campanha sobrou", () => {
    const texto = semComentarios(pagina());
    for (const termo of ["investimento", "ROAS", "roas", "CPA", "cpc", "conversoes", "valorDeConversao"]) {
      expect(texto, `"${termo}" voltou para a página Social`).not.toContain(termo);
    }
  });

  /** Se o rodapé parar de dizer onde os números de campanha moram, alguém vai
      procurá-los aqui — e a ausência vai parecer perda de funcionalidade. */
  it("a página diz para onde foram os números de campanha", () => {
    expect(pagina()).toContain("Mídia");
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  A página Social é orgânica — e agora isso é estrutural
 * ─────────────────────────────────────────────────────────────────────────────
 *  A página antiga saiu do ar por duas razões, e esta é a que não deixa rastro
 *  no compilador: ela mostrava número de CAMPANHA e número de PERFIL na mesma
 *  superfície, sob rótulos que não diziam qual era qual. Quem lia via "alcance"
 *  e supunha orgânico.
 *
 *  A primeira defesa foi separar os blocos e exigir que cada um lesse de um
 *  objeto só. A defesa ATUAL é mais forte e mais simples: a seção de mídia paga
 *  saiu da página inteira. Não há fronteira a atravessar porque não há o outro
 *  lado — os números de campanha vivem em Mídia.
 *
 *  Um teste de fronteira, hoje, guardaria uma fronteira que não existe. Estes
 *  guardam a ausência: se `pago` voltar a ser lido aqui, o problema antigo volta
 *  junto, e ele é do tipo que ninguém reporta — o número aparece plausível.
 *
 *  A outra razão da morte era `accounts[0].accessToken` — o token de mídia de
 *  uma conta arbitrária como credencial de todo o Instagram. Ele também é
 *  guardado aqui.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const semComentarios = (t: string) =>
  t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\/[^\n]*/g, "");

const pagina = () => readFileSync(new URL("./RedesSociais.tsx", import.meta.url), "utf-8");

describe("o que matou a página antiga não voltou", () => {
  it("nada de accounts[0].accessToken", () => {
    expect(semComentarios(pagina())).not.toContain("accessToken");
  });

  /** As quatro procedures do router `socialNetworks` foram removidas. */
  it("nenhuma procedure do router morto é chamada", () => {
    const s = semComentarios(pagina());
    expect(s).not.toContain("socialNetworks.");
    expect(s).not.toContain("PaidMetricsSection");
  });

  it("a página lê pela procedure nova, que resolve a fonte", () => {
    expect(semComentarios(pagina())).toContain("trpc.social.painel.useQuery");
  });
});

describe("permissão e escrita", () => {
  it("a página é restrita a admin/dev", () => {
    const s = semComentarios(pagina());
    expect(s).toContain("canManageContent");
    expect(s).toContain("SemAcessoTracker");
  });

  /**
   * Olhar e configurar são coisas diferentes; juntá-las foi o que tornou a
   * página antiga confusa. Token, vínculo e diagnóstico moram em Conexões.
   */
  it("a página não escreve nada — nenhuma mutation", () => {
    expect(semComentarios(pagina())).not.toContain("useMutation");
  });

  it("e manda para Conexões quando falta configuração", () => {
    expect(semComentarios(pagina())).toContain("/settings?painel=conexoes");
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  A tela não pode reimplementar as regras que já são puras
 * ─────────────────────────────────────────────────────────────────────────────
 *  Escrevi, ao montar o módulo de destaques, um ternário local para classificar
 *  publicação: `mediaType === "VIDEO" ? "REELS" : "FEED"`. É exatamente o bug
 *  que `shared/tipoDeMidia` existe para impedir — vídeo antigo de feed vira reel
 *  e infla a métrica mais olhada. Foi pego na revisão, não pelo compilador, e
 *  não seria pego pelos testes de `tipoDeMidia`, porque a tela não os usava.
 *
 *  A defesa: a página tem que CHAMAR as funções puras, não recriá-las.
 * ─────────────────────────────────────────────────────────────────────────────
 */
describe("as decisões vêm das funções puras, não de ternários locais", () => {
  const semC = (t: string) =>
    t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\/[^\n]*/g, "");

  /**
   * A classificação MUDOU DE LUGAR, não sumiu: o coletor grava `tipo` já
   * classificado por `tipoDeConteudo`, e a tela lê o campo. Exigir a chamada
   * aqui obrigaria a reclassificar o que já veio classificado.
   *
   * O que continua valendo é a proibição, e ela é a parte que pega o erro: uma
   * comparação solta com o valor cru da Meta recriaria o bug que a função pura
   * existe para impedir — VIDEO+FEED é publicação antiga de feed, não reel.
   */
  it("nenhuma comparação solta com os valores crus da Meta", () => {
    expect(semC(pagina())).not.toMatch(/mediaType\s*===\s*"(VIDEO|CAROUSEL_ALBUM|IMAGE)"/);
  });

  /**
   * A taxa por SEGUIDORES saiu com o seletor de dois eixos: o redesenho usa
   * alcance como divisor único. O que o teste guarda é o que sempre importou —
   * que a taxa venha da função pura, e não de uma divisão escrita na tela.
   *
   * A divisão local é o erro perigoso aqui: ela não trata alcance zero, e
   * produziria `Infinity` ou `NaN` num post sem medição — que apareceria no
   * ranking como o melhor de todos.
   */
  it("toda taxa de engajamento sai de taxaPorAlcance", () => {
    const s = semC(pagina());
    expect(s).toContain("taxaPorAlcance(");
    // Nenhuma divisão manual por alcance.
    expect(s).not.toMatch(/\/\s*\w*[Aa]lcance\w*\s*\)?\s*\*\s*100/);
    expect(s).not.toMatch(/\/\s*m\.reach\s*\)?\s*\*\s*100/);
  });

  /**
   * A função mudou de nome porque o escopo cresceu: `movimentoDaBase` devolve
   * saldo, entradas e saídas de uma vez, e é ela que sabe quando a derivação
   * NÃO se sustenta. O que o teste guarda é o mesmo de sempre — nenhuma dessas
   * contas escrita na tela.
   */
  it("saldo e movimento saem de movimentoDaBase, e não de subtração local", () => {
    const s = semC(pagina());
    expect(s).toContain("movimentoDaBase(");
    // Nenhuma subtração de seguidores na tela.
    expect(s).not.toMatch(/seguidores\s*-\s*\w*seguidores/);
  });

  /** A trava do pedido: nada de "novos" e "saídas" sem prova aritmética. */
  /**
   * Entradas e saídas deixaram de depender do breakdown não provado: elas vêm
   * de `follower_count` e de uma identidade aritmética, e `movimentoDaBase`
   * devolve `null` quando a conta não fecha. O guarda agora é sobre isso — a
   * tela não pode inventar os números que a função se recusou a dar.
   */
  it("entradas e saídas só aparecem quando movimentoDaBase as devolve", () => {
    const s = semC(pagina());
    expect(s).toContain("movimento.entradas");
    expect(s).toContain("movimento.saidas");
    // A proibição original continua, e agora escrita pelo que ela realmente
    // protege: o BREAKDOWN não provado não pode virar entrada nem saída. A
    // derivação nova não passa nem perto dele.
    expect(s).not.toContain("breakdownCru");
    expect(s).not.toContain("FOLLOWER");
    expect(s).not.toContain("deixaram de seguir");
    // Nenhuma aritmética de entradas/saídas escrita na tela.
    expect(s).not.toMatch(/entradas\s*[-+]\s*\w/);
  });

  it("o período honesto vem de textoDeCobertura", () => {
    expect(semC(pagina())).toContain("textoDeCobertura(");
  });
});
