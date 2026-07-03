/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  SELVA TV — slide nativo "Você prefere?" (interativo)
 * ─────────────────────────────────────────────────────────────────────────────
 *  Fundo preto, título fixo (Akira), duas caixas (rosa/azul) que são BOTÕES de
 *  voto e o rosto ao centro. O rosto faz FLIP horizontal DIRETO (sem rotação):
 *  segue o hover das caixas (mobile: cai no voto atual, senão neutro).
 *
 *  Votantes: cabeças PNG recortadas (auto-associadas pelo slug do nome do
 *  usuário → /selvatv/voters/<slug>.png), com contorno na cor da opção
 *  (rosa/azul). Sem PNG → iniciais (também com a cor da opção). Até 5 + "+N".
 *
 *  Assets (client/public/): /selvatv/giulia-motta.png · /selvatv/voters/*.png
 *  · fontes em /fonts/.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";

const FACE_SRC = "/selvatv/giulia-motta.png";
const PINK = "#F7A8CC";
const BLUE = "#3B54E6";

type Voter = { name: string; avatarUrl?: string };

function initials(name: string): string {
  return (name?.trim()?.[0] ?? "?").toUpperCase();
}

// Slug do nome → arquivo do PNG. Ex.: "Giulia Motta" → "giulia-motta".
function toSlug(name: string): string {
  return (name || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

// Contorno colorido que segue a silhueta do PNG (borda dinâmica por opção).
function outline(c: string): string {
  return [
    `drop-shadow(1.5px 0 0 ${c})`, `drop-shadow(-1.5px 0 0 ${c})`,
    `drop-shadow(0 1.5px 0 ${c})`, `drop-shadow(0 -1.5px 0 ${c})`,
    `drop-shadow(1.1px 1.1px 0 ${c})`, `drop-shadow(-1.1px 1.1px 0 ${c})`,
    `drop-shadow(1.1px -1.1px 0 ${c})`, `drop-shadow(-1.1px -1.1px 0 ${c})`,
  ].join(" ");
}

function Head({ name, side }: { name: string; side: "left" | "right" }) {
  const [broken, setBroken] = useState(false);
  const color = side === "left" ? PINK : BLUE;
  if (broken || !name) {
    return <span className="vp-head-fallback" style={{ borderColor: color }} title={name}>{initials(name)}</span>;
  }
  return (
    <img
      className="vp-head" src={`/selvatv/voters/${toSlug(name)}.png`} alt="" title={name} draggable={false}
      onError={() => setBroken(true)} style={{ filter: outline(color) }}
    />
  );
}

function VoterHeads({ voters, count, side }: { voters: Voter[]; count: number; side: "left" | "right" }) {
  if (!count) return null;
  const shown = voters.slice(0, 5);
  const extra = count - shown.length;
  return (
    <div className={`vp-heads vp-heads-${side}`}>
      {shown.map((v, i) => <Head key={i} name={v.name} side={side} />)}
      {extra > 0 && <span className="vp-head-more" style={{ borderColor: side === "left" ? PINK : BLUE }}>+{extra}</span>}
    </div>
  );
}

export function VocePrefereSlide({
  leftText, rightText, preview = false,
}: {
  leftText: string; rightText: string; preview?: boolean;
}) {
  const votesQ = trpc.selvaTV.vocePrefereVotes.useQuery(undefined, { enabled: !preview, refetchOnWindowFocus: false });
  const utils = trpc.useUtils();
  const vote = trpc.selvaTV.vocePrefereVote.useMutation({ onSuccess: () => utils.selvaTV.vocePrefereVotes.invalidate() });

  const data = votesQ.data;
  const myVote = data?.myVote ?? null;
  const clickable = !preview;

  // Olhar da Giulia: hover das caixas (desktop) → voto atual (mobile) → neutro.
  const [hover, setHover] = useState<"left" | "right" | null>(null);
  const gaze: "left" | "right" = hover ?? myVote ?? "left";

  const boxClass = (opt: "left" | "right") =>
    `vp-box vp-${opt}${clickable ? " vp-click" : ""}${myVote === opt ? " vp-selected" : ""}`;
  const onVote = (opt: "left" | "right") => { if (clickable) vote.mutate({ option: opt }); };

  return (
    <div className="relative w-full h-full overflow-hidden bg-black" style={{ containerType: "size" } as React.CSSProperties}>
      <style>{VP_CSS}</style>
      <div className="vp-title">VOCÊ PREFERE?</div>

      <button
        type="button" className={boxClass("left")} onClick={() => onVote("left")} disabled={!clickable}
        onMouseEnter={() => setHover("left")} onMouseLeave={() => setHover(null)}
      >
        <span className="vp-opt">{leftText}</span>
      </button>
      <button
        type="button" className={boxClass("right")} onClick={() => onVote("right")} disabled={!clickable}
        onMouseEnter={() => setHover("right")} onMouseLeave={() => setHover(null)}
      >
        <span className="vp-opt vp-opt-light">{rightText}</span>
      </button>

      {/* Cabeças dos votantes (decorativas — cliques passam para as caixas). */}
      {data && <VoterHeads voters={data.left.voters} count={data.left.count} side="left" />}
      {data && <VoterHeads voters={data.right.voters} count={data.right.count} side="right" />}

      <div className="vp-face-wrap">
        {/* Flip horizontal DIRETO (sem transição). */}
        <img className="vp-face" src={FACE_SRC} alt="" draggable={false}
          style={{ transform: gaze === "right" ? "scaleX(-1)" : "scaleX(1)" }} />
      </div>
    </div>
  );
}

