import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { useActiveAccount } from "@/contexts/ActiveAccountContext";
import {
  AlertTriangle,
  BarChart3,
  Bell,
  ChevronDown,
  FileText,
  LayoutDashboard,
  Link2,
  LogOut,
  Lightbulb,
  RefreshCw,
  TrendingUp,
  Zap,
  ChevronRight,
  Building2,
  PieChart,
  CalendarCheck,
} from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "wouter";
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

interface NavItem {
  path: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
}

interface MetaDashboardLayoutProps {
  children: React.ReactNode;
  title?: string;
}

export function MetaDashboardLayout({ children, title }: MetaDashboardLayoutProps) {
  const { user, loading, isAuthenticated, logout } = useAuth();
  const [location] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { activeAccount, activeAccountId, accounts, setActiveAccountId } = useActiveAccount();

  const { data: unreadCount } = trpc.alerts.unreadCount.useQuery(
    { accountId: activeAccountId ?? undefined },
    { enabled: isAuthenticated, refetchInterval: 30000 }
  );

  // Load all schedules to show indicator per account in the dropdown
  const { data: allSchedules } = trpc.reports.list.useQuery(undefined, {
    enabled: isAuthenticated,
    refetchInterval: 60000,
  });

  // Build a map: accountId -> schedule summary string
  const scheduleMap = new Map<number, string>();
  if (allSchedules) {
    for (const s of allSchedules) {
      if (s.isActive && s.accountId) {
        const DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
        const freq = s.frequency === "DAILY" ? "Diário" : "Semanal";
        const dayLabel = s.frequency === "WEEKLY" ? `, ${DAYS[s.scheduleDay ?? 1]}` : "";
        const time = `${String(s.scheduleHour ?? 8).padStart(2, "0")}:${String(s.scheduleMinute ?? 0).padStart(2, "0")}`;
        scheduleMap.set(s.accountId, `Relatório agendado: ${freq}${dayLabel}, ${time}h`);
      }
    }
  }

  const navItems: NavItem[] = [
    { path: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { path: "/campaigns", label: "Campanhas", icon: BarChart3 },
    { path: "/anomalies", label: "Anomalias", icon: AlertTriangle },
    { path: "/alerts", label: "Alertas", icon: Bell, badge: unreadCount ?? 0 },
    { path: "/suggestions", label: "Sugestões IA", icon: Lightbulb },
    { path: "/reports", label: "Relatórios", icon: FileText },
    { path: "/dashboard-builder", label: "Dashboard Builder", icon: PieChart },
    { path: "/google-ads", label: "Google Ads", icon: TrendingUp },
  ];

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
              <span className="text-primary-foreground font-black text-lg" style={{fontFamily: "Montserrat, sans-serif"}}>S</span>
            </div>
            <span className="text-xl font-semibold text-foreground">Selva Agency</span>
          </div>
          <h1 className="text-3xl font-bold text-foreground">Acesse sua plataforma</h1>
          <p className="text-muted-foreground">
            Faça login para acessar o dashboard de análise e otimização de campanhas.
          </p>
          <Button
            size="lg"
            className="w-full"
            onClick={() => (window.location.href = getLoginUrl())}
          >
            Entrar com Manus
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside
        className={`${sidebarOpen ? "w-64" : "w-16"} flex-shrink-0 bg-sidebar border-r border-sidebar-border flex flex-col transition-all duration-200 shadow-lg`}
      >
        {/* Logo */}
        <div className="h-16 flex items-center px-4 border-b border-sidebar-border gap-3">
          <div className="w-9 h-9 flex items-center justify-center flex-shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 375.83 351.38" className="w-9 h-9" fill="currentColor" style={{color: '#F5ADCC'}}>
              <path d="M347.21,215.61c0,54.54-46.88,82.54-143.24,85.37,19.34-12.75,38.53-27.58,56.93-44.15,27.51-24.74,51.36-51.6,70.14-78.67,10.17,9.3,16.23,21.46,16.18,37.45Z"/>
              <path d="M360.77,20.16c-19.78-22-56.48-26.15-103.32-11.67-23,7.1-47.17,18.31-71.3,32.91-5.52,3.33-11.03,6.83-16.52,10.53-38.9,1.19-69.12,6.49-92,16.11-33.48,14.05-50.41,37.41-50.41,69.39-.06,16.05,6.09,28.23,16.36,37.53-12,17.51-21.88,35.12-29.25,52.28-19.34,45.04-19.09,81.97.72,103.98,12.03,13.39,30.32,20.17,53.35,20.17,14.83,0,31.63-2.82,49.99-8.51,27.54-8.49,56.76-22.88,85.59-41.9-3.9.12-7.85.21-11.92.24-45.31,28.4-89.48,44.02-123.45,44.02-20.8,0-37.79-5.85-48.91-18.22-21.09-23.43-16.66-65.45,7.34-112.45l.21,1.61c9.38,78.2,87.48,84.88,159.96,85.05,1.62,0,3.26,0,4.86-.01,21.62-13.53,43.5-29.98,64.66-49.03,27.32-24.57,50.95-51.2,69.5-78.02-30.82-23-89.73-25.99-136.48-28.33l-.42-.04c-17.23-.82-33.52-1.58-44.77-3.39-13.49-2.12-14.32-4.91-14.32-4.94,0-10.96,21.3-17.5,56.98-17.5,32.08,0,49.85,6.12,57.62,19.85l1.37,2.44h99.65c-5.67,10.59-12.25,21.27-19.63,31.9,1.71,1.28,3.32,2.61,4.83,4,12.57-18.11,22.87-36.27,30.47-54,19.34-45.05,19.09-81.97-.74-104ZM184.7,207.09h.4c19.41.92,33.98,1.73,44.76,3.48,13.5,2.16,14.35,4.99,14.35,5.04,0,10.61-22.38,17.51-57.01,17.51-31.48,0-49.81-6.31-57.63-19.9l-1.39-2.4H28.99c5.55-10.45,12.04-21.13,19.42-31.9,30.86,22.81,89.64,25.79,136.29,28.17ZM355.77,121.68c-2.48,5.8-5.24,11.63-8.31,17.51l-.28-2.3c-9.25-77.75-84.09-84.73-159.99-85.22-1.97,0-3.91,0-5.85.04C255.3,4.66,326.54-8.55,356.13,24.35c18.08,20.09,17.95,54.65-.36,97.33Z"/>
            </svg>
          </div>
          {sidebarOpen && (
            <div className="overflow-hidden">
              <p className="text-sm font-bold text-sidebar-primary truncate" style={{fontFamily: "'Montserrat', sans-serif", letterSpacing: '1px', textTransform: 'uppercase' as const}}>Selva Agency</p>
              <p className="text-xs text-muted-foreground truncate">Meta Ads Dashboard</p>
            </div>
          )}
        </div>

        {/* Account Selector — fixed, always visible */}
        {sidebarOpen && (
          <div className="px-3 py-3 border-b border-sidebar-border">
            <p className="text-xs text-muted-foreground mb-1.5 px-1 uppercase tracking-widest font-semibold">Conta Ativa</p>
            {accounts.length === 0 ? (
              <Link href="/connect">
                <button className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-primary/30 text-muted-foreground hover:border-primary hover:bg-primary/5 hover:text-primary transition-all text-xs font-medium">
                  <Link2 className="w-3.5 h-3.5" />
                  Conectar conta
                </button>
              </Link>
            ) : (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg bg-sidebar-primary/10 border border-sidebar-border hover:bg-sidebar-primary/20 transition-all group">
                    <div className="w-6 h-6 rounded-md bg-sidebar-primary/20 flex items-center justify-center flex-shrink-0">
                      <Building2 className="w-3 h-3 text-primary" />
                    </div>
                    <div className="flex-1 text-left overflow-hidden">
                      <p className="text-xs font-bold text-sidebar-foreground truncate">
                        {activeAccount?.accountName ?? activeAccount?.accountId ?? "Selecionar"}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {activeAccount?.currency ?? ""} · ID {activeAccount?.accountId ?? "—"}
                      </p>
                    </div>
                    <ChevronDown className="w-3 h-3 text-muted-foreground flex-shrink-0 group-hover:text-primary transition-colors" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-60">
                  <DropdownMenuLabel className="text-xs text-muted-foreground">
                    Trocar conta ({accounts.length} conectada{accounts.length !== 1 ? "s" : ""})
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {accounts.map((acc) => {
                    const scheduleSummary = scheduleMap.get(acc.id);
                    return (
                      <DropdownMenuItem
                        key={acc.id}
                        onClick={() => setActiveAccountId(acc.id)}
                        className="flex items-center gap-2.5 cursor-pointer"
                      >
                        <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 ${acc.id === activeAccountId ? "bg-primary/20" : "bg-muted"}`}>
                          <Building2 className={`w-3 h-3 ${acc.id === activeAccountId ? "text-primary" : "text-muted-foreground"}`} />
                        </div>
                        <div className="flex-1 overflow-hidden">
                          <p className="text-xs font-medium truncate">{acc.accountName ?? acc.accountId}</p>
                          {scheduleSummary ? (
                            <p className="text-xs text-emerald-400 truncate" title={scheduleSummary}>{scheduleSummary}</p>
                          ) : (
                            <p className="text-xs text-muted-foreground truncate">{acc.currency} · {acc.accountId}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {scheduleSummary && (
                            <span title={scheduleSummary}>
                              <CalendarCheck className="w-3 h-3 text-emerald-400" />
                            </span>
                          )}
                          {acc.id === activeAccountId && (
                            <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                          )}
                        </div>
                      </DropdownMenuItem>
                    );
                  })}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/connect">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer w-full">
                        <Link2 className="w-3.5 h-3.5" />
                        Gerenciar contas
                      </div>
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        )}

        {/* Collapsed account indicator */}
        {!sidebarOpen && accounts.length > 0 && (
          <div className="px-3 py-3 border-b border-sidebar-border flex justify-center">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="w-8 h-8 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center hover:bg-primary/20 transition-colors">
                  <Building2 className="w-4 h-4 text-primary" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="right" className="w-60">
                <DropdownMenuLabel className="text-xs text-muted-foreground">Trocar conta</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {accounts.map((acc) => (
                  <DropdownMenuItem
                    key={acc.id}
                    onClick={() => setActiveAccountId(acc.id)}
                    className="flex items-center gap-2.5 cursor-pointer"
                  >
                    <Building2 className={`w-3.5 h-3.5 ${acc.id === activeAccountId ? "text-primary" : "text-muted-foreground"}`} />
                    <div className="flex-1 overflow-hidden">
                      <p className="text-xs font-medium truncate">{acc.accountName ?? acc.accountId}</p>
                      <p className="text-xs text-muted-foreground">{acc.currency}</p>
                    </div>
                    {acc.id === activeAccountId && (
                      <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = location === item.path;
            const Icon = item.icon;
            return (
              <Link key={item.path} href={item.path}>
                <div
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all duration-150 group ${
                    isActive
                      ? "bg-sidebar-primary/15 text-sidebar-primary font-semibold border-l-2 border-sidebar-primary"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-primary/10 hover:text-sidebar-primary"
                  }`}
                >
                  <Icon className={`w-4 h-4 flex-shrink-0 transition-colors ${isActive ? "text-primary" : "group-hover:text-primary"}`} />
                  {sidebarOpen && (
                    <>
                      <span className="text-sm font-medium flex-1 truncate">{item.label}</span>
                      {item.badge != null && item.badge > 0 && (
                        <Badge
                          variant="destructive"
                          className="h-5 min-w-5 px-1.5 text-xs flex items-center justify-center font-bold shadow-sm"
                        >
                          {item.badge > 99 ? "99+" : item.badge}
                        </Badge>
                      )}
                    </>
                  )}
                </div>
              </Link>
            );
          })}


        </nav>

        {/* User */}
        <div className="p-3 border-t border-sidebar-border">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-sidebar-primary/10 transition-all">
                <Avatar className="w-7 h-7 flex-shrink-0 ring-2 ring-sidebar-primary/30">
                  <AvatarFallback className="bg-sidebar-primary text-sidebar font-bold text-xs">
                    {user?.name?.[0]?.toUpperCase() ?? "U"}
                  </AvatarFallback>
                </Avatar>
                {sidebarOpen && (
                  <>
                    <div className="flex-1 text-left overflow-hidden">
                      <p className="text-xs font-semibold text-sidebar-foreground truncate">
                        {user?.name ?? "Usuário"}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">{user?.email ?? ""}</p>
                    </div>
                    <ChevronDown className="w-3 h-3 text-muted-foreground flex-shrink-0 group-hover:text-primary transition-colors" />
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

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="h-16 border-b border-border flex items-center justify-between px-6 bg-background sticky top-0 z-10">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-1.5 rounded-md hover:bg-primary/10 text-muted-foreground hover:text-primary transition-all hover:shadow-sm"
            >
              <LayoutDashboard className="w-4 h-4" />
            </button>
            {title && <h1 className="text-sm font-bold text-foreground" style={{fontFamily: "Montserrat, sans-serif", textTransform: "uppercase" as const, letterSpacing: "1px"}}>{title}</h1>}
            {/* Active account breadcrumb */}
            {activeAccount && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <ChevronRight className="w-3 h-3 text-primary/50" />
                <span className="font-semibold text-foreground/80 px-2 py-1 rounded-md bg-secondary/10">{activeAccount.accountName ?? activeAccount.accountId}</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Quick sync button */}
            {activeAccountId && (
              <SyncButton accountId={activeAccountId} />
            )}

            {/* Alerts bell */}
            <Link href="/alerts">
              <button className="relative p-2 rounded-lg hover:bg-primary/10 transition-all text-muted-foreground hover:text-primary hover:shadow-sm">
                <Bell className="w-4 h-4" />
                {unreadCount != null && unreadCount > 0 && (
                  <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-primary rounded-full animate-pulse shadow-lg shadow-primary/50" />
                )}
              </button>
            </Link>
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

function SyncButton({ accountId }: { accountId: number }) {
  const utils = trpc.useUtils();
  const sync = trpc.accounts.sync.useMutation({
    onSuccess: () => {
      utils.dashboard.overview.invalidate();
      utils.campaigns.performance.invalidate();
    },
  });

  return (
    <Button
      size="sm"
      className="h-8 gap-1.5 text-xs bg-primary hover:bg-accent text-primary-foreground font-semibold transition-all"
      onClick={() => sync.mutate({ accountId, days: 30 })}
      disabled={sync.isPending}
    >
      <RefreshCw className={`w-3 h-3 ${sync.isPending ? "animate-spin" : ""}`} />
      {sync.isPending ? "Sincronizando..." : "Sincronizar"}
    </Button>
  );
}

// Legacy hook kept for backward compatibility with pages that still use it
export function useSelectedAccount() {
  const { activeAccountId, accounts, setActiveAccountId } = useActiveAccount();
  return {
    selectedAccountId: activeAccountId,
    setSelectedAccountId: setActiveAccountId,
    accounts,
  };
}
