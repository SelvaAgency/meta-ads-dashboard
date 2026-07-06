/**
 * GravityField — cabeçalho interativo da Home do Selva Spaces
 * Piscina de bolinhas com física real (gravidade, colisões, z-layers)
 * Logo SELVA.SPACES no meio — brilha onde não há bolinha por cima
 */
import { memo, useEffect, useRef } from "react";

const C=[253,255,237],O=[239,112,27],P=[245,173,204];
const POOL=[C,C,C,O,O,P,P,P,C,O,P,C,O,P,C,P,O,C,P,O];
const BR=12,GRAV=.038,DAMP=.983,REST=.42;

const LOGO_SVG=`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 3443 392' fill='none'><path d='M94.7407 153.813C94.7407 163.637 121.881 164.969 157.013 166.634C219.452 169.798 307.2 174.127 307.033 230.239C307.033 294.176 233.771 309.328 155.182 309.328C76.7583 309.162 11.6553 299.671 3.33008 230.239H94.7407C104.731 247.555 127.875 252.051 155.182 252.051C182.322 252.051 215.623 247.555 215.623 230.239C215.623 220.415 188.482 218.917 153.35 217.251C90.9111 214.088 3.16357 209.759 3.33008 153.813C3.33008 89.876 76.5918 74.5576 155.182 74.5576C233.605 75.0571 298.708 83.8818 307.033 153.813H215.623C205.632 136.164 182.488 132.001 155.182 132.001C128.042 132.001 94.7407 135.998 94.7407 153.813Z' fill='%23FDFFED'/><path d='M333.754 304.167V80.3853H595.664V137.663H421.002V166.301H595.664V218.084H421.002V246.723H595.664V304.167H333.754Z' fill='%23FDFFED'/><path d='M645.529 80.0522H732.777V232.903H907.44V303.833H645.529V80.0522Z' fill='%23FDFFED'/><path d='M951.31 80.3853L1019.58 235.733L1087.84 80.3853H1186.08L1071.36 304.167H967.627L853.073 80.3853H951.31Z' fill='%23FDFFED'/><path d='M1303.55 145.155L1272.74 211.257H1334.18L1303.55 145.155Z' fill='%23FDFFED'/><path d='M1131.55 304.167L1251.6 80.3853H1355.33L1475.38 304.167H1377.14L1359.49 265.871H1247.43L1229.78 304.167H1131.55Z' fill='%23FDFFED'/><path d='M1485.61 238.564H1572.86V304H1485.61V238.564Z' fill='%23EF701B'/><path d='M1674.34 153.813C1674.34 163.637 1701.48 164.969 1736.62 166.634C1799.05 169.798 1886.8 174.127 1886.64 230.239C1886.64 294.176 1813.37 309.328 1734.78 309.328C1656.36 309.162 1591.26 299.671 1582.93 230.239H1674.34C1684.33 247.555 1707.48 252.051 1734.78 252.051C1761.92 252.051 1795.23 247.555 1795.23 230.239C1795.23 220.415 1768.08 218.917 1732.95 217.251C1670.51 214.088 1582.77 209.759 1582.93 153.813C1582.93 89.876 1656.19 74.5576 1734.78 74.5576C1813.21 75.0571 1878.31 83.8818 1886.64 153.813H1795.23C1785.23 136.164 1762.09 132.001 1734.78 132.001C1707.64 132.001 1674.34 135.998 1674.34 153.813Z' fill='%23FDFFED'/><path d='M2000.6 183.951H2107.17C2112.33 183.951 2116.82 182.119 2120.49 178.456C2124.32 174.626 2126.15 170.131 2126.15 164.969C2126.15 159.641 2124.32 155.146 2120.49 151.482C2116.82 147.653 2112.33 145.821 2107.17 145.821H2000.6V183.951Z' fill='%23FDFFED'/><path d='M1913.36 80.3853H2128.98C2175.1 79.8857 2214.23 118.681 2213.56 164.969C2214.23 211.091 2175.1 250.219 2128.98 249.553H2000.6V304.167H1913.36V80.3853Z' fill='%23FDFFED'/><path d='M2350.84 145.155L2320.04 211.257H2381.48L2350.84 145.155Z' fill='%23FDFFED'/><path d='M2178.84 304.167L2298.89 80.3853H2402.62L2522.67 304.167H2424.44L2406.79 265.871H2294.73L2277.08 304.167H2178.84Z' fill='%23FDFFED'/><path d='M2727.72 211.091H2817.13C2811.64 286.684 2745.37 309.328 2664.78 309.328C2580.86 309.162 2511.6 284.852 2511.93 200.102V183.784C2511.6 99.2002 2580.86 74.8906 2664.78 74.5576C2745.37 74.7241 2811.64 97.3687 2817.13 172.795H2727.72C2719.56 150.816 2694.75 145.655 2664.78 145.655C2629.15 146.154 2598.85 152.481 2599.35 189.279V194.773C2598.85 231.238 2629.15 237.898 2664.78 238.397C2694.75 238.397 2719.73 233.069 2727.72 211.091Z' fill='%23FDFFED'/><path d='M2846.68 304.167V80.3853H3108.59V137.663H2933.93V166.301H3108.59V218.084H2933.93V246.723H3108.59V304.167H2846.68Z' fill='%23FDFFED'/><path d='M3227.23 153.813C3227.23 163.637 3254.37 164.969 3289.5 166.634C3351.94 169.798 3439.68 174.127 3439.52 230.239C3439.52 294.176 3366.26 309.328 3287.67 309.328C3209.24 309.162 3144.14 299.671 3135.81 230.239H3227.23C3237.22 247.555 3260.36 252.051 3287.67 252.051C3314.81 252.051 334811 247.555 3348.11 230.239C3348.11 220.415 3320.97 218.917 3285.83 217.251C3223.4 214.088 3135.65 209.759 3135.81 153.813C3135.81 89.876 3209.08 74.5576 3287.67 74.5576C3366.09 75.0571 3431.19 83.8818 3439.52 153.813H3348.11C3338.12 136.164 3314.97 132.001 3287.67 132.001C3260.53 132.001 3227.23 135.998 3227.23 153.813Z' fill='%23FDFFED'/></svg>`;

