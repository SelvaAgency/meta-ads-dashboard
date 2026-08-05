/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Coletor DNS — o sinal mais rápido de domínio perdido
 * ─────────────────────────────────────────────────────────────────────────────
 *  Existe porque o caso Aiká (domínio suspenso por falta de pagamento) aparece
 *  no DNS ANTES de aparecer no navegador: os nameservers mudam para os do
 *  registrador, e só depois o HTTP passa a servir página de estacionamento.
 *
 *  E é barato: uma consulta DNS custa ~20ms contra ~500ms de um GET com TLS.
 *  É o que torna viável olhar a cada 5 minutos.
 *
 *  ── Falhar não é sumir ─────────────────────────────────────────────────────
 *  A distinção que mais importa aqui: `NXDOMAIN` (o domínio não existe mais) é
 *  incidente; `SERVFAIL` ou timeout é instabilidade — possivelmente da NOSSA
 *  rede. Tratar os dois igual transformaria um soluço de rede em alerta
 *  crítico às 3 da manhã, e o time desligaria o robô na primeira semana.
 *
 *  ── Ter nameserver não é apontar para lugar nenhum ─────────────────────────
 *  A primeira versão considerava "resolveu" se QUALQUER consulta respondesse,
 *  incluindo a de NS. Uma sondagem no domínio real da Ultramalhas mostrou o
 *  buraco: ela tem NS, não tem A nem AAAA, e o www nem existe. O coletor dizia
 *  "resolveu, tudo certo" para um domínio que ninguém consegue abrir.
 *
 *  Quem torna o site alcançável é o ENDEREÇO. NS respondendo com endereço
 *  nenhum é um terceiro estado — domínio registrado e delegado, apontando para
 *  o vazio — e ele merece nome próprio: `sem_endereco`. Não é `nao_existe` (o
 *  domínio existe, não expirou) nem "está tudo bem".
 *
 *  O www entra na consulta porque há domínio que só serve no www. Perguntar só
 *  pelo ápice diria "sem endereço" para metade da internet.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { Resolver } from "node:dns/promises";
import { normalizarHost } from "./dominioRegistravel";

export type FalhaDns = "nao_existe" | "sem_endereco" | "instavel" | null;

export interface LeituraDns {
  dominio: string;
  /** Tem ENDEREÇO — é isto que torna o site alcançável. Ver cabeçalho. */
  resolveu: boolean;
  ns: string[];
  /** Endereços do ápice e do www, juntos. */
  a: string[];
  /** `null` quando resolveu. Separa domínio morto de rede instável. */
  falha: FalhaDns;
  erroCodigo: string | null;
  emMs: number;
  lidoEm: string;
}

/** Códigos que significam "este domínio não existe / não tem registro". */
const CODIGOS_INEXISTENTE = new Set(["ENOTFOUND", "NXDOMAIN", "ENODATA"]);

/**
 * Consulta NS e A do domínio. Nunca lança: devolve a leitura com `falha`
 * preenchida, porque um coletor que estoura derruba o ciclo dos outros clientes.
 */
export async function checarDns(entrada: string, timeoutMs = 5_000): Promise<LeituraDns> {
  const dominio = normalizarHost(entrada);
  const t0 = Date.now();
  const base: LeituraDns = {
    dominio, resolveu: false, ns: [], a: [], falha: "instavel",
    erroCodigo: null, emMs: 0, lidoEm: new Date().toISOString(),
  };
  if (!dominio) return { ...base, erroCodigo: "SEM_DOMINIO", falha: "instavel", emMs: 0 };

  // `tries: 1` de propósito: o retry interno do resolvedor esconderia a
  // instabilidade que queremos justamente medir, e triplicaria o tempo do ciclo.
  const r = new Resolver({ timeout: timeoutMs, tries: 1 });

  const [ns, a4, a6, www4] = await Promise.all([
    r.resolveNs(dominio).catch((e: NodeJS.ErrnoException) => e),
    r.resolve4(dominio).catch((e: NodeJS.ErrnoException) => e),
    r.resolve6(dominio).catch((e: NodeJS.ErrnoException) => e),
    r.resolve4(`www.${dominio}`).catch((e: NodeJS.ErrnoException) => e),
  ]);
  const emMs = Date.now() - t0;

  const erroDe = (v: unknown) => (v instanceof Error ? ((v as NodeJS.ErrnoException).code ?? "ERRO") : null);
  const listaDe = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);

  const listaNs = listaDe(ns).sort();
  const enderecos = Array.from(new Set([...listaDe(a4), ...listaDe(a6), ...listaDe(www4)])).sort();

  // Endereço é o que torna o site alcançável — ver cabeçalho.
  if (enderecos.length > 0) {
    return { ...base, resolveu: true, ns: listaNs, a: enderecos, falha: null, erroCodigo: null, emMs };
  }

  // Delegado, mas apontando para o vazio. Nem "não existe", nem "tudo bem".
  if (listaNs.length > 0) {
    return {
      ...base, resolveu: false, ns: listaNs, a: [],
      falha: "sem_endereco", erroCodigo: erroDe(a4) ?? "SEM_ENDERECO", emMs,
    };
  }

  const codigo = erroDe(ns) ?? erroDe(a4) ?? "SEM_RESPOSTA";
  return {
    ...base,
    erroCodigo: codigo,
    falha: CODIGOS_INEXISTENTE.has(codigo) ? "nao_existe" : "instavel",
    emMs,
  };
}
