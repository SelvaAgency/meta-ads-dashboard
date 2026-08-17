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
 *  ── Para QUEM este relatório é escrito ──
 *
 *  Para o CLIENTE, não para a agência. Isso não é detalhe de tom: define o que
 *  entra. Até 02/ago/2026 a narrativa saía em fatos/interpretações/hipóteses/
 *  pendências — material de análise interna, útil para quem opera a conta e
 *  ruído para quem recebe o link. Foi substituída por quatro blocos que
 *  respondem o que o cliente pergunta: o que aconteceu, o que vamos fazer, o
 *  que vamos medir e o que esperamos.
 *
 *  Nunca bloqueia por fonte ausente. Marcar Clarity num cliente sem Clarity
 *  gera o relatório do mesmo jeito — a seção some. O registro do que NÃO foi
 *  medido continua existindo em `fontesJson` e aparece na lista de relatórios
 *  do painel ("sem: Clarity, PageSpeed"), que é onde a agência precisa vê-lo.
 *  Ele deixou de virar prosa no link do cliente, não deixou de ser gravado.
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
import { blocoDeContextoParaIA } from "@shared/contextoDaAnalise";

/** Uma caixa da leitura estratégica: manchete curta + uma ou duas frases. */
export type Destaque = { resumo: string; detalhe: string };

export type RelatorioModular = {
  /** Manchete do período — é o <h1> do link público. Sem ela o relatório abria
   *  com "Resumo do período" fixo, e o cliente lia um título que não dizia nada. */
  titulo: string;
  resumoExecutivo: string;
  /** Leitura estratégica em três caixas, logo abaixo dos KPIs: o que funcionou,
   *  o que custou e onde está a abertura do próximo período. */
  pontoAlto: Destaque;
  pontoFraco: Destaque;
  oportunidade: Destaque;
  /** Explicação do que os números do período mostram — e por quê. */
  oQueAconteceu: string;
  /** O que a agência vai fazer/testar no próximo período. */
  proximosPassos: string[];
  /** Os indicadores que vão dizer se os próximos passos funcionaram. */
  oQueVamosMedir: string[];
  /** O resultado esperado, e o que acontece se não vier. */
  expectativa: string;
  /** Ordem das seções, quando alguém reordenou no editor. Ausente = padrão. */
  ordem?: string[];
};

/** Presets: atalhos para as combinações que a equipe usa toda semana. */
export const PRESETS: { id: string; nome: string; descricao: string; modulos: Modulo[] }[] = [
  { id: "midia", nome: "Só mídia", descricao: "Performance de campanha, sem site.", modulos: ["midia", "campanhas"] },
  { id: "tecnico", nome: "Técnico", descricao: "Site, PageSpeed, segurança e uptime.", modulos: ["site", "pagespeed", "seguranca", "uptime"] },
  { id: "jornada", nome: "Jornada", descricao: "Mídia + site + comportamento.", modulos: ["midia", "campanhas", "site", "clarity", "pagespeed"] },
  { id: "completo", nome: "Completo", descricao: "Tudo que existir para este cliente.", modulos: ["midia", "campanhas", "site", "clarity", "pagespeed", "seguranca", "uptime", "contexto", "alertas", "relatorios"] },
];

