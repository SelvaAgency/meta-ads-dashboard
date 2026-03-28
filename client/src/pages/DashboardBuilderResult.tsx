/**
 * DashboardBuilderResult.tsx — Exibe o relatório gerado pelo Dashboard Builder.
 * Módulo independente — não interfere com nenhuma funcionalidade existente.
 */
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft,
  ExternalLink,
  Download,
  Loader2,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
  Radio,
  PauseCircle,
} from "lucide-react";
import type { DashboardReportData, CampaignMetric, CampaignAnalysis } from "@shared/dashboardBuilderTypes";

// ─── Badge de status de veiculação ───────────────────────────────────────────

function DeliveryStatusBadge({ status }: { status: CampaignAnalysis["deliveryStatus"] }) {
  if (status === "active") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700 border border-green-200">
        <Radio size={10} className="shrink-0" />
        Ativa no período
      </span>
    );
  }
  if (status === "inactive") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-500 border border-slate-200">
        <PauseCircle size={10} className="shrink-0" />
        Inativa no período
      </span>
    );
  }
  return null;
}

// ─── Indicador de variação ────────────────────────────────────────────────────

function VariationBadge({ metric }: { metric: CampaignMetric }) {
  if (metric.changePercent === undefined || metric.changePercent === null) return null;
  const sign = metric.changePercent >= 0 ? "+" : "";
  const color =
    metric.indicatorColor === "green"
      ? "text-green-600 bg-green-50 border-green-200"
      : metric.indicatorColor === "red"
      ? "text-red-600 bg-red-50 border-red-200"
      : "text-gray-500 bg-gray-50 border-gray-200";
  const Icon =
    metric.indicatorColor === "green"
      ? TrendingUp
      : metric.indicatorColor === "red"
      ? TrendingDown
      : Minus;

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-semibold ${color}`}>
      <Icon size={11} />
      {sign}{metric.changePercent.toFixed(1)}%
    </span>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function DashboardBuilderResult() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const reportId = parseInt(params.id ?? "0", 10);

  const { data: dbReport, isLoading, error } = trpc.dashboardBuilder.getById.useQuery(
    { id: reportId },
    { enabled: reportId > 0 }
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={32} className="animate-spin text-primary" />
      </div>
    );
  }

  if (error || !dbReport) {
    return (
      <div className="p-6 flex flex-col items-center gap-4">
        <AlertTriangle size={40} className="text-destructive" />
        <p className="text-muted-foreground">Relatório não encontrado.</p>
        <Button variant="outline" onClick={() => navigate("/dashboard-builder")}>
          <ArrowLeft size={14} className="mr-2" /> Voltar
        </Button>
      </div>
    );
  }

  if (dbReport.status === "ERROR") {
    return (
      <div className="p-6 max-w-2xl mx-auto space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard-builder")}>
          <ArrowLeft size={14} className="mr-2" /> Voltar
        </Button>
        <div className="p-6 border border-destructive/30 rounded-lg bg-destructive/5">
          <h2 className="text-lg font-semibold text-destructive mb-2">Erro ao gerar relatório</h2>
          <p className="text-sm text-muted-foreground">{dbReport.errorMessage ?? "Erro desconhecido"}</p>
        </div>
      </div>
    );
  }

  const report: DashboardReportData | null = dbReport.reportJson
    ? JSON.parse(dbReport.reportJson)
    : null;

  if (!report) {
    return (
      <div className="p-6 flex flex-col items-center gap-4">
        <Loader2 size={32} className="animate-spin text-primary" />
        <p className="text-muted-foreground">Processando análise...</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard-builder")}>
          <ArrowLeft size={14} className="mr-2" /> Voltar
        </Button>
        <div className="flex items-center gap-2">
          {dbReport.pdfUrl && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(dbReport.pdfUrl!, "_blank")}
            >
              <ExternalLink size={14} className="mr-2" />
              Abrir HTML
            </Button>
          )}
          {dbReport.pdfUrl && (
            <Button
              size="sm"
              onClick={() => {
                const w = window.open(dbReport.pdfUrl!, "_blank");
                if (w) setTimeout(() => w.print(), 1200);
              }}
            >
              <Download size={14} className="mr-2" />
              Exportar PDF
            </Button>
          )}
        </div>
      </div>

      {/* Cabeçalho do relatório */}
      <div className="border-b pb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1">
              {report.platform}
            </p>
            <h1 className="text-3xl font-bold text-foreground">{report.clientName}</h1>
            <p className="text-muted-foreground mt-1">{report.period}</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <Badge variant={report.mode === "COMPARATIVE" ? "default" : "secondary"}>
              {report.mode === "COMPARATIVE" ? "Comparativo" : "Período Único"}
            </Badge>
            <p className="text-xs text-muted-foreground">
              Objetivos: {report.objectives.join(", ")}
            </p>
          </div>
        </div>

        {report.contextWarning && (
          <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
            ⚠️ {report.contextWarning}
          </div>
        )}
      </div>

      {/* Campanhas */}
      <div className="space-y-6">
        <h2 className="text-lg font-bold text-foreground">Análise por Campanha</h2>
        {report.campaigns.map((camp, idx) => (
          <div
            key={idx}
            className="border border-border rounded-xl overflow-hidden"
          >
            {/* Cabeçalho da campanha */}
            <div className="bg-muted/30 px-5 py-4 border-b border-border">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-foreground text-sm leading-tight mb-1.5">{camp.name}</h3>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">{camp.objective}</span>
                    <DeliveryStatusBadge status={camp.deliveryStatus ?? "unknown"} />
                  </div>
                </div>
                {camp.hasDataQualityWarning && (
                  <Badge variant="outline" className="text-amber-600 border-amber-300 text-xs shrink-0">
                    ⚠️ Dados imprecisos
                  </Badge>
                )}
              </div>
            </div>

            {/* Métricas */}
            <div className="p-5">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 pr-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Métrica
                      </th>
                      <th className="text-right py-2 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        {report.mode === "COMPARATIVE" ? "Atual" : "Valor"}
                      </th>
                      {report.mode === "COMPARATIVE" && (
                        <>
                          <th className="text-right py-2 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                            Anterior
                          </th>
                          <th className="text-right py-2 pl-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                            Variação
                          </th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {camp.metrics.map((m, mi) => (
                      <tr key={mi} className="border-b border-border/50 last:border-0">
                        <td className="py-2.5 pr-4 text-foreground">{m.name}</td>
                        <td className="py-2.5 px-4 text-right font-semibold text-foreground">
                          {m.currentValue}
                        </td>
                        {report.mode === "COMPARATIVE" && (
                          <>
                            <td className="py-2.5 px-4 text-right text-muted-foreground">
                              {m.previousValue ?? "—"}
                            </td>
                            <td className="py-2.5 pl-4 text-right">
                              <VariationBadge metric={m} />
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Análise */}
              <div className="mt-4 p-4 bg-blue-50/50 border-l-4 border-blue-400 rounded-r-lg">
                <p className="text-xs font-bold text-blue-700 uppercase tracking-wide mb-1.5">Análise</p>
                <p className="text-sm text-foreground leading-relaxed">{camp.analysis}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Alertas urgentes */}
      {report.urgentAlerts && report.urgentAlerts.length > 0 && (
        <div className="p-5 bg-red-50 border border-red-200 rounded-xl">
          <h2 className="text-base font-bold text-red-800 mb-3">⚠️ Alertas e Ações Urgentes</h2>
          <ul className="space-y-2">
            {report.urgentAlerts.map((a, i) => (
              <li key={i} className="text-sm text-red-700 flex items-start gap-2">
                <span className="shrink-0 mt-0.5">•</span>
                {a}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Resumo estratégico */}
      <div className="border border-border rounded-xl overflow-hidden">
        <div className="bg-muted/30 px-5 py-4 border-b border-border">
          <h2 className="text-base font-bold text-foreground">Resumo Estratégico</h2>
        </div>
        <div className="p-5 space-y-5">
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "Total Investido", value: report.strategicSummary.totalInvested },
              { label: "Total de Resultados", value: report.strategicSummary.totalResults },
              { label: "Custo Médio / Resultado", value: report.strategicSummary.avgCostPerResult },
            ].map((item) => (
              <div key={item.label} className="text-center p-4 bg-muted/30 rounded-lg">
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">{item.label}</p>
                <p className="text-xl font-bold text-foreground">{item.value}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div>
              <p className="text-xs font-bold text-green-600 uppercase tracking-wide mb-2">
                ✓ Destaques Positivos
              </p>
              <ul className="space-y-1.5">
                {report.strategicSummary.highlights.map((h, i) => (
                  <li key={i} className="text-sm text-foreground flex items-start gap-2">
                    <span className="shrink-0 text-green-500 mt-0.5">•</span>
                    {h}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs font-bold text-red-600 uppercase tracking-wide mb-2">
                ⚠ Pontos de Atenção
              </p>
              <ul className="space-y-1.5">
                {report.strategicSummary.attentionPoints.map((a, i) => (
                  <li key={i} className="text-sm text-foreground flex items-start gap-2">
                    <span className="shrink-0 text-red-500 mt-0.5">•</span>
                    {a}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {report.strategicSummary.contextNotes && (
            <div className="p-4 bg-blue-50/50 border-l-4 border-blue-400 rounded-r-lg">
              <p className="text-xs font-bold text-blue-700 uppercase tracking-wide mb-1">
                Contexto da Semana
              </p>
              <p className="text-sm text-foreground leading-relaxed">
                {report.strategicSummary.contextNotes}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Recomendações */}
      <div className="bg-slate-900 text-slate-100 rounded-xl p-6">
        <h2 className="text-base font-bold mb-4">Recomendações e Próximos Passos</h2>
        <ol className="space-y-3">
          {report.recommendations.map((r, i) => (
            <li key={i} className="flex items-start gap-3 text-sm text-slate-300 leading-relaxed">
              <span className="shrink-0 font-bold text-blue-400">{i + 1}.</span>
              {r}
            </li>
          ))}
        </ol>
      </div>

      <div className="text-center text-xs text-muted-foreground pb-4">
        Relatório gerado em{" "}
        {new Date(dbReport.createdAt).toLocaleDateString("pt-BR", {
          day: "2-digit",
          month: "long",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })}
      </div>
    </div>
  );
}
