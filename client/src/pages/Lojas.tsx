import { useState } from "react";
import { MetaDashboardLayout } from "@/components/MetaDashboardLayout";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { canManageContent } from "@shared/permissions";
import { toast } from "sonner";
import { Store, Plug, Pencil, Ban, Loader2, ShieldCheck, RefreshCw } from "lucide-react";

/**
 * Lojas — conexões de e-commerce por cliente (F5-B). Admin/dev.
 *
 * Tela GENÉRICA: qualquer cliente, plataforma selecionável (WooCommerce por
 * enquanto; Shopify/Nuvemshop/Wix entram aqui sem tela nova). Nenhuma loja é
 * fixa no código.
 *
 * Segurança que esta tela respeita:
 *  · as chaves são coladas AQUI e vão direto ao backend — nunca passam por
 *    chat, log ou listagem;
 *  · o consumer_secret não volta NUNCA; a consumer_key volta mascarada;
 *  · na edição, campos de credencial vazios mantêm as chaves atuais;
 *  · o teste roda no backend — o navegador nunca vê a credencial.
 */
export default function Lojas() {
  const { user } = useAuth();
  const podeGerenciar = canManageContent(user?.role);

  const conexoesQ = trpc.ecommerce.list.useQuery(undefined, { enabled: podeGerenciar });
  const clientesQ = trpc.accounts.list.useQuery(undefined, { enabled: podeGerenciar });
  const utils = trpc.useUtils();
  const [form, setForm] = useState<null | { id?: number; accountId: string; storeUrl: string; consumerKey: string; consumerSecret: string }>(null);
  const [testando, setTestando] = useState<number | null>(null);
  const [sincronizando, setSincronizando] = useState<number | null>(null);

  const aoMudar = () => utils.ecommerce.list.invalidate();
  const criar = trpc.ecommerce.create.useMutation({
    onSuccess: () => { toast.success("Conexão salva."); setForm(null); aoMudar(); },
    onError: (e) => toast.error(e.message),
  });
  const atualizar = trpc.ecommerce.update.useMutation({
    onSuccess: () => { toast.success("Conexão atualizada."); setForm(null); aoMudar(); },
    onError: (e) => toast.error(e.message),
  });
  const desativar = trpc.ecommerce.disable.useMutation({
    onSuccess: () => { toast.success("Conexão desativada."); aoMudar(); },
    onError: (e) => toast.error(e.message),
  });
  const testar = trpc.ecommerce.testConnection.useMutation({
    onSuccess: (r) => { r.ok ? toast.success(r.detalhe) : toast.error(r.erro); aoMudar(); },
    onError: (e) => toast.error(e.message),
    onSettled: () => setTestando(null),
  });
  const sincronizar = trpc.ecommerce.sync.useMutation({
    onSuccess: (r) => { r.ok ? toast.success(r.detalhe) : toast.error(r.erro); aoMudar(); },
    onError: (e) => toast.error(e.message),
    onSettled: () => setSincronizando(null),
  });

  // Guarda de conveniência; quem recusa de verdade é o servidor (contentProcedure).
  if (!podeGerenciar) {
    return (
      <MetaDashboardLayout title="Lojas">
      <div className="p-6">
        <div className="bg-card border border-border rounded-xl p-8 text-center">
          <Store className="w-8 h-8 mx-auto text-muted-foreground/40 mb-3" />
          <h2 className="text-sm font-bold text-foreground">Sem acesso a esta tela</h2>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
            A conexão de lojas é de administradores e desenvolvedores.
          </p>
        </div>
      </div>
      </MetaDashboardLayout>
    );
  }

  const conexoes = conexoesQ.data ?? [];
  const clientes = clientesQ.data ?? [];
  const nomeDoCliente = (id: number) => clientes.find((c) => c.id === id)?.accountName ?? `Cliente #${id}`;
  const editando = form?.id != null;

  const salvar = () => {
    if (!form) return;
    if (editando) {
      atualizar.mutate({
        id: form.id!,
        ...(form.storeUrl ? { storeUrl: form.storeUrl } : {}),
        ...(form.consumerKey ? { consumerKey: form.consumerKey } : {}),
        ...(form.consumerSecret ? { consumerSecret: form.consumerSecret } : {}),
      });
    } else {
      criar.mutate({
        accountId: Number(form.accountId), platform: "woocommerce",
        storeUrl: form.storeUrl, consumerKey: form.consumerKey, consumerSecret: form.consumerSecret,
      });
    }
  };

  const inp = "w-full text-sm bg-background border border-border rounded-lg px-3 py-2";

  return (
    <MetaDashboardLayout title="Lojas">
    <div className="p-6 flex flex-col gap-4 max-w-5xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Store className="w-5 h-5" /> Lojas
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Conexões de e-commerce por cliente. As chaves são coladas aqui, salvas criptografadas, e nunca voltam.
          </p>
        </div>
        {!form && (
          <button onClick={() => setForm({ accountId: "", storeUrl: "", consumerKey: "", consumerSecret: "" })}
            className="inline-flex h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium items-center gap-1.5">
            <Plug className="w-4 h-4" /> Nova conexão
          </button>
        )}
      </div>

      {form && (
        <div className="bg-card border border-border rounded-xl p-5 flex flex-col gap-3">
          <h3 className="text-sm font-bold text-foreground">{editando ? "Editar conexão" : "Nova conexão"}</h3>

          {!editando && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Cliente</label>
                <select value={form.accountId} onChange={(e) => setForm({ ...form, accountId: e.target.value })} className={inp}>
                  <option value="">— selecione —</option>
                  {clientes.map((c) => <option key={c.id} value={c.id}>{c.accountName ?? `Conta ${c.id}`}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Plataforma</label>
                <select className={inp} value="woocommerce" disabled>
                  <option value="woocommerce">WooCommerce</option>
                </select>
              </div>
            </div>
          )}

          <div>
            <label className="text-xs text-muted-foreground">URL da loja (https, endereço final — sem redirect)</label>
            <input className={inp} placeholder="https://minhaloja.com.br" value={form.storeUrl}
              onChange={(e) => setForm({ ...form, storeUrl: e.target.value })} />
          </div>

          <div className="rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-3 py-2 flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-muted-foreground">
              Gere a chave no WooCommerce com permissão <strong>Read/Leitura</strong> (WooCommerce →
              Configurações → Avançado → REST API). {editando && "Deixe os campos abaixo vazios para manter as chaves atuais."}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">consumer_key {editando && "(cadastrada — cole nova para substituir)"}</label>
              <input className={inp} type="password" autoComplete="off" placeholder={editando ? "••••••••" : "ck_…"}
                value={form.consumerKey} onChange={(e) => setForm({ ...form, consumerKey: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">consumer_secret {editando && "(cadastrado — cole novo para substituir)"}</label>
              <input className={inp} type="password" autoComplete="off" placeholder={editando ? "••••••••" : "cs_…"}
                value={form.consumerSecret} onChange={(e) => setForm({ ...form, consumerSecret: e.target.value })} />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={salvar}
              disabled={criar.isPending || atualizar.isPending || (!editando && (!form.accountId || !form.storeUrl || !form.consumerKey || !form.consumerSecret))}
              className="inline-flex h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium items-center gap-1.5 disabled:opacity-60">
              {(criar.isPending || atualizar.isPending) ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Salvar
            </button>
            <button onClick={() => setForm(null)} className="h-9 px-4 rounded-lg border border-border text-sm">Cancelar</button>
          </div>
        </div>
      )}

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {conexoes.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground text-center">
            Nenhuma loja conectada ainda. Clique em “Nova conexão”.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground border-b border-border">
                <th className="px-5 py-2 font-medium">Cliente</th>
                <th className="px-3 py-2 font-medium">Plataforma</th>
                <th className="px-3 py-2 font-medium">URL</th>
                <th className="px-3 py-2 font-medium">Chave</th>
                <th className="px-3 py-2 font-medium">Última verificação</th>
                <th className="px-3 py-2 font-medium">Última importação</th>
                <th className="px-5 py-2 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {conexoes.map((c) => (
                <tr key={c.id} className="border-b border-border/50 last:border-0">
                  <td className="px-5 py-2.5 text-foreground">{nomeDoCliente(c.accountId)}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">WooCommerce</td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground max-w-[220px] truncate" title={c.storeUrl}>{c.storeUrl}</td>
                  <td className="px-3 py-2.5 text-xs font-mono text-muted-foreground">{c.keyMascarada}</td>
                  <td className="px-3 py-2.5 text-xs">
                    {c.lastTestAt ? (
                      <span className={c.lastTestStatus === "ok" ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}
                        title={c.lastTestError ?? undefined}>
                        {c.lastTestStatus === "ok" ? "ok" : "falhou"} · {new Date(c.lastTestAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    ) : <span className="text-muted-foreground/60">nunca testada</span>}
                  </td>
                  <td className="px-3 py-2.5 text-xs">
                    {c.lastSyncAt ? (
                      // Falha de sync NÃO apaga o lastSyncAt: a data é a da última
                      // importação BEM-SUCEDIDA; o status/erro é da última tentativa.
                      <span className={c.lastSyncStatus === "ok" ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}
                        title={c.lastSyncError ?? undefined}>
                        {c.lastSyncStatus === "ok" ? "ok" : "falhou"} · {new Date(c.lastSyncAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    ) : c.lastSyncStatus === "erro" ? (
                      <span className="text-amber-600 dark:text-amber-400" title={c.lastSyncError ?? undefined}>falhou</span>
                    ) : <span className="text-muted-foreground/60">nunca importada</span>}
                  </td>
                  <td className="px-5 py-2.5">
                    <div className="flex items-center justify-end gap-1.5">
                      <button onClick={() => { setSincronizando(c.id); sincronizar.mutate({ id: c.id }); }}
                        disabled={sincronizando === c.id}
                        className="inline-flex h-7 px-2.5 rounded-md border border-border text-xs items-center gap-1 disabled:opacity-60">
                        {sincronizando === c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} Sincronizar
                      </button>
                      <button onClick={() => { setTestando(c.id); testar.mutate({ id: c.id }); }}
                        disabled={testando === c.id}
                        className="inline-flex h-7 px-2.5 rounded-md border border-border text-xs items-center gap-1 disabled:opacity-60">
                        {testando === c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plug className="w-3 h-3" />} Testar
                      </button>
                      <button onClick={() => setForm({ id: c.id, accountId: String(c.accountId), storeUrl: c.storeUrl, consumerKey: "", consumerSecret: "" })}
                        className="inline-flex h-7 px-2.5 rounded-md border border-border text-xs items-center gap-1">
                        <Pencil className="w-3 h-3" /> Editar
                      </button>
                      <button onClick={() => { if (confirm(`Desativar a conexão de ${nomeDoCliente(c.accountId)}?`)) desativar.mutate({ id: c.id }); }}
                        className="inline-flex h-7 px-2.5 rounded-md border border-border text-xs items-center gap-1 text-muted-foreground">
                        <Ban className="w-3 h-3" /> Desativar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground/70">
        “Sincronizar” importa os pedidos dos últimos 30 dias da loja (receita, pedidos, ticket, produtos)
        e grava o retrato do dia. A importação é manual — rodar de novo no mesmo dia atualiza o mesmo
        retrato, sem duplicar. Onde esses números aparecem no painel é a próxima etapa.
      </p>
    </div>
    </MetaDashboardLayout>
  );
}
