/**
 * Redes sociais — cadastro de perfis (@handle) por cliente, extraído da página
 * /redes-sociais para o hub de Conexões (Configurações). Admin/dev.
 *
 * Importante: cadastrar o @ NÃO liga a coleta sozinho — a API do Instagram exige
 * conta Business/Creator e revisão do app pela Meta. Hoje isto só ORGANIZA o
 * vínculo do perfil; as métricas continuam vindo das páginas já conectadas ao
 * portfólio (mapa hardcoded em shared/pageMapping.ts).
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { canManageContent } from "@shared/permissions";
import { toast } from "sonner";
import { Instagram } from "lucide-react";

function CadastroDoCliente({ accountId }: { accountId: number }) {
  const { user } = useAuth();
  const podeEditar = canManageContent((user as { role?: string } | null)?.role);
  const utils = trpc.useUtils();
  const q = trpc.social.daConta.useQuery({ accountId });
  const [handle, setHandle] = useState("");
  const [provider, setProvider] = useState<"instagram" | "linkedin" | "youtube">("instagram");

  const salvar = trpc.social.salvar.useMutation({
    onSuccess: (r) => { utils.social.daConta.invalidate({ accountId }); utils.fontes.lojasERedes.invalidate(); setHandle(""); toast.success(`@${r.handle} cadastrado.`); },
    onError: (e) => toast.error(e.message),
  });
  const apagar = trpc.social.apagar.useMutation({
    onSuccess: () => { utils.social.daConta.invalidate({ accountId }); utils.fontes.lojasERedes.invalidate(); toast.success("Perfil removido."); },
  });

  const perfis = q.data ?? [];

  return (
    <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3">
      {perfis.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {perfis.map((p) => (
            <div key={p.id} className="flex items-center gap-2 text-xs rounded-md border border-border px-2.5 py-1.5">
              <span className="text-muted-foreground uppercase text-[10px] w-16 flex-shrink-0">{p.provider}</span>
              <a href={p.profileUrl ?? "#"} target="_blank" rel="noopener noreferrer" className="font-medium hover:underline">@{p.handle}</a>
              {!p.enabled && <span className="text-[10px] text-muted-foreground">(desativado)</span>}
              {podeEditar && (
                <button onClick={() => { if (confirm(`Remover @${p.handle}?`)) apagar.mutate({ id: p.id }); }}
                  className="ml-auto text-muted-foreground hover:text-destructive">remover</button>
              )}
            </div>
          ))}
        </div>
      )}

      {podeEditar && (
        <div className="flex items-end gap-2 flex-wrap">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-muted-foreground">Rede</label>
            <select value={provider} onChange={(e) => setProvider(e.target.value as typeof provider)}
              className="text-sm border border-border rounded-md px-2 py-1.5 bg-background h-9">
              <option value="instagram">Instagram</option>
              <option value="linkedin">LinkedIn</option>
              <option value="youtube">YouTube</option>
            </select>
          </div>
          <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
            <label className="text-[11px] text-muted-foreground">Perfil</label>
            <input value={handle} onChange={(e) => setHandle(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && handle.trim()) salvar.mutate({ accountId, provider, handle }); }}
              placeholder="@cliente ou o link do perfil"
              className="text-sm border border-border rounded-md px-3 py-2 bg-background h-9" />
          </div>
          <button onClick={() => handle.trim() && salvar.mutate({ accountId, provider, handle })}
            disabled={salvar.isPending || !handle.trim()}
            className="h-9 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-medium disabled:opacity-50">Adicionar</button>
        </div>
      )}

      {perfis.length === 0 && !podeEditar && (
        <p className="text-xs text-muted-foreground">Nenhum perfil cadastrado para este cliente.</p>
      )}

      <p className="text-[11px] text-muted-foreground">
        Cadastrar o perfil registra o vínculo, mas ainda não liga a coleta automática: a API do
        Instagram exige conta Business ou Creator e revisão do app pela Meta. As métricas continuam
        vindo das páginas já conectadas ao portfólio.
      </p>
    </div>
  );
}

export function RedesVinculos() {
  const { user } = useAuth();
  const podeGerenciar = canManageContent((user as { role?: string } | null)?.role);
  const clientesQ = trpc.accounts.list.useQuery(undefined, { enabled: podeGerenciar });
  const [accountId, setAccountId] = useState<string>("");

  if (!podeGerenciar) return null;
  const clientes = clientesQ.data ?? [];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Instagram className="w-4 h-4 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">Selecione o cliente para cadastrar os perfis (Instagram, LinkedIn, YouTube).</p>
      </div>

      <select value={accountId} onChange={(e) => setAccountId(e.target.value)}
        className="text-sm bg-background border border-border rounded-lg px-3 py-2 max-w-sm">
        <option value="">— selecione um cliente —</option>
        {clientes.map((c) => <option key={c.id} value={c.id}>{c.accountName ?? `Conta ${c.id}`}</option>)}
      </select>

      {accountId && <CadastroDoCliente key={accountId} accountId={Number(accountId)} />}
    </div>
  );
}
