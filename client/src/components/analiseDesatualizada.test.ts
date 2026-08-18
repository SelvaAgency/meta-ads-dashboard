/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  O fluxo "análise desatualizada → Atualizar"
 * ─────────────────────────────────────────────────────────────────────────────
 *  O que quebrou aqui não foi o cálculo: foi o DIAGNÓSTICO. A mutação falhava e
 *  o cliente respondia `toast.error("Erro ao atualizar status IA")`, descartando
 *  a mensagem do servidor — a única coisa capaz de dizer se faltava chave, se o
 *  modelo recusou ou se a conta não tinha métrica. Sem ela ninguém investiga, e
 *  o bug fica aberto por semanas parecendo misterioso.
 *
 *  Estes testes guardam as quatro decisões que o conserto tomou, todas
 *  verificáveis sem rede.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { analiseDesatualizada } from "@shared/contextoDaAnalise";

const semComentarios = (t: string) =>
  t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\/[^\n]*/g, "");
const fonte = (p: string) => semComentarios(readFileSync(new URL(p, import.meta.url), "utf-8"));

const cabecalho = () => fonte("./AccountHeader.tsx");
const rotas = () => fonte("../../../server/routers.ts");
const banco = () => fonte("../../../server/db.ts");

describe("o erro da atualização chega em quem pode agir", () => {
  /** O padrão que causou o impasse: `onError` que joga a mensagem fora. */
  it("a mensagem do servidor não é descartada", () => {
    const s = cabecalho();
    expect(s, "o onError voltou a engolir a mensagem")
      .not.toContain('toast.error("Erro ao atualizar status IA")');
    expect(s).toContain("setErroAnalise(e.message)");
  });

  /** Toast some em três segundos; a mensagem precisa ficar para ser copiada. */
  it("o erro fica na tela, e não só no toast", () => {
    const s = cabecalho();
    expect(s).toContain("erroAnalise &&");
    expect(s).toContain("Não foi possível atualizar.");
  });

  /**
   * Falhou, nada é invalidado: o aviso de desatualizada continua no ar porque a
   * análise continua velha. Limpá-lo marcaria como atualizado o que não foi.
   */
  it("falha NÃO invalida a vigência nem marca como atualizada", () => {
    const s = cabecalho();
    const bloco = s.slice(s.indexOf("trpc.accounts.refreshStatus.useMutation"),
      s.indexOf("const [erroSync"));
    const onError = bloco.slice(bloco.indexOf("onError:"));
    expect(onError).not.toContain("analiseVigente.invalidate");
    expect(onError).not.toContain("accounts.list.invalidate");
  });

  /** Clique duplo não dispara duas análises. */
  it("o botão trava enquanto processa", () => {
    const s = cabecalho();
    expect(s).toContain("disabled={refreshStatus.isPending}");
    expect(s).toContain('refreshStatus.isPending ? "Atualizando…"');
  });

  /** O servidor separa "IA não configurada" de falha do modelo. */
  it("a procedure traduz a causa em vez de subir 500 genérico", () => {
    const s = rotas();
    const bloco = s.slice(s.indexOf("refreshStatus: protectedProcedure"),
      s.indexOf("refreshAllStatus:"));
    expect(bloco).toContain("ANTHROPIC_API_KEY");
    expect(bloco).toContain("PRECONDITION_FAILED");
    // Texto de erro de API é como credencial vaza para tela.
    expect(bloco).toContain("sanitizar(");
  });
});

describe("o aviso some quando — e só quando — a análise é refeita", () => {
  const antes = new Date("2026-08-18T10:00:00Z");
  const depois = new Date("2026-08-18T11:00:00Z");

  it("contexto mais novo que a análise ⇒ desatualizada", () => {
    expect(analiseDesatualizada(antes, depois)).toBe(true);
  });

  it("análise refeita depois do contexto ⇒ aviso some", () => {
    expect(analiseDesatualizada(depois, antes)).toBe(false);
  });

  /**
   * O carimbo entra no MESMO update do resumo. Gravado num segundo write, uma
   * falha entre os dois deixaria a análise sem data — e ela nunca mais
   * apareceria como desatualizada, que é a falha silenciosa deste fluxo.
   */
  it("a data da análise é gravada junto do texto, num update só", () => {
    const s = banco();
    const fn = s.slice(s.indexOf("export async function updateAccountAiStatus"));
    const primeiroSet = fn.slice(fn.indexOf(".set({"), fn.indexOf("})", fn.indexOf(".set({")));
    expect(primeiroSet).toContain("aiStatusColor");
    expect(primeiroSet).toContain("aiStatusSummary");
    expect(primeiroSet, "o carimbo saiu do update do resumo").toContain("aiStatusAt");
  });
});
