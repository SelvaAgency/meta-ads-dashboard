/**
 * DashboardBuilder.tsx — Módulo independente de geração de dashboards analíticos.
 * Não interfere com nenhuma funcionalidade existente da plataforma.
 *
 * Correções aplicadas:
 * - Sem redirect ao gerar: resultado exibido inline na mesma tela
 * - Campos de data com intervalo (início + fim), máscara fluida sem perda de foco
 * - Sem seleção rápida de período (Hoje/Ontem/Hoje e Ontem removidos)
 * - Validação de data no onBlur, não no onChange (evita perda de foco)
 */
import { useState, useRef, useCallback, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  LayoutDashboard,
  X,
  FileText,
  Clock,
  Trash2,
  Loader2,
  ImageIcon,
  ChevronRight,
  BarChart2,
  GitCompare,
  Calendar,
  CalendarDays,
  CheckCircle2,
  AlertCircle,
  Download,
  ExternalLink,
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  Minus,
  Radio,
  PauseCircle,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import type { DashboardReportData, CampaignMetric, CampaignAnalysis } from "@shared/dashboardBuilderTypes";

// ─── Upload de imagem para S3 ─────────────────────────────────────────────────

async function uploadImageToS3(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch("/api/dashboard-builder/upload", {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message ?? "Falha no upload da imagem");
  }
  const data = await res.json();
  return data.url as string;
}

// ─── Máscara de data dd/mm/aaaa ───────────────────────────────────────────────
// Aplica máscara sem causar re-render do componente pai (usa ref interno)

function applyDateMask(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function isValidDate(value: string): boolean {
  if (value.length !== 10) return false;
  const [d, m, y] = value.split("/").map(Number);
  if (!d || !m || !y) return false;
  if (m < 1 || m > 12) return false;
  if (d < 1 || d > 31) return false;
  if (y < 2020 || y > 2099) return false;
  return true;
}

// ─── Componente de campo de data (sem perda de foco) ─────────────────────────
// Usa estado interno para não causar re-render do pai a cada keystroke.
// Só chama onChange quando o usuário termina de digitar (onBlur) ou ao completar 10 chars.

function DateField({
  label,
  value,
  onChange,
  disabled,
  placeholder = "dd/mm/aaaa",
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
  required?: boolean;
}) {
  // Local state to avoid parent re-renders on every keystroke
  const [localValue, setLocalValue] = useState(value);
  const [touched, setTouched] = useState(false);

  // Sync from parent only when parent value changes externally (e.g., reset)
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const masked = applyDateMask(e.target.value);
    setLocalValue(masked);
    // Propagate immediately when complete
    if (masked.length === 10) {
      onChange(masked);
    }
  }, [onChange]);

  const handleBlur = useCallback(() => {
    setTouched(true);
    onChange(localValue);
  }, [localValue, onChange]);

  const isInvalid = touched && localValue.length > 0 && !isValidDate(localValue);

  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
        <Calendar size={12} />
        {label}
        {required && <span className="text-destructive">*</span>}
      </Label>
      <Input
        value={localValue}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder={placeholder}
        disabled={disabled}
        maxLength={10}
        className={`font-mono text-sm ${isInvalid ? "border-destructive" : ""}`}
        autoComplete="off"
      />
      {isInvalid && (
        <p className="text-xs text-destructive">Data inválida — use dd/mm/aaaa</p>
      )}
    </div>
  );
}

// ─── Componente de intervalo de datas ─────────────────────────────────────────

