/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Financeiro v4 — setup one-shot das recorrências (assinaturas)  · idempotente
 * ─────────────────────────────────────────────────────────────────────────────
 *  Para cada cliente com RECEITA_RECORRENTE no mês de referência (último mês com
 *  recorrente na base), cria 1 finance_recorrencia ativa com o valor recorrente
 *  atual dele. Não duplica por cliente. NÃO altera lançamentos históricos.
 *  Guard produção: SETUP_CONFIRM=yes.
 *
 *  Uso: npm run setup:recorrencia   (prod: SETUP_CONFIRM=yes npm run setup:recorrencia)
 * ─────────────────────────────────────────────────────────────────────────────
 */
import "dotenv/config";
import mysql from "mysql2/promise";

async function main() {
  if (!process.env.DATABASE_URL) { console.error("DATABASE_URL não configurada."); process.exit(1); }
  if (process.env.NODE_ENV === "production" && process.env.SETUP_CONFIRM !== "yes") {
    console.error("Abortado: setup em produção exige SETUP_CONFIRM=yes.");
    process.exit(1);
  }
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    const [maxRows] = await conn.query("SELECT MAX(mes) AS m FROM finance_pnl_entries WHERE tipo='RECEITA_RECORRENTE'");
    const refMonth = (maxRows as { m: string | null }[])[0]?.m;
    if (!refMonth) { console.log("Sem RECEITA_RECORRENTE — nada a fazer."); process.exit(0); }
    console.log(`Mês de referência: ${refMonth}`);

    // Valor recorrente atual por cliente no mês de referência (soma por segurança).
    const [rows] = await conn.query(
      "SELECT clienteId, SUM(valorCents) AS v FROM finance_pnl_entries WHERE tipo='RECEITA_RECORRENTE' AND mes=? AND clienteId IS NOT NULL GROUP BY clienteId",
      [refMonth],
    );
    const [nullRows] = await conn.query(
      "SELECT COUNT(*) AS n FROM finance_pnl_entries WHERE tipo='RECEITA_RECORRENTE' AND mes=? AND clienteId IS NULL",
      [refMonth],
    );
    const semCliente = Number((nullRows as { n: number }[])[0].n);

    const [existing] = await conn.query("SELECT clienteId FROM finance_recorrencia");
    const have = new Set((existing as { clienteId: number }[]).map((r) => r.clienteId));

    let criadas = 0, mrr = 0;
    for (const r of rows as { clienteId: number; v: number }[]) {
      mrr += Number(r.v);
      if (have.has(r.clienteId)) continue;
      await conn.query(
        "INSERT INTO finance_recorrencia (`clienteId`, `valorCents`, `mesInicio`, `ativo`) VALUES (?, ?, ?, TRUE)",
        [r.clienteId, Number(r.v), refMonth],
      );
      criadas++;
    }
    const brl = (c: number) => "R$ " + (c / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
    console.log(`\nRecorrências criadas agora: ${criadas} · total de clientes recorrentes no ref: ${(rows as unknown[]).length}`);
    console.log(`MRR somado (deve = MRR do mês de referência): ${brl(mrr)}`);
    if (semCliente) console.log(`(recorrentes sem clienteId no ref, ignoradas: ${semCliente})`);
    console.log("✅ Setup concluído (idempotente).\n");
  } finally {
    await conn.end();
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
