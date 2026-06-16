import { MetaDashboardLayout } from "@/components/MetaDashboardLayout";
import { useSelectedAccount } from "@/hooks/useSelectedAccount";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Search, Film, Image, LayoutGrid, ShoppingBag, Loader2, Link2, Zap, Calendar, ChevronDown, ChevronRight, Circle, ExternalLink } from "lucide-react";
import React, { useState, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

// ─── Formatters ───────────────────────────────────────────────────────────────
const fmtCurrency = (v: number | null | undefined) => {
  if (v == null || v === 0) return "—";
  return `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
const fmtNum = (v: number | null | undefined) => {
  if (v == null || v === 0) return "—";
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return v.toLocaleString("pt-BR");
};
const fmtPct = (v: number | null | undefined) => {
  if (v == null) return "—";
  return `${Number(v).toFixed(2)}%`;
};
const fmtFreq = (v: number | null | undefined) => {
  if (v == null || v === 0) return "—";
  return `${Number(v).toFixed(2)}x`;
};

function cleanResultLabel(label: string | undefined | null): string {
  if (!label) return "Resultados";
  const labelMap: Record<string, string> = {
    "AUTOMATIC_OBJECTIVE": "Resultados", "OFFSITE_CONVERSIONS": "Conversões",
    "ONSITE_CONVERSIONS": "Conversões", "VALUE": "Valor de conversão",
    "LEAD_GENERATION": "Leads", "QUALITY_LEAD": "Leads qualificados",
    "REPLIES": "Mensagens", "CONVERSATIONS": "Conversas",
    "LINK_CLICKS": "Cliques no link", "LANDING_PAGE_VIEWS": "Visualizações",
    "REACH": "Alcance", "IMPRESSIONS": "Impressões", "POST_ENGAGEMENT": "Engajamentos",
    "PAGE_LIKES": "Curtidas", "VIDEO_VIEWS": "Visualizações", "THRUPLAY": "ThruPlay",
    "APP_INSTALLS": "Instalações", "VISIT_INSTAGRAM_PROFILE": "Visitas ao perfil",
    "MESSAGES": "Mensagens",
  };
  const upper = label.toUpperCase().trim();
  if (labelMap[upper]) return labelMap[upper];
  if (/^[A-Z_]+$/.test(label.trim())) return "Resultados";
  return label;
}

// ─── Creative icon ────────────────────────────────────────────────────────────
function CreativeIcon({ type }: { type: string }) {
  switch (type) {
    case "VIDEO": return <Film size={13} style={{ color: "#7F77DD" }} />;
    case "CAROUSEL": return <LayoutGrid size={13} style={{ color: "#378ADD" }} />;
    case "CATALOG": return <ShoppingBag size={13} style={{ color: "#BA7517" }} />;
    default: return <Image size={13} style={{ color: "#1D9E75" }} />;
  }
}

// ─── Thumbnail ────────────────────────────────────────────────────────────────
function CreativeThumb({ url, type, creativeId, accountId }: { url?: string; type: string; creativeId?: string; accountId?: number }) {
  const [imgFailed, setImgFailed] = useState(false);
  const [proxyFailed, setProxyFailed] = useState(false);
  const proxyUrl = imgFailed && !proxyFailed && creativeId && accountId ? `/api/thumb/${creativeId}?accountId=${accountId}` : null;
  const imgSrc = proxyUrl || url;
  if (imgSrc && !(imgFailed && proxyFailed)) {
    return (
      <div style={{ width: 36, height: 36, borderRadius: 6, border: "0.5px solid var(--color-border-tertiary)", overflow: "hidden", flexShrink: 0, background: "var(--color-background-secondary)", position: "relative" }}>
        <img src={imgSrc} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} loading="lazy"
          onError={() => { if (proxyUrl) setProxyFailed(true); else setImgFailed(true); }} referrerPolicy="no-referrer" />
        {type === "VIDEO" && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Film size={12} style={{ color: "white", filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.8))" }} />
          </div>
        )}
      </div>
    );
  }
  return (
    <div style={{ width: 36, height: 36, borderRadius: 6, border: "0.5px solid var(--color-border-tertiary)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, background: "var(--color-background-secondary)" }}>
      <CreativeIcon type={type} />
    </div>
  );
}

// ─── Sparkline ────────────────────────────────────────────────────────────────
function Sparkline({ values, color = "#D4537E" }: { values: number[]; color?: string }) {
  if (!values || values.length === 0) return <span style={{ color: "var(--color-text-secondary)", fontSize: 10 }}>—</span>;
  const max = Math.max(...values, 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 28 }}>
      {values.map((v, i) => (
        <div key={i} style={{ width: 7, borderRadius: "2px 2px 0 0", background: color, opacity: 0.65, height: `${Math.max(8, (v / max) * 100)}%` }} />
      ))}
    </div>
  );
}

// ─── Inline detail panel (expanded campaign) ──────────────────────────────────
function CampaignDetailPanel({ metaId, selectedAccountId, dateParams, resultLabel }: {
  metaId: string; selectedAccountId: number;
  dateParams: { days: number; startDate?: string; endDate?: string; includeToday?: boolean };
  resultLabel?: string;
}) {
  const { data: adsets, isLoading: adsetsLoading } = trpc.campaigns.adsets.useQuery(
    { accountId: selectedAccountId, metaCampaignId: metaId, days: dateParams.days || 7, ...(dateParams.startDate ? { startDate: dateParams.startDate } : {}), ...(dateParams.endDate ? { endDate: dateParams.endDate } : {}), includeToday: dateParams.includeToday },
    { enabled: !!metaId }
  );
  const { data: ads, isLoading: adsLoading } = trpc.campaigns.ads.useQuery(
    { accountId: selectedAccountId, metaCampaignId: metaId, days: dateParams.days || 7, ...(dateParams.startDate ? { startDate: dateParams.startDate } : {}), ...(dateParams.endDate ? { endDate: dateParams.endDate } : {}), includeToday: dateParams.includeToday },
    { enabled: !!metaId }
  );

  const topAds = useMemo(() => {
    if (!ads) return [];
    return [...ads].filter(a => a.spend > 0).sort((a, b) => {
      const ca = a.conversions > 0 ? a.spend / a.conversions : 99999;
      const cb = b.conversions > 0 ? b.spend / b.conversions : 99999;
      return ca - cb;
    }).slice(0, 3);
  }, [ads]);

  const topAdsets = useMemo(() => {
    if (!adsets) return [];
    return [...adsets].filter((a: any) => a.spend > 0).sort((a: any, b: any) => {
      const ca = a.conversions > 0 ? a.spend / a.conversions : 99999;
      const cb = b.conversions > 0 ? b.spend / b.conversions : 99999;
      return ca - cb;
    }).slice(0, 3);
  }, [adsets]);

  if (adsetsLoading || adsLoading) {
    return (
      <div style={{ padding: "16px 16px 16px 48px", background: "var(--color-background-secondary)", borderBottom: "0.5px solid var(--color-border-tertiary)", display: "flex", alignItems: "center", gap: 8, color: "var(--color-text-secondary)", fontSize: 12 }}>
        <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Carregando conjuntos e anúncios...
      </div>
    );
  }

  const metricLabel = cleanResultLabel(resultLabel);

  return (
    <div style={{ padding: "14px 16px 14px 48px", background: "var(--color-background-secondary)", borderBottom: "0.5px solid var(--color-border-tertiary)", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
      {/* Conjuntos */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 500, color: "var(--color-text-secondary)", marginBottom: 8, letterSpacing: "0.05em" }}>CONJUNTOS</div>
        {topAdsets.length === 0 ? <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>Sem dados</div> : topAdsets.map((as: any) => (
          <div key={as.id} style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 8, padding: "8px 10px", marginBottom: 5 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
              <span style={{ fontSize: 11, fontWeight: 500, maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{as.name ?? "Conjunto"}</span>
              <span style={{ fontSize: 11, fontWeight: 500 }}>{fmtCurrency(as.spend)}</span>
            </div>
            <div style={{ fontSize: 10, color: "var(--color-text-secondary)" }}>
              {fmtNum(as.conversions)} {metricLabel.toLowerCase()} · {fmtCurrency(as.conversions > 0 ? as.spend / as.conversions : null)}/result.
            </div>
          </div>
        ))}
      </div>
      {/* Top criativos */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 500, color: "var(--color-text-secondary)", marginBottom: 8, letterSpacing: "0.05em" }}>TOP CRIATIVOS</div>
        {topAds.length === 0 ? <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>Sem dados</div> : topAds.map((ad) => (
          <div key={ad.id} style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 8, padding: "7px 10px", marginBottom: 5, display: "flex", alignItems: "center", gap: 8 }}>
            <CreativeThumb url={(ad as any).thumbnail_url} type={ad.creative_type} creativeId={(ad as any).creative_id} accountId={selectedAccountId} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ad.name}</div>
              <div style={{ fontSize: 10, color: "var(--color-text-secondary)" }}>{ad.creative_type} · {fmtNum(ad.conversions)} conv.</div>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 500, color: "#1D9E75" }}>{fmtCurrency(ad.conversions > 0 ? ad.spend / ad.conversions : null)}</div>
            </div>
          </div>
        ))}
      </div>
      {/* IA insight placeholder */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 500, color: "var(--color-text-secondary)", marginBottom: 8, letterSpacing: "0.05em" }}>ANÁLISE DA IA</div>
        <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 8, padding: "9px 11px", fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.55 }}>
          {topAds.length > 0
            ? `${topAds[0].name.split("-").slice(0, 2).join("-")} lidera com menor custo/resultado. ${topAdsets.length > 1 ? `Conjunto "${topAdsets[0].name?.split("-")[0] ?? topAdsets[0].name}" tem melhor eficiência — considere escalar.` : ""}`
            : "Aplique uma sugestão da IA no Plano de Ação para ver análise desta campanha."}
        </div>
        <a href="/suggestions" style={{ marginTop: 7, display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 10px", background: "#FBEAF0", color: "#993556", borderRadius: 8, fontSize: 11, fontWeight: 500, border: "0.5px solid #ED93B1", textDecoration: "none" }}>
          Ver plano de ação <ExternalLink size={11} />
        </a>
      </div>
    </div>
  );
}

// ─── Main table row ───────────────────────────────────────────────────────────
function CampaignRow({ c, metaId, isExpanded, onToggle, selectedAccountId, dateParams }: {
  c: any; metaId: string; isExpanded: boolean; onToggle: () => void;
  selectedAccountId: number;
  dateParams: { days: number; startDate?: string; endDate?: string; includeToday?: boolean };
}) {
  const spend = Number(c.totalSpend ?? 0);
  const results = Math.round(Number(c.totalConversions ?? 0));
  const costPerResult = Number(c.avgCpa ?? 0);
  const reach = Number(c.totalReach ?? 0);
  const cpm = Number(c.avgCpm ?? 0);
  const ctr = Number(c.avgCtr ?? 0);
  const frequency = Number(c.avgFrequency ?? 0);
  const status = c.campaignStatus ?? "ACTIVE";
  const resultLabel = c.campaignResultLabel as string | undefined;

  const isActive = status === "ACTIVE";
  const statusStyle = isActive
    ? { background: "#EAF3DE", color: "#3B6D11", border: "0.5px solid #C0DD97" }
    : { background: "#FAEEDA", color: "#854F0B", border: "0.5px solid #FAC775" };

  // Fake sparkline from totalSpend as placeholder (7 bars)
  const sparkValues = [0.4, 0.6, 0.5, 0.8, 0.7, 1.0, 0.9].map(v => v * spend);

  return (
    <>
      <tr onClick={onToggle} style={{ cursor: "pointer", opacity: isActive ? 1 : 0.65, borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
        <td style={{ padding: "10px 16px", textAlign: "left", borderRight: "0.5px solid var(--color-border-tertiary)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {isExpanded ? <ChevronDown size={14} style={{ color: "var(--color-text-secondary)", flexShrink: 0 }} /> : <ChevronRight size={14} style={{ color: "var(--color-text-secondary)", flexShrink: 0 }} />}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 200 }}>{c.campaignName ?? "—"}</div>
              <div style={{ fontSize: 10, color: "var(--color-text-secondary)", marginTop: 1 }}>{cleanResultLabel(c.campaignOptimizationGoal ?? c.campaignResultLabel)} · {c.metaCampaignId ?? "—"}</div>
            </div>
          </div>
        </td>
        <td style={{ padding: "10px 12px", textAlign: "center", borderRight: "0.5px solid var(--color-border-tertiary)" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 20, fontSize: 10, fontWeight: 500, ...statusStyle }}>
            <Circle size={5} style={{ fill: "currentColor" }} />
            {isActive ? "Ativa" : "Pausada"}
          </span>
        </td>
        <td style={{ padding: "10px 12px", textAlign: "right", borderRight: "0.5px solid var(--color-border-tertiary)" }}>
          <strong style={{ fontSize: 12 }}>{fmtCurrency(spend)}</strong>
        </td>
        <td style={{ padding: "10px 12px", textAlign: "right", borderRight: "0.5px solid var(--color-border-tertiary)" }}>
          <strong style={{ fontSize: 12 }}>{fmtNum(results)}</strong>
          <div style={{ fontSize: 10, color: "var(--color-text-secondary)" }}>{cleanResultLabel(resultLabel)}</div>
        </td>
        <td style={{ padding: "10px 12px", textAlign: "right", borderRight: "0.5px solid var(--color-border-tertiary)" }}>
          <strong style={{ fontSize: 12 }}>{fmtCurrency(costPerResult)}</strong>
        </td>
        <td style={{ padding: "10px 12px", textAlign: "right", borderRight: "0.5px solid var(--color-border-tertiary)" }}>
          <span style={{ fontSize: 12 }}>{fmtNum(reach)}</span>
        </td>
        <td style={{ padding: "10px 12px", textAlign: "right", borderRight: "0.5px solid var(--color-border-tertiary)" }}>
          <span style={{ fontSize: 12 }}>{fmtCurrency(cpm)}</span>
        </td>
        <td style={{ padding: "10px 12px", textAlign: "right", borderRight: "0.5px solid var(--color-border-tertiary)" }}>
          <span style={{ fontSize: 12 }}>{fmtFreq(frequency)}</span>
        </td>
        <td style={{ padding: "10px 12px", textAlign: "right", borderRight: "0.5px solid var(--color-border-tertiary)" }}>
          <span style={{ fontSize: 12 }}>{fmtPct(ctr)}</span>
        </td>
        <td style={{ padding: "10px 12px", textAlign: "right" }}>
          <Sparkline values={sparkValues} color={isActive ? "#D4537E" : "#888780"} />
        </td>
      </tr>
      {isExpanded && (
        <tr>
          <td colSpan={10} style={{ padding: 0 }}>
            <CampaignDetailPanel metaId={metaId} selectedAccountId={selectedAccountId} dateParams={dateParams} resultLabel={resultLabel} />
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Day of week comparison ───────────────────────────────────────────────────
function DayOfWeekPanel({ accountId, metricLabel }: { accountId: number; metricLabel: string }) {
  const { data: dowData, isLoading } = trpc.campaigns.dayOfWeekStats.useQuery(
    { accountId, days: 30, metricKey: "conversions" },
    { enabled: !!accountId }
  );

  if (isLoading) return (
    <div style={{ padding: 24, display: "flex", alignItems: "center", gap: 8, color: "var(--color-text-secondary)", fontSize: 12 }}>
      <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Carregando...
    </div>
  );

  if (!dowData || dowData.length === 0) return (
    <div style={{ padding: 24, fontSize: 12, color: "var(--color-text-secondary)" }}>Sem dados suficientes (mínimo 7 dias de métricas).</div>
  );

  const weekdays = dowData.filter(d => d.dow >= 1 && d.dow <= 5);
  const weekend = dowData.filter(d => d.dow === 0 || d.dow === 6);
  const maxAvg = Math.max(...dowData.map(d => d.avg), 1);
  const bestWeekday = weekdays.reduce((a, b) => a.avg > b.avg ? a : b, weekdays[0]);
  const avgWeekday = weekdays.reduce((s, d) => s + d.avg, 0) / (weekdays.length || 1);
  const avgWeekend = weekend.reduce((s, d) => s + d.avg, 0) / (weekend.length || 1);
  const weekendDiff = avgWeekday > 0 ? Math.round(((avgWeekend - avgWeekday) / avgWeekday) * 100) : 0;

  const renderRow = (d: any, color: string) => (
    <div key={d.dow} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
      <span style={{ fontSize: 11, color: "var(--color-text-secondary)", width: 28, flexShrink: 0 }}>{d.label}</span>
      <div style={{ flex: 1, height: 4, background: "var(--color-background-secondary)", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ height: "100%", borderRadius: 2, background: color, width: `${Math.max(4, (d.avg / maxAvg) * 100)}%` }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 500, minWidth: 60, textAlign: "right" }}>
        {d.avg > 0 ? `${d.avg.toFixed(1)}/dia` : "—"}
      </span>
    </div>
  );

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
      <div style={{ padding: "14px 16px", borderRight: "0.5px solid var(--color-border-tertiary)" }}>
        <div style={{ fontSize: 11, fontWeight: 500, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 14 }}>☀️</span> Dias úteis
        </div>
        {weekdays.map(d => renderRow(d, "#D4537E"))}
        {bestWeekday && (
          <div style={{ marginTop: 10, padding: "7px 10px", background: "#FBEAF0", borderRadius: 8, fontSize: 11, color: "#993556" }}>
            ★ Melhor dia: <strong>{bestWeekday.label}</strong> ({bestWeekday.avg.toFixed(1)} {metricLabel.toLowerCase()}/dia)
          </div>
        )}
      </div>
      <div style={{ padding: "14px 16px" }}>
        <div style={{ fontSize: 11, fontWeight: 500, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 14 }}>🌿</span> Fim de semana
        </div>
        {weekend.map(d => renderRow(d, "#1D9E75"))}
        <div style={{ marginTop: 10, padding: "7px 10px", background: weekendDiff < -10 ? "#FAEEDA" : "#EAF3DE", borderRadius: 8, fontSize: 11, color: weekendDiff < -10 ? "#854F0B" : "#3B6D11" }}>
          {weekendDiff < 0
            ? `Fim de semana converte ${Math.abs(weekendDiff)}% menos que dias úteis.`
            : `Fim de semana performa ${weekendDiff}% acima dos dias úteis.`}
        </div>
      </div>
    </div>
  );
}

// ─── Top creatives/adsets section ────────────────────────────────────────────
function TopPerformersSection({ accountId, dateParams, resultLabel }: {
  accountId: number;
  dateParams: { days: number; startDate?: string; endDate?: string; includeToday?: boolean };
  resultLabel?: string;
}) {
  const [activeTab, setActiveTab] = useState<"creatives" | "audiences">("creatives");

  const { data: topAds, isLoading: adsLoading } = trpc.campaigns.adTopByCtr.useQuery(
    { accountId, days: dateParams.days || 7, ...(dateParams.startDate ? { startDate: dateParams.startDate } : {}), ...(dateParams.endDate ? { endDate: dateParams.endDate } : {}) },
    { enabled: !!accountId }
  );
  const { data: topAdsets, isLoading: adsetsLoading } = trpc.campaigns.adsetTopByCtr.useQuery(
    { accountId, days: dateParams.days || 7, ...(dateParams.startDate ? { startDate: dateParams.startDate } : {}), ...(dateParams.endDate ? { endDate: dateParams.endDate } : {}) },
    { enabled: !!accountId }
  );

  const metricLabel = cleanResultLabel(resultLabel);
  const rankColors = ["#D4537E", "#993556", "#72243E", "#4B1528"];

  return (
    <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 12, overflow: "hidden" }}>
      <div style={{ display: "flex", gap: 0, borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
        {(["creatives", "audiences"] as const).map(tab => (
          <div key={tab} onClick={() => setActiveTab(tab)} style={{ padding: "10px 16px", fontSize: 12, cursor: "pointer", borderBottom: activeTab === tab ? "2px solid #D4537E" : "2px solid transparent", color: activeTab === tab ? "#D4537E" : "var(--color-text-secondary)", fontWeight: activeTab === tab ? 500 : 400, userSelect: "none" }}>
            {tab === "creatives" ? "Melhores criativos" : "Melhores públicos"}
          </div>
        ))}
        <div style={{ marginLeft: "auto", padding: "10px 16px", fontSize: 11, color: "var(--color-text-secondary)", display: "flex", alignItems: "center" }}>
          Ordenado por custo/{metricLabel.toLowerCase()} · período selecionado
        </div>
      </div>

      {activeTab === "creatives" && (
        adsLoading ? (
          <div style={{ padding: 24, display: "flex", alignItems: "center", gap: 8, color: "var(--color-text-secondary)", fontSize: 12 }}>
            <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Carregando criativos...
          </div>
        ) : !topAds || topAds.length === 0 ? (
          <div style={{ padding: 24, fontSize: 12, color: "var(--color-text-secondary)" }}>Nenhum criativo com dados no período.</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(topAds.length, 4)}, 1fr)` }}>
            {topAds.slice(0, 4).map((ad, i) => (
              <div key={ad.adId} style={{ padding: "14px 16px", borderRight: i < Math.min(topAds.length, 4) - 1 ? "0.5px solid var(--color-border-tertiary)" : "none" }}>
                <div style={{ width: "100%", aspectRatio: "1", background: "var(--color-background-secondary)", borderRadius: 8, marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
                  <Film size={28} style={{ color: "var(--color-text-secondary)", opacity: 0.2 }} />
                  <div style={{ position: "absolute", top: 6, left: 6, background: rankColors[i] ?? "#D4537E", color: "#fff", fontSize: 10, fontWeight: 500, padding: "2px 7px", borderRadius: 10 }}>#{i + 1}</div>
                </div>
                <div style={{ fontSize: 11, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 6 }}>{ad.adName}</div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 3 }}>
                  <span style={{ color: "var(--color-text-secondary)" }}>Custo/result.</span>
                  <span style={{ fontWeight: 500, color: i === 0 ? "#1D9E75" : i >= 3 ? "#A32D2D" : "var(--color-text-primary)" }}>{fmtCurrency(ad.costPerResult)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 3 }}>
                  <span style={{ color: "var(--color-text-secondary)" }}>{metricLabel}</span>
                  <span style={{ fontWeight: 500 }}>{fmtNum(ad.conversions)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                  <span style={{ color: "var(--color-text-secondary)" }}>CTR</span>
                  <span style={{ fontWeight: 500 }}>{fmtPct(ad.ctr)}</span>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {activeTab === "audiences" && (
        adsetsLoading ? (
          <div style={{ padding: 24, display: "flex", alignItems: "center", gap: 8, color: "var(--color-text-secondary)", fontSize: 12 }}>
            <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Carregando públicos...
          </div>
        ) : !topAdsets || topAdsets.length === 0 ? (
          <div style={{ padding: 24, fontSize: 12, color: "var(--color-text-secondary)" }}>Nenhum conjunto com dados no período.</div>
        ) : (
          <div>
            {topAdsets.slice(0, 5).map((as: any, i: number) => (
              <div key={as.adsetId} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderBottom: i < Math.min(topAdsets.length, 5) - 1 ? "0.5px solid var(--color-border-tertiary)" : "none" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 11, fontWeight: 500, color: "var(--color-text-secondary)", width: 18, flexShrink: 0 }}>#{i + 1}</span>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 500 }}>{as.adsetName}</div>
                    <div style={{ fontSize: 10, color: "var(--color-text-secondary)", marginTop: 1 }}>Conjunto de anúncios</div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 24 }}>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: i === 0 ? "#1D9E75" : "var(--color-text-primary)" }}>{fmtCurrency(as.costPerResult)}</div>
                    <div style={{ fontSize: 10, color: "var(--color-text-secondary)" }}>custo/result.</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 12, fontWeight: 500 }}>{fmtNum(as.conversions)}</div>
                    <div style={{ fontSize: 10, color: "var(--color-text-secondary)" }}>{metricLabel.toLowerCase()}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 12, fontWeight: 500 }}>{fmtCurrency(as.spend)}</div>
                    <div style={{ fontSize: 10, color: "var(--color-text-secondary)" }}>investimento</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function Campaigns() {
  const [activePeriod, setActivePeriod] = useState("7d");
  const [search, setSearch] = useState("");
  const [expandedCampaigns, setExpandedCampaigns] = useState<Set<string>>(new Set());
  const [periodMode, setPeriodMode] = useState<"quick" | "custom">("quick");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [selectedMetaCampaignId, setSelectedMetaCampaignId] = useState<string | null>(null);
  const [, navigate] = useLocation();
  const { selectedAccountId, accounts } = useSelectedAccount();

  const dateParams = useMemo(() => {
    const today = new Date();
    const y = today.getFullYear(), m = today.getMonth(), d = today.getDate();
    const todayStr = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const yest = new Date(y, m, d - 1);
    const yesterdayStr = `${yest.getFullYear()}-${String(yest.getMonth()+1).padStart(2,'0')}-${String(yest.getDate()).padStart(2,'0')}`;
    if (periodMode === "custom" && customStartDate && customEndDate) {
      return { days: 0, startDate: customStartDate, endDate: customEndDate, includeToday: true };
    }
    switch (activePeriod) {
      case "today": return { days: 1, startDate: todayStr, endDate: todayStr, includeToday: true };
      case "yesterday": return { days: 1, startDate: yesterdayStr, endDate: yesterdayStr, includeToday: false };
      case "today-yesterday": return { days: 2, startDate: yesterdayStr, endDate: todayStr, includeToday: true };
      case "7d": return { days: 7, includeToday: true };
      case "14d": return { days: 14, includeToday: true };
      case "30d": return { days: 30, includeToday: true };
      default: return { days: 7, includeToday: true };
    }
  }, [activePeriod, periodMode, customStartDate, customEndDate]);

  const toggleCampaign = useCallback((metaId: string) => {
    setExpandedCampaigns(prev => {
      const next = new Set(prev);
      if (next.has(metaId)) next.delete(metaId); else next.add(metaId);
      return next;
    });
  }, []);

  const { data: campaigns, isLoading } = trpc.campaigns.performance.useQuery(
    { accountId: selectedAccountId!, days: dateParams.days, ...(dateParams.startDate ? { startDate: dateParams.startDate } : {}), ...(dateParams.endDate ? { endDate: dateParams.endDate } : {}), includeToday: dateParams.includeToday },
    { enabled: !!selectedAccountId }
  );

  const { data: activeCampaigns } = trpc.campaigns.list.useQuery(
    { accountId: selectedAccountId! },
    { enabled: !!selectedAccountId }
  );

  const metaIdMap = useMemo(() => {
    const map = new Map<number, string>();
    if (activeCampaigns) for (const c of activeCampaigns) if (c.id && c.metaCampaignId) map.set(c.id, c.metaCampaignId);
    return map;
  }, [activeCampaigns]);

  const mergedCampaigns = useMemo(() => {
    const activeOnly = (activeCampaigns ?? []).filter((ac: any) => ac.status === "ACTIVE");
    if (activeOnly.length === 0) return (campaigns ?? []).filter((c: any) => (c.campaignStatus ?? "").toUpperCase() === "ACTIVE");
    const perfByMetaId = new Map<string, any>();
    const perfMap = new Map<number, any>();
    if (campaigns) for (const c of campaigns) {
      perfMap.set(c.campaignId, c);
      if (c.metaCampaignId) perfByMetaId.set(String(c.metaCampaignId), c);
    }
    const merged = activeOnly.map((ac: any) => {
      const perf = perfMap.get(ac.id) || (ac.metaCampaignId ? perfByMetaId.get(String(ac.metaCampaignId)) : null);
      if (perf) return { ...perf, campaignStatus: "ACTIVE" };
      return { campaignId: ac.id, metaCampaignId: ac.metaCampaignId, campaignName: ac.name, campaignStatus: "ACTIVE", campaignOptimizationGoal: ac.optimizationGoal, campaignResultLabel: ac.resultLabel, totalSpend: 0, totalImpressions: 0, totalClicks: 0, totalConversions: 0, totalConversionValue: 0, totalReach: 0, avgRoas: 0, avgCpa: 0, avgCtr: 0, avgCpc: 0, avgCpm: 0, avgFrequency: 0, totalProfileVisits: 0, totalFollowers: 0 };
    });
    return merged.sort((a: any, b: any) => Number(b.totalSpend ?? 0) - Number(a.totalSpend ?? 0));
  }, [activeCampaigns, campaigns]);

  const filtered = useMemo(() => {
    if (!mergedCampaigns) return [];
    return mergedCampaigns.filter((c: any) => (c.campaignName ?? "").toLowerCase().includes(search.toLowerCase()));
  }, [mergedCampaigns, search]);

  // KPI summary — filtered by selected campaign or all
  const kpiData = useMemo(() => {
    const source = selectedMetaCampaignId
      ? filtered.filter((c: any) => String(c.metaCampaignId) === selectedMetaCampaignId)
      : filtered;
    return source.reduce((acc: any, c: any) => ({
      spend: acc.spend + Number(c.totalSpend ?? 0),
      conversions: acc.conversions + Number(c.totalConversions ?? 0),
      reach: acc.reach + Number(c.totalReach ?? 0),
      impressions: acc.impressions + Number(c.totalImpressions ?? 0),
      clicks: acc.clicks + Number(c.totalClicks ?? 0),
    }), { spend: 0, conversions: 0, reach: 0, impressions: 0, clicks: 0 });
  }, [filtered, selectedMetaCampaignId]);

  const kpiCostPerResult = kpiData.conversions > 0 ? kpiData.spend / kpiData.conversions : 0;
  const kpiFreq = filtered.length > 0 ? filtered.reduce((s: number, c: any) => s + Number(c.avgFrequency ?? 0), 0) / filtered.length : 0;

  // Derive result label from account goal
  const accountResultLabel = useMemo(() => {
    const first = mergedCampaigns?.[0];
    return first?.campaignResultLabel ?? first?.campaignOptimizationGoal ?? null;
  }, [mergedCampaigns]);

  const periodLabel = useMemo(() => {
    if (periodMode === "custom") return `${customStartDate} a ${customEndDate}`;
    switch (activePeriod) {
      case "today": return "hoje"; case "yesterday": return "ontem";
      case "today-yesterday": return "hoje e ontem"; case "7d": return "últimos 7 dias";
      case "14d": return "últimos 14 dias"; case "30d": return "últimos 30 dias";
      default: return "últimos 7 dias";
    }
  }, [activePeriod, periodMode, customStartDate, customEndDate]);

  if (!accounts || accounts.length === 0) {
    return (
      <MetaDashboardLayout title="Campanhas">
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 256, textAlign: "center" }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, background: "var(--color-background-secondary)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
            <Link2 size={28} style={{ color: "#D4537E" }} />
          </div>
          <h2 style={{ fontSize: 18, fontWeight: 500, marginBottom: 8 }}>Nenhuma conta conectada</h2>
          <Button onClick={() => navigate("/connect")} style={{ marginTop: 8 }}>
            <Zap size={16} style={{ marginRight: 6 }} /> Conectar conta
          </Button>
        </div>
      </MetaDashboardLayout>
    );
  }

  const acct = accounts?.find((a: any) => a.id === selectedAccountId);
  const selectedCampaignName = selectedMetaCampaignId
    ? filtered.find((c: any) => String(c.metaCampaignId) === selectedMetaCampaignId)?.campaignName ?? "Campanha selecionada"
    : null;

  // ─── Styles ──────────────────────────────────────────────────────────────────
  const S = {
    page: { padding: "24px 28px" } as React.CSSProperties,
    topbar: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 18, flexWrap: "wrap" as const, gap: 12 },
    pillRow: { display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" as const },
    pill: (active: boolean): React.CSSProperties => ({
      padding: "5px 13px", borderRadius: 20, border: active ? "none" : "0.5px solid var(--color-border-secondary)",
      fontSize: 12, cursor: "pointer", color: active ? "#fff" : "var(--color-text-secondary)",
      background: active ? "#D4537E" : "var(--color-background-primary)", fontWeight: active ? 500 : 400,
      userSelect: "none",
    }),
    kpiSection: { background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 12, marginBottom: 14, overflow: "hidden" } as React.CSSProperties,
    kpiTop: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 16px", borderBottom: "0.5px solid var(--color-border-tertiary)" } as React.CSSProperties,
    kpiGrid: { display: "grid", gridTemplateColumns: "repeat(5, 1fr)" } as React.CSSProperties,
    kpiCard: (last: boolean): React.CSSProperties => ({ padding: "14px 16px", borderRight: last ? "none" : "0.5px solid var(--color-border-tertiary)" }),
    kpiLabel: { fontSize: 11, color: "var(--color-text-secondary)", marginBottom: 4 } as React.CSSProperties,
    kpiVal: { fontSize: 20, fontWeight: 500 } as React.CSSProperties,
    twoCol: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 } as React.CSSProperties,
    panel: { background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 12, overflow: "hidden" } as React.CSSProperties,
    panelHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 16px", borderBottom: "0.5px solid var(--color-border-tertiary)" } as React.CSSProperties,
    tableWrap: { background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 12, overflow: "hidden", marginBottom: 14 } as React.CSSProperties,
    tableHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 16px", borderBottom: "0.5px solid var(--color-border-tertiary)" } as React.CSSProperties,
    th: (left?: boolean): React.CSSProperties => ({ padding: "8px 12px", textAlign: left ? "left" : "right", fontWeight: 500, fontSize: 11, color: "var(--color-text-secondary)", borderBottom: "0.5px solid var(--color-border-tertiary)", whiteSpace: "nowrap", background: "var(--color-background-secondary)" }),
  };

  return (
    <MetaDashboardLayout title="Campanhas">
      <div style={S.page}>

        {/* ── Topbar ────────────────────────────────────────────────────── */}
        <div style={S.topbar}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 500 }}>Campanhas</div>
            <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 2 }}>
              {acct?.accountName ?? "Conta"} · {periodLabel}
            </div>
          </div>
          <div style={S.pillRow}>
            {[
              { key: "today", label: "Hoje" }, { key: "yesterday", label: "Ontem" },
              { key: "today-yesterday", label: "Hoje e Ontem" }, { key: "7d", label: "Últimos 7d" },
              { key: "14d", label: "Últimos 14d" }, { key: "30d", label: "Últimos 30d" },
            ].map(btn => (
              <div key={btn.key} style={S.pill(periodMode === "quick" && activePeriod === btn.key)} onClick={() => { setPeriodMode("quick"); setActivePeriod(btn.key); }}>
                {btn.label}
              </div>
            ))}
            <Dialog>
              <DialogTrigger asChild>
                <div style={S.pill(periodMode === "custom")}>
                  <Calendar size={12} style={{ display: "inline", marginRight: 4, verticalAlign: "middle" }} />
                  Personalizado
                </div>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader><DialogTitle>Período Personalizado</DialogTitle></DialogHeader>
                <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "8px 0" }}>
                  <div><Label>Data Início</Label><Input type="date" value={customStartDate} onChange={e => setCustomStartDate(e.target.value)} style={{ marginTop: 4 }} /></div>
                  <div><Label>Data Fim</Label><Input type="date" value={customEndDate} onChange={e => setCustomEndDate(e.target.value)} style={{ marginTop: 4 }} /></div>
                  <Button onClick={() => { if (customStartDate && customEndDate) setPeriodMode("custom"); }}>Aplicar</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* ── KPI Section ───────────────────────────────────────────────── */}
        <div style={S.kpiSection}>
          <div style={S.kpiTop}>
            <div style={{ fontSize: 12, fontWeight: 500 }}>Resultados do período</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>Visualizando:</span>
              <select
                value={selectedMetaCampaignId ?? ""}
                onChange={e => setSelectedMetaCampaignId(e.target.value || null)}
                style={{ padding: "4px 10px", border: "0.5px solid var(--color-border-secondary)", borderRadius: 8, fontSize: 12, background: "var(--color-background-secondary)", color: "var(--color-text-primary)", cursor: "pointer" }}
              >
                <option value="">Todas as campanhas</option>
                {filtered.map((c: any) => (
                  <option key={c.metaCampaignId} value={String(c.metaCampaignId)}>{c.campaignName}</option>
                ))}
              </select>
              {selectedMetaCampaignId && (
                <div onClick={() => setSelectedMetaCampaignId(null)} style={{ padding: "3px 10px", background: "#FBEAF0", color: "#993556", border: "0.5px solid #ED93B1", borderRadius: 20, fontSize: 11, cursor: "pointer", fontWeight: 500 }}>
                  Limpar ×
                </div>
              )}
            </div>
          </div>
          <div style={S.kpiGrid}>
            {[
              { label: "Investimento", val: fmtCurrency(kpiData.spend) },
              { label: cleanResultLabel(accountResultLabel), val: fmtNum(kpiData.conversions) },
              { label: `Custo/${cleanResultLabel(accountResultLabel).toLowerCase()}`, val: fmtCurrency(kpiCostPerResult) },
              { label: "Alcance total", val: fmtNum(kpiData.reach) },
              { label: "Frequência média", val: kpiFreq > 0 ? `${kpiFreq.toFixed(2)}x` : "—" },
            ].map((k, i, arr) => (
              <div key={k.label} style={S.kpiCard(i === arr.length - 1)}>
                <div style={S.kpiLabel}>{k.label}</div>
                <div style={S.kpiVal}>{k.val}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Day comparison + Top performers ──────────────────────────── */}
        <div style={S.twoCol}>
          <div style={S.panel}>
            <div style={S.panelHeader}>
              <div style={{ fontSize: 12, fontWeight: 500 }}>Comparativo de dias</div>
              <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>últimos 30d · média diária</div>
            </div>
            <DayOfWeekPanel accountId={selectedAccountId!} metricLabel={cleanResultLabel(accountResultLabel)} />
          </div>
          <TopPerformersSection accountId={selectedAccountId!} dateParams={dateParams} resultLabel={accountResultLabel ?? undefined} />
        </div>

        {/* ── Campaigns table ───────────────────────────────────────────── */}
        <div style={S.tableWrap}>
          <div style={S.tableHeader}>
            <div style={{ fontSize: 12, fontWeight: 500 }}>Campanhas {selectedCampaignName ? `· ${selectedCampaignName}` : ""}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ position: "relative" }}>
                <Search size={13} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "var(--color-text-secondary)" }} />
                <input
                  placeholder="Buscar campanha..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  style={{ paddingLeft: 28, paddingRight: 10, paddingTop: 5, paddingBottom: 5, border: "0.5px solid var(--color-border-secondary)", borderRadius: 8, fontSize: 12, background: "var(--color-background-primary)", color: "var(--color-text-primary)", outline: "none", minWidth: 180 }}
                />
              </div>
            </div>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
              <thead>
                <tr>
                  <th style={{ ...S.th(true), paddingLeft: 16, minWidth: 220 }}>Campanha</th>
                  <th style={S.th()}>Status</th>
                  <th style={S.th()}>Investimento</th>
                  <th style={S.th()}>Resultado</th>
                  <th style={S.th()}>Custo/Result.</th>
                  <th style={S.th()}>Alcance</th>
                  <th style={S.th()}>CPM</th>
                  <th style={S.th()}>Freq.</th>
                  <th style={S.th()}>CTR</th>
                  <th style={S.th()}>Tendência</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  [...Array(4)].map((_, i) => (
                    <tr key={i}>
                      <td colSpan={10} style={{ padding: "10px 16px", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
                        <div style={{ height: 14, background: "var(--color-background-secondary)", borderRadius: 4, animation: "pulse 1.5s ease-in-out infinite" }} />
                      </td>
                    </tr>
                  ))
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={10} style={{ padding: "48px 16px", textAlign: "center", color: "var(--color-text-secondary)", fontSize: 12 }}>
                      Nenhuma campanha encontrada. Sincronize sua conta.
                    </td>
                  </tr>
                ) : (
                  filtered
                    .filter((c: any) => !selectedMetaCampaignId || String(c.metaCampaignId) === selectedMetaCampaignId)
                    .map((c: any) => {
                      const metaId = String(c.metaCampaignId ?? metaIdMap.get(c.campaignId) ?? c.campaignId ?? "");
                      return (
                        <CampaignRow
                          key={metaId}
                          c={c}
                          metaId={metaId}
                          isExpanded={expandedCampaigns.has(metaId)}
                          onToggle={() => toggleCampaign(metaId)}
                          selectedAccountId={selectedAccountId!}
                          dateParams={dateParams}
                        />
                      );
                    })
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </MetaDashboardLayout>
  );
}
