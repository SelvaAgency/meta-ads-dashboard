/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  A porta: de onde vêm os dados de Instagram de um cliente
 * ─────────────────────────────────────────────────────────────────────────────
 *  Hoje existe uma fonte só — o token da agência. A porta existe porque virá uma
 *  segunda (login da própria conta, via OAuth), e as duas NÃO falam a mesma API:
 *  a da agência entra pelo Portfólio e chega ao Instagram através da Página; a
 *  do cliente entra direto na conta, sem Página nenhuma no caminho.
 *
 *  Sem uma porta, essa diferença vaza para quem chama: cada tela e cada rotina
 *  passaria a perguntar "qual fonte é esta?" antes de saber o que pedir — e
 *  seria em cada um desses `if` que as duas se comportariam diferente sem
 *  ninguém decidir isso. Com a porta, quem chama pede perfil, insights ou
 *  diagnóstico, e a fonte resolve como.
 *
 *  ── O que NÃO é comum às duas ──────────────────────────────────────────────
 *  `descobrirPaginas` é opcional de propósito. Portfólio é conceito da fonte da
 *  agência; a fonte por conta autoriza UMA conta por vez e não tem o que
 *  descobrir. Fingir que ela também descobre — devolvendo lista vazia — faria a
 *  tela mostrar "nenhuma Página encontrada" para quem nunca teve Páginas, que é
 *  um problema inventado.
 *
 *  ── O token não sai daqui ──────────────────────────────────────────────────
 *  A fonte busca a própria credencial. Quem chama nunca recebe token, nem para
 *  repassar: era assim que `accounts[0].accessToken` circulava pelo código.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import type { FonteNome, StatusInsight, TipoConta } from "@shared/instagram";
import type { DiagnosticoInstagram, PaginaDescoberta } from "./instagram";
import type { Sondagem } from "./instagramSondagem";
import type { ColetaSocial } from "./coletaSocial";
import type { SondagemDireta } from "./sondagemInstagramDireto";
import type { SondagemDeHorarios } from "./sondagemHorarios";
import type { SondagemDeJanela } from "./sondagemJanela";
import type { SondagemAninhada } from "./sondagemAninhada";

// Nome e rótulo da fonte vivem em shared: a tela também os usa, e duas listas
// divergiriam no dia em que uma terceira fonte aparecer.
export type { FonteNome } from "@shared/instagram";
export { ROTULO_FONTE } from "@shared/fontesSociais";

/** Onde a fonte deve olhar. Nem toda fonte usa os dois campos. */
export interface AlvoInstagram {
  pageId?: string | null;
  instagramUserId?: string | null;
}

/**
 * O perfil, no denominador comum das duas fontes.
 *
 * Só entra aqui o que AMBAS entregam de verdade. Seguidores, por exemplo, ficam
 * de fora: a fonte da agência os traz na descoberta de Páginas, não na leitura
 * do perfil, e um campo sempre nulo convida a confiar nele.
 */
export interface PerfilInstagram {
  instagramUserId: string;
  username: string | null;
  tipoConta: TipoConta;
  posts: number | null;
}

/** Métricas nomeadas uma a uma — ver GRUPOS_METRICAS em `instagram.ts`. */
export interface ResultadoInsights {
  statusInsight: StatusInsight;
  ok: string[];
  recusadas: string[];
}

/** Um post. Mesmos campos nas duas fontes — a Meta usa os mesmos nomes. */
export interface MidiaInstagram {
  id: string;
  caption: string | null;
  mediaType: string | null;
  /** Sem ele, VIDEO+FEED viraria reel — ver shared/tipoDeMidia. */
  mediaProductType: string | null;
  mediaUrl: string | null;
  thumbnailUrl: string | null;
  permalink: string | null;
  timestamp: string | null;
  curtidas: number | null;
  comentarios: number | null;
}

export interface FonteInstagram {
  readonly nome: FonteNome;

  /** Pronta para uso? Falso quando não há credencial cadastrada. */
  disponivel(): Promise<boolean>;

  perfil(alvo: AlvoInstagram): Promise<PerfilInstagram>;

  insights(alvo: AlvoInstagram): Promise<ResultadoInsights>;

  diagnosticar(alvo: AlvoInstagram & { escopoDeCliente?: boolean }): Promise<DiagnosticoInstagram>;

  /** Posts recentes. Vazio é resposta válida — conta nova não é conta quebrada. */
  midias(alvo: AlvoInstagram, limite?: number): Promise<MidiaInstagram[]>;

  /** Só quem tem portfólio. Ver cabeçalho. */
  descobrirPaginas?(): Promise<{ paginas: PaginaDescoberta[]; avisos: string[] }>;

  /**
   * Fase 0: pergunta à Meta, item a item, o que ela entrega para esta conta.
   *
   * Opcional pelo mesmo motivo de `descobrirPaginas`: cada fonte fala com uma
   * API diferente, e a que ainda não implementou deve DIZER que não implementou
   * — devolver matriz vazia seria indistinguível de "a Meta não entrega nada".
   */
  sondar?(alvo: AlvoInstagram): Promise<Sondagem>;

  /**
   * Fase 1: a leitura diária que vira snapshot.
   *
   * Opcional como as outras — a fonte que ainda não coleta precisa DIZER isso.
   * Devolver uma coleta vazia seria gravar um dia inteiro de zeros falsos.
   */
  coletar?(alvo: AlvoInstagram, opts?: { apenasStories?: boolean }): Promise<ColetaSocial>;

  /**
   * Publicações desde um dia, paginando até alcançá-lo.
   *
   * Separado de `midias` porque a pergunta é outra: aquela quer as recentes para
   * a grade, esta quer TODAS de um período para contar. Uma página só truncaria
   * a contagem sem avisar.
   */
  midiasDesde?(alvo: AlvoInstagram, inicio: string): Promise<{
    midias: Array<Record<string, unknown>>; completo: boolean;
  }>;

  /**
   * Instagram alcançável pelo Portfólio SEM passar por Página.
   *
   * Só faz sentido em fonte que tem portfólio — a de login já é uma conta só, e
   * não tem o que descobrir. Optativa pelo mesmo motivo de `descobrirPaginas`.
   */
  sondarInstagramDireto?(): Promise<SondagemDireta>;

  /** Os insights cabem na mesma chamada da listagem? Decide 186→31 ou 186→6. */
  sondarInsightsAninhados?(alvo: AlvoInstagram): Promise<SondagemAninhada>;

  /** Que janela cada número cobre, e em que fuso o dia vira. */
  sondarJanela?(alvo: AlvoInstagram, metrica?: string): Promise<SondagemDeJanela>;

  /** Mede o que `online_followers` entrega — antes de prometer horários. */
  sondarHorarios?(alvo: AlvoInstagram): Promise<SondagemDeHorarios>;

  /** As contas de Instagram do Portfólio, para o seletor de vínculo. */
  descobrirInstagramDireto?(): Promise<{
    contas: Array<{ id: string; username: string | null }>; avisos: string[];
  }>;
}

/**
 * A fonte existe, mas está sem credencial.
 *
 * Erro próprio para quem chama distinguir "não configurado" de "configurado e
 * falhou" — as duas coisas têm conserto diferente, e um `Error` genérico
 * obrigaria a decidir isso comparando texto de mensagem.
 */
export class FonteSemCredencial extends Error {
  constructor(public readonly fonte: FonteNome) {
    super(`Fonte ${fonte} sem credencial cadastrada.`);
    this.name = "FonteSemCredencial";
  }
}
