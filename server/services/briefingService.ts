/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Briefing diário — geração compartilhada
 * ─────────────────────────────────────────────────────────────────────────────
 *  O briefing é GLOBAL: fala de todas as contas ativas, e o conteúdo é o mesmo
 *  para qualquer pessoa. Antes ele vivia dentro de uma query tRPC e era gravado
 *  por usuário — dois erros que se somavam:
 *
 *   · presa na query → o cron não tinha como gerar, só quem abrisse a tela;
 *   · gravado por pessoa → 24 cópias do mesmo texto, e o job procurava a cópia
 *     de um usuário arbitrário (o `contato`), que podia ser de outro dia.
 *
 *  Resultado: o email diário NUNCA saiu (zero DAILY_BRIEFING no histórico).
 *
 *  Agora: uma linha por dia (BRIEFING_GLOBAL_USER), gerada por quem chegar
 *  primeiro — cron ou tela — e reusada pelos dois.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { invokeLLM, extractTextContent } from "../_core/llm";
import { logger } from "../logger";
import {
  getAllActiveMetaAdAccountsForListing, getAccountMetricsSummary,
  getDailyBriefing, saveDailyBriefing,
} from "../db";

/**
 * O briefing é global, mas a tabela é chaveada por (userId, date). Usamos um
 * userId sentinela em vez de migrar a tabela — aditivo e reversível.
 */
export const BRIEFING_GLOBAL_USER = 0;

const ROAS_GOALS = ["SALES", "VALUE"];

/** Data local da agência — nunca toISOString (o corte do dia é São Paulo). */
export function diaAgencia(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export type Briefing = { resumo: string | null; positivo: string | null; atencao: string | null; critico: string | null };

/**
 * Devolve o briefing do dia, gerando se ainda não existir. Idempotente: o
 * segundo a chamar no mesmo dia lê o cache em vez de gastar outra chamada de LLM.
 */
export async function obterBriefingDoDia(dia = diaAgencia()): Promise<string | null> {
  const cache = await getDailyBriefing(BRIEFING_GLOBAL_USER, dia);
  if (cache) return cache;

  const contas = await getAllActiveMetaAdAccountsForListing();
  if (!contas.length) {
    logger.info("[Briefing] Nenhuma conta ativa — nada a resumir.");
    return null;
  }

  // Últimas 48h: hoje ainda está parcial, ontem já consolidou.
  const fmt = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
  const agora = new Date();
  const inicio = fmt(new Date(agora.getTime() - 48 * 3600 * 1000));
  const fim = fmt(agora);

  const metricas = await Promise.all(contas.map((a) => getAccountMetricsSummary(a.id, inicio, fim)));
  const linhas = contas.map((a, i) => {
    const rows = metricas[i] ?? [];
    const spend = rows.reduce((s, r) => s + Number(r.totalSpend ?? 0), 0);
    const conv = rows.reduce((s, r) => s + Number(r.totalConversions ?? 0), 0);
    const valor = rows.reduce((s, r) => s + Number(r.totalConversionValue ?? 0), 0);
    const goal = (a as { goalTypeOverride?: string }).goalTypeOverride ?? "DEFAULT";
    const mostraRoas = ROAS_GOALS.includes(goal);
    const roas = spend > 0 ? (valor / spend).toFixed(2) : "0.00";
    const estado = a.aiStatusColor
      ? ({ green: "A (saudável)", yellow: "B (atenção)", red: "C (crítico)" } as Record<string, string>)[a.aiStatusColor] ?? "sem análise"
      : "sem análise";
    const resumo = mostraRoas ? (a.aiStatusSummary ?? "Sem análise") : "";
    return `- ${a.accountName ?? a.accountId}: Estado ${estado}, Investido R$${spend.toFixed(2)}${mostraRoas ? `, ROAS ${roas}x` : ` (objetivo: ${goal})`}, ${mostraRoas ? `Conversões: ${conv}` : `Resultados (${goal}): ${conv}`}${spend <= 0 ? " [SEM DADOS — pode estar inativa por decisão estratégica]" : ""}${resumo ? ". " + resumo : ""}`;
  }).join("\n");

  const prompt = `Você é um analista sênior de mídia paga da agência SELVA. Retorne um JSON com exatamente 4 campos: "resumo" (frase executiva fluida descrevendo o estado geral do portfólio — tom direto, termina com ponto final, máx 120 caracteres, NÃO liste apenas contagens), "positivo" (o que está indo bem — contas saudáveis, métricas positivas, 1-2 frases), "atencao" (contas que merecem monitoramento mas não são críticas, 1-2 frases), "critico" (problemas urgentes que precisam de ação imediata, 1-2 frases). Qualquer campo exceto "resumo" pode ser null se não houver nada relevante.
REGRAS CRÍTICAS:
- Contas com objetivo MESSAGES, TRAFFIC, ENGAGEMENT, AWARENESS: NUNCA mencione ROAS como problema — não se aplica a esses objetivos
- Contas marcadas como [SEM DADOS]: não trate como críticas — podem estar inativas por decisão estratégica do cliente
- Foque nos padrões reais de performance, não em ausência de métricas irrelevantes para o objetivo
Dados (últimas 48h — hoje + ontem):
${linhas}
Escreva em português brasileiro, de forma direta e profissional. Destaque padrões, o que está indo bem e o que precisa de atenção imediata. Não use markdown, listas ou tópicos — escreva em prosa corrida. Se os dados de hoje estiverem zerados, baseie-se nos dados de ontem que estão consolidados.`;

  try {
    const resp = await invokeLLM({ messages: [{ role: "user", content: prompt }], maxTokens: 900, responseFormat: { type: "json_object" } });
    const bruto = extractTextContent(resp);
    let conteudo = bruto;
    try {
      const p = JSON.parse(bruto);
      conteudo = JSON.stringify({ resumo: p.resumo ?? null, positivo: p.positivo ?? null, atencao: p.atencao ?? null, critico: p.critico ?? null });
    } catch { /* guarda o texto cru como fallback */ }
    await saveDailyBriefing(BRIEFING_GLOBAL_USER, dia, conteudo);
    logger.info(`[Briefing] Gerado para ${dia} (${contas.length} contas).`);
    return conteudo;
  } catch (e) {
    // Barulhento de propósito: falha silenciosa aqui vira "email não chegou" sem pista.
    logger.error(`[Briefing] Falha ao gerar (${dia}): ${(e as Error).message}`);
    return null;
  }
}
