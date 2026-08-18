/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Social — os três gráficos, em SVG escrito à mão
 * ─────────────────────────────────────────────────────────────────────────────
 *  ── Por que sem recharts ───────────────────────────────────────────────────
 *  O protótipo aprovado desenha os gráficos em SVG direto, e o código dele É a
 *  especificação: espessura 2.2, grade horizontal pontilhada 3-4, barras a 42%
 *  ou 62% do passo, eixo do meio a 56% da altura, rótulos completos com 44px de
 *  folga à esquerda.
 *
 *  Reproduzir isso em recharts significaria brigar com os defaults dele em cada
 *  detalhe — e o resultado ficaria "parecido". Escrito à mão, o gráfico é
 *  exatamente o do protótipo, com uma vantagem que não era o objetivo: o pacote
 *  sai do caminho destas três telas.
 *
 *  ── O que os gráficos NÃO fazem ────────────────────────────────────────────
 *  Nenhum deles transforma o dado. Nada de normalização: seguidores vive na casa
 *  dos milhares e visitas nas dezenas, e cada um tem o seu eixo — o número
 *  continua sendo o número. E buraco de coleta é buraco: a linha corta, porque
 *  ligar por cima desenharia uma reta que ninguém mediu.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useState } from "react";
import { COR, COR_TIPO, ORDEM_TIPO } from "@shared/coresSociais";
import { intervaloDeRotulos, pilhaDoDia } from "@shared/escalaDosGraficos";
import { escalaDaVariacao, type DiaDeVariacao, type MovimentoDiario } from "@shared/movimentoDiario";
import { ROTULO_CONTEUDO, type TipoConteudo } from "@shared/tipoDeMidia";

const fmt = (v: number) => Math.round(v).toLocaleString("pt-BR");
/**
 * O tom dos eixos é o MESMO texto secundário do resto da Social.
 *
 * Antes era preto a 42% de opacidade — que sobre o cartão claro vira um cinza
 * perto de #949494, e as datas sumiam. A opacidade parecia hierarquia e era só
 * apagamento: um rótulo de eixo que só aparece sob o mouse não é secundário,
 * é ilegível. O token resolve os dois temas de uma vez, e mantém a hierarquia
 * pelo tamanho (9px) em vez de pelo contraste.
 */
const EIXO = "fill-muted-foreground";
const GRADE = "stroke-[rgba(10,10,10,.07)] dark:stroke-[rgba(255,255,255,.09)]";

/**
 * A moldura comum.
 *
 * `leitura` é a caixa do dia sob o mouse, e ela substitui a LEGENDA em vez de
 * aparecer flutuando: tooltip que segue o cursor tapa justamente a barra que se
 * está tentando ler, e num gráfico de trinta dias a barra vizinha é o contexto.
 * No lugar da legenda, a posição é fixa e o olho aprende onde procurar.
 */
function Moldura({ titulo, nota, legenda, leitura, vazio, altura, children }: {
  titulo: string; nota?: string | null; legenda?: React.ReactNode; leitura?: React.ReactNode;
  vazio: boolean; altura: number; children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <div className="flex items-baseline justify-between gap-3 flex-wrap min-h-[18px]">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/70">
            {titulo}
          </span>
          {nota && !leitura && <span className="text-[10px] text-muted-foreground/50">{nota}</span>}
        </div>
        {leitura ?? legenda}
      </div>
      {vazio ? (
        <div style={{ height: altura }} className="flex items-center justify-center text-xs text-muted-foreground">
          Sem dados suficientes no período.
        </div>
      ) : children}
    </div>
  );
}

/**
 * A leitura de um dia de ativações — total primeiro, composição depois.
 *
 * Só os tipos que o dia teve. Listar "0 reels" num dia sem reels transformaria
 * a leitura numa tabela de ausências, e o que se quer saber é do que aquele dia
 * foi feito.
 */
function LeituraDasAtivacoes({ dia, total, segmentos }: {
  dia: string; total: number; segmentos: Array<{ tipo: TipoConteudo; valor: number }>;
}) {
  return (
    <div className="flex items-center gap-3 flex-wrap text-[11px] tabular-nums">
      <span className="font-bold">{dia.slice(8, 10)}/{dia.slice(5, 7)}</span>
      <span className="font-bold">
        {total} ativa{total === 1 ? "ção" : "ções"}
      </span>
      {segmentos.map((s) => (
        <span key={s.tipo} className="inline-flex items-center gap-1.5" style={{ color: COR_TIPO[s.tipo] }}>
          <i className="w-2 h-2 rounded-[3px] flex-shrink-0" style={{ background: COR_TIPO[s.tipo] }} />
          {s.valor} {ROTULO_CONTEUDO[s.tipo].toLowerCase()}
        </span>
      ))}
      {!segmentos.length && <span className="text-muted-foreground">nenhuma publicação</span>}
    </div>
  );
}

