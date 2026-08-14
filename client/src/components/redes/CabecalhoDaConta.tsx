/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Social — o cabeçalho da conta
 * ─────────────────────────────────────────────────────────────────────────────
 *  Uma faixa só, com três regiões: quem é a conta, o que aconteceu, e a
 *  trajetória. Nada de moldura em volta de cada parte — as bordas internas eram
 *  o que fazia a versão anterior parecer uma coleção de componentes em vez de
 *  uma visão da conta.
 *
 *  ── Curto é requisito, não estilo ──────────────────────────────────────────
 *  Um parágrafo no topo é lido uma vez e pulado nas próximas. O resumo cabe em
 *  uma linha e meia; quando não há o que dizer, ele diz isso em meia linha. O
 *  espaço economizado vai para o branco entre as regiões, que é o que separa
 *  hierarquia de amontoado.
 *
 *  ── Ontem × hoje respeita a natureza de cada métrica ───────────────────────
 *  Seguidores é ESTOQUE: "hoje 9.500" é o total da conta, não o que ela ganhou
 *  hoje. Na mesma coluna de ativações e visitas, que são FLUXO, os quatro se
 *  leem do mesmo jeito — e aí 9.500 vira "9.500 seguidores hoje", que é o erro
 *  mais caro que esta tela pode induzir. Por isso o estoque mostra o total e a
 *  variação em alturas diferentes.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { ExternalLink } from "lucide-react";
import type { LeituraSocial } from "@shared/leituraSocial";

export interface ValorDoDia {
  rotulo: string;
  /** `null` = não medido. Nunca 0 de consolo. */
  valor: number | null;
  natureza: "fluxo" | "estoque";
  /** Só em estoque: a variação em relação ao dia anterior. */
  variacao?: number | null;
  /** Quando o número não é contagem — "5,1%". */
  formato?: "numero" | "percentual";
}

const fmt = (v: ValorDoDia | undefined): string => {
  if (!v || v.valor == null) return "–";
  if (v.formato === "percentual") return `${v.valor.toFixed(1)}%`;
  return v.valor.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
};
const inteiro = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });

/** Identidade: nome, @ e rede. Contexto, não dado — por isso é a linha menor. */
export function IdentidadeDaConta({ nome, username, rede }: {
  nome: string; username: string | null; rede: string;
}) {
  return (
    <div className="flex items-baseline gap-2.5 flex-wrap min-w-0">
      <h1 className="text-2xl font-bold text-foreground leading-none tracking-tight">{nome}</h1>
      {username && (
        <a href={`https://instagram.com/${username}`} target="_blank" rel="noopener noreferrer"
          className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1 transition-colors">
          @{username} <ExternalLink className="w-3 h-3" />
        </a>
      )}
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground/60">{rede}</span>
    </div>
  );
}

/**
 * O resumo, em uma linha e meia.
 *
 * Sem ícone, sem título, sem caixa: ele é a primeira frase da página e não
 * precisa se anunciar. A nota de rodapé existe porque a frase parece texto de
 * IA e não é — cada número dela sai de aritmética sobre os snapshots, e dizer
 * isso protege a confiança nos dois sentidos.
 */
export function ResumoCurto({ leitura }: { leitura: LeituraSocial }) {
  return (
    <div className="min-w-0">
      <p className={`text-sm leading-relaxed ${leitura.texto ? "text-foreground" : "text-muted-foreground"}`}>
        {leitura.texto ?? leitura.motivo}
      </p>
      {leitura.texto && (
        <p className="text-[10px] text-muted-foreground/50 mt-1">calculado dos snapshots</p>
      )}
    </div>
  );
}

/**
 * Resultados: ontem e hoje, quatro linhas.
 *
 * Grade de três colunas sem borda nenhuma — o alinhamento das colunas já separa
 * os dois dias. Linhas divisórias aqui somariam três traços por métrica numa
 * região que precisa ser lida de relance.
 */
export function Resultados({ ontem, hoje, aviso }: {
  ontem: ValorDoDia[]; hoje: ValorDoDia[]; aviso?: string | null;
}) {
  return (
    <div className="min-w-0">
      <div className="grid grid-cols-[1fr_auto_auto] gap-x-5 items-baseline">
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground pb-2">
          Resultados
        </span>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60 text-right pb-2">Ontem</span>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-foreground text-right pb-2">Hoje</span>

        {hoje.map((h, i) => (
          <Linha key={h.rotulo} ontem={ontem[i]} hoje={h} />
        ))}
      </div>
      {aviso && <p className="text-[10px] text-muted-foreground/50 mt-2.5 leading-snug">{aviso}</p>}
    </div>
  );
}

function Linha({ ontem, hoje }: { ontem?: ValorDoDia; hoje: ValorDoDia }) {
  return (
    <>
      <span className="text-[13px] text-muted-foreground py-1">{hoje.rotulo}</span>
      <span className="text-[13px] text-right tabular-nums text-muted-foreground/70 py-1">{fmt(ontem)}</span>
      <span className="text-[13px] text-right tabular-nums text-foreground font-semibold py-1">
        {fmt(hoje)}
        {/* A variação do estoque fica ABAIXO do total, em corpo menor: elas
            respondem perguntas diferentes e empatariam se dividissem a linha. */}
        {hoje.natureza === "estoque" && hoje.variacao != null && hoje.variacao !== 0 && (
          <span className={`block text-[10px] font-normal ${hoje.variacao > 0 ? "text-emerald-600" : "text-destructive"}`}>
            {hoje.variacao > 0 ? "+" : ""}{inteiro(hoje.variacao)}
          </span>
        )}
      </span>
    </>
  );
}
