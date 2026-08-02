import { trpc } from "@/lib/trpc";
import { ContextPanel } from "@/components/ContextPanel";
import { useSelectedAccount } from "@/hooks/useSelectedAccount";
import { getClientByMetaAccountId } from "@/config/clientConfig";
import { RefreshCw, ChevronDown, ChevronUp, Check, Brain, Eye, CheckCircle2 } from "lucide-react";
import { ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, Tooltip } from "recharts";
import { useMemo, useState, useRef, useEffect, useLayoutEffect } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { KPI_CONFIGS, getDayStatus, type GoalType } from "@/lib/kpiConfig";
import { type Fonte, type StatusFonte, type ChaveFonte } from "@shared/fontes";
import { useAuth } from "@/_core/hooks/useAuth";
import { canManageContent } from "@shared/permissions";

/**
 * Cores por status. Antes o chip "Meta Ads" era a string fixa "● Meta Ads" —
 * verde mesmo na ARKA, sete semanas sem sincronizar. Verde só quando é verdade.
 */
/**
 * A F1 mantém os MESMOS três chips de antes — só que dizendo a verdade. As
 * outras três fontes (Clarity, PageSpeed, Site) já vêm do resolvedor e entram
 * na faixa de fontes da F2; criar seis chips agora seria mudança de layout.
 */
const CHIPS_NO_HEADER: ChaveFonte[] = ["meta", "google_ads", "ga4"];

const CORES_FONTE: Record<StatusFonte, { cor: string; fundo: string; borda: string; op: number; marca: string }> = {
  ok:      { cor: "#1D9E75", fundo: "rgba(29,158,117,0.1)",  borda: "rgba(29,158,117,0.25)",  op: 1,    marca: "●" },
  atencao: { cor: "#B97D10", fundo: "rgba(239,159,39,0.12)", borda: "rgba(239,159,39,0.3)",   op: 1,    marca: "▲" },
  erro:    { cor: "#C0312F", fundo: "rgba(226,75,74,0.12)",  borda: "rgba(226,75,74,0.3)",    op: 1,    marca: "▲" },
  ausente: { cor: "#8a8a8a", fundo: "rgba(0,0,0,0.04)",      borda: "rgba(0,0,0,0.1)",        op: 0.45, marca: "○" },
};

/** Pastilha de fonte. `title` carrega o motivo — discreto, sem virar card. */
function ChipFonte({ fonte }: { fonte: Fonte }) {
  const c = CORES_FONTE[fonte.status];
  const alerta = fonte.status === "atencao" || fonte.status === "erro";
  return (
    <span
      title={fonte.porque ? `${fonte.rotulo}${alerta ? " · atenção" : ""}\n${fonte.porque}` : fonte.rotulo}
      style={{
        fontSize: 10, fontWeight: 500, color: c.cor, opacity: c.op,
        padding: "1px 7px", borderRadius: 99, background: c.fundo,
        border: `1px solid ${c.borda}`, whiteSpace: "nowrap",
        cursor: fonte.porque ? "help" : "default",
      }}
    >
      {c.marca} {fonte.rotulo}
    </span>
  );
}

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

/** Soma Google Ads (mesmo dia) ao total Meta e recalcula as taxas do combinado.
 *  Sem Google Ads (g nulo) devolve o total Meta intacto. Alcance fica só do Meta. */
