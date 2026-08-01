import { trpc } from "@/lib/trpc";
import { Loader2 } from "lucide-react";
import { funilVisual, type ClientePanorama } from "@shared/panoramaLogic";
import { Funil } from "../panorama/Visuais";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Funil de compra do cliente — faixa EXCLUSIVA do site (só o funil).
 * ─────────────────────────────────────────────────────────────────────────────
 *  A régua Investido→Atribuído→Real virou banda própria (BandaResultado); aqui
 *  fica só o funil do e-commerce (GA4). Some quando não há e-commerce detectado.
 *  Reaproveita a lógica pura do Panorama — Dashboard e Panorama nunca discordam.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function BlocoVendas({ accountId }: { accountId: number }) {
  const q = trpc.dashboard.vendas.useQuery({ accountId }, { enabled: !!accountId, staleTime: 120_000 });

  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <div className="bg-card border border-border rounded-xl p-5">
      <h2 className="text-sm font-bold text-foreground mb-3">Funil de compra</h2>
      {children}
    </div>
  );

  if (q.isLoading) {
    return <Wrapper><div className="flex items-center gap-2 text-xs text-muted-foreground py-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Carregando funil…</div></Wrapper>;
  }
  if (q.isError || !q.data) {
    return <Wrapper><p className="text-xs text-muted-foreground">Não foi possível carregar o funil agora.</p></Wrapper>;
  }

  // Monta o shape do Panorama SÓ com o que o funil precisa; o resto é null.
  const c: ClientePanorama = {
    accountId, nome: "", fontes: [],
    loja: q.data.loja,
    uptime: null, seguranca: null, pagespeed: null,
    plataformaLoja: q.data.plataformaLoja,
    ga4_7d: q.data.ga4_7d ? { dia: q.data.ga4_7d.dia, metricsJson: q.data.ga4_7d.metricsJson as any } : null,
    ga4_30d: q.data.ga4_30d ? { dia: q.data.ga4_30d.dia, metricsJson: q.data.ga4_30d.metricsJson as any } : null,
    loja_7d: q.data.loja_7d ? { dia: q.data.loja_7d.dia, metricsJson: q.data.loja_7d.metricsJson as any } : null,
    loja_30d: q.data.loja_30d ? { dia: q.data.loja_30d.dia, metricsJson: q.data.loja_30d.metricsJson as any } : null,
  };

  const funil = funilVisual(c);
  // Sem funil de e-commerce detectado no GA4 → a faixa do site não aparece.
  if (!funil) return null;

  return (
    <Wrapper>
      <Funil funil={funil} />
    </Wrapper>
  );
}
