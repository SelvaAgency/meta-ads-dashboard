/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Ativações — o total, sem apagar a composição
 * ─────────────────────────────────────────────────────────────────────────────
 *  Puro, compartilhado. Post e story viraram uma métrica só porque a pergunta
 *  "quanto essa conta produziu no período?" não distingue os dois — mas a
 *  resposta precisa continuar distinguindo, e por um motivo concreto:
 *
 *    12 ativações = 12 posts   conta que produz conteúdo de feed
 *    12 ativações = 1 post + 11 stories   conta que quase não publica
 *
 *  São contas com comportamentos opostos e o mesmo número. Somar sem mostrar a
 *  composição criaria um indicador que sobe do jeito mais fácil — e nenhum time
 *  descobriria isso pela tela.
 *
 *  ── Story medido não é story publicado ─────────────────────────────────────
 *  A coleta lê os stories que estão NO AR no momento da consulta. Um story
 *  publicado às 8h e expirado antes das 18:20 não é visto por ninguém. O número
 *  é, portanto, um PISO — e `diasSemMedicao` existe para a tela poder dizer
 *  isso em vez de apresentar um total como se fosse completo.
 *
 *  ── Amostra não é contagem ─────────────────────────────────────────────────
 *  O coletor pede as 25 mídias mais recentes numa chamada só. 25 é o tamanho do
 *  LOTE, não a produção do período: dessas, talvez duas sejam de hoje. Contar a
 *  lista inteira produz um número plausível, estável e errado — o tipo que
 *  ninguém reporta como bug, só como estranheza.
 *
 *  ── Preparado para o LinkedIn, sem fingir que ele existe ───────────────────
 *  `fontes` é uma lista, e hoje ela tem um item. Quando o LinkedIn entrar, ele
 *  vira outro item — e nada aqui muda. O que NÃO existe é um item de LinkedIn
 *  com zero: zero é um número, e um número que ninguém mediu é mentira.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { CONTA_COMO_POST, ROTULO_CONTEUDO, type TipoConteudo } from "./tipoDeMidia";

export interface ParcelaDeAtivacao {
  /** "Posts", "Stories", e um dia "Publicações do LinkedIn". */
  rotulo: string;
  total: number;
  /** `true` quando o número é um piso conhecido, e não a contagem completa. */
  incompleto?: boolean;
}

export interface Ativacoes {
  /** `null` quando não há NADA medido — diferente de zero medido. */
  total: number | null;
  parcelas: ParcelaDeAtivacao[];
  /** Por tipo de conteúdo, para o bloco de desempenho. */
  porTipo: Array<{ tipo: TipoConteudo; rotulo: string; total: number }>;
  /** Dias do período em que a coleta não mediu stories. */
  diasSemMedicaoDeStories: number;
  /** `true` quando a leitura de publicações falhou — não é "não publicou". */
  publicacoesIndisponiveis: boolean;
}

export interface MidiaParaContagem {
  /**
   * O dia em que a mídia foi PUBLICADA — `AAAA-MM-DD`, de `publicadoEm`.
   *
   * ── O campo se chama assim por causa de um bug real ───────────────────────
   * Ele já se chamou `dia`, e `dia` é exatamente o nome da outra coluna do
   * snapshot de mídia: o dia da COLETA. Passar a errada compilava, e o efeito
   * era mudo — a coleta guarda as 25 mídias mais recentes com o carimbo de
   * hoje, então toda conta passou a exibir "25 ativações" todo santo dia.
   *
   * Um número plausível, estável e errado: ninguém reporta isso como bug, só
   * como estranheza. O nome do campo é a defesa — `publicadoEm` não aceita o
   * dia da coleta sem alguém notar o que está escrevendo.
   */
  publicadoEm: string | null;
  tipo: TipoConteudo;
}

export interface DiaDeStories {
  /** `null` = a coleta não mediu naquele dia. */
  storiesVistos: number | null;
}

/**
 * Soma tudo que a conta produziu no período.
 *
 * `publicacoesIndisponiveis` NÃO zera o total — ele muda o significado do zero.
 * "Nenhuma publicação" é afirmação sobre o cliente; "não conseguimos ler" é
 * afirmação sobre nós, e as duas nunca podem sair pela mesma frase.
 */
