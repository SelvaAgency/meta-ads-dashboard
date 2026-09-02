/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Sondagem do LinkedIn · Fase 0 · segunda rodada
 * ─────────────────────────────────────────────────────────────────────────────
 *  Somente leitura. Não grava no banco, não cria coletor, não toca em tela.
 *  Existe para responder o que a documentação não responde: o que ESTE app, com
 *  ESTES escopos, consegue ler de VERDADE.
 *
 *  ── O que a primeira rodada deixou em aberto ──────────────────────────────
 *  Ela mediu UMA página — a primeira da lista, que calhou de ser quase dormente.
 *  Resultado: quatro itens de publicações vieram como "NÃO" quando na verdade
 *  eram INCONCLUSIVOS: `respondeu, sem posts` numa página sem posts é a resposta
 *  certa da API, não uma falha dela.
 *
 *  E dois `400` foram lidos como limitação da API quando eram erro nosso:
 *  mandávamos `projection` para o endpoint versionado (que usa `fields`) e uma
 *  forma errada de `networkSizes`.
 *
 *  ── As três perguntas que esta rodada existe para fechar ───────────────────
 *    1. Publicações e as métricas delas: dá ou não dá, medido numa página ATIVA
 *    2. `CONTENT_ADMINISTRATOR` lê analytics, ou só `ADMINISTRATOR`?
 *    3. Até onde o histórico retroativo alcança de verdade
 *
 *  ── A regra que governa o relatório ────────────────────────────────────────
 *  Nada é preenchido por suposição. Um item que a API não permitiu determinar
 *  sai como INCONCLUSIVO — e a seção final lista só o que continuou assim.
 *  "Provavelmente funciona" não é resultado de sondagem.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import {
  medirLinkedIn, versaoQueResponde, introspectarToken, sanitizar,
  type OpcoesChamada, type RespostaMedida,
} from "./linkedin";

// ─── O veredito de cada medição ──────────────────────────────────────────────

/**
 * Seis desfechos, e cada um pede uma ação diferente.
 *
 * A primeira rodada colapsava três deles em "NÃO", e foi isso que fez um
 * resultado inconclusivo parecer uma limitação da API.
 */
export type Desfecho =
  /** 2xx com dado. */
  | "funciona"
  /** 2xx com lista vazia porque a página não tem atividade — NÃO é limitação. */
  | "sem_atividade"
  /** 403: falta cargo na Página, ou escopo, ou produto aprovado no app. */
  | "sem_permissao"
  /** 400: a requisição está errada. É nosso, e tem conserto aqui. */
  | "request_invalido"
  /** 404 ou "unknown": o endpoint não existe nesta versão. */
  | "indisponivel"
  /** Não deu para determinar — e o relatório diz por quê. */
  | "inconclusivo";

export const ROTULO_DESFECHO: Record<Desfecho, string> = {
  funciona: "OK  ",
  sem_atividade: "VAZIO",
  sem_permissao: "PERM",
  request_invalido: "REQ ",
  indisponivel: "N/D ",
  inconclusivo: "?   ",
};

/** O que resolve cada desfecho. É a coluna acionável do relatório. */
export const CORRECAO: Record<Desfecho, string> = {
  funciona: "—",
  sem_atividade: "nada a corrigir — a página não tem esse dado no período",
  sem_permissao: "cargo na Página, escopo do token, ou produto aprovado no app",
  request_invalido: "corrigir a forma da requisição — é erro nosso",
  indisponivel: "endpoint não existe nesta versão da API",
  inconclusivo: "não determinável com o que temos — ver a observação",
};

/**
 * Classifica pela EVIDÊNCIA, e nunca por suposição.
 *
 * `sem_atividade` só é atribuído por quem sabe se a lista veio vazia — por isso
 * ele entra por parâmetro, e não é deduzido do status.
 */
export function classificar(r: { ok: boolean; status: number | null; erro: string | null },
  vazio = false): Desfecho {
  if (r.ok) return vazio ? "sem_atividade" : "funciona";
  const msg = (r.erro ?? "").toLowerCase();
  if (r.status === 401) return "sem_permissao";
  if (r.status === 403) return "sem_permissao";
  if (r.status === 404) return "indisponivel";
  if (r.status === 400) {
    // "unknown field/param" é a API dizendo que o campo não existe nela — isso
    // é indisponibilidade, e não requisição torta.
    if (msg.includes("unknown")) return "indisponivel";
    return "request_invalido";
  }
  if (r.status === null) return "inconclusivo";
  return "inconclusivo";
}

// ─── O registro de cada medição ──────────────────────────────────────────────

export type GrupoLinkedIn =
  | "acesso" | "descoberta" | "cargo" | "crescimento" | "pagina" | "publicacoes" | "historico";

/**
 * Uma linha do relatório.
 *
 * Ela guarda o que o pedido exige registrar de CADA endpoint: status, escopo
 * necessário e concedido, estrutura, período, paginação e volume. Sem isso o
 * relatório vira uma lista de sim/não que não sustenta decisão de arquitetura.
 */
export interface Medicao {
  grupo: GrupoLinkedIn;
  item: string;
  /** A página medida, quando a linha é por página. */
  pagina?: string;
  papel?: string | null;
  desfecho: Desfecho;
  endpoint: string;
  metodo: "GET";
  status: number | null;
  codigo: number | null;
  /** O escopo que a documentação do LinkedIn exige para este endpoint. */
  escopoNecessario: string | null;
  /** `true`/`false`/`null` quando não se sabe quais escopos o token tem. */
  escopoConcedido: boolean | null;
  /** Os campos que voltaram — a estrutura real, não a prometida. */
  campos: string[];
  /** Números lidos, com o caminho completo. */
  valores: string[];
  /** A janela pedida, quando houve. */
  periodo: string | null;
  granularidade: string | null;
  /** Quantos elementos vieram. */
  quantidade: number | null;
  /** Há mais páginas? `null` quando o endpoint não informa. */
  paginado: boolean | null;
  limites: Record<string, string>;
  erro: string | null;
  /** Observação livre — é onde um inconclusivo explica por quê. */
  nota?: string;
}

export interface OrganizacaoDescoberta {
  id: string;
  urn: string;
  nome: string | null;
  vanity: string | null;
  /** O cargo principal — o primeiro que a ACL devolveu para esta Página. */
  papel: string | null;
  /**
   * TODOS os cargos deste membro nesta Página.
   *
   * A rodada 2 deduplicava por Página e descartava o resto: a ACL devolveu 22
   * atribuições com cinco cargos distintos, e a sondagem reportou dezesseis
   * Páginas com dois cargos. Os três cargos que sumiram eram segundos cargos
   * em Páginas já vistas — e por isso nenhuma Página de "outro cargo" foi
   * medida.
   */
  papeis: string[];
  estado: string | null;
  /** O `state` de CADA atribuição, na ordem de `papeis`. */
  estados: string[];
  /**
   * `true` quando pelo menos UMA atribuição está APPROVED.
   *
   * É o portão que faltava. Uma atribuição REVOKED significa que a pessoa da
   * SELVA foi removida daquela Página — medir ali produz 403 em tudo, e ler
   * esse 403 como "a API não entrega" é o erro mais caro que esta sondagem
   * pode cometer. Foi o que aconteceu: duas rodadas seguidas mediram Páginas
   * diferentes e chegaram a conclusões opostas sobre a mesma API.
   */
  aprovado: boolean;
  /**
   * `true` quando a ACL devolveu `organizationalTarget!` em vez de `~`.
   *
   * O `!` é a decoração FALHANDO: o LinkedIn não deixou nem ler o nome da
   * Página. É um pré-teste de acesso que sai de graça, antes de qualquer
   * chamada de estatística.
   */
  decoracaoFalhou: boolean;
  /** `roleAssignee` — a quem o cargo está atribuído. */
  atribuidoA: string | null;
}

/** O que se descobriu sobre um cargo, medindo — e não lendo documentação. */
export interface VeredictoDeCargo {
  papel: string;
  paginasComEssePapel: number;
  /** TODAS as páginas medidas com esse cargo. Vazio quando não havia nenhuma. */
  medidas: string[];
  /**
   * Por capacidade: o consenso entre as páginas medidas com esse cargo.
   *
   * `inconclusivo` quando elas DIVERGEM — porque aí a capacidade não é do
   * cargo. A rodada 2 lia só a primeira página do cargo e afirmou que
   * ADMINISTRATOR não lê seguidores, enquanto outra ADMINISTRATOR no mesmo
   * relatório lia. Um veredito que contradiz o próprio relatório é pior que
   * nenhum.
   */
  alcanca: Record<string, Desfecho>;
  /** Capacidade → o que cada página respondeu, quando elas discordam. */
  divergentes: Record<string, string>;
  /**
   * `true` quando TODAS as páginas medidas deste cargo também têm outros
   * cargos. Aí o resultado é da Página, não do cargo — e afirmar o contrário
   * seria atribuir a um cargo o que pode vir de qualquer um dos outros.
   */
  ambiguo: boolean;
}

export interface SondagemLinkedIn {
  ok: boolean;
  versaoUsada: string | null;
  scopes: string[];
  organizacoes: OrganizacaoDescoberta[];
  /** As páginas efetivamente medidas nesta rodada. */
  medidas: OrganizacaoDescoberta[];
  medicoes: Medicao[];
  cargos: VeredictoDeCargo[];
  /** O horizonte retroativo mais profundo que devolveu dado, em dias. */
  historicoMaisProfundoDias: number | null;
  /** A página em que o histórico foi medido, e por que ela foi escolhida. */
  historicoMedidoEm: string | null;
  /**
   * Dias entre hoje e a publicação mais antiga cujas métricas foram medidas
   * com sucesso. É a retroatividade de CONTEÚDO — independente da janela de
   * estatísticas de seguidores, e pode ser a que decide a arquitetura.
   */
  retroatividadeDeConteudoDias: number | null;
  /** A primeira janela que NÃO devolveu — o limite real, quando encontrado. */
  historicoLimiteDias: number | null;
  /** Medições com dado. Para o resumo de uma linha na tela. */
  disponiveis: number;
  /** Tudo que não é `funciona` — inclui os inconclusivos, de propósito. */
  indisponiveis: number;
  texto: string;
}

