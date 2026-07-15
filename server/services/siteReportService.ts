/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Relatório de Site & Jornada
 * ─────────────────────────────────────────────────────────────────────────────
 *  Cruza três fontes para responder "o problema está na mídia, na página, na
 *  oferta ou no tracking?":
 *    · mídia paga  (campaign_metrics)
 *    · comportamento no site (snapshots do Clarity)
 *    · contexto manual + notas (o que só a equipe sabe)
 *
 *  Princípio: NUNCA fingir dado. Cada fonte pode faltar, e o relatório diz qual
 *  faltou em vez de inventar. Um relatório só com mídia é legítimo — ele apenas
 *  não conclui nada sobre o site.
 *
 *  Limite herdado da API do Clarity: só existem os dias que snapshotamos. Um
 *  período de 30 dias pode ter mídia de 30 dias e Clarity de poucos — o relatório
 *  declara essa assimetria em vez de comparar coisas de janelas diferentes.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { invokeLLM, extractTextContent } from "../_core/llm";
import { logger } from "../logger";
import {
  getAccountMetricsSummary, serieClaritySnapshots, getClientContext,
  listClientNotes, getClaritySettings,
} from "../db";

export type FontesDisponiveis = {
  midia: boolean;
  clarity: boolean;
  contexto: boolean;
  notas: boolean;
  /** Dias de Clarity de fato cobertos dentro do período pedido. */
  diasClarity: number;
  diasPeriodo: number;
};

export type SiteReport = {
  resumoExecutivo: string;
  diagnostico: string;
  /** "midia" | "site" | "oferta" | "tracking" | "tecnico" | "indeterminado" */
  origemProvavel: string;
  problemas: string[];
  hipoteses: string[];
  proximasAcoes: string[];
  observacoesTracking: string[];
  midia: Record<string, number | null>;
  site: Record<string, number | null>;
  fontes: FontesDisponiveis;
};

const n2 = (n: number | null | undefined): number | null =>
  n === null || n === undefined || !Number.isFinite(Number(n)) ? null : Math.round(Number(n) * 100) / 100;

/** Agrega a mídia paga do período. */
export async function agregarMidia(accountId: number, inicio: string, fim: string) {
  const rows = await getAccountMetricsSummary(accountId, inicio, fim);
  if (rows.length === 0) return null;
  const t = rows.reduce((a, r) => ({
    spend: a.spend + Number(r.totalSpend ?? 0),
    impressions: a.impressions + Number(r.totalImpressions ?? 0),
    clicks: a.clicks + Number(r.totalClicks ?? 0),
    conversions: a.conversions + Number(r.totalConversions ?? 0),
    value: a.value + Number(r.totalConversionValue ?? 0),
  }), { spend: 0, impressions: 0, clicks: 0, conversions: 0, value: 0 });
  return {
    gasto: n2(t.spend), impressoes: t.impressions, cliques: t.clicks,
    conversoes: t.conversions, valorConversao: n2(t.value),
    ctr: t.impressions > 0 ? n2((t.clicks / t.impressions) * 100) : null,
    cpc: t.clicks > 0 ? n2(t.spend / t.clicks) : null,
    cpa: t.conversions > 0 ? n2(t.spend / t.conversions) : null,
    roas: t.spend > 0 ? n2(t.value / t.spend) : null,
    dias: rows.length,
  };
}

