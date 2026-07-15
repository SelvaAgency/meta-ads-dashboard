/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Clarity — sync e snapshot
 * ─────────────────────────────────────────────────────────────────────────────
 *  A API do Clarity só devolve os últimos 1–3 dias. Não existe consulta ao
 *  passado: se ninguém tirar o snapshot do dia, aquele dia some para sempre.
 *  Por isso o job diário não é um extra — é o que constrói o histórico.
 *
 *  Cota: 10 requisições por projeto por dia; um snapshot custa até 3. A reserva
 *  é feita ANTES da chamada e acertada depois com o que foi realmente gasto.
 *  Falha de um cliente não derruba os outros. Log com prefixo [Clarity].
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { logger } from "./logger";
import {
  contasComClarity, getClarityToken, reservarCotaClarity, ajustarCotaClarity,
  registrarSyncClarity, salvarClaritySnapshot,
} from "./db";
import { coletarSnapshot, ClarityAuthError, ClarityRateLimitError } from "./services/clarityService";

const REQS_POR_SNAPSHOT = 3; // geral + por URL + por Source

/** Dia local da agência — o snapshot é indexado pelo dia de quem lê, não por UTC. */
function hojeLocal(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export type ResultadoSync =
  | { ok: true; dia: string; sessions: number | null; requisicoes: number }
  | { ok: false; motivo: "sem_config" | "cota" | "auth" | "erro"; mensagem: string };

/**
 * Sincroniza um cliente. Usado tanto pelo botão quanto pelo job diário.
 * Nunca lança: devolve o motivo, para a tela poder explicar o que houve.
 */
export async function sincronizarClarity(accountId: number, numOfDays: 1 | 2 | 3 = 1): Promise<ResultadoSync> {
  const token = await getClarityToken(accountId);
  if (!token) return { ok: false, motivo: "sem_config", mensagem: "Clarity não configurado para este cliente." };

  const dia = hojeLocal();
  const cota = await reservarCotaClarity(accountId, REQS_POR_SNAPSHOT, dia);
  if (!cota.ok) {
    const msg = `Cota diária do Clarity esgotada (${cota.usadas}/10 hoje). Tente amanhã.`;
    await registrarSyncClarity(accountId, "erro", msg);
    return { ok: false, motivo: "cota", mensagem: msg };
  }

  try {
    const snap = await coletarSnapshot(token, numOfDays);
    // Devolve à cota o que não foi gasto (chamadas de detalhe podem ter falhado).
    await ajustarCotaClarity(accountId, REQS_POR_SNAPSHOT, snap.requisicoes, dia);

    await salvarClaritySnapshot({
      accountId, dia, dias: snap.dias,
      rangeStart: snap.rangeStart, rangeEnd: snap.rangeEnd,
      metricsJson: snap.metricas,
      topPagesJson: snap.topPages,
      sourcesJson: snap.sources,
      // O que a API não devolveu neste projeto — some no diagnóstico da tela.
      issuesJson: { metricasPresentes: snap.metricasPresentes },
    });
    await registrarSyncClarity(accountId, "ok");
    return { ok: true, dia, sessions: snap.metricas.sessions, requisicoes: snap.requisicoes };
  } catch (e) {
    // Só a 1ª chamada pode chegar aqui (as de detalhe engolem o próprio erro),
    // então devolvemos as 2 reservas não usadas — senão um token quebrado
    // "queimaria" 3 da cota por tentativa e bloquearia quem está consertando.
    await ajustarCotaClarity(accountId, REQS_POR_SNAPSHOT, 1, dia);
    const msg = (e as Error).message; // clarityService garante que não contém token
    const motivo = e instanceof ClarityAuthError ? "auth" : e instanceof ClarityRateLimitError ? "cota" : "erro";
    await registrarSyncClarity(accountId, "erro", msg);
    return { ok: false, motivo, mensagem: msg };
  }
}

/**
 * Job diário. Cada cliente é isolado: um token inválido não impede os demais de
 * snapshotar. Roda antes do expediente para os dados estarem prontos às 9h.
 */
export async function runClaritySnapshots(): Promise<{ contas: number; ok: number; falhas: number }> {
  const contas = await contasComClarity();
  if (contas.length === 0) {
    logger.info("[Clarity] Nenhum cliente com Clarity configurado — nada a sincronizar.");
    return { contas: 0, ok: 0, falhas: 0 };
  }
  let ok = 0, falhas = 0;
  for (const c of contas) {
    const nome = c.nome ?? `#${c.accountId}`;
    const r = await sincronizarClarity(c.accountId, 1);
    if (r.ok) { ok++; logger.info(`[Clarity] ✓ ${nome}: ${r.sessions ?? "?"} sessão(ões) · ${r.requisicoes} req`); }
    else { falhas++; logger.error(`[Clarity] ✗ ${nome}: ${r.mensagem}`); }
    await new Promise((res) => setTimeout(res, 500)); // respiro entre projetos
  }
  logger.info(`[Clarity] Ciclo completo — ${ok} ok · ${falhas} falha(s) de ${contas.length} cliente(s).`);
  return { contas: contas.length, ok, falhas };
}
