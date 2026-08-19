/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  O gatilho de uma chamada de IA — vocabulário compartilhado
 * ─────────────────────────────────────────────────────────────────────────────
 *  Puro: só tipos, rótulos e a leitura. Servidor e tela precisam concordar sobre
 *  o que é "manual", e dois vocabulários escritos separados divergem — o log
 *  gravaria uma palavra e a página filtraria por outra, sem erro nenhum.
 *
 *  ── Origem e gatilho são coisas diferentes ─────────────────────────────────
 *  A auditoria de 19/08/2026 mediu SETE caminhos chegando a
 *  `refreshAccountAiStatus`, e todos gravavam `origem: "status_ia"`. Origem diz
 *  O QUE a chamada faz; gatilho diz QUEM pediu. Com só a primeira, "8 análises
 *  às 17h54" não distingue o cron de um clique de um deploy.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type TipoDeGatilho =
  /** Cron. Hora marcada, sem gente envolvida. */
  | "scheduled"
  /** Alguém clicou. Tem ator. */
  | "manual"
  /** O sistema decidiu sozinho, fora de hora marcada — boot, retry, cascata. */
  | "system"
  /** Registro anterior à instrumentação, ou caminho que ninguém nomeou. */
  | "unknown";

export const TIPOS_DE_GATILHO: TipoDeGatilho[] = ["scheduled", "manual", "system", "unknown"];

/**
 * O rótulo curto de cada tipo.
 *
 * `unknown` é "Não rastreado", e nunca "Automático": os registros de antes desta
 * instrumentação não sabem o que os disparou, e chutar o mais provável
 * transformaria ausência em afirmação — no lugar exato onde alguém vai decidir
 * o que cortar.
 */
export const ROTULO_DO_TIPO: Record<TipoDeGatilho, string> = {
  scheduled: "Automático",
  manual: "Manual",
  system: "Sistema",
  unknown: "Não rastreado",
};

export interface Gatilho {
  tipo: TipoDeGatilho;
  /** A rotina exata: `runAutoSync`, `refreshAllStatus`, `syncAccount`. */
  origemDoGatilho: string | null;
  /** O nome amigável: "Atualização automática diária". */
  rotulo: string | null;
  atorTipo: "user" | "system" | null;
  atorId: number | null;
  /**
   * O nome de quem disparou.
   *
   * Guardado junto de propósito, apesar de resolvível pelo id: colaborador
   * desativado ou renomeado deixaria o histórico com "usuário 7", e o log de
   * causalidade perderia justamente a resposta que ele existe para dar. É o
   * nome de trabalho de quem já aparece na navegação do Spaces — não é dado
   * novo sobre ninguém.
   */
  atorNome: string | null;
  atorPapel: string | null;
}

/** A frase da coluna GATILHO: "Automático · Cron", "Manual · Gui". */
export function textoDoGatilho(g: Partial<Gatilho> | null | undefined): string {
  const tipo = (g?.tipo ?? "unknown") as TipoDeGatilho;
  const base = ROTULO_DO_TIPO[tipo] ?? ROTULO_DO_TIPO.unknown;
  if (tipo === "manual") return g?.atorNome ? `${base} · ${g.atorNome}` : base;
  if (tipo === "unknown") return base;
  return g?.rotulo ? `${base} · ${g.rotulo}` : base;
}

/** Quem aparece na coluna QUEM. Sistema é sistema; sem rastro é traço. */
export function textoDoAtor(g: Partial<Gatilho> | null | undefined): string {
  const tipo = (g?.tipo ?? "unknown") as TipoDeGatilho;
  if (tipo === "unknown") return "–";
  if (g?.atorTipo === "user") return g.atorNome ?? `Usuário ${g.atorId ?? "?"}`;
  return "Sistema";
}

/**
 * As rotinas nomeadas, com o rótulo que a tela mostra.
 *
 * Uma tabela e não strings soltas: `runAutoSync` gravado em dois lugares com
 * grafias diferentes viraria duas linhas no ranking de rotinas.
 */
