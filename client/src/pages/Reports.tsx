import { MetaDashboardLayout } from "@/components/MetaDashboardLayout";
import { useSelectedAccount } from "@/hooks/useSelectedAccount";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Calendar,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  FileText,
  Link2,
  Loader2,
  Play,
  Plus,
  Trash2,
  Zap,
  ChevronDown,
  ChevronUp,
  Info,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

export default function Reports() {
  const [, navigate] = useLocation();
  const [reportContent, setReportContent] = useState<string | null>(null);
  const [reportType, setReportType] = useState<"DAILY" | "WEEKLY" | null>(null);
  const [generatingFreq, setGeneratingFreq] = useState<"DAILY" | "WEEKLY" | null>(null);
  const [copied, setCopied] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const { selectedAccountId, accounts } = useSelectedAccount();
  const utils = trpc.useUtils();

  const { data: reports, isLoading } = trpc.reports.list.useQuery();

  const createReport = trpc.reports.create.useMutation({
    onSuccess: () => {
      utils.reports.list.invalidate();
      toast.success("Relatório agendado com sucesso!");
    },
    onError: (err) => toast.error(err.message),
  });

  const toggleReport = trpc.reports.toggle.useMutation({
    onSuccess: () => utils.reports.list.invalidate(),
  });

  const deleteReport = trpc.reports.delete.useMutation({
    onSuccess: () => {
      utils.reports.list.invalidate();
      toast.success("Relatório removido.");
    },
  });

  const runNow = trpc.reports.runNow.useMutation({
    onSuccess: (data) => {
      setReportContent(data.report);
      setGeneratingFreq(null);
      toast.success("Relatório gerado com sucesso!");
    },
    onError: () => {
      setGeneratingFreq(null);
      toast.error("Erro ao gerar relatório. Verifique se há dados sincronizados.");
    },
  });

  const handleGenerate = (frequency: "DAILY" | "WEEKLY") => {
    if (!selectedAccountId) return;
    setReportContent(null);
    setReportType(frequency);
    setGeneratingFreq(frequency);
    runNow.mutate({ accountId: selectedAccountId, frequency });
  };

  const handleCopy = async () => {
    if (!reportContent) return;
    await navigator.clipboard.writeText(reportContent);
    setCopied(true);
    toast.success("Relatório copiado para a área de transferência!");
    setTimeout(() => setCopied(false), 2500);
  };

  const accountSchedules = reports?.filter((r) => r.accountId === selectedAccountId) ?? [];
  const hasDailySchedule = accountSchedules.some((r) => r.frequency === "DAILY");
  const hasWeeklySchedule = accountSchedules.some((r) => r.frequency === "WEEKLY");

  if (!accounts || accounts.length === 0) {
    return (
      <MetaDashboardLayout title="Relatórios">
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
            <Link2 className="w-7 h-7 text-primary" />
          </div>
          <h2 className="text-xl font-semibold text-foreground mb-2">Nenhuma conta conectada</h2>
          <Button onClick={() => navigate("/connect")} className="gap-2 mt-2">
            <Zap className="w-4 h-4" />
            Conectar conta
          </Button>
        </div>
      </MetaDashboardLayout>
    );
  }

  return (
    <MetaDashboardLayout title="Relatórios">
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-xl font-bold text-foreground">Relatórios de Performance</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Formato de agência — prontos para copiar e enviar ao cliente
          </p>
        </div>

        {/* Generate Now Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Daily */}
          <Card className="border border-border bg-card hover:border-blue-500/40 transition-colors">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <CalendarDays className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <CardTitle className="text-base">Relatório Diário</CardTitle>
                  <p className="text-xs text-muted-foreground">Dados de ontem</p>
                </div>
                {hasDailySchedule && (
                  <Badge variant="outline" className="ml-auto text-xs text-blue-400 border-blue-400/30">
                    Agendado
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-xs text-muted-foreground space-y-1">
                <p>• Análise por campanha com métricas do objetivo</p>
                <p>• Resumo estratégico consolidado</p>
                <p>• Recomendações de curto prazo</p>
              </div>
              <div className="flex gap-2">
                <Button
                  className="flex-1"
                  onClick={() => handleGenerate("DAILY")}
                  disabled={runNow.isPending}
                >
                  {generatingFreq === "DAILY" ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Gerando...</>
                  ) : (
                    <><Play className="w-4 h-4 mr-2" /> Gerar Agora</>
                  )}
                </Button>
                {!hasDailySchedule ? (
                  <Button
                    variant="outline"
                    size="icon"
                    title="Agendar diário às 08h"
                    onClick={() =>
                      selectedAccountId &&
                      createReport.mutate({ accountId: selectedAccountId, frequency: "DAILY" })
                    }
                    disabled={createReport.isPending}
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>

          {/* Weekly */}
          <Card className="border border-border bg-card hover:border-purple-500/40 transition-colors">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                  <Calendar className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <CardTitle className="text-base">Relatório Semanal</CardTitle>
                  <p className="text-xs text-muted-foreground">Últimos 7 dias</p>
                </div>
                {hasWeeklySchedule && (
                  <Badge variant="outline" className="ml-auto text-xs text-purple-400 border-purple-400/30">
                    Agendado
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-xs text-muted-foreground space-y-1">
                <p>• Evolução de métricas ao longo da semana</p>
                <p>• Comparativo entre campanhas</p>
                <p>• Insights estratégicos e próximos passos</p>
              </div>
              <div className="flex gap-2">
                <Button
                  className="flex-1"
                  variant="outline"
                  onClick={() => handleGenerate("WEEKLY")}
                  disabled={runNow.isPending}
                >
                  {generatingFreq === "WEEKLY" ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Gerando...</>
                  ) : (
                    <><Play className="w-4 h-4 mr-2" /> Gerar Agora</>
                  )}
                </Button>
                {!hasWeeklySchedule ? (
                  <Button
                    variant="outline"
                    size="icon"
                    title="Agendar semanal às segundas 08h"
                    onClick={() =>
                      selectedAccountId &&
                      createReport.mutate({ accountId: selectedAccountId, frequency: "WEEKLY" })
                    }
                    disabled={createReport.isPending}
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Generated Report Output */}
        {(generatingFreq !== null || reportContent) && (
          <Card className="border border-primary/30 bg-card">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="w-4 h-4 text-primary" />
                  Relatório {reportType === "DAILY" ? "Diário" : "Semanal"} Gerado
                </CardTitle>
                {reportContent && (
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      onClick={handleCopy}
                      className="gap-2 h-8"
                    >
                      {copied ? (
                        <><Check className="w-3.5 h-3.5" /> Copiado!</>
                      ) : (
                        <><Copy className="w-3.5 h-3.5" /> Copiar Relatório</>
                      )}
                    </Button>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {generatingFreq !== null ? (
                <div className="flex flex-col items-center justify-center py-16 gap-4 text-muted-foreground">
                  <div className="relative">
                    <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                      <FileText className="w-7 h-7 text-primary" />
                    </div>
                    <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                    </div>
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium text-foreground">Analisando dados e gerando relatório...</p>
                    <p className="text-xs opacity-60 mt-1">A IA está processando as campanhas. Isso pode levar até 30 segundos.</p>
                  </div>
                </div>
              ) : reportContent ? (
                <div className="relative">
                  <pre className="whitespace-pre-wrap font-mono text-sm text-foreground bg-muted/20 rounded-lg p-5 max-h-[680px] overflow-y-auto leading-relaxed border border-border/40 select-all">
                    {reportContent}
                  </pre>
                  <div className="mt-3 flex items-center justify-between">
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <Info className="w-3.5 h-3.5" />
                      Clique no texto para selecionar tudo, ou use o botão Copiar
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleCopy}
                      className="gap-2 h-7 text-xs"
                    >
                      {copied ? (
                        <><Check className="w-3 h-3 text-green-400" /> Copiado!</>
                      ) : (
                        <><Copy className="w-3 h-3" /> Copiar</>
                      )}
                    </Button>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        )}

        {/* Scheduled Reports */}
        <Card className="border border-border bg-card">
          <CardHeader className="pb-3">
            <button
              className="flex items-center justify-between w-full"
              onClick={() => setShowHistory(!showHistory)}
            >
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-primary" />
                <CardTitle className="text-base">Agendamentos Automáticos</CardTitle>
                {accountSchedules.length > 0 && (
                  <Badge variant="outline" className="text-xs">
                    {accountSchedules.filter((r) => r.isActive).length} ativo(s)
                  </Badge>
                )}
              </div>
              {showHistory ? (
                <ChevronUp className="w-4 h-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              )}
            </button>
            <p className="text-sm text-muted-foreground text-left">
              Relatórios enviados por notificação automaticamente
            </p>
          </CardHeader>
          {showHistory && (
            <CardContent className="space-y-3">
              {isLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground py-4">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">Carregando agendamentos...</span>
                </div>
              ) : accountSchedules.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 gap-2 text-muted-foreground">
                  <Clock className="w-8 h-8 opacity-30" />
                  <p className="text-sm">Nenhum agendamento configurado</p>
                  <p className="text-xs opacity-60">
                    Clique no botão <strong>+</strong> nos cards acima para agendar
                  </p>
                </div>
              ) : (
                accountSchedules.map((schedule) => (
                  <div
                    key={schedule.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/20 border border-border/40"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-9 h-9 rounded-md flex items-center justify-center ${
                          schedule.frequency === "DAILY" ? "bg-blue-500/10" : "bg-purple-500/10"
                        }`}
                      >
                        {schedule.frequency === "DAILY" ? (
                          <CalendarDays className="w-4 h-4 text-blue-400" />
                        ) : (
                          <Calendar className="w-4 h-4 text-purple-400" />
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-medium">
                          {schedule.frequency === "DAILY" ? "Diário — 08h" : "Semanal — Segunda às 08h"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Próximo envio:{" "}
                          {schedule.nextRunAt
                            ? new Date(schedule.nextRunAt).toLocaleString("pt-BR")
                            : "—"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={schedule.isActive ? "default" : "secondary"}
                        className="text-xs"
                      >
                        {schedule.isActive ? "Ativo" : "Pausado"}
                      </Badge>
                      <Switch
                        checked={schedule.isActive ?? false}
                        onCheckedChange={(checked) =>
                          toggleReport.mutate({ reportId: schedule.id, isActive: checked })
                        }
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        className="w-8 h-8 text-muted-foreground hover:text-destructive"
                        onClick={() => deleteReport.mutate({ reportId: schedule.id })}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          )}
        </Card>

        {/* Format Reference */}
        <Card className="border-border/40 bg-accent/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              Formato padrão de agência
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Os relatórios são gerados em texto puro com emojis e separadores — prontos para copiar e enviar no WhatsApp, e-mail ou apresentar ao cliente. Cada campanha é analisada individualmente com métricas relevantes ao seu objetivo.
            </p>
            <Separator className="opacity-30" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <p className="text-xs font-semibold text-foreground">Estrutura do relatório</p>
                <div className="text-xs text-muted-foreground space-y-0.5">
                  <p>📊 Cabeçalho com cliente, período e objetivo</p>
                  <p>🔵 Bloco por campanha com métricas do objetivo</p>
                  <p>📌 Análise com insights específicos por campanha</p>
                  <p>🎯 Resumo estratégico consolidado</p>
                  <p>🧭 Recomendações e próximos passos</p>
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold text-foreground">Métricas por objetivo</p>
                <div className="text-xs text-muted-foreground space-y-0.5">
                  <p>🛒 Vendas: ROAS, CPA, conversões, valor</p>
                  <p>📋 Leads: CPL, leads gerados, CTR, CPC</p>
                  <p>💬 Mensagens: custo/mensagem, CTR, CPM</p>
                  <p>🌐 Tráfego: cliques, CTR, CPC, CPM</p>
                  <p>📣 Awareness: alcance, frequência, CPM</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </MetaDashboardLayout>
  );
}
