/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Subcategorias da despesa pontual — classificação direta no banco (SEM CSV)
 * ─────────────────────────────────────────────────────────────────────────────
 *  Para cada DESPESA_PONTUAL, seta `subcategoria` a partir da descrição:
 *  1) OVERRIDES (descrição exata) · 2) regras por palavra-chave (1ª que casar vence,
 *  na descrição normalizada = minúsculas, sem acento) · resto → OUTROS.
 *  Idempotente (re-rodar reclassifica, sem duplicar). Guard prod: SETUP_CONFIRM=yes.
 *
 *  Uso: npm run setup:subcategorias   (prod: SETUP_CONFIRM=yes npm run setup:subcategorias)
 * ─────────────────────────────────────────────────────────────────────────────
 */
import "dotenv/config";
import mysql from "mysql2/promise";

const norm = (s: string) => (s || "").normalize("NFD").replace(new RegExp("[\\u0300-\\u036f]", "g"), "").toLowerCase().replace(/\s+/g, " ").trim();

const OVERRIDES: Record<string, string> = {
  "Brand (adesivos)": "EQUIPE_EVENTOS",
  "Gui Retirada": "OUTROS",
  "Reembolso Gui": "OUTROS",
  "Extras Financeiro": "OUTROS",
};

// Ordem importa (primeira que casar vence).
const REGRAS: { sub: string; kw: string[] }[] = [
  { sub: "PLATAFORMAS", kw: ["plataforma", "clickup", "ads", "facebook", "freepik", "wix", "hostinger", "elementor", "ebanx", "eflash", "tags", "magnific", "canva", "adobe", "figma"] },
  { sub: "OFFICE", kw: ["office", "aluguel", "ar condicionado", "instalacao ar", "moveis", "faxina", "almoco", "nucleo inf", "recisao office"] },
  { sub: "EQUIPAMENTOS", kw: ["pc", "mac", "selva machine", "maquina", "notebook", "monitor", "conserto"] },
  { sub: "TELEFONIA", kw: ["telefonica", "celular"] },
  { sub: "EQUIPE_EVENTOS", kw: ["bonus", "promo", "confra", "trip", "airbnb", "passagem", "aviao", "bus", "evento", "merchan", "rescisao", "recisao", "uber"] },
  { sub: "FREELAS", kw: ["clipador", "nathan", "jorge", "kaue", "lola", "madan", "levi", "tales", "freela", "rafike", "marcel", "lovisaro", "jeff", "ian", "gibi", "gasparini"] },
  { sub: "TAXAS", kw: ["taxa", "certificado", "iptu", "seguro", "prefeitura", "cartorio"] },
];

function classificar(descricao: string): string {
  if (OVERRIDES[descricao]) return OVERRIDES[descricao];
  const n = norm(descricao);
  for (const r of REGRAS) if (r.kw.some((k) => n.includes(k))) return r.sub;
  return "OUTROS";
}

async function main() {
  if (!process.env.DATABASE_URL) { console.error("DATABASE_URL não configurada."); process.exit(1); }
  if (process.env.NODE_ENV === "production" && process.env.SETUP_CONFIRM !== "yes") {
    console.error("Abortado: setup em produção exige SETUP_CONFIRM=yes.");
    process.exit(1);
  }
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    const [rows] = await conn.query("SELECT id, descricao, valorCents, subcategoria FROM finance_pnl_entries WHERE tipo='DESPESA_PONTUAL'");
    const entries = rows as { id: number; descricao: string; valorCents: number; subcategoria: string | null }[];
    let mudou = 0;
    const tot = new Map<string, number>();
    for (const e of entries) {
      const sub = classificar(e.descricao);
      tot.set(sub, (tot.get(sub) ?? 0) + e.valorCents);
      if (e.subcategoria !== sub) { await conn.query("UPDATE finance_pnl_entries SET subcategoria=? WHERE id=?", [sub, e.id]); mudou++; }
    }
    const brl = (c: number) => "R$ " + (c / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
    console.log(`Classificadas ${entries.length} despesas pontuais · ${mudou} atualizadas agora.\n`);
    console.log("Totais all-time por subcategoria:");
    for (const s of ["PLATAFORMAS", "OFFICE", "EQUIPAMENTOS", "EQUIPE_EVENTOS", "FREELAS", "TELEFONIA", "TAXAS", "OUTROS"]) {
      console.log(`  ${s.padEnd(15)} ${brl(tot.get(s) ?? 0)}`);
    }
    console.log("\nSpot check:");
    for (const d of ["Office Recorrente", "Plataformas + Ads", "Gibi", "Telefonica"]) console.log(`  "${d}" → ${classificar(d)}`);
    console.log("\n✅ Subcategorias classificadas (idempotente).\n");
  } finally {
    await conn.end();
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
