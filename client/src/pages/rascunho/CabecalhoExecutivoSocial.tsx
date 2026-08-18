/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  O cabeçalho executivo da Social — preservado inteiro
 * ─────────────────────────────────────────────────────────────────────────────
 *  Três colunas, 0.92fr / 1fr / 1.55fr: resumo de 7 dias · ontem × hoje ·
 *  evolução de 30 dias. O gráfico é a coluna larga porque é a única que ganha
 *  com espaço; resumo e resultados têm tamanho natural, e esticá-los só
 *  afastaria as palavras.
 *
 *  ── Por que a derivação foi copiada para cá ────────────────────────────────
 *  Ele lia oito valores calculados no meio de `RedesSociais.tsx`. Importar essa
 *  página inteira só para reaproveitar as contas amarraria a bancada à produção
 *  — e qualquer mudança na Social passaria a poder quebrar o Rascunho, que é o
 *  oposto do que uma bancada deve ser.
 *
 *  As contas moram aqui, curtas, e nenhuma delas é nova: `lerUltimosDias`,
 *  `taxaPorAlcance` e a leitura dos snapshots são exatamente as mesmas funções
 *  puras que a produção usa. O que se duplicou foi a FIAÇÃO, não a decisão.
 *
 *  ── A regra que ele carregava, e que continua valendo ──────────────────────
 *  O cabeçalho NÃO obedece ao filtro de período: ele responde "como a conta está
 *  agora", e essa pergunta não muda quando alguém escolhe 30 dias para analisar
 *  conteúdo. Por isso a janela vem de `statusDaConta` — as últimas 30 coletas.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useMemo } from "react";
import {
  IdentidadeDaConta, Resultados, ResumoCurto, type ValorDoDia,
} from "@/components/redes/CabecalhoDaConta";
import { GraficoDeEvolucao } from "@/components/redes/GraficosSociais";
import { COR } from "@shared/coresSociais";
import { lerUltimosDias, type DiaDaLeitura } from "@shared/leituraSocial";
import { taxaPorAlcance } from "@shared/engajamento";
import type { TipoConteudo } from "@shared/tipoDeMidia";

/** O que a peça precisa do `social.painel` — nada além disto. */
interface DadosDoPainel {
  organico?: { perfil: { name?: string | null; username: string | null } } | null;
  historico: {
    statusDaConta?: Array<{
      dia: string;
      seguidores: number | null;
      metricas: Record<string, number>;
    }> | null;
    midiasRecentes?: Array<{
      publicadoEm?: string | null; tipo?: string | null; produto?: string | null;
    }> | null;
  };
}

