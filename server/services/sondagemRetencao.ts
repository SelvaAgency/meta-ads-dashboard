/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Em que segundo as pessoas param de assistir ao Reel?
 * ─────────────────────────────────────────────────────────────────────────────
 *  Só medição. Nada nesta sondagem escreve em snapshot, altera o coletor ou
 *  chega à página Social — pelo mesmo motivo que valeu na Fase 0 do Instagram e
 *  na do LinkedIn: um gráfico de retenção construído sobre suposição é pior que
 *  gráfico nenhum. Ele credencia a leitura. Alguém corta um formato que
 *  funcionava porque a curva "mostrou" abandono no terceiro segundo.
 *
 *  ── O vocabulário vem da Meta, não de nós ──────────────────────────────────
 *  A parte mais valiosa da sondagem é UMA chamada: pedir uma métrica que não
 *  existe. Ao recusar, a Meta responde com a lista inteira de métricas válidas
 *  para aquele tipo de mídia. Foi assim que a lista de métricas de perfil
 *  entrou no projeto, e é o único jeito de responder "quais métricas de vídeo
 *  existem?" sem inventar nomes.
 *
 *  Por isso a ordem importa: primeiro colhemos o vocabulário, depois medimos.
 *  Os nomes candidatos que NÃO aparecerem no vocabulário colhido são marcados
 *  como fora do vocabulário — sem gastar uma chamada para ouvir a mesma recusa
 *  cinco vezes.
 *
 *  ── E medimos o vocabulário INTEIRO, não só a nossa lista ──────────────────
 *  A primeira versão desta sondagem cruzava o vocabulário colhido contra os
 *  nomes que nós tínhamos imaginado, e media a interseção. O efeito foi o
 *  oposto do objetivo: a Meta respondeu `reels_skip_rate` — literalmente uma
 *  taxa de abandono, a métrica mais perto da pergunta que existe nesta conta —
 *  e a sondagem não a mediu, porque ela não estava na nossa lista.
 *
 *  Colher o vocabulário serve para descobrir o que NÃO imaginamos. Filtrar o
 *  vocabulário pela nossa imaginação desfaz exatamente isso. Todo nome que a
 *  Meta listou e que ainda não medimos é medido.
 *
 *  ── Os campos também têm vocabulário: `metadata=1` ─────────────────────────
 *  Três nomes de duração recusados provam que aqueles três não existem, e não
 *  que a duração não existe. `?metadata=1` faz a Graph API listar os campos do
 *  próprio nó — é o equivalente, do lado dos campos, da recusa que enumera
 *  métricas. Só com essa lista "a API não entrega duração" deixa de ser uma
 *  conclusão sobre os nossos chutes e passa a ser uma sobre a API.
 *
 *  ── Duração é pré-requisito, e por isso é um grupo próprio ─────────────────
 *  `ig_reels_avg_watch_time` devolve tempo, não porcentagem. "Assistiram 8
 *  segundos" só vira retenção se soubermos que o Reel tem 20 — sem a duração,
 *  8 segundos é um número sem denominador. Se a API não entregar duração, o
 *  teto do que se pode implementar cai, e o veredito tem de dizer isso.
 *
 *  ── Os quatro estados, iguais ao resto da Social ───────────────────────────
 *    ACEITA_COM_DADO    a métrica foi aceita e veio valor
 *    ACEITA_SEM_DADO    aceita, mas sem valor — medição vazia, não recusa
 *    RECUSADA           a Meta negou; o código da negativa fica registrado
 *    NAO_PERGUNTADA     não gastamos chamada, e o relatório diz por quê
 *
 *  Colapsar os dois primeiros faria "ninguém assistiu" e "a Meta não mede isso"
 *  virarem a mesma linha do relatório, que é exatamente o erro que a página
 *  Social passou o ano inteiro evitando.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import type { RespostaCrua } from "./instagram";

export type ConsultarCru = (caminho: string, params: Record<string, string>) => Promise<RespostaCrua>;

export type EstadoDaMetrica =
  | "ACEITA_COM_DADO"
  | "ACEITA_SEM_DADO"
  | "RECUSADA"
  | "NAO_PERGUNTADA";

/**
 * Um nome que a Meta não usa, para provocar a lista de válidos.
 *
 * Precisa ser obviamente falso: um nome plausível poderia existir numa versão
 * futura, e aí a chamada devolveria dado em vez do vocabulário.
 */
const METRICA_INEXISTENTE = "selva_metrica_que_nao_existe";

/**
 * Os candidatos, com a procedência de cada nome dita no código.
 *
 * `origem` existe para que ninguém precise confiar na nossa memória sobre de
 * onde o nome veio. `pedido_pelo_gui` são os dois nomeados no pedido;
 * `doc_instagram` são métricas de mídia documentadas pela Meta para Instagram;
 * `vocabulario_de_video_da_pagina` são nomes do universo de vídeo da PÁGINA do
 * Facebook, testados de propósito para fechar a pergunta — se a Meta os
 * recusar no Instagram, a recusa é resposta, e nenhum deles foi inventado aqui.
 */
