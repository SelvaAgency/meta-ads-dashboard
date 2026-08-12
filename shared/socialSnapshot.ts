/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  O snapshot social, e os quatro estados de uma métrica
 * ─────────────────────────────────────────────────────────────────────────────
 *  Puro, compartilhado. A regra que sustenta a tabela inteira:
 *
 *    0                       mediu e deu zero
 *    null + está em recusadas a Meta negou, e o motivo está guardado
 *    null e não está         não perguntamos
 *    nenhuma linha no dia    ainda não coletávamos
 *
 *  Um zero de consolo é indistinguível de um zero real, some dentro de qualquer
 *  média e não deixa rastro. Por isso valor numérico aqui é sempre `number |
 *  null`, e nunca recebe `?? 0`.
 *
 *  ── A direção dos seguidores NÃO está provada ──────────────────────────────
 *  `follows_and_unfollows` devolve o breakdown `follow_type` com as dimensões
 *  FOLLOWER e NON_FOLLOWER — e não FOLLOW / UNFOLLOW. Duas leituras cabem:
 *
 *    A  direção da ação: quem passou a seguir e quem deixou de seguir
 *    B  segmentação de audiência: a mesma dimensão que o `reach` usa para
 *       separar quem já segue de quem não segue
 *
 *  Errar entre as duas inverte a tendência que o cliente lê. Então o bruto é
 *  guardado sem interpretação, o saldo oficial sai do delta do total — que é
 *  subtração e não depende de semântica — e `validarDirecaoDeSeguidores` decide
 *  a questão com aritmética, ao longo dos dias, em vez de com dedução.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** O que a leitura de uma métrica pode ser. Quatro estados, nunca três. */
export type EstadoDaMetrica =
  | { estado: "medido"; valor: number }
  | { estado: "recusado"; motivo: string }
  | { estado: "nao_perguntado" }
  | { estado: "sem_coleta" };

export const ROTULO_ESTADO: Record<EstadoDaMetrica["estado"], string> = {
  medido: "medido",
  recusado: "a Meta recusou",
  nao_perguntado: "não consultado",
  sem_coleta: "sem coleta neste dia",
};

/**
 * Lê uma métrica de um snapshot, devolvendo QUAL dos quatro estados ela está.
 *
 * `snapshot` ausente é o quarto estado — e é diferente de todos os outros:
 * significa que naquele dia o Spaces não estava medindo, e nada pode ser
 * afirmado sobre o cliente.
 */
export function lerMetrica(
  nome: string,
  snapshot: { metricas?: Record<string, number | null> | null; recusadas?: Record<string, string> | null } | null | undefined,
): EstadoDaMetrica {
  if (!snapshot) return { estado: "sem_coleta" };
  const recusa = snapshot.recusadas?.[nome];
  if (recusa) return { estado: "recusado", motivo: recusa };
  const v = snapshot.metricas?.[nome];
  if (typeof v === "number") return { estado: "medido", valor: v };
  return { estado: "nao_perguntado" };
}

/** O número, ou `null`. Para somar sem inventar zero. */
export const valorOuNulo = (e: EstadoDaMetrica): number | null =>
  e.estado === "medido" ? e.valor : null;

/**
 * Soma uma métrica ao longo de vários dias.
 *
 * Devolve também quantos dias entraram e quantos ficaram de fora — sem isso, um
 * total de 12 stories em 18 dias medidos ficaria indistinguível de 12 em 30, e
 * a média por dia sairia errada sem que nada denunciasse.
 */
export function somarNoPeriodo(
  nome: string,
  snapshots: Array<{ dia: string; metricas?: Record<string, number | null> | null; recusadas?: Record<string, string> | null } | null>,
): { total: number | null; diasMedidos: number; diasSemDado: number } {
  let total = 0;
  let medidos = 0;
  let sem = 0;
  for (const s of snapshots) {
    const e = lerMetrica(nome, s);
    if (e.estado === "medido") { total += e.valor; medidos += 1; } else sem += 1;
  }
  return { total: medidos > 0 ? total : null, diasMedidos: medidos, diasSemDado: sem };
}

// ─── Seguidores ─────────────────────────────────────────────────────────────

export interface AmostraDeSeguidores {
  dia: string;
  /** Total de seguidores naquele dia. `null` quando não foi medido. */
  total: number | null;
  /** FOLLOWER do breakdown, cru e SEM interpretação. */
  follower: number | null;
  /** NON_FOLLOWER do breakdown, cru e SEM interpretação. */
  naoSeguidor: number | null;
}

/**
 * O saldo do período — o número oficial da tela.
 *
 * Sai do delta do total e de mais nada: é subtração, e nenhuma dúvida de
 * semântica alcança uma subtração. Vale mesmo se o breakdown nunca for
 * decifrado.
 */