const VP_CSS = `
.vp-title{
  position:absolute; top:6.5%; left:0; right:0; text-align:center; z-index:5;
  font-family:"Akira Expanded","Montserrat",sans-serif; font-weight:800;
  color:#FDFFED; text-transform:uppercase; letter-spacing:0.02em;
  font-size:clamp(12px,3.1vw,38px); padding:0 6%;
}
.vp-box{
  position:absolute; top:23%; height:64%; width:23%; border-radius:6px;
  z-index:2; border:none; padding:0; text-align:left; appearance:none; overflow:visible;
}
.vp-left{ left:8%; background:#F7A8CC; }
.vp-right{ right:8%; background:#3B54E6; }
.vp-click{ cursor:pointer; transition:transform .15s ease, filter .15s ease, box-shadow .15s ease; }
.vp-click:hover{ filter:brightness(1.06); transform:translateY(-2px); }
.vp-selected{ box-shadow:0 0 0 3px rgba(253,255,237,0.9); }
.vp-opt{
  position:absolute; left:9%; right:9%; bottom:9%;
  font-family:"Atkinson Hyperlegible","DM Sans",sans-serif; color:#0A0A0A;
  font-size:clamp(10px,1.7vw,20px); line-height:1.15;
}
.vp-opt-light{ color:#FDFFED; }

/* Cabeças dos votantes — sobre a borda superior de cada caixa. */
.vp-heads{ position:absolute; top:23%; height:16cqh; transform:translate(-50%,-50%); display:flex; align-items:flex-end; z-index:6; pointer-events:none; }
.vp-heads-left{ left:19.5%; }
.vp-heads-right{ left:80.5%; }
.vp-heads > * + *{ margin-left:-2.4cqw; }
.vp-head{ height:100%; width:auto; display:block; }
.vp-head-fallback, .vp-head-more{
  height:100%; aspect-ratio:1; border-radius:50%; display:flex; align-items:center; justify-content:center;
  background:#1a1a1a; color:#FDFFED; font-weight:700; font-size:6cqh; border:0.5cqh solid; flex-shrink:0; box-sizing:border-box;
}
.vp-head-more{ background:#0A0A0A; border-color:rgba(253,255,237,0.4)!important; }

.vp-face-wrap{ position:absolute; left:50%; bottom:5%; height:56%; transform:translateX(-50%); z-index:4; pointer-events:none; }
.vp-face{ height:100%; width:auto; display:block; transform-origin:center; transition:none; }
@media (prefers-reduced-motion: reduce){ .vp-face{ transition:none; } }
`;
