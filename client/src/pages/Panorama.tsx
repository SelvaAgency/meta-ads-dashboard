/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Panorama de Sites — central de monitoramento do portfólio
 * ─────────────────────────────────────────────────────────────────────────────
 *  A página responde, em ordem: como está o portfólio · o que precisa de
 *  atenção · qual cliente · o que está acontecendo · onde investigar. A ordem
 *  dos blocos É essa progressão, e não uma preferência de layout.
 *
 *  ── Não existe uma régua única, e a tela diz isso ──────────────────────────
 *  PageSpeed exige site configurado; GA4 exige propriedade conectada; receita
 *  exige loja. A interseção pode ser vazia. Em vez de inventar um score
 *  composto — um número sem fonte com aparência de medida —, cada card mostra o
 *  indicador mais objetivo QUE AQUELE SITE TEM, nomeado, com unidade e fonte.
 *
 *  O ranking comparativo existe só onde a comparação é legítima (PageSpeed, e
 *  só entre quem o tem), e declara a cobertura em voz alta: um ranking de 8
 *  linhas num portfólio de 13 se lê como o portfólio inteiro, e os 5 ausentes
 *  parecem os piores.
 *
 *  ── Três naturezas, e a terceira é nova ────────────────────────────────────
 *    PROBLEMA          o site ou a venda está quebrado agora
 *    ATENÇÃO           merece investigação; pode não ser problema
 *    FALHA DE MEDIÇÃO  NÓS não conseguimos medir — não é sobre o cliente
 *
 *  A terceira nasceu de um falso positivo real: o PageSpeed dá timeout na
 *  coleta da manhã e volta na remedição manual. Isso pintava de vermelho um
 *  site no ar, com SSL válido e recebendo tráfego. Ver `FONTES_DE_MEDICAO`.
 *
 *  ── Nenhuma chamada de IA ──────────────────────────────────────────────────
 *  A página inteira sai de snapshots já coletados. A única fonte nova é a
 *  consulta agregada de histórico, que lê o que os jobs diários gravaram.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import {
  AlertTriangle, ArrowUpRight, CheckCircle2, Globe2, Loader2, Lock,
  RefreshCw, Search, ShieldAlert, ShoppingCart, Wrench,
} from "lucide-react";
import { MetaDashboardLayout } from "@/components/MetaDashboardLayout";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { canManageContent } from "@shared/permissions";
import { toast } from "sonner";
import {
  avaliarCliente, coberturaComparavel, funilVisual, indicadorDoSite, ordenarClientes,
  rankingProdutos, distribuicaoStatus, resumoPortfolio, segurancaDoPortfolio,
  resumoDeSeguranca, segurancaDoSite, temEcommerce, vendasDe, fmtDia,
} from "@shared/panoramaLogic";
import {
  JANELA_PAGESPEED_DIAS, PISO_MEDICOES, faixaDoLighthouse, historicoPagespeed,
  textoDaBase, valorDeRanking,
} from "@shared/pagespeedHistorico";
import {
  type Achado, type ClientePanorama, type Nivel, type SegurancaDoSite,
} from "@shared/panoramaLogic";
import { BarraSaude, ChipStatus, Funil, RankingProdutos, DistribuicaoStatus } from "./panorama/Visuais";

const NIVEL_UI: Record<Nivel, { rotulo: string; ponto: string; texto: string; fundo: string }> = {
  critico:   { rotulo: "Problema",  ponto: "#D65745", texto: "text-destructive",      fundo: "bg-destructive/10 border-destructive/25" },
  atencao:   { rotulo: "Atenção",   ponto: "#E0A030", texto: "text-amber-700",        fundo: "bg-amber-500/10 border-amber-500/25" },
  ok:        { rotulo: "Saudável",  ponto: "#3FA66A", texto: "text-emerald-700",      fundo: "bg-emerald-500/10 border-emerald-500/25" },
  sem_dados: { rotulo: "Sem dados", ponto: "#8C8C8C", texto: "text-muted-foreground", fundo: "bg-muted border-border" },
};

/** O tom de cada natureza de achado — problema, atenção e falha de medição. */
const TOM_ACHADO: Record<string, { rotulo: string; classe: string }> = {
  critico: { rotulo: "Problema", classe: "bg-destructive/12 text-destructive" },
  atencao: { rotulo: "Atenção", classe: "bg-amber-500/14 text-amber-700" },
  medicao: { rotulo: "Medição", classe: "bg-sky-500/12 text-sky-700" },
  info:    { rotulo: "Nota", classe: "bg-muted text-muted-foreground" },
};

/** O tom da coluna de segurança — mesma paleta funcional do resto da página. */
const TOM_SEGURANCA: Record<string, string> = {
  ok: "text-foreground",
  atencao: "text-amber-700",
  critico: "text-destructive",
  vazio: "text-muted-foreground/40",
};

const ESTADO_INDICADOR: Record<string, string> = {
  ok: "text-foreground",
  atencao: "text-amber-700",
  critico: "text-destructive",
  vazio: "text-muted-foreground/40",
};

const fmt = (n: number) => n.toLocaleString("pt-BR");

function LinkSite({ accountId, aba, children }: {
  accountId: number; aba?: string; children: React.ReactNode;
}) {
  return (
    <Link href={`/site?account=${accountId}${aba ? `&aba=${aba}` : ""}`}>
      <span className="cursor-pointer hover:underline inline-flex items-center gap-0.5">
        {children} <ArrowUpRight className="w-3 h-3 opacity-40" />
      </span>
    </Link>
  );
}

