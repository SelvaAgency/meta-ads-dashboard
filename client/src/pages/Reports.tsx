import { MetaDashboardLayout } from "@/components/MetaDashboardLayout";
import { useSelectedAccount } from "@/hooks/useSelectedAccount";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Link2, Copy, Loader2, CheckCircle2, Clock, ExternalLink, Sparkles, Check, ChevronDown, Trash2, Pencil,
  Megaphone, BarChart3, Globe, Gauge, ShieldCheck, Wifi, Bell, MousePointerClick, NotebookPen, History } from "lucide-react";
import { useEffect, useState, Fragment, type ComponentType } from "react";
import { EditarRelatorio } from "@/components/EditarRelatorio";
import { toast } from "sonner";

/** Ícone por módulo — dá leitura visual rápida na seleção do relatório. */
const MODULO_ICON: Record<string, ComponentType<{ className?: string }>> = {
  midia: Megaphone, campanhas: BarChart3, site: Globe, clarity: MousePointerClick,
  pagespeed: Gauge, seguranca: ShieldCheck, uptime: Wifi, contexto: NotebookPen,
  alertas: Bell, relatorios: History,
};

/**
 * Rótulo de cada módulo. A disponibilidade NÃO vem daqui — vem do servidor,
 * por cliente: só ele sabe se este cliente tem Clarity, PageSpeed etc.
 */
