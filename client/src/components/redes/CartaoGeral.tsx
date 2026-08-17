/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Social — o cartão de métrica da faixa de dados gerais
 * ─────────────────────────────────────────────────────────────────────────────
 *  Quatro camadas, e a ordem delas é a hierarquia da leitura:
 *
 *    1. TOPO       ícone no matiz da família + selo de variação
 *    2. NÚMERO     o dado, grande. Nunca substituído por gráfico
 *    3. PROPORÇÃO  a composição, ABAIXO do número — barra + legenda
 *    4. RESSALVA   o que o número não diz
 *
 *  ── A barra não substitui o número, e isso é regra ─────────────────────────
 *  Trocar "1.284" por uma barra faria a tela ficar mais bonita e responder
 *  menos: ninguém lê valor em barra. As duas convivem porque respondem
 *  perguntas diferentes — quanto, e de que é feito.
 *
 *  ── O selo é colorido pela DIREÇÃO BOA, não pelo sinal ─────────────────────
 *  Hoje todas as métricas da Social sobem para melhor. Deixar `bom` explícito é
 *  o que impede que uma métrica de custo, no dia em que entrar aqui, apareça em
 *  verde por ter subido.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

export interface Parcela {
  rotulo: string;
  valor: number;
  cor: string;
}

/** Abaixo disto é ruído com cara de tendência. */
const PISO_PCT = 0.5;

