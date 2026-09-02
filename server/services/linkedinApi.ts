/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  LinkedIn — um método por capacidade. Nenhuma decisão mora aqui.
 * ─────────────────────────────────────────────────────────────────────────────
 *  Camada de acesso: monta a chamada do jeito que a Fase 0 provou que funciona,
 *  devolve `RespostaMedida` e conta. Quem decide o que pedir é
 *  `shared/linkedinPlanoDeColeta`; quem interpreta é `shared/linkedinLab`.
 *
 *  ── As formas provadas em oito rodadas ─────────────────────────────────────
 *  Cada uma destas foi um erro em produção antes de virar linha de código:
 *
 *    ACL              `/rest/organizationAcls` SEM projeção; o versionado
 *                     recusa `fields` decorado E não decorado. Os NOMES só vêm
 *                     do legado `/v2/organizationalEntityAcls` com `projection`.
 *    seguidores       `/rest/networkSizes` exige `edgeType`, e o valor é
 *                     MAIÚSCULO no versionado: COMPANY_FOLLOWED_BY_MEMBER.
 *    métricas de post a chave (`ugcPosts`/`shares`) sai do URN de CADA post.
 *    lote             a resposta OMITE post sem estatística — casar pelo
 *                     `ugcPost` devolvido, NUNCA pela posição do array.
 *
 *  Nenhuma destas "simplifica". Cada uma custou uma rodada para achar.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { medirLinkedIn, type RespostaMedida } from "./linkedin";
import { janelaRestli } from "./sondagemLinkedIn";

/** A versão que a Fase 0 aceitou. Fica aqui para ser trocada num lugar só. */
export const VERSAO_LINKEDIN = "202608";

/**
 * O contador de chamadas.
 *
 * Sem cabeçalho de cota, este número é a única medida de custo que temos. Ele
 * é passado adiante em vez de global porque duas coletas simultâneas somariam
 * no mesmo balde e ninguém saberia de quem foi o gasto.
 */
export interface Contador {
  chamadas: number;
  comErro: number;
  /** Amostra crua por capacidade — alimenta a aba de investigação. */
  bruto: Record<string, unknown>;
}

export const novoContador = (): Contador => ({ chamadas: 0, comErro: 0, bruto: {} });

async function chamar<T>(
  c: Contador, chave: string, caminho: string,
  o: Parameters<typeof medirLinkedIn>[1],
): Promise<RespostaMedida<T>> {
  const r = await medirLinkedIn<T>(caminho, o);
  c.chamadas++;
  if (!r.ok) c.comErro++;
  // Só a ÚLTIMA resposta de cada chave. Guardar todas encheria o JSON com
  // repetição e a investigação ficaria mais difícil, não mais fácil.
  c.bruto[chave] = { status: r.status, ok: r.ok, erro: r.erro, dados: r.dados };
  return r;
}

type Elementos = { elements?: Array<Record<string, unknown>>; paging?: Record<string, unknown> };

export interface Ctx { token: string; contador: Contador; agora: Date }

/* ── Descoberta ─────────────────────────────────────────────────────────── */

export interface PaginaDescoberta {
  id: string;
  urn: string;
  nome: string | null;
  vanity: string | null;
  papeis: Array<{ papel: string; estado: string }>;
}

/**
 * A carteira inteira: 2 chamadas para a agência, não por cliente.
 *
 * As duas são necessárias e não são redundantes: a versionada é a que responde
 * (a legada pode sair do ar a qualquer versão), e a legada é a única que traz
 * o NOME junto. Sem ela o laboratório mostraria números de organização no lugar
 * dos clientes — foi o que aconteceu na rodada 4 da sondagem.
 */
