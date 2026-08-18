/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Rascunho — a bancada, e não o depósito
 * ─────────────────────────────────────────────────────────────────────────────
 *  O cabeçalho executivo da Social ficou pronto, foi aprovado visualmente, e a
 *  decisão de produto foi não usá-lo por enquanto. As duas saídas óbvias eram
 *  ruins: apagar joga fora trabalho que vai voltar, e deixar comentado no
 *  arquivo cria código morto que ninguém sabe se ainda compila.
 *
 *  Aqui ele continua MONTADO e renderizando, com dado real do cliente
 *  selecionado. É a diferença entre um componente preservado e um componente
 *  arquivado: este é exercitado a cada visita, e o dia em que ele quebrar por
 *  causa de outra mudança, alguém descobre aqui — não no retorno à produção.
 *
 *  ── Quem entra ────────────────────────────────────────────────────────────
 *  Só admin e dev. A bancada mostra peças fora de produção, meio prontas e
 *  possivelmente erradas — e quem não participa da decisão de produto não tem
 *  como saber que aquilo não vale. Um cliente perguntando sobre um número que
 *  um colaborador viu no Rascunho é um problema que a página não precisa criar.
 *
 *  O bloqueio é de VERDADE e mora aqui, na rota. Sumir o link da navegação
 *  esconderia a porta sem trancá-la, e o endereço é adivinhável.
 *
 *  ── O que ela não é ───────────────────────────────────────────────────────
 *  Não é ambiente de teste de DADO. Tudo o que aparece aqui lê as mesmas
 *  consultas da produção, sem atalho e sem número inventado — um rascunho
 *  alimentado por dado fictício não ensina nada sobre como a peça se comporta.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useMemo } from "react";
import { Loader2, PencilRuler } from "lucide-react";
import { MetaDashboardLayout } from "@/components/MetaDashboardLayout";
import { useAuth } from "@/_core/hooks/useAuth";
import { canManageContent } from "@shared/permissions";
import { useSelectedAccount } from "@/hooks/useSelectedAccount";
import { trpc } from "@/lib/trpc";
import { usePeriodFilter } from "@/components/PeriodFilter";
import { SemAcessoTracker } from "@/components/SemAcessoTracker";
import { CabecalhoExecutivoSocial } from "./rascunho/CabecalhoExecutivoSocial";

export default function Rascunho() {
  const { user } = useAuth();
  const { selectedAccountId, accounts } = useSelectedAccount();
  const { dateRange } = usePeriodFilter();

  const q = trpc.social.painel.useQuery(
    { accountId: selectedAccountId!, startDate: dateRange.startDate, endDate: dateRange.endDate },
    { enabled: !!user && !!selectedAccountId, staleTime: 5 * 60 * 1000 },
  );

  const cliente = useMemo(
    () => accounts?.find((a: { id: number }) => a.id === selectedAccountId),
    [accounts, selectedAccountId],
  );

  /**
   * `canManageContent` é admin ou developer — a mesma allowlist da News bar e da
   * SelvaTV. Escrita por extenso, e não `role !== "user"`: a forma negativa
   * incluiria sozinha qualquer papel novo, sem ninguém decidir isso.
   */
  if (!canManageContent((user as { role?: string } | null)?.role)) {
    return (
      <SemAcessoTracker title="Rascunho"
        message="A bancada de peças fora de produção é restrita a administradores e desenvolvedores." />
    );
  }

  return (
    <MetaDashboardLayout title="Rascunho">
      <div className="flex flex-col gap-[34px] px-6 pt-7 pb-24 max-w-[1320px] mx-auto">
        <header className="flex items-start gap-3.5">
          <span className="w-[46px] h-[46px] rounded-[14px] bg-foreground text-background
                           grid place-items-center flex-shrink-0">
            <PencilRuler className="w-5 h-5" strokeWidth={2} />
          </span>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-[-0.02em] leading-none">Rascunho</h1>
            <p className="text-[13px] text-muted-foreground mt-1.5 max-w-[70ch] leading-snug">
              Peças fora de produção, montadas com dado real. O que está aqui não aparece para
              cliente e pode voltar às páginas a qualquer momento — nada nesta tela é definitivo.
            </p>
          </div>
        </header>

        {!selectedAccountId && (
          <div className="rounded-[20px] border border-border bg-card p-8 text-center">
            <h2 className="text-lg font-semibold">Selecione um cliente</h2>
            <p className="text-sm text-muted-foreground mt-1">
              As peças desta bancada leem dado real — escolha uma conta no menu.
            </p>
          </div>
        )}

        {selectedAccountId && q.isLoading && (
          <div className="flex items-center justify-center h-48 text-muted-foreground gap-2">
            <Loader2 className="w-5 h-5 animate-spin" /> Carregando…
          </div>
        )}

        {selectedAccountId && q.error && (
          <p className="text-sm text-destructive">{q.error.message}</p>
        )}

        {q.data && (
          <Peca
            titulo="Cabeçalho executivo da Social"
            porque="Aprovado visualmente e retirado da página por decisão de produto: a Social
                    passou a abrir direto nos Dados Gerais. Continua montado e renderizando com
                    dado real, então o dia em que ele quebrar por outra mudança se descobre aqui."
            retiradoEm="18/08/2026">
            {/* Sem Instagram vinculado a peça não renderiza vazia: um cabeçalho
                com quatro traços e um gráfico em branco pareceria a peça
                QUEBRADA, quando o que falta é a conexão do cliente. A bancada
                existe para revelar defeito real — confundir os dois a torna
                inútil. */}
            {q.data.organico
              ? <CabecalhoExecutivoSocial dados={q.data} cliente={cliente} />
              : (
                <div className="rounded-[20px] border border-dashed border-border bg-card px-5 py-6">
                  <p className="text-sm font-medium">Este cliente não tem Instagram vinculado.</p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-[70ch] leading-snug">
                    A peça lê as mesmas consultas da produção, então ela precisa de uma conta
                    conectada para renderizar. Escolha outro cliente no menu — ou conecte este em
                    Configurações → Conexões → Social.
                  </p>
                </div>
              )}
          </Peca>
        )}
      </div>
    </MetaDashboardLayout>
  );
}

/**
 * A moldura de uma peça na bancada.
 *
 * O POR QUÊ é obrigatório, e não decoração: um componente guardado sem o motivo
 * da retirada volta à produção reintroduzindo o problema que o tirou de lá.
 */
function Peca({ titulo, porque, retiradoEm, children }: {
  titulo: string; porque: string; retiradoEm: string; children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline gap-2.5 flex-wrap">
        <h2 className="text-[13px] font-bold uppercase tracking-[0.1em]">{titulo}</h2>
        <span className="text-[10px] font-bold uppercase tracking-[0.04em] px-2 py-0.5 rounded-full
                         bg-amber-500/14 text-amber-700">
          fora de produção desde {retiradoEm}
        </span>
      </div>
      <p className="text-[11.5px] text-muted-foreground/80 leading-relaxed max-w-[85ch]">{porque}</p>
      {children}
    </section>
  );
}
