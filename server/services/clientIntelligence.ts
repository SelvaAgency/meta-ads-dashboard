/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Inteligência do cliente — contexto único, montado uma vez
 * ─────────────────────────────────────────────────────────────────────────────
 *  Reúne TUDO que o Spaces sabe sobre um cliente e devolve num formato só.
 *  Quem consome:
 *   · o robô (chat)          → formato conversacional
 *   · o gerador de relatório → formato estruturado
 *
 *  Existe para que os dois não divirjam. Antes, o lado "site" via mídia só
 *  agregada na conta, e o lado "mídia" não sabia que site existia — dois
 *  analistas olhando metades diferentes e capazes de dar respostas opostas.
 *
 *  ── Duas ideias que sustentam este arquivo ──
 *
 *  1. FONTE AUSENTE É INFORMAÇÃO, NÃO ERRO.
 *     Cada fonte vira um Bloco com `presente` + `porque` quando falta. Nada
 *     bloqueia a montagem: cliente sem Clarity gera contexto igual, só que
 *     declarando que comportamento real não pôde ser observado. É a diferença
 *     entre "não sabemos" e "não há problema" — que o LLM confundiria sozinho.
 *
 *  2. O CONTEXTO É POR CONTA, SEMPRE.
 *     Toda consulta leva accountId. Nenhum dado de um cliente pode entrar no
 *     contexto de outro — é o erro mais caro que uma ferramenta destas pode
 *     cometer, porque a resposta continua parecendo perfeitamente plausível.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import {
  getCampaignPerformanceSummary,
  getClientContext,
  listClientNotes,
  listarSiteReports,
  getClaritySettings,
  ultimoSiteSnapshot,
  ultimoSnapshotPorProvider,
  alertasRecentesDaConta,
} from "../db";
import { agregarMidia, agregarClarity } from "./siteReportService";

/** Módulos que podem entrar no contexto. São também os módulos do relatório. */
export const MODULOS = [
  "midia",
  "campanhas",
  "site",
  "clarity",
  "pagespeed",
  "seguranca",
  "uptime",
  "contexto",
  "alertas",
  "relatorios",
] as const;
export type Modulo = (typeof MODULOS)[number];

export type Bloco<T> = {
  /** Há dado utilizável? */
  presente: boolean;
  /** Por que não há. Vai para a tela e para o prompt — nunca "erro genérico". */
  porque?: string;
  dados?: T;
};

export type Periodo = { inicio: string; fim: string };

export type ContextoCliente = {
  accountId: number;
  nome: string;
  dominio: string | null;
  periodo: Periodo;
  midia: Bloco<Awaited<ReturnType<typeof agregarMidia>>>;
  midiaAnterior: Bloco<Awaited<ReturnType<typeof agregarMidia>>>;
  campanhas: Bloco<{ nome: string; gasto: number; cliques: number; impressoes: number; conversoes: number; ctr: number | null; cpa: number | null; roas: number | null }[]>;
  clarity: Bloco<Awaited<ReturnType<typeof agregarClarity>>>;
  pagespeed: Bloco<{ url: string; estrategia: string; dia: string; metricas: Record<string, unknown>; recomendacoes: { titulo: string; economiaMs?: number | null }[] }>;
  seguranca: Bloco<{ dia: string; metricas: Record<string, unknown>; achados: string[] }>;
  uptime: Bloco<{ dia: string; metricas: Record<string, unknown> }>;
  contexto: Bloco<Record<string, unknown>>;
  notas: Bloco<{ data: string; autor: string; texto: string }[]>;
  alertas: Bloco<{ data: string; severidade: string; tipo: string; titulo: string; mensagem: string }[]>;
  relatorios: Bloco<{ inicio: string; fim: string; criadoEm: string; resumo: string; origemProvavel: string }[]>;
};

const n2 = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
};

const dia = (d: Date | string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(d));

const ausente = <T,>(porque: string): Bloco<T> => ({ presente: false, porque });
const presente = <T,>(dados: T): Bloco<T> => ({ presente: true, dados });

