/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  SELVA TV — banner/carrossel da Home
 * ─────────────────────────────────────────────────────────────────────────────
 *  Container com aspect ratio FIXO 8:3 (igual à dimensão recomendada 1600×600),
 *  então uma imagem nessa proporção aparece INTEIRA (object-cover sem corte).
 *
 *  A SELVA TV nunca fica vazia: além dos uploads e do "Você prefere?" (se ativo),
 *  há dois slides institucionais SEMPRE no fim — a piscina "GravityField" e o
 *  slide fixo SELVA Spaces (DVD), este por ÚLTIMO.
 *
 *  TRANSIÇÃO (mascara o custo dos slides pesados): as setas não trocam o slide
 *  na hora. Elas disparam uma CORTINA de barras (SlideCurtain) que:
 *   1. cobre o slide atual (covering);
 *   2. com a tela coberta, o embla PULA para o destino (instantâneo) e o slide de
 *      destino recebe `active` → inicializa escondido (covered);
 *   3. as barras saem revelando o novo slide já rodando (revealing).
 *  Assim a sensação é "fechou, trocou, abriu" — não "cliquei, travou, carregou".
 *  Cliques repetidos durante a transição são ignorados. Embla não anima à mostra.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi,
} from "@/components/ui/carousel";
import type { SelvaTVImage } from "./hubMocks";
import { DvdSlide } from "./DvdSlide";
import { VocePrefereSlide } from "./VocePrefereSlide";
import { GravityField } from "./GravityField";
import { SlideCurtain, type CurtainPhase } from "./SlideCurtain";

export interface VocePrefereConfig { active: boolean; leftText: string; rightText: string }
export interface FixedSlidesConfig { gravity: boolean; dvd: boolean }

// Setas no estilo SELVA Spaces (escuro translúcido, borda creme/rosa, glow).
const ARROW_CLS =
  "absolute top-1/2 -translate-y-1/2 z-30 flex size-9 items-center justify-center rounded-full " +
  "border border-[rgba(245,173,204,0.4)] bg-black/45 backdrop-blur-sm text-[#FDFFED] " +
  "shadow-[0_0_14px_rgba(245,173,204,0.18)] transition-colors hover:bg-black/65 hover:text-accent hover:border-accent";

// Tempos da cortina (ms). cover deve ser ≥ tempo de cobertura total das barras
// (última barra: 4·28ms delay + 220ms ≈ 332ms) para trocar já 100% coberto.
const TIMING = { cover: 350, hold: 170, reveal: 430 };
const TIMING_REDUCE = { cover: 150, hold: 110, reveal: 200 };

// Moldura com proporção fixa 8:3 (recomendada). object-cover + proporção igual = sem corte.
function Frame({ children }: { children: React.ReactNode }) {
  return <div className="relative w-full aspect-[8/3] overflow-hidden rounded-xl bg-secondary">{children}</div>;
}

function ImageSlide({ image, eager }: { image: SelvaTVImage; eager?: boolean }) {
  // Skeleton escuro discreto até a imagem decodificar (sem flash branco). Ativo +
  // vizinhos carregam eager (pré-aquecidos p/ a transição); demais lazy.
  const [loaded, setLoaded] = useState(false);
  return (
    <Frame>
      {!loaded && <div className="absolute inset-0 bg-[#0b0b0f]" />}
      <img
        src={image.src}
        alt={image.alt}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        onLoad={() => setLoaded(true)}
        className="absolute inset-0 h-full w-full object-cover transition-opacity duration-500"
        style={{ opacity: loaded ? 1 : 0 }}
      />
      {image.title && (
        <div className="absolute inset-0 flex flex-col justify-end gap-1 bg-gradient-to-t from-black/60 to-transparent p-5">
          <span className="text-base font-semibold text-white">{image.title}</span>
          {image.subtitle && <span className="text-xs text-white/80">{image.subtitle}</span>}
        </div>
      )}
    </Frame>
  );
}

// A seção está "viva" quando visível na tela E a aba está em foco. Fora disso,
// todas as animações da SELVA TV podem pausar.
function useSectionLive(ref: React.RefObject<HTMLElement | null>) {
  const [live, setLive] = useState(true);
  useEffect(() => {
    const el = ref.current;
    let onScreen = true;
    let tabVisible = typeof document !== "undefined" ? !document.hidden : true;
    const update = () => setLive(onScreen && tabVisible);

    const io = el
      ? new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; update(); }, { threshold: 0.01 })
      : null;
    if (el && io) io.observe(el);

    const onVis = () => { tabVisible = !document.hidden; update(); };
    document.addEventListener("visibilitychange", onVis);
    update();
    return () => { io?.disconnect(); document.removeEventListener("visibilitychange", onVis); };
  }, [ref]);
  return live;
}

function useReducedMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const m = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!m) return;
    setReduce(m.matches);
    const h = () => setReduce(m.matches);
    m.addEventListener?.("change", h);
    return () => m.removeEventListener?.("change", h);
  }, []);
  return reduce;
}

type Slide =
  | { key: string; kind: "image"; image: SelvaTVImage }
  | { key: string; kind: "vp" }
  | { key: string; kind: "gravity" }
  | { key: string; kind: "fixed" };

