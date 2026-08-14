/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Selva Spaces — Home (raiz da aplicação)
 * ─────────────────────────────────────────────────────────────────────────────
 *  Reutiliza primitivos de UI existentes (Card, Carousel), tokens, ícones
 *  lucide e useAuth. News e SelvaTV vêm do store local (editável em
 *  Configurações). Agenda (Google Calendar) é real, por usuário, tratada no
 *  backend. "Prioridades da semana" substituiu a box do Trello: direcionamento
 *  escrito no Spaces, por grupo e por semana — o Trello segue existindo em
 *  Configurações e nas integrações, só não ocupa mais espaço na Home.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useState, useEffect } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Link } from "wouter";
import { Bot, FileText, KeyRound, Settings, ArrowUpRight, type LucideIcon } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { HubShell } from "./HubShell";
import { ATALHOS, type Atalho } from "./atalhos";
import { SelvaTV } from "./SelvaTV";
import { NewsTicker } from "./NewsTicker";
import { greetingForHour, firstName } from "./hubMocks";
import type { NewsItem, SelvaTVImage } from "./hubMocks";
import { LinhaPrioridadesAgenda } from "./AgendaColapsavel";
import { PrioridadesCard } from "./PrioridadesCard";

/** O ícone de cada atalho na Home. Destinos e nomes vêm de `atalhos.ts`. */
const ICONE_DO_ATALHO: Record<Atalho["key"], LucideIcon> = {
  tracker: Bot,
  reports: FileText,
  access: KeyRound,
  settings: Settings,
};

/**
 * Quatro atalhos numa linha só.
 *
 * Eram 2×2 com cartões altos — do tamanho de um módulo da Home, competindo com
 * as Prioridades e a Agenda pela atenção. Atalho não é conteúdo: é o caminho
 * para outro lugar, e o peso visual dele tinha que ser menor que o do que ele
 * atravessa.
 *
 * O que encolheu foi o CARTÃO, não o alvo de clique: ícone e título continuam
 * na mesma linha, e a área clicável cobre o bloco inteiro. A descrição saiu —
 * quatro cartões numa linha não têm largura para ela, e "Gere relatórios
 * prontos para o cliente" embaixo de "Relatório" é a mesma informação duas
 * vezes. Ela virou `title`, para quem passar o mouse.
 *
 * No mobile são 2×2: quatro colunas num celular dariam quatro tiras estreitas
 * demais para um toque confortável.
 */
function AtalhosRapidos() {
  return (
    <section aria-label="Acesso rápido">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {ATALHOS.map(({ key, href, nome, descricao }) => {
          const Icon = ICONE_DO_ATALHO[key];
          return (
          <Link
            key={key}
            href={href}
            title={descricao}
            className="group relative overflow-hidden rounded-lg border border-[#EF701B]/25 px-3.5 py-3 transition-all hover:-translate-y-0.5 hover:border-[#EF701B]/70 hover:shadow-lg hover:shadow-[#EF701B]/20"
            style={{ background: "linear-gradient(135deg, #12141c 0%, #0a0b11 100%)" }}
          >
            {/* Os mesmos dois recursos dos cartões antigos, em escala menor: a
                faixa no topo e o brilho no canto. Trocá-los por um estilo novo
                faria os atalhos deixarem de parecer da mesma família. */}
            <div
              className="pointer-events-none absolute inset-x-0 top-0 h-px opacity-30 transition-opacity duration-300 group-hover:opacity-100"
              style={{ background: "linear-gradient(90deg, transparent, #EF701B, transparent)" }}
            />
            <div
              className="pointer-events-none absolute -right-6 -top-6 h-16 w-16 rounded-full opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-100"
              style={{ background: "radial-gradient(circle, rgba(239,112,27,0.6), transparent 70%)" }}
            />
            <div className="relative flex items-center gap-2.5 min-w-0">
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md ring-1 ring-[#EF701B]/20 transition-all group-hover:ring-[#EF701B]/60"
                style={{ background: "rgba(239,112,27,0.16)", color: "#EF701B" }}
              >
                <Icon className="h-4 w-4" />
              </span>
              {/* Duas linhas, e não `truncate`: "Brand Intelligent Tracker
                  (BIT)" não cabe numa linha num cartão de um quarto de largura,
                  e cortar produziria "Brand Intellig…" — que não é nome de
                  nada. O clamp mantém os quatro cartões da mesma altura. */}
              <span className="min-w-0 flex-1 text-[13px] font-medium leading-tight line-clamp-2" style={{ color: "#FDFFED" }}>
                {nome}
              </span>
              <ArrowUpRight
                className="h-3.5 w-3.5 shrink-0 opacity-0 transition-all group-hover:opacity-100 group-hover:text-[#EF701B]"
                style={{ color: "rgba(253,255,237,0.45)" }}
              />
            </div>
          </Link>
          );
        })}
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

  const news: NewsItem[] = (newsQ.data ?? []).map((n) => ({ id: String(n.id), text: n.text }));
  const tvImages: SelvaTVImage[] = (tvQ.data ?? []).map((im) => ({
    id: String(im.id),
    src: im.imageUrl,
    alt: im.title ?? "",
    title: im.title,
  }));

  // Relógio leve: re-render a cada 30s mantém hora, saudação e data em dia sem
  // pesar (nenhuma query é refeita). Granularidade de 30s basta para "HH:mm".
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const name = u?.name;
  const greeting = `${greetingForHour(now.getHours())}, ${firstName(name)}`;
  const today = format(now, "EEEE, d 'de' MMMM", { locale: ptBR });
  const hora = format(now, "HH:mm");

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
              <p className="text-sm text-muted-foreground mt-0.5">
                <span className="capitalize">{today}</span>
                <span className="mx-1.5 opacity-40">·</span>
                <span className="tabular-nums">{hora}</span>
              </p>
            </header>

            {/* Prioridades (2/3) + Agenda (1/3). A Agenda recolhe, e o espaço
                vai para as Prioridades — as duas larguras são a mesma decisão,
                então o layout vive junto em LinhaPrioridadesAgenda. */}
            <LinhaPrioridadesAgenda prioridades={<PrioridadesCard />} />

            {/* Acesso rápido às 2 funcionalidades mais legais do Spaces */}
            <AtalhosRapidos />

            {/* SELVA TV — carrossel (uploads + "Você prefere?" + slide fixo) */}
            <SelvaTV images={tvImages} />
          </div>
        </main>
    </HubShell>
  );
}
