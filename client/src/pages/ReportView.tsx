import { useState, useMemo } from "react";
import { useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import "./ReportView.css";

/**
 * Relatório público (/r/:token) — a peça que o CLIENTE recebe.
 *
 * Quem lê é o dono da conta, não a agência. Isso decide o que entra: até
 * 02/ago/2026 a metade de baixo era fatos/interpretações/hipóteses/pendências
 * (análise interna) e foi substituída por quatro blocos — o que aconteceu, o
 * que vamos fazer, o que vamos medir, o que esperamos.
 *
 * Identidade "papel" própria, de propósito: é um documento entregue, não uma
 * tela do painel. Não migrar para o kit do app.
 */

type Metric = "investment" | "reach" | "conversions" | "costPerConversion";

/**
 * Direção "boa" de cada métrica. Sem isto a variação vira ▲ verde sempre — e um
 * custo por resultado 40% mais caro aparece como boa notícia no link do cliente.
 * Investimento é neutro de propósito: gastar mais não é bom nem ruim sozinho.
 */
type Direcao = "maiorMelhor" | "menorMelhor" | "neutro";
const DIRECAO: Record<Metric, Direcao> = {
  investment: "neutro",
  reach: "maiorMelhor",
  conversions: "maiorMelhor",
  costPerConversion: "menorMelhor",
};
/** Métricas em dinheiro — formatação e eixo do gráfico mudam. */
const EH_DINHEIRO: Record<Metric, boolean> = {
  investment: true, reach: false, conversions: false, costPerConversion: true,
};

function fmtBRL(n: number | null | undefined): string {
  if (n === null || n === undefined) return "N/D";
  return `R$ ${n.toFixed(2).replace(".", ",")}`;
}

function fmtNum(n: number | null | undefined): string {
  if (n === null || n === undefined) return "N/D";
  return n.toLocaleString("pt-BR");
}

function fmtPct(n: number | null | undefined): string {
  return typeof n === "number" && Number.isFinite(n) ? `${n.toFixed(2)}%` : "—";
}

/** Rótulo curto para o eixo do gráfico: 4200 → "4,2mil", 18 → "18". */
function fmtCurto(n: number, dinheiro: boolean): string {
  const abs = Math.abs(n);
  let s: string;
  if (abs >= 1000000) s = `${(n / 1000000).toFixed(1).replace(".", ",")}mi`;
  else if (abs >= 1000) s = `${(n / 1000).toFixed(1).replace(".", ",")}mil`;
  else s = n.toLocaleString("pt-BR", { maximumFractionDigits: abs < 10 ? 2 : 0 });
  return dinheiro ? `R$ ${s}` : s;
}

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
/** "2026-07-05" → "5/jul". O eixo mostrava a data ISO crua para o cliente. */
function fmtSemana(iso: string): string {
  const [, m, d] = iso.split("-");
  const mi = Number(m) - 1;
  if (!d || mi < 0 || mi > 11) return iso;
  return `${Number(d)}/${MESES[mi]}`;
}

function pctDelta(curr: number, prev: number, dir: Direcao = "neutro"): { label: string; cls: string } {
  if (prev === 0) return { label: "novo", cls: "" };
  const pct = ((curr - prev) / prev) * 100;
  if (Math.abs(pct) < 2) return { label: "≈ estável", cls: "" };
  const subiu = pct > 0;
  const arrow = subiu ? "▲" : "▼";
  let cls = "";
  if (dir === "maiorMelhor") cls = subiu ? "rv-bom" : "rv-ruim";
  else if (dir === "menorMelhor") cls = subiu ? "rv-ruim" : "rv-bom";
  return { label: `${arrow} ${Math.abs(pct).toFixed(0)}%`, cls };
}

function buildChartPath(values: number[], w = 640, h = 190, pad = 16) {
  const innerW = w - pad * 2;
  const innerH = h - pad * 2;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => {
    const x = pad + innerW * (i / Math.max(1, values.length - 1));
    const y = pad + innerH * (1 - (v - min) / range);
    return [x, y] as [number, number];
  });
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  const area = `${line} L ${pts[pts.length - 1][0].toFixed(1)} ${h - pad} L ${pts[0][0].toFixed(1)} ${h - pad} Z`;
  return { pts, line, area, w, h, pad, min, max };
}

const rotuloStatus = (s?: string) => (s === "good" ? "Performando bem" : s === "warn" ? "Atenção" : "Estável");

// ── Blocos visuais ──────────────────────────────────────────────────────────

