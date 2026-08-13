/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Como ler o estado da última coleta
 * ─────────────────────────────────────────────────────────────────────────────
 *  Puro, compartilhado. A pergunta que esta tela responde é "o robô rodou?", e
 *  ela tem uma armadilha própria: uma coleta manual bem-sucedida NÃO responde
 *  que o robô rodou. Se as duas se misturassem num "última coleta" só, um clique
 *  às 10h esconderia o silêncio das 06:20 — que é exatamente o que precisa
 *  aparecer.
 *
 *  Por isso as duas origens são lidas separadas, e é a AUTOMÁTICA que governa o
 *  sinal principal.
 *
 *  ── "Nunca rodou" não é erro ───────────────────────────────────────────────
 *  Cliente recém-conectado, ou instalação nova, não tem execução nenhuma. Pintar
 *  isso de vermelho ensinaria a ignorar o vermelho.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface ExecucaoDeColeta {
  origem: string;
  escopo: string;
  dia: string;
  tentados: number;
  ok: number;
  parciais: number;
  erros: number;
  pulados: number;
  executadaEm: string | Date;
}

export type NivelDaColeta = "ok" | "atencao" | "erro" | "silencio" | "nunca";

export interface LeituraDaColeta {
  nivel: NivelDaColeta;
  /** Uma linha, pronta para a tela. */
  titulo: string;
  detalhe: string;
}

/** Acima disto, o robô está calado há tempo demais para ser normal. */
export const HORAS_ATE_SILENCIO = 30;

const dois = (n: number) => String(n).padStart(2, "0");

/** "hoje às 06:20", "ontem às 18:20", ou a data quando for mais antigo. */
export function quando(execucaoEm: string | Date, agora: Date): string {
  const d = execucaoEm instanceof Date ? execucaoEm : new Date(execucaoEm);
  const hora = `${dois(d.getHours())}:${dois(d.getMinutes())}`;
  const dia = (x: Date) => `${x.getFullYear()}-${dois(x.getMonth() + 1)}-${dois(x.getDate())}`;
  const ontem = new Date(agora.getTime() - 86_400_000);
  if (dia(d) === dia(agora)) return `hoje às ${hora}`;
  if (dia(d) === dia(ontem)) return `ontem às ${hora}`;
  return `${dois(d.getDate())}/${dois(d.getMonth() + 1)} às ${hora}`;
}

/**
 * O estado da coleta automática.
 *
 * `erros` só derruba para vermelho quando NADA deu certo — uma conta com token
 * vencido no meio de doze não é uma coleta falha, e tratá-la assim faria o sinal
 * ficar vermelho todo dia até alguém aprender a ignorá-lo.
 */
export function lerColetaAutomatica(
  execucao: ExecucaoDeColeta | null | undefined,
  agora: Date,
): LeituraDaColeta {
  if (!execucao) {
    return {
      nivel: "nunca",
      titulo: "Coleta automática ainda não rodou",
      detalhe: "A primeira execução acontece às 06:20. Até lá, só existe o que foi coletado à mão.",
    };
  }

  const d = execucao.executadaEm instanceof Date ? execucao.executadaEm : new Date(execucao.executadaEm);
  const horas = (agora.getTime() - d.getTime()) / 3_600_000;
  const quandoTexto = quando(d, agora);
  const resumo =
    `${execucao.ok} de ${execucao.tentados} conta(s)` +
    (execucao.parciais ? ` · ${execucao.parciais} parcial(is)` : "") +
    (execucao.erros ? ` · ${execucao.erros} com erro` : "") +
    (execucao.pulados ? ` · ${execucao.pulados} pulada(s)` : "");

  // Silêncio vem antes do resultado: uma coleta que deu tudo certo há três dias
  // é um problema maior que uma que falhou hoje.
  if (horas > HORAS_ATE_SILENCIO) {
    return {
      nivel: "silencio",
      titulo: `Última coleta automática: ${quandoTexto}`,
      detalhe: `Mais de ${Math.floor(horas)}h sem rodar — o esperado é a cada 24h. Confira se o serviço está no ar.`,
    };
  }
  if (execucao.tentados > 0 && execucao.ok === 0 && execucao.parciais === 0) {
    return {
      nivel: "erro",
      titulo: `Última coleta automática: ${quandoTexto}`,
      detalhe: `Nenhuma conta foi coletada — ${resumo}.`,
    };
  }
  if (execucao.erros > 0 || execucao.parciais > 0) {
    return {
      nivel: "atencao",
      titulo: `Última coleta automática: ${quandoTexto}`,
      detalhe: resumo,
    };
  }
  return {
    nivel: "ok",
    titulo: `Última coleta automática: ${quandoTexto}`,
    detalhe: resumo,
  };
}

/**
 * A linha da coleta manual, quando existir.
 *
 * Sempre secundária: ela informa que alguém mexeu, e nunca substitui o sinal do
 * robô. Devolve `null` quando nunca houve — ausência de clique não é notícia.
 */
export function lerColetaManual(
  execucao: ExecucaoDeColeta | null | undefined,
  agora: Date,
): string | null {
  if (!execucao) return null;
  const alvo = execucao.tentados === 1 ? "1 conta" : `${execucao.tentados} contas`;
  return `Última coleta manual: ${quando(execucao.executadaEm, agora)} · ${alvo}`;
}
