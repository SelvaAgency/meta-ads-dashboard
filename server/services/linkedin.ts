/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  LinkedIn — a camada de transporte, e só ela
 * ─────────────────────────────────────────────────────────────────────────────
 *  Este arquivo não sabe o que é um seguidor. Ele resolve as três coisas que a
 *  API do LinkedIn faz DIFERENTE da Meta, e que fariam a sondagem medir errado
 *  se ficassem escondidas dentro dela:
 *
 *  ── 1. A versão é um cabeçalho, e ela expira ───────────────────────────────
 *  `/rest/*` exige `LinkedIn-Version: AAAAMM`, e o LinkedIn aposenta versões
 *  depois de cerca de um ano. Chumbar uma versão aqui significa que a integração
 *  para de funcionar sozinha num dia qualquer, com um erro que não diz isso.
 *  Por isso `versaoQueResponde` DESCOBRE a versão aceita em vez de assumir uma —
 *  é a primeira medição da Fase 0, e todas as outras dependem dela.
 *
 *  ── 2. Rest.li 2.0 não é query string comum ────────────────────────────────
 *  `timeIntervals=(timeRange:(start:...,end:...),timeGranularityType:DAY)` só é
 *  aceito com os parênteses e os dois-pontos LITERAIS. `URLSearchParams` os
 *  percent-encoda e o LinkedIn devolve 400 — que pareceria "essa métrica não
 *  existe" quando o problema é a codificação. Daí `montarQuery`, que separa o
 *  que é estrutura Rest.li do que é valor comum.
 *
 *  ── 3. O erro vem em três formatos ─────────────────────────────────────────
 *  `serviceErrorCode`, `status` e `message` aparecem em combinações diferentes
 *  conforme o endpoint. Os três entram na mensagem porque é o par
 *  (status, serviceErrorCode) que separa "falta o produto aprovado" de "esta
 *  organização não existe" — e essas duas têm correções opostas.
 *
 *  ── O token nunca sai daqui ────────────────────────────────────────────────
 *  Vai no cabeçalho `Authorization`, nunca na URL, e toda mensagem de erro passa
 *  por `sanitizar` antes de virar texto. Mesma regra do resto do Spaces.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { sanitizar } from "./instagram";

const API = "https://api.linkedin.com";

/**
 * Versões tentadas, da mais nova para a mais antiga.
 *
 * A lista é de CANDIDATAS, não de verdades: qual delas está viva é medido, não
 * declarado. Quando todas morrerem, a sondagem vai dizer isso com todas as
 * letras em vez de reportar "nenhuma métrica disponível" — que é o que um
 * número chumbado produziria.
 */
export const VERSOES_CANDIDATAS = [
  "202608", "202605", "202602", "202511", "202508", "202505", "202501", "202411",
];

/** O que a sondagem precisa saber de uma chamada, inclusive quando ela falha. */
export interface ErroLinkedIn extends Error {
  httpStatus: number | null;
  serviceErrorCode: number | null;
}

function erroLinkedIn(msg: string, httpStatus: number | null, serviceErrorCode: number | null): ErroLinkedIn {
  const e = new Error(msg) as ErroLinkedIn;
  e.httpStatus = httpStatus;
  e.serviceErrorCode = serviceErrorCode;
  return e;
}

/**
 * Monta a query preservando a sintaxe do Rest.li.
 *
 * `cru` sai literal (estrutura Rest.li: parênteses, dois-pontos, List(...)).
 * `params` é percent-encodado normalmente. Misturar os dois num
 * `URLSearchParams` só produz 400 — e um 400 de codificação é indistinguível,
 * na tela, de "esta métrica não existe".
 */
export function montarQuery(
  params: Record<string, string> = {}, cru: Record<string, string> = {},
): string {
  const partes: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    partes.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
  }
  for (const [k, v] of Object.entries(cru)) partes.push(`${k}=${v}`);
  return partes.join("&");
}

