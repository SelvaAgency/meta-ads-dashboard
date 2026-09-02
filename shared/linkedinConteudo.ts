/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Que tipo de publicação é esta? — lido do `content`, nunca suposto
 * ─────────────────────────────────────────────────────────────────────────────
 *  A carga da Musa guardou 355 objetos `content` completos, e o laboratório não
 *  dizia nada sobre eles. Era o dado mais rico parado no banco.
 *
 *  ── A regra que governa este arquivo ───────────────────────────────────────
 *  Quando o JSON não permite identificar, o tipo é `nao_identificado` — e as
 *  chaves cruas vão junto, para alguém poder olhar e decidir. Chutar "imagem"
 *  porque havia um `media` transformaria uma dúvida em número, e número não se
 *  desconfia depois.
 *
 *  Núcleo puro: sem rede, sem banco, sem relógio.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type TipoDeConteudo =
  | "texto" | "imagem" | "carrossel" | "video" | "documento"
  | "artigo" | "enquete" | "evento" | "nao_identificado";

export const ROTULO_CONTEUDO: Record<TipoDeConteudo, string> = {
  texto: "Texto",
  imagem: "Imagem",
  carrossel: "Carrossel",
  video: "Vídeo",
  documento: "Documento",
  artigo: "Artigo / link",
  enquete: "Enquete",
  evento: "Evento",
  nao_identificado: "Não identificado",
};

/** A ordem em que a tela lista — do mais comum ao caso de borda. */
export const TIPOS_DE_CONTEUDO: TipoDeConteudo[] = [
  "texto", "imagem", "carrossel", "video", "documento",
  "artigo", "enquete", "evento", "nao_identificado",
];

export interface LeituraDoConteudo {
  tipo: TipoDeConteudo;
  /** Por que este tipo — a chave do JSON que decidiu. */
  evidencia: string;
  /** URNs de mídia encontrados, na ordem em que aparecem. */
  midias: string[];
  /** As chaves de primeiro nível do `content`, para o caso não identificado. */
  chaves: string[];
}

const urnsEm = (o: unknown, saida: string[] = [], nivel = 0): string[] => {
  if (!o || typeof o !== "object" || nivel > 5) return saida;
  for (const v of Object.values(o as Record<string, unknown>)) {
    if (typeof v === "string" && /^urn:li:(image|video|document|digitalmediaAsset):/.test(v)) {
      if (!saida.includes(v)) saida.push(v);
    } else if (v && typeof v === "object") urnsEm(v, saida, nivel + 1);
  }
  return saida;
};

/**
 * O tipo de UMA publicação.
 *
 * A ordem das perguntas é a da especificidade: `multiImage` antes de `media`
 * porque um carrossel também tem mídia, e responder "imagem" apagaria a
 * distinção que interessa a quem escolhe formato.
 *
 * O tipo do URN decide entre imagem, vídeo e documento — `media` sozinho não
 * diz qual é, e é a única forma de acertar sem inventar.
 */
export function lerConteudo(content: unknown, temTexto = false): LeituraDoConteudo {
  const chaves = content && typeof content === "object"
    ? Object.keys(content as Record<string, unknown>) : [];
  const midias = urnsEm(content);
  const base = { midias, chaves };

  // Sem `content`: é publicação de texto puro — e isso é identificação, não
  // ausência. Sem texto TAMBÉM, aí é que não dá para dizer nada.
  if (!content || typeof content !== "object" || chaves.length === 0) {
    return temTexto
      ? { tipo: "texto", evidencia: "sem `content` e com `commentary`", ...base }
      : { tipo: "nao_identificado", evidencia: "sem `content` e sem texto", ...base };
  }

  const c = content as Record<string, unknown>;
  const tem = (k: string) => c[k] !== undefined && c[k] !== null;

  if (tem("poll")) return { tipo: "enquete", evidencia: "content.poll", ...base };
  if (tem("event")) return { tipo: "evento", evidencia: "content.event", ...base };
  if (tem("article")) return { tipo: "artigo", evidencia: "content.article", ...base };
  if (tem("multiImage") || tem("carousel")) {
    return { tipo: "carrossel", evidencia: tem("multiImage") ? "content.multiImage" : "content.carousel", ...base };
  }
  if (tem("document")) return { tipo: "documento", evidencia: "content.document", ...base };

  if (tem("media")) {
    // `media` não diz o que é; o URN diz.
    const urn = midias[0] ?? "";
    if (/^urn:li:video:/.test(urn)) return { tipo: "video", evidencia: "content.media + urn:li:video", ...base };
    if (/^urn:li:document:/.test(urn)) return { tipo: "documento", evidencia: "content.media + urn:li:document", ...base };
    if (/^urn:li:image:/.test(urn)) return { tipo: "imagem", evidencia: "content.media + urn:li:image", ...base };
    return {
      tipo: "nao_identificado",
      evidencia: `content.media com URN de tipo desconhecido${urn ? `: ${urn}` : " ausente"}`,
      ...base,
    };
  }

  return { tipo: "nao_identificado", evidencia: `chaves: ${chaves.join(", ")}`, ...base };
}

