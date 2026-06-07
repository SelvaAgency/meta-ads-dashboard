import { MetaDashboardLayout } from "@/components/MetaDashboardLayout";
import { useSelectedAccount } from "@/hooks/useSelectedAccount";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Brain,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  DollarSign,
  History,
  Lightbulb,
  Link2,
  RefreshCw,
  Target,
  Users,
  XCircle,
  Zap,
  Eye,
  AlertCircle,
  RotateCcw,
  ShieldCheck,
  TrendingUp,
  AlertTriangle,
  Info,
  BarChart2,
  Send,
} from "lucide-react";
import { useState } from "react";
import { PeriodFilter, usePeriodFilter } from "@/components/PeriodFilter";
import { toast } from "sonner";
import { useLocation } from "wouter";

const categoryConfig: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; color: string; description: string }> = {
  PAUSAR_CRIATIVO: { label: "Pausar Criativo", icon: XCircle, color: "text-red-400", description: "Criativo com performance abaixo da média do conjunto" },
  PAUSAR_CONJUNTO: { label: "Pausar Conjunto", icon: XCircle, color: "text-orange-400", description: "Conjunto com custo/resultado acima da média da campanha" },
  NOVO_PUBLICO: { label: "Novo Público", icon: Users, color: "text-purple-400", description: "Oportunidade de segmentação identificada nos dados" },
  REALOCAR_ORCAMENTO: { label: "Realocar Orçamento", icon: DollarSign, color: "text-blue-400", description: "Transferência de orçamento entre campanhas/conjuntos" },
  NOVO_CRIATIVO: { label: "Novo Criativo", icon: Lightbulb, color: "text-yellow-400", description: "Novo formato de criativo para conjunto específico" },
  NOVO_CONJUNTO: { label: "Novo Conjunto", icon: Target, color: "text-emerald-400", description: "Novo segmento de público dentro de campanha existente" },
  BUDGET: { label: "Orçamento", icon: DollarSign, color: "text-blue-400", description: "Ajuste de orçamento" },
  TARGETING: { label: "Segmentação", icon: Target, color: "text-purple-400", description: "Ajuste de segmentação" },
  CREATIVE: { label: "Criativo", icon: Lightbulb, color: "text-yellow-400", description: "Ajuste de criativo" },
  BIDDING: { label: "Lances", icon: DollarSign, color: "text-green-400", description: "Ajuste de lances" },
  SCHEDULE: { label: "Agendamento", icon: RefreshCw, color: "text-orange-400", description: "Ajuste de agendamento" },
  AUDIENCE: { label: "Público", icon: Users, color: "text-pink-400", description: "Ajuste de público" },
  GENERAL: { label: "Geral", icon: Brain, color: "text-primary", description: "Sugestão geral" },
};

const priorityConfig: Record<string, { label: string; badge: string; color: string; bgColor: string }> = {
  P1: { label: "P1 — Urgente", badge: "P1", color: "text-red-400 border-red-400/30", bgColor: "bg-red-400/5 border-red-400/20" },
  P2: { label: "P2 — Alto Impacto", badge: "P2", color: "text-orange-400 border-orange-400/30", bgColor: "bg-orange-400/5 border-orange-400/20" },
  P3: { label: "P3 — Oportunidade", badge: "P3", color: "text-blue-400 border-blue-400/30", bgColor: "bg-blue-400/5 border-blue-400/20" },
  HIGH: { label: "P1 — Urgente", badge: "P1", color: "text-red-400 border-red-400/30", bgColor: "bg-red-400/5 border-red-400/20" },
  CRITICAL: { label: "P1 — Urgente", badge: "P1", color: "text-red-400 border-red-400/30", bgColor: "bg-red-400/5 border-red-400/20" },
  MEDIUM: { label: "P2 — Alto Impacto", badge: "P2", color: "text-orange-400 border-orange-400/30", bgColor: "bg-orange-400/5 border-orange-400/20" },
  LOW: { label: "P3 — Oportunidade", badge: "P3", color: "text-blue-400 border-blue-400/30", bgColor: "bg-blue-400/5 border-blue-400/20" },
};

// ─── Account State Banner ─────────────────────────────────────────────────────
interface AccountStateResult {
  accountState?: string;
  healthSummary?: string;
  benchmarksUsed?: { ctrBenchmark: string; roasBenchmark: string; frequencyBenchmark: string };
  generated: number;
  skippedReason?: string;
}

