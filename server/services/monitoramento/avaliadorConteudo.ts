/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Avaliador de conteúdo — leitura do blog entra, achado sai
 * ─────────────────────────────────────────────────────────────────────────────
 *  Puro, como o avaliador de domínio. Módulo separado porque a pergunta é outra:
 *  lá é "o domínio ainda é nosso"; aqui é "o que anda sendo publicado".
 *
 *  ── Três decisões que definem o comportamento ──────────────────────────────
 *
 *  1. TODO post é classificado, não só os novos. Restringir aos novos parece a
 *     leitura literal de "alertar sobre posts novos", mas deixaria passar spam
 *     que já estava publicado antes de o robô ser ligado — que é justamente o
 *     estado provável de um blog invadido. Quem impede o alerta repetido é a
 *     confirmação dupla (o achado vira `manter` e cala), não o filtro de novos.
 *
 *  2. A PRIMEIRA leitura não julga o que depende de baseline. Sem posts
 *     conhecidos, todo post é "novo", todo autor é "inédito" e toda categoria é
 *     "nova" — a primeira leitura dispararia rajada, autor novo e categoria
 *     nova de uma vez, sobre um blog perfeitamente normal. Mesma lição do
 *     baseline de nameservers: primeiro aprende, depois julga.
 *
 *  3. NÃO CONSEGUIR LER É WARNING, NUNCA "OK". Um WordPress com REST bloqueada
 *     e sem feed produz zero posts. Zero posts lidos e zero posts suspeitos são
 *     estados indistinguíveis se a leitura não for verificada primeiro — e o
 *     segundo é o que o robô diria todo dia, em silêncio, enquanto o blog
 *     estivesse cheio de spam.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import type { Achado } from "./avaliador";
import type { LeituraConteudo, PostBlog } from "./conteudoCheck";
import { classificarPost, type Classificacao } from "./termosSuspeitos";

/** Acima disto, a leva de posts novos é estranha o bastante para registrar. */
const RAJADA = 5;
/** Teto do baseline. Blog antigo tem milhares de URLs; guardar tudo incharia. */
export const MAX_BASELINE = 400;

export interface BaselineConteudo {
  ids: string[];
  autores: string[];
  categorias: string[];
}

export interface EntradaConteudo {
  conteudo: LeituraConteudo | null;
  /** `null` = primeira leitura: aprende, não julga (ver decisão 2). */
  baseline: BaselineConteudo | null;
  termos: string[];
}

const corta = (v: unknown, n = 200) => String(v ?? "").slice(0, n);

/** Um post e o que a classificação disse dele. */
export interface PostClassificado {
  post: PostBlog;
  classificacao: Classificacao;
  novo: boolean;
}

export function classificarTodos(e: EntradaConteudo): PostClassificado[] {
  const conhecidos = new Set(e.baseline?.ids ?? []);
  return (e.conteudo?.posts ?? []).map((post) => ({
    post,
    classificacao: classificarPost(
      { id: post.id, url: post.url, titulo: post.titulo, resumo: post.resumo },
      e.termos,
    ),
    // Sem baseline, "novo" não significa nada — ver decisão 2.
    novo: e.baseline !== null && !conhecidos.has(post.id),
  }));
}

/** Evidência de um post suspeito, pronta para exibir. Tudo truncado. */
function evidenciaDoPost(p: PostClassificado): Record<string, string | number | string[] | null> {
  return {
    titulo: corta(p.post.titulo, 200),
    url: corta(p.post.url, 300),
    data: p.post.data ?? null,
    autor: p.post.autor ?? null,
    termos: p.classificacao.termos,
    trecho: corta(p.classificacao.encontrados[0]?.trecho, 200),
    novo: p.novo ? "sim" : "não",
  };
}

