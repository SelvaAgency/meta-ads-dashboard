/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Selva Spaces — "Prioridades da semana" (no lugar da box do Trello)
 * ─────────────────────────────────────────────────────────────────────────────
 *  Responde uma pergunta só: o que cada grupo precisa ter como foco esta semana.
 *
 *  ── Por que ele não pode virar um segundo Trello ───────────────────────────
 *  Painel de direcionamento e lista de tarefas parecem iguais na tela e são
 *  opostos no uso: a lista quer ser COMPLETA, o direcionamento quer ser CURTO.
 *  Quando ele fica completo, ninguém lê — e aí não sobra nada que a box antiga
 *  já não fizesse. As regras que seguram isso vivem em `shared/prioridades`, e
 *  não aqui: tipo sem item some, e o corte é sobre o total do grupo.
 *
 *  ── Um módulo, três abas — e a aba não vai à rede ──────────────────────────
 *  A query traz a semana inteira, com os três grupos. Trocar de aba é um filtro
 *  em memória. Três queries fariam CC / GTM 1 / GTM 2 piscarem a cada clique,
 *  num painel que existe para ser lido em poucos segundos.
 *
 *  ── A hierarquia é tipografia, não caixa ───────────────────────────────────
 *  Nenhum item tem borda, fundo ou badge colorido. O que separa PRIORIDADE de
 *  ENTREGA é o rótulo miúdo em maiúsculas acima do grupo e o espaço entre
 *  seções; o que separa o título do resto é peso e tamanho. Caixa dentro de
 *  caixa é o que transforma direcionamento em quadro de kanban — e o pedido era
 *  explicitamente o contrário.
 *
 *  A única cor forte é a barra vertical de ATENÇÃO. Ela é a exceção porque é o
 *  único tipo que pede ação de quem lê; se PRIORIDADE e ENTREGA também tivessem
 *  cor, nenhuma das três significaria nada.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useMemo, useState } from "react";
