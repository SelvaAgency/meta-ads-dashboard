/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Alertas de site (Clarity)
 * ─────────────────────────────────────────────────────────────────────────────
 *  Duas famílias de regra, e a diferença entre elas é o que impede o alerta de
 *  virar ruído:
 *
 *   · ABSOLUTAS — funcionam com um único snapshot. Sempre em TAXA por sessão,
 *     nunca em número bruto: 260 erros em 637 sessões é grave, 260 em 60.000 não.
 *   · TENDÊNCIA — exigem linha de base (≥3 snapshots anteriores). Enquanto não
 *     houver histórico, ficam DORMENTES em vez de comparar contra o nada.
 *
 *  Guarda de volume: nenhuma regra dispara abaixo de um mínimo de sessões. Sem
 *  isso, um cliente com 18 sessões e 33% de bots geraria alarme falso no dia 1 —
 *  e alerta que grita errado no começo é alerta que todo mundo aprende a ignorar.
 *
 *  Os destinatários saem do resolver central: admins + coordenadores daquele
 *  cliente. Nunca todo mundo.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { logger } from "../logger";
import { serieClaritySnapshots, contasComClarity } from "../db";
import { createNotification } from "../db";

/** Volume mínimo para qualquer conclusão. Abaixo disso, é anedota, não dado. */
const MIN_SESSOES = 50;
/** Snapshots anteriores necessários para as regras de tendência. */
const MIN_BASE = 3;

type Metricas = {
  sessions: number | null; botSessions: number | null; users: number | null;
  pagesPerSession: number | null; averageScrollDepth: number | null;
  averageSessionDuration: number | null; deadClicks: number | null;
  rageClicks: number | null; quickBacks: number | null; javascriptErrors: number | null;
};

export type Problema = {
  chave: string;                       // vai para o dedup: tipo:cliente:problema:dia
  tipo: "SITE_CLARITY_ISSUE" | "SITE_TRACKING_PROBLEM";
  severidade: "INFO" | "WARNING" | "CRITICAL";
  titulo: string;
  detalhe: string;
};

const taxa = (v: number | null, s: number) => (v === null || !s ? null : v / s);
const pct = (n: number) => `${Math.round(n * 100)}%`;

/**
 * Analisa o snapshot mais recente. `base` são os anteriores — quando não há o
 * bastante, as regras de tendência simplesmente não entram.
 */
