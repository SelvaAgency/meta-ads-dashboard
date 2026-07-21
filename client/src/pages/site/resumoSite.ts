/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  O que dizer no Resumo do cliente — lógica pura, sem React
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  A aba Resumo precisa responder quatro perguntas: como estão as fontes, o que
 *  precisa de ação, o que está bem e qual o próximo passo. As duas do meio são
 *  julgamento, não renderização — então ficam aqui, testáveis, em vez de
 *  espalhadas em JSX.
 *
 *  Regra que atravessa o arquivo: ausência de dado NUNCA vira frase de
 *  problema. "Nunca testado" e "com problema" são coisas diferentes, e tratar
 *  as duas igual ensina o time a ignorar as duas.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import type { Fonte } from "@shared/fontes";

export type AbaDestino = "resumo" | "performance" | "tecnico" | "relatorios" | "contexto" | "chat";

export type AcaoResumo = {
  texto: string;
  /** Frase acionável — vira o "Próximo passo" quando esta é a ação mais urgente. */
  proximoPasso: string;
  grave: boolean;
  ir?: AbaDestino;
};

type Num = number | null | undefined;
const n = (v: Num): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export type DadosResumo = {
  fontes: Fonte[];
  m?: { sessions?: Num; javascriptErrors?: Num; deadClicks?: Num; rageClicks?: Num; averageScrollDepth?: Num } | null;
  pm?: { performanceScore?: Num; lcp?: Num; cls?: Num } | null;
  seg?: { score?: Num; https?: boolean; sslValido?: boolean | null; daysToSslExpiry?: Num } | null;
  up?: { status?: string | null; responseTimeMs?: Num } | null;
  temCtx?: boolean;
};

/** Faixas do Lighthouse e dos alertas já existentes — não invento limiar novo. */
const LCP_CRITICO = 4000;
const SCORE_RUIM = 50;
const SSL_URGENTE = 7;
const SSL_PROXIMO = 30;
const SEGURANCA_FRACA = 50;

/**
 * O que precisa de ação, do mais grave para o menos. Lista curta de propósito:
 * um "precisa de ação" com quinze itens não é priorização, é inventário.
 */
