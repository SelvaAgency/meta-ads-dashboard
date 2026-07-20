import { MetaDashboardLayout } from "@/components/MetaDashboardLayout";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { useSelectedAccount } from "@/hooks/useSelectedAccount";
import { getClientByMetaAccountId } from "@/config/clientConfig";
import {
  TrendingUp,
  DollarSign,
  MousePointerClick,
  Eye,
  Target,
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Link2,
  RefreshCw,
  Loader2,
  Search,
  ShoppingCart,
  Monitor,
  Video,
  Layers,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function formatNumber(value: number): string {
  if (value >= 1_000_000) return (value / 1_000_000).toFixed(1) + "M";
  if (value >= 1_000) return (value / 1_000).toFixed(1) + "K";
  return value.toLocaleString("pt-BR");
}

function formatPercent(value: number): string {
  return value.toFixed(2) + "%";
}

function channelIcon(type: string) {
  switch (type) {
    case "SEARCH": return <Search className="w-3.5 h-3.5" />;
    case "SHOPPING": return <ShoppingCart className="w-3.5 h-3.5" />;
    case "DISPLAY": return <Monitor className="w-3.5 h-3.5" />;
    case "VIDEO": return <Video className="w-3.5 h-3.5" />;
    case "PERFORMANCE_MAX": return <Layers className="w-3.5 h-3.5" />;
    default: return <Target className="w-3.5 h-3.5" />;
  }
}

function channelLabel(type: string) {
  const map: Record<string, string> = {
    SEARCH: "Pesquisa",
    SHOPPING: "Shopping",
    DISPLAY: "Display",
    VIDEO: "Vídeo",
    PERFORMANCE_MAX: "Performance Max",
    DISCOVERY: "Discovery",
    SMART: "Smart",
    LOCAL: "Local",
    DEMAND_GEN: "Demand Gen",
  };
  return map[type] ?? type;
}

// ─── KPI Card ───────────────────────────────────────────────────────────────

function KPICard({ label, value, icon: Icon, color }: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-4">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{label}</p>
        <p className="text-lg font-bold text-foreground">{value}</p>
      </div>
    </div>
  );
}

// ─── Period Selector ────────────────────────────────────────────────────────

const PERIODS = [
  { label: "7 dias", days: 7 },
  { label: "14 dias", days: 14 },
  { label: "30 dias", days: 30 },
  { label: "60 dias", days: 60 },
];

// ─── Not Configured State ───────────────────────────────────────────────────

function NotConfigured({ faltando }: { faltando?: string[] }) {
  // O refresh token NÃO entra mais aqui — é por conta, via OAuth. Só as
  // credenciais do app da agência são env, e mostramos exatamente qual falta.
  const envs = faltando && faltando.length > 0
    ? faltando
    : ["GOOGLE_ADS_DEVELOPER_TOKEN", "GOOGLE_ADS_CLIENT_ID", "GOOGLE_ADS_CLIENT_SECRET"];
  return (
    <MetaDashboardLayout title="Google Ads">
      <div className="flex flex-col items-center justify-center py-20 gap-6">
        <div className="w-16 h-16 rounded-2xl bg-yellow-500/10 flex items-center justify-center">
          <AlertCircle className="w-8 h-8 text-yellow-500" />
        </div>
        <div className="text-center max-w-md">
          <h2 className="text-xl font-bold text-foreground mb-2">Google Ads Não Configurado</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Falta{envs.length === 1 ? "" : "m"} a{envs.length === 1 ? "" : "s"} credencial{envs.length === 1 ? "" : "is"} do app no
            servidor (Railway). O refresh token NÃO precisa ser configurado à mão — ele é obtido por
            conta, via o botão "Conectar Google Ads", depois que isto estiver pronto.
            <code className="block mt-3 text-xs bg-muted/50 rounded-lg p-3 text-left font-mono">
              {envs.map((e) => <span key={e}>{e}<br /></span>)}
            </code>
          </p>
          <p className="text-xs text-muted-foreground mt-4">
            No Railway, uma variável pode existir <strong>vazia</strong> — confira se cada uma tem valor.
          </p>
        </div>
      </div>
    </MetaDashboardLayout>
  );
}

