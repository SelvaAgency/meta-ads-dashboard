/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  LinkedIn · o que esta Página nos entrega — e o que ela recusou
 * ─────────────────────────────────────────────────────────────────────────────
 *  Núcleo puro: sem rede, sem banco, sem relógio próprio. Só a leitura do que a
 *  API respondeu.
 *
 *  ── Por que capacidade não sai do cargo ────────────────────────────────────
 *  A Fase 0 mediu oito rodadas atrás disso. ADMINISTRATOR e
 *  CONTENT_ADMINISTRATOR alcançam o mesmo; os três cargos menores entregam
 *  metade; e uma atribuição REVOGADA derruba tudo, seja qual for o cargo. Duas
 *  rodadas do mesmo dia chegaram a conclusões OPOSTAS sobre a mesma API porque
 *  sortearam Páginas diferentes.
 *
 *  A lição não é "o cargo X pode": é que **a capacidade é a resposta daquela
 *  Página**, medida e guardada, capacidade por capacidade. Qualquer regra global
 *  por cargo repetiria o erro que custou quatro rodadas para achar.
 *
 *  ── Os quatro estados do DADO, e os seis da CAPACIDADE ─────────────────────
 *  São eixos diferentes e confundi-los apaga informação:
 *
 *    dado        um número num dia          medido(0) · indisponível · erro · não coletado
 *    capacidade  se a API entrega aquilo    ok · sem permissão · sem dados · …
 *
 *  Uma Página pode ter a capacidade `ok` e o dado de terça `indisponivel`. Um
 *  campo só obrigaria a inventar um valor por combinação.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** As onze coisas que se pergunta a uma Página. */
export type CapacidadeLinkedIn =
  | "pagina"
  | "seguidores_atuais"
  | "seguidores_serie"
  | "seguidores_segmentacoes"
  | "pagina_lifetime"
  | "pagina_serie"
  | "publicacoes"
  | "agregado_de_posts"
  | "metricas_por_post"
  | "reacoes_por_tipo"
  | "comentarios";

export const CAPACIDADES: CapacidadeLinkedIn[] = [
  "pagina", "seguidores_atuais", "seguidores_serie", "seguidores_segmentacoes",
  "pagina_lifetime", "pagina_serie", "publicacoes", "agregado_de_posts",
  "metricas_por_post", "reacoes_por_tipo", "comentarios",
];

export const ROTULO_CAPACIDADE: Record<CapacidadeLinkedIn, string> = {
  pagina: "Dados da Página",
  seguidores_atuais: "Seguidores",
  seguidores_serie: "Crescimento diário",
  seguidores_segmentacoes: "Segmentações de seguidores",
  pagina_lifetime: "Visualizações (vitalício)",
  pagina_serie: "Visualizações por dia",
  publicacoes: "Publicações",
  agregado_de_posts: "Agregado de publicações",
  metricas_por_post: "Métricas por publicação",
  reacoes_por_tipo: "Reações por tipo",
  comentarios: "Comentários",
};

/**
 * O que aconteceu quando perguntamos.
 *
 * `sem_dados` e `sem_permissao` são estados DIFERENTES de propósito: a Página
 * que não publicou responde 200 com lista vazia, e ler isso como bloqueio foi
 * exatamente o falso negativo da rodada 1 da sondagem.
 */
export type EstadoDaCapacidade =
  | "ok"
  | "sem_dados"
  | "sem_permissao"
  | "nao_disponivel"
  | "erro"
  | "nao_coletado";

export const ROTULO_ESTADO: Record<EstadoDaCapacidade, string> = {
  ok: "Disponível",
  sem_dados: "Sem dados",
  sem_permissao: "Permissão insuficiente",
  nao_disponivel: "Não disponível na API",
  erro: "Erro na coleta",
  nao_coletado: "Ainda não coletado",
};

export interface LeituraDaCapacidade {
  estado: EstadoDaCapacidade;
  /** HTTP da última tentativa. `null` quando nem chegou a haver resposta. */
  status: number | null;
  /** Erro sanitizado, ou a observação que explica `sem_dados`. */
  motivo: string | null;
  /** Quando foi medida. ISO. */
  medidaEm: string | null;
}

export type MapaDeCapacidades = Partial<Record<CapacidadeLinkedIn, LeituraDaCapacidade>>;

/**
 * Traduz UMA resposta da API em estado.
 *
 * `vazio` é decidido por quem chama, porque só ele sabe o que "vazio" significa
 * naquele endpoint — zero elementos numa listagem, ou todos os números em zero
 * num agregado.
 */
export function classificarResposta(r: {
  ok: boolean; status: number | null; erro: string | null;
}, vazio = false): EstadoDaCapacidade {
  if (r.ok) return vazio ? "sem_dados" : "ok";
  if (r.status === 403 || r.status === 401) return "sem_permissao";
  if (r.status === 404) return "nao_disponivel";
  if (r.status === 400) {
    // 400 com "unknown"/"not allowed" é a API dizendo que aquilo não existe
    // nela. Qualquer outro 400 é erro NOSSO, e chamar de "não disponível"
    // esconderia um conserto que está do nosso lado.
    const t = (r.erro ?? "").toLowerCase();
    return /unknown|not allowed|no such|unsupported/.test(t) ? "nao_disponivel" : "erro";
  }
  return "erro";
}

