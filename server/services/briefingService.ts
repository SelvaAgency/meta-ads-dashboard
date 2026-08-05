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
import { createHash } from "node:crypto";
import {
  contasDeMidia, getAccountMetricsSummary,
  getDailyBriefing, saveDailyBriefing, getAccountContext,
  getBriefingSegmentado, saveBriefingSegmentado,
} from "../db";
import { montarClientesPanorama } from "./jornalExecutivo";
import { achadosDe, vendasDe, type ClientePanorama } from "../../shared/panoramaLogic";

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

  const contas = await contasDeMidia();
  if (!contas.length) {
    logger.info("[Briefing] Nenhuma conta ativa — nada a resumir.");
    return null;
  }
  const conteudo = await montarBriefing(contas, dia);
  if (conteudo) await saveDailyBriefing(BRIEFING_GLOBAL_USER, dia, conteudo);
  return conteudo;
}

/** Identidade estável de um conjunto de contas — a chave do cache segmentado. */
export function chaveDeSegmento(accountIds: number[]): string {
  const ordenado = Array.from(new Set(accountIds)).sort((a, b) => a - b).join(",");
  return createHash("sha256").update(ordenado).digest("hex").slice(0, 40);
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Briefing SEGMENTADO — a narrativa de um subconjunto de clientes
 * ─────────────────────────────────────────────────────────────────────────────
 *  A garantia de não-vazamento não é um filtro na saída do texto: é a AUSÊNCIA
 *  na entrada. O prompt é montado a partir das contas recebidas, então o modelo
 *  não tem como citar um cliente que nunca viu. Filtrar depois seria confiar
 *  que o texto gerado não menciona quem não devia — e texto livre não dá essa
 *  garantia.
 *
 *  Cache por CONJUNTO de contas, não por pessoa: os três do Grupo 1 leem a
 *  mesma narrativa e gastam UMA chamada de LLM. Sem isso seriam três — e cada
 *  abertura da prévia geraria outra, o que torna a tela lenta e cara justamente
 *  enquanto alguém itera no design.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function obterBriefingSegmentado(dia: string, accountIds: number[]): Promise<string | null> {
  if (accountIds.length === 0) return null;
  const chave = chaveDeSegmento(accountIds);

  const cache = await getBriefingSegmentado(dia, chave);
  if (cache) return cache;

  const todas = await contasDeMidia();
  const permitidas = new Set(accountIds);
  const contas = todas.filter((c) => permitidas.has(c.id));
  if (!contas.length) {
    logger.info(`[Briefing] Segmento sem conta ativa (${accountIds.length} pedida(s)) — nada a resumir.`);
    return null;
  }

  const conteudo = await montarBriefing(contas, dia);
  if (conteudo) await saveBriefingSegmentado(dia, chave, conteudo);
  return conteudo;
}

/**
 * Monta e gera o briefing das CONTAS RECEBIDAS. Não consulta a lista de contas
 * por conta própria — é isso que permite a versão segmentada existir sem
 * duplicar o prompt, e o que garante que o modelo só vê o que foi passado.
 */
async function montarBriefing(
  contas: Awaited<ReturnType<typeof contasDeMidia>>,
  dia: string,
): Promise<string | null> {

  // Últimas 48h: hoje ainda está parcial, ontem já consolidou.
  const fmt = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
  const agora = new Date();
  const inicio = fmt(new Date(agora.getTime() - 48 * 3600 * 1000));
  const fim = fmt(agora);

  const metricas = await Promise.all(contas.map((a) => getAccountMetricsSummary(a.id, inicio, fim)));
  // Só o FOCO DO MOMENTO por conta (contexto leve e de alto sinal p/ o read diário).
  const contextos = await Promise.all(contas.map((a) => getAccountContext(a.id).catch(() => null)));

  // Sinais de OUTRAS fontes (GA4, loja/vendas reais, site) por conta — mesmo motor
  // do Panorama/Jornalzinho. Em try/catch: se o panorama falhar, o briefing Meta
  // (que já funciona) segue normalmente, só sem o enriquecimento multi-fonte.
  let panoramaPorConta = new Map<number, ClientePanorama>();
  try {
    // Restringe às contas recebidas: o enriquecimento multi-fonte não pode
    // reintroduzir, por outro caminho, o cliente que o filtro tirou.
    const daqui = new Set(contas.map((c) => c.id));
    const clientes = (await montarClientesPanorama()).filter((c) => daqui.has(c.accountId));
    panoramaPorConta = new Map(clientes.map((c) => [c.accountId, c]));
  } catch (e) {
    logger.warn(`[Briefing] Panorama multi-fonte indisponível: ${(e as Error).message}`);
  }

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

    // Enriquecimento multi-fonte: vendas reais (loja/GA4) + sinais do site/tráfego.
    const pano = panoramaPorConta.get(a.id);
    let extra = "";
    if (pano) {
      const v = vendasDe(pano);
      const sinais = achadosDe(pano).filter((x) => x.severidade !== "info").slice(0, 2).map((x) => x.texto);
      const partes: string[] = [];
      if (v && v.receita != null) {
        partes.push(`Vendas ${v.rotuloFonte} (${v.janela}): R$${v.receita.toFixed(0)}${v.pedidos != null ? ` em ${v.pedidos} pedido(s)` : ""}`);
      }
      if (sinais.length) partes.push(`Sinais de site/tráfego: ${sinais.join("; ")}`);
      if (partes.length) extra = ` | Outras fontes → ${partes.join(" · ")}`;
    }

    const foco = contextos[i]?.focusMoment?.trim();
    const focoTxt = foco ? ` | FOCO DO MOMENTO: ${foco}` : "";
    return `- ${a.accountName ?? a.accountId}: Estado ${estado}, Investido R$${spend.toFixed(2)}${mostraRoas ? `, ROAS ${roas}x` : ` (objetivo: ${goal})`}, ${mostraRoas ? `Conversões: ${conv}` : `Resultados (${goal}): ${conv}`}${spend <= 0 ? " [SEM DADOS — pode estar inativa por decisão estratégica]" : ""}${resumo ? ". " + resumo : ""}${extra}${focoTxt}`;
  }).join("\n");

  const prompt = `Você é um analista sênior de performance da agência SELVA. Você olha o desempenho de cada cliente de forma COMPLETA: não só Meta Ads, mas também vendas reais da loja (WooCommerce/VNDA ou GA4), tráfego (GA4) e saúde do site. Retorne um JSON com exatamente 4 campos: "resumo" (frase executiva fluida descrevendo o estado geral do portfólio — tom direto, termina com ponto final, máx 120 caracteres, NÃO liste apenas contagens), "positivo" (o que está indo bem — contas saudáveis, métricas positivas, 1-2 frases), "atencao" (contas que merecem monitoramento mas não são críticas, 1-2 frases), "critico" (problemas urgentes que precisam de ação imediata, 1-2 frases). Qualquer campo exceto "resumo" pode ser null se não houver nada relevante.
REGRAS CRÍTICAS:
- Considere TODAS as fontes, não só Meta. Para cada conta, destaque o que é mais relevante PARA AQUELA CONTA: e-commerce → vendas reais/ROAS; leads/mensagens → resultados; e sempre a saúde do site/tráfego quando houver sinal.
- Os dados de cada conta podem trazer um trecho "Outras fontes →" com vendas reais, quedas de tráfego, vazamento de funil (carrinho/checkout), site fora do ar ou SSL. Trate esses sinais como de PRIMEIRA CLASSE.
- Um problema técnico grave (site fora do ar, SSL vencido) é CRÍTICO mesmo que o Meta esteja saudável — dinheiro em mídia jogando tráfego para um site quebrado é urgente.
- Contas com objetivo MESSAGES, TRAFFIC, ENGAGEMENT, AWARENESS: NUNCA mencione ROAS como problema — não se aplica a esses objetivos.
- Contas marcadas como [SEM DADOS]: não trate como críticas — podem estar inativas por decisão estratégica do cliente.
- Foque nos padrões reais de performance, não em ausência de métricas irrelevantes para o objetivo.
Dados (últimas 48h — hoje + ontem; "Outras fontes" pode ter janela 7d/30d, o que é normal para site/vendas):
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
    logger.info(`[Briefing] Gerado para ${dia} (${contas.length} conta(s)).`);
    return conteudo;
  } catch (e) {
    // Barulhento de propósito: falha silenciosa aqui vira "email não chegou" sem pista.
    logger.error(`[Briefing] Falha ao gerar (${dia}): ${(e as Error).message}`);
    return null;
  }
}
