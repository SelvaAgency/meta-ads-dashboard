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
  duracaoMs: number;
  /** Total de chamadas à Meta na rodada — o número que a hipótese precisa. */
  chamadas: number;
  chamadasComErro: number;
  detalhes: Array<{
    accountId: number; status: string; nota: string;
    ms: number; chamadas: number; chamadasComErro: number;
  }>;
}

/**
 * Uma rodada por vez.
 *
 * Duas execuções sobrepostas dobrariam a pressão sobre a API — exatamente a
 * variável que estamos tentando medir. Um clique distraído durante o teste
 * invalidaria o teste.
 */
let rodadaEmAndamento: string | null = null;
export const rodadaEstaEmAndamento = (): string | null => rodadaEmAndamento;

const pausa = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Coleta um cliente.
 *
 * Devolve o que aconteceu em vez de lançar: quem chama está num laço e precisa
 * seguir para o próximo.
 */
export async function coletarCliente(
  accountId: number,
  opts: { apenasStories?: boolean; dia?: string; origem?: "cron" | "manual" } = {},
): Promise<{ status: string; nota: string; chamadas: number; chamadasComErro: number }> {
  const dia = opts.dia ?? diaDeHoje();

  const conta = fonteInstagramDaConta(accountId);
  const agencia = fonteAgencia();
  const escolha = escolherFonte(await estadosDasFontes(accountId, conta, agencia));

  // Fonte quebrada NÃO é motivo para gravar zero: sem leitura, o dia fica sem
  // linha, que é o quarto estado — "não estávamos medindo".
  const vazio = { chamadas: 0, chamadasComErro: 0 };
  if (!escolha.usada) return { status: "pulado", nota: escolha.titulo, ...vazio };

  const fonte = escolha.usada === "oauth_conta" ? conta : agencia;
  if (!fonte.coletar) return { status: "pulado", nota: `fonte ${escolha.usada} ainda não coleta`, ...vazio };

  const vinculo = (await vinculosSociais()).find((v) => v.accountId === accountId);
  const alvo = { pageId: vinculo?.pageId, instagramUserId: vinculo?.instagramUserId };
  if (escolha.usada === "agencia_system_user" && !vinculo?.instagramUserId) {
    return { status: "pulado", nota: "sem Instagram vinculado", ...vazio };
  }

  const r = await fonte.coletar(alvo, { apenasStories: opts.apenasStories });

  if (opts.apenasStories) {
    await registrarStoriesDoDia(accountId, dia, r.storiesVistos, r.erro);
    return {
      status: r.storiesVistos === null ? "erro" : "ok",
      nota: `stories: ${r.storiesVistos ?? "não medido"}`,
      chamadas: r.chamadas, chamadasComErro: r.chamadasComErro,
    };
  }

  await salvarSnapshotSocial({
    accountId, dia,
    connectionSource: escolha.usada,
    instagramUserId: vinculo?.instagramUserId ?? null,
    followersCount: r.followersCount, followsCount: r.followsCount, mediaCount: r.mediaCount,
    metricas: r.metricas, followTypeBreakdownRaw: r.followTypeBreakdownRaw,
    recusadas: r.recusadas, storiesVistos: r.storiesVistos,
    status: r.status, erro: r.erro, origem: opts.origem ?? "cron",
  });
  await salvarMidiasDoSnapshot(accountId, dia, r.midias);

  return {
    status: r.status,
    // Conta que falhou precisa dizer POR QUÊ na própria linha: "? seguidores ·
    // 0 publicações" não distingue limite da Meta de token vencido, e é essa
    // distinção que o registro da execução existe para permitir.
    nota: r.status === "erro" && r.erro
      ? r.erro
      : `${r.followersCount ?? "?"} seguidores · ${r.midias.length} publicações · ${Object.keys(r.recusadas).length} recusa(s)` +
        // Só aparece quando o caminho aninhado NÃO serviu. No caminho normal a
        // linha ficaria poluída por uma informação sempre igual; quando ele
        // falha, é ela que explica por que as chamadas daquela conta pularam.
        (r.caminhoDasMidias !== "aninhado" ? ` · mídias via ${r.caminhoDasMidias}` : "") +
        (r.erro ? ` · ${r.erro}` : ""),
    chamadas: r.chamadas, chamadasComErro: r.chamadasComErro,
  };
}