function AccountStateBanner({ result }: { result: AccountStateResult }) {
  const [showBenchmarks, setShowBenchmarks] = useState(false);
  const state = result.accountState;
  if (!state) return null;

  const stateConfig = {
    ESTADO_A: {
      icon: ShieldCheck,
      color: "text-emerald-400",
      bgColor: "bg-emerald-400/5 border-emerald-400/20",
      badgeColor: "text-emerald-400 border-emerald-400/30 bg-emerald-400/10",
      label: "Conta Saudável",
      sublabel: "Nenhuma intervenção necessária no momento",
    },
    ESTADO_B: {
      icon: TrendingUp,
      color: "text-blue-400",
      bgColor: "bg-blue-400/5 border-blue-400/20",
      badgeColor: "text-blue-400 border-blue-400/30 bg-blue-400/10",
      label: "Oportunidades Pontuais",
      sublabel: "Performance geral positiva com pontos de melhoria identificados",
    },
    ESTADO_C: {
      icon: AlertTriangle,
      color: "text-orange-400",
      bgColor: "bg-orange-400/5 border-orange-400/20",
      badgeColor: "text-orange-400 border-orange-400/30 bg-orange-400/10",
      label: "Problemas Identificados",
      sublabel: "Ação recomendada para evitar desperdício de orçamento",
    },
  };

  const cfg = stateConfig[state as keyof typeof stateConfig];
  if (!cfg) return null;
  const Icon = cfg.icon;

  return (
    <div className={`rounded-xl border p-4 ${cfg.bgColor}`}>
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${cfg.bgColor}`}>
          <Icon className={`w-5 h-5 ${cfg.color}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <Badge variant="outline" className={`text-xs font-bold ${cfg.badgeColor}`}>
              {(typeof state === "string" ? state : "").replace("_", " ")}
            </Badge>
            <span className={`text-sm font-semibold ${cfg.color}`}>{cfg.label}</span>
          </div>
          <p className="text-xs text-muted-foreground mb-1">{cfg.sublabel}</p>
          {result.healthSummary && (
            <p className="text-xs text-foreground/80 leading-relaxed mt-2 p-2 rounded-lg bg-background/50">
              {typeof result.healthSummary === "string" ? result.healthSummary : JSON.stringify(result.healthSummary)}
            </p>
          )}
          {result.benchmarksUsed && (
            <div className="mt-2">
              <button
                className={`text-xs flex items-center gap-1 ${cfg.color} hover:opacity-80 transition-opacity`}
                onClick={() => setShowBenchmarks(!showBenchmarks)}
              >
                <BarChart2 className="w-3 h-3" />
                {showBenchmarks ? "Ocultar benchmarks" : "Ver benchmarks utilizados"}
                {showBenchmarks ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
              {showBenchmarks && (
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {[
                    { label: "CTR", value: String(result.benchmarksUsed.ctrBenchmark ?? "") },
                    { label: "ROAS", value: String(result.benchmarksUsed.roasBenchmark ?? "") },
                    { label: "Frequência", value: String(result.benchmarksUsed.frequencyBenchmark ?? "") },
                  ].map((b) => (
                    <div key={b.label} className="p-2 rounded-lg bg-background/50 text-center">
                      <p className="text-xs text-muted-foreground">{b.label}</p>
                      <p className={`text-xs font-semibold ${cfg.color}`}>{b.value}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function formatDate(d: Date | string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function daysLeft(d: Date | string | null | undefined) {
  if (!d) return null;
  const diff = Math.ceil((new Date(d).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  return diff > 0 ? diff : 0;
}

// ─── Rejection Dialog (inline) ───────────────────────────────────────────────
function RejectionForm({
  onConfirm,
  onCancel,
  isPending,
}: {
  onConfirm: (reason: string) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const [reason, setReason] = useState("");
  return (
    <div className="mt-3 p-3 rounded-lg bg-destructive/5 border border-destructive/20 space-y-2">
      <p className="text-xs font-medium text-destructive">Marcar como Não Aplicado</p>
      <Textarea
        placeholder="Motivo (opcional) — ex: já testamos isso, não se aplica ao nosso público..."
        className="text-xs min-h-[60px] resize-none"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="destructive"
          className="h-7 text-xs gap-1"
          onClick={() => onConfirm(reason)}
          disabled={isPending}
        >
          <XCircle className="w-3 h-3" />
          Confirmar
        </Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}

// ─── Unified Suggestion Card ─────────────────────────────────────────────────
function SuggestionCard({ s, onStatusChange }: {
  s: any;
  onStatusChange: (id: number, status: "applied" | "rejected" | "pending", reason?: string, monitorDays?: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [isPending, setIsPending] = useState(false);

  const cat = categoryConfig[s.category] ?? categoryConfig.GENERAL;
  const pri = priorityConfig[s.priority] ?? priorityConfig.P3;
  const CatIcon = cat.icon;
  const parsedActionItems: any[] = (() => {
    if (Array.isArray(s.actionItems)) return s.actionItems;
    if (typeof s.actionItems === "string" && s.actionItems.trim().startsWith("[")) {
      try { return JSON.parse(s.actionItems); } catch { return []; }
    }
    return [];
  })();
  const actionItems = parsedActionItems.map((a: any) => (typeof a === "string" ? a : JSON.stringify(a)));
  const expectedImpact = typeof s.expectedImpact === "string" ? s.expectedImpact.trim() : "";
  const isApplied = s.status === "applied";
  const isRejected = s.status === "rejected";
  const isMonitoring = isApplied && s.monitorUntil && daysLeft(s.monitorUntil)! > 0 && !s.monitorResult;
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [monitorDays, setMonitorDays] = useState(() => {
    const defaults: Record<string, number> = {
      PAUSAR_CRIATIVO: 3, PAUSAR_CONJUNTO: 5, REALOCAR_ORCAMENTO: 5,
      NOVO_PUBLICO: 14, NOVO_CRIATIVO: 7, NOVO_CONJUNTO: 14,
    };
    return defaults[s.category ?? ""] ?? 7;
  });
  const handleApply = () => setShowApplyModal(true);
  const confirmApply = () => {
    setShowApplyModal(false);
    setIsPending(true);
    onStatusChange(s.id, "applied", undefined, monitorDays);
    setTimeout(() => setIsPending(false), 1000);
  };

  const handleReject = (reason: string) => {
    setIsPending(true);
    setShowRejectForm(false);
    onStatusChange(s.id, "rejected", reason);
    setTimeout(() => setIsPending(false), 1000);
  };

  const handleRevert = () => {
    setIsPending(true);
    onStatusChange(s.id, "pending");
    setTimeout(() => setIsPending(false), 1000);
  };

  return (
    <Card className={`border-border hover:border-primary/30 transition-all ${
      isApplied ? "border-emerald-400/20" : isRejected ? "border-red-400/20" : pri.bgColor
    }`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
            isApplied ? "bg-emerald-400/10" : isRejected ? "bg-red-400/10" : "bg-accent/80"
          }`}>
            {isApplied ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            ) : isRejected ? (
              <XCircle className="w-4 h-4 text-red-400" />
            ) : (
              <CatIcon className={`w-4 h-4 ${cat.color}`} />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <Badge variant="outline" className={`text-xs font-bold ${pri.color}`}>
                {pri.badge}
              </Badge>
              <p className="text-sm font-semibold text-foreground">{s.title}</p>
              <Badge variant="outline" className={`text-xs ${cat.color}`}>
                {cat.label}
              </Badge>
              {isApplied && (
                <Badge variant="outline" className="text-xs text-emerald-400 border-emerald-400/30">
                  Aplicado
                </Badge>
              )}
              {isRejected && (
                <Badge variant="outline" className="text-xs text-red-400 border-red-400/30">
                  Não Aplicado
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">{s.description}</p>

            {/* Monitoring badge */}
            {isMonitoring && (
              <div className="mt-2 flex items-center gap-1.5 text-xs text-blue-400">
                <Eye className="w-3 h-3" />
                Monitorando por {daysLeft(s.monitorUntil)} dias ainda
              </div>
            )}

            {/* Monitor result */}
            {s.monitorResult && (
              <div className="mt-2 p-2 rounded-lg bg-blue-400/5 border border-blue-400/20">
                <p className="text-xs font-medium text-blue-400 mb-1">Resultado do Monitoramento (7 dias)</p>
                <p className="text-xs text-muted-foreground">{s.monitorResult}</p>
              </div>
            )}

            {/* Rejection reason */}
            {isRejected && s.rejectionReason && (
              <div className="mt-2 p-2 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Motivo: </span>
                  {s.rejectionReason}
                </p>
              </div>
            )}

            {expanded && (() => {
              console.log("[SuggestionCard] expanded id=%s expectedImpact=%o actionItems=%o", s.id, s.expectedImpact, s.actionItems);
              return (
                <div className="mt-3 space-y-3">
                  {expectedImpact && (
                    <div className="p-3 rounded-lg bg-emerald-400/5 border border-emerald-400/20">
                      <p className="text-xs font-medium text-emerald-400 mb-1">Impacto Esperado</p>
                      <p className="text-xs text-muted-foreground">{expectedImpact}</p>
                    </div>
                  )}
                  {actionItems.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-foreground mb-2">Ações para Aplicar Manualmente</p>
                      <ul className="space-y-1.5">
                        {actionItems.map((action: string, i: number) => (
                          <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                            <span className="w-4 h-4 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center flex-shrink-0 mt-0.5">
                              {i + 1}
                            </span>
                            {action}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {!expectedImpact && actionItems.length === 0 && (
                    <p className="text-xs text-muted-foreground italic">Nenhuma ação detalhada disponível para esta sugestão.</p>
                  )}
                </div>
              );
            })()}

            {/* Action buttons */}
            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/30 flex-wrap">
              {/* Applied: show as fixed/selected, not clickable */}
              {isApplied ? (
                <div className="h-7 gap-1.5 text-xs inline-flex items-center px-3 rounded-md bg-emerald-600/20 text-emerald-400 border border-emerald-400/30 cursor-default select-none">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Aplicado (em observação)
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1.5 text-xs text-emerald-400 border-emerald-400/30 hover:bg-emerald-400/10 hover:border-emerald-400/60"
                  onClick={handleApply}
                  disabled={isPending}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Marcar Aplicado
                </Button>
              )}

              {/* Rejected: show as fixed/selected, not clickable */}
              {isRejected ? (
                <div className="h-7 gap-1.5 text-xs inline-flex items-center px-3 rounded-md bg-red-600/20 text-red-400 border border-red-400/30 cursor-default select-none">
                  <XCircle className="w-3.5 h-3.5" />
                  Não Aplicado
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1.5 text-xs text-red-400 border-red-400/30 hover:bg-red-400/10 hover:border-red-400/60"
                  onClick={() => setShowRejectForm(!showRejectForm)}
                  disabled={isPending}
                >
                  <XCircle className="w-3.5 h-3.5" />
                  Não Aplicar
                </Button>
              )}

            {/* Modal de confirmação — monitorDays */}
            {showApplyModal && (
              <div style={{
                position: "fixed", inset: 0, zIndex: 50,
                background: "rgba(0,0,0,0.35)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <div style={{
                  background: "white", borderRadius: 14, padding: "24px 28px",
                  width: 360, boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
                }}>
                  <p style={{ fontSize: 14, fontWeight: 600, color: "#111", marginBottom: 6 }}>
                    Confirmar ação aplicada
                  </p>
                  <p style={{ fontSize: 12, color: "rgba(0,0,0,0.5)", marginBottom: 18, lineHeight: 1.5 }}>
                    Por quanto tempo a IA deve monitorar o resultado desta ação?
                  </p>
                  <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
                    {[3, 5, 7, 14].map(d => (
                      <button
                        key={d}
                        onClick={() => setMonitorDays(d)}
                        style={{
                          flex: 1, padding: "8px 0", borderRadius: 8, fontSize: 12, fontWeight: 600,
                          border: monitorDays === d ? "2px solid #E85BA8" : "1px solid rgba(0,0,0,0.12)",
                          background: monitorDays === d ? "rgba(232,91,168,0.08)" : "white",
                          color: monitorDays === d ? "#E85BA8" : "rgba(0,0,0,0.5)",
                          cursor: "pointer",
                        }}
                      >
                        {d}d
                      </button>
                    ))}
                  </div>
                  <p style={{ fontSize: 11, color: "rgba(0,0,0,0.35)", marginBottom: 20, lineHeight: 1.5 }}>
                    Após {monitorDays} dias, a IA analisa os resultados e registra um aprendizado automático para esta conta.
                  </p>
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button
                      onClick={() => setShowApplyModal(false)}
                      style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid rgba(0,0,0,0.12)", background: "white", fontSize: 12, cursor: "pointer", color: "rgba(0,0,0,0.5)" }}
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={confirmApply}
                      style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#E85BA8", color: "white", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                    >
                      Confirmar
                    </button>
                  </div>
                </div>
              </div>
            )}

              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 text-xs text-muted-foreground ml-auto"
                onClick={() => setExpanded(!expanded)}
              >
                {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                {expanded ? "Menos" : "Ver ações"}
              </Button>
            </div>

            {/* Date info */}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className="text-xs text-muted-foreground">
                <Clock className="w-3 h-3 inline mr-1" />
                {formatDate(s.generatedAt)}
                {s.expiresAt && ` · expira ${formatDate(s.expiresAt)}`}
              </span>
            </div>

            {showRejectForm && (
              <RejectionForm
                onConfirm={handleReject}
                onCancel={() => setShowRejectForm(false)}
                isPending={isPending}
              />
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
// ─── Chat Tab ─────────────────────────────────────────────────────────────────
function ChatTab({ accountId }: { accountId: number | null }) {
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useState<HTMLDivElement | null>(null);
  const { accounts } = useSelectedAccount();
  const { data: accountCtx } = trpc.context.getAccount.useQuery(
    { accountId: accountId! },
    { enabled: !!accountId, staleTime: 30_000 }
  );
  const { data: agencyCtx } = trpc.context.getAgency.useQuery(undefined, { staleTime: 60_000 });
  const account = accounts?.find((a: any) => a.id === accountId);

  async function sendMessage() {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: userMsg }]);
    setLoading(true);
    try {
      const contextBlocks = [
        agencyCtx?.benchmarks ? `BENCHMARKS DA AGÊNCIA:\n${agencyCtx.benchmarks}` : "",
        agencyCtx?.institutionalKnowledge ? `CONHECIMENTO INSTITUCIONAL:\n${agencyCtx.institutionalKnowledge}` : "",
        accountCtx?.clientProfile ? `PERFIL DO CLIENTE:\n${accountCtx.clientProfile}` : "",
        accountCtx?.operationalRules ? `REGRAS OPERACIONAIS:\n${accountCtx.operationalRules}` : "",
        accountCtx?.learnings ? `APRENDIZADOS HISTÓRICOS:\n${accountCtx.learnings}` : "",
      ].filter(Boolean).join("\n\n");

      const systemPrompt = `Você é um estrategista sênior de Meta Ads da SELVA Agency — uma boutique de branding e performance digital em São Paulo. Você tem acesso ao contexto completo desta conta e deve responder de forma direta, prática e acionável.${contextBlocks ? `\n\n${contextBlocks}` : ""}\n\nConta atual: ${account?.accountName ?? "não identificada"}`;

      const history = messages.map(m => ({ role: m.role, content: m.content }));

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: systemPrompt,
          messages: [...history, { role: "user", content: userMsg }],
        }),
      });
      const data = await response.json();
      const text = data.content?.find((c: any) => c.type === "text")?.text ?? "Erro ao processar resposta.";
      setMessages(prev => [...prev, { role: "assistant", content: text }]);
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Erro ao conectar com a IA. Tente novamente." }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0, border: "1px solid rgba(0,0,0,0.08)", borderRadius: 12, overflow: "hidden", background: "white" }}>
      {/* Messages */}
      <div style={{ flex: 1, minHeight: 320, maxHeight: 480, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
        {messages.length === 0 && (
          <div style={{ margin: "auto", textAlign: "center", padding: "32px 0" }}>
            <Brain style={{ width: 32, height: 32, color: "#E85BA8", margin: "0 auto 12px" }} />
            <p style={{ fontSize: 13, fontWeight: 500, color: "#111", marginBottom: 6 }}>Chat com a IA — {account?.accountName ?? "conta"}</p>
            <p style={{ fontSize: 12, color: "rgba(0,0,0,0.4)", maxWidth: 320, lineHeight: 1.5 }}>
              Pergunte sobre a conta, peça análises, explore hipóteses ou descreva uma demanda nova. A IA já conhece o contexto desta conta.
            </p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
            <div style={{
              maxWidth: "80%", padding: "10px 14px", borderRadius: m.role === "user" ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
              background: m.role === "user" ? "#E85BA8" : "rgba(0,0,0,0.04)",
              color: m.role === "user" ? "white" : "#111",
              fontSize: 13, lineHeight: 1.6,
            }}>
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: "flex", justifyContent: "flex-start" }}>
            <div style={{ padding: "10px 14px", borderRadius: "12px 12px 12px 2px", background: "rgba(0,0,0,0.04)", fontSize: 13, color: "rgba(0,0,0,0.4)" }}>
              Pensando...
            </div>
          </div>
        )}
      </div>
      {/* Input */}
      <div style={{ borderTop: "1px solid rgba(0,0,0,0.08)", padding: "12px 16px", display: "flex", gap: 8, alignItems: "flex-end", background: "rgba(0,0,0,0.01)" }}>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
          placeholder="Pergunte, peça uma análise ou descreva uma demanda nova... (Enter para enviar)"
          rows={2}
          style={{ flex: 1, fontSize: 13, lineHeight: 1.5, padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(0,0,0,0.12)", background: "white", resize: "none", fontFamily: "inherit", outline: "none", color: "#111" }}
          onFocus={e => e.currentTarget.style.borderColor = "rgba(232,91,168,0.5)"}
          onBlur={e => e.currentTarget.style.borderColor = "rgba(0,0,0,0.12)"}
        />
        <button
          onClick={sendMessage}
          disabled={loading || !input.trim()}
          style={{ padding: "10px 14px", borderRadius: 8, border: "none", background: "#E85BA8", color: "white", cursor: loading || !input.trim() ? "not-allowed" : "pointer", opacity: loading || !input.trim() ? 0.6 : 1, flexShrink: 0 }}
        >
          <Send style={{ width: 16, height: 16 }} />
        </button>
      </div>
    </div>
  );
}

export default function Suggestions() {
  const [, navigate] = useLocation();
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const { period, setPeriod, isInRange } = usePeriodFilter("30d");
  const { selectedAccountId, accounts } = useSelectedAccount();
  const utils = trpc.useUtils();

  const [lastAnalysis, setLastAnalysis] = useState<AccountStateResult | null>(null);
  const [activeTab, setActiveTab] = useState<"actions" | "experiments" | "chat" | "history">("actions");

  const { data: suggestions, isLoading } = trpc.suggestions.list.useQuery(
    { accountId: selectedAccountId! },
    { enabled: !!selectedAccountId }
  );

  const { data: history, isLoading: isLoadingHistory } = trpc.suggestions.history.useQuery(
    { accountId: selectedAccountId! },
    { enabled: !!selectedAccountId }
  );

  const generate = trpc.suggestions.generate.useMutation({
    onSuccess: (data) => {
      utils.suggestions.list.invalidate();
      utils.suggestions.history.invalidate();
      setLastAnalysis(data as AccountStateResult);

      if (data.skippedReason) {
        toast.warning(data.skippedReason, { duration: 6000 });
      } else {
        const state = (data as AccountStateResult).accountState;
        if (state === "ESTADO_A") {
          toast.success("Conta saudável! Nenhuma intervenção necessária no momento.", { duration: 5000 });
        } else if (state === "ESTADO_B") {
          toast.info(`${data.generated} oportunidade(s) pontual(is) identificada(s).`, { duration: 5000 });
        } else if (state === "ESTADO_C") {
          toast.warning(`${data.generated} problema(s) identificado(s) que requerem atenção.`, { duration: 5000 });
        } else if (data.generated === 0) {
          toast.info("Nenhuma sugestão nova foi gerada. Os dados podem não ter variações significativas no momento.");
        } else {
          toast.success(`${data.generated} sugestão(ões) gerada(s) com base nos dados reais das campanhas!`);
        }
      }
    },
    onError: () => toast.error("Erro ao analisar campanhas. Verifique se há dados sincronizados."),
  });

  const updateStatus = trpc.suggestions.updateStatus.useMutation({
    onSuccess: (_, vars) => {
      utils.suggestions.list.invalidate();
      utils.suggestions.history.invalidate();
      if (vars.status === "applied") {
        toast.success(`Marcado como Aplicado. Monitoraremos os resultados por ${vars.monitorDays ?? 7} dias.`);
      } else if (vars.status === "rejected") {
        toast.success("Marcado como Não Aplicado. O feedback será usado para melhorar futuras sugestões.");
      } else {
        toast.success("Status atualizado.");
      }
    },
    onError: () => toast.error("Erro ao atualizar status."),
  });

  const handleStatusChange = (id: number, status: "applied" | "rejected" | "pending", reason?: string, monitorDays?: number) => {
    updateStatus.mutate({ suggestionId: id, status, rejectionReason: reason, monitorDays });
  };

  const handleFilterClick = (key: string) => setActiveFilter((prev) => (prev === key ? null : key));

  if (!accounts || accounts.length === 0) {
    return (
      <MetaDashboardLayout title="Plano de Ação">
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
            <Link2 className="w-7 h-7 text-primary" />
          </div>
          <h2 className="text-xl font-semibold text-foreground mb-2">Nenhuma conta conectada</h2>
          <Button onClick={() => navigate("/connect")} className="gap-2 mt-2">
            <Zap className="w-4 h-4" />
            Conectar conta
          </Button>
        </div>
      </MetaDashboardLayout>
    );
  }

  const pending = suggestions ?? [];
  const hist = history ?? [];
  const allItems = [...pending, ...hist].filter((s) => isInRange(s.generatedAt));

  // Helper: check if an item should be in "history" based on status + time elapsed
  // Applied: goes to history after 7 days from appliedAt
  // Rejected: goes to history after 1 day from appliedAt (when status was changed)
  const now = Date.now();
  const isInHistory = (s: any) => {
    if (s.status === "applied" && s.appliedAt) {
      const elapsed = now - new Date(s.appliedAt).getTime();
      return elapsed > 7 * 24 * 60 * 60 * 1000; // >7 days
    }
    if (s.status === "rejected" && s.appliedAt) {
      const elapsed = now - new Date(s.appliedAt).getTime();
      return elapsed > 1 * 24 * 60 * 60 * 1000; // >1 day
    }
    return false;
  };

  // "Recent" applied/rejected = not yet moved to history
  const recentApplied = allItems.filter((s) => s.status === "applied" && !isInHistory(s));
  const recentRejected = allItems.filter((s) => s.status === "rejected" && !isInHistory(s));
  const historyItems = allItems.filter((s) => isInHistory(s) || (s.status !== "pending" && s.status !== "applied" && s.status !== "rejected"));
  // Also include items from the backend history that are old enough
  const fullHistory = [...historyItems, ...hist.filter((h) => !allItems.some((a) => a.id === h.id) || isInHistory(h))];
  // Deduplicate by id
  const historyDeduped = Array.from(new Map(fullHistory.map((s) => [s.id, s])).values());

  // Stats for filter cards
  const statsConfig = [
    { key: "high", label: "Alta Prioridade", value: allItems.filter((s) => s.priority === "HIGH" && !isInHistory(s)).length, color: "text-red-400", borderActive: "border-red-400 ring-1 ring-red-400/30 bg-red-400/5" },
    { key: "medium", label: "Média Prioridade", value: allItems.filter((s) => s.priority === "MEDIUM" && !isInHistory(s)).length, color: "text-orange-400", borderActive: "border-orange-400 ring-1 ring-orange-400/30 bg-orange-400/5" },
    { key: "low", label: "Baixa Prioridade", value: allItems.filter((s) => s.priority === "LOW" && !isInHistory(s)).length, color: "text-blue-400", borderActive: "border-blue-400 ring-1 ring-blue-400/30 bg-blue-400/5" },
    { key: "applied", label: "Aplicadas (Observação)", value: recentApplied.length, color: "text-emerald-400", borderActive: "border-emerald-400 ring-1 ring-emerald-400/30 bg-emerald-400/5" },
    { key: "rejected", label: "Não Aplicadas", value: recentRejected.length, color: "text-slate-400", borderActive: "border-slate-400 ring-1 ring-slate-400/30 bg-slate-400/5" },
    { key: "history", label: "Histórico", value: historyDeduped.length, color: "text-muted-foreground", borderActive: "border-primary ring-1 ring-primary/30 bg-primary/5" },
  ];

  // Filter logic
  const filteredItems = (() => {
    if (!activeFilter) return pending;
    switch (activeFilter) {
      case "high":
        return allItems.filter((s) => s.priority === "HIGH" && !isInHistory(s));
      case "medium":
        return allItems.filter((s) => s.priority === "MEDIUM" && !isInHistory(s));
      case "low":
        return allItems.filter((s) => s.priority === "LOW" && !isInHistory(s));
      case "applied":
        return recentApplied;
      case "rejected":
        return recentRejected;
      case "history":
        return historyDeduped;
      default:
        return pending;
    }
  })();

  const monitoring = allItems.filter((s) => s.status === "applied" && s.monitorUntil && daysLeft(s.monitorUntil)! > 0 && !s.monitorResult);

  return (
    <MetaDashboardLayout title="Plano de Ação">
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">Plano de Ação</h1>
            <p className="text-sm text-muted-foreground">
              A IA diagnostica a conta antes de gerar sugestões — intervenções apenas quando necessário
            </p>
            {(() => {
              const acct = accounts?.find((a: any) => a.id === selectedAccountId);
              return acct?.accountName ? (
                <p className="text-xs text-primary font-medium mt-0.5">Conta: {acct.accountName}</p>
              ) : null;
            })()}
          </div>
          <Button
            size="sm"
            className="gap-2"
            onClick={() => selectedAccountId && generate.mutate({ accountId: selectedAccountId })}
            disabled={generate.isPending || !selectedAccountId}
          >
            <Brain className={`w-3.5 h-3.5 ${generate.isPending ? "animate-pulse" : ""}`} />
            {generate.isPending ? "Diagnosticando..." : "Analisar Conta"}
          </Button>
        </div>

        {/* Abas */}
        <div style={{ display: "flex", gap: 4, borderBottom: "1px solid rgba(0,0,0,0.08)", marginBottom: -4 }}>
          {[
            { key: "actions", label: "Ações", count: pending.length },
            { key: "experiments", label: "Experimentos", count: null },
            { key: "chat", label: "Chat IA", count: null },
            { key: "history", label: "Histórico", count: historyDeduped.length || null },
          ].map(({ key, label, count }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key as any)}
              style={{
                padding: "8px 14px", fontSize: 13, fontWeight: 500,
                border: "none", borderBottom: activeTab === key ? "2px solid #E85BA8" : "2px solid transparent",
                background: "none", cursor: "pointer",
                color: activeTab === key ? "#E85BA8" : "rgba(0,0,0,0.45)",
                marginBottom: -1,
                display: "flex", alignItems: "center", gap: 6,
              }}
            >
              {label}
              {count != null && count > 0 && (
                <span style={{
                  fontSize: 10, fontWeight: 600,
                  padding: "1px 6px", borderRadius: 10,
                  background: activeTab === key ? "rgba(232,91,168,0.12)" : "rgba(0,0,0,0.06)",
                  color: activeTab === key ? "#E85BA8" : "rgba(0,0,0,0.4)",
                }}>
                  {count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Aba: Ações ── */}
        {activeTab === "actions" && (<>
        {/* Account State Banner */}
        {lastAnalysis && <AccountStateBanner result={lastAnalysis} />}

        {/* Filtro de período */}
        <PeriodFilter period={period} onChange={setPeriod} compact />

        {/* Info box */}
        {!lastAnalysis && pending.length === 0 && (
          <div className="flex items-start gap-3 p-4 rounded-xl bg-muted/40 border border-border">
            <Info className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-foreground mb-1">Como funciona o diagnóstico</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                A IA avalia o estado geral da conta antes de gerar qualquer sugestão. Se a conta estiver saudável (Estado A), nenhuma sugestão é criada — mexer em campanhas que estão funcionando pode prejudicar a performance. Sugestões são geradas apenas quando há problemas reais ou oportunidades claras identificadas nos dados.
              </p>
            </div>
          </div>
        )}

        {/* Stats Cards — Filter Toggle */}
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
          {statsConfig.map((stat) => (
            <Card
              key={stat.key}
              className={`cursor-pointer transition-all hover:border-primary/30 ${
                activeFilter === stat.key ? stat.borderActive : ""
              }`}
              onClick={() => handleFilterClick(stat.key)}
            >
              <CardContent className="p-4">
                <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Active filter indicator */}
        {activeFilter && (
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs gap-1">
              Filtro: {statsConfig.find((s) => s.key === activeFilter)?.label}
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs text-muted-foreground"
              onClick={() => setActiveFilter(null)}
            >
              Limpar filtro
            </Button>
          </div>
        )}

        {/* Monitoring alert */}
        {monitoring.length > 0 && (
          <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-400/5 border border-blue-400/20">
            <Eye className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-blue-400">
                {monitoring.length} sugestão(ões) em monitoramento
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Estamos acompanhando os resultados das modificações aplicadas. Você receberá um relatório após 7 dias.
              </p>
            </div>
          </div>
        )}

        {/* Suggestion List */}
        {isLoading || isLoadingHistory ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-24 bg-muted rounded-xl animate-pulse" />
            ))}
          </div>
        ) : filteredItems.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <Brain className="w-12 h-12 text-primary/30 mx-auto mb-4" />
              <p className="text-sm font-medium text-foreground mb-2">
                {activeFilter ? "Nenhuma sugestão neste filtro" : "Nenhuma sugestão pendente"}
              </p>
              <p className="text-xs text-muted-foreground mb-6 max-w-sm mx-auto">
                {activeFilter
                  ? "Tente outro filtro ou limpe o filtro atual para ver todas as sugestões."
                  : lastAnalysis?.accountState === "ESTADO_A"
                    ? "A conta está saudável. A IA não identificou problemas que justifiquem intervenção no momento."
                    : "Clique em \"Analisar Conta\" para que a IA examine os dados reais das suas campanhas e gere recomendações baseadas em evidências."}
              </p>
              {!activeFilter && !lastAnalysis && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/50 text-left max-w-sm mx-auto mb-6">
                  <AlertCircle className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-muted-foreground">
                    A análise só gera sugestões quando há dados reais de performance. Se a conta não tiver gasto registrado, a IA avisará que não há dados suficientes.
                  </p>
                </div>
              )}
              {!activeFilter && (
                <Button
                  size="sm"
                  onClick={() => selectedAccountId && generate.mutate({ accountId: selectedAccountId })}
                  disabled={generate.isPending}
                  className="gap-2"
                >
                  <Brain className="w-3.5 h-3.5" />
                  {generate.isPending ? "Diagnosticando..." : "Analisar Conta"}
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredItems.map((s) => (
              <SuggestionCard key={s.id} s={s} onStatusChange={handleStatusChange} />
            ))}
          </div>
        )}
        </>)}

        {/* ── Aba: Experimentos ── */}
        {activeTab === "experiments" && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
              <Brain className="w-6 h-6 text-primary" />
            </div>
            <p className="text-sm font-medium text-foreground mb-2">Experimentos da conta</p>
            <p className="text-xs text-muted-foreground mb-4 max-w-sm">
              Acompanhe os experimentos ativos e concluídos desta conta. Para criar ou gerenciar experimentos, acesse a página dedicada.
            </p>
            <Button size="sm" variant="outline" className="gap-2" onClick={() => navigate("/experiments")}>
              <Brain className="w-3.5 h-3.5" />
              Ir para Experimentos
            </Button>
          </div>
        )}

        {/* ── Aba: Chat IA ── */}
        {activeTab === "chat" && (
          <ChatTab accountId={selectedAccountId} />
        )}

        {/* ── Aba: Histórico ── */}
        {activeTab === "history" && (
          <div className="space-y-3">
            {historyDeduped.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <p className="text-sm text-muted-foreground">Nenhuma ação no histórico ainda.</p>
                </CardContent>
              </Card>
            ) : historyDeduped.map((s) => (
              <SuggestionCard key={s.id} s={s} onStatusChange={handleStatusChange} />
            ))}
          </div>
        )}

      </div>
    </MetaDashboardLayout>
  );
}
