/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Controle Financeiro — import one-shot dos 3 CSVs (formato longo)
 * ─────────────────────────────────────────────────────────────────────────────
 *  Lê import/{pnl_long,reembolsos_long,retiradas_long}.csv, converte `valor`
 *  para CENTAVOS (round(valor*100)) e insere nas 3 tabelas finance_*.
 *  Valida linha a linha (linhas inválidas são reportadas por índice, SEM logar
 *  valores/conteúdo sensível) e confere os totais mensais esperados no fim.
 *
 *  SEGURANÇA (o TRUNCATE apaga tudo — não pode zerar dados lançados na mão):
 *   · Por padrão só roda se as 3 tabelas estiverem VAZIAS. Qualquer linha → aborta.
 *   · Reimport destrutivo (TRUNCATE) exige a flag explícita `--force`.
 *   · Com --force em NODE_ENV=production, exige ainda SEED_FINANCE_CONFIRM=yes.
 *
 *  Uso:
 *    npx tsx server/seedFinance.ts            # 1ª carga (só se tabelas vazias)
 *    npx tsx server/seedFinance.ts --force    # re-import destrutivo (TRUNCATE)
 *    # em produção: SEED_FINANCE_CONFIRM=yes npx tsx server/seedFinance.ts --force
 *
 *  Depois do import validado, o banco é a fonte da verdade (e os CSVs devem ser
 *  apagados do repo — dados sensíveis).
 * ─────────────────────────────────────────────────────────────────────────────
 */
import "dotenv/config";
import { drizzle } from "drizzle-orm/mysql2";
import { sql } from "drizzle-orm";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { financePnlEntries, financeReembolsos, financeRetiradas } from "../drizzle/schema";

const MES_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const PNL_TIPOS = new Set(["RECEITA_RECORRENTE", "RECEITA_PONTUAL", "DESPESA_RECORRENTE", "DESPESA_IMPOSTO", "DESPESA_PONTUAL", "APORTE"]);
const PNL_STATUS = new Set(["pago", "pendente"]);
const CATEGORIAS = new Set(["PLATAFORMA_ANUNCIOS", "OFFICE", "EXTRAS"]);

/** valor decimal (ponto) → centavos int. Sinal PERMITIDO (retiradas podem ter
 *  estorno negativo). null só se não for número. */
function toCents(raw: string): number | null {
  const n = Number((raw ?? "").trim());
  if (!isFinite(n)) return null;
  return Math.round(n * 100);
}

/** Divide uma linha CSV respeitando campos entre aspas (vírgulas internas e "" ). */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
      else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

/** CSV com suporte a campos entre aspas (ex.: descrição com vírgula). */
function parseCsv(path: string): Record<string, string>[] {
  const text = readFileSync(path, "utf8").replace(/^﻿/, "");
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const header = splitCsvLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cols = splitCsvLine(line);
    const row: Record<string, string> = {};
    header.forEach((h, i) => { row[h] = (cols[i] ?? "").trim(); });
    return row;
  });
}

