/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Leitores de conteúdo — os quatro formatos, sem rede
 * ─────────────────────────────────────────────────────────────────────────────
 *  Cada leitor é uma função pura sobre o corpo da resposta, e é assim que os
 *  quatro formatos podem ser exercitados sem depender de um WordPress de
 *  verdade estar no ar com a REST aberta.
 *
 *  O que mais importa aqui: um leitor que devolve `[]` faz a orquestração cair
 *  para o próximo fallback. Então "não reconheci nada" precisa ser `[]` mesmo,
 *  e nunca um post fantasma — um post com URL vazia entraria no baseline e
 *  contaminaria a comparação de "post novo" para sempre.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, expect, it } from "vitest";
import { postsDaRest, postsDoRss, postsDoSitemap, postsDoHtml } from "./conteudoCheck";

describe("REST do WordPress", () => {
  const CORPO = JSON.stringify([
    {
      id: 812, date: "2026-08-04T10:00:00", link: "https://ultramalhas.com.br/blog/tricot-inverno/",
      title: { rendered: "Tricô para o inverno" }, author: 3, categories: [5, 8],
      excerpt: { rendered: "<p>Peças em lã merino.</p>\n" },
    },
    {
      id: 813, date: "2026-08-05T02:11:00", link: "https://ultramalhas.com.br/melhores-cassinos/",
      title: { rendered: "Melhores cassinos online" }, author: 99, categories: [41],
      excerpt: { rendered: "<p>Ganhe bônus agora</p>" },
    },
  ]);

  it("lê os campos que a evidência precisa", () => {
    const [p] = postsDaRest(CORPO);
    expect(p.id).toBe("812");
    expect(p.titulo).toBe("Tricô para o inverno");
    expect(p.autor).toBe("3");
    expect(p.categorias).toEqual(["5", "8"]);
    expect(p.data).toBe("2026-08-04T10:00:00");
  });

  it("tira as tags do resumo — ele vem renderizado", () => {
    expect(postsDaRest(CORPO)[0].resumo).toBe("Peças em lã merino.");
  });

  it.each([
    ["JSON inválido", "<html>403 Forbidden</html>"],
    ["objeto de erro em vez de lista", '{"code":"rest_forbidden"}'],
    ["vazio", ""],
    ["lista vazia", "[]"],
  ])("%s vira [] — é o que dispara o fallback", (_n, corpo) => {
    expect(postsDaRest(corpo)).toEqual([]);
  });

  /** Post sem link não pode entrar: sujaria o baseline de "post novo". */
  it("descarta post sem id ou sem link", () => {
    expect(postsDaRest('[{"id":1},{"link":"https://x.com/a"},{"id":2,"link":"https://x.com/b"}]'))
      .toHaveLength(2); // o do meio herda o link como id; o primeiro sai
  });
});

describe("RSS", () => {
  const FEED = `<?xml version="1.0"?><rss><channel>
    <item>
      <title><![CDATA[Tricô para o inverno]]></title>
      <link>https://ultramalhas.com.br/blog/tricot/</link>
      <guid isPermaLink="false">https://ultramalhas.com.br/?p=812</guid>
      <pubDate>Tue, 04 Aug 2026 10:00:00 +0000</pubDate>
      <dc:creator><![CDATA[Redação]]></dc:creator>
      <category><![CDATA[Moda]]></category>
      <description><![CDATA[<p>Peças em lã &amp; algodão.</p>]]></description>
    </item>
  </channel></rss>`;

  it("lê item com CDATA e entidades", () => {
    const [p] = postsDoRss(FEED);
    expect(p.titulo).toBe("Tricô para o inverno");
    expect(p.id).toBe("https://ultramalhas.com.br/?p=812");
    expect(p.autor).toBe("Redação");
    expect(p.categorias).toEqual(["Moda"]);
    expect(p.resumo).toBe("Peças em lã & algodão.");
    expect(p.data).toBe("2026-08-04T10:00:00.000Z");
  });

  it("sem guid, o link vira id", () => {
    expect(postsDoRss(FEED.replace(/<guid[\s\S]*?<\/guid>/, ""))[0].id)
      .toBe("https://ultramalhas.com.br/blog/tricot/");
  });

  it.each([["HTML", "<html>não é feed</html>"], ["vazio", ""]])("%s vira []", (_n, c) => {
    expect(postsDoRss(c)).toEqual([]);
  });
});

