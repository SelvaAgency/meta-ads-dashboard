import { MetaDashboardLayout } from "@/components/MetaDashboardLayout";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FlaskConical, Plus, Calendar, Banknote, CheckCircle2, CircleDashed, CirclePause, CirclePlay } from "lucide-react";
import { useState } from "react";
import ExperimentCreateModal from "@/components/ExperimentCreateModal";

const STATUS_ORDER = ["active", "planned", "paused", "completed"] as const;
type ExpStatus = (typeof STATUS_ORDER)[number];

const STATUS_META: Record<ExpStatus, { label: string; bg: string; color: string; icon: React.ElementType }> = {
  active:    { label: "Ativo",       bg: "rgba(16,185,129,0.12)",  color: "#34d399", icon: CirclePlay },
  planned:   { label: "Planejado",   bg: "rgba(99,102,241,0.12)",  color: "#818cf8", icon: CircleDashed },
  paused:    { label: "Pausado",     bg: "rgba(245,158,11,0.12)",  color: "#fbbf24", icon: CirclePause },
  completed: { label: "Concluído",   bg: "rgba(107,114,128,0.12)", color: "#9ca3af", icon: CheckCircle2 },
};

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

function fmtCurrency(v: string | number | null | undefined) {
  if (v == null) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(Number(v));
}

export default function Experiments() {
  const [, navigate] = useLocation();
  const [createOpen, setCreateOpen] = useState(false);
  const { data: experiments = [], isLoading, refetch } = trpc.experiments.list.useQuery();

  const sorted = [...experiments].sort((a, b) => {
    return STATUS_ORDER.indexOf(a.status as ExpStatus) - STATUS_ORDER.indexOf(b.status as ExpStatus);
  });

  const grouped: Record<string, typeof sorted> = {};
  for (const s of STATUS_ORDER) {
    grouped[s] = sorted.filter(e => e.status === s);
  }

  return (
    <MetaDashboardLayout title="Experimentos">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "rgba(212,83,126,0.15)" }}>
              <FlaskConical className="w-5 h-5" style={{ color: "#D4537E" }} />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground">Central de Experimentos</h1>
              <p className="text-xs text-muted-foreground">{experiments.length} experimento{experiments.length !== 1 ? "s" : ""} cadastrado{experiments.length !== 1 ? "s" : ""}</p>
            </div>
          </div>
          <Button onClick={() => setCreateOpen(true)} size="sm" className="gap-2">
            <Plus className="w-4 h-4" />
            Novo Experimento
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground text-sm">Carregando...</div>
        ) : experiments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: "rgba(212,83,126,0.08)" }}>
              <FlaskConical className="w-7 h-7" style={{ color: "#D4537E", opacity: 0.6 }} />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">Nenhum experimento ainda</p>
              <p className="text-xs text-muted-foreground mt-1">Crie seu primeiro experimento para começar a testar hipóteses com dados reais.</p>
            </div>
            <Button onClick={() => setCreateOpen(true)} size="sm" variant="outline" className="gap-2">
              <Plus className="w-4 h-4" />
              Criar experimento
            </Button>
          </div>
        ) : (
          STATUS_ORDER.filter(s => grouped[s].length > 0).map(status => {
            const meta = STATUS_META[status];
            const StatusIcon = meta.icon;
            return (
              <div key={status} className="space-y-3">
                <div className="flex items-center gap-2">
                  <StatusIcon className="w-3.5 h-3.5" style={{ color: meta.color }} />
                  <span className="text-xs font-bold uppercase tracking-wide" style={{ color: meta.color }}>
                    {meta.label} ({grouped[status].length})
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {grouped[status].map(exp => (
                    <div
                      key={exp.id}
                      onClick={() => navigate(`/experiments/${exp.id}`)}
                      className="rounded-xl border border-border/60 bg-card p-4 cursor-pointer hover:border-primary/30 hover:bg-primary/[0.03] transition-all group"
                    >
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">{exp.title}</p>
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">{exp.accountName ?? "—"}</p>
                        </div>
                        <Badge
                          variant="outline"
                          className="text-[10px] px-2 py-0.5 border-0 flex-shrink-0"
                          style={{ background: meta.bg, color: meta.color }}
                        >
                          {meta.label}
                        </Badge>
                      </div>

                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {fmtDate(exp.startDate)} – {fmtDate(exp.endDate)}
                        </span>
                        {exp.dailyBudget && (
                          <span className="flex items-center gap-1">
                            <Banknote className="w-3 h-3" />
                            {fmtCurrency(exp.dailyBudget)}/dia
                          </span>
                        )}
                      </div>

                      {exp.channels && exp.channels.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2.5">
                          {exp.channels.map(ch => (
                            <span key={ch} className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)" }}>
                              {ch}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>

      <ExperimentCreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => { setCreateOpen(false); refetch(); }}
      />
    </MetaDashboardLayout>
  );
}