const brl = (c: number) => (c / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ── Totais esperados (auto-validação) ────────────────────────────────────────
const EXP_REEMB: Record<string, number> = { "2025-08": 17853.78, "2025-09": 13199.88, "2025-10": 10521.94, "2025-11": 9826.93, "2025-12": 10987.42, "2026-01": 9451.34, "2026-02": 10983.49, "2026-03": 16660.12, "2026-04": 14527.45, "2026-05": 14642.33, "2026-06": 20990.38, "2026-07": 186.70 };
const EXP_RETIR: Record<string, number> = { "2025-09": 13011.77, "2025-10": 9938.59, "2025-11": 9269.07, "2025-12": 10942.63, "2026-01": 9216.30, "2026-02": 10983.49, "2026-03": 16697.29, "2026-04": 14527.45, "2026-05": 14677.42, "2026-06": 20990.38 };
const EXP_REC: Record<string, number> = { "2026-01": 67300, "2026-02": 63300, "2026-03": 77600, "2026-04": 72100, "2026-05": 74100, "2026-06": 74100 };
const EXP_PON: Record<string, number> = { "2026-01": 25020, "2026-02": 33990, "2026-03": 32050, "2026-04": 14083, "2026-05": 20923, "2026-06": 24033 };

function checkGroup(title: string, gotCents: Record<string, number>, expReais: Record<string, number>): number {
  let fails = 0;
  console.log(`\n${title}`);
  for (const mes of Object.keys(expReais).sort()) {
    const got = gotCents[mes] ?? 0;
    const exp = Math.round(expReais[mes] * 100);
    const ok = Math.abs(got - exp) <= 100; // tolerância R$1
    if (!ok) fails++;
    console.log(`  ${mes}: R$ ${brl(got).padStart(12)}  (esperado ${brl(exp).padStart(12)})  ${ok ? "OK" : "!! DIVERGE"}`);
  }
  return fails;
}

async function main() {
  if (!process.env.DATABASE_URL) { console.error("DATABASE_URL não configurada."); process.exit(1); }
  const dir = resolve(process.cwd(), "import");
  const db = drizzle(process.env.DATABASE_URL);

  // ── Parse + validação linha a linha ──
  const skipped: string[] = [];
  const pnl = parseCsv(resolve(dir, "pnl_long.csv")).flatMap((r, i) => {
    const c = toCents(r.valor);
    if (!MES_RE.test(r.mes) || !PNL_TIPOS.has(r.tipo) || !r.descricao || c == null || !PNL_STATUS.has(r.status || "pendente")) {
      skipped.push(`pnl_long.csv linha ${i + 2}`); return [];
    }
    return [{ mes: r.mes, tipo: r.tipo as any, descricao: r.descricao.slice(0, 255), valorCents: c, status: (r.status || "pendente") as any }];
  });
  const reemb = parseCsv(resolve(dir, "reembolsos_long.csv")).flatMap((r, i) => {
    const c = toCents(r.valor);
    if (!MES_RE.test(r.mes) || !CATEGORIAS.has(r.categoria) || !r.descricao || c == null) {
      skipped.push(`reembolsos_long.csv linha ${i + 2}`); return [];
    }
    return [{ mes: r.mes, categoria: r.categoria as any, descricao: r.descricao.slice(0, 255), valorCents: c, quemPagou: (r.quem_pagou || "").slice(0, 120) || null, reembolsado: false }];
  });
  const retir = parseCsv(resolve(dir, "retiradas_long.csv")).flatMap((r, i) => {
    const c = toCents(r.valor);
    if (!MES_RE.test(r.mes) || !r.descricao || c == null) {
      skipped.push(`retiradas_long.csv linha ${i + 2}`); return [];
    }
    return [{ mes: r.mes, descricao: r.descricao.slice(0, 120), valorCents: c }];
  });

  console.log(`Import — P&L: ${pnl.length} · Reembolsos: ${reemb.length} · Retiradas: ${retir.length} · inválidas: ${skipped.length}`);
  if (skipped.length) console.log("Linhas ignoradas (por índice, sem conteúdo):\n  " + skipped.join("\n  "));

  // ── Guardas contra apagar dados existentes ──
  const force = process.argv.slice(2).includes("--force");
  const isProd = process.env.NODE_ENV === "production";

  const countRows = async (table: string): Promise<number> => {
    const res: any = await db.execute(sql.raw(`SELECT COUNT(*) AS n FROM ${table}`));
    const rows = Array.isArray(res) ? res[0] : res?.rows ?? res;
    return Number((Array.isArray(rows) ? rows[0]?.n : rows?.n) ?? 0);
  };
  const [nPnl, nReemb, nRetir] = await Promise.all([
    countRows("finance_pnl_entries"), countRows("finance_reembolsos"), countRows("finance_retiradas"),
  ]);
  const existing = nPnl + nReemb + nRetir;

  if (existing > 0 && !force) {
    console.error(`\nAbortado: as tabelas finance_* já têm dados (P&L=${nPnl}, Reembolsos=${nReemb}, Retiradas=${nRetir}).`);
    console.error("Não vou apagar nada. Para RE-IMPORTAR do zero (TRUNCATE), rode com --force.");
    process.exit(1);
  }
  if (force && isProd && process.env.SEED_FINANCE_CONFIRM !== "yes") {
    console.error("\nAbortado: --force em produção exige SEED_FINANCE_CONFIRM=yes para TRUNCATE as tabelas finance_*.");
    process.exit(1);
  }

  // ── Semear. Só faz TRUNCATE quando há dados e --force foi passado. ──
  if (existing > 0 && force) {
    console.log(`\n--force: apagando dados atuais (P&L=${nPnl}, Reembolsos=${nReemb}, Retiradas=${nRetir}) e reimportando…`);
    await db.execute(sql`TRUNCATE TABLE finance_pnl_entries`);
    await db.execute(sql`TRUNCATE TABLE finance_reembolsos`);
    await db.execute(sql`TRUNCATE TABLE finance_retiradas`);
  }

  // ── Insert em lotes ──
  const chunk = <T,>(arr: T[], n: number) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
  for (const c of chunk(pnl, 500)) if (c.length) await db.insert(financePnlEntries).values(c);
  for (const c of chunk(reemb, 500)) if (c.length) await db.insert(financeReembolsos).values(c);
  for (const c of chunk(retir, 500)) if (c.length) await db.insert(financeRetiradas).values(c);

  // ── Auto-validação (a partir do que foi inserido) ──
  const sumBy = <T extends { mes: string; valorCents: number }>(rows: T[], pred: (r: T) => boolean = () => true) => {
    const m: Record<string, number> = {};
    for (const r of rows) if (pred(r)) m[r.mes] = (m[r.mes] ?? 0) + r.valorCents;
    return m;
  };
  let fails = 0;
  fails += checkGroup("Reembolsos — total/mês", sumBy(reemb), EXP_REEMB);
  fails += checkGroup("Retiradas — total/mês", sumBy(retir), EXP_RETIR);
  fails += checkGroup("P&L Receita Recorrente 2026", sumBy(pnl, (r) => r.tipo === "RECEITA_RECORRENTE" && r.mes.startsWith("2026")), EXP_REC);
  fails += checkGroup("P&L Receita Pontual 2026", sumBy(pnl, (r) => r.tipo === "RECEITA_PONTUAL" && r.mes.startsWith("2026")), EXP_PON);

  console.log(`\n=== DIVERGÊNCIAS (> R$1): ${fails} ===`);
  if (fails > 0) { console.error("⚠️  Totais divergiram — verifique os CSVs antes de seguir."); process.exit(2); }
  console.log("✅ Import concluído e validado. O banco agora é a fonte da verdade.");
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
