import { MetaDashboardLayout } from "@/components/MetaDashboardLayout";
import { useSelectedAccount } from "@/hooks/useSelectedAccount";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Calendar,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  FileText,
  Info,
  Link2,
  Loader2,
  Play,
  Settings2,
  Trash2,
  Zap,
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

const DAYS_OF_WEEK = [
  { value: 0, label: "Domingo" },
  { value: 1, label: "Segunda-feira" },
  { value: 2, label: "Terça-feira" },
  { value: 3, label: "Quarta-feira" },
  { value: 4, label: "Quinta-feira" },
  { value: 5, label: "Sexta-feira" },
  { value: 6, label: "Sábado" },
];

function computeNextRun(
  frequency: "DAILY" | "WEEKLY",
  h: number,
  m: number,
  d: number
): Date {
  const now = new Date();
  const next = new Date(now);
  next.setHours(h, m, 0, 0);
  if (frequency === "DAILY") {
    if (next <= now) next.setDate(next.getDate() + 1);
  } else {
    const diff = (d - now.getDay() + 7) % 7;
    next.setDate(now.getDate() + (diff === 0 ? 7 : diff));
    next.setHours(h, m, 0, 0);
  }
  return next;
}

interface ScheduleConfigProps {
  schedule: {
    id: number;
    frequency: string;
    isActive: boolean | null;
    scheduleHour: number;
    scheduleMinute: number;
    scheduleDay: number;
    nextRunAt: Date | null;
  } | null;
  accountId: number;
  onSave: (params: {
    accountId: number;
    frequency: "DAILY" | "WEEKLY";
    scheduleHour: number;
    scheduleMinute: number;
    scheduleDay: number;
  }) => void;
  onToggle: (reportId: number, isActive: boolean) => void;
  onDelete: (reportId: number) => void;
  isSaving: boolean;
}

