/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Selva Spaces — SelvaTV (banner/carrossel da Home)
 * ─────────────────────────────────────────────────────────────────────────────
 *  Banner de destaques. Lógica isolada e fácil de trocar por dados reais:
 *    · 0 imagens  → não renderiza nada (sem espaço morto)
 *    · 1 imagem   → banner estático
 *    · 2+ imagens → carrossel (reutiliza o componente Carousel já existente)
 *
 *  Futuro: apenas roles autorizadas poderão importar imagens (ver
 *  `canImportSelvaTV` em hubMocks). Aqui NÃO há upload — só a estrutura pronta
 *  para receber `images` de admin / banco / storage.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { Image as ImageIcon } from "lucide-react";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
} from "@/components/ui/carousel";
import type { SelvaTVImage } from "./hubMocks";

function Slide({ image }: { image: SelvaTVImage }) {
  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl bg-secondary">
      <img src={image.src} alt={image.alt} className="h-full w-full object-cover" />
      {(image.eyebrow || image.title || image.subtitle) && (
        <div className="absolute inset-0 flex flex-col justify-end gap-1 bg-gradient-to-t from-black/60 to-transparent p-5">
          {image.eyebrow && (
            <span className="text-[11px] font-bold uppercase tracking-wide text-primary">{image.eyebrow}</span>
          )}
          {image.title && <span className="text-base font-semibold text-white">{image.title}</span>}
          {image.subtitle && <span className="text-xs text-white/80">{image.subtitle}</span>}
        </div>
      )}
    </div>
  );
}

export function SelvaTV({ images }: { images: SelvaTVImage[] }) {
  // Array vazio → seção some por completo.
  if (!images || images.length === 0) return null;

  // Uma imagem → banner estático.
  if (images.length === 1) {
    return (
      <section aria-label="SelvaTV" className="h-48">
        <Slide image={images[0]} />
      </section>
    );
  }

  // Duas ou mais → carrossel.
  return (
    <section aria-label="SelvaTV">
      <Carousel opts={{ loop: true }} className="w-full">
        <CarouselContent>
          {images.map((image) => (
            <CarouselItem key={image.id}>
              <div className="h-48">
                <Slide image={image} />
              </div>
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious className="left-3" />
        <CarouselNext className="right-3" />
      </Carousel>
    </section>
  );
}

// Ícone de placeholder exportado caso o admin queira um estado "vazio" visível
// no futuro (hoje a seção simplesmente some quando não há imagens).
export const SelvaTVPlaceholderIcon = ImageIcon;
