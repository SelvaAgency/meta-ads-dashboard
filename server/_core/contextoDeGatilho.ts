/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Quem pediu esta chamada — carregado pelo contexto, não pela assinatura
 * ─────────────────────────────────────────────────────────────────────────────
 *  `AsyncLocalStorage` do Node. Quem inicia um fluxo (o cron, uma mutation do
 *  tRPC, o endpoint de sync) declara o gatilho uma vez, e todo `invokeLLM` que
 *  acontecer dentro dele — por mais fundo que esteja — enxerga a declaração.
 *
 *  ── Por que não passar por parâmetro ───────────────────────────────────────
 *  A auditoria achou nove `invokeLLM` sem nem `origem` declarada. O caminho até
 *  o modelo atravessa serviços, imports dinâmicos e laços; enfiar um argumento
 *  novo em cada nível daria dezenas de pontos de esquecimento, e o esquecimento
 *  é mudo — a chamada acontece, só não fica rastreada.
 *
 *  Aqui, esquecer de declarar produz `unknown`, que é visível na página e
 *  contável no relatório de auditoria. Ausência declarada em vez de silêncio.
 *
 *  ── O que NÃO passa por aqui ───────────────────────────────────────────────
 *  Prompt, resposta, dado de cliente. Este contexto carrega quem pediu e qual
 *  rotina — nada sobre o conteúdo da conversa com o modelo.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { AsyncLocalStorage } from "node:async_hooks";
import type { Gatilho, TipoDeGatilho } from "@shared/gatilhoDaIA";

export interface Ator {
  tipo: "user" | "system";
  id?: number | null;
  nome?: string | null;
  papel?: string | null;
}

const armazem = new AsyncLocalStorage<Gatilho>();

/**
 * Roda `fn` com o gatilho declarado.
 *
 * Aninhado, o de dentro ganha — e isso é a regra certa: uma mutation manual que
 * dispara uma rotina interna deve registrar a rotina interna quando ela se
 * declara, porque é ela que sabe o próprio nome.
 */
export function comGatilho<T>(
  g: { tipo: TipoDeGatilho; origem: string; rotulo?: string; ator?: Ator | null },
  fn: () => T,
): T {
  return armazem.run({
    tipo: g.tipo,
    origemDoGatilho: g.origem,
    rotulo: g.rotulo ?? null,
    atorTipo: g.ator?.tipo ?? (g.tipo === "manual" ? "user" : "system"),
    atorId: g.ator?.id ?? null,
    atorNome: g.ator?.nome ?? null,
    atorPapel: g.ator?.papel ?? null,
  }, fn);
}

/** O gatilho vigente, ou `null` quando ninguém declarou. */
export function gatilhoAtual(): Gatilho | null {
  return armazem.getStore() ?? null;
}

/**
 * O gatilho para gravar — nunca `null`.
 *
 * Sem declaração o registro vira `unknown`, e não um palpite. É esse valor que
 * a página mostra como "Não rastreado" e que o relatório de auditoria usa para
 * achar os caminhos que ainda não foram nomeados.
 */
export function gatilhoParaRegistro(): Gatilho {
  return gatilhoAtual() ?? {
    tipo: "unknown", origemDoGatilho: null, rotulo: null,
    atorTipo: null, atorId: null, atorNome: null, atorPapel: null,
  };
}
