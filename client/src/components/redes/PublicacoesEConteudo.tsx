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
import { COR_INTERACAO, COR_TIPO } from "@shared/coresSociais";
import { composicaoDoEngajamento } from "@shared/engajamento";
import type { EtiquetaDeDesempenho, NivelDeDesempenho } from "@shared/desempenhoDaPublicacao";

/**
 * Rótulos curtos para o cartão.
 *
 * "compartilhamentos" tem 17 caracteres e quebraria a linha da composição num
 * cartão de ~200px. O nome completo continua vindo de `composicaoDoEngajamento`
 * — aqui só se encurta o que a largura não comporta.
 */
const ROTULO_CURTO: Partial<Record<string, string>> = {
  likes: "curtidas",
  comments: "coment.",
  shares: "compart.",
  saves: "salvos",
  replies: "respostas",
};

/**
 * O tom de cada nível.
 *
 * Verde e vermelho só nos extremos: se todo nível tivesse cor, a grade viraria
 * um semáforo e "na média" — que é a maioria — competiria com o conteúdo.
 */
const TOM_ETIQUETA: Record<NivelDeDesempenho, string> = {
  muito_acima: "bg-emerald-600/85 text-white",
  acima: "bg-emerald-600/70 text-white",
  na_media: "bg-black/55 text-white",
  abaixo: "bg-amber-600/80 text-white",
  muito_abaixo: "bg-destructive/85 text-white",
};

export interface PublicacaoEmLinha {
  id: string;
  tipo: TipoConteudo;
  quando: string | null;
  thumb: string | null;
  permalink: string | null;
  legenda: string | null;
  alcance: number | null;
  /** O bruto medido pela Meta. Vai para o hover da taxa, não para a grade. */
  interacoes: number | null;
  /**
   * De que o engajamento é feito. Cada parcela vem do snapshot da mídia, e a
   * ausente fica FORA da lista — nunca vira zero, que afirmaria "ninguém
   * salvou" onde houve "não medimos".
   */
  curtidas: number | null;
  comentarios: number | null;
  compartilhamentos: number | null;
  salvamentos: number | null;
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

export interface DesempenhoPorTipo {
  tipo: TipoConteudo;
  rotulo: string;
  publicacoes: number;
  /** Média de alcance. `null` quando nenhuma publicação do tipo tem alcance. */
  alcanceMedio: number | null;
  taxaMedia: number | null;
}

// ─── Publicações do período ──────────────────────────────────────────────────
//
// O nome era "Últimas publicações", e ele mentia de leve: a lista NÃO é das
// últimas — é das publicações do período selecionado no filtro. Com 30 dias
// escolhidos, "últimas" sugeria as mais recentes de todas, e o recorte real
// nunca foi esse. O componente continua `UltimasPublicacoes` no código porque
// renomear o símbolo tocaria seis arquivos para não mudar comportamento nenhum.

/**
 * ── A imagem é a informação ────────────────────────────────────────────────
 * Quadrado inteiro no topo do card, quatro por linha no desktop. Nada de texto
 * sobre a arte além do selo de tipo: legenda sobreposta disputaria com o próprio
 * conteúdo do post, que é o que se quer reconhecer de relance.
 *
 * A legenda saiu do card. Em quatro colunas ela vira duas linhas de texto
 * truncado que empurram os números para fora do campo de visão — e quem escaneia
 * esta seção procura desempenho, não texto.
 *
 * ── A aba do LinkedIn só existe quando existe LinkedIn ─────────────────────
 * Aba visível e vazia diria "não publicaram nada no LinkedIn", que é afirmação
 * sobre o cliente. A verdade é "não temos conexão" — afirmação sobre nós.
 */
export function UltimasPublicacoes({ instagram, temLinkedin, aviso, etiquetas }: {
  instagram: PublicacaoEmLinha[];
  temLinkedin: boolean;
  aviso?: string | null;
  /**
   * As etiquetas, por id. Vazio quando a amostra não sustenta classificação —
   * e aí o aro de "melhor" antigo volta a ser o único destaque, que é uma
   * afirmação bem mais fraca e cabe numa amostra pequena.
   */
  etiquetas?: Map<string, EtiquetaDeDesempenho>;
}) {
  const [aba, setAba] = useState<"instagram" | "linkedin">("instagram");
  const melhorTaxa = instagram.length > 1
    ? Math.max(...instagram.map((p) => p.taxa ?? -1))
    : null;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div className="flex items-baseline gap-2.5 flex-wrap">
          <h2 className="text-[13px] font-bold uppercase tracking-[0.1em]">Publicações do período</h2>
          <span className="text-[11px] text-muted-foreground/50">
            a imagem é a informação · o melhor do período vem marcado
          </span>
        </div>
        {/* A fila de abas só é desenhada com mais de uma opção: uma aba sozinha
            não é escolha, é decoração. */}
        {temLinkedin && (
          <div className="flex items-center gap-0.5 border-b border-border">
            {(["instagram", "linkedin"] as const).map((r) => (
              <button key={r} onClick={() => setAba(r)}
                className={`relative px-3.5 py-[7px] text-xs capitalize transition-colors ${
                  aba === r ? "font-bold text-foreground" : "font-semibold text-muted-foreground/60 hover:text-muted-foreground"
                }`}>
                {r}
                {aba === r && <span className="absolute inset-x-2.5 -bottom-px h-[2px] rounded-full bg-accent" />}
              </button>
            ))}
          </div>
        )}
      </div>

      {aba === "linkedin" ? (
        <p className="text-sm text-muted-foreground">Publicações do LinkedIn aparecem quando a coleta começar.</p>
      ) : instagram.length === 0 ? (
        <p className="text-sm text-muted-foreground">{aviso ?? "Nenhuma publicação no período."}</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {instagram.map((p) => (
            <CardDePublicacao key={p.id} p={p} etiqueta={etiquetas?.get(p.id)}
              melhor={melhorTaxa != null && p.taxa != null && p.taxa === melhorTaxa} />
          ))}
        </div>
      )}
    </section>
  );
}