export async function descobrirPaginas(ctx: Ctx, tetoDeNomes = 25): Promise<{
  paginas: PaginaDescoberta[]; ok: boolean; erro: string | null; semNome: number;
}> {
  const paginas: PaginaDescoberta[] = [];
  const absorver = (els: Array<Record<string, unknown>>) => {
    for (const el of els) {
      const alvo = String(el.organizationalTarget ?? el.organization ?? "");
      const id = alvo.split(":").pop() ?? "";
      if (!id) continue;
      const papel = el.role ? String(el.role) : "";
      const estado = el.state ? String(el.state) : "?";
      const det = (el["organizationalTarget~"] ?? {}) as Record<string, unknown>;
      const nome = det.localizedName ? String(det.localizedName) : null;
      const vanity = det.vanityName ? String(det.vanityName) : null;

      const ja = paginas.find((p) => p.id === id);
      if (ja) {
        if (papel && !ja.papeis.some((x) => x.papel === papel)) ja.papeis.push({ papel, estado });
        ja.nome ??= nome;
        ja.vanity ??= vanity;
        continue;
      }
      paginas.push({
        id, urn: alvo || `urn:li:organization:${id}`,
        nome, vanity, papeis: papel ? [{ papel, estado }] : [],
      });
    }
  };

  const versionada = await chamar<Elementos>(ctx.contador, "acl_versionada",
    "/rest/organizationAcls", {
      token: ctx.token, versao: VERSAO_LINKEDIN,
      params: { q: "roleAssignee", count: "50" },
    });
  absorver(versionada.dados?.elements ?? []);

  const legada = await chamar<Elementos>(ctx.contador, "acl_legada",
    "/v2/organizationalEntityAcls", {
      token: ctx.token,
      params: {
        q: "roleAssignee", count: "50",
        projection: "(elements*(*,organizationalTarget~(id,localizedName,vanityName)))",
      },
    });
  absorver(legada.dados?.elements ?? []);

  // ── Terceira fonte do NOME ────────────────────────────────────────────
  //
  // A ACL versionada não devolve nome nenhum (`roleAssignee, state,
  // lastModified, role, created, organization`), e a legada só devolve quando a
  // decoração `organizationalTarget~` é aceita — nas Páginas que o LinkedIn
  // recusa, ele responde `organizationalTarget!` e a Página entra sem nome.
  //
  // `/rest/organizations/{id}` é o endpoint que a Fase 0 provou entregar
  // `localizedName` e `vanityName`. Uma chamada por Página anônima, com teto —
  // é o preço de não mostrar número no lugar do cliente.
  //
  // Onde ele também recusar (403 `ADMIN_ONLY VisibilityReduction`), a Página
  // continua sem nome, e a tela DIZ isso. Nunca cai para o nome do cliente:
  // seria inventar identidade a partir de outra coisa.
  const anonimas = paginas.filter((p) => !p.nome).slice(0, tetoDeNomes);
  for (const p of anonimas) {
    const r = await organizacao(ctx, p.id);
    if (!r.ok || !r.dados) continue;
    if (r.dados.localizedName) p.nome = String(r.dados.localizedName);
    if (r.dados.vanityName) p.vanity = String(r.dados.vanityName);
  }

  return {
    paginas,
    ok: versionada.ok || legada.ok,
    erro: versionada.ok || legada.ok ? null : (versionada.erro ?? legada.erro),
    semNome: paginas.filter((p) => !p.nome).length,
  };
}

/* ── Página ─────────────────────────────────────────────────────────────── */

export const organizacao = (ctx: Ctx, id: string) =>
  chamar<Record<string, unknown>>(ctx.contador, "organizacao",
    `/rest/organizations/${id}`, { token: ctx.token, versao: VERSAO_LINKEDIN });

/**
 * Seguidores atuais.
 *
 * `edgeType` é obrigatório e o versionado quer o valor em MAIÚSCULA — a Fase 0
 * recebeu `Invalid param` com `CompanyFollowedByMember` e 200 com
 * `COMPANY_FOLLOWED_BY_MEMBER`, com o mesmo escopo concedido nas duas.
 */
export const seguidoresAtuais = (ctx: Ctx, urn: string) =>
  chamar<{ firstDegreeSize?: number }>(ctx.contador, "seguidores_atuais",
    `/rest/networkSizes/${encodeURIComponent(urn)}`, {
      token: ctx.token, versao: VERSAO_LINKEDIN,
      params: { edgeType: "COMPANY_FOLLOWED_BY_MEMBER" },
    });

export const seguidoresLifetime = (ctx: Ctx, urn: string) =>
  chamar<Elementos>(ctx.contador, "seguidores_lifetime",
    "/rest/organizationalEntityFollowerStatistics", {
      token: ctx.token, versao: VERSAO_LINKEDIN,
      params: { q: "organizationalEntity", organizationalEntity: urn },
    });

