import { trpc } from "@/lib/trpc";
import { ContextPanel } from "@/components/ContextPanel";
import { useSelectedAccount } from "@/hooks/useSelectedAccount";
import { getClientByMetaAccountId, getIntegrationStatus } from "@/config/clientConfig";
import { RefreshCw, ChevronDown, ChevronUp, Check, Brain, Save, X } from "lucide-react";
import { useMemo, useState, useRef, useEffect, useLayoutEffect } from "react";
import { toast } from "sonner";
import { KPI_CONFIGS, getDayStatus, type GoalType } from "@/lib/kpiConfig";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toIsoLocal(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function buildTotals(t: any) {
  if (!t) return {};
  const spend = Number(t.spend ?? 0);
  const clicks = Number(t.clicks ?? 0);
  const impressions = Number(t.impressions ?? 0);
  return {
    ...t,
    spend,
    clicks,
    impressions,
    conversions: Number(t.conversions ?? 0),
    conversionValue: Number(t.conversionValue ?? 0),
    roas: Number(t.roas ?? 0),
    cpa: Number(t.cpa ?? 0),
    ctr: Number(t.ctr ?? 0),
    reach: Number(t.reach ?? 0),
    cpc: clicks > 0 ? spend / clicks : 0,
    cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
    frequency: 0,
  };
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
  <p style={{ fontSize: 9, fontWeight: 700, color: "rgba(0,0,0,0.3)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>
    {text}
  </p>
);

// ─── Component ────────────────────────────────────────────────────────────────

export function AccountHeader({
  goalLabel,
  goalEmoji,
  goalType = "DEFAULT",
}: {
  goalLabel?: string;
  goalEmoji?: string;
  goalType?: GoalType;
}) {
  const { selectedAccountId, accounts } = useSelectedAccount();
  const utils = trpc.useUtils();

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

  const savedNote = (activeAccount as any)?.accountNote as string | null ?? "";

  function parseTags(raw: string | null): string[] {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return raw.trim() ? [raw.trim()] : [];
    }
  }

  const [tags, setTags] = useState<string[]>(() => parseTags(savedNote));
  const [tagInput, setTagInput] = useState("");
  const [hoveredTag, setHoveredTag] = useState<number | null>(null);
  const tagInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { setTags(parseTags(savedNote)); }, [savedNote]);

  const updateNote = trpc.accounts.updateNote.useMutation({
    onSuccess: () => { utils.accounts.list.invalidate(); },
    onError: () => toast.error("Erro ao salvar nota"),
  });

  function commitTag() {
    const val = tagInput.trim();
    if (!val) return;
    const next = [...tags, val];
    setTags(next);
    setTagInput("");
    updateNote.mutate({ accountId: selectedAccountId!, note: JSON.stringify(next) });
  }

  function removeTag(idx: number) {
    const next = tags.filter((_, i) => i !== idx);
    setTags(next);
    setHoveredTag(null);
    updateNote.mutate({ accountId: selectedAccountId!, note: JSON.stringify(next) });
  }

  const refreshStatus = trpc.accounts.refreshStatus.useMutation({
    onSuccess: () => { utils.accounts.list.invalidate(); toast.success("Status IA atualizado"); },
    onError:   () => toast.error("Erro ao atualizar status IA"),
  });

  const sync = trpc.accounts.sync.useMutation({
    onSuccess: () => {
      utils.dashboard.overview.invalidate();
      utils.campaigns.performance.invalidate();
      toast.success("Sincronização concluída");
    },
    onError: () => toast.error("Erro ao sincronizar"),
  });

  // Summary overflow detection
  const summaryRef = useRef<HTMLParagraphElement>(null);
  const [summaryOverflows, setSummaryOverflows] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // ─── Context panel state ────────────────────────────────────────────────
  const [contextOpen, setContextOpen] = useState(false);
  const [ctxProfile, setCtxProfile] = useState("");
  const [ctxRules, setCtxRules] = useState("");
  const [ctxLearnings, setCtxLearnings] = useState("");
  const [ctxSaving, setCtxSaving] = useState(false);

  const { data: accountCtx } = trpc.context.getAccount.useQuery(
    { accountId: selectedAccountId! },
    { enabled: !!selectedAccountId, staleTime: 30_000 }
  );

  useEffect(() => {
    if (accountCtx) {
      setCtxProfile(accountCtx.clientProfile ?? "");
      setCtxRules(accountCtx.operationalRules ?? "");
      setCtxLearnings(accountCtx.learnings ?? "");
    }
  }, [accountCtx]);

  const upsertContext = trpc.context.upsertAccount.useMutation({
    onSuccess: () => { toast.success("Contexto salvo"); setCtxSaving(false); },
    onError: () => { toast.error("Erro ao salvar contexto"); setCtxSaving(false); },
  });

  function saveContext() {
    if (!selectedAccountId) return;
    setCtxSaving(true);
    upsertContext.mutate({
      accountId: selectedAccountId,
      clientProfile: ctxProfile,
      operationalRules: ctxRules,
      learnings: ctxLearnings,
    });
  }

  const rawAiSummary = (activeAccount as any)?.aiStatusSummary as string | null | undefined;

  useLayoutEffect(() => {
    const el = summaryRef.current;
    if (!el) return;
    setSummaryOverflows(el.scrollHeight > el.clientHeight + 2);
  }, [rawAiSummary, expanded]);

  if (!selectedAccountId || !activeAccount) return null;

  const rawAiColor = (activeAccount as any)?.aiStatusColor as "green" | "yellow" | "red" | null | undefined;
  const aiColor   = (rawAiColor ?? "yellow") as "green" | "yellow" | "red";
  const aiSummary: string = (activeAccount as any)?.aiStatusSummary
    ?? "Análise pendente — execute um sync para gerar";

  const accountName: string = (activeAccount as any).displayName ?? activeAccount.accountName ?? activeAccount.accountId;
  const initials  = (activeClient?.shortName ?? accountName.slice(0, 2)).toUpperCase();
  const palette   = ACCOUNT_COLORS[activeClient?.color ?? "fuchsia"] ?? ACCOUNT_COLORS.fuchsia!;
  const pictureUrl: string | null | undefined = (activeAccount as any).pictureUrl ?? activeClient?.pictureUrl;

  const STATE_BORDER: Record<"green" | "yellow" | "red", string> = {
    green:  "#639922",
    yellow: "#EF9F27",
    red:    "#E24B4A",
  };
  const block1BorderColor = rawAiColor ? STATE_BORDER[rawAiColor] : null;

  const statusCfg = aiColor ? STATUS_CFG[aiColor] : null;
  const muted = "rgba(0,0,0,0.4)";

  const kpiDefs = KPI_CONFIGS[goalType].slice(0, 4);
  const todayTotals = buildTotals(todayData?.totals);
  const yestTotals  = buildTotals(yestData?.totals);

  const CLAMP_HEIGHT = 72;

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "220px 1fr 1fr 1fr",
      background: "white",
      border: "1px solid rgba(0,0,0,0.08)",
      borderRadius: "12px",
      marginBottom: "16px",
      overflow: "hidden",
    }}>

      {/* ══ Block 1 — Identity ══════════════════════════════════════════════ */}
      <div style={{
        padding: "12px 16px",
        display: "flex",
        flexDirection: "column",
        borderRight: "1px solid rgba(0,0,0,0.06)",
        ...(block1BorderColor ? {
          borderLeft: `3px solid ${block1BorderColor}`,
          borderRadius: "12px 0 0 12px",
        } : {}),
      }}>

        {/* Avatar + name */}
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6, overflow: "hidden" }}>
          <div style={{
            width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
            background: palette.bg, color: palette.color,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
            overflow: "hidden",
          }}>
            {pictureUrl
              ? <img src={pictureUrl} alt={initials} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : initials}
          </div>
          <span style={{ fontSize: 12, fontWeight: 600, color: "#111", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {accountName}
          </span>
        </div>

        {/* Last sync info */}
        {(activeAccount as any)?.lastSyncAt && (() => {
          const syncDate = new Date((activeAccount as any).lastSyncAt);
          const now = new Date();
          const diffMs = now.getTime() - syncDate.getTime();
          const diffMin = Math.floor(diffMs / 60000);
          const diffH = Math.floor(diffMs / 3600000);
          const diffD = Math.floor(diffMs / 86400000);
          const label = diffMin < 60
            ? `sync há ${diffMin}min`
            : diffH < 24
              ? `sync há ${diffH}h`
              : `sync ${syncDate.getDate().toString().padStart(2,"0")}/${(syncDate.getMonth()+1).toString().padStart(2,"0")}`;
          const isStale = diffH >= 25;
          return (
            <p style={{ fontSize: 10, color: isStale ? "#EF9F27" : "rgba(0,0,0,0.3)", marginBottom: 4, display: "flex", alignItems: "center", gap: 3 }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: isStale ? "#EF9F27" : "#1D9E75", display: "inline-block", flexShrink: 0 }} />
              {label}
            </p>
          );
        })()}
        {/* Goal badge */}
        {goalLabel && (
          <div style={{ marginBottom: 6 }}>
            <span style={{
              fontSize: 10, fontWeight: 500,
              padding: "2px 8px", borderRadius: 99,
              background: "rgba(232,91,168,0.1)", color: "#E85BA8",
              border: "1px solid rgba(232,91,168,0.25)",
              whiteSpace: "nowrap",
            }}>
              {goalEmoji} {goalLabel}
            </span>
          </div>
        )}

        {/* Platform pills */}
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 6 }}>
          <span style={{
            fontSize: 10, fontWeight: 500, color: "#1D9E75",
            padding: "1px 7px", borderRadius: 99,
            background: "rgba(29,158,117,0.1)", border: "1px solid rgba(29,158,117,0.25)",
          }}>
            ● Meta Ads
          </span>
          <span style={{
            fontSize: 10, fontWeight: 500,
            color: integrations?.ga4 ? "#60a5fa" : muted,
            opacity: integrations?.ga4 ? 1 : 0.45,
            padding: "1px 7px", borderRadius: 99,
            background: integrations?.ga4 ? "rgba(96,165,250,0.1)" : "rgba(0,0,0,0.04)",
            border: `1px solid ${integrations?.ga4 ? "rgba(96,165,250,0.25)" : "rgba(0,0,0,0.1)"}`,
          }}>
            {integrations?.ga4 ? "●" : "○"} GA4
          </span>
          <span style={{
            fontSize: 10, fontWeight: 500,
            color: integrations?.googleAds ? "#fbbf24" : muted,
            opacity: integrations?.googleAds ? 1 : 0.45,
            padding: "1px 7px", borderRadius: 99,
            background: integrations?.googleAds ? "rgba(251,191,36,0.1)" : "rgba(0,0,0,0.04)",
            border: `1px solid ${integrations?.googleAds ? "rgba(251,191,36,0.25)" : "rgba(0,0,0,0.1)"}`,
          }}>
            {integrations?.googleAds ? "●" : "○"} Google Ads
          </span>
        </div>

        {/* Contexto button */}
        <div style={{ marginBottom: 6 }}>
          <button
            onClick={() => setContextOpen(v => !v)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              fontSize: 10, fontWeight: 500,
              padding: "2px 8px", borderRadius: 99,
              background: contextOpen ? "rgba(232,91,168,0.12)" : "rgba(0,0,0,0.04)",
              border: contextOpen ? "1px solid rgba(232,91,168,0.35)" : "1px solid rgba(0,0,0,0.12)",
              color: contextOpen ? "#E85BA8" : "rgba(0,0,0,0.4)",
              cursor: "pointer",
            }}
          >
            <Brain style={{ width: 10, height: 10 }} />
            Contexto
          </button>
        </div>

        {/* Sync button — fills remaining height */}
        <div style={{ flex: 1, display: "flex", alignItems: "flex-end" }}>
          <button
            onClick={() => sync.mutate({ accountId: selectedAccountId, days: 30 })}
            disabled={sync.isPending}
            style={{
              width: "100%",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              background: "#E85BA8", borderRadius: 8, padding: "7px 12px",
              cursor: sync.isPending ? "not-allowed" : "pointer",
              border: "none", opacity: sync.isPending ? 0.75 : 1,
              transition: "opacity 0.15s",
            }}
            onMouseEnter={(e) => { if (!sync.isPending) e.currentTarget.style.opacity = "0.88"; }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = sync.isPending ? "0.75" : "1"; }}
          >
            <RefreshCw style={{ width: 13, height: 13, color: "white", flexShrink: 0, animation: sync.isPending ? "spin 1s linear infinite" : undefined }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: "white", whiteSpace: "nowrap" }}>
              {sync.isPending ? "Sincronizando..." : "Sincronizar"}
            </span>
          </button>
        </div>
      </div>

      {/* ══ Block 2 — Resultados (Hoje / Ontem) ═════════════════════════════ */}
      <div style={{ padding: "12px 16px", borderRight: "1px solid rgba(0,0,0,0.06)" }}>
        {blockLabel("Resultados")}

        {[
          { period: "Hoje",  totals: todayTotals, color: "#E85BA8" },
          { period: "Ontem", totals: yestTotals,  color: muted     },
        ].map(({ period, totals, color }, i) => {
          const tag = getDayStatus(goalType, totals);
          return (
          <div key={period} style={{ marginBottom: i === 0 ? 10 : 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 3 }}>
              <span style={{ fontSize: 10, fontWeight: 600, color }}>
                {period}
              </span>
              {tag && (
                <span style={{
                  fontSize: 9, fontWeight: 600, lineHeight: 1,
                  padding: "2px 6px", borderRadius: 99,
                  background: tag.bg, color: tag.color,
                  border: `1px solid ${tag.border}`,
                  whiteSpace: "nowrap",
                }}>
                  {tag.label}
                </span>
              )}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0 6px" }}>
              {kpiDefs.map((kpi) => (
                <div key={kpi.key}>
                  <div style={{
                    fontSize: 9, color: muted, fontWeight: 500,
                    textTransform: "uppercase", letterSpacing: 0.4,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    marginBottom: 1,
                  }}>
                    {kpi.label}
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#111", whiteSpace: "nowrap" }}>
                    {kpi.format(totals)}
                  </div>
                </div>
              ))}
            </div>
          </div>
          );
        })}
      </div>

      {/* ══ Block 3 — Resumo Geral ═══════════════════════════════════════════ */}
      <div style={{ padding: "12px 16px", borderRight: "1px solid rgba(0,0,0,0.06)" }}>
        {blockLabel("Resumo Geral")}
        <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
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
        <p
          ref={summaryRef}
          style={{
            fontSize: 11, lineHeight: 1.45, color: muted,
            overflow: "hidden",
            maxHeight: expanded ? "none" : CLAMP_HEIGHT,
            transition: "max-height 0.2s ease",
          }}
        >
          {aiSummary}
        </p>
        {summaryOverflows && (
          <button
            onClick={() => setExpanded(v => !v)}
            style={{ display: "flex", alignItems: "center", gap: 2, marginTop: 3, background: "none", border: "none", padding: 0, cursor: "pointer", color: muted, opacity: 0.5, fontSize: 10, transition: "opacity 0.2s ease" }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.9")}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.5")}
          >
            {expanded ? <ChevronUp style={{ width: 10, height: 10 }} /> : <ChevronDown style={{ width: 10, height: 10 }} />}
          </button>
        )}
      </div>

      {/* ══ Block 4 — Notas (tags) + Contexto ══════════════════════════ */}
      <div style={{ padding: "12px 16px" }}>
        {blockLabel("Notas")}

        {/* Tag pills */}
        {tags.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
            {tags.map((tag, idx) => (
              <span
                key={idx}
                onMouseEnter={() => setHoveredTag(idx)}
                onMouseLeave={() => setHoveredTag(null)}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  fontSize: 11, fontWeight: 500, color: "#333",
                  padding: "2px 8px", borderRadius: 99,
                  background: "rgba(0,0,0,0.04)",
                  border: "0.5px solid rgba(0,0,0,0.18)",
                  userSelect: "none",
                }}
              >
                {tag}
                {hoveredTag === idx && (
                  <button
                    onClick={() => removeTag(idx)}
                    title="Concluir"
                    style={{
                      background: "none", border: "none", padding: 0,
                      cursor: "pointer", color: "#1D9E75",
                      display: "flex", alignItems: "center",
                      marginLeft: 1,
                    }}
                  >
                    <Check style={{ width: 10, height: 10 }} />
                  </button>
                )}
              </span>
            ))}
          </div>
        )}

        {/* Input */}
        <input
          ref={tagInputRef}
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              commitTag();
            }
          }}
          placeholder="Adicionar nota..."
          style={{
            width: "100%", fontSize: 11, lineHeight: 1.4,
            padding: "2px 0", background: "none",
            border: "none", borderBottom: tagInput ? "1px solid rgba(232,91,168,0.35)" : "1px solid transparent",
            outline: "none", fontFamily: "inherit", color: "#111",
            transition: "border-color 0.15s",
          }}
          onFocus={(e) => (e.currentTarget.style.borderBottomColor = "rgba(232,91,168,0.35)")}
          onBlur={(e) => {
            e.currentTarget.style.borderBottomColor = "transparent";
            commitTag();
          }}
        />
      </div>

      {/* ══ Painel de Contexto (inline, expande abaixo) ══════════════════ */}
      {contextOpen && selectedAccountId && (
        <div style={{ gridColumn: "1 / -1" }}>
          <ContextPanel accountId={selectedAccountId} onClose={() => setContextOpen(false)} />
        </div>
      )}
    </div>
  );
}
