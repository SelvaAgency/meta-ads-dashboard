/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Saúde do consumo de IA — determinística, e comparada com a própria história
 * ─────────────────────────────────────────────────────────────────────────────
 *  Puro. Nenhum modelo é chamado aqui: um diagnóstico gerado por LLM sobre o
 *  gasto de LLM produziria uma frase fluente que ninguém consegue conferir — e
 *  que custaria uma chamada para dizer que as chamadas estão caras.
 *
 *  ── "Normal" é o próprio Spaces, e nunca um número de mercado ──────────────
 *  Não existe benchmark externo aqui. A régua é o histórico desta instalação, e
 *  quando ele não existe a resposta é "histórico insuficiente" — não um limiar
 *  inventado com cara de recomendação. 18.000 tokens por chamada pode ser
 *  normal para um relatório e absurdo para uma classificação de saúde; só a
 *  série da própria conta sabe.
 *
 *  ── Quatro estados, e eles não são graus da mesma coisa ────────────────────
 *    SAUDÁVEL    dentro do padrão observado
 *    ATENÇÃO     cresceu acima do padrão — pode ser legítimo
 *    OTIMIZAR    há EVIDÊNCIA de ineficiência, não só volume
 *    CAPACIDADE  só com limite conhecido e confiável
 *
 *  Crescer não é adoecer: funcionalidade nova consome mais porque existe. E
 *  gastar muito não é precisar de upgrade — são perguntas diferentes, e
 *  confundi-las transforma um painel de gestão num vendedor de plano.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type EstadoDaSaude = "saudavel" | "atencao" | "otimizar" | "capacidade" | "sem_historico";

export interface DiagnosticoDeSaude {
  estado: EstadoDaSaude;
  titulo: string;
  /** A frase, sempre com o número que a sustenta. */
  detalhe: string;
  /** O que foi comparado com o quê — para a tela poder dizer. */
  base: string | null;
}

/**
 * Os limiares da saúde. Nomeados, e ajustáveis sem tocar na página.
 *
 * Altos de propósito: um painel que fica amarelo toda semana deixa de ser lido,
 * e aí nem o sinal verdadeiro é visto.
 */
export const LIMIARES_DE_SAUDE = {
  /** Dias medidos mínimos para existir "padrão" com o que comparar. */
  diasParaPadrao: 7,
  /** Quantas vezes a média histórica diária vira ATENÇÃO. */
  crescimentoDeVolume: 1.5,
  /**
   * Quantas vezes a razão input/output histórica vira OTIMIZAR.
   *
   * A razão em si não é defeito — muito contexto é normal em análise. O que
   * vira sinal é ela CRESCER: o mesmo trabalho passando a exigir mais leitura.
   */
  desvioDaRazao: 1.6,
  /** Quantas vezes a mediana a média precisa ser para denunciar distorção. */
  mediaSobreMediana: 2,
  /** Chamadas mínimas para média e mediana significarem algo. */
  chamadasParaEstatistica: 20,
} as const;

export interface SerieDiaria {
  dia: string;
  entrada: number;
  saida: number;
  chamadas: number;
}

const soma = (ns: number[]) => ns.reduce((a, b) => a + b, 0);
const media = (ns: number[]) => (ns.length ? soma(ns) / ns.length : null);

export function mediana(ns: number[]): number | null {
  const v = ns.filter((n) => Number.isFinite(n)).slice().sort((a, b) => a - b);
  if (!v.length) return null;
  const meio = Math.floor(v.length / 2);
  return v.length % 2 === 1 ? v[meio] : (v[meio - 1] + v[meio]) / 2;
}

const num = (x: number) => Math.round(x).toLocaleString("pt-BR");
const vezes = (x: number) => `${x.toFixed(1).replace(".", ",")}×`;
const pctCresc = (x: number) => `${Math.round((x - 1) * 100)}%`;

export interface EstatisticasDeChamada {
  media: number | null;
  mediana: number | null;
  maior: number | null;
  menor: number | null;
  chamadas: number;
  /** `true` quando a média é puxada por poucas chamadas gigantes. */
  mediaDistorcida: boolean;
}

/**
 * Média, mediana e extremos de tokens por chamada.
 *
 * As duas primeiras juntas são o produto: sozinha, a média esconde que UMA
 * chamada de 142 mil tokens está carregando o número. A mediana não se move
 * com o extremo, e a distância entre as duas é justamente o diagnóstico.
 */
