/**
 * GA4 — descobrir propriedades, sincronizar e vincular a cada cliente. Extraído
 * da página /ga4 (Analytics.tsx) para o hub de Conexões. O OAuth da agência fica
 * nos plugs do hub; aqui é o passo por-cliente. Admin/dev + OAuth conectado.
 */
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { canManageContent } from "@shared/permissions";
import { toast } from "sonner";
import { RefreshCw, BarChart3, Loader2 } from "lucide-react";

function formatarCiclo(iso: string): string {
  const d = new Date(iso);
  const tz = "America/Sao_Paulo";
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
  const dia = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d);
  const hora = new Intl.DateTimeFormat("pt-BR", { timeZone: tz, hour: "2-digit", minute: "2-digit" }).format(d);
  if (dia === hoje) return `hoje ${hora}`;
  const dm = new Intl.DateTimeFormat("pt-BR", { timeZone: tz, day: "2-digit", month: "2-digit" }).format(d);
  return `${dm} ${hora}`;
}

export function GA4Vinculos() {
  const { user } = useAuth();
  const podeGerenciar = canManageContent(user?.role);

  const statusQ = trpc.ga4.statusConexao.useQuery(undefined, { enabled: podeGerenciar });
  const cicloQ = trpc.ga4.ultimoCiclo.useQuery(undefined, { enabled: podeGerenciar });
  const contasQ = trpc.ga4.contasParaGerenciar.useQuery(undefined, { enabled: podeGerenciar });
  const clientesQ = trpc.accounts.list.useQuery(undefined, { enabled: podeGerenciar });
  const utils = trpc.useUtils();

  const descobrir = trpc.ga4.descobrirPropriedades.useMutation({
    onSuccess: (r) => {
      toast.success(`${r.criadas} nova(s) · ${r.atualizadas} atualizada(s) de ${r.total} propriedade(s).`);
      utils.ga4.contasParaGerenciar.invalidate();
      utils.ga4.statusConexao.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const sincronizar = trpc.ga4.sincronizar.useMutation({
    onSuccess: (r) => {
      const partes = [`${r.ok} com dados`, `${r.semDados} sem dados`, `${r.falhas} falha(s)`];
      toast[r.falhas > 0 ? "warning" : "success"](`Sincronização: ${partes.join(" · ")}`);
      utils.ga4.contasParaGerenciar.invalidate();
      utils.fontes.todas.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const vincular = trpc.ga4.vincularConta.useMutation({
    onSuccess: () => {
      utils.ga4.contasParaGerenciar.invalidate();
      utils.fontes.todas.invalidate();
      toast.success("Vínculo atualizado.");
    },
    onError: (e) => toast.error(e.message),
  });

  const st = statusQ.data;
  if (!podeGerenciar || !st?.oauthConectado) return null;

  const contas = contasQ.data ?? [];
  const clientes = clientesQ.data ?? [];
  const nomeDoCliente = (id: number | null) => (id == null ? null : (clientes.find((c) => c.id === id)?.accountName ?? `Cliente #${id}`));

  return (
    <div className="flex flex-col gap-2">
      {/* Ações (descobrir / sincronizar) + status */}
      <div className="bg-card border border-border rounded-xl p-5 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-sm font-bold text-foreground">GA4 · propriedades</h3>
          <p className="text-xs text-muted-foreground">
            {st.propriedades} propriedade(s), {st.vinculadas} vinculada(s)
          </p>
          {cicloQ.data && (
            <p className="text-[11px] text-muted-foreground/70 mt-0.5">
              Última sincronização: {formatarCiclo(cicloQ.data.em)} · {cicloQ.data.ok} com dados
              {cicloQ.data.semDados > 0 ? `, ${cicloQ.data.semDados} sem tráfego` : ""}
              {cicloQ.data.falhas > 0 ? `, ${cicloQ.data.falhas} falha(s)` : ""}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => descobrir.mutate()} disabled={descobrir.isPending}
            className="inline-flex h-9 px-4 rounded-lg border border-border text-sm font-medium items-center gap-1.5 disabled:opacity-60">
            {descobrir.isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Descobrindo…</> : <><RefreshCw className="w-4 h-4" /> Descobrir propriedades</>}
          </button>
          <button onClick={() => sincronizar.mutate({})} disabled={sincronizar.isPending || st.vinculadas === 0}
            title={st.vinculadas === 0 ? "Vincule ao menos uma propriedade a um cliente." : undefined}
            className="inline-flex h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium items-center gap-1.5 disabled:opacity-60">
            {sincronizar.isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Sincronizando…</> : <><BarChart3 className="w-4 h-4" /> Sincronizar GA4 agora</>}
          </button>
        </div>
      </div>

      {/* Vincular propriedade → cliente */}
      {contas.length > 0 ? (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-border">
            <h3 className="text-sm font-bold text-foreground">Vincular propriedade ao cliente</h3>
            <p className="text-xs text-muted-foreground mt-0.5">O vínculo é sempre manual. Redescobrir atualiza nome e URL e preserva o que já foi vinculado.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground border-b border-border">
                  <th className="px-5 py-2 font-medium">Propriedade</th>
                  <th className="px-3 py-2 font-medium">ID</th>
                  <th className="px-3 py-2 font-medium">Cliente</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-5 py-2 font-medium">Última leitura</th>
                </tr>
              </thead>
              <tbody>
                {contas.map((c) => (
                  <tr key={c.id} className="border-b border-border/50 last:border-0">
                    <td className="px-5 py-2.5">
                      <p className="text-foreground">{c.propertyName ?? "Sem nome"}</p>
                      {c.websiteUrl && <p className="text-[11px] text-muted-foreground">{c.websiteUrl}</p>}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground font-mono">{c.propertyId}</td>
                    <td className="px-3 py-2.5">
                      <select value={c.linkedAccountId ?? ""}
                        onChange={(e) => vincular.mutate({ id: c.id, linkedAccountId: e.target.value === "" ? null : Number(e.target.value) })}
                        className="text-xs bg-background border border-border rounded-lg px-2 py-1.5 min-w-[190px]">
                        <option value="">— sem vínculo —</option>
                        {clientes.map((cl) => <option key={cl.id} value={cl.id}>{cl.accountName ?? `Conta ${cl.id}`}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2.5">
                      {c.linkedAccountId
                        ? <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/12 text-emerald-700 dark:text-emerald-400">vinculada a {nomeDoCliente(c.linkedAccountId)}</span>
                        : <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">sem vínculo</span>}
                    </td>
                    <td className="px-5 py-2.5 text-xs">
                      {c.lastSyncStatus === "error"
                        ? <span className="text-amber-600 dark:text-amber-400" title={c.lastSyncError ?? undefined}>falhou</span>
                        : c.lastSyncAt ? <span className="text-muted-foreground">{new Date(c.lastSyncAt).toLocaleString("pt-BR")}</span> : <span className="text-muted-foreground/60">nunca</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground px-1">Nenhuma propriedade descoberta ainda. Clique em "Descobrir propriedades".</p>
      )}
    </div>
  );
}
