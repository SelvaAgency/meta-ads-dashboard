/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Social — publicações em linha e performance de conteúdo
 * ─────────────────────────────────────────────────────────────────────────────
 *  Duas seções com propósitos opostos, e é por isso que elas têm densidades
 *  diferentes:
 *
 *    ÚLTIMAS PUBLICAÇÕES   escanear. Uma linha por post, thumbnail pequena,
 *                          números na mesma altura. Ninguém lê — passa o olho.
 *    PERFORMANCE           analisar. Menos itens, mais contexto por item, e o
 *                          tamanho da amostra dito em voz alta.
 *
 *  ── A aba do LinkedIn só existe quando existe LinkedIn ─────────────────────
 *  Uma aba visível e vazia diz "não publicaram nada no LinkedIn", que é
 *  afirmação sobre o cliente. A verdade é "não temos conexão" — afirmação sobre
 *  nós. Enquanto não houver vínculo, a aba não aparece: uma aba só não é uma
 *  escolha, e não fingir escolha é melhor que oferecer uma que não leva a lugar
 *  nenhum.
 *
 *  ── Nenhum selo de impulsionado ────────────────────────────────────────────
 *  A sondagem existe (`sondagemImpulsionado`) e ainda não provou que a API
 *  distingue orgânico de pago. Até provar, nada aqui afirma. Um selo errado
 *  credencia a leitura: "impulsionado" num post orgânico faria alguém cortar um
 *  formato que funcionava.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useState } from "react";
import { ExternalLink, Image as ImageIcon, TrendingUp } from "lucide-react";
import { ROTULO_CONTEUDO, type TipoConteudo } from "@shared/tipoDeMidia";
import { COR_TIPO } from "@shared/coresSociais";

export interface PublicacaoEmLinha {
  id: string;
  tipo: TipoConteudo;
  quando: string | null;
  thumb: string | null;
  permalink: string | null;
  legenda: string | null;
  alcance: number | null;
  interacoes: number | null;
  /** Reproduções. Já vem no snapshot de mídia — nenhuma chamada nova. */
  views: number | null;
  /** Já calculada. `null` quando falta alcance — não se inventa divisor. */
  taxa: number | null;
}

const fmt = (n: number | null | undefined): string =>
  n == null ? "–" : n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });

const MESES = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];

