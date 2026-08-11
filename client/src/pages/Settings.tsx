import { MetaDashboardLayout } from "@/components/MetaDashboardLayout";
import { contasMarcadasPorPadrao, EXPLICACAO_STATUS, ROTULO_STATUS, type ContaClassificada, type StatusImportacao } from "@shared/importacaoContas";
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
import { GmailVinculos } from "@/components/conexoes/GmailVinculos";
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
/**
 * Nome do cliente, editável no lugar.
 *
 * Existe para a regra "importação não sobrescreve nome customizado" significar
 * alguma coisa: antes disto não havia como DEFINIR esse nome, e a proteção
 * guardava um valor que ninguém conseguia escolher — o nome vinha da Meta e
 * ficava.
 *
 * Edita ao clicar, salva no Enter ou ao sair do campo, cancela no Escape. Sem
 * botão de "editar": um lápis ao lado de cada nome numa lista de 18 clientes é
 * ruído permanente para uma ação rara.
 */
function NomeDoCliente({ id, nome, idMeta, podeEditar }: { id: number; nome: string | null; idMeta: string; podeEditar: boolean }) {
  const utils = trpc.useUtils();
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(nome ?? "");

  const renomear = trpc.accounts.renomear.useMutation({
    onSuccess: async () => {
      await utils.accounts.list.invalidate();
      toast.success("Nome atualizado.");
    },
    onError: (e) => { toast.error(e.message); setTexto(nome ?? ""); },
  });

  const salvar = () => {
    setEditando(false);
    const limpo = texto.trim();
    // Sem mudança não chama o servidor; vazio volta ao que era em vez de
    // apagar o nome do cliente por um Enter distraído.
    if (!limpo) return setTexto(nome ?? "");
    if (limpo !== (nome ?? "")) renomear.mutate({ accountId: id, nome: limpo });
  };

  return (
    <div className="flex-1 min-w-0">
      {editando ? (
        <input
          autoFocus
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onBlur={salvar}
          onKeyDown={(e) => {
            if (e.key === "Enter") salvar();
            if (e.key === "Escape") { setTexto(nome ?? ""); setEditando(false); }
          }}
          className="w-full text-sm font-semibold bg-background border border-primary/40 rounded px-1.5 py-0.5 focus:outline-none"
        />
      ) : (
        <p
          onClick={() => podeEditar && setEditando(true)}
          title={podeEditar ? "Clique para renomear" : undefined}
          className={`text-sm font-semibold text-foreground truncate ${podeEditar ? "cursor-text hover:underline decoration-dotted" : ""}`}
        >
          {nome}
        </p>
      )}
      <p className="text-xs text-muted-foreground truncate">{idMeta}</p>
    </div>
  );
}

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

        {/* Nome (editável) + ID */}
        <NomeDoCliente id={account.id} nome={account.accountName} idMeta={account.accountId} podeEditar={podeEditar} />

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
/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Importação de contas Meta — escolher, não despejar
 * ─────────────────────────────────────────────────────────────────────────────
 *  A versão anterior tinha um botão só: "Importar 18 conta(s)". Ele chamava um
 *  upsert que SOBRESCREVIA nome, moeda e fuso das contas já cadastradas e
 *  REATIVAVA cliente desativado de propósito. Quem tinha renomeado um cliente à
 *  mão perdia o nome, e não havia como saber antes de clicar.
 *
 *  Agora cada conta vem classificada pelo servidor e só as NOVAS nascem
 *  marcadas. Tudo que já existe nasce desmarcado e diz por quê.
 *
 *  ── A tela não é a trava ───────────────────────────────────────────────────
 *  Ela evita o erro; quem o IMPEDE é o servidor, que reclassifica no momento do
 *  clique e recusa sobrescrever. Isso importa porque esta lista pode vir de uma
 *  aba aberta há uma hora — entre o preview e o clique, o mundo mudou.
 * ─────────────────────────────────────────────────────────────────────────────
 */
