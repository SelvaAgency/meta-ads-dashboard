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
import { ROTULO_CONTEUDO, type TipoConteudo } from "@shared/tipoDeMidia";
import { COR as CORES, COR_TIPO, ORDEM_TIPO } from "@shared/coresSociais";

export interface PontoDaConta {
  dia: string;
  seguidores: number | null;
  visitas: number | null;
  /**
   * Uma chave por TIPO de conteúdo publicado naquele dia — as barras empilhadas.
   *
   * Só entram os tipos que a classificação encontrou. Um segmento de valor zero
   * apareceria na legenda e em nenhuma barra, e legenda que promete uma cor sem
   * mostrá-la faz procurar o que não existe.
   */
  porTipo: Partial<Record<TipoConteudo, number>>;
}

export interface PontoDeSeguidores {
  dia: string;
  total: number | null;
  entradas: number | null;
  saidas: number | null;
}

/**
 * As cores vêm de `shared/coresSociais`, e não de constantes locais.
 *
 * Duas listas de cor para as mesmas métricas divergem na primeira mudança — e o
 * sintoma é o pior possível: o roxo do gráfico deixa de ser o roxo do card, e a
 * paleta funcional para de funcionar exatamente onde ela existe para ajudar.
 */
const COR = {
  seguidores: CORES.seguidores,
  visitas: CORES.visitas,
  entradas: CORES.entrada,
  saidas: CORES.saida,
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

/**
 * Trajetória da conta: estoque à esquerda, fluxo à direita.
 *
 * Ativações são BARRAS EMPILHADAS, uma faixa por tipo de conteúdo: a altura
 * total é quanto se publicou naquele dia, e as cores dizem de que foi feito.
 * Como linha única, ela informava o volume e escondia a composição — e volume
 * sem composição é o indicador que sobe do jeito mais barato.
 */
export function GraficoDaConta({ pontos, nota }: { pontos: PontoDaConta[]; nota?: string | null }) {
  // Só os tipos que existem nos dados. Um segmento zerado apareceria na legenda
  // e em nenhuma barra — legenda que promete cor sem mostrá-la faz procurar o
  // que não existe.
  const tiposPresentes = ORDEM_TIPO.filter((t) => pontos.some((p) => (p.porTipo?.[t] ?? 0) > 0));

  const dados = pontos.map((p) => ({
    dia: p.dia,
    seguidores: p.seguidores,
    visitas: p.visitas,
    ...Object.fromEntries(tiposPresentes.map((t) => [t, p.porTipo?.[t] ?? 0])),
  }));

  const temDado = pontos.some((p) => p.seguidores != null || p.visitas != null) || tiposPresentes.length > 0;
  // 150px: o gráfico divide a linha do cabeçalho com outras duas colunas, e a
  // altura precisa caber sem esticar a caixa inteira.
  return (
    <Moldura titulo="Evolução" nota={nota} altura={150} vazio={!temDado || pontos.length < 2}>
      <ResponsiveContainer width="100%" height="100%">
        {/* `left: 4` e não margem negativa: a margem negativa puxava o eixo para
            fora da caixa e cortava os milhares dos seguidores. A largura de cada
            eixo é reservada em `width`, e a margem só afasta da borda. */}
        <ComposedChart data={dados} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.12} vertical={false} />
          <XAxis dataKey="dia" tickFormatter={diaCurto} tick={EIXO} axisLine={false} tickLine={false} minTickGap={24} />
          {/* Esquerda: só seguidores. `domain` automático em torno dos valores
              reais — começar em zero achataria a variação de uma base grande a
              ponto de ela sumir. 52px comporta cinco dígitos sem cortar. */}
          <YAxis yAxisId="estoque" tick={EIXO} axisLine={false} tickLine={false}
            domain={["dataMin - 10", "dataMax + 10"]} width={52} tickMargin={4} />
          <YAxis yAxisId="fluxo" orientation="right" tick={EIXO} axisLine={false} tickLine={false}
            width={38} tickMargin={4} />
          <Tooltip
            contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid var(--border)", background: "var(--card)" }}
            labelFormatter={(d) => diaCurto(String(d))}
            formatter={(v, nome) => [num(v), String(nome)]}
          />
          <Legend wrapperStyle={{ fontSize: 10 }} iconType="circle" iconSize={7} />
          {tiposPresentes.map((t) => (
            <Bar key={t} yAxisId="fluxo" dataKey={t} name={ROTULO_CONTEUDO[t]} stackId="ativacoes"
              fill={COR_TIPO[t]} opacity={0.85} maxBarSize={14}
              // Só o topo da pilha arredonda; os de baixo ficam retos para as
              // faixas se encostarem sem folga entre elas.
              radius={t === tiposPresentes[tiposPresentes.length - 1] ? [2, 2, 0, 0] : undefined} />
          ))}
          <Line yAxisId="estoque" type="monotone" dataKey="seguidores" name="Seguidores"
            stroke={COR.seguidores} strokeWidth={2} dot={false} connectNulls={false} />
          <Line yAxisId="fluxo" type="monotone" dataKey="visitas" name="Visitas ao perfil"
            stroke={COR.visitas} strokeWidth={2} dot={false} connectNulls={false} />
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
        <ComposedChart data={dados} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.12} vertical={false} />
          <XAxis dataKey="dia" tickFormatter={diaCurto} tick={EIXO} axisLine={false} tickLine={false} minTickGap={24} />
          <YAxis yAxisId="total" tick={EIXO} axisLine={false} tickLine={false}
            domain={["dataMin - 10", "dataMax + 10"]} width={52} tickMargin={4} />
          {temMovimento && (
            <YAxis yAxisId="mov" orientation="right" tick={EIXO} axisLine={false} tickLine={false}
              width={38} tickMargin={4} />
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