export const ROTINAS = {
  cronDiario: { origem: "runAutoSync", rotulo: "Atualização automática diária", tipo: "scheduled" },
  syncManual: { origem: "syncAllAccounts", rotulo: "Sincronização manual", tipo: "manual" },
  syncDeConta: { origem: "syncAccount", rotulo: "Sincronização da conta", tipo: "manual" },
  analiseManual: { origem: "refreshAccountAiStatus", rotulo: "Atualização manual da análise", tipo: "manual" },
  analiseEmMassa: { origem: "refreshAllStatus", rotulo: "Reanálise de todas as contas", tipo: "manual" },
  boot: { origem: "boot", rotulo: "Inicialização do servidor", tipo: "system" },
} as const satisfies Record<string, { origem: string; rotulo: string; tipo: TipoDeGatilho }>;

// ─── Leitura agregada e alertas ──────────────────────────────────────────────

export interface ConsumoPorGatilho {
  tipo: TipoDeGatilho;
  rotulo: string;
  chamadas: number;
  tokens: number;
  falhas: number;
  /** Fatia dos tokens do período. `null` quando o período não teve token. */
  fatia: number | null;
  tokensPorChamada: number | null;
}

export function consumoPorGatilho(
  linhas: Array<{ tipo: string; chamadas: number; tokensEntrada: number; tokensSaida: number; falhas: number }>,
): ConsumoPorGatilho[] {
  const total = linhas.reduce((n, l) => n + Number(l.tokensEntrada) + Number(l.tokensSaida), 0);
  return linhas
    .map((l) => {
      const tipo = (TIPOS_DE_GATILHO as string[]).includes(l.tipo)
        ? (l.tipo as TipoDeGatilho) : "unknown";
      const tokens = Number(l.tokensEntrada) + Number(l.tokensSaida);
      const chamadas = Number(l.chamadas);
      return {
        tipo, rotulo: ROTULO_DO_TIPO[tipo], chamadas, tokens, falhas: Number(l.falhas ?? 0),
        fatia: total > 0 ? tokens / total : null,
        tokensPorChamada: chamadas > 0 ? tokens / chamadas : null,
      };
    })
    .sort((a, b) => b.tokens - a.tokens);
}

/**
 * Os limiares dos alertas de gatilho.
 *
 * Altos de propósito, pela mesma razão dos outros: um painel que fica amarelo
 * toda semana deixa de ser lido. E nenhum deles diz "desperdício" — todos dizem
 * o número e mandam conferir, porque múltiplas chamadas podem ser trabalho
 * legítimo e o painel não tem como saber.
 */
export const LIMIARES_DE_GATILHO = {
  /** Chamadas para o MESMO cliente numa janela curta. */
  repeticoesPorCliente: 4,
  janelaDeRepeticaoMinutos: 180,
  /** Duas chamadas de mesma origem e cliente dentro disto são quase-simultâneas. */
  intervaloCurtoMinutos: 10,
  /** Fatia de tokens acima da qual o consumo manual vira sinal. */
  fatiaManual: 0.5,
  /** Chamadas mínimas no período para qualquer alerta destes valer algo. */
  chamadasParaJulgar: 10,
} as const;

export interface AlertaDeGatilho {
  chave: string;
  titulo: string;
  detalhe: string;
  severidade: "atencao" | "critico";
}

export interface ChamadaCrua {
  origem: string;
  accountId: number | null;
  nomeDaConta: string | null;
  triggerType: string | null;
  actorName: string | null;
  criadoEm: string | Date;
}

const minutosEntre = (a: Date, b: Date) => Math.abs(a.getTime() - b.getTime()) / 60_000;
const paraData = (v: string | Date) => (v instanceof Date ? v : new Date(v));

/**
 * Alertas investigativos sobre POR QUE a IA foi chamada.
 *
 * Cada um traz os números que o dispararam. "Consumo alto" sem causa é uma
 * opinião com cara de dado — quem lê não consegue discordar porque não sabe do
 * que se discorda.
 */