export interface OpcoesChamada {
  token: string;
  /** `undefined` usa `/v2` (legado, sem cabeçalho de versão). */
  versao?: string;
  params?: Record<string, string>;
  /** Valores em sintaxe Rest.li, que NÃO podem ser percent-encodados. */
  cru?: Record<string, string>;
}

/**
 * Uma chamada ao LinkedIn.
 *
 * `caminho` começa com `/rest/...` ou `/v2/...` — a sondagem precisa alcançar
 * os dois, porque parte das leituras de organização só existe no legado e parte
 * só na versionada, e qual é qual é justamente o que se está medindo.
 */
/**
 * O que uma chamada devolve quando se quer MEDIR, e não só usar.
 *
 * A sondagem precisa registrar HTTP status e cabeçalhos de limite mesmo quando
 * a chamada dá certo — `chamarLinkedIn` devolve só o corpo, porque é o que um
 * consumidor normal quer. Separar as duas evita encher o caminho de produção
 * com dado que só o diagnóstico usa.
 */
export interface RespostaMedida<T> {
  ok: boolean;
  status: number | null;
  /** `serviceErrorCode` do LinkedIn, quando vem. */
  codigo: number | null;
  dados: T | null;
  /** Já sanitizada — nunca contém o token. */
  erro: string | null;
  /** Cabeçalhos de rate limit, quando o LinkedIn os envia. */
  limites: Record<string, string>;
}

/** Os cabeçalhos de limite que o LinkedIn documenta. Ausentes, não se inventa. */
const CABECALHOS_DE_LIMITE = [
  "x-restli-ratelimit-limit", "x-restli-ratelimit-remaining",
  "x-li-ratelimit-limit", "x-li-ratelimit-remaining", "retry-after",
];

/**
 * A mesma chamada, medida. NUNCA lança: o erro vira dado.
 *
 * Numa sondagem, exceção é pior que retorno: ela interrompe a sequência e
 * transforma "este endpoint falhou" em "o resto não foi medido".
 */
export async function medirLinkedIn<T>(
  caminho: string, o: OpcoesChamada,
): Promise<RespostaMedida<T>> {
  const query = montarQuery(o.params, o.cru);
  const url = `${API}${caminho}${query ? `?${query}` : ""}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${o.token}`,
    "X-Restli-Protocol-Version": "2.0.0",
    Accept: "application/json",
  };
  if (o.versao) headers["LinkedIn-Version"] = o.versao;

  let resp: Response;
  try {
    resp = await fetch(url, { headers, signal: AbortSignal.timeout(25_000) });
  } catch (e) {
    return {
      ok: false, status: null, codigo: null, dados: null,
      erro: `rede: ${sanitizar((e as Error).message, o.token)}`, limites: {},
    };
  }

  const limites: Record<string, string> = {};
  for (const h of CABECALHOS_DE_LIMITE) {
    const v = resp.headers.get(h);
    if (v) limites[h] = v;
  }

  const texto = await resp.text();
  let dados: Record<string, unknown> = {};
  try {
    dados = texto ? (JSON.parse(texto) as Record<string, unknown>) : {};
  } catch {
    return {
      ok: false, status: resp.status, codigo: null, dados: null,
      erro: `resposta não é JSON (HTTP ${resp.status})`, limites,
    };
  }

  const codigo = typeof dados.serviceErrorCode === "number" ? dados.serviceErrorCode : null;
  if (!resp.ok || codigo !== null) {
    const msg = typeof dados.message === "string" ? dados.message : "erro sem mensagem";
    return {
      ok: false, status: resp.status, codigo, dados: null,
      erro: sanitizar(msg, o.token), limites,
    };
  }
  return { ok: true, status: resp.status, codigo: null, dados: dados as T, erro: null, limites };
}

