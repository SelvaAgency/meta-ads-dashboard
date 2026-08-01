import { trpc } from "@/lib/trpc";
import { fmtBRL } from "@shared/panoramaLogic";
import { useAuth } from "@/_core/hooks/useAuth";
import { canManageContent } from "@shared/permissions";

/**
 * Faixa "Resultado" do e-commerce — a régua Investido → Atribuído → Real, em
 * banda PRÓPRIA (fora da faixa do site/funil). As três NÃO se somam: a leitura é
 * a relação. Some quando não há venda conectada (não é e-commerce). Admin/dev
 * (Google ao vivo/gated); janela consistente com a receita real.
 */
export function BandaResultado({ accountId }: { accountId: number }) {
  const { user } = useAuth();
  const pode = canManageContent(user?.role);
  const q = trpc.dashboard.resultadoEcom.useQuery(
    { accountId }, { enabled: !!accountId && pode, staleTime: 5 * 60_000, refetchOnWindowFocus: false },
  );
  const r = q.data;
  if (!r) return null;

  const cell = (lbl: string, big: string, sub?: string, tone?: string) => (
    <div className="flex-1 min-w-0">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">{lbl}</p>
      <p className={`text-2xl font-extrabold leading-tight ${tone ?? "text-foreground"}`}>{big}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{sub}</p>}
    </div>
  );

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        {cell("Investido em mídia", fmtBRL(r.investido.total),
          r.temGoogle ? `Meta ${fmtBRL(r.investido.meta)} · Google ${fmtBRL(r.investido.google)}` : "só Meta")}
        <span className="hidden sm:block text-muted-foreground/50 text-lg">→</span>
        {cell("Receita atribuída", fmtBRL(r.atribuida.total), "o que os anúncios reivindicam")}
        <span className="hidden sm:block text-muted-foreground/50 text-lg">→</span>
        {cell(`Receita real · ${r.real.fonte}`, r.real.receita != null ? fmtBRL(r.real.receita) : "—",
          `${r.real.pedidos ?? "—"} pedido(s)`, "text-emerald-600 dark:text-emerald-400")}
      </div>
      <p className="text-[11px] text-muted-foreground mt-3 pt-3 border-t border-border/50">
        As três <b className="text-foreground">não se somam</b>: investido e atribuído são mídia; a real é o caixa da loja. A leitura é a relação · {r.janela}
      </p>
    </div>
  );
}