/** Soma os snapshots do Clarity que caem dentro do período. */
export async function agregarClarity(accountId: number, inicio: string, fim: string) {
  const todos = await serieClaritySnapshots(accountId, 90);
  const dentro = todos.filter((s) => s.dia >= inicio && s.dia <= fim);
  if (dentro.length === 0) return null;

  type M = Record<string, number | null>;
  const soma = (campo: string) => {
    let t: number | null = null;
    for (const s of dentro) {
      const v = (s.metricsJson as M)?.[campo];
      if (typeof v === "number") t = (t ?? 0) + v;
    }
    return t;
  };
  const media = (campo: string) => {
    const vs = dentro.map((s) => (s.metricsJson as M)?.[campo]).filter((v): v is number => typeof v === "number");
    return vs.length ? n2(vs.reduce((a, b) => a + b, 0) / vs.length) : null;
  };
  const sessions = soma("sessions");
  const bots = soma("botSessions");
  return {
    sessoes: sessions, usuarios: soma("users"), sessoesBot: bots,
    pctBot: sessions && bots !== null && sessions > 0 ? n2((bots / sessions) * 100) : null,
    paginasPorSessao: media("pagesPerSession"),
    scrollMedio: media("averageScrollDepth"),
    tempoMedio: media("averageSessionDuration"),
    cliquesMortos: soma("deadClicks"), rageClicks: soma("rageClicks"),
    quickBacks: soma("quickBacks"), errosJs: soma("javascriptErrors"),
    diasCobertos: dentro.length,
    topPages: (dentro[0]?.topPagesJson as { url: string; sessions: number | null }[] | null) ?? [],
    sources: (dentro[0]?.sourcesJson as { fonte: string; sessions: number | null }[] | null) ?? [],
  };
}

const diasEntre = (a: string, b: string) =>
  Math.max(1, Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000) + 1);

export async function gerarSiteReport(accountId: number, nomeConta: string, inicio: string, fim: string): Promise<SiteReport> {
  const [midia, clarity, ctx, notas, cfg] = await Promise.all([
    agregarMidia(accountId, inicio, fim),
    agregarClarity(accountId, inicio, fim),
    getClientContext(accountId),
    listClientNotes(accountId, 5),
    getClaritySettings(accountId),
  ]);

  const fontes: FontesDisponiveis = {
    midia: !!midia, clarity: !!clarity,
    contexto: !!(ctx && (ctx.objective || ctx.offer || ctx.audience)),
    notas: notas.length > 0,
    diasClarity: clarity?.diasCobertos ?? 0,
    diasPeriodo: diasEntre(inicio, fim),
  };

  // Sem nenhuma das duas fontes quantitativas não há o que diagnosticar —
  // melhor dizer isso do que produzir um texto plausível e vazio.
  if (!midia && !clarity) {
    return {
      resumoExecutivo: `Não há dados de mídia nem de Clarity para ${nomeConta} entre ${inicio} e ${fim}.`,
      diagnostico: "Sem dados no período, não é possível diagnosticar. Verifique se a conta sincronizou e se o Clarity está configurado.",
      origemProvavel: "indeterminado",
      problemas: [], hipoteses: [], proximasAcoes: ["Sincronizar a conta de mídia", "Configurar/sincronizar o Clarity"],
      observacoesTracking: [], midia: {}, site: {}, fontes,
    };
  }

  const prompt = montarPrompt(nomeConta, inicio, fim, midia, clarity, ctx, notas, cfg?.domain ?? null, fontes);
  let ia: Partial<SiteReport> = {};
  try {
    const resp = await invokeLLM({
      messages: [{ role: "user", content: prompt }],
      // Um diagnóstico completo passa de 6k caracteres. Com o teto antigo (1600)
      // o JSON era cortado no meio, o parse quebrava e caía no fallback sem que
      // ninguém percebesse — o relatório parecia "vazio" sem motivo aparente.
      maxTokens: 4000,
      responseFormat: { type: "json_object" },
    });
    ia = JSON.parse(extractTextContent(resp));
  } catch (e) {
    // Não pode ser silencioso: sem log, uma falha aqui vira "relatório vazio"
    // indistinguível de "não há o que dizer".
    logger.error(`[SiteReport] Análise automática falhou (conta ${accountId}): ${(e as Error).message}`);
    ia = {
      resumoExecutivo: `Relatório de ${nomeConta} (${inicio} a ${fim}). A análise automática não pôde ser gerada; os números abaixo são os do período e estão corretos.`,
      diagnostico: "Análise automática indisponível no momento — tente gerar novamente.",
      origemProvavel: "indeterminado",
    };
  }

  return {
    resumoExecutivo: ia.resumoExecutivo ?? "",
    diagnostico: ia.diagnostico ?? "",
    origemProvavel: ia.origemProvavel ?? "indeterminado",
    problemas: Array.isArray(ia.problemas) ? ia.problemas : [],
    hipoteses: Array.isArray(ia.hipoteses) ? ia.hipoteses : [],
    proximasAcoes: Array.isArray(ia.proximasAcoes) ? ia.proximasAcoes : [],
    observacoesTracking: Array.isArray(ia.observacoesTracking) ? ia.observacoesTracking : [],
    midia: (midia ?? {}) as Record<string, number | null>,
    site: clarity ? ({ ...clarity, topPages: undefined, sources: undefined } as unknown as Record<string, number | null>) : {},
    fontes,
  };
}

