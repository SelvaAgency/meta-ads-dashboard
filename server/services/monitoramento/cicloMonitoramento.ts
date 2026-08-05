/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Ciclo de monitoramento — o que o cron de 5 minutos executa
 * ─────────────────────────────────────────────────────────────────────────────
 *  Junta as peças puras com o mundo: lê o DNS, o HTTP e o blog, avalia, passa
 *  pela confirmação dupla, grava o snapshot do dia e — só no fim de tudo isso —
 *  cria alerta.
 *
 *  Nem tudo roda no mesmo ritmo: DNS e destino a cada 5 minutos (~130ms por
 *  cliente), conteúdo a cada 30 (baixa uma listagem inteira, e spam publicado
 *  não muda em cinco minutos).
 *
 *  ── Quem entra ─────────────────────────────────────────────────────────────
 *  Só cliente com `ativo = true` em `site_compliance_settings`, que nasce em 0.
 *  Não existe caminho por onde um cliente novo entre sozinho no robô: a Fase 1
 *  é Aiká e Ultramalhas porque foram ligadas à mão, e mais ninguém.
 *
 *  ── O que vira alerta, e o que não vira ────────────────────────────────────
 *  WARNING e INFO não geram alerta nenhum: viram número e histórico na tela.
 *  Só CRITICAL CONFIRMADO vira alerta in-app + e-mail imediato.
 *
 *  Três filtros em série impedem que isso vire spam, e vale saber que são três
 *  porque cada um sozinho seria insuficiente:
 *
 *   1. confirmação dupla — a primeira suspeita nunca alerta;
 *   2. `manter` — enquanto o problema continua, os ciclos seguintes são mudos;
 *   3. dedup diário do `createNotification` — se alguém já foi notificado hoje,
 *      a lista de destinatários volta vazia e o e-mail nem é montado.
 *
 *  O robô olha 288× por dia; o incidente notifica 1×.
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
import { checarConteudo, type LeituraConteudo } from "./conteudoCheck";
import { proximoBaseline, type BaselineConteudo } from "./avaliadorConteudo";
import { termosDoCliente } from "./termosSuspeitos";
import { checarDns, type LeituraDns } from "./dnsCheck";
import { checarRedirect, type LeituraRedirect } from "./redirectCheck";
import { avaliar, maisGrave, type Achado } from "./avaliador";
import { decidir, normalizarConfirmacoes, type Suspeita } from "./confirmacao";
import { dominioRegistravel } from "./dominioRegistravel";
import { enviarEmailCriticoSite, type EvidenciaLinha } from "../emailAlertaCritico";

const hoje = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

/**
 * Conteúdo em ritmo próprio: 30 minutos, não 5.
 *
 * DNS e destino a 5 minutos custam ~130ms por cliente. A varredura do blog baixa
 * uma listagem inteira, e spam publicado não muda em cinco minutos — 288
 * leituras diárias pagariam largura de banda para responder a mesma coisa 48
 * vezes seguidas. Trinta minutos mantém a detecção no mesmo dia sem esse custo.
 */
const INTERVALO_CONTEUDO_MS = 30 * 60 * 1000;

/**
 * De qual coletor veio cada achado.
 *
 * Existe para o contador de anomalias de cada snapshot ser honesto: sem isto,
 * uma falha de DNS contaria como anomalia também no snapshot de redirect, e a
 * tela mostraria dois problemas onde há um.
 */
const ORIGEM: Record<string, "dns" | "redirect" | "conteudo"> = {
  dns_nao_resolve: "dns",
  dns_instavel: "dns",
  dns_sem_endereco: "dns",
  ns_mudou: "dns",
  ns_baseline_aprendido: "dns",
  site_sem_resposta: "redirect",
  verificacao_bloqueada: "redirect",
  dominio_divergente: "redirect",
  redirect_incomum: "redirect",
  canonical_externo: "redirect",
  conteudo_nao_verificado: "conteudo",
  conteudo_spam: "conteudo",
  conteudo_suspeito: "conteudo",
  conteudo_baseline_aprendido: "conteudo",
  muitos_posts_novos: "conteudo",
  autor_novo: "conteudo",
  categoria_nova: "conteudo",
};

/** Achados de um coletor. `ok` e `sem_dominio_esperado` valem para todos. */
export function achadosDe(origem: "dns" | "redirect" | "conteudo", achados: Achado[]): Achado[] {
  return achados.filter((a) => (ORIGEM[a.chave] ?? origem) === origem);
}

/**
 * Rótulos da evidência no e-mail. Mapa explícito, e não "despeja o JSON": quem
 * abre o alerta às 3 da manhã precisa ler "Chegou em: registro-suspenso.net",
 * não `{"dominioFinal":"..."}`. O que não está no mapa não vai — evidência nova
 * aparece quando alguém decidir como ela se lê, não por acidente.
 */
