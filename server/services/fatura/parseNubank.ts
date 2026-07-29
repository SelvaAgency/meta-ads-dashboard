/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Parser da fatura Nubank (CSV) — puro, sem estado
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  Formato: cabeçalho `date,title,amount`
 *    · date   YYYY-MM-DD (data da TRANSAÇÃO — é a competência, não a fatura)
 *    · title  descritor do estabelecimento
 *    · amount pt-BR ("1.086,11"; negativo "- 0,16"); campos com vírgula vêm entre aspas
 *
 *  Regras validadas contra a planilha de reembolsos do Gui:
 *   · IOF: mantém `IOF de "X"` (imposto da compra, atribuído ao estabelecimento
 *     X para somar junto), DESCARTA `IOF de volta de X` (reversão de provisório
 *     do mês anterior). Ex.: Figma 214,02 + IOF 7,49 = 221,51 (bate na planilha).
 *   · Exclui o que não é compra: "Pagamento recebido", "Estorno de…",
 *     "Ajuste a crédito".
 *   · encoding do export vem com mojibake ("crÃ©dito") — os padrões toleram.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type TipoLinha = "COMPRA" | "IOF" | "EXCLUIDO";

export type LinhaFatura = {
  data: string;              // YYYY-MM-DD
  descritorOriginal: string; // como veio na fatura
  descritor: string;         // para classificação (IOF de "X" vira X)
  valorCents: number;        // com sinal (compra/IOF positivos; reversões negativas)
  tipo: TipoLinha;
  motivo?: string;           // por que foi excluída
};

/** "1.086,11" → 108611 · "- 0,16" → -16 · "120,90" → 12090. */
export function parseValorBR(bruto: string): number {
  const t = (bruto ?? "").trim();
  if (!t) return 0;
  const negativo = /^-/.test(t);
  const corpo = t.replace(/^-\s*/, "").replace(/\./g, "").replace(",", ".").replace(/[^\d.]/g, "");
  const n = parseFloat(corpo);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) * (negativo ? -1 : 1);
}

/** Divide UMA linha CSV respeitando aspas e o escape `""`. */
function splitCsvLinha(linha: string): string[] {
  const campos: string[] = [];
  let atual = "", dentroAspas = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (dentroAspas) {
      if (c === '"') {
        if (linha[i + 1] === '"') { atual += '"'; i++; } // "" → "
        else dentroAspas = false;
      } else atual += c;
    } else if (c === '"') dentroAspas = true;
    else if (c === ",") { campos.push(atual); atual = ""; }
    else atual += c;
  }
  campos.push(atual);
  return campos;
}

const RE_IOF_VOLTA = /^\s*IOF de volta de /i;
const RE_IOF = /^\s*IOF de\s+/i;
const RE_PAGAMENTO = /pagamento recebido/i;
const RE_ESTORNO = /^\s*estorno de/i;
const RE_AJUSTE = /ajuste a cr[eéÃ]/i; // "crédito"/"crÃ©dito"

/** Extrai o estabelecimento de `IOF de "X"` (ou sem aspas). */
function estabelecimentoDoIof(title: string): string {
  return title.replace(RE_IOF, "").trim().replace(/^"(.*)"$/, "$1").trim();
}

/**
 * Converte o CSV da fatura em linhas normalizadas. NÃO filtra por mês — o
 * bucketing por competência (data da transação) é passo separado.
 */
export function parseNubankCsv(texto: string): LinhaFatura[] {
  const linhas = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (linhas.length === 0) return [];
  const inicio = /date\s*,\s*title\s*,\s*amount/i.test(linhas[0]) ? 1 : 0; // pula cabeçalho
  const out: LinhaFatura[] = [];
  for (let i = inicio; i < linhas.length; i++) {
    const campos = splitCsvLinha(linhas[i]);
    if (campos.length < 3) continue;
    const data = campos[0].trim();
    const title = campos[1].trim();
    const valorCents = parseValorBR(campos[2]);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) continue;

    if (RE_IOF_VOLTA.test(title)) {
      out.push({ data, descritorOriginal: title, descritor: title, valorCents, tipo: "EXCLUIDO", motivo: "IOF de volta (reversão de provisório do mês anterior)" });
    } else if (RE_IOF.test(title)) {
      out.push({ data, descritorOriginal: title, descritor: estabelecimentoDoIof(title), valorCents, tipo: "IOF" });
    } else if (RE_PAGAMENTO.test(title)) {
      out.push({ data, descritorOriginal: title, descritor: title, valorCents, tipo: "EXCLUIDO", motivo: "pagamento da fatura (não é despesa)" });
    } else if (RE_ESTORNO.test(title)) {
      out.push({ data, descritorOriginal: title, descritor: title, valorCents, tipo: "EXCLUIDO", motivo: "estorno" });
    } else if (RE_AJUSTE.test(title)) {
      out.push({ data, descritorOriginal: title, descritor: title, valorCents, tipo: "EXCLUIDO", motivo: "ajuste a crédito" });
    } else {
      out.push({ data, descritorOriginal: title, descritor: title, valorCents, tipo: "COMPRA" });
    }
  }
  return out;
}
