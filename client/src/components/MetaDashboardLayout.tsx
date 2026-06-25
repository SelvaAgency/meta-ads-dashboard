import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { useActiveAccount } from "@/contexts/ActiveAccountContext";
import { getIntegrationStatus } from "@/config/clientConfig";
import {
  Users,
  BarChart3,
  Bell,
  ChevronDown,
  ChevronRight,
  FileText,
  FlaskConical,
  Home,
  LayoutDashboard,
  Link2,
  LogOut,
  Lightbulb,
  TrendingUp,
  Settings,
  AlertTriangle,
  Info,
  Loader2,
  Sparkles,
  Wallet,
} from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { SelvaLogo } from "@/components/SelvaLogo";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface MetaDashboardLayoutProps {
  children: React.ReactNode;
  title?: string;
}

// ─── Colour tokens ────────────────────────────────────────────────────────────
const ACTIVE_BG   = "rgba(212,83,126,0.15)";
const ACTIVE_CLR  = "#D4537E";
const HOVER_CLS   = "hover:bg-white/[0.06]";
const TEXT_NORMAL = "rgba(255,255,255,0.55)";
const TEXT_DIM    = "rgba(255,255,255,0.35)";
const DIVIDER     = "0.5px solid rgba(255,255,255,0.08)";

