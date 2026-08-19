/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  A Admin API da Anthropic — uso e custo da organização
 * ─────────────────────────────────────────────────────────────────────────────
 *  Só servidor. A chave nunca sai daqui: não vai para o banco, não vai para o
 *  frontend, não entra em log. Toda mensagem de erro passa por `sanitizar`,
 *  que corta qualquer sequência longa — texto de erro de API é como credencial
 *  vaza para tela.
 *
 *  ── Duas chaves, e elas não se substituem ──────────────────────────────────
 *  `ANTHROPIC_API_KEY` gera texto. `ANTHROPIC_ADMIN_KEY` lê uso e custo. São
 *  poderes diferentes, e usar uma pela outra daria acesso administrativo a quem
 *  só precisa gerar texto — ou faria o relatório falhar com 401 sem ninguém
 *  entender por quê. Este módulo lê APENAS a segunda, e há teste para isso.
 *
 *  ── Os tetos de bucket são da API, e não nossos ────────────────────────────
 *  `1d` no máximo 31 buckets, `1h` 168, `1m` 1440. Pedir mais devolve erro —
 *  então a janela grande vem por PAGINAÇÃO, e não por um `limit` otimista.
 *
 *  ── O que a API NÃO entrega ────────────────────────────────────────────────
 *  Contagem de chamadas. Nem no uso, nem no custo. Quantas chamadas o Spaces
 *  fez é pergunta que só `ai_geracoes` responde, e este módulo nunca vai
 *  inventar um número para preencher a coluna.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { ENV } from "../_core/env";
import { sanitizar } from "./instagram";

const BASE = "https://api.anthropic.com/v1/organizations";
const VERSAO = "2023-06-01";
/** A doc pede User-Agent em integrações — ajuda a Anthropic a ler o padrão. */
const AGENTE = "SelvaSpaces/1.0 (https://spaces.selva.agency)";
const TIMEOUT_MS = 30_000;

/** Tetos da própria API. Pedir mais é erro, não truncamento. */
export const TETO_DE_BUCKETS = { "1d": 31, "1h": 168, "1m": 1440 } as const;
export type Granularidade = keyof typeof TETO_DE_BUCKETS;

/** Páginas máximas por consulta — trava contra cursor que nunca termina. */
const MAX_PAGINAS = 12;

export const temChaveAdmin = (): boolean => !!ENV.anthropicAdminKey;

export interface RespostaAdmin<T> {
  status: number;
  corpo: T | null;
  erro: string | null;
}

/**
 * Uma chamada crua, que NÃO estoura.
 *
 * Devolve status, corpo e erro lado a lado: numa sondagem o HTTP e o código da
 * recusa SÃO o resultado, e uma exceção obrigaria cada chamador a reconstruir
 * isso do texto.
 */