function Selo({ pct, anterior, bom }: {
  pct: number | null; anterior: number | null; bom: "sobe" | "cai";
}) {
  // Sem variação calculável, NÃO há selo. Um "0%" afirmaria estabilidade sobre
  // dias que ninguém mediu — e ninguém desconfia de um zero.
  if (pct == null) return null;

  const plano = Math.abs(pct) <= PISO_PCT;
  const positivo = bom === "sobe" ? pct > 0 : pct < 0;
  const Icone = plano ? Minus : pct > 0 ? ArrowUpRight : ArrowDownRight;
  const tom = plano
    ? "bg-muted text-muted-foreground"
    : positivo
      ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-500"
      : "bg-destructive/12 text-destructive";

  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-bold tabular-nums px-2 py-1 rounded-full ${tom}`}
      title={anterior != null ? `Período anterior: ${anterior.toLocaleString("pt-BR")}` : undefined}>
      <Icone className="w-3 h-3" strokeWidth={2.6} />
      {pct > 0 ? "+" : ""}{pct.toFixed(1)}%
    </span>
  );
}

export function CartaoGeral({
  icone: Icone, cor, rotulo, valor, detalhe, parcelas, ressalva, explicacao,
  variacaoPct, anterior, bom = "sobe",
}: {
  icone: LucideIcon;
  /** O matiz da família — o mesmo do gráfico e da legenda desta métrica. */
  cor: string;
  rotulo: string;
  valor: string;
  detalhe?: string | null;
  parcelas?: Parcela[];
  ressalva?: string | null;
  variacaoPct?: number | null;
  anterior?: number | null;
  bom?: "sobe" | "cai";
  /** O que a métrica mede, no tooltip. Só o que a ressalva não já disser. */
  explicacao?: string | null;
}) {
  const [realce, setRealce] = useState<string | null>(null);
  const vazio = valor === "–";
  const total = (parcelas ?? []).reduce((n, p) => n + p.valor, 0);

  return (
    /* O realce é do CARTÃO inteiro, não de um detalhe dele: o que o mouse marca
       é "estou lendo esta métrica". Fundo levíssimo e 160ms — passar o mouse
       pela faixa não pode virar uma sequência de piscadas. */
    <div className="group flex flex-col flex-1 px-4 py-4 min-w-0 transition-colors duration-150 hover:bg-foreground/[0.02]">
      <div className="flex items-start justify-between gap-2 mb-3">
        <span className="w-8 h-8 rounded-[10px] grid place-items-center flex-shrink-0 transition-colors duration-150"
          style={{ background: `${cor}29`, color: cor }}>
          <Icone className="w-4 h-4" strokeWidth={2.2} />
        </span>
        <Selo pct={variacaoPct ?? null} anterior={anterior ?? null} bom={bom} />
      </div>

      <span className="text-[10px] font-semibold uppercase tracking-[0.13em] text-muted-foreground mb-1"
        title={explicacao ?? undefined}>
        {rotulo}
      </span>
      <span className={`text-[28px] font-bold tabular-nums leading-none tracking-tight ${
        vazio ? "text-muted-foreground/40" : "text-foreground"}`}>
        {valor}
      </span>
      {detalhe && <span className="text-[11px] text-muted-foreground mt-1.5">{detalhe}</span>}

      {/* A barra de proporção: cada faixa cresce pelo próprio valor. Só aparece
          quando há mais de uma parcela — com uma só, ela seria uma barra cheia
          dizendo "100% de si mesma". */}
      {parcelas && parcelas.length > 1 && total > 0 && (
        <>
          {/* Legenda e barra são a MESMA informação em dois lugares. O mouse
              sobre uma delas apaga as outras parcelas, e aí não é preciso
              adivinhar qual faixa é "salvamentos" — a correspondência aparece
              em vez de ser deduzida por ordem. */}
          <span className="flex h-[7px] rounded-full overflow-hidden mt-3 bg-muted">
            {parcelas.filter((p) => p.valor > 0).map((p) => (
              <span key={p.rotulo}
                style={{
                  flexGrow: p.valor, background: p.cor,
                  opacity: realce && realce !== p.rotulo ? 0.28 : 1,
                  transition: "opacity 140ms ease",
                }}
                onMouseEnter={() => setRealce(p.rotulo)}
                onMouseLeave={() => setRealce(null)}
                title={`${p.rotulo}: ${p.valor.toLocaleString("pt-BR")} (${Math.round(p.valor / total * 100)}%)`} />
            ))}
          </span>
          <span className="flex flex-wrap gap-x-2.5 gap-y-1 mt-2">
            {parcelas.map((p) => (
              <span key={p.rotulo}
                className={`inline-flex items-center gap-1.5 text-[10.5px] transition-colors duration-150 ${
                  realce === p.rotulo ? "text-foreground font-semibold" : "text-muted-foreground"}`}
                onMouseEnter={() => setRealce(p.rotulo)}
                onMouseLeave={() => setRealce(null)}
                title={`${Math.round(p.valor / total * 100)}% do total`}>
                <i className="w-2 h-2 rounded-[3px] flex-shrink-0" style={{ background: p.cor }} />
                {p.valor.toLocaleString("pt-BR")} {p.rotulo}
              </span>
            ))}
          </span>
        </>
      )}

      {ressalva && (
        <span className="text-[10px] text-muted-foreground/60 leading-snug mt-2">{ressalva}</span>
      )}
    </div>
  );
}


/**
 * Uma métrica dentro de um card agrupado.
 *
 * Existe para "Interações com o perfil", onde visitas e cliques dividem um card
 * mas continuam sendo dois números. Somá-los criaria uma métrica que ninguém
 * mede — a agrupação é só visual, porque são duas ações sobre o mesmo objeto.
 */
export function MetricaDoPerfil({ rotulo, valor, variacaoPct, anterior, ressalva, acao }: {
  rotulo: string; valor: string;
  variacaoPct?: number | null; anterior?: number | null; ressalva?: string | null;
  /**
   * O convite, quando a métrica abre algo. Sem ele, um número clicável é
   * indistinguível de um número comum — e ninguém descobre o painel.
   */
  acao?: string | null;
}) {
  const vazio = valor === "–";
  return (
    <div className="group/metrica min-w-0">
      <div className="flex items-baseline justify-between gap-1.5 mb-0.5">
        <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/70 truncate">
          {rotulo}
        </span>
        <Selo pct={variacaoPct ?? null} anterior={anterior ?? null} bom="sobe" />
      </div>
      <span className={`block text-[22px] font-bold tabular-nums leading-none tracking-tight ${
        vazio ? "text-muted-foreground/40" : "text-foreground"}`}>
        {valor}
      </span>
      {ressalva && (
        <span className="block text-[10px] text-muted-foreground/60 leading-snug mt-1.5">{ressalva}</span>
      )}
      {acao && (
        <span className="block text-[10px] mt-1.5 text-muted-foreground/60
                         group-hover/metrica:text-foreground transition-colors duration-150">
          {acao} →
        </span>
      )}
    </div>
  );
}
