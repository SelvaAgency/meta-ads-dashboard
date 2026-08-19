/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Consumo de IA — as leituras, e os limiares que decidem o que é notícia
 * ─────────────────────────────────────────────────────────────────────────────
 *  Puro: sem rede, sem banco, sem relógio. Recebe as linhas já agregadas pelo
 *  servidor e decide o que a tela pode afirmar.
 *
 *  ── Três coisas diferentes que viram o mesmo alarme se ninguém separar ─────
 *  VOLUME      fez-se mais chamadas. Pode ser crescimento legítimo.
 *  EFICIÊNCIA  cada chamada custa mais que a média. É onde se otimiza.
 *  ANOMALIA    hoje destoa do comportamento recente. É onde se investiga.
 *  FALHA       chamadas que não voltaram. Custam e não entregam.
 *
 *  Colapsar as quatro produz a tela que fica amarela para sempre — e uma tela
 *  sempre amarela é uma tela que ninguém lê. Mais tokens NÃO é problema por si:
 *  uma funcionalidade nova consome mais porque existe.
 *
 *  ── Os limiares são constantes NOMEADAS ────────────────────────────────────
 *  Todos moram em `LIMIARES`, com a razão de cada um escrita ao lado. Ajustar o
 *  comportamento da página é mudar um número aqui — não reestruturar a tela.
 *
 *  ── E todo alerta carrega o número que o disparou ──────────────────────────
 *  "Consumo acima do padrão" sem o número é uma opinião. Com "82 chamadas
 *  contra média de 41", quem lê confere sozinho e decide se concorda.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type TipoDeAlerta = "volume" | "eficiencia" | "anomalia" | "falha";

export interface AlertaDeConsumo {
  tipo: TipoDeAlerta;
  titulo: string;
  /** A frase com o NÚMERO que disparou. Nunca um adjetivo solto. */
  detalhe: string;
  /** Para a tela poder levar ao bloco certo. */
  origem?: string;
  accountId?: number | null;
}

/**
 * Os limiares, e por que cada um está onde está.
 *
 * Deliberadamente altos. O custo de um alerta a menos é alguém descobrir um dia
 * depois; o custo de um alerta a mais, repetido, é a tela inteira perder
 * credibilidade — e aí nem o alerta certo é lido.
 */
export const LIMIARES = {
  /**
   * Quantas vezes a média recente o dia precisa ser para virar anomalia.
   *
   * 1,6 e não 1,2: consumo diário oscila com quantos clientes foram
   * sincronizados e quantos relatórios venceram. Abaixo disso é rotina.
   */
  anomaliaDoDia: 1.6,
  /** Dias de histórico mínimos para comparar "hoje" com "o normal". */
  diasParaComparar: 3,
  /*
   * ── Concentração NÃO virou alerta, e o motivo importa ────────────────────
   * Ela existia aqui como limiar e disparava na "semana de rotina" do teste —
   * porque o cron diário roda para TODA conta e vai dominar os tokens sempre.
   * Um alerta que nunca cala é um alerta que ninguém lê, e aí nem o alerta certo
   * é visto.
   *
   * A informação não se perdeu: o bloco "por origem" mostra a fatia de cada uma,
   * ordenada, com % do total. Quem quer saber onde está o consumo lê ali, de
   * relance. O que saiu foi o AVISO permanente sobre um fato conhecido.
   */
  /**
   * Quantas vezes a média de tokens/chamada uma origem precisa gastar para ser
   * apontada como cara. É o número que separa "usada muito" de "cara por vez".
   */
  ineficienciaDaOrigem: 2,
  /** Chamadas mínimas para julgar a eficiência de uma origem. */
  chamadasParaJulgarEficiencia: 5,
  /** Fração de falhas que vira alerta. Acima disso não é ruído de rede. */
  falhas: 0.05,
  /** Chamadas mínimas no período para a taxa de falha significar algo. */
  chamadasParaJulgarFalhas: 20,
  /**
   * Quantas vezes a MEDIANA o cliente precisa consumir para destoar.
   *
   * Mediana, e não média — e a diferença aqui não é de gosto, é aritmética. Um
   * cliente entra na própria média e a puxa para cima: com 3 contas, ser "3× a
   * média" exige que as outras duas somem zero. O alerta seria inalcançável, e
   * ninguém perceberia, porque um alerta que nunca dispara parece um sistema
   * calmo. A mediana ignora o próprio outlier, que é o que se quer de uma régua.
   */
  clienteForaDoPadrao: 3,
  /** Clientes mínimos para existir uma "média das contas". */
  clientesParaComparar: 3,
} as const;

