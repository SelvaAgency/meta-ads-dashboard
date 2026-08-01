import { trpc } from "@/lib/trpc";
import { Loader2 } from "lucide-react";
import { funilVisual, fmtBRL, type ClientePanorama } from "@shared/panoramaLogic";
import { fmtNumber, fmtPercent, type GoalType } from "@/lib/kpiConfig";
import { Funil } from "../panorama/Visuais";

/** Objetivos de topo: sem funil de conversão (origem+comportamento vem depois). */
const AWARE = new Set(["AWARENESS", "ENGAGEMENT", "VIDEO", "FOLLOWERS"]);

/** Funil de MÍDIA (não-ecomm): Impressões → Cliques → Resultado, com taxas. Visual
 *  próprio (não o de e-commerce), pois CTR baixo é normal e não é "queda crítica". */
function FunilMidia({ f, goalType, janela }: {
  f: { impressoes: number; cliques: number; resultado: number; sessoes: number | null };
  goalType: GoalType; janela: string;
}) {
  const isTraffic = goalType === "TRAFFIC";
  const lastLabel = isTraffic ? "Sessões" : goalType === "LEADS" ? "Leads" : goalType === "MESSAGES" ? "Conversas" : "Resultados";
  const lastVal = isTraffic ? (f.sessoes ?? f.resultado) : f.resultado;
  const ctr = f.impressoes > 0 ? (f.cliques / f.impressoes) * 100 : null;
  const cr = f.cliques > 0 ? (lastVal / f.cliques) * 100 : null;

  const Cell = ({ nome, valor }: { nome: string; valor: string }) => (
    <div className="flex-1 min-w-0 rounded-lg border border-border bg-card-2/40 px-3 py-2.5" style={{ background: "var(--color-background-secondary, rgba(0,0,0,0.03))" }}>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold truncate">{nome}</p>
      <p className="text-lg font-extrabold text-foreground leading-tight">{valor}</p>
    </div>
  );
  const Seta = ({ taxa, rot }: { taxa: number | null; rot?: string }) => (
    <div className="flex flex-col items-center justify-center px-1 flex-shrink-0">
      <span className="text-muted-foreground/50 text-lg leading-none">→</span>
      {taxa != null && <span className="text-[10px] font-bold text-muted-foreground mt-0.5">{rot ? `${rot} ` : ""}{fmtPercent(taxa)}</span>}
    </div>
  );

  return (
    <div>
      <h2 className="text-sm font-bold text-foreground mb-3">Funil de mídia <span className="text-[11px] font-normal text-muted-foreground">· Meta + Google · {janela}</span></h2>
      <div className="flex items-stretch gap-1">
        <Cell nome="Impressões" valor={fmtNumber(f.impressoes)} />
        <Seta taxa={ctr} rot="CTR" />
        <Cell nome="Cliques" valor={fmtNumber(f.cliques)} />
        <Seta taxa={cr} />
        <Cell nome={lastLabel} valor={fmtNumber(lastVal)} />
      </div>
    </div>
  );
}

/**
 * Seção do SITE em UMA caixa: começa com a régua de resultado (Investimento →
 * Receita atribuída → Receita geral) e, abaixo, o funil de compra. Ambos fixos em
 * 7d na HOME. Some por completo quando não há nem resultado nem funil (conta sem
 * e-commerce). Admin/dev p/ a régua (inclui Google ao vivo).
 */
/** Awareness/presença: sem funil de conversão — mostra ORIGEM do tráfego (GA4) +
 *  COMPORTAMENTO (Clarity). Ambos ao vivo, só p/ contas desse objetivo. */
