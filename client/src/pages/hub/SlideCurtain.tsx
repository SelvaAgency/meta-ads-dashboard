/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  SELVA TV — cortina de transição (barras animadas na paleta SELVA)
 * ─────────────────────────────────────────────────────────────────────────────
 *  Camada sobre o carrossel que "fecha" (cobre o slide atual), o carrossel troca
 *  de slide por baixo (instantâneo) e o slide de destino inicializa escondido, e
 *  então "abre" (revela o novo slide). Substitui o instante de travamento por uma
 *  transição intencional da identidade.
 *
 *  Barras verticais em cruz (algumas entram pela esquerda, outras pela direita),
 *  rosa / azul / creme / laranja / preto-azulado. Só CSS transform (composição),
 *  sem custo de layout. prefers-reduced-motion → fade simples (sem barras).
 * ─────────────────────────────────────────────────────────────────────────────
 */
export type CurtainPhase = "idle" | "covering" | "covered" | "revealing";

// Paleta SELVA. `from` = posição escondida antes de cobrir; `to` = para onde sai
// ao revelar (direções alternadas = efeito editorial em cruz).
const BARS: { color: string; from: string; to: string }[] = [
  { color: "#F7A8CC", from: "-140%", to: "140%" }, // rosa   ← entra pela esquerda
  { color: "#3B54E6", from: "140%", to: "-140%" }, // azul   → entra pela direita
  { color: "#FDFFED", from: "-140%", to: "140%" }, // creme  ←
  { color: "#EF701B", from: "140%", to: "-140%" }, // laranja →
  { color: "#060810", from: "-140%", to: "140%" }, // preto-azulado ←
];

export function SlideCurtain({ phase, reduce }: { phase: CurtainPhase; reduce: boolean }) {
  return (
    <div className={`stv-curtain${reduce ? " stv-reduce" : ""}`} data-phase={phase} aria-hidden="true">
      <style>{CURTAIN_CSS}</style>
      {reduce ? (
        <div className="stv-fade" />
      ) : (
        BARS.map((b, i) => (
          <div
            key={i}
            className="stv-bar"
            style={{
              left: `${i * (100 / BARS.length)}%`,
              width: `calc(${100 / BARS.length}% + 1px)`,
              background: b.color,
              transitionDelay: `${i * 28}ms`,
              ["--in-from"]: b.from,
              ["--out-to"]: b.to,
            } as React.CSSProperties}
          />
        ))
      )}
    </div>
  );
}

const CURTAIN_CSS = `
.stv-curtain{ position:absolute; inset:0; z-index:20; overflow:hidden; pointer-events:none; border-radius:12px; }
.stv-curtain[data-phase="idle"]{ display:none; }
.stv-bar{ position:absolute; top:-2%; height:104%; transform:translateX(var(--in-from)); will-change:transform; }
.stv-curtain[data-phase="covering"] .stv-bar,
.stv-curtain[data-phase="covered"] .stv-bar{ transform:translateX(0); transition:transform 220ms cubic-bezier(.65,0,.2,1); }
.stv-curtain[data-phase="revealing"] .stv-bar{ transform:translateX(var(--out-to)); transition:transform 300ms cubic-bezier(.65,0,.2,1); }

/* prefers-reduced-motion → fade simples, sem barras animadas. */
.stv-curtain.stv-reduce .stv-bar{ display:none; }
.stv-fade{ position:absolute; inset:0; background:#060810; opacity:0; }
.stv-curtain.stv-reduce[data-phase="covering"] .stv-fade,
.stv-curtain.stv-reduce[data-phase="covered"] .stv-fade{ opacity:1; transition:opacity 150ms linear; }
.stv-curtain.stv-reduce[data-phase="revealing"] .stv-fade{ opacity:0; transition:opacity 200ms linear; }
`;
