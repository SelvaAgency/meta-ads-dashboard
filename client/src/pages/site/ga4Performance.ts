/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Leitura dos snapshots do GA4 para a aba Site > Performance
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  Lógica pura, separada do JSX, porque três decisões aqui são de julgamento e
 *  não de renderização:
 *
 *   1. Variação só existe quando há base. Sair de 0 para 10 não é "+∞%", e
 *      mostrar isso convence o time de que algo explodiu quando só começou.
 *
 *   2. Amostra pequena não sustenta leitura. 31 sessões numa semana viram
 *      percentuais que oscilam violentamente — a tela avisa em vez de deixar
 *      alguém otimizar em cima de ruído.
 *
 *   3. GA4 e Clarity NUNCA se misturam. O Clarity mede ~24h e só onde o script
 *      dele carregou; o GA4 mede o período inteiro. Na UMA isso dá 8.572 contra
 *      649 — números que, lado a lado, fariam o time discutir qual está certo
 *      em vez de usar os dois. Este arquivo só conhece GA4.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type MetricasGA4 = {
  periodo?: string; inicio?: string; fim?: string;
  sessions?: number; users?: number; newUsers?: number; pageviews?: number;
  engagedSessions?: number; engagementRate?: number;
  avgEngagementDuration?: number; bounceRate?: number;
  conversions?: number; eventCount?: number;
  ecommerceDetectado?: boolean;
  anterior?: {
    inicio?: string; fim?: string;
    sessions?: number; users?: number; newUsers?: number; pageviews?: number;
    engagedSessions?: number; engagementRate?: number;
    avgEngagementDuration?: number; bounceRate?: number;
  } | null;
};

export type ListasGA4 = {
  canais?: { nome: string; sessions: number }[];
  origens?: { fonte: string; sessions: number }[];
  landingPages?: { url: string; sessions: number }[];
  paginas?: { url: string; titulo?: string; views: number }[];
  eventos?: { nome: string; contagem: number }[];
  limitacoes?: string[];
};

export type SnapshotGA4 = { metricsJson?: MetricasGA4 | null; issuesJson?: ListasGA4 | null } | null | undefined;

const n = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * Abaixo disto, percentuais oscilam demais para significar algo. ELWING tem 31
 * sessões em 7 dias — os dados aparecem, com ressalva.
 */
export const MIN_SESSOES_CONFIAVEL = 100;

export type Variacao = { pct: number; sobe: boolean } | null;

/**
 * Variação percentual contra o período anterior.
 *
 * Devolve null quando não há base: sem valor anterior, ou anterior igual a
 * zero. Crescer de 0 para 10 é notícia, mas não é uma porcentagem — e "+1000%"
 * a partir de 1 sessão é matematicamente certo e praticamente inútil.
 */
export function variacao(atual: unknown, anterior: unknown): Variacao {
  const a = n(atual), b = n(anterior);
  if (a === null || b === null || b === 0) return null;
  const pct = ((a - b) / b) * 100;
  return { pct, sobe: pct >= 0 };
}

export type CardGA4 = { chave: string; rotulo: string; valor: string; variacao: Variacao; dica?: string };

const int = (v: number) => v >= 10000 ? `${(v / 1000).toFixed(1).replace(".", ",")}k` : v.toLocaleString("pt-BR");
const pct1 = (v: number) => `${v.toFixed(1).replace(".", ",")}%`;

/** Segundos → "2min 08s" / "48s". */
export function duracao(seg: unknown): string {
  const s = n(seg);
  if (s === null || s <= 0) return "—";
  if (s < 60) return `${Math.round(s)}s`;
  return `${Math.floor(s / 60)}min ${String(Math.round(s % 60)).padStart(2, "0")}s`;
}

/** Cards de tráfego. Métrica ausente vira "—", nunca zero. */
export function cardsDeTrafego(m: MetricasGA4 | null | undefined): CardGA4[] {
  if (!m) return [];
  const ant = m.anterior ?? null;
  const card = (chave: string, rotulo: string, bruto: unknown, fmt: (v: number) => string, anteriorBruto?: unknown): CardGA4 => {
    const v = n(bruto);
    return {
      chave, rotulo,
      valor: v === null ? "—" : fmt(v),
      variacao: variacao(bruto, anteriorBruto),
    };
  };
  return [
    card("sessions", "Sessões", m.sessions, int, ant?.sessions),
    card("users", "Usuários", m.users, int, ant?.users),
    card("newUsers", "Novos usuários", m.newUsers, int, ant?.newUsers),
    card("pageviews", "Visualizações", m.pageviews, int, ant?.pageviews),
    card("engagementRate", "Taxa de engajamento", m.engagementRate, pct1, ant?.engagementRate),
    { chave: "duracao", rotulo: "Duração média", valor: duracao(m.avgEngagementDuration),
      variacao: variacao(m.avgEngagementDuration, ant?.avgEngagementDuration) },
  ];
}

/** A amostra sustenta leitura? */
export const amostraPequena = (m: MetricasGA4 | null | undefined): boolean => {
  const s = n(m?.sessions);
  return s !== null && s > 0 && s < MIN_SESSOES_CONFIAVEL;
};

export const semTrafego = (m: MetricasGA4 | null | undefined): boolean => (n(m?.sessions) ?? 0) === 0;

/**
 * Contexto dos 30 dias em uma frase. Sem seletor de período: dois valores fixos
 * não pagam um controle a mais na tela.
 */
export function contexto30d(m7: MetricasGA4 | null | undefined, m30: MetricasGA4 | null | undefined): string | null {
  const s7 = n(m7?.sessions), s30 = n(m30?.sessions);
  if (s7 === null || s30 === null || s30 === 0) return null;
  const media = Math.round(s30 / 30);
  return `${int(s7)} ${s7 === 1 ? "sessão" : "sessões"} nos últimos 7 dias · média de ${int(media)}/dia nos últimos 30.`;
}

export type Lista = { titulo: string; fonte: string; itens: { rotulo: string; valor: string }[]; restantes: number };

/** Top N com "e mais N" — volume alto não pode empurrar a tela para baixo. */
export function listaTop(
  titulo: string,
  itens: { rotulo: string; valor: number }[] | undefined,
  limite = 8,
): Lista | null {
  if (!itens || itens.length === 0) return null;
  const ordenada = [...itens].filter((i) => i.rotulo).sort((a, b) => b.valor - a.valor);
  return {
    titulo, fonte: "GA4",
    itens: ordenada.slice(0, limite).map((i) => ({ rotulo: i.rotulo, valor: int(i.valor) })),
    restantes: Math.max(0, ordenada.length - limite),
  };
}

/** As quatro listas da aba, já ordenadas e cortadas. Vazia some. */
export function listasDe(l: ListasGA4 | null | undefined): Lista[] {
  if (!l) return [];
  return [
    listaTop("Canais de aquisição", l.canais?.map((c) => ({ rotulo: c.nome, valor: c.sessions }))),
    listaTop("Origem / mídia", l.origens?.map((o) => ({ rotulo: o.fonte, valor: o.sessions }))),
    listaTop("Landing pages", l.landingPages?.map((p) => ({ rotulo: p.url, valor: p.sessions }))),
    listaTop("Páginas mais vistas", l.paginas?.map((p) => ({ rotulo: p.titulo || p.url, valor: p.views }))),
    listaTop("Eventos principais", l.eventos?.map((e) => ({ rotulo: e.nome, valor: e.contagem }))),
  ].filter((x): x is Lista => x !== null);
}
