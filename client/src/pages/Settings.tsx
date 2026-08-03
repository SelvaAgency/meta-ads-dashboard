import { MetaDashboardLayout } from "@/components/MetaDashboardLayout";
import { SemAcessoTracker } from "@/components/SemAcessoTracker";
import { useAuth } from "@/_core/hooks/useAuth";
import { canManageContent } from "@shared/permissions";
import { useSelectedAccount } from "@/hooks/useSelectedAccount";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { ContextoGeralPanel } from "@/components/ContextoGeralPanel";
import { ThresholdsPanel } from "@/components/ThresholdsPanel";
import { GoogleAdsVinculos } from "@/components/conexoes/GoogleAdsVinculos";
import { GA4Vinculos } from "@/components/conexoes/GA4Vinculos";
import { LojasVinculos } from "@/components/conexoes/LojasVinculos";
import { DominioVinculos } from "@/components/conexoes/DominioVinculos";
import { FotoDoCliente } from "@/components/FotoDoCliente";
import { pediuConexoes } from "@/pages/hub/trackerRoutes";
import { RedesVinculos } from "@/components/conexoes/RedesVinculos";
import { toast } from "sonner";
import {
  Settings2, Check, ChevronDown, ChevronUp, AlertCircle, CheckCircle2,
  CreditCard, Wallet, Key, ExternalLink, Link2, ChevronRight, Zap,
  Trash2, Loader2, SlidersHorizontal, RefreshCw, Brain, Cable} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
type GoalType = "SALES"|"VALUE"|"LEADS"|"MESSAGES"|"TRAFFIC"|"ENGAGEMENT"|"AWARENESS"|"VIDEO"|"FOLLOWERS"|"APP";

const GOAL_OPTIONS = [
  { value: null,         label: "Automático (detectado pelo sistema)" },
  { value: "SALES",      label: "🛒 Vendas (SALES)" },
  { value: "VALUE",      label: "💰 Valor de Conversão (VALUE)" },
  { value: "LEADS",      label: "🎯 Leads (LEADS)" },
  { value: "MESSAGES",   label: "💬 Mensagens (MESSAGES)" },
  { value: "TRAFFIC",    label: "🖱️ Tráfego (TRAFFIC)" },
  { value: "ENGAGEMENT", label: "❤️ Engajamento (ENGAGEMENT)" },
  { value: "AWARENESS",  label: "👁️ Reconhecimento (AWARENESS)" },
  { value: "VIDEO",      label: "▶️ Visualizações de Vídeo (VIDEO)" },
  { value: "FOLLOWERS",  label: "👥 Seguidores (FOLLOWERS)" },
  { value: "APP",        label: "📱 Instalações de App (APP)" },
];

