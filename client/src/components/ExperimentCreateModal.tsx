import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useActiveAccount } from "@/contexts/ActiveAccountContext";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronLeft, ChevronRight, Plus, Trash2, Check } from "lucide-react";
import { toast } from "sonner";

interface KpiRow { metric: string; unit: string; minSignal: string; goal: string; }
interface CheckpointRow { date: string; title: string; }
interface DecisionRow { scenario: string; reading: string; nextStep: string; isCurrent: boolean; }

const METRIC_OPTIONS = [
  { value: "spend",       label: "Investimento",  unit: "R$" },
  { value: "conversions", label: "Conversões",    unit: "#"  },
  { value: "cpa",         label: "CPA",           unit: "R$" },
  { value: "roas",        label: "ROAS",          unit: "x"  },
  { value: "ctr",         label: "CTR",           unit: "%"  },
  { value: "impressions", label: "Impressões",    unit: "#"  },
  { value: "clicks",      label: "Cliques",       unit: "#"  },
  { value: "reach",       label: "Alcance",       unit: "#"  },
];

const CHANNEL_OPTIONS = ["Meta Ads", "Google Ads", "Instagram", "Facebook", "WhatsApp", "TikTok Ads"];

const STEPS = ["Conta & Período", "Pergunta & Hipótese", "KPIs", "Checkpoints", "Árvore de Decisão", "Campanhas"];

function StepDots({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-2 justify-center mb-6">
      {STEPS.map((label, i) => (
        <div key={i} className="flex items-center gap-1">
          <div
            className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all"
            style={
              i < current
                ? { background: "rgba(212,83,126,0.3)", color: "#D4537E" }
                : i === current
                ? { background: "#D4537E", color: "#fff" }
                : { background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.3)" }
            }
          >
            {i < current ? <Check className="w-3 h-3" /> : i + 1}
          </div>
          {i < STEPS.length - 1 && (
            <div className="w-6 h-px" style={{ background: i < current ? "rgba(212,83,126,0.4)" : "rgba(255,255,255,0.08)" }} />
          )}
        </div>
      ))}
    </div>
  );
}