const CANDIDATAS: Array<{ nome: string; origem: string; responde: string }> = [
  { nome: "ig_reels_avg_watch_time", origem: "pedido_pelo_gui", responde: "tempo médio assistido" },
  { nome: "ig_reels_video_view_total_time", origem: "pedido_pelo_gui", responde: "tempo total assistido" },
  { nome: "ig_reels_aggregated_all_plays_count", origem: "doc_instagram", responde: "plays somados" },
  { nome: "clips_replays_count", origem: "doc_instagram", responde: "replays" },
  { nome: "views", origem: "doc_instagram", responde: "visualizações" },
  { nome: "reach", origem: "doc_instagram", responde: "contas alcançadas (denominador possível)" },
  { nome: "total_interactions", origem: "doc_instagram", responde: "interações (referência de sanidade)" },
  { nome: "video_views", origem: "doc_instagram_descontinuada", responde: "visualizações (nome antigo)" },
  { nome: "plays", origem: "doc_instagram_descontinuada", responde: "plays (nome antigo)" },
  {
    nome: "video_retention_graph",
    origem: "vocabulario_de_video_da_pagina",
    responde: "CURVA DE RETENÇÃO — é exatamente a pergunta do Gui",
  },
  {
    nome: "total_video_retention_graph",
    origem: "vocabulario_de_video_da_pagina",
    responde: "curva de retenção (variante)",
  },
  {
    nome: "video_avg_time_watched",
    origem: "vocabulario_de_video_da_pagina",
    responde: "tempo médio assistido (nome da Página)",
  },
];

/** Campos candidatos para a DURAÇÃO do Reel — o denominador da retenção. */
const CAMPOS_DE_DURACAO = ["video_duration", "duration", "media_duration", "thumbnail_url"];

/**
 * Recortes que, se existissem, dariam a curva.
 *
 * A recusa aqui vale tanto quanto um acerto: ela costuma vir acompanhada da
 * lista de `breakdown` válidos, que é o vocabulário de recortes da Meta.
 */
const RECORTES_CANDIDATOS = ["video_view_percentage", "video_view_time", "retention"];

export interface LinhaDaSondagem {
  grupo: "vocabulario" | "campos" | "duracao" | "metrica" | "recorte";
  /** O Reel medido, quando a linha é por Reel. */
  reel: string | null;
  item: string;
  estado: EstadoDaMetrica;
  http: number | null;
  /** O que a Meta respondeu, ou por que não perguntamos. */
  detalhe: string;
  /** A forma da resposta, quando houve resposta. */
  formato: string | null;
  valor: string | null;
}

export interface ReelSondado {
  id: string;
  duracaoSegundos: number | null;
  permalink: string | null;
}

export type Veredito = "SIM" | "PARCIAL" | "NAO";

export interface SondagemDeRetencao {
  ok: boolean;
  reels: ReelSondado[];
  /** As métricas que a própria Meta listou como válidas para Reels. */
  vocabulario: string[];
  /** Os campos que a própria Meta listou para o nó da mídia (`metadata=1`). */
  camposDaMidia: string[];
  linhas: LinhaDaSondagem[];
  veredito: Veredito;
  temCurva: boolean;
  temTempoMedio: boolean;
  temTempoTotal: boolean;
  temDuracao: boolean;
  texto: string;
}

/** Descreve a forma sem despejar o conteúdo. */
function formatoDe(v: unknown): string {
  if (v === null || v === undefined) return "vazio";
  if (typeof v === "number") return Number.isInteger(v) ? "inteiro" : "decimal";
  if (typeof v === "boolean") return "booleano";
  if (typeof v === "string") return `texto (${v.length} caracteres)`;
  if (Array.isArray(v)) {
    if (!v.length) return "lista vazia";
    // Uma lista de pares é o formato que uma CURVA teria. Vale dizer.
    const primeiro = v[0] as unknown;
    if (primeiro && typeof primeiro === "object") {
      return `lista de ${v.length} objeto(s) com [${Object.keys(primeiro as object).join(", ")}]`;
    }
    return `lista de ${v.length} valor(es) ${typeof primeiro}`;
  }
  return `objeto com [${Object.keys(v as object).join(", ")}]`;
}

function valorDe(v: unknown): string {
  if (v === null || v === undefined) return "–";
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (typeof v === "string") return v.length <= 40 ? v : `${v.slice(0, 40)}…`;
  return JSON.stringify(v).slice(0, 120);
}

/**
 * A lista de métricas válidas que a Meta devolve dentro da mensagem de erro.
 *
 * O formato da frase muda entre versões, então a extração não depende dela:
 * pegamos todo identificador em snake_case da mensagem e descartamos o nome
 * inventado que provocou o erro. Uma regex ancorada em "must be one of the
 * following" quebraria calada no dia em que a Meta reescrevesse a frase — e o
 * relatório diria "vocabulário vazio" como se fosse um fato sobre a API.
 */