export function estatisticasDeChamada(tokensPorChamada: number[]): EstatisticasDeChamada {
  const v = tokensPorChamada.filter((n) => Number.isFinite(n) && n > 0);
  const m = media(v);
  const med = mediana(v);
  return {
    media: m,
    mediana: med,
    maior: v.length ? Math.max(...v) : null,
    menor: v.length ? Math.min(...v) : null,
    chamadas: v.length,
    mediaDistorcida: !!(m && med && med > 0
      && v.length >= LIMIARES_DE_SAUDE.chamadasParaEstatistica
      && m / med >= LIMIARES_DE_SAUDE.mediaSobreMediana),
  };
}

export interface RazaoEntradaSaida {
  entrada: number;
  saida: number;
  total: number;
  /** `null` quando não houve saída — dividir por zero não é "infinitamente alto". */
  razao: number | null;
  /** A razão do histórico, para comparar. `null` sem histórico bastante. */
  razaoHistorica: number | null;
  /** Quantas vezes a razão histórica. `null` quando falta uma das duas. */
  desvio: number | null;
}

export function razaoEntradaSaida(
  entrada: number, saida: number, historico: SerieDiaria[],
): RazaoEntradaSaida {
  const razao = saida > 0 ? entrada / saida : null;
  const comAmbos = historico.filter((d) => d.saida > 0 && d.entrada > 0);
  // A razão histórica sai dos TOTAIS, e não da média das razões diárias: um dia
  // de pouquíssimo volume com razão extrema pesaria igual a um dia inteiro.
  const razaoHistorica = comAmbos.length >= LIMIARES_DE_SAUDE.diasParaPadrao
    ? soma(comAmbos.map((d) => d.entrada)) / soma(comAmbos.map((d) => d.saida))
    : null;
  return {
    entrada, saida, total: entrada + saida, razao, razaoHistorica,
    desvio: razao != null && razaoHistorica ? razao / razaoHistorica : null,
  };
}

/**
 * O diagnóstico do topo da página.
 *
 * Uma frase só, com o número que a sustenta e a base de comparação declarada.
 * A ordem das checagens é a prioridade: evidência de ineficiência supera
 * crescimento, porque crescimento pode ser legítimo e ineficiência é acionável.
 */
export function saudeDoConsumo(entrada: {
  /** O período que a tela está mostrando. */
  periodo: { entrada: number; saida: number; dias: number };
  /** Todo o histórico medido, dia a dia — a régua. */
  historico: SerieDiaria[];
  estatisticas: EstatisticasDeChamada;
}): DiagnosticoDeSaude {
  const { periodo, historico, estatisticas } = entrada;
  const diasMedidos = historico.filter((d) => d.entrada + d.saida > 0).length;

  if (diasMedidos < LIMIARES_DE_SAUDE.diasParaPadrao) {
    return {
      estado: "sem_historico",
      titulo: "Histórico insuficiente para estabelecer um padrão",
      detalhe: `São ${diasMedidos} dia(s) medido(s); a comparação com "o normal" precisa de `
        + `ao menos ${LIMIARES_DE_SAUDE.diasParaPadrao}. Até lá os números existem, mas não há régua.`,
      base: null,
    };
  }

  const r = razaoEntradaSaida(periodo.entrada, periodo.saida, historico);

  // ── OTIMIZAR: evidência, e não volume ────────────────────────────────────
  if (r.desvio != null && r.desvio >= LIMIARES_DE_SAUDE.desvioDaRazao) {
    return {
      estado: "otimizar",
      titulo: "Otimização recomendada",
      detalhe: `A entrada está ${vezes(r.razao as number)} maior que a saída, contra `
        + `${vezes(r.razaoHistorica as number)} no histórico. O mesmo trabalho passou a exigir `
        + `mais leitura — vale investigar o contexto enviado por chamada.`,
      base: `${diasMedidos} dias de histórico`,
    };
  }
  if (estatisticas.mediaDistorcida) {
    return {
      estado: "otimizar",
      titulo: "Chamadas fora do padrão puxando a média",
      detalhe: `A média é ${num(estatisticas.media as number)} tokens por chamada e a mediana `
        + `${num(estatisticas.mediana as number)}. A distância entre as duas indica poucas chamadas `
        + `muito grandes carregando o número — elas são o lugar de olhar primeiro.`,
      base: `${estatisticas.chamadas} chamadas do período`,
    };
  }

  // ── ATENÇÃO: cresceu acima do padrão ─────────────────────────────────────
  const mediaHistoricaDiaria = media(
    historico.filter((d) => d.entrada + d.saida > 0).map((d) => d.entrada + d.saida));
  const mediaDoPeriodo = periodo.dias > 0 ? (periodo.entrada + periodo.saida) / periodo.dias : null;
  if (mediaHistoricaDiaria && mediaDoPeriodo
      && mediaDoPeriodo >= mediaHistoricaDiaria * LIMIARES_DE_SAUDE.crescimentoDeVolume) {
    return {
      estado: "atencao",
      titulo: "Consumo acima do padrão",
      detalhe: `O período consome ${num(mediaDoPeriodo)} tokens por dia, `
        + `${pctCresc(mediaDoPeriodo / mediaHistoricaDiaria)} acima da média histórica de `
        + `${num(mediaHistoricaDiaria)}. Crescer não é adoecer — vale conferir se veio de uso novo.`,
      base: `média de ${diasMedidos} dias medidos`,
    };
  }

  return {
    estado: "saudavel",
    titulo: "Saudável",
    detalhe: `Consumo dentro do padrão observado em ${diasMedidos} dias de histórico`
      + (r.razao != null ? `, com entrada ${vezes(r.razao)} a saída.` : "."),
    base: `${diasMedidos} dias de histórico`,
  };
}

