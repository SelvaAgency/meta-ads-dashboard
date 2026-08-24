/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Eventos de conversão do cliente — GA4
 * ─────────────────────────────────────────────────────────────────────────────
 *  Dois componentes, uma fonte: `metricsJson.eventos` do snapshot que o cron do
 *  GA4 já grava. Nenhuma chamada nova na abertura da página, nenhuma IA.
 *
 *    FaixaDeEventos      Resumo — compacta, só o que a propriedade registra
 *    DetalheDeEventos    Performance — atual, anterior, variação, participação
 *
 *  ── Por que isto NÃO está no Panorama ──────────────────────────────────────
 *  Uma versão anterior somava estes eventos entre todos os clientes. O número
 *  não era de ninguém: `whatsapp_click` é a conversão central de um site
 *  institucional e irrelevante numa loja. Somá-los mede a composição da
 *  carteira, não performance. Aqui existe o contexto que decide se 9 compras é
 *  bom.
 *
 *  ── A lista ainda é fixa, e a tela diz ─────────────────────────────────────
 *  Não há configuração de eventos por conta no Spaces hoje — conferido:
 *  `clientClaritySettings` guarda URL e provider de performance, e
 *  `accountContext` é texto livre. Enquanto não houver, mostra-se o que o
 *  coletor busca, dito como tal, e nunca como "os KPIs deste cliente".
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import {
  GRUPOS_DE_EVENTO, eventosDoCliente, participacaoNasSessoes,
  type LeituraDeEvento,
} from "@shared/eventosDoCliente";

type Snapshot = { dia: string; metricsJson?: { eventos?: unknown } | null } | null | undefined;

const fmt = (n: number) => n.toLocaleString("pt-BR");
const dataCurta = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : null);

const COR_GRUPO: Record<string, { fundo: string; texto: string }> = {
  contato: { fundo: "bg-violet-500/[0.07] border-violet-500/20", texto: "text-violet-700 dark:text-violet-400" },
  compra: { fundo: "bg-emerald-500/[0.07] border-emerald-500/20", texto: "text-emerald-700 dark:text-emerald-400" },
};

/** A seta de variação — direção e cor. Mais evento é sempre melhor aqui. */
function Variacao({ pct, miuda = false }: { pct: number | null; miuda?: boolean }) {
  if (pct == null) return null;
  const plano = Math.abs(pct) < 0.5;
  const Icone = plano ? Minus : pct > 0 ? TrendingUp : TrendingDown;
  const tom = plano ? "text-muted-foreground"
    : pct > 0 ? "text-emerald-600 dark:text-emerald-500" : "text-destructive";
  return (
    <span className={`inline-flex items-center gap-0.5 font-bold tabular-nums ${tom} ${
      miuda ? "text-[10px]" : "text-[11px]"}`}>
      <Icone className={miuda ? "w-2.5 h-2.5" : "w-3 h-3"} strokeWidth={2.6} />
      {Math.abs(pct).toFixed(0)}%
    </span>
  );
}

/**
 * A faixa do Resumo — só o que a propriedade REGISTRA.
 *
 * Um evento que a propriedade não tem não aparece aqui: no Resumo, uma fileira
 * de traços diria "este cliente não converte" quando o que há é tagueamento
 * ausente. O detalhamento, na aba Performance, mostra os ausentes — é lá que a
 * lacuna vira tarefa.
 */