export function vocabularioDaMensagem(mensagem: string): string[] {
  const achados = mensagem.match(/\b[a-z][a-z0-9]*(?:_[a-z0-9]+){1,}\b/g) ?? [];
  const fora = new Set([METRICA_INEXISTENTE, "media_type", "error_subcode", "media_product_type"]);
  return Array.from(new Set(achados)).filter((m) => !fora.has(m));
}

/** O valor de um insight, nas duas formas que a Meta usa. */
function extrairValor(corpo: unknown): { achou: boolean; valor: unknown } {
  const data = (corpo as { data?: Array<Record<string, unknown>> } | null)?.data;
  const item = data?.[0];
  if (!item) return { achou: false, valor: undefined };
  const porValores = (item.values as Array<{ value?: unknown }> | undefined)?.[0]?.value;
  const porTotal = (item.total_value as { value?: unknown } | undefined)?.value;
  const valor = porValores !== undefined ? porValores : porTotal;
  return { achou: true, valor };
}

/**
 * Sonda a retenção de Reels de uma conta.
 *
 * `limite` é 5 por padrão porque o pedido foi explícito em não começar com um
 * lote gigante. O custo fica em torno de 40 chamadas: 1 listagem, 1 de
 * vocabulário, 1 de campos, 4 de duração, 2 métricas × N Reels, o vocabulário
 * colhido medido (todos os Reels só para os nomes que cheiram a retenção) e 3
 * recortes. O resto vai só no primeiro Reel — repetir em cinco a recusa que já
 * ouvimos não acrescenta resposta.
 */