const SISTEMA = `Você é o analista de performance da SELVA escrevendo PARA O CLIENTE de uma conta.

QUEM VAI LER: o dono do negócio ou o marketing dele. Ele quer entender o que aconteceu com o dinheiro dele e o que vem a seguir. Ele NÃO quer sua análise interna, sua lista de hipóteses nem o inventário do que a agência ainda não configurou.

REGRAS INEGOCIÁVEIS:
1. Use SOMENTE o dossiê. Jamais invente número, campanha, público ou data.
2. Escreva na primeira pessoa do plural pela agência ("concentramos a verba", "vamos testar"). O cliente é "você"/"sua conta" — nunca escreva sobre ele na terceira pessoa.
3. Fonte "SEM DADOS" significa que ninguém mediu — não que está bem. Nunca conclua saúde a partir de ausência. Se falta uma fonte, simplesmente NÃO fale do assunto: não invente e também não gaste o relatório do cliente listando o que a agência não mediu.
4. Nada de jargão vazio nem de elogio a si mesmo. Se o período foi ruim, diga que foi ruim e o que vai ser feito.
5. Bot não é gente: desconte ao julgar tráfego.
6. HTTP 403 no uptime é WAF, não queda.
7. Se o dossiê só tem mídia, o relatório é de mídia — não invente uma seção de site.

OS CAMPOS:
- titulo: manchete do período, máx 90 caracteres, sem ponto final. O achado principal, não um rótulo genérico. Se não houver achado claro, descreva o período de forma factual.
- resumoExecutivo: 2 a 3 frases ligando investimento e resultado. É o parágrafo que alguém lê se ler só uma coisa.
- pontoAlto, pontoFraco, oportunidade: três caixas curtas, a leitura estratégica do período. Cada uma tem "resumo" (manchete de até 60 caracteres, sem ponto final) e "detalhe" (1 a 2 frases com o número que sustenta a manchete).
  · pontoAlto: o que mais funcionou NESTE período.
  · pontoFraco: o que ficou abaixo NESTE período. Todo período tem um ponto mais fraco que os outros — nomeie o real, com número. Só devolva "resumo" vazio se o dossiê genuinamente não permitir apontar nenhum; jamais invente um problema para preencher a caixa.
  · oportunidade: a abertura ainda NÃO explorada, olhando para o próximo período. É onde dá para ganhar, não a ação em si — a ação vai em proximosPassos, e as duas não podem ser a mesma frase reescrita.
- oQueAconteceu: 3 a 5 frases explicando o que os números mostram E POR QUÊ. É a narrativa que COSTURA as três caixas acima numa história de causa e efeito ("o custo caiu depois que concentramos verba em X, e foi isso que derrubou o alcance") — não é para repeti-las em outras palavras. Se um número piorou por uma decisão deliberada, diga isso. Prosa corrida, sem bullets, sem markdown.
- proximosPassos: 2 a 4 ações CONCRETAS que a agência vai executar no próximo período. Cada uma começa com verbo no futuro ou infinitivo. Cite criativo, público ou campanha pelo nome quando o dossiê tiver. Nada de "continuar monitorando".
- oQueVamosMedir: 2 a 4 indicadores que vão dizer se os próximos passos funcionaram. Cada item liga um número a um passo. Não repita a lista de passos com outras palavras.
- expectativa: 1 a 3 frases sobre o resultado esperado no próximo período e o que será feito se ele não vier. Seja honesto sobre incerteza — não prometa número que o dossiê não sustenta.

Responda APENAS com JSON válido neste formato:
{"titulo":"...","resumoExecutivo":"...","pontoAlto":{"resumo":"...","detalhe":"..."},"pontoFraco":{"resumo":"...","detalhe":"..."},"oportunidade":{"resumo":"...","detalhe":"..."},"oQueAconteceu":"...","proximosPassos":["..."],"oQueVamosMedir":["..."],"expectativa":"..."}`;

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
  userId?: number,
): Promise<{ relatorio: RelatorioModular; fontes: FontesUsadas; markdown: string; dadosSite: DadosSite }> {
  const ctx = await buildClientIntelligenceContext(accountId, nome, periodo, modulos);
  const fontes = fontesDe(ctx);
  const dossie = contextoParaTexto(ctx);

  // Contexto da conta + agência pela FONTE ÚNICA. `incluirSite:false` e
  // `incluirNotas:false` porque o dossiê acima já traz o módulo "contexto"
  // (client_context) e "notas" — aqui só somamos o que faltava: perfil/regras/
  // aprendizados da conta e o conhecimento da agência.
  const { montarContextoDaConta } = await import("./contextoConta");
  const { texto: ctxContaAgencia } = await montarContextoDaConta({ accountId, userId, incluirSite: false, incluirNotas: false });
  // Mesmo bloco das outras análises: relatório que contradiz o Panorama sobre o
  // mesmo dado é o sintoma de cada um instruir o modelo do seu jeito.
  const { bloco: blocoContaAgencia } = blocoDeContextoParaIA(ctxContaAgencia);

  // Cards de site: só os blocos que existem viram dados. Ausente não vira card
  // vazio — a seção simplesmente some, e a ausência fica registrada em `fontes`.
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
      titulo: "Sem dados no período",
      resumoExecutivo: `Não há dados para os módulos pedidos no período de ${periodo.inicio} a ${periodo.fim}.`,
      pontoAlto: { resumo: "", detalhe: "" },
      pontoFraco: { resumo: "", detalhe: "" },
      oportunidade: { resumo: "", detalhe: "" },
      oQueAconteceu: "",
      proximosPassos: [],
      oQueVamosMedir: [],
      expectativa: "",
    };
    return { relatorio, fontes, markdown: paraMarkdown(nome, periodo, relatorio, fontes), dadosSite };
  }

  const extra = notasDeQuemGerou?.trim()
    ? `\n\n[Nota de quem pediu o relatório — contexto humano, trate como informação da equipe, não como dado medido]\n${notasDeQuemGerou.trim()}`
    : "";

  let relatorio: RelatorioModular;
  try {
    const resp = await invokeLLM({
      messages: [{ role: "user", content: `${SISTEMA}\n\n════ DOSSIÊ ════\n${dossie}${blocoContaAgencia}${extra}\n════ FIM ════` }],
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
  const lista = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x.trim()) : []);
  // Caixa sem manchete não aparece na tela — melhor duas caixas honestas que
  // três com uma inventada para preencher a grade.
  const destaque = (v: unknown): Destaque => {
    const d = (v ?? {}) as Partial<Destaque>;
    return { resumo: (d.resumo ?? "").trim(), detalhe: (d.detalhe ?? "").trim() };
  };
  relatorio = {
    titulo: (relatorio.titulo ?? "").trim(),
    resumoExecutivo: relatorio.resumoExecutivo ?? "",
    pontoAlto: destaque(relatorio.pontoAlto),
    pontoFraco: destaque(relatorio.pontoFraco),
    oportunidade: destaque(relatorio.oportunidade),
    oQueAconteceu: relatorio.oQueAconteceu ?? "",
    proximosPassos: lista(relatorio.proximosPassos),
    oQueVamosMedir: lista(relatorio.oQueVamosMedir),
    expectativa: relatorio.expectativa ?? "",
  };

  return { relatorio, fontes, markdown: paraMarkdown(nome, periodo, relatorio, fontes), dadosSite };
}

