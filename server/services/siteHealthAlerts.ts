/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Alertas de saúde do site
 * ─────────────────────────────────────────────────────────────────────────────
 *  Só alerta o que exige ação de gente. O que não exige vira número na tela.
 *
 *  O que NÃO alerta, de propósito:
 *   · HTTP 403/401 — é WAF ou área restrita, não queda. A UMA responde 403 até
 *     para navegador comum: alertar isso seria alarme falso diário, e alarme
 *     falso ensina todo mundo a ignorar o alerta de verdade.
 *   · header ausente isolado de baixo peso — é dívida, não incidente.
 *   · site lento — vira alerta só quando é absurdo, senão vira rotina.
 *
 *  Destinatários saem do resolver central (admins + dev em técnico +
 *  quem tem alertas por cliente daquele cliente). Dedup por cliente:problema:dia.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { logger } from "../logger";
import { contasComSite, ultimoSnapshotPorProvider, createNotification } from "../db";

const hoje = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

type MetSeg = {
  status?: string; score?: number; https?: boolean; sslValido?: boolean | null;
  daysToSslExpiry?: number | null; redirecionaParaHttps?: boolean | null;
};
type MetUp = { status?: string; statusCode?: number | null; responseTimeMs?: number | null; errorMessage?: string | null };

type Achado = { chave: string; sev: "INFO" | "WARNING" | "CRITICAL"; titulo: string; detalhe: string; aba: string };

/** Regras puras — testáveis sem banco. */
export function acharProblemas(seg: MetSeg | null, up: MetUp | null): Achado[] {
  const p: Achado[] = [];

  // ── Uptime ──
  if (up) {
    if (up.status === "fora_do_ar") {
      p.push({
        chave: "site_fora", sev: "CRITICAL", aba: "uptime",
        titulo: "Site fora do ar",
        detalhe: up.errorMessage
          ? `O site não respondeu: ${up.errorMessage}`
          : `O servidor respondeu com erro ${up.statusCode}. Quem clica no anúncio não chega na página.`,
      });
    } else if (up.status === "erro" && up.statusCode === 404) {
      p.push({
        chave: "url_404", sev: "WARNING", aba: "uptime",
        titulo: "A URL configurada não existe (404)",
        detalhe: "O endereço cadastrado devolve 404. Provavelmente a URL principal mudou — vale corrigir na configuração do site.",
      });
    } else if (up.status === "lento" && (up.responseTimeMs ?? 0) > 8000) {
      // 3s já marca "lento" na tela; alerta só no absurdo, para não virar rotina.
      p.push({
        chave: "site_lento", sev: "WARNING", aba: "uptime",
        titulo: `Site levou ${Math.round((up.responseTimeMs ?? 0) / 1000)}s para responder`,
        detalhe: "Acima de 8 segundos, boa parte de quem clicou no anúncio desiste antes de a página abrir.",
      });
    }
  }

  // ── Segurança ──
  if (seg) {
    if (seg.https === false) {
      p.push({
        chave: "sem_https", sev: "CRITICAL", aba: "seguranca",
        titulo: "O site não usa HTTPS",
        detalhe: "O navegador marca o site como 'Não seguro'. Isso afeta confiança, conversão e posicionamento.",
      });
    } else if (seg.sslValido === false) {
      p.push({
        chave: "ssl_invalido", sev: "CRITICAL", aba: "seguranca",
        titulo: "Certificado SSL inválido",
        detalhe: "O navegador mostra aviso de segurança antes de abrir o site. Na prática, o tráfego pago está sendo desperdiçado.",
      });
    }
    const d = seg.daysToSslExpiry;
    if (typeof d === "number" && d >= 0 && d <= 30) {
      p.push({
        chave: "ssl_expirando", sev: d <= 7 ? "CRITICAL" : "WARNING", aba: "seguranca",
        titulo: `Certificado SSL expira em ${d} dia(s)`,
        detalhe: d <= 7
          ? "Quando expirar, o navegador bloqueia o acesso e o site para de receber visitas. Renove agora."
          : "Vale renovar antes do prazo — site com certificado vencido para de receber visitas.",
      });
    }
    // Só os headers que protegem contra ataque real e comum viram alerta.
    if (seg.status === "atencao" && (seg.score ?? 100) < 50) {
      p.push({
        chave: "headers_criticos", sev: "WARNING", aba: "seguranca",
        titulo: `Segurança básica em ${seg.score}/100`,
        detalhe: "Faltam headers de proteção importantes (HSTS, CSP ou proteção contra iframe). Veja a lista na aba Segurança.",
      });
    }
  }

  return p;
}

export async function runSiteHealthAlertas(): Promise<number> {
  const contas = await contasComSite();
  const dia = hoje();
  let criados = 0;

  for (const c of contas) {
    const nome = c.nome ?? `#${c.accountId}`;
    try {
      const [snapSeg, snapUp] = await Promise.all([
        ultimoSnapshotPorProvider(c.accountId, "security_check"),
        ultimoSnapshotPorProvider(c.accountId, "uptime_check"),
      ]);
      // Só olha o check de hoje: alerta baseado em dado velho é mentira.
      const seg = snapSeg?.dia === dia ? (snapSeg.metricsJson as MetSeg) : null;
      const up = snapUp?.dia === dia ? (snapUp.metricsJson as MetUp) : null;
      if (!seg && !up) continue;

      for (const a of acharProblemas(seg, up)) {
        const users = await createNotification({
          tipo: a.chave.startsWith("ssl") || a.chave === "sem_https" || a.chave === "headers_criticos"
            ? "SITE_TRACKING_PROBLEM"  // é problema técnico: o developer precisa ver
            : "SITE_CLARITY_ISSUE",
          alertType: a.chave.startsWith("ssl") || a.chave === "sem_https" || a.chave === "headers_criticos"
            ? "TRACKING_PROBLEM" : "CLARITY_ISSUE",
          severity: a.sev,
          title: `${nome}: ${a.titulo}`,
          message: a.detalhe,
          referencia: `${c.accountId}:${a.chave}`,
          dia,
          accountId: c.accountId,
          suggestedAction: `/site?account=${c.accountId}&aba=${a.aba}`,
        });
        if (users.length) { criados++; logger.info(`[SiteHealth] alerta "${a.chave}" em ${nome} → ${users.length} pessoa(s)`); }
      }
    } catch (e) {
      logger.error(`[SiteHealth] Falha ao analisar ${nome}: ${(e as Error).message}`);
    }
  }
  return criados;
}