export function Legenda({ itens }: { itens: Array<[string, string]> }) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      {itens.map(([rotulo, cor]) => (
        <span key={rotulo} className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <i className="w-2 h-2 rounded-[3px] flex-shrink-0" style={{ background: cor }} />
          {rotulo}
        </span>
      ))}
    </div>
  );
}

// ─── 1. Evolução: estoque à esquerda, fluxo à direita ────────────────────────

export interface PontoDaConta {
  dia: string;
  seguidores: number | null;
  visitas: number | null;
  porTipo: Partial<Record<TipoConteudo, number>>;
}

/**
 * A leitura de um dia da evolução — vai para o lugar da legenda no hover.
 *
 * Mesmo mecanismo dos outros dois gráficos: um balão flutuante mexeria na
 * altura do cabeçalho, e a exigência é que ele não cresça. Aqui a leitura
 * SUBSTITUI a legenda, então a altura é a mesma com e sem mouse.
 */
function LeituraDaEvolucao({ p, ativacoes }: { p: PontoDaConta; ativacoes: number }) {
  return (
    <div className="flex items-center gap-3 flex-wrap text-[11px] tabular-nums">
      <span className="font-bold">{p.dia.slice(8, 10)}/{p.dia.slice(5, 7)}</span>
      <span style={{ color: COR.seguidores }}>
        Seguidores {p.seguidores == null ? "–" : fmt(p.seguidores)}
      </span>
      <span style={{ color: COR.visitas }}>
        Visitas {p.visitas == null ? "–" : fmt(p.visitas)}
      </span>
      <span style={{ color: COR.ativacoes }}>Ativações {ativacoes}</span>
    </div>
  );
}

