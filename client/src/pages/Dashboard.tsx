import { MetaDashboardLayout, useSelectedAccount } from "@/components/MetaDashboardLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend,
} from "recharts";
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  DollarSign,
  Link2,
  Minus,
  MousePointer,
  ShoppingCart,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import { useState, useMemo } from "react";
import { useLocation } from "wouter";

function MetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  trendValue,
  color = "blue",
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  trend?: "up" | "down" | "neutral";
  trendValue?: string;
  color?: "blue" | "green" | "red" | "purple";
}) {
  const colorMap = {
    blue: "text-blue-400 bg-blue-400/10",
    green: "text-emerald-400 bg-emerald-400/10",
    red: "text-red-400 bg-red-400/10",
    purple: "text-purple-400 bg-purple-400/10",
  };

  return (
    <Card className="border-border bg-card hover:border-primary/30 transition-all duration-200">
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${colorMap[color]}`}>
            <Icon className="w-4 h-4" />
          </div>
          {trend && trendValue && (
            <div
              className={`flex items-center gap-1 text-xs font-medium ${
                trend === "up" ? "text-emerald-400" : trend === "down" ? "text-red-400" : "text-muted-foreground"
              }`}
            >
              {trend === "up" ? (
                <ArrowUp className="w-3 h-3" />
              ) : trend === "down" ? (
                <ArrowDown className="w-3 h-3" />
              ) : (
                <Minus className="w-3 h-3" />
              )}
              {trendValue}
            </div>
          )}
        </div>
        <p className="text-2xl font-bold text-foreground mb-0.5">{value}</p>
        <p className="text-xs text-muted-foreground">{title}</p>
        {subtitle && <p className="text-xs text-muted-foreground/70 mt-0.5">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover border border-border rounded-lg p-3 shadow-xl text-xs">
      <p className="text-muted-foreground mb-2">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }} className="font-medium">
          {p.name}: {typeof p.value === "number" ? p.value.toFixed(2) : p.value}
        </p>
      ))}
    </div>
  );
};

export default function Dashboard() {
  const [days, setDays] = useState("30");
  const [, navigate] = useLocation();
  const { selectedAccountId, accounts } = useSelectedAccount();

  const { data, isLoading } = trpc.dashboard.overview.useQuery(
    { accountId: selectedAccountId!, days: parseInt(days) },
    { enabled: !!selectedAccountId, refetchInterval: 60000 }
  );

  const chartData = useMemo(() => {
    if (!data?.timeSeries) return [];
    return data.timeSeries.map((d) => ({
      date: new Date(d.date).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
      ROAS: parseFloat(String(d.avgRoas ?? 0)).toFixed(2),
      CPA: parseFloat(String(d.avgCpa ?? 0)).toFixed(2),
      Gasto: parseFloat(String(d.totalSpend ?? 0)).toFixed(2),
      Conversões: parseFloat(String(d.totalConversions ?? 0)).toFixed(0),
    }));
  }, [data]);

  const topCampaigns = useMemo(() => {
    if (!data?.campaigns) return [];
    return [...data.campaigns]
      .sort((a, b) => Number(b.avgRoas ?? 0) - Number(a.avgRoas ?? 0))
      .slice(0, 5);
  }, [data]);

  const underCampaigns = useMemo(() => {
    if (!data?.campaigns) return [];
    return [...data.campaigns]
      .filter((c) => Number(c.totalSpend ?? 0) > 0)
      .sort((a, b) => Number(a.avgRoas ?? 0) - Number(b.avgRoas ?? 0))
      .slice(0, 5);
  }, [data]);

  if (!accounts || accounts.length === 0) {
    return (
      <MetaDashboardLayout title="Dashboard">
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
            <Link2 className="w-7 h-7 text-primary" />
          </div>
          <h2 className="text-xl font-semibold text-foreground mb-2">Nenhuma conta conectada</h2>
          <p className="text-muted-foreground mb-6 max-w-sm">
            Conecte sua conta Meta Ads para começar a visualizar dados e análises.
          </p>
          <Button onClick={() => navigate("/connect")} className="gap-2">
            <Zap className="w-4 h-4" />
            Conectar conta
          </Button>
        </div>
      </MetaDashboardLayout>
    );
  }

  const totals = data?.totals;
  const fmt = (n: number, prefix = "") =>
    n >= 1000 ? `${prefix}${(n / 1000).toFixed(1)}k` : `${prefix}${n.toFixed(2)}`;

  return (
    <MetaDashboardLayout title="Dashboard">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">Visão Geral</h1>
            <p className="text-sm text-muted-foreground">Performance das suas campanhas</p>
          </div>
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="w-36 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Últimos 7 dias</SelectItem>
              <SelectItem value="14">Últimos 14 dias</SelectItem>
              <SelectItem value="30">Últimos 30 dias</SelectItem>
              <SelectItem value="60">Últimos 60 dias</SelectItem>
              <SelectItem value="90">Últimos 90 dias</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Alerts banner */}
        {(data?.unreadAlerts ?? 0) > 0 || (data?.unreadAnomalies ?? 0) > 0 ? (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
            <div className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
            <p className="text-sm text-foreground">
              {data?.unreadAnomalies ?? 0} anomalia(s) e {data?.unreadAlerts ?? 0} alerta(s) não lidos
            </p>
            <Button
              variant="outline"
              size="sm"
              className="ml-auto h-7 text-xs"
              onClick={() => navigate("/anomalies")}
            >
              Ver anomalias
            </Button>
          </div>
        ) : null}

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            title="Investimento Total"
            value={isLoading ? "..." : `R$ ${fmt(totals?.spend ?? 0)}`}
            icon={DollarSign}
            color="blue"
          />
          <MetricCard
            title="ROAS Médio"
            value={isLoading ? "..." : `${(totals?.roas ?? 0).toFixed(2)}x`}
            subtitle="Retorno sobre investimento"
            icon={TrendingUp}
            color="green"
            trend={(totals?.roas ?? 0) >= 2 ? "up" : "down"}
            trendValue={(totals?.roas ?? 0) >= 2 ? "Bom" : "Baixo"}
          />
          <MetricCard
            title="CPA Médio"
            value={isLoading ? "..." : `R$ ${(totals?.cpa ?? 0).toFixed(2)}`}
            subtitle="Custo por aquisição"
            icon={ShoppingCart}
            color="purple"
          />
          <MetricCard
            title="Conversões"
            value={isLoading ? "..." : `${Math.round(totals?.conversions ?? 0)}`}
            subtitle={`CTR: ${(totals?.ctr ?? 0).toFixed(2)}%`}
            icon={MousePointer}
            color="blue"
          />
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            title="Impressões"
            value={isLoading ? "..." : fmt(totals?.impressions ?? 0)}
            icon={Users}
            color="blue"
          />
          <MetricCard
            title="Cliques"
            value={isLoading ? "..." : fmt(totals?.clicks ?? 0)}
            icon={MousePointer}
            color="purple"
          />
          <MetricCard
            title="Valor de Conversão"
            value={isLoading ? "..." : `R$ ${fmt(totals?.conversionValue ?? 0)}`}
            icon={DollarSign}
            color="green"
          />
          <MetricCard
            title="Campanhas Ativas"
            value={isLoading ? "..." : String(data?.campaigns?.filter((c) => c.campaignStatus === "ACTIVE").length ?? 0)}
            icon={BarChart3}
            color="blue"
          />
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* ROAS Trend */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Evolução do ROAS</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="roasGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="oklch(0.62 0.22 255)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="oklch(0.62 0.22 255)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.22 0.018 260)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "oklch(0.55 0.015 260)" }} />
                  <YAxis tick={{ fontSize: 10, fill: "oklch(0.55 0.015 260)" }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="ROAS"
                    stroke="oklch(0.62 0.22 255)"
                    fill="url(#roasGrad)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Spend Trend */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Investimento Diário (R$)</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="oklch(0.65 0.20 295)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="oklch(0.65 0.20 295)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.22 0.018 260)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "oklch(0.55 0.015 260)" }} />
                  <YAxis tick={{ fontSize: 10, fill: "oklch(0.55 0.015 260)" }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="Gasto"
                    stroke="oklch(0.65 0.20 295)"
                    fill="url(#spendGrad)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Campaign Comparison */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Top Performers */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                  Top Performers
                </CardTitle>
                <Badge variant="outline" className="text-xs text-emerald-400 border-emerald-400/30">
                  Por ROAS
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {isLoading ? (
                <div className="space-y-2">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="h-12 bg-muted rounded-lg animate-pulse" />
                  ))}
                </div>
              ) : topCampaigns.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Nenhum dado disponível. Sincronize sua conta.
                </p>
              ) : (
                topCampaigns.map((c, i) => (
                  <div key={c.campaignId} className="flex items-center gap-3 p-2.5 rounded-lg bg-accent/30">
                    <span className="w-5 h-5 rounded-full bg-emerald-400/20 text-emerald-400 text-xs flex items-center justify-center font-bold flex-shrink-0">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{c.campaignName}</p>
                      <p className="text-xs text-muted-foreground">
                        R$ {Number(c.totalSpend ?? 0).toFixed(2)} gasto
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs font-bold text-emerald-400">
                        {Number(c.avgRoas ?? 0).toFixed(2)}x
                      </p>
                      <p className="text-xs text-muted-foreground">ROAS</p>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Under Performers */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <ArrowDown className="w-4 h-4 text-red-400" />
                  Underperformers
                </CardTitle>
                <Badge variant="outline" className="text-xs text-red-400 border-red-400/30">
                  Precisam atenção
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {isLoading ? (
                <div className="space-y-2">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="h-12 bg-muted rounded-lg animate-pulse" />
                  ))}
                </div>
              ) : underCampaigns.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Nenhum dado disponível. Sincronize sua conta.
                </p>
              ) : (
                underCampaigns.map((c, i) => (
                  <div key={c.campaignId} className="flex items-center gap-3 p-2.5 rounded-lg bg-accent/30">
                    <span className="w-5 h-5 rounded-full bg-red-400/20 text-red-400 text-xs flex items-center justify-center font-bold flex-shrink-0">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{c.campaignName}</p>
                      <p className="text-xs text-muted-foreground">
                        CPA: R$ {Number(c.avgCpa ?? 0).toFixed(2)}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs font-bold text-red-400">
                        {Number(c.avgRoas ?? 0).toFixed(2)}x
                      </p>
                      <p className="text-xs text-muted-foreground">ROAS</p>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </MetaDashboardLayout>
  );
}
