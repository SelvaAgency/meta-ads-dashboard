/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Ativações do período — quanto, e de quê
 * ─────────────────────────────────────────────────────────────────────────────
 *  A primeira pergunta da aba Conteúdo: quanto publicamos, e de que formato.
 *  Um número só não responde — 24 ativações feitas de 22 stories e 2 posts é
 *  uma conta com comportamento oposto ao de 24 feitas de 20 posts.
 *
 *  ── A rosca não substitui o número ─────────────────────────────────────────
 *  Ninguém lê quantidade em ângulo. O total fica no centro, grande, e a rosca
 *  responde a OUTRA pergunta: a proporção entre formatos. As duas convivem
 *  porque são leituras diferentes do mesmo dado.
 *
 *  ── Duas fontes numa rosca só, e o rodapé diz ──────────────────────────────
 *  Feed, carrossel e reels vêm da listagem de mídias. Stories vêm da contagem
 *  diária, porque story expirado já não está na listagem. `incompleto` viaja
 *  desde `shared/ativacoes.ts` e vira uma marca visível — sem ela, a fatia de
 *  stories afirmaria uma exatidão que a coleta não tem.
 *
 *  ── Segue o filtro de período, sem exceção ─────────────────────────────────
 *  Toda a contagem sai de `contarAtivacoes`, que já recorta por `publicadoEm`
 *  dentro da janela escolhida. Não há janela fixa aqui: trocar para 7 dias muda
 *  o total e a rosca junto.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useState } from "react";
import { Layers } from "lucide-react";
import type { ComposicaoDetalhada, FatiaDeAtivacao } from "@shared/ativacoes";
import { COR_TIPO } from "@shared/coresSociais";

/** Raio externo e espessura do anel, em unidades do viewBox. */
const R = 54;
const ESPESSURA = 17;
const CENTRO = 62;

const pct = (f: number) => `${(f * 100).toFixed(1).replace(".", ",")}%`;

/**
 * O arco de uma fatia, em coordenadas do SVG.
 *
 * Desenhado como um `path` com dois arcos (externo e interno) em vez de um
 * `circle` com `stroke-dasharray`: o dasharray resolveria o desenho, mas não dá
 * alvo de mouse por fatia — e a fatia precisa ser o alvo, senão o hover que a
 * tela promete não existe.
 */
function arco(inicio: number, fim: number): string {
  const ri = R - ESPESSURA;
  const ang = (t: number) => (t * 2 - 0.5) * Math.PI;
  const p = (raio: number, t: number) =>
    [CENTRO + raio * Math.cos(ang(t)), CENTRO + raio * Math.sin(ang(t))];
  // Uma fatia de 100% fecharia o path num ponto só e sumiria; 0,9999 mantém a
  // volta completa visível com uma fresta invisível a olho nu.
  const f = Math.min(fim, inicio + 0.9999);
  const grande = f - inicio > 0.5 ? 1 : 0;
  const [x1, y1] = p(R, inicio), [x2, y2] = p(R, f);
  const [x3, y3] = p(ri, f), [x4, y4] = p(ri, inicio);
  return `M${x1},${y1} A${R},${R} 0 ${grande} 1 ${x2},${y2} `
    + `L${x3},${y3} A${ri},${ri} 0 ${grande} 0 ${x4},${y4} Z`;
}

