import { MetaDashboardLayout } from "@/components/MetaDashboardLayout";
import { useAuth } from "@/_core/hooks/useAuth";
import { ShieldCheck, FileSignature, Wallet, Sparkles } from "lucide-react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";

export default function Admin() {
  const { user } = useAuth();
  if ((user as any)?.role !== "admin") return null;

  return (
    <MetaDashboardLayout>
      <div className="max-w-2xl mx-auto py-6 space-y-6">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <ShieldCheck className="w-5 h-5" /> Administrativo
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Ferramentas restritas aos administradores da SELVA.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3">
          <Link href="/contracts">
            <div className="flex items-center gap-4 p-4 rounded-xl border border-border hover:border-primary/50 hover:bg-muted/30 transition-all cursor-pointer">
              <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                <FileSignature className="w-5 h-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium">Contratos PJ</p>
                <p className="text-xs text-muted-foreground">Gerar contratos de prestacao de servicos</p>
              </div>
            </div>
          </Link>
          <Link href="/finance">
            <div className="flex items-center gap-4 p-4 rounded-xl border border-border hover:border-primary/50 hover:bg-muted/30 transition-all cursor-pointer">
              <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                <Wallet className="w-5 h-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium">Controle Financeiro</p>
                <p className="text-xs text-muted-foreground">P&amp;L, reembolsos e reconciliação Gui &amp; SELVA</p>
              </div>
            </div>
          </Link>
        </div>

        <ConsumoDeIA />
      </div>
    </MetaDashboardLayout>
  );
}

const ROTULO_ORIGEM: Record<string, string> = {
  status_ia: "Saúde da conta",
  briefing: "Jornalzinho do dia",
  relatorio: "Gerador de relatórios",
  relatorio_site: "Relatório de site",
  chat_cliente: "Perguntar sobre o cliente",
  sugestoes: "Recomendações",
  consolidacao: "Consolidação semanal",
  fechamento_acao: "Fechamento de ações",
  extracao: "Extração de campos",
  outra: "Não identificada",
};

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Consumo de IA — contagem, nunca conteúdo
 * ─────────────────────────────────────────────────────────────────────────────
 *  Responde "o que está gastando" sem abrir prompt, resposta ou dado de cliente
 *  nenhum. O agrupamento é por ORIGEM porque é assim que se decide o que cortar:
 *  saber que foram 340 chamadas não ajuda; saber que 280 vieram do cron diário
 *  ajuda.
 *
 *  ── Falhas contam ──────────────────────────────────────────────────────────
 *  Uma chamada que falhou saiu do Spaces e pode ter sido processada. E uma
 *  sequência de falhas é justamente o que ninguém percebe sem contar — foi
 *  assim que o crédito acabou sem aviso.
 * ─────────────────────────────────────────────────────────────────────────────
 */
function ConsumoDeIA() {
  const q = trpc.accounts.consumoIA.useQuery({ dias: 14 });
  const d = q.data;

  const n = (v: unknown) => Number(v ?? 0);
  const fmt = (v: unknown) => n(v).toLocaleString("pt-BR");
  const porOrigem = [...(d?.porOrigem ?? [])].sort((a, b) => n(b.chamadas) - n(a.chamadas));
  const porDia = d?.porDia ?? [];
  const pico = Math.max(1, ...porDia.map((x) => n(x.chamadas)));

  return (
    <div className="rounded-xl border border-border p-4">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <p className="text-sm font-medium flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-muted-foreground" /> Consumo de IA
        </p>
        <span className="text-xs text-muted-foreground">últimos {d?.dias ?? 14} dias</span>
      </div>

      {q.isLoading && <p className="text-xs text-muted-foreground mt-3">Carregando…</p>}
      {d && d.total === 0 && (
        <p className="text-xs text-muted-foreground mt-3">
          Nenhuma geração registrada ainda. A contagem começa na próxima chamada — o histórico
          anterior não foi medido, e inventar um número seria pior que não ter.
        </p>
      )}

      {d && d.total > 0 && (
        <>
          <div className="flex items-baseline gap-4 mt-3">
            <span>
              <b className="text-2xl font-bold tabular-nums">{fmt(d.total)}</b>
              <span className="text-xs text-muted-foreground ml-1.5">gerações</span>
            </span>
            {d.falhas > 0 && (
              <span className="text-xs text-destructive tabular-nums">{fmt(d.falhas)} falharam</span>
            )}
          </div>

          {/* Por dia: a forma responde "está subindo?" sem exigir tabela. */}
          <div className="flex items-end gap-[3px] h-9 mt-3">
            {porDia.map((x) => (
              <span key={x.dia} className="flex-1 bg-primary/60 rounded-[2px] min-h-[2px]"
                style={{ height: `${(n(x.chamadas) / pico) * 100}%` }}
                title={`${String(x.dia).slice(5)} · ${fmt(x.chamadas)} gerações`} />
            ))}
          </div>

          <div className="flex flex-col gap-1.5 mt-3 pt-3 border-t border-border">
            {porOrigem.map((o) => (
              <div key={o.origem} className="flex items-baseline justify-between gap-3 text-xs">
                <span className="truncate">{ROTULO_ORIGEM[o.origem] ?? o.origem}</span>
                <span className="tabular-nums text-muted-foreground flex-shrink-0">
                  {fmt(o.chamadas)}
                  {n(o.falhas) > 0 && <span className="text-destructive"> · {fmt(o.falhas)} falhas</span>}
                  {n(o.tokensSaida) > 0 && <span className="opacity-60"> · {fmt(o.tokensSaida)} tokens</span>}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
