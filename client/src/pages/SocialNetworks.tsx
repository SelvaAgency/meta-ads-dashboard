import { MetaDashboardLayout } from "@/components/MetaDashboardLayout";
import { useSelectedAccount } from "@/hooks/useSelectedAccount";
import { trpc } from "@/lib/trpc";
import {
  Facebook,
  Instagram,
  Users,
  Heart,
  MessageCircle,
  ExternalLink,
  Globe,
  Loader2,
  Share2,
  Building2,
  Eye,
  MousePointerClick,
  TrendingUp,
  BarChart3,
  UserPlus,
  ThumbsUp,
  Image,
  Link2,
  Zap,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  LayoutGrid,
  FileText,
  Activity,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { getClientByMetaAccountId } from "@/config/clientConfig";
import { useMemo, useState } from "react";
import { PeriodFilter, usePeriodFilter, getPresetDateRange } from "@/components/PeriodFilter";
import { DollarSign, Target, Percent } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { canManageContent } from "@shared/permissions";
import { toast } from "sonner";

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmt(n: number | undefined | null): string {
  if (n == null) return "–";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return n.toLocaleString("pt-BR");
}

function fmtPct(n: number | undefined | null): string {
  if (n == null) return "–";
  return n.toFixed(1) + "%";
}

function fmtCurrency(n: number | undefined | null): string {
  if (n == null) return "–";
  return "R$ " + n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─── Types ──────────────────────────────────────────────────────────────────

interface PageData {
  id: string;
  name: string;
  category?: string;
  fan_count?: number;
  picture?: { data?: { url?: string } };
  instagram_business_account?: {
    id: string;
    username: string;
    followers_count: number;
    media_count?: number;
    profile_picture_url?: string;
    biography?: string;
  };
}

type TabId = "overview" | "content" | "insights" | "paid";

// ─── KPI Card (Business Suite style) ────────────────────────────────────────

function KpiCard({
  icon: Icon,
  label,
  value,
  sublabel,
  color,
  bgColor,
}: {
  icon: any;
  label: string;
  value: string;
  sublabel?: string;
  color: string;
  bgColor: string;
}) {
  return (
    <div className="bg-card rounded-xl border border-border p-4 hover:shadow-md transition-shadow">
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: bgColor }}
        >
          <Icon className="w-5 h-5" style={{ color }} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-2xl font-bold text-foreground leading-tight">{value}</p>
          <p className="text-xs text-muted-foreground truncate">{label}</p>
          {sublabel && (
            <p className="text-[10px] text-muted-foreground/70 mt-0.5">{sublabel}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Metric Row (inside platform section) ─────────────────────────────────

function MetricRow({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: any;
  label: string;
  value: string;
  color: string;
}) {
  const isEmpty = value === "–";
  return (
    <div className="flex items-center justify-between py-2 border-b border-border/30 last:border-b-0">
      <div className="flex items-center gap-2.5">
        <Icon className="w-4 h-4 flex-shrink-0" style={{ color: isEmpty ? "#9CA3AF" : color }} />
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>
      <span className={`text-sm font-semibold ${isEmpty ? "text-muted-foreground/50" : "text-foreground"}`}>
        {value}
      </span>
    </div>
  );
}

// ─── Platform Section (Business Suite style card) ─────────────────────────

function PlatformSection({
  platform,
  icon: Icon,
  label,
  sublabel,
  url,
  color,
  bgColor,
  borderColor,
  children,
  avatar,
}: {
  platform: "facebook" | "instagram";
  icon: any;
  label: string;
  sublabel?: string;
  url?: string;
  color: string;
  bgColor: string;
  borderColor: string;
  children: React.ReactNode;
  avatar?: string;
}) {
  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor }}>
      {/* Platform header */}
      <div className="flex items-center gap-3 px-5 py-3.5" style={{ backgroundColor: bgColor }}>
        {avatar ? (
          <img src={avatar} alt={label} className="w-8 h-8 rounded-full object-cover" />
        ) : (
          <Icon className="w-5 h-5" style={{ color }} />
        )}
        <div className="flex-1 min-w-0">
          <span className="text-sm font-semibold" style={{ color }}>
            {label}
          </span>
          {sublabel && (
            <span className="text-[10px] ml-2" style={{ color: `${color}99` }}>
              {sublabel}
            </span>
          )}
        </div>
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 rounded-lg hover:bg-black/5 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" style={{ color }} />
          </a>
        )}
      </div>

      {/* Metrics */}
      <div className="px-5 py-3">{children}</div>
    </div>
  );
}

