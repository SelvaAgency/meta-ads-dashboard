/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Abas da seção Site — nomes novos, links antigos continuam funcionando
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  A seção Site tinha oito abas; cinco eram painéis de dado e viraram três:
 *  Resumo, Performance e Técnico. Relatórios, Contexto e Perguntar são
 *  ferramentas e ficaram como estavam.
 *
 *  O problema é que os alertas gravam o destino no banco, em texto:
 *
 *      suggestedAction: "/site?account=4&aba=clarity"
 *
 *  Havia 14 alertas NÃO LIDOS apontando para `clarity` e `seguranca` quando
 *  esta mudança foi feita. Não dá para reescrever o passado — e um alerta que
 *  abre na aba errada é pior do que alerta nenhum, porque ensina a ignorar.
 *
 *  Por isso o nome antigo continua sendo entendido para sempre, e leva à aba
 *  nova COM a seção certa já aberta.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type AbaSite = "resumo" | "performance" | "tecnico" | "relatorios" | "contexto" | "chat";

/** Seções recolhíveis dentro das abas de dado. */
export type SecaoSite = "comportamento" | "paginas" | "carregamento" | "seguranca" | "disponibilidade";

export const ABAS_SITE: AbaSite[] = ["resumo", "performance", "tecnico", "relatorios", "contexto", "chat"];

export const ROTULO_ABA: Record<AbaSite, string> = {
  resumo: "Resumo",
  performance: "Performance",
  tecnico: "Técnico",
  relatorios: "Relatórios",
  contexto: "Contexto",
  chat: "Perguntar",
};

export type Destino = { aba: AbaSite; secao?: SecaoSite };

/**
 * Traduz o `?aba=` da URL — nome novo OU antigo — no destino real.
 *
 * Desconhecido cai em Resumo: um link torto abre a seção, não uma tela vazia.
 */
export function destinoDaAba(valor: string | null | undefined): Destino {
  if (!valor) return { aba: "resumo" };
  const v = valor.trim().toLowerCase();

  // Nomes novos, diretos.
  if ((ABAS_SITE as string[]).includes(v)) return { aba: v as AbaSite };

  // Nomes antigos → aba nova + a seção onde o conteúdo foi parar.
  const legado: Record<string, Destino> = {
    visao: { aba: "resumo" },
    clarity: { aba: "performance", secao: "comportamento" },
    perf: { aba: "tecnico", secao: "carregamento" },
    performance_tecnica: { aba: "tecnico", secao: "carregamento" },
    seguranca: { aba: "tecnico", secao: "seguranca" },
    uptime: { aba: "tecnico", secao: "disponibilidade" },
  };
  return legado[v] ?? { aba: "resumo" };
}

/** Seções que cada aba de dado contém — usado para abrir a seção do deep-link. */
export const SECOES_DA_ABA: Partial<Record<AbaSite, SecaoSite[]>> = {
  performance: ["comportamento", "paginas"],
  tecnico: ["carregamento", "seguranca", "disponibilidade"],
};
