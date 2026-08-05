/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Coletor de conteúdo — o que foi publicado no blog do cliente
 * ─────────────────────────────────────────────────────────────────────────────
 *  Quatro caminhos, tentados em ordem de riqueza: REST do WordPress → RSS →
 *  sitemap → HTML da listagem. Cada degrau abaixo entrega menos campos, e é
 *  isso que justifica a ordem: a REST traz título, data, autor, categoria e
 *  resumo; o sitemap traz só URL.
 *
 *  ── "Não consegui ler" nunca é "está tudo bem" ─────────────────────────────
 *  Este é o ponto que decide se o coletor é honesto. Um WordPress com a REST
 *  bloqueada, um WAF na frente ou um blog que mudou de endereço fazem a leitura
 *  falhar — e uma falha que virasse "nenhum post suspeito" seria uma mentira
 *  que se repetiria a cada ciclo, silenciosamente, para sempre. Falha vira
 *  `fonte: "nenhuma"`, e o avaliador transforma isso em WARNING explícito.
 *
 *  ── XML por regex, e por quê ───────────────────────────────────────────────
 *  RSS e sitemap são lidos com regex em vez de um parser de XML. Trazer uma
 *  dependência de parser para ler `<item><title>` de um feed, num coletor que
 *  já trunca tudo e não confia em nada do que lê, não se paga. O custo é não
 *  aceitar XML exótico — e o custo de errar é cair para o próximo fallback,
 *  que é o comportamento certo de qualquer forma.
 *
 *  ── Nada do que chega aqui é confiável ─────────────────────────────────────
 *  Se o blog foi invadido, o conteúdo é escrito pelo invasor. Tudo entra
 *  truncado, sem tags, e nenhum link externo é seguido — o coletor lê a
 *  listagem e para. `fetchSeguro` valida cada salto contra a guarda de SSRF.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { fetchSeguro } from "../urlGuard";
import { normalizarHost } from "./dominioRegistravel";

/** Teto por resposta. Uma listagem de 20 posts cabe com folga. */
const MAX_BYTES = 1024 * 1024;
const MAX_POSTS = 30;
const CORTE_TITULO = 200;
const CORTE_RESUMO = 600;

export type FonteConteudo = "rest" | "rss" | "sitemap" | "html" | "nenhuma";

export interface PostBlog {
  /** Estável entre leituras — é o que define "post novo". */
  id: string;
  url: string;
  titulo: string;
  /** ISO, quando a fonte informa. Sitemap e HTML costumam não informar. */
  data: string | null;
  autor: string | null;
  categorias: string[];
  resumo: string;
}

export interface LeituraConteudo {
  fonte: FonteConteudo;
  /** Conseguiu LER. Diferente de "não há nada suspeito". */
  ok: boolean;
  posts: PostBlog[];
  /** Todas as tentativas, com o motivo de cada falha — vira evidência. */
  tentativas: { fonte: FonteConteudo; url: string; resultado: string }[];
  erro: string | null;
  emMs: number;
  lidoEm: string;
}

/**
 * Entidades comuns viram texto. O resumo da REST vem RENDERIZADO — sem isto, a
 * evidência mostrada na aba e no e-mail sai com `&nbsp;` e `&#8217;` no meio da
 * frase, o que faz um alerta legítimo parecer defeito do robô.
 */
const decodificar = (v: string) =>
  v.replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");

