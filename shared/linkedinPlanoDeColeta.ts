/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Quanto vai custar — decidido ANTES de gastar
 * ─────────────────────────────────────────────────────────────────────────────
 *  O LinkedIn não envia UM cabeçalho de rate limit. Foram 74 respostas na última
 *  sondagem e nenhuma trouxe `x-ratelimit-*`. A cota existe, é diária e por app,
 *  e é invisível.
 *
 *  Isso muda o desenho: o número de chamadas deixa de ser detalhe de
 *  implementação e vira a variável de risco. Por isso o plano é um OBJETO,
 *  calculado por função pura antes da rodada — o botão diz o preço, o log diz o
 *  gasto, e um estouro aparece na segunda rodada em vez de aparecer no dia em
 *  que a API parar de responder.
 *
 *  Sem rede, sem banco, sem relógio: tudo entra por parâmetro.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Profundidade PROVADA: 30 baldes por janela até 395 dias. Em 730 a série colapsa. */
export const JANELA_HISTORICA_DIAS = 395;

/**
 * Tamanho do bloco de série.
 *
 * 90 é conservador. A sondagem provou janelas de 30 dias; se uma janela ampla
 * for aceita, este número sobe e a carga inicial encolhe. Está aqui, com nome,
 * justamente para ser ajustado por medição e não por chute.
 */
export const BLOCO_DE_SERIE_DIAS = 90;

/** A API devolve 20 por página em `/rest/posts`. */
export const POSTS_POR_PAGINA = 20;

/** Provado: 5 URNs num `List(...)` respondem. Acima disso, a medir. */
export const LOTE_DE_METRICAS = 5;

/**
 * Teto de reações por tipo na carga inicial.
 *
 * `socialMetadata` é chamada por CAMINHO, um URN por vez — numa Página de 400
 * posts seriam 400 chamadas só para essa métrica. O teto existe até medirmos se
 * ela aceita lote. O que fica de fora é `nao_coletado`, nunca zero.
 */
export const TETO_REACOES_CARGA = 30;

/** Dias reescritos em toda rodada. Dado que chega atrasado reescreve o dia anterior. */
export const SOBREPOSICAO_DIAS = 3;

/** Publicação para de crescer; depois disto não se recoleta métrica dela. */
export const JANELA_POSTS_ATIVOS_DIAS = 30;

/** Teto de chamadas de UMA rodada. Sem cabeçalho de cota, é a única proteção. */
export const TETO_DE_CHAMADAS_POR_RODADA = 600;

export type TipoDePasso =
  | "acl"
  | "organizacao"
  | "seguidores_atuais"
  | "seguidores_lifetime"
  | "seguidores_serie"
  | "pagina_lifetime"
  | "pagina_serie"
  | "listar_posts"
  | "agregado_de_posts"
  | "metricas_de_posts"
  | "reacoes_do_post"
  | "comentarios_do_post";

export interface PassoDoPlano {
  tipo: TipoDePasso;
  /** Quantas chamadas ESTE passo custa. */
  chamadas: number;
  /** Descrição legível — vai para a tela e para o log. */
  detalhe: string;
}

export interface PlanoDeColeta {
  modo: "inicial" | "incremental" | "semanal";
  passos: PassoDoPlano[];
  chamadasEstimadas: number;
  /** `true` quando o plano foi PODADO por bater no teto. */
  podado: boolean;
  /** O que ficou de fora, quando podado. */
  fora: string[];
}

const soma = (p: PassoDoPlano[]) => p.reduce((t, x) => t + x.chamadas, 0);

/** Aplica o teto: mantém a ordem de prioridade e diz o que caiu. */
function aplicarTeto(
  modo: PlanoDeColeta["modo"], passos: PassoDoPlano[], teto: number,
): PlanoDeColeta {
  const dentro: PassoDoPlano[] = [];
  const fora: string[] = [];
  let total = 0;
  for (const p of passos) {
    if (total + p.chamadas <= teto) { dentro.push(p); total += p.chamadas; }
    else fora.push(`${p.detalhe} (${p.chamadas} chamadas)`);
  }
  return { modo, passos: dentro, chamadasEstimadas: total, podado: fora.length > 0, fora };
}

export interface EntradaDaCarga {
  /** Publicações já descobertas. Zero significa que ainda não listamos. */
  posts: number;
  /** Quantas dessas são do tipo `ugcPost` (o resto é `share`). */
  postsUgc?: number;
  janelaDias?: number;
  blocoDias?: number;
  loteDeMetricas?: number;
  tetoDeReacoes?: number;
  tetoDeChamadas?: number;
}

/**
 * A carga inicial de UMA Página.
 *
 * Os passos vêm em ordem de PRIORIDADE, não de execução: se o teto cortar, o
 * que cai é o mais caro e menos essencial (reações por tipo), nunca a série
 * histórica que é a razão de a carga existir.
 */