// ─── Oportunidades de otimização ─────────────────────────────────────────────

export interface Oportunidade {
  chave: string;
  titulo: string;
  detalhe: string;
}

/**
 * Sinais de investigação — nunca afirmações de desperdício.
 *
 * Cada um exige evidência no dado. Lista vazia é resposta legítima, e melhor
 * que uma sugestão genérica: "avalie seus prompts" sem número não diz o que
 * fazer, e ocupa o lugar do sinal que diria.
 */
export function oportunidadesDeOtimizacao(entrada: {
  razao: RazaoEntradaSaida;
  estatisticas: EstatisticasDeChamada;
  cacheRead: number;
  cacheCreation: number;
  /** Chamadas por origem, para o sinal de "muitas chamadas pequenas". */
  origens: Array<{ origem: string; chamadas: number; tokensPorChamada: number | null }>;
}): Oportunidade[] {
  const o: Oportunidade[] = [];
  const { razao, estatisticas } = entrada;

  if (razao.desvio != null && razao.desvio >= LIMIARES_DE_SAUDE.desvioDaRazao) {
    o.push({
      chave: "razao",
      titulo: "Relação entrada/saída subiu",
      detalhe: `${vezes(razao.razao as number)} agora contra ${vezes(razao.razaoHistorica as number)} `
        + "no histórico. Investigar tamanho de prompt e contexto enviado.",
    });
  }
  if (estatisticas.mediaDistorcida) {
    o.push({
      chave: "extremos",
      titulo: "Chamadas muito acima da mediana",
      detalhe: `A maior chamada do período teve ${num(estatisticas.maior as number)} tokens, contra `
        + `mediana de ${num(estatisticas.mediana as number)}. Ver quais são, no bloco de maiores chamadas.`,
    });
  }
  /**
   * Cache zerado é FATO, e vira oportunidade só com volume que justifique.
   *
   * Sem contexto repetido não há o que cachear, e sugerir cache para quem manda
   * prompts diferentes toda vez é conselho que não se aplica. O gatilho é
   * volume de entrada alto — que é quando o cache paga.
   */
  if (entrada.cacheRead === 0 && entrada.cacheCreation === 0 && razao.entrada > 1_000_000) {
    o.push({
      chave: "cache",
      titulo: "Nenhum cache em uso, com entrada alta",
      detalhe: `${num(razao.entrada)} tokens de entrada e zero cache no período. Se parte do `
        + "contexto se repete entre chamadas, o cache da Anthropic cobraria menos por ela. "
        + "É hipótese a investigar, não diagnóstico.",
    });
  }
  const miudas = entrada.origens.filter(
    (x) => x.chamadas >= 50 && x.tokensPorChamada != null && x.tokensPorChamada < 1_500);
  if (miudas.length) {
    o.push({
      chave: "miudas",
      titulo: "Muitas chamadas pequenas",
      detalhe: `${miudas.map((m) => m.origem).join(", ")} faz muitas chamadas de baixo consumo `
        + "individual. Quando a tarefa permitir, agrupar reduz o custo fixo de cada chamada.",
    });
  }
  return o;
}

