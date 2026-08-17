/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Retenção dos Reels — o que a sondagem autorizou
 * ─────────────────────────────────────────────────────────────────────────────
 *  Este arquivo passou o mês inteiro dizendo "dado ainda não disponível". A
 *  sondagem de 17/08/2026 respondeu PARCIAL, e o que ela autorizou é exatamente
 *  o que está aqui — nem um número a mais.
 *
 *  ── O eixo é a TAXA DE ABANDONO, e ele é único ─────────────────────────────
 *  `reels_skip_rate` vem medida e já em percentual. O tempo médio aparece no
 *  cartão e no hover, nunca no mesmo eixo: os dois não compartilham unidade, e
 *  uma barra que misturasse "57,6" com "7,60" desenharia uma comparação que não
 *  existe.
 *
 *  ── O que esta tela NUNCA faz ──────────────────────────────────────────────
 *  Nenhum número sai de `total_views`. A sondagem mediu: `tempo total ÷ tempo
 *  médio` dá 7.957 espectadores implícitos, e `total_views` marcava 54.977. O
 *  denominador do tempo médio não é nenhuma métrica de views que a API entrega.
 *  Por isso views aparece como contagem isolada, e as três grandezas nunca se
 *  encontram numa divisão.
 *
 *  Também não há curva por segundo, e a nota de rodapé diz isso onde a pergunta
 *  nasce — a Meta enumerou os breakdowns válidos (`follow_type`, `surface_type`,
 *  `action_type`, `story_navigation_action_type`) e nenhum é temporal.
 *
 *  ── Ausência é dita, e nunca vira zero ─────────────────────────────────────
 *  Um Reel sem taxa fica fora do ranking com o motivo à mostra. Entrando como
 *  0%, ele lideraria "menor abandono" — o Reel que ninguém mediu virando o
 *  melhor da conta.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useState } from "react";
import { Clapperboard, Eye, Gauge, Timer } from "lucide-react";
import {
  NOTA_DA_RETENCAO, formatarSegundos, formatarTaxa, rankingDeAbandono,
  resumoDaRetencao, type ReelMedido,
} from "@shared/retencaoDeReels";
import { COR, COR_TIPO } from "@shared/coresSociais";

const fmt = (v: number | null) => (v == null ? "–" : v.toLocaleString("pt-BR"));

const dataCurta = (iso: string | null) =>
  iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "sem data";

/** A miniatura, com as iniciais do formato quando a URL assinada já expirou. */
function Miniatura({ url, tamanho }: { url: string | null; tamanho: number }) {
  const [falhou, setFalhou] = useState(false);
  return (
    <span className="rounded-[10px] overflow-hidden flex-shrink-0 grid place-items-center bg-muted"
      style={{ width: tamanho, height: tamanho }}>
      {url && !falhou
        ? <img src={url} alt="" className="w-full h-full object-cover" onError={() => setFalhou(true)} />
        : <Clapperboard className="w-4 h-4 text-muted-foreground/50" />}
    </span>
  );
}

function CartaoDaRetencao({ icone: Icone, cor, rotulo, valor, detalhe }: {
  icone: typeof Gauge; cor: string; rotulo: string; valor: string; detalhe: string | null;
}) {
  const vazio = valor === "–";
  return (
    <div className="flex flex-col px-4 py-4 min-w-0 transition-colors duration-150 hover:bg-foreground/[0.02]">
      <span className="w-8 h-8 rounded-[10px] grid place-items-center flex-shrink-0 mb-3"
        style={{ background: `${cor}29`, color: cor }}>
        <Icone className="w-4 h-4" strokeWidth={2.2} />
      </span>
      <span className="text-[10px] font-semibold uppercase tracking-[0.13em] text-muted-foreground mb-1">
        {rotulo}
      </span>
      <span className={`text-[28px] font-bold tabular-nums leading-none tracking-tight ${
        vazio ? "text-muted-foreground/40" : "text-foreground"}`}>
        {valor}
      </span>
      {detalhe && <span className="text-[10.5px] text-muted-foreground mt-1.5 leading-snug">{detalhe}</span>}
    </div>
  );
}

