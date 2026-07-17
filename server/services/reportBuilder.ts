/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Relatório modular
 * ─────────────────────────────────────────────────────────────────────────────
 *  Quem gera escolhe os módulos; o relatório sai com o que existir.
 *
 *  Mesma base do robô (buildClientIntelligenceContext) — de propósito. Robô e
 *  relatório dizendo coisas diferentes sobre o mesmo cliente no mesmo dia é o
 *  tipo de erro que faz a equipe parar de confiar nos dois.
 *
 *  ── O que este arquivo se recusa a fazer ──
 *
 *  Nunca bloqueia por fonte ausente. Marcar Clarity num cliente sem Clarity
 *  gera o relatório do mesmo jeito: a seção é omitida e a ausência vira
 *  PENDÊNCIA declarada. O relatório magro precisa dizer que é magro — senão,
 *  seis meses depois, ele é indistinguível de um cliente saudável.
 *
 *  Separa fato de interpretação de hipótese. Fato tem número. Interpretação
 *  liga números. Hipótese é palpite honesto, rotulado, com o dado que a
 *  resolveria. Misturar os três é o que transforma relatório em ficção.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { invokeLLM, extractTextContent } from "../_core/llm";
import { logger } from "../logger";
import {
  buildClientIntelligenceContext,
  contextoParaTexto,
  fontesDe,
  type Modulo,
  type Periodo,
  type FontesUsadas,
} from "./clientIntelligence";

export type RelatorioModular = {
  resumoExecutivo: string;
  fatos: string[];
  interpretacoes: string[];
  hipoteses: string[];
  recomendacoes: { acao: string; porque: string; prioridade: "alta" | "media" | "baixa" }[];
  pendencias: string[];
};

/** Presets: atalhos para as combinações que a equipe usa toda semana. */
export const PRESETS: { id: string; nome: string; descricao: string; modulos: Modulo[] }[] = [
  { id: "midia", nome: "Só mídia", descricao: "Performance de campanha, sem site.", modulos: ["midia", "campanhas"] },
  { id: "tecnico", nome: "Técnico", descricao: "Site, PageSpeed, segurança e uptime.", modulos: ["site", "pagespeed", "seguranca", "uptime"] },
  { id: "jornada", nome: "Jornada", descricao: "Mídia + site + comportamento.", modulos: ["midia", "campanhas", "site", "clarity", "pagespeed"] },
  { id: "completo", nome: "Completo", descricao: "Tudo que existir para este cliente.", modulos: ["midia", "campanhas", "site", "clarity", "pagespeed", "seguranca", "uptime", "contexto", "alertas", "relatorios"] },
];

const SISTEMA = `Você é o analista de performance da SELVA escrevendo um relatório sobre UM cliente.

REGRAS INEGOCIÁVEIS:
1. Use SOMENTE o dossiê. Jamais invente número, página, campanha ou data.
2. Fonte "SEM DADOS" significa que NINGUÉM MEDIU — não que está bem. Nunca conclua saúde a partir de ausência. Sem Clarity você não sabe como as pessoas se comportam; sem PageSpeed você não sabe se o site é lento.
3. Separe rigorosamente:
   - fatos: afirmações com número do dossiê. Cite a fonte entre colchetes.
   - interpretacoes: o que os fatos, cruzados, sugerem. Ainda ancorado em número.
   - hipoteses: palpite honesto. Diga QUAL DADO confirmaria ou derrubaria.
   - recomendacoes: ação concreta, com o porquê e prioridade.
   - pendencias: o que falta medir/preencher e o que isso impede de saber.
4. Português do Brasil, direto. Sem jargão vazio.
5. Bot não é gente: desconte ao julgar tráfego.
6. HTTP 403 no uptime é WAF, não queda.
7. Se o dossiê só tem mídia, o relatório é de mídia — não invente uma seção de site.

Responda APENAS com JSON válido neste formato:
{"resumoExecutivo":"...","fatos":["..."],"interpretacoes":["..."],"hipoteses":["..."],"recomendacoes":[{"acao":"...","porque":"...","prioridade":"alta|media|baixa"}],"pendencias":["..."]}`;

/**
 * Dados de SITE já estruturados para virarem cards no relatório visual —
 * extraídos dos blocos do contexto (só os presentes). Separado da narrativa
 * porque card é número, não prosa: o LCP vira um número grande, não uma frase.
 */
export type DadosSite = {
  pagespeed?: Record<string, unknown>;
  seguranca?: Record<string, unknown>;
  uptime?: Record<string, unknown>;
  clarity?: Record<string, unknown>;
};

