/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Dicionário de classificação de fatura — persistência + seed
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  A REGRA de negócio (padrões SELVA/pessoal) mora no classificador puro
 *  (DICIONARIO_SEED). Aqui só se persiste e cresce: a tabela é semeada uma vez
 *  com essa semente e depois recebe as confirmações do Gui. Uma fonte de
 *  verdade — o seed nunca é redigitado.
 *
 *  Guarda SÓ o mapa de classificação (padrão → categoria). NUNCA valores da
 *  fatura, nunca linha de gasto pessoal.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { getDb } from "../../db";
import { financeMerchantMap } from "../../../drizzle/schema";
import { and, eq } from "drizzle-orm";
import { DICIONARIO_SEED, type Regra } from "./classificador";
import { logger } from "../../logger";

/** Semeia a tabela a partir da semente do classificador (idempotente por vazio). */
async function semearSeVazio(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const existentes = await db.select({ id: financeMerchantMap.id }).from(financeMerchantMap).limit(1);
  if (existentes.length > 0) return; // já semeado — não duplica
  const rows = DICIONARIO_SEED.map((r) => ({
    padrao: r.padrao.source.slice(0, 200),
    canonical: r.canonical,
    categoria: r.categoria,
    valorCents: r.valorCents ?? null,
    origem: "SEED" as const,
  }));
  if (rows.length) await db.insert(financeMerchantMap).values(rows);
  logger.info(`[Fatura] dicionário semeado com ${rows.length} regras`);
}

/**
 * Carrega o dicionário do banco como `Regra[]` (o formato que o classificador
 * puro consome). Regras CONFIRMADAS antes das SEED — o que o Gui validou tem
 * prioridade sobre o padrão genérico. Fallback para a semente se o banco cair.
 */
export async function carregarDicionario(): Promise<Regra[]> {
  const db = await getDb();
  if (!db) return DICIONARIO_SEED;
  await semearSeVazio();
  const rows = await db.select().from(financeMerchantMap).where(eq(financeMerchantMap.ativo, true));
  if (rows.length === 0) return DICIONARIO_SEED;
  const paraRegra = (r: typeof rows[number]): Regra | null => {
    try {
      return { padrao: new RegExp(r.padrao, "i"), canonical: r.canonical, categoria: r.categoria, valorCents: r.valorCents ?? undefined };
    } catch {
      return null; // padrão inválido — ignora em vez de derrubar a classificação
    }
  };
  // CONFIRMADO primeiro, depois SEED; valor-específico (Apple) antes do genérico.
  const ordenadas = [...rows].sort((a, b) => {
    if (a.origem !== b.origem) return a.origem === "CONFIRMADO" ? -1 : 1;
    return (b.valorCents != null ? 1 : 0) - (a.valorCents != null ? 1 : 0);
  });
  return ordenadas.map(paraRegra).filter((r): r is Regra => r !== null);
}

/** Escapa um descritor para virar um padrão de regex exato (case-insensitive). */
function escaparRegex(s: string): string {
  return s.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&").slice(0, 200);
}

/**
 * APRENDE: grava as decisões de "revisar" do Gui como regras CONFIRMADO. Um
 * estabelecimento novo classificado por ele passa a ser reconhecido no mês
 * seguinte. Idempotente: se a regra já existe (mesmo padrão+categoria), só
 * incrementa `vezesConfirmado`. Guarda SÓ o mapa — nunca valor nem gasto.
 */
export async function aprenderRegras(
  decisoes: { descritor: string; categoria: "SELVA" | "PESSOAL"; canonical?: string }[],
): Promise<{ novas: number; reforcadas: number }> {
  const db = await getDb();
  if (!db) return { novas: 0, reforcadas: 0 };
  let novas = 0, reforcadas = 0;
  for (const d of decisoes) {
    const padrao = escaparRegex(d.descritor);
    if (!padrao) continue;
    const canonical = (d.canonical?.trim() || d.descritor.trim() || "Novo").slice(0, 120);
    const existente = await db.select({ id: financeMerchantMap.id, vezes: financeMerchantMap.vezesConfirmado })
      .from(financeMerchantMap)
      .where(and(eq(financeMerchantMap.padrao, padrao), eq(financeMerchantMap.categoria, d.categoria)))
      .limit(1);
    if (existente[0]) {
      await db.update(financeMerchantMap)
        .set({ vezesConfirmado: existente[0].vezes + 1, ativo: true, origem: "CONFIRMADO" })
        .where(eq(financeMerchantMap.id, existente[0].id));
      reforcadas++;
    } else {
      await db.insert(financeMerchantMap).values({
        padrao, canonical, categoria: d.categoria, origem: "CONFIRMADO", vezesConfirmado: 1,
      });
      novas++;
    }
  }
  logger.info(`[Fatura] aprendizado: ${novas} regras novas · ${reforcadas} reforçadas`);
  return { novas, reforcadas };
}
