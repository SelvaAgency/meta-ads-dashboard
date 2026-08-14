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

export interface PublicacaoEmLinha {
  id: string;
  tipo: TipoConteudo;
  quando: string | null;
  thumb: string | null;
  permalink: string | null;
  legenda: string | null;
  alcance: number | null;
  interacoes: number | null;
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
          {instagram.map((p) => <CardDePublicacao key={p.id} p={p} />)}
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
function CardDePublicacao({ p }: { p: PublicacaoEmLinha }) {
  const quando = quandoTexto(p.quando);
  return (
    <a href={p.permalink ?? "#"} target="_blank" rel="noopener noreferrer"
      className="group rounded-xl border border-border bg-card overflow-hidden hover:border-primary/40 hover:shadow-md transition-all">
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
        <span className="absolute top-2 left-2 text-[9px] font-semibold uppercase tracking-wider
                         px-1.5 py-0.5 rounded bg-black/55 text-white backdrop-blur-sm">
          {ROTULO_CONTEUDO[p.tipo]}
        </span>
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
export function PerformanceDeConteudo({ melhores, porTipo, aviso, amostraPequena }: {
  melhores: PublicacaoEmLinha[];
  porTipo: DesempenhoPorTipo[];
  aviso?: string | null;
  amostraPequena: boolean;
}) {
  if (!melhores.length && !porTipo.length) {
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
      <div className="flex items-baseline gap-2 flex-wrap">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Performance de conteúdo
        </h2>
        {amostraPequena && (
          <span className="text-[10px] text-amber-600">amostra pequena — leia como indício, não conclusão</span>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">
            Melhores publicações
          </h3>
          {melhores.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sem alcance medido para ordenar.</p>
          ) : (
            <div className="rounded-xl border border-border bg-card divide-y divide-border/50">
              {melhores.map((p, i) => (
                <div key={p.id} className="flex items-center gap-2.5 px-3 py-2">
                  <span className="w-4 text-xs font-bold tabular-nums text-muted-foreground/40">{i + 1}</span>
                  <LinhaCompacta p={p} />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">
            Desempenho por tipo
          </h3>
          <div className="rounded-xl border border-border bg-card divide-y divide-border/50">
            {porTipo.map((t) => (
              <div key={t.tipo} className="flex items-center gap-3 px-3 py-2.5">
                <TrendingUp className="w-3.5 h-3.5 text-muted-foreground/40 flex-shrink-0" />
                <span className="text-sm text-foreground flex-1 min-w-0">
                  {t.rotulo}
                  {/* A contagem cola no nome: uma média de 2 e uma de 30 têm a
                      mesma aparência sem ela. */}
                  <span className="text-[11px] text-muted-foreground ml-1.5">
                    {t.publicacoes} {t.publicacoes === 1 ? "publicação" : "publicações"}
                  </span>
                </span>
                <span className="text-xs tabular-nums text-right flex-shrink-0">
                  <span className="block text-foreground font-medium">{fmt(t.alcanceMedio)}</span>
                  <span className="block text-[9px] uppercase tracking-wider text-muted-foreground/50">alcance médio</span>
                </span>
                <span className="text-xs tabular-nums text-right flex-shrink-0 w-14">
                  <span className="block text-foreground font-medium">
                    {t.taxaMedia == null ? "–" : `${t.taxaMedia.toFixed(1)}%`}
                  </span>
                  <span className="block text-[9px] uppercase tracking-wider text-muted-foreground/50">taxa</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {aviso && <p className="text-[10px] text-muted-foreground/70">{aviso}</p>}
    </section>
  );
}