// ─── As formas que o servidor entrega ────────────────────────────────────────

export interface LinhaPorOrigem {
  origem: string;
  chamadas: number;
  falhas: number;
  tokensEntrada: number;
  tokensSaida: number;
  duracaoMediaMs: number;
}

export interface LinhaPorDia {
  dia: string;
  chamadas: number;
  falhas: number;
  tokensEntrada: number;
  tokensSaida: number;
}

export interface LinhaPorCliente {
  accountId: number | null;
  nome: string | null;
  chamadas: number;
  tokensEntrada: number;
  tokensSaida: number;
}

export interface DadosDeConsumo {
  porOrigem: LinhaPorOrigem[];
  porDia: LinhaPorDia[];
  porCliente: LinhaPorCliente[];
  /** O primeiro registro que existe — a página não finge histórico. */
  medindoDesde: string | null;
}

// ─── Derivações ──────────────────────────────────────────────────────────────

export const tokensDe = (x: { tokensEntrada: number; tokensSaida: number }) =>
  Number(x.tokensEntrada ?? 0) + Number(x.tokensSaida ?? 0);

export interface TotaisDoPeriodo {
  chamadas: number;
  falhas: number;
  tokensEntrada: number;
  tokensSaida: number;
  tokensTotais: number;
  /** `null` sem chamada: 0% de falha em 0 chamadas é afirmação sobre o nada. */
  taxaDeFalha: number | null;
  tokensPorChamada: number | null;
  duracaoMediaMs: number | null;
  /** Fatia dos tokens que é entrada. Diz se o custo está no prompt ou na resposta. */
  fracaoDeEntrada: number | null;
}

export function totaisDoPeriodo(porOrigem: LinhaPorOrigem[]): TotaisDoPeriodo {
  const chamadas = porOrigem.reduce((n, o) => n + Number(o.chamadas ?? 0), 0);
  const falhas = porOrigem.reduce((n, o) => n + Number(o.falhas ?? 0), 0);
  const tokensEntrada = porOrigem.reduce((n, o) => n + Number(o.tokensEntrada ?? 0), 0);
  const tokensSaida = porOrigem.reduce((n, o) => n + Number(o.tokensSaida ?? 0), 0);
  const tokensTotais = tokensEntrada + tokensSaida;

  // Média ponderada pelas chamadas: a simples daria peso igual a uma origem de
  // 200 chamadas e a uma de 2, e o número deixaria de descrever o sistema.
  const somaDuracao = porOrigem.reduce(
    (n, o) => n + Number(o.duracaoMediaMs ?? 0) * Number(o.chamadas ?? 0), 0);

  return {
    chamadas, falhas, tokensEntrada, tokensSaida, tokensTotais,
    taxaDeFalha: chamadas > 0 ? falhas / chamadas : null,
    tokensPorChamada: chamadas > 0 ? tokensTotais / chamadas : null,
    duracaoMediaMs: chamadas > 0 ? somaDuracao / chamadas : null,
    fracaoDeEntrada: tokensTotais > 0 ? tokensEntrada / tokensTotais : null,
  };
}

export interface OrigemAnalisada extends LinhaPorOrigem {
  tokens: number;
  /** Fatia dos tokens do período. `null` quando o período não teve token nenhum. */
  fatia: number | null;
  tokensPorChamada: number | null;
  /** Quantas vezes a média geral de tokens/chamada. É a leitura de eficiência. */
  vezesAMedia: number | null;
}

