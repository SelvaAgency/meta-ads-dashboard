/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Avaliador — leitura entra, achado sai
 * ─────────────────────────────────────────────────────────────────────────────
 *  Função PURA de propósito: nenhuma rede, nenhum banco, nenhum relógio. É onde
 *  mora a decisão de acordar alguém, e decisão dessas precisa ser exercitável
 *  em milissegundos, com qualquer cenário, sem depender de um site real estar
 *  fora do ar.
 *
 *  ── Três princípios que o código segue ─────────────────────────────────────
 *
 *  1. AUSÊNCIA DE DADO NÃO É PROBLEMA. Não conseguir ler é "não verificado",
 *     nunca "está errado". Confundir os dois é como um robô perde a confiança
 *     do time.
 *
 *  2. BLOQUEIO NÃO É COMPROMETIMENTO. 401/403 é WAF fazendo o trabalho dele
 *     contra um cliente HTTP desconhecido — que é exatamente o que somos.
 *
 *  3. O QUE ACORDA ALGUÉM PEDE CONFIRMAÇÃO. Todo achado CRITICAL nasce com
 *     `exigeConfirmacao`, e quem orquestra só alerta depois da segunda leitura.
 *     Instabilidade de rede não pode virar incidente.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { dominioRegistravel, mesmoDominioRegistravel } from "./dominioRegistravel";
import type { LeituraDns } from "./dnsCheck";
import type { LeituraRedirect } from "./redirectCheck";
import { avaliarConteudo, type EntradaConteudo } from "./avaliadorConteudo";

export type Severidade = "INFO" | "WARNING" | "CRITICAL";

export interface Achado {
  chave: string;
  sev: Severidade;
  titulo: string;
  detalhe: string;
  /** Só CRITICAL exige — ver princípio 3. */
  exigeConfirmacao: boolean;
  /** O que sustenta a afirmação. Sempre truncado; vira JSON no snapshot. */
  evidencia: Record<string, string | number | boolean | string[] | null>;
}

export interface EntradaAvaliacao {
  dominioEsperado: string;
  dns: LeituraDns | null;
  redirect: LeituraRedirect | null;
  /** Nameservers conhecidos. `null` = ainda não aprendido (1ª leitura). */
  nsBaseline: string[] | null;
  /**
   * Leitura do blog. Ausente = coletor desligado ou fora do ritmo dele — que é
   * diferente de "leu e não achou nada", e por isso não vira achado nenhum.
   */
  conteudo?: EntradaConteudo | null;
}

/** Acima disso a cadeia é estranha o bastante para registrar. */
const SALTOS_INCOMUNS = 3;

const corta = (v: string | null | undefined, n = 200): string => (v ?? "").slice(0, n);

