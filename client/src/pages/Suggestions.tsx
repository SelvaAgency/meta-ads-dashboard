import { MetaDashboardLayout } from "@/components/MetaDashboardLayout";
import { useSelectedAccount } from "@/hooks/useSelectedAccount";
import { trpc } from "@/lib/trpc";
import {
  Brain, CheckCircle2, ChevronDown, ChevronUp, Clock, DollarSign,
  Lightbulb, Link2, RefreshCw, Target, Users, XCircle, Zap, Eye,
  AlertCircle, RotateCcw, ShieldCheck, TrendingUp, AlertTriangle,
  Info, BarChart2, Send, History, Filter,
} from "lucide-react";
import { useState } from "react";
import { PeriodFilter, usePeriodFilter } from "@/components/PeriodFilter";
import { toast } from "sonner";
import { useLocation } from "wouter";

// ─── Configs ──────────────────────────────────────────────────────────────────
const categoryConfig: Record<string, { label: string; color: string; bg: string }> = {
  PAUSAR_CRIATIVO:    { label: "Criativo",    color: "#E24B4A", bg: "rgba(226,75,74,0.08)" },
  PAUSAR_CONJUNTO:    { label: "Conjunto",    color: "#EF9F27", bg: "rgba(239,159,39,0.08)" },
  NOVO_PUBLICO:       { label: "Segmentação", color: "#8B5CF6", bg: "rgba(139,92,246,0.08)" },
  REALOCAR_ORCAMENTO: { label: "Orçamento",   color: "#378ADD", bg: "rgba(55,138,221,0.08)" },
  NOVO_CRIATIVO:      { label: "Criativo",    color: "#E85BA8", bg: "rgba(232,91,168,0.08)" },
  NOVO_CONJUNTO:      { label: "Conjunto",    color: "#1D9E75", bg: "rgba(29,158,117,0.08)" },
  GENERAL:            { label: "Geral",       color: "#888780", bg: "rgba(136,135,128,0.08)" },
};

const priorityConfig: Record<string, { label: string; color: string; border: string }> = {
  P1: { label: "P1", color: "#E24B4A", border: "#E24B4A" },
  P2: { label: "P2", color: "#EF9F27", border: "#EF9F27" },
  P3: { label: "P3", color: "#378ADD", border: "#378ADD" },
  HIGH: { label: "P1", color: "#E24B4A", border: "#E24B4A" },
  CRITICAL: { label: "P1", color: "#E24B4A", border: "#E24B4A" },
  MEDIUM: { label: "P2", color: "#EF9F27", border: "#EF9F27" },
  LOW: { label: "P3", color: "#378ADD", border: "#378ADD" },
};

interface AccountStateResult {
  accountState?: string;
  healthSummary?: string;
  benchmarksUsed?: { ctrBenchmark: string; roasBenchmark: string; frequencyBenchmark: string };
  generated: number;
  skippedReason?: string;
}

function formatDate(d: Date | string | null | undefined) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("pt-BR");
}

function daysLeft(d: Date | string | null | undefined) {
  if (!d) return null;
  const diff = new Date(d).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / 86400000));
}

