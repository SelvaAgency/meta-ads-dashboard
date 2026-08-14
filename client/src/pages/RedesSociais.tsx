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
import { movimentoDaBase, somarNoPeriodo } from "@shared/socialSnapshot";
import { textoDeCobertura } from "@shared/periodosSociais";
import { coletasSaoComparaveis, rotuloDeFluxo } from "@shared/janelaDaMetrica";
import { contarAtivacoes, textoDaComposicao } from "@shared/ativacoes";
import { lerUltimosDias, type DiaDaLeitura } from "@shared/leituraSocial";
import { taxaPorAlcance } from "@shared/engajamento";
import { ROTULO_CONTEUDO, type TipoConteudo } from "@shared/tipoDeMidia";
import {
  IdentidadeDaConta, Resultados, ResumoCurto, type ValorDoDia,
} from "@/components/redes/CabecalhoDaConta";
import { GraficoDaConta, GraficoDeMovimento } from "@/components/redes/GraficoDaConta";
import {
  PerformanceDeConteudo, UltimasPublicacoes,
  type DesempenhoPorTipo, type PublicacaoEmLinha,
} from "@/components/redes/PublicacoesEConteudo";
import {
  Loader2, Settings2, Users, Heart, Eye, MousePointerClick, Layers,
  MessageCircle, Image as ImageIcon, Clapperboard,
} from "lucide-react";

const fmt = (n: number | null | undefined): string =>
  n == null ? "–" : n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });

