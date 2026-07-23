import { trpc } from "@/lib/trpc";
import { Link } from "wouter";
import { ShoppingCart, Loader2, ArrowUpRight, Info } from "lucide-react";
import {
  vendasDe, funilVisual, rankingProdutos, distribuicaoStatus, achadosComerciais,
  fmtBRL, fmtDia, type ClientePanorama,
} from "../panorama/panoramaLogic";
import { StatTile, ChipStatus, Funil, RankingProdutos, DistribuicaoStatus } from "../panorama/Visuais";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Bloco Comercial do cliente (v1) — card isolado dentro do Dashboard
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  Responde: quanto vendeu, quantos pedidos, qual ticket, de qual fonte, e há
 *  problema comercial? Reaproveita 100% da lógica pura do Panorama — Dashboard
 *  e Panorama nunca discordam sobre a venda de um cliente.
 *
 *  Regras inegociáveis que este card carrega:
 *   · Woo existe → receita REAL da loja; senão GA4 é FONTE INICIAL; senão vazio;
 *   · NUNCA soma Woo + GA4 + Meta + Google;
 *   · receita atribuída de mídia aparece em linha SEPARADA e rotulada — nunca
 *     como faturamento da loja;
 *   · toda métrica mostra fonte + janela + data; dado atrasado ganha selo;
 *   · sem base de venda → estado vazio claro, sem tile fantasma.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function BlocoVendas({ accountId, midiaAtribuida }: {
  accountId: number;
  /** Receita atribuída de mídia (do overview já carregado) — só para a linha separada. */
  midiaAtribuida?: { meta?: number | null };
}) {
  const q = trpc.dashboard.vendas.useQuery({ accountId }, { enabled: !!accountId, staleTime: 120_000 });

  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <div className="bg-card border border-border rounded-xl p-5">
      <h2 className="text-sm font-bold text-foreground flex items-center gap-1.5 mb-3">
        <ShoppingCart className="w-4 h-4" /> Vendas
      </h2>
      {children}
    </div>
  );

  if (q.isLoading) {
    return <Wrapper><div className="flex items-center gap-2 text-xs text-muted-foreground py-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Carregando dados de venda…</div></Wrapper>;
  }
  if (q.isError || !q.data) {
    return <Wrapper><p className="text-xs text-muted-foreground">Não foi possível carregar os dados de venda agora.</p></Wrapper>;
  }

  // Monta o shape do Panorama SÓ com o que a venda precisa; o resto é null e a
  // lógica pura lida com isso (achadosComerciais filtra os não-comerciais fora).
  const c: ClientePanorama = {
    accountId, nome: "", fontes: [],
    loja: q.data.loja,
    uptime: null, seguranca: null, pagespeed: null,
    ga4_7d: q.data.ga4_7d ? { dia: q.data.ga4_7d.dia, metricsJson: q.data.ga4_7d.metricsJson as any } : null,
    ga4_30d: q.data.ga4_30d ? { dia: q.data.ga4_30d.dia, metricsJson: q.data.ga4_30d.metricsJson as any } : null,
    woo_7d: q.data.woo_7d ? { dia: q.data.woo_7d.dia, metricsJson: q.data.woo_7d.metricsJson as any } : null,
    woo_30d: q.data.woo_30d ? { dia: q.data.woo_30d.dia, metricsJson: q.data.woo_30d.metricsJson as any } : null,
  };

  const v = vendasDe(c);
  const midiaMeta = midiaAtribuida?.meta ?? null;

  const LinhaMidia = () =>
    midiaMeta != null && midiaMeta > 0 ? (
      <div className="mt-3 pt-3 border-t border-border/50 flex items-start gap-1.5">
        <Info className="w-3.5 h-3.5 text-muted-foreground/60 mt-0.5 flex-shrink-0" />
        <p className="text-[11px] text-muted-foreground">
          Receita atribuída de mídia · Meta: <span className="font-semibold text-foreground">{fmtBRL(midiaMeta)}</span>
          {" "}— não é o faturamento da loja.
        </p>
      </div>
    ) : null;

  // ── Estado vazio: sem venda conectada ──
  if (!v) {
    return (
      <Wrapper>
        <p className="text-xs text-muted-foreground">
          Sem venda conectada: nenhuma loja conectada e nenhum e-commerce detectado no GA4.
        </p>
        <LinhaMidia />
      </Wrapper>
    );
  }

  const funil = funilVisual(c);
  const ranking = rankingProdutos(c);
  const dist = distribuicaoStatus(c);
  const problemas = achadosComerciais(c);
  const receitaZerada = v.receita === 0 && (v.pedidos ?? 0) > 0;

  return (
    <Wrapper>
      {/* Cabeçalho: fonte + janela + data (+ selo de idade) */}
      <div className="flex items-center justify-between gap-2 mb-3 -mt-1">
        <ChipStatus tom={v.fonte === "woocommerce" ? "ok" : "neutro"}
          titulo={v.fonte === "woocommerce" ? "Receita real da loja (WooCommerce)" : "GA4 como fonte inicial — não é o caixa da loja"}>
          {v.rotuloFonte} · {v.janela}
        </ChipStatus>
        <SeloData dia={v.dia} />
      </div>

      {/* Tiles principais */}
      <div className="flex flex-wrap gap-2">
        <StatTile rotulo="Receita" valor={v.receita != null ? fmtBRL(v.receita) : "—"} tom={receitaZerada ? "atencao" : "neutro"} />
        <StatTile rotulo="Pedidos" valor={v.pedidos ?? "—"} />
        <StatTile rotulo="Ticket médio" valor={v.ticketMedio != null ? fmtBRL(v.ticketMedio) : "—"} />
      </div>

      {/* Ressalva Scaffold: pedidos pagos com R$0 por cupom de 100% */}
      {receitaZerada && (
        <p className="mt-2 text-[11px] text-amber-600 dark:text-amber-400">
          Pedidos pagos com receita R$ 0 por desconto de 100%.
        </p>
      )}

      {funil && <div className="mt-4"><Funil funil={funil} /></div>}
      {ranking && <div className="mt-4"><RankingProdutos ranking={ranking} /></div>}
      {dist && <div className="mt-4"><DistribuicaoStatus dist={dist} /></div>}

      {/* Problemas comerciais — achados por regra medida */}
      {problemas.length > 0 && (
        <div className="mt-4">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5">Problemas comerciais</p>
          <div className="flex flex-col gap-1">
            {problemas.map((a) => (
              <div key={a.chave} className="text-[11px]">
                <ChipStatus tom={a.severidade === "critico" ? "critico" : "atencao"} titulo={a.texto}>
                  {a.aba
                    ? <Link href={`/site?account=${accountId}&aba=${a.aba}`}>
                        <span className="cursor-pointer hover:underline inline-flex items-center gap-0.5">{a.texto} <ArrowUpRight className="w-3 h-3 opacity-50" /></span>
                      </Link>
                    : a.texto}
                </ChipStatus>
              </div>
            ))}
          </div>
        </div>
      )}

      <LinhaMidia />
    </Wrapper>
  );
}

/** Selo discreto de data + idade do snapshot. Não é alerta — só transparência. */
function SeloData({ dia }: { dia: string }) {
  const hoje = new Date();
  const [y, m, d] = dia.split("-").map(Number);
  const dataDoDado = new Date(y, (m ?? 1) - 1, d ?? 1);
  const dias = Math.max(0, Math.floor((hoje.getTime() - dataDoDado.getTime()) / 86400000));
  const idade = dias === 0 ? "hoje" : dias === 1 ? "ontem" : `há ${dias} dias`;
  return (
    <span className={`text-[10px] ${dias >= 3 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground/60"}`} title={`Dado de ${fmtDia(dia)}`}>
      {fmtDia(dia)} · {idade}
    </span>
  );
}
