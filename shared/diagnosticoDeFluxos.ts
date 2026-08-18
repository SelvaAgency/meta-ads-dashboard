/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Dá para separar quem ENTROU de quem SAIU?
 * ─────────────────────────────────────────────────────────────────────────────
 *  Puro. Não faz chamada nenhuma: lê os snapshots que a coleta já guardou e
 *  responde com aritmética. É a diferença entre sondar a API de novo e ler o
 *  que já medimos — a resposta desta pergunta está no banco desde a primeira
 *  coleta com breakdown.
 *
 *  ── A pergunta ────────────────────────────────────────────────────────────
 *  `followers_count` é ESTOQUE. A diferença entre dois estoques dá o SALDO, e
 *  só. Um saldo de +8 pode ser 8 entradas e 0 saídas, ou 100 e 92 — as duas
 *  histórias são o mesmo número, e nenhuma subtração as separa.
 *
 *  Separar exige uma fonte que conte os dois fluxos. A candidata é
 *  `follows_and_unfollows` com `breakdown=follow_type`, que devolve as dimensões
 *  FOLLOWER e NON_FOLLOWER — e não FOLLOW / UNFOLLOW. Duas leituras cabem:
 *
 *    A  DIREÇÃO DA AÇÃO      FOLLOWER = seguiu, NON_FOLLOWER = deixou de seguir
 *    B  SEGMENTAÇÃO          a mesma dimensão que o `reach` usa para separar
 *                            quem já segue de quem não segue
 *
 *  ── Como a aritmética decide ──────────────────────────────────────────────
 *  Se A estiver certa, então em TODO dia consecutivo:
 *
 *      total(hoje) − total(ontem) = FOLLOWER(hoje) − NON_FOLLOWER(hoje)
 *
 *  A identidade é exata, não aproximada. Uma única divergência refuta A — não
 *  há margem de erro numa igualdade contábil. E fechar por acaso em cinco dias
 *  seguidos, com números que variam, é improvável o bastante para confirmar.
 *
 *  ── Por que só dias CONSECUTIVOS ──────────────────────────────────────────
 *  Com um buraco de coleta no meio, o delta do total abrange dois dias enquanto
 *  o breakdown fala de um — a conta não fecharia por um motivo que nada tem a
 *  ver com a semântica, e o teste acusaria a inocente.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import {
  DIAS_PARA_CONFIRMAR_DIRECAO, validarDirecaoDeSeguidores, type AmostraDeSeguidores,
} from "./socialSnapshot";

export interface DiaConferido {
  dia: string;
  totalOntem: number | null;
  totalHoje: number | null;
  /** O saldo REAL do dia: diferença entre dois estoques. Sempre confiável. */
  saldo: number | null;
  follower: number | null;
  naoSeguidor: number | null;
  /** `FOLLOWER − NON_FOLLOWER` — o que a leitura A prevê para o saldo. */
  previstoPelaLeituraA: number | null;
  /** `true` só quando os dois batem exatamente. */
  fecha: boolean | null;
  /** `follower_count`, a métrica usada HOJE como "entradas". */
  followerCount: number | null;
  /** O que a regra atual publicaria como saídas: `follower_count − saldo`. */
  saidasPelaRegraAtual: number | null;
}

export interface DiagnosticoDeFluxos {
  veredito: "confirmado" | "refutado" | "indeterminado";
  explicacao: string;
  diasConferidos: number;
  diasQueBateram: number;
  /** Dias com breakdown presente — sem ele não há o que conferir. */
  diasComBreakdown: number;
  dias: DiaConferido[];
  /** O que a tela pode publicar hoje, em uma frase. */
  podePublicarFluxos: boolean;
  texto: string;
}

const proximoDia = (d: string) => {
  const [a, m, x] = d.split("-").map(Number);
  const t = new Date(Date.UTC(a, m - 1, x + 1));
  return t.toISOString().slice(0, 10);
};