function montarPrompt(
  nome: string, inicio: string, fim: string,
  midia: Awaited<ReturnType<typeof agregarMidia>>,
  clarity: Awaited<ReturnType<typeof agregarClarity>>,
  ctx: Awaited<ReturnType<typeof getClientContext>>,
  notas: { body: string; createdAt: Date }[],
  dominio: string | null,
  fontes: FontesDisponiveis,
): string {
  const blocos: string[] = [];

  blocos.push(midia
    ? `MÍDIA PAGA (${midia.dias} dia(s) com dados)
gasto: R$ ${midia.gasto} · impressões: ${midia.impressoes} · cliques: ${midia.cliques}
CTR: ${midia.ctr}% · CPC: R$ ${midia.cpc} · conversões: ${midia.conversoes} · CPA: R$ ${midia.cpa} · ROAS: ${midia.roas}`
    : "MÍDIA PAGA: SEM DADOS no período.");

  blocos.push(clarity
    ? `COMPORTAMENTO NO SITE — Microsoft Clarity (${clarity.diasCobertos} de ${fontes.diasPeriodo} dia(s) do período)
sessões: ${clarity.sessoes} (${clarity.sessoesBot} de bots = ${clarity.pctBot}%) · usuários: ${clarity.usuarios}
páginas/sessão: ${clarity.paginasPorSessao} · scroll médio: ${clarity.scrollMedio}% · tempo médio: ${clarity.tempoMedio}s
cliques mortos: ${clarity.cliquesMortos} · rage clicks: ${clarity.rageClicks} · quick backs: ${clarity.quickBacks} · erros de JS: ${clarity.errosJs}
páginas mais vistas: ${(clarity.topPages ?? []).slice(0, 5).map((p) => p.url).join(" | ") || "—"}
origens: ${(clarity.sources ?? []).slice(0, 5).map((s) => `${s.fonte} (${s.sessions})`).join(" | ") || "—"}`
    : "COMPORTAMENTO NO SITE: SEM DADOS de Clarity no período.");

  blocos.push(ctx
    ? `CONTEXTO INFORMADO PELA EQUIPE
objetivo: ${ctx.objective ?? "—"}
oferta: ${ctx.offer ?? "—"}
público: ${ctx.audience ?? "—"}
eventos de conversão esperados: ${JSON.stringify(ctx.conversionEventsJson ?? [])}
observações de tracking: ${ctx.trackingNotes ?? "—"}
hipóteses em andamento: ${ctx.currentHypotheses ?? "—"}
restrições: ${ctx.constraints ?? "—"}
já testado: ${ctx.previousTests ?? "—"}
próximos passos combinados: ${ctx.nextSteps ?? "—"}`
    : "CONTEXTO: a equipe não preencheu o contexto deste cliente.");

  if (notas.length) blocos.push(`NOTAS RECENTES\n${notas.map((x) => `- ${x.body}`).join("\n")}`);

  return `Você é analista de performance da SELVA. Diagnostique o cliente "${nome}"${dominio ? ` (${dominio})` : ""} no período de ${inicio} a ${fim}.

${blocos.join("\n\n")}

REGRAS INEGOCIÁVEIS:
- Use SOMENTE os dados acima. Nunca invente número, página, campanha ou fato.
- Quando uma fonte estiver ausente, diga isso e NÃO conclua sobre ela. Sem Clarity, não afirme nada sobre o comportamento no site.
- Se o Clarity cobre menos dias que o período, trate a comparação com cuidado e mencione a diferença.
- O histórico do Clarity NÃO pode ser recuperado: a API só devolve os últimos 3 dias e nós guardamos um retrato por dia. Jamais sugira "buscar/solicitar os dias que faltam" — é impossível. Se faltam dias, a única saída é esperar os próximos snapshots.
- Sessões de bot não são público real: desconte-as ao julgar se o tráfego é qualificado.
- Escreva em português do Brasil, direto, sem jargão vazio. Frases curtas.

COMO INTERPRETAR (só quando os dados sustentarem):
- CTR e CPC bons + poucas sessões no site → possível perda entre o clique e o carregamento (velocidade, redirecionamento, tracking) ou desalinhamento criativo/landing.
- Cliques normais + scroll baixo → a página não sustenta a intenção; o topo não entrega o que o anúncio prometeu.
- Tempo e scroll bons + sem conversão → a fricção está na oferta, no formulário ou no evento de conversão.
- Erros de JS altos → problema técnico; pode inclusive derrubar o disparo de conversão.
- Cliques mortos altos → algo parece clicável e não é, ou o CTA confunde.
- Muitos quick backs → expectativa quebrada logo na chegada.
- % de bots alto → o volume de mídia pode estar inflado.

Responda APENAS com JSON válido:
{
  "resumoExecutivo": "2 a 3 frases para quem tem 10 segundos",
  "diagnostico": "o parágrafo que cruza mídia e site e explica onde está o problema",
  "origemProvavel": "midia | site | oferta | tracking | tecnico | indeterminado",
  "problemas": ["problema concreto, com o número que o sustenta"],
  "hipoteses": ["hipótese testável"],
  "proximasAcoes": ["ação priorizada e específica"],
  "observacoesTracking": ["risco/observação de medição, se houver"]
}`;
}

