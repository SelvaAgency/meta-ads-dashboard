/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Menu mobile — a MESMA navegação, em outra apresentação
 * ─────────────────────────────────────────────────────────────────────────────
 *  Não existe uma "sidebar mobile" aqui. O que existe é a sidebar de sempre,
 *  que abaixo de 768px vira gaveta: as mesmas classes de desktop continuam
 *  valendo, e as variantes `max-md:` sobrepõem só o posicionamento.
 *
 *  Essa é a decisão central. A alternativa óbvia — escrever um segundo menu com
 *  os itens copiados — criaria duas listas que divergem no primeiro item novo,
 *  e a divergência apareceria só no celular de alguém. Aqui não há como
 *  divergir: é o mesmo componente, com as mesmas regras de permissão, porque é
 *  literalmente o mesmo JSX.
 *
 *  ── Desktop não muda ───────────────────────────────────────────────────────
 *  Tudo aqui é `md:hidden` ou `max-md:`. Nenhuma classe existente foi alterada,
 *  então acima de 768px o DOM renderizado é o mesmo de antes.
 *
 *  ── Fechar ao navegar, sem tocar em item nenhum ────────────────────────────
 *  A gaveta fecha observando a ROTA, não recebendo callback em cada link.
 *  Threading de `onNavegar` por dezenas de itens seria frágil justamente onde
 *  não pode falhar: o item que alguém esquecesse de ligar deixaria a gaveta
 *  aberta por cima da página que acabou de abrir.
 *
 *  Rota igual (tocar no item onde já se está) não dispara mudança, então há
 *  também um `onClickCapture` que fecha quando o toque veio de dentro de um
 *  link — os dois juntos cobrem os dois casos sem nenhum item saber que existe
 *  uma versão mobile.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Menu, X } from "lucide-react";
import { useLocation } from "wouter";

export interface MenuMobileControles {
  aberto: boolean;
  abrir: () => void;
  fechar: () => void;
  alternar: () => void;
  /** Props para o elemento da gaveta (a própria sidebar). */
  propsDaGaveta: {
    onClickCapture: (e: React.MouseEvent) => void;
  };
}

export function useMenuMobile(): MenuMobileControles {
  const [aberto, setAberto] = useState(false);
  const [location] = useLocation();
  const fechar = useCallback(() => setAberto(false), []);

  // Navegou → fecha. Vale para qualquer link, inclusive os que ainda não existem.
  useEffect(() => { setAberto(false); }, [location]);

  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (e: KeyboardEvent) => { if (e.key === "Escape") setAberto(false); };
    document.addEventListener("keydown", aoTeclar);
    // Trava o scroll do fundo enquanto a gaveta está aberta: sem isto, arrastar
    // sobre o backdrop rola a página atrás e o menu parece descolado da tela.
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", aoTeclar);
      document.body.style.overflow = antes;
    };
  }, [aberto]);

  return {
    aberto,
    abrir: useCallback(() => setAberto(true), []),
    fechar,
    alternar: useCallback(() => setAberto((v) => !v), []),
    propsDaGaveta: {
      // Toque em item da rota ATUAL não muda `location` e não fecharia pelo
      // efeito acima. Capturar o clique que veio de um link cobre esse caso.
      onClickCapture: (e: React.MouseEvent) => {
        if ((e.target as HTMLElement | null)?.closest("a")) setAberto(false);
      },
    },
  };
}

/**
 * Classes que transformam a sidebar em gaveta abaixo de 768px.
 *
 * Concatenar isto às classes existentes é a única mudança que a sidebar sofre —
 * nada é removido, então o desktop continua exatamente como estava.
 */
export const classesDaGaveta = (aberto: boolean): string =>
  [
    "max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-50",
    "max-md:w-72 max-md:max-w-[85vw] max-md:shadow-2xl",
    "max-md:transition-transform max-md:duration-200",
    aberto ? "max-md:translate-x-0" : "max-md:-translate-x-full",
  ].join(" ");

/** Barra superior só de mobile: hambúrguer + identificação da área. */
export function BarraMobile({ titulo, aberto, alternar, acoes }: {
  titulo: ReactNode;
  aberto: boolean;
  alternar: () => void;
  /** Espaço à direita (sino, seletor…) quando a área precisar. */
  acoes?: ReactNode;
}) {
  return (
    <header
      className="md:hidden flex-shrink-0 flex items-center gap-3 h-14 px-3 border-b border-border bg-background"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
    >
      <button
        onClick={alternar}
        aria-label={aberto ? "Fechar menu" : "Abrir menu"}
        aria-expanded={aberto}
        className="w-9 h-9 rounded-lg flex items-center justify-center text-foreground hover:bg-muted/50 transition"
      >
        {aberto ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>
      <div className="flex-1 min-w-0 text-sm font-medium truncate">{titulo}</div>
      {acoes}
    </header>
  );
}

/** Fundo escurecido. Clicar fora fecha — é o gesto que todo mundo tenta. */
export function FundoDaGaveta({ aberto, fechar }: { aberto: boolean; fechar: () => void }) {
  if (!aberto) return null;
  return (
    <div
      onClick={fechar}
      aria-hidden="true"
      className="md:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-[1px]"
    />
  );
}

/** X dentro da gaveta. Só mobile — no desktop a sidebar não fecha assim. */
export function BotaoFecharGaveta({ fechar }: { fechar: () => void }) {
  return (
    <button
      onClick={fechar}
      aria-label="Fechar menu"
      className="md:hidden absolute top-3 right-3 z-10 w-8 h-8 rounded-lg flex items-center justify-center"
      style={{ color: "rgba(255,255,255,0.6)", background: "rgba(255,255,255,0.06)" }}
    >
      <X className="w-4 h-4" />
    </button>
  );
}
