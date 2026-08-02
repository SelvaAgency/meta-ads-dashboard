/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Observações automáticas — aprendizado results-driven (independe de sugestões)
 * ─────────────────────────────────────────────────────────────────────────────
 *  Roda no cron noturno. Para cada conta, pega os ACHADOS multi-fonte do Panorama
 *  (vendas reais da loja, tráfego GA4, vazamento de funil, site fora do ar/SSL —
 *  sinais que o status Meta-only NÃO enxerga) e grava os NOVOS como aprendizado
 *  permanente no `learnings` — que todas as IAs leem pela fonte única.
 *
 *  Dedup: uma condição que se mantém (ex.: site fora do ar há dias) NÃO é
 *  reescrita toda noite. A chave ignora números (%/valores) para "vendas -40%"
 *  e "vendas -55%" contarem como a mesma condição.
 */
import { logger } from "../logger";
import { getAccountContext, appendAccountLearning } from "../db";
import { montarClientesPanorama } from "./jornalExecutivo";
import { achadosDe } from "../../shared/panoramaLogic";

/** Chave estável de um achado — sem dígitos, para não repetir a cada oscilação. */
function chaveDoAchado(texto: string): string {
  return texto.toLowerCase().replace(/[\d.,%r$\s]+/g, " ").trim().slice(0, 50);
}

export async function runObservacoesAutomaticas(): Promise<{ contas: number; registrados: number }> {
  let clientes;
  try {
    clientes = await montarClientesPanorama();
  } catch (e) {
    logger.warn(`[Observações] Panorama indisponível: ${(e as Error).message}`);
    return { contas: 0, registrados: 0 };
  }

  let registrados = 0;
  for (const c of clientes) {
    try {
      const achados = achadosDe(c).filter((a) => a.severidade !== "info").slice(0, 3);
      if (!achados.length) continue;

      const ctx = await getAccountContext(c.accountId).catch(() => null);
      const learnings = (ctx?.learnings ?? "").toLowerCase();

      for (const a of achados) {
        const chave = chaveDoAchado(a.texto);
        if (chave.length < 6) continue;            // texto curto demais p/ dedup confiável
        if (learnings.includes(chave)) continue;   // condição já registrada — não repete
        await appendAccountLearning(c.accountId, `Observação (multi-fonte): ${a.texto}`, "auto-observacao").catch(() => {});
        registrados++;
      }
    } catch (e) {
      logger.warn(`[Observações] Falha na conta ${c.accountId}: ${(e as Error).message}`);
    }
  }

  logger.info(`[Observações] ${registrados} aprendizado(s) multi-fonte registrado(s) em ${clientes.length} conta(s).`);
  return { contas: clientes.length, registrados };
}