export function SelvaTV({ images, vocePrefere, fixedSlides }: { images: SelvaTVImage[]; vocePrefere?: VocePrefereConfig; fixedSlides?: FixedSlidesConfig }) {
  const [api, setApi] = useState<CarouselApi>();
  const [selected, setSelected] = useState(0);
  const [phase, setPhase] = useState<CurtainPhase>("idle");
  const sectionRef = useRef<HTMLElement>(null);
  const live = useSectionLive(sectionRef);
  const reduce = useReducedMotion();

  // Guard síncrono contra cliques repetidos + limpeza de timers da cortina.
  const phaseRef = useRef<CurtainPhase>("idle");
  phaseRef.current = phase;
  const timers = useRef<number[]>([]);
  const clearTimers = () => { timers.current.forEach((t) => clearTimeout(t)); timers.current = []; };
  useEffect(() => () => clearTimers(), []);

  // Mantém `selected` em sincronia com o embla (também após o pulo instantâneo).
  useEffect(() => {
    if (!api) return;
    const onSelect = () => setSelected(api.selectedScrollSnap());
    onSelect();
    api.on("select", onSelect);
    api.on("reInit", onSelect);
    return () => { api.off("select", onSelect); api.off("reInit", onSelect); };
  }, [api]);

  // Ordem aprovada: uploads → "Você prefere?" (se ativo) → GravityField → DVD.
  // Os dois slides fixos institucionais só entram se ligados nas Configurações
  // (default OFF) — ficam no código, apenas desativados. Nunca fica vazia.
  const slides = useMemo<Slide[]>(() => {
    const list: Slide[] = [
      ...(images ?? []).map((im) => ({ key: `u${im.id}`, kind: "image" as const, image: im })),
      ...(vocePrefere?.active ? [{ key: "voce-prefere", kind: "vp" as const }] : []),
      ...(fixedSlides?.gravity ? [{ key: "__gravity", kind: "gravity" as const }] : []),
      ...(fixedSlides?.dvd ? [{ key: "__fixed", kind: "fixed" as const }] : []),
    ];
    if (list.length === 0) list.push({ key: "__fixed", kind: "fixed" as const });
    return list;
  }, [images, vocePrefere?.active, fixedSlides?.gravity, fixedSlides?.dvd]);

  const n = slides.length;

  // Troca de slide via cortina. Ignora se já há transição em andamento.
  const go = (dir: 1 | -1) => {
    if (!api || phaseRef.current !== "idle") return;
    clearTimers();
    const count = api.scrollSnapList().length || n;
    const T = reduce ? TIMING_REDUCE : TIMING;

    setPhase("covering"); // 1) barras cobrem o slide atual
    timers.current.push(window.setTimeout(() => {
      // 2) tela coberta: pula para o destino (instantâneo) e ativa-o escondido
      const cur = api.selectedScrollSnap();
      api.scrollTo((cur + dir + count) % count, true);
      setPhase("covered");
      timers.current.push(window.setTimeout(() => {
        setPhase("revealing"); // 3) barras saem revelando o novo slide já pronto
        timers.current.push(window.setTimeout(() => setPhase("idle"), T.reveal));
      }, T.hold));
    }, T.cover));
  };

  // Durante "covering" nada anima (libera a main-thread p/ cobrir + iniciar o
  // destino). Em "covered"/"revealing"/"idle" o slide selecionado está ativo →
  // slides pesados inicializam ESCONDIDOS pela cortina.
  const activeIndex = phase === "covering" ? -1 : selected;
  const isNeighbor = (i: number) => i === selected || i === (selected + 1) % n || i === (selected - 1 + n) % n;

  const renderSlide = (s: Slide, i: number) => {
    const active = live && activeIndex === i;
    switch (s.kind) {
      case "image":
        return <ImageSlide image={s.image} eager={isNeighbor(i)} />;
      case "vp":
        return <Frame><VocePrefereSlide leftText={vocePrefere!.leftText} rightText={vocePrefere!.rightText} active={active} /></Frame>;
      case "gravity":
        return <Frame><GravityField fill active={active} /></Frame>;
      case "fixed":
        return <Frame><DvdSlide active={active} /></Frame>;
    }
  };

  return (
    <section ref={sectionRef} aria-label="SELVA TV" className="relative">
      <Carousel opts={{ loop: true }} className="w-full" setApi={setApi}>
        <CarouselContent>
          {slides.map((s, i) => (
            <CarouselItem key={s.key}>{renderSlide(s, i)}</CarouselItem>
          ))}
        </CarouselContent>
      </Carousel>

      {/* Cortina de transição (barras SELVA) por cima do carrossel. */}
      <SlideCurtain phase={phase} reduce={reduce} />

      {/* Setas próprias: disparam a cortina em vez de deslizar o embla à mostra.
          Escondidas quando há um único slide (nada para navegar). */}
      {n > 1 && (
        <>
          <button type="button" aria-label="Slide anterior" onClick={() => go(-1)} className={`left-2 sm:left-3 ${ARROW_CLS}`}>
            <ArrowLeft className="size-4" />
          </button>
          <button type="button" aria-label="Próximo slide" onClick={() => go(1)} className={`right-2 sm:right-3 ${ARROW_CLS}`}>
            <ArrowRight className="size-4" />
          </button>
        </>
      )}
    </section>
  );
}