export function CabecalhoExecutivoSocial({ dados, cliente }: {
  dados: DadosDoPainel;
  cliente?: { accountName?: string | null; pictureUrl?: string | null };
}) {
  const janela = useMemo(() => dados.historico.statusDaConta ?? [], [dados]);

  /**
   * Ativações por DIA DE PUBLICAÇÃO, nunca por dia de coleta.
   *
   * `publicadoEm` e não `dia`. A coleta guarda as 25 mídias mais recentes
   * carimbadas com hoje, então agrupar por `dia` fazia toda conta exibir 25
   * publicações diárias — número plausível, estável e errado. A duplicação
   * desta linha aqui é justamente onde o erro voltaria calado.
   */
  const composicaoPorDia = useMemo(() => {
    const porDia = new Map<string, Partial<Record<TipoConteudo, number>>>();
    for (const m of dados.historico.midiasRecentes ?? []) {
      const publicado = (m.publicadoEm ?? "").slice(0, 10);
      if (!publicado || m.produto === "STORY") continue;
      const tipo = (m.tipo ?? "DESCONHECIDO") as TipoConteudo;
      const atual = porDia.get(publicado) ?? {};
      atual[tipo] = (atual[tipo] ?? 0) + 1;
      porDia.set(publicado, atual);
    }
    return porDia;
  }, [dados]);

  const totalPorDia = useMemo(() => {
    const total = new Map<string, number>();
    for (const [dia, tipos] of Array.from(composicaoPorDia.entries())) {
      total.set(dia, Object.values(tipos).reduce<number>((a, b) => a + (b ?? 0), 0));
    }
    return total;
  }, [composicaoPorDia]);

  const leitura = useMemo(() => {
    const dias: DiaDaLeitura[] = janela.slice(-7).map((p) => ({
      dia: p.dia,
      seguidores: p.seguidores,
      visitas: typeof p.metricas?.profile_views === "number" ? p.metricas.profile_views : null,
      interacoes: typeof p.metricas?.total_interactions === "number" ? p.metricas.total_interactions : null,
      // `|| null` e não `?? null`: zero ativações num dia é a mesma coisa que
      // não ter publicado, e a leitura não deve tratar isso como medição.
      ativacoes: totalPorDia.get(p.dia) || null,
    }));
    return lerUltimosDias(dias);
  }, [janela, totalPorDia]);

  const met = (p: (typeof janela)[number] | undefined, k: string): number | null =>
    p && typeof p.metricas?.[k] === "number" ? p.metricas[k] : null;

  const linhaDoDia = (
    p: (typeof janela)[number] | undefined, anterior: number | null,
  ): ValorDoDia[] => [
    { rotulo: "Ativações", natureza: "fluxo", cor: COR.ativacoes,
      valor: p ? totalPorDia.get(p.dia) ?? 0 : null },
    // Taxa, e não contagem: um dia com 3 posts e outro com 1 têm volumes
    // incomparáveis de interação.
    { rotulo: "Engajamento", natureza: "fluxo", formato: "percentual", cor: COR.engajamento,
      valor: taxaPorAlcance(met(p, "total_interactions"), met(p, "reach")) },
    { rotulo: "Visitas ao perfil", natureza: "fluxo", cor: COR.visitas,
      valor: met(p, "profile_views") },
    { rotulo: "Seguidores", natureza: "estoque", cor: COR.seguidores, valor: p?.seguidores ?? null,
      variacao: p?.seguidores != null && anterior != null ? p.seguidores - anterior : null },
  ];

  const ultimos = janela.slice(-2);
  const ontem = linhaDoDia(
    ultimos.length === 2 ? ultimos[0] : undefined, janela.slice(-3)[0]?.seguidores ?? null);
  const hoje = linhaDoDia(
    ultimos[ultimos.length - 1], ultimos.length === 2 ? ultimos[0].seguidores : null);

  const pontos = janela.map((p) => ({
    dia: p.dia,
    seguidores: p.seguidores,
    visitas: typeof p.metricas?.profile_views === "number" ? p.metricas.profile_views : null,
    porTipo: composicaoPorDia.get(p.dia) ?? {},
  }));

  return (
    <div className="flex flex-col gap-3.5">
      <IdentidadeDaConta
        nome={cliente?.accountName ?? dados.organico?.perfil.name ?? "Conta"}
        username={dados.organico?.perfil.username ?? null}
        rede="Instagram"
        foto={cliente?.pictureUrl ?? null} />

      {/* As três regiões são separadas por um traço de 1px, não por cartões:
          cartão separado faria delas blocos independentes, e o cabeçalho volta a
          parecer uma coleção de componentes em vez de UMA visão da conta. */}
      <section className="rounded-[20px] border border-border bg-card overflow-hidden
                          shadow-[0_1px_2px_rgba(10,10,10,.04)]">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1fr)_minmax(0,1.55fr)]
                        divide-y lg:divide-y-0 lg:divide-x divide-border">
          <div className="px-[22px] py-5"><ResumoCurto leitura={leitura} /></div>
          <div className="px-[22px] py-5">
            <Resultados ontem={ontem} hoje={hoje}
              aviso="O dia corrente é parcial. Seguidores é o total da conta." />
          </div>
          <div className="px-[22px] py-5">
            <GraficoDeEvolucao pontos={pontos} nota="últimos 30 dias" />
          </div>
        </div>
      </section>
    </div>
  );
}