export async function chamarLinkedIn<T>(caminho: string, o: OpcoesChamada): Promise<T> {
  const query = montarQuery(o.params, o.cru);
  const url = `${API}${caminho}${query ? `?${query}` : ""}`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${o.token}`,
    "X-Restli-Protocol-Version": "2.0.0",
    Accept: "application/json",
  };
  if (o.versao) headers["LinkedIn-Version"] = o.versao;

  let resp: Response;
  try {
    resp = await fetch(url, { headers, signal: AbortSignal.timeout(25_000) });
  } catch (e) {
    throw erroLinkedIn(`rede: ${sanitizar((e as Error).message, o.token)}`, null, null);
  }

  const texto = await resp.text();
  let dados: Record<string, unknown> = {};
  try {
    dados = texto ? (JSON.parse(texto) as Record<string, unknown>) : {};
  } catch {
    // HTML de página de erro, ou corpo vazio com status ruim. O status é a
    // única informação confiável aqui, e ele basta para o diagnóstico.
    if (!resp.ok) {
      throw erroLinkedIn(`HTTP ${resp.status} sem corpo JSON`, resp.status, null);
    }
    throw erroLinkedIn(`resposta não é JSON (HTTP ${resp.status})`, resp.status, null);
  }

  if (!resp.ok || dados.serviceErrorCode) {
    const codigo = typeof dados.serviceErrorCode === "number" ? dados.serviceErrorCode : null;
    const msg = typeof dados.message === "string" ? dados.message : "erro sem mensagem";
    throw erroLinkedIn(
      `LinkedIn (${resp.status}${codigo !== null ? `/${codigo}` : ""}): ${sanitizar(msg, o.token)}`,
      resp.status, codigo,
    );
  }
  return dados as T;
}

/**
 * Descobre qual versão da API responde, tentando da mais nova para a mais
 * antiga contra um endpoint barato.
 *
 * Devolve `null` quando NENHUMA responde — e isso é diferente de "o token não
 * tem permissão": se todas as versões devolverem erro de permissão, a versão
 * está boa e o problema é escopo. Por isso o motivo de cada tentativa volta
 * junto, em vez de só o veredito.
 */
export async function versaoQueResponde(token: string): Promise<{
  versao: string | null;
  tentativas: Array<{ versao: string; ok: boolean; detalhe: string }>;
}> {
  const tentativas: Array<{ versao: string; ok: boolean; detalhe: string }> = [];
  for (const versao of VERSOES_CANDIDATAS) {
    try {
      await chamarLinkedIn("/rest/organizationAcls", {
        token, versao, params: { q: "roleAssignee", count: "1" },
      });
      tentativas.push({ versao, ok: true, detalhe: "aceita" });
      return { versao, tentativas };
    } catch (e) {
      const err = e as ErroLinkedIn;
      // 403 significa que a VERSÃO foi aceita e o escopo é que falta — a versão
      // serve. Tratá-la como morta faria a sondagem descer a escada inteira e
      // concluir "nenhuma versão responde" com a versão certa na mão.
      if (err.httpStatus === 403) {
        tentativas.push({ versao, ok: true, detalhe: "aceita (403 é escopo, não versão)" });
        return { versao, tentativas };
      }
      tentativas.push({ versao, ok: false, detalhe: sanitizar(err.message, token) });
    }
  }
  return { versao: null, tentativas };
}

export interface Introspeccao {
  ativo: boolean;
  scopes: string[];
  expiraEm: Date | null;
  autorizadoEm: Date | null;
  tipo: string | null;
}

/**
 * Pergunta ao LinkedIn QUAIS escopos o token tem — o equivalente do
 * `debug_token` da Meta.
 *
 * É a medição que substitui dedução. Sem ela, "quais permissões temos?" só se
 * responderia vendo o que falha — e uma chamada pode falhar por escopo, por
 * produto não aprovado, por a organização não existir ou por versão morta. Os
 * quatro apareceriam iguais.
 *
 * Exige client_id e client_secret do app. Eles são usados UMA VEZ e não são
 * gravados em lugar nenhum: quem chama passa e esquece.
 */
export async function introspectarToken(
  token: string, clientId: string, clientSecret: string,
): Promise<Introspeccao> {
  const corpo = new URLSearchParams({
    client_id: clientId, client_secret: clientSecret, token,
  });
  const resp = await fetch("https://www.linkedin.com/oauth/v2/introspectToken", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: corpo,
    signal: AbortSignal.timeout(20_000),
  });
  const texto = await resp.text();
  let d: Record<string, unknown>;
  try {
    d = JSON.parse(texto) as Record<string, unknown>;
  } catch {
    throw erroLinkedIn(`introspecção não devolveu JSON (HTTP ${resp.status})`, resp.status, null);
  }
  if (!resp.ok) {
    throw erroLinkedIn(
      `introspecção HTTP ${resp.status}: ${sanitizar(String(d.error_description ?? d.error ?? "sem detalhe"), token)}`,
      resp.status, null,
    );
  }
  const segundos = (v: unknown) => (typeof v === "number" ? new Date(v * 1000) : null);
  return {
    ativo: d.status === "active",
    scopes: typeof d.scope === "string" ? d.scope.split(/[,\s]+/).filter(Boolean) : [],
    expiraEm: segundos(d.expires_at),
    autorizadoEm: segundos(d.authorized_at),
    tipo: typeof d.auth_type === "string" ? d.auth_type : null,
  };
}

/**
 * O portão antes de gravar a credencial — e ele é DE PROPÓSITO mais frouxo que
 * o do Instagram.
 *
 * Lá o token era rejeitado se o diagnóstico não passasse inteiro, o que fazia
 * sentido: aquele token ia direto para produção coletar. Aqui ele existe para
 * ser MEDIDO. Um token sem escopo é exatamente o que a Fase 0 precisa gravar
 * para depois dizer, item por item, qual escopo falta — rejeitá-lo tornaria a
 * sondagem impossível de rodar justamente no caso em que ela é mais útil.
 *
 * Então só o token MORTO é barrado. Falta de permissão passa e vira relatório.
 */
export async function testarTokenLinkedIn(token: string): Promise<{
  ok: boolean; texto: string; versao: string | null;
}> {
  const v = await versaoQueResponde(token);
  const linhas = [`versão da API: ${v.versao ?? "nenhuma das candidatas respondeu"}`];

  let vivo = false;
  for (const [rotulo, caminho, params] of [
    ["identidade (OpenID)", "/v2/userinfo", {}],
    ["Páginas do membro", "/rest/organizationAcls", { q: "roleAssignee", count: "1" }],
  ] as const) {
    try {
      await chamarLinkedIn(caminho, {
        token, versao: caminho.startsWith("/rest") ? v.versao ?? undefined : undefined,
        params: params as Record<string, string>,
      });
      linhas.push(`[SIM] ${rotulo}: respondeu`);
      vivo = true;
    } catch (e) {
      const err = e as ErroLinkedIn;
      // 403 prova que o token FOI ACEITO e o que falta é escopo ou produto.
      // Tratá-lo como token morto mandaria gerar outro — o conserto errado.
      if (err.httpStatus === 403) {
        linhas.push(`[SIM] ${rotulo}: token aceito, faltando escopo/produto (403)`);
        vivo = true;
      } else {
        linhas.push(`[NÃO] ${rotulo}: ${sanitizar(err.message, token)}`);
      }
    }
  }

  linhas.push("");
  linhas.push(vivo
    ? "Token vivo. O que ele alcança é o que a sondagem vai medir."
    : "Token não respondeu a nenhuma chamada — provavelmente expirado ou revogado.");
  return { ok: vivo, texto: linhas.join("\n"), versao: v.versao };
}

export { sanitizar };