export interface DistribuicaoDeConteudo {
  tipo: TipoDeConteudo;
  rotulo: string;
  quantidade: number;
  fatia: number;
  /** As evidências distintas que levaram a este tipo — abre o "por quê". */
  evidencias: string[];
}

/** A composição do acervo, contada — e com o "não identificado" à vista. */
export function distribuicaoDeConteudo(
  leituras: LeituraDoConteudo[],
): DistribuicaoDeConteudo[] {
  const total = leituras.length;
  const porTipo = new Map<TipoDeConteudo, LeituraDoConteudo[]>();
  for (const l of leituras) {
    porTipo.set(l.tipo, [...(porTipo.get(l.tipo) ?? []), l]);
  }
  return TIPOS_DE_CONTEUDO
    .filter((t) => porTipo.has(t))
    .map((tipo) => {
      const xs = porTipo.get(tipo)!;
      return {
        tipo, rotulo: ROTULO_CONTEUDO[tipo],
        quantidade: xs.length,
        fatia: total ? xs.length / total : 0,
        evidencias: Array.from(new Set(xs.map((x) => x.evidencia))).slice(0, 6),
      };
    })
    .sort((a, b) => b.quantidade - a.quantidade);
}

/**
 * ─── O estado de UMA imagem ─────────────────────────────────────────────────
 *  Quatro estados, e o terceiro é o que faltava: a coleta da Musa marcou 225
 *  publicações como "a API não devolveu URL" quando só 20 URNs chegaram a ser
 *  perguntados. Chamar de indisponível o que nunca foi perguntado é o mesmo
 *  erro que a Fase 0 levou quatro rodadas para achar, agora do nosso lado.
 */
export type EstadoDaMidia =
  | "resolvida" | "consultada_sem_retorno" | "nao_consultada" | "erro" | "sem_midia";

export const ROTULO_MIDIA: Record<EstadoDaMidia, string> = {
  resolvida: "Imagem resolvida",
  consultada_sem_retorno: "Consultada, sem retorno",
  nao_consultada: "Ainda não consultada",
  erro: "Erro na resolução",
  sem_midia: "Sem mídia nesta publicação",
};

export interface EntradaDeMidia {
  urn: string;
  dados: unknown;
  obtidaEm?: string | null;
  /**
   * `true` quando esta URN chegou a ser perguntada.
   *
   * Coletas anteriores à correção não gravavam este campo — e por isso, nelas,
   * o estado fica `indeterminado` em vez de virar uma afirmação.
   */
  consultada?: boolean;
}

/**
 * Uma URL de imagem escondida DENTRO do `content` já salvo.
 *
 * O `share:` legado do LinkedIn às vezes traz `contentEntities[].thumbnails[]`
 * com `resolvedUrl` — URL de verdade, não URN. Ela já está no banco desde a
 * carga, e não custa chamada nenhuma; deixar de olhar ali era desenhar
 * placeholder tendo a imagem em mãos.
 *
 * A busca é DIRIGIDA, não uma varredura por qualquer `http`: `article.source`
 * é o link da matéria e `landingPage` é destino de clique — nenhum dos dois é
 * imagem, e usá-los produziria um `<img>` quebrado com cara de erro nosso.
 */