export function contarAtivacoes(
  midias: MidiaParaContagem[],
  dias: DiaDeStories[],
  janela: { inicio: string; fim: string },
  opcoes: { publicacoesIndisponiveis?: boolean } = {},
): Ativacoes {
  // A lista que chega é a AMOSTRA — até 25 mídias, o tamanho do lote que o
  // coletor pede numa chamada. Quantas delas são do período é outra pergunta, e
  // é o `publicadoEm` que responde. Confundir as duas é o bug que este filtro
  // existe para impedir.
  const porTipo = new Map<TipoConteudo, number>();
  for (const m of midias) {
    if (!m.publicadoEm || m.publicadoEm < janela.inicio || m.publicadoEm > janela.fim) continue;
    porTipo.set(m.tipo, (porTipo.get(m.tipo) ?? 0) + 1);
  }

  // Só o que conta como publicação: STORY tem contagem própria, vinda da série
  // diária, e somá-lo aqui contaria o mesmo story duas vezes.
  const posts = Array.from(porTipo.entries())
    .filter(([t]) => CONTA_COMO_POST.includes(t))
    .reduce((n, [, q]) => n + q, 0);

  const medidos = dias.filter((d) => d.storiesVistos != null);
  const stories = medidos.reduce((n, d) => n + (d.storiesVistos ?? 0), 0);
  const diasSemMedicaoDeStories = dias.length - medidos.length;

  const parcelas: ParcelaDeAtivacao[] = [];
  if (!opcoes.publicacoesIndisponiveis) parcelas.push({ rotulo: "Posts", total: posts });
  if (medidos.length > 0) {
    // Sempre incompleto: a coleta vê o que está NO AR, e story que nasceu e
    // expirou entre duas coletas não é visto por ninguém.
    parcelas.push({ rotulo: "Stories", total: stories, incompleto: true });
  }

  const nadaMedido = parcelas.length === 0;
  return {
    total: nadaMedido ? null : parcelas.reduce((n, p) => n + p.total, 0),
    parcelas,
    porTipo: Array.from(porTipo.entries())
      .filter(([t]) => CONTA_COMO_POST.includes(t))
      .map(([tipo, total]) => ({ tipo, rotulo: ROTULO_CONTEUDO[tipo], total }))
      .sort((a, b) => b.total - a.total),
    diasSemMedicaoDeStories,
    publicacoesIndisponiveis: !!opcoes.publicacoesIndisponiveis,
  };
}

/**
 * A frase da composição: "8 posts · 4 stories".
 *
 * Devolve `null` quando não há composição a mostrar — a tela não deve escrever
 * "0 posts · 0 stories" para uma conta que a coleta ainda não alcançou.
 */
export function textoDaComposicao(a: Ativacoes): string | null {
  if (!a.parcelas.length) return null;
  return a.parcelas.map((p) => `${p.total} ${p.rotulo.toLowerCase()}`).join(" · ");
}

// ─── A composição das ativações ──────────────────────────────────────────────

export interface ParteDaAtivacao {
  rotulo: string;
  /** `null` = não medido. Zero medido continua sendo 0. */
  total: number | null;
}

/**
 * As três caixas que a tela mostra: posts, stories e reels.
 *
 * ── Por que reels sai de dentro de "posts" ─────────────────────────────────
 * Na contagem, reel É publicação — ele está em `CONTA_COMO_POST` e entra no
 * total. Mas na leitura ele é a decisão de formato que mais muda a produção de
 * uma conta, e escondê-lo dentro de "posts" apagaria justamente o que se quer
 * acompanhar. Aqui "posts" passa a significar feed e carrossel; reels aparece
 * ao lado. As três somam o total, sem sobreposição.
 *
 * ── Zero medido aparece; não medido, não ───────────────────────────────────
 * `0 reels` é informação: a conta não publicou reel nenhum. Já stories quando a
 * coleta não mediu vira `null` e some da linha — escrever "0 stories" ali
 * afirmaria sobre o cliente o que é lacuna nossa.
 */
export function composicaoDeAtivacoes(a: Ativacoes): ParteDaAtivacao[] {
  const porTipo = new Map(a.porTipo.map((t) => [t.tipo, t.total]));
  const leuPublicacoes = !a.publicacoesIndisponiveis;
  const stories = a.parcelas.find((p) => p.rotulo === "Stories")?.total ?? null;

  return [
    {
      rotulo: "posts",
      total: leuPublicacoes ? (porTipo.get("FEED") ?? 0) + (porTipo.get("CARROSSEL") ?? 0) : null,
    },
    { rotulo: "stories", total: stories },
    { rotulo: "reels", total: leuPublicacoes ? porTipo.get("REELS") ?? 0 : null },
  ].filter((p) => p.total !== null);
}

