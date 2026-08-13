/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Fase 0 do LinkedIn — perguntar à API o que ela entrega, item por item
 * ─────────────────────────────────────────────────────────────────────────────
 *  Mesmo motivo da Fase 0 do Instagram: nenhuma tabela nasce de documentação. E
 *  aqui existe um motivo a mais, específico do LinkedIn.
 *
 *  ── A pergunta que decide a ARQUITETURA, e não só o schema ─────────────────
 *  O modelo do Instagram é o que é por uma limitação medida: `profile_views` só
 *  responde o dia corrente, e dia fechado do passado NÃO se busca. Foi isso que
 *  obrigou snapshot diário, cron às 06:20 e a série de dias parciais — o Spaces
 *  é o único registro daquele dia porque a Meta não devolve o dia de novo.
 *
 *  Se o LinkedIn devolver dia fechado retroativo, essa obrigação some: dá para
 *  buscar o histórico inteiro de uma vez, e o cron passa a ser conveniência em
 *  vez de necessidade. Se não devolver, o modelo do Instagram se repete.
 *
 *  São duas arquiteturas opostas decididas por UMA medição, e é por isso que
 *  `retroatividade` é testada explicitamente — janela vitalícia, janela de dias
 *  fechados recentes e janela de dois meses atrás — em vez de deduzida do fato
 *  de o parâmetro existir. Parâmetro que existe e devolve vazio é exatamente o
 *  caso do `online_followers` da Meta, que respondia `{}` numa conta de 24 mil.
 *
 *  ── Falhar não é uma coisa só ──────────────────────────────────────────────
 *  Na Meta, o código do erro dizia se era volume ou permissão. Aqui o par
 *  (HTTP, serviceErrorCode) separa QUATRO causas com correções diferentes:
 *
 *    401  token morto ou revogado          → gerar outro
 *    403  escopo ausente no token          → reautorizar com o escopo
 *    403 + "not enough permissions"        → produto não aprovado no app
 *    404  organização fora do alcance      → falta cargo na Página
 *
 *  Sem essa separação, "não veio" mandaria pedir aprovação de produto quando o
 *  que faltava era um cargo na Página — semanas de espera pelo motivo errado.
 *
 *  ── O que NÃO sai daqui ────────────────────────────────────────────────────
 *  Nenhum token, nenhum texto de publicação. Comentário e legenda são reportados
 *  por tamanho, nunca por conteúdo — a pergunta é se o campo responde.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import {
  chamarLinkedIn, introspectarToken, sanitizar, versaoQueResponde,
  type ErroLinkedIn, type OpcoesChamada,
} from "./linkedin";

/**
 * As três portas para o LinkedIn, injetáveis.
 *
 * Existe para o teste poder dirigir a sondagem inteira sem rede — e o que se
 * testa aqui não é o transporte, são as REGRAS: que lista vazia não conta como
 * disponível, que 403 de escopo e 403 de produto se separam, e que a janela
 * antiga é o que decide a retroatividade. Regra que só roda contra a API de
 * verdade é regra que ninguém reprova antes de ela errar em produção.
 */
export interface ClienteLinkedIn {
  chamar: <T>(caminho: string, o: OpcoesChamada) => Promise<T>;
  versao: (token: string) => Promise<{ versao: string | null; tentativas: Array<{ versao: string; ok: boolean; detalhe: string }> }>;
  introspectar: (token: string, clientId: string, clientSecret: string) => Promise<{
    ativo: boolean; scopes: string[]; expiraEm: Date | null; autorizadoEm: Date | null; tipo: string | null;
  }>;
}

const CLIENTE_REAL: ClienteLinkedIn = {
  chamar: chamarLinkedIn,
  versao: versaoQueResponde,
  introspectar: introspectarToken,
};

export type GrupoLinkedIn =
  | "acesso" | "descoberta" | "crescimento" | "pagina" | "publicacoes";

export interface LinhaLinkedIn {
  grupo: GrupoLinkedIn;
  item: string;
  disponivel: boolean;
  /** Valor, natureza do valor, ou o erro da API — sempre sanitizado. */
  detalhe: string;
  /** O que fazer quando falhou, deduzido do par (HTTP, serviceErrorCode). */
  causa?: CausaDaFalha;
}

