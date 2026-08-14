/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  A leitura dos últimos 7 dias — derivada, nunca inventada
 * ─────────────────────────────────────────────────────────────────────────────
 *  Puro, compartilhado. Ocupa o lugar do "resumo da IA" no cabeçalho, e a
 *  diferença entre os dois precisa ficar explícita:
 *
 *    NÃO é IA. Nenhum modelo é chamado aqui. Cada frase sai de uma comparação
 *    aritmética sobre os snapshots, e por isso ela é verificável — se o texto
 *    disser "seguidores subiram 120", os dois números que produziram o 120
 *    estão na mesma tela.
 *
 *  ── Por que não um texto de IA agora ───────────────────────────────────────
 *  Um resumo gerado sobre uma base de poucos dias produziria frases fluentes e
 *  não verificáveis — exatamente o que o pedido proíbe. Quando houver série
 *  longa o bastante, este módulo vira a ENTRADA do prompt (fatos apurados), e
 *  não o texto final. A camada de fatos é útil nos dois mundos; o texto
 *  fabricado não é útil em nenhum.
 *
 *  ── Saber calar é metade do trabalho ───────────────────────────────────────
 *  Toda comparação exige DOIS pontos medidos. Com um dia de coleta não há
 *  tendência — há uma foto. `null` em cada achado, e o veredito
 *  `dadosInsuficientes`, existem para a tela dizer "ainda não dá para afirmar"
 *  em vez de descrever ruído como movimento.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface DiaDaLeitura {
  dia: string;
  /** Estoque: o total no momento da coleta. */
  seguidores: number | null;
  /** Fluxo, acumulado de 00:00 até a coleta. */
  visitas: number | null;
  interacoes: number | null;
  /** Posts + stories daquele dia. */
  ativacoes: number | null;
}

export type Direcao = "subiu" | "caiu" | "estavel";

export interface Achado {
  metrica: string;
  direcao: Direcao;
  /** A variação absoluta. Para estoque é o saldo; para fluxo, a diferença. */
  delta: number;
  /** Variação percentual sobre o primeiro ponto. `null` se a base for zero. */
  percentual: number | null;
}

export interface LeituraSocial {
  /** Frase pronta. `null` quando não há o que afirmar. */
  texto: string | null;
  achados: Achado[];
  dadosInsuficientes: boolean;
  /** Por que não deu — vai para a tela quando `texto` é `null`. */
  motivo: string | null;
  /** Quantos dias do período têm coleta válida. */
  diasMedidos: number;
}

/** Abaixo disto, qualquer comparação é ruído com cara de tendência. */
export const DIAS_MINIMOS_PARA_LER = 3;

/** Variação menor que isto é estabilidade, e não movimento. */
const PISO_DE_MOVIMENTO_PCT = 5;

function classificar(de: number, para: number): { direcao: Direcao; percentual: number | null } {
  const delta = para - de;
  const percentual = de !== 0 ? (delta / Math.abs(de)) * 100 : null;
  // Sem base para percentual (de = 0), qualquer valor absoluto é movimento.
  if (percentual === null) return { direcao: delta === 0 ? "estavel" : delta > 0 ? "subiu" : "caiu", percentual };
  if (Math.abs(percentual) < PISO_DE_MOVIMENTO_PCT) return { direcao: "estavel", percentual };
  return { direcao: percentual > 0 ? "subiu" : "caiu", percentual };
}

/** Compara as duas METADES do período, e não o primeiro contra o último dia. */
function metades(valores: number[]): { de: number; para: number } | null {
  if (valores.length < 2) return null;
  const meio = Math.floor(valores.length / 2);
  const media = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  return { de: media(valores.slice(0, meio)), para: media(valores.slice(meio)) };
}

const VERBO: Record<Direcao, string> = {
  subiu: "subiram",
  caiu: "caíram",
  estavel: "ficaram estáveis",
};

