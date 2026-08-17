/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Retenção dos Reels — o componente pronto, e o dado que não existe
 * ─────────────────────────────────────────────────────────────────────────────
 *  Este arquivo é a única parte do redesenho que NÃO tem dado por trás, e ele
 *  diz isso na própria tela em vez de deixar descobrir.
 *
 *  ── O que temos e o que faltaria ───────────────────────────────────────────
 *  A coleta guarda, por publicação, `views`, `reach`, `total_interactions`,
 *  `likes`, `saved` e `shares`. São AGREGADOS. Uma curva de retenção exige
 *  medição por segundo, e nenhum dos campos sondados na Fase 0 entrega isso.
 *
 *  Existem dois candidatos nunca medidos — `ig_reels_avg_watch_time` e
 *  `ig_reels_video_view_total_time`. Eles dariam tempo MÉDIO e tempo TOTAL, o
 *  suficiente para uma barra de retenção média; NÃO para a curva de abandono.
 *  Medir isso é uma sondagem, e sondagem é chamada nova à API — que não entra
 *  nesta rodada sem aviso.
 *
 *  ── Por que o componente existe agora, se está vazio ───────────────────────
 *  Porque a alternativa era pior: sem ele, a página não registra em lugar nenhum
 *  que essa pergunta existe e está sem resposta. O card vazio é um pedido de
 *  sondagem visível, com o desenho pronto para o dia em que houver dado.
 *
 *  Nenhuma curva ilustrativa é desenhada aqui — o protótipo tinha uma, marcada
 *  como ilustrativa, porque lá o objetivo era mostrar a forma. Na aplicação, uma
 *  linha bonita seria lida como dado.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { Clapperboard, Info } from "lucide-react";

export function RetencaoReels({ reelsNoPeriodo }: { reelsNoPeriodo: number }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline gap-2.5 flex-wrap">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Retenção dos Reels
        </h2>
        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full
                         border border-dashed border-[#7C5CE0]/40 text-[#5B3FB0] bg-[#7C5CE0]/[0.08]">
          Dado ainda não disponível
        </span>
      </div>

      <div className="rounded-xl border border-dashed border-[#7C5CE0]/35 bg-gradient-to-b from-[#7C5CE0]/[0.04] to-transparent p-5">
        <div className="grid grid-cols-1 lg:grid-cols-[auto_minmax(0,1fr)] gap-5 items-start">
          <span className="w-11 h-11 rounded-xl grid place-items-center flex-shrink-0
                           bg-[#7C5CE0]/12 text-[#7C5CE0]">
            <Clapperboard className="w-5 h-5" strokeWidth={2} />
          </span>

          <div className="min-w-0 flex flex-col gap-2.5">
            <p className="text-sm text-foreground leading-relaxed">
              A pergunta <strong>“em que segundo as pessoas param de assistir?”</strong> ainda não tem
              resposta no Spaces.
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed max-w-[70ch]">
              A coleta guarda <span className="font-mono text-[11px]">views</span>,{" "}
              <span className="font-mono text-[11px]">reach</span> e interações por publicação — números
              agregados. Uma curva de retenção precisa de medição por segundo, e nenhum campo
              sondado até agora entrega isso.
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed max-w-[70ch] flex gap-2">
              <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-[#7C5CE0]" />
              <span>
                O próximo passo é uma sondagem de{" "}
                <span className="font-mono text-[11px]">ig_reels_avg_watch_time</span> e{" "}
                <span className="font-mono text-[11px]">ig_reels_video_view_total_time</span>. Eles dariam
                tempo médio e total — o bastante para uma barra de retenção média, <strong>não</strong> para
                a curva de abandono.
              </span>
            </p>
            {reelsNoPeriodo > 0 && (
              <p className="text-[11px] text-muted-foreground/70">
                {reelsNoPeriodo} reel{reelsNoPeriodo === 1 ? "" : "s"} no período — o desempenho deles
                está em Performance por tipo, com os dados que já existem.
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
