/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Selva Spaces — "Prioridades da semana" (no lugar da box do Trello)
 * ─────────────────────────────────────────────────────────────────────────────
 *  Responde uma pergunta só: o que cada grupo precisa ter como foco esta semana.
 *
 *  ── Por que ele não pode virar um segundo Trello ───────────────────────────
 *  Painel de direcionamento e lista de tarefas parecem iguais na tela e são
 *  opostos no uso: a lista quer ser COMPLETA, o direcionamento quer ser CURTO.
 *  Quando ele fica completo, ninguém lê. As regras que seguram isso vivem em
 *  `shared/prioridades`, e não aqui: tipo sem item some, e o corte é sobre o
 *  total do grupo.
 *
 *  ── A ordem é do prazo, e não da mão ───────────────────────────────────────
 *  Não há seta nem arrastar. Ordem manual e prazo competem: alguém sobe o item
 *  porque é urgente, no dia seguinte outro vence antes e o topo está errado —
 *  e a ordem passa a ser mantida à mão para dizer o que o prazo já dizia. O
 *  cabeçalho da lista avisa isso, porque uma ordem que a pessoa não entende
 *  parece bug.
 *
 *  ── Quatro abas, uma query ─────────────────────────────────────────────────
 *  A query traz a semana inteira, com os três grupos; a aba é filtro em
 *  memória. "Todos" precisa dos três juntos de qualquer forma, e quatro queries
 *  fariam o painel piscar a cada clique.
 *
 *  ── Cor com orçamento ──────────────────────────────────────────────────────
 *  Cada tipo tem sua cor, mas ela vive num ponto e num rótulo miúdo — nunca no
 *  fundo do item. Item colorido inteiro empata com o vizinho colorido inteiro,
 *  e três cores gritando ao mesmo tempo não hierarquizam nada. O título continua
 *  sendo o elemento mais forte da linha.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useMemo, useState } from "react";
import {
  ChevronLeft, ChevronRight, Loader2, Pencil, Plus, Target, Trash2, X, Check,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Card } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAuth } from "@/_core/hooks/useAuth";
import { canManagePriorities } from "@shared/permissions";
import { toast } from "sonner";
import {
  ABAS, GRUPOS, ROTULO_ABA, ROTULO_GRUPO, SIGLA_GRUPO, deslocarSemana, hojeISO,
  inicioDaSemana, rotuloDaSemana, rotuloDeDia, situacaoDaSemana,
  type Aba, type Grupo,
} from "@shared/semana";
import {
  ITENS_VISIVEIS, ROTULO_STATUS, STATUS, TIPOS, TITULO_TIPO, agruparPorTipo,
  cortar, distribuicaoPorGrupo, type ItemPrioridade, type Responsavel,
  type StatusPrioridade, type TipoPrioridade,
} from "@shared/prioridades";

/**
 * A cor de cada tipo, e o orçamento dela.
 *
 * `ponto` e `rotulo` são tudo o que recebe cor. Não existe `fundo` de propósito:
 * o pedido foi diferenciação forte no MARCADOR, não item virando cartão
 * colorido — e três cartões coloridos lado a lado deixam de diferenciar.
 *
 * A escolha segue o significado: laranja (a cor do Spaces) para o foco da
 * semana, verde para o que se entrega, âmbar para o que pede cuidado.
 */
const CORES_TIPO: Record<TipoPrioridade, { ponto: string; rotulo: string }> = {
  PRIORIDADE: { ponto: "bg-[#EF701B]", rotulo: "text-[#EF701B]" },
  ENTREGA: { ponto: "bg-emerald-500", rotulo: "text-emerald-500" },
  ATENCAO: { ponto: "bg-amber-500", rotulo: "text-amber-500" },
};

