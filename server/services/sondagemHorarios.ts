/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  O que `online_followers` realmente entrega
 * ─────────────────────────────────────────────────────────────────────────────
 *  Sondagem, não implementação. "Melhores horários para publicar" é uma promessa
 *  grande, e ela depende de coisas que ninguém mediu ainda: qual a granularidade
 *  do dado, se ele cobre a semana inteira ou só o dia, e se responde para todas
 *  as contas ou só para as maiores.
 *
 *  ── Por que não dá para partir do dado cru ─────────────────────────────────
 *  A métrica devolve, na melhor das hipóteses, um mapa de hora → quantidade de
 *  seguidores online. Isso NÃO é "melhor horário para publicar": é onde a
 *  audiência está acordada. Publicar no pico de presença pode significar
 *  publicar junto de todo mundo. A recomendação exige cruzar isso com o
 *  desempenho real das publicações — e para cruzar é preciso primeiro saber a
 *  forma exata do lado da presença.
 *
 *  ── O que esta sondagem responde, e só ─────────────────────────────────────
 *  Quais chaves vêm, quantas por resposta, se há dimensão de dia da semana, se a
 *  contagem varia entre horas (um mapa constante seria inútil), e o que acontece
 *  em conta pequena. Nada disso é dedutível de documentação: a Meta muda a forma
 *  desta métrica com frequência, e ela já mudou de nome uma vez.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { sanitizar } from "./instagram";
import type { Consultar } from "./instagramSondagem";

/** As formas de chamada plausíveis. `lifetime` foi a que respondeu na Fase 0. */
const FORMAS: Array<{ nome: string; params: Record<string, string> }> = [
  { nome: "lifetime", params: { period: "lifetime" } },
  { nome: "lifetime + timeframe", params: { period: "lifetime", timeframe: "last_30_days" } },
  { nome: "day", params: { period: "day" } },
];

export interface LeituraDeHorario {
  forma: string;
  respondeu: boolean;
  /** Quantas chaves o mapa trouxe. 24 sugeriria hora do dia. */
  quantidadeDeChaves: number | null;
  /** As chaves, como vieram. São horas ou rótulos — nunca dado de pessoa. */
  chaves: string[];
  /** O maior e o menor valor: se forem iguais, o mapa não distingue nada. */
  maior: { chave: string; valor: number } | null;
  menor: { chave: string; valor: number } | null;
  /** Todas as chaves iguais = mapa inútil para recomendar horário. */
  variaEntreChaves: boolean;
  /** Quantos pontos a resposta trouxe — mais de um sugeriria série por dia. */
  pontosNaResposta: number;
  detalhe: string;
}

export interface SondagemDeHorarios {
  conta: string;
  leituras: LeituraDeHorario[];
  /** A forma que serviu, se alguma serviu. */
  formaUtil: string | null;
  temDiaDaSemana: boolean;
  texto: string;
}

/**
 * Descreve a FORMA do que veio, sem os valores.
 *
 * "respondeu sem mapa de horários" foi uma resposta ruim: ela não distingue
 * objeto vazio de objeto com forma inesperada, e os dois têm conclusões
 * opostas — vazio significa que a métrica não tem dado para esta conta; forma
 * inesperada significa que estou lendo no lugar errado. Na Fase 0 este mesmo
 * valor apareceu como "objeto", e provavelmente já era `{}`.
 */
function formaDoValor(valor: unknown): string {
  if (valor === null || valor === undefined) return "veio nulo";
  if (typeof valor !== "object") return `${typeof valor}, e não objeto`;
  if (Array.isArray(valor)) return `lista de ${valor.length}`;
  const entradas = Object.entries(valor as Record<string, unknown>);
  if (entradas.length === 0) return "objeto VAZIO — a métrica respondeu sem dado para esta conta";
  const tipos = new Map<string, number>();
  for (const [, v] of entradas) tipos.set(typeof v, (tipos.get(typeof v) ?? 0) + 1);
  const resumo = Array.from(tipos.entries()).map(([t, n]) => `${n}×${t}`).join(", ");
  return `objeto com ${entradas.length} chave(s) [${resumo}] · exemplos: ${entradas.slice(0, 5).map(([k]) => k).join(", ")}`;
}

function analisar(valor: unknown): {
  chaves: string[]; maior: LeituraDeHorario["maior"]; menor: LeituraDeHorario["menor"]; varia: boolean;
} {
  if (!valor || typeof valor !== "object") return { chaves: [], maior: null, menor: null, varia: false };
  const pares = Object.entries(valor as Record<string, unknown>)
    .filter((e): e is [string, number] => typeof e[1] === "number");
  if (pares.length === 0) return { chaves: [], maior: null, menor: null, varia: false };

  const ordenados = pares.slice().sort((a, b) => b[1] - a[1]);
  const [cMaior, vMaior] = ordenados[0];
  const [cMenor, vMenor] = ordenados[ordenados.length - 1];
  return {
    chaves: pares.map(([k]) => k),
    maior: { chave: cMaior, valor: vMaior },
    menor: { chave: cMenor, valor: vMenor },
    // Um mapa constante responde "a audiência está sempre igual", que não
    // sustenta recomendação nenhuma — e é indistinguível de dado ausente se
    // ninguém olhar.
    varia: vMaior !== vMenor,
  };
}

