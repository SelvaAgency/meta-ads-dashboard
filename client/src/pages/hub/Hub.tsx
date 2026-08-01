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
import { Link } from "wouter";
import { Bot, FileText, KeyRound, Settings, ArrowUpRight } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { HubShell } from "./HubShell";
import { SelvaTV } from "./SelvaTV";
import { NewsTicker } from "./NewsTicker";
import { greetingForHour, firstName } from "./hubMocks";
import type { NewsItem, SelvaTVImage } from "./hubMocks";
import { AgendaCard } from "./AgendaCard";
import { MyCardsCard } from "./MyCardsCard";

/** Atalhos de destaque na Home — acesso rápido aos principais recursos. */
const ATALHOS = [
  {
    href: "/tracker",
    icon: Bot,
    title: "Brand Inteligent Tracker",
    desc: "O robô de performance da SELVA.",
  },
  {
    href: "/reports",
    icon: FileText,
    title: "Relatório",
    desc: "Gere relatórios prontos para o cliente.",
  },
  {
    href: "/access",
    icon: KeyRound,
    title: "Acessos",
    desc: "Credenciais dos clientes — organizadas e seguras.",
  },
  {
    href: "/settings",
    icon: Settings,
    title: "Configurações",
    desc: "Personalize seu SELVA Spaces.",
  },
] as const;

function AtalhosRapidos() {
  return (
    <section aria-label="Acesso rápido">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {ATALHOS.map(({ href, icon: Icon, title, desc }) => (
          <Link
            key={href}
            href={href}
            className="group relative overflow-hidden rounded-xl border border-[#EF701B]/30 p-5 transition-all hover:-translate-y-0.5 hover:border-[#EF701B]/80 hover:shadow-xl hover:shadow-[#EF701B]/25"
            style={{ background: "linear-gradient(135deg, #12141c 0%, #0a0b11 100%)" }}
          >
            {/* faixa laranja no topo — some quando parado, acende no hover */}
            <div
              className="pointer-events-none absolute inset-x-0 top-0 h-px opacity-40 transition-opacity duration-300 group-hover:opacity-100"
              style={{ background: "linear-gradient(90deg, transparent, #EF701B, transparent)" }}
            />
            {/* brilho laranja de fundo no hover */}
            <div
              className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full opacity-50 blur-2xl transition-opacity duration-300 group-hover:opacity-100"
              style={{ background: "radial-gradient(circle, rgba(239,112,27,0.6), transparent 70%)" }}
            />
            <div className="relative flex items-start gap-4">
              <span
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ring-1 ring-[#EF701B]/20 transition-all group-hover:scale-105 group-hover:ring-[#EF701B]/60"
                style={{ background: "rgba(239,112,27,0.16)", color: "#EF701B" }}
              >
                <Icon className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <h3 className="font-semibold leading-tight" style={{ color: "#FDFFED" }}>{title}</h3>
                  <ArrowUpRight className="h-4 w-4 shrink-0 transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-[#EF701B]" style={{ color: "rgba(253,255,237,0.45)" }} />
                </div>
                <p className="mt-1.5 text-sm" style={{ color: "rgba(253,255,237,0.55)" }}>{desc}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

export default function Hub() {
  const { user } = useAuth();
  const u = user as { name?: string; birthdayDay?: number | null; birthdayMonth?: number | null } | null;

  // News/SelvaTV ATIVOS vêm do backend (globais para todos os usuários).
  const newsQ = trpc.news.listActive.useQuery(undefined, { refetchOnWindowFocus: false });
  const tvQ = trpc.selvaTV.listActive.useQuery(undefined, { refetchOnWindowFocus: false });
  const vpQ = trpc.selvaTV.vocePrefereGet.useQuery(undefined, { refetchOnWindowFocus: false });
  const fsQ = trpc.selvaTV.fixedSlidesGet.useQuery(undefined, { refetchOnWindowFocus: false });

  const news: NewsItem[] = (newsQ.data ?? []).map((n) => ({ id: String(n.id), text: n.text }));
  const tvImages: SelvaTVImage[] = (tvQ.data ?? []).map((im) => ({
    id: String(im.id),
    src: im.imageUrl,
    alt: im.title ?? "",
    title: im.title,
  }));

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

            {/* Acesso rápido às 2 funcionalidades mais legais do Spaces */}
            <AtalhosRapidos />

            {/* SELVA TV — carrossel (uploads + "Você prefere?" + slide fixo) */}
            <SelvaTV images={tvImages} vocePrefere={vpQ.data} fixedSlides={fsQ.data} />
          </div>
        </main>
    </HubShell>
  );
}