/**
 * O gráfico: uma barra por Reel, comprimento = taxa de abandono.
 *
 * A escala vai a 100 e não ao maior valor da amostra. Com quatro Reels entre
 * 52% e 65%, uma escala relativa faria o de 52% virar uma barra curtíssima e o
 * de 65% encostar na borda — a diferença de 13 pontos pareceria abissal. A
 * taxa é percentual: o eixo dela é 0–100, e a comparação fica na proporção real.
 */
function BarrasDeAbandono({ reels, ativo, aoEntrar }: {
  reels: ReelMedido[]; ativo: string | null; aoEntrar: (id: string | null) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {reels.map((r) => {
        const pct = r.skipRate as number;
        const destacado = ativo === r.mediaId;
        return (
          <div key={r.mediaId}
            className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 rounded-lg px-1.5 py-1
                       cursor-default transition-colors duration-150 hover:bg-foreground/[0.03]"
            onMouseEnter={() => aoEntrar(r.mediaId)} onMouseLeave={() => aoEntrar(null)}>
            <Miniatura url={r.thumbnailUrl} tamanho={26} />
            <span className="h-[13px] rounded-full bg-muted overflow-hidden">
              <span className="block h-full rounded-full transition-[width,opacity] duration-200"
                style={{
                  width: `${Math.max(1, Math.min(100, pct))}%`,
                  background: COR_TIPO.REELS,
                  opacity: ativo && !destacado ? 0.4 : 1,
                }} />
            </span>
            <span className={`text-[11.5px] font-bold tabular-nums w-[52px] text-right transition-colors ${
              destacado ? "text-foreground" : "text-muted-foreground"}`}>
              {formatarTaxa(pct)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** A leitura de um Reel — substitui a legenda quando o mouse entra numa barra. */
function LeituraDoReel({ r }: { r: ReelMedido }) {
  return (
    <div className="flex items-center gap-3 flex-wrap text-[11px] tabular-nums">
      <span className="font-bold">{dataCurta(r.publicadoEm)}</span>
      <span style={{ color: COR_TIPO.REELS }}>Abandono {formatarTaxa(r.skipRate)}</span>
      <span style={{ color: COR.engajamento }}>Tempo médio {formatarSegundos(r.avgWatchTimeMs)}</span>
      <span style={{ color: COR.visitas }}>Views {fmt(r.views)}</span>
    </div>
  );
}

function LinhaDoRanking({ r }: { r: ReelMedido }) {
  return (
    <a href={r.permalink ?? undefined} target="_blank" rel="noopener noreferrer"
      className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-2 py-2 rounded-lg
                 transition-colors duration-150 hover:bg-accent/20">
      <Miniatura url={r.thumbnailUrl} tamanho={38} />
      <span className="min-w-0">
        <span className="block text-[12px] font-bold tabular-nums leading-none">
          {formatarTaxa(r.skipRate)} <span className="font-normal text-muted-foreground">de abandono</span>
        </span>
        <span className="block text-[10.5px] text-muted-foreground mt-1">
          {dataCurta(r.publicadoEm)} · {formatarSegundos(r.avgWatchTimeMs)} médios · {fmt(r.views)} views
        </span>
      </span>
    </a>
  );
}

export function RetencaoReels({ reels, houveColeta = true }: {
  /** Só Reels. Publicações de outro formato não têm estas métricas. */
  reels: ReelMedido[];
  houveColeta?: boolean;
}) {
  const [ativo, setAtivo] = useState<string | null>(null);
  const resumo = resumoDaRetencao(reels);
  const ranking = rankingDeAbandono(reels);
  const emFoco = ranking.ordenados.find((r) => r.mediaId === ativo) ?? null;

  const vazio = !ranking.ordenados.length;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline gap-2.5 flex-wrap">
        <h2 className="text-[13px] font-bold uppercase tracking-[0.1em]">Retenção dos Reels</h2>
        <span className="text-[11px] text-muted-foreground/50">
          taxa medida pela API — sem curva estimada
        </span>
        {resumo.amostraPequena && (
          <span className="text-[10px] font-bold uppercase tracking-[0.04em] px-2 py-0.5 rounded-full
                           bg-amber-500/14 text-amber-700">
            amostra pequena · {resumo.total} reel(s)
          </span>
        )}
      </div>

      <div className="rounded-[20px] border border-border bg-card overflow-hidden
                      shadow-[0_1px_2px_rgba(10,10,10,.04)]">
        {/* ── Os três números, cada um sozinho na sua unidade ───────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-border">
          <CartaoDaRetencao icone={Gauge} cor={COR_TIPO.REELS} rotulo="Taxa de abandono"
            valor={formatarTaxa(resumo.taxaMedia)}
            /* "Média de N Reels", e não "taxa da conta": ponderá-la por views
               daria a taxa da conta usando o denominador que a sondagem
               proibiu. A frase é o que mantém o número honesto. */
            detalhe={resumo.reelsComTaxa
              ? `média de ${resumo.reelsComTaxa} reel(s) medido(s)`
              : houveColeta ? "não medida nesta coleta" : "sem coleta no período"} />

          <CartaoDaRetencao icone={Timer} cor={COR.engajamento} rotulo="Tempo médio assistido"
            valor={formatarSegundos(resumo.tempoMedioMs)}
            detalhe={resumo.reelsComTempo
              ? `média de ${resumo.reelsComTempo} reel(s) · em segundos`
              : houveColeta ? "não medido nesta coleta" : "sem coleta no período"} />

          <CartaoDaRetencao icone={Eye} cor={COR.visitas} rotulo="Visualizações"
            valor={fmt(resumo.views)}
            detalhe={resumo.reelsComViews
              ? `soma de ${resumo.reelsComViews} reel(s)`
              : "não medidas nesta coleta"} />
        </div>

        {vazio ? (
          <p className="px-5 py-6 text-center text-xs text-muted-foreground border-t border-border">
            {resumo.total === 0
              ? "Nenhum Reel no período."
              : `Os ${resumo.total} Reel(s) do período estão sem taxa de abandono medida.`}
          </p>
        ) : (
          <>
            {/* ── O gráfico: um eixo só, a taxa ─────────────────────────── */}
            <div className="border-t border-border px-5 py-[18px] flex flex-col gap-2.5">
              <div className="flex items-baseline justify-between gap-3 flex-wrap min-h-[18px]">
                <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/70">
                  Abandono por Reel
                </span>
                {emFoco
                  ? <LeituraDoReel r={emFoco} />
                  : <span className="text-[10px] text-muted-foreground/50">
                      escala 0–100% · passe o mouse para o detalhe
                    </span>}
              </div>
              <BarrasDeAbandono reels={ranking.ordenados} ativo={ativo} aoEntrar={setAtivo} />
            </div>

            {/* ── Maior e menor abandono ────────────────────────────────── */}
            <div className="border-t border-border grid grid-cols-1 md:grid-cols-2
                            divide-y md:divide-y-0 md:divide-x divide-border">
              <div className="px-4 py-4">
                <span className="block text-[10px] font-bold uppercase tracking-[0.13em]
                                 text-muted-foreground mb-2">
                  Maior abandono
                </span>
                <div className="flex flex-col">
                  {ranking.maiorAbandono.map((r) => <LinhaDoRanking key={r.mediaId} r={r} />)}
                </div>
              </div>
              <div className="px-4 py-4">
                <span className="block text-[10px] font-bold uppercase tracking-[0.13em]
                                 text-muted-foreground mb-2">
                  Menor abandono
                </span>
                <div className="flex flex-col">
                  {ranking.menorAbandono.map((r) => <LinhaDoRanking key={r.mediaId} r={r} />)}
                </div>
              </div>
            </div>
          </>
        )}

        {/* Os que ficaram de fora, com o motivo: recusa e silêncio não são a
            mesma coisa, e sumir com eles esconderia a diferença. */}
        {ranking.semTaxa.length > 0 && (
          <p className="border-t border-border px-5 py-3 text-[10.5px] text-muted-foreground/70 leading-snug">
            {ranking.semTaxa.length} reel(s) fora do ranking — {ranking.semTaxa[0].motivo}.
          </p>
        )}
      </div>

      <p className="text-[10px] text-muted-foreground/60 leading-snug max-w-[80ch]">
        {NOTA_DA_RETENCAO}
      </p>
    </section>
  );
}
