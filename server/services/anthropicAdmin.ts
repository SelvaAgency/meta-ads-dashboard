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
import { logger } from "../logger";
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
    /*
     * A JANELA vai junto da mensagem.
     *
     * "Invalid date range" sem dizer qual intervalo foi enviado custou duas
     * rodadas de investigação: as datas eram montadas corretamente numa camada
     * e alinhadas por fora, na API, e nenhum dos dois lados aparecia. Só os
     * parâmetros de janela — que não são dado de ninguém, nem chave.
     */
    const janela = `${params.get("starting_at")} → ${params.get("ending_at")}`;
    logger.warn(`[Anthropic] ${caminho} recusou · janela ${janela} · ${err.type ?? "erro"}`);
    return {
      status: resp.status, corpo: null,
      erro: `${err.type ?? "erro"}: ${sanitizar(err.message ?? "", ENV.anthropicAdminKey)}`
        + ` (janela enviada: ${janela})`,
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

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  A janela da consulta — e o teto no último dia FECHADO
 * ─────────────────────────────────────────────────────────────────────────────
 *  Duas correções em camadas diferentes, e a segunda só apareceu quando a
 *  primeira não resolveu.
 *
 *  ── 1. O limite superior é exclusivo ───────────────────────────────────────
 *  Isto já foi `${fim}T23:59:59Z`. Com `bucket_width=1d` a API alinha os
 *  limites ao início do dia UTC, então 23:59:59 do dia 19 virava 19T00:00:00Z e
 *  o bucket do dia 19 ficava de fora — a sondagem devolveu 6 buckets para um
 *  intervalo de 7 dias. Passou a ser o início do dia SEGUINTE.
 *
 *  ── 2. O fim não pode passar do último dia fechado ─────────────────────────
 *  A correção acima não resolveu "Hoje", e o motivo é que a API não valida o
 *  intervalo que recebe: ela o ALINHA primeiro e valida depois. Um `ending_at`
 *  no futuro é recuado até a última fronteira de bucket completa — o início de
 *  hoje. Para um período de um dia só, que começa exatamente aí, os dois lados
 *  colapsam no mesmo instante e a resposta é `Invalid date range: ending date
 *  must be after starting date`.
 *
 *  É por isso que só "Hoje" quebrava: em 7d ou 30d o início fica dias atrás, e
 *  o recuo do fim ainda deixa um intervalo válido — só perde o dia corrente,
 *  em silêncio.
 *
 *  A regra passa a ser explícita: `ending_at` nunca ultrapassa o início do dia
 *  de hoje em UTC. Quando isso esvazia a janela, NÃO se chama a API — o período
 *  pedido está inteiro dentro do dia aberto, e a resposta certa é "ainda não
 *  disponível", não um erro.
 * ─────────────────────────────────────────────────────────────────────────────
 */
const inicioDoDia = (dia: string) => `${dia}T00:00:00Z`;

/**
 * O dia seguinte, em UTC.
 *
 * `Date.UTC` a partir das partes, e não `new Date(dia)`: a segunda interpreta
 * no fuso local em alguns runtimes, e a virada de mês passaria a depender de
 * onde o servidor está.
 */
export function diaSeguinte(dia: string): string {
  const [a, m, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(a, (m ?? 1) - 1, (d ?? 1) + 1)).toISOString().slice(0, 10);
}

/** Hoje em UTC — o mesmo referencial dos buckets da Anthropic. */
export const hojeUTC = (): string => new Date().toISOString().slice(0, 10);

export type Janela =
  | { ok: true; starting_at: string; ending_at: string; /** `true` quando o fim
      pedido foi recuado por incluir o dia aberto. */ recuado: boolean }
  /** O período está inteiro no dia aberto: não há o que perguntar ainda. */
  | { ok: false; motivo: "dia_aberto"; erro: string }
  /** Entrada malformada ou invertida — isso é erro de quem chamou. */
  | { ok: false; motivo: "invalido"; erro: string };

export function janelaDaConsulta(inicio: string, fim: string, hoje = hojeUTC()): Janela {
  const formato = /^\d{4}-\d{2}-\d{2}$/;
  if (!formato.test(inicio) || !formato.test(fim)) {
    return { ok: false, motivo: "invalido",
      erro: `Intervalo mal formado: "${inicio}" a "${fim}" (esperado AAAA-MM-DD).` };
  }
  if (fim < inicio) {
    return { ok: false, motivo: "invalido",
      erro: `Intervalo invertido: fim (${fim}) é anterior ao início (${inicio}).` };
  }

  const starting_at = inicioDoDia(inicio);
  // O teto: o início de hoje é a última fronteira de bucket que a API tem
  // fechada. Pedir além dela é pedir um bucket que ainda não existe.
  const tetoExclusivo = inicioDoDia(hoje);
  const pedido = inicioDoDia(diaSeguinte(fim));
  const ending_at = pedido > tetoExclusivo ? tetoExclusivo : pedido;

  if (!(ending_at > starting_at)) {
    return {
      ok: false, motivo: "dia_aberto",
      erro: `O período pedido (${inicio} a ${fim}) está dentro do dia ainda não fechado pela Anthropic.`,
    };
  }
  return { ok: true, starting_at, ending_at, recuado: pedido > tetoExclusivo };
}

/**
 * Acrescenta ao resultado da paginação o que a JANELA sabe.
 *
 * `recuado` diz que o fim pedido foi cortado no último dia fechado; `diaAberto`
 * diz que não houve chamada porque o período inteiro está no dia aberto. São
 * dois fatos sobre a PERGUNTA, e não sobre a resposta — por isso não saem de
 * `paginar`.
 */
async function comMeta<T>(
  janela: Extract<Janela, { ok: true }>,
  promessa: Promise<{ buckets: T[]; paginas: number; erro: string | null; status: number }>,
) {
  const r = await promessa;
  return { ...r, diaAberto: false, recuado: janela.recuado };
}

/**
 * O log do request — sem chave, sem cabeçalho, sem resposta.
 *
 * Existe porque a causa de "só Hoje quebra" levou duas rodadas para aparecer:
 * as datas eram montadas certas numa camada e alinhadas por fora na API, e
 * nenhum dos dois lados era visível. Só os parâmetros de janela, que não são
 * dado de ninguém.
 */
function registrarJanela(caminho: string, p: URLSearchParams, extra = "") {
  logger.info(
    `[Anthropic] ${caminho} · starting_at=${p.get("starting_at")} `
    + `ending_at=${p.get("ending_at")} bucket=${p.get("bucket_width")} `
    + `limit=${p.get("limit")} tz=UTC${extra}`,
  );
}

/**
 * Uso da organização no período, agrupado por modelo.
 *
 * Agrupar por modelo desde já porque é o único eixo da Anthropic que também
 * existe no Spaces (`ai_geracoes.modelo`) — é por ele que a comparação tem
 * chance de ser maçã com maçã. `api_key_id` e `workspace_id` viriam junto, mas
 * hoje não há nada do nosso lado para cruzá-los.
 */
export function usoDaOrganizacao(inicio: string, fim: string, bucket: Granularidade = "1d") {
  const janela = janelaDaConsulta(inicio, fim);
  if (!janela.ok) {
    /*
     * Sem chamada, e por dois motivos diferentes que NÃO se confundem:
     *
     *   invalido    entrada torta — é erro, e vira erro na tela
     *   dia_aberto  o período está dentro do dia que a Anthropic ainda não
     *               fechou. Não é erro: é ausência de dado, e a chamada só
     *               devolveria o mesmo alinhamento com uma viagem de rede.
     */
    return Promise.resolve({
      buckets: [], paginas: 0, status: 0,
      erro: janela.motivo === "invalido" ? janela.erro : null,
      diaAberto: janela.motivo === "dia_aberto",
      recuado: false,
    });
  }
  const p = new URLSearchParams({
    starting_at: janela.starting_at,
    ending_at: janela.ending_at,
    bucket_width: bucket,
    limit: String(TETO_DE_BUCKETS[bucket]),
  });
  p.append("group_by[]", "model");
  registrarJanela("usage_report/messages", p);
  return comMeta(janela, paginar<BucketDeUso>("usage_report/messages", p));
}

/**
 * Custo da organização no período.
 *
 * `1d` é a ÚNICA granularidade que o endpoint aceita, e `description` é o que
 * traz modelo e tipo de token junto — sem ele o custo vem num número só, sem
 * como saber de onde veio.
 */
export function custoDaOrganizacao(inicio: string, fim: string) {
  const janela = janelaDaConsulta(inicio, fim);
  if (!janela.ok) {
    /*
     * Sem chamada, e por dois motivos diferentes que NÃO se confundem:
     *
     *   invalido    entrada torta — é erro, e vira erro na tela
     *   dia_aberto  o período está dentro do dia que a Anthropic ainda não
     *               fechou. Não é erro: é ausência de dado, e a chamada só
     *               devolveria o mesmo alinhamento com uma viagem de rede.
     */
    return Promise.resolve({
      buckets: [], paginas: 0, status: 0,
      erro: janela.motivo === "invalido" ? janela.erro : null,
      diaAberto: janela.motivo === "dia_aberto",
      recuado: false,
    });
  }
  const p = new URLSearchParams({
    starting_at: janela.starting_at,
    ending_at: janela.ending_at,
    bucket_width: "1d",
    limit: "31",
  });
  p.append("group_by[]", "description");
  registrarJanela("cost_report", p);
  return comMeta(janela, paginar<BucketDeCusto>("cost_report", p));
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
  /** Falha de integração. Diferente de custo pendente — ver abaixo. */
  erro: string | null;
  /**
   * O último dia que o relatório de CUSTO cobriu. `null` quando nenhum.
   *
   * É a resposta de "até onde o dado financeiro está atualizado", e a tela
   * mostra a data em vez de deixar o usuário adivinhar.
   */
  ultimoDiaComCusto: string | null;
  /**
   * `true` quando o período pedido vai além do último dia com custo fechado.
   *
   * NÃO é erro: a chamada funcionou. É a Anthropic ainda não tendo processado o
   * dia. A tela precisa dizer isso em vez de mostrar US$ 0.
   */
  custoPendente: boolean;
  /** O último dia pedido — para a tela poder comparar com o disponível. */
  diaPedido: string;
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
  /**
   * Os dias que o relatório de CUSTO devolveu — e não os que o de uso devolveu.
   *
   * Os dois têm latências diferentes: o uso aparece em minutos, o custo depois
   * do fechamento do dia. Rastreá-los juntos faria um dia com tokens e sem
   * custo parecer um dia de custo zero.
   */
  const diasComCusto = new Set<string>();
  for (const b of custo.buckets) {
    const d = dia(b.starting_at);
    diasComCusto.add(b.starting_at.slice(0, 10));
    for (const r of b.results ?? []) {
      const c = centavosDe(r.amount);
      d.centavos += c;
      if (r.currency) moeda = r.currency;
      if (r.model) modelo(r.model).centavos += c;
    }
  }

  /**
   * ───────────────────────────────────────────────────────────────────────────
   *  Custo AUSENTE não é custo ZERO
   * ───────────────────────────────────────────────────────────────────────────
   *  A Cost API trabalha com buckets de dia fechado, e o de hoje só aparece
   *  depois do processamento. Com a janela válida a chamada devolve 200 — mas
   *  sem o bucket do dia corrente, e o total fica em zero.
   *
   *  Zero na tela seria lido como "não gastamos nada hoje", que é o oposto de
   *  "a Anthropic ainda não fechou o dia". São estados diferentes, e o terceiro
   *  — falha de integração — é diferente dos dois.
   *
   *  A detecção NÃO pergunta "o período é hoje?". Ela compara o último dia
   *  PEDIDO com o último dia que o relatório de custo devolveu: qualquer
   *  período que termine num dia ainda não fechado cai aqui, inclusive um
   *  personalizado. E o dia que a API passar a entregar mais cedo deixa de
   *  cair, sem ninguém mexer em nada.
   */
  const ultimoComCusto = Array.from(diasComCusto).sort().pop() ?? null;
  /*
   * Pendente quando a JANELA foi recuada ou nem chegou a existir.
   *
   * O sinal vem da pergunta, e não da resposta: `recuado` diz que o fim pedido
   * incluía o dia aberto, e `diaAberto` diz que o período inteiro estava nele.
   * Nos dois casos há custo faltando, e num deles não houve chamada nenhuma.
   *
   * Deduzir isso da resposta — comparando o último bucket com o dia pedido —
   * confundiria "a Anthropic não fechou o dia" com "a organização não gastou
   * naquele dia", que produzem o mesmo silêncio.
   *
   * Com ERRO não se fala em pendência: aí o que não se sabe é outra coisa.
   */
  const pendencia = !erro && (custo.diaAberto || custo.recuado);

  const valor: ConsumoAnthropic = {
    dias: Array.from(porDia.values()).sort((a, b) => a.dia.localeCompare(b.dia)),
    modelos: Array.from(porModelo.values()).sort((a, b) => b.centavos - a.centavos),
    totalCentavos: Array.from(porDia.values()).reduce((n, d) => n + d.centavos, 0),
    moeda,
    atualizadoEm: new Date().toISOString(),
    doCache: false,
    erro,
    ultimoDiaComCusto: ultimoComCusto,
    custoPendente: pendencia,
    diaPedido: fim,
  };
  // Erro não entra no cache: o próximo acesso tenta de novo em vez de repetir a
  // falha por dez minutos.
  if (!erro) cache.set(chave, { quando: Date.now(), valor });
  return valor;
}
