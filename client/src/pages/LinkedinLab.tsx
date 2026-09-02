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
  Layers, Link2, Loader2, RefreshCw, Search, X,
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
import { JANELA_HISTORICA_DIAS, projecaoDeFrota } from "@shared/linkedinPlanoDeColeta";

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

type Aba = "geral" | "evolucao" | "publicacoes" | "cobertura" | "consumo" | "cru";

const ABAS: Array<{ id: Aba; nome: string }> = [
  { id: "geral", nome: "Visão geral" },
  { id: "evolucao", nome: "Evolução" },
  { id: "publicacoes", nome: "Publicações" },
  { id: "cobertura", nome: "Cobertura" },
  { id: "consumo", nome: "Consumo da API" },
  { id: "cru", nome: "Dados brutos" },
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

        {!ativo && !vinculosQ.isLoading && <SemVinculo aoVincular={() => void vinculosQ.refetch()} />}

        {ativo && dadosQ.isLoading && (
          <div className="py-16 flex items-center justify-center text-sm text-muted-foreground gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Lendo o que já foi coletado…
          </div>
        )}

        {ativo && d && (
          <>
            {aba === "geral" && <AbaGeral d={d} capacidades={capacidades} status={status} />}
            {aba === "evolucao" && <AbaEvolucao serie={d.serie} />}
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

function SemVinculo({ aoVincular }: { aoVincular: () => void }) {
  const [paginas, setPaginas] = useState<Array<{
    id: string; urn: string; nome: string | null; vanity: string | null;
    papeis: Array<{ papel: string; estado: string }>;
  }> | null>(null);
  const [semNome, setSemNome] = useState(0);

  const clientesQ = trpc.accounts.list.useQuery(undefined, { refetchOnWindowFocus: false });
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
    onSuccess: () => { toast.success("Página vinculada."); aoVincular(); },
    onError: (e) => toast.error("Falha ao vincular.", { description: e.message }),
  });

  const [cliente, setCliente] = useState<number | null>(null);

  return (
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
        // Dito, e não escondido: o número ali não é um nome, e a pessoa precisa
        // saber por quê antes de vincular às cegas.
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
                    <td className="py-2 text-right">
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
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Bloco>
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

      <CoberturaCurta capacidades={capacidades} />
    </div>
  );
}

/** A lista de capacidades — o que conseguimos medir NESTA Página. */
function CoberturaCurta({ capacidades }: { capacidades: MapaDeCapacidades }) {
  return (
    <Bloco titulo="O que conseguimos medir nesta Página"
      nota="a capacidade é a resposta desta Página, nunca o cargo declarado">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-1.5">
        {CAPACIDADES.map((c) => {
          const l = capacidades[c];
          const estado = l?.estado ?? "nao_coletado";
          return (
            <div key={c} className="flex items-center justify-between gap-2 text-[12.5px] py-0.5 border-b border-border/40">
              <span className="truncate">{ROTULO_CAPACIDADE[c]}</span>
              <Selo estado={estado} titulo={l?.motivo ?? undefined}>
                {ROTULO_ESTADO[estado]}
              </Selo>
            </div>
          );
        })}
      </div>
    </Bloco>
  );
}

/* ═══ 2. Evolução ═════════════════════════════════════════════════════════ */

type Serie = Dados["serie"];

/**
 * Um gráfico só, com seletor de métrica.
 *
 * Os ~30 recortes de visualização entram todos na lista — inclusive os que
 * talvez ninguém use. Escolher aqui os "importantes" seria decidir antes de
 * observar, que é justamente o que o laboratório existe para evitar.
 */
function AbaEvolucao({ serie }: { serie: Serie }) {
  const recortes = useMemo(() => {
    const chaves = new Set<string>();
    for (const s of serie) {
      for (const k of Object.keys((s.viewsJson ?? {}) as Record<string, number>)) chaves.add(k);
    }
    return Array.from(chaves).sort();
  }, [serie]);

  const metricas = useMemo(() => [
    { id: "seguidoresTotal", nome: "Seguidores", unidade: "seguidores", cor: COR.seguidores },
    { id: "ganhoOrganico", nome: "Ganho de seguidores (orgânico)", unidade: "novos seguidores", cor: COR.entrada },
    { id: "ganhoPago", nome: "Ganho de seguidores (pago)", unidade: "novos seguidores", cor: COR.ativacoes },
    ...recortes.map((k) => ({
      id: `views:${k}`, nome: k.replace(/^views\./, ""), unidade: "visualizações", cor: COR.visitas,
    })),
  ], [recortes]);

  const [metrica, setMetrica] = useState("seguidoresTotal");
  const [ativo, setAtivo] = useState<number | null>(null);
  const m = metricas.find((x) => x.id === metrica) ?? metricas[0];

  const pontos: PontoHistorico[] = useMemo(() => {
    const saida: PontoHistorico[] = [];
    let anterior: string | null = null;
    for (const s of serie) {
      const v = m.id.startsWith("views:")
        ? ((s.viewsJson ?? {}) as Record<string, number>)[m.id.slice(6)]
        : (s[m.id as "seguidoresTotal" | "ganhoOrganico" | "ganhoPago"] as number | null);
      if (typeof v !== "number") { anterior = anterior; continue; }
      saida.push({ dia: s.dia, valor: v, vao: !!anterior && diasEntre(anterior, s.dia) > 1 });
      anterior = s.dia;
    }
    return saida;
  }, [serie, m]);

  const faltando = serie.length - pontos.length;

  return (
    <Bloco titulo="Evolução da Página"
      nota={`${pontos.length} ponto(s) medido(s)${faltando > 0 ? ` · ${faltando} dia(s) sem esta métrica` : ""}`}
      acao={
        <div className="flex items-center gap-2">
          {ativo !== null && pontos[ativo] && (
            <LeituraDoPonto dia={pontos[ativo].dia}
              valores={[{ valor: fmt(pontos[ativo].valor), rotulo: m.unidade, cor: m.cor }]} />
          )}
          <select className="h-7 rounded border border-border bg-background px-2 text-[12px] max-w-[280px]"
            value={metrica} onChange={(e) => { setMetrica(e.target.value); setAtivo(null); }}>
            {metricas.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
          </select>
        </div>
      }>
      {pontos.length < 2 ? (
        <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">
          Menos de dois pontos medidos — não há série para desenhar.
          {faltando > 0 && " Os dias sem medida ficam de fora, e não viram zero."}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <CurvaHistorica id={`lab-${m.id}`} pontos={pontos} cor={m.cor}
            altura={220} largura={Math.max(760, pontos.length * 9)}
            ativo={ativo} aoEntrar={setAtivo} />
        </div>
      )}
      <div className="flex justify-end">
        <Button size="sm" variant="ghost" className="h-7 text-[11px]"
          onClick={() => baixarCsv("linkedin-serie", serie.map((s) => ({
            dia: s.dia, seguidores: s.seguidoresTotal,
            ganhoOrganico: s.ganhoOrganico, ganhoPago: s.ganhoPago,
            ...((s.viewsJson ?? {}) as Record<string, number>),
          })))}>
          <Download className="w-3 h-3 mr-1" /> CSV da série
        </Button>
      </div>
    </Bloco>
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
  const lifetime = d.lifetime;
  const seg = (lifetime?.segmentacoesJson ?? null) as Record<string, unknown> | null;

  return (
    <div className="flex flex-col gap-4">
      <CoberturaCurta capacidades={capacidades} />

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
            valor={lifetime?.dia ? dataBr(lifetime.dia) : null}
            nota="segmentações · atualizado semanalmente" />
        </div>
      </Bloco>

      {seg && (
        <Bloco titulo="Segmentações de seguidores"
          nota="tudo que a API devolveu — inclusive o que talvez ninguém use"
          acao={
            <Button size="sm" variant="ghost" className="h-7 text-[11px]"
              onClick={() => baixarCsv("linkedin-segmentacoes",
                Object.entries(seg).flatMap(([grupo, v]) =>
                  Array.isArray(v)
                    ? v.map((x) => ({ grupo, ...(x as Record<string, unknown>) }))
                    : [{ grupo, valor: JSON.stringify(v) }]))}>
              <Download className="w-3 h-3 mr-1" /> CSV
            </Button>
          }>
          <div className="flex flex-col gap-3">
            {Object.entries(seg)
              .filter(([, v]) => Array.isArray(v) && v.length)
              .map(([grupo, v]) => (
                <div key={grupo} className="flex flex-col gap-1">
                  <span className="text-[10.5px] font-mono text-muted-foreground">{grupo}</span>
                  <div className="overflow-x-auto">
                    <pre className="text-[10.5px] bg-muted/40 rounded p-2 max-h-[220px] overflow-auto">
                      {bruto(v)}
                    </pre>
                  </div>
                </div>
              ))}
          </div>
          <Recolhivel titulo="Resposta bruta — segmentações">{bruto(seg)}</Recolhivel>
        </Bloco>
      )}
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