/** Uma parcela das ativações pelo rótulo. `null` quando ela não foi medida. */
const parcela = (a: { parcelas: Array<{ rotulo: string; total: number }> }, rotulo: string): number | null =>
  a.parcelas.find((p) => p.rotulo === rotulo)?.total ?? null;

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
function Geral({ icon: Icon, rotulo, valor, detalhe, ressalva }: {
  icon: typeof Users; rotulo: string; valor: string; detalhe?: string | null; ressalva?: string | null;
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

  const leitura = useMemo(() => {
    const dias: DiaDaLeitura[] = serie.map((p) => ({
      dia: p.dia,
      seguidores: p.seguidores,
      visitas: mets(p, "profile_views"),
      interacoes: mets(p, "total_interactions"),
      ativacoes: (ativacoesPorDia.get(p.dia) ?? 0) + (p.storiesVistos ?? 0) || null,
    }));
    return lerUltimosDias(dias);
  }, [serie, ativacoesPorDia]);

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
  const alcance = somarNoPeriodo("reach", serie);
  const taxa = taxaPorAlcance(interacoes.total, alcance.total);

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
  const ultimos = serie.slice(-2);
  const linhaDoDia = (p: (typeof serie)[number] | undefined, anterior: number | null): ValorDoDia[] => [
    { rotulo: "Ativações", natureza: "fluxo",
      valor: p ? (ativacoesPorDia.get(p.dia) ?? 0) + (p.storiesVistos ?? 0) : null },
    // Taxa, e não contagem: um dia com 3 posts e outro com 1 têm volumes
    // incomparáveis de interação. A taxa sobre alcance compara os dois.
    { rotulo: "Engajamento", natureza: "fluxo", formato: "percentual",
      valor: p ? taxaPorAlcance(mets(p, "total_interactions"), mets(p, "reach")) : null },
    { rotulo: "Visitas ao perfil", natureza: "fluxo", valor: p ? mets(p, "profile_views") : null },
    { rotulo: "Seguidores", natureza: "estoque", valor: p?.seguidores ?? null,
      variacao: p?.seguidores != null && anterior != null ? p.seguidores - anterior : null },
  ];
  const ontem = linhaDoDia(ultimos.length === 2 ? ultimos[0] : undefined, serie.slice(-3)[0]?.seguidores ?? null);
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
        // Mesma função pura da taxa geral, e não uma divisão local: sem
        // alcance não há divisor, e `taxaPorAlcance` já devolve `null` nesse
        // caso — inventar um divisor faria a taxa de um post sem medição
        // competir no ranking com a de um post medido.
        taxa: taxaPorAlcance(inter, m.reach),
      };
    })
    .sort((a, b) => (b.quando ?? "").localeCompare(a.quando ?? "")), [noPeriodo, thumbAoVivo]);

  const melhores = useMemo(
    () => publicacoes.filter((p) => p.taxa != null).sort((a, b) => b.taxa! - a.taxa!).slice(0, 3),
    [publicacoes]);

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
  const pontosDaConta = serie.map((p) => ({
    dia: p.dia,
    seguidores: p.seguidores,
    visitas: mets(p, "profile_views"),
    ativacoes: (ativacoesPorDia.get(p.dia) ?? 0) + (p.storiesVistos ?? 0) || null,
  }));
  const pontosDeMovimento = serie.map((p) => ({
    dia: p.dia, total: p.seguidores, entradas: null, saidas: null,
  }));

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
      <div className="flex flex-col gap-6 p-4 md:p-6">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <IdentidadeDaConta
            nome={cliente?.accountName ?? "Social"}
            username={organico?.perfil.username ?? null}
            rede="Instagram"
          />
          <PeriodFilter period={period} onChange={setPeriod} />
        </div>

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

            {/* ── ACCOUNT HEADER ───────────────────────────────────────────
                Uma caixa, uma linha, três colunas — o molde da referência.
                A largura é o que carrega a hierarquia: resumo estreito,
                resultados no meio, gráfico com a maior área. Divisórias
                verticais finas em vez de três cartões: cartão separado faria
                deles blocos independentes, e a referência é UM bloco. */}
            <section className="rounded-2xl border border-border bg-card overflow-hidden">
              <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)_minmax(0,1.6fr)]
                              divide-y lg:divide-y-0 lg:divide-x divide-border/60">
                <div className="p-5 min-w-0">
                  <ResumoCurto leitura={leitura} />
                </div>
                <div className="p-5 min-w-0">
                  <Resultados ontem={ontem} hoje={doDia}
                    aviso="O dia corrente é parcial. Seguidores é o total da conta." />
                </div>
                <div className="p-5 min-w-0">
                  <GraficoDaConta pontos={pontosDaConta} nota={cobertura} />
                </div>
              </div>
            </section>

            {/* ── DADOS GERAIS ─────────────────────────────────────────────
                Ativações no primeiro lugar da faixa e com a composição colada:
                é o número que resume produção, e os outros a qualificam. */}
            <section className="flex flex-col gap-3">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Dados gerais</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 rounded-xl border border-border bg-card
                              divide-x divide-y lg:divide-y-0 divide-border/50">
                <Geral icon={Layers} rotulo="Ativações" valor={fmt(ativacoes.total)}
                  detalhe={textoDaComposicao(ativacoes)}
                  ressalva={ativacoes.publicacoesIndisponiveis
                    ? "publicações indisponíveis nesta coleta"
                    : ativacoes.diasSemMedicaoDeStories > 0
                      ? `${ativacoes.diasSemMedicaoDeStories} dia(s) sem medição de stories`
                      : null} />
                <Geral icon={ImageIcon} rotulo="Posts" valor={fmt(parcela(ativacoes, "Posts"))} />
                <Geral icon={Clapperboard} rotulo="Stories" valor={fmt(parcela(ativacoes, "Stories"))}
                  ressalva={parcela(ativacoes, "Stories") != null ? "mínimo: mede o que está no ar" : null} />
                <Geral icon={Heart} rotulo="Engajamento" valor={fmt(interacoes.total)}
                  detalhe={taxa != null ? `${taxa.toFixed(2)}% do alcance` : null} />
                {/* Respostas aos Stories é métrica de ENGAJAMENTO e fica na
                    faixa geral, ao lado das outras — seção própria a
                    transformaria num destaque que ela não é. */}
                <Geral icon={MessageCircle} rotulo="Respostas aos Stories" valor={fmt(respostas.total)}
                  ressalva={respostas.total == null ? "não medida nesta coleta" : null} />
                <Geral icon={Eye} rotulo="Visitas ao perfil" valor={fmt(visitas.total)}
                  ressalva={rotuloVisitas.ressalva} />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
                <Geral icon={MousePointerClick} rotulo="Cliques no link" valor={fmt(cliques.total)} />
              </div>
              {!comparabilidade.comparavel && comparabilidade.motivo && (
                <p className="text-[10px] text-amber-600 leading-snug">{comparabilidade.motivo}</p>
              )}
            </section>

            {/* ── PUBLICAÇÕES E CONTEÚDO ───────────────────────────────── */}
            <UltimasPublicacoes
              instagram={publicacoes.slice(0, 4)}
              temLinkedin={false}
              aviso={publicacoesIndisponiveis
                ? "Não conseguimos ler as publicações nesta coleta."
                : "Nenhuma publicação medida no período."}
            />

            <PerformanceDeConteudo
              melhores={melhores}
              porTipo={porTipo}
              amostraPequena={publicacoes.length > 0 && publicacoes.length < 5}
              aviso={publicacoes.length === 0
                ? "O ranking precisa de alcance, que só o snapshot guarda — ele aparece depois da primeira coleta."
                : null}
            />

            {/* ── SEGUIDORES ────────────────────────────────────────────────
                Por último de propósito: é a análise mais detalhada, e quem
                chega aqui já viu o panorama, os números gerais e o conteúdo. */}
            <section className="flex flex-col gap-3">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Seguidores · movimento da base
              </h2>
              <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-4 items-stretch">
                <div className="grid grid-cols-3 rounded-xl border border-border bg-card divide-x divide-border/50">
                  <Geral icon={Users} rotulo="Saldo atual" valor={fmt(movimento.saldoAtual)}
                    detalhe={movimento.saldo != null
                      ? `${movimento.saldo > 0 ? "+" : ""}${fmt(movimento.saldo)} no período` : null} />
                  <Geral icon={Users} rotulo="Entraram"
                    valor={movimento.entradas == null ? "–" : `+${fmt(movimento.entradas)}`}
                    ressalva={movimento.entradas != null && movimento.diasMedidos < serie.length
                      ? `${movimento.diasMedidos} de ${serie.length} dias medidos` : null} />
                  <Geral icon={Users} rotulo="Saíram"
                    valor={movimento.saidas == null ? "–" : `−${fmt(movimento.saidas)}`}
                    ressalva={movimento.saidas == null ? "não derivável" : "derivado do saldo"} />
                </div>
                <div className="rounded-xl border border-border bg-card p-4">
                  <GraficoDeMovimento pontos={pontosDeMovimento} temMovimento={false}
                    nota={movimento.origem === "follower_count" ? null : "só o saldo — ver ressalva abaixo"} />
                </div>
              </div>
              {movimento.motivo && (
                <p className="text-[11px] text-muted-foreground leading-snug">{movimento.motivo}</p>
              )}
              {movimento.origem === "follower_count" && (
                <p className="text-[10px] text-muted-foreground/60 leading-snug">
                  Entradas vêm de <span className="font-mono">follower_count</span> — quem passou a seguir naquele dia,
                  medido pela Meta. As saídas são derivadas: entradas menos o saldo do período. Nenhum dos dois usa a
                  quebra por tipo de seguidor, cuja semântica segue em validação.
                </p>
              )}
            </section>

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