const COR_STATUS: Record<StatusImportacao, string> = {
  nova: "text-emerald-600 border-emerald-500/30 bg-emerald-500/5",
  ja_existe: "text-muted-foreground border-border bg-muted/30",
  ja_existe_inativa: "text-amber-600 border-amber-500/30 bg-amber-500/5",
  nome_diferente: "text-amber-600 border-amber-500/30 bg-amber-500/5",
  possivel_duplicada: "text-amber-600 border-amber-500/30 bg-amber-500/5",
  corresponde_a_cliente: "text-sky-600 border-sky-500/40 bg-sky-500/5",
};

function TokenSection() {
  const [token, setToken] = useState("");
  const [step, setStep] = useState<"token" | "confirm">("token");
  const [contas, setContas] = useState<ContaClassificada[]>([]);
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const utils = trpc.useUtils();

  const preview = trpc.accounts.previewImportacao.useMutation({
    onSuccess: (data) => {
      setContas(data.contas);
      // Pré-seleção segura: só as novas. Vem do MESMO cálculo que o servidor usa.
      setMarcadas(new Set(contasMarcadasPorPadrao(data.contas)));
      setStep("confirm");
      const novas = data.contas.filter((c) => c.status === "nova").length;
      toast.success(`${data.contas.length} conta(s) no token · ${novas} nova(s).`);
    },
    onError: (err) => toast.error(err.message),
  });

  const importar = trpc.accounts.importarSelecionadas.useMutation({
    onSuccess: (r) => {
      utils.accounts.list.invalidate();
      setToken(""); setStep("token"); setContas([]); setMarcadas(new Set());
      /**
       * O resultado é relatado em vez de virar só "pronto": o servidor pode ter
       * preservado contas que a tela deixou passar, e um sucesso mudo faria
       * parecer que tudo entrou.
       */
      if (r.importadas.length) toast.success(`${r.importadas.length} conta(s) importada(s): ${r.importadas.slice(0, 3).join(", ")}${r.importadas.length > 3 ? "…" : ""}`);
      if (r.preservadas.length) toast.info(`${r.preservadas.length} conta(s) preservada(s), nada foi sobrescrito.`);
      if (!r.importadas.length && !r.preservadas.length) toast.info("Nada a importar.");
    },
    onError: (err) => toast.error(err.message),
  });

  /**
   * Diagnóstico comparativo de tokens.
   *
   * A pergunta que ele responde não é "o token é válido" — é "as contas que
   * falham usam o MESMO token das que funcionam?". Só a comparação separa
   * token expirado de token sem permissão naquela conta, e é por isso que a
   * impressão digital (hash curto) existe: compara sem revelar.
   */
  const [diag, setDiag] = useState<null | Array<{
    id: number; nome: string | null; accountId: string; ativa: boolean; semMidia: boolean;
    temToken: boolean; tamanho: number; impressao: string; atualizadaEm: string | Date | null;
    tokenVivo: boolean; alcancaEstaConta: boolean | null;
  }>>(null);

  const diagnostico = trpc.accounts.diagnosticoTokens.useMutation({
    onSuccess: (r) => { setDiag(r as never); toast.success(`${r.length} conta(s) analisada(s).`); },
    onError: (e) => toast.error(e.message),
  });

  const forceRenew = trpc.accounts.forceRenewToken.useMutation({
    onSuccess: () => { utils.accounts.list.invalidate(); toast.success("Token renovado para todas as contas."); },
    onError: (err) => toast.error(err.message),
  });

  const alternar = (id: string) => setMarcadas((s) => {
    const n = new Set(s);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });
  const novas = contas.filter((c) => c.status === "nova");

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

      {/* Resultado do diagnóstico — selecionável, sem token nenhum. */}
      {diag && (
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="flex items-center justify-between gap-2 mb-2">
            <p className="text-xs font-semibold">Diagnóstico de tokens</p>
            <button onClick={() => setDiag(null)} className="text-[11px] text-muted-foreground hover:text-foreground">fechar</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead className="text-muted-foreground">
                <tr className="text-left">
                  <th className="pr-3 pb-1">Cliente</th>
                  <th className="pr-3 pb-1">act_</th>
                  <th className="pr-3 pb-1">Token</th>
                  <th className="pr-3 pb-1">Impressão</th>
                  <th className="pr-3 pb-1">Vive?</th>
                  <th className="pr-3 pb-1">Alcança a conta?</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {diag.filter((c) => c.ativa).map((c) => (
                  <tr key={c.id} className="border-t border-border/60">
                    <td className="pr-3 py-1 font-sans">{c.nome ?? `#${c.id}`}{c.semMidia ? " (sem mídia)" : ""}</td>
                    <td className="pr-3 py-1">{c.accountId}</td>
                    <td className="pr-3 py-1">{c.temToken ? `${c.tamanho} car.` : "AUSENTE"}</td>
                    <td className="pr-3 py-1">{c.impressao}</td>
                    <td className={`pr-3 py-1 ${c.tokenVivo ? "text-emerald-600" : "text-destructive"}`}>
                      {c.temToken ? (c.tokenVivo ? "sim" : "não") : "—"}
                    </td>
                    <td className={`pr-3 py-1 ${c.alcancaEstaConta === false ? "text-destructive" : c.alcancaEstaConta ? "text-emerald-600" : "text-muted-foreground"}`}>
                      {c.alcancaEstaConta === null ? "—" : c.alcancaEstaConta ? "sim" : "NÃO"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-muted-foreground mt-2">
            A <strong>impressão</strong> é um hash curto: contas com a mesma impressão usam o mesmo token.
            Nenhum token é exibido. <strong>Vive</strong> = a Meta aceita o token;
            <strong> Alcança</strong> = esse token enxerga esta conta no portfólio.
          </p>
        </div>
      )}

      {step === "token" ? (
        <div className="space-y-2">
          <p className="text-xs font-medium text-foreground flex items-center gap-1.5">
            <Link2 className="w-3.5 h-3.5 text-primary" /> Inserir token
          </p>
          <div className="flex gap-2 flex-wrap">
            <input
              type="password"
              placeholder="EAAxxxxxxxxxxxxxxx..."
              value={token}
              onChange={e => setToken(e.target.value)}
              className="flex-1 min-w-[180px] text-xs font-mono border border-border rounded-md px-3 py-1.5 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <button
              onClick={() => preview.mutate({ accessToken: token })}
              disabled={!token || preview.isPending}
              className="text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              {preview.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ChevronRight className="w-3.5 h-3.5" />}
              Validar
            </button>
            <button
              onClick={() => diagnostico.mutate()}
              disabled={diagnostico.isPending}
              className="text-xs px-3 py-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 flex items-center gap-1.5"
              title="Compara os tokens de todas as contas, sem revelar nenhum"
            >
              {diagnostico.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Key className="w-3.5 h-3.5" />}
              Diagnóstico
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
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-xs font-medium text-foreground">
              {contas.length} conta(s) no token · {novas.length} nova(s)
            </p>
            <div className="flex gap-1.5 flex-wrap">
              <button onClick={() => setMarcadas(new Set(contas.map((c) => c.accountId)))}
                className="text-[11px] px-2 py-1 rounded border border-border text-muted-foreground hover:text-foreground">
                Selecionar todas
              </button>
              <button onClick={() => setMarcadas(new Set(novas.map((c) => c.accountId)))}
                className="text-[11px] px-2 py-1 rounded border border-border text-muted-foreground hover:text-foreground">
                Apenas novas
              </button>
              <button onClick={() => setMarcadas(new Set())}
                className="text-[11px] px-2 py-1 rounded border border-border text-muted-foreground hover:text-foreground">
                Desmarcar todas
              </button>
            </div>
          </div>

          <div className="space-y-1.5 max-h-72 overflow-y-auto">
            {contas.map((c) => (
              <label key={c.accountId}
                className={`flex items-start gap-2 text-xs p-2 rounded-lg border cursor-pointer ${COR_STATUS[c.status]}`}>
                <input type="checkbox" checked={marcadas.has(c.accountId)}
                  onChange={() => alternar(c.accountId)} className="accent-accent mt-0.5" />
                <span className="flex-1 min-w-0">
                  <span className="font-medium text-foreground break-words">{c.nome}</span>
                  <span className="block text-[10px] text-muted-foreground break-all">
                    {c.accountId}{c.currency ? ` · ${c.currency}` : ""}
                  </span>
                  {/* Nome atual quando difere: é o que se perderia ao importar. */}
                  {c.status === "nome_diferente" && c.nomeAtual && (
                    <span className="block text-[10px] text-muted-foreground">
                      No Tracker hoje: <strong>{c.nomeAtual}</strong>
                    </span>
                  )}
                  <span className="block text-[10px] mt-0.5">
                    {ROTULO_STATUS[c.status]} — {EXPLICACAO_STATUS[c.status]}
                  </span>
                </span>
              </label>
            ))}
          </div>

          <div className="flex gap-2 flex-wrap">
            <button onClick={() => { setStep("token"); setContas([]); setMarcadas(new Set()); }}
              className="flex-1 min-w-[100px] text-xs px-3 py-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground transition-colors">
              Voltar
            </button>
            <button
              onClick={() => importar.mutate({ accessToken: token, accountIds: Array.from(marcadas) })}
              disabled={importar.isPending || marcadas.size === 0}
              className="flex-1 min-w-[160px] text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              {importar.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
              Importar {marcadas.size} selecionada(s)
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Contas que já existem nunca são sobrescritas — nome, foto, Site, Monitoramento e
            preferências ficam como estão, mesmo se você marcá-las.
          </p>
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

      {/* Gmail é conexão de SAÍDA (envio), não de leitura de dados de cliente —
          por isso fica por último, separada das fontes. */}
      <SecaoConexao titulo="Gmail · envio" subtitulo="Conta remetente da agência para Jornalzinho e alertas">
        <GmailVinculos />
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
/**
 * Aviso de clientes duplicados, com a mescla à mão.
 *
 * Mora em Configurações → Contas, e não dentro da importação, porque a
 * duplicata pode ter nascido de qualquer caminho — inclusive de antes desta
 * tela existir, que é exatamente o caso da Aiká.
 *
 * Silencioso quando não há nada: um bloco fixo dizendo "nenhuma duplicata"
 * ensina a ignorar a área justo onde o aviso precisa ser notado.
 */
function AvisoDuplicatas() {
  const utils = trpc.useUtils();
  const q = trpc.accounts.duplicatas.useQuery();
  const mesclar = trpc.accounts.mesclar.useMutation({
    onSuccess: async (r) => {
      await Promise.all([utils.accounts.list.invalidate(), utils.accounts.duplicatas.invalidate()]);
      toast.success(`Conta ${r.accountIdMovido} conectada a "${r.nomeMantido}". "${r.nomeDescartado}" saiu da lista.`);
    },
    onError: (e) => toast.error(e.message),
  });

  const pares = q.data ?? [];
  if (pares.length === 0) return null;

  return (
    <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 space-y-3">
      <p className="text-xs font-semibold text-amber-600 flex items-center gap-1.5">
        <AlertCircle className="w-3.5 h-3.5" />
        {pares.length === 1 ? "Um cliente parece estar duplicado" : `${pares.length} clientes parecem estar duplicados`}
      </p>
      {pares.map((par) => (
        <div key={`${par.manter.id}-${par.descartar.id}`}
          className="rounded-lg border border-border bg-card p-3 flex items-start gap-3 flex-wrap">
          <div className="flex-1 min-w-[200px] text-xs">
            <p>
              <strong>{par.manter.nome}</strong> já existe com Site e Monitoramento configurados, e{" "}
              <strong>{par.descartar.nome}</strong> chegou pela importação da Meta.
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">
              Mesclar conecta a conta de mídia <code>{par.descartar.accountId}</code> a{" "}
              <strong>{par.manter.nome}</strong>. O nome, a foto, o Site, o Monitoramento e as
              preferências que já existem ficam como estão.
            </p>
          </div>
          <button
            onClick={() => mesclar.mutate({ manterId: par.manter.id, descartarId: par.descartar.id })}
            disabled={mesclar.isPending}
            className="text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-medium flex items-center gap-1.5 disabled:opacity-60 flex-shrink-0"
          >
            {mesclar.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
            Mesclar em {par.manter.nome}
          </button>
        </div>
      ))}
    </div>
  );
}

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
      <div className="max-w-3xl mx-auto p-6 max-md:p-0 space-y-8">

        {/* Agency bar */}
        <AgencyBar totalAccounts={accounts?.length ?? 0} />

        <AvisoDuplicatas />

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