import {
  ChevronLeft, ChevronRight, Loader2, Pencil, Plus, Target, Trash2,
  ArrowUp, ArrowDown, X, Check,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/_core/hooks/useAuth";
import { canManageContent } from "@shared/permissions";
import { toast } from "sonner";
import {
  GRUPOS, NOME_GRUPO, ROTULO_GRUPO, deslocarSemana, hojeISO, inicioDaSemana,
  rotuloDaSemana, rotuloDeDia, situacaoDaSemana, type Grupo,
} from "@shared/semana";
import {
  ITENS_VISIVEIS, ROTULO_STATUS, STATUS, TIPOS, TITULO_TIPO, agruparPorTipo,
  cortar, type ItemPrioridade, type StatusPrioridade, type TipoPrioridade,
} from "@shared/prioridades";

/**
 * O tom de cada status, e ele é deliberadamente quase invisível.
 *
 * "Visualmente discreto" foi pedido, e há uma razão: status é o dado menos
 * urgente da linha. Quem lê quer saber QUAL é a prioridade; se ela já começou é
 * a segunda pergunta. Um chip colorido inverteria essa ordem de leitura.
 */
const TOM_STATUS: Record<StatusPrioridade, string> = {
  PLANEJADO: "text-muted-foreground/70",
  EM_ANDAMENTO: "text-accent",
  CONCLUIDO: "text-muted-foreground/50 line-through decoration-1",
};

/** Formulário do item — os campos que a edição inline manipula. */
interface Rascunho {
  id?: number;
  tipo: TipoPrioridade;
  titulo: string;
  descricao: string;
  responsavel: string;
  prazo: string;
  status: StatusPrioridade;
  grupo: Grupo;
}

const vazio = (grupo: Grupo): Rascunho => ({
  tipo: "PRIORIDADE", titulo: "", descricao: "", responsavel: "", prazo: "",
  status: "PLANEJADO", grupo,
});

export function PrioridadesCard() {
  const { user } = useAuth();
  const podeEditar = canManageContent((user as { role?: string } | null)?.role);

  const hoje = hojeISO();
  const [semana, setSemana] = useState(() => inicioDaSemana(hoje));
  const [aba, setAba] = useState<Grupo>("cc");
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
  const mover = trpc.prioridades.mover.useMutation({ onSuccess: recarregar, onError: aoErrar });

  const itens = (q.data?.itens ?? []) as unknown as ItemPrioridade[];
  const doGrupo = useMemo(() => itens.filter((i) => i.grupo === aba), [itens, aba]);
  const secoes = useMemo(() => agruparPorTipo(doGrupo), [doGrupo]);
  const { visiveis, ocultos } = expandido
    ? { visiveis: secoes, ocultos: 0 }
    : cortar(secoes, ITENS_VISIVEIS);

  // Quantos itens cada aba tem — o ponto discreto ao lado do rótulo existe para
  // ninguém precisar clicar nas três abas para descobrir onde há conteúdo.
  const contagem = useMemo(() => {
    const c: Record<string, number> = {};
    for (const i of itens) c[i.grupo] = (c[i.grupo] ?? 0) + 1;
    return c;
  }, [itens]);

  const situacao = situacaoDaSemana(semana, hoje);

  const irPara = (n: number) => {
    setSemana((s) => deslocarSemana(s, n));
    setExpandido(false);
    setRascunho(null);
  };

  const salvar = (r: Rascunho) => {
    const comum = {
      tipo: r.tipo, titulo: r.titulo.trim(), status: r.status,
      descricao: r.descricao.trim(), responsavel: r.responsavel.trim(), prazo: r.prazo,
    };
    if (!comum.titulo) { toast.error("O título é obrigatório."); return; }
    if (r.id) {
      // `null` e não `""`: a tela decide mostrar por ausência, e string vazia é
      // presença de nada — apareceria como um rótulo em branco.
      atualizar.mutate({
        id: r.id, grupo: r.grupo, ...comum,
        descricao: comum.descricao || null,
        responsavel: comum.responsavel || null,
        prazo: comum.prazo || null,
      });
    } else {
      criar.mutate({
        grupo: r.grupo, semana, ...comum,
        descricao: comum.descricao || undefined,
        responsavel: comum.responsavel || undefined,
        prazo: comum.prazo || undefined,
      });
    }
  };

  const salvando = criar.isPending || atualizar.isPending;

  return (
    <Card className="gap-4 py-5 h-full">
      {/* ── Cabeçalho: título, semana e navegação ─────────────────────────── */}
      <div className="px-5 flex items-center gap-2.5 flex-shrink-0">
        <span className="w-7 h-7 rounded-lg bg-primary/20 text-accent flex items-center justify-center flex-shrink-0">
          <Target className="w-4 h-4" />
        </span>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold leading-tight">Prioridades da semana</h2>
          <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">
            <span className="tabular-nums">{rotuloDaSemana(semana)}</span>
            {situacao && <><span className="mx-1 opacity-40">·</span>{situacao}</>}
          </p>
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <button onClick={() => irPara(-1)} title="Semana anterior" aria-label="Semana anterior"
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/30 transition-colors">
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          {/* Só aparece fora da semana atual: um botão "hoje" permanente ocupa
              espaço para não fazer nada na maior parte do tempo. */}
          {situacao && (
            <button onClick={() => { setSemana(inicioDaSemana(hoje)); setExpandido(false); }}
              className="text-[11px] px-1.5 py-0.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/30 transition-colors">
              hoje
            </button>
          )}
          <button onClick={() => irPara(1)} title="Próxima semana" aria-label="Próxima semana"
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/30 transition-colors">
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ── Abas ──────────────────────────────────────────────────────────── */}
      {/* Sublinhado e peso marcam a ativa, sem pílula nem caixa. No mobile a
          linha rola em vez de espremer três colunas. */}
      <div className="px-5 flex-shrink-0">
        <div className="flex items-center gap-1 border-b border-border/60 -mb-px overflow-x-auto">
          {GRUPOS.map((g) => {
            const ativa = g === aba;
            return (
              <button key={g} onClick={() => { setAba(g); setExpandido(false); setRascunho(null); }}
                title={NOME_GRUPO[g]}
                className={`relative px-3 py-2 text-xs whitespace-nowrap transition-colors ${
                  ativa ? "font-semibold text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}>
                {ROTULO_GRUPO[g]}
                {(contagem[g] ?? 0) > 0 && (
                  <span className={`ml-1.5 tabular-nums ${ativa ? "text-accent" : "text-muted-foreground/50"}`}>
                    {contagem[g]}
                  </span>
                )}
                {ativa && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Corpo ─────────────────────────────────────────────────────────── */}
      <div className="px-5 flex-1 min-h-0">
        {q.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
          </div>
        ) : q.isError ? (
          <p className="text-sm text-muted-foreground">Não foi possível carregar as prioridades agora.</p>
        ) : (
          <div className="flex flex-col gap-4">
            {visiveis.length === 0 && !rascunho && (
              <p className="text-sm text-muted-foreground">
                {situacao === null
                  ? `Nenhum direcionamento definido para ${ROTULO_GRUPO[aba]} esta semana.`
                  : `Nada registrado para ${ROTULO_GRUPO[aba]} nesta semana.`}
              </p>
            )}

            {visiveis.map((secao) => (
              <section key={secao.tipo} className="flex flex-col gap-2.5">
                <h3 className="text-[10px] font-semibold uppercase tracking-[0.09em] text-muted-foreground/70">
                  {TITULO_TIPO[secao.tipo]}
                </h3>
                {secao.itens.map((item) =>
                  rascunho?.id === item.id ? (
                    <Formulario key={item.id} rascunho={rascunho} onChange={setRascunho}
                      onSalvar={() => salvar(rascunho)} onCancelar={() => setRascunho(null)}
                      salvando={salvando} />
                  ) : (
                    <Linha key={item.id} item={item} podeEditar={podeEditar}
                      onEditar={() => setRascunho({
                        id: item.id, tipo: item.tipo, titulo: item.titulo,
                        descricao: item.descricao ?? "", responsavel: item.responsavel ?? "",
                        prazo: item.prazo ?? "", status: item.status, grupo: item.grupo as Grupo,
                      })}
                      onExcluir={() => {
                        if (confirm(`Excluir "${item.titulo}"?`)) excluir.mutate({ id: item.id });
                      }}
                      onMover={(d) => mover.mutate({ id: item.id, direcao: d })} />
                  ),
                )}
              </section>
            ))}

            {ocultos > 0 && (
              <button onClick={() => setExpandido(true)}
                className="self-start text-xs font-medium text-accent hover:opacity-80">
                Ver todas ({ocultos + visiveis.reduce((n, s) => n + s.itens.length, 0)})
              </button>
            )}
            {expandido && secoes.reduce((n, s) => n + s.itens.length, 0) > ITENS_VISIVEIS && (
              <button onClick={() => setExpandido(false)}
                className="self-start text-xs font-medium text-accent hover:opacity-80">
                Mostrar menos
              </button>
            )}

            {rascunho && !rascunho.id && (
              <Formulario rascunho={rascunho} onChange={setRascunho}
                onSalvar={() => salvar(rascunho)} onCancelar={() => setRascunho(null)}
                salvando={salvando} />
            )}

            {podeEditar && !rascunho && (
              <button onClick={() => setRascunho(vazio(aba))}
                className="self-start inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
                <Plus className="w-3.5 h-3.5" /> Adicionar
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Rodapé: quem atualizou ────────────────────────────────────────── */}
      {q.data?.atualizadoEm && (
        <div className="px-5 mt-auto flex-shrink-0">
          <span className="text-[11px] text-muted-foreground">
            {textoDeAtualizacao(new Date(q.data.atualizadoEm), q.data.atualizadoPor)}
          </span>
        </div>
      )}
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

const primeiroNome = (n: string) => n.trim().split(/\s+/)[0] ?? n;

/**
 * Uma linha do painel.
 *
 * Sem borda, sem fundo, sem badge. A hierarquia é: título em peso médio,
 * descrição em cinza menor, e a linha de meta (prazo · responsável · status)
 * ainda menor. Os controles de edição só existem no hover, e no mobile eles
 * aparecem sempre — hover não existe lá, e um botão invisível é um botão que
 * não existe.
 */
function Linha({ item, podeEditar, onEditar, onExcluir, onMover }: {
  item: ItemPrioridade;
  podeEditar: boolean;
  onEditar: () => void;
  onExcluir: () => void;
  onMover: (d: -1 | 1) => void;
}) {
  const meta = [
    item.prazo ? rotuloDeDia(item.prazo) : null,
    item.responsavel,
  ].filter(Boolean);

  return (
    <div className="group flex items-start gap-2.5">
      {/* A única cor forte do módulo, e só em ATENÇÃO: é o único tipo que pede
          ação de quem lê. Cor nos três não distinguiria nada. */}
      {item.tipo === "ATENCAO" && (
        <span className="mt-1 w-0.5 self-stretch rounded-full bg-amber-500/70 flex-shrink-0" aria-hidden />
      )}
      <div className="min-w-0 flex-1">
        <p className={`text-sm leading-snug ${item.status === "CONCLUIDO" ? "text-muted-foreground line-through decoration-1" : "text-foreground font-medium"}`}>
          {item.titulo}
        </p>
        {item.descricao && (
          <p className="text-xs text-muted-foreground leading-snug mt-0.5">{item.descricao}</p>
        )}
        {(meta.length > 0 || item.status !== "PLANEJADO") && (
          <p className="text-[11px] mt-1 text-muted-foreground">
            {meta.map((m, i) => (
              <span key={i}>{i > 0 && <span className="mx-1 opacity-40">·</span>}{m}</span>
            ))}
            {item.status !== "PLANEJADO" && (
              <>
                {meta.length > 0 && <span className="mx-1 opacity-40">·</span>}
                <span className={TOM_STATUS[item.status]}>{ROTULO_STATUS[item.status]}</span>
              </>
            )}
          </p>
        )}
      </div>

      {podeEditar && (
        <div className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 max-md:opacity-100 transition-opacity">
          <BotaoIcone titulo="Subir" onClick={() => onMover(-1)}><ArrowUp className="w-3 h-3" /></BotaoIcone>
          <BotaoIcone titulo="Descer" onClick={() => onMover(1)}><ArrowDown className="w-3 h-3" /></BotaoIcone>
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
 * A edição, inline.
 *
 * No lugar do item, e não num modal: quem está reorganizando o direcionamento
 * precisa ver os outros itens enquanto escreve — é comparando que se decide o
 * que é prioridade. Um modal esconde exatamente o contexto que a decisão usa.
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
    <div className="flex flex-col gap-2 rounded-lg border border-border/70 bg-muted/20 p-3">
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
        <input value={rascunho.responsavel} onChange={(e) => set("responsavel", e.target.value)}
          placeholder="Responsável (opcional)" maxLength={80} className={`${campo} flex-1 min-w-[130px]`} />
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
