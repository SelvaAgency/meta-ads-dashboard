/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  O robô — "perguntar sobre este cliente"
 * ─────────────────────────────────────────────────────────────────────────────
 *  UM analista, não dois. Ele enxerga a jornada inteira:
 *
 *      mídia paga → campanhas → site → comportamento → performance técnica
 *      → segurança/uptime → conversão → recomendação
 *
 *  O contexto vem de buildClientIntelligenceContext, o MESMO que alimenta o
 *  gerador de relatórios. É de propósito: robô e relatório não podem dizer
 *  coisas diferentes sobre o mesmo cliente no mesmo dia.
 *
 *  Três regras que definem o produto:
 *   1. Nunca inventar. Sem dado, a resposta é "não temos isso" — não um palpite
 *      plausível, que é justamente o que destruiria a confiança na ferramenta.
 *   2. Citar a fonte de cada afirmação.
 *   3. Não age. Pode sugerir; executar é decisão de gente.
 *
 *  Isolamento: tudo é buscado por accountId. O contexto de um cliente nunca
 *  entra na conversa de outro.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { invokeLLM, extractTextContent } from "../_core/llm";
import { logger } from "../logger";
import {
  buildClientIntelligenceContext,
  contextoParaTexto,
  fontesDe,
  type FontesUsadas,
} from "./clientIntelligence";

export type FontesChat = FontesUsadas;

const hoje = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const atras = (n: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(Date.now() - n * 86400000));

/** Janela padrão do chat: 30 dias. Longa o bastante para tendência, curta o bastante para ser "agora". */
const janela = () => ({ inicio: atras(29), fim: hoje() });

const SISTEMA = `Você é o analista de performance da SELVA respondendo sobre UM cliente específico.

Você enxerga a jornada inteira: mídia paga → site → comportamento → performance técnica → conversão.
Não é um "analista de mídia" nem um "analista de site": é um só, que sabe cruzar os dois.

REGRAS INEGOCIÁVEIS:
1. Use SOMENTE os dados do dossiê. Jamais invente número, página, campanha, data ou fato. Se não está no dossiê, você NÃO sabe.
2. Fonte marcada "SEM DADOS" significa que NINGUÉM OLHOU — não que está tudo bem. Nunca conclua que algo está saudável a partir da ausência de dado. Sem Clarity você não sabe como as pessoas se comportam no site; sem PageSpeed você não sabe se o site é lento. Diga isso.
3. CITE A FONTE de cada afirmação com um marcador: [Mídia paga], [Campanhas], [Clarity], [PageSpeed], [Segurança], [Uptime], [Contexto], [Notas], [Alertas] ou [Relatório].
4. Você NÃO executa nada. Pode recomendar; quem decide e age é a equipe.
5. Diferencie FATO de HIPÓTESE. Fato tem número no dossiê. Hipótese você rotula explicitamente como hipótese — e diz que dado resolveria a dúvida.
6. Português do Brasil, direto, frases curtas. Sem jargão vazio e sem encher linguiça.
7. Sessões de bot não são gente: desconte ao julgar se o tráfego é qualificado.
8. O histórico do Clarity é irrecuperável (a API só dá 3 dias) — nunca sugira "buscar os dias que faltam".

COMO RACIOCINAR SOBRE A JORNADA (só quando os dados existirem):
- CTR alto + poucas sessões no site → a perda está entre o clique e o carregamento: verifique LCP e tracking.
- Sessões boas + scroll baixo → desalinhamento entre a promessa do anúncio e a primeira dobra.
- Rage clicks / cliques mortos → fricção de UX, não problema de mídia.
- LCP alto → parte de quem clicou desiste antes de ver a página. Isso encarece o CPA sem culpa da campanha.
- Site fora do ar ou certificado inválido → o tráfego pago está sendo desperdiçado agora.
- HTTP 403 no uptime é WAF, NÃO é queda.
Se faltar a fonte que sustenta um desses raciocínios, diga que a hipótese existe mas não pode ser confirmada — e qual fonte confirmaria.`;

export async function perguntarSobreCliente(
  accountId: number,
  nome: string,
  pergunta: string,
  historico: { role: "user" | "assistant"; content: string }[],
): Promise<{ resposta: string; fontes: FontesChat }> {
  const ctx = await buildClientIntelligenceContext(accountId, nome, janela());
  const dossie = contextoParaTexto(ctx);
  const fontes = fontesDe(ctx);

  // O histórico entra como conversa; o dossiê é reinjetado a cada pergunta para
  // a resposta refletir o dado de agora, não o de quando a conversa começou.
  const messages = [
    { role: "user" as const, content: `${SISTEMA}\n\n════ DOSSIÊ DO CLIENTE ════\n${dossie}\n════ FIM DO DOSSIÊ ════\n\nResponda às perguntas a seguir apenas com base nele.` },
    { role: "assistant" as const, content: "Entendido. Vou responder só com o que está no dossiê, citando a fonte, separando fato de hipótese, e dizer claramente quando faltar dado — sem tratar ausência de dado como sinal de que está tudo bem." },
    ...historico.slice(-8), // janela curta: conversa longa não deve empurrar o dossiê para fora
    { role: "user" as const, content: pergunta },
  ];

  try {
    const resp = await invokeLLM({ messages, maxTokens: 1500 });
    const texto = extractTextContent(resp).trim();
    if (!texto) throw new Error("resposta vazia");
    return { resposta: texto, fontes };
  } catch (e) {
    logger.error(`[Chat] Falha ao responder (conta ${accountId}): ${(e as Error).message}`);
    throw new Error("Não consegui responder agora. Tente de novo em instantes.");
  }
}

/**
 * Só quais fontes existem — sem chamar o LLM. A tela usa isto para mostrar as
 * pendências e sugerir perguntas que ESTE cliente consegue responder.
 */
export async function montarFontesChat(accountId: number, nome = ""): Promise<{ fontes: FontesChat }> {
  const ctx = await buildClientIntelligenceContext(accountId, nome, janela());
  return { fontes: fontesDe(ctx) };
}

const tem = (f: FontesChat, chave: string) => f.some((x) => x.chave === chave && x.presente);

/** Sugestões de pergunta — ancoradas no que ESTE cliente tem de fato. */
export function sugestoesPara(fontes: FontesChat): string[] {
  const s: string[] = [];
  const midia = tem(fontes, "midia");
  const site = tem(fontes, "pagespeed") || tem(fontes, "seguranca") || tem(fontes, "uptime");

  if (midia && (site || tem(fontes, "clarity"))) {
    s.push("O problema parece ser mídia ou site?");
    s.push("O site pode estar prejudicando as campanhas?");
  }
  if (tem(fontes, "clarity")) s.push("O que os dados de Clarity mostram?");
  if (midia && !tem(fontes, "clarity")) s.push("Como está a performance de mídia deste cliente?");
  if (site && !midia) s.push("O que a performance técnica do site indica?");
  if (tem(fontes, "relatorios")) s.push("O que mudou desde o último relatório?");
  s.push("O que priorizar para melhorar conversão?");
  s.push("Quais testes faria esta semana?");
  return s.slice(0, 5);
}