/** Os cinco estados do VÍNCULO — é o que o cabeçalho da página mostra. */
export type StatusDoVinculo =
  | "completo" | "parcial" | "sem_acesso" | "erro" | "nao_vinculada";

export const ROTULO_VINCULO: Record<StatusDoVinculo, string> = {
  completo: "Dados completos",
  parcial: "Dados parciais",
  sem_acesso: "Sem acesso a esta Página",
  erro: "Falha na coleta",
  nao_vinculada: "Nenhuma Página vinculada",
};

/**
 * As capacidades que precisam responder para o vínculo ser "completo".
 *
 * Comentários ficam de fora: a Fase 0 nunca provou que dá para listar o
 * CONTEÚDO deles, só a contagem. Exigi-los tornaria toda Página "parcial" por
 * uma capacidade que talvez não exista — e "parcial" que nunca vira "completo"
 * não é diagnóstico, é ruído.
 */
export const ESSENCIAIS: CapacidadeLinkedIn[] = [
  "pagina", "seguidores_atuais", "seguidores_serie",
  "pagina_lifetime", "pagina_serie", "publicacoes", "metricas_por_post",
];

export function statusDoVinculo(mapa: MapaDeCapacidades, vinculada = true): StatusDoVinculo {
  if (!vinculada) return "nao_vinculada";
  const lidas = ESSENCIAIS.map((c) => mapa[c]?.estado).filter((e): e is EstadoDaCapacidade => !!e);
  if (!lidas.length) return "erro";

  // Bloqueio em TODAS as essenciais é acesso perdido — não é falha da API, e a
  // frase que o usuário precisa ler é outra: o conserto é na Página.
  if (lidas.every((e) => e === "sem_permissao")) return "sem_acesso";
  if (lidas.some((e) => e === "erro")) return "erro";

  // `sem_dados` NÃO derruba para parcial: uma Página sem publicação entrega
  // tudo que tem. Contar isso como incompletude culparia a API pela carteira.
  const falhou = lidas.some((e) => e === "sem_permissao" || e === "nao_disponivel");
  return falhou ? "parcial" : "completo";
}

/** As capacidades que faltam, para a tela poder DIZER quais. */
export function capacidadesFaltantes(mapa: MapaDeCapacidades): Array<{
  capacidade: CapacidadeLinkedIn; rotulo: string; estado: EstadoDaCapacidade; motivo: string | null;
}> {
  return CAPACIDADES
    .map((c) => ({ c, l: mapa[c] }))
    .filter((x) => x.l && x.l.estado !== "ok" && x.l.estado !== "sem_dados")
    .map((x) => ({
      capacidade: x.c,
      rotulo: ROTULO_CAPACIDADE[x.c],
      estado: x.l!.estado,
      motivo: x.l!.motivo,
    }));
}

/**
 * ─── Os quatro estados de UM número ──────────────────────────────────────────
 *  Nunca transformar ausência em zero. `0` é medida; `null` sem motivo é
 *  ausência de pedido; `null` com motivo é recusa; erro é falha.
 */
export type EstadoDoDado = "medido" | "indisponivel" | "nao_coletado" | "erro";

export function estadoDoDado(
  valor: number | null | undefined,
  indisponiveis?: Record<string, string> | null,
  chave?: string,
  houveErro = false,
): EstadoDoDado {
  if (houveErro) return "erro";
  if (typeof valor === "number") return "medido";
  if (chave && indisponiveis && indisponiveis[chave]) return "indisponivel";
  return "nao_coletado";
}

/** O texto curto que a tela mostra no lugar do número. */
export const MARCA_DO_DADO: Record<EstadoDoDado, string | null> = {
  medido: null,
  indisponivel: "—",
  nao_coletado: "·",
  erro: "!",
};

/**
 * ─── Cargos ─────────────────────────────────────────────────────────────────
 *  Guardados por atribuição, com o `state` de cada uma. A Fase 0 provou que uma
 *  MESMA Página tem ADMINISTRATOR=APPROVED e CONTENT_ADMINISTRATOR=REVOKED ao
 *  mesmo tempo — então "o cargo da Página" não existe como valor único.
 */
export interface AtribuicaoDeCargo { papel: string; estado: string }

export function cargosVivos(a: AtribuicaoDeCargo[]): string[] {
  return a.filter((x) => x.estado === "APPROVED").map((x) => x.papel);
}

export function temAtribuicaoViva(a: AtribuicaoDeCargo[]): boolean {
  return a.some((x) => x.estado === "APPROVED");
}

/** Ordem de alcance, e cargo vivo sempre na frente do morto. */
const ORDEM_DE_ALCANCE = ["ADMINISTRATOR", "CONTENT_ADMINISTRATOR"];

export function cargoPrincipal(a: AtribuicaoDeCargo[]): string | null {
  if (!a.length) return null;
  const posto = (p: string) => {
    const i = ORDEM_DE_ALCANCE.indexOf(p);
    return i === -1 ? ORDEM_DE_ALCANCE.length : i;
  };
  return [...a].sort((x, y) =>
    (x.estado === "APPROVED" ? 0 : 1) - (y.estado === "APPROVED" ? 0 : 1)
    || posto(x.papel) - posto(y.papel)
    || x.papel.localeCompare(y.papel))[0].papel;
}
