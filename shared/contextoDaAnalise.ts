/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  O contexto da equipe é INSTRUÇÃO de leitura, não nota de rodapé
 * ─────────────────────────────────────────────────────────────────────────────
 *  Puro, compartilhado. Ele existe por causa de um bug que não era de
 *  encanamento: o contexto SEMPRE chegou ao prompt. `montarContextoDaConta` é
 *  fonte única desde a centralização, e as quatro IAs a chamavam.
 *
 *  O que faltava era AUTORIDADE. Cada uma embalava o mesmo texto com uma frase
 *  própria, e a mais usada dizia "pode explicar variações que os números não
 *  mostram". Isso descreve comentário de cor — algo que enriquece a leitura sem
 *  mudá-la. Diante de "essa compra foi teste, desconsidere", o modelo continuava
 *  contando a conversão e mencionando o teste como curiosidade, porque foi
 *  exatamente isso que o prompt pediu.
 *
 *  ── Quatro embalagens eram quatro análises ─────────────────────────────────
 *  Panorama, plano técnico, relatório e sugestões escreviam o cabeçalho do
 *  contexto cada um do seu jeito. Mesmo texto, instruções diferentes, conclusões
 *  divergentes sobre o mesmo dado — e nada no código dizia que elas deviam
 *  concordar. Agora existe uma função, e é ela que garante o acordo.
 *
 *  ── O dado bruto não é apagado, e isso é a espinha ─────────────────────────
 *  O contexto qualifica; ele não edita. A cadeia é
 *  DADO → CONTEXTO → INTERPRETAÇÃO, e cada elo continua legível: o número
 *  segue no banco, segue citável, e se o contexto for removido a análise volta a
 *  considerá-lo. Uma camada que apagasse o dado destruiria a rastreabilidade e
 *  tornaria impossível descobrir que a qualificação estava errada.
 *
 *  ── Nem virar fato universal ───────────────────────────────────────────────
 *  Contexto é o que a equipe afirma, não o que o sistema mediu. Por isso a
 *  diretriz de atribuição: a análise pode dizer "segundo o contexto informado",
 *  e não pode inventar evidência para confirmar o que recebeu.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * As diretrizes que dão autoridade ao contexto.
 *
 * São as MESMAS em toda análise, de propósito: a divergência entre Panorama e
 * plano técnico nascia justamente de cada um instruir o modelo de um jeito.
 *
 * A ordem é a da leitura do modelo — primeiro o que fazer com o contexto, depois
 * os dois limites (não apagar dado, não inventar evidência).
 */
export const DIRETRIZES_DE_CONTEXTO: readonly string[] = [
  "O contexto abaixo foi escrito pela equipe que OPERA esta conta. Ele tem "
  + "autoridade sobre a INTERPRETAÇÃO dos números.",
  "Quando o contexto qualificar um dado — dizendo que uma conversão foi teste, "
  + "que uma campanha ficou pausada, que um valor é atípico ou não deve contar — "
  + "a sua conclusão precisa refletir essa qualificação, e NÃO o número bruto. "
  + "Não basta mencionar o contexto: ele muda o que você conclui.",
  "O dado bruto continua existindo e pode ser citado. O que muda é o que ele "
  + "significa. Nunca apresente um dado desqualificado pelo contexto como se "
  + "fosse resultado válido.",
  "Contexto é o que a equipe AFIRMA, não o que o sistema mediu. Quando ele for "
  + "decisivo para a conclusão, atribua — \"segundo o contexto informado pela "
  + "equipe\". Nunca invente evidência para confirmá-lo.",
] as const;

export interface ContextoParaIA {
  /** Pronto para concatenar no prompt. Vazio quando não há contexto. */
  bloco: string;
  temContexto: boolean;
  /** As diretrizes aplicadas. Vazio quando não há contexto a governar. */
  diretrizes: readonly string[];
}

/**
 * O bloco de contexto com autoridade, para QUALQUER análise.
 *
 * `adhoc` é o contexto digitado no momento (a caixa do cabeçalho), que vale para
 * aquela análise e não fica guardado. Ele entra DEPOIS do contexto persistido:
 * numa contradição, o mais recente é o que a equipe acabou de afirmar.
 *
 * Sem contexto nenhum, devolve bloco vazio — e não um cabeçalho com as
 * diretrizes soltas. Diretriz sobre contexto inexistente é instrução para o
 * modelo procurar o que não foi dito, e ele obedece: passa a qualificar dados
 * por conta própria.
 */
export function blocoDeContextoParaIA(
  persistido: string | null | undefined,
  adhoc?: string | null,
): ContextoParaIA {
  const fixo = (persistido ?? "").trim();
  const agora = (adhoc ?? "").trim();

  if (!fixo && !agora) {
    return { bloco: "", temContexto: false, diretrizes: [] };
  }

  const corpo = [
    fixo,
    agora ? `### Contexto informado agora pela equipe (vale para esta análise):\n${agora}` : "",
  ].filter(Boolean).join("\n\n");

  const bloco = [
    "",
    "════ CONTEXTO DA CONTA — LEIA ANTES DE CONCLUIR ════",
    ...DIRETRIZES_DE_CONTEXTO.map((d, i) => `${i + 1}. ${d}`),
    "",
    corpo,
    "════ FIM DO CONTEXTO ════",
  ].join("\n");

  return { bloco, temContexto: true, diretrizes: DIRETRIZES_DE_CONTEXTO };
}

/**
 * A análise guardada é anterior ao contexto vigente?
 *
 * Item que o pedido levanta e que a tela precisava responder: depois de salvar
 * contexto, o Panorama continuava mostrando a leitura antiga — que passou a
 * estar errada por um motivo invisível. Sem esta comparação, a única forma de
 * descobrir seria reparar que o texto não mudou.
 *
 * Compara instantes, e não versões: `null` em qualquer um dos dois significa
 * "não sei dizer", e nesse caso NÃO se acusa desatualização. Um aviso falso de
 * "análise desatualizada" ensina a ignorar o aviso.
 */
export function analiseDesatualizada(
  analiseEm: Date | string | null | undefined,
  contextoEm: Date | string | null | undefined,
): boolean {
  if (!analiseEm || !contextoEm) return false;
  const a = analiseEm instanceof Date ? analiseEm : new Date(analiseEm);
  const c = contextoEm instanceof Date ? contextoEm : new Date(contextoEm);
  if (Number.isNaN(a.getTime()) || Number.isNaN(c.getTime())) return false;
  return c.getTime() > a.getTime();
}
