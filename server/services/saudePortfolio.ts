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
import { saudeConta, type NivelSaude, type CorIA, type AdendoSaude } from "../../shared/saudeConta";
import { montarClientesPanorama } from "./jornalExecutivo";
import { getAllActiveMetaAdAccountsForListing, getAlertasParaSaude } from "../db";

export type SaudeConta = { accountId: number; nivel: NivelSaude; adendo: AdendoSaude | null };

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
    // Nível = RESULTADOS (IA) + token. Achados técnicos não rebaixam.
    const nivel = saudeConta({
      aiStatusColor: ((c as { aiStatusColor?: string | null }).aiStatusColor ?? null) as CorIA,
      temErroToken: comErroToken.has(c.id),
    });

    // Adendo técnico = o pior achado do Panorama (crítico > atenção). Só informa,
    // não muda o nível — "saudável, mas há um problema técnico a olhar".
    const achados = panoramaPorConta.get(c.id)?.achados ?? [];
    const pick = achados.find((a) => a.severidade === "critico")
      ?? achados.find((a) => a.severidade === "atencao");
    const adendo: AdendoSaude | null = pick ? { severidade: pick.severidade as "critico" | "atencao", texto: pick.texto } : null;

    return { accountId: c.id, nivel, adendo };
  });
}
