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
import { useState, useMemo, useEffect } from "react";
import { useLocation } from "wouter";
import { Input } from "@/components/ui/input";

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

// ─── Period presets ──────────────────────────────────────────────────────────

type PeriodPreset = "today" | "yesterday" | "today_yesterday" | "7d" | "14d" | "30d" | "custom";

interface PeriodState {
  preset: PeriodPreset;
  customStart: string; // YYYY-MM-DD
  customEnd: string;   // YYYY-MM-DD
}

const PERIOD_LABELS: Record<PeriodPreset, string> = {
  today: "Hoje",
  yesterday: "Ontem",
  today_yesterday: "Hoje e Ontem",
  "7d": "Últimos 7 dias",
  "14d": "Últimos 14 dias",
  "30d": "Últimos 30 dias",
  custom: "Personalizado",
};

function toIso(d: Date) {
  return d.toISOString().split("T")[0]!;
}

function getPresetRange(preset: PeriodPreset): { startDate: string; endDate: string } | { days: number } {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  switch (preset) {
    case "today":
      return { startDate: toIso(today), endDate: toIso(today) };
    case "yesterday":
      return { startDate: toIso(yesterday), endDate: toIso(yesterday) };
    case "today_yesterday":
      return { startDate: toIso(yesterday), endDate: toIso(today) };
    case "7d":
      return { days: 7 };
    case "14d":
      return { days: 14 };
    case "30d":
      return { days: 30 };
    default:
      return { days: 7 };
  }
}

function applyDateMaskDash(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
}