export async function sondarHorarios(
  consultar: Consultar,
  base: string,
  rotuloDaConta = base,
): Promise<SondagemDeHorarios> {
  const leituras: LeituraDeHorario[] = [];
  let formaUtil: string | null = null;
  let temDiaDaSemana = false;

  for (const forma of FORMAS) {
    try {
      const r = await consultar<{ data?: Array<Record<string, unknown>> }>(
        `${base}/insights`, { metric: "online_followers", ...forma.params });
      const pontos = r.data?.[0]?.values as Array<{ value?: unknown; end_time?: unknown }> | undefined;
      const primeiro = pontos?.[0]?.value;
      const a = analisar(primeiro);

      // Mais de um ponto com `end_time` diferente é o que permitiria falar de
      // dia da semana — sem isso, só existe "uma foto" da presença.
      const datas = new Set((pontos ?? []).map((p) => String(p.end_time ?? "")).filter(Boolean));
      if (datas.size > 1) temDiaDaSemana = true;

      const respondeu = a.chaves.length > 0;
      if (respondeu && !formaUtil) formaUtil = forma.nome;

      leituras.push({
        forma: forma.nome,
        respondeu,
        quantidadeDeChaves: a.chaves.length || null,
        chaves: a.chaves,
        maior: a.maior,
        menor: a.menor,
        variaEntreChaves: a.varia,
        pontosNaResposta: pontos?.length ?? 0,
        detalhe: respondeu
          ? `${a.chaves.length} chave(s) · ${pontos?.length ?? 0} ponto(s)` +
            (a.varia ? ` · pico em ${a.maior?.chave} (${a.maior?.valor}), vale em ${a.menor?.chave} (${a.menor?.valor})`
                     : " · TODAS as chaves com o mesmo valor — não distingue horário")
          // A forma exata, para separar "não tem dado" de "estou lendo errado".
          : `sem mapa · ${pontos?.length ?? 0} ponto(s) · ${formaDoValor(primeiro)}`,
      });
    } catch (e) {
      leituras.push({
        forma: forma.nome, respondeu: false, quantidadeDeChaves: null, chaves: [],
        maior: null, menor: null, variaEntreChaves: false, pontosNaResposta: 0,
        detalhe: sanitizar((e as Error).message),
      });
    }
  }

  return { conta: rotuloDaConta, leituras, formaUtil, temDiaDaSemana, texto: montar(rotuloDaConta, leituras, formaUtil, temDiaDaSemana) };
}

function montar(conta: string, leituras: LeituraDeHorario[], formaUtil: string | null, temDia: boolean): string {
  const out: string[] = [`sondagem de horários · ${conta}`, ""];
  for (const l of leituras) {
    out.push(`[${l.respondeu ? "SIM" : "NÃO"}] ${l.forma.padEnd(22)} ${l.detalhe}`);
    if (l.chaves.length) out.push(`      chaves: ${l.chaves.slice(0, 26).join(", ")}${l.chaves.length > 26 ? "…" : ""}`);
  }
  out.push("");

  if (!formaUtil) {
    out.push("NENHUMA forma devolveu mapa de horários para esta conta.");
    const vazio = leituras.some((l) => l.detalhe.includes("objeto VAZIO"));
    out.push(vazio
      ? "A métrica ACEITA a chamada e responde vazio — não é erro de leitura nossa,"
      : "A forma do retorno não é a esperada — pode ser leitura no lugar errado,");
    out.push(vazio
      ? "é ausência de dado. Vale repetir em outra conta antes de concluir."
      : "e vale conferir a forma acima antes de concluir.");
    out.push("");
    out.push("Caminho alternativo: 'melhores horários' também sai do que já");
    out.push("coletamos — a hora de publicação de cada post cruzada com o");
    out.push("alcance e o engajamento que ele teve. Não é 'quando a audiência");
    out.push("está online', é 'quando os posts desta conta funcionaram', que é");
    out.push("mais perto da pergunta.");
    return out.join("\n");
  }

  out.push(`Forma que serve: ${formaUtil}.`);
  const util = leituras.find((l) => l.forma === formaUtil)!;
  out.push(util.quantidadeDeChaves === 24
    ? "24 chaves → é hora do dia (0–23), como esperado."
    : `${util.quantidadeDeChaves} chaves → NÃO é a grade de 24 horas; conferir o que cada chave significa antes de usar.`);
  out.push(temDia
    ? "Mais de um ponto na resposta → dá para separar por dia."
    : "Um ponto só → é uma FOTO da presença, sem dia da semana. Dia da semana exigiria acumular por snapshot.");
  out.push(util.variaEntreChaves
    ? "Os valores variam entre as chaves → há pico e vale para recomendar."
    : "Valores CONSTANTES → o mapa não distingue horário nesta conta, e recomendar seria inventar.");
  out.push("");
  out.push("Lembrete: presença de audiência ≠ melhor horário para publicar.");
  out.push("Publicar no pico é publicar junto de todo mundo. A recomendação só");
  out.push("fecha cruzando isto com o desempenho real das publicações.");
  return out.join("\n");
}