describe("sitemap", () => {
  const MAPA = `<urlset>
    <url><loc>https://ultramalhas.com.br/</loc></url>
    <url><loc>https://ultramalhas.com.br/blog/tricot/</loc></url>
    <url><loc>https://ultramalhas.com.br/melhores-slots-online/</loc></url>
    <url><loc>https://outro-dominio.com/spam/</loc></url>
    <url><loc>https://ultramalhas.com.br/post-sitemap.xml</loc></url>
  </urlset>`;

  it("só URLs do próprio domínio", () => {
    expect(postsDoSitemap(MAPA, "ultramalhas.com.br").map((p) => p.url))
      .not.toContain("https://outro-dominio.com/spam/");
  });

  /** Índice de sitemaps aponta para outros .xml — não é lista de post. */
  it("descarta links para outros sitemaps", () => {
    expect(postsDoSitemap(MAPA, "ultramalhas.com.br").some((p) => p.url.endsWith(".xml"))).toBe(false);
  });

  /** Sem título na fonte, o slug vira título — é o que permite casar termos. */
  it("deriva título do slug", () => {
    const p = postsDoSitemap(MAPA, "ultramalhas.com.br").find((x) => x.url.includes("slots"));
    expect(p?.titulo).toBe("melhores slots online");
  });

  it("não inventa data nem autor", () => {
    const [p] = postsDoSitemap(MAPA, "ultramalhas.com.br");
    expect(p.data).toBeNull();
    expect(p.autor).toBeNull();
  });
});

describe("HTML da listagem", () => {
  const PAGINA = `<html><body>
    <a href="https://ultramalhas.com.br/blog/tricot/">Tricô para o inverno</a>
    <a href="https://ultramalhas.com.br/blog/tricot/">Tricô para o inverno</a>
    <a href="https://facebook.com/ultramalhas">Siga no Facebook</a>
    <a href="/relativo">Link relativo</a>
    <a href="https://ultramalhas.com.br/cassino/"></a>
  </body></html>`;

  it("pega links do próprio domínio, sem repetir", () => {
    const p = postsDoHtml(PAGINA, "ultramalhas.com.br");
    expect(p).toHaveLength(1);
    expect(p[0].titulo).toBe("Tricô para o inverno");
  });

  it("ignora domínio externo — não seguimos link de fora", () => {
    expect(postsDoHtml(PAGINA, "ultramalhas.com.br").some((p) => p.url.includes("facebook"))).toBe(false);
  });

  it("âncora sem texto não vira post", () => {
    expect(postsDoHtml(PAGINA, "ultramalhas.com.br").some((p) => p.url.includes("cassino"))).toBe(false);
  });

  it("página sem link vira []", () => {
    expect(postsDoHtml("<html><body>nada</body></html>", "ultramalhas.com.br")).toEqual([]);
  });
});

describe("truncamento — o conteúdo pode ser do invasor", () => {
  it("título e resumo gigantes são cortados", () => {
    const [p] = postsDaRest(JSON.stringify([{
      id: 1, link: "https://x.com/a",
      title: { rendered: "T".repeat(5000) },
      excerpt: { rendered: "R".repeat(5000) },
    }]));
    expect(p.titulo.length).toBeLessThanOrEqual(200);
    expect(p.resumo.length).toBeLessThanOrEqual(600);
  });

  it("tag no título não sobrevive", () => {
    const [p] = postsDaRest(JSON.stringify([{
      id: 1, link: "https://x.com/a", title: { rendered: '<img src=x onerror="alert(1)">Oi' },
    }]));
    expect(p.titulo).not.toContain("<img");
  });

  it("lista enorme é limitada", () => {
    const muitos = JSON.stringify(Array.from({ length: 500 }, (_, i) => ({ id: i + 1, link: `https://x.com/${i}` })));
    expect(postsDaRest(muitos).length).toBeLessThanOrEqual(30);
  });
});

/**
 * O resumo da REST vem RENDERIZADO: entidades cruas na evidência fazem um
 * alerta legítimo parecer defeito do robô. Visto no WordPress real, onde os
 * excerpts vêm cheios de `&nbsp;`.
 */
describe("entidades HTML na evidência", () => {
  it.each([
    ["&nbsp;", "a&nbsp;b", "a b"],
    ["numérica", "It&#8217;s", "It’s"],
    ["hexadecimal", "It&#x2019;s", "It’s"],
    ["e comercial", "Lã &amp; algodão", "Lã & algodão"],
    ["aspas", "&quot;Tricô&quot;", '"Tricô"'],
  ])("%s vira texto", (_n, entrada, esperado) => {
    const [p] = postsDaRest(JSON.stringify([{ id: 1, link: "https://x.com/a", title: { rendered: entrada } }]));
    expect(p.titulo).toBe(esperado);
  });
});
