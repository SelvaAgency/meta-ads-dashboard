/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Quando vale gerar a análise de novo — e quando é só repetir a conta
 * ─────────────────────────────────────────────────────────────────────────────
 *  Puro: sem rede, sem banco, sem relógio próprio. `agora` entra por parâmetro
 *  justamente para a regra poder ser testada nos dois lados de cada limiar.
 *
 *  ── O que a auditoria de 19/08/2026 mediu ──────────────────────────────────
 *  Sete caminhos diferentes chegam a `refreshAccountAiStatus`, e nenhum
 *  perguntava se a análise anterior ainda servia. Duas chamadas com trinta
 *  segundos de diferença produziam a mesma leitura, cobrada duas vezes.
 *
 *  ── A janela é o guarda; o contexto é quem a atropela ──────────────────────
 *  Dentro da janela, reusa. Fora, gera. E contexto salvo DEPOIS da análise gera
 *  sempre, mesmo dentro da janela — porque contexto é alguém dizendo ao sistema
 *  algo que os números não mostram, e fazer essa pessoa esperar três horas para
 *  ver o efeito transformaria o campo de contexto em decoração.
 *
 *  ── Deriva de métrica NÃO invalida, e isso é escolha ───────────────────────
 *  Entre duas sincronizações com minutos de diferença, o gasto muda em
 *  centavos. Tratar isso como "os dados mudaram" faria a janela não proteger
 *  nada — seria o comportamento de hoje com um nome novo. Regenerar porque o
 *  gasto subiu R$ 2 em três horas é exatamente a chamada duplicada que esta
 *  frente existe para eliminar.
 *
 *  O risco do outro lado — análise velha passando por atual — é limitado pelo
 *  tamanho da janela, e é por isso que ela é curta perto do ciclo diário.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * Por quanto tempo uma análise continua valendo para chamadas AUTOMÁTICAS.
 *
 * ── Por que 180 minutos ────────────────────────────────────────────────────
 * O número tem de ficar entre duas fronteiras concretas:
 *
 *   piso   maior que qualquer rajada de disparos. Deploys, sincronizações e
 *          cliques em sequência acontecem em MINUTOS. Uma janela de 5 ou 10
 *          minutos deixaria passar a duplicata de meia hora depois, que é
 *          igualmente inútil.
 *
 *   teto   bem menor que o ciclo do cron, que é de 24h. Se a janela chegasse
 *          perto de um dia, a rodada automática das 06:00 se auto-suprimiria
 *          numa conta parada — e a leitura diária deixaria de ser diária sem
 *          ninguém pedir.
 *
 * Três horas fica com folga nos dois lados. Não é uma medida de "quando a
 * análise fica errada": é o intervalo em que regerá-la não muda a resposta.
 *
 * Trocar o valor é trocar esta constante. Nada mais depende dele.
 */
export const AI_STATUS_FRESHNESS_MINUTES = 180;

/**
 * Por que a análise foi (ou não foi) gerada.
 *
 * Vira contagem no log de cada ciclo: sem os motivos separados, "12 contas, 4
 * análises" não diz se as outras 8 foram economia ou falha.
 */
export type MotivoDaDecisao =
  | "forcado"          // pedido explícito de gente
  | "sem_analise"      // conta nunca analisada
  | "contexto_mudou"   // alguém salvou contexto depois da última leitura
  | "expirada"         // fora da janela de frescor
  | "fresca";          // dentro da janela — a única que NÃO gera

export interface DecisaoDeFrescor {
  gerar: boolean;
  motivo: MotivoDaDecisao;
  /** Idade da análise em minutos, quando existe. Para o log dizer o número. */
  idadeMinutos: number | null;
}

const paraData = (v: Date | string | null | undefined): Date | null => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

/**
 * A decisão, e o motivo dela.
 *
 * A ordem das perguntas é a prioridade, e ela importa: `forcar` vem primeiro
 * porque um pedido explícito não se discute, e `contexto_mudou` vem antes da
 * janela porque ele a atropela.
 */
export function decidirGeracaoDaAnalise(e: {
  /** `aiStatusAt` da conta. `null` = nunca analisada. */
  analiseEm: Date | string | null | undefined;
  /** O contexto mais recente (conta ou ponto). `null` = não há contexto. */
  contextoEm: Date | string | null | undefined;
  /** `true` quando alguém clicou em Atualizar. Ignora tudo. */
  forcar?: boolean;
  agora: Date;
  /** Só para teste — a constante é o padrão. */
  janelaMinutos?: number;
}): DecisaoDeFrescor {
  const janela = e.janelaMinutos ?? AI_STATUS_FRESHNESS_MINUTES;
  const analise = paraData(e.analiseEm);
  const idadeMinutos = analise
    ? (e.agora.getTime() - analise.getTime()) / 60_000
    : null;

  if (e.forcar) return { gerar: true, motivo: "forcado", idadeMinutos };
  if (!analise) return { gerar: true, motivo: "sem_analise", idadeMinutos: null };

  // Mesma comparação que a tela já usa para dizer "análise desatualizada" — e
  // de propósito: se o aviso aparece, a próxima rodada tem de resolvê-lo.
  const contexto = paraData(e.contextoEm);
  if (contexto && contexto.getTime() > analise.getTime()) {
    return { gerar: true, motivo: "contexto_mudou", idadeMinutos };
  }

  // Análise no futuro (relógio torto, fuso trocado) conta como fresca: gerar
  // por causa de uma idade negativa seria agir sobre um erro de relógio.
  if ((idadeMinutos as number) > janela) {
    return { gerar: true, motivo: "expirada", idadeMinutos };
  }
  return { gerar: false, motivo: "fresca", idadeMinutos };
}

/** As contagens de um ciclo, para o log dizer o que aconteceu. */
export interface ResumoDoCiclo {
  contas: number;
  geradas: number;
  reusadas: number;
  falhas: number;
}

export function frasesDoCiclo(r: ResumoDoCiclo): string {
  return `${r.contas} conta(s) · ${r.geradas} análise(s) gerada(s) · `
    + `${r.reusadas} reusada(s) por frescor · ${r.falhas} falha(s)`;
}