// ─── Spaces × Anthropic ──────────────────────────────────────────────────────

export interface ComparacaoDeFontes {
  spaces: number;
  anthropic: number | null;
  /** Anthropic − Spaces. Positivo = a Anthropic viu mais. */
  diferenca: number | null;
  /** A diferença como fração do lado da Anthropic. */
  percentual: number | null;
  /** `true` quando a distância passa do que a contagem própria explica. */
  desalinhado: boolean;
  /** Por que as duas podem divergir mesmo estando ambas certas. */
  explicacao: string;
}

/**
 * Quanto a folga entre as duas contagens é normal.
 *
 * Elas medem coisas diferentes de propósito: o Spaces conta o que passou pelo
 * seu próprio wrapper, e a Anthropic conta TUDO que a organização gastou — o
 * que inclui qualquer outra ferramenta usando a mesma chave. Uma diferença
 * pequena é o esperado; uma grande significa consumo que este painel não vê, e
 * isso é informação, não erro.
 */
export const FOLGA_ENTRE_FONTES = 0.15;

export function compararFontes(spaces: number, anthropic: number | null): ComparacaoDeFontes {
  const explicacao =
    "O Spaces conta apenas as chamadas que passam pelo seu próprio wrapper. A Anthropic cobra "
    + "todo o consumo da organização, incluindo qualquer outra ferramenta que use a mesma chave. "
    + "A diferença é o consumo que este painel não enxerga — não um erro de contagem.";
  if (anthropic == null || anthropic <= 0) {
    return { spaces, anthropic, diferenca: null, percentual: null, desalinhado: false, explicacao };
  }
  const diferenca = anthropic - spaces;
  const percentual = diferenca / anthropic;
  return {
    spaces, anthropic, diferenca, percentual,
    desalinhado: Math.abs(percentual) > FOLGA_ENTRE_FONTES,
    explicacao,
  };
}

/**
 * Custo por milhão de tokens — derivado, e sinalizado como tal na tela.
 *
 * Não é uma tabela de preço: é o que ESTE mix de modelos, entrada e saída
 * custou de fato. Serve para comparar períodos entre si, e não para prever a
 * fatura do mês que vem.
 */
export function custoPorMilhao(centavos: number, tokens: number): number | null {
  if (!tokens || centavos <= 0) return null;
  return (centavos / 100) / (tokens / 1_000_000);
}

// ─── Alertas que precisam de fora: histórico longo e a Anthropic ─────────────

import type { AlertaDeConsumo } from "./consumoDeIA";

/**
 * Os limiares dos alertas comparativos.
 *
 * Separados dos de saúde porque respondem outra pergunta: a saúde classifica o
 * estado, estes apontam um fato específico com evidência anexa. Um mesmo número
 * pode disparar os dois, e isso é desejado — o veredito diz "otimize" e o
 * alerta diz exatamente onde.
 */
export const LIMIARES_COMPARATIVOS = {
  /** Quantas vezes a média histórica diária vira alerta de crescimento. */
  crescimento: 1.5,
  /** Quantas vezes o custo/milhão histórico vira alerta de custo. */
  custoPorMilhao: 1.3,
  /** Dias de custo medido para haver referência de custo. */
  diasDeCustoParaComparar: 5,
} as const;

export interface DiaComCusto { dia: string; centavos: number; tokens: number }

/**
 * Crescimento, custo e desalinhamento — os três que o painel próprio não vê.
 *
 * CAPACIDADE não está aqui, e é de propósito: nenhum limite de capacidade está
 * conectado a este painel, e um alerta de capacidade sem teto conhecido seria
 * um palpite disfarçado de aviso.
 */
