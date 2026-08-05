/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Confirmação dupla — a trava entre "vi algo" e "acordei alguém"
 * ─────────────────────────────────────────────────────────────────────────────
 *  Uma leitura isolada não é evidência. DNS falha, rede engasga, CDN devolve
 *  bobagem por trinta segundos. Se cada leitura ruim virasse alerta crítico, o
 *  robô gastaria a confiança do time em uma semana — e aí o alerta de verdade
 *  chegaria num canal que todo mundo já aprendeu a ignorar.
 *
 *  Então o achado CRITICAL não alerta na hora: vira SUSPEITA. Só depois de
 *  aparecer de novo, na leitura seguinte, é que vira alerta. A 5 minutos por
 *  ciclo, isso custa 5 minutos de atraso — e compra a diferença entre "o site
 *  saiu do ar" e "a rede piscou".
 *
 *  ── Por que puro ───────────────────────────────────────────────────────────
 *  Sem banco, sem rede, sem relógio: o "agora" ENTRA como argumento. É o que
 *  permite exercitar oito ciclos consecutivos em um teste de milissegundos.
 *  Testar isto contra o mundo real exigiria um domínio caindo e voltando na
 *  hora marcada — impossível de agendar, e é justamente o caso que precisa
 *  funcionar.
 *
 *  ── O piso de 2 é proposital ───────────────────────────────────────────────
 *  O número é configurável, mas não abaixo de dois. Deixar chegar a 1 devolveria
 *  exatamente o comportamento que esta trava existe para impedir, e por um campo
 *  de configuração que alguém mexeria sem lembrar do porquê.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import type { Achado, Severidade } from "./avaliador";

/** Estado que sobrevive entre ciclos. Persistido em `suspeitaJson`. */
export interface Suspeita {
  chave: string;
  /** Quando foi vista pela primeira vez — vira "há quanto tempo" na tela. */
  desde: string;
  /** Leituras consecutivas com o mesmo achado. */
  ciclos: number;
  /** Já virou alerta? Impede realertar a cada 5 minutos. */
  confirmada: boolean;
  titulo: string;
  detalhe: string;
  sev: Severidade;
}

export type Decisao =
  /** Nada crítico, e nada pendente. O caso normal. */
  | { acao: "seguir"; suspeita: null }
  /** Crítico visto, ainda sem confirmação. NÃO alerta. */
  | { acao: "aguardar"; suspeita: Suspeita; faltam: number }
  /** Confirmado nesta leitura. É agora que o alerta nasce. */
  | { acao: "alertar"; suspeita: Suspeita; achado: Achado }
  /** Já alertado e ainda acontecendo. Silencioso — o dedup diário cobre. */
  | { acao: "manter"; suspeita: Suspeita }
  /** Sumiu. Se nunca chegou a confirmar, foi instabilidade momentânea. */
  | { acao: "normalizou"; anterior: Suspeita; instabilidadeMomentanea: boolean };

/** Piso 2 (ver cabeçalho); teto 10 para não virar "nunca alerta" por engano. */
export const CONFIRMACOES_PADRAO = 2;
export const normalizarConfirmacoes = (n: number | null | undefined): number =>
  Math.min(10, Math.max(2, Math.trunc(Number(n) || CONFIRMACOES_PADRAO)));

/**
 * Decide o que fazer com as leituras deste ciclo.
 *
 * Só achados com `exigeConfirmacao` entram — hoje, por construção do avaliador,
 * exatamente os CRITICAL. WARNING e INFO nunca chegam aqui: eles são registrados
 * no snapshot e aparecem na tela, mas não acordam ninguém.
 */
export function decidir(a: {
  achados: Achado[];
  anterior: Suspeita | null;
  confirmacoesNecessarias: number;
  agoraIso: string;
}): Decisao {
  const necessarias = normalizarConfirmacoes(a.confirmacoesNecessarias);
  const critico = a.achados.find((x) => x.exigeConfirmacao) ?? null;
  const anterior = a.anterior;

  if (!critico) {
    if (!anterior) return { acao: "seguir", suspeita: null };
    // Sumiu antes de confirmar = a rede piscou. Vira registro INFO, não alerta:
    // é exatamente o falso positivo que a trava existe para engolir.
    return { acao: "normalizou", anterior, instabilidadeMomentanea: !anterior.confirmada };
  }

  const continuacao = anterior?.chave === critico.chave;
  const suspeita: Suspeita = {
    chave: critico.chave,
    // Um problema DIFERENTE recomeça a contagem: herdar os ciclos do anterior
    // faria um achado novo nascer já confirmado, pulando a trava.
    desde: continuacao ? anterior!.desde : a.agoraIso,
    ciclos: continuacao ? anterior!.ciclos + 1 : 1,
    confirmada: false,
    titulo: critico.titulo,
    detalhe: critico.detalhe,
    sev: critico.sev,
  };

  if (continuacao && anterior!.confirmada) {
    return { acao: "manter", suspeita: { ...suspeita, confirmada: true } };
  }
  if (suspeita.ciclos >= necessarias) {
    return { acao: "alertar", suspeita: { ...suspeita, confirmada: true }, achado: critico };
  }
  return { acao: "aguardar", suspeita, faltam: necessarias - suspeita.ciclos };
}

/** Texto do estado pendente para a tela. Sem isto, "aguardando" fica opaco. */
export function descreverSuspeita(s: Suspeita, necessarias: number): string {
  const n = normalizarConfirmacoes(necessarias);
  return s.confirmada
    ? `${s.titulo} — confirmado, alerta emitido.`
    : `${s.titulo} — aguardando confirmação (${s.ciclos}/${n} leituras).`;
}
