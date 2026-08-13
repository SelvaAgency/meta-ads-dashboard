/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Por que a rodada falhou — e não só que ela falhou
 * ─────────────────────────────────────────────────────────────────────────────
 *  Puro, compartilhado. Os números da execução já estão gravados; o que faltava
 *  era a leitura que separa as hipóteses:
 *
 *    LIMITE            as contas do FIM da fila falham, e o código da Meta é de
 *                      volume. Otimizar chamadas resolve.
 *    CONTA ESPECÍFICA  falham as mesmas contas, em qualquer posição, com código
 *                      de token ou permissão. Otimizar não resolveria nada.
 *
 *  A diferença está na POSIÇÃO, e é por isso que ela é calculada em vez de
 *  olhada: numa lista de doze linhas, "as últimas falharam" e "algumas
 *  falharam" parecem a mesma coisa para quem lê rápido — e levam a consertos
 *  opostos.
 *
 *  ── O código da Meta é a segunda testemunha ────────────────────────────────
 *  Posição sozinha pode enganar: se a última conta da fila é justamente a do
 *  token vencido, o padrão parece esgotamento. O código desempata — 4, 17, 32 e
 *  613 são de volume; 190 é token; 10 e 200 são permissão.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface ContaNaRodada {
  accountId: number;
  status: string;
  nota: string;
  ms?: number;
  chamadas?: number;
  chamadasComErro?: number;
}

export interface ExecucaoCompleta {
  origem: string;
  executadaEm: string | Date;
  tentados: number;
  ok: number;
  parciais: number;
  erros: number;
  pulados: number;
  duracaoMs?: number | null;
  chamadas?: number | null;
  chamadasComErro?: number | null;
  detalheJson?: unknown;
}

/** Códigos que a Meta usa para dizer "chamadas demais". */
export const CODIGOS_DE_LIMITE = [4, 17, 32, 613, 80004];
/** Códigos que apontam para a CONTA, e que otimizar chamadas não resolveria. */
export const CODIGOS_DE_ACESSO = [10, 190, 200, 463];

/** Extrai o código da mensagem: "Meta (4): ..." ou "Meta (190/463): ...". */
export function codigoDaMeta(nota: string): number | null {
  const m = /Meta \((\d+)/.exec(nota ?? "");
  return m ? Number(m[1]) : null;
}

export type PadraoDeFalha = "sem_falhas" | "limite" | "conta_especifica" | "indeterminado";

export interface ResumoDaExecucao {
  padrao: PadraoDeFalha;
  veredito: string;
  texto: string;
}

const seg = (ms: number) => `${Math.round(ms / 1000)}s`;
const hora = (d: string | Date) =>
  (d instanceof Date ? d : new Date(d)).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "medium" });

