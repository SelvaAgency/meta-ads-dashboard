import { MetaDashboardLayout } from "@/components/MetaDashboardLayout";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle, Bell, BellOff, Info, Loader2, RefreshCw,
} from "lucide-react";
import React, { useState, useMemo } from "react";
import {
  AlertBlock, typeConfig, timeAgo,
  CRITICAL_TYPES, WARNING_TYPES, NOTIFICATION_TYPES,
} from "@/components/AlertBlock";

// Notificação sem conta de mídia (domínio Financeiro) agrupa sob esta chave.
const SEM_CONTA = -1;
// Tipos do sistema de notificações que entram na aba "Notificações".
const NOTIF_EXTRA_TYPES = new Set(["DAILY_BRIEFING", "WEEKLY_REPORT", "FINANCE_OVERDUE"]);

function initials(name: string | null | undefined): string {
  if (!name) return "??";
  const parts = name.replace(/^CA\s*[-–]\s*/i, "").trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
}

// AlertBlock agora vem de @/components/AlertBlock (compartilhado com o Dashboard)

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
  const [dominio, setDominio] = useState<"PERFORMANCE" | "FINANCEIRO" | null>(null);
  const [statusFilter, setStatusFilter] = useState<"nova" | "lida" | null>("nova");
  const utils = trpc.useUtils();

  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const { data: allAlerts, isLoading } = trpc.alerts.listAll.useQuery({
    ...(dominio ? { dominio } : {}),
    ...(statusFilter ? { status: statusFilter } : {}),
  });
  const { data: contagem } = trpc.alerts.unreadByDominio.useQuery();

  const markRead = trpc.alerts.markRead.useMutation({
    onSuccess: () => { utils.alerts.listAll.invalidate(); utils.alerts.unreadCount.invalidate(); },
  });

  const syncAlerts = trpc.alerts.sync.useMutation({
    onSuccess: () => { utils.alerts.listAll.invalidate(); utils.alerts.unreadCount.invalidate(); },
  });

  const handleDismiss = (id: number) => markRead.mutate({ alertId: id });

  // O status (nova/lida) já vem filtrado do servidor — aqui só separamos as duas
  // abas por tipo. FINANCE_OVERDUE e os relatórios entram como notificação.
  const criticalAlerts = useMemo(() => {
    if (!allAlerts) return [];
    return allAlerts.filter((a: any) => CRITICAL_TYPES.has(a.type) || WARNING_TYPES.has(a.type) || a.type === "ANOMALY");
  }, [allAlerts]);

  const notifications = useMemo(() => {
    if (!allAlerts) return [];
    return allAlerts.filter((a: any) => NOTIFICATION_TYPES.has(a.type) || NOTIF_EXTRA_TYPES.has(a.type)).slice(0, 50);
  }, [allAlerts]);

  // Notificacoes divididas por conta (sem agrupar/agregar eventos do mesmo tipo)
  const groupedNotifications = useMemo(() => {
    const map = new Map<number, { accountName: string | null; items: any[]; lastDate: number }>();
    for (const n of notifications) {
      const ts = new Date(n.createdAt).getTime();
      const key = n.accountId ?? SEM_CONTA;
      if (!map.has(key)) map.set(key, { accountName: n.accountName ?? "Financeiro", items: [], lastDate: ts });
      const group = map.get(key)!;
      group.items.push(n);
      if (ts > group.lastDate) group.lastDate = ts;
    }
    return Array.from(map.entries())
      .map(([accountId, v]) => ({ accountId, ...v }))
      .sort((a, b) => b.lastDate - a.lastDate);
  }, [notifications]);

  const clearNotifications = trpc.alerts.clearNotifications.useMutation({
    onSuccess: () => { utils.alerts.listAll.invalidate(); },
  });

  const summaryStats = useMemo(() => {
    const accountSet = new Set(criticalAlerts.map((a: any) => a.accountId ?? SEM_CONTA));
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
      const key = a.accountId ?? SEM_CONTA;
      if (!map.has(key)) map.set(key, { accountName: a.accountName ?? "Financeiro", items: [] });
      map.get(key)!.items.push(a);
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
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 500 }}>Alertas</div>
            <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 2 }}>Problemas técnicos e eventos das suas contas</div>
          </div>
          <button
            onClick={() => syncAlerts.mutate()}
            disabled={syncAlerts.isPending}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "7px 14px", borderRadius: 8,
              border: "0.5px solid var(--color-border-secondary)",
              background: "#fff", fontSize: 12, fontWeight: 500,
              color: "var(--color-text-secondary)", cursor: syncAlerts.isPending ? "default" : "pointer",
              opacity: syncAlerts.isPending ? 0.7 : 1,
            }}
          >
            <RefreshCw size={13} style={{ animation: syncAlerts.isPending ? "spin 1s linear infinite" : undefined }} />
            {syncAlerts.isPending ? "Sincronizando..." : "Sincronizar"}
          </button>
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

        {/* Filtros: domínio × status */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>Domínio</span>
            {([[null, "Todos"], ["PERFORMANCE", "Performance"], ["FINANCEIRO", "Financeiro"]] as const).map(([v, lbl]) => {
              const n = v === "PERFORMANCE" ? contagem?.PERFORMANCE ?? 0 : v === "FINANCEIRO" ? contagem?.FINANCEIRO ?? 0 : (contagem?.PERFORMANCE ?? 0) + (contagem?.FINANCEIRO ?? 0);
              return (
                <button key={String(v)} onClick={() => setDominio(v)} style={{
                  padding: "4px 10px", borderRadius: 999, fontSize: 11, cursor: "pointer",
                  border: "0.5px solid " + (dominio === v ? "#D4537E" : "var(--color-border-secondary)"),
                  background: dominio === v ? "#FCEFF4" : "#fff", color: dominio === v ? "#D4537E" : "var(--color-text-secondary)",
                  fontWeight: dominio === v ? 500 : 400,
                }}>{lbl}{n > 0 ? ` · ${n}` : ""}</button>
              );
            })}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>Status</span>
            {([["nova", "Novas"], ["lida", "Lidas"], [null, "Todas"]] as const).map(([v, lbl]) => (
              <button key={String(v)} onClick={() => setStatusFilter(v)} style={{
                padding: "4px 10px", borderRadius: 999, fontSize: 11, cursor: "pointer",
                border: "0.5px solid " + (statusFilter === v ? "#D4537E" : "var(--color-border-secondary)"),
                background: statusFilter === v ? "#FCEFF4" : "#fff", color: statusFilter === v ? "#D4537E" : "var(--color-text-secondary)",
                fontWeight: statusFilter === v ? 500 : 400,
              }}>{lbl}</button>
            ))}
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
                <div className="flex gap-3" style={{ overflowX: "auto", scrollbarWidth: "none", marginBottom: 20, paddingBottom: 4 }}>
                  {cards.map((group) => {
                    const cfg = typeConfig[group.type] ?? { icon: AlertTriangle, label: group.type };
                    const Icon = cfg.icon;
                    const isSelected = activeTypeFilter === group.type;
                    const isCrit = CRITICAL_TYPES.has(group.type);
                    return (
                      <button key={group.type} onClick={() => setActiveTypeFilter(isSelected ? null : group.type)}
                        className="flex-shrink-0 text-left transition-all hover:shadow-md"
                        style={{ ...panel, width: 220, cursor: "pointer", borderLeft: isSelected ? "4px solid #D4537E" : "0.5px solid var(--color-border-secondary)", boxShadow: isSelected ? "0 2px 8px rgba(212,83,126,0.15)" : "none" }}>
                        <div style={{ padding: "18px 20px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                            <div style={{ width: 42, height: 42, borderRadius: 11, display: "flex", alignItems: "center", justifyContent: "center", background: isCrit ? "#FCEBEB" : "#FAEEDA", color: isCrit ? "#A32D2D" : "#854F0B", flexShrink: 0 }}>
                              <Icon size={20} />
                            </div>
                            <div className="min-w-0">
                              <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }} className="truncate">{cfg.label}</div>
                            </div>
                          </div>
                          <div style={{ fontSize: 28, fontWeight: 500, color: isCrit ? "#A32D2D" : "#854F0B" }}>{group.items.length}</div>
                          <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 2 }}>
                            ocorrência{group.items.length !== 1 ? "s" : ""}
                          </div>
                        </div>
                      </button>
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
          <>
            {notifications.length > 0 && (
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
                <div
                  onClick={() => { if (confirm("Limpar todas as notificações? Esta ação não pode ser desfeita.")) clearNotifications.mutate(); }}
                  style={{ fontSize: 11, color: "var(--color-text-secondary)", cursor: "pointer", padding: "4px 10px", borderRadius: 8, border: "0.5px solid var(--color-border-secondary)" }}
                >
                  Limpar notificações
                </div>
              </div>
            )}
            {notifications.length === 0 ? (
              <div style={panel}>
                <div style={{ padding: "48px 18px", textAlign: "center" }}>
                  <Bell size={32} style={{ color: "var(--color-text-secondary)", opacity: 0.3, marginBottom: 10 }} />
                  <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Nenhuma notificação ainda</div>
                  <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>Eventos como ações aplicadas e atualizações de experimentos aparecem aqui.</div>
                </div>
              </div>
            ) : (
              groupedNotifications.map((group) => (
                <div key={group.accountId} style={{ ...panel, marginBottom: 12 }}>
                  <div style={{ padding: "10px 18px", borderBottom: "0.5px solid var(--color-border-tertiary)", fontSize: 12, fontWeight: 500, color: "var(--color-text-secondary)" }}>
                    {group.accountName}
                  </div>
                  {group.items.map((notif: any, i: number) => (
                    <NotificationRow key={notif.id} notif={notif} isLast={i === group.items.length - 1} />
                  ))}
                </div>
              ))
            )}
          </>
        )}

      </div>
    </MetaDashboardLayout>
  );
}
