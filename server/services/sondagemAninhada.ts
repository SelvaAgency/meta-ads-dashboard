/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Os insights cabem na mesma chamada da listagem de mídias?
 * ─────────────────────────────────────────────────────────────────────────────
 *  Se couberem, as 25 chamadas de insight por cliente viram ZERO extras, e o
 *  total cai de 186 para ~6. Se não couberem, segue a otimização já confirmada
 *  (186 → 31), que não depende disto.
 *
 *  ── A pergunta que decide, e não é "responde?" ─────────────────────────────
 *  É o que acontece quando uma métrica não vale para um tipo de mídia. Existem
 *  dois comportamentos possíveis, e eles são opostos:
 *
 *    A mídia vem SEM insights      tolerável — perde-se aquela, o resto fica
 *    A chamada INTEIRA é recusada  inaceitável — um reel derruba a lista toda,
 *                                  e o cliente fica sem publicação nenhuma
 *
 *  O segundo caso seria pior que o desenho atual, onde uma métrica morta custa
 *  uma métrica. Por isso a sondagem tenta conjuntos progressivamente menores:
 *  se `reach` sozinho passa e o conjunto cheio não, o aninhamento funciona e o
 *  problema é uma métrica específica — que dá para descobrir e remover.
 *
 *  ── E por tipo, porque eles não são iguais ─────────────────────────────────
 *  Reel, vídeo de feed, carrossel e imagem aceitam conjuntos diferentes. Uma
 *  sondagem que olhasse só a mídia mais recente concluiria pelo tipo dela e
 *  erraria nos outros três.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { sanitizar } from "./instagram";
import type { Consultar } from "./instagramSondagem";

/** Do conjunto cheio ao mínimo. A primeira que servir encerra a busca. */
const CONJUNTOS: Array<{ nome: string; metricas: string[] }> = [
  { nome: "cheio (7)", metricas: ["reach", "views", "total_interactions", "likes", "comments", "saved", "shares"] },
  { nome: "sem saved/shares", metricas: ["reach", "views", "total_interactions", "likes", "comments"] },
  { nome: "reach+views", metricas: ["reach", "views"] },
  { nome: "só reach", metricas: ["reach"] },
];

export interface MidiaSondada {
  id: string;
  tipo: string | null;
  produto: string | null;
  vieram: string[];
  faltaram: string[];
}

export interface SondagemAninhada {
  /** O conjunto que a Meta aceitou, se algum. */
  conjuntoQueServiu: string | null;
  metricasDoConjunto: string[];
  tentativas: Array<{ nome: string; ok: boolean; detalhe: string }>;
  midias: MidiaSondada[];
  /** Por tipo de conteúdo: quantas vieram e quais métricas cada tipo entregou. */
  porTipo: Record<string, { total: number; comInsights: number; metricas: string[] }>;
  /** O formato aninhado bate com o que o normalizador já lê? */
  formatoCompativel: boolean;
  formaObservada: string;
  texto: string;
}

/** Descreve a estrutura de `insights`, sem despejar a resposta crua. */
function formaDosInsights(ins: unknown): { compativel: boolean; forma: string; nomes: string[] } {
  const dados = (ins as { data?: unknown })?.data;
  if (!Array.isArray(dados)) return { compativel: false, forma: "sem `data` dentro de `insights`", nomes: [] };
  const nomes: string[] = [];
  let temValues = 0;
  let temTotalValue = 0;
  for (const d of dados as Array<Record<string, unknown>>) {
    if (d.name) nomes.push(String(d.name));
    if (Array.isArray(d.values)) temValues += 1;
    if (d.total_value && typeof d.total_value === "object") temTotalValue += 1;
  }
  // O normalizador lê `values[0].value` e, como reserva, `total_value.value`.
  const compativel = temValues > 0 || temTotalValue > 0;
  return {
    compativel,
    forma: `insights.data[${dados.length}] · ${temValues} com values[] · ${temTotalValue} com total_value`,
    nomes,
  };
}

