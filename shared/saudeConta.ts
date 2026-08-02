/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Saúde da conta — o veredito-resumo, único para todo o produto
 * ─────────────────────────────────────────────────────────────────────────────
 *  Antes cada tela calculava "saúde" de um jeito (aiStatusColor da IA no header,
 *  regras do Panorama, o máximo dos dois no carrossel, saldo no BalanceCard…) e
 *  o mesmo cliente aparecia Saudável num canto e Crítico no outro.
 *
 *  Aqui vive UM motor e UM vocabulário. O princípio (ratificado 02/08/2026):
 *  **as regras definem o piso, a IA refina o resto.** Um fato inegável medido
 *  por regra (site fora do ar, alerta crítico) força o nível para baixo; onde não
 *  há fato duro, a classificação da IA (aiStatusColor) decide.
 *
 *  Vocabulário único: Saudável · Atenção · Crítico · Sem dados. Nada de A/B/C.
 *  Ver docs/modelo-alertas-recomendacoes.md.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type NivelSaude = "saudavel" | "atencao" | "critico" | "sem_dados";

/** Severidade para "o pior vence". Sem dados é o mais leve (ausência de sinal). */
const SEV: Record<NivelSaude, number> = { critico: 3, atencao: 2, saudavel: 1, sem_dados: 0 };

export const SAUDE_CFG: Record<NivelSaude, {
  label: string;
  /** Cor sólida (hex) para bolinhas, barras e bordas. */
  cor: string;
  /** Classes Tailwind para chips/badges (texto + fundo + borda). */
  chip: string;
  /** Classe só de texto. */
  texto: string;
}> = {
  saudavel:  { label: "Saudável",  cor: "#1D9E75", chip: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/30", texto: "text-emerald-600 dark:text-emerald-400" },
  atencao:   { label: "Atenção",   cor: "#EF9F27", chip: "text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/30",       texto: "text-amber-600 dark:text-amber-400" },
  critico:   { label: "Crítico",   cor: "#E24B4A", chip: "text-red-600 dark:text-red-400 bg-red-500/10 border-red-500/30",               texto: "text-red-600 dark:text-red-400" },
  sem_dados: { label: "Sem dados", cor: "rgba(120,120,120,0.55)", chip: "text-muted-foreground bg-muted/40 border-border",               texto: "text-muted-foreground" },
};

/** Ordem canônica (pior → melhor → neutro) para barras e listas. */
export const ORDEM_SAUDE: NivelSaude[] = ["critico", "atencao", "saudavel", "sem_dados"];

export type CorIA = "green" | "yellow" | "red" | null | undefined;
export type NivelPanorama = "critico" | "atencao" | "ok" | "sem_dados" | null | undefined;

function iaParaNivel(cor: CorIA): NivelSaude | null {
  if (cor === "green") return "saudavel";
  if (cor === "yellow") return "atencao";
  if (cor === "red") return "critico";
  return null;
}
function panoramaParaNivel(n: NivelPanorama): NivelSaude | null {
  if (n === "ok") return "saudavel";
  if (n === "atencao") return "atencao";
  if (n === "critico") return "critico";
  return null; // sem_dados/null = sem sinal, não conta
}

export type SinaisSaude = {
  /** Classificação da IA (aiStatusColor), quando houver. */
  aiStatusColor?: CorIA;
  /** Nível cross-fonte medido por regra (Panorama: site/GA4/loja). */
  panoramaNivel?: NivelPanorama;
  /** Há algum alerta CRÍTICO ativo nesta conta (fato duro). */
  temAlertaCritico?: boolean;
  /** Token/conexão da conta com erro — mídia fica ilegível (fato acionável). */
  temErroToken?: boolean;
};

/**
 * O veredito único da conta. "Pior vence" entre os sinais disponíveis:
 *  · alerta crítico ou regra crítica → Crítico (piso inegável);
 *  · token com erro → ao menos Atenção (fonte quebrada é acionável) e a mídia
 *    da IA é ignorada (não dá pra confiar na leitura);
 *  · sem nenhum sinal avaliável → Sem dados.
 */
export function saudeConta(s: SinaisSaude): NivelSaude {
  const sinais: NivelSaude[] = [];

  if (s.temErroToken) {
    sinais.push("atencao"); // reconectar é uma pendência real; mídia fica de fora
  } else {
    const ia = iaParaNivel(s.aiStatusColor);
    if (ia) sinais.push(ia);
  }

  const pano = panoramaParaNivel(s.panoramaNivel);
  if (pano) sinais.push(pano);

  if (s.temAlertaCritico) sinais.push("critico");

  if (sinais.length === 0) return "sem_dados";
  return sinais.reduce((pior, n) => (SEV[n] > SEV[pior] ? n : pior), "sem_dados");
}