const MODULO_LABEL: Record<string, string> = {
  midia: "Mídia paga",
  campanhas: "Campanhas",
  site: "Site",
  clarity: "Clarity",
  pagespeed: "Performance técnica",
  seguranca: "Segurança básica",
  uptime: "Uptime",
  contexto: "Contexto manual",
  alertas: "Alertas recentes",
  relatorios: "Histórico/comparativo",
};
const ORDEM_MODULOS = Object.keys(MODULO_LABEL);
/** Módulo → chave da fonte que o alimenta (para avisar o que vai faltar). */
const FONTE_DO_MODULO: Record<string, string> = {
  midia: "midia", campanhas: "campanhas", clarity: "clarity", pagespeed: "pagespeed",
  seguranca: "seguranca", uptime: "uptime", contexto: "contexto", alertas: "alertas",
  relatorios: "relatorios",
};

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function daysAgoStr(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtDateBR(s: string | null | undefined) {
  if (!s) return "—";
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
}

/** "Agosto 2026" (com inicial maiúscula) — usado para agrupar os relatórios. */
function mesLabel(d: string | Date | null | undefined): string {
  if (!d) return "Sem data";
  const s = new Date(d).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Card de um relatório gerado. `destaque` é o último — fica aberto e maior;
 * os anteriores vivem colapsados atrás de "Todos", porque a pergunta de quem
 * abre esta tela é quase sempre "cadê o que eu acabei de gerar".
 */
function CardRelatorio({ r, destaque, onCopiar, onExcluir, onEditar, excluindo }: {
  r: {
    id: number; publicToken: string; periodStart: string; periodEnd: string;
    generatedAt: string | Date | null; tier: string;
    modulos: string[] | null; fontes: { rotulo: string; presente: boolean }[] | null;
    contextNotes: string | null;
  };
  destaque?: boolean;
  onCopiar: (url: string) => void;
  onExcluir: (id: number) => void;
  onEditar: (id: number) => void;
  excluindo: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const url = `${window.location.origin}/r/${r.publicToken}`;
  const semFonte = r.fontes?.filter((f) => !f.presente) ?? [];

  return (
    <div className={`anim-card p-3.5 border rounded-xl bg-card ${destaque ? "border-primary/40 bg-primary/[0.03]" : "border-border"}`}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <span className={`flex shrink-0 items-center justify-center rounded-lg ${destaque ? "h-10 w-10 bg-primary/15 text-primary" : "h-9 w-9 bg-primary/10 text-primary"}`}>
            <FileText className={destaque ? "h-4.5 w-4.5" : "h-4 w-4"} />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`font-bold text-foreground ${destaque ? "text-[15px]" : "text-sm"}`}>
                {fmtDateBR(r.periodStart)} — {fmtDateBR(r.periodEnd)}
              </span>
              {destaque && <Badge className="text-[10px] font-semibold">Mais recente</Badge>}
            </div>
            <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 mt-0.5 flex-wrap">
              <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {r.generatedAt ? new Date(r.generatedAt).toLocaleDateString("pt-BR") : "—"}</span>
              <span className="text-border/70">·</span>
              {/* Relatório antigo não tem módulos — mostra o tier dele. */}
              <Badge variant="secondary" className="text-[10px] font-medium">{r.modulos?.length ? `${r.modulos.length} módulos` : r.tier}</Badge>
            </div>
            {r.modulos?.length ? (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {r.modulos.map((m) => (
                  <span key={m} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{MODULO_LABEL[m] ?? m}</span>
                ))}
              </div>
            ) : null}
            {/* Fonte que faltou fica registrada: seis meses depois, um
                relatório magro precisa dizer que era magro. */}
            {semFonte.length > 0 && (
              <div className="text-[10px] text-amber-600/80 mt-1">
                sem: {semFonte.map((f) => f.rotulo).join(", ")}
              </div>
            )}
          </div>
        </div>
        <div className="flex gap-1.5 shrink-0">
          <Button size="sm" variant="outline" onClick={() => onCopiar(url)}>
            <Link2 className="w-3.5 h-3.5 mr-1.5" /> Copiar link
          </Button>
          <Button size="sm" variant="outline" onClick={() => window.open(url, "_blank")} title="Abrir relatório">
            <ExternalLink className="w-3.5 h-3.5" />
          </Button>
          <Button size="sm" variant="outline" onClick={() => onEditar(r.id)} title="Editar os textos">
            <Pencil className="w-3.5 h-3.5" />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirmando((v) => !v)} disabled={excluindo}
            title="Excluir relatório"
            className="text-muted-foreground hover:text-destructive">
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Confirmação inline. Excluir aqui derruba o link público junto — e não
          dá para saber se ele já foi enviado a alguém. */}
      {confirmando && (
        <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/[0.05] p-3">
          <p className="text-xs text-foreground">
            Excluir de vez? <strong>O link público para de funcionar</strong> — se ele já foi enviado ao cliente, vai virar "relatório não encontrado".
          </p>
          <div className="flex gap-2 mt-2">
            <Button size="sm" variant="destructive" disabled={excluindo} onClick={() => onExcluir(r.id)}>
              {excluindo ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Excluindo…</> : "Excluir"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmando(false)}>Cancelar</Button>
          </div>
        </div>
      )}

      {r.contextNotes && (
        <>
          <button
            onClick={() => setAberto((v) => !v)}
            className="mt-2.5 inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            {aberto ? "Ver menos" : "Ver mais"}
            <ChevronDown className={`w-3 h-3 transition-transform ${aberto ? "rotate-180" : ""}`} />
          </button>
          {aberto && (
            <div className="mt-2 rounded-lg border border-border bg-muted/40 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1">Contexto informado na geração</p>
              <p className="text-xs text-foreground/80 whitespace-pre-wrap leading-relaxed">{r.contextNotes}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function Reports() {
  const { selectedAccountId: activeAccountId, accounts } = useSelectedAccount();
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const accountId = selectedAccountId ?? activeAccountId ?? null;

  const [periodStart, setPeriodStart] = useState(daysAgoStr(14));
  const [periodEnd, setPeriodEnd] = useState(todayStr());
  const [contextNotes, setContextNotes] = useState("");
  const [lastGeneratedUrl, setLastGeneratedUrl] = useState<string | null>(null);
  const [modulos, setModulos] = useState<string[]>(["midia", "campanhas"]);
  const [verTodos, setVerTodos] = useState(false);
  const [excluindoId, setExcluindoId] = useState<number | null>(null);
  const [editandoId, setEditandoId] = useState<number | null>(null);

  // Deep-link da seção Site: /reports?modulos=site,pagespeed,... já marca os
  // módulos. O gerador mora aqui; a seção Site apenas pré-configura.
  const [jaLeuUrl, setJaLeuUrl] = useState(false);
  useEffect(() => {
    if (jaLeuUrl) return;
    const p = new URLSearchParams(window.location.search);
    const m = p.get("modulos");
    if (m) {
      const pedidos = m.split(",").filter((x) => ORDEM_MODULOS.includes(x));
      if (pedidos.length) setModulos(pedidos);
    }
    setJaLeuUrl(true);
  }, [jaLeuUrl]);

  const listQuery = trpc.reports.listSnapshots.useQuery(
    { accountId: accountId ?? 0 },
    { enabled: !!accountId }
  );

  // O que ESTE cliente tem, no período escolhido. Sem LLM — é só leitura.
  const opcoesQuery = trpc.reports.opcoes.useQuery(
    { accountId: accountId ?? 0, inicio: periodStart, fim: periodEnd },
    { enabled: !!accountId }
  );
  const fontes = opcoesQuery.data?.fontes ?? [];
  const temFonte = (chave: string) => fontes.find((f) => f.chave === chave);

  const generateMutation = trpc.reports.gerarModular.useMutation({
    onSuccess: (data) => {
      const url = `${window.location.origin}/r/${data.publicToken}`;
      setLastGeneratedUrl(url);
      toast.success("Relatório gerado!");
      listQuery.refetch();
    },
    onError: (err) => {
      toast.error("Erro ao gerar relatório: " + err.message);
    },
  });

  const excluirMutation = trpc.reports.excluir.useMutation({
    onSuccess: () => {
      toast.success("Relatório excluído");
      listQuery.refetch();
    },
    onError: (err) => toast.error("Não consegui excluir: " + err.message),
    onSettled: () => setExcluindoId(null),
  });

  function excluir(id: number) {
    if (!accountId) return;
    setExcluindoId(id);
    excluirMutation.mutate({ accountId, id });
  }

  const toggle = (m: string) =>
    setModulos((atual) => (atual.includes(m) ? atual.filter((x) => x !== m) : [...atual, m]));

  // Módulos marcados cujo dado não existe: viram aviso, não bloqueio.
  const marcadosSemDado = modulos
    .map((m) => ({ m, f: temFonte(FONTE_DO_MODULO[m] ?? m) }))
    .filter((x) => x.f && !x.f.presente);

  function handleGenerate() {
    if (!accountId) {
      toast.error("Selecione uma conta primeiro");
      return;
    }
    if (modulos.length === 0) {
      toast.error("Escolha pelo menos um módulo");
      return;
    }
    setLastGeneratedUrl(null);
    generateMutation.mutate({
      accountId,
      inicio: periodStart,
      fim: periodEnd,
      modulos: modulos as never[],
      notas: contextNotes.trim() || undefined,
    });
  }

  function copyLink(url: string) {
    navigator.clipboard.writeText(url);
    toast.success("Link copiado!");
  }

  // Só o último aparece por padrão. A pergunta de quem abre esta tela é quase
  // sempre "cadê o que eu acabei de gerar" — o histórico fica atrás de "Todos".
  const reports = listQuery.data ?? [];
  const ultimo = reports[0] ?? null;
  const anteriores = reports.slice(1);

  return (
    <MetaDashboardLayout>
      <div className="max-w-3xl mx-auto py-6 space-y-6">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <FileText className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-xl font-extrabold text-foreground">Relatórios</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Gere relatórios de performance com link público pra enviar ao cliente.
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Gerar novo relatório</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Conta</Label>
              <Select value={accountId ? String(accountId) : undefined} onValueChange={(v) => setSelectedAccountId(Number(v))}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Selecione a conta" />
                </SelectTrigger>
                <SelectContent>
                  {accounts?.map((a: any) => (
                    <SelectItem key={a.id} value={String(a.id)}>{a.accountName ?? a.accountId}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5 flex-wrap gap-2">
                <Label className="mb-0">Período</Label>
                <div className="flex gap-1">
                  {[7, 14, 30].map((d) => {
                    const ativo = periodStart === daysAgoStr(d) && periodEnd === todayStr();
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => { setPeriodStart(daysAgoStr(d)); setPeriodEnd(todayStr()); }}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors ${ativo ? "border-primary/50 bg-primary/[0.08] text-primary" : "border-border text-muted-foreground hover:bg-accent/30"}`}
                      >
                        {d} dias
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">De</span>
                  <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} className="mt-0.5" />
                </div>
                <div>
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Até</span>
                  <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} className="mt-0.5" />
                </div>
              </div>
            </div>

            {/* Módulos — o que entra no relatório. A etiqueta "sem dado" vem do
                servidor e é por cliente: marcar mesmo assim é permitido, a seção
                só é omitida e a ausência vira pendência declarada. */}
            <div>
              <Label>O que incluir</Label>
              {(opcoesQuery.data?.presets ?? []).length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap mt-1.5 mb-2">
                  <span className="text-[11px] text-muted-foreground">Atalhos:</span>
                  {(opcoesQuery.data?.presets ?? []).map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      title={p.descricao}
                      onClick={() => setModulos(p.modulos)}
                      className="px-2.5 py-1 rounded-lg border border-border text-[11px] font-medium text-muted-foreground hover:border-primary/30 hover:text-foreground hover:bg-accent/30 transition-colors"
                    >
                      {p.nome}
                    </button>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-1.5">
                {ORDEM_MODULOS.map((m) => {
                  const f = temFonte(FONTE_DO_MODULO[m] ?? m);
                  const semDado = f && !f.presente;
                  const marcado = modulos.includes(m);
                  const Icon = MODULO_ICON[m] ?? FileText;
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => toggle(m)}
                      title={semDado ? f?.porque : undefined}
                      className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-all ${
                        marcado ? "border-primary/50 bg-primary/[0.06] shadow-sm" : "border-border hover:border-primary/30 hover:bg-accent/30"
                      }`}
                    >
                      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors ${marcado ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={`block text-xs font-semibold truncate ${semDado ? "text-muted-foreground" : "text-foreground"}`}>{MODULO_LABEL[m]}</span>
                        {semDado && <span className="block text-[10px] text-amber-600 leading-tight">sem dado</span>}
                      </span>
                      <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-all ${marcado ? "border-primary bg-primary text-white" : "border-border text-transparent"}`}>
                        <Check className="h-2.5 w-2.5" strokeWidth={3} />
                      </span>
                    </button>
                  );
                })}
              </div>
              {opcoesQuery.isLoading && (
                <p className="text-xs text-muted-foreground mt-1.5">Verificando o que este cliente tem…</p>
              )}
            </div>

            {/* Prévia honesta: o que sai e o que não sai, antes de gastar IA. */}
            {marcadosSemDado.length > 0 && (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
                <p className="font-medium text-amber-700 mb-1">
                  {marcadosSemDado.length === 1 ? "Uma seção marcada será omitida:" : `${marcadosSemDado.length} seções marcadas serão omitidas:`}
                </p>
                <ul className="text-muted-foreground space-y-0.5">
                  {marcadosSemDado.map((x) => (
                    <li key={x.m}>· <strong>{MODULO_LABEL[x.m]}</strong> — {x.f?.porque}</li>
                  ))}
                </ul>
                <p className="text-muted-foreground mt-1.5">
                  O relatório é gerado assim mesmo, declarando isso como pendência.
                </p>
              </div>
            )}

            <div>
              <Label>Contexto adicional (opcional)</Label>
              <Textarea
                placeholder='Ex: "Cliente lançou coleção nova dia 5", "Pausamos campanha por decisão do cliente"...'
                value={contextNotes}
                onChange={(e) => setContextNotes(e.target.value)}
                className="mt-1 min-h-[70px]"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Ajuda a IA a interpretar números fora do padrão sem inventar contexto.
              </p>
            </div>

            <Button size="lg" onClick={handleGenerate} disabled={generateMutation.isPending || !accountId} className="w-full sm:w-auto">
              {generateMutation.isPending ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Gerando...</>
              ) : (
                <><Sparkles className="w-4 h-4 mr-2" /> Gerar relatório</>
              )}
            </Button>

            {lastGeneratedUrl && (
              <div className="flex items-center justify-between gap-3 flex-wrap p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.06]">
                <div className="flex items-center gap-2 text-sm min-w-0">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span className="break-all text-foreground">{lastGeneratedUrl}</span>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button size="sm" variant="outline" onClick={() => copyLink(lastGeneratedUrl)}>
                    <Copy className="w-3.5 h-3.5 mr-1.5" /> Copiar
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => window.open(lastGeneratedUrl, "_blank")}>
                    <ExternalLink className="w-3.5 h-3.5 mr-1.5" /> Abrir
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              Relatórios gerados
              {reports.length > 0 && <span className="text-xs font-medium text-muted-foreground">· {reports.length}</span>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {listQuery.isLoading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
              </div>
            )}
            {!listQuery.isLoading && reports.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhum relatório gerado ainda pra essa conta.</p>
            )}

            {ultimo && (
              <CardRelatorio r={ultimo} destaque onCopiar={copyLink} onExcluir={excluir}
                onEditar={setEditandoId} excluindo={excluindoId === ultimo.id} />
            )}

            {anteriores.length > 0 && (
              <>
                <button
                  onClick={() => setVerTodos((v) => !v)}
                  className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:opacity-70 transition-opacity"
                >
                  Todos
                  <span className="text-muted-foreground font-medium">· {anteriores.length} anteriores</span>
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${verTodos ? "rotate-180" : ""}`} />
                </button>

                {verTodos && (
                  <div className="grid gap-2.5 mt-3">
                    {anteriores.map((r, i) => {
                      const mes = mesLabel(r.generatedAt);
                      const novoMes = i === 0 || mes !== mesLabel(anteriores[i - 1].generatedAt);
                      return (
                        <Fragment key={r.id}>
                          {novoMes && (
                            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground/60 pt-1 first:pt-0">{mes}</p>
                          )}
                          <CardRelatorio r={r} onCopiar={copyLink} onExcluir={excluir}
                            onEditar={setEditandoId} excluindo={excluindoId === r.id} />
                        </Fragment>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {accountId && (
        <EditarRelatorio
          accountId={accountId}
          reportId={editandoId}
          aberto={editandoId !== null}
          onFechar={() => setEditandoId(null)}
          onSalvo={() => listQuery.refetch()}
        />
      )}
    </MetaDashboardLayout>
  );
}
