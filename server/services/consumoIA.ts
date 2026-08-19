/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Quantas gerações o Spaces executou — e de onde
 * ─────────────────────────────────────────────────────────────────────────────
 *  O registro é feito no ÚNICO ponto por onde toda chamada passa (`invokeLLM`),
 *  e não em cada funcionalidade. A diferença importa: instrumentar as sete
 *  funcionalidades de hoje deixaria a oitava fora da conta no dia em que alguém
 *  a escrevesse, e o número viraria um piso disfarçado de total.
 *
 *  ── O que NÃO é guardado ───────────────────────────────────────────────────
 *  Nem prompt, nem resposta, nem dado de cliente. Só de onde veio, se deu
 *  certo, quanto demorou e quantos tokens. Um log de consumo que guarda o
 *  conteúdo vira um segundo banco de dados do cliente, com as mesmas obrigações
 *  do primeiro e nenhuma das proteções.
 *
 *  ── Falhar aqui não pode derrubar a geração ────────────────────────────────
 *  O registro é contabilidade; a análise é o produto. Se a escrita falhar, a
 *  resposta do modelo continua valendo — por isso tudo aqui é `catch` silencioso
 *  e sem `await` no caminho crítico.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { Gatilho } from "@shared/gatilhoDaIA";

/** De onde a chamada partiu. Nome curto e estável — vira agrupador no admin. */
export type OrigemDaGeracao =
  | "status_ia"          // saúde da conta (cron diário + botão Atualizar)
  | "briefing"           // jornalzinho do dia
  | "relatorio"          // gerador de relatórios
  | "relatorio_site"     // relatório de site
  | "chat_cliente"       // perguntar sobre o cliente
  | "sugestoes"          // recomendações
  | "consolidacao"       // consolidação semanal de aprendizados
  | "fechamento_acao"    // encerramento de ações monitoradas
  | "extracao"           // extração de campos (contratos)
  | "outra";

export interface RegistroDeGeracao {
  /**
   * A conta que motivou a chamada. `null` quando não HÁ conta — jornalzinho e
   * consolidação são da agência inteira. `null` é resposta, não lacuna.
   */
  accountId?: number | null;
  /** O modelo que respondeu, vindo da própria resposta da Anthropic. */
  modelo?: string | null;
  /**
   * `string` e não a união: `invokeLLM` é infraestrutura e não deve conhecer o
   * catálogo de funcionalidades. `OrigemDaGeracao` continua sendo a lista
   * CANÔNICA — quem escreve um chamador novo consulta ela para escolher o nome,
   * e um nome fora dela aparece no painel como está, sem sumir.
   */
  origem: string;
  ok: boolean;
  ms: number;
  tokensEntrada?: number | null;
  tokensSaida?: number | null;
  /**
   * Quem PEDIU a chamada — cron, pessoa, boot.
   *
   * `origem` responde "o que essa chamada faz"; o gatilho responde "por que ela
   * aconteceu". Sete caminhos gravavam a MESMA origem (`status_ia`), e o log não
   * distinguia o disparo diário de um clique. Nada aqui é conteúdo.
   */
  gatilho?: Gatilho | null;
}

/**
 * Registra uma geração. Nunca lança, nunca bloqueia.
 *
 * A importação do banco é dinâmica de propósito: `_core/llm.ts` é infraestrutura
 * e não pode passar a depender da camada de dados em tempo de carga — isso
 * criaria um ciclo e faria o módulo do modelo falhar por causa do banco.
 */
export async function registrarGeracao(r: RegistroDeGeracao): Promise<void> {
  try {
    const { registrarGeracaoIA } = await import("../db");
    await registrarGeracaoIA(r);
  } catch {
    /* contabilidade não derruba produto */
  }
}