// ─── Janelas de tempo ────────────────────────────────────────────────────────

/**
 * Meia-noite UTC de um dia N dias atrás.
 *
 * Precisa ser meia-noite: com granularidade DAY o LinkedIn recusa — ou trunca
 * em silêncio — um intervalo que começa no meio do dia. "Truncou em silêncio" é
 * o pior desfecho possível numa sondagem, porque devolve dado plausível e errado.
 */
export function meiaNoiteUTC(agora: Date, diasAtras: number): number {
  const d = new Date(agora);
  d.setUTCDate(d.getUTCDate() - diasAtras);
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
}

/** A sintaxe Rest.li de intervalo. Não pode ser percent-encodada. */
export function janelaRestli(agora: Date, deDiasAtras: number, ateDiasAtras: number): string {
  return `(timeRange:(start:${meiaNoiteUTC(agora, deDiasAtras)},`
    + `end:${meiaNoiteUTC(agora, ateDiasAtras)}),timeGranularityType:DAY)`;
}

// ─── Leitura de estrutura ────────────────────────────────────────────────────

/** Os caminhos numéricos de um objeto, achatados. Mostra a ESTRUTURA real. */
export function numerosDe(o: unknown, prefixo = "", profundidade = 0): string[] {
  if (profundidade > 4 || o === null || typeof o !== "object") return [];
  const saida: string[] = [];
  for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
    const caminho = prefixo ? `${prefixo}.${k}` : k;
    if (typeof v === "number") saida.push(`${caminho}=${v}`);
    else if (v && typeof v === "object" && !Array.isArray(v)) {
      saida.push(...numerosDe(v, caminho, profundidade + 1));
    }
  }
  return saida;
}

/** As chaves de segmentação de um elemento de estatística. */
export function segmentacoesDe(el: Record<string, unknown>): string[] {
  return Object.keys(el).filter((k) => k.startsWith("followerCountsBy") || k.startsWith("shareStatisticsBy"));
}

const campoDe = (o: unknown): string[] =>
  o && typeof o === "object" ? Object.keys(o as object).filter((k) => !k.startsWith("$")) : [];

/**
 * `paging.links` ou `paging.total` dizem se há mais. Sem eles, `null`.
 *
 * `false` afirmaria que a lista está completa, e afirmar isso sem o campo seria
 * inventar — justamente o que esta rodada existe para não fazer.
 */
function paginacaoDe(dados: unknown): boolean | null {
  const p = (dados as { paging?: { links?: unknown[]; total?: number; count?: number; start?: number } })?.paging;
  if (!p) return null;
  if (Array.isArray(p.links)) return p.links.some((l) => (l as { rel?: string })?.rel === "next");
  if (typeof p.total === "number" && typeof p.count === "number" && typeof p.start === "number") {
    return p.start + p.count < p.total;
  }
  return null;
}

// ─── Escopos que cada endpoint exige ─────────────────────────────────────────

/**
 * O escopo documentado de cada endpoint.
 *
 * Serve para o relatório poder dizer, num 403, se o escopo estava concedido —
 * o que separa "falta escopo" de "falta cargo na Página". Os dois devolvem 403
 * e têm consertos completamente diferentes: um é reautorizar em minutos, o
 * outro é pedir ao cliente para mudar um cargo no LinkedIn dele.
 */
export const ESCOPO_DO_ENDPOINT: Record<string, string> = {
  "/v2/userinfo": "openid profile",
  "/v2/me": "r_basicprofile",
  "/rest/organizationAcls": "rw_organization_admin",
  "/v2/organizationalEntityAcls": "rw_organization_admin",
  "/rest/organizations": "rw_organization_admin",
  "/rest/networkSizes": "r_organization_followers",
  "/v2/networkSizes": "r_organization_followers",
  "/rest/organizationalEntityFollowerStatistics": "r_organization_followers",
  "/rest/organizationPageStatistics": "r_organization_social",
  "/rest/posts": "r_organization_social",
  "/rest/organizationalEntityShareStatistics": "r_organization_social",
  "/rest/socialActions": "r_organization_social",
  "/rest/socialMetadata": "r_organization_social",
};

/** O prefixo do caminho, para casar com a tabela acima. */
function escopoDe(endpoint: string): string | null {
  const limpo = endpoint.split("?")[0];
  for (const chave of Object.keys(ESCOPO_DO_ENDPOINT)) {
    if (limpo === chave || limpo.startsWith(`${chave}/`)) return ESCOPO_DO_ENDPOINT[chave];
  }
  return null;
}

export interface ClienteLinkedIn {
  medir: <T>(caminho: string, o: OpcoesChamada) => Promise<RespostaMedida<T>>;
  versao: (token: string) => Promise<{ versao: string | null; tentativas: Array<{ versao: string; ok: boolean; detalhe: string }> }>;
  introspectar: (token: string, clientId: string, clientSecret: string) => Promise<{
    ativo: boolean; scopes: string[]; expiraEm: Date | null; autorizadoEm: Date | null; tipo: string | null;
  }>;
}

const CLIENTE_REAL: ClienteLinkedIn = {
  medir: medirLinkedIn,
  versao: versaoQueResponde,
  introspectar: introspectarToken,
};

export interface OpcoesSondagem {
  token: string;
  /** Usados UMA VEZ para introspecção, e nunca gravados. */
  clientId?: string;
  clientSecret?: string;
  /** Força a medição desta organização, em vez da seleção automática. */
  organizationId?: string;
  agora?: Date;
  /** Teto de páginas a sondar por atividade. Protege a cota. */
  tetoDeCandidatas?: number;
}

/** Quantas páginas se olha procurando uma ATIVA, antes de desistir. */
/** A rodada da sondagem. Fica no cabeçalho para não confundir dois relatórios. */
const RODADA = 5;

const TETO_DE_CANDIDATAS = 6;

/** Até onde a sondagem desce na listagem de publicações. Protege a cota. */
const TETO_DE_PAGINAS_DE_POST = 4;

/** Quantos posts se pede numa chamada só, para medir o custo de coleta. */
const TAMANHO_DO_LOTE = 5;

/**
 * As janelas retroativas, da mais rasa à mais profunda.
 *
 * Sondar progressivamente é o que permite dizer o LIMITE em vez de "funcionou
 * em 60 dias". Cada uma é um mês fechado, longe do dia corrente, para que um
 * vazio signifique "a API não guarda" e não "o período ainda não fechou".
 */
const HORIZONTES = [
  { rotulo: "30 a 60 dias atrás", de: 60, ate: 30 },
  { rotulo: "90 a 120 dias atrás", de: 120, ate: 90 },
  { rotulo: "180 a 210 dias atrás", de: 210, ate: 180 },
  { rotulo: "365 a 395 dias atrás", de: 395, ate: 365 },
  { rotulo: "730 a 760 dias atrás", de: 760, ate: 730 },
] as const;