export default function Panorama() {
  const { user } = useAuth();
  const podeVer = canManageContent(user?.role);
  const q = trpc.panorama.sites.useQuery(undefined, { enabled: podeVer });
  /**
   * O histórico vem SEPARADO, e sem bloquear o resto.
   *
   * A página inteira funciona sem gráfico; juntar as duas consultas faria uma
   * falha no histórico levar o panorama junto.
   */
  const qHist = trpc.panorama.historico.useQuery({ dias: 60 }, { enabled: podeVer });

  const [filtro, setFiltro] = useState<Nivel | "todos">("todos");
  const [busca, setBusca] = useState("");

  const clientes = useMemo(() => (q.data ?? []) as ClientePanorama[], [q.data]);

  const linhas = useMemo(() => ordenarClientes(
    clientes.map((c) => ({
      cliente: c, nome: c.nome,
      ...avaliarCliente(c, (c as { contextosDePonto?: Array<{ chave: string; texto: string }> }).contextosDePonto ?? []),
    })),
  ), [clientes]);

  const resumo = useMemo(
    () => resumoPortfolio(linhas.map((l) => ({ nivel: l.nivel, achados: l.achados })), clientes),
    [linhas, clientes]);
  const seguranca = useMemo(() => segurancaDoPortfolio(clientes), [clientes]);
  const cobertura = useMemo(() => coberturaComparavel(clientes), [clientes]);

  /**
   * "Precisa da minha atenção": os abertos, do pior para o mais leve.
   *
   * Falha de medição entra SEPARADA, no fim — ela não é problema do cliente, e
   * misturá-la faria a lista mandar remedir um teste antes de olhar um checkout
   * vazando.
   */
  const pendencias = useMemo(() => {
    const itens = linhas.flatMap((l) => l.achados
      .filter((a) => a.status !== "contextualizado" && a.severidade !== "info")
      .map((a) => ({ achado: a, nome: l.nome, accountId: l.cliente.accountId })));
    const peso: Record<string, number> = { critico: 0, atencao: 1, medicao: 2 };
    return itens.sort((a, b) => peso[a.achado.severidade] - peso[b.achado.severidade]
      || a.nome.localeCompare(b.nome, "pt-BR"));
  }, [linhas]);

  /** Os achados que a equipe já explicou — ficam consultáveis, sem contar. */
  const explicados = useMemo(() => linhas.flatMap((l) => l.achados
    .filter((a) => a.status === "contextualizado")
    .map((a) => ({ achado: a, nome: l.nome, accountId: l.cliente.accountId }))),
    [linhas]);

  /**
   * A explicação que a equipe deu a um achado.
   *
   * Vem no payload por CLIENTE, e nunca numa lista global de chaves:
   * `purchase_sem_valor` explicado num cliente silenciaria o mesmo alerta em
   * toda conta que tivesse pedido sem valor.
   */
  const contextoDe = useMemo(() => (accountId: number, chave: string): string | null => {
    const c = clientes.find((x) => x.accountId === accountId) as
      { contextosDePonto?: Array<{ chave: string; texto: string }> } | undefined;
    return c?.contextosDePonto?.find((x) => x.chave === chave)?.texto ?? null;
  }, [clientes]);

  const visiveis = useMemo(() => linhas
    .filter((l) => (filtro === "todos" ? true : l.nivel === filtro))
    .filter((l) => (busca.trim() ? l.nome.toLowerCase().includes(busca.trim().toLowerCase()) : true)),
    [linhas, filtro, busca]);

  const lojas = useMemo(() => linhas.filter((l) => temEcommerce(l.cliente)), [linhas]);

  if (!podeVer) {
    return (
      <MetaDashboardLayout title="Panorama de Sites">
        <div className="p-6">
          <div className="bg-card border border-border rounded-[20px] p-8 text-center">
            <Globe2 className="w-8 h-8 mx-auto text-muted-foreground/40 mb-3" />
            <h2 className="text-sm font-bold">Sem acesso a esta tela</h2>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
              O Panorama de Sites é uma visão de gestão, de administradores e desenvolvedores.
            </p>
          </div>
        </div>
      </MetaDashboardLayout>
    );
  }

  return (
    <MetaDashboardLayout title="Panorama de Sites">
      <div className="flex flex-col gap-3 px-6 pt-6 pb-24 max-w-[1440px] mx-auto">
        {/* O cabeçalho não é a informação: ele identifica a tela e sai da
            frente. Uma faixa de 46px com título de 24px empurrava a primeira
            leitura para baixo da dobra em telas de notebook. */}
        <header className="flex items-center gap-3 min-w-0 mb-0.5">
          <span className="w-8 h-8 rounded-[10px] bg-foreground text-background
                           grid place-items-center flex-shrink-0">
            <Globe2 className="w-4 h-4" strokeWidth={2.2} />
          </span>
          <h1 className="text-[17px] font-bold tracking-[-0.01em] leading-none">Panorama de Sites</h1>
          <span className="text-[11px] text-muted-foreground/60 truncate">
            cada número declara a fonte e a data
          </span>
        </header>

        {q.isLoading && (
          <div className="flex items-center justify-center h-40 text-muted-foreground gap-2">
            <Loader2 className="w-5 h-5 animate-spin" /> Carregando o panorama…
          </div>
        )}

        {!q.isLoading && clientes.length === 0 && (
          <div className="rounded-[20px] border border-dashed border-border bg-card px-5 py-8 text-center">
            <p className="text-sm font-medium">Nenhum cliente com site no portfólio.</p>
            <p className="text-xs text-muted-foreground mt-1.5">
              Sites aparecem aqui depois que o domínio é informado em Configurações do cliente.
            </p>
          </div>
        )}

        {!q.isLoading && clientes.length > 0 && (
          <>
            {/* ══ 1 · A FAIXA ═══════════════════════════════════════════════
                Uma linha, seis leituras. Segurança entra aqui como razão
                (12/13) em vez de ganhar seção própria: ela é uma contagem, e
                contagem cabe numa célula. */}
            <Kpis resumo={resumo} seguranca={seguranca} />

            {/* ══ 2 · DUAS COLUNAS ══════════════════════════════════════════
                Saúde e pendências convivem: a primeira diz onde o portfólio
                está concentrado, a segunda diz o que fazer hoje. Empilhadas,
                a resposta exigia rolar. */}
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)] gap-3">
              <SaudeESeguranca resumo={resumo} seguranca={seguranca} />
              <PrecisaAtencao pendencias={pendencias} explicados={explicados}
                contextoDe={contextoDe} />
            </div>

            {/*
             * ── O que NÃO mora aqui ──────────────────────────────────────
             * Uma faixa somando os eventos do GA4 entre todos os clientes.
             * Cada site tem estratégia de conversão própria: `whatsapp_click`
             * é central num institucional e irrelevante numa loja, e somá-los
             * produziria um número do portfólio que não é de ninguém.
             *
             * A leitura mora na página individual, onde há o contexto do
             * cliente — ver `Site → Resumo` e `Site → Performance`. A coleta
             * (`metricsJson.eventos`) continua igual e alimenta os dois.
             */}

            {/* ══ 3 · A TABELA DE SITES ═════════════════════════════════════ */}
            <Sites linhas={visiveis} total={linhas.length}
              filtro={filtro} aoFiltrar={setFiltro} busca={busca} aoBuscar={setBusca} />

            {/* ══ 4 · COMPARAÇÃO E EVOLUÇÃO ═════════════════════════════════ */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <Comparacao linhas={linhas} cobertura={cobertura} />
              <Evolucao pontos={qHist.data ?? []} carregando={qHist.isLoading} />
            </div>
            {lojas.length > 0 && <Ecommerce lojas={lojas} />}
          </>
        )}
      </div>
    </MetaDashboardLayout>
  );
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  A faixa — seis leituras numa linha
 * ─────────────────────────────────────────────────────────────────────────────
 *  Segurança entra aqui como RAZÃO (12/13) em vez de ganhar seção própria: ela
 *  é uma contagem, e contagem cabe numa célula. O detalhe — quem está vencendo,
 *  em quantos dias — desce para a coluna da esquerda, onde há espaço para nome.
 *
 *  "Falhas de medição" não vira célula: ela conta um problema NOSSO, e uma
 *  sexta caixa com o mesmo peso das outras cinco a colocaria na mesma leitura
 *  que "com problema". Ela aparece como nota sob "sem dados".
 * ─────────────────────────────────────────────────────────────────────────────
 */
