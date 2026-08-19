/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Detalhamento dos Reels — a investigação individual
 * ─────────────────────────────────────────────────────────────────────────────
 *  Ele é o par de "Retenção dos Reels", e a divisão de trabalho é a razão de os
 *  dois existirem:
 *
 *    RETENÇÃO       como os Reels estão indo — comparação, ranking, resumo
 *    DETALHAMENTO   o que aconteceu em CADA Reel — todas as métricas coletadas
 *
 *  A retenção responde olhando o conjunto; este responde olhando um. Fundi-los
 *  daria uma tabela larga demais para comparar e rasa demais para investigar.
 *
 *  ── Todas as métricas que o snapshot guarda, e nenhuma inventada ───────────
 *  Alcance, views, interações e as quatro parcelas vêm do snapshot de mídia.
 *  Skip rate e tempo médio vêm das duas métricas de Reels que a sondagem provou
 *  existir. Nada aqui é derivado de `total_views` — a regra de
 *  `shared/retencaoDeReels.ts` continua valendo: nenhuma contagem de views é o
 *  denominador do tempo médio.
 *
 *  ── Ausência não vira zero ─────────────────────────────────────────────────
 *  Métrica não medida sai como traço. Um zero afirmaria que ninguém salvou,
 *  quando o que houve foi não termos medido.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useState } from "react";
import { ExternalLink, Image as ImageIcon } from "lucide-react";
import { formatarSegundos, formatarTaxa } from "@shared/retencaoDeReels";
import { COR_TIPO } from "@shared/coresSociais";

export interface ReelDetalhado {
  mediaId: string;
  publicadoEm: string | null;
  thumbnailUrl: string | null;
  permalink: string | null;
  legenda: string | null;
  views: number | null;
  alcance: number | null;
  interacoes: number | null;
  curtidas: number | null;
  comentarios: number | null;
  compartilhamentos: number | null;
  salvamentos: number | null;
  skipRate: number | null;
  avgWatchTimeMs: number | null;
  /** O que a Meta recusou, por nome de métrica — para a linha poder dizer. */
  recusadas: Record<string, string>;
}

const fmt = (v: number | null) => (v == null ? "–" : v.toLocaleString("pt-BR"));

const MESES = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];
const quandoTexto = (iso: string | null) => {
  if (!iso) return "sem data";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "sem data";
  return `${d.getDate()} ${MESES[d.getMonth()]}`;
};

/** Uma métrica da grade — rótulo miúdo em cima, número embaixo. */
function Celula({ rotulo, valor, ajuda, cor }: {
  rotulo: string; valor: string; ajuda?: string; cor?: string;
}) {
  const vazio = valor === "–";
  return (
    <div className="min-w-0" title={ajuda}>
      <span className="block text-[8.5px] font-bold uppercase tracking-[0.09em]
                       text-muted-foreground/60 truncate">
        {rotulo}
      </span>
      <span className={`block text-[12.5px] font-bold tabular-nums leading-none mt-0.5 ${
        vazio ? "text-muted-foreground/35" : ""}`}
        style={!vazio && cor ? { color: cor } : undefined}>
        {valor}
      </span>
    </div>
  );
}

/**
 * Quantos Reels a seção mostra antes de pedir para expandir.
 *
 * Cada Reel ocupa ~92px. Uma conta com 30 publica 2.700px de seção — a última
 * da página vira metade da rolagem, que é justamente o problema que a retenção
 * resolveu com colapso. Oito cobre a leitura normal; o botão cobre o resto sem
 * esconder que existe.
 */
const TETO_VISIVEL = 8;