/**
 * As origens, ordenadas por tokens, com a leitura de eficiência ao lado.
 *
 * Tokens e tokens/chamada juntos são o que separa "consome muito porque é usada
 * muito" de "consome muito porque cada chamada é cara". Só o total não distingue
 * as duas, e as duas pedem ações opostas.
 */
export function analisarOrigens(dados: DadosDeConsumo): OrigemAnalisada[] {
  const t = totaisDoPeriodo(dados.porOrigem);
  return dados.porOrigem
    .map((o) => {
      const tokens = tokensDe(o);
      const chamadas = Number(o.chamadas ?? 0);
      const porChamada = chamadas > 0 ? tokens / chamadas : null;
      return {
        ...o,
        chamadas,
        falhas: Number(o.falhas ?? 0),
        tokens,
        fatia: t.tokensTotais > 0 ? tokens / t.tokensTotais : null,
        tokensPorChamada: porChamada,
        vezesAMedia: porChamada != null && t.tokensPorChamada
          ? porChamada / t.tokensPorChamada
          : null,
      };
    })
    .sort((a, b) => b.tokens - a.tokens || b.chamadas - a.chamadas);
}

/** O rótulo do cliente — `null` é "Global", e é uma resposta. */
export const NOME_SEM_CLIENTE = "Global / sem cliente";

export function analisarClientes(dados: DadosDeConsumo) {
  return dados.porCliente
    .map((c) => ({
      ...c,
      chamadas: Number(c.chamadas ?? 0),
      tokens: tokensDe(c),
      rotulo: c.accountId == null ? NOME_SEM_CLIENTE : (c.nome ?? `Conta ${c.accountId}`),
      global: c.accountId == null,
    }))
    .sort((a, b) => b.tokens - a.tokens);
}

// ─── Alertas ─────────────────────────────────────────────────────────────────

const pct = (x: number) => `${Math.round(x * 100)}%`;
const vezes = (x: number) => `${x.toFixed(1).replace(".", ",")}×`;
const num = (x: number) => Math.round(x).toLocaleString("pt-BR");

/**
 * O que merece atenção — e nada além disso.
 *
 * Devolve lista vazia quando não há notícia, e a tela diz "nenhum alerta" em vez
 * de inventar um. Um insight fabricado para preencher a interface é pior que
 * espaço vazio: ele consome a atenção que o alerta real vai precisar.
 */
