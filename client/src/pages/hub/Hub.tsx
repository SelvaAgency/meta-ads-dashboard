/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Selva Spaces — Home (raiz da aplicação)
 * ─────────────────────────────────────────────────────────────────────────────
 *  Reutiliza primitivos de UI existentes (Card, Carousel), tokens, ícones
 *  lucide e useAuth. News e SelvaTV vêm do store local (editável em
 *  Configurações). Agenda (Google Calendar) e Meus cards (Trello) são reais,
 *  por usuário, tratados no backend.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useAuth } from "@/_core/hooks/useAuth";
import { HubShell } from "./HubShell";
import { SelvaTV } from "./SelvaTV";
import { NewsTicker } from "./NewsTicker";
import { greetingForHour, firstName } from "./hubMocks";
import type { NewsItem, SelvaTVImage } from "./hubMocks";
import { useNewsStore, useSelvaTVStore } from "./hubStore";
import { AgendaCard } from "./AgendaCard";
import { MyCardsCard } from "./MyCardsCard";

export default function Hub() {
  const { user } = useAuth();
  const u = user as { name?: string; birthdayDay?: number | null; birthdayMonth?: number | null } | null;
  const [storedNews] = useNewsStore();
  const [storedTV] = useSelvaTVStore();

  // News/SelvaTV ativos, vindos do store (admin edita em Configurações).
  const news: NewsItem[] = storedNews.filter((n) => n.enabled && n.text.trim()).map((n) => ({ id: n.id, text: n.text }));
  const tvImages: SelvaTVImage[] = storedTV
    .filter((im) => im.enabled && im.src.trim())
    .map((im) => ({ id: im.id, src: im.src, alt: im.alt, eyebrow: im.eyebrow, title: im.title, subtitle: im.subtitle }));

  const now = new Date();
  const name = u?.name;
  const greeting = `${greetingForHour(now.getHours())}, ${firstName(name)}`;
  const today = format(now, "EEEE, d 'de' MMMM", { locale: ptBR });

  // Aviso de aniversário: se hoje = dia/mês do perfil (banco), mensagem fixa.
  const isBirthday = u?.birthdayDay === now.getDate() && u?.birthdayMonth === now.getMonth() + 1;
  const celebration = isBirthday ? `Feliz aniversário, ${firstName(name)}!` : undefined;

  return (
    <HubShell>
      {/* Faixa de avisos/notícias — some sozinha se vazia; aniversário tem prioridade */}
      <NewsTicker items={news} celebration={celebration} />

        <main className="flex-1 overflow-auto p-6 md:p-8">
          <div className="max-w-5xl mx-auto flex flex-col gap-6">
            {/* Saudação */}
            <header>
              <h1 className="text-2xl font-bold">{greeting}</h1>
              <p className="text-sm text-muted-foreground capitalize mt-0.5">{today}</p>
            </header>

            {/* Cards: Agenda (Google Calendar) + Meus cards (Trello) — reais */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <AgendaCard />
              <MyCardsCard />
            </div>

            {/* SelvaTV — some sozinho se não houver imagens */}
            <SelvaTV images={tvImages} />
          </div>
        </main>
    </HubShell>
  );
}
