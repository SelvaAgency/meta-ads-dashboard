/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Social — o cabeçalho executivo da conta
 * ─────────────────────────────────────────────────────────────────────────────
 *  A primeira área da página responde uma pergunta: como esta conta está indo?
 *  Leitura, ontem × hoje e trajetória, na mesma faixa — em vez de uma fileira de
 *  cards iguais em que nada é mais importante que nada.
 *
 *  ── Ontem × hoje respeita a natureza de cada métrica ───────────────────────
 *  Seguidores é ESTOQUE: "hoje 9.500" é o total da conta, não o que ela ganhou
 *  hoje. Mostrá-lo na mesma coluna de ativações e visitas, que são FLUXO,
 *  convida a ler os quatro do mesmo jeito — e aí 9.500 vira "9.500 seguidores
 *  hoje", que é o erro mais caro que esta tela pode cometer.
 *
 *  Por isso o estoque aparece com o total e a variação SEPARADOS, e o rótulo da
 *  coluna diz de que tipo é cada linha.
 *
 *  ── O dia de hoje é sempre parcial ─────────────────────────────────────────
 *  A coleta das 06:20 mede ~6h de um dia de 24. "Hoje" contra "ontem" num fluxo
 *  compara 6h com 24h e sempre acusaria queda. O aviso é discreto e permanente:
 *  a comparação serve para acompanhar, não para concluir.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { ExternalLink, Instagram, Sparkles } from "lucide-react";
import type { LeituraSocial } from "@shared/leituraSocial";

export interface ValorDoDia {
  rotulo: string;
  /** `null` = não medido. Nunca 0 de consolo. */
  valor: number | null;
  /** Estoque mostra o total; fluxo mostra o acumulado do dia. */
  natureza: "fluxo" | "estoque";
  /** Só em estoque: a variação em relação ao dia anterior. */
  variacao?: number | null;
}

const fmt = (n: number | null | undefined): string =>
  n == null ? "–" : n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });

/**
 * O bloco de identidade da conta.
 *
 * Separado do resto porque ele não é dado — é contexto. Quem já sabe de qual
 * conta está olhando passa direto; quem chegou pelo menu precisa dele antes de
 * qualquer número.
 */
export function IdentidadeDaConta({ nome, username, rede, tipoConta }: {
  nome: string; username: string | null; rede: string; tipoConta?: string;
}) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <h1 className="text-xl font-bold text-foreground leading-none">{nome}</h1>
      {username && (
        <a href={`https://instagram.com/${username}`} target="_blank" rel="noopener noreferrer"
          className="text-sm font-mono text-muted-foreground hover:text-foreground inline-flex items-center gap-1 transition-colors">
          @{username} <ExternalLink className="w-3 h-3" />
        </a>
      )}
      <span className="inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-full border border-border text-muted-foreground">
        <Instagram className="w-3 h-3" /> {rede}
      </span>
      {tipoConta && (
        <span className="text-[11px] px-2 py-0.5 rounded-full border border-border text-muted-foreground">
          {tipoConta}
        </span>
      )}
    </div>
  );
}

/**
 * A leitura do período.
 *
 * Ocupa o lugar do resumo executivo, mas NÃO é texto de IA: cada frase sai de
 * uma comparação aritmética sobre os snapshots, e por isso é conferível na
 * mesma tela. Quando a série é curta demais, ele diz que não dá para afirmar —
 * um resumo fluente sobre três pontos é indistinguível de um sobre trinta.
 */
export function LeituraDoPeriodo({ leitura }: { leitura: LeituraSocial }) {
  return (
    <div className="flex flex-col gap-2 min-w-0">
      <div className="flex items-center gap-1.5">
        <Sparkles className="w-3.5 h-3.5 text-primary" />
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Leitura do período
        </h2>
      </div>
      {leitura.texto ? (
        <p className="text-sm text-foreground leading-relaxed">{leitura.texto}</p>
      ) : (
        <p className="text-sm text-muted-foreground leading-relaxed">{leitura.motivo}</p>
      )}
      <p className="text-[10px] text-muted-foreground/70">
        Calculado dos snapshots — não é texto gerado.
      </p>
    </div>
  );
}

/**
 * Ontem × hoje, quatro linhas.
 *
 * As duas colunas ficam lado a lado e não empilhadas: comparar é a função do
 * bloco, e comparação empilhada obriga a rolar entre os dois números.
 */
export function OntemEHoje({ ontem, hoje, avisoParcial }: {
  ontem: ValorDoDia[]; hoje: ValorDoDia[]; avisoParcial: string | null;
}) {
  return (
    <div className="min-w-0">
      <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 gap-y-0 text-sm">
        <span />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground text-right pb-1.5">
          Ontem
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-foreground text-right pb-1.5">
          Hoje
        </span>

        {hoje.map((h, i) => {
          const o = ontem[i];
          return (
            <Linha key={h.rotulo} rotulo={h.rotulo} ontem={o} hoje={h} />
          );
        })}
      </div>
      {avisoParcial && (
        <p className="text-[10px] text-muted-foreground/70 mt-2 leading-snug">{avisoParcial}</p>
      )}
    </div>
  );
}

function Linha({ rotulo, ontem, hoje }: { rotulo: string; ontem?: ValorDoDia; hoje: ValorDoDia }) {
  // Estoque mostra o TOTAL e, embaixo, a variação. Sem essa separação, o total
  // ocuparia a mesma posição de um número de fluxo e seria lido como "ganho no
  // dia" — o erro mais caro que este bloco pode induzir.
  const celula = (v?: ValorDoDia, forte = false) => {
    if (!v) return <span className="text-right tabular-nums text-muted-foreground/40 py-1.5">–</span>;
    return (
      <span className={`text-right tabular-nums py-1.5 ${forte ? "text-foreground font-semibold" : "text-muted-foreground"}`}>
        {fmt(v.valor)}
        {v.natureza === "estoque" && v.variacao != null && v.variacao !== 0 && (
          <span className={`block text-[10px] font-normal ${v.variacao > 0 ? "text-emerald-600" : "text-destructive"}`}>
            {v.variacao > 0 ? "+" : ""}{fmt(v.variacao)}
          </span>
        )}
      </span>
    );
  };

  return (
    <>
      <span className="text-muted-foreground py-1.5 border-t border-border/40 flex items-center gap-1.5">
        {rotulo}
        {hoje.natureza === "estoque" && (
          <span className="text-[9px] uppercase tracking-wider text-muted-foreground/50">total</span>
        )}
      </span>
      <span className="border-t border-border/40">{celula(ontem)}</span>
      <span className="border-t border-border/40">{celula(hoje, true)}</span>
    </>
  );
}