async function chamar<T>(caminho: string, params: URLSearchParams): Promise<RespostaAdmin<T>> {
  if (!ENV.anthropicAdminKey) {
    return { status: 0, corpo: null, erro: "ANTHROPIC_ADMIN_KEY não configurada neste ambiente." };
  }
  let resp: Response;
  try {
    resp = await fetch(`${BASE}/${caminho}?${params}`, {
      headers: {
        "x-api-key": ENV.anthropicAdminKey,
        "anthropic-version": VERSAO,
        "user-agent": AGENTE,
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    // Falha de rede não tem HTTP. `0` diz isso sem inventar status plausível.
    return { status: 0, corpo: null, erro: sanitizar((e as Error)?.message ?? "falha de rede", ENV.anthropicAdminKey) };
  }

  const texto = await resp.text();
  let dados: unknown;
  try {
    dados = JSON.parse(texto);
  } catch {
    return { status: resp.status, corpo: null, erro: `resposta não é JSON (HTTP ${resp.status})` };
  }
  const err = (dados as { error?: { message?: string; type?: string } })?.error;
  if (err) {
    return {
      status: resp.status, corpo: null,
      erro: `${err.type ?? "erro"}: ${sanitizar(err.message ?? "", ENV.anthropicAdminKey)}`,
    };
  }
  if (!resp.ok) {
    return { status: resp.status, corpo: null, erro: `HTTP ${resp.status} ${resp.statusText}` };
  }
  return { status: resp.status, corpo: dados as T, erro: null };
}

// ─── Os formatos que a API documenta ─────────────────────────────────────────
//
// Tipados pela doc, mas NADA aqui assume que o campo veio: a sondagem lê o JSON
// real e reporta o que chegou. Se a API divergir, a implementação segue o que
// ela devolve — não o que a documentação promete.

export interface BucketDeUso {
  starting_at: string;
  ending_at: string;
  results: Array<{
    uncached_input_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation?: { ephemeral_5m_input_tokens?: number; ephemeral_1h_input_tokens?: number };
    output_tokens?: number;
    model?: string | null;
    api_key_id?: string | null;
    workspace_id?: string | null;
    service_tier?: string | null;
    context_window?: string | null;
    server_tool_use?: { web_search_requests?: number };
  }>;
}

export interface BucketDeCusto {
  starting_at: string;
  ending_at: string;
  results: Array<{
    amount?: string;
    currency?: string;
    cost_type?: string | null;
    description?: string | null;
    model?: string | null;
    service_tier?: string | null;
    token_type?: string | null;
    workspace_id?: string | null;
    context_window?: string | null;
  }>;
}

interface Pagina<T> { data?: T[]; has_more?: boolean; next_page?: string | null }

/**
 * Percorre todas as páginas de um relatório.
 *
 * `has_more` + `next_page` até acabar, com teto de páginas: um cursor que não
 * avança viraria laço infinito segurando a requisição inteira, e o sintoma na
 * tela seria "a página não carrega" — sem pista nenhuma da causa.
 */
async function paginar<T>(
  caminho: string, base: URLSearchParams,
): Promise<{ buckets: T[]; paginas: number; erro: string | null; status: number }> {
  const buckets: T[] = [];
  let cursor: string | null = null;
  let paginas = 0;
  let status = 0;

  do {
    const params = new URLSearchParams(base);
    if (cursor) params.set("page", cursor);
    const r = await chamar<Pagina<T>>(caminho, params);
    status = r.status;
    if (r.erro) return { buckets, paginas, erro: r.erro, status };
    buckets.push(...(r.corpo?.data ?? []));
    cursor = r.corpo?.has_more ? (r.corpo.next_page ?? null) : null;
    paginas += 1;
  } while (cursor && paginas < MAX_PAGINAS);

  return { buckets, paginas, erro: null, status };
}

const rfc = (dia: string, fimDoDia = false) =>
  `${dia}T${fimDoDia ? "23:59:59" : "00:00:00"}Z`;

/**
 * Uso da organização no período, agrupado por modelo.
 *
 * Agrupar por modelo desde já porque é o único eixo da Anthropic que também
 * existe no Spaces (`ai_geracoes.modelo`) — é por ele que a comparação tem
 * chance de ser maçã com maçã. `api_key_id` e `workspace_id` viriam junto, mas
 * hoje não há nada do nosso lado para cruzá-los.
 */
export function usoDaOrganizacao(inicio: string, fim: string, bucket: Granularidade = "1d") {
  const p = new URLSearchParams({
    starting_at: rfc(inicio),
    ending_at: rfc(fim, true),
    bucket_width: bucket,
    limit: String(TETO_DE_BUCKETS[bucket]),
  });
  p.append("group_by[]", "model");
  return paginar<BucketDeUso>("usage_report/messages", p);
}

/**
 * Custo da organização no período.
 *
 * `1d` é a ÚNICA granularidade que o endpoint aceita, e `description` é o que
 * traz modelo e tipo de token junto — sem ele o custo vem num número só, sem
 * como saber de onde veio.
 */
export function custoDaOrganizacao(inicio: string, fim: string) {
  const p = new URLSearchParams({
    starting_at: rfc(inicio),
    ending_at: rfc(fim, true),
    bucket_width: "1d",
    limit: "31",
  });
  p.append("group_by[]", "description");
  return paginar<BucketDeCusto>("cost_report", p);
}

/** A chamada crua, só para a sondagem — ela precisa ver o JSON como veio. */
export const chamarCru = chamar;


// ─── A leitura normalizada, com cache ────────────────────────────────────────

export interface DiaAnthropic {
  dia: string;
  uncachedInput: number;
  cacheRead: number;
  cacheCreation: number;
  output: number;
  /** Custo do dia em CENTAVOS de USD, como a API devolve. */
  centavos: number;
}

export interface ModeloAnthropic {
  modelo: string;
  uncachedInput: number;
  cacheRead: number;
  cacheCreation: number;
  output: number;
  centavos: number;
}

export interface ConsumoAnthropic {
  dias: DiaAnthropic[];
  modelos: ModeloAnthropic[];
  totalCentavos: number;
  moeda: string;
  /** Quando esta leitura saiu da Anthropic — a tela mostra. */
  atualizadoEm: string;
  /** `true` quando veio do cache em vez de uma chamada nova. */
  doCache: boolean;
  erro: string | null;
}

/**
 * Cache em memória, por período.
 *
 * O dado da Anthropic aparece em ~5 minutos e a doc recomenda no máximo um
 * polling por minuto. Dez minutos é folgado o suficiente para uma tela que
 * alguém recarrega algumas vezes seguidas, e curto o bastante para o número não
 * envelhecer sem ninguém notar. Em memória e não no banco: é cache de leitura
 * externa, e perdê-lo num restart custa uma chamada.
 */
const TTL_MS = 10 * 60_000;
const cache = new Map<string, { quando: number; valor: ConsumoAnthropic }>();

/** Descarta o custo que a doc avisa não estar no endpoint (Priority Tier). */
const centavosDe = (a?: string) => {
  const n = Number(a ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Uso e custo do período, numa leitura só.
 *
 * Duas chamadas à Anthropic no máximo — e nenhuma quando o cache vale. A página
 * inteira come desta função: um `fetch` por gráfico multiplicaria por seis o
 * consumo da API que a página existe para medir.
 */
export async function consumoAnthropic(
  inicio: string, fim: string, forcar = false,
): Promise<ConsumoAnthropic> {
  const chave = `${inicio}|${fim}`;
  const guardado = cache.get(chave);
  if (!forcar && guardado && Date.now() - guardado.quando < TTL_MS) {
    return { ...guardado.valor, doCache: true };
  }

  const [uso, custo] = await Promise.all([
    usoDaOrganizacao(inicio, fim, "1d"),
    custoDaOrganizacao(inicio, fim),
  ]);

  const erro = uso.erro ?? custo.erro;
  const porDia = new Map<string, DiaAnthropic>();
  const porModelo = new Map<string, ModeloAnthropic>();

  const dia = (d: string) => {
    const k = d.slice(0, 10);
    if (!porDia.has(k)) {
      porDia.set(k, { dia: k, uncachedInput: 0, cacheRead: 0, cacheCreation: 0, output: 0, centavos: 0 });
    }
    return porDia.get(k)!;
  };
  const modelo = (m: string) => {
    if (!porModelo.has(m)) {
      porModelo.set(m, { modelo: m, uncachedInput: 0, cacheRead: 0, cacheCreation: 0, output: 0, centavos: 0 });
    }
    return porModelo.get(m)!;
  };

  for (const b of uso.buckets) {
    const d = dia(b.starting_at);
    for (const r of b.results ?? []) {
      // As quatro categorias entram SEPARADAS e nunca somadas entre si: a
      // Anthropic cobra preços diferentes por cada uma, e juntá-las aqui faria
      // a tela perder a distinção que a própria API se deu ao trabalho de fazer.
      const cria = (r.cache_creation?.ephemeral_1h_input_tokens ?? 0)
        + (r.cache_creation?.ephemeral_5m_input_tokens ?? 0);
      d.uncachedInput += r.uncached_input_tokens ?? 0;
      d.cacheRead += r.cache_read_input_tokens ?? 0;
      d.cacheCreation += cria;
      d.output += r.output_tokens ?? 0;
      if (r.model) {
        const m = modelo(r.model);
        m.uncachedInput += r.uncached_input_tokens ?? 0;
        m.cacheRead += r.cache_read_input_tokens ?? 0;
        m.cacheCreation += cria;
        m.output += r.output_tokens ?? 0;
      }
    }
  }

  let moeda = "USD";
  for (const b of custo.buckets) {
    const d = dia(b.starting_at);
    for (const r of b.results ?? []) {
      const c = centavosDe(r.amount);
      d.centavos += c;
      if (r.currency) moeda = r.currency;
      if (r.model) modelo(r.model).centavos += c;
    }
  }

  const valor: ConsumoAnthropic = {
    dias: Array.from(porDia.values()).sort((a, b) => a.dia.localeCompare(b.dia)),
    modelos: Array.from(porModelo.values()).sort((a, b) => b.centavos - a.centavos),
    totalCentavos: Array.from(porDia.values()).reduce((n, d) => n + d.centavos, 0),
    moeda,
    atualizadoEm: new Date().toISOString(),
    doCache: false,
    erro,
  };
  // Erro não entra no cache: o próximo acesso tenta de novo em vez de repetir a
  // falha por dez minutos.
  if (!erro) cache.set(chave, { quando: Date.now(), valor });
  return valor;
}
