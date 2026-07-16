import { useState, useMemo } from "react";
import { useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import "./ReportView.css";

type Metric = "investment" | "reach" | "conversions" | "costPerConversion";

function fmtBRL(n: number | null | undefined): string {
  if (n === null || n === undefined) return "N/D";
  return `R$ ${n.toFixed(2).replace(".", ",")}`;
}

function fmtNum(n: number | null | undefined): string {
  if (n === null || n === undefined) return "N/D";
  return n.toLocaleString("pt-BR");
}

function pctDelta(curr: number, prev: number): { label: string; cls: string } {
  if (prev === 0) return { label: "novo", cls: "" };
  const pct = ((curr - prev) / prev) * 100;
  if (Math.abs(pct) < 2) return { label: "≈ estável", cls: "" };
  const arrow = pct > 0 ? "▲" : "▼";
  return { label: `${arrow} ${Math.abs(pct).toFixed(0)}%`, cls: pct > 0 ? "rv-up" : "rv-down" };
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
  return { pts, line, area, w, h };
}

export default function ReportView() {
  const [, params] = useRoute<{ token: string }>("/r/:token");
  const token = params?.token ?? "";
  const [metric, setMetric] = useState<Metric>("investment");

  const { data: result, isLoading, error } = trpc.reports.getPublic.useQuery(
    { token },
    { enabled: !!token, retry: false }
  );

  const chart = useMemo(() => {
    if (!result?.data?.weeklyTrend) return null;
    const series = result.data.weeklyTrend[metric] as Array<{ week: string; value: number | null }>;
    const values = series.map((p) => p.value ?? 0);
    return { ...buildChartPath(values), weeks: series.map((p) => p.week) };
  }, [result, metric]);

  if (isLoading) {
    return <div className="report-view"><div className="rv-loading">Carregando relatório…</div></div>;
  }

  if (error || !result) {
    return <div className="report-view"><div className="rv-error">Não encontramos esse relatório. Verifique o link recebido.</div></div>;
  }

  const { data, narrative, period } = result;

  // Relatório modular: outra forma de narrative (fatos/hipóteses/pendências) e
  // sem dataSnapshot. Renderizar com o layout legado — que assume métricas de
  // mídia sempre presentes — sairia praticamente em branco no link do cliente.
  if ((result as { modulos?: string[] | null }).modulos?.length) {
    return <RelatorioModularView result={result as never} />;
  }

  const resultLabel = data.resultLabel ?? "Resultados";

  const METRIC_TABS: Array<{ key: Metric; label: string }> = [
    { key: "investment", label: "Investimento" },
    { key: "reach", label: "Alcance" },
    { key: "conversions", label: resultLabel },
    { key: "costPerConversion", label: "Custo/resultado" },
  ];

  return (
    <div className="report-view">
      <header className="rv-topbar">
        <div className="rv-topbar-inner">
          <div className="rv-brand"><div className="rv-mark">S</div><span>Selva Agency</span></div>
          <div className="rv-meta"><b>{data.account?.name}</b> · {period?.start} a {period?.end}</div>
        </div>
      </header>

      <main className="rv-main">
        <span className="rv-eyebrow">Relatório de performance</span>
        <h1 className="rv-h1">{narrative?.headline ?? "Resumo do período"}</h1>
        {narrative?.resumo && <p className="rv-lead">{narrative.resumo}</p>}

        <div className="rv-metric-grid">
          <div className="rv-metric">
            <small>Investimento</small>
            <span className="num">{fmtBRL(data.metrics.investment.current)}</span>
            <span>{pctDelta(data.metrics.investment.current ?? 0, data.metrics.investment.previous ?? 0).label}</span>
          </div>
          <div className="rv-metric">
            <small>Alcance</small>
            <span className="num">{fmtNum(data.metrics.reach.current)}</span>
            <span>{pctDelta(data.metrics.reach.current ?? 0, data.metrics.reach.previous ?? 0).label}</span>
          </div>
          <div className="rv-metric">
            <small>{resultLabel}</small>
            <span className="num">{fmtNum(data.metrics.conversions.current)}</span>
            <span>{pctDelta(data.metrics.conversions.current ?? 0, data.metrics.conversions.previous ?? 0).label}</span>
          </div>
          <div className="rv-metric">
            <small>Custo/{resultLabel.toLowerCase()}</small>
            <span className="num">{fmtBRL(data.metrics.costPerConversion.current)}</span>
            <span>{pctDelta(data.metrics.costPerConversion.current ?? 0, data.metrics.costPerConversion.previous ?? 0).label}</span>
          </div>
        </div>

        <div className="rv-card">
          <h3>Comparativo semanal</h3>
          <div className="rv-tabs">
            {METRIC_TABS.map((t) => (
              <button key={t.key} className={`rv-tab ${metric === t.key ? "active" : ""}`} onClick={() => setMetric(t.key)}>
                {t.label}
              </button>
            ))}
          </div>
          {chart && (
            <>
              <svg viewBox={`0 0 ${chart.w} ${chart.h}`} width="100%">
                <path d={chart.area} fill="rgba(23,63,59,.12)" />
                <path d={chart.line} fill="none" stroke="#173f3b" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
                {chart.pts.map((p, i) => (
                  <circle key={i} cx={p[0]} cy={p[1]} r={i === chart.pts.length - 1 ? 6 : 4}
                    fill={i === chart.pts.length - 1 ? "#f4368c" : "#173f3b"} stroke="#fffdfa" strokeWidth={2.5} />
                ))}
              </svg>
              <div className="rv-axis">
                {chart.weeks.map((w) => <span key={w}>{w}</span>)}
              </div>
            </>
          )}
        </div>

        <div className="rv-card">
          <h3>Criativos em destaque</h3>
          <div className="rv-creative-grid">
            {data.creatives?.map((c: any) => (
              <div key={c.adId} className="rv-creative-card">
                <div className="rv-thumb" style={c.thumbnailUrl ? { backgroundImage: `url(${c.thumbnailUrl})` } : undefined} />
                <div className="rv-creative-info">
                  <p className="fmt">{c.adName}</p>
                  <div className="rv-stat"><span>CTR</span><span>{c.ctr?.toFixed(2)}%</span></div>
                  <div className="rv-stat"><span>Custo/resultado</span><span>{fmtBRL(c.costPerResult)}</span></div>
                  <span className={`rv-pill ${c.status}`}>
                    {c.status === "good" ? "Performando bem" : c.status === "warn" ? "Atenção" : "Estável"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rv-card">
          <h3>Públicos testados</h3>
          {data.audiences?.map((a: any) => (
            <div key={a.adsetId} className="rv-audience-row">
              <div>
                <span className="name">{a.adsetName}</span>
                <span className={`rv-pill ${a.status}`}>
                  {a.status === "good" ? "Performando bem" : a.status === "warn" ? "Atenção" : "Estável"}
                </span>
              </div>
              <div className="rv-nums">
                <span>CTR<b>{a.ctr?.toFixed(2)}%</b></span>
                <span>Custo/resultado<b>{fmtBRL(a.costPerResult)}</b></span>
              </div>
            </div>
          ))}
        </div>

        {(narrative?.positivo || narrative?.atencao) && (
          <div className="rv-status-grid">
            {narrative?.positivo && (
              <div className="rv-status-card positivo">
                <h3>O que funcionou</h3>
                <p>{narrative.positivo}</p>
              </div>
            )}
            {narrative?.atencao && (
              <div className="rv-status-card atencao">
                <h3>O que pede atenção</h3>
                <p>{narrative.atencao}</p>
              </div>
            )}
          </div>
        )}

        {narrative?.proximosPassos && narrative.proximosPassos.length > 0 && (
          <div className="rv-card rv-next">
            <h3>Próximos passos</h3>
            <ol>
              {narrative.proximosPassos.map((step: string, i: number) => (
                <li key={i}><span className="dot" />{step}</li>
              ))}
            </ol>
          </div>
        )}
      </main>

      <footer className="rv-footer">
        <div className="rv-footer-inner">Relatório gerado automaticamente a partir dos dados da conta. Powered by SELVA Agency.</div>
      </footer>
    </div>
  );
}

/**
 * Relatório modular — vista pública.
 *
 * Formato próprio porque a promessa é outra: o relatório legado assume que
 * sempre há métricas de mídia e mostra números grandes. O modular pode ser só
 * técnico, só de mídia, ou parcial — e precisa dizer o que NÃO olhou.
 *
 * A seção "Pendências" não é rodapé burocrático: sem ela, um relatório magro
 * é indistinguível de um cliente saudável quando alguém reabre o link meses
 * depois. É o que separa "está tudo bem" de "ninguém mediu".
 */
function RelatorioModularView({ result }: {
  result: {
    period?: { start: string; end: string };
    narrative: {
      resumoExecutivo?: string;
      fatos?: string[];
      interpretacoes?: string[];
      hipoteses?: string[];
      recomendacoes?: { acao: string; porque: string; prioridade: string }[];
      pendencias?: string[];
    } | null;
    fontes?: { rotulo: string; presente: boolean; porque?: string }[] | null;
    data?: { account?: { name?: string } };
  };
}) {
  const n = result.narrative;
  const usadas = (result.fontes ?? []).filter((f) => f.presente);
  const faltando = (result.fontes ?? []).filter((f) => !f.presente);

  const Lista = ({ titulo, itens }: { titulo: string; itens?: string[] }) =>
    itens && itens.length > 0 ? (
      <section className="rv-card" style={{ marginTop: 16 }}>
        <h2 className="rv-h">{titulo}</h2>
        <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8 }}>
          {itens.map((x, i) => <li key={i}>{x}</li>)}
        </ul>
      </section>
    ) : null;

  return (
    <div className="report-view">
      <header className="rv-topbar">
        <div className="rv-topbar-inner">
          <div className="rv-brand"><div className="rv-mark">S</div><span>Selva Agency</span></div>
          <div className="rv-meta">
            <b>{result.data?.account?.name ?? ""}</b> · {result.period?.start} a {result.period?.end}
          </div>
        </div>
      </header>

      <main className="rv-main">
        <span className="rv-eyebrow">Relatório</span>
        <h1 className="rv-h1">Resumo do período</h1>
        {n?.resumoExecutivo && <p className="rv-lead">{n.resumoExecutivo}</p>}

        {usadas.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 12 }}>
            {usadas.map((f) => <span key={f.rotulo} className="rv-pill">{f.rotulo}</span>)}
          </div>
        )}

        <Lista titulo="Fatos" itens={n?.fatos} />
        <Lista titulo="O que os dados sugerem" itens={n?.interpretacoes} />
        <Lista titulo="Hipóteses a confirmar" itens={n?.hipoteses} />

        {n?.recomendacoes && n.recomendacoes.length > 0 && (
          <section className="rv-card" style={{ marginTop: 16 }}>
            <h2 className="rv-h">Recomendações</h2>
            <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8 }}>
              {n.recomendacoes.map((r, i) => (
                <li key={i}>
                  <b>[{r.prioridade}]</b> {r.acao}
                  {r.porque && <div style={{ opacity: 0.7, fontSize: "0.92em" }}>{r.porque}</div>}
                </li>
              ))}
            </ul>
          </section>
        )}

        {(n?.pendencias?.length || faltando.length > 0) && (
          <section className="rv-card" style={{ marginTop: 16 }}>
            <h2 className="rv-h">O que não foi medido</h2>
            <p style={{ opacity: 0.75, marginBottom: 8 }}>
              Os itens abaixo não entraram na análise. Ausência de dado não significa ausência de problema.
            </p>
            <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8 }}>
              {(n?.pendencias ?? []).map((x, i) => <li key={i}>{x}</li>)}
            </ul>
          </section>
        )}
      </main>

      <footer className="rv-footer">
        <div className="rv-footer-inner">Relatório gerado automaticamente a partir dos dados da conta. Powered by SELVA Agency.</div>
      </footer>
    </div>
  );
}