export function alertasComparativos(entrada: {
  periodo: { entrada: number; saida: number; dias: number; rotulo: string };
  historico: SerieDiaria[];
  /** Custo por dia vindo da Anthropic. Lista vazia quando não há leitura. */
  custoPorDia: DiaComCusto[];
  comparacao: ComparacaoDeFontes;
}): AlertaDeConsumo[] {
  const a: AlertaDeConsumo[] = [];
  const { periodo, historico, custoPorDia, comparacao } = entrada;
  const medidos = historico.filter((d) => d.entrada + d.saida > 0);

  // ── CRESCIMENTO ──────────────────────────────────────────────────────────
  if (medidos.length >= LIMIARES_DE_SAUDE.diasParaPadrao && periodo.dias > 0) {
    const mediaHistorica = media(medidos.map((d) => d.entrada + d.saida))!;
    const mediaAtual = (periodo.entrada + periodo.saida) / periodo.dias;
    if (mediaHistorica > 0 && mediaAtual >= mediaHistorica * LIMIARES_COMPARATIVOS.crescimento) {
      a.push({
        tipo: "crescimento", severidade: "atencao",
        titulo: "Consumo diário cresceu",
        detalhe: `${num(mediaAtual)} tokens por dia no período, contra ${num(mediaHistorica)} `
          + `na média de ${medidos.length} dias medidos.`,
        metrica: "Tokens por dia",
        valorAtual: num(mediaAtual),
        referencia: `média histórica de ${num(mediaHistorica)}`,
        periodo: periodo.rotulo,
        motivo: `Acima de ${vezes(LIMIARES_COMPARATIVOS.crescimento)} o padrão da própria conta. `
          + "Crescimento pode ser legítimo — funcionalidade nova consome porque existe.",
      });
    }
  }

  // ── CUSTO ────────────────────────────────────────────────────────────────
  //
  // O que se compara é o custo POR MILHÃO, e não o custo total: o total sobe
  // quando se usa mais, o que não é notícia. Já o preço por token subindo
  // significa mudança de mix — mais saída, ou um modelo mais caro atendendo.
  const comCusto = custoPorDia.filter((d) => d.centavos > 0 && d.tokens > 0);
  if (comCusto.length >= LIMIARES_COMPARATIVOS.diasDeCustoParaComparar) {
    const ultimo = comCusto[comCusto.length - 1];
    const antes = comCusto.slice(0, -1);
    const refCentavos = soma(antes.map((d) => d.centavos));
    const refTokens = soma(antes.map((d) => d.tokens));
    const ref = custoPorMilhao(refCentavos, refTokens);
    const atual = custoPorMilhao(ultimo.centavos, ultimo.tokens);
    if (ref && atual && atual >= ref * LIMIARES_COMPARATIVOS.custoPorMilhao) {
      a.push({
        tipo: "custo", severidade: "atencao",
        titulo: "Custo por token subiu",
        detalhe: `US$ ${atual.toFixed(2)} por milhão em ${ultimo.dia}, contra US$ ${ref.toFixed(2)} `
          + `nos ${antes.length} dias anteriores. O mix mudou — mais saída, ou modelo mais caro.`,
        metrica: "Custo por milhão de tokens",
        valorAtual: `US$ ${atual.toFixed(2)}`,
        referencia: `US$ ${ref.toFixed(2)} nos ${antes.length} dias anteriores`,
        periodo: ultimo.dia,
        motivo: `Acima de ${vezes(LIMIARES_COMPARATIVOS.custoPorMilhao)} o preço efetivo recente.`,
      });
    }
  }

  // ── DESALINHAMENTO ───────────────────────────────────────────────────────
  if (comparacao.desalinhado && comparacao.percentual != null) {
    const spacesMaior = (comparacao.diferenca ?? 0) < 0;
    a.push({
      tipo: "desalinhamento",
      // Crítico quando o Spaces conta MAIS que a Anthropic cobrou: a explicação
      // legítima (consumo fora do wrapper) só funciona no outro sentido, então
      // este caso significa contagem errada de um dos lados.
      severidade: spacesMaior ? "critico" : "atencao",
      titulo: spacesMaior ? "O Spaces contou mais do que a Anthropic cobrou"
        : "Consumo fora do painel",
      detalhe: spacesMaior
        ? `Diferença de ${(Math.abs(comparacao.percentual) * 100).toFixed(0)}%. A explicação usual `
          + "não cobre este sentido: verificar se o período da leitura externa já consolidou."
        : `A Anthropic cobrou ${(comparacao.percentual * 100).toFixed(0)}% mais tokens do que o `
          + "Spaces contou. A diferença é consumo com a mesma chave que este painel não enxerga.",
      metrica: "Tokens totais",
      valorAtual: `${num(comparacao.spaces)} (Spaces)`,
      referencia: `${num(comparacao.anthropic ?? 0)} (Anthropic)`,
      periodo: entrada.periodo.rotulo,
      motivo: `Diferença acima da folga de ${Math.round(FOLGA_ENTRE_FONTES * 100)}% entre as duas contagens.`,
    });
  }

  return a;
}
