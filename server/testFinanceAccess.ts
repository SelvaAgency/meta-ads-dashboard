/**
 * Teste de acesso do Controle Financeiro (não precisa de banco).
 * Invoca finance.pnl.list via createCaller com contextos de roles diferentes e
 * confirma que só admin passa — o guard roda ANTES de qualquer acesso a dados.
 *
 * Uso: npx tsx server/testFinanceAccess.ts
 */
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import type { User } from "../drizzle/schema";

function ctxWith(role: "user" | "developer" | "admin" | null): TrpcContext {
  const user: User | null = role
    ? ({ id: 1, openId: "t@t", email: "t@t", name: "Teste", role, active: true, mustChangePassword: false } as unknown as User)
    : null;
  return { req: {} as any, res: {} as any, user };
}

async function expectBlocked(label: string, role: "user" | "developer" | null): Promise<boolean> {
  const caller = appRouter.createCaller(ctxWith(role));
  let ok = true;
  for (const [name, call] of [
    ["finance.pnl.list", () => caller.finance.pnl.list(undefined)],
    ["finance.clientes.list", () => caller.finance.clientes.list()],
    ["finance.analytics.churn", () => caller.finance.analytics.churn()],
    ["finance.analytics.aReceber", () => caller.finance.analytics.aReceber()],
    ["finance.analytics.qualidadeClientes", () => caller.finance.analytics.qualidadeClientes(undefined)],
    ["finance.recorrencia.list", () => caller.finance.recorrencia.list()],
    ["finance.recorrencia.statusMes", () => caller.finance.recorrencia.statusMes({ mes: "2026-07" })],
    ["finance.recorrencia.createDespesa", () => caller.finance.recorrencia.createDespesa({ descricao: "x", valorCents: 1, tipoEntry: "DESPESA_RECORRENTE", estimativa: false, mesInicio: "2026-07" })],
    ["finance.recorrencia.createReceita", () => caller.finance.recorrencia.createReceita({ clienteNome: "x", valorCents: 1, mesInicio: "2026-07" })],
    ["finance.analytics.serieHistorica", () => caller.finance.analytics.serieHistorica({ granularidade: "mensal", janela: "12m" })],
    ["finance.overview.resumo", () => caller.finance.overview.resumo({ mesFrom: "2026-07", mesTo: "2026-07" })],
    ["finance.aPagar", () => caller.finance.aPagar()],
    ["finance.contratosAtivos", () => caller.finance.contratosAtivos({ mes: "2026-07" })],
    ["finance.despesasAtivos", () => caller.finance.despesasAtivos({ mes: "2026-07" })],
    ["finance.analytics.despesaPorFornecedor", () => caller.finance.analytics.despesaPorFornecedor(undefined)],
    ["finance.analytics.despesaPontualPorSub", () => caller.finance.analytics.despesaPontualPorSub(undefined)],
    ["finance.pnl.remarcarOficial", () => caller.finance.pnl.remarcarOficial({ id: 1, vencimento: "2026-07-15" })],
    ["finance.reconciliacao.acumulado", () => caller.finance.reconciliacao.acumulado()],
    ["finance.meses.list", () => caller.finance.meses.list()],
    ["finance.meses.fechar", () => caller.finance.meses.fechar({ mes: "2026-05" })],
    ["finance.meses.reabrir", () => caller.finance.meses.reabrir({ mes: "2026-05" })],
    ["finance.projetos.list", () => caller.finance.projetos.list()],
  ] as const) {
    try {
      await call();
      console.log(`  ✗ ${label} · ${name}: NÃO bloqueou — FALHA`);
      ok = false;
    } catch (e: any) {
      const code = e?.code ?? e?.name ?? "ERR";
      const good = code === "FORBIDDEN" || code === "UNAUTHORIZED";
      if (!good) ok = false;
      console.log(`  ${good ? "✓" : "✗"} ${label} · ${name}: bloqueado (${code})`);
    }
  }
  return ok;
}

async function expectAllowed(label: string): Promise<boolean> {
  const caller = appRouter.createCaller(ctxWith("admin"));
  try {
    const r = await caller.finance.pnl.list(undefined); // passa o guard; sem DB retorna []
    console.log(`  ✓ ${label}: passou o guard (retornou ${Array.isArray(r) ? r.length : "?"} linhas)`);
    return true;
  } catch (e: any) {
    console.log(`  ✗ ${label}: admin foi bloqueado (${e?.code ?? e?.message}) — FALHA`);
    return false;
  }
}

/**
 * Muro do domínio FINANCEIRO no sistema de notificações: não-admin não lista
 * notificação financeira nem consegue configurar o tipo financeiro.
 */
async function expectNotifWall(): Promise<boolean> {
  let ok = true;
  for (const role of ["user", "developer"] as const) {
    const caller = appRouter.createCaller(ctxWith(role));
    const rows = await caller.alerts.listAll({ dominio: "FINANCEIRO" });
    const vazio = Array.isArray(rows) && rows.length === 0;
    console.log(`  ${vazio ? "✓" : "✗"} role ${role} · alerts.listAll(FINANCEIRO): ${vazio ? "vazio" : `VAZOU ${rows.length} linha(s) — FALHA`}`);
    if (!vazio) ok = false;

    const c = await caller.alerts.unreadByDominio();
    const zerado = c.FINANCEIRO === 0;
    console.log(`  ${zerado ? "✓" : "✗"} role ${role} · alerts.unreadByDominio: FINANCEIRO=${c.FINANCEIRO}${zerado ? "" : " — FALHA"}`);
    if (!zerado) ok = false;

    try {
      await caller.notifications.setPref({ tipo: "FINANCE_ATRASO", email: true });
      console.log(`  ✗ role ${role} · notifications.setPref(FINANCE_ATRASO): NÃO bloqueou — FALHA`);
      ok = false;
    } catch (e: any) {
      const good = e?.code === "FORBIDDEN";
      console.log(`  ${good ? "✓" : "✗"} role ${role} · notifications.setPref(FINANCE_ATRASO): bloqueado (${e?.code})`);
      if (!good) ok = false;
    }

    const prefs = await caller.notifications.prefs();
    const semFin = !prefs.some((p) => p.dominio === "FINANCEIRO");
    console.log(`  ${semFin ? "✓" : "✗"} role ${role} · notifications.prefs: ${semFin ? "sem tipos financeiros" : "EXPÔS tipo financeiro — FALHA"}`);
    if (!semFin) ok = false;
  }
  return ok;
}

async function main() {
  console.log("Teste de acesso — finance.pnl.list\n");
  const results = [
    await expectBlocked("role user (colaborador)", "user"),
    await expectBlocked("role developer", "developer"),
    await expectBlocked("sem sessão (não autenticado)", null),
    await expectAllowed("role admin"),
  ];
  console.log("\nMuro do domínio FINANCEIRO (notificações):");
  results.push(await expectNotifWall());
  const passed = results.every(Boolean);
  console.log(`\n=== ${passed ? "TODOS PASSARAM" : "FALHOU"} (${results.filter(Boolean).length}/${results.length}) ===`);
  process.exit(passed ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
