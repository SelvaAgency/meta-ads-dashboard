/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Sites do portfólio — resumo para bater o olho
 * ─────────────────────────────────────────────────────────────────────────────
 *  Responde uma pergunta só: "algum site está com problema agora?"
 *
 *  Não é o diagnóstico (isso é a seção Site, por cliente). É a triagem: o que
 *  merece alguém abrir hoje. Por isso devolve FRASES prontas com contagem e
 *  destino, não uma matriz de métricas para o olho humano cruzar.
 *
 *  Duas regras herdadas dos alertas, de propósito:
 *   · HTTP 403 é WAF, não queda. A UMA responde 403 até para navegador comum;
 *     contar como "fora do ar" ensinaria todo mundo a ignorar o aviso.
 *   · Ausência de dado nunca vira silêncio. "Nunca testado" aparece como
 *     pendência — senão um site que ninguém mediu parece um site saudável.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { contasComSite, ultimoSiteSnapshot, ultimoSnapshotPorProvider, getClaritySettings, getClientContext } from "../db";

export type Severidade = "critico" | "atencao" | "info" | "pendencia";

export type DestaqueSite = {
  chave: string;
  severidade: Severidade;
  texto: string;
  /** Quando o destaque é de um cliente só, dá para ir direto nele. */
  accountId?: number;
  aba?: string;
};

export type ResumoSites = {
  totalComSite: number;
  destaques: DestaqueSite[];
  /** Um resumo por cliente — a tabelinha embaixo dos destaques. */
  porCliente: {
    accountId: number;
    nome: string;
    score: number | null;
    lcp: number | null;
    notaSeguranca: number | null;
    statusUptime: string | null;
    temClarity: boolean;
    temContexto: boolean;
  }[];
};

/** Faixas do Lighthouse — não invento limiar. */
const LCP_CRITICO = 4000;

