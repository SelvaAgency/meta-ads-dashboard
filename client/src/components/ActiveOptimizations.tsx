import { trpc } from "@/lib/trpc";
import { useSelectedAccount } from "@/hooks/useSelectedAccount";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Eye, CheckCircle2 } from "lucide-react";

function daysLeft(date: Date | string | null): number | null {
  if (!date) return null;
  return Math.ceil((new Date(date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

const categoryColors: Record<string, string> = {
  PAUSAR_CRIATIVO:   "text-red-400",
  PAUSAR_CONJUNTO:   "text-orange-400",
  NOVO_PUBLICO:      "text-purple-400",
  REALOCAR_ORCAMENTO:"text-blue-400",
  NOVO_CRIATIVO:     "text-yellow-400",
  NOVO_CONJUNTO:     "text-emerald-400",
  GENERAL:           "text-primary",
};

export function ActiveOptimizations() {
  const { selectedAccountId } = useSelectedAccount();

  const { data: suggestions, isLoading } = trpc.suggestions.list.useQuery(
    { accountId: selectedAccountId! },
    { enabled: !!selectedAccountId, refetchInterval: 5 * 60 * 1000 }
  );

  const monitoring = (suggestions ?? []).filter(
    (s) => s.status === "applied" && s.monitorUntil && (daysLeft(s.monitorUntil) ?? 0) > 0 && !s.monitorResult
  );

  if (!selectedAccountId || isLoading || monitoring.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Eye className="w-4 h-4 text-blue-400" />
        <h2 className="text-sm font-semibold text-foreground">Em andamento</h2>
        <Badge variant="outline" className="text-xs text-blue-400 border-blue-400/30">
          {monitoring.length} em monitoramento
        </Badge>
      </div>

      <div className="space-y-2">
        {monitoring.map((s) => {
          const remaining = daysLeft(s.monitorUntil);
          const color = categoryColors[s.category] ?? "text-primary";
          return (
            <Card key={s.id} className="border-blue-400/20 bg-blue-400/5">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-400/10 flex items-center justify-center flex-shrink-0">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <p className="text-sm font-semibold text-foreground">{s.title}</p>
                      <Badge variant="outline" className={`text-xs ${color} border-current/30`}>
                        {s.category?.replace(/_/g, " ")}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                      {s.description}
                    </p>
                    <div className="flex items-center gap-1.5 mt-1.5 text-xs text-blue-400">
                      <Eye className="w-3 h-3" />
                      Monitorando resultados — {remaining} dia{remaining !== 1 ? "s" : ""} restante{remaining !== 1 ? "s" : ""}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
