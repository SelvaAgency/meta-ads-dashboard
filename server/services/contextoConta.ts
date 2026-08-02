/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Contexto da conta — FONTE ÚNICA para todas as IAs
 * ─────────────────────────────────────────────────────────────────────────────
 *  Antes cada IA (sugestões, resumo do header, chat, relatórios, jornalzinho)
 *  montava seu próprio bloco de contexto lendo tabelas diferentes — divergindo.
 *  Este builder lê TODAS as fontes de contexto por conta (account_context +
 *  client_context + client_notes) e, opcionalmente, o agency_context, e devolve
 *  UM bloco de texto consistente. Toda IA deve injetar isto — nunca remontar.
 *
 *  Fase 1 da centralização de contexto: as 3 tabelas continuam no banco; aqui
 *  só unificamos a LEITURA. A UI única e a unificação das tabelas vêm depois.
 */
import { getAccountContext, getAgencyContext, listClientNotes } from "../db";

export type MontarContextoOpts = {
  accountId: number;
  /** userId dono do agency_context (conhecimento da agência). Sem ele, não inclui. */
  userId?: number | null;
  /** Incluir bloco da agência (default: true quando há userId). */
  incluirAgencia?: boolean;
  /** Incluir notas recentes da equipe (default: true). */
  incluirNotas?: boolean;
  limiteNotas?: number;
  /**
   * Incluir os campos vindos do client_context (contexto de SITE: objetivo,
   * oferta, tracking, hipóteses, etc.). Default: true. Os relatórios já têm um
   * módulo "contexto" próprio com esses campos, então passam `false` para não
   * duplicar — recebendo só account_context + agência + notas.
   */
  incluirSite?: boolean;
};

export type ContextoMontado = { texto: string; temContexto: boolean };

/** Monta o bloco de contexto único da conta. Campos ausentes são omitidos. */
export async function montarContextoDaConta(opts: MontarContextoOpts): Promise<ContextoMontado> {
  const { accountId, userId, incluirNotas = true, limiteNotas = 8, incluirSite = true } = opts;
  const incluirAgencia = opts.incluirAgencia ?? !!userId;

  const [acc, ag, notas] = await Promise.all([
    getAccountContext(accountId),
    incluirAgencia && userId ? getAgencyContext(userId) : Promise.resolve(null),
    incluirNotas ? listClientNotes(accountId, limiteNotas) : Promise.resolve([]),
  ]);
  // Tabela única: os campos de site (objective/offer/…) já vivem em account_context.
  const cli = incluirSite ? acc : null;

  const L: string[] = [];
  const add = (cond: unknown, linha: string) => { if (cond) L.push(linha); };

  // Perfil e negócio (mescla account_context estruturado + client_context de site)
  add(acc?.businessType, `- Tipo de negócio: ${acc?.businessType}`);
  add(acc?.ticketRange, `- Ticket médio: ${acc?.ticketRange}`);
  add(cli?.objective, `- Objetivo: ${cli?.objective}`);
  add(cli?.offer, `- Oferta: ${cli?.offer}`);
  const publico = [cli?.audience, acc?.audienceAge, acc?.audienceGender, acc?.audienceGeo].filter(Boolean).join(" · ");
  add(publico, `- Público: ${publico}`);

  // Regras e restrições — respeitar sempre
  const restr: string[] = [];
  if (acc?.operationalRules) restr.push(acc.operationalRules);
  if (acc?.restrictions?.length) restr.push(...acc.restrictions);
  if (cli?.constraints) restr.push(cli.constraints);
  add(restr.length, `- Regras e restrições (RESPEITE SEMPRE):\n${restr.map((r) => `  • ${r}`).join("\n")}`);

  // Foco do momento — prioridade máxima
  add(acc?.focusMoment, `- FOCO DO MOMENTO (prioridade máxima — toda análise deve considerar):\n${acc?.focusMoment}`);

  // Tracking e conversões (site)
  const convEv = (cli?.conversionEventsJson ?? []) as string[];
  const pages = (cli?.importantPagesJson ?? []) as string[];
  add(convEv.length, `- Eventos de conversão esperados: ${convEv.join(", ")}`);
  add(cli?.trackingNotes, `- Tracking: ${cli?.trackingNotes}`);
  add(pages.length, `- Páginas importantes: ${pages.join(", ")}`);

  // Hipóteses / testes / próximos passos
  add(cli?.currentHypotheses, `- Hipóteses atuais: ${cli?.currentHypotheses}`);
  add(cli?.previousTests, `- Já testado: ${cli?.previousTests}`);
  add(cli?.nextSteps, `- Próximos passos: ${cli?.nextSteps}`);

  // Perfil livre / contexto adicional
  add(acc?.clientProfile, `- Perfil do cliente:\n${acc?.clientProfile}`);
  add(acc?.freeInput, `- Contexto adicional:\n${acc?.freeInput}`);
  add(acc?.quickContext, `- Observação recente da equipe (input rápido):\n${acc?.quickContext}`);

  // Eventos e sazonalidades
  add(acc?.events?.length, `- Eventos e sazonalidades:\n${(acc?.events ?? []).map((e) => `  • ${e.date} [${e.type}] ${e.description}`).join("\n")}`);

  // Aprendizados: primeiro os consolidados (padrões duráveis), depois os recentes.
  add(acc?.learningsConsolidated, `### Aprendizados consolidados (padrões duráveis desta conta):\n${acc?.learningsConsolidated}`);
  add(acc?.learnings, `### Aprendizados recentes (eventos automáticos):\n${acc?.learnings}`);

  const accBlock = L.length ? `## CONTEXTO DESTA CONTA\n${L.join("\n")}` : "";

  const notasBlock = (notas && notas.length)
    ? `### Notas recentes da equipe:\n${notas.map((n) => `- ${new Date(n.createdAt).toLocaleDateString("pt-BR")}: ${n.body}`).join("\n")}`
    : "";

  const agBlock = (ag && (ag.benchmarks || ag.patterns || ag.institutionalKnowledge))
    ? `## CONTEXTO DA AGÊNCIA (SELVA — conhecimento institucional)\n${[
        ag.benchmarks && `### Benchmarks internos:\n${ag.benchmarks}`,
        ag.patterns && `### Padrões nas contas:\n${ag.patterns}`,
        ag.institutionalKnowledge && `### Conhecimento institucional:\n${ag.institutionalKnowledge}`,
      ].filter(Boolean).join("\n")}`
    : "";

  const corpo = [accBlock, notasBlock].filter(Boolean).join("\n\n");
  const partes = [agBlock, corpo].filter(Boolean);
  const texto = partes.length ? `${partes.join("\n\n")}\n---\n` : "";
  return { texto, temContexto: partes.length > 0 };
}