// ─── Rejection Form ───────────────────────────────────────────────────────────
function RejectionForm({ onConfirm, onCancel }: { onConfirm: (r: string) => void; onCancel: () => void }) {
  const [reason, setReason] = useState("");
  return (
    <div style={{ marginTop: 12, padding: "12px 14px", borderRadius: 10, background: "rgba(226,75,74,0.04)", border: "1px solid rgba(226,75,74,0.15)" }}>
      <p style={{ fontSize: 12, fontWeight: 600, color: "#E24B4A", marginBottom: 8 }}>Marcar como Não Aplicado</p>
      <textarea
        value={reason}
        onChange={e => setReason(e.target.value)}
        placeholder="Motivo (opcional) — ex: já testamos isso, não se aplica ao nosso público..."
        rows={2}
        style={{ width: "100%", fontSize: 12, padding: "8px 10px", borderRadius: 8, border: "1px solid rgba(0,0,0,0.12)", background: "white", resize: "none", fontFamily: "inherit", outline: "none", marginBottom: 10 }}
      />
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => onConfirm(reason)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 8, border: "none", background: "#E24B4A", color: "white", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
          <XCircle style={{ width: 12, height: 12 }} /> Confirmar
        </button>
        <button onClick={onCancel} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid rgba(0,0,0,0.12)", background: "white", fontSize: 12, cursor: "pointer", color: "rgba(0,0,0,0.5)" }}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

// ─── Suggestion Card ──────────────────────────────────────────────────────────
function SuggestionCard({ s, onStatusChange }: {
  s: any;
  onStatusChange: (id: number, status: "applied" | "rejected" | "pending", reason?: string, monitorDays?: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [monitorDays, setMonitorDays] = useState(() => {
    const defaults: Record<string, number> = {
      PAUSAR_CRIATIVO: 3, PAUSAR_CONJUNTO: 5, REALOCAR_ORCAMENTO: 5,
      NOVO_PUBLICO: 14, NOVO_CRIATIVO: 7, NOVO_CONJUNTO: 14,
    };
    return defaults[s.category ?? ""] ?? 7;
  });

  const cat = categoryConfig[s.category] ?? categoryConfig.GENERAL;
  const pri = priorityConfig[s.priority] ?? priorityConfig.P3;
  const isApplied = s.status === "applied";
  const isRejected = s.status === "rejected";
  const isMonitoring = isApplied && s.monitorUntil && daysLeft(s.monitorUntil)! > 0 && !s.monitorResult;

  const parsedActionItems: any[] = (() => {
    if (!s.actionItems) return [];
    try { return Array.isArray(s.actionItems) ? s.actionItems : JSON.parse(s.actionItems); } catch { return []; }
  })();
  const actionItems = parsedActionItems.map((a: any) => (typeof a === "string" ? a : JSON.stringify(a)));
  const expectedImpact = typeof s.expectedImpact === "string" ? s.expectedImpact.trim() : "";

  const borderColor = isApplied ? "#1D9E75" : isRejected ? "rgba(0,0,0,0.1)" : pri.border;
  const opacity = isRejected ? 0.55 : 1;

  return (
    <div style={{
      border: "1px solid rgba(0,0,0,0.08)",
      borderLeft: `3px solid ${borderColor}`,
      borderRadius: "0 10px 10px 0",
      background: "white",
      padding: "14px 16px",
      opacity,
      transition: "opacity 0.2s",
    }}>
      {/* Top row */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        {/* Priority badge */}
        <span style={{
          fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4,
          background: `${pri.color}18`, color: pri.color, flexShrink: 0, marginTop: 1,
        }}>{pri.label}</span>

        {/* Title */}
        <p style={{ flex: 1, fontSize: 13, fontWeight: 500, color: "#111", lineHeight: 1.45, margin: 0 }}>
          {s.title}
        </p>

        {/* Category badge */}
        <span style={{
          fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 4,
          background: cat.bg, color: cat.color, flexShrink: 0,
        }}>{cat.label}</span>
      </div>

      {/* Description */}
      <p style={{ fontSize: 12, color: "rgba(0,0,0,0.5)", lineHeight: 1.55, margin: "8px 0 0 0" }}>
        {s.description}
      </p>

      {/* Expanded content */}
      {expanded && (
        <div style={{ marginTop: 12 }}>
          {expectedImpact && (
            <div style={{ padding: "10px 12px", borderRadius: 8, background: "rgba(29,158,117,0.05)", border: "1px solid rgba(29,158,117,0.15)", marginBottom: 12 }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: "#1D9E75", marginBottom: 4 }}>Impacto Esperado</p>
              <p style={{ fontSize: 12, color: "rgba(0,0,0,0.6)", lineHeight: 1.5, margin: 0 }}>{expectedImpact}</p>
            </div>
          )}
          {actionItems.length > 0 && (
            <div>
              <p style={{ fontSize: 11, fontWeight: 600, color: "#111", marginBottom: 8 }}>Ações para Aplicar Manualmente</p>
              <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
                {actionItems.map((item: string, i: number) => (
                  <li key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#E85BA8", flexShrink: 0, minWidth: 16 }}>{i + 1}</span>
                    <p style={{ fontSize: 12, color: "rgba(0,0,0,0.65)", lineHeight: 1.5, margin: 0 }}>{item}</p>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}

      {/* Monitoring progress */}
      {isMonitoring && (
        <div style={{ marginTop: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontSize: 11, color: "#1D9E75" }}>Monitorando resultado</span>
            <span style={{ fontSize: 11, color: "rgba(0,0,0,0.4)" }}>{daysLeft(s.monitorUntil)} dias restantes</span>
          </div>
          <div style={{ height: 3, background: "rgba(0,0,0,0.06)", borderRadius: 2 }}>
            <div style={{ height: "100%", background: "#1D9E75", borderRadius: 2, width: "60%" }} />
          </div>
        </div>
      )}

      {/* Footer */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
        {/* Action buttons */}
        {!isApplied && !isRejected && (
          <>
            <button
              onClick={() => setShowApplyModal(true)}
              disabled={isPending}
              style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 12px", borderRadius: 20, border: "1px solid rgba(29,158,117,0.4)", background: "rgba(29,158,117,0.06)", color: "#1D9E75", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
            >
              <CheckCircle2 style={{ width: 12, height: 12 }} /> Marcar Aplicado
            </button>
            <button
              onClick={() => setShowRejectForm(v => !v)}
              disabled={isPending}
              style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 12px", borderRadius: 20, border: "1px solid rgba(226,75,74,0.3)", background: "rgba(226,75,74,0.04)", color: "#E24B4A", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
            >
              <XCircle style={{ width: 12, height: 12 }} /> Não Aplicar
            </button>
          </>
        )}
        {isApplied && (
          <button
            onClick={() => { setIsPending(true); onStatusChange(s.id, "pending"); setTimeout(() => setIsPending(false), 1000); }}
            style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 12px", borderRadius: 20, border: "1px solid rgba(0,0,0,0.12)", background: "white", color: "rgba(0,0,0,0.4)", fontSize: 12, cursor: "pointer" }}
          >
            <RotateCcw style={{ width: 11, height: 11 }} /> Reverter
          </button>
        )}

        {/* Date */}
        <span style={{ fontSize: 11, color: "rgba(0,0,0,0.3)", marginLeft: "auto", display: "flex", alignItems: "center", gap: 4 }}>
          <Clock style={{ width: 10, height: 10 }} />
          {formatDate(s.generatedAt)}{s.expiresAt && ` · expira ${formatDate(s.expiresAt)}`}
        </span>

        {/* Expand toggle */}
        <button
          onClick={() => setExpanded(v => !v)}
          style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(0,0,0,0.35)", fontSize: 12, display: "flex", alignItems: "center", gap: 4, padding: "2px 4px" }}
        >
          {expanded ? <><ChevronUp style={{ width: 13, height: 13 }} /> Menos</> : <><ChevronDown style={{ width: 13, height: 13 }} /> Ver ações</>}
        </button>
      </div>

      {/* Rejection form */}
      {showRejectForm && (
        <RejectionForm
          onConfirm={(reason) => { setShowRejectForm(false); setIsPending(true); onStatusChange(s.id, "rejected", reason); setTimeout(() => setIsPending(false), 1000); }}
          onCancel={() => setShowRejectForm(false)}
        />
      )}

      {/* Apply modal */}
      {showApplyModal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "white", borderRadius: 14, padding: "24px 28px", width: 360 }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: "#111", marginBottom: 6 }}>Confirmar ação aplicada</p>
            <p style={{ fontSize: 12, color: "rgba(0,0,0,0.5)", marginBottom: 18, lineHeight: 1.5 }}>Por quanto tempo a IA deve monitorar o resultado?</p>
            <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
              {[3, 5, 7, 14].map(d => (
                <button key={d} onClick={() => setMonitorDays(d)} style={{ flex: 1, padding: "8px 0", borderRadius: 8, fontSize: 12, fontWeight: 600, border: monitorDays === d ? "2px solid #E85BA8" : "1px solid rgba(0,0,0,0.12)", background: monitorDays === d ? "rgba(232,91,168,0.08)" : "white", color: monitorDays === d ? "#E85BA8" : "rgba(0,0,0,0.5)", cursor: "pointer" }}>
                  {d}d
                </button>
              ))}
            </div>
            <p style={{ fontSize: 11, color: "rgba(0,0,0,0.35)", marginBottom: 20, lineHeight: 1.5 }}>Após {monitorDays} dias, a IA analisa os resultados e registra um aprendizado automático.</p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setShowApplyModal(false)} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid rgba(0,0,0,0.12)", background: "white", fontSize: 12, cursor: "pointer", color: "rgba(0,0,0,0.5)" }}>Cancelar</button>
              <button onClick={() => { setShowApplyModal(false); setIsPending(true); onStatusChange(s.id, "applied", undefined, monitorDays); setTimeout(() => setIsPending(false), 1000); }} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#E85BA8", color: "white", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Confirmar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Chat Tab ─────────────────────────────────────────────────────────────────
function ChatTab({ accountId }: { accountId: number | null }) {
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const { accounts } = useSelectedAccount();
  const { data: accountCtx } = trpc.context.getAccount.useQuery({ accountId: accountId! }, { enabled: !!accountId, staleTime: 30_000 });
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
      const systemPrompt = `Você é um estrategista sênior de Meta Ads da SELVA Agency. Responda de forma direta, prática e acionável.${contextBlocks ? `\n\n${contextBlocks}` : ""}\n\nConta atual: ${account?.accountName ?? "não identificada"}`;
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: systemPrompt,
          messages: [...messages.map(m => ({ role: m.role, content: m.content })), { role: "user", content: userMsg }],
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
    <div style={{ border: "1px solid rgba(0,0,0,0.08)", borderRadius: 12, overflow: "hidden", background: "white" }}>
      <div style={{ minHeight: 320, maxHeight: 480, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
        {messages.length === 0 && (
          <div style={{ margin: "auto", textAlign: "center", padding: "32px 0" }}>
            <Brain style={{ width: 32, height: 32, color: "#E85BA8", margin: "0 auto 12px" }} />
            <p style={{ fontSize: 13, fontWeight: 500, color: "#111", marginBottom: 6 }}>Chat com a IA — {account?.accountName ?? "conta"}</p>
            <p style={{ fontSize: 12, color: "rgba(0,0,0,0.4)", maxWidth: 320, lineHeight: 1.5 }}>Pergunte sobre a conta, peça análises, explore hipóteses ou descreva uma demanda nova. A IA já conhece o contexto desta conta.</p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
            <div style={{ maxWidth: "80%", padding: "10px 14px", borderRadius: m.role === "user" ? "12px 12px 2px 12px" : "12px 12px 12px 2px", background: m.role === "user" ? "#E85BA8" : "rgba(0,0,0,0.04)", color: m.role === "user" ? "white" : "#111", fontSize: 13, lineHeight: 1.6 }}>
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: "flex", justifyContent: "flex-start" }}>
            <div style={{ padding: "10px 14px", borderRadius: "12px 12px 12px 2px", background: "rgba(0,0,0,0.04)", fontSize: 13, color: "rgba(0,0,0,0.4)" }}>Pensando...</div>
          </div>
        )}
      </div>
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
        <button onClick={sendMessage} disabled={loading || !input.trim()} style={{ padding: "10px 14px", borderRadius: 8, border: "none", background: "#E85BA8", color: "white", cursor: loading || !input.trim() ? "not-allowed" : "pointer", opacity: loading || !input.trim() ? 0.6 : 1 }}>
          <Send style={{ width: 16, height: 16 }} />
        </button>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
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
  const { data: hist = [], isLoading: isLoadingHistory } = trpc.suggestions.history.useQuery(
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
        if (state === "ESTADO_A") toast.success("Conta saudável! Nenhuma intervenção necessária.", { duration: 5000 });
        else if (state === "ESTADO_B") toast.info(`${data.generated} oportunidade(s) identificada(s).`, { duration: 5000 });
        else if (state === "ESTADO_C") toast.warning(`${data.generated} problema(s) que requerem atenção.`, { duration: 5000 });
        else toast.success(`${data.generated} sugestão(ões) gerada(s)!`);
      }
    },
    onError: () => toast.error("Erro ao analisar campanhas."),
  });

  const updateStatus = trpc.suggestions.updateStatus.useMutation({
    onSuccess: (_, vars) => {
      utils.suggestions.list.invalidate();
      utils.suggestions.history.invalidate();
      if (vars.status === "applied") toast.success(`Marcado como Aplicado. Monitoraremos por ${vars.monitorDays ?? 7} dias.`);
      else if (vars.status === "rejected") toast.success("Marcado como Não Aplicado.");
      else toast.success("Status atualizado.");
    },
    onError: () => toast.error("Erro ao atualizar status."),
  });

  const handleStatusChange = (id: number, status: "applied" | "rejected" | "pending", reason?: string, monitorDays?: number) => {
    updateStatus.mutate({ suggestionId: id, status, rejectionReason: reason, monitorDays });
  };

  if (!accounts || accounts.length === 0) {
    return (
      <MetaDashboardLayout title="Plano de Ação">
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 240, textAlign: "center" }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: "rgba(232,91,168,0.1)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
            <Link2 style={{ width: 24, height: 24, color: "#E85BA8" }} />
          </div>
          <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Nenhuma conta conectada</p>
          <button onClick={() => navigate("/settings")} style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: "#E85BA8", color: "white", fontSize: 13, fontWeight: 600, cursor: "pointer", marginTop: 8 }}>
            Conectar conta
          </button>
        </div>
      </MetaDashboardLayout>
    );
  }

  const pending = (suggestions ?? []).filter((s: any) => s.status === "pending");
  const now = Date.now();
  const isInHistory = (s: any) => {
    if (s.status === "applied" && s.appliedAt) return (now - new Date(s.appliedAt).getTime()) > 7 * 86400000;
    if (s.status === "rejected" && s.appliedAt) return (now - new Date(s.appliedAt).getTime()) > 1 * 86400000;
    return false;
  };
  const recentApplied = (suggestions ?? []).filter((s: any) => s.status === "applied" && !isInHistory(s));
  const recentRejected = (suggestions ?? []).filter((s: any) => s.status === "rejected" && !isInHistory(s));
  const historyItems = [...(suggestions ?? []).filter(isInHistory), ...hist.filter((h: any) => !(suggestions ?? []).some((s: any) => s.id === h.id))];
  const historyDeduped = Array.from(new Map(historyItems.map((s: any) => [s.id, s])).values());
  const monitoring = (suggestions ?? []).filter((s: any) => s.status === "applied" && s.monitorUntil && daysLeft(s.monitorUntil)! > 0 && !s.monitorResult);
  const allItems = [...pending, ...recentApplied, ...recentRejected].filter((s: any) => isInRange(s.generatedAt));

  const p1 = pending.filter((s: any) => ["P1","HIGH","CRITICAL"].includes(s.priority));
  const p2 = pending.filter((s: any) => ["P2","MEDIUM"].includes(s.priority));
  const p3 = pending.filter((s: any) => ["P3","LOW"].includes(s.priority));

  const account = accounts?.find((a: any) => a.id === selectedAccountId);
  const aiColor = (account as any)?.aiStatusColor as "green" | "yellow" | "red" | null;
  const stateColors = { green: { color: "#1D9E75", label: "Saudável" }, yellow: { color: "#EF9F27", label: "Atenção" }, red: { color: "#E24B4A", label: "Crítico" } };
  const stateCfg = aiColor ? stateColors[aiColor] : null;

  const TABS = [
    { key: "actions", label: "Ações", count: pending.length },
    { key: "experiments", label: "Experimentos", count: null },
    { key: "chat", label: "Chat IA", count: null },
    { key: "history", label: "Histórico", count: historyDeduped.length || null },
  ];

  return (
    <MetaDashboardLayout title="Plano de Ação">
      <div style={{ display: "grid", gridTemplateColumns: "1fr 220px", gap: 20, alignItems: "start" }}>

        {/* ── Main column ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Header */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 700, color: "#111", marginBottom: 4 }}>Plano de Ação</h1>
              <p style={{ fontSize: 13, color: "rgba(0,0,0,0.45)", marginBottom: 2 }}>
                A IA diagnostica a conta antes de gerar sugestões — intervenções apenas quando necessário
              </p>
              {account?.accountName && (
                <p style={{ fontSize: 12, color: "#E85BA8", fontWeight: 500 }}>{account.accountName}</p>
              )}
            </div>
            <button
              onClick={() => selectedAccountId && generate.mutate({ accountId: selectedAccountId })}
              disabled={generate.isPending || !selectedAccountId}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 16px", borderRadius: 10, border: "none", background: "#E85BA8", color: "white", fontSize: 13, fontWeight: 600, cursor: generate.isPending ? "not-allowed" : "pointer", opacity: generate.isPending ? 0.75 : 1, flexShrink: 0 }}
            >
              <Brain style={{ width: 14, height: 14, animation: generate.isPending ? "spin 1s linear infinite" : undefined }} />
              {generate.isPending ? "Diagnosticando..." : "Analisar Conta"}
            </button>
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", gap: 2, borderBottom: "1px solid rgba(0,0,0,0.08)" }}>
            {TABS.map(({ key, label, count }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key as any)}
                style={{
                  padding: "9px 14px", fontSize: 13, fontWeight: 500,
                  border: "none", borderBottom: activeTab === key ? "2px solid #E85BA8" : "2px solid transparent",
                  background: "none", cursor: "pointer",
                  color: activeTab === key ? "#E85BA8" : "rgba(0,0,0,0.4)",
                  marginBottom: -1, display: "flex", alignItems: "center", gap: 6,
                }}
              >
                {label}
                {count != null && count > 0 && (
                  <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 10, background: activeTab === key ? "rgba(232,91,168,0.12)" : "rgba(0,0,0,0.06)", color: activeTab === key ? "#E85BA8" : "rgba(0,0,0,0.4)" }}>
                    {count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* ── Tab: Ações ── */}
          {activeTab === "actions" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

              {/* KPI row */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
                {[
                  { label: "Críticas", value: p1.length, color: "#E24B4A" },
                  { label: "Atenção", value: p2.length, color: "#EF9F27" },
                  { label: "Oportunidades", value: p3.length, color: "#378ADD" },
                  { label: "Monitorando", value: monitoring.length, color: "#1D9E75" },
                ].map(({ label, value, color }) => (
                  <div key={label} style={{ background: "white", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 10, padding: "12px 14px" }}>
                    <p style={{ fontSize: 22, fontWeight: 700, color, lineHeight: 1, marginBottom: 4 }}>{value}</p>
                    <p style={{ fontSize: 11, color: "rgba(0,0,0,0.4)", margin: 0 }}>{label}</p>
                  </div>
                ))}
              </div>

              {/* Period filter */}
              <PeriodFilter period={period} onChange={setPeriod} compact />

              {/* Monitoring alert */}
              {monitoring.length > 0 && (
                <div style={{ display: "flex", gap: 10, padding: "10px 14px", borderRadius: 10, background: "rgba(55,138,221,0.05)", border: "1px solid rgba(55,138,221,0.2)" }}>
                  <Eye style={{ width: 14, height: 14, color: "#378ADD", flexShrink: 0, marginTop: 1 }} />
                  <div>
                    <p style={{ fontSize: 12, fontWeight: 600, color: "#378ADD", marginBottom: 2 }}>{monitoring.length} sugestão(ões) em monitoramento</p>
                    <p style={{ fontSize: 11, color: "rgba(0,0,0,0.4)", margin: 0 }}>Acompanhando os resultados das modificações aplicadas.</p>
                  </div>
                </div>
              )}

              {/* P1 section */}
              {p1.length > 0 && (
                <div>
                  <p style={{ fontSize: 10, fontWeight: 700, color: "#E24B4A", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
                    Críticas — requerem ação imediata
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {p1.map((s: any) => <SuggestionCard key={s.id} s={s} onStatusChange={handleStatusChange} />)}
                  </div>
                </div>
              )}

              {/* P2 section */}
              {p2.length > 0 && (
                <div>
                  <p style={{ fontSize: 10, fontWeight: 700, color: "#EF9F27", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
                    Em atenção — monitorar nos próximos dias
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {p2.map((s: any) => <SuggestionCard key={s.id} s={s} onStatusChange={handleStatusChange} />)}
                  </div>
                </div>
              )}

              {/* P3 section */}
              {p3.length > 0 && (
                <div>
                  <p style={{ fontSize: 10, fontWeight: 700, color: "#378ADD", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
                    Oportunidades — crescimento
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {p3.map((s: any) => <SuggestionCard key={s.id} s={s} onStatusChange={handleStatusChange} />)}
                  </div>
                </div>
              )}

              {/* Applied */}
              {recentApplied.length > 0 && (
                <div>
                  <p style={{ fontSize: 10, fontWeight: 700, color: "#1D9E75", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
                    Aplicadas — em observação
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {recentApplied.map((s: any) => <SuggestionCard key={s.id} s={s} onStatusChange={handleStatusChange} />)}
                  </div>
                </div>
              )}

              {/* Empty state */}
              {pending.length === 0 && recentApplied.length === 0 && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "48px 0", textAlign: "center" }}>
                  <Brain style={{ width: 40, height: 40, color: "rgba(232,91,168,0.3)", marginBottom: 16 }} />
                  <p style={{ fontSize: 14, fontWeight: 500, color: "#111", marginBottom: 8 }}>Nenhuma ação pendente</p>
                  <p style={{ fontSize: 12, color: "rgba(0,0,0,0.4)", maxWidth: 340, lineHeight: 1.6, marginBottom: 20 }}>
                    {lastAnalysis?.accountState === "ESTADO_A"
                      ? "A conta está saudável. A IA não identificou problemas que justifiquem intervenção."
                      : "Clique em \"Analisar Conta\" para que a IA examine os dados e gere recomendações."}
                  </p>
                  <button
                    onClick={() => selectedAccountId && generate.mutate({ accountId: selectedAccountId })}
                    disabled={generate.isPending}
                    style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: "#E85BA8", color: "white", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
                  >
                    {generate.isPending ? "Diagnosticando..." : "Analisar Conta"}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Tab: Experimentos ── */}
          {activeTab === "experiments" && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "48px 0", textAlign: "center" }}>
              <div style={{ width: 52, height: 52, borderRadius: 14, background: "rgba(232,91,168,0.1)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
                <Brain style={{ width: 24, height: 24, color: "#E85BA8" }} />
              </div>
              <p style={{ fontSize: 14, fontWeight: 500, marginBottom: 8 }}>Experimentos da conta</p>
              <p style={{ fontSize: 12, color: "rgba(0,0,0,0.4)", maxWidth: 320, lineHeight: 1.6, marginBottom: 20 }}>
                Acompanhe os experimentos ativos e concluídos. Para criar ou gerenciar, acesse a página dedicada.
              </p>
              <button onClick={() => navigate("/experiments")} style={{ padding: "8px 20px", borderRadius: 8, border: "1px solid rgba(0,0,0,0.12)", background: "white", fontSize: 13, cursor: "pointer", color: "#111" }}>
                Ir para Experimentos
              </button>
            </div>
          )}

          {/* ── Tab: Chat IA ── */}
          {activeTab === "chat" && <ChatTab accountId={selectedAccountId} />}

          {/* ── Tab: Histórico ── */}
          {activeTab === "history" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {historyDeduped.length === 0 ? (
                <div style={{ padding: "48px 0", textAlign: "center" }}>
                  <p style={{ fontSize: 13, color: "rgba(0,0,0,0.4)" }}>Nenhuma ação no histórico ainda.</p>
                </div>
              ) : historyDeduped.map((s: any) => (
                <SuggestionCard key={s.id} s={s} onStatusChange={handleStatusChange} />
              ))}
            </div>
          )}

        </div>

        {/* ── Right panel ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14, position: "sticky", top: 20 }}>

          {/* Inteligência da conta */}
          {stateCfg && (
            <div style={{ background: "white", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 12, padding: "14px 16px" }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: "rgba(0,0,0,0.35)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>Inteligência da conta</p>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: stateCfg.color, flexShrink: 0 }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: stateCfg.color }}>{stateCfg.label}</span>
              </div>
              {(account as any)?.aiStatusSummary && (
                <p style={{ fontSize: 11, color: "rgba(0,0,0,0.5)", lineHeight: 1.6, margin: 0 }}>
                  {(account as any).aiStatusSummary.slice(0, 200)}
                </p>
              )}
            </div>
          )}

          {/* Resumo ações */}
          <div style={{ background: "white", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 12, padding: "14px 16px" }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: "rgba(0,0,0,0.35)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>Resumo</p>
            {[
              { label: "Críticas", value: p1.length, color: "#E24B4A" },
              { label: "Atenção", value: p2.length, color: "#EF9F27" },
              { label: "Oportunidades", value: p3.length, color: "#378ADD" },
              { label: "Monitorando", value: monitoring.length, color: "#1D9E75" },
              { label: "Histórico", value: historyDeduped.length, color: "rgba(0,0,0,0.3)" },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: "0.5px solid rgba(0,0,0,0.05)" }}>
                <span style={{ fontSize: 12, color: "rgba(0,0,0,0.5)" }}>{label}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color }}>{value}</span>
              </div>
            ))}
          </div>

          {/* Período */}
          <div style={{ background: "white", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 12, padding: "14px 16px" }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: "rgba(0,0,0,0.35)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>Análise IA</p>
            <button
              onClick={() => selectedAccountId && generate.mutate({ accountId: selectedAccountId })}
              disabled={generate.isPending || !selectedAccountId}
              style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "8px 0", borderRadius: 8, border: "none", background: "#E85BA8", color: "white", fontSize: 12, fontWeight: 600, cursor: generate.isPending ? "not-allowed" : "pointer", opacity: generate.isPending ? 0.75 : 1 }}
            >
              <Brain style={{ width: 13, height: 13, animation: generate.isPending ? "spin 1s linear infinite" : undefined }} />
              {generate.isPending ? "Analisando..." : "Analisar agora"}
            </button>
            {lastAnalysis?.healthSummary && (
              <p style={{ fontSize: 11, color: "rgba(0,0,0,0.4)", lineHeight: 1.5, marginTop: 10, margin: "10px 0 0 0" }}>
                {lastAnalysis.healthSummary.slice(0, 150)}
              </p>
            )}
          </div>

        </div>
      </div>
    </MetaDashboardLayout>
  );
}
