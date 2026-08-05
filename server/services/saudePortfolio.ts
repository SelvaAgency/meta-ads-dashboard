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
import { contasDeMidia } from "../db";

export type SaudeConta = { accountId: number; nivel: NivelSaude; adendo: AdendoSaude | null };

export async function saudeDoPortfolio(): Promise<SaudeConta[]> {
  const [contas, clientes] = await Promise.all([
    contasDeMidia(),
    montarClientesPanorama(),
  ]);

  const panoramaPorConta = new Map(clientes.map((c) => [c.accountId, avaliarCliente(c)]));

  return contas.map((c) => {
    // Nível = RESULTADOS (cor da IA). Achados técnicos não rebaixam; alertas
    // (token/crítico) estão fora por ora (backlog não confiável) — ver saudeConta.
    const nivel = saudeConta({
      aiStatusColor: ((c as { aiStatusColor?: string | null }).aiStatusColor ?? null) as CorIA,
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
