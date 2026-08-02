/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Saúde da conta — o veredito-resumo, único para todo o produto
 * ─────────────────────────────────────────────────────────────────────────────
 *  Antes cada tela calculava "saúde" de um jeito (aiStatusColor da IA no header,
 *  regras do Panorama, o máximo dos dois no carrossel, saldo no BalanceCard…) e
 *  o mesmo cliente aparecia Saudável num canto e Crítico no outro.
 *
 *  Aqui vive UM motor e UM vocabulário. O princípio (refinado 02/08/2026):
 *  **a saúde é guiada pelos RESULTADOS (mídia/IA).** Uma conta com bons
 *  resultados é Saudável mesmo que tenha uma falha técnica — a falha não rebaixa
 *  o nível; ela vira um ADENDO ("saudável, mas há um problema técnico que pode
 *  estar piorando a performance"), surfaced à parte e levado em conta, sem mudar
 *  o veredito. O que impede avaliar resultado (token quebrado) puxa para Atenção.
 *
 *  Vocabulário único: Saudável · Atenção · Crítico · Sem dados. Nada de A/B/C.
 *  Ver docs/modelo-alertas-recomendacoes.md.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type NivelSaude = "saudavel" | "atencao" | "critico" | "sem_dados";

/** Adendo técnico: um achado (site/loja) que NÃO rebaixa o nível, mas avisa. */
export type AdendoSaude = { severidade: "critico" | "atencao"; texto: string };

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

function iaParaNivel(cor: CorIA): NivelSaude | null {
  if (cor === "green") return "saudavel";
  if (cor === "yellow") return "atencao";
  if (cor === "red") return "critico";
  return null;
}

export type SinaisSaude = {
  /** Classificação da IA sobre os RESULTADOS (aiStatusColor). Guia o veredito. */
  aiStatusColor?: CorIA;
  /** Token/conexão com erro — impede ver os resultados → puxa para Atenção. */
  temErroToken?: boolean;
};

/**
 * O veredito único da conta — guiado pelos RESULTADOS (mídia/IA). Achados
 * técnicos (site/loja) NÃO entram aqui: eles não rebaixam o nível, viram adendo
 * (ver AdendoSaude, montado no servidor a partir do Panorama).
 *
 *  · token com erro → Atenção (não dá pra confiar/ver o resultado; reconectar);
 *  · senão → a cor da IA sobre os resultados;
 *  · sem classificação da IA → Sem dados.
 */
export function saudeConta(s: SinaisSaude): NivelSaude {
  if (s.temErroToken) return "atencao";
  return iaParaNivel(s.aiStatusColor) ?? "sem_dados";
}