/** Série diária de seguidores. `de`/`ate` em dias atrás, `de` > `ate`. */
export const seguidoresSerie = (ctx: Ctx, urn: string, de: number, ate: number) =>
  chamar<Elementos>(ctx.contador, `seguidores_serie_${de}_${ate}`,
    "/rest/organizationalEntityFollowerStatistics", {
      token: ctx.token, versao: VERSAO_LINKEDIN,
      params: { q: "organizationalEntity", organizationalEntity: urn },
      cru: { timeIntervals: janelaRestli(ctx.agora, de, ate) },
    });

export const paginaLifetime = (ctx: Ctx, urn: string) =>
  chamar<Elementos>(ctx.contador, "pagina_lifetime",
    "/rest/organizationPageStatistics", {
      token: ctx.token, versao: VERSAO_LINKEDIN,
      params: { q: "organization", organization: urn },
    });

export const paginaSerie = (ctx: Ctx, urn: string, de: number, ate: number) =>
  chamar<Elementos>(ctx.contador, `pagina_serie_${de}_${ate}`,
    "/rest/organizationPageStatistics", {
      token: ctx.token, versao: VERSAO_LINKEDIN,
      params: { q: "organization", organization: urn },
      cru: { timeIntervals: janelaRestli(ctx.agora, de, ate) },
    });

export const agregadoDePosts = (ctx: Ctx, urn: string) =>
  chamar<Elementos>(ctx.contador, "agregado_de_posts",
    "/rest/organizationalEntityShareStatistics", {
      token: ctx.token, versao: VERSAO_LINKEDIN,
      params: { q: "organizationalEntity", organizationalEntity: urn },
    });

/* ── Publicações ────────────────────────────────────────────────────────── */

export const listarPosts = (ctx: Ctx, urn: string, inicio = 0, quantos = 20) =>
  chamar<Elementos>(ctx.contador, inicio === 0 ? "posts" : `posts_${inicio}`,
    "/rest/posts", {
      token: ctx.token, versao: VERSAO_LINKEDIN,
      params: {
        q: "author", author: urn, count: String(quantos),
        sortBy: "LAST_MODIFIED", ...(inicio ? { start: String(inicio) } : {}),
      },
    });

/** A chave sai do URN. Errar isto devolve 400 e some com a medição. */
export const chaveDoPost = (urn: string): "ugcPosts" | "shares" =>
  urn.includes(":ugcPost:") ? "ugcPosts" : "shares";

/**
 * Métricas de um LOTE — e o lote só pode ter URNs do MESMO tipo.
 *
 * A Fase 0 tomou `Deserializing output 'urn:li:ugcPost:…' failed` mandando um
 * ugcPost dentro de `shares`. Quem chama garante a homogeneidade; aqui a chave
 * é derivada do primeiro e vale para todos.
 */
export const metricasDePosts = (ctx: Ctx, urn: string, alvos: string[]) =>
  chamar<Elementos>(ctx.contador, `metricas_${chaveDoPost(alvos[0])}`,
    "/rest/organizationalEntityShareStatistics", {
      token: ctx.token, versao: VERSAO_LINKEDIN,
      params: { q: "organizationalEntity", organizationalEntity: urn },
      cru: { [chaveDoPost(alvos[0])]: `List(${alvos.map(encodeURIComponent).join(",")})` },
    });

export const acoesSociais = (ctx: Ctx, postUrn: string) =>
  chamar<Record<string, unknown>>(ctx.contador, "social_actions",
    `/rest/socialActions/${encodeURIComponent(postUrn)}`,
    { token: ctx.token, versao: VERSAO_LINKEDIN });

/** Reações POR TIPO. É a única fonte medida de LIKE/PRAISE/EMPATHY/INTEREST. */
export const metadadosSociais = (ctx: Ctx, postUrn: string) =>
  chamar<Record<string, unknown>>(ctx.contador, "social_metadata",
    `/rest/socialMetadata/${encodeURIComponent(postUrn)}`,
    { token: ctx.token, versao: VERSAO_LINKEDIN });

/**
 * Tenta resolver `urn:li:image:…` em URL.
 *
 * A Fase 0 NUNCA chamou este endpoint — então isto é tentativa medida, não
 * capacidade provada. Se recusar, o laboratório mostra "Imagem indisponível"
 * com o motivo, e não uma ausência silenciosa.
 */
export const resolverImagens = (ctx: Ctx, urns: string[]) =>
  chamar<Record<string, unknown>>(ctx.contador, "imagens", "/rest/images", {
    token: ctx.token, versao: VERSAO_LINKEDIN,
    cru: { ids: `List(${urns.map(encodeURIComponent).join(",")})` },
  });