export async function sondarRetencao(
  consultar: ConsultarCru, base: string, limite = 5,
): Promise<SondagemDeRetencao> {
  const linhas: LinhaDaSondagem[] = [];
  const reg = (l: LinhaDaSondagem) => linhas.push(l);
  const naoPerguntada = (grupo: LinhaDaSondagem["grupo"], item: string, porque: string) =>
    reg({ grupo, reel: null, item, estado: "NAO_PERGUNTADA", http: null, detalhe: porque, formato: null, valor: null });

  // ── Quais Reels medir ─────────────────────────────────────────────────────
  const lista = await consultar(`${base}/media`, {
    fields: "id,media_product_type,media_type,permalink,timestamp",
    limit: String(Math.max(limite * 4, 20)),
  });
  if (lista.erro) {
    return montar(linhas, [], [], `Não conseguimos listar as mídias: Meta (${lista.erro.codigo ?? "?"}) ${lista.erro.mensagem}`);
  }
  const todas = (lista.corpo as { data?: Array<Record<string, unknown>> })?.data ?? [];
  const reels: ReelSondado[] = todas
    .filter((m) => m.media_product_type === "REELS" || m.media_product_type === "CLIPS")
    .slice(0, limite)
    .map((m) => ({ id: String(m.id), duracaoSegundos: null, permalink: (m.permalink as string) ?? null }));

  if (!reels.length) {
    return montar(linhas, [], [],
      `Nenhum Reel entre as ${todas.length} mídias mais recentes. A sondagem precisa de Reels — escolha uma conta que tenha publicado.`);
  }

  // ── 1. O VOCABULÁRIO, colhido da própria recusa ───────────────────────────
  let vocabulario: string[] = [];
  {
    const r = await consultar(`${reels[0].id}/insights`, { metric: METRICA_INEXISTENTE });
    if (r.erro) {
      vocabulario = vocabularioDaMensagem(r.erro.mensagem);
      reg({
        grupo: "vocabulario", reel: reels[0].id, item: "(métricas válidas para Reel)",
        estado: vocabulario.length ? "ACEITA_COM_DADO" : "ACEITA_SEM_DADO",
        http: r.status,
        detalhe: vocabulario.length
          ? `a Meta listou ${vocabulario.length} métrica(s) ao recusar um nome falso`
          : `a Meta recusou sem listar as válidas: ${r.erro.mensagem}`,
        formato: "lista de nomes",
        valor: vocabulario.join(", ") || null,
      });
    } else {
      // Se um nome falso é ACEITO, o teste perdeu o sentido — e isso precisa
      // aparecer, porque significa que nenhuma recusa desta sondagem prova nada.
      reg({
        grupo: "vocabulario", reel: reels[0].id, item: "(métricas válidas para Reel)",
        estado: "ACEITA_SEM_DADO", http: r.status,
        detalhe: "a Meta ACEITOU um nome inventado — as recusas desta sondagem não são confiáveis",
        formato: null, valor: null,
      });
    }
  }

  // ── 2. OS CAMPOS DO NÓ, pela própria API ──────────────────────────────────
  //
  // Sem esta lista, "a API não entrega duração" é uma frase sobre os nomes que
  // nós chutamos. Com ela, é uma frase sobre a API.
  let camposDaMidia: string[] = [];
  {
    const r = await consultar(reels[0].id, { metadata: "1" });
    if (r.erro) {
      reg({
        grupo: "campos", reel: reels[0].id, item: "(campos do nó · metadata=1)",
        estado: "RECUSADA", http: r.status,
        detalhe: `Meta (${r.erro.codigo ?? "?"}): ${r.erro.mensagem}`,
        formato: null, valor: null,
      });
    } else {
      const meta = (r.corpo as { metadata?: { fields?: Array<{ name?: string }> } })?.metadata;
      camposDaMidia = (meta?.fields ?? []).map((f) => String(f.name)).filter(Boolean);
      reg({
        grupo: "campos", reel: reels[0].id, item: "(campos do nó · metadata=1)",
        estado: camposDaMidia.length ? "ACEITA_COM_DADO" : "ACEITA_SEM_DADO",
        http: r.status,
        detalhe: camposDaMidia.length
          ? `a API listou ${camposDaMidia.length} campo(s) do nó`
          : "metadata aceito mas não trouxe a lista de campos",
        formato: "lista de nomes",
        valor: camposDaMidia.join(", ") || null,
      });
    }
  }

  // ── 3. A DURAÇÃO, que é o denominador da retenção ──────────────────────────
  for (const campo of CAMPOS_DE_DURACAO) {
    const r = await consultar(reels[0].id, { fields: campo });
    if (r.erro) {
      reg({
        grupo: "duracao", reel: reels[0].id, item: campo, estado: "RECUSADA", http: r.status,
        detalhe: `Meta (${r.erro.codigo ?? "?"}${r.erro.subcodigo ? `/${r.erro.subcodigo}` : ""}): ${r.erro.mensagem}`,
        formato: null, valor: null,
      });
      continue;
    }
    const v = (r.corpo as Record<string, unknown>)?.[campo];
    reg({
      grupo: "duracao", reel: reels[0].id, item: campo,
      estado: v === undefined ? "ACEITA_SEM_DADO" : "ACEITA_COM_DADO",
      http: r.status,
      detalhe: v === undefined ? "campo aceito, mas não veio na resposta" : "campo respondeu",
      formato: v === undefined ? null : formatoDe(v),
      valor: v === undefined ? null : valorDe(v),
    });
    if (typeof v === "number" && campo !== "thumbnail_url") reels[0].duracaoSegundos = v;
  }

  // ── 4. AS MÉTRICAS, uma a uma ─────────────────────────────────────────────
  //
  // Os dois nomes do pedido vão em TODOS os Reels: a pergunta "funciona em
  // alguns e falha em outros?" só se responde medindo mais de um. As outras
  // vão só no primeiro — repetir cinco vezes a mesma recusa não acrescenta
  // resposta, e gasta chamada.
  const conhecido = new Set(vocabulario);
  const disponivelPorMetrica = new Map<string, EstadoDaMetrica[]>();

  for (const c of CANDIDATAS) {
    const todosOsReels = c.origem === "pedido_pelo_gui";
    const alvos = todosOsReels ? reels : reels.slice(0, 1);

    // Fora do vocabulário colhido: não gastamos chamada, e o relatório diz por
    // quê. É "não perguntada", que é um estado, e não "não existe".
    if (vocabulario.length && !conhecido.has(c.nome) && !todosOsReels) {
      naoPerguntada("metrica", c.nome,
        `fora do vocabulário que a Meta listou para Reel · ${c.origem} · responderia: ${c.responde}`);
      continue;
    }

    for (const reel of alvos) {
      const r = await consultar(`${reel.id}/insights`, { metric: c.nome });
      if (r.erro) {
        reg({
          grupo: "metrica", reel: reel.id, item: c.nome, estado: "RECUSADA", http: r.status,
          detalhe: `Meta (${r.erro.codigo ?? "?"}${r.erro.subcodigo ? `/${r.erro.subcodigo}` : ""}): ${r.erro.mensagem}`,
          formato: null, valor: null,
        });
      } else {
        const { achou, valor } = extrairValor(r.corpo);
        reg({
          grupo: "metrica", reel: reel.id, item: c.nome,
          estado: !achou ? "ACEITA_SEM_DADO" : valor === undefined || valor === null ? "ACEITA_SEM_DADO" : "ACEITA_COM_DADO",
          http: r.status,
          detalhe: achou ? "métrica aceita" : "métrica aceita, mas a resposta não trouxe série",
          formato: achou ? formatoDe(valor) : null,
          valor: achou ? valorDe(valor) : null,
        });
      }
      const estados = disponivelPorMetrica.get(c.nome) ?? [];
      estados.push(linhas[linhas.length - 1].estado);
      disponivelPorMetrica.set(c.nome, estados);
    }
  }

  // ── 4b. O QUE A META LISTOU E NÓS NÃO IMAGINÁVAMOS ────────────────────────
  //
  // Este bloco é a razão de colher o vocabulário. Sem ele, a sondagem só
  // confirma o que já suspeitávamos — e foi assim que `reels_skip_rate` passou
  // batido na primeira execução: a Meta a listou, e nós não a medimos porque
  // ela não estava na nossa lista.
  //
  // Os nomes que cheiram a retenção vão em TODOS os Reels: se uma taxa de
  // abandono existir, "funciona em alguns e falha em outros" é a diferença
  // entre implementar e não implementar.
  const jaMedido = new Set(CANDIDATAS.map((c) => c.nome));
  const inesperados = vocabulario.filter((n) => !jaMedido.has(n));
  for (const nome of inesperados) {
    const pareceRetencao = /skip|retention|watch|view_time|complete|drop/.test(nome);
    for (const reel of pareceRetencao ? reels : reels.slice(0, 1)) {
      const r = await consultar(`${reel.id}/insights`, { metric: nome });
      if (r.erro) {
        reg({
          grupo: "metrica", reel: reel.id, item: nome, estado: "RECUSADA", http: r.status,
          detalhe: `listada no vocabulário mas recusada · Meta (${r.erro.codigo ?? "?"}): ${r.erro.mensagem}`,
          formato: null, valor: null,
        });
        continue;
      }
      const { achou, valor } = extrairValor(r.corpo);
      reg({
        grupo: "metrica", reel: reel.id, item: nome,
        estado: !achou || valor === undefined || valor === null ? "ACEITA_SEM_DADO" : "ACEITA_COM_DADO",
        http: r.status,
        detalhe: achou
          ? "vinda do vocabulário da Meta — nome que não estava na nossa lista"
          : "métrica aceita, mas a resposta não trouxe série",
        formato: achou ? formatoDe(valor) : null,
        valor: achou ? valorDe(valor) : null,
      });
      const estados = disponivelPorMetrica.get(nome) ?? [];
      estados.push(linhas[linhas.length - 1].estado);
      disponivelPorMetrica.set(nome, estados);
    }
  }

  // ── 5. OS RECORTES, que dariam a curva ────────────────────────────────────
  //
  // Testados sobre a métrica de tempo médio que tenha respondido — pedir
  // recorte de uma métrica recusada mediria a recusa da métrica, não a do
  // recorte.
  const baseDoRecorte = CANDIDATAS
    .map((c) => c.nome)
    .find((n) => (disponivelPorMetrica.get(n) ?? []).includes("ACEITA_COM_DADO"));

  if (!baseDoRecorte) {
    for (const rec of RECORTES_CANDIDATOS) {
      naoPerguntada("recorte", rec, "nenhuma métrica respondeu — não há sobre o que aplicar recorte");
    }
  } else {
    for (const rec of RECORTES_CANDIDATOS) {
      const r = await consultar(`${reels[0].id}/insights`, { metric: baseDoRecorte, breakdown: rec });
      if (r.erro) {
        reg({
          grupo: "recorte", reel: reels[0].id, item: `${baseDoRecorte} · breakdown=${rec}`,
          estado: "RECUSADA", http: r.status,
          detalhe: `Meta (${r.erro.codigo ?? "?"}): ${r.erro.mensagem}`,
          formato: null, valor: null,
        });
        continue;
      }
      const item = (r.corpo as { data?: Array<Record<string, unknown>> })?.data?.[0];
      const recortes = item?.total_value as { breakdowns?: unknown[] } | undefined;
      const temRecorte = Array.isArray(recortes?.breakdowns) && recortes.breakdowns.length > 0;
      reg({
        grupo: "recorte", reel: reels[0].id, item: `${baseDoRecorte} · breakdown=${rec}`,
        estado: temRecorte ? "ACEITA_COM_DADO" : "ACEITA_SEM_DADO", http: r.status,
        detalhe: temRecorte
          ? "recorte aceito E devolveu faixas"
          : "recorte aceito mas devolveu o total sem faixas — aceitar não é recortar",
        formato: temRecorte ? formatoDe(recortes?.breakdowns) : null,
        valor: null,
      });
    }
  }

  return montar(linhas, reels, vocabulario, null, camposDaMidia);
}