export function alertasDeGatilho(entrada: {
  chamadas: ChamadaCrua[];
  porGatilho: ConsumoPorGatilho[];
}): AlertaDeGatilho[] {
  const a: AlertaDeGatilho[] = [];
  const { chamadas, porGatilho } = entrada;
  if (chamadas.length < LIMIARES_DE_GATILHO.chamadasParaJulgar) return a;

  // ── Mesmo cliente, muitas vezes numa janela curta ────────────────────────
  const porConta = new Map<string, ChamadaCrua[]>();
  for (const c of chamadas) {
    if (c.accountId == null) continue;
    const k = String(c.accountId);
    porConta.set(k, [...(porConta.get(k) ?? []), c]);
  }
  for (const lista of Array.from(porConta.values())) {
    const ordenada = [...lista].sort(
      (x, y) => paraData(x.criadoEm).getTime() - paraData(y.criadoEm).getTime());
    // Janela deslizante: o pico real, e não o total do período — 6 chamadas
    // espalhadas em 30 dias não são a mesma coisa que 6 em 3 horas.
    let melhor = { n: 0, de: null as Date | null, ate: null as Date | null, manuais: 0 };
    for (let i = 0; i < ordenada.length; i++) {
      let n = 0, manuais = 0;
      for (let j = i; j < ordenada.length; j++) {
        if (minutosEntre(paraData(ordenada[i].criadoEm), paraData(ordenada[j].criadoEm))
            > LIMIARES_DE_GATILHO.janelaDeRepeticaoMinutos) break;
        n++;
        if (ordenada[j].triggerType === "manual") manuais++;
      }
      if (n > melhor.n) {
        melhor = { n, manuais, de: paraData(ordenada[i].criadoEm), ate: null };
      }
    }
    if (melhor.n >= LIMIARES_DE_GATILHO.repeticoesPorCliente) {
      const nome = ordenada[0].nomeDaConta ?? `Conta ${ordenada[0].accountId}`;
      const horas = LIMIARES_DE_GATILHO.janelaDeRepeticaoMinutos / 60;
      a.push({
        chave: `repeticao-${ordenada[0].accountId}`,
        severidade: "atencao",
        titulo: "Muitas chamadas para o mesmo cliente",
        detalhe: `${nome} recebeu ${melhor.n} chamadas de IA em ${horas}h`
          + (melhor.manuais > 0 ? `, sendo ${melhor.manuais} manual(is)` : ", todas automáticas")
          + ". Verifique os gatilhos — repetição pode ser trabalho legítimo.",
      });
    }
  }

  // ── Mesma origem + mesmo cliente em intervalo muito curto ────────────────
  const pares = new Map<string, Date[]>();
  for (const c of chamadas) {
    const k = `${c.origem}|${c.accountId ?? "-"}`;
    pares.set(k, [...(pares.get(k) ?? []), paraData(c.criadoEm)]);
  }
  let curtos = 0;
  for (const datas of Array.from(pares.values())) {
    const ord = [...datas].sort((x, y) => x.getTime() - y.getTime());
    for (let i = 1; i < ord.length; i++) {
      if (minutosEntre(ord[i - 1], ord[i]) <= LIMIARES_DE_GATILHO.intervaloCurtoMinutos) curtos++;
    }
  }
  if (curtos > 0) {
    a.push({
      chave: "intervalo-curto",
      severidade: "atencao",
      titulo: "Repetição em intervalo curto",
      detalhe: `${curtos} par(es) de chamadas com a mesma origem e o mesmo cliente `
        + `em menos de ${LIMIARES_DE_GATILHO.intervaloCurtoMinutos} minutos. `
        + "A segunda de cada par provavelmente leu os mesmos dados.",
    });
  }

  // ── Manual concentrando o consumo ────────────────────────────────────────
  const manual = porGatilho.find((g) => g.tipo === "manual");
  if (manual?.fatia != null && manual.fatia >= LIMIARES_DE_GATILHO.fatiaManual) {
    a.push({
      chave: "fatia-manual",
      severidade: "atencao",
      titulo: "Consumo manual acima do automático",
      detalhe: `${Math.round(manual.fatia * 100)}% dos tokens vieram de ${manual.chamadas} `
        + "chamadas disparadas por pessoas. Não é erro — é informação sobre como a equipe "
        + "está usando a ferramenta.",
    });
  }

  // ── Caminhos ainda não rastreados ────────────────────────────────────────
  const desconhecido = porGatilho.find((g) => g.tipo === "unknown");
  if (desconhecido && desconhecido.chamadas > 0) {
    a.push({
      chave: "nao-rastreado",
      severidade: "atencao",
      titulo: "Chamadas sem gatilho identificado",
      detalhe: `${desconhecido.chamadas} chamada(s) sem origem de disparo registrada. `
        + "Registros anteriores à instrumentação aparecem assim; se forem recentes, "
        + "há um caminho que ainda não se declara.",
    });
  }

  return a;
}
