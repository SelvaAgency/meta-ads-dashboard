/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Dá para saber, pela API, que uma publicação foi impulsionada?
 * ─────────────────────────────────────────────────────────────────────────────
 *  O caso real é o MNBR: existem posts impulsionados pelo botão do próprio
 *  Instagram que NÃO aparecem na conta de anúncios conectada. Hoje a tela não
 *  distingue, e o efeito é silencioso e ruim — um post com alcance dez vezes
 *  maior que a média entra no ranking de "melhores publicações" como se o
 *  conteúdo tivesse funcionado, quando o que funcionou foi a verba.
 *
 *  ── Por que nenhum selo antes desta sondagem ───────────────────────────────
 *  Um selo errado é pior que selo nenhum: ele credencia a leitura. Se
 *  "impulsionado" aparecer em post orgânico, alguém corta um formato que
 *  funcionava; se sumir de post pago, o ranking continua mentindo — agora com
 *  aparência de auditado.
 *
 *  ── As três hipóteses, e por que são três chamadas ─────────────────────────
 *    CAMPO NA MÍDIA        `boost_ads_list`, `boost_eligibility_info` — se a
 *                          própria listagem já disser, é de graça: o coletor
 *                          pede o campo junto e pronto
 *    ARESTA DA CONTA       `/{ig}/media?...` cruzado com anúncios que apontam
 *                          para a mídia — depende de Ads, e o caso MNBR é
 *                          justamente o que não está lá
 *    INSIGHT SEPARADO      métricas de mídia que só existem em post promovido
 *                          (`promoted_*`) — presença da métrica como indício
 *
 *  A sondagem não conclui sozinha: ela devolve o que respondeu, e a decisão de
 *  criar (ou não) o indicador é de quem lê. Uma delas responder não basta —
 *  precisa responder de forma que separe orgânico de impulsionado, e isso só se
 *  confirma comparando um post SABIDAMENTE impulsionado com um que não é.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { sanitizar } from "./instagram";
import type { Consultar } from "./instagramSondagem";

/** Campos candidatos na própria mídia. Um por chamada: inválido derruba tudo. */
const CAMPOS_CANDIDATOS = [
  "boost_ads_list",
  "boost_eligibility_info",
  "is_shared_to_feed",
  "is_comment_enabled",
];

/** Métricas que, se existirem, só fazem sentido em publicação promovida. */
const METRICAS_CANDIDATAS = [
  "promoted_reach",
  "promoted_impressions",
  "ad_impressions",
  "follows",
  "profile_visits",
  "profile_activity",
];

export interface LinhaImpulsionado {
  grupo: "campo_na_midia" | "insight_de_midia" | "aresta_da_conta";
  item: string;
  disponivel: boolean;
  detalhe: string;
}

export interface SondagemImpulsionado {
  ok: boolean;
  /** A mídia usada como cobaia. */
  mediaId: string | null;
  linhas: LinhaImpulsionado[];
  /** Nenhuma pista encontrada = não dá para identificar hoje. */
  temPista: boolean;
  texto: string;
}

/** Descreve sem despejar: a pergunta é se o campo responde, não o que ele diz. */
function descrever(v: unknown): string {
  if (v === null || v === undefined) return "veio vazio";
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (typeof v === "string") return `texto (${v.length} caracteres)`;
  if (Array.isArray(v)) return `lista de ${v.length}${v.length ? " — TEM CONTEÚDO" : " (vazia)"}`;
  return `objeto com ${Object.keys(v as object).length} chave(s)`;
}

/**
 * Sonda uma conta.
 *
 * `mediaId` opcional serve para apontar um post SABIDAMENTE impulsionado — é a
 * única forma de a sondagem virar prova em vez de indício. Sem ele, ela mede a
 * publicação mais recente, o que responde "o campo existe?" mas não "o campo
 * distingue?".
 */