export function analisarSnapshot(m: Metricas, base: Metricas[]): Problema[] {
  const p: Problema[] = [];
  const s = m.sessions ?? 0;
  if (s < MIN_SESSOES) return p; // volume insuficiente: calar é o certo

  // ── Absolutas ──────────────────────────────────────────────────────────────
  const js = taxa(m.javascriptErrors, s);
  if (js !== null && js > 0.25) {
    p.push({
      chave: "js_errors", tipo: "SITE_TRACKING_PROBLEM",
      severidade: js > 0.5 ? "CRITICAL" : "WARNING",
      titulo: `Erros de JavaScript em ${pct(js)} das sessões`,
      detalhe: `${m.javascriptErrors} erros em ${s} sessões. Além de quebrar a experiência, erro de JS pode impedir o disparo do evento de conversão — o que faz o CPA parecer pior do que é.`,
    });
  }

  const dead = taxa(m.deadClicks, s);
  if (dead !== null && dead > 0.20) {
    p.push({
      chave: "dead_clicks", tipo: "SITE_CLARITY_ISSUE",
      severidade: dead > 0.40 ? "WARNING" : "INFO",
      titulo: `Cliques mortos em ${pct(dead)} das sessões`,
      detalhe: `${m.deadClicks} cliques em ${s} sessões que não levaram a nada. Algo parece clicável e não é, ou o CTA confunde.`,
    });
  }

  const rage = taxa(m.rageClicks, s);
  if (rage !== null && rage > 0.05) {
    p.push({
      chave: "rage_clicks", tipo: "SITE_CLARITY_ISSUE",
      severidade: rage > 0.10 ? "WARNING" : "INFO",
      titulo: `Rage clicks em ${pct(rage)} das sessões`,
      detalhe: `${m.rageClicks} sessões com clique repetido de frustração em ${s}. Normalmente é um elemento específico que não responde.`,
    });
  }

  const qb = taxa(m.quickBacks, s);
  if (qb !== null && qb > 0.35) {
    p.push({
      chave: "quick_backs", tipo: "SITE_CLARITY_ISSUE", severidade: "WARNING",
      titulo: `${pct(qb)} das sessões saem logo na chegada`,
      detalhe: `${m.quickBacks} quick backs em ${s} sessões. Expectativa quebrada entre o anúncio e a página, ou carregamento lento.`,
    });
  }

  if (m.averageScrollDepth !== null && m.averageScrollDepth < 30) {
    p.push({
      chave: "scroll_baixo", tipo: "SITE_CLARITY_ISSUE", severidade: "INFO",
      titulo: `Scroll médio de apenas ${Math.round(m.averageScrollDepth)}%`,
      detalhe: `Em ${s} sessões, a maioria não passa do topo. A página não sustenta a intenção de quem clicou.`,
    });
  }

  const bots = taxa(m.botSessions, s);
  if (bots !== null && bots > 0.30) {
    p.push({
      chave: "bots", tipo: "SITE_CLARITY_ISSUE", severidade: "INFO",
      titulo: `${pct(bots)} do tráfego é bot`,
      detalhe: `${m.botSessions} de ${s} sessões são bots. O volume que a mídia parece entregar está inflado.`,
    });
  }

  // ── Tendência (só com linha de base) ───────────────────────────────────────
  if (base.length >= MIN_BASE) {
    const humanas = (x: Metricas) => (x.sessions ?? 0) - (x.botSessions ?? 0);
    const mediaHumanas = base.reduce((a, x) => a + humanas(x), 0) / base.length;
    const agora = humanas(m);
    if (mediaHumanas >= MIN_SESSOES && agora < mediaHumanas * 0.5) {
      p.push({
        chave: "queda_sessoes", tipo: "SITE_CLARITY_ISSUE", severidade: "WARNING",
        titulo: `Sessões qualificadas caíram ${pct(1 - agora / mediaHumanas)}`,
        detalhe: `${Math.round(agora)} sessões humanas hoje contra uma média de ${Math.round(mediaHumanas)} nos ${base.length} dias anteriores.`,
      });
    }

    const temposBase = base.map((x) => x.averageSessionDuration).filter((v): v is number => v !== null);
    if (temposBase.length >= MIN_BASE && m.averageSessionDuration !== null) {
      const mediaTempo = temposBase.reduce((a, b) => a + b, 0) / temposBase.length;
      if (mediaTempo > 0 && m.averageSessionDuration < mediaTempo * 0.5) {
        p.push({
          chave: "engajamento_caiu", tipo: "SITE_CLARITY_ISSUE", severidade: "WARNING",
          titulo: `Tempo no site caiu ${pct(1 - m.averageSessionDuration / mediaTempo)}`,
          detalhe: `${Math.round(m.averageSessionDuration)}s hoje contra ${Math.round(mediaTempo)}s de média. Se o gasto de mídia não caiu, o tráfego mudou de qualidade.`,
        });
      }
    }
  }

  return p;
}

/**
 * Roda o ciclo para todos os clientes com Clarity. Dedup por
 * (tipo, cliente:problema, dia) — o mesmo problema não repete no mesmo dia.
 * Cada alerta leva o destino: abre o cliente certo na aba Clarity.
 */
export async function runClarityAlertas(): Promise<{ contas: number; alertas: number; dormentes: number }> {
  const contas = await contasComClarity();
  const dia = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  let alertas = 0, dormentes = 0;

  for (const c of contas) {
    const nome = c.nome ?? `#${c.accountId}`;
    try {
      const serie = await serieClaritySnapshots(c.accountId, 8); // mais recente primeiro
      if (serie.length === 0) continue;
      const atual = serie[0].metricsJson as Metricas | null;
      if (!atual) continue;
      const base = serie.slice(1).map((s) => s.metricsJson as Metricas).filter(Boolean);
      if (base.length < MIN_BASE) dormentes++; // regras de tendência ainda sem chão

      const problemas = analisarSnapshot(atual, base);
      for (const p of problemas) {
        // O tipo do catálogo é SITE_*; o alerts.type no banco segue o enum antigo.
        const alertType = p.tipo === "SITE_TRACKING_PROBLEM" ? "TRACKING_PROBLEM" : "CLARITY_ISSUE";
        const criados = await createNotification({
          tipo: p.tipo, alertType, severity: p.severidade,
          title: `${nome}: ${p.titulo}`, message: p.detalhe,
          referencia: `${c.accountId}:${p.chave}`, dia,
          accountId: c.accountId,
          // Destino: abre este cliente já na aba de comportamento no site.
          suggestedAction: `/clarity?account=${c.accountId}`,
        });
        if (criados.length) { alertas++; logger.info(`[Clarity] alerta "${p.chave}" em ${nome} → ${criados.length} pessoa(s)`); }
      }
    } catch (e) {
      logger.error(`[Clarity] Falha ao analisar ${nome}: ${(e as Error).message}`);
    }
  }
  logger.info(`[Clarity] Análise completa — ${alertas} alerta(s) em ${contas.length} cliente(s)${dormentes ? ` · ${dormentes} ainda sem linha de base para regras de tendência` : ""}.`);
  return { contas: contas.length, alertas, dormentes };
}
