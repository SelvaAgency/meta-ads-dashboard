/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Saúde do site — segurança básica e uptime (checks próprios)
 * ─────────────────────────────────────────────────────────────────────────────
 *  Dois checks feitos por nós, sem depender de fornecedor nem de cota:
 *
 *   · SEGURANÇA BÁSICA — HTTPS, validade do certificado, redirect HTTP→HTTPS e
 *     headers de segurança. É o que dá para saber olhando de fora, sem crawler.
 *     NÃO é auditoria de segurança: não testa aplicação, não procura vulnerabi-
 *     lidade, não olha dependência. A UI diz isso; aqui fica registrado também.
 *
 *   · UPTIME — o site responde? em quanto tempo? redireciona para onde?
 *
 *  Toda requisição passa pelo urlGuard (anti-SSRF). Sem exceção.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import tls from "node:tls";
import { logger } from "../logger";
import { validarUrlPublica, fetchSeguro, UrlBloqueadaError } from "./urlGuard";

export { UrlBloqueadaError };

// ─── Uptime ──────────────────────────────────────────────────────────────────

export type UptimeCheck = {
  /**
   * `bloqueado` existe porque 403/401 NÃO é site fora do ar — é WAF, proteção
   * de bot ou área restrita. Tratar isso como incidente geraria alarme falso
   * todo dia (a UMA responde 403 até para navegador comum).
   */
  status: "no_ar" | "lento" | "bloqueado" | "erro" | "fora_do_ar";
  statusCode: number | null;
  responseTimeMs: number | null;
  finalUrl: string | null;
  redirects: number;
  errorMessage: string | null;
  checkedAt: Date;
};

/** Acima disso o site está no ar, mas devagar o bastante para custar conversão. */
const LENTO_MS = 3000;

export async function checarUptime(url: string): Promise<UptimeCheck> {
  // URL proibida/inválida LANÇA: não é "site fora do ar", é configuração errada.
  // Confundir os dois faria o alerta de queda disparar por causa de um endereço
  // mal digitado — e esconderia uma tentativa de SSRF atrás de um status verde.
  await validarUrlPublica(url);
  const t0 = Date.now();
  const base: UptimeCheck = {
    status: "fora_do_ar", statusCode: null, responseTimeMs: null,
    finalUrl: null, redirects: 0, errorMessage: null, checkedAt: new Date(),
  };
  try {
    // GET, não HEAD: muito servidor responde HEAD diferente (ou 405), e o que
    // interessa é o que o usuário recebe de verdade.
    const { resp, finalUrl, saltos } = await fetchSeguro(url, { method: "GET", timeoutMs: 20_000 });
    const ms = Date.now() - t0;
    const status: UptimeCheck["status"] =
      resp.status >= 500 ? "fora_do_ar"                       // servidor quebrou: é incidente
        : resp.status === 403 || resp.status === 401 ? "bloqueado" // WAF/restrito: não é queda
        : resp.status >= 400 ? "erro"                          // 404 e cia: a URL está errada
        : ms > LENTO_MS ? "lento"
        : "no_ar";
    return { ...base, status, statusCode: resp.status, responseTimeMs: ms, finalUrl, redirects: saltos };
  } catch (e) {
    const msg = (e as Error).message;
    return {
      ...base,
      responseTimeMs: Date.now() - t0,
      errorMessage: /timeout|abort/i.test(msg) ? "O site não respondeu a tempo (20s)." : msg.slice(0, 200),
    };
  }
}

// ─── Segurança básica ────────────────────────────────────────────────────────

export type HeaderCheck = { nome: string; presente: boolean; valor: string | null; peso: number; recomendacao: string };

export type SecurityCheck = {
  status: "bom" | "atencao" | "critico";
  score: number;                       // 0–100, explicável pelos itens abaixo
  https: boolean;
  redirecionaParaHttps: boolean | null;
  sslValido: boolean | null;
  certificateExpiresAt: Date | null;
  daysToSslExpiry: number | null;
  emissor: string | null;
  headers: HeaderCheck[];
  achados: string[];
  recomendacoes: string[];
  checkedAt: Date;
};

/**
 * Pesos: o que quebra a segurança de verdade vale mais. HSTS e CSP protegem
 * contra ataques reais e comuns; Permissions-Policy é higiene.
 */
const HEADERS = [
  { nome: "Strict-Transport-Security", peso: 20, recomendacao: "Adicionar HSTS obriga o navegador a usar HTTPS, mesmo se alguém tentar forçar HTTP." },
  { nome: "Content-Security-Policy", peso: 20, recomendacao: "Revisar a CSP — é a principal defesa contra scripts injetados." },
  { nome: "X-Frame-Options", peso: 15, recomendacao: "Impedir que o site seja carregado em iframe de terceiros (clickjacking). Alternativa: frame-ancestors na CSP." },
  { nome: "X-Content-Type-Options", peso: 10, recomendacao: "Adicionar nosniff evita que o navegador adivinhe o tipo de arquivo." },
  { nome: "Referrer-Policy", peso: 10, recomendacao: "Definir a política de referrer evita vazar a URL de origem para terceiros." },
  { nome: "Permissions-Policy", peso: 5, recomendacao: "Restringir câmera, microfone e localização ao que o site realmente usa." },
] as const;

