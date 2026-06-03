import { trpc } from "@/lib/trpc";
import { useSelectedAccount } from "@/hooks/useSelectedAccount";
import { getClientByMetaAccountId, getIntegrationStatus } from "@/config/clientConfig";
import { Button } from "@/components/ui/button";
import { RefreshCw, ChevronDown, ChevronUp, Pencil, Check, X, Lightbulb } from "lucide-react";
import { useMemo, useState, useRef, useEffect, useLayoutEffect } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toIsoLocal(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fmt(n: number) {
  if (n >= 1_000_000) return `R$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `R$${(n / 1_000).toFixed(1)}k`;
  return `R$${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtN(n: number) {
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString("pt-BR");
}
function fmtDateShort(d: Date | string | null) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

const ACCOUNT_COLORS: Record<string, { bg: string; color: string }> = {
  blue:    { bg: "rgba(59,130,246,0.15)",   color: "#60a5fa" },
  violet:  { bg: "rgba(139,92,246,0.15)",   color: "#a78bfa" },
  emerald: { bg: "rgba(16,185,129,0.15)",   color: "#34d399" },
  amber:   { bg: "rgba(245,158,11,0.15)",   color: "#fbbf24" },
  cyan:    { bg: "rgba(6,182,212,0.15)",    color: "#22d3ee" },
  rose:    { bg: "rgba(244,63,94,0.15)",    color: "#fb7185" },
  lime:    { bg: "rgba(132,204,22,0.15)",   color: "#a3e635" },
  orange:  { bg: "rgba(249,115,22,0.15)",   color: "#fb923c" },
  pink:    { bg: "rgba(232,91,168,0.15)",   color: "#E85BA8" },
  teal:    { bg: "rgba(20,184,166,0.15)",   color: "#2dd4bf" },
  indigo:  { bg: "rgba(99,102,241,0.15)",   color: "#818cf8" },
  fuchsia: { bg: "rgba(232,91,168,0.15)",   color: "#E85BA8" },
};

const STATUS_CFG = {
  green:  { color: "#1D9E75", label: "Saudável" },
  yellow: { color: "#EF9F27", label: "Atenção"  },
  red:    { color: "#E24B4A", label: "Crítico"  },
};

// Block widths — must match the spacers in Row 2 exactly
const W2 = 190; // Últimas ações
const W3 = 220; // Resumo geral
const W4 = 190; // Nota

const vDivider = (
  <div style={{ width: "0.5px", alignSelf: "stretch", background: "rgba(0,0,0,0.08)", flexShrink: 0 }} />
);

const blockLabel = (text: string) => (
  <p style={{ fontSize: 9, fontWeight: 700, color: "rgba(0,0,0,0.3)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 }}>
    {text}
  </p>
);

// ─── Component ────────────────────────────────────────────────────────────────

export function AccountHeader({ goalLabel, goalEmoji }: { goalLabel?: string; goalEmoji?: string }) {
  const { selectedAccountId, accounts } = useSelectedAccount();
  const utils = trpc.useUtils();
  const [, navigate] = useLocation();

  const activeAccount = useMemo(
    () => accounts?.find((a: any) => a.id === selectedAccountId),
    [accounts, selectedAccountId]
  );
  const activeClient = useMemo(
    () => activeAccount ? getClientByMetaAccountId(activeAccount.accountId) : null,
    [activeAccount]
  );
  const integrations = useMemo(
    () => activeClient ? getIntegrationStatus(activeClient) : null,
    [activeClient]
  );

  const today     = toIsoLocal(new Date());
  const yesterday = toIsoLocal(new Date(Date.now() - 86_400_000));

  const { data: todayData } = trpc.dashboard.overview.useQuery(
    { accountId: selectedAccountId!, startDate: today, endDate: today },
    { enabled: !!selectedAccountId, staleTime: 60_000 }
  );
  const { data: yestData } = trpc.dashboard.overview.useQuery(
    { accountId: selectedAccountId!, startDate: yesterday, endDate: yesterday },
    { enabled: !!selectedAccountId, staleTime: 60_000 }
  );

  const { data: suggestions } = trpc.suggestions.list.useQuery(
    { accountId: selectedAccountId! },
    { enabled: !!selectedAccountId, staleTime: 120_000 }
  );
  const lastApplied = useMemo(
    () => (suggestions ?? []).filter((s: any) => s.status === "applied").slice(0, 2),
    [suggestions]
  );

  const savedNote = (activeAccount as any)?.accountNote as string | null ?? "";
  const [editing, setEditing] = useState(false);
  const [noteValue, setNoteValue] = useState(savedNote);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { setNoteValue(savedNote); }, [savedNote]);
  useEffect(() => { if (editing) textareaRef.current?.focus(); }, [editing]);

  const updateNote = trpc.accounts.updateNote.useMutation({
    onSuccess: () => { utils.accounts.list.invalidate(); setEditing(false); },
    onError: () => toast.error("Erro ao salvar nota"),
  });

  const refreshStatus = trpc.accounts.refreshStatus.useMutation({
    onSuccess: () => { utils.accounts.list.invalidate(); toast.success("Status IA atualizado"); },
    onError:   () => toast.error("Erro ao atualizar status IA"),
  });

  // Summary overflow detection — chevron only shows when text genuinely overflows
  const summaryRef = useRef<HTMLParagraphElement>(null);
  const [summaryOverflows, setSummaryOverflows] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const aiColor   = (activeAccount as any).aiStatusColor as "green" | "yellow" | "red" | null ?? null;
  const aiSummary = (activeAccount as any).aiStatusSummary as string | null;

  useLayoutEffect(() => {
    const el = summaryRef.current;
    if (!el) return;
    // Temporarily remove clamp to measure natural height, then compare
    setSummaryOverflows(el.scrollHeight > el.clientHeight + 2);
  }, [aiSummary, expanded]);

  if (!selectedAccountId || !activeAccount) return null;

  const accountName: string = activeAccount.accountName ?? activeAccount.accountId;
  const initials  = accountName.slice(0, 2).toUpperCase();
  const palette   = ACCOUNT_COLORS[activeClient?.color ?? "fuchsia"] ?? ACCOUNT_COLORS.fuchsia!;

  const todaySpend = Number(todayData?.totals?.spend ?? 0);
  const todayConv  = Number(todayData?.totals?.conversions ?? 0);
  const todayRoas  = Number(todayData?.totals?.roas ?? 0);
  const yestSpend  = Number(yestData?.totals?.spend ?? 0);
  const yestConv   = Number(yestData?.totals?.conversions ?? 0);
  const yestRoas   = Number(yestData?.totals?.roas ?? 0);

  const statusCfg = aiColor ? STATUS_CFG[aiColor] : null;

  const sep  = <span style={{ opacity: 0.3, margin: "0 4px" }}>·</span>;
  const pipe = <span style={{ opacity: 0.25, margin: "0 8px" }}>|</span>;
  const muted = "rgba(0,0,0,0.4)";

  // Max height for clamped summary (~4 lines × 1.4 line-height × 11px font ≈ 62px)
  const CLAMP_HEIGHT = 62;

  return (
    <div style={{
      background: "white",
      border: "1px solid rgba(0,0,0,0.08)",
      borderRadius: "12px",
      padding: "12px 16px",
      marginBottom: "16px",
      display: "flex",
      flexDirection: "column",
      gap: 0,
    }}>

      {/* ══ ROW 1 ══════════════════════════════════════════════════════════ */}
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>

        {/* Block 1 — Identity + daily snapshot */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, whiteSpace: "nowrap", overflow: "hidden" }}>
            <div style={{
              width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
              background: palette.bg, color: palette.color,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
            }}>
              {initials}
            </div>
            <span style={{ fontSize: 13, fontWeight: 500, color: "#111", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 180 }}>
              {accountName}
            </span>
            {goalLabel && (
              <span style={{
                fontSize: 10, fontWeight: 500, flexShrink: 0,
                padding: "2px 8px", borderRadius: 99,
                background: "rgba(232,91,168,0.1)", color: "#E85BA8",
                border: "1px solid rgba(232,91,168,0.25)",
              }}>
                {goalEmoji} {goalLabel}
              </span>
            )}
            <span style={{ opacity: 0.2, margin: "0 2px" }}>•</span>
            <span style={{ fontSize: 10, fontWeight: 500, color: "#1D9E75", opacity: 0.85, flexShrink: 0 }}>● Meta Ads</span>
            <span style={{ fontSize: 10, fontWeight: 500, flexShrink: 0, color: integrations?.ga4 ? "#60a5fa" : muted, opacity: integrations?.ga4 ? 0.85 : 0.45 }}>
              {integrations?.ga4 ? "●" : "○"} GA4
            </span>
            <span style={{ fontSize: 10, fontWeight: 500, flexShrink: 0, color: integrations?.googleAds ? "#fbbf24" : muted, opacity: integrations?.googleAds ? 0.85 : 0.45 }}>
              {integrations?.googleAds ? "●" : "○"} Google Ads
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontSize: 12, color: muted }}>
            <span style={{ color: "#E85BA8", fontWeight: 500 }}>Hoje</span>
            {sep}{fmt(todaySpend)}{sep}{fmtN(todayConv)} result.
            {todayRoas > 0 && <>{sep}{todayRoas.toFixed(2)}x ROAS</>}
            {pipe}
            <span style={{ fontWeight: 500, color: muted }}>Ontem</span>
            {sep}{fmt(yestSpend)}{sep}{fmtN(yestConv)} result.
            {yestRoas > 0 && <>{sep}{yestRoas.toFixed(2)}x ROAS</>}
          </div>
        </div>

        {vDivider}

        {/* Block 2 — Últimas Ações */}
        <div style={{ width: W2, flexShrink: 0 }}>
          {blockLabel("Últimas Ações")}
          {lastApplied.length === 0 ? (
            <p style={{ fontSize: 11, color: muted, opacity: 0.6 }}>Nenhuma ação registrada</p>
          ) : (
            lastApplied.map((s: any) => (
              <div key={s.id} style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 2 }}>
                <span style={{ fontSize: 11, color: "#111", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>
                  {s.title}
                </span>
                <span style={{ fontSize: 10, color: muted, flexShrink: 0 }}>{fmtDateShort(s.appliedAt)}</span>
              </div>
            ))
          )}
        </div>

        {vDivider}

        {/* Block 3 — Resumo Geral */}
        <div style={{ width: W3, flexShrink: 0 }}>
          {blockLabel("Resumo Geral")}
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 2 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", flexShrink: 0, background: statusCfg?.color ?? "rgba(0,0,0,0.2)" }} />
            <span style={{ fontSize: 11, fontWeight: 500, color: statusCfg?.color ?? muted, flex: 1 }}>
              {statusCfg?.label ?? "Status IA"} — 7 dias
            </span>
            <button
              onClick={() => refreshStatus.mutate({ accountId: selectedAccountId })}
              disabled={refreshStatus.isPending}
              title="Atualizar análise IA"
              style={{ background: "none", border: "none", cursor: "pointer", padding: 2, color: muted, opacity: 0.5, transition: "opacity 0.15s" }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.5")}
            >
              <RefreshCw style={{ width: 10, height: 10, animation: refreshStatus.isPending ? "spin 1s linear infinite" : undefined }} />
            </button>
          </div>

          {/* Summary — full text by default; clamped only when expanded=false AND overflows */}
          <p
            ref={summaryRef}
            style={{
              fontSize: 11, lineHeight: 1.4, color: muted,
              transition: "max-height 0.2s ease",
              overflow: "hidden",
              maxHeight: expanded ? "none" : CLAMP_HEIGHT,
            }}
          >
            {aiSummary ?? "Análise pendente — execute um sync"}
          </p>

          {/* Chevron — only rendered when overflow is detected */}
          {summaryOverflows && (
            <button
              onClick={() => setExpanded(v => !v)}
              style={{ display: "flex", alignItems: "center", gap: 2, marginTop: 2, background: "none", border: "none", padding: 0, cursor: "pointer", color: muted, opacity: 0.5, fontSize: 10, transition: "opacity 0.2s ease" }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.9")}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.5")}
            >
              {expanded ? <ChevronUp style={{ width: 10, height: 10 }} /> : <ChevronDown style={{ width: 10, height: 10 }} />}
            </button>
          )}
        </div>

        {vDivider}

        {/* Block 4 — Nota */}
        <div style={{ width: W4, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
            {blockLabel("Nota")}
            <div style={{ flex: 1 }} />
            {editing ? (
              <div style={{ display: "flex", gap: 2 }}>
                <button onClick={() => updateNote.mutate({ accountId: selectedAccountId, note: noteValue })} disabled={updateNote.isPending}
                  style={{ background: "none", border: "none", cursor: "pointer", padding: 1, color: "#1D9E75" }} title="Salvar">
                  <Check style={{ width: 11, height: 11 }} />
                </button>
                <button onClick={() => { setNoteValue(savedNote); setEditing(false); }}
                  style={{ background: "none", border: "none", cursor: "pointer", padding: 1, color: muted }} title="Cancelar">
                  <X style={{ width: 11, height: 11 }} />
                </button>
              </div>
            ) : (
              <button onClick={() => setEditing(true)}
                style={{ background: "none", border: "none", cursor: "pointer", padding: 1, color: muted, opacity: 0.5 }} title="Editar nota">
                <Pencil style={{ width: 10, height: 10 }} />
              </button>
            )}
          </div>
          {editing ? (
            <textarea
              ref={textareaRef}
              value={noteValue}
              onChange={(e) => setNoteValue(e.target.value)}
              rows={2}
              style={{ width: "100%", fontSize: 11, lineHeight: 1.4, padding: "3px 6px", borderRadius: 6, border: "1px solid rgba(232,91,168,0.4)", resize: "none", outline: "none", fontFamily: "inherit", color: "#111" }}
              placeholder="Adicionar nota..."
            />
          ) : (
            <p style={{ fontSize: 11, color: noteValue ? "#111" : muted, lineHeight: 1.4, cursor: "text", opacity: noteValue ? 1 : 0.5 }} onClick={() => setEditing(true)}>
              {noteValue || "Adicionar nota..."}
            </p>
          )}
        </div>

      </div>

      {/* ══ ROW 2 — footer ══════════════════════════════════════════════════ */}
      <div style={{ borderTop: "1px solid rgba(0,0,0,0.06)", marginTop: 10, paddingTop: 8, display: "flex", alignItems: "center", gap: 16 }}>

        {/* flex:1 wrapper matches Block 1 width exactly; button fills it */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            onClick={() => navigate("/suggestions")}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
              width: "100%",
              background: "#F97316", borderRadius: 8, padding: "7px 14px",
              cursor: "pointer", transition: "opacity 0.15s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.88")}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
            title="Ver sugestões da IA"
          >
            <Lightbulb style={{ width: 14, height: 14, color: "white", flexShrink: 0 }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: "white", whiteSpace: "nowrap" }}>Sugestões da IA</span>
          </div>
        </div>

        {/* Invisible spacers — keep button aligned with Block 1 */}
        <div style={{ width: "0.5px", flexShrink: 0 }} />
        <div style={{ width: W2, flexShrink: 0 }} />
        <div style={{ width: "0.5px", flexShrink: 0 }} />
        <div style={{ width: W3, flexShrink: 0 }} />
        <div style={{ width: "0.5px", flexShrink: 0 }} />
        <div style={{ width: W4, flexShrink: 0 }} />
      </div>

    </div>
  );
}