export function GraficoDeEvolucao({ pontos, nota, altura = 168 }: {
  pontos: PontoDaConta[]; nota?: string | null; altura?: number;
}) {
  const [ativo, setAtivo] = useState<number | null>(null);
  const temDado = pontos.some((p) => p.seguidores != null || p.visitas != null);
  const vazio = !temDado || pontos.length < 2;

  const W = 760, ml = 44, mr = 36, mt = 10, mb = 22;
  const iw = W - ml - mr, ih = altura - mt - mb;

  const seg = pontos.map((p) => p.seguidores);
  const vis = pontos.map((p) => p.visitas);
  const ativ = pontos.map((p) => ORDEM_TIPO.reduce((n, t) => n + (p.porTipo?.[t] ?? 0), 0));

  const comSeg = seg.filter((v): v is number => v != null);
  const sMin = comSeg.length ? Math.min(...comSeg) - 30 : 0;
  const sMax = comSeg.length ? Math.max(...comSeg) + 30 : 1;
  const fMax = Math.max(1, ...vis.filter((v): v is number => v != null), ...ativ) * 1.1;

  const x = (i: number) => ml + (i / Math.max(1, pontos.length - 1)) * iw;
  const yS = (v: number) => mt + ih - ((v - sMin) / Math.max(1, sMax - sMin)) * ih;
  const yF = (v: number) => mt + ih - (v / fMax) * ih;
  const bw = Math.max(3, (iw / pontos.length) * 0.5);
  /** A faixa de captura: o passo inteiro, para nenhum dia ficar sem resposta. */
  const passoX = iw / Math.max(1, pontos.length - 1);

  /** Segmentos contínuos — buraco de coleta CORTA a linha. */
  const caminhos = (vals: Array<number | null>, fy: (v: number) => number) => {
    const out: string[] = [];
    let atual: string[] = [];
    vals.forEach((v, i) => {
      if (v == null) { if (atual.length > 1) out.push(atual.join(" ")); atual = []; return; }
      atual.push(`${atual.length ? "L" : "M"}${x(i).toFixed(1)},${fy(v).toFixed(1)}`);
    });
    if (atual.length > 1) out.push(atual.join(" "));
    return out;
  };

  return (
    <Moldura titulo="Evolução" nota={nota} vazio={vazio} altura={altura}
      legenda={<Legenda itens={[["Seguidores", COR.seguidores], ["Visitas", COR.visitas], ["Ativações", COR.ativacoes]]} />}
      leitura={ativo != null && pontos[ativo]
        ? <LeituraDaEvolucao p={pontos[ativo]} ativacoes={ativ[ativo]} />
        : null}>
      <svg viewBox={`0 0 ${W} ${altura}`} width="100%" height={altura} role="img" aria-label="Evolução da conta"
        onMouseLeave={() => setAtivo(null)}>
        {[0, 1, 2, 3].map((g) => (
          <line key={g} x1={ml} x2={W - mr} y1={mt + (ih / 3) * g} y2={mt + (ih / 3) * g}
            className={GRADE} strokeDasharray="3 4" />
        ))}

        {/* A faixa do dia sob o mouse, ATRÁS das séries: marca sem cobrir. */}
        {ativo != null && (
          <rect x={x(ativo) - passoX / 2} y={mt} width={passoX} height={ih}
            className="fill-foreground/[0.045]" />
        )}

        {/* Barras de ativação, empilhadas — story na base, reels no topo. */}
        {pontos.map((p, i) => {
          let base = yF(0);
          return ORDEM_TIPO.map((t) => {
            const v = p.porTipo?.[t] ?? 0;
            if (!v) return null;
            const h = base - yF(v);
            base -= h;
            return <rect key={t} x={x(i) - bw / 2} y={base} width={bw} height={h}
              fill={COR_TIPO[t]} opacity={0.85} rx={1} />;
          });
        })}

        {/* 2,6 e não 2,2: numa coluna de cabeçalho as duas linhas se cruzam
            muito, e meio ponto de espessura é a diferença entre distinguir as
            séries de relance e ter de procurar a legenda. */}
        {caminhos(vis, yF).map((d, k) => (
          <path key={`v${k}`} d={d} fill="none" stroke={COR.visitas} strokeWidth={2.6}
            strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {caminhos(seg, yS).map((d, k) => (
          <path key={`s${k}`} d={d} fill="none" stroke={COR.seguidores} strokeWidth={2.6}
            strokeLinejoin="round" strokeLinecap="round" />
        ))}

        {/* Os pontos existem SÓ no dia sob o mouse. Trinta pontos permanentes
            em duas séries viram uma trama que esconde a própria linha. */}
        {ativo != null && (
          <>
            {pontos[ativo].seguidores != null && (
              <circle cx={x(ativo)} cy={yS(pontos[ativo].seguidores as number)} r={3.4}
                fill={COR.seguidores} stroke="white" strokeWidth={1.4} />
            )}
            {pontos[ativo].visitas != null && (
              <circle cx={x(ativo)} cy={yF(pontos[ativo].visitas as number)} r={3.4}
                fill={COR.visitas} stroke="white" strokeWidth={1.4} />
            )}
          </>
        )}

        {[sMax, (sMax + sMin) / 2, sMin].map((v, k) => (
          <text key={k} x={ml - 7} y={mt + (ih / 2) * k + 4} textAnchor="end" fontSize={9} className={EIXO}>
            {fmt(v)}
          </text>
        ))}
        {pontos.map((p, i) => (i % 6 ? null : (
          <text key={p.dia} x={x(i)} y={altura - 6} textAnchor="middle" fontSize={9} className={EIXO}>
            {p.dia.slice(8, 10)}/{p.dia.slice(5, 7)}
          </text>
        )))}

        {/* As faixas de captura por ÚLTIMO e com a largura do passo inteiro:
            assim um dia sem barra e sem ponto continua respondendo ao mouse — e
            "não medido" é uma resposta, não silêncio. */}
        {pontos.map((p, i) => (
          <rect key={`c-${p.dia}`} x={x(i) - passoX / 2} y={mt} width={passoX} height={ih}
            fill="transparent" style={{ cursor: "pointer" }}
            onMouseEnter={() => setAtivo(i)} />
        ))}
      </svg>
    </Moldura>
  );
}

// ─── 2. Movimento da base: entradas acima, saídas abaixo, saldo em área ──────

export interface PontoDeMovimento {
  dia: string;
  /** Novos seguidores medidos. */
  entradas: number | null;
  /** Derivadas. `null` quando a conta do dia não fecha. */
  saidas: number | null;
  /** A variação MEDIDA do total — o saldo do dia. */
  saldo: number | null;
}

/**
 * Movimento da base: entradas acima do zero, saídas abaixo, saldo cruzando.
 *
 * ── Um eixo, um zero — e o motivo é um bug real ────────────────────────────
 * Antes a linha chamada "Saldo" plotava o ESTOQUE de seguidores num eixo
 * próprio, auto escalado. Com entradas +2, saídas −2 e saldo 0, a tela mostrava
 * barra verde subindo e uma faixa roxa larga atrás — e quem olhava lia
 * crescimento onde a aritmética dizia zero.
 *
 * Agora os três dividem a mesma escala e o mesmo zero. A saída é desenhada como
 * número NEGATIVO, não como barra positiva apontando para baixo: a distinção
 * importa no eixo, onde o rótulo de baixo aparece com sinal.
 *
 * ── Sem área preenchida ────────────────────────────────────────────────────
 * A faixa roxa não acrescentava informação e virava ruído justamente no caso em
 * que o saldo é zero — muita cor para dizer "nada aconteceu". A linha sobre o
 * eixo do zero diz isso sozinha.
 */
/**
 * A leitura de um dia — vai para o lugar da legenda no hover.
 *
 * O dia que cobre mais de um dia leva a ressalva junto: "+30 em 3 dias" é
 * verdade, "+30 no dia 15" não é. A distinção some se a barra for igual às
 * outras e o texto não disser nada.
 */
function LeituraDaVariacao({ d }: { d: DiaDeVariacao }) {
  const v = d.variacao;
  const cor = v == null ? undefined : v > 0 ? COR.entrada : v < 0 ? COR.saida : undefined;
  return (
    <div className="flex items-center gap-2.5 flex-wrap text-[11px] tabular-nums">
      <span className="font-bold">{d.dia.slice(8, 10)}/{d.dia.slice(5, 7)}</span>
      <span style={{ color: cor }} className={cor ? "font-bold" : "text-muted-foreground"}>
        {v == null ? "primeira medição do período"
          : `${v > 0 ? "+" : v < 0 ? "−" : ""}${fmt(Math.abs(v))} seguidor${Math.abs(v) === 1 ? "" : "es"}`}
      </span>
      {d.diasCobertos > 1 && (
        <span className="text-amber-700">acumulado de {d.diasCobertos} dias sem coleta no meio</span>
      )}
      <span className="text-muted-foreground/60">total {fmt(d.total)}</span>
    </div>
  );
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Movimento diário — a variação líquida, e nada além dela
 * ─────────────────────────────────────────────────────────────────────────────
 *  Este gráfico substituiu o de entradas × saídas × saldo. O diagnóstico de
 *  18/08/2026 refutou a hipótese de que FOLLOWER/NON_FOLLOWER fossem os dois
 *  fluxos, e `follower_count` sozinho não os separa — a saída que saía dele era
 *  `entradas − saldo`, subtração sem fonte que provasse representar saídas.
 *
 *  Sobrou o que realmente se mede: quanto a base variou de um dia para o outro.
 *  Uma série só, cruzando o zero. Verde acima, vermelho abaixo.
 *
 *  ── Barra de altura mínima para o zero ─────────────────────────────────────
 *  Um dia de variação zero é MEDIÇÃO — a base não se moveu. Sem barra nenhuma
 *  ele fica idêntico a um dia sem coleta, que é o oposto. Um traço de 2px na
 *  linha do zero diz "medimos, e deu zero".
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function GraficoDeVariacaoDiaria({ movimento, nota, altura = 176, largura = 760 }: {
  movimento: MovimentoDiario;
  nota?: string | null;
  altura?: number;
  /**
   * A largura do viewBox — não do elemento, que é sempre 100%.
   *
   * O SVG escala uniformemente: um viewBox de 760 numa coluna de 380px reduz o
   * texto de 9px para 4,5px. Numa coluna estreita ele tem de encolher junto.
   */
  largura?: number;
}) {
  const [ativo, setAtivo] = useState<number | null>(null);
  const dias = movimento.dias;
  const vazio = dias.filter((d) => d.variacao != null).length < 1;

  const esc = escalaDaVariacao(dias);
  /** A margem esquerda vem do rótulo mais largo, e não de um número fixo. */
  const digitos = Math.max(fmt(esc.acima).length, fmt(esc.abaixo).length) + 1;
  const W = largura, ml = 12 + digitos * 5.6, mr = 16, mt = 12, mb = 22;
  const iw = W - ml - mr, ih = altura - mt - mb;
  const yZero = mt + ih * esc.fracaoDoZero;

  const px = (v: number) => {
    const amplitude = esc.acima + esc.abaixo;
    return amplitude > 0 ? (Math.abs(v) / amplitude) * ih : 0;
  };

  const passoX = iw / Math.max(1, dias.length);
  const x = (i: number) => ml + (i + 0.5) * passoX;
  const bw = Math.min(20, Math.max(4, passoX * 0.5));
  const passoRotulo = intervaloDeRotulos(dias.length, iw);

  /** Os três rótulos do eixo: maior alta, zero, maior queda. */
  const rotulos: Array<[number, number]> = [
    [esc.acima, mt],
    [0, yZero],
    [-esc.abaixo, mt + ih],
  ];

  return (
    <Moldura titulo="Movimento diário" nota={nota ?? "variação líquida de seguidores por dia"}
      vazio={vazio} altura={altura}
      legenda={<Legenda itens={[["Ganhou", COR.entrada], ["Perdeu", COR.saida]]} />}
      leitura={ativo != null && dias[ativo] ? <LeituraDaVariacao d={dias[ativo]} /> : null}>
      <svg viewBox={`0 0 ${W} ${altura}`} width="100%" height={altura} role="img"
        aria-label="Variação líquida de seguidores por dia"
        onMouseLeave={() => setAtivo(null)}>
        {rotulos.map(([v, yy], k) => (
          <g key={k}>
            <line x1={ml} x2={W - mr} y1={yy} y2={yy}
              className={k === 1 ? "stroke-[rgba(10,10,10,.22)] dark:stroke-[rgba(255,255,255,.24)]" : GRADE}
              strokeDasharray={k === 1 ? undefined : "3 4"} />
            <text x={ml - 7} y={yy + 4} textAnchor="end" fontSize={9} className={EIXO}>
              {v > 0 ? `+${fmt(v)}` : v < 0 ? `−${fmt(Math.abs(v))}` : "0"}
            </text>
          </g>
        ))}

        {/* A faixa do dia ativo, atrás das barras — guia sem tapar. */}
        {ativo != null && (
          <rect x={x(ativo) - passoX / 2} y={mt} width={passoX} height={ih}
            className="fill-foreground/[0.045]" />
        )}

        {dias.map((d, i) => {
          if (d.variacao == null) return null;
          const destacado = ativo === i;
          const v = d.variacao;
          const alt = Math.max(2, px(v));
          return (
            <rect key={d.dia}
              x={x(i) - bw / 2}
              y={v >= 0 ? yZero - alt : yZero}
              width={bw} height={alt}
              fill={v > 0 ? COR.entrada : v < 0 ? COR.saida : "rgba(10,10,10,.32)"}
              opacity={ativo == null || destacado ? 0.92 : 0.32}
              rx={1.5} className="transition-opacity duration-150" />
          );
        })}

        {/* Barra que cobre mais de um dia leva um traço no topo: ela é verdade
            como variação e mentira como "variação daquele dia". */}
        {dias.map((d, i) => (d.variacao == null || d.diasCobertos <= 1 ? null : (
          <line key={`b${d.dia}`} x1={x(i) - bw / 2} x2={x(i) + bw / 2}
            y1={d.variacao >= 0 ? yZero - Math.max(2, px(d.variacao)) - 2.5 : yZero + Math.max(2, px(d.variacao)) + 2.5}
            y2={d.variacao >= 0 ? yZero - Math.max(2, px(d.variacao)) - 2.5 : yZero + Math.max(2, px(d.variacao)) + 2.5}
            stroke="rgb(180,83,9)" strokeWidth={1.6} strokeDasharray="2 2" />
        )))}

        {/* As faixas de captura por ÚLTIMO e com o passo inteiro: o dia de
            variação zero também responde ao mouse. */}
        {dias.map((d, i) => (
          <rect key={`h${d.dia}`} x={x(i) - passoX / 2} y={mt} width={passoX} height={ih}
            fill="transparent" style={{ cursor: "pointer" }}
            onMouseEnter={() => setAtivo(i)} />
        ))}

        {dias.map((d, i) => (i % passoRotulo ? null : (
          <text key={d.dia} x={x(i)} y={altura - 6} textAnchor="middle" fontSize={9} className={EIXO}>
            {d.dia.slice(8, 10)}/{d.dia.slice(5, 7)}
          </text>
        )))}
      </svg>
    </Moldura>
  );
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Evolução da base — o TAMANHO, e não o movimento
 * ─────────────────────────────────────────────────────────────────────────────
 *  Mesma fonte do gráfico de cima, pergunta diferente. O movimento diário
 *  responde QUANDO a base cresceu ou caiu; este responde COMO ela chegou ao
 *  tamanho de hoje. Um mostra o fluxo, o outro o estoque — e é por isso que são
 *  dois gráficos e não duas séries no mesmo eixo: foi exatamente essa mistura
 *  que derrubou a versão anterior deste bloco.
 *
 *  ── O eixo NÃO começa em zero, e isso é decisão ────────────────────────────
 *  Com 9.400 seguidores e variação de 20, um eixo ancorado no zero desenharia
 *  uma reta perfeitamente horizontal: a variação some dentro da escala do
 *  total. O eixo aqui enquadra o intervalo medido com uma folga, e os dois
 *  rótulos dizem os extremos — a leitura é a FORMA da curva, e os números
 *  exatos estão no hover e no saldo atual logo acima.
 *
 *  ── Buraco de coleta vira traço, e não reta cheia ──────────────────────────
 *  Entre duas medições distantes a linha existe, mas tracejada: ela liga dois
 *  pontos reais por um caminho que ninguém mediu, e uma reta contínua ali
 *  afirmaria um crescimento uniforme que pode não ter sido.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function GraficoDaEvolucaoDaBase({ movimento, altura = 104, largura = 760 }: {
  movimento: MovimentoDiario; altura?: number; largura?: number;
}) {
  const [ativo, setAtivo] = useState<number | null>(null);
  const dias = movimento.dias;
  const vazio = dias.length < 2;

  const totais = dias.map((d) => d.total);
  const min = Math.min(...totais);
  const max = Math.max(...totais);
  /** Folga de 8% da amplitude — a curva não encosta nas bordas da moldura. */
  const folga = Math.max(1, (max - min) * 0.08);
  const piso = min - folga, teto = max + folga;

  const digitos = Math.max(fmt(teto).length, fmt(piso).length);
  const W = largura, ml = 10 + digitos * 5.6, mr = 12, mt = 10, mb = 18;
  const iw = W - ml - mr, ih = altura - mt - mb;

  const x = (i: number) => ml + (dias.length < 2 ? iw / 2 : (i / (dias.length - 1)) * iw);
  const y = (v: number) => mt + ih - ((v - piso) / Math.max(1, teto - piso)) * ih;

  /** Os segmentos, separados entre medidos-consecutivos e vãos sem coleta. */
  const segmentos = dias.slice(1).map((d, k) => ({
    de: k, para: k + 1, temBuraco: d.diasCobertos > 1,
  }));

  const area = dias.length >= 2
    ? `M${x(0).toFixed(1)},${(mt + ih).toFixed(1)} `
      + dias.map((d, i) => `L${x(i).toFixed(1)},${y(d.total).toFixed(1)}`).join(" ")
      + ` L${x(dias.length - 1).toFixed(1)},${(mt + ih).toFixed(1)} Z`
    : "";

  const passoRotulo = intervaloDeRotulos(dias.length, iw);

  return (
    <Moldura titulo="Evolução da base" nota="total de seguidores, snapshot a snapshot"
      vazio={vazio} altura={altura}
      leitura={ativo != null && dias[ativo] ? (
        <span className="flex items-center gap-2.5 text-[11px] tabular-nums">
          <span className="font-bold">
            {dias[ativo].dia.slice(8, 10)}/{dias[ativo].dia.slice(5, 7)}
          </span>
          <span style={{ color: COR.seguidores }} className="font-bold">
            {fmt(dias[ativo].total)} seguidores
          </span>
        </span>
      ) : null}>
      <svg viewBox={`0 0 ${W} ${altura}`} width="100%" height={altura} role="img"
        aria-label="Evolução do total de seguidores"
        onMouseLeave={() => setAtivo(null)}>
        <defs>
          <linearGradient id="grad-base" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={COR.seguidores} stopOpacity={0.22} />
            <stop offset="100%" stopColor={COR.seguidores} stopOpacity={0.02} />
          </linearGradient>
        </defs>

        {[teto, piso].map((v, k) => (
          <g key={k}>
            <line x1={ml} x2={W - mr} y1={k === 0 ? mt : mt + ih} y2={k === 0 ? mt : mt + ih}
              className={GRADE} strokeDasharray="3 4" />
            <text x={ml - 6} y={(k === 0 ? mt : mt + ih) + 3.5} textAnchor="end" fontSize={9} className={EIXO}>
              {fmt(v)}
            </text>
          </g>
        ))}

        {area && <path d={area} fill="url(#grad-base)" />}

        {/* A linha em segmentos: o vão sem coleta sai tracejado, porque ele liga
            dois pontos reais por um caminho que ninguém mediu. */}
        {segmentos.map((sg) => (
          <line key={sg.para}
            x1={x(sg.de)} y1={y(dias[sg.de].total)}
            x2={x(sg.para)} y2={y(dias[sg.para].total)}
            stroke={COR.seguidores} strokeWidth={2.2} strokeLinecap="round"
            strokeDasharray={sg.temBuraco ? "3 3" : undefined}
            opacity={sg.temBuraco ? 0.55 : 1} />
        ))}

        {ativo != null && dias[ativo] && (
          <>
            <line x1={x(ativo)} x2={x(ativo)} y1={mt} y2={mt + ih}
              className="stroke-[rgba(10,10,10,.16)]" strokeWidth={1} />
            <circle cx={x(ativo)} cy={y(dias[ativo].total)} r={3.6}
              fill={COR.seguidores} stroke="white" strokeWidth={1.5} />
          </>
        )}

        {/* Captura por último, cobrindo a faixa inteira de cada ponto. */}
        {dias.map((d, i) => (
          <rect key={`h${d.dia}`}
            x={x(i) - (iw / Math.max(1, dias.length - 1)) / 2} y={mt}
            width={iw / Math.max(1, dias.length - 1)} height={ih}
            fill="transparent" style={{ cursor: "pointer" }}
            onMouseEnter={() => setAtivo(i)} />
        ))}

        {dias.map((d, i) => (i % passoRotulo ? null : (
          <text key={d.dia} x={x(i)} y={altura - 5} textAnchor="middle" fontSize={9} className={EIXO}>
            {d.dia.slice(8, 10)}/{d.dia.slice(5, 7)}
          </text>
        )))}
      </svg>
    </Moldura>
  );
}

// ─── 3. Ativações por dia: barras empilhadas, com o total no topo ───────────

/**
 * Cada barra é o TOTAL do dia; as cores dizem de que ele é feito.
 *
 * ── O total impresso no topo ───────────────────────────────────────────────
 * Sem ele, a altura é a única pista da quantidade — e altura se lê por
 * comparação, não por valor. O número no topo responde "quantas?" sem exigir
 * hover nem régua mental contra o eixo.
 *
 * ── Dia zerado continua no eixo ────────────────────────────────────────────
 * Ele não desenha barra, mas ocupa a mesma posição e pode receber rótulo de
 * data. Sumir da série faria os dias vizinhos parecerem consecutivos, e uma
 * semana sem publicação viraria uma semana sem existir.
 *
 * ── Largura com teto ───────────────────────────────────────────────────────
 * Com sete dias, 62% do passo produz barras enormes e afastadas — o gráfico
 * parece concentrado no meio. O teto de 26px mantém a proporção legível em
 * qualquer tamanho de série.
 */
export function GraficoDeAtivacoes({ pontos, altura = 200, compacto = false }: {
  pontos: PontoDaConta[]; altura?: number;
  /**
   * A versão que mora DENTRO do cartão de Ativações.
   *
   * Sem moldura, sem título, sem legenda, sem grade: o cartão já diz o nome da
   * métrica, o total e a composição logo acima. Repetir tudo isso em 78px
   * sobraria rótulo e faltaria barra.
   *
   * O `viewBox` encolhe junto. Um de 760 numa coluna de ~300px reduziria os
   * rótulos de data a 3,5px — o mesmo erro que o gráfico de movimento cometeu
   * uma vez, e que só apareceu quando ele foi compactado.
   */
  compacto?: boolean;
}) {
  const [ativo, setAtivo] = useState<number | null>(null);
  /**
   * A legenda lista EXATAMENTE os tipos que aparecem em alguma barra.
   *
   * Uma legenda fixa com os três prometeria uma cor que o gráfico não usa — e
   * quem procura o tom de reels e não acha conclui que a leitura falhou, não
   * que a conta não publicou reels.
   */
  const presentes = ORDEM_TIPO.filter((t) => pontos.some((p) => (p.porTipo?.[t] ?? 0) > 0));
  const pilhas = pontos.map((p) => pilhaDoDia(p.porTipo ?? {}, ORDEM_TIPO));
  const max = Math.max(1, ...pilhas.map((x) => x.total));
  const vazio = !presentes.length;

  const W = compacto ? 300 : 760;
  const ml = compacto ? 4 : 30, mr = compacto ? 4 : 14;
  const mt = compacto ? 12 : 20, mb = compacto ? 14 : 22;
  const iw = W - ml - mr, ih = altura - mt - mb;
  const passo = iw / Math.max(1, pontos.length);
  const bw = Math.min(26, Math.max(4, passo * 0.62));
  const x = (i: number) => ml + (i + 0.5) * passo;
  /** A escala vem do MAIOR total do período — nada de teto arbitrário. */
  const alturaDaBarra = (total: number) => (total / max) * ih;
  const passoRotulo = intervaloDeRotulos(pontos.length, iw);

  const svgDasBarras = (
      <svg viewBox={`0 0 ${W} ${altura}`} width="100%" height={altura} role="img" aria-label="Ativações por dia e tipo"
        onMouseLeave={() => setAtivo(null)}>
        {/* Grade fora do compacto: três pontilhados atrás de barras de 50px
            viram textura, não referência. */}
        {(compacto ? [] : [0, 1, 2, 3]).map((g) => {
          const y = mt + (ih / 3) * g;
          return (
            <g key={g}>
              <line x1={ml} x2={W - mr} y1={y} y2={y} className={GRADE} strokeDasharray="3 4" />
              <text x={ml - 6} y={y + 4} textAnchor="end" fontSize={9} className={EIXO}>
                {Math.round(max - (max / 3) * g)}
              </text>
            </g>
          );
        })}

        {/* A faixa de destaque ATRÁS das barras: marca o dia sem cobri-lo. */}
        {ativo != null && (
          <rect x={x(ativo) - passo / 2} y={mt} width={passo} height={ih}
            className="fill-foreground/[0.05]" />
        )}

        {pontos.map((p, i) => {
          const { segmentos, total } = pilhas[i];
          const h = alturaDaBarra(total);
          const topoDaBarra = mt + ih - h;
          const apagado = ativo != null && ativo !== i;

          return (
            <g key={p.dia} style={{ opacity: apagado ? 0.32 : 1, transition: "opacity 140ms ease" }}>
              {/* As frações vêm de `pilhaDoDia` e somam exatamente 1 — somar
                  altura segmento a segmento deixaria fresta no topo, e a barra
                  pareceria menor que o valor dela. */}
              {segmentos.map((s) => (
                <rect key={s.tipo}
                  x={x(i) - bw / 2}
                  y={mt + ih - h * s.ate}
                  width={bw}
                  height={h * (s.ate - s.de)}
                  fill={COR_TIPO[s.tipo]}
                  rx={s.topo ? 3 : 0} />
              ))}

              {/* O total, acima da barra. Some quando o dia é zero: um "0"
                  flutuando no eixo é ruído, e a ausência de barra já diz. */}
              {total > 0 && (!compacto || ativo === i) && (
                <text x={x(i)} y={topoDaBarra - (compacto ? 4 : 6)} textAnchor="middle"
                  fontSize={compacto ? 8.5 : 9.5}
                  className="fill-foreground" fontWeight={700}>
                  {total}
                </text>
              )}

            </g>
          );
        })}

        {/* As faixas de captura por ÚLTIMO, com a largura do passo inteiro:
            assim um dia sem barra nenhuma continua respondendo ao mouse — e
            "nenhuma publicação" é uma resposta, não silêncio. */}
        {pontos.map((p, i) => (
          <rect key={`c-${p.dia}`} x={x(i) - passo / 2} y={mt} width={passo} height={ih}
            fill="transparent" style={{ cursor: "pointer" }}
            onMouseEnter={() => setAtivo(i)} />
        ))}

        {pontos.map((p, i) => (i % passoRotulo ? null : (
          <text key={p.dia} x={x(i)} y={altura - (compacto ? 3 : 6)} textAnchor="middle"
            fontSize={compacto ? 8 : 9} className={EIXO}>
            {p.dia.slice(8, 10)}/{p.dia.slice(5, 7)}
          </text>
        )))}
      </svg>
  );

  /**
   * Compacto: sem a moldura, e a leitura do dia numa linha própria e discreta —
   * ali não existe legenda para ela substituir. A linha tem altura mínima fixa,
   * senão aparecer e sumir mexeria na altura do cartão a cada movimento do
   * mouse, e o cartão vizinho pularia junto.
   */
  if (compacto) {
    return (
      <div className="flex flex-col gap-0.5">
        {vazio
          ? <p className="text-[10px] text-muted-foreground/60 py-4 text-center">
              Nenhuma ativação medida no período.
            </p>
          : svgDasBarras}
        <span className="text-[9.5px] text-muted-foreground/70 tabular-nums min-h-[13px] px-1 truncate">
          {ativo != null && pontos[ativo] && pilhas[ativo].total > 0
            ? `${pontos[ativo].dia.slice(8, 10)}/${pontos[ativo].dia.slice(5, 7)} · ${
                pilhas[ativo].segmentos
                  .map((g) => `${g.valor} ${ROTULO_CONTEUDO[g.tipo].toLowerCase()}`).join(" · ")}`
            : ""}
        </span>
      </div>
    );
  }

  return (
    <Moldura titulo="Ativações por dia" nota="a altura é o total · as cores dizem de que ele é feito"
      vazio={vazio} altura={altura}
      legenda={<Legenda itens={presentes.map((t) => [ROTULO_CONTEUDO[t], COR_TIPO[t]] as [string, string])} />}
      leitura={ativo != null && pontos[ativo] ? (
        <LeituraDasAtivacoes dia={pontos[ativo].dia} total={pilhas[ativo].total}
          segmentos={pilhas[ativo].segmentos} />
      ) : null}>
      {svgDasBarras}
    </Moldura>
  );
}
