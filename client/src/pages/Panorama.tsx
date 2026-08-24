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
  temEcommerce, vendasDe, fmtDia, SSL_AVISO_DIAS,
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
      <div className="flex flex-col gap-[22px] px-6 pt-7 pb-24 max-w-[1320px] mx-auto">
        <header className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3.5 min-w-0">
            <span className="w-[46px] h-[46px] rounded-[14px] bg-foreground text-background
                             grid place-items-center flex-shrink-0">
              <Globe2 className="w-5 h-5" strokeWidth={2} />
            </span>
            <div className="min-w-0">
              <h1 className="text-2xl font-bold tracking-[-0.02em] leading-none">Panorama de Sites</h1>
              <p className="text-[12.5px] text-muted-foreground mt-1.5">
                Visão geral do portfólio · cada número declara a fonte e a data
              </p>
            </div>
          </div>
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
            <Kpis resumo={resumo} />
            <Seguranca s={seguranca} />
            <PrecisaAtencao pendencias={pendencias} explicados={explicados}
              contextoDe={contextoDe} />
            <Sites linhas={visiveis} total={linhas.length}
              filtro={filtro} aoFiltrar={setFiltro} busca={busca} aoBuscar={setBusca} />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-[22px]">
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
 * A leitura rápida do portfólio.
 *
 * "Falhas de medição" ganha caixa própria e NÃO soma com os outros: ela conta
 * um problema nosso, não do cliente, e misturá-la faria o número de problemas
 * subir por dois motivos incomparáveis — um pede remedir, o outro pede agir.
 */