type GAdsDia = { spend: number; clicks: number; impressions: number; conversions: number; conversionValue: number };
function mergeGAds(t: any, g: GAdsDia | null | undefined) {
  if (!g) return t;
  const spend           = Number(t.spend ?? 0) + g.spend;
  const clicks          = Number(t.clicks ?? 0) + g.clicks;
  const impressions     = Number(t.impressions ?? 0) + g.impressions;
  const conversions     = Number(t.conversions ?? 0) + g.conversions;
  const conversionValue = Number(t.conversionValue ?? 0) + g.conversionValue;
  return {
    ...t, spend, clicks, impressions, conversions, conversionValue,
    roas: spend > 0 ? conversionValue / spend : 0,
    cpa:  conversions > 0 ? spend / conversions : 0,
    ctr:  impressions > 0 ? (clicks / impressions) * 100 : 0,
    cpc:  clicks > 0 ? spend / clicks : 0,
    cpm:  impressions > 0 ? (spend / impressions) * 1000 : 0,
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


function daysLeft(date: Date | string | null): number | null {
  if (!date) return null;
  return Math.ceil((new Date(date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

const CATEGORY_COLORS: Record<string, string> = {
  PAUSAR_CRIATIVO:    "#f87171",
  PAUSAR_CONJUNTO:    "#fb923c",
  NOVO_PUBLICO:       "#c084fc",
  REALOCAR_ORCAMENTO: "#60a5fa",
  NOVO_CRIATIVO:      "#facc15",
  NOVO_CONJUNTO:      "#34d399",
  GENERAL:            "#E85BA8",
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

/** Tooltip do mini-gráfico do header: Investimento em R$, Resultado como número. */
function HeaderChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const fmt = (name: string, v: number) => name === "Investimento"
    ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v)
    : Number(v).toLocaleString("pt-BR");
  return (
    <div className="bg-popover border border-border rounded-lg p-2 shadow-xl text-xs">
      <p className="text-muted-foreground mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} className="font-medium text-foreground">{p.name}: {fmt(p.name, p.value)}</p>
      ))}
    </div>
  );
}

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
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  const activeAccount = useMemo(
    () => accounts?.find((a: any) => a.id === selectedAccountId),
    [accounts, selectedAccountId]
  );
  const activeClient = useMemo(
    () => activeAccount ? getClientByMetaAccountId(activeAccount.accountId) : null,
    [activeAccount]
  );

  const today     = toIsoLocal(new Date());
  const yesterday = toIsoLocal(new Date(Date.now() - 86_400_000));
  const trintaAtras = toIsoLocal(new Date(Date.now() - 29 * 86_400_000));

  const { data: todayData } = trpc.dashboard.overview.useQuery(
    { accountId: selectedAccountId!, startDate: today, endDate: today },
    { enabled: !!selectedAccountId, staleTime: 60_000 }
  );
  const { data: yestData } = trpc.dashboard.overview.useQuery(
    { accountId: selectedAccountId!, startDate: yesterday, endDate: yesterday },
    { enabled: !!selectedAccountId, staleTime: 60_000 }
  );
  // Série de 30 dias (investimento + resultado) para contextualizar o resumo.
  const { data: serie30Data } = trpc.dashboard.overview.useQuery(
    { accountId: selectedAccountId!, startDate: trintaAtras, endDate: today },
    { enabled: !!selectedAccountId, staleTime: 5 * 60_000 }
  );

  /**
   * Fontes do cliente, do banco. O `integrations` do clientConfig continua
   * existindo para identidade visual, mas não decide mais o que está conectado.
   */
  const { data: fontes } = trpc.fontes.doCliente.useQuery(
    { accountId: selectedAccountId! },
    { enabled: !!selectedAccountId },
  );

  // Verba unificada (Meta + Google Ads) no bloco Resultados — mesma ideia da Home.
  // Ao vivo, admin/dev (Google Ads é gated); se falhar/ausente, fica só Meta.
  const { user } = useAuth();
  const podeGAds = canManageContent(user?.role);
  const { data: gAdsDias } = trpc.googleAds.resumoDiasConta.useQuery(
    { accountId: selectedAccountId! },
    { enabled: !!selectedAccountId && podeGAds, staleTime: 5 * 60_000, refetchOnWindowFocus: false },
  );

  const { data: suggestions } = trpc.suggestions.list.useQuery(
    { accountId: selectedAccountId! },
    { enabled: !!selectedAccountId, staleTime: 5 * 60 * 1000 }
  );
  const { data: billingSummary } = trpc.accounts.billingSummary.useQuery(
    { accountId: selectedAccountId! },
    { enabled: !!selectedAccountId, staleTime: 30 * 60 * 1000 }
  );

  const monitoringItems = (suggestions ?? []).filter(
    (s: any) => s.status === "applied" && s.monitorUntil && (daysLeft(s.monitorUntil) ?? 0) > 0 && !s.monitorResult
  );

  const refreshStatus = trpc.accounts.refreshStatus.useMutation({
    onSuccess: () => { utils.accounts.list.invalidate(); toast.success("Status IA atualizado"); },
    onError:   () => toast.error("Erro ao atualizar status IA"),
  });

  const sync = trpc.accounts.sync.useMutation({
    onSuccess: () => {
      utils.dashboard.overview.invalidate();
      utils.campaigns.performance.invalidate();
      utils.accounts.list.invalidate(); // atualiza o "sync há Xmin" do AccountHeader
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
  // Contexto do resumo = contexto MANUAL do usuário (campo clientProfile). Persiste
  // e vale na reanálise (manual e noturna). O histórico automático (learnings) fica
  // só no backend, alimenta a IA e nunca aparece aqui.
  const [resumoCtxOpen, setResumoCtxOpen] = useState(false);
  const [resumoCtx, setResumoCtx] = useState("");
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

  // Contexto do usuário = campo clientProfile (manual). O `learnings` é histórico
  // AUTOMÁTICO do sistema (appendAccountLearning) — fica só no backend, alimenta a
  // IA, e NUNCA é exposto/editado aqui (preservamos ele intacto ao salvar).
  async function salvarContextoDoResumo() {
    if (!selectedAccountId) return;
    await upsertContext.mutateAsync({
      accountId: selectedAccountId,
      clientProfile: resumoCtx,
      operationalRules: accountCtx?.operationalRules ?? "",
      learnings: accountCtx?.learnings ?? "",
    });
    utils.context.getAccount.invalidate({ accountId: selectedAccountId });
    refreshStatus.mutate({ accountId: selectedAccountId });
  }

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
  const todayTotals = mergeGAds(buildTotals(todayData?.totals), gAdsDias?.hoje);
  const yestTotals  = mergeGAds(buildTotals(yestData?.totals), gAdsDias?.ontem);

  // Série 30d (investimento + resultado) para o gráfico do header.
  const serie30 = (((serie30Data as any)?.timeSeries ?? []) as any[]).map((d) => ({
    dia: String(d.date ?? "").slice(5).replace("-", "/"),
    Investimento: Math.round(Number(d.totalSpend ?? 0) * 100) / 100,
    Resultado: Math.round(Number(d.totalConversions ?? 0)),
  }));

  const CLAMP_HEIGHT = 96;

  // ── Linha de sync (dot + "sync há Xmin"), reaproveitada no header hero ──
  const syncLine = (activeAccount as any)?.lastSyncAt && (() => {
    const syncDate = new Date((activeAccount as any).lastSyncAt);
    const diffMs = Date.now() - syncDate.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffH = Math.floor(diffMs / 3600000);
    const label = diffMin < 60
      ? `sync há ${diffMin}min`
      : diffH < 24
        ? `sync há ${diffH}h`
        : `sync ${syncDate.getDate().toString().padStart(2, "0")}/${(syncDate.getMonth() + 1).toString().padStart(2, "0")}`;
    const isStale = diffH >= 25;
    return (
      <p className="text-[11px] flex items-center gap-1.5 mt-0.5" style={{ color: isStale ? "#EF9F27" : "rgba(0,0,0,0.4)" }}>
        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: isStale ? "#EF9F27" : "#1D9E75" }} />
        {label}
      </p>
    );
  })();

  const secLabel = (t: string) => (
    <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-2">{t}</p>
  );

  return (
    <div className="rounded-xl border border-border bg-card mb-4 overflow-hidden">

      {/* ══ Faixa de identidade ═════════════════════════════════════════════ */}
      <div className="flex items-start gap-3 p-4">
        {/* Avatar */}
        <div className="w-11 h-11 rounded-full flex-shrink-0 flex items-center justify-center overflow-hidden text-sm font-bold"
          style={{ background: palette.bg, color: palette.color, letterSpacing: 0.5 }}>
          {pictureUrl
            ? <img src={pictureUrl} alt={initials} className="w-full h-full object-cover" />
            : initials}
        </div>

        {/* Nome + goal + sync + fontes */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-lg font-extrabold text-foreground truncate leading-tight">{accountName}</h2>
            {goalLabel && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
                style={{ background: "rgba(232,91,168,0.1)", color: "#E85BA8", border: "1px solid rgba(232,91,168,0.25)" }}>
                {goalEmoji} {goalLabel}
              </span>
            )}
          </div>
          {syncLine}
          <div className="flex gap-1 flex-wrap mt-2">
            {(fontes ?? []).filter((f) => CHIPS_NO_HEADER.includes(f.chave)).map((f) => (
              <ChipFonte key={f.chave} fonte={f} />
            ))}
          </div>
        </div>

        {/* Ações */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => setContextOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border transition-colors"
            style={contextOpen
              ? { background: "rgba(232,91,168,0.12)", borderColor: "rgba(232,91,168,0.35)", color: "#E85BA8" }
              : { background: "transparent", borderColor: "rgba(0,0,0,0.12)", color: "rgba(0,0,0,0.5)" }}
          >
            <Brain className="w-3.5 h-3.5" /> Contexto
          </button>
          <button
            onClick={() => sync.mutate({ accountId: selectedAccountId, days: 30 })}
            disabled={sync.isPending}
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2 rounded-lg text-white transition-opacity"
            style={{ background: "#E85BA8", opacity: sync.isPending ? 0.75 : 1, cursor: sync.isPending ? "not-allowed" : "pointer" }}
          >
            <RefreshCw className="w-3.5 h-3.5" style={{ animation: sync.isPending ? "spin 1s linear infinite" : undefined }} />
            {sync.isPending ? "Sincronizando..." : "Sincronizar"}
          </button>
        </div>
      </div>

      {/* ══ Corpo: Resumo da IA + Resultados ════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 px-4 pb-4">

        {/* ── Resumo da IA (destaque, borda-status à esquerda) ── */}
        <div className="rounded-xl border border-border bg-background/30 p-4 flex flex-col"
          style={block1BorderColor ? { borderLeft: `3px solid ${block1BorderColor}` } : {}}>
          <div className="flex items-center gap-2 mb-2.5">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: statusCfg?.color ?? "rgba(0,0,0,0.2)" }} />
            <span className="text-sm font-bold flex-1" style={{ color: statusCfg?.color ?? muted }}>
              {statusCfg?.label ?? "Status IA"} <span className="font-medium opacity-70">— 7 dias</span>
            </span>
            <button
              onClick={() => { if (!resumoCtxOpen) setResumoCtx(accountCtx?.clientProfile ?? ""); setResumoCtxOpen((v) => !v); }}
              title="Adicionar contexto e reanalisar"
              className="p-1.5 rounded-md hover:bg-black/5 transition-colors"
              style={{ color: resumoCtxOpen ? "#E85BA8" : muted }}
            >
              <Brain className="w-4 h-4" />
            </button>
            <button
              onClick={() => refreshStatus.mutate({ accountId: selectedAccountId })}
              disabled={refreshStatus.isPending}
              title="Reanalisar (usa o contexto salvo)"
              className="p-1.5 rounded-md hover:bg-black/5 transition-colors"
              style={{ color: muted }}
            >
              <RefreshCw className="w-3.5 h-3.5" style={{ animation: refreshStatus.isPending ? "spin 1s linear infinite" : undefined }} />
            </button>
          </div>

          {resumoCtxOpen && (() => {
            const salvando = refreshStatus.isPending || upsertContext.isPending;
            return (
              <div className="mb-3">
                <textarea
                  value={resumoCtx}
                  onChange={(e) => setResumoCtx(e.target.value)}
                  placeholder="Contexto que a IA deve considerar (ex.: sazonalidade, campanha de lançamento, verba reduzida, regra do cliente)…"
                  rows={3}
                  className="w-full text-xs leading-snug px-2.5 py-2 rounded-lg border border-border bg-background resize-y outline-none focus:ring-1 focus:ring-primary"
                />
                <button
                  onClick={salvarContextoDoResumo}
                  disabled={salvando}
                  className="mt-2 text-xs font-semibold px-3 py-1.5 rounded-lg text-white disabled:opacity-60"
                  style={{ background: salvando ? "rgba(0,0,0,0.2)" : "#E85BA8" }}
                >
                  {salvando ? "Salvando…" : "Salvar e reanalisar"}
                </button>
                <p className="text-[10px] text-muted-foreground mt-1.5">Fica salvo e vale também na reanálise automática noturna.</p>
              </div>
            );
          })()}

          <p ref={summaryRef} className="text-[12px] leading-normal text-foreground/70 overflow-hidden"
            style={{ maxHeight: expanded ? "none" : CLAMP_HEIGHT, transition: "max-height 0.2s ease" }}>
            {aiSummary}
          </p>
          {summaryOverflows && (
            <button onClick={() => setExpanded((v) => !v)} className="flex items-center gap-1 mt-1.5 text-xs font-medium text-muted-foreground/70 hover:text-foreground transition-colors">
              {expanded ? <>Ver menos <ChevronUp className="w-3.5 h-3.5" /></> : <>Ver mais <ChevronDown className="w-3.5 h-3.5" /></>}
            </button>
          )}
        </div>

        {/* ── Resultados (Hoje / Ontem) + faturamento ── */}
        <div className="rounded-xl border border-border bg-background/30 p-4">
          <p className="text-sm font-bold text-foreground mb-3">Resultados</p>
          {[
            { period: "Hoje", totals: todayTotals, color: "#E85BA8" },
            { period: "Ontem", totals: yestTotals, color: muted },
          ].map(({ period, totals, color }, i) => {
            const tag = getDayStatus(goalType, totals);
            return (
              <div key={period} className={i === 0 ? "mb-3 pb-3 border-b border-border/50" : ""}>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className="text-xs font-bold uppercase tracking-wide" style={{ color }}>{period}</span>
                  {tag && (
                    <span className="text-[9px] font-bold leading-none px-1.5 py-0.5 rounded-full whitespace-nowrap"
                      style={{ background: tag.bg, color: tag.color, border: `1px solid ${tag.border}` }}>
                      {tag.label}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-4 gap-x-2">
                  {kpiDefs.map((kpi) => (
                    <div key={kpi.key}>
                      <div className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground truncate mb-0.5">{kpi.label}</div>
                      <div className="text-lg font-extrabold text-foreground leading-tight whitespace-nowrap tabular-nums">{kpi.format(totals)}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {billingSummary && (
            <div className="mt-3 pt-2.5 border-t border-border/60">
              {!billingSummary.isPrePaid ? (
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: "#16a34a" }} />
                  <span className="text-[11px] font-semibold" style={{ color: "#16a34a" }}>Cartao de credito - OK</span>
                </div>
              ) : (() => {
                const balance = billingSummary.remainingBalance ?? 0;
                const days = billingSummary.daysRemaining;
                const low = days !== null && days <= 7;
                const color = low ? "#dc2626" : "#16a34a";
                const currency = billingSummary.currency ?? "BRL";
                const fmtMoney = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(v);
                return (
                  <div>
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color }} />
                      <span className="text-[11px] font-semibold" style={{ color }}>Saldo: {fmtMoney(balance)}</span>
                      {low && (
                        <span className="text-[9px] font-bold leading-none px-1.5 py-0.5 rounded-full whitespace-nowrap"
                          style={{ background: "rgba(220,38,38,0.1)", color: "#dc2626", border: "1px solid rgba(220,38,38,0.3)" }}>
                          Recarregar
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {days !== null
                        ? `Projecao: ~${Math.floor(days)} dia${Math.floor(days) === 1 ? "" : "s"} restante${Math.floor(days) === 1 ? "" : "s"} (media 30d)`
                        : "Sem historico de gasto suficiente para projecao"}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>

        {/* ── Tendência 30d: Investimento (área) + Resultado (linha) ── */}
        <div className="rounded-xl border border-border bg-background/30 p-4 flex flex-col">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-bold text-foreground">Investimento × Resultado</p>
            <span className="text-[11px] text-muted-foreground">30 dias</span>
          </div>
          {serie30.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-[11px] text-muted-foreground py-6">Sem série no período.</div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={124}>
                <ComposedChart data={serie30} margin={{ top: 4, right: 2, left: 2, bottom: 0 }}>
                  <defs>
                    <linearGradient id="hdrInv" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#E85BA8" stopOpacity={0.22} />
                      <stop offset="95%" stopColor="#E85BA8" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="dia" tick={{ fontSize: 9, fill: "#9a9a9a" }} interval="preserveStartEnd" minTickGap={26} />
                  <YAxis yAxisId="inv" hide />
                  <YAxis yAxisId="res" orientation="right" hide />
                  <Tooltip content={<HeaderChartTooltip />} />
                  <Area yAxisId="inv" type="monotone" dataKey="Investimento" stroke="#E85BA8" strokeWidth={2} fill="url(#hdrInv)" />
                  <Line yAxisId="res" type="monotone" dataKey="Resultado" stroke="#1D9E75" strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
              <div className="flex items-center gap-3 mt-1.5">
                <span className="flex items-center gap-1 text-[10px] text-muted-foreground"><span className="w-2 h-2 rounded-sm" style={{ background: "#E85BA8" }} /> Investimento</span>
                <span className="flex items-center gap-1 text-[10px] text-muted-foreground"><span className="w-2 h-2 rounded-sm" style={{ background: "#1D9E75" }} /> Resultado</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ══ Painel de Contexto (inline, expande abaixo) ══════════════════ */}
      {contextOpen && selectedAccountId && (
        <div className="px-4 pb-4">
          <ContextPanel accountId={selectedAccountId} onClose={() => setContextOpen(false)} />
        </div>
      )}
    </div>
  );
}