/** Markdown para copiar/colar — o time vive de mandar isso no WhatsApp. */
export function siteReportMarkdown(r: SiteReport, nome: string, inicio: string, fim: string): string {
  const L: string[] = [];
  const lista = (t: string, xs: string[]) => { if (xs.length) { L.push(`\n**${t}**`); xs.forEach((x) => L.push(`- ${x}`)); } };

  L.push(`# Site & Jornada — ${nome}`);
  L.push(`_${inicio} a ${fim}_\n`);
  L.push(r.resumoExecutivo);
  L.push(`\n**Diagnóstico** (origem provável: ${r.origemProvavel})\n${r.diagnostico}`);

  if (r.fontes.midia) {
    const m = r.midia;
    L.push(`\n**Mídia paga**`);
    L.push(`- Gasto R$ ${m.gasto} · ${m.cliques} cliques · CTR ${m.ctr}% · CPC R$ ${m.cpc}`);
    L.push(`- ${m.conversoes} conversões · CPA R$ ${m.cpa} · ROAS ${m.roas}`);
  } else L.push(`\n**Mídia paga**: sem dados no período.`);

  if (r.fontes.clarity) {
    const s = r.site;
    L.push(`\n**Comportamento no site** (${r.fontes.diasClarity} de ${r.fontes.diasPeriodo} dias)`);
    L.push(`- ${s.sessoes} sessões (${s.pctBot}% bots) · ${s.paginasPorSessao} páginas/sessão · scroll ${s.scrollMedio}% · ${s.tempoMedio}s`);
    L.push(`- Fricção: ${s.cliquesMortos} cliques mortos · ${s.rageClicks} rage clicks · ${s.errosJs} erros de JS`);
  } else L.push(`\n**Comportamento no site**: sem dados de Clarity no período.`);

  lista("Problemas encontrados", r.problemas);
  lista("Hipóteses", r.hipoteses);
  lista("Próximas ações", r.proximasAcoes);
  lista("Observações de tracking", r.observacoesTracking);

  if (!r.fontes.contexto) L.push(`\n> O contexto deste cliente não está preenchido — o diagnóstico ganharia precisão com objetivo, oferta e público.`);
  return L.join("\n");
}
