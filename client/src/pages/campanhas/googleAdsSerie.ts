/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Série diária do Google Ads — preparo dos pontos do gráfico
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  O servidor manda somas cruas por dia (o Google omite dias sem veiculação).
 *  Aqui a série vira contínua e ganha taxas — e é onde moram as duas regras
 *  que o gráfico não pode violar:
 *
 *   · Dia sem linha vira ZERO nas métricas de volume. Zero é verdade em série
 *     temporal: não veiculou. Um buraco no eixo faria dois dias distantes
 *     parecerem vizinhos.
 *
 *   · Taxa de dia sem base vira NULL, nunca zero. "CTR 0%" num dia sem
 *     impressão é mentira com aparência de dado — o tooltip mostra "—".
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type PontoBruto = {
  dia: string;           // YYYY-MM-DD
  custo: number;
  impressoes: number;
  cliques: number;
  conversoes: number;
  valorConversao: number;
};

export type PontoSerie = PontoBruto & {
  /** Rótulo curto para o eixo: "15/07". */
  rotulo: string;
  ctr: number | null;
  cpc: number | null;
  cpa: number | null;
  roas: number | null;
};

const n = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** "2026-07-15" → "15/07", sem passar por Date (fuso não pode deslocar o dia). */
const rotuloDe = (ymd: string): string => {
  const [, m, d] = ymd.split("-");
  return d && m ? `${d}/${m}` : ymd;
};

/** Dias de `inicio` a `fim`, inclusivos, em YYYY-MM-DD — UTC puro, sem fuso. */
export function diasDoPeriodo(inicio: string, fim: string): string[] {
  const ini = Date.parse(`${inicio}T00:00:00Z`);
  const end = Date.parse(`${fim}T00:00:00Z`);
  if (!Number.isFinite(ini) || !Number.isFinite(end) || end < ini) return [];
  const out: string[] = [];
  // Teto defensivo: período vem limitado a 90 no servidor; 400 segura qualquer
  // engano sem permitir loop gigante.
  for (let t = ini; t <= end && out.length < 400; t += 86_400_000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

/**
 * Série contínua e com taxas, pronta para o gráfico.
 *
 * Devolve [] quando não houve NENHUMA veiculação no período — o painel não
 * aparece, em vez de desenhar um eixo de zeros fingindo ser gráfico.
 */
export function montarSerie(inicio: string, fim: string, brutos: PontoBruto[]): PontoSerie[] {
  const porDia = new Map(brutos.map((b) => [b.dia, b]));
  const teveVeiculacao = brutos.some((b) => n(b.custo) > 0 || n(b.impressoes) > 0 || n(b.cliques) > 0);
  if (!teveVeiculacao) return [];

  return diasDoPeriodo(inicio, fim).map((dia) => {
    const b = porDia.get(dia);
    const custo = n(b?.custo), impressoes = n(b?.impressoes), cliques = n(b?.cliques);
    const conversoes = n(b?.conversoes), valorConversao = n(b?.valorConversao);
    return {
      dia, rotulo: rotuloDe(dia),
      custo, impressoes, cliques, conversoes, valorConversao,
      ctr: impressoes > 0 ? (cliques / impressoes) * 100 : null,
      cpc: cliques > 0 ? custo / cliques : null,
      cpa: conversoes > 0 ? custo / conversoes : null,
      roas: custo > 0 && valorConversao > 0 ? valorConversao / custo : null,
    };
  });
}

export type MetricaGrafico = "custo" | "cliques" | "conversoes" | "impressoes";

export const METRICAS_GRAFICO: { chave: MetricaGrafico; rotulo: string }[] = [
  { chave: "custo", rotulo: "Investimento" },
  { chave: "cliques", rotulo: "Cliques" },
  { chave: "conversoes", rotulo: "Conversões" },
  { chave: "impressoes", rotulo: "Impressões" },
];

/** Formata o valor da métrica ativa no tooltip/eixo. */
export function formatarMetrica(chave: MetricaGrafico, v: number): string {
  if (chave === "custo") return "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return v.toLocaleString("pt-BR");
}

/** Linha do tooltip com as taxas do dia — "—" onde não há base. */
export function taxasDoDia(p: PontoSerie): string {
  const fmt = (v: number | null, f: (x: number) => string) => (v === null ? "—" : f(v));
  return [
    `CTR ${fmt(p.ctr, (v) => `${v.toFixed(2)}%`)}`,
    `CPC ${fmt(p.cpc, (v) => `R$ ${v.toFixed(2)}`)}`,
    `CPA ${fmt(p.cpa, (v) => `R$ ${v.toFixed(2)}`)}`,
    `ROAS ${fmt(p.roas, (v) => `${v.toFixed(2)}x`)}`,
  ].join(" · ");
}
