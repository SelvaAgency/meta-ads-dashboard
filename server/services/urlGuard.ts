/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Guarda de URL — proteção contra SSRF
 * ─────────────────────────────────────────────────────────────────────────────
 *  Os checks de site fazem o SERVIDOR buscar uma URL que veio de um formulário.
 *  Sem guarda, isso é uma arma: um admin (ou alguém que assuma a conta dele)
 *  poderia apontar para http://169.254.169.254 e ler credenciais da nuvem, ou
 *  varrer a rede interna do Railway usando nosso backend como proxy.
 *
 *  Por isso:
 *   · só http/https — nada de file://, gopher://, ftp://
 *   · DNS é resolvido ANTES de conectar, e o IP é validado. Não basta olhar o
 *     hostname: "evil.com" pode resolver para 127.0.0.1 (DNS rebinding).
 *   · faixas privadas, loopback, link-local e metadata bloqueadas — IPv4 e IPv6.
 *   · redirect é validado a cada salto: um destino público pode redirecionar
 *     para um interno.
 *
 *  Isto não é paranoia teórica: é a classe de bug que vaza chave de produção.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { lookup } from "node:dns/promises";
import net from "node:net";

export class UrlBloqueadaError extends Error {}

/** Faixas que nunca podem ser alvo. */
function ipPrivado(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 10) return true;                          // 10.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return true;   // 172.16.0.0/12
    if (a === 192 && b === 168) return true;            // 192.168.0.0/16
    if (a === 127) return true;                         // loopback
    if (a === 169 && b === 254) return true;            // link-local + metadata (169.254.169.254)
    if (a === 0) return true;                           // 0.0.0.0/8
    if (a === 100 && b >= 64 && b <= 127) return true;  // CGNAT 100.64.0.0/10
    if (a >= 224) return true;                          // multicast/reservado
    return false;
  }
  if (net.isIPv6(ip)) {
    const x = ip.toLowerCase();
    if (x === "::1" || x === "::") return true;                 // loopback
    if (x.startsWith("fc") || x.startsWith("fd")) return true;  // unique local
    if (x.startsWith("fe80")) return true;                      // link-local
    if (x.startsWith("ff")) return true;                        // multicast
    // IPv4 mapeado (::ffff:127.0.0.1) — precisa validar o IPv4 de dentro
    const m = x.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (m) return ipPrivado(m[1]);
    return false;
  }
  return true; // não sei o que é → não vou lá
}

export type UrlSegura = { url: string; hostname: string; ip: string };

/**
 * Valida e normaliza. Lança UrlBloqueadaError com motivo legível — a mensagem
 * vai para a tela, então precisa explicar sem jargão.
 */
export async function validarUrlPublica(bruta: string): Promise<UrlSegura> {
  const texto = (bruta ?? "").trim();
  if (!texto) throw new UrlBloqueadaError("Informe uma URL.");

  let u: URL;
  try {
    u = new URL(texto.includes("://") ? texto : `https://${texto}`);
  } catch {
    throw new UrlBloqueadaError("URL inválida.");
  }

  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new UrlBloqueadaError("Só endereços http:// ou https:// são aceitos.");
  }
  if (u.username || u.password) {
    throw new UrlBloqueadaError("URL com usuário e senha não é aceita.");
  }

  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) {
    throw new UrlBloqueadaError("Endereços internos não podem ser testados.");
  }

  // Se já é um IP literal, valida direto. Se é nome, resolve — o hostname
  // sozinho não diz nada: um domínio público pode apontar para 127.0.0.1.
  let ip: string;
  if (net.isIP(host)) {
    ip = host;
  } else {
    try {
      const r = await lookup(host);
      ip = r.address;
    } catch {
      throw new UrlBloqueadaError("Não foi possível resolver este domínio.");
    }
  }
  if (ipPrivado(ip)) {
    throw new UrlBloqueadaError("Este endereço aponta para a rede interna e não pode ser testado.");
  }

  return { url: u.toString(), hostname: host, ip };
}

/**
 * fetch com a guarda em cada salto. Não usa `redirect: "follow"` de propósito:
 * o follow automático pularia a validação e um site público poderia redirecionar
 * para 169.254.169.254.
 */
export async function fetchSeguro(
  urlInicial: string,
  opts: {
    method?: string; timeoutMs?: number; maxRedirects?: number;
    /**
     * Headers extras (ex.: Authorization do WooCommerce). Quem manda credencial
     * deve usar maxRedirects: 0 — seguir redirect com Authorization entregaria
     * a credencial ao destino do redirect.
     */
    headers?: Record<string, string>;
  } = {},
): Promise<{ resp: Response; finalUrl: string; saltos: number }> {
  const { method = "GET", timeoutMs = 15_000, maxRedirects = 5 } = opts;
  let alvo = (await validarUrlPublica(urlInicial)).url;
  let saltos = 0;

  for (;;) {
    const resp = await fetch(alvo, {
      method,
      redirect: "manual", // cada salto passa pela guarda
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "User-Agent": "SelvaSpaces-SiteCheck/1.0 (+https://spaces.selva.agency)", ...(opts.headers ?? {}) },
    });

    const loc = resp.headers.get("location");
    if (resp.status >= 300 && resp.status < 400 && loc) {
      if (saltos >= maxRedirects) throw new UrlBloqueadaError("Redirecionamentos demais — o site pode estar em laço.");
      const proximo = new URL(loc, alvo).toString();
      alvo = (await validarUrlPublica(proximo)).url; // valida o destino do redirect
      saltos++;
      continue;
    }
    return { resp, finalUrl: alvo, saltos };
  }
}
