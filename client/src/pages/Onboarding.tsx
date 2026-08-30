/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  /onboarding — a trilha de entrada de um colaborador
 * ─────────────────────────────────────────────────────────────────────────────
 *  O documento de onboarding vinha sendo um PDF. O que um PDF não guarda é
 *  justamente o que importa depois do primeiro dia: o que já foi providenciado,
 *  o que a pessoa marcou como entendido e o que ela anotou para levar ao 1:1.
 *  Esta página é o documento com essas três coisas guardadas.
 *
 *  ── O que é leitura e o que é interação ────────────────────────────────────
 *  Quem decide é o conteúdo (shared/onboarding.ts), não esta tela: uma seção
 *  vira widget quando declara `interativo`. "O que NÃO esperamos nos primeiros
 *  30 dias" e "a transição de especialista a gestora" não declaram — são
 *  conversa, e viram caixinha de marcar só se alguém decidir isso lá, de
 *  propósito.
 *
 *  ── Privacidade ────────────────────────────────────────────────────────────
 *  O caderno e as respostas de 1:1 são da pessoa. O botão "levar pro 1:1" é a
 *  única porta pela qual o administrativo lê uma anotação — e quem abre é ela.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useMemo, useRef, useState } from "react";
import {
  BookOpen, Calendar, Check, CheckCircle2, ChevronRight, Loader2, Lock,
  Plus, Share2, Sparkles, Trash2, Undo2, UserPlus,
} from "lucide-react";
import { toast } from "sonner";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/routers";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { canAccessAdmin } from "@shared/permissions";
import { useRascunhoAutosalvo } from "@/hooks/useRascunhoAutosalvo";
import { ROTULO_DO_RASCUNHO } from "@shared/rascunhoAutosalvo";
import {
  SECOES, PERGUNTAS_1A1, checkpointsDaTrilha, progresso,
  type Bloco, type Secao, type NivelDecisao,
} from "@shared/onboarding";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { HubShell } from "./hub/HubShell";

// ── Datas ────────────────────────────────────────────────────────────────────
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
function diaCurto(dia: string) {
  const [, m, d] = dia.split("-");
  return `${d}/${MESES[Number(m) - 1]}`;
}
function hojeISO() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}
/** "hoje", "em 12 dias", "há 3 dias" — o checkpoint precisa dizer se já passou. */
function distancia(dia: string) {
  const hoje = hojeISO();
  if (dia === hoje) return { texto: "hoje", passou: false, agora: true };
  const dif = Math.round((Date.parse(`${dia}T00:00:00Z`) - Date.parse(`${hoje}T00:00:00Z`)) / 86_400_000);
  return dif > 0
    ? { texto: dif === 1 ? "amanhã" : `em ${dif} dias`, passou: false, agora: false }
    : { texto: dif === -1 ? "ontem" : `há ${-dif} dias`, passou: true, agora: false };
}

// ── Blocos de leitura ────────────────────────────────────────────────────────
const CORES_MATRIZ: Record<NivelDecisao, string> = {
  decide: "border-emerald-500/40 bg-emerald-500/[0.06]",
  comunica: "border-blue-500/40 bg-blue-500/[0.06]",
  consulta: "border-amber-500/40 bg-amber-500/[0.06]",
  escala: "border-red-500/40 bg-red-500/[0.06]",
};
const PONTO_MATRIZ: Record<NivelDecisao, string> = {
  decide: "bg-emerald-500", comunica: "bg-blue-500", consulta: "bg-amber-500", escala: "bg-red-500",
};