// ─── Passo 1: Conectar Google Ads via OAuth ──────────────────────────────────
// Abre o consentimento do Google; o callback salva o refresh token
// criptografado (ver googleOAuthCallback). Sensível → admin/developer.
// Enquanto não conecta, este é o ÚNICO passo mostrado — o cadastro de customer
// ID só aparece depois, para a ordem ficar óbvia.
function PassoConectar({ oauthConectado, contaConectada, onMudou }: {
  oauthConectado: boolean; contaConectada?: string | null; onMudou: () => void;
}) {
  const desconectar = trpc.googleAds.desconectarOAuth.useMutation({
    onSuccess: () => { toast.success("Google Ads desconectado."); onMudou(); },
    onError: (e) => toast.error(e.message),
  });

  const numero = (n: string, ativo: boolean) => (
    <span className="w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0"
      style={ativo ? { background: "#D4537E", color: "#fff" } : { background: "var(--muted)", color: "var(--muted-foreground)" }}>{n}</span>
  );

  if (!oauthConectado) {
    return (
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-start gap-3">
          {numero("1", true)}
          <div className="flex-1">
            <h3 className="text-sm font-bold text-foreground mb-1">Conectar Google Ads via OAuth</h3>
            <p className="text-xs text-muted-foreground max-w-md mb-3">
              Autorize com a conta do Google que administra o MCC. O acesso é salvo criptografado —
              você não precisa colar refresh token em lugar nenhum.
            </p>
            {/* target="_top": o Google BLOQUEIA o consentimento dentro de iframe
                (proteção contra clickjacking → 403). Esta tela roda no iframe do
                Spaces, então o OAuth precisa navegar o top-level window, fora do
                iframe. O iframe não tem sandbox, então _top funciona. */}
            <a
              href="/api/google/auth?state=googleads"
              target="_top"
              className="inline-flex h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium items-center gap-1.5"
            >
              <Link2 className="w-4 h-4" /> Conectar Google Ads
            </a>
          </div>
        </div>
        <div className="flex items-start gap-3 mt-3 opacity-40">
          {numero("2", false)}
          <p className="text-xs text-muted-foreground pt-0.5">Descobrir contas / adicionar Customer ID <span className="italic">(depois de conectar)</span></p>
        </div>
      </div>
    );
  }

  // Conectado: status com o email (ponto 7).
  return (
    <div className="bg-card border border-border rounded-xl p-5 flex items-center justify-between gap-4 flex-wrap">
      <div className="flex items-center gap-2.5">
        <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
        <div>
          <h3 className="text-sm font-bold text-foreground">Google Ads conectado</h3>
          <p className="text-xs text-muted-foreground">
            {contaConectada ? <>como <strong>{contaConectada}</strong></> : "autorização salva"} · descubra as contas abaixo
          </p>
        </div>
      </div>
      <button onClick={() => desconectar.mutate()} disabled={desconectar.isPending}
        className="h-9 px-3 rounded-lg border border-border text-xs text-muted-foreground hover:text-destructive flex-shrink-0">
        Desconectar
      </button>
    </div>
  );
}

