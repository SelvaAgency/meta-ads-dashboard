import { MetaDashboardLayout } from "@/components/MetaDashboardLayout";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { canManageContent } from "@shared/permissions";
import { Link } from "wouter";
import { Globe2, Loader2, AlertTriangle, ArrowUpRight } from "lucide-react";
import {
  avaliarCliente, ordenarClientes, celulaSaude, celulaTrafego, celulaFunil, celulaVendas, fmtDia,
  type ClientePanorama, type Nivel, type Celula, type Achado,
} from "./panorama/panoramaLogic";

/**
 * Panorama de Sites — visão CROSS-CLIENT de gestão (admin/dev). Responde "quais
 * clientes precisam de atenção primeiro e por quê", com os dados que já estão
 * gravados (checks técnicos, GA4, WooCommerce). Nenhum número é somado entre
 * fontes; cada célula declara a fonte e a data do dado.
 *
 * O julgamento (nível, achados, Woo vs GA4) é todo puro em panoramaLogic.ts.
 */

const NIVEL_UI: Record<Nivel, { rotulo: string; cls: string; dot: string }> = {
  critico: { rotulo: "Crítico", cls: "text-red-600 dark:text-red-400", dot: "bg-red-500" },
  atencao: { rotulo: "Atenção", cls: "text-amber-600 dark:text-amber-400", dot: "bg-amber-500" },
  ok: { rotulo: "Ok", cls: "text-emerald-600 dark:text-emerald-400", dot: "bg-emerald-500" },
  sem_dados: { rotulo: "Sem dados", cls: "text-muted-foreground/70", dot: "bg-muted-foreground/30" },
};

const ESTADO_CLS: Record<Celula["estado"], string> = {
  ok: "text-foreground",
  atencao: "text-amber-600 dark:text-amber-400",
  critico: "text-red-600 dark:text-red-400 font-semibold",
  vazio: "text-muted-foreground/50",
};

function CelulaTd({ c }: { c: Celula }) {
  return (
    <td className="px-3 py-2.5 align-top">
      <p className={`text-xs ${ESTADO_CLS[c.estado]}`}>{c.valor}</p>
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
    clientes.map((c) => ({
      cliente: c,
      nome: c.nome,
      ...avaliarCliente(c),
    })),
  );
  const comAtencao = linhas.filter((l) => l.nivel === "critico" || l.nivel === "atencao");

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
            {/* ── Quem precisa de atenção primeiro ── */}
            <div className="bg-card border border-border rounded-xl p-5">
              <h2 className="text-sm font-bold text-foreground flex items-center gap-1.5 mb-3">
                <AlertTriangle className="w-4 h-4 text-amber-500" /> Atenção primeiro
              </h2>
              {comAtencao.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Nenhum cliente com achado crítico ou de atenção hoje.
                </p>
              ) : (
                <ul className="flex flex-col gap-2.5">
                  {comAtencao.map((l) => (
                    <li key={l.cliente.accountId} className="flex items-start gap-2.5">
                      <span className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${NIVEL_UI[l.nivel].dot}`} />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-foreground">
                          <LinkSite accountId={l.cliente.accountId}>{l.nome}</LinkSite>
                          <span className={`ml-2 text-[10px] font-medium uppercase tracking-wide ${NIVEL_UI[l.nivel].cls}`}>
                            {NIVEL_UI[l.nivel].rotulo}
                          </span>
                        </p>
                        <ul className="mt-0.5 flex flex-col gap-0.5">
                          {l.motivos.map((m, i) => {
                            const achado = l.achados.find((a: Achado) => a.texto === m);
                            return (
                              <li key={i} className="text-xs text-muted-foreground">
                                · {achado?.aba
                                  ? <LinkSite accountId={l.cliente.accountId} aba={achado.aba}>{m}</LinkSite>
                                  : m}
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    </li>
                  ))}
                </ul>
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
                        <CelulaTd c={celulaTrafego(c)} />
                        <CelulaTd c={celulaFunil(c)} />
                        <CelulaTd c={celulaVendas(c)} />
                        <td className="px-3 py-2.5 align-top">
                          {visiveis.length === 0
                            ? <span className="text-xs text-muted-foreground/50">—</span>
                            : (
                              <ul className="flex flex-col gap-0.5 max-w-[260px]">
                                {visiveis.map((a: Achado) => (
                                  <li key={a.chave} className={`text-[11px] ${a.severidade === "critico" ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"}`}>
                                    {a.aba
                                      ? <LinkSite accountId={c.accountId} aba={a.aba}>{a.texto}</LinkSite>
                                      : a.texto}
                                  </li>
                                ))}
                              </ul>
                            )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

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
