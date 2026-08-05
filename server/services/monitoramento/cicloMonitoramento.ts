/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Ciclo de monitoramento — o que o cron de 5 minutos executa
 * ─────────────────────────────────────────────────────────────────────────────
 *  Junta as peças puras dos passos 3 e 4 com o mundo: lê o DNS e o HTTP, avalia,
 *  passa pela confirmação dupla, grava o snapshot do dia e — só no fim de tudo
 *  isso — cria alerta.
 *
 *  ── Quem entra ─────────────────────────────────────────────────────────────
 *  Só cliente com `ativo = true` em `site_compliance_settings`, que nasce em 0.
 *  Não existe caminho por onde um cliente novo entre sozinho no robô: a Fase 1
 *  é Aiká e Ultramalhas porque foram ligadas à mão, e mais ninguém.
 *
 *  ── O que NÃO faz ──────────────────────────────────────────────────────────
 *  Não envia e-mail. WARNING e INFO não geram alerta nenhum — viram número e
 *  histórico na tela. Só CRITICAL confirmado vira alerta in-app, e mesmo esse
 *  passa pelo dedup diário: o mesmo problema no mesmo cliente notifica 1× por
 *  dia, não 288.
 *
 *  ── Falha de um cliente não derruba os outros ──────────────────────────────
 *  Cada cliente roda dentro do seu próprio try. Um domínio malformado na
 *  configuração de um não pode cegar o robô para os demais.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { logger } from "../../logger";
import {
  contasParaMonitorar, upsertComplianceSettings, acumularSnapshotMonitoramento,
  createNotification, type EventoMonitoramento,
} from "../../db";
import { checarDns, type LeituraDns } from "./dnsCheck";
import { checarRedirect, type LeituraRedirect } from "./redirectCheck";
import { avaliar, maisGrave, type Achado } from "./avaliador";
import { decidir, normalizarConfirmacoes, type Suspeita } from "./confirmacao";
import { dominioRegistravel } from "./dominioRegistravel";

const hoje = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

/**
 * De qual coletor veio cada achado.
 *
 * Existe para o contador de anomalias de cada snapshot ser honesto: sem isto,
 * uma falha de DNS contaria como anomalia também no snapshot de redirect, e a
 * tela mostraria dois problemas onde há um.
 */
const ORIGEM: Record<string, "dns" | "redirect"> = {
  dns_nao_resolve: "dns",
  dns_instavel: "dns",
  ns_mudou: "dns",
  ns_baseline_aprendido: "dns",
  site_sem_resposta: "redirect",
  verificacao_bloqueada: "redirect",
  dominio_divergente: "redirect",
  redirect_incomum: "redirect",
  canonical_externo: "redirect",
};

/** Achados de um coletor. `ok` e `sem_dominio_esperado` valem para os dois. */
export function achadosDe(origem: "dns" | "redirect", achados: Achado[]): Achado[] {
  return achados.filter((a) => (ORIGEM[a.chave] ?? origem) === origem);
}

const resumo = (achados: Achado[]) => achados.map((a) => ({ chave: a.chave, sev: a.sev, titulo: a.titulo }));

/** Impede que um ciclo lento se sobreponha ao próximo — a 5 min isso acontece. */
let emExecucao = false;

export interface ResultadoCiclo {
  contas: number;
  alertas: number;
  suspeitas: number;
  instabilidades: number;
  pulado?: boolean;
}

export async function runCicloMonitoramento(): Promise<ResultadoCiclo> {
  if (emExecucao) {
    logger.warn("[Monitoramento] ciclo anterior ainda rodando — pulando este");
    return { contas: 0, alertas: 0, suspeitas: 0, instabilidades: 0, pulado: true };
  }
  emExecucao = true;
  const r: ResultadoCiclo = { contas: 0, alertas: 0, suspeitas: 0, instabilidades: 0 };
  try {
    const contas = await contasParaMonitorar();
    if (contas.length === 0) return r;
    const dia = hoje();

    for (const c of contas) {
      const nome = c.nome ?? `#${c.accountId}`;
      try {
        await verificarConta(c, dia, r);
        r.contas++;
      } catch (e) {
        // Cliente que estoura não pode cegar o robô para os outros.
        logger.error(`[Monitoramento] falha em ${nome}: ${(e as Error).message}`);
      }
    }
    if (r.alertas || r.suspeitas || r.instabilidades) {
      logger.info(`[Monitoramento] ${r.contas} cliente(s) · ${r.alertas} alerta(s) · ${r.suspeitas} suspeita(s) · ${r.instabilidades} instabilidade(s)`);
    }
    return r;
  } finally {
    emExecucao = false;
  }
}

type Conta = Awaited<ReturnType<typeof contasParaMonitorar>>[number];

