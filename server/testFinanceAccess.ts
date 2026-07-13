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
    ["finance.analytics.serieHistorica", () => caller.finance.analytics.serieHistorica({ granularidade: "mensal", janela: "12m" })],
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

async function main() {
  console.log("Teste de acesso — finance.pnl.list\n");
  const results = [
    await expectBlocked("role user (colaborador)", "user"),
    await expectBlocked("role developer", "developer"),
    await expectBlocked("sem sessão (não autenticado)", null),
    await expectAllowed("role admin"),
  ];
  const passed = results.every(Boolean);
  console.log(`\n=== ${passed ? "TODOS PASSARAM" : "FALHOU"} (${results.filter(Boolean).length}/${results.length}) ===`);
  process.exit(passed ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
