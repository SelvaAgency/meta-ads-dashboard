/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Performance técnica do site — provider abstrato
 * ─────────────────────────────────────────────────────────────────────────────
 *  PageSpeed Insights (Google) roda Lighthouse de verdade e entrega o que
 *  importa: score, LCP, CLS, TBT, Speed Index e recomendações priorizadas.
 *
 *  VERIFICADO na API real, não presumido:
 *   · Endpoint: GET googleapis.com/pagespeedonline/v5/runPagespeed
 *   · SEM API key → HTTP 429. A cota anônima é compartilhada POR IP e vive
 *     estourada. Na prática a key é obrigatória (é grátis, mas precisa existir).
 *   · Resposta pesada (~1MB) e lenta (10–30s): é um teste real de carregamento.
 *   · `structure score` NÃO existe aqui — é métrica do GTmetrix.
 *
 *  A camada é abstrata de propósito: trocar/plugar GTmetrix depois é implementar
 *  outro `coletar` e mudar o `provider` no banco. Nada acima disto muda.
 *
 *  Nunca logar a API key.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { logger } from "../logger";

export type SiteProvider = "pagespeed" | "gtmetrix" | "manual";
export type Estrategia = "mobile" | "desktop";

/** Key ausente/inválida ou cota estourada — a tela precisa distinguir do resto. */
export class PerfConfigError extends Error {}
export class PerfQuotaError extends Error {}
export class PerfRequestError extends Error {}

export type PerfMetricas = {
  performanceScore: number | null;   // 0–100
  /**
   * As outras categorias do Lighthouse. Vêm do MESMO teste, sem custo extra —
   * o PageSpeed roda o Lighthouse completo e nós só pedíamos performance.
   */
  accessibilityScore: number | null;
  bestPracticesScore: number | null;
  seoScore: number | null;
  lcp: number | null;                // ms
  cls: number | null;                // unitless
  tbt: number | null;                // ms
  speedIndex: number | null;         // ms
  fcp: number | null;                // ms
  tti: number | null;                // ms
  fullyLoaded: number | null;        // ms (aprox.: TTI do Lighthouse)
  pageSizeBytes: number | null;
  requests: number | null;
  /**
   * Só o GTmetrix tem. Fica null e a UI diz isso — não vale ligar um serviço
   * pago por uma métrica quando as outras quatro já vêm de graça.
   */
  structureScore: null;
};

export type PerfRecomendacao = { titulo: string; descricao: string; economiaMs: number | null; };

export type PerfSnapshot = {
  provider: SiteProvider;
  url: string;
  estrategia: Estrategia;
  metricas: PerfMetricas;
  recomendacoes: PerfRecomendacao[];
  externalReportUrl: string | null;
  coletadoEm: Date;
};

const API = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";

const num = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
};

type Audit = { displayValue?: string; numericValue?: number; score?: number | null; title?: string; description?: string; details?: { type?: string; overallSavingsMs?: number; items?: unknown[] } };

export function isPageSpeedConfigured(): boolean {
  return !!process.env.PAGESPEED_API_KEY;
}

/**
 * Um teste custa 1 requisição e demora 10–30s (é carregamento real).
 * `estrategia` mobile por padrão: é como a maioria do tráfego pago chega.
 */
