/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Status da IA da conta (aiStatusColor + resumo) — fonte ÚNICA do prompt
 * ─────────────────────────────────────────────────────────────────────────────
 *  Antes o prompt de classificação vivia DUPLICADO em dois lugares (o cron
 *  noturno em autoSync e a mutation "reanalisar" no router), e divergia. Aqui
 *  ele é um só, calibrado e ciente do objetivo da conta.
 *
 *  A cor é a SAÚDE guiada por resultados (ver shared/saudeConta.ts): green =
 *  saudável, yellow = atenção, red = crítico — sempre RELATIVA às metas/média da
 *  conta, conservadora com o vermelho.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { invokeLLM, extractTextContent } from "../_core/llm";
import {
  getMetaAdAccountById,
  getAccountMetricsSummary,
  updateAccountAiStatus,
  appendAccountLearning,
} from "../db";
import { blocoDeContextoParaIA } from "@shared/contextoDaAnalise";

const AGENCY_TZ = "America/Sao_Paulo";
function toIsoLocal(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: AGENCY_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
function ultimos7(): { startDate: string; endDate: string } {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 6);
  return { startDate: toIsoLocal(start), endDate: toIsoLocal(end) };
}

const ROAS_GOALS = new Set(["SALES", "VALUE"]);

export type StatusIA = { color: "green" | "yellow" | "red"; summary: string };

/**
 * Recalcula o status da IA (cor + resumo) de UMA conta e grava. Usado tanto pelo
 * cron noturno quanto pela reanálise manual (individual e em massa). Registra um
 * aprendizado quando a cor MUDA (evento memorável), sem gerar ruído.
 */
export async function refreshAccountAiStatus(
  accountId: number,
  userId: number,
  opts: { adhocContexto?: string } = {},
): Promise<StatusIA> {
  const accountData = await getMetaAdAccountById(accountId);
  const goalType = (accountData as { goalTypeOverride?: string | null })?.goalTypeOverride ?? "DEFAULT";
  const roasApplies = ROAS_GOALS.has(goalType);

  const { startDate, endDate } = ultimos7();
  const metrics = await getAccountMetricsSummary(accountId, startDate, endDate);
  const totals = metrics.reduce(
    (acc, m) => ({
      spend: acc.spend + Number(m.totalSpend ?? 0),
      impressions: acc.impressions + Number(m.totalImpressions ?? 0),
      clicks: acc.clicks + Number(m.totalClicks ?? 0),
      conversions: acc.conversions + Number(m.totalConversions ?? 0),
      conversionValue: acc.conversionValue + Number(m.totalConversionValue ?? 0),
    }),
    { spend: 0, impressions: 0, clicks: 0, conversions: 0, conversionValue: 0 },
  );
  const roas = totals.spend > 0 ? totals.conversionValue / totals.spend : 0;
  const cpa = totals.conversions > 0 ? totals.spend / totals.conversions : 0;
  const ctr = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;

  const { montarContextoDaConta } = await import("./contextoConta");
  const { texto: ctxTexto } = await montarContextoDaConta({ accountId, userId }).catch(() => ({ texto: "" }));
  // O enquadramento vem de `shared/contextoDaAnalise`, o MESMO das outras
  // análises. Aqui a embalagem dizia "pode explicar variações que os números
  // não mostram" — descrição de comentário de cor. Diante de "essa compra foi
  // teste, desconsidere", o modelo mencionava o teste e seguia contando a
  // conversão, porque foi isso que o prompt pediu.
  const { bloco: blocoCtx } = blocoDeContextoParaIA(ctxTexto, opts.adhocContexto);

  /**
   * Os contextos de PONTO vêm depois do da conta, e a ordem é a prioridade: o
   * último a ser lido é o que prevalece quando os dois falam do mesmo fato. O
   * do ponto foi escrito olhando aquele alerta, então ele ganha.
   */
  const { montarContextoDosPontos } = await import("./contextoConta");
  const { montarClientesPanorama } = await import("./jornalExecutivo");
  const { avaliarCliente } = await import("../../shared/panoramaLogic");
  const blocoPontos = await (async () => {
    try {
      const clientes = await montarClientesPanorama();
      const meu = clientes.find((c) => c.accountId === accountId);
      if (!meu) return "";
      return await montarContextoDosPontos(accountId, avaliarCliente(meu).achados);
    } catch { return ""; }
  })();

  const dados = roasApplies
    ? { ...totals, roas: roas.toFixed(2), cpa: cpa.toFixed(2), ctr: ctr.toFixed(2) }
    : { spend: totals.spend, conversions: totals.conversions, clicks: totals.clicks, impressions: totals.impressions, cpa: cpa.toFixed(2), ctr: ctr.toFixed(2) };

  const prompt = `Você classifica a SAÚDE de uma conta de mídia dos últimos 7 dias. Retorne um JSON com "color" (green/yellow/red) e "summary" (máx 300 caracteres em pt-BR, sem emoji: (1) status geral, (2) principal métrica positiva OU problemática com valor, (3) uma ação objetiva).

Classifique SEMPRE em relação às metas desta conta (quando houver no contexto) e à própria média/tendência da conta — NUNCA em absoluto:
- green (Saudável): resultados dentro ou ACIMA das metas/média; nada exige ação hoje. Uma conta indo bem ou melhor que o normal é green, mesmo com pequenos ajustes possíveis.
- yellow (Atenção): algo piorou, ficou abaixo da meta ou merece um olhar — sem ser emergência.
- red (Crítico): problema REAL queimando dinheiro ou travando resultado AGORA (ex.: gasto relevante sem conversão, ROAS muito abaixo da meta, queda abrupta).

Seja CONSERVADOR com o vermelho: uma conta acima da média NUNCA é vermelha. Na dúvida entre dois níveis, escolha o mais brando. A maioria das contas saudáveis deve ser green.

Objetivo da conta: ${goalType}${!roasApplies ? ` — IMPORTANTE: esta conta é de ${goalType}, NÃO de e-commerce. NUNCA mencione ROAS, valor de conversão ou rastreamento de receita como problema. Avalie APENAS: volume de resultados (mensagens/cliques/alcance), custo por resultado e CTR.` : ""}${blocoCtx}${blocoPontos}

Dados:
${JSON.stringify(dados)}`;

  const result = await invokeLLM({
    messages: [{ role: "user", content: prompt }],
    responseFormat: { type: "json_object" },
    thinking: false,
  });

  let color: "green" | "yellow" | "red" = "yellow";
  let summary = "Análise pendente";
  try {
    const parsed = JSON.parse(extractTextContent(result));
    if (["green", "yellow", "red"].includes(parsed.color)) color = parsed.color;
    if (typeof parsed.summary === "string") summary = parsed.summary.slice(0, 300);
  } catch { /* mantém defaults */ }

  const prevColor = (accountData as { aiStatusColor?: string | null })?.aiStatusColor ?? null;
  await updateAccountAiStatus(accountId, color, summary);

  if (prevColor && prevColor !== color) {
    const rot = (c: string) => (c === "green" ? "Saudável" : c === "yellow" ? "Atenção" : c === "red" ? "Crítico" : c);
    await appendAccountLearning(accountId, `Mudança de estado: ${rot(prevColor)} → ${rot(color)}. ${summary}`, "auto-observacao").catch(() => {});
  }

  return { color, summary };
}
