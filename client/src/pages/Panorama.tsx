import { MetaDashboardLayout } from "@/components/MetaDashboardLayout";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { canManageContent } from "@shared/permissions";
import { Link } from "wouter";
import { Globe2, Loader2, AlertTriangle, ArrowUpRight, ShoppingCart } from "lucide-react";
import {
  avaliarCliente, ordenarClientes, resumoPortfolio,
  celulaSaude, celulaTrafego, celulaFunil, celulaVendas, vendasDe,
  funilVisual, rankingProdutos, distribuicaoStatus, temEcommerce, fmtDia, fmtBRL,
  type ClientePanorama, type Nivel, type Celula, type Achado,
} from "./panorama/panoramaLogic";
import {
  StatTile, BarraSaude, ChipStatus, DeltaTrafego, Funil, RankingProdutos, DistribuicaoStatus,
} from "./panorama/Visuais";

/**
 * Panorama de Sites — visão CROSS-CLIENT de gestão (admin/dev). Dois níveis:
 * visão executiva no topo (stat tiles, saúde do portfólio, "atenção primeiro",
 * grade) e detalhe visual de e-commerce abaixo — só para quem tem base real.
 *
 * Toda a lógica (nível, achados, Woo vs GA4, funil, ranking) é pura em
 * panoramaLogic.ts; aqui só se monta o visual. Nenhum número muda em relação à
 * v1 — os mesmos dados, mais escaneáveis.
 */

const NIVEL_UI: Record<Nivel, { rotulo: string; cls: string; dot: string; tom: "critico" | "atencao" | "ok" | "neutro" }> = {
  critico: { rotulo: "Crítico", cls: "text-red-600 dark:text-red-400", dot: "bg-red-500", tom: "critico" },
  atencao: { rotulo: "Atenção", cls: "text-amber-600 dark:text-amber-400", dot: "bg-amber-500", tom: "atencao" },
  ok: { rotulo: "Ok", cls: "text-emerald-600 dark:text-emerald-400", dot: "bg-emerald-500", tom: "ok" },
  sem_dados: { rotulo: "Sem dados", cls: "text-muted-foreground/70", dot: "bg-muted-foreground/30", tom: "neutro" },
};

const ESTADO_CLS: Record<Celula["estado"], string> = {
  ok: "text-foreground",
  atencao: "text-amber-600 dark:text-amber-400",
  critico: "text-red-600 dark:text-red-400 font-semibold",
  vazio: "text-muted-foreground/50",
};

/** Variação de sessões 7d vs período anterior — só com base real. */
function deltaTrafego(c: ClientePanorama): number | null {
  const m = c.ga4_7d?.metricsJson;
  const ant = m?.anterior?.sessions;
  if (typeof m?.sessions !== "number" || typeof ant !== "number" || ant <= 0) return null;
  return ((m.sessions - ant) / ant) * 100;
}

function CelulaTd({ c, delta }: { c: Celula; delta?: number | null }) {
  return (
    <td className="px-3 py-2.5 align-top">
      <p className={`text-xs ${ESTADO_CLS[c.estado]}`}>
        {c.valor}
        {delta != null && <span className="ml-1.5 align-middle"><DeltaTrafego pct={delta} /></span>}
      </p>
      {c.detalhe && <p className="text-[10px] text-muted-foreground mt-0.5">{c.detalhe}</p>}
      {c.fonte && (
        <p className="text-[10px] text-muted-foreground/60 mt-0.5">
          {c.fonte}{c.dia ? ` · ${fmtDia(c.dia)}` : ""}
        </p>
      )}
    </td>
  );
}

function LinkSite({ accountId, aba, children }: { accountId: number; aba?: string; children: React.ReactNode }) {
  return (
    <Link href={`/site?account=${accountId}${aba ? `&aba=${aba}` : ""}`}>
      <span className="cursor-pointer hover:underline inline-flex items-center gap-0.5">
        {children} <ArrowUpRight className="w-3 h-3 opacity-50" />
      </span>
    </Link>
  );
}