export function DetalhamentoDeReels({ reels }: { reels: ReelDetalhado[] }) {
  /** Ordem padrão: mais recente primeiro — investigação começa pelo que saiu. */
  const [ordem, setOrdem] = useState<"data" | "views" | "skip">("data");
  const [todos, setTodos] = useState(false);

  const ordenados = [...reels].sort((a, b) => {
    if (ordem === "views") return (b.views ?? -1) - (a.views ?? -1);
    // Não medido vai para o fim em vez de liderar: um Reel sem taxa não é o de
    // menor abandono, é o que ninguém mediu.
    if (ordem === "skip") return (b.skipRate ?? -1) - (a.skipRate ?? -1);
    return (b.publicadoEm ?? "").localeCompare(a.publicadoEm ?? "");
  });

  if (!reels.length) {
    return (
      <section className="flex flex-col gap-2">
        <h2 className="text-[13px] font-bold uppercase tracking-[0.1em]">Detalhamento dos Reels</h2>
        <p className="text-[11.5px] text-muted-foreground">
          Nenhum Reel publicado no período selecionado.
        </p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div className="flex items-baseline gap-2.5 flex-wrap">
          <h2 className="text-[13px] font-bold uppercase tracking-[0.1em]">Detalhamento dos Reels</h2>
          <span className="text-[11px] text-muted-foreground/50">
            {reels.length} {reels.length === 1 ? "Reel" : "Reels"} · todas as métricas coletadas
          </span>
        </div>
        <span className="inline-flex rounded-md border border-border overflow-hidden">
          {([["data", "data"], ["views", "views"], ["skip", "abandono"]] as const).map(([k, r]) => (
            <button key={k} type="button" onClick={() => setOrdem(k)}
              className={`text-[9.5px] font-bold uppercase tracking-[0.06em] px-2 py-1
                          transition-colors duration-150 ${
                ordem === k ? "bg-foreground text-background"
                            : "text-muted-foreground hover:bg-foreground/[0.04]"}`}>
              {r}
            </button>
          ))}
        </span>
      </div>

      <div className="rounded-[20px] border border-border bg-card overflow-hidden
                      shadow-[0_1px_2px_rgba(10,10,10,.04)] divide-y divide-border">
        {(todos ? ordenados : ordenados.slice(0, TETO_VISIVEL)).map((r) => (
          <article key={r.mediaId}
            className="flex items-start gap-3 px-3.5 py-3 transition-colors duration-150
                       hover:bg-foreground/[0.02]">
            {/* A miniatura é o índice visual: quem investiga reconhece o Reel
                pela imagem antes de ler qualquer número. */}
            <span className="w-[52px] h-[68px] rounded-[8px] bg-muted overflow-hidden flex-shrink-0
                             flex items-center justify-center">
              {r.thumbnailUrl
                ? <img src={r.thumbnailUrl} alt="" loading="lazy" className="w-full h-full object-cover" />
                : <ImageIcon className="w-4 h-4 text-muted-foreground/40" />}
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2 min-w-0">
                <span className="text-[11px] font-bold tabular-nums flex-shrink-0"
                  style={{ color: COR_TIPO.REELS }}>
                  {quandoTexto(r.publicadoEm)}
                </span>
                <span className="text-[11.5px] text-muted-foreground truncate">
                  {r.legenda?.trim() || <span className="italic text-muted-foreground/50">sem legenda</span>}
                </span>
                {r.permalink && (
                  <a href={r.permalink} target="_blank" rel="noopener noreferrer"
                    className="text-muted-foreground/50 hover:text-foreground transition-colors
                               duration-150 flex-shrink-0"
                    title="Abrir no Instagram">
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-x-3 gap-y-2 mt-2">
                <Celula rotulo="Views" valor={fmt(r.views)}
                  ajuda="total_views — contagem independente. Não é o denominador do tempo médio." />
                <Celula rotulo="Alcance" valor={fmt(r.alcance)} ajuda="Contas únicas alcançadas." />
                <Celula rotulo="Interações" valor={fmt(r.interacoes)}
                  ajuda="total_interactions, medido pela Meta." />
                <Celula rotulo="Curtidas" valor={fmt(r.curtidas)} />
                <Celula rotulo="Coment." valor={fmt(r.comentarios)} />
                <Celula rotulo="Compart." valor={fmt(r.compartilhamentos)} />
                <Celula rotulo="Salvos" valor={fmt(r.salvamentos)} />
                <Celula rotulo="Abandono" cor={COR_TIPO.REELS}
                  valor={formatarTaxa(r.skipRate)}
                  ajuda={r.skipRate == null
                    ? (r.recusadas?.reels_skip_rate
                        ? "a Meta recusou reels_skip_rate para este Reel"
                        : "taxa não medida nesta coleta")
                    : "reels_skip_rate, medido pela Meta — percentual que abandona"} />
                <Celula rotulo="Tempo médio" cor={COR_TIPO.REELS}
                  valor={formatarSegundos(r.avgWatchTimeMs)}
                  ajuda={r.avgWatchTimeMs == null
                    ? (r.recusadas?.ig_reels_avg_watch_time
                        ? "a Meta recusou ig_reels_avg_watch_time para este Reel"
                        : "tempo não medido nesta coleta")
                    : "ig_reels_avg_watch_time — métrica independente da taxa de abandono"} />
              </div>
            </div>
          </article>
        ))}

        {/* O corte é DITO, e o número que falta aparece: uma lista truncada em
            silêncio se lê como a lista inteira. */}
        {ordenados.length > TETO_VISIVEL && (
          <button type="button" onClick={() => setTodos((v) => !v)}
            className="w-full px-3.5 py-2.5 text-[11px] font-semibold text-muted-foreground
                       hover:text-foreground hover:bg-foreground/[0.03] transition-colors duration-150">
            {todos
              ? "Mostrar menos"
              : `Ver os outros ${ordenados.length - TETO_VISIVEL} Reels`}
          </button>
        )}
      </div>

      <p className="text-[10px] text-muted-foreground/60 leading-snug">
        Traço significa métrica não medida nesta coleta, e nunca zero. Abandono e tempo médio são
        métricas independentes fornecidas pela API — o Spaces não estima curva de retenção por
        segundo, e nenhum número desta seção é derivado de views.
      </p>
    </section>
  );
}