const sinal = (v: number | null) =>
  v == null ? "–" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v)}`;

/**
 * Monta o diagnóstico a partir das amostras já guardadas.
 *
 * `followerCount` entra junto porque a pergunta prática não é só "a leitura A
 * está certa?", e sim "o que estamos publicando hoje está certo?". As duas
 * colunas lado a lado mostram, dia a dia, o que a regra atual afirma e o que o
 * breakdown diria — e é a comparação que torna a divergência visível.
 */
export function diagnosticarFluxos(
  amostras: Array<AmostraDeSeguidores & { followerCount: number | null }>,
): DiagnosticoDeFluxos {
  const ordenadas = amostras.slice().sort((a, b) => a.dia.localeCompare(b.dia));
  const v = validarDirecaoDeSeguidores(ordenadas);

  const dias: DiaConferido[] = [];
  for (let i = 1; i < ordenadas.length; i++) {
    const hoje = ordenadas[i];
    const ontem = ordenadas[i - 1];
    if (proximoDia(ontem.dia) !== hoje.dia) continue;

    const saldo = hoje.total != null && ontem.total != null ? hoje.total - ontem.total : null;
    const previsto = hoje.follower != null && hoje.naoSeguidor != null
      ? hoje.follower - hoje.naoSeguidor
      : null;
    // A regra ATUAL: saídas = follower_count − saldo, anulada se der negativo.
    const derivadas = hoje.followerCount != null && saldo != null
      ? hoje.followerCount - saldo
      : null;

    dias.push({
      dia: hoje.dia,
      totalOntem: ontem.total, totalHoje: hoje.total, saldo,
      follower: hoje.follower, naoSeguidor: hoje.naoSeguidor,
      previstoPelaLeituraA: previsto,
      fecha: saldo == null || previsto == null ? null : saldo === previsto,
      followerCount: hoje.followerCount,
      saidasPelaRegraAtual: derivadas == null || derivadas < 0 ? null : derivadas,
    });
  }

  const diasComBreakdown = ordenadas.filter(
    (a) => typeof a.follower === "number" && typeof a.naoSeguidor === "number").length;

  const out: string[] = [];
  out.push("ENTRADAS × SAÍDAS · de onde vem cada número");
  out.push(`${ordenadas.length} dia(s) de snapshot · ${diasComBreakdown} com breakdown · ${dias.length} par(es) consecutivo(s)`);
  out.push("");

  out.push("── 1. O QUE ESTÁ SENDO USADO HOJE ──");
  out.push("  entradas  GET /{ig-user-id}/insights");
  out.push("            metric=follower_count&period=day");
  out.push("            → contagem BRUTA de novos seguidores do dia, medida pela Meta");
  out.push("  saldo     followers_count do perfil, diferença entre duas coletas");
  out.push("            → aritmética de estoques, não depende de semântica nenhuma");
  out.push("  saídas    DERIVADAS: follower_count − saldo");
  out.push("            → NÃO é medição. É o que sobra da identidade.");
  out.push("");

  out.push("── 2 e 3. O QUE DEVERIA DAR ENTRADAS E SAÍDAS REAIS ──");
  out.push("  GET /{ig-user-id}/insights");
  out.push("      metric=follows_and_unfollows&period=day");
  out.push("      &metric_type=total_value&breakdown=follow_type");
  out.push("  A Meta devolve as dimensões FOLLOWER e NON_FOLLOWER — e não");
  out.push("  FOLLOW / UNFOLLOW. Os nomes não decidem se são entradas e saídas.");
  out.push("");

  out.push("── 4. DIÁRIO OU DERIVADO? ──");
  out.push("  follower_count           DIÁRIO, medido — mas é fluxo, e acumula");
  out.push("                           de 00:00 até a hora da coleta");
  out.push("  followers_count          ESTOQUE, fotografia do momento da coleta");
  out.push("  saldo do dia             DERIVADO de dois estoques — 24h exatas");
  out.push("  follows_and_unfollows    DIÁRIO, medido, com breakdown");
  out.push("  saídas de hoje na tela   DERIVADAS de uma subtração entre os dois");
  out.push("                           primeiros — e eles cobrem janelas diferentes");
  out.push("");

  out.push("── 5. A CONFERÊNCIA, DIA A DIA ──");
  if (!dias.length) {
    out.push("  Nenhum par de dias consecutivos com dado. Sem isso não há o que conferir.");
  } else {
    out.push("  dia          saldo real   FOLLOWER−NON_FOLLOWER   bate?   follower_count   saídas hoje");
    for (const d of dias) {
      const linha = [
        d.dia.padEnd(12),
        sinal(d.saldo).padStart(10),
        (d.previstoPelaLeituraA == null
          ? "–"
          : `${d.follower} − ${d.naoSeguidor} = ${sinal(d.previstoPelaLeituraA)}`).padStart(22),
        (d.fecha == null ? "  ?" : d.fecha ? " SIM" : " NÃO").padStart(7),
        (d.followerCount == null ? "–" : String(d.followerCount)).padStart(16),
        (d.saidasPelaRegraAtual == null ? "anulada" : String(d.saidasPelaRegraAtual)).padStart(13),
      ].join("");
      out.push(`  ${linha}`);
    }
  }
  out.push("");

  out.push("── VEREDITO ──");
  out.push(`  ${v.veredito.toUpperCase()} · ${v.explicacao}`);
  if (v.veredito === "indeterminado") {
    out.push(`  São precisos ${DIAS_PARA_CONFIRMAR_DIRECAO} dias consecutivos com total E breakdown.`);
  }
  out.push("");

  out.push("── O QUE ISSO AUTORIZA ──");
  if (v.veredito === "confirmado") {
    out.push("  ENTRADAS = FOLLOWER · SAÍDAS = NON_FOLLOWER, as duas MEDIDAS.");
    out.push("  O gráfico pode mostrar os dois fluxos como independentes, e o saldo");
    out.push("  passa a ser entradas − saídas, que aí é a identidade correta.");
  } else if (v.veredito === "refutado") {
    out.push("  A dimensão NÃO descreve entradas e saídas — é segmentação de audiência.");
    out.push("  Não existe fonte para separar os dois fluxos nesta conta.");
    out.push("  O saldo continua correto; entradas e saídas ficam INDISPONÍVEIS.");
  } else {
    out.push("  Ainda não dá para afirmar. Enquanto isso, o único número seguro é o");
    out.push("  SALDO — que é diferença de estoques e não depende de semântica.");
    out.push("  `follower_count` sozinho não separa os fluxos: ele conta entradas,");
    out.push("  e a saída derivada dele herda a janela parcial da coleta.");
  }

  return {
    veredito: v.veredito,
    explicacao: v.explicacao,
    diasConferidos: v.diasConferidos,
    diasQueBateram: v.diasQueBateram,
    diasComBreakdown,
    dias,
    podePublicarFluxos: v.veredito === "confirmado",
    texto: out.join("\n"),
  };
}
