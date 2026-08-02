/**
 * Google Ads — descobrir contas do MCC e vincular a cada cliente. Extraído da
 * página /google-ads para o hub de Conexões (Configurações). O OAuth da agência
 * fica nos plugs do hub; aqui é o passo por-cliente. Admin/dev.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw } from "lucide-react";
import { useSelectedAccount } from "@/hooks/useSelectedAccount";

function fmtCustomerId(id: string): string {
  const n = (id ?? "").replace(/\D/g, "");
  return n.length === 10 ? `${n.slice(0, 3)}-${n.slice(3, 6)}-${n.slice(6)}` : id;
}

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
          Busca automaticamente todas as contas sob o seu MCC e conecta cada uma.
        </p>
      </div>
      <Button size="sm" className="h-9 gap-1.5 flex-shrink-0" onClick={() => descobrir.mutate()} disabled={descobrir.isPending}>
        {descobrir.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
        Descobrir contas
      </Button>
    </div>
  );
}

function TabelaVinculos({ contas, clientes, onMudou }: {
  contas: any[];
  clientes: any[];
  onMudou: () => void;
}) {
  const [mostrarIgnoradas, setMostrarIgnoradas] = useState(false);
  const vincular = trpc.googleAds.vincularConta.useMutation({
    onSuccess: () => { toast.success("Vínculo atualizado."); onMudou(); },
    onError: (e) => toast.error(e.message),
  });
  const ignorar = trpc.googleAds.ignorarConta.useMutation({
    onSuccess: () => onMudou(),
    onError: (e) => toast.error(e.message),
  });

  const visiveis = mostrarIgnoradas ? contas : contas.filter((c) => !c.ignored);
  const qtdIgnoradas = contas.filter((c) => c.ignored).length;
  const semVinculo = contas.filter((c) => !c.ignored && !c.linkedAccountId).length;

  if (contas.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="text-sm font-bold text-foreground mb-1">Vincular contas aos clientes</h3>
        <p className="text-xs text-muted-foreground">
          Nenhuma conta descoberta ainda. Use "Descobrir contas" acima.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <div>
          <h3 className="text-sm font-bold text-foreground">Vincular contas aos clientes</h3>
          <p className="text-xs text-muted-foreground">
            {contas.length} conta(s) no MCC · {semVinculo > 0 ? `${semVinculo} sem vínculo` : "todas vinculadas"}
            {qtdIgnoradas > 0 && ` · ${qtdIgnoradas} ignorada(s)`}
          </p>
        </div>
        {qtdIgnoradas > 0 && (
          <button onClick={() => setMostrarIgnoradas((v) => !v)}
            className="text-xs text-muted-foreground hover:text-foreground underline">
            {mostrarIgnoradas ? "Ocultar ignoradas" : `Mostrar ignoradas (${qtdIgnoradas})`}
          </button>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        {visiveis.map((c) => (
          <div key={c.id}
            className="flex items-center gap-3 rounded-lg border border-border px-3 py-2 flex-wrap"
            style={c.ignored ? { opacity: 0.5 } : undefined}>
            <div className="flex-1 min-w-[180px]">
              <p className="text-xs font-medium text-foreground">{c.accountName ?? fmtCustomerId(c.customerId)}</p>
              <p className="text-[11px] text-muted-foreground font-mono">{fmtCustomerId(c.customerId)}</p>
            </div>
            <span className="text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0"
              style={c.ignored
                ? { background: "rgba(0,0,0,0.06)", color: "var(--muted-foreground)" }
                : c.linkedAccountId
                  ? { background: "rgba(29,158,117,0.12)", color: "#1D9E75" }
                  : { background: "rgba(239,159,39,0.14)", color: "#BA7517" }}>
              {c.ignored ? "ignorada" : c.linkedAccountId ? "vinculada" : "sem vínculo"}
            </span>

            <select
              value={c.linkedAccountId ?? ""}
              onChange={(e) => vincular.mutate({ id: c.id, linkedAccountId: e.target.value ? Number(e.target.value) : null })}
              disabled={c.ignored}
              className="text-xs border border-border rounded-md px-2 py-1.5 bg-background min-w-[180px]"
            >
              <option value="">— sem vínculo —</option>
              {clientes.map((cl: any) => (
                <option key={cl.id} value={cl.id}>{cl.displayName ?? cl.accountName}</option>
              ))}
            </select>

            <button
              onClick={() => ignorar.mutate({ id: c.id, ignored: !c.ignored })}
              title={c.ignored ? "Voltar a considerar esta conta" : "Conta antiga/sem uso — ocultar da gestão"}
              className="text-[11px] text-muted-foreground hover:text-foreground px-2 py-1 rounded border border-border flex-shrink-0"
            >
              {c.ignored ? "Restaurar" : "Ignorar"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Passo por-cliente do Google Ads no hub. Só aparece com OAuth conectado + admin. */
export function GoogleAdsVinculos() {
  const utils = trpc.useUtils();
  const { accounts: metaAccounts } = useSelectedAccount();
  const cfg = trpc.googleAds.isConfigured.useQuery(undefined, { staleTime: 60_000 });
  const podeGerenciar = cfg.data?.podeGerenciar ?? false;
  const ativo = podeGerenciar && cfg.data?.configured === true && !!cfg.data?.oauthConectado;
  const { data: contasGestao } = trpc.googleAds.contasParaGerenciar.useQuery(undefined, { enabled: ativo });

  if (!ativo) return null;

  return (
    <div className="flex flex-col gap-2">
      <PassoDescobrir onMudou={() => utils.googleAds.contasParaGerenciar.invalidate()} />
      <TabelaVinculos
        contas={contasGestao ?? []}
        clientes={metaAccounts ?? []}
        onMudou={() => { utils.googleAds.contasParaGerenciar.invalidate(); utils.googleAds.contaDoCliente.invalidate(); }}
      />
    </div>
  );
}
