import { trpc } from "@/lib/trpc";
import { Loader2 } from "lucide-react";
import { funilVisual, fmtBRL, type ClientePanorama } from "@shared/panoramaLogic";
import { Funil } from "../panorama/Visuais";
import { useAuth } from "@/_core/hooks/useAuth";
import { canManageContent } from "@shared/permissions";

/**
 * Seção do SITE em UMA caixa: começa com a régua de resultado (Investimento →
 * Receita atribuída → Receita geral) e, abaixo, o funil de compra. Ambos fixos em
 * 7d na HOME. Some por completo quando não há nem resultado nem funil (conta sem
 * e-commerce). Admin/dev p/ a régua (inclui Google ao vivo).
 */
export function SecaoSite({ accountId }: { accountId: number }) {
  const { user } = useAuth();
  const pode = canManageContent(user?.role);
  const reguaQ = trpc.dashboard.resultadoEcom.useQuery(
    { accountId }, { enabled: !!accountId && pode, staleTime: 5 * 60_000, refetchOnWindowFocus: false },
  );
  const vendasQ = trpc.dashboard.vendas.useQuery({ accountId }, { enabled: !!accountId, staleTime: 120_000 });

  const r = reguaQ.data;
  let funil: ReturnType<typeof funilVisual> = null;
  if (vendasQ.data) {
    const d = vendasQ.data;
    const c: ClientePanorama = {
      accountId, nome: "", fontes: [],
      loja: d.loja, plataformaLoja: d.plataformaLoja,
      uptime: null, seguranca: null, pagespeed: null,
      ga4_7d: d.ga4_7d ? { dia: d.ga4_7d.dia, metricsJson: d.ga4_7d.metricsJson as any } : null,
      ga4_30d: null, // HOME fixa em 7d
      loja_7d: d.loja_7d ? { dia: d.loja_7d.dia, metricsJson: d.loja_7d.metricsJson as any } : null,
      loja_30d: null,
    };
    funil = funilVisual(c);
  }

  if (reguaQ.isLoading || vendasQ.isLoading) {
    return (
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Carregando site…</div>
      </div>
    );
  }
  if (!r && !funil) return null;

  const cell = (lbl: string, big: string, sub?: string, tone?: string) => (
    <div className="flex-1 min-w-0">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">{lbl}</p>
      <p className={`text-2xl font-extrabold leading-tight ${tone ?? "text-foreground"}`}>{big}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{sub}</p>}
    </div>
  );

  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-4">
      {/* Régua de resultado */}
      {r && (
        <div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            {cell("Investimento", fmtBRL(r.investido.total),
              r.temGoogle ? `Meta ${fmtBRL(r.investido.meta)} · Google ${fmtBRL(r.investido.google)}` : "só Meta")}
            <span className="hidden sm:block text-muted-foreground/50 text-lg">→</span>
            {cell("Receita atribuída", fmtBRL(r.atribuida.total), "o que os anúncios reivindicam")}
            <span className="hidden sm:block text-muted-foreground/50 text-lg">→</span>
            {cell(`Receita geral · ${r.real.fonte}`, r.real.receita != null ? fmtBRL(r.real.receita) : "—",
              `${r.real.pedidos ?? "—"} pedido(s)`, "text-emerald-600 dark:text-emerald-400")}
          </div>
          <p className="text-[11px] text-muted-foreground mt-3">
            As três <b className="text-foreground">não se somam</b>: investido e atribuído são mídia; a geral é o caixa da loja. A leitura é a relação · {r.janela}
          </p>
        </div>
      )}

      {/* Funil de compra */}
      {funil && (
        <div className={r ? "pt-4 border-t border-border/50" : ""}>
          <h2 className="text-sm font-bold text-foreground mb-3">Funil de compra</h2>
          <Funil funil={funil} />
        </div>
      )}
    </div>
  );
}