export async function coletarPageSpeed(url: string, estrategia: Estrategia = "mobile"): Promise<PerfSnapshot> {
  const key = process.env.PAGESPEED_API_KEY;
  if (!key) {
    // Sem key a API devolve 429 quase sempre (cota anônima por IP). Falhar aqui
    // com mensagem clara é melhor que um 429 confuso lá na frente.
    throw new PerfConfigError("PageSpeed sem API key configurada (PAGESPEED_API_KEY). Sem ela o Google recusa por cota.");
  }

  // Pedir as 4 categorias custa a mesma requisição: o Lighthouse já roda tudo.
  const qs = new URLSearchParams({ url, strategy: estrategia, key });
  for (const cat of ["performance", "accessibility", "best-practices", "seo"]) qs.append("category", cat);
  let resp: Response;
  try {
    resp = await fetch(`${API}?${qs.toString()}`, { signal: AbortSignal.timeout(60_000) });
  } catch (e) {
    throw new PerfRequestError(`Falha de rede ao testar o site: ${(e as Error).message}`);
  }

  if (resp.status === 429) throw new PerfQuotaError("Cota do PageSpeed esgotada. Tente mais tarde.");
  if (resp.status === 400) throw new PerfRequestError("O Google recusou a URL. Confira se o endereço está completo e acessível.");
  if (resp.status === 403) throw new PerfConfigError("API key do PageSpeed inválida ou sem a API ativada no projeto do Google Cloud.");
  if (!resp.ok) throw new PerfRequestError(`PageSpeed respondeu ${resp.status}.`);

  const json = await resp.json().catch(() => null) as { lighthouseResult?: { categories?: Record<string, { score?: number }>; audits?: Record<string, Audit>; finalUrl?: string } } | null;
  const lr = json?.lighthouseResult;
  if (!lr?.audits) throw new PerfRequestError("Resposta do PageSpeed em formato inesperado.");

  const a = lr.audits;
  const cat = (k: string) => {
    const v = lr.categories?.[k]?.score;
    return typeof v === "number" ? Math.round(v * 100) : null;
  };
  const metricas: PerfMetricas = {
    performanceScore: cat("performance"),
    accessibilityScore: cat("accessibility"),
    bestPracticesScore: cat("best-practices"),
    seoScore: cat("seo"),
    lcp: num(a["largest-contentful-paint"]?.numericValue),
    cls: num(a["cumulative-layout-shift"]?.numericValue),
    tbt: num(a["total-blocking-time"]?.numericValue),
    speedIndex: num(a["speed-index"]?.numericValue),
    fcp: num(a["first-contentful-paint"]?.numericValue),
    tti: num(a["interactive"]?.numericValue),
    fullyLoaded: num(a["interactive"]?.numericValue), // o mais próximo que o Lighthouse dá
    pageSizeBytes: num(a["total-byte-weight"]?.numericValue),
    requests: a["network-requests"]?.details?.items?.length ?? null,
    structureScore: null, // é do GTmetrix
  };

  // "Oportunidades" do Lighthouse com falha: são as recomendações acionáveis.
  const recomendacoes: PerfRecomendacao[] = Object.values(a)
    .filter((x) => x?.details?.type === "opportunity" && (x.score ?? 1) < 1 && x.title)
    .map((x) => ({
      titulo: x.title ?? "",
      descricao: (x.description ?? "").replace(/\[.*?\]\(.*?\)/g, "").trim(), // tira links markdown
      economiaMs: num(x.details?.overallSavingsMs),
    }))
    .sort((x, y) => (y.economiaMs ?? 0) - (x.economiaMs ?? 0))
    .slice(0, 8);

  return {
    provider: "pagespeed",
    url: lr.finalUrl ?? url,
    estrategia,
    metricas,
    recomendacoes,
    externalReportUrl: `https://pagespeed.web.dev/analysis?url=${encodeURIComponent(url)}`,
    coletadoEm: new Date(),
  };
}

/** Ponto único de entrada — troca de provider não vaza para cima. */
export async function coletarPerformance(provider: SiteProvider, url: string, estrategia: Estrategia = "mobile"): Promise<PerfSnapshot> {
  switch (provider) {
    case "pagespeed":
      return coletarPageSpeed(url, estrategia);
    case "gtmetrix":
      // FUTURO/OPCIONAL, por decisão de produto: o GTmetrix cobra por teste
      // (créditos), o que não fecha com monitoramento diário. O slot fica aqui
      // para quando alguém quiser Structure score e waterfall pontualmente.
      // Não é erro de configuração — é uma opção que não ligamos.
      throw new PerfConfigError("O GTmetrix é opcional e não está ligado. A medição usa o PageSpeed.");
    default:
      throw new PerfConfigError("Provider de performance não configurado.");
  }
}

/** Faixas do próprio Lighthouse — 90+ verde, 50–89 laranja, <50 vermelho. */
export function faixaScore(score: number | null): "bom" | "medio" | "ruim" | "indefinido" {
  if (score === null) return "indefinido";
  if (score >= 90) return "bom";
  if (score >= 50) return "medio";
  return "ruim";
}

export function logPerf(msg: string) {
  logger.info(`[Perf] ${msg}`); // nunca inclui a key
}