export async function sondarLinkedIn(
  o: OpcoesSondagem, cliente: ClienteLinkedIn = CLIENTE_REAL,
): Promise<SondagemLinkedIn> {
  const agora = o.agora ?? new Date();
  const medicoes: Medicao[] = [];
  let scopes: string[] = [];

  /** Registra uma medição a partir da resposta crua. */
  const reg = (x: {
    grupo: GrupoLinkedIn; item: string; endpoint: string;
    r: RespostaMedida<unknown>; vazio?: boolean;
    pagina?: string; papel?: string | null;
    campos?: string[]; valores?: string[];
    periodo?: string | null; granularidade?: string | null;
    quantidade?: number | null; nota?: string;
  }): Medicao => {
    const necessario = escopoDe(x.endpoint);
    const m: Medicao = {
      grupo: x.grupo, item: x.item, pagina: x.pagina, papel: x.papel,
      desfecho: classificar(x.r, x.vazio),
      endpoint: x.endpoint, metodo: "GET",
      status: x.r.status, codigo: x.r.codigo,
      escopoNecessario: necessario,
      // `null` quando não se sabe quais escopos o token tem — sem client
      // secret, a introspecção não roda e afirmar concessão seria inventar.
      escopoConcedido: necessario === null || scopes.length === 0
        ? null
        : necessario.split(" ").every((e) => scopes.includes(e)),
      campos: x.campos ?? [],
      valores: x.valores ?? [],
      periodo: x.periodo ?? null,
      granularidade: x.granularidade ?? null,
      quantidade: x.quantidade ?? null,
      paginado: paginacaoDe(x.r.dados),
      limites: x.r.limites,
      erro: x.r.erro,
      nota: x.nota,
    };
    medicoes.push(m);
    return m;
  };

  /** Uma medição que não veio de chamada — anotação estrutural. */
  const anotar = (grupo: GrupoLinkedIn, item: string, desfecho: Desfecho, nota: string) => {
    medicoes.push({
      grupo, item, desfecho, endpoint: "—", metodo: "GET", status: null, codigo: null,
      escopoNecessario: null, escopoConcedido: null, campos: [], valores: [],
      periodo: null, granularidade: null, quantidade: null, paginado: null,
      limites: {}, erro: null, nota,
    });
  };

  // ── 1. ACESSO ─────────────────────────────────────────────────────────────
  const v = await cliente.versao(o.token);
  anotar("acesso", "versão da API", v.versao ? "funciona" : "indisponivel",
    v.versao
      ? `${v.versao} aceita (tentadas ${v.tentativas.length})`
      : `NENHUMA das ${v.tentativas.length} candidatas responde`);
  const versao = v.versao ?? undefined;

  if (o.clientId && o.clientSecret) {
    try {
      const i = await cliente.introspectar(o.token, o.clientId, o.clientSecret);
      scopes = i.scopes;
      const dias = i.expiraEm
        ? Math.round((i.expiraEm.getTime() - agora.getTime()) / 86_400_000) : null;
      anotar("acesso", "introspecção do token", i.ativo ? "funciona" : "sem_permissao",
        `${i.ativo ? "ativo" : "INATIVO"} · tipo ${i.tipo ?? "?"} · expira `
        + `${i.expiraEm?.toISOString().slice(0, 16).replace("T", " ") ?? "?"}`
        + (dias !== null ? ` (em ${dias} dia(s))` : "")
        + ` · ${i.scopes.length} escopo(s)`);
      anotar("acesso", "escopos concedidos", i.scopes.length ? "funciona" : "inconclusivo",
        i.scopes.length ? i.scopes.join(", ") : "nenhum escopo veio na introspecção");
    } catch (e) {
      anotar("acesso", "introspecção do token", "inconclusivo",
        sanitizar((e as Error).message ?? "erro", o.token));
    }
  } else {
    anotar("acesso", "introspecção do token", "inconclusivo",
      "não solicitada — sem client_id/secret. Sem ela, 'escopo concedido' fica "
      + "indeterminado em todo o relatório, e um 403 não se separa de falta de cargo.");
  }

  for (const [item, caminho] of [
    ["identidade (OpenID)", "/v2/userinfo"],
    ["identidade (legado)", "/v2/me"],
  ] as const) {
    const r = await cliente.medir<Record<string, unknown>>(caminho, { token: o.token });
    reg({ grupo: "acesso", item, endpoint: caminho, r, campos: campoDe(r.dados) });
  }

  // ── 2. DESCOBERTA ─────────────────────────────────────────────────────────
  //
  // No LinkedIn o alcance vem do CARGO de um membro em cada Página — não existe
  // System User como na Meta. Cada Página de cliente precisa nomear alguém.
  const organizacoes: OrganizacaoDescoberta[] = [];
  /** Atribuições de cargo lidas — pode ser MAIOR que o número de Páginas. */
  let atribuicoes = 0;

  /**
   * As duas formas, e elas divergem no nome do parâmetro de projeção.
   *
   * A primeira rodada mandava `projection` para as duas e o endpoint versionado
   * respondeu `projection parameter is not allowed for this endpoint` — um 400
   * que parecia limitação da API e era erro nosso. O versionado usa `fields`.
   */
  const DECORADA = "(elements*(*,organizationalTarget~(id,localizedName,vanityName)))";
  for (const [item, caminho, ver, projecao, nota] of [
    // A rodada 2 trocou `projection` por `fields` no versionado e recebeu o
    // MESMO 400 — a mensagem chama de "projection" o que se manda em `fields`.
    // Então o problema não é o nome do parâmetro: é a decoração `~`. Aqui se
    // mede isso em vez de deduzir, descendo até a chamada sem projeção nenhuma.
    ["organizationAcls versionada · fields decorado", "/rest/organizationAcls", versao,
      { fields: DECORADA }, "`fields` com decoração `organizationalTarget~`"],
    ["organizationAcls versionada · fields sem decoração", "/rest/organizationAcls", versao,
      { fields: "(elements*(*))" }, "`fields` sem `~` — isola a decoração como causa"],
    ["organizationAcls versionada · sem projeção", "/rest/organizationAcls", versao,
      {}, "nenhuma projeção — se este passar, o endpoint serve e o problema era a forma"],
    ["organizationalEntityAcls (legado)", "/v2/organizationalEntityAcls", undefined,
      { projection: DECORADA }, "`projection` com decoração"],
  ] as const) {
    const r = await cliente.medir<{ elements?: Array<Record<string, unknown>> }>(caminho, {
      token: o.token, versao: ver,
      params: { q: "roleAssignee", count: "50", ...projecao },
    });
    const els = r.dados?.elements ?? [];
    for (const el of els) {
      const alvo = String(el.organizationalTarget ?? el.organization ?? "");
      const id = alvo.split(":").pop() ?? "";
      if (!id) continue;
      const papel = el.role ? String(el.role) : null;
      const det = (el["organizationalTarget~"] ?? {}) as Record<string, unknown>;
      const estado = el.state ? String(el.state) : null;
      const falhou = el["organizationalTarget!"] !== undefined;
      const jaVista = organizacoes.find((x) => x.id === id);
      if (jaVista) {
        // Segundo cargo na MESMA Página. A rodada 2 descartava aqui, e com ele
        // ia embora a existência dos outros três cargos.
        if (papel && !jaVista.papeis.includes(papel)) {
          jaVista.papeis.push(papel);
          jaVista.estados.push(estado ?? "?");
        }
        if (estado === "APPROVED") jaVista.aprovado = true;
        if (falhou) jaVista.decoracaoFalhou = true;
        // A chamada SEM projeção passa antes da legada e vem sem decoração: as
        // Páginas entravam sem nome e o relatório inteiro saía com números de
        // organização no lugar dos clientes. Quem tiver o nome, preenche.
        jaVista.nome ??= det.localizedName ? String(det.localizedName) : null;
        jaVista.vanity ??= det.vanityName ? String(det.vanityName) : null;
        continue;
      }
      organizacoes.push({
        id, urn: alvo || `urn:li:organization:${id}`,
        nome: det.localizedName ? String(det.localizedName) : null,
        vanity: det.vanityName ? String(det.vanityName) : null,
        papel,
        papeis: papel ? [papel] : [],
        estado,
        estados: papel ? [estado ?? "?"] : [],
        aprovado: estado === "APPROVED",
        decoracaoFalhou: falhou,
        atribuidoA: el.roleAssignee ? String(el.roleAssignee) : null,
      });
    }
    // MÁXIMO, não soma: quatro tentativas leem a MESMA ACL, e somar contava
    // 22 atribuições duas vezes e reportava 44.
    atribuicoes = Math.max(atribuicoes, els.length);
    reg({
      grupo: "descoberta", item, endpoint: caminho, r,
      vazio: r.ok && els.length === 0,
      quantidade: els.length,
      campos: els.length ? campoDe(els[0]) : [],
      valores: els.length
        ? [`papéis: ${Array.from(new Set(els.map((e) => String(e.role ?? "?")))).join(", ")}`,
           `estados: ${Array.from(new Set(els.map((e) => String(e.state ?? "?")))).join(", ")}`]
        : [],
      nota,
    });
  }

  // A ACL não devolve os cargos em ordem estável: a MESMA Página apareceu como
  // CONTENT_ADMINISTRATOR numa rodada e DIRECT_SPONSORED_CONTENT_POSTER na
  // seguinte, e dois relatórios do mesmo dia pareceram falar de clientes
  // diferentes. O cargo principal passa a ser o de maior alcance.
  const ORDEM = ["ADMINISTRATOR", "CONTENT_ADMINISTRATOR"];
  const posto = (pp: string) => {
    const i = ORDEM.indexOf(pp);
    return i === -1 ? ORDEM.length : i;
  };
  for (const org of organizacoes) {
    const ordenados = [...org.papeis].sort((a, b) => posto(a) - posto(b) || a.localeCompare(b));
    if (ordenados.length) {
      const estadoPor = new Map(org.papeis.map((pp, i) => [pp, org.estados[i] ?? "?"]));
      org.papeis = ordenados;
      org.estados = ordenados.map((pp) => estadoPor.get(pp) ?? "?");
      org.papel = ordenados[0];
    }
  }

  const todosOsPapeis = Array.from(new Set(organizacoes.flatMap((x) => x.papeis)));
  anotar("descoberta", "cargos encontrados", organizacoes.length ? "funciona" : "inconclusivo",
    organizacoes.length
      ? todosOsPapeis
          .map((p) => `${p}: ${organizacoes.filter((x) => x.papeis.includes(p)).length}`)
          .join(" · ")
        + ` · ${organizacoes.length} Página(s) para ${atribuicoes} atribuição(ões)`
      : "nenhuma Página vinculada a este membro");

  // Estado da atribuição: a hipótese mais barata para "ADMINISTRATOR que não lê
  // estatística". Já vem na ACL — não custa chamada nenhuma, e afirmar sem
  // olhar seria a suposição que o pedido veta.
  const estados = Array.from(new Set(organizacoes.map((x) => x.estado ?? "?")));
  anotar("descoberta", "estado das atribuições",
    estados.length === 1 && estados[0] === "APPROVED" ? "funciona" : "inconclusivo",
    estados.length === 1 && estados[0] === "APPROVED"
      ? "todas APPROVED — o estado da atribuição NÃO explica diferença de acesso entre Páginas"
      : `estados distintos: ${estados.join(", ")} — comparar com quem falhou abaixo`);

  if (!organizacoes.length) {
    anotar("cargo", "(todas)", "inconclusivo",
      "sem organização alcançável — nada abaixo pôde ser medido");
    return montar({ medicoes, versao: v.versao, scopes, organizacoes, medidas: [], agora });
  }

  // ── SELEÇÃO DAS PÁGINAS A MEDIR ───────────────────────────────────────────
  //
  // A primeira rodada mediu `organizacoes[0]` e caiu numa página quase dormente.
  // Quatro itens de publicações vieram como "NÃO" quando eram inconclusivos.
  //
  // Aqui a escolha é por EVIDÊNCIA: pergunta-se a cada candidata quantos posts
  // ela tem, e mede-se a que tiver. O teto protege a cota — sondar dezesseis
  // páginas para escolher três seria gastar treze chamadas em nada.
  const contarPosts = async (org: OrganizacaoDescoberta) => {
    const r = await cliente.medir<{ elements?: unknown[] }>("/rest/posts", {
      token: o.token, versao,
      params: { q: "author", author: org.urn, count: "10", sortBy: "LAST_MODIFIED" },
    });
    return { r, n: r.dados?.elements?.length ?? 0 };
  };

  // ── O PORTÃO QUE FALTAVA ──────────────────────────────────────────────
  //
  // Duas rodadas mediram Páginas diferentes e chegaram a conclusões opostas
  // sobre a mesma API. A rodada 3 pegou duas APPROVED e viu 365 dias de
  // histórico; a rodada 4 pegou duas REVOKED e viu 403 em tudo, e o relatório
  // saiu dizendo que o LinkedIn não entrega histórico.
  //
  // REVOKED significa que a pessoa da SELVA foi removida daquela Página. O 403
  // dali é um fato sobre a carteira, não sobre a API — e um instrumento que
  // não separa as duas coisas mede ruído.
  const vivas = organizacoes.filter((x) => x.aprovado);
  const revogadas = organizacoes.filter((x) => !x.aprovado);
  anotar("descoberta", "atribuições vivas",
    vivas.length ? "funciona" : "sem_permissao",
    `${vivas.length} Página(s) com atribuição APPROVED · ${revogadas.length} sem nenhuma. `
    + (vivas.length
      ? "Só as vivas são medidas — um 403 de Página revogada não diz nada sobre a API."
      : "NENHUMA atribuição viva: tudo abaixo mede a carteira, não a API."));

  const candidatas = vivas.length ? vivas : organizacoes;
  const admins = candidatas.filter((x) => x.papeis.includes("ADMINISTRATOR"));
  const conteudo = candidatas.filter((x) => x.papeis.includes("CONTENT_ADMINISTRATOR"));
  // Uma Página cujo cargo NÃO é nenhum dos dois principais. Com a dedupe da
  // rodada 2 este balde vinha sempre vazio, e os outros três cargos nunca
  // foram medidos.
  const outros = candidatas.filter((x) =>
    x.papeis.length > 0
    && !x.papeis.includes("ADMINISTRATOR") && !x.papeis.includes("CONTENT_ADMINISTRATOR"));

  const medidas: OrganizacaoDescoberta[] = [];
  const teto = o.tetoDeCandidatas ?? TETO_DE_CANDIDATAS;

  if (o.organizationId) {
    // Escolha manual: respeita e não gasta chamada procurando.
    medidas.push(
      organizacoes.find((x) => x.id === o.organizationId)
      ?? { id: o.organizationId, urn: `urn:li:organization:${o.organizationId}`,
           nome: null, vanity: null, papel: null, papeis: [], estado: null,
           estados: [], aprovado: false, decoracaoFalhou: false, atribuidoA: null });
  } else {
    /** A primeira ADMINISTRATOR com post. Cai na primeira da lista se nenhuma tiver. */
    let ativa: OrganizacaoDescoberta | null = null;
    let tentadas = 0;
    for (const cand of admins.slice(0, teto)) {
      tentadas++;
      const { n } = await contarPosts(cand);
      if (n > 0) { ativa = cand; break; }
    }
    anotar("descoberta", "seleção da página ativa",
      ativa ? "funciona" : "sem_atividade",
      ativa
        ? `${ativa.nome ?? ativa.id} tem publicações — medida como ADMINISTRATOR ativa `
          + `(${tentadas} candidata(s) consultada(s))`
        : `nenhuma das ${tentadas} ADMINISTRATOR consultadas tem publicação. `
          + "As métricas de post abaixo medem uma página SEM posts, e um vazio ali "
          + "é sobre a carteira, não sobre a API.");

    if (ativa) medidas.push(ativa);
    else if (admins.length) medidas.push(admins[0]);

    // Uma CONTENT_ADMINISTRATOR: a pergunta que decide se cinco clientes entram.
    if (conteudo.length) medidas.push(conteudo[0]);

    // Uma segunda ADMINISTRATOR, para separar "é assim na API" de "é assim
    // nesta organização". Sem ela, um resultado estranho fica sem contraprova.
    const segunda = admins.find((x) => !medidas.some((m) => m.id === x.id));
    if (segunda) medidas.push(segunda);

    // Qualquer outro cargo que exista — LEAD_GEN_FORMS_MANAGER e afins. Medir um
    // é o que transforma "não sabemos" em resposta.
    if (outros.length) medidas.push(outros[0]);
  }

  if (!medidas.length) {
    anotar("cargo", "(todas)", "inconclusivo", "nenhuma página elegível para medição");
    return montar({ medicoes, versao: v.versao, scopes, organizacoes, medidas: [], agora });
  }

  // ── 3. MEDIÇÃO POR PÁGINA ─────────────────────────────────────────────────
  //
  // TODAS as páginas escolhidas passam pela MESMA bateria. É a repetição que
  // permite separar "a API não dá" de "esta organização não tem" — e é ela que
  // responde a pergunta de cargo.
  /** Retroatividade de CONTEÚDO: o post mais antigo que ainda deu métrica. */
  let retroConteudo: number | null = null;

  for (const org of medidas) {
    const urn = org.urn;
    const papel = org.papel;

    // — detalhes da organização, ANTES de qualquer rótulo —
    //
    // Aqui morava um defeito silencioso: o rótulo era `org.nome ?? org.id`
    // calculado ANTES desta chamada, e a chamada preenchia `org.nome`. As
    // medições ficavam gravadas sob o id enquanto tudo que as procurava depois
    // usava o nome. Nada casava — e a consequência foi a seção 4 sair com "?"
    // em todas as capacidades do ADMINISTRATOR, e o histórico anunciar que
    // "nenhuma página respondeu" logo acima de cinco janelas com 200.
    const rDetalhes = await cliente.medir<Record<string, unknown>>(
      `/rest/organizations/${org.id}`, { token: o.token, versao });
    org.nome ??= rDetalhes.dados?.localizedName
      ? String(rDetalhes.dados.localizedName) : null;

    // A partir daqui o rótulo é FIXO. Nada mais o altera.
    const rot = org.nome ?? org.id;
    const porPagina = (x: Parameters<typeof reg>[0]) => reg({ ...x, pagina: rot, papel });

    porPagina({ grupo: "descoberta", item: "detalhes da organização",
      endpoint: "/rest/organizations", r: rDetalhes, campos: campoDe(rDetalhes.dados) });

    // O estado da atribuição, do lado do resultado dela. A ACL revelou
    // atribuições REVOKED na carteira; ver o estado junto do 403 é o que
    // transforma correlação em resposta.
    anotar("cargo", `estado da atribuição · ${rot}`,
      org.aprovado ? "funciona" : "sem_permissao",
      org.papeis.map((pp, i) => `${pp}=${org.estados[i] ?? "?"}`).join(" · ")
      + (org.aprovado ? "" : " — REVOGADA: a SELVA não está mais nesta Página. "
        + "Todo 403 abaixo é sobre a carteira, NÃO sobre a API")
      + (org.decoracaoFalhou
        ? " · a ACL nem devolveu o nome da Página (`organizationalTarget!`), "
          + "que é sinal de acesso perdido antes de qualquer chamada"
        : "")
      + (org.papeis.length > 1
        ? " — esta Página acumula VÁRIOS cargos, então nenhum resultado dela "
          + "isola um cargo sozinho"
        : ""));

    // — seguidores atuais: TRÊS formas, porque a primeira rodada errou a forma —
    //
    // O 400 `Invalid param` veio com `r_organization_followers` concedido e com
    // o endpoint de estatísticas (mesmo escopo) funcionando. Permissão daria
    // 403. Então o problema era a forma — e a sondagem agora mede as variantes
    // em vez de escolher uma e reportar o fracasso dela como limitação.
    for (const [item, caminho, params] of [
      // O versionado respondeu `Invalid param` COM `edgeType`, e
      // `Parameter 'edgeType' is required` SEM ele. Os dois juntos dizem que o
      // parâmetro é obrigatório e que o VALOR é que não serve — a API
      // versionada usa enums em maiúscula. Medir os dois valores fecha isso.
      ["seguidores atuais · /rest + CompanyFollowedByMember",
        `/rest/networkSizes/${encodeURIComponent(urn)}`, { edgeType: "CompanyFollowedByMember" }],
      ["seguidores atuais · /rest + COMPANY_FOLLOWED_BY_MEMBER",
        `/rest/networkSizes/${encodeURIComponent(urn)}`,
        { edgeType: "COMPANY_FOLLOWED_BY_MEMBER" }],
      ["seguidores atuais · /v2 + edgeType",
        `/v2/networkSizes/${encodeURIComponent(urn)}`, { edgeType: "CompanyFollowedByMember" }],
      ["seguidores atuais · /rest sem edgeType",
        `/rest/networkSizes/${encodeURIComponent(urn)}`, {}],
    ] as const) {
      const ehV2 = caminho.startsWith("/v2");
      const r = await cliente.medir<{ firstDegreeSize?: number }>(caminho, {
        token: o.token, versao: ehV2 ? undefined : versao,
        params: params as Record<string, string>,
      });
      porPagina({
        grupo: "crescimento", item, endpoint: caminho.split("/").slice(0, 3).join("/"), r,
        valores: typeof r.dados?.firstDegreeSize === "number"
          ? [`firstDegreeSize=${r.dados.firstDegreeSize}`] : [],
        campos: campoDe(r.dados),
        vazio: r.ok && typeof r.dados?.firstDegreeSize !== "number",
      });
    }

    // — estatísticas de seguidores, vitalício e por janela —
    const seguidoresEm = async (item: string, cru?: string, periodo?: string) => {
      const r = await cliente.medir<{ elements?: Array<Record<string, unknown>> }>(
        "/rest/organizationalEntityFollowerStatistics", {
          token: o.token, versao,
          params: { q: "organizationalEntity", organizationalEntity: urn },
          cru: cru ? { timeIntervals: cru } : undefined,
        });
      const els = r.dados?.elements ?? [];
      porPagina({
        grupo: "crescimento", item,
        endpoint: "/rest/organizationalEntityFollowerStatistics", r,
        vazio: r.ok && els.length === 0,
        quantidade: els.length,
        campos: els.length ? campoDe(els[0]) : [],
        valores: els.length
          ? [...numerosDe(els[0].followerGains), ...segmentacoesDe(els[0]).map((s) => `seg:${s}`)]
          : [],
        periodo: periodo ?? "vitalício",
        granularidade: cru ? "DAY" : "lifetime",
      });
      return els.length;
    };

    await seguidoresEm("seguidores · vitalício");
    await seguidoresEm("seguidores · últimos 7 dias fechados",
      janelaRestli(agora, 8, 1), "7 dias fechados");

    // — página: visualizações —
    const paginaEm = async (item: string, cru?: string, periodo?: string) => {
      const r = await cliente.medir<{ elements?: Array<Record<string, unknown>> }>(
        "/rest/organizationPageStatistics", {
          token: o.token, versao,
          params: { q: "organization", organization: urn },
          cru: cru ? { timeIntervals: cru } : undefined,
        });
      const els = r.dados?.elements ?? [];
      const nums = els.length ? numerosDe(els[0].totalPageStatistics ?? els[0]) : [];
      porPagina({
        grupo: "pagina", item, endpoint: "/rest/organizationPageStatistics", r,
        vazio: r.ok && (els.length === 0 || nums.every((n) => n.endsWith("=0"))),
        quantidade: els.length,
        campos: els.length ? campoDe(els[0]) : [],
        valores: nums,
        periodo: periodo ?? "vitalício",
        granularidade: cru ? "DAY" : "lifetime",
      });
    };

    await paginaEm("visualizações · vitalício");
    await paginaEm("visualizações · últimos 7 dias fechados",
      janelaRestli(agora, 8, 1), "7 dias fechados");

    // — publicações: DESCOBRIR primeiro, medir depois —
    //
    // "Sem posts" NUNCA é falha da API. A distinção entre `sem_atividade` e
    // `sem_permissao` é a razão de esta rodada existir.
    const rPosts = await cliente.medir<{ elements?: Array<Record<string, unknown>> }>(
      "/rest/posts", {
        token: o.token, versao,
        params: { q: "author", author: urn, count: "20", sortBy: "LAST_MODIFIED" },
      });
    const posts = [...(rPosts.dados?.elements ?? [])];

    // — quantas páginas de publicação a API entrega —
    //
    // A rodada 2 parou na primeira página e reportou "mais antigo=2025-06-04"
    // como se fosse o fundo do poço; era só o fim de vinte itens. Sem descer,
    // não dá para dizer se existe conteúdo antigo recuperável — e é ele que
    // decide se o Spaces preenche o passado ou só acumula daqui pra frente.
    let paginasDePost = 1;
    for (let inicio = posts.length; paginasDePost < TETO_DE_PAGINAS_DE_POST; inicio = posts.length) {
      if (!posts.length) break;
      const rMais = await cliente.medir<{ elements?: Array<Record<string, unknown>> }>(
        "/rest/posts", {
          token: o.token, versao,
          params: { q: "author", author: urn, count: "20", start: String(inicio),
                    sortBy: "LAST_MODIFIED" },
        });
      const mais = rMais.dados?.elements ?? [];
      if (!rMais.ok || !mais.length) {
        porPagina({
          grupo: "publicacoes", item: "profundidade da listagem de posts",
          endpoint: "/rest/posts", r: rMais, vazio: rMais.ok && !mais.length,
          quantidade: posts.length,
          valores: [`${posts.length} post(s) em ${paginasDePost} página(s)`],
          nota: rMais.ok
            ? "a listagem ACABOU aqui — este é o total que a API entrega para esta Página"
            : undefined,
        });
        break;
      }
      posts.push(...mais);
      paginasDePost++;
      if (paginasDePost >= TETO_DE_PAGINAS_DE_POST) {
        porPagina({
          grupo: "publicacoes", item: "profundidade da listagem de posts",
          endpoint: "/rest/posts", r: rMais, quantidade: posts.length,
          valores: [`${posts.length} post(s) em ${paginasDePost} página(s)`],
          nota: `teto da sondagem (${TETO_DE_PAGINAS_DE_POST} páginas) — AINDA HÁ MAIS, `
            + "a listagem não terminou por limite da API",
        });
      }
    }

    const datas = posts
      .map((e) => (typeof e.createdAt === "number" ? e.createdAt : null))
      .filter((x): x is number => x !== null)
      .sort((a, b) => a - b);
    porPagina({
      grupo: "publicacoes", item: "listar posts (q=author)", endpoint: "/rest/posts", r: rPosts,
      vazio: rPosts.ok && posts.length === 0,
      quantidade: posts.length,
      campos: posts.length ? campoDe(posts[0]) : [],
      valores: datas.length
        ? [`mais antigo=${new Date(datas[0]).toISOString().slice(0, 10)}`,
           `mais recente=${new Date(datas[datas.length - 1]).toISOString().slice(0, 10)}`]
        : [],
      nota: rPosts.ok && posts.length === 0
        ? "a API respondeu 200 — esta página não publicou, e isso não é limitação"
        : undefined,
    });

    // — estatísticas agregadas da página (todas as publicações somadas) —
    {
      const r = await cliente.medir<{ elements?: Array<Record<string, unknown>> }>(
        "/rest/organizationalEntityShareStatistics", {
          token: o.token, versao,
          params: { q: "organizationalEntity", organizationalEntity: urn },
        });
      const els = r.dados?.elements ?? [];
      const nums = els.length ? numerosDe(els[0].totalShareStatistics ?? els[0]) : [];
      porPagina({
        grupo: "publicacoes", item: "estatísticas agregadas de publicações",
        endpoint: "/rest/organizationalEntityShareStatistics", r,
        vazio: r.ok && (els.length === 0 || nums.every((n) => n.endsWith("=0"))),
        quantidade: els.length, campos: els.length ? campoDe(els[0]) : [], valores: nums,
        periodo: "vitalício",
      });
    }

    // — métricas POR post: só faz sentido com post; sem post é inconclusivo —
    if (!posts.length) {
      for (const item of [
        "métricas por post (impressões, cliques, reações)",
        "reações e comentários do post",
        "metadados sociais do post",
      ]) {
        medicoes.push({
          grupo: "publicacoes", item, pagina: rot, papel, desfecho: "inconclusivo",
          endpoint: "—", metodo: "GET", status: null, codigo: null,
          escopoNecessario: null, escopoConcedido: null, campos: [], valores: [],
          periodo: null, granularidade: null, quantidade: null, paginado: null, limites: {},
          erro: null,
          nota: "esta página não tem publicação — não dá para concluir nada sobre a API a partir daqui",
        });
      }
    } else {
      const ordenados = posts
        .map((e) => ({
          urn: String(e.id ?? ""),
          em: typeof e.createdAt === "number" ? e.createdAt : null,
        }))
        .filter((x) => x.urn)
        .sort((a, b) => (b.em ?? 0) - (a.em ?? 0));
      const maisNovo = ordenados[0];
      const maisAntigo = ordenados[ordenados.length - 1];
      const urnDoPost = maisNovo.urn;
      // O parâmetro muda com o tipo de URN, e errar isso devolveria 400 — que
      // pareceria "não dá para medir post individual" quando dá.
      const chave = urnDoPost.includes(":ugcPost:") ? "ugcPosts" : "shares";

      /** Mede um LOTE de posts numa chamada. Um post é o lote de tamanho um. */
      const metricasDe = async (alvos: string[], item: string, nota: string) => {
        const r = await cliente.medir<{ elements?: Array<Record<string, unknown>> }>(
          "/rest/organizationalEntityShareStatistics", {
            token: o.token, versao,
            params: { q: "organizationalEntity", organizationalEntity: urn },
            cru: { [chave]: `List(${alvos.map(encodeURIComponent).join(",")})` },
          });
        const els = r.dados?.elements ?? [];
        const nums = els.length ? numerosDe(els[0].totalShareStatistics ?? els[0]) : [];
        porPagina({
          grupo: "publicacoes", item,
          endpoint: "/rest/organizationalEntityShareStatistics", r,
          vazio: r.ok && els.length === 0,
          quantidade: els.length, campos: els.length ? campoDe(els[0]) : [], valores: nums,
          nota,
        });
        return { ok: r.ok && els.length > 0, devolvidos: els.length };
      };

      await metricasDe([urnDoPost], "métricas por post (impressões, cliques, reações)",
        `via \`${chave}\` · post mais RECENTE, de ${posts.length} listado(s)`);

      // — a pergunta que a rodada 2 não fez —
      //
      // Se o post mais antigo ainda devolve métricas, a retroatividade de
      // CONTEÚDO está resolvida, independente do que a janela de estatísticas
      // de seguidores aceite. São duas retroatividades diferentes, e tratá-las
      // como uma foi o que deixou a arquitetura sem resposta.
      if (maisAntigo.urn !== urnDoPost) {
        const dias = maisAntigo.em
          ? Math.round((agora.getTime() - maisAntigo.em) / 86_400_000) : null;
        const res = await metricasDe([maisAntigo.urn],
          "métricas do post MAIS ANTIGO (retroatividade de conteúdo)",
          `publicado ${maisAntigo.em ? new Date(maisAntigo.em).toISOString().slice(0, 10) : "?"}`
          + (dias !== null ? ` · ${dias} dias atrás` : ""));
        if (res.ok && dias !== null && dias > (retroConteudo ?? -1)) retroConteudo = dias;
      }

      // — o custo de coletar —
      //
      // Se o lote responde, um cliente com 300 posts custa 60 chamadas e não
      // 300. É a diferença entre caber na cota diária e não caber.
      if (ordenados.length >= 2) {
        // Só posts do MESMO tipo de URN. A chave (`ugcPosts` ou `shares`) é
        // escolhida pelo post mais recente, e uma Página antiga mistura
        // `share:` com `ugcPost:` — o lote misto voltou 400 dizendo que um
        // ugcPost era inválido como `shares`, o que parecia "o lote não
        // funciona" quando o lote funciona.
        const mesmoTipo = (u: string) =>
          (u.includes(":ugcPost:") ? "ugcPosts" : "shares") === chave;
        const lote = ordenados.filter((x) => mesmoTipo(x.urn))
          .slice(0, TAMANHO_DO_LOTE).map((x) => x.urn);
        if (lote.length < 2) {
          anotar("publicacoes", `lote em ${rot}`, "inconclusivo",
            `menos de dois posts do tipo \`${chave}\` — o acervo mistura URNs `
            + "e o lote não pôde ser medido nesta Página");
        } else {
          const res = await metricasDe(lote,
            `métricas de ${lote.length} posts numa chamada (lote)`,
            `pedidos ${lote.length} · todos do tipo \`${chave}\` · decide se a coleta `
            + "é 1 chamada por post ou por lote");
          if (res.ok && res.devolvidos < lote.length) {
            anotar("publicacoes", `lote em ${rot}`, "inconclusivo",
              `pedimos ${lote.length} e voltaram ${res.devolvidos} — o lote é aceito, `
              + "mas nem todo post do lote tem estatística");
          }
        }
      }

      {
        const r = await cliente.medir<Record<string, unknown>>(
          `/rest/socialActions/${encodeURIComponent(urnDoPost)}`, { token: o.token, versao });
        const likes = (r.dados?.likesSummary as { totalLikes?: unknown } | undefined)?.totalLikes;
        const com = (r.dados?.commentsSummary as { totalFirstLevelComments?: unknown } | undefined)
          ?.totalFirstLevelComments;
        porPagina({
          grupo: "publicacoes", item: "reações e comentários do post",
          endpoint: "/rest/socialActions", r,
          vazio: r.ok && likes === undefined && com === undefined,
          campos: campoDe(r.dados),
          valores: [`likes=${likes ?? "—"}`, `comentários=${com ?? "—"}`],
        });
      }

      {
        // `socialMetadata` é a forma nova de reações por TIPO. Se responder,
        // dá para distinguir LIKE de PRAISE, EMPATHY etc.
        const r = await cliente.medir<Record<string, unknown>>(
          `/rest/socialMetadata/${encodeURIComponent(urnDoPost)}`, { token: o.token, versao });
        porPagina({
          grupo: "publicacoes", item: "metadados sociais do post",
          endpoint: "/rest/socialMetadata", r,
          campos: campoDe(r.dados),
          valores: numerosDe(r.dados?.reactionSummaries ?? r.dados),
        });
      }
    }
  }

  // ── 4. PROFUNDIDADE DO HISTÓRICO ──────────────────────────────────────────
  //
  // A primeira rodada provou que 30-60 dias respondem. Isso decidiu a
  // arquitetura, mas não disse o LIMITE — e o limite é o que define se dá para
  // preencher um ano de uma vez ou só dois meses.
  //
  // Só uma página: repetir cinco janelas em quatro gastaria vinte chamadas para
  // responder uma pergunta que é da API, e não da organização.
  //
  // Mas ela precisa ser uma que RESPONDA. A rodada 2 usou `medidas[0]` — que
  // calhou de ser a única cujas estatísticas voltavam 403 — e as cinco janelas
  // devolveram cinco vezes o mesmo bloqueio. A pergunta que decide a
  // arquitetura foi feita à única página incapaz de respondê-la.
  //
  // Aqui a escolha é pela evidência já colhida: a página cujas estatísticas de
  // seguidores dos últimos 7 dias voltaram COM dado.
  const respondeu = (org: OrganizacaoDescoberta) => medicoes.some(
    (m) => m.pagina === (org.nome ?? org.id)
      && m.item === "seguidores · últimos 7 dias fechados" && m.desfecho === "funciona");
  const alvoHistorico = medidas.find(respondeu) ?? medidas[0];
  const escolhaDoHistorico = medidas.find(respondeu)
    ? `${alvoHistorico.nome ?? alvoHistorico.id} — estatísticas responderam com dado`
    : `${alvoHistorico.nome ?? alvoHistorico.id} — NENHUMA página medida respondeu com `
      + "estatísticas; o resultado abaixo mede o bloqueio, não o histórico";
  anotar("historico", "escolha da página do histórico",
    medidas.find(respondeu) ? "funciona" : "inconclusivo", escolhaDoHistorico);
  let maisProfundo: number | null = null;
  let limite: number | null = null;

  for (const h of HORIZONTES) {
    const r = await cliente.medir<{ elements?: Array<Record<string, unknown>> }>(
      "/rest/organizationalEntityFollowerStatistics", {
        token: o.token, versao,
        params: { q: "organizationalEntity", organizationalEntity: alvoHistorico.urn },
        cru: { timeIntervals: janelaRestli(agora, h.de, h.ate) },
      });
    const els = r.dados?.elements ?? [];
    const vazio = r.ok && els.length === 0;
    reg({
      grupo: "historico", item: `seguidores · ${h.rotulo}`,
      endpoint: "/rest/organizationalEntityFollowerStatistics", r,
      pagina: alvoHistorico.nome ?? alvoHistorico.id, papel: alvoHistorico.papel,
      vazio, quantidade: els.length, periodo: h.rotulo, granularidade: "DAY",
      valores: els.length ? numerosDe(els[0].followerGains) : [],
      nota: vazio
        ? "200 com lista vazia — a API aceitou a janela e não tem dado nela"
        : undefined,
    });

    // Trinta dias pedidos, trinta baldes devolvidos: a janela foi honrada.
    // Trinta pedidos e UM devolvido é outra coisa — pode ser o teto da série
    // sendo colapsado, e chamar isso de "funciona até aqui" seria afirmar
    // profundidade que não foi medida.
    const esperados = h.de - h.ate;
    const completa = els.length >= esperados;
    if (r.ok && els.length > 0 && completa) maisProfundo = h.de;
    else if (r.ok && els.length > 0) {
      anotar("historico", `granularidade em ${h.rotulo}`, "inconclusivo",
        `pedimos ${esperados} dias em granularidade DAY e voltaram ${els.length} balde(s) — `
        + "a janela foi aceita mas a série não veio dia a dia; não dá para contar "
        + "esta profundidade como utilizável");
    }
    else if (limite === null) {
      // O primeiro horizonte que NÃO devolve. Registrado uma vez; os mais
      // fundos continuam sendo medidos porque um vazio isolado pode ser
      // ausência de atividade, e não teto da API.
      limite = h.de;
    }
  }

  // A mesma pergunta para visualizações de página: as duas fontes podem ter
  // horizontes diferentes, e assumir que são iguais seria suposição.
  {
    const maisFundo = HORIZONTES[HORIZONTES.length - 1];
    const r = await cliente.medir<{ elements?: Array<Record<string, unknown>> }>(
      "/rest/organizationPageStatistics", {
        token: o.token, versao,
        params: { q: "organization", organization: alvoHistorico.urn },
        cru: { timeIntervals: janelaRestli(agora, maisFundo.de, maisFundo.ate) },
      });
    const els = r.dados?.elements ?? [];
    reg({
      grupo: "historico", item: `visualizações · ${maisFundo.rotulo}`,
      endpoint: "/rest/organizationPageStatistics", r,
      pagina: alvoHistorico.nome ?? alvoHistorico.id,
      vazio: r.ok && els.length === 0, quantidade: els.length,
      periodo: maisFundo.rotulo, granularidade: "DAY",
    });
  }

  return montar({ medicoes, versao: v.versao, scopes, organizacoes, medidas, agora,
    maisProfundo, limite, retroConteudo,
    historicoEm: alvoHistorico.nome ?? alvoHistorico.id });
}

