/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Ajustes 4 — fechar meses passados + quitar reembolsáveis antigos
 * ─────────────────────────────────────────────────────────────────────────────
 *  1) Fecha todo mês < CUTOFF que ainda esteja aberto (finance_meses_fechados).
 *  2) Marca como realizado/reembolsado tudo que é reembolsável de meses < CUTOFF:
 *     finance_reembolsos.reembolsado=1 · finance_retiradas.realizado=1 ·
 *     finance_pnl_entries.reembolsoPendente=0. A falta-receber passa a considerar
 *     só CUTOFF em diante (some o saldo de ago/2025 e os demais antigos).
 *
 *  Idempotente e reversível (REVERT=yes desfaz os dois passos).
 *  Guard prod: SETUP_CONFIRM=yes.
 *
 *  Uso: SETUP_CONFIRM=yes npm run setup:fechar-passado
 *       SETUP_CONFIRM=yes REVERT=yes npm run setup:fechar-passado
 * ─────────────────────────────────────────────────────────────────────────────
 */
import "dotenv/config";
import mysql from "mysql2/promise";

const CUTOFF = "2026-07"; // primeiro mês que continua "em aberto"
const brl = (c: number) => "R$ " + (c / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 });

async function faltaReceber(conn: mysql.Connection) {
  const [rows] = await conn.query(
    `SELECT
       (SELECT COALESCE(SUM(valorCents),0) FROM finance_reembolsos WHERE reembolsado=0)
     + (SELECT COALESCE(SUM(valorCents),0) FROM finance_pnl_entries WHERE reembolsoPendente=1) AS despesas,
       (SELECT COALESCE(SUM(valorCents),0) FROM finance_retiradas WHERE realizado=0) AS retiradas`,
  );
  const r = (rows as { despesas: number; retiradas: number }[])[0];
  return Number(r.despesas) - Number(r.retiradas);
}

async function main() {
  if (!process.env.DATABASE_URL) { console.error("DATABASE_URL não configurada."); process.exit(1); }
  if (process.env.NODE_ENV === "production" && process.env.SETUP_CONFIRM !== "yes") {
    console.error("Abortado: setup em produção exige SETUP_CONFIRM=yes.");
    process.exit(1);
  }
  const revert = process.env.REVERT === "yes";
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    console.log(`${revert ? "REVERTENDO" : "Aplicando"} · corte em ${CUTOFF}\n`);
    console.log(`Falta receber acumulado ANTES: ${brl(await faltaReceber(conn))}\n`);

    if (revert) {
      const [a] = await conn.query("UPDATE finance_reembolsos SET reembolsado=0 WHERE mes < ?", [CUTOFF]);
      const [b] = await conn.query("UPDATE finance_retiradas SET realizado=0 WHERE mes < ?", [CUTOFF]);
      const [c] = await conn.query("DELETE FROM finance_meses_fechados WHERE mes < ?", [CUTOFF]);
      console.log(`Reembolsos reabertos: ${(a as mysql.ResultSetHeader).affectedRows}`);
      console.log(`Retiradas reabertas: ${(b as mysql.ResultSetHeader).affectedRows}`);
      console.log(`Meses reabertos: ${(c as mysql.ResultSetHeader).affectedRows}`);
      console.log(`\n⚠️  reembolsoPendente das despesas do P&L NÃO é restaurado (não havia nenhuma < ${CUTOFF}).`);
    } else {
      // 1) Fechar meses passados ainda abertos.
      const [mrows] = await conn.query(
        `SELECT DISTINCT mes FROM (
           SELECT mes FROM finance_pnl_entries UNION SELECT mes FROM finance_reembolsos UNION SELECT mes FROM finance_retiradas
         ) t WHERE mes < ? ORDER BY mes`, [CUTOFF],
      );
      const meses = (mrows as { mes: string }[]).map((r) => r.mes);
      const [frows] = await conn.query("SELECT mes FROM finance_meses_fechados");
      const jaFechados = new Set((frows as { mes: string }[]).map((r) => r.mes));
      const aFechar = meses.filter((m) => !jaFechados.has(m));
      for (const m of aFechar) await conn.query("INSERT IGNORE INTO finance_meses_fechados (mes, fechadoPor) VALUES (?, NULL)", [m]);
      console.log(`Meses < ${CUTOFF}: ${meses.length} · já fechados: ${meses.length - aFechar.length} · fechados agora: ${aFechar.length}`);
      if (aFechar.length) console.log(`  ${aFechar.join(" · ")}`);

      // 2) Quitar reembolsáveis/retiradas antigos.
      const [a] = await conn.query("UPDATE finance_reembolsos SET reembolsado=1 WHERE mes < ? AND reembolsado=0", [CUTOFF]);
      const [b] = await conn.query("UPDATE finance_retiradas SET realizado=1 WHERE mes < ? AND realizado=0", [CUTOFF]);
      const [c] = await conn.query("UPDATE finance_pnl_entries SET reembolsoPendente=0 WHERE mes < ? AND reembolsoPendente=1", [CUTOFF]);
      console.log(`\nReembolsos quitados: ${(a as mysql.ResultSetHeader).affectedRows}`);
      console.log(`Retiradas quitadas: ${(b as mysql.ResultSetHeader).affectedRows}`);
      console.log(`Despesas do P&L desmarcadas: ${(c as mysql.ResultSetHeader).affectedRows}`);
    }

    const depois = await faltaReceber(conn);
    console.log(`\nFalta receber acumulado DEPOIS: ${brl(depois)}`);
    const [pm] = await conn.query(
      `SELECT mes, FORMAT(SUM(v)/100,2) total FROM (
         SELECT mes, valorCents v FROM finance_reembolsos WHERE reembolsado=0
         UNION ALL SELECT mes, valorCents FROM finance_pnl_entries WHERE reembolsoPendente=1
         UNION ALL SELECT mes, -valorCents FROM finance_retiradas WHERE realizado=0
       ) t GROUP BY mes ORDER BY mes`,
    );
    console.log("\nFalta receber em aberto por mês:");
    console.table(pm);
    console.log(`\n✅ ${revert ? "Revertido" : "Aplicado"} (idempotente).\n`);
  } finally {
    await conn.end();
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
