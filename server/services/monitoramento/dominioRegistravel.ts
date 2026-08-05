/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Domínio registrável (eTLD+1) — a base de toda comparação do robô
 * ─────────────────────────────────────────────────────────────────────────────
 *  Este arquivo existe por causa de UMA armadilha: "últimos dois rótulos" é a
 *  implementação óbvia e está errada no Brasil.
 *
 *      ultramalhas.com.br  →  "com.br"     ← errado, e catastrófico
 *
 *  O estrago não seria um erro visível. `com.br` casaria com QUALQUER site
 *  brasileiro, então o robô aprovaria um sequestro de domínio para outro
 *  `.com.br` sem dizer nada — falso NEGATIVO, o pior tipo aqui. E na direção
 *  oposta, comparar `com.br` contra `ultramalhas.com.br` alertaria todo dia.
 *
 *  ── Por que lista curada e não um pacote ───────────────────────────────────
 *  A Public Suffix List completa tem ~9 mil entradas e muda. Aqui bastam os
 *  sufixos que os clientes realmente usam, com uma regra de segurança para o
 *  resto: sufixo desconhecido cai no modo ESTRITO (hostname inteiro), nunca no
 *  modo permissivo. Chutar para menos junta dois sites diferentes num mesmo
 *  nome; chutar para mais, no pior caso, gera um alerta a mais — e alerta a
 *  mais é revisável, enquanto sequestro não detectado não é.
 *
 *  ── Subdomínio: some na COMPARAÇÃO, fica no cadastro ───────────────────────
 *  `loja.x.com` e `www.x.com` têm o mesmo domínio registrável, e isso é
 *  correto para a ameaça que o robô persegue: o perigo é o site passar a
 *  apontar para outro DONO, não para outra pasta do mesmo dono. Mover-se entre
 *  subdomínios próprios não é incidente.
 *
 *  O valor guardado em `dominioEsperado` preserva o subdomínio (é o que a tela
 *  mostra); a comparação normaliza os dois lados por esta função. São coisas
 *  diferentes de propósito.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * Sufixos de dois rótulos onde o registro acontece no TERCEIRO nível.
 * Brasil primeiro, que é o caso que motivou o arquivo.
 */
const SUFIXOS_COMPOSTOS = new Set([
  "com.br", "net.br", "org.br", "gov.br", "edu.br", "art.br", "ind.br",
  "eco.br", "adv.br", "med.br", "blog.br", "app.br", "dev.br", "srv.br",
  "tur.br", "esp.br", "flog.br", "nom.br", "psi.br", "vet.br",
  "co.uk", "org.uk", "me.uk", "gov.uk", "ac.uk",
  "com.au", "net.au", "org.au", "com.ar", "com.mx", "com.co", "com.pt",
  "com.es", "com.pe", "com.uy", "co.nz", "co.za", "co.jp", "co.in",
]);

/**
 * TLDs de rótulo único em que o registro é no segundo nível. Só o que
 * aparece na prática — o desconhecido cai no modo estrito de propósito.
 */
const TLDS_SIMPLES = new Set([
  "com", "net", "org", "io", "co", "app", "dev", "me", "info", "biz",
  "tv", "xyz", "shop", "store", "site", "online", "agency", "studio",
  "digital", "tech", "design", "art", "blog", "club", "life", "world",
  "br", "pt", "ar", "mx", "us", "uk", "es", "fr", "de", "it", "cl", "pe",
]);

/**
 * Reduz uma entrada qualquer a hostname puro: sem esquema, caminho, porta,
 * ponto final ou `www.`.
 *
 * A ordem importa e já custou um bug: `toLowerCase` vem ANTES de tirar o
 * esquema, porque os regex são case-sensitive e `HTTPS://WWW.X.COM` sobrevive
 * ao primeiro replace, perde tudo no segundo e vira a string `"https:"`.
 */
export function normalizarHost(entrada: string): string {
  return String(entrada ?? "")
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, "") // qualquer esquema, não só http(s)
    .replace(/^[^/@]*@/, "")                 // credenciais embutidas
    .replace(/[/?#].*$/, "")                 // caminho, query, fragmento
    .replace(/:\d+$/, "")                    // porta
    .replace(/\.$/, "")                      // raiz DNS explícita
    .replace(/^www\./, "");
}

/**
 * Domínio registrável de uma URL ou hostname. Devolve `null` para entrada que
 * não é domínio (vazio, `localhost`, lixo).
 *
 * Endereço IP volta inteiro: reduzi-lo por rótulos misturaria máquinas
 * diferentes da mesma faixa.
 */
export function dominioRegistravel(entrada: string): string | null {
  const host = normalizarHost(entrada);
  if (!host) return null;

  // IPv4/IPv6 não têm domínio registrável — devolver inteiro é o estrito.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":")) return host;
  if (!host.includes(".")) return null; // "localhost", nome de máquina interna

  const partes = host.split(".").filter(Boolean);
  if (partes.length < 2) return null;

  const doisUltimos = partes.slice(-2).join(".");

  // 1) Sufixo composto conhecido → registro é no terceiro nível.
  if (SUFIXOS_COMPOSTOS.has(doisUltimos)) {
    return partes.length >= 3 ? partes.slice(-3).join(".") : host;
  }

  // 2) TLD simples conhecido → registro é no segundo nível.
  if (TLDS_SIMPLES.has(partes[partes.length - 1])) {
    return partes.slice(-2).join(".");
  }

  // 3) Desconhecido → ESTRITO. Encurtar aqui poderia igualar dois sites de
  //    donos diferentes e esconder exatamente o que o robô procura.
  return host;
}

/**
 * Os dois endereços pertencem ao mesmo domínio registrável?
 *
 * É a pergunta que decide se um redirect é rotina ou incidente. Entrada
 * irreconhecível de qualquer lado devolve `false`: sem saber comparar, o certo
 * é levantar a mão, não aprovar em silêncio.
 */
export function mesmoDominioRegistravel(a: string, b: string): boolean {
  const da = dominioRegistravel(a);
  const db = dominioRegistravel(b);
  if (!da || !db) return false;
  return da === db;
}
