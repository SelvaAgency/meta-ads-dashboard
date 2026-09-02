/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Por que este dado não está aqui? — cinco respostas, e nenhuma é "vazio"
 * ─────────────────────────────────────────────────────────────────────────────
 *  Uma célula em branco pode significar cinco coisas completamente diferentes, e
 *  cada uma pede uma ação diferente de quem lê:
 *
 *    com_dado      coletamos e veio                        — nada a fazer
 *    sem_dado      coletamos e a Página não tem            — é da carteira
 *    recusado      a API respondeu 403/erro                — é do acesso
 *    nao_coletado  nenhuma sincronização tocou nisso       — rodar uma
 *    so_na_carga   a API entrega, mas só a Carga busca     — rodar a Carga
 *
 *  O último é o que faltava, e é o mais frequente hoje: quem rodou só
 *  "Sincronizar agora" não tem segmentações, visualizações vitalícias, agregado
 *  nem detalhes da organização — não porque a API recusou, e sim porque o modo
 *  incremental não pede essas coisas. Sem essa distinção, a tela diz "sem dado"
 *  e a pessoa procura o problema no lugar errado.
 *
 *  Núcleo puro: sem rede, sem banco, sem relógio.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import type { CapacidadeLinkedIn, LeituraDaCapacidade } from "./linkedinLab";

export type EstadoDaMedida =
  | "com_dado" | "sem_dado" | "recusado" | "nao_coletado" | "so_na_carga";

export const ROTULO_MEDIDA: Record<EstadoDaMedida, string> = {
  com_dado: "Coletado com dado",
  sem_dado: "Coletado, sem dado",
  recusado: "A API recusou",
  nao_coletado: "Ainda não coletado",
  so_na_carga: "Só a Carga histórica busca",
};

/** O que fazer a respeito. `null` quando não há nada a fazer. */
export const ACAO_DA_MEDIDA: Record<EstadoDaMedida, string | null> = {
  com_dado: null,
  sem_dado: "A API respondeu; esta Página não tem esse dado. Nada a corrigir aqui.",
  recusado: "É acesso, não coleta — verifique o cargo da SELVA nesta Página.",
  nao_coletado: "Rode uma sincronização para buscar.",
  so_na_carga: "Rode a Carga histórica — o incremental não pede este dado.",
};

/** Em qual sincronização cada conjunto é buscado. */
export type ModoQueBusca = "incremental" | "carga";

export interface GrupoDeDado {
  id: string;
  rotulo: string;
  /** Onde ele mora, para o painel de estado do banco poder apontar. */
  tabela: string;
  modo: ModoQueBusca;
  /** A capacidade que responde por ele, quando existe uma. */
  capacidade: CapacidadeLinkedIn | null;
  /** O que a Fase 0 provou que vem aqui — vira a legenda do painel vazio. */
  oQueTem: string;
}

/**
 * Os onze conjuntos que o laboratório sabe pedir.
 *
 * `modo` é a informação que a tela não tinha: quatro deles só existem depois de
 * uma Carga histórica, e é isso que explica uma Página recém-sincronizada
 * parecer vazia.
 */
