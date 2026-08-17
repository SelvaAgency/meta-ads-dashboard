/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Social — a identidade e o cabeçalho de 3 colunas
 * ─────────────────────────────────────────────────────────────────────────────
 *  Reproduz o cabeçalho do protótipo aprovado, e as proporções são a parte que
 *  não pode escorregar: 0.92fr / 1fr / 1.55fr. O gráfico é a coluna larga porque
 *  é a única que ganha com espaço — resumo e resultados têm tamanho natural, e
 *  esticá-los só afastaria as palavras umas das outras.
 *
 *  ── Uma caixa, divisórias internas ─────────────────────────────────────────
 *  As três regiões são separadas por um traço de 1px, não por cartões. Cartão
 *  separado faria delas blocos independentes, e o cabeçalho volta a parecer uma
 *  coleção de componentes em vez de UMA visão da conta.
 *
 *  ── Ontem × hoje respeita a natureza da métrica ────────────────────────────
 *  Seguidores é ESTOQUE: "hoje 9.464" é o total da conta, não o ganho do dia. Na
 *  mesma coluna de fluxo, os quatro se leem do mesmo jeito — e aí 9.464 vira
 *  "9.464 seguidores hoje", que é o erro mais caro que esta tela pode induzir.
 *  Por isso o estoque leva o rótulo "total" e mostra a variação separada.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { ExternalLink } from "lucide-react";
import type { LeituraSocial } from "@shared/leituraSocial";

export interface ValorDoDia {
  rotulo: string;
  valor: number | null;
  natureza: "fluxo" | "estoque";
  variacao?: number | null;
  formato?: "numero" | "percentual";
}

const inteiro = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
const valorDe = (v?: ValorDoDia) => {
  if (!v || v.valor == null) return "–";
  return v.formato === "percentual" ? `${v.valor.toFixed(1)}%` : inteiro(v.valor);
};

/** As iniciais do cliente — o quadrado preto do protótipo. */
const iniciais = (nome: string) =>
  nome.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";

export function IdentidadeDaConta({ nome, username, rede, saude }: {
  nome: string; username: string | null; rede: string;
  saude?: { rotulo: string; nivel: "ok" | "atencao" | "erro" } | null;
}) {
  const tomSaude = saude?.nivel === "erro"
    ? "bg-destructive/12 text-destructive"
    : saude?.nivel === "atencao"
      ? "bg-amber-500/14 text-amber-700 dark:text-amber-500"
      : "bg-emerald-500/12 text-emerald-700 dark:text-emerald-500";

  return (
    <div className="flex items-center gap-3.5 flex-wrap">
      <span className="w-[46px] h-[46px] rounded-[14px] bg-foreground text-background grid place-items-center
                       font-bold text-[15px] flex-shrink-0 tracking-tight">
        {iniciais(nome)}
      </span>
      <div className="flex-1 min-w-0">
        <h1 className="text-2xl font-bold tracking-[-0.02em] leading-none">{nome}</h1>
        <span className="text-[13px] text-muted-foreground inline-flex items-center gap-1.5 mt-1">
          {username ? (
            <a href={`https://instagram.com/${username}`} target="_blank" rel="noopener noreferrer"
              className="hover:text-foreground transition-colors inline-flex items-center gap-1">
              @{username} <ExternalLink className="w-3 h-3" />
            </a>
          ) : null}
          {username && <span className="opacity-40">·</span>}
          {rede}
        </span>
      </div>
      {saude && (
        <span className={`text-[10px] font-bold uppercase tracking-[0.04em] px-2.5 py-1 rounded-full ${tomSaude}`}>
          ● {saude.rotulo}
        </span>
      )}
    </div>
  );
}

/**
 * O resumo — primeira frase da página, sem título nem ícone.
 *
 * Ele não precisa se anunciar: está no canto superior esquerdo de uma caixa
 * chamada Social, e é a única prosa da tela. A nota de rodapé existe porque a
 * frase parece texto de IA e não é — cada número dela sai de aritmética sobre os
 * snapshots, e dizer isso protege a confiança nos dois sentidos.
 */
export function ResumoCurto({ leitura }: { leitura: LeituraSocial }) {
  return (
    <div className="min-w-0">
      <span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/70 mb-2.5">
        Resumo · 7 dias
      </span>
      <p className={`text-[13.5px] leading-[1.62] ${leitura.texto ? "text-foreground" : "text-muted-foreground"}`}>
        {leitura.texto ?? leitura.motivo}
      </p>
      {leitura.texto && (
        <p className="text-[10px] text-muted-foreground/50 mt-2.5">Calculado dos snapshots — não é texto gerado.</p>
      )}
    </div>
  );
}

/**
 * Resultados: ontem e hoje, seis linhas, sem borda nenhuma.
 *
 * O alinhamento das colunas já separa os dois dias. Linhas divisórias somariam
 * seis traços numa região que precisa ser lida de relance.
 */
export function Resultados({ ontem, hoje, aviso }: {
  ontem: ValorDoDia[]; hoje: ValorDoDia[]; aviso?: string | null;
}) {
  return (
    <div className="min-w-0">
      <div className="grid grid-cols-[1fr_auto_auto] gap-x-[18px] items-baseline">
        <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground/70 pb-2">
          Resultados
        </span>
        <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground/40 text-right pb-2">
          Ontem
        </span>
        <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-foreground text-right pb-2">
          Hoje
        </span>

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
      <span className="text-[12.5px] text-muted-foreground py-[5px] flex items-center gap-1.5">
        {hoje.rotulo}
        {hoje.natureza === "estoque" && (
          <span className="text-[9px] uppercase tracking-[0.06em] text-muted-foreground/45">total</span>
        )}
      </span>
      <span className="text-[13px] text-right tabular-nums text-muted-foreground/40 py-[5px]">
        {valorDe(ontem)}
      </span>
      <span className="text-[13px] text-right tabular-nums font-bold py-[5px]">
        {valorDe(hoje)}
        {/* A variação do estoque ABAIXO do total: elas respondem perguntas
            diferentes e empatariam se dividissem a linha. */}
        {hoje.natureza === "estoque" && hoje.variacao != null && hoje.variacao !== 0 && (
          <span className={`block text-[10px] font-semibold ${
            hoje.variacao > 0 ? "text-emerald-600 dark:text-emerald-500" : "text-destructive"}`}>
            {hoje.variacao > 0 ? "+" : ""}{inteiro(hoje.variacao)}
          </span>
        )}
      </span>
    </>
  );
}