export async function resumoSitesPortfolio(): Promise<ResumoSites> {
  const contas = await contasComSite();
  if (contas.length === 0) return { totalComSite: 0, destaques: [], porCliente: [] };

  const linhas = await Promise.all(
    contas.map(async (c) => {
      const [perf, seg, up, cfg, ctx] = await Promise.all([
        ultimoSiteSnapshot(c.accountId),
        ultimoSnapshotPorProvider(c.accountId, "security_check"),
        ultimoSnapshotPorProvider(c.accountId, "uptime_check"),
        getClaritySettings(c.accountId),
        getClientContext(c.accountId),
      ]);
      const pm = (perf?.metricsJson ?? null) as { performanceScore?: number | null; lcp?: number | null } | null;
      const sm = (seg?.metricsJson ?? null) as { score?: number | null; daysToSslExpiry?: number | null; https?: boolean; sslValido?: boolean | null } | null;
      const um = (up?.metricsJson ?? null) as { status?: string } | null;
      return {
        accountId: c.accountId,
        nome: c.nome ?? `#${c.accountId}`,
        perf: pm,
        seg: sm,
        up: um,
        temClarity: !!cfg?.enabled,
        temContexto: !!(ctx && (ctx.objective || ctx.offer || ctx.audience)),
        testado: !!perf,
      };
    }),
  );

  const d: DestaqueSite[] = [];
  const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

  // ── O que está quebrado AGORA ──
  const fora = linhas.filter((l) => l.up?.status === "fora_do_ar");
  if (fora.length) {
    d.push({
      chave: "fora_do_ar", severidade: "critico",
      texto: fora.length === 1 ? `${fora[0].nome}: site fora do ar` : `${fora.length} sites fora do ar`,
      accountId: fora.length === 1 ? fora[0].accountId : undefined, aba: "uptime",
    });
  }

  const sslRuim = linhas.filter((l) => l.seg?.https === false || l.seg?.sslValido === false);
  if (sslRuim.length) {
    d.push({
      chave: "ssl_invalido", severidade: "critico",
      texto: sslRuim.length === 1 ? `${sslRuim[0].nome}: certificado inválido ou sem HTTPS` : `${sslRuim.length} sites com HTTPS quebrado`,
      accountId: sslRuim.length === 1 ? sslRuim[0].accountId : undefined, aba: "seguranca",
    });
  }

  // ── O que quebra em breve ──
  const vencendo = linhas
    .filter((l) => num(l.seg?.daysToSslExpiry) && l.seg!.daysToSslExpiry! <= 30)
    .sort((a, b) => (a.seg!.daysToSslExpiry! - b.seg!.daysToSslExpiry!));
  if (vencendo.length) {
    const p = vencendo[0];
    d.push({
      chave: "ssl_expirando",
      severidade: p.seg!.daysToSslExpiry! <= 7 ? "critico" : "atencao",
      texto: vencendo.length === 1
        ? `${p.nome}: certificado vence em ${p.seg!.daysToSslExpiry} dias`
        : `${vencendo.length} certificados vencem em até 30 dias (o mais próximo: ${p.nome}, ${p.seg!.daysToSslExpiry} dias)`,
      accountId: p.accountId, aba: "seguranca",
    });
  }

  // ── O que custa dinheiro todo dia ──
  const lcpRuim = linhas.filter((l) => num(l.perf?.lcp) && l.perf!.lcp! > LCP_CRITICO);
  if (lcpRuim.length) {
    const pior = [...lcpRuim].sort((a, b) => b.perf!.lcp! - a.perf!.lcp!)[0];
    d.push({
      chave: "lcp_critico", severidade: "atencao",
      texto: lcpRuim.length === 1
        ? `${pior.nome}: LCP de ${(pior.perf!.lcp! / 1000).toFixed(1)}s — quem clica no anúncio espera isso para ver a página`
        : `${lcpRuim.length} sites com LCP crítico (o pior: ${pior.nome}, ${(pior.perf!.lcp! / 1000).toFixed(1)}s)`,
      accountId: lcpRuim.length === 1 ? pior.accountId : undefined, aba: "perf",
    });
  }

  const headersRuins = linhas.filter((l) => num(l.seg?.score) && l.seg!.score! < 50 && l.seg?.https !== false);
  if (headersRuins.length) {
    d.push({
      chave: "headers", severidade: "atencao",
      texto: headersRuins.length === 1
        ? `${headersRuins[0].nome}: segurança básica em ${headersRuins[0].seg!.score}/100 — faltam headers de proteção`
        : `${headersRuins.length} sites com headers de segurança ausentes`,
      accountId: headersRuins.length === 1 ? headersRuins[0].accountId : undefined, aba: "seguranca",
    });
  }

  // ── O que parece problema e não é ──
  const bloqueados = linhas.filter((l) => l.up?.status === "bloqueado");
  if (bloqueados.length) {
    d.push({
      chave: "bloqueado", severidade: "info",
      texto: bloqueados.length === 1
        ? `${bloqueados[0].nome}: acesso bloqueado por WAF (403) — não é queda`
        : `${bloqueados.length} sites bloqueados por WAF (403) — não são quedas`,
      accountId: bloqueados.length === 1 ? bloqueados[0].accountId : undefined, aba: "uptime",
    });
  }

  // ── O que ninguém mediu ──
  const nuncaTestado = linhas.filter((l) => !l.testado);
  if (nuncaTestado.length) {
    d.push({
      chave: "sem_teste", severidade: "pendencia",
      texto: `${nuncaTestado.length} ${nuncaTestado.length === 1 ? "site nunca foi testado" : "sites nunca foram testados"} — sem PageSpeed não dá para saber se são lentos`,
      accountId: nuncaTestado.length === 1 ? nuncaTestado[0].accountId : undefined, aba: "perf",
    });
  }

  const semClarity = linhas.filter((l) => !l.temClarity);
  if (semClarity.length) {
    d.push({
      chave: "sem_clarity", severidade: "pendencia",
      texto: `${semClarity.length} ${semClarity.length === 1 ? "site sem Clarity" : "sites sem Clarity"} — o comportamento de quem visita é invisível`,
      accountId: semClarity.length === 1 ? semClarity[0].accountId : undefined, aba: "clarity",
    });
  }

  const semContexto = linhas.filter((l) => !l.temContexto);
  if (semContexto.length) {
    d.push({
      chave: "sem_contexto", severidade: "pendencia",
      texto: `${semContexto.length} ${semContexto.length === 1 ? "cliente sem contexto" : "clientes sem contexto"} preenchido — o diagnóstico descreve números sem interpretar a intenção`,
      accountId: semContexto.length === 1 ? semContexto[0].accountId : undefined, aba: "contexto",
    });
  }

  return {
    totalComSite: contas.length,
    destaques: d,
    porCliente: linhas.map((l) => ({
      accountId: l.accountId,
      nome: l.nome,
      score: num(l.perf?.performanceScore) ? l.perf!.performanceScore! : null,
      lcp: num(l.perf?.lcp) ? l.perf!.lcp! : null,
      notaSeguranca: num(l.seg?.score) ? l.seg!.score! : null,
      statusUptime: l.up?.status ?? null,
      temClarity: l.temClarity,
      temContexto: l.temContexto,
    })),
  };
}