function AwarenessBlock({ accountId }: { accountId: number }) {
  const origensQ = trpc.ga4.dados.useQuery(
    { accountId, bloco: "sources", days: 7, limit: 5 }, { staleTime: 5 * 60_000, refetchOnWindowFocus: false },
  );
  const clarityQ = trpc.clarity.ultimo.useQuery({ accountId }, { staleTime: 5 * 60_000, refetchOnWindowFocus: false });
  const origens = (origensQ.data as any[] | null) ?? [];
  const cl = clarityQ.data as any;
  const maxSess = Math.max(...origens.map((o: any) => Number(o.sessions ?? 0)), 1);
  const fmtDur = (s?: number | null) => s == null ? "—" : `${Math.floor(s / 60)}m${String(Math.round(s % 60)).padStart(2, "0")}s`;
  const scrollPct = cl?.averageScrollDepth != null ? (cl.averageScrollDepth <= 1 ? cl.averageScrollDepth * 100 : cl.averageScrollDepth) : null;

  const Tile = ({ nome, valor }: { nome: string; valor: string }) => (
    <div className="rounded-lg border border-border px-3 py-2.5" style={{ background: "var(--color-background-secondary, rgba(0,0,0,0.03))" }}>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold truncate">{nome}</p>
      <p className="text-lg font-extrabold text-foreground leading-tight">{valor}</p>
    </div>
  );

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-bold text-foreground mb-3">Origem do tráfego <span className="text-[11px] font-normal text-muted-foreground">· GA4 · 7d</span></h2>
        {origensQ.isLoading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Carregando origens…</div>
        ) : origens.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sem dados de origem no GA4 (7d).</p>
        ) : (
          <div className="flex flex-col gap-2">
            {origens.map((o: any, i: number) => (
              <div key={i} className="flex items-center gap-3">
                <span className="w-40 flex-shrink-0 text-xs text-muted-foreground truncate">{o.source ?? o.fonte ?? "—"}{o.medium ? ` / ${o.medium}` : ""}</span>
                <span className="flex-1 h-3 bg-muted rounded overflow-hidden"><span className="block h-full rounded bg-primary" style={{ width: `${(Number(o.sessions ?? 0) / maxSess) * 100}%` }} /></span>
                <span className="w-16 text-right text-xs font-bold text-foreground">{fmtNumber(Number(o.sessions ?? 0))}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {cl && (
        <div className="pt-4 border-t border-border/50">
          <h2 className="text-sm font-bold text-foreground mb-3">Comportamento <span className="text-[11px] font-normal text-muted-foreground">· Clarity</span></h2>
          <div className="grid grid-cols-3 gap-3">
            <Tile nome="Scroll médio" valor={scrollPct != null ? `${scrollPct.toFixed(0)}%` : "—"} />
            <Tile nome="Tempo médio" valor={fmtDur(cl.averageSessionDuration)} />
            <Tile nome="Rage clicks" valor={cl.rageClicks != null ? fmtNumber(cl.rageClicks) : "—"} />
          </div>
        </div>
      )}
    </div>
  );
}

export function SecaoSite({ accountId, goalType }: { accountId: number; goalType: GoalType }) {
  // Régua p/ todos (é a performance do próprio cliente); o Google dela é
  // preenchido só p/ admin/dev no servidor.
  const reguaQ = trpc.dashboard.resultadoEcom.useQuery(
    { accountId }, { enabled: !!accountId, staleTime: 5 * 60_000, refetchOnWindowFocus: false },
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
      // Melhor janela (7d preferido, 30d de fallback) — o funil não some numa loja esparsa.
      ga4_30d: d.ga4_30d ? { dia: d.ga4_30d.dia, metricsJson: d.ga4_30d.metricsJson as any } : null,
      loja_7d: d.loja_7d ? { dia: d.loja_7d.dia, metricsJson: d.loja_7d.metricsJson as any } : null,
      loja_30d: d.loja_30d ? { dia: d.loja_30d.dia, metricsJson: d.loja_30d.metricsJson as any } : null,
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
      {/* Régua de resultado — e-commerce em RECEITA; demais objetivos em RESULTADO */}
      {r && (() => {
        const g = r.geral as { valor: number | null; pedidos: number | null; fonte: string };
        const c2Val = r.ecom ? fmtBRL(r.atribuido.total) : fmtNumber(r.atribuido.total);
        const c3Label = r.ecom ? `Receita geral · ${g.fonte}` : `Resultado geral rastreado · ${g.fonte}`;
        const c3Val = g.valor != null ? (r.ecom ? fmtBRL(g.valor) : fmtNumber(g.valor)) : "—";
        const c3Sub = r.ecom ? `${g.pedidos ?? "—"} pedido(s)` : "medido pelo GA4 (todas as fontes)";
        return (
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              {cell("Investimento", fmtBRL(r.investido.total),
                r.temGoogle ? `Meta ${fmtBRL(r.investido.meta)} · Google ${fmtBRL(r.investido.google)}` : "só Meta")}
              <span className="hidden sm:block text-muted-foreground/50 text-lg">→</span>
              {cell(r.ecom ? "Receita atribuída" : "Resultado atribuído", c2Val, "o que os anúncios reivindicam")}
              <span className="hidden sm:block text-muted-foreground/50 text-lg">→</span>
              {cell(c3Label, c3Val, c3Sub, "text-emerald-600 dark:text-emerald-400")}
            </div>
            <p className="text-[11px] text-muted-foreground mt-3">
              {r.ecom
                ? <>As três <b className="text-foreground">não se somam</b>: investido e atribuído são mídia; a geral é o caixa da loja. A leitura é a relação · {r.janela}</>
                : <>Atribuído = o que as plataformas reivindicam; geral <b className="text-foreground">rastreado</b> = o que o GA4 mede no site (todas as fontes) · {r.janela}</>}
            </p>
          </div>
        );
      })()}

      {/* Funil de compra (e-commerce · GA4) */}
      {funil && (
        <div className={r ? "pt-4 border-t border-border/50" : ""}>
          <h2 className="text-sm font-bold text-foreground mb-3">Funil de compra</h2>
          <Funil funil={funil} />
        </div>
      )}

      {/* Funil de mídia (não-ecommerce, exceto awareness/presença) */}
      {r && !r.ecom && r.funil && !AWARE.has(goalType) && (
        <div className={r ? "pt-4 border-t border-border/50" : ""}>
          <FunilMidia f={r.funil} goalType={goalType} janela={r.janela} />
        </div>
      )}

      {/* Awareness/presença: origem do tráfego (GA4) + comportamento (Clarity) */}
      {r && !r.ecom && AWARE.has(goalType) && (
        <div className={r ? "pt-4 border-t border-border/50" : ""}>
          <AwarenessBlock accountId={accountId} />
        </div>
      )}
    </div>
  );
}
