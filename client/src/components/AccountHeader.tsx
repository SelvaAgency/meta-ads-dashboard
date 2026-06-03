import { trpc } from "@/lib/trpc";
import { useSelectedAccount } from "@/hooks/useSelectedAccount";
import { getClientByMetaAccountId, getIntegrationStatus } from "@/config/clientConfig";
import { Button } from "@/components/ui/button";
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

const divider = (
  <div style={{ width: "0.5px", alignSelf: "stretch", background: "rgba(0,0,0,0.08)", flexShrink: 0 }} />
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

  // Last 2 applied suggestions
  const { data: suggestions } = trpc.suggestions.list.useQuery(
    { accountId: selectedAccountId! },
    { enabled: !!selectedAccountId, staleTime: 120_000 }
  );
  const lastApplied = useMemo(
    () => (suggestions ?? []).filter((s: any) => s.status === "applied").slice(0, 2),
    [suggestions]
  );

  // Account note editing
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

  // AI status + refresh
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

  const sep  = <span style={{ opacity: 0.3, margin: "0 4px" }}>·</span>;
  const pipe = <span style={{ opacity: 0.25, margin: "0 8px" }}>|</span>;

  const muted = "rgba(0,0,0,0.4)";

  return (
    <div style={{
      background: "white",
      border: "1px solid rgba(0,0,0,0.08)",
      borderRadius: "12px",
      padding: "12px 16px",
      marginBottom: "16px",
      display: "flex",
      alignItems: "center",
      gap: "16px",
    }}>

      {/* ── Bloco esquerdo — identidade + diário ────────────────────────── */}
      <div style={{ flex: 1, minWidth: 0 }}>

        {/* Linha 1 — identidade + integrações */}
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
          <span style={{ fontSize: 10, fontWeight: 500, flexShrink: 0, color: integrations?.ga4 ? "#60a5fa" : muted, opacity: integrations?.ga4 ? 0.85 : 0.5 }}>
            {integrations?.ga4 ? "●" : "○"} GA4
          </span>
          <span style={{ fontSize: 10, fontWeight: 500, flexShrink: 0, color: integrations?.googleAds ? "#fbbf24" : muted, opacity: integrations?.googleAds ? 0.85 : 0.5 }}>
            {integrations?.googleAds ? "●" : "○"} Google Ads
          </span>
        </div>

        {/* Linha 2 — resumo diário */}
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

      {divider}

      {/* ── Bloco 2 — Últimas ações + Nota ──────────────────────────────── */}
      <div style={{ width: 220, flexShrink: 0 }}>

        {/* Últimas ações */}
        <div style={{ marginBottom: 6 }}>
          <p style={{ fontSize: 10, fontWeight: 600, color: muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 }}>
            Últimas ações
          </p>
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

        {/* Nota da conta */}
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 2 }}>
            <p style={{ fontSize: 10, fontWeight: 600, color: muted, textTransform: "uppercase", letterSpacing: 0.5, flex: 1 }}>
              Nota
            </p>
            {editing ? (
              <div style={{ display: "flex", gap: 2 }}>
                <button
                  onClick={() => { updateNote.mutate({ accountId: selectedAccountId, note: noteValue }); }}
                  disabled={updateNote.isPending}
                  style={{ background: "none", border: "none", cursor: "pointer", padding: 1, color: "#1D9E75" }}
                  title="Salvar"
                >
                  <Check style={{ width: 11, height: 11 }} />
                </button>
                <button
                  onClick={() => { setNoteValue(savedNote); setEditing(false); }}
                  style={{ background: "none", border: "none", cursor: "pointer", padding: 1, color: muted }}
                  title="Cancelar"
                >
                  <X style={{ width: 11, height: 11 }} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setEditing(true)}
                style={{ background: "none", border: "none", cursor: "pointer", padding: 1, color: muted, opacity: 0.5 }}
                title="Editar nota"
              >
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
              style={{
                width: "100%", fontSize: 11, lineHeight: 1.4, padding: "3px 6px",
                borderRadius: 6, border: "1px solid rgba(232,91,168,0.4)",
                resize: "none", outline: "none", fontFamily: "inherit", color: "#111",
              }}
              placeholder="Adicionar nota..."
            />
          ) : (
            <p
              style={{ fontSize: 11, color: noteValue ? "#111" : muted, lineHeight: 1.4, cursor: "text", opacity: noteValue ? 1 : 0.5 }}
              onClick={() => setEditing(true)}
            >
              {noteValue || "Adicionar nota..."}
            </p>
          )}
        </div>

      </div>

      {divider}

      {/* ── Bloco 3 — Status IA ──────────────────────────────────────────── */}
      <div style={{ width: 220, flexShrink: 0 }}>

        <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 2 }}>
          <div style={{
            width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
            background: statusCfg?.color ?? "rgba(0,0,0,0.2)",
          }} />
          <span style={{ fontSize: 11, fontWeight: 500, color: statusCfg?.color ?? muted }}>
            {statusCfg?.label ?? "Status IA"} — 7 dias
          </span>
        </div>

        <div>
          <p style={{
            fontSize: 11, lineHeight: 1.4, color: muted,
            transition: "all 0.2s ease",
            ...(expanded ? {} : { display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }),
          }}>
            {aiSummary ?? "Análise pendente — execute um sync"}
          </p>
          <button
            onClick={() => setExpanded(v => !v)}
            style={{ display: "flex", alignItems: "center", gap: 2, marginTop: 2, background: "none", border: "none", padding: 0, cursor: "pointer", color: muted, opacity: 0.5, fontSize: 10, transition: "opacity 0.2s ease" }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.9")}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.5")}
          >
            {expanded ? <ChevronUp style={{ width: 10, height: 10 }} /> : <ChevronDown style={{ width: 10, height: 10 }} />}
          </button>
        </div>

      </div>

      {divider}

      {/* ── Bloco 4 — Botão Sugestões IA ─────────────────────────────────── */}
      <div style={{ width: 140, flexShrink: 0, position: "relative" }}>

        {/* Botão refresh — canto superior direito */}
        <button
          onClick={() => refreshStatus.mutate({ accountId: selectedAccountId })}
          disabled={refreshStatus.isPending}
          title="Atualizar análise IA"
          style={{
            position: "absolute", top: 0, right: 0,
            background: "none", border: "none", cursor: "pointer", padding: 2,
            color: "rgba(255,255,255,0.6)",
            transition: "color 0.15s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "white")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.6)")}
        >
          <RefreshCw style={{ width: 10, height: 10, animation: refreshStatus.isPending ? "spin 1s linear infinite" : undefined }} />
        </button>

        {/* Botão principal — navega para /suggestions */}
        <div
          onClick={() => navigate("/suggestions")}
          style={{
            background: "#E85BA8",
            borderRadius: 10,
            padding: "10px 12px",
            cursor: "pointer",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
            transition: "opacity 0.15s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.9")}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
          title="Ver sugestões da IA"
        >
          <Lightbulb style={{ width: 18, height: 18, color: "white" }} />
          <div style={{ textAlign: "center", lineHeight: 1.2 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: "white", margin: 0 }}>Sugestões</p>
            <p style={{ fontSize: 10, color: "rgba(255,255,255,0.8)", margin: 0 }}>da IA</p>
          </div>
        </div>

      </div>
    </div>
  );
}
