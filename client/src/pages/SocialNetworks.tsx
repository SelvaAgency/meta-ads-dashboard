import { MetaDashboardLayout } from "@/components/MetaDashboardLayout";
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
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return n.toString();
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
    profile_picture_url?: string;
    biography?: string;
  };
}

// ─── Page Card Component ────────────────────────────────────────────────────

function PageCard({ page }: { page: PageData }) {
  const ig = page.instagram_business_account;
  const pageUrl = `https://facebook.com/${page.id}`;
  const igUrl = ig ? `https://instagram.com/${ig.username}` : null;

  return (
    <div className="bg-card rounded-xl border border-border p-6 hover:shadow-lg transition-all">
      {/* Header */}
      <div className="flex items-start gap-4 mb-4">
        <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0 overflow-hidden">
          {page.picture?.data?.url ? (
            <img src={page.picture.data.url} alt={page.name} className="w-full h-full object-cover rounded-xl" />
          ) : (
            <Building2 className="w-7 h-7 text-primary" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-foreground truncate text-lg">{page.name}</h3>
          {page.category && (
            <p className="text-xs text-muted-foreground mt-0.5">{page.category}</p>
          )}
        </div>
      </div>

      {/* Facebook Stats */}
      <div className="bg-blue-500/5 rounded-lg p-4 mb-3 border border-blue-500/10">
        <div className="flex items-center gap-2 mb-3">
          <Facebook className="w-4 h-4 text-blue-600" />
          <span className="text-sm font-semibold text-blue-700">Facebook Page</span>
          <a href={pageUrl} target="_blank" rel="noopener noreferrer" className="ml-auto">
            <ExternalLink className="w-3.5 h-3.5 text-blue-500 hover:text-blue-700" />
          </a>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-blue-500" />
            <div>
              <p className="text-lg font-bold text-foreground">{formatNumber(page.fan_count ?? 0)}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Curtidas</p>
            </div>
          </div>
        </div>
      </div>

      {/* Instagram Stats */}
      {ig ? (
        <div className="bg-pink-500/5 rounded-lg p-4 border border-pink-500/10">
          <div className="flex items-center gap-2 mb-3">
            <Instagram className="w-4 h-4 text-pink-600" />
            <span className="text-sm font-semibold text-pink-700">@{ig.username}</span>
            {igUrl && (
              <a href={igUrl} target="_blank" rel="noopener noreferrer" className="ml-auto">
                <ExternalLink className="w-3.5 h-3.5 text-pink-500 hover:text-pink-700" />
              </a>
            )}
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Heart className="w-4 h-4 text-pink-500" />
              <div>
                <p className="text-lg font-bold text-foreground">{formatNumber(ig.followers_count)}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Seguidores</p>
              </div>
            </div>
          </div>
          {ig.biography && (
            <p className="text-xs text-muted-foreground mt-3 line-clamp-2 italic">"{ig.biography}"</p>
          )}
        </div>
      ) : (
        <div className="bg-muted/30 rounded-lg p-4 border border-border/50 flex items-center gap-2">
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
  const pagesWithIg = pages.filter(p => p.instagram_business_account);
  const totalFbLikes = pages.reduce((sum, p) => sum + (p.fan_count ?? 0), 0);
  const totalIgFollowers = pagesWithIg.reduce((sum, p) => sum + (p.instagram_business_account?.followers_count ?? 0), 0);

  return (
    <MetaDashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <Share2 className="w-6 h-6 text-primary" />
              <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                Redes Sociais
              </h1>
              <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/30">
                Portfolio SELVA Agency
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1 ml-9">
              Paginas e perfis conectados ao portfolio empresarial SELVA Agency
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
                  <p className="text-2xl font-bold text-foreground">{formatNumber(totalFbLikes)}</p>
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
                  <p className="text-2xl font-bold text-foreground">{formatNumber(totalIgFollowers)}</p>
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
              <p className="text-sm text-muted-foreground">Carregando redes sociais do portfolio...</p>
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

        {/* Pages Grid */}
        {!isLoading && pages.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {pages
              .sort((a, b) => (b.fan_count ?? 0) - (a.fan_count ?? 0))
              .map(page => (
                <PageCard key={page.id} page={page} />
              ))}
          </div>
        )}

        {/* Empty State */}
        {!isLoading && pages.length === 0 && !error && (
          <div className="bg-card rounded-xl border border-border p-12 text-center">
            <Share2 className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-40" />
            <p className="text-lg font-medium text-foreground">Nenhuma rede social encontrada</p>
            <p className="text-sm text-muted-foreground mt-1">
              Verifique as paginas vinculadas ao portfolio empresarial SELVA Agency
            </p>
          </div>
        )}
      </div>
    </MetaDashboardLayout>
  );
}
