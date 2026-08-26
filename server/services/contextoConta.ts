/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Contexto da conta — FONTE ÚNICA para todas as IAs
 * ─────────────────────────────────────────────────────────────────────────────
 *  Antes cada IA (sugestões, resumo do header, chat, relatórios, jornalzinho)
 *  montava seu próprio bloco de contexto lendo tabelas diferentes — divergindo.
 *  Este builder lê TODAS as fontes de contexto por conta (account_context +
 *  client_context + client_notes) e devolve UM bloco de texto consistente. Toda
 *  IA deve injetar isto — nunca remontar.
 *
 *  O agency_context (conhecimento institucional da agência) foi aposentado: ficou
 *  vazio desde o início e não influenciava as análises. A tabela segue no banco,
 *  dormente, caso um dia queiramos reintroduzir o nível-agência de propósito.
 */
import {
  getAccountContext, listClientNotes, getAccountThresholds, contextosDeAchado,
} from "../db";
import { tiposDeNegocioParaIA } from "@shared/contextoOpcoes";
import { aplicarContextoAosAchados, blocoDosContextosDePonto } from "../../shared/contextoDoAchado";

export type MontarContextoOpts = {
  accountId: number;
  /** Mantido por compatibilidade dos chamadores; hoje não altera o contexto. */
  userId?: number | null;
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

/**
 * O bloco dos contextos de PONTO, para juntar ao prompt.
 *
 * Separado de `montarContextoDaConta` porque depende dos achados ATUAIS, e quem
 * os tem é a análise, não o builder. Um contexto guardado para alerta que já
 * saiu da lista descreve situação que não existe mais.
 *
 * Vive aqui, e não em cada análise, pelo mesmo motivo que o bloco da conta:
 * quatro embalagens eram quatro análises.
 */
export async function montarContextoDosPontos(
  accountId: number,
  achados: Array<{ chave: string; severidade: "critico" | "atencao" | "info" | "medicao"; texto: string }>,
): Promise<string> {
  if (!achados.length) return "";
  const linhas = await contextosDeAchado(accountId).catch(() => []);
  if (!linhas.length) return "";
  const ordenados = aplicarContextoAosAchados(
    achados, linhas.map((l) => ({ chave: l.chave, texto: l.texto })));
  return blocoDosContextosDePonto(ordenados);
}

/** Monta o bloco de contexto único da conta. Campos ausentes são omitidos. */
export async function montarContextoDaConta(opts: MontarContextoOpts): Promise<ContextoMontado> {
  const { accountId, incluirNotas = true, limiteNotas = 8, incluirSite = true } = opts;

  const [acc, notas, thr] = await Promise.all([
    getAccountContext(accountId),
    incluirNotas ? listClientNotes(accountId, limiteNotas) : Promise.resolve([]),
    getAccountThresholds(accountId).catch(() => null),
  ]);
  // Tabela única: os campos de site (objective/offer/…) já vivem em account_context.
  const cli = incluirSite ? acc : null;

  const L: string[] = [];
  const add = (cond: unknown, linha: string) => { if (cond) L.push(linha); };

  // Perfil e negócio (mescla account_context estruturado + client_context de site)
  // TODAS as categorias, e não a primeira: o campo passou a aceitar
  // combinações (B2B + SaaS, E-commerce + Marketplace), e a IA precisa receber
  // o conjunto inteiro para não descrever metade do negócio.
  add(tiposDeNegocioParaIA(acc?.businessType), `- Tipo de negócio: ${tiposDeNegocioParaIA(acc?.businessType)}`);
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

  // Perfil do cliente (fundido: perfil + objetivo + oferta na tela nova).
  add(acc?.clientProfile, `- Sobre o cliente e a oferta:\n${acc?.clientProfile}`);
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

  // Metas de performance da conta — a IA classifica Bom/Regular/Ruim por elas.
  const metas: string[] = [];
  if (thr?.roasGood || thr?.roasRegular) metas.push(`- ROAS: Bom ≥ ${thr.roasGood ?? "?"}x${thr.roasRegular ? ` · Regular ≥ ${thr.roasRegular}x` : ""} · abaixo = Ruim`);
  if (thr?.cpaGood || thr?.cpaRegular) metas.push(`- CPA (menor é melhor): Bom ≤ R$${thr.cpaGood ?? "?"}${thr.cpaRegular ? ` · Regular ≤ R$${thr.cpaRegular}` : ""} · acima = Ruim`);
  if (thr?.ctrGood || thr?.ctrRegular) metas.push(`- CTR: Bom ≥ ${thr.ctrGood ?? "?"}%${thr.ctrRegular ? ` · Regular ≥ ${thr.ctrRegular}%` : ""} · abaixo = Ruim`);
  const metasBlock = metas.length ? `## METAS DE PERFORMANCE DESTA CONTA (classifique Bom/Regular/Ruim por elas)\n${metas.join("\n")}` : "";

  const corpo = [accBlock, notasBlock].filter(Boolean).join("\n\n");
  const partes = [metasBlock, corpo].filter(Boolean);
  const texto = partes.length ? `${partes.join("\n\n")}\n---\n` : "";
  return { texto, temContexto: partes.length > 0 };
}
