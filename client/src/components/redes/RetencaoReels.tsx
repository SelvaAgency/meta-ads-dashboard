/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Retenção dos Reels — painel de performance, não lista de cards
 * ─────────────────────────────────────────────────────────────────────────────
 *  A versão anterior tinha razão nos números e errava na forma: cada Reel virava
 *  um cartão, e uma conta com 30 Reels empurrava o resto da Social para fora da
 *  tela. Densidade aqui não é estética — é o que permite COMPARAR. Trinta
 *  cartões espaçados respondem "como foi cada Reel"; trinta linhas respondem
 *  "como os Reels estão indo", que é a pergunta.
 *
 *  ── Recolhida por padrão, e o recolhido já responde ────────────────────────
 *  O estado fechado não é um título com uma seta: ele traz os quatro números e
 *  as duas pontas. Quem só quer saber se a retenção está boa nunca precisa
 *  abrir. Um resumo que não responde nada transforma o clique em pedágio.
 *
 *  ── Altura teto e rolagem própria ──────────────────────────────────────────
 *  Mesmo aberta, a lista rola dentro de si. Sem isso, "expandir" seria devolver
 *  o problema que o colapso resolveu.
 *
 *  ── A leitura fica no cabeçalho, e não flutuando ───────────────────────────
 *  O hover escreve numa linha de altura fixa acima da lista. Um balão dentro de
 *  um contêiner com `overflow` seria recortado pela borda, e um balão fora do
 *  fluxo mexeria na altura — os dois quebram a exigência de página estável.
 *
 *  ── O que continua proibido ────────────────────────────────────────────────
 *  Nenhum número sai de `total_views`; nenhuma curva por segundo; ausência
 *  nunca vira zero. Ver `shared/retencaoDeReels.ts` — a lógica não mudou nesta
 *  rodada, só a forma.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useState } from "react";
import { ChevronDown, Clapperboard } from "lucide-react";
import {
  NOTA_DA_RETENCAO, formatarSegundos, formatarTaxa, rankingDeAbandono,
  resumoDaRetencao, type ReelMedido,
} from "@shared/retencaoDeReels";
import { COR, COR_TIPO } from "@shared/coresSociais";

const CHAVE = "spaces_social_retencao_aberta";

/** Recolhida por padrão: o resumo responde, e o detalhe é aprofundamento. */
function lerAberta(): boolean {
  try {
    return localStorage.getItem(CHAVE) === "1";
  } catch {
    return false;
  }
}

const fmt = (v: number | null) => (v == null ? "–" : v.toLocaleString("pt-BR"));

/** Milhares abreviados: a faixa de indicadores não comporta "54.977". */
const compacto = (v: number | null) => {
  if (v == null) return "–";
  if (v < 10_000) return v.toLocaleString("pt-BR");
  const mil = v / 1000;
  return `${mil.toFixed(mil < 100 ? 1 : 0).replace(".", ",")} mil`;
};

const dataCurta = (iso: string | null) =>
  iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "sem data";

function Miniatura({ url, tamanho }: { url: string | null; tamanho: number }) {
  const [falhou, setFalhou] = useState(false);
  return (
    <span className="rounded-md overflow-hidden flex-shrink-0 grid place-items-center bg-muted"
      style={{ width: tamanho, height: tamanho }}>
      {url && !falhou
        ? <img src={url} alt="" className="w-full h-full object-cover" onError={() => setFalhou(true)} />
        : <Clapperboard className="w-3.5 h-3.5 text-muted-foreground/50" />}
    </span>
  );
}

/**
 * Um indicador da faixa: rótulo pequeno em cima, número grande colado embaixo.
 *
 * Sem o quadrado de ícone dos cartões da faixa de dados gerais — aqui são
 * quatro números numa tira, e quatro ícones roubariam a altura que a
 * compactação foi buscar.
 */
