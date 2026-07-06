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
 *  PERFORMANCE DA TROCA: o embla monta todos os slides de uma vez (sem remount
 *  ao trocar). O travamento vinha de INICIAR a animação pesada do slide de
 *  destino no MESMO frame do clique/transição. Solução:
 *   · durante a transição (entre `select` e `settle`) NADA anima — `transitioning`
 *     desativa todos os slides;
 *   · o slide de destino só recebe `active` DEPOIS que o embla assenta (`settle`),
 *     ou seja, a animação começa após a transição, não durante;
 *   · lista de slides memoizada; componentes pesados em React.memo;
 *   · imagens do ativo/anterior/próximo carregam eager (vizinhos pré-aquecidos).
 *  Nenhuma lógica visual/navegação do carrossel foi alterada.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
  type CarouselApi,
} from "@/components/ui/carousel";
import type { SelvaTVImage } from "./hubMocks";
import { DvdSlide } from "./DvdSlide";
import { VocePrefereSlide } from "./VocePrefereSlide";
import { GravityField } from "./GravityField";

export interface VocePrefereConfig { active: boolean; leftText: string; rightText: string }

// Setas no estilo SELVA Spaces (escuro translúcido, borda creme/rosa, glow).
const ARROW_CLS =
  "size-9 rounded-full border border-[rgba(245,173,204,0.4)] bg-black/45 backdrop-blur-sm " +
  "text-[#FDFFED] shadow-[0_0_14px_rgba(245,173,204,0.18)] transition-colors " +
  "hover:bg-black/65 hover:text-accent hover:border-accent disabled:opacity-30";

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
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0b0b0f]">
          <span className="text-xs tracking-wide text-white/40">Carregando SELVA TV…</span>
        </div>
      )}
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

type Slide =
  | { key: string; kind: "image"; image: SelvaTVImage }
  | { key: string; kind: "vp" }
  | { key: string; kind: "gravity" }
  | { key: string; kind: "fixed" };

export function SelvaTV({ images, vocePrefere }: { images: SelvaTVImage[]; vocePrefere?: VocePrefereConfig }) {
  const [api, setApi] = useState<CarouselApi>();
  const [selected, setSelected] = useState(0);
  const [transitioning, setTransitioning] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const live = useSectionLive(sectionRef);

  // `select` dispara no INÍCIO da troca → marca transição (pausa tudo).
  // `settle` dispara quando o slide ASSENTA → libera e ativa só o destino.
  useEffect(() => {
    if (!api) return;
    const onSelect = () => { setSelected(api.selectedScrollSnap()); setTransitioning(true); };
    const onSettle = () => { setSelected(api.selectedScrollSnap()); setTransitioning(false); };
    onSettle(); // estado inicial: assentado no slide atual
    api.on("select", onSelect);
    api.on("settle", onSettle);
    api.on("reInit", onSettle);
    return () => { api.off("select", onSelect); api.off("settle", onSettle); api.off("reInit", onSettle); };
  }, [api]);

  // Ordem aprovada: uploads → "Você prefere?" (se ativo) → GravityField → DVD (último).
  // Memoizada → o clique na seta não recria a lista de slides.
  const slides = useMemo<Slide[]>(() => [
    ...(images ?? []).map((im) => ({ key: `u${im.id}`, kind: "image" as const, image: im })),
    ...(vocePrefere?.active ? [{ key: "voce-prefere", kind: "vp" as const }] : []),
    { key: "__gravity", kind: "gravity" as const },
    { key: "__fixed", kind: "fixed" as const },
  ], [images, vocePrefere?.active]);

  const n = slides.length;
  const isNeighbor = (i: number) => i === selected || i === (selected + 1) % n || i === (selected - 1 + n) % n;

  const renderSlide = (s: Slide, i: number) => {
    // Anima só o slide de destino, e só DEPOIS da transição assentar.
    const active = live && !transitioning && selected === i;
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

  // Carrossel: mesma estrutura visual/navegação; só passamos `active` aos slides.
  return (
    <section ref={sectionRef} aria-label="SELVA TV">
      <Carousel opts={{ loop: true }} className="w-full" setApi={setApi}>
        <CarouselContent>
          {slides.map((s, i) => (
            <CarouselItem key={s.key}>{renderSlide(s, i)}</CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious className={`left-2 sm:left-3 ${ARROW_CLS}`} />
        <CarouselNext className={`right-2 sm:right-3 ${ARROW_CLS}`} />
      </Carousel>
    </section>
  );
}