type Kpi = { label: string; valor: string; delta: { label: string; cls: string } };

function GradeKpis({ kpis }: { kpis: Kpi[] }) {
  return (
    <div className="rv-metric-grid">
      {kpis.map((k) => (
        <div key={k.label} className="rv-metric">
          <small>{k.label}</small>
          <span className="num">{k.valor}</span>
          {k.delta.label && <span className={`rv-delta ${k.delta.cls}`}>{k.delta.label}</span>}
        </div>
      ))}
    </div>
  );
}

type Serie = Array<{ week: string; value: number | null }>;

/**
 * Gráfico das 8 semanas. Sem biblioteca de propósito: o relatório é impresso e
 * enviado por link, e um SVG estático abre em qualquer lugar. As linhas de grade
 * e os rótulos de valor existem porque a curva sozinha não dizia a escala.
 */
function GraficoSemanal({ series, metric, tabs, onMetric }: {
  series: Serie;
  metric: Metric;
  tabs: Array<{ key: Metric; label: string }>;
  onMetric: (m: Metric) => void;
}) {
  // `null` = nenhum ponto sob o cursor. Sobrevive à troca de métrica de
  // propósito: quem está inspecionando uma semana quer vê-la na métrica nova.
  const [ativo, setAtivo] = useState<number | null>(null);
  const chart = useMemo(() => {
    if (!series.length) return null;
    return { ...buildChartPath(series.map((p) => p.value ?? 0)), semanas: series.map((p) => p.week) };
  }, [series]);
  if (!chart) return null;

  const dinheiro = EH_DINHEIRO[metric];
  const escala = [
    { pos: "topo", valor: chart.max },
    { pos: "meio", valor: (chart.min + chart.max) / 2 },
    { pos: "base", valor: chart.min },
  ];
  const linhasY = [chart.pad, chart.h / 2, chart.h - chart.pad];

  return (
    <div className="rv-card">
      <h3>Comparativo semanal</h3>
      <div className="rv-tabs">
        {tabs.map((t) => (
          <button key={t.key} type="button" className={`rv-tab ${metric === t.key ? "active" : ""}`} onClick={() => onMetric(t.key)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="rv-chart-wrap">
        <div className="rv-plot" onPointerLeave={() => setAtivo(null)}>
          <svg className="rv-chart" viewBox={`0 0 ${chart.w} ${chart.h}`} width="100%" role="img"
            aria-label={`Evolução semanal de ${tabs.find((t) => t.key === metric)?.label ?? ""}`}>
            {linhasY.map((y, i) => (
              <line key={i} className="rv-grid-line" x1={chart.pad} x2={chart.w - chart.pad} y1={y} y2={y} />
            ))}
            {/* `key={metric}` remonta o grupo: a linha se redesenha ao trocar de
                aba, em vez de trocar de forma instantaneamente. */}
            <g key={metric}>
              <path className="rv-area" d={chart.area} fill="rgba(23,63,59,.12)" />
              {/* pathLength=1 normaliza o comprimento: o dash da animação não
                  depende do tamanho real do traçado, que muda a cada métrica. */}
              <path className="rv-linha" d={chart.line} pathLength={1} fill="none" stroke="#173f3b"
                strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
              {chart.pts.map((p, i) => {
                const ultimo = i === chart.pts.length - 1;
                const destacado = ativo === i;
                return (
                  <circle key={i} className="rv-ponto" cx={p[0]} cy={p[1]}
                    r={destacado ? 7.5 : ultimo ? 6 : 4}
                    fill={ultimo || destacado ? "#f4368c" : "#173f3b"} stroke="#fffdfa" strokeWidth={2.5}
                    style={{ animationDelay: `${240 + i * 55}ms` }} />
                );
              })}
              {/* Faixa invisível de largura inteira por semana: acertar um ponto
                  de 4px com o dedo não acontece. */}
              {chart.pts.map((p, i) => {
                const faixa = chart.w / chart.pts.length;
                return (
                  <rect key={`alvo-${i}`} className="rv-alvo" x={p[0] - faixa / 2} y={0} width={faixa} height={chart.h}
                    onPointerEnter={() => setAtivo(i)} onPointerDown={() => setAtivo(i)} />
                );
              })}
            </g>
          </svg>
          {ativo !== null && series[ativo] && (
            <div
              className={`rv-tip ${ativo === 0 ? "borda-esq" : ativo === chart.pts.length - 1 ? "borda-dir" : ""}`}
              style={{ left: `${(chart.pts[ativo][0] / chart.w) * 100}%`, top: `${(chart.pts[ativo][1] / chart.h) * 100}%` }}
            >
              <span>semana de {fmtSemana(chart.semanas[ativo])}</span>
              <b>{dinheiro ? fmtBRL(series[ativo].value) : fmtNum(series[ativo].value)}</b>
            </div>
          )}
        </div>
        {escala.map((e) => (
          <span key={e.pos} className={`rv-escala ${e.pos}`}>{fmtCurto(e.valor, dinheiro)}</span>
        ))}
      </div>
      <div className="rv-axis">
        {chart.semanas.map((w) => <span key={w}>{fmtSemana(w)}</span>)}
      </div>
    </div>
  );
}

type Criativo = {
  adId: string; adName: string; ctr?: number | null; costPerResult?: number | null;
  thumbnailUrl?: string | null; status?: string; managerUrl?: string | null;
};

/** Só o preview público da Meta vira link. O fallback de `managerUrl` é uma URL
 *  do Ads Manager, que exige login com acesso à conta — mandar o cliente para
 *  lá parece link quebrado, então o card fica sem clique. */
const ehPreviewPublico = (url?: string | null) =>
  !!url && !url.includes("adsmanager.facebook.com");

function CriativosDestaque({ criativos }: { criativos: Criativo[] }) {
  if (!criativos.length) return null;
  return (
    <div className="rv-card">
      <h3>Criativos em destaque</h3>
      <div className="rv-creative-grid">
        {criativos.map((c) => {
          const link = ehPreviewPublico(c.managerUrl) ? c.managerUrl! : null;
          const Tag = link ? "a" : "div";
          return (
            <Tag key={c.adId} className={`rv-creative-card ${link ? "clicavel" : ""}`}
              {...(link ? { href: link, target: "_blank", rel: "noopener noreferrer", title: "Abrir o criativo" } : {})}>
              <div className={`rv-thumb ${c.thumbnailUrl ? "" : "vazio"}`}
                style={c.thumbnailUrl ? { backgroundImage: `url(${c.thumbnailUrl})` } : undefined}>
                {!c.thumbnailUrl && "sem prévia"}
                {link && <span className="rv-abrir" aria-hidden="true">↗</span>}
              </div>
              <div className="rv-creative-info">
                <p className="fmt">{c.adName}</p>
                <div className="rv-stat"><span>CTR</span><b>{fmtPct(c.ctr)}</b></div>
                <div className="rv-stat"><span>Custo/result.</span><b>{fmtBRL(c.costPerResult)}</b></div>
                <span className={`rv-pill ${c.status ?? "neutral"}`}>{rotuloStatus(c.status)}</span>
              </div>
            </Tag>
          );
        })}
      </div>
    </div>
  );
}

type Publico = { adsetId: string; adsetName: string; ctr?: number | null; costPerResult?: number | null; status?: string };

function PublicosTestados({ publicos }: { publicos: Publico[] }) {
  if (!publicos.length) return null;
  return (
    <div className="rv-card">
      <h3>Públicos testados</h3>
      {publicos.map((a) => (
        <div key={a.adsetId} className="rv-audience-row">
          <div>
            <span className="name">{a.adsetName}</span>
            <span className={`rv-pill ${a.status ?? "neutral"}`}>{rotuloStatus(a.status)}</span>
          </div>
          <div className="rv-nums">
            <span>CTR<b>{fmtPct(a.ctr)}</b></span>
            <span>Custo/resultado<b>{fmtBRL(a.costPerResult)}</b></span>
          </div>
        </div>
      ))}
    </div>
  );
}

function abasDeMetrica(resultLabel: string): Array<{ key: Metric; label: string }> {
  return [
    { key: "investment", label: "Investimento" },
    { key: "reach", label: "Alcance" },
    { key: "conversions", label: resultLabel },
    { key: "costPerConversion", label: "Custo/resultado" },
  ];
}

type Metricas = Record<Metric, { current: number | null; previous: number | null }>;

function kpisDeMidia(m: Metricas, resultLabel: string): Kpi[] {
  return [
    { label: "Investimento", valor: fmtBRL(m.investment.current), delta: pctDelta(m.investment.current ?? 0, m.investment.previous ?? 0, DIRECAO.investment) },
    { label: "Alcance", valor: fmtNum(m.reach.current), delta: pctDelta(m.reach.current ?? 0, m.reach.previous ?? 0, DIRECAO.reach) },
    { label: resultLabel, valor: fmtNum(m.conversions.current), delta: pctDelta(m.conversions.current ?? 0, m.conversions.previous ?? 0, DIRECAO.conversions) },
    { label: `Custo/${resultLabel.toLowerCase()}`, valor: fmtBRL(m.costPerConversion.current), delta: pctDelta(m.costPerConversion.current ?? 0, m.costPerConversion.previous ?? 0, DIRECAO.costPerConversion) },
  ];
}

// ── Dados do relatório ──────────────────────────────────────────────────────

const ehNumRV = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const fmtMsRV = (v: unknown) => (ehNumRV(v) ? (v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${Math.round(v)}ms`) : "—");
const fmtScoreRV = (v: unknown) => (ehNumRV(v) ? String(Math.round(v)) : "—");
const corScoreRV = (v: unknown) => (!ehNumRV(v) ? "#666a66" : v >= 90 ? "#1D9E75" : v >= 50 ? "#EF9F27" : "#E24B4A");

type DadosMidia = {
  account?: { name?: string };
  resultLabel?: string;
  metrics?: Metricas;
  weeklyTrend?: Record<Metric, Serie>;
  creatives?: Criativo[];
  audiences?: Publico[];
};
type DadosSiteRV = {
  pagespeed?: Record<string, unknown>;
  seguranca?: Record<string, unknown>;
  uptime?: Record<string, unknown>;
  clarity?: Record<string, unknown>;
};
/** Narrativa voltada ao cliente. Os campos internos (fatos, hipóteses,
 *  recomendações com prioridade, pendências) foram removidos em 02/ago/2026. */
type Narrativa = {
  titulo?: string;
  resumoExecutivo?: string;
  oQueAconteceu?: string;
  proximosPassos?: string[];
  oQueVamosMedir?: string[];
  expectativa?: string;
};
type Relatorio = {
  period?: { start: string; end: string };
  modulos?: string[] | null;
  narrative: Narrativa | null;
  fontes?: { rotulo: string; presente: boolean; porque?: string }[] | null;
  data?: { midia?: DadosMidia | null; site?: DadosSiteRV | null };
};

/**
 * Snapshots gerados antes do formato modular guardam a mídia na raiz do
 * dataSnapshot e uma narrativa com outros nomes. Adaptar sai muito mais barato
 * que manter uma segunda vista inteira só para eles — e os links que já estão
 * na mão dos clientes continuam abrindo.
 */
function adaptarLegado(bruto: {
  period?: { start: string; end: string };
  data?: Record<string, unknown>;
  narrative?: Record<string, unknown> | null;
}): Relatorio {
  const n = (bruto.narrative ?? {}) as {
    headline?: string; resumo?: string; positivo?: string; atencao?: string; proximosPassos?: string[];
  };
  return {
    period: bruto.period,
    modulos: ["midia"],
    fontes: null,
    data: { midia: (bruto.data ?? null) as DadosMidia | null, site: null },
    narrative: {
      titulo: n.headline ?? "",
      resumoExecutivo: n.resumo ?? "",
      oQueAconteceu: [n.positivo, n.atencao].filter(Boolean).join(" "),
      proximosPassos: Array.isArray(n.proximosPassos) ? n.proximosPassos : [],
      oQueVamosMedir: [],
      expectativa: "",
    },
  };
}

/** Nomeia a peça pelo que ela de fato olhou — "Relatório" genérico não ajuda
 *  quem reabre o link seis meses depois. */
function tipoDeRelatorio(modulos: string[] | null | undefined): string {
  const m = modulos ?? [];
  if (!m.length) return "Relatório";
  const midia = m.some((x) => x === "midia" || x === "campanhas");
  const site = m.some((x) => ["site", "pagespeed", "seguranca", "uptime", "clarity"].includes(x));
  if (midia && site) return "Relatório de performance";
  if (midia) return "Relatório de mídia paga";
  if (site) return "Relatório técnico";
  return "Relatório";
}

// ── Página ──────────────────────────────────────────────────────────────────

export default function ReportView() {
  const [, params] = useRoute<{ token: string }>("/r/:token");
  const token = params?.token ?? "";
  const [metric, setMetric] = useState<Metric>("investment");

  const { data: bruto, isLoading, error } = trpc.reports.getPublic.useQuery(
    { token },
    { enabled: !!token, retry: false }
  );

  if (isLoading) {
    return <div className="report-view"><div className="rv-loading">Carregando relatório…</div></div>;
  }
  if (error || !bruto) {
    return <div className="report-view"><div className="rv-error">Não encontramos esse relatório. Verifique o link recebido.</div></div>;
  }

  // Sem `modulos` é snapshot do formato antigo — adaptado, não renderizado por
  // uma vista paralela.
  const r: Relatorio = bruto.modulos?.length ? (bruto as unknown as Relatorio) : adaptarLegado(bruto as never);

  const n = r.narrative;
  const usadas = (r.fontes ?? []).filter((f) => f.presente);
  const midia = r.data?.midia ?? null;
  const site = r.data?.site ?? null;
  const resultLabel = midia?.resultLabel ?? "Resultados";
  const serie = midia?.weeklyTrend?.[metric] ?? [];
  const m = midia?.metrics;
  const ps = (site?.pagespeed ?? null) as Record<string, unknown> | null;
  const seg = (site?.seguranca ?? null) as Record<string, unknown> | null;

  return (
    <div className="report-view">
      <header className="rv-topbar">
        <div className="rv-topbar-inner">
          <div className="rv-brand"><div className="rv-mark">S</div><span>Selva Agency</span></div>
          <div className="rv-meta"><b>{midia?.account?.name ?? ""}</b> · {r.period?.start} a {r.period?.end}</div>
        </div>
      </header>

      <main className="rv-main">
        <span className="rv-eyebrow">{tipoDeRelatorio(r.modulos)}</span>
        {/* Relatórios antigos não têm `titulo` — daí o fallback. */}
        <h1 className="rv-h1">{n?.titulo || "Resumo do período"}</h1>
        {n?.resumoExecutivo && <p className="rv-lead">{n.resumoExecutivo}</p>}

        {usadas.length > 0 && (
          <div className="rv-fontes">
            {usadas.map((f) => <span key={f.rotulo} className="rv-pill">{f.rotulo}</span>)}
          </div>
        )}

        {m && <GradeKpis kpis={kpisDeMidia(m, resultLabel)} />}

        <GraficoSemanal series={serie} metric={metric} tabs={abasDeMetrica(resultLabel)} onMetric={setMetric} />
        <CriativosDestaque criativos={midia?.creatives ?? []} />
        <PublicosTestados publicos={midia?.audiences ?? []} />

        {(ps || seg) && (
          <div className="rv-card">
            <h3>Site</h3>
            <div className="rv-metric-grid">
              {ps && (
                <>
                  <div className="rv-metric"><small>Performance</small><span className="num" style={{ color: corScoreRV(ps.performanceScore) }}>{fmtScoreRV(ps.performanceScore)}</span></div>
                  <div className="rv-metric"><small>LCP</small><span className="num">{fmtMsRV(ps.lcp)}</span></div>
                </>
              )}
              {seg && (
                <>
                  <div className="rv-metric"><small>Segurança</small><span className="num" style={{ color: corScoreRV(seg.score) }}>{fmtScoreRV(seg.score)}</span></div>
                  <div className="rv-metric"><small>HTTPS</small><span className="num">{seg.https ? "OK" : "—"}</span></div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ── Os quatro blocos: passado explicado, futuro combinado ───────── */}

        {n?.oQueAconteceu && (
          <section className="rv-card">
            <h3>O que aconteceu no período</h3>
            <p className="rv-prosa">{n.oQueAconteceu}</p>
          </section>
        )}

        {n?.proximosPassos && n.proximosPassos.length > 0 && (
          <section className="rv-card rv-next">
            <h3>Próximos passos</h3>
            <ol>
              {n.proximosPassos.map((p, i) => (
                <li key={i}><span className="rv-passo">{i + 1}</span><span>{p}</span></li>
              ))}
            </ol>
          </section>
        )}

        {n?.oQueVamosMedir && n.oQueVamosMedir.length > 0 && (
          <section className="rv-card">
            <h3>O que vamos medir</h3>
            <p className="rv-card-sub">Os indicadores que vão dizer se os passos acima funcionaram.</p>
            <ul className="rv-lista rv-medir">
              {n.oQueVamosMedir.map((x, i) => <li key={i}>{x}</li>)}
            </ul>
          </section>
        )}

        {n?.expectativa && (
          <section className="rv-expectativa">
            <h3>Expectativa para o próximo período</h3>
            <p>{n.expectativa}</p>
          </section>
        )}
      </main>

      <footer className="rv-footer">
        <div className="rv-footer-inner">Relatório gerado automaticamente a partir dos dados da conta. Powered by SELVA Agency.</div>
      </footer>
    </div>
  );
}