/** A rodada inteira: todo cliente com vínculo de Instagram salvo. */
export async function rodarColetaSocial(
  opts: { apenasStories?: boolean; origem?: "cron" | "manual" } = {},
): Promise<ResultadoDaRodada> {
  const origem = opts.origem ?? "cron";
  const dia = diaDeHoje();
  const comecou = Date.now();
  rodadaEmAndamento = `${origem} · ${opts.apenasStories ? "stories" : "geral"}`;
  try {
  const vinculos = await vinculosSociais();
  // Só quem tem Instagram: cliente sem vínculo não tem o que coletar, e tentar
  // encheria o log de falhas previsíveis.
  const alvos = vinculos.filter((v) => v.instagramUserId);

  const r: ResultadoDaRodada = {
    dia, tentados: alvos.length, ok: 0, parciais: 0, erros: 0, pulados: 0,
    duracaoMs: 0, chamadas: 0, chamadasComErro: 0, detalhes: [],
  };

  for (const v of alvos) {
    const iniciou = Date.now();
    try {
      const res = await coletarCliente(v.accountId, { apenasStories: opts.apenasStories, dia, origem });
      r.detalhes.push({
        accountId: v.accountId, status: res.status, nota: res.nota,
        ms: Date.now() - iniciou, chamadas: res.chamadas, chamadasComErro: res.chamadasComErro,
      });
      r.chamadas += res.chamadas;
      r.chamadasComErro += res.chamadasComErro;
      if (res.status === "ok") r.ok += 1;
      else if (res.status === "parcial") r.parciais += 1;
      else if (res.status === "pulado") r.pulados += 1;
      else r.erros += 1;
    } catch (e) {
      r.erros += 1;
      r.detalhes.push({
        accountId: v.accountId, status: "erro", nota: (e as Error).message,
        ms: Date.now() - iniciou, chamadas: 0, chamadasComErro: 0,
      });
      logger.error(`[ColetaSocial] cliente #${v.accountId} falhou: ${(e as Error).message}`);
    }
    await pausa(1_500);
  }
  r.duracaoMs = Date.now() - comecou;

  // A execução é gravada, e não só logada: o log some do Railway e a tela
  // precisa responder "o robô rodou hoje?" sem ninguém abrir terminal.
  // Origem REAL, e não "cron" fixo: um teste manual registrado como automático
  // faria a linha "o robô rodou hoje?" mentir — e é justamente essa linha que
  // está sendo usada para investigar o robô.
  await registrarExecucaoDeColeta({
    origem,
    escopo: opts.apenasStories ? "stories" : "geral",
    dia, tentados: r.tentados, ok: r.ok, parciais: r.parciais, erros: r.erros, pulados: r.pulados,
    duracaoMs: r.duracaoMs, chamadas: r.chamadas, chamadasComErro: r.chamadasComErro,
    detalhe: r.detalhes,
  });

  logger.info(
    `[ColetaSocial] ${origem} ${opts.apenasStories ? "stories" : "geral"} ${dia}: ` +
    `${r.ok} ok · ${r.parciais} parciais · ${r.erros} erros · ${r.pulados} pulados · ` +
    `${r.chamadas} chamadas (${r.chamadasComErro} com erro) em ${Math.round(r.duracaoMs / 1000)}s`,
  );
  return r;
  } finally {
    rodadaEmAndamento = null;
  }
}

/** Desde quando existe série para um cliente. Alimenta o seletor de período. */
export const inicioDaSerie = primeiroDiaDeColetaSocial;
