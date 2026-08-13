/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Os dois gráficos do topo — seguidores e visitas ao perfil
 * ─────────────────────────────────────────────────────────────────────────────
 *  O tipo de gráfico saiu do tipo de dado, e não do gosto:
 *
 *    SEGUIDORES        linha. É acumulado — a trajetória é a informação, e
 *                      barras sugeririam que cada dia é independente do anterior.
 *    VISITAS AO PERFIL barras. É contagem por dia — o pico de um dia é a
 *                      informação, e a linha o suavizaria justo onde ele importa.
 *
 *  ── O vazio ocupa o mesmo espaço que o cheio ───────────────────────────────
 *  Sem série, o gráfico não some: vira uma faixa da mesma altura dizendo desde
 *  quando vai existir. Sumir e reaparecer duas semanas depois faria a página
 *  parecer que mudou sozinha — e some junto o aviso de que a medição começou.
 *
 *  ── Buraco na série é falha visível ────────────────────────────────────────
 *  Dia sem coleta entra como `null`, e o recharts corta a linha ali. Interpolar
 *  desenharia uma tendência que ninguém mediu.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

export interface PontoDaSerie {
  dia: string;
  seguidores: number | null;
  visitas: number | null;
}

const diaCurto = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

function Dica({ active, payload, label, sufixo }: {
  active?: boolean; payload?: Array<{ value?: number | null }>; label?: string; sufixo: string;
}) {
  if (!active || !payload?.length) return null;
  const v = payload[0]?.value;
  return (
    <div className="rounded-lg border border-border bg-card px-2.5 py-1.5 shadow-sm">
      <p className="text-[11px] text-muted-foreground">{label ? diaCurto(label) : ""}</p>
      <p className="text-sm font-semibold tabular-nums">
        {v == null ? "sem coleta" : `${v.toLocaleString("pt-BR")} ${sufixo}`}
      </p>
    </div>
  );
}

/** A moldura comum: mesmo tamanho com dado ou sem, ver cabeçalho. */
function Moldura({ titulo, valor, apoio, children }: {
  titulo: string; valor: string; apoio?: string; children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3">
      <div>
        <p className="text-xs text-muted-foreground">{titulo}</p>
        <p className="text-2xl font-bold text-foreground leading-tight tabular-nums">{valor}</p>
        {apoio && <p className="text-[11px] text-muted-foreground mt-0.5">{apoio}</p>}
      </div>
      <div className="h-[160px]">{children}</div>
    </div>
  );
}

function Vazio({ mensagem }: { mensagem: string }) {
  return (
    <div className="h-full rounded-lg border border-dashed border-border flex items-center justify-center px-4">
      <p className="text-[11px] text-muted-foreground text-center">{mensagem}</p>
    </div>
  );
}

export function GraficoDeSeguidores({ serie, atual, saldo, cobertura }: {
  serie: PontoDaSerie[]; atual: string; saldo: string | null; cobertura: string;
}) {
  const temSerie = serie.filter((p) => p.seguidores != null).length >= 2;
  return (
    <Moldura titulo="Seguidores" valor={atual} apoio={saldo ?? cobertura}>
      {temSerie ? (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={serie} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
            <defs>
              <linearGradient id="gradSeguidores" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#E1306C" stopOpacity={0.22} />
                <stop offset="95%" stopColor="#E1306C" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-border" opacity={0.4} />
            <XAxis dataKey="dia" tickFormatter={diaCurto} tick={{ fontSize: 10 }} stroke="currentColor" className="text-muted-foreground" />
            <YAxis tick={{ fontSize: 10 }} width={48} domain={["dataMin - 5", "dataMax + 5"]} stroke="currentColor" className="text-muted-foreground" />
            <Tooltip content={<Dica sufixo="seguidores" />} />
            {/* `connectNulls` fica FALSO: dia sem coleta corta a linha, em vez
                de virar uma reta que ninguém mediu. */}
            <Area type="monotone" dataKey="seguidores" stroke="#E1306C" strokeWidth={2.5}
              fill="url(#gradSeguidores)" connectNulls={false} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <Vazio mensagem={cobertura} />
      )}
    </Moldura>
  );
}

export function GraficoDeVisitas({ serie, total, cobertura, titulo = "Visitas ao perfil" }: {
  serie: PontoDaSerie[]; total: string; cobertura: string; titulo?: string;
}) {
  const temSerie = serie.some((p) => p.visitas != null);
  return (
    <Moldura titulo={titulo} valor={total} apoio={cobertura}>
      {temSerie ? (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={serie} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-border" opacity={0.4} vertical={false} />
            <XAxis dataKey="dia" tickFormatter={diaCurto} tick={{ fontSize: 10 }} stroke="currentColor" className="text-muted-foreground" />
            <YAxis tick={{ fontSize: 10 }} width={48} stroke="currentColor" className="text-muted-foreground" />
            <Tooltip content={<Dica sufixo="visitas" />} cursor={{ fill: "currentColor", opacity: 0.06 }} />
            <Bar dataKey="visitas" fill="#8B5CF6" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <Vazio mensagem={cobertura} />
      )}
    </Moldura>
  );
}