function DateRangeField({
  label,
  startValue,
  endValue,
  onStartChange,
  onEndChange,
  disabled,
  required,
  helperText,
}: {
  label: string;
  startValue: string;
  endValue: string;
  onStartChange: (v: string) => void;
  onEndChange: (v: string) => void;
  disabled?: boolean;
  required?: boolean;
  helperText?: string;
}) {
  // Validate: end must be >= start
  const rangeError = (() => {
    if (!startValue || !endValue) return null;
    if (!isValidDate(startValue) || !isValidDate(endValue)) return null;
    const [ds, ms, ys] = startValue.split("/").map(Number);
    const [de, me, ye] = endValue.split("/").map(Number);
    const start = new Date(ys, ms - 1, ds);
    const end = new Date(ye, me - 1, de);
    if (end < start) return "A data final deve ser igual ou posterior à data inicial";
    return null;
  })();

  return (
    <div className="space-y-2">
      <Label className="text-sm font-semibold flex items-center gap-1.5">
        <CalendarDays size={14} className="text-muted-foreground" />
        {label}
        {required && <span className="text-destructive">*</span>}
      </Label>
      {helperText && (
        <p className="text-xs text-muted-foreground">{helperText}</p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <DateField
          label="Data início"
          value={startValue}
          onChange={onStartChange}
          disabled={disabled}
          placeholder="dd/mm/aaaa"
        />
        <DateField
          label="Data fim"
          value={endValue}
          onChange={onEndChange}
          disabled={disabled}
          placeholder="dd/mm/aaaa"
        />
      </div>
      {rangeError && (
        <p className="text-xs text-destructive flex items-center gap-1">
          <AlertCircle size={12} />
          {rangeError}
        </p>
      )}
      {startValue && !endValue && (
        <p className="text-xs text-muted-foreground">
          Se deixar a data fim em branco, o período será de um dia só.
        </p>
      )}
    </div>
  );
}

// ─── Componente de upload de imagem ──────────────────────────────────────────

function ImageUploadSlot({
  label,
  sublabel,
  file,
  preview,
  onSelect,
  onRemove,
}: {
  label: string;
  sublabel: string;
  file: File | null;
  preview: string | null;
  onSelect: (f: File) => void;
  onRemove: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f && f.type.startsWith("image/")) onSelect(f);
  };

  return (
    <div className="flex flex-col gap-2">
      <Label className="text-sm font-semibold text-foreground">{label}</Label>
      <p className="text-xs text-muted-foreground -mt-1">{sublabel}</p>
      {preview ? (
        <div className="relative rounded-lg overflow-hidden border border-border bg-muted/30">
          <img src={preview} alt={label} className="w-full h-40 object-contain" />
          <button
            onClick={onRemove}
            className="absolute top-2 right-2 bg-background/90 rounded-full p-1 hover:bg-destructive hover:text-destructive-foreground transition-colors"
          >
            <X size={14} />
          </button>
          <div className="absolute bottom-0 left-0 right-0 bg-background/80 px-3 py-1.5">
            <p className="text-xs text-muted-foreground truncate">{file?.name}</p>
          </div>
        </div>
      ) : (
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => inputRef.current?.click()}
          className="border-2 border-dashed border-border rounded-lg h-40 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
        >
          <ImageIcon size={28} className="text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Arraste ou clique para selecionar</p>
          <p className="text-xs text-muted-foreground/60">PNG, JPG, WEBP</p>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onSelect(f);
        }}
      />
    </div>
  );
}

// ─── Inline Result Components (copiados de DashboardBuilderResult) ────────────

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

