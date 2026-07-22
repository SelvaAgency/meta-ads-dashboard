/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Microsoft Clarity — Data Export API (isolado)
 * ─────────────────────────────────────────────────────────────────────────────
 *  Contrato real (learn.microsoft.com/clarity/setup-and-installation/
 *  clarity-data-export-api), verificado — não assumido:
 *
 *    GET https://www.clarity.ms/export-data/api/v1/project-live-insights
 *    Authorization: Bearer <token>
 *    ?numOfDays=1|2|3&dimension1=&dimension2=&dimension3=
 *
 *  LIMITES DUROS que moldam todo o desenho:
 *    · Só os ÚLTIMOS 1 a 3 DIAS. Não existe range arbitrário — por isso o
 *      snapshot diário é a única forma de haver histórico.
 *    · 10 requisições por projeto por DIA (429 ao estourar).
 *    · 1.000 linhas por resposta, sem paginação.
 *    · Resposta em UTC; a janela é rolante a partir da hora da chamada.
 *    · NÃO recebe projectId — o token é que identifica o projeto.
 *
 *  A doc só especifica o formato de `Traffic`; os demais metricName vêm com
 *  campos não documentados. Por isso a normalização aqui é DEFENSIVA: procura
 *  o campo por vários nomes prováveis e devolve null quando não acha, em vez de
 *  quebrar. O que não existe na API (gravações, heatmaps) é null para sempre.
 *
 *  Nunca logar nem retornar o token.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const API = "https://www.clarity.ms/export-data/api/v1/project-live-insights";

/** Token inválido/expirado (401) ou sem acesso ao projeto (403). */
export class ClarityAuthError extends Error {}
/** Cota diária de 10 requisições estourada (429). */
export class ClarityRateLimitError extends Error {}
/** Parâmetros inválidos (400) ou resposta inesperada. */
export class ClarityRequestError extends Error {}

/** Dimensões aceitas pela API (a doc lista exatamente estas). */
export type ClarityDimension = "Browser" | "Device" | "Country/Region" | "OS" | "Source" | "Medium" | "Campaign" | "Channel" | "URL";

type LinhaBruta = Record<string, unknown>;
type MetricaBruta = { metricName?: string; information?: LinhaBruta[] };

export type ClarityMetricas = {
  sessions: number | null;
  botSessions: number | null;
  users: number | null;
  pagesPerSession: number | null;
  averageScrollDepth: number | null;
  averageSessionDuration: number | null;
  deadClicks: number | null;
  rageClicks: number | null;
  quickBacks: number | null;
  javascriptErrors: number | null;
  errorClicks: number | null;
  excessiveScroll: number | null;
  /** Não existe na Data Export API — permanentemente indisponível. */
  recordingsCount: null;
  /** Idem: a API não expõe link de heatmap. */
  heatmapUrl: null;
};

export type ClarityPagina = { url: string; sessions: number | null };
export type ClarityFonte = { fonte: string; sessions: number | null };

export type ClaritySnapshot = {
  dias: number;
  rangeStart: Date;
  rangeEnd: Date;
  metricas: ClarityMetricas;
  topPages: ClarityPagina[];
  sources: ClarityFonte[];
  /** metricName que vieram na resposta — ajuda a diagnosticar o que falta. */
  metricasPresentes: string[];
  /** Quantas requisições foram gastas da cota diária. */
  requisicoes: number;
};

// ─── HTTP ────────────────────────────────────────────────────────────────────

/**
 * Reexecuta em 5xx — e SÓ em 5xx.
 *
 * Em 22/07/2026 a API do Clarity respondeu 500 transitório às 06:40 para dois
 * dos três projetos; minutos depois, 200 nos mesmos tokens. Como o cron roda
 * uma vez por dia, um soluço custava o dia inteiro de dados.
 *
 * 4xx não entra: token inválido (401/403) e parâmetro recusado (400) não
 * melhoram esperando — insistir só queimaria a cota de 10 chamadas/dia.
 *
 * `esperas` é parâmetro para o teste não dormir 8 segundos de verdade.
 */
