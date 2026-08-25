/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  PageSpeed histórico do cliente — a mediana, e o gráfico que mostra o resto
 * ─────────────────────────────────────────────────────────────────────────────
 *  A mediana é o número grande porque responde "como este site COSTUMA ir". A
 *  última medição, a média, o melhor e o pior ficam ao lado — e a distância
 *  entre média e mediana É a medida da volatilidade.
 *
 *  ── O gráfico não suaviza nada ─────────────────────────────────────────────
 *  Ele plota as medições como elas são: 91 → 89 → 92 → 90 → 41 → 90 aparece com
 *  o mergulho inteiro. Esconder o 41 numa curva média apagaria justamente a
 *  informação que explica por que a mediana existe.
 *
 *  ── A frase conta MEDIÇÕES ─────────────────────────────────────────────────
 *  "mediana de 6 medições" e não "média dos últimos 7 dias": a coleta falha
 *  (timeout do PageSpeed não grava snapshot) e a remedição manual sobrescreve o
 *  valor do dia. Prometer dias afirmaria uma cobertura que o dado não tem.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useState } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import {
  DESVIO_NOTAVEL, JANELA_PAGESPEED_DIAS, PISO_MEDICOES,
  faixaDoLighthouse, historicoPagespeed, textoDaBase,
} from "@shared/pagespeedHistorico";

const COR_FAIXA: Record<string, string> = {
  bom: "#3FA66A", medio: "#E0A030", ruim: "#D65745", vazio: "#8C8C8C",
};

