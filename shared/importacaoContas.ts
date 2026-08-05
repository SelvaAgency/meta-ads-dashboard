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
  | "possivel_duplicada"
  | "corresponde_a_cliente";

export const ROTULO_STATUS: Record<StatusImportacao, string> = {
  nova: "Nova conta",
  ja_existe: "Já existe no Tracker",
  ja_existe_inativa: "Já existe, desativada",
  nome_diferente: "Já existe com outro nome",
  possivel_duplicada: "Possível duplicada",
  corresponde_a_cliente: "Parece ser um cliente que já existe",
};

export const EXPLICACAO_STATUS: Record<StatusImportacao, string> = {
  nova: "Ainda não está no Tracker.",
  ja_existe: "Importar de novo sobrescreveria nome, moeda e fuso.",
  ja_existe_inativa: "Foi desativada no Tracker. Importar reativaria o cliente.",
  nome_diferente: "O nome no Tracker foi alterado à mão. Importar desfaria isso.",
  possivel_duplicada: "Outro cliente já usa este nome, com outro ID de conta.",
  corresponde_a_cliente: "Este cliente já existe no Tracker, hoje só com Site. Importar criaria um segundo. Use Mesclar.",
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
  /** Cliente atendido só no Site — o candidato natural a receber a mídia. */
  semMidia?: boolean;
}

export interface ContaClassificada extends ContaDaMeta {
  status: StatusImportacao;
  /** Nome que o Tracker mostra hoje, quando a conta já existe. */
  nomeAtual: string | null;
  /** Vem marcada na tela? Só `nova`. */
  marcadaPorPadrao: boolean;
}

/**
 * Os dois nomes são provavelmente do MESMO cliente?
 *
 * Igualdade exata não basta, e o caso da Aiká provou: o Tracker tinha "Aiká" e
 * a Meta trouxe "Aika 01". Normalizados viram "aika" e "aika01" — diferentes
 * por dois caracteres, e a importação criou um segundo cliente.
 *
 * Então um nome que é o outro MAIS um sufixo curto ou numérico conta como o
 * mesmo. É a forma como conta de anúncios costuma ser batizada: o nome do
 * cliente seguido de 01, 02, BR, v2.
 *
 * A regra erra para o lado seguro. "musa" e "musatextil" NÃO casam (o sufixo
 * tem 6 letras), e mesmo se casassem o custo seria um aviso a mais e um clique
 * — enquanto o erro oposto é o que acabou de acontecer: dois clientes Aiká.
 */
const SUFIXO_CURTO = 3;
export function pareceMesmoCliente(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = normalizar(a), y = normalizar(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [curto, longo] = x.length <= y.length ? [x, y] : [y, x];
  // Nome curto demais casaria com meio portfólio ("um" dentro de "umbro").
  if (curto.length < 4 || !longo.startsWith(curto)) return false;
  const sobra = longo.slice(curto.length);
  return sobra.length <= SUFIXO_CURTO || /^\d+$/.test(sobra);
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

  return daMeta.map((conta) => {
    const id = idLimpo(conta.accountId);
    const existente = porId.get(id);

    // Mesmo nome (ou quase — ver pareceMesmoCliente) com OUTRO id.
    const parecidos = noTracker.filter(
      (c) => idLimpo(c.accountId) !== id && pareceMesmoCliente(c.nome, conta.nome),
    );
    // Cliente sem mídia tem precedência: é exatamente o caso que deve MESCLAR.
    const candidato = parecidos.find((c) => c.semMidia) ?? parecidos[0] ?? null;

    const status: StatusImportacao = existente
      ? !existente.ativa
        ? "ja_existe_inativa"
        : normalizar(existente.nome) !== normalizar(conta.nome)
          ? "nome_diferente"
          : "ja_existe"
      : candidato
        ? candidato.semMidia ? "corresponde_a_cliente" : "possivel_duplicada"
        : "nova";

    return {
      ...conta,
      accountId: id,
      status,
      nomeAtual: existente?.nome ?? candidato?.nome ?? null,
      marcadaPorPadrao: status === "nova",
    };
  });
}

/** Status que o servidor aceita importar sem confirmação explícita. */
/**
 * Status que o servidor aceita importar.
 *
 * `corresponde_a_cliente` fica de FORA: importar ali é justamente criar a
 * duplicata que se quer evitar. O caminho é mesclar.
 */
export const podeImportarSemForcar = (s: StatusImportacao): boolean =>
  s === "nova" || s === "possivel_duplicada";

export const contasMarcadasPorPadrao = (contas: ContaClassificada[]): string[] =>
  contas.filter((c) => c.marcadaPorPadrao).map((c) => c.accountId);
