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
 * Reações custam DUAS chamadas por publicação, não uma.
 *
 * `socialMetadata` traz o tipo de reação; `socialActions` traz likes e
 * comentários. O coletor faz as duas, e o plano contava uma — sozinho, esse
 * erro respondeu por 30 das 42 chamadas que sobraram na carga da Musa.
 */
export const CHAMADAS_POR_REACAO = 2;

/**
 * A listagem gasta UMA página a mais do que o acervo exige.
 *
 * A última chamada volta vazia, e é ela que confirma que a listagem acabou —
 * sem ela não dá para distinguir "acabou" de "o teto da sondagem cortou".
 */
export const PAGINA_QUE_CONFIRMA_O_FIM = 1;

/**
 * Faixa de publicações de uma Página nunca carregada.
 *
 * O orçamento antigo usava as publicações JÁ no banco — que, numa carga
 * inicial, é justamente o que ainda não existe. Na Musa ele disse ~40 e a carga
 * custou 176, porque o incremental tinha listado só 20 posts. Um número exato
 * derivado de uma tabela vazia é pior que uma faixa honesta: ele parece
 * conhecimento.
 */
export const FAIXA_DE_POSTS = { minimo: 20, maximo: 400 } as const;

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
  | "comentarios_do_post"
  | "resolver_imagens";

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
  /** A carga tenta resolver imagem; um orçamento hipotético pode não querer. */
  resolverImagens?: boolean;
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
    {
      tipo: "listar_posts",
      chamadas: Math.max(1, Math.ceil(n / POSTS_POR_PAGINA)) + PAGINA_QUE_CONFIRMA_O_FIM,
      detalhe: `listar publicações (${Math.ceil(n / POSTS_POR_PAGINA)} página(s) + 1 que confirma o fim)`,
    },
    { tipo: "metricas_de_posts", chamadas: lotes, detalhe: `métricas de ${n} publicação(ões) em ${lotes} lote(s)` },
    {
      tipo: "reacoes_do_post",
      chamadas: Math.min(n, tetoReacoes) * CHAMADAS_POR_REACAO,
      detalhe: `reações por tipo · ${Math.min(n, tetoReacoes)} publicação(ões) × `
        + `${CHAMADAS_POR_REACAO} chamadas (socialMetadata + socialActions)`,
    },
    ...(e.resolverImagens === false || n === 0 ? [] : [{
      tipo: "resolver_imagens" as TipoDePasso, chamadas: 1,
      detalhe: "resolver imagens (1 chamada, até 20 URNs)",
    }]),
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
    {
      tipo: "reacoes_do_post",
      chamadas: Math.max(0, e.postsNovos) * CHAMADAS_POR_REACAO,
      detalhe: `reações das ${e.postsNovos} publicação(ões) nova(s) × ${CHAMADAS_POR_REACAO} chamadas`,
    },
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

/**
 * ─── O orçamento de uma Página que nunca foi carregada ───────────────────────
 *  Não dá para saber quantas publicações ela tem sem listar — e listar já é a
 *  coleta. Então a resposta honesta é uma FAIXA, com a premissa escrita.
 *
 *  Depois da carga, `linkedin_coleta_execucoes.chamadas` passa a ser a fonte da
 *  verdade, e a faixa deixa de importar.
 */
export interface FaixaDeOrcamento {
  minimo: number;
  maximo: number;
  /** O plano do piso e o do teto, para a tela poder abrir o detalhe. */
  planoMinimo: PlanoDeColeta;
  planoMaximo: PlanoDeColeta;
  premissa: string;
  /** `true` quando é faixa; `false` quando o acervo já é conhecido. */
  estimada: boolean;
}

export function faixaDaCargaInicial(o: {
  postsConhecidos?: number | null;
  postsUgcConhecidos?: number | null;
  minimo?: number;
  maximo?: number;
} = {}): FaixaDeOrcamento {
  // Acervo conhecido: a faixa colapsa num número, e a tela diz que é exato.
  if (typeof o.postsConhecidos === "number" && o.postsConhecidos > 0) {
    const p = planoDeCargaInicial({
      posts: o.postsConhecidos,
      postsUgc: o.postsUgcConhecidos ?? o.postsConhecidos,
    });
    return {
      minimo: p.chamadasEstimadas, maximo: p.chamadasEstimadas,
      planoMinimo: p, planoMaximo: p,
      premissa: `${o.postsConhecidos} publicação(ões) já listadas nesta Página`,
      estimada: false,
    };
  }
  const min = o.minimo ?? FAIXA_DE_POSTS.minimo;
  const max = o.maximo ?? FAIXA_DE_POSTS.maximo;
  const planoMinimo = planoDeCargaInicial({ posts: min, postsUgc: min });
  const planoMaximo = planoDeCargaInicial({ posts: max, postsUgc: max });
  return {
    minimo: planoMinimo.chamadasEstimadas,
    maximo: planoMaximo.chamadasEstimadas,
    planoMinimo, planoMaximo,
    premissa: `entre ${min} e ${max} publicações — o acervo só é conhecido depois de listar, `
      + "e listar já é a própria coleta",
    estimada: true,
  };
}
