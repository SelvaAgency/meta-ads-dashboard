import { MetaDashboardLayout, useSelectedAccount } from "@/components/MetaDashboardLayout";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Calendar,
  CheckCircle2,
  Clock,
  FileText,
  Link2,
  Play,
  Plus,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { Streamdown } from "streamdown";

export default function Reports() {
  const [, navigate] = useLocation();
  const [frequency, setFrequency] = useState<"DAILY" | "WEEKLY">("WEEKLY");
  const [reportContent, setReportContent] = useState<string | null>(null);
  const [showReport, setShowReport] = useState(false);
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
      setShowReport(true);
      toast.success("Relatório gerado com sucesso!");
    },
    onError: () => toast.error("Erro ao gerar relatório."),
  });

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
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">Relatórios Automatizados</h1>
            <p className="text-sm text-muted-foreground">
              Resumos de performance diários e semanais gerados por IA
            </p>
          </div>
        </div>

        {/* Create new report */}
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Plus className="w-4 h-4 text-primary" />
              Agendar Novo Relatório
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <Select value={frequency} onValueChange={(v) => setFrequency(v as any)}>
                <SelectTrigger className="w-40 h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DAILY">Diário (8h)</SelectItem>
                  <SelectItem value="WEEKLY">Semanal (Seg 8h)</SelectItem>
                </SelectContent>
              </Select>
              <Button
                size="sm"
                onClick={() =>
                  selectedAccountId &&
                  createReport.mutate({ accountId: selectedAccountId, frequency })
                }
                disabled={createReport.isPending || !selectedAccountId}
                className="gap-2"
              >
                <Calendar className="w-3.5 h-3.5" />
                {createReport.isPending ? "Agendando..." : "Agendar"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  selectedAccountId &&
                  runNow.mutate({ accountId: selectedAccountId, frequency })
                }
                disabled={runNow.isPending || !selectedAccountId}
                className="gap-2"
              >
                <Play className={`w-3.5 h-3.5 ${runNow.isPending ? "animate-pulse" : ""}`} />
                {runNow.isPending ? "Gerando..." : "Gerar Agora"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Report preview */}
        {showReport && reportContent && (
          <Card className="border-primary/30">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <FileText className="w-4 h-4 text-primary" />
                  Relatório Gerado
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setShowReport(false)}
                >
                  Fechar
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="prose prose-sm prose-invert max-w-none text-sm text-foreground">
                <Streamdown>{reportContent}</Streamdown>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Scheduled reports */}
        <div>
          <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary" />
            Relatórios Agendados
          </h2>
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(2)].map((_, i) => (
                <div key={i} className="h-16 bg-muted rounded-xl animate-pulse" />
              ))}
            </div>
          ) : !reports || reports.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <FileText className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm font-medium text-foreground">Nenhum relatório agendado</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Agende relatórios diários ou semanais para receber resumos automáticos.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {reports.map((report) => (
                <Card key={report.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <FileText className="w-4 h-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-foreground">
                            Relatório {report.frequency === "DAILY" ? "Diário" : "Semanal"}
                          </p>
                          <Badge
                            variant="outline"
                            className={`text-xs ${
                              report.isActive
                                ? "text-emerald-400 border-emerald-400/30"
                                : "text-muted-foreground"
                            }`}
                          >
                            {report.isActive ? "Ativo" : "Pausado"}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Próxima execução:{" "}
                          {report.nextRunAt
                            ? new Date(report.nextRunAt).toLocaleString("pt-BR")
                            : "—"}
                          {report.lastRunAt && (
                            <> · Última: {new Date(report.lastRunAt).toLocaleString("pt-BR")}</>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-muted-foreground"
                          onClick={() =>
                            toggleReport.mutate({
                              reportId: report.id,
                              isActive: !report.isActive,
                            })
                          }
                        >
                          {report.isActive ? (
                            <ToggleRight className="w-4 h-4 text-emerald-400" />
                          ) : (
                            <ToggleLeft className="w-4 h-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                          onClick={() => deleteReport.mutate({ reportId: report.id })}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Info */}
        <Card className="border-border/50 bg-accent/20">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-medium text-foreground mb-1">Como funcionam os relatórios</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Os relatórios são gerados automaticamente com IA, analisando métricas de ROAS, CPA, conversões e tendências.
                  Você receberá uma notificação quando o relatório estiver pronto. Os relatórios diários cobrem as últimas 24h
                  e os semanais cobrem os últimos 7 dias.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </MetaDashboardLayout>
  );
}