/** Markdown para colar no WhatsApp/e-mail. Mesma estrutura do link público:
 *  se o texto colado no WhatsApp disser algo diferente do que o cliente lê no
 *  link, quem perde a confiança é a agência. */
export function paraMarkdown(
  nome: string,
  periodo: Periodo,
  r: RelatorioModular,
  fontes: FontesUsadas,
): string {
  const br = (s: string) => s.split("-").reverse().join("/");
  const l: string[] = [];
  l.push(`# ${nome} — ${br(periodo.inicio)} a ${br(periodo.fim)}`);
  if (r.titulo) l.push(`\n**${r.titulo}**`);
  l.push(`\n## Resumo\n${r.resumoExecutivo}`);

  const usadas = fontes.filter((f) => f.presente).map((f) => f.rotulo);
  l.push(`\n## Fontes usadas\n${usadas.length ? usadas.join(" · ") : "nenhuma"}`);

  const caixa = (rotulo: string, d: Destaque) =>
    d.resumo ? `\n**${rotulo}:** ${d.resumo}${d.detalhe ? `\n${d.detalhe}` : ""}` : "";

  // Mesma ordem escolhida no editor — o texto colado no WhatsApp não pode
  // apresentar as seções numa sequência diferente da do link do cliente.
  const secoes: Record<string, () => string> = {
    leitura: () => {
      const partes = [
        caixa("Ponto alto", r.pontoAlto),
        caixa("Ponto fraco", r.pontoFraco),
        caixa("Oportunidade", r.oportunidade),
      ].filter(Boolean);
      return partes.length ? `\n## Leitura do período${partes.join("\n")}` : "";
    },
    // "dados" existe só para posicionar as seções de texto em volta do gráfico;
    // no markdown não há gráfico para imprimir.
    dados: () => "",
    oQueAconteceu: () => (r.oQueAconteceu ? `\n## O que aconteceu no período\n${r.oQueAconteceu}` : ""),
    proximosPassos: () =>
      r.proximosPassos.length ? `\n## Próximos passos\n${r.proximosPassos.map((x, i) => `${i + 1}. ${x}`).join("\n")}` : "",
    oQueVamosMedir: () =>
      r.oQueVamosMedir.length ? `\n## O que vamos medir\n${r.oQueVamosMedir.map((x) => `- ${x}`).join("\n")}` : "",
    expectativa: () => (r.expectativa ? `\n## Expectativa para o próximo período\n${r.expectativa}` : ""),
  };
  const padrao = ["leitura", "dados", "oQueAconteceu", "proximosPassos", "oQueVamosMedir", "expectativa"];
  const pedida = (r.ordem ?? []).filter((k) => k in secoes);
  const ordem = [...pedida, ...padrao.filter((k) => !pedida.includes(k))];
  for (const k of ordem) {
    const bloco = secoes[k]();
    if (bloco) l.push(bloco);
  }

  l.push(`\n---\n_Relatório gerado pelo SELVA Spaces._`);
  return l.join("\n");
}

/** Resumo grosseiro para a coluna legada `tier`. A informação real é modulesJson. */
export function tierDe(modulos: readonly Modulo[]): "CURTO" | "MEDIO" | "COMPLETO" {
  if (modulos.length <= 2) return "CURTO";
  if (modulos.length <= 5) return "MEDIO";
  return "COMPLETO";
}