// ─── Recent Post Card ─────────────────────────────────────────────────────

function RecentPostCard({
  post,
  igUsername,
}: {
  post: { id: string; like_count?: number; comments_count?: number; timestamp?: string; media_url?: string; media_type?: string; caption?: string; thumbnail_url?: string };
  igUsername?: string;
}) {
  const imgUrl = post.thumbnail_url || post.media_url;
  const date = post.timestamp ? new Date(post.timestamp) : null;
  const engagement = (post.like_count ?? 0) + (post.comments_count ?? 0);

  return (
    <div className="bg-card rounded-lg border border-border overflow-hidden hover:shadow-md transition-all group">
      {/* Thumbnail */}
      <div className="aspect-square bg-muted relative overflow-hidden">
        {imgUrl ? (
          <img src={imgUrl} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Image className="w-8 h-8 text-muted-foreground/30" />
          </div>
        )}
        {post.media_type === "VIDEO" && (
          <div className="absolute top-2 right-2 bg-black/60 text-white text-[9px] px-1.5 py-0.5 rounded">
            VIDEO
          </div>
        )}
        {post.media_type === "CAROUSEL_ALBUM" && (
          <div className="absolute top-2 right-2 bg-black/60 text-white text-[9px] px-1.5 py-0.5 rounded">
            CAROUSEL
          </div>
        )}
      </div>

      {/* Engagement */}
      <div className="p-3">
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Heart className="w-3 h-3 text-pink-500" />
            {fmt(post.like_count)}
          </span>
          <span className="flex items-center gap-1">
            <MessageCircle className="w-3 h-3 text-blue-500" />
            {fmt(post.comments_count)}
          </span>
        </div>
        {date && (
          <p className="text-[10px] text-muted-foreground/60 mt-1.5">
            {date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Page Overview (Business Suite style) ─────────────────────────────────

function PageOverview({
  page,
  insights,
  insightsLoading,
}: {
  page: PageData;
  insights: any;
  insightsLoading: boolean;
}) {
  const ig = page.instagram_business_account;
  const fb = insights?._fbMetrics as Record<string, number> | null;
  const igM = insights?._igMetrics as Record<string, number> | null;
  const pageUrl = `https://facebook.com/${page.id}`;
  const igUrl = ig ? `https://instagram.com/${ig.username}` : null;

  // Calculate engagement rate for IG
  const igEngRate = ig && igM?.accounts_engaged && ig.followers_count > 0
    ? (igM.accounts_engaged / ig.followers_count) * 100
    : null;

  return (
    <div className="space-y-4">
      {/* Page Header */}
      <div className="flex items-center gap-4 pb-3 border-b border-border/50">
        <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center flex-shrink-0 overflow-hidden shadow-sm">
          {page.picture?.data?.url ? (
            <img src={page.picture.data.url} alt={page.name} className="w-full h-full object-cover rounded-2xl" />
          ) : (
            <Building2 className="w-7 h-7 text-primary" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-bold text-foreground truncate">{page.name}</h3>
          {page.category && (
            <p className="text-xs text-muted-foreground">{page.category}</p>
          )}
        </div>
        {ig && (
          <Badge variant="outline" className="text-[10px] bg-green-500/10 text-green-600 border-green-500/30">
            FB + IG conectados
          </Badge>
        )}
      </div>

      {insightsLoading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="w-6 h-6 text-primary animate-spin" />
          <span className="text-sm text-muted-foreground ml-2">Carregando metricas...</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Facebook Section */}
          <PlatformSection
            platform="facebook"
            icon={Facebook}
            label={page.name}
            sublabel="Facebook · 28 dias"
            url={pageUrl}
            color="#1877F2"
            bgColor="#1877F208"
            borderColor="#1877F220"
            avatar={page.picture?.data?.url}
          >
            <MetricRow icon={Users} label="Curtidas da Pagina" value={fmt(page.fan_count)} color="#1877F2" />
            <MetricRow icon={Eye} label="Impressoes" value={fmt(fb?.page_impressions)} color="#1877F2" />
            <MetricRow icon={Globe} label="Alcance" value={fmt(fb?.page_impressions_unique)} color="#1877F2" />
            <MetricRow icon={MousePointerClick} label="Engajamento" value={fmt(fb?.page_post_engagements)} color="#1877F2" />
            <MetricRow icon={UserPlus} label="Novos Fas" value={fmt(fb?.page_fan_adds)} color="#1877F2" />
            <MetricRow icon={BarChart3} label="Visualizacoes de Pagina" value={fmt(fb?.page_views_total)} color="#1877F2" />
          </PlatformSection>

          {/* Instagram Section */}
          {ig ? (
            <PlatformSection
              platform="instagram"
              icon={Instagram}
              label={`@${ig.username}`}
              sublabel="Instagram · 28 dias"
              url={igUrl ?? undefined}
              color="#E4405F"
              bgColor="#E4405F08"
              borderColor="#E4405F20"
              avatar={ig.profile_picture_url}
            >
              <MetricRow icon={Heart} label="Seguidores" value={fmt(ig.followers_count)} color="#E4405F" />
              <MetricRow icon={Eye} label="Impressoes" value={fmt(igM?.impressions)} color="#E4405F" />
              <MetricRow icon={TrendingUp} label="Alcance" value={fmt(igM?.reach)} color="#E4405F" />
              <MetricRow icon={Users} label="Contas Engajadas" value={fmt(igM?.accounts_engaged)} color="#E4405F" />
              <MetricRow icon={Globe} label="Visitas ao Perfil" value={fmt(igM?.profile_views)} color="#E4405F" />
              <MetricRow icon={Image} label="Publicacoes" value={fmt(ig.media_count)} color="#E4405F" />
              {igM?.avg_likes != null && (
                <MetricRow icon={ThumbsUp} label="Media Curtidas/Post" value={fmt(igM.avg_likes)} color="#E4405F" />
              )}
              {igM?.avg_comments != null && (
                <MetricRow icon={MessageCircle} label="Media Comentarios/Post" value={fmt(igM.avg_comments)} color="#E4405F" />
              )}
              {igEngRate != null && (
                <MetricRow icon={Activity} label="Taxa de Engajamento" value={fmtPct(igEngRate)} color="#E4405F" />
              )}
            </PlatformSection>
          ) : (
            <div className="rounded-xl border border-border/50 bg-muted/20 flex flex-col items-center justify-center py-10">
              <Instagram className="w-8 h-8 text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground">Instagram nao vinculado</p>
              <p className="text-[10px] text-muted-foreground/50 mt-1">
                Conecte uma conta Instagram Business a esta pagina
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Content Tab (Recent Posts) ───────────────────────────────────────────

function ContentTab({
  page,
  insights,
  insightsLoading,
}: {
  page: PageData;
  insights: any;
  insightsLoading: boolean;
}) {
  const ig = page.instagram_business_account;
  const igM = insights?._igMetrics as Record<string, number> | null;
  const recentPosts = (insights as any)?._recentPosts as any[] | null;

  if (insightsLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 text-primary animate-spin" />
        <span className="text-sm text-muted-foreground ml-2">Carregando conteudo...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* IG Content Stats */}
      {ig && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard
            icon={Image}
            label="Total Publicacoes"
            value={fmt(ig.media_count)}
            color="#E4405F"
            bgColor="#E4405F15"
          />
          {igM?.avg_likes != null && (
            <KpiCard
              icon={ThumbsUp}
              label="Media Curtidas"
              value={fmt(igM.avg_likes)}
              sublabel="por publicacao"
              color="#E4405F"
              bgColor="#E4405F15"
            />
          )}
          {igM?.avg_comments != null && (
            <KpiCard
              icon={MessageCircle}
              label="Media Comentarios"
              value={fmt(igM.avg_comments)}
              sublabel="por publicacao"
              color="#E4405F"
              bgColor="#E4405F15"
            />
          )}
          {igM?.recent_posts != null && (
            <KpiCard
              icon={Activity}
              label="Posts Recentes"
              value={String(igM.recent_posts)}
              sublabel="analisados"
              color="#E4405F"
              bgColor="#E4405F15"
            />
          )}
        </div>
      )}

      {/* Recent Posts Grid */}
      {recentPosts && recentPosts.length > 0 ? (
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <LayoutGrid className="w-4 h-4 text-primary" />
            Publicacoes Recentes
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {recentPosts.map((post: any) => (
              <RecentPostCard key={post.id} post={post} igUsername={ig?.username} />
            ))}
          </div>
        </div>
      ) : (
        <div className="bg-card rounded-xl border border-border p-10 text-center">
          <Image className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            {ig ? "Publicacoes indisponiveis com token atual" : "Nenhuma publicacao recente encontrada"}
          </p>
          <p className="text-[10px] text-muted-foreground/50 mt-1">
            {ig
              ? `@${ig.username} possui ${ig.media_count ?? 0} publicacoes. Para exibir o feed, e necessario permissao instagram_basic no token.`
              : "Conecte uma conta Instagram Business para ver publicacoes"}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Insights Tab (Audience / Engagement Details) ─────────────────────────

function InsightsTab({
  page,
  insights,
  insightsLoading,
}: {
  page: PageData;
  insights: any;
  insightsLoading: boolean;
}) {
  const ig = page.instagram_business_account;
  const fb = insights?._fbMetrics as Record<string, number> | null;
  const igM = insights?._igMetrics as Record<string, number> | null;

  if (insightsLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 text-primary animate-spin" />
        <span className="text-sm text-muted-foreground ml-2">Carregando insights...</span>
      </div>
    );
  }

  const hasFbData = fb && Object.keys(fb).length > 0;
  const hasIgData = igM && Object.keys(igM).length > 0;
  const hasBasicData = page.fan_count != null || ig?.followers_count != null;

  if (!hasFbData && !hasIgData && !hasBasicData) {
    return (
      <div className="bg-card rounded-xl border border-border p-10 text-center">
        <Activity className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">Sem dados de insights disponiveis</p>
        <p className="text-[10px] text-muted-foreground/50 mt-1">
          Os insights requerem permissoes de pagina e podem levar ate 48h para serem processados
        </p>
      </div>
    );
  }

  // Engagement rate calculations
  const fbEngRate = fb && fb.page_post_engagements && fb.page_impressions
    ? (fb.page_post_engagements / fb.page_impressions) * 100
    : null;
  const igEngRate = ig && igM?.accounts_engaged && ig.followers_count > 0
    ? (igM.accounts_engaged / ig.followers_count) * 100
    : null;

  return (
    <div className="space-y-6">
      {/* Info banner when detailed insights aren't available */}
      {!hasFbData && !hasIgData && hasBasicData && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex items-start gap-3">
          <Zap className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-800">Insights detalhados indisponiveis</p>
            <p className="text-xs text-amber-700/70 mt-1">
              Metricas de impressoes, alcance e engajamento requerem permissoes adicionais de pagina (pages_read_engagement).
              Os dados basicos de audiencia estao disponiveis na aba Visao Geral.
            </p>
          </div>
        </div>
      )}

      {/* Audience Overview (from basic data) */}
      {hasBasicData && !hasFbData && !hasIgData && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {page.fan_count != null && (
            <KpiCard icon={ThumbsUp} label="Curtidas FB" value={fmt(page.fan_count)} sublabel="total acumulado" color="#1877F2" bgColor="#1877F215" />
          )}
          {ig?.followers_count != null && (
            <KpiCard icon={Heart} label="Seguidores IG" value={fmt(ig.followers_count)} sublabel="total acumulado" color="#E4405F" bgColor="#E4405F15" />
          )}
          {ig?.media_count != null && (
            <KpiCard icon={Image} label="Publicacoes IG" value={fmt(ig.media_count)} sublabel="total" color="#E4405F" bgColor="#E4405F15" />
          )}
        </div>
      )}

      {/* Engagement Summary (when detailed data IS available) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {fb?.page_impressions != null && (
          <KpiCard
            icon={Eye}
            label="Impressoes FB"
            value={fmt(fb.page_impressions)}
            sublabel="ultimos 28 dias"
            color="#1877F2"
            bgColor="#1877F215"
          />
        )}
        {fb?.page_impressions_unique != null && (
          <KpiCard
            icon={Globe}
            label="Alcance FB"
            value={fmt(fb.page_impressions_unique)}
            sublabel="pessoas unicas"
            color="#1877F2"
            bgColor="#1877F215"
          />
        )}
        {igM?.reach != null && (
          <KpiCard
            icon={TrendingUp}
            label="Alcance IG"
            value={fmt(igM.reach)}
            sublabel="ultimos 28 dias"
            color="#E4405F"
            bgColor="#E4405F15"
          />
        )}
        {igM?.impressions != null && (
          <KpiCard
            icon={Eye}
            label="Impressoes IG"
            value={fmt(igM.impressions)}
            sublabel="ultimos 28 dias"
            color="#E4405F"
            bgColor="#E4405F15"
          />
        )}
      </div>

      {/* Engagement Rates */}
      <div className="bg-card rounded-xl border border-border p-5">
        <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
          <Activity className="w-4 h-4 text-primary" />
          Taxas de Engajamento
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* FB Engagement */}
          <div className="bg-blue-500/5 rounded-lg p-4 border border-blue-500/10">
            <div className="flex items-center gap-2 mb-3">
              <Facebook className="w-4 h-4 text-blue-600" />
              <span className="text-xs font-semibold text-blue-700">Facebook</span>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Engajamento</span>
                <span className="font-semibold">{fmt(fb?.page_post_engagements)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Novos Fas</span>
                <span className="font-semibold">{fmt(fb?.page_fan_adds)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Visualizacoes</span>
                <span className="font-semibold">{fmt(fb?.page_views_total)}</span>
              </div>
              {fbEngRate != null && (
                <div className="flex justify-between text-sm pt-2 border-t border-blue-500/10">
                  <span className="text-muted-foreground font-medium">Taxa de Engajamento</span>
                  <span className="font-bold text-blue-600">{fmtPct(fbEngRate)}</span>
                </div>
              )}
            </div>
          </div>

          {/* IG Engagement */}
          {ig ? (
            <div className="bg-pink-500/5 rounded-lg p-4 border border-pink-500/10">
              <div className="flex items-center gap-2 mb-3">
                <Instagram className="w-4 h-4 text-pink-600" />
                <span className="text-xs font-semibold text-pink-700">Instagram</span>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Contas Engajadas</span>
                  <span className="font-semibold">{fmt(igM?.accounts_engaged)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Visitas ao Perfil</span>
                  <span className="font-semibold">{fmt(igM?.profile_views)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Media Curtidas/Post</span>
                  <span className="font-semibold">{fmt(igM?.avg_likes)}</span>
                </div>
                {igEngRate != null && (
                  <div className="flex justify-between text-sm pt-2 border-t border-pink-500/10">
                    <span className="text-muted-foreground font-medium">Taxa de Engajamento</span>
                    <span className="font-bold text-pink-600">{fmtPct(igEngRate)}</span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-muted/20 rounded-lg p-4 border border-border/50 flex items-center justify-center">
              <p className="text-xs text-muted-foreground">Instagram nao vinculado</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

// ─── Paid Metrics Section ────────────────────────────────────────────────────

function PaidMetricsSection({
  metrics,
  isLoading,
}: {
  metrics: any;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 text-primary animate-spin" />
        <span className="ml-2 text-sm text-muted-foreground">Carregando metricas pagas...</span>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="bg-card rounded-xl border border-border p-8 text-center">
        <DollarSign className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-40" />
        <p className="text-base font-medium text-foreground">Sem dados de midia paga</p>
        <p className="text-sm text-muted-foreground mt-1">
          Nenhuma metrica de campanha encontrada para o periodo selecionado.
        </p>
      </div>
    );
  }

  const cards = [
    { icon: DollarSign, label: "Investimento", value: fmtCurrency(metrics.spend), color: "#10B981", bgColor: "#10B98115" },
    { icon: Eye, label: "Impressoes", value: fmt(metrics.impressions), color: "#6366F1", bgColor: "#6366F115" },
    { icon: MousePointerClick, label: "Cliques", value: fmt(metrics.clicks), color: "#F59E0B", bgColor: "#F59E0B15" },
    { icon: Users, label: "Alcance", value: fmt(metrics.reach), color: "#8B5CF6", bgColor: "#8B5CF615" },
    { icon: Target, label: "Conversoes", value: fmt(metrics.conversions), color: "#EF4444", bgColor: "#EF444415" },
    { icon: TrendingUp, label: "Receita", value: fmtCurrency(metrics.conversionValue), color: "#10B981", bgColor: "#10B98115" },
  ];

  const ratios = [
    { icon: Percent, label: "CTR", value: fmtPct(metrics.ctr), color: "#F59E0B" },
    { icon: DollarSign, label: "CPC", value: fmtCurrency(metrics.cpc), color: "#6366F1" },
    { icon: DollarSign, label: "CPM", value: fmtCurrency(metrics.cpm), color: "#8B5CF6" },
    { icon: TrendingUp, label: "ROAS", value: metrics.roas ? metrics.roas.toFixed(2) + "x" : "–", color: "#10B981" },
    { icon: DollarSign, label: "CPA", value: fmtCurrency(metrics.cpa), color: "#EF4444" },
  ];

  return (
    <div className="space-y-4">
      {/* Main KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {cards.map((c) => (
          <KpiCard key={c.label} icon={c.icon} label={c.label} value={c.value} color={c.color} bgColor={c.bgColor} />
        ))}
      </div>

      {/* Efficiency Ratios */}
      <div className="bg-card rounded-xl border border-border p-4">
        <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-primary" />
          Indicadores de Eficiencia
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {ratios.map((r) => (
            <div key={r.label} className="text-center">
              <p className="text-xl font-bold text-foreground">{r.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{r.label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function SocialNetworks() {
  const { selectedAccountId, accounts } = useSelectedAccount();
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const { period, setPeriod, dateRange } = usePeriodFilter("30d");

  // Derive active client name
  const activeClient = useMemo(() => {
    if (!selectedAccountId || !accounts) return null;
    const acc = accounts.find((a: any) => a.id === selectedAccountId);
    if (!acc) return null;
    return getClientByMetaAccountId(acc.accountId) ?? null;
  }, [selectedAccountId, accounts]);

  // Fetch pages filtered by the selected ad account
  const { data, isLoading, error } = trpc.socialNetworks.forAccount.useQuery(
    { accountId: selectedAccountId! },
    { enabled: !!selectedAccountId, staleTime: 5 * 60 * 1000 }
  );

  const pages: PageData[] = data?.pages ?? [];
  const backendError = (data as any)?.error as string | undefined;
  const isFallback = (data as any)?.fallback === true;
  const pagesWithIg = pages.filter((p) => p.instagram_business_account);
  const totalFbLikes = pages.reduce((sum, p) => sum + (p.fan_count ?? 0), 0);
  const totalIgFollowers = pagesWithIg.reduce(
    (sum, p) => sum + (p.instagram_business_account?.followers_count ?? 0),
    0
  );

  // Fetch insights for the first (primary) page
  const primaryPage = pages[0];
  const { data: primaryInsights, isLoading: insightsLoading } =
    trpc.socialNetworks.pageInsights.useQuery(
      { pageId: primaryPage?.id ?? "", since: dateRange.startDate, until: dateRange.endDate },
      { enabled: !!primaryPage?.id, staleTime: 5 * 60 * 1000 }
    );

  // Paid metrics from campaign_metrics DB
  const { data: paidMetrics, isLoading: paidLoading } =
    trpc.socialNetworks.socialPaidMetrics.useQuery(
      { accountId: selectedAccountId!, startDate: dateRange.startDate, endDate: dateRange.endDate },
      { enabled: !!selectedAccountId, staleTime: 5 * 60 * 1000 }
    );

  const tabs: { id: TabId; label: string; icon: any }[] = [
    { id: "overview", label: "Visao Geral", icon: LayoutGrid },
    { id: "content", label: "Conteudo", icon: Image },
    { id: "insights", label: "Insights", icon: Activity },
    { id: "paid", label: "Pago", icon: DollarSign },
  ];

  // No account selected
  if (!selectedAccountId) {
    return (
      <MetaDashboardLayout>
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
            <Share2 className="w-7 h-7 text-primary" />
          </div>
          <h2 className="text-xl font-semibold text-foreground mb-2">Selecione uma conta</h2>
          <p className="text-muted-foreground max-w-sm">
            Escolha uma conta no menu lateral para visualizar as redes sociais do cliente.
          </p>
        </div>
      </MetaDashboardLayout>
    );
  }

  // No accounts connected
  if (!accounts || accounts.length === 0) {
    return (
      <MetaDashboardLayout>
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
            <Link2 className="w-7 h-7 text-primary" />
          </div>
          <h2 className="text-xl font-semibold text-foreground mb-2">Nenhuma conta conectada</h2>
          <p className="text-muted-foreground mb-6 max-w-sm">
            Conecte sua conta Meta Ads para visualizar redes sociais.
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
    <MetaDashboardLayout>
      <div className="space-y-5">
        {/* Header — Business Suite style */}
        <div>
          <div className="flex items-center gap-3">
            <Share2 className="w-6 h-6 text-primary" />
            <h1
              className="text-2xl font-bold text-foreground"
              style={{ fontFamily: "'Montserrat', sans-serif" }}
            >
              Redes Sociais
            </h1>
            <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/30">
              Business Suite
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1 ml-9">
            {activeClient
              ? `Paginas e perfis de ${activeClient.name}`
              : "Metricas de performance das paginas e perfis"}
          </p>
        </div>

        {selectedAccountId && <CadastroSocial accountId={selectedAccountId} />}

        {/* Period Filter */}
        <PeriodFilter
          period={period}
          onChange={setPeriod}
          compact
          presets={["7d", "14d", "30d", "custom"]}
        />

        {/* KPI Summary Row */}
        {!isLoading && pages.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard
              icon={Globe}
              label="Paginas Facebook"
              value={String(pages.length)}
              color="#1877F2"
              bgColor="#1877F215"
            />
            <KpiCard
              icon={Instagram}
              label="Perfis Instagram"
              value={String(pagesWithIg.length)}
              color="#E4405F"
              bgColor="#E4405F15"
            />
            <KpiCard
              icon={Users}
              label="Curtidas FB"
              value={fmt(totalFbLikes)}
              sublabel="total acumulado"
              color="#1877F2"
              bgColor="#1877F215"
            />
            <KpiCard
              icon={Heart}
              label="Seguidores IG"
              value={fmt(totalIgFollowers)}
              sublabel="total acumulado"
              color="#E4405F"
              bgColor="#E4405F15"
            />
          </div>
        )}

        {/* Tab Navigation — Business Suite style */}
        {!isLoading && pages.length > 0 && (
          <div className="flex items-center gap-1 border-b border-border pb-0">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors relative ${
                    isActive
                      ? "text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <tab.icon className="w-4 h-4" />
                  {tab.label}
                  {isActive && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-t" />
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Fallback notice */}
        {isFallback && !isLoading && pages.length > 0 && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-2.5 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-amber-500 flex-shrink-0" />
            <p className="text-xs text-amber-600">
              Exibindo todas as paginas do portfolio. Nao foi possivel filtrar por conta especifica.
            </p>
          </div>
        )}

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-20">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
              <p className="text-sm text-muted-foreground">
                Carregando redes sociais{activeClient ? ` de ${activeClient.name}` : ""}...
              </p>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-6 text-center">
            <p className="text-destructive font-medium">Erro ao carregar redes sociais</p>
            <p className="text-xs text-muted-foreground mt-1">{error.message}</p>
          </div>
        )}

        {/* Tab Content */}
        {!isLoading && pages.length > 0 && primaryPage && (
          <>
            {activeTab === "overview" && (
              <PageOverview
                page={primaryPage}
                insights={primaryInsights}
                insightsLoading={insightsLoading}
              />
            )}
            {activeTab === "content" && (
              <ContentTab
                page={primaryPage}
                insights={primaryInsights}
                insightsLoading={insightsLoading}
              />
            )}
            {activeTab === "insights" && (
              <InsightsTab
                page={primaryPage}
                insights={primaryInsights}
                insightsLoading={insightsLoading}
              />
            )}
            {activeTab === "paid" && (
              <PaidMetricsSection
                metrics={paidMetrics}
                isLoading={paidLoading}
              />
            )}
          </>
        )}

        {/* Empty State */}
        {!isLoading && pages.length === 0 && !error && (
          <div className="bg-card rounded-xl border border-border p-12 text-center">
            <Share2 className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-40" />
            <p className="text-lg font-medium text-foreground">
              Nenhuma rede social encontrada
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {backendError ||
                (activeClient
                  ? `Nenhuma pagina vinculada a conta de ${activeClient.name}`
                  : "Verifique as paginas vinculadas ao portfolio empresarial SELVA Agency")}
            </p>
          </div>
        )}
      </div>
    </MetaDashboardLayout>
  );
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Cadastro de perfis por cliente
 * ─────────────────────────────────────────────────────────────────────────────
 *  As métricas acima vêm ao vivo da Graph API, resolvidas por um mapa
 *  hardcoded (shared/pageMapping.ts) que só muda por deploy. Quem sabe o @ do
 *  cliente é a equipe, não o repositório — este cadastro é o caminho para
 *  aposentar aquele mapa.
 *
 *  Instagram é a prioridade; LinkedIn e YouTube já aparecem porque o modelo os
 *  aceita, e deixar o campo fechado hoje viraria migração amanhã.
 *
 *  Cadastrar o @ NÃO liga a coleta sozinho: a API do Instagram exige conta
 *  Business/Creator e revisão do app pela Meta. A tela diz isso — prometer
 *  dado que não vem seria pior que não ter o campo.
 * ─────────────────────────────────────────────────────────────────────────────
 */
function CadastroSocial({ accountId }: { accountId: number }) {
  const { user } = useAuth();
  const podeEditar = canManageContent((user as { role?: string } | null)?.role);
  const utils = trpc.useUtils();
  const q = trpc.social.daConta.useQuery({ accountId });
  const [handle, setHandle] = useState("");
  const [provider, setProvider] = useState<"instagram" | "linkedin" | "youtube">("instagram");

  const salvar = trpc.social.salvar.useMutation({
    onSuccess: (r) => { utils.social.daConta.invalidate({ accountId }); setHandle(""); toast.success(`@${r.handle} cadastrado.`); },
    onError: (e) => toast.error(e.message),
  });
  const apagar = trpc.social.apagar.useMutation({
    onSuccess: () => { utils.social.daConta.invalidate({ accountId }); toast.success("Perfil removido."); },
  });

  const perfis = q.data ?? [];
  if (!podeEditar && perfis.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Instagram className="w-4 h-4 text-muted-foreground" />
        <p className="text-sm font-medium">Perfis deste cliente</p>
        <span className="text-[11px] text-muted-foreground">
          · usado para vincular o perfil às métricas
        </span>
      </div>

      {perfis.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {perfis.map((p) => (
            <div key={p.id} className="flex items-center gap-2 text-xs rounded-md border border-border px-2.5 py-1.5">
              <span className="text-muted-foreground uppercase text-[10px] w-16 flex-shrink-0">{p.provider}</span>
              <a href={p.profileUrl ?? "#"} target="_blank" rel="noopener noreferrer" className="font-medium hover:underline">
                @{p.handle}
              </a>
              {!p.enabled && <span className="text-[10px] text-muted-foreground">(desativado)</span>}
              {podeEditar && (
                <button
                  onClick={() => { if (confirm(`Remover @${p.handle}?`)) apagar.mutate({ id: p.id }); }}
                  className="ml-auto text-muted-foreground hover:text-destructive"
                >
                  remover
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {podeEditar && (
        <div className="flex items-end gap-2 flex-wrap">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-muted-foreground">Rede</label>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value as typeof provider)}
              className="text-sm border border-border rounded-md px-2 py-1.5 bg-background h-9"
            >
              <option value="instagram">Instagram</option>
              <option value="linkedin">LinkedIn</option>
              <option value="youtube">YouTube</option>
            </select>
          </div>
          <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
            <label className="text-[11px] text-muted-foreground">Perfil</label>
            <input
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && handle.trim()) salvar.mutate({ accountId, provider, handle }); }}
              placeholder="@cliente ou o link do perfil"
              className="text-sm border border-border rounded-md px-3 py-2 bg-background h-9"
            />
          </div>
          <button
            onClick={() => handle.trim() && salvar.mutate({ accountId, provider, handle })}
            disabled={salvar.isPending || !handle.trim()}
            className="h-9 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-medium disabled:opacity-50"
          >
            Adicionar
          </button>
        </div>
      )}

      {perfis.length === 0 && !podeEditar && (
        <p className="text-xs text-muted-foreground">Nenhum perfil cadastrado para este cliente.</p>
      )}

      <p className="text-[11px] text-muted-foreground">
        Cadastrar o perfil registra o vínculo, mas ainda não liga a coleta automática: a API do
        Instagram exige conta Business ou Creator e revisão do app pela Meta. As métricas abaixo
        continuam vindo das páginas já conectadas ao portfólio.
      </p>
    </div>
  );
}