const corta = (v: unknown, n: number) =>
  decodificar(String(v ?? "").replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim().slice(0, n);

/** Desfaz CDATA e as entidades que aparecem em feed. */
const limparXml = (v: string) =>
  v.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
    .replace(/&amp;/g, "&");

const tag = (bloco: string, nome: string): string => {
  const m = new RegExp(`<${nome}[^>]*>([\\s\\S]*?)</${nome}>`, "i").exec(bloco);
  return m ? limparXml(m[1]) : "";
};

/** Lê o corpo com teto. Nunca lança. */
async function lerCorpo(resp: Response): Promise<string> {
  const reader = resp.body?.getReader();
  if (!reader) return "";
  const partes: Buffer[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      const buf = Buffer.from(value);
      partes.push(buf);
      total += buf.length;
      if (total >= MAX_BYTES) break;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return Buffer.concat(partes).toString("utf8");
}

// ─── Os quatro leitores ──────────────────────────────────────────────────────

/**
 * REST do WordPress. `_fields` reduz a resposta ao necessário — sem isso, cada
 * post vem com o conteúdo inteiro renderizado, e 20 posts viram megabytes.
 */
export function postsDaRest(corpo: string): PostBlog[] {
  let dados: unknown;
  try { dados = JSON.parse(corpo); } catch { return []; }
  if (!Array.isArray(dados)) return [];
  return dados.slice(0, MAX_POSTS).map((p) => {
    const o = p as Record<string, any>;
    return {
      id: String(o.id ?? o.link ?? ""),
      url: corta(o.link, 500),
      titulo: corta(o.title?.rendered ?? o.title, CORTE_TITULO),
      data: typeof o.date === "string" ? o.date : null,
      autor: o.author != null ? String(o.author).slice(0, 60) : null,
      categorias: Array.isArray(o.categories) ? o.categories.slice(0, 10).map(String) : [],
      resumo: corta(o.excerpt?.rendered ?? o.excerpt, CORTE_RESUMO),
    };
  }).filter((p) => p.id && p.url);
}

export function postsDoRss(corpo: string): PostBlog[] {
  const itens = corpo.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? [];
  return itens.slice(0, MAX_POSTS).map((b) => {
    const link = corta(tag(b, "link"), 500);
    return {
      // `guid` é o id do feed; sem ele o link serve, e é estável o bastante.
      id: corta(tag(b, "guid"), 200) || link,
      url: link,
      titulo: corta(tag(b, "title"), CORTE_TITULO),
      data: tag(b, "pubDate") ? new Date(tag(b, "pubDate")).toISOString() : null,
      autor: corta(tag(b, "dc:creator") || tag(b, "author"), 60) || null,
      // CDATA PRIMEIRO, tags depois: `<![CDATA[Moda]]>` casa com o regex de tag
      // (`<` … sem `>` … `>`), então tirar tags antes levaria o conteúdo junto e
      // toda categoria viria vazia — sem erro, só sumindo.
      categorias: (b.match(/<category[^>]*>([\s\S]*?)<\/category>/gi) ?? [])
        .slice(0, 10).map((c) => corta(limparXml(c), 60)).filter(Boolean),
      resumo: corta(tag(b, "description") || tag(b, "content:encoded"), CORTE_RESUMO),
    };
  }).filter((p) => p.url);
}

/**
 * Sitemap: só URLs. Vira post com título derivado do slug — que é o suficiente
 * para o casamento de termos, porque URL de spam carrega a palavra.
 */
export function postsDoSitemap(corpo: string, dominio: string): PostBlog[] {
  const urls = Array.from(corpo.matchAll(/<loc>([\s\S]*?)<\/loc>/gi))
    .map((m) => limparXml(m[1]).trim())
    .filter((u) => /^https?:\/\//i.test(u) && normalizarHost(u).endsWith(normalizarHost(dominio)));
  // Índice de sitemaps (aponta para outros .xml) não é lista de post.
  const paginas = urls.filter((u) => !/\.xml($|\?)/i.test(u));
  return paginas.slice(-MAX_POSTS).reverse().map((u) => ({
    id: u, url: corta(u, 500),
    titulo: corta(decodeURIComponent(u.split("/").filter(Boolean).pop() ?? "").replace(/[-_]+/g, " "), CORTE_TITULO),
    data: null, autor: null, categorias: [], resumo: "",
  }));
}

/**
 * Blocos de navegação. Links daqui não são publicação.
 *
 * Descoberto sondando o site real da Ultramalhas com `blogUrl` apontando para
 * um caminho sem WordPress: o fallback devolveu 25 "posts" chamados "Home",
 * "Produtos", "Malhas" — o menu do site. Isso não é só feio na tela: o menu
 * entraria no baseline como publicação, e a primeira troca de item de menu
 * viraria "publicações novas de uma vez".
 */
const BLOCOS_DE_NAVEGACAO = /<(nav|header|footer)[\s>][\s\S]*?<\/\1>/gi;

/**
 * HTML da listagem. Último recurso e o mais frágil: pega links do próprio
 * domínio com o texto da âncora como título.
 *
 * Continua sendo uma aproximação — não há como distinguir com certeza post de
 * página numa listagem qualquer. Por isso é o ÚLTIMO fallback, e por isso a aba
 * mostra qual fonte foi usada: "nenhuma publicação suspeita" dita a partir daqui
 * vale menos do que a mesma frase dita a partir da REST.
 */
export function postsDoHtml(corpo: string, dominio: string): PostBlog[] {
  const vistos = new Set<string>();
  const out: PostBlog[] = [];
  const semNav = corpo.replace(BLOCOS_DE_NAVEGACAO, " ");
  for (const m of Array.from(semNav.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]{0,300}?)<\/a>/gi))) {
    const href = m[1];
    if (!/^https?:\/\//i.test(href)) continue;
    if (!normalizarHost(href).endsWith(normalizarHost(dominio))) continue;
    const texto = corta(m[2], CORTE_TITULO);
    if (!texto || vistos.has(href)) continue;
    vistos.add(href);
    out.push({ id: href, url: corta(href, 500), titulo: texto, data: null, autor: null, categorias: [], resumo: "" });
    if (out.length >= MAX_POSTS) break;
  }
  return out;
}

// ─── Orquestração ────────────────────────────────────────────────────────────

const MOTIVO_VAZIO = "respondeu, mas sem post reconhecível";

/**
 * Lê o blog pelo primeiro caminho que funcionar. Nunca lança.
 *
 * `blogUrl` sobrescreve a raiz derivada do domínio — há blog em subdiretório
 * (`/blog`) e em subdomínio, e adivinhar erraria em metade dos casos.
 */
export async function checarConteudo(
  dominio: string,
  blogUrl?: string | null,
  timeoutMs = 15_000,
): Promise<LeituraConteudo> {
  const t0 = Date.now();
  const host = normalizarHost(dominio);
  const base: LeituraConteudo = {
    fonte: "nenhuma", ok: false, posts: [], tentativas: [],
    erro: null, emMs: 0, lidoEm: new Date().toISOString(),
  };
  if (!host) return { ...base, erro: "Domínio ausente ou inválido." };

  const raiz = (blogUrl && /^https?:\/\//i.test(blogUrl) ? blogUrl : `https://${host}${blogUrl ?? ""}`)
    .replace(/\/+$/, "");

  const caminhos: { fonte: FonteConteudo; url: string; ler: (c: string) => PostBlog[] }[] = [
    {
      fonte: "rest",
      url: `${raiz}/wp-json/wp/v2/posts?per_page=20&orderby=date&_fields=id,date,link,title,author,categories,excerpt`,
      ler: postsDaRest,
    },
    { fonte: "rss", url: `${raiz}/feed`, ler: postsDoRss },
    { fonte: "sitemap", url: `${raiz}/sitemap.xml`, ler: (c) => postsDoSitemap(c, host) },
    { fonte: "html", url: raiz, ler: (c) => postsDoHtml(c, host) },
  ];

  const tentativas: LeituraConteudo["tentativas"] = [];
  for (const c of caminhos) {
    try {
      const { resp } = await fetchSeguro(c.url, { method: "GET", timeoutMs });
      if (!resp.ok) {
        tentativas.push({ fonte: c.fonte, url: c.url, resultado: `HTTP ${resp.status}` });
        continue;
      }
      const posts = c.ler(await lerCorpo(resp));
      if (posts.length === 0) {
        tentativas.push({ fonte: c.fonte, url: c.url, resultado: MOTIVO_VAZIO });
        continue;
      }
      tentativas.push({ fonte: c.fonte, url: c.url, resultado: `${posts.length} post(s)` });
      return { ...base, fonte: c.fonte, ok: true, posts, tentativas, emMs: Date.now() - t0 };
    } catch (e) {
      const msg = (e as Error).message ?? String(e);
      tentativas.push({ fonte: c.fonte, url: c.url, resultado: /timeout|abort/i.test(msg) ? "sem resposta" : msg.slice(0, 120) });
    }
  }

  // Nenhum caminho funcionou. NÃO é "está tudo bem" — ver cabeçalho.
  return {
    ...base, fonte: "nenhuma", ok: false, tentativas,
    erro: "Nenhuma das fontes respondeu com conteúdo reconhecível.",
    emMs: Date.now() - t0,
  };
}
