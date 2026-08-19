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
 *  ── O que esta tela NÃO faz ────────────────────────────────────────────────
 *  Não estima custo em R$: não há tabela de preços conectada, e um valor
 *  inventado ali viraria número de reunião. Não compara com a Anthropic: a
 *  Admin API não está conectada. Não desenha 30 dias sobre 3: a instrumentação
 *  começou em 18/08/2026, e a página diz desde quando mede.
 *
 *  ── E o que ela nunca vai mostrar ──────────────────────────────────────────
 *  Prompt, resposta ou dado de cliente. A tabela não guarda — logo a tela não
 *  tem o que expor, nem por engano.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useMemo, useState } from "react";
import {
  AlertTriangle, Check, Gauge, Loader2, Sparkles, TrendingUp, Zap,
} from "lucide-react";
import { MetaDashboardLayout } from "@/components/MetaDashboardLayout";
import { PeriodFilter, usePeriodFilter } from "@/components/PeriodFilter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { SemAcessoTracker } from "@/components/SemAcessoTracker";
import { canManageContent } from "@shared/permissions";
import {
  NOME_SEM_CLIENTE, alertasDeConsumo, analisarClientes, analisarOrigens,
  leituraDoHistorico, totaisDoPeriodo, tokensDe,
  type AlertaDeConsumo, type TipoDeAlerta,
} from "@shared/consumoDeIA";

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

  const totais = useMemo(() => totaisDoPeriodo(dados.porOrigem), [dados]);
  const origens = useMemo(() => analisarOrigens(dados), [dados]);
  const clientes = useMemo(() => analisarClientes(dados), [dados]);
  const alertas = useMemo(() => alertasDeConsumo(dados), [dados]);
  const historico = useMemo(
    () => leituraDoHistorico(dados.medindoDesde, new Date().toISOString().slice(0, 10)),
    [dados],
  );

  if (!pode) {
    return (
      <SemAcessoTracker title="Consumo de IA"
        message="O painel de consumo é restrito a administradores e desenvolvedores." />
    );
  }

  const vazio = !q.isLoading && totais.chamadas === 0;

  return (
    <MetaDashboardLayout title="Consumo de IA">
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
            {/* ══ CAMADA 1 · LEITURA RÁPIDA ════════════════════════════════ */}
            <Alertas alertas={alertas} aoFocar={setOrigemFoco} />
            <Kpis totais={totais} />
            <CustoIndisponivel />
            <ConsumoNoTempo dias={dados.porDia} suficiente={historico.suficienteParaTendencia} />
            <PorOrigem origens={origens} foco={origemFoco} aoFocar={setOrigemFoco} />

            {/* ══ CAMADA 2 · INVESTIGAÇÃO ═════════════════════════════════ */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-[22px]">
              <PorCliente clientes={clientes} />
              <div className="flex flex-col gap-[22px]">
                <EntradaVersusSaida totais={totais} dias={dados.porDia} />
                <SpacesVersusApi periodo={`${dataCurta(dateRange.startDate)} a ${dataCurta(dateRange.endDate)}`} />
              </div>
            </div>
            <MaioresChamadas linhas={d?.maiores ?? []} />
            <Detalhamento linhas={d?.recentes ?? []} foco={origemFoco} aoFocar={setOrigemFoco} />
          </>
        )}
      </div>
    </MetaDashboardLayout>
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
            className={`rounded-[14px] border px-4 py-3 ${tom.fundo} ${a.origem ? "cursor-pointer" : ""}`}>
            <div className="flex items-center gap-2">
              <AlertTriangle className={`w-3.5 h-3.5 flex-shrink-0 ${tom.texto}`} strokeWidth={2.4} />
              <span className={`text-[9.5px] font-bold uppercase tracking-[0.1em] ${tom.texto}`}>
                {tom.rotulo}
              </span>
              <span className="text-[12.5px] font-semibold">{a.titulo}</span>
            </div>
            {/* O número que causou o alerta, sempre. Sem ele é opinião. */}
            <p className="text-[11.5px] text-muted-foreground leading-snug mt-1">{a.detalhe}</p>
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