/** Janela imediatamente anterior, do mesmo tamanho — base de qualquer "melhorou/piorou". */
export function periodoAnterior(p: Periodo): Periodo {
  const ini = new Date(`${p.inicio}T12:00:00Z`);
  const fim = new Date(`${p.fim}T12:00:00Z`);
  const dias = Math.max(1, Math.round((fim.getTime() - ini.getTime()) / 86400000) + 1);
  return {
    inicio: dia(new Date(ini.getTime() - dias * 86400000)),
    fim: dia(new Date(ini.getTime() - 86400000)),
  };
}

/**
 * Monta o contexto. `modulos` limita o que é buscado — o relatório só de mídia
 * não paga o custo de consultar Clarity, PageSpeed e o resto.
 */
export async function buildClientIntelligenceContext(
  accountId: number,
  nome: string,
  periodo: Periodo,
  modulos: readonly Modulo[] = MODULOS,
): Promise<ContextoCliente> {
  const quer = (m: Modulo) => modulos.includes(m);
  const anterior = periodoAnterior(periodo);
  // "site" liga os três técnicos: quem pede Site quer saber se o site está de pé.
  const querSite = quer("site");

  const [
    cfg, midia, midiaAnt, campanhas, clarity, perfSnap, segSnap, upSnap, ctx, notas, relatorios, alertas,
  ] = await Promise.all([
    getClaritySettings(accountId),
    quer("midia") ? agregarMidia(accountId, periodo.inicio, periodo.fim) : null,
    quer("midia") ? agregarMidia(accountId, anterior.inicio, anterior.fim) : null,
    quer("campanhas") ? getCampaignPerformanceSummary(accountId, periodo.inicio, periodo.fim) : [],
    quer("clarity") ? agregarClarity(accountId, periodo.inicio, periodo.fim) : null,
    quer("pagespeed") || querSite ? ultimoSiteSnapshot(accountId) : null,
    quer("seguranca") || querSite ? ultimoSnapshotPorProvider(accountId, "security_check") : null,
    quer("uptime") || querSite ? ultimoSnapshotPorProvider(accountId, "uptime_check") : null,
    quer("contexto") ? getClientContext(accountId) : null,
    quer("contexto") ? listClientNotes(accountId, 8) : [],
    quer("relatorios") ? listarSiteReports(accountId, 3) : [],
    quer("alertas") ? alertasRecentesDaConta(accountId) : [],
  ]);

  const temDominio = !!(cfg?.domain || cfg?.performanceUrl);
  const semSite = "Nenhum domínio informado para este cliente — não há site para medir.";

  return {
    accountId,
    nome,
    dominio: cfg?.domain ?? cfg?.performanceUrl ?? null,
    periodo,

    midia: !quer("midia")
      ? ausente("Módulo não incluído.")
      : midia
        ? presente(midia)
        : ausente("Não há métricas de mídia paga no período."),

    midiaAnterior: !quer("midia")
      ? ausente("Módulo não incluído.")
      : midiaAnt
        ? presente(midiaAnt)
        : ausente(`Sem dados no período anterior (${anterior.inicio} a ${anterior.fim}) — não dá para comparar.`),

    campanhas: !quer("campanhas")
      ? ausente("Módulo não incluído.")
      : campanhas.length === 0
        ? ausente("Nenhuma campanha ativa com dados no período.")
        : presente(
            campanhas
              .map((c) => ({
                nome: (c as { campaignName?: string }).campaignName ?? "—",
                gasto: Number(n2((c as { totalSpend?: unknown }).totalSpend) ?? 0),
                cliques: Number((c as { totalClicks?: unknown }).totalClicks ?? 0),
                impressoes: Number((c as { totalImpressions?: unknown }).totalImpressions ?? 0),
                conversoes: Number((c as { totalConversions?: unknown }).totalConversions ?? 0),
                ctr: n2((c as { avgCtr?: unknown }).avgCtr),
                cpa: n2((c as { avgCpa?: unknown }).avgCpa),
                roas: n2((c as { avgRoas?: unknown }).avgRoas),
              }))
              .sort((a, b) => b.gasto - a.gasto)
              .slice(0, 12),
          ),

    clarity: !quer("clarity")
      ? ausente("Módulo não incluído.")
      : clarity
        ? presente(clarity)
        : ausente(
            cfg?.enabled
              ? "O Clarity está ligado, mas ainda não há snapshot no período. A API do Clarity só devolve os últimos dias — o passado é irrecuperável."
              : "O Clarity não está conectado para este cliente, então não há como observar o comportamento real de quem visita o site.",
          ),

    pagespeed: !(quer("pagespeed") || querSite)
      ? ausente("Módulo não incluído.")
      : !temDominio
        ? ausente(semSite)
        : perfSnap
          ? presente({
              url: perfSnap.url,
              estrategia: perfSnap.estrategia,
              dia: perfSnap.dia,
              metricas: (perfSnap.metricsJson ?? {}) as Record<string, unknown>,
              recomendacoes: ((perfSnap.recommendationsJson ?? []) as { titulo: string; economiaMs?: number | null }[]).slice(0, 6),
            })
          : ausente("Nenhum teste de PageSpeed rodado ainda para este cliente."),

    seguranca: !(quer("seguranca") || querSite)
      ? ausente("Módulo não incluído.")
      : !temDominio
        ? ausente(semSite)
        : segSnap
          ? presente({
              dia: segSnap.dia,
              metricas: (segSnap.metricsJson ?? {}) as Record<string, unknown>,
              achados: ((segSnap.issuesJson as { achados?: string[] } | null)?.achados ?? []).slice(0, 10),
            })
          : ausente("A checagem de segurança básica ainda não rodou para este cliente."),

    uptime: !(quer("uptime") || querSite)
      ? ausente("Módulo não incluído.")
      : !temDominio
        ? ausente(semSite)
        : upSnap
          ? presente({ dia: upSnap.dia, metricas: (upSnap.metricsJson ?? {}) as Record<string, unknown> })
          : ausente("A checagem de disponibilidade ainda não rodou para este cliente."),

    contexto: !quer("contexto")
      ? ausente("Módulo não incluído.")
      : ctx && (ctx.objective || ctx.offer || ctx.audience)
        ? presente(ctx as unknown as Record<string, unknown>)
        : ausente("A equipe não registrou objetivo, oferta nem público deste cliente. Sem isso, o diagnóstico descreve números mas não interpreta a intenção."),

    notas: !quer("contexto")
      ? ausente("Módulo não incluído.")
      : notas.length === 0
        ? ausente("Nenhuma nota registrada pela equipe.")
        : presente(
            notas.map((n) => ({
              data: dia(n.createdAt),
              autor: (n as { autorNome?: string | null }).autorNome ?? "—",
              texto: n.body,
            })),
          ),

    alertas: !quer("alertas")
      ? ausente("Módulo não incluído.")
      : alertas.length === 0
        ? ausente("Nenhum alerta recente para este cliente nos últimos 14 dias.")
        : presente(
            alertas.map((a) => ({
              data: dia(a.createdAt),
              severidade: a.severity,
              tipo: a.type,
              titulo: a.title,
              mensagem: a.message,
            })),
          ),

    relatorios: !quer("relatorios")
      ? ausente("Módulo não incluído.")
      : relatorios.length === 0
        ? ausente("Nenhum relatório anterior salvo para este cliente.")
        : presente(
            relatorios.map((r) => {
              const rj = (r.reportJson ?? {}) as { resumoExecutivo?: string; origemProvavel?: string };
              return {
                inicio: r.rangeStart,
                fim: r.rangeEnd,
                criadoEm: dia(r.createdAt),
                resumo: rj.resumoExecutivo ?? "",
                origemProvavel: rj.origemProvavel ?? "?",
              };
            }),
          ),
  };
}

