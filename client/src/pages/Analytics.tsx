import { useState } from "react";
import { MetaDashboardLayout } from "@/components/MetaDashboardLayout";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { canManageContent } from "@shared/permissions";
import { toast } from "sonner";
import { Link2, CheckCircle2, RefreshCw, BarChart3, AlertTriangle, Loader2 } from "lucide-react";

/**
 * Gestão do Google Analytics — admin/dev.
 *
 * Espelha a página do Google Ads de propósito: conectar por OAuth, descobrir
 * propriedades, vincular manualmente a um cliente. As duas integrações têm o
 * mesmo formato de problema, e resolver diferente só criaria duas coisas para
 * aprender.
 *
 * Nada é vinculado automaticamente — nem por nome parecido, nem por domínio.
 * Um palpite errado aqui mostraria dados de um cliente na tela de outro.
 */
/** "hoje 06:50" quando é do dia; senão "21/07 06:50". */
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

export default function Analytics() {
  const { user } = useAuth();
  const podeGerenciar = canManageContent(user?.role);

  const statusQ = trpc.ga4.statusConexao.useQuery();
  const cicloQ = trpc.ga4.ultimoCiclo.useQuery();
  const contasQ = trpc.ga4.contasParaGerenciar.useQuery(undefined, { enabled: podeGerenciar });
  const clientesQ = trpc.accounts.list.useQuery();
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
      utils.fontes.todas.invalidate();   // os chips mudam de cor na hora
    },
    onError: (e) => toast.error(e.message),
  });

  const vincular = trpc.ga4.vincularConta.useMutation({
    onSuccess: () => {
      utils.ga4.contasParaGerenciar.invalidate();
      utils.fontes.todas.invalidate();     // o chip do cliente acende na hora
      toast.success("Vínculo atualizado.");
    },
    onError: (e) => toast.error(e.message),
  });

  // Guarda no cliente é conveniência; quem recusa de verdade é o servidor.
  if (!podeGerenciar) {
    return (
      <MetaDashboardLayout title="Google Analytics">
      <div className="p-6">
        <div className="bg-card border border-border rounded-xl p-8 text-center">
          <BarChart3 className="w-8 h-8 mx-auto text-muted-foreground/40 mb-3" />
          <h2 className="text-sm font-bold text-foreground">Sem acesso a esta tela</h2>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
            A gestão do Google Analytics é de administradores e desenvolvedores. Os dados das
            propriedades já vinculadas aparecem normalmente na seção Site de cada cliente.
          </p>
        </div>
      </div>
      </MetaDashboardLayout>
    );
  }

  const st = statusQ.data;
  const contas = contasQ.data ?? [];
  const clientes = clientesQ.data ?? [];
  const nomeDoCliente = (id: number | null) =>
    id == null ? null : (clientes.find((c) => c.id === id)?.accountName ?? `Cliente #${id}`);

  return (
    <MetaDashboardLayout title="Google Analytics">
    <div className="p-6 flex flex-col gap-4 max-w-5xl">
      <div>
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <BarChart3 className="w-5 h-5" /> Google Analytics
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Conecte a agência, descubra as propriedades e vincule cada uma ao cliente certo.
        </p>
      </div>

      {st && !st.configured && (
        <div className="bg-amber-500/10 border border-amber-500/25 rounded-xl p-4">
          <p className="text-sm font-medium text-amber-700 dark:text-amber-400 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> Credenciais do Google ausentes
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Falta configurar: {st.faltando.join(", ")}. O Analytics usa o mesmo aplicativo OAuth do Google Ads.
          </p>
        </div>
      )}

      {/* Passo 1 — conectar */}
      {st && !st.oauthConectado ? (
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-bold text-foreground mb-1">1. Conectar o Google Analytics</h3>
          <p className="text-xs text-muted-foreground max-w-md mb-3">
            Autorize com a conta Google que enxerga as propriedades dos clientes. Pedimos apenas
            permissão de <strong>leitura</strong>. O acesso é salvo criptografado — não existe token
            para copiar nem colar.
          </p>
          {/* target="_top": o Google BLOQUEIA o consentimento dentro de iframe
              (proteção contra clickjacking → 403). Esta tela roda no iframe do
              Spaces, então o OAuth precisa navegar o top-level window. */}
          <a
            href="/api/google/auth?state=ga4"
            target="_top"
            className="inline-flex h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium items-center gap-1.5"
          >
            <Link2 className="w-4 h-4" /> Conectar Google Analytics
          </a>
        </div>
      ) : st ? (
        <div className="bg-card border border-border rounded-xl p-5 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
            <div>
              <h3 className="text-sm font-bold text-foreground">Google Analytics conectado</h3>
              <p className="text-xs text-muted-foreground">
                {st.conectadoComo ? <>como <strong>{st.conectadoComo}</strong></> : "autorização salva"}
                {" · "}{st.propriedades} propriedade(s), {st.vinculadas} vinculada(s)
              </p>
              {cicloQ.data && (
                <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                  Última sincronização automática: {formatarCiclo(cicloQ.data.em)} · {cicloQ.data.ok} com dados
                  {cicloQ.data.semDados > 0 ? `, ${cicloQ.data.semDados} sem tráfego` : ""}
                  {cicloQ.data.falhas > 0 ? `, ${cicloQ.data.falhas} falha(s)` : ""}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => descobrir.mutate()}
              disabled={descobrir.isPending}
              className="inline-flex h-9 px-4 rounded-lg border border-border text-sm font-medium items-center gap-1.5 disabled:opacity-60"
            >
              {descobrir.isPending
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Descobrindo…</>
                : <><RefreshCw className="w-4 h-4" /> Descobrir propriedades</>}
            </button>
            {/* Só faz sentido sincronizar o que está vinculado. */}
            <button
              onClick={() => sincronizar.mutate({})}
              disabled={sincronizar.isPending || st.vinculadas === 0}
              title={st.vinculadas === 0 ? "Vincule ao menos uma propriedade a um cliente." : undefined}
              className="inline-flex h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium items-center gap-1.5 disabled:opacity-60"
            >
              {sincronizar.isPending
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Sincronizando…</>
                : <><BarChart3 className="w-4 h-4" /> Sincronizar GA4 agora</>}
            </button>
          </div>
        </div>
      ) : null}

      {/* Passo 2 — vincular */}
      {contas.length > 0 && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-border">
            <h3 className="text-sm font-bold text-foreground">2. Vincular propriedade ao cliente</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              O vínculo é sempre manual. Redescobrir atualiza nome e URL, e preserva o que já foi
              vinculado.
            </p>
          </div>
          <table className="w-full text-sm">
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
                    <select
                      value={c.linkedAccountId ?? ""}
                      onChange={(e) => vincular.mutate({
                        id: c.id,
                        linkedAccountId: e.target.value === "" ? null : Number(e.target.value),
                      })}
                      className="text-xs bg-background border border-border rounded-lg px-2 py-1.5 min-w-[190px]"
                    >
                      <option value="">— sem vínculo —</option>
                      {clientes.map((cl) => (
                        <option key={cl.id} value={cl.id}>{cl.accountName ?? `Conta ${cl.id}`}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2.5">
                    {c.linkedAccountId
                      ? <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/12 text-emerald-700 dark:text-emerald-400">
                          vinculada a {nomeDoCliente(c.linkedAccountId)}
                        </span>
                      : <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">sem vínculo</span>}
                  </td>
                  <td className="px-5 py-2.5 text-xs">
                    {c.lastSyncStatus === "error"
                      ? <span className="text-amber-600 dark:text-amber-400" title={c.lastSyncError ?? undefined}>falhou</span>
                      : c.lastSyncAt
                        ? <span className="text-muted-foreground">{new Date(c.lastSyncAt).toLocaleString("pt-BR")}</span>
                        : <span className="text-muted-foreground/60">nunca</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {st?.oauthConectado && contas.length === 0 && (
        <p className="text-xs text-muted-foreground px-1">
          Nenhuma propriedade descoberta ainda. Clique em “Descobrir propriedades”.
        </p>
      )}
    </div>
    </MetaDashboardLayout>
  );
}
