/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Financeiro v2 — backfill de clientes (tags de receita)  · one-shot idempotente
 * ─────────────────────────────────────────────────────────────────────────────
 *  1) Popula finance_clientes a partir de import/clientes_canonicos.csv (upsert
 *     por nome; cor de uma paleta fixa ciclando; não duplica; não muda cor no re-run).
 *  2) Seta clienteId nas linhas RECEITA_* de finance_pnl_entries casando `descricao`
 *     com import/clientes_map.csv (descricao_original → cliente_sugerido → id).
 *     "(?) Nome" é tratado como "Nome".
 *  NÃO trunca nada. Idempotente (re-run dá o mesmo resultado).
 *  Guard: em produção exige BACKFILL_CONFIRM=yes.
 *
 *  Uso: npm run backfill:clientes   (prod: BACKFILL_CONFIRM=yes npm run backfill:clientes)
 * ─────────────────────────────────────────────────────────────────────────────
 */
import "dotenv/config";
import mysql from "mysql2/promise";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Paleta fixa (ciclando) para os chips de cliente.
const PALETTE = [
  "#EF701B", "#3B54E6", "#E11D48", "#16A34A", "#9333EA", "#0891B2",
  "#CA8A04", "#DB2777", "#2563EB", "#059669", "#D97706", "#7C3AED",
  "#DC2626", "#0D9488", "#C026D3", "#65A30D", "#EA580C", "#4F46E5",
  "#0284C7", "#B45309", "#BE123C", "#15803D", "#6D28D9", "#0369A1",
];

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false; } else cur += ch; }
    else if (ch === '"') inQ = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}
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

/** "(?) Nome" → "Nome". */
const stripFlag = (s: string) => s.replace(/^\(\?\)\s*/, "").trim();

async function main() {
  if (!process.env.DATABASE_URL) { console.error("DATABASE_URL não configurada."); process.exit(1); }
  if (process.env.NODE_ENV === "production" && process.env.BACKFILL_CONFIRM !== "yes") {
    console.error("Abortado: backfill em produção exige BACKFILL_CONFIRM=yes.");
    process.exit(1);
  }

  const dir = resolve(process.cwd(), "import");
  const canonicos = parseCsv(resolve(dir, "clientes_canonicos.csv"))
    .map((r) => stripFlag(r.cliente)).filter(Boolean);
  const mapRows = parseCsv(resolve(dir, "clientes_map.csv"))
    .map((r) => ({ descricao: r.descricao_original, cliente: stripFlag(r.cliente_sugerido) }))
    .filter((r) => r.descricao && r.cliente);

  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    // 1) Upsert clientes (cria só quem falta; mantém cor no re-run).
    const [have] = await conn.query("SELECT nome FROM finance_clientes");
    const existing = new Set((have as { nome: string }[]).map((r) => r.nome));
    let created = 0;
    for (let i = 0; i < canonicos.length; i++) {
      const nome = canonicos[i];
      if (existing.has(nome)) continue;
      await conn.query("INSERT INTO finance_clientes (`nome`, `cor`) VALUES (?, ?)", [nome, PALETTE[i % PALETTE.length]]);
      existing.add(nome);
      created++;
    }

    // 2) nome → id
    const [rows] = await conn.query("SELECT id, nome FROM finance_clientes");
    const nomeToId = new Map<string, number>((rows as { id: number; nome: string }[]).map((r) => [r.nome, r.id]));

    // 3) Setar clienteId nas receitas por descrição.
    let mapSemCliente = 0;
    for (const m of mapRows) {
      const id = nomeToId.get(m.cliente);
      if (!id) { mapSemCliente++; continue; } // cliente_sugerido fora dos canônicos
      await conn.query(
        "UPDATE `finance_pnl_entries` SET `clienteId` = ? WHERE `tipo` LIKE 'RECEITA%' AND `descricao` = ?",
        [id, m.descricao],
      );
    }

    // 4) Estatísticas (sem valores sensíveis).
    const q = async (sql: string) => Number((((await conn.query(sql)) as any)[0])[0].n);
    const totalClientes = await q("SELECT COUNT(*) n FROM finance_clientes");
    const receitaSet = await q("SELECT COUNT(*) n FROM finance_pnl_entries WHERE tipo LIKE 'RECEITA%' AND clienteId IS NOT NULL");
    const receitaNull = await q("SELECT COUNT(*) n FROM finance_pnl_entries WHERE tipo LIKE 'RECEITA%' AND clienteId IS NULL");

    console.log("\n── Backfill de clientes ──────────────────────────────");
    console.log(`Clientes na tabela: ${totalClientes} · criados agora: ${created}`);
    console.log(`Receita com clienteId setado: ${receitaSet}`);
    console.log(`Receita SEM match (clienteId NULL): ${receitaNull}`);
    if (mapSemCliente) console.log(`Linhas do mapa cujo cliente não está nos canônicos: ${mapSemCliente}`);
    console.log("✅ Backfill concluído (idempotente).\n");
  } finally {
    await conn.end();
  }
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
