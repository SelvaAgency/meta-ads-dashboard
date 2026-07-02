/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Selva Spaces — Home (raiz da aplicação)
 * ─────────────────────────────────────────────────────────────────────────────
 *  Reutiliza primitivos de UI existentes (Card, Carousel), tokens, ícones
 *  lucide e useAuth. News e SelvaTV vêm do store local (editável em
 *  Configurações); Agenda e Meus cards vêm de adapters mockados isolados
 *  (hubMocks) — prontos para trocar por Calendar/Trello reais depois.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useMemo } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarCheck, ClipboardCheck, Square } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { HubShell } from "./HubShell";
import { SelvaTV } from "./SelvaTV";
import { NewsTicker } from "./NewsTicker";
import { getAgendaEvents, getTrelloCards, greetingForHour, firstName } from "./hubMocks";
import type { NewsItem, SelvaTVImage } from "./hubMocks";
import { useNewsStore, useSelvaTVStore, useProfilePrefs } from "./hubStore";

export default function Hub() {
  const { user } = useAuth();
  const [storedNews] = useNewsStore();
  const [storedTV] = useSelvaTVStore();
  const [prefs] = useProfilePrefs();

  // Adapters mockados (Calendar/Trello) — resolvidos uma vez.
  const agenda = useMemo(() => getAgendaEvents(), []);
  const cards = useMemo(() => getTrelloCards(), []);

  // News/SelvaTV ativos, vindos do store (admin edita em Configurações).
  const news: NewsItem[] = storedNews.filter((n) => n.enabled && n.text.trim()).map((n) => ({ id: n.id, text: n.text }));
  const tvImages: SelvaTVImage[] = storedTV
    .filter((im) => im.enabled && im.src.trim())
    .map((im) => ({ id: im.id, src: im.src, alt: im.alt, eyebrow: im.eyebrow, title: im.title, subtitle: im.subtitle }));

  const now = new Date();
  const name = (user as any)?.name as string | undefined;
  const greeting = `${greetingForHour(now.getHours())}, ${firstName(name)}`;
  const today = format(now, "EEEE, d 'de' MMMM", { locale: ptBR });

  // Aviso de aniversário: se hoje = birthDate (MM-DD) do perfil, mensagem fixa.
  const todayMMDD = format(now, "MM-dd");
  const isBirthday = !!prefs.birthDate && prefs.birthDate === todayMMDD;
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

            {/* Cards: Agenda + Meus cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Agenda de hoje (mock Google Calendar) */}
              <Card className="gap-4 py-5">
                <div className="px-5 flex items-center gap-2.5">
                  <span className="w-7 h-7 rounded-lg bg-primary/20 text-accent flex items-center justify-center flex-shrink-0">
                    <CalendarCheck className="w-4 h-4" />
                  </span>
                  <h2 className="text-sm font-semibold">Agenda de hoje</h2>
                </div>
                <div className="px-5 flex flex-col gap-2.5">
                  {agenda.map((ev) => (
                    <div
                      key={`${ev.time}-${ev.title}`}
                      className={`flex items-center gap-3 text-sm ${ev.free ? "text-muted-foreground" : ""}`}
                    >
                      <span className={`min-w-[48px] font-semibold ${ev.free ? "text-muted-foreground" : "text-foreground"}`}>
                        {ev.time}
                      </span>
                      <span>{ev.title}</span>
                    </div>
                  ))}
                </div>
              </Card>

              {/* Meus cards (mock Trello) */}
              <Card className="gap-4 py-5">
                <div className="px-5 flex items-center gap-2.5">
                  <span className="w-7 h-7 rounded-lg bg-accent/15 text-accent flex items-center justify-center flex-shrink-0">
                    <ClipboardCheck className="w-4 h-4" />
                  </span>
                  <h2 className="text-sm font-semibold">Meus cards</h2>
                </div>
                <div className="px-5 flex flex-col gap-2.5">
                  {cards.map((c) => (
                    <div key={c.id} className="flex items-center gap-2.5 text-sm text-muted-foreground">
                      <Square className="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground/60" />
                      <span>{c.title}</span>
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            {/* SelvaTV — some sozinho se não houver imagens */}
            <SelvaTV images={tvImages} />
          </div>
        </main>
    </HubShell>
  );
}