const ROTULOS: [string, string][] = [
  ["esperado", "Domínio esperado"],
  ["dominioFinal", "Chegou em"],
  ["finalUrl", "URL final"],
  ["cadeia", "Caminho"],
  ["erroCodigo", "Código do erro"],
  ["antes", "Nameservers antes"],
  ["agora", "Nameservers agora"],
  ["dominioCanonical", "Canonical aponta para"],
  ["statusCode", "Resposta HTTP"],
  ["saltos", "Redirecionamentos"],
  ["titulo", "Título da página"],
];

/** Evidência do achado em linhas legíveis. Truncada — conteúdo externo. */
export function evidenciaResumida(a: Achado): EvidenciaLinha[] {
  const out: EvidenciaLinha[] = [];
  for (const [chave, rotulo] of ROTULOS) {
    const v = a.evidencia[chave];
    if (v == null || v === "") continue;
    const valor = Array.isArray(v) ? v.join(" → ") : String(v);
    out.push({ rotulo, valor: valor.slice(0, 300) });
  }
  return out;
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

  // Conteúdo só entra quando está ligado E o intervalo dele venceu. Fora disso,
  // `conteudo` fica ausente — que é diferente de "leu e não achou nada", e por
  // isso não vira achado nenhum nem mexe no baseline.
  const ultimaConteudo = c.ultimaVerificacaoConteudoEm ? new Date(c.ultimaVerificacaoConteudoEm).getTime() : 0;
  const rodarConteudo = c.checarConteudo && !!alvo && Date.now() - ultimaConteudo >= INTERVALO_CONTEUDO_MS;
  const conteudo: LeituraConteudo | null = rodarConteudo ? await checarConteudo(alvo, c.blogUrl) : null;
  const baselineConteudo = (c.postsVistosJson ?? null) as BaselineConteudo | null;
  const termos = termosDoCliente(
    (c.termosExtrasJson ?? null) as string[] | null,
    (c.termosIgnoradosJson ?? null) as string[] | null,
  );

  const nsBaseline = Array.isArray(c.nsBaselineJson) ? (c.nsBaselineJson as string[]) : null;
  const achados = avaliar({
    dominioEsperado: esperado, dns, redirect, nsBaseline,
    conteudo: conteudo ? { conteudo, baseline: baselineConteudo, termos } : null,
  });

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
  const gravar = async (
    provider: "dns_check" | "redirect_check" | "conteudo_check",
    origem: "dns" | "redirect" | "conteudo",
    leitura: unknown,
  ) => {
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
  await gravar("conteudo_check", "conteudo", conteudo && {
    // O snapshot guarda o RESUMO da leitura, nunca os posts inteiros: 30 posts
    // com resumo por ciclo encheriam a linha do dia sem responder nada que a
    // evidência do achado já não responda.
    fonte: conteudo.fonte,
    posts: conteudo.posts.length,
    novos: baselineConteudo ? conteudo.posts.filter((p) => !baselineConteudo.ids.includes(p.id)).length : 0,
    tentativas: conteudo.tentativas.map((t) => `${t.fonte}: ${t.resultado}`),
    erro: conteudo.erro,
    emMs: conteudo.emMs,
  });

  // ── Estado que atravessa ciclos ───────────────────────────────────────────
  const patch: Parameters<typeof upsertComplianceSettings>[1] = { ultimaVerificacaoEm: new Date() };
  patch.suspeitaJson = d.acao === "seguir" || d.acao === "normalizou" ? null : d.suspeita;
  // Primeira leitura APRENDE os nameservers. Sem gravar aqui, toda leitura seria
  // a primeira e a mudança de NS nunca seria detectada.
  if (nsBaseline === null && dns?.resolveu && dns.ns.length > 0) patch.nsBaselineJson = dns.ns;
  // O baseline do blog só avança quando a leitura DEU CERTO. Gravar depois de
  // uma falha zeraria os posts conhecidos, e na leitura seguinte o blog inteiro
  // apareceria como novo — rajada falsa, autor novo falso, tudo de uma vez.
  if (conteudo?.ok) {
    patch.postsVistosJson = proximoBaseline(baselineConteudo, conteudo.posts);
  }
  if (conteudo) patch.ultimaVerificacaoConteudoEm = new Date();
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
      /**
       * E-mail imediato, e só aqui. Este ponto do código é alcançado UMA vez
       * por incidente por dia: a confirmação dupla já barrou a primeira
       * suspeita, o `manter` já barrou os ciclos seguintes, e o dedup diário do
       * `createNotification` devolveu lista vazia se alguém já tinha sido
       * notificado hoje. Não há caminho por onde isto vire e-mail de 5 em 5
       * minutos.
       *
       * Destinatários = exatamente quem acabou de receber o in-app.
       */
      await enviarEmailCriticoSite({
        userIds: users, nome,
        titulo: d.achado.titulo,
        detalhe: `${d.achado.detalhe}\n\nConfirmado em ${d.suspeita.ciclos} leituras consecutivas.`,
        link: `/site?account=${c.accountId}&aba=monitoramento`,
        evidencia: evidenciaResumida(d.achado),
        tipo: "site_monitoramento",
      });
    }
  }
}
