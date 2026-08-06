/**
 * Lojas — conexões de e-commerce por cliente (Woo/VNDA), extraído da página
 * /lojas para o hub de Conexões (Configurações). Admin/dev.
 *
 * Segurança preservada da tela original:
 *  · as chaves são coladas AQUI e vão direto ao backend — nunca passam por
 *    chat, log ou listagem;
 *  · o consumer_secret não volta NUNCA; a consumer_key volta mascarada;
 *  · na edição, campos de credencial vazios mantêm as chaves atuais;
 *  · o teste roda no backend — o navegador nunca vê a credencial.
 */
import { useState } from "react";
import { PLATAFORMAS_LOJA, plataformaPorId, temIntegracao, type PlataformaLoja } from "@shared/plataformasLoja";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { canManageContent } from "@shared/permissions";
import { toast } from "sonner";
import { Store, Plug, Pencil, Ban, Loader2, ShieldCheck, RefreshCw } from "lucide-react";

export function LojasVinculos() {
  const { user } = useAuth();
  const podeGerenciar = canManageContent(user?.role);

  const conexoesQ = trpc.ecommerce.list.useQuery(undefined, { enabled: podeGerenciar });
  const clientesQ = trpc.accounts.list.useQuery(undefined, { enabled: podeGerenciar });
  const utils = trpc.useUtils();
  const [form, setForm] = useState<null | {
    id?: number; accountId: string; platform: PlataformaLoja; storeUrl: string;
    /** Wix: siteId (não-segredo) + apiKey. Ver o bloco do formulário. */
    siteId: string; apiKey: string;
    consumerKey: string; consumerSecret: string;   // WooCommerce
    token: string; xShopHost: string;              // VNDA / Olist
  }>(null);
  const [testando, setTestando] = useState<number | null>(null);
  const [sincronizando, setSincronizando] = useState<number | null>(null);

  const aoMudar = () => { utils.ecommerce.list.invalidate(); utils.fontes.lojasERedes.invalidate(); };
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
  /**
   * O retorno do teste fica GUARDADO, não só num toast.
   *
   * A primeira versão mostrava o diagnóstico num toast que sumia em segundos —
   * e era justamente ele que descrevia o formato do pedido, a informação que
   * orienta como escrever o adaptador da plataforma. Perder isso obrigava a
   * testar de novo só para ler.
   */
  const [ultimoDiagnostico, setUltimoDiagnostico] = useState<null | { id: number; texto: string }>(null);

  const testar = trpc.ecommerce.testConnection.useMutation({
    onSuccess: (r, vars) => {
      r.ok ? toast.success(r.detalhe) : toast.error(r.erro);
      const texto = r.ok
        ? [r.detalhe, "formato" in r && r.formato ? `\n${r.formato}` : ""].join("")
        : [r.erro, "comoResolver" in r && r.comoResolver ? `\n${r.comoResolver}` : ""].join("");
      setUltimoDiagnostico({ id: vars.id, texto });
      aoMudar();
    },
    onError: (e) => toast.error(e.message),
    onSettled: () => setTestando(null),
  });
  const sincronizar = trpc.ecommerce.sync.useMutation({
    onSuccess: (r) => { r.ok ? toast.success(r.detalhe) : toast.error(r.erro); aoMudar(); },
    onError: (e) => toast.error(e.message),
    onSettled: () => setSincronizando(null),
  });

  if (!podeGerenciar) return null;

  const conexoes = conexoesQ.data ?? [];
  const clientes = clientesQ.data ?? [];
  const nomeDoCliente = (id: number) => clientes.find((c) => c.id === id)?.accountName ?? `Cliente #${id}`;
  const editando = form?.id != null;

  const salvar = () => {
    if (!form) return;
    if (editando) {
      // update é genérico: no VNDA, token→consumerSecret e X-Shop-Host→consumerKey.
      const secret = form.platform === "vnda" ? form.token : form.consumerSecret;
      const key = form.platform === "vnda" ? form.xShopHost : form.consumerKey;
      atualizar.mutate({
        id: form.id!,
        ...(form.storeUrl ? { storeUrl: form.storeUrl } : {}),
        ...(key ? { consumerKey: key } : {}),
        ...(secret ? { consumerSecret: secret } : {}),
      });
    } else if (form.platform === "wix") {
      // Credencial JÁ entra: é ela que o teste de conexão usa. Leitura de
      // pedidos é que ainda não existe — ver o bloco azul.
      criar.mutate({
        platform: "wix", accountId: Number(form.accountId), storeUrl: form.storeUrl,
        siteId: form.siteId.trim(), apiKey: form.apiKey.trim(),
      });
    } else if (form.platform === "shopify") {
      // Só onde a loja está. Sem credencial — ver o bloco azul.
      criar.mutate({
        platform: "shopify", accountId: Number(form.accountId), storeUrl: form.storeUrl,
      });
    } else if (form.platform === "vnda") {
      criar.mutate({
        platform: "vnda", accountId: Number(form.accountId), storeUrl: form.storeUrl,
        token: form.token, ...(form.xShopHost ? { xShopHost: form.xShopHost } : {}),
      });
    } else {
      criar.mutate({
        platform: "woocommerce", accountId: Number(form.accountId), storeUrl: form.storeUrl,
        consumerKey: form.consumerKey, consumerSecret: form.consumerSecret,
      });
    }
  };

  const FORM_VAZIO = { accountId: "", platform: "woocommerce" as PlataformaLoja, storeUrl: "", consumerKey: "", consumerSecret: "", token: "", xShopHost: "", siteId: "", apiKey: "" };
  // Um form é "preenchido o bastante" para salvar conforme a plataforma.
  const podeSalvar = !!form && (editando || (
    !!form.accountId && !!form.storeUrl && (
      // Plataforma sem adaptador não pede credencial: guardar uma chave que
      // nada usa seria segredo parado no banco, e passaria a impressão de que
      // a loja está conectada.
      // Wix pede credencial mesmo sem adaptador: o teste de conexão precisa dela.
      form.platform === "wix" ? (!!form.siteId && !!form.apiKey)
        : !temIntegracao(form.platform) ? true
          : form.platform === "vnda" ? !!form.token
            : (!!form.consumerKey && !!form.consumerSecret)
    )
  ));

  const inp = "w-full text-sm bg-background border border-border rounded-lg px-3 py-2";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2"><Store className="w-4 h-4" /> Lojas · e-commerce por cliente</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            As chaves são coladas aqui, salvas criptografadas, e nunca voltam.
          </p>
        </div>
        {!form && (
          <button onClick={() => setForm({ ...FORM_VAZIO })}
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
                {/* Do CATÁLOGO, não escrito à mão: era a quarta cópia da lista
                    de plataformas, e a que mais silenciosamente divergia. */}
                <select className={inp} value={form.platform}
                  onChange={(e) => setForm({ ...form, platform: e.target.value as PlataformaLoja })}>
                  {PLATAFORMAS_LOJA.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}{p.integrada ? "" : " — sem integração ainda"}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div>
            <label className="text-xs text-muted-foreground">URL/base da loja (https, endereço final — sem redirect)</label>
            <input className={inp} placeholder={form.platform === "vnda" ? "https://minhaloja.vnda.com.br" : "https://minhaloja.com.br"}
              value={form.storeUrl} onChange={(e) => setForm({ ...form, storeUrl: e.target.value })} />
          </div>

          {form.platform === "wix" ? (
            <>
              {/*
                O texto separa duas coisas que se confundem sozinhas: a
                credencial JÁ é testável, a leitura de pedidos ainda não existe.
                Sem essa distinção, um teste verde faria parecer que a loja está
                integrada — e o Panorama diria "sem vendas" para uma loja que
                vende.
              */}
              <div className="rounded-lg border border-sky-500/30 bg-sky-500/[0.06] px-3 py-2 flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-sky-600 mt-0.5 flex-shrink-0" />
                <div className="text-xs text-muted-foreground">
                  <p className="font-medium text-foreground">Wix — etapa de credencial</p>
                  <p className="mt-0.5">
                    Gere a chave na Wix em <strong>Settings → API Keys</strong>, com permissão de
                    leitura de <strong>Wix Stores / eCommerce (Orders)</strong>. Depois de salvar,
                    use <strong>Testar conexão</strong>.
                  </p>
                  <p className="mt-1">
                    Passar no teste <strong>não</strong> significa integração pronta: nenhum pedido é
                    importado, nenhum snapshot é gravado, e a loja não aparece em vendas. O resultado
                    do teste é o que define como o adaptador será escrito.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Site ID</label>
                  <input className={inp} autoComplete="off" placeholder="fa19d2c0-7e17-4bc7-a3a8-eeeaf7c509b1"
                    value={form.siteId} onChange={(e) => setForm({ ...form, siteId: e.target.value })} />
                  <p className="text-[10px] text-muted-foreground mt-1">Não é segredo — aparece no próprio site.</p>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">API Key {editando && "(cadastrada — cole nova para substituir)"}</label>
                  <input className={inp} type="password" autoComplete="off" placeholder={editando ? "••••••••" : "chave gerada na Wix"}
                    value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} />
                </div>
              </div>
            </>
          ) : !temIntegracao(form.platform) ? (
            /**
             * Registro sem coleta. O texto precisa ser explícito sobre o que
             * NÃO vai acontecer: alguém que cadastre a loja e depois veja
             * "sem vendas" no Panorama tem que saber que é isto, e não um
             * problema na loja.
             */
            <div className="rounded-lg border border-sky-500/30 bg-sky-500/[0.06] px-3 py-2 flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-sky-600 mt-0.5 flex-shrink-0" />
              <div className="text-xs text-muted-foreground">
                <p className="font-medium text-foreground">
                  {plataformaPorId(form.platform)?.label} ainda não tem integração de leitura.
                </p>
                <p className="mt-0.5">
                  {plataformaPorId(form.platform)?.ajuda} A loja fica registrada como
                  <strong> pendente</strong>: não entra no sync, não aparece como fonte de dados e
                  não conta vendas. Quando a integração existir, só faltará a credencial.
                </p>
              </div>
            </div>
          ) : form.platform === "vnda" ? (
            <>
              <div className="rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-3 py-2 flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-muted-foreground">
                  Gere um token de acesso à API no painel VNDA/Olist (Bearer). O X-Shop-Host é opcional —
                  quando vazio, derivamos do endereço da loja. {editando && "Deixe os campos vazios para manter as credenciais atuais."}
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Token de acesso {editando && "(cadastrado — cole novo para substituir)"}</label>
                  <input className={inp} type="password" autoComplete="off" placeholder={editando ? "••••••••" : "token da API"}
                    value={form.token} onChange={(e) => setForm({ ...form, token: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">X-Shop-Host (opcional)</label>
                  <input className={inp} autoComplete="off" placeholder="derivado da URL se vazio"
                    value={form.xShopHost} onChange={(e) => setForm({ ...form, xShopHost: e.target.value })} />
                </div>
              </div>
            </>
          ) : (
            <>
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
            </>
          )}

          <div className="flex items-center gap-2">
            <button onClick={salvar}
              disabled={criar.isPending || atualizar.isPending || !podeSalvar}
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
            Nenhuma loja conectada ainda. Clique em "Nova conexão".
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[820px]">
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
                    {/*
                      Label do CATÁLOGO. Era um ternário que devolvia
                      "WooCommerce" para tudo que não fosse VNDA — então a loja
                      Wix da Aiká aparecia como WooCommerce. O dado estava
                      certo; a tabela é que mentia, e mentia de um jeito que
                      parecia erro de cadastro.
                    */}
                    <td className="px-3 py-2.5 text-muted-foreground">
                      {plataformaPorId(c.platform)?.label ?? c.platform}
                    </td>
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
                        <button onClick={() => setForm({ id: c.id, accountId: String(c.accountId), platform: (c.platform as PlataformaLoja), storeUrl: c.storeUrl, consumerKey: "", consumerSecret: "", token: "", xShopHost: "", siteId: "", apiKey: "" })}
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
                {/*
                  Diagnóstico do último teste, em bloco selecionável.
                  `whitespace-pre-wrap` e fonte mono porque o conteúdo é uma
                  ÁRVORE de campos — quebrar a indentação torna ilegível
                  justamente o que interessa. E selecionável porque o destino
                  natural dele é ser copiado para quem vai escrever o adaptador.
                */}
                {ultimoDiagnostico && (
                  <tr>
                    <td colSpan={99} className="px-5 pb-3">
                      <div className="rounded-lg border border-border bg-muted/30 p-3">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <p className="text-[11px] font-semibold text-muted-foreground">
                            Diagnóstico do último teste — {nomeDoCliente(conexoes.find((c) => c.id === ultimoDiagnostico.id)?.accountId ?? 0)}
                          </p>
                          <button onClick={() => setUltimoDiagnostico(null)}
                            className="text-[11px] text-muted-foreground hover:text-foreground">fechar</button>
                        </div>
                        <pre className="text-[11px] font-mono whitespace-pre-wrap break-all select-all max-h-72 overflow-y-auto text-foreground">
{ultimoDiagnostico.texto}
                        </pre>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground/70">
        "Sincronizar" importa os pedidos dos últimos 30 dias da loja (receita, pedidos, ticket, produtos)
        e grava o retrato do dia. A importação é manual — rodar de novo no mesmo dia atualiza o mesmo
        retrato, sem duplicar.
      </p>
    </div>
  );
}
