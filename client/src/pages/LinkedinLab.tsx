/**
 * ═════════════════════════════════════════════════════════════════════════════
 *  LINKEDIN LAB — bancada interna. NÃO é a interface final da aba Social.
 * ═════════════════════════════════════════════════════════════════════════════
 *  A pergunta que esta página responde não é "como está o cliente". É:
 *
 *      "o que o LinkedIn nos entregou, e o que ele recusou?"
 *
 *  Por isso ela mostra tudo que foi coletado — inclusive os ~30 recortes de
 *  visualização que talvez ninguém use — e coloca o estado ao lado de cada
 *  número. Filtrar aqui pelo que parece útil derrotaria a razão de a página
 *  existir: descobrir o que é útil.
 *
 *  ── Abrir a página NÃO gasta cota ──────────────────────────────────────────
 *  Toda leitura vem do banco. A cota do LinkedIn é diária, por app e INVISÍVEL
 *  — nenhuma resposta traz cabeçalho de limite. Um `useEffect` distraído
 *  gastaria a cota da agência numa tarde de exploração, e ninguém descobriria
 *  pelo erro, e sim pelo silêncio da API no dia seguinte.
 *
 *  Só dois botões chamam a API, e os dois dizem o preço antes: "Sincronizar
 *  agora" e "Carga histórica". Nenhum polling.
 *
 *  ── Quatro estados, nunca um zero anônimo ──────────────────────────────────
 *      0            mediu e deu zero
 *      —            a API recusou (o motivo está no hover)
 *      ·            não pedimos essa métrica
 *      !            a coleta falhou
 * ═════════════════════════════════════════════════════════════════════════════
 */
import { useMemo, useState } from "react";
import {
  AlertTriangle, ChevronDown, ChevronRight, Download, ExternalLink, Image as ImgIcon,
  Layers, Link2, Loader2, RefreshCw, Search, Unlink, X,
} from "lucide-react";
import type { inferRouterOutputs } from "@trpc/server";
import { trpc } from "@/lib/trpc";
import type { AppRouter } from "../../../server/routers";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { MetaDashboardLayout } from "@/components/MetaDashboardLayout";
import { SemAcessoTracker } from "@/components/SemAcessoTracker";
import { useAuth } from "@/_core/hooks/useAuth";
import { canAccessLaboratorio } from "@shared/permissions";
import { Button } from "@/components/ui/button";
import { CurvaHistorica, LeituraDoPonto, type PontoHistorico } from "@/components/redes/GraficosSociais";
import { COR } from "@shared/coresSociais";
import {
  CAPACIDADES, ROTULO_CAPACIDADE, ROTULO_ESTADO, ROTULO_VINCULO,
  cargoPrincipal, cargosVivos,
  type EstadoDaCapacidade, type MapaDeCapacidades, type StatusDoVinculo,
} from "@shared/linkedinLab";
import {
  JANELA_HISTORICA_DIAS, SOBREPOSICAO_DIAS, projecaoDeFrota,
} from "@shared/linkedinPlanoDeColeta";
import {
  GRUPOS_DE_DADO, ROTULO_MEDIDA, linhasDoSegmento, oQueFalta, segmentosDisponiveis,
  vereditoDoGrupo, type EstadoDaMedida, type VereditoDoGrupo,
} from "@shared/linkedinCobertura";

/**
 * O rótulo de uma Página — nome primeiro, sempre.
 *
 * Quando o LinkedIn não entrega o nome (a decoração da ACL falha nas Páginas
 * que ele recusa, e `/rest/organizations` responde 403 nelas), a tela DIZ que
 * não há nome. Ela nunca cai para o nome do cliente: o vínculo é
 * `cliente → organizationUrn`, e usar um para nomear o outro inventaria uma
 * identidade que a API não deu.
 */
const rotuloDaPagina = (p: { nome?: string | null; organizationId?: string }) =>
  p.nome ?? `Nome não disponível · ${p.organizationId ?? ""}`;

