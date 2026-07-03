/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  SELVA TV — slide fixo institucional (protetor de tela estilo DVD)
 * ─────────────────────────────────────────────────────────────────────────────
 *  Gerado pelo app (não depende de upload). Bolas da marca vagam pelo slide
 *  batendo nas bordas. Movimento suave via requestAnimationFrame, limpo no
 *  unmount. Respeita prefers-reduced-motion (fica estático). Não clicável.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useEffect, useRef } from "react";

const BALLS = [
  { color: "#F5ADCC", size: 52 },
  { color: "#E87AB0", size: 40 },
  { color: "#FDFFED", size: 26 },
  { color: "#EF701B", size: 34 },
  { color: "#7C5CE0", size: 30 },
];

export function DvdSlide() {
  const rootRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const els = Array.from(root.querySelectorAll<HTMLElement>("[data-ball]"));
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

    const r0 = root.getBoundingClientRect();
    const W0 = r0.width || 800;
    const H0 = r0.height || 300;

    const balls = els.map((el, i) => {
      const size = BALLS[i]?.size ?? 30;
      return {
        el,
        size,
        x: Math.random() * Math.max(1, W0 - size),
        y: Math.random() * Math.max(1, H0 - size),
        vx: (0.35 + Math.random() * 0.55) * (Math.random() < 0.5 ? -1 : 1),
        vy: (0.35 + Math.random() * 0.55) * (Math.random() < 0.5 ? -1 : 1),
      };
    });

    const place = () => balls.forEach((b) => { b.el.style.transform = `translate(${b.x}px, ${b.y}px)`; });
    place();

    if (reduce) return; // estático, sem animação

    const step = () => {
      const W = root.clientWidth;
      const H = root.clientHeight;
      for (const b of balls) {
        b.x += b.vx;
        b.y += b.vy;
        if (b.x <= 0) { b.x = 0; b.vx = Math.abs(b.vx); }
        else if (b.x + b.size >= W) { b.x = W - b.size; b.vx = -Math.abs(b.vx); }
        if (b.y <= 0) { b.y = 0; b.vy = Math.abs(b.vy); }
        else if (b.y + b.size >= H) { b.y = H - b.size; b.vy = -Math.abs(b.vy); }
      }
      place();
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);

    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, []);

  return (
    <div
      ref={rootRef}
      className="relative w-full h-full overflow-hidden"
      style={{ background: "radial-gradient(120% 120% at 50% 25%, #17131b 0%, #0A0A0A 72%)" }}
    >
      {/* Marca central (estática) */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none">
        <span className="font-black text-[#FDFFED]/90" style={{ fontFamily: "Montserrat, sans-serif", letterSpacing: "0.35em", fontSize: "clamp(20px,4vw,38px)" }}>
          SELVA
        </span>
        <span className="uppercase text-[#FDFFED]/40 mt-1" style={{ letterSpacing: "0.4em", fontSize: "10px" }}>Spaces</span>
      </div>
      {/* Bolas */}
      {BALLS.map((b, i) => (
        <div
          key={i}
          data-ball
          className="absolute top-0 left-0 rounded-full will-change-transform"
          style={{ width: b.size, height: b.size, background: b.color, boxShadow: `0 0 18px ${b.color}66` }}
        />
      ))}
    </div>
  );
}
