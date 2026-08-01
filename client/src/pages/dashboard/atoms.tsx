import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, TrendingDown } from "lucide-react";
import { fmtCurrency } from "@/lib/kpiConfig";

/**
 * Átomos compartilhados do Dashboard/Resumo — extraídos para que o pane Meta e o
 * pane Google Ads renderizem os MESMOS cards (só muda o dado). Evita import
 * circular entre Dashboard.tsx e GoogleAdsPane.tsx.
 */

export function MetricCard({
  title, value, subtitle, icon: Icon, trendPercent, trendPrevValue, color = "blue",
}: {
  title: string; value: string; subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  trendPercent?: string; trendPrevValue?: string;
  color?: "blue" | "green" | "red" | "purple" | "orange";
}) {
  const colorMap = {
    blue: "text-primary bg-gradient-to-br from-primary/20 to-primary/10",
    green: "text-emerald-400 bg-gradient-to-br from-emerald-400/20 to-emerald-400/10",
    red: "text-red-400 bg-gradient-to-br from-red-400/20 to-red-400/10",
    purple: "text-purple-400 bg-gradient-to-br from-purple-400/20 to-purple-400/10",
    orange: "text-orange-400 bg-gradient-to-br from-orange-400/20 to-orange-400/10",
  };
  const displayTitle = subtitle ? `${title} (${subtitle})` : title;
  return (
    <Card className="border-border bg-card hover:border-primary/40 hover:shadow-md transition-all duration-200 h-full">
      <CardContent className="p-3 flex flex-col h-full min-h-[95px]">
        <div className="flex items-center justify-between mb-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shadow-sm ${colorMap[color]}`}>
            <Icon className="w-4 h-4 font-bold" />
          </div>
          {trendPercent && (
            <div className="relative group">
              <span className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-md cursor-default ${trendPercent.startsWith("-") ? "text-red-500 bg-red-50" : "text-emerald-600 bg-emerald-50"}`}>
                {trendPercent.startsWith("-") ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
                {trendPercent}
              </span>
              {trendPrevValue && (
                <div className="absolute right-0 top-full mt-1 z-50 hidden group-hover:block bg-popover border border-border rounded-lg px-3 py-2 shadow-xl whitespace-nowrap">
                  <p className="text-xs text-muted-foreground">Período anterior</p>
                  <p className="text-sm font-bold text-foreground">{trendPrevValue}</p>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="mt-auto">
          <p className="text-2xl font-bold text-foreground mb-0.5">{value}</p>
          <p className="text-xs font-semibold text-foreground/80">{displayTitle}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover border border-border rounded-lg p-3 shadow-xl text-xs">
      <p className="text-muted-foreground mb-2">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }} className="font-medium">
          {p.name}: {typeof p.value === "number" ? (p.name === "Receita" || p.name === "Gasto" ? fmtCurrency(p.value) : p.value.toFixed(2)) : p.value}
        </p>
      ))}
    </div>
  );
};
