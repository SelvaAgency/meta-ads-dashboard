/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  A rotina de coleta — quem entra, em que ordem, e o que acontece quando falha
 * ─────────────────────────────────────────────────────────────────────────────
 *  Duas execuções por dia, com papéis diferentes:
 *
 *    06:20  coleta geral — perfil, insights, mídias e stories
 *    18:20  só stories
 *
 *  A segunda existe porque story vive 24 horas. Com uma passada por dia as
 *  janelas ficam encostadas, e qualquer atraso abre um buraco que nunca fecha.
 *  Com duas, elas se sobrepõem em 12h e uma execução perdida não custa nada.
 *  Perfil e mídias não precisam disso: alcançam o passado e se recalculam.
 *
 *  ── Sequencial de propósito ────────────────────────────────────────────────
 *  Cada cliente são ~20 chamadas à Meta. Em paralelo, 16 clientes disparariam
 *  ~300 chamadas no mesmo segundo — que é como se pede para ser limitado por
 *  rate limit. Em fila, com pausa curta, o custo é tempo de máquina ocioso.
 *
 *  ── Falhar num cliente não pode derrubar os outros ─────────────────────────
 *  Cada conta é um try próprio. Token de um cliente vencido não pode custar o
 *  dia inteiro de todos os demais — e o dia perdido de stories não volta.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { logger } from "../logger";
import {
  primeiroDiaDeColetaSocial, registrarExecucaoDeColeta, registrarStoriesDoDia,
  salvarMidiasDoSnapshot, salvarSnapshotSocial, vinculosSociais,
} from "../db";
import { fonteAgencia } from "./fonteInstagramAgencia";
import { estadosDasFontes, fonteInstagramDaConta } from "./resolucaoDeFonte";
import { escolherFonte } from "@shared/fontesSociais";
import { diaDeHoje } from "./coletaSocial";

export interface ResultadoDaRodada {
  dia: string;
  tentados: number;
  ok: number;
  parciais: number;
  erros: number;
  pulados: number;
  detalhes: Array<{ accountId: number; status: string; nota: string }>;
}

const pausa = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Coleta um cliente.
 *
 * Devolve o que aconteceu em vez de lançar: quem chama está num laço e precisa
 * seguir para o próximo.
 */
export async function coletarCliente(
  accountId: number,
  opts: { apenasStories?: boolean; dia?: string } = {},
): Promise<{ status: string; nota: string }> {
  const dia = opts.dia ?? diaDeHoje();

  const conta = fonteInstagramDaConta(accountId);
  const agencia = fonteAgencia();
  const escolha = escolherFonte(await estadosDasFontes(accountId, conta, agencia));

  // Fonte quebrada NÃO é motivo para gravar zero: sem leitura, o dia fica sem
  // linha, que é o quarto estado — "não estávamos medindo".
  if (!escolha.usada) return { status: "pulado", nota: escolha.titulo };

  const fonte = escolha.usada === "oauth_conta" ? conta : agencia;
  if (!fonte.coletar) return { status: "pulado", nota: `fonte ${escolha.usada} ainda não coleta` };

  const vinculo = (await vinculosSociais()).find((v) => v.accountId === accountId);
  const alvo = { pageId: vinculo?.pageId, instagramUserId: vinculo?.instagramUserId };
  if (escolha.usada === "agencia_system_user" && !vinculo?.instagramUserId) {
    return { status: "pulado", nota: "sem Instagram vinculado" };
  }

  const r = await fonte.coletar(alvo, { apenasStories: opts.apenasStories });

  if (opts.apenasStories) {
    await registrarStoriesDoDia(accountId, dia, r.storiesVistos, r.erro);
    return { status: r.storiesVistos === null ? "erro" : "ok", nota: `stories: ${r.storiesVistos ?? "não medido"}` };
  }

  await salvarSnapshotSocial({
    accountId, dia,
    connectionSource: escolha.usada,
    instagramUserId: vinculo?.instagramUserId ?? null,
    followersCount: r.followersCount, followsCount: r.followsCount, mediaCount: r.mediaCount,
    metricas: r.metricas, followTypeBreakdownRaw: r.followTypeBreakdownRaw,
    recusadas: r.recusadas, storiesVistos: r.storiesVistos,
    status: r.status, erro: r.erro,
  });
  await salvarMidiasDoSnapshot(accountId, dia, r.midias);

  return {
    status: r.status,
    nota: `${r.followersCount ?? "?"} seguidores · ${r.midias.length} publicações · ${Object.keys(r.recusadas).length} recusa(s)`,
  };
}

/** A rodada inteira: todo cliente com vínculo de Instagram salvo. */
export async function rodarColetaSocial(opts: { apenasStories?: boolean } = {}): Promise<ResultadoDaRodada> {
  const dia = diaDeHoje();
  const vinculos = await vinculosSociais();
  // Só quem tem Instagram: cliente sem vínculo não tem o que coletar, e tentar
  // encheria o log de falhas previsíveis.
  const alvos = vinculos.filter((v) => v.instagramUserId);

  const r: ResultadoDaRodada = {
    dia, tentados: alvos.length, ok: 0, parciais: 0, erros: 0, pulados: 0, detalhes: [],
  };

  for (const v of alvos) {
    try {
      const res = await coletarCliente(v.accountId, { apenasStories: opts.apenasStories, dia });
      r.detalhes.push({ accountId: v.accountId, status: res.status, nota: res.nota });
      if (res.status === "ok") r.ok += 1;
      else if (res.status === "parcial") r.parciais += 1;
      else if (res.status === "pulado") r.pulados += 1;
      else r.erros += 1;
    } catch (e) {
      r.erros += 1;
      r.detalhes.push({ accountId: v.accountId, status: "erro", nota: (e as Error).message });
      logger.error(`[ColetaSocial] cliente #${v.accountId} falhou: ${(e as Error).message}`);
    }
    await pausa(1_500);
  }

  // A execução é gravada, e não só logada: o log some do Railway e a tela
  // precisa responder "o robô rodou hoje?" sem ninguém abrir terminal.
  await registrarExecucaoDeColeta({
    origem: "cron",
    escopo: opts.apenasStories ? "stories" : "geral",
    dia, tentados: r.tentados, ok: r.ok, parciais: r.parciais, erros: r.erros, pulados: r.pulados,
    detalhe: r.detalhes,
  });

  logger.info(
    `[ColetaSocial] ${opts.apenasStories ? "stories" : "geral"} ${dia}: ` +
    `${r.ok} ok · ${r.parciais} parciais · ${r.erros} erros · ${r.pulados} pulados`,
  );
  return r;
}

/** Desde quando existe série para um cliente. Alimenta o seletor de período. */
export const inicioDaSerie = primeiroDiaDeColetaSocial;
