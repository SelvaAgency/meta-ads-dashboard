/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Financeiro v4.1 — setup one-shot das recorrências de DESPESA  · idempotente
 * ─────────────────────────────────────────────────────────────────────────────
 *  Espelha setupRecorrencia (receita). Para cada LINHA de DESPESA_RECORRENTE e
 *  DESPESA_IMPOSTO do mês de referência (2026-06), cria 1 finance_recorrencia
 *  natureza='DESPESA' com o valor atual (carrega o último valor). Imposto entra
 *  como estimativa=TRUE. NÃO duplica por (descricao + tipoEntry). NÃO altera
 *  lançamentos históricos. DESPESA_PONTUAL não replica.
 *  Guard produção: SETUP_CONFIRM=yes.
 *
 *  Uso: npm run setup:recorrencia-despesa
 *       (prod: SETUP_CONFIRM=yes npm run setup:recorrencia-despesa)
 * ─────────────────────────────────────────────────────────────────────────────
 */
import "dotenv/config";
import mysql from "mysql2/promise";

const REF_MONTH = "2026-06";

async function main() {
  if (!process.env.DATABASE_URL) { console.error("DATABASE_URL não configurada."); process.exit(1); }
  if (process.env.NODE_ENV === "production" && process.env.SETUP_CONFIRM !== "yes") {
    console.error("Abortado: setup em produção exige SETUP_CONFIRM=yes.");
    process.exit(1);
  }
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    console.log(`Mês de referência (despesa): ${REF_MONTH}`);

    // Uma linha por despesa recorrente/imposto do mês de referência.
    const [rows] = await conn.query(
      "SELECT descricao, tipo, valorCents, vencimento FROM finance_pnl_entries " +
        "WHERE mes=? AND tipo IN ('DESPESA_RECORRENTE','DESPESA_IMPOSTO') ORDER BY tipo, id",
      [REF_MONTH],
    );
    const linhas = rows as { descricao: string; tipo: string; valorCents: number; vencimento: string | null }[];
    if (!linhas.length) { console.log("Sem despesas recorrentes no mês de referência — nada a fazer."); process.exit(0); }

    // Idempotência: já existentes por (descricao normalizada + tipoEntry).
    const [existing] = await conn.query(
      "SELECT descricao, tipoEntry FROM finance_recorrencia WHERE natureza='DESPESA'",
    );
    const key = (d: string, t: string) => `${(d || "").trim().toLowerCase()}|${t}`;
    const have = new Set((existing as { descricao: string; tipoEntry: string }[]).map((r) => key(r.descricao, r.tipoEntry)));

    let criadas = 0, totalRec = 0, totalImp = 0, nRec = 0, nImp = 0;
    for (const l of linhas) {
      const valor = Number(l.valorCents);
      if (l.tipo === "DESPESA_IMPOSTO") { totalImp += valor; nImp++; } else { totalRec += valor; nRec++; }
      if (have.has(key(l.descricao, l.tipo))) continue;
      const dia = l.vencimento ? Number(l.vencimento.slice(8, 10)) || null : null;
      await conn.query(
        "INSERT INTO finance_recorrencia (`clienteId`, `valorCents`, `diaVencimento`, `mesInicio`, `ativo`, `natureza`, `descricao`, `tipoEntry`, `estimativa`) " +
          "VALUES (NULL, ?, ?, ?, TRUE, 'DESPESA', ?, ?, ?)",
        [valor, dia, REF_MONTH, l.descricao, l.tipo, l.tipo === "DESPESA_IMPOSTO" ? 1 : 0],
      );
      have.add(key(l.descricao, l.tipo));
      criadas++;
    }

    const brl = (c: number) => "R$ " + (c / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
    const [tot] = await conn.query("SELECT COUNT(*) n, SUM(valorCents) v FROM finance_recorrencia WHERE natureza='DESPESA' AND ativo=TRUE");
    const t0 = (tot as { n: number; v: number }[])[0];
    console.log(`\nLinhas no ref: recorrentes=${nRec} (${brl(totalRec)}) · imposto=${nImp} (${brl(totalImp)})`);
    console.log(`Recorrências de despesa criadas agora: ${criadas}`);
    console.log(`Total de recorrências de despesa ATIVAS: ${Number(t0.n)} · soma mensal: ${brl(Number(t0.v))}`);
    console.log(`Esperado ≈ 15 recorrências · ${brl(totalRec + totalImp)} / mês`);
    console.log("✅ Setup despesa concluído (idempotente).\n");
  } finally {
    await conn.end();
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