export function FaixaDeEventos({ snapshot, janela }: {
  snapshot: Snapshot; janela: "7d" | "30d";
}) {
  const r = eventosDoCliente(snapshot as never, janela);
  if (r.semColeta || r.nenhumRegistrado) return null;

  return (
    <section className="rounded-xl border border-border bg-card px-4 py-3">
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
          Conversões · GA4
        </p>
        <span className="text-[10px] text-muted-foreground/55">
          janela móvel de {janela}
          {dataCurta(r.dia) && ` · coleta ${dataCurta(r.dia)}`}
        </span>
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-2.5 mt-2.5">
        {GRUPOS_DE_EVENTO.map((g) => {
          const doGrupo = r.registrados.filter((l) => l.grupo === g.chave);
          if (!doGrupo.length) return null;
          const cor = COR_GRUPO[g.chave];
          return (
            <div key={g.chave}>
              <span className={`block text-[8.5px] font-bold uppercase tracking-[0.13em] mb-1.5 ${cor.texto}`}>
                {g.rotulo}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {doGrupo.map((l) => (
                  <div key={l.evento}
                    className={`rounded-lg border px-2.5 py-1.5 min-w-[96px] ${cor.fundo}`}
                    title={`${l.evento} · janela móvel de ${janela}`}>
                    <span className="block text-[8.5px] font-bold uppercase tracking-[0.09em]
                                     text-muted-foreground/70 truncate">
                      {l.nome}
                    </span>
                    <span className="flex items-baseline gap-1.5">
                      <span className="text-[18px] font-bold tabular-nums leading-none">
                        {fmt(l.total as number)}
                      </span>
                      <Variacao pct={l.variacao} miuda />
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/**
 * O detalhamento da aba Performance.
 *
 * Aqui os eventos AUSENTES aparecem, e é de propósito: na página de análise, um
 * evento que a propriedade não registra é uma tarefa de implantação, não um
 * silêncio. É a diferença entre "não convertemos" e "não medimos".
 *
 * ── A participação não é taxa de funil ─────────────────────────────────────
 * `begin_checkout ÷ sessões` NÃO diz quantos do carrinho chegaram ao checkout.
 * É participação sobre a MESMA base para todos os eventos, que é o que a torna
 * comparável entre eles — e por isso a coluna se chama "das sessões".
 */
export function DetalheDeEventos({ snapshot, janela, sessions }: {
  snapshot: Snapshot; janela: "7d" | "30d"; sessions: number | null | undefined;
}) {
  const r = eventosDoCliente(snapshot as never, janela);

  if (r.semColeta) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card px-4 py-4">
        <p className="text-[12px] font-medium">Eventos de conversão ainda não coletados</p>
        <p className="text-[11px] text-muted-foreground mt-1 max-w-[70ch] leading-snug">
          A leitura de eventos entrou depois deste snapshot. Ela aparece na próxima sincronização
          diária do GA4 — nenhuma ação é necessária.
        </p>
      </div>
    );
  }

  const GRADE = "grid grid-cols-[minmax(0,1fr)_76px_76px_64px_72px] gap-2 items-center";
  const linha = (l: LeituraDeEvento) => {
    const part = participacaoNasSessoes(l.total, sessions);
    return (
      <div key={l.evento}
        className={`${GRADE} px-3 py-2 text-[11.5px] hover:bg-foreground/[0.02] transition-colors duration-150`}>
        <span className="min-w-0">
          <span className={`block font-semibold truncate ${l.registrado ? "" : "text-muted-foreground/50"}`}>
            {l.nome}
          </span>
          <span className="block text-[9.5px] font-mono text-muted-foreground/50 truncate">
            {l.evento}
          </span>
        </span>
        <span className={`tabular-nums text-right font-bold text-[14px] ${
          l.registrado ? "" : "text-muted-foreground/30"}`}>
          {l.registrado ? fmt(l.total as number) : "—"}
        </span>
        <span className="tabular-nums text-right text-muted-foreground">
          {l.anterior != null ? fmt(l.anterior) : "—"}
        </span>
        <span className="text-right">
          {l.variacao != null ? <Variacao pct={l.variacao} /> : (
            <span className="text-[10.5px] text-muted-foreground/40">—</span>
          )}
        </span>
        <span className="tabular-nums text-right text-muted-foreground">
          {part != null ? `${part.toFixed(part < 1 ? 2 : 1).replace(".", ",")}%` : "—"}
        </span>
      </div>
    );
  };

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className={`${GRADE} px-3 py-2 text-[9px] font-bold uppercase tracking-[0.09em]
                       text-muted-foreground/55 border-b border-border`}>
        <span>Evento</span>
        <span className="text-right">{janela}</span>
        <span className="text-right">Anterior</span>
        <span className="text-right">Variação</span>
        <span className="text-right"
          title="Sobre as sessões do período — a mesma base para todos os eventos. Não é taxa de passagem do funil.">
          Das sessões
        </span>
      </div>

      {GRUPOS_DE_EVENTO.map((g) => (
        <div key={g.chave}>
          <div className="px-3 py-1.5 bg-muted/25 border-b border-border/60">
            <span className={`text-[8.5px] font-bold uppercase tracking-[0.13em] ${COR_GRUPO[g.chave].texto}`}>
              {g.rotulo}
            </span>
          </div>
          <div className="divide-y divide-border/50">
            {r.leituras.filter((l) => l.grupo === g.chave).map(linha)}
          </div>
        </div>
      ))}

      <p className="px-3 py-2.5 text-[10px] text-muted-foreground/60 leading-snug border-t border-border">
        Traço em <b>{janela}</b> significa que a propriedade não registra o evento — diferente de{" "}
        <b>0</b>, que é o evento existindo e não tendo ocorrido. Esta é a lista que o Spaces
        acompanha hoje; a escolha de eventos por cliente ainda não é configurável.
      </p>
    </div>
  );
}