export function AtivacoesDoPeriodo({ composicao, rotuloDoPeriodo, diasSemStories }: {
  composicao: ComposicaoDetalhada;
  /** "últimos 14 dias" — a rosca precisa dizer de quando ela é. */
  rotuloDoPeriodo: string;
  /** Dias do período em que a coleta não mediu stories. */
  diasSemStories: number;
}) {
  const [ativa, setAtiva] = useState<FatiaDeAtivacao | null>(null);
  const { fatias, total } = composicao;
  /** Só as fatias com valor desenham arco — uma de zero seria um traço de 0°. */
  const desenhaveis = fatias.filter((f) => f.total > 0);

  let acumulado = 0;
  const arcos = desenhaveis.map((f) => {
    const inicio = acumulado;
    acumulado += f.fracao;
    return { f, d: arco(inicio, acumulado) };
  });

  return (
    <section className="flex flex-col min-w-0 px-5 py-[18px]">
      <div className="flex items-baseline gap-2.5 flex-wrap">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.13em]">Ativações</h2>
        <span className="text-[10.5px] text-muted-foreground/50">{rotuloDoPeriodo}</span>
      </div>

      {composicao.publicacoesIndisponiveis && (
        /* A distinção de sempre: "não publicou" é afirmação sobre o cliente,
           "não conseguimos ler" é afirmação sobre nós. */
        <p className="text-[10.5px] text-amber-600 leading-snug mt-2">
          Não conseguimos ler as publicações nesta coleta — só stories entram na conta abaixo.
        </p>
      )}

      {total === 0 && !desenhaveis.length ? (
        <p className="text-[11.5px] text-muted-foreground mt-4">
          {fatias.length
            ? "Nenhuma publicação no período."
            : "Sem coleta de publicações no período."}
        </p>
      ) : (
        <div className="flex items-center gap-5 mt-3 flex-wrap sm:flex-nowrap">
          {/* ── A rosca ───────────────────────────────────────────────────── */}
          <div className="relative flex-shrink-0" style={{ width: 124, height: 124 }}>
            <svg viewBox="0 0 124 124" width={124} height={124} role="img"
              aria-label="Composição das ativações por formato"
              onMouseLeave={() => setAtiva(null)}>
              {arcos.map(({ f, d }) => (
                <path key={f.tipo} d={d} fill={COR_TIPO[f.tipo]}
                  style={{
                    cursor: "pointer",
                    // A fatia sob o mouse fica cheia e as outras recuam. Realçar
                    // com borda ou deslocamento mexeria na geometria, e o olho
                    // leria mudança de tamanho como mudança de valor.
                    opacity: !ativa || ativa.tipo === f.tipo ? 1 : 0.3,
                    transition: "opacity 140ms ease",
                  }}
                  onMouseEnter={() => setAtiva(f)} />
              ))}
            </svg>
            {/* O centro: total, ou a fatia sob o mouse. */}
            <span className="absolute inset-0 flex flex-col items-center justify-center
                             pointer-events-none text-center px-2">
              {ativa ? (
                <>
                  <span className="text-[20px] font-bold tabular-nums leading-none"
                    style={{ color: COR_TIPO[ativa.tipo] }}>
                    {ativa.total.toLocaleString("pt-BR")}
                  </span>
                  <span className="text-[9px] font-semibold uppercase tracking-[0.1em] mt-1"
                    style={{ color: COR_TIPO[ativa.tipo] }}>
                    {ativa.rotulo}
                  </span>
                  <span className="text-[10px] tabular-nums text-muted-foreground mt-0.5">
                    {pct(ativa.fracao)}
                  </span>
                </>
              ) : (
                <>
                  <span className="text-[26px] font-bold tabular-nums leading-none">
                    {total.toLocaleString("pt-BR")}
                  </span>
                  <span className="text-[9px] font-semibold uppercase tracking-[0.1em]
                                   text-muted-foreground mt-1">
                    {total === 1 ? "ativação" : "ativações"}
                  </span>
                </>
              )}
            </span>
          </div>

          {/* ── A legenda: mesma lista, mesmo hover ────────────────────────── */}
          <ul className="flex flex-col gap-1.5 min-w-0 flex-1">
            {fatias.map((f) => (
              <li key={f.tipo}
                onMouseEnter={() => f.total > 0 && setAtiva(f)}
                onMouseLeave={() => setAtiva(null)}
                className={`flex items-baseline gap-2 rounded-md px-1.5 py-1 -mx-1.5
                            transition-colors duration-150 ${
                  f.total > 0 ? "cursor-pointer hover:bg-foreground/[0.04]" : ""} ${
                  ativa && ativa.tipo !== f.tipo ? "opacity-45" : ""}`}>
                <i className="w-2.5 h-2.5 rounded-[3px] flex-shrink-0 translate-y-[1px]"
                  style={{ background: COR_TIPO[f.tipo] }} />
                <span className="text-[12px] font-medium truncate">{f.rotulo}</span>
                <span className="flex-1 border-b border-dashed border-border/70 translate-y-[-2px]" />
                <span className={`text-[12.5px] font-bold tabular-nums flex-shrink-0 ${
                  f.total === 0 ? "text-muted-foreground/40" : ""}`}>
                  {f.total.toLocaleString("pt-BR")}
                  {f.incompleto && f.total > 0 && (
                    <span className="text-muted-foreground/60 font-normal" title="Piso: a coleta vê os stories que estão no ar">+</span>
                  )}
                </span>
                <span className="text-[10.5px] tabular-nums text-muted-foreground/70 w-[46px] text-right flex-shrink-0">
                  {total > 0 ? pct(f.fracao) : "–"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* O rodapé só existe quando há o que ressalvar. */}
      {(composicao.temPiso || diasSemStories > 0) && (
        <p className="text-[10px] text-muted-foreground/60 leading-snug mt-3">
          {composicao.temPiso && (
            <>Stories marcados com <span className="font-semibold">+</span> são um piso: a coleta
            conta o que está no ar às 06:20 e às 18:20, e o que nasceu e expirou entre as duas não
            é visto. </>
          )}
          {diasSemStories > 0 && `${diasSemStories} dia(s) do período sem medição de stories.`}
        </p>
      )}
    </section>
  );
}

/** O ícone da faixa, exportado para o cabeçalho da seção montar sozinho. */
export const ICONE_ATIVACOES = Layers;