/**
 * Lê a série e devolve o que ela SUSTENTA.
 *
 * Estoque e fluxo são comparados de formas diferentes, e essa distinção é o
 * ponto: seguidores viram saldo entre a primeira e a última fotografia; visitas,
 * interações e ativações viram média da primeira metade contra a segunda.
 *
 * Comparar o PRIMEIRO contra o ÚLTIMO dia num fluxo seria comparar duas
 * amostras de um dia cada — um domingo fraco contra uma terça forte viraria
 * "queda de 60%". A média das metades absorve o dia da semana.
 */
export function lerUltimosDias(dias: DiaDaLeitura[]): LeituraSocial {
  // Um dia sem NENHUMA métrica é um dia sem coleta, e não um dia de zeros.
  const medidos = dias.filter(
    (d) => d.seguidores != null || d.visitas != null || d.interacoes != null || d.ativacoes != null,
  );

  if (medidos.length < DIAS_MINIMOS_PARA_LER) {
    return {
      texto: null, achados: [], dadosInsuficientes: true, diasMedidos: medidos.length,
      motivo: medidos.length === 0
        ? "Ainda não há coleta neste período."
        : `Com ${medidos.length} dia(s) de coleta ainda não dá para afirmar tendência — são precisos ao menos ${DIAS_MINIMOS_PARA_LER}.`,
    };
  }

  const achados: Achado[] = [];

  // Seguidores é ESTOQUE: a diferença entre duas fotografias, e não média.
  // Tirar média de estoque produziria um número sem significado nenhum.
  const comSeguidores = medidos.filter((d) => d.seguidores != null);
  if (comSeguidores.length >= 2) {
    const de = comSeguidores[0].seguidores!;
    const para = comSeguidores[comSeguidores.length - 1].seguidores!;
    const { direcao, percentual } = classificar(de, para);
    achados.push({ metrica: "seguidores", direcao, delta: para - de, percentual });
  }

  const fluxos: Array<[string, (d: DiaDaLeitura) => number | null]> = [
    ["ativações", (d) => d.ativacoes],
    ["interações", (d) => d.interacoes],
    ["visitas ao perfil", (d) => d.visitas],
  ];
  for (const [metrica, ler] of fluxos) {
    const valores = medidos.map(ler).filter((v): v is number => v != null);
    const m = metades(valores);
    if (!m) continue;
    const { direcao, percentual } = classificar(m.de, m.para);
    achados.push({ metrica, direcao, delta: Math.round(m.para - m.de), percentual });
  }

  if (!achados.length) {
    return {
      texto: null, achados: [], dadosInsuficientes: true, diasMedidos: medidos.length,
      motivo: "A coleta rodou, mas nenhuma métrica do período respondeu.",
    };
  }

  return {
    texto: montarTexto(achados, medidos.length),
    achados,
    dadosInsuficientes: false,
    motivo: null,
    diasMedidos: medidos.length,
  };
}

/**
 * Monta a frase.
 *
 * Agrupa por direção em vez de listar métrica por métrica: "seguidores subiram
 * e visitas caíram" é uma leitura; "seguidores subiram, ativações subiram,
 * interações subiram, visitas caíram" é a tabela escrita por extenso, e quem
 * quer a tabela olha a tabela.
 */
function montarTexto(achados: Achado[], dias: number): string {
  const nomes = (d: Direcao) => achados.filter((a) => a.direcao === d).map((a) => a.metrica);
  const lista = (xs: string[]) =>
    xs.length <= 1 ? xs[0] ?? "" : `${xs.slice(0, -1).join(", ")} e ${xs[xs.length - 1]}`;

  const partes: string[] = [];
  for (const d of ["subiu", "caiu", "estavel"] as const) {
    const xs = nomes(d);
    if (xs.length) partes.push(`${lista(xs)} ${VERBO[d]}`);
  }

  const seguidores = achados.find((a) => a.metrica === "seguidores");
  const detalhe = seguidores && seguidores.direcao !== "estavel"
    ? ` O saldo de seguidores foi de ${seguidores.delta > 0 ? "+" : ""}${seguidores.delta}.`
    : "";

  const frase = partes.join("; ");
  return `Nos últimos ${dias} dias com coleta, ${frase}.${detalhe}`;
}
