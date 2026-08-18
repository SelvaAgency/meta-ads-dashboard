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
import type { MovimentoDiario } from "@shared/movimentoDiario";
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
/*
 * ── O que morava aqui ──────────────────────────────────────────────────────
 * `GraficoDeVariacaoDiaria` e a leitura dele. Ele desenhava a variação líquida
 * por dia em barras divergentes, e foi removido em 18/08/2026: a evolução da
 * base, logo abaixo, responde a mesma pergunta de forma mais direta — a curva
 * já mostra onde subiu e onde caiu, sem exigir que o olho some barras.
 *
 * Os extremos que as barras entregavam de relance continuam na tela, agora como
 * números: MAIOR ALTA e MAIOR QUEDA no rodapé do card, com data. Nada do que se
 * lia ali se perdeu; o que saiu foi a segunda forma de ler a mesma coisa.
 *
 * `escalaDaVariacao` saiu junto, de `shared/movimentoDiario.ts` — era a escala
 * simétrica em torno do zero, e nada mais desenha em torno do zero.
 */

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  A curva histórica — um desenho só, dois tamanhos
 * ─────────────────────────────────────────────────────────────────────────────
 *  Ela nasceu dentro da Evolução da Base e virou peça própria quando os cartões
 *  de Dados Gerais precisaram da mesma leitura em miniatura. A alternativa era
 *  um sparkline separado, e foi o que existiu por uma rodada: linha fina, sem
 *  eixo, sem área. Ele parecia decoração — e decoração ninguém lê como dado.
 *
 *  Extrair em vez de imitar é o que garante que continuem iguais. Duas
 *  implementações da mesma curva divergem no primeiro ajuste que alguém faz só
 *  numa delas.
 *
 *  ── O eixo NÃO começa em zero, e isso é decisão ────────────────────────────
 *  Com 9.400 seguidores e variação de 20, um eixo ancorado no zero desenha uma
 *  reta horizontal: a variação some dentro da escala do total. O eixo enquadra
 *  o intervalo medido com folga, e os dois rótulos dizem os extremos — a
 *  leitura é a FORMA da curva, e o valor exato está no hover.
 *
 *  ── Buraco de coleta vira traço, e não reta cheia ──────────────────────────
 *  Entre duas medições distantes a linha existe, mas tracejada: ela liga dois
 *  pontos reais por um caminho que ninguém mediu, e uma reta contínua ali
 *  afirmaria um crescimento uniforme que pode não ter sido.
 *
 *  ── Pontos só quando cabem ─────────────────────────────────────────────────
 *  Trinta bolinhas numa curva de 60px viram uma trama que esconde a própria
 *  linha. Acima do teto eles só aparecem no dia sob o mouse.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export interface PontoHistorico {
  dia: string;
  valor: number;
  /** `true` quando o segmento que CHEGA aqui pula dias sem medição. */
  vao?: boolean;
}

/** Acima disto, ponto permanente vira trama. */
const MAX_PONTOS_VISIVEIS = 14;

