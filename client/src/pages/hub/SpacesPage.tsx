/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  SELVA Spaces — /spaces (experiência espacial · app interno)
 * ─────────────────────────────────────────────────────────────────────────────
 *  Porte fiel do index.html original (starfield, órbitas, logo central, intro,
 *  links orbitais) para React, dentro da shell do SELVA Spaces (com a sidebar).
 *  CSS 100% ENCAPSULADO em `.selva-galaxy` (não vaza para o resto do app);
 *  sem dangerouslySetInnerHTML. Os links orbitais usam navegação interna
 *  (mesma aba) para os apps do Spaces; Clipper (externo) abre em nova aba.
 *
 *  NÃO usa a animação estilo DVD (essa é só do slide fixo da SELVA TV).
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { HubShell } from "./HubShell";

const CLIPPER_URL = "https://spin-clipper.up.railway.app/";

export default function SpacesPage() {
  const [, navigate] = useLocation();
  const sceneRef = useRef<HTMLDivElement>(null);
  const sceneContentRef = useRef<HTMLDivElement>(null);
  const orbitFieldRef = useRef<HTMLDivElement>(null);
  const starfieldRef = useRef<HTMLDivElement>(null);
  const dustRef = useRef<HTMLDivElement>(null);
  const introRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scene = sceneRef.current;
    const sceneContent = sceneContentRef.current;
    const orbitField = orbitFieldRef.current;
    const starfield = starfieldRef.current;
    const dust = dustRef.current;
    const intro = introRef.current;
    if (!scene || !starfield || !dust) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const canHover = window.matchMedia("(hover:hover)").matches;

    // Intro: remove ao terminar / clicar / timeout.
    let introTimer: ReturnType<typeof setTimeout> | null = null;
    if (intro) {
      const clearIntro = () => intro.remove();
      intro.addEventListener("animationend", clearIntro);
      intro.addEventListener("click", clearIntro);
      introTimer = setTimeout(clearIntro, 2700);
    }

    // Starfield.
    const stars: { el: HTMLElement; leftPct: number; topPct: number }[] = [];
    for (let i = 0; i < 160; i++) {
      const s = document.createElement("div");
      s.className = "star";
      const sz = Math.random() * 1.8 + 0.3;
      const leftPct = Math.random() * 100;
      const topPct = Math.random() * 100;
      s.style.cssText = `width:${sz}px;height:${sz}px;top:${topPct}%;left:${leftPct}%;opacity:${Math.random() * 0.45 + 0.05}`;
      starfield.appendChild(s);
      stars.push({ el: s, leftPct, topPct });
    }

    // Dust.
    const dustAnims = ["dustfloat1", "dustfloat2", "dustfloat3"];
    const dustColors = ["rgba(253,255,237,0.16)", "rgba(239,112,27,0.14)", "rgba(253,255,237,0.1)"];
    for (let d = 0; d < 9; d++) {
      const p = document.createElement("div");
      p.className = "dust-p";
      const psz = 6 + Math.random() * 10;
      const dur = (28 + Math.random() * 30).toFixed(1);
      const delay = (-Math.random() * Number(dur)).toFixed(1);
      p.style.cssText =
        `width:${psz}px;height:${psz}px;top:${Math.random() * 100}%;left:${Math.random() * 100}%;` +
        `background:${dustColors[d % dustColors.length]};filter:blur(${(2 + Math.random() * 2).toFixed(1)}px);` +
        `animation:${dustAnims[d % dustAnims.length]} ${dur}s ease-in-out infinite;animation-delay:${delay}s;`;
      dust.appendChild(p);
    }

    // Parallax + repulsão das estrelas no mouse.
    let mouseX = 0, mouseY = 0, sceneW = 0, sceneH = 0, rafPending = false;
    let rafId: number | null = null;
    const STAR_RADIUS = 130, STAR_STRENGTH = 20;

    const updateStars = () => {
      rafPending = false;
      for (const st of stars) {
        const px = (st.leftPct / 100) * sceneW;
        const py = (st.topPct / 100) * sceneH;
        const dx = px - mouseX, dy = py - mouseY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < STAR_RADIUS && dist > 0.01) {
          const f = (1 - dist / STAR_RADIUS) * STAR_STRENGTH;
          st.el.style.transform = `translate(${((dx / dist) * f).toFixed(1)}px,${((dy / dist) * f).toFixed(1)}px)`;
        } else if (st.el.style.transform) {
          st.el.style.transform = "";
        }
      }
    };

    const onMove = (e: MouseEvent) => {
      const r = scene.getBoundingClientRect();
      sceneW = r.width; sceneH = r.height;
      const x = (e.clientX - r.left) / r.width;
      const y = (e.clientY - r.top) / r.height;
      mouseX = x * r.width; mouseY = y * r.height;
      sceneContent?.style.setProperty("--tx", `${(x - 0.5) * 16}deg`);
      sceneContent?.style.setProperty("--ty", `${(0.5 - y) * 16}deg`);
      if (orbitField) orbitField.style.transform = `rotate(${(x - 0.5) * 6}deg)`;
      if (!rafPending) { rafPending = true; rafId = requestAnimationFrame(updateStars); }
    };
    const onLeave = () => {
      sceneContent?.style.setProperty("--tx", "0deg");
      sceneContent?.style.setProperty("--ty", "0deg");
      if (orbitField) orbitField.style.transform = "rotate(0deg)";
      for (const st of stars) st.el.style.transform = "";
    };

    if (canHover && !reduceMotion) {
      scene.addEventListener("mousemove", onMove);
      scene.addEventListener("mouseleave", onLeave);
    }

    return () => {
      if (introTimer) clearTimeout(introTimer);
      if (rafId) cancelAnimationFrame(rafId);
      scene.removeEventListener("mousemove", onMove);
      scene.removeEventListener("mouseleave", onLeave);
      // nós DOM (stars/dust) somem com o unmount do container
    };
  }, []);

  // Link orbital interno (mesma aba, SPA).
  const goInternal = (href: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    navigate(href);
  };

  return (
    <HubShell>
      <div className="selva-galaxy">
        <style>{GALAXY_CSS}</style>

        <div className="intro" ref={introRef}>
          <div className="intro-flare" />
          <div className="intro-core" />
        </div>

        <div className="grain" />

        <header>
          <div className="header-logo">
            <svg viewBox="0 0 3443 392" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M94.7407 153.813C94.7407 163.637 121.881 164.969 157.013 166.634C219.452 169.798 307.2 174.127 307.033 230.239C307.033 294.176 233.771 309.328 155.182 309.328C76.7583 309.162 11.6553 299.671 3.33008 230.239H94.7407C104.731 247.555 127.875 252.051 155.182 252.051C182.322 252.051 215.623 247.555 215.623 230.239C215.623 220.415 188.482 218.917 153.35 217.251C90.9111 214.088 3.16357 209.759 3.33008 153.813C3.33008 89.876 76.5918 74.5576 155.182 74.5576C233.605 75.0571 298.708 83.8818 307.033 153.813H215.623C205.632 136.164 182.488 132.001 155.182 132.001C128.042 132.001 94.7407 135.998 94.7407 153.813ZM333.754 304.167V80.3853H595.664V137.663H421.002V166.301H595.664V218.084H421.002V246.723H595.664V304.167H333.754ZM645.529 80.0522H732.777V232.903H907.44V303.833H645.529V80.0522ZM951.31 80.3853L1019.58 235.733L1087.84 80.3853H1186.08L1071.36 304.167H967.627L853.073 80.3853H951.31ZM1303.55 145.155L1272.74 211.257H1334.18L1303.55 145.155ZM1131.55 304.167L1251.6 80.3853H1355.33L1475.38 304.167H1377.14L1359.49 265.871H1247.43L1229.78 304.167H1131.55ZM1674.34 153.813C1674.34 163.637 1701.48 164.969 1736.62 166.634C1799.05 169.798 1886.8 174.127 1886.64 230.239C1886.64 294.176 1813.37 309.328 1734.78 309.328C1656.36 309.162 1591.26 299.671 1582.93 230.239H1674.34C1684.33 247.555 1707.48 252.051 1734.78 252.051C1761.92 252.051 1795.23 247.555 1795.23 230.239C1795.23 220.415 1768.08 218.917 1732.95 217.251C1670.51 214.088 1582.77 209.759 1582.93 153.813C1582.93 89.876 1656.19 74.5576 1734.78 74.5576C1813.21 75.0571 1878.31 83.8818 1886.64 153.813H1795.23C1785.23 136.164 1762.09 132.001 1734.78 132.001C1707.64 132.001 1674.34 135.998 1674.34 153.813ZM2000.6 183.951H2107.17C2112.33 183.951 2116.82 182.119 2120.49 178.456C2124.32 174.626 2126.15 170.131 2126.15 164.969C2126.15 159.641 2124.32 155.146 2120.49 151.482C2116.82 147.653 2112.33 145.821 2107.17 145.821H2000.6V183.951ZM1913.36 80.3853H2128.98C2175.1 79.8857 2214.23 118.681 2213.56 164.969C2214.23 211.091 2175.1 250.219 2128.98 249.553H2000.6V304.167H1913.36V80.3853ZM2350.84 145.155L2320.04 211.257H2381.48L2350.84 145.155ZM2178.84 304.167L2298.89 80.3853H2402.62L2522.67 304.167H2424.44L2406.79 265.871H2294.73L2277.08 304.167H2178.84ZM2727.72 211.091H2817.13C2811.64 286.684 2745.37 309.328 2664.78 309.328C2580.86 309.162 2511.6 284.852 2511.93 200.102V183.784C2511.6 99.2002 2580.86 74.8906 2664.78 74.5576C2745.37 74.7241 2811.64 97.3687 2817.13 172.795H2727.72C2719.56 150.816 2694.75 145.655 2664.78 145.655C2629.15 146.154 2598.85 152.481 2599.35 189.279V194.773C2598.85 231.238 2629.15 237.898 2664.78 238.397C2694.75 238.397 2719.73 233.069 2727.72 211.091ZM2846.68 304.167V80.3853H3108.59V137.663H2933.93V166.301H3108.59V218.084H2933.93V246.723H3108.59V304.167H2846.68ZM3227.23 153.813C3227.23 163.637 3254.37 164.969 3289.5 166.634C3351.94 169.798 3439.68 174.127 3439.52 230.239C3439.52 294.176 3366.26 309.328 3287.67 309.328C3209.24 309.162 3144.14 299.671 3135.81 230.239H3227.23C3237.22 247.555 3260.36 252.051 3287.67 252.051C3314.81 252.051 3348.11 247.555 3348.11 230.239C3348.11 220.415 3320.97 218.917 3285.83 217.251C3223.4 214.088 3135.65 209.759 3135.81 153.813C3135.81 89.876 3209.08 74.5576 3287.67 74.5576C3366.09 75.0571 3431.19 83.8818 3439.52 153.813H3348.11C3338.12 136.164 3314.97 132.001 3287.67 132.001C3260.53 132.001 3227.23 135.998 3227.23 153.813Z" fill="#FDFFED" />
              <path d="M1485.61 238.564H1572.86V304H1485.61V238.564Z" fill="#EF701B" />
            </svg>
          </div>
          <div className="header-right">Powered by <a href="https://www.selva.agency" target="_blank" rel="noreferrer">SELVA Agency</a></div>
        </header>

        <div className="scene" ref={sceneRef}>
          <div className="starfield" ref={starfieldRef} />
          <div className="dust" ref={dustRef} />

          <div className="scene-content" ref={sceneContentRef}>
            <div className="ring" style={{ width: 270, height: 270 }} />
            <div className="ring" style={{ width: 390, height: 390 }} />
            <div className="ring" style={{ width: 510, height: 510 }} />

            <div className="galaxy-rings">
              <div className="g-ring g-ring1" />
              <div className="g-ring g-ring2" />
              <div className="g-ring g-ring3" />
              <div className="g-marker g-marker1" />
              <div className="g-marker g-marker2" />
            </div>

            <div className="s-wrap">
              <div className="s-beam" />
              <div className="s-halo" />
              <div className="s-ring1" />
              <div className="s-ring2" />
              <div className="s-dot1-t2" />
              <div className="s-dot1-t" />
              <div className="s-dot1" />
              <div className="s-dot2-t2" />
              <div className="s-dot2-t" />
              <div className="s-dot2" />
              <svg width="130" height="130" viewBox="0 0 523 523" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="261.5" cy="261.5" r="256" stroke="rgba(253,255,237,0.08)" strokeWidth="1" />
                <path d="M257.4 141.2C238.2 151.1 219 162.9 200.3 176.3C170.7 197.6 144.4 221.4 123.2 245.9C114.3 235.9 109.7 223.5 111.5 208.1C114.9 177.4 133.7 156.8 167.3 146.9C190.3 140.1 219.9 138.2 257.4 141.2Z" fill="#FDFFED" />
                <path d="M410.6 317.3C404.7 369.7 356.7 391.6 263.9 384.1C283.8 373.9 303.8 361.7 323.3 347.7C352.3 326.9 378.1 303.6 399 279.6C407.8 289.7 412.3 302 410.6 317.3Z" fill="#FDFFED" />
                <path d="M210.4 219.2C210.4 219.2 210.9 222 223.7 225.4C234.3 228.4 249.8 230.8 266.3 233.4L266.7 233.5C311.4 240.8 367.6 249.9 394.8 275.3C374.1 299.1 348.6 322.1 319.7 342.8C297.3 358.9 274.6 372.3 252.4 383C250.8 382.9 249.3 382.7 247.7 382.5C178.1 374.6 103.8 359.9 103.1 283.8L103.1 282.2C103.8 281.1 104.6 280 105.4 278.8L200.6 289.4L201.7 291.8C207.8 305.7 224.7 313.7 255 317.1C288.2 320.8 310.5 316.6 311.6 306.4C311.6 306.3 311.1 303.5 298.3 300C288.2 297.2 274.3 294.8 255.7 291.9L255.3 291.8C210.8 284.6 154.6 275.5 127.4 250.3C148 226.5 173.8 202.8 203.8 181.2C225.4 165.8 247.3 152.7 268.7 142.2C270.6 142.4 272.4 142.6 274.3 142.8C347.2 151.4 418.3 166 418.9 241.7L418.9 244C418.3 244.9 417.7 245.8 417 246.7L321.3 236.1L320.3 233.6C314.3 219.6 297.8 211.8 267 208.4C232.7 204.6 211.6 208.6 210.4 219.2Z" fill="#FDFFED" />
                <path d="M263.9 384.1C234.1 399.3 204.6 410 177.2 415.2C158.9 418.7 142.5 419.6 128.3 418.1C106.1 415.6 89.3 407.1 79.2 393C62.5 369.7 66.2 334.2 89.6 293C98.5 277.3 109.8 261.5 123.2 245.9C124.5 247.4 125.9 248.9 127.4 250.3C119.2 259.8 111.8 269.4 105.4 278.8L103.1 278.6L103.1 282.2C75 324.8 66.3 364.7 84.1 389.5C93.4 402.5 109.1 410 129.1 412.2C161.8 415.8 205.8 405.5 252.4 383C256.3 383.4 260.1 383.8 263.9 384.1Z" fill="#FDFFED" opacity="0.65" />
                <path d="M434 231C424.8 247.2 413 263.6 399 279.6C397.7 278.2 396.3 276.7 394.8 275.3C403 265.9 410.5 256.3 417 246.7L418.9 247V244C422.5 238.6 425.8 233.3 428.8 228C451 189 454.7 155.8 439.5 134.6C414.6 99.8 344.7 104.9 268.7 142.2C264.8 141.8 261.1 141.5 257.4 141.2C263.1 138.2 268.7 135.4 274.4 132.8C299.1 121.4 323.5 113.2 346.4 108.8C392.9 99.9 427.7 107.8 444.4 131C461.1 154.3 457.4 189.8 434 231Z" fill="#FDFFED" opacity="0.65" />
                <ellipse cx="261.5" cy="261.5" rx="245" ry="88" stroke="rgba(253,255,237,0.12)" strokeWidth="1" fill="none" transform="rotate(-20 261.5 261.5)" />
              </svg>
            </div>

            <div className="orbit-field" ref={orbitFieldRef}>
              <div className="orbit o1">
                <a className="orb-sat" href="/contracts" onClick={goInternal("/contracts")}>
                  <div className="orb-ring-spin" />
                  <div className="orb-icon"><svg viewBox="0 0 177 145" width="28" height="23"><path d="M176.6 55.8C176.6 104.5 137.1 144.1 88.3 144.1C39.5 144.1 0 104.5 0 55.8H32.5C32.5 86.6 57.5 111.5 88.3 111.5C119.1 111.5 144.1 86.6 144.1 55.8H176.6Z" fill="#FDFFED" /><path d="M144.1 55.8C144.1 86.6 119.1 111.5 88.3 111.5C57.5 111.5 32.5 86.6 32.5 55.8H144.1Z" fill="#EF701B" /><path d="M144.1 55.8H32.5C32.5 25 57.5 0 88.3 0C119.1 0 144.1 25 144.1 55.8Z" fill="rgba(253,255,237,0.3)" /></svg></div>
                  <div className="orb-label">Contratos</div>
                </a>
              </div>

              <div className="orbit o2">
                <a className="orb-sat" href="/tracker" onClick={goInternal("/tracker")}>
                  <div className="orb-ring-spin" />
                  <div className="orb-icon"><svg viewBox="0 0 144 145" width="26" height="26"><path d="M143.5 0H113.8V144.1H143.5V0Z" fill="#EF701B" /><path d="M92.9 31.5H63.2V144.1H92.9V31.5Z" fill="#FDFFED" /><path d="M66.7 73.2L40.9 58.3L0 129.2L25.8 144.1L66.7 73.2Z" fill="#FDFFED" /></svg></div>
                  <div className="orb-label">Brand Tracker</div>
                </a>
              </div>

              <div className="orbit o4">
                <a className="orb-sat" href={CLIPPER_URL} target="_blank" rel="noreferrer">
                  <div className="orb-ring-spin" />
                  <div className="orb-icon"><svg viewBox="0 0 146 145" width="26" height="26"><path d="M120.2 37.9L38.8 119.3L1 81.4L12.2 70.2C19.6 77.6 29.8 82.1 41 82.1C63.7 82.1 82.1 63.7 82.1 41C82.1 29.8 77.5 19.6 70.2 12.2L82.4 0L120.2 37.9Z" fill="#FDFFED" /><path d="M145 62.6L63.6 144.1L38.8 119.3L120.2 37.9L145 62.6Z" fill="#EF701B" /></svg></div>
                  <div className="orb-label">Clipper</div>
                </a>
              </div>

              <div className="orbit o3">
                <a className="orb-sat" href="/reports" onClick={goInternal("/reports")}>
                  <div className="orb-ring-spin" />
                  <div className="orb-icon"><svg viewBox="0 0 169 145" width="24" height="20"><path d="M168.8 42.2C168.8 53.3 164.5 63.4 157.5 71L144.1 84.4H144L84.2 24.5L96.8 12.4C104.4 4.3 115.5 0 126.6 0C149.9 0 168.8 18.9 168.8 42.2Z" fill="#EF701B" /><path d="M144.1 84.4L84.4 144.1L11.4 71C4.3 63.4 0 53.3 0 42.2C0 18.9 18.9 0 42.2 0C53.3 0 63.5 4.3 71 11.4L84.2 24.5L144.1 84.4Z" fill="#FDFFED" /></svg></div>
                  <div className="orb-label">Report</div>
                </a>
              </div>
            </div>
          </div>
        </div>

        <div className="dock">
          <div className="dock-label">em breve</div>
          <div className="dock-items" />
        </div>
      </div>
    </HubShell>
  );
}