// ─── O relatório ─────────────────────────────────────────────────────────────

const SELO: Record<EstadoDaMetrica, string> = {
  ACEITA_COM_DADO: "[SIM]",
  ACEITA_SEM_DADO: "[VAZIO]",
  RECUSADA: "[NÃO]",
  NAO_PERGUNTADA: "[—]",
};

/** Uma métrica é "disponível" quando respondeu COM DADO em pelo menos um Reel. */
function respondeu(linhas: LinhaDaSondagem[], nome: string): boolean {
  return linhas.some((l) => l.item === nome && l.estado === "ACEITA_COM_DADO");
}

/**
 * O veredito, derivado das linhas — nunca escrito à mão.
 *
 * SIM exige a curva: uma métrica que devolva faixas ou um recorte que
 * funcione. PARCIAL é tempo médio ou total sem a curva. NÃO é nenhum dos dois.
 *
 * Duração NÃO promove nem rebaixa o veredito, porque a pergunta era sobre
 * abandono, não sobre porcentagem. Mas ela decide o TETO do que se implementa,
 * e por isso viaja separada até o texto.
 */
export function vereditoDe(linhas: LinhaDaSondagem[]): {
  veredito: Veredito; temCurva: boolean; temTempoMedio: boolean; temTempoTotal: boolean; temDuracao: boolean;
} {
  const curvaPorMetrica = linhas.some(
    (l) => l.grupo === "metrica" && l.estado === "ACEITA_COM_DADO"
      && /retention|graph/.test(l.item),
  );
  const curvaPorRecorte = linhas.some((l) => l.grupo === "recorte" && l.estado === "ACEITA_COM_DADO");
  const temCurva = curvaPorMetrica || curvaPorRecorte;

  const temTempoMedio = respondeu(linhas, "ig_reels_avg_watch_time")
    || respondeu(linhas, "video_avg_time_watched");
  const temTempoTotal = respondeu(linhas, "ig_reels_video_view_total_time");
  const temDuracao = linhas.some(
    (l) => l.grupo === "duracao" && l.estado === "ACEITA_COM_DADO" && l.item !== "thumbnail_url",
  );

  return {
    veredito: temCurva ? "SIM" : temTempoMedio || temTempoTotal ? "PARCIAL" : "NAO",
    temCurva, temTempoMedio, temTempoTotal, temDuracao,
  };
}