export default function Panorama() {
  const { user } = useAuth();
  const podeVer = canManageContent(user?.role);
  const q = trpc.panorama.sites.useQuery(undefined, { enabled: podeVer });

  if (!podeVer) {
    return (
      <MetaDashboardLayout title="Panorama de Sites">
        <div className="p-6">
          <div className="bg-card border border-border rounded-xl p-8 text-center">
            <Globe2 className="w-8 h-8 mx-auto text-muted-foreground/40 mb-3" />
            <h2 className="text-sm font-bold text-foreground">Sem acesso a esta tela</h2>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
              O Panorama de Sites é uma visão de gestão, de administradores e desenvolvedores.
            </p>
          </div>
        </div>
      </MetaDashboardLayout>
    );
  }

  const clientes = (q.data ?? []) as ClientePanorama[];
  const linhas = ordenarClientes(
    clientes.map((c) => ({ cliente: c, nome: c.nome, ...avaliarCliente(c) })),
  );
  const comAtencao = linhas.filter((l) => l.nivel === "critico" || l.nivel === "atencao");
  const resumo = resumoPortfolio(linhas.map((l) => ({ nivel: l.nivel, achados: l.achados })), clientes);
  const lojas = linhas.filter((l) => temEcommerce(l.cliente));

  return (
    <MetaDashboardLayout title="Panorama de Sites">
      <div className="p-6 flex flex-col gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Globe2 className="w-5 h-5" /> Panorama de Sites
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Quem precisa de atenção primeiro — e por quê. Cada número declara a fonte e a data.
          </p>
        </div>

        {q.isLoading && (
          <div className="bg-card border border-border rounded-xl p-8 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Carregando o panorama…
          </div>
        )}

        {!q.isLoading && (
          <>
            {/* ── Topo do portfólio: stat tiles + saúde ── */}
            <div className="flex flex-wrap gap-3">
              <StatTile rotulo="Clientes" valor={resumo.totalClientes} />
              <StatTile rotulo="Precisam atenção" valor={resumo.precisamAtencao}
                tom={resumo.precisamAtencao > 0 ? "atencao" : "ok"}
                detalhe={`${resumo.criticos} crítico${resumo.criticos === 1 ? "" : "s"} · ${resumo.atencoes} em atenção`} />
              <StatTile rotulo="Achados abertos" valor={resumo.achadosCriticos + resumo.achadosAtencao}
                tom={resumo.achadosCriticos > 0 ? "critico" : resumo.achadosAtencao > 0 ? "atencao" : "ok"}
                detalhe={`${resumo.achadosCriticos} crítico${resumo.achadosCriticos === 1 ? "" : "s"} · ${resumo.achadosAtencao} atenção`} />
              <StatTile rotulo="Lojas Woo" valor={resumo.lojasWoo} detalhe="conectadas" />
            </div>

            <div className="bg-card border border-border rounded-xl p-5">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2.5">Saúde do portfólio</p>
              <BarraSaude distribuicao={resumo.distribuicao} total={resumo.totalClientes} />
            </div>

            {/* ── Atenção primeiro ── */}
            <div className="bg-card border border-border rounded-xl p-5">
              <h2 className="text-sm font-bold text-foreground flex items-center gap-1.5 mb-3">
                <AlertTriangle className="w-4 h-4 text-amber-500" /> Atenção primeiro
              </h2>
              {comAtencao.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhum cliente com achado crítico ou de atenção hoje.</p>
              ) : (
                <div className="flex flex-col divide-y divide-border/50">
                  {comAtencao.map((l) => {
                    const principal = l.achados.find((a) => a.severidade !== "info") ?? l.achados[0];
                    return (
                      <div key={l.cliente.accountId} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
                        <ChipStatus tom={NIVEL_UI[l.nivel].tom}>{NIVEL_UI[l.nivel].rotulo}</ChipStatus>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-foreground">
                            <LinkSite accountId={l.cliente.accountId} aba={principal?.aba}>{l.nome}</LinkSite>
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {l.motivos.length === 1 ? l.motivos[0] : (
                              <>{principal?.texto}{l.motivos.length > 1 && <span className="text-muted-foreground/60"> · +{l.motivos.length - 1} outro{l.motivos.length - 1 === 1 ? "" : "s"}</span>}</>
                            )}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── Grade por cliente ── */}
            <div className="bg-card border border-border rounded-xl overflow-x-auto">
              <table className="w-full text-sm min-w-[820px]">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground border-b border-border">
                    <th className="px-5 py-2 font-medium">Cliente</th>
                    <th className="px-3 py-2 font-medium">Saúde técnica</th>
                    <th className="px-3 py-2 font-medium">Tráfego</th>
                    <th className="px-3 py-2 font-medium">Funil</th>
                    <th className="px-3 py-2 font-medium">Vendas</th>
                    <th className="px-3 py-2 font-medium">Achados</th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((l) => {
                    const c = l.cliente;
                    const visiveis = l.achados.filter((a: Achado) => a.severidade !== "info");
                    return (
                      <tr key={c.accountId} className="border-b border-border/50 last:border-0">
                        <td className="px-5 py-2.5 align-top">
                          <p className="text-xs font-semibold text-foreground">
                            <LinkSite accountId={c.accountId}>{l.nome}</LinkSite>
                          </p>
                          <p className={`text-[10px] mt-0.5 inline-flex items-center gap-1 ${NIVEL_UI[l.nivel].cls}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${NIVEL_UI[l.nivel].dot}`} />
                            {NIVEL_UI[l.nivel].rotulo}
                          </p>
                        </td>
                        <CelulaTd c={celulaSaude(c)} />
                        <CelulaTd c={celulaTrafego(c)} delta={deltaTrafego(c)} />
                        <CelulaTd c={celulaFunil(c)} />
                        <CelulaTd c={celulaVendas(c)} />
                        <td className="px-3 py-2.5 align-top">
                          {visiveis.length === 0
                            ? <span className="text-xs text-muted-foreground/50">—</span>
                            : (
                              <div className="flex flex-col gap-1 max-w-[260px]">
                                {visiveis.map((a: Achado) => (
                                  <div key={a.chave} className="text-[11px]">
                                    <ChipStatus tom={a.severidade === "critico" ? "critico" : "atencao"} titulo={a.texto}>
                                      {a.aba
                                        ? <LinkSite accountId={c.accountId} aba={a.aba}>{a.texto}</LinkSite>
                                        : a.texto}
                                    </ChipStatus>
                                  </div>
                                ))}
                              </div>
                            )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* ── E-commerce (só quem tem base real) ── */}
            {lojas.length > 0 && (
              <div>
                <h2 className="text-sm font-bold text-foreground flex items-center gap-1.5 mb-3">
                  <ShoppingCart className="w-4 h-4" /> E-commerce
                </h2>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {lojas.map((l) => {
                    const c = l.cliente;
                    const v = vendasDe(c)!;
                    const funil = funilVisual(c);
                    const ranking = rankingProdutos(c);
                    const dist = distribuicaoStatus(c);
                    return (
                      <div key={c.accountId} className="bg-card border border-border rounded-xl p-5 flex flex-col gap-4">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-bold text-foreground">
                            <LinkSite accountId={c.accountId}>{l.nome}</LinkSite>
                          </p>
                          <ChipStatus tom={v.fonte === "woocommerce" ? "ok" : "neutro"} titulo={v.fonte === "woocommerce" ? "Receita real da loja" : "GA4 como fonte inicial — não é o caixa da loja"}>
                            {v.rotuloFonte} · {v.janela}
                          </ChipStatus>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <StatTile rotulo="Receita" valor={v.receita != null ? fmtBRL(v.receita) : "—"}
                            tom={v.receita === 0 && (v.pedidos ?? 0) > 0 ? "atencao" : "neutro"} />
                          <StatTile rotulo="Pedidos" valor={v.pedidos ?? "—"} />
                          <StatTile rotulo="Ticket médio" valor={v.ticketMedio != null ? fmtBRL(v.ticketMedio) : "—"} />
                        </div>

                        {funil && <Funil funil={funil} />}
                        {ranking && <RankingProdutos ranking={ranking} />}
                        {dist && <DistribuicaoStatus dist={dist} />}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <p className="text-[11px] text-muted-foreground/70">
              Vendas: WooCommerce quando a loja está conectada (receita real); GA4 como fonte inicial quando
              não está. Funil é sempre GA4. Receita atribuída de Meta/Google não entra aqui — fontes nunca
              são somadas. Cliente sem e-commerce mostra “—” e não é penalizado por isso.
            </p>
          </>
        )}
      </div>
    </MetaDashboardLayout>
  );
}