function Kpis({ resumo, seguranca }: {
  resumo: ReturnType<typeof resumoPortfolio>;
  seguranca: ReturnType<typeof segurancaDoPortfolio>;
}) {
  const d = (n: Nivel) => resumo.distribuicao.find((x) => x.nivel === n)?.quantidade ?? 0;
  const segOk = seguranca.ok;
  const segMedidos = seguranca.ok + seguranca.expirando + seguranca.quebrado;

  const celula = (rotulo: string, valor: string, cor: string | null, nota: string) => (
    <div className="flex flex-col px-3.5 py-2.5 min-w-0">
      <span className="flex items-center gap-1.5 text-[9px] font-bold uppercase
                       tracking-[0.11em] text-muted-foreground/70">
        {cor && <i className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: cor }} />}
        {rotulo}
      </span>
      <span className="text-[21px] font-bold tabular-nums leading-none tracking-tight mt-1">
        {valor}
      </span>
      <span className="text-[9.5px] text-muted-foreground/60 mt-0.5 leading-tight truncate">
        {nota}
      </span>
    </div>
  );

  return (
    <section className="rounded-[14px] border border-border bg-card overflow-hidden
                        shadow-[0_1px_2px_rgba(10,10,10,.04)]">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 divide-x divide-y lg:divide-y-0 divide-border">
        {celula("Sites", fmt(resumo.totalClientes), null, "no portfólio")}
        {celula("Saudáveis", fmt(d("ok")), NIVEL_UI.ok.ponto, "sem achado aberto")}
        {celula("Atenção", fmt(d("atencao")), NIVEL_UI.atencao.ponto,
          `${resumo.achadosAtencao} achado(s)`)}
        {celula("Problemas", fmt(d("critico")), NIVEL_UI.critico.ponto,
          `${resumo.achadosCriticos} achado(s)`)}
        {celula("Segurança",
          segMedidos ? `${segOk}/${segMedidos}` : "—",
          seguranca.quebrado > 0 ? "#D65745" : seguranca.expirando > 0 ? "#E0A030" : "#3FA66A",
          segMedidos ? "HTTPS e certificado ok" : "sem verificação")}
      </div>
    </section>
  );
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Saúde + segurança — a coluna estreita da esquerda
 * ─────────────────────────────────────────────────────────────────────────────
 *  As duas respondem "onde o portfólio está" e cabem numa coluna de 340px. A
 *  barra é horizontal e fina: ela mostra PROPORÇÃO, e proporção não precisa de
 *  altura — precisa de largura.
 *
 *  Segurança perdeu a faixa de largura cheia e ganhou o que faltava: os nomes.
 *  Um certificado a 5 dias de vencer aparece com o nome do cliente, e não como
 *  um contador que manda procurar.
 * ─────────────────────────────────────────────────────────────────────────────
 */