function Indicador({ rotulo, valor, cor, nota }: {
  rotulo: string; valor: string; cor?: string; nota?: string | null;
}) {
  const vazio = valor === "–";
  return (
    <div className="px-3.5 py-2.5 min-w-0">
      <span className="block text-[9.5px] font-bold uppercase tracking-[0.11em] text-muted-foreground/80 truncate">
        {rotulo}
      </span>
      <span className={`block text-[19px] font-bold tabular-nums leading-none tracking-tight mt-1 ${
        vazio ? "text-muted-foreground/40" : ""}`}
        style={vazio || !cor ? undefined : { color: cor }}>
        {valor}
      </span>
      {nota && (
        <span className="block text-[9.5px] text-muted-foreground/60 leading-snug mt-1 truncate" title={nota}>
          {nota}
        </span>
      )}
    </div>
  );
}

/**
 * Uma linha do ranking.
 *
 * Desktop: thumb · data · barra · taxa · tempo · views, tudo numa faixa de
 * 34px. Mobile: a mesma informação empilha em duas linhas dentro da própria
 * célula, e nada some — o pedido era compactar, não esconder.
 *
 * A barra usa escala 0–100 e não a maior taxa da amostra: com quatro Reels
 * entre 52% e 65%, escala relativa faria 13 pontos parecerem um abismo.
 */
function LinhaDoReel({ r, ativo, aoEntrar }: {
  r: ReelMedido; ativo: boolean; aoEntrar: (id: string | null) => void;
}) {
  const pct = r.skipRate as number;
  const conteudo = (
    <>
      <Miniatura url={r.thumbnailUrl} tamanho={26} />
      <span className="text-[10.5px] text-muted-foreground tabular-nums w-[38px] flex-shrink-0">
        {dataCurta(r.publicadoEm)}
      </span>
      {/* A barra some no mobile: com pouca largura ela vira um traço que não
          compara nada, e a porcentagem ao lado já diz o mesmo. */}
      <span className="hidden sm:block h-[9px] rounded-full bg-muted overflow-hidden min-w-0">
        <span className="block h-full rounded-full transition-opacity duration-150"
          style={{
            width: `${Math.max(1, Math.min(100, pct))}%`,
            background: COR_TIPO.REELS,
            opacity: ativo ? 1 : 0.85,
          }} />
      </span>
      <span className="text-[12px] font-bold tabular-nums w-[52px] text-right flex-shrink-0"
        style={{ color: COR_TIPO.REELS }}>
        {formatarTaxa(pct)}
      </span>
      {/* Tempo e views em colunas próprias, alinhadas à direita: o olho desce a
          coluna comparando, que é o que uma tabela faz melhor que um cartão. */}
      <span className="hidden md:block text-[11px] tabular-nums text-muted-foreground w-[54px] text-right flex-shrink-0"
        title={r.avgWatchTimeMs == null ? "tempo médio indisponível nesta coleta" : undefined}>
        {formatarSegundos(r.avgWatchTimeMs)}
      </span>
      <span className="hidden lg:block text-[11px] tabular-nums text-muted-foreground w-[68px] text-right flex-shrink-0"
        title={r.views == null ? "visualizações indisponíveis nesta coleta" : undefined}>
        {fmt(r.views)}
      </span>
    </>
  );

  const classe = "grid grid-cols-[auto_auto_minmax(0,1fr)_auto] md:grid-cols-[auto_auto_minmax(0,1fr)_auto_auto]"
    + " lg:grid-cols-[auto_auto_minmax(0,1fr)_auto_auto_auto] items-center gap-2.5 px-2 py-[7px] rounded-md"
    + ` transition-colors duration-150 ${ativo ? "bg-foreground/[0.045]" : "hover:bg-foreground/[0.03]"}`;

  return r.permalink ? (
    <a href={r.permalink} target="_blank" rel="noopener noreferrer" className={classe}
      onMouseEnter={() => aoEntrar(r.mediaId)} onMouseLeave={() => aoEntrar(null)}>
      {conteudo}
    </a>
  ) : (
    <div className={classe} onMouseEnter={() => aoEntrar(r.mediaId)} onMouseLeave={() => aoEntrar(null)}>
      {conteudo}
    </div>
  );
}

