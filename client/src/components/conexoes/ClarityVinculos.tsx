/**
 * Clarity — configuração por cliente (token, projectId, domínio, URLs, notas),
 * extraída do modal "Configurar" da página /site para o hub de Conexões
 * (Configurações). Admin/dev.
 *
 * Segurança preservada: o token é gravado criptografado e NUNCA volta pro
 * navegador (só `hasToken`); editar com o campo de token vazio mantém o atual.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { canManageContent } from "@shared/permissions";
import { toast } from "sonner";
import { Activity, Loader2, RefreshCw, ExternalLink } from "lucide-react";

function Campo({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] text-muted-foreground">{label}</label>
      {children}
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function FormCliente({ accountId }: { accountId: number }) {
  const utils = trpc.useUtils();
  const cfgQ = trpc.clarity.settings.useQuery({ accountId });
  const atual = cfgQ.data ?? null;

  const salvar = trpc.clarity.upsert.useMutation({
    onSuccess: () => { utils.clarity.settings.invalidate(); utils.fontes.todas.invalidate(); toast.success("Clarity configurado."); },
    onError: (e) => toast.error(e.message),
  });
  const sync = trpc.clarity.sync.useMutation({
    onSuccess: (r: any) => {
      utils.clarity.ultimo.invalidate(); utils.clarity.settings.invalidate(); utils.fontes.todas.invalidate();
      if (r.ok) toast.success(`Clarity sincronizado — ${r.sessions ?? 0} sessão(ões).`);
      else toast.error(r.mensagem);
    },
    onError: (e) => toast.error(e.message),
  });

  // Estado do form; prefill a partir da config atual assim que ela chega.
  const [enabled, setEnabled] = useState(false);
  const [projectId, setProjectId] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [domain, setDomain] = useState("");
  const [urls, setUrls] = useState("");
  const [notes, setNotes] = useState("");
  const [prefilledFor, setPrefilledFor] = useState<number | null>(null);

  // Reidrata quando muda o cliente OU quando a query resolve. Sem useEffect: o
  // render calcula e ajusta o estado uma vez por (accountId, dado carregado).
  if (atual && prefilledFor !== accountId) {
    setPrefilledFor(accountId);
    setEnabled(atual.enabled ?? false);
    setProjectId(atual.projectId ?? "");
    setApiToken("");
    setDomain(atual.domain ?? "");
    setUrls(((atual.importantUrlsJson as string[] | null) ?? []).join("\n"));
    setNotes(atual.notes ?? "");
  }

  if (cfgQ.isLoading) return <p className="text-xs text-muted-foreground px-1">Carregando configuração…</p>;

  const configurado = !!atual?.enabled && !!atual?.hasToken;
  const inp = "w-full text-sm border border-border rounded-md px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-primary";

  return (
    <div className="bg-card border border-border rounded-xl p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-muted-foreground">
          {configurado
            ? <>Clarity ativo{atual?.lastSyncStatus === "erro" ? " · última sincronização falhou" : ""}.</>
            : "Ainda não configurado para este cliente."}
        </p>
        <div className="flex items-center gap-2">
          {atual?.projectId && (
            <a href={`https://clarity.microsoft.com/projects/view/${atual.projectId}/dashboard`}
              target="_blank" rel="noopener noreferrer"
              className="h-8 px-3 rounded-lg border border-border text-xs flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
              Abrir no Clarity <ExternalLink className="w-3 h-3" />
            </a>
          )}
          {configurado && (
            <button onClick={() => sync.mutate({ accountId, dias: 1 })} disabled={sync.isPending}
              className="h-8 px-3 rounded-lg border border-border text-xs flex items-center gap-1.5 disabled:opacity-60">
              {sync.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Sincronizar
            </button>
          )}
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        Clarity habilitado para este cliente
      </label>

      <Campo label="Token da API" hint={atual?.hasToken ? "Já existe um token salvo. Preencha só para substituir." : "Clarity → Settings → Data Export → Generate new API token."}>
        <input type="password" value={apiToken} onChange={(e) => setApiToken(e.target.value)}
          placeholder={atual?.hasToken ? "•••••••• (mantém o atual)" : "Cole o token aqui"} className={inp} />
      </Campo>

      <Campo label="Project ID" hint="Só para o link do painel. A API não usa — quem identifica o projeto é o token.">
        <input value={projectId} onChange={(e) => setProjectId(e.target.value)} placeholder="ex.: 3t0wlogvdz" className={inp} />
      </Campo>

      <Campo label="Domínio principal">
        <input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="exemplo.com.br" className={inp} />
      </Campo>

      <Campo label="URLs importantes" hint="Uma por linha — as páginas que mais importam para este cliente.">
        <textarea value={urls} onChange={(e) => setUrls(e.target.value)} rows={3}
          placeholder={"https://exemplo.com.br/\nhttps://exemplo.com.br/orcamento"} className={`${inp} resize-y`} />
      </Campo>

      <Campo label="Observações de tracking">
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
          placeholder="Ex.: o pixel dispara só após aceitar cookies." className={`${inp} resize-y`} />
      </Campo>

      <p className="text-[11px] text-muted-foreground border-t border-border pt-3">
        O token é gravado criptografado e nunca volta para o navegador. A API do Clarity só entrega os
        últimos 3 dias e aceita 10 consultas por dia — por isso guardamos um retrato diário para formar o histórico.
      </p>

      <div>
        <button
          onClick={() => salvar.mutate({
            accountId, enabled,
            projectId: projectId.trim() || null,
            ...(apiToken ? { apiToken } : {}),
            domain: domain.trim() || null,
            importantUrls: urls.split("\n").map((u) => u.trim()).filter(Boolean),
            notes: notes.trim() || null,
          })}
          disabled={salvar.isPending}
          className="text-sm px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50">
          {salvar.isPending ? "Salvando…" : "Salvar"}
        </button>
      </div>
    </div>
  );
}

export function ClarityVinculos() {
  const { user } = useAuth();
  const podeGerenciar = canManageContent((user as { role?: string } | null)?.role);
  const clientesQ = trpc.accounts.list.useQuery(undefined, { enabled: podeGerenciar });
  const [accountId, setAccountId] = useState<string>("");

  if (!podeGerenciar) return null;
  const clientes = clientesQ.data ?? [];

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-bold text-foreground flex items-center gap-2"><Activity className="w-4 h-4" /> Microsoft Clarity · comportamento por cliente</h3>
        <p className="text-xs text-muted-foreground mt-0.5">Selecione o cliente para conectar ou ajustar o Clarity. Os dados aparecem na seção Site do cliente.</p>
      </div>

      <select value={accountId} onChange={(e) => setAccountId(e.target.value)}
        className="text-sm bg-background border border-border rounded-lg px-3 py-2 max-w-sm">
        <option value="">— selecione um cliente —</option>
        {clientes.map((c) => <option key={c.id} value={c.id}>{c.accountName ?? `Conta ${c.id}`}</option>)}
      </select>

      {accountId && <FormCliente key={accountId} accountId={Number(accountId)} />}
    </div>
  );
}
