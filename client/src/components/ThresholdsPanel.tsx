import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { SlidersHorizontal } from "lucide-react";

/**
 * Thresholds (Metas de performance) por conta — extraído do Settings para ser
 * reutilizado como SEÇÃO dentro do Contexto Geral (o AI agora lê estes limiares).
 */
const THRESHOLD_FIELDS: Record<string, { key: string; label: string; unit: string; higherIsBetter: boolean }[]> = {
  SALES:  [
    { key: "roas", label: "ROAS",  unit: "x",   higherIsBetter: true  },
    { key: "cpa",  label: "CPA",   unit: "R$",  higherIsBetter: false },
    { key: "ctr",  label: "CTR",   unit: "%",   higherIsBetter: true  },
  ],
  VALUE:  [
    { key: "roas", label: "ROAS",  unit: "x",   higherIsBetter: true  },
    { key: "cpa",  label: "CPA",   unit: "R$",  higherIsBetter: false },
    { key: "ctr",  label: "CTR",   unit: "%",   higherIsBetter: true  },
  ],
  LEADS:  [
    { key: "cpl",  label: "CPL",   unit: "R$",  higherIsBetter: false },
    { key: "ctr",  label: "CTR",   unit: "%",   higherIsBetter: true  },
    { key: "cpm",  label: "CPM",   unit: "R$",  higherIsBetter: false },
  ],
  MESSAGES: [
    { key: "cpa",  label: "Custo/msg", unit: "R$", higherIsBetter: false },
    { key: "ctr",  label: "CTR",       unit: "%",  higherIsBetter: true  },
    { key: "cpm",  label: "CPM",       unit: "R$", higherIsBetter: false },
  ],
  TRAFFIC: [
    { key: "ctr",  label: "CTR",   unit: "%",   higherIsBetter: true  },
    { key: "cpa",  label: "CPC",   unit: "R$",  higherIsBetter: false },
    { key: "cpm",  label: "CPM",   unit: "R$",  higherIsBetter: false },
  ],
  DEFAULT: [
    { key: "ctr",  label: "CTR",   unit: "%",   higherIsBetter: true  },
    { key: "cpm",  label: "CPM",   unit: "R$",  higherIsBetter: false },
  ],
};

function getThresholdFields(goalType: string | null) {
  if (!goalType) return THRESHOLD_FIELDS.DEFAULT;
  return THRESHOLD_FIELDS[goalType] ?? THRESHOLD_FIELDS.DEFAULT;
}


export function ThresholdsPanel({ account }: { account: any }) {
  const goalType = account.goalTypeOverride ?? null;
  const fields = getThresholdFields(goalType);
  const utils = trpc.useUtils();

  const { data: saved } = trpc.accounts.getThresholds.useQuery({ accountId: account.id });
  const { data: billing } = trpc.accounts.billing.useQuery({ accountId: account.id });
  const upsert = trpc.accounts.upsertThresholds.useMutation({
    onSuccess: () => {
      utils.accounts.getThresholds.invalidate({ accountId: account.id });
      toast.success("Thresholds salvos");
    },
    onError: () => toast.error("Erro ao salvar thresholds"),
  });

  const keyMap: Record<string, { good: string; regular: string }> = {
    roas: { good: "roasGood",    regular: "roasRegular"    },
    cpa:  { good: "cpaGood",     regular: "cpaRegular"     },
    ctr:  { good: "ctrGood",     regular: "ctrRegular"     },
    cpl:  { good: "cplGood",     regular: "cplRegular"     },
    cpm:  { good: "cpmGood",     regular: "cpmRegular"     },
  };

  const [vals, setVals] = useState<Record<string, string>>({});

  function getVal(key: string, level: "good" | "regular"): string {
    const dbKey = keyMap[key]?.[level];
    if (!dbKey) return "";
    if (vals[dbKey] !== undefined) return vals[dbKey];
    return (saved as any)?.[dbKey] ?? "";
  }

  function setVal(key: string, level: "good" | "regular", v: string) {
    const dbKey = keyMap[key]?.[level];
    if (!dbKey) return;
    setVals(prev => ({ ...prev, [dbKey]: v }));
  }

  function getBalanceVal(): string {
    if (vals["lowBalanceThreshold"] !== undefined) return vals["lowBalanceThreshold"];
    return (saved as any)?.lowBalanceThreshold ?? "200.00";
  }

  function setBalanceVal(v: string) {
    setVals(prev => ({ ...prev, lowBalanceThreshold: v }));
  }

  function handleSave() {
    const payload: any = { accountId: account.id };
    for (const [k, v] of Object.entries(vals)) {
      payload[k] = v === "" ? null : v;
    }
    upsert.mutate(payload);
  }

  return (
    <div className="border-t border-border/50 pt-3 mt-1">
      <p className="text-xs text-muted-foreground mb-3 flex items-center gap-1.5">
        <SlidersHorizontal className="w-3.5 h-3.5" />
        Thresholds de performance
        <span className="text-muted-foreground/50">· defaults de {goalType ?? "Automático"}</span>
      </p>
      <div className="grid grid-cols-3 gap-3 mb-3">
        {fields.map(({ key, label, unit, higherIsBetter }) => (
          <div key={key} className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">{label} <span className="text-muted-foreground/50">({unit})</span></p>
            <div className="flex items-center gap-1.5">
              <span className="text-xs px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 font-medium w-8 text-center">Bom</span>
              <span className="text-xs text-muted-foreground">{higherIsBetter ? ">" : "<"}</span>
              <input
                type="number"
                step="0.01"
                className="w-16 text-xs border border-border rounded px-1.5 py-1 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary text-center"
                value={getVal(key, "good")}
                onChange={e => setVal(key, "good", e.target.value)}
              />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs px-1.5 py-0.5 rounded-full bg-yellow-500/10 text-yellow-600 font-medium w-8 text-center">Reg</span>
              <span className="text-xs text-muted-foreground">{higherIsBetter ? ">" : "<"}</span>
              <input
                type="number"
                step="0.01"
                className="w-16 text-xs border border-border rounded px-1.5 py-1 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary text-center"
                value={getVal(key, "regular")}
                onChange={e => setVal(key, "regular", e.target.value)}
              />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-600 font-medium w-8 text-center">Ruim</span>
              <span className="text-xs text-muted-foreground/50 text-xs">abaixo</span>
            </div>
          </div>
        ))}
      </div>

      {billing?.isPrePaid && (
        <div className="border-t border-border/50 pt-3 mb-3">
          <p className="text-xs font-medium text-muted-foreground mb-1.5">
            Alerta de saldo baixo <span className="text-muted-foreground/50">(R$ — apenas contas pré-pagas)</span>
          </p>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Avisar quando saldo {"<"}</span>
            <span className="text-xs text-muted-foreground">R$</span>
            <input
              type="number"
              step="0.01"
              className="w-20 text-xs border border-border rounded px-1.5 py-1 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary text-center"
              value={getBalanceVal()}
              onChange={e => setBalanceVal(e.target.value)}
            />
          </div>
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={upsert.isPending || Object.keys(vals).length === 0}
        className="text-xs px-3 py-1.5 rounded-md border border-border bg-card text-muted-foreground hover:text-foreground hover:border-border/80 transition-colors disabled:opacity-40"
      >
        {upsert.isPending ? "Salvando..." : "Salvar thresholds"}
      </button>
    </div>
  );
}