// ─── A composição detalhada: as quatro fatias do donut ───────────────────────

export interface FatiaDeAtivacao {
  tipo: TipoConteudo;
  rotulo: string;
  total: number;
  /** Fração do total. `0` quando o total é zero — e aí não há donut a desenhar. */
  fracao: number;
  /**
   * `true` quando o número é um PISO conhecido, e não a contagem completa.
   *
   * Só stories têm isso, e a razão está no topo deste arquivo: a coleta lê o que
   * está no ar às 06:20 e às 18:20. Um story publicado às 8h e expirado às 17h
   * não é visto por ninguém.
   */
  incompleto: boolean;
}

export interface ComposicaoDetalhada {
  fatias: FatiaDeAtivacao[];
  total: number;
  /** `true` quando alguma fatia é piso — a tela precisa dizer no rodapé. */
  temPiso: boolean;
  /** `true` quando a leitura de publicações falhou: o zero não é do cliente. */
  publicacoesIndisponiveis: boolean;
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  As quatro fatias, na classificação OFICIAL de `tipoDeMidia.ts`
 * ─────────────────────────────────────────────────────────────────────────────
 *  Stories · Reels · Carrossel · Feed. Nenhuma categoria nova foi inventada aqui
 *  — `TipoConteudo` já tinha exatamente estas, e criar um segundo vocabulário
 *  para a mesma coisa faria a mesma publicação contar diferente em dois lugares
 *  da mesma página.
 *
 *  ── Duas fontes numa rosca só, e isso precisa ser dito ─────────────────────
 *  Feed, carrossel e reels vêm da LISTA DE MÍDIAS, por `publicadoEm`. Stories
 *  vêm da CONTAGEM DIÁRIA, porque story expirado já não está na lista — contá-lo
 *  pela lista devolveria quase sempre zero. São dois denominadores diferentes
 *  desenhados como se fossem um, e `incompleto` é o que impede a rosca de
 *  afirmar mais do que mediu.
 *
 *  ── Anúncio e não-identificado ficam de fora ───────────────────────────────
 *  Pela mesma regra que já vale no resto da Social: `CONTA_COMO_POST` não os
 *  inclui. Anúncio somado a "o que publicamos" faria a produção orgânica subir
 *  por causa de verba, que é a mistura que esta frente inteira evita.
 *
 *  ── Zero medido aparece; não medido, não ───────────────────────────────────
 *  Uma conta que não publicou reel nenhum mostra "Reels · 0" — é informação. Já
 *  stories que a coleta não mediu somem da lista, porque um "0 stories" ali
 *  afirmaria sobre o cliente o que é lacuna nossa.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function composicaoDetalhada(a: Ativacoes): ComposicaoDetalhada {
  const porTipo = new Map(a.porTipo.map((t) => [t.tipo, t.total]));
  const stories = a.parcelas.find((p) => p.rotulo === "Stories");
  const leuPublicacoes = !a.publicacoesIndisponiveis;

  const fatias: FatiaDeAtivacao[] = [];
  if (stories) {
    fatias.push({
      tipo: "STORY", rotulo: ROTULO_CONTEUDO.STORY, total: stories.total,
      fracao: 0, incompleto: true,
    });
  }
  if (leuPublicacoes) {
    // A ordem é fixa e não segue a quantidade: uma rosca que reordena as fatias
    // a cada troca de período obriga a reler a legenda toda vez.
    for (const tipo of ["REELS", "CARROSSEL", "FEED"] as const) {
      fatias.push({
        tipo, rotulo: ROTULO_CONTEUDO[tipo], total: porTipo.get(tipo) ?? 0,
        fracao: 0, incompleto: false,
      });
    }
  }

  const total = fatias.reduce((n, f) => n + f.total, 0);
  return {
    fatias: fatias.map((f) => ({ ...f, fracao: total > 0 ? f.total / total : 0 })),
    total,
    temPiso: fatias.some((f) => f.incompleto && f.total > 0),
    publicacoesIndisponiveis: a.publicacoesIndisponiveis,
  };
}
