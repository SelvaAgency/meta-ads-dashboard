/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Ajustes 3 — correções de dados (idempotente, não destrutivo)
 * ─────────────────────────────────────────────────────────────────────────────
 *  1) 2 gastos de jul/2026 (reembolsos) → DESPESA_PONTUAL com reembolsoPendente=true
 *     (conta 1x no P&L; sai da tabela de reembolsos p/ não dobrar).
 *  2) Bruna: recorrência valor padrão R$ 3.200; entry jul/2026 sobrescrita R$ 1.170.
 *  3) Baesh: churn com jul/2026 como último mês (entry pendente dia 15 R$ 5.700),
 *     churnMes=2026-07, remove só ago/2026+; status Churned (ativo=false).
 *
 *  Uso: npm run setup:ajustes3   (prod: SETUP_CONFIRM=yes npm run setup:ajustes3)
 * ─────────────────────────────────────────────────────────────────────────────
 */
import "dotenv/config";
import mysql from "mysql2/promise";

const brl = (c: number) => "R$ " + (c / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 });

async function main() {
  if (!process.env.DATABASE_URL) { console.error("DATABASE_URL não configurada."); process.exit(1); }
  if (process.env.NODE_ENV === "production" && process.env.SETUP_CONFIRM !== "yes") {
    console.error("Abortado: setup em produção exige SETUP_CONFIRM=yes.");
    process.exit(1);
  }
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    // ── 1) 2 gastos de jul → DESPESA_PONTUAL flagged ──────────────────────────
    const [reembsJul] = await conn.query("SELECT id, descricao, valorCents FROM finance_reembolsos WHERE mes='2026-07'");
    let migrados = 0;
    for (const r of reembsJul as { id: number; descricao: string; valorCents: number }[]) {
      const [ex] = await conn.query(
        "SELECT id FROM finance_pnl_entries WHERE mes='2026-07' AND tipo='DESPESA_PONTUAL' AND descricao=? AND reembolsoPendente=TRUE LIMIT 1",
        [r.descricao],
      );
      if ((ex as unknown[]).length === 0) {
        await conn.query(
          "INSERT INTO finance_pnl_entries (`mes`,`tipo`,`descricao`,`valorCents`,`status`,`origem`,`reembolsoPendente`) VALUES ('2026-07','DESPESA_PONTUAL',?,?,'pago','MANUAL',TRUE)",
          [r.descricao, r.valorCents],
        );
      }
      await conn.query("DELETE FROM finance_reembolsos WHERE id=?", [r.id]);
      migrados++;
      console.log(`  1) gasto jul migrado: ${r.descricao} ${brl(r.valorCents)} → DESPESA_PONTUAL (reembolso pendente)`);
    }
    if (migrados === 0) console.log("  1) nenhum gasto de jul na tabela de reembolsos (já migrados) — no-op.");

    // ── 2) Bruna: valor padrão 3.200; jul = 1.170 ────────────────────────────
    const [bruna] = await conn.query("SELECT id, clienteId FROM finance_recorrencia WHERE natureza='DESPESA' AND LOWER(descricao) LIKE '%bruna%' LIMIT 1");
    const bru = (bruna as { id: number }[])[0];
    if (!bru) { console.log("  2) Bruna: recorrência não encontrada — pulado."); }
    else {
      await conn.query("UPDATE finance_recorrencia SET valorCents=320000 WHERE id=?", [bru.id]);
      const [je] = await conn.query("SELECT id FROM finance_pnl_entries WHERE recorrenciaId=? AND mes='2026-07' LIMIT 1", [bru.id]);
      if ((je as { id: number }[]).length) {
        await conn.query("UPDATE finance_pnl_entries SET valorCents=117000 WHERE id=?", [(je as { id: number }[])[0].id]);
      } else {
        await conn.query(
          "INSERT INTO finance_pnl_entries (`mes`,`tipo`,`descricao`,`valorCents`,`status`,`origem`,`recorrenciaId`,`vencimento`,`vencimentoOriginal`) " +
            "VALUES ('2026-07','DESPESA_RECORRENTE','Bruna Orsi',117000,'pendente','RECORRENCIA',?, '2026-07-05','2026-07-05')",
          [bru.id],
        );
      }
      console.log(`  2) Bruna: recorrência padrão ${brl(320000)}; jul/2026 = ${brl(117000)} (proporcional).`);
    }

    // ── 3) Baesh: churn com jul/2026 presente ────────────────────────────────
    const [baeshRows] = await conn.query("SELECT id, clienteId, valorCents FROM finance_recorrencia WHERE natureza='RECEITA' AND clienteId IN (SELECT id FROM finance_clientes WHERE LOWER(nome) LIKE '%baesh%') LIMIT 1");
    const ba = (baeshRows as { id: number; clienteId: number; valorCents: number }[])[0];
    if (!ba) { console.log("  3) Baesh: recorrência não encontrada — pulado."); }
    else {
      const valor = ba.valorCents || 570000;
      await conn.query("UPDATE finance_recorrencia SET diaVencimento=15, ativo=FALSE, churnMes='2026-07' WHERE id=?", [ba.id]);
      const [je] = await conn.query("SELECT id FROM finance_pnl_entries WHERE recorrenciaId=? AND mes='2026-07' LIMIT 1", [ba.id]);
      if ((je as { id: number }[]).length) {
        await conn.query("UPDATE finance_pnl_entries SET valorCents=?, status='pendente', vencimento='2026-07-15', vencimentoOriginal='2026-07-15' WHERE id=?", [valor, (je as { id: number }[])[0].id]);
      } else {
        await conn.query(
          "INSERT INTO finance_pnl_entries (`mes`,`tipo`,`descricao`,`valorCents`,`status`,`clienteId`,`origem`,`recorrenciaId`,`vencimento`,`vencimentoOriginal`) " +
            "VALUES ('2026-07','RECEITA_RECORRENTE','Baesh',?,'pendente',?,'RECORRENCIA',?, '2026-07-15','2026-07-15')",
          [valor, ba.clienteId, ba.id],
        );
      }
      const [del] = await conn.query("DELETE FROM finance_pnl_entries WHERE recorrenciaId=? AND status='pendente' AND mes > '2026-07'", [ba.id]);
      console.log(`  3) Baesh: churnMes=2026-07, jul presente (${brl(valor)}, dia 15), ${(del as { affectedRows: number }).affectedRows} mês(es) > jul removido(s). Status Churned.`);
    }

    console.log("\n✅ Ajustes 3 (dados) concluído (idempotente).\n");
  } finally {
    await conn.end();
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