// ─── Passo 2: Descobrir contas ───────────────────────────────────────────────
function PassoDescobrir({ onMudou }: { onMudou: () => void }) {
  const descobrir = trpc.googleAds.descobrirContas.useMutation({
    onSuccess: (r) => { toast.success(r.criadas > 0 ? `${r.criadas} conta(s) conectada(s).` : "Nenhuma conta nova encontrada."); onMudou(); },
    onError: (e) => toast.error(e.message),
  });
  return (
    <div className="bg-card border border-border rounded-xl p-5 flex items-center justify-between gap-4 flex-wrap">
      <div>
        <h3 className="text-sm font-bold text-foreground mb-1">Descobrir contas do MCC</h3>
        <p className="text-xs text-muted-foreground max-w-md">
          Busca automaticamente todas as contas sob o seu MCC e conecta cada uma. Ou adicione um
          Customer ID específico abaixo.
        </p>
      </div>
      <Button size="sm" className="h-9 gap-1.5 flex-shrink-0" onClick={() => descobrir.mutate()} disabled={descobrir.isPending}>
        {descobrir.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
        Descobrir contas
      </Button>
    </div>
  );
}

// ─── Connect Account Form ───────────────────────────────────────────────────

function ConnectAccountForm({ onSuccess }: { onSuccess: () => void }) {
  const [customerId, setCustomerId] = useState("");
  const [accountName, setAccountName] = useState("");
  const connectMutation = trpc.googleAds.connectAccount.useMutation({
    onSuccess: () => {
      setCustomerId("");
      setAccountName("");
      onSuccess();
    },
  });

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
        <Plus className="w-4 h-4 text-primary" />
        Conectar Conta Google Ads
      </h3>
      <div className="flex gap-3 items-end">
        <div className="flex-1">
          <label className="text-xs text-muted-foreground font-medium mb-1 block">Customer ID</label>
          <input
            type="text"
            placeholder="123-456-7890"
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground focus:border-primary focus:outline-none"
          />
        </div>
        <div className="flex-1">
          <label className="text-xs text-muted-foreground font-medium mb-1 block">Nome (opcional)</label>
          <input
            type="text"
            placeholder="Ex: ULTRAMALHAS"
            value={accountName}
            onChange={(e) => setAccountName(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground focus:border-primary focus:outline-none"
          />
        </div>
        <Button
          size="sm"
          className="h-9 gap-1.5"
          onClick={() => connectMutation.mutate({ customerId, accountName: accountName || undefined })}
          disabled={connectMutation.isPending || !customerId.trim()}
        >
          {connectMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          Conectar
        </Button>
      </div>
      {connectMutation.error && (
        <p className="text-xs text-destructive mt-2">{connectMutation.error.message}</p>
      )}
    </div>
  );
}

// ─── Campaign Row ───────────────────────────────────────────────────────────

function CampaignRow({ campaign, accountId, days }: {
  campaign: any;
  accountId: number;
  days: number;
}) {
  const [expanded, setExpanded] = useState(false);

  const { data: adGroups, isLoading: loadingAdGroups } = trpc.googleAds.adGroups.useQuery(
    { accountId, campaignId: campaign.id, days },
    { enabled: expanded }
  );

  return (
    <>
      <tr
        className="border-b border-border/50 hover:bg-muted/30 cursor-pointer transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            {expanded ? <ChevronDown className="w-3.5 h-3.5 text-primary" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground" title={campaign.advertisingChannelType}>
                {channelIcon(campaign.advertisingChannelType)}
              </span>
              <span className="text-sm font-medium text-foreground truncate max-w-[250px]" title={campaign.name}>
                {campaign.name}
              </span>
            </div>
          </div>
        </td>
        <td className="px-3 py-3">
          <Badge variant="outline" className="text-xs font-medium">
            {channelLabel(campaign.advertisingChannelType)}
          </Badge>
        </td>
        <td className="px-3 py-3 text-right text-sm font-mono">{formatCurrency(campaign.spend)}</td>
        <td className="px-3 py-3 text-right text-sm font-mono">{formatNumber(campaign.impressions)}</td>
        <td className="px-3 py-3 text-right text-sm font-mono">{formatNumber(campaign.clicks)}</td>
        <td className="px-3 py-3 text-right text-sm font-mono">{formatPercent(campaign.ctr)}</td>
        <td className="px-3 py-3 text-right text-sm font-mono">{formatCurrency(campaign.cpc)}</td>
        <td className="px-3 py-3 text-right text-sm font-mono">{campaign.conversions.toFixed(1)}</td>
        <td className="px-3 py-3 text-right text-sm font-mono">{formatCurrency(campaign.costPerConversion)}</td>
        <td className="px-3 py-3 text-right">
          <span className={`text-sm font-bold ${campaign.roas >= 3 ? "text-emerald-400" : campaign.roas >= 1 ? "text-yellow-400" : "text-red-400"}`}>
            {campaign.roas.toFixed(2)}x
          </span>
        </td>
      </tr>

      {/* Ad Groups expansion */}
      {expanded && (
        <tr>
          <td colSpan={10} className="p-0">
            <div className="bg-muted/20 border-l-2 border-primary/30 ml-6 py-2">
              {loadingAdGroups ? (
                <div className="flex items-center gap-2 px-6 py-3 text-xs text-muted-foreground">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Carregando grupos de anúncios...
                </div>
              ) : adGroups && adGroups.length > 0 ? (
                <table className="w-full">
                  <thead>
                    <tr className="text-xs text-muted-foreground uppercase tracking-wider">
                      <th className="px-6 py-1.5 text-left font-semibold">Grupo de Anúncios</th>
                      <th className="px-3 py-1.5 text-right font-semibold">Gasto</th>
                      <th className="px-3 py-1.5 text-right font-semibold">Impressões</th>
                      <th className="px-3 py-1.5 text-right font-semibold">Cliques</th>
                      <th className="px-3 py-1.5 text-right font-semibold">CTR</th>
                      <th className="px-3 py-1.5 text-right font-semibold">Conv.</th>
                      <th className="px-3 py-1.5 text-right font-semibold">ROAS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adGroups.map((ag: any) => (
                      <tr key={ag.id} className="border-t border-border/30 hover:bg-muted/20">
                        <td className="px-6 py-2 text-xs font-medium text-foreground/80 truncate max-w-[200px]">{ag.name}</td>
                        <td className="px-3 py-2 text-right text-xs font-mono">{formatCurrency(ag.spend)}</td>
                        <td className="px-3 py-2 text-right text-xs font-mono">{formatNumber(ag.impressions)}</td>
                        <td className="px-3 py-2 text-right text-xs font-mono">{formatNumber(ag.clicks)}</td>
                        <td className="px-3 py-2 text-right text-xs font-mono">{formatPercent(ag.ctr)}</td>
                        <td className="px-3 py-2 text-right text-xs font-mono">{ag.conversions.toFixed(1)}</td>
                        <td className="px-3 py-2 text-right">
                          <span className={`text-xs font-bold ${ag.roas >= 3 ? "text-emerald-400" : ag.roas >= 1 ? "text-yellow-400" : "text-red-400"}`}>
                            {ag.roas.toFixed(2)}x
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="px-6 py-3 text-xs text-muted-foreground">Nenhum grupo de anúncios ativo encontrado.</p>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Account Dashboard ──────────────────────────────────────────────────────

function AccountDashboard({ account, days }: { account: any; days: number }) {
  const utils = trpc.useUtils();

  const { data: summary, isLoading: loadingSummary } = trpc.googleAds.summary.useQuery(
    { accountId: account.id, days },
    { refetchInterval: 120000 }
  );

  const { data: campaigns, isLoading: loadingCampaigns } = trpc.googleAds.campaigns.useQuery(
    { accountId: account.id, days, activeOnly: true },
    { refetchInterval: 120000 }
  );

  const disconnectMutation = trpc.googleAds.disconnectAccount.useMutation({
    onSuccess: () => utils.googleAds.accounts.invalidate(),
  });

  return (
    <div className="space-y-6">
      {/* Account header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
            <TrendingUp className="w-4 h-4 text-blue-500" />
          </div>
          <div>
            <h2 className="text-base font-bold text-foreground">{account.accountName}</h2>
            <p className="text-xs text-muted-foreground">Customer ID: {account.customerId}</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive/80 gap-1.5 text-xs"
          onClick={() => {
            if (confirm("Desconectar esta conta Google Ads?")) {
              disconnectMutation.mutate({ id: account.id });
            }
          }}
        >
          <Trash2 className="w-3.5 h-3.5" />
          Desconectar
        </Button>
      </div>

      {/* KPI cards */}
      {loadingSummary ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-card border border-border rounded-xl p-4 animate-pulse h-20" />
          ))}
        </div>
      ) : summary ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KPICard label="Investimento" value={formatCurrency(summary.spend)} icon={DollarSign} color="bg-emerald-500/10 text-emerald-500" />
          <KPICard label="Cliques" value={formatNumber(summary.clicks)} icon={MousePointerClick} color="bg-blue-500/10 text-blue-500" />
          <KPICard label="Conversões" value={summary.conversions.toFixed(1)} icon={Target} color="bg-purple-500/10 text-purple-500" />
          <KPICard label="ROAS" value={summary.roas.toFixed(2) + "x"} icon={TrendingUp} color={`${summary.roas >= 3 ? "bg-emerald-500/10 text-emerald-500" : summary.roas >= 1 ? "bg-yellow-500/10 text-yellow-500" : "bg-red-500/10 text-red-500"}`} />
        </div>
      ) : null}

      {/* Campaigns table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-bold text-foreground">Campanhas Ativas</h3>
          {campaigns && (
            <span className="text-xs text-muted-foreground">{campaigns.length} campanha{campaigns.length !== 1 ? "s" : ""}</span>
          )}
        </div>

        {loadingCampaigns ? (
          <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Carregando campanhas...</span>
          </div>
        ) : campaigns && campaigns.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-xs text-muted-foreground uppercase tracking-wider bg-muted/30">
                  <th className="px-4 py-2.5 text-left font-semibold">Campanha</th>
                  <th className="px-3 py-2.5 text-left font-semibold">Tipo</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Gasto</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Impressões</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Cliques</th>
                  <th className="px-3 py-2.5 text-right font-semibold">CTR</th>
                  <th className="px-3 py-2.5 text-right font-semibold">CPC</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Conv.</th>
                  <th className="px-3 py-2.5 text-right font-semibold">CPA</th>
                  <th className="px-3 py-2.5 text-right font-semibold">ROAS</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((campaign: any) => (
                  <CampaignRow key={campaign.id} campaign={campaign} accountId={account.id} days={days} />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <AlertCircle className="w-6 h-6 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">Nenhuma campanha ativa encontrada.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function GoogleAds() {
  const [selectedDays, setSelectedDays] = useState(7);
  const utils = trpc.useUtils();
  const { selectedAccountId, accounts: metaAccounts } = useSelectedAccount();

  // Cliente ativo: selectedAccountId é o id do BANCO; getClientByMetaAccountId
  // espera o accountId string da Meta. Resolve pela lista de contas Meta antes
  // — era o bug id-vs-accountId (activeClient sempre undefined).
  const activeClient = (() => {
    if (!selectedAccountId) return null;
    const acc = metaAccounts?.find((a: any) => a.id === selectedAccountId);
    return acc ? getClientByMetaAccountId(acc.accountId) : null;
  })();

  const { data: configStatus, isLoading: checkingConfig } = trpc.googleAds.isConfigured.useQuery();
  const { data: accounts, isLoading: loadingAccounts } = trpc.googleAds.accounts.useQuery(
    undefined,
    { enabled: configStatus?.configured === true }
  );

  // Filter Google Ads accounts based on selected client
  // clientConfig may define googleAdsCustomerId in the future; for now show all accounts
  // but contextualize to the selected client
  const filteredAccounts = accounts;

  if (!selectedAccountId) {
    return (
      <MetaDashboardLayout title="Google Ads">
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="w-14 h-14 rounded-2xl bg-muted/50 flex items-center justify-center">
            <TrendingUp className="w-7 h-7 text-muted-foreground/50" />
          </div>
          <div className="text-center">
            <h2 className="text-base font-bold text-foreground mb-1">Selecione uma conta</h2>
            <p className="text-sm text-muted-foreground">
              Escolha um cliente na barra lateral para visualizar os dados do Google Ads.
            </p>
          </div>
        </div>
      </MetaDashboardLayout>
    );
  }

  if (checkingConfig) {
    return (
      <MetaDashboardLayout title="Google Ads">
        <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Verificando configuração...</span>
        </div>
      </MetaDashboardLayout>
    );
  }

  if (!configStatus?.configured) {
    return <NotConfigured faltando={configStatus?.faltando} />;
  }

  return (
    <MetaDashboardLayout title="Google Ads">
      <div className="space-y-6">
        {/* Header with period selector */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-blue-500" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground">Google Ads</h1>
              <p className="text-xs text-muted-foreground">
                {activeClient ? `Performance de campanhas Google — ${activeClient.name}` : "Performance de campanhas Google"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {PERIODS.map((p) => (
              <button
                key={p.days}
                onClick={() => setSelectedDays(p.days)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  selectedDays === p.days
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/50 text-muted-foreground hover:bg-muted"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Passo 1 — Conectar via OAuth (admin/dev). Enquanto não conecta, é o
            único passo; o resto aparece depois, para a ordem ficar clara. */}
        <PassoConectar
          oauthConectado={!!configStatus?.oauthConectado}
          contaConectada={configStatus?.contaConectada}
          onMudou={() => { utils.googleAds.isConfigured.invalidate(); utils.googleAds.accounts.invalidate(); }}
        />

        {/* Passo 2 — Descobrir contas / adicionar Customer ID (só após conectar) */}
        {configStatus?.oauthConectado && (
          <>
            <PassoDescobrir onMudou={() => utils.googleAds.accounts.invalidate()} />
            <ConnectAccountForm onSuccess={() => utils.googleAds.accounts.invalidate()} />
          </>
        )}

        {/* Connected accounts */}
        {loadingAccounts ? (
          <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Carregando contas...</span>
          </div>
        ) : filteredAccounts && filteredAccounts.length > 0 ? (
          filteredAccounts.map((account: any) => (
            <AccountDashboard key={account.id} account={account} days={selectedDays} />
          ))
        ) : (
          <div className="flex flex-col items-center justify-center py-12 gap-3 bg-card border border-border rounded-xl">
            <CheckCircle2 className="w-8 h-8 text-emerald-500/50" />
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">API configurada com sucesso</p>
              <p className="text-xs text-muted-foreground mt-1">
                {activeClient
                  ? `Nenhuma conta Google Ads conectada para ${activeClient.shortName}. Conecte acima para começar.`
                  : "Conecte uma conta Google Ads acima para começar."}
              </p>
            </div>
          </div>
        )}
      </div>
    </MetaDashboardLayout>
  );
}