export const GRUPOS_DE_DADO: GrupoDeDado[] = [
  {
    id: "identificacao", rotulo: "Identificação da Página",
    tabela: "linkedin_pages", modo: "incremental", capacidade: null,
    oQueTem: "nome, vanity, URN, id, cargos e o state de cada atribuição",
  },
  {
    id: "organizacao", rotulo: "Detalhes da organização",
    tabela: "linkedin_page_lifetime.organizacaoJson", modo: "carga", capacidade: "pagina",
    oQueTem: "site, descrição, fundação, especialidades, porte, tipo, logo e capa",
  },
  {
    id: "seguidores_total", rotulo: "Seguidores (total)",
    tabela: "linkedin_page_daily.seguidoresTotal", modo: "incremental", capacidade: "seguidores_atuais",
    oQueTem: "firstDegreeSize do dia da coleta",
  },
  {
    id: "seguidores_serie", rotulo: "Crescimento diário",
    tabela: "linkedin_page_daily.ganhoOrganico/ganhoPago", modo: "incremental", capacidade: "seguidores_serie",
    oQueTem: "ganho orgânico e pago, um valor por dia",
  },
  {
    id: "segmentacoes", rotulo: "Segmentações de seguidores",
    tabela: "linkedin_page_lifetime.segmentacoesJson", modo: "carga", capacidade: "seguidores_segmentacoes",
    oQueTem: "setor, senioridade, função, porte, país, região e tipo de associação",
  },
  {
    id: "views_serie", rotulo: "Visualizações por dia",
    tabela: "linkedin_page_daily.viewsJson", modo: "incremental", capacidade: "pagina_serie",
    oQueTem: "os ~30 recortes de pageViews e uniquePageViews, por dia",
  },
  {
    id: "views_lifetime", rotulo: "Visualizações vitalícias",
    tabela: "linkedin_page_lifetime.totalPageStatisticsJson", modo: "carga", capacidade: "pagina_lifetime",
    oQueTem: "os mesmos recortes desde sempre, mais os cortes por setor, senioridade, geografia, função e porte",
  },
  {
    id: "agregado", rotulo: "Agregado de publicações",
    tabela: "linkedin_page_lifetime.agregadoDePostsJson", modo: "carga", capacidade: "agregado_de_posts",
    oQueTem: "impressões, únicas, cliques, curtidas, comentários, compartilhamentos e engajamento da Página inteira",
  },
  {
    id: "publicacoes", rotulo: "Publicações",
    tabela: "linkedin_posts", modo: "incremental", capacidade: "publicacoes",
    oQueTem: "texto, data, tipo de URN, visibilidade, content cru e permalink",
  },
  {
    id: "metricas_post", rotulo: "Métricas por publicação",
    tabela: "linkedin_post_metrics", modo: "incremental", capacidade: "metricas_por_post",
    oQueTem: "impressões, únicas, cliques, curtidas, comentários, compartilhamentos e engajamento por post",
  },
  {
    id: "reacoes", rotulo: "Reações por tipo",
    tabela: "linkedin_post_metrics.reacoesPorTipoJson", modo: "incremental", capacidade: "reacoes_por_tipo",
    oQueTem: "LIKE, PRAISE, EMPATHY, INTEREST — e o que mais o LinkedIn devolver",
  },
];

export interface EvidenciaDoGrupo {
  /** Existe linha guardando esse conjunto? */
  temLinha: boolean;
  /** A linha existe E tem valor? Uma linha com tudo null é `sem_dado`. */
  temValor: boolean;
  /** O que a última coleta registrou sobre a capacidade correspondente. */
  capacidade?: LeituraDaCapacidade | null;
  /** Alguma Carga histórica já rodou nesta Página? */
  jaFezCarga: boolean;
}

export interface VereditoDoGrupo {
  grupo: GrupoDeDado;
  estado: EstadoDaMedida;
  acao: string | null;
}

/**
 * A pergunta é sempre a mesma: por que não está aqui?
 *
 * A ordem importa. Recusa vem antes de ausência: uma Página bloqueada não tem
 * dado E foi recusada, e dizer "sem dado" mandaria a pessoa procurar no lugar
 * errado. E "só na carga" vem antes de "não coletado" porque é acionável — diz
 * qual botão apertar, em vez de mandar tentar de novo o que não busca.
 */
export function vereditoDoGrupo(g: GrupoDeDado, e: EvidenciaDoGrupo): VereditoDoGrupo {
  const cap = e.capacidade;

  if (cap && (cap.estado === "sem_permissao" || cap.estado === "erro"
      || cap.estado === "nao_disponivel")) {
    return { grupo: g, estado: "recusado", acao: ACAO_DA_MEDIDA.recusado };
  }
  if (e.temValor) return { grupo: g, estado: "com_dado", acao: null };
  if (e.temLinha) return { grupo: g, estado: "sem_dado", acao: ACAO_DA_MEDIDA.sem_dado };

  // Sem linha e sem recusa: ou a chamada não é feita neste modo, ou nunca
  // rodou. A primeira hipótese é a que resolve, e por isso vem antes.
  if (g.modo === "carga" && !e.jaFezCarga) {
    return { grupo: g, estado: "so_na_carga", acao: ACAO_DA_MEDIDA.so_na_carga };
  }
  if (cap && cap.estado === "sem_dados") {
    return { grupo: g, estado: "sem_dado", acao: ACAO_DA_MEDIDA.sem_dado };
  }
  return { grupo: g, estado: "nao_coletado", acao: ACAO_DA_MEDIDA.nao_coletado };
}

