/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  SELVA TV — banner/carrossel da Home
 * ─────────────────────────────────────────────────────────────────────────────
 *  Container com aspect ratio FIXO 8:3 (igual à dimensão recomendada 1600×600),
 *  então uma imagem nessa proporção aparece INTEIRA (object-cover sem corte).
 *
 *  A SELVA TV nunca fica vazia: existe sempre um slide fixo institucional
 *  (estilo DVD) que aparece SEMPRE como o ÚLTIMO slide. Ele é gerado pelo app,
 *  não vem de upload e não pode ser removido pelo admin.
 *    · 0 uploads  → só o slide fixo (estático)
 *    · 1 upload   → upload + slide fixo (carrossel)
 *    · N uploads  → N uploads + slide fixo no final (carrossel)
 * ─────────────────────────────────────────────────────────────────────────────
 */
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
} from "@/components/ui/carousel";
import type { SelvaTVImage } from "./hubMocks";
import { DvdSlide } from "./DvdSlide";

// Setas no estilo SELVA Spaces (escuro translúcido, borda creme/rosa, glow).
const ARROW_CLS =
  "size-9 rounded-full border border-[rgba(245,173,204,0.4)] bg-black/45 backdrop-blur-sm " +
  "text-[#FDFFED] shadow-[0_0_14px_rgba(245,173,204,0.18)] transition-colors " +
  "hover:bg-black/65 hover:text-accent hover:border-accent disabled:opacity-30";

// Moldura com proporção fixa 8:3 (recomendada). object-cover + proporção igual = sem corte.
function Frame({ children }: { children: React.ReactNode }) {
  return <div className="relative w-full aspect-[8/3] overflow-hidden rounded-xl bg-secondary">{children}</div>;
}

function ImageSlide({ image }: { image: SelvaTVImage }) {
  return (
    <Frame>
      <img src={image.src} alt={image.alt} className="absolute inset-0 h-full w-full object-cover" />
      {image.title && (
        <div className="absolute inset-0 flex flex-col justify-end gap-1 bg-gradient-to-t from-black/60 to-transparent p-5">
          <span className="text-base font-semibold text-white">{image.title}</span>
          {image.subtitle && <span className="text-xs text-white/80">{image.subtitle}</span>}
        </div>
      )}
    </Frame>
  );
}

function FixedSlide() {
  return <Frame><DvdSlide /></Frame>;
}

export function SelvaTV({ images }: { images: SelvaTVImage[] }) {
  const uploads = images ?? [];

  // Slide fixo sempre por último → total = uploads + 1.
  // 0 uploads → só o slide fixo, estático (sem setas).
  if (uploads.length === 0) {
    return (
      <section aria-label="SELVA TV">
        <FixedSlide />
      </section>
    );
  }

  // 1+ uploads → carrossel com uploads e o slide fixo no fim.
  return (
    <section aria-label="SELVA TV">
      <Carousel opts={{ loop: true }} className="w-full">
        <CarouselContent>
          {uploads.map((image) => (
            <CarouselItem key={image.id}>
              <ImageSlide image={image} />
            </CarouselItem>
          ))}
          <CarouselItem key="__fixed">
            <FixedSlide />
          </CarouselItem>
        </CarouselContent>
        <CarouselPrevious className={`left-2 sm:left-3 ${ARROW_CLS}`} />
        <CarouselNext className={`right-2 sm:right-3 ${ARROW_CLS}`} />
      </Carousel>
    </section>
  );
}