/** "13 AGO, 18:30" — data e hora, porque as duas informam sobre publicação. */
function quandoTexto(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${d.getDate()} ${MESES[d.getMonth()]}, ${hh}:${mm}`;
}

// ─── Últimas publicações ─────────────────────────────────────────────────────

export function UltimasPublicacoes({ instagram, temLinkedin, aviso }: {
  instagram: PublicacaoEmLinha[];
  /** Só liga a aba quando existe conexão válida — nunca por padrão. */
  temLinkedin: boolean;
  aviso?: string | null;
}) {
  const [aba, setAba] = useState<"instagram" | "linkedin">("instagram");

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Últimas publicações
        </h2>
        {/* A fila de abas só é desenhada quando há mais de uma opção: uma aba
            sozinha não é escolha, é decoração. */}
        {temLinkedin && (
          <div className="flex items-center gap-0.5 border-b border-border/60">
            {(["instagram", "linkedin"] as const).map((r) => (
              <button key={r} onClick={() => setAba(r)}
                className={`relative px-3 py-1.5 text-xs capitalize transition-colors ${
                  aba === r ? "font-semibold text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}>
                {r}
                {aba === r && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />}
              </button>
            ))}
          </div>
        )}
      </div>

      {aba === "linkedin" ? (
        <p className="text-sm text-muted-foreground">Publicações do LinkedIn aparecem quando a coleta começar.</p>
      ) : instagram.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {aviso ?? "Nenhuma publicação no período."}
        </p>
      ) : (
        // Quatro por linha no desktop: a imagem é a informação, e uma fileira
        // de quatro cabe sem espremer. Duas no tablet, uma no celular.
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* O melhor é por TAXA, e só quando há mais de um: com uma publicação
              só, marcá-la de "melhor" não compara nada. */}
          {instagram.map((p) => (
            <CardDePublicacao key={p.id} p={p}
              melhor={instagram.length > 1 && p.taxa != null
                && p.taxa === Math.max(...instagram.map((x) => x.taxa ?? -1))} />
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * Uma publicação como card visual.
 *
 * A imagem ocupa o topo inteiro em proporção quadrada e os números ficam numa
 * faixa abaixo. Nenhum texto por cima da imagem além do selo de tipo: legenda
 * sobreposta disputaria com o próprio conteúdo do post, que é o que se quer
 * reconhecer de relance.
 *
 * A legenda saiu: em quatro colunas ela vira duas linhas de texto truncado que
 * empurram os números para fora do campo de visão — e quem escaneia esta seção
 * está procurando desempenho, não texto.
 */
function CardDePublicacao({ p, melhor }: { p: PublicacaoEmLinha; melhor?: boolean }) {
  const quando = quandoTexto(p.quando);
  return (
    <a href={p.permalink ?? "#"} target="_blank" rel="noopener noreferrer"
      /* O melhor do período ganha ARO, não tamanho: card maior quebraria a grade
         de quatro e empurraria os outros três para baixo da dobra. */
      className={`group rounded-xl border bg-card overflow-hidden transition-all
        hover:-translate-y-0.5 hover:shadow-lg
        ${melhor ? "border-accent shadow-[0_0_0_2px_rgba(232,122,176,.2)]" : "border-border hover:border-primary/50"}`}>
      <div className="aspect-square bg-muted relative overflow-hidden">
        {p.thumb ? (
          <img src={p.thumb} alt="" loading="lazy"
            className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
            // A URL do CDN da Meta é assinada e EXPIRA. Sem este fallback, a
            // publicação antiga viraria um retângulo quebrado — que parece
            // erro nosso, e não limite da origem.
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ImageIcon className="w-7 h-7 text-muted-foreground/25" />
          </div>
        )}
        <span className="absolute top-2 left-2 text-[9px] font-bold uppercase tracking-[0.08em]
                         px-1.5 py-0.5 rounded bg-black/60 text-white backdrop-blur-sm">
          {ROTULO_CONTEUDO[p.tipo]}
        </span>
        {melhor && (
          <span className="absolute top-2 right-2 text-[9px] font-bold uppercase tracking-[0.06em]
                           px-1.5 py-0.5 rounded bg-primary text-primary-foreground">
            melhor
          </span>
        )}
      </div>

      <div className="p-3 flex flex-col gap-2">
        {quando && (
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70 tabular-nums">
            {quando}
          </span>
        )}
        <div className="grid grid-cols-3 gap-1">
          <Numero rotulo="alcance" valor={fmt(p.alcance)} />
          <Numero rotulo="interações" valor={fmt(p.interacoes)} />
          <Numero rotulo="taxa" valor={p.taxa == null ? "–" : `${p.taxa.toFixed(1)}%`} destaque />
        </div>
        {/* Views numa segunda linha, em corpo menor: ela informa consumo, e as
            três de cima informam desempenho. Na mesma linha, quatro números de
            peso igual não teriam hierarquia nenhuma. */}
        <div className="grid grid-cols-3 gap-1">
          <Numero rotulo="views" valor={fmt(p.views)} />
        </div>
      </div>
    </a>
  );
}

/**
 * Uma linha compacta — usada só no ranking, onde a ordem importa mais que a
 * imagem e caberiam menos itens se cada um fosse um card.
 */
function LinhaCompacta({ p }: { p: PublicacaoEmLinha }) {
  const quando = quandoTexto(p.quando);
  return (
    <a href={p.permalink ?? "#"} target="_blank" rel="noopener noreferrer"
      className="flex items-center gap-2.5 min-w-0 flex-1 group">
      <span className="w-9 h-9 rounded-md bg-muted overflow-hidden flex-shrink-0 flex items-center justify-center">
        {p.thumb
          ? <img src={p.thumb} alt="" loading="lazy" className="w-full h-full object-cover" />
          : <ImageIcon className="w-3.5 h-3.5 text-muted-foreground/40" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-medium text-foreground">{ROTULO_CONTEUDO[p.tipo]}</span>
        {quando && <span className="block text-[10px] text-muted-foreground tabular-nums">{quando}</span>}
      </span>
      <span className="text-xs tabular-nums text-right flex-shrink-0">
        <span className="block text-foreground font-semibold">
          {p.taxa == null ? "–" : `${p.taxa.toFixed(1)}%`}
        </span>
        <span className="block text-[9px] uppercase tracking-wider text-muted-foreground/50">
          {fmt(p.alcance)} alc.
        </span>
      </span>
    </a>
  );
}

function Numero({ rotulo, valor, destaque }: { rotulo: string; valor: string; destaque?: boolean }) {
  const vazio = valor === "–";
  return (
    <span className="flex flex-col leading-tight min-w-0">
      <span className={`text-xs tabular-nums truncate ${
        destaque && !vazio ? "text-foreground font-bold" : vazio ? "text-muted-foreground/40" : "text-foreground"
      }`}>
        {valor}
      </span>
      <span className="text-[9px] uppercase tracking-wider text-muted-foreground/50 truncate">{rotulo}</span>
    </span>
  );
}

// ─── Performance de conteúdo ─────────────────────────────────────────────────

export interface DesempenhoPorTipo {
  tipo: TipoConteudo;
  rotulo: string;
  publicacoes: number;
  /** Média de alcance. `null` quando nenhuma publicação do tipo tem alcance. */
  alcanceMedio: number | null;
  taxaMedia: number | null;
}

/**
 * O que funcionou, e com que confiança.
 *
 * ── Amostra pequena é dito, não escondido ──────────────────────────────────
 * Dois reels e um carrossel não provam que reel funciona melhor. A tela mostra
 * a contagem ao lado de cada tipo e avisa quando a amostra é pequena — sem isso,
 * uma média de duas publicações tem a mesma aparência de uma média de trinta, e
 * alguém muda a estratégia de conteúdo por causa de duas.
 */
/**
 * O que funcionou e o que não funcionou.
 *
 * ── Duas pontas, e não a lista inteira ─────────────────────────────────────
 * O ranking mostra três de cada extremo. A pergunta é qual formato funciona e
 * qual não — e o meio da lista não responde nem uma nem outra. Com oito linhas,
 * quem lê varre todas para descobrir que só as pontas importavam.
 *
 * A barra ao lado é ALCANCE relativo ao melhor do período, e não a taxa: a taxa
 * já é o número à direita, e repeti-la em barra não acrescentaria eixo nenhum.
 * Assim cada item traz duas dimensões — quanto engajou e quanta gente viu.
 *
 * ── Amostra pequena é dito, não escondido ──────────────────────────────────
 * Dois reels e um carrossel não provam que reel funciona melhor. A contagem cola
 * no nome do tipo, e o aviso aparece no cabeçalho: sem isso, a média de duas
 * publicações tem a mesma aparência da média de trinta.
 */
export function PerformanceDeConteudo({ melhores, piores, porTipo, aviso, amostraPequena }: {
  melhores: PublicacaoEmLinha[];
  piores: PublicacaoEmLinha[];
  porTipo: DesempenhoPorTipo[];
  aviso?: string | null;
  amostraPequena: boolean;
}) {
  const temRanking = melhores.length > 0;
  const maxAlcance = Math.max(
    1, ...[...melhores, ...piores].map((p) => p.alcance ?? 0));

  if (!temRanking && !porTipo.length) {
    return (
      <section className="flex flex-col gap-2">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Performance de conteúdo
        </h2>
        <p className="text-sm text-muted-foreground">{aviso ?? "Ainda não há publicações medidas no período."}</p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline gap-2.5 flex-wrap">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Performance de conteúdo
        </h2>
        {amostraPequena && (
          <span className="text-[10px] text-amber-600">amostra pequena — leia como indício, não conclusão</span>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* ── Ranking: melhores em cima, piores embaixo ── */}
        <div className="rounded-xl border border-border bg-card p-3">
          {temRanking ? (
            <>
              <Faixa titulo="Melhores" />
              {melhores.map((p, i) => (
                <LinhaDoRanking key={p.id} p={p} pos={i + 1} maxAlcance={maxAlcance} destaque />
              ))}
              {piores.length > 0 && (
                <>
                  <Faixa titulo="Piores" />
                  {piores.map((p, i) => (
                    <LinhaDoRanking key={p.id} p={p} pos={melhores.length + piores.length - piores.length + i + 1}
                      maxAlcance={maxAlcance} />
                  ))}
                </>
              )}
            </>
          ) : (
            <p className="text-xs text-muted-foreground p-2">Sem alcance medido para ordenar.</p>
          )}
        </div>

        {/* ── Desempenho por tipo ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 content-start">
          {porTipo.map((t) => <CartaoDeTipo key={t.tipo} t={t} porTipo={porTipo} />)}
        </div>
      </div>

      {aviso && <p className="text-[10px] text-muted-foreground/70">{aviso}</p>}
    </section>
  );
}

function Faixa({ titulo }: { titulo: string }) {
  return (
    <div className="flex items-center gap-2.5 px-2 pt-2 pb-1">
      <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground/70">{titulo}</span>
      <span className="flex-1 h-px bg-border" />
    </div>
  );
}

function LinhaDoRanking({ p, pos, maxAlcance, destaque }: {
  p: PublicacaoEmLinha; pos: number; maxAlcance: number; destaque?: boolean;
}) {
  const quando = quandoTexto(p.quando);
  const largura = Math.round(((p.alcance ?? 0) / maxAlcance) * 100);
  return (
    <a href={p.permalink ?? "#"} target="_blank" rel="noopener noreferrer"
      className="grid grid-cols-[16px_36px_minmax(0,1fr)_auto] sm:grid-cols-[16px_36px_minmax(0,1fr)_90px_46px]
                 gap-2.5 items-center px-2 py-2 rounded-lg hover:bg-accent/20 transition-colors">
      <span className="text-[11px] font-bold tabular-nums text-muted-foreground/50 text-center">{pos}</span>
      <span className="w-9 h-9 rounded-md bg-muted overflow-hidden flex-shrink-0 flex items-center justify-center">
        {p.thumb
          ? <img src={p.thumb} alt="" loading="lazy" className="w-full h-full object-cover" />
          : <ImageIcon className="w-3.5 h-3.5 text-muted-foreground/40" />}
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-semibold truncate">{ROTULO_CONTEUDO[p.tipo]}</span>
        <span className="block text-[10px] text-muted-foreground tabular-nums">
          {quando ?? "sem data"} · {fmt(p.interacoes)} inter.
        </span>
      </span>
      {/* A barra é ALCANCE relativo — a taxa já é o número da direita. */}
      <span className="hidden sm:block h-1.5 rounded-full bg-muted overflow-hidden"
        title={`Alcance ${fmt(p.alcance)} — ${largura}% do melhor do período`}>
        <span className="block h-full rounded-full" style={{ width: `${largura}%`, background: COR_TIPO[p.tipo] }} />
      </span>
      <span className={`text-xs font-bold tabular-nums text-right ${destaque ? "text-accent" : "text-muted-foreground"}`}>
        {p.taxa == null ? "–" : `${p.taxa.toFixed(1)}%`}
      </span>
    </a>
  );
}

function CartaoDeTipo({ t, porTipo }: { t: DesempenhoPorTipo; porTipo: DesempenhoPorTipo[] }) {
  const maxAlc = Math.max(1, ...porTipo.map((x) => x.alcanceMedio ?? 0));
  const rel = Math.round(((t.alcanceMedio ?? 0) / maxAlc) * 100);
  return (
    <div className="rounded-xl border border-border bg-card p-4 border-l-[3px]"
      style={{ borderLeftColor: COR_TIPO[t.tipo] }}>
      <div className="flex items-center gap-2">
        <i className="w-2 h-2 rounded-[3px] flex-shrink-0" style={{ background: COR_TIPO[t.tipo] }} />
        <span className="text-[11px] font-bold uppercase tracking-[0.08em]">{t.rotulo}</span>
      </div>
      <p className="text-[10px] text-muted-foreground/70 mt-0.5">
        {t.publicacoes} {t.publicacoes === 1 ? "publicação" : "publicações"}
        {t.publicacoes < 3 ? " · amostra pequena" : ""}
      </p>
      <div className="grid grid-cols-2 gap-2 mt-3">
        <span>
          <b className="block text-base font-bold tabular-nums">{fmt(t.alcanceMedio)}</b>
          <s className="block no-underline text-[9px] uppercase tracking-wider text-muted-foreground/60">alcance médio</s>
        </span>
        <span>
          <b className="block text-base font-bold tabular-nums">
            {t.taxaMedia == null ? "–" : `${t.taxaMedia.toFixed(1)}%`}
          </b>
          <s className="block no-underline text-[9px] uppercase tracking-wider text-muted-foreground/60">taxa média</s>
        </span>
      </div>
      <div className="mt-3">
        <span className="block h-1 rounded-full bg-muted overflow-hidden"
          title="Alcance médio relativo ao melhor formato do período">
          <span className="block h-full rounded-full" style={{ width: `${rel}%`, background: COR_TIPO[t.tipo] }} />
        </span>
        <p className="text-[9px] uppercase tracking-wider text-muted-foreground/50 mt-1">
          {rel}% do melhor formato
        </p>
      </div>
    </div>
  );
}
