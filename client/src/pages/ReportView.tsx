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
const MESES_LONGOS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** "2026-07-05" → "5/jul". O eixo mostrava a data ISO crua para o cliente. */
function fmtSemana(iso: string): string {
  const [, m, d] = iso.split("-");
  const mi = Number(m) - 1;
  if (!d || mi < 0 || mi > 11) return iso;
  return `${Number(d)}/${MESES[mi]}`;
}

/**
 * Período por extenso — "1 a 15 de julho de 2026", "28 de junho a 12 de julho
 * de 2026". Repetir mês e ano quando não mudam é ruído; omitir quando mudam é
 * ambíguo. Sem o período, os números do relatório não querem dizer nada.
 */
function fmtPeriodo(inicio?: string, fim?: string): { rotulo: string; dias: number } | null {
  if (!inicio || !fim) return null;
  const [ai, mi, di] = inicio.split("-").map(Number);
  const [af, mf, df] = fim.split("-").map(Number);
  if (!ai || !af || !mi || !mf) return null;
  const mesI = MESES_LONGOS[mi - 1];
  const mesF = MESES_LONGOS[mf - 1];
  let rotulo: string;
  if (ai === af && mi === mf) rotulo = `${di} a ${df} de ${mesF} de ${af}`;
  else if (ai === af) rotulo = `${di} de ${mesI} a ${df} de ${mesF} de ${af}`;
  else rotulo = `${di} de ${mesI} de ${ai} a ${df} de ${mesF} de ${af}`;
  const dias = Math.round(
    (Date.UTC(af, mf - 1, df) - Date.UTC(ai, mi - 1, di)) / 86400000
  ) + 1;
  return { rotulo, dias };
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

/** Cor da série no gráfico. Mesma semântica do BIT: rosa para dinheiro, verde
 *  para volume de resultado. */
const COR_METRICA: Record<Metric, string> = {
  investment: "#E85BA8", costPerConversion: "#E85BA8",
  reach: "#1D9E75", conversions: "#1D9E75",
};

// ── Blocos visuais ──────────────────────────────────────────────────────────

/** Card de seção no padrão do BIT: título em caixa normal à esquerda,
 *  complemento em cinza à direita. */
function Secao({ titulo, meta, className, children }: {
  titulo: string; meta?: string; className?: string; children: React.ReactNode;
}) {
  return (
    <section className={`rv-card ${className ?? ""}`}>
      <div className="rv-card-head">
        <h3>{titulo}</h3>
        {meta && <span className="rv-card-meta">{meta}</span>}
      </div>
      {children}
    </section>
  );
}

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
  const cor = COR_METRICA[metric];
  const gradId = `rv-grad-${metric}`;
  const escala = [
    { pos: "topo", valor: chart.max },
    { pos: "meio", valor: (chart.min + chart.max) / 2 },
    { pos: "base", valor: chart.min },
  ];
  const linhasY = [chart.pad, chart.h / 2, chart.h - chart.pad];

  return (
    <Secao titulo="Comparativo semanal" meta={`${series.length} semanas`}>
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
            {/* Gradiente em vez de preenchimento chapado — o mesmo tratamento do
                gráfico do BIT (.22 → 0). */}
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={cor} stopOpacity={0.24} />
                <stop offset="95%" stopColor={cor} stopOpacity={0} />
              </linearGradient>
            </defs>
            {linhasY.map((y, i) => (
              <line key={i} className="rv-grid-line" x1={chart.pad} x2={chart.w - chart.pad} y1={y} y2={y} />
            ))}
            {/* `key={metric}` remonta o grupo: a linha se redesenha ao trocar de
                aba, em vez de trocar de forma instantaneamente. */}
            <g key={metric}>
              <path className="rv-area" d={chart.area} fill={`url(#${gradId})`} />
              {/* pathLength=1 normaliza o comprimento: o dash da animação não
                  depende do tamanho real do traçado, que muda a cada métrica. */}
              <path className="rv-linha" d={chart.line} pathLength={1} fill="none" stroke={cor}
                strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
              {chart.pts.map((p, i) => {
                const ultimo = i === chart.pts.length - 1;
                const destacado = ativo === i;
                return (
                  <circle key={i} className="rv-ponto" cx={p[0]} cy={p[1]}
                    r={destacado ? 7 : ultimo ? 5.5 : 3.5}
                    fill={cor} stroke="#fffdfa" strokeWidth={2.5}
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
    </Secao>
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
    <Secao titulo="Criativos em destaque" meta={`${criativos.length} melhores por custo/resultado`}>
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
    </Secao>
  );
}

type Publico = { adsetId: string; adsetName: string; ctr?: number | null; costPerResult?: number | null; status?: string };

function PublicosTestados({ publicos }: { publicos: Publico[] }) {
  if (!publicos.length) return null;
  return (
    <Secao titulo="Públicos testados" meta={`${publicos.length} conjuntos`}>
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
    </Secao>
  );
}

type Destaque = { resumo?: string; detalhe?: string };

/**
 * Leitura estratégica em três caixas. É o que o cliente lê antes de olhar
 * qualquer número: o que funcionou, o que custou e onde está a abertura do
 * próximo período. Caixa sem `resumo` simplesmente não aparece — melhor duas
 * caixas honestas que três com uma inventada.
 */
function LeituraEstrategica({ alto, fraco, oportunidade }: {
  alto?: Destaque; fraco?: Destaque; oportunidade?: Destaque;
}) {
  const caixas = [
    { chave: "alto", rotulo: "Ponto alto", d: alto },
    { chave: "fraco", rotulo: "Ponto fraco", d: fraco },
    { chave: "oportunidade", rotulo: "Oportunidade", d: oportunidade },
  ].filter((c) => c.d?.resumo);
  if (!caixas.length) return null;
  return (
    <div className="rv-leitura">
      {caixas.map((c) => (
        <div key={c.chave} className={`rv-leitura-card ${c.chave}`}>
          <div className="rv-leitura-head">
            <span className="ponto" />
            <span>{c.rotulo}</span>
          </div>
          <h4>{c.d!.resumo}</h4>
          {c.d!.detalhe && <p>{c.d!.detalhe}</p>}
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
  pontoAlto?: Destaque;
  pontoFraco?: Destaque;
  oportunidade?: Destaque;
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
  const periodo = fmtPeriodo(r.period?.start, r.period?.end);

  return (
    <div className="report-view">
      <header className="rv-topbar">
        <div className="rv-topbar-inner">
          <div className="rv-brand"><div className="rv-mark">S</div><span>Selva Agency</span></div>
          {/* O período saiu daqui: em ISO, apertado e em cinza, ele não dava
              sentido a nada. Agora tem bloco próprio abaixo do título. */}
          <div className="rv-meta">{midia?.account?.name ?? ""}</div>
        </div>
      </header>

      <main className="rv-main">
        <span className="rv-eyebrow">{tipoDeRelatorio(r.modulos)}</span>
        {/* Relatórios antigos não têm `titulo` — daí o fallback. */}
        <h1 className="rv-h1">{n?.titulo || "Resumo do período"}</h1>

        {periodo && (
          <div className="rv-periodo">
            <span className="ponto" />
            <b>{periodo.rotulo}</b>
            <span className="dias">{periodo.dias} {periodo.dias === 1 ? "dia" : "dias"}</span>
          </div>
        )}

        {n?.resumoExecutivo && <p className="rv-lead">{n.resumoExecutivo}</p>}

        {usadas.length > 0 && (
          <div className="rv-fontes">
            {usadas.map((f) => <span key={f.rotulo} className="rv-pill">{f.rotulo}</span>)}
          </div>
        )}

        {m && <GradeKpis kpis={kpisDeMidia(m, resultLabel)} />}

        <LeituraEstrategica alto={n?.pontoAlto} fraco={n?.pontoFraco} oportunidade={n?.oportunidade} />

        <GraficoSemanal series={serie} metric={metric} tabs={abasDeMetrica(resultLabel)} onMetric={setMetric} />
        <CriativosDestaque criativos={midia?.creatives ?? []} />
        <PublicosTestados publicos={midia?.audiences ?? []} />

        {(ps || seg) && (
          <Secao titulo="Site">
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
          </Secao>
        )}

        {/* ── O fecho: passado explicado, futuro combinado ────────────────── */}

        {n?.oQueAconteceu && (
          <Secao titulo="O que aconteceu no período">
            <p className="rv-prosa">{n.oQueAconteceu}</p>
          </Secao>
        )}

        {n?.proximosPassos && n.proximosPassos.length > 0 && (
          <Secao titulo="Próximos passos" className="rv-next">
            <ol>
              {n.proximosPassos.map((p, i) => (
                <li key={i}><span className="rv-passo">{i + 1}</span><span>{p}</span></li>
              ))}
            </ol>
          </Secao>
        )}

        {n?.oQueVamosMedir && n.oQueVamosMedir.length > 0 && (
          <Secao titulo="O que vamos medir">
            <p className="rv-card-sub">Os indicadores que vão dizer se os passos acima funcionaram.</p>
            <ul className="rv-lista rv-medir">
              {n.oQueVamosMedir.map((x, i) => <li key={i}>{x}</li>)}
            </ul>
          </Secao>
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
