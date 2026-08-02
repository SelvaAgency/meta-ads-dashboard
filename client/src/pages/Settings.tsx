import { MetaDashboardLayout } from "@/components/MetaDashboardLayout";
import { SemAcessoTracker } from "@/components/SemAcessoTracker";
import { useAuth } from "@/_core/hooks/useAuth";
import { canManageContent } from "@shared/permissions";
import { useSelectedAccount } from "@/hooks/useSelectedAccount";
import { trpc } from "@/lib/trpc";
import { useState, useEffect } from "react";
import { ContextoGeralPanel } from "@/components/ContextoGeralPanel";
import { ThresholdsPanel } from "@/components/ThresholdsPanel";
import { GoogleAdsVinculos } from "@/components/conexoes/GoogleAdsVinculos";
import { GA4Vinculos } from "@/components/conexoes/GA4Vinculos";
import { LojasVinculos } from "@/components/conexoes/LojasVinculos";
import { toast } from "sonner";
import {
  Settings2, Check, ChevronDown, ChevronUp, AlertCircle, CheckCircle2,
  CreditCard, Wallet, Key, ExternalLink, Link2, ChevronRight, Zap,
  Trash2, Loader2, SlidersHorizontal, RefreshCw, Brain, BookOpen, Save, Cable} from "lucide-react";

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
function AccountCard({ account }: { account: any }) {
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
        {/* Avatar */}
        <div className="w-10 h-10 rounded-full bg-muted border border-border flex-shrink-0 overflow-hidden flex items-center justify-center">
          {account.pictureUrl
            ? <img src={account.pictureUrl} alt={account.accountName ?? ""} className="w-full h-full object-cover" />
            : <span className="text-xs font-medium text-muted-foreground">{(account.accountName ?? "??").slice(0, 2).toUpperCase()}</span>
          }
        </div>

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

// Plugs de OAuth da agência (Google Ads e GA4). Descobrir/vincular por cliente
// segue nas páginas por ora — entra no hub numa próxima fatia.
function GooglePlugs() {
  const utils = trpc.useUtils();
  const gads = trpc.googleAds.isConfigured.useQuery(undefined, { staleTime: 60_000 });
  const ga4 = trpc.ga4.statusConexao.useQuery(undefined, { staleTime: 60_000 });
  const descGads = trpc.googleAds.desconectarOAuth.useMutation({ onSuccess: () => { toast.success("Google Ads desconectado"); utils.googleAds.isConfigured.invalidate(); }, onError: (e) => toast.error(e.message) });
  const descGa4 = trpc.ga4.desconectarOAuth.useMutation({ onSuccess: () => { toast.success("GA4 desconectado"); utils.ga4.statusConexao.invalidate(); }, onError: (e) => toast.error(e.message) });

  const Plug = ({ nome, conectado, como, state, onDesc, pending }: { nome: string; conectado: boolean; como?: string | null; state: string; onDesc: () => void; pending: boolean }) => (
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

  return (
    <div className="flex flex-col gap-2">
      <Plug nome="Google Ads" conectado={!!gads.data?.oauthConectado} como={gads.data?.contaConectada} state="googleads" onDesc={() => descGads.mutate()} pending={descGads.isPending} />
      <Plug nome="Google Analytics (GA4)" conectado={!!ga4.data?.oauthConectado} como={ga4.data?.conectadoComo} state="ga4" onDesc={() => descGa4.mutate()} pending={descGa4.isPending} />
      <p className="text-[10px] text-muted-foreground/70">Depois de conectar, descobrir e vincular as contas a cada cliente segue nas páginas Google Ads / GA4 por ora (vem pro hub em breve).</p>
    </div>
  );
}
function ConexoesPanel() {
  const { data: fontes } = trpc.fontes.todas.useQuery(undefined, { staleTime: 60_000 });
  const { data: extras } = trpc.fontes.lojasERedes.useQuery(undefined, { staleTime: 60_000 });
  const { data: accounts } = trpc.accounts.list.useQuery(undefined, { staleTime: 60_000 });
  const nome = (id: number) => (accounts as any)?.find((a: any) => a.id === id)?.accountName ?? String(id);
  const statusDe = (row: any, chave: string) => row.fontes.find((f: any) => f.chave === chave)?.status ?? "ausente";
  const extraMap = new Map((extras ?? []).map((e: any) => [e.accountId, e]));
  const extraStatus = (id: number, chave: "loja" | "redes") => (extraMap.get(id)?.[chave] ? "ok" : "ausente");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-2.5">Meta Ads · token da agência</p>
        <TokenSection />
      </div>

      <div>
        <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-2.5">Google · OAuth da agência (Ads + GA4)</p>
        <GooglePlugs />
      </div>

      {/* Google Ads · descobrir/vincular contas do MCC (só admin + OAuth conectado) */}
      <GoogleAdsVinculos />

      {/* GA4 · descobrir/sincronizar/vincular propriedades (só admin + OAuth conectado) */}
      <GA4Vinculos />

      {/* Lojas · conexões de e-commerce por cliente (Woo/VNDA) */}
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-2.5">Lojas · e-commerce</p>
        <LojasVinculos />
      </div>

      <div>
        <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-2.5">Fontes conectadas por cliente</p>
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
          ● verde = conectado · amarelo = atenção · vermelho = erro · cinza = não conectado. Conectar/vincular Google, GA4, Lojas, Clarity e Redes vai entrar aqui nas próximas fatias.
        </p>
      </div>
    </div>
  );
}

// ─── Notifications section ────────────────────────────────────────────────────
function NotificationsSection() {
  const utils = trpc.useUtils();
  const { data: saved, isLoading } = trpc.notifications.get.useQuery();
  const upsert = trpc.notifications.upsert.useMutation({
    onSuccess: () => { utils.notifications.get.invalidate(); toast.success("Configurações salvas"); },
    onError: () => toast.error("Erro ao salvar"),
  });

  const [local, setLocal] = useState<Record<string, any>>({});

  function val(key: string, fallback: any) {
    return local[key] !== undefined ? local[key] : ((saved as any)?.[key] ?? fallback);
  }
  function set(key: string, v: any) { setLocal(prev => ({ ...prev, [key]: v })); }

  function handleSave() { upsert.mutate(local as any); }

  if (isLoading) return <div className="text-sm text-muted-foreground">Carregando...</div>;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Email */}
      <div className="flex items-center justify-between gap-4 p-4 border-b border-border/50">
        <p className="text-xs text-muted-foreground font-medium">Email de destino</p>
        <input
          type="email"
          placeholder="seu@email.com"
          value={val("emailDestination", "")}
          onChange={e => set("emailDestination", e.target.value)}
          className="text-xs border border-border rounded-md px-2 py-1.5 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary w-56"
        />
      </div>

      {/* Alerts */}
      {[
        { key: "alertCpaEnabled",          label: "CPA acima do limite",       desc: "Dispara quando o CPA supera o threshold Ruim",               thresholdKey: "alertCpaThreshold",    thresholdLabel: "> R$",  defaultThreshold: "120" },
        { key: "alertRoasEnabled",         label: "ROAS abaixo do mínimo",     desc: "Dispara quando o ROAS cai abaixo do threshold Ruim",         thresholdKey: "alertRoasThreshold",   thresholdLabel: "< ",    defaultThreshold: "1.0" },
        { key: "alertTokenExpiredEnabled", label: "Token expirado",            desc: "Notifica quando uma conta precisa reconectar o token",       thresholdKey: null,                   thresholdLabel: null,    defaultThreshold: null  },
        { key: "alertBudgetEnabled",       label: "Orçamento quase esgotado",  desc: "Dispara quando o gasto diário atinge % do limite",           thresholdKey: "alertBudgetPercent",   thresholdLabel: "> ",    defaultThreshold: "85"  },
      ].map(({ key, label, desc, thresholdKey, thresholdLabel, defaultThreshold }) => (
        <div key={key} className="flex items-center gap-3 p-4 border-b border-border/50 last:border-b-0">
          {/* Toggle */}
          <button
            onClick={() => set(key, !val(key, key === "alertCpaEnabled" || key === "alertRoasEnabled" || key === "alertTokenExpiredEnabled"))}
            className={`relative w-8 h-4.5 rounded-full transition-colors flex-shrink-0 ${val(key, key !== "alertBudgetEnabled") ? "bg-primary" : "bg-muted-foreground/30"}`}
            style={{ height: "18px", width: "32px" }}
          >
            <span className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white transition-all ${val(key, key !== "alertBudgetEnabled") ? "left-[14px]" : "left-0.5"}`} />
          </button>

          <div className="flex-1">
            <p className="text-sm text-foreground">{label}</p>
            <p className="text-xs text-muted-foreground">{desc}</p>
          </div>

          {thresholdKey && thresholdLabel ? (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground flex-shrink-0">
              <span>{thresholdLabel}</span>
              <input
                type="number"
                step="0.01"
                value={val(thresholdKey, defaultThreshold)}
                onChange={e => set(thresholdKey, e.target.value)}
                className="w-16 text-xs border border-border rounded px-1.5 py-1 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary text-center"
              />
              {key === "alertBudgetEnabled" && <span>%</span>}
            </div>
          ) : (
            <span className="text-xs text-muted-foreground flex-shrink-0">sempre</span>
          )}
        </div>
      ))}

      {/* Save */}
      <div className="p-4 border-t border-border/50">
        <button
          onClick={handleSave}
          disabled={upsert.isPending || Object.keys(local).length === 0}
          className="text-xs px-3 py-1.5 rounded-md border border-border bg-card text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
        >
          {upsert.isPending ? "Salvando..." : "Salvar configurações"}
        </button>
      </div>
    </div>
  );
}

// ─── Agency bar ───────────────────────────────────────────────────────────────
function AgencyBar({ totalAccounts }: { totalAccounts: number }) {
  const [openPanel, setOpenPanel] = useState<"token" | "knowledge" | null>(null);
  const toggle = (p: "token" | "knowledge") => setOpenPanel(v => v === p ? null : p);

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
          <button
            onClick={() => toggle("knowledge")}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-colors"
            style={{
              background: openPanel === "knowledge" ? "rgba(232,91,168,0.1)" : "transparent",
              borderColor: openPanel === "knowledge" ? "rgba(232,91,168,0.4)" : "rgba(0,0,0,0.12)",
              color: openPanel === "knowledge" ? "#E85BA8" : "rgba(0,0,0,0.45)",
            }}
          >
            <Brain className="w-3 h-3" />
            Contexto da Agência
          </button>
        </div>
      </div>

      {/* Conexões panel */}
      {openPanel === "token" && (
        <div className="border-t border-border px-6 py-5">
          <ConexoesPanel />
        </div>
      )}

      {/* Knowledge panel */}
      {openPanel === "knowledge" && (
        <div className="border-t border-border px-6 py-5">
          <KnowledgeBaseSection />
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
// ─── Knowledge Base section ───────────────────────────────────────────────────
function KnowledgeBaseSection() {
  const { data: user } = trpc.auth.me.useQuery();
  const { data: agencyCtx, refetch } = trpc.context.getAgency.useQuery(undefined, { staleTime: 30_000 });

  const [benchmarks, setBenchmarks] = useState("");
  const [patterns, setPatterns] = useState("");
  const [knowledge, setKnowledge] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (agencyCtx) {
      setBenchmarks(agencyCtx.benchmarks ?? "");
      setPatterns(agencyCtx.patterns ?? "");
      setKnowledge(agencyCtx.institutionalKnowledge ?? "");
    }
  }, [agencyCtx]);

  const upsert = trpc.context.upsertAgency.useMutation({
    onSuccess: () => { toast.success("Base de conhecimento salva"); setSaving(false); refetch(); },
    onError: () => { toast.error("Erro ao salvar"); setSaving(false); },
  });

  function save() {
    setSaving(true);
    upsert.mutate({ benchmarks, patterns, institutionalKnowledge: knowledge });
  }

  const fieldStyle = {
    width: "100%", fontSize: 12, lineHeight: 1.6,
    padding: "10px 12px", borderRadius: 8,
    border: "1px solid rgba(0,0,0,0.12)",
    background: "white", resize: "vertical" as const,
    fontFamily: "inherit", outline: "none", color: "#111",
    minHeight: 100,
  };

  const labelStyle = {
    fontSize: 11, fontWeight: 600 as const,
    color: "rgba(0,0,0,0.45)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
    display: "block", marginBottom: 6,
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-5">
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground leading-relaxed">
          Estas informações são injetadas em <strong>todas as análises</strong> da IA — para todas as contas. Quanto mais preciso, melhor a qualidade das sugestões.
        </p>
        {agencyCtx?.updatedAt && (
          <p className="text-xs text-muted-foreground opacity-60">
            Última atualização: {new Date(agencyCtx.updatedAt).toLocaleDateString("pt-BR")}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4">
        <div>
          <label style={labelStyle}>Benchmarks do portfólio</label>
          <textarea
            value={benchmarks}
            onChange={e => setBenchmarks(e.target.value)}
            placeholder={"CPA médio e-commerce moda: R$180-220\nCTR saudável para MESSAGES: >0.8%\nFrequência máxima antes de degradar: 2.8 (contas de remarketing)\nROAS mínimo aceitável SALES: 2.5x"}
            style={fieldStyle}
            rows={5}
            onFocus={e => e.currentTarget.style.borderColor = "rgba(232,91,168,0.5)"}
            onBlur={e => e.currentTarget.style.borderColor = "rgba(0,0,0,0.12)"}
          />
        </div>
        <div>
          <label style={labelStyle}>Padrões identificados nas contas</label>
          <textarea
            value={patterns}
            onChange={e => setPatterns(e.target.value)}
            placeholder={"Contas de moda performam melhor com criativos estáticos de produto isolado\nAudiências lookalike 2% superam 5% em contas com menos de R$5k/mês\nCampanhas de MESSAGES com advantage+ tendem a saturar após 45 dias"}
            style={fieldStyle}
            rows={5}
            onFocus={e => e.currentTarget.style.borderColor = "rgba(232,91,168,0.5)"}
            onBlur={e => e.currentTarget.style.borderColor = "rgba(0,0,0,0.12)"}
          />
        </div>
        <div>
          <label style={labelStyle}>Conhecimento institucional</label>
          <textarea
            value={knowledge}
            onChange={e => setKnowledge(e.target.value)}
            placeholder={"SELVA é uma boutique de branding e performance digital em SP\nClientes são majoritariamente marcas de moda, lifestyle e serviços premium\nFilosofia: intervenção mínima — só mexer quando os dados comprovam necessidade"}
            style={fieldStyle}
            rows={4}
            onFocus={e => e.currentTarget.style.borderColor = "rgba(232,91,168,0.5)"}
            onBlur={e => e.currentTarget.style.borderColor = "rgba(0,0,0,0.12)"}
          />
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-lg text-white disabled:opacity-75"
          style={{ background: "#E85BA8", border: "none", cursor: saving ? "not-allowed" : "pointer" }}
        >
          <Save className="w-3.5 h-3.5" />
          {saving ? "Salvando..." : "Salvar base de conhecimento"}
        </button>
      </div>
    </div>
  );
}

export default function Settings() {
  const { user } = useAuth();
  const { accounts } = useSelectedAccount();
  const refreshPictures = trpc.accounts.refreshPictures.useMutation({
    onSuccess: (data) => toast.success(`Fotos atualizadas (${data.updated} conta(s))`),
    onError: () => toast.error("Erro ao atualizar fotos"),
  });

  // Configurações do Tracker é restrita a admin/dev (visibilidade + acesso).
  // Guard depois dos hooks para respeitar as regras de hooks.
  if (!canManageContent(user?.role)) {
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
            <div className="flex items-center gap-2">
              <button
                onClick={() => refreshPictures.mutate()}
                disabled={refreshPictures.isPending}
                className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshPictures.isPending ? "animate-spin" : ""}`} />
                Atualizar fotos
              </button>
            </div>
          </div>
          <div className="space-y-3">
            {(accounts ?? []).map((account: any) => (
              <AccountCard key={account.id} account={account} />
            ))}
          </div>

        </section>

        {/* Bloco "Limites de alerta de mídia" (NotificationsSection) removido —
            as notificações estão pausadas por ora. A seção e o componente
            continuam no código para quando religarmos. */}

      </div>
    </MetaDashboardLayout>
  );
}