export function urlNoConteudo(content: unknown, caminho = "", nivel = 0): string | null {
  if (!content || typeof content !== "object" || nivel > 6) return null;
  if (Array.isArray(content)) {
    for (const item of content) {
      const u = urlNoConteudo(item, caminho, nivel + 1);
      if (u) return u;
    }
    return null;
  }
  for (const [k, v] of Object.entries(content as Record<string, unknown>)) {
    const trilha = caminho ? `${caminho}.${k}` : k;
    const pareceImagem = /thumbnail|image|picture|media|display/i.test(trilha)
      && !/source|landingPage|linkedInUrl|permalink/i.test(trilha);
    if (typeof v === "string" && /^https?:\/\//.test(v) && pareceImagem) return v;
    if (v && typeof v === "object") {
      const u = urlNoConteudo(v, trilha, nivel + 1);
      if (u) return u;
    }
  }
  return null;
}

export function estadoDaMidia(e: {
  midias: EntradaDeMidia[] | null | undefined;
  erro?: string | null;
  /** O `content` cru — pode carregar uma URL que a resolução não precisou dar. */
  content?: unknown;
}): { estado: EstadoDaMidia; url: string | null; indeterminado: boolean; motivo: string | null } {
  const ms = e.midias ?? [];

  for (const m of ms) {
    const d = m.dados as Record<string, unknown> | null;
    const u = d?.downloadUrl ?? d?.originalUrl ?? d?.url;
    if (typeof u === "string" && u.startsWith("http")) {
      return { estado: "resolvida", url: u, indeterminado: false, motivo: null };
    }
  }

  // A URL que já estava no `content`. Vem antes de qualquer veredito de
  // ausência: dizer "não temos imagem" com a imagem no banco seria errado.
  const doConteudo = urlNoConteudo(e.content);
  if (doConteudo) {
    return { estado: "resolvida", url: doConteudo, indeterminado: false, motivo: null };
  }

  if (!ms.length) {
    return { estado: "sem_midia", url: null, indeterminado: false, motivo: null };
  }

  if (e.erro) return { estado: "erro", url: null, indeterminado: false, motivo: e.erro };

  const algumaConsultada = ms.some((m) => m.consultada === true);
  const algumaMarcada = ms.some((m) => typeof m.consultada === "boolean");

  if (algumaConsultada) {
    return {
      estado: "consultada_sem_retorno", url: null, indeterminado: false,
      motivo: "a API foi consultada e não devolveu URL para esta mídia",
    };
  }
  if (algumaMarcada) {
    return {
      estado: "nao_consultada", url: null, indeterminado: false,
      motivo: "a resolução não chegou a ser pedida para esta publicação",
    };
  }
  // Coleta antiga: não dá para saber. Dizer isso é a resposta certa.
  return {
    estado: "nao_consultada", url: null, indeterminado: true,
    motivo: "a coleta que gravou esta publicação não registrava quais URNs foram "
      + "perguntadas — não dá para separar 'não consultada' de 'sem retorno'",
  };
}

/**
 * ─── O estado da MÉTRICA de uma publicação ──────────────────────────────────
 *  390 publicações, 160 com métrica. As outras 230 não são "não coletadas": o
 *  lote foi pedido e o endpoint OMITE publicação sem estatística. Mostrar `·`
 *  ali dizia a coisa errada, e mostrar `0` diria uma pior.
 */
export type EstadoDaMetrica =
  | "coletada" | "sem_retorno" | "nao_solicitada" | "erro";

export const ROTULO_METRICA: Record<EstadoDaMetrica, string> = {
  coletada: "Métrica coletada",
  sem_retorno: "Pedida, sem retorno da API",
  nao_solicitada: "Ainda não solicitada",
  erro: "Erro na coleta",
};

export function estadoDaMetrica(e: {
  temLinha: boolean;
  temValor: boolean;
  statusColeta?: string | null;
  /** A publicação entrou no lote daquela rodada? */
  foiPedida: boolean;
}): { estado: EstadoDaMetrica; motivo: string | null } {
  if (e.statusColeta === "erro") {
    return { estado: "erro", motivo: "a chamada de métricas falhou para esta publicação" };
  }
  if (e.temValor) return { estado: "coletada", motivo: null };
  if (e.foiPedida) {
    return {
      estado: "sem_retorno",
      motivo: "a publicação entrou no lote e o endpoint não devolveu estatística para ela — "
        + "é o comportamento medido na Fase 0, e não significa desempenho zero",
    };
  }
  if (e.temLinha) {
    return { estado: "sem_retorno", motivo: "há registro da coleta, mas sem valor de métrica" };
  }
  return { estado: "nao_solicitada", motivo: "nenhuma rodada pediu métrica para esta publicação" };
}
