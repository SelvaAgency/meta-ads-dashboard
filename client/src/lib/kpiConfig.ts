import type { ComponentType } from "react";
import {
  DollarSign, TrendingUp, ShoppingCart, MousePointer,
  Users, Eye, MessageCircle, Target, Play, Heart, BarChart3,
} from "lucide-react";

export type GoalType =
  | "SALES" | "VALUE" | "LEADS" | "MESSAGES" | "ENGAGEMENT" | "FOLLOWERS"
  | "AWARENESS" | "TRAFFIC" | "VIDEO" | "APP" | "DEFAULT";

export interface KpiDef {
  key: string;
  label: string;
  subtitle?: string;
  icon: ComponentType<{ className?: string }>;
  color: "blue" | "green" | "red" | "purple" | "orange";
  format: (totals: any) => string;
  trend?: (totals: any) => "up" | "down" | "neutral";
  trendLabel?: (totals: any) => string;
}

export function fmtCurrency(n: number | null | undefined, currency = "R$") {
  const v = Number(n ?? 0);
  if (v >= 1_000_000) return `${currency} ${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `${currency} ${(v / 1_000).toFixed(1)}k`;
  return `${currency} ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
export function fmtNumber(n: number | null | undefined) {
  const v = Number(n ?? 0);
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return v.toLocaleString("pt-BR");
}
export function fmtPercent(n: number | null | undefined) { return `${Number(n ?? 0).toFixed(2)}%`; }
export function fmtMultiplier(n: number | null | undefined) { return `${Number(n ?? 0).toFixed(2)}x`; }

export function mapGoalToType(dominantGoal: string | undefined): GoalType {
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

export const GOAL_LABELS: Record<GoalType, { label: string; emoji: string }> = {
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

export const KPI_CONFIGS: Record<GoalType, KpiDef[]> = {
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
