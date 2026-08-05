/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Termos suspeitos — o que conta como spam de cassino, e o que NÃO conta
 * ─────────────────────────────────────────────────────────────────────────────
 *  Função pura. É a parte do robô com maior risco de FALSO POSITIVO, e falso
 *  positivo aqui é caro: um alerta de "conteúdo de cassino" no blog de um
 *  cliente, quando o post é legítimo, queima a confiança no robô inteiro.
 *
 *  ── Por que não há stemming ────────────────────────────────────────────────
 *  A tentação é reduzir "apostas" a "aposta" para pegar as duas formas. Seria
 *  um desastre em português de marketing: "a marca APOSTA em fios naturais",
 *  "APOSTAMOS no conforto" — texto que qualquer blog de moda escreve toda
 *  semana. O substantivo plural "apostas" é específico; o verbo "aposta" é
 *  vocabulário comum. Então cada forma que deve alertar entra na lista à mão.
 *
 *  Mesma razão para exigir PALAVRA INTEIRA: "bet" como substring casa com
 *  "alfabeto", "Betânia" e "beterraba". Substring aqui produziria alerta diário
 *  em blog de qualquer assunto.
 *
 *  ── Acento entra na normalização, não na lista ─────────────────────────────
 *  "bônus" e "bonus" são a mesma palavra para este fim. Ambos os lados da
 *  comparação perdem acento, então a lista não precisa das duas formas.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Termos padrão. Cada forma que deve alertar está aqui à mão — ver cabeçalho. */
export const TERMOS_PADRAO = [
  "cassino", "cassinos", "casino", "casinos",
  "apostas", "aposta esportiva", "apostas esportivas",
  "bet", "bets", "betting",
  "slot", "slots", "poker", "pôquer",
  "bonus", "jackpot", "roleta", "roulette", "gambling",
  "cacaniquel", "caca-niquel",
];

/** Caixa, acento e tags fora. As duas pontas da comparação passam por aqui. */
export const normalizarTexto = (v: string): string =>
  String(v ?? "")
    .replace(/<[^>]*>/g, " ") // resumo do WordPress vem com <p> e <a>
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

export interface TermoEncontrado {
  termo: string;
  onde: "titulo" | "texto" | "url";
  /** Trecho curto ao redor, para a evidência. Já truncado. */
  trecho: string;
}

/**
 * Monta a lista efetiva de termos deste cliente.
 *
 * Ignorados são removidos DEPOIS dos extras: se alguém adicionou e ignorou o
 * mesmo termo, ignorar vence — a intenção de silenciar é mais recente e mais
 * específica do que a de vigiar.
 */
export function termosDoCliente(extras?: string[] | null, ignorados?: string[] | null): string[] {
  const ign = new Set((ignorados ?? []).map(normalizarTexto).filter(Boolean));
  const todos = [...TERMOS_PADRAO, ...(extras ?? [])].map(normalizarTexto).filter(Boolean);
  return Array.from(new Set(todos)).filter((t) => !ign.has(t));
}

/** Escapa o termo para entrar num regex — termo do cliente é entrada livre. */
const escaparRegex = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Procura os termos num texto já normalizado, exigindo palavra inteira.
 *
 * A fronteira não é `\b`: `\b` trata acentuados como fronteira e quebraria em
 * termos compostos. Usa-se "não é letra nem número" dos dois lados.
 */
export function encontrarTermos(
  texto: string,
  termos: string[],
  onde: TermoEncontrado["onde"],
): TermoEncontrado[] {
  const alvo = normalizarTexto(texto);
  if (!alvo) return [];
  const achados: TermoEncontrado[] = [];
  for (const termo of termos) {
    const re = new RegExp(`(^|[^a-z0-9])${escaparRegex(termo)}($|[^a-z0-9])`, "i");
    const m = re.exec(alvo);
    if (!m) continue;
    const i = Math.max(0, (m.index ?? 0) - 40);
    achados.push({ termo, onde, trecho: alvo.slice(i, i + 140).trim() });
  }
  return achados;
}

export interface PostParaAnalise {
  id: string;
  url: string;
  titulo: string;
  resumo: string;
}

export interface Classificacao {
  suspeito: boolean;
  /** Termos distintos encontrados, em qualquer campo. */
  termos: string[];
  encontrados: TermoEncontrado[];
  /**
   * Sinal FORTE: termo no título, ou dois termos distintos no mesmo post.
   *
   * Um termo isolado no meio do texto pode ser citação, notícia ou coincidência
   * — vira WARNING. Título é onde o spam se anuncia, e dois termos distintos
   * não acontecem por acaso num blog de malharia.
   */
  forte: boolean;
}

export function classificarPost(post: PostParaAnalise, termos: string[]): Classificacao {
  const encontrados = [
    ...encontrarTermos(post.titulo, termos, "titulo"),
    ...encontrarTermos(post.resumo, termos, "texto"),
    // A URL entra porque o sitemap só entrega URL: sem isso, o fallback mais
    // provável de um WordPress com REST bloqueada não detectaria nada.
    ...encontrarTermos(post.url.replace(/[/\-_.]+/g, " "), termos, "url"),
  ];
  const distintos = Array.from(new Set(encontrados.map((e) => e.termo)));
  return {
    suspeito: encontrados.length > 0,
    termos: distintos,
    encontrados,
    forte: encontrados.some((e) => e.onde === "titulo") || distintos.length >= 2,
  };
}
