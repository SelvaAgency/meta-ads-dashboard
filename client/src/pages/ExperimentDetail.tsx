import { useEffect, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { MetaDashboardLayout } from "@/components/MetaDashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  FlaskConical,
  Calendar,
  Banknote,
  ArrowLeft,
  CheckCircle2,
  CircleDashed,
  CirclePause,
  CirclePlay,
  Sparkles,
  Loader2,
  ChevronDown,
  ChevronUp,
  Check,
} from "lucide-react";
import { toast } from "sonner";

type ExpStatus = "planned" | "active" | "completed" | "paused";

const STATUS_META: Record<ExpStatus, { label: string; bg: string; color: string; icon: React.ElementType }> = {
  active:    { label: "Em andamento", bg: "#EAF3DE", color: "#3B6D11", icon: CirclePlay },
  planned:   { label: "Planejado",    bg: "#E6F1FB", color: "#185FA5", icon: CircleDashed },
  paused:    { label: "Pausado",      bg: "#FAEEDA", color: "#854F0B", icon: CirclePause },
  completed: { label: "Concluído",    bg: "#F1EFE8", color: "#444441", icon: CheckCircle2 },
};

// Semantic colors for both themes
const KPI_STATUS = {
  goal:    { bg: "#EAF3DE", color: "#3B6D11", label: "Meta" },
  signal:  { bg: "#FAEEDA", color: "#854F0B", label: "Sinal" },
  below:   { bg: "#FDECEA", color: "#9B1C1C", label: "Abaixo" },
  noData:  { bg: "", color: "", label: "—" },
};

const CHECKPOINT_STATUS = {
  pending: { label: "Pendente", color: "var(--color-muted-foreground)", dot: "var(--color-border)" },
  active:  { label: "Ativo",    color: "#854F0B",                       dot: "#854F0B" },
  done:    { label: "Concluído", color: "#3B6D11",                      dot: "#3B6D11" },
};

const METRIC_LABELS: Record<string, string> = {
  spend: "Investimento", conversions: "Conversões", cpa: "CPA", roas: "ROAS",
  ctr: "CTR", impressions: "Impressões", clicks: "Cliques", reach: "Alcance",
};