export function CurvaHistorica({
  pontos, cor, altura, largura, ativo, aoEntrar, miuda = false, id,
}: {
  pontos: PontoHistorico[];
  cor: string;
  altura: number;
  largura: number;
  ativo: number | null;
  aoEntrar: (i: number | null) => void;
  /** Versão de cartão: tipografia e margens menores, mesma gramática. */
  miuda?: boolean;
  /** Sufixo do gradiente — dois `<linearGradient>` com o mesmo id colidiriam. */
  id: string;
}) {
  const totais = pontos.map((d) => d.valor);
  const min = Math.min(...totais);
  const max = Math.max(...totais);
  /** Folga de 8% da amplitude — a curva não encosta nas bordas da moldura. */
  const folga = Math.max(1, (max - min) * 0.08);
  const piso = min - folga, teto = max + folga;

  const corpo = miuda ? 8 : 9;
  const digitos = Math.max(fmt(teto).length, fmt(piso).length);
  const W = largura;
  const ml = (miuda ? 6 : 10) + digitos * (miuda ? 4.6 : 5.6);
  const mr = miuda ? 6 : 12;
  const mt = miuda ? 7 : 10;
  const mb = miuda ? 13 : 18;
  const iw = W - ml - mr, ih = altura - mt - mb;

  const x = (i: number) => ml + (pontos.length < 2 ? iw / 2 : (i / (pontos.length - 1)) * iw);
  const y = (v: number) => mt + ih - ((v - piso) / Math.max(1, teto - piso)) * ih;

  const area = pontos.length >= 2
    ? `M${x(0).toFixed(1)},${(mt + ih).toFixed(1)} `
      + pontos.map((d, i) => `L${x(i).toFixed(1)},${y(d.valor).toFixed(1)}`).join(" ")
      + ` L${x(pontos.length - 1).toFixed(1)},${(mt + ih).toFixed(1)} Z`
    : "";

  const passoRotulo = intervaloDeRotulos(pontos.length, iw, miuda ? 30 : 34);
  const mostrarPontos = pontos.length <= MAX_PONTOS_VISIVEIS;
  const faixa = iw / Math.max(1, pontos.length - 1);

  return (
    <svg viewBox={`0 0 ${W} ${altura}`} width="100%" height={altura} role="img"
      aria-label="Evolução no histórico disponível"
      onMouseLeave={() => aoEntrar(null)}>
      <defs>
        <linearGradient id={`curva-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={cor} stopOpacity={0.22} />
          <stop offset="100%" stopColor={cor} stopOpacity={0.02} />
        </linearGradient>
      </defs>

      {[teto, piso].map((v, k) => {
        const yy = k === 0 ? mt : mt + ih;
        return (
          <g key={k}>
            <line x1={ml} x2={W - mr} y1={yy} y2={yy} className={GRADE} strokeDasharray="3 4" />
            <text x={ml - (miuda ? 4 : 6)} y={yy + 3.5} textAnchor="end" fontSize={corpo} className={EIXO}>
              {fmt(v)}
            </text>
          </g>
        );
      })}

      {area && <path d={area} fill={`url(#curva-${id})`} />}

      {/* A linha em segmentos: o vão sem coleta sai tracejado. */}
      {pontos.slice(1).map((d, k) => (
        <line key={d.dia}
          x1={x(k)} y1={y(pontos[k].valor)} x2={x(k + 1)} y2={y(d.valor)}
          stroke={cor} strokeWidth={2.2} strokeLinecap="round"
          strokeDasharray={d.vao ? "3 3" : undefined}
          opacity={d.vao ? 0.55 : 1} />
      ))}

      {mostrarPontos && pontos.map((d, i) => (
        <circle key={`p${d.dia}`} cx={x(i)} cy={y(d.valor)} r={miuda ? 1.9 : 2.4}
          fill={cor} opacity={ativo == null || ativo === i ? 1 : 0.4} />
      ))}

      {ativo != null && pontos[ativo] && (
        <>
          <line x1={x(ativo)} x2={x(ativo)} y1={mt} y2={mt + ih}
            className="stroke-[rgba(10,10,10,.16)]" strokeWidth={1} />
          <circle cx={x(ativo)} cy={y(pontos[ativo].valor)} r={miuda ? 3 : 3.6}
            fill={cor} stroke="white" strokeWidth={1.5} />
        </>
      )}

      {/* Captura por último, cobrindo a faixa inteira de cada ponto. */}
      {pontos.map((d, i) => (
        <rect key={`h${d.dia}`} x={x(i) - faixa / 2} y={0} width={faixa} height={altura}
          fill="transparent" style={{ cursor: "pointer" }}
          onMouseEnter={() => aoEntrar(i)} />
      ))}

      {pontos.map((d, i) => (i % passoRotulo ? null : (
        <text key={`r${d.dia}`} x={x(i)} y={altura - (miuda ? 3 : 5)} textAnchor="middle"
          fontSize={corpo} className={EIXO}>
          {d.dia.slice(8, 10)}/{d.dia.slice(5, 7)}
        </text>
      )))}
    </svg>
  );
}

/**
 * A evolução dentro de um cartão de Dados Gerais.
 *
 * Mesma `CurvaHistorica` da Evolução da Base, em corpo menor: área suave, eixo
 * com os extremos, datas discretas e pontos nos snapshots. É isso que faz o
 * cartão dizer "isto é um gráfico histórico" em vez de "isto é um enfeite".
 *
 * ── Ela NÃO segue o filtro de período ──────────────────────────────────────
 * O número acima responde "quanto tivemos neste período"; a curva responde
 * "como isso vem evoluindo". Com "Hoje" selecionado, uma curva de um ponto
 * seria o mesmo número, desenhado. O rótulo abaixo diz isso em duas palavras —
 * sem ele, trocar o período faria a curva parecer travada.
 *
 * ── Dia sem medição não vira ponto ─────────────────────────────────────────
 * Ele sai da série e o segmento que o atravessa fica tracejado. Um ponto em
 * zero afirmaria que a métrica deu zero naquele dia, e o que houve foi não
 * termos medido.
 */
export function MiniEvolucao({ dias, cor, altura = 72, id }: {
  dias: Array<{ dia: string; valor: number | null }>;
  cor: string;
  altura?: number;
  /** Único por cartão: dois gradientes com o mesmo id colidiriam. */
  id: string;
}) {
  const [ativo, setAtivo] = useState<number | null>(null);

  /**
   * Só os dias medidos, com o vão marcado.
   *
   * `vao` sai da distância no ÍNDICE da série original: se entre dois medidos
   * sobrou um não medido, o segmento entre eles atravessa um dia que ninguém
   * viu — e é tracejado por isso.
   */
  const pontos: PontoHistorico[] = [];
  let anterior = -1;
  dias.forEach((d, i) => {
    if (d.valor == null) return;
    pontos.push({ dia: d.dia, valor: d.valor, vao: anterior >= 0 && i - anterior > 1 });
    anterior = i;
  });

  if (pontos.length < 2) return null;

  return (
    <div className="flex flex-col gap-0.5">
      <CurvaHistorica id={id} pontos={pontos} cor={cor} altura={altura} largura={260}
        ativo={ativo} aoEntrar={setAtivo} miuda />
      {/* Altura fixa: aparecer e sumir mexeria na altura do cartão a cada
          movimento do mouse, e os vizinhos pulariam junto. */}
      <span className="block text-[9px] text-muted-foreground/60 tabular-nums min-h-[12px] truncate">
        {ativo != null && pontos[ativo]
          ? `${pontos[ativo].dia.slice(8, 10)}/${pontos[ativo].dia.slice(5, 7)} · ${
              pontos[ativo].valor.toLocaleString("pt-BR")}`
          : `evolução · ${pontos.length} dias de histórico`}
      </span>
    </div>
  );
}

/**
 * Evolução da base — o TAMANHO, e não o movimento.
 *
 * Mesma fonte do movimento da base, pergunta diferente: como a conta chegou ao
 * tamanho de hoje. O desenho é `CurvaHistorica`, o mesmo dos cartões de Dados
 * Gerais — a diferença entre os dois é o tamanho e a moldura, nunca a gramática.
 */
export function GraficoDaEvolucaoDaBase({ movimento, altura = 104, largura = 760 }: {
  movimento: MovimentoDiario; altura?: number; largura?: number;
}) {
  const [ativo, setAtivo] = useState<number | null>(null);
  const pontos: PontoHistorico[] = movimento.dias.map((d) => ({
    dia: d.dia, valor: d.total, vao: d.diasCobertos > 1,
  }));
  const vazio = pontos.length < 2;

  return (
    <Moldura titulo="Evolução da base" nota="total de seguidores, snapshot a snapshot"
      vazio={vazio} altura={altura}
      leitura={ativo != null && pontos[ativo] ? (
        <span className="flex items-center gap-2.5 text-[11px] tabular-nums">
          <span className="font-bold">
            {pontos[ativo].dia.slice(8, 10)}/{pontos[ativo].dia.slice(5, 7)}
          </span>
          <span style={{ color: COR.seguidores }} className="font-bold">
            {fmt(pontos[ativo].valor)} seguidores
          </span>
        </span>
      ) : null}>
      <CurvaHistorica id="base" pontos={pontos} cor={COR.seguidores}
        altura={altura} largura={largura} ativo={ativo} aoEntrar={setAtivo} />
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