export function avaliar(e: EntradaAvaliacao): Achado[] {
  const achados: Achado[] = [];
  const esperado = dominioRegistravel(e.dominioEsperado);

  // Sem domínio esperado não há o que comparar. É configuração faltando, não
  // problema do site — e dizer isso é melhor do que ficar mudo.
  if (!esperado) {
    return [{
      chave: "sem_dominio_esperado", sev: "INFO",
      titulo: "Domínio esperado não configurado",
      detalhe: "O robô não tem contra o que comparar. Configure o domínio na aba Monitoramento.",
      exigeConfirmacao: false,
      evidencia: { dominioEsperado: corta(e.dominioEsperado) },
    }];
  }

  // ── DNS ────────────────────────────────────────────────────────────────────
  if (e.dns) {
    const d = e.dns;

    if (d.falha === "nao_existe") {
      achados.push({
        chave: "dns_nao_resolve", sev: "CRITICAL",
        titulo: "Domínio não resolve",
        detalhe: `${esperado} não tem registro DNS. Domínio pode ter expirado, sido suspenso ou removido.`,
        exigeConfirmacao: true,
        evidencia: { dominio: d.dominio, erroCodigo: d.erroCodigo, emMs: d.emMs, lidoEm: d.lidoEm },
      });
    } else if (d.falha === "sem_endereco") {
      // WARNING e não CRITICAL: o domínio não expirou nem foi sequestrado — ele
      // está registrado e delegado, só não aponta para servidor nenhum. Costuma
      // ser site em migração ou ainda não publicado, e chamar isso de incidente
      // crítico geraria e-mail para uma decisão que alguém tomou de propósito.
      achados.push({
        chave: "dns_sem_endereco", sev: "WARNING",
        titulo: "Domínio não aponta para nenhum servidor",
        detalhe: `${esperado} tem nameservers configurados, mas nenhum registro de endereço (A/AAAA) — nem no domínio, nem no www. Ninguém consegue abrir o site.`,
        exigeConfirmacao: false,
        evidencia: { dominio: d.dominio, ns: d.ns, erroCodigo: d.erroCodigo, emMs: d.emMs },
      });
    } else if (d.falha === "instavel") {
      // Pode ser a NOSSA rede. Nunca crítico.
      achados.push({
        chave: "dns_instavel", sev: "WARNING",
        titulo: "Consulta DNS falhou",
        detalhe: "Não foi possível consultar o DNS agora. Pode ser instabilidade momentânea da consulta.",
        exigeConfirmacao: false,
        evidencia: { dominio: d.dominio, erroCodigo: d.erroCodigo, emMs: d.emMs },
      });
    } else if (d.resolveu && d.ns.length > 0) {
      if (e.nsBaseline === null) {
        // Primeira leitura: aprende, não julga. Exigir baseline configurado à
        // mão garantiria configuração errada — ninguém sabe NS de cor.
        achados.push({
          chave: "ns_baseline_aprendido", sev: "INFO",
          titulo: "Nameservers registrados",
          detalhe: `Baseline aprendido: ${d.ns.join(", ")}.`,
          exigeConfirmacao: false,
          evidencia: { ns: d.ns },
        });
      } else if (!mesmoConjunto(d.ns, e.nsBaseline)) {
        // WARNING, não CRITICAL: trocar de hospedagem é rotina e legítima. O
        // que interessa é alguém OLHAR, não alguém acordar.
        achados.push({
          chave: "ns_mudou", sev: "WARNING",
          titulo: "Nameservers mudaram",
          detalhe: `Antes: ${e.nsBaseline.join(", ")}. Agora: ${d.ns.join(", ")}. Pode ser troca de hospedagem — ou perda do domínio.`,
          exigeConfirmacao: false,
          evidencia: { antes: e.nsBaseline, agora: d.ns },
        });
      }
    }
  }

  // ── Redirect ───────────────────────────────────────────────────────────────
  if (e.redirect) {
    const r = e.redirect;

    if (!r.ok) {
      achados.push({
        chave: "site_sem_resposta", sev: "WARNING",
        titulo: "Site não respondeu",
        detalhe: corta(r.erro) || "Sem resposta.",
        exigeConfirmacao: false,
        evidencia: { url: corta(r.urlInicial), erro: corta(r.erro), emMs: r.emMs },
      });
    } else if (r.statusCode === 401 || r.statusCode === 403) {
      // Princípio 2: o WAF barrando nosso cliente HTTP não é incidente do site.
      achados.push({
        chave: "verificacao_bloqueada", sev: "INFO",
        titulo: "Verificação bloqueada pelo site",
        detalhe: `O site respondeu ${r.statusCode} para o nosso verificador. Não é sinal de problema — é proteção (WAF/Cloudflare).`,
        exigeConfirmacao: false,
        evidencia: { statusCode: r.statusCode, finalUrl: corta(r.finalUrl) },
      });
    } else {
      const destino = r.finalUrl ?? "";
      const dominioFinal = dominioRegistravel(destino);

      if (dominioFinal && !mesmoDominioRegistravel(destino, esperado)) {
        // O incidente da Aiká. http→https e www↔apex já foram normalizados
        // pelo domínio registrável, então não caem aqui.
        achados.push({
          chave: "dominio_divergente", sev: "CRITICAL",
          titulo: "Site redireciona para outro domínio",
          detalhe: `Esperado ${esperado}, chegou em ${dominioFinal}. Pode ser perda de domínio, sequestro ou configuração errada.`,
          exigeConfirmacao: true,
          evidencia: {
            esperado, dominioFinal,
            finalUrl: corta(r.finalUrl, 300),
            cadeia: r.cadeia.slice(0, 8).map((u) => corta(u, 300)),
            saltos: r.saltos,
            titulo: corta(r.tituloTrecho, 120),
          },
        });
      } else if (r.saltos > SALTOS_INCOMUNS) {
        achados.push({
          chave: "redirect_incomum", sev: "WARNING",
          titulo: `Cadeia de ${r.saltos} redirecionamentos`,
          detalhe: "O destino é o esperado, mas o caminho até ele é longo — costuma indicar configuração acumulada.",
          exigeConfirmacao: false,
          evidencia: { saltos: r.saltos, cadeia: r.cadeia.slice(0, 8).map((u) => corta(u, 300)) },
        });
      }

      // Canonical apontando para fora: o site abre certo, mas se declara como
      // sendo outro — sintoma clássico de injeção de SEO.
      if (r.canonical) {
        const canon = dominioRegistravel(r.canonical);
        if (canon && !mesmoDominioRegistravel(r.canonical, esperado)) {
          achados.push({
            chave: "canonical_externo", sev: "WARNING",
            titulo: "Canonical aponta para outro domínio",
            detalhe: `A página se declara como ${canon}, não ${esperado}.`,
            exigeConfirmacao: false,
            evidencia: { canonical: corta(r.canonical, 300), dominioCanonical: canon, esperado },
          });
        }
      }
    }
  }

  // ── Conteúdo ───────────────────────────────────────────────────────────────
  // Depois de DNS e destino, e a ordem importa: `decidir` trata o PRIMEIRO
  // achado crítico da lista, e domínio perdido é mais grave que blog invadido.
  if (e.conteudo) achados.push(...avaliarConteudo(e.conteudo));

  // Silêncio não é resposta: registrar o "tudo certo" é o que permite a tela
  // dizer quando foi a última verificação boa.
  if (achados.length === 0) {
    achados.push({
      chave: "ok", sev: "INFO",
      titulo: "Sem anomalias",
      detalhe: `Domínio e destino conferem com ${esperado}.`,
      exigeConfirmacao: false,
      evidencia: {
        esperado,
        dominioFinal: e.redirect?.finalUrl ? dominioRegistravel(e.redirect.finalUrl) : null,
        saltos: e.redirect?.saltos ?? 0,
        ns: e.dns?.ns ?? [],
      },
    });
  }
  return achados;
}

/** Conjuntos iguais ignorando ordem e caixa — NS voltam em ordem variável. */
export function mesmoConjunto(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const na = [...a].map((x) => x.toLowerCase()).sort();
  const nb = [...b].map((x) => x.toLowerCase()).sort();
  return na.every((v, i) => v === nb[i]);
}

/** O achado mais grave da lista — o que decide a severidade do ciclo. */
export function maisGrave(achados: Achado[]): Severidade {
  if (achados.some((a) => a.sev === "CRITICAL")) return "CRITICAL";
  if (achados.some((a) => a.sev === "WARNING")) return "WARNING";
  return "INFO";
}