export async function sondarImpulsionado(
  consultar: Consultar, base: string, mediaId?: string,
): Promise<SondagemImpulsionado> {
  const linhas: LinhaImpulsionado[] = [];
  const reg = (
    grupo: LinhaImpulsionado["grupo"], item: string, disponivel: boolean, detalhe: string,
  ) => linhas.push({ grupo, item, disponivel, detalhe });
  const erroDe = (e: unknown) => sanitizar((e as Error).message ?? "erro sem mensagem");

  // ── Qual mídia medir ──────────────────────────────────────────────────────
  let alvo = mediaId ?? null;
  if (!alvo) {
    try {
      const r = await consultar<{ data?: Array<{ id?: string }> }>(
        `${base}/media`, { fields: "id", limit: "1" });
      alvo = r.data?.[0]?.id ?? null;
    } catch (e) {
      reg("campo_na_midia", "(listar mídia)", false, erroDe(e));
    }
  }

  if (!alvo) {
    return montar(linhas, null, "Nenhuma publicação para medir — a conta não devolveu mídias.");
  }

  // ── 1. Campos na própria mídia ────────────────────────────────────────────
  for (const campo of CAMPOS_CANDIDATOS) {
    try {
      const r = await consultar<Record<string, unknown>>(alvo, { fields: campo });
      const v = r[campo];
      reg("campo_na_midia", campo, v !== undefined,
        v === undefined ? "campo não veio na resposta" : descrever(v));
    } catch (e) {
      reg("campo_na_midia", campo, false, erroDe(e));
    }
  }

  // ── 2. Insights que só existem em promovido ───────────────────────────────
  for (const metrica of METRICAS_CANDIDATAS) {
    try {
      const r = await consultar<{ data?: Array<Record<string, unknown>> }>(
        `${alvo}/insights`, { metric: metrica });
      const item = r.data?.[0];
      const valor = (item?.values as Array<{ value?: unknown }> | undefined)?.[0]?.value
        ?? (item?.total_value as { value?: unknown } | undefined)?.value;
      reg("insight_de_midia", metrica, !!item,
        item ? `respondeu · ${descrever(valor)}` : "respondeu sem dados");
    } catch (e) {
      reg("insight_de_midia", metrica, false, erroDe(e));
    }
  }

  // ── 3. A aresta de anúncios da própria mídia ──────────────────────────────
  // Se ela existir e vier preenchida num post impulsionado pelo botão do
  // Instagram, é a resposta definitiva — e independe da conta de Ads conectada,
  // que é exatamente onde o caso MNBR não aparece.
  for (const aresta of ["branded_content_partner_promote", "boosted_ad_id"]) {
    try {
      const r = await consultar<Record<string, unknown>>(alvo, { fields: aresta });
      reg("aresta_da_conta", aresta, r[aresta] !== undefined,
        r[aresta] === undefined ? "campo não veio" : descrever(r[aresta]));
    } catch (e) {
      reg("aresta_da_conta", aresta, false, erroDe(e));
    }
  }

  return montar(linhas, alvo, null);
}

const TITULO: Record<LinhaImpulsionado["grupo"], string> = {
  campo_na_midia: "1. CAMPOS NA PRÓPRIA MÍDIA",
  insight_de_midia: "2. MÉTRICAS QUE SÓ EXISTEM EM PROMOVIDO",
  aresta_da_conta: "3. ARESTAS DE ANÚNCIO NA MÍDIA",
};

function montar(
  linhas: LinhaImpulsionado[], mediaId: string | null, bloqueio: string | null,
): SondagemImpulsionado {
  const disponiveis = linhas.filter((l) => l.disponivel);
  const temPista = disponiveis.length > 0;

  const out: string[] = [
    `sondagem de post impulsionado · ${disponiveis.length}/${linhas.length} itens responderam`,
    mediaId ? `mídia medida: ${mediaId}` : "nenhuma mídia medida",
    "",
  ];

  if (bloqueio) {
    out.push(bloqueio);
    return { ok: false, mediaId, linhas, temPista: false, texto: out.join("\n") };
  }

  for (const grupo of Object.keys(TITULO) as Array<LinhaImpulsionado["grupo"]>) {
    const doGrupo = linhas.filter((l) => l.grupo === grupo);
    if (!doGrupo.length) continue;
    out.push(`── ${TITULO[grupo]} ──`);
    for (const l of doGrupo) out.push(`[${l.disponivel ? "SIM" : "NÃO"}] ${l.item.padEnd(30)} ${l.detalhe}`);
    out.push("");
  }

  out.push("── O QUE ISSO SIGNIFICA ──");
  if (!temPista) {
    out.push("Nenhum campo respondeu. Pela API do Instagram, NÃO dá para saber que");
    out.push("uma publicação foi impulsionada — e por isso nenhum selo deve existir");
    out.push("na tela. Um selo errado credencia a leitura: 'impulsionado' num post");
    out.push("orgânico faria alguém cortar um formato que funcionava.");
  } else {
    out.push("Algum campo respondeu — mas responder NÃO é distinguir.");
    out.push("");
    out.push("Para virar selo, falta o passo que só uma comparação prova: rodar esta");
    out.push("mesma sondagem apontando um post SABIDAMENTE impulsionado e outro");
    out.push("sabidamente orgânico, e conferir que o campo muda entre os dois.");
    out.push("Um campo presente nos dois com o mesmo valor não identifica nada.");
    out.push("");
    out.push("Use o parâmetro de mídia para apontar o post pago do MNBR.");
  }

  return { ok: temPista, mediaId, linhas, temPista, texto: out.join("\n") };
}
