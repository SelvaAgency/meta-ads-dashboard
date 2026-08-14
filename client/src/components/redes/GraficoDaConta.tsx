/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Os gráficos do cabeçalho — três escalas, uma leitura
 * ─────────────────────────────────────────────────────────────────────────────
 *  Seguidores vive na casa dos milhares; visitas, nas dezenas; ativações, nas
 *  unidades. Num eixo só, seguidores viraria uma linha reta no topo e as outras
 *  duas, uma linha reta embaixo — três séries desenhadas e nenhuma legível.
 *
 *  ── Dois eixos, e não normalização ─────────────────────────────────────────
 *  Normalizar (0–100) tornaria as três comparáveis em FORMA e destruiria o
 *  valor: o ponto deixaria de ter unidade, e um tooltip dizendo "seguidores: 73"
 *  não significa nada. Com dois eixos o número continua sendo o número — só o
 *  eixo da direita é outro.
 *
 *  Seguidores fica sozinho no eixo esquerdo por ser o único ESTOQUE. Visitas e
 *  ativações dividem o direito porque são fluxo e vivem em ordens parecidas.
 *
 *  ── Buraco não é zero ──────────────────────────────────────────────────────
 *  `connectNulls={false}` em todas: dia sem coleta abre um vão na linha. Ligar
 *  os pontos por cima do buraco desenharia uma reta que ninguém mediu, e ela
 *  pareceria estabilidade justamente onde não há informação.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import {
  Area, Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";

export interface PontoDaConta {
  dia: string;
  seguidores: number | null;
  visitas: number | null;
  ativacoes: number | null;
}

export interface PontoDeSeguidores {
  dia: string;
  total: number | null;
  entradas: number | null;
  saidas: number | null;
}

const COR = {
  seguidores: "#8B5CF6",
  visitas: "#0EA5E9",
  ativacoes: "#F59E0B",
  entradas: "#10B981",
  saidas: "#EF4444",
};

const diaCurto = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const num = (v: unknown) => (typeof v === "number" ? v.toLocaleString("pt-BR") : "–");

const EIXO = { fontSize: 10, fill: "currentColor" } as const;

function Moldura({ titulo, nota, vazio, altura = 180, children }: {
  titulo: string; nota?: string | null; vazio: boolean; altura?: number; children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <div className="flex items-baseline gap-2 flex-wrap">
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{titulo}</h3>
        {nota && <span className="text-[10px] text-muted-foreground/70">{nota}</span>}
      </div>
      {vazio ? (
        <div style={{ height: altura }} className="flex items-center justify-center text-xs text-muted-foreground">
          Sem dados suficientes no período.
        </div>
      ) : (
        <div style={{ height: altura }} className="text-muted-foreground">{children}</div>
      )}
    </div>
  );
}

/** Trajetória da conta: estoque à esquerda, fluxo à direita. */
export function GraficoDaConta({ pontos, nota }: { pontos: PontoDaConta[]; nota?: string | null }) {
  const temDado = pontos.some((p) => p.seguidores != null || p.visitas != null || p.ativacoes != null);
  // 150px: o gráfico divide a linha do cabeçalho com outras duas colunas, e a
  // altura precisa caber sem esticar a caixa inteira.
  return (
    <Moldura titulo="Evolução" nota={nota} altura={150} vazio={!temDado || pontos.length < 2}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={pontos} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.12} vertical={false} />
          <XAxis dataKey="dia" tickFormatter={diaCurto} tick={EIXO} axisLine={false} tickLine={false} minTickGap={24} />
          {/* Esquerda: só seguidores. `domain` automático em torno dos valores
              reais — começar em zero achataria a variação de uma base grande a
              ponto de ela sumir. */}
          <YAxis yAxisId="estoque" tick={EIXO} axisLine={false} tickLine={false}
            domain={["dataMin - 10", "dataMax + 10"]} width={46} />
          <YAxis yAxisId="fluxo" orientation="right" tick={EIXO} axisLine={false} tickLine={false} width={34} />
          <Tooltip
            contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid var(--border)", background: "var(--card)" }}
            labelFormatter={(d) => diaCurto(String(d))}
            formatter={(v, nome) => [num(v), String(nome)]}
          />
          <Legend wrapperStyle={{ fontSize: 10 }} iconType="circle" iconSize={7} />
          <Line yAxisId="estoque" type="monotone" dataKey="seguidores" name="Seguidores"
            stroke={COR.seguidores} strokeWidth={2} dot={false} connectNulls={false} />
          <Line yAxisId="fluxo" type="monotone" dataKey="visitas" name="Visitas ao perfil"
            stroke={COR.visitas} strokeWidth={2} dot={false} connectNulls={false} />
          <Bar yAxisId="fluxo" dataKey="ativacoes" name="Ativações" fill={COR.ativacoes} opacity={0.55}
            radius={[2, 2, 0, 0]} maxBarSize={14} />
        </ComposedChart>
      </ResponsiveContainer>
    </Moldura>
  );
}

