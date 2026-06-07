import { MetaDashboardLayout } from "@/components/MetaDashboardLayout";
import { useSelectedAccount } from "@/hooks/useSelectedAccount";
import { trpc } from "@/lib/trpc";
import {
  Brain, CheckCircle2, ChevronDown, ChevronUp, Clock, DollarSign,
  Lightbulb, Link2, RefreshCw, Target, Users, XCircle, Zap, Eye,
  AlertCircle, RotateCcw, TrendingUp, Info, Send, History, Maximize2, X, ExternalLink,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

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
  generated: number;
  skippedReason?: string;
}

function formatDate(d: Date | string | null | undefined) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("pt-BR");
}

function daysLeft(d: Date | string | null | undefined) {
  if (!d) return null;
  return Math.max(0, Math.ceil((new Date(d).getTime() - Date.now()) / 86400000));
}

function RejectionForm({ onConfirm, onCancel }: { onConfirm: (r: string) => void; onCancel: () => void }) {
  const [reason, setReason] = useState("");
  return (
    <div style={{ marginTop: 12, padding: "12px 14px", borderRadius: 10, background: "rgba(226,75,74,0.04)", border: "1px solid rgba(226,75,74,0.15)" }}>
      <p style={{ fontSize: 12, fontWeight: 600, color: "#E24B4A", marginBottom: 8 }}>Marcar como Não Aplicado</p>
      <textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="Motivo (opcional)..." rows={2} style={{ width: "100%", fontSize: 12, padding: "8px 10px", borderRadius: 8, border: "1px solid rgba(0,0,0,0.12)", background: "white", resize: "none", fontFamily: "inherit", outline: "none", marginBottom: 10 }} />
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => onConfirm(reason)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 8, border: "none", background: "#E24B4A", color: "white", fontSize: 12, fontWeight: 600, cursor: "pointer" }}><XCircle style={{ width: 12, height: 12 }} /> Confirmar</button>
        <button onClick={onCancel} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid rgba(0,0,0,0.12)", background: "white", fontSize: 12, cursor: "pointer", color: "rgba(0,0,0,0.5)" }}>Cancelar</button>
      </div>
    </div>
  );
}

