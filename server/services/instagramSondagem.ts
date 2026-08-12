/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Fase 0 — perguntar à Meta o que ela entrega, campo por campo
 * ─────────────────────────────────────────────────────────────────────────────
 *  Existe para o modelo de dados não nascer de suposição. Toda tabela desta
 *  frente tem colunas que só fazem sentido se a métrica correspondente responder,
 *  e a Meta renomeia e descontinua métrica com frequência — `impressions` já saiu
 *  para perfil e mídia. Construir o schema antes de medir é o caminho mais curto
 *  para colunas que nunca recebem valor e para uma tela que promete um número
 *  que a API não dá.
 *
 *  ── Uma chamada por item, de propósito ─────────────────────────────────────
 *  Pedir dez campos juntos e receber um erro responde "algo aí não existe", que
 *  é a resposta inútil. Um campo inválido derruba a chamada INTEIRA na Graph
 *  API, então em lote o item culpado fica escondido atrás dos nove inocentes.
 *  Individualmente cada item se acusa sozinho, com o código da Meta junto. É
 *  caro em chamadas e barato em dúvida — e roda uma vez, na mão.
 *
 *  ── O que a sondagem NÃO mostra ────────────────────────────────────────────
 *  Nenhum conteúdo de texto sai daqui. Biografia e legenda são reportadas como
 *  "texto (N caracteres)", nunca pelo valor: a pergunta é se o campo responde, e
 *  responder isso com o conteúdo transformaria um diagnóstico em vazamento.
 *  Métricas numéricas aparecem com o valor — são agregados públicos, e saber que
 *  `reach` voltou 0 em vez de 4.210 muda a conclusão.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { sanitizar } from "./instagram";

export type GrupoSondagem = "perfil" | "insights_perfil" | "midias" | "insights_midia" | "stories";

export interface LinhaSondagem {
  grupo: GrupoSondagem;
  item: string;
  disponivel: boolean;
  /** Valor (números) ou natureza (textos), ou o erro da Meta, sanitizado. */
  detalhe: string;
}

export interface Sondagem {
  ok: boolean;
  linhas: LinhaSondagem[];
  disponiveis: number;
  indisponiveis: number;
  /** Texto pronto para copiar. Nunca contém token nem conteúdo de texto. */
  texto: string;
}

/** Consulta de baixo nível da fonte. Cada fonte passa a sua. */
export type Consultar = <T>(caminho: string, params: Record<string, string>) => Promise<T>;

const CAMPOS_PERFIL = [
  "username", "name", "biography", "website", "profile_picture_url",
  "followers_count", "follows_count", "media_count",
];

const METRICAS_PERFIL = [
  "reach", "impressions", "profile_views", "accounts_engaged", "total_interactions",
  "views", "website_clicks", "profile_links_taps", "follower_count", "follows_and_unfollows",
];

const CAMPOS_MIDIA = [
  "id", "caption", "media_type", "media_product_type", "timestamp", "permalink",
  "media_url", "thumbnail_url", "like_count", "comments_count",
];

const METRICAS_MIDIA = [
  "reach", "impressions", "saved", "shares", "total_interactions", "views", "likes", "comments",
];

/**
 * Descreve um valor sem revelá-lo quando ele é texto.
 *
 * A regra é a diferença entre "este campo responde" e "aqui está o que ele diz".
 * A sondagem só precisa da primeira.
 */
function descrever(v: unknown): string {
  if (v === null || v === undefined) return "veio vazio";
  if (typeof v === "number") return `${v}`;
  if (typeof v === "boolean") return String(v);
  if (typeof v === "string") return `texto (${v.length} caracteres)`;
  if (Array.isArray(v)) return `lista de ${v.length}`;
  return "objeto";
}

/**
 * Sonda uma conta inteira.
 *
 * `base` é o prefixo do caminho: o id do Instagram na fonte da agência, `"me"`
 * na fonte por login. É a única diferença entre as duas APIs neste fluxo, e é
 * por isso que a sondagem serve às duas sem saber qual está usando.
 */
