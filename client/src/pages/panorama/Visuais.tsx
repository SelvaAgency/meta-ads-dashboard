/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Panorama — componentes de apresentação (sem lógica de dado)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  Regras de dataviz que estes componentes carregam:
 *   · cor só de STATUS reservado (ok/atencao/critico) — sempre com ícone ou
 *     rótulo junto, nunca cor sozinha carregando o significado;
 *   · barras num TOM SEQUENCIAL único (a tinta primária), largura ∝ valor —
 *     sem paleta categórica, sem arco-íris;
 *   · o texto (números, rótulos) usa tokens de tinta, nunca a cor da barra;
 *   · métrica sem base mostra "—"; largura de barra falsa (valor 0) não é
 *     desenhada — quem chama já filtrou.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import type { ReactNode } from "react";
import { CheckCircle2, AlertTriangle, XCircle, MinusCircle, TrendingUp, TrendingDown } from "lucide-react";
import type { EtapaFunil, FunilVisual, RankingProdutos, DistribuicaoStatus, Nivel } from "./panoramaLogic";
import { fmtBRL } from "./panoramaLogic";

// ── Tokens de status (reservados) ────────────────────────────────────────────

type Tom = "ok" | "atencao" | "critico" | "neutro";

const TOM: Record<Tom, { texto: string; ponto: string; leve: string }> = {
  ok:      { texto: "text-emerald-600 dark:text-emerald-400", ponto: "bg-emerald-500", leve: "bg-emerald-500/15" },
  atencao: { texto: "text-amber-600 dark:text-amber-400",     ponto: "bg-amber-500",   leve: "bg-amber-500/15" },
  critico: { texto: "text-red-600 dark:text-red-400",         ponto: "bg-red-500",     leve: "bg-red-500/15" },
  neutro:  { texto: "text-muted-foreground",                  ponto: "bg-muted-foreground/40", leve: "bg-muted-foreground/10" },
};

const ICONE_TOM: Record<Tom, typeof CheckCircle2> = {
  ok: CheckCircle2, atencao: AlertTriangle, critico: XCircle, neutro: MinusCircle,
};

const NIVEL_TOM: Record<Nivel, Tom> = { critico: "critico", atencao: "atencao", ok: "ok", sem_dados: "neutro" };

// ── Stat tile ─────────────────────────────────────────────────────────────────

export function StatTile({ rotulo, valor, detalhe, tom = "neutro" }: {
  rotulo: string; valor: ReactNode; detalhe?: string; tom?: Tom;
}) {
  return (
    <div className="bg-card border border-border rounded-xl px-4 py-3 min-w-[130px]">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{rotulo}</p>
      <p className={`text-2xl font-bold mt-0.5 ${tom === "neutro" ? "text-foreground" : TOM[tom].texto}`}>{valor}</p>
      {detalhe && <p className="text-[11px] text-muted-foreground mt-0.5">{detalhe}</p>}
    </div>
  );
}

// ── Chip de status (ícone + rótulo, nunca cor sozinha) ───────────────────────

export function ChipStatus({ tom, children, titulo }: { tom: Tom; children: ReactNode; titulo?: string }) {
  const Icone = ICONE_TOM[tom];
  return (
    <span title={titulo} className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium ${TOM[tom].leve} ${TOM[tom].texto}`}>
      <Icone className="w-3 h-3 flex-shrink-0" /> {children}
    </span>
  );
}

// ── Barra de saúde do portfólio (empilhada, com ícone+rótulo na legenda) ─────

export function BarraSaude({ distribuicao, total }: {
  distribuicao: { nivel: Nivel; quantidade: number }[]; total: number;
}) {
  if (total === 0) return null;
  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
        {distribuicao.filter((d) => d.quantidade > 0).map((d, i, arr) => (
          <div
            key={d.nivel}
            className={TOM[NIVEL_TOM[d.nivel]].ponto}
            style={{ width: `${(d.quantidade / total) * 100}%`, marginLeft: i > 0 ? 2 : 0 }}
            title={`${d.nivel}: ${d.quantidade}`}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {distribuicao.map((d) => (
          <span key={d.nivel} className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className={`w-2 h-2 rounded-full ${TOM[NIVEL_TOM[d.nivel]].ponto}`} />
            {ROTULO_NIVEL[d.nivel]} <span className="font-semibold text-foreground">{d.quantidade}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

const ROTULO_NIVEL: Record<Nivel, string> = {
  critico: "Crítico", atencao: "Atenção", ok: "Ok", sem_dados: "Sem dados",
};

// ── Delta de tráfego (▲▼) ─────────────────────────────────────────────────────

export function DeltaTrafego({ pct }: { pct: number | null }) {
  if (pct == null) return null;
  const sobe = pct >= 0;
  const Icone = sobe ? TrendingUp : TrendingDown;
  // Queda de tráfego é ruim; alta é boa. Cor de status, com ícone.
  const tom: Tom = pct <= -40 ? "critico" : pct < 0 ? "atencao" : "ok";
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-medium ${TOM[tom].texto}`}>
      <Icone className="w-3 h-3" /> {sobe ? "+" : ""}{pct.toFixed(0)}%
    </span>
  );
}

