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
import { escalaDoMovimento, intervaloDeRotulos, pilhaDoDia } from "@shared/escalaDosGraficos";
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
 * A leitura do dia sob o mouse.
 *
 * Entradas com `+`, saídas com `−`, saldo com o sinal que tiver. E o que é
 * DERIVADO leva um til discreto: sem essa marca, os três números parecem ter a
 * mesma procedência, e só um deles é medição direta.
 */
function LeituraDoDia({ p }: { p: PontoDeMovimento }) {
  const val = (v: number | null, sinal: "+" | "−" | "auto") =>
    v == null ? "–"
      : sinal === "auto" ? `${v > 0 ? "+" : v < 0 ? "−" : ""}${fmt(Math.abs(v))}`
      : `${sinal}${fmt(v)}`;
  return (
    <div className="flex items-center gap-3 flex-wrap text-[11px] tabular-nums">
      <span className="font-bold">{p.dia.slice(8, 10)}/{p.dia.slice(5, 7)}</span>
      <span style={{ color: COR.entrada }}>Entradas {val(p.entradas, "+")}</span>
      <span style={{ color: COR.saida }}>
        Saídas {p.saidas == null ? "não derivável" : val(p.saidas, "−")}
        {p.saidas != null && <span className="opacity-50" title="valor derivado">˜</span>}
      </span>
      <span style={{ color: COR.seguidores }}>Saldo {val(p.saldo, "auto")}</span>
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

export function GraficoDeEvolucao({ pontos, nota, altura = 168 }: {
  pontos: PontoDaConta[]; nota?: string | null; altura?: number;
}) {
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
      legenda={<Legenda itens={[["Seguidores", COR.seguidores], ["Visitas", COR.visitas], ["Ativações", COR.ativacoes]]} />}>
      <svg viewBox={`0 0 ${W} ${altura}`} width="100%" height={altura} role="img" aria-label="Evolução da conta">
        {[0, 1, 2, 3].map((g) => (
          <line key={g} x1={ml} x2={W - mr} y1={mt + (ih / 3) * g} y2={mt + (ih / 3) * g}
            className={GRADE} strokeDasharray="3 4" />
        ))}

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

        {caminhos(vis, yF).map((d, k) => (
          <path key={`v${k}`} d={d} fill="none" stroke={COR.visitas} strokeWidth={2.2} strokeLinejoin="round" />
        ))}
        {caminhos(seg, yS).map((d, k) => (
          <path key={`s${k}`} d={d} fill="none" stroke={COR.seguidores} strokeWidth={2.2} strokeLinejoin="round" />
        ))}

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

        {pontos.map((p, i) => (
          <g key={`t${i}`}>
            <rect x={x(i) - bw / 2 - 2} y={mt} width={bw + 4} height={ih} fill="transparent" />
            <title>{`${p.dia.slice(8, 10)}/${p.dia.slice(5, 7)}
seguidores: ${p.seguidores == null ? "–" : fmt(p.seguidores)}
visitas: ${p.visitas == null ? "–" : fmt(p.visitas)}
ativações: ${ativ[i]}`}</title>
          </g>
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
export function GraficoDeMovimento({ pontos, nota, altura = 176 }: {
  pontos: PontoDeMovimento[]; nota?: string | null; altura?: number;
}) {
  const medidos = pontos.filter((p) => p.entradas != null || p.saidas != null || p.saldo != null);
  const vazio = medidos.length < 2;

  const W = 760, ml = 48, mr = 16, mt = 12, mb = 22;
  const iw = W - ml - mr, ih = altura - mt - mb;

  const esc = escalaDoMovimento(pontos);
  const yZero = mt + ih * esc.fracaoDoZero;
  /** Uma escala só para os três — é o que impede a leitura enganosa. */
  const px = (valor: number) => {
    const amplitude = esc.acima + esc.abaixo;
    return amplitude > 0 ? (Math.abs(valor) / amplitude) * ih : 0;
  };
  const y = (valor: number) => yZero - (valor >= 0 ? px(valor) : -px(valor));

  /**
   * Os pontos ocupam a largura inteira, e o passo é dela dividida pelo número de
   * dias — não `i/(n−1)`, que encosta o primeiro e o último nas bordas e deixa
   * as barras espremidas no miolo quando a série é curta.
   */
  const passoX = iw / Math.max(1, pontos.length);
  const x = (i: number) => ml + (i + 0.5) * passoX;
  const bw = Math.min(18, Math.max(4, passoX * 0.46));

  const linhaSaldo = (() => {
    const partes: string[] = [];
    let atual: string[] = [];
    pontos.forEach((p, i) => {
      if (p.saldo == null) { if (atual.length > 1) partes.push(atual.join(" ")); atual = []; return; }
      atual.push(`${atual.length ? "L" : "M"}${x(i).toFixed(1)},${y(p.saldo).toFixed(1)}`);
    });
    if (atual.length > 1) partes.push(atual.join(" "));
    return partes;
  })();

  const passoRotulo = intervaloDeRotulos(pontos.length, iw);
  /**
   * O dia sob o mouse.
   *
   * Uma faixa invisível de largura do PASSO captura o hover, e não a barra: a
   * barra tem 14px e o dia zerado não tem barra nenhuma — mirar nela deixaria
   * metade do gráfico sem resposta, justamente os dias em que não houve
   * movimento, que são os que geram dúvida.
   */
  const [ativo, setAtivo] = useState<number | null>(null);

  return (
    <Moldura titulo="Entradas × saídas × saldo" nota={nota} vazio={vazio} altura={altura}
      legenda={<Legenda itens={[["Entradas", COR.entrada], ["Saídas", COR.saida], ["Saldo", COR.seguidores]]} />}
      leitura={ativo != null ? <LeituraDoDia p={pontos[ativo]} /> : null}>
      <svg viewBox={`0 0 ${W} ${altura}`} width="100%" height={altura} role="img" aria-label="Movimento da base">
        {esc.rotulos.map((v, k) => {
          const yy = k === 0 ? mt : k === 1 ? yZero : mt + ih;
          return (
            <g key={k}>
              <line x1={ml} x2={W - mr} y1={yy} y2={yy}
                className={k === 1 ? "stroke-[rgba(10,10,10,.22)] dark:stroke-[rgba(255,255,255,.24)]" : GRADE}
                strokeDasharray={k === 1 ? undefined : "3 4"} />
              {/* O zero leva rótulo próprio: é a referência que dá sentido aos
                  outros dois, e o de baixo sai COM SINAL. */}
              <text x={ml - 7} y={yy + 4} textAnchor="end" fontSize={9} className={EIXO}>
                {v > 0 ? `+${fmt(v)}` : v < 0 ? `−${fmt(Math.abs(v))}` : "0"}
              </text>
            </g>
          );
        })}

        {/* A faixa do dia ativo, atrás de tudo — guia o olho sem tapar a barra. */}
        {ativo != null && (
          <rect x={x(ativo) - passoX / 2} y={mt} width={passoX} height={ih}
            className="fill-foreground/[0.045]" />
        )}

        {pontos.map((p, i) => {
          const destacado = ativo === i;
          return (
            <g key={p.dia}>
              {p.entradas != null && p.entradas > 0 && (
                <rect x={x(i) - bw / 2} y={y(p.entradas)} width={bw} height={px(p.entradas)}
                  fill={COR.entrada} opacity={ativo == null || destacado ? 0.9 : 0.35} rx={1.5}
                  className="transition-opacity duration-150" />
              )}
              {/* Desenhada para BAIXO a partir do zero — o desequilíbrio entre as
                  duas fica visível sem ler número nenhum. */}
              {p.saidas != null && p.saidas > 0 && (
                <rect x={x(i) - bw / 2} y={yZero} width={bw} height={px(p.saidas)}
                  fill={COR.saida} opacity={ativo == null || destacado ? 0.9 : 0.35} rx={1.5}
                  className="transition-opacity duration-150" />
              )}
              {/* O ponto do saldo só aparece no dia ativo: trinta pontos
                  permanentes competiriam com as barras. */}
              {destacado && p.saldo != null && (
                <circle cx={x(i)} cy={y(p.saldo)} r={4} fill="var(--color-card)"
                  stroke={COR.seguidores} strokeWidth={2.4} />
              )}
            </g>
          );
        })}

        {linhaSaldo.map((d, k) => (
          <path key={k} d={d} fill="none" stroke={COR.seguidores} strokeWidth={2.2}
            strokeLinejoin="round" strokeLinecap="round"
            opacity={ativo == null ? 1 : 0.55} className="transition-opacity duration-150" />
        ))}

        {/* As faixas de captura vão por ÚLTIMO, para ficarem acima de tudo — e
            cobrem o passo inteiro, então o dia sem barra também responde. */}
        {pontos.map((p, i) => (
          <rect key={`h${p.dia}`} x={x(i) - passoX / 2} y={mt} width={passoX} height={ih}
            fill="transparent" onMouseEnter={() => setAtivo(i)} onMouseLeave={() => setAtivo(null)} />
        ))}

        {pontos.map((p, i) => (i % passoRotulo ? null : (
          <text key={p.dia} x={x(i)} y={altura - 6} textAnchor="middle" fontSize={9} className={EIXO}>
            {p.dia.slice(8, 10)}/{p.dia.slice(5, 7)}
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
export function GraficoDeAtivacoes({ pontos, altura = 200 }: {
  pontos: PontoDaConta[]; altura?: number;
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

  const W = 760, ml = 30, mr = 14, mt = 20, mb = 22;
  const iw = W - ml - mr, ih = altura - mt - mb;
  const passo = iw / Math.max(1, pontos.length);
  const bw = Math.min(26, Math.max(4, passo * 0.62));
  const x = (i: number) => ml + (i + 0.5) * passo;
  /** A escala vem do MAIOR total do período — nada de teto arbitrário. */
  const alturaDaBarra = (total: number) => (total / max) * ih;
  const passoRotulo = intervaloDeRotulos(pontos.length, iw);

  return (
    <Moldura titulo="Ativações por dia" nota="a altura é o total · as cores dizem de que ele é feito"
      vazio={vazio} altura={altura}
      legenda={<Legenda itens={presentes.map((t) => [ROTULO_CONTEUDO[t], COR_TIPO[t]] as [string, string])} />}
      leitura={ativo != null && pontos[ativo] ? (
        <LeituraDasAtivacoes dia={pontos[ativo].dia} total={pilhas[ativo].total}
          segmentos={pilhas[ativo].segmentos} />
      ) : null}>
      <svg viewBox={`0 0 ${W} ${altura}`} width="100%" height={altura} role="img" aria-label="Ativações por dia e tipo"
        onMouseLeave={() => setAtivo(null)}>
        {[0, 1, 2, 3].map((g) => {
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
              {total > 0 && (
                <text x={x(i)} y={topoDaBarra - 6} textAnchor="middle" fontSize={9.5}
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
          <text key={p.dia} x={x(i)} y={altura - 6} textAnchor="middle" fontSize={9} className={EIXO}>
            {p.dia.slice(8, 10)}/{p.dia.slice(5, 7)}
          </text>
        )))}
      </svg>
    </Moldura>
  );
}
