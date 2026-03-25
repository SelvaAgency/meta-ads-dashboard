import { MetaDashboardLayout, useSelectedAccount } from "@/components/MetaDashboardLayout";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Brain,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  DollarSign,
  Lightbulb,
  Link2,
  RefreshCw,
  Target,
  Users,
  X,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { Streamdown } from "streamdown";

const categoryConfig: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
  BUDGET: { label: "Orçamento", icon: DollarSign, color: "text-blue-400" },
  TARGETING: { label: "Segmentação", icon: Target, color: "text-purple-400" },
  CREATIVE: { label: "Criativo", icon: Lightbulb, color: "text-yellow-400" },
  BIDDING: { label: "Lances", icon: DollarSign, color: "text-green-400" },
  SCHEDULE: { label: "Agendamento", icon: RefreshCw, color: "text-orange-400" },
  AUDIENCE: { label: "Público", icon: Users, color: "text-pink-400" },
  GENERAL: { label: "Geral", icon: Brain, color: "text-primary" },
};

const priorityConfig: Record<string, { label: string; color: string }> = {
  HIGH: { label: "Alta", color: "text-red-400 border-red-400/30" },
  MEDIUM: { label: "Média", color: "text-yellow-400 border-yellow-400/30" },
  LOW: { label: "Baixa", color: "text-blue-400 border-blue-400/30" },
};

export default function Suggestions() {
  const [, navigate] = useLocation();
  const [expanded, setExpanded] = useState<number | null>(null);
  const { selectedAccountId, accounts } = useSelectedAccount();
  const utils = trpc.useUtils();

  const { data: suggestions, isLoading } = trpc.suggestions.list.useQuery(
    { accountId: selectedAccountId! },
    { enabled: !!selectedAccountId }
  );

  const generate = trpc.suggestions.generate.useMutation({
    onSuccess: () => {
      utils.suggestions.list.invalidate();
      toast.success("Novas sugestões geradas com IA!");
    },
    onError: () => toast.error("Erro ao gerar sugestões. Verifique se há dados de campanha."),
  });

  const dismiss = trpc.suggestions.dismiss.useMutation({
    onSuccess: () => utils.suggestions.list.invalidate(),
  });

  const markApplied = trpc.suggestions.markApplied.useMutation({
    onSuccess: () => {
      utils.suggestions.list.invalidate();
      toast.success("Sugestão marcada como aplicada!");
    },
  });

  if (!accounts || accounts.length === 0) {
    return (
      <MetaDashboardLayout title="Sugestões IA">
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

  const active = suggestions?.filter((s) => !s.isDismissed && !s.isApplied) ?? [];
  const applied = suggestions?.filter((s) => s.isApplied) ?? [];

  return (
    <MetaDashboardLayout title="Sugestões IA">
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">Sugestões de Melhoria</h1>
            <p className="text-sm text-muted-foreground">
              Recomendações geradas por IA com base nos dados das suas campanhas
            </p>
          </div>
          <Button
            size="sm"
            className="gap-2"
            onClick={() => selectedAccountId && generate.mutate({ accountId: selectedAccountId })}
            disabled={generate.isPending || !selectedAccountId}
          >
            <Brain className={`w-3.5 h-3.5 ${generate.isPending ? "animate-pulse" : ""}`} />
            {generate.isPending ? "Gerando..." : "Gerar com IA"}
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Pendentes", value: active.length, color: "text-primary" },
            { label: "Alta Prioridade", value: active.filter((s) => s.priority === "HIGH").length, color: "text-red-400" },
            { label: "Aplicadas", value: applied.length, color: "text-emerald-400" },
          ].map((stat) => (
            <Card key={stat.label}>
              <CardContent className="p-4">
                <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Suggestions list */}
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-24 bg-muted rounded-xl animate-pulse" />
            ))}
          </div>
        ) : active.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <Brain className="w-12 h-12 text-primary/30 mx-auto mb-4" />
              <p className="text-sm font-medium text-foreground mb-2">Nenhuma sugestão pendente</p>
              <p className="text-xs text-muted-foreground mb-6 max-w-sm mx-auto">
                Clique em "Gerar com IA" para analisar suas campanhas e receber recomendações personalizadas.
              </p>
              <Button
                size="sm"
                onClick={() => selectedAccountId && generate.mutate({ accountId: selectedAccountId })}
                disabled={generate.isPending}
                className="gap-2"
              >
                <Brain className="w-3.5 h-3.5" />
                Gerar Sugestões
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {active.map((s) => {
              const cat = categoryConfig[s.category] ?? categoryConfig.GENERAL;
              const pri = priorityConfig[s.priority] ?? priorityConfig.LOW;
              const CatIcon = cat.icon;
              const isOpen = expanded === s.id;
              const actionItems = Array.isArray(s.actionItems) ? s.actionItems as string[] : [];

              return (
                <Card key={s.id} className="border-border hover:border-primary/30 transition-all">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-lg bg-accent flex items-center justify-center flex-shrink-0">
                        <CatIcon className={`w-4 h-4 ${cat.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <p className="text-sm font-semibold text-foreground">{s.title}</p>
                          <Badge variant="outline" className={`text-xs ${pri.color}`}>
                            {pri.label} prioridade
                          </Badge>
                          <Badge variant="outline" className={`text-xs ${cat.color}`}>
                            {cat.label}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">{s.description}</p>

                        {isOpen && (
                          <div className="mt-3 space-y-3">
                            {s.expectedImpact && (
                              <div className="p-3 rounded-lg bg-emerald-400/5 border border-emerald-400/20">
                                <p className="text-xs font-medium text-emerald-400 mb-1">Impacto Esperado</p>
                                <p className="text-xs text-muted-foreground">{s.expectedImpact}</p>
                              </div>
                            )}
                            {actionItems.length > 0 && (
                              <div>
                                <p className="text-xs font-medium text-foreground mb-2">Ações Recomendadas</p>
                                <ul className="space-y-1.5">
                                  {actionItems.map((action, i) => (
                                    <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                                      <span className="w-4 h-4 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center flex-shrink-0 mt-0.5">
                                        {i + 1}
                                      </span>
                                      {action}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-muted-foreground"
                          onClick={() => setExpanded(isOpen ? null : s.id)}
                        >
                          {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 gap-1 text-xs text-emerald-400 hover:text-emerald-400 hover:bg-emerald-400/10"
                          onClick={() => markApplied.mutate({ suggestionId: s.id })}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Aplicar
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                          onClick={() => dismiss.mutate({ suggestionId: s.id })}
                        >
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Applied */}
        {applied.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              Aplicadas ({applied.length})
            </h2>
            <div className="space-y-2">
              {applied.slice(0, 5).map((s) => (
                <Card key={s.id} className="opacity-60">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                      <p className="text-xs font-medium text-foreground truncate">{s.title}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </MetaDashboardLayout>
  );
}