// CSS 100% escopado em `.selva-galaxy` (não afeta o resto do app).
const GALAXY_CSS = `
.selva-galaxy{
  --scene-scale:1; --tx:0deg; --ty:0deg;
  position:relative; flex:1; min-height:0; width:100%;
  overflow:hidden; background:#060810;
  display:flex; flex-direction:column;
  font-family:"Inter","Helvetica Neue",Arial,sans-serif;
}
.selva-galaxy header{
  position:relative; z-index:20;
  display:flex; align-items:center; justify-content:space-between;
  padding:0 clamp(16px,4vw,40px); height:clamp(54px,9vw,64px);
  border-bottom:0.5px solid rgba(253,255,237,0.08);
  background:rgba(6,8,16,0.7); backdrop-filter:blur(12px);
  flex-shrink:0; opacity:0; animation:sgHeaderIn 1s ease-out forwards; animation-delay:1.5s;
}
@keyframes sgHeaderIn{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}
.selva-galaxy .header-logo{display:flex;align-items:center}
.selva-galaxy .header-logo svg{height:clamp(16px,3vw,26px);width:auto}
.selva-galaxy .header-right{font-size:clamp(8px,1.6vw,10px);letter-spacing:0.2em;text-transform:uppercase;color:rgba(253,255,237,0.3);font-weight:200;white-space:nowrap}
.selva-galaxy .header-right a{color:rgba(253,255,237,0.45);text-decoration:none;border-bottom:0.5px solid rgba(253,255,237,0.2);padding-bottom:1px;transition:color 0.3s}
.selva-galaxy .header-right a:hover{color:#FDFFED}

.selva-galaxy .grain{
  position:absolute; inset:0; z-index:90; pointer-events:none;
  opacity:0.085; mix-blend-mode:overlay;
  background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='140' height='140'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>");
  animation:sgGrain 1s steps(4) infinite;
}
@keyframes sgGrain{0%{transform:translate(0,0)}25%{transform:translate(-1.5%,1.5%)}50%{transform:translate(1.5%,-1%)}75%{transform:translate(-1%,1%)}100%{transform:translate(0,0)}}

.selva-galaxy .intro{position:absolute;inset:0;z-index:200;background:#060810;display:flex;align-items:center;justify-content:center;overflow:hidden;opacity:1;animation:sgIntroOut 1.15s ease-out forwards;animation-delay:1.3s}
.selva-galaxy .intro-core{width:90px;height:90px;border-radius:50%;background:radial-gradient(circle,#FDFFED 0%,rgba(239,112,27,0.6) 40%,transparent 74%);animation:sgIntroCore 1.3s cubic-bezier(.22,.7,.2,1) forwards;filter:blur(1px)}
@keyframes sgIntroCore{0%{transform:scale(0.04);opacity:0.45;filter:blur(9px)}100%{transform:scale(1);opacity:1;filter:blur(2px)}}
.selva-galaxy .intro-flare{position:absolute;inset:0;pointer-events:none;background:radial-gradient(circle at 50% 50%,rgba(253,255,237,0.5),rgba(239,112,27,0.15) 32%,transparent 64%);opacity:0;animation:sgIntroFlare 1.3s ease-in forwards}
@keyframes sgIntroFlare{0%,55%{opacity:0}78%{opacity:0.45}100%{opacity:0.18}}
@keyframes sgIntroOut{to{opacity:0;visibility:hidden}}

.selva-galaxy .scene{flex:1;position:relative;display:flex;align-items:center;justify-content:center;overflow:hidden;box-shadow:inset 0 0 180px 50px rgba(0,0,0,0.55)}
.selva-galaxy .scene::before{content:'';position:absolute;inset:-15%;z-index:0;pointer-events:none;background:radial-gradient(ellipse 50% 45% at 74% 28%,rgba(239,112,27,0.16) 0%,transparent 60%),radial-gradient(ellipse 55% 60% at 50% 45%,rgba(45,100,45,0.3) 0%,rgba(25,70,30,0.12) 40%,transparent 70%),radial-gradient(ellipse 80% 70% at 50% 50%,rgba(12,28,70,0.5) 0%,transparent 85%);animation:sgNebula 50s ease-in-out infinite}
@keyframes sgNebula{0%,100%{transform:scale(1)}50%{transform:scale(1.08) rotate(2deg)}}

.selva-galaxy .dust{position:absolute;inset:0;z-index:2;pointer-events:none}
.selva-galaxy .dust-p{position:absolute;border-radius:50%;pointer-events:none}
@keyframes dustfloat1{0%,100%{transform:translate(0,0)}50%{transform:translate(36px,-26px)}}
@keyframes dustfloat2{0%,100%{transform:translate(0,0)}50%{transform:translate(-32px,22px)}}
@keyframes dustfloat3{0%,100%{transform:translate(0,0)}50%{transform:translate(22px,30px)}}

.selva-galaxy .starfield{position:absolute;inset:0;z-index:1;pointer-events:none;animation:sgStardrift 240s linear infinite}
@keyframes sgStardrift{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
.selva-galaxy .star{position:absolute;background:#fff;border-radius:50%;pointer-events:none;transition:transform 0.45s cubic-bezier(.2,.8,.2,1)}

.selva-galaxy .scene-content{position:absolute;inset:0;z-index:5;transform-style:preserve-3d;transform:perspective(1400px) rotateX(var(--ty)) rotateY(var(--tx)) scale(var(--scene-scale));transition:transform 0.5s cubic-bezier(.2,.8,.2,1);will-change:transform;opacity:0;animation:sgReveal 1.4s ease-out forwards;animation-delay:0.95s}
@keyframes sgReveal{to{opacity:1}}
.selva-galaxy .orbit-field{position:absolute;inset:0;transition:transform 0.5s cubic-bezier(.2,.8,.2,1)}
.selva-galaxy .ring{position:absolute;border-radius:50%;border:0.5px solid rgba(255,255,255,0.06);top:50%;left:50%;transform:translate(-50%,-50%);pointer-events:none}

.selva-galaxy .s-wrap{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);z-index:10;width:200px;height:200px;display:flex;align-items:center;justify-content:center;animation:sgPulse 4s ease-in-out infinite}
@keyframes sgPulse{0%,100%{transform:translate(-50%,-50%) scale(1)}50%{transform:translate(-50%,-50%) scale(1.04)}}
.selva-galaxy .s-halo{position:absolute;inset:-70px;border-radius:50%;filter:blur(3px);background:radial-gradient(circle,rgba(253,255,237,0.12) 0%,rgba(239,112,27,0.07) 38%,transparent 72%);animation:sgHalo 4s ease-in-out infinite}
@keyframes sgHalo{0%,100%{opacity:0.4}50%{opacity:0.9}}
.selva-galaxy .s-beam{position:absolute;top:-60vh;left:50%;width:1px;height:160vh;transform:translateX(-50%);pointer-events:none;mix-blend-mode:screen;opacity:0.55;background:linear-gradient(to bottom,transparent 0%,rgba(239,112,27,0.4) 42%,rgba(253,255,237,0.6) 50%,rgba(239,112,27,0.4) 58%,transparent 100%);animation:sgBeam 7s ease-in-out infinite}
@keyframes sgBeam{0%,100%{opacity:0.35}50%{opacity:0.65}}
.selva-galaxy .s-ring1{position:absolute;top:50%;left:50%;width:190px;height:66px;margin-left:-95px;margin-top:-33px;border-radius:50%;border:1px solid rgba(253,255,237,0.22);animation:sgSring1 12s linear infinite}
@keyframes sgSring1{from{transform:rotateX(70deg) rotateZ(0deg)}to{transform:rotateX(70deg) rotateZ(360deg)}}
.selva-galaxy .s-ring2{position:absolute;top:50%;left:50%;width:210px;height:56px;margin-left:-105px;margin-top:-28px;border-radius:50%;border:0.5px solid rgba(239,112,27,0.28);animation:sgSring2 18s linear infinite reverse}
@keyframes sgSring2{from{transform:rotateX(75deg) rotateZ(60deg)}to{transform:rotateX(75deg) rotateZ(420deg)}}
.selva-galaxy .s-dot1,.selva-galaxy .s-dot1-t,.selva-galaxy .s-dot1-t2{position:absolute;top:50%;left:50%;border-radius:50%;background:#FDFFED;animation:sgSdot1 12s linear infinite}
.selva-galaxy .s-dot1{width:6px;height:6px;margin-left:-3px;margin-top:-3px;box-shadow:0 0 8px rgba(253,255,237,0.9)}
.selva-galaxy .s-dot1-t{width:4px;height:4px;margin-left:-2px;margin-top:-2px;opacity:0.35;filter:blur(0.5px);animation-delay:-0.35s}
.selva-galaxy .s-dot1-t2{width:3px;height:3px;margin-left:-1.5px;margin-top:-1.5px;opacity:0.16;filter:blur(0.8px);animation-delay:-0.7s}
@keyframes sgSdot1{0%{transform:rotateX(70deg) rotateZ(0deg) translateX(95px) rotateX(-70deg) rotateZ(0deg)}100%{transform:rotateX(70deg) rotateZ(360deg) translateX(95px) rotateX(-70deg) rotateZ(-360deg)}}
.selva-galaxy .s-dot2,.selva-galaxy .s-dot2-t,.selva-galaxy .s-dot2-t2{position:absolute;top:50%;left:50%;border-radius:50%;background:#EF701B;animation:sgSdot2 18s linear infinite reverse}
.selva-galaxy .s-dot2{width:5px;height:5px;margin-left:-2.5px;margin-top:-2.5px;box-shadow:0 0 8px rgba(239,112,27,0.9)}
.selva-galaxy .s-dot2-t{width:3.5px;height:3.5px;margin-left:-1.75px;margin-top:-1.75px;opacity:0.32;filter:blur(0.5px);animation-delay:-0.5s}
.selva-galaxy .s-dot2-t2{width:2.5px;height:2.5px;margin-left:-1.25px;margin-top:-1.25px;opacity:0.15;filter:blur(0.8px);animation-delay:-1s}
@keyframes sgSdot2{0%{transform:rotateX(75deg) rotateZ(60deg) translateX(105px) rotateX(-75deg) rotateZ(-60deg)}100%{transform:rotateX(75deg) rotateZ(420deg) translateX(105px) rotateX(-75deg) rotateZ(-420deg)}}

.selva-galaxy .galaxy-rings{position:absolute;top:50%;left:50%;width:0;height:0;z-index:6;pointer-events:none}
.selva-galaxy .g-ring{position:absolute;border-radius:50%;transform-style:preserve-3d}
.selva-galaxy .g-ring1{width:560px;height:190px;margin:-95px 0 0 -280px;border:0.5px solid rgba(253,255,237,0.10);animation:sgGring1 75s linear infinite}
@keyframes sgGring1{from{transform:rotateX(73deg) rotateZ(12deg)}to{transform:rotateX(73deg) rotateZ(372deg)}}
.selva-galaxy .g-ring2{width:680px;height:250px;margin:-125px 0 0 -340px;border:0.5px solid rgba(239,112,27,0.09);animation:sgGring2 105s linear infinite reverse}
@keyframes sgGring2{from{transform:rotateX(67deg) rotateZ(-30deg)}to{transform:rotateX(67deg) rotateZ(330deg)}}
.selva-galaxy .g-ring3{width:440px;height:400px;margin:-200px 0 0 -220px;border:0.5px solid rgba(253,255,237,0.07);animation:sgGring3 140s linear infinite}
@keyframes sgGring3{from{transform:rotateX(58deg) rotateZ(68deg)}to{transform:rotateX(58deg) rotateZ(428deg)}}
.selva-galaxy .g-marker{position:absolute;top:50%;left:50%;width:4px;height:4px;margin:-2px 0 0 -2px;border-radius:50%;box-shadow:0 0 6px currentColor}
.selva-galaxy .g-marker1{background:#FDFFED;color:#FDFFED;animation:sgGmark1 75s linear infinite}
@keyframes sgGmark1{0%{transform:rotateX(73deg) rotateZ(12deg) translateX(280px) rotateX(-73deg) rotateZ(-12deg)}100%{transform:rotateX(73deg) rotateZ(372deg) translateX(280px) rotateX(-73deg) rotateZ(-372deg)}}
.selva-galaxy .g-marker2{background:#EF701B;color:#EF701B;animation:sgGmark2 105s linear infinite reverse}
@keyframes sgGmark2{0%{transform:rotateX(67deg) rotateZ(-30deg) translateX(340px) rotateX(-67deg) rotateZ(30deg)}100%{transform:rotateX(67deg) rotateZ(330deg) translateX(340px) rotateX(-67deg) rotateZ(-330deg)}}

.selva-galaxy .orbit{position:absolute;top:50%;left:50%;width:0;height:0;z-index:8}
.selva-galaxy .o1{animation:sgOrb1 18s linear infinite}
.selva-galaxy .o2{animation:sgOrb2 24s linear infinite}
.selva-galaxy .o3{animation:sgOrb3 30s linear infinite reverse}
.selva-galaxy .o4{animation:sgOrb4 22s linear infinite}
@keyframes sgOrb1{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
@keyframes sgOrb2{from{transform:rotate(120deg)}to{transform:rotate(480deg)}}
@keyframes sgOrb3{from{transform:rotate(240deg)}to{transform:rotate(-120deg)}}
@keyframes sgOrb4{from{transform:rotate(300deg)}to{transform:rotate(660deg)}}
.selva-galaxy .orb-sat{position:absolute;top:0;display:flex;flex-direction:column;align-items:center;gap:7px;cursor:pointer;text-decoration:none;transform:translateY(-50%)}
.selva-galaxy .o1 .orb-sat{left:195px;animation:sgCo1 18s linear infinite}
.selva-galaxy .o2 .orb-sat{left:165px;animation:sgCo2 24s linear infinite}
.selva-galaxy .o3 .orb-sat{left:220px;animation:sgCo3 30s linear infinite reverse}
.selva-galaxy .o4 .orb-sat{left:260px;animation:sgCo4 22s linear infinite}
@keyframes sgCo1{from{transform:translateY(-50%) rotate(0deg)}to{transform:translateY(-50%) rotate(-360deg)}}
@keyframes sgCo2{from{transform:translateY(-50%) rotate(-120deg)}to{transform:translateY(-50%) rotate(-480deg)}}
@keyframes sgCo3{from{transform:translateY(-50%) rotate(-240deg)}to{transform:translateY(-50%) rotate(120deg)}}
@keyframes sgCo4{from{transform:translateY(-50%) rotate(-300deg)}to{transform:translateY(-50%) rotate(-660deg)}}
.selva-galaxy .orb-ring-spin{position:absolute;top:0;left:50%;width:70px;height:70px;margin-top:-6px;transform:translateX(-50%);border-radius:50%;background:conic-gradient(from 0deg,transparent 0%,rgba(239,112,27,0.55) 6%,transparent 18%,transparent 100%);opacity:0.55;animation:sgRingspin 7s linear infinite;z-index:0;pointer-events:none}
@keyframes sgRingspin{to{transform:translateX(-50%) rotate(360deg)}}
.selva-galaxy .orb-icon{position:relative;z-index:1;width:58px;height:58px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:rgba(6,8,16,0.9);border:1.5px solid rgba(239,112,27,0.6);box-shadow:0 0 14px rgba(239,112,27,0.18);transition:border-color 0.3s,box-shadow 0.3s;animation:sgIconBreathe 5s ease-in-out infinite}
.selva-galaxy .o1 .orb-icon{animation-delay:0s}
.selva-galaxy .o2 .orb-icon{animation-delay:-1.3s}
.selva-galaxy .o3 .orb-icon{animation-delay:-2.6s}
.selva-galaxy .o4 .orb-icon{animation-delay:-3.9s}
@keyframes sgIconBreathe{0%,100%{box-shadow:0 0 14px rgba(239,112,27,0.18);filter:brightness(1)}50%{box-shadow:0 0 24px rgba(239,112,27,0.4);filter:brightness(1.12)}}
.selva-galaxy .orb-icon::after{content:'';position:absolute;inset:-9px;border-radius:50%;border:1px solid rgba(239,112,27,0.55);opacity:0;transform:scale(0.8);pointer-events:none}
.selva-galaxy .orb-sat:hover .orb-icon{border-color:#EF701B;box-shadow:0 0 30px rgba(239,112,27,0.5)}
.selva-galaxy .orb-sat:hover .orb-icon::after{animation:sgRingping 0.8s ease-out}
@keyframes sgRingping{0%{opacity:0.85;transform:scale(0.8)}100%{opacity:0;transform:scale(1.7)}}
.selva-galaxy .orb-label{font-size:8px;letter-spacing:0.16em;text-transform:uppercase;color:rgba(239,112,27,0.75);font-weight:300;white-space:nowrap;transition:color 0.3s,letter-spacing 0.3s}
.selva-galaxy .orb-sat:hover .orb-label{color:#FDFFED;letter-spacing:0.22em}

.selva-galaxy .dock{position:relative;z-index:20;display:flex;align-items:center;justify-content:center;padding:0 clamp(16px,4vw,40px);height:clamp(48px,8vw,66px);border-top:0.5px solid rgba(253,255,237,0.07);background:rgba(6,8,16,0.5);backdrop-filter:blur(8px);flex-shrink:0;opacity:0;animation:sgDockIn 1s ease-out forwards;animation-delay:1.6s}
@keyframes sgDockIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
.selva-galaxy .dock-label{font-size:8px;letter-spacing:0.22em;text-transform:uppercase;color:rgba(253,255,237,0.2);white-space:nowrap}

@media (max-width:900px){.selva-galaxy{--scene-scale:0.78}}
@media (max-width:600px){.selva-galaxy{--scene-scale:0.58} .selva-galaxy .header-right{display:none}}
@media (max-width:420px){.selva-galaxy{--scene-scale:0.46}}
@media (max-height:520px){.selva-galaxy{--scene-scale:0.5}}
@media (prefers-reduced-motion: reduce){
  .selva-galaxy .intro{display:none}
  .selva-galaxy header,.selva-galaxy .dock,.selva-galaxy .scene-content{opacity:1 !important;animation:none !important;transform:none !important}
  .selva-galaxy .scene-content{transition:none}
}
`;
