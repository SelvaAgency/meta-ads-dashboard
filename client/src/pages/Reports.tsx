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
import { useState } from "react";
import { toast } from "sonner";

const TIERS = [
  { value: "CURTO", label: "Curto", available: true },
  { value: "MEDIO", label: "Médio (em breve)", available: false },
  { value: "COMPLETO", label: "Completo (em breve)", available: false },
];

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
  const [tier, setTier] = useState("CURTO");
  const [contextNotes, setContextNotes] = useState("");
  const [lastGeneratedUrl, setLastGeneratedUrl] = useState<string | null>(null);

  const listQuery = trpc.reports.listSnapshots.useQuery(
    { accountId: accountId ?? 0 },
    { enabled: !!accountId }
  );

  const generateMutation = trpc.reports.generate.useMutation({
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

  function handleGenerate() {
    if (!accountId) {
      toast.error("Selecione uma conta primeiro");
      return;
    }
    setLastGeneratedUrl(null);
    generateMutation.mutate({
      accountId,
      periodStart,
      periodEnd,
      tier: tier as "CURTO" | "MEDIO" | "COMPLETO",
      contextNotes: contextNotes.trim() || undefined,
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
                <Label>Nível</Label>
                <Select value={tier} onValueChange={setTier}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIERS.map((t) => (
                      <SelectItem key={t.value} value={t.value} disabled={!t.available}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                      <Badge variant="secondary">{r.tier}</Badge>
                      <div>
                        <div className="text-sm font-semibold">
                          {fmtDateBR(r.periodStart)} — {fmtDateBR(r.periodEnd)}
                        </div>
                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="w-3 h-3" /> gerado em {r.generatedAt ? new Date(r.generatedAt).toLocaleDateString("pt-BR") : "—"}
                        </div>
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