export function MetaDashboardLayout({ children, title }: MetaDashboardLayoutProps) {
  const { user, loading, isAuthenticated, logout } = useAuth();
  const [location, navigate] = useLocation();
  const [pinnedOpen, setPinnedOpen] = useState(true);
  const [hovering, setHovering] = useState(false);
  const [clientDropdownOpen, setClientDropdownOpen] = useState(false);
  const leaveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sidebarOpen = pinnedOpen || hovering || clientDropdownOpen;

  const {
    activeAccount,
    activeAccountId,
    activeClient,
    clientAccounts,
    setActiveClient,
    clearActiveAccount,
  } = useActiveAccount();

  const { data: unreadCount } = trpc.alerts.unreadCount.useQuery(
    { accountId: activeAccountId ?? undefined },
    { enabled: isAuthenticated, refetchInterval: 30000 }
  );

  const { data: globalUnreadCount } = trpc.alerts.unreadCount.useQuery(
    {},
    { enabled: isAuthenticated, refetchInterval: 30000 }
  );

  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  const { data: recentAlerts, isLoading: notifLoading } = trpc.alerts.listAll.useQuery(undefined, {
    enabled: isAuthenticated && notifOpen,
    refetchInterval: notifOpen ? 15000 : false,
  });

  useEffect(() => {
    if (!notifOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [notifOpen]);

  const NOTIF_CRITICAL_TYPES = new Set(["SYNC_ERROR", "PAYMENT_FAILED", "AD_REJECTED", "PIXEL_ERROR", "PAGE_UNLINKED", "CAMPAIGN_PAUSED"]);
  const NOTIF_WARNING_TYPES = new Set(["AD_ERROR", "BUDGET_WARNING", "INSTAGRAM_UNLINKED", "ADSET_NO_DELIVERY"]);

  function notifIcon(type: string) {
    if (type === "SYNC_ERROR") return Link2;
    if (type === "BUDGET_WARNING") return Wallet;
    if (type === "SUGGESTION_APPLIED") return Sparkles;
    if (NOTIF_CRITICAL_TYPES.has(type) || NOTIF_WARNING_TYPES.has(type)) return AlertTriangle;
    return Info;
  }

  function notifTimeAgo(date: string | Date): string {
    const d = new Date(date);
    const mins = Math.floor((Date.now() - d.getTime()) / 60000);
    if (mins < 1) return "agora";
    if (mins < 60) return `${mins}min`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    return `${days}d`;
  }

  const recentItems = (recentAlerts ?? []).slice(0, 8);

  const hasClient = !!activeClient;

  // Account-specific nav items (require a client to be selected)
  const accountNavItems = [
    { path: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { path: "/campaigns", label: "Campanhas", icon: BarChart3 },
    { path: "/reports", label: "Relatórios", icon: FileText },
    { path: "/google-ads", label: "Google Ads", icon: TrendingUp },
  ];

  // ── Loading / Auth guards ──────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <p className="text-muted-foreground text-sm">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-6 max-w-md px-4">
          <div className="flex items-center justify-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-black text-lg" style={{ fontFamily: "Montserrat, sans-serif" }}>S</span>
            </div>
            <span className="text-xl font-semibold text-foreground">Selva Agency</span>
          </div>
          <h1 className="text-3xl font-bold text-foreground">Acesse sua plataforma</h1>
          <p className="text-muted-foreground">Use suas credenciais para acessar o BIT.</p>
          <Button size="lg" className="w-full" onClick={() => (window.location.href = getLoginUrl())}>
            Entrar no BIT
          </Button>
        </div>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background flex">

      {/* ═══════════════════════════════ SIDEBAR ══════════════════════════════ */}
      <aside
        className={`${sidebarOpen ? "w-64" : "w-16"} flex-shrink-0 flex flex-col transition-all duration-200 z-20`}
        style={{ background: "#0D0D0D", borderRight: "1px solid rgba(255,255,255,0.06)" }}
        onMouseEnter={() => {
          if (leaveTimeout.current) clearTimeout(leaveTimeout.current);
          setHovering(true);
        }}
        onMouseLeave={() => {
          leaveTimeout.current = setTimeout(() => setHovering(false), 300);
        }}
      >

        {/* ── SECTION 1: Logo + Visão Geral ─────────────────────────────────── */}
        <div className={`pt-5 pb-3 ${sidebarOpen ? "px-3" : "px-2"}`}>

          {/* Logo */}
          <div className={`flex items-center gap-3 mb-3 min-h-[32px] ${sidebarOpen ? "px-1" : "justify-center"}`}>
            <SelvaLogo size={40} />
            {sidebarOpen && (
              <div className="overflow-hidden min-w-0">
                <p className="text-xs font-semibold truncate" style={{ letterSpacing: "0.04em", color: "#FDFFED" }}>
                  Brand Tracker
                </p>
                <p className="text-[10px] truncate" style={{ color: TEXT_DIM }}>by SELVA Space</p>
              </div>
            )}
          </div>

          {/* Visão Geral — always accessible */}
          {(() => {
            const isActive = location === "/";
            return (
              <div
                onClick={() => { clearActiveAccount(); navigate("/"); }}
                className={`flex items-center ${sidebarOpen ? "gap-3 px-3" : "justify-center"} py-2 rounded-lg cursor-pointer transition-all duration-150 ${!isActive ? HOVER_CLS : ""}`}
                style={isActive ? { background: ACTIVE_BG, color: ACTIVE_CLR } : { color: TEXT_NORMAL }}
              >
                <Home className="w-4 h-4 flex-shrink-0" />
                {sidebarOpen && <span className="text-sm font-medium flex-1 truncate">Visão Geral</span>}
              </div>
            );
          })()}

          {/* Configurações — always accessible */}
          {(() => {
            const isActive = location === "/settings";
            return (
              <Link href="/settings">
                <div
                  className={`flex items-center ${sidebarOpen ? "gap-3 px-3" : "justify-center"} py-2 rounded-lg cursor-pointer transition-all duration-150 ${!isActive ? HOVER_CLS : ""}`}
                  style={isActive ? { background: ACTIVE_BG, color: ACTIVE_CLR } : { color: TEXT_NORMAL }}
                >
                  <Settings className="w-4 h-4 flex-shrink-0" />
                  {sidebarOpen && <span className="text-sm font-medium flex-1 truncate">Configurações</span>}
                </div>
              </Link>
            );
          })()}

          {/* Alertas — always accessible, badge shows total across all accounts */}
          {(() => {
            const isActive = location === "/alerts";
            return (
              <Link href="/alerts">
                <div
                  className={`flex items-center ${sidebarOpen ? "gap-3 px-3" : "justify-center"} py-2 rounded-lg cursor-pointer transition-all duration-150 ${!isActive ? HOVER_CLS : ""}`}
                  style={isActive ? { background: ACTIVE_BG, color: ACTIVE_CLR } : { color: TEXT_NORMAL }}
                >
                  <Bell className="w-4 h-4 flex-shrink-0" />
                  {sidebarOpen && (
                    <>
                      <span className="text-sm font-medium flex-1 truncate">Alertas</span>
                      {globalUnreadCount != null && globalUnreadCount > 0 && (
                        <Badge variant="destructive" className="h-5 min-w-5 px-1.5 text-xs flex items-center justify-center font-bold shadow-sm">
                          {globalUnreadCount > 99 ? "99+" : globalUnreadCount}
                        </Badge>
                      )}
                    </>
                  )}
                </div>
              </Link>
            );
          })()}
        </div>

        {/* Divider */}
        <div style={{ borderTop: DIVIDER, margin: "0 12px" }} />

        {/* ── SECTION 2: Client Selector + Account Nav ──────────────────────── */}
        <div className={`flex-1 py-3 overflow-y-auto flex flex-col ${sidebarOpen ? "px-3" : "px-2"}`}>

          {/* "CLIENTE" label */}
          {sidebarOpen && (
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] mb-2 px-1" style={{ color: "rgba(255,255,255,0.28)" }}>
              Cliente
            </p>
          )}

          {/* Client selector ─────────────────────────────────── */}
          {clientAccounts.length === 0 ? (
            /* No Meta accounts connected yet */
            sidebarOpen ? (
              <Link href="/settings">
                <button
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg transition-all ${HOVER_CLS}`}
                  style={{ border: "0.5px dashed rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.4)" }}
                >
                  <Users className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="text-xs font-medium flex-1 text-left">Conectar conta</span>
                </button>
              </Link>
            ) : (
              <Link href="/settings">
                <button
                  className={`w-full h-8 flex items-center justify-center rounded-lg transition-all ${HOVER_CLS}`}
                  style={{ border: "0.5px dashed rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.4)" }}
                >
                  <Link2 className="w-3.5 h-3.5" />
                </button>
              </Link>
            )
          ) : (
            /* Has clients — dropdown */
            <DropdownMenu onOpenChange={setClientDropdownOpen}>
              <DropdownMenuTrigger asChild>
                {sidebarOpen ? (
                  <button
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg transition-all ${HOVER_CLS}`}
                    style={{ border: activeClient ? "0.5px solid rgba(255,255,255,0.1)" : "0.5px dashed rgba(255,255,255,0.15)" }}
                  >
                    <div
                      className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 font-bold text-xs overflow-hidden"
                      style={{ background: "rgba(212,83,126,0.2)", color: ACTIVE_CLR }}
                    >
                      {activeAccount?.pictureUrl
                        ? <img src={activeAccount.pictureUrl} alt="" className="w-full h-full object-cover" />
                        : (activeClient?.shortName ?? <Users className="w-3.5 h-3.5" />)}
                    </div>
                    <div className="flex-1 text-left overflow-hidden">
                      <p className="text-xs font-semibold truncate" style={{ color: activeClient ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.45)" }}>
                        {activeClient?.name ?? "Selecionar cliente"}
                      </p>
                      {activeClient && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <span className="text-[9px] px-1 rounded" style={{ background: "rgba(59,130,246,0.15)", color: "#60a5fa" }}>Meta</span>
                          {activeClient.ga4PropertyId && (
                            <span className="text-[9px] px-1 rounded" style={{ background: "rgba(16,185,129,0.15)", color: "#34d399" }}>GA4</span>
                          )}
                          {activeClient.googleAdsCustomerId && (
                            <span className="text-[9px] px-1 rounded" style={{ background: "rgba(245,158,11,0.15)", color: "#fbbf24" }}>Ads</span>
                          )}
                        </div>
                      )}
                    </div>
                    <ChevronDown className="w-3 h-3 flex-shrink-0" style={{ color: TEXT_DIM }} />
                  </button>
                ) : (
                  <button
                    className={`w-full h-8 flex items-center justify-center rounded-lg transition-all text-[10px] font-bold overflow-hidden ${HOVER_CLS}`}
                    style={{
                      border: activeClient ? "0.5px solid rgba(255,255,255,0.1)" : "0.5px dashed rgba(255,255,255,0.15)",
                      background: "rgba(212,83,126,0.12)",
                      color: ACTIVE_CLR,
                    }}
                  >
                    {activeAccount?.pictureUrl
                      ? <img src={activeAccount.pictureUrl} alt="" className="w-full h-full object-cover" />
                      : (activeClient?.shortName ?? <Users className="w-3.5 h-3.5" />)}
                  </button>
                )}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" side={sidebarOpen ? "bottom" : "right"} className="w-64 max-h-80 overflow-y-auto">
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  Clientes ({clientAccounts.length})
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {clientAccounts.map((ca) => {
                  const isActiveCa = activeClient?.slug === ca.client.slug;
                  const integrations = getIntegrationStatus(ca.client);
                  return (
                    <DropdownMenuItem
                      key={ca.client.slug}
                      onClick={() => { setActiveClient(ca.client.slug); navigate(location); }}
                      className="flex items-center gap-2.5 cursor-pointer py-2"
                    >
                      <div className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 font-bold text-[10px] overflow-hidden ${isActiveCa ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}>
                        {ca.accounts[0]?.pictureUrl
                          ? <img src={ca.accounts[0].pictureUrl} alt="" className="w-full h-full object-cover rounded-md" />
                          : ca.client.shortName}
                      </div>
                      <div className="flex-1 overflow-hidden">
                        <p className="text-xs font-medium truncate">{ca.client.name}</p>
                        <div className="flex items-center gap-1 mt-0.5">
                          {integrations.meta && <span className="text-[9px] px-1 rounded bg-blue-500/15 text-blue-400">Meta</span>}
                          {integrations.ga4 && <span className="text-[9px] px-1 rounded bg-emerald-500/15 text-emerald-400">GA4</span>}
                          {integrations.googleAds && <span className="text-[9px] px-1 rounded bg-amber-500/15 text-amber-400">Ads</span>}
                        </div>
                      </div>
                      {isActiveCa && <div className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />}
                    </DropdownMenuItem>
                  );
                })}
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/settings">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer w-full">
                      <Link2 className="w-3.5 h-3.5" />
                      Gerenciar contas
                    </div>
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Account nav items ───────────────────────────────── */}
          <div className="mt-3 flex flex-col gap-0.5">
            {accountNavItems.map((item) => {
              const isActive = location === item.path;
              const Icon = item.icon;
              return (
                <div
                  key={item.path}
                  style={!hasClient ? { opacity: 0.25, pointerEvents: "none" as const } : {}}
                >
                  <Link href={item.path}>
                    <div
                      className={`flex items-center ${sidebarOpen ? "gap-3 px-3" : "justify-center"} py-2 rounded-lg cursor-pointer transition-all duration-150 ${!isActive ? HOVER_CLS : ""}`}
                      style={isActive ? { background: ACTIVE_BG, color: ACTIVE_CLR } : { color: TEXT_NORMAL }}
                    >
                      <Icon className="w-4 h-4 flex-shrink-0" />
                      {sidebarOpen && (
                        <span className="text-sm font-medium flex-1 truncate">{item.label}</span>
                      )}
                    </div>
                  </Link>
                  {/* Sugestões IA sub-item */}
                  {item.path === "/dashboard" && sidebarOpen && (
                    <Link href="/suggestions">
                      <div
                        className={`flex items-center gap-2.5 pl-9 pr-3 py-1.5 rounded-lg cursor-pointer transition-all duration-150 ${location !== "/suggestions" ? HOVER_CLS : ""}`}
                        style={location === "/suggestions" ? { background: ACTIVE_BG, color: ACTIVE_CLR } : { color: "rgba(255,255,255,0.4)" }}
                      >
                        <Lightbulb className="w-3.5 h-3.5 flex-shrink-0" />
                        <span className="text-xs font-medium flex-1 truncate">Plano de Ação</span>
                      </div>
                    </Link>
                  )}
                  {/* Experimentos sub-item */}
                  {item.path === "/dashboard" && sidebarOpen && (
                    <Link href="/experiments">
                      <div
                        className={`flex items-center gap-2.5 pl-9 pr-3 py-1.5 rounded-lg cursor-pointer transition-all duration-150 ${location !== "/experiments" && !location.startsWith("/experiments/") ? HOVER_CLS : ""}`}
                        style={location === "/experiments" || location.startsWith("/experiments/") ? { background: ACTIVE_BG, color: ACTIVE_CLR } : { color: "rgba(255,255,255,0.4)" }}
                      >
                        <FlaskConical className="w-3.5 h-3.5 flex-shrink-0" />
                        <span className="text-xs font-medium flex-1 truncate">Experimentos</span>
                      </div>
                    </Link>
                  )}
                </div>
              );
            })}
          </div>

        </div>

        {/* ── User footer ───────────────────────────────────────────────────── */}
        <div style={{ borderTop: DIVIDER }} className="p-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className={`w-full flex items-center ${sidebarOpen ? "gap-2.5 px-2" : "justify-center"} py-2 rounded-lg transition-all ${HOVER_CLS}`}>
                <Avatar className="w-7 h-7 flex-shrink-0">
                  <AvatarFallback className="text-xs font-bold" style={{ background: "rgba(212,83,126,0.3)", color: ACTIVE_CLR }}>
                    {user?.name?.[0]?.toUpperCase() ?? "U"}
                  </AvatarFallback>
                </Avatar>
                {sidebarOpen && (
                  <>
                    <div className="flex-1 text-left overflow-hidden">
                      <p className="text-xs font-semibold truncate" style={{ color: "rgba(255,255,255,0.8)" }}>{user?.name ?? "Usuário"}</p>
                      <p className="text-[10px] truncate" style={{ color: TEXT_DIM }}>{user?.email ?? ""}</p>
                    </div>
                    <ChevronDown className="w-3 h-3 flex-shrink-0" style={{ color: TEXT_DIM }} />
                  </>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={logout} className="text-destructive">
                <LogOut className="w-4 h-4 mr-2" />
                Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* ═══════════════════════════ MAIN CONTENT ═════════════════════════════ */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="h-16 border-b border-border flex items-center justify-between px-6 bg-background sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setPinnedOpen(!pinnedOpen)}
              className="p-1.5 rounded-md hover:bg-primary/10 text-muted-foreground hover:text-primary transition-all hover:shadow-sm"
            >
              <LayoutDashboard className="w-4 h-4" />
            </button>
            {(title || location === "/") && (
              <h1 className="text-sm font-bold text-foreground" style={{ fontFamily: "Montserrat, sans-serif", textTransform: "uppercase", letterSpacing: "1px" }}>
                {title ?? "Visão Geral"}
              </h1>
            )}
            {/* Breadcrumb */}
            <div className="flex items-center gap-1.5 text-xs">
              {location !== "/" && (
                <button
                  onClick={() => { clearActiveAccount(); navigate("/"); }}
                  className="font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  Visão Geral
                </button>
              )}
              {location !== "/" && activeClient && (
                <ChevronRight className="w-3 h-3 text-muted-foreground/40" />
              )}
              {activeClient && (
                <span className="font-bold px-2 py-1 rounded-md bg-primary/10 text-primary">
                  {activeAccount?.displayName ?? activeClient.name}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative" ref={notifRef}>
              <button
                onClick={() => setNotifOpen((o) => !o)}
                className="relative p-2 rounded-lg hover:bg-primary/10 transition-all text-muted-foreground hover:text-primary hover:shadow-sm"
              >
                <Bell className="w-4 h-4" />
                {unreadCount != null && unreadCount > 0 && (
                  <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-primary rounded-full animate-pulse shadow-lg shadow-primary/50" />
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 top-full mt-2 w-96 bg-card border border-border rounded-xl shadow-lg z-50 overflow-hidden">
                  <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                    <span className="text-sm font-medium">Notificações</span>
                    <Link href="/alerts">
                      <span
                        onClick={() => setNotifOpen(false)}
                        className="text-xs text-primary cursor-pointer hover:underline"
                      >
                        Ver tudo
                      </span>
                    </Link>
                  </div>

                  <div className="max-h-96 overflow-y-auto">
                    {notifLoading ? (
                      <div className="flex items-center gap-2 px-4 py-6 text-xs text-muted-foreground">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Carregando...
                      </div>
                    ) : recentItems.length === 0 ? (
                      <div className="px-4 py-8 text-center">
                        <Bell className="w-6 h-6 text-muted-foreground/30 mx-auto mb-2" />
                        <div className="text-xs text-muted-foreground">Nenhuma notificação por aqui</div>
                      </div>
                    ) : (
                      recentItems.map((alert: any) => {
                        const Icon = notifIcon(alert.type);
                        const isCrit = NOTIF_CRITICAL_TYPES.has(alert.type);
                        const isWarn = NOTIF_WARNING_TYPES.has(alert.type);
                        const iconColor = isCrit ? "text-red-500" : isWarn ? "text-amber-500" : "text-blue-500";
                        const iconBg = isCrit ? "bg-red-500/10" : isWarn ? "bg-amber-500/10" : "bg-blue-500/10";
                        return (
                          <Link key={alert.id} href="/alerts">
                            <div
                              onClick={() => setNotifOpen(false)}
                              className={`flex items-start gap-3 px-4 py-3 border-b border-border/50 last:border-b-0 cursor-pointer hover:bg-accent/30 transition-colors ${!alert.isRead ? "bg-primary/[0.03]" : ""}`}
                            >
                              <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${iconBg} ${iconColor}`}>
                                <Icon className="w-3.5 h-3.5" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="text-xs font-medium leading-snug">{alert.title}</div>
                                <div className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{alert.message}</div>
                                <div className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1.5">
                                  <span className="text-primary font-medium">{alert.accountName}</span>
                                  <span>·</span>
                                  <span>{notifTimeAgo(alert.createdAt)}</span>
                                </div>
                              </div>
                              {!alert.isRead && (
                                <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0 mt-1" />
                              )}
                            </div>
                          </Link>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