function InlineReportView({ dbReport, onNewDashboard }: {
  dbReport: { id: number; clientName: string; status: string; reportJson: string | null; pdfUrl: string | null; errorMessage: string | null; createdAt: Date };
  onNewDashboard: () => void;
}) {
  if (dbReport.status === "ERROR") {
    return (
      <div className="space-y-4">
        <div className="p-6 border border-destructive/30 rounded-lg bg-destructive/5">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle size={18} className="text-destructive" />
            <h2 className="text-base font-semibold text-destructive">Erro ao gerar relatório</h2>
          </div>
          <p className="text-sm text-muted-foreground">{dbReport.errorMessage ?? "Erro desconhecido"}</p>
        </div>
        <Button variant="outline" size="sm" onClick={onNewDashboard} className="gap-2">
          <RefreshCw size={14} />
          Tentar novamente
        </Button>
      </div>
    );
  }

  if (!dbReport.reportJson) {
    return (
      <div className="flex flex-col items-center gap-3 py-12">
        <Loader2 size={32} className="animate-spin text-primary" />
        <p className="text-muted-foreground text-sm">Processando análise...</p>
      </div>
    );
  }

  const report: DashboardReportData = JSON.parse(dbReport.reportJson);

  return (
    <div className="space-y-8">
      {/* Result header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CheckCircle2 size={18} className="text-emerald-500" />
          <span className="text-sm font-semibold text-emerald-500">Dashboard gerado com sucesso</span>
        </div>
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
          <Button variant="ghost" size="sm" onClick={onNewDashboard} className="gap-2">
            <ArrowLeft size={14} />
            Novo Dashboard
          </Button>
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
          <div key={idx} className="border border-border rounded-xl overflow-hidden">
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

            <div className="p-5">
              {camp.metrics.length > 0 && (
                <div className="mb-4 p-4 rounded-xl bg-primary/5 border border-primary/20">
                  <p className="text-xs font-bold text-primary uppercase tracking-widest mb-2">Métrica Principal</p>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-base font-bold text-foreground">{camp.metrics[0].name}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-2xl font-bold text-foreground">{camp.metrics[0].currentValue}</span>
                      {report.mode === "COMPARATIVE" && (
                        <>
                          {camp.metrics[0].previousValue && (
                            <span className="text-sm text-muted-foreground">ant. {camp.metrics[0].previousValue}</span>
                          )}
                          <VariationBadge metric={camp.metrics[0]} />
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {camp.metrics.length > 1 && (
                <div className="mb-4">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Métricas Fixas</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {camp.metrics.slice(1, 5).map((m, mi) => (
                      <div key={mi} className="p-3 rounded-lg bg-muted/30 border border-border/50">
                        <p className="text-xs text-muted-foreground mb-1">{m.name}</p>
                        <p className="text-sm font-bold text-foreground">{m.currentValue}</p>
                        {report.mode === "COMPARATIVE" && <div className="mt-1"><VariationBadge metric={m} /></div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {camp.metrics.length > 5 && (
                <div className="overflow-x-auto">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Demais Métricas</p>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-2 pr-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Métrica</th>
                        <th className="text-right py-2 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{report.mode === "COMPARATIVE" ? "Atual" : "Valor"}</th>
                        {report.mode === "COMPARATIVE" && (
                          <>
                            <th className="text-right py-2 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Anterior</th>
                            <th className="text-right py-2 pl-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Variação</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {camp.metrics.slice(5).map((m, mi) => (
                        <tr key={mi} className="border-b border-border/50 last:border-0">
                          <td className="py-2.5 pr-4 text-foreground">{m.name}</td>
                          <td className="py-2.5 px-4 text-right font-semibold text-foreground">{m.currentValue}</td>
                          {report.mode === "COMPARATIVE" && (
                            <>
                              <td className="py-2.5 px-4 text-right text-muted-foreground">{m.previousValue ?? "—"}</td>
                              <td className="py-2.5 pl-4 text-right"><VariationBadge metric={m} /></td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

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
                <span className="shrink-0 mt-0.5">•</span>{a}
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
              <p className="text-xs font-bold text-green-600 uppercase tracking-wide mb-2">✓ Destaques Positivos</p>
              <ul className="space-y-1.5">
                {report.strategicSummary.highlights.map((h, i) => (
                  <li key={i} className="text-sm text-foreground flex items-start gap-2">
                    <span className="shrink-0 text-green-500 mt-0.5">•</span>{h}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs font-bold text-red-600 uppercase tracking-wide mb-2">⚠ Pontos de Atenção</p>
              <ul className="space-y-1.5">
                {report.strategicSummary.attentionPoints.map((a, i) => (
                  <li key={i} className="text-sm text-foreground flex items-start gap-2">
                    <span className="shrink-0 text-red-500 mt-0.5">•</span>{a}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {report.strategicSummary.contextNotes && (
            <div className="p-4 bg-blue-50/50 border-l-4 border-blue-400 rounded-r-lg">
              <p className="text-xs font-bold text-blue-700 uppercase tracking-wide mb-1">Contexto da Semana</p>
              <p className="text-sm text-foreground leading-relaxed">{report.strategicSummary.contextNotes}</p>
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
              <span className="shrink-0 font-bold text-blue-400">{i + 1}.</span>{r}
            </li>
          ))}
        </ol>
      </div>

      <div className="text-center text-xs text-muted-foreground pb-4">
        Relatório gerado em{" "}
        {new Date(dbReport.createdAt).toLocaleDateString("pt-BR", {
          day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
        } as any)}
      </div>
    </div>
  );
}

// ─── Loading steps ────────────────────────────────────────────────────────────

const LOADING_STEPS = [
  "Enviando imagens...",
  "Analisando dados das campanhas...",
  "Gerando análise campanha a campanha...",
  "Montando o dashboard...",
  "Finalizando relatório...",
];

function GeneratingIndicator({ step }: { step: number }) {
  return (
    <div className="flex flex-col items-center gap-4 py-16">
      <div className="relative">
        <div className="w-16 h-16 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
        <LayoutDashboard size={20} className="text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
      </div>
      <div className="text-center space-y-1">
        <p className="text-sm font-semibold text-foreground">
          {LOADING_STEPS[Math.min(step, LOADING_STEPS.length - 1)]}
        </p>
        <p className="text-xs text-muted-foreground">
          A análise pode levar entre 30 segundos e 3 minutos
        </p>
      </div>
      {/* Progress dots */}
      <div className="flex gap-1.5">
        {LOADING_STEPS.map((_, i) => (
          <div
            key={i}
            className={`w-2 h-2 rounded-full transition-all duration-500 ${
              i <= step ? "bg-primary" : "bg-muted"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function DashboardBuilder() {
  const [mode, setMode] = useState<"SINGLE" | "COMPARATIVE">("SINGLE");
  const [clientName, setClientName] = useState("");
  const [weeklyContext, setWeeklyContext] = useState("");

  // Período — modo único (intervalo)
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");

  // Período — modo comparativo
  const [currentStart, setCurrentStart] = useState("");
  const [currentEnd, setCurrentEnd] = useState("");
  const [previousStart, setPreviousStart] = useState("");
  const [previousEnd, setPreviousEnd] = useState("");

  const [file1, setFile1] = useState<File | null>(null);
  const [preview1, setPreview1] = useState<string | null>(null);
  const [file2, setFile2] = useState<File | null>(null);
  const [preview2, setPreview2] = useState<string | null>(null);

  // Generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [generatedReportId, setGeneratedReportId] = useState<number | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [timeoutWarning, setTimeoutWarning] = useState(false);

  const utils = trpc.useUtils();

  const { data: reports, isLoading: loadingReports } = trpc.dashboardBuilder.list.useQuery();

  // Poll for the generated report when we have an ID and it's still processing
  const { data: generatedReport } = trpc.dashboardBuilder.getById.useQuery(
    { id: generatedReportId! },
    {
      enabled: !!generatedReportId,
      refetchInterval: (query) => {
        const data = query.state.data;
        if (!data) return 2000;
        if (data.status === "DONE" || data.status === "ERROR") return false;
        return 2000;
      },
    }
  );

  // Advance loading step while generating
  useEffect(() => {
    if (!isGenerating) return;
    const interval = setInterval(() => {
      setLoadingStep((s) => Math.min(s + 1, LOADING_STEPS.length - 1));
    }, 8000);
    return () => clearInterval(interval);
  }, [isGenerating]);

  // Timeout warning after 3 minutes
  useEffect(() => {
    if (!isGenerating) { setTimeoutWarning(false); return; }
    const t = setTimeout(() => setTimeoutWarning(true), 3 * 60 * 1000);
    return () => clearTimeout(t);
  }, [isGenerating]);

  // When report is done, stop generating state
  useEffect(() => {
    if (!generatedReport) return;
    if (generatedReport.status === "DONE" || generatedReport.status === "ERROR") {
      setIsGenerating(false);
      setLoadingStep(0);
      utils.dashboardBuilder.list.invalidate();
    }
  }, [generatedReport?.status]);

  const generateMutation = trpc.dashboardBuilder.generate.useMutation({
    onSuccess: (data) => {
      setGeneratedReportId(data.id);
      setLoadingStep(2); // advance to "Gerando análise..."
    },
    onError: (err) => {
      setGenerationError(err.message);
      setIsGenerating(false);
      setLoadingStep(0);
    },
  });

  const deleteMutation = trpc.dashboardBuilder.delete.useMutation({
    onSuccess: () => {
      utils.dashboardBuilder.list.invalidate();
      toast.success("Relatório excluído");
    },
  });

  const handleSelectFile1 = (f: File) => {
    setFile1(f);
    setPreview1(URL.createObjectURL(f));
  };
  const handleSelectFile2 = (f: File) => {
    setFile2(f);
    setPreview2(URL.createObjectURL(f));
  };

  // Build period string for LLM context
  const buildPeriodString = (): string => {
    if (mode === "SINGLE") {
      const start = periodStart || "(não informado)";
      const end = periodEnd || periodStart || "(não informado)";
      return `Período de análise: ${start} a ${end}`;
    }
    const cStart = currentStart || "(não informado)";
    const cEnd = currentEnd || currentStart || "(não informado)";
    const parts = [`Período atual: ${cStart} a ${cEnd}`];
    if (previousStart) {
      const pEnd = previousEnd || previousStart;
      parts.push(`Período anterior: ${previousStart} a ${pEnd}`);
    }
    return parts.join(" | ");
  };

  const validateDateRange = (start: string, end: string): boolean => {
    if (!start || !end) return true; // end is optional
    if (!isValidDate(start) || !isValidDate(end)) return false;
    const [ds, ms, ys] = start.split("/").map(Number);
    const [de, me, ye] = end.split("/").map(Number);
    return new Date(ye, me - 1, de) >= new Date(ys, ms - 1, ds);
  };

  const handleGenerate = async () => {
    if (!clientName.trim()) { toast.error("Informe o nome do cliente"); return; }
    if (!weeklyContext.trim()) { toast.error("Informe o contexto semanal"); return; }
    if (mode === "SINGLE" && !file1) { toast.error("Selecione ao menos 1 print de campanha"); return; }
    if (mode === "COMPARATIVE" && (!file1 || !file2)) { toast.error("No modo comparativo, selecione os 2 prints"); return; }

    // Validate period dates
    if (mode === "SINGLE") {
      if (periodStart && !isValidDate(periodStart)) { toast.error("Data de início inválida (dd/mm/aaaa)"); return; }
      if (periodEnd && !isValidDate(periodEnd)) { toast.error("Data de fim inválida (dd/mm/aaaa)"); return; }
      if (!validateDateRange(periodStart, periodEnd)) { toast.error("A data fim deve ser igual ou posterior à data início"); return; }
    } else {
      if (currentStart && !isValidDate(currentStart)) { toast.error("Data início do período atual inválida"); return; }
      if (currentEnd && !isValidDate(currentEnd)) { toast.error("Data fim do período atual inválida"); return; }
      if (!validateDateRange(currentStart, currentEnd)) { toast.error("Data fim do período atual deve ser posterior à data início"); return; }
      if (previousStart && !isValidDate(previousStart)) { toast.error("Data início do período anterior inválida"); return; }
      if (previousEnd && !isValidDate(previousEnd)) { toast.error("Data fim do período anterior inválida"); return; }
      if (!validateDateRange(previousStart, previousEnd)) { toast.error("Data fim do período anterior deve ser posterior à data início"); return; }
    }

    // Require at least start date
    if (mode === "SINGLE" && !periodStart) {
      toast.error("Informe ao menos a data de início do período");
      return;
    }
    if (mode === "COMPARATIVE" && !currentStart) {
      toast.error("Informe ao menos a data de início do período atual");
      return;
    }

    setIsGenerating(true);
    setGeneratedReportId(null);
    setGenerationError(null);
    setLoadingStep(0);
    setTimeoutWarning(false);

    try {
      const imageUrls: string[] = [];
      if (file1) {
        setLoadingStep(0);
        const url1 = await uploadImageToS3(file1);
        imageUrls.push(url1);
      }
      if (file2 && mode === "COMPARATIVE") {
        const url2 = await uploadImageToS3(file2);
        imageUrls.push(url2);
      }

      setLoadingStep(1);
      const periodString = buildPeriodString();
      const contextWithPeriod = `${periodString}\n\n${weeklyContext.trim()}`;

      await generateMutation.mutateAsync({
        clientName: clientName.trim(),
        weeklyContext: contextWithPeriod,
        mode,
        imageUrls,
      });
    } catch (err: any) {
      setGenerationError(err?.message ?? "Erro inesperado");
      setIsGenerating(false);
      setLoadingStep(0);
    }
  };

  const handleNewDashboard = () => {
    setGeneratedReportId(null);
    setGenerationError(null);
    // Preserve form data — only clear images
    setFile1(null);
    setPreview1(null);
    setFile2(null);
    setPreview2(null);
  };

  const contextWordCount = weeklyContext.trim().split(/\s+/).filter(Boolean).length;

  // Determine what to show in the main area
  const showResult = generatedReport && (generatedReport.status === "DONE" || generatedReport.status === "ERROR");
  const showGenerating = isGenerating || (generatedReportId && generatedReport && generatedReport.status === "PROCESSING");

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="p-3 rounded-xl bg-primary/10">
          <LayoutDashboard size={24} className="text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard Builder</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Gere dashboards analíticos profissionais a partir dos prints do gerenciador de anúncios
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        {/* ─── Formulário ─────────────────────────────────────────────────── */}
        <div className="lg:col-span-3 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Novo Dashboard</CardTitle>
              <CardDescription>Preencha os dados abaixo para gerar a análise</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Modo */}
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Modo de Operação</Label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    disabled={isGenerating}
                    onClick={() => { setMode("SINGLE"); setFile2(null); setPreview2(null); }}
                    className={`flex items-center gap-3 p-3 rounded-lg border-2 transition-all text-left ${
                      mode === "SINGLE" ? "border-primary bg-primary/5" : "border-border hover:border-border/80"
                    } ${isGenerating ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    <BarChart2 size={18} className={mode === "SINGLE" ? "text-primary" : "text-muted-foreground"} />
                    <div>
                      <p className={`text-sm font-medium ${mode === "SINGLE" ? "text-primary" : "text-foreground"}`}>Período Único</p>
                      <p className="text-xs text-muted-foreground">1 print, sem comparativo</p>
                    </div>
                  </button>
                  <button
                    type="button"
                    disabled={isGenerating}
                    onClick={() => setMode("COMPARATIVE")}
                    className={`flex items-center gap-3 p-3 rounded-lg border-2 transition-all text-left ${
                      mode === "COMPARATIVE" ? "border-primary bg-primary/5" : "border-border hover:border-border/80"
                    } ${isGenerating ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    <GitCompare size={18} className={mode === "COMPARATIVE" ? "text-primary" : "text-muted-foreground"} />
                    <div>
                      <p className={`text-sm font-medium ${mode === "COMPARATIVE" ? "text-primary" : "text-foreground"}`}>Comparativo</p>
                      <p className="text-xs text-muted-foreground">2 prints com variação %</p>
                    </div>
                  </button>
                </div>
              </div>

              <Separator />

              {/* Nome do cliente */}
              <div className="space-y-2">
                <Label htmlFor="clientName" className="text-sm font-semibold">
                  Nome do Cliente <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="clientName"
                  placeholder="Ex: Empresa XYZ"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  disabled={isGenerating}
                />
              </div>

              {/* Período — campos de intervalo */}
              {mode === "SINGLE" ? (
                <DateRangeField
                  label="Período do Relatório"
                  startValue={periodStart}
                  endValue={periodEnd}
                  onStartChange={setPeriodStart}
                  onEndChange={setPeriodEnd}
                  disabled={isGenerating}
                  required
                  helperText="Informe o intervalo de datas do período analisado. Se deixar a data fim em branco, será considerado um dia só."
                />
              ) : (
                <div className="space-y-4">
                  <DateRangeField
                    label="Período Atual (print 1)"
                    startValue={currentStart}
                    endValue={currentEnd}
                    onStartChange={setCurrentStart}
                    onEndChange={setCurrentEnd}
                    disabled={isGenerating}
                    required
                  />
                  <DateRangeField
                    label="Período Anterior (comparativo)"
                    startValue={previousStart}
                    endValue={previousEnd}
                    onStartChange={setPreviousStart}
                    onEndChange={setPreviousEnd}
                    disabled={isGenerating}
                    helperText="Informe o intervalo de datas do período anterior para comparação"
                  />
                </div>
              )}

              {/* Contexto semanal */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="context" className="text-sm font-semibold">
                    Contexto Semanal <span className="text-destructive">*</span>
                  </Label>
                  <span className={`text-xs ${contextWordCount < 20 ? "text-amber-500" : "text-muted-foreground"}`}>
                    {contextWordCount} palavras {contextWordCount < 20 && "— mínimo recomendado: 20"}
                  </span>
                </div>
                <Textarea
                  id="context"
                  placeholder="Descreva o que foi feito, alterado, testado, pausado ou lançado na semana. Quanto mais detalhado, mais precisa será a análise."
                  value={weeklyContext}
                  onChange={(e) => setWeeklyContext(e.target.value)}
                  rows={4}
                  disabled={isGenerating}
                  className="resize-none"
                />
                {contextWordCount < 20 && contextWordCount > 0 && (
                  <p className="text-xs text-amber-500">⚠️ Contexto reduzido. A análise pode ser mais superficial.</p>
                )}
              </div>

              <Separator />

              {/* Upload de imagens */}
              <div className="space-y-4">
                <Label className="text-sm font-semibold">
                  Print(s) do Gerenciador <span className="text-destructive">*</span>
                </Label>
                <div className={`grid gap-4 ${mode === "COMPARATIVE" ? "grid-cols-2" : "grid-cols-1"}`}>
                  <ImageUploadSlot
                    label={mode === "COMPARATIVE" ? "Print — Período Atual" : "Print das Campanhas"}
                    sublabel={mode === "COMPARATIVE" ? "Screenshot do período de referência" : "Screenshot do gerenciador de anúncios"}
                    file={file1}
                    preview={preview1}
                    onSelect={handleSelectFile1}
                    onRemove={() => { setFile1(null); setPreview1(null); }}
                  />
                  {mode === "COMPARATIVE" && (
                    <ImageUploadSlot
                      label="Print — Período Anterior"
                      sublabel="Para cálculo de variação %"
                      file={file2}
                      preview={preview2}
                      onSelect={handleSelectFile2}
                      onRemove={() => { setFile2(null); setPreview2(null); }}
                    />
                  )}
                </div>
              </div>

              {/* Botão gerar */}
              <Button
                onClick={handleGenerate}
                disabled={isGenerating}
                className="w-full"
                size="lg"
              >
                {isGenerating ? (
                  <>
                    <Loader2 size={16} className="animate-spin mr-2" />
                    Gerando dashboard...
                  </>
                ) : (
                  <>
                    <LayoutDashboard size={16} className="mr-2" />
                    Gerar Dashboard
                  </>
                )}
              </Button>

              {timeoutWarning && isGenerating && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <AlertCircle size={14} className="text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-500">
                    A geração está demorando mais que o esperado. Aguarde mais alguns instantes ou tente novamente.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ─── Área de resultado inline ─────────────────────────────────── */}
          {showGenerating && !showResult && (
            <Card>
              <CardContent className="p-6">
                <GeneratingIndicator step={loadingStep} />
              </CardContent>
            </Card>
          )}

          {generationError && !isGenerating && (
            <Card className="border-destructive/30">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle size={16} className="text-destructive shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-destructive mb-1">Erro ao gerar dashboard</p>
                    <p className="text-xs text-muted-foreground">{generationError}</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={handleGenerate} className="gap-1.5 shrink-0">
                    <RefreshCw size={12} />
                    Tentar novamente
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {showResult && generatedReport && (
            <Card>
              <CardContent className="p-6">
                <InlineReportView
                  dbReport={generatedReport as any}
                  onNewDashboard={handleNewDashboard}
                />
              </CardContent>
            </Card>
          )}
        </div>

        {/* ─── Histórico ──────────────────────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-foreground">Dashboards Gerados</h2>
            {reports && reports.length > 0 && (
              <Badge variant="secondary">{reports.length}</Badge>
            )}
          </div>

          {loadingReports ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 rounded-lg bg-muted/40 animate-pulse" />
              ))}
            </div>
          ) : !reports || reports.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-10 gap-3">
                <FileText size={32} className="text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground text-center">
                  Nenhum dashboard gerado ainda. Preencha o formulário e clique em Gerar.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {reports.map((r) => (
                <Card
                  key={r.id}
                  className="hover:border-primary/40 transition-colors cursor-pointer group"
                  onClick={() => {
                    if (r.status === "DONE") {
                      setGeneratedReportId(r.id);
                      setGenerationError(null);
                      setIsGenerating(false);
                      // Scroll to result
                      setTimeout(() => {
                        document.getElementById("result-area")?.scrollIntoView({ behavior: "smooth" });
                      }, 100);
                    }
                  }}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-sm font-semibold text-foreground truncate">{r.clientName}</p>
                          <Badge
                            variant={r.status === "DONE" ? "default" : r.status === "ERROR" ? "destructive" : "secondary"}
                            className="text-xs shrink-0"
                          >
                            {r.status === "DONE" ? "Pronto" : r.status === "ERROR" ? "Erro" : r.status === "PROCESSING" ? "Processando..." : "Pendente"}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock size={11} />
                            {new Date(r.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}
                          </span>
                          {r.platform && (
                            <span className="bg-muted px-1.5 py-0.5 rounded text-xs">{r.platform}</span>
                          )}
                          <span className="bg-muted px-1.5 py-0.5 rounded text-xs">
                            {r.mode === "COMPARATIVE" ? "Comparativo" : "Período Único"}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {r.status === "DONE" && (
                          <ChevronRight size={16} className="text-muted-foreground group-hover:text-primary transition-colors" />
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteMutation.mutate({ id: r.id });
                          }}
                          className="p-1 rounded hover:bg-destructive/10 hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    {r.status === "ERROR" && r.errorMessage && (
                      <p className="text-xs text-destructive mt-2 line-clamp-2">{r.errorMessage}</p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Anchor for scroll-to-result */}
      <div id="result-area" />
    </div>
  );
}
