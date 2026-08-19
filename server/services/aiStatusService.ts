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
import { decidirGeracaoDaAnalise, type MotivoDaDecisao } from "@shared/frescorDaAnalise";
import { logger } from "../logger";

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

export type StatusIA = {
  color: "green" | "yellow" | "red";
  summary: string;
  /**
   * `true` quando a leitura veio do banco em vez do modelo.
   *
   * Sobe até quem chamou porque é ele que conta o ciclo: sem isso, "13 contas
   * processadas" não distingue treze análises de treze reaproveitamentos.
   */
  reusada?: boolean;
  motivo?: MotivoDaDecisao;
};

/**
 * O contexto mais recente da conta — o dos DOIS níveis.
 *
 * Mesma regra que a tela usa para dizer "análise desatualizada": explicar um
 * ponto também envelhece a leitura, e comparar só com o contexto da conta
 * deixaria a análise velha no ar justamente no caso que motivou o contexto de
 * ponto. Duas consultas leves, e nenhuma delas lê o conteúdo — só a data.
 */
async function contextoMaisRecente(accountId: number): Promise<Date | null> {
  const { getAccountContext, contextoDeAchadoMaisRecente } = await import("../db");
  const [ctx, pontoEm] = await Promise.all([
    getAccountContext(accountId).catch(() => null),
    contextoDeAchadoMaisRecente(accountId).catch(() => null),
  ]);
  return [ctx?.updatedAt ?? null, pontoEm]
    .filter((d): d is Date => !!d)
    .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
}

/**
 * Recalcula o status da IA (cor + resumo) de UMA conta e grava. Usado tanto pelo
 * cron noturno quanto pela reanálise manual (individual e em massa). Registra um
 * aprendizado quando a cor MUDA (evento memorável), sem gerar ruído.
 */
export async function refreshAccountAiStatus(
  accountId: number,
  userId: number,
  opts: { adhocContexto?: string; forcar?: boolean } = {},
): Promise<StatusIA> {
  const accountData = await getMetaAdAccountById(accountId);

  /**
   * ── O guarda de frescor ──────────────────────────────────────────────────
   * Antes de qualquer coisa cara. A auditoria de 19/08/2026 mediu sete caminhos
   * chegando aqui, e nenhum perguntava se a leitura anterior ainda servia: duas
   * chamadas com trinta segundos de diferença produziam a mesma análise,
   * cobrada duas vezes.
   *
   * A regra mora em `shared/frescorDaAnalise` e é pura — testável nos dois
   * lados de cada limiar, sem relógio nem banco. Aqui só se colhe o que ela
   * precisa: quando a análise foi feita e quando o contexto mudou pela última
   * vez.
   *
   * `forcar` é o botão Atualizar. Ele ignora tudo: pedido explícito de gente
   * não se discute com uma janela.
   *
   * `adhocContexto` também força — ele é um contexto que só existe nesta
   * chamada e não está gravado em lugar nenhum, então nenhuma análise anterior
   * pode tê-lo visto.
   */
  const decisao = decidirGeracaoDaAnalise({
    analiseEm: (accountData as { aiStatusAt?: Date | null })?.aiStatusAt ?? null,
    contextoEm: await contextoMaisRecente(accountId),
    forcar: opts.forcar || !!opts.adhocContexto?.trim(),
    agora: new Date(),
  });

  if (!decisao.gerar) {
    const cor = (accountData as { aiStatusColor?: StatusIA["color"] | null })?.aiStatusColor;
    const resumo = (accountData as { aiStatusSummary?: string | null })?.aiStatusSummary;
    // Só reusa o que EXISTE. Sem cor ou resumo gravados não há o que devolver,
    // e o guarda cede — a alternativa seria uma tela em branco defendida por
    // uma economia.
    if (cor && resumo) {
      logger.info(`[StatusIA] conta ${accountId}: reusada (${decisao.motivo}, `
        + `${Math.round(decisao.idadeMinutos ?? 0)}min) — nenhuma chamada ao modelo`);
      return { color: cor, summary: resumo, reusada: true, motivo: decisao.motivo };
    }
  }

  logger.info(`[StatusIA] conta ${accountId}: gerando (${decisao.motivo})`);
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
    origem: "status_ia",
    // A conta que motivou a chamada — vira o ranking por cliente no painel
    // de consumo. Sem ela, esta origem apareceria como "sem cliente".
    accountId: accountId,
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