export async function comRetry5xx(
  fazer: () => Promise<Response>,
  esperas: readonly number[] = [2_000, 6_000],
): Promise<Response> {
  let resp = await fazer();
  for (const ms of esperas) {
    if (resp.status < 500) return resp;
    await new Promise((r) => setTimeout(r, ms));
    resp = await fazer();
  }
  return resp;
}

async function chamar(token: string, numOfDays: number, dims: ClarityDimension[]): Promise<MetricaBruta[]> {
  const qs = new URLSearchParams({ numOfDays: String(numOfDays) });
  dims.slice(0, 3).forEach((d, i) => qs.set(`dimension${i + 1}`, d));

  let resp: Response;
  try {
    resp = await comRetry5xx(() => fetch(`${API}?${qs.toString()}`, {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(30_000),
    }));
  } catch (e) {
    // Falha de rede/timeout — a mensagem nunca inclui o token.
    throw new ClarityRequestError(`Falha de rede ao consultar o Clarity: ${(e as Error).message}`);
  }

  if (resp.status === 401) throw new ClarityAuthError("Token do Clarity inválido ou expirado.");
  if (resp.status === 403) throw new ClarityAuthError("Token sem acesso a este projeto do Clarity.");
  if (resp.status === 429) throw new ClarityRateLimitError("Cota diária do Clarity esgotada (10 requisições por projeto por dia).");
  if (resp.status === 400) throw new ClarityRequestError("Parâmetros recusados pelo Clarity.");
  if (!resp.ok) throw new ClarityRequestError(`Clarity respondeu ${resp.status} (após novas tentativas).`);

  const json = await resp.json().catch(() => null);
  if (!Array.isArray(json)) throw new ClarityRequestError("Resposta do Clarity em formato inesperado.");
  return json as MetricaBruta[];
}

// ─── Normalização defensiva ──────────────────────────────────────────────────

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Procura a 1ª chave existente entre vários nomes prováveis (a doc não os fixa). */
function pega(linha: LinhaBruta | undefined, ...nomes: string[]): number | null {
  if (!linha) return null;
  for (const n of nomes) {
    const achou = Object.keys(linha).find((k) => k.toLowerCase() === n.toLowerCase());
    if (achou) { const v = num(linha[achou]); if (v !== null) return v; }
  }
  return null;
}

const acharMetrica = (rs: MetricaBruta[], ...nomes: string[]): LinhaBruta | undefined => {
  const alvo = nomes.map((n) => n.toLowerCase().replace(/[^a-z]/g, ""));
  const m = rs.find((r) => alvo.includes((r.metricName ?? "").toLowerCase().replace(/[^a-z]/g, "")));
  return m?.information?.[0];
};

/** Soma uma métrica que vem quebrada em várias linhas (ex.: por dimensão). */
function somar(rs: MetricaBruta[], nomes: string[], campos: string[]): number | null {
  const alvo = nomes.map((n) => n.toLowerCase().replace(/[^a-z]/g, ""));
  const m = rs.find((r) => alvo.includes((r.metricName ?? "").toLowerCase().replace(/[^a-z]/g, "")));
  if (!m?.information?.length) return null;
  let total: number | null = null;
  for (const linha of m.information) {
    const v = pega(linha, ...campos);
    if (v !== null) total = (total ?? 0) + v;
  }
  return total;
}

