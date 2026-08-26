/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  As opções do contexto da conta — vocabulário único
 * ─────────────────────────────────────────────────────────────────────────────
 *  As duas listas viviam duplicadas em `ContextPanel` e `ContextoGeralPanel`,
 *  copiadas linha a linha. Duas cópias do mesmo vocabulário divergem no primeiro
 *  ajuste feito só numa — e o sintoma é mudo: a mesma conta mostraria o chip
 *  marcado numa tela e vazio na outra, porque o texto salvo não bate.
 *
 *  ── O que a auditoria encontrou ────────────────────────────────────────────
 *  Nenhum enum, nenhuma validação, nenhum filtro, nenhum relatório. As colunas
 *  são `varchar` livre, o zod aceita `z.string()`, e o prompt interpola o texto
 *  como veio. Trocar as opções não quebra contrato nenhum — o único risco é o
 *  valor JÁ SALVO deixar de casar com a lista nova, e é disso que a metade de
 *  baixo deste arquivo trata.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * As seis faixas de ticket.
 *
 * Os limites são os que a agência usa para conversar sobre porte de cliente —
 * não uma escala derivada de dado nenhum. Mudá-los é decisão de negócio, e por
 * isso eles ficam num lugar só.
 */
export const FAIXAS_DE_TICKET = [
  "Até R$ 199",
  "R$ 200 a R$ 500",
  "R$ 501 a R$ 2 mil",
  "R$ 2.001 a R$ 10 mil",
  "R$ 10.001 a R$ 100 mil",
  "Acima de R$ 100 mil",
] as const;

export const TIPOS_DE_NEGOCIO = [
  "E-commerce", "Serviço", "B2B", "Varejo físico", "Marketplace", "SaaS", "Outro",
] as const;

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  As faixas antigas, e o que dá para migrar sem inventar
 * ─────────────────────────────────────────────────────────────────────────────
 *  Três das quatro faixas antigas têm correspondente direto. A quarta —
 *  "Acima de R$2k" — cobre TRÊS faixas novas, e escolher uma delas inventaria
 *  uma precisão que o dado nunca teve: uma conta de R$ 300 mil viraria "R$ 2.001
 *  a R$ 10 mil" e ninguém desconfiaria.
 *
 *  Por isso ela não é migrada. O valor antigo continua salvo e a tela o exibe
 *  como está, marcado como anterior, para alguém reescolher. Perder o dado seria
 *  pior; adivinhá-lo, também.
 * ─────────────────────────────────────────────────────────────────────────────
 */
const MIGRACAO_DE_TICKET: Record<string, string> = {
  "Até R$100": "Até R$ 199",
  "R$100–500": "R$ 200 a R$ 500",
  "R$500–2k": "R$ 501 a R$ 2 mil",
};

export interface LeituraDaFaixa {
  /** A faixa atual a marcar. `null` quando o salvo não corresponde a nenhuma. */
  faixa: string | null;
  /** O valor salvo que não pôde ser migrado — a tela mostra como anterior. */
  legado: string | null;
}

export function lerFaixaDeTicket(salvo: string | null | undefined): LeituraDaFaixa {
  const v = (salvo ?? "").trim();
  if (!v) return { faixa: null, legado: null };
  if ((FAIXAS_DE_TICKET as readonly string[]).includes(v)) return { faixa: v, legado: null };
  const migrada = MIGRACAO_DE_TICKET[v];
  if (migrada) return { faixa: migrada, legado: null };
  // Sem correspondência: preserva sem adivinhar.
  return { faixa: null, legado: v };
}

// ─── Tipo de negócio: múltiplas categorias ───────────────────────────────────

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Uma coluna, várias categorias — e por que não virou JSON
 * ─────────────────────────────────────────────────────────────────────────────
 *  `businessType` é `varchar` e guardava um valor só. A leitura multi-valor usa
 *  a MESMA coluna, com os nomes separados por vírgula.
 *
 *  Nenhum nome da lista contém vírgula, então o separador não é ambíguo. E o
 *  formato é retrocompatível por construção: "B2B" salvo antes desta mudança lê
 *  como `["B2B"]` sem migração nenhuma de dado.
 *
 *  JSON teria exigido converter uma coluna existente com dado dentro — mais
 *  risco para resolver o mesmo problema. O que a coluna precisou foi de
 *  LARGURA: as sete categorias somam ~66 caracteres e `varchar(50)` truncaria
 *  em silêncio, perdendo a última selecionada sem erro nenhum.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function lerTiposDeNegocio(salvo: string | null | undefined): string[] {
  return (salvo ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

/**
 * Escreve a lista de volta na coluna.
 *
 * A ordem sai da lista CANÔNICA, e não da ordem de clique: sem isso, "B2B,
 * SaaS" e "SaaS, B2B" seriam textos diferentes para a mesma escolha, e o
 * autosave gravaria de novo só porque a pessoa desmarcou e remarcou.
 *
 * Duplicatas caem fora pelo mesmo motivo.
 */
export function escreverTiposDeNegocio(tipos: string[]): string {
  const escolhidos = new Set(tipos.map((t) => t.trim()).filter(Boolean));
  const canonicos = (TIPOS_DE_NEGOCIO as readonly string[]).filter((t) => escolhidos.has(t));
  // Um valor fora da lista (vindo de dado antigo) é preservado no fim, e não
  // descartado: apagar o que alguém escreveu não é trabalho desta função.
  const extras = Array.from(escolhidos).filter(
    (t) => !(TIPOS_DE_NEGOCIO as readonly string[]).includes(t));
  return [...canonicos, ...extras].join(", ");
}

/** Alterna uma categoria — o clique do chip. */
export function alternarTipoDeNegocio(atuais: string[], tipo: string): string[] {
  return atuais.includes(tipo)
    ? atuais.filter((t) => t !== tipo)
    : [...atuais, tipo];
}

/**
 * A frase que vai para a IA.
 *
 * Todas as categorias, e não a primeira: o prompt interpolava a coluna direto, e
 * com um valor multi-categoria isso já funcionaria por acidente. Passar por aqui
 * deixa a intenção explícita e normaliza o separador.
 */
export function tiposDeNegocioParaIA(salvo: string | null | undefined): string | null {
  const tipos = lerTiposDeNegocio(salvo);
  return tipos.length ? tipos.join(", ") : null;
}