// ─── Serialização para o LLM ─────────────────────────────────────────────────

/** Rótulo de fonte usado no dossiê E cobrado na resposta do robô. */
const ROTULO: Record<string, string> = {
  midia: "Mídia paga",
  campanhas: "Campanhas",
  clarity: "Clarity",
  pagespeed: "PageSpeed",
  seguranca: "Segurança",
  uptime: "Uptime",
  contexto: "Contexto",
  notas: "Notas",
  alertas: "Alertas",
  relatorios: "Relatório",
};

const NAO_INCLUIDO = "Módulo não incluído.";

/**
 * Um bloco vira texto. Ausente vira "SEM DADOS — <porque>" em vez de sumir:
 * o silêncio faria o modelo concluir que está tudo bem, quando na verdade
 * ninguém olhou.
 *
 * A exceção é o módulo que nem foi pedido — esse some mesmo. "SEM DADOS" ali
 * seria mentira: o dado pode existir; só não foi solicitado.
 */
function bloco<T>(chave: keyof typeof ROTULO, b: Bloco<T>, corpo: (d: T) => string): string {
  if (!b.presente && b.porque === NAO_INCLUIDO) return "";
  const r = `[${ROTULO[chave]}]`;
  if (!b.presente || b.dados === undefined || b.dados === null) return `${r} SEM DADOS — ${b.porque ?? "não disponível."}`;
  return `${r} ${corpo(b.dados as T)}`;
}