function ScheduleConfig({
  schedule,
  accountId,
  onSave,
  onToggle,
  onDelete,
  isSaving,
}: ScheduleConfigProps) {
  const [expanded, setExpanded] = useState(false);
  const [frequency, setFrequency] = useState<"DAILY" | "WEEKLY">(
    (schedule?.frequency as "DAILY" | "WEEKLY") ?? "DAILY"
  );
  const [hour, setHour] = useState(schedule?.scheduleHour ?? 8);
  const [minute, setMinute] = useState(schedule?.scheduleMinute ?? 0);
  const [day, setDay] = useState(schedule?.scheduleDay ?? 1);

  const nextRun = schedule?.nextRunAt
    ? new Date(schedule.nextRunAt).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : computeNextRun(frequency, hour, minute, day).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });

  return (
    <Card className="border border-border bg-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Clock className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">Agendamento de Relatório</CardTitle>
              {schedule ? (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {schedule.frequency === "DAILY" ? "Diário" : "Semanal"} —{" "}
                  {String(schedule.scheduleHour).padStart(2, "0")}:
                  {String(schedule.scheduleMinute).padStart(2, "0")}h
                  {schedule.frequency === "WEEKLY"
                    ? ` (${DAYS_OF_WEEK.find((d) => d.value === schedule.scheduleDay)?.label ?? "Segunda-feira"})`
                    : ""}
                  {" · "}Próximo: {nextRun}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground mt-0.5">Sem agendamento configurado para esta conta</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {schedule ? (
              <>
                <Badge
                  variant={schedule.isActive ? "default" : "secondary"}
                  className="text-xs hidden sm:inline-flex"
                >
                  {schedule.isActive ? "Ativo" : "Pausado"}
                </Badge>
                <Switch
                  checked={schedule.isActive ?? false}
                  onCheckedChange={(checked) => onToggle(schedule.id, checked)}
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="w-8 h-8 text-muted-foreground hover:text-primary"
                  title="Editar agendamento"
                  onClick={() => setExpanded((v) => !v)}
                >
                  <Settings2 className="w-4 h-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="w-8 h-8 text-muted-foreground hover:text-destructive"
                  title="Remover agendamento"
                  onClick={() => onDelete(schedule.id)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-xs"
                onClick={() => setExpanded((v) => !v)}
              >
                <Clock className="w-3.5 h-3.5" />
                Agendar
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="border-t border-border/40 bg-muted/10 pt-4 space-y-4">
          <p className="text-xs font-semibold text-foreground">
            {schedule ? "Editar agendamento" : "Configurar agendamento"}
          </p>

          {/* Frequency */}
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Frequência</label>
            <div className="flex gap-2">
              <button
                onClick={() => setFrequency("DAILY")}
                className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg border text-xs font-medium transition-colors ${
                  frequency === "DAILY"
                    ? "bg-blue-500/10 border-blue-500/40 text-blue-400"
                    : "border-border/50 text-muted-foreground hover:border-border"
                }`}
              >
                <CalendarDays className="w-3.5 h-3.5" />
                Diário
              </button>
              <button
                onClick={() => setFrequency("WEEKLY")}
                className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg border text-xs font-medium transition-colors ${
                  frequency === "WEEKLY"
                    ? "bg-purple-500/10 border-purple-500/40 text-purple-400"
                    : "border-border/50 text-muted-foreground hover:border-border"
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                Semanal
              </button>
            </div>
          </div>

          {/* Day of week (weekly only) */}
          {frequency === "WEEKLY" && (
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Dia da semana</label>
              <select
                value={day}
                onChange={(e) => setDay(Number(e.target.value))}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                {DAYS_OF_WEEK.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Hour and minute */}
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Horário de envio (Brasília)</label>
            <div className="flex items-center gap-3">
              <div className="flex-1 space-y-1">
                <label className="text-xs text-muted-foreground">Hora</label>
                <select
                  value={hour}
                  onChange={(e) => setHour(Number(e.target.value))}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={i}>
                      {String(i).padStart(2, "0")}h
                    </option>
                  ))}
                </select>
              </div>
              <div className="text-xl font-bold text-muted-foreground mt-4">:</div>
              <div className="flex-1 space-y-1">
                <label className="text-xs text-muted-foreground">Minuto</label>
                <select
                  value={minute}
                  onChange={(e) => setMinute(Number(e.target.value))}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  {Array.from({ length: 60 }, (_, i) => (
                    <option key={i} value={i}>
                      {String(i).padStart(2, "0")}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Preview */}
          <div className="flex items-center gap-2 bg-primary/5 border border-primary/20 rounded-lg px-3 py-2">
            <Info className="w-3.5 h-3.5 text-primary flex-shrink-0" />
            <p className="text-xs text-muted-foreground">
              Próximo envio:{" "}
              <span className="text-foreground font-medium">
                {computeNextRun(frequency, hour, minute, day).toLocaleString("pt-BR", {
                  weekday: "long",
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => setExpanded(false)}
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              className="flex-1"
              disabled={isSaving}
              onClick={() => {
                onSave({
                  accountId,
                  frequency,
                  scheduleHour: hour,
                  scheduleMinute: minute,
                  scheduleDay: day,
                });
                setExpanded(false);
              }}
            >
              {isSaving ? (
                <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Salvando...</>
              ) : (
                <><Check className="w-3.5 h-3.5 mr-1.5" /> Salvar Agendamento</>
              )}
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

export default function Reports() {
  const [, navigate] = useLocation();
  const [reportContent, setReportContent] = useState<string | null>(null);
  const [reportType, setReportType] = useState<"DAILY" | "WEEKLY" | null>(null);
  const [generatingFreq, setGeneratingFreq] = useState<"DAILY" | "WEEKLY" | null>(null);
  const [copied, setCopied] = useState(false);
  const { selectedAccountId, accounts } = useSelectedAccount();
  const utils = trpc.useUtils();

  // Load only reports for the current user (filtered by account in UI)
  const { data: reports, isLoading: reportsLoading } = trpc.reports.list.useQuery();

  const createReport = trpc.reports.create.useMutation({
    onSuccess: () => {
      utils.reports.list.invalidate();
      toast.success("Agendamento salvo com sucesso!");
    },
    onError: (err) => toast.error(err.message),
  });

  const toggleReport = trpc.reports.toggle.useMutation({
    onSuccess: () => utils.reports.list.invalidate(),
  });

  const deleteReport = trpc.reports.delete.useMutation({
    onSuccess: () => {
      utils.reports.list.invalidate();
      toast.success("Agendamento removido.");
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

  // Find the active account object
  const activeAccount = accounts.find((a) => a.id === selectedAccountId);

  // Find the schedule for the currently active account only
  const activeSchedule = reports?.find((r) => r.accountId === selectedAccountId) ?? null;

  return (
    <MetaDashboardLayout title="Relatórios">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-foreground">Relatórios de Performance</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {activeAccount
                ? `Conta: ${activeAccount.accountName ?? activeAccount.accountId}`
                : "Selecione uma conta na sidebar"}
            </p>
          </div>
          {activeSchedule?.isActive && (
            <Badge variant="outline" className="text-xs gap-1.5 py-1 px-2.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              Agendamento ativo
            </Badge>
          )}
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
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-xs text-muted-foreground space-y-1">
                <p>• Análise por campanha com métricas do objetivo</p>
                <p>• Resumo estratégico consolidado</p>
                <p>• Recomendações de curto prazo</p>
              </div>
              <Button
                className="w-full"
                onClick={() => handleGenerate("DAILY")}
                disabled={runNow.isPending || !selectedAccountId}
              >
                {generatingFreq === "DAILY" ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Gerando...</>
                ) : (
                  <><Play className="w-4 h-4 mr-2" /> Gerar Agora</>
                )}
              </Button>
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
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-xs text-muted-foreground space-y-1">
                <p>• Evolução de métricas ao longo da semana</p>
                <p>• Comparativo entre campanhas</p>
                <p>• Insights estratégicos e próximos passos</p>
              </div>
              <Button
                className="w-full"
                variant="outline"
                onClick={() => handleGenerate("WEEKLY")}
                disabled={runNow.isPending || !selectedAccountId}
              >
                {generatingFreq === "WEEKLY" ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Gerando...</>
                ) : (
                  <><Play className="w-4 h-4 mr-2" /> Gerar Agora</>
                )}
              </Button>
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
                  <Button size="sm" onClick={handleCopy} className="gap-2 h-8">
                    {copied ? (
                      <><Check className="w-3.5 h-3.5" /> Copiado!</>
                    ) : (
                      <><Copy className="w-3.5 h-3.5" /> Copiar Relatório</>
                    )}
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {generatingFreq !== null ? (
                <div className="flex flex-col items-center justify-center py-16 gap-4 text-muted-foreground">
                  <div className="relative">
                    <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                      <FileText className="w-7 h-7 text-primary/60" />
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
                    <Button size="sm" variant="outline" onClick={handleCopy} className="gap-2 h-7 text-xs">
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

        {/* Schedule config — only for the active account */}
        {reportsLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground py-4">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Carregando agendamento...</span>
          </div>
        ) : selectedAccountId ? (
          <ScheduleConfig
            key={selectedAccountId}
            schedule={activeSchedule}
            accountId={selectedAccountId}
            onSave={(params) => createReport.mutate(params)}
            onToggle={(reportId, isActive) => toggleReport.mutate({ reportId, isActive })}
            onDelete={(reportId) => deleteReport.mutate({ reportId })}
            isSaving={createReport.isPending}
          />
        ) : null}

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
