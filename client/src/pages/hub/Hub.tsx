/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  /hub — PÁGINA EXPERIMENTAL (portal interno · MVP · descartável)
 * ─────────────────────────────────────────────────────────────────────────────
 *  Página 100% isolada. Não importa nem altera o layout/fluxo do dashboard
 *  atual. Reutiliza apenas primitivos de UI já existentes (Card, Avatar,
 *  Carousel), tokens de estilo, ícones lucide e o hook useAuth (só para o nome).
 *
 *  Todos os dados vêm da camada de mocks isolada (./hubMocks). Trocar por APIs
 *  reais depois = editar apenas os adapters, sem tocar nesta view.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useMemo } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarCheck, ClipboardCheck, Newspaper, Square } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { HubSidebar } from "./HubSidebar";
import { SelvaTV } from "./SelvaTV";
import {
  getAgendaEvents,
  getTrelloCards,
  getSelvaTVImages,
  getNews,
  greetingForHour,
  firstName,
} from "./hubMocks";

export default function Hub() {
  const { user } = useAuth();

  // Dados (mock) — resolvidos uma vez.
  const agenda = useMemo(() => getAgendaEvents(), []);
  const cards = useMemo(() => getTrelloCards(), []);
  const tvImages = useMemo(() => getSelvaTVImages(), []);
  const news = useMemo(() => getNews(), []);

  const now = new Date();
  const greeting = `${greetingForHour(now.getHours())}, ${firstName((user as any)?.name)}`;
  const today = format(now, "EEEE, d 'de' MMMM", { locale: ptBR });

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      <HubSidebar />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Barra de notícias (some se vazia) */}
        {news.length > 0 && (
          <div className="flex items-center gap-2 border-b border-border bg-secondary/60 px-6 py-2.5 text-xs text-muted-foreground overflow-hidden">
            <Newspaper className="w-3.5 h-3.5 flex-shrink-0 text-accent" />
            <span className="truncate">{news.map((n) => n.text).join("  ·  ")}</span>
          </div>
        )}

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
      </div>
    </div>
  );
}
