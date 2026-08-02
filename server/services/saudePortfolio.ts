/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Saúde do portfólio — o veredito único, computado no servidor
 * ─────────────────────────────────────────────────────────────────────────────
 *  UMA fonte de verdade para a saúde de cada conta, lida por TODAS as telas
 *  (Visão Geral, cabeçalho da conta, Resumo, Plano de Ação, Panorama). Combina
 *  os sinais com o motor compartilhado `saudeConta`: regras definem o piso
 *  (Panorama medido + alerta crítico + token), a IA refina o resto.
 *
 *  On-demand (não gravado): sempre fresco, sem coluna nova nem job. Reusa o
 *  builder do Panorama, então o veredito nunca diverge da tela de Panorama.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { avaliarCliente } from "../../shared/panoramaLogic";
import { saudeConta, type NivelSaude, type CorIA } from "../../shared/saudeConta";
import { montarClientesPanorama } from "./jornalExecutivo";
import { getAllActiveMetaAdAccountsForListing, getAlertasParaSaude } from "../db";

export type SaudeConta = { accountId: number; nivel: NivelSaude; motivo: string | null };

export async function saudeDoPortfolio(): Promise<SaudeConta[]> {
  const [contas, clientes, alertas] = await Promise.all([
    getAllActiveMetaAdAccountsForListing(),
    montarClientesPanorama(),
    getAlertasParaSaude(),
  ]);

  const panoramaPorConta = new Map(clientes.map((c) => [c.accountId, avaliarCliente(c)]));

  const comErroToken = new Set<number>();
  for (const a of alertas) {
    if (a.accountId == null) continue;
    // Mesma regra do accounts.list: SYNC_ERROR não lido cujo título é "Token expirado…".
    if (a.type === "SYNC_ERROR" && a.title?.startsWith("Token expirado")) comErroToken.add(a.accountId);
  }

  return contas.map((c) => {
    const pano = panoramaPorConta.get(c.id);
    const nivel = saudeConta({
      aiStatusColor: ((c as { aiStatusColor?: string | null }).aiStatusColor ?? null) as CorIA,
      panoramaNivel: pano?.nivel ?? null,
      // temAlertaCritico DESLIGADO por ora: o sistema de alertas está pausado e o
      // backlog de alertas críticos antigos (nunca marcados como lidos) floorava
      // TODAS as contas para Crítico. Volta na Fase 2, com a taxonomia de alertas
      // limpa e a fronteira alerta/recomendação definida.
      temErroToken: comErroToken.has(c.id),
    });
    return { accountId: c.id, nivel, motivo: pano?.motivos[0] ?? null };
  });
}