function fmtDate(d: string) {
  return new Date(d + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtValue(value: number | null | undefined, unit: string): string {
  if (value == null) return "—";
  if (unit === "R$") return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(value);
  if (unit === "%") return `${value.toFixed(2)}%`;
  if (unit === "x") return `${value.toFixed(2)}x`;
  return new Intl.NumberFormat("pt-BR").format(Math.round(value));
}

function kpiProgress(realValue: number | null, goal: string | number, minSignal: string | number | null) {
  if (realValue == null) return { pct: 0, barColor: "bg-muted", statusKey: "noData" as const };
  const g = Number(goal);
  const m = minSignal != null ? Number(minSignal) : null;
  const pct = Math.min(100, Math.round((realValue / g) * 100));
  if (realValue >= g) return { pct, barColor: "bg-emerald-600", statusKey: "goal" as const };
  if (m != null && realValue >= m) return { pct, barColor: "bg-amber-600", statusKey: "signal" as const };
  return { pct, barColor: "bg-red-600", statusKey: "below" as const };
}

export default function ExperimentDetail() {
  const [, navigate] = useLocation();
  const [match, params] = useRoute("/experiments/:id");
  const id = match ? Number(params!.id) : 0;

  const { data: exp, isLoading, refetch } = trpc.experiments.get.useQuery({ id }, { enabled: id > 0 });
  const analyzeMut = trpc.experiments.analyze.useMutation();
  const updateStatusMut = trpc.experiments.updateStatus.useMutation({ onSuccess: () => refetch() });
  const updateNoteMut = trpc.experiments.updateCheckpointNote.useMutation();

  const [analysis, setAnalysis] = useState<string | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [noteText, setNoteText] = useState("");
  const [decisionsOpen, setDecisionsOpen] = useState(false);

  useEffect(() => {
    if (exp && !analysis && !analysisLoading) {
      setAnalysisLoading(true);
      analyzeMut.mutate(
        { id },
        {
          onSuccess: (d) => { setAnalysis(d.analysis); setAnalysisLoading(false); },
          onError: () => setAnalysisLoading(false),
        }
      );
    }
  }, [exp?.id]);

  if (!match || id === 0) return null;

  if (isLoading) {
    return (
      <MetaDashboardLayout title="Experimento">
        <div className="flex items-center justify-center py-20 text-muted-foreground text-sm">Carregando...</div>
      </MetaDashboardLayout>
    );
  }

  if (!exp) {
    return (
      <MetaDashboardLayout title="Experimento">
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <p className="text-sm text-muted-foreground">Experimento não encontrado.</p>
          <Button variant="ghost" size="sm" onClick={() => navigate("/experiments")}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Voltar
          </Button>
        </div>
      </MetaDashboardLayout>
    );
  }

  const statusMeta = STATUS_META[exp.status as ExpStatus] ?? STATUS_META.planned;
  const StatusIcon = statusMeta.icon;
  const nextStatuses: ExpStatus[] = (["planned", "active", "paused", "completed"] as ExpStatus[]).filter(s => s !== exp.status);

  function saveNote(cpId: number) {
    updateNoteMut.mutate({ checkpointId: cpId, note: noteText }, {
      onSuccess: () => { toast.success("Nota salva."); setEditingNoteId(null); refetch(); },
      onError: (e) => toast.error(e.message),
    });
  }

  return (
    <MetaDashboardLayout title="Experimento">
      <div className="max-w-4xl mx-auto space-y-6">

        {/* ── Back + Header ──────────────────────────────────────────────────── */}
        <div className="flex items-start gap-4">
          <button
            onClick={() => navigate("/experiments")}
            className="mt-1 p-1.5 rounded-lg hover:bg-muted transition-all text-muted-foreground"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-bold text-foreground">{exp.title}</h1>
              <span
                className="text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1"
                style={{ background: statusMeta.bg, color: statusMeta.color }}
              >
                <StatusIcon className="w-3 h-3" />
                {statusMeta.label}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{exp.accountName}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {nextStatuses.slice(0, 2).map(s => (
              <Button
                key={s}
                variant="outline"
                size="sm"
                className="text-xs h-7 px-2"
                onClick={() => updateStatusMut.mutate({ id, status: s })}
                disabled={updateStatusMut.isPending}
              >
                {STATUS_META[s].label}
              </Button>
            ))}
          </div>
        </div>

        {/* ── 3 Info Cards ───────────────────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 mb-1 text-muted-foreground">
              <Calendar className="w-3.5 h-3.5" />
              <span className="text-xs font-medium">Período</span>
            </div>
            <p className="text-sm font-semibold text-foreground">{fmtDate(exp.startDate)}</p>
            <p className="text-xs text-muted-foreground">até {fmtDate(exp.endDate)}</p>
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 mb-1 text-muted-foreground">
              <Banknote className="w-3.5 h-3.5" />
              <span className="text-xs font-medium">Verba</span>
            </div>
            {exp.dailyBudget ? (
              <>
                <p className="text-sm font-semibold text-foreground">{fmtValue(Number(exp.dailyBudget), "R$")}/dia</p>
                {exp.totalBudget && <p className="text-xs text-muted-foreground">Total: {fmtValue(Number(exp.totalBudget), "R$")}</p>}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Não definida</p>
            )}
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 mb-1 text-muted-foreground">
              <FlaskConical className="w-3.5 h-3.5" />
              <span className="text-xs font-medium">Canais</span>
            </div>
            {exp.channels && exp.channels.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {exp.channels.map(ch => (
                  <span key={ch} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{ch}</span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">—</p>
            )}
          </div>
        </div>

        {/* ── Hypothesis block ───────────────────────────────────────────────── */}
        {(exp.centralQuestion || exp.hypothesis) && (
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            {exp.centralQuestion && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Pergunta central</p>
                <p className="text-sm text-foreground">{exp.centralQuestion}</p>
              </div>
            )}
            {exp.hypothesis && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Hipótese</p>
                <p className="text-sm text-foreground/80">{exp.hypothesis}</p>
              </div>
            )}
          </div>
        )}

        {/* ── KPI Table ──────────────────────────────────────────────────────── */}
        {exp.kpisWithValues && exp.kpisWithValues.length > 0 && (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">KPIs do Experimento</p>
            </div>
            <div className="divide-y divide-border">
              {exp.kpisWithValues.map((kpi: any) => {
                const { pct, barColor, statusKey } = kpiProgress(kpi.realValue, kpi.goal, kpi.minSignal);
                const kpiS = KPI_STATUS[statusKey];
                const metricLabel = METRIC_LABELS[kpi.metric] ?? kpi.metric;
                return (
                  <div key={kpi.id} className="px-4 py-3 flex items-center gap-4">
                    <div className="w-28 flex-shrink-0">
                      <p className="text-xs font-semibold text-foreground">{metricLabel}</p>
                      <p className="text-[10px] text-muted-foreground">Unidade: {kpi.unit}</p>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs text-muted-foreground">
                          Real: <span className="font-semibold text-foreground">{fmtValue(kpi.realValue, kpi.unit)}</span>
                        </span>
                        <span className="text-xs text-muted-foreground">
                          Meta: <span className="font-semibold text-foreground">{fmtValue(Number(kpi.goal), kpi.unit)}</span>
                          {kpi.minSignal && <span className="ml-2 text-[10px]">Sinal: {fmtValue(Number(kpi.minSignal), kpi.unit)}</span>}
                        </span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                    <div className="w-16 text-right flex-shrink-0">
                      {statusKey === "noData" ? (
                        <span className="text-[10px] text-muted-foreground">—</span>
                      ) : (
                        <span
                          className="text-[10px] font-bold px-2 py-0.5 rounded"
                          style={{ background: kpiS.bg, color: kpiS.color }}
                        >
                          {kpiS.label}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Checkpoint Timeline ─────────────────────────────────────────────── */}
        {exp.checkpoints.length > 0 && (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Checkpoints</p>
            </div>
            <div className="p-4 space-y-4">
              {exp.checkpoints.map((cp: any, i: number) => {
                const cMeta = CHECKPOINT_STATUS[cp.status as keyof typeof CHECKPOINT_STATUS] ?? CHECKPOINT_STATUS.pending;
                const isEditing = editingNoteId === cp.id;
                return (
                  <div key={cp.id} className="flex gap-3">
                    <div className="flex flex-col items-center flex-shrink-0">
                      <div
                        className="w-3 h-3 rounded-full mt-0.5 flex-shrink-0 border-2"
                        style={{ background: cMeta.dot, borderColor: cMeta.dot }}
                      />
                      {i < exp.checkpoints.length - 1 && (
                        <div className="w-px flex-1 mt-1 bg-border" style={{ minHeight: "24px" }} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0 pb-2">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="text-xs font-semibold text-foreground">{cp.title}</p>
                        <span className="text-[10px] font-medium" style={{ color: cMeta.color }}>{cMeta.label}</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground mb-1">{fmtDate(cp.date)}</p>

                      {cp.snapshotData && Object.keys(cp.snapshotData).length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-2">
                          {Object.entries(cp.snapshotData as Record<string, number>).slice(0, 4).map(([k, v]) => (
                            <span key={k} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                              {METRIC_LABELS[k] ?? k}: {fmtValue(v, k === "spend" || k === "cpa" ? "R$" : k === "ctr" ? "%" : k === "roas" ? "x" : "#")}
                            </span>
                          ))}
                        </div>
                      )}

                      {isEditing ? (
                        <div className="space-y-2">
                          <Textarea
                            value={noteText}
                            onChange={e => setNoteText(e.target.value)}
                            placeholder="Observações qualitativas deste checkpoint..."
                            rows={3}
                            className="text-xs"
                          />
                          <div className="flex gap-2">
                            <Button size="sm" className="h-7 text-xs gap-1" onClick={() => saveNote(cp.id)} disabled={updateNoteMut.isPending}>
                              <Check className="w-3 h-3" />Salvar
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingNoteId(null)}>Cancelar</Button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          {cp.qualitativeNote && <p className="text-xs text-muted-foreground mb-1 italic">{cp.qualitativeNote}</p>}
                          <button
                            onClick={() => { setEditingNoteId(cp.id); setNoteText(cp.qualitativeNote ?? ""); }}
                            className="text-[10px] text-muted-foreground hover:text-primary transition-colors"
                          >
                            {cp.qualitativeNote ? "Editar nota" : "Adicionar nota"}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Decision Tree ───────────────────────────────────────────────────── */}
        {exp.decisions.length > 0 && (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <button
              className="w-full px-4 py-3 border-b border-border flex items-center justify-between hover:bg-muted/50 transition-all"
              onClick={() => setDecisionsOpen(v => !v)}
            >
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Árvore de Decisão</p>
              {decisionsOpen ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
            </button>
            {decisionsOpen && (
              <div className="divide-y divide-border">
                {exp.decisions.map((dec: any) => (
                  <div
                    key={dec.id}
                    className="px-4 py-3"
                    style={dec.isCurrent
                      ? { background: "#FAEEDA", borderLeft: "3px solid #854F0B" }
                      : { borderLeft: "3px solid transparent" }
                    }
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-xs font-semibold text-foreground">{dec.scenario}</p>
                      {dec.isCurrent && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: "#FAEEDA", color: "#854F0B" }}>
                          Atual
                        </span>
                      )}
                    </div>
                    {dec.reading && <p className="text-xs text-muted-foreground mb-0.5">Leitura: {dec.reading}</p>}
                    {dec.nextStep && <p className="text-xs font-medium text-primary">→ {dec.nextStep}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── AI Analysis ──────────────────────────────────────────────────────── */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-primary" />
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Análise IA</p>
            </div>
            {!analysisLoading && analysis && (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 text-xs px-2"
                onClick={() => {
                  setAnalysis(null);
                  setAnalysisLoading(true);
                  analyzeMut.mutate({ id }, {
                    onSuccess: (d) => { setAnalysis(d.analysis); setAnalysisLoading(false); },
                    onError: () => setAnalysisLoading(false),
                  });
                }}
              >
                Reanalisar
              </Button>
            )}
          </div>
          <div className="p-4">
            {analysisLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground text-xs py-4">
                <Loader2 className="w-4 h-4 animate-spin" />
                Analisando experimento...
              </div>
            ) : analysis ? (
              <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{analysis}</p>
            ) : (
              <p className="text-xs text-muted-foreground">Análise não disponível.</p>
            )}
          </div>
        </div>

      </div>
    </MetaDashboardLayout>
  );
}