export async function sondarInstagram(consultar: Consultar, base: string): Promise<Sondagem> {
  const linhas: LinhaSondagem[] = [];
  const reg = (grupo: GrupoSondagem, item: string, disponivel: boolean, detalhe: string) =>
    linhas.push({ grupo, item, disponivel, detalhe });

  const erroDe = (e: unknown) => sanitizar((e as Error).message ?? "erro sem mensagem");

  // ── Perfil ────────────────────────────────────────────────────────────────
  for (const campo of CAMPOS_PERFIL) {
    try {
      const r = await consultar<Record<string, unknown>>(base, { fields: campo });
      const v = r[campo];
      reg("perfil", campo, v !== undefined, v === undefined ? "campo não veio na resposta" : descrever(v));
    } catch (e) {
      reg("perfil", campo, false, erroDe(e));
    }
  }

  // ── Insights de perfil ────────────────────────────────────────────────────
  for (const metrica of METRICAS_PERFIL) {
    try {
      const r = await consultar<{ data?: Array<Record<string, unknown>> }>(
        `${base}/insights`, { metric: metrica, period: "day", metric_type: "total_value" });
      const item = r.data?.[0];
      const valor = (item?.total_value as { value?: unknown } | undefined)?.value;
      reg("insights_perfil", metrica, !!item,
        item ? `respondeu · valor ${descrever(valor)}` : "respondeu sem dados");
    } catch (e) {
      reg("insights_perfil", metrica, false, erroDe(e));
    }
  }

  // ── Mídias ────────────────────────────────────────────────────────────────
  let idDaMidia: string | null = null;
  for (const campo of CAMPOS_MIDIA) {
    try {
      const r = await consultar<{ data?: Array<Record<string, unknown>> }>(
        `${base}/media`, { fields: campo, limit: "1" });
      const m = r.data?.[0];
      if (campo === "id" && m?.id) idDaMidia = String(m.id);
      reg("midias", campo, !!m && m[campo] !== undefined,
        !m ? "nenhuma publicação retornada" : m[campo] === undefined ? "campo não veio" : descrever(m[campo]));
    } catch (e) {
      reg("midias", campo, false, erroDe(e));
    }
  }

  // ── Insights da publicação mais recente ───────────────────────────────────
  if (!idDaMidia) {
    reg("insights_midia", "(todas)", false, "sem publicação para medir — a conta não retornou mídias.");
  } else {
    for (const metrica of METRICAS_MIDIA) {
      try {
        const r = await consultar<{ data?: Array<Record<string, unknown>> }>(
          `${idDaMidia}/insights`, { metric: metrica });
        const item = r.data?.[0];
        const valor = (item?.values as Array<{ value?: unknown }> | undefined)?.[0]?.value
          ?? (item?.total_value as { value?: unknown } | undefined)?.value;
        reg("insights_midia", metrica, !!item,
          item ? `respondeu · valor ${descrever(valor)}` : "respondeu sem dados");
      } catch (e) {
        reg("insights_midia", metrica, false, erroDe(e));
      }
    }
  }

  // ── Stories ───────────────────────────────────────────────────────────────
  // Só devolve o que está NO AR: lista vazia é resposta válida (nenhum story
  // ativo agora), e não falta de permissão. Os dois casos são distinguidos aqui
  // porque o coletor vai depender exatamente dessa diferença.
  try {
    const r = await consultar<{ data?: unknown[] }>(`${base}/stories`, { fields: "id,media_type,timestamp" });
    const n = r.data?.length ?? 0;
    reg("stories", "listar stories ativos", true,
      n > 0 ? `respondeu · ${n} no ar agora` : "respondeu · nenhum no ar agora (endpoint funciona)");
  } catch (e) {
    reg("stories", "listar stories ativos", false, erroDe(e));
  }

  const disponiveis = linhas.filter((l) => l.disponivel).length;
  return {
    ok: disponiveis > 0,
    linhas,
    disponiveis,
    indisponiveis: linhas.length - disponiveis,
    texto: montarTexto(linhas, disponiveis),
  };
}

const TITULO: Record<GrupoSondagem, string> = {
  perfil: "PERFIL",
  insights_perfil: "INSIGHTS DE PERFIL",
  midias: "CAMPOS DE MÍDIA",
  insights_midia: "INSIGHTS DE MÍDIA",
  stories: "STORIES",
};

function montarTexto(linhas: LinhaSondagem[], disponiveis: number): string {
  const out: string[] = [
    `sondagem de Redes Sociais · ${disponiveis}/${linhas.length} itens disponíveis`,
    "",
  ];
  for (const grupo of Object.keys(TITULO) as GrupoSondagem[]) {
    const doGrupo = linhas.filter((l) => l.grupo === grupo);
    if (!doGrupo.length) continue;
    out.push(`── ${TITULO[grupo]} ──`);
    for (const l of doGrupo) {
      out.push(`[${l.disponivel ? "SIM" : "NÃO"}] ${l.item.padEnd(22)} ${l.detalhe}`);
    }
    out.push("");
  }
  out.push("Nenhum token e nenhum conteúdo de texto aparece acima — textos são");
  out.push("reportados só pelo tamanho.");
  return out.join("\n");
}