/* ── utilitários de formatação ─────────────────────────────────────────── */
const fmt = (n: number) => n.toLocaleString("pt-BR");
const pct = (n: number) => `${(n * 100).toFixed(2)}%`;
const dataBr = (d: string | Date | null | undefined) => {
  if (!d) return "—";
  const s = typeof d === "string" ? d : d.toISOString();
  return `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;
};
const diasEntre = (a: string, b: string) =>
  Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000);

/**
 * O número, ou a marca do estado.
 *
 * Nunca devolve 0 para ausência: `—` é recusa, `·` é não pedido. Um zero de
 * consolo aqui apagaria a diferença entre "a Página não teve visitas" e "a API
 * não deixou ver".
 */
function Numero({ valor, motivo, sufixo }: {
  valor: number | string | null | undefined; motivo?: string | null; sufixo?: string;
}) {
  if (valor === null || valor === undefined) {
    return (
      <span className="text-muted-foreground/60 tabular-nums" title={motivo ?? "não coletado nesta rodada"}>
        {motivo ? "—" : "·"}
      </span>
    );
  }
  return (
    <span className="tabular-nums">
      {typeof valor === "number" ? fmt(valor) : valor}
      {sufixo ? <span className="text-muted-foreground/70 text-[0.85em] ml-0.5">{sufixo}</span> : null}
    </span>
  );
}

const TOM_CAPACIDADE: Record<EstadoDaCapacidade, string> = {
  ok: "text-emerald-600 dark:text-emerald-500 border-emerald-600/40",
  sem_dados: "text-muted-foreground border-muted-foreground/30",
  sem_permissao: "text-amber-600 dark:text-amber-500 border-amber-600/40",
  nao_disponivel: "text-muted-foreground border-dashed border-muted-foreground/40",
  erro: "text-destructive border-destructive/40",
  nao_coletado: "text-muted-foreground/60 border-dashed border-muted-foreground/25",
};

const TOM_VINCULO: Record<StatusDoVinculo, string> = {
  completo: "text-emerald-600 dark:text-emerald-500",
  parcial: "text-amber-600 dark:text-amber-500",
  sem_acesso: "text-destructive",
  erro: "text-destructive",
  nao_vinculada: "text-muted-foreground",
};

function Selo({ estado, children, titulo }: {
  estado: EstadoDaCapacidade; children: React.ReactNode; titulo?: string;
}) {
  return (
    <span title={titulo}
      className={`text-[10px] font-mono uppercase tracking-wide px-1.5 py-0.5 rounded border ${TOM_CAPACIDADE[estado]}`}>
      {children}
    </span>
  );
}

function Bloco({ titulo, nota, acao, children }: {
  titulo: string; nota?: string; acao?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <Card className="p-4 flex flex-col gap-3 min-w-0">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div className="flex items-baseline gap-2 flex-wrap min-w-0">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground/80">{titulo}</h2>
          {nota && <span className="text-[10px] text-muted-foreground/60">{nota}</span>}
        </div>
        {acao}
      </div>
      {children}
    </Card>
  );
}

/** Área recolhível — é como o JSON cru fica disponível sem dominar a tela. */
function Recolhivel({ titulo, children, contagem }: {
  titulo: string; children: React.ReactNode; contagem?: number;
}) {
  const [aberto, setAberto] = useState(false);
  return (
    <div className="border-t border-border/60 pt-2">
      <button type="button" onClick={() => setAberto((x) => !x)}
        className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors">
        {aberto ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        {titulo}
        {contagem !== undefined && <span className="text-muted-foreground/60">· {contagem}</span>}
      </button>
      {aberto && (
        <pre className="mt-2 text-[10.5px] leading-relaxed bg-muted/50 rounded p-3 overflow-auto max-h-[420px] font-mono">
          {children}
        </pre>
      )}
    </div>
  );
}

const bruto = (v: unknown) => JSON.stringify(v ?? null, null, 2);

/** CSV de qualquer tabela — é como o dado sai daqui para onde se pensa melhor. */
function baixarCsv(nome: string, linhas: Array<Record<string, unknown>>) {
  if (!linhas.length) return;
  const cols = Array.from(new Set(linhas.flatMap((l) => Object.keys(l))));
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [cols.join(";"), ...linhas.map((l) => cols.map((c) => esc(l[c])).join(";"))].join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" }));
  a.download = `${nome}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ═══════════════════════════════════════════════════════════════════════════
   A página
   ═══════════════════════════════════════════════════════════════════════════ */

type Aba = "geral" | "banco" | "identidade" | "evolucao" | "visualizacoes"
  | "segmentacoes" | "publicacoes" | "cobertura" | "consumo" | "cru" | "paginas";

const ABAS: Array<{ id: Aba; nome: string }> = [
  { id: "geral", nome: "Visão geral" },
  { id: "banco", nome: "Estado do banco" },
  { id: "identidade", nome: "Página" },
  { id: "evolucao", nome: "Evolução" },
  { id: "visualizacoes", nome: "Visualizações" },
  { id: "segmentacoes", nome: "Segmentações" },
  { id: "publicacoes", nome: "Publicações" },
  { id: "cobertura", nome: "Cobertura" },
  { id: "consumo", nome: "Consumo da API" },
  { id: "cru", nome: "Dados brutos" },
  /**
   * Última, e SEMPRE presente.
   *
   * A tela de vincular só aparecia quando não havia nenhum vínculo — depois do
   * primeiro, ela sumia para sempre e não havia como trocar, adicionar nem
   * remover Página. Uma porta que fecha por dentro não é fluxo, é beco.
   */
  { id: "paginas", nome: "Páginas vinculadas" },
];

export default function LinkedinLab() {
  const { user } = useAuth();
  const [pageId, setPageId] = useState<number | null>(null);
  const [aba, setAba] = useState<Aba>("geral");
  const [dias, setDias] = useState(90);
  const [postAberto, setPostAberto] = useState<string | null>(null);

  /**
   * A porta, DENTRO da página — como no Rascunho.
   *
   * `canAccessLaboratorio` é escrita por extenso (admin + developer) e não
   * `role !== "user"`: a forma negativa incluiria sozinha qualquer papel novo,
   * e o coordenador entraria sem ninguém decidir isso.
   *
   * Isto é camada de UI. A proteção real é `laboratorioProcedure` no servidor —
   * e é ela que faz o `enabled: pode` abaixo ser conveniência, e não segurança.
   */
  const pode = canAccessLaboratorio((user as { role?: string } | null)?.role);

  const vinculosQ = trpc.social.linkedinLab.vinculos.useQuery(undefined, {
    refetchOnWindowFocus: false, enabled: pode,
  });
  const vinculos = vinculosQ.data ?? [];
  const ativo = pageId ?? vinculos[0]?.id ?? null;

  const hoje = new Date().toISOString().slice(0, 10);
  const de = new Date(Date.now() - dias * 86_400_000).toISOString().slice(0, 10);

  // Sem polling, sem refetch no foco: abrir a página não pode custar chamada.
  const dadosQ = trpc.social.linkedinLab.pagina.useQuery(
    { pageId: ativo ?? 0, de, ate: hoje },
    { enabled: pode && !!ativo, refetchOnWindowFocus: false, refetchInterval: false },
  );

  const d = dadosQ.data;
  const pagina = d?.pagina ?? null;
  const capacidades = (pagina?.capacidadeDetalheJson ?? {}) as MapaDeCapacidades;
  const papeis = (pagina?.papeisJson ?? []) as Array<{ papel: string; estado: string }>;
  const status = (pagina?.capacidade ?? "nao_vinculada") as StatusDoVinculo;

  if (!pode) {
    return (
      <SemAcessoTracker title="LinkedIn Lab"
        message="A bancada de validação da integração do LinkedIn é restrita a administradores e desenvolvedores." />
    );
  }

  return (
    <MetaDashboardLayout title="LinkedIn Lab">
      <Cabecalho
        vinculos={vinculos}
        ativo={ativo}
        aoTrocar={(id) => { setPageId(id); setPostAberto(null); }}
        dias={dias}
        aoTrocarPeriodo={setDias}
        status={status}
        papeis={papeis}
        carregando={vinculosQ.isLoading}
        onSincronizado={() => { void dadosQ.refetch(); void vinculosQ.refetch(); }}
      />

      <div className="max-w-[1400px] mx-auto px-4 md:px-6 pb-16">
        <nav className="flex gap-1 flex-wrap border-b border-border mb-4">
          {ABAS.map((a) => (
            <button key={a.id} type="button" onClick={() => setAba(a.id)}
              className={`px-3 py-2 text-[12px] font-medium border-b-2 -mb-px transition-colors ${
                aba === a.id
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"}`}>
              {a.nome}
            </button>
          ))}
        </nav>

        {aba === "paginas" && (
          <GerenciarVinculos aoMudar={() => { void vinculosQ.refetch(); void dadosQ.refetch(); }} />
        )}

        {/* Sem nenhuma Página, o gerenciador é a própria tela — não faz sentido
            mostrar abas vazias antes de existir o que olhar. */}
        {!ativo && !vinculosQ.isLoading && aba !== "paginas" && (
          <GerenciarVinculos aoMudar={() => void vinculosQ.refetch()} />
        )}

        {ativo && aba !== "paginas" && dadosQ.isLoading && (
          <div className="py-16 flex items-center justify-center text-sm text-muted-foreground gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Lendo o que já foi coletado…
          </div>
        )}

        {ativo && d && aba !== "paginas" && (
          <>
            {aba === "geral" && <AbaGeral d={d} capacidades={capacidades} status={status} />}
            {aba === "banco" && <AbaBanco d={d} capacidades={capacidades} />}
            {aba === "identidade" && <AbaIdentidade d={d} papeis={papeis} status={status} />}
            {aba === "evolucao" && <AbaEvolucao d={d} />}
            {aba === "visualizacoes" && <AbaVisualizacoes d={d} />}
            {aba === "segmentacoes" && <AbaSegmentacoes d={d} />}
            {aba === "publicacoes" && (
              <AbaPublicacoes posts={d.posts} aoAbrir={setPostAberto} />
            )}
            {aba === "cobertura" && <AbaCobertura d={d} capacidades={capacidades} />}
            {aba === "consumo" && <AbaConsumo d={d} totalDePaginas={vinculos.length} />}
            {aba === "cru" && <AbaCru d={d} />}
          </>
        )}
      </div>

      {postAberto && d && (
        <PainelDaPublicacao
          post={d.posts.find((p) => p.postUrn === postAberto)!}
          aoFechar={() => setPostAberto(null)}
        />
      )}
    </MetaDashboardLayout>
  );
}

/* ── Cabeçalho ─────────────────────────────────────────────────────────── */

function Cabecalho({
  vinculos, ativo, aoTrocar, dias, aoTrocarPeriodo, status, papeis, carregando, onSincronizado,
}: {
  vinculos: Array<{
    id: number; nome: string | null; vanityName: string | null;
    organizationId: string; organizationUrn: string; capacidade: string;
  }>;
  ativo: number | null;
  aoTrocar: (id: number) => void;
  dias: number;
  aoTrocarPeriodo: (d: number) => void;
  status: StatusDoVinculo;
  papeis: Array<{ papel: string; estado: string }>;
  carregando: boolean;
  onSincronizado: () => void;
}) {
  const vivos = cargosVivos(papeis);
  const principal = cargoPrincipal(papeis);
  const escolhida = vinculos.find((v) => v.id === ativo) ?? null;

  return (
    <header className="border-b border-border bg-card/40">
      <div className="max-w-[1400px] mx-auto px-4 md:px-6 pt-6 pb-4 flex flex-col gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-base font-bold tracking-tight flex items-center gap-2">
            <Layers className="w-4 h-4 text-primary" />
            LinkedIn Lab
          </h1>
          {/* O rótulo é regra, não decoração: sem ele, daqui a três meses
              alguém trata a bancada como se fosse o produto. */}
          <span className="text-[10px] font-mono uppercase tracking-[0.12em] px-2 py-0.5 rounded border border-primary/50 text-primary">
            interno · experimental
          </span>
          <span className="text-[11px] text-muted-foreground">
            não é a interface final da aba Social
          </span>
        </div>

        <div className="flex items-end gap-3 flex-wrap">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">Página</span>
            <select
              className="h-8 min-w-[220px] rounded border border-border bg-background px-2 text-[13px]"
              value={ativo ?? ""}
              onChange={(e) => aoTrocar(Number(e.target.value))}
              disabled={carregando || !vinculos.length}
            >
              {!vinculos.length && <option value="">nenhuma Página vinculada</option>}
              {vinculos.map((v) => (
                <option key={v.id} value={v.id}>{rotuloDaPagina(v)}</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">Período</span>
            <select
              className="h-8 rounded border border-border bg-background px-2 text-[13px]"
              value={dias}
              onChange={(e) => aoTrocarPeriodo(Number(e.target.value))}
            >
              {[7, 30, 90, 180, 395].map((n) => (
                <option key={n} value={n}>{n} dias</option>
              ))}
            </select>
          </label>

          {/* O URN fica logo abaixo do nome: técnico e importante, mas
              secundário — a pessoa escolhe pelo nome e confere pelo URN. */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">Identificação</span>
            <div className="h-8 flex flex-col justify-center leading-tight">
              <span className="text-[11px] font-mono text-muted-foreground break-all">
                {escolhida?.organizationUrn ?? "—"}
              </span>
              {escolhida?.vanityName && (
                <span className="text-[10px] text-muted-foreground/70">/{escolhida.vanityName}</span>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">Conexão</span>
            <div className="h-8 flex items-center gap-2 text-[13px]">
              <span className={`font-semibold ${TOM_VINCULO[status]}`}>
                {ROTULO_VINCULO[status]}
              </span>
              {principal && (
                <span className="text-muted-foreground text-[12px]">
                  · {principal}
                  {vivos.length > 1 && ` +${vivos.length - 1}`}
                </span>
              )}
            </div>
          </div>

          <div className="ml-auto">
            {ativo && <BotoesDeColeta pageId={ativo} onPronto={onSincronizado} />}
          </div>
        </div>
      </div>
    </header>
  );
}

/**
 * Os dois únicos botões que gastam cota — e os dois dizem o preço antes.
 *
 * O orçamento vem de função pura sobre o que já está no banco. Numa cota que
 * não conseguimos observar, um clique sem preço é um clique no escuro.
 */
function BotoesDeColeta({ pageId, onPronto }: { pageId: number; onPronto: () => void }) {
  const [progresso, setProgresso] = useState<string[] | null>(null);
  const orcInc = trpc.social.linkedinLab.orcamento.useQuery(
    { pageId, modo: "incremental" }, { refetchOnWindowFocus: false });
  const orcCarga = trpc.social.linkedinLab.orcamento.useQuery(
    { pageId, modo: "carga" }, { refetchOnWindowFocus: false });

  const sinc = trpc.social.linkedinLab.sincronizar.useMutation({
    onSuccess: (r) => {
      setProgresso(r.passos.map((p) => `${p.estado === "ok" ? "✓" : p.estado === "vazio" ? "·" : "✕"} ${p.passo} — ${p.detalhe} (${p.chamadas})`));
      toast.success(
        `${r.chamadas} chamadas realizadas · ${r.registros} registros · ${r.chamadasComErro} falha(s)`,
        { description: `estimadas ${r.chamadasEstimadas} · ${(r.duracaoMs / 1000).toFixed(1)}s` },
      );
      onPronto();
    },
    onError: (e) => toast.error("A sincronização falhou.", { description: e.message }),
  });

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex gap-2">
        <Button size="sm" variant="outline" className="h-8 text-[12px]"
          disabled={sinc.isPending}
          onClick={() => sinc.mutate({ pageId, modo: "carga" })}>
          {sinc.isPending && sinc.variables?.modo === "carga"
            ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            : <Download className="w-3.5 h-3.5 mr-1.5" />}
          Carga histórica
          {orcCarga.data && <span className="ml-1.5 text-muted-foreground">~{orcCarga.data.chamadasEstimadas}</span>}
        </Button>
        <Button size="sm" className="h-8 text-[12px]"
          disabled={sinc.isPending}
          onClick={() => sinc.mutate({ pageId, modo: "incremental" })}>
          {sinc.isPending && sinc.variables?.modo === "incremental"
            ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
          Sincronizar agora
          {orcInc.data && <span className="ml-1.5 opacity-70">~{orcInc.data.chamadasEstimadas}</span>}
        </Button>
      </div>
      <span className="text-[10px] text-muted-foreground/70">
        estimativa de chamadas · nenhuma outra ação desta página consulta a API
      </span>
      {progresso && (
        <div className="w-full max-w-[520px] text-[10.5px] font-mono bg-muted/50 rounded p-2 max-h-[180px] overflow-auto">
          {progresso.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      )}
    </div>
  );
}

/* ── Vincular ──────────────────────────────────────────────────────────── */

/**
 * Gerenciar as Páginas vinculadas — vincular, trocar de cliente, desvincular.
 *
 * Desvincular NÃO apaga: marca `ativo=false`. O que já foi coletado é o
 * registro de que a API entregava aquilo naquele dia, e jogar isso fora para
 * corrigir um vínculo errado seria perder a medição junto com o engano. Uma
 * Página desvinculada volta pelo mesmo botão que a vinculou.
 */
function GerenciarVinculos({ aoMudar }: { aoMudar: () => void }) {
  const [paginas, setPaginas] = useState<Array<{
    id: string; urn: string; nome: string | null; vanity: string | null;
    papeis: Array<{ papel: string; estado: string }>;
  }> | null>(null);
  const [semNome, setSemNome] = useState(0);
  const [cliente, setCliente] = useState<number | null>(null);

  const clientesQ = trpc.accounts.list.useQuery(undefined, { refetchOnWindowFocus: false });
  const todosQ = trpc.social.linkedinLab.todosOsVinculos.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const nomeDoCliente = (id: number) => {
    const c = (clientesQ.data ?? []).find((x) => x.id === id);
    return c?.accountName ?? c?.accountId ?? `conta ${id}`;
  };

  const pronto = () => { void todosQ.refetch(); aoMudar(); };

  const descobrir = trpc.social.linkedinLab.descobrir.useMutation({
    onSuccess: (r) => {
      setPaginas(r.paginas);
      setSemNome(r.semNome);
      toast.success(`${r.paginas.length} Página(s) na carteira`, {
        description: `${r.chamadas} chamadas`
          + (r.semNome ? ` · ${r.semNome} sem nome (o LinkedIn recusou a identidade)` : ""),
      });
    },
    onError: (e) => toast.error("Não foi possível ler a carteira.", { description: e.message }),
  });
  const vincular = trpc.social.linkedinLab.vincular.useMutation({
    onSuccess: () => { toast.success("Página vinculada."); pronto(); },
    onError: (e) => toast.error("Falha ao vincular.", { description: e.message }),
  });
  const desvincular = trpc.social.linkedinLab.desvincular.useMutation({
    onSuccess: () => { toast.success("Página desvinculada. O que foi coletado continua no banco."); pronto(); },
    onError: (e) => toast.error("Falha ao desvincular.", { description: e.message }),
  });
  const trocar = trpc.social.linkedinLab.trocarCliente.useMutation({
    onSuccess: () => { toast.success("Cliente trocado. A série e as publicações continuam de pé."); pronto(); },
    onError: (e) => toast.error("Falha ao trocar o cliente.", { description: e.message }),
  });

  const vinculadas = todosQ.data ?? [];
  const jaVinculada = (orgId: string) =>
    vinculadas.find((v) => v.organizationId === orgId && v.ativo) ?? null;

  return (
    <div className="flex flex-col gap-4">
      {/* ── O que já está vinculado ─────────────────────────────────────── */}
      <Bloco titulo="Páginas vinculadas"
        nota={`${vinculadas.filter((v) => v.ativo).length} ativa(s)`}>
        {!vinculadas.length ? (
          <p className="text-[12.5px] text-muted-foreground">
            Nenhuma Página vinculada ainda. Leia a carteira abaixo para escolher.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px] min-w-[720px]">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
                  <th className="text-left py-2 pr-3">Página</th>
                  <th className="text-left py-2 pr-3">ID / URN</th>
                  <th className="text-left py-2 pr-3">Cliente</th>
                  <th className="text-left py-2 pr-3">Estado</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {vinculadas.map((v) => (
                  <tr key={v.id} className={`border-t border-border/60 ${v.ativo ? "" : "opacity-55"}`}>
                    <td className="py-2 pr-3">
                      <div className="flex flex-col leading-tight">
                        <span className={`font-medium ${v.nome ? "" : "text-muted-foreground italic"}`}>
                          {v.nome ?? "Nome não disponível"}
                        </span>
                        {v.vanityName && (
                          <span className="text-[10.5px] text-muted-foreground/70">/{v.vanityName}</span>
                        )}
                      </div>
                    </td>
                    <td className="py-2 pr-3">
                      <div className="flex flex-col leading-tight font-mono text-[11px] text-muted-foreground">
                        <span>{v.organizationId}</span>
                        <span className="text-[10px] text-muted-foreground/60 break-all">{v.organizationUrn}</span>
                      </div>
                    </td>
                    <td className="py-2 pr-3">
                      {/* Trocar o cliente sem perder o coletado: a identidade é
                          o URN, e ela não muda aqui. */}
                      <select
                        className="h-7 rounded border border-border bg-background px-2 text-[12px] max-w-[190px]"
                        value={v.accountId}
                        disabled={trocar.isPending}
                        onChange={(e) => trocar.mutate({ pageId: v.id, accountId: Number(e.target.value) })}
                      >
                        {(clientesQ.data ?? []).map((c) => (
                          <option key={c.id} value={c.id}>{c.accountName ?? c.accountId}</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 pr-3">
                      {v.ativo
                        ? <Selo estado={v.capacidade === "completo" ? "ok"
                            : v.capacidade === "parcial" ? "sem_permissao"
                            : v.capacidade === "sem_acesso" ? "erro" : "nao_coletado"}>
                            {ROTULO_VINCULO[(v.capacidade ?? "nao_vinculada") as StatusDoVinculo]}
                          </Selo>
                        : <Selo estado="nao_coletado">desvinculada</Selo>}
                    </td>
                    <td className="py-2 text-right">
                      {v.ativo ? (
                        <Button size="sm" variant="outline" className="h-7 text-[11px]"
                          disabled={desvincular.isPending}
                          onClick={() => desvincular.mutate({ pageId: v.id })}>
                          <Unlink className="w-3 h-3 mr-1" /> Desvincular
                        </Button>
                      ) : (
                        <Button size="sm" variant="ghost" className="h-7 text-[11px]"
                          disabled={vincular.isPending}
                          onClick={() => vincular.mutate({
                            accountId: v.accountId, organizationId: v.organizationId,
                            organizationUrn: v.organizationUrn, nome: v.nome,
                            vanityName: v.vanityName,
                            papeis: (v.papeisJson ?? []) as Array<{ papel: string; estado: string }>,
                          })}>
                          <Link2 className="w-3 h-3 mr-1" /> Revincular
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Bloco>

      {/* ── Vincular uma nova ───────────────────────────────────────────── */}
      <Bloco titulo="Vincular uma Página"
        nota="cliente → Página → URN. A identidade é o URN, nunca o nome.">
        <div className="flex items-end gap-3 flex-wrap">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">Cliente</span>
            <select className="h-8 min-w-[220px] rounded border border-border bg-background px-2 text-[13px]"
              value={cliente ?? ""} onChange={(e) => setCliente(Number(e.target.value))}>
              <option value="">selecione…</option>
              {(clientesQ.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>{c.accountName ?? c.accountId}</option>
              ))}
            </select>
          </label>
          <Button size="sm" className="h-8 text-[12px]" disabled={descobrir.isPending}
            onClick={() => descobrir.mutate()}>
            {descobrir.isPending
              ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              : <Search className="w-3.5 h-3.5 mr-1.5" />}
            Ler carteira do LinkedIn
            <span className="ml-1.5 opacity-70" title="2 chamadas de ACL + 1 por Página que vier sem nome">
              ~2+
            </span>
          </Button>
        </div>

        {paginas && semNome > 0 && (
          <p className="text-[12px] text-muted-foreground flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 text-amber-600 flex-shrink-0" />
            <span>
              {semNome} Página(s) sem nome. A ACL devolve a identidade só quando o
              LinkedIn deixa ler a organização — nas Páginas que ele recusa, vem
              <code className="mx-1 px-1 rounded bg-muted font-mono text-[11px]">organizationalTarget!</code>
              e <code className="mx-1 px-1 rounded bg-muted font-mono text-[11px]">/rest/organizations</code>
              responde 403. O Spaces não substitui isso pelo nome do cliente.
            </span>
          </p>
        )}

        {paginas && (
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px] min-w-[640px]">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
                  <th className="text-left py-2 pr-3">Página</th>
                  <th className="text-left py-2 pr-3">ID / URN</th>
                  <th className="text-left py-2 pr-3">Cargos</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {paginas.map((p) => {
                  const vivo = p.papeis.some((x) => x.estado === "APPROVED");
                  const ja = jaVinculada(p.id);
                  return (
                    <tr key={p.id} className="border-t border-border/60">
                      <td className="py-2 pr-3">
                        <div className="flex flex-col leading-tight min-w-0">
                          <span className={`font-medium ${p.nome ? "" : "text-muted-foreground italic"}`}>
                            {p.nome ?? "Nome não disponível"}
                          </span>
                          {p.vanity && (
                            <span className="text-[10.5px] text-muted-foreground/70">/{p.vanity}</span>
                          )}
                          {!p.nome && (
                            <span className="text-[10px] text-muted-foreground/60">
                              o LinkedIn recusou a identidade desta organização
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2 pr-3">
                        <div className="flex flex-col leading-tight font-mono text-[11px] text-muted-foreground">
                          <span>{p.id}</span>
                          <span className="text-[10px] text-muted-foreground/60 break-all">{p.urn}</span>
                        </div>
                      </td>
                      <td className="py-2 pr-3">
                        <div className="flex gap-1 flex-wrap">
                          {p.papeis.map((x) => (
                            <Selo key={x.papel} estado={x.estado === "APPROVED" ? "ok" : "sem_permissao"}
                              titulo={`state=${x.estado}`}>
                              {x.papel.replace(/_/g, " ").toLowerCase()}
                            </Selo>
                          ))}
                        </div>
                      </td>
                      <td className="py-2 text-right whitespace-nowrap">
                        {ja ? (
                          <span className="text-[11px] text-muted-foreground">
                            já vinculada a {nomeDoCliente(ja.accountId)}
                          </span>
                        ) : (
                          <Button size="sm" variant={vivo ? "default" : "outline"}
                            className="h-7 text-[11px]"
                            disabled={!cliente || vincular.isPending}
                            title={vivo ? undefined
                              : "Todas as atribuições estão REVOGADAS — esta Página responde 403 em tudo"}
                            onClick={() => cliente && vincular.mutate({
                              accountId: cliente, organizationId: p.id, organizationUrn: p.urn,
                              nome: p.nome, vanityName: p.vanity, papeis: p.papeis,
                            })}>
                            <Link2 className="w-3 h-3 mr-1" />
                            {vivo ? "Vincular" : "Vincular mesmo assim"}
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Bloco>
    </div>
  );
}

/* ═══ 1. Visão geral ═══════════════════════════════════════════════════════ */

type Dados = inferRouterOutputs<AppRouter>["social"]["linkedinLab"]["pagina"];

/** O KPI com evolução — e a evolução só aparece quando HÁ com o que comparar. */
function Kpi({ rotulo, valor, motivo, nota, variacao, sufixo }: {
  rotulo: string; valor: number | string | null | undefined;
  motivo?: string | null; nota?: string; variacao?: number | null; sufixo?: string;
}) {
  return (
    <div className="rounded border border-border/70 bg-card px-3 py-2.5 flex flex-col gap-0.5 min-w-0">
      <span className="text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground/70">{rotulo}</span>
      <span className="text-lg font-semibold leading-tight">
        <Numero valor={valor} motivo={motivo} sufixo={sufixo} />
      </span>
      <span className="text-[10px] text-muted-foreground/70 flex items-center gap-1.5 min-h-[14px]">
        {variacao !== null && variacao !== undefined && (
          <span className={variacao > 0 ? "text-emerald-600 dark:text-emerald-500"
            : variacao < 0 ? "text-destructive" : "text-muted-foreground"}>
            {variacao > 0 ? "+" : ""}{fmt(variacao)}
          </span>
        )}
        {nota}
      </span>
    </div>
  );
}

function AbaGeral({ d, capacidades, status }: {
  d: Dados; capacidades: MapaDeCapacidades; status: StatusDoVinculo;
}) {
  const serie = d.serie;
  const comSeguidores = serie.filter((s) => s.seguidoresTotal !== null);
  const ultimo = comSeguidores[comSeguidores.length - 1] ?? null;
  const penultimo = comSeguidores[comSeguidores.length - 2] ?? null;
  const ganho = serie.reduce<number | null>((t, s) =>
    s.ganhoOrganico === null ? t : (t ?? 0) + s.ganhoOrganico, null);
  const views = serie.reduce<number | null>((t, s) => {
    const v = (s.viewsJson as Record<string, number> | null)?.["views.allPageViews.pageViews"];
    return typeof v === "number" ? (t ?? 0) + v : t;
  }, null);
  const ultimaExec = d.execucoes[0] ?? null;
  const cob = d.cobertura;

  return (
    <div className="flex flex-col gap-4">
      <Bloco titulo="Visão geral da Página"
        nota={`${d.pagina?.organizationUrn ?? ""}`}>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
          <Kpi rotulo="Seguidores" valor={ultimo?.seguidoresTotal ?? null}
            motivo={capacidades.seguidores_atuais?.motivo}
            variacao={ultimo && penultimo && ultimo.seguidoresTotal !== null && penultimo.seguidoresTotal !== null
              ? ultimo.seguidoresTotal - penultimo.seguidoresTotal : null}
            nota={ultimo ? `em ${dataBr(ultimo.dia)}` : "sem medição"} />
          <Kpi rotulo="Crescimento no período" valor={ganho}
            motivo={capacidades.seguidores_serie?.motivo}
            nota="soma do ganho orgânico" />
          <Kpi rotulo="Visualizações da Página" valor={views}
            motivo={capacidades.pagina_serie?.motivo}
            nota="allPageViews no período" />
          <Kpi rotulo="Publicações" valor={cob?.publicacoes ?? null}
            nota={cob?.publicacaoMaisAntiga ? `desde ${dataBr(cob.publicacaoMaisAntiga)}` : "nenhuma encontrada"} />
          <Kpi rotulo="Com métricas" valor={cob?.publicacoesComMetrica ?? null}
            nota={cob?.publicacoes ? `de ${cob.publicacoes}` : undefined} />
          <Kpi rotulo="Dias com dado" valor={cob?.diasComDado ?? null}
            nota={cob?.primeiroDia ? `${dataBr(cob.primeiroDia)} → ${dataBr(cob.ultimoDia)}` : "nenhum"} />
          <Kpi rotulo="Última coleta"
            valor={d.pagina?.ultimaColetaEm ? dataBr(d.pagina.ultimaColetaEm) : null}
            nota={ultimaExec ? `${ultimaExec.escopo}` : "nunca"} />
          <Kpi rotulo="Chamadas na última" valor={ultimaExec?.chamadas ?? null}
            nota={ultimaExec?.chamadasEstimadas ? `estimadas ${ultimaExec.chamadasEstimadas}` : undefined} />
          <Kpi rotulo="Carga histórica"
            valor={d.pagina?.cargaInicialChamadas ?? null}
            nota={d.pagina?.cargaInicialEm ? `em ${dataBr(d.pagina.cargaInicialEm)}` : "ainda não feita"}
            sufixo="chamadas" />
          <Kpi rotulo="Status" valor={ROTULO_VINCULO[status]}
            nota={d.pagina?.ultimoErro ?? undefined} />
        </div>
      </Bloco>

    </div>
  );
}

/* ═══ 2. Evolução ═════════════════════════════════════════════════════════ */

type Serie = Dados["serie"];

/**
 * Um gráfico, um seletor agrupado, e um vazio que explica.
 *
 * Os ~30 recortes de visualização entram TODOS — inclusive os que talvez
 * ninguém use. Escolher aqui os "importantes" seria decidir antes de observar,
 * que é justamente o que este laboratório existe para evitar.
 *
 * E quando não há dois pontos, a tela diz quantos existem e por quê, em vez de
 * mostrar uma moldura em branco: numa Página só com sincronizações
 * incrementais, três dias de série é o esperado, não um defeito.
 */
interface Metrica { id: string; nome: string; unidade: string; cor: string }

function AbaEvolucao({ d }: { d: Dados }) {
  const serie = d.serie;

  /** As métricas que EXISTEM nos dados — nenhuma inventada, nenhuma escondida. */
  const grupos = useMemo((): Array<{ grupo: string; metricas: Metrica[] }> => {
    const recortes = new Set<string>();
    for (const x of serie) {
      for (const k of Object.keys((x.viewsJson ?? {}) as Record<string, number>)) recortes.add(k);
    }
    const seguidores: Metrica[] = [
      { id: "seguidoresTotal", nome: "Total de seguidores", unidade: "seguidores", cor: COR.seguidores },
      { id: "ganhoOrganico", nome: "Ganho orgânico", unidade: "novos seguidores", cor: COR.entrada },
      { id: "ganhoPago", nome: "Ganho pago", unidade: "novos seguidores", cor: COR.ativacoes },
    ];
    const views: Metrica[] = Array.from(recortes).sort().map((k) => ({
      id: `views:${k}`,
      nome: k.replace(/^views\./, ""),
      unidade: k.includes("unique") ? "visualizações únicas" : "visualizações",
      cor: COR.visitas,
    }));
    return [
      { grupo: "Seguidores", metricas: seguidores },
      { grupo: `Visualizações da Página (${views.length})`, metricas: views },
    ].filter((g) => g.metricas.length);
  }, [serie]);

  const todas = useMemo(() => grupos.flatMap((g) => g.metricas), [grupos]);
  const [metrica, setMetrica] = useState("seguidoresTotal");
  const [ativo, setAtivo] = useState<number | null>(null);
  const m = todas.find((x) => x.id === metrica) ?? todas[0];

  const valorDe = (x: Serie[number], id: string): number | null => {
    if (id.startsWith("views:")) {
      const v = ((x.viewsJson ?? {}) as Record<string, number>)[id.slice(6)];
      return typeof v === "number" ? v : null;
    }
    const v = x[id as "seguidoresTotal" | "ganhoOrganico" | "ganhoPago"];
    return typeof v === "number" ? v : null;
  };

  const pontos: PontoHistorico[] = useMemo(() => {
    if (!m) return [];
    const saida: PontoHistorico[] = [];
    let anterior: string | null = null;
    for (const x of serie) {
      const v = valorDe(x, m.id);
      if (v === null) continue;
      saida.push({ dia: x.dia, valor: v, vao: !!anterior && diasEntre(anterior, x.dia) > 1 });
      anterior = x.dia;
    }
    return saida;
  }, [serie, m]);

  /** Quantos dias têm ESTA métrica, e quantos existem no período. */
  const semEsta = serie.length - pontos.length;
  const b = d.banco;
  const fezCarga = (b?.execucoes.cargas ?? 0) > 0;

  return (
    <div className="flex flex-col gap-4">
      <Bloco titulo="Evolução"
        nota={m ? `${m.nome} · em ${m.unidade}` : undefined}
        acao={
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {ativo !== null && pontos[ativo] && m && (
              <LeituraDoPonto dia={pontos[ativo].dia}
                valores={[{ valor: fmt(pontos[ativo].valor), rotulo: m.unidade, cor: m.cor }]} />
            )}
            <select className="h-7 rounded border border-border bg-background px-2 text-[12px] max-w-[320px]"
              value={metrica} onChange={(e) => { setMetrica(e.target.value); setAtivo(null); }}>
              {grupos.map((g) => (
                <optgroup key={g.grupo} label={g.grupo}>
                  {g.metricas.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
                </optgroup>
              ))}
            </select>
          </div>
        }>
        {/* A linha que responde "posso confiar nesta curva?" antes de olhá-la. */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[11.5px] text-muted-foreground">
          <span><strong className="text-foreground tabular-nums">{pontos.length}</strong> ponto(s) medido(s)</span>
          <span><strong className="text-foreground tabular-nums">{serie.length}</strong> dia(s) no período</span>
          {semEsta > 0 && <span>{semEsta} dia(s) sem esta métrica — não viram zero</span>}
          {pontos.length >= 2 && (
            <span>{dataBr(pontos[0].dia)} → {dataBr(pontos[pontos.length - 1].dia)}</span>
          )}
        </div>

        {pontos.length >= 2 ? (
          <div className="overflow-x-auto">
            <CurvaHistorica id={`lab-${m!.id}`} pontos={pontos} cor={m!.cor}
              altura={240} largura={Math.max(760, pontos.length * 9)}
              ativo={ativo} aoEntrar={setAtivo} />
          </div>
        ) : (
          <VazioExplicado
            titulo={pontos.length === 1
              ? "Um ponto só — não há série para desenhar"
              : "Nenhum ponto desta métrica"}
            porque={fezCarga
              ? "A carga histórica rodou, mas esta métrica não veio nos dias coletados. Confira o estado dela na aba Cobertura."
              : `Esta Página tem ${b?.execucoes.incrementais ?? 0} sincronização(ões) incremental(is) e nenhuma carga histórica. `
                + `O incremental grava ${SOBREPOSICAO_DIAS} dias de série por rodada — a curva de ${JANELA_HISTORICA_DIAS} dias vem da Carga histórica.`}
          />
        )}
      </Bloco>

      {/* A série inteira, número por número. É o que permite conferir a curva. */}
      <Bloco titulo="Série completa"
        nota={`${serie.length} dia(s) · ausência aparece como — e nunca como zero`}
        acao={
          <Button size="sm" variant="ghost" className="h-7 text-[11px]"
            onClick={() => baixarCsv("linkedin-serie", serie.map((x) => ({
              dia: x.dia, seguidores: x.seguidoresTotal,
              ganhoOrganico: x.ganhoOrganico, ganhoPago: x.ganhoPago,
              statusColeta: x.statusColeta, origem: x.origem,
              ...((x.viewsJson ?? {}) as Record<string, number>),
            })))}>
            <Download className="w-3 h-3 mr-1" /> CSV
          </Button>
        }>
        {serie.length ? (
          <div className="overflow-x-auto max-h-[420px]">
            <table className="w-full text-[12px] min-w-[560px]">
              <thead className="sticky top-0 bg-card">
                <tr className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
                  <th className="text-left py-2 pr-3">Dia</th>
                  <th className="text-right py-2 pr-3">Seguidores</th>
                  <th className="text-right py-2 pr-3">Orgânico</th>
                  <th className="text-right py-2 pr-3">Pago</th>
                  <th className="text-right py-2 pr-3">Recortes de view</th>
                  <th className="text-left py-2 pr-3">Origem</th>
                  <th className="text-left py-2">Coleta</th>
                </tr>
              </thead>
              <tbody>
                {[...serie].reverse().map((x) => {
                  const views = (x.viewsJson ?? {}) as Record<string, number>;
                  const ind = (x.indisponiveisJson ?? null) as Record<string, string> | null;
                  return (
                    <tr key={x.dia} className="border-t border-border/50">
                      <td className="py-1.5 pr-3 tabular-nums">{dataBr(x.dia)}</td>
                      <td className="py-1.5 pr-3 text-right">
                        <Numero valor={x.seguidoresTotal} motivo={ind?.seguidores_atuais} />
                      </td>
                      <td className="py-1.5 pr-3 text-right">
                        <Numero valor={x.ganhoOrganico} motivo={ind?.seguidores_serie} />
                      </td>
                      <td className="py-1.5 pr-3 text-right">
                        <Numero valor={x.ganhoPago} motivo={ind?.seguidores_serie} />
                      </td>
                      <td className="py-1.5 pr-3 text-right">
                        <Numero valor={Object.keys(views).length || null} motivo={ind?.pagina_serie} />
                      </td>
                      <td className="py-1.5 pr-3 text-muted-foreground">{x.origem ?? "—"}</td>
                      <td className="py-1.5">
                        <Selo estado={x.statusColeta === "ok" ? "ok" : "erro"}>{x.statusColeta}</Selo>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <VazioExplicado titulo="Nenhum dia coletado"
            porque="Nenhuma sincronização gravou série para esta Página no período selecionado." />
        )}
      </Bloco>
    </div>
  );
}

/* ═══ 3. Publicações ══════════════════════════════════════════════════════ */

type Publicacao = Dados["posts"][number];

/** A URL da imagem, se a resolução funcionou. Nunca inventada. */
function urlDaMidia(p: Publicacao): { url: string | null; motivo: string | null } {
  const midias = (p.midiasJson ?? []) as Array<{ urn: string; dados: unknown }>;
  for (const m of midias) {
    const d = m.dados as Record<string, unknown> | null;
    const u = d?.downloadUrl ?? d?.originalUrl ?? d?.url;
    if (typeof u === "string" && u.startsWith("http")) return { url: u, motivo: null };
  }
  if (!midias.length) return { url: null, motivo: null };
  return { url: null, motivo: p.midiaIndisponivel ?? "a API não devolveu URL para esta mídia" };
}

type Ordem = "recente" | "antiga" | "impressoes" | "cliques" | "reacoes" | "comentarios" | "compartilhamentos";

const ORDENS: Array<{ id: Ordem; nome: string }> = [
  { id: "recente", nome: "Mais recente" },
  { id: "antiga", nome: "Mais antiga" },
  { id: "impressoes", nome: "Mais impressões" },
  { id: "cliques", nome: "Mais cliques" },
  { id: "reacoes", nome: "Mais reações" },
  { id: "comentarios", nome: "Mais comentários" },
  { id: "compartilhamentos", nome: "Mais compartilhamentos" },
];

function AbaPublicacoes({ posts, aoAbrir }: {
  posts: Publicacao[]; aoAbrir: (urn: string) => void;
}) {
  const [ordem, setOrdem] = useState<Ordem>("recente");
  const [tipo, setTipo] = useState<"todos" | "ugcPost" | "share">("todos");
  const [metricas, setMetricas] = useState<"todas" | "com" | "sem">("todas");
  const [imagem, setImagem] = useState<"todas" | "com" | "sem">("todas");
  const [busca, setBusca] = useState("");

  const filtrados = useMemo(() => {
    const n = (p: Publicacao, campo: keyof NonNullable<Publicacao["metrica"]>) => {
      const v = p.metrica?.[campo];
      return typeof v === "number" ? v : -1;
    };
    const reacoes = (p: Publicacao) => {
      const r = (p.metrica?.reacoesPorTipoJson ?? null) as Record<string, number> | null;
      if (r) return Object.values(r).reduce((t, x) => t + x, 0);
      return n(p, "likes");
    };
    let lista = posts.filter((p) => {
      if (tipo !== "todos" && p.tipoUrn !== tipo) return false;
      if (metricas === "com" && !p.metrica) return false;
      if (metricas === "sem" && p.metrica) return false;
      const img = urlDaMidia(p);
      if (imagem === "com" && !img.url) return false;
      if (imagem === "sem" && img.url) return false;
      if (busca && !(p.commentary ?? "").toLowerCase().includes(busca.toLowerCase())
          && !p.postUrn.includes(busca)) return false;
      return true;
    });
    const t = (p: Publicacao) => (p.publicadoEm ? new Date(p.publicadoEm).getTime() : 0);
    lista = [...lista].sort((a, b) => {
      switch (ordem) {
        case "antiga": return t(a) - t(b);
        case "impressoes": return n(b, "impressions") - n(a, "impressions");
        case "cliques": return n(b, "clicks") - n(a, "clicks");
        case "reacoes": return reacoes(b) - reacoes(a);
        case "comentarios": return n(b, "comments") - n(a, "comments");
        case "compartilhamentos": return n(b, "shares") - n(a, "shares");
        default: return t(b) - t(a);
      }
    });
    return lista;
  }, [posts, ordem, tipo, metricas, imagem, busca]);

  return (
    <div className="flex flex-col gap-4">
      <Bloco titulo="Publicações"
        nota={`${filtrados.length} de ${posts.length}`}
        acao={
          <Button size="sm" variant="ghost" className="h-7 text-[11px]"
            onClick={() => baixarCsv("linkedin-publicacoes", filtrados.map((p) => ({
              urn: p.postUrn, tipo: p.tipoUrn, publicadoEm: p.publicadoEm,
              texto: p.commentary, impressoes: p.metrica?.impressions,
              impressoesUnicas: p.metrica?.uniqueImpressions, cliques: p.metrica?.clicks,
              curtidas: p.metrica?.likes, comentarios: p.metrica?.comments,
              compartilhamentos: p.metrica?.shares, engajamento: p.metrica?.engagement,
              reacoes: p.metrica?.reacoesPorTipoJson,
            })))}>
            <Download className="w-3 h-3 mr-1" /> CSV
          </Button>
        }>
        <div className="flex gap-2 flex-wrap items-end">
          <Filtro rotulo="Ordenar" valor={ordem} aoTrocar={(v) => setOrdem(v as Ordem)}
            opcoes={ORDENS.map((o) => [o.id, o.nome])} />
          <Filtro rotulo="Tipo" valor={tipo} aoTrocar={(v) => setTipo(v as typeof tipo)}
            opcoes={[["todos", "Todos"], ["ugcPost", "ugcPost"], ["share", "share"]]} />
          <Filtro rotulo="Métricas" valor={metricas} aoTrocar={(v) => setMetricas(v as typeof metricas)}
            opcoes={[["todas", "Todas"], ["com", "Com métricas"], ["sem", "Sem métricas"]]} />
          <Filtro rotulo="Imagem" valor={imagem} aoTrocar={(v) => setImagem(v as typeof imagem)}
            opcoes={[["todas", "Todas"], ["com", "Com imagem"], ["sem", "Sem imagem"]]} />
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">Buscar</span>
            <input className="h-7 rounded border border-border bg-background px-2 text-[12px] min-w-[180px]"
              value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="texto ou URN" />
          </label>
        </div>
      </Bloco>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {filtrados.map((p) => <CartaoDePublicacao key={p.postUrn} p={p} aoAbrir={aoAbrir} />)}
      </div>

      {!filtrados.length && (
        <div className="py-12 text-center text-sm text-muted-foreground">
          Nenhuma publicação com esses filtros.
        </div>
      )}
    </div>
  );
}

function Filtro({ rotulo, valor, aoTrocar, opcoes }: {
  rotulo: string; valor: string; aoTrocar: (v: string) => void; opcoes: Array<[string, string]>;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">{rotulo}</span>
      <select className="h-7 rounded border border-border bg-background px-2 text-[12px]"
        value={valor} onChange={(e) => aoTrocar(e.target.value)}>
        {opcoes.map(([v, n]) => <option key={v} value={v}>{n}</option>)}
      </select>
    </label>
  );
}

function CartaoDePublicacao({ p, aoAbrir }: { p: Publicacao; aoAbrir: (urn: string) => void }) {
  const img = urlDaMidia(p);
  const m = p.metrica;
  const reacoes = (m?.reacoesPorTipoJson ?? null) as Record<string, number> | null;

  return (
    <Card className="p-0 overflow-hidden flex flex-col cursor-pointer hover:border-primary/50 transition-colors"
      onClick={() => aoAbrir(p.postUrn)}
      role="button" tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter") aoAbrir(p.postUrn); }}>
      <div className="h-[150px] bg-muted/50 flex items-center justify-center overflow-hidden border-b border-border/60">
        {img.url ? (
          <img src={img.url} alt="" className="w-full h-full object-cover" loading="lazy" />
        ) : (
          // Ausência NUNCA é silenciosa: a caixa diz que não houve imagem, e o
          // motivo técnico fica no hover.
          <div className="flex flex-col items-center gap-1 text-muted-foreground/60" title={img.motivo ?? undefined}>
            <ImgIcon className="w-5 h-5" />
            <span className="text-[10.5px]">
              {img.motivo ? "Imagem indisponível" : "Sem mídia nesta publicação"}
            </span>
          </div>
        )}
      </div>

      <div className="p-3 flex flex-col gap-2 flex-1 min-w-0">
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <span className="tabular-nums">{dataBr(p.publicadoEm)}</span>
          <span className="font-mono px-1 rounded bg-muted">{p.tipoUrn}</span>
          {!m && <Selo estado="nao_coletado">sem métricas</Selo>}
        </div>

        <p className="text-[12px] leading-snug line-clamp-3 min-h-[3.2em]">
          {p.commentary || <span className="text-muted-foreground/60">sem texto</span>}
        </p>

        <div className="grid grid-cols-3 gap-x-2 gap-y-1 text-[11px] mt-auto pt-2 border-t border-border/50">
          <Mini rotulo="impressões" valor={m?.impressions} motivo={indisp(m, "metricas")} />
          <Mini rotulo="únicas" valor={m?.uniqueImpressions} motivo={indisp(m, "metricas")} />
          <Mini rotulo="cliques" valor={m?.clicks} motivo={indisp(m, "metricas")} />
          <Mini rotulo="reações" valor={reacoes ? Object.values(reacoes).reduce((t, x) => t + x, 0) : m?.likes} />
          <Mini rotulo="comentários" valor={m?.comments} />
          <Mini rotulo="compart." valor={m?.shares} />
        </div>

        {m?.engagement !== null && m?.engagement !== undefined && (
          <div className="text-[10.5px] text-muted-foreground">
            engajamento <span className="tabular-nums text-foreground">{pct(Number(m.engagement))}</span>
          </div>
        )}
      </div>
    </Card>
  );
}

const indisp = (m: Publicacao["metrica"], chave: string): string | null => {
  const i = (m?.indisponiveisJson ?? null) as Record<string, string> | null;
  return i?.[chave] ?? null;
};

function Mini({ rotulo, valor, motivo }: {
  rotulo: string; valor: number | null | undefined; motivo?: string | null;
}) {
  return (
    <div className="flex flex-col leading-tight min-w-0">
      <span className="font-semibold"><Numero valor={valor} motivo={motivo} /></span>
      <span className="text-[9.5px] text-muted-foreground/70 truncate">{rotulo}</span>
    </div>
  );
}

/* ═══ 4. Uma publicação, campo por campo ══════════════════════════════════ */

function PainelDaPublicacao({ post, aoFechar }: { post: Publicacao; aoFechar: () => void }) {
  const img = urlDaMidia(post);
  const m = post.metrica;
  const reacoes = (m?.reacoesPorTipoJson ?? null) as Record<string, number> | null;
  const acoes = (m?.socialActionsJson ?? null) as Record<string, unknown> | null;
  const totalReacoes = reacoes ? Object.values(reacoes).reduce((t, x) => t + x, 0) : null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-4 overflow-auto"
      onClick={aoFechar}>
      <Card className="max-w-3xl w-full my-8 p-0 overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 p-4 border-b border-border">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold">Publicação</h3>
            <p className="text-[11px] font-mono text-muted-foreground break-all">{post.postUrn}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {post.permalink && (
              <a href={post.permalink} target="_blank" rel="noreferrer"
                className="text-[11px] text-primary flex items-center gap-1 hover:underline">
                abrir <ExternalLink className="w-3 h-3" />
              </a>
            )}
            <button type="button" onClick={aoFechar} aria-label="Fechar"
              className="p-1 rounded hover:bg-muted"><X className="w-4 h-4" /></button>
          </div>
        </div>

        <div className="p-4 flex flex-col gap-4 max-h-[75vh] overflow-auto">
          <Categoria titulo="Identificação">
            <Campo k="URN" v={post.postUrn} />
            <Campo k="Tipo de URN" v={post.tipoUrn} />
            <Campo k="Publicado em" v={dataBr(post.publicadoEm)} />
            <Campo k="Editado em" v={dataBr(post.editadoEm)} />
            <Campo k="Permalink" v={post.permalink} />
          </Categoria>

          <Categoria titulo="Conteúdo">
            <div className="col-span-full text-[12.5px] whitespace-pre-wrap leading-relaxed">
              {post.commentary || <span className="text-muted-foreground/60">sem texto</span>}
            </div>
          </Categoria>

          <Categoria titulo="Mídia">
            {img.url ? (
              <img src={img.url} alt="" className="col-span-full max-h-[320px] object-contain rounded border border-border" />
            ) : (
              <div className="col-span-full text-[12px] text-muted-foreground flex items-center gap-2">
                <AlertTriangle className="w-3.5 h-3.5" />
                {img.motivo
                  ? <>Imagem indisponível — <span className="font-mono text-[11px]">{img.motivo}</span></>
                  : "Esta publicação não tem mídia."}
              </div>
            )}
            <Campo k="URNs de mídia"
              v={((post.midiasJson ?? []) as Array<{ urn: string }>).map((x) => x.urn).join(", ") || null} />
          </Categoria>

          <Categoria titulo="Performance">
            <Campo k="Impressões" v={m?.impressions} motivo={indisp(m, "metricas")} />
            <Campo k="Impressões únicas" v={m?.uniqueImpressions} motivo={indisp(m, "metricas")} />
            <Campo k="Cliques" v={m?.clicks} motivo={indisp(m, "metricas")} />
            <Campo k="Engajamento" v={m?.engagement !== null && m?.engagement !== undefined ? pct(Number(m.engagement)) : null} />
            <Campo k="Medido em" v={m?.dia ? dataBr(m.dia) : null} />
            <Campo k="Status da coleta" v={m?.statusColeta ?? null} />
          </Categoria>

          <Categoria titulo="Reações">
            <Campo k="Total" v={totalReacoes} />
            {reacoes
              ? Object.entries(reacoes).sort((a, b) => b[1] - a[1]).map(([tipo, n]) => (
                  <Campo key={tipo}
                    k={tipo.replace(/\.count$/, "")}
                    v={`${fmt(n)}${totalReacoes ? ` · ${((n / totalReacoes) * 100).toFixed(1)}%` : ""}`} />
                ))
              : <Campo k="Por tipo" v={null} motivo="reações por tipo não foram coletadas para esta publicação" />}
            <Campo k="Curtidas (agregado)" v={m?.likes} />
          </Categoria>

          <Categoria titulo="Comentários">
            <Campo k="Quantidade" v={m?.comments} />
            <Campo k="commentsSummary"
              v={acoes?.commentsSummary ? JSON.stringify(acoes.commentsSummary) : null}
              motivo={acoes ? null : "socialActions não foi coletado para esta publicação"} />
          </Categoria>

          <Categoria titulo="Compartilhamentos">
            <Campo k="Quantidade" v={m?.shares} />
          </Categoria>

          <Categoria titulo="Metadados">
            <Campo k="lifecycleState" v={post.lifecycleState} />
            <Campo k="visibility" v={post.visibility} />
            <Campo k="Visto em" v={dataBr(post.vistoEm)} />
            <Campo k="Atualizado em" v={dataBr(post.atualizadoEm)} />
          </Categoria>

          <Categoria titulo="Histórico de métricas">
            <div className="col-span-full overflow-x-auto">
              {post.historico.length ? (
                <table className="w-full text-[11.5px] min-w-[520px]">
                  <thead>
                    <tr className="text-[9.5px] uppercase tracking-wider text-muted-foreground/70">
                      <th className="text-left py-1 pr-3">Dia</th>
                      <th className="text-right py-1 pr-3">Impressões</th>
                      <th className="text-right py-1 pr-3">Únicas</th>
                      <th className="text-right py-1 pr-3">Cliques</th>
                      <th className="text-right py-1 pr-3">Curtidas</th>
                      <th className="text-right py-1">Comentários</th>
                    </tr>
                  </thead>
                  <tbody>
                    {post.historico.map((h) => (
                      <tr key={h.dia} className="border-t border-border/50">
                        <td className="py-1 pr-3 tabular-nums">{dataBr(h.dia)}</td>
                        <td className="py-1 pr-3 text-right"><Numero valor={h.impressions} /></td>
                        <td className="py-1 pr-3 text-right"><Numero valor={h.uniqueImpressions} /></td>
                        <td className="py-1 pr-3 text-right"><Numero valor={h.clicks} /></td>
                        <td className="py-1 pr-3 text-right"><Numero valor={h.likes} /></td>
                        <td className="py-1 text-right"><Numero valor={h.comments} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <span className="text-[12px] text-muted-foreground">Nenhuma medição desta publicação ainda.</span>
              )}
            </div>
          </Categoria>

          <Recolhivel titulo="Resposta bruta da API — listagem">{bruto(post.bruto)}</Recolhivel>
          <Recolhivel titulo="Resposta bruta da API — content">{bruto(post.contentJson)}</Recolhivel>
          <Recolhivel titulo="Resposta bruta da API — métricas">{bruto(m?.bruto)}</Recolhivel>
          <Recolhivel titulo="Resposta bruta da API — socialActions">{bruto(acoes)}</Recolhivel>
        </div>
      </Card>
    </div>
  );
}

function Categoria({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/80">{titulo}</h4>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5">{children}</div>
    </div>
  );
}

function Campo({ k, v, motivo }: {
  k: string; v: string | number | null | undefined; motivo?: string | null;
}) {
  return (
    <div className="flex flex-col leading-tight min-w-0">
      <span className="text-[9.5px] uppercase tracking-wider text-muted-foreground/60 truncate">{k}</span>
      <span className="text-[12.5px] break-words">
        {typeof v === "number" || v === null || v === undefined
          ? <Numero valor={v} motivo={motivo} />
          : v}
      </span>
    </div>
  );
}

/* ═══ 7 + 8. Cobertura e histórico ════════════════════════════════════════ */

function AbaCobertura({ d, capacidades }: { d: Dados; capacidades: MapaDeCapacidades }) {
  const cob = d.cobertura;
  const v = vereditos(d, capacidades);
  const agregado = (d.lifetime?.agregadoDePostsJson ?? null) as Record<string, unknown> | null;
  const totalAgregado = (agregado?.totalShareStatistics ?? null) as Record<string, unknown> | null;

  return (
    <div className="flex flex-col gap-4">
      {/* Cinco estados, e nenhum deles é "vazio". A tabela de conjuntos vem
          primeiro porque ela responde a pergunta que a pessoa traz. */}
      <Bloco titulo="O que conseguimos medir nesta Página"
        nota="a capacidade é a resposta desta Página, nunca o cargo declarado">
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px] min-w-[680px]">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
                <th className="text-left py-2 pr-3">Conjunto</th>
                <th className="text-left py-2 pr-3">Estado</th>
                <th className="text-left py-2 pr-3">Resposta da API</th>
                <th className="text-left py-2">O que fazer</th>
              </tr>
            </thead>
            <tbody>
              {v.map((x) => {
                const cap = x.grupo.capacidade ? capacidades[x.grupo.capacidade] : null;
                return (
                  <tr key={x.grupo.id} className="border-t border-border/60">
                    <td className="py-2 pr-3 font-medium">{x.grupo.rotulo}</td>
                    <td className="py-2 pr-3">
                      <Selo estado={TOM_MEDIDA[x.estado]}>{ROTULO_MEDIDA[x.estado]}</Selo>
                    </td>
                    <td className="py-2 pr-3 text-[11.5px] text-muted-foreground">
                      {cap
                        ? <>HTTP {cap.status ?? "—"} · {ROTULO_ESTADO[cap.estado]}
                            {cap.motivo && <span className="block text-[10.5px] opacity-80">{cap.motivo}</span>}</>
                        : <span className="opacity-60">nunca medida</span>}
                    </td>
                    <td className="py-2 text-[11.5px] text-muted-foreground">{x.acao ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Bloco>

      <Bloco titulo="Agregado de publicações"
        nota="os totais da Página inteira, vitalícios">
        {totalAgregado && Object.keys(totalAgregado).length ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {Object.entries(totalAgregado)
              .filter(([, x]) => typeof x === "number")
              .map(([k, x]) => (
                <Kpi key={k} rotulo={k}
                  valor={k === "engagement" ? pct(x as number) : (x as number)} />
              ))}
          </div>
        ) : (
          <VazioExplicado
            titulo="Nenhum agregado salvo"
            porque="O agregado é gravado no retrato vitalício, e só a Carga histórica e a rodada semanal escrevem lá."
            oQueTem="impressões, únicas, cliques, curtidas, comentários, compartilhamentos e engajamento da Página inteira"
          />
        )}
        {agregado && <Recolhivel titulo="Resposta bruta — agregado">{bruto(agregado)}</Recolhivel>}
      </Bloco>

      <Bloco titulo="Histórico"
        nota="o que a API PERMITE e o que esta Página TEM são coisas diferentes">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Kpi rotulo="Janela da API" valor={JANELA_HISTORICA_DIAS} sufixo="dias"
            nota="provado na Fase 0 · em 730d a série colapsa" />
          <Kpi rotulo="Dias com dado aqui" valor={cob?.diasComDado ?? null}
            nota={cob?.primeiroDia && cob.ultimoDia
              ? `janela de ${diasEntre(cob.primeiroDia, cob.ultimoDia) + 1} dia(s)` : "nenhum"} />
          <Kpi rotulo="Primeiro dado" valor={cob?.primeiroDia ? dataBr(cob.primeiroDia) : null} />
          <Kpi rotulo="Último dado" valor={cob?.ultimoDia ? dataBr(cob.ultimoDia) : null} />
          <Kpi rotulo="Publicações" valor={cob?.publicacoes ?? null} />
          <Kpi rotulo="Publicação mais antiga"
            valor={cob?.publicacaoMaisAntiga ? dataBr(cob.publicacaoMaisAntiga) : null}
            nota={cob?.publicacaoMaisAntiga
              ? `${diasEntre(new Date(cob.publicacaoMaisAntiga).toISOString().slice(0, 10),
                  new Date().toISOString().slice(0, 10))} dias atrás` : undefined} />
          <Kpi rotulo="Com métricas" valor={cob?.publicacoesComMetrica ?? null}
            nota={cob?.publicacoes ? `de ${cob.publicacoes}` : undefined} />
          <Kpi rotulo="Retrato vitalício"
            valor={d.lifetime?.dia ? dataBr(d.lifetime.dia) : null}
            nota={d.lifetime ? "segmentações e vitalícios" : "só a Carga histórica escreve"} />
        </div>
      </Bloco>

    </div>
  );
}

/* ═══ 9. Consumo da API ═══════════════════════════════════════════════════ */

function AbaConsumo({ d, totalDePaginas }: { d: Dados; totalDePaginas: number }) {
  const exec = d.execucoes;
  const carga = exec.find((e) => e.escopo === "carga") ?? null;
  const ultima = exec[0] ?? null;
  const incrementais = exec.filter((e) => e.escopo !== "carga");
  const mediaIncremental = incrementais.length
    ? Math.round(incrementais.reduce((t, e) => t + e.chamadas, 0) / incrementais.length)
    : null;

  return (
    <div className="flex flex-col gap-4">
      <Bloco titulo="Consumo da API"
        nota="a única variável de custo que conseguimos observar">
        {/* Não inventar rate limit: a API não fornece, e dizer isso é a
            informação — silenciar transformaria a ausência em segurança. */}
        <div className="flex items-start gap-2 text-[12px] text-muted-foreground border-l-2 border-amber-500/60 pl-3">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 text-amber-600 flex-shrink-0" />
          <span>
            O LinkedIn <strong>não envia cabeçalho de rate limit</strong> em nenhuma resposta —
            foram 74 respostas na sondagem e zero cabeçalhos. A cota existe (diária, por app)
            e não é observável. Por isso o número de chamadas é orçado antes e registrado depois.
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Kpi rotulo="Carga inicial" valor={carga?.chamadas ?? null} sufixo="chamadas"
            nota={carga ? `${carga.registrosGravados} registros · ${((carga.duracaoMs ?? 0) / 1000).toFixed(1)}s` : "ainda não feita"} />
          <Kpi rotulo="Última sincronização" valor={ultima?.chamadas ?? null} sufixo="chamadas"
            nota={ultima ? `${ultima.registrosGravados} registros · ${((ultima.duracaoMs ?? 0) / 1000).toFixed(1)}s` : "nunca"} />
          <Kpi rotulo="Média incremental" valor={mediaIncremental} sufixo="chamadas"
            nota={`${incrementais.length} rodada(s)`} />
          <Kpi rotulo="Chamadas com erro" valor={ultima?.chamadasComErro ?? null}
            nota="na última rodada" />
        </div>
      </Bloco>

      <Bloco titulo="Projeção da frota"
        nota={`base: ${mediaIncremental ?? "—"} chamadas/Página/dia medidas${totalDePaginas ? ` · ${totalDePaginas} Página(s) vinculada(s) hoje` : ""}`}>
        {mediaIncremental === null ? (
          <p className="text-[12.5px] text-muted-foreground">
            Sem rodada incremental medida ainda. A projeção só aparece com número real —
            estimar sobre estimativa não ajudaria ninguém a decidir.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px] min-w-[420px]">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
                  <th className="text-left py-2 pr-3">Páginas</th>
                  <th className="text-right py-2 pr-3">Rodada diária</th>
                  <th className="text-right py-2 pr-3">Domingo (+semanal)</th>
                  <th className="text-right py-2">Mês</th>
                </tr>
              </thead>
              <tbody>
                {[10, 20, 50].map((n) => {
                  const p = projecaoDeFrota(n, mediaIncremental);
                  return (
                    <tr key={n} className="border-t border-border/60">
                      <td className="py-2 pr-3 font-medium">{n}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{fmt(p.diario)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{fmt(p.semanal)}</td>
                      <td className="py-2 text-right tabular-nums font-semibold">{fmt(p.mensal)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Bloco>

      <Bloco titulo="Rodadas"
        acao={
          <Button size="sm" variant="ghost" className="h-7 text-[11px]"
            onClick={() => baixarCsv("linkedin-rodadas", exec.map((e) => ({
              quando: e.executadaEm, origem: e.origem, escopo: e.escopo,
              estimadas: e.chamadasEstimadas, chamadas: e.chamadas,
              comErro: e.chamadasComErro, registros: e.registrosGravados, ms: e.duracaoMs,
            })))}>
            <Download className="w-3 h-3 mr-1" /> CSV
          </Button>
        }>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px] min-w-[640px]">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
                <th className="text-left py-2 pr-3">Quando</th>
                <th className="text-left py-2 pr-3">Origem</th>
                <th className="text-left py-2 pr-3">Escopo</th>
                <th className="text-right py-2 pr-3">Estimadas</th>
                <th className="text-right py-2 pr-3">Realizadas</th>
                <th className="text-right py-2 pr-3">Com erro</th>
                <th className="text-right py-2 pr-3">Registros</th>
                <th className="text-right py-2">Tempo</th>
              </tr>
            </thead>
            <tbody>
              {exec.map((e) => (
                <tr key={e.id} className="border-t border-border/60">
                  <td className="py-1.5 pr-3 tabular-nums">
                    {new Date(e.executadaEm).toLocaleString("pt-BR")}
                  </td>
                  <td className="py-1.5 pr-3">{e.origem}</td>
                  <td className="py-1.5 pr-3">{e.escopo}</td>
                  <td className="py-1.5 pr-3 text-right"><Numero valor={e.chamadasEstimadas} /></td>
                  <td className="py-1.5 pr-3 text-right font-semibold tabular-nums">{fmt(e.chamadas)}</td>
                  <td className={`py-1.5 pr-3 text-right tabular-nums ${e.chamadasComErro ? "text-destructive" : ""}`}>
                    {fmt(e.chamadasComErro)}
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{fmt(e.registrosGravados)}</td>
                  <td className="py-1.5 text-right tabular-nums">
                    {e.duracaoMs ? `${(e.duracaoMs / 1000).toFixed(1)}s` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!exec.length && (
          <p className="text-[12.5px] text-muted-foreground">Nenhuma rodada registrada ainda.</p>
        )}
      </Bloco>
    </div>
  );
}

/* ═══ 10. Dados brutos ════════════════════════════════════════════════════ */

/**
 * A aba que evita a pergunta "será que a API mandava isso?".
 *
 * Recolhido por padrão: aberto, o JSON dominaria a tela e a bancada viraria um
 * dump. Fechado, ele está a um clique — que é a distância certa para uma
 * investigação que acontece de vez em quando.
 */
function AbaCru({ d }: { d: Dados }) {
  const ultima = d.execucoes[0] ?? null;
  const detalhe = (ultima?.detalheJson ?? null) as {
    passos?: unknown; bruto?: Record<string, unknown>;
  } | null;

  return (
    <div className="flex flex-col gap-4">
      <Bloco titulo="Respostas brutas da última coleta"
        nota={ultima ? `${new Date(ultima.executadaEm).toLocaleString("pt-BR")} · ${ultima.escopo}` : "nenhuma coleta ainda"}>
        {detalhe?.bruto
          ? Object.entries(detalhe.bruto).map(([chave, v]) => (
              <Recolhivel key={chave} titulo={chave}>{bruto(v)}</Recolhivel>
            ))
          : <p className="text-[12.5px] text-muted-foreground">
              Nenhuma resposta guardada. A amostra crua é gravada a cada sincronização.
            </p>}
        {detalhe?.passos ? (
          <Recolhivel titulo="passos da coleta">{bruto(detalhe.passos)}</Recolhivel>
        ) : null}
      </Bloco>

      <Bloco titulo="Estruturado no banco" nota="o que a leitura da página enxerga">
        <Recolhivel titulo="vínculo + capacidades">{bruto(d.pagina)}</Recolhivel>
        <Recolhivel titulo="série diária" contagem={d.serie.length}>{bruto(d.serie)}</Recolhivel>
        <Recolhivel titulo="retrato vitalício">{bruto(d.lifetime)}</Recolhivel>
        <Recolhivel titulo="publicações" contagem={d.posts.length}>{bruto(d.posts)}</Recolhivel>
        <Recolhivel titulo="cobertura">{bruto(d.cobertura)}</Recolhivel>
      </Bloco>
    </div>
  );
}

/* ═══ Estado do banco — o que já temos, sem gastar uma chamada ════════════ */

const TOM_MEDIDA: Record<EstadoDaMedida, EstadoDaCapacidade> = {
  com_dado: "ok",
  sem_dado: "sem_dados",
  recusado: "sem_permissao",
  nao_coletado: "nao_coletado",
  so_na_carga: "nao_disponivel",
};

/**
 * O veredito de cada conjunto, montado a partir do que EXISTE no banco.
 *
 * A evidência vem de contagem real — não de suposição sobre o que a coleta
 * deveria ter feito. É a diferença entre "a interface acha que tem" e "tem".
 */
function vereditos(d: Dados, capacidades: MapaDeCapacidades): VereditoDoGrupo[] {
  const b = d.banco;
  const jaFezCarga = (b?.execucoes.cargas ?? 0) > 0;
  const evidencia: Record<string, { temLinha: boolean; temValor: boolean }> = {
    identificacao: { temLinha: !!d.pagina, temValor: !!d.pagina?.organizationUrn },
    organizacao: { temLinha: (b?.vitalicio.linhas ?? 0) > 0, temValor: !!b?.vitalicio.temOrganizacao },
    seguidores_total: { temLinha: (b?.diario.linhas ?? 0) > 0, temValor: (b?.diario.comSeguidores ?? 0) > 0 },
    seguidores_serie: { temLinha: (b?.diario.linhas ?? 0) > 0, temValor: (b?.diario.comGanho ?? 0) > 0 },
    segmentacoes: { temLinha: (b?.vitalicio.linhas ?? 0) > 0, temValor: !!b?.vitalicio.temSegmentacoes },
    views_serie: { temLinha: (b?.diario.linhas ?? 0) > 0, temValor: (b?.diario.comViews ?? 0) > 0 },
    views_lifetime: { temLinha: (b?.vitalicio.linhas ?? 0) > 0, temValor: !!b?.vitalicio.temVisualizacoes },
    agregado: { temLinha: (b?.vitalicio.linhas ?? 0) > 0, temValor: !!b?.vitalicio.temAgregado },
    publicacoes: { temLinha: (b?.publicacoes.linhas ?? 0) > 0, temValor: (b?.publicacoes.linhas ?? 0) > 0 },
    metricas_post: { temLinha: (b?.metricas.linhas ?? 0) > 0, temValor: (b?.metricas.comImpressoes ?? 0) > 0 },
    reacoes: { temLinha: (b?.metricas.linhas ?? 0) > 0, temValor: (b?.metricas.comReacoesPorTipo ?? 0) > 0 },
  };
  return GRUPOS_DE_DADO.map((g) => vereditoDoGrupo(g, {
    ...(evidencia[g.id] ?? { temLinha: false, temValor: false }),
    capacidade: g.capacidade ? capacidades[g.capacidade] ?? null : null,
    jaFezCarga,
  }));
}

function Contagem({ rotulo, n, nota }: { rotulo: string; n: number | null | undefined; nota?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[12.5px] py-1 border-b border-border/40">
      <span className="text-muted-foreground">{rotulo}</span>
      <span className="flex items-baseline gap-2">
        {nota && <span className="text-[10.5px] text-muted-foreground/70">{nota}</span>}
        <span className={`font-semibold tabular-nums ${n ? "" : "text-muted-foreground/50"}`}>
          {n ?? 0}
        </span>
      </span>
    </div>
  );
}

function AbaBanco({ d, capacidades }: { d: Dados; capacidades: MapaDeCapacidades }) {
  const b = d.banco;
  const v = vereditos(d, capacidades);
  const falta = oQueFalta(v);

  if (!b) {
    return <Bloco titulo="Estado do banco"><p className="text-[12.5px] text-muted-foreground">
      Não foi possível ler o banco.</p></Bloco>;
  }

  return (
    <div className="flex flex-col gap-4">
      {/* O aviso que faltava: nada disso é falha da API. */}
      {falta.soNaCarga.length > 0 && (
        <Bloco titulo="Por que falta metade dos dados">
          <p className="text-[12.5px] leading-relaxed">
            Esta Página tem <strong>{b.execucoes.incrementais} sincronização(ões) incremental(is)</strong> e
            <strong> {b.execucoes.cargas} carga(s) histórica(s)</strong>. O incremental não pede
            {" "}{falta.soNaCarga.length} conjunto(s) de dado — não porque a API recusou, mas porque
            eles só são buscados na Carga histórica:
          </p>
          <ul className="text-[12.5px] flex flex-col gap-1 pl-4">
            {falta.soNaCarga.map((x) => (
              <li key={x.grupo.id} className="list-disc">
                <strong>{x.grupo.rotulo}</strong>
                <span className="text-muted-foreground"> — {x.grupo.oQueTem}</span>
              </li>
            ))}
          </ul>
          <p className="text-[12px] text-muted-foreground">
            A Carga histórica está no topo da página e mostra a estimativa de chamadas antes do clique.
            Nada aqui roda sozinho.
          </p>
        </Bloco>
      )}

      <Bloco titulo="Conjunto por conjunto"
        nota="cinco estados, e nenhum deles é 'vazio'">
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px] min-w-[720px]">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
                <th className="text-left py-2 pr-3">Conjunto</th>
                <th className="text-left py-2 pr-3">Estado</th>
                <th className="text-left py-2 pr-3">Onde mora</th>
                <th className="text-left py-2">O que fazer</th>
              </tr>
            </thead>
            <tbody>
              {v.map((x) => (
                <tr key={x.grupo.id} className="border-t border-border/60">
                  <td className="py-2 pr-3">
                    <div className="flex flex-col leading-tight">
                      <span className="font-medium">{x.grupo.rotulo}</span>
                      <span className="text-[10.5px] text-muted-foreground/70">{x.grupo.oQueTem}</span>
                    </div>
                  </td>
                  <td className="py-2 pr-3">
                    <Selo estado={TOM_MEDIDA[x.estado]}>{ROTULO_MEDIDA[x.estado]}</Selo>
                  </td>
                  <td className="py-2 pr-3 font-mono text-[10.5px] text-muted-foreground break-all">
                    {x.grupo.tabela}
                  </td>
                  <td className="py-2 text-[11.5px] text-muted-foreground">{x.acao ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Bloco>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Bloco titulo="linkedin_page_daily"
          nota={b.diario.primeiro ? `${dataBr(b.diario.primeiro)} → ${dataBr(b.diario.ultimo)}` : "vazia"}>
          <Contagem rotulo="Linhas (um dia cada)" n={b.diario.linhas} />
          <Contagem rotulo="Com total de seguidores" n={b.diario.comSeguidores} />
          <Contagem rotulo="Com ganho diário" n={b.diario.comGanho} />
          <Contagem rotulo="Com visualizações" n={b.diario.comViews} />
          <Contagem rotulo="Recortes de visualização distintos" n={b.diario.recortesDeView} />
          <Contagem rotulo="Com métrica recusada" n={b.diario.comIndisponiveis} />
        </Bloco>

        <Bloco titulo="linkedin_page_lifetime"
          nota={b.vitalicio.ultimo ? `último em ${dataBr(b.vitalicio.ultimo)}` : "vazia — só a Carga escreve aqui"}>
          <Contagem rotulo="Retratos guardados" n={b.vitalicio.linhas} />
          <Contagem rotulo="Segmentações de seguidores" n={b.vitalicio.temSegmentacoes ? 1 : 0}
            nota={b.vitalicio.temSegmentacoes ? "presente" : "ausente"} />
          <Contagem rotulo="Visualizações vitalícias" n={b.vitalicio.temVisualizacoes ? 1 : 0}
            nota={b.vitalicio.temVisualizacoes ? "presente" : "ausente"} />
          <Contagem rotulo="Agregado de publicações" n={b.vitalicio.temAgregado ? 1 : 0}
            nota={b.vitalicio.temAgregado ? "presente" : "ausente"} />
          <Contagem rotulo="Detalhes da organização" n={b.vitalicio.temOrganizacao ? 1 : 0}
            nota={b.vitalicio.temOrganizacao ? "presente" : "ausente"} />
        </Bloco>

        <Bloco titulo="linkedin_posts"
          nota={b.publicacoes.maisAntiga
            ? `${dataBr(b.publicacoes.maisAntiga)} → ${dataBr(b.publicacoes.maisNova)}` : "vazia"}>
          <Contagem rotulo="Publicações" n={b.publicacoes.linhas} />
          <Contagem rotulo="Com texto" n={b.publicacoes.comTexto} />
          <Contagem rotulo="Com content cru" n={b.publicacoes.comContent} />
          <Contagem rotulo="Com imagem resolvida" n={b.publicacoes.comMidiaResolvida} />
          <Contagem rotulo="Com mídia sem URL" n={b.publicacoes.comMidiaSemUrl} />
          <Contagem rotulo="Tipo ugcPost" n={b.publicacoes.ugcPost} />
          <Contagem rotulo="Tipo share" n={b.publicacoes.share} />
        </Bloco>

        <Bloco titulo="linkedin_post_metrics"
          nota={b.metricas.primeiro ? `${dataBr(b.metricas.primeiro)} → ${dataBr(b.metricas.ultimo)}` : "vazia"}>
          <Contagem rotulo="Medições (publicação × dia)" n={b.metricas.linhas} />
          <Contagem rotulo="Publicações distintas" n={b.metricas.publicacoesDistintas} />
          <Contagem rotulo="Dias distintos" n={b.metricas.diasDistintos} />
          <Contagem rotulo="Com impressões" n={b.metricas.comImpressoes} />
          <Contagem rotulo="Com reações por tipo" n={b.metricas.comReacoesPorTipo} />
          <Contagem rotulo="Com socialActions" n={b.metricas.comSocialActions} />
          <Contagem rotulo="Parciais" n={b.metricas.parciais} />
        </Bloco>
      </div>

      <Bloco titulo="linkedin_coleta_execucoes"
        nota={b.execucoes.primeira
          ? `${new Date(b.execucoes.primeira).toLocaleString("pt-BR")} → ${new Date(b.execucoes.ultima!).toLocaleString("pt-BR")}`
          : "nenhuma"}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
          <Contagem rotulo="Rodadas" n={b.execucoes.linhas} />
          <Contagem rotulo="Cargas históricas" n={b.execucoes.cargas} />
          <Contagem rotulo="Incrementais" n={b.execucoes.incrementais} />
          <Contagem rotulo="Semanais" n={b.execucoes.semanais} />
          <Contagem rotulo="Chamadas à API, no total" n={b.execucoes.chamadasTotais} />
        </div>
      </Bloco>
    </div>
  );
}

/* ═══ Página — a identidade completa que já está salva ════════════════════ */

function AbaIdentidade({ d, papeis, status }: {
  d: Dados; papeis: Array<{ papel: string; estado: string }>; status: StatusDoVinculo;
}) {
  const org = (d.lifetime?.organizacaoJson ?? null) as Record<string, unknown> | null;
  const p = d.pagina;

  /** O texto de um campo da organização, seja ele string, número ou lista. */
  const texto = (v: unknown): string | null => {
    if (v === null || v === undefined) return null;
    if (typeof v === "string" || typeof v === "number") return String(v);
    if (Array.isArray(v)) return v.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(", ");
    if (typeof v === "object") {
      const o = v as Record<string, unknown>;
      // `foundedOn: { year: 2018 }` e afins — legível sem virar JSON.
      const partes = Object.entries(o).filter(([, x]) => typeof x === "string" || typeof x === "number");
      if (partes.length) return partes.map(([k, x]) => `${k}: ${x}`).join(" · ");
    }
    return null;
  };

  return (
    <div className="flex flex-col gap-4">
      <Bloco titulo="Identificação" nota="salvo no vínculo — não depende de coleta">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
          <Campo k="Nome" v={p?.nome ?? null} motivo={p?.nome ? null : "o LinkedIn recusou a identidade desta organização"} />
          <Campo k="Vanity" v={p?.vanityName ?? null} />
          <Campo k="ID da organização" v={p?.organizationId ?? null} />
          <Campo k="URN" v={p?.organizationUrn ?? null} />
          <Campo k="Status do vínculo" v={ROTULO_VINCULO[status]} />
          <Campo k="Vinculada em" v={p?.createdAt ? dataBr(p.createdAt) : null} />
          <Campo k="Carga histórica" v={p?.cargaInicialEm ? dataBr(p.cargaInicialEm) : null}
            motivo={p?.cargaInicialEm ? null : "ainda não foi feita nesta Página"} />
          <Campo k="Última coleta" v={p?.ultimaColetaEm ? dataBr(p.ultimaColetaEm) : null} />
          <Campo k="Último erro" v={p?.ultimoErro ?? null} />
        </div>
      </Bloco>

      <Bloco titulo="Cargos da SELVA nesta Página"
        nota="por atribuição, com o state de cada uma — a mesma Página tem cargos vivos e revogados ao mesmo tempo">
        {papeis.length ? (
          <div className="flex flex-col gap-1.5">
            {papeis.map((x) => (
              <div key={x.papel} className="flex items-center justify-between gap-3 text-[12.5px] py-1 border-b border-border/40">
                <span className="font-mono text-[11.5px]">{x.papel}</span>
                <Selo estado={x.estado === "APPROVED" ? "ok" : "sem_permissao"}>
                  {x.estado}
                </Selo>
              </div>
            ))}
          </div>
        ) : <p className="text-[12.5px] text-muted-foreground">Nenhum cargo registrado no vínculo.</p>}
      </Bloco>

      <Bloco titulo="Detalhes da organização"
        nota={org ? "de /rest/organizations, salvo na última carga ou semanal" : undefined}>
        {org ? (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
              {Object.entries(org)
                .filter(([, v]) => texto(v) !== null)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([k, v]) => <Campo key={k} k={k} v={texto(v)} />)}
            </div>
            <Recolhivel titulo="Resposta bruta — /rest/organizations">{bruto(org)}</Recolhivel>
          </>
        ) : (
          <VazioExplicado
            titulo="Nenhum detalhe de organização salvo"
            porque="O incremental não busca este dado — só a Carga histórica e a rodada semanal pedem /rest/organizations."
            oQueTem="site, descrição, fundação, especialidades, porte, tipo de organização, logo e capa"
          />
        )}
      </Bloco>
    </div>
  );
}

/**
 * O vazio que EXPLICA.
 *
 * "Sem dados" sozinho manda a pessoa procurar o problema, e na maioria das vezes
 * não há problema nenhum: o dado existe na API e a sincronização que rodou não
 * pede por ele. Dizer isso é a diferença entre uma tela vazia e um diagnóstico.
 */
function VazioExplicado({ titulo, porque, oQueTem }: {
  titulo: string; porque: string; oQueTem?: string;
}) {
  return (
    <div className="flex items-start gap-3 py-6 px-1">
      <AlertTriangle className="w-4 h-4 mt-0.5 text-amber-600 flex-shrink-0" />
      <div className="flex flex-col gap-1 min-w-0">
        <span className="text-[13px] font-semibold">{titulo}</span>
        <span className="text-[12.5px] text-muted-foreground leading-relaxed">{porque}</span>
        {oQueTem && (
          <span className="text-[11.5px] text-muted-foreground/80">
            O que viria aqui: {oQueTem}.
          </span>
        )}
      </div>
    </div>
  );
}

/* ═══ Visualizações — vitalício e histórico, separados ════════════════════ */

/**
 * Tabela de facetas, ordenável.
 *
 * Substitui o `<pre>` de JSON que estava aqui. Um dump serve para conferir que
 * o dado chegou; ele não serve para descobrir que setor concentra a audiência —
 * que é a pergunta que este laboratório existe para responder.
 */
function TabelaDeFacetas({ titulo, itens, campoDeContagem, unidade }: {
  titulo: string; itens: unknown; campoDeContagem?: string; unidade: string;
}) {
  const linhas = useMemo(
    () => linhasDoSegmento(itens, campoDeContagem), [itens, campoDeContagem]);
  const total = linhas.reduce((t, l) => t + (l.total ?? 0), 0);
  if (!linhas.length) return null;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[10.5px] font-mono text-muted-foreground">{titulo}</span>
        <span className="text-[10px] text-muted-foreground/70">
          {linhas.length} faceta(s) · {fmt(total)} {unidade}
        </span>
      </div>
      <div className="overflow-x-auto max-h-[320px]">
        <table className="w-full text-[12px] min-w-[420px]">
          <thead className="sticky top-0 bg-card">
            <tr className="text-[9.5px] uppercase tracking-wider text-muted-foreground/70">
              <th className="text-left py-1.5 pr-3">Faceta</th>
              <th className="text-right py-1.5 pr-3">Orgânico</th>
              <th className="text-right py-1.5 pr-3">Pago</th>
              <th className="text-right py-1.5 pr-3">Total</th>
              <th className="text-right py-1.5">Fatia</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.chave} className="border-t border-border/50">
                <td className="py-1 pr-3" title={l.chave}>{l.rotulo}</td>
                <td className="py-1 pr-3 text-right"><Numero valor={l.organico} /></td>
                <td className="py-1 pr-3 text-right"><Numero valor={l.pago} /></td>
                <td className="py-1 pr-3 text-right font-semibold"><Numero valor={l.total} /></td>
                <td className="py-1 text-right tabular-nums text-muted-foreground">
                  {total && l.total !== null ? `${((l.total / total) * 100).toFixed(1)}%` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex justify-end">
        <Button size="sm" variant="ghost" className="h-6 text-[10.5px]"
          onClick={() => baixarCsv(`linkedin-${titulo}`, linhas.map((l) => ({ ...l })))}>
          <Download className="w-3 h-3 mr-1" /> CSV
        </Button>
      </div>
    </div>
  );
}

function AbaVisualizacoes({ d }: { d: Dados }) {
  const vital = (d.lifetime?.totalPageStatisticsJson ?? null) as Record<string, unknown> | null;
  const totalVital = (vital?.totalPageStatistics ?? null) as Record<string, unknown> | null;
  const facetas = segmentosDisponiveis(vital).filter((x) => x.campo.startsWith("pageStatistics"));
  const b = d.banco;
  const fezCarga = (b?.execucoes.cargas ?? 0) > 0;

  /** Os recortes que a série diária guardou, somados no período. */
  const somaDaSerie = useMemo(() => {
    const soma: Record<string, number> = {};
    for (const x of d.serie) {
      for (const [k, v] of Object.entries((x.viewsJson ?? {}) as Record<string, number>)) {
        if (typeof v === "number") soma[k] = (soma[k] ?? 0) + v;
      }
    }
    return soma;
  }, [d.serie]);

  const recortesVitalicios = useMemo(() => {
    const saida: Record<string, number> = {};
    const achatar = (o: unknown, prefixo = "", nivel = 0) => {
      if (!o || typeof o !== "object" || nivel > 4) return;
      for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
        const caminho = prefixo ? `${prefixo}.${k}` : k;
        if (typeof v === "number") saida[caminho] = v;
        else if (v && typeof v === "object" && !Array.isArray(v)) achatar(v, caminho, nivel + 1);
      }
    };
    achatar(totalVital);
    return saida;
  }, [totalVital]);

  return (
    <div className="flex flex-col gap-4">
      <Bloco titulo="Vitalício"
        nota={d.lifetime?.dia ? `retrato de ${dataBr(d.lifetime.dia)}` : undefined}>
        {Object.keys(recortesVitalicios).length ? (
          <TabelaDeRecortes valores={recortesVitalicios} nome="linkedin-views-vitalicio" />
        ) : (
          <VazioExplicado
            titulo="Nenhuma visualização vitalícia salva"
            porque={fezCarga
              ? "A carga rodou, mas a API não devolveu totalPageStatistics para esta Página."
              : "O incremental não pede visualizações vitalícias — só a Carga histórica e a rodada semanal chamam /rest/organizationPageStatistics sem janela."}
            oQueTem="os ~30 recortes de pageViews desde sempre, mais os cortes por setor, senioridade, geografia, função e porte"
          />
        )}
      </Bloco>

      <Bloco titulo="Somado no período"
        nota={`${d.serie.filter((x) => Object.keys((x.viewsJson ?? {}) as object).length).length} dia(s) com visualização`}>
        {Object.keys(somaDaSerie).length ? (
          <TabelaDeRecortes valores={somaDaSerie} nome="linkedin-views-periodo" />
        ) : (
          <VazioExplicado
            titulo="Nenhuma visualização por dia no período"
            porque="A série diária de visualizações não foi gravada, ou o período selecionado está fora do que foi coletado."
          />
        )}
      </Bloco>

      {facetas.length > 0 && (
        <Bloco titulo="Recortes de audiência (vitalício)"
          nota="quem viu a Página, por faceta — só existe no retrato vitalício">
          <div className="flex flex-col gap-5">
            {facetas.map((f) => (
              <TabelaDeFacetas key={f.campo} titulo={f.campo}
                itens={(vital as Record<string, unknown>)[f.campo]}
                campoDeContagem="pageStatistics" unidade="visualizações" />
            ))}
          </div>
          <Recolhivel titulo="Resposta bruta — organizationPageStatistics">{bruto(vital)}</Recolhivel>
        </Bloco>
      )}
    </div>
  );
}

/** Os recortes achatados, ordenados por valor — é o mapa dos ~30. */
function TabelaDeRecortes({ valores, nome }: { valores: Record<string, number>; nome: string }) {
  const [busca, setBusca] = useState("");
  const linhas = Object.entries(valores)
    .filter(([k]) => !busca || k.toLowerCase().includes(busca.toLowerCase()))
    .sort((a, b) => b[1] - a[1]);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <input className="h-7 rounded border border-border bg-background px-2 text-[12px] min-w-[200px]"
          value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="filtrar recorte" />
        <span className="text-[10.5px] text-muted-foreground">{linhas.length} recorte(s)</span>
      </div>
      <div className="overflow-x-auto max-h-[460px]">
        <table className="w-full text-[12px] min-w-[420px]">
          <thead className="sticky top-0 bg-card">
            <tr className="text-[9.5px] uppercase tracking-wider text-muted-foreground/70">
              <th className="text-left py-1.5 pr-3">Recorte</th>
              <th className="text-right py-1.5">Visualizações</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map(([k, v]) => (
              <tr key={k} className="border-t border-border/50">
                <td className="py-1 pr-3 font-mono text-[11px]">{k}</td>
                <td className="py-1 text-right font-semibold tabular-nums">{fmt(v)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex justify-end">
        <Button size="sm" variant="ghost" className="h-6 text-[10.5px]"
          onClick={() => baixarCsv(nome, linhas.map(([recorte, valor]) => ({ recorte, valor })))}>
          <Download className="w-3 h-3 mr-1" /> CSV
        </Button>
      </div>
    </div>
  );
}

/* ═══ Segmentações de seguidores ══════════════════════════════════════════ */

function AbaSegmentacoes({ d }: { d: Dados }) {
  const seg = (d.lifetime?.segmentacoesJson ?? null) as Record<string, unknown> | null;
  const grupos = segmentosDisponiveis(seg).filter((x) => x.campo.startsWith("followerCounts"));
  const b = d.banco;
  const fezCarga = (b?.execucoes.cargas ?? 0) > 0;

  if (!grupos.length) {
    return (
      <Bloco titulo="Segmentações de seguidores">
        <VazioExplicado
          titulo="Nenhuma segmentação salva"
          porque={fezCarga
            ? "A carga rodou, mas a API não devolveu as segmentações para esta Página — confira o estado na aba Cobertura."
            : "O incremental não pede segmentações — só a Carga histórica e a rodada semanal chamam organizationalEntityFollowerStatistics sem janela."}
          oQueTem="tipo de associação, senioridade, setor, função, porte da empresa, país e região"
        />
        {seg && <Recolhivel titulo="Resposta bruta — o que foi salvo">{bruto(seg)}</Recolhivel>}
      </Bloco>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Bloco titulo="Segmentações de seguidores"
        nota={`${grupos.length} recorte(s) · retrato de ${dataBr(d.lifetime?.dia)}`}>
        <div className="flex flex-col gap-6">
          {grupos.map((g) => (
            <TabelaDeFacetas key={g.campo} titulo={g.campo}
              itens={(seg as Record<string, unknown>)[g.campo]}
              campoDeContagem="followerCounts" unidade="seguidores" />
          ))}
        </div>
        <Recolhivel titulo="Resposta bruta — organizationalEntityFollowerStatistics">
          {bruto(seg)}
        </Recolhivel>
      </Bloco>
    </div>
  );
}