export default function ExperimentCreateModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { clientAccounts } = useActiveAccount();
  const [step, setStep] = useState(0);

  // Step 1 state
  const [accountId, setAccountId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [dailyBudget, setDailyBudget] = useState("");
  const [channels, setChannels] = useState<string[]>([]);

  // Step 2 state
  const [centralQuestion, setCentralQuestion] = useState("");
  const [hypothesis, setHypothesis] = useState("");

  // Step 3 state
  const [kpis, setKpis] = useState<KpiRow[]>([{ metric: "conversions", unit: "#", minSignal: "", goal: "" }]);

  // Step 4 state
  const [checkpoints, setCheckpoints] = useState<CheckpointRow[]>([{ date: "", title: "Avaliação intermediária" }]);

  // Step 5 state
  const [decisions, setDecisions] = useState<DecisionRow[]>([
    { scenario: "Meta atingida", reading: "", nextStep: "", isCurrent: false },
    { scenario: "Abaixo do sinal mínimo", reading: "", nextStep: "", isCurrent: false },
  ]);

  // Step 6 state
  const [campaignIds, setCampaignIds] = useState<number[]>([]);
  const { data: campaigns = [] } = trpc.campaigns.list.useQuery(
    { accountId: accountId! },
    { enabled: !!accountId && step === 5 }
  );

  const createMut = trpc.experiments.create.useMutation({
    onSuccess: () => { toast.success("Experimento criado!"); onCreated(); },
    onError: (e) => toast.error(e.message),
  });

  function resetState() {
    setStep(0);
    setAccountId(null); setTitle(""); setStartDate(""); setEndDate("");
    setDailyBudget(""); setChannels([]);
    setCentralQuestion(""); setHypothesis("");
    setKpis([{ metric: "conversions", unit: "#", minSignal: "", goal: "" }]);
    setCheckpoints([{ date: "", title: "Avaliação intermediária" }]);
    setDecisions([
      { scenario: "Meta atingida", reading: "", nextStep: "", isCurrent: false },
      { scenario: "Abaixo do sinal mínimo", reading: "", nextStep: "", isCurrent: false },
    ]);
    setCampaignIds([]);
  }

  function handleClose() { resetState(); onClose(); }

  function canNext(): boolean {
    if (step === 0) return !!accountId && !!title && !!startDate && !!endDate;
    if (step === 2) return kpis.every(k => k.metric && k.goal);
    if (step === 3) return checkpoints.every(c => c.date && c.title);
    return true;
  }

  function handleSubmit() {
    if (!accountId) return;
    createMut.mutate({
      accountId,
      title,
      startDate,
      endDate,
      centralQuestion: centralQuestion || undefined,
      hypothesis: hypothesis || undefined,
      dailyBudget: dailyBudget ? Number(dailyBudget) : undefined,
      channels: channels.length > 0 ? channels : undefined,
      campaignIds: campaignIds.length > 0 ? campaignIds : undefined,
      status: "planned",
      kpis: kpis.map(k => ({
        metric: k.metric,
        unit: k.unit,
        minSignal: k.minSignal ? Number(k.minSignal) : undefined,
        goal: Number(k.goal),
      })),
      checkpoints: checkpoints.map(c => ({ date: c.date, title: c.title })),
      decisions: decisions.map(d => ({
        scenario: d.scenario,
        reading: d.reading || undefined,
        nextStep: d.nextStep || undefined,
        isCurrent: d.isCurrent,
      })),
    });
  }

  const allAccounts = clientAccounts.flatMap(ca => ca.accounts);

  return (
    <Dialog open={open} onOpenChange={v => !v && handleClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">Novo Experimento</DialogTitle>
        </DialogHeader>

        <StepDots current={step} />

        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-4">{STEPS[step]}</p>

        {/* ── Step 1: Conta & Período ─────────────────────────────────────────── */}
        {step === 0 && (
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Conta Meta Ads</label>
              <div className="flex flex-wrap gap-2">
                {allAccounts.map(a => (
                  <button
                    key={a.id}
                    onClick={() => setAccountId(a.id)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium border transition-all"
                    style={accountId === a.id
                      ? { borderColor: "#D4537E", background: "rgba(212,83,126,0.12)", color: "#D4537E" }
                      : { borderColor: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.5)" }
                    }
                  >
                    {a.accountName ?? a.accountId}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Título do experimento</label>
              <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex: Teste criativo vídeo vs imagem" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Início</label>
                <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Fim</label>
                <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Verba diária (R$) — opcional</label>
              <Input type="number" value={dailyBudget} onChange={e => setDailyBudget(e.target.value)} placeholder="Ex: 500" />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Canais</label>
              <div className="flex flex-wrap gap-2">
                {CHANNEL_OPTIONS.map(ch => {
                  const active = channels.includes(ch);
                  return (
                    <button
                      key={ch}
                      onClick={() => setChannels(prev => active ? prev.filter(c => c !== ch) : [...prev, ch])}
                      className="px-2.5 py-1 rounded-md text-xs border transition-all"
                      style={active
                        ? { borderColor: "#D4537E", background: "rgba(212,83,126,0.12)", color: "#D4537E" }
                        : { borderColor: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.4)" }
                      }
                    >
                      {ch}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── Step 2: Pergunta & Hipótese ─────────────────────────────────────── */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Pergunta central</label>
              <Textarea
                value={centralQuestion}
                onChange={e => setCentralQuestion(e.target.value)}
                placeholder="Ex: Vídeos curtos geram mais conversões do que imagens estáticas para esse público?"
                rows={3}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Hipótese</label>
              <Textarea
                value={hypothesis}
                onChange={e => setHypothesis(e.target.value)}
                placeholder="Ex: Acreditamos que vídeos de 15s terão CPA 20% menor porque o público demonstrou maior engajamento em posts de vídeo no mês passado."
                rows={4}
              />
            </div>
          </div>
        )}

        {/* ── Step 3: KPIs ────────────────────────────────────────────────────── */}
        {step === 2 && (
          <div className="space-y-3">
            {kpis.map((kpi, i) => (
              <div key={i} className="flex items-end gap-2 p-3 rounded-lg border border-border/60 bg-background/40">
                <div className="flex-1 min-w-0">
                  <label className="text-[10px] font-medium text-muted-foreground mb-1 block">Métrica</label>
                  <select
                    value={kpi.metric}
                    onChange={e => {
                      const opt = METRIC_OPTIONS.find(m => m.value === e.target.value);
                      setKpis(prev => prev.map((k, j) => j === i ? { ...k, metric: e.target.value, unit: opt?.unit ?? "#" } : k));
                    }}
                    className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground"
                  >
                    {METRIC_OPTIONS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
                <div className="w-20">
                  <label className="text-[10px] font-medium text-muted-foreground mb-1 block">Sinal min.</label>
                  <Input
                    type="number"
                    className="h-8 text-xs"
                    value={kpi.minSignal}
                    onChange={e => setKpis(prev => prev.map((k, j) => j === i ? { ...k, minSignal: e.target.value } : k))}
                    placeholder="—"
                  />
                </div>
                <div className="w-20">
                  <label className="text-[10px] font-medium text-muted-foreground mb-1 block">Meta *</label>
                  <Input
                    type="number"
                    className="h-8 text-xs"
                    value={kpi.goal}
                    onChange={e => setKpis(prev => prev.map((k, j) => j === i ? { ...k, goal: e.target.value } : k))}
                    placeholder="0"
                  />
                </div>
                <div className="w-10 text-center">
                  <label className="text-[10px] font-medium text-muted-foreground mb-1 block">Un.</label>
                  <span className="text-xs text-muted-foreground">{kpi.unit}</span>
                </div>
                {kpis.length > 1 && (
                  <button onClick={() => setKpis(prev => prev.filter((_, j) => j !== i))} className="mb-1 text-muted-foreground hover:text-destructive transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setKpis(prev => [...prev, { metric: "cpa", unit: "R$", minSignal: "", goal: "" }])}
            >
              <Plus className="w-3.5 h-3.5" />
              Adicionar KPI
            </Button>
          </div>
        )}

        {/* ── Step 4: Checkpoints ─────────────────────────────────────────────── */}
        {step === 3 && (
          <div className="space-y-3">
            {checkpoints.map((cp, i) => (
              <div key={i} className="flex items-end gap-2 p-3 rounded-lg border border-border/60 bg-background/40">
                <div className="w-36 flex-shrink-0">
                  <label className="text-[10px] font-medium text-muted-foreground mb-1 block">Data *</label>
                  <Input
                    type="date"
                    className="h-8 text-xs"
                    value={cp.date}
                    onChange={e => setCheckpoints(prev => prev.map((c, j) => j === i ? { ...c, date: e.target.value } : c))}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <label className="text-[10px] font-medium text-muted-foreground mb-1 block">Título *</label>
                  <Input
                    className="h-8 text-xs"
                    value={cp.title}
                    onChange={e => setCheckpoints(prev => prev.map((c, j) => j === i ? { ...c, title: e.target.value } : c))}
                    placeholder="Ex: Avaliação semana 1"
                  />
                </div>
                {checkpoints.length > 1 && (
                  <button onClick={() => setCheckpoints(prev => prev.filter((_, j) => j !== i))} className="mb-1 text-muted-foreground hover:text-destructive transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setCheckpoints(prev => [...prev, { date: "", title: "" }])}
            >
              <Plus className="w-3.5 h-3.5" />
              Adicionar checkpoint
            </Button>
          </div>
        )}

        {/* ── Step 5: Árvore de Decisão ────────────────────────────────────────── */}
        {step === 4 && (
          <div className="space-y-3">
            {decisions.map((dec, i) => (
              <div key={i} className="p-3 rounded-lg border border-border/60 bg-background/40 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Input
                    className="h-8 text-xs font-semibold flex-1"
                    value={dec.scenario}
                    onChange={e => setDecisions(prev => prev.map((d, j) => j === i ? { ...d, scenario: e.target.value } : d))}
                    placeholder="Cenário (ex: Meta atingida)"
                  />
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <Checkbox
                      checked={dec.isCurrent}
                      onCheckedChange={v => setDecisions(prev => prev.map((d, j) => j === i ? { ...d, isCurrent: !!v } : d))}
                    />
                    <span className="text-[10px] text-muted-foreground">Atual</span>
                  </div>
                  {decisions.length > 1 && (
                    <button onClick={() => setDecisions(prev => prev.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <Input
                  className="h-7 text-xs"
                  value={dec.reading}
                  onChange={e => setDecisions(prev => prev.map((d, j) => j === i ? { ...d, reading: e.target.value } : d))}
                  placeholder="Leitura do cenário..."
                />
                <Input
                  className="h-7 text-xs"
                  value={dec.nextStep}
                  onChange={e => setDecisions(prev => prev.map((d, j) => j === i ? { ...d, nextStep: e.target.value } : d))}
                  placeholder="Próximo passo..."
                />
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setDecisions(prev => [...prev, { scenario: "", reading: "", nextStep: "", isCurrent: false }])}
            >
              <Plus className="w-3.5 h-3.5" />
              Adicionar cenário
            </Button>
          </div>
        )}

        {/* ── Step 6: Campanhas Meta ──────────────────────────────────────────── */}
        {step === 5 && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Vincule as campanhas Meta Ads que fazem parte deste experimento para calcular métricas reais automaticamente.</p>
            {campaigns.length === 0 ? (
              <p className="text-xs text-muted-foreground italic py-4 text-center">Nenhuma campanha encontrada para esta conta.</p>
            ) : (
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {campaigns.map(c => {
                  const checked = campaignIds.includes(c.id);
                  return (
                    <div
                      key={c.id}
                      onClick={() => setCampaignIds(prev => checked ? prev.filter(id => id !== c.id) : [...prev, c.id])}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-all"
                      style={checked ? { background: "rgba(212,83,126,0.08)", borderLeft: "2px solid #D4537E" } : { borderLeft: "2px solid transparent" }}
                    >
                      <Checkbox checked={checked} className="pointer-events-none" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">{c.name}</p>
                        <p className="text-[10px] text-muted-foreground">{c.status}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {campaignIds.length > 0 && (
              <Badge variant="outline" className="text-xs">
                {campaignIds.length} campanha{campaignIds.length !== 1 ? "s" : ""} selecionada{campaignIds.length !== 1 ? "s" : ""}
              </Badge>
            )}
          </div>
        )}

        {/* ── Navigation ──────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between pt-4 border-t border-border/60 mt-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => step === 0 ? handleClose() : setStep(s => s - 1)}
          >
            {step === 0 ? "Cancelar" : <><ChevronLeft className="w-4 h-4 mr-1" />Voltar</>}
          </Button>
          {step < STEPS.length - 1 ? (
            <Button
              size="sm"
              className="gap-1"
              disabled={!canNext()}
              onClick={() => setStep(s => s + 1)}
            >
              Avançar <ChevronRight className="w-4 h-4" />
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={createMut.isPending}
              className="gap-1"
            >
              {createMut.isPending ? "Criando..." : "Criar Experimento"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