/** Serializa o contexto para o LLM. Cabeçalho opcional: quem já tem o seu não precisa de outro. */
export function contextoParaTexto(c: ContextoCliente, comCabecalho = true): string {
  const p: string[] = [];
  if (comCabecalho) {
    p.push(`CLIENTE: ${c.nome}${c.dominio ? ` · site: ${c.dominio}` : " · sem site informado"}
PERÍODO ANALISADO: ${c.periodo.inicio} a ${c.periodo.fim}`);
  }

  p.push(bloco("midia", c.midia, (m) => `MÍDIA PAGA no período (${m!.dias} dia(s) com dados)
gasto R$ ${m!.gasto} · ${m!.impressoes} impressões · ${m!.cliques} cliques · CTR ${m!.ctr}% · CPC R$ ${m!.cpc}
${m!.conversoes} conversões · CPA R$ ${m!.cpa} · ROAS ${m!.roas}`));

  p.push(bloco("midia", c.midiaAnterior, (m) => `PERÍODO ANTERIOR (para comparação)
gasto R$ ${m!.gasto} · ${m!.cliques} cliques · CTR ${m!.ctr}% · CPC R$ ${m!.cpc} · ${m!.conversoes} conversões · CPA R$ ${m!.cpa} · ROAS ${m!.roas}`));

  p.push(bloco("campanhas", c.campanhas, (cs) => `POR CAMPANHA (top ${cs.length} por gasto)
${cs.map((x) => `- ${x.nome}: R$ ${x.gasto} · ${x.impressoes} impr · ${x.cliques} cliques · CTR ${x.ctr ?? "—"}% · ${x.conversoes} conv · CPA R$ ${x.cpa ?? "—"} · ROAS ${x.roas ?? "—"}`).join("\n")}`));

  p.push(bloco("clarity", c.clarity, (cl) => `COMPORTAMENTO REAL NO SITE — ${cl!.diasCobertos} dia(s) de snapshot
sessões ${cl!.sessoes} (${cl!.sessoesBot} de bots = ${cl!.pctBot}%) · usuários ${cl!.usuarios}
páginas/sessão ${cl!.paginasPorSessao} · scroll médio ${cl!.scrollMedio}% · tempo médio ${cl!.tempoMedio}s
cliques mortos ${cl!.cliquesMortos} · rage clicks ${cl!.rageClicks} · quick backs ${cl!.quickBacks} · erros de JS ${cl!.errosJs}
páginas: ${(cl!.topPages ?? []).slice(0, 5).map((x) => `${x.url} (${x.sessions})`).join(" | ") || "—"}
origens: ${(cl!.sources ?? []).slice(0, 5).map((x) => `${x.fonte} (${x.sessions})`).join(" | ") || "—"}
IMPORTANTE: só existem os dias que snapshotamos — a API do Clarity não devolve o passado.`));

  p.push(bloco("pagespeed", c.pagespeed, (ps) => {
    const m = ps.metricas as Record<string, number | null>;
    return `PERFORMANCE TÉCNICA — teste de ${ps.dia} em ${ps.url} (${ps.estrategia})
score ${m.performanceScore ?? "—"}/100 · LCP ${m.lcp ?? "—"}ms · CLS ${m.cls ?? "—"} · TBT ${m.tbt ?? "—"}ms · Speed Index ${m.speedIndex ?? "—"}ms
acessibilidade ${m.accessibilityScore ?? "—"} · boas práticas ${m.bestPracticesScore ?? "—"} · SEO ${m.seoScore ?? "—"}
oportunidades: ${ps.recomendacoes.map((r) => `${r.titulo}${r.economiaMs ? ` (~${Math.round(r.economiaMs)}ms)` : ""}`).join(" | ") || "—"}
Referência do Lighthouse: LCP bom ≤2500ms, ruim >4000ms. CLS bom ≤0.1.`;
  }));

  p.push(bloco("seguranca", c.seguranca, (s) => {
    const m = s.metricas as Record<string, unknown>;
    return `SEGURANÇA BÁSICA — checagem de ${s.dia}
nota ${m.score ?? "—"}/100 · status ${m.status ?? "—"} · HTTPS ${m.https ? "sim" : "não"} · certificado ${m.sslValido === true ? "válido" : m.sslValido === false ? "INVÁLIDO" : "—"}${typeof m.daysToSslExpiry === "number" ? ` (expira em ${m.daysToSslExpiry} dias)` : ""}
achados: ${s.achados.join(" | ") || "nenhum"}
Isto NÃO é auditoria de segurança: olha só o que dá para ver de fora (HTTPS, certificado, headers).`;
  }));

  p.push(bloco("uptime", c.uptime, (u) => {
    const m = u.metricas as Record<string, unknown>;
    return `DISPONIBILIDADE — checagem de ${u.dia}
status ${m.status ?? "—"} · HTTP ${m.statusCode ?? "—"} · resposta ${m.responseTimeMs ?? "—"}ms
Atenção: status "bloqueado" (HTTP 403) é WAF/proteção de bot, NÃO é site fora do ar.`;
  }));

  p.push(bloco("contexto", c.contexto, (x) => `INFORMADO PELA EQUIPE
objetivo: ${x.objective ?? "—"} | oferta: ${x.offer ?? "—"} | público: ${x.audience ?? "—"}
eventos de conversão esperados: ${JSON.stringify(x.conversionEventsJson ?? [])}
tracking: ${x.trackingNotes ?? "—"} | hipóteses: ${x.currentHypotheses ?? "—"}
restrições: ${x.constraints ?? "—"} | já testado: ${x.previousTests ?? "—"} | próximos passos: ${x.nextSteps ?? "—"}`));

  p.push(bloco("notas", c.notas, (ns) => `REGISTROS DA EQUIPE\n${ns.map((n) => `- ${n.data} (${n.autor}): ${n.texto}`).join("\n")}`));

  p.push(bloco("alertas", c.alertas, (as) => `ALERTAS RECENTES (14 dias)\n${as.map((a) => `- ${a.data} [${a.severidade}] ${a.titulo}`).join("\n")}`));

  p.push(bloco("relatorios", c.relatorios, (rs) => `RELATÓRIOS ANTERIORES (do mais recente)
${rs.map((r) => `- ${r.inicio} a ${r.fim} (gerado em ${r.criadoEm}) · origem provável: ${r.origemProvavel}\n  ${r.resumo}`).join("\n")}`));

  return p.filter(Boolean).join("\n\n");
}

/** Módulos técnicos do site — o que o chat de mídia não enxergava. */
export const MODULOS_SITE: readonly Modulo[] = ["site", "clarity", "pagespeed", "seguranca", "uptime"];

/** Quais fontes entraram de fato — para a tela mostrar e para cobrar do modelo. */
export type FontesUsadas = { chave: string; rotulo: string; presente: boolean; porque?: string }[];

export function fontesDe(c: ContextoCliente): FontesUsadas {
  const pares: [string, Bloco<unknown>][] = [
    ["midia", c.midia],
    ["campanhas", c.campanhas],
    ["clarity", c.clarity],
    ["pagespeed", c.pagespeed],
    ["seguranca", c.seguranca],
    ["uptime", c.uptime],
    ["contexto", c.contexto],
    ["alertas", c.alertas],
    ["relatorios", c.relatorios],
  ];
  return pares
    // "módulo não incluído" não é pendência do cliente: é escolha de quem pediu.
    .filter(([, b]) => b.presente || b.porque !== "Módulo não incluído.")
    .map(([k, b]) => ({ chave: k, rotulo: ROTULO[k], presente: b.presente, porque: b.porque }));
}
