/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Social — a página por cliente
 * ─────────────────────────────────────────────────────────────────────────────
 *  Quatro níveis de informação, e a hierarquia é o produto desta versão:
 *
 *    CABEÇALHO      leitura do período + ontem × hoje + trajetória. É a área
 *                   mais importante e a única que responde sem rolar.
 *    SEGUIDORES     saldo, entradas e saídas — separados, porque "9.500 ↑" dá
 *                   impressão de crescimento contínuo mesmo numa base que
 *                   perde tanto quanto ganha.
 *    DADOS GERAIS   compacto. Ativações, engajamento, visitas, cliques.
 *    CONTEÚDO       publicações densas para escanear; performance para analisar.
 *
 *  ── O que saiu, e por quê ──────────────────────────────────────────────────
 *  A seção de MÍDIA PAGA foi removida: esta página é orgânica. Os números de
 *  campanha continuam existindo no sistema e vivem em Mídia — misturá-los aqui
 *  era o que a página anterior fazia, e produzia leituras em que investimento
 *  aparecia ao lado de alcance de perfil como se fossem da mesma natureza.
 *
 *  O bloco de status da coleta saiu do cabeçalho pelo mesmo motivo: "quando o
 *  robô rodou" é pergunta de quem cuida do robô, e ela ocupava a região onde a
 *  performance da conta deveria estar. A instrumentação continua inteira — em
 *  Conexões, junto de quem conserta.
 *
 *  ── Esta página não escreve nada ───────────────────────────────────────────
 *  Token, vínculo, diagnóstico e conexão vivem em Configurações → Conexões.
 *  Quando falta configuração, a página diz qual é e manda para lá — em vez de
 *  parecer quebrada por falta de um passo que tem dono.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { Link } from "wouter";
import { useMemo, useState } from "react";
import { MetaDashboardLayout } from "@/components/MetaDashboardLayout";
import { SemAcessoTracker } from "@/components/SemAcessoTracker";
import { useSelectedAccount } from "@/hooks/useSelectedAccount";
import { useAuth } from "@/_core/hooks/useAuth";
import { canManageContent } from "@shared/permissions";
import { trpc } from "@/lib/trpc";
import { PeriodFilter, usePeriodFilter } from "@/components/PeriodFilter";
import { lerVinculo, type StatusInsight, type TipoConta } from "@shared/instagram";
import { movimentoDaBase, movimentoPorDia, somarNoPeriodo } from "@shared/socialSnapshot";
import { textoDeCobertura } from "@shared/periodosSociais";
import { coletasSaoComparaveis, rotuloDeFluxo } from "@shared/janelaDaMetrica";
import { composicaoDeAtivacoes, contarAtivacoes } from "@shared/ativacoes";
import { lerUltimosDias, type DiaDaLeitura } from "@shared/leituraSocial";
import { composicaoDoEngajamento, taxaPorAlcance } from "@shared/engajamento";
import { ROTULO_CONTEUDO, type TipoConteudo } from "@shared/tipoDeMidia";
import { COR, COR_INTERACAO, COR_TIPO } from "@shared/coresSociais";
import { compararComAnterior, variacao } from "@shared/periodoAnterior";
import { CartaoGeral, MetricaDoPerfil } from "@/components/redes/CartaoGeral";
import { PainelDeCliques } from "@/components/redes/PainelDeCliques";
import { RetencaoReels } from "@/components/redes/RetencaoReels";
import {
  IdentidadeDaConta, Resultados, ResumoCurto, type ValorDoDia,
} from "@/components/redes/CabecalhoDaConta";
import {
  GraficoDeAtivacoes, GraficoDeEvolucao, GraficoDeMovimento,
} from "@/components/redes/GraficosSociais";
import {
  PerformanceDeConteudo, UltimasPublicacoes,
  type DesempenhoPorTipo, type PublicacaoEmLinha,
} from "@/components/redes/PublicacoesEConteudo";
import {
  Loader2, Settings2, Users, Heart, Eye, Layers,
} from "lucide-react";

const fmt = (n: number | null | undefined): string =>
  n == null ? "–" : n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });

/**
 * O cabeçalho de seção do protótipo: título em caixa alta com tracking largo, e
 * a dica ao lado em corpo miúdo — nunca embaixo. Embaixo, ela empurraria o
 * conteúdo e ganharia peso de subtítulo.
 */
function Secao({ titulo, dica, children }: {
  titulo: string; dica?: string; children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline gap-2.5 flex-wrap">
        <h2 className="text-[13px] font-bold uppercase tracking-[0.1em]">{titulo}</h2>
        {dica && <span className="text-[11px] text-muted-foreground/50">{dica}</span>}
      </div>
      {children}
    </section>
  );
}

/** Estado que pede AÇÃO, com o caminho — e sem cara de erro. */
function PrecisaDeConfiguracao({ titulo, detalhe, podeConfigurar }: {
  titulo: string; detalhe: string; podeConfigurar: boolean;
}) {
  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5 flex flex-col gap-2.5">
      <p className="text-sm font-semibold text-amber-700 dark:text-amber-500">{titulo}</p>
      <p className="text-xs text-muted-foreground whitespace-pre-wrap select-all">{detalhe}</p>
      {podeConfigurar && (
        <Link href="/settings?painel=conexoes">
          <span className="text-xs inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border hover:bg-muted cursor-pointer w-fit">
            <Settings2 className="w-3.5 h-3.5" /> Abrir Conexões → Social
          </span>
        </Link>
      )}
    </div>
  );
}

