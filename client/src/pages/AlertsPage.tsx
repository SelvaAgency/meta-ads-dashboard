import { MetaDashboardLayout } from "@/components/MetaDashboardLayout";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle, Bell, BellOff, Check, CreditCard, ExternalLink, FileX,
  Image, Info, Instagram, Key, Link2Off, Loader2, Pause, Wallet, Sparkles,
} from "lucide-react";
import React, { useState, useMemo } from "react";
import { useLocation } from "wouter";

// ─── Type config ────────────────────────────────────────────────────────────
const CRITICAL_TYPES = new Set(["SYNC_ERROR", "PAYMENT_FAILED", "AD_REJECTED", "PIXEL_ERROR", "PAGE_UNLINKED", "CAMPAIGN_PAUSED"]);
const WARNING_TYPES = new Set(["AD_ERROR", "BUDGET_WARNING", "INSTAGRAM_UNLINKED", "ADSET_NO_DELIVERY"]);
const NOTIFICATION_TYPES = new Set(["SUGGESTION_APPLIED", "EXPERIMENT_UPDATE", "REPORT"]);

const typeConfig: Record<string, { icon: React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>; label: string; isTokenIssue?: boolean }> = {
  SYNC_ERROR:      { icon: Key,          label: "Token expirado", isTokenIssue: true },
  BUDGET_WARNING:  { icon: Wallet,       label: "Saldo baixo" },
  PAYMENT_FAILED:  { icon: CreditCard,   label: "Falha de pagamento" },
  AD_REJECTED:     { icon: FileX,        label: "Criativo rejeitado" },
  AD_ERROR:        { icon: AlertTriangle,label: "Erro em anúncio/conjunto" },
  PAGE_UNLINKED:   { icon: Link2Off,     label: "Página desvinculada" },
  INSTAGRAM_UNLINKED: { icon: Instagram, label: "Instagram desvinculado" },
  PIXEL_ERROR:     { icon: Image,        label: "Erro no pixel" },
  CAMPAIGN_PAUSED: { icon: Pause,        label: "Campanha pausada" },
  ADSET_NO_DELIVERY: { icon: AlertTriangle, label: "Conjunto sem veiculação" },
  SUGGESTION_APPLIED: { icon: Sparkles,  label: "Ação aplicada" },
  EXPERIMENT_UPDATE: { icon: Info,       label: "Experimento" },
  REPORT:          { icon: Bell,         label: "Relatório" },
};