// ─── Relatório ───────────────────────────────────────────────────────────────

const TITULO: Record<GrupoLinkedIn, string> = {
  acesso: "1. ACESSO E AUTENTICAÇÃO",
  descoberta: "2. DESCOBERTA DE CONTAS",
  cargo: "3. ACESSO POR CARGO",
  crescimento: "4a. SEGUIDORES",
  pagina: "4b. PÁGINA",
  publicacoes: "4c. PUBLICAÇÕES",
  historico: "5. PROFUNDIDADE DO HISTÓRICO",
};

/**
 * O veredito de cada cargo — a pergunta que decide quantos clientes entram.
 *
 * Sai de MEDIÇÃO: para cada capacidade, o desfecho observado na página daquele
 * cargo. Um cargo sem página medida não recebe veredito — fica de fora, e a
 * seção final o lista como pendente.
 */
function vereditoDeCargos(
  medicoes: Medicao[], organizacoes: OrganizacaoDescoberta[], medidas: OrganizacaoDescoberta[],
): VeredictoDeCargo[] {
  const CAPACIDADES: Array<[string, GrupoLinkedIn, string]> = [
    ["seguidores", "crescimento", "seguidores · vitalício"],
    ["crescimento diário", "crescimento", "seguidores · últimos 7 dias fechados"],
    ["visualizações da página", "pagina", "visualizações · vitalício"],
    ["listar publicações", "publicacoes", "listar posts (q=author)"],
    ["métricas agregadas", "publicacoes", "estatísticas agregadas de publicações"],
    ["métricas por post", "publicacoes", "métricas por post (impressões, cliques, reações)"],
  ];
  const temPapel = (x: OrganizacaoDescoberta, papel: string) =>
    papel === "SEM_PAPEL" ? x.papeis.length === 0 : x.papeis.includes(papel);
  const papeis = Array.from(new Set(
    organizacoes.flatMap((x) => (x.papeis.length ? x.papeis : ["SEM_PAPEL"]))));

  return papeis.map((papel) => {
    // TODAS as páginas medidas com esse cargo — não a primeira.
    // Página revogada fora: o 403 dela é sobre a carteira, e deixá-lo entrar
    // no consenso do cargo foi o que fez a rodada 4 declarar que ADMINISTRATOR
    // não lê seguidores — com base em duas Páginas de onde a SELVA saiu.
    const doPapel = medidas.filter((m) => temPapel(m, papel) && m.aprovado);
    const alcanca: Record<string, Desfecho> = {};
    const divergentes: Record<string, string> = {};

    for (const [rotulo, grupo, item] of CAPACIDADES) {
      const obtidos = doPapel
        .map((med) => ({
          pagina: med.nome ?? med.id,
          d: medicoes.find((x) => x.grupo === grupo && x.item === item
            && x.pagina === (med.nome ?? med.id))?.desfecho,
        }))
        .filter((x): x is { pagina: string; d: Desfecho } => x.d !== undefined);

      // Um vazio ou um inconclusivo é da PÁGINA, não do cargo: uma página sem
      // publicação não diz nada sobre o que o cargo alcança. Só os desfechos
      // que falam da API entram no consenso.
      const decisivos = obtidos.filter(
        (x) => x.d !== "inconclusivo" && x.d !== "sem_atividade");
      const distintos = Array.from(new Set(decisivos.map((x) => x.d)));

      if (distintos.length === 1) {
        alcanca[rotulo] = distintos[0];
      } else if (distintos.length > 1) {
        // Páginas do MESMO cargo discordando prova que a capacidade não é do
        // cargo. Afirmar qualquer um dos dois lados seria escolher um exemplo.
        alcanca[rotulo] = "inconclusivo";
        divergentes[rotulo] = decisivos
          .map((x) => `${x.pagina}: ${ROTULO_DESFECHO[x.d]}`).join(" · ");
      } else {
        alcanca[rotulo] = obtidos.length ? "sem_atividade" : "inconclusivo";
      }
    }

    return {
      papel,
      paginasComEssePapel: organizacoes.filter((x) => temPapel(x, papel)).length,
      medidas: doPapel.map((m) => m.nome ?? m.id),
      alcanca,
      divergentes,
      ambiguo: doPapel.length > 0 && doPapel.every((m) => m.papeis.length > 1),
    };
  });
}

