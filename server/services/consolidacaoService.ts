/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Consolidação de aprendizados — evita que o `learnings` vire histórico infinito
 * ─────────────────────────────────────────────────────────────────────────────
 *  O `learnings` é append-only (transições de estado, observações multi-fonte,
 *  rejeições). Com o tempo fica longo e ruidoso. Semanalmente, quando passa de um
 *  limiar, a IA destila os PADRÕES DURÁVEIS em `learningsConsolidated` e o histórico
 *  cru é recortado pras entradas recentes. O builder injeta os dois (consolidado +
 *  recente), então a memória fica compacta sem perder o que foi aprendido.
 */
import { logger } from "../logger";
import { contasDeMidia, getAccountContext, upsertAccountContext } from "../db";
import { invokeLLM, extractTextContent } from "../_core/llm";

const LIMIAR_CHARS = 1800;   // só consolida quando o histórico cru passa disto
const MANTER_RECENTES = 4;   // entradas cruas preservadas após consolidar

/** Mantém as N entradas mais recentes (cada entrada começa com "[dd/mm/aaaa..."). */
function recortarRecentes(learnings: string, n: number): string {
  const partes = learnings.split(/\n\n(?=\[)/).filter((p) => p.trim());
  return partes.slice(-n).join("\n\n");
}

export async function consolidarLearnings(): Promise<{ contas: number; consolidados: number }> {
  const contas = await contasDeMidia();
  let consolidados = 0;

  for (const c of contas) {
    try {
      const ctx = await getAccountContext(c.id).catch(() => null);
      const learnings = ctx?.learnings ?? "";
      if (learnings.length < LIMIAR_CHARS) continue;

      const base = ctx?.learningsConsolidated ? `Consolidação anterior (já sabida):\n${ctx.learningsConsolidated}\n\n` : "";
      const prompt = `Você mantém a MEMÓRIA de longo prazo de uma conta de anúncios. Abaixo, aprendizados acumulados (notas com data — geradas automaticamente e por decisões da equipe). Produza um "consolidado" conciso (máx 900 caracteres, português) com os PADRÕES DURÁVEIS e regras aprendidas que ainda valem para futuras decisões nesta conta. Incorpore a consolidação anterior. Descarte itens transitórios ou já resolvidos. Não invente. Não repita datas — extraia o padrão, não o log.\n\n${base}Aprendizados:\n${learnings}`;

      const resp = await invokeLLM({ messages: [{ role: "user", content: prompt }], thinking: false });
      const consolidado = extractTextContent(resp).trim().slice(0, 1500);
      if (!consolidado) continue;

      await upsertAccountContext(c.id, {
        learningsConsolidated: consolidado,
        learnings: recortarRecentes(learnings, MANTER_RECENTES),
        updatedBy: "auto-consolidacao",
      });
      consolidados++;
      await new Promise((r) => setTimeout(r, 2000)); // throttle LLM (evita 429)
    } catch (e) {
      logger.warn(`[Consolidação] Falha na conta ${c.id}: ${(e as Error).message}`);
    }
  }

  logger.info(`[Consolidação] ${consolidados} conta(s) consolidada(s) de ${contas.length}.`);
  return { contas: contas.length, consolidados };
}