function timeAgo(date: string | Date): string {
  const d = new Date(date);
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "agora mesmo";
  if (mins < 60) return `há ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `há ${hours} hora${hours !== 1 ? "s" : ""}`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `há ${days} dia${days !== 1 ? "s" : ""}`;
  return d.toLocaleDateString("pt-BR");
}

function initials(name: string | null | undefined): string {
  if (!name) return "??";
  const parts = name.replace(/^CA\s*[-–]\s*/i, "").trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
}

function buildManagerUrl(metaAccountId: string | null | undefined): string | null {
  if (!metaAccountId) return null;
  return `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${metaAccountId}`;
}

// ─── Alert action block (Crítico tab) ──────────────────────────────────────
function AlertBlock({ alert, onDismiss, isLast }: { alert: any; onDismiss: (id: number) => void; isLast: boolean }) {
  const [, navigate] = useLocation();
  const cfg = typeConfig[alert.type] ?? { icon: AlertTriangle, label: alert.type };
  const Icon = cfg.icon;
  const isCritical = CRITICAL_TYPES.has(alert.type);
  const managerUrl = buildManagerUrl(alert.metaAccountId);

  const iconBoxStyle: React.CSSProperties = isCritical
    ? { background: "#FCEBEB", color: "#A32D2D" }
    : { background: "#FAEEDA", color: "#854F0B" };

  const handleAction = () => {
    if (cfg.isTokenIssue) {
      navigate("/settings");
    } else if (managerUrl) {
      window.open(managerUrl, "_blank", "noopener,noreferrer");
    }
  };

  const actionLabel = cfg.isTokenIssue ? "Reconectar" : "Ver no gerenciador";

  return (
    <div style={{ padding: "16px 18px", borderBottom: isLast ? "none" : "0.5px solid var(--color-border-tertiary)", display: "flex", gap: 14 }}>
      <div style={{ width: 38, height: 38, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, ...iconBoxStyle }}>
        <Icon size={17} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>{alert.title}</div>
            <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.6, maxWidth: 560 }}>{alert.message}</div>
            <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 8 }}>{timeAgo(alert.createdAt)}</div>
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            {(cfg.isTokenIssue || managerUrl) && (
              <div onClick={handleAction} style={{ padding: "7px 14px", background: "#FBEAF0", color: "#993556", borderRadius: 8, fontSize: 12, fontWeight: 500, border: "0.5px solid #ED93B1", cursor: "pointer", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 5 }}>
                {actionLabel} <ExternalLink size={12} />
              </div>
            )}
            <div onClick={() => onDismiss(alert.id)} style={{ width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-text-secondary)", borderRadius: 8, fontSize: 13, cursor: "pointer", border: "0.5px solid var(--color-border-tertiary)" }}>
              <Check size={14} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Notification row (Notificações tab) ───────────────────────────────────
function NotificationRow({ notif, isLast }: { notif: any; isLast: boolean }) {
  const cfg = typeConfig[notif.type] ?? { icon: Info, label: notif.type };
  const Icon = cfg.icon;
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 18px", borderBottom: isLast ? "none" : "0.5px solid var(--color-border-tertiary)" }}>
      <div style={{ width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, background: "#E6F1FB", color: "#0C447C" }}>
        <Icon size={14} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 500 }}>{notif.title}</div>
        <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 2 }}>{notif.message}</div>
        <div style={{ fontSize: 10, color: "var(--color-text-secondary)", marginTop: 4, display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ color: "#D4537E", fontWeight: 500 }}>{notif.accountName}</span>
          <span>·</span>
          <span>{timeAgo(notif.createdAt)}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────
export default function AlertsPage() {
  const [activeTab, setActiveTab] = useState<"critical" | "notifications">("critical");
  const [groupMode, setGroupMode] = useState<"account" | "type">("type");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [activeTypeFilter, setActiveTypeFilter] = useState<string | null>(null);
  const utils = trpc.useUtils();

  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const { data: allAlerts, isLoading } = trpc.alerts.listAll.useQuery();

  const markRead = trpc.alerts.markRead.useMutation({
    onSuccess: () => { utils.alerts.listAll.invalidate(); utils.alerts.unreadCount.invalidate(); },
  });

  const handleDismiss = (id: number) => markRead.mutate({ alertId: id });

  const criticalAlerts = useMemo(() => {
    if (!allAlerts) return [];
    return allAlerts.filter((a: any) => !a.isRead && (CRITICAL_TYPES.has(a.type) || WARNING_TYPES.has(a.type)));
  }, [allAlerts]);

  const notifications = useMemo(() => {
    if (!allAlerts) return [];
    return allAlerts.filter((a: any) => NOTIFICATION_TYPES.has(a.type)).slice(0, 50);
  }, [allAlerts]);

  const summaryStats = useMemo(() => {
    const accountSet = new Set(criticalAlerts.map((a: any) => a.accountId));
    const tokenIssues = criticalAlerts.filter((a: any) => a.type === "SYNC_ERROR").length;
    const budgetIssues = criticalAlerts.filter((a: any) => a.type === "BUDGET_WARNING").length;
    return { accounts: accountSet.size, tokenIssues, budgetIssues };
  }, [criticalAlerts]);

  // Versao sempre completa (nao filtrada) — alimenta os 4 cards de resumo no topo
  const allGroupedByType = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const a of criticalAlerts) {
      if (!map.has(a.type)) map.set(a.type, []);
      map.get(a.type)!.push(a);
    }
    return Array.from(map.entries()).map(([type, items]) => ({ type, items }));
  }, [criticalAlerts]);

  // Versao filtrada pelo card selecionado — alimenta a lista de baixo
  const filteredCriticalAlerts = useMemo(() => {
    if (!activeTypeFilter) return criticalAlerts;
    return criticalAlerts.filter((a: any) => a.type === activeTypeFilter);
  }, [criticalAlerts, activeTypeFilter]);

  const groupedByAccount = useMemo(() => {
    const map = new Map<number, { accountName: string | null; items: any[] }>();
    for (const a of filteredCriticalAlerts) {
      if (!map.has(a.accountId)) map.set(a.accountId, { accountName: a.accountName, items: [] });
      map.get(a.accountId)!.items.push(a);
    }
    return Array.from(map.entries()).map(([accountId, v]) => ({ accountId, ...v }));
  }, [filteredCriticalAlerts]);

  const groupedByType = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const a of filteredCriticalAlerts) {
      if (!map.has(a.type)) map.set(a.type, []);
      map.get(a.type)!.push(a);
    }
    return Array.from(map.entries()).map(([type, items]) => ({ type, items }));
  }, [filteredCriticalAlerts]);

  const panel: React.CSSProperties = { background: "#FFFFFF", border: "0.5px solid var(--color-border-secondary)", borderRadius: 12, overflow: "hidden" };

  return (
    <MetaDashboardLayout title="Alertas">
      <div style={{ padding: "24px 28px" }}>

        {/* Topbar */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 18, fontWeight: 500 }}>Alertas</div>
          <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 2 }}>Problemas técnicos e eventos das suas contas</div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 0, borderBottom: "0.5px solid var(--color-border-tertiary)", marginBottom: 18 }}>
          <div onClick={() => setActiveTab("critical")} style={{ padding: "10px 18px", fontSize: 13, cursor: "pointer", borderBottom: activeTab === "critical" ? "3px solid #D4537E" : "3px solid transparent", color: activeTab === "critical" ? "#D4537E" : "var(--color-text-secondary)", fontWeight: activeTab === "critical" ? 500 : 400, display: "flex", alignItems: "center", gap: 6 }}>
            <AlertTriangle size={15} />
            Crítico
            {criticalAlerts.length > 0 && <span style={{ background: "#FCEBEB", color: "#A32D2D", fontSize: 10, fontWeight: 500, padding: "1px 7px", borderRadius: 10 }}>{criticalAlerts.length}</span>}
          </div>
          <div onClick={() => setActiveTab("notifications")} style={{ padding: "10px 18px", fontSize: 13, cursor: "pointer", borderBottom: activeTab === "notifications" ? "3px solid #D4537E" : "3px solid transparent", color: activeTab === "notifications" ? "#D4537E" : "var(--color-text-secondary)", fontWeight: activeTab === "notifications" ? 500 : 400, display: "flex", alignItems: "center", gap: 6 }}>
            <Bell size={15} />
            Notificações
            {notifications.length > 0 && <span style={{ background: "var(--color-background-secondary)", color: "var(--color-text-secondary)", fontSize: 10, fontWeight: 500, padding: "1px 7px", borderRadius: 10 }}>{notifications.length}</span>}
          </div>
        </div>

        {isLoading ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: 40, color: "var(--color-text-secondary)", fontSize: 13 }}>
            <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> Carregando alertas...
          </div>
        ) : activeTab === "critical" ? (
          <>
            {/* Summary strip — clicável, filtra por tipo */}
            {(() => {
              const cards = allGroupedByType;
              return (
                <div className="flex gap-3" style={{ overflowX: "auto", scrollbarWidth: "none", marginBottom: 20, paddingBottom: 2 }}>
                  {cards.map((group) => {
                    const cfg = typeConfig[group.type] ?? { icon: AlertTriangle, label: group.type };
                    const Icon = cfg.icon;
                    const isSelected = activeTypeFilter === group.type;
                    const isCrit = CRITICAL_TYPES.has(group.type);
                    return (
                      <div key={group.type} onClick={() => setActiveTypeFilter(isSelected ? null : group.type)}
                        className="flex-shrink-0"
                        style={{ ...panel, width: 190, cursor: "pointer", borderLeft: isSelected ? "4px solid #D4537E" : "0.5px solid var(--color-border-secondary)", transition: "all 0.15s" }}>
                        <div style={{ padding: "16px 18px", display: "flex", alignItems: "center", gap: 12 }}>
                          <div style={{ width: 36, height: 36, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", background: isCrit ? "#FCEBEB" : "#FAEEDA", color: isCrit ? "#A32D2D" : "#854F0B", flexShrink: 0 }}>
                            <Icon size={17} />
                          </div>
                          <div className="min-w-0">
                            <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginBottom: 4 }} className="truncate">{cfg.label}</div>
                            <div style={{ fontSize: 22, fontWeight: 500, color: isCrit ? "#A32D2D" : "#854F0B" }}>{group.items.length}</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {/* Toggle */}
            {criticalAlerts.length > 0 && (
              <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                <div onClick={() => setGroupMode("account")} style={{ padding: "5px 12px", borderRadius: 20, border: groupMode === "account" ? "none" : "0.5px solid var(--color-border-secondary)", fontSize: 12, cursor: "pointer", color: groupMode === "account" ? "#fff" : "var(--color-text-secondary)", background: groupMode === "account" ? "#D4537E" : "#fff", fontWeight: groupMode === "account" ? 500 : 400 }}>Por conta</div>
                <div onClick={() => setGroupMode("type")} style={{ padding: "5px 12px", borderRadius: 20, border: groupMode === "type" ? "none" : "0.5px solid var(--color-border-secondary)", fontSize: 12, cursor: "pointer", color: groupMode === "type" ? "#fff" : "var(--color-text-secondary)", background: groupMode === "type" ? "#D4537E" : "#fff", fontWeight: groupMode === "type" ? 500 : 400 }}>Por tipo</div>
              </div>
            )}

            {/* Groups */}
            {filteredCriticalAlerts.length === 0 ? (
              <div style={panel}>
                <div style={{ padding: "48px 18px", textAlign: "center" }}>
                  <BellOff size={32} style={{ color: "var(--color-text-secondary)", opacity: 0.3, marginBottom: 10 }} />
                  <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
                    {activeTypeFilter ? "Nenhum alerta deste tipo" : "Nenhum alerta crítico"}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
                    {activeTypeFilter ? "Clique novamente no card para limpar o filtro." : "Todas as contas estão operando normalmente."}
                  </div>
                </div>
              </div>
            ) : groupMode === "account" ? (
              groupedByAccount.map((group) => {
                const key = `acct-${group.accountId}`;
                const isOpen = expandedGroups.has(key);
                return (
                  <div key={group.accountId} style={{ ...panel, borderLeft: "4px solid #D4537E", marginBottom: 12 }}>
                    <div onClick={() => toggleGroup(key)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", cursor: "pointer", userSelect: "none" }}>
                      <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#FBEAF0", color: "#993556", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 500, flexShrink: 0 }}>
                        {initials(group.accountName)}
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{group.accountName}</div>
                      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>{group.items.length} alerta{group.items.length !== 1 ? "s" : ""}</span>
                        <span style={{ fontSize: 12, color: "var(--color-text-secondary)", transform: isOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s", display: "inline-block" }}>▼</span>
                      </div>
                    </div>
                    {isOpen && (
                      <div style={{ borderTop: "0.5px solid var(--color-border-tertiary)" }}>
                        {group.items.map((alert: any, i: number) => (
                          <AlertBlock key={alert.id} alert={alert} onDismiss={handleDismiss} isLast={i === group.items.length - 1} />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              groupedByType.map((group) => {
                const cfg = typeConfig[group.type] ?? { icon: AlertTriangle, label: group.type };
                const Icon = cfg.icon;
                const key = `type-${group.type}`;
                const isOpen = expandedGroups.has(key);
                return (
                  <div key={group.type} style={{ ...panel, borderLeft: "4px solid #D4537E", marginBottom: 12 }}>
                    <div onClick={() => toggleGroup(key)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", cursor: "pointer", userSelect: "none" as const }}>
                      <Icon size={16} style={{ color: "#A32D2D" }} />
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{cfg.label}</div>
                      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>{group.items.length} ocorrência{group.items.length !== 1 ? "s" : ""}</span>
                        <span style={{ fontSize: 12, color: "var(--color-text-secondary)", transform: isOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s", display: "inline-block" }}>▼</span>
                      </div>
                    </div>
                    {isOpen && (
                      <div style={{ borderTop: "0.5px solid var(--color-border-tertiary)" }}>
                        {group.items.map((alert: any, i: number) => (
                          <div key={alert.id} style={{ borderBottom: i < group.items.length - 1 ? "0.5px solid var(--color-border-tertiary)" : "none", padding: "4px 0" }}>
                            <div style={{ padding: "4px 18px 0", fontSize: 11, color: "#D4537E", fontWeight: 500 }}>{alert.accountName}</div>
                            <AlertBlock alert={alert} onDismiss={handleDismiss} isLast={true} />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </>
        ) : (
          <div style={panel}>
            {notifications.length === 0 ? (
              <div style={{ padding: "48px 18px", textAlign: "center" }}>
                <Bell size={32} style={{ color: "var(--color-text-secondary)", opacity: 0.3, marginBottom: 10 }} />
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Nenhuma notificação ainda</div>
                <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>Eventos como ações aplicadas e atualizações de experimentos aparecem aqui.</div>
              </div>
            ) : (
              notifications.map((notif: any, i: number) => (
                <NotificationRow key={notif.id} notif={notif} isLast={i === notifications.length - 1} />
              ))
            )}
          </div>
        )}

      </div>
    </MetaDashboardLayout>
  );
}
