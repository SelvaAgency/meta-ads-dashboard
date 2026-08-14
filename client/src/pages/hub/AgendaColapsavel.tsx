/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Selva Spaces — recolher a Agenda para dar espaço às Prioridades
 * ─────────────────────────────────────────────────────────────────────────────
 *  ── O que este arquivo existe para NÃO fazer ───────────────────────────────
 *  Não tocar em `AgendaCard`. Ele trata OAuth do Google, refresh de token,
 *  navegação de dia e cinco estados de erro — mexer ali para acrescentar um
 *  botão de recolher significaria arriscar tudo isso por um detalhe de layout.
 *  Aqui a Agenda inteira é usada como caixa-preta: aberta, renderiza o cartão
 *  original sem nenhuma alteração; recolhida, ele nem é montado.
 *
 *  ── Miniatura, e não sumiço ────────────────────────────────────────────────
 *  Recolhida, a Agenda vira uma coluna estreita que continua dizendo o que é e
 *  quantos eventos existem hoje. Se ela desaparecesse, quem recolheu ontem não
 *  lembraria amanhã que ela existe — e o botão de trazer de volta seria um
 *  ícone órfão.
 *
 *  ── localStorage, e não banco ──────────────────────────────────────────────
 *  Mesma escolha (e mesmo motivo) da `HubSidebar`: é decisão de máquina, não de
 *  conta. Quem usa notebook pequeno e monitor grande quer estados diferentes nos
 *  dois, e gravar no banco levaria a escolha de um para o outro.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useState } from "react";
import { CalendarCheck, ChevronLeft, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { AgendaCard } from "./AgendaCard";

const CHAVE = "spaces_home_agenda_recolhida";

function lerRecolhida(): boolean {
  try {
    return localStorage.getItem(CHAVE) === "1";
  } catch {
    return false;
  }
}

/**
 * A Home inteira: Prioridades e Agenda na mesma linha.
 *
 * O layout vive AQUI e não no `Hub` porque as duas larguras são a mesma
 * decisão — quando a Agenda encolhe, o espaço vai para as Prioridades. Separar
 * isso em dois lugares faria uma metade da regra ficar longe da outra.
 *
 * Flex e não grid: `grid-template-columns` não interpola entre `fr` e `rem`, e
 * a transição ficaria seca. Com flex, `flex-1` na esquerda e largura animada na
 * direita dá o mesmo 2/3–1/3 e desliza.
 */
export function LinhaPrioridadesAgenda({ prioridades }: { prioridades: React.ReactNode }) {
  const [recolhida, setRecolhida] = useState(lerRecolhida);

  const alternar = () => {
    setRecolhida((v) => {
      const novo = !v;
      try { localStorage.setItem(CHAVE, novo ? "1" : "0"); } catch { /* sessão só */ }
      return novo;
    });
  };

  return (
    <div className="flex flex-col md:flex-row gap-6 items-stretch">
      <div className="min-w-0 flex-1">{prioridades}</div>

      {/* `md:w-*` só no desktop: no mobile as duas empilham em largura cheia, e
          a miniatura vira uma faixa horizontal — que continua sendo um alvo de
          toque confortável, ao contrário de uma coluna de 4rem espremida. */}
      <div className={`flex-shrink-0 transition-[width] duration-300 ease-out ${
        recolhida ? "md:w-[4.5rem]" : "md:w-1/3"
      }`}>
        {recolhida
          ? <AgendaMini onExpandir={alternar} />
          : <AgendaAberta onRecolher={alternar} />}
      </div>
    </div>
  );
}

/**
 * A Agenda normal, com o botão de recolher sobreposto.
 *
 * Sobreposto e não dentro do cartão: `AgendaCard` fica intacto. O botão se
 * apoia no canto superior direito, onde o cartão tem o seu próprio controle de
 * sincronizar — ficaria em cima dele. Por isso ele mora ACIMA do topo, na
 * mesma faixa do cabeçalho, e só aparece no hover da área.
 */
function AgendaAberta({ onRecolher }: { onRecolher: () => void }) {
  return (
    <div className="relative h-full group/agenda">
      <AgendaCard />
      <button onClick={onRecolher} title="Recolher agenda" aria-label="Recolher agenda"
        className="absolute -left-3 top-6 z-10 w-6 h-6 rounded-full border border-border bg-card
                   text-muted-foreground hover:text-foreground hover:border-[#EF701B]/50
                   flex items-center justify-center shadow-sm
                   opacity-0 group-hover/agenda:opacity-100 focus:opacity-100 max-md:opacity-100
                   transition-all">
        <ChevronRight className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

/**
 * A miniatura.
 *
 * Continua dizendo duas coisas: que é a Agenda, e se há algo hoje. O número é o
 * que justifica ela não ter sumido — sem ele, a coluna seria só um botão de
 * expandir com um ícone bonito.
 *
 * Usa a mesma query do cartão aberto, então o react-query serve do cache e não
 * há chamada nova ao recolher.
 */
function AgendaMini({ onExpandir }: { onExpandir: () => void }) {
  const q = trpc.integrations.googleCalendar.todayEvents.useQuery(undefined, {
    retry: false, refetchOnWindowFocus: false, staleTime: 60_000,
  });
  const eventos = q.data?.status === "ok" ? q.data.events?.length ?? 0 : null;

  return (
    <Card className="h-full py-4 gap-0">
      <button onClick={onExpandir} title="Expandir agenda" aria-label="Expandir agenda"
        className="h-full w-full flex md:flex-col items-center md:justify-start justify-between gap-3 px-4 md:px-0
                   text-muted-foreground hover:text-foreground transition-colors">
        <span className="flex md:flex-col items-center gap-3 md:gap-2">
          <span className="w-8 h-8 rounded-lg bg-primary/20 text-accent flex items-center justify-center flex-shrink-0">
            <CalendarCheck className="w-4 h-4" />
          </span>
          {/* No desktop o rótulo fica na vertical: a coluna tem 4,5rem, e
              "Agenda" na horizontal não caberia sem encolher a fonte a ponto de
              não se ler. No mobile a faixa é larga, então ele fica normal. */}
          <span className="text-xs font-semibold md:[writing-mode:vertical-rl] md:rotate-180 md:tracking-wide">
            Agenda
          </span>
          {eventos !== null && eventos > 0 && (
            <span className="text-[10px] font-bold tabular-nums w-5 h-5 rounded-full bg-accent/20 text-accent flex items-center justify-center flex-shrink-0">
              {eventos}
            </span>
          )}
        </span>
        <ChevronLeft className="w-4 h-4 flex-shrink-0 md:mt-2" />
      </button>
    </Card>
  );
}
