/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  A semana como CHAVE, e não como instante
 * ─────────────────────────────────────────────────────────────────────────────
 *  Puro, compartilhado. A semana identifica um conjunto de prioridades, e é por
 *  isso que ela é uma string `AAAA-MM-DD` — a segunda-feira — e nunca um `Date`.
 *
 *  ── Por que isso não é preciosismo ─────────────────────────────────────────
 *  `new Date("2026-08-11")` é meia-noite UTC. Em São Paulo (UTC-3) isso é
 *  10/08 às 21h, e `.getDay()` devolve DOMINGO. A semana inteira andaria um dia
 *  para trás para quem abrisse a Home no Brasil — e o bug apareceria como
 *  "as prioridades sumiram", não como um erro de fuso.
 *
 *  Este módulo faz toda a aritmética em UTC e só formata por fatia de string,
 *  a mesma disciplina de `tipoDeMidia.diaDe`. Nenhuma função aqui olha o
 *  relógio: "hoje" entra por parâmetro, sempre.
 *
 *  ── O rótulo muda de forma quando o mês vira ───────────────────────────────
 *  "11–17 AGO" é legível porque o mês é um só. Na semana que atravessa a
 *  virada, o mesmo formato produziria "28–3 AGO", que está errado e parece
 *  certo. Por isso `rotuloDaSemana` tem dois formatos, e é a data que escolhe.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Os três grupos do painel. A ordem é a das abas. */
export const GRUPOS = ["cc", "gtm1", "gtm2"] as const;
export type Grupo = (typeof GRUPOS)[number];

export const ROTULO_GRUPO: Record<Grupo, string> = {
  cc: "CC",
  gtm1: "GTM 1",
  gtm2: "GTM 2",
};

/** O nome por extenso, para onde houver espaço (title, leitor de tela). */
export const NOME_GRUPO: Record<Grupo, string> = {
  cc: "Casa de Criação",
  gtm1: "GTM 1",
  gtm2: "GTM 2",
};

export const ehGrupo = (v: string): v is Grupo => (GRUPOS as readonly string[]).includes(v);

const MESES = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];

const DIA_MS = 86_400_000;

/** `AAAA-MM-DD` → epoch UTC. Sem `new Date(string)`, sem surpresa de fuso. */
function paraUTC(iso: string): number {
  const [a, m, d] = iso.split("-").map(Number);
  return Date.UTC(a, (m ?? 1) - 1, d ?? 1);
}

/** epoch UTC → `AAAA-MM-DD`. */
function paraISO(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * O dia de hoje no fuso de São Paulo, como string.
 *
 * O fuso importa aqui e em nenhum outro lugar deste arquivo: é o único ponto
 * onde um instante vira um dia do calendário. Depois disso é tudo string.
 */
export function hojeISO(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(agora);
}

/**
 * A segunda-feira da semana que contém esta data.
 *
 * Segunda e não domingo: a pergunta que o painel responde é "o que esta semana
 * de trabalho precisa ter como foco", e a semana de trabalho começa na segunda.
 */
export function inicioDaSemana(iso: string): string {
  const t = paraUTC(iso);
  // getUTCDay: 0=domingo. Recuo até segunda: domingo recua 6, segunda 0.
  const recuo = (new Date(t).getUTCDay() + 6) % 7;
  return paraISO(t - recuo * DIA_MS);
}

/** N semanas para frente (positivo) ou para trás (negativo). */
export function deslocarSemana(inicio: string, semanas: number): string {
  return paraISO(paraUTC(inicio) + semanas * 7 * DIA_MS);
}

/** O domingo que fecha a semana. */
export function fimDaSemana(inicio: string): string {
  return paraISO(paraUTC(inicio) + 6 * DIA_MS);
}

const dia = (iso: string) => Number(iso.slice(8, 10));
const mes = (iso: string) => MESES[Number(iso.slice(5, 7)) - 1] ?? "?";

/**
 * "11–17 AGO" quando o mês é um só, "28 JUL – 3 AGO" quando ele vira.
 *
 * O formato curto aplicado à semana de virada produziria "28–3 AGO": errado, e
 * com toda a cara de certo. É o tipo de erro que ninguém reporta porque ninguém
 * desconfia.
 */
export function rotuloDaSemana(inicio: string): string {
  const fim = fimDaSemana(inicio);
  if (inicio.slice(0, 7) === fim.slice(0, 7)) {
    return `${dia(inicio)}–${dia(fim)} ${mes(inicio)}`;
  }
  return `${dia(inicio)} ${mes(inicio)} – ${dia(fim)} ${mes(fim)}`;
}

/** "24 AGO" — o formato de prazo. Nunca devolve "sem prazo". */
export function rotuloDeDia(iso: string): string {
  return `${dia(iso)} ${mes(iso)}`;
}

/**
 * Como a semana se situa em relação a hoje.
 *
 * Serve para a tela dizer "esta semana" em vez de repetir a data que já está no
 * cabeçalho, e para o botão de próxima semana não parecer quebrado quando não
 * há nada lá.
 */
export type PosicaoDaSemana = "atual" | "passada" | "futura";

export function posicaoDaSemana(inicio: string, hoje: string): PosicaoDaSemana {
  const atual = inicioDaSemana(hoje);
  if (inicio === atual) return "atual";
  return inicio < atual ? "passada" : "futura";
}

/**
 * O texto que acompanha o intervalo no cabeçalho.
 *
 * `null` na semana atual, de propósito: escrever "esta semana" ao lado do
 * intervalo da semana atual é redundância, e o rótulo só ganha função quando a
 * pessoa NAVEGOU para longe — que é justamente quando ela pode se perder.
 */
export function situacaoDaSemana(inicio: string, hoje: string): string | null {
  const pos = posicaoDaSemana(inicio, hoje);
  if (pos === "atual") return null;
  const semanas = Math.round((paraUTC(inicio) - paraUTC(inicioDaSemana(hoje))) / (7 * DIA_MS));
  const n = Math.abs(semanas);
  if (pos === "passada") return n === 1 ? "semana passada" : `${n} semanas atrás`;
  return n === 1 ? "próxima semana" : `daqui a ${n} semanas`;
}