export function saldoDeSeguidores(amostras: AmostraDeSeguidores[]): {
  saldo: number | null; inicio: number | null; fim: number | null; diasCobertos: number;
} {
  const comTotal = amostras.filter((a) => typeof a.total === "number")
    .slice().sort((x, y) => x.dia.localeCompare(y.dia));
  if (comTotal.length < 2) {
    return {
      saldo: null,
      inicio: comTotal[0]?.total ?? null,
      fim: comTotal[comTotal.length - 1]?.total ?? null,
      diasCobertos: comTotal.length,
    };
  }
  const inicio = comTotal[0].total as number;
  const fim = comTotal[comTotal.length - 1].total as number;
  return { saldo: fim - inicio, inicio, fim, diasCobertos: comTotal.length };
}

export type VereditoDirecao = "confirmado" | "refutado" | "indeterminado";

export interface ValidacaoDeDirecao {
  veredito: VereditoDirecao;
  diasConferidos: number;
  diasQueBateram: number;
  /** Os dias em que a conta não fechou — é o que refuta a leitura A. */
  divergencias: Array<{ dia: string; deltaTotal: number; diferencaDoBreakdown: number }>;
  explicacao: string;
}

/** Dias consecutivos que precisam fechar para a leitura A ser aceita. */
export const DIAS_PARA_CONFIRMAR_DIRECAO = 5;

/**
 * Decide, por aritmética, se FOLLOWER/NON_FOLLOWER são entradas e saídas.
 *
 * A conta: se a leitura A estiver certa, o total de seguidores tem que ter
 * variado exatamente FOLLOWER − NON_FOLLOWER de um dia para o outro. Se for
 * segmentação de audiência (leitura B), os números não têm razão nenhuma para
 * fechar — e uma única divergência já refuta, porque a identidade seria exata.
 *
 * Só compara dias CONSECUTIVOS: com um buraco no meio, o delta do total abrange
 * mais de um dia enquanto o breakdown fala de um só, e a conta não fecharia por
 * um motivo que não tem nada a ver com a semântica.
 */
export function validarDirecaoDeSeguidores(amostras: AmostraDeSeguidores[]): ValidacaoDeDirecao {
  const ordenadas = amostras.slice().sort((a, b) => a.dia.localeCompare(b.dia));
  const divergencias: ValidacaoDeDirecao["divergencias"] = [];
  let conferidos = 0;
  let bateram = 0;

  for (let i = 1; i < ordenadas.length; i++) {
    const hoje = ordenadas[i];
    const ontem = ordenadas[i - 1];
    if (diaSeguinte(ontem.dia) !== hoje.dia) continue;
    if (typeof hoje.total !== "number" || typeof ontem.total !== "number") continue;
    if (typeof hoje.follower !== "number" || typeof hoje.naoSeguidor !== "number") continue;

    conferidos += 1;
    const deltaTotal = hoje.total - ontem.total;
    const diferenca = hoje.follower - hoje.naoSeguidor;
    if (deltaTotal === diferenca) bateram += 1;
    else divergencias.push({ dia: hoje.dia, deltaTotal, diferencaDoBreakdown: diferenca });
  }

  if (divergencias.length > 0) {
    return {
      veredito: "refutado", diasConferidos: conferidos, diasQueBateram: bateram, divergencias,
      explicacao:
        `Em ${divergencias.length} de ${conferidos} dia(s), o delta do total não é FOLLOWER − NON_FOLLOWER. ` +
        "A dimensão não descreve entradas e saídas — trate como segmentação de audiência e não use para crescimento.",
    };
  }
  if (conferidos >= DIAS_PARA_CONFIRMAR_DIRECAO) {
    return {
      veredito: "confirmado", diasConferidos: conferidos, diasQueBateram: bateram, divergencias: [],
      explicacao:
        `O delta do total bateu com FOLLOWER − NON_FOLLOWER em ${bateram} dia(s) consecutivos. ` +
        "FOLLOWER pode ser lido como entradas e NON_FOLLOWER como saídas.",
    };
  }
  return {
    veredito: "indeterminado", diasConferidos: conferidos, diasQueBateram: bateram, divergencias: [],
    explicacao: conferidos === 0
      ? "Ainda não há dois dias consecutivos com total e breakdown para comparar."
      : `${conferidos} de ${DIAS_PARA_CONFIRMAR_DIRECAO} dia(s) conferidos. Faltam ${DIAS_PARA_CONFIRMAR_DIRECAO - conferidos}.`,
  };
}

/**
 * O que a tela pode dizer sobre entradas e saídas HOJE.
 *
 * Enquanto o veredito não for `confirmado`, os dois números não aparecem como
 * "novos seguidores" e "deixaram de seguir" — só o saldo, que é seguro. Mostrar
 * antes da prova seria afirmar uma direção que pode estar invertida.
 */
export function podeMostrarEntradasESaidas(v: ValidacaoDeDirecao): boolean {
  return v.veredito === "confirmado";
}

const diaSeguinte = (dia: string): string => {
  const [a, m, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d) + 86_400_000).toISOString().slice(0, 10);
};