/**
 * O tom de cada status, deliberadamente quase invisível.
 *
 * Status é o dado menos urgente da linha: quem lê quer saber QUAL é a
 * prioridade; se ela já começou é a segunda pergunta. Um chip colorido
 * inverteria a ordem de leitura — e brigaria com a cor do tipo, que é a que
 * precisa ser vista.
 */
const TOM_STATUS: Record<StatusPrioridade, string> = {
  PLANEJADO: "text-muted-foreground/70",
  EM_ANDAMENTO: "text-accent",
  CONCLUIDO: "text-muted-foreground/50",
};

interface Rascunho {
  id?: number;
  tipo: TipoPrioridade;
  titulo: string;
  descricao: string;
  responsaveis: number[];
  prazo: string;
  status: StatusPrioridade;
  grupo: Grupo;
}

const vazio = (grupo: Grupo): Rascunho => ({
  tipo: "PRIORIDADE", titulo: "", descricao: "", responsaveis: [],
  prazo: "", status: "PLANEJADO", grupo,
});

const primeiroNome = (n: string) => n.trim().split(/\s+/)[0] ?? n;

export function PrioridadesCard() {
  const { user } = useAuth();
  const podeEditar = canManagePriorities((user as { role?: string } | null)?.role);

  const hoje = hojeISO();
  const [semana, setSemana] = useState(() => inicioDaSemana(hoje));
  // "Todos" é o padrão: quem abre a Home quer a visão da empresa, não a de um
  // grupo. Abrir num grupo específico esconderia dois terços do direcionamento
  // de quem não sabe que as outras abas existem.
  const [aba, setAba] = useState<Aba>("todos");
  const [expandido, setExpandido] = useState(false);
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);

  const utils = trpc.useUtils();
  const q = trpc.prioridades.listar.useQuery({ semana }, { refetchOnWindowFocus: false });

  const recarregar = () => utils.prioridades.listar.invalidate();
  const aoErrar = (e: { message: string }) => toast.error(e.message);

  const criar = trpc.prioridades.criar.useMutation({
    onSuccess: () => { setRascunho(null); recarregar(); }, onError: aoErrar,
  });
  const atualizar = trpc.prioridades.atualizar.useMutation({
    onSuccess: () => { setRascunho(null); recarregar(); }, onError: aoErrar,
  });
  const excluir = trpc.prioridades.excluir.useMutation({ onSuccess: recarregar, onError: aoErrar });

  const itens = (q.data?.itens ?? []) as unknown as ItemPrioridade[];
  const doFiltro = useMemo(
    () => (aba === "todos" ? itens : itens.filter((i) => i.grupo === aba)),
    [itens, aba],
  );
  const secoes = useMemo(() => agruparPorTipo(doFiltro), [doFiltro]);
  const { visiveis, ocultos } = expandido
    ? { visiveis: secoes, ocultos: 0 }
    : cortar(secoes, ITENS_VISIVEIS);

  // Quantos itens cada aba tem — o número discreto existe para ninguém precisar
  // clicar nas quatro abas para descobrir onde há conteúdo.
  const contagem = useMemo(() => {
    const c: Record<string, number> = { todos: itens.length };
    for (const i of itens) c[i.grupo] = (c[i.grupo] ?? 0) + 1;
    return c;
  }, [itens]);

  const situacao = situacaoDaSemana(semana, hoje);
  const total = secoes.reduce((n, s) => n + s.itens.length, 0);
  // Sempre sobre a semana INTEIRA, e não sobre `doFiltro`: filtrar por um grupo
  // e o gráfico virar 100% daquele grupo transformaria a resposta em tautologia.
  const distribuicao = useMemo(() => distribuicaoPorGrupo(itens, GRUPOS), [itens]);

  const irPara = (n: number) => {
    setSemana((s) => deslocarSemana(s, n));
    setExpandido(false);
    setRascunho(null);
  };

  const salvar = (r: Rascunho) => {
    const titulo = r.titulo.trim();
    if (!titulo) { toast.error("O título é obrigatório."); return; }
    const comum = {
      tipo: r.tipo, titulo, status: r.status,
      responsaveis: r.responsaveis,
      grupo: r.grupo,
    };
    if (r.id) {
      atualizar.mutate({
        id: r.id, ...comum,
        descricao: r.descricao.trim() || null,
        prazo: r.prazo || null,
      });
    } else {
      criar.mutate({
        semana, ...comum,
        descricao: r.descricao.trim() || undefined,
        prazo: r.prazo || undefined,
      });
    }
  };

  const salvando = criar.isPending || atualizar.isPending;

  return (
    <Card className="gap-0 py-0 h-full overflow-hidden">
      {/* ── Cabeçalho ────────────────────────────────────────────────────────
          Faixa própria, com um brilho laranja canto-superior — o mesmo recurso
          dos atalhos da Home. É o que tira o bloco do "tabela dentro de card"
          sem acrescentar borda nenhuma. */}
      <div className="relative px-5 pt-5 pb-0 flex-shrink-0 overflow-hidden">
        <div className="pointer-events-none absolute -right-10 -top-12 h-32 w-32 rounded-full opacity-40 blur-3xl"
          style={{ background: "radial-gradient(circle, rgba(239,112,27,0.55), transparent 70%)" }} aria-hidden />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px opacity-50"
          style={{ background: "linear-gradient(90deg, transparent, #EF701B, transparent)" }} aria-hidden />

        <div className="relative flex items-start gap-3">
          <span className="w-9 h-9 rounded-xl bg-[#EF701B]/15 text-[#EF701B] ring-1 ring-[#EF701B]/25 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Target className="w-[18px] h-[18px]" />
          </span>

          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70 leading-none">
              Prioridades da semana
            </p>
            {/* O período é o elemento GRANDE do cabeçalho, e não o nome do
                módulo: o nome é o mesmo todo dia, o período é o que muda — e
                é ele que a pessoa confere ao navegar entre semanas. */}
            <div className="flex items-baseline gap-2 mt-1.5 flex-wrap">
              <h2 className="text-xl font-semibold tracking-tight tabular-nums leading-none">
                {rotuloDaSemana(semana)}
              </h2>
              {situacao && (
                <span className="text-[11px] text-muted-foreground">{situacao}</span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-0.5 flex-shrink-0">
            <button onClick={() => irPara(-1)} title="Semana anterior" aria-label="Semana anterior"
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/30 transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            {/* Só fora da semana atual: um botão "hoje" permanente ocupa espaço
                para não fazer nada na maior parte do tempo. */}
            {situacao && (
              <button onClick={() => { setSemana(inicioDaSemana(hoje)); setExpandido(false); }}
                className="text-[11px] px-2 py-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/30 transition-colors">
                hoje
              </button>
            )}
            <button onClick={() => irPara(1)} title="Próxima semana" aria-label="Próxima semana"
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/30 transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── Distribuição entre os grupos ──────────────────────────────────
            Contexto, e não painel: três barras finas com o número ao lado. Fica
            entre o período e as abas porque é o que amarra os dois — diz de onde
            vêm os itens que as abas filtram. Some quando a semana está vazia:
            três barras zeradas ocupam espaço para não informar nada. */}
        {distribuicao.total > 0 && (
          <div className="relative mt-4 flex flex-col gap-1.5">
            {distribuicao.fatias.map((f, i) => {
              const ativo = aba === f.grupo;
              return (
                <div key={f.grupo} className="flex items-center gap-2">
                  <span className={`text-[10px] w-[92px] flex-shrink-0 truncate tracking-tight transition-colors ${
                    ativo ? "text-foreground font-semibold" : "text-muted-foreground/70"
                  }`}>
                    {ROTULO_GRUPO[f.grupo as Grupo]}
                  </span>
                  <span className="flex-1 h-1.5 rounded-full bg-muted/60 overflow-hidden">
                    {/* Um só matiz em três intensidades. Cor própria por grupo
                        brigaria com as cores dos TIPOS, que são as que precisam
                        ser vistas na lista. */}
                    <span className="block h-full rounded-full transition-[width] duration-500 ease-out"
                      style={{
                        width: `${f.proporcao}%`,
                        background: "#EF701B",
                        opacity: ativo ? 1 : [0.9, 0.62, 0.38][i] ?? 0.4,
                      }} />
                  </span>
                  <span className={`text-[10px] tabular-nums w-4 text-right flex-shrink-0 ${
                    ativo ? "text-foreground font-semibold" : "text-muted-foreground/60"
                  }`}>
                    {f.total}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Abas, integradas ao cabeçalho ─────────────────────────────────
            Elas fecham o bloco do topo: a linha inferior das abas é a divisa
            entre cabeçalho e conteúdo, e por isso não existe borda separando
            os dois. No mobile, a fila rola em vez de espremer quatro colunas. */}
        <div className="relative mt-4 flex items-center gap-0.5 border-b border-border/60 overflow-x-auto scrollbar-none">
          {ABAS.map((g) => {
            const ativa = g === aba;
            return (
              <button key={g} onClick={() => { setAba(g); setExpandido(false); setRascunho(null); }}
                className={`relative px-3 py-2.5 text-xs whitespace-nowrap transition-colors ${
                  ativa ? "font-semibold text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}>
                {ROTULO_ABA[g]}
                {(contagem[g] ?? 0) > 0 && (
                  <span className={`ml-1.5 text-[10px] tabular-nums ${ativa ? "text-[#EF701B]" : "text-muted-foreground/50"}`}>
                    {contagem[g]}
                  </span>
                )}
                {ativa && <span className="absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-[#EF701B]" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Corpo ────────────────────────────────────────────────────────── */}
      <div className="px-5 pt-4 flex-1 min-h-0">
        {q.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
          </div>
        ) : q.isError ? (
          <p className="text-sm text-muted-foreground">Não foi possível carregar as prioridades agora.</p>
        ) : (
          <div className="flex flex-col gap-5">
            {visiveis.length === 0 && !rascunho && (
              <p className="text-sm text-muted-foreground">
                {aba === "todos"
                  ? "Nenhum direcionamento definido para esta semana."
                  : `Nada registrado para ${ROTULO_ABA[aba]} nesta semana.`}
              </p>
            )}

            {visiveis.map((secao) => (
              <section key={secao.tipo} className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full ${CORES_TIPO[secao.tipo].ponto}`} aria-hidden />
                  <h3 className={`text-[10px] font-bold uppercase tracking-[0.12em] ${CORES_TIPO[secao.tipo].rotulo}`}>
                    {TITULO_TIPO[secao.tipo]}
                  </h3>
                  <span className="h-px flex-1 bg-border/50" aria-hidden />
                </div>
                {secao.itens.map((item) =>
                  rascunho?.id === item.id ? (
                    <Formulario key={item.id} rascunho={rascunho} onChange={setRascunho}
                      onSalvar={() => salvar(rascunho)} onCancelar={() => setRascunho(null)}
                      salvando={salvando} />
                  ) : (
                    <Linha key={item.id} item={item} podeEditar={podeEditar} mostrarGrupo={aba === "todos"}
                      onEditar={() => setRascunho({
                        id: item.id, tipo: item.tipo, titulo: item.titulo,
                        descricao: item.descricao ?? "", responsaveis: item.responsaveis.map((r) => r.id),
                        prazo: item.prazo ?? "", status: item.status, grupo: item.grupo as Grupo,
                      })}
                      onExcluir={() => {
                        if (confirm(`Excluir "${item.titulo}"?`)) excluir.mutate({ id: item.id });
                      }} />
                  ),
                )}
              </section>
            ))}

            {ocultos > 0 && (
              <button onClick={() => setExpandido(true)}
                className="self-start text-xs font-medium text-[#EF701B] hover:opacity-80">
                Ver todas ({total + ocultos})
              </button>
            )}
            {expandido && total > ITENS_VISIVEIS && (
              <button onClick={() => setExpandido(false)}
                className="self-start text-xs font-medium text-[#EF701B] hover:opacity-80">
                Mostrar menos
              </button>
            )}

            {rascunho && !rascunho.id && (
              <Formulario rascunho={rascunho} onChange={setRascunho}
                onSalvar={() => salvar(rascunho)} onCancelar={() => setRascunho(null)}
                salvando={salvando} />
            )}

            {podeEditar && !rascunho && (
              <button
                onClick={() => setRascunho(vazio(aba === "todos" ? "cc" : aba))}
                className="self-start inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
                <Plus className="w-3.5 h-3.5" /> Adicionar
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Rodapé ───────────────────────────────────────────────────────────
          Duas informações que respondem perguntas diferentes: à esquerda, por
          que a lista está nesta ordem (senão a ordem parece aleatória); à
          direita, quem definiu o direcionamento e quando. */}
      <div className="px-5 py-4 mt-auto flex-shrink-0 flex items-center justify-between gap-3 flex-wrap">
        <span className="text-[11px] text-muted-foreground/70">
          {total > 1 ? "Ordenado por prazo" : ""}
        </span>
        {q.data?.atualizadoEm && (
          <span className="text-[11px] text-muted-foreground">
            {textoDeAtualizacao(new Date(q.data.atualizadoEm), q.data.atualizadoPor)}
          </span>
        )}
      </div>
    </Card>
  );
}

/**
 * "Atualizado hoje às 10:42 por Guilherme".
 *
 * "hoje"/"ontem" e não a data: quem lê o rodapé quer saber se o direcionamento
 * é recente, e "13/08" obriga a fazer a conta.
 */
function textoDeAtualizacao(quando: Date, quem: string | null): string {
  const hhmm = quando.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const dia = (d: Date) => d.toDateString();
  const agora = new Date();
  const ontem = new Date(agora.getTime() - 86_400_000);
  const rotulo =
    dia(quando) === dia(agora) ? `hoje às ${hhmm}`
    : dia(quando) === dia(ontem) ? `ontem às ${hhmm}`
    : `${quando.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} às ${hhmm}`;
  return `Atualizado ${rotulo}${quem ? ` por ${primeiroNome(quem)}` : ""}`;
}

/** A foto do perfil, com as iniciais quando não há foto. */
function Avatar({ nome, url, tamanho = 18 }: { nome: string; url: string | null; tamanho?: number }) {
  const estilo = { width: tamanho, height: tamanho };
  if (url) {
    return <img src={url} alt="" style={estilo} className="rounded-full object-cover flex-shrink-0" />;
  }
  return (
    <span style={estilo}
      className="rounded-full bg-accent/25 text-accent flex items-center justify-center flex-shrink-0 text-[9px] font-semibold uppercase">
      {nome.trim().charAt(0) || "?"}
    </span>
  );
}

/**
 * Uma linha do painel.
 *
 * Sem borda, sem fundo, sem badge. A hierarquia é: título em peso médio,
 * descrição em cinza menor, e a linha de meta (grupo · prazo · responsável ·
 * status) ainda menor. Os controles de edição só existem no hover; no mobile
 * ficam sempre visíveis, porque hover não existe lá e botão invisível é botão
 * que não existe.
 */
function Linha({ item, podeEditar, mostrarGrupo, onEditar, onExcluir }: {
  item: ItemPrioridade;
  podeEditar: boolean;
  mostrarGrupo: boolean;
  onEditar: () => void;
  onExcluir: () => void;
}) {
  const concluido = item.status === "CONCLUIDO";
  const cor = CORES_TIPO[item.tipo];
  const temResponsavel = item.responsaveis.length > 0 || !!item.responsavelLegado;

  return (
    <div className="group flex items-start gap-2.5">
      {/* O ponto colorido alinha os itens numa coluna e repete a cor da seção —
          é o que mantém o tipo legível depois de rolar além do título dela. */}
      <span className={`mt-[7px] w-1.5 h-1.5 rounded-full flex-shrink-0 ${cor.ponto} ${concluido ? "opacity-40" : ""}`}
        aria-hidden />

      <div className="min-w-0 flex-1">
        <p className={`text-sm leading-snug ${concluido ? "text-muted-foreground line-through decoration-1" : "text-foreground font-medium"}`}>
          {item.titulo}
        </p>
        {item.descricao && (
          <p className="text-xs text-muted-foreground leading-snug mt-0.5">{item.descricao}</p>
        )}

        <div className="flex items-center gap-x-2 gap-y-1 mt-1 flex-wrap text-[11px] text-muted-foreground">
          {/* Só na aba Todos: dentro de um grupo, repetir o grupo em cada linha
              é informação que o cabeçalho já deu. */}
          {mostrarGrupo && (
            <span className="font-semibold tracking-wide text-muted-foreground/80">
              {SIGLA_GRUPO[item.grupo as Grupo] ?? item.grupo}
            </span>
          )}
          {item.prazo && (
            <>
              {mostrarGrupo && <span className="opacity-30">·</span>}
              <span className="tabular-nums">{rotuloDeDia(item.prazo)}</span>
            </>
          )}
          {temResponsavel && (
            <>
              {(mostrarGrupo || item.prazo) && <span className="opacity-30">·</span>}
              {item.responsaveis.length > 0
                ? <Responsaveis lista={item.responsaveis} />
                : <span>{primeiroNome(item.responsavelLegado!)}</span>}
            </>
          )}
          {item.status !== "PLANEJADO" && (
            <>
              {(mostrarGrupo || item.prazo || temResponsavel) && <span className="opacity-30">·</span>}
              <span className={TOM_STATUS[item.status]}>{ROTULO_STATUS[item.status]}</span>
            </>
          )}
        </div>
      </div>

      {podeEditar && (
        <div className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 max-md:opacity-100 transition-opacity">
          <BotaoIcone titulo="Editar" onClick={onEditar}><Pencil className="w-3 h-3" /></BotaoIcone>
          <BotaoIcone titulo="Excluir" onClick={onExcluir}><Trash2 className="w-3 h-3" /></BotaoIcone>
        </div>
      )}
    </div>
  );
}

function BotaoIcone({ titulo, onClick, children }: {
  titulo: string; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button onClick={onClick} title={titulo} aria-label={titulo}
      className="p-1 rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-accent/30 transition-colors">
      {children}
    </button>
  );
}

/**
 * "[foto] João +2", e a lista inteira ao tocar.
 *
 * O primeiro nome resolve a leitura rápida; o "+2" diz que há mais sem gastar a
 * linha inteira com nomes. A lista completa abre em POPOVER e não em `title`
 * nativo nem em hover puro de CSS: no celular não existe hover, e um dado que
 * só aparece com mouse é um dado que metade das pessoas nunca vê.
 *
 * O popover do Radix já monta em portal, então ele atravessa o `overflow-hidden`
 * do card — o mesmo motivo pelo qual o seletor de responsável usa o primitivo.
 */
function Responsaveis({ lista }: { lista: Responsavel[] }) {
  const [p] = lista;
  const extras = lista.length - 1;
  const conteudo = (
    <span className="inline-flex items-center gap-1.5">
      <Avatar nome={p.nome} url={p.avatarUrl} />
      <span>{primeiroNome(p.nome)}</span>
      {extras > 0 && <span className="text-muted-foreground/70">+{extras}</span>}
    </span>
  );

  // Com uma pessoa só não há o que revelar: o popover seria um alvo de clique
  // que abre para repetir o que já está escrito ao lado.
  if (extras <= 0) return conteudo;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" aria-label={`${lista.length} responsáveis`}
          className="inline-flex items-center rounded-md hover:bg-accent/25 -mx-1 px-1 transition-colors">
          {conteudo}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto min-w-[160px] p-1.5">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground px-1.5 pb-1">
          Responsáveis
        </p>
        <div className="flex flex-col gap-0.5">
          {lista.map((r) => (
            <span key={r.id} className="flex items-center gap-2 text-xs px-1.5 py-1">
              <Avatar nome={r.nome} url={r.avatarUrl} tamanho={20} />
              <span className="truncate">{primeiroNome(r.nome)}</span>
            </span>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * A edição, inline.
 *
 * No lugar do item, e não num modal: quem reorganiza o direcionamento precisa
 * ver os outros itens enquanto escreve — é comparando que se decide o que é
 * prioridade. Um modal esconde exatamente o contexto que a decisão usa.
 */
function Formulario({ rascunho, onChange, onSalvar, onCancelar, salvando }: {
  rascunho: Rascunho;
  onChange: (r: Rascunho) => void;
  onSalvar: () => void;
  onCancelar: () => void;
  salvando: boolean;
}) {
  const set = <K extends keyof Rascunho>(k: K, v: Rascunho[K]) => onChange({ ...rascunho, [k]: v });
  const campo = "text-xs border border-border rounded-lg px-2.5 py-1.5 bg-background";

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border/70 bg-muted/20 p-3">
      <div className="flex gap-2 flex-wrap">
        <select value={rascunho.tipo} onChange={(e) => set("tipo", e.target.value as TipoPrioridade)}
          className={campo} aria-label="Tipo">
          {TIPOS.map((t) => <option key={t} value={t}>{TITULO_TIPO[t]}</option>)}
        </select>
        <select value={rascunho.grupo} onChange={(e) => set("grupo", e.target.value as Grupo)}
          className={campo} aria-label="Grupo">
          {GRUPOS.map((g) => <option key={g} value={g}>{ROTULO_GRUPO[g]}</option>)}
        </select>
        <select value={rascunho.status} onChange={(e) => set("status", e.target.value as StatusPrioridade)}
          className={campo} aria-label="Status">
          {STATUS.map((s) => <option key={s} value={s}>{ROTULO_STATUS[s]}</option>)}
        </select>
      </div>

      <input autoFocus value={rascunho.titulo} onChange={(e) => set("titulo", e.target.value)}
        placeholder="Título" maxLength={200} className={`${campo} w-full`}
        onKeyDown={(e) => { if (e.key === "Enter") onSalvar(); if (e.key === "Escape") onCancelar(); }} />

      <input value={rascunho.descricao} onChange={(e) => set("descricao", e.target.value)}
        placeholder="Descrição (opcional)" maxLength={2000} className={`${campo} w-full`} />

      <div className="flex gap-2 flex-wrap">
        <SeletorResponsaveis escolhidos={rascunho.responsaveis}
          onChange={(v) => set("responsaveis", v)} />
        <input type="date" value={rascunho.prazo} onChange={(e) => set("prazo", e.target.value)}
          aria-label="Prazo (opcional)" className={`${campo} w-[140px]`} />
      </div>

      <div className="flex items-center gap-2">
        <button onClick={onSalvar} disabled={salvando || !rascunho.titulo.trim()}
          className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-primary text-primary-foreground disabled:opacity-60">
          {salvando ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
          Salvar
        </button>
        <button onClick={onCancelar}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
          <X className="w-3 h-3" /> Cancelar
        </button>
      </div>
    </div>
  );
}

/**
 * Os responsáveis, escolhidos entre os colaboradores do Spaces.
 *
 * ── Por que Popover e não uma div posicionada ──────────────────────────────
 * O card tem `overflow-hidden` (é o que segura o brilho do cabeçalho e as
 * bordas arredondadas), então qualquer lista absoluta era CORTADA por ele. A
 * saída não é remover o clipping — isso vazaria o brilho e quadraria os cantos
 * — e sim montar a lista fora do card. O Popover do Radix já faz isso em
 * portal, é o primitivo que o projeto tem, e resolve de quebra o fechar-ao-
 * clicar-fora e o Escape.
 *
 * ── Chips, e não um campo de texto com vírgulas ────────────────────────────
 * Cada escolhido vira um chip com "x". Quem lê a lista de responsáveis vê a
 * mesma coisa que vai aparecer no item depois — e remover é um clique, no mesmo
 * lugar onde a pessoa está olhando.
 */
function SeletorResponsaveis({ escolhidos, onChange }: {
  escolhidos: number[]; onChange: (v: number[]) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const q = trpc.prioridades.colaboradores.useQuery(undefined, {
    staleTime: 5 * 60_000, refetchOnWindowFocus: false,
  });
  const pessoas = q.data ?? [];
  // Na ordem em que foram escolhidos: o primeiro é quem aparece na linha
  // fechada, então a ordem é informação, não detalhe.
  const selecionados = escolhidos
    .map((id) => pessoas.find((p) => p.id === id))
    .filter((p): p is NonNullable<typeof p> => !!p);

  const alternar = (id: number) => {
    onChange(escolhidos.includes(id) ? escolhidos.filter((x) => x !== id) : [...escolhidos, id]);
  };

  return (
    <div className="flex-1 min-w-[170px] flex items-center gap-1.5 flex-wrap">
      {selecionados.map((p) => (
        <span key={p.id}
          className="inline-flex items-center gap-1 text-xs bg-muted/60 border border-border rounded-full pl-1 pr-1.5 py-0.5">
          <Avatar nome={p.nome} url={p.avatarUrl} tamanho={16} />
          <span className="truncate max-w-[80px]">{primeiroNome(p.nome)}</span>
          <button type="button" onClick={() => alternar(p.id)}
            aria-label={`Remover ${primeiroNome(p.nome)}`}
            className="text-muted-foreground hover:text-foreground">
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}

      <Popover open={aberto} onOpenChange={setAberto}>
        <PopoverTrigger asChild>
          <button type="button"
            className="inline-flex items-center gap-1 text-xs border border-border rounded-lg px-2 py-1 bg-background text-muted-foreground hover:text-foreground transition-colors">
            <Plus className="w-3 h-3" />
            {selecionados.length === 0 ? "Responsável" : "Adicionar"}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-56 p-1 max-h-60 overflow-y-auto">
          {q.isLoading && <p className="text-xs px-2 py-1.5 text-muted-foreground">Carregando…</p>}
          {!q.isLoading && pessoas.length === 0 && (
            <p className="text-xs px-2 py-1.5 text-muted-foreground">Nenhum colaborador ativo.</p>
          )}
          {pessoas.map((p) => {
            const marcado = escolhidos.includes(p.id);
            return (
              <button key={p.id} type="button" onClick={() => alternar(p.id)}
                className={`w-full text-left text-xs px-2 py-1.5 rounded-md flex items-center gap-2 hover:bg-accent/30 transition-colors ${
                  marcado ? "text-foreground font-medium" : "text-muted-foreground"
                }`}>
                <Avatar nome={p.nome} url={p.avatarUrl} tamanho={20} />
                <span className="truncate flex-1">{primeiroNome(p.nome)}</span>
                {/* O popover NÃO fecha ao escolher: quem vai marcar três pessoas
                    teria que reabrir três vezes. O check diz o que já entrou. */}
                {marcado && <Check className="w-3 h-3 flex-shrink-0" />}
              </button>
            );
          })}
        </PopoverContent>
      </Popover>
    </div>
  );
}