export function PagespeedHistorico({ medicoes }: {
  medicoes: Array<{ dia: string; score: number }>;
}) {
  const h = historicoPagespeed(medicoes);
  const [ativo, setAtivo] = useState<number | null>(null);

  if (!h.quantidade) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card px-4 py-4">
        <p className="text-[12px] font-medium">Nenhuma medição de PageSpeed nos últimos {JANELA_PAGESPEED_DIAS} dias</p>
        <p className="text-[11px] text-muted-foreground mt-1 leading-snug max-w-[70ch]">
          O teste roda uma vez por dia. Falhas de medição não gravam snapshot, então buracos na
          série são coletas que não completaram — e não quedas do site.
        </p>
      </div>
    );
  }

  const principal = h.mediana ?? h.ultima;
  const cor = COR_FAIXA[faixaDoLighthouse(principal)];

  return (
    <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3.5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <span className="block text-[38px] font-bold tabular-nums leading-none tracking-tight"
            style={{ color: cor }}>
            {Math.round(principal as number)}
          </span>
          <span className="block text-[10.5px] text-muted-foreground mt-1.5">
            {textoDaBase(h)}
          </span>
          {!h.temBase && (
            <span className="block text-[10px] text-amber-700 mt-1 leading-snug max-w-[42ch]">
              Abaixo de {PISO_MEDICOES} medições não há leitura histórica — este é o valor da última
              medição, não o típico do site.
            </span>
          )}
        </div>

        {h.temBase && (
          <dl className="grid grid-cols-3 gap-x-5 gap-y-1 text-right">
            {([["Média", h.media], ["Melhor", h.melhor], ["Pior", h.pior]] as const).map(([r, v]) => (
              <div key={r}>
                <dt className="text-[9px] font-bold uppercase tracking-[0.09em] text-muted-foreground/60">
                  {r}
                </dt>
                <dd className="text-[15px] font-bold tabular-nums leading-none mt-0.5">
                  {v == null ? "—" : Math.round(v)}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      {/* A última medição, e o sinal quando ela se afasta do costume. */}
      {h.temBase && h.ultima != null && (
        <div className="flex items-center gap-2 text-[11.5px] border-t border-border pt-3">
          <span className="text-muted-foreground">Última medição:</span>
          <b className="tabular-nums">{Math.round(h.ultima)}</b>
          {h.ultimoDia && (
            <span className="text-muted-foreground/55 tabular-nums">
              {h.ultimoDia.slice(8, 10)}/{h.ultimoDia.slice(5, 7)}
            </span>
          )}
          {h.desvioNotavel && (
            <span className={`inline-flex items-center gap-1 font-semibold ${
              h.desvio! < 0 ? "text-destructive" : "text-emerald-600 dark:text-emerald-500"}`}>
              {h.desvio! < 0 ? <TrendingDown className="w-3.5 h-3.5" strokeWidth={2.4} />
                : <TrendingUp className="w-3.5 h-3.5" strokeWidth={2.4} />}
              {Math.abs(Math.round(h.desvio!))} pontos {h.desvio! < 0 ? "abaixo" : "acima"} do típico
            </span>
          )}
        </div>
      )}

      {h.medicoes.length >= 2 ? (
        <div className="border-t border-border pt-3">
          <div className="flex items-baseline justify-between gap-3 min-h-[16px]">
            <span className="text-[9.5px] font-bold uppercase tracking-[0.11em] text-muted-foreground/60">
              Medições
            </span>
            {/* O hover no padrão dos outros gráficos: data em tom de texto,
                valor na cor da série. */}
            {ativo != null && h.medicoes[ativo] && (
              <span className="flex items-center gap-2 text-[11px] tabular-nums">
                <span className="font-bold">
                  {h.medicoes[ativo].dia.slice(8, 10)}/{h.medicoes[ativo].dia.slice(5, 7)}
                </span>
                <span className="font-bold" style={{ color: cor }}>
                  {Math.round(h.medicoes[ativo].score)} pontos
                </span>
              </span>
            )}
          </div>
          <CurvaDeMedicoes medicoes={h.medicoes} mediana={h.mediana} cor={cor}
            ativo={ativo} aoEntrar={setAtivo} />
        </div>
      ) : (
        <p className="text-[10.5px] text-muted-foreground/60 border-t border-border pt-3 leading-snug">
          Com uma medição não há curva — há um número. A evolução aparece a partir da segunda coleta.
        </p>
      )}

      <p className="text-[10px] text-muted-foreground/55 leading-snug">
        Só medições do PageSpeed em estratégia <b>mobile</b> — a mesma do job diário. A diferença
        entre mobile e desktop no mesmo site passa de 30 pontos, e misturá-las faria a linha andar
        por causa da estratégia. Desvio a partir de {DESVIO_NOTAVEL} pontos é sinalizado; ele não
        muda o estado do site.
      </p>
    </div>
  );
}

/** As medições como elas são — nenhuma suavização. */
function CurvaDeMedicoes({ medicoes, mediana, cor, ativo, aoEntrar }: {
  medicoes: Array<{ dia: string; score: number }>;
  mediana: number | null; cor: string;
  ativo: number | null; aoEntrar: (i: number | null) => void;
}) {
  const W = 520, H = 112, ml = 26, mr = 10, mt = 10, mb = 16;
  const iw = W - ml - mr, ih = H - mt - mb;
  // Escala fixa 0–100: é a escala do Lighthouse. Ajustá-la ao min/max faria um
  // mergulho de 3 pontos parecer um desastre.
  const x = (i: number) => ml + (medicoes.length < 2 ? iw / 2 : (i / (medicoes.length - 1)) * iw);
  const y = (v: number) => mt + ih - (Math.max(0, Math.min(100, v)) / 100) * ih;
  const faixa = iw / Math.max(1, medicoes.length - 1);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img"
      aria-label="Medições de PageSpeed disponíveis" onMouseLeave={() => aoEntrar(null)}>
      {[100, 90, 50, 0].map((v) => (
        <g key={v}>
          <line x1={ml} x2={W - mr} y1={y(v)} y2={y(v)}
            className="stroke-[rgba(10,10,10,.06)] dark:stroke-[rgba(255,255,255,.08)]"
            strokeDasharray={v === 90 || v === 50 ? "3 4" : undefined} />
          <text x={ml - 5} y={y(v) + 3} textAnchor="end" fontSize={8.5}
            className="fill-muted-foreground/60">{v}</text>
        </g>
      ))}

      {/* A mediana como linha de referência: é dela que o número grande sai. */}
      {mediana != null && (
        <line x1={ml} x2={W - mr} y1={y(mediana)} y2={y(mediana)}
          stroke={cor} strokeWidth={1} strokeDasharray="4 3" opacity={0.5} />
      )}

      {medicoes.slice(1).map((m, k) => (
        <line key={m.dia} x1={x(k)} y1={y(medicoes[k].score)} x2={x(k + 1)} y2={y(m.score)}
          stroke={cor} strokeWidth={2.2} strokeLinecap="round" />
      ))}
      {medicoes.map((m, i) => (
        <circle key={`p${m.dia}`} cx={x(i)} cy={y(m.score)} r={ativo === i ? 4 : 2.8}
          fill={cor} stroke={ativo === i ? "white" : "none"} strokeWidth={1.5}
          opacity={ativo == null || ativo === i ? 1 : 0.45} />
      ))}
      {medicoes.map((m, i) => (
        <rect key={`h${m.dia}`} x={x(i) - faixa / 2} y={0} width={faixa} height={H}
          fill="transparent" style={{ cursor: "pointer" }} onMouseEnter={() => aoEntrar(i)} />
      ))}
      {medicoes.map((m, i) => (
        <text key={`r${m.dia}`} x={x(i)} y={H - 4} textAnchor="middle" fontSize={8.5}
          className="fill-muted-foreground/60">
          {m.dia.slice(8, 10)}/{m.dia.slice(5, 7)}
        </text>
      ))}
    </svg>
  );
}
