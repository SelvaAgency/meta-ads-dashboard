/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Leituras rápidas das campanhas do Google Ads
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  Lógica pura, fora do JSX, porque é aqui que moram os dois erros fáceis de
 *  cometer e difíceis de ver na tela:
 *
 *   · dividir por zero — campanha sem impressão tem CTR indefinido, não 0%;
 *   · eleger "melhor" alguém com base em amostra minúscula. Uma campanha com
 *     3 impressões e 1 clique tem CTR de 33% e não significa nada. Chamar isso
 *     de "melhor CTR" faz o time otimizar na direção do ruído.
 *
 *  Toda leitura devolve null quando não se sustenta. Insight que não se
 *  sustenta não vira card.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type CampanhaGoogle = {
  id: string;
  name: string;
  status: string;
  advertisingChannelType?: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  conversionValue: number;
  ctr: number;
  cpc: number;
  costPerConversion: number;
  roas: number;
};

/**
 * Abaixo disto, CTR é ruído estatístico. 100 impressões não é rigor científico
 * — é o mínimo para a porcentagem não oscilar violentamente a cada clique.
 */
export const MIN_IMPRESSOES_PARA_CTR = 100;

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

export type Totais = {
  investimento: number; impressoes: number; cliques: number; conversoes: number;
  valorConversao: number; ctr: number | null; cpc: number | null;
  cpa: number | null; roas: number | null;
  temReceita: boolean;
};

/** Somatório do período. Taxas derivadas do total, nunca média de médias. */
export function totaisDe(campanhas: CampanhaGoogle[]): Totais {
  const t = campanhas.reduce((a, c) => ({
    investimento: a.investimento + num(c.spend),
    impressoes: a.impressoes + num(c.impressions),
    cliques: a.cliques + num(c.clicks),
    conversoes: a.conversoes + num(c.conversions),
    valorConversao: a.valorConversao + num(c.conversionValue),
  }), { investimento: 0, impressoes: 0, cliques: 0, conversoes: 0, valorConversao: 0 });

  return {
    ...t,
    // Média ponderada pelo total — média das médias distorce quando as
    // campanhas têm volumes muito diferentes.
    ctr: t.impressoes > 0 ? (t.cliques / t.impressoes) * 100 : null,
    cpc: t.cliques > 0 ? t.investimento / t.cliques : null,
    cpa: t.conversoes > 0 ? t.investimento / t.conversoes : null,
    roas: t.investimento > 0 && t.valorConversao > 0 ? t.valorConversao / t.investimento : null,
    temReceita: t.valorConversao > 0,
  };
}

export type Insight = { chave: string; rotulo: string; valor: string; detalhe: string; alerta?: boolean };

const brl = (n: number) => "R$ " + n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const int = (n: number) => n.toLocaleString("pt-BR");
const pct = (n: number) => `${n.toFixed(2)}%`;

/** Campanha sem entrega: zero impressão no período, esteja ativa ou não. */
export const semEntrega = (c: CampanhaGoogle): boolean => num(c.impressions) === 0;

/** Gastou e não converteu — o desperdício mais direto de detectar. */
export const gastouSemConverter = (c: CampanhaGoogle): boolean =>
  num(c.spend) > 0 && num(c.conversions) === 0;

/** Merece destaque visual na tabela. */
export const linhaComAtencao = (c: CampanhaGoogle): boolean =>
  gastouSemConverter(c) || (c.status === "ENABLED" && semEntrega(c));

export function insightsDe(campanhas: CampanhaGoogle[]): Insight[] {
  const out: Insight[] = [];
  if (campanhas.length === 0) return out;

  const maiorGasto = [...campanhas].filter((c) => num(c.spend) > 0).sort((a, b) => num(b.spend) - num(a.spend))[0];
  if (maiorGasto) {
    out.push({
      chave: "maior_investimento", rotulo: "Maior investimento",
      valor: brl(num(maiorGasto.spend)), detalhe: maiorGasto.name,
    });
  }

  // Só com amostra que sustenta a conclusão.
  const comBase = campanhas.filter((c) => num(c.impressions) >= MIN_IMPRESSOES_PARA_CTR && num(c.ctr) > 0);
  const melhorCtr = [...comBase].sort((a, b) => num(b.ctr) - num(a.ctr))[0];
  if (melhorCtr) {
    out.push({
      chave: "melhor_ctr", rotulo: "Melhor CTR",
      valor: pct(num(melhorCtr.ctr)),
      detalhe: `${melhorCtr.name} · ${int(num(melhorCtr.impressions))} impressões`,
    });
  }

  const desperdicio = campanhas.filter(gastouSemConverter).sort((a, b) => num(b.spend) - num(a.spend))[0];
  if (desperdicio) {
    out.push({
      chave: "gasto_sem_conversao", rotulo: "Maior gasto sem conversão",
      valor: brl(num(desperdicio.spend)), detalhe: desperdicio.name, alerta: true,
    });
  }

  const paradas = campanhas.filter((c) => c.status === "ENABLED" && semEntrega(c));
  if (paradas.length > 0) {
    out.push({
      chave: "sem_entrega", rotulo: "Ativas sem entrega",
      valor: String(paradas.length),
      detalhe: paradas.slice(0, 2).map((c) => c.name).join(" · ") + (paradas.length > 2 ? ` e mais ${paradas.length - 2}` : ""),
      alerta: true,
    });
  }

  // ROAS só existe onde há valor de conversão. Sem receita, não é "ROAS zero" —
  // é métrica que não se aplica, e mostrar 0,00x sugeriria fracasso.
  const comReceita = campanhas.filter((c) => num(c.conversionValue) > 0 && num(c.spend) > 0);
  const melhorRoas = [...comReceita].sort((a, b) => num(b.roas) - num(a.roas))[0];
  if (melhorRoas) {
    out.push({
      chave: "melhor_roas", rotulo: "Melhor ROAS",
      valor: `${num(melhorRoas.roas).toFixed(2)}x`, detalhe: melhorRoas.name,
    });
  }

  return out;
}

/** SEARCH → "Busca". Rótulo em português, sem inventar tipo que não veio. */
export function rotuloDoCanal(tipo: string | undefined | null): string {
  if (!tipo) return "—";
  const mapa: Record<string, string> = {
    SEARCH: "Busca", DISPLAY: "Display", SHOPPING: "Shopping",
    PERFORMANCE_MAX: "Performance Max", VIDEO: "Vídeo", DEMAND_GEN: "Demand Gen",
    MULTI_CHANNEL: "Multicanal", LOCAL: "Local", SMART: "Smart", DISCOVERY: "Discovery",
  };
  return mapa[tipo] ?? tipo.replace(/_/g, " ").toLowerCase();
}