export function resumirExecucao(e: ExecucaoCompleta | null | undefined): ResumoDaExecucao {
  if (!e) {
    return {
      padrao: "indeterminado",
      veredito: "Nenhuma execução registrada ainda.",
      texto: "Nenhuma execução registrada ainda.\nRode a coleta completa ou espere o cron.",
    };
  }

  const contas = (Array.isArray(e.detalheJson) ? e.detalheJson : []) as ContaNaRodada[];
  const fim = e.executadaEm instanceof Date ? e.executadaEm : new Date(e.executadaEm);
  const inicio = e.duracaoMs ? new Date(fim.getTime() - e.duracaoMs) : null;
  const comProblema = contas.filter((c) => c.status === "erro" || c.status === "parcial");

  // ── A posição das falhas na fila ──────────────────────────────────────────
  // Média das posições relativas: perto de 1 significa concentradas no fim.
  const posicoes = comProblema
    .map((c) => contas.findIndex((x) => x.accountId === c.accountId))
    .filter((i) => i >= 0)
    .map((i) => (contas.length > 1 ? i / (contas.length - 1) : 0));
  const posicaoMedia = posicoes.length
    ? posicoes.reduce((a, b) => a + b, 0) / posicoes.length
    : null;

  const codigos = comProblema.map((c) => codigoDaMeta(c.nota)).filter((n): n is number => n !== null);
  const temCodigoDeLimite = codigos.some((c) => CODIGOS_DE_LIMITE.includes(c));
  const temCodigoDeAcesso = codigos.some((c) => CODIGOS_DE_ACESSO.includes(c));

  let padrao: PadraoDeFalha = "indeterminado";
  let veredito: string;

  if (comProblema.length === 0) {
    padrao = "sem_falhas";
    veredito =
      `Nenhuma conta falhou nesta rodada${e.chamadas ? `, em ${e.chamadas} chamadas` : ""}. ` +
      "Se as 06:20 falharam, a causa não é o volume — é preciso comparar com a rodada daquele horário.";
  } else if (temCodigoDeLimite) {
    // O código é a testemunha mais forte: ele diz "chamadas demais" com todas
    // as letras, e não depende de interpretar posição.
    padrao = "limite";
    veredito =
      `A Meta recusou por VOLUME (código ${codigos.filter((c) => CODIGOS_DE_LIMITE.includes(c)).join(", ")}). ` +
      "Reduzir chamadas por conta resolve — é o caso de otimizar o coletor.";
  } else if (temCodigoDeAcesso) {
    padrao = "conta_especifica";
    veredito =
      `As falhas têm código de acesso (${codigos.filter((c) => CODIGOS_DE_ACESSO.includes(c)).join(", ")}), e não de volume. ` +
      "É token ou permissão da conta — otimizar chamadas não mudaria nada.";
  } else if (posicaoMedia !== null && posicaoMedia >= 0.6 && comProblema.length >= 2) {
    padrao = "limite";
    veredito =
      "As falhas se concentram no FIM da fila, o que é padrão de esgotamento — " +
      "mas sem código de limite da Meta para confirmar. Vale olhar as mensagens abaixo.";
  } else {
    padrao = "conta_especifica";
    veredito =
      "As falhas estão espalhadas pela fila, e não concentradas no fim. " +
      "Isso aponta para conta(s) específica(s), e não para volume.";
  }

  const linhas: string[] = [
    `rodada ${e.origem === "cron" ? "automática" : "manual"}`,
    inicio ? `início:  ${hora(inicio)}` : "início:  não registrado",
    `fim:     ${hora(fim)}`,
    e.duracaoMs ? `duração: ${seg(e.duracaoMs)}` : "duração: não registrada",
    "",
    `contas:   ${e.tentados} tentadas · ${e.ok} ok · ${e.parciais} parcial(is) · ${e.erros} com erro · ${e.pulados} pulada(s)`,
    e.chamadas != null
      ? `chamadas: ${e.chamadas} no total · ${e.chamadasComErro ?? 0} com erro` +
        (e.tentados > 0 ? ` · ${Math.round(e.chamadas / e.tentados)} por conta` : "")
      : "chamadas: não registradas (rodada anterior à instrumentação)",
    contas.length && e.duracaoMs
      ? `tempo:    ${seg(e.duracaoMs / contas.length)} por conta, em média`
      : "",
    "",
  ];

  if (contas.length) {
    linhas.push("── por conta, na ORDEM DA FILA ──");
    contas.forEach((c, i) => {
      const codigo = codigoDaMeta(c.nota);
      linhas.push(
        `${String(i + 1).padStart(2)}. #${c.accountId} · ${c.status.padEnd(7)}` +
        (c.chamadas != null ? ` · ${String(c.chamadas).padStart(3)} chamadas` : "") +
        (c.chamadasComErro ? ` (${c.chamadasComErro} erro)` : "") +
        (c.ms != null ? ` · ${seg(c.ms)}` : "") +
        (codigo !== null ? ` · Meta ${codigo}` : "") +
        ` · ${c.nota}`,
      );
    });
    linhas.push("");
  }

  if (posicaoMedia !== null) {
    linhas.push(
      `posição média das falhas na fila: ${(posicaoMedia * 100).toFixed(0)}% ` +
      "(0% = começo, 100% = fim)",
      "",
    );
  }

  linhas.push("── VEREDITO ──", veredito);
  return { padrao, veredito, texto: linhas.filter((l) => l !== undefined).join("\n") };
}
