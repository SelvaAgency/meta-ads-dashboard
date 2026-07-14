/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Ajustes 2 · B — vencimentos das recorrências de receita + churn PHBR + backfill
 * ─────────────────────────────────────────────────────────────────────────────
 *  Idempotente. NÃO altera lançamentos pagos.
 *  B2: seta diaVencimento + vencimentoMesSeguinte nas recorrências ativas de receita.
 *  B3: encerra a recorrência do PHBR (ativo=false, churnMes=2026-06) e remove as
 *      entries futuras pendentes (mes >= 2026-07).
 *  B4: backfill do vencimento das entries RECEITA_RECORRENTE pendentes conforme a
 *      regra (dia do mês, ou do mês seguinte se pós-pago; dia 31 → último do mês).
 *
 *  Uso: npm run setup:vencimentos   (prod: SETUP_CONFIRM=yes npm run setup:vencimentos)
 * ─────────────────────────────────────────────────────────────────────────────
 */
import "dotenv/config";
import mysql from "mysql2/promise";

const VENC: Record<string, { dia: number; mesSeguinte: boolean }> = {
  spin: { dia: 5, mesSeguinte: true },
  arka: { dia: 22, mesSeguinte: true },
  musa: { dia: 15, mesSeguinte: true },
  aika: { dia: 5, mesSeguinte: false },
  scaffold: { dia: 22, mesSeguinte: false },
  sante: { dia: 15, mesSeguinte: false },
  elwing: { dia: 15, mesSeguinte: false },
  baesh: { dia: 15, mesSeguinte: false },
  ultramalhas: { dia: 15, mesSeguinte: false },
  uma: { dia: 15, mesSeguinte: false },
  mnbr: { dia: 15, mesSeguinte: false },
  "la clima": { dia: 31, mesSeguinte: false },
};
const norm = (s: string) => (s || "").normalize("NFD").replace(new RegExp("[\\u0300-\\u036f]", "g"), "").trim().toLowerCase();
const lastDay = (y: number, m: number) => new Date(y, m, 0).getDate(); // m 1-based
function vencFor(mes: string, dia: number, mesSeguinte: boolean): string {
  let [y, m] = mes.split("-").map(Number);
  if (mesSeguinte) { m++; if (m > 12) { m = 1; y++; } }
  const d = Math.min(dia, lastDay(y, m));
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

async function main() {
  if (!process.env.DATABASE_URL) { console.error("DATABASE_URL não configurada."); process.exit(1); }
  if (process.env.NODE_ENV === "production" && process.env.SETUP_CONFIRM !== "yes") {
    console.error("Abortado: setup em produção exige SETUP_CONFIRM=yes.");
    process.exit(1);
  }
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    // ── B2: vencimentos das recorrências ativas de receita ────────────────────
    const [recs] = await conn.query(
      "SELECT r.id, r.clienteId, r.diaVencimento, r.vencimentoMesSeguinte, c.nome " +
        "FROM finance_recorrencia r LEFT JOIN finance_clientes c ON r.clienteId = c.id " +
        "WHERE r.natureza='RECEITA' AND r.ativo=TRUE",
    );
    let b2 = 0;
    for (const r of recs as { id: number; nome: string | null; diaVencimento: number | null; vencimentoMesSeguinte: number }[]) {
      const cfg = VENC[norm(r.nome ?? "")];
      if (!cfg) { console.log(`  (sem regra de venc p/ "${r.nome}" — ignorado)`); continue; }
      if (r.diaVencimento !== cfg.dia || !!r.vencimentoMesSeguinte !== cfg.mesSeguinte) {
        await conn.query("UPDATE finance_recorrencia SET diaVencimento=?, vencimentoMesSeguinte=? WHERE id=?", [cfg.dia, cfg.mesSeguinte ? 1 : 0, r.id]);
        b2++;
      }
    }
    console.log(`B2 · vencimentos atualizados em ${b2} recorrência(s) (de ${(recs as unknown[]).length} ativas).`);

    // ── B3: churn PHBR ────────────────────────────────────────────────────────
    const [phbrRows] = await conn.query(
      "SELECT r.id FROM finance_recorrencia r LEFT JOIN finance_clientes c ON r.clienteId = c.id WHERE r.natureza='RECEITA' AND LOWER(c.nome) LIKE '%phbr%'",
    );
    const phbrIds = (phbrRows as { id: number }[]).map((x) => x.id);
    if (phbrIds.length === 0) {
      console.log("B3 · PHBR: nenhuma recorrência encontrada (talvez já removida) — no-op.");
    } else {
      for (const id of phbrIds) {
        await conn.query("UPDATE finance_recorrencia SET ativo=FALSE, churnMes='2026-06' WHERE id=?", [id]);
        const [del] = await conn.query(
          "DELETE FROM finance_pnl_entries WHERE recorrenciaId=? AND status='pendente' AND mes >= '2026-07'",
          [id],
        );
        console.log(`B3 · PHBR recorrência #${id}: ativo=false, churnMes=2026-06; ${(del as { affectedRows: number }).affectedRows} entrie(s) futura(s) pendente(s) removida(s).`);
      }
    }

    // ── B4: backfill do vencimento das entries RECEITA_RECORRENTE pendentes ────
    const [entries] = await conn.query(
      "SELECT e.id, e.mes, e.vencimento, e.vencimentoOriginal, r.diaVencimento, r.vencimentoMesSeguinte " +
        "FROM finance_pnl_entries e JOIN finance_recorrencia r ON e.recorrenciaId = r.id " +
        "WHERE e.tipo='RECEITA_RECORRENTE' AND e.status='pendente' AND r.diaVencimento IS NOT NULL",
    );
    let b4 = 0;
    for (const e of entries as { id: number; mes: string; vencimento: string | null; vencimentoOriginal: string | null; diaVencimento: number; vencimentoMesSeguinte: number }[]) {
      const newVenc = vencFor(e.mes, e.diaVencimento, !!e.vencimentoMesSeguinte);
      const setOriginal = e.vencimentoOriginal == null;
      if (e.vencimento === newVenc && !setOriginal) continue;
      await conn.query(
        setOriginal ? "UPDATE finance_pnl_entries SET vencimento=?, vencimentoOriginal=? WHERE id=?" : "UPDATE finance_pnl_entries SET vencimento=? WHERE id=?",
        setOriginal ? [newVenc, newVenc, e.id] : [newVenc, e.id],
      );
      b4++;
    }
    console.log(`B4 · vencimento aplicado em ${b4} entrie(s) recorrente(s) pendente(s).`);

    // Amostra de conferência (jul/2026).
    const [amostra] = await conn.query(
      "SELECT e.descricao, e.vencimento FROM finance_pnl_entries e WHERE e.tipo='RECEITA_RECORRENTE' AND e.mes='2026-07' ORDER BY e.vencimento LIMIT 20",
    );
    console.log("\nAmostra jul/2026 (descricao · vencimento):");
    for (const a of amostra as { descricao: string; vencimento: string | null }[]) console.log(`  ${a.descricao} · ${a.vencimento ?? "—"}`);
    console.log("\n✅ B concluído (idempotente).\n");
  } finally {
    await conn.end();
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
