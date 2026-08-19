/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Consumo de IA — gestão do próprio Spaces
 * ─────────────────────────────────────────────────────────────────────────────
 *  A pergunta não é "quantos tokens gastamos". É "por que estamos gastando
 *  isso, onde está o consumo, o que está crescendo e o que dá para otimizar".
 *
 *  ── Duas camadas, e o peso visual é a diferença ────────────────────────────
 *  A primeira dobra responde em segundos: alertas · KPIs · consumo no tempo ·
 *  por origem. Ela é grande, colorida e tem os gráficos. Abaixo vem a
 *  investigação — cliente, composição, comparação com a API, maiores chamadas,
 *  detalhamento —, em corpo menor. Blocos com o mesmo peso não têm hierarquia
 *  nenhuma, e sem hierarquia a leitura rápida deixa de existir.
 *
 *  ── Saúde antes de finanças ────────────────────────────────────────────────
 *  O primeiro bloco não é um número: é um veredito. "US$ 2,53" não diz se está
 *  bom, e a pergunta de gestão é exatamente essa. O veredito é determinístico e
 *  testável (`shared/saudeDoConsumo.ts`), e NUNCA gerado por modelo — um
 *  diagnóstico fluente sobre o gasto de IA custaria uma chamada de IA para
 *  dizer algo que ninguém consegue conferir.
 *
 *  ── "Normal" é o próprio Spaces ────────────────────────────────────────────
 *  Não há benchmark de mercado nesta tela. A régua é o histórico desta conta, e
 *  quando ele ainda não existe a resposta é dita: "histórico insuficiente para
 *  estabelecer um padrão". A régua vem de TODOS os dias medidos, e não do
 *  período selecionado — trocar o seletor de datas não pode mudar o que conta
 *  como normal.
 *
 *  ── Três naturezas de número, e a tela distingue ───────────────────────────
 *    MEDIDO          contado por alguém: `ai_geracoes` ou a Anthropic
 *    DERIVADO        aritmética sobre medidos — média, fatia, custo/milhão
 *    INTERPRETAÇÃO   regra nossa lida sobre os dois — o veredito, os sinais
 *
 *  Sem essa distinção, "otimização recomendada" e "507.312 tokens" chegam com o
 *  mesmo peso, e o primeiro é opinião com limiar configurável.
 *
 *  ── O que esta tela NÃO faz ────────────────────────────────────────────────
 *  Não estima custo em R$: a Anthropic cobra em USD, e converter exigiria uma
 *  cotação que não está conectada. Não atribui custo por cliente ou por origem:
 *  a Admin API não devolve esse recorte (ver o bloco de custo). Não desenha 30
 *  dias sobre 3, e diz desde quando mede.
 *
 *  ── E o que ela nunca vai mostrar ──────────────────────────────────────────
 *  Prompt, resposta, dado de cliente ou a chave. A tabela não guarda e a chave
 *  nunca sai do servidor — logo a tela não tem o que expor, nem por engano.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { Fragment, useMemo, useState } from "react";
import {
  AlertTriangle, ArrowDownUp, Check, DollarSign, Gauge, Info, Lightbulb, Loader2,
  RefreshCw, Sparkles, TrendingUp, Zap,
} from "lucide-react";
import { HubShell } from "@/pages/hub/HubShell";
import { PeriodFilter, usePeriodFilter } from "@/components/PeriodFilter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { canManageContent } from "@shared/permissions";
import {
  NOME_SEM_CLIENTE, alertasDeConsumo, analisarClientes, analisarOrigens,
  leituraDoHistorico, totaisDoPeriodo, tokensDe,
  type AlertaDeConsumo, type TipoDeAlerta,
} from "@shared/consumoDeIA";
import {
  alertasComparativos, compararFontes, custoPorMilhao, estatisticasDeChamada,
  oportunidadesDeOtimizacao,
  razaoEntradaSaida, saudeDoConsumo,
  type EstadoDaSaude,
} from "@shared/saudeDoConsumo";

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
const rotuloOrigem = (o: string) => ROTULO_ORIGEM[o] ?? o;

/** A cor de cada origem — estável por nome, para o gráfico e a barra baterem. */
const CORES = ["#7C5CE0", "#2A9FD6", "#E87AB0", "#E0A030", "#3FA66A", "#D65745", "#8C8C8C"];
const corDaOrigem = (o: string, i: number) => CORES[i % CORES.length];

const n = (v: unknown) => Number(v ?? 0);
const fmt = (v: unknown) => n(v).toLocaleString("pt-BR");
/** Milhões e milhares abreviados: "1.284.309 tokens" não se lê de relance. */
const compacto = (v: unknown) => {
  const x = n(v);
  if (x >= 1_000_000) return `${(x / 1_000_000).toFixed(1).replace(".", ",")}M`;
  if (x >= 10_000) return `${Math.round(x / 1000)}k`;
  return x.toLocaleString("pt-BR");
};
const pct = (v: number | null) => (v == null ? "–" : `${(v * 100).toFixed(1).replace(".", ",")}%`);
const dataCurta = (d: string) => `${String(d).slice(8, 10)}/${String(d).slice(5, 7)}`;

const TOM_ALERTA: Record<TipoDeAlerta, { fundo: string; texto: string; rotulo: string }> = {
  anomalia:   { fundo: "bg-destructive/8 border-destructive/25", texto: "text-destructive", rotulo: "Anomalia" },
  falha:      { fundo: "bg-destructive/8 border-destructive/25", texto: "text-destructive", rotulo: "Falha" },
  eficiencia: { fundo: "bg-amber-500/10 border-amber-500/30", texto: "text-amber-700", rotulo: "Eficiência" },
  volume:     { fundo: "bg-sky-500/8 border-sky-500/25", texto: "text-sky-700", rotulo: "Volume" },
  crescimento: { fundo: "bg-sky-500/8 border-sky-500/25", texto: "text-sky-700", rotulo: "Crescimento" },
  custo:      { fundo: "bg-amber-500/10 border-amber-500/30", texto: "text-amber-700", rotulo: "Custo" },
  desalinhamento: { fundo: "bg-violet-500/8 border-violet-500/25", texto: "text-violet-700", rotulo: "Desalinhamento" },
};