export function acoesDoResumo(d: DadosResumo): AcaoResumo[] {
  const acoes: AcaoResumo[] = [];
  const fonte = (chave: string) => d.fontes.find((f) => f.chave === chave);

  // ── Site fora do ar: nada mais importa enquanto isso for verdade ──────────
  if (d.up?.status === "fora_do_ar") {
    acoes.push({
      texto: "O site não está respondendo.",
      proximoPasso: "Verificar a hospedagem — o site não está respondendo.",
      grave: true, ir: "tecnico",
    });
  }

  // ── Segurança ─────────────────────────────────────────────────────────────
  if (d.seg?.https === false) {
    acoes.push({
      texto: "O site não usa HTTPS.",
      proximoPasso: "Instalar certificado e forçar HTTPS no site.",
      grave: true, ir: "tecnico",
    });
  }
  if (d.seg?.sslValido === false) {
    acoes.push({
      texto: "O certificado SSL está inválido.",
      proximoPasso: "Renovar o certificado SSL — ele está inválido.",
      grave: true, ir: "tecnico",
    });
  }
  const dias = n(d.seg?.daysToSslExpiry);
  if (dias !== null && dias >= 0 && dias <= SSL_PROXIMO) {
    acoes.push({
      texto: `O certificado SSL expira em ${dias} dia(s).`,
      proximoPasso: `Renovar o certificado SSL — expira em ${dias} dia(s).`,
      grave: dias <= SSL_URGENTE, ir: "tecnico",
    });
  }

  // ── Fontes com erro registrado ────────────────────────────────────────────
  for (const chave of ["clarity", "pagespeed", "meta", "google_ads"]) {
    const f = fonte(chave);
    if (f?.status === "erro" || f?.status === "atencao") {
      acoes.push({
        texto: `${f.rotulo}: ${f.porque ?? "precisa de atenção."}`,
        proximoPasso: `Reconectar ${f.rotulo} — ${f.porque ?? "a fonte precisa de atenção."}`,
        grave: f.status === "erro",
        ir: chave === "clarity" ? "performance" : chave === "pagespeed" ? "tecnico" : undefined,
      });
    }
  }

  // ── Carregamento ──────────────────────────────────────────────────────────
  const lcp = n(d.pm?.lcp);
  if (lcp !== null && lcp > LCP_CRITICO) {
    acoes.push({
      texto: `O maior elemento da página leva ${(lcp / 1000).toFixed(1)}s para aparecer.`,
      proximoPasso: "Reduzir o LCP — a página demora demais para mostrar o conteúdo principal.",
      grave: false, ir: "tecnico",
    });
  }
  const score = n(d.pm?.performanceScore);
  if (score !== null && score < SCORE_RUIM) {
    acoes.push({
      texto: `Nota de performance em ${score}/100.`,
      proximoPasso: "Atacar as recomendações de performance — a nota está baixa.",
      grave: false, ir: "tecnico",
    });
  }

  // ── Comportamento ─────────────────────────────────────────────────────────
  const sessoes = n(d.m?.sessions) ?? 0;
  if (sessoes > 0) {
    const erros = n(d.m?.javascriptErrors) ?? 0;
    if (erros > 0) {
      acoes.push({
        texto: `Erros de JavaScript em ${erros} sessão(ões) — podem quebrar o disparo de conversão.`,
        proximoPasso: "Investigar os erros de JavaScript — eles podem estar quebrando a medição de conversão.",
        grave: false, ir: "performance",
      });
    }
    const rage = n(d.m?.rageClicks) ?? 0;
    if (rage > 0) {
      acoes.push({
        texto: `${rage} sessão(ões) com rage clicks — sinal de fricção na interface.`,
        proximoPasso: "Ver onde estão os rage clicks — há fricção na interface.",
        grave: false, ir: "performance",
      });
    }
  }

  // ── Segurança fraca (depois do resto: é melhoria, não incêndio) ───────────
  const segScore = n(d.seg?.score);
  if (segScore !== null && segScore < SEGURANCA_FRACA) {
    acoes.push({
      texto: `Nota de segurança em ${segScore}/100 — faltam headers de proteção.`,
      proximoPasso: "Adicionar os headers de segurança que faltam.",
      grave: false, ir: "tecnico",
    });
  }

  // Graves primeiro, mantendo a ordem de detecção dentro de cada grupo.
  return [...acoes.filter((a) => a.grave), ...acoes.filter((a) => !a.grave)].slice(0, 6);
}

/**
 * O que está bem. Só entra o que foi de fato MEDIDO — ausência de dado não é
 * boa notícia, e "sem problema detectado" num site que ninguém testou seria
 * mentira confortável.
 */
export function positivosDoResumo(d: DadosResumo): string[] {
  const bons: string[] = [];

  if (d.up?.status === "no_ar") {
    const ms = n(d.up?.responseTimeMs);
    bons.push(ms !== null ? `Site no ar, respondendo em ${ms}ms.` : "Site no ar.");
  }

  const segScore = n(d.seg?.score);
  if (segScore !== null && segScore >= 70) bons.push(`Segurança em ${segScore}/100.`);

  const score = n(d.pm?.performanceScore);
  if (score !== null && score >= 90) bons.push(`Performance em ${score}/100.`);
  else if (score !== null && score >= 50) {
    const lcp = n(d.pm?.lcp);
    if (lcp !== null && lcp <= 2500) bons.push(`Carregamento dentro do esperado (LCP ${(lcp / 1000).toFixed(1)}s).`);
  }

  const sessoes = n(d.m?.sessions) ?? 0;
  if (sessoes > 0 && (n(d.m?.javascriptErrors) ?? 0) === 0) {
    bons.push("Nenhum erro de JavaScript nas sessões medidas.");
  }

  const conectadas = d.fontes.filter((f) => f.status === "ok").length;
  if (conectadas >= 4) bons.push(`${conectadas} fontes conectadas e sem pendência.`);

  return bons;
}
