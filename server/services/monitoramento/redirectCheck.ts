/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Coletor de redirecionamento — para onde o site REALMENTE leva
 * ─────────────────────────────────────────────────────────────────────────────
 *  Reaproveita `fetchSeguro`, que já valida CADA salto contra a guarda de SSRF.
 *  Escrever um laço próprio de redirect aqui duplicaria lógica de segurança —
 *  o tipo de duplicação que envelhece mal e some da revisão.
 *
 *  ── Só a cabeça do documento ───────────────────────────────────────────────
 *  A leitura para quando `</head>` fecha, com teto de 512 KB. O teto anterior
 *  era 64 KB, escolhido supondo que "o head cabe com folga" — e uma sondagem no
 *  site real da Aiká mostrou o `<title>` em 123 KB e o canonical em 123,3 KB
 *  (a Wix injeta ~120 KB de script antes deles). Com 64 KB a checagem de
 *  canonical NUNCA dispararia, e em silêncio: sem erro, só um `null` eterno.
 *
 *  Parar no `</head>` é o que mantém o custo baixo em site normal (fecha em
 *  poucos KB) sem quebrar em site pesado. O teto continua existindo porque um
 *  site hostil pode servir corpo infinito.
 *
 *  ── Cegueira parcial conhecida: selva.agency ───────────────────────────────
 *  Medido em 05/08/2026: o site da própria Selva consome os 512 KB do teto sem
 *  fechar o `<head>`. Consequência REAL e aceita: para esse domínio, `canonical`
 *  e `tituloTrecho` voltam `null`, e a checagem `canonical_externo` não roda.
 *
 *  Fica registrado em vez de corrigido porque o que mais importa continua
 *  funcionando ali (DNS e destino), e subir o teto para acomodar um site
 *  específico penalizaria todos os outros. Se um dia o canonical da Selva
 *  passar a importar, o caminho é medir onde o `</head>` realmente fecha —
 *  não chutar um teto maior.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { fetchSeguro } from "../urlGuard";
import { normalizarHost } from "./dominioRegistravel";

/** Teto absoluto — só entra em ação se `</head>` nunca aparecer. */
const MAX_BYTES = 512 * 1024;
const FIM_DA_CABECA = Buffer.from("</head>", "utf8");

export interface LeituraRedirect {
  urlInicial: string;
  /** Conseguiu falar com o servidor. Diferente de "está tudo bem". */
  ok: boolean;
  statusCode: number | null;
  finalUrl: string | null;
  saltos: number;
  /** Por onde passou — vira evidência do alerta. */
  cadeia: string[];
  canonical: string | null;
  tituloTrecho: string | null;
  erro: string | null;
  emMs: number;
  lidoEm: string;
}

/**
 * Extrai o canonical do HTML.
 *
 * Regex e não parser de DOM: é uma tag no `<head>`, e trazer um parser para
 * dentro de um coletor que roda a cada 5 minutos não se paga. O valor é
 * TRUNCADO — vai virar evidência exibida, e conteúdo externo nunca entra
 * inteiro.
 */
export function extrairCanonical(html: string): string | null {
  const m = html.match(/<link[^>]+rel=["']?canonical["']?[^>]*>/i);
  if (!m) return null;
  const href = m[0].match(/href=["']([^"']+)["']/i);
  return href ? href[1].slice(0, 500) : null;
}

/**
 * Título, para registrar mudança brusca. Truncado e sem tags.
 *
 * Localiza a abertura e corta — em vez de exigir `</title>` dentro de um limite
 * no próprio regex. A versão anterior usava `{0,300}?` e devolvia `null` quando
 * o título passava de 300 caracteres, o que é pior do que parece: título
 * inflado é sintoma de injeção de SEO, então o caso que mais interessa era
 * exatamente o que sumia — e sumia como "página sem título", indistinguível de
 * uma página que realmente não tem.
 */
export function extrairTitulo(html: string): string | null {
  const abre = html.match(/<title[^>]*>/i);
  if (!abre) return null;
  const inicio = (abre.index ?? 0) + abre[0].length;
  const resto = html.slice(inicio, inicio + 2000); // teto: não varrer o documento
  const fim = resto.search(/<\/title>/i);
  const bruto = fim >= 0 ? resto.slice(0, fim) : resto;
  return bruto.replace(/\s+/g, " ").trim().slice(0, 200) || null;
}

async function lerCabeca(resp: Response): Promise<string> {
  const reader = resp.body?.getReader();
  if (!reader) return "";
  const partes: Buffer[] = [];
  let total = 0;
  // Sobreposição entre pedaços: `</head>` tem 7 bytes e pode cair na fronteira
  // de dois chunks. Sem guardar a cauda, a marca passaria batida e a leitura
  // iria até o teto — desperdício silencioso.
  let cauda = Buffer.alloc(0);
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      const buf = Buffer.from(value);
      partes.push(buf);
      total += buf.length;
      if (Buffer.concat([cauda, buf]).includes(FIM_DA_CABECA)) break;
      cauda = buf.subarray(Math.max(0, buf.length - FIM_DA_CABECA.length + 1));
      if (total >= MAX_BYTES) break;
    }
  } finally {
    // Encerra a conexão sem baixar o resto do documento.
    await reader.cancel().catch(() => {});
  }
  return Buffer.concat(partes).toString("utf8");
}

/**
 * Segue os redirects e devolve onde parou. Nunca lança — coletor que estoura
 * derruba o ciclo dos outros clientes.
 */
export async function checarRedirect(entrada: string, timeoutMs = 15_000): Promise<LeituraRedirect> {
  const host = normalizarHost(entrada);
  const urlInicial = /^https?:\/\//i.test(entrada) ? entrada.trim() : `https://${host}`;
  const t0 = Date.now();
  const base: LeituraRedirect = {
    urlInicial, ok: false, statusCode: null, finalUrl: null, saltos: 0,
    cadeia: [], canonical: null, tituloTrecho: null, erro: null,
    emMs: 0, lidoEm: new Date().toISOString(),
  };
  if (!host) return { ...base, erro: "Domínio ausente ou inválido.", emMs: 0 };

  try {
    const { resp, finalUrl, saltos, cadeia } = await fetchSeguro(urlInicial, { method: "GET", timeoutMs });
    // Só lê o corpo quando é HTML: baixar imagem ou PDF para procurar
    // `<link rel=canonical>` seria trabalho jogado fora.
    const tipo = resp.headers.get("content-type") ?? "";
    const html = /text\/html|application\/xhtml/i.test(tipo) ? await lerCabeca(resp) : "";
    return {
      ...base,
      ok: true,
      statusCode: resp.status,
      finalUrl, saltos, cadeia,
      canonical: html ? extrairCanonical(html) : null,
      tituloTrecho: html ? extrairTitulo(html) : null,
      emMs: Date.now() - t0,
    };
  } catch (e) {
    const msg = (e as Error).message ?? String(e);
    return {
      ...base,
      erro: /timeout|abort/i.test(msg) ? `Sem resposta em ${Math.round(timeoutMs / 1000)}s.` : msg.slice(0, 200),
      emMs: Date.now() - t0,
    };
  }
}