// ── Funil visual ──────────────────────────────────────────────────────────────

const pct1 = (v: number): string => `${v.toFixed(1).replace(".", ",")}%`;

/** Barra sequencial (tinta primária); largura ∝ valor sobre o maior da etapa. */
function BarraFunil({ etapa, maximo }: { etapa: EtapaFunil; maximo: number }) {
  const largura = etapa.valor != null && maximo > 0 ? Math.max(3, (etapa.valor / maximo) * 100) : 0;
  const perdeuForte = etapa.taxaPassagem != null && etapa.taxaPassagem < 30;
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 text-[11px] text-muted-foreground flex-shrink-0">{etapa.nome}</span>
      <div className="flex-1 h-5 rounded-md bg-muted/60 overflow-hidden">
        {etapa.valor != null
          ? <div className="h-full rounded-md bg-primary/70" style={{ width: `${largura}%` }} />
          : null}
      </div>
      <span className="w-10 text-right text-xs font-semibold text-foreground flex-shrink-0">
        {etapa.valor != null ? etapa.valor.toLocaleString("pt-BR") : "—"}
      </span>
      <span className={`w-24 text-right text-[11px] flex-shrink-0 ${perdeuForte ? TOM.atencao.texto : "text-muted-foreground"}`}>
        {etapa.taxaPassagem != null
          ? <>{pct1(etapa.taxaPassagem)}{etapa.perda != null && etapa.perda > 0 ? <span className="text-muted-foreground/70"> · −{etapa.perda.toLocaleString("pt-BR")}</span> : null}</>
          : ""}
      </span>
    </div>
  );
}

export function Funil({ funil }: { funil: FunilVisual }) {
  const maximo = Math.max(...funil.etapas.map((e) => e.valor ?? 0), 1);
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Funil · GA4 · {funil.janela}</p>
        {funil.amostraPequena && <ChipStatus tom="atencao" titulo="Menos de 20 checkouts — as taxas oscilam muito.">amostra pequena</ChipStatus>}
      </div>
      <div className="flex flex-col gap-1.5">
        {funil.etapas.map((e) => <BarraFunil key={e.chave} etapa={e} maximo={maximo} />)}
      </div>
    </div>
  );
}

// ── Ranking de produtos (barras) ──────────────────────────────────────────────

export function RankingProdutos({ ranking }: { ranking: RankingProdutos }) {
  const maximo = Math.max(...ranking.itens.map((i) => i.valor), 1);
  const rotuloValor = (i: RankingProdutos["itens"][number]) =>
    ranking.medida === "receita" ? fmtBRL(i.receita) : `${i.quantidade} un`;
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5">
        Top produtos · {ranking.medida === "receita" ? "receita" : "quantidade"} · {ranking.janela}
      </p>
      <div className="flex flex-col gap-1.5">
        {ranking.itens.map((i) => (
          <div key={i.nome} className="flex items-center gap-2">
            <span className="flex-1 text-xs text-foreground truncate" title={i.nome}>{i.nome}</span>
            <div className="w-24 h-4 rounded bg-muted/60 overflow-hidden flex-shrink-0">
              <div className="h-full rounded bg-primary/70" style={{ width: `${Math.max(4, (i.valor / maximo) * 100)}%` }} />
            </div>
            <span className="w-20 text-right text-[11px] font-medium text-foreground flex-shrink-0">{rotuloValor(i)}</span>
          </div>
        ))}
      </div>
      {ranking.observacao && (
        <p className="mt-1.5 text-[11px] text-amber-600 dark:text-amber-400 flex items-start gap-1">
          <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" /> {ranking.observacao}
        </p>
      )}
    </div>
  );
}

// ── Distribuição de pedidos por status ───────────────────────────────────────

export function DistribuicaoStatus({ dist }: { dist: DistribuicaoStatus }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5">Pedidos por status · {dist.janela}</p>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
        {dist.itens.map((s, i) => (
          <div key={s.status} className={TOM[s.tom].ponto} style={{ width: `${(s.quantidade / dist.total) * 100}%`, marginLeft: i > 0 ? 2 : 0 }} title={`${s.rotulo}: ${s.quantidade}`} />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
        {dist.itens.map((s) => (
          <span key={s.status} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <span className={`w-2 h-2 rounded-full ${TOM[s.tom].ponto}`} /> {s.rotulo} <span className="font-semibold text-foreground">{s.quantidade}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