/**
 * A causa provável, e cada uma tem uma correção diferente.
 *
 * `escopo` e `produto` são o par que mais confunde: os dois devolvem 403, mas um
 * se resolve reautorizando em minutos e o outro depende de aprovação do LinkedIn
 * que leva semanas. A mensagem é o que os separa.
 */
export type CausaDaFalha = "token" | "escopo" | "produto" | "alcance" | "inexistente" | "outra";

const CORRECAO: Record<CausaDaFalha, string> = {
  token: "token morto ou revogado — gerar outro",
  escopo: "escopo ausente — reautorizar pedindo o escopo",
  produto: "produto não aprovado no app — depende de aprovação do LinkedIn",
  alcance: "organização fora do alcance — falta cargo na Página",
  inexistente: "endpoint ou campo não existe nesta versão da API",
  outra: "sem classificação — ver a mensagem",
};

/** Classifica pela evidência que veio, não por suposição. */
export function causaDe(e: ErroLinkedIn): CausaDaFalha {
  const msg = (e.message ?? "").toLowerCase();
  if (e.httpStatus === 401) return "token";
  if (e.httpStatus === 403) {
    // As duas frases que o LinkedIn usa para produto não aprovado. Sem elas,
    // todo 403 viraria "escopo" e mandaria reautorizar um app que nunca teve o
    // produto — o conserto que não conserta.
    if (msg.includes("not enough permissions") || msg.includes("not authorized for")) return "produto";
    return "escopo";
  }
  if (e.httpStatus === 404) return "alcance";
  if (e.httpStatus === 400 && msg.includes("unknown")) return "inexistente";
  return "outra";
}

export interface OrganizacaoDescoberta {
  id: string;
  urn: string;
  nome: string | null;
  vanity: string | null;
  papel: string | null;
  estado: string | null;
}

export interface SondagemLinkedIn {
  ok: boolean;
  versaoUsada: string | null;
  scopes: string[];
  organizacoes: OrganizacaoDescoberta[];
  organizacaoMedida: OrganizacaoDescoberta | null;
  linhas: LinhaLinkedIn[];
  disponiveis: number;
  indisponiveis: number;
  /** A pergunta que decide a arquitetura. `null` = não foi possível decidir. */
  retroatividade: boolean | null;
  texto: string;
}

// ─── Janelas de tempo ────────────────────────────────────────────────────────

/**
 * Meia-noite UTC de um dia N dias atrás.
 *
 * Precisa ser meia-noite: com granularidade DAY o LinkedIn recusa (ou trunca em
 * silêncio) intervalo que começa no meio do dia, e "truncou em silêncio" é o
 * tipo de resposta que a sondagem leria como sucesso.
 */
export function meiaNoiteUTC(agora: Date, diasAtras: number): number {
  const d = new Date(agora.getTime() - diasAtras * 86_400_000);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * A janela em sintaxe Rest.li, literal.
 *
 * Sai como valor CRU de propósito: percent-encodar os parênteses e os
 * dois-pontos devolve 400, e esse 400 é indistinguível, no relatório, de "esta
 * métrica não existe".
 */
export function janelaRestli(agora: Date, deDiasAtras: number, ateDiasAtras: number): string {
  const start = meiaNoiteUTC(agora, deDiasAtras);
  const end = meiaNoiteUTC(agora, ateDiasAtras);
  return `(timeRange:(start:${start},end:${end}),timeGranularityType:DAY)`;
}

// ─── Descrição de valores ────────────────────────────────────────────────────

/** Descreve sem revelar: texto vira tamanho, número vira número. */
function descrever(v: unknown): string {
  if (v === null || v === undefined) return "veio vazio";
  if (typeof v === "number") return `${v}`;
  if (typeof v === "boolean") return String(v);
  if (typeof v === "string") return `texto (${v.length} caracteres)`;
  if (Array.isArray(v)) return `lista de ${v.length}`;
  return "objeto";
}

/** Os campos numéricos de um objeto de estatística, achatados e nomeados. */
function numerosDe(o: unknown, prefixo = ""): string[] {
  if (!o || typeof o !== "object") return [];
  const out: string[] = [];
  for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
    if (typeof v === "number") out.push(`${prefixo}${k}=${v}`);
    else if (v && typeof v === "object" && !Array.isArray(v)) out.push(...numerosDe(v, `${prefixo}${k}.`));
  }
  return out;
}