export function planoDeCargaInicial(e: EntradaDaCarga): PlanoDeColeta {
  const janela = e.janelaDias ?? JANELA_HISTORICA_DIAS;
  const bloco = e.blocoDias ?? BLOCO_DE_SERIE_DIAS;
  const lote = e.loteDeMetricas ?? LOTE_DE_METRICAS;
  const tetoReacoes = e.tetoDeReacoes ?? TETO_REACOES_CARGA;
  const blocos = Math.ceil(janela / bloco);
  const n = Math.max(0, e.posts);

  // Publicações de tipos diferentes não cabem no mesmo `List(...)` — a Fase 0
  // provou com um 400. São duas filas, e cada uma arredonda para cima.
  const ugc = Math.min(n, Math.max(0, e.postsUgc ?? n));
  const share = n - ugc;
  const lotes = (ugc ? Math.ceil(ugc / lote) : 0) + (share ? Math.ceil(share / lote) : 0);

  const passos: PassoDoPlano[] = ([
    { tipo: "organizacao", chamadas: 1, detalhe: "detalhes da organização" },
    { tipo: "seguidores_atuais", chamadas: 1, detalhe: "seguidores atuais" },
    { tipo: "seguidores_lifetime", chamadas: 1, detalhe: "seguidores vitalício + segmentações" },
    { tipo: "seguidores_serie", chamadas: blocos, detalhe: `série de seguidores · ${janela}d em ${blocos} bloco(s)` },
    { tipo: "pagina_lifetime", chamadas: 1, detalhe: "visualizações vitalício" },
    { tipo: "pagina_serie", chamadas: blocos, detalhe: `série de visualizações · ${janela}d em ${blocos} bloco(s)` },
    { tipo: "agregado_de_posts", chamadas: 1, detalhe: "agregado de publicações" },
    { tipo: "listar_posts", chamadas: Math.max(1, Math.ceil(n / POSTS_POR_PAGINA)), detalhe: "listar publicações" },
    { tipo: "metricas_de_posts", chamadas: lotes, detalhe: `métricas de ${n} publicação(ões) em ${lotes} lote(s)` },
    { tipo: "reacoes_do_post", chamadas: Math.min(n, tetoReacoes), detalhe: `reações por tipo · ${Math.min(n, tetoReacoes)} publicação(ões)` },
  ] as PassoDoPlano[]).filter((p) => p.chamadas > 0);

  return aplicarTeto("inicial", passos, e.tetoDeChamadas ?? TETO_DE_CHAMADAS_POR_RODADA);
}

export interface EntradaIncremental {
  /** Publicações dentro da janela ativa — as que ainda podem mudar. */
  postsAtivos: number;
  postsAtivosUgc?: number;
  /** Publicações vistas pela primeira vez hoje. Só elas custam reação. */
  postsNovos: number;
  /** `true` no dia do semanal. */
  incluirSemanal?: boolean;
  loteDeMetricas?: number;
  tetoDeChamadas?: number;
}

/**
 * A rodada diária.
 *
 * O que a torna barata não é pedir menos coisas — é pedir JANELAS, e não
 * acervos. Uma Página de 400 publicações custa o mesmo que uma de 20, porque o
 * que muda de um dia para o outro é o mesmo punhado de posts recentes.
 */
export function planoIncremental(e: EntradaIncremental): PlanoDeColeta {
  const lote = e.loteDeMetricas ?? LOTE_DE_METRICAS;
  const n = Math.max(0, e.postsAtivos);
  const ugc = Math.min(n, Math.max(0, e.postsAtivosUgc ?? n));
  const share = n - ugc;
  const lotes = (ugc ? Math.ceil(ugc / lote) : 0) + (share ? Math.ceil(share / lote) : 0);

  const passos: PassoDoPlano[] = [
    { tipo: "seguidores_atuais", chamadas: 1, detalhe: "seguidores atuais" },
    { tipo: "seguidores_serie", chamadas: 1, detalhe: `série de seguidores · ${SOBREPOSICAO_DIAS}d de sobreposição` },
    { tipo: "pagina_serie", chamadas: 1, detalhe: `série de visualizações · ${SOBREPOSICAO_DIAS}d de sobreposição` },
    { tipo: "agregado_de_posts", chamadas: 1, detalhe: "agregado de publicações" },
    { tipo: "listar_posts", chamadas: 1, detalhe: "publicações novas (1ª página)" },
    { tipo: "metricas_de_posts", chamadas: lotes, detalhe: `métricas de ${n} publicação(ões) ativa(s)` },
    { tipo: "reacoes_do_post", chamadas: Math.max(0, e.postsNovos), detalhe: `reações das ${e.postsNovos} publicação(ões) nova(s)` },
  ];
  if (e.incluirSemanal) {
    passos.push(
      { tipo: "organizacao", chamadas: 1, detalhe: "detalhes da organização (semanal)" },
      { tipo: "seguidores_lifetime", chamadas: 1, detalhe: "segmentações vitalícias (semanal)" },
      { tipo: "pagina_lifetime", chamadas: 1, detalhe: "visualizações vitalício (semanal)" },
    );
  }
  return aplicarTeto(e.incluirSemanal ? "semanal" : "incremental",
    passos.filter((p) => p.chamadas > 0), e.tetoDeChamadas ?? TETO_DE_CHAMADAS_POR_RODADA);
}

/**
 * As janelas da carga histórica, da mais recente para a mais antiga.
 *
 * Recente primeiro de propósito: se a carga for interrompida, o que ficou é o
 * período que alguém vai olhar primeiro.
 */
export function janelasDaCarga(
  agora: Date, janelaDias = JANELA_HISTORICA_DIAS, blocoDias = BLOCO_DE_SERIE_DIAS,
): Array<{ de: number; ate: number }> {
  const saida: Array<{ de: number; ate: number }> = [];
  for (let ate = 0; ate < janelaDias; ate += blocoDias) {
    saida.push({ de: Math.min(ate + blocoDias, janelaDias), ate });
  }
  return saida;
}

/** O custo da frota — a conta que decide se a frente cabe na cota. */
export function projecaoDeFrota(
  paginas: number, porPaginaDiario: number, chamadasDeDescoberta = 2,
): { diario: number; semanal: number; mensal: number } {
  const diario = paginas * porPaginaDiario + chamadasDeDescoberta;
  const semanal = diario + paginas * 3;
  // 30 dias: 26 diários + 4 semanais.
  return { diario, semanal, mensal: diario * 26 + semanal * 4 };
}