// Métricas relevantes por objetivo
// ─── Billing card ─────────────────────────────────────────────────────────────
function BillingInfo({ accountId }: { accountId: number }) {
  const { data: billing, isLoading } = trpc.accounts.billing.useQuery({ accountId });
  if (isLoading) return (
    <span className="text-xs text-muted-foreground flex items-center gap-1">
      <Loader2 className="w-3 h-3 animate-spin" /> Carregando...
    </span>
  );
  if (!billing) return null;
  const Icon = [2,15,20].includes(billing.fundingSourceType ?? -1) ? Wallet : CreditCard;
  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground">
      <span className="flex items-center gap-1">
        <Icon className="w-3.5 h-3.5" />
        {billing.fundingSourceDisplay ?? "—"}
      </span>
      {billing.isPrePaid && billing.remainingBalance !== null && (
        <span className={billing.remainingBalance < 50 ? "text-destructive font-medium" : billing.remainingBalance < 200 ? "text-yellow-500 font-medium" : "text-emerald-500"}>
          Saldo: {billing.currency} {billing.remainingBalance.toFixed(2)}
        </span>
      )}
      {!billing.isPrePaid && billing.spendCap && (
        <span>Limite: {billing.currency} {(parseFloat(billing.spendCap) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
      )}
    </div>
  );
}

// ─── Thresholds panel ─────────────────────────────────────────────────────────

// ─── Account card ─────────────────────────────────────────────────────────────
function AccountCard({ account, podeEditar }: { account: any; podeEditar: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const utils = trpc.useUtils();

  const updateGoalType = trpc.accounts.updateGoalType.useMutation({
    onSuccess: () => { utils.accounts.list.invalidate(); toast.success("Objetivo salvo"); },
    onError: () => toast.error("Erro ao salvar"),
  });

  const disconnect = trpc.accounts.disconnect.useMutation({
    onSuccess: () => { utils.accounts.list.invalidate(); toast.success("Conta desconectada"); },
  });

  const isExpired = account.hasTokenError;

  async function handleGoalChange(value: string | null) {
    setSaving(true);
    await updateGoalType.mutateAsync({ accountId: account.id, goalTypeOverride: value });
    setSaving(false);
  }

  return (
    <div className={`rounded-xl border bg-card transition-colors ${isExpired ? "border-destructive/40" : "border-border"}`}>
      {/* Main row */}
      <div className="flex items-center gap-3 p-4">
        {/* Avatar — clicar troca a foto do cliente (ver FotoDoCliente) */}
        <FotoDoCliente
          accountId={account.id}
          nome={account.accountName}
          pictureUrl={account.pictureUrl}
          temFotoPropria={!!account.pictureKey}
          podeEditar={podeEditar}
        />

        {/* Name + ID */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{account.accountName}</p>
          <p className="text-xs text-muted-foreground">{account.accountId}</p>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <select
            className="text-xs border border-border rounded-md px-2 py-1.5 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary max-w-[180px]"
            value={account.goalTypeOverride ?? ""}
            onChange={e => handleGoalChange(e.target.value === "" ? null : e.target.value)}
          >
            {GOAL_OPTIONS.map(opt => (
              <option key={opt.value ?? "auto"} value={opt.value ?? ""}>{opt.label}</option>
            ))}
          </select>

          {saving
            ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            : isExpired
              ? <AlertCircle className="w-4 h-4 text-destructive" />
              : account.goalTypeOverride
                ? <Check className="w-4 h-4 text-emerald-500" />
                : null
          }

          <button
            onClick={() => setContextOpen(v => !v)}
            className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-full border transition-colors"
            style={{
              background: contextOpen ? "rgba(232,91,168,0.1)" : "transparent",
              borderColor: contextOpen ? "rgba(232,91,168,0.4)" : undefined,
              color: contextOpen ? "#E85BA8" : undefined,
            }}
          >
            <Brain className="w-3 h-3" />
            Contexto
          </button>
          <button
            onClick={() => disconnect.mutate({ accountId: account.id })}
            disabled={disconnect.isPending}
            className="p-1.5 rounded-md text-muted-foreground hover:text-destructive transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Footer: billing + token status + sync */}
      <div className="px-4 pb-3 flex items-center justify-between gap-4 border-t border-border/40 pt-2">
        <BillingInfo accountId={account.id} />
        <div className="flex items-center gap-3 text-xs text-muted-foreground flex-shrink-0">
          {isExpired && (
            <span className="flex items-center gap-1 text-destructive font-medium">
              <AlertCircle className="w-3 h-3" /> Token expirado
            </span>
          )}
          {!isExpired && (
            <span className="flex items-center gap-1 text-emerald-500">
              <CheckCircle2 className="w-3 h-3" /> Ativa
            </span>
          )}
          {account.lastSyncAt && (
            <span>Sync: {new Date(account.lastSyncAt).toLocaleDateString("pt-BR")}</span>
          )}
        </div>
      </div>

      {/* Contexto Geral — tela única (inclui as Metas de performance/thresholds) */}
      {contextOpen && (
        <ContextoGeralPanel
          accountId={account.id}
          onClose={() => setContextOpen(false)}
          metasSlot={<ThresholdsPanel account={account} />}
        />
      )}
    </div>
  );
}

// ─── Token section (antigo Connect) ──────────────────────────────────────────
function TokenSection() {
  const [token, setToken] = useState("");
  const [step, setStep] = useState<"token" | "confirm">("token");
  const [previewAccounts, setPreviewAccounts] = useState<Array<{ id: string; name: string; currency: string }>>([]);
  const utils = trpc.useUtils();

  const validateTk = trpc.accounts.validateToken.useMutation({
    onSuccess: (data) => {
      setPreviewAccounts(data.adAccounts as any);
      setStep("confirm");
      toast.success(`Token válido! ${data.adAccounts.length} conta(s) encontrada(s).`);
    },
    onError: (err) => toast.error(err.message),
  });

  const connectAll = trpc.accounts.connectAll.useMutation({
    onSuccess: (data) => {
      utils.accounts.list.invalidate();
      setToken(""); setStep("token"); setPreviewAccounts([]);
      toast.success(`${data.connected} conta(s) conectada(s)!`);
    },
    onError: (err) => toast.error(err.message),
  });

  const forceRenew = trpc.accounts.forceRenewToken.useMutation({
    onSuccess: () => { utils.accounts.list.invalidate(); toast.success("Token renovado para todas as contas."); },
    onError: (err) => toast.error(err.message),
  });

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-4">
      {/* How to get token */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-primary flex items-center gap-1.5">
          <Key className="w-3.5 h-3.5" /> Como obter seu Token de Acesso
        </p>
        <div className="space-y-1.5 text-xs text-muted-foreground pl-5">
          <p>1. Acesse o <a href="https://developers.facebook.com/tools/explorer/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-0.5">Meta Graph API Explorer <ExternalLink className="w-3 h-3" /></a></p>
          <p>2. Gere token com: <code className="bg-muted px-1 rounded">ads_read</code>, <code className="bg-muted px-1 rounded">ads_management</code>, <code className="bg-muted px-1 rounded">business_management</code></p>
          <p>3. Para uso permanente, use um <strong>System User Token</strong> no Business Manager.</p>
        </div>
      </div>

      {/* Input */}
      {step === "token" ? (
        <div className="space-y-2">
          <p className="text-xs font-medium text-foreground flex items-center gap-1.5">
            <Link2 className="w-3.5 h-3.5 text-primary" /> Inserir token
          </p>
          <div className="flex gap-2">
            <input
              type="password"
              placeholder="EAAxxxxxxxxxxxxxxx..."
              value={token}
              onChange={e => setToken(e.target.value)}
              className="flex-1 text-xs font-mono border border-border rounded-md px-3 py-1.5 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <button
              onClick={() => validateTk.mutate({ accessToken: token })}
              disabled={!token || validateTk.isPending}
              className="text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              {validateTk.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ChevronRight className="w-3.5 h-3.5" />}
              Validar
            </button>
            <button
              onClick={() => forceRenew.mutate({ accessToken: token })}
              disabled={!token || forceRenew.isPending}
              className="text-xs px-3 py-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 flex items-center gap-1.5"
              title="Renovar token para todas as contas já conectadas"
            >
              {forceRenew.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Renovar token
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs font-medium text-foreground">{previewAccounts.length} conta(s) encontrada(s)</p>
          <div className="space-y-1.5 max-h-40 overflow-y-auto">
            {previewAccounts.map(acc => (
              <div key={acc.id} className="flex items-center gap-2 text-xs p-2 rounded-lg border border-primary/20 bg-primary/5">
                <CheckCircle2 className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                <span className="font-medium">{acc.name}</span>
                <span className="text-muted-foreground">{acc.id} · {acc.currency}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={() => { setStep("token"); setPreviewAccounts([]); }} className="flex-1 text-xs px-3 py-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground transition-colors">Voltar</button>
            <button
              onClick={() => connectAll.mutate({ accessToken: token })}
              disabled={connectAll.isPending}
              className="flex-1 text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              {connectAll.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
              Importar {previewAccounts.length} conta(s)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Conexões / Integrações (hub) ─────────────────────────────────────────────
//  Camada 1: Meta (token da agência). + Matriz de status por cliente (do
//  agregador fontes.todas). Google/GA4/Lojas/Clarity/Redes ganham ação de
//  conectar aqui nas próximas fatias.
const CONEXAO_COLS: { chave: string; label: string }[] = [
  { chave: "meta", label: "Meta Ads" },
  { chave: "google_ads", label: "Google Ads" },
  { chave: "ga4", label: "GA4" },
  { chave: "clarity", label: "Clarity" },
];
function tomFonte(s: string): string {
  return s === "ok" ? "#1D9E75" : s === "atencao" ? "#EF9F27" : s === "erro" ? "#E24B4A" : "rgba(120,120,120,0.35)";
}

// Seção colapsável do hub. Cada canal/plataforma vem FECHADO por padrão — a
// página tem muita opção, e abrir só o que interessa mantém a leitura enxuta.
function SecaoConexao({ titulo, subtitulo, children, defaultOpen = false }: { titulo: string; subtitulo?: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [aberto, setAberto] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <button onClick={() => setAberto((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors">
        <div>
          <p className="text-sm font-semibold text-foreground">{titulo}</p>
          {subtitulo && <p className="text-[11px] text-muted-foreground mt-0.5">{subtitulo}</p>}
        </div>
        <ChevronDown className={`w-4 h-4 text-muted-foreground flex-shrink-0 transition-transform ${aberto ? "rotate-180" : ""}`} />
      </button>
      {aberto && <div className="px-4 pb-4 pt-1 border-t border-border flex flex-col gap-3">{children}</div>}
    </div>
  );
}

// Linha de plug OAuth (conectar/desconectar). Compartilhada pelos plugs Google.
function PlugRow({ nome, conectado, como, state, onDesc, pending }: { nome: string; conectado: boolean; como?: string | null; state: string; onDesc: () => void; pending: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3 flex-wrap">
      <div className="flex items-center gap-2.5">
        {conectado ? <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" /> : <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: "rgba(120,120,120,0.4)" }} />}
        <div>
          <p className="text-sm font-semibold text-foreground">{nome}</p>
          <p className="text-[11px] text-muted-foreground">{conectado ? (como ? `conectado como ${como}` : "OAuth autorizado") : "não conectado"}</p>
        </div>
      </div>
      {conectado
        ? <button onClick={onDesc} disabled={pending} className="h-8 px-3 rounded-lg border border-border text-xs text-muted-foreground hover:text-destructive flex-shrink-0 disabled:opacity-50">Desconectar</button>
        : <a href={`/api/google/auth?state=${state}`} target="_top" className="inline-flex h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-medium items-center gap-1.5 flex-shrink-0"><Link2 className="w-3.5 h-3.5" /> Conectar</a>}
    </div>
  );
}

function GoogleAdsPlug() {
  const utils = trpc.useUtils();
  const gads = trpc.googleAds.isConfigured.useQuery(undefined, { staleTime: 60_000 });
  const desc = trpc.googleAds.desconectarOAuth.useMutation({ onSuccess: () => { toast.success("Google Ads desconectado"); utils.googleAds.isConfigured.invalidate(); }, onError: (e) => toast.error(e.message) });
  return <PlugRow nome="OAuth da agência" conectado={!!gads.data?.oauthConectado} como={gads.data?.contaConectada} state="googleads" onDesc={() => desc.mutate()} pending={desc.isPending} />;
}

function GA4Plug() {
  const utils = trpc.useUtils();
  const ga4 = trpc.ga4.statusConexao.useQuery(undefined, { staleTime: 60_000 });
  const desc = trpc.ga4.desconectarOAuth.useMutation({ onSuccess: () => { toast.success("GA4 desconectado"); utils.ga4.statusConexao.invalidate(); }, onError: (e) => toast.error(e.message) });
  return <PlugRow nome="OAuth da agência" conectado={!!ga4.data?.oauthConectado} como={ga4.data?.conectadoComo} state="ga4" onDesc={() => desc.mutate()} pending={desc.isPending} />;
}
function ConexoesPanel() {
  const { data: fontes } = trpc.fontes.todas.useQuery(undefined, { staleTime: 60_000 });
  const { data: extras } = trpc.fontes.lojasERedes.useQuery(undefined, { staleTime: 60_000 });
  const { data: accounts } = trpc.accounts.list.useQuery(undefined, { staleTime: 60_000 });
  const nome = (id: number) => (accounts as any)?.find((a: any) => a.id === id)?.accountName ?? String(id);
  const statusDe = (row: any, chave: string) => row.fontes.find((f: any) => f.chave === chave)?.status ?? "ausente";
  const extraMap = new Map((extras ?? []).map((e: any) => [e.accountId, e]));
  const extraStatus = (id: number, chave: "loja" | "redes") => (extraMap.get(id)?.[chave] ? "ok" : "ausente");

  const matriz = (
    <>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Cliente</th>
              {CONEXAO_COLS.map((c) => <th key={c.chave} className="px-3 py-2 text-center font-semibold text-muted-foreground whitespace-nowrap">{c.label}</th>)}
              <th className="px-3 py-2 text-center font-semibold text-muted-foreground whitespace-nowrap">Loja</th>
              <th className="px-3 py-2 text-center font-semibold text-muted-foreground whitespace-nowrap">Redes</th>
            </tr>
          </thead>
          <tbody>
            {(fontes ?? []).length === 0 && (
              <tr><td colSpan={CONEXAO_COLS.length + 3} className="px-3 py-4 text-center text-muted-foreground">Carregando…</td></tr>
            )}
            {(fontes ?? []).map((row: any) => (
              <tr key={row.accountId} className="border-b border-border/40 last:border-0">
                <td className="px-3 py-2 text-foreground font-medium truncate max-w-[220px]">{nome(row.accountId)}</td>
                {CONEXAO_COLS.map((c) => {
                  const s = statusDe(row, c.chave);
                  return (
                    <td key={c.chave} className="px-3 py-2 text-center">
                      <span title={s} className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: tomFonte(s) }} />
                    </td>
                  );
                })}
                {(["loja", "redes"] as const).map((k) => {
                  const s = extraStatus(row.accountId, k);
                  return (
                    <td key={k} className="px-3 py-2 text-center">
                      <span title={s} className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: tomFonte(s) }} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-muted-foreground/70 mt-2">
        ● verde = conectado · amarelo = atenção · vermelho = erro · cinza = não conectado.
      </p>
    </>
  );

  return (
    <div className="flex flex-col gap-2.5">
      <SecaoConexao titulo="Visão geral" subtitulo="Status de todas as fontes, por cliente">
        {matriz}
      </SecaoConexao>

      <SecaoConexao titulo="Meta Ads" subtitulo="Token da agência">
        <TokenSection />
      </SecaoConexao>

      <SecaoConexao titulo="Google Ads" subtitulo="OAuth da agência + contas do MCC por cliente">
        <GoogleAdsPlug />
        <GoogleAdsVinculos />
      </SecaoConexao>

      <SecaoConexao titulo="Google Analytics (GA4)" subtitulo="OAuth da agência + propriedades por cliente">
        <GA4Plug />
        <GA4Vinculos />
      </SecaoConexao>

      <SecaoConexao titulo="Lojas · e-commerce" subtitulo="WooCommerce e VNDA/Olist por cliente">
        <LojasVinculos />
      </SecaoConexao>

      {/* Era "Microsoft Clarity". O que se cadastra aqui é o DOMÍNIO — ele
          habilita as leituras técnicas do site (segurança, disponibilidade,
          carregamento/LiteSpeed) mesmo sem Clarity. O Clarity é uma das
          leituras que ele destrava, e continua funcionando igual. */}
      <SecaoConexao titulo="Domínio do site" subtitulo="Habilita leituras técnicas, Clarity e performance — por cliente">
        <DominioVinculos />
      </SecaoConexao>

      <SecaoConexao titulo="Redes sociais" subtitulo="Cadastro de perfis por cliente (coleta ainda não automática)">
        <RedesVinculos />
      </SecaoConexao>
    </div>
  );
}

// ─── Agency bar ───────────────────────────────────────────────────────────────
// `?painel=conexoes` abre o hub já expandido. É por aqui que chegam as rotas
// aposentadas (/google-ads, /ga4, /lojas) e o retorno do OAuth do Google — sem
// isto cairiam em Configurações com o painel fechado, ou seja, na tela certa
// sem sinal nenhum de que chegaram nela. Quem lê o parâmetro é o mesmo módulo
// que o escreve (trackerRoutes), para os dois lados não divergirem.
function AgencyBar({ totalAccounts }: { totalAccounts: number }) {
  const [openPanel, setOpenPanel] = useState<"token" | null>(
    typeof window !== "undefined" && pediuConexoes(window.location.search) ? "token" : null,
  );
  const toggle = (p: "token") => setOpenPanel(v => v === p ? null : p);

  return (
    <div className="rounded-xl border border-border bg-card/60 overflow-hidden">
      {/* Header */}
      <div className="p-4 flex items-center gap-4">
        <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
          <span className="text-primary-foreground font-bold text-sm">S</span>
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-foreground">SELVA AGENCY</p>
          <p className="text-xs text-muted-foreground">selva.agency · São Paulo, BR · BRL</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right mr-4">
            <p className="text-sm font-semibold text-foreground">{totalAccounts}</p>
            <p className="text-xs text-muted-foreground">contas ativas</p>
          </div>
          <button
            onClick={() => toggle("token")}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-colors"
            style={{
              background: openPanel === "token" ? "rgba(232,91,168,0.1)" : "transparent",
              borderColor: openPanel === "token" ? "rgba(232,91,168,0.4)" : "rgba(0,0,0,0.12)",
              color: openPanel === "token" ? "#E85BA8" : "rgba(0,0,0,0.45)",
            }}
          >
            <Cable className="w-3 h-3" />
            Conexões
          </button>
        </div>
      </div>

      {/* Conexões panel */}
      {openPanel === "token" && (
        <div className="border-t border-border px-6 py-5">
          <ConexoesPanel />
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function Settings() {
  const { user } = useAuth();
  const { accounts } = useSelectedAccount();
  const podeEditar = canManageContent(user?.role);

  // Configurações do Tracker é restrita a admin/dev (visibilidade + acesso).
  // Guard depois dos hooks para respeitar as regras de hooks.
  if (!podeEditar) {
    return (
      <SemAcessoTracker
        title="Configurações"
        message="As configurações do Brand Inteligent Tracker são restritas a administradores e desenvolvedores."
      />
    );
  }

  return (
    <MetaDashboardLayout>
      <div className="max-w-3xl mx-auto p-6 space-y-8">

        {/* Agency bar */}
        <AgencyBar totalAccounts={accounts?.length ?? 0} />

        {/* Contas */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Contas</h2>
            {/* O botão "Atualizar fotos" saiu daqui: ele repuxava as fotos da
                Meta e, na prática, não trazia nada. A foto agora é escolhida —
                clique no avatar do cliente. */}
            <p className="text-[11px] text-muted-foreground">Clique na foto do cliente para trocá-la</p>
          </div>
          <div className="space-y-3">
            {(accounts ?? []).map((account: any) => (
              <AccountCard key={account.id} account={account} podeEditar={podeEditar} />
            ))}
          </div>

        </section>

        {/* O config de alerta de mídia (CPA/ROAS/orçamento) foi removido: os
            toggles nunca estavam ligados à geração. O config real, atrelado aos
            thresholds Bom/Regular/Ruim, nasce na revisão de Alertas (Fase 1-2).
            Ver docs/modelo-alertas-recomendacoes.md. */}

      </div>
    </MetaDashboardLayout>
  );
}
