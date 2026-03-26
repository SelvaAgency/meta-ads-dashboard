import { MetaDashboardLayout } from "@/components/MetaDashboardLayout";
import { useSelectedAccount } from "@/hooks/useSelectedAccount";
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
} from "recharts";
import {
  AlertTriangle,
  BarChart3,
  CreditCard,
  DollarSign,
  Link2,
  Loader2,
  MessageCircle,
  MousePointer,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
  Zap,
  Eye,
  Target,
  Play,
  Heart,
  ArrowDown,
} from "lucide-react";
import { useState, useMemo } from "react";
import { useLocation } from "wouter";

// ─── Metric formatting helpers ───────────────────────────────────────────────

function fmtCurrency(n: number | null | undefined, currency = "R$") {
  const v = Number(n ?? 0);
  if (v >= 1_000_000) return `${currency} ${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `${currency} ${(v / 1_000).toFixed(1)}k`;
  return `${currency} ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtNumber(n: number | null | undefined) {
  const v = Number(n ?? 0);
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return v.toLocaleString("pt-BR");
}
function fmtPercent(n: number | null | undefined) { return `${Number(n ?? 0).toFixed(2)}%`; }
function fmtMultiplier(n: number | null | undefined) { return `${Number(n ?? 0).toFixed(2)}x`; }

// ─── Goal detection: map optimization_goal → KPI type ───────────────────────
// Uses the goalProfile returned by the backend (which uses optimization_goal from adsets)
// NOT the campaign.objective — that is the broad marketing goal, not the performance target

type GoalType =
  | "SALES" | "VALUE" | "LEADS" | "MESSAGES" | "ENGAGEMENT" | "FOLLOWERS"
  | "AWARENESS" | "TRAFFIC" | "VIDEO" | "APP" | "DEFAULT";

function mapGoalToType(dominantGoal: string | undefined): GoalType {
  if (!dominantGoal) return "DEFAULT";
  const map: Record<string, GoalType> = {
    OFFSITE_CONVERSIONS: "SALES",
    ONSITE_CONVERSIONS: "SALES",
    VALUE: "VALUE",
    LEAD_GENERATION: "LEADS",
    QUALITY_LEAD: "LEADS",
    REPLIES: "MESSAGES",
    CONVERSATIONS: "MESSAGES",
    LINK_CLICKS: "TRAFFIC",
    LANDING_PAGE_VIEWS: "TRAFFIC",
    REACH: "AWARENESS",
    IMPRESSIONS: "AWARENESS",
    POST_ENGAGEMENT: "ENGAGEMENT",
    PAGE_LIKES: "FOLLOWERS",
    VIDEO_VIEWS: "VIDEO",
    THRUPLAY: "VIDEO",
    APP_INSTALLS: "APP",
    VISIT_INSTAGRAM_PROFILE: "TRAFFIC",
    INSTAGRAM_PROFILE_REACH: "AWARENESS",
  };
  return map[dominantGoal] ?? "DEFAULT";
}

// ─── KPI card config per objective ───────────────────────────────────────────

interface KpiDef {
  key: string;
  label: string;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  color: "blue" | "green" | "red" | "purple" | "orange";
  format: (totals: any) => string;
  trend?: (totals: any) => "up" | "down" | "neutral";
  trendLabel?: (totals: any) => string;
}

const ICON_MAP = {
  DollarSign, TrendingUp, ShoppingCart, MousePointer,
  Users, Eye, MessageCircle, Target, Play, Heart, BarChart3,
};

const KPI_CONFIGS: Record<GoalType, KpiDef[]> = {
  SALES: [
    { key: "spend", label: "Investimento Total", icon: DollarSign, color: "blue", format: (t) => fmtCurrency(t.spend) },
    { key: "roas", label: "ROAS", subtitle: "Retorno sobre investimento", icon: TrendingUp, color: "green",
      format: (t) => fmtMultiplier(t.roas),
      trend: (t) => t.roas >= 2 ? "up" : "down",
      trendLabel: (t) => t.roas >= 2 ? "Bom" : "Baixo" },
    { key: "cpa", label: "CPA", subtitle: "Custo por aquisição", icon: ShoppingCart, color: "purple", format: (t) => fmtCurrency(t.cpa) },
    { key: "conversions", label: "Conversões", icon: MousePointer, color: "blue", format: (t) => fmtNumber(t.conversions) },
    { key: "conversionValue", label: "Valor de Conversão", icon: DollarSign, color: "green", format: (t) => fmtCurrency(t.conversionValue) },
    { key: "reach", label: "Alcance", icon: Users, color: "blue", format: (t) => fmtNumber(t.reach) },
    { key: "impressions", label: "Impressões", icon: Eye, color: "blue", format: (t) => fmtNumber(t.impressions) },
    { key: "ctr", label: "CTR", subtitle: "Taxa de cliques", icon: MousePointer, color: "purple", format: (t) => fmtPercent(t.ctr) },
  ],
  LEADS: [
    { key: "spend", label: "Investimento Total", icon: DollarSign, color: "blue", format: (t) => fmtCurrency(t.spend) },
    { key: "conversions", label: "Leads Gerados", icon: Target, color: "green", format: (t) => fmtNumber(t.conversions) },
    { key: "cpa", label: "Custo por Lead", subtitle: "CPL médio", icon: ShoppingCart, color: "purple", format: (t) => fmtCurrency(t.cpa) },
    { key: "ctr", label: "CTR", subtitle: "Taxa de cliques", icon: MousePointer, color: "blue", format: (t) => fmtPercent(t.ctr) },
    { key: "reach", label: "Alcance", icon: Users, color: "blue", format: (t) => fmtNumber(t.reach) },
    { key: "impressions", label: "Impressões", icon: Eye, color: "blue", format: (t) => fmtNumber(t.impressions) },
    { key: "clicks", label: "Cliques", icon: MousePointer, color: "purple", format: (t) => fmtNumber(t.clicks) },
    { key: "cpc", label: "CPC Médio", subtitle: "Custo por clique", icon: DollarSign, color: "orange", format: (t) => fmtCurrency(t.cpc ?? 0) },
  ],
  MESSAGES: [
    { key: "spend", label: "Investimento Total", icon: DollarSign, color: "blue", format: (t) => fmtCurrency(t.spend) },
    { key: "conversions", label: "Mensagens Iniciadas", icon: MessageCircle, color: "green", format: (t) => fmtNumber(t.conversions) },
    { key: "cpa", label: "Custo por Mensagem", icon: ShoppingCart, color: "purple", format: (t) => fmtCurrency(t.cpa) },
    { key: "ctr", label: "CTR", subtitle: "Taxa de cliques", icon: MousePointer, color: "blue", format: (t) => fmtPercent(t.ctr) },
    { key: "reach", label: "Alcance", icon: Users, color: "blue", format: (t) => fmtNumber(t.reach) },
    { key: "impressions", label: "Impressões", icon: Eye, color: "blue", format: (t) => fmtNumber(t.impressions) },
    { key: "clicks", label: "Cliques", icon: MousePointer, color: "purple", format: (t) => fmtNumber(t.clicks) },
    { key: "cpm", label: "CPM Médio", subtitle: "Custo por mil impressões", icon: DollarSign, color: "orange", format: (t) => fmtCurrency(t.cpm ?? 0) },
  ],
  ENGAGEMENT: [
    { key: "spend", label: "Investimento Total", icon: DollarSign, color: "blue", format: (t) => fmtCurrency(t.spend) },
    { key: "conversions", label: "Engajamentos", icon: Heart, color: "green", format: (t) => fmtNumber(t.conversions) },
    { key: "reach", label: "Alcance", icon: Users, color: "blue", format: (t) => fmtNumber(t.reach) },
    { key: "impressions", label: "Impressões", icon: Eye, color: "blue", format: (t) => fmtNumber(t.impressions) },
    { key: "cpm", label: "CPM Médio", icon: DollarSign, color: "orange", format: (t) => fmtCurrency(t.cpm ?? 0) },
    { key: "ctr", label: "CTR", icon: MousePointer, color: "purple", format: (t) => fmtPercent(t.ctr) },
    { key: "clicks", label: "Cliques", icon: MousePointer, color: "purple", format: (t) => fmtNumber(t.clicks) },
    { key: "cpa", label: "Custo por Resultado", icon: ShoppingCart, color: "purple", format: (t) => fmtCurrency(t.cpa) },
  ],
  FOLLOWERS: [
    { key: "spend", label: "Investimento Total", icon: DollarSign, color: "blue", format: (t) => fmtCurrency(t.spend) },
    { key: "conversions", label: "Novos Seguidores", icon: Users, color: "green", format: (t) => fmtNumber(t.conversions) },
    { key: "cpa", label: "Custo por Seguidor", icon: ShoppingCart, color: "purple", format: (t) => fmtCurrency(t.cpa) },
    { key: "reach", label: "Alcance", icon: Users, color: "blue", format: (t) => fmtNumber(t.reach) },
    { key: "impressions", label: "Impressões", icon: Eye, color: "blue", format: (t) => fmtNumber(t.impressions) },
    { key: "cpm", label: "CPM Médio", icon: DollarSign, color: "orange", format: (t) => fmtCurrency(t.cpm ?? 0) },
    { key: "ctr", label: "CTR", icon: MousePointer, color: "purple", format: (t) => fmtPercent(t.ctr) },
    { key: "clicks", label: "Cliques", icon: MousePointer, color: "purple", format: (t) => fmtNumber(t.clicks) },
  ],
  AWARENESS: [
    { key: "spend", label: "Investimento Total", icon: DollarSign, color: "blue", format: (t) => fmtCurrency(t.spend) },
    { key: "reach", label: "Alcance", icon: Users, color: "green", format: (t) => fmtNumber(t.reach) },
    { key: "impressions", label: "Impressões", icon: Eye, color: "blue", format: (t) => fmtNumber(t.impressions) },
    { key: "cpm", label: "CPM Médio", icon: DollarSign, color: "orange", format: (t) => fmtCurrency(t.cpm ?? 0) },
    { key: "ctr", label: "CTR", icon: MousePointer, color: "purple", format: (t) => fmtPercent(t.ctr) },
    { key: "clicks", label: "Cliques", icon: MousePointer, color: "purple", format: (t) => fmtNumber(t.clicks) },
    { key: "frequency", label: "Frequência Média", subtitle: "Vezes que cada pessoa viu", icon: BarChart3, color: "blue", format: (t) => (t.frequency ?? 0).toFixed(2) },
    { key: "cpa", label: "Custo por Resultado", icon: ShoppingCart, color: "purple", format: (t) => fmtCurrency(t.cpa) },
  ],
  TRAFFIC: [
    { key: "spend", label: "Investimento Total", icon: DollarSign, color: "blue", format: (t) => fmtCurrency(t.spend) },
    { key: "clicks", label: "Cliques no Link", icon: MousePointer, color: "green", format: (t) => fmtNumber(t.clicks) },
    { key: "ctr", label: "CTR", subtitle: "Taxa de cliques", icon: TrendingUp, color: "blue",
      format: (t) => fmtPercent(t.ctr),
      trend: (t) => t.ctr >= 1 ? "up" : "down",
      trendLabel: (t) => t.ctr >= 1 ? "Bom" : "Baixo" },
    { key: "cpc", label: "CPC Médio", subtitle: "Custo por clique", icon: DollarSign, color: "purple", format: (t) => fmtCurrency(t.cpc ?? 0) },
    { key: "reach", label: "Alcance", icon: Users, color: "blue", format: (t) => fmtNumber(t.reach) },
    { key: "impressions", label: "Impressões", icon: Eye, color: "blue", format: (t) => fmtNumber(t.impressions) },
    { key: "cpm", label: "CPM Médio", icon: DollarSign, color: "orange", format: (t) => fmtCurrency(t.cpm ?? 0) },
    { key: "cpa", label: "Custo por Resultado", icon: ShoppingCart, color: "purple", format: (t) => fmtCurrency(t.cpa) },
  ],
  VIDEO: [
    { key: "spend", label: "Investimento Total", icon: DollarSign, color: "blue", format: (t) => fmtCurrency(t.spend) },
    { key: "conversions", label: "Visualizações de Vídeo", icon: Play, color: "green", format: (t) => fmtNumber(t.conversions) },
    { key: "cpa", label: "Custo por Visualização", icon: ShoppingCart, color: "purple", format: (t) => fmtCurrency(t.cpa) },
    { key: "reach", label: "Alcance", icon: Users, color: "blue", format: (t) => fmtNumber(t.reach) },
    { key: "impressions", label: "Impressões", icon: Eye, color: "blue", format: (t) => fmtNumber(t.impressions) },
    { key: "frequency", label: "Frequência Média", icon: BarChart3, color: "blue", format: (t) => (t.frequency ?? 0).toFixed(2) },
    { key: "cpm", label: "CPM Médio", icon: DollarSign, color: "orange", format: (t) => fmtCurrency(t.cpm ?? 0) },
    { key: "ctr", label: "CTR", icon: MousePointer, color: "purple", format: (t) => fmtPercent(t.ctr) },
  ],
  APP: [
    { key: "spend", label: "Investimento Total", icon: DollarSign, color: "blue", format: (t) => fmtCurrency(t.spend) },
    { key: "conversions", label: "Instalações", icon: Target, color: "green", format: (t) => fmtNumber(t.conversions) },
    { key: "cpa", label: "Custo por Instalação", icon: ShoppingCart, color: "purple", format: (t) => fmtCurrency(t.cpa) },
    { key: "ctr", label: "CTR", icon: MousePointer, color: "blue", format: (t) => fmtPercent(t.ctr) },
    { key: "reach", label: "Alcance", icon: Users, color: "blue", format: (t) => fmtNumber(t.reach) },
    { key: "impressions", label: "Impressões", icon: Eye, color: "blue", format: (t) => fmtNumber(t.impressions) },
    { key: "cpc", label: "CPC Médio", icon: DollarSign, color: "orange", format: (t) => fmtCurrency(t.cpc ?? 0) },
    { key: "clicks", label: "Cliques", icon: MousePointer, color: "purple", format: (t) => fmtNumber(t.clicks) },
  ],
  // VALUE = optimization for ROAS (maximize conversion value)
  VALUE: [
    { key: "spend", label: "Investimento Total", icon: DollarSign, color: "blue", format: (t) => fmtCurrency(t.spend) },
    { key: "roas", label: "ROAS", subtitle: "Retorno sobre investimento", icon: TrendingUp, color: "green",
      format: (t) => fmtMultiplier(t.roas),
      trend: (t) => t.roas >= 2 ? "up" : "down",
      trendLabel: (t) => t.roas >= 2 ? "Bom" : "Baixo" },
    { key: "conversionValue", label: "Valor de Conversão", icon: DollarSign, color: "green", format: (t) => fmtCurrency(t.conversionValue) },
    { key: "cpa", label: "Custo por Compra", subtitle: "CPA médio", icon: ShoppingCart, color: "purple", format: (t) => fmtCurrency(t.cpa) },
    { key: "conversions", label: "Compras no site", icon: Target, color: "blue", format: (t) => fmtNumber(t.conversions) },
    { key: "reach", label: "Alcance", icon: Users, color: "blue", format: (t) => fmtNumber(t.reach) },
    { key: "impressions", label: "Impressões", icon: Eye, color: "blue", format: (t) => fmtNumber(t.impressions) },
    { key: "ctr", label: "CTR", subtitle: "Taxa de cliques", icon: MousePointer, color: "purple", format: (t) => fmtPercent(t.ctr) },
  ],
  DEFAULT: [
    { key: "spend", label: "Investimento Total", icon: DollarSign, color: "blue", format: (t) => fmtCurrency(t.spend) },
    { key: "impressions", label: "Impressões", icon: Eye, color: "blue", format: (t) => fmtNumber(t.impressions) },
    { key: "clicks", label: "Cliques", icon: MousePointer, color: "purple", format: (t) => fmtNumber(t.clicks) },
    { key: "reach", label: "Alcance", icon: Users, color: "blue", format: (t) => fmtNumber(t.reach) },
    { key: "ctr", label: "CTR", icon: MousePointer, color: "purple", format: (t) => fmtPercent(t.ctr) },
    { key: "cpm", label: "CPM Médio", icon: DollarSign, color: "orange", format: (t) => fmtCurrency(t.cpm ?? 0) },
    { key: "conversions", label: "Resultados", icon: Target, color: "green", format: (t) => fmtNumber(t.conversions) },
    { key: "cpa", label: "Custo por Resultado", icon: ShoppingCart, color: "purple", format: (t) => fmtCurrency(t.cpa) },
  ],
};

const GOAL_LABELS: Record<GoalType, { label: string; emoji: string }> = {
  SALES: { label: "Compras no site", emoji: "🛍" },
  VALUE: { label: "Valor de conversão (ROAS)", emoji: "💰" },
  LEADS: { label: "Geração de leads", emoji: "📋" },
  MESSAGES: { label: "Mensagens", emoji: "💬" },
  ENGAGEMENT: { label: "Engajamento", emoji: "❤️" },
  FOLLOWERS: { label: "Curtidas na página", emoji: "👥" },
  AWARENESS: { label: "Alcance", emoji: "📣" },
  TRAFFIC: { label: "Cliques no link", emoji: "🔗" },
  VIDEO: { label: "Visualizações de vídeo", emoji: "▶️" },
  APP: { label: "Instalações de app", emoji: "📱" },
  DEFAULT: { label: "Campanhas", emoji: "📊" },
};

// ─── MetricCard component ─────────────────────────────────────────────────────

function MetricCard({
  title, value, subtitle, icon: Icon, trend, trendValue, color = "blue",
}: {
  title: string; value: string; subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  trend?: "up" | "down" | "neutral"; trendValue?: string;
  color?: "blue" | "green" | "red" | "purple" | "orange";
}) {
  const colorMap = {
    blue: "text-blue-400 bg-blue-400/10",
    green: "text-emerald-400 bg-emerald-400/10",
    red: "text-red-400 bg-red-400/10",
    purple: "text-purple-400 bg-purple-400/10",
    orange: "text-orange-400 bg-orange-400/10",
  };
  return (
    <Card className="border-border bg-card hover:border-primary/30 transition-all duration-200">
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${colorMap[color]}`}>
            <Icon className="w-4 h-4" />
          </div>
          {trend && trendValue && (
            <div className={`flex items-center gap-1 text-xs font-medium ${
              trend === "up" ? "text-emerald-400" : trend === "down" ? "text-red-400" : "text-muted-foreground"
            }`}>
              {trend === "up" ? <TrendingUp className="w-3 h-3" /> : trend === "down" ? <TrendingDown className="w-3 h-3" /> : null}
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

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function Dashboard() {
  const [days, setDays] = useState("7");
  const [, navigate] = useLocation();
  const { selectedAccountId, accounts } = useSelectedAccount();

  const { data, isLoading } = trpc.dashboard.overview.useQuery(
    { accountId: selectedAccountId!, days: parseInt(days) },
    { enabled: !!selectedAccountId, refetchInterval: 60000 }
  );

  // Use goalProfile from backend (based on optimization_goal, NOT campaign.objective)
  // This ensures KPI cards reflect the actual performance target of the adsets
  const goalType = useMemo<GoalType>(() => {
    return mapGoalToType(data?.dominantGoal);
  }, [data?.dominantGoal]);

  // Use label/emoji from backend goalProfile when available, fallback to local map
  const goalLabelFromBackend = data?.goalProfile?.label;
  const goalEmojiFromBackend = data?.goalProfile?.emoji;
  const kpiDefs = KPI_CONFIGS[goalType];
  const objInfo = {
    label: goalLabelFromBackend ?? GOAL_LABELS[goalType]?.label ?? "Campanhas",
    emoji: goalEmojiFromBackend ?? GOAL_LABELS[goalType]?.emoji ?? "📊",
  };

  // Build extended totals including cpc, cpm, frequency
  const totals = useMemo(() => {
    if (!data?.totals) return null;
    const t = data.totals;
    const cpc = t.clicks > 0 ? t.spend / t.clicks : 0;
    const cpm = t.impressions > 0 ? (t.spend / t.impressions) * 1000 : 0;
    // frequency: average from timeSeries
    const freqSum = data.timeSeries?.reduce((s: number, m: any) => s + parseFloat(String(m.avgFrequency ?? 0)), 0) ?? 0;
    const frequency = data.timeSeries?.length ? freqSum / data.timeSeries.length : 0;
    return { ...t, cpc, cpm, frequency };
  }, [data]);

  const chartData = useMemo(() => {
    if (!data?.timeSeries) return [];
    return data.timeSeries.map((d) => ({
      date: new Date(d.date).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
      Gasto: parseFloat(String(d.totalSpend ?? 0)),
      Resultado: parseFloat(String(d.totalConversions ?? 0)),
      ROAS: parseFloat(String(d.avgRoas ?? 0)),
    }));
  }, [data]);

  // For top/under performers — use primary metric based on optimization_goal
  const primarySortKey = ["SALES", "VALUE"].includes(goalType) ? "avgRoas"
    : ["LEADS", "MESSAGES", "VIDEO", "APP", "FOLLOWERS"].includes(goalType) ? "avgCpa"
    : "totalSpend";

  const topCampaigns = useMemo(() => {
    if (!data?.campaigns) return [];
    return [...data.campaigns]
      .sort((a, b) => {
        if (primarySortKey === "avgRoas") return Number(b.avgRoas ?? 0) - Number(a.avgRoas ?? 0);
        if (primarySortKey === "avgCpa") return Number(a.avgCpa ?? 0) - Number(b.avgCpa ?? 0); // lower is better
        return Number(b.totalSpend ?? 0) - Number(a.totalSpend ?? 0);
      })
      .slice(0, 5);
  }, [data, primarySortKey]);

  const underCampaigns = useMemo(() => {
    if (!data?.campaigns) return [];
    return [...data.campaigns]
      .filter((c) => Number(c.totalSpend ?? 0) > 0)
      .sort((a, b) => {
        if (primarySortKey === "avgRoas") return Number(a.avgRoas ?? 0) - Number(b.avgRoas ?? 0);
        if (primarySortKey === "avgCpa") return Number(b.avgCpa ?? 0) - Number(a.avgCpa ?? 0); // higher is worse
        return Number(a.totalSpend ?? 0) - Number(b.totalSpend ?? 0);
      })
      .slice(0, 5);
  }, [data, primarySortKey]);

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

  return (
    <MetaDashboardLayout title="Dashboard">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-foreground">Visão Geral</h1>
              {goalType !== "DEFAULT" && (
                <Badge variant="outline" className="text-xs border-primary/30 text-primary">
                  {objInfo.emoji} {objInfo.label}
                </Badge>
              )}
            </div>
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
        {((data?.unreadAlerts ?? 0) > 0 || (data?.unreadAnomalies ?? 0) > 0) && (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
            <div className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
            <p className="text-sm text-foreground">
              {data?.unreadAnomalies ?? 0} anomalia(s) e {data?.unreadAlerts ?? 0} alerta(s) não lidos
            </p>
            <Button variant="outline" size="sm" className="ml-auto h-7 text-xs" onClick={() => navigate("/anomalies")}>
              Ver anomalias
            </Button>
          </div>
        )}

        {/* Adaptive KPI Cards — 4 per row */}
        {isLoading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(8)].map((_, i) => (
              <Card key={i} className="border-border">
                <CardContent className="p-5">
                  <div className="h-4 bg-muted rounded animate-pulse mb-3 w-8" />
                  <div className="h-7 bg-muted rounded animate-pulse mb-1 w-24" />
                  <div className="h-3 bg-muted rounded animate-pulse w-20" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {kpiDefs.slice(0, 4).map((kpi) => (
                <MetricCard
                  key={kpi.key}
                  title={kpi.label}
                  subtitle={kpi.subtitle}
                  value={totals ? kpi.format(totals) : "—"}
                  icon={kpi.icon}
                  color={kpi.color}
                  trend={kpi.trend ? kpi.trend(totals ?? {}) : undefined}
                  trendValue={kpi.trendLabel ? kpi.trendLabel(totals ?? {}) : undefined}
                />
              ))}
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {kpiDefs.slice(4, 8).map((kpi) => (
                <MetricCard
                  key={kpi.key}
                  title={kpi.label}
                  subtitle={kpi.subtitle}
                  value={totals ? kpi.format(totals) : "—"}
                  icon={kpi.icon}
                  color={kpi.color}
                />
              ))}
            </div>
          </>
        )}

        {/* Billing / Balance Card */}
        {selectedAccountId && <BillingCard accountId={selectedAccountId} />}

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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
                  <Area type="monotone" dataKey="Gasto" stroke="oklch(0.65 0.20 295)" fill="url(#spendGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">
                {["SALES", "VALUE", "LEADS", "MESSAGES", "VIDEO", "APP", "FOLLOWERS"].includes(goalType)
                  ? `Resultados Diários (${objInfo.emoji} ${objInfo.label})`
                  : "ROAS Diário"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="resultGrad" x1="0" y1="0" x2="0" y2="1">
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
                    dataKey={["SALES", "VALUE"].includes(goalType) ? "ROAS" : "Resultado"}
                    stroke="oklch(0.62 0.22 255)"
                    fill="url(#resultGrad)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Campaign Comparison */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                  Top Performers
                </CardTitle>
                <Badge variant="outline" className="text-xs text-emerald-400 border-emerald-400/30">
                  {primarySortKey === "avgRoas" ? "Por ROAS" : primarySortKey === "avgCpa" ? "Menor custo" : "Por Gasto"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {isLoading ? (
                <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-12 bg-muted rounded-lg animate-pulse" />)}</div>
              ) : topCampaigns.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Nenhum dado disponível. Sincronize sua conta.</p>
              ) : (
                topCampaigns.map((c, i) => (
                  <div key={c.campaignId} className="flex items-center gap-3 p-2.5 rounded-lg bg-accent/30">
                    <span className="w-5 h-5 rounded-full bg-emerald-400/20 text-emerald-400 text-xs flex items-center justify-center font-bold flex-shrink-0">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{c.campaignName}</p>
                      <p className="text-xs text-muted-foreground">R$ {Number(c.totalSpend ?? 0).toFixed(2)} gasto</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      {primarySortKey === "avgRoas" ? (
                        <>
                          <p className="text-xs font-bold text-emerald-400">{Number(c.avgRoas ?? 0).toFixed(2)}x</p>
                          <p className="text-xs text-muted-foreground">ROAS</p>
                        </>
                      ) : (
                        <>
                          <p className="text-xs font-bold text-emerald-400">R$ {Number(c.avgCpa ?? 0).toFixed(2)}</p>
                          <p className="text-xs text-muted-foreground">Custo/resultado</p>
                        </>
                      )}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <ArrowDown className="w-4 h-4 text-red-400" />
                  Underperformers
                </CardTitle>
                <Badge variant="outline" className="text-xs text-red-400 border-red-400/30">Precisam atenção</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {isLoading ? (
                <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-12 bg-muted rounded-lg animate-pulse" />)}</div>
              ) : underCampaigns.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Nenhum dado disponível. Sincronize sua conta.</p>
              ) : (
                underCampaigns.map((c, i) => (
                  <div key={c.campaignId} className="flex items-center gap-3 p-2.5 rounded-lg bg-accent/30">
                    <span className="w-5 h-5 rounded-full bg-red-400/20 text-red-400 text-xs flex items-center justify-center font-bold flex-shrink-0">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{c.campaignName}</p>
                      <p className="text-xs text-muted-foreground">
                        {primarySortKey === "avgRoas" ? `ROAS: ${Number(c.avgRoas ?? 0).toFixed(2)}x` : `Custo: R$ ${Number(c.avgCpa ?? 0).toFixed(2)}`}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs font-bold text-red-400">R$ {Number(c.totalSpend ?? 0).toFixed(2)}</p>
                      <p className="text-xs text-muted-foreground">gasto</p>
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

// ─── Billing / Balance Card ───────────────────────────────────────────────────
function BillingCard({ accountId }: { accountId: number }) {
  const { data: billing, isLoading } = trpc.accounts.billing.useQuery({ accountId });
  if (isLoading) {
    return (
      <Card className="border-border">
        <CardContent className="p-5 flex items-center gap-3">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Carregando informações de pagamento...</span>
        </CardContent>
      </Card>
    );
  }
  if (!billing) return null;
  const remaining = billing.remainingBalance;
  const isLow = remaining !== null && remaining < 200;
  const isCritical = remaining !== null && remaining < 50;
  const fundingLabel = (() => {
    const map: Record<number, string> = {
      0: "Não configurado", 1: "Cartão de crédito", 2: "Saldo Meta (pré-pago)",
      3: "Crédito pago Meta", 4: "Crédito estendido Meta", 5: "Ordem", 6: "Fatura",
      12: "PayPal", 13: "PayPal (recorrente)", 15: "Depósito externo (PIX / Boleto)",
      17: "Débito direto", 19: "Pagamento alternativo", 20: "Saldo armazenado (pré-pago)",
    };
    return billing.fundingSourceDisplay ?? (billing.fundingSourceType !== null ? (map[billing.fundingSourceType] ?? `Tipo ${billing.fundingSourceType}`) : "Não configurado");
  })();
  return (
    <Card className={`border ${isCritical ? "border-red-500/40 bg-red-500/5" : isLow ? "border-yellow-500/40 bg-yellow-500/5" : "border-border"}`}>
      <CardContent className="p-5">
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-purple-400/10 flex items-center justify-center flex-shrink-0">
              {billing.isPrePaid ? <Wallet className="w-4 h-4 text-purple-400" /> : <CreditCard className="w-4 h-4 text-purple-400" />}
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Forma de pagamento</p>
              <p className="text-sm font-semibold text-foreground">{fundingLabel}</p>
            </div>
          </div>
          {billing.isPrePaid && remaining !== null && (
            <div className="flex items-center gap-2.5">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${isCritical ? "bg-red-400/10" : isLow ? "bg-yellow-400/10" : "bg-emerald-400/10"}`}>
                {isCritical || isLow ? <AlertTriangle className={`w-4 h-4 ${isCritical ? "text-red-400" : "text-yellow-400"}`} /> : <DollarSign className="w-4 h-4 text-emerald-400" />}
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Saldo remanescente</p>
                <p className={`text-sm font-bold ${isCritical ? "text-red-400" : isLow ? "text-yellow-400" : "text-emerald-400"}`}>
                  {billing.currency} {remaining.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>
          )}
          {!billing.isPrePaid && billing.spendCap && (
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-blue-400/10 flex items-center justify-center flex-shrink-0">
                <DollarSign className="w-4 h-4 text-blue-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Limite de gasto</p>
                <p className="text-sm font-semibold text-foreground">
                  {billing.currency} {(parseFloat(billing.spendCap) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>
          )}
          {billing.isPrePaid && isLow && remaining !== null && (
            <div className={`ml-auto flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium ${isCritical ? "bg-red-500/10 text-red-400 border border-red-500/20" : "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20"}`}>
              <AlertTriangle className="w-3.5 h-3.5" />
              {isCritical ? "Saldo crítico! Recarregue imediatamente." : "Saldo abaixo de R$ 200 — Recarregue em breve."}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