export default function ConsumoIA() {
  const { user } = useAuth();
  const { period, setPeriod, dateRange } = usePeriodFilter();
  const [origemFoco, setOrigemFoco] = useState<string | null>(null);

  /** Mesma allowlist da procedure — ver `contentProcedure`. */
  const pode = canManageContent((user as { role?: string } | null)?.role);
  const q = trpc.accounts.consumoIA.useQuery(
    { startDate: dateRange.startDate, endDate: dateRange.endDate },
    { enabled: pode },
  );

  const d = q.data;
  const dados = useMemo(() => ({
    porOrigem: (d?.porOrigem ?? []).map((o) => ({
      origem: o.origem, chamadas: n(o.chamadas), falhas: n(o.falhas),
      tokensEntrada: n(o.tokensEntrada), tokensSaida: n(o.tokensSaida),
      duracaoMediaMs: n(o.duracaoMediaMs),
    })),
    porDia: (d?.porDia ?? []).map((x) => ({
      dia: String(x.dia).slice(0, 10), chamadas: n(x.chamadas), falhas: n(x.falhas),
      tokensEntrada: n(x.tokensEntrada), tokensSaida: n(x.tokensSaida),
    })),
    porCliente: (d?.porCliente ?? []).map((c) => ({
      accountId: c.accountId ?? null, nome: c.nome ?? null, chamadas: n(c.chamadas),
      tokensEntrada: n(c.tokensEntrada), tokensSaida: n(c.tokensSaida),
    })),
    medindoDesde: d?.medindoDesde ? String(d.medindoDesde).slice(0, 10) : null,
  }), [d]);

  /** A régua: TODO o histórico medido, e não o período da tela. */
  const historicoDiario = useMemo(
    () => (d?.historico ?? []).map((h) => ({
      dia: String(h.dia).slice(0, 10), entrada: n(h.entrada), saida: n(h.saida), chamadas: n(h.chamadas),
    })), [d]);

  const totais = useMemo(() => totaisDoPeriodo(dados.porOrigem), [dados]);
  const origens = useMemo(() => analisarOrigens(dados), [dados]);
  const clientes = useMemo(() => analisarClientes(dados), [dados]);
  const alertasProprios = useMemo(() => alertasDeConsumo(dados), [dados]);

  const estatisticas = useMemo(
    () => estatisticasDeChamada(d?.tokensPorChamada ?? []), [d]);
  const razao = useMemo(
    () => razaoEntradaSaida(totais.tokensEntrada, totais.tokensSaida, historicoDiario),
    [totais, historicoDiario]);

  /** O consumo da Anthropic, agregado. `null` quando a chave não está no ar. */
  const anth = d?.anthropic ?? null;
  const anthTotais = useMemo(() => {
    if (!anth || anth.erro) return null;
    const dias = anth.dias;
    const soma = (f: (x: typeof dias[number]) => number) => dias.reduce((a, x) => a + f(x), 0);
    const uncached = soma((x) => n(x.uncachedInput));
    const cacheRead = soma((x) => n(x.cacheRead));
    const cacheCreation = soma((x) => n(x.cacheCreation));
    const output = soma((x) => n(x.output));
    return {
      uncached, cacheRead, cacheCreation, output,
      // As quatro categorias somadas: é o total que a Anthropic viu. Elas ficam
      // separadas em toda a tela porque têm preço diferente — só aqui, onde a
      // pergunta é "quanto no total", faz sentido juntá-las.
      total: uncached + cacheRead + cacheCreation + output,
      centavos: n(anth.totalCentavos),
      dolares: n(anth.totalCentavos) / 100,
    };
  }, [anth]);

  const saude = useMemo(() => saudeDoConsumo({
    periodo: {
      entrada: totais.tokensEntrada, saida: totais.tokensSaida,
      dias: Math.max(1, dados.porDia.length),
    },
    historico: historicoDiario,
    estatisticas,
  }), [totais, dados, historicoDiario, estatisticas]);

  const oportunidades = useMemo(() => oportunidadesDeOtimizacao({
    razao, estatisticas,
    cacheRead: anthTotais?.cacheRead ?? 0,
    cacheCreation: anthTotais?.cacheCreation ?? 0,
    origens: origens.map((o) => ({
      origem: rotuloOrigem(o.origem), chamadas: o.chamadas, tokensPorChamada: o.tokensPorChamada,
    })),
  }), [razao, estatisticas, anthTotais, origens]);

  const comparacao = useMemo(
    () => compararFontes(totais.tokensTotais, anthTotais?.total ?? null),
    [totais, anthTotais]);

  /**
   * Os alertas comparativos entram DEPOIS dos próprios.
   *
   * Os primeiros vêm da nossa tabela e existem sempre; estes dependem de
   * histórico longo e da leitura externa, e podem simplesmente não ter base.
   * Ordenar por severidade depois disso põe o crítico no topo sem perder a
   * separação entre "o que medimos" e "o que comparamos".
   */
  const alertas = useMemo(() => {
    const comparativos = alertasComparativos({
      periodo: {
        entrada: totais.tokensEntrada, saida: totais.tokensSaida,
        dias: Math.max(1, dados.porDia.length),
        rotulo: `${dataCurta(dateRange.startDate)} a ${dataCurta(dateRange.endDate)}`,
      },
      historico: historicoDiario,
      custoPorDia: (anth && !anth.erro ? anth.dias : []).map((x) => ({
        dia: String(x.dia).slice(0, 10),
        centavos: n(x.centavos),
        tokens: n(x.uncachedInput) + n(x.cacheRead) + n(x.cacheCreation) + n(x.output),
      })),
      comparacao,
    });
    return [...alertasProprios, ...comparativos]
      .sort((a, b) => Number(b.severidade === "critico") - Number(a.severidade === "critico"));
  }, [alertasProprios, totais, dados, historicoDiario, anth, comparacao, dateRange]);
  const historico = useMemo(
    () => leituraDoHistorico(dados.medindoDesde, new Date().toISOString().slice(0, 10)),
    [dados],
  );

  /*
   * ── A recusa de acesso mora na ROTA, e num lugar só ────────────────────────
   * `AdminOuDevOnly` em `App.tsx` usa `canManageContent` — a mesma função que
   * `pode` usa aqui e que a `contentProcedure` usa no servidor. Uma segunda
   * tela de recusa aqui dentro seria inalcançável e, pior, teria outra
   * aparência: quem caísse nela veria uma mensagem diferente para o mesmo
   * bloqueio.
   *
   * `pode` continua existindo porque ele desliga a QUERY. Sem isso, um render
   * fora da rota guardada dispararia uma chamada que o servidor recusaria — um
   * 403 no console para dizer o que já se sabia.
   */

  const vazio = !q.isLoading && totais.chamadas === 0;

  return (
    /*
     * ── HubShell, e não o layout do Tracker ────────────────────────────────
     * Esta é uma página do Selva Spaces, e não uma análise de cliente: ela fala
     * do gasto do PRÓPRIO Spaces e não tem conta ativa nenhuma. Mora ao lado de
     * Colaboradores e Contratos, que usam esta mesma casca — e é isso que lhe
     * dá URL própria, `/consumo-ia`, em vez de viajar dentro do iframe do
     * Tracker como `/tracker?rota=/consumo-ia`.
     *
     * O `MetaDashboardLayout` que morava aqui traz seletor de cliente e a
     * navegação do Tracker: cromo de um produto que esta página não usa.
     */
    <HubShell>
      <main className="flex-1 overflow-auto">
      <div className="flex flex-col gap-[30px] px-6 pt-7 pb-24 max-w-[1320px] mx-auto">
        <header className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3.5 min-w-0">
            <span className="w-[46px] h-[46px] rounded-[14px] bg-foreground text-background
                             grid place-items-center flex-shrink-0">
              <Sparkles className="w-5 h-5" strokeWidth={2} />
            </span>
            <div className="min-w-0">
              <h1 className="text-2xl font-bold tracking-[-0.02em] leading-none">Consumo de IA</h1>
              {/* A data de início fica no cabeçalho porque ela qualifica TUDO
                  abaixo: sem ela, três dias de dado parecem uma tendência. */}
              <p className="text-[12.5px] text-muted-foreground mt-1.5">{historico.frase}</p>
            </div>
          </div>
          <PeriodFilter period={period} onChange={setPeriod} />
        </header>

        {q.isLoading && (
          <div className="flex items-center justify-center h-40 text-muted-foreground gap-2">
            <Loader2 className="w-5 h-5 animate-spin" /> Carregando…
          </div>
        )}

        {vazio && (
          <div className="rounded-[20px] border border-dashed border-border bg-card px-5 py-8 text-center">
            <p className="text-sm font-medium">Nenhuma geração no período.</p>
            <p className="text-xs text-muted-foreground mt-1.5 max-w-[60ch] mx-auto leading-snug">
              {dados.medindoDesde
                ? "A contagem existe, mas não houve chamada neste recorte. Amplie o período."
                : "A instrumentação começa a contar na próxima chamada ao modelo. O histórico anterior não foi medido, e inventar um número seria pior que não ter."}
            </p>
          </div>
        )}

        {!q.isLoading && !vazio && (
          <>
            {/* ══ CAMADA 1 · SAÚDE E LEITURA RÁPIDA ════════════════════════ */}
            <SaudeDoConsumo saude={saude} oportunidades={oportunidades} />
            <Alertas alertas={alertas} aoFocar={setOrigemFoco} />
            <Kpis totais={totais} custo={anthTotais} />
            <Custo dados={anth} totais={anthTotais} tokensSpaces={totais.tokensTotais} />
            <ConsumoNoTempo dias={dados.porDia} suficiente={historico.suficienteParaTendencia} />
            <PorOrigem origens={origens} foco={origemFoco} aoFocar={setOrigemFoco} />

            {/* ══ CAMADA 2 · INVESTIGAÇÃO ═════════════════════════════════ */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-[22px]">
              <EstatisticasDaChamada e={estatisticas} />
              <EntradaVersusSaida totais={totais} dias={dados.porDia} razao={razao} />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-[22px]">
              <PorCliente clientes={clientes} />
              <div className="flex flex-col gap-[22px]">
                <Cache totais={anthTotais} disponivel={!!anth && !anth.erro} />
                <PorModelo modelos={anth && !anth.erro ? anth.modelos : []} />
              </div>
            </div>
            <SpacesVersusApi
              comparacao={comparacao} anth={anth} chamadas={totais.chamadas}
              periodo={`${dataCurta(dateRange.startDate)} a ${dataCurta(dateRange.endDate)}`}
              range={dateRange} aoAtualizar={() => q.refetch()} />
            <MaioresChamadas linhas={d?.maiores ?? []} />
            <Detalhamento linhas={d?.recentes ?? []} foco={origemFoco} aoFocar={setOrigemFoco} />
            <Capacidade />
          </>
        )}
      </div>
      </main>
    </HubShell>
  );
}

/**
 * Alertas — silêncio é resposta.
 *
 * Sem nada relevante, a caixa diz que não há. Um insight fabricado para
 * preencher a interface gasta a atenção que o alerta real vai precisar.
 */
function Alertas({ alertas, aoFocar }: {
  alertas: AlertaDeConsumo[]; aoFocar: (o: string | null) => void;
}) {
  if (!alertas.length) {
    return (
      <div className="rounded-[16px] border border-emerald-500/25 bg-emerald-500/[0.06] px-4 py-3
                      flex items-center gap-2.5">
        <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" strokeWidth={2.6} />
        <span className="text-[13px] text-emerald-800">Nenhum alerta de consumo no período.</span>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
      {alertas.map((a, i) => {
        const tom = TOM_ALERTA[a.tipo];
        return (
          <div key={i}
            onClick={() => a.origem && aoFocar(a.origem)}
            className={`rounded-[14px] border px-4 py-3 ${tom.fundo} ${
              a.severidade === "critico" ? "ring-1 ring-inset ring-destructive/30" : ""} ${
              a.origem ? "cursor-pointer" : ""}`}>
            <div className="flex items-center gap-2">
              <AlertTriangle className={`w-3.5 h-3.5 flex-shrink-0 ${tom.texto}`} strokeWidth={2.4} />
              <span className={`text-[9.5px] font-bold uppercase tracking-[0.1em] ${tom.texto}`}>
                {tom.rotulo}
              </span>
              <span className="text-[12.5px] font-semibold">{a.titulo}</span>
              {a.severidade === "critico" && (
                <span className="text-[8.5px] font-bold uppercase tracking-[0.1em] px-1.5 py-[2px]
                                 rounded-[5px] bg-destructive/15 text-destructive ml-auto flex-shrink-0">
                  Crítico
                </span>
              )}
            </div>
            {/* O número que causou o alerta, sempre. Sem ele é opinião. */}
            <p className="text-[11.5px] text-muted-foreground leading-snug mt-1">{a.detalhe}</p>

            {/* A evidência destrinchada: métrica, valor, referência, período e
                motivo. É o que permite discordar do alerta em vez de só acatá-lo. */}
            <dl className="mt-2 pt-2 border-t border-foreground/[0.07] grid grid-cols-[auto_minmax(0,1fr)]
                           gap-x-2.5 gap-y-[3px] text-[10px] leading-tight">
              {[
                ["Métrica", a.metrica], ["Atual", a.valorAtual],
                ["Referência", a.referencia], ["Período", a.periodo],
              ].map(([r, v]) => (
                <Fragment key={r}>
                  <dt className="font-bold uppercase tracking-[0.08em] text-muted-foreground/55">{r}</dt>
                  <dd className="text-muted-foreground tabular-nums">{v}</dd>
                </Fragment>
              ))}
            </dl>
            <p className="text-[10px] text-muted-foreground/60 leading-snug mt-1.5">{a.motivo}</p>
          </div>
        );
      })}
    </div>
  );
}

function Kpi({ rotulo, valor, nota, cor, icone: Icone }: {
  rotulo: string; valor: string; nota?: string | null; cor?: string;
  icone?: typeof Zap;
}) {
  const vazio = valor === "–";
  return (
    <div className="flex flex-col px-4 py-4 min-w-0 transition-colors duration-150 hover:bg-foreground/[0.02]">
      {Icone && (
        <span className="w-8 h-8 rounded-[10px] grid place-items-center flex-shrink-0 mb-2.5"
          style={{ background: `${cor ?? "#8C8C8C"}29`, color: cor ?? "#8C8C8C" }}>
          <Icone className="w-4 h-4" strokeWidth={2.2} />
        </span>
      )}
      <span className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground mb-1">
        {rotulo}
      </span>
      <span className={`text-[26px] font-bold tabular-nums leading-none tracking-tight ${
        vazio ? "text-muted-foreground/40" : ""}`}>
        {valor}
      </span>
      {nota && <span className="text-[10.5px] text-muted-foreground mt-1.5 leading-snug">{nota}</span>}
    </div>
  );
}

function Kpis({ totais, custo }: {
  totais: ReturnType<typeof totaisDoPeriodo>;
  custo: { dolares: number } | null;
}) {
  /**
   * Custo por chamada: DERIVADO, e com uma ressalva que a nota carrega.
   *
   * O numerador é da Anthropic (toda a organização) e o denominador é do Spaces
   * (só o que passou pelo wrapper). Se houver consumo fora do painel, este
   * número sai alto — e é por isso que a nota diz "aproximado" em vez de fingir
   * precisão que a divisão não tem.
   */
  const porChamada = custo && totais.chamadas > 0 ? custo.dolares / totais.chamadas : null;
  return (
    <section className="rounded-[20px] border border-border bg-card overflow-hidden
                        shadow-[0_1px_2px_rgba(10,10,10,.04)]">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 divide-x divide-y lg:divide-y-0 divide-border">
        <Kpi rotulo="Chamadas" valor={fmt(totais.chamadas)} icone={Zap} cor="#7C5CE0"
          nota={porChamada == null ? null
            : `≈ US$ ${porChamada.toFixed(4).replace(".", ",")} por chamada`} />
        <Kpi rotulo="Tokens de entrada" valor={compacto(totais.tokensEntrada)}
          nota={totais.fracaoDeEntrada != null ? `${pct(totais.fracaoDeEntrada)} do total` : null} />
        <Kpi rotulo="Tokens de saída" valor={compacto(totais.tokensSaida)}
          nota={totais.fracaoDeEntrada != null ? `${pct(1 - totais.fracaoDeEntrada)} do total` : null} />
        <Kpi rotulo="Tokens totais" valor={compacto(totais.tokensTotais)} icone={TrendingUp} cor="#2A9FD6" />
        <Kpi rotulo="Falhas" valor={fmt(totais.falhas)}
          nota={totais.taxaDeFalha != null ? `${pct(totais.taxaDeFalha)} das chamadas` : null} />
        <Kpi rotulo="Tempo médio" icone={Gauge} cor="#E0A030"
          valor={totais.duracaoMediaMs == null
            ? "–"
            : `${(totais.duracaoMediaMs / 1000).toFixed(1).replace(".", ",")}s`}
          nota={totais.tokensPorChamada != null
            ? `${fmt(Math.round(totais.tokensPorChamada))} tokens/chamada`
            : null} />
      </div>
    </section>
  );
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Selo de natureza — MEDIDO · DERIVADO · INTERPRETAÇÃO
 * ─────────────────────────────────────────────────────────────────────────────
 *  Três coisas muito diferentes convivem nesta página, e sem marcação elas
 *  chegam com o mesmo peso:
 *
 *    MEDIDO         alguém contou — `ai_geracoes` ou a própria Anthropic
 *    DERIVADO       aritmética sobre medidos, e portanto tão sólido quanto eles
 *    INTERPRETAÇÃO  regra nossa, com limiar escolhido por gente
 *
 *  O veredito de saúde é a terceira categoria. Ele é útil, é testável, e não é
 *  um fato — e quem lê precisa saber disso antes de agir sobre ele.
 * ─────────────────────────────────────────────────────────────────────────────
 */
type Natureza = "medido" | "derivado" | "interpretacao";

const SELO: Record<Natureza, { texto: string; classe: string; ajuda: string }> = {
  medido: {
    texto: "Medido", classe: "bg-foreground/[0.06] text-muted-foreground",
    ajuda: "Contado diretamente — pelo Spaces ou pela Anthropic. Não é estimativa.",
  },
  derivado: {
    texto: "Derivado", classe: "bg-sky-500/10 text-sky-700",
    ajuda: "Calculado a partir de números medidos: média, fatia, custo por milhão.",
  },
  interpretacao: {
    texto: "Interpretação", classe: "bg-amber-500/12 text-amber-700",
    ajuda: "Leitura do Spaces sobre os números, com limiares definidos por nós. "
      + "Não é um fato da API — é uma regra que pode ser ajustada.",
  },
};

function Selo({ tipo }: { tipo: Natureza }) {
  const s = SELO[tipo];
  return (
    <span title={s.ajuda}
      className={`text-[8.5px] font-bold uppercase tracking-[0.1em] px-1.5 py-[3px]
                  rounded-[5px] cursor-help flex-shrink-0 ${s.classe}`}>
      {s.texto}
    </span>
  );
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Saúde do consumo — o primeiro bloco, e o único que dá um veredito
 * ─────────────────────────────────────────────────────────────────────────────
 *  Uma frase, o número que a sustenta, e a base de comparação declarada. Sem a
 *  base, "acima do padrão" é acusação sem régua.
 *
 *  Ele é o bloco mais alto da página de propósito: quem abre esta tela quer
 *  saber se precisa fazer alguma coisa, e o total de tokens não responde isso.
 * ─────────────────────────────────────────────────────────────────────────────
 */
const TOM_DA_SAUDE: Record<EstadoDaSaude, { fundo: string; ponto: string; texto: string }> = {
  saudavel:      { fundo: "border-emerald-500/25 bg-emerald-500/[0.06]", ponto: "#3FA66A", texto: "text-emerald-700" },
  atencao:       { fundo: "border-sky-500/25 bg-sky-500/[0.06]",         ponto: "#2A9FD6", texto: "text-sky-700" },
  otimizar:      { fundo: "border-amber-500/30 bg-amber-500/[0.08]",     ponto: "#E0A030", texto: "text-amber-700" },
  capacidade:    { fundo: "border-destructive/25 bg-destructive/[0.06]", ponto: "#D65745", texto: "text-destructive" },
  sem_historico: { fundo: "border-border bg-card",                        ponto: "#8C8C8C", texto: "text-muted-foreground" },
};

function SaudeDoConsumo({ saude, oportunidades }: {
  saude: ReturnType<typeof saudeDoConsumo>;
  oportunidades: ReturnType<typeof oportunidadesDeOtimizacao>;
}) {
  const tom = TOM_DA_SAUDE[saude.estado];
  return (
    <section className={`rounded-[20px] border px-5 py-[18px] ${tom.fundo}
                         shadow-[0_1px_2px_rgba(10,10,10,.04)]`}>
      <div className="flex items-start gap-3.5">
        <span className="w-2.5 h-2.5 rounded-full mt-[7px] flex-shrink-0"
          style={{ background: tom.ponto }} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2.5 flex-wrap">
            <h2 className={`text-[15px] font-bold tracking-[-0.01em] ${tom.texto}`}>{saude.titulo}</h2>
            <Selo tipo="interpretacao" />
            {saude.base && (
              <span className="text-[10px] text-muted-foreground/70">comparado com {saude.base}</span>
            )}
          </div>
          <p className="text-[12.5px] text-muted-foreground leading-snug mt-1.5 max-w-[80ch]">
            {saude.detalhe}
          </p>
        </div>
      </div>

      {/* As oportunidades vivem colados ao veredito: elas são o "e daí". */}
      {oportunidades.length > 0 && (
        <div className="mt-4 pt-3.5 border-t border-foreground/[0.07] flex flex-col gap-2.5">
          <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground/70
                           flex items-center gap-1.5">
            <Lightbulb className="w-3 h-3" strokeWidth={2.4} /> Oportunidades de otimização
          </span>
          {oportunidades.map((o) => (
            <div key={o.chave} className="flex items-start gap-2.5">
              <span className="w-1 h-1 rounded-full bg-foreground/30 mt-[7px] flex-shrink-0" />
              <p className="text-[11.5px] leading-snug">
                <b className="font-semibold">{o.titulo}.</b>{" "}
                <span className="text-muted-foreground">{o.detalhe}</span>
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Custo — vindo da Anthropic, em USD, e nunca estimado
 * ─────────────────────────────────────────────────────────────────────────────
 *  O número é o que a Cost API cobrou. Não há preço de tabela hardcoded aqui:
 *  se o preço mudar, esta tela acompanha sozinha, porque ela não sabe o preço —
 *  ela lê a fatura.
 *
 *  ── O limite honesto deste bloco ───────────────────────────────────────────
 *  A Cost API entrega custo POR DIA e POR DESCRIÇÃO de item. Ela não sabe o que
 *  é cliente, nem o que é "jornalzinho" — esses conceitos são nossos e não
 *  viajam na chamada. Logo custo por cliente e custo por origem NÃO EXISTEM, e
 *  a tela diz isso em vez de ratear o total por tokens e apresentar o resultado
 *  como se fosse cobrado.
 * ─────────────────────────────────────────────────────────────────────────────
 */
function Custo({ dados, totais, tokensSpaces }: {
  dados: { erro: string | null; moeda: string; atualizadoEm: string; doCache: boolean; dias: any[] } | null;
  totais: { dolares: number; centavos: number; total: number } | null;
  tokensSpaces: number;
}) {
  if (!dados) {
    return (
      <div className="rounded-[16px] border border-dashed border-border bg-card px-4 py-3
                      flex items-baseline gap-3 flex-wrap">
        <span className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
          Custo financeiro
        </span>
        <span className="text-[13px] font-semibold text-muted-foreground/70">Não conectado</span>
        <span className="text-[11.5px] text-muted-foreground/70 leading-snug">
          A chave de administração da Anthropic não está configurada neste ambiente. O consumo em
          tokens continua medido; o custo só aparece quando a Cost API responde.
        </span>
      </div>
    );
  }
  if (dados.erro) {
    return (
      <div className="rounded-[16px] border border-destructive/25 bg-destructive/[0.05] px-4 py-3">
        <span className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-destructive">
          Custo indisponível
        </span>
        {/* A mensagem do servidor, já sanitizada lá — nunca a chave, nunca o header. */}
        <p className="text-[11.5px] text-muted-foreground leading-snug mt-1">{dados.erro}</p>
      </div>
    );
  }

  const porMilhaoAnthropic = totais ? custoPorMilhao(totais.centavos, totais.total) : null;
  return (
    <section className="rounded-[20px] border border-border bg-card overflow-hidden
                        shadow-[0_1px_2px_rgba(10,10,10,.04)]">
      <div className="flex items-baseline justify-between gap-3 flex-wrap px-5 pt-[18px]">
        <div className="flex items-baseline gap-2.5 flex-wrap">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.13em]">Custo na Anthropic</h2>
          <Selo tipo="medido" />
        </div>
        <span className="text-[10px] text-muted-foreground/60">
          leitura de {new Date(dados.atualizadoEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          {dados.doCache ? " · do cache" : ""}
        </span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-border mt-3">
        <Kpi rotulo="Custo do período" icone={DollarSign} cor="#3FA66A"
          valor={totais ? `US$ ${totais.dolares.toFixed(2).replace(".", ",")}` : "–"}
          nota="cobrado pela Anthropic" />
        <Kpi rotulo="Custo por milhão"
          valor={porMilhaoAnthropic == null ? "–"
            : `US$ ${porMilhaoAnthropic.toFixed(2).replace(".", ",")}`}
          nota="deste mix de modelos e de entrada/saída" />
        <Kpi rotulo="Tokens (Anthropic)" valor={compacto(totais?.total ?? 0)}
          nota="tudo que a organização gastou" />
        <Kpi rotulo="Tokens (Spaces)" valor={compacto(tokensSpaces)}
          nota="o que passou pelo wrapper" />
      </div>

      <p className="text-[10.5px] text-muted-foreground/70 leading-snug px-5 py-3 border-t border-border
                    max-w-[92ch]">
        <b className="font-semibold text-foreground/70">O custo não se divide por cliente nem por
        origem.</b>{" "}
        A Anthropic cobra por dia e por tipo de token, e não conhece os conceitos de "cliente" ou
        "jornalzinho" — eles são nossos e não viajam na chamada. Ratear o total pelos tokens de cada
        um produziria um número plausível e não cobrado, e ele acabaria numa planilha como se fosse
        fatura. O que dá para dizer com segurança é a proporção de tokens, que está nos blocos abaixo.
      </p>
    </section>
  );
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Consumo ao longo do tempo — o gráfico grande da primeira dobra
 * ─────────────────────────────────────────────────────────────────────────────
 *  Três séries em DOIS eixos, e isso é decisão: chamadas contam dezenas, tokens
 *  contam centenas de milhares. No mesmo eixo, a linha de chamadas viraria uma
 *  reta colada no zero — presente e ilegível. Cada uma escala pela própria
 *  grandeza, e a comparação que importa é a FORMA das curvas.
 *
 *  A legenda liga e desliga cada série: com três curvas, isolar uma é a única
 *  forma de ler o dia em que ela disparou.
 * ─────────────────────────────────────────────────────────────────────────────
 */
function ConsumoNoTempo({ dias, suficiente }: {
  dias: Array<{ dia: string; chamadas: number; falhas: number; tokensEntrada: number; tokensSaida: number }>;
  suficiente: boolean;
}) {
  const [ativo, setAtivo] = useState<number | null>(null);
  const [ligadas, setLigadas] = useState({ chamadas: true, entrada: true, saida: true });

  if (dias.length < 2) {
    return (
      <section className="rounded-[20px] border border-border bg-card px-5 py-6
                          shadow-[0_1px_2px_rgba(10,10,10,.04)]">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.13em]">Consumo ao longo do tempo</h2>
        <p className="text-[11.5px] text-muted-foreground mt-2">
          São precisos ao menos dois dias medidos para desenhar evolução. Com um ponto não há curva —
          há um número, e ele já está acima.
        </p>
      </section>
    );
  }

  const W = 1000, ml = 46, mr = 46, mt = 14, mb = 24;
  const altura = 240;
  const iw = W - ml - mr, ih = altura - mt - mb;

  const maxChamadas = Math.max(1, ...dias.map((d) => d.chamadas));
  const maxTokens = Math.max(1, ...dias.map((d) => Math.max(d.tokensEntrada, d.tokensSaida)));
  const x = (i: number) => ml + (dias.length < 2 ? iw / 2 : (i / (dias.length - 1)) * iw);
  const yC = (v: number) => mt + ih - (v / maxChamadas) * ih;
  const yT = (v: number) => mt + ih - (v / maxTokens) * ih;

  const caminho = (ler: (d: typeof dias[number]) => number, fy: (v: number) => number) =>
    dias.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${fy(ler(d)).toFixed(1)}`).join(" ");

  const series = [
    { chave: "chamadas" as const, rotulo: "Chamadas", cor: "#7C5CE0", ler: (d: typeof dias[number]) => d.chamadas, fy: yC },
    { chave: "entrada" as const, rotulo: "Tokens de entrada", cor: "#2A9FD6", ler: (d: typeof dias[number]) => d.tokensEntrada, fy: yT },
    { chave: "saida" as const, rotulo: "Tokens de saída", cor: "#E87AB0", ler: (d: typeof dias[number]) => d.tokensSaida, fy: yT },
  ];
  const passo = iw / Math.max(1, dias.length - 1);
  const emFoco = ativo != null ? dias[ativo] : null;

  return (
    <section className="rounded-[20px] border border-border bg-card px-5 py-[18px]
                        shadow-[0_1px_2px_rgba(10,10,10,.04)]">
      <div className="flex items-baseline justify-between gap-3 flex-wrap min-h-[22px]">
        <div className="flex items-baseline gap-2.5 flex-wrap">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.13em]">Consumo ao longo do tempo</h2>
          {!suficiente && (
            <span className="text-[10px] text-amber-700">
              histórico curto — a forma ainda não é tendência
            </span>
          )}
        </div>
        {/* A leitura substitui a legenda no hover: um balão mexeria na altura. */}
        {emFoco ? (
          <span className="flex items-center gap-3 flex-wrap text-[11px] tabular-nums">
            <span className="font-bold">{dataCurta(emFoco.dia)}</span>
            <span style={{ color: "#7C5CE0" }}>{fmt(emFoco.chamadas)} chamadas</span>
            <span style={{ color: "#2A9FD6" }}>{compacto(emFoco.tokensEntrada)} entrada</span>
            <span style={{ color: "#E87AB0" }}>{compacto(emFoco.tokensSaida)} saída</span>
            <span className="text-muted-foreground">{compacto(tokensDe(emFoco))} total</span>
            {emFoco.falhas > 0 && <span className="text-destructive">{fmt(emFoco.falhas)} falhas</span>}
          </span>
        ) : (
          <div className="flex items-center gap-3 flex-wrap">
            {series.map((s) => (
              <button key={s.chave} type="button"
                onClick={() => setLigadas((l) => ({ ...l, [s.chave]: !l[s.chave] }))}
                className={`inline-flex items-center gap-1.5 text-[11px] transition-opacity duration-150 ${
                  ligadas[s.chave] ? "text-muted-foreground" : "text-muted-foreground/40"}`}>
                <i className="w-2 h-2 rounded-[3px] flex-shrink-0"
                  style={{ background: s.cor, opacity: ligadas[s.chave] ? 1 : 0.3 }} />
                {s.rotulo}
              </button>
            ))}
          </div>
        )}
      </div>

      <svg viewBox={`0 0 ${W} ${altura}`} width="100%" height={altura} className="mt-2"
        role="img" aria-label="Consumo de IA ao longo do tempo"
        onMouseLeave={() => setAtivo(null)}>
        {[0, 1, 2].map((g) => {
          const yy = mt + (ih / 2) * g;
          return (
            <g key={g}>
              <line x1={ml} x2={W - mr} y1={yy} y2={yy}
                className="stroke-[rgba(10,10,10,.07)]" strokeDasharray="3 4" />
              {/* Eixo esquerdo = chamadas; direito = tokens. Cada rótulo leva a
                  cor da série que ele mede, senão os dois números parecem do
                  mesmo eixo. */}
              <text x={ml - 7} y={yy + 4} textAnchor="end" fontSize={9} fill="#7C5CE0" opacity={0.75}>
                {fmt(Math.round(maxChamadas - (maxChamadas / 2) * g))}
              </text>
              <text x={W - mr + 7} y={yy + 4} textAnchor="start" fontSize={9} fill="#2A9FD6" opacity={0.75}>
                {compacto(Math.round(maxTokens - (maxTokens / 2) * g))}
              </text>
            </g>
          );
        })}

        {ativo != null && (
          <rect x={x(ativo) - passo / 2} y={mt} width={passo} height={ih}
            className="fill-foreground/[0.045]" />
        )}

        {series.filter((s) => ligadas[s.chave]).map((s) => (
          <g key={s.chave}>
            <path d={caminho(s.ler, s.fy)} fill="none" stroke={s.cor} strokeWidth={2.4}
              strokeLinejoin="round" strokeLinecap="round" />
            {dias.length <= 14 && dias.map((d, i) => (
              <circle key={d.dia} cx={x(i)} cy={s.fy(s.ler(d))} r={2.6} fill={s.cor}
                opacity={ativo == null || ativo === i ? 1 : 0.35} />
            ))}
            {ativo != null && (
              <circle cx={x(ativo)} cy={s.fy(s.ler(dias[ativo]))} r={4}
                fill={s.cor} stroke="white" strokeWidth={1.6} />
            )}
          </g>
        ))}

        {dias.map((d, i) => (
          <rect key={`h${d.dia}`} x={x(i) - passo / 2} y={0} width={passo} height={altura}
            fill="transparent" style={{ cursor: "pointer" }} onMouseEnter={() => setAtivo(i)} />
        ))}

        {dias.map((d, i) => (i % Math.ceil(dias.length / 12) ? null : (
          <text key={`r${d.dia}`} x={x(i)} y={altura - 6} textAnchor="middle" fontSize={9}
            className="fill-muted-foreground">
            {dataCurta(d.dia)}
          </text>
        )))}
      </svg>
    </section>
  );
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Onde estamos gastando — a tabela ordenável das origens
 * ─────────────────────────────────────────────────────────────────────────────
 *  Duas perguntas diferentes moram na mesma tabela, e a ordenação é o que
 *  separa uma da outra: "o que consome mais no total" e "o que consome mais por
 *  chamada". A primeira encontra o volume; a segunda encontra o desperdício —
 *  uma origem chamada duas vezes por dia pode ser a mais cara de todas.
 *
 *  Por isso os dois destaques ficam FIXOS no topo, independentes da ordenação
 *  escolhida: quem chega na tabela recebe as duas respostas antes de mexer em
 *  qualquer coisa.
 * ─────────────────────────────────────────────────────────────────────────────
 */
type ColunaOrigem = "chamadas" | "entrada" | "saida" | "tokens" | "porChamada" | "razao" | "falhas";

const COLUNAS: Array<{ chave: ColunaOrigem; rotulo: string; ajuda: string }> = [
  { chave: "chamadas", rotulo: "Chamadas", ajuda: "Quantas vezes o modelo foi chamado." },
  { chave: "entrada", rotulo: "Entrada", ajuda: "Tokens enviados: instrução, contexto e dados." },
  { chave: "saida", rotulo: "Saída", ajuda: "Tokens escritos pelo modelo. Custam mais por token." },
  { chave: "tokens", rotulo: "Total", ajuda: "Entrada + saída." },
  { chave: "porChamada", rotulo: "Tok/chamada", ajuda: "Total dividido por chamadas — o custo unitário." },
  { chave: "razao", rotulo: "Ent/saí", ajuda: "Quantas vezes lemos mais do que escrevemos nesta origem." },
  { chave: "falhas", rotulo: "Falhas", ajuda: "Chamadas que não completaram. Falha também consome." },
];

const valorDaColuna = (o: ReturnType<typeof analisarOrigens>[number], c: ColunaOrigem): number => {
  switch (c) {
    case "chamadas": return o.chamadas;
    case "entrada": return n(o.tokensEntrada);
    case "saida": return n(o.tokensSaida);
    case "tokens": return o.tokens;
    case "porChamada": return o.tokensPorChamada ?? 0;
    // Sem saída não há razão: zero ordena junto com "não se aplica", que é
    // onde ele deve ficar — e não no topo, como um infinito ordenaria.
    case "razao": return n(o.tokensSaida) > 0 ? n(o.tokensEntrada) / n(o.tokensSaida) : 0;
    case "falhas": return o.falhas;
  }
};

function PorOrigem({ origens, foco, aoFocar }: {
  origens: ReturnType<typeof analisarOrigens>;
  foco: string | null;
  aoFocar: (o: string | null) => void;
}) {
  const [ordem, setOrdem] = useState<ColunaOrigem>("tokens");
  const maiorTokens = Math.max(1, ...origens.map((o) => o.tokens));

  const ordenadas = useMemo(
    () => [...origens].sort((a, b) =>
      valorDaColuna(b, ordem) - valorDaColuna(a, ordem) || a.origem.localeCompare(b.origem)),
    [origens, ordem]);

  /**
   * Os dois destaques. O de custo por chamada exige um mínimo de chamadas: com
   * uma chamada só, "a mais cara" é uma anedota promovida a diagnóstico.
   */
  const maiorVolume = [...origens].sort((a, b) => b.tokens - a.tokens)[0] ?? null;
  const maiorUnitario = [...origens]
    .filter((o) => o.chamadas >= 3 && o.tokensPorChamada != null)
    .sort((a, b) => (b.tokensPorChamada ?? 0) - (a.tokensPorChamada ?? 0))[0] ?? null;

  return (
    <section className="rounded-[20px] border border-border bg-card overflow-hidden
                        shadow-[0_1px_2px_rgba(10,10,10,.04)]">
      <div className="flex items-baseline justify-between gap-3 flex-wrap px-5 pt-[18px]">
        <div className="flex items-baseline gap-2.5 flex-wrap">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.13em]">Onde estamos gastando</h2>
          <Selo tipo="medido" />
        </div>
        <span className="text-[10.5px] text-muted-foreground/60">clique numa coluna para ordenar</span>
      </div>

      {(maiorVolume || maiorUnitario) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 px-5 mt-3">
          {maiorVolume && (
            <div className="rounded-[12px] border border-border bg-muted/25 px-3.5 py-2.5">
              <span className="text-[8.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground/70">
                Maior volume
              </span>
              <p className="text-[12.5px] font-semibold mt-0.5">{rotuloOrigem(maiorVolume.origem)}</p>
              <p className="text-[10.5px] text-muted-foreground">
                {compacto(maiorVolume.tokens)} tokens em {fmt(maiorVolume.chamadas)} chamadas
              </p>
            </div>
          )}
          {maiorUnitario && (
            <div className="rounded-[12px] border border-border bg-muted/25 px-3.5 py-2.5">
              <span className="text-[8.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground/70">
                Maior custo por chamada
              </span>
              <p className="text-[12.5px] font-semibold mt-0.5">{rotuloOrigem(maiorUnitario.origem)}</p>
              <p className="text-[10.5px] text-muted-foreground">
                {fmt(Math.round(maiorUnitario.tokensPorChamada ?? 0))} tokens por chamada
                {maiorUnitario.vezesAMedia != null
                  && ` · ${maiorUnitario.vezesAMedia.toFixed(1).replace(".", ",")}× a média`}
              </p>
            </div>
          )}
        </div>
      )}

      <div className="overflow-x-auto mt-3">
        <div className="min-w-[720px]">
          <div className="grid grid-cols-[minmax(160px,1fr)_repeat(7,78px)_54px] items-center gap-2
                          px-5 text-[9px] font-bold uppercase tracking-[0.1em] text-muted-foreground/60">
            <span>Origem</span>
            {COLUNAS.map((c) => (
              <button key={c.chave} type="button" title={c.ajuda}
                onClick={() => setOrdem(c.chave)}
                className={`text-right transition-colors duration-150 hover:text-foreground ${
                  ordem === c.chave ? "text-foreground" : ""}`}>
                {c.rotulo}{ordem === c.chave ? " ↓" : ""}
              </button>
            ))}
            <span className="text-right">%</span>
          </div>

          <div className="flex flex-col px-3 pb-3 mt-1">
            {ordenadas.map((o) => {
              const cor = corDaOrigem(o.origem, origens.findIndex((x) => x.origem === o.origem));
              const destacado = foco === o.origem;
              const caro = o.vezesAMedia != null && o.vezesAMedia >= 1.5;
              const razao = n(o.tokensSaida) > 0 ? n(o.tokensEntrada) / n(o.tokensSaida) : null;
              return (
                <button key={o.origem} type="button"
                  onClick={() => aoFocar(destacado ? null : o.origem)}
                  className={`grid grid-cols-[minmax(160px,1fr)_repeat(7,78px)_54px] items-center gap-2
                              px-2 py-2 rounded-lg text-left transition-colors duration-150 ${
                    destacado ? "bg-foreground/[0.05]" : "hover:bg-foreground/[0.03]"}`}>
                  <span className="min-w-0">
                    <span className="flex items-center gap-2">
                      <i className="w-2 h-2 rounded-[3px] flex-shrink-0" style={{ background: cor }} />
                      <span className="text-[12.5px] font-medium truncate">{rotuloOrigem(o.origem)}</span>
                    </span>
                    {/* A barra é a fatia de TOKENS — a mesma grandeza da coluna %. */}
                    <span className="block h-[6px] rounded-full bg-muted overflow-hidden mt-1.5">
                      <span className="block h-full rounded-full"
                        style={{ width: `${(o.tokens / maiorTokens) * 100}%`, background: cor }} />
                    </span>
                  </span>
                  <span className="text-[12px] tabular-nums text-right">{fmt(o.chamadas)}</span>
                  <span className="text-[12px] tabular-nums text-right text-muted-foreground">
                    {compacto(o.tokensEntrada)}
                  </span>
                  <span className="text-[12px] tabular-nums text-right text-muted-foreground">
                    {compacto(o.tokensSaida)}
                  </span>
                  <span className="text-[12px] tabular-nums text-right">{compacto(o.tokens)}</span>
                  <span className={`text-[12px] tabular-nums text-right font-semibold ${
                    caro ? "text-amber-700" : "text-muted-foreground"}`}
                    title={o.vezesAMedia != null ? `${o.vezesAMedia.toFixed(1)}× a média geral` : undefined}>
                    {o.tokensPorChamada == null ? "–" : fmt(Math.round(o.tokensPorChamada))}
                  </span>
                  <span className="text-[12px] tabular-nums text-right text-muted-foreground">
                    {razao == null ? "–" : `${razao.toFixed(1).replace(".", ",")}×`}
                  </span>
                  <span className={`text-[12px] tabular-nums text-right ${
                    o.falhas > 0 ? "text-destructive" : "text-muted-foreground/40"}`}>
                    {fmt(o.falhas)}
                  </span>
                  <span className="text-[12px] tabular-nums text-right text-muted-foreground">
                    {o.fatia == null ? "–" : `${Math.round(o.fatia * 100)}%`}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

/** A camada de investigação: corpo menor, e por isso o título é menor também. */
function Bloco({ titulo, nota, children, acao }: {
  titulo: string; nota?: string | null; children: React.ReactNode; acao?: React.ReactNode;
}) {
  return (
    <section className="rounded-[20px] border border-border bg-card px-5 py-[18px]
                        shadow-[0_1px_2px_rgba(10,10,10,.04)] flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div className="flex items-baseline gap-2.5 flex-wrap">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.13em]">{titulo}</h2>
          {nota && <span className="text-[10.5px] text-muted-foreground/60">{nota}</span>}
        </div>
        {acao}
      </div>
      {children}
    </section>
  );
}

/**
 * Clientes que mais consomem.
 *
 * O "Global" aparece na lista, nomeado — jornalzinho e consolidação são da
 * agência inteira, e atribuí-los a uma conta qualquer inventaria um culpado.
 * Ele fica marcado para não competir com as contas reais na leitura.
 */
function PorCliente({ clientes }: { clientes: ReturnType<typeof analisarClientes> }) {
  /**
   * Três leituras, e a terceira responde outra pergunta.
   *
   * "Quem consome mais" encontra o cliente grande — o que costuma ser só o
   * cliente com mais contas e mais relatórios. "Por chamada" encontra o cliente
   * CARO: aquele cuja análise, cada vez que roda, custa o dobro das outras. São
   * ações diferentes, e o total sozinho esconde a segunda.
   */
  const [por, setPor] = useState<"tokens" | "chamadas" | "porChamada">("tokens");
  const valor = (c: typeof clientes[number]) =>
    por === "tokens" ? c.tokens
    : por === "chamadas" ? c.chamadas
    // Piso de 3 chamadas: com uma só, "o mais caro por chamada" é sorte de
    // amostra e ocuparia o topo com um cliente que rodou um relatório uma vez.
    : c.chamadas >= 3 ? c.tokens / c.chamadas : 0;
  const ordenados = [...clientes].sort((a, b) => valor(b) - valor(a));
  const maior = Math.max(1, ...ordenados.map(valor));

  return (
    <Bloco titulo="Clientes que mais consomem"
      nota={por === "porChamada" ? "quem tem a análise mais cara, e não a maior" : null}
      acao={
        <span className="inline-flex rounded-md border border-border overflow-hidden">
          {(["tokens", "chamadas", "porChamada"] as const).map((o) => (
            <button key={o} type="button" onClick={() => setPor(o)}
              className={`text-[9.5px] font-bold uppercase tracking-[0.06em] px-2 py-1
                          transition-colors duration-150 ${
                por === o ? "bg-foreground text-background"
                          : "text-muted-foreground hover:bg-foreground/[0.04]"}`}>
              {o === "porChamada" ? "por chamada" : o}
            </button>
          ))}
        </span>
      }>
      {!ordenados.length && (
        <p className="text-[11.5px] text-muted-foreground">Nenhum consumo no período.</p>
      )}
      <div className="flex flex-col gap-1.5">
        {ordenados.slice(0, 10).map((c) => (
          <div key={String(c.accountId ?? "global")} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-3">
              <span className={`text-[12px] truncate ${c.global ? "text-muted-foreground italic" : ""}`}>
                {c.rotulo}
              </span>
              <span className="text-[11px] tabular-nums text-muted-foreground flex-shrink-0">
                {por === "porChamada"
                  ? (c.chamadas >= 3
                      ? `${fmt(Math.round(c.tokens / c.chamadas))} tokens/chamada`
                      : `${fmt(c.chamadas)} chamada(s) — amostra pequena`)
                  : `${fmt(c.chamadas)} chamadas · ${compacto(c.tokens)} tokens`}
              </span>
            </div>
            <span className="block h-[6px] rounded-full bg-muted overflow-hidden">
              <span className="block h-full rounded-full"
                style={{
                  width: `${(valor(c) / maior) * 100}%`,
                  background: c.global ? "#8C8C8C" : "#7C5CE0",
                }} />
            </span>
          </div>
        ))}
      </div>
    </Bloco>
  );
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Entrada × saída — o bloco que explica onde o dinheiro está
 * ─────────────────────────────────────────────────────────────────────────────
 *  Entrada é o que MANDAMOS ao modelo: instrução, contexto, dados da conta.
 *  Saída é o que ele ESCREVEU de volta. Elas têm preço diferente — a saída
 *  custa várias vezes mais por token —, e é por isso que a proporção importa
 *  mais que o total.
 *
 *  A proporção alta não é defeito: análise séria exige contexto, e um relatório
 *  bom lê muito para escrever pouco. O que vira sinal é ela CRESCER contra a
 *  própria história — o mesmo trabalho passando a exigir mais leitura.
 * ─────────────────────────────────────────────────────────────────────────────
 */
function EntradaVersusSaida({ totais, dias, razao }: {
  totais: ReturnType<typeof totaisDoPeriodo>;
  dias: Array<{ dia: string; tokensEntrada: number; tokensSaida: number }>;
  razao: ReturnType<typeof razaoEntradaSaida>;
}) {
  const f = totais.fracaoDeEntrada;
  return (
    <Bloco titulo="Entrada × saída" nota="onde mora o custo">
      {f == null ? (
        <p className="text-[11.5px] text-muted-foreground">Sem tokens medidos no período.</p>
      ) : (
        <>
          <div className="flex items-baseline gap-4 flex-wrap">
            <span title="Instrução, contexto e dados que o Spaces envia ao modelo. É o lado barato do token, e o que mais cresce quando o contexto engorda."
              className="cursor-help">
              <b className="text-[22px] font-bold tabular-nums" style={{ color: "#2A9FD6" }}>{pct(f)}</b>
              <span className="text-[10.5px] text-muted-foreground ml-1.5">entrada</span>
            </span>
            <span title="O texto que o modelo escreveu de volta. Custa várias vezes mais por token que a entrada."
              className="cursor-help">
              <b className="text-[22px] font-bold tabular-nums" style={{ color: "#E87AB0" }}>{pct(1 - f)}</b>
              <span className="text-[10.5px] text-muted-foreground ml-1.5">saída</span>
            </span>
            {razao.razao != null && (
              <span className="text-[10.5px] text-muted-foreground/70 flex items-center gap-1">
                <ArrowDownUp className="w-3 h-3" strokeWidth={2.2} />
                lemos {razao.razao.toFixed(1).replace(".", ",")}× o que escrevemos
              </span>
            )}
          </div>
          <span className="flex h-[10px] rounded-full overflow-hidden bg-muted">
            <span style={{ flexGrow: f, background: "#2A9FD6" }} />
            <span style={{ flexGrow: 1 - f, background: "#E87AB0" }} />
          </span>

          {/* A comparação com a própria história — o que transforma a proporção
              de curiosidade em sinal. */}
          <p className="text-[11px] text-muted-foreground leading-snug">
            {razao.razaoHistorica == null ? (
              <>Ainda não há histórico suficiente para dizer se esta proporção é a de sempre.</>
            ) : razao.desvio != null && razao.desvio >= 1.6 ? (
              <><b className="text-amber-700 font-semibold">Acima do padrão:</b>{" "}
                o histórico desta conta é {razao.razaoHistorica.toFixed(1).replace(".", ",")}×.
                Vale olhar o tamanho do contexto enviado por chamada.</>
            ) : (
              <>Em linha com o histórico desta conta, que é de{" "}
                {razao.razaoHistorica.toFixed(1).replace(".", ",")}× — a proporção não mudou.</>
            )}
          </p>

          {dias.length >= 2 && (
            <div className="flex items-end gap-[3px] h-8 mt-1">
              {dias.map((d) => {
                const t = d.tokensEntrada + d.tokensSaida;
                const fe = t > 0 ? d.tokensEntrada / t : 0;
                return (
                  <span key={d.dia} className="flex-1 flex flex-col justify-end h-full rounded-[2px] overflow-hidden"
                    title={`${dataCurta(d.dia)} · ${pct(fe)} entrada`}>
                    <span style={{ height: `${(1 - fe) * 100}%`, background: "#E87AB0" }} />
                    <span style={{ height: `${fe * 100}%`, background: "#2A9FD6" }} />
                  </span>
                );
              })}
            </div>
          )}
        </>
      )}
    </Bloco>
  );
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Estatísticas por chamada — média E mediana, nunca só uma
 * ─────────────────────────────────────────────────────────────────────────────
 *  A média sozinha mente quando poucas chamadas são enormes: um relatório de
 *  140 mil tokens entre cem classificações de 800 desloca a média e não toca a
 *  mediana. A distância entre as duas é justamente o diagnóstico, e por isso
 *  elas aparecem lado a lado com os extremos.
 * ─────────────────────────────────────────────────────────────────────────────
 */
function EstatisticasDaChamada({ e }: { e: ReturnType<typeof estatisticasDeChamada> }) {
  if (!e.chamadas) {
    return (
      <Bloco titulo="Tokens por chamada" nota="média, mediana e extremos">
        <p className="text-[11.5px] text-muted-foreground">Sem chamadas medidas no período.</p>
      </Bloco>
    );
  }
  const linha = (rotulo: string, valor: number | null, ajuda: string, destaque = false) => (
    <div className="flex flex-col" title={ajuda}>
      <span className="text-[9px] font-bold uppercase tracking-[0.11em] text-muted-foreground/70 cursor-help">
        {rotulo}
      </span>
      <span className={`text-[19px] font-bold tabular-nums leading-none mt-1 ${
        destaque ? "text-amber-700" : ""}`}>
        {valor == null ? "–" : fmt(Math.round(valor))}
      </span>
    </div>
  );
  return (
    <Bloco titulo="Tokens por chamada" nota={`${fmt(e.chamadas)} chamadas`}
      acao={<Selo tipo="derivado" />}>
      <div className="grid grid-cols-4 gap-3">
        {linha("Média", e.media, "Soma dos tokens dividida pelo número de chamadas. Sensível a extremos.", e.mediaDistorcida)}
        {linha("Mediana", e.mediana, "O valor do meio: metade das chamadas gasta menos que isso. Não se move com extremos.")}
        {linha("Maior", e.maior, "A maior chamada única do período.")}
        {linha("Menor", e.menor, "A menor chamada única do período.")}
      </div>
      {e.mediaDistorcida ? (
        <p className="text-[11px] leading-snug">
          <b className="text-amber-700 font-semibold">Uma chamada muito acima do padrão está elevando
          a média.</b>{" "}
          <span className="text-muted-foreground">
            A média está {(e.media! / e.mediana!).toFixed(1).replace(".", ",")}× a mediana — a maioria
            das chamadas é bem menor que o número da esquerda sugere. As maiores estão listadas abaixo.
          </span>
        </p>
      ) : (
        <p className="text-[11px] text-muted-foreground leading-snug">
          Média e mediana estão próximas: o consumo por chamada é uniforme, sem poucas chamadas
          gigantes puxando o número.
        </p>
      )}
    </Bloco>
  );
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Cache — mostrado mesmo quando é zero, e explicado
 * ─────────────────────────────────────────────────────────────────────────────
 *  Zero aqui é um FATO medido, e não uma lacuna: significa que nenhum contexto
 *  foi reaproveitado entre chamadas. Esconder o bloco quando dá zero faria a
 *  informação sumir exatamente no caso em que ela é acionável.
 * ─────────────────────────────────────────────────────────────────────────────
 */
function Cache({ totais, disponivel }: {
  totais: { cacheRead: number; cacheCreation: number; uncached: number } | null;
  disponivel: boolean;
}) {
  return (
    <Bloco titulo="Cache de contexto" nota="reaproveitamento entre chamadas"
      acao={disponivel ? <Selo tipo="medido" /> : null}>
      {!disponivel || !totais ? (
        <p className="text-[11.5px] text-muted-foreground leading-snug">
          O uso de cache só é visível pela Anthropic, e ela não respondeu nesta leitura.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <div title="Tokens de contexto lidos de um cache já existente. Custam uma fração do preço normal.">
              <span className="text-[9px] font-bold uppercase tracking-[0.11em] text-muted-foreground/70 cursor-help">
                Lido do cache
              </span>
              <span className="block text-[19px] font-bold tabular-nums leading-none mt-1">
                {compacto(totais.cacheRead)}
              </span>
            </div>
            <div title="Tokens gravados no cache para reuso futuro. Custam um pouco mais que o normal na primeira vez.">
              <span className="text-[9px] font-bold uppercase tracking-[0.11em] text-muted-foreground/70 cursor-help">
                Gravado
              </span>
              <span className="block text-[19px] font-bold tabular-nums leading-none mt-1">
                {compacto(totais.cacheCreation)}
              </span>
            </div>
            <div title="Entrada cobrada a preço cheio, sem reaproveitamento.">
              <span className="text-[9px] font-bold uppercase tracking-[0.11em] text-muted-foreground/70 cursor-help">
                Sem cache
              </span>
              <span className="block text-[19px] font-bold tabular-nums leading-none mt-1">
                {compacto(totais.uncached)}
              </span>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground leading-snug">
            {totais.cacheRead === 0 && totais.cacheCreation === 0 ? (
              <>Nenhum cache em uso no período — toda a entrada foi cobrada a preço cheio. O cache
              vale quando um mesmo trecho de contexto se repete entre chamadas; quando cada prompt é
              diferente, não há o que reaproveitar e zero é o resultado correto.</>
            ) : (
              <>Parte da entrada foi reaproveitada de chamadas anteriores, a um preço menor que o da
              entrada cheia.</>
            )}
          </p>
        </>
      )}
    </Bloco>
  );
}

/** O consumo por modelo — direto da Anthropic, que é quem sabe qual atendeu. */
function PorModelo({ modelos }: {
  modelos: Array<{ modelo: string; uncachedInput: number; cacheRead: number;
                   cacheCreation: number; output: number; centavos: number }>;
}) {
  if (!modelos.length) {
    return (
      <Bloco titulo="Por modelo" nota="quem atendeu">
        <p className="text-[11.5px] text-muted-foreground">Sem leitura da Anthropic neste período.</p>
      </Bloco>
    );
  }
  const total = (m: typeof modelos[number]) =>
    m.uncachedInput + m.cacheRead + m.cacheCreation + m.output;
  const maior = Math.max(1, ...modelos.map(total));
  return (
    <Bloco titulo="Por modelo" nota="quem atendeu" acao={<Selo tipo="medido" />}>
      <div className="flex flex-col gap-2.5">
        {modelos.map((m, i) => (
          <div key={m.modelo}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[12px] font-medium truncate">{m.modelo}</span>
              <span className="text-[11.5px] tabular-nums text-muted-foreground flex-shrink-0">
                {compacto(total(m))}
                {m.centavos > 0 && ` · US$ ${(m.centavos / 100).toFixed(2).replace(".", ",")}`}
              </span>
            </div>
            <span className="block h-[6px] rounded-full bg-muted overflow-hidden mt-1.5">
              <span className="block h-full rounded-full"
                style={{ width: `${(total(m) / maior) * 100}%`, background: CORES[i % CORES.length] }} />
            </span>
          </div>
        ))}
      </div>
    </Bloco>
  );
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Spaces × Anthropic — duas contagens que medem coisas diferentes
 * ─────────────────────────────────────────────────────────────────────────────
 *  Elas não deveriam bater, e a tela diz isso antes de mostrar a diferença. O
 *  Spaces conta o que passou pelo seu wrapper; a Anthropic cobra tudo que a
 *  organização gastou com a mesma chave. A distância é consumo que este painel
 *  não vê — que é informação, e não erro.
 *
 *  A Anthropic não informa número de CHAMADAS. Esse número continua vindo só de
 *  `ai_geracoes`, e a comparação é de tokens e custo.
 * ─────────────────────────────────────────────────────────────────────────────
 */
function SpacesVersusApi({ comparacao, anth, chamadas, periodo, range, aoAtualizar }: {
  comparacao: ReturnType<typeof compararFontes>;
  anth: { erro: string | null; atualizadoEm: string; doCache: boolean } | null;
  chamadas: number;
  periodo: string;
  range: { startDate: string; endDate: string };
  aoAtualizar: () => void;
}) {
  const atualizar = trpc.accounts.atualizarAnthropic.useMutation({ onSuccess: aoAtualizar });

  return (
    <Bloco titulo="Spaces × Anthropic" nota={`período ${periodo}`}
      acao={
        <button type="button" disabled={atualizar.isPending}
          onClick={() => atualizar.mutate({ startDate: range.startDate, endDate: range.endDate })}
          className="text-[10px] px-2.5 py-1 rounded-md border border-border text-muted-foreground
                     hover:text-foreground hover:bg-foreground/[0.04] transition-colors duration-150
                     disabled:opacity-60 flex items-center gap-1.5">
          <RefreshCw className={`w-3 h-3 ${atualizar.isPending ? "animate-spin" : ""}`} strokeWidth={2.2} />
          {atualizar.isPending ? "Lendo…" : "Reler da Anthropic"}
        </button>
      }>
      {!anth || anth.erro ? (
        <p className="text-[11.5px] text-muted-foreground leading-snug">
          {anth?.erro ?? "A chave de administração não está configurada neste ambiente."}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <span className="text-[9px] font-bold uppercase tracking-[0.11em] text-muted-foreground/70">
                Tokens · Spaces
              </span>
              <span className="block text-[21px] font-bold tabular-nums leading-none mt-1">
                {compacto(comparacao.spaces)}
              </span>
              <span className="text-[10px] text-muted-foreground">{fmt(chamadas)} chamadas contadas</span>
            </div>
            <div>
              <span className="text-[9px] font-bold uppercase tracking-[0.11em] text-muted-foreground/70">
                Tokens · Anthropic
              </span>
              <span className="block text-[21px] font-bold tabular-nums leading-none mt-1">
                {compacto(comparacao.anthropic ?? 0)}
              </span>
              {/* A ausência dita: a API não entrega contagem de chamadas. */}
              <span className="text-[10px] text-muted-foreground/70">a API não informa chamadas</span>
            </div>
            <div>
              <span className="text-[9px] font-bold uppercase tracking-[0.11em] text-muted-foreground/70">
                Diferença
              </span>
              <span className={`block text-[21px] font-bold tabular-nums leading-none mt-1 ${
                comparacao.desalinhado ? "text-amber-700" : ""}`}>
                {comparacao.percentual == null ? "–" : pct(Math.abs(comparacao.percentual))}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {comparacao.diferenca == null ? "sem base"
                  : comparacao.diferenca >= 0 ? "a Anthropic viu mais" : "o Spaces contou mais"}
              </span>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground leading-snug max-w-[88ch]">
            {comparacao.explicacao}
            {comparacao.desalinhado && comparacao.diferenca != null && comparacao.diferenca < 0 && (
              <> <b className="text-amber-700 font-semibold">Aqui o Spaces contou mais que a
              Anthropic cobrou</b>, o que a explicação acima não cobre — vale conferir se o período
              da leitura externa já fechou, já que o dado da Anthropic leva alguns minutos para
              consolidar.</>
            )}
          </p>
          <span className="text-[10px] text-muted-foreground/60">
            Leitura de {new Date(anth.atualizadoEm).toLocaleString("pt-BR", {
              day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
            {anth.doCache ? " · reaproveitada do cache de 10 minutos" : ""}
          </span>
        </>
      )}
    </Bloco>
  );
}

/**
 * Capacidade — a seção existe para dizer que não há limite conectado.
 *
 * Um painel de gestão precisa responder "estamos perto de bater em algum teto?".
 * A resposta honesta hoje é que ninguém sabe: o rate limit da organização não
 * está exposto a este painel. Inventar uma barra de "70% da capacidade" seria
 * pior que a ausência — daria a alguém a sensação de folga que ninguém mediu.
 */
function Capacidade() {
  return (
    <div className="rounded-[16px] border border-dashed border-border bg-card px-4 py-3
                    flex items-start gap-3">
      <Info className="w-3.5 h-3.5 text-muted-foreground/60 mt-[3px] flex-shrink-0" strokeWidth={2.2} />
      <div>
        <span className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
          Capacidade
        </span>
        <p className="text-[11.5px] text-muted-foreground/80 leading-snug mt-0.5 max-w-[88ch]">
          Não há limite de capacidade conectado a este painel. O rate limit da organização e o teto
          de gasto do plano não são expostos pelas APIs que esta página lê, então o Spaces não sabe
          quanta folga existe — e não vai desenhar uma barra de ocupação sobre um teto que não mediu.
          Falhas por limite, quando acontecem, aparecem como falhas nos blocos acima.
        </p>
      </div>
    </div>
  );
}

type LinhaCrua = {
  id: number; origem: string; accountId: number | null; nome: string | null;
  modelo: string | null; tokensEntrada: number | null; tokensSaida: number | null;
  duracaoMs: number | null; ok: boolean; criadoEm: string | Date;
};

const quandoTexto = (v: string | Date) => {
  const d = new Date(v);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} `
    + `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

/** As cinco maiores chamadas — atalho de investigação, sem conteúdo nenhum. */
function MaioresChamadas({ linhas }: { linhas: LinhaCrua[] }) {
  if (!linhas.length) return null;
  return (
    <Bloco titulo="Maiores chamadas" nota="as cinco que mais consumiram no período">
      <div className="flex flex-col gap-1">
        {linhas.map((l) => (
          <div key={l.id} className="flex items-baseline justify-between gap-3 px-2 py-1.5 rounded-md
                                     hover:bg-foreground/[0.03] transition-colors duration-150">
            <span className="text-[12px] truncate min-w-0">
              <span className={l.accountId == null ? "text-muted-foreground italic" : ""}>
                {l.nome ?? (l.accountId == null ? NOME_SEM_CLIENTE : `Conta ${l.accountId}`)}
              </span>
              <span className="text-muted-foreground/50 mx-1.5">·</span>
              <span className="text-muted-foreground">{rotuloOrigem(l.origem)}</span>
            </span>
            <span className="text-[11.5px] tabular-nums font-semibold flex-shrink-0">
              {compacto(n(l.tokensEntrada) + n(l.tokensSaida))} tokens
            </span>
          </div>
        ))}
      </div>
    </Bloco>
  );
}

/**
 * O detalhamento, para investigar.
 *
 * Metadados apenas — a tabela não guarda prompt nem resposta, então não há o
 * que expor aqui nem por engano. O teto de 300 linhas vem do servidor: isto é
 * ferramenta de investigação, não exportação do banco.
 */
function Detalhamento({ linhas, foco, aoFocar }: {
  linhas: LinhaCrua[]; foco: string | null; aoFocar: (o: string | null) => void;
}) {
  const [ordem, setOrdem] = useState<"recentes" | "maiores">("recentes");
  const [soFalhas, setSoFalhas] = useState(false);

  const filtradas = linhas
    .filter((l) => (foco ? l.origem === foco : true))
    .filter((l) => (soFalhas ? !l.ok : true))
    .slice()
    .sort((a, b) => ordem === "maiores"
      ? (n(b.tokensEntrada) + n(b.tokensSaida)) - (n(a.tokensEntrada) + n(a.tokensSaida))
      : new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime());

  if (!linhas.length) return null;

  return (
    <Bloco titulo="Detalhamento" nota={`${filtradas.length} de ${linhas.length} chamadas`}
      acao={
        <div className="flex items-center gap-2 flex-wrap">
          {foco && (
            <button type="button" onClick={() => aoFocar(null)}
              className="text-[10px] px-2 py-1 rounded-md bg-foreground text-background font-semibold">
              {rotuloOrigem(foco)} ✕
            </button>
          )}
          <button type="button" onClick={() => setSoFalhas((v) => !v)}
            className={`text-[10px] px-2 py-1 rounded-md border border-border transition-colors ${
              soFalhas ? "bg-destructive/10 text-destructive border-destructive/30" : "text-muted-foreground"}`}>
            só falhas
          </button>
          <span className="inline-flex rounded-md border border-border overflow-hidden">
            {(["recentes", "maiores"] as const).map((o) => (
              <button key={o} type="button" onClick={() => setOrdem(o)}
                className={`text-[9.5px] font-bold uppercase tracking-[0.06em] px-2 py-1 ${
                  ordem === o ? "bg-foreground text-background" : "text-muted-foreground"}`}>
                {o}
              </button>
            ))}
          </span>
        </div>
      }>
      <div className="overflow-x-auto -mx-1 px-1">
        <div className="min-w-[640px]">
          <div className="grid grid-cols-[80px_minmax(0,1.1fr)_minmax(0,1fr)_86px_62px_62px_56px_58px]
                          gap-2 px-2 pb-1.5 text-[9px] font-bold uppercase tracking-[0.09em]
                          text-muted-foreground/60 border-b border-border">
            <span>Quando</span><span>Origem</span><span>Cliente</span><span>Modelo</span>
            <span className="text-right">Entrada</span><span className="text-right">Saída</span>
            <span className="text-right">Duração</span><span className="text-right">Resultado</span>
          </div>
          <div className="max-h-[420px] overflow-y-auto flex flex-col">
            {filtradas.map((l) => (
              <div key={l.id}
                className="grid grid-cols-[80px_minmax(0,1.1fr)_minmax(0,1fr)_86px_62px_62px_56px_58px]
                           gap-2 px-2 py-[7px] text-[11px] items-center rounded-md
                           hover:bg-foreground/[0.03] transition-colors duration-150">
                <span className="tabular-nums text-muted-foreground">{quandoTexto(l.criadoEm)}</span>
                <span className="truncate">{rotuloOrigem(l.origem)}</span>
                <span className={`truncate ${l.accountId == null ? "text-muted-foreground/60 italic" : ""}`}>
                  {l.nome ?? (l.accountId == null ? "Global" : `Conta ${l.accountId}`)}
                </span>
                <span className="truncate text-muted-foreground/70 font-mono text-[10px]">
                  {l.modelo ?? "–"}
                </span>
                <span className="tabular-nums text-right">{compacto(l.tokensEntrada)}</span>
                <span className="tabular-nums text-right">{compacto(l.tokensSaida)}</span>
                <span className="tabular-nums text-right text-muted-foreground">
                  {l.duracaoMs == null ? "–" : `${(n(l.duracaoMs) / 1000).toFixed(1).replace(".", ",")}s`}
                </span>
                <span className={`text-right text-[10px] font-semibold ${
                  l.ok ? "text-emerald-600" : "text-destructive"}`}>
                  {l.ok ? "ok" : "falhou"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Bloco>
  );
}