function CustomDateInput({
  label, value, onChange, disabled,
}: { label: string; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const [local, setLocal] = useState(value);
  useEffect(() => { setLocal(value); }, [value]);
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Input
        value={local}
        onChange={(e) => {
          const v = applyDateMaskDash(e.target.value);
          setLocal(v);
          if (v.length === 10) onChange(v);
        }}
        onBlur={() => onChange(local)}
        placeholder="aaaa-mm-dd"
        disabled={disabled}
        maxLength={10}
        className="h-7 text-xs font-mono w-32"
        autoComplete="off"
      />
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function Dashboard() {
  const [period, setPeriod] = useState<PeriodState>({
    preset: "7d",
    customStart: "",
    customEnd: "",
  });
  const [, navigate] = useLocation();
  const { selectedAccountId, accounts } = useSelectedAccount();

  // Reset period to default when account changes
  const prevAccountRef = useMemo(() => ({ current: selectedAccountId }), []);
  useEffect(() => {
    if (prevAccountRef.current !== selectedAccountId) {
      prevAccountRef.current = selectedAccountId;
      setPeriod({ preset: "7d", customStart: "", customEnd: "" });
    }
  }, [selectedAccountId]);

  // Build query params from period state
  const queryParams = useMemo(() => {
    if (period.preset === "custom") {
      if (period.customStart && period.customEnd) {
        return { startDate: period.customStart, endDate: period.customEnd };
      }
      return { days: 7 };
    }
    return getPresetRange(period.preset);
  }, [period]);

  const { data, isLoading } = trpc.dashboard.overview.useQuery(
    { accountId: selectedAccountId!, ...queryParams },
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

  // Build extended totals including cpc, cpm, frequency, reach
  const totals = useMemo(() => {
    if (!data?.totals) return null;
    const t = data.totals;
    const cpc = t.clicks > 0 ? t.spend / t.clicks : 0;
    const cpm = t.impressions > 0 ? (t.spend / t.impressions) * 1000 : 0;
    // frequency: average from timeSeries
    const freqSum = data.timeSeries?.reduce((s: number, m: any) => s + parseFloat(String(m.avgFrequency ?? 0)), 0) ?? 0;
    const frequency = data.timeSeries?.length ? freqSum / data.timeSeries.length : 0;
    // reach: sum from backend totals (already aggregated)
    const reach = Number(t.reach ?? 0);
    return { ...t, cpc, cpm, frequency, reach };
  }, [data]);

  // Chart: use primary metric based on goalType
  // ROAS only for SALES/VALUE; for everything else use Resultados (conversions)
  const chartMetricKey = ["SALES", "VALUE"].includes(goalType) ? "ROAS" : "Resultado";
  const chartMetricLabel = ["SALES", "VALUE"].includes(goalType)
    ? "ROAS"
    : (data?.goalProfile?.resultLabel ?? objInfo.label);

  const chartData = useMemo(() => {
    if (!data?.timeSeries) return [];
    return data.timeSeries.map((d) => ({
      date: new Date(d.date).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
      Gasto: parseFloat(String(d.totalSpend ?? 0)),
      Resultado: parseFloat(String(d.totalConversions ?? 0)),
      ROAS: parseFloat(String(d.avgRoas ?? 0)),
    }));
  }, [data]);

  // Top/Underperformers:
  // 1. Filter ONLY campaigns with status ACTIVE
  // 2. Sort by totalConversions (results) — the actual performance metric, not ROAS
  //    Exception: SALES/VALUE accounts also consider ROAS as secondary signal
  // 3. If ≤2 active campaigns: all go to Top Performers, none to Underperformers
  //    If >2 active campaigns: top N-1 in Top, worst 1 in Underperformers
  const activeCampaignsWithData = useMemo(() => {
    if (!data?.campaigns) return [];
    return [...data.campaigns].filter(
      (c) => String((c as any).campaignStatus ?? "").toUpperCase() === "ACTIVE"
    );
  }, [data]);

  const topCampaigns = useMemo(() => {
    const sorted = [...activeCampaignsWithData].sort(
      (a, b) => Number(b.totalConversions ?? 0) - Number(a.totalConversions ?? 0)
    );
    // If ≤2 active campaigns, show all in top performers
    if (sorted.length <= 2) return sorted;
    // Otherwise show all except the worst one
    return sorted.slice(0, sorted.length - 1);
  }, [activeCampaignsWithData]);

  const underCampaigns = useMemo(() => {
    const sorted = [...activeCampaignsWithData].sort(
      (a, b) => Number(a.totalConversions ?? 0) - Number(b.totalConversions ?? 0)
    );
    // Only show underperformers if there are more than 2 active campaigns
    if (sorted.length <= 2) return [];
    // Show the worst performer
    return sorted.slice(0, 1);
  }, [activeCampaignsWithData]);

  // Label for the result metric in Top/Under performers
  const resultLabel = data?.goalProfile?.resultLabel ?? "Resultados";

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
<div className="flex flex-col items-end gap-2">
            {/* Quick period buttons */}
            <div className="flex items-center gap-1 flex-wrap justify-end">
              {(["today", "yesterday", "today_yesterday", "7d", "14d", "30d", "custom"] as PeriodPreset[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod((prev) => ({ ...prev, preset: p }))}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${
                    period.preset === p
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  {PERIOD_LABELS[p]}
                </button>
              ))}
            </div>
            {/* Custom date inputs */}
            {period.preset === "custom" && (
              <div className="flex items-end gap-2">
                <CustomDateInput
                  label="De"
                  value={period.customStart}
                  onChange={(v) => setPeriod((prev) => ({ ...prev, customStart: v }))}
                />
                <CustomDateInput
                  label="Até"
                  value={period.customEnd}
                  onChange={(v) => setPeriod((prev) => ({ ...prev, customEnd: v }))}
                />
              </div>
            )}
          </div>
        </div>

        {/* Balance Card — fixed at top */}
        {selectedAccountId && <BalanceCard accountId={selectedAccountId} />}

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
                {chartMetricKey === "ROAS"
                  ? "ROAS Diário"
                  : `${objInfo.emoji} ${chartMetricLabel} Diários`}
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
                    dataKey={chartMetricKey}
                    stroke="oklch(0.62 0.22 255)"
                    fill="url(#resultGrad)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Campaign Comparison — only ACTIVE campaigns, sorted by results */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                  Top Performers
                </CardTitle>
                <Badge variant="outline" className="text-xs text-emerald-400 border-emerald-400/30">
                  Por {resultLabel}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {isLoading ? (
                <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-12 bg-muted rounded-lg animate-pulse" />)}</div>
              ) : topCampaigns.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Nenhuma campanha ativa encontrada. Sincronize sua conta.</p>
              ) : (
                topCampaigns.map((c, i) => (
                  <div key={c.campaignId} className="flex items-center gap-3 p-2.5 rounded-lg bg-accent/30">
                    <span className="w-5 h-5 rounded-full bg-emerald-400/20 text-emerald-400 text-xs flex items-center justify-center font-bold flex-shrink-0">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{c.campaignName}</p>
                      <p className="text-xs text-muted-foreground">R$ {Number(c.totalSpend ?? 0).toFixed(2)} gasto</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs font-bold text-emerald-400">{fmtNumber(Number(c.totalConversions ?? 0))}</p>
                      <p className="text-xs text-muted-foreground">{resultLabel}</p>
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
                <p className="text-sm text-muted-foreground text-center py-4">
                  {activeCampaignsWithData.length <= 2
                    ? "Com 2 ou menos campanhas ativas, todas aparecem em Top Performers."
                    : "Nenhuma campanha ativa encontrada."}
                </p>
              ) : (
                underCampaigns.map((c, i) => (
                  <div key={c.campaignId} className="flex items-center gap-3 p-2.5 rounded-lg bg-accent/30">
                    <span className="w-5 h-5 rounded-full bg-red-400/20 text-red-400 text-xs flex items-center justify-center font-bold flex-shrink-0">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{c.campaignName}</p>
                      <p className="text-xs text-muted-foreground">R$ {Number(c.totalSpend ?? 0).toFixed(2)} gasto</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs font-bold text-red-400">{fmtNumber(Number(c.totalConversions ?? 0))}</p>
                      <p className="text-xs text-muted-foreground">{resultLabel}</p>
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

// ─── Balance Card (top of dashboard) ─────────────────────────────────────────
function BalanceCard({ accountId }: { accountId: number }) {
  const { data: billing, isLoading } = trpc.accounts.billing.useQuery({ accountId });

  if (isLoading) {
    return (
      <Card className="border-border">
        <CardContent className="p-4 flex items-center gap-3">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Carregando saldo da conta...</span>
        </CardContent>
      </Card>
    );
  }
  if (!billing) return null;

  const remaining = billing.remainingBalance;
  const fundingLabel = (() => {
    const map: Record<number, string> = {
      0: "Não configurado", 1: "Cartão de crédito", 2: "Saldo Meta (pré-pago)",
      3: "Crédito pago Meta", 4: "Crédito estendido Meta", 5: "Ordem", 6: "Fatura",
      12: "PayPal", 13: "PayPal (recorrente)", 15: "Depósito externo (PIX / Boleto)",
      17: "Débito direto", 19: "Pagamento alternativo", 20: "Saldo armazenado (pré-pago)",
    };
    return billing.fundingSourceDisplay ?? (billing.fundingSourceType !== null ? (map[billing.fundingSourceType] ?? `Tipo ${billing.fundingSourceType}`) : "Não configurado");
  })();

  // Dynamic color based on balance thresholds
  const getBalanceStyle = (balance: number | null) => {
    if (balance === null) return { bg: "bg-card", text: "text-foreground", border: "border-border", label: "—", icon: "bg-purple-400/10", iconColor: "text-purple-400" };
    if (balance > 200) return { bg: "bg-emerald-500/5", text: "text-emerald-400", border: "border-emerald-500/30", label: "Saudável", icon: "bg-emerald-400/10", iconColor: "text-emerald-400" };
    if (balance >= 100) return { bg: "bg-amber-500/5", text: "text-amber-400", border: "border-amber-500/30", label: "Atenção", icon: "bg-amber-400/10", iconColor: "text-amber-400" };
    return { bg: "bg-red-500/5", text: "text-red-400", border: "border-red-500/30", label: "Crítico", icon: "bg-red-400/10", iconColor: "text-red-400" };
  };

  const colors = getBalanceStyle(remaining);

  // For post-paid accounts without remaining balance, show a simpler card
  if (!billing.isPrePaid || remaining === null) {
    return (
      <Card className="border-border">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-purple-400/10 flex items-center justify-center flex-shrink-0">
                <CreditCard className="w-4 h-4 text-purple-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Forma de Pagamento</p>
                <p className="text-sm font-semibold text-foreground">{fundingLabel}</p>
              </div>
            </div>
            {billing.spendCap && (
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Limite de gasto</p>
                <p className="text-sm font-semibold text-foreground">
                  {billing.currency} {(parseFloat(billing.spendCap) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Pre-paid account with balance
  return (
    <Card className={`${colors.border} border ${colors.bg}`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${colors.icon}`}>
              <Wallet className={`w-5 h-5 ${colors.iconColor}`} />
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Saldo da Conta</p>
              <p className={`text-2xl font-bold ${colors.text}`}>
                {billing.currency} {remaining.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className={`${colors.text} border-current/30`}>
              {colors.label}
            </Badge>
          </div>
        </div>
        <div className="flex items-center gap-4 mt-2 pt-2 border-t border-border/30">
          <p className="text-xs text-muted-foreground">
            Forma de pagamento: <span className="text-foreground font-medium">{fundingLabel}</span>
          </p>
          {remaining < 200 && (
            <div className={`flex items-center gap-1.5 text-xs font-medium ${colors.text}`}>
              <AlertTriangle className="w-3.5 h-3.5" />
              {remaining < 100 ? "Saldo crítico! Recarregue imediatamente." : "Saldo baixo — Recarregue em breve."}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