/**
 * Entradas, saídas e saldo.
 *
 * As barras de entrada e saída ficam no MESMO eixo e em sentidos opostos —
 * saída desenhada como número negativo — para o desequilíbrio entre as duas ser
 * visível sem ler número nenhum. O total continua sendo a linha, no eixo do
 * estoque.
 *
 * Quando a semântica de entradas/saídas ainda não foi provada, `pontos` chega
 * sem elas e o gráfico mostra só o total: metade de um comparativo é melhor que
 * um comparativo inventado.
 */
export function GraficoDeMovimento({ pontos, temMovimento, nota }: {
  pontos: PontoDeSeguidores[]; temMovimento: boolean; nota?: string | null;
}) {
  const dados = pontos.map((p) => ({
    ...p,
    // Negativo só para desenhar para baixo; o tooltip reverte para não mostrar
    // "-38 saídas", que se lê como "saíram menos 38".
    saidasPlot: p.saidas == null ? null : -Math.abs(p.saidas),
  }));
  const temTotal = pontos.some((p) => p.total != null);

  return (
    <Moldura titulo="Movimento da base" nota={nota} vazio={!temTotal || pontos.length < 2}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={dados} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.12} vertical={false} />
          <XAxis dataKey="dia" tickFormatter={diaCurto} tick={EIXO} axisLine={false} tickLine={false} minTickGap={24} />
          <YAxis yAxisId="total" tick={EIXO} axisLine={false} tickLine={false}
            domain={["dataMin - 10", "dataMax + 10"]} width={46} />
          {temMovimento && (
            <YAxis yAxisId="mov" orientation="right" tick={EIXO} axisLine={false} tickLine={false} width={34} />
          )}
          <Tooltip
            contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid var(--border)", background: "var(--card)" }}
            labelFormatter={(d) => diaCurto(String(d))}
            formatter={(v, nome) => [num(typeof v === "number" ? Math.abs(v) : v), String(nome)]}
          />
          <Legend wrapperStyle={{ fontSize: 10 }} iconType="circle" iconSize={7} />
          {temMovimento && (
            <>
              <Bar yAxisId="mov" dataKey="entradas" name="Entradas" fill={COR.entradas} opacity={0.7}
                radius={[2, 2, 0, 0]} maxBarSize={12} />
              <Bar yAxisId="mov" dataKey="saidasPlot" name="Saídas" fill={COR.saidas} opacity={0.7}
                radius={[0, 0, 2, 2]} maxBarSize={12} />
            </>
          )}
          <Area yAxisId="total" type="monotone" dataKey="total" name="Saldo (total)"
            stroke={COR.seguidores} strokeWidth={2} fill={COR.seguidores} fillOpacity={0.08}
            dot={false} connectNulls={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </Moldura>
  );
}
