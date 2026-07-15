/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Chat por cliente — "perguntar sobre este cliente"
 * ─────────────────────────────────────────────────────────────────────────────
 *  Responde usando SOMENTE o que o Spaces tem sobre aquele cliente: mídia paga,
 *  snapshots do Clarity, contexto manual, notas e relatórios salvos.
 *
 *  Três regras que definem o produto:
 *   1. Nunca inventar. Sem dado, a resposta é "não temos isso" — não um palpite
 *      plausível, que é justamente o que destruiria a confiança na ferramenta.
 *   2. Citar a fonte de cada afirmação [Mídia paga] · [Clarity] · [Contexto] ·
 *      [Relatório] · [Notas].
 *   3. Não age. Pode sugerir; executar é decisão de gente.
 *
 *  Isolamento: tudo é buscado por accountId. O contexto de um cliente nunca
 *  entra na conversa de outro.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { invokeLLM, extractTextContent } from "../_core/llm";
import { logger } from "../logger";
import { agregarMidia, agregarClarity } from "./siteReportService";
import { getClientContext, listClientNotes, listarSiteReports, getClaritySettings } from "../db";

export type FontesChat = { midia: boolean; clarity: boolean; contexto: boolean; notas: boolean; relatorios: number };

const hoje = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const atras = (n: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(Date.now() - n * 86400000));

/**
 * Monta o dossiê do cliente. Duas janelas de mídia (7 e 30 dias) para que
 * perguntas de tendência tenham com o que comparar.
 */
async function montarDossie(accountId: number, nome: string) {
  const fim = hoje();
  const [m7, m30, clarity, ctx, notas, relatorios, cfg] = await Promise.all([
    agregarMidia(accountId, atras(6), fim),
    agregarMidia(accountId, atras(29), fim),
    agregarClarity(accountId, atras(89), fim), // tudo que temos de snapshot
    getClientContext(accountId),
    listClientNotes(accountId, 8),
    listarSiteReports(accountId, 3),
    getClaritySettings(accountId),
  ]);

  const fontes: FontesChat = {
    midia: !!m30, clarity: !!clarity,
    contexto: !!(ctx && (ctx.objective || ctx.offer || ctx.audience)),
    notas: notas.length > 0, relatorios: relatorios.length,
  };

  const b: string[] = [];
  b.push(`CLIENTE: ${nome}${cfg?.domain ? ` · site: ${cfg.domain}` : ""}  (hoje é ${fim})`);

  b.push(m30
    ? `[Mídia paga] ÚLTIMOS 30 DIAS (${m30.dias} dias com dados)
gasto R$ ${m30.gasto} · ${m30.impressoes} impressões · ${m30.cliques} cliques · CTR ${m30.ctr}% · CPC R$ ${m30.cpc}
${m30.conversoes} conversões · CPA R$ ${m30.cpa} · ROAS ${m30.roas}
${m7 ? `ÚLTIMOS 7 DIAS: gasto R$ ${m7.gasto} · ${m7.cliques} cliques · CTR ${m7.ctr}% · CPC R$ ${m7.cpc} · ${m7.conversoes} conversões · CPA R$ ${m7.cpa} · ROAS ${m7.roas}` : ""}`
    : "[Mídia paga] SEM DADOS — não há métricas de mídia para este cliente.");

  b.push(clarity
    ? `[Clarity] COMPORTAMENTO NO SITE — ${clarity.diasCobertos} dia(s) de snapshot disponíveis
sessões ${clarity.sessoes} (${clarity.sessoesBot} de bots = ${clarity.pctBot}%) · usuários ${clarity.usuarios}
páginas/sessão ${clarity.paginasPorSessao} · scroll médio ${clarity.scrollMedio}% · tempo médio ${clarity.tempoMedio}s
cliques mortos ${clarity.cliquesMortos} · rage clicks ${clarity.rageClicks} · quick backs ${clarity.quickBacks} · erros de JS ${clarity.errosJs}
páginas: ${(clarity.topPages ?? []).slice(0, 5).map((p) => `${p.url} (${p.sessions})`).join(" | ") || "—"}
origens: ${(clarity.sources ?? []).slice(0, 5).map((s) => `${s.fonte} (${s.sessions})`).join(" | ") || "—"}
IMPORTANTE: só existem os dias que snapshotamos — a API do Clarity não devolve o passado.`
    : "[Clarity] SEM DADOS — o Clarity não está configurado ou ainda não sincronizou para este cliente.");

  b.push(ctx
    ? `[Contexto] INFORMADO PELA EQUIPE
objetivo: ${ctx.objective ?? "—"} | oferta: ${ctx.offer ?? "—"} | público: ${ctx.audience ?? "—"}
eventos de conversão esperados: ${JSON.stringify(ctx.conversionEventsJson ?? [])}
tracking: ${ctx.trackingNotes ?? "—"} | hipóteses: ${ctx.currentHypotheses ?? "—"}
restrições: ${ctx.constraints ?? "—"} | já testado: ${ctx.previousTests ?? "—"} | próximos passos: ${ctx.nextSteps ?? "—"}`
    : "[Contexto] NÃO PREENCHIDO — a equipe não registrou objetivo, oferta nem público deste cliente.");

  if (relatorios.length) {
    b.push(`[Relatório] RELATÓRIOS DE SITE & JORNADA SALVOS (do mais recente ao mais antigo)
${relatorios.map((r) => {
      const rj = r.reportJson as { resumoExecutivo?: string; origemProvavel?: string } | null;
      return `- ${r.rangeStart} a ${r.rangeEnd} (gerado em ${new Date(r.createdAt).toLocaleDateString("pt-BR")}) · origem provável: ${rj?.origemProvavel ?? "?"}\n  ${rj?.resumoExecutivo ?? ""}`;
    }).join("\n")}`);
  } else {
    b.push("[Relatório] NENHUM relatório de Site & Jornada foi gerado para este cliente ainda.");
  }

  if (notas.length) {
    b.push(`[Notas] REGISTROS DA EQUIPE\n${notas.map((n) => `- ${new Date(n.createdAt).toLocaleDateString("pt-BR")} (${n.autorNome ?? "?"}): ${n.body}`).join("\n")}`);
  } else {
    b.push("[Notas] Nenhuma nota registrada.");
  }

  return { dossie: b.join("\n\n"), fontes };
}