function normalizarMetricas(rs: MetricaBruta[]): ClarityMetricas {
  const traffic = acharMetrica(rs, "Traffic");
  return {
    // Traffic é a única métrica com formato documentado.
    sessions: somar(rs, ["Traffic"], ["totalSessionCount"]),
    botSessions: somar(rs, ["Traffic"], ["totalBotSessionCount"]),
    users: somar(rs, ["Traffic"], ["distantUserCount", "distinctUserCount", "totalUserCount"]),
    pagesPerSession: pega(traffic, "PagesPerSessionPercentage", "pagesPerSession"),
    averageScrollDepth: pega(acharMetrica(rs, "ScrollDepth"), "averageScrollDepth", "scrollDepth", "value"),
    averageSessionDuration: pega(acharMetrica(rs, "EngagementTime"), "activeTime", "totalTime", "averageSessionDuration", "value"),
    deadClicks: somar(rs, ["DeadClickCount"], ["subTotal", "deadClickCount", "count", "value"]),
    rageClicks: somar(rs, ["RageClickCount"], ["subTotal", "rageClickCount", "count", "value"]),
    quickBacks: somar(rs, ["QuickbackClick"], ["subTotal", "quickbackClick", "count", "value"]),
    javascriptErrors: somar(rs, ["ScriptErrorCount"], ["subTotal", "scriptErrorCount", "count", "value"]),
    errorClicks: somar(rs, ["ErrorClickCount"], ["subTotal", "errorClickCount", "count", "value"]),
    excessiveScroll: somar(rs, ["ExcessiveScroll"], ["subTotal", "excessiveScrollCount", "count", "value"]),
    // A Data Export API não expõe nenhum dos dois. Não é limitação nossa.
    recordingsCount: null,
    heatmapUrl: null,
  };
}

/** Extrai linhas rotuladas por dimensão (ex.: URL → sessões). */
function porDimensao(rs: MetricaBruta[], metrica: string[], dim: string, limite: number): { chave: string; sessions: number | null }[] {
  const alvo = metrica.map((n) => n.toLowerCase().replace(/[^a-z]/g, ""));
  const m = rs.find((r) => alvo.includes((r.metricName ?? "").toLowerCase().replace(/[^a-z]/g, "")));
  if (!m?.information?.length) return [];
  const out: { chave: string; sessions: number | null }[] = [];
  for (const linha of m.information) {
    const k = Object.keys(linha).find((x) => x.toLowerCase() === dim.toLowerCase());
    const chave = k ? String(linha[k] ?? "") : "";
    if (!chave) continue;
    out.push({ chave, sessions: pega(linha, "totalSessionCount", "visitsCount", "count") });
  }
  return out.sort((a, b) => (b.sessions ?? 0) - (a.sessions ?? 0)).slice(0, limite);
}

// ─── API pública ─────────────────────────────────────────────────────────────

/**
 * Um snapshot completo custa 3 requisições da cota de 10/dia:
 *   1) sem dimensão  → números gerais
 *   2) dimension1=URL    → páginas populares
 *   3) dimension1=Source → fontes de tráfego
 * Se as chamadas 2/3 falharem, o snapshot ainda é válido com o que veio da 1.
 */
export async function coletarSnapshot(token: string, numOfDays: 1 | 2 | 3 = 1): Promise<ClaritySnapshot> {
  const rangeEnd = new Date();
  const rangeStart = new Date(rangeEnd.getTime() - numOfDays * 86400000);

  const geral = await chamar(token, numOfDays, []); // erro aqui aborta: sem isto não há snapshot
  let requisicoes = 1;

  let topPages: ClarityPagina[] = [];
  try {
    const porUrl = await chamar(token, numOfDays, ["URL"]);
    requisicoes++;
    topPages = porDimensao(porUrl, ["Traffic", "PopularPages"], "URL", 10).map((x) => ({ url: x.chave, sessions: x.sessions }));
  } catch { /* detalhe é opcional — o snapshot vale sem ele */ }

  let sources: ClarityFonte[] = [];
  try {
    const porSource = await chamar(token, numOfDays, ["Source"]);
    requisicoes++;
    sources = porDimensao(porSource, ["Traffic"], "Source", 10).map((x) => ({ fonte: x.chave, sessions: x.sessions }));
  } catch { /* idem */ }

  return {
    dias: numOfDays, rangeStart, rangeEnd,
    metricas: normalizarMetricas(geral),
    topPages, sources,
    metricasPresentes: geral.map((m) => m.metricName ?? "?").filter(Boolean),
    requisicoes,
  };
}

/** Link do dashboard do Clarity. O projectId serve só para isto. */
export const clarityDashboardUrl = (projectId: string | null): string | null =>
  projectId ? `https://clarity.microsoft.com/projects/view/${projectId}/dashboard` : null;
