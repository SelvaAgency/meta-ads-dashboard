/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Importação de contas Meta — o que é novo, o que já existe, o que vem marcado
 * ─────────────────────────────────────────────────────────────────────────────
 *  Função pura, compartilhada entre servidor e tela. Compartilhada de propósito:
 *  a UI precisa desenhar o status e o backend precisa RECUSAR o que a UI diz não
 *  poder importar. Duas cópias da regra divergiriam, e a divergência apareceria
 *  como um cliente sobrescrito — o dano que esta tela existe para evitar.
 *
 *  ── O padrão é NÃO importar ────────────────────────────────────────────────
 *  Só `nova` nasce marcada. Todo o resto — já existe, existe inativa, nome
 *  diferente, possível duplicada — nasce DESMARCADO.
 *
 *  A assimetria é deliberada. Deixar de importar uma conta nova custa um clique;
 *  reimportar uma conta existente sobrescreve o nome que alguém escolheu à mão,
 *  reativa cliente que foi desativado de propósito e mexe em moeda e fuso. Um
 *  erro se corrige na hora, o outro só aparece dias depois, quando o nome errado
 *  já vazou para relatório e e-mail.
 *
 *  ── Por que "possível duplicada" existe ────────────────────────────────────
 *  Mesmo nome, accountId diferente. Acontece quando a agência abre uma conta de
 *  anúncios nova para o mesmo cliente. Importar sem olhar cria um segundo
 *  cliente com o mesmo nome no seletor, e a partir daí ninguém sabe qual é qual.
 *  Não dá para decidir isso sozinho — então o robô aponta e a pessoa escolhe.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type StatusImportacao =
  | "nova"
  | "ja_existe"
  | "ja_existe_inativa"
  | "nome_diferente"
  | "possivel_duplicada";

export const ROTULO_STATUS: Record<StatusImportacao, string> = {
  nova: "Nova conta",
  ja_existe: "Já existe no Tracker",
  ja_existe_inativa: "Já existe, desativada",
  nome_diferente: "Já existe com outro nome",
  possivel_duplicada: "Possível duplicada",
};

export const EXPLICACAO_STATUS: Record<StatusImportacao, string> = {
  nova: "Ainda não está no Tracker.",
  ja_existe: "Importar de novo sobrescreveria nome, moeda e fuso.",
  ja_existe_inativa: "Foi desativada no Tracker. Importar reativaria o cliente.",
  nome_diferente: "O nome no Tracker foi alterado à mão. Importar desfaria isso.",
  possivel_duplicada: "Outro cliente já usa este nome, com outro ID de conta.",
};

export interface ContaDaMeta {
  /** Sem o prefixo `act_`. */
  accountId: string;
  nome: string;
  currency?: string | null;
  timezone?: string | null;
}

export interface ContaNoTracker {
  accountId: string;
  nome: string | null;
  ativa: boolean;
}

export interface ContaClassificada extends ContaDaMeta {
  status: StatusImportacao;
  /** Nome que o Tracker mostra hoje, quando a conta já existe. */
  nomeAtual: string | null;
  /** Vem marcada na tela? Só `nova`. */
  marcadaPorPadrao: boolean;
}

/** Comparação de nome: sem acento, caixa nem separador. */
const normalizar = (v: string | null | undefined): string =>
  String(v ?? "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]/g, "");

/** `act_123` e `123` são a mesma conta. */
export const idLimpo = (v: string): string => String(v ?? "").replace(/^act_/i, "").trim();

export function classificarContas(
  daMeta: ContaDaMeta[],
  noTracker: ContaNoTracker[],
): ContaClassificada[] {
  const porId = new Map(noTracker.map((c) => [idLimpo(c.accountId), c]));
  const porNome = new Map<string, ContaNoTracker[]>();
  for (const c of noTracker) {
    const chave = normalizar(c.nome);
    if (!chave) continue;
    porNome.set(chave, [...(porNome.get(chave) ?? []), c]);
  }

  return daMeta.map((conta) => {
    const id = idLimpo(conta.accountId);
    const existente = porId.get(id);

    const status: StatusImportacao = existente
      ? !existente.ativa
        ? "ja_existe_inativa"
        : normalizar(existente.nome) !== normalizar(conta.nome)
          ? "nome_diferente"
          : "ja_existe"
      // Mesmo nome com OUTRO id: não é a mesma conta, mas provavelmente o mesmo
      // cliente. Ver cabeçalho.
      : (porNome.get(normalizar(conta.nome)) ?? []).some((c) => idLimpo(c.accountId) !== id)
        ? "possivel_duplicada"
        : "nova";

    return {
      ...conta,
      accountId: id,
      status,
      nomeAtual: existente?.nome ?? null,
      marcadaPorPadrao: status === "nova",
    };
  });
}

/** Status que o servidor aceita importar sem confirmação explícita. */
export const podeImportarSemForcar = (s: StatusImportacao): boolean =>
  s === "nova" || s === "possivel_duplicada";

export const contasMarcadasPorPadrao = (contas: ContaClassificada[]): string[] =>
  contas.filter((c) => c.marcadaPorPadrao).map((c) => c.accountId);