const SISTEMA = `Você é o analista de performance da SELVA respondendo sobre UM cliente específico.

REGRAS INEGOCIÁVEIS:
1. Use SOMENTE os dados do dossiê. Jamais invente número, página, campanha, data ou fato. Se não está no dossiê, você NÃO sabe.
2. Quando faltar dado para responder, diga exatamente o que falta e por quê — nunca preencha com suposição apresentada como fato. É melhor "não temos dados de Clarity para afirmar isso" do que um palpite convincente.
3. CITE A FONTE de cada afirmação com um marcador: [Mídia paga], [Clarity], [Contexto], [Relatório] ou [Notas].
4. Você NÃO executa nada. Pode recomendar; quem decide e age é a equipe.
5. Diferencie fato de hipótese. Fato tem número no dossiê; hipótese você rotula como hipótese.
6. Português do Brasil, direto, frases curtas. Sem jargão vazio e sem encher linguiça.
7. Sessões de bot não são gente: desconte ao julgar se o tráfego é qualificado.
8. O histórico do Clarity é irrecuperável (a API só dá 3 dias) — nunca sugira "buscar os dias que faltam".`;

export async function perguntarSobreCliente(
  accountId: number, nome: string, pergunta: string,
  historico: { role: "user" | "assistant"; content: string }[],
): Promise<{ resposta: string; fontes: FontesChat }> {
  const { dossie, fontes } = await montarDossie(accountId, nome);

  // O histórico entra como conversa; o dossiê é reinjetado a cada pergunta para
  // a resposta refletir o dado de agora, não o de quando a conversa começou.
  const messages = [
    { role: "user" as const, content: `${SISTEMA}\n\n════ DOSSIÊ DO CLIENTE ════\n${dossie}\n════ FIM DO DOSSIÊ ════\n\nResponda às perguntas a seguir apenas com base nele.` },
    { role: "assistant" as const, content: "Entendido. Vou responder só com o que está no dossiê, citando a fonte, e dizer claramente quando faltar dado." },
    ...historico.slice(-8), // janela curta: conversa longa não deve empurrar o dossiê para fora
    { role: "user" as const, content: pergunta },
  ];

  try {
    const resp = await invokeLLM({ messages, maxTokens: 1500 });
    const texto = extractTextContent(resp).trim();
    if (!texto) throw new Error("resposta vazia");
    return { resposta: texto, fontes };
  } catch (e) {
    logger.error(`[Chat] Falha ao responder (conta ${accountId}): ${(e as Error).message}`);
    throw new Error("Não consegui responder agora. Tente de novo em instantes.");
  }
}

/**
 * Só quais fontes existem — sem montar o dossiê inteiro. A tela usa isto para
 * sugerir perguntas que este cliente consegue responder.
 */
export async function montarFontesChat(accountId: number): Promise<{ fontes: FontesChat }> {
  const fim = hoje();
  const [m30, clarity, ctx, notas, relatorios] = await Promise.all([
    agregarMidia(accountId, atras(29), fim),
    agregarClarity(accountId, atras(89), fim),
    getClientContext(accountId),
    listClientNotes(accountId, 1),
    listarSiteReports(accountId, 3),
  ]);
  return {
    fontes: {
      midia: !!m30, clarity: !!clarity,
      contexto: !!(ctx && (ctx.objective || ctx.offer || ctx.audience)),
      notas: notas.length > 0, relatorios: relatorios.length,
    },
  };
}

/** Sugestões de pergunta — ancoradas no que ESTE cliente tem de fato. */
export function sugestoesPara(fontes: FontesChat): string[] {
  const s: string[] = [];
  if (fontes.midia && fontes.clarity) {
    s.push("Por que a campanha traz clique mas não gera acesso bom?");
    s.push("O problema parece ser mídia ou landing page?");
    s.push("O site tem sinais de fricção?");
  }
  if (fontes.midia && !fontes.clarity) s.push("Como está a performance de mídia deste cliente?");
  if (fontes.clarity) s.push("O tráfego que chega é qualificado?");
  if (fontes.relatorios > 0) s.push("O que mudou desde o último relatório?");
  s.push("Quais hipóteses testar essa semana?");
  return s.slice(0, 4);
}