/**
 * Um número dos dados gerais.
 *
 * Compacto de propósito: esta faixa é referência, não destaque. Cards altos aqui
 * competiriam com o cabeçalho, que é onde a leitura acontece.
 */
function Geral({ icon: Icon, rotulo, valor, detalhe, partes, ressalva }: {
  icon: typeof Users; rotulo: string; valor: string;
  detalhe?: string | null;
  /** A composição do número. Linha de apoio, nunca competindo com o total. */
  partes?: string[];
  ressalva?: string | null;
}) {
  const vazio = valor === "–";
  return (
    <div className="flex flex-col gap-0.5 px-4 py-3 min-w-0">
      <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Icon className="w-3 h-3" /> {rotulo}
      </span>
      <span className={`text-2xl font-bold tabular-nums leading-tight ${vazio ? "text-muted-foreground/40" : "text-foreground"}`}>
        {valor}
      </span>
      {detalhe && <span className="text-[11px] text-muted-foreground truncate">{detalhe}</span>}
      {/* Quebra em várias linhas em vez de truncar: a composição que não cabe
          numa linha só é informação perdida, e ela existe justamente para
          explicar o número de cima. */}
      {partes && partes.length > 0 && (
        <span className="text-[10px] text-muted-foreground/80 leading-snug mt-0.5">
          {partes.join(" · ")}
        </span>
      )}
      {ressalva && <span className="text-[10px] text-muted-foreground/60 leading-snug">{ressalva}</span>}
    </div>
  );
}