function SuggestionCard({ s, onStatusChange, accountMetaId }: {
  s: any;
  accountMetaId?: string;
  onStatusChange: (id: number, status: "applied" | "rejected" | "pending", reason?: string, monitorDays?: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [monitorDays, setMonitorDays] = useState(() => {
    const defaults: Record<string, number> = { PAUSAR_CRIATIVO: 3, PAUSAR_CONJUNTO: 5, REALOCAR_ORCAMENTO: 5, NOVO_PUBLICO: 14, NOVO_CRIATIVO: 7, NOVO_CONJUNTO: 14 };
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
  const actionItems = parsedActionItems.map((a: any) => typeof a === "string" ? a : JSON.stringify(a));
  const expectedImpact = typeof s.expectedImpact === "string" ? s.expectedImpact.trim() : "";

  return (
    <div style={{ border: "0.5px solid rgba(0,0,0,0.08)", borderLeft: `3px solid ${isApplied ? "#1D9E75" : isRejected ? "rgba(0,0,0,0.08)" : pri.border}`, borderRadius: "0 10px 10px 0", background: "white", padding: "12px 14px", opacity: isRejected ? 0.55 : 1, marginBottom: 8 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4, background: `${pri.color}18`, color: pri.color, flexShrink: 0, marginTop: 1 }}>{pri.label}</span>
        <p style={{ flex: 1, fontSize: 13, fontWeight: 500, color: "#111", lineHeight: 1.45, margin: 0 }}>{s.title}</p>
        <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 4, background: cat.bg, color: cat.color, flexShrink: 0 }}>{cat.label}</span>
      </div>
      {expanded && (
        <p style={{ fontSize: 12, color: "rgba(0,0,0,0.5)", lineHeight: 1.55, margin: "8px 0 0 0" }}>{s.description}</p>
      )}

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

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
        {!isApplied && !isRejected && s.description !== "Ação criada a partir do Chat IA." && (
          <>
            <button onClick={() => setShowApplyModal(true)} disabled={isPending} style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 12px", borderRadius: 20, border: "1px solid rgba(29,158,117,0.4)", background: "rgba(29,158,117,0.06)", color: "#1D9E75", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
              <CheckCircle2 style={{ width: 11, height: 11 }} /> Marcar Aplicado
            </button>
            <button onClick={() => setShowRejectForm(v => !v)} disabled={isPending} style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 12px", borderRadius: 20, border: "1px solid rgba(226,75,74,0.3)", background: "rgba(226,75,74,0.04)", color: "#E24B4A", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
              <XCircle style={{ width: 11, height: 11 }} /> Não Aplicar
            </button>
          </>
        )}
        {isApplied && (
          <button onClick={() => { setIsPending(true); onStatusChange(s.id, "pending"); setTimeout(() => setIsPending(false), 1000); }} style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 12px", borderRadius: 20, border: "1px solid rgba(0,0,0,0.12)", background: "white", color: "rgba(0,0,0,0.4)", fontSize: 11, cursor: "pointer" }}>
            <RotateCcw style={{ width: 10, height: 10 }} /> Reverter
          </button>
        )}
        {accountMetaId && (
          <a
            href={`https://adsmanager.facebook.com/adsmanager/manage/ads?act=${accountMetaId.replace("act_", "")}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "rgba(0,0,0,0.35)", textDecoration: "none", padding: "3px 8px", borderRadius: 6, border: "0.5px solid rgba(0,0,0,0.1)", background: "white" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(24,95,165,0.4)"; e.currentTarget.style.color = "#185FA5"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(0,0,0,0.1)"; e.currentTarget.style.color = "rgba(0,0,0,0.35)"; }}
          >
            <ExternalLink style={{ width: 10, height: 10 }} /> BM
          </a>
        )}
        <span style={{ fontSize: 11, color: "rgba(0,0,0,0.3)", marginLeft: "auto", display: "flex", alignItems: "center", gap: 4 }}>
          <Clock style={{ width: 10, height: 10 }} />{formatDate(s.generatedAt)}{s.expiresAt && ` · expira ${formatDate(s.expiresAt)}`}
        </span>
        <button onClick={() => setExpanded(v => !v)} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(0,0,0,0.35)", fontSize: 11, display: "flex", alignItems: "center", gap: 3 }}>
          {expanded ? <><ChevronUp style={{ width: 12, height: 12 }} /> Menos</> : <><ChevronDown style={{ width: 12, height: 12 }} /> Ver ações</>}
        </button>
      </div>

      {showRejectForm && <RejectionForm onConfirm={(reason) => { setShowRejectForm(false); setIsPending(true); onStatusChange(s.id, "rejected", reason); setTimeout(() => setIsPending(false), 1000); }} onCancel={() => setShowRejectForm(false)} />}

      {showApplyModal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "white", borderRadius: 14, padding: "24px 28px", width: 360 }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: "#111", marginBottom: 6 }}>Confirmar ação aplicada</p>
            <p style={{ fontSize: 12, color: "rgba(0,0,0,0.5)", marginBottom: 18, lineHeight: 1.5 }}>Por quanto tempo a IA deve monitorar o resultado?</p>
            <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
              {[3, 5, 7, 14].map(d => (
                <button key={d} onClick={() => setMonitorDays(d)} style={{ flex: 1, padding: "8px 0", borderRadius: 8, fontSize: 12, fontWeight: 600, border: monitorDays === d ? "2px solid #E85BA8" : "1px solid rgba(0,0,0,0.12)", background: monitorDays === d ? "rgba(232,91,168,0.08)" : "white", color: monitorDays === d ? "#E85BA8" : "rgba(0,0,0,0.5)", cursor: "pointer" }}>{d}d</button>
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

function ChatMessages({ messages, isPending, accountId }: { messages: Array<{ role: string; content: string }>; isPending: boolean; accountId: number | null }) {
  const [actionModal, setActionModal] = useState<{ text: string } | null>(null);
  const [monitorDays, setMonitorDays] = useState(7);
  const [creating, setCreating] = useState(false);
  const utils = trpc.useUtils();

  const createAction = trpc.context.createActionFromChat.useMutation({
    onSuccess: () => {
      toast.success("Ação adicionada ao Plano de Ação!");
      setActionModal(null);
      setCreating(false);
      utils.suggestions.list.invalidate();
    },
    onError: () => { toast.error("Erro ao criar ação"); setCreating(false); },
  });

  return (
    <>
      {actionModal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ background: "white", borderRadius: 14, padding: "24px 28px", width: 400 }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: "#111", marginBottom: 8 }}>Adicionar ao Plano de Ação</p>
            <p style={{ fontSize: 12, color: "rgba(0,0,0,0.5)", marginBottom: 14, lineHeight: 1.5 }}>{actionModal.text}</p>
            <p style={{ fontSize: 11, color: "rgba(0,0,0,0.4)", marginBottom: 8 }}>Período de monitoramento (dias):</p>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
              {[3, 5, 7, 14].map(d => (
                <button key={d} onClick={() => setMonitorDays(d)} style={{ padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, border: monitorDays === d ? "2px solid #E85BA8" : "1px solid rgba(0,0,0,0.12)", background: monitorDays === d ? "rgba(232,91,168,0.08)" : "white", color: monitorDays === d ? "#E85BA8" : "rgba(0,0,0,0.5)", cursor: "pointer" }}>{d}d</button>
              ))}
              <input
                type="number"
                min={1}
                max={60}
                value={monitorDays}
                onChange={e => setMonitorDays(Math.max(1, Math.min(60, parseInt(e.target.value) || 1)))}
                style={{ width: 60, fontSize: 12, padding: "5px 8px", borderRadius: 8, border: "1px solid rgba(0,0,0,0.15)", textAlign: "center", outline: "none" }}
              />
            </div>
            <p style={{ fontSize: 10, color: "rgba(0,0,0,0.3)", marginBottom: 16, lineHeight: 1.5 }}>A ação entra direto em monitoramento. Após {monitorDays} dias, a IA registra um aprendizado automático.</p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setActionModal(null)} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid rgba(0,0,0,0.12)", background: "white", fontSize: 12, cursor: "pointer", color: "rgba(0,0,0,0.5)" }}>Cancelar</button>
              <button
                onClick={() => { if (!accountId) return; setCreating(true); createAction.mutate({ accountId, title: actionModal.text, monitorDays }); }}
                disabled={creating}
                style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#E85BA8", color: "white", fontSize: 12, fontWeight: 600, cursor: creating ? "not-allowed" : "pointer", opacity: creating ? 0.75 : 1 }}
              >
                {creating ? "Criando..." : "Adicionar ao Plano"}
              </button>
            </div>
          </div>
        </div>
      )}
      {messages.length === 0 && (
        <div style={{ margin: "auto", textAlign: "center", padding: "20px 0" }}>
          <Brain style={{ width: 24, height: 24, color: "rgba(232,91,168,0.3)", margin: "0 auto 8px" }} />
          <p style={{ fontSize: 11, color: "rgba(0,0,0,0.35)", lineHeight: 1.5 }}>Pergunte, peça análises ou descreva uma demanda. A IA já conhece o contexto desta conta.</p>
        </div>
      )}
      {messages.map((m, i) => {
        if (m.role === "user") {
          return (
            <div key={i} style={{ display: "flex", justifyContent: "flex-end" }}>
              <div style={{ maxWidth: "90%", padding: "8px 12px", borderRadius: "10px 10px 2px 10px", background: "#E85BA8", color: "white", fontSize: 12, lineHeight: 1.6 }}>
                {m.content}
              </div>
            </div>
          );
        }
        // Parsear resposta da IA — detectar ações no formato "AÇÕES:" no final
        const parts = m.content.split(/\n?AÇÕES:|\n?SUGESTÕES DE AÇÃO:/i);
        const mainText = parts[0] ?? m.content;
        const actionsText = parts[1] ?? "";
        const actions = actionsText ? actionsText.split("\n").map(a => a.replace(/^\d+\.\s*/, "").trim()).filter(Boolean) : [];
        const paragraphs = mainText.split("\n").filter(Boolean);
        return (
          <div key={i} style={{ display: "flex", justifyContent: "flex-start" }}>
            <div style={{ maxWidth: "95%", padding: "10px 14px", borderRadius: "10px 10px 10px 2px", background: "rgba(0,0,0,0.04)", color: "#111", fontSize: 12, lineHeight: 1.7 }}>
              {paragraphs.map((p, j) => (
                <p key={j} style={{ margin: j < paragraphs.length - 1 ? "0 0 10px 0" : 0 }}>{p}</p>
              ))}
              {actions.length > 0 && (
                <div style={{ marginTop: 14, borderTop: "0.5px solid rgba(0,0,0,0.1)", paddingTop: 12 }}>
                  <p style={{ fontSize: 10, fontWeight: 600, color: "rgba(0,0,0,0.4)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Ações sugeridas</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {actions.map((action, j) => (
                      <div key={j} onClick={() => { setActionModal({ text: action }); setMonitorDays(7); }} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "6px 10px", borderRadius: 8, background: "white", border: "0.5px solid rgba(0,0,0,0.1)", cursor: "pointer", transition: "border-color 0.15s" }} onMouseEnter={e => e.currentTarget.style.borderColor = "rgba(232,91,168,0.4)"} onMouseLeave={e => e.currentTarget.style.borderColor = "rgba(0,0,0,0.1)"}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: "#E85BA8", flexShrink: 0, minWidth: 16 }}>{j + 1}</span>
                        <p style={{ fontSize: 11, color: "#111", lineHeight: 1.5, margin: 0, flex: 1 }}>{action}</p>
                        <span style={{ fontSize: 10, color: "rgba(232,91,168,0.6)", flexShrink: 0, whiteSpace: "nowrap" }}>+ Plano</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}
      {isPending && <div style={{ padding: "8px 12px", borderRadius: "10px 10px 10px 2px", background: "rgba(0,0,0,0.04)", fontSize: 12, color: "rgba(0,0,0,0.4)" }}>Pensando...</div>}
    </>
  );
}

function ChatPanel({ accountId }: { accountId: number | null }) {
  const storageKey = `chat_history_${accountId}`;
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>(() => {
    try {
      const saved = sessionStorage.getItem(storageKey);
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [input, setInput] = useState("");
  const [modal, setModal] = useState(false);

  const saveMessages = (msgs: Array<{ role: "user" | "assistant"; content: string }>) => {
    setMessages(msgs);
    try { sessionStorage.setItem(storageKey, JSON.stringify(msgs)); } catch {}
  };

  const clearChat = () => {
    saveMessages([]);
    try { sessionStorage.removeItem(storageKey); } catch {}
  };

  const chat = trpc.context.chat.useMutation({
    onError: () => setMessages(prev => [...prev, { role: "assistant", content: "Erro ao conectar com a IA. Tente novamente." }]),
  });

  function sendMessage() {
    if (!input.trim() || chat.isPending || !accountId) return;
    const userMsg = input.trim();
    setInput("");
    const newMessages = [...messages, { role: "user" as const, content: userMsg }];
    saveMessages(newMessages);
    chat.mutate(
      { accountId, messages: newMessages },
      { onSuccess: (data) => saveMessages([...newMessages, { role: "assistant", content: data.reply }]) }
    );
  }

  const inputArea = (large: boolean) => (
    <div style={{ borderTop: "0.5px solid rgba(0,0,0,0.08)", padding: "8px", display: "flex", gap: 6, background: "rgba(0,0,0,0.02)" }}>
      <textarea
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
        placeholder="Pergunte ou peça análise... (Enter)"
        rows={large ? 3 : 2}
        style={{ flex: 1, fontSize: large ? 13 : 11, padding: "6px 10px", borderRadius: 6, border: "0.5px solid rgba(0,0,0,0.12)", background: "white", resize: "none", fontFamily: "inherit", outline: "none", color: "#111" }}
      />
      <button onClick={sendMessage} disabled={chat.isPending || !input.trim() || !accountId} style={{ padding: "6px 10px", borderRadius: 6, border: "none", background: "#E85BA8", color: "white", cursor: chat.isPending || !input.trim() ? "not-allowed" : "pointer", opacity: chat.isPending || !input.trim() ? 0.6 : 1, alignSelf: "flex-end" }}>
        <Send style={{ width: 14, height: 14 }} />
      </button>
    </div>
  );

  return (
    <>
      {modal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ background: "white", borderRadius: 14, width: "100%", maxWidth: 720, height: "80vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ padding: "14px 18px", borderBottom: "0.5px solid rgba(0,0,0,0.08)", display: "flex", alignItems: "center", gap: 8 }}>
              <Brain style={{ width: 14, height: 14, color: "#E85BA8" }} />
              <span style={{ fontSize: 13, fontWeight: 500, color: "#111", flex: 1 }}>Chat IA</span>
              {messages.length > 0 && (
                <button onClick={clearChat} title="Limpar conversa" style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(0,0,0,0.35)", padding: 2, marginRight: 4, fontSize: 11 }}>
                  Limpar
                </button>
              )}
              <button onClick={() => setModal(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(0,0,0,0.4)", padding: 2 }}>
                <X style={{ width: 16, height: 16 }} />
              </button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
              <ChatMessages messages={messages} isPending={chat.isPending} accountId={accountId} />
            </div>
            {inputArea(true)}
          </div>
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", border: "0.5px solid rgba(0,0,0,0.08)", borderRadius: 12, overflow: "hidden", background: "white", position: "sticky", top: 20 }}>
        <div style={{ padding: "10px 14px", borderBottom: "0.5px solid rgba(0,0,0,0.08)", display: "flex", alignItems: "center", gap: 6, background: "rgba(0,0,0,0.02)" }}>
          <Brain style={{ width: 13, height: 13, color: "#E85BA8" }} />
          <span style={{ fontSize: 12, fontWeight: 500, color: "#111", flex: 1 }}>Chat IA</span>
          {messages.length > 0 && (
            <button onClick={clearChat} title="Limpar conversa" style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(0,0,0,0.25)", padding: 2 }}>
              <X style={{ width: 11, height: 11 }} />
            </button>
          )}
          <button onClick={() => setModal(true)} title="Expandir" style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(0,0,0,0.3)", padding: 2 }}>
            <Maximize2 style={{ width: 12, height: 12 }} />
          </button>
        </div>
        <div style={{ minHeight: 180, maxHeight: 400, overflowY: "auto", padding: "12px", display: "flex", flexDirection: "column", gap: 8 }}>
          <ChatMessages messages={messages} isPending={chat.isPending} accountId={accountId} />
        </div>
        {inputArea(false)}
      </div>
    </>
  );
}

export default function Suggestions() {
  const [, navigate] = useLocation();
  const { selectedAccountId, accounts } = useSelectedAccount();
  const utils = trpc.useUtils();
  const [lastAnalysis, setLastAnalysis] = useState<AccountStateResult | null>(null);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [focusInput, setFocusInput] = useState("");
  const [savingFocus, setSavingFocus] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({ critical: true, attention: false, opportunities: false, applied: false });
  const toggleGroup = (key: string) => setOpenGroups(prev => ({ ...prev, [key]: !prev[key] }));

  const { data: suggestions, isLoading } = trpc.suggestions.list.useQuery({ accountId: selectedAccountId! }, { enabled: !!selectedAccountId });
  const { data: hist = [] } = trpc.suggestions.history.useQuery({ accountId: selectedAccountId! }, { enabled: !!selectedAccountId });
  const { data: accountCtx } = trpc.context.getAccount.useQuery({ accountId: selectedAccountId! }, { enabled: !!selectedAccountId, staleTime: 30_000 });
  const { data: experiments } = trpc.experiments.list.useQuery({ accountId: selectedAccountId! }, { enabled: !!selectedAccountId });

  const upsertContext = trpc.context.upsertAccount.useMutation({
    onSuccess: () => { toast.success("Foco salvo"); setSavingFocus(false); utils.context.getAccount.invalidate(); },
    onError: () => { toast.error("Erro ao salvar"); setSavingFocus(false); },
  });

  const generate = trpc.suggestions.generate.useMutation({
    onSuccess: (data) => {
      utils.suggestions.list.invalidate();
      utils.suggestions.history.invalidate();
      setLastAnalysis(data as AccountStateResult);
      if (data.skippedReason) toast.warning(data.skippedReason, { duration: 6000 });
      else {
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
          <button onClick={() => navigate("/settings")} style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: "#E85BA8", color: "white", fontSize: 13, fontWeight: 600, cursor: "pointer", marginTop: 8 }}>Conectar conta</button>
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
  const historyItems = [...(suggestions ?? []).filter(isInHistory), ...hist.filter((h: any) => !(suggestions ?? []).some((s: any) => s.id === h.id))];
  const historyDeduped = Array.from(new Map(historyItems.map((s: any) => [s.id, s])).values());
  const monitoring = (suggestions ?? []).filter((s: any) => s.status === "applied" && s.monitorUntil && daysLeft(s.monitorUntil)! > 0 && !s.monitorResult);

  const p1 = pending.filter((s: any) => ["P1","HIGH","CRITICAL"].includes(s.priority));
  const p2 = pending.filter((s: any) => ["P2","MEDIUM"].includes(s.priority));
  const p3 = pending.filter((s: any) => ["P3","LOW"].includes(s.priority));

  const account = accounts?.find((a: any) => a.id === selectedAccountId);
  const aiColor = (account as any)?.aiStatusColor as "green" | "yellow" | "red" | null;
  const stateColors = { green: { color: "#1D9E75", label: "Saudável", bg: "rgba(29,158,117,0.08)", border: "rgba(29,158,117,0.25)" }, yellow: { color: "#EF9F27", label: "Atenção", bg: "rgba(239,159,39,0.08)", border: "rgba(239,159,39,0.25)" }, red: { color: "#E24B4A", label: "Crítico", bg: "rgba(226,75,74,0.08)", border: "rgba(226,75,74,0.25)" } };
  const stateCfg = aiColor ? stateColors[aiColor] : stateColors.yellow;

  const activeExperiments = (experiments ?? []).filter((e: any) => e.status === "active");

  // Filter logic
  const getFilteredActions = () => {
    if (!activeFilter) return { p1, p2, p3 };
    if (activeFilter === "critical") return { p1, p2: [], p3: [] };
    if (activeFilter === "attention") return { p1: [], p2, p3: [] };
    if (activeFilter === "opportunities") return { p1: [], p2: [], p3 };
    if (activeFilter === "monitoring") return { p1: recentApplied, p2: [], p3: [] };
    return { p1, p2, p3 };
  };
  const { p1: fp1, p2: fp2, p3: fp3 } = getFilteredActions();

  const sectionHeader = (color: string, text: string, key: string, count: number) => (
    <div onClick={() => toggleGroup(key)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: openGroups[key] ? 10 : 0, cursor: "pointer", padding: "6px 0" }}>
      <p style={{ fontSize: 10, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: "0.08em", display: "flex", alignItems: "center", gap: 6, margin: 0 }}>
        {text}
        <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 10, background: `${color}18`, color }}>{count}</span>
      </p>
      <ChevronDown style={{ width: 13, height: 13, color, transform: openGroups[key] ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }} />
    </div>
  );

  return (
    <MetaDashboardLayout title="Plano de Ação">
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: "#111", marginBottom: 4 }}>Plano de Ação</h1>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 500, background: stateCfg.bg, color: stateCfg.color, border: `0.5px solid ${stateCfg.border}` }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: stateCfg.color, display: "inline-block" }} />
                {stateCfg.label}
              </span>
              {account?.accountName && <span style={{ fontSize: 11, color: "rgba(0,0,0,0.4)" }}>{account.accountName}</span>}
            </div>
          </div>
          <button onClick={() => selectedAccountId && generate.mutate({ accountId: selectedAccountId })} disabled={generate.isPending || !selectedAccountId} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 10, border: "none", background: "#E85BA8", color: "white", fontSize: 13, fontWeight: 600, cursor: generate.isPending ? "not-allowed" : "pointer", opacity: generate.isPending ? 0.75 : 1, flexShrink: 0 }}>
            <Brain style={{ width: 14, height: 14 }} />
            {generate.isPending ? "Diagnosticando..." : "Analisar Conta"}
          </button>
        </div>

        {/* 3 cards topo */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>

          {/* Inteligência + Resumo */}
          <div style={{ background: "white", border: "0.5px solid rgba(0,0,0,0.08)", borderRadius: 12, padding: "14px 16px" }}>
            <p style={{ fontSize: 10, fontWeight: 600, color: "rgba(0,0,0,0.35)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>Inteligência da conta</p>
            {(account as any)?.aiStatusSummary && (
              <p style={{ fontSize: 11, color: "rgba(0,0,0,0.5)", lineHeight: 1.6, marginBottom: 12 }}>{(account as any).aiStatusSummary.slice(0, 150)}</p>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              {[
                { label: "Críticas", value: p1.length, color: "#E24B4A", filter: "critical" },
                { label: "Atenção", value: p2.length, color: "#EF9F27", filter: "attention" },
                { label: "Monitorando", value: monitoring.length, color: "#1D9E75", filter: "monitoring" },
                { label: "Histórico", value: historyDeduped.length, color: "rgba(0,0,0,0.3)", filter: null },
              ].map(({ label, value, color, filter }) => (
                <div key={label} onClick={() => filter && setActiveFilter(activeFilter === filter ? null : filter)} style={{ background: activeFilter === filter ? `${color}10` : "rgba(0,0,0,0.03)", borderRadius: 8, padding: "8px 10px", cursor: filter ? "pointer" : "default", border: activeFilter === filter ? `1px solid ${color}40` : "0.5px solid transparent", transition: "all 0.15s" }}>
                  <p style={{ fontSize: 10, color: "rgba(0,0,0,0.4)", marginBottom: 2 }}>{label}</p>
                  <p style={{ fontSize: 18, fontWeight: 700, color, lineHeight: 1 }}>{value}</p>
                </div>
              ))}
            </div>
            {activeFilter && (
              <button onClick={() => setActiveFilter(null)} style={{ marginTop: 8, width: "100%", fontSize: 10, padding: "4px", borderRadius: 6, border: "0.5px solid rgba(0,0,0,0.1)", background: "white", cursor: "pointer", color: "rgba(0,0,0,0.4)" }}>
                Limpar filtro
              </button>
            )}
          </div>

          {/* Experimentos */}
          <div style={{ background: "white", border: "0.5px solid rgba(0,0,0,0.08)", borderRadius: 12, padding: "14px 16px" }}>
            <p style={{ fontSize: 10, fontWeight: 600, color: "rgba(0,0,0,0.35)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>Experimentos ativos</p>
            {activeExperiments.length === 0 ? (
              <p style={{ fontSize: 11, color: "rgba(0,0,0,0.3)", fontStyle: "italic" }}>Nenhum experimento ativo</p>
            ) : activeExperiments.slice(0, 3).map((e: any) => (
              <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "0.5px solid rgba(0,0,0,0.05)" }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#378ADD", flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 11, fontWeight: 500, color: "#111" }}>{e.title}</p>
                  <p style={{ fontSize: 10, color: "rgba(0,0,0,0.35)" }}>
                    {(() => {
                      if (!e.startDate || !e.endDate) return "datas não definidas";
                      const start = new Date(e.startDate);
                      const end = new Date(e.endDate);
                      const today = new Date();
                      const totalDays = Math.ceil((end.getTime() - start.getTime()) / 86400000);
                      const currentDay = Math.min(Math.max(1, Math.ceil((today.getTime() - start.getTime()) / 86400000)), totalDays);
                      return `dia ${currentDay} de ${totalDays}`;
                    })()}
                  </p>
                </div>
                <button onClick={() => navigate("/experiments")} style={{ fontSize: 10, color: "rgba(0,0,0,0.35)", background: "none", border: "none", cursor: "pointer" }}>Ver →</button>
              </div>
            ))}
            <button onClick={() => navigate("/experiments")} style={{ marginTop: 10, width: "100%", fontSize: 11, padding: "6px", borderRadius: 6, border: "0.5px solid rgba(0,0,0,0.1)", background: "transparent", cursor: "pointer", color: "rgba(0,0,0,0.4)" }}>
              + Novo experimento
            </button>
          </div>

          {/* Foco do Momento */}
          <div style={{ background: "white", border: "0.5px solid rgba(0,0,0,0.08)", borderRadius: 12, padding: "14px 16px", display: "flex", flexDirection: "column" }}>
            <p style={{ fontSize: 10, fontWeight: 600, color: "rgba(0,0,0,0.35)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>Foco do momento</p>
            <p style={{ fontSize: 10, color: "rgba(0,0,0,0.35)", marginBottom: 10, lineHeight: 1.5 }}>A IA lê esse campo e prioriza análises de acordo.</p>
            <textarea
              value={focusInput || (accountCtx as any)?.focusMoment || ""}
              onChange={e => setFocusInput(e.target.value)}
              placeholder="Ex: Reduzir CPA abaixo de R$150 até fim do mês. Foco em SALES, não tocar em MESSAGES por ora..."
              rows={4}
              style={{ flex: 1, fontSize: 11, padding: "8px 10px", borderRadius: 8, border: "0.5px solid rgba(0,0,0,0.12)", background: "rgba(0,0,0,0.02)", resize: "none", fontFamily: "inherit", outline: "none", color: "#111", lineHeight: 1.5 }}
              onFocus={e => e.currentTarget.style.borderColor = "rgba(232,91,168,0.4)"}
              onBlur={e => e.currentTarget.style.borderColor = "rgba(0,0,0,0.12)"}
            />
            <button
              onClick={() => { if (!selectedAccountId) return; setSavingFocus(true); upsertContext.mutate({ accountId: selectedAccountId, focusMoment: focusInput || (accountCtx as any)?.focusMoment || "" }); }}
              disabled={savingFocus}
              style={{ marginTop: 8, padding: "6px", borderRadius: 6, border: "none", background: "#E85BA8", color: "white", fontSize: 11, fontWeight: 500, cursor: savingFocus ? "not-allowed" : "pointer", opacity: savingFocus ? 0.75 : 1 }}
            >
              {savingFocus ? "Salvando..." : "Salvar foco"}
            </button>
          </div>

        </div>

        {/* Layout principal */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 260px", gap: 16, alignItems: "start" }}>

          {/* Ações */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            {fp1.length > 0 && (
              <div style={{ border: "0.5px solid rgba(0,0,0,0.08)", borderRadius: 10, padding: "8px 12px", background: "white" }}>
                {sectionHeader("#E24B4A", "Críticas — requerem ação imediata", "critical", fp1.length)}
                {openGroups.critical && fp1.map((s: any) => <SuggestionCard key={s.id} s={s} onStatusChange={handleStatusChange} accountMetaId={(account as any)?.accountId} />)}
              </div>
            )}

            {fp2.length > 0 && (
              <div style={{ border: "0.5px solid rgba(0,0,0,0.08)", borderRadius: 10, padding: "8px 12px", background: "white" }}>
                {sectionHeader("#EF9F27", "Em atenção — monitorar nos próximos dias", "attention", fp2.length)}
                {openGroups.attention && fp2.map((s: any) => <SuggestionCard key={s.id} s={s} onStatusChange={handleStatusChange} accountMetaId={(account as any)?.accountId} />)}
              </div>
            )}

            {fp3.length > 0 && (
              <div style={{ border: "0.5px solid rgba(0,0,0,0.08)", borderRadius: 10, padding: "8px 12px", background: "white" }}>
                {sectionHeader("#378ADD", "Oportunidades — crescimento", "opportunities", fp3.length)}
                {openGroups.opportunities && fp3.map((s: any) => <SuggestionCard key={s.id} s={s} onStatusChange={handleStatusChange} accountMetaId={(account as any)?.accountId} />)}
              </div>
            )}

            {recentApplied.length > 0 && !activeFilter && (
              <div style={{ border: "0.5px solid rgba(0,0,0,0.08)", borderRadius: 10, padding: "8px 12px", background: "white" }}>
                {sectionHeader("#1D9E75", "Aplicadas — em observação", "applied", recentApplied.length)}
                {openGroups.applied && recentApplied.map((s: any) => <SuggestionCard key={s.id} s={s} onStatusChange={handleStatusChange} accountMetaId={(account as any)?.accountId} />)}
              </div>
            )}

            {pending.length === 0 && recentApplied.length === 0 && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "48px 0", textAlign: "center" }}>
                <Brain style={{ width: 40, height: 40, color: "rgba(232,91,168,0.3)", marginBottom: 16 }} />
                <p style={{ fontSize: 14, fontWeight: 500, color: "#111", marginBottom: 8 }}>Nenhuma ação pendente</p>
                <p style={{ fontSize: 12, color: "rgba(0,0,0,0.4)", maxWidth: 340, lineHeight: 1.6, marginBottom: 20 }}>
                  {lastAnalysis?.accountState === "ESTADO_A" ? "A conta está saudável. Nenhuma intervenção necessária." : "Clique em \"Analisar Conta\" para gerar recomendações."}
                </p>
                <button onClick={() => selectedAccountId && generate.mutate({ accountId: selectedAccountId })} disabled={generate.isPending} style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: "#E85BA8", color: "white", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                  {generate.isPending ? "Diagnosticando..." : "Analisar Conta"}
                </button>
              </div>
            )}

            {/* Histórico colapsável */}
            <div style={{ border: "0.5px solid rgba(0,0,0,0.08)", borderRadius: 12, overflow: "hidden" }}>
              <div onClick={() => setShowHistory(v => !v)} style={{ padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", background: "rgba(0,0,0,0.02)" }}>
                <span style={{ fontSize: 12, fontWeight: 500, color: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", gap: 6 }}>
                  <History style={{ width: 13, height: 13 }} /> Histórico de ações
                </span>
                <span style={{ fontSize: 11, color: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", gap: 4 }}>
                  {historyDeduped.length} ações {showHistory ? <ChevronUp style={{ width: 12, height: 12 }} /> : <ChevronDown style={{ width: 12, height: 12 }} />}
                </span>
              </div>
              {showHistory && (
                <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
                  {historyDeduped.length === 0 ? (
                    <p style={{ fontSize: 12, color: "rgba(0,0,0,0.3)", textAlign: "center", padding: "16px 0" }}>Nenhuma ação no histórico ainda.</p>
                  ) : historyDeduped.map((s: any) => (
                    <SuggestionCard key={s.id} s={s} onStatusChange={handleStatusChange} accountMetaId={(account as any)?.accountId} />
                  ))}
                </div>
              )}
            </div>

          </div>

          {/* Chat sticky */}
          <ChatPanel accountId={selectedAccountId} />

        </div>

      </div>
    </MetaDashboardLayout>
  );
}