/**
 * A leitura do Reel sob o mouse — altura fixa, sempre montada.
 *
 * Mesmo sem nada em foco a linha existe, com a legenda das colunas. É isso que
 * mantém a página imóvel: aparecer e sumir mudaria a altura a cada movimento
 * do mouse.
 */
function LeituraDoReel({ r }: { r: ReelMedido | null }) {
  if (!r) {
    return (
      <span className="text-[10px] text-muted-foreground/50">
        escala 0–100% · passe o mouse para o detalhe
      </span>
    );
  }
  return (
    <span className="flex items-center gap-2.5 flex-wrap text-[10.5px] tabular-nums">
      <span className="font-bold">{dataCurta(r.publicadoEm)}</span>
      <span style={{ color: COR_TIPO.REELS }}>Abandono {formatarTaxa(r.skipRate)}</span>
      <span style={{ color: COR.engajamento }}>
        Tempo {r.avgWatchTimeMs == null ? "indisponível" : formatarSegundos(r.avgWatchTimeMs)}
      </span>
      <span style={{ color: COR.visitas }}>
        Views {r.views == null ? "indisponíveis" : fmt(r.views)}
      </span>
    </span>
  );
}

export function RetencaoReels({ reels, houveColeta = true }: {
  reels: ReelMedido[];
  houveColeta?: boolean;
}) {
  const [aberta, setAberta] = useState(lerAberta);
  const [ativo, setAtivo] = useState<string | null>(null);
  /** A mesma lista, lida dos dois lados — sem duplicar bloco nem rolagem. */
  const [ordem, setOrdem] = useState<"maior" | "menor">("maior");

  const resumo = resumoDaRetencao(reels);
  const ranking = rankingDeAbandono(reels);
  const lista = ordem === "maior" ? ranking.ordenados : [...ranking.ordenados].reverse();
  const emFoco = ranking.ordenados.find((r) => r.mediaId === ativo) ?? null;
  const vazio = !ranking.ordenados.length;

  const alternar = () => {
    setAberta((v) => {
      const novo = !v;
      try { localStorage.setItem(CHAVE, novo ? "1" : "0"); } catch { /* modo privado */ }
      return novo;
    });
  };

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
            amostra pequena
          </span>
        )}
      </div>

      <div className="rounded-[20px] border border-border bg-card overflow-hidden
                      shadow-[0_1px_2px_rgba(10,10,10,.04)]">
        {/* ── A faixa de indicadores · sempre visível ───────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-border">
          <Indicador rotulo="Reels analisados" valor={String(resumo.total)}
            nota={resumo.reelsComTaxa < resumo.total
              ? `${resumo.reelsComTaxa} com taxa medida`
              : null} />
          <Indicador rotulo="Abandono médio" valor={formatarTaxa(resumo.taxaMedia)} cor={COR_TIPO.REELS}
            /* "Média de N Reels", nunca "taxa da conta": ponderá-la por views
               usaria o denominador que a sondagem proibiu. */
            nota={resumo.reelsComTaxa
              ? `média de ${resumo.reelsComTaxa} reel(s)`
              : houveColeta ? "indisponível nesta coleta" : "sem coleta no período"} />
          <Indicador rotulo="Tempo médio" valor={formatarSegundos(resumo.tempoMedioMs)} cor={COR.engajamento}
            nota={resumo.reelsComTempo
              ? `média de ${resumo.reelsComTempo} reel(s)`
              : houveColeta ? "indisponível nesta coleta" : "sem coleta no período"} />
          <Indicador rotulo="Visualizações" valor={compacto(resumo.views)} cor={COR.visitas}
            nota={resumo.reelsComViews
              ? `soma de ${resumo.reelsComViews} reel(s)`
              : "indisponíveis nesta coleta"} />
        </div>

        {/* ── As duas pontas + o gatilho ────────────────────────────────── */}
        <div className="border-t border-border flex items-center justify-between gap-3 flex-wrap
                        px-3.5 py-2">
          <span className="flex items-center gap-3 flex-wrap text-[11px] tabular-nums">
            {resumo.menorTaxa != null ? (
              <>
                <span className="text-muted-foreground">
                  Menor abandono <b className="text-foreground">{formatarTaxa(resumo.menorTaxa)}</b>
                </span>
                <span className="text-muted-foreground/30">·</span>
                <span className="text-muted-foreground">
                  Maior abandono <b className="text-foreground">{formatarTaxa(resumo.maiorTaxa)}</b>
                </span>
              </>
            ) : (
              <span className="text-muted-foreground/60 text-[10.5px]">
                {resumo.total === 0 ? "Nenhum Reel no período." : "Nenhuma taxa medida no período."}
              </span>
            )}
          </span>

          {!vazio && (
            <button type="button" onClick={alternar} aria-expanded={aberta}
              className="text-[11px] font-semibold inline-flex items-center gap-1 px-2 py-1 rounded-md
                         text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04]
                         transition-colors duration-150">
              {aberta ? "Ocultar detalhes" : "Ver detalhes"}
              <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${
                aberta ? "rotate-180" : ""}`} />
            </button>
          )}
        </div>

        {/* ── O detalhamento ────────────────────────────────────────────── */}
        {aberta && !vazio && (
          <div className="border-t border-border px-3.5 py-3 flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3 flex-wrap min-h-[20px]">
              {/* Uma lista só, lida dos dois lados: dois blocos separados
                  duplicariam os Reels do meio e a rolagem. */}
              <span className="inline-flex rounded-md border border-border overflow-hidden">
                {(["maior", "menor"] as const).map((o) => (
                  <button key={o} type="button" onClick={() => setOrdem(o)}
                    className={`text-[10px] font-bold uppercase tracking-[0.06em] px-2.5 py-1
                                transition-colors duration-150 ${
                      ordem === o ? "bg-foreground text-background"
                                  : "text-muted-foreground hover:bg-foreground/[0.04]"}`}>
                    {o === "maior" ? "Maior abandono" : "Menor abandono"}
                  </button>
                ))}
              </span>
              <LeituraDoReel r={emFoco} />
            </div>

            {/* Colunas nomeadas uma vez, no topo — e não repetidas em cada
                linha, que é o que engorda cartão. */}
            <div className="hidden md:grid grid-cols-[auto_auto_minmax(0,1fr)_auto_auto]
                            lg:grid-cols-[auto_auto_minmax(0,1fr)_auto_auto_auto] items-center gap-2.5 px-2
                            text-[9px] font-bold uppercase tracking-[0.1em] text-muted-foreground/60">
              <span className="w-[26px]" />
              <span className="w-[38px]">Data</span>
              <span />
              <span className="w-[52px] text-right">Abandono</span>
              <span className="w-[54px] text-right">Tempo</span>
              <span className="hidden lg:block w-[68px] text-right">Views</span>
            </div>

            {/* A rolagem própria: expandir não pode devolver o problema que o
                colapso resolveu. ~9 linhas antes de rolar. */}
            <div className="max-h-[320px] overflow-y-auto overflow-x-hidden -mx-1 px-1
                            flex flex-col gap-px">
              {lista.map((r) => (
                <LinhaDoReel key={r.mediaId} r={r} ativo={ativo === r.mediaId} aoEntrar={setAtivo} />
              ))}
            </div>

            {ranking.semTaxa.length > 0 && (
              <p className="text-[10px] text-muted-foreground/70 leading-snug pt-1">
                {ranking.semTaxa.length} reel(s) fora do ranking — {ranking.semTaxa[0].motivo}.
              </p>
            )}
          </div>
        )}

        {vazio && ranking.semTaxa.length > 0 && (
          <p className="border-t border-border px-3.5 py-2.5 text-[10.5px] text-muted-foreground/70">
            {ranking.semTaxa.length} reel(s) sem taxa de abandono — {ranking.semTaxa[0].motivo}.
          </p>
        )}
      </div>

      <p className="text-[10px] text-muted-foreground/60 leading-snug max-w-[80ch]">
        {NOTA_DA_RETENCAO}
      </p>
    </section>
  );
}
