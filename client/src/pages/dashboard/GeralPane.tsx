import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { TrendingUp, TrendingDown } from "lucide-react";
import { CustomTooltip } from "@/pages/dashboard/atoms";
import { fmtCurrency, fmtNumber } from "@/lib/kpiConfig";

/** Variação % vs período anterior. undefined quando não há base (evita ∞%). */
function pct(cur: number, prev: number): string | undefined {
  if (!prev || prev === 0) return undefined;
  const d = ((cur - prev) / prev) * 100;
  return `${d >= 0 ? "+" : ""}${d.toFixed(1)}%`;
}

/**
 * Aba "Geral" dos Detalhes por plataforma — soma bruta Meta+Google.
 *  · KpisPlataformas  → os 3 números principais (Investimento / Resultado /
 *    Custo por resultado), sempre visíveis (inclusive na seção colapsada).
 *  · GraficosPlataformas → os 2 gráficos (Investimento e Resultado) com 3 linhas
 *    (Total · Meta · Google), aparecem só quando expandido.
 *  Reusa as MESMAS queries do Google (cache do React Query). Admin/dev.
 */
type SerieMeta = { date: string | Date; totalSpend?: unknown; totalConversions?: unknown }[];

function useGoogle(metaAccountId: number, days: number) {
  const contaQ = trpc.googleAds.contaDoCliente.useQuery({ accountId: metaAccountId }, { enabled: !!metaAccountId, staleTime: 60_000 });
  const gId = contaQ.data?.id;
  const opts = { enabled: !!gId, staleTime: 5 * 60_000, refetchOnWindowFocus: false } as const;
  const sumQ = trpc.googleAds.summary.useQuery({ accountId: gId!, days }, opts);
  const serieQ = trpc.googleAds.serieDiaria.useQuery({ accountId: gId!, days }, opts);
  return { gId, sumQ, serieQ };
}

export function KpisPlataformas({ metaAccountId, days, metaSpend, metaConversions, prevMetaSpend, prevMetaConversions }: {
  metaAccountId: number; days: number; metaSpend: number; metaConversions: number;
  prevMetaSpend?: number; prevMetaConversions?: number;
}) {
  const { gId, sumQ } = useGoogle(metaAccountId, days);
  const gSpend = sumQ.data?.spend ?? 0;
  const gConv = sumQ.data?.conversions ?? 0;
  const investimento = metaSpend + gSpend;
  const resultado = metaConversions + gConv;
  const custoPorResultado = resultado > 0 ? investimento / resultado : 0;
  const semGoogle = !gId;

  // Período anterior: Meta vem de previousTotals (pai); Google, da metade mais
  // antiga da série de days*2 (serieDiaria limita em 90). Só busca ao comparar.
  const temComparativo = prevMetaSpend != null || prevMetaConversions != null;
  const days2 = Math.min(days * 2, 90);
  const serie2Q = trpc.googleAds.serieDiaria.useQuery(
    { accountId: gId!, days: days2 },
    { enabled: !!gId && temComparativo, staleTime: 5 * 60_000, refetchOnWindowFocus: false },
  );
  const dias2 = serie2Q.data?.dias ?? [];
  const older = dias2.slice(0, Math.max(0, dias2.length - days)); // janela anterior
  const gPrevSpend = older.reduce((s, d: any) => s + Number(d.custo ?? 0), 0);
  const gPrevConv = older.reduce((s, d: any) => s + Number(d.conversoes ?? 0), 0);

  const prevInvest = (prevMetaSpend ?? 0) + gPrevSpend;
  const prevResultado = (prevMetaConversions ?? 0) + gPrevConv;
  const prevCusto = prevResultado > 0 ? prevInvest / prevResultado : 0;

  const tInvest = prevMetaSpend != null ? pct(investimento, prevInvest) : undefined;
  const tResult = prevMetaConversions != null ? pct(resultado, prevResultado) : undefined;
  const tCusto = temComparativo && resultado > 0 ? pct(custoPorResultado, prevCusto) : undefined;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <Tile label="Investimento" value={fmtCurrency(investimento)} trendPercent={tInvest} trendPrevValue={fmtCurrency(prevInvest)} sub={semGoogle ? "só Meta" : `Meta ${fmtCurrency(metaSpend)} · Google ${fmtCurrency(gSpend)}`} />
      <Tile label="Resultado" value={resultado > 0 ? fmtNumber(resultado) : "—"} trendPercent={tResult} trendPrevValue={prevResultado > 0 ? fmtNumber(prevResultado) : "—"} sub={semGoogle ? "só Meta" : `Meta ${fmtNumber(metaConversions)} · Google ${fmtNumber(gConv)}`} />
      <Tile label="Custo por resultado" value={resultado > 0 ? fmtCurrency(custoPorResultado) : "—"} trendPercent={tCusto} trendPrevValue={prevCusto > 0 ? fmtCurrency(prevCusto) : "—"} sub="investimento ÷ resultado" />
    </div>
  );
}

export function GraficosPlataformas({ metaAccountId, days, metaTimeSeries }: {
  metaAccountId: number; days: number; metaTimeSeries: SerieMeta | undefined;
}) {
  const { serieQ } = useGoogle(metaAccountId, days);

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
    Total: Math.round((e.meta_inv + e.google_inv) * 100) / 100,
    Meta: Math.round(e.meta_inv * 100) / 100,
    Google: Math.round(e.google_inv * 100) / 100,
    Total_res: Math.round(e.meta_res + e.google_res),
    Meta_res: Math.round(e.meta_res),
    Google_res: Math.round(e.google_res),
  }));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <ChartTres titulo="Investimento Diário (R$)" data={chartData} chaves={["Total", "Meta", "Google"]} />
      <ChartTres titulo="Resultado Diário" data={chartData} chaves={["Total_res", "Meta_res", "Google_res"]} rotulos={["Total", "Meta", "Google"]} />
    </div>
  );
}

function Tile({ label, value, sub, trendPercent, trendPrevValue }: { label: string; value: string; sub?: string; trendPercent?: string; trendPrevValue?: string }) {
  const neg = trendPercent?.startsWith("-");
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">{label}</p>
        {trendPercent && (
          <div className="relative group">
            <span className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-md cursor-default ${neg ? "text-red-500 bg-red-50 dark:bg-red-500/10" : "text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10"}`}>
              {neg ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
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
