/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  SELVA TV — slide fixo institucional (protetor de tela estilo DVD)
 * ─────────────────────────────────────────────────────────────────────────────
 *  Logo SELVA Spaces ao centro (asset /selva-spaces.svg) e as BOLAS-LINK do
 *  Spaces original (Tracker, Relatórios, Contratos, Clipper) vagando pelo slide
 *  estilo DVD, batendo nas bordas. Cada bola tem ícone, label e link real.
 *
 *  · Movimento suave via requestAnimationFrame, limpo no unmount.
 *  · prefers-reduced-motion → estático (bolas continuam clicáveis).
 *  · Hover pausa e destaca a bola (facilita o clique).
 *  · Permissões: Contratos só admin; atalhos gerais para todos.
 *  · Não usa órbitas (isso é do /spaces).
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { memo, useEffect, useRef, type ReactNode } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { canAccessAdmin } from "@shared/permissions";

const CLIPPER_URL = "https://spin-clipper.up.railway.app/";

interface Shortcut {
  key: string;
  label: string;
  href: string;
  internal: boolean;
  adminOnly?: boolean;
  icon: ReactNode;
}

const SHORTCUTS: Shortcut[] = [
  {
    key: "tracker", label: "Tracker", href: "/tracker", internal: true,
    icon: <svg viewBox="0 0 144 145" width="24" height="24"><path d="M143.5 0H113.8V144.1H143.5V0Z" fill="#EF701B" /><path d="M92.9 31.5H63.2V144.1H92.9V31.5Z" fill="#FDFFED" /><path d="M66.7 73.2L40.9 58.3L0 129.2L25.8 144.1L66.7 73.2Z" fill="#FDFFED" /></svg>,
  },
  {
    key: "reports", label: "Relatórios", href: "/reports", internal: true,
    icon: <svg viewBox="0 0 169 145" width="22" height="19"><path d="M168.8 42.2C168.8 53.3 164.5 63.4 157.5 71L144.1 84.4H144L84.2 24.5L96.8 12.4C104.4 4.3 115.5 0 126.6 0C149.9 0 168.8 18.9 168.8 42.2Z" fill="#EF701B" /><path d="M144.1 84.4L84.4 144.1L11.4 71C4.3 63.4 0 53.3 0 42.2C0 18.9 18.9 0 42.2 0C53.3 0 63.5 4.3 71 11.4L84.2 24.5L144.1 84.4Z" fill="#FDFFED" /></svg>,
  },
  {
    key: "contracts", label: "Contratos", href: "/contracts", internal: true, adminOnly: true,
    icon: <svg viewBox="0 0 177 145" width="26" height="21"><path d="M176.6 55.8C176.6 104.5 137.1 144.1 88.3 144.1C39.5 144.1 0 104.5 0 55.8H32.5C32.5 86.6 57.5 111.5 88.3 111.5C119.1 111.5 144.1 86.6 144.1 55.8H176.6Z" fill="#FDFFED" /><path d="M144.1 55.8C144.1 86.6 119.1 111.5 88.3 111.5C57.5 111.5 32.5 86.6 32.5 55.8H144.1Z" fill="#EF701B" /><path d="M144.1 55.8H32.5C32.5 25 57.5 0 88.3 0C119.1 0 144.1 25 144.1 55.8Z" fill="rgba(253,255,237,0.3)" /></svg>,
  },
  {
    key: "clipper", label: "Clipper", href: CLIPPER_URL, internal: false,
    icon: <svg viewBox="0 0 146 145" width="23" height="23"><path d="M120.2 37.9L38.8 119.3L1 81.4L12.2 70.2C19.6 77.6 29.8 82.1 41 82.1C63.7 82.1 82.1 63.7 82.1 41C82.1 29.8 77.5 19.6 70.2 12.2L82.4 0L120.2 37.9Z" fill="#FDFFED" /><path d="M145 62.6L63.6 144.1L38.8 119.3L120.2 37.9L145 62.6Z" fill="#EF701B" /></svg>,
  },
];

