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
import { PeriodFilter, getPeriodLabel, usePeriodFilter } from "@/components/PeriodFilter";
import { lerVinculo, type StatusInsight, type TipoConta } from "@shared/instagram";
import { movimentoDaBase, somarNoPeriodo } from "@shared/socialSnapshot";
import { destaquesDoMovimento, movimentoDiario } from "@shared/movimentoDiario";
import { textoDeCobertura } from "@shared/periodosSociais";
import { coletasSaoComparaveis, rotuloDeFluxo } from "@shared/janelaDaMetrica";
import { composicaoDeAtivacoes, composicaoDetalhada, contarAtivacoes } from "@shared/ativacoes";
import { lerUltimosDias, type DiaDaLeitura } from "@shared/leituraSocial";
import { composicaoDoEngajamento, taxaPorAlcance } from "@shared/engajamento";
import { etiquetarDesempenho } from "@shared/desempenhoDaPublicacao";
import { ROTULO_CONTEUDO, type TipoConteudo } from "@shared/tipoDeMidia";
import { COR, COR_INTERACAO, COR_TIPO, ORDEM_TIPO } from "@shared/coresSociais";
import { compararComAnterior, variacao } from "@shared/periodoAnterior";
import { CartaoGeral, MetricaDoPerfil } from "@/components/redes/CartaoGeral";
import { PainelDaMetrica, type DiaDaMetrica } from "@/components/redes/PainelDaMetrica";
import { ABAS_SOCIAIS, ROTULO_ABA_SOCIAL, abaDaUrl, type AbaSocial } from "./social/abasSociais";
import { RetencaoReels } from "@/components/redes/RetencaoReels";
import {
  IdentidadeDaConta, Resultados, ResumoCurto, type ValorDoDia,
} from "@/components/redes/CabecalhoDaConta";
import {
  GraficoDaEvolucaoDaBase, GraficoDeAtivacoes, GraficoDeEvolucao, MiniEvolucao,
} from "@/components/redes/GraficosSociais";
import {
  MelhoresEPiores, PerformancePorPosicionamento, UltimasPublicacoes,
  type DesempenhoPorTipo, type PublicacaoEmLinha,
} from "@/components/redes/PublicacoesEConteudo";
import { AtivacoesDoPeriodo } from "@/components/redes/AtivacoesDoPeriodo";
import { DetalhamentoDeReels } from "@/components/redes/DetalhamentoDeReels";
import {
  Loader2, Settings2, Users, Heart, Eye, Layers, LayoutDashboard, Clapperboard,
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

/**
 * Um destaque do rodapé do movimento — pequeno e secundário, de propósito.
 *
 * Sem ícone e sem selo: são três números de apoio embaixo de dois gráficos, e
 * qualquer enfeite aqui os faria competir com o que eles apoiam. A cor é a
 * única coisa que carrega significado, e só quando há sinal — um "–" cinza não
 * finge ser resultado.
 */
function Destaque({ rotulo, valor, nota, cor }: {
  rotulo: string; valor: string; nota: string; cor?: string;
}) {
  const vazio = valor === "–";
  return (
    <div className="min-w-0">
      <span className="block text-[9px] font-bold uppercase tracking-[0.1em] text-muted-foreground/70 truncate">
        {rotulo}
      </span>
      <span className="block text-[15px] font-bold tabular-nums leading-none mt-1"
        style={vazio || !cor ? undefined : { color: cor }}>
        {vazio ? <span className="text-muted-foreground/40">–</span> : valor}
      </span>
      <span className="block text-[9px] text-muted-foreground/60 mt-0.5 truncate" title={nota}>
        {nota}
      </span>
    </div>
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
  /**
   * A aba nasce da URL para que um link possa apontar para ela.
   *
   * `abaDaUrl` traduz sinônimo e desconhecido, e nunca devolve tela vazia — a
   * mesma disciplina de `abasSite.ts`, e pelo mesmo motivo: alertas e
   * relatórios gravam destino em texto no banco.
   */
  const [aba, setAba] = useState<AbaSocial>(
    () => abaDaUrl(new URLSearchParams(window.location.search).get("aba")),
  );

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
   * A série longa — 70 dias, e SÓ para comparar com o período anterior.
   *
   * `janelaFixa` para em 30 dias porque é ela que desenha os gráficos, e essa
   * janela é decisão de leitura. Comparar 30 dias exige alcançar o dia −60, e
   * era exatamente por isso que as quatro métricas perdiam o selo ao mesmo
   * tempo quando alguém escolhia "Últimos 30d": o dado existia e não cabia no
   * recorte enviado. Nenhum gráfico lê esta série.
   */
  const serieLonga = useMemo(() => (d?.historico.serieParaVariacao ?? []), [d]);

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
    //
    // Da série LONGA, e não da de 30 dias: o selo de Ativações conta stories
    // junto com posts, e um período anterior com os posts e sem os stories
    // compararia cinco parcelas contra três — o selo mediria a mudança de
    // alcance da série em vez da mudança de produção.
    for (const p of (d?.historico.serieParaVariacao ?? [])) {
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

  /**
   * A composição diária DENTRO do período do filtro — o mini-gráfico do cartão.
   *
   * Precisa sair dos MESMOS insumos que `contarAtivacoes` usa, senão as barras
   * não somariam o número grande logo acima delas. Duas contagens da mesma
   * coisa na mesma caixa é o tipo de divergência que ninguém confere de cabeça
   * e todo mundo percebe.
   *
   * A seção "Ativações por dia" que existia antes desenhava a janela FIXA de 30
   * dias enquanto o cartão mostrava o período filtrado. Eram dois números certos
   * sobre janelas diferentes, lado a lado — e agora que os dois dividem um
   * cartão, isso teria virado erro visível.
   */
  const ativacoesNoPeriodo = useMemo(() => {
    const porDia = new Map<string, Partial<Record<TipoConteudo, number>>>();
    const somar = (dia: string, tipo: TipoConteudo, n: number) => {
      if (n <= 0) return;
      const atual = porDia.get(dia) ?? {};
      atual[tipo] = (atual[tipo] ?? 0) + n;
      porDia.set(dia, atual);
    };
    for (const m of midiasSalvas) {
      const publicado = (m.publicadoEm ?? "").slice(0, 10);
      // O mesmo recorte de `contarAtivacoes`: `publicadoEm` dentro da janela, e
      // STORY fora daqui porque tem contagem própria na série diária.
      if (!publicado || m.produto === "STORY") continue;
      if (publicado < dateRange.startDate || publicado > dateRange.endDate) continue;
      somar(publicado, (m.tipo ?? "DESCONHECIDO") as TipoConteudo, 1);
    }
    for (const p of serie) {
      if (typeof p.storiesVistos === "number") somar(p.dia, "STORY", p.storiesVistos);
    }
    return porDia;
  }, [midiasSalvas, serie, dateRange]);

  const pontosDeAtivacao = useMemo(() => serie.map((p) => ({
    dia: p.dia, seguidores: null, visitas: null,
    porTipo: ativacoesNoPeriodo.get(p.dia) ?? {},
  })), [serie, ativacoesNoPeriodo]);

  // ── Ontem × hoje ────────────────────────────────────────────────────────
  // As duas ÚLTIMAS COLETAS, sempre — o filtro de período não alcança aqui.
  const ultimos = janelaFixa.slice(-2);
  const met = (p: (typeof janelaFixa)[number] | undefined, k: string): number | null =>
    p && typeof p.metricas?.[k] === "number" ? p.metricas[k] : null;

  const linhaDoDia = (
    p: (typeof janelaFixa)[number] | undefined, anterior: number | null,
  ): ValorDoDia[] => [
    // O total já soma stories: `composicaoPorDia` os inclui como um tipo.
    // `cor` é o matiz da FAMÍLIA — o mesmo da linha no gráfico ao lado e do
    // cartão lá embaixo. Uma métrica com duas cores em duas alturas da mesma
    // página parece duas medições diferentes.
    { rotulo: "Ativações", natureza: "fluxo", cor: COR.ativacoes,
      valor: p ? ativacoesRecentesPorDia.get(p.dia) ?? 0 : null },
    // Taxa, e não contagem: um dia com 3 posts e outro com 1 têm volumes
    // incomparáveis de interação. A taxa sobre alcance compara os dois.
    { rotulo: "Engajamento", natureza: "fluxo", formato: "percentual", cor: COR.engajamento,
      valor: taxaPorAlcance(met(p, "total_interactions"), met(p, "reach")) },
    { rotulo: "Visitas ao perfil", natureza: "fluxo", cor: COR.visitas,
      valor: met(p, "profile_views") },
    { rotulo: "Seguidores", natureza: "estoque", cor: COR.seguidores, valor: p?.seguidores ?? null,
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
        // As parcelas vêm do snapshot como estão: `null` continua sendo "não
        // medido", e o cartão omite a parcela em vez de escrever zero.
        curtidas: m.likes,
        comentarios: m.comentarios,
        compartilhamentos: m.shares,
        salvamentos: m.saves,
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
   * A composição detalhada — as quatro fatias da rosca de Ativações.
   *
   * Sai do MESMO `contarAtivacoes` que alimenta o cartão do Resumo, e não de uma
   * contagem paralela: dois caminhos para o mesmo número acabam discordando no
   * primeiro ajuste feito só num deles, e aí a mesma conta publica 24 vezes numa
   * aba e 22 na outra.
   */
  const composicaoDoPeriodo = useMemo(() => composicaoDetalhada(ativacoes), [ativacoes]);
  const rotuloDoPeriodo = getPeriodLabel(period).toLowerCase();

  /**
   * Os Reels do período — a fonte das DUAS seções de Reels.
   *
   * Uma lista só para retenção e detalhamento: se cada seção filtrasse por
   * conta própria, bastaria um ajuste num dos filtros para a página afirmar
   * "4 Reels" em cima e listar 5 embaixo.
   *
   * `noPeriodo` já recorta por `publicadoEm` dentro da janela — o mesmo recorte
   * das publicações e das ativações, e por isso as duas seções seguem o filtro
   * de período sem exceção.
   */
  const reelsDoPeriodo = useMemo(
    () => noPeriodo.filter((m) => m.produto === "REELS" || m.produto === "CLIPS"),
    [noPeriodo]);

  /**
   * As etiquetas de desempenho.
   *
   * Calculadas sobre TODAS as publicações do período, e não sobre as oito que a
   * grade mostra: a mediana da conta é a régua, e medi-la só nas exibidas faria
   * a régua mudar com a rolagem.
   */
  const etiquetas = useMemo(
    () => etiquetarDesempenho(publicacoes.map((x) => ({
      id: x.id, taxa: x.taxa, alcance: x.alcance,
    }))),
    [publicacoes],
  );

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
   * A comparação vem de `serieLonga` — 70 dias, SEM filtro —, que é a única
   * fonte que alcança antes do período. Ela existe justamente porque a de 30
   * dias não alcançava: com "Últimos 30d" o período anterior caía inteiro fora
   * do recorte e as quatro métricas perdiam o selo ao mesmo tempo.
   *
   * `compararComAnterior` continua sendo quem decide se a comparação vale — e
   * ela se recusa quando os dois lados não têm o mesmo número de dias medidos.
   * Alargar o alcance não afrouxa a régua; só deixa de esconder dias que
   * existem. Nenhuma consulta nova: o dado já vem no painel.
   */
  const variacaoDe = (ler: (d: { dia: string; metricas: Record<string, number> }) => number | null,
    atual: number | null) => {
    const c = compararComAnterior(
      serieLonga.map((p) => ({ dia: p.dia, metricas: p.metricas })),
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
      serieLonga.map((p) => ({ dia: p.dia, metricas: {} })),
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
  /**
   * ─────────────────────────────────────────────────────────────────────────
   *  As mini-séries dos cartões — HISTÓRICO MÁXIMO, e não o período do filtro
   * ─────────────────────────────────────────────────────────────────────────
   *  Esta é a separação que o cartão passa a fazer, e ela é conceitual antes de
   *  ser visual:
   *
   *    o NÚMERO responde "quanto tivemos neste período"   → segue o filtro
   *    a LINHA  responde "como isso vem evoluindo"        → ignora o filtro
   *
   *  Com "Hoje" selecionado, uma linha de um ponto não é tendência — é a mesma
   *  informação do número, desenhada. A linha só serve se olhar mais longe que
   *  o recorte, e é por isso que ela lê `janelaFixa` (as últimas 30 coletas,
   *  sem filtro) enquanto o número lê `serie`.
   *
   *  `null` no dia sem medição, e não 0: a linha QUEBRA ali em vez de
   *  interpolar uma inclinação que ninguém mediu.
   * ─────────────────────────────────────────────────────────────────────────
   */
  const historicoDe = (k: string): DiaDaMetrica[] =>
    janelaFixa.map((p) => ({
      dia: p.dia,
      valor: typeof p.metricas?.[k] === "number" ? p.metricas[k] : null,
    }));
  const cliquesPorDia = historicoDe("website_clicks");
  const visitasPorDia = historicoDe("profile_views");
  const engajamentoPorDia = historicoDe("total_interactions");

  /**
   * A variação líquida por dia — a ÚNICA série do gráfico.
   *
   * Fonte exclusiva: `followers_count`, a fotografia do total. Nada de
   * `follower_count`, nada de `follows_and_unfollows`, nada de FOLLOWER ou
   * NON_FOLLOWER — o diagnóstico de 18/08/2026 refutou a hipótese de que aquele
   * breakdown descreva entradas e saídas, e a saída derivada de `follower_count`
   * nunca teve fonte independente que a sustentasse.
   *
   * `movimentoDiario` também confere que a soma das barras é a variação do
   * período mostrada no número grande ao lado. As duas coisas telescopam, e
   * `fecha` prova que nenhuma medição foi pulada entre uma conta e outra.
   */
  const variacaoDiaria = useMemo(
    () => movimentoDiario(serie.map((p) => ({ dia: p.dia, total: p.seguidores }))),
    [serie],
  );
  /**
   * As ativações do HISTÓRICO, para a mini-linha do cartão.
   *
   * `ativacoesRecentesPorDia` já cobre a janela fixa e agrupa por dia de
   * PUBLICAÇÃO — a mesma correção que impediu toda conta de exibir 25
   * publicações diárias. Um dia sem coleta fica `null`, e não zero: a conta
   * pode não ter publicado, mas também podemos não ter medido, e a linha não
   * decide isso sozinha.
   */
  const ativacoesHistorico: DiaDaMetrica[] = janelaFixa.map((p) => ({
    dia: p.dia,
    valor: ativacoesRecentesPorDia.has(p.dia) ? ativacoesRecentesPorDia.get(p.dia) ?? 0 : 0,
  }));

  /** Os três destaques do rodapé — as MESMAS variações que o gráfico desenha. */
  const destaques = useMemo(() => destaquesDoMovimento(variacaoDiaria), [variacaoDiaria]);

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

            {/* ══ ABAS ══════════════════════════════════════════════════════
                O cabeçalho executivo de três colunas (resumo · resultados ·
                evolução) saiu daqui para /rascunho por decisão de produto — não
                foi apagado, e continua montável a partir dos mesmos
                componentes. A IDENTIDADE já vive no topo da página, fora deste
                bloco, porque ela não pertence a aba nenhuma.

                As abas separam duas perguntas que a rolagem única misturava:
                "o que aconteceu" e "qual conteúdo explica isso". */}
            <div className="flex gap-1 border-b border-border">
              {ABAS_SOCIAIS.map((a) => (
                <button key={a} type="button" onClick={() => setAba(a)}
                  aria-current={aba === a ? "page" : undefined}
                  className={`px-4 py-2 text-sm transition-colors duration-150 border-b-2 -mb-px
                              flex items-center gap-1.5 ${
                    aba === a ? "border-accent text-accent font-medium"
                              : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                  {a === "home" ? <LayoutDashboard className="w-3.5 h-3.5" />
                                : <Clapperboard className="w-3.5 h-3.5" />}
                  {ROTULO_ABA_SOCIAL[a]}
                </button>
              ))}
            </div>

            {/* O filtro vale para as duas abas: com o cabeçalho executivo fora
                da página, não sobrou nada aqui que ignore o período. */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-[11px] text-muted-foreground/60">
                {aba === "home"
                  ? "Dados gerais e publicações seguem o período selecionado."
                  : "As análises de conteúdo seguem o período selecionado."}
              </p>
              <PeriodFilter period={period} onChange={setPeriod} />
            </div>

            {aba === "home" && (
            <>
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
                    {/* A antiga seção "Ativações por dia" tinha largura cheia
                        para responder uma pergunta que pertence a este cartão.
                        Ela virou o mini-gráfico aqui dentro, e o painel abre a
                        versão grande — com composição e hover — sem ocupar a
                        página quando ninguém pergunta. */}
                    <CartaoGeral icone={Layers} cor={COR.ativacoes} rotulo="Ativações"
                      /* O selo de variação é o gatilho: quem quer investigar mira
                         o número que chamou a atenção, e não um convite no rodapé. */
                      envolverSelo={(selo) => (
                        <PainelDaMetrica rotulo="Ativações" cor={COR.ativacoes}
                          dias={serie.map((p) => ({
                            dia: p.dia,
                            valor: ORDEM_TIPO.reduce(
                              (n, t) => n + (ativacoesNoPeriodo.get(p.dia)?.[t] ?? 0), 0),
                          }))}
                          total={ativacoes.total}
                          variacaoPct={varAtivacoes.pct} anterior={varAtivacoes.anterior}
                          procedencia={<>Posts e reels vêm da listagem de mídias, por
                            <span className="font-mono"> publicadoEm</span>. Stories vêm da contagem
                            diária — a coleta vê o que está no ar.</>}>
                          {selo}
                        </PainelDaMetrica>
                      )}
                      explicacao="Tudo que a conta publicou no período — posts, stories e reels."
                      valor={fmt(ativacoes.total)}
                      /* Duas visualizações, dois recortes, e é de propósito:
                         a barra é a composição do PERÍODO selecionado, a linha é
                         a evolução do HISTÓRICO. Elas não competem porque
                         respondem perguntas diferentes. */
                      grafico={<GraficoDeAtivacoes pontos={pontosDeAtivacao} altura={78} compacto />}
                      evolucao={<MiniEvolucao id="ativacoes" dias={ativacoesHistorico} cor={COR.ativacoes} unidade="ativações" />}
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
                      envolverSelo={(selo) => (
                        <PainelDaMetrica rotulo="Engajamento" cor={COR.engajamento}
                          dias={engajamentoPorDia} total={composicao.totalApresentado}
                          variacaoPct={varEngajamento.pct} anterior={varEngajamento.anterior}
                          procedencia={<>Total medido por
                            <span className="font-mono"> total_interactions</span>. A composição vem do
                            perfil, mesmo escopo do total.</>}>
                          {selo}
                        </PainelDaMetrica>
                      )}
                      explicacao="Total de interações medido pela Meta. As parcelas abaixo dizem de que ele é feito."
                      valor={fmt(composicao.totalApresentado)}
                      detalhe={taxa != null ? `${taxa.toFixed(1)}% do alcance` : null}
                      variacaoPct={varEngajamento.pct} anterior={varEngajamento.anterior}
                      parcelas={composicao.partes.map((x) => ({
                        rotulo: x.rotulo, valor: x.total, cor: COR_INTERACAO[x.chave] ?? COR.engajamento,
                      }))}
                      /* A série é o TOTAL de interações, e não a taxa: o número
                         grande do cartão é o total, e uma linha de percentual
                         subiria enquanto o total caísse — duas leituras opostas
                         no mesmo cartão. */
                      evolucao={<MiniEvolucao id="engajamento" dias={engajamentoPorDia} cor={COR.engajamento} unidade="engajamentos" />}
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
                          evolucao={<MiniEvolucao id="visitas" dias={visitasPorDia} cor={COR.visitas} altura={62} unidade="visitas" />}
                          ressalva={rotuloVisitas.resumo}
                          envolverSelo={(selo) => (
                            <PainelDaMetrica rotulo="Visitas ao perfil" cor={COR.visitas}
                              dias={visitasPorDia} total={visitas.total}
                              variacaoPct={varVisitas.pct} anterior={varVisitas.anterior}
                              seguidores={seguidoresAgora}
                              procedencia={<>Medidas por <span className="font-mono">profile_views</span>.
                                {rotuloVisitas.resumo ? ` ${rotuloVisitas.resumo}.` : ""}</>}>
                              {selo}
                            </PainelDaMetrica>
                          )} />
                        {/* Cliques não ganha cartão próprio: é o menor número da
                            faixa, e um cartão permanente daria a ele a mesma área
                            do engajamento. O detalhamento vem pelo selo. */}
                        <MetricaDoPerfil rotulo="Cliques no link" valor={fmt(cliques.total)}
                          variacaoPct={varCliques.pct} anterior={varCliques.anterior}
                          evolucao={<MiniEvolucao id="cliques" dias={cliquesPorDia} cor={COR.engajamento} altura={62} unidade="cliques" />}
                          envolverSelo={(selo) => (
                            <PainelDaMetrica rotulo="Cliques no link" cor={COR.visitas}
                              dias={cliquesPorDia} total={cliques.total}
                              variacaoPct={varCliques.pct} anterior={varCliques.anterior}
                              seguidores={seguidoresAgora}
                              procedencia={<>Cliques no link da bio, medidos por
                                <span className="font-mono"> website_clicks</span>. Não inclui links de story.</>}>
                              {selo}
                            </PainelDaMetrica>
                          )} />
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── DIREITA · movimento da base ───────────────────────────
                    ENTRARAM e SAÍRAM saíram daqui. O diagnóstico de 18/08/2026
                    refutou a hipótese de que FOLLOWER/NON_FOLLOWER fossem os
                    dois fluxos, e a saída que restava (`follower_count − saldo`)
                    nunca teve fonte independente que provasse ser saída. Dois
                    números grandes sem fonte, com cor e sinal, seriam lidos como
                    medição — e ninguém confere.

                    Ficou o que se mede de verdade: o total, a variação do
                    período e a variação de cada dia. */}
                <div className="min-w-0 px-[18px] py-[18px] flex flex-col gap-3.5">
                  <div className="flex items-baseline justify-between gap-2 flex-wrap">
                    <h2 className="text-[11px] font-bold uppercase tracking-[0.13em]">Movimento da base</h2>
                    <span className="text-[10.5px] text-muted-foreground/50">total e variação</span>
                  </div>

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

                  {/* Um gráfico só, e ele fica com a altura dos dois.
                      A curva já mostra onde a base subiu e onde caiu; as barras
                      de variação diária respondiam a mesma pergunta exigindo que
                      o olho somasse. Os extremos que elas davam de relance estão
                      logo abaixo, como números com data.

                      A largura do viewBox acompanha a coluna — manter 760 aqui
                      reduziria os rótulos do eixo a ~4,5px. */}
                  <div className="pt-3 border-t border-border">
                    <GraficoDaEvolucaoDaBase movimento={variacaoDiaria} altura={188} largura={352} />
                  </div>

                  {/* Os destaques: pequenos, e por isso mesmo os que erram
                      fácil — ninguém confere um número de 11px. Extremos só de
                      dias inteiros, e a média dividida por dias decorridos e não
                      por barras. Ver `destaquesDoMovimento`. */}
                  <div className="grid grid-cols-3 gap-2 pt-3 border-t border-border">
                    <Destaque rotulo="Maior alta" cor={COR.entrada}
                      valor={destaques.maiorAlta ? `+${fmt(destaques.maiorAlta.variacao)}` : "–"}
                      nota={destaques.maiorAlta
                        ? `${destaques.maiorAlta.dia.slice(8, 10)}/${destaques.maiorAlta.dia.slice(5, 7)}`
                        : "sem alta no período"} />
                    <Destaque rotulo="Maior queda" cor={COR.saida}
                      valor={destaques.maiorQueda ? `−${fmt(Math.abs(destaques.maiorQueda.variacao))}` : "–"}
                      nota={destaques.maiorQueda
                        ? `${destaques.maiorQueda.dia.slice(8, 10)}/${destaques.maiorQueda.dia.slice(5, 7)}`
                        : "sem queda no período"} />
                    <Destaque rotulo="Média diária"
                      cor={destaques.mediaDiaria == null ? undefined
                        : destaques.mediaDiaria > 0 ? COR.entrada
                        : destaques.mediaDiaria < 0 ? COR.saida : undefined}
                      valor={destaques.mediaDiaria == null
                        ? "–"
                        : `${destaques.mediaDiaria > 0 ? "+" : destaques.mediaDiaria < 0 ? "−" : ""}${
                            Math.abs(destaques.mediaDiaria).toFixed(1).replace(".", ",")}`}
                      nota={destaques.mediaDiaria == null
                        ? "amostra curta demais"
                        : `em ${destaques.diasDecorridos} dia(s)`} />
                  </div>

                  <div className="mt-auto flex flex-col gap-1 pt-3">
                    <p className="text-[9.5px] text-muted-foreground/60 leading-snug">
                      Calculado entre snapshots de{" "}
                      <span className="font-mono text-[9.5px]">followers_count</span>.
                    </p>
                    {/* A conferência que liga o gráfico ao número grande. Só
                        aparece quando NÃO fecha: falhando calada, ninguém
                        saberia que o gráfico parou de somar o total. */}
                    {variacaoDiaria.fecha === false && (
                      <p className="text-[9.5px] text-amber-600 leading-snug">
                        As barras somam {fmt(variacaoDiaria.soma)} e a variação do período é{" "}
                        {fmt(variacaoDiaria.variacaoDoPeriodo)} — alguma medição ficou de fora.
                      </p>
                    )}
                    {variacaoDiaria.diasComBuraco > 0 && (
                      <p className="text-[9.5px] text-muted-foreground/60 leading-snug">
                        {variacaoDiaria.diasComBuraco} trecho(s) da curva aparecem tracejados — houve
                        dia sem coleta, e ali a linha liga dois pontos reais por um caminho que
                        ninguém mediu.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </section>
            {!comparabilidade.comparavel && comparabilidade.motivo && (
              <p className="text-[10px] text-amber-600 leading-snug -mt-2">{comparabilidade.motivo}</p>
            )}

            {/* A seção "Ativações por dia" de largura cheia saiu daqui: ela
                ocupava a tela inteira para responder uma pergunta que pertence
                ao cartão de Ativações. O gráfico virou mini-gráfico dentro dele,
                e a versão grande abre no painel do cartão — mesmo dado, mesma
                interatividade, sem a seção. */}

            {/* ══ PUBLICAÇÕES DO PERÍODO ════════════════════════════════════ */}
            <UltimasPublicacoes
              instagram={publicacoes.slice(0, 8)}
              etiquetas={etiquetas}
              temLinkedin={false}
              aviso={publicacoesIndisponiveis
                ? "Não conseguimos ler as publicações nesta coleta."
                : "Nenhuma publicação medida no período."}
            />
            </>
            )}

            {aba === "conteudo" && (
            <>
            {/* ══ 1 · A ÁREA DE ANÁLISE DE CONTEÚDO ════════════════════════
                Uma caixa, duas colunas, e a esquerda com dois andares:

                  esquerda   ATIVAÇÕES          o que publicamos
                             POSICIONAMENTO     qual formato funcionou
                  direita    MELHORES → PIORES  o que funcionou, publicação a publicação

                Os três respondem a mesma pergunta em passos, e cada um estava a
                uma rolagem do outro. Comparar "publiquei 14 stories" com
                "stories rendem menos" exigia memória em vez de olhar.

                Uma caixa dividida por 1px, e não três cartões — mesma gramática
                da caixa executiva do Resumo. */}
            <section className="rounded-[20px] border border-border bg-card overflow-hidden
                                shadow-[0_1px_2px_rgba(10,10,10,.04)]">
              <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x
                              divide-border">
                {/* `min-w-0` obrigatório: sem ele o trilho do carrossel estica a
                    coluna em vez de rolar dentro dela, e a caixa inteira ganha
                    barra horizontal. */}
                <div className="flex flex-col min-w-0">
                  <AtivacoesDoPeriodo
                    composicao={composicaoDoPeriodo}
                    rotuloDoPeriodo={rotuloDoPeriodo}
                    diasSemStories={ativacoes.diasSemMedicaoDeStories} />
                  <PerformancePorPosicionamento porTipo={porTipo} />
                </div>
                <MelhoresEPiores
                  melhores={melhores}
                  piores={piores}
                  amostraPequena={publicacoes.length > 0 && publicacoes.length < 5}
                  aviso={publicacoes.length === 0
                    ? "O ranking precisa de alcance, que só o snapshot guarda — ele aparece depois da primeira coleta."
                    : null} />
              </div>
            </section>

            {/* ══ 2 · RETENÇÃO DOS REELS ══════════════════════════════════
                Depois da performance, e não antes: ela responde uma pergunta
                mais estreita — como os Reels seguram audiência — e abrir a aba
                por ela colocava o detalhe de um formato acima do panorama de
                todos.

                Só Reels: as duas métricas de retenção não existem para outro
                formato, e passar um post de feed aqui o mostraria eternamente
                "não medido" por uma pergunta que nunca lhe foi feita. */}
            <RetencaoReels houveColeta={serie.length > 0} reels={reelsDoPeriodo.map((m) => ({
              mediaId: m.mediaId,
              publicadoEm: m.publicadoEm,
              thumbnailUrl: m.thumbnailUrl ?? null,
              permalink: m.permalink,
              skipRate: m.skipRate ?? null,
              avgWatchTimeMs: m.avgWatchTimeMs ?? null,
              views: m.views,
              recusadas: (m.recusadasJson ?? {}) as Record<string, string>,
            }))} />

            {/* ══ 3 · DETALHAMENTO DOS REELS ══════════════════════════════ */}
            <DetalhamentoDeReels reels={reelsDoPeriodo.map((m) => ({
              mediaId: m.mediaId,
              publicadoEm: m.publicadoEm,
              /* A mesma preferência da grade de publicações: a URL viva primeiro,
                 a do snapshot como reserva. A do snapshot foi assinada no dia da
                 coleta e pode ter expirado. */
              thumbnailUrl: thumbAoVivo.get(m.mediaId) ?? m.thumbnailUrl ?? null,
              permalink: m.permalink,
              legenda: m.legenda ?? null,
              views: m.views,
              alcance: m.reach,
              interacoes: m.totalInteractions ?? null,
              curtidas: m.likes,
              comentarios: m.comentarios,
              compartilhamentos: m.shares,
              salvamentos: m.saves,
              skipRate: m.skipRate ?? null,
              avgWatchTimeMs: m.avgWatchTimeMs ?? null,
              recusadas: (m.recusadasJson ?? {}) as Record<string, string>,
            }))} />
            </>
            )}

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