function CardDePublicacao({ p, melhor, etiqueta }: {
  p: PublicacaoEmLinha; melhor?: boolean; etiqueta?: EtiquetaDeDesempenho;
}) {
  const quando = quandoTexto(p.quando);
  const [falhou, setFalhou] = useState(false);
  const temImagem = !!p.thumb && !falhou;

  /**
   * As parcelas medidas, na ordem em que se lê engajamento.
   *
   * `composicaoDoEngajamento` já resolve a regra: parcela ausente sai da lista
   * em vez de virar zero. Reusá-la aqui evita uma segunda implementação da
   * mesma decisão — e é a decisão, não a lista, que precisa ser única.
   */
  const partes = composicaoDoEngajamento({
    likes: p.curtidas, comments: p.comentarios,
    shares: p.compartilhamentos, saves: p.salvamentos,
  }, p.interacoes).partes;

  return (
    <a href={p.permalink ?? "#"} target="_blank" rel="noopener noreferrer"
      /* O melhor do período ganha ARO, não tamanho: card maior quebraria a grade
         de quatro e empurraria os outros três para baixo da dobra. */
      className={`group rounded-[14px] border bg-card overflow-hidden transition-all duration-200
        hover:-translate-y-[3px] hover:shadow-[0_12px_32px_rgba(10,10,10,.10)]
        ${melhor
          ? "border-accent shadow-[0_0_0_2px_rgba(232,122,176,.22),0_4px_16px_rgba(10,10,10,.06)]"
          : "border-border shadow-[0_1px_2px_rgba(10,10,10,.04)] hover:border-primary"}`}>
      <div className="aspect-square relative overflow-hidden bg-muted">
        {temImagem ? (
          <img src={p.thumb!} alt="" loading="lazy"
            /* A URL do CDN da Meta é assinada e EXPIRA. Sem o fallback, a
               publicação antiga viraria um retângulo quebrado — que parece erro
               nosso, e não limite da origem. */
            onError={() => setFalhou(true)}
            className="w-full h-full object-cover transition-transform duration-[400ms] group-hover:scale-[1.05]" />
        ) : (
          <div className="w-full h-full grid place-items-center bg-gradient-to-br from-muted to-secondary">
            <ImageIcon className="w-8 h-8 text-muted-foreground/25" />
          </div>
        )}
        <span className="absolute top-2.5 left-2.5 text-[9px] font-bold uppercase tracking-[0.08em]
                         px-[7px] py-[3px] rounded-md bg-black/60 text-white backdrop-blur-[4px]">
          {ROTULO_CONTEUDO[p.tipo]}
        </span>
        {/* A etiqueta de desempenho fica sobre a imagem, na quina oposta ao
            tipo. Ela só existe com amostra suficiente — ver
            `etiquetarDesempenho` —, e o `title` carrega o porquê: sem ele o
            rótulo é um veredito sem argumento. */}
        {etiqueta && (etiqueta.extremo || etiqueta.nivel === "muito_acima"
          || etiqueta.nivel === "muito_abaixo") && (
          <span title={etiqueta.motivo}
            className={`absolute top-2.5 right-2.5 text-[9px] font-bold uppercase tracking-[0.06em]
                        px-[7px] py-[3px] rounded-md backdrop-blur-[4px] ${TOM_ETIQUETA[etiqueta.nivel]}`}>
            {etiqueta.extremo === "melhor" ? "melhor do período"
              : etiqueta.extremo === "pior" ? "pior do período"
              : etiqueta.rotulo}
          </span>
        )}
        {melhor && !etiqueta && (
          <span className="absolute top-2.5 right-2.5 text-[9px] font-bold uppercase tracking-[0.06em]
                           px-[7px] py-[3px] rounded-md bg-primary text-primary-foreground">
            melhor
          </span>
        )}
      </div>

      <div className="px-[13px] pt-3 pb-[13px]">
        {quando && (
          <span className="block text-[10px] uppercase tracking-[0.06em] text-muted-foreground/40 tabular-nums">
            {quando}
          </span>
        )}
        <div className="grid grid-cols-3 gap-1.5 mt-2.5">
          <Numero rotulo="alcance" valor={fmt(p.alcance)} />
          <Numero rotulo="views" valor={fmt(p.views)} />
          {/* O bruto das interações sai da grade e vira o hover da taxa: ele é o
              numerador dela, e os dois no mesmo lugar dizem de onde o percentual
              veio sem gastar uma coluna. */}
          <Numero rotulo="taxa" destaque
            valor={p.taxa == null ? "–" : `${p.taxa.toFixed(1)}%`}
            dica={p.interacoes == null
              ? "taxa sobre o alcance"
              : `${fmt(p.interacoes)} interações no total, sobre o alcance`} />
        </div>

        {/* A composição, no lugar do total: "312 curtidas · 24 comentários" diz
            o que "389 interações" escondia — e é ela que separa um post que
            gerou conversa de um que só levou curtida. */}
        {partes.length > 0 && (
          <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-2">
            {partes.map((x) => (
              <span key={x.chave} className="inline-flex items-center gap-1 text-[10.5px] tabular-nums
                                             text-muted-foreground">
                <i className="w-[5px] h-[5px] rounded-full flex-shrink-0"
                  style={{ background: COR_INTERACAO[x.chave] ?? "currentColor" }} />
                {fmt(x.total)}
                <span className="text-muted-foreground/60">{ROTULO_CURTO[x.chave] ?? x.rotulo}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </a>
  );
}

function Numero({ rotulo, valor, destaque, miudo, dica }: {
  rotulo: string; valor: string; destaque?: boolean; miudo?: boolean; dica?: string;
}) {
  const vazio = valor === "–";
  return (
    <span className="flex flex-col leading-tight min-w-0" title={dica ?? rotulo}>
      <span className={`tabular-nums truncate ${miudo ? "text-[12px] text-muted-foreground" : "text-sm font-bold"} ${
        destaque && !vazio ? "text-accent" : vazio ? "text-muted-foreground/40" : ""}`}>
        {valor}
      </span>
      <span className="text-[9px] uppercase tracking-[0.05em] text-muted-foreground/50 truncate">{rotulo}</span>
    </span>
  );
}

/**
 * Duas seções, e não uma dividida em duas colunas.
 *
 * O protótipo separa "Performance por tipo" (quatro cartões em largura cheia) de
 * "Melhores → piores" (um cartão em largura cheia). Lado a lado, cada uma ficava
 * com metade da largura: os cartões de tipo espremiam os dois números que
 * carregam, e o ranking perdia a barra de alcance no mobile.
 *
 * São perguntas diferentes, e cada uma precisa da linha inteira: qual FORMATO
 * funciona, e qual PUBLICAÇÃO funcionou.
 */
export function PerformanceDeConteudo({ melhores, piores, porTipo, aviso, amostraPequena }: {
  melhores: PublicacaoEmLinha[];
  piores: PublicacaoEmLinha[];
  porTipo: DesempenhoPorTipo[];
  aviso?: string | null;
  amostraPequena: boolean;
}) {
  const temRanking = melhores.length > 0;
  const maxAlcance = Math.max(1, ...[...melhores, ...piores].map((p) => p.alcance ?? 0));

  if (!temRanking && !porTipo.length) {
    return (
      <section className="flex flex-col gap-2">
        <h2 className="text-[13px] font-bold uppercase tracking-[0.1em]">Performance de conteúdo</h2>
        <p className="text-sm text-muted-foreground">
          {aviso ?? "Ainda não há publicações medidas no período."}
        </p>
      </section>
    );
  }

  return (
    <>
      {porTipo.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="flex items-baseline gap-2.5 flex-wrap">
            <h2 className="text-[13px] font-bold uppercase tracking-[0.1em]">Performance por tipo</h2>
            <span className="text-[11px] text-muted-foreground/50">
              qual formato está funcionando · a amostra vem colada no nome
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            {porTipo.map((t) => <CartaoDeTipo key={t.tipo} t={t} porTipo={porTipo} />)}
          </div>
        </section>
      )}

      {temRanking && (
        <section className="flex flex-col gap-3">
          <div className="flex items-baseline gap-2.5 flex-wrap">
            <h2 className="text-[13px] font-bold uppercase tracking-[0.1em]">Melhores → piores</h2>
            <span className="text-[11px] text-muted-foreground/50">
              ordenado por taxa · a barra é o alcance relativo
            </span>
            {amostraPequena && (
              <span className="text-[10px] text-amber-600">amostra pequena — indício, não conclusão</span>
            )}
          </div>
          <div className="rounded-[20px] border border-border bg-card p-3
                          shadow-[0_1px_2px_rgba(10,10,10,.04)]">
            <Faixa titulo="Melhores" />
            {melhores.map((p, i) => (
              <LinhaDoRanking key={p.id} p={p} pos={i + 1} maxAlcance={maxAlcance} destaque />
            ))}
            {piores.length > 0 && (
              <>
                <Faixa titulo="Piores" />
                {piores.map((p, i) => (
                  <LinhaDoRanking key={p.id} p={p} pos={melhores.length + i + 1} maxAlcance={maxAlcance} />
                ))}
              </>
            )}
          </div>
          {aviso && <p className="text-[10px] text-muted-foreground/70">{aviso}</p>}
        </section>
      )}
    </>
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
    <div className="rounded-xl border border-border bg-card p-4 border-l-[3px]
                    transition-shadow duration-150 hover:shadow-[0_4px_16px_rgba(10,10,10,.07)]"
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