function montar(x: {
  medicoes: Medicao[]; versao: string | null; scopes: string[];
  organizacoes: OrganizacaoDescoberta[]; medidas: OrganizacaoDescoberta[];
  agora: Date; maisProfundo?: number | null; limite?: number | null;
  retroConteudo?: number | null; historicoEm?: string | null;
}): SondagemLinkedIn {
  const cargos = vereditoDeCargos(x.medicoes, x.organizacoes, x.medidas);
  const s: SondagemLinkedIn = {
    ok: x.medicoes.some((m) => m.desfecho === "funciona"),
    versaoUsada: x.versao, scopes: x.scopes,
    organizacoes: x.organizacoes, medidas: x.medidas,
    medicoes: x.medicoes, cargos,
    historicoMaisProfundoDias: x.maisProfundo ?? null,
    historicoMedidoEm: x.historicoEm ?? null,
    retroatividadeDeConteudoDias: x.retroConteudo ?? null,
    historicoLimiteDias: x.limite ?? null,
    disponiveis: x.medicoes.filter((m) => m.desfecho === "funciona").length,
    indisponiveis: x.medicoes.filter((m) => m.desfecho !== "funciona").length,
    texto: "",
  };
  s.texto = texto(s, x.agora);
  return s;
}

const cont = (m: Medicao[], d: Desfecho) => m.filter((x) => x.desfecho === d).length;

