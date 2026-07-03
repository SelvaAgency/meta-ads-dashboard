/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  SELVA TV — slide nativo "Você prefere?"
 * ─────────────────────────────────────────────────────────────────────────────
 *  Fundo preto, título fixo (fonte Akira), duas caixas (rosa/azul) com os textos
 *  das opções (fonte Atkinson) e o rosto recortado ao centro, com um flip
 *  horizontal suave (parece olhar de um lado para o outro). Respeita
 *  prefers-reduced-motion (fica parado). Só CSS — nada de requestAnimationFrame.
 *
 *  Assets (client/public/): /selvatv/giulia-motta.png · fontes em /fonts/.
 * ─────────────────────────────────────────────────────────────────────────────
 */
const FACE_SRC = "/selvatv/giulia-motta.png";

export function VocePrefereSlide({ leftText, rightText }: { leftText: string; rightText: string }) {
  return (
    <div className="relative w-full h-full overflow-hidden bg-black">
      <style>{VP_CSS}</style>
      <div className="vp-title">VOCÊ PREFERE?</div>

      <div className="vp-box vp-left">
        <span className="vp-opt">{leftText}</span>
      </div>
      <div className="vp-box vp-right">
        <span className="vp-opt vp-opt-light">{rightText}</span>
      </div>

      <div className="vp-face-wrap">
        <img className="vp-face" src={FACE_SRC} alt="" draggable={false} />
      </div>
    </div>
  );
}

const VP_CSS = `
.vp-title{
  position:absolute; top:6%; left:0; right:0; text-align:center; z-index:5;
  font-family:"Akira Expanded","Montserrat",sans-serif; font-weight:800;
  color:#FDFFED; text-transform:uppercase; letter-spacing:0.01em;
  font-size:clamp(15px,4.4vw,52px); padding:0 6%;
}
.vp-box{ position:absolute; top:27%; height:60%; width:33%; border-radius:6px; z-index:2; }
.vp-left{ left:7%; background:#F7A8CC; }
.vp-right{ right:7%; background:#3B54E6; }
.vp-opt{
  position:absolute; left:8%; right:8%; bottom:9%;
  font-family:"Atkinson Hyperlegible","DM Sans",sans-serif; color:#0A0A0A;
  font-size:clamp(11px,1.9vw,22px); line-height:1.15;
}
.vp-opt-light{ color:#FDFFED; }
.vp-face-wrap{ position:absolute; left:50%; bottom:3%; height:80%; transform:translateX(-50%); z-index:4; }
.vp-face{ height:100%; width:auto; display:block; transform-origin:center; animation:vp-face-flip 4s ease-in-out infinite; will-change:transform; }
@keyframes vp-face-flip{
  0%,42%  { transform:scaleX(1); }
  50%,92% { transform:scaleX(-1); }
  100%    { transform:scaleX(1); }
}
@media (prefers-reduced-motion: reduce){ .vp-face{ animation:none; } }
`;