async function verificarConta(c: Conta, dia: string, r: ResultadoCiclo): Promise<void> {
  const nome = c.nome ?? `#${c.accountId}`;
  const agoraIso = new Date().toISOString();
  const esperado = c.dominioEsperado ?? "";
  const alvo = dominioRegistravel(esperado) ?? esperado;

  const dns: LeituraDns | null = c.checarDns && alvo ? await checarDns(alvo) : null;
  const redirect: LeituraRedirect | null = c.checarRedirect && alvo ? await checarRedirect(alvo) : null;

  const nsBaseline = Array.isArray(c.nsBaselineJson) ? (c.nsBaselineJson as string[]) : null;
  const achados = avaliar({ dominioEsperado: esperado, dns, redirect, nsBaseline });

  const anterior = (c.suspeitaJson ?? null) as Suspeita | null;
  const necessarias = normalizarConfirmacoes(c.confirmacoesNecessarias);
  const d = decidir({ achados, anterior, confirmacoesNecessarias: necessarias, agoraIso });

  // ── Eventos do ciclo — o histórico que a tela vai contar ──────────────────
  const eventos: EventoMonitoramento[] = [];
  if (d.acao === "aguardar") {
    r.suspeitas++;
    eventos.push({ em: agoraIso, tipo: "suspeita", chave: d.suspeita.chave,
      detalhe: `${d.suspeita.titulo} — aguardando confirmação (${d.suspeita.ciclos}/${necessarias}).` });
  } else if (d.acao === "alertar") {
    eventos.push({ em: agoraIso, tipo: "confirmado", chave: d.suspeita.chave,
      detalhe: `${d.suspeita.titulo} — confirmado em ${d.suspeita.ciclos} leituras.` });
  } else if (d.acao === "normalizou") {
    if (d.instabilidadeMomentanea) {
      // Nunca chegou a confirmar: a rede piscou. Registro INFO, não alerta —
      // é exatamente o falso positivo que a confirmação dupla existe para comer.
      r.instabilidades++;
      eventos.push({ em: agoraIso, tipo: "instabilidade", chave: d.anterior.chave,
        detalhe: `${d.anterior.titulo} apareceu em 1 leitura e sumiu na seguinte — instabilidade momentânea, sem alerta.` });
    } else {
      eventos.push({ em: agoraIso, tipo: "normalizado", chave: d.anterior.chave,
        detalhe: `${d.anterior.titulo} — normalizado.` });
    }
  }

  // ── Snapshot diário, um por coletor ───────────────────────────────────────
  const sev = maisGrave(achados);
  const gravar = async (provider: "dns_check" | "redirect_check", origem: "dns" | "redirect", leitura: unknown) => {
    if (!leitura) return;
    const meus = achadosDe(origem, achados);
    await acumularSnapshotMonitoramento({
      accountId: c.accountId, provider, url: alvo || nome, dia,
      leitura: leitura as Record<string, unknown>,
      anomalia: maisGrave(meus) !== "INFO",
      severidade: maisGrave(meus),
      achados: resumo(meus),
      // Os eventos entram no snapshot de redirect quando o achado veio de lá, e
      // no de DNS quando veio do DNS — senão o mesmo evento apareceria duas
      // vezes na tela, como se tivesse acontecido duas vezes.
      eventos: eventos.filter((e) => (ORIGEM[e.chave] ?? origem) === origem),
      agoraIso,
    });
  };
  await gravar("dns_check", "dns", dns);
  await gravar("redirect_check", "redirect", redirect);

  // ── Estado que atravessa ciclos ───────────────────────────────────────────
  const patch: Parameters<typeof upsertComplianceSettings>[1] = { ultimaVerificacaoEm: new Date() };
  patch.suspeitaJson = d.acao === "seguir" || d.acao === "normalizou" ? null : d.suspeita;
  // Primeira leitura APRENDE os nameservers. Sem gravar aqui, toda leitura seria
  // a primeira e a mudança de NS nunca seria detectada.
  if (nsBaseline === null && dns?.resolveu && dns.ns.length > 0) patch.nsBaselineJson = dns.ns;
  await upsertComplianceSettings(c.accountId, patch);

  // ── Alerta: só CRITICAL confirmado ────────────────────────────────────────
  if (d.acao === "alertar") {
    const users = await createNotification({
      tipo: "SITE_MONITORAMENTO",
      alertType: "TRACKING_PROBLEM",
      severity: "CRITICAL",
      title: `${nome}: ${d.achado.titulo}`,
      message: `${d.achado.detalhe}\n\nConfirmado em ${d.suspeita.ciclos} leituras consecutivas (desde ${d.suspeita.desde}).`,
      referencia: `${c.accountId}:${d.achado.chave}`,
      dia, // fecha o dedup em 1× por dia — o robô olha 288×
      accountId: c.accountId,
      suggestedAction: `/site?account=${c.accountId}&aba=monitoramento`,
    });
    if (users.length) {
      r.alertas++;
      logger.warn(`[Monitoramento] CRÍTICO confirmado em ${nome}: ${d.achado.chave} → ${users.length} pessoa(s)`);
    }
  }
}
