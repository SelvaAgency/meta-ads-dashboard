import { MetaDashboardLayout } from "@/components/MetaDashboardLayout";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
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
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmt(n: number | undefined | null): string {
  if (n == null) return "–";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return n.toLocaleString("pt-BR");
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

// ─── Metric Card (small KPI inside a section) ──────────────────────────────

function MetricCard({
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
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: `${color}15` }}
      >
        <Icon className="w-4 h-4" style={{ color }} />
      </div>
      <div className="min-w-0">
        <p className="text-base font-bold text-foreground leading-tight">{value}</p>
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider truncate">
          {label}
        </p>
      </div>
    </div>
  );
}

// ─── Page Insights Card ────────────────────────────────────────────────────

function PageInsightsCard({ page }: { page: PageData }) {
  const ig = page.instagram_business_account;
  const pageUrl = `https://facebook.com/${page.id}`;
  const igUrl = ig ? `https://instagram.com/${ig.username}` : null;

  // Fetch insights for this specific page
  const { data: insights, isLoading: insightsLoading } =
    trpc.socialNetworks.pageInsights.useQuery(
      { pageId: page.id },
      { enabled: !!page.id, staleTime: 5 * 60 * 1000 }
    );

  const fb = insights?._fbMetrics as Record<string, number> | null;
  const igM = insights?._igMetrics as Record<string, number> | null;

  return (
    <div className="bg-card rounded-xl border border-border hover:shadow-lg transition-all overflow-hidden">
      {/* Header */}
      <div className="flex items-start gap-3 p-5 pb-3">
        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0 overflow-hidden">
          {page.picture?.data?.url ? (
            <img
              src={page.picture.data.url}
              alt={page.name}
              className="w-full h-full object-cover rounded-xl"
            />
          ) : (
            <Building2 className="w-6 h-6 text-primary" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-foreground truncate">{page.name}</h3>
          {page.category && (
            <p className="text-xs text-muted-foreground mt-0.5">{page.category}</p>
          )}
        </div>
      </div>

      {/* Facebook Insights */}
      <div className="mx-4 mb-3 bg-blue-500/5 rounded-lg p-4 border border-blue-500/10">
        <div className="flex items-center gap-2 mb-3">
          <Facebook className="w-4 h-4 text-blue-600" />
          <span className="text-sm font-semibold text-blue-700">Facebook</span>
          <span className="text-[10px] text-blue-500/70 ml-1">28 dias</span>
          <a href={pageUrl} target="_blank" rel="noopener noreferrer" className="ml-auto">
            <ExternalLink className="w-3.5 h-3.5 text-blue-500 hover:text-blue-700" />
          </a>
        </div>

        {insightsLoading ? (
          <div className="flex items-center gap-2 py-2">
            <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />
            <span className="text-xs text-blue-400">Carregando metricas...</span>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <MetricCard
              icon={Users}
              label="Curtidas da Pagina"
              value={fmt(page.fan_count)}
              color="#3B82F6"
            />
            <MetricCard
              icon={Eye}
              label="Impressoes"
              value={fmt(fb?.page_impressions)}
              color="#3B82F6"
            />
            <MetricCard
              icon={Globe}
              label="Alcance"
              value={fmt(fb?.page_impressions_unique)}
              color="#3B82F6"
            />
            <MetricCard
              icon={MousePointerClick}
              label="Engajamento"
              value={fmt(fb?.page_post_engagements)}
              color="#3B82F6"
            />
            <MetricCard
              icon={UserPlus}
              label="Novos Fas"
              value={fmt(fb?.page_fan_adds)}
              color="#3B82F6"
            />
            <MetricCard
              icon={BarChart3}
              label="Visualizacoes"
              value={fmt(fb?.page_views_total)}
              color="#3B82F6"
            />
          </div>
        )}
      </div>

      {/* Instagram Insights */}
      {ig ? (
        <div className="mx-4 mb-4 bg-pink-500/5 rounded-lg p-4 border border-pink-500/10">
          <div className="flex items-center gap-2 mb-3">
            <Instagram className="w-4 h-4 text-pink-600" />
            <span className="text-sm font-semibold text-pink-700">@{ig.username}</span>
            <span className="text-[10px] text-pink-500/70 ml-1">28 dias</span>
            {igUrl && (
              <a href={igUrl} target="_blank" rel="noopener noreferrer" className="ml-auto">
                <ExternalLink className="w-3.5 h-3.5 text-pink-500 hover:text-pink-700" />
              </a>
            )}
          </div>

          {insightsLoading ? (
            <div className="flex items-center gap-2 py-2">
              <Loader2 className="w-3.5 h-3.5 text-pink-400 animate-spin" />
              <span className="text-xs text-pink-400">Carregando metricas...</span>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <MetricCard
                icon={Heart}
                label="Seguidores"
                value={fmt(ig.followers_count)}
                color="#EC4899"
              />
              <MetricCard
                icon={Eye}
                label="Impressoes"
                value={fmt(igM?.impressions)}
                color="#EC4899"
              />
              <MetricCard
                icon={TrendingUp}
                label="Alcance"
                value={fmt(igM?.reach)}
                color="#EC4899"
              />
              <MetricCard
                icon={Users}
                label="Contas Engajadas"
                value={fmt(igM?.accounts_engaged)}
                color="#EC4899"
              />
              <MetricCard
                icon={Globe}
                label="Visitas ao Perfil"
                value={fmt(igM?.profile_views)}
                color="#EC4899"
              />
              <MetricCard
                icon={Image}
                label="Publicacoes"
                value={fmt(ig.media_count)}
                color="#EC4899"
              />
              {igM?.avg_likes != null && (
                <MetricCard
                  icon={ThumbsUp}
                  label="Media Curtidas/Post"
                  value={fmt(igM.avg_likes)}
                  color="#EC4899"
                />
              )}
              {igM?.avg_comments != null && (
                <MetricCard
                  icon={MessageCircle}
                  label="Media Coment/Post"
                  value={fmt(igM.avg_comments)}
                  color="#EC4899"
                />
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="mx-4 mb-4 bg-muted/30 rounded-lg p-4 border border-border/50 flex items-center gap-2">
          <Instagram className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Instagram nao vinculado</span>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function SocialNetworks() {
  const { data, isLoading, error } = trpc.socialNetworks.list.useQuery();

  const pages: PageData[] = data?.pages ?? [];
  const backendError = (data as any)?.error as string | undefined;
  const pagesWithIg = pages.filter((p) => p.instagram_business_account);
  const totalFbLikes = pages.reduce((sum, p) => sum + (p.fan_count ?? 0), 0);
  const totalIgFollowers = pagesWithIg.reduce(
    (sum, p) => sum + (p.instagram_business_account?.followers_count ?? 0),
    0
  );

  return (
    <MetaDashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <Share2 className="w-6 h-6 text-primary" />
              <h1
                className="text-2xl font-bold text-foreground"
                style={{ fontFamily: "'Montserrat', sans-serif" }}
              >
                Redes Sociais
              </h1>
              <Badge
                variant="outline"
                className="text-xs bg-primary/10 text-primary border-primary/30"
              >
                Business Suite
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1 ml-9">
              Metricas de performance das paginas e perfis — ultimos 28 dias
            </p>
          </div>
        </div>

        {/* KPI Summary Cards */}
        {!isLoading && pages.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-card rounded-xl border border-border p-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <Globe className="w-5 h-5 text-blue-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{pages.length}</p>
                  <p className="text-xs text-muted-foreground">Paginas Facebook</p>
                </div>
              </div>
            </div>
            <div className="bg-card rounded-xl border border-border p-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-pink-500/10 flex items-center justify-center">
                  <Instagram className="w-5 h-5 text-pink-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{pagesWithIg.length}</p>
                  <p className="text-xs text-muted-foreground">Perfis Instagram</p>
                </div>
              </div>
            </div>
            <div className="bg-card rounded-xl border border-border p-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <Users className="w-5 h-5 text-blue-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{fmt(totalFbLikes)}</p>
                  <p className="text-xs text-muted-foreground">Total Curtidas FB</p>
                </div>
              </div>
            </div>
            <div className="bg-card rounded-xl border border-border p-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-pink-500/10 flex items-center justify-center">
                  <Heart className="w-5 h-5 text-pink-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{fmt(totalIgFollowers)}</p>
                  <p className="text-xs text-muted-foreground">Total Seguidores IG</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-20">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
              <p className="text-sm text-muted-foreground">
                Carregando redes sociais do portfolio...
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

        {/* Pages Grid — with real metrics */}
        {!isLoading && pages.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {pages
              .sort((a, b) => (b.fan_count ?? 0) - (a.fan_count ?? 0))
              .map((page) => (
                <PageInsightsCard key={page.id} page={page} />
              ))}
          </div>
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
                "Verifique as paginas vinculadas ao portfolio empresarial SELVA Agency"}
            </p>
          </div>
        )}
      </div>
    </MetaDashboardLayout>
  );
}