/** As chaves de segmentação presentes — é isso que vira "dados de audiência". */
function segmentacoesDe(elemento: Record<string, unknown>): string[] {
  return Object.keys(elemento).filter((k) => k.startsWith("followerCountsBy"));
}

// ─── A sondagem ──────────────────────────────────────────────────────────────

export interface OpcoesSondagem {
  token: string;
  /** Usados UMA VEZ para introspecção, e não gravados. */
  clientId?: string;
  clientSecret?: string;
  /** Mede esta organização em vez da primeira descoberta. */
  organizationId?: string;
  agora?: Date;
}

export async function sondarLinkedIn(
  o: OpcoesSondagem, cliente: ClienteLinkedIn = CLIENTE_REAL,
): Promise<SondagemLinkedIn> {
  const agora = o.agora ?? new Date();
  const linhas: LinhaLinkedIn[] = [];
  const reg = (
    grupo: GrupoLinkedIn, item: string, disponivel: boolean, detalhe: string, causa?: CausaDaFalha,
  ) => linhas.push({ grupo, item, disponivel, detalhe, causa });

  const falha = (grupo: GrupoLinkedIn, item: string, e: unknown) => {
    const err = e as ErroLinkedIn;
    reg(grupo, item, false, sanitizar(err.message ?? "erro sem mensagem", o.token), causaDe(err));
  };

  // ── 1. ACESSO ─────────────────────────────────────────────────────────────
  const v = await cliente.versao(o.token);
  reg("acesso", "versão da API", v.versao !== null,
    v.versao
      ? `${v.versao} aceita (tentadas ${v.tentativas.length})`
      : `NENHUMA das ${v.tentativas.length} candidatas responde · ${v.tentativas.map((t) => `${t.versao}: ${t.detalhe}`).join(" ¦ ").slice(0, 300)}`);
  const versao = v.versao ?? undefined;

  let scopes: string[] = [];
  if (o.clientId && o.clientSecret) {
    try {
      const i = await cliente.introspectar(o.token, o.clientId, o.clientSecret);
      scopes = i.scopes;
      reg("acesso", "introspecção do token", i.ativo,
        `${i.ativo ? "ativo" : "INATIVO"} · tipo ${i.tipo ?? "?"} · expira ${i.expiraEm?.toISOString().slice(0, 16).replace("T", " ") ?? "?"} · ${i.scopes.length} escopo(s)`);
      reg("acesso", "escopos concedidos", i.scopes.length > 0,
        i.scopes.length ? i.scopes.join(", ") : "nenhum escopo veio na introspecção");
    } catch (e) {
      falha("acesso", "introspecção do token", e);
    }
  } else {
    // Não é falha: é uma medição que não foi pedida. Marcá-la como indisponível
    // faria a contagem final acusar um problema que não existe.
    reg("acesso", "introspecção do token", true,
      "não solicitada — sem client_id/secret, os escopos só se deduzem do que falha abaixo");
  }

  // Identidade: as duas formas, porque elas dependem de produtos diferentes e
  // saber QUAL responde diz qual produto o app tem aprovado.
  for (const [item, caminho, ver] of [
    ["identidade (OpenID)", "/v2/userinfo", undefined],
    ["identidade (legado)", "/v2/me", undefined],
  ] as const) {
    try {
      const r = await cliente.chamar<Record<string, unknown>>(caminho, { token: o.token, versao: ver });
      const campos = Object.keys(r).filter((k) => !k.startsWith("_"));
      reg("acesso", item, true, `respondeu · campos: ${campos.slice(0, 8).join(", ")}`);
    } catch (e) {
      falha("acesso", item, e);
    }
  }

  // ── 2. DESCOBERTA ─────────────────────────────────────────────────────────
  //
  // O equivalente do `instagram_accounts` do Portfólio da Meta — mas com uma
  // diferença estrutural que a sondagem tem que expor: no LinkedIn o alcance
  // vem do CARGO de um membro em cada Página, e não de um portfólio da agência.
  // Não existe System User. Cada Página de cliente precisa nomear alguém.
  const organizacoes: OrganizacaoDescoberta[] = [];

  for (const [item, caminho, ver] of [
    ["organizationAcls (versionada)", "/rest/organizationAcls", versao],
    ["organizationalEntityAcls (legado)", "/v2/organizationalEntityAcls", undefined],
  ] as const) {
    try {
      const r = await cliente.chamar<{ elements?: Array<Record<string, unknown>> }>(caminho, {
        token: o.token, versao: ver,
        params: {
          q: "roleAssignee", count: "50",
          projection: "(elements*(*,organizationalTarget~(id,localizedName,vanityName)))",
        },
      });
      const els = r.elements ?? [];
      for (const el of els) {
        const alvo = String(el.organizationalTarget ?? el.organization ?? "");
        const id = alvo.split(":").pop() ?? "";
        if (!id || organizacoes.some((x) => x.id === id)) continue;
        const det = (el["organizationalTarget~"] ?? {}) as Record<string, unknown>;
        organizacoes.push({
          id, urn: alvo || `urn:li:organization:${id}`,
          nome: det.localizedName ? String(det.localizedName) : null,
          vanity: det.vanityName ? String(det.vanityName) : null,
          papel: el.role ? String(el.role) : null,
          estado: el.state ? String(el.state) : null,
        });
      }
      reg("descoberta", item, els.length > 0,
        els.length ? `${els.length} vínculo(s) · papéis: ${Array.from(new Set(els.map((e) => String(e.role ?? "?")))).join(", ")}`
          : "respondeu, sem nenhuma Página vinculada a este membro");
    } catch (e) {
      falha("descoberta", item, e);
    }
  }

  const alvo = o.organizationId
    ? organizacoes.find((x) => x.id === o.organizationId)
        ?? { id: o.organizationId, urn: `urn:li:organization:${o.organizationId}`, nome: null, vanity: null, papel: null, estado: null }
    : organizacoes[0] ?? null;

  if (alvo) {
    try {
      const r = await cliente.chamar<Record<string, unknown>>(`/rest/organizations/${alvo.id}`, {
        token: o.token, versao,
      });
      alvo.nome ??= r.localizedName ? String(r.localizedName) : null;
      alvo.vanity ??= r.vanityName ? String(r.vanityName) : null;
      reg("descoberta", "detalhes da organização", true,
        `campos: ${Object.keys(r).filter((k) => !k.startsWith("$")).slice(0, 10).join(", ")}`);
    } catch (e) {
      falha("descoberta", "detalhes da organização", e);
    }
  }

  // Sem organização, todo o resto mede o vazio. Dizer isso UMA vez é honesto;
  // repetir "sem organização" em vinte linhas transformaria o relatório num
  // muro de ruído que esconde o achado de cima.
  if (!alvo) {
    for (const g of ["crescimento", "pagina", "publicacoes"] as const) {
      reg(g, "(todas)", false, "sem organização alcançável — a descoberta acima não devolveu nenhuma Página");
    }
    return montar({ linhas, versao: v.versao, scopes, organizacoes, alvo: null, retroatividade: null });
  }

  const urn = alvo.urn;

  // ── 3a. CRESCIMENTO ───────────────────────────────────────────────────────
  try {
    const r = await cliente.chamar<{ firstDegreeSize?: number }>(
      `/rest/networkSizes/${encodeURIComponent(urn)}`,
      { token: o.token, versao, params: { edgeType: "CompanyFollowedByMember" } });
    reg("crescimento", "seguidores atuais", typeof r.firstDegreeSize === "number",
      typeof r.firstDegreeSize === "number" ? `${r.firstDegreeSize}` : "respondeu sem firstDegreeSize");
  } catch (e) {
    falha("crescimento", "seguidores atuais", e);
  }

  /** Uma leitura de estatística de seguidores, com ou sem janela. */
  const seguidoresEm = async (item: string, cru?: string) => {
    try {
      const r = await cliente.chamar<{ elements?: Array<Record<string, unknown>> }>(
        "/rest/organizationalEntityFollowerStatistics", {
          token: o.token, versao,
          params: { q: "organizationalEntity", organizationalEntity: urn },
          cru: cru ? { timeIntervals: cru } : undefined,
        });
      const els = r.elements ?? [];
      if (!els.length) {
        // Parâmetro aceito e resposta vazia — exatamente o caso do
        // `online_followers` da Meta. NÃO é disponibilidade.
        reg("crescimento", item, false, "respondeu com lista VAZIA (parâmetro aceito, dado ausente)");
        return 0;
      }
      const segs = segmentacoesDe(els[0]);
      const ganhos = numerosDe(els[0].followerGains);
      reg("crescimento", item, true,
        `${els.length} elemento(s)` +
        (ganhos.length ? ` · ganhos: ${ganhos.join(", ")}` : "") +
        (segs.length ? ` · segmentações: ${segs.join(", ")}` : ""));
      return els.length;
    } catch (e) {
      falha("crescimento", item, e);
      return -1;
    }
  };

  await seguidoresEm("estatísticas vitalícias");
  const recentes = await seguidoresEm("por dia · últimos 7 dias fechados", janelaRestli(agora, 8, 1));
  // A janela decisiva: dois meses atrás, dias há muito fechados. Se responder,
  // o histórico é buscável e o snapshot diário deixa de ser obrigatório.
  const antigos = await seguidoresEm("por dia · janela de 60 a 30 dias atrás", janelaRestli(agora, 60, 30));
  const retroatividade = antigos > 0 ? true : antigos === 0 ? false : null;

  // ── 3b. PÁGINA ────────────────────────────────────────────────────────────
  const paginaEm = async (item: string, cru?: string) => {
    try {
      const r = await cliente.chamar<{ elements?: Array<Record<string, unknown>> }>(
        "/rest/organizationPageStatistics", {
          token: o.token, versao,
          params: { q: "organization", organization: urn },
          cru: cru ? { timeIntervals: cru } : undefined,
        });
      const els = r.elements ?? [];
      if (!els.length) {
        reg("pagina", item, false, "respondeu com lista VAZIA (parâmetro aceito, dado ausente)");
        return;
      }
      const nums = numerosDe(els[0].totalPageStatistics ?? els[0]);
      reg("pagina", item, nums.length > 0,
        nums.length ? `${els.length} elemento(s) · ${nums.slice(0, 12).join(", ")}` : `${els.length} elemento(s), nenhum número`);
    } catch (e) {
      falha("pagina", item, e);
    }
  };

  await paginaEm("visualizações · vitalício");
  await paginaEm("visualizações · últimos 7 dias fechados", janelaRestli(agora, 8, 1));
  await paginaEm("visualizações · janela de 60 a 30 dias atrás", janelaRestli(agora, 60, 30));

  // ── 3c. PUBLICAÇÕES ───────────────────────────────────────────────────────
  let urnDoPost: string | null = null;
  let maisAntigo: string | null = null;
  try {
    const r = await cliente.chamar<{ elements?: Array<Record<string, unknown>> }>("/rest/posts", {
      token: o.token, versao,
      params: { q: "author", author: urn, count: "20", sortBy: "LAST_MODIFIED" },
    });
    const els = r.elements ?? [];
    if (els.length) {
      urnDoPost = String(els[0].id ?? "");
      const datas = els
        .map((e) => (typeof e.createdAt === "number" ? e.createdAt : null))
        .filter((x): x is number => x !== null)
        .sort((a, b) => a - b);
      maisAntigo = datas.length ? new Date(datas[0]).toISOString().slice(0, 10) : null;
    }
    reg("publicacoes", "listar posts (q=author)", els.length > 0,
      els.length
        ? `${els.length} post(s) · mais antigo desta página: ${maisAntigo ?? "sem createdAt"} · campos: ${Object.keys(els[0]).slice(0, 10).join(", ")}`
        : "respondeu, sem posts");
  } catch (e) {
    falha("publicacoes", "listar posts (q=author)", e);
  }

  reg("publicacoes", "timestamp de publicação", maisAntigo !== null,
    maisAntigo !== null ? `createdAt em epoch ms · mais antigo lido: ${maisAntigo}` : "nenhum createdAt legível");

  try {
    const r = await cliente.chamar<{ elements?: Array<Record<string, unknown>> }>(
      "/rest/organizationalEntityShareStatistics", {
        token: o.token, versao,
        params: { q: "organizationalEntity", organizationalEntity: urn },
      });
    const els = r.elements ?? [];
    const nums = els.length ? numerosDe(els[0].totalShareStatistics ?? els[0]) : [];
    reg("publicacoes", "estatísticas agregadas", nums.length > 0,
      nums.length ? nums.slice(0, 14).join(", ") : "respondeu sem números");
  } catch (e) {
    falha("publicacoes", "estatísticas agregadas", e);
  }

  if (urnDoPost) {
    // O parâmetro muda com o tipo de URN, e errar isso devolveria 400 — que
    // pareceria "não dá para medir post individual" quando dá.
    const chave = urnDoPost.includes(":ugcPost:") ? "ugcPosts" : "shares";
    try {
      const r = await cliente.chamar<{ elements?: Array<Record<string, unknown>> }>(
        "/rest/organizationalEntityShareStatistics", {
          token: o.token, versao,
          params: { q: "organizationalEntity", organizationalEntity: urn },
          cru: { [chave]: `List(${encodeURIComponent(urnDoPost)})` },
        });
      const els = r.elements ?? [];
      const nums = els.length ? numerosDe(els[0].totalShareStatistics ?? els[0]) : [];
      reg("publicacoes", "estatísticas POR post", nums.length > 0,
        nums.length ? `via ${chave} · ${nums.slice(0, 14).join(", ")}` : `via ${chave} · respondeu sem números`);
    } catch (e) {
      falha("publicacoes", "estatísticas POR post", e);
    }

    try {
      const r = await cliente.chamar<Record<string, unknown>>(
        `/rest/socialActions/${encodeURIComponent(urnDoPost)}`, { token: o.token, versao });
      const likes = (r.likesSummary as { totalLikes?: unknown } | undefined)?.totalLikes;
      const coment = (r.commentsSummary as { totalFirstLevelComments?: unknown } | undefined)?.totalFirstLevelComments;
      reg("publicacoes", "curtidas e comentários do post", likes !== undefined || coment !== undefined,
        `likes=${descrever(likes)} · comentários=${descrever(coment)}`);
    } catch (e) {
      falha("publicacoes", "curtidas e comentários do post", e);
    }
  } else {
    reg("publicacoes", "estatísticas POR post", false, "sem post para medir — a listagem acima não devolveu nenhum");
    reg("publicacoes", "curtidas e comentários do post", false, "sem post para medir");
  }

  void recentes;
  return montar({ linhas, versao: v.versao, scopes, organizacoes, alvo, retroatividade });
}