/** Uma linha detalhada — o que o pedido exige registrar de cada endpoint. */
function linhaDetalhada(m: Medicao): string {
  const partes: string[] = [];
  if (m.status !== null) partes.push(`HTTP ${m.status}${m.codigo !== null ? `/${m.codigo}` : ""}`);
  if (m.endpoint !== "—") partes.push(m.endpoint);
  if (m.escopoNecessario) {
    partes.push(`escopo ${m.escopoNecessario}${
      m.escopoConcedido === null ? " (concessão indeterminada)"
        : m.escopoConcedido ? " ✓concedido" : " ✗NÃO concedido"}`);
  }
  if (m.periodo) partes.push(`período ${m.periodo}`);
  if (m.granularidade) partes.push(`granularidade ${m.granularidade}`);
  if (m.quantidade !== null) partes.push(`${m.quantidade} elemento(s)`);
  if (m.paginado !== null) partes.push(m.paginado ? "TEM próxima página" : "página única");
  const limites = Object.entries(m.limites).map(([k, v]) => `${k}=${v}`);
  if (limites.length) partes.push(limites.join(" "));

  const linhas = [`       ${partes.join(" · ")}`];
  if (m.campos.length) linhas.push(`       campos: ${m.campos.slice(0, 14).join(", ")}`);
  if (m.valores.length) linhas.push(`       valores: ${m.valores.slice(0, 14).join(", ")}`);
  if (m.erro) linhas.push(`       erro: ${m.erro}`);
  if (m.nota) linhas.push(`       nota: ${m.nota}`);
  return linhas.join("\n");
}