function Kpis({ totais }: { totais: ReturnType<typeof totaisDoPeriodo> }) {
  return (
    <section className="rounded-[20px] border border-border bg-card overflow-hidden
                        shadow-[0_1px_2px_rgba(10,10,10,.04)]">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 divide-x divide-y lg:divide-y-0 divide-border">
        <Kpi rotulo="Chamadas" valor={fmt(totais.chamadas)} icone={Zap} cor="#7C5CE0" />
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
 * O custo em R$ não existe, e a tela diz por quê.
 *
 * Estimar com um preço chutado transformaria um palpite em número de reunião —
 * e número de reunião não se desfaz depois.
 */
function CustoIndisponivel() {
  return (
    <div className="rounded-[16px] border border-dashed border-border bg-card px-4 py-3
                    flex items-baseline gap-3 flex-wrap">
      <span className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
        Custo financeiro
      </span>
      <span className="text-[13px] font-semibold text-muted-foreground/70">Não disponível</span>
      <span className="text-[11.5px] text-muted-foreground/70 leading-snug">
        O Spaces registra tokens e chamadas. A tabela de preços do modelo ainda não está conectada —
        e um valor estimado com preço chutado viraria número de reunião.
      </span>
    </div>
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
 *  Por origem — o bloco que responde "onde estamos gastando"
 * ─────────────────────────────────────────────────────────────────────────────
 *  Quatro colunas de propósito: chamadas · tokens · % · tokens/chamada. As duas
 *  últimas juntas são o que separa "consome muito porque é usada muito" de
 *  "consome muito porque cada chamada é cara" — e as duas pedem ações opostas.
 *  Só o total não distingue as duas, e é por isso que o total sozinho não
 *  serve para otimizar.
 * ─────────────────────────────────────────────────────────────────────────────
 */
function PorOrigem({ origens, foco, aoFocar }: {
  origens: ReturnType<typeof analisarOrigens>;
  foco: string | null;
  aoFocar: (o: string | null) => void;
}) {
  const maiorTokens = Math.max(1, ...origens.map((o) => o.tokens));
  return (
    <section className="rounded-[20px] border border-border bg-card overflow-hidden
                        shadow-[0_1px_2px_rgba(10,10,10,.04)]">
      <div className="flex items-baseline justify-between gap-3 flex-wrap px-5 pt-[18px]">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.13em]">Onde estamos gastando</h2>
        <span className="text-[10.5px] text-muted-foreground/60">
          tokens/chamada separa uso frequente de chamada cara
        </span>
      </div>

      <div className="hidden sm:grid grid-cols-[minmax(0,1fr)_70px_70px_54px_92px] items-center gap-3
                      px-5 mt-3 text-[9px] font-bold uppercase tracking-[0.1em] text-muted-foreground/60">
        <span>Origem</span>
        <span className="text-right">Chamadas</span>
        <span className="text-right">Tokens</span>
        <span className="text-right">%</span>
        <span className="text-right">Tokens/chamada</span>
      </div>

      <div className="flex flex-col px-3 pb-3 mt-1">
        {origens.map((o, i) => {
          const cor = corDaOrigem(o.origem, i);
          const destacado = foco === o.origem;
          const caro = o.vezesAMedia != null && o.vezesAMedia >= 1.5;
          return (
            <button key={o.origem} type="button"
              onClick={() => aoFocar(destacado ? null : o.origem)}
              className={`grid grid-cols-[minmax(0,1fr)_70px] sm:grid-cols-[minmax(0,1fr)_70px_70px_54px_92px]
                          items-center gap-3 px-2 py-2 rounded-lg text-left
                          transition-colors duration-150 ${
                destacado ? "bg-foreground/[0.05]" : "hover:bg-foreground/[0.03]"}`}>
              <span className="min-w-0">
                <span className="flex items-center gap-2">
                  <i className="w-2 h-2 rounded-[3px] flex-shrink-0" style={{ background: cor }} />
                  <span className="text-[12.5px] font-medium truncate">{rotuloOrigem(o.origem)}</span>
                  {o.falhas > 0 && (
                    <span className="text-[10px] text-destructive flex-shrink-0">{fmt(o.falhas)} falhas</span>
                  )}
                </span>
                {/* A barra é a fatia de TOKENS — a mesma grandeza da coluna %. */}
                <span className="block h-[6px] rounded-full bg-muted overflow-hidden mt-1.5">
                  <span className="block h-full rounded-full"
                    style={{ width: `${(o.tokens / maiorTokens) * 100}%`, background: cor }} />
                </span>
              </span>
              <span className="text-[12px] tabular-nums text-right">{fmt(o.chamadas)}</span>
              <span className="hidden sm:block text-[12px] tabular-nums text-right">{compacto(o.tokens)}</span>
              <span className="hidden sm:block text-[12px] tabular-nums text-right text-muted-foreground">
                {o.fatia == null ? "–" : `${Math.round(o.fatia * 100)}%`}
              </span>
              <span className={`hidden sm:block text-[12px] tabular-nums text-right font-semibold ${
                caro ? "text-amber-700" : "text-muted-foreground"}`}
                title={o.vezesAMedia != null ? `${o.vezesAMedia.toFixed(1)}× a média geral` : undefined}>
                {o.tokensPorChamada == null ? "–" : fmt(Math.round(o.tokensPorChamada))}
              </span>
            </button>
          );
        })}
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
  const [por, setPor] = useState<"tokens" | "chamadas">("tokens");
  const ordenados = [...clientes].sort((a, b) =>
    por === "tokens" ? b.tokens - a.tokens : b.chamadas - a.chamadas);
  const maior = Math.max(1, ...ordenados.map((c) => (por === "tokens" ? c.tokens : c.chamadas)));

  return (
    <Bloco titulo="Clientes que mais consomem"
      acao={
        <span className="inline-flex rounded-md border border-border overflow-hidden">
          {(["tokens", "chamadas"] as const).map((o) => (
            <button key={o} type="button" onClick={() => setPor(o)}
              className={`text-[9.5px] font-bold uppercase tracking-[0.06em] px-2 py-1
                          transition-colors duration-150 ${
                por === o ? "bg-foreground text-background"
                          : "text-muted-foreground hover:bg-foreground/[0.04]"}`}>
              {o}
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
                {fmt(c.chamadas)} chamadas · {compacto(c.tokens)} tokens
              </span>
            </div>
            <span className="block h-[6px] rounded-full bg-muted overflow-hidden">
              <span className="block h-full rounded-full"
                style={{
                  width: `${((por === "tokens" ? c.tokens : c.chamadas) / maior) * 100}%`,
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
 * Entrada × saída — onde mora o custo.
 *
 * Prompt grande e resposta grande custam por motivos diferentes e se resolvem
 * por caminhos diferentes: um se corta encurtando contexto, o outro limitando o
 * tamanho da resposta. A proporção diz qual dos dois investigar.
 */
function EntradaVersusSaida({ totais, dias }: {
  totais: ReturnType<typeof totaisDoPeriodo>;
  dias: Array<{ dia: string; tokensEntrada: number; tokensSaida: number }>;
}) {
  const f = totais.fracaoDeEntrada;
  return (
    <Bloco titulo="Entrada × saída" nota="onde mora o custo">
      {f == null ? (
        <p className="text-[11.5px] text-muted-foreground">Sem tokens medidos no período.</p>
      ) : (
        <>
          <div className="flex items-baseline gap-4">
            <span>
              <b className="text-[22px] font-bold tabular-nums" style={{ color: "#2A9FD6" }}>{pct(f)}</b>
              <span className="text-[10.5px] text-muted-foreground ml-1.5">entrada</span>
            </span>
            <span>
              <b className="text-[22px] font-bold tabular-nums" style={{ color: "#E87AB0" }}>{pct(1 - f)}</b>
              <span className="text-[10.5px] text-muted-foreground ml-1.5">saída</span>
            </span>
          </div>
          <span className="flex h-[10px] rounded-full overflow-hidden bg-muted">
            <span style={{ flexGrow: f, background: "#2A9FD6" }} />
            <span style={{ flexGrow: 1 - f, background: "#E87AB0" }} />
          </span>
          {/* A evolução da proporção: se ela muda, o que mudou foi o desenho dos
              prompts, e não o volume. */}
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
 * Spaces × Claude API — preparado, e honesto sobre não estar conectado.
 *
 * O bloco existe agora para que a comparação tenha lugar no dia em que a Admin
 * API entrar. Preencher a coluna da direita com o número do Spaces "por
 * enquanto" destruiria justamente o que ela serve para revelar: chamadas que
 * escapam da instrumentação.
 */
function SpacesVersusApi({ periodo }: { periodo: string }) {
  return (
    <Bloco titulo="Spaces × Claude API" nota={`período ${periodo}`}>
      <div className="rounded-[14px] border border-dashed border-border px-4 py-4">
        <p className="text-[12.5px] font-medium">Dados da Claude API ainda não conectados.</p>
        <p className="text-[11px] text-muted-foreground leading-snug mt-1.5 max-w-[60ch]">
          Quando a Admin API da Anthropic estiver ligada, esta comparação mostra chamadas, entrada,
          saída e total dos dois lados — e a diferença entre eles. É ela que revela chamada não
          contabilizada, uso fora do Spaces ou duplicação; por isso a coluna da direita fica vazia
          em vez de repetir a da esquerda.
        </p>
      </div>
    </Bloco>
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