// ─── Relatório ───────────────────────────────────────────────────────────────

const TITULO: Record<GrupoLinkedIn, string> = {
  acesso: "1. ACESSO E AUTENTICAÇÃO",
  descoberta: "2. DESCOBERTA DE CONTAS",
  crescimento: "3a. CRESCIMENTO",
  pagina: "3b. PÁGINA",
  publicacoes: "3c. PUBLICAÇÕES",
};

function montar(x: {
  linhas: LinhaLinkedIn[]; versao: string | null; scopes: string[];
  organizacoes: OrganizacaoDescoberta[]; alvo: OrganizacaoDescoberta | null;
  retroatividade: boolean | null;
}): SondagemLinkedIn {
  const disponiveis = x.linhas.filter((l) => l.disponivel).length;
  return {
    ok: disponiveis > 0,
    versaoUsada: x.versao,
    scopes: x.scopes,
    organizacoes: x.organizacoes,
    organizacaoMedida: x.alvo,
    linhas: x.linhas,
    disponiveis,
    indisponiveis: x.linhas.length - disponiveis,
    retroatividade: x.retroatividade,
    texto: texto(x, disponiveis),
  };
}

function texto(x: {
  linhas: LinhaLinkedIn[]; versao: string | null; scopes: string[];
  organizacoes: OrganizacaoDescoberta[]; alvo: OrganizacaoDescoberta | null;
  retroatividade: boolean | null;
}, disponiveis: number): string {
  const out: string[] = [
    `sondagem LinkedIn · Fase 0 · ${disponiveis}/${x.linhas.length} itens disponíveis`,
    `versão da API: ${x.versao ?? "nenhuma respondeu"}`,
    `escopos medidos: ${x.scopes.length ? x.scopes.join(", ") : "não medidos (sem client_id/secret)"}`,
    `Páginas alcançadas: ${x.organizacoes.length}` +
      (x.organizacoes.length ? ` — ${x.organizacoes.map((o) => `${o.nome ?? o.id} (${o.papel ?? "?"})`).join(", ")}` : ""),
    `Página medida: ${x.alvo ? `${x.alvo.nome ?? "sem nome"} · id ${x.alvo.id}` : "nenhuma"}`,
    "",
  ];

  for (const grupo of Object.keys(TITULO) as GrupoLinkedIn[]) {
    const doGrupo = x.linhas.filter((l) => l.grupo === grupo);
    if (!doGrupo.length) continue;
    out.push(`── ${TITULO[grupo]} ──`);
    for (const l of doGrupo) {
      out.push(
        `[${l.disponivel ? "SIM" : "NÃO"}] ${l.item.padEnd(34)} ${l.detalhe}` +
        (l.causa ? `\n       → ${CORRECAO[l.causa]}` : ""),
      );
    }
    out.push("");
  }

  // ── O veredito, CALCULADO ─────────────────────────────────────────────────
  // Mesma disciplina do resumo da rodada da Meta: quem lê rápido não deve ter
  // que reconstruir a conclusão a partir de trinta linhas.
  out.push("── VEREDITO ──");

  if (!x.organizacoes.length) {
    out.push("BLOQUEADO na descoberta: o token não alcança nenhuma Página.");
    out.push("Nada abaixo disso pôde ser medido — não confundir com 'métrica indisponível'.");
  }

  const porCausa = new Map<CausaDaFalha, string[]>();
  for (const l of x.linhas) {
    if (l.disponivel || !l.causa) continue;
    porCausa.set(l.causa, [...(porCausa.get(l.causa) ?? []), l.item]);
  }
  if (porCausa.size) {
    out.push("");
    out.push("O que falhou, agrupado pelo que RESOLVE:");
    for (const [causa, itens] of Array.from(porCausa.entries())) {
      out.push(`  ${CORRECAO[causa]}`);
      out.push(`    ${itens.join(", ")}`);
    }
  }

  out.push("");
  out.push("Retroatividade (a medição que decide a arquitetura):");
  if (x.retroatividade === true) {
    out.push("  SIM — dias fechados de 30-60 dias atrás responderam com dado.");
    out.push("  O histórico é buscável: dá para preencher o passado de uma vez na");
    out.push("  conexão, e o cron vira conveniência em vez de obrigação. É o oposto");
    out.push("  do Instagram, onde o snapshot diário é o ÚNICO registro do dia.");
  } else if (x.retroatividade === false) {
    out.push("  NÃO — a janela antiga respondeu vazia.");
    out.push("  Mesmo modelo do Instagram: snapshot diário obrigatório, e o que não");
    out.push("  for coletado naquele dia não volta.");
  } else {
    out.push("  INDETERMINADO — a chamada falhou antes de responder. Ver a causa acima:");
    out.push("  falha de escopo ou de produto não diz nada sobre retroatividade.");
  }

  out.push("");
  out.push("Nenhum token e nenhum conteúdo de publicação aparece acima.");
  return out.join("\n");
}