export async function sondarInsightsAninhados(
  consultar: Consultar,
  base: string,
  limite = 12,
): Promise<SondagemAninhada> {
  const tentativas: SondagemAninhada["tentativas"] = [];
  let conjuntoQueServiu: string | null = null;
  let metricasDoConjunto: string[] = [];
  let bruto: Array<Record<string, unknown>> = [];

  for (const c of CONJUNTOS) {
    const fields = `id,timestamp,media_type,media_product_type,insights.metric(${c.metricas.join(",")})`;
    try {
      const r = await consultar<{ data?: Array<Record<string, unknown>> }>(
        `${base}/media`, { fields, limit: String(limite) });
      const itens = r.data ?? [];
      const comInsights = itens.filter((m) => m.insights).length;
      tentativas.push({
        nome: c.nome, ok: true,
        detalhe: `${itens.length} mídia(s) · ${comInsights} com insights aninhados`,
      });
      if (!conjuntoQueServiu) {
        conjuntoQueServiu = c.nome;
        metricasDoConjunto = c.metricas;
        bruto = itens;
      }
      // Achou o maior conjunto que passa — não precisa testar os menores.
      break;
    } catch (e) {
      tentativas.push({ nome: c.nome, ok: false, detalhe: sanitizar((e as Error).message) });
    }
  }

  const midias: MidiaSondada[] = [];
  const porTipo: SondagemAninhada["porTipo"] = {};
  let formatoCompativel = false;
  let formaObservada = "nenhuma mídia com insights";

  for (const m of bruto) {
    const produto = m.media_product_type ? String(m.media_product_type) : null;
    const tipo = m.media_type ? String(m.media_type) : null;
    const chave = `${produto ?? "?"}/${tipo ?? "?"}`;
    const f = formaDosInsights(m.insights);
    if (m.insights) {
      formatoCompativel = formatoCompativel || f.compativel;
      formaObservada = f.forma;
    }
    const vieram = f.nomes;
    const faltaram = metricasDoConjunto.filter((x) => !vieram.includes(x));

    midias.push({ id: String(m.id ?? ""), tipo, produto, vieram, faltaram });
    porTipo[chave] ??= { total: 0, comInsights: 0, metricas: [] };
    porTipo[chave].total += 1;
    if (m.insights) porTipo[chave].comInsights += 1;
    for (const n of vieram) if (!porTipo[chave].metricas.includes(n)) porTipo[chave].metricas.push(n);
  }

  return {
    conjuntoQueServiu, metricasDoConjunto, tentativas, midias, porTipo,
    formatoCompativel, formaObservada,
    texto: montar({ conjuntoQueServiu, metricasDoConjunto, tentativas, midias, porTipo, formatoCompativel, formaObservada }),
  };
}

function montar(r: Omit<SondagemAninhada, "texto">): string {
  const out = ["sondagem de insights aninhados na listagem de mídias", ""];
  for (const t of r.tentativas) out.push(`[${t.ok ? "SIM" : "NÃO"}] ${t.nome.padEnd(18)} ${t.detalhe}`);
  out.push("");

  if (!r.conjuntoQueServiu) {
    out.push("NENHUM conjunto passou aninhado na listagem.");
    out.push("→ O aninhamento não serve. Seguir com a otimização já confirmada,");
    out.push("  186 → 31 chamadas por cliente, que não depende disto.");
    return out.join("\n");
  }

  out.push(`Conjunto aceito: ${r.conjuntoQueServiu} — ${r.metricasDoConjunto.join(", ")}`);
  out.push(`Formato: ${r.formaObservada}`);
  out.push(r.formatoCompativel
    ? "→ COMPATÍVEL com o normalizador atual (values[] ou total_value)."
    : "→ INCOMPATÍVEL: o normalizador precisaria mudar para ler este formato.");
  out.push("");

  out.push("── POR TIPO DE CONTEÚDO ──");
  for (const [chave, v] of Object.entries(r.porTipo)) {
    out.push(`${chave.padEnd(22)} ${v.comInsights}/${v.total} com insights · ${v.metricas.join(", ") || "nenhuma métrica"}`);
  }
  out.push("");

  const semInsights = r.midias.filter((m) => m.vieram.length === 0);
  const incompletas = r.midias.filter((m) => m.vieram.length > 0 && m.faltaram.length > 0);
  if (semInsights.length) {
    out.push(`${semInsights.length} mídia(s) vieram SEM insights — e a chamada não caiu por isso.`);
    out.push("Esse é o comportamento tolerável: perde-se aquela mídia, o resto fica.");
  }
  if (incompletas.length) {
    out.push(`${incompletas.length} mídia(s) vieram com métricas faltando:`);
    for (const m of incompletas.slice(0, 5)) {
      out.push(`  ${m.produto}/${m.tipo}: faltou ${m.faltaram.join(", ")}`);
    }
  }
  if (!semInsights.length && !incompletas.length) {
    out.push("Todas as mídias vieram com o conjunto completo.");
  }

  out.push("");
  out.push("── O QUE ISSO SIGNIFICA ──");
  out.push(r.formatoCompativel
    ? "As 25 chamadas de insight por cliente viram ZERO extras: o total cai de"
    : "O aninhamento responde, mas num formato que o normalizador não lê hoje.");
  out.push(r.formatoCompativel
    ? "186 para ~6 por cliente. Confirmar antes as métricas por tipo acima."
    : "Avaliar se adaptar o normalizador compensa, ou seguir com 186 → 31.");
  return out.join("\n");
}