export function alertasDeConsumo(dados: DadosDeConsumo): AlertaDeConsumo[] {
  const alertas: AlertaDeConsumo[] = [];
  const t = totaisDoPeriodo(dados.porOrigem);
  const origens = analisarOrigens(dados);
  const dias = [...dados.porDia].sort((a, b) => a.dia.localeCompare(b.dia));

  // ── ANOMALIA e VOLUME: o último dia contra os anteriores ─────────────────
  //
  // O último dia é comparado com a MÉDIA dos anteriores, e não com o dia
  // anterior: dois dias seguidos oscilam por acaso, e a média absorve isso.
  if (dias.length > LIMIARES.diasParaComparar) {
    const hoje = dias[dias.length - 1];
    const antes = dias.slice(0, -1);
    const mediaChamadas = antes.reduce((n, d) => n + Number(d.chamadas ?? 0), 0) / antes.length;
    const mediaTokens = antes.reduce((n, d) => n + tokensDe(d), 0) / antes.length;

    if (mediaChamadas > 0 && Number(hoje.chamadas) >= mediaChamadas * LIMIARES.anomaliaDoDia) {
      alertas.push({
        tipo: "volume",
        titulo: "Mais chamadas que o normal",
        detalhe: `Foram ${num(Number(hoje.chamadas))} chamadas em ${hoje.dia}, contra média de `
          + `${num(mediaChamadas)} nos ${antes.length} dias anteriores.`,
      });
    }
    if (mediaTokens > 0 && tokensDe(hoje) >= mediaTokens * LIMIARES.anomaliaDoDia) {
      alertas.push({
        tipo: "anomalia",
        titulo: "Consumo acima do comportamento recente",
        detalhe: `${hoje.dia} consumiu ${num(tokensDe(hoje))} tokens — `
          + `${pct(tokensDe(hoje) / mediaTokens - 1)} acima da média dos ${antes.length} dias anteriores.`,
      });
    }
  }

  // ── EFICIÊNCIA: origem cara POR CHAMADA, não por total ───────────────────
  for (const o of origens) {
    if (o.chamadas < LIMIARES.chamadasParaJulgarEficiencia) continue;
    if (o.vezesAMedia != null && o.vezesAMedia >= LIMIARES.ineficienciaDaOrigem) {
      alertas.push({
        tipo: "eficiencia",
        titulo: "Chamadas caras nesta origem",
        origem: o.origem,
        detalhe: `${num(o.tokensPorChamada ?? 0)} tokens por chamada — `
          + `${vezes(o.vezesAMedia)} a média geral de ${num(t.tokensPorChamada ?? 0)}.`,
      });
    }
  }

  // ── FALHA ────────────────────────────────────────────────────────────────
  if (t.chamadas >= LIMIARES.chamadasParaJulgarFalhas
      && t.taxaDeFalha != null && t.taxaDeFalha >= LIMIARES.falhas) {
    alertas.push({
      tipo: "falha",
      titulo: "Falhas acima do esperado",
      detalhe: `${num(t.falhas)} de ${num(t.chamadas)} chamadas falharam `
        + `(${(t.taxaDeFalha * 100).toFixed(1).replace(".", ",")}%). Falha também consome.`,
    });
  }

  // ── ANOMALIA: cliente fora do padrão ─────────────────────────────────────
  //
  // Só entre contas REAIS: o global costuma ser o maior de todos por natureza,
  // e ele apareceria toda vez, dizendo apenas que existe.
  const comConta = analisarClientes(dados).filter((c) => !c.global && c.tokens > 0);
  if (comConta.length >= LIMIARES.clientesParaComparar) {
    const ordenados = comConta.map((c) => c.tokens).sort((a, b) => a - b);
    const meio = Math.floor(ordenados.length / 2);
    const mediana = ordenados.length % 2 === 1
      ? ordenados[meio]
      : (ordenados[meio - 1] + ordenados[meio]) / 2;
    const top = comConta[0];
    if (mediana > 0 && top.tokens >= mediana * LIMIARES.clienteForaDoPadrao) {
      alertas.push({
        tipo: "anomalia",
        titulo: "Cliente fora do padrão",
        accountId: top.accountId,
        detalhe: `${top.rotulo} consumiu ${num(top.tokens)} tokens — `
          + `${vezes(top.tokens / mediana)} a mediana das ${comConta.length} contas do período.`,
      });
    }
  }

  return alertas;
}

// ─── Histórico honesto ───────────────────────────────────────────────────────

/**
 * O que a página pode dizer sobre o histórico que TEM.
 *
 * A instrumentação começou em 18/08/2026. Enquanto não houver 30 dias, escrever
 * "últimos 30 dias" seria descrever uma janela que não existe — e a curva curta
 * pareceria uma tendência que ninguém mediu.
 */
export function leituraDoHistorico(medindoDesde: string | null, hoje: string): {
  dias: number; frase: string; suficienteParaTendencia: boolean;
} {
  if (!medindoDesde) {
    return { dias: 0, frase: "Nenhuma geração registrada ainda.", suficienteParaTendencia: false };
  }
  const [a1, m1, d1] = medindoDesde.slice(0, 10).split("-").map(Number);
  const [a2, m2, d2] = hoje.slice(0, 10).split("-").map(Number);
  const dias = Math.max(1, Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86_400_000) + 1);
  const br = `${String(d1).padStart(2, "0")}/${String(m1).padStart(2, "0")}/${a1}`;
  return {
    dias,
    frase: `Monitorando desde ${br} · ${dias} dia${dias === 1 ? "" : "s"} de histórico`,
    suficienteParaTendencia: dias >= 7,
  };
}