function BlocoRender({ b }: { b: Bloco }) {
  if (b.tipo === "texto") return <p className="text-[15px] leading-relaxed text-foreground/85">{b.texto}</p>;

  if (b.tipo === "destaque") return (
    <p className="border-l-2 border-accent pl-4 text-[15px] font-medium leading-relaxed text-foreground">{b.texto}</p>
  );

  if (b.tipo === "lista") return (
    <ul className="space-y-2">
      {b.itens.map((i, n) => (
        <li key={n} className="flex gap-2.5 text-[15px] leading-relaxed text-foreground/85">
          <span className="mt-[9px] h-1 w-1 flex-shrink-0 rounded-full bg-accent" />
          <span>{i.titulo && <span className="font-semibold text-foreground">{i.titulo}. </span>}{i.texto}</span>
        </li>
      ))}
    </ul>
  );

  if (b.tipo === "passos") return (
    <ol className="space-y-3">
      {b.itens.map((i, n) => (
        <li key={n} className="flex gap-3">
          <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-accent/15 text-xs font-semibold text-accent">{n + 1}</span>
          <span className="pt-0.5 text-[15px] leading-relaxed text-foreground/85">
            <span className="font-semibold text-foreground">{i.titulo}. </span>{i.texto}
          </span>
        </li>
      ))}
    </ol>
  );

  if (b.tipo === "tabela") return (
    <div className="overflow-hidden rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead><tr className="border-b border-border bg-muted/40">
          <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{b.colunas[0]}</th>
          <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{b.colunas[1]}</th>
        </tr></thead>
        <tbody>
          {b.linhas.map((l, n) => (
            <tr key={n} className="border-b border-border align-top last:border-0">
              <td className="whitespace-nowrap px-3 py-2.5 font-semibold">{l.a}</td>
              {/* Lacuna aparece COMO lacuna: fingir que está completo é pior que o vazio. */}
              <td className="px-3 py-2.5 text-foreground/80">
                {l.pendente ? <span className="text-xs italic text-muted-foreground">a preencher</span> : l.b}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {b.grupos.map((g) => (
        <div key={g.titulo} className={`rounded-lg border p-3.5 ${CORES_MATRIZ[g.nivel]}`}>
          <p className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <span className={`h-2 w-2 rounded-full ${PONTO_MATRIZ[g.nivel]}`} />{g.titulo}
          </p>
          <ul className="space-y-1.5">
            {g.itens.map((t, n) => <li key={n} className="text-[13px] leading-relaxed text-foreground/80">{t}</li>)}
          </ul>
        </div>
      ))}
    </div>
  );
}

// ── Widgets interativos ──────────────────────────────────────────────────────
/**
 * O tipo sai do ROUTER, e não de `ReturnType<typeof useQuery>`: o segundo
 * colapsa para `{}` neste projeto (a inferência do hook não sobrevive ao
 * tamanho do AppRouter), e o compilador deixaria de conferir cada campo lido
 * aqui — justamente onde a regra de privacidade se apoia.
 */
type Dados = NonNullable<inferRouterOutputs<AppRouter>["onboarding"]["minha"]>;

function ListaMarcavel({ itens, bloco, onToggle }: {
  itens: Dados["itens"]; bloco: string; onToggle: (id: number, feito: boolean) => void;
}) {
  const doBloco = itens.filter((i) => i.bloco === bloco);
  return (
    <div className="space-y-1.5">
      {doBloco.map((i) => (
        <button
          key={i.id}
          onClick={() => onToggle(i.id, !i.feito)}
          className={`flex w-full items-start gap-3 rounded-lg border p-3 text-left transition ${
            i.feito ? "border-emerald-500/30 bg-emerald-500/[0.06]" : "border-border hover:border-accent/50 hover:bg-accent/5"
          }`}
        >
          <span className={`mt-0.5 flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded border ${
            i.feito ? "border-emerald-500 bg-emerald-500 text-white" : "border-muted-foreground/40"
          }`}>
            {i.feito && <Check className="h-3 w-3" strokeWidth={3} />}
          </span>
          <span className="min-w-0 flex-1">
            <span className={`block text-sm font-medium ${i.feito ? "text-foreground/70 line-through decoration-foreground/30" : ""}`}>{i.titulo}</span>
            {i.descricao && <span className="mt-0.5 block text-[13px] leading-relaxed text-muted-foreground">{i.descricao}</span>}
          </span>
        </button>
      ))}
    </div>
  );
}

/**
 * Um campo que salva sozinho, criando a nota na primeira gravação.
 *
 * O id da nota vive num ref: a resposta nasce sem id, ganha um no primeiro
 * save, e as gravações seguintes precisam ATUALIZAR em vez de criar — senão
 * cada pausa na digitação viraria uma anotação nova.
 */
function CampoAutosalvo({ trilhaId, tipo, pergunta, notaId, textoInicial, placeholder, onSalvou }: {
  trilhaId: number; tipo: "REGISTRO" | "RESPOSTA"; pergunta?: string;
  notaId: number | null; textoInicial: string; placeholder: string; onSalvou: () => void;
}) {
  const idRef = useRef<number | null>(notaId);
  const salvar = trpc.onboarding.salvarNota.useMutation();
  const rascunho = useRascunhoAutosalvo({
    chave: pergunta ?? `nota-${notaId ?? "nova"}`,
    doServidor: textoInicial,
    salvar: async (texto) => {
      if (!texto.trim()) return;
      const r = await salvar.mutateAsync({
        id: idRef.current ?? undefined, trilhaId, tipo,
        ...(pergunta ? { pergunta } : {}), texto,
      });
      const eraNova = idRef.current == null;
      idRef.current = r.id;
      if (eraNova) onSalvou();
    },
  });
  return (
    <div>
      <Textarea
        value={rascunho.valor}
        onChange={(e) => rascunho.digitar(e.target.value)}
        onBlur={() => rascunho.flush()}
        placeholder={placeholder}
        className="min-h-[84px] resize-y text-sm"
      />
      <p className="mt-1 h-4 text-[11px] text-muted-foreground">{ROTULO_DO_RASCUNHO[rascunho.estado]}</p>
    </div>
  );
}

/** O botão que é a porta da privacidade — e o único jeito de o admin ler algo. */
function BotaoCompartilhar({ compartilhado, onClick }: { compartilhado: boolean; onClick: () => void }) {
  return (
    <Button
      size="sm" variant={compartilhado ? "outline" : "ghost"} onClick={onClick}
      title={compartilhado ? "Tirar do 1:1 — volta a ser só seu" : "Levar pro 1:1 — o administrativo passa a ler esta anotação"}
    >
      {compartilhado
        ? <><Undo2 className="mr-1 h-3.5 w-3.5" /> Tirar do 1:1</>
        : <><Share2 className="mr-1 h-3.5 w-3.5" /> Levar pro 1:1</>}
    </Button>
  );
}

function Caderno({ dados, onMudou }: { dados: Dados; onMudou: () => void }) {
  const [novo, setNovo] = useState("");
  const salvar = trpc.onboarding.salvarNota.useMutation({
    onSuccess: () => { setNovo(""); onMudou(); },
    onError: (e) => toast.error(e.message),
  });
  const compartilhar = trpc.onboarding.compartilharNota.useMutation({ onSuccess: onMudou, onError: (e) => toast.error(e.message) });
  const excluir = trpc.onboarding.excluirNota.useMutation({ onSuccess: onMudou, onError: (e) => toast.error(e.message) });
  const registros = dados.notas.filter((n) => n.tipo === "REGISTRO");

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border p-3">
        <Textarea
          value={novo}
          onChange={(e) => setNovo(e.target.value)}
          placeholder="Uma dúvida, um atrito, algo que você faria diferente…"
          className="min-h-[76px] resize-y border-0 p-0 text-sm shadow-none focus-visible:ring-0"
        />
        <div className="mt-2 flex justify-end">
          <Button
            size="sm"
            disabled={!novo.trim() || salvar.isPending}
            onClick={() => salvar.mutate({ trilhaId: dados.trilha.id, tipo: "REGISTRO", texto: novo.trim() })}
          >
            <Plus className="mr-1 h-4 w-4" /> Anotar
          </Button>
        </div>
      </div>

      {registros.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">Nada anotado ainda.</p>}

      {registros.map((n) => (
        <div key={n.id} className="rounded-lg border border-border p-3">
          <CampoAutosalvo
            trilhaId={dados.trilha.id} tipo="REGISTRO" notaId={n.id}
            textoInicial={n.texto} placeholder="…" onSalvou={onMudou}
          />
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2">
            <span className="text-[11px] text-muted-foreground">
              {new Date(n.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
              {n.compartilhado && <span className="ml-2 text-accent">· no 1:1</span>}
            </span>
            <div className="flex items-center gap-1">
              <BotaoCompartilhar compartilhado={n.compartilhado} onClick={() => compartilhar.mutate({ id: n.id, compartilhado: !n.compartilhado })} />
              <button
                onClick={() => { if (confirm("Excluir esta anotação?")) excluir.mutate({ id: n.id }); }}
                className="p-1.5 text-muted-foreground hover:text-destructive" title="Excluir"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function Perguntas({ dados, onMudou }: { dados: Dados; onMudou: () => void }) {
  const compartilhar = trpc.onboarding.compartilharNota.useMutation({ onSuccess: onMudou, onError: (e) => toast.error(e.message) });
  const respostas = dados.notas.filter((n) => n.tipo === "RESPOSTA");
  return (
    <div className="space-y-3">
      {PERGUNTAS_1A1.map((p) => {
        const nota = respostas.find((n) => n.pergunta === p) ?? null;
        return (
          <div key={p} className="rounded-lg border border-border p-3">
            <p className="mb-2 text-sm font-medium">{p}</p>
            <CampoAutosalvo
              trilhaId={dados.trilha.id} tipo="RESPOSTA" pergunta={p}
              notaId={nota?.id ?? null} textoInicial={nota?.texto ?? ""}
              placeholder="Sua resposta…" onSalvou={onMudou}
            />
            {nota && <BotaoCompartilhar compartilhado={nota.compartilhado} onClick={() => compartilhar.mutate({ id: nota.id, compartilhado: !nota.compartilhado })} />}
          </div>
        );
      })}
    </div>
  );
}

function Checkpoints({ dataInicio }: { dataInicio: string }) {
  const cps = useMemo(() => checkpointsDaTrilha(dataInicio), [dataInicio]);
  return (
    <div className="space-y-1.5">
      {cps.map((c) => {
        const d = distancia(c.data);
        return (
          <div key={c.chave} className={`flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-lg border p-3 ${d.agora ? "border-accent/50 bg-accent/5" : "border-border"}`}>
            <span className="text-sm font-semibold">{c.rotulo}</span>
            <span className="text-xs tabular-nums text-muted-foreground">{diaCurto(c.data)}</span>
            <span className={`text-[11px] ${d.agora ? "font-semibold text-accent" : d.passou ? "text-muted-foreground" : "text-foreground/60"}`}>{d.texto}</span>
            <span className="w-full text-[13px] leading-relaxed text-muted-foreground">{c.foco}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Seção ────────────────────────────────────────────────────────────────────
function SecaoRender({ secao, dados, onMudou, onToggle }: {
  secao: Secao; dados: Dados; onMudou: () => void; onToggle: (id: number, feito: boolean) => void;
}) {
  return (
    <section id={secao.id} className="scroll-mt-6">
      <h2 className="mb-3 text-lg font-semibold tracking-tight">{secao.titulo}</h2>
      <div className="space-y-3.5">
        {secao.blocos.map((b, n) => <BlocoRender key={n} b={b} />)}
        {secao.interativo === "ACESSOS" && <ListaMarcavel itens={dados.itens} bloco="ACESSO" onToggle={onToggle} />}
        {secao.interativo === "SEMANA1" && <ListaMarcavel itens={dados.itens} bloco="SEMANA1" onToggle={onToggle} />}
        {secao.interativo === "CADERNO" && <Caderno dados={dados} onMudou={onMudou} />}
        {secao.interativo === "PERGUNTAS" && <Perguntas dados={dados} onMudou={onMudou} />}
        {secao.interativo === "CHECKPOINTS" && <Checkpoints dataInicio={dados.trilha.dataInicio} />}
      </div>
    </section>
  );
}

// ── Painel do administrativo ─────────────────────────────────────────────────
function PainelAdmin() {
  const utils = trpc.useUtils();
  const lista = trpc.onboarding.lista.useQuery();
  const pessoas = trpc.people.list.useQuery();
  const [userId, setUserId] = useState<string>("");
  const [inicio, setInicio] = useState(hojeISO());
  const inv = () => utils.onboarding.invalidate();
  const criar = trpc.onboarding.criar.useMutation({
    onSuccess: (r) => { inv(); if (r.jaExistia) toast.info("Essa pessoa já tem uma trilha ativa."); else toast.success("Trilha criada."); },
    onError: (e) => toast.error(e.message),
  });
  const arquivar = trpc.onboarding.arquivar.useMutation({ onSuccess: () => { inv(); toast.success("Trilha arquivada."); }, onError: (e) => toast.error(e.message) });

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="mb-3 flex items-center gap-2 text-sm font-semibold"><UserPlus className="h-4 w-4" /> Nova trilha</p>
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[200px] flex-1">
            <label className="mb-1 block text-xs text-muted-foreground">Colaborador</label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger><SelectValue placeholder="Escolha…" /></SelectTrigger>
              <SelectContent>
                {(pessoas.data ?? []).map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>{p.name ?? p.email ?? `#${p.id}`}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Primeiro dia</label>
            <Input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} className="w-[160px]" />
          </div>
          <Button disabled={!userId || criar.isPending} onClick={() => criar.mutate({ userId: Number(userId), dataInicio: inicio })}>Criar</Button>
        </div>
      </div>

      {(lista.data ?? []).map((t) => {
        const acessos = t.itens.filter((i) => i.bloco === "ACESSO");
        const semana = t.itens.filter((i) => i.bloco === "SEMANA1");
        const pa = progresso(acessos), ps = progresso(semana);
        const faltando = acessos.filter((i) => !i.feito);
        return (
          <div key={t.trilha.id} className="rounded-xl border border-border bg-card p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-semibold">{t.pessoa.name ?? `#${t.trilha.userId}`}</p>
                <p className="text-xs text-muted-foreground">
                  Primeiro dia {diaCurto(t.trilha.dataInicio)} · acessos {pa.feitos}/{pa.total} · primeira semana {ps.feitos}/{ps.total}
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => { if (confirm("Arquivar esta trilha? O que a pessoa escreveu continua guardado.")) arquivar.mutate({ trilhaId: t.trilha.id }); }}>
                Arquivar
              </Button>
            </div>

            {faltando.length > 0 && (
              <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] p-3">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-600">Acessos em aberto</p>
                <ul className="space-y-0.5">
                  {faltando.map((i) => <li key={i.id} className="text-[13px] text-foreground/80">{i.titulo}</li>)}
                </ul>
              </div>
            )}

            <div>
              <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Lock className="h-3 w-3" /> Trazido para o 1:1
              </p>
              {t.notasCompartilhadas.length === 0
                ? <p className="text-[13px] text-muted-foreground">Nada compartilhado. O caderno é dela — aqui só aparece o que ela decidir trazer.</p>
                : (
                  <ul className="space-y-2">
                    {t.notasCompartilhadas.map((n) => (
                      <li key={n.id} className="rounded-lg border border-border p-2.5">
                        {n.pergunta && <p className="mb-1 text-[11px] font-medium text-muted-foreground">{n.pergunta}</p>}
                        <p className="whitespace-pre-wrap text-[13px] leading-relaxed">{n.texto}</p>
                      </li>
                    ))}
                  </ul>
                )}
            </div>
          </div>
        );
      })}

      {lista.data?.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma trilha ativa.</p>}
    </div>
  );
}

// ── Página ───────────────────────────────────────────────────────────────────
export default function OnboardingPage() {
  const { user } = useAuth();
  const isAdmin = canAccessAdmin((user as { role?: string } | null)?.role);
  const primeiroNome = String((user as { name?: string } | null)?.name ?? "").split(" ")[0];
  const utils = trpc.useUtils();
  const q = trpc.onboarding.minha.useQuery();
  const [verAdmin, setVerAdmin] = useState(false);
  const onMudou = () => utils.onboarding.minha.invalidate();
  const marcar = trpc.onboarding.marcarItem.useMutation({
    onSuccess: () => utils.onboarding.invalidate(),
    onError: (e) => toast.error(e.message),
  });

  const dados = q.data ?? null;
  const pa = progresso(dados?.itens.filter((i) => i.bloco === "ACESSO") ?? []);
  const ps = progresso(dados?.itens.filter((i) => i.bloco === "SEMANA1") ?? []);

  const conteudo = (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-accent">
            <Sparkles className="h-3.5 w-3.5" /> Onboarding
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">
            {dados ? `Boas-vindas à Selva${primeiroNome ? `, ${primeiroNome}` : ""}` : "Onboarding"}
          </h1>
          {dados && (
            <p className="mt-1 text-sm text-muted-foreground">
              Primeiro dia {diaCurto(dados.trilha.dataInicio)} · acessos {pa.feitos}/{pa.total} · primeira semana {ps.feitos}/{ps.total}
            </p>
          )}
        </div>
        {isAdmin && (
          <Button size="sm" variant={verAdmin ? "default" : "outline"} onClick={() => setVerAdmin((v) => !v)}>
            {verAdmin ? <><BookOpen className="mr-1 h-4 w-4" /> Ver a trilha</> : <><Calendar className="mr-1 h-4 w-4" /> Acompanhamento</>}
          </Button>
        )}
      </div>

      {q.isLoading && <div className="py-12 text-center text-muted-foreground"><Loader2 className="inline h-5 w-5 animate-spin" /></div>}

      {!q.isLoading && (verAdmin || !dados) && isAdmin && <PainelAdmin />}

      {!q.isLoading && !dados && !isAdmin && (
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <CheckCircle2 className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">Você ainda não tem uma trilha de onboarding aberta.</p>
        </div>
      )}

      {!q.isLoading && dados && !verAdmin && (
        <>
          {/* Índice: o documento é longo, e a pessoa vai voltar nele por semanas. */}
          <nav className="mb-6 flex flex-wrap gap-1.5">
            {SECOES.map((s) => (
              <a key={s.id} href={`#${s.id}`} className="rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground transition hover:border-accent/50 hover:text-foreground">
                {s.titulo}
              </a>
            ))}
          </nav>
          <div className="space-y-8">
            {SECOES.map((s) => (
              <SecaoRender key={s.id} secao={s} dados={dados} onMudou={onMudou} onToggle={(id, feito) => marcar.mutate({ id, feito })} />
            ))}
          </div>
          <p className="mt-10 flex items-center gap-1.5 border-t border-border pt-4 text-[11px] text-muted-foreground">
            <ChevronRight className="h-3 w-3" /> Documento de trabalho — revisão combinada em 90 dias.
          </p>
        </>
      )}
    </div>
  );

  return <HubShell><main className="flex-1 overflow-auto p-6 md:p-8">{conteudo}</main></HubShell>;
}
