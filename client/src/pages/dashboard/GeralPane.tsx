import { trpc } from "@/lib/trpc";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { CustomTooltip } from "@/pages/dashboard/atoms";
import { fmtCurrency, fmtNumber } from "@/lib/kpiConfig";

/**
 * Aba "Geral" dos Detalhes por plataforma — números BRUTOS somados (Meta+Google),
 * já que Investimento/Resultado/Custo-por-resultado são comparáveis entre as duas.
 * Os 2 gráficos (Investimento e Resultado) mostram 3 linhas: Total, Meta e Google.
 * Reusa as MESMAS queries do Google (cache do React Query) e a série do Meta que
 * o Dashboard já carregou. Admin/dev (Google ao vivo/gated).
 */
type SerieMeta = { date: string | Date; totalSpend?: unknown; totalConversions?: unknown }[];

export function GeralPane({ metaAccountId, days, metaTimeSeries, metaSpend, metaConversions }: {
  metaAccountId: number;
  days: number;
  metaTimeSeries: SerieMeta | undefined;
  metaSpend: number;
  metaConversions: number;
}) {
  const contaQ = trpc.googleAds.contaDoCliente.useQuery({ accountId: metaAccountId }, { enabled: !!metaAccountId, staleTime: 60_000 });
  const gId = contaQ.data?.id;
  const opts = { enabled: !!gId, staleTime: 5 * 60_000, refetchOnWindowFocus: false } as const;
  const sumQ = trpc.googleAds.summary.useQuery({ accountId: gId!, days }, opts);
  const serieQ = trpc.googleAds.serieDiaria.useQuery({ accountId: gId!, days }, opts);

  const gSpend = sumQ.data?.spend ?? 0;
  const gConv = sumQ.data?.conversions ?? 0;

  const investimento = metaSpend + gSpend;
  const resultado = metaConversions + gConv;
  const custoPorResultado = resultado > 0 ? investimento / resultado : 0;

  // Série diária cruzada por dia (ISO). Total, Meta e Google lado a lado.
  const iso = (d: string | Date) => String(d).slice(0, 10);
  const fmtDia = (isoDate: string) => { const p = isoDate.split("-"); return p.length === 3 ? `${p[2]}/${p[1]}` : isoDate; };
  const porDia = new Map<string, { meta_inv: number; google_inv: number; meta_res: number; google_res: number }>();
  const get = (k: string) => {
    let e = porDia.get(k);
    if (!e) { e = { meta_inv: 0, google_inv: 0, meta_res: 0, google_res: 0 }; porDia.set(k, e); }
    return e;
  };
  for (const d of metaTimeSeries ?? []) { const e = get(iso(d.date)); e.meta_inv += Number(d.totalSpend ?? 0); e.meta_res += Number(d.totalConversions ?? 0); }
  for (const d of serieQ.data?.dias ?? []) { const e = get(iso(d.dia)); e.google_inv += Number(d.custo ?? 0); e.google_res += Number(d.conversoes ?? 0); }
  const chartData = Array.from(porDia.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([k, e]) => ({
    date: fmtDia(k),
    "Total": Math.round((e.meta_inv + e.google_inv) * 100) / 100,
    "Meta": Math.round(e.meta_inv * 100) / 100,
    "Google": Math.round(e.google_inv * 100) / 100,
    "Total_res": Math.round(e.meta_res + e.google_res),
    "Meta_res": Math.round(e.meta_res),
    "Google_res": Math.round(e.google_res),
  }));

  if (contaQ.isLoading || sumQ.isLoading) {
    return <div className="flex items-center gap-2 text-xs text-muted-foreground py-6 px-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Somando plataformas…</div>;
  }

  const tem = (n: number) => n > 0;
  const semGoogle = !gId;

  return (
    <div className="space-y-6">
      {/* KPIs somados (Meta + Google) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Tile label="Investimento" value={fmtCurrency(investimento)} sub={semGoogle ? "só Meta" : `Meta ${fmtCurrency(metaSpend)} · Google ${fmtCurrency(gSpend)}`} />
        <Tile label="Resultado" value={tem(resultado) ? fmtNumber(resultado) : "—"} sub={semGoogle ? "só Meta" : `Meta ${fmtNumber(metaConversions)} · Google ${fmtNumber(gConv)}`} />
        <Tile label="Custo por resultado" value={tem(resultado) ? fmtCurrency(custoPorResultado) : "—"} sub="investimento ÷ resultado" />
      </div>

      {/* 2 gráficos com 3 linhas (Total · Meta · Google) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartTres titulo="Investimento Diário (R$)" data={chartData} chaves={["Total", "Meta", "Google"]} />
        <ChartTres titulo="Resultado Diário" data={chartData} chaves={["Total_res", "Meta_res", "Google_res"]} rotulos={["Total", "Meta", "Google"]} />
      </div>
    </div>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">{label}</p>
      <p className="text-2xl font-extrabold text-foreground mt-1">{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-1 truncate">{sub}</p>}
    </div>
  );
}

const CORES: Record<string, string> = { Total: "#E85BA8", Meta: "#1877F2", Google: "#EA4335" };

function ChartTres({ titulo, data, chaves, rotulos }: { titulo: string; data: any[]; chaves: string[]; rotulos?: string[] }) {
  const labels = rotulos ?? chaves;
  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-2 border-b border-border/30">
        <CardTitle className="text-sm font-bold text-foreground">{titulo}</CardTitle>
      </CardHeader>
      <CardContent className="pt-4">
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E8D5E0" opacity={0.5} />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#666666" }} />
            <YAxis tick={{ fontSize: 10, fill: "#666666" }} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {chaves.map((k, i) => (
              <Line key={k} type="monotone" dataKey={k} name={labels[i]} stroke={CORES[labels[i]] ?? "#888"}
                strokeWidth={labels[i] === "Total" ? 2.5 : 1.6} dot={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
