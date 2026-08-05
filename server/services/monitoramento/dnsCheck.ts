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
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { Resolver } from "node:dns/promises";
import { normalizarHost } from "./dominioRegistravel";

export type FalhaDns = "nao_existe" | "instavel" | null;

export interface LeituraDns {
  dominio: string;
  /** Resolveu para algum endereço utilizável. */
  resolveu: boolean;
  ns: string[];
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

  const [ns, a] = await Promise.all([
    r.resolveNs(dominio).catch((e: NodeJS.ErrnoException) => e),
    r.resolve4(dominio).catch((e: NodeJS.ErrnoException) => e),
  ]);
  const emMs = Date.now() - t0;

  const erroDe = (v: unknown) => (v instanceof Error ? ((v as NodeJS.ErrnoException).code ?? "ERRO") : null);
  const listaDe = (v: unknown) => (Array.isArray(v) ? v.map(String).sort() : []);

  const codigoNs = erroDe(ns);
  const codigoA = erroDe(a);
  const listaNs = listaDe(ns);
  const listaA = listaDe(a);

  // Resolveu se QUALQUER uma das consultas trouxe resposta: há site atrás de
  // CNAME sem A direto, e exigir as duas geraria alerta falso.
  if (listaNs.length > 0 || listaA.length > 0) {
    return { ...base, resolveu: true, ns: listaNs, a: listaA, falha: null, erroCodigo: null, emMs };
  }

  const codigo = codigoNs ?? codigoA ?? "SEM_RESPOSTA";
  return {
    ...base,
    erroCodigo: codigo,
    falha: CODIGOS_INEXISTENTE.has(codigo) ? "nao_existe" : "instavel",
    emMs,
  };
}