interface Ball {
  x:number;y:number;vx:number;vy:number;
  r:number;col:number[];layer:'back'|'front';
  pp:number;ps:number;pulse:number;
}
interface Ripple {
  x:number;y:number;r:number;maxR:number;
  alpha:number;col:number[];speed:number;lw:number;delay?:number;
}

export const GravityField = memo(function GravityField({ fill = false, active = true }: { fill?: boolean; active?: boolean } = {}) {
  const cvRef = useRef<HTMLCanvasElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Só monta a simulação (balls, listeners, requestAnimationFrame) quando o
    // slide está ativo/visível. Inativo → zero trabalho, zero rAF.
    if (!active) return;
    const cv = cvRef.current;
    const root = rootRef.current;
    if (!cv || !root) return;

    const cv2 = cv as HTMLCanvasElement;
    const ctx = cv2.getContext('2d')!;
    let W=0, H=0, rafId=0;
    const dpr = window.devicePixelRatio || 1;
    const ms = { x:-999, y:-999, px:-999, py:-999, down:false };
    const balls: Ball[] = [];
    const ripples: Ripple[] = [];

    // Logo
    const logoImg = new Image();
    logoImg.src = 'data:image/svg+xml;charset=utf-8,' + LOGO_SVG;

    // S mark paths (viewBox 0 0 523 523)
    const SP1 = new Path2D("M257.4 141.2C238.2 151.1 219 162.9 200.3 176.3C170.7 197.6 144.4 221.4 123.2 245.9C114.3 235.9 109.7 223.5 111.5 208.1C114.9 177.4 133.7 156.8 167.3 146.9C190.3 140.1 219.9 138.2 257.4 141.2Z");
    const SP2 = new Path2D("M410.6 317.3C404.7 369.7 356.7 391.6 263.9 384.1C283.8 373.9 303.8 361.7 323.3 347.7C352.3 326.9 378.1 303.6 399 279.6C407.8 289.7 412.3 302 410.6 317.3Z");
    const SP3 = new Path2D("M210.4 219.2C210.4 219.2 210.9 222 223.7 225.4C234.3 228.4 249.8 230.8 266.3 233.4L266.7 233.5C311.4 240.8 367.6 249.9 394.8 275.3C374.1 299.1 348.6 322.1 319.7 342.8C297.3 358.9 274.6 372.3 252.4 383C250.8 382.9 249.3 382.7 247.7 382.5C178.1 374.6 103.8 359.9 103.1 283.8L103.1 282.2C103.8 281.1 104.6 280 105.4 278.8L200.6 289.4L201.7 291.8C207.8 305.7 224.7 313.7 255 317.1C288.2 320.8 310.5 316.6 311.6 306.4C311.6 306.3 311.1 303.5 298.3 300C288.2 297.2 274.3 294.8 255.7 291.9L255.3 291.8C210.8 284.6 154.6 275.5 127.4 250.3C148 226.5 173.8 202.8 203.8 181.2C225.4 165.8 247.3 152.7 268.7 142.2C270.6 142.4 272.4 142.6 274.3 142.8C347.2 151.4 418.3 166 418.9 241.7L418.9 244C418.3 244.9 417.7 245.8 417 246.7L321.3 236.1L320.3 233.6C314.3 219.6 297.8 211.8 267 208.4C232.7 204.6 211.6 208.6 210.4 219.2Z");
    const SP4 = new Path2D("M263.9 384.1C234.1 399.3 204.6 410 177.2 415.2C158.9 418.7 142.5 419.6 128.3 418.1C106.1 415.6 89.3 407.1 79.2 393C62.5 369.7 66.2 334.2 89.6 293C98.5 277.3 109.8 261.5 123.2 245.9C124.5 247.4 125.9 248.9 127.4 250.3C119.2 259.8 111.8 269.4 105.4 278.8L103.1 278.6L103.1 282.2C75 324.8 66.3 364.7 84.1 389.5C93.4 402.5 109.1 410 129.1 412.2C161.8 415.8 205.8 405.5 252.4 383C256.3 383.4 260.1 383.8 263.9 384.1Z");
    const SP5 = new Path2D("M434 231C424.8 247.2 413 263.6 399 279.6C397.7 278.2 396.3 276.7 394.8 275.3C403 265.9 410.5 256.3 417 246.7L418.9 247V244C422.5 238.6 425.8 233.3 428.8 228C451 189 454.7 155.8 439.5 134.6C414.6 99.8 344.7 104.9 268.7 142.2C264.8 141.8 261.1 141.5 257.4 141.2C263.1 138.2 268.7 135.4 274.4 132.8C299.1 121.4 323.5 113.2 346.4 108.8C392.9 99.9 427.7 107.8 444.4 131C461.1 154.3 457.4 189.8 434 231Z");

    function resize() {
      W = cv2.offsetWidth; H = cv2.offsetHeight;
      cv2.width = W * dpr; cv2.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function initBalls() {
      balls.length = 0;
      // Menos bolinhas em telas estreitas (mobile) → transição/animação mais leve
      // sem alterar o visual aprovado no desktop.
      const COUNT = W < 560 ? 42 : 82;
      for (let i = 0; i < COUNT; i++) {
        const layer: 'back'|'front' = Math.random() < .42 ? 'back' : 'front';
        balls.push({
          x: BR + Math.random() * (W - BR * 2),
          y: BR + Math.random() * (H * .8),
          vx: (Math.random() - .5) * .7,
          vy: (Math.random() - .5) * .7,
          r: BR + (Math.random() < .08 ? 3 : 0),
          col: POOL[i % POOL.length],
          layer, pp: Math.random() * 6.28,
          ps: .008 + Math.random() * .012, pulse: 0,
        });
      }
    }

    function spawnRipple(x: number, y: number) {
      ripples.push({ x,y, r:0, maxR:100, alpha:.7, col:O, speed:3.5, lw:1.6 });
      ripples.push({ x,y, r:0, maxR:68, alpha:.44, col:P, speed:2.2, lw:1, delay:5 });
      for (const b of balls) {
        const d = Math.hypot(b.x - x, b.y - y);
        if (d < 90) b.pulse = Math.max(b.pulse, 1 - (d / 90) * .35);
      }
    }

    function collide(a: Ball, b: Ball) {
      const dx=b.x-a.x, dy=b.y-a.y, d=Math.sqrt(dx*dx+dy*dy), mn=a.r+b.r;
      if (d >= mn || d < .001) return;
      const nx=dx/d, ny=dy/d, ov=(mn-d)*.5;
      a.x-=nx*ov; a.y-=ny*ov; b.x+=nx*ov; b.y+=ny*ov;
      const rv=(b.vx-a.vx)*nx+(b.vy-a.vy)*ny;
      if (rv > 0) return;
      const j = -(1+REST)*rv*.5;
      const pp = Math.max(a.pulse, b.pulse) * .68;
      if (pp > .04) { a.pulse=Math.max(a.pulse,pp); b.pulse=Math.max(b.pulse,pp); }
      a.vx-=j*nx; a.vy-=j*ny; b.vx+=j*nx; b.vy+=j*ny;
    }

    function step() {
      const mvx=ms.x-ms.px, mvy=ms.y-ms.py;
      const mspd = Math.min(Math.sqrt(mvx*mvx+mvy*mvy), 18);
      ms.px=ms.x; ms.py=ms.y;
      const pR=ms.down?85:48, pF=ms.down?2.8+mspd*.11:.38+mspd*.055;
      for (const b of balls) {
        b.pp += b.ps; b.vy += GRAV;
        if (ms.x > 0) {
          const dx=b.x-ms.x, dy=b.y-ms.y, d=Math.sqrt(dx*dx+dy*dy);
          if (d < pR && d > .1) { const f=(1-d/pR)*pF; b.vx+=(dx/d)*f; b.vy+=(dy/d)*f; }
        }
        b.vx*=DAMP; b.vy*=DAMP; b.x+=b.vx; b.y+=b.vy;
        if (b.pulse > .001) b.pulse *= .90; else b.pulse = 0;
        if (b.x-b.r<0) { b.x=b.r; b.vx=Math.abs(b.vx)*REST; }
        if (b.x+b.r>W) { b.x=W-b.r; b.vx=-Math.abs(b.vx)*REST; }
        if (b.y-b.r<0) { b.y=b.r; b.vy=Math.abs(b.vy)*REST; }
        if (b.y+b.r>H) { b.y=H-b.r; b.vy=-Math.abs(b.vy)*REST; }
      }
      for (let i=0;i<balls.length;i++)
        for (let j=i+1;j<balls.length;j++)
          collide(balls[i], balls[j]);
      for (let i=ripples.length-1; i>=0; i--) {
        const rp=ripples[i];
        if (rp.delay && rp.delay > 0) { rp.delay--; continue; }
        rp.r+=rp.speed; rp.alpha-=rp.alpha/(rp.maxR/rp.speed)*1.9;
        if (rp.alpha < .007 || rp.r > rp.maxR) ripples.splice(i,1);
      }
    }

    function drawLogoBase() {
      if (!logoImg.complete || !logoImg.naturalWidth) return;
      const lw=W*.92, lh=lw*(392/3443), lx=(W-lw)/2, ly=(H-lh)/2;
      ctx.save(); ctx.globalAlpha=.06;
      ctx.drawImage(logoImg,lx,ly,lw,lh);
      ctx.restore();
    }

    function drawLogoGlow() {
      if (!logoImg.complete || !logoImg.naturalWidth) return;
      const lw=W*.92, lh=lw*(392/3443), lx=(W-lw)/2, ly=(H-lh)/2;
      ctx.save();
      ctx.beginPath(); ctx.rect(0,0,W,H);
      for (const b of balls) {
        if (b.layer !== 'front') continue;
        const br = b.r*(1+Math.sin(b.pp)*.022)+5;
        ctx.moveTo(b.x+br,b.y); ctx.arc(b.x,b.y,br,0,Math.PI*2);
      }
      ctx.clip('evenodd');
      ctx.globalAlpha = .55 + Math.sin(Date.now()*.0018)*.09;
      ctx.drawImage(logoImg,lx,ly,lw,lh);
      ctx.restore();
    }

    function drawS(bx:number, by:number, r:number, cr:number, cg:number, cb:number) {
      const s=r/220; ctx.save();
      ctx.translate(bx-261.5*s, by-261.5*s); ctx.scale(s,s);
      ctx.fillStyle=`rgba(${cr},${cg},${cb},.52)`;
      ctx.fill(SP1); ctx.fill(SP2); ctx.fill(SP3);
      ctx.fillStyle=`rgba(${cr},${cg},${cb},.3)`;
      ctx.fill(SP4); ctx.fill(SP5);
      ctx.restore();
    }

    function drawBall(b: Ball, isBack: boolean) {
      const [cr,cg,cb]=b.col;
      const scale=isBack?.84:1;
      const r=b.r*scale*(1+Math.sin(b.pp)*.022);
      const pulse=b.pulse, dim=isBack?.55:1;
      ctx.beginPath(); ctx.arc(b.x,b.y,r+4,0,Math.PI*2);
      ctx.strokeStyle=`rgba(${cr},${cg},${cb},${(.08+pulse*.3)*dim})`; ctx.lineWidth=9; ctx.stroke();
      ctx.beginPath(); ctx.arc(b.x,b.y,r+1.2,0,Math.PI*2);
      ctx.strokeStyle=`rgba(${cr},${cg},${cb},${(.18+pulse*.45)*dim})`; ctx.lineWidth=2.5; ctx.stroke();
      ctx.beginPath(); ctx.arc(b.x,b.y,r,0,Math.PI*2);
      ctx.fillStyle=isBack?'rgba(4,6,12,.96)':'rgba(6,8,16,.93)'; ctx.fill();
      ctx.beginPath(); ctx.arc(b.x,b.y,r*.78,0,Math.PI*2);
      ctx.fillStyle=`rgba(${cr},${cg},${cb},${isBack?.04:.07})`; ctx.fill();
      const bcr=Math.round(cr+(255-cr)*pulse*.88);
      const bcg=Math.round(cg+(255-cg)*pulse*.88);
      const bcb=Math.round(cb+(255-cb)*pulse*.88);
      ctx.beginPath(); ctx.arc(b.x,b.y,r,0,Math.PI*2);
      ctx.strokeStyle=`rgba(${bcr},${bcg},${bcb},${(.7+pulse*.1)*dim})`;
      ctx.lineWidth=1.1+pulse*1.1; ctx.stroke();
      drawS(b.x,b.y,r,cr,cg,cb);
    }

    function drawRipples() {
      for (const rp of ripples) {
        if (rp.delay && rp.delay > 0) continue;
        const [cr,cg,cb]=rp.col;
        ctx.beginPath(); ctx.arc(rp.x,rp.y,rp.r+4,0,Math.PI*2);
        ctx.strokeStyle=`rgba(${cr},${cg},${cb},${rp.alpha*.28})`; ctx.lineWidth=rp.lw*2.5; ctx.stroke();
        ctx.beginPath(); ctx.arc(rp.x,rp.y,rp.r,0,Math.PI*2);
        ctx.strokeStyle=`rgba(${cr},${cg},${cb},${rp.alpha})`; ctx.lineWidth=rp.lw; ctx.stroke();
      }
    }

    function drawCursor() {
      const {x,y,down}=ms; if (x<0||x>W) return;
      ctx.beginPath(); ctx.arc(x,y,down?4:9,0,Math.PI*2);
      ctx.strokeStyle=`rgba(253,255,237,${down?.88:.28})`; ctx.lineWidth=down?1:.6; ctx.stroke();
      ctx.beginPath(); ctx.arc(x,y,down?2.5:1.5,0,Math.PI*2);
      ctx.fillStyle=down?'rgba(239,112,27,.95)':'rgba(253,255,237,.4)'; ctx.fill();
    }

    function draw() {
      ctx.fillStyle='#060810'; ctx.fillRect(0,0,W,H);
      step();
      for (const b of balls) if (b.layer==='back') drawBall(b,true);
      drawLogoBase();
      drawLogoGlow();
      for (const b of balls) if (b.layer==='front') drawBall(b,false);
      drawRipples();
      drawCursor();
      rafId = requestAnimationFrame(draw);
    }

    function getXY(e: MouseEvent|TouchEvent): {x:number;y:number} {
      const rect = cv2.getBoundingClientRect();
      const src = 'touches' in e ? e.touches[0] : e;
      return { x: src.clientX-rect.left, y: src.clientY-rect.top };
    }

    const onMove  = (e:MouseEvent|TouchEvent) => { const p=getXY(e); ms.x=p.x; ms.y=p.y; };
    const onDown  = (e:MouseEvent|TouchEvent) => { const p=getXY(e); ms.x=p.x; ms.y=p.y; ms.down=true; spawnRipple(p.x,p.y); };
    const onUp    = () => { ms.down=false; };
    const onLeave = () => { ms.down=false; ms.x=-999; ms.y=-999; };

    root.addEventListener('mousemove', onMove as EventListener);
    root.addEventListener('mousedown', onDown as EventListener);
    root.addEventListener('mouseup', onUp);
    root.addEventListener('mouseleave', onLeave);
    cv2.addEventListener('touchstart', onDown as EventListener, { passive:false });
    cv2.addEventListener('touchmove',  onMove as EventListener, { passive:false });
    cv2.addEventListener('touchend', onUp);

    const ro = new ResizeObserver(() => { resize(); initBalls(); });
    ro.observe(cv2);
    resize();
    initBalls();
    rafId = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      root.removeEventListener('mousemove', onMove as EventListener);
      root.removeEventListener('mousedown', onDown as EventListener);
      root.removeEventListener('mouseup', onUp);
      root.removeEventListener('mouseleave', onLeave);
      cv2.removeEventListener('touchstart', onDown as EventListener);
      cv2.removeEventListener('touchmove',  onMove as EventListener);
      cv2.removeEventListener('touchend', onUp);
    };
  }, [active]);

  return (
    <div
      ref={rootRef}
      style={{ background:'#060810', cursor:'none', userSelect:'none',
               position:'relative', overflow:'hidden', flexShrink:0,
               ...(fill ? { width:'100%', height:'100%' } : {}) }}
    >
      <canvas
        ref={cvRef}
        style={{ display:'block', width:'100%', height: fill ? '100%' : 130, touchAction:'none' }}
      />
    </div>
  );
});