export async function gerarRelatorioModular(
  accountId: number,
  nome: string,
  periodo: Periodo,
  modulos: readonly Modulo[],
  notasDeQuemGerou?: string,
): Promise<{ relatorio: RelatorioModular; fontes: FontesUsadas; markdown: string; dadosSite: DadosSite }> {
  const ctx = await buildClientIntelligenceContext(accountId, nome, periodo, modulos);
  const fontes = fontesDe(ctx);
  const dossie = contextoParaTexto(ctx);

  // Cards de site: só os blocos que existem viram dados. Ausente não vira card
  // vazio — vira pendência, lá embaixo.
  const dadosSite: DadosSite = {
    pagespeed: ctx.pagespeed.presente ? (ctx.pagespeed.dados as { metricas?: Record<string, unknown> })?.metricas : undefined,
    seguranca: ctx.seguranca.presente ? (ctx.seguranca.dados as { metricas?: Record<string, unknown> })?.metricas : undefined,
    uptime: ctx.uptime.presente ? (ctx.uptime.dados as { metricas?: Record<string, unknown> })?.metricas : undefined,
    clarity: ctx.clarity.presente ? (ctx.clarity.dados as Record<string, unknown>) : undefined,
  };

  const nenhumaFonte = fontes.every((f) => !f.presente);
  if (nenhumaFonte) {
    // Sem nenhuma fonte não há o que interpretar. Chamar o LLM aqui só
    // produziria prosa bonita sobre o nada — e custaria dinheiro para isso.
    const relatorio: RelatorioModular = {
      resumoExecutivo: `Não há dados para os módulos pedidos no período de ${periodo.inicio} a ${periodo.fim}.`,
      fatos: [],
      interpretacoes: [],
      hipoteses: [],
      recomendacoes: [],
      pendencias: fontes.map((f) => `${f.rotulo}: ${f.porque}`),
    };
    return { relatorio, fontes, markdown: paraMarkdown(nome, periodo, relatorio, fontes), dadosSite };
  }

  const extra = notasDeQuemGerou?.trim()
    ? `\n\n[Nota de quem pediu o relatório — contexto humano, trate como informação da equipe, não como dado medido]\n${notasDeQuemGerou.trim()}`
    : "";

  let relatorio: RelatorioModular;
  try {
    const resp = await invokeLLM({
      messages: [{ role: "user", content: `${SISTEMA}\n\n════ DOSSIÊ ════\n${dossie}${extra}\n════ FIM ════` }],
      // 4000: o teto antigo de 1600 cortava o JSON no meio e o parse falhava em
      // silêncio, fazendo o relatório parecer vazio em vez de quebrado.
      maxTokens: 4000,
      response_format: { type: "json_object" },
    });
    const bruto = extractTextContent(resp).trim();
    const jsonTexto = bruto.slice(bruto.indexOf("{"), bruto.lastIndexOf("}") + 1);
    relatorio = JSON.parse(jsonTexto) as RelatorioModular;
  } catch (e) {
    // Falhar alto: relatório vazio silencioso é pior que erro visível.
    logger.error(`[Relatório] Falha ao gerar (conta ${accountId}): ${(e as Error).message}`);
    throw new Error("Não consegui gerar o relatório agora. Tente de novo em instantes.");
  }

  // O modelo pode omitir campos; a tela não pode quebrar por isso.
  relatorio = {
    resumoExecutivo: relatorio.resumoExecutivo ?? "",
    fatos: relatorio.fatos ?? [],
    interpretacoes: relatorio.interpretacoes ?? [],
    hipoteses: relatorio.hipoteses ?? [],
    recomendacoes: relatorio.recomendacoes ?? [],
    pendencias: relatorio.pendencias ?? [],
  };

  // As pendências não dependem do modelo: quem faltou, faltou. Garante que
  // toda fonte ausente apareça, mesmo se o LLM esquecer de citá-la.
  const faltando = fontes.filter((f) => !f.presente).map((f) => `${f.rotulo}: ${f.porque}`);
  for (const p of faltando) {
    if (!relatorio.pendencias.some((x) => x.toLowerCase().includes(p.split(":")[0].toLowerCase()))) {
      relatorio.pendencias.push(p);
    }
  }

  return { relatorio, fontes, markdown: paraMarkdown(nome, periodo, relatorio, fontes), dadosSite };
}

/** Markdown para colar no WhatsApp/e-mail. */
export function paraMarkdown(
  nome: string,
  periodo: Periodo,
  r: RelatorioModular,
  fontes: FontesUsadas,
): string {
  const br = (s: string) => s.split("-").reverse().join("/");
  const l: string[] = [];
  l.push(`# ${nome} — ${br(periodo.inicio)} a ${br(periodo.fim)}`);
  l.push(`\n## Resumo\n${r.resumoExecutivo}`);

  const usadas = fontes.filter((f) => f.presente).map((f) => f.rotulo);
  l.push(`\n## Fontes usadas\n${usadas.length ? usadas.join(" · ") : "nenhuma"}`);

  if (r.fatos.length) l.push(`\n## Fatos\n${r.fatos.map((x) => `- ${x}`).join("\n")}`);
  if (r.interpretacoes.length) l.push(`\n## O que os dados sugerem\n${r.interpretacoes.map((x) => `- ${x}`).join("\n")}`);
  if (r.hipoteses.length) l.push(`\n## Hipóteses (a confirmar)\n${r.hipoteses.map((x) => `- ${x}`).join("\n")}`);
  if (r.recomendacoes.length) {
    l.push(`\n## Recomendações\n${r.recomendacoes.map((x) => `- **[${x.prioridade}]** ${x.acao}\n  _${x.porque}_`).join("\n")}`);
  }
  if (r.pendencias.length) l.push(`\n## Pendências de dados\n${r.pendencias.map((x) => `- ${x}`).join("\n")}`);
  l.push(`\n---\n_Relatório gerado pelo SELVA Spaces. As pendências acima indicam o que NÃO foi medido — não que esteja tudo certo._`);
  return l.join("\n");
}

/** Resumo grosseiro para a coluna legada `tier`. A informação real é modulesJson. */
export function tierDe(modulos: readonly Modulo[]): "CURTO" | "MEDIO" | "COMPLETO" {
  if (modulos.length <= 2) return "CURTO";
  if (modulos.length <= 5) return "MEDIO";
  return "COMPLETO";
}