function texto(s: SondagemLinkedIn, agora: Date): string {
  const L: string[] = [];
  const total = s.medicoes.length;
  L.push(`sondagem LinkedIn · Fase 0 · rodada ${RODADA} · ${agora.toISOString().slice(0, 10)}`);
  L.push(`${cont(s.medicoes, "funciona")}/${total} medições com dado`);
  L.push(`versão da API: ${s.versaoUsada ?? "NENHUMA respondeu"}`);
  L.push(`escopos: ${s.scopes.length ? s.scopes.join(", ") : "não introspectados"}`);
  L.push(`Páginas alcançadas: ${s.organizacoes.length}`);
  L.push(`Páginas MEDIDAS: ${s.medidas.map((m) => `${m.nome ?? m.id} (${m.papel ?? "?"})`).join(" · ") || "nenhuma"}`);
  L.push("");

  for (const g of Object.keys(TITULO) as GrupoLinkedIn[]) {
    const doGrupo = s.medicoes.filter((m) => m.grupo === g);
    if (!doGrupo.length) continue;
    L.push(`── ${TITULO[g]} ──`);
    let paginaAtual: string | undefined;
    for (const m of doGrupo) {
      if (m.pagina && m.pagina !== paginaAtual) {
        paginaAtual = m.pagina;
        L.push(`  ▸ ${m.pagina}${m.papel ? ` · ${m.papel}` : ""}`);
      }
      L.push(`[${ROTULO_DESFECHO[m.desfecho]}] ${m.item}`);
      L.push(linhaDetalhada(m));
    }
    L.push("");
  }

  // ── RELATÓRIO CONSOLIDADO ───────────────────────────────────────────────
  L.push("══ RELATÓRIO CONSOLIDADO ══");
  L.push("");

  const ok = s.medicoes.filter((m) => m.desfecho === "funciona");
  L.push("1. ENDPOINTS QUE FUNCIONAM");
  const porEndpoint = new Map<string, Medicao[]>();
  for (const m of ok) {
    if (m.endpoint === "—") continue;
    porEndpoint.set(m.endpoint, [...(porEndpoint.get(m.endpoint) ?? []), m]);
  }
  if (!porEndpoint.size) L.push("   nenhum");
  for (const [ep, ms] of Array.from(porEndpoint)) {
    L.push(`   ${ep} — ${ms.length} medição(ões) · escopo ${ms[0].escopoNecessario ?? "?"}`);
  }
  L.push("");

  L.push("2. MÉTRICAS QUE CONSEGUIMOS OBTER");
  // Só o que é métrica. `papéis:`, `estados:` e `66 post(s) em 4 página(s)`
  // são observações da sondagem, e listá-las aqui faz a seção que responde
  // "o que dá para mostrar no Spaces" começar com três linhas que não dão.
  const metricas = Array.from(new Set(ok.flatMap((m) => m.valores)
    .filter((v) => v.includes("=") && !v.startsWith("seg:"))
    .map((v) => v.split("=")[0])
    .filter((v) => !v.includes(":") && !/\d/.test(v))));
  L.push(metricas.length ? metricas.map((m) => `   ${m}`).join("\n") : "   nenhuma");
  const segs = Array.from(new Set(ok.flatMap((m) => m.valores)
    .filter((v) => v.startsWith("seg:")).map((v) => v.slice(4))));
  if (segs.length) L.push(`   segmentações: ${segs.join(", ")}`);
  L.push("");

  L.push("3. HISTÓRICO DISPONÍVEL");
  L.push(s.historicoMaisProfundoDias !== null
    ? `   Mais fundo COM dado: ${s.historicoMaisProfundoDias} dias atrás.`
    : "   Nenhuma janela retroativa devolveu dado — INCONCLUSIVO se é limite da API "
      + "ou ausência de atividade na página medida.");
  if (s.historicoMedidoEm) L.push(`   Medido em: ${s.historicoMedidoEm}.`);
  if (s.historicoLimiteDias !== null) {
    L.push(`   Primeira janela SEM dado: ${s.historicoLimiteDias} dias atrás.`);
    L.push("   Atenção: vazio pode ser teto da API OU página sem atividade no período.");
  }
  // São DUAS retroatividades, e a rodada 2 tratou como uma. A de seguidores é
  // uma janela de série temporal; a de conteúdo é a idade do post mais antigo
  // que ainda devolve métrica. Uma pode servir sem a outra.
  L.push(s.retroatividadeDeConteudoDias !== null
    ? `   Conteúdo: o post mais antigo medido tem ${s.retroatividadeDeConteudoDias} dias `
      + "e AINDA devolve métricas — o passado de publicações é recuperável até aí."
    : "   Conteúdo: não medido — nenhuma página teve dois posts com métricas legíveis.");
  L.push("");

  L.push("4. DIFERENÇA DE ACESSO POR CARGO");
  for (const c of s.cargos) {
    L.push(`   ${c.papel} — ${c.paginasComEssePapel} página(s)`);
    if (!c.medidas.length) {
      L.push("      NÃO MEDIDO nesta rodada — sem veredito");
      continue;
    }
    L.push(`      medido em: ${c.medidas.join(", ")} (atribuição viva)`);
    if (c.ambiguo) {
      L.push("      ATRIBUIÇÃO AMBÍGUA — as Páginas medidas acumulam outros cargos, "
        + "então o que segue é o alcance DELAS, não deste cargo isoladamente.");
    }
    for (const [cap, d] of Object.entries(c.alcanca)) {
      L.push(`      ${ROTULO_DESFECHO[d]} ${cap}`
        + (c.divergentes[cap] ? `  ← DIVERGEM: ${c.divergentes[cap]}` : ""));
    }
    if (Object.keys(c.divergentes).length) {
      L.push("      As páginas deste MESMO cargo discordam — logo a capacidade "
        + "NÃO é dada pelo cargo.");
    }
  }
  L.push("");

  L.push("5. ESCOPOS NECESSÁRIOS");
  const necessarios = Array.from(new Set(
    s.medicoes.map((m) => m.escopoNecessario).filter((x): x is string => !!x)));
  for (const e of necessarios) {
    const usa = s.medicoes.filter((m) => m.escopoNecessario === e);
    const concedido = usa[0]?.escopoConcedido;
    L.push(`   ${e} — ${usa.length} endpoint(s) · ${
      concedido === null ? "concessão indeterminada"
        : concedido ? "concedido" : "NÃO concedido"}`);
  }
  L.push("");

  L.push("6. LIMITAÇÕES DA API");
  // Uma Página revogada devolve 403 em tudo. Listar isso como limitação da API
  // encheu a rodada 4 com 28 linhas de bloqueio que eram, todas, a mesma frase:
  // a SELVA não está mais nessas Páginas.
  const revogadas = new Set(s.medidas.filter((m) => !m.aprovado).map((m) => m.nome ?? m.id));
  const daCarteira = s.medicoes.filter(
    (m) => m.desfecho === "sem_permissao" && m.pagina && revogadas.has(m.pagina));
  const perm = s.medicoes.filter(
    (m) => m.desfecho === "sem_permissao" && !(m.pagina && revogadas.has(m.pagina)));
  const nd = s.medicoes.filter((m) => m.desfecho === "indisponivel");
  const req = s.medicoes.filter((m) => m.desfecho === "request_invalido");
  if (!perm.length && !nd.length && !req.length && !daCarteira.length) {
    L.push("   nenhuma observada");
  }
  if (daCarteira.length) {
    L.push(`   NÃO é limitação da API — ${daCarteira.length} bloqueio(s) em Página(s) `
      + `com atribuição REVOGADA (${Array.from(revogadas).join(", ")}).`);
    L.push("   O conserto é readmitir a SELVA na Página, e não mexer no app.");
  }
  for (const [rotulo, lista] of [
    ["bloqueio de permissão/cargo/produto", perm],
    ["endpoint indisponível nesta versão", nd],
    ["requisição inválida — é erro NOSSO, tem conserto aqui", req],
  ] as const) {
    if (!lista.length) continue;
    L.push(`   ${rotulo}:`);
    for (const m of lista) {
      L.push(`      ${m.item}${m.pagina ? ` · ${m.pagina}` : ""} — ${m.erro ?? "?"}`);
    }
  }
  L.push("");

  L.push("7. RATE LIMITS E PAGINAÇÃO");
  const comLimite = s.medicoes.filter((m) => Object.keys(m.limites).length);
  L.push(comLimite.length
    ? `   cabeçalhos observados: ${Array.from(new Set(comLimite.flatMap((m) =>
        Object.entries(m.limites).map(([k, v]) => `${k}=${v}`)))).slice(0, 8).join(" · ")}`
    : "   INCONCLUSIVO — o LinkedIn não enviou cabeçalho de limite em nenhuma resposta. "
      + "A cota existe (é diária, por app), mas não é observável por aqui.");
  const paginados = s.medicoes.filter((m) => m.paginado === true);
  L.push(paginados.length
    ? `   com próxima página: ${paginados.map((m) => m.item).join(", ")}`
    : "   nenhuma resposta indicou próxima página nas amostras pedidas");
  L.push(`   total de chamadas desta sondagem: ${s.medicoes.filter((m) => m.status !== null).length}`);
  L.push("");

  L.push("8. O QUE DÁ PARA TRAZER PARA O SOCIAL DO SPACES");
  const trazivel = Array.from(new Set(ok.filter((m) => m.grupo !== "acesso" && m.grupo !== "descoberta")
    .map((m) => m.item)));
  L.push(trazivel.length ? trazivel.map((x) => `   ${x}`).join("\n") : "   nada confirmado");
  L.push("");

  L.push("9. O QUE NÃO DÁ");
  const naoDa = s.medicoes.filter(
    (m) => m.desfecho === "sem_permissao" || m.desfecho === "indisponivel");
  L.push(naoDa.length
    ? Array.from(new Set(naoDa.map((m) => `   ${m.item} — ${CORRECAO[m.desfecho]}`))).join("\n")
    : "   nada foi bloqueado por permissão ou indisponibilidade");
  L.push("");

  L.push("10. RECOMENDAÇÃO DE ARQUITETURA DE COLETA");
  if (s.medidas.length && s.medidas.every((m) => !m.aprovado)) {
    L.push("   INCONCLUSIVO POR CARTEIRA, não por API — todas as Páginas medidas");
    L.push("   têm atribuição REVOGADA. Readmitir a SELVA em uma delas e rodar");
    L.push("   de novo é o que fecha esta seção.");
  } else if (s.historicoMaisProfundoDias !== null) {
    L.push(`   O histórico é BUSCÁVEL até ${s.historicoMaisProfundoDias} dias atrás.`);
    L.push("   Preencher o passado de uma vez na conexão, e usar cron só como");
    L.push("   conveniência de atualização. É o oposto do Instagram, onde o");
    L.push("   snapshot diário é o ÚNICO registro do dia e um dia perdido some.");
    L.push("   Consequência: nenhum dia se perde por falha de coleta, e recoletar");
    L.push("   é sempre possível — o que dispensa a disciplina de snapshot.");
  } else {
    L.push("   INCONCLUSIVO — sem confirmação de retroatividade, não dá para");
    L.push("   escolher entre buscar o passado e depender de snapshot diário.");
  }
  L.push("");

  // ── O QUE AINDA PRECISAMOS DESCOBRIR ────────────────────────────────────
  //
  // Só o que continuou inconclusivo DEPOIS desta rodada. Um item que a rodada
  // resolveu não entra aqui — a seção existe para ser curta, e uma lista longa
  // de coisas já respondidas faria ninguém ler as que importam.
  L.push("══ O QUE AINDA PRECISAMOS DESCOBRIR ══");
  const pendentes: string[] = [];

  for (const m of s.medicoes.filter((x) => x.desfecho === "inconclusivo")) {
    pendentes.push(`${m.item}${m.pagina ? ` · ${m.pagina}` : ""} — ${m.nota ?? "sem observação"}`);
  }
  for (const c of s.cargos.filter((x) => !x.medidas.length)) {
    pendentes.push(`cargo ${c.papel} (${c.paginasComEssePapel} página(s)) — nenhuma foi medida, `
      + "o alcance dele continua desconhecido");
  }
  if (!s.scopes.length) {
    pendentes.push("escopos concedidos — sem client_id/secret a introspecção não roda, e um 403 "
      + "não se separa de falta de cargo");
  }
  if (s.historicoLimiteDias !== null && s.historicoMaisProfundoDias !== null) {
    pendentes.push(`o teto real do histórico — a janela de ${s.historicoLimiteDias} dias veio vazia, `
      + "e vazio pode ser teto da API OU página sem atividade no período. "
      + "Repetir numa página antiga e ativa separaria os dois.");
  }

  L.push(pendentes.length
    ? pendentes.map((p) => `   · ${p}`).join("\n")
    : "   nada — todas as perguntas desta rodada foram respondidas por medição");
  L.push("");
  L.push("Nenhum token e nenhum conteúdo de publicação aparece acima.");
  return L.join("\n");
}
