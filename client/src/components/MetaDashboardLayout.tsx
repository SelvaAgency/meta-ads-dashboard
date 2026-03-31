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
    { path: "/suggestions", label: "Sugestões IA", icon: Lightbulb },
    { path: "/reports", label: "Relatórios", icon: FileText },
    { path: "/alerts", label: "Alertas", icon: Bell, badge: unreadCount ?? 0 },
    { path: "/dashboard-builder", label: "Dashboard Builder", icon: PieChart },
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
            <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
              <Zap className="w-5 h-5 text-primary" />
            </div>
            <span className="text-xl font-semibold text-foreground">Meta Ads Intelligence</span>
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
        className={`${sidebarOpen ? "w-64" : "w-16"} flex-shrink-0 bg-sidebar border-r border-sidebar-border flex flex-col transition-all duration-200`}
      >
        {/* Logo */}
        <div className="h-16 flex items-center px-4 border-b border-sidebar-border gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
            <Zap className="w-4 h-4 text-primary" />
          </div>
          {sidebarOpen && (
            <div className="overflow-hidden">
              <p className="text-sm font-semibold text-sidebar-foreground truncate">Meta Ads AI</p>
              <p className="text-xs text-muted-foreground truncate">Intelligence Platform</p>
            </div>
          )}
        </div>

        {/* Account Selector — fixed, always visible */}
        {sidebarOpen && (
          <div className="px-3 py-3 border-b border-sidebar-border">
            <p className="text-xs text-muted-foreground mb-1.5 px-1 uppercase tracking-wide">Conta Ativa</p>
            {accounts.length === 0 ? (
              <Link href="/connect">
                <button className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-sidebar-border text-muted-foreground hover:border-primary/50 hover:text-primary transition-all text-xs">
                  <Link2 className="w-3.5 h-3.5" />
                  Conectar conta
                </button>
              </Link>
            ) : (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg bg-primary/10 border border-primary/20 hover:bg-primary/15 transition-all group">
                    <div className="w-6 h-6 rounded-md bg-primary/20 flex items-center justify-center flex-shrink-0">
                      <Building2 className="w-3 h-3 text-primary" />
                    </div>
                    <div className="flex-1 text-left overflow-hidden">
                      <p className="text-xs font-semibold text-sidebar-foreground truncate">
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
        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = location === item.path;
            const Icon = item.icon;
            return (
              <Link key={item.path} href={item.path}>
                <div
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all duration-150 group ${
                    isActive
                      ? "bg-primary/15 text-primary"
                      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  }`}
                >
                  <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? "text-primary" : ""}`} />
                  {sidebarOpen && (
                    <>
                      <span className="text-sm font-medium flex-1 truncate">{item.label}</span>
                      {item.badge != null && item.badge > 0 && (
                        <Badge
                          variant="destructive"
                          className="h-5 min-w-5 px-1 text-xs flex items-center justify-center"
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

          <div className="pt-2 border-t border-sidebar-border mt-2">
            <Link href="/connect">
              <div
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all duration-150 ${
                  location === "/connect"
                    ? "bg-primary/15 text-primary"
                    : "text-sidebar-foreground hover:bg-sidebar-accent"
                }`}
              >
                <Link2 className="w-4 h-4 flex-shrink-0" />
                {sidebarOpen && <span className="text-sm font-medium">Gerenciar Contas</span>}
              </div>
            </Link>
          </div>
        </nav>

        {/* User */}
        <div className="p-3 border-t border-sidebar-border">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-sidebar-accent transition-colors">
                <Avatar className="w-7 h-7 flex-shrink-0">
                  <AvatarFallback className="bg-primary/20 text-primary text-xs">
                    {user?.name?.[0]?.toUpperCase() ?? "U"}
                  </AvatarFallback>
                </Avatar>
                {sidebarOpen && (
                  <>
                    <div className="flex-1 text-left overflow-hidden">
                      <p className="text-xs font-medium text-sidebar-foreground truncate">
                        {user?.name ?? "Usuário"}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">{user?.email ?? ""}</p>
                    </div>
                    <ChevronDown className="w-3 h-3 text-muted-foreground flex-shrink-0" />
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
        <header className="h-16 border-b border-border flex items-center justify-between px-6 bg-background/80 backdrop-blur-sm sticky top-0 z-10">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            >
              <LayoutDashboard className="w-4 h-4" />
            </button>
            {title && <h1 className="text-sm font-semibold text-foreground">{title}</h1>}
            {/* Active account breadcrumb */}
            {activeAccount && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <ChevronRight className="w-3 h-3" />
                <span className="font-medium text-foreground/70">{activeAccount.accountName ?? activeAccount.accountId}</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            {/* Quick sync button */}
            {activeAccountId && (
              <SyncButton accountId={activeAccountId} />
            )}

            {/* Alerts bell */}
            <Link href="/alerts">
              <button className="relative p-2 rounded-lg hover:bg-accent transition-colors text-muted-foreground hover:text-foreground">
                <Bell className="w-4 h-4" />
                {unreadCount != null && unreadCount > 0 && (
                  <span className="absolute top-1 right-1 w-2 h-2 bg-destructive rounded-full" />
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
      variant="outline"
      size="sm"
      className="h-8 gap-1.5 text-xs"
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