function Kpis({ resumo }: { resumo: ReturnType<typeof resumoPortfolio> }) {
  const caixa = (rotulo: string, valor: number, cor: string, nota?: string) => (
    <div className="flex flex-col px-4 py-4 min-w-0 transition-colors duration-150 hover:bg-foreground/[0.02]">
      <span className="flex items-center gap-1.5 text-[9.5px] font-bold uppercase
                       tracking-[0.12em] text-muted-foreground mb-1.5">
        <i className="w-2 h-2 rounded-[3px] flex-shrink-0" style={{ background: cor }} />
        {rotulo}
      </span>
      <span className="text-[26px] font-bold tabular-nums leading-none tracking-tight">{fmt(valor)}</span>
      {nota && <span className="text-[10.5px] text-muted-foreground mt-1.5 leading-snug">{nota}</span>}
    </div>
  );
  const d = (n: Nivel) => resumo.distribuicao.find((x) => x.nivel === n)?.quantidade ?? 0;

  return (
    <section className="rounded-[20px] border border-border bg-card overflow-hidden
                        shadow-[0_1px_2px_rgba(10,10,10,.04)]">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 divide-x divide-y lg:divide-y-0 divide-border">
        {caixa("Sites", resumo.totalClientes, "#8C8C8C", "no portfólio")}
        {caixa("Saudáveis", d("ok"), NIVEL_UI.ok.ponto, "sem achado aberto")}
        {caixa("Em atenção", d("atencao"), NIVEL_UI.atencao.ponto,
          `${resumo.achadosAtencao} achado(s)`)}
        {caixa("Com problema", d("critico"), NIVEL_UI.critico.ponto,
          `${resumo.achadosCriticos} achado(s)`)}
        {caixa("Sem dados", d("sem_dados"), "#8C8C8C",
          resumo.falhasDeMedicao > 0
            ? `+ ${resumo.falhasDeMedicao} medição(ões) falhada(s)`
            : "nada conectado")}
      </div>
      <div className="px-5 py-3.5 border-t border-border">
        <div className="flex items-baseline gap-2.5 mb-2">
          <span className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
            Saúde do portfólio
          </span>
          <span className="text-[10px] text-muted-foreground/55">
            proporção, não ranking
          </span>
        </div>
        <BarraSaude distribuicao={resumo.distribuicao} total={resumo.totalClientes} />
      </div>
    </section>
  );
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Segurança — faixa executiva, com peso próprio
 * ─────────────────────────────────────────────────────────────────────────────
 *  HTTPS e validade de certificado são os fatos mais objetivos do portfólio: ou
 *  o site serve em HTTPS ou não; ou o certificado vence em N dias ou não. Ficava
 *  diluída dentro do indicador genérico de cada site, competindo com PageSpeed
 *  numa string só — e um certificado a 5 dias de vencer não pode depender de
 *  alguém reparar numa célula de tabela.
 *
 *  O `score` de `security_check` fica FORA: a composição dele não está
 *  documentada, e um 0–100 sem régua ao lado de dois fatos emprestaria a
 *  credibilidade deles ao terceiro.
 * ─────────────────────────────────────────────────────────────────────────────
 */
function Seguranca({ s }: { s: ReturnType<typeof segurancaDoPortfolio> }) {
  const tudoBem = s.quebrado === 0 && s.expirando === 0;
  return (
    <section className={`rounded-[20px] border px-5 py-[18px] shadow-[0_1px_2px_rgba(10,10,10,.04)] ${
      s.quebrado > 0 ? "border-destructive/25 bg-destructive/[0.05]"
        : s.expirando > 0 ? "border-amber-500/25 bg-amber-500/[0.05]"
        : "border-border bg-card"}`}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3 min-w-0">
          <span className={`w-8 h-8 rounded-[10px] grid place-items-center flex-shrink-0 ${
            s.quebrado > 0 ? "bg-destructive/15 text-destructive"
              : s.expirando > 0 ? "bg-amber-500/15 text-amber-700"
              : "bg-emerald-500/15 text-emerald-700"}`}>
            {s.quebrado > 0 ? <ShieldAlert className="w-4 h-4" strokeWidth={2.2} />
              : <Lock className="w-4 h-4" strokeWidth={2.2} />}
          </span>
          <div className="min-w-0">
            <div className="flex items-baseline gap-2.5 flex-wrap">
              <h2 className="text-[11px] font-bold uppercase tracking-[0.13em]">Segurança</h2>
              <span className="text-[10px] text-muted-foreground/55">
                HTTPS e certificado · verificação diária
              </span>
            </div>
            <p className="text-[12.5px] mt-1 leading-snug">
              {s.quebrado > 0 ? (
                <><b className="text-destructive font-semibold">
                  {s.quebrado} site(s) com HTTPS ou certificado quebrado.</b>{" "}
                <span className="text-muted-foreground">Impede acesso seguro agora.</span></>
              ) : s.expirando > 0 ? (
                <><b className="text-amber-700 font-semibold">
                  {s.expirando} certificado(s) vencendo em até {SSL_AVISO_DIAS} dias.</b>{" "}
                <span className="text-muted-foreground">Renovar antes que vire queda.</span></>
              ) : (
                <span className="text-muted-foreground">
                  Nenhum problema de HTTPS ou certificado entre os {s.ok} site(s) medido(s).
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 flex-shrink-0">
          {([["Ok", s.ok, "#3FA66A"], ["Vencendo", s.expirando, "#E0A030"],
             ["Quebrado", s.quebrado, "#D65745"], ["Sem medição", s.semMedicao, "#8C8C8C"]] as const)
            .map(([rotulo, valor, cor]) => (
              <div key={rotulo} className="text-right">
                <span className="block text-[18px] font-bold tabular-nums leading-none"
                  style={{ color: valor > 0 ? cor : undefined }}>
                  {valor}
                </span>
                <span className="block text-[9px] font-semibold uppercase tracking-[0.09em]
                                 text-muted-foreground/60 mt-1">
                  {rotulo}
                </span>
              </div>
            ))}
        </div>
      </div>

      {/* Os urgentes, nominais. Uma contagem sem nome manda procurar. */}
      {s.urgentes.length > 0 && (
        <div className="mt-3.5 pt-3 border-t border-foreground/[0.07] flex flex-wrap gap-x-4 gap-y-1.5">
          {s.urgentes.map((x: SegurancaDoSite) => (
            <span key={x.accountId} className="text-[11.5px]">
              <LinkSite accountId={x.accountId} aba="seguranca">
                <b className="font-semibold">{x.nome}</b>
              </LinkSite>
              <span className="text-muted-foreground ml-1.5">
                {x.estado === "quebrado"
                  ? (x.https === false ? "sem HTTPS" : "certificado inválido")
                  : `vence em ${x.diasParaVencer} dia${x.diasParaVencer === 1 ? "" : "s"}`}
              </span>
            </span>
          ))}
        </div>
      )}

      {/* Sem urgência, o próximo vencimento ainda é informação útil. */}
      {tudoBem && s.proximoVencimento?.diasParaVencer != null && (
        <p className="text-[10.5px] text-muted-foreground/70 mt-3">
          Próximo vencimento: {s.proximoVencimento.nome} em {s.proximoVencimento.diasParaVencer} dias.
          {s.semMedicao > 0 && ` ${s.semMedicao} site(s) sem verificação de segurança.`}
        </p>
      )}
    </section>
  );
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Precisa da minha atenção — as três naturezas, separadas
 * ─────────────────────────────────────────────────────────────────────────────
 *  Ordenado por severidade, e falha de medição sempre por último. Ela não é
 *  problema do cliente: misturá-la mandaria refazer um teste de PageSpeed antes
 *  de olhar um checkout vazando.
 *
 *  Cada item traz O QUE aconteceu, QUAL site e para onde ir. O QUANDO fica no
 *  bloco de cada fonte — repeti-lo aqui em toda linha gastaria a largura que o
 *  texto do achado usa para explicar.
 * ─────────────────────────────────────────────────────────────────────────────
 */
const TETO_PENDENCIAS = 6;

function PrecisaAtencao({ pendencias, explicados, contextoDe }: {
  pendencias: Array<{ achado: Achado; nome: string; accountId: number }>;
  explicados: Array<{ achado: Achado; nome: string; accountId: number }>;
  contextoDe: (accountId: number, chave: string) => string | null;
}) {
  const [todos, setTodos] = useState(false);
  const remedir = trpc.clarity.perfSync.useMutation({
    onSuccess: () => toast.success("Medição refeita. O painel atualiza na próxima leitura."),
    onError: (e: { message: string }) => toast.error(e.message),
  });

  if (!pendencias.length && !explicados.length) {
    return (
      <div className="rounded-[16px] border border-emerald-500/25 bg-emerald-500/[0.06] px-4 py-3
                      flex items-center gap-2.5">
        <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" strokeWidth={2.4} />
        <span className="text-[13px] text-emerald-800">
          Nenhum achado aberto no portfólio. Nada exige ação agora.
        </span>
      </div>
    );
  }

  const lista = todos ? pendencias : pendencias.slice(0, TETO_PENDENCIAS);
  return (
    <section className="rounded-[20px] border border-border bg-card overflow-hidden
                        shadow-[0_1px_2px_rgba(10,10,10,.04)]">
      <div className="flex items-baseline gap-2.5 flex-wrap px-5 pt-[18px]">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.13em]">Precisa da minha atenção</h2>
        <span className="text-[10.5px] text-muted-foreground/55">
          {pendencias.length} achado(s) · do mais grave para o mais leve
        </span>
      </div>

      <div className="flex flex-col divide-y divide-border mt-2">
        {lista.map(({ achado, nome, accountId }) => {
          const tom = TOM_ACHADO[achado.severidade] ?? TOM_ACHADO.info;
          const ehMedicao = achado.severidade === "medicao";
          return (
            <div key={`${accountId}-${achado.chave}`}
              className="flex items-start gap-3 px-5 py-2.5 transition-colors duration-150
                         hover:bg-foreground/[0.02]">
              <span className={`text-[9px] font-bold uppercase tracking-[0.09em] px-1.5 py-[3px]
                                rounded-[5px] flex-shrink-0 mt-[1px] ${tom.classe}`}>
                {tom.rotulo}
              </span>
              <div className="min-w-0 flex-1">
                <span className="text-[12.5px] font-semibold">
                  <LinkSite accountId={accountId} aba={achado.aba}>{nome}</LinkSite>
                </span>
                <p className="text-[11.5px] text-muted-foreground leading-snug mt-0.5">
                  {achado.texto}
                </p>
                {/* A caixa de explicação abre DENTRO da linha: ela precisa da
                    largura do texto para caber, e um popover cobriria os
                    achados vizinhos que a pessoa está comparando. */}
                <CaixaDeContexto achado={achado} accountId={accountId}
                  contexto={contextoDe(accountId, achado.chave)} />
              </div>
              {/* Falha de medição tem ação PRÓPRIA: refazer. Um problema real
                  não tem botão aqui — ele exige olhar, não reprocessar. */}
              {ehMedicao && (
                <button type="button"
                  onClick={() => remedir.mutate({ accountId })}
                  disabled={remedir.isPending}
                  className="text-[10px] px-2 py-1 rounded-md border border-border text-muted-foreground
                             hover:text-foreground hover:bg-foreground/[0.04] transition-colors
                             duration-150 disabled:opacity-60 flex items-center gap-1.5 flex-shrink-0">
                  <RefreshCw className={`w-3 h-3 ${remedir.isPending ? "animate-spin" : ""}`}
                    strokeWidth={2.2} />
                  refazer medição
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/*
       * Os já explicados, em cinza e sem chip.
       *
       * O FATO continua consultável — é o pedido de não apagar histórico —, mas
       * ele não disputa atenção com o que está aberto, e não conta em lugar
       * nenhum. Remover a explicação devolve o achado à lista de cima.
       */}
      {explicados.length > 0 && (
        <div className="px-5 py-3 border-t border-border flex flex-col gap-1.5">
          <span className="text-[9px] font-bold uppercase tracking-[0.11em] text-muted-foreground/50">
            Já explicados · {explicados.length}
          </span>
          {explicados.map(({ achado, nome, accountId }) => (
            <div key={`${accountId}-${achado.chave}`}
              className="flex items-start gap-2.5 text-[11px]">
              <span className="text-muted-foreground/60 flex-1 min-w-0 leading-snug">
                <b className="font-semibold text-muted-foreground/80">{nome}</b> · {achado.texto}
              </span>
              <CaixaDeContexto achado={achado} accountId={accountId}
                contexto={contextoDe(accountId, achado.chave)} />
            </div>
          ))}
        </div>
      )}

      {pendencias.length > TETO_PENDENCIAS && (
        <button type="button" onClick={() => setTodos((v) => !v)}
          className="w-full px-5 py-2.5 text-[11px] font-semibold text-muted-foreground border-t
                     border-border hover:text-foreground hover:bg-foreground/[0.03] transition-colors">
          {todos ? "Mostrar menos" : `Ver os outros ${pendencias.length - TETO_PENDENCIAS}`}
        </button>
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
function CaixaDeContexto({ achado, accountId, contexto }: {
  achado: Achado; accountId: number; contexto: string | null;
}) {
  const utils = trpc.useUtils();
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState(contexto ?? "");
  useEffect(() => { setTexto(contexto ?? ""); }, [contexto]);

  const salvar = trpc.context.salvarContextoDePonto.useMutation({
    onSuccess: () => {
      setAberto(false);
      utils.panorama.sites.invalidate();
      utils.context.analiseVigente.invalidate();
      toast.success("Contexto salvo");
    },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  if (!aberto) {
    return (
      <button type="button" onClick={() => setAberto(true)}
        className="text-[10px] px-2 py-1 rounded-md border border-border text-muted-foreground
                   hover:text-foreground hover:bg-foreground/[0.04] transition-colors duration-150
                   flex-shrink-0">
        {contexto ? "ver contexto" : "contextualizar"}
      </button>
    );
  }

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
        <button type="button" onClick={() => { setAberto(false); setTexto(contexto ?? ""); }}
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
 *  Sites — cada card com o indicador que AQUELE site tem
 * ─────────────────────────────────────────────────────────────────────────────
 *  O rótulo do indicador fica sempre visível, e é isso que impede a leitura
 *  errada: quem olha sabe que a Elwing está sendo mostrada por PageSpeed e a
 *  Ultramalhas por disponibilidade, em vez de achar que os dois números saem da
 *  mesma régua.
 * ─────────────────────────────────────────────────────────────────────────────
 */
function Sites({ linhas, total, filtro, aoFiltrar, busca, aoBuscar }: {
  linhas: Linha[]; total: number;
  filtro: Nivel | "todos"; aoFiltrar: (n: Nivel | "todos") => void;
  busca: string; aoBuscar: (s: string) => void;
}) {
  const chip = (ativo: boolean) =>
    `text-[10px] px-2.5 py-1 rounded-md border transition-colors duration-150 ${
      ativo ? "bg-foreground text-background border-foreground"
            : "border-border text-muted-foreground hover:text-foreground"}`;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div className="flex items-baseline gap-2.5 flex-wrap">
          <h2 className="text-[13px] font-bold uppercase tracking-[0.1em]">Sites</h2>
          <span className="text-[11px] text-muted-foreground/55">
            {linhas.length === total ? `${total} no portfólio` : `${linhas.length} de ${total}`}
            {" · o indicador de cada site é o mais objetivo que ele tem"}
          </span>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="relative">
            <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
            <input value={busca} onChange={(e) => aoBuscar(e.target.value)}
              placeholder="Buscar cliente…"
              className="text-[11px] pl-6 pr-2 py-1 rounded-md border border-border bg-transparent
                         w-[150px] focus:outline-none focus:ring-1 focus:ring-ring" />
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

      {!linhas.length ? (
        <div className="rounded-[20px] border border-dashed border-border bg-card px-5 py-8 text-center">
          <p className="text-[12.5px] text-muted-foreground">Nenhum site com esse filtro.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {linhas.map((l) => <CartaoDoSite key={l.cliente.accountId} l={l} />)}
        </div>
      )}
    </section>
  );
}

function CartaoDoSite({ l }: { l: Linha }) {
  const ind = indicadorDoSite(l.cliente);
  const ui = NIVEL_UI[l.nivel];
  const abertos = l.achados.filter((a) => a.status !== "contextualizado" && a.severidade !== "info");
  const problemas = abertos.filter((a) => a.severidade !== "medicao");
  const medicoes = abertos.filter((a) => a.severidade === "medicao");
  const venda = vendasDe(l.cliente);

  return (
    <Link href={`/site?account=${l.cliente.accountId}`}>
      <article className="rounded-[16px] border border-border bg-card px-4 py-3.5 cursor-pointer
                          h-full flex flex-col transition-shadow duration-150
                          hover:shadow-[0_4px_16px_rgba(10,10,10,.07)]">
        <div className="flex items-start justify-between gap-2">
          <span className="text-[13px] font-bold truncate min-w-0">{l.nome}</span>
          <span className={`inline-flex items-center gap-1.5 text-[9.5px] font-bold uppercase
                            tracking-[0.08em] flex-shrink-0 ${ui.texto}`}>
            <i className="w-1.5 h-1.5 rounded-full" style={{ background: ui.ponto }} />
            {ui.rotulo}
          </span>
        </div>

        {/* O indicador: número grande, rótulo colado. O rótulo é obrigatório —
            sem ele, "88" e "No ar" pareceriam a mesma escala. */}
        <div className="flex items-baseline gap-2 mt-3">
          <span className={`text-[26px] font-bold tabular-nums leading-none tracking-tight ${
            ESTADO_INDICADOR[ind.estado]}`}>
            {ind.valor}
          </span>
          {ind.unidade && (
            <span className="text-[10.5px] text-muted-foreground">{ind.unidade}</span>
          )}
        </div>
        <span className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-muted-foreground/70 mt-1"
          title={ind.fonte ? `${ind.fonte}${ind.dia ? ` · ${fmtDia(ind.dia)}` : ""}` : undefined}>
          {ind.rotulo}
          {ind.dia && <span className="font-normal normal-case tracking-normal text-muted-foreground/50">
            {" "}· {fmtDia(ind.dia)}
          </span>}
        </span>

        <div className="flex-1" />

        {/* Achados abertos e falhas de medição em faixas distintas: a segunda
            não é problema do cliente. */}
        <div className="flex flex-col gap-1 mt-3">
          {problemas.slice(0, 2).map((a) => (
            <span key={a.chave} className="flex items-start gap-1.5 text-[10.5px] leading-snug">
              <AlertTriangle className={`w-3 h-3 flex-shrink-0 mt-[1px] ${
                a.severidade === "critico" ? "text-destructive" : "text-amber-600"}`} strokeWidth={2.4} />
              <span className="text-muted-foreground truncate">{a.texto}</span>
            </span>
          ))}
          {problemas.length > 2 && (
            <span className="text-[10px] text-muted-foreground/55 pl-[18px]">
              + {problemas.length - 2} outro(s)
            </span>
          )}
          {medicoes.map((a) => (
            <span key={a.chave} className="flex items-start gap-1.5 text-[10.5px] leading-snug">
              <Wrench className="w-3 h-3 flex-shrink-0 mt-[1px] text-sky-600" strokeWidth={2.4} />
              <span className="text-muted-foreground/80 truncate">{a.texto}</span>
            </span>
          ))}
          {!problemas.length && !medicoes.length && (
            <span className="text-[10.5px] text-muted-foreground/50">
              {venda?.receita != null
                ? `Venda ${venda.rotuloFonte} · ${venda.janela}`
                : "Nenhum achado aberto"}
            </span>
          )}
        </div>
      </article>
    </Link>
  );
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Comparação — só onde a régua é a mesma, e a cobertura é dita
 * ─────────────────────────────────────────────────────────────────────────────
 *  PageSpeed é a única métrica do portfólio com escala absoluta e método
 *  idêntico entre clientes. Só ela entra aqui, e só entre quem a tem.
 *
 *  A frase de cobertura não é ressalva de rodapé: um ranking de 8 linhas num
 *  portfólio de 13 se lê como o portfólio inteiro, e os 5 ausentes parecem os
 *  piores. Dizer "8 de 13" no cabeçalho é o que impede essa leitura.
 * ─────────────────────────────────────────────────────────────────────────────
 */
function Comparacao({ linhas, cobertura }: {
  linhas: Linha[]; cobertura: { com: number; total: number };
}) {
  const comparaveis = linhas
    .map((l) => ({ l, ind: indicadorDoSite(l.cliente) }))
    .filter((x) => x.ind.comparavel)
    .sort((a, b) => Number(b.ind.valor) - Number(a.ind.valor));

  return (
    <section className="rounded-[20px] border border-border bg-card px-5 py-[18px]
                        shadow-[0_1px_2px_rgba(10,10,10,.04)] flex flex-col gap-3">
      <div className="flex items-baseline gap-2.5 flex-wrap">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.13em]">Comparação técnica</h2>
        <span className="text-[10.5px] text-muted-foreground/55">
          PageSpeed mobile · {cobertura.com} de {cobertura.total} sites
        </span>
      </div>

      {!comparaveis.length ? (
        <p className="text-[11.5px] text-muted-foreground leading-snug">
          Nenhum site com medição de PageSpeed no portfólio. A comparação entre clientes exige a
          mesma régua, e ela é a única métrica com escala absoluta e método idêntico.
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-1.5">
            {comparaveis.map(({ l, ind }) => {
              const v = Number(ind.valor);
              return (
                <div key={l.cliente.accountId} className="flex items-center gap-2.5">
                  <span className="text-[11.5px] truncate w-[110px] flex-shrink-0">
                    <LinkSite accountId={l.cliente.accountId} aba="tecnico">{l.nome}</LinkSite>
                  </span>
                  <span className="flex-1 h-[7px] rounded-full bg-muted overflow-hidden">
                    <span className="block h-full rounded-full" style={{
                      width: `${v}%`,
                      // A cor sai da faixa do próprio Lighthouse, e não de um
                      // ranking relativo: o último colocado de um portfólio bom
                      // não é vermelho.
                      background: v >= 90 ? "#3FA66A" : v >= 50 ? "#E0A030" : "#D65745",
                    }} />
                  </span>
                  <span className="text-[12px] font-bold tabular-nums w-[28px] text-right flex-shrink-0">
                    {v}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-muted-foreground/60 leading-snug">
            Escala 0–100 do Lighthouse, estratégia mobile — a mesma que o job diário coleta.
            {cobertura.com < cobertura.total && (
              <> Os {cobertura.total - cobertura.com} site(s) fora desta lista não têm medição
              técnica; ausência aqui não é nota baixa.</>
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
      <section className="rounded-[20px] border border-border bg-card px-5 py-[18px]
                          flex items-center justify-center h-[180px] text-muted-foreground gap-2">
        <Loader2 className="w-4 h-4 animate-spin" /> <span className="text-xs">Lendo o histórico…</span>
      </section>
    );
  }

  return (
    <section className="rounded-[20px] border border-border bg-card px-5 py-[18px]
                        shadow-[0_1px_2px_rgba(10,10,10,.04)] flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3 flex-wrap min-h-[18px]">
        <div className="flex items-baseline gap-2.5 flex-wrap">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.13em]">Evolução do portfólio</h2>
          {ativo == null && (
            <span className="text-[10.5px] text-muted-foreground/55">
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
        <div className="h-[132px] flex flex-col items-center justify-center text-center gap-1">
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
  const W = 560, H = 132, ml = 30, mr = 10, mt = 10, mb = 18;
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
    <section className="rounded-[20px] border border-border bg-card overflow-hidden
                        shadow-[0_1px_2px_rgba(10,10,10,.04)]">
      <button type="button" onClick={() => setAberto((v) => !v)}
        className="w-full flex items-center gap-2.5 px-5 py-[14px] text-left
                   hover:bg-foreground/[0.02] transition-colors duration-150">
        <ShoppingCart className="w-4 h-4 text-muted-foreground" strokeWidth={2.2} />
        <span className="text-[11px] font-bold uppercase tracking-[0.13em]">E-commerce</span>
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
