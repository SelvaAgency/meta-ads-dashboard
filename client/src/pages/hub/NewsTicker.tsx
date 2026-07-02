/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Selva Spaces — NewsTicker (faixa de avisos/notícias · estilo ticker)
 * ─────────────────────────────────────────────────────────────────────────────
 *  Faixa rosa editorial com as notícias passando em loop horizontal contínuo
 *  (direita → esquerda). Isolada em /hub — o CSS fica escopado num <style>
 *  local (nada de global/tema é alterado).
 *
 *  · Array vazio → não renderiza nada (sem espaço morto).
 *  · 1+ notícias → loop infinito e suave (conteúdo duplicado p/ emenda perfeita).
 *  · Pausa no hover; respeita `prefers-reduced-motion: reduce` (fica estático).
 *
 *  Dados vêm de fora (hoje mock em hubMocks.getNews; amanhã admin/API — só
 *  trocar a fonte, este componente não muda).
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { Newspaper } from "lucide-react";
import type { NewsItem } from "./hubMocks";

export function NewsTicker({ items }: { items: NewsItem[] }) {
  // Sem notícias → some por completo (sem espaço morto).
  if (!items || items.length === 0) return null;

  const texts = items.map((n) => n.text);

  // Velocidade constante independente da quantidade: duração proporcional ao
  // tamanho do conteúdo (~ caracteres). Clamp para não ficar rápido/lento demais.
  const totalChars = texts.join(" • ").length;
  const durationSec = Math.min(80, Math.max(22, Math.round(totalChars * 0.4)));

  // Duas cópias idênticas → translateX(-50%) emenda sem "salto".
  const Group = ({ ariaHidden }: { ariaHidden?: boolean }) => (
    <div className="selva-ticker__group" aria-hidden={ariaHidden}>
      {texts.map((t, i) => (
        <span className="selva-ticker__item" key={i}>
          <span>{t}</span>
          <span className="selva-ticker__sep">•</span>
        </span>
      ))}
    </div>
  );

  return (
    <div className="selva-ticker" role="region" aria-label="Avisos">
      <style>{TICKER_CSS}</style>

      <div className="selva-ticker__label">
        <Newspaper className="w-3.5 h-3.5" />
        <span>Selva News</span>
      </div>

      <div className="selva-ticker__viewport">
        <div
          className="selva-ticker__track"
          style={{ animationDuration: `${durationSec}s` }}
        >
          <Group />
          <Group ariaHidden />
        </div>
        {/* Texto acessível, lido uma vez, sem animação. */}
        <span className="sr-only">{texts.join(". ")}</span>
      </div>
    </div>
  );
}

const TICKER_CSS = `
.selva-ticker{
  display:flex; align-items:stretch;
  background:var(--accent); color:#0A0A0A;
  border-bottom:1px solid var(--border);
  overflow:hidden;
}
.selva-ticker__label{
  display:flex; align-items:center; gap:7px; flex-shrink:0;
  padding:0 16px;
  background:#0A0A0A; color:var(--primary);
  font-family:'Montserrat',sans-serif; font-weight:800;
  font-size:10px; letter-spacing:1.5px; text-transform:uppercase;
  white-space:nowrap;
}
.selva-ticker__viewport{ position:relative; flex:1; overflow:hidden; display:flex; align-items:center; }
.selva-ticker__track{
  display:inline-flex; flex-wrap:nowrap; white-space:nowrap; will-change:transform;
  animation-name:selva-ticker-scroll; animation-timing-function:linear; animation-iteration-count:infinite;
}
.selva-ticker__viewport:hover .selva-ticker__track{ animation-play-state:paused; }
.selva-ticker__group{ display:inline-flex; flex-shrink:0; }
.selva-ticker__item{ display:inline-flex; align-items:center; padding:8px 0; font-size:12px; font-weight:600; }
.selva-ticker__sep{ margin:0 22px; opacity:.45; }
@keyframes selva-ticker-scroll{ from{ transform:translateX(0); } to{ transform:translateX(-50%); } }
@media (prefers-reduced-motion: reduce){
  .selva-ticker__track{ animation:none; transform:none; }
}
`;