/** O que falta para esta Página virar laboratório completo. */
export function oQueFalta(vereditos: VereditoDoGrupo[]): {
  soNaCarga: VereditoDoGrupo[]; recusados: VereditoDoGrupo[]; naoColetados: VereditoDoGrupo[];
} {
  return {
    soNaCarga: vereditos.filter((v) => v.estado === "so_na_carga"),
    recusados: vereditos.filter((v) => v.estado === "recusado"),
    naoColetados: vereditos.filter((v) => v.estado === "nao_coletado"),
  };
}

/**
 * ─── Segmentações e recortes ────────────────────────────────────────────────
 *  A API devolve arrays como
 *    [{ seniority: "urn:li:seniority:9", followerCounts: { organicFollowerCount: 12,
 *                                                          paidFollowerCount: 0 } }]
 *  e o laboratório precisa disso como TABELA, não como `<pre>`.
 */
export interface LinhaDeSegmento {
  chave: string;
  rotulo: string;
  organico: number | null;
  pago: number | null;
  total: number | null;
}

/** O nome legível de um URN de faceta — o número final, quando é só isso que há. */
export function rotuloDoUrn(urn: string): string {
  if (!urn.startsWith("urn:li:")) return urn;
  const partes = urn.split(":");
  const tipo = partes[2] ?? "";
  const id = partes[partes.length - 1] ?? "";
  const nomes: Record<string, string> = {
    seniority: "Senioridade", industry: "Setor", function: "Função",
    geo: "Região", country: "País", organization: "Organização",
    staffCountRange: "Porte", organizationType: "Tipo",
  };
  return `${nomes[tipo] ?? tipo} ${id}`;
}

const numeroOuNulo = (v: unknown): number | null => (typeof v === "number" ? v : null);

/**
 * Achata UM array de segmentação em linhas.
 *
 * Não soma o que não veio: `organico` e `pago` continuam `null` quando ausentes,
 * e `total` só existe quando pelo menos um dos dois é número. Preencher com
 * zero aqui inventaria uma composição que a API não deu.
 */
export function linhasDoSegmento(
  itens: unknown, campoDeContagem = "followerCounts",
): LinhaDeSegmento[] {
  if (!Array.isArray(itens)) return [];
  return itens.map((item) => {
    const o = (item ?? {}) as Record<string, unknown>;
    const contagens = (o[campoDeContagem] ?? {}) as Record<string, unknown>;
    // A chave da faceta é o campo que NÃO é a contagem — o nome varia por
    // segmentação (seniority, industry, function, staffCountRange…).
    const chaveBruta = Object.entries(o)
      .find(([k, v]) => k !== campoDeContagem && typeof v === "string")?.[1] as string | undefined;
    const chave = chaveBruta ?? "—";

    const organico = numeroOuNulo(contagens.organicFollowerCount)
      ?? numeroOuNulo(contagens.organicImpressionCount);
    const pago = numeroOuNulo(contagens.paidFollowerCount)
      ?? numeroOuNulo(contagens.paidImpressionCount);
    const soltos = Object.values(contagens).filter((v): v is number => typeof v === "number");

    return {
      chave,
      rotulo: rotuloDoUrn(chave),
      organico, pago,
      total: organico === null && pago === null
        ? (soltos.length ? soltos.reduce((t, x) => t + x, 0) : null)
        : (organico ?? 0) + (pago ?? 0),
    };
  }).sort((a, b) => (b.total ?? -1) - (a.total ?? -1));
}

/** Os grupos de segmentação presentes num retrato vitalício. */
export function segmentosDisponiveis(o: unknown): Array<{ campo: string; itens: number }> {
  if (!o || typeof o !== "object") return [];
  return Object.entries(o as Record<string, unknown>)
    .filter(([, v]) => Array.isArray(v) && v.length > 0)
    .map(([campo, v]) => ({ campo, itens: (v as unknown[]).length }));
}
