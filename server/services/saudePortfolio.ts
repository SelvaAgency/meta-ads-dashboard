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
import { contasDeMidia, contextosDeAchado } from "../db";
import { achadoQueLidera, aplicarContextoAosAchados } from "../../shared/contextoDoAchado";

export type SaudeConta = {
  accountId: number; nivel: NivelSaude; adendo: AdendoSaude | null;
  /** A explicação da equipe para ESTE ponto, quando existe. */
  adendoContexto?: string | null;
  /** A chave do ponto — é por ela que a tela salva a explicação. */
  adendoChave?: string | null;
};

export async function saudeDoPortfolio(): Promise<SaudeConta[]> {
  const [contas, clientes] = await Promise.all([
    contasDeMidia(),
    montarClientesPanorama(),
  ]);

  const panoramaPorConta = new Map(clientes.map((c) => [c.accountId, avaliarCliente(c)]));

  // Os contextos de ponto de TODAS as contas, numa consulta por conta. Sem isso
  // seria uma consulta por conta dentro do map, e o portfólio inteiro pagaria.
  const contextosPorConta = new Map<number, Awaited<ReturnType<typeof contextosDeAchado>>>();
  await Promise.all(contas.map(async (c) => {
    contextosPorConta.set(c.id, await contextosDeAchado(c.id).catch(() => []));
  }));

  return contas.map((c) => {
    // Nível = RESULTADOS (cor da IA). Achados técnicos não rebaixam; alertas
    // (token/crítico) estão fora por ora (backlog não confiável) — ver saudeConta.
    const nivel = saudeConta({
      aiStatusColor: ((c as { aiStatusColor?: string | null }).aiStatusColor ?? null) as CorIA,
    });

    // Adendo técnico = o pior achado do Panorama (crítico > atenção). Só informa,
    // não muda o nível — "saudável, mas há um problema técnico a olhar".
    // A escolha do adendo passa pela regra de contexto: um alerta já explicado
    // deixa de liderar enquanto houver alerta sem explicação. Antes era
    // `find(critico) ?? find(atencao)`, que ignorava o que a equipe já resolveu
    // e mantinha a mesma frase no topo todo dia.
    const achados = panoramaPorConta.get(c.id)?.achados ?? [];
    const ordenados = aplicarContextoAosAchados(
      achados, (contextosPorConta.get(c.id) ?? []).map((x) => ({ chave: x.chave, texto: x.texto })));
    const lider = achadoQueLidera(ordenados);
    const adendo: AdendoSaude | null = lider
      ? { severidade: lider.achado.severidade as "critico" | "atencao", texto: lider.achado.texto }
      : null;

    return {
      accountId: c.id, nivel, adendo,
      adendoContexto: lider?.contexto ?? null,
      adendoChave: lider?.achado.chave ?? null,
    };
  });
}
