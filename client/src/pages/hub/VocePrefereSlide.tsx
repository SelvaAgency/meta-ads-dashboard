/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  SELVA TV — slide nativo "Você prefere?" (interativo)
 * ─────────────────────────────────────────────────────────────────────────────
 *  Fundo preto, título fixo (Akira), duas caixas (rosa/azul) que são BOTÕES de
 *  voto, e o rosto ao centro com FLIP horizontal DIRETO (sem rotação/suavização
 *  — olha um lado, pausa, troca instantânea). Respeita prefers-reduced-motion.
 *
 *  Voto: 1 por usuário, persistido no backend (selvaTV.vocePrefereVote). Cada
 *  caixa mostra os avatares de quem votou nela (foto do perfil ou iniciais),
 *  com "+N" quando há muitos. Proporções relativas ao container (aspect 8:3).
 *
 *  Assets (client/public/): /selvatv/giulia-motta.png · fontes em /fonts/.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { trpc } from "@/lib/trpc";

const FACE_SRC = "/selvatv/giulia-motta.png";

type Voter = { name: string; avatarUrl?: string };

function initials(name: string): string {
  return (name?.trim()?.[0] ?? "?").toUpperCase();
}

function Avatars({ voters, count }: { voters: Voter[]; count: number }) {
  if (!count) return null;
  const shown = voters.slice(0, 5);
  const extra = count - shown.length;
  return (
    <div className="vp-avatars">
      {shown.map((v, i) => (
        <span className="vp-av" key={i} style={{ marginLeft: i ? "-30%" : 0 }} title={v.name}>
          {v.avatarUrl ? <img src={v.avatarUrl} alt="" /> : initials(v.name)}
        </span>
      ))}
      {extra > 0 && <span className="vp-av vp-av-more" style={{ marginLeft: "-30%" }}>+{extra}</span>}
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

  const boxClass = (opt: "left" | "right") =>
    `vp-box vp-${opt}${clickable ? " vp-click" : ""}${myVote === opt ? " vp-selected" : ""}`;

  const onVote = (opt: "left" | "right") => { if (clickable) vote.mutate({ option: opt }); };

  return (
    <div className="relative w-full h-full overflow-hidden bg-black">
      <style>{VP_CSS}</style>
      <div className="vp-title">VOCÊ PREFERE?</div>

      <button type="button" className={boxClass("left")} onClick={() => onVote("left")} disabled={!clickable}>
        {data && <Avatars voters={data.left.voters} count={data.left.count} />}
        <span className="vp-opt">{leftText}</span>
      </button>

      <button type="button" className={boxClass("right")} onClick={() => onVote("right")} disabled={!clickable}>
        {data && <Avatars voters={data.right.voters} count={data.right.count} />}
        <span className="vp-opt vp-opt-light">{rightText}</span>
      </button>

      <div className="vp-face-wrap">
        <img className="vp-face" src={FACE_SRC} alt="" draggable={false} />
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
  position:absolute; top:36%; height:44%; width:29%; border-radius:5px;
  z-index:2; border:none; padding:0; text-align:left; appearance:none;
  overflow:visible;
}
.vp-left{ left:8%; background:#F7A8CC; }
.vp-right{ right:8%; background:#3B54E6; }
.vp-click{ cursor:pointer; transition:transform .15s ease, filter .15s ease, box-shadow .15s ease; }
.vp-click:hover{ filter:brightness(1.06); transform:translateY(-2px); }
.vp-selected{ box-shadow:0 0 0 3px rgba(253,255,237,0.9); }
.vp-opt{
  position:absolute; left:9%; right:9%; bottom:10%;
  font-family:"Atkinson Hyperlegible","DM Sans",sans-serif; color:#0A0A0A;
  font-size:clamp(10px,1.7vw,20px); line-height:1.15;
}
.vp-opt-light{ color:#FDFFED; }

.vp-avatars{ position:absolute; top:0; left:50%; transform:translate(-50%,-60%); display:flex; align-items:center; z-index:6; pointer-events:none; }
.vp-av{
  width:clamp(15px,2.3vw,26px); height:clamp(15px,2.3vw,26px); border-radius:50%;
  overflow:hidden; border:2px solid #060810; background:#3a3a3a; color:#FDFFED;
  display:flex; align-items:center; justify-content:center;
  font-size:clamp(7px,1vw,11px); font-weight:700; flex-shrink:0;
}
.vp-av img{ width:100%; height:100%; object-fit:cover; display:block; }
.vp-av-more{ background:#0A0A0A; }

.vp-face-wrap{ position:absolute; left:50%; bottom:6%; height:50%; transform:translateX(-50%); z-index:4; pointer-events:none; }
.vp-face{ height:100%; width:auto; display:block; transform-origin:center; animation:vp-flip 2.6s linear infinite; will-change:transform; }
@keyframes vp-flip{
  0%,49.9%  { transform:scaleX(1); }
  50%,100%  { transform:scaleX(-1); }
}
@media (prefers-reduced-motion: reduce){ .vp-face{ animation:none; } }
`;