export const DvdSlide = memo(function DvdSlide({ active = true }: { active?: boolean } = {}) {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const isAdmin = canAccessAdmin((user as { role?: string } | null)?.role);
  const shortcuts = SHORTCUTS.filter((s) => !s.adminOnly || isAdmin);

  const rootRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const pausedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    // Slide invisível (não é o slide ativo do carrossel / fora da tela): não
    // roda a animação nem o requestAnimationFrame. Reinicia ao voltar a ativo.
    if (!active) return;
    const root = rootRef.current;
    if (!root) return;
    const els = Array.from(root.querySelectorAll<HTMLElement>("[data-ball]"));
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

    const r0 = root.getBoundingClientRect();
    const W0 = r0.width || 800;
    const H0 = r0.height || 300;

    const balls = els.map((el) => {
      const w = el.offsetWidth || 60;
      const h = el.offsetHeight || 76;
      return {
        el,
        key: el.dataset.key ?? "",
        w, h,
        x: Math.random() * Math.max(1, W0 - w),
        y: Math.random() * Math.max(1, H0 - h),
        vx: (0.32 + Math.random() * 0.5) * (Math.random() < 0.5 ? -1 : 1),
        vy: (0.32 + Math.random() * 0.5) * (Math.random() < 0.5 ? -1 : 1),
      };
    });

    const place = () => balls.forEach((b) => { b.el.style.transform = `translate(${b.x}px, ${b.y}px)`; });
    place();

    if (reduce) return; // estático, mas clicável

    const step = () => {
      const W = root.clientWidth;
      const H = root.clientHeight;
      for (const b of balls) {
        if (pausedRef.current.has(b.key)) continue; // hover → pausa
        b.x += b.vx;
        b.y += b.vy;
        if (b.x <= 0) { b.x = 0; b.vx = Math.abs(b.vx); }
        else if (b.x + b.w >= W) { b.x = W - b.w; b.vx = -Math.abs(b.vx); }
        if (b.y <= 0) { b.y = 0; b.vy = Math.abs(b.vy); }
        else if (b.y + b.h >= H) { b.y = H - b.h; b.vy = -Math.abs(b.vy); }
      }
      place();
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);

    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [shortcuts.length, active]);

  const ballProps = (s: Shortcut) => ({
    "data-ball": true,
    "data-key": s.key,
    "aria-label": s.label,
    onMouseEnter: () => pausedRef.current.add(s.key),
    onMouseLeave: () => pausedRef.current.delete(s.key),
    className:
      "group absolute top-0 left-0 z-10 flex flex-col items-center gap-1.5 no-underline will-change-transform",
  });

  const Ball = ({ s }: { s: Shortcut }) => (
    <>
      <span className="w-14 h-14 rounded-full flex items-center justify-center transition-[filter,box-shadow,border-color] duration-300 group-hover:brightness-125"
        style={{
          background: "rgba(6,8,16,0.85)",
          border: "1.5px solid rgba(239,112,27,0.6)",
          boxShadow: "0 0 14px rgba(239,112,27,0.2)",
        }}
      >
        {s.icon}
      </span>
      <span className="uppercase text-[8px] font-light tracking-[0.16em] text-[rgba(239,112,27,0.85)] group-hover:text-[#FDFFED] whitespace-nowrap">
        {s.label}
      </span>
    </>
  );

  return (
    <div
      ref={rootRef}
      className="relative w-full h-full overflow-hidden"
      style={{ background: "radial-gradient(120% 120% at 50% 25%, #17131b 0%, #060810 72%)" }}
    >
      {/* Logo SELVA Spaces (elemento principal, centralizado) */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none z-0">
        <img src="/selva-spaces.svg" alt="SELVA Spaces" style={{ width: "min(56%,460px)", height: "auto", opacity: 0.95 }} />
      </div>

      {/* Bolas-link (DVD) */}
      {shortcuts.map((s) =>
        s.internal ? (
          <a key={s.key} href={s.href} onClick={(e) => { e.preventDefault(); navigate(s.href); }} {...ballProps(s)}>
            <Ball s={s} />
          </a>
        ) : (
          <a key={s.key} href={s.href} target="_blank" rel="noreferrer" {...ballProps(s)}>
            <Ball s={s} />
          </a>
        )
      )}
    </div>
  );
});