export function avaliarConteudo(e: EntradaConteudo): Achado[] {
  const achados: Achado[] = [];
  const c = e.conteudo;
  if (!c) return achados;

  // ── Decisão 3: leitura falhou ──────────────────────────────────────────────
  if (!c.ok || c.fonte === "nenhuma") {
    return [{
      chave: "conteudo_nao_verificado", sev: "WARNING",
      titulo: "Não foi possível ler o blog",
      detalhe: "Nenhuma das fontes (REST, RSS, sitemap, HTML) respondeu com conteúdo reconhecível. O blog NÃO foi verificado — isto não é o mesmo que estar limpo.",
      exigeConfirmacao: false,
      evidencia: {
        erro: corta(c.erro),
        tentativas: c.tentativas.map((t) => `${t.fonte}: ${t.resultado}`).slice(0, 6),
      },
    }];
  }

  const classificados = classificarTodos(e);
  const suspeitos = classificados.filter((p) => p.classificacao.suspeito);
  const fortes = suspeitos.filter((p) => p.classificacao.forte);

  // ── Spam confirmado pelas regras ───────────────────────────────────────────
  if (fortes.length > 0) {
    const principal = fortes[0];
    achados.push({
      chave: "conteudo_spam", sev: "CRITICAL",
      titulo: fortes.length > 1
        ? `${fortes.length} publicações com conteúdo de apostas/cassino`
        : "Publicação com conteúdo de apostas/cassino",
      detalhe: `"${corta(principal.post.titulo, 120)}" — termos encontrados: ${principal.classificacao.termos.join(", ")}. Sinal forte: termo no título ou mais de um termo no mesmo post.`,
      exigeConfirmacao: true,
      evidencia: {
        ...evidenciaDoPost(principal),
        totalSuspeitos: fortes.length,
        outros: fortes.slice(1, 4).map((p) => corta(p.post.url, 200)),
        fonte: c.fonte,
      },
    });
  } else if (suspeitos.length > 0) {
    // Sinal fraco: um termo isolado no corpo pode ser citação ou coincidência.
    const p = suspeitos[0];
    achados.push({
      chave: "conteudo_suspeito", sev: "WARNING",
      titulo: "Publicação com termo suspeito",
      detalhe: `"${corta(p.post.titulo, 120)}" cita ${p.classificacao.termos.join(", ")}. Sinal fraco — pode ser citação legítima. Vale olhar.`,
      exigeConfirmacao: false,
      evidencia: { ...evidenciaDoPost(p), totalSuspeitos: suspeitos.length, fonte: c.fonte },
    });
  }

  // ── Sinais que só existem com baseline (decisão 2) ─────────────────────────
  if (e.baseline) {
    const novos = classificados.filter((p) => p.novo);

    if (novos.length > RAJADA) {
      achados.push({
        chave: "muitos_posts_novos", sev: "WARNING",
        titulo: `${novos.length} publicações novas de uma vez`,
        detalhe: "Volume incomum para uma única verificação. Publicação em massa costuma indicar automação — legítima ou não.",
        exigeConfirmacao: false,
        evidencia: { quantidade: novos.length, exemplos: novos.slice(0, 4).map((p) => corta(p.post.url, 200)) },
      });
    }

    const autoresConhecidos = new Set(e.baseline.autores);
    const autoresNovos = Array.from(new Set(novos.map((p) => p.post.autor).filter((a): a is string => !!a)))
      .filter((a) => !autoresConhecidos.has(a));
    if (autoresNovos.length > 0) {
      achados.push({
        chave: "autor_novo", sev: "WARNING",
        titulo: autoresNovos.length > 1 ? "Autores inéditos publicando" : "Autor inédito publicando",
        detalhe: `Nunca havia publicado neste blog: ${autoresNovos.slice(0, 5).join(", ")}. Pode ser gente nova no time — ou conta criada por invasão.`,
        exigeConfirmacao: false,
        evidencia: { autores: autoresNovos.slice(0, 5), conhecidos: e.baseline.autores.slice(0, 10) },
      });
    }

    const catsConhecidas = new Set(e.baseline.categorias);
    const catsNovas = Array.from(new Set(novos.flatMap((p) => p.post.categorias))).filter((c2) => !catsConhecidas.has(c2));
    if (catsNovas.length > 0) {
      achados.push({
        chave: "categoria_nova", sev: "WARNING",
        titulo: "Categoria nova no blog",
        detalhe: `Apareceu: ${catsNovas.slice(0, 5).join(", ")}.`,
        exigeConfirmacao: false,
        evidencia: { categorias: catsNovas.slice(0, 5) },
      });
    }
  } else {
    achados.push({
      chave: "conteudo_baseline_aprendido", sev: "INFO",
      titulo: "Blog registrado",
      detalhe: `${(c.posts ?? []).length} publicação(ões) conhecidas via ${c.fonte}. A partir da próxima leitura, o robô compara.`,
      exigeConfirmacao: false,
      evidencia: { fonte: c.fonte, posts: (c.posts ?? []).length },
    });
  }

  return achados;
}

/**
 * Baseline atualizado depois desta leitura.
 *
 * Os ids mais RECENTES ficam: um blog antigo tem milhares de URLs, e a pergunta
 * que o baseline responde é "isto apareceu agora?" — que só depende do passado
 * próximo. Guardar tudo incharia a linha sem responder nada a mais.
 */
export function proximoBaseline(anterior: BaselineConteudo | null, posts: PostBlog[]): BaselineConteudo {
  const ids = Array.from(new Set([...posts.map((p) => p.id), ...(anterior?.ids ?? [])])).slice(0, MAX_BASELINE);
  const autores = Array.from(new Set([
    ...(anterior?.autores ?? []),
    ...posts.map((p) => p.autor).filter((a): a is string => !!a),
  ])).slice(0, 50);
  const categorias = Array.from(new Set([
    ...(anterior?.categorias ?? []),
    ...posts.flatMap((p) => p.categorias),
  ])).slice(0, 100);
  return { ids, autores, categorias };
}
