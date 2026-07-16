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
  contasComPerformance, contasComSite, salvarSiteSnapshot, registrarSyncPerf,
} from "./db";
import { coletarSnapshot, ClarityAuthError, ClarityRateLimitError } from "./services/clarityService";
import { coletarPerformance, PerfConfigError, PerfQuotaError, type SiteProvider } from "./services/sitePerformanceService";
import { checarSeguranca, checarUptime } from "./services/siteHealthService";
import { runSiteHealthAlertas } from "./services/siteHealthAlerts";

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

// ─── Performance técnica (PageSpeed) ─────────────────────────────────────────
// Um teste é um carregamento real: 10–30s. Por isso é sequencial e espaçado —
// e por isso o resultado é snapshotado, não consultado ao vivo pela tela.

export type ResultadoPerf =
  | { ok: true; score: number | null; url: string }
  | { ok: false; motivo: "sem_config" | "cota" | "erro"; mensagem: string };

export async function sincronizarPerformance(accountId: number, provider = "pagespeed", url?: string): Promise<ResultadoPerf> {
  const dia = hojeLocal();
  const alvo = url ?? (await contasComPerformance()).find((c) => c.accountId === accountId)?.url;
  if (!alvo) return { ok: false, motivo: "sem_config", mensagem: "Nenhuma URL configurada para testar." };

  try {
    const snap = await coletarPerformance(provider as SiteProvider, alvo, "mobile");
    await salvarSiteSnapshot({
      accountId, provider: snap.provider, url: snap.url, estrategia: snap.estrategia, dia,
      metricsJson: snap.metricas,
      recommendationsJson: snap.recomendacoes,
      externalReportUrl: snap.externalReportUrl,
    });
    await registrarSyncPerf(accountId, "ok");
    return { ok: true, score: snap.metricas.performanceScore, url: snap.url };
  } catch (e) {
    const msg = (e as Error).message; // o service garante que não contém a key
    const motivo = e instanceof PerfConfigError ? "sem_config" : e instanceof PerfQuotaError ? "cota" : "erro";
    await registrarSyncPerf(accountId, "erro", msg);
    return { ok: false, motivo, mensagem: msg };
  }
}

/** Job diário. Isolado por cliente: um site fora do ar não derruba os outros. */
export async function runPerformanceSnapshots(): Promise<{ contas: number; ok: number; falhas: number }> {
  const contas = await contasComPerformance();
  if (contas.length === 0) {
    logger.info("[Perf] Nenhum cliente com performance técnica configurada.");
    return { contas: 0, ok: 0, falhas: 0 };
  }
  let ok = 0, falhas = 0;
  for (const c of contas) {
    const nome = c.nome ?? `#${c.accountId}`;
    const r = await sincronizarPerformance(c.accountId, c.provider, c.url);
    if (r.ok) { ok++; logger.info(`[Perf] ✓ ${nome}: score ${r.score ?? "?"} · ${r.url}`); }
    else { falhas++; logger.error(`[Perf] ✗ ${nome}: ${r.mensagem}`); }
    await new Promise((res) => setTimeout(res, 2000)); // respiro: teste é pesado
  }
  logger.info(`[Perf] Ciclo completo — ${ok} ok · ${falhas} falha(s) de ${contas.length}.`);
  return { contas: contas.length, ok, falhas };
}

// ─── Saúde do site: segurança básica e uptime (checks próprios) ──────────────
// Leves e sem cota — dá para rodar diário sem pensar. Vão para a mesma tabela
// de snapshots, com provider diferente.

export type ResultadoCheck = { ok: boolean; motivo?: string; resumo?: string };

export async function checarSegurancaCliente(accountId: number, url: string): Promise<ResultadoCheck> {
  const dia = hojeLocal();
  try {
    const s = await checarSeguranca(url);
    await salvarSiteSnapshot({
      accountId, provider: "security_check", url, estrategia: "mobile", dia,
      metricsJson: {
        status: s.status, score: s.score, https: s.https,
        redirecionaParaHttps: s.redirecionaParaHttps, sslValido: s.sslValido,
        certificateExpiresAt: s.certificateExpiresAt?.toISOString() ?? null,
        daysToSslExpiry: s.daysToSslExpiry, emissor: s.emissor,
      },
      issuesJson: { achados: s.achados, headers: s.headers },
      recommendationsJson: s.recomendacoes,
    });
    return { ok: true, resumo: `${s.status} · ${s.score}/100` };
  } catch (e) {
    return { ok: false, motivo: (e as Error).message };
  }
}

export async function checarUptimeCliente(accountId: number, url: string): Promise<ResultadoCheck> {
  const dia = hojeLocal();
  // URL recusada pelo guard lança e vira { ok: false } — não vira snapshot nem
  // status verde. O erro precisa chegar em quem configurou.
  try {
    const u = await checarUptime(url);
    await salvarSiteSnapshot({
      accountId, provider: "uptime_check", url, estrategia: "mobile", dia,
      metricsJson: {
        status: u.status, statusCode: u.statusCode, responseTimeMs: u.responseTimeMs,
        finalUrl: u.finalUrl, redirects: u.redirects, errorMessage: u.errorMessage,
        checkedAt: u.checkedAt.toISOString(),
      },
    });
    return { ok: true, resumo: `${u.status} · HTTP ${u.statusCode ?? "—"} · ${u.responseTimeMs ?? "?"}ms` };
  } catch (e) {
    return { ok: false, motivo: (e as Error).message };
  }
}

/** URL a checar: a de performance, senão o domínio principal. */
async function urlDoCliente(): Promise<{ accountId: number; nome: string | null; url: string }[]> {
  const contas = await contasComSite();
  return contas;
}

export async function runSiteHealthChecks(): Promise<{ contas: number; ok: number; falhas: number; alertas: number }> {
  const contas = await urlDoCliente();
  if (contas.length === 0) {
    logger.info("[SiteHealth] Nenhum cliente com domínio configurado.");
    return { contas: 0, ok: 0, falhas: 0, alertas: 0 };
  }
  let ok = 0, falhas = 0;
  for (const c of contas) {
    const nome = c.nome ?? `#${c.accountId}`;
    const [seg, up] = await Promise.all([
      checarSegurancaCliente(c.accountId, c.url),
      checarUptimeCliente(c.accountId, c.url),
    ]);
    if (seg.ok && up.ok) { ok++; logger.info(`[SiteHealth] ✓ ${nome}: segurança ${seg.resumo} · uptime ${up.resumo}`); }
    else { falhas++; logger.error(`[SiteHealth] ✗ ${nome}: ${seg.motivo ?? ""} ${up.motivo ?? ""}`.trim()); }
    await new Promise((r) => setTimeout(r, 800));
  }
  const alertas = await runSiteHealthAlertas();
  logger.info(`[SiteHealth] Ciclo completo — ${ok} ok · ${falhas} falha(s) · ${alertas} alerta(s).`);
  return { contas: contas.length, ok, falhas, alertas };
}
