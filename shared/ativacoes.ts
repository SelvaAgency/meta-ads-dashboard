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