export default function RedesSociais() {
  const { user } = useAuth();
  const podeVer = !!user;
  const podeDiagnosticar = canManageContent(user?.role);
  const { selectedAccountId, accounts } = useSelectedAccount();
  const { period, setPeriod, dateRange } = usePeriodFilter();

  const q = trpc.social.painel.useQuery(
    { accountId: selectedAccountId!, startDate: dateRange.startDate, endDate: dateRange.endDate },
    { enabled: podeVer && !!selectedAccountId, staleTime: 5 * 60 * 1000 },
  );

  const d = q.data;
  const organico = d?.organico ?? null;
  const serie = useMemo(() => d?.historico.serie ?? [], [d]);
  const midiasSalvas = useMemo(() => d?.historico.midias ?? [], [d]);

  // ── Derivações ──────────────────────────────────────────────────────────
  const hoje = new Date().toISOString().slice(0, 10);
  const cobertura = textoDeCobertura({ coletaDesde: d?.historico.coletaDesde ?? null, hoje });

  const mets = (p: (typeof serie)[number], k: string): number | null =>
    typeof p.metricas?.[k] === "number" ? p.metricas[k] : null;

  /**
   * Ativações por DIA DE PUBLICAÇÃO.
   *
   * `m.publicadoEm` e nunca `m.dia`: os dois existem na linha do snapshot e
   * significam coisas opostas — `dia` é o dia da COLETA. Como a coleta guarda
   * as 25 mídias mais recentes carimbadas com hoje, agrupar por `dia` fazia
   * toda conta exibir 25 publicações diárias. Número plausível, estável e
   * errado.
   */
  const ativacoesPorDia = useMemo(() => {
    const porDia = new Map<string, number>();
    for (const m of midiasSalvas) {
      const publicado = (m.publicadoEm ?? "").slice(0, 10);
      if (!publicado || m.produto === "STORY") continue;
      porDia.set(publicado, (porDia.get(publicado) ?? 0) + 1);
    }
    return porDia;
  }, [midiasSalvas]);

  /**
   * A janela do CABEÇALHO, independente do filtro de período.
   *
   * O cabeçalho é resumo executivo: ele responde "como a conta está AGORA", e
   * essa pergunta não muda quando alguém escolhe 30 dias para analisar o
   * conteúdo. `statusDaConta` são as últimas 30 coletas, sem filtro — é a
   * mesma lógica da referência, onde os resultados são de hoje e o gráfico é
   * dos últimos 30 dias.
   */
  const janelaFixa = useMemo(() => (d?.historico.statusDaConta ?? []), [d]);

  /**
   * A composição de cada dia, por tipo de conteúdo.
   *
   * A classificação vem do snapshot (`m.tipo`), gravada pelo coletor com
   * `tipoDeConteudo` — reclassificar aqui recriaria o erro que a função pura
   * existe para impedir. E o dia é o de PUBLICAÇÃO, nunca o da coleta: agrupar
   * pela coleta é o que fazia toda conta exibir 25 publicações diárias.
   */
  const composicaoPorDia = useMemo(() => {
    const porDia = new Map<string, Partial<Record<TipoConteudo, number>>>();
    const somar = (dia: string, tipo: TipoConteudo, n: number) => {
      if (n <= 0) return;
      const atual = porDia.get(dia) ?? {};
      atual[tipo] = (atual[tipo] ?? 0) + n;
      porDia.set(dia, atual);
    };
    for (const m of (d?.historico.midiasRecentes ?? [])) {
      const publicado = (m.publicadoEm ?? "").slice(0, 10);
      if (!publicado || m.produto === "STORY") continue;
      somar(publicado, (m.tipo ?? "DESCONHECIDO") as TipoConteudo, 1);
    }
    // Stories não vêm da listagem de mídias: eles são contados por dia na
    // série, porque a coleta lê o que está NO AR naquele momento.
    for (const p of (d?.historico.statusDaConta ?? [])) {
      somar(p.dia, "STORY", p.storiesVistos ?? 0);
    }
    return porDia;
  }, [d]);

  /** O total do dia — a altura da barra. */
  const ativacoesRecentesPorDia = useMemo(() => {
    const total = new Map<string, number>();
    for (const [dia, tipos] of Array.from(composicaoPorDia.entries())) {
      total.set(dia, Object.values(tipos).reduce((a, b) => a + (b ?? 0), 0));
    }
    return total;
  }, [composicaoPorDia]);

  const leitura = useMemo(() => {
    // Os últimos 7 dias COLETADOS, e não o período do filtro: o resumo mora no
    // cabeçalho e segue a mesma regra dele.
    const dias: DiaDaLeitura[] = janelaFixa.slice(-7).map((p) => ({
      dia: p.dia,
      seguidores: p.seguidores,
      visitas: typeof p.metricas?.profile_views === "number" ? p.metricas.profile_views : null,
      interacoes: typeof p.metricas?.total_interactions === "number" ? p.metricas.total_interactions : null,
      ativacoes: ativacoesRecentesPorDia.get(p.dia) || null,
    }));
    return lerUltimosDias(dias);
  }, [janelaFixa, ativacoesRecentesPorDia]);

  /**
   * Entradas e saídas SEM o breakdown ainda não provado.
   *
   * `follower_count` é métrica documentada da Meta — novos seguidores do dia,
   * contagem bruta — e o saldo sai da diferença entre duas fotografias. As
   * saídas caem por identidade, e a função devolve `null` quando a aritmética
   * não sustenta o resultado. Nada aqui usa FOLLOWER/NON_FOLLOWER.
   */
  const movimento = movimentoDaBase(
    serie.map((p) => ({ dia: p.dia, total: p.seguidores, follower: null, naoSeguidor: null })),
    serie.map((p) => mets(p, "follower_count")),
  );
  const seguidoresAgora = movimento.saldoAtual;

  const visitas = somarNoPeriodo("profile_views", serie);
  const cliques = somarNoPeriodo("website_clicks", serie);
  const interacoes = somarNoPeriodo("total_interactions", serie);
  const respostas = somarNoPeriodo("replies", serie);

  // A composição vem do PERFIL, mesmo escopo do total — somar as mídias cobriria
  // só as publicações do período, e a linha de apoio não fecharia o número que
  // está logo acima dela.
  /**
   * A composição do engajamento, agora com as respostas aos stories dentro.
   *
   * O total grande continua sendo `total_interactions`, MEDIDO pela Meta — e não
   * a soma das parcelas. Se a Meta já contar as respostas ali dentro, somá-las
   * ao total as contaria duas vezes; se não contar, o total ficaria abaixo da
   * soma. Nenhum dos dois se sabe hoje.
   *
   * `composicaoDoEngajamento` já resolve isso sozinha: ela CONFERE se as
   * parcelas fecham com o total e diz na tela quando não fecham. É a mesma
   * máquina que existia — a resposta de stories só entrou como mais uma parcela.
   */
  const composicao = composicaoDoEngajamento({
    likes: somarNoPeriodo("likes", serie).total,
    comments: somarNoPeriodo("comments", serie).total,
    shares: somarNoPeriodo("shares", serie).total,
    saves: somarNoPeriodo("saves", serie).total,
    replies: respostas.total,
  }, interacoes.total);
  const alcance = somarNoPeriodo("reach", serie);
  // A taxa é do número que está logo acima dela no cartão. Calculá-la sobre
  // outro total faria "389" e "16,8% do alcance" falarem de coisas diferentes.
  const taxa = taxaPorAlcance(composicao.totalApresentado, alcance.total);

  const publicacoesIndisponiveis =
    !!d?.historico.statusDaConta?.slice(-1)[0]?.midiasIndisponiveis;

  const ativacoes = useMemo(() => contarAtivacoes(
    midiasSalvas
      .filter((m) => m.produto !== "STORY")
      .map((m) => ({
        publicadoEm: (m.publicadoEm ?? "").slice(0, 10) || null,
        tipo: (m.tipo ?? "DESCONHECIDO") as TipoConteudo,
      })),
    serie.map((p) => ({ storiesVistos: p.storiesVistos })),
    { inicio: dateRange.startDate, fim: dateRange.endDate },
    { publicacoesIndisponiveis },
  ), [midiasSalvas, serie, dateRange, publicacoesIndisponiveis]);

  // ── Ontem × hoje ────────────────────────────────────────────────────────
  // As duas ÚLTIMAS COLETAS, sempre — o filtro de período não alcança aqui.
  const ultimos = janelaFixa.slice(-2);
  const met = (p: (typeof janelaFixa)[number] | undefined, k: string): number | null =>
    p && typeof p.metricas?.[k] === "number" ? p.metricas[k] : null;

  const linhaDoDia = (
    p: (typeof janelaFixa)[number] | undefined, anterior: number | null,
  ): ValorDoDia[] => [
    // O total já soma stories: `composicaoPorDia` os inclui como um tipo.
    { rotulo: "Ativações", natureza: "fluxo",
      valor: p ? ativacoesRecentesPorDia.get(p.dia) ?? 0 : null },
    // Taxa, e não contagem: um dia com 3 posts e outro com 1 têm volumes
    // incomparáveis de interação. A taxa sobre alcance compara os dois.
    { rotulo: "Engajamento", natureza: "fluxo", formato: "percentual",
      valor: taxaPorAlcance(met(p, "total_interactions"), met(p, "reach")) },
    { rotulo: "Visitas ao perfil", natureza: "fluxo", valor: met(p, "profile_views") },
    { rotulo: "Seguidores", natureza: "estoque", valor: p?.seguidores ?? null,
      variacao: p?.seguidores != null && anterior != null ? p.seguidores - anterior : null },
  ];
  const ontem = linhaDoDia(ultimos.length === 2 ? ultimos[0] : undefined, janelaFixa.slice(-3)[0]?.seguidores ?? null);
  const doDia = linhaDoDia(ultimos[ultimos.length - 1], ultimos.length === 2 ? ultimos[0].seguidores : null);

  const comparabilidade = coletasSaoComparaveis(
    serie.map((p) => ({ dia: p.dia, coletadoEm: p.coletadoEm as string | Date })));
  const rotuloVisitas = rotuloDeFluxo(
    "Visitas ao perfil", comparabilidade.faixa, visitas.diasMedidos, "as visitas acumuladas");

  // ── Publicações ─────────────────────────────────────────────────────────
  // A lista é a AMOSTRA (25 mídias). O que entra na tela é o que foi publicado
  // DENTRO do período — a mesma regra das ativações, pelo mesmo motivo.
  const noPeriodo = useMemo(() => midiasSalvas.filter((m) => {
    const publicado = (m.publicadoEm ?? "").slice(0, 10);
    return !!publicado && publicado >= dateRange.startDate && publicado <= dateRange.endDate;
  }), [midiasSalvas, dateRange]);

  /**
   * A miniatura vem de DUAS fontes, e a ordem importa.
   *
   * A leitura ao vivo (que já acontece no `painel`, sem chamada nova) traz a URL
   * do CDN recém-assinada. A do snapshot foi assinada no dia da coleta e pode já
   * ter expirado. Preferir a viva dá imagem imediata nas mais recentes; a
   * guardada cobre as publicações que saíram das 12 ao vivo.
   */
  const thumbAoVivo = useMemo(() => {
    const m = new Map<string, string>();
    for (const x of (organico?.midias ?? []) as Array<{ id?: string; thumbnailUrl?: string | null; mediaUrl?: string | null }>) {
      const url = x.thumbnailUrl || x.mediaUrl;
      if (x.id && url) m.set(String(x.id), url);
    }
    return m;
  }, [organico]);

  const publicacoes: PublicacaoEmLinha[] = useMemo(() => noPeriodo
    .filter((m) => m.produto !== "STORY")
    .map((m) => {
      const inter = m.totalInteractions ?? ((m.likes ?? 0) + (m.comentarios ?? 0) || null);
      return {
        id: m.mediaId,
        tipo: (m.tipo ?? "DESCONHECIDO") as TipoConteudo,
        quando: m.publicadoEm ?? null,
        thumb: thumbAoVivo.get(m.mediaId) ?? m.thumbnailUrl ?? null,
        permalink: m.permalink,
        legenda: m.legenda?.slice(0, 80) ?? null,
        alcance: m.reach,
        interacoes: inter,
        views: m.views ?? null,
        // Mesma função pura da taxa geral, e não uma divisão local: sem
        // alcance não há divisor, e `taxaPorAlcance` já devolve `null` nesse
        // caso — inventar um divisor faria a taxa de um post sem medição
        // competir no ranking com a de um post medido.
        taxa: taxaPorAlcance(inter, m.reach),
      };
    })
    .sort((a, b) => (b.quando ?? "").localeCompare(a.quando ?? "")), [noPeriodo, thumbAoVivo]);

  /**
   * As duas pontas do ranking.
   *
   * `piores` só existe quando há mais publicações que as duas pontas somadas —
   * com quatro medidas, três melhores e três piores repetiriam duas delas nas
   * duas listas, e a mesma publicação apareceria como melhor e como pior.
   */
  const { melhores, piores } = useMemo(() => {
    const comTaxa = publicacoes.filter((p) => p.taxa != null)
      .sort((a, b) => b.taxa! - a.taxa!);
    const n = Math.min(3, Math.floor(comTaxa.length / 2));
    return {
      melhores: comTaxa.slice(0, Math.min(3, comTaxa.length)),
      piores: comTaxa.length >= 4 ? comTaxa.slice(-n) : [],
    };
  }, [publicacoes]);

  /**
   * O selo de variação de cada card geral.
   *
   * A comparação vem de `janelaFixa` — as últimas 30 coletas, SEM filtro — que é
   * a única fonte que alcança antes do período. Para 7 dias sobra folga; para 30
   * não cabe, e aí a variação é `null` e o card não mostra selo. Nenhuma consulta
   * nova: o dado já vem no painel.
   */
  const variacaoDe = (ler: (d: { dia: string; metricas: Record<string, number> }) => number | null,
    atual: number | null) => {
    const c = compararComAnterior(
      janelaFixa.map((p) => ({ dia: p.dia, metricas: p.metricas })),
      { inicio: dateRange.startDate, fim: dateRange.endDate }, ler);
    return { pct: variacao(atual, c), anterior: c.anterior };
  };
  const met2 = (k: string) => (d: { metricas: Record<string, number> }) =>
    typeof d.metricas?.[k] === "number" ? d.metricas[k] : null;

  /**
   * A variação compara os dois períodos na MESMA base.
   *
   * Quando está provado que as respostas ficaram de fora de
   * `total_interactions`, o número exibido as inclui — e o período anterior
   * precisa incluí-las também, senão o selo mede a mudança de critério em vez
   * da mudança de engajamento. Se o dia anterior não mediu respostas, a leitura
   * devolve `null` e a comparação se recusa: melhor sem selo do que com um selo
   * que compara cinco parcelas contra quatro.
   */
  const lerEngajamento = composicao.respostasNoTotal === false
    ? (dia: { metricas: Record<string, number> }) => {
        const t = met2("total_interactions")(dia);
        const r = met2("replies")(dia);
        return t == null || r == null ? null : t + r;
      }
    : met2("total_interactions");
  const varEngajamento = variacaoDe(lerEngajamento, composicao.totalApresentado);
  const varVisitas     = variacaoDe(met2("profile_views"), visitas.total);
  const varCliques     = variacaoDe(met2("website_clicks"), cliques.total);
  const varAtivacoes   = (() => {
    const c = compararComAnterior(
      janelaFixa.map((p) => ({ dia: p.dia, metricas: {} })),
      { inicio: dateRange.startDate, fim: dateRange.endDate },
      (d) => ativacoesRecentesPorDia.get(d.dia) ?? null);
    return { pct: variacao(ativacoes.total, c), anterior: c.anterior };
  })();

  const porTipo: DesempenhoPorTipo[] = useMemo(() => {
    const grupos = new Map<TipoConteudo, PublicacaoEmLinha[]>();
    for (const p of publicacoes) grupos.set(p.tipo, [...(grupos.get(p.tipo) ?? []), p]);
    const media = (xs: Array<number | null>) => {
      const v = xs.filter((x): x is number => x != null);
      return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
    };
    return Array.from(grupos.entries())
      .map(([tipo, ps]) => ({
        tipo, rotulo: ROTULO_CONTEUDO[tipo], publicacoes: ps.length,
        alcanceMedio: media(ps.map((p) => p.alcance)),
        taxaMedia: media(ps.map((p) => p.taxa)),
      }))
      .sort((a, b) => (b.alcanceMedio ?? -1) - (a.alcanceMedio ?? -1));
  }, [publicacoes]);

  // ── Gráficos ────────────────────────────────────────────────────────────
  const pontosDaConta = janelaFixa.map((p) => ({
    dia: p.dia,
    seguidores: p.seguidores,
    visitas: typeof p.metricas?.profile_views === "number" ? p.metricas.profile_views : null,
    porTipo: composicaoPorDia.get(p.dia) ?? {},
  }));

  /**
   * A série diária de cliques — só para o painel contextual.
   *
   * Segue o filtro, como todo bloco abaixo do cabeçalho. `null` no dia sem
   * medição, e não 0: a mini-série quebra a linha ali em vez de interpolar uma
   * inclinação que ninguém mediu.
   */
  const cliquesPorDia = serie.map((p) => ({ dia: p.dia, cliques: mets(p, "website_clicks") }));

  // O gráfico de movimento segue o FILTRO: ele é análise, não resumo.
  //
  // `saldo` é a variação MEDIDA do total, e é ela que a linha roxa desenha — não
  // o estoque de seguidores. Plotar o estoque foi o erro que fazia +2 entradas e
  // −2 saídas parecerem crescimento.
  const pontosDeMovimento = movimentoPorDia(serie.map((p) => ({
    dia: p.dia, total: p.seguidores, novos: mets(p, "follower_count"),
  }))).map((m) => ({ dia: m.dia, entradas: m.entradas, saidas: m.saidas, saldo: m.saldo }));

  const leituraDoVinculo = organico
    ? lerVinculo({
        estado: "VINCULADO",
        tipoConta: organico.perfil.tipoConta as TipoConta,
        statusInsight: organico.insights.statusInsight as StatusInsight,
        username: organico.perfil.username,
        pageName: d?.vinculo?.pageName,
      })
    : null;

  if (!podeVer) {
    return <SemAcessoTracker title="Social" message="Entre com sua conta para ver o social dos clientes." />;
  }

  const cliente = accounts?.find((a: { id: number }) => a.id === selectedAccountId);

  return (
    <MetaDashboardLayout title="Social">
      {/* Espaçamento do protótipo: 34px entre seções, 28/24 de respiro. */}
      <div className="flex flex-col gap-[34px] px-6 pt-7 pb-24 max-w-[1320px] mx-auto">
        <IdentidadeDaConta
          nome={cliente?.accountName ?? "Social"}
          username={organico?.perfil.username ?? null}
          rede="Instagram"
          foto={(cliente as { pictureUrl?: string | null } | undefined)?.pictureUrl ?? null}
          saude={leituraDoVinculo ? {
            rotulo: leituraDoVinculo.nivel === "ok" ? "Conectado" : leituraDoVinculo.titulo,
            nivel: leituraDoVinculo.nivel === "erro" ? "erro"
                 : leituraDoVinculo.nivel === "ok" ? "ok" : "atencao",
          } : null}
        />

        {!selectedAccountId && (
          <div className="rounded-xl border border-border bg-card p-8 text-center">
            <h2 className="text-lg font-semibold text-foreground">Selecione um cliente</h2>
            <p className="text-sm text-muted-foreground mt-1">Escolha uma conta no menu para ver o social dela.</p>
          </div>
        )}

        {selectedAccountId && q.isLoading && (
          <div className="flex items-center justify-center h-64 text-muted-foreground gap-2">
            <Loader2 className="w-5 h-5 animate-spin" /> Carregando…
          </div>
        )}

        {q.error && (
          <PrecisaDeConfiguracao titulo="Não foi possível carregar" detalhe={q.error.message} podeConfigurar={podeDiagnosticar} />
        )}

        {d && !organico && d.erro && (
          <PrecisaDeConfiguracao
            titulo={d.fonte.usada ? "Instagram ainda não disponível" : d.fonte.titulo}
            detalhe={d.erro}
            podeConfigurar={podeDiagnosticar}
          />
        )}

        {organico && leituraDoVinculo && (
          <>
            {/* Conta pessoal e Business-sem-permissão são estados VÁLIDOS: azul,
                com explicação, nunca vermelho. Ver shared/instagram. */}
            {leituraDoVinculo.nivel !== "ok" && (
              <div className={`rounded-xl border p-4 flex flex-col gap-1.5 ${
                leituraDoVinculo.nivel === "erro" ? "border-destructive/30 bg-destructive/5"
                : leituraDoVinculo.nivel === "limitado" ? "border-sky-500/30 bg-sky-500/5"
                : "border-amber-500/30 bg-amber-500/5"}`}>
                <p className="text-sm font-medium text-foreground">{leituraDoVinculo.titulo}</p>
                <p className="text-xs text-muted-foreground">{leituraDoVinculo.explicacao}</p>
              </div>
            )}

            {/* ══ HEADER · uma caixa, 3 colunas, 0.92fr / 1fr / 1.55fr ══════
                O gráfico é a coluna larga porque é a única que ganha com espaço:
                resumo e resultados têm tamanho natural, e esticá-los só
                afastaria as palavras. As divisórias são traços de 1px, não
                cartões — cartão separado faria delas blocos independentes. */}
            <section className="rounded-[20px] border border-border bg-card overflow-hidden
                                shadow-[0_1px_2px_rgba(10,10,10,.04)]">
              <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1fr)_minmax(0,1.55fr)]
                              divide-y lg:divide-y-0 lg:divide-x divide-border">
                <div className="px-[22px] py-5"><ResumoCurto leitura={leitura} /></div>
                <div className="px-[22px] py-5">
                  <Resultados ontem={ontem} hoje={doDia}
                    aviso="O dia corrente é parcial. Seguidores é o total da conta." />
                </div>
                <div className="px-[22px] py-5">
                  <GraficoDeEvolucao pontos={pontosDaConta} nota="últimos 30 dias" />
                </div>
              </div>
            </section>

            {/* O filtro fica DEPOIS do cabeçalho porque não vale para ele: o
                cabeçalho é resumo executivo e mostra sempre hoje × ontem. */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-[11px] text-muted-foreground/60">
                Os blocos abaixo seguem o período selecionado.
              </p>
              <PeriodFilter period={period} onChange={setPeriod} />
            </div>

            {/* ══ CAIXA EXECUTIVA · dados gerais + movimento da base ════════
                Os dois eram seções irmãs, empilhadas, e juntas ocupavam a tela
                inteira antes da primeira publicação aparecer. Eles respondem a
                mesma pergunta — "como está a conta neste período" — e separá-los
                obrigava a rolar para completar uma leitura só.

                Uma caixa, duas regiões divididas por 1px: mesma gramática do
                cabeçalho da conta logo acima, onde resumo, resultados e gráfico
                também dividem uma borda em vez de virarem três cartões. */}
            <section className="rounded-[20px] border border-border bg-card overflow-hidden
                                shadow-[0_1px_2px_rgba(10,10,10,.04)]">
              <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,376px)]
                              divide-y lg:divide-y-0 lg:divide-x divide-border">

                {/* ── ESQUERDA · dados gerais ─────────────────────────────── */}
                <div className="min-w-0 flex flex-col">
                  <div className="flex items-baseline gap-2.5 flex-wrap px-[18px] pt-[18px]">
                    <h2 className="text-[11px] font-bold uppercase tracking-[0.13em]">Dados gerais</h2>
                    <span className="text-[10.5px] text-muted-foreground/50">
                      todo número mantém a composição visível
                    </span>
                  </div>
                  {/* Bordas explícitas em vez de `divide-x`: o cartão do perfil
                      ocupa as duas colunas, e o `divide-x` lhe daria uma borda
                      esquerda na quina da caixa — um traço vertical sem nada do
                      outro lado. */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 mt-2 flex-1">
                    <CartaoGeral icone={Layers} cor={COR.ativacoes} rotulo="Ativações"
                      explicacao="Tudo que a conta publicou no período — posts, stories e reels."
                      valor={fmt(ativacoes.total)}
                      variacaoPct={varAtivacoes.pct} anterior={varAtivacoes.anterior}
                      parcelas={composicaoDeAtivacoes(ativacoes).map((x) => ({
                        rotulo: x.rotulo, valor: x.total ?? 0,
                        cor: x.rotulo === "posts" ? COR_TIPO.FEED
                           : x.rotulo === "stories" ? COR_TIPO.STORY : COR_TIPO.REELS,
                      }))}
                      ressalva={ativacoes.publicacoesIndisponiveis
                        ? "publicações indisponíveis nesta coleta"
                        : ativacoes.diasSemMedicaoDeStories > 0
                          ? `${ativacoes.diasSemMedicaoDeStories} dia(s) sem medição de stories`
                          : null} />

                    <div className="border-t sm:border-t-0 sm:border-l border-border flex">
                    <CartaoGeral icone={Heart} cor={COR.engajamento} rotulo="Engajamento"
                      explicacao="Total de interações medido pela Meta. As parcelas abaixo dizem de que ele é feito."
                      valor={fmt(composicao.totalApresentado)}
                      detalhe={taxa != null ? `${taxa.toFixed(1)}% do alcance` : null}
                      variacaoPct={varEngajamento.pct} anterior={varEngajamento.anterior}
                      parcelas={composicao.partes.map((x) => ({
                        rotulo: x.rotulo, valor: x.total, cor: COR_INTERACAO[x.chave] ?? COR.engajamento,
                      }))}
                      ressalva={composicao.ressalva} />
                    </div>

                    {/* Visitas e cliques num cartão só: são duas ações sobre o
                        PERFIL, e ficavam soltas entre métricas de conteúdo. Os
                        dois números continuam separados — somá-los criaria uma
                        métrica que ninguém mede. */}
                    <div className="sm:col-span-2 border-t border-border flex flex-col px-4 py-4 min-w-0
                                    transition-colors duration-150 hover:bg-foreground/[0.02]">
                      <div className="flex items-center gap-2.5 mb-3">
                        <span className="w-8 h-8 rounded-[10px] grid place-items-center flex-shrink-0"
                          style={{ background: `${COR.visitas}29`, color: COR.visitas }}>
                          <Eye className="w-4 h-4" strokeWidth={2.2} />
                        </span>
                        <span className="text-[10px] font-semibold uppercase tracking-[0.13em] text-muted-foreground"
                          title="Duas ações sobre o perfil. Os números NÃO se somam: uma visita e um clique são coisas diferentes.">
                          Interações com o perfil
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-5">
                        <MetricaDoPerfil rotulo="Visitas ao perfil" valor={fmt(visitas.total)}
                          variacaoPct={varVisitas.pct} anterior={varVisitas.anterior}
                          ressalva={rotuloVisitas.resumo} />
                        {/* Cliques abre o painel contextual em vez de ganhar um
                            cartão próprio: é o menor número da faixa, e um
                            cartão permanente daria a ele a área do engajamento. */}
                        <PainelDeCliques dias={cliquesPorDia} total={cliques.total}
                          variacaoPct={varCliques.pct} anterior={varCliques.anterior}
                          motivoSemComparacao={comparabilidade.motivo}
                          seguidores={seguidoresAgora}>
                          <button type="button" className="text-left min-w-0 rounded-md
                                             transition-colors duration-150 hover:bg-foreground/[0.04]
                                             focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                            <MetricaDoPerfil rotulo="Cliques no link" valor={fmt(cliques.total)}
                              variacaoPct={varCliques.pct} anterior={varCliques.anterior}
                              acao="ver evolução" />
                          </button>
                        </PainelDeCliques>
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── DIREITA · movimento da base, compacto ────────────────── */}
                <div className="min-w-0 px-[18px] py-[18px] flex flex-col gap-3.5">
                  <div className="flex items-baseline justify-between gap-2 flex-wrap">
                    <h2 className="text-[11px] font-bold uppercase tracking-[0.13em]">Movimento da base</h2>
                    <span className="text-[10.5px] text-muted-foreground/50">entrou, saiu, saldo</span>
                  </div>

                  {/* Saldo atual e as duas pontas na MESMA linha de leitura: o
                      resumo inteiro tem de caber num relance, e é isso que o
                      torna resumo em vez de seção. */}
                  <div className="flex items-end justify-between gap-3 flex-wrap">
                    <div>
                      <span className="block text-[9.5px] font-bold uppercase tracking-[0.13em] text-muted-foreground/70">
                        Saldo atual
                      </span>
                      <span className="block text-[30px] font-bold tabular-nums leading-none tracking-tight mt-1">
                        {fmt(movimento.saldoAtual)}
                      </span>
                    </div>
                    {movimento.saldo != null && (
                      <span className="text-[11px] text-muted-foreground pb-0.5">
                        <span className={movimento.saldo >= 0
                          ? "text-emerald-600 font-bold"
                          : "text-destructive font-bold"}>
                          {movimento.saldo > 0 ? "+" : ""}{fmt(movimento.saldo)}
                        </span> no período
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-3 border-t border-border">
                    <div>
                      <span className="block text-[9.5px] font-bold uppercase tracking-[0.13em]"
                        style={{ color: COR.entrada }}>Entraram</span>
                      <span className="block text-[20px] font-bold tabular-nums leading-none mt-1"
                        style={{ color: COR.entrada }}>
                        {movimento.entradas == null ? "–" : `+${fmt(movimento.entradas)}`}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[9.5px] font-bold uppercase tracking-[0.13em]"
                        style={{ color: COR.saida }}>Saíram</span>
                      <span className="block text-[20px] font-bold tabular-nums leading-none mt-1"
                        style={{ color: COR.saida }}>
                        {movimento.saidas == null ? "–" : `−${fmt(movimento.saidas)}`}
                      </span>
                    </div>
                  </div>

                  {/* A largura do viewBox acompanha a coluna. Manter 760 aqui
                      encolheria os rótulos do eixo para ~4,5px — a compactação
                      viraria ilegibilidade, que é o oposto do pedido. */}
                  <GraficoDeMovimento pontos={pontosDeMovimento} altura={148} largura={352} />

                  <p className="text-[9.5px] text-muted-foreground/60 leading-snug mt-auto">
                    {movimento.motivo ?? (
                      <>Entradas vêm de <span className="font-mono text-[9.5px]">follower_count</span>. Saídas são
                      derivadas: entradas menos o saldo.</>
                    )}
                  </p>
                </div>
              </div>
            </section>
            {!comparabilidade.comparavel && comparabilidade.motivo && (
              <p className="text-[10px] text-amber-600 leading-snug -mt-2">{comparabilidade.motivo}</p>
            )}

            {/* ══ ATIVAÇÕES POR DIA · seção própria, largura cheia ══════════ */}
            <Secao titulo="Ativações por dia">
              <div className="rounded-[20px] border border-border bg-card px-5 py-[18px]
                              shadow-[0_1px_2px_rgba(10,10,10,.04)]">
                <GraficoDeAtivacoes pontos={pontosDaConta} />
              </div>
            </Secao>

            {/* ══ ÚLTIMAS PUBLICAÇÕES ══════════════════════════════════════ */}
            <UltimasPublicacoes
              instagram={publicacoes.slice(0, 8)}
              temLinkedin={false}
              aviso={publicacoesIndisponiveis
                ? "Não conseguimos ler as publicações nesta coleta."
                : "Nenhuma publicação medida no período."}
            />

            {/* ══ RETENÇÃO DOS REELS ═══════════════════════════════════════ */}
            {/* Só Reels: as duas métricas de retenção não existem para outro
                formato, e passar um post de feed aqui o mostraria eternamente
                "não medido" por uma pergunta que nunca lhe foi feita. */}
            <RetencaoReels houveColeta={serie.length > 0} reels={midiasSalvas
              .filter((m) => m.produto === "REELS" || m.produto === "CLIPS")
              .map((m) => ({
                mediaId: m.mediaId,
                publicadoEm: m.publicadoEm,
                thumbnailUrl: m.thumbnailUrl ?? null,
                permalink: m.permalink,
                skipRate: m.skipRate ?? null,
                avgWatchTimeMs: m.avgWatchTimeMs ?? null,
                views: m.views,
                recusadas: (m.recusadasJson ?? {}) as Record<string, string>,
              }))} />

            {/* ══ PERFORMANCE POR TIPO · 4 colunas ═════════════════════════ */}
            {/* ══ MELHORES → PIORES · largura cheia ════════════════════════ */}
            <PerformanceDeConteudo
              melhores={melhores}
              piores={piores}
              porTipo={porTipo}
              amostraPequena={publicacoes.length > 0 && publicacoes.length < 5}
              aviso={publicacoes.length === 0
                ? "O ranking precisa de alcance, que só o snapshot guarda — ele aparece depois da primeira coleta."
                : null}
            />

            <p className="text-[10px] text-muted-foreground/70">
              Orgânico do Instagram. Números de campanha ficam em Mídia. Conexão, token e vínculo,
              em Configurações → Conexões → Social.
            </p>
          </>
        )}
      </div>
    </MetaDashboardLayout>
  );
}
