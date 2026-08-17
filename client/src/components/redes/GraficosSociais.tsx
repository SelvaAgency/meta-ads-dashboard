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
import { COR, COR_TIPO, ORDEM_TIPO } from "@shared/coresSociais";
import { ROTULO_CONTEUDO, type TipoConteudo } from "@shared/tipoDeMidia";

const fmt = (v: number) => Math.round(v).toLocaleString("pt-BR");
const EIXO = "fill-[rgba(10,10,10,.42)] dark:fill-[rgba(255,255,255,.42)]";
const GRADE = "stroke-[rgba(10,10,10,.07)] dark:stroke-[rgba(255,255,255,.09)]";

/** A moldura comum: título miúdo, nota ao lado, e o vazio dito por extenso. */
function Moldura({ titulo, nota, legenda, vazio, altura, children }: {
  titulo: string; nota?: string | null; legenda?: React.ReactNode;
  vazio: boolean; altura: number; children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/70">
            {titulo}
          </span>
          {nota && <span className="text-[10px] text-muted-foreground/50">{nota}</span>}
        </div>
        {legenda}
      </div>
      {vazio ? (
        <div style={{ height: altura }} className="flex items-center justify-center text-xs text-muted-foreground">
          Sem dados suficientes no período.
        </div>
      ) : children}
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
  total: number | null;
  entradas: number | null;
  saidas: number | null;
}

export function GraficoDeMovimento({ pontos, nota, altura = 176 }: {
  pontos: PontoDeMovimento[]; nota?: string | null; altura?: number;
}) {
  const comTotal = pontos.map((p) => p.total).filter((v): v is number => v != null);
  const vazio = comTotal.length < 2;

  const W = 760, ml = 44, mr = 36, mt = 12, mb = 22;
  const iw = W - ml - mr, ih = altura - mt - mb;
  /* O eixo do meio a 56% deixa mais espaço acima: entradas costumam ser maiores
     que saídas, e centralizar cortaria o topo das barras verdes. */
  const meio = mt + ih * 0.56;

  const ent = pontos.map((p) => p.entradas ?? 0);
  const sai = pontos.map((p) => p.saidas ?? 0);
  const movMax = Math.max(1, ...ent, ...sai) * 1.25;
  const sMin = comTotal.length ? Math.min(...comTotal) - 40 : 0;
  const sMax = comTotal.length ? Math.max(...comTotal) + 40 : 1;

  const x = (i: number) => ml + (i / Math.max(1, pontos.length - 1)) * iw;
  const hMov = (v: number) => (v / movMax) * (ih * 0.42);
  const yS = (v: number) => mt + ih - ((v - sMin) / Math.max(1, sMax - sMin)) * ih;
  const bw = Math.max(3, (iw / pontos.length) * 0.42);

  const linhaTotal = pontos
    .map((p, i) => (p.total == null ? null : `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${yS(p.total).toFixed(1)}`))
    .filter(Boolean).join(" ").replace(/^L/, "M");

  return (
    <Moldura titulo="Entradas × saídas × saldo" nota={nota} vazio={vazio} altura={altura}
      legenda={<Legenda itens={[["Entradas", COR.entrada], ["Saídas", COR.saida], ["Saldo", COR.seguidores]]} />}>
      <svg viewBox={`0 0 ${W} ${altura}`} width="100%" height={altura} role="img" aria-label="Movimento da base">
        <defs>
          <linearGradient id="grSaldo" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={COR.seguidores} stopOpacity="0.14" />
            <stop offset="1" stopColor={COR.seguidores} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Área do saldo atrás, para as barras não competirem com ela. */}
        {linhaTotal && (
          <path d={`${linhaTotal} L${W - mr},${mt + ih} L${ml},${mt + ih} Z`} fill="url(#grSaldo)" />
        )}
        <line x1={ml} x2={W - mr} y1={meio} y2={meio} className="stroke-[rgba(10,10,10,.16)] dark:stroke-[rgba(255,255,255,.18)]" />

        {pontos.map((p, i) => (
          <g key={p.dia}>
            {p.entradas != null && (
              <rect x={x(i) - bw / 2} y={meio - hMov(p.entradas)} width={bw} height={hMov(p.entradas)}
                fill={COR.entrada} opacity={0.82} rx={1} />
            )}
            {/* Saída desenhada para BAIXO — o desequilíbrio fica visível sem ler
                número nenhum. Buraco quando não é derivável. */}
            {p.saidas != null && (
              <rect x={x(i) - bw / 2} y={meio} width={bw} height={hMov(p.saidas)}
                fill={COR.saida} opacity={0.82} rx={1} />
            )}
            <title>{`${p.dia.slice(8, 10)}/${p.dia.slice(5, 7)}
entraram: ${p.entradas == null ? "–" : fmt(p.entradas)}
saíram: ${p.saidas == null ? "não derivável" : fmt(p.saidas)}
total: ${p.total == null ? "–" : fmt(p.total)}`}</title>
          </g>
        ))}

        {linhaTotal && (
          <path d={linhaTotal} fill="none" stroke={COR.seguidores} strokeWidth={2.2} strokeLinejoin="round" />
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
      </svg>
    </Moldura>
  );
}

// ─── 3. Ativações por dia: barras empilhadas, seção própria ──────────────────

export function GraficoDeAtivacoes({ pontos, altura = 182 }: {
  pontos: PontoDaConta[]; altura?: number;
}) {
  const presentes = ORDEM_TIPO.filter((t) => pontos.some((p) => (p.porTipo?.[t] ?? 0) > 0));
  const totais = pontos.map((p) => ORDEM_TIPO.reduce((n, t) => n + (p.porTipo?.[t] ?? 0), 0));
  const max = Math.max(1, ...totais);
  const vazio = !presentes.length;

  const W = 760, ml = 30, mr = 12, mt = 12, mb = 22;
  const iw = W - ml - mr, ih = altura - mt - mb;
  const passo = iw / Math.max(1, pontos.length);
  const bw = passo * 0.62;
  const x = (i: number) => ml + (i + 0.5) * passo;
  const alturaDe = (v: number) => (v / max) * ih;

  return (
    <Moldura titulo="Ativações por dia" nota="a altura é o total · as cores dizem de que ele é feito"
      vazio={vazio} altura={altura}
      legenda={<Legenda itens={presentes.map((t) => [ROTULO_CONTEUDO[t], COR_TIPO[t]] as [string, string])} />}>
      <svg viewBox={`0 0 ${W} ${altura}`} width="100%" height={altura} role="img" aria-label="Ativações por dia e tipo">
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

        {pontos.map((p, i) => {
          let base = mt + ih;
          const doTopo = [...presentes].reverse().find((t) => (p.porTipo?.[t] ?? 0) > 0);
          return (
            <g key={p.dia}>
              {presentes.map((t) => {
                const v = p.porTipo?.[t] ?? 0;
                if (!v) return null;
                const h = alturaDe(v);
                base -= h;
                /* Só o topo da pilha arredonda — os de baixo retos, para as
                   faixas se encostarem sem folga entre elas. */
                return <rect key={t} x={x(i) - bw / 2} y={base} width={bw} height={h}
                  fill={COR_TIPO[t]} opacity={0.9} rx={t === doTopo ? 2.5 : 0} />;
              })}
              <rect x={x(i) - passo / 2} y={mt} width={passo} height={ih} fill="transparent" />
              <title>{`${p.dia.slice(8, 10)}/${p.dia.slice(5, 7)} · ${totais[i]} ativaç${totais[i] === 1 ? "ão" : "ões"}
${presentes.filter((t) => p.porTipo?.[t]).map((t) => `${p.porTipo![t]} ${ROTULO_CONTEUDO[t].toLowerCase()}`).join(" · ") || "nenhuma"}`}</title>
            </g>
          );
        })}

        {pontos.map((p, i) => (i % 5 ? null : (
          <text key={p.dia} x={x(i)} y={altura - 6} textAnchor="middle" fontSize={9} className={EIXO}>
            {p.dia.slice(8, 10)}/{p.dia.slice(5, 7)}
          </text>
        )))}
      </svg>
    </Moldura>
  );
}
