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
import { FileText, Link2, Copy, Loader2, CheckCircle2, Clock, ExternalLink, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

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

export default function Reports() {
  const { selectedAccountId: activeAccountId, accounts } = useSelectedAccount();
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const accountId = selectedAccountId ?? activeAccountId ?? null;

  const [periodStart, setPeriodStart] = useState(daysAgoStr(14));
  const [periodEnd, setPeriodEnd] = useState(todayStr());
  const [contextNotes, setContextNotes] = useState("");
  const [lastGeneratedUrl, setLastGeneratedUrl] = useState<string | null>(null);
  const [modulos, setModulos] = useState<string[]>(["midia", "campanhas"]);

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

  return (
    <MetaDashboardLayout>
      <div className="max-w-3xl mx-auto py-6 space-y-6">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <FileText className="w-5 h-5" /> Relatórios
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gere relatórios de performance com link público pra enviar ao cliente.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Gerar novo relatório</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
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
                <Label>Atalhos</Label>
                <div className="flex gap-1.5 flex-wrap mt-1.5">
                  {(opcoesQuery.data?.presets ?? []).map((p) => (
                    <button
                      key={p.id}
                      title={p.descricao}
                      onClick={() => setModulos(p.modulos)}
                      className="px-2.5 py-1 rounded-md border border-border text-xs hover:bg-accent/40 transition-colors"
                    >
                      {p.nome}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Período — início</Label>
                <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>Período — fim</Label>
                <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} className="mt-1" />
              </div>
            </div>

            {/* Módulos — o que entra no relatório. A etiqueta "sem dado" vem do
                servidor e é por cliente: marcar mesmo assim é permitido, a seção
                só é omitida e a ausência vira pendência declarada. */}
            <div>
              <Label>O que incluir</Label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 mt-1.5">
                {ORDEM_MODULOS.map((m) => {
                  const f = temFonte(FONTE_DO_MODULO[m] ?? m);
                  const semDado = f && !f.presente;
                  const marcado = modulos.includes(m);
                  return (
                    <label
                      key={m}
                      title={semDado ? f?.porque : undefined}
                      className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs cursor-pointer transition-colors ${
                        marcado ? "border-primary/40 bg-primary/5" : "border-border hover:bg-accent/30"
                      }`}
                    >
                      <input type="checkbox" checked={marcado} onChange={() => toggle(m)} className="cursor-pointer" />
                      <span className={semDado ? "text-muted-foreground" : ""}>{MODULO_LABEL[m]}</span>
                      {semDado && <span className="ml-auto text-[10px] text-amber-600 flex-shrink-0">sem dado</span>}
                    </label>
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

            <Button onClick={handleGenerate} disabled={generateMutation.isPending || !accountId}>
              {generateMutation.isPending ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Gerando...</>
              ) : (
                <><Sparkles className="w-4 h-4 mr-2" /> Gerar relatório</>
              )}
            </Button>

            {lastGeneratedUrl && (
              <div className="flex items-center justify-between gap-3 flex-wrap p-3 rounded-md border border-border bg-muted/30">
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  <span className="break-all">{lastGeneratedUrl}</span>
                </div>
                <div className="flex gap-2">
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
            <CardTitle className="text-base">Relatórios gerados</CardTitle>
          </CardHeader>
          <CardContent>
            {listQuery.isLoading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
              </div>
            )}
            {!listQuery.isLoading && (listQuery.data?.length ?? 0) === 0 && (
              <p className="text-sm text-muted-foreground">Nenhum relatório gerado ainda pra essa conta.</p>
            )}
            <div className="grid gap-2.5">
              {listQuery.data?.map((r) => {
                const url = `${window.location.origin}/r/${r.publicToken}`;
                return (
                  <div key={r.id} className="flex items-center justify-between gap-3 flex-wrap p-3 border border-border rounded-md">
                    <div className="flex items-center gap-2.5">
                      {/* Relatório antigo não tem módulos — mostra o tier dele. */}
                      <Badge variant="secondary">{r.modulos?.length ? `${r.modulos.length} módulos` : r.tier}</Badge>
                      <div>
                        <div className="text-sm font-semibold">
                          {fmtDateBR(r.periodStart)} — {fmtDateBR(r.periodEnd)}
                        </div>
                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="w-3 h-3" /> gerado em {r.generatedAt ? new Date(r.generatedAt).toLocaleDateString("pt-BR") : "—"}
                        </div>
                        {r.modulos?.length ? (
                          <div className="text-[11px] text-muted-foreground mt-0.5">
                            {r.modulos.map((m) => MODULO_LABEL[m] ?? m).join(" · ")}
                          </div>
                        ) : null}
                        {/* Fonte que faltou fica registrada: seis meses depois,
                            um relatório magro precisa dizer que era magro. */}
                        {r.fontes?.some((f) => !f.presente) && (
                          <div className="text-[11px] text-amber-600/80 mt-0.5">
                            sem: {r.fontes.filter((f) => !f.presente).map((f) => f.rotulo).join(", ")}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="ghost" onClick={() => copyLink(url)}>
                        <Link2 className="w-3.5 h-3.5 mr-1.5" /> Copiar link
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => window.open(url, "_blank")}>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </MetaDashboardLayout>
  );
}