function SaudeESeguranca({ resumo, seguranca }: {
  resumo: ReturnType<typeof resumoPortfolio>;
  seguranca: ReturnType<typeof segurancaDoPortfolio>;
}) {
  return (
    <section className="rounded-[14px] border border-border bg-card px-4 py-3.5
                        shadow-[0_1px_2px_rgba(10,10,10,.04)] flex flex-col gap-3">
      <div>
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-[10px] font-bold uppercase tracking-[0.12em]">Saúde do portfólio</h2>
          <span className="text-[9.5px] text-muted-foreground/50">proporção</span>
        </div>
        <div className="mt-2">
          <BarraSaude distribuicao={resumo.distribuicao} total={resumo.totalClientes} />
        </div>
        {resumo.falhasDeMedicao > 0 && (
          <p className="text-[10px] text-sky-700 mt-2 flex items-start gap-1.5 leading-snug">
            <Wrench className="w-3 h-3 flex-shrink-0 mt-[1px]" strokeWidth={2.4} />
            {resumo.falhasDeMedicao} medição(ões) não concluída(s) — não é problema do site.
          </p>
        )}
      </div>

      <div className="border-t border-border pt-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-[10px] font-bold uppercase tracking-[0.12em] flex items-center gap-1.5">
            {seguranca.quebrado > 0
              ? <ShieldAlert className="w-3 h-3 text-destructive" strokeWidth={2.4} />
              : <Lock className="w-3 h-3 text-muted-foreground/60" strokeWidth={2.4} />}
            Segurança
          </h2>
          <span className="text-[9.5px] text-muted-foreground/50">verificação diária</span>
        </div>

        {/* Barra dos quatro estados: mesma gramática da saúde, e por isso a
            leitura é a mesma sem reaprender nada. */}
        {(() => {
          const partes = [
            { n: seguranca.ok, cor: "#3FA66A", r: "ok" },
            { n: seguranca.expirando, cor: "#E0A030", r: "vencendo" },
            { n: seguranca.quebrado, cor: "#D65745", r: "quebrado" },
            { n: seguranca.semMedicao, cor: "#D6D3D1", r: "sem medição" },
          ].filter((p) => p.n > 0);
          const total = partes.reduce((a, b) => a + b.n, 0);
          if (!total) return <p className="text-[10.5px] text-muted-foreground mt-2">Sem verificação.</p>;
          return (
            <>
              <span className="flex h-[6px] rounded-full overflow-hidden bg-muted mt-2">
                {partes.map((p) => (
                  <span key={p.r} style={{ flexGrow: p.n, background: p.cor }}
                    title={`${p.n} ${p.r}`} />
                ))}
              </span>
              <span className="flex flex-wrap gap-x-2.5 gap-y-1 mt-1.5">
                {partes.map((p) => (
                  <span key={p.r} className="inline-flex items-center gap-1 text-[9.5px] text-muted-foreground">
                    <i className="w-1.5 h-1.5 rounded-[2px]" style={{ background: p.cor }} />
                    {p.n} {p.r}
                  </span>
                ))}
              </span>
            </>
          );
        })()}

        {/* Os urgentes, nominais. Contagem sem nome manda procurar. */}
        {seguranca.urgentes.length > 0 && (
          <div className="flex flex-col gap-1 mt-2.5">
            {seguranca.urgentes.map((x: SegurancaDoSite) => (
              <span key={x.accountId} className="text-[10.5px] flex items-baseline gap-1.5">
                <i className="w-1.5 h-1.5 rounded-full flex-shrink-0 translate-y-[-1px]"
                  style={{ background: x.estado === "quebrado" ? "#D65745" : "#E0A030" }} />
                <LinkSite accountId={x.accountId} aba="seguranca">
                  <b className="font-semibold">{x.nome}</b>
                </LinkSite>
                <span className="text-muted-foreground truncate">
                  {x.estado === "quebrado"
                    ? (x.https === false ? "sem HTTPS" : "certificado inválido")
                    : `vence em ${x.diasParaVencer}d`}
                </span>
              </span>
            ))}
          </div>
        )}

        {seguranca.urgentes.length === 0 && seguranca.proximoVencimento?.diasParaVencer != null && (
          <p className="text-[10px] text-muted-foreground/60 mt-2 leading-snug">
            Próximo vencimento: {seguranca.proximoVencimento.nome} em{" "}
            {seguranca.proximoVencimento.diasParaVencer} dias.
          </p>
        )}
      </div>
    </section>
  );
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Precisa da minha atenção — uma linha por achado
 * ─────────────────────────────────────────────────────────────────────────────
 *  Ordenado por severidade, e falha de medição sempre por último: ela não é
 *  problema do cliente, e misturá-la mandaria refazer um teste de PageSpeed
 *  antes de olhar um checkout vazando.
 *
 *  ── Uma linha, e não um cartão ─────────────────────────────────────────────
 *  Cada achado é ponto + cliente + o que houve + ação. Três alertas ocupavam a
 *  altura de um cartão; agora oito cabem no mesmo espaço, e a lista deixa de
 *  precisar de "ver todos" na maior parte dos dias.
 *
 *  A caixa de contexto abre EMPURRANDO a linha, e não sobre ela: um popover
 *  cobriria os achados vizinhos, que é justamente o que se está comparando.
 * ─────────────────────────────────────────────────────────────────────────────
 */
const TETO_PENDENCIAS = 8;

function PrecisaAtencao({ pendencias, explicados, contextoDe }: {
  pendencias: Array<{ achado: Achado; nome: string; accountId: number }>;
  explicados: Array<{ achado: Achado; nome: string; accountId: number }>;
  contextoDe: (accountId: number, chave: string) => string | null;
}) {
  const [todos, setTodos] = useState(false);
  const [abertoEm, setAbertoEm] = useState<string | null>(null);
  const remedir = trpc.clarity.perfSync.useMutation({
    onSuccess: () => toast.success("Medição refeita. O painel atualiza na próxima leitura."),
    onError: (e: { message: string }) => toast.error(e.message),
  });

  if (!pendencias.length && !explicados.length) {
    return (
      <section className="rounded-[14px] border border-emerald-500/25 bg-emerald-500/[0.06]
                          px-4 py-3.5 flex items-center gap-2.5">
        <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" strokeWidth={2.4} />
        <span className="text-[12.5px] text-emerald-800">
          Nenhum achado aberto no portfólio. Nada exige ação agora.
        </span>
      </section>
    );
  }

  const lista = todos ? pendencias : pendencias.slice(0, TETO_PENDENCIAS);

  return (
    <section className="rounded-[14px] border border-border bg-card overflow-hidden
                        shadow-[0_1px_2px_rgba(10,10,10,.04)] flex flex-col">
      <div className="flex items-baseline justify-between gap-2 px-4 pt-3.5">
        <h2 className="text-[10px] font-bold uppercase tracking-[0.12em]">Precisa da minha atenção</h2>
        <span className="text-[9.5px] text-muted-foreground/50">
          {pendencias.length} aberto(s) · do mais grave ao mais leve
        </span>
      </div>

      <div className="flex flex-col mt-1.5">
        {lista.map(({ achado, nome, accountId }) => {
          const id = `${accountId}-${achado.chave}`;
          const tom = TOM_ACHADO[achado.severidade] ?? TOM_ACHADO.info;
          const ehMedicao = achado.severidade === "medicao";
          const ctx = contextoDe(accountId, achado.chave);
          return (
            <div key={id} className="px-4 py-[7px] hover:bg-foreground/[0.02] transition-colors duration-150">
              <div className="flex items-center gap-2 min-w-0">
                <i className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{
                  background: achado.severidade === "critico" ? "#D65745"
                    : achado.severidade === "atencao" ? "#E0A030" : "#2A9FD6",
                }} />
                <span className="text-[11.5px] font-semibold flex-shrink-0 max-w-[110px] truncate">
                  <LinkSite accountId={accountId} aba={achado.aba}>{nome}</LinkSite>
                </span>
                <span className="text-[11px] text-muted-foreground truncate flex-1 min-w-0"
                  title={achado.texto}>
                  {achado.texto}
                </span>
                <span className={`text-[8.5px] font-bold uppercase tracking-[0.08em] px-1.5 py-[2px]
                                  rounded-[4px] flex-shrink-0 ${tom.classe}`}>
                  {tom.rotulo}
                </span>
                {ehMedicao && (
                  <button type="button" onClick={() => remedir.mutate({ accountId })}
                    disabled={remedir.isPending} title="Refazer a medição de PageSpeed"
                    className="text-muted-foreground/50 hover:text-foreground transition-colors
                               duration-150 flex-shrink-0 disabled:opacity-50">
                    <RefreshCw className={`w-3 h-3 ${remedir.isPending ? "animate-spin" : ""}`}
                      strokeWidth={2.2} />
                  </button>
                )}
                {/* Rótulo em PALAVRA, e não um "+".
                    A densidade não pode custar a descoberta: um ícone mudo faz
                    a ação existir para quem já sabe que ela existe, e some para
                    todo mundo. "explicar" cabe na linha e diz o que faz. */}
                <button type="button" onClick={() => setAbertoEm(abertoEm === id ? null : id)}
                  title={ctx ? "Ver o contexto salvo" : "Contextualizar este achado"}
                  className={`text-[9px] font-bold uppercase tracking-[0.06em] px-1.5 py-[2px]
                              rounded-[4px] flex-shrink-0 transition-colors duration-150 ${
                    ctx ? "bg-foreground/[0.07] text-muted-foreground"
                        : "text-muted-foreground/45 hover:text-foreground hover:bg-foreground/[0.05]"}`}>
                  {ctx ? "explicado" : "explicar"}
                </button>
              </div>
              {abertoEm === id && (
                <CaixaDeContexto achado={achado} accountId={accountId} contexto={ctx}
                  aoFechar={() => setAbertoEm(null)} />
              )}
            </div>
          );
        })}
      </div>

      {pendencias.length > TETO_PENDENCIAS && (
        <button type="button" onClick={() => setTodos((v) => !v)}
          className="px-4 py-2 text-[10.5px] font-semibold text-muted-foreground border-t
                     border-border hover:text-foreground hover:bg-foreground/[0.03] transition-colors">
          {todos ? "mostrar menos" : `ver os outros ${pendencias.length - TETO_PENDENCIAS}`}
        </button>
      )}

      {/*
       * Os já explicados, em cinza.
       *
       * O FATO continua consultável — é o pedido de não apagar histórico —, mas
       * ele não disputa atenção com o que está aberto, e não conta em lugar
       * nenhum. Remover a explicação devolve o achado à lista de cima.
       */}
      {explicados.length > 0 && (
        <div className="px-4 py-2 border-t border-border mt-auto">
          <span className="text-[9px] font-bold uppercase tracking-[0.11em] text-muted-foreground/45">
            Já explicados · {explicados.length}
          </span>
          <div className="flex flex-col gap-0.5 mt-1">
            {explicados.map(({ achado, nome, accountId }) => {
              const id = `exp-${accountId}-${achado.chave}`;
              return (
                <div key={id}>
                  <div className="flex items-center gap-2 text-[10.5px] min-w-0">
                    <span className="text-muted-foreground/70 font-semibold flex-shrink-0 max-w-[110px] truncate">
                      {nome}
                    </span>
                    <span className="text-muted-foreground/50 truncate flex-1 min-w-0">{achado.texto}</span>
                    <button type="button" onClick={() => setAbertoEm(abertoEm === id ? null : id)}
                      title="Ver ou remover o contexto salvo"
                      className="text-[9px] uppercase tracking-[0.06em] text-muted-foreground/40
                                 hover:text-foreground flex-shrink-0 transition-colors">
                      ver
                    </button>
                  </div>
                  {abertoEm === id && (
                    <CaixaDeContexto achado={achado} accountId={accountId}
                      contexto={contextoDe(accountId, achado.chave)}
                      aoFechar={() => setAbertoEm(null)} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Contextualizar um achado — a explicação que muda a CLASSIFICAÇÃO
 * ─────────────────────────────────────────────────────────────────────────────
 *  Sobreviveu ao redesign porque é o mecanismo, não um enfeite: quando a equipe
 *  explica um alerta, ele ganha `status: "contextualizado"` e para de contar
 *  como problema aberto — nos contadores do topo, na saúde do portfólio e no
 *  jornalzinho, de uma vez.
 *
 *  O dado NÃO muda. 28,7% continua 28,7% e o achado continua na lista com o
 *  texto original; o que muda é ele deixar de disputar atenção. Remover a
 *  explicação devolve o achado ao estado aberto, porque nada foi apagado.
 *
 *  Salvar recarrega o Panorama inteiro: o status mexe nos contadores e na
 *  posição do cliente, e não só nesta linha.
 * ─────────────────────────────────────────────────────────────────────────────
 */
function CaixaDeContexto({ achado, accountId, contexto, aoFechar }: {
  achado: Achado; accountId: number; contexto: string | null; aoFechar: () => void;
}) {
  const utils = trpc.useUtils();
  const [texto, setTexto] = useState(contexto ?? "");
  useEffect(() => { setTexto(contexto ?? ""); }, [contexto]);

  const salvar = trpc.context.salvarContextoDePonto.useMutation({
    onSuccess: () => {
      aoFechar();
      utils.panorama.sites.invalidate();
      utils.context.analiseVigente.invalidate();
      toast.success("Contexto salvo");
    },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  return (
    <div className="flex flex-col gap-1.5 rounded-[10px] border border-border bg-muted/20 p-2.5
                    w-full mt-1.5">
      <p className="text-[10px] text-muted-foreground leading-snug">
        O que a inteligência precisa saber sobre <em>este</em> ponto. Ela vai reavaliar se ele
        continua sendo problema.
      </p>
      <textarea value={texto} onChange={(e) => setTexto(e.target.value)}
        rows={3} maxLength={2000} autoFocus
        placeholder="Ex.: essa compra foi um teste interno da equipe; o cupom foi criado por nós e não é venda real."
        className="text-[11px] border border-border rounded-lg px-2 py-1.5 bg-background resize-y" />
      <div className="flex items-center gap-2">
        <button type="button"
          onClick={() => salvar.mutate({
            accountId, chave: achado.chave, texto, alertaNaEpoca: achado.texto,
          })}
          disabled={salvar.isPending}
          className="text-[10px] font-semibold px-2 py-1 rounded-lg bg-primary text-primary-foreground
                     disabled:opacity-60">
          {salvar.isPending ? "Salvando…" : "Salvar"}
        </button>
        <button type="button" onClick={() => { setTexto(contexto ?? ""); aoFechar(); }}
          className="text-[10px] text-muted-foreground hover:text-foreground">
          Cancelar
        </button>
        {/* Apagar é salvar vazio — devolve o achado ao estado aberto. */}
        {contexto && (
          <button type="button"
            onClick={() => salvar.mutate({ accountId, chave: achado.chave, texto: "" })}
            disabled={salvar.isPending}
            className="ml-auto text-[10px] text-muted-foreground hover:text-destructive">
            Remover
          </button>
        )}
      </div>
    </div>
  );
}

type Linha = { cliente: ClientePanorama; nome: string; nivel: Nivel; achados: Achado[] };

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Sites — tabela densa, não grade de cartões
 * ─────────────────────────────────────────────────────────────────────────────
 *  Treze cartões de três colunas ocupavam cinco dobras para mostrar o que uma
 *  tabela mostra numa. E a pergunta aqui é comparativa — "quem está pior?" —,
 *  que se responde varrendo uma coluna com o olho, não pulando entre cartões.
 *
 *  ── O rótulo do indicador é uma COLUNA, e não um detalhe ───────────────────
 *  Não existe régua única no portfólio. A coluna "indicador" traz o nome do que
 *  está sendo medido ao lado do número, para "88" e "No ar" nunca parecerem a
 *  mesma escala. Sem ela, a tabela mentiria por alinhamento.
 * ─────────────────────────────────────────────────────────────────────────────
 */
function Sites({ linhas, total, filtro, aoFiltrar, busca, aoBuscar }: {
  linhas: Linha[]; total: number;
  filtro: Nivel | "todos"; aoFiltrar: (n: Nivel | "todos") => void;
  busca: string; aoBuscar: (s: string) => void;
}) {
  const chip = (ativo: boolean) =>
    `text-[9.5px] px-2 py-[3px] rounded-md border transition-colors duration-150 ${
      ativo ? "bg-foreground text-background border-foreground"
            : "border-border text-muted-foreground hover:text-foreground"}`;

  const GRADE = "grid grid-cols-[minmax(0,1.1fr)_86px_minmax(0,0.9fr)_minmax(0,1fr)] "
    + "sm:grid-cols-[minmax(0,1fr)_88px_minmax(0,0.85fr)_minmax(0,0.95fr)_minmax(0,1.5fr)_70px] "
    + "gap-2.5 items-center";

  return (
    <section className="rounded-[14px] border border-border bg-card overflow-hidden
                        shadow-[0_1px_2px_rgba(10,10,10,.04)]">
      <div className="flex items-baseline justify-between gap-2 flex-wrap px-4 pt-3.5">
        <div className="flex items-baseline gap-2.5 flex-wrap">
          <h2 className="text-[10px] font-bold uppercase tracking-[0.12em]">Sites</h2>
          <span className="text-[9.5px] text-muted-foreground/50">
            {linhas.length === total ? `${total} no portfólio` : `${linhas.length} de ${total}`}
            {" · cada um mostra o indicador mais objetivo que tem"}
          </span>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="relative">
            <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
            <input value={busca} onChange={(e) => aoBuscar(e.target.value)}
              placeholder="Buscar…"
              className="text-[10.5px] pl-6 pr-2 py-[3px] rounded-md border border-border
                         bg-transparent w-[120px] focus:outline-none focus:ring-1 focus:ring-ring" />
          </span>
          <button type="button" onClick={() => aoFiltrar("todos")} className={chip(filtro === "todos")}>
            todos
          </button>
          {(["critico", "atencao", "ok", "sem_dados"] as Nivel[]).map((n) => (
            <button key={n} type="button" onClick={() => aoFiltrar(n)} className={chip(filtro === n)}>
              {NIVEL_UI[n].rotulo}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto mt-2.5">
        <div className="min-w-[720px]">
          <div className={`${GRADE} px-4 pb-1.5 text-[8.5px] font-bold uppercase
                           tracking-[0.1em] text-muted-foreground/50 border-b border-border`}>
            <span>Cliente</span>
            <span>Status</span>
            <span>Performance</span>
            <span className="hidden sm:block">Segurança</span>
            <span>Achados abertos</span>
            <span className="hidden sm:block text-right">Coleta</span>
          </div>

          <div className="flex flex-col divide-y divide-border/60">
            {!linhas.length && (
              <p className="text-[11.5px] text-muted-foreground py-8 text-center">
                Nenhum site com esse filtro.
              </p>
            )}
            {linhas.map((l) => <LinhaDoSite key={l.cliente.accountId} l={l} grade={GRADE} />)}
          </div>
        </div>
      </div>
    </section>
  );
}

function LinhaDoSite({ l, grade }: { l: Linha; grade: string }) {
  const ind = indicadorDoSite(l.cliente);
  const seg = segurancaDoSite(l.cliente);
  const leitura = resumoDeSeguranca(seg);
  const ui = NIVEL_UI[l.nivel];
  const abertos = l.achados.filter((a) => a.status !== "contextualizado" && a.severidade !== "info");
  const problemas = abertos.filter((a) => a.severidade !== "medicao");
  const medicoes = abertos.filter((a) => a.severidade === "medicao");
  const venda = vendasDe(l.cliente);

  return (
    <Link href={`/site?account=${l.cliente.accountId}`}>
      <div className={`${grade} px-4 py-2 cursor-pointer hover:bg-foreground/[0.025]
                       transition-colors duration-150`}>
        <span className="text-[12px] font-semibold truncate min-w-0">{l.nome}</span>

        <span className={`inline-flex items-center gap-1.5 text-[9.5px] font-bold uppercase
                          tracking-[0.07em] ${ui.texto}`}>
          <i className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: ui.ponto }} />
          {ui.rotulo}
        </span>

        {/* Número e RÓTULO juntos: sem o segundo, "88" e "No ar" alinhados na
            mesma coluna pareceriam a mesma régua. */}
        <span className="min-w-0">
          <span className={`text-[13px] font-bold tabular-nums ${ESTADO_INDICADOR[ind.estado]}`}>
            {ind.valor}
          </span>
          {ind.unidade && (
            <span className="text-[9.5px] text-muted-foreground/60 ml-1">{ind.unidade}</span>
          )}
          <span className="block text-[9px] uppercase tracking-[0.08em] text-muted-foreground/55 truncate"
            title={ind.fonte ?? undefined}>
            {ind.rotulo}
          </span>
        </span>

        {/*
         * Segurança — coluna própria, do mesmo tamanho da performance.
         *
         * O número é o score do verificador, com a composição documentada em
         * `siteHealthService`; o texto abaixo é o fato que manda (sem HTTPS,
         * certificado inválido, prazo). A mesma semântica que a página
         * individual do cliente mostra — ler o `status` gravado, em vez de
         * recalcular, é o que impede as duas telas de discordarem.
         */}
        <span className="hidden sm:block min-w-0">
          {seg.estado === "sem_medicao" ? (
            <span className="text-[10.5px] text-muted-foreground/40">sem verificação</span>
          ) : (
            <>
              <span className="flex items-baseline gap-1">
                {seg.score != null && (
                  <span className={`text-[13px] font-bold tabular-nums ${TOM_SEGURANCA[leitura.tom]}`}>
                    {seg.score}
                  </span>
                )}
                <span className={`text-[10px] truncate ${
                  seg.score != null ? "text-muted-foreground/60" : TOM_SEGURANCA[leitura.tom]}`}
                  title={seg.score != null
                    ? "Nota de segurança 0–100: HTTPS, certificado e headers de proteção"
                    : undefined}>
                  {seg.score != null ? "de 100" : leitura.texto}
                </span>
              </span>
              <span className={`block text-[9.5px] truncate ${
                leitura.tom === "ok" ? "text-muted-foreground/55" : TOM_SEGURANCA[leitura.tom]}`}>
                {seg.score != null ? leitura.texto : "verificação diária"}
              </span>
            </>
          )}
        </span>

        <span className="min-w-0 flex flex-col gap-0.5">
          {problemas.slice(0, 2).map((a) => (
            <span key={a.chave} className="flex items-center gap-1.5 text-[10.5px] min-w-0">
              <i className="w-1 h-1 rounded-full flex-shrink-0" style={{
                background: a.severidade === "critico" ? "#D65745" : "#E0A030" }} />
              <span className="text-muted-foreground truncate" title={a.texto}>{a.texto}</span>
            </span>
          ))}
          {problemas.length > 2 && (
            <span className="text-[9.5px] text-muted-foreground/50 pl-[10px]">
              + {problemas.length - 2} outro(s)
            </span>
          )}
          {/* Falha de medição em faixa própria e em azul: não é problema do
              cliente, e o azul é o tom neutro do sistema. */}
          {medicoes.map((a) => (
            <span key={a.chave} className="flex items-center gap-1.5 text-[10.5px] min-w-0">
              <Wrench className="w-2.5 h-2.5 flex-shrink-0 text-sky-600" strokeWidth={2.6} />
              <span className="text-sky-700/80 truncate" title={a.texto}>{a.texto}</span>
            </span>
          ))}
          {!problemas.length && !medicoes.length && (
            <span className="text-[10.5px] text-muted-foreground/45 truncate">
              {venda?.receita != null
                ? `venda ${venda.rotuloFonte} · ${venda.janela}`
                : "nenhum achado aberto"}
            </span>
          )}
        </span>

        <span className="hidden sm:block text-[10px] tabular-nums text-muted-foreground/55 text-right">
          {ind.dia ? fmtDia(ind.dia) : "—"}
        </span>
      </div>
    </Link>
  );
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Comparação técnica — a MEDIANA manda no ranking
 * ─────────────────────────────────────────────────────────────────────────────
 *  O ranking lia a última medição, e virava de ponta-cabeça com ela. Caso real:
 *  a UMA marcou ~90, ~41 no dia seguinte e voltou ao topo na remedição manual —
 *  um teste sintético instável pintando de vermelho um site que costuma ser bom.
 *
 *  A pergunta desta seção é "quem COSTUMA ir pior", e não "quem teve a pior
 *  medição hoje". A mediana responde a primeira e é imune ao outlier; a última
 *  medição fica ao lado, porque degradação recente também importa.
 *
 *  ── A cobertura continua dita ──────────────────────────────────────────────
 *  Um ranking de 8 linhas num portfólio de 13 se lê como o portfólio inteiro, e
 *  os 5 ausentes parecem os piores.
 * ─────────────────────────────────────────────────────────────────────────────
 */
const COR_FAIXA: Record<string, string> = {
  bom: "#3FA66A", medio: "#E0A030", ruim: "#D65745", vazio: "#D6D3D1",
};

function Comparacao({ linhas, cobertura }: {
  linhas: Linha[]; cobertura: { com: number; total: number };
}) {
  const comparaveis = linhas
    .map((l) => ({ l, h: historicoPagespeed(l.cliente.pagespeedSerie ?? []) }))
    .filter((x) => valorDeRanking(x.h) != null)
    .sort((a, b) => (valorDeRanking(b.h) as number) - (valorDeRanking(a.h) as number));

  return (
    <section className="rounded-[14px] border border-border bg-card px-4 py-3.5
                        shadow-[0_1px_2px_rgba(10,10,10,.04)] flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <h2 className="text-[10px] font-bold uppercase tracking-[0.12em]">Comparação técnica</h2>
        <span className="text-[9.5px] text-muted-foreground/50">
          PageSpeed mobile · mediana de {JANELA_PAGESPEED_DIAS}d · {comparaveis.length} de {cobertura.total}
        </span>
      </div>

      {!comparaveis.length ? (
        <p className="text-[11.5px] text-muted-foreground leading-snug">
          Nenhum site com medição de PageSpeed nos últimos {JANELA_PAGESPEED_DIAS} dias. A comparação
          entre clientes exige a mesma régua, e ela é a única métrica com escala absoluta e método
          idêntico.
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-1.5">
            {comparaveis.map(({ l, h }) => {
              const valor = valorDeRanking(h) as number;
              const cor = COR_FAIXA[faixaDoLighthouse(valor)];
              return (
                <div key={l.cliente.accountId} className="flex items-center gap-2.5">
                  <span className="text-[11px] truncate w-[96px] flex-shrink-0">
                    <LinkSite accountId={l.cliente.accountId} aba="tecnico">{l.nome}</LinkSite>
                  </span>
                  <span className="flex-1 h-[6px] rounded-full bg-muted overflow-hidden">
                    {/* A cor sai da faixa do próprio Lighthouse, e não de um
                        ranking relativo: o último colocado de um portfólio bom
                        não é vermelho. */}
                    <span className="block h-full rounded-full"
                      style={{ width: `${valor}%`, background: cor }} />
                  </span>
                  <span className="text-[11.5px] font-bold tabular-nums w-[24px] text-right flex-shrink-0">
                    {Math.round(valor)}
                  </span>
                  {/*
                   * A última medição ao lado, com a seta só quando ela se
                   * afasta do costume. É informação de estado atual — não muda
                   * o nível do cliente, que continua vindo de `avaliarCliente`.
                   */}
                  <span className="text-[9.5px] tabular-nums w-[66px] text-right flex-shrink-0
                                   text-muted-foreground/60 truncate"
                    title={`${textoDaBase(h)}${h.ultima != null ? ` · última medição ${h.ultima}` : ""}`}>
                    {h.ultima != null && h.temBase ? (
                      <>
                        {h.desvioNotavel && (
                          <span className={h.desvio! < 0 ? "text-destructive" : "text-emerald-600"}>
                            {h.desvio! < 0 ? "↓" : "↑"}
                          </span>
                        )}
                        {" "}{Math.round(h.ultima)} agora
                      </>
                    ) : (
                      `${h.quantidade}×`
                    )}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="text-[9.5px] text-muted-foreground/55 leading-snug">
            Escala 0–100 do Lighthouse, mobile. O ranking usa a <b>mediana</b> das medições
            disponíveis — uma medição isolada instável não muda a posição. Sites com menos de{" "}
            {PISO_MEDICOES} medições aparecem pela última, marcados com a contagem.
            {cobertura.total > comparaveis.length && (
              <> Os {cobertura.total - comparaveis.length} site(s) fora da lista não têm medição;
              ausência aqui não é nota baixa.</>
            )}
          </p>
        </>
      )}
    </section>
  );
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Evolução — a média de PageSpeed do portfólio, dia a dia
 * ─────────────────────────────────────────────────────────────────────────────
 *  Mesma gramática de leitura da Evolução da Base, na Social: data em tom de
 *  texto, valor na cor da série, nome da métrica junto.
 *
 *  ── O denominador viaja com o ponto ────────────────────────────────────────
 *  Cada dia traz quantos sites entraram na média. Sem isso, um dia em que só
 *  três dos treze foram medidos desenharia um ponto com o mesmo peso visual de
 *  um dia completo — e a linha subiria por mudança de amostra, não de
 *  performance. O hover mostra os dois.
 * ─────────────────────────────────────────────────────────────────────────────
 */
const COR_EVOLUCAO = "#2A9FD6";

function Evolucao({ pontos, carregando }: {
  pontos: Array<{ dia: string; media: number; sites: number }>; carregando: boolean;
}) {
  const [ativo, setAtivo] = useState<number | null>(null);

  if (carregando) {
    return (
        <section className="rounded-[14px] border border-border bg-card px-4 py-3.5
                          flex items-center justify-center h-[150px] text-muted-foreground gap-2">
        <Loader2 className="w-4 h-4 animate-spin" /> <span className="text-xs">Lendo o histórico…</span>
      </section>
    );
  }

  return (
    <section className="rounded-[14px] border border-border bg-card px-4 py-3.5
                        shadow-[0_1px_2px_rgba(10,10,10,.04)] flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3 flex-wrap min-h-[16px]">
        <div className="flex items-baseline gap-2.5 flex-wrap">
          <h2 className="text-[10px] font-bold uppercase tracking-[0.12em]">Evolução do portfólio</h2>
          {ativo == null && (
            <span className="text-[9.5px] text-muted-foreground/50">
              média de PageSpeed · até 60 dias
            </span>
          )}
        </div>
        {/* A leitura substitui a nota, e não flutua: um balão mexeria na altura
            do cabeçalho a cada movimento do mouse. */}
        {ativo != null && pontos[ativo] && (
          <span className="flex items-center gap-2.5 text-[11px] tabular-nums">
            <span className="font-bold">
              {pontos[ativo].dia.slice(8, 10)}/{pontos[ativo].dia.slice(5, 7)}
            </span>
            <span className="font-bold" style={{ color: COR_EVOLUCAO }}>
              {pontos[ativo].media} PageSpeed
            </span>
            <span className="text-muted-foreground/70">
              {pontos[ativo].sites} site(s) na média
            </span>
          </span>
        )}
      </div>

      {pontos.length < 2 ? (
        <div className="h-[108px] flex flex-col items-center justify-center text-center gap-1">
          <p className="text-[12px] font-medium">Histórico insuficiente para desenhar evolução</p>
          <p className="text-[11px] text-muted-foreground max-w-[46ch] leading-snug">
            {pontos.length === 0
              ? "Nenhuma medição de PageSpeed registrada nos últimos 60 dias."
              : "Há um dia medido. Com um ponto não existe curva — existe um número."}
          </p>
        </div>
      ) : (
        <CurvaDoPortfolio pontos={pontos} ativo={ativo} aoEntrar={setAtivo} />
      )}
    </section>
  );
}

/** Mesmo desenho da CurvaHistorica da Social: área suave, extremos no eixo. */
function CurvaDoPortfolio({ pontos, ativo, aoEntrar }: {
  pontos: Array<{ dia: string; media: number; sites: number }>;
  ativo: number | null; aoEntrar: (i: number | null) => void;
}) {
  const W = 560, H = 108, ml = 28, mr = 10, mt = 8, mb = 16;
  const iw = W - ml - mr, ih = H - mt - mb;
  const vals = pontos.map((p) => p.media);
  const min = Math.min(...vals), max = Math.max(...vals);
  const folga = Math.max(1, (max - min) * 0.12);
  const piso = Math.max(0, min - folga), teto = Math.min(100, max + folga);

  const x = (i: number) => ml + (pontos.length < 2 ? iw / 2 : (i / (pontos.length - 1)) * iw);
  const y = (v: number) => mt + ih - ((v - piso) / Math.max(1, teto - piso)) * ih;
  const area = `M${x(0).toFixed(1)},${(mt + ih).toFixed(1)} `
    + pontos.map((p, i) => `L${x(i).toFixed(1)},${y(p.media).toFixed(1)}`).join(" ")
    + ` L${x(pontos.length - 1).toFixed(1)},${(mt + ih).toFixed(1)} Z`;
  const passo = Math.max(1, Math.ceil(pontos.length / 8));
  const faixa = iw / Math.max(1, pontos.length - 1);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img"
      aria-label="Média de PageSpeed do portfólio no histórico disponível"
      onMouseLeave={() => aoEntrar(null)}>
      <defs>
        <linearGradient id="curva-portfolio" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={COR_EVOLUCAO} stopOpacity={0.22} />
          <stop offset="100%" stopColor={COR_EVOLUCAO} stopOpacity={0.02} />
        </linearGradient>
      </defs>
      {[teto, piso].map((v, k) => {
        const yy = k === 0 ? mt : mt + ih;
        return (
          <g key={k}>
            <line x1={ml} x2={W - mr} y1={yy} y2={yy}
              className="stroke-[rgba(10,10,10,.07)] dark:stroke-[rgba(255,255,255,.09)]"
              strokeDasharray="3 4" />
            <text x={ml - 6} y={yy + 3.5} textAnchor="end" fontSize={9}
              className="fill-muted-foreground">{Math.round(v)}</text>
          </g>
        );
      })}
      <path d={area} fill="url(#curva-portfolio)" />
      {pontos.slice(1).map((p, k) => (
        <line key={p.dia} x1={x(k)} y1={y(pontos[k].media)} x2={x(k + 1)} y2={y(p.media)}
          stroke={COR_EVOLUCAO} strokeWidth={2.2} strokeLinecap="round" />
      ))}
      {pontos.length <= 20 && pontos.map((p, i) => (
        <circle key={`p${p.dia}`} cx={x(i)} cy={y(p.media)} r={2.4} fill={COR_EVOLUCAO}
          opacity={ativo == null || ativo === i ? 1 : 0.4} />
      ))}
      {ativo != null && pontos[ativo] && (
        <>
          <line x1={x(ativo)} x2={x(ativo)} y1={mt} y2={mt + ih}
            className="stroke-[rgba(10,10,10,.16)]" strokeWidth={1} />
          <circle cx={x(ativo)} cy={y(pontos[ativo].media)} r={3.6}
            fill={COR_EVOLUCAO} stroke="white" strokeWidth={1.5} />
        </>
      )}
      {pontos.map((p, i) => (
        <rect key={`h${p.dia}`} x={x(i) - faixa / 2} y={0} width={faixa} height={H}
          fill="transparent" style={{ cursor: "pointer" }} onMouseEnter={() => aoEntrar(i)} />
      ))}
      {pontos.map((p, i) => (i % passo ? null : (
        <text key={`r${p.dia}`} x={x(i)} y={H - 5} textAnchor="middle" fontSize={9}
          className="fill-muted-foreground">
          {p.dia.slice(8, 10)}/{p.dia.slice(5, 7)}
        </text>
      )))}
    </svg>
  );
}

/** E-commerce — só quem tem base real, e recolhido por padrão. */
function Ecommerce({ lojas }: { lojas: Linha[] }) {
  const [aberto, setAberto] = useState(false);
  return (
    <section className="rounded-[14px] border border-border bg-card overflow-hidden
                        shadow-[0_1px_2px_rgba(10,10,10,.04)]">
      <button type="button" onClick={() => setAberto((v) => !v)}
        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left
                   hover:bg-foreground/[0.02] transition-colors duration-150">
        <ShoppingCart className="w-4 h-4 text-muted-foreground" strokeWidth={2.2} />
        <span className="text-[10px] font-bold uppercase tracking-[0.12em]">E-commerce</span>
        <span className="text-[10.5px] text-muted-foreground/55">
          {lojas.length} cliente(s) com base de venda
        </span>
        <span className="ml-auto text-[10px] text-muted-foreground">
          {aberto ? "recolher" : "abrir"}
        </span>
      </button>
      {aberto && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 px-5 pb-5">
          {lojas.map((l) => {
            const v = vendasDe(l.cliente)!;
            const funil = funilVisual(l.cliente);
            const ranking = rankingProdutos(l.cliente);
            const dist = distribuicaoStatus(l.cliente);
            return (
              <div key={l.cliente.accountId}
                className="rounded-[16px] border border-border p-4 flex flex-col gap-3.5">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[13px] font-bold">
                    <LinkSite accountId={l.cliente.accountId}>{l.nome}</LinkSite>
                  </span>
                  <ChipStatus tom={v.fonte === "loja" ? "ok" : "neutro"}
                    titulo={v.fonte === "loja"
                      ? "Receita real da loja"
                      : "GA4 como fonte inicial — não é o caixa da loja"}>
                    {v.rotuloFonte} · {v.janela}
                  </ChipStatus>
                </div>
                {funil && <Funil funil={funil} />}
                {ranking && <RankingProdutos ranking={ranking} />}
                {dist && <DistribuicaoStatus dist={dist} />}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