/** Certificado: abre uma conexão TLS só para ler a validade. */
async function lerCertificado(hostname: string): Promise<{ valido: boolean; expiraEm: Date | null; emissor: string | null }> {
  return new Promise((resolve) => {
    const s = tls.connect({ host: hostname, port: 443, servername: hostname, timeout: 10_000 }, () => {
      const cert = s.getPeerCertificate();
      const valido = s.authorized;
      const expira = cert?.valid_to ? new Date(cert.valid_to) : null;
      const org = cert?.issuer?.O ?? cert?.issuer?.CN ?? null;
      const emissor = Array.isArray(org) ? (org[0] ?? null) : (org ?? null);
      s.destroy();
      resolve({ valido, expiraEm: expira && !isNaN(expira.getTime()) ? expira : null, emissor });
    });
    s.on("error", () => { s.destroy(); resolve({ valido: false, expiraEm: null, emissor: null }); });
    s.on("timeout", () => { s.destroy(); resolve({ valido: false, expiraEm: null, emissor: null }); });
  });
}

export async function checarSeguranca(url: string): Promise<SecurityCheck> {
  const alvo = await validarUrlPublica(url); // lança se for interna/inválida
  const achados: string[] = [];
  const recomendacoes: string[] = [];

  const { resp, finalUrl } = await fetchSeguro(alvo.url, { method: "GET", timeoutMs: 20_000 });
  const https = new URL(finalUrl).protocol === "https:";

  // O site força HTTPS? Testa o http:// e vê onde termina.
  let redirecionaParaHttps: boolean | null = null;
  try {
    const r = await fetchSeguro(`http://${alvo.hostname}`, { method: "GET", timeoutMs: 15_000 });
    redirecionaParaHttps = new URL(r.finalUrl).protocol === "https:";
  } catch { redirecionaParaHttps = null; } // não deu para saber; não invento

  // Certificado
  let sslValido: boolean | null = null, certificateExpiresAt: Date | null = null;
  let daysToSslExpiry: number | null = null, emissor: string | null = null;
  if (https) {
    const c = await lerCertificado(new URL(finalUrl).hostname);
    sslValido = c.valido;
    certificateExpiresAt = c.expiraEm;
    emissor = c.emissor;
    if (c.expiraEm) daysToSslExpiry = Math.floor((c.expiraEm.getTime() - Date.now()) / 86400000);
  }

  // Headers
  const headers: HeaderCheck[] = HEADERS.map((h) => {
    const valor = resp.headers.get(h.nome.toLowerCase());
    return { nome: h.nome, presente: !!valor, valor: valor ? valor.slice(0, 120) : null, peso: h.peso, recomendacao: h.recomendacao };
  });

  // Score: começa em 100 e desconta o que falta. Explicável item a item.
  let score = 100;
  if (!https) { score -= 40; achados.push("O site não usa HTTPS."); recomendacoes.push("Instalar um certificado SSL e servir tudo por HTTPS."); }
  if (https && sslValido === false) { score -= 30; achados.push("O certificado SSL não é válido (expirado, domínio errado ou cadeia incompleta)."); recomendacoes.push("Revisar o certificado com quem hospeda o site."); }
  if (redirecionaParaHttps === false) { score -= 10; achados.push("Quem acessa por http:// não é redirecionado para https://."); recomendacoes.push("Redirecionar todo o tráfego HTTP para HTTPS."); }
  if (daysToSslExpiry !== null && daysToSslExpiry <= 30) {
    score -= daysToSslExpiry <= 7 ? 20 : 10;
    achados.push(`O certificado SSL expira em ${daysToSslExpiry} dia(s).`);
    recomendacoes.push("Renovar o certificado antes que expire — site com SSL vencido para de receber visitas.");
  }
  for (const h of headers) {
    if (!h.presente) { score -= h.peso; achados.push(`Header ausente: ${h.nome}.`); recomendacoes.push(h.recomendacao); }
  }
  score = Math.max(0, Math.min(100, score));

  // Sem HTTPS ou SSL quebrado é crítico independentemente do resto: é o que
  // afeta quem visita o site agora.
  const critico = !https || sslValido === false || (daysToSslExpiry !== null && daysToSslExpiry <= 7);
  const status: SecurityCheck["status"] = critico ? "critico" : score >= 70 ? "bom" : "atencao";

  return {
    status, score, https, redirecionaParaHttps, sslValido, certificateExpiresAt,
    daysToSslExpiry, emissor, headers, achados, recomendacoes, checkedAt: new Date(),
  };
}

export function logSaude(msg: string) {
  logger.info(`[SiteHealth] ${msg}`);
}