function montar(
  linhas: LinhaDaSondagem[], reels: ReelSondado[], vocabulario: string[], bloqueio: string | null,
  camposDaMidia: string[] = [],
): SondagemDeRetencao {
  const v = vereditoDe(linhas);
  const out: string[] = [];

  out.push("RETENÇÃO / VÍDEO · sondagem de Reels");
  out.push(`${reels.length} Reel(s) medido(s) · ${linhas.length} linha(s) de resultado`);
  out.push("");

  if (bloqueio) {
    out.push(bloqueio);
    return {
      ok: false, reels, vocabulario, camposDaMidia, linhas, texto: out.join("\n"),
      veredito: "NAO", temCurva: false, temTempoMedio: false, temTempoTotal: false, temDuracao: false,
    };
  }

  // ── Por Reel ──────────────────────────────────────────────────────────────
  for (const reel of reels) {
    const doReel = linhas.filter((l) => l.reel === reel.id && l.grupo === "metrica");
    if (!doReel.length) continue;
    out.push(`REEL ${reel.id}`);
    out.push(`duração: ${reel.duracaoSegundos == null ? "não disponível pela API" : `${reel.duracaoSegundos}s`}`);
    out.push("");
    for (const l of doReel) {
      out.push(`${SELO[l.estado]} ${l.item}`);
      out.push(`     HTTP ${l.http ?? "—"} · ${l.detalhe}`);
      if (l.formato) out.push(`     formato: ${l.formato} · valor: ${l.valor ?? "–"}`);
    }
    out.push("");
  }

  // ── O vocabulário ─────────────────────────────────────────────────────────
  out.push("── VOCABULÁRIO QUE A META LISTOU ──");
  // O que a chamada do nome falso respondeu vem PRIMEIRO: se a Meta aceitou o
  // nome inventado, nada abaixo prova nada, e isso não pode ficar só na linha
  // estruturada enquanto o texto segue afirmando recusas como evidência.
  for (const l of linhas.filter((x) => x.grupo === "vocabulario")) {
    out.push(`${SELO[l.estado]} HTTP ${l.http ?? "—"} · ${l.detalhe}`);
  }
  if (!vocabulario.length) {
    out.push("A Meta não listou as métricas válidas ao recusar um nome falso.");
    out.push("Sem essa lista, a ausência de uma métrica aqui NÃO prova que ela não existe:");
    out.push("prova apenas que os nomes que testamos não responderam.");
  } else {
    out.push(`${vocabulario.length} nome(s), pela própria API — nada inventado por nós:`);
    for (const m of vocabulario) out.push(`  ${m}`);
  }
  out.push("");

  // ── Métricas disponíveis ──────────────────────────────────────────────────
  out.push("── MÉTRICAS DISPONÍVEIS ──");
  const nomes = Array.from(new Set(linhas.filter((l) => l.grupo === "metrica").map((l) => l.item)));
  const comDado = nomes.filter((n) => respondeu(linhas, n));
  if (!comDado.length) {
    out.push("Nenhuma. Nenhum dos nomes testados devolveu valor.");
  }
  for (const nome of comDado) {
    const doNome = linhas.filter((l) => l.item === nome);
    const ok = doNome.filter((l) => l.estado === "ACEITA_COM_DADO");
    const vazias = doNome.filter((l) => l.estado === "ACEITA_SEM_DADO");
    const negadas = doNome.filter((l) => l.estado === "RECUSADA");
    out.push("");
    out.push(nome);
    out.push(`  ✓ disponível · respondeu com dado em ${ok.length}/${doNome.length} Reel(s)`);
    out.push(`  formato: ${ok[0]?.formato ?? "—"}`);
    if (vazias.length) out.push(`  ⚠ aceita mas SEM dado em ${vazias.length} Reel(s) — medição vazia, não recusa`);
    if (negadas.length) out.push(`  ⚠ RECUSADA em ${negadas.length} Reel(s) — a métrica não é uniforme na conta`);
  }
  out.push("");

  // ── Recusadas e não perguntadas, separadas ────────────────────────────────
  const recusadas = nomes.filter((n) => !respondeu(linhas, n)
    && linhas.some((l) => l.item === n && l.estado === "RECUSADA"));
  const vaziasSempre = nomes.filter((n) => !respondeu(linhas, n)
    && linhas.some((l) => l.item === n && l.estado === "ACEITA_SEM_DADO"));
  const naoPerguntadas = linhas.filter((l) => l.estado === "NAO_PERGUNTADA");

  if (recusadas.length) {
    out.push("── RECUSADAS PELA META ──");
    for (const n of recusadas) {
      const l = linhas.find((x) => x.item === n && x.estado === "RECUSADA")!;
      out.push(`[NÃO] ${n}`);
      out.push(`     ${l.detalhe}`);
    }
    out.push("");
  }
  if (vaziasSempre.length) {
    out.push("── ACEITAS, MAS SEM DADO ──");
    out.push("A Meta reconhece o nome e não devolveu valor. É medição vazia, não recusa —");
    out.push("pode voltar a responder num Reel com mais tempo de vida.");
    for (const n of vaziasSempre) out.push(`[VAZIO] ${n}`);
    out.push("");
  }
  if (naoPerguntadas.length) {
    out.push("── NÃO PERGUNTADAS ──");
    for (const l of naoPerguntadas) out.push(`[—] ${l.item} · ${l.detalhe}`);
    out.push("");
  }

  // ── Duração ───────────────────────────────────────────────────────────────
  out.push("── CAMPOS QUE A API LISTOU PARA O NÓ ──");
  for (const l of linhas.filter((x) => x.grupo === "campos")) {
    out.push(`${SELO[l.estado]} HTTP ${l.http ?? "—"} · ${l.detalhe}`);
  }
  if (camposDaMidia.length) {
    const comCaraDeDuracao = camposDaMidia.filter((c) => /dur|length|segundo|time/i.test(c));
    out.push(`  ${camposDaMidia.join(", ")}`);
    out.push("");
    out.push(comCaraDeDuracao.length
      ? `  Candidatos a duração NESTA lista: ${comCaraDeDuracao.join(", ")} — testar.`
      : "  Nenhum campo de duração na lista da própria API. A ausência deixa de ser"
        + " sobre os nomes que chutamos e passa a ser sobre a API.");
  } else {
    out.push("  Sem a lista de campos, 'não existe duração' vale só para os nomes testados.");
  }
  out.push("");

  out.push("── DURAÇÃO DO REEL (o denominador) ──");
  const daDuracao = linhas.filter((l) => l.grupo === "duracao");
  for (const l of daDuracao) {
    out.push(`${SELO[l.estado]} ${l.item} · HTTP ${l.http ?? "—"} · ${l.detalhe}`);
  }
  out.push("");
  out.push(v.temDuracao
    ? "A duração está disponível: tempo médio assistido pode virar PORCENTAGEM."
    : "A duração NÃO está disponível: tempo médio assistido só pode ser mostrado em"
      + " segundos. '8 segundos' sem saber que o Reel tem 20 é um número sem denominador,"
      + " e transformá-lo em '40% de retenção' seria fabricar precisão.");
  out.push("");

  // ── Recortes ──────────────────────────────────────────────────────────────
  out.push("── RECORTES (o que daria a curva) ──");
  const doRecorte = linhas.filter((l) => l.grupo === "recorte");
  if (!doRecorte.length) out.push("Nenhum recorte testado.");
  for (const l of doRecorte) out.push(`${SELO[l.estado]} ${l.item} · HTTP ${l.http ?? "—"} · ${l.detalhe}`);
  out.push("");

  // ── A conferência que valida (ou invalida) a estimativa ───────────────────
  //
  // `tempo total ÷ tempo médio` devolve o número de espectadores que a Meta usou
  // como divisor. Se ele bater com uma métrica de views medida, as duas cobrem a
  // MESMA população e a divisão é legítima. Se não bater, qualquer média
  // derivada delas mistura conjuntos diferentes — e é melhor descobrir isso aqui
  // do que depois de a métrica estar na tela.
  const paresDeTempo = reels.map((reel) => {
    const medio = linhas.find((l) => l.reel === reel.id && l.item === "ig_reels_avg_watch_time"
      && l.estado === "ACEITA_COM_DADO");
    const total = linhas.find((l) => l.reel === reel.id && l.item === "ig_reels_video_view_total_time"
      && l.estado === "ACEITA_COM_DADO");
    const views = linhas.find((l) => l.reel === reel.id && /views/.test(l.item)
      && l.estado === "ACEITA_COM_DADO");
    const m = Number(medio?.valor), t = Number(total?.valor);
    if (!Number.isFinite(m) || !Number.isFinite(t) || m <= 0) return null;
    return { reel: reel.id, implicito: Math.round(t / m), medido: views ? Number(views.valor) : null, nomeViews: views?.item ?? null };
  }).filter((x): x is NonNullable<typeof x> => x !== null);

  if (paresDeTempo.length) {
    out.push("── CONFERÊNCIA: AS DUAS MÉTRICAS DE TEMPO FALAM DA MESMA GENTE? ──");
    out.push("tempo total ÷ tempo médio = quantos espectadores a Meta usou como divisor.");
    out.push("");
    for (const p of paresDeTempo) {
      const veredito = p.medido == null
        ? "sem métrica de views medida para conferir"
        : Math.abs(p.implicito - p.medido) <= Math.max(2, p.medido * 0.02)
          ? `BATE com ${p.nomeViews} (${p.medido}) — a divisão é legítima`
          : `NÃO BATE com ${p.nomeViews} (${p.medido}) — as duas cobrem populações diferentes`;
      out.push(`  ${p.reel}: ${p.implicito} espectadores implícitos · ${veredito}`);
    }
    out.push("");
  }

  // ── O que conseguimos medir ───────────────────────────────────────────────
  out.push("── O QUE CONSEGUIMOS MEDIR ──");
  out.push("");
  out.push("1. DIRETAMENTE");
  const diretas = comDado.length ? comDado.map((n) => `   ${n}`) : ["   nada"];
  out.push(...diretas);
  out.push("");
  out.push("2. APENAS ESTIMAR");
  if (v.temTempoMedio && v.temDuracao) {
    out.push("   retenção média em % = tempo médio assistido ÷ duração");
    out.push("   É média, não curva: diz quanto do Reel foi assistido em média,");
    out.push("   e não em que segundo cada pessoa saiu.");
  } else if (v.temTempoMedio) {
    out.push("   retenção média em SEGUNDOS (sem % — falta a duração)");
  } else if (v.temTempoTotal) {
    out.push("   tempo médio ≈ tempo total ÷ visualizações, se as duas cobrirem a MESMA janela.");
    out.push("   É estimativa e não medição: a divisão só vale se os dois números");
    out.push("   contarem o mesmo conjunto de espectadores.");
  } else {
    out.push("   nada");
  }
  out.push("");
  out.push("3. NÃO CONSEGUIMOS MEDIR");
  if (!v.temCurva) {
    out.push("   curva de abandono — em que segundo os espectadores param.");
    out.push("   Nenhuma métrica devolveu faixas, e nenhum recorte por percentual");
    out.push("   ou por tempo foi aceito.");
  } else {
    out.push("   (a curva respondeu — ver acima)");
  }
  out.push("");

  // ── A pergunta ────────────────────────────────────────────────────────────
  out.push("── A PERGUNTA: DÁ PARA MONTAR A CURVA DE ABANDONO? ──");
  out.push("");
  if (v.temCurva) {
    const fonte = linhas.find((l) => l.estado === "ACEITA_COM_DADO"
      && (l.grupo === "recorte" || /retention|graph/.test(l.item)));
    out.push("CONCLUSÃO A · SIM, existe dado por faixa.");
    out.push(`Vem de: ${fonte?.item ?? "—"} · formato ${fonte?.formato ?? "—"}`);
  } else if (v.temTempoMedio || v.temTempoTotal) {
    out.push("CONCLUSÃO B · NÃO existe curva de abandono.");
    out.push("Existem tempo médio e/ou tempo total, então dá para construir uma métrica");
    out.push("de RETENÇÃO MÉDIA — mas não identificar o segundo em que as pessoas saem.");
    out.push("A diferença é grande na prática: retenção média responde 'o Reel prende?',");
    out.push("e não 'onde ele perde'. Um gráfico com eixo em segundos, alimentado por");
    out.push("uma média, desenharia uma queda que ninguém mediu.");
  } else {
    out.push("CONCLUSÃO C · Nem tempo médio nem tempo total estão disponíveis.");
    out.push("A retenção não pode ser construída com os dados que esta conta entrega hoje.");
  }
  out.push("");
  out.push(`RETENÇÃO DOS REELS: [${v.veredito}]`);
  out.push("");
  out.push("O que dá para implementar com segurança:");
  if (v.temCurva) {
    out.push("  • a curva de abandono, com o eixo vindo das faixas que a API devolveu");
  } else if (v.temTempoMedio && v.temDuracao) {
    out.push("  • tempo médio assistido, em segundos, por Reel");
    out.push("  • retenção média em %, com a duração como denominador");
    out.push("  • ranking de Reels por retenção média");
    out.push("  • NÃO: gráfico com eixo de segundos sugerindo onde as pessoas saem");
  } else if (v.temTempoMedio) {
    out.push("  • tempo médio assistido, em SEGUNDOS, por Reel");
    out.push("  • comparação entre Reels pelo tempo médio");
    out.push("  • NÃO: porcentagem de retenção — falta a duração, o denominador");
    out.push("  • NÃO: curva de abandono");
  } else if (v.temTempoTotal) {
    out.push("  • tempo total assistido, por Reel");
    out.push("  • tempo médio ESTIMADO (total ÷ views), rotulado como estimativa");
    out.push("  • NÃO: retenção em %, nem curva");
  } else {
    out.push("  • nada. Manter o estado de 'dado futuro' que a página já mostra,");
    out.push("    que é honesto e não ocupa a tela com uma curva inventada.");
  }

  return {
    ok: true, reels, vocabulario, camposDaMidia, linhas, texto: out.join("\n"),
    veredito: v.veredito, temCurva: v.temCurva, temTempoMedio: v.temTempoMedio,
    temTempoTotal: v.temTempoTotal, temDuracao: v.temDuracao,
  };
}
