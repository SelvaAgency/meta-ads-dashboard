import { trpc } from "@/lib/trpc";
import { useSelectedAccount } from "@/hooks/useSelectedAccount";
import { getClientByMetaAccountId, getIntegrationStatus } from "@/config/clientConfig";
import { RefreshCw, ChevronDown, ChevronUp, Pencil, Check, X, Lightbulb } from "lucide-react";
import { useMemo, useState, useRef, useEffect } from "react";
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

const blockLabel = (text: string) => (
  <p style={{ fontSize: 9, fontWeight: 700, color: "rgba(0,0,0,0.28)", textTransform: "uppercase", letterSpacing: 0.9, marginBottom: 5 }}>
    {text}
  </p>
);

const vDivider = (
  <div style={{ width: "0.5px", background: "rgba(0,0,0,0.07)", flexShrink: 0, alignSelf: "stretch" }} />
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
  const [expanded, setExpanded] = useState(false);

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

  const aiColor   = (activeAccount as any).aiStatusColor as "green" | "yellow" | "red" | null ?? null;
  const aiSummary = (activeAccount as any).aiStatusSummary as string | null;
  const statusCfg = aiColor ? STATUS_CFG[aiColor] : null;

  const sep  = <span style={{ opacity: 0.3, margin: "0 3px" }}>·</span>;
  const pipe = <span style={{ opacity: 0.2, margin: "0 6px" }}>|</span>;
  const muted = "rgba(0,0,0,0.4)";

  return (
    <div style={{
      background: "white",
      border: "1px solid rgba(0,0,0,0.08)",
      borderRadius: "12px",
      padding: "14px 16px",
      marginBottom: "16px",
      display: "flex",
      alignItems: "stretch",
      gap: 16,
    }}>

      {/* ══ Left column — identity + suggestions button ═════════════════ */}
      <div style={{ width: 260, flexShrink: 0, display: "flex", flexDirection: "column", gap: 10 }}>

        {/* Identity */}
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 7, whiteSpace: "nowrap", overflow: "hidden" }}>
            <div style={{
              width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
              background: palette.bg, color: palette.color,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
            }}>
              {initials}
            </div>
            <span style={{ fontSize: 13, fontWeight: 500, color: "#111", overflow: "hidden", textOverflow: "ellipsis" }}>
              {accountName}
            </span>
            {goalLabel && (
              <span style={{
                fontSize: 10, fontWeight: 500, flexShrink: 0,
                padding: "2px 7px", borderRadius: 99,
                background: "rgba(232,91,168,0.1)", color: "#E85BA8",
                border: "1px solid rgba(232,91,168,0.25)",
              }}>
                {goalEmoji} {goalLabel}
              </span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 4, whiteSpace: "nowrap", overflow: "hidden" }}>
            <span style={{ fontSize: 10, fontWeight: 500, color: "#1D9E75", opacity: 0.85 }}>● Meta Ads</span>
            <span style={{ fontSize: 10, fontWeight: 500, color: integrations?.ga4 ? "#60a5fa" : muted, opacity: integrations?.ga4 ? 0.85 : 0.4 }}>
              {integrations?.ga4 ? "●" : "○"} GA4
            </span>
            <span style={{ fontSize: 10, fontWeight: 500, color: integrations?.googleAds ? "#fbbf24" : muted, opacity: integrations?.googleAds ? 0.85 : 0.4 }}>
              {integrations?.googleAds ? "●" : "○"} Google Ads
            </span>
          </div>
          <div style={{ marginTop: 4, fontSize: 12, color: muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            <span style={{ color: "#E85BA8", fontWeight: 500 }}>Hoje</span>
            {sep}{fmt(todaySpend)}{sep}{fmtN(todayConv)} result.
            {todayRoas > 0 && <>{sep}{todayRoas.toFixed(2)}x</>}
            {pipe}
            <span style={{ fontWeight: 500 }}>Ontem</span>
            {sep}{fmt(yestSpend)}{sep}{fmtN(yestConv)} result.
            {yestRoas > 0 && <>{sep}{yestRoas.toFixed(2)}x</>}
          </div>
        </div>

        {/* Sugestões button — fills remaining height */}
        <div
          onClick={() => navigate("/suggestions")}
          style={{
            flex: 1,
            background: "#F97316",
            borderRadius: 9,
            cursor: "pointer",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 5,
            transition: "opacity 0.15s",
            minHeight: 52,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.88")}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
          title="Ver sugestões da IA"
        >
          <Lightbulb style={{ width: 16, height: 16, color: "white" }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: "white", textAlign: "center", lineHeight: 1.2 }}>
            Sugestões<br /><span style={{ fontSize: 10, fontWeight: 400, opacity: 0.85 }}>da IA</span>
          </span>
        </div>

      </div>

      {/* Divider between left and right */}
      {vDivider}

      {/* ══ Right column — three sub-blocks ════════════════════════════ */}
      <div style={{ flex: 1, display: "flex", alignItems: "stretch", gap: 0, minWidth: 0 }}>

        {/* Sub-block A — Últimas Ações */}
        <div style={{ flex: 1, padding: "0 14px 0 0", minWidth: 0 }}>
          {blockLabel("Últimas Ações")}
          {lastApplied.length === 0 ? (
            <p style={{ fontSize: 11, color: muted, opacity: 0.55 }}>Nenhuma ação registrada</p>
          ) : (
            lastApplied.map((s: any) => (
              <div key={s.id} style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 4 }}>
                <span style={{ fontSize: 11, color: "#111", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                  {s.title}
                </span>
                <span style={{ fontSize: 10, color: muted, flexShrink: 0 }}>{fmtDateShort(s.appliedAt)}</span>
              </div>
            ))
          )}
        </div>

        {vDivider}

        {/* Sub-block B — Resumo Geral */}
        <div style={{ flex: 1, padding: "0 14px", minWidth: 0 }}>
          {blockLabel("Resumo Geral")}
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", flexShrink: 0, background: statusCfg?.color ?? "rgba(0,0,0,0.18)" }} />
            <span style={{ fontSize: 11, fontWeight: 500, color: statusCfg?.color ?? muted, flex: 1 }}>
              {statusCfg?.label ?? "Status IA"} — 7 dias
            </span>
            <button
              onClick={() => refreshStatus.mutate({ accountId: selectedAccountId })}
              disabled={refreshStatus.isPending}
              title="Atualizar análise IA"
              style={{ background: "none", border: "none", cursor: "pointer", padding: 2, color: muted, opacity: 0.45, transition: "opacity 0.15s" }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.45")}
            >
              <RefreshCw style={{ width: 10, height: 10, animation: refreshStatus.isPending ? "spin 1s linear infinite" : undefined }} />
            </button>
          </div>
          {/* Summary — no forced truncation, uses available space */}
          <p style={{ fontSize: 11, lineHeight: 1.5, color: muted, ...(expanded ? {} : { display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }) }}>
            {aiSummary ?? "Análise pendente — execute um sync"}
          </p>
          {aiSummary && (
            <button
              onClick={() => setExpanded(v => !v)}
              style={{ display: "flex", alignItems: "center", gap: 2, marginTop: 3, background: "none", border: "none", padding: 0, cursor: "pointer", color: muted, opacity: 0.45, fontSize: 10, transition: "opacity 0.15s" }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.9")}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.45")}
            >
              {expanded ? <ChevronUp style={{ width: 10, height: 10 }} /> : <ChevronDown style={{ width: 10, height: 10 }} />}
            </button>
          )}
        </div>

        {vDivider}

        {/* Sub-block C — Nota */}
        <div style={{ flex: 1, padding: "0 0 0 14px", minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 5 }}>
            {blockLabel("Nota")}
            <div style={{ flex: 1 }} />
            {editing ? (
              <div style={{ display: "flex", gap: 3 }}>
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
                style={{ background: "none", border: "none", cursor: "pointer", padding: 1, color: muted, opacity: 0.45 }} title="Editar nota">
                <Pencil style={{ width: 10, height: 10 }} />
              </button>
            )}
          </div>
          {editing ? (
            <textarea
              ref={textareaRef}
              value={noteValue}
              onChange={(e) => setNoteValue(e.target.value)}
              rows={3}
              style={{ width: "100%", fontSize: 11, lineHeight: 1.4, padding: "4px 7px", borderRadius: 6, border: "1px solid rgba(232,91,168,0.4)", resize: "none", outline: "none", fontFamily: "inherit", color: "#111" }}
              placeholder="Adicionar nota..."
            />
          ) : (
            <p style={{ fontSize: 11, color: noteValue ? "#111" : muted, lineHeight: 1.5, cursor: "text", opacity: noteValue ? 1 : 0.45 }} onClick={() => setEditing(true)}>
              {noteValue || "Adicionar nota..."}
            </p>
          )}
        </div>

      </div>
    </div>
  );
}
